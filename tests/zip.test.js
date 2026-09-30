import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ZipWriter, crc32 } from '../public/js/lib/zip.js';

test('crc32 matches the reference value', () => {
  assert.strictEqual(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('ZipWriter produces a valid archive (unzip -t, UTF-8 names)', async (t) => {
  const zip = new ZipWriter();
  const a = new Uint8Array(200000).map((_, i) => i % 251);
  zip.add('IMG_0001_geo.jpg', a);
  zip.add('杭州/西湖 001.jpg', new TextEncoder().encode('hello'));
  assert.strictEqual(zip.count, 2);
  const buf = Buffer.from(await zip.toBlob().arrayBuffer());
  // 结束记录：签名 + 条目数
  assert.strictEqual(buf.readUInt32LE(buf.length - 22), 0x06054b50);
  assert.strictEqual(buf.readUInt16LE(buf.length - 22 + 10), 2);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-'));
  const file = path.join(dir, 't.zip');
  fs.writeFileSync(file, buf);
  try {
    execFileSync('unzip', ['-t', file], { stdio: 'pipe' });
  } catch (e) {
    if (e.code === 'ENOENT') return t.skip('unzip not installed');
    throw new Error(`unzip -t failed: ${e.stdout}${e.stderr}`);
  }
  // Python 的 zipfile 会按 UTF-8 标志位解码文件名，不依赖 unzip 的语言环境
  const script = 'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);print("\\n".join(z.namelist()));assert z.testzip() is None';
  try {
    const names = execFileSync('python3', ['-c', script, file], { encoding: 'utf8' }).trim().split('\n');
    assert.deepStrictEqual(names, ['IMG_0001_geo.jpg', '杭州/西湖 001.jpg']);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
});
