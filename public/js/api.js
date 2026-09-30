/**
 * api.js：与本地服务（server/）通信。所有接口都只在本机回环地址上提供。
 */

async function json(res) {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      message = (await res.json()).error || message;
    } catch (e) {
      // ignore
    }
    throw new Error(message);
  }
  return res.json();
}

export const getConfig = () => fetch('/api/config').then(json);

export const saveConfig = (patch) =>
  fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }).then(json);

export async function reverseGeocode(lat, lon, lang, level) {
  const q = new URLSearchParams({ lat: lat.toFixed(6), lon: lon.toFixed(6), lang, level });
  try {
    const data = await fetch(`/api/geocode/reverse?${q}`).then(json);
    return data && data.parts ? data : null;
  } catch (e) {
    return null;
  }
}

export async function searchPlaces(query, lang) {
  const q = new URLSearchParams({ q: query, lang });
  const data = await fetch(`/api/geocode/search?${q}`).then(json);
  return data.results || [];
}

export async function convertToJpeg(blob, maxSide = 2560) {
  const res = await fetch(`/api/convert?maxSide=${maxSide}`, { method: 'POST', body: blob });
  if (!res.ok) throw new Error(res.status === 501 ? '当前系统不支持 HEIC 转换（仅 macOS）' : `转换失败 (${res.status})`);
  return res.blob();
}

export async function saveToFolder(folder, name, blob) {
  const q = new URLSearchParams({ folder, name });
  const res = await fetch(`/api/save?${q}`, { method: 'POST', body: blob });
  return json(res);
}

export const revealFolder = (path) =>
  fetch('/api/reveal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) }).then(json);
