/**
 * 端到端测试：启动本地服务 + 无头 Chrome，覆盖示例照片、模板栏、导入、筛选 / 搜索、地点汇总、批量定位、
 * 大图预览、移除撤销、深色外观、随机模板批量导出，以及重新导入时恢复修改。
 *
 * 需要：Chrome / Chromium（CHROME_PATH 可指定）、Pillow（生成示例照片）。
 * 用法：npm run test:e2e（E2E_COUNT 控制照片数量，默认 24）
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = path.join(root, 'tests', 'e2e', 'out');
const out = (name) => path.join(outDir, name);
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
const files = fs.readdirSync(photos).sort().map((f) => path.join(photos, f));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--window-size=1500,950'],
  defaultViewport: { width: 1500, height: 950 }
});
let failed = false;
const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failed = true;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const app = (page, fn, ...args) => page.evaluate(fn, ...args);

async function importAll(page) {
  const input = await page.$('#file-input');
  await input.uploadFile(...files);
  await page.waitForFunction((n) => window.__app.items.length === n && !window.__app.busy, { timeout: 30000 }, COUNT);
}

const settle = (page) => page.waitForFunction(() => !window.__app.resolver.busy && document.querySelector('#preview-msg').hidden, { timeout: 120000 });

try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => {
    console.log('pageerror', e.message);
    failed = true;
  });
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('console.error', m.text());
  });
  await page.goto(base, { waitUntil: 'networkidle0' });

  /* ---------------- 空状态：示例照片 + 模板栏 ---------------- */
  await page.waitForFunction(() => window.__app.current && window.__app.current.isSample, { timeout: 15000 });
  const empty = await app(page, () => ({
    badge: !document.querySelector('#sample-badge').hidden,
    tabs: document.querySelectorAll('#cat-tabs .tab').length,
    exportDisabled: document.querySelector('#btn-export').disabled
  }));
  check(empty.badge, '空状态用示例照片预览');
  check(empty.tabs >= 8, `模板分类 ${empty.tabs} 个`);
  check(empty.exportDisabled, '没有照片时导出按钮不可用');
  await page.click('#cat-tabs .tab[data-id="all"]');
  const allCount = await page.$$eval('#tpl-strip .tpl', (l) => l.length);
  check(allCount === 31, `「全部」分类 ${allCount} 个模板`);
  await sleep(2500);
  await page.screenshot({ path: out('01-empty.png') });

  /* ---------------- 导入 ---------------- */
  await importAll(page);
  check(true, `导入 ${COUNT} 张`);
  check(await app(page, () => !window.__app.current.isSample), '导入后示例照片被替换');

  // 带 EXIF 方向 6 的横幅照片在缩略图里应当是竖幅（方向已自动应用）；缩略图懒加载，先滚动到它
  await app(page, () => window.__app.library.reveal(window.__app.items.find((i) => /-013\./.test(i.name))));
  await page.waitForFunction(() => {
    const it = window.__app.items.find((i) => /-013\./.test(i.name));
    return it && (it.thumbState === 'ready' || it.thumbState === 'error');
  }, { timeout: 30000 });
  const rotated = await app(page, () => window.__app.items.filter((i) => /-013\./.test(i.name)).map((i) => i.aspect));
  check(rotated.length === 1 && rotated[0] < 1, `EXIF 方向已应用（缩略图宽高比 ${rotated[0] && rotated[0].toFixed(2)}）`);

  const noLoc = await app(page, () => window.__app.items.filter((i) => i.lat === null).length);
  check(noLoc > 0 && noLoc < COUNT, `无位置照片 ${noLoc} 张被识别`);
  await page.click('#lib-filters [data-filter="noloc"]');
  check((await app(page, () => window.__app.library.view.length)) === noLoc, '「无位置」筛选');
  await page.click('#lib-filters [data-filter="all"]');

  await settle(page);
  const places = await app(page, () => [...new Set(window.__app.items.map((i) => i.place))]);
  console.log('places:', places.join(' | '));
  check(places.some((p) => /TOKYO|SHIBUYA/.test(p)), '地名解析（东京）');

  /* ---------------- 搜索 / 键盘 ---------------- */
  await page.type('#lib-search', 'tokyo');
  await sleep(400);
  const found = await app(page, () => window.__app.library.view.length);
  check(found > 0 && found < COUNT, `搜索「tokyo」匹配 ${found} 张`);
  await page.focus('#lib-search');
  await page.keyboard.press('Escape');
  await sleep(200);
  check((await app(page, () => window.__app.library.view.length)) === COUNT, 'Esc 清空搜索恢复全部');

  await app(page, () => document.activeElement && document.activeElement.blur());
  const firstId = await app(page, () => window.__app.current.id);
  await page.keyboard.press('ArrowRight');
  check((await app(page, () => window.__app.current.id)) !== firstId, '方向键切换照片');
  await page.keyboard.press(']');
  const stepped = await app(page, () => window.__app.current.templateId);
  check(stepped && (await app(page, (id) => window.__app.items.every((i) => i.templateId === id), stepped)), '] 切换到下一个模板（统一模板应用到全部）');

  await page.click('#tpl-strip .tpl[data-id="boarding"]');
  check(await app(page, () => window.__app.items.every((i) => i.templateId === 'boarding')), '点选模板应用到全部照片');

  /* ---------------- 全部模板截图 ---------------- */
  const templates = await app(page, async () => (await import('/js/lib/posters.js')).TEMPLATES.map((t) => t.id));
  check(templates.length === 31, `模板数量 ${templates.length}`);
  for (const id of templates) {
    await app(page, (tid) => {
      const a = window.__app;
      a.items.forEach((it) => { it.templateId = tid; });
      a.settings.templateId = tid;
      a.current = a.items.find((i) => i.lat !== null);
      a.preview.schedule(0);
    }, id);
    await sleep(350);
    await page.waitForFunction(() => document.querySelector('#preview-msg').hidden, { timeout: 20000 });
    await sleep(120);
    await (await page.$('#preview')).screenshot({ path: out(`tpl-${id}.png`) });
  }
  check(templates.every((id) => fs.existsSync(out(`tpl-${id}.png`))), '全部模板预览已截图');

  await page.click('#tpl-strip .tpl[data-id="polaroid"]');
  await page.click('#grid .card:nth-child(2)');
  await sleep(2000);
  await page.screenshot({ path: out('02-library.png') });

  /* ---------------- 地点汇总：批量改名 ---------------- */
  await page.click('#btn-places');
  await page.waitForSelector('#dlg-places[open]');
  const rows = await page.$$eval('#places-list .place-row', (l) => l.length);
  check(rows > 0, `地点汇总 ${rows} 个地名`);
  const oldName = await page.$eval('#places-list .place-row input', (e) => e.value);
  const sameCount = await app(page, (p) => window.__app.items.filter((i) => i.place === p).length, oldName);
  await (await page.$('#dlg-places')).screenshot({ path: out('03-places.png') });
  await page.$eval('#places-list .place-row input', (e) => {
    e.value = 'SHIBUYA CROSSING';
    e.dispatchEvent(new Event('change'));
  });
  const renamed = await app(page, () => window.__app.items.filter((i) => i.place === 'SHIBUYA CROSSING' && i.placeManual).length);
  check(renamed === sameCount, `批量改名 ${oldName} → SHIBUYA CROSSING（${renamed} 张）`);
  await page.keyboard.press('Escape');

  /* ---------------- 批量定位：无位置照片 ---------------- */
  await page.click('#lib-filters [data-filter="noloc"]');
  await page.click('#grid .card');
  const target = await app(page, () => window.__app.current.id);
  await app(page, () => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('l');
  await page.waitForSelector('#dlg-locate[open]');
  await page.click('#coord-input');
  await page.keyboard.type('35.6595, 139.7005');
  await page.keyboard.press('Enter');
  await page.waitForFunction((id) => {
    const it = window.__app.items.find((i) => i.id === id);
    return it && it.lat !== null && it.placeStatus !== 'loading';
  }, { timeout: 60000 }, target);
  const located = await app(page, (id) => {
    const a = window.__app;
    const it = a.items.find((i) => i.id === id);
    return { lat: it.lat, place: it.place, view: a.library.view.length, next: a.current.id !== id && a.current.lat === null };
  }, target);
  check(Math.abs(located.lat - 35.6595) < 1e-6, `手动定位（地名 ${located.place}）`);
  check(located.view === noLoc - 1 && (noLoc === 1 || located.next), '定位后自动切到下一张无位置照片');
  await page.click('#lib-filters [data-filter="all"]');

  /* ---------------- 大图预览 ---------------- */
  await app(page, () => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('Enter');
  await page.waitForSelector('#lb-img.ready', { timeout: 60000 });
  const lb = await page.$eval('#lb-img', (img) => ({ w: img.naturalWidth, h: img.naturalHeight }));
  check(lb.w === 1200, `大图预览按导出尺寸渲染（${lb.w} × ${lb.h}）`);
  const fits = await page.$eval('#lb-img', (img) => img.getBoundingClientRect().bottom <= window.innerHeight);
  check(fits, '大图完整显示在窗口内');
  await sleep(400);
  await page.screenshot({ path: out('04-lightbox.png') });
  await page.keyboard.press('Escape');
  check(await page.$eval('#lightbox', (e) => e.hidden), 'Esc 关闭大图');

  /* ---------------- 移除与撤销 ---------------- */
  await page.keyboard.press('Backspace');
  check((await app(page, () => window.__app.items.length)) === COUNT - 1, '⌫ 移除当前照片');
  await page.click('#toast-action');
  check((await app(page, () => window.__app.items.length)) === COUNT, '撤销移除');

  /* ---------------- 深色外观 ---------------- */
  await page.click('#btn-theme');
  await page.click('#btn-theme');
  check((await app(page, () => document.documentElement.dataset.theme)) === 'dark', '切换到深色外观');
  await app(page, () => {
    const a = window.__app;
    a.settings.inspectorTab = 'style';
    document.querySelector('#insp-tabs [data-tab="style"]').click();
  });
  await sleep(1500);
  await page.screenshot({ path: out('05-dark.png') });
  await page.click('#btn-theme');
  await page.click('#insp-tabs [data-tab="photo"]');

  /* ---------------- 随机模板 + 批量导出 ---------------- */
  await page.click('#mode-seg [data-mode="random"]');
  const uses = await page.$$eval('#tpl-strip .uses:not([hidden])', (l) => l.length);
  check(uses > 1, `随机模板：${uses} 个模板被分配`);
  await page.click('#btn-export');
  await page.waitForSelector('#dlg-export[open]');
  await page.click('#ex-scope [data-value="all"]');
  const preview = await page.$eval('#ex-name-preview', (e) => e.textContent);
  check(/_geo\.jpg$/.test(preview), `文件名预览 ${preview}`);
  await (await page.$('#dlg-export')).screenshot({ path: out('06-export.png') });
  await page.click('#btn-export-go');
  await page.waitForFunction(() => !document.querySelector('#btn-pg-close').hidden, { timeout: 180000 });
  console.log('export:', await page.$eval('#pg-line', (e) => e.textContent), '|', await page.$eval('#pg-sub', (e) => e.textContent));
  const exported = path.join(home, 'out');
  const dirs = fs.readdirSync(exported);
  const jpgs = dirs.length ? fs.readdirSync(path.join(exported, dirs[0])).filter((f) => f.endsWith('.jpg')) : [];
  check(jpgs.length === COUNT, `导出 ${jpgs.length}/${COUNT} 张 JPEG`);
  if (jpgs.length) {
    const sample = fs.readFileSync(path.join(exported, dirs[0], jpgs[0]));
    check(sample[0] === 0xff && sample[1] === 0xd8, '输出是有效的 JPEG');
    fs.copyFileSync(path.join(exported, dirs[0], jpgs[0]), out('export-sample.jpg'));
  }
  await page.screenshot({ path: out('07-export-done.png') });
  await page.click('#btn-pg-close');

  /* ---------------- 重新导入：恢复修改 ---------------- */
  await sleep(800);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__app.current && window.__app.current.isSample, { timeout: 15000 });
  await importAll(page);
  const restored = await app(page, (id) => {
    const a = window.__app;
    return {
      renamed: a.items.filter((i) => i.place === 'SHIBUYA CROSSING' && i.placeManual).length,
      located: a.items.filter((i) => i.locManual && Math.abs(i.lat - 35.6595) < 1e-6).length
    };
  });
  check(restored.renamed === sameCount, `重新导入恢复地名修改（${restored.renamed} 张）`);
  check(restored.located === 1, '重新导入恢复手动定位');
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
