/**
 * tiles.js
 *
 * 把本地服务代理的栅格瓦片拼成一张 3:4 的灰阶底图（取代 Mapbox Static Images API），
 * 并在目标坐标处绘制定位针。主线程与 Worker 均可使用（依赖 OffscreenCanvas / createImageBitmap / fetch）。
 */

import { tilePlan } from './geo.js';
import { tileInfo } from './providers.js';

export const MAP_PIXEL_SCALE = 2;

const tileCache = new Map();
const TILE_CACHE_MAX = 64;

function rememberTile(key, promise) {
  tileCache.set(key, promise);
  if (tileCache.size > TILE_CACHE_MAX) tileCache.delete(tileCache.keys().next().value);
}

async function fetchTileBitmap(base, provider, style, z, x, y) {
  const key = `${provider}/${style}/${z}/${x}/${y}`;
  if (tileCache.has(key)) return tileCache.get(key);
  const job = (async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await fetch(`${base}/api/tile/${style}/${z}/${x}/${y}`);
        if (res.ok) return await createImageBitmap(await res.blob());
      } catch (e) {
        // 重试一次后放弃，缺失的瓦片用底色填充
      }
    }
    return null;
  })();
  rememberTile(key, job);
  const bitmap = await job;
  if (!bitmap) tileCache.delete(key);
  return bitmap;
}

// 彩色瓦片 -> 灰阶底图：浅色提亮、深色反相压暗，使后续的主题色叠加与 Mapbox 灰阶底图效果一致
function grayscale(ctx, w, h, dark) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = dark ? (255 - g) * 0.85 : 255 - (255 - g) * 0.55;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
}

// 定位针：黑色水滴 + 白色圆点，尖端对准目标坐标
export function drawMapPin(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 3 * s;
  ctx.shadowOffsetY = 1 * s;
  ctx.fillStyle = '#111111';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-3, -6, -7, -9, -7, -14);
  ctx.arc(0, -14, 7, Math.PI, 0, false);
  ctx.bezierCurveTo(7, -9, 3, -6, 0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, -14, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * @param {object} opts { lat, lon, zoom, width, height, pin, dark, base, tiles }
 *   width / height 为逻辑像素，输出 canvas 为 (width * 2) x (height * 2)；
 *   tiles 为 providers.tileInfo() 的结果
 * @returns {Promise<OffscreenCanvas|null>} 所有瓦片都失败时返回 null（调用方回退到本地底图）
 */
export async function buildMapCanvas(opts) {
  const { lat, lon, zoom, width, height, pin, dark = false, base = '' } = opts;
  const info = opts.tiles || tileInfo({});
  const plan = tilePlan({ lat, lon, zoom, width, height, pin, tileScale: info.scale, maxZoom: info.maxZoom });
  const style = dark ? info.darkStyle : 'light';
  const s = MAP_PIXEL_SCALE;

  const bitmaps = await Promise.all(plan.tiles.map((t) => fetchTileBitmap(base, info.id, style, t.z, t.x, t.y)));
  if (!bitmaps.some(Boolean)) return null;

  const canvas = new OffscreenCanvas(Math.round(width * s), Math.round(height * s));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = dark ? '#1c1d1f' : '#ecebe7';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  const size = Math.ceil(plan.tileLogical * s);
  plan.tiles.forEach((t, i) => {
    const bmp = bitmaps[i];
    if (!bmp) return;
    ctx.drawImage(bmp, Math.round(t.dx * s), Math.round(t.dy * s), size, size);
  });
  if (info.gray) grayscale(ctx, canvas.width, canvas.height, dark);
  drawMapPin(ctx, plan.pin.x * s, plan.pin.y * s, s);
  return canvas;
}
