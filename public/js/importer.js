/**
 * importer.js：收集文件（含拖入文件夹）、读取 EXIF、解析地名。为成千上万张照片设计：
 * 只读取文件头部、并发受控、地名解析按网格去重。
 */
import { extractFromBlob, formatCoordinates, formatDate, toDateValue } from './lib/exif.js';
import { formatPlace, normalizePlaceName } from './lib/place-name.js';
import { pickRandomTemplates } from './lib/batch.js';
import { templatesOf } from './lib/posters.js';
import { createItem, isImageFile } from './store.js';
import * as api from './api.js';

/* ---------------------------- 收集文件 ---------------------------- */

function readEntries(reader) {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

async function walkEntry(entry, out) {
  if (entry.isFile) {
    await new Promise((resolve) => entry.file((f) => { out.push(f); resolve(); }, resolve));
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    // readEntries 每次最多返回 100 项，需要循环读取
    for (;;) {
      const batch = await readEntries(reader).catch(() => []);
      if (!batch.length) break;
      for (const child of batch) await walkEntry(child, out);
    }
  }
}

export async function collectFromDrop(dataTransfer) {
  const out = [];
  const entries = [];
  for (const item of dataTransfer.items || []) {
    const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
    if (entry) entries.push(entry);
  }
  if (entries.length) {
    for (const e of entries) await walkEntry(e, out);
  } else {
    out.push(...dataTransfer.files);
  }
  return out.filter(isImageFile);
}

/* ---------------------------- 并发工具 ---------------------------- */

export async function mapLimit(list, limit, fn) {
  let next = 0;
  const run = async () => {
    while (next < list.length) {
      const i = next;
      next += 1;
      await fn(list[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, run));
}

/* ---------------------------- 导入 ---------------------------- */

const fileKey = (f) => `${f.name}|${f.size}|${f.lastModified}`;

function parseExifTime(raw) {
  const m = /(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : 0;
}

export function applyExif(item, exif) {
  const fallback = new Date(item.file.lastModified || Date.now());
  item.autoDate = {
    text: exif.dateText || formatDate(fallback),
    value: exif.dateValue || toDateValue(fallback),
    fromExif: !!exif.dateText
  };
  item.dateText = item.autoDate.text;
  item.dateValue = item.autoDate.value;
  item.time = parseExifTime(exif.dateRaw) || item.file.lastModified || 0;
  if (exif.hasGps) {
    item.lat = exif.latitude;
    item.lon = exif.longitude;
    item.hasGps = true;
    item.coordText = exif.coordText;
    item.place = 'LOCATING…';
    item.placeStatus = 'loading';
  } else {
    item.place = 'UNKNOWN';
    item.placeStatus = 'none';
  }
}

export async function importFiles(app, files, onProgress) {
  const known = new Set(app.items.map((it) => fileKey(it.file)));
  const fresh = [];
  for (const f of files) {
    const k = fileKey(f);
    if (!known.has(k)) {
      known.add(k);
      fresh.push(f);
    }
  }
  if (!fresh.length) return { created: [], skipped: files.length };

  const created = new Array(fresh.length);
  let done = 0;
  await mapLimit(fresh, 8, async (file, i) => {
    const item = createItem(file, app.settings.templateId);
    applyExif(item, await extractFromBlob(file));
    created[i] = item;
    done += 1;
    if (done % 25 === 0 || done === fresh.length) onProgress(done, fresh.length);
  });

  const s = app.settings;
  if (s.batchMode === 'random') {
    pickRandomTemplates(templatesOf(s.catId).map((t) => t.id), created.length).forEach((id, i) => {
      created[i].templateId = id;
    });
  }
  return { created, skipped: files.length - fresh.length };
}

/* ---------------------------- 地名解析 ---------------------------- */

export class PlaceResolver {
  constructor(app) {
    this.app = app;
    this.queue = [];
    this.active = 0;
    this.total = 0;
    this.done = 0;
    this.waiters = [];
    this.cache = new Map();
  }

  get busy() {
    return this.queue.length + this.active > 0;
  }

  enqueue(items) {
    items.forEach((item) => {
      if (item.lat === null) return;
      const locId = ++item.locId;
      this.queue.push({ item, locId });
      this.total += 1;
    });
    this.pump();
    this.app.ui.onGeoProgress(this);
  }

  pump() {
    const limit = 6;
    while (this.active < limit && this.queue.length) {
      const job = this.queue.shift();
      this.active += 1;
      this.resolve(job.item, job.locId)
        .catch(() => {})
        .finally(() => {
          this.active -= 1;
          this.done += 1;
          if (!this.busy) {
            this.total = 0;
            this.done = 0;
            this.waiters.splice(0).forEach((fn) => fn());
          }
          this.app.ui.onGeoProgress(this);
          this.pump();
        });
    }
  }

  idle() {
    return this.busy ? new Promise((resolve) => this.waiters.push(resolve)) : Promise.resolve();
  }

  async resolve(item, locId) {
    const { placeLang: lang, placeLevel: level } = this.app.settings;
    const digits = level === 'detail' ? 3 : 2;
    const key = `${lang}|${level}|${item.lat.toFixed(digits)},${item.lon.toFixed(digits)}`;
    let geo = this.cache.get(key);
    if (geo === undefined) {
      geo = await api.reverseGeocode(item.lat, item.lon, lang, level);
      if (geo) this.cache.set(key, geo);
    }
    if (locId !== item.locId) return;
    const composed = geo ? formatPlace(geo.parts, level, lang) : '';
    item.place = composed || normalizePlaceName(item.fallbackName, lang) || 'UNKNOWN';
    item.placeStatus = composed ? 'ok' : 'fail';
    item.placeManual = false;
    this.app.ui.onItemChanged(item);
  }

  clearCache() {
    this.cache.clear();
  }
}

export function setLocation(app, item, lat, lon, fallbackName) {
  item.lat = lat;
  item.lon = lon;
  item.hasGps = true;
  item.fallbackName = fallbackName || '';
  item.coordText = formatCoordinates(lat, lon).text;
  item.place = 'LOCATING…';
  item.placeStatus = 'loading';
  item.placeManual = false;
  app.resolver.enqueue([item]);
}
