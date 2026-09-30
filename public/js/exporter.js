/**
 * exporter.js：批量导出流水线。
 *
 * 多个 Worker 并行「解码 -> 拼图 -> 绘制 -> 编码」，主线程只负责调度与落盘：
 *   folder：POST 到本地服务，直接写入输出目录（适合上千张，浏览器不占内存）
 *   zip   ：按体积分卷打包下载
 *   fsa   ：File System Access API，浏览器直接写入用户选择的文件夹（Chromium）
 */
import { renderNamePattern, baseName, createNamer, formatDateForFile } from './lib/filename.js';
import { ZipWriter } from './lib/zip.js';
import { buildStyle, buildInfo, buildMapSpec } from './params.js';
import { withSource } from './source.js';
import * as api from './api.js';

const ZIP_PART_BYTES = 400 * 1024 * 1024;
const ZIP_PART_FILES = 500;

const pad = (n) => String(n).padStart(2, '0');
export const stamp = (d = new Date()) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function createSink(opts, folderName) {
  if (opts.mode === 'zip') {
    let zip = new ZipWriter();
    let part = 0;
    const flush = () => {
      if (!zip.count) return;
      part += 1;
      download(zip.toBlob(), `${folderName}-${pad(part)}.zip`);
      zip = new ZipWriter();
    };
    return {
      async write(name, blob) {
        zip.add(name, new Uint8Array(await blob.arrayBuffer()));
        if (zip.size >= ZIP_PART_BYTES || zip.count >= ZIP_PART_FILES) flush();
      },
      async finish() {
        flush();
        return { where: `${part} 个 ZIP 文件（在浏览器下载目录）` };
      }
    };
  }
  if (opts.mode === 'fsa') {
    const sub = await opts.dirHandle.getDirectoryHandle(folderName, { create: true });
    return {
      async write(name, blob) {
        const fh = await sub.getFileHandle(name, { create: true });
        const w = await fh.createWritable();
        await w.write(blob);
        await w.close();
      },
      async finish() {
        return { where: `所选文件夹 / ${folderName}` };
      }
    };
  }
  let dir = '';
  return {
    async write(name, blob) {
      const res = await api.saveToFolder(folderName, name, blob);
      dir = res.dir;
    },
    async finish() {
      return { where: dir, dir };
    }
  };
}

const logoBlob = async (settings) => (settings.logoDataUrl ? (await fetch(settings.logoDataUrl)).blob() : null);

function renderPayload(app, item, blob, opts, logo) {
  const settings = app.settings;
  const style = buildStyle(settings, item);
  return {
    blob,
    tplId: item.templateId,
    info: buildInfo(item, settings),
    style,
    map: buildMapSpec(settings, item, style, app.tileInfo()),
    base: location.origin,
    scale: opts.scale,
    format: opts.format,
    quality: opts.quality,
    maxSide: opts.maxSide,
    logo
  };
}

/**
 * 按导出参数渲染单张海报（大图预览 / 复制到剪贴板），与批量导出走同一条 Worker 流水线。
 * @returns {Promise<{blob: Blob, width: number, height: number, mapOk: boolean}>}
 */
export async function renderOne(app, item, opts) {
  const logo = await logoBlob(app.settings);
  return withSource(item, opts.maxSide, (blob) => app.pool.run('render', renderPayload(app, item, blob, opts, logo), { priority: 0 }));
}

/**
 * @param app
 * @param {object} opts { items, mode, dirHandle, scale, format, quality, pattern, maxSide, onProgress, isCancelled }
 * @returns {Promise<{ok:number, failed:Array<{item,error}>, where:string, dir?:string, fallbackMaps:number, cancelled:boolean}>}
 */
export async function runExport(app, opts) {
  const { items } = opts;
  const folderName = `GeoPhotoGraph-${stamp()}`;
  const sink = await createSink(opts, folderName);
  const namer = createNamer();
  const ext = opts.format === 'png' ? 'png' : 'jpg';
  const logo = await logoBlob(app.settings);

  const total = items.length;
  const failed = [];
  let ok = 0;
  let fallbackMaps = 0;
  let next = 0;
  const startedAt = performance.now();
  const report = () =>
    opts.onProgress({
      done: ok + failed.length,
      total,
      failed: failed.length,
      elapsed: (performance.now() - startedAt) / 1000
    });

  const processOne = async (item, index) => {
    let result;
    try {
      result = await withSource(item, opts.maxSide, (blob) => app.pool.run('render', renderPayload(app, item, blob, opts, logo), { priority: 1 }));
      if (!result.mapOk) fallbackMaps += 1;
      const name = namer(
        renderNamePattern(opts.pattern, {
          name: baseName(item.name),
          place: item.place,
          date: formatDateForFile(item.dateValue),
          template: item.templateId,
          index: String(index + 1).padStart(String(total).length, '0')
        }),
        ext
      );
      await sink.write(name, result.blob);
      item.exportState = 'done';
      ok += 1;
    } catch (err) {
      if (err.code === 'CANCELLED') return;
      item.exportState = 'error';
      failed.push({ item, error: err.message || String(err) });
    }
    app.ui.onItemChanged(item, { redraw: false });
    report();
  };

  const lane = async () => {
    while (!opts.isCancelled() && next < total) {
      const index = next;
      next += 1;
      await processOne(items[index], index);
    }
  };

  report();
  await Promise.all(Array.from({ length: app.pool.size + 1 }, lane));
  const cancelled = opts.isCancelled();
  if (cancelled) app.pool.cancelPending(1);
  const done = await sink.finish();
  return { ok, failed, cancelled, fallbackMaps, ...done };
}
