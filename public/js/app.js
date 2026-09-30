/**
 * app.js：界面装配。状态集中在 app 对象；绘制、导出、导入分别在各自模块中。
 */
import { TEMPLATES, CATEGORIES, templatesOf, CROP_REGIONS, DEFAULT_CROP, posterHeight, POSTER_W } from './lib/posters.js';
import { THEMES, CUSTOM_ID, DEFAULT_CUSTOM_HEX, parseHex } from './lib/themes.js';
import { formatDate, toDateValue } from './lib/exif.js';
import { parseCoordinates, gcj02ToWgs84 } from './lib/geo.js';
import { pickRandomTemplates } from './lib/batch.js';
import { RenderPool, defaultWorkerCount } from './pool.js';
import { Preview } from './preview.js';
import { runExport } from './exporter.js';
import { loadSettings, saveSettings } from './store.js';
import { importFiles, collectFromDrop, PlaceResolver, setLocation } from './importer.js';
import { tileInfo } from './lib/providers.js';
import { withSource } from './source.js';
import * as api from './api.js';

const $ = (id) => document.getElementById(id);

const app = {
  settings: loadSettings(),
  items: [],
  view: [],
  current: null,
  config: null,
  pool: null,
  resolver: null,
  preview: null,
  busy: false,
  ui: {},
  tileInfo: () => tileInfo(app.config || {})
};
window.__app = app;

const tplName = (id) => (TEMPLATES.find((t) => t.id === id) || {}).name || '';
const persist = () => saveSettings(app.settings);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/* ------------------------------------------------------------------ */
/* 通用 UI：toast / 状态栏 / 对话框                                      */
/* ------------------------------------------------------------------ */

let toastTimer = null;
function toast(text, ms = 2600) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

function setStatus(text, fraction) {
  $('status-text').textContent = text;
  const bar = document.querySelector('.status-bar');
  bar.classList.toggle('on', typeof fraction === 'number');
  if (typeof fraction === 'number') $('status-fill').style.width = `${Math.round(fraction * 100)}%`;
}

function confirmDialog(message) {
  return Promise.resolve(window.confirm(message));
}

/* ------------------------------------------------------------------ */
/* 排序 / 过滤 / 列表                                                   */
/* ------------------------------------------------------------------ */

const sortMode = () => $('sort-select').value;

function sortedItems() {
  const list = app.items.slice();
  const mode = sortMode();
  if (mode === 'time') list.sort((a, b) => a.time - b.time || a.id - b.id);
  else if (mode === 'name') list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }) || a.id - b.id);
  return list;
}

const cards = new Map();
const byId = new Map();
let thumbObserver = null;

function makeCard(item) {
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.id = item.id;
  el.innerHTML = '<div class="ph">…</div><span class="chk"></span><span class="noloc" hidden>无位置</span><span class="state" hidden></span><span class="tag"></span>';
  cards.set(item.id, el);
  byId.set(item.id, item);
  thumbObserver.observe(el);
  return el;
}

function updateCard(item) {
  const el = cards.get(item.id);
  if (!el) return;
  el.classList.toggle('current', item === app.current);
  el.classList.toggle('on', item.selected);
  el.title = `${item.name}\n${item.place} · ${item.dateText}`;
  el.querySelector('.tag').textContent = tplName(item.templateId);
  el.querySelector('.noloc').hidden = item.lat !== null;
  const st = el.querySelector('.state');
  st.hidden = !item.exportState;
  st.className = `state ${item.exportState}`;
  st.textContent = item.exportState === 'done' ? '✓' : item.exportState === 'error' ? '!' : '';
  const ph = el.querySelector('.ph');
  if (item.thumbUrl) {
    let img = el.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      img.decoding = 'async';
      img.alt = '';
      el.prepend(img);
    }
    if (img.src !== item.thumbUrl) img.src = item.thumbUrl;
    if (ph) ph.remove();
  } else if (ph) {
    ph.textContent = item.thumbState === 'error' ? '无法预览' : '…';
  }
}

function refreshList() {
  const list = sortedItems();
  const onlyNoLoc = $('chk-noloc').checked;
  app.view = onlyNoLoc ? list.filter((it) => it.lat === null) : list;

  const live = new Set(app.items.map((it) => it.id));
  for (const [id, el] of cards) {
    if (!live.has(id)) {
      el.remove();
      thumbObserver.unobserve(el);
      cards.delete(id);
      byId.delete(id);
    }
  }
  const frag = document.createDocumentFragment();
  app.view.forEach((it) => {
    frag.appendChild(cards.get(it.id) || makeCard(it));
    updateCard(it);
  });
  $('grid').replaceChildren(frag);
  document.querySelector('.list-pane').classList.toggle('has-items', app.items.length > 0);
  refreshCounts();
}

function refreshCounts() {
  const total = app.items.length;
  const sel = app.items.filter((i) => i.selected).length;
  $('sel-count').textContent = `${sel} / ${total}`;
  const all = $('chk-all');
  all.checked = total > 0 && sel === total;
  all.indeterminate = sel > 0 && sel < total;
  $('noloc-count').textContent = String(app.items.filter((i) => i.lat === null).length);
  $('btn-export').disabled = total === 0;
  $('btn-clear').disabled = total === 0;
}

async function requestThumb(item) {
  if (item.thumbState !== 'idle') return;
  item.thumbState = 'loading';
  try {
    const res = await withSource(item, 1200, (blob) => app.pool.run('thumb', { blob, size: 280 }, { priority: 2 }));
    item.thumbUrl = URL.createObjectURL(res.blob);
    item.aspect = res.width / res.height;
    item.thumbState = 'ready';
  } catch (err) {
    item.thumbState = 'error';
  }
  updateCard(item);
}

/* ------------------------------------------------------------------ */
/* 当前照片与 Inspector 同步                                             */
/* ------------------------------------------------------------------ */

function setCurrent(item) {
  const prev = app.current;
  app.current = item || null;
  if (prev) updateCard(prev);
  if (item) {
    updateCard(item);
    ensureCategory();
  }
  syncItemControls();
  renderTemplates();
  app.preview.schedule(0);
}

function ensureCategory() {
  const tpl = TEMPLATES.find((t) => t.id === (app.current ? app.current.templateId : app.settings.templateId));
  if (!tpl || templatesOf(app.settings.catId).some((t) => t.id === tpl.id)) return;
  app.settings.catId = tpl.category;
  renderCategories();
}

function syncItemControls() {
  const it = app.current;
  const placeInput = $('place-input');
  if (document.activeElement !== placeInput) placeInput.value = it ? it.place : '';
  placeInput.disabled = !it;
  $('coord-text').textContent = it && it.lat !== null ? it.coordText : it ? '无位置信息' : '—';
  $('date-input').value = it ? it.dateValue : '';
  $('date-input').disabled = !it;
  ['btn-place-reset', 'btn-locate', 'btn-date-reset'].forEach((id) => { $(id).disabled = !it; });
  syncCrop();
  const scale = app.settings.exportScale;
  $('export-size').textContent = `导出 ${POSTER_W * scale} × ${Math.round(posterHeight(app.settings.footerOn) * scale)} px`;
}

function syncCrop() {
  const it = app.current;
  const enabled = !!it && !!CROP_REGIONS[it.templateId];
  const crop = (it && it.crops[it.templateId]) || DEFAULT_CROP;
  const vals = { 'crop-zoom': Math.round(crop.zoom * 100), 'crop-x': Math.round(crop.x * 100), 'crop-y': Math.round(crop.y * 100) };
  Object.entries(vals).forEach(([id, v]) => {
    $(id).value = v;
    $(`${id}-out`).textContent = id === 'crop-zoom' ? `${(v / 100).toFixed(2)}×` : v;
    $(id).disabled = !enabled;
  });
  $('btn-crop-reset').disabled = !enabled;
  $('crop-note').hidden = !it || enabled;
  $('preview-hint').textContent = enabled ? '拖动照片调整取景，滚轮 / 触控板捏合缩放' : '预览';
}

function syncSettingsControls() {
  const s = app.settings;
  $('mode-seg').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.mode === s.batchMode));
  $('btn-reshuffle').disabled = s.batchMode !== 'random';
  $('mode-note').textContent = s.batchMode === 'unique' ? '统一模板：点选模板即应用到全部照片。' : '随机模板：每张照片在当前分类内抽取不同模板（洗牌发牌，一轮内不重复）；点选模板只改当前这张。';
  $('lang-seg').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.lang === s.placeLang));
  $('level-seg').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.level === s.placeLevel));
  $('map-zoom').value = s.zoom;
  $('map-zoom-out').textContent = s.zoom;
  $('op-map').value = s.mapOpacity;
  $('op-photo').value = s.photoOpacity;
  $('op-text').value = s.textOpacity;
  $('op-map-out').textContent = s.mapOpacity;
  $('op-photo-out').textContent = s.photoOpacity;
  $('op-text-out').textContent = s.textOpacity;
  $('footer-toggle').checked = s.footerOn;
  $('brand-name').value = s.brandName;
  $('brand-tagline').value = s.brandTagline;
  $('btn-logo-clear').hidden = !s.logoDataUrl;
  $('logo-state').textContent = s.logoDataUrl ? '已设置' : '';
  $('swatches').querySelectorAll('.swatch').forEach((b) => b.classList.toggle('active', b.dataset.id === s.mapColorId));
  $('custom-color').hidden = s.mapColorId !== CUSTOM_ID;
  $('custom-picker').value = s.customHex.toLowerCase();
  $('custom-hex').value = s.customHex;
}

/* ------------------------------------------------------------------ */
/* 模板栏                                                               */
/* ------------------------------------------------------------------ */

function renderCategories() {
  const seg = $('cat-seg');
  seg.replaceChildren(
    ...CATEGORIES.map((c) => {
      const b = document.createElement('button');
      b.textContent = c.name;
      b.dataset.id = c.id;
      b.classList.toggle('active', c.id === app.settings.catId);
      return b;
    })
  );
  renderTemplates();
}

function renderTemplates() {
  const currentId = app.current ? app.current.templateId : app.settings.templateId;
  $('tpl-chips').replaceChildren(
    ...templatesOf(app.settings.catId).map((t) => {
      const b = document.createElement('button');
      b.className = `chip${t.id === currentId ? ' active' : ''}`;
      b.textContent = t.name;
      b.dataset.id = t.id;
      return b;
    })
  );
}

function setTemplate(id) {
  app.settings.templateId = id;
  if (app.settings.batchMode === 'unique') {
    app.items.forEach((it) => { it.templateId = id; });
  } else if (app.current) {
    app.current.templateId = id;
  }
  persist();
  app.items.forEach(updateCard);
  renderTemplates();
  syncCrop();
  app.preview.schedule(0);
}

function reshuffle() {
  const ids = templatesOf(app.settings.catId).map((t) => t.id);
  pickRandomTemplates(ids, app.view.length || app.items.length).forEach((id, i) => {
    (app.view.length ? app.view : app.items)[i].templateId = id;
  });
  app.items.forEach(updateCard);
  renderTemplates();
  syncCrop();
  app.preview.schedule(0);
}

/* ------------------------------------------------------------------ */
/* 导入                                                                 */
/* ------------------------------------------------------------------ */

async function addFiles(files) {
  if (app.busy || !files.length) return;
  app.busy = true;
  try {
    setStatus(`读取 ${files.length} 张照片的位置与日期…`, 0);
    const { created, skipped } = await importFiles(app, files, (done, total) => setStatus(`读取照片信息 ${done} / ${total}`, done / total));
    if (!created.length) {
      setStatus('没有新的照片（可能已添加过）');
      return;
    }
    app.items.push(...created);
    refreshList();
    if (!app.current) setCurrent(sortedItems()[0]);
    app.resolver.enqueue(created);
    const missing = created.filter((it) => it.lat === null).length;
    setStatus(`已添加 ${created.length} 张${skipped ? `，跳过重复 ${skipped} 张` : ''}${missing ? `，其中 ${missing} 张没有位置信息` : ''}`);
    if (missing) toast(`${missing} 张照片没有位置信息，可勾选“无位置”筛选后逐张定位`, 4200);
  } finally {
    app.busy = false;
  }
}

async function clearAll() {
  if (!app.items.length) return;
  if (!(await confirmDialog(`清空全部 ${app.items.length} 张照片？（不会删除原文件）`))) return;
  app.items.forEach((it) => { if (it.thumbUrl) URL.revokeObjectURL(it.thumbUrl); });
  app.items = [];
  app.resolver.queue.length = 0;
  setCurrent(null);
  refreshList();
  setStatus('已清空');
}

function removeItem(item) {
  const idx = app.view.indexOf(item);
  app.items = app.items.filter((i) => i !== item);
  if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
  item.locId += 1;
  refreshList();
  if (app.current === item) setCurrent(app.view[Math.min(idx, app.view.length - 1)] || app.items[0] || null);
}

/* ------------------------------------------------------------------ */
/* app.ui 回调（被导入 / 解析 / 导出模块使用）                             */
/* ------------------------------------------------------------------ */

app.ui.onItemChanged = (item, opts = {}) => {
  updateCard(item);
  refreshCounts();
  if (item === app.current) {
    syncItemControls();
    if (opts.redraw !== false) app.preview.schedule(40);
  }
};

app.ui.onGeoProgress = (resolver) => {
  if (app.busy) return;
  if (resolver.busy) setStatus(`解析地名 ${resolver.done} / ${resolver.total}`, resolver.total ? resolver.done / resolver.total : 0);
  else setStatus('就绪');
};

app.ui.setPreviewMessage = (text) => {
  const el = $('preview-msg');
  el.textContent = text;
  el.hidden = !text;
};

app.ui.syncCrop = syncCrop;

/* ------------------------------------------------------------------ */
/* 地点 / 日期                                                          */
/* ------------------------------------------------------------------ */

function scopeItems(scope) {
  return scope === 'all' ? app.items : app.items.filter((i) => i.selected);
}

function applySpread(kind) {
  const cur = app.current;
  if (!cur) return;
  const targets = scopeItems($('apply-scope').value);
  if (!targets.length) return toast('没有可应用的照片（请先勾选）');
  if (kind !== 'date') {
    const text = (cur.place || '').trim();
    if (!text || text === 'LOCATING…') return toast('请先填写地名');
    targets.forEach((it) => {
      it.locId += 1;
      it.place = text;
      it.placeManual = true;
      it.placeStatus = 'ok';
    });
  }
  if (kind !== 'place') {
    if (!cur.dateText) return toast('请先选择日期');
    targets.forEach((it) => Object.assign(it, { dateText: cur.dateText, dateValue: cur.dateValue, dateManual: true }));
  }
  targets.forEach(updateCard);
  app.preview.schedule(0);
  toast(`已应用到 ${targets.length} 张`);
}

function resolveAll(filter) {
  app.resolver.enqueue(app.items.filter((it) => it.lat !== null && filter(it)));
}

/* ------------------------------------------------------------------ */
/* 定位对话框                                                           */
/* ------------------------------------------------------------------ */

async function runSearch() {
  const q = $('search-input').value.trim();
  if (!q) return;
  const list = $('search-results');
  list.replaceChildren();
  $('search-empty').hidden = true;
  $('btn-search').disabled = true;
  try {
    const results = await api.searchPlaces(q, app.settings.placeLang);
    $('search-empty').hidden = results.length > 0;
    results.forEach((r) => {
      const li = document.createElement('li');
      li.innerHTML = '<b></b><small></small>';
      li.firstChild.textContent = r.name;
      li.lastChild.textContent = r.address;
      li.addEventListener('click', () => {
        applyLocation(r.lat, r.lon, r.name);
      });
      list.appendChild(li);
    });
  } catch (e) {
    toast(`搜索失败：${e.message}`);
  } finally {
    $('btn-search').disabled = false;
  }
}

function applyLocation(lat, lon, name) {
  if (!app.current) return;
  setLocation(app, app.current, lat, lon, name);
  $('dlg-locate').close();
  refreshCounts();
  app.ui.onItemChanged(app.current);
  if (app.view.indexOf(app.current) < 0 && $('chk-noloc').checked) refreshList();
}

/* ------------------------------------------------------------------ */
/* 导出                                                                 */
/* ------------------------------------------------------------------ */

function exportItems(scope) {
  if (scope === 'current') return app.current ? [app.current] : [];
  const list = sortedItems();
  return scope === 'all' ? list : list.filter((i) => i.selected);
}

function ensurePool() {
  const n = app.settings.workers || defaultWorkerCount();
  if (!app.pool) app.pool = new RenderPool(n);
  else if (app.pool.size !== n) app.pool.resize(n);
}

function updateExportSummary() {
  const s = app.settings;
  const scope = $('ex-scope').value;
  const items = exportItems(scope);
  const scale = Number($('ex-scale').value);
  const dims = `${POSTER_W * scale} × ${Math.round(posterHeight(s.footerOn) * scale)}`;
  const noLoc = items.filter((i) => i.lat === null).length;
  const perMb = $('ex-format').value === 'png' ? 2.6 : 0.25 * scale;
  let text = `将导出 ${items.length} 张 · ${dims} px · 约 ${Math.max(1, Math.round((items.length * perMb)))} MB`;
  if (noLoc) text += ` · 其中 ${noLoc} 张没有位置（使用占位底图）`;
  if (app.resolver.busy) text += ' · 地名仍在解析，导出前会自动等待';
  $('ex-summary').textContent = text;
  $('btn-export-go').disabled = items.length === 0;
  const mode = $('ex-mode').value;
  const cfg = app.config || {};
  $('ex-mode-note').textContent =
    mode === 'folder' ? `写入 ${cfg.outputDir || '输出目录'}/GeoPhotoGraph-时间戳/，适合大批量。`
      : mode === 'zip' ? '按约 400 MB 分卷，由浏览器逐个下载（可能需要允许多文件下载）。'
        : '由浏览器直接写入你选择的文件夹（仅 Chrome / Edge）。';
}

function openExportDialog() {
  const s = app.settings;
  $('ex-scope').value = s.scope;
  if (s.scope === 'selected' && !app.items.some((i) => i.selected)) $('ex-scope').value = 'all';
  $('ex-format').value = s.exportFormat;
  $('ex-scale').value = String(s.exportScale);
  $('ex-quality').value = s.exportQuality;
  $('ex-quality-out').textContent = s.exportQuality;
  $('ex-pattern').value = s.namePattern;
  $('ex-maxside').value = String(s.maxSide);
  $('ex-mode').querySelector('[value="fsa"]').hidden = !window.showDirectoryPicker;
  $('ex-mode').value = s.exportMode === 'fsa' && !window.showDirectoryPicker ? 'folder' : s.exportMode;
  const sel = $('ex-workers');
  const cores = navigator.hardwareConcurrency || 4;
  sel.replaceChildren(new Option(`自动（${defaultWorkerCount()}）`, '0'));
  for (let i = 1; i <= Math.max(2, Math.min(12, cores)); i += 1) sel.appendChild(new Option(String(i), String(i)));
  sel.value = String(s.workers);
  $('ex-quality').disabled = s.exportFormat === 'png';
  updateExportSummary();
  $('dlg-export').showModal();
}

let exportState = null;

function showProgress(state) {
  const { done, total, failed, elapsed } = state;
  $('pg-fill').style.width = `${total ? (done / total) * 100 : 0}%`;
  $('pg-line').textContent = `已完成 ${done} / ${total}${failed ? ` · 失败 ${failed}` : ''}`;
  const rate = elapsed > 0.5 ? done / elapsed : 0;
  const remain = rate > 0 ? (total - done) / rate : 0;
  $('pg-sub').textContent = rate ? `${rate.toFixed(1)} 张/秒 · 预计剩余 ${formatDuration(remain)}` : '准备中…';
  setStatus(`导出 ${done} / ${total}`, total ? done / total : 0);
}

function formatDuration(sec) {
  if (!Number.isFinite(sec)) return '—';
  const s = Math.round(sec);
  if (s < 60) return `${s} 秒`;
  return `${Math.floor(s / 60)} 分 ${String(s % 60).padStart(2, '0')} 秒`;
}

async function startExport(items, dirHandle) {
  const s = app.settings;
  app.busy = true;
  ensurePool();
  const dlg = $('dlg-progress');
  exportState = { cancelled: false };
  items.forEach((it) => { it.exportState = ''; });
  items.forEach(updateCard);
  $('pg-title').textContent = '正在导出…';
  $('pg-errors').hidden = true;
  ['btn-pg-reveal', 'btn-pg-retry', 'btn-pg-close'].forEach((id) => { $(id).hidden = true; });
  $('btn-pg-cancel').hidden = false;
  $('btn-pg-cancel').disabled = false;
  $('pg-line').textContent = '准备中…';
  $('pg-sub').textContent = '';
  $('pg-fill').style.width = '0%';
  if (!dlg.open) dlg.showModal();

  let result;
  try {
    if (app.resolver.busy) {
      $('pg-line').textContent = '等待地名解析完成…';
      await app.resolver.idle();
    }
    result = await runExport(app, {
      items,
      mode: s.exportMode,
      dirHandle,
      scale: s.exportScale,
      format: s.exportFormat,
      quality: s.exportQuality / 100,
      pattern: s.namePattern,
      maxSide: s.maxSide,
      onProgress: showProgress,
      isCancelled: () => exportState.cancelled
    });
  } catch (err) {
    result = { ok: 0, failed: [{ item: { name: '（导出）' }, error: err.message }], cancelled: false, where: '', fallbackMaps: 0 };
  }

  app.busy = false;
  exportState.result = result;
  exportState.items = items;
  const total = items.length;
  $('pg-title').textContent = result.cancelled ? '已取消' : result.failed.length ? '导出完成（部分失败）' : '导出完成';
  $('pg-line').textContent = `成功 ${result.ok} / ${total}${result.failed.length ? ` · 失败 ${result.failed.length}` : ''}`;
  const notes = [];
  if (result.where) notes.push(`输出位置：${result.where}`);
  if (result.fallbackMaps) notes.push(`${result.fallbackMaps} 张因地图不可用使用了简约底图`);
  $('pg-sub').textContent = notes.join(' · ');
  if (result.failed.length) {
    const ul = $('pg-errors');
    ul.replaceChildren(...result.failed.slice(0, 200).map((f) => {
      const li = document.createElement('li');
      li.textContent = `${f.item.name}：${f.error}`;
      return li;
    }));
    ul.hidden = false;
    $('btn-pg-retry').hidden = false;
  }
  $('btn-pg-reveal').hidden = !(s.exportMode === 'folder' && result.dir);
  $('btn-pg-cancel').hidden = true;
  $('btn-pg-close').hidden = false;
  setStatus(`导出完成：成功 ${result.ok}，失败 ${result.failed.length}`);
  app.items.forEach(updateCard);
}

/* ------------------------------------------------------------------ */
/* 设置对话框                                                           */
/* ------------------------------------------------------------------ */

async function openSettings() {
  app.config = await api.getConfig();
  const c = app.config;
  $('cfg-map').value = c.mapProvider;
  $('cfg-token').value = '';
  $('cfg-token').placeholder = c.hasMapboxToken ? '已保存（留空保持不变）' : 'pk.…';
  $('cfg-tile-light').value = c.tileUrlLight || '';
  $('cfg-tile-dark').value = c.tileUrlDark || '';
  $('cfg-tile-scale').value = String(c.customTileScale || 1);
  $('cfg-geocoder').value = c.geocoder;
  $('cfg-outdir').value = c.outputDir;
  syncSettingsDialog();
  $('dlg-settings').showModal();
}

function syncSettingsDialog() {
  const custom = $('cfg-map').value === 'custom';
  document.querySelectorAll('[data-custom]').forEach((el) => { el.hidden = !custom; });
  const notes = [];
  if ($('cfg-geocoder').value !== 'mapbox' && !(app.config && app.config.hasMapboxToken && $('cfg-geocoder').value === 'auto')) {
    notes.push('Nominatim 限速 1 次/秒：按 ~1 km 网格合并请求并缓存，上千张同城照片只需极少请求。');
    notes.push('注意：OpenStreetMap 在中国大陆 / 日本常只给出区县（如 Xihu District），要城市级名称请配置 Mapbox token，或手动改地名后“应用到已勾选”。');
  }
  notes.push('底图瓦片与地名缓存在 ~/.geophotograph/cache，离线可复用。');
  $('cfg-note').textContent = notes.join(' ');
}

async function saveSettingsDialog() {
  const patch = {
    mapProvider: $('cfg-map').value,
    geocoder: $('cfg-geocoder').value,
    tileUrlLight: $('cfg-tile-light').value,
    tileUrlDark: $('cfg-tile-dark').value,
    customTileScale: Number($('cfg-tile-scale').value),
    outputDir: $('cfg-outdir').value
  };
  if ($('cfg-token').value.trim()) patch.mapboxToken = $('cfg-token').value.trim();
  try {
    app.config = await api.saveConfig(patch);
    app.resolver.clearCache();
    app.preview.maps.clear();
    $('dlg-settings').close();
    toast('设置已保存');
    app.preview.schedule(0);
    resolveAll((it) => it.placeStatus !== 'ok' || !it.placeManual);
  } catch (e) {
    toast(`保存失败：${e.message}`);
  }
}

/* ------------------------------------------------------------------ */
/* 事件                                                                 */
/* ------------------------------------------------------------------ */

function bindSlider(id, apply) {
  const el = $(id);
  el.addEventListener('input', () => {
    apply(Number(el.value));
    $(`${id}-out`).textContent = el.value;
  });
}

function buildSwatches() {
  const all = THEMES.concat([{ id: CUSTOM_ID, name: '自定义', tint: DEFAULT_CUSTOM_HEX }]);
  $('swatches').replaceChildren(
    ...all.map((t) => {
      const b = document.createElement('button');
      b.className = `swatch${t.id === CUSTOM_ID ? ' custom' : ''}`;
      b.dataset.id = t.id;
      b.title = t.name;
      if (t.id !== CUSTOM_ID) b.style.background = t.tint;
      return b;
    })
  );
}

function setCustomColor(hex) {
  const parsed = parseHex(hex);
  if (!parsed) return false;
  app.settings.customHex = parsed;
  app.settings.mapColorId = CUSTOM_ID;
  $('custom-picker').value = parsed.toLowerCase();
  persist();
  app.preview.maps.clear();
  app.preview.schedule(30);
  return true;
}

function bindEvents() {
  const s = app.settings;

  /* 导入 */
  $('btn-add').onclick = () => $('file-input').click();
  $('btn-add-folder').onclick = () => $('folder-input').click();
  $('file-input').onchange = async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    await addFiles(files.filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name)));
  };
  $('folder-input').onchange = async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    await addFiles(files.filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|tiff?|avif)$/i.test(f.name)));
  };
  $('btn-clear').onclick = clearAll;

  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => {
    if (![...(e.dataTransfer.types || [])].includes('Files')) return;
    dragDepth += 1;
    $('drop-overlay').hidden = false;
  });
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) $('drop-overlay').hidden = true;
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragDepth = 0;
    $('drop-overlay').hidden = true;
    setStatus('正在扫描拖入的文件…');
    await addFiles(await collectFromDrop(e.dataTransfer));
  });

  /* 列表 */
  $('grid').addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    const item = byId.get(Number(card.dataset.id));
    if (!item) return;
    if (e.target.closest('.chk')) {
      if (e.shiftKey && lastToggled && lastToggled !== item) {
        const a = app.view.indexOf(lastToggled);
        const b = app.view.indexOf(item);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        for (let i = lo; i <= hi; i += 1) app.view[i].selected = lastToggled.selected;
        app.view.slice(lo, hi + 1).forEach(updateCard);
      } else {
        item.selected = !item.selected;
        updateCard(item);
      }
      lastToggled = item;
      refreshCounts();
      return;
    }
    if (e.altKey) return removeItem(item);
    setCurrent(item);
  });
  let lastToggled = null;
  $('chk-all').onchange = (e) => {
    const on = e.target.checked;
    app.view.forEach((it) => { it.selected = on; updateCard(it); });
    refreshCounts();
  };
  $('sort-select').onchange = refreshList;
  $('chk-noloc').onchange = refreshList;
  document.addEventListener('keydown', (e) => {
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (/INPUT|SELECT|TEXTAREA/.test(tag) || document.querySelector('dialog[open]')) return;
    if (!app.view.length) return;
    const idx = app.view.indexOf(app.current);
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (step) {
      e.preventDefault();
      const next = app.view[Math.max(0, Math.min(app.view.length - 1, idx + step))];
      setCurrent(next);
      cards.get(next.id).scrollIntoView({ block: 'nearest' });
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && app.current) {
      e.preventDefault();
      removeItem(app.current);
    } else if (e.key === ' ' && app.current) {
      e.preventDefault();
      app.current.selected = !app.current.selected;
      updateCard(app.current);
      refreshCounts();
    }
  });

  /* 模板 */
  $('cat-seg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.dataset.id === s.catId) return;
    s.catId = b.dataset.id;
    persist();
    renderCategories();
    if (s.batchMode === 'random' && app.items.length > 1) reshuffle();
  });
  $('tpl-chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (b) setTemplate(b.dataset.id);
  });
  $('mode-seg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.dataset.mode === s.batchMode) return;
    s.batchMode = b.dataset.mode;
    persist();
    syncSettingsControls();
    if (s.batchMode === 'random') reshuffle();
    else if (app.current) setTemplate(app.current.templateId);
  });
  $('btn-reshuffle').onclick = reshuffle;
  $('btn-tpl-selected').onclick = () => {
    if (!app.current) return;
    const targets = app.items.filter((i) => i.selected);
    targets.forEach((i) => { i.templateId = app.current.templateId; });
    targets.forEach(updateCard);
    toast(`已应用到 ${targets.length} 张`);
  };

  /* 地点与日期 */
  $('place-input').addEventListener('input', (e) => {
    if (!app.current) return;
    app.current.place = e.target.value;
    app.current.placeManual = true;
    app.current.locId += 1;
    updateCard(app.current);
    app.preview.schedule(200);
  });
  $('btn-place-reset').onclick = () => {
    const it = app.current;
    if (!it) return;
    if (it.lat !== null) {
      it.place = 'LOCATING…';
      app.resolver.enqueue([it]);
    } else {
      it.place = 'UNKNOWN';
      it.placeManual = false;
      app.ui.onItemChanged(it);
    }
    syncItemControls();
  };
  $('date-input').addEventListener('change', (e) => {
    const it = app.current;
    const text = formatDate(e.target.value);
    if (!it || !text) return;
    Object.assign(it, { dateText: text, dateValue: e.target.value, dateManual: true });
    app.ui.onItemChanged(it);
  });
  $('btn-date-reset').onclick = () => {
    const it = app.current;
    if (!it || !it.autoDate) return;
    Object.assign(it, { dateText: it.autoDate.text, dateValue: it.autoDate.value, dateManual: false });
    app.ui.onItemChanged(it);
  };
  $('lang-seg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.dataset.lang === s.placeLang) return;
    s.placeLang = b.dataset.lang;
    persist();
    syncSettingsControls();
    resolveAll(() => true);
  });
  $('level-seg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.dataset.level === s.placeLevel) return;
    s.placeLevel = b.dataset.level;
    persist();
    syncSettingsControls();
    resolveAll((it) => !it.placeManual);
  });
  document.querySelectorAll('[data-apply]').forEach((b) => { b.onclick = () => applySpread(b.dataset.apply); });

  /* 定位对话框 */
  $('btn-locate').onclick = () => {
    $('search-results').replaceChildren();
    $('search-empty').hidden = true;
    $('search-input').value = '';
    $('coord-input').value = '';
    $('dlg-locate').showModal();
    $('search-input').focus();
  };
  $('btn-search').onclick = runSearch;
  $('search-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } });
  $('coord-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('btn-coord-apply').click(); } });
  $('btn-locate-cancel').onclick = () => $('dlg-locate').close();
  $('btn-coord-apply').onclick = () => {
    const c = parseCoordinates($('coord-input').value);
    if (!c) return toast('无法识别坐标，格式示例：30.2741, 120.1551');
    const p = $('coord-gcj').checked ? gcj02ToWgs84(c.lat, c.lon) : c;
    applyLocation(p.lat, p.lon, '');
  };

  /* 取景 */
  const cropSlider = (id, key, scale) => bindSlider(id, (v) => app.preview.setCrop({ [key]: v / scale }));
  cropSlider('crop-zoom', 'zoom', 100);
  cropSlider('crop-x', 'x', 100);
  cropSlider('crop-y', 'y', 100);
  $('btn-crop-reset').onclick = () => {
    if (!app.current) return;
    delete app.current.crops[app.current.templateId];
    syncCrop();
    app.preview.schedule(0);
  };

  /* 地图 / 配色 */
  bindSlider('map-zoom', (v) => { s.zoom = v; persist(); app.preview.schedule(120); });
  $('swatches').addEventListener('click', (e) => {
    const b = e.target.closest('.swatch');
    if (!b) return;
    s.mapColorId = b.dataset.id;
    persist();
    syncSettingsControls();
    app.preview.maps.clear();
    app.preview.schedule(0);
  });
  $('custom-picker').addEventListener('input', (e) => {
    if (setCustomColor(e.target.value)) { $('custom-hex').value = s.customHex; syncSettingsControls(); }
  });
  $('custom-hex').addEventListener('input', (e) => {
    if (setCustomColor(e.target.value)) syncSettingsControls();
  });

  /* 不透明度 */
  bindSlider('op-map', (v) => { s.mapOpacity = v; persist(); app.preview.schedule(16); });
  bindSlider('op-photo', (v) => { s.photoOpacity = v; persist(); app.preview.schedule(16); });
  bindSlider('op-text', (v) => { s.textOpacity = v; persist(); app.preview.schedule(16); });
  $('btn-opacity-reset').onclick = () => {
    Object.assign(s, { mapOpacity: 100, photoOpacity: 100, textOpacity: 100 });
    persist();
    syncSettingsControls();
    app.preview.schedule(0);
  };

  /* 海报 */
  $('footer-toggle').onchange = (e) => { s.footerOn = e.target.checked; persist(); syncItemControls(); app.preview.schedule(0); };
  $('brand-name').addEventListener('input', (e) => { s.brandName = e.target.value; persist(); app.preview.schedule(120); });
  $('brand-tagline').addEventListener('input', (e) => { s.brandTagline = e.target.value; persist(); app.preview.schedule(120); });
  $('btn-logo').onclick = () => $('logo-input').click();
  $('logo-input').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 320 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * k);
    canvas.height = Math.round(bmp.height * k);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    s.logoDataUrl = canvas.toDataURL('image/png');
    persist();
    syncSettingsControls();
    app.preview.schedule(0);
  };
  $('btn-logo-clear').onclick = () => { s.logoDataUrl = ''; persist(); syncSettingsControls(); app.preview.schedule(0); };

  /* 导出 */
  $('btn-export').onclick = openExportDialog;
  ['ex-scope', 'ex-scale', 'ex-format', 'ex-mode'].forEach((id) => {
    $(id).addEventListener('change', () => {
      $('ex-quality').disabled = $('ex-format').value === 'png';
      updateExportSummary();
    });
  });
  $('ex-quality').addEventListener('input', (e) => { $('ex-quality-out').textContent = e.target.value; });
  $('btn-export-cancel').onclick = () => $('dlg-export').close();
  $('btn-export-go').onclick = async () => {
    Object.assign(s, {
      scope: $('ex-scope').value,
      exportMode: $('ex-mode').value,
      exportFormat: $('ex-format').value,
      exportScale: Number($('ex-scale').value),
      exportQuality: Number($('ex-quality').value),
      namePattern: $('ex-pattern').value.trim() || '{name}_geo',
      maxSide: Number($('ex-maxside').value),
      workers: Number($('ex-workers').value)
    });
    persist();
    syncItemControls();
    const items = exportItems(s.scope);
    let dirHandle = null;
    if (s.exportMode === 'fsa') {
      try {
        dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      } catch (e) {
        return;
      }
    }
    $('dlg-export').close();
    await startExport(items, dirHandle);
  };
  $('btn-pg-cancel').onclick = () => {
    if (!exportState) return;
    exportState.cancelled = true;
    $('btn-pg-cancel').disabled = true;
    $('pg-title').textContent = '正在取消…';
  };
  $('btn-pg-close').onclick = () => $('dlg-progress').close();
  $('dlg-progress').addEventListener('cancel', (e) => e.preventDefault());
  $('btn-pg-reveal').onclick = () => exportState && exportState.result && api.revealFolder(exportState.result.dir).catch((err) => toast(err.message));
  $('btn-pg-retry').onclick = async () => {
    const failed = exportState.result.failed.map((f) => f.item).filter((it) => it.file);
    if (!failed.length) return;
    let dirHandle = null;
    if (s.exportMode === 'fsa') {
      try { dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' }); } catch (e) { return; }
    }
    await startExport(failed, dirHandle);
  };

  /* 设置 */
  $('btn-settings').onclick = openSettings;
  $('cfg-map').onchange = syncSettingsDialog;
  $('cfg-geocoder').onchange = syncSettingsDialog;
  $('btn-cfg-cancel').onclick = () => $('dlg-settings').close();
  $('btn-cfg-save').onclick = saveSettingsDialog;
}

/* ------------------------------------------------------------------ */
/* 启动                                                                 */
/* ------------------------------------------------------------------ */

async function init() {
  thumbObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        thumbObserver.unobserve(e.target);
        const item = byId.get(Number(e.target.dataset.id));
        if (item) requestThumb(item);
      });
    },
    { root: $('grid'), rootMargin: '400px' }
  );

  app.resolver = new PlaceResolver(app);
  app.preview = new Preview(app, $('preview'), $('preview-wrap'));
  ensurePool();
  buildSwatches();
  renderCategories();
  syncSettingsControls();
  syncItemControls();
  bindEvents();
  refreshList();
  app.preview.schedule(0);
  try {
    app.config = await api.getConfig();
    app.preview.maps.clear();
    app.preview.schedule(0);
  } catch (e) {
    setStatus('无法连接本地服务，请确认 npm start 正在运行');
  }
  await nextFrame();
}

init();
