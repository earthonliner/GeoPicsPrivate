import fs from 'node:fs';
import path from 'node:path';
import { CACHE_DIR, getConfig } from './config.js';

const USER_AGENT = 'GeoPhotoGraph-local/1.0 (personal offline poster tool)';
const MAX_UPSTREAM = 8;
const MAX_Z = 20;

let active = 0;
const waiting = [];
const inflight = new Map();

function acquire() {
  if (active < MAX_UPSTREAM) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve));
}

function release() {
  const next = waiting.shift();
  if (next) next();
  else active -= 1;
}

export function tileUrl(style, z, x, y) {
  const c = getConfig();
  const dark = style === 'dark';
  switch (c.mapProvider) {
    case 'mapbox': {
      if (!c.mapboxToken) return null;
      const id = dark ? 'dark-v11' : 'light-v11';
      return `https://api.mapbox.com/styles/v1/mapbox/${id}/tiles/256/${z}/${x}/${y}@2x?access_token=${encodeURIComponent(c.mapboxToken)}`;
    }
    case 'custom': {
      const tpl = dark ? c.tileUrlDark || c.tileUrlLight : c.tileUrlLight;
      if (!tpl) return null;
      return tpl
        .replace('{z}', z)
        .replace('{x}', x)
        .replace('{y}', y)
        .replace('{s}', 'abc'[(x + y) % 3]);
    }
    case 'osm':
      return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
    default:
      return `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${dark ? 'Dark' : 'Light'}_Gray_Base/MapServer/tile/${z}/${y}/${x}`;
  }
}

function cacheKey(style) {
  const c = getConfig();
  const tag =
    c.mapProvider === 'custom'
      ? `custom-${Buffer.from(c.tileUrlLight + c.tileUrlDark).toString('base64url').slice(0, 16)}`
      : c.mapProvider;
  return path.join(CACHE_DIR, 'tiles', tag, style);
}

async function download(url) {
  await acquire();
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(15000)
        });
        if (res.ok) {
          return { body: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') || 'image/png' };
        }
        if (res.status < 500 && res.status !== 429) return null;
      } catch (e) {
        // 网络抖动：退避后重试
      }
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
    return null;
  } finally {
    release();
  }
}

/**
 * 读取瓦片（磁盘缓存优先）。返回 { body, type } 或 null。
 */
export async function getTile(style, z, x, y) {
  if (!['light', 'dark'].includes(style)) return null;
  const n = 2 ** z;
  if (!Number.isInteger(z) || z < 0 || z > MAX_Z || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= n || y >= n) {
    return null;
  }
  const file = path.join(cacheKey(style), String(z), `${x}_${y}.tile`);
  try {
    const body = await fs.promises.readFile(file);
    return { body, type: body[0] === 0xff ? 'image/jpeg' : 'image/png' };
  } catch (e) {
    // 未缓存
  }
  const url = tileUrl(style, z, x, y);
  if (!url) return null;
  if (inflight.has(file)) return inflight.get(file);
  const job = (async () => {
    const res = await download(url);
    if (!res) return null;
    try {
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      await fs.promises.writeFile(file, res.body);
    } catch (e) {
      // 缓存写入失败不影响本次结果
    }
    return res;
  })();
  inflight.set(file, job);
  try {
    return await job;
  } finally {
    inflight.delete(file);
  }
}
