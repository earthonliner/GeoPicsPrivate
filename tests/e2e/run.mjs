/**
 * 端到端冒烟测试：启动本地服务 + 无头 Chrome，导入示例照片，遍历全部模板截图，
 * 并通过 Worker 线程池批量导出，校验输出文件。
 *
 * 需要：Chrome / Chromium（CHROME_PATH 可指定）、Pillow（生成示例照片）。
 * 用法：npm run test:e2e
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = path.join(root, 'tests', 'e2e', 'out');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gpg-e2e-'));
process.env.GEOPHOTOGRAPH_HOME = home;

const { listen } = await import('../../server/index.js');
const { updateConfig } = await import('../../server/config.js');
updateConfig({ outputDir: path.join(home, 'out') });
const { server, port } = await listen({ port: 0 });
const base = `http://localhost:${port}`;

const CHROME = [process.env.CHROME_PATH, '/usr/bin/google-chrome-stable', '/usr/local/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  .filter(Boolean)
  .find((p) => fs.existsSync(p));
if (!CHROME) throw new Error('找不到 Chrome，请设置 CHROME_PATH');

const COUNT = Number(process.env.E2E_COUNT || 24);
const photos = path.join(home, 'photos');
execFileSync('python3', [path.join(root, 'scripts', 'make-sample-photos.py'), photos, String(COUNT)], { stdio: 'inherit' });
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--window-size=1500,950'], defaultViewport: { width: 1500, height: 950 } });
let failed = false;
const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failed = true;
};

try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => { console.log('pageerror', e.message); failed = true; });
  page.on('console', (m) => { if (m.type() === 'error') console.log('console.error', m.text()); });
  await page.goto(base, { waitUntil: 'networkidle0' });

  const files = fs.readdirSync(photos).map((f) => path.join(photos, f));
  const input = await page.$('#file-input');
  await input.uploadFile(...files);
  await page.waitForFunction((n) => window.__app.items.length === n, { timeout: 30000 }, COUNT);
  check(true, `导入 ${COUNT} 张`);

  // 带 EXIF 方向 6 的横幅照片在缩略图里应当是竖幅（方向已自动应用）
  await page.waitForFunction(() => { const it = window.__app.items.find((i) => /-013\./.test(i.name)); return it && (it.thumbState === 'ready' || it.thumbState === 'error'); }, { timeout: 30000 });
  const rotated = await page.evaluate(() => window.__app.items.filter((i) => /-013\./.test(i.name)).map((i) => i.aspect));
  check(rotated.length === 1 && rotated[0] < 1, `EXIF 方向已应用（缩略图宽高比 ${rotated[0] && rotated[0].toFixed(2)}）`);

  const noLoc = await page.evaluate(() => window.__app.items.filter((i) => i.lat === null).length);
  check(noLoc > 0 && noLoc < COUNT, `无位置照片 ${noLoc} 张被识别`);

  await page.waitForFunction(() => !window.__app.resolver.busy, { timeout: 120000 });
  const places = await page.evaluate(() => [...new Set(window.__app.items.map((i) => i.place))]);
  console.log('places:', places.join(' | '));
  check(places.some((p) => /TOKYO|SHIBUYA/.test(p)), '地名解析（东京）');

  // 遍历全部模板并截图预览
  const templates = await page.evaluate(async () => (await import('/js/lib/posters.js')).TEMPLATES.map((t) => t.id));
  check(templates.length === 31, `模板数量 ${templates.length}`);
  for (const id of templates) {
    await page.evaluate((tid) => {
      const a = window.__app;
      a.items.forEach((it) => { it.templateId = tid; });
      a.settings.templateId = tid;
      a.current = a.items.find((i) => i.lat !== null);
      a.preview.schedule(0);
    }, id);
    await new Promise((r) => setTimeout(r, 400));
    await page.waitForFunction(() => document.querySelector('#preview-msg').hidden, { timeout: 20000 });
    await new Promise((r) => setTimeout(r, 150));
    const el = await page.$('#preview');
    await el.screenshot({ path: path.join(outDir, `tpl-${id}.png`) });
  }
  check(fs.readdirSync(outDir).length >= templates.length, '全部模板预览已截图');

  await page.evaluate(() => { window.__app.current = window.__app.items[0]; window.__app.preview.schedule(0); });
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: path.join(outDir, 'app.png') });

  // 随机模板 + 批量导出（Worker 线程池）
  await page.evaluate(() => {
    const a = window.__app;
    a.settings.batchMode = 'random';
  });
  await page.click('#mode-seg [data-mode="random"]');
  await page.click('#btn-export');
  await page.select('#ex-scope', 'all');
  await page.click('#btn-export-go');
  await page.waitForFunction(() => !document.querySelector('#btn-pg-close').hidden, { timeout: 180000 });
  const summary = await page.$eval('#pg-line', (e) => e.textContent);
  console.log('export:', summary, '|', await page.$eval('#pg-sub', (e) => e.textContent));
  const exported = path.join(home, 'out');
  const dirs = fs.readdirSync(exported);
  const jpgs = dirs.length ? fs.readdirSync(path.join(exported, dirs[0])).filter((f) => f.endsWith('.jpg')) : [];
  check(jpgs.length === COUNT, `导出 ${jpgs.length}/${COUNT} 张 JPEG`);
  if (jpgs.length) {
    const sample = fs.readFileSync(path.join(exported, dirs[0], jpgs[0]));
    check(sample[0] === 0xff && sample[1] === 0xd8, '输出是有效的 JPEG');
    fs.copyFileSync(path.join(exported, dirs[0], jpgs[0]), path.join(outDir, 'export-sample.jpg'));
  }
  await page.screenshot({ path: path.join(outDir, 'export-done.png') });
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
