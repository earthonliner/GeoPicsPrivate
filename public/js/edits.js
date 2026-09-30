/**
 * edits.js：记住每张照片的手动修改（地名 / 日期 / 定位 / 模板 / 取景）。
 *
 * 以「文件名 + 大小 + 修改时间」识别同一张照片，重新导入时自动恢复；只保存在本机 localStorage，
 * 只记录与自动结果不同的字段，上千张照片也只占很小的空间。
 */
import { formatCoordinates, formatDate } from './lib/exif.js';
import { TEMPLATES } from './lib/posters.js';

const KEY = 'geophotograph.edits.v1';
const MAX_ENTRIES = 5000;

export const fileKey = (f) => `${f.name}|${f.size}|${f.lastModified}`;

let store = null;
const dirty = new Set();
let timer = null;

function load() {
  if (store) return store;
  store = new Map();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    Object.entries(raw)
      .sort((a, b) => (a[1].t || 0) - (b[1].t || 0))
      .forEach(([k, v]) => store.set(k, v));
  } catch (e) {
    // 数据损坏时从空白开始
  }
  return store;
}

function persist() {
  const write = () => localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(store)));
  try {
    write();
  } catch (e) {
    // 存储已满：丢弃最旧的一半再试一次
    [...store.keys()].slice(0, Math.ceil(store.size / 2)).forEach((k) => store.delete(k));
    try {
      write();
    } catch (e2) {
      // 仍然失败就放弃（编辑记忆只是便利功能）
    }
  }
}

function snapshot(item) {
  const e = {};
  if (item.placeManual && item.place && item.placeStatus !== 'loading') e.place = item.place;
  if (item.dateManual && item.dateValue) e.date = item.dateValue;
  if (item.locManual && item.lat !== null) e.loc = [item.lat, item.lon, item.fallbackName || ''];
  if (item.tplManual) e.tpl = item.templateId;
  const crops = Object.entries(item.crops).filter(([, c]) => c && (c.zoom !== 1 || c.x || c.y));
  if (crops.length) e.crops = Object.fromEntries(crops);
  return Object.keys(e).length ? e : null;
}

export function flush() {
  clearTimeout(timer);
  timer = null;
  if (!dirty.size) return;
  const s = load();
  for (const item of dirty) {
    const key = fileKey(item.file);
    const entry = snapshot(item);
    s.delete(key);
    if (entry) s.set(key, { ...entry, t: Date.now() });
  }
  dirty.clear();
  while (s.size > MAX_ENTRIES) s.delete(s.keys().next().value);
  persist();
}

/** 标记照片有改动，稍后批量写入 */
export function track(items, enabled = true) {
  if (!enabled) return;
  for (const item of [].concat(items)) if (item && !item.isSample) dirty.add(item);
  clearTimeout(timer);
  timer = setTimeout(flush, 600);
}

/**
 * 把保存过的修改套用到刚导入的照片上。
 * @param {{keepTemplate?: boolean}} opts keepTemplate=false 时不恢复模板（统一模板模式）
 * @returns {boolean} 是否有恢复
 */
export function restore(item, opts = {}) {
  const e = load().get(fileKey(item.file));
  if (!e) return false;
  if (Array.isArray(e.loc) && Number.isFinite(e.loc[0]) && Number.isFinite(e.loc[1])) {
    [item.lat, item.lon] = e.loc;
    item.fallbackName = e.loc[2] || '';
    item.hasGps = true;
    item.locManual = true;
    item.coordText = formatCoordinates(item.lat, item.lon).text;
    item.place = 'LOCATING…';
    item.placeStatus = 'loading';
  }
  if (e.place) {
    item.place = e.place;
    item.placeManual = true;
    item.placeStatus = 'ok';
  }
  if (e.date && formatDate(e.date)) {
    item.dateValue = e.date;
    item.dateText = formatDate(e.date);
    item.dateManual = true;
  }
  if (e.tpl && opts.keepTemplate !== false && TEMPLATES.some((t) => t.id === e.tpl)) {
    item.templateId = e.tpl;
    item.tplManual = true;
  }
  if (e.crops && typeof e.crops === 'object') item.crops = { ...e.crops };
  return true;
}

export function count() {
  flush();
  return load().size;
}

export function clearAll() {
  dirty.clear();
  clearTimeout(timer);
  load().clear();
  try {
    localStorage.removeItem(KEY);
  } catch (e) {
    // ignore
  }
}
