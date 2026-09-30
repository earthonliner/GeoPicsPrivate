import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { getConfig } from './config.js';

const SAFE_SEGMENT = /[\\/:*?"<>|\u0000-\u001f]/g;

export function safeSegment(name, fallback) {
  const s = String(name || '').replace(SAFE_SEGMENT, '_').replace(/^\.+/, '').trim().slice(0, 120);
  return s || fallback;
}

async function uniquePath(file) {
  const dir = path.dirname(file);
  const ext = path.extname(file);
  const base = path.basename(file, ext);
  let candidate = file;
  for (let i = 2; i < 10000; i += 1) {
    try {
      await fs.promises.access(candidate);
      candidate = path.join(dir, `${base}-${i}${ext}`);
    } catch (e) {
      return candidate;
    }
  }
  return candidate;
}

/**
 * 把导出的海报写入 outputDir/folder/name（不覆盖已有文件，自动加序号）。
 */
export async function saveExport({ folder, name, body }) {
  const dir = path.join(getConfig().outputDir, safeSegment(folder, 'export'));
  await fs.promises.mkdir(dir, { recursive: true });
  const target = await uniquePath(path.join(dir, safeSegment(name, 'poster.jpg')));
  await fs.promises.writeFile(target, body);
  return { path: target, dir };
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 60000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

/**
 * HEIC / HEIF 等浏览器无法解码的格式：用 macOS 自带的 sips 转成 JPEG（保留 EXIF，限制长边）。
 */
export async function convertToJpeg(body, maxSide = 2560) {
  if (process.platform !== 'darwin') {
    const err = new Error('HEIC conversion requires macOS (sips)');
    err.status = 501;
    throw err;
  }
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'geophoto-'));
  const input = path.join(dir, 'in.img');
  const output = path.join(dir, 'out.jpg');
  try {
    await fs.promises.writeFile(input, body);
    await run('/usr/bin/sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '92', '-Z', String(maxSide), input, '--out', output]);
    return await fs.promises.readFile(output);
  } finally {
    fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function reveal(target) {
  const root = getConfig().outputDir;
  const resolved = path.resolve(target || root);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    const err = new Error('path outside output directory');
    err.status = 400;
    throw err;
  }
  await fs.promises.mkdir(resolved, { recursive: true });
  if (process.platform === 'darwin') await run('open', [resolved]);
  else if (process.platform === 'linux') await run('xdg-open', [resolved]);
  else if (process.platform === 'win32') await run('explorer', [resolved]).catch(() => {});
  return resolved;
}
