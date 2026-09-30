import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tileInfo } from '../public/js/lib/providers.js';

export const APP_DIR = process.env.GEOPHOTOGRAPH_HOME || path.join(os.homedir(), '.geophotograph');
export const CACHE_DIR = path.join(APP_DIR, 'cache');
const CONFIG_FILE = path.join(APP_DIR, 'config.json');

const defaultOutputDir = () =>
  process.platform === 'darwin'
    ? path.join(os.homedir(), 'Pictures', 'GeoPhotoGraph')
    : path.join(os.homedir(), 'GeoPhotoGraph');

const DEFAULTS = {
  // 底图来源：esri（免 key）/ osm（免 key，本地灰度化）/ mapbox（需 token）/ custom（自定义栅格瓦片 URL）
  mapProvider: 'esri',
  // 逆地理编码来源：auto（有 Mapbox token 时用 Mapbox，否则 Nominatim）/ nominatim / mapbox
  geocoder: 'auto',
  mapboxToken: process.env.MAPBOX_TOKEN || '',
  // custom 模板：{z} {x} {y} 占位，可含 {s}（a/b/c/d）和 @2x
  tileUrlLight: '',
  tileUrlDark: '',
  customTileScale: 1,
  nominatimUrl: 'https://nominatim.openstreetmap.org',
  outputDir: defaultOutputDir()
};

let current = null;

function load() {
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (e) {
    saved = {};
  }
  current = { ...DEFAULTS, ...saved };
  if (!current.mapboxToken && DEFAULTS.mapboxToken) current.mapboxToken = DEFAULTS.mapboxToken;
  return current;
}

export function getConfig() {
  return current || load();
}

const ENUMS = {
  mapProvider: ['esri', 'osm', 'mapbox', 'custom'],
  geocoder: ['auto', 'nominatim', 'mapbox']
};
const STRINGS = ['mapboxToken', 'tileUrlLight', 'tileUrlDark', 'nominatimUrl', 'outputDir'];

export function updateConfig(patch) {
  const next = { ...getConfig() };
  Object.keys(ENUMS).forEach((key) => {
    if (patch[key] !== undefined && ENUMS[key].includes(patch[key])) next[key] = patch[key];
  });
  STRINGS.forEach((key) => {
    if (typeof patch[key] === 'string') next[key] = patch[key].trim();
  });
  if ([1, 2].includes(Number(patch.customTileScale))) next.customTileScale = Number(patch.customTileScale);
  if (next.outputDir) next.outputDir = path.resolve(next.outputDir.replace(/^~(?=$|\/)/, os.homedir()));
  else next.outputDir = DEFAULTS.outputDir;
  if (!/^https?:\/\//.test(next.nominatimUrl)) next.nominatimUrl = DEFAULTS.nominatimUrl;
  next.nominatimUrl = next.nominatimUrl.replace(/\/+$/, '');
  current = next;
  fs.mkdirSync(APP_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
  return next;
}

export function publicConfig() {
  const c = getConfig();
  const { mapboxToken, ...rest } = c;
  return {
    ...rest,
    hasMapboxToken: !!mapboxToken,
    platform: process.platform,
    canConvertHeic: process.platform === 'darwin',
    tiles: tileInfo(c),
    effectiveGeocoder: c.geocoder === 'auto' ? (mapboxToken ? 'mapbox' : 'nominatim') : c.geocoder
  };
}
