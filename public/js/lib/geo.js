/**
 * geo.js
 *
 * 纯计算的地理工具：Web Mercator 投影、定位针偏移、瓦片范围、GCJ-02 -> WGS-84、坐标文本解析。
 * 不依赖 DOM，可在主线程 / Worker / Node 中使用。
 */

const MAX_LAT = 85.051129;
export const TILE_LOGICAL = 256;

/* ------------------------------------------------------------------ */
/* Web Mercator                                                         */
/* ------------------------------------------------------------------ */

// Mapbox GL 的 zoom 对应 512px 瓦片，世界宽度 = 512 * 2^zoom
export function project(lat, lon, zoom) {
  const size = 512 * Math.pow(2, zoom);
  const s = Math.sin((Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * size,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size
  };
}

export function unproject(x, y, zoom) {
  const size = 512 * Math.pow(2, zoom);
  const lon = (x / size) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / size;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lon };
}

/**
 * 计算地图中心点，使目标坐标落在图片 (fx, fy) 比例位置（0~1）。
 * 用于让定位针避开被照片遮挡的区域。
 */
export function centerForPinAt(lat, lon, zoom, width, height, fx, fy) {
  const p = project(lat, lon, zoom);
  return unproject(p.x + width * (0.5 - fx), p.y + height * (0.5 - fy), zoom);
}

/**
 * 给定目标坐标、缩放与画幅，计算覆盖整幅地图所需的瓦片。
 *
 * 输出地图按 2 倍物理像素绘制（逻辑 1 单位 = 2px）。为了 1:1 采样，
 * 256px 瓦片（tileScale=1）取 zoom+2 级，512px 瓦片（tileScale=2）取 zoom+1 级；
 * 超过服务商 maxZoom 时改用 maxZoom 级并放大，避免请求到「无数据」占位图。
 * 返回的 tileLogical 为单张瓦片覆盖的逻辑像素边长；left / top 为视口左上角在世界坐标中的位置。
 */
export function tilePlan({ lat, lon, zoom, width, height, pin, tileScale = 2, maxZoom = 22 }) {
  const z = Math.round(zoom);
  const center = pin ? centerForPinAt(lat, lon, z, width, height, pin.x, pin.y) : { lat, lon };
  const c = project(center.lat, center.lon, z);
  const left = c.x - width / 2;
  const top = c.y - height / 2;
  const tz = Math.max(0, Math.min(maxZoom, Math.round(z + 2 - Math.log2(tileScale))));
  const tileLogical = TILE_LOGICAL * Math.pow(2, z + 1 - tz);
  const n = Math.pow(2, tz);
  const x0 = Math.floor(left / tileLogical);
  const x1 = Math.floor((left + width - 1e-6) / tileLogical);
  const y0 = Math.max(0, Math.floor(top / tileLogical));
  const y1 = Math.min(n - 1, Math.floor((top + height - 1e-6) / tileLogical));
  const tiles = [];
  for (let ty = y0; ty <= y1; ty += 1) {
    for (let tx = x0; tx <= x1; tx += 1) {
      tiles.push({
        z: tz,
        x: ((tx % n) + n) % n,
        y: ty,
        dx: tx * tileLogical - left,
        dy: ty * tileLogical - top
      });
    }
  }
  const p = project(lat, lon, z);
  return { tiles, tileZoom: tz, tileLogical, pin: { x: p.x - left, y: p.y - top }, center };
}

/* ------------------------------------------------------------------ */
/* GCJ-02 -> WGS-84                                                     */
/* ------------------------------------------------------------------ */

const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;

function inChina(lat, lon) {
  return lon >= 72.004 && lon <= 137.8347 && lat >= 0.8293 && lat <= 55.8271;
}

function transformLat(x, y) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLon(x, y) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
  return ret;
}

export function gcj02ToWgs84(lat, lon) {
  if (!inChina(lat, lon)) return { lat, lon };
  let dLat = transformLat(lon - 105.0, lat - 35.0);
  let dLon = transformLon(lon - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
  dLon = (dLon * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
  return { lat: lat - dLat, lon: lon - dLon };
}

/* ------------------------------------------------------------------ */
/* 坐标文本解析                                                          */
/* ------------------------------------------------------------------ */

/**
 * 解析手动输入的坐标，支持：
 *   "30.2741, 120.1551"、"30.2741 120.1551"、"30.2741°N 120.1551°E"、"N30.2741 E120.1551"
 * 顺序为 纬度, 经度（带 N/S/E/W 时顺序任意）。无法解析返回 null。
 */
export function parseCoordinates(input) {
  const text = String(input || '').trim();
  if (!text) return null;
  const re = /([NSEW])?\s*(-?\d+(?:\.\d+)?)\s*°?\s*([NSEW])?/gi;
  const found = [];
  let m = re.exec(text);
  while (m) {
    const dir = (m[1] || m[3] || '').toUpperCase();
    found.push({ value: Number(m[2]), dir });
    m = re.exec(text);
  }
  if (found.length !== 2) return null;
  let lat;
  let lon;
  const hasDir = found.some((f) => f.dir);
  if (hasDir) {
    found.forEach((f) => {
      if (f.dir === 'N' || f.dir === 'S') lat = f.dir === 'S' ? -Math.abs(f.value) : Math.abs(f.value);
      else if (f.dir === 'E' || f.dir === 'W') lon = f.dir === 'W' ? -Math.abs(f.value) : Math.abs(f.value);
    });
    if (lat === undefined && lon !== undefined) lat = found.find((f) => !f.dir).value;
    if (lon === undefined && lat !== undefined) lon = found.find((f) => !f.dir).value;
  } else {
    lat = found[0].value;
    lon = found[1].value;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}
