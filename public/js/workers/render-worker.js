/**
 * render-worker.js
 *
 * 批量导出 / 缩略图的后台线程：解码照片 -> 拼接地图 -> 绘制海报 -> 编码图片，
 * 全程不占用主线程，可以同时开多个 Worker 并行处理。
 */
import { paintPoster, POSTER_W, posterHeight } from '../lib/posters.js';
import { decodePhoto, makeThumbnail } from '../lib/photo.js';
import { buildMapCanvas } from '../lib/tiles.js';

async function renderPoster(t) {
  const mapPromise = t.map
    ? buildMapCanvas({ ...t.map, base: t.base }).catch(() => null)
    : Promise.resolve(null);
  const logoPromise = t.logo ? createImageBitmap(t.logo).catch(() => null) : Promise.resolve(null);

  const photo = await decodePhoto(t.blob, t.maxSide);
  const [map, qr] = await Promise.all([mapPromise, logoPromise]);

  const width = Math.round(POSTER_W * t.scale);
  const height = Math.round(posterHeight(t.style.footer) * t.scale);
  const canvas = new OffscreenCanvas(width, height);
  paintPoster(canvas, t.tplId, { photo, map, qr }, t.info, t.style);

  const mime = t.format === 'png' ? 'image/png' : 'image/jpeg';
  const blob = await canvas.convertToBlob(t.format === 'png' ? { type: mime } : { type: mime, quality: t.quality });
  if (typeof photo.close === 'function') photo.close();
  if (qr) qr.close();
  return { blob, width, height, mapOk: !t.map || !!map };
}

self.onmessage = async (event) => {
  const { id, type, payload } = event.data;
  try {
    const result = type === 'thumb' ? await makeThumbnail(payload.blob, payload.size) : await renderPoster(payload);
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err), code: err && err.code });
  }
};
