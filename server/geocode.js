import fs from 'node:fs';
import path from 'node:path';
import { APP_DIR, getConfig } from './config.js';

const USER_AGENT = 'GeoPhotoGraph-local/1.0 (personal offline poster tool)';
const CACHE_FILE = path.join(APP_DIR, 'cache', 'geocode.json');
const NOMINATIM_INTERVAL_MS = 1100;

let cache = null;
let saveTimer = null;
const inflight = new Map();

function loadCache() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch (e) {
    cache = {};
  }
  return cache;
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
    } catch (e) {
      // 缓存写入失败不影响功能
    }
  }, 1500);
  saveTimer.unref();
}

export function flushGeocodeCache() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  } catch (e) {
    // ignore
  }
}

/* ------------------------------------------------------------------ */
/* Nominatim：全局串行限速（官方限制 1 次 / 秒）                            */
/* ------------------------------------------------------------------ */

let nominatimChain = Promise.resolve();
let lastNominatim = 0;

function nominatimRequest(pathAndQuery) {
  const run = async () => {
    const wait = lastNominatim + NOMINATIM_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      lastNominatim = Date.now();
      try {
        const res = await fetch(`${getConfig().nominatimUrl}${pathAndQuery}`, {
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
          signal: AbortSignal.timeout(15000)
        });
        if (res.ok) return await res.json();
        if (res.status < 500 && res.status !== 429) return null;
      } catch (e) {
        // 重试
      }
      await new Promise((r) => setTimeout(r, NOMINATIM_INTERVAL_MS * (attempt + 2)));
      lastNominatim = Date.now();
    }
    return null;
  };
  const job = nominatimChain.then(run, run);
  nominatimChain = job.catch(() => null);
  return job;
}

const nominatimLang = (lang) => (lang === 'zh' ? 'zh-Hans,zh' : 'en');

export function partsFromNominatim(address) {
  const a = address || {};
  const parts = {
    city: a.city || a.town || a.village || a.municipality || a.hamlet || '',
    locality: a.city_district || a.suburb || a.borough || a.quarter || '',
    district: a.county || a.state_district || '',
    region: a.state || a.province || a.region || '',
    country: a.country || '',
    neighborhood: a.neighbourhood || ''
  };
  Object.keys(parts).forEach((k) => {
    if (!parts[k]) delete parts[k];
  });
  return parts;
}

async function reverseNominatim(lat, lon, lang) {
  const q = `lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}&zoom=14&addressdetails=1&format=jsonv2&accept-language=${encodeURIComponent(nominatimLang(lang))}`;
  const data = await nominatimRequest(`/reverse?${q}`);
  if (!data || data.error) return null;
  const parts = partsFromNominatim(data.address);
  return Object.keys(parts).length ? { parts } : null;
}

async function searchNominatim(query, lang) {
  const q = `q=${encodeURIComponent(query)}&limit=8&addressdetails=0&format=jsonv2&accept-language=${encodeURIComponent(nominatimLang(lang))}`;
  const data = await nominatimRequest(`/search?${q}`);
  if (!Array.isArray(data)) return [];
  return data.map((r) => ({
    name: String(r.name || String(r.display_name || '').split(',')[0] || ''),
    address: String(r.display_name || ''),
    lat: Number(r.lat),
    lon: Number(r.lon)
  }));
}

/* ------------------------------------------------------------------ */
/* Mapbox Geocoding                                                     */
/* ------------------------------------------------------------------ */

const PLACE_PRIORITY = ['place', 'locality', 'district', 'region', 'country'];
const GEOCODE_TYPES = PLACE_PRIORITY.concat(['neighborhood']);
const TYPE_KEY = { place: 'city', locality: 'locality', district: 'district', region: 'region', country: 'country', neighborhood: 'neighborhood' };

async function mapboxRequest(route, query) {
  const params = Object.keys(query)
    .map((k) => `${k}=${encodeURIComponent(query[k])}`)
    .join('&');
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${route}.json?${params}&access_token=${encodeURIComponent(getConfig().mapboxToken)}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data && data.features) || [];
  } catch (e) {
    return [];
  }
}

const mapboxLang = (lang) => (lang === 'zh' ? 'zh-Hans' : 'en');

export function partsFromMapbox(features) {
  let picked = null;
  for (const type of PLACE_PRIORITY) {
    picked = features.find((f) => (f.place_type || []).indexOf(type) >= 0);
    if (picked) break;
  }
  if (!picked) return null;
  const parts = {};
  features.forEach((f) => {
    (f.place_type || []).forEach((t) => {
      if (TYPE_KEY[t] && !parts[TYPE_KEY[t]]) parts[TYPE_KEY[t]] = String(f.text || '');
    });
  });
  (picked.context || []).forEach((c) => {
    const t = String(c.id || '').split('.')[0];
    if (TYPE_KEY[t] && !parts[TYPE_KEY[t]]) parts[TYPE_KEY[t]] = String(c.text || '');
  });
  return { parts };
}

async function reverseMapbox(lat, lon, lang) {
  const features = await mapboxRequest(`${lon.toFixed(6)},${lat.toFixed(6)}`, {
    types: GEOCODE_TYPES.join(','),
    language: mapboxLang(lang)
  });
  return partsFromMapbox(features);
}

async function searchMapbox(query, lang) {
  const features = await mapboxRequest(encodeURIComponent(query), {
    autocomplete: 'true',
    limit: 8,
    language: mapboxLang(lang)
  });
  return features
    .filter((f) => Array.isArray(f.center) && f.center.length === 2)
    .map((f) => ({ name: String(f.text || ''), address: String(f.place_name || ''), lon: f.center[0], lat: f.center[1] }));
}

/* ------------------------------------------------------------------ */
/* 对外接口                                                             */
/* ------------------------------------------------------------------ */

function provider() {
  const c = getConfig();
  if (c.geocoder === 'mapbox' || (c.geocoder === 'auto' && c.mapboxToken)) return c.mapboxToken ? 'mapbox' : 'nominatim';
  return 'nominatim';
}

/**
 * 逆地理编码，带磁盘缓存与同格合并。
 * 城市级别按 ~1km 网格（小数点后 2 位）合并请求，详细级别按 ~100m（3 位），
 * 大批量照片通常集中在少数几个地点，这样可以把请求数降到最低。
 */
export async function reverseGeocode(lat, lon, lang, level) {
  const p = provider();
  const digits = level === 'detail' ? 3 : 2;
  const key = `${p}|${lang}|${lat.toFixed(digits)},${lon.toFixed(digits)}`;
  const store = loadCache();
  if (store[key] !== undefined) return store[key];
  if (inflight.has(key)) return inflight.get(key);
  const job = (async () => {
    const result = p === 'mapbox' ? await reverseMapbox(lat, lon, lang) : await reverseNominatim(lat, lon, lang);
    if (result) {
      store[key] = result;
      scheduleSave();
    }
    return result;
  })();
  inflight.set(key, job);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}

export async function searchPlaces(query, lang) {
  const q = String(query || '').trim();
  if (!q) return [];
  return provider() === 'mapbox' ? searchMapbox(q, lang) : searchNominatim(q, lang);
}
