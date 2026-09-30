/**
 * app.js：界面装配。状态集中在 app 对象；各区域界面在 ui/ 下，绘制、导入、导出在各自模块中。
 */
import { TEMPLATES, CATEGORIES, templatesOf } from './lib/posters.js';
import { pickRandomTemplates } from './lib/batch.js';
import { tileInfo } from './lib/providers.js';
import { RenderPool, defaultWorkerCount } from './pool.js';
import { Preview } from './preview.js';
import { loadSettings, saveSettings, isImageFile } from './store.js';
import { importFiles, collectFromDrop, PlaceResolver } from './importer.js';
import { forgetSource } from './source.js';
import { createSampleItem, SAMPLE_PLACE } from './sample.js';
import * as edits from './edits.js';
import * as api from './api.js';
import { $, toast, initToast, initDialogs, setSeg, onSeg } from './ui/dom.js';
import { Library } from './ui/library.js';
import { TemplateDock } from './ui/dock.js';
import { createInspector } from './ui/inspector.js';
import { createLocate, createPlaces, createSettings, openHelp, applyAppearance, cycleAppearance } from './ui/dialogs.js';
import { createExportUI } from './ui/export-ui.js';
import { createLightbox } from './ui/lightbox.js';

const app = {
  settings: loadSettings(),
  items: [],
  current: null,
  sample: null,
  config: null,
  pool: null,
  resolver: null,
  preview: null,
  library: null,
  dock: null,
  busy: false,
  exporting: false,
  ui: {},
  tileInfo: () => tileInfo(app.config || {})
};
window.__app = app;

app.persist = () => saveSettings(app.settings);
app.track = (items) => edits.track(items, app.settings.rememberEdits);
app.redraw = (delay = 0) => {
  app.preview.schedule(delay);
  app.dock.schedule(delay + 140);
};

const tplName = (id) => (TEMPLATES.find((t) => t.id === id) || {}).name || '';
const catName = (id) => (CATEGORIES.find((c) => c.id === id) || {}).name || '';

let inspector;
let locate;
let places;
let settingsUI;
let exportUI;
let lightbox;

/* ------------------------------------------------------------------ */
/* 状态栏 / 舞台标题                                                     */
/* ------------------------------------------------------------------ */

function setStatus(text, fraction) {
  $('status-text').textContent = text;
  const on = typeof fraction === 'number';
  $('status-bar').classList.toggle('on', on);
  if (on) $('status-fill').style.width = `${Math.round(fraction * 100)}%`;
}

function syncStatusInfo() {
  const n = app.items.length;
  $('status-info').textContent = n ? `${n} 张照片 · ${app.pool ? app.pool.size : 0} 个渲染线程` : '';
}

function ensurePool() {
  const n = app.settings.workers || defaultWorkerCount();
  if (!app.pool) app.pool = new RenderPool(n);
  else if (app.pool.size !== n) app.pool.resize(n);
  syncStatusInfo();
}

function syncStage() {
  const it = app.current;
  const sample = !it || it.isSample;
  const view = app.library.view;
  const idx = sample ? -1 : view.indexOf(it);
  $('nav-index').textContent = sample ? '' : idx >= 0 ? `${idx + 1} / ${view.length}` : `– / ${view.length}`;
  $('btn-prev').disabled = sample || idx <= 0;
  $('btn-next').disabled = sample || idx < 0 || idx >= view.length - 1;
  $('photo-name').textContent = !it ? '' : sample ? '示例照片' : it.name;
  $('photo-name').title = sample ? '' : it.name;
  const meta = [];
  if (it) {
    if (it.dateValue) meta.push(`${it.dateValue}${it.clock ? ` ${it.clock}` : ''}`);
    if (it.camera) meta.push(it.camera);
    meta.push(tplName(it.templateId));
  }
  $('photo-meta').textContent = meta.join(' · ');
  $('sample-badge').hidden = !(it && it.isSample);
  ['btn-lightbox', 'btn-copy', 'btn-export-one'].forEach((id) => { $(id).disabled = !it; });
}

function syncDockTools() {
  const s = app.settings;
  const random = s.batchMode === 'random';
  setSeg($('mode-seg'), s.batchMode, 'mode');
  $('btn-reshuffle').hidden = !random;
  $('btn-reshuffle').disabled = !app.items.length;
  $('btn-tpl-selected').hidden = !random;
  $('btn-tpl-selected').disabled = !app.current || app.current.isSample || !app.items.some((it) => it.selected);
}

let placesTimer = null;
function schedulePlaces() {
  clearTimeout(placesTimer);
  placesTimer = setTimeout(() => {
    const n = places.count();
    $('places-count').textContent = String(n);
    $('places-count').hidden = !n;
    $('btn-places').disabled = !app.items.length;
  }, 250);
}

/* ------------------------------------------------------------------ */
/* 当前照片                                                             */
/* ------------------------------------------------------------------ */

function setCurrent(item, opts = {}) {
  const prev = app.current;
  const next = item || app.sample || null;
  app.current = next;
  if (prev && prev !== next) app.library.update(prev);
  if (next && !next.isSample) {
    app.library.update(next);
    if (opts.reveal !== false) app.library.reveal(next);
  }
  app.dock.ensureCategory();
  app.dock.markActive();
  app.dock.revealActive();
  inspector.syncItem();
  syncStage();
  syncDockTools();
  if (prev !== next || opts.force) app.redraw(0);
}

function move(step) {
  const view = app.library.view;
  if (!view.length) return;
  const idx = view.indexOf(app.current);
  const next = idx < 0 ? view[0] : view[Math.max(0, Math.min(view.length - 1, idx + step))];
  if (next && next !== app.current) setCurrent(next);
}

/* ------------------------------------------------------------------ */
/* 模板                                                                 */
/* ------------------------------------------------------------------ */

function templatesApplied() {
  app.library.updateAll();
  app.dock.markActive();
  app.dock.updateUses();
  inspector.syncCrop();
  syncStage();
  app.preview.schedule(0);
}

function pickTemplate(id) {
  const s = app.settings;
  const cur = app.current;
  s.templateId = id;
  if (s.batchMode === 'unique') {
    const wasManual = app.items.filter((it) => it.tplManual);
    app.items.forEach((it) => {
      it.templateId = id;
      it.tplManual = false;
    });
    if (app.sample) app.sample.templateId = id;
    app.track(wasManual);
  } else if (cur) {
    cur.templateId = id;
    cur.tplManual = !cur.isSample;
    app.track(cur);
  }
  app.persist();
  templatesApplied();
}

function stepTemplate(delta, keepFocus) {
  const list = templatesOf(app.settings.catId);
  if (!list.length) return;
  const idx = list.findIndex((t) => t.id === app.dock.activeId());
  const next = list[(idx + delta + list.length) % list.length];
  pickTemplate(next.id);
  app.dock.revealActive();
  if (keepFocus) app.dock.focusActive();
}

function reshuffle(silent) {
  const list = app.library.view.length ? app.library.view : app.items;
  if (!list.length) return;
  const ids = templatesOf(app.settings.catId).map((t) => t.id);
  pickRandomTemplates(ids, list.length).forEach((id, i) => {
    list[i].templateId = id;
    list[i].tplManual = false;
  });
  app.track(list);
  templatesApplied();
  if (!silent) toast(`已为 ${list.length} 张照片重新随机分配「${catName(app.settings.catId)}」模板`);
}

function applyTemplateToSelected() {
  const cur = app.current;
  if (!cur || cur.isSample) return;
  const targets = app.items.filter((it) => it.selected);
  if (!targets.length) return toast('请先勾选照片');
  targets.forEach((it) => {
    it.templateId = cur.templateId;
    it.tplManual = true;
  });
  app.track(targets);
  templatesApplied();
  toast(`已把「${tplName(cur.templateId)}」应用到 ${targets.length} 张照片`);
}

function onCategoryChanged() {
  if (app.settings.batchMode === 'random' && app.items.length) {
    reshuffle(true);
    toast(`已在「${catName(app.settings.catId)}」分类内重新随机分配模板`);
  }
}

/* ------------------------------------------------------------------ */
/* 导入 / 移除                                                          */
/* ------------------------------------------------------------------ */

async function addFiles(input) {
  const files = input.filter(isImageFile);
  if (!files.length) {
    setStatus('就绪');
    return toast('没有找到可导入的图片');
  }
  if (app.busy) return toast('正在导入，请稍候');
  app.busy = true;
  try {
    setStatus(`读取 ${files.length} 张照片的位置与日期…`, 0);
    const { created, skipped, restored } = await importFiles(app, files, (done, total) => setStatus(`读取照片信息 ${done} / ${total}`, done / total));
    if (!created.length) {
      setStatus('就绪');
      toast(skipped ? `这 ${skipped} 张照片已经在列表里了` : '没有新的照片');
      return;
    }
    const replaceSample = !app.current || app.current.isSample;
    app.items.push(...created);
    app.library.refresh();
    if (replaceSample) {
      const fresh = new Set(created);
      setCurrent(app.library.view.find((it) => fresh.has(it)) || created[0]);
    } else {
      syncStage();
    }
    app.resolver.enqueue(created.filter((it) => it.placeStatus === 'loading'));
    afterItemsChanged();

    const missing = created.filter((it) => it.lat === null).length;
    const parts = [`已添加 ${created.length} 张`];
    if (skipped) parts.push(`跳过重复 ${skipped} 张`);
    if (restored) parts.push(`恢复 ${restored} 张的修改`);
    if (missing) parts.push(`${missing} 张没有位置`);
    setStatus(parts.join('，'));
    if (missing) toast(`${missing} 张照片没有位置信息`, { action: '批量定位', ms: 7000, onAction: () => locate.open('noloc') });
    else if (restored) toast(`已恢复 ${restored} 张照片之前的修改`);
  } catch (e) {
    setStatus(`导入失败：${e.message}`);
  } finally {
    app.busy = false;
  }
}

function releaseItem(it) {
  if (it.thumbUrl) URL.revokeObjectURL(it.thumbUrl);
  it.thumbUrl = '';
  it.thumbState = 'idle';
  forgetSource(it);
  app.preview.releasePhoto(it);
}

function removeItems(input) {
  const list = input.filter((it) => !it.isSample);
  if (!list.length) return;
  const gone = new Set(list);
  const before = app.items.slice();
  const curIdx = app.library.view.indexOf(app.current);
  app.items = app.items.filter((it) => !gone.has(it));
  list.forEach((it) => { it.locId += 1; });
  app.library.refresh();
  if (gone.has(app.current)) {
    const v = app.library.view;
    setCurrent(v[Math.min(Math.max(curIdx, 0), v.length - 1)] || null);
  } else {
    syncStage();
  }
  afterItemsChanged();

  let undone = false;
  const timer = setTimeout(() => {
    if (!undone) list.forEach(releaseItem);
  }, 9000);
  toast(`已从列表移除 ${list.length} 张照片`, {
    action: '撤销',
    ms: 8000,
    onAction: () => {
      undone = true;
      clearTimeout(timer);
      const now = new Set(app.items);
      const prior = new Set(before);
      app.items = before.filter((it) => gone.has(it) || now.has(it)).concat(app.items.filter((it) => !prior.has(it)));
      app.library.refresh();
      app.resolver.enqueue(list.filter((it) => it.placeStatus === 'loading'));
      setCurrent(list[0]);
      afterItemsChanged();
      toast(`已恢复 ${list.length} 张照片`);
    }
  });
}

function afterItemsChanged() {
  app.library.scheduleCounts();
  app.dock.updateUses();
  inspector.syncItem();
  syncDockTools();
  syncStatusInfo();
  schedulePlaces();
}

/* ------------------------------------------------------------------ */
/* 编辑                                                                 */
/* ------------------------------------------------------------------ */

function itemEdited(it, opts = {}) {
  app.track(it);
  app.library.update(it);
  app.library.scheduleCounts();
  if (it === app.current) {
    inspector.syncItem();
    syncStage();
    app.redraw(opts.delay ?? 0);
  }
  schedulePlaces();
}

function itemsEdited(list) {
  app.track(list);
  list.forEach((it) => app.library.update(it));
  app.library.scheduleCounts();
  if (list.includes(app.current)) {
    inspector.syncItem();
    app.redraw(0);
  }
  schedulePlaces();
}

function applySpread(kind, scope) {
  const cur = app.current;
  if (!cur) return;
  const targets = (scope === 'all' ? app.items : app.items.filter((i) => i.selected)).filter((it) => it !== cur);
  if (!targets.length) return toast(scope === 'all' ? '没有其他照片' : '请先勾选要应用的照片');
  const place = (cur.place || '').trim();
  if (kind !== 'date' && (!place || cur.placeStatus === 'loading')) return toast('当前照片的地名还没有确定');
  if (kind !== 'place' && !cur.dateValue) return toast('当前照片还没有日期');
  targets.forEach((it) => {
    if (kind !== 'date') {
      it.locId += 1;
      it.place = place;
      it.placeManual = true;
      it.placeStatus = 'ok';
    }
    if (kind !== 'place') Object.assign(it, { dateText: cur.dateText, dateValue: cur.dateValue, dateManual: true });
  });
  itemsEdited(targets);
  const what = kind === 'place' ? '地名' : kind === 'date' ? '日期' : '地名和日期';
  toast(`已把${what}应用到 ${targets.length} 张照片`);
}

function relocalize() {
  const s = app.settings;
  if (app.sample) app.sample.place = SAMPLE_PLACE[s.placeLang] || SAMPLE_PLACE.en;
  app.resolver.enqueue(app.items.filter((it) => it.lat !== null && !it.placeManual));
  const manual = app.items.filter((it) => it.placeManual).length;
  if (manual) toast(`${manual} 张手动修改过地名的照片保持不变`);
  app.redraw(0);
}

function located(list) {
  app.track(list);
  const cur = app.current;
  const lib = app.library;
  const idx = lib.view.indexOf(cur);
  if (lib.filter === 'noloc') {
    lib.refresh();
    if (list.includes(cur) && lib.view.length) {
      setCurrent(lib.view[Math.min(Math.max(idx, 0), lib.view.length - 1)]);
      toast('已设置位置，已切换到下一张没有位置的照片');
      return afterItemsChanged();
    }
  } else {
    list.forEach((it) => lib.update(it));
  }
  afterItemsChanged();
  syncStage();
  app.redraw(0);
  toast(list.length > 1 ? `已为 ${list.length} 张照片设置位置` : '已设置位置');
}

function selectOnly(list, label) {
  const set = new Set(list);
  app.items.forEach((it) => { it.selected = set.has(it); });
  app.library.setFilter('checked');
  if (!set.has(app.current)) setCurrent(app.library.view[0]);
  syncDockTools();
  toast(`已只勾选「${label}」的 ${list.length} 张照片`);
}

function configSaved() {
  app.resolver.clearCache();
  app.preview.maps.clear();
  app.dock.clearMaps();
  app.redraw(0);
  app.resolver.enqueue(app.items.filter((it) => it.lat !== null && !it.placeManual));
}

/* ------------------------------------------------------------------ */
/* 模块回调（导入 / 地名解析 / 导出 / 预览使用）                           */
/* ------------------------------------------------------------------ */

app.ui.onItemChanged = (item, opts = {}) => {
  app.library.update(item);
  app.library.scheduleCounts();
  if (item === app.current) {
    inspector.syncItem();
    syncStage();
    if (opts.redraw !== false) app.redraw(40);
  }
  if (opts.redraw !== false) schedulePlaces();
};

let geoShown = false;
app.ui.onGeoProgress = (r) => {
  if (app.busy || app.exporting) return;
  if (r.busy) {
    geoShown = true;
    setStatus(`解析地名 ${r.done} / ${r.total}`, r.total ? r.done / r.total : 0);
  } else if (geoShown) {
    geoShown = false;
    setStatus('地名解析完成');
    schedulePlaces();
  }
};

app.ui.setPreviewMessage = (text) => {
  const node = $('preview-msg');
  node.textContent = text;
  node.hidden = !text;
};

app.ui.syncCrop = () => {
  inspector.syncCrop();
  const it = app.current;
  if (!it) return;
  app.track(it);
  app.dock.repaint(it.templateId);
};

/* ------------------------------------------------------------------ */
/* 事件                                                                 */
/* ------------------------------------------------------------------ */

function onCounts(n) {
  $('btn-export').disabled = !n.all || app.exporting;
  $('export-count').textContent = String(n.checked);
  $('export-count').hidden = !n.checked;
  $('btn-places').disabled = !n.all;
  syncDockTools();
}

function onKeyDown(e) {
  if (lightbox.isOpen) return lightbox.onKey(e);
  if (document.querySelector('dialog[open]')) return;
  const t = e.target instanceof Element ? e.target : null;
  const typing = t && t.closest('input, select, textarea, [contenteditable="true"]');
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  if (mod && key === 'o') {
    e.preventDefault();
    (e.shiftKey ? $('folder-input') : $('file-input')).click();
    return;
  }
  if (mod && key === 'e') {
    e.preventDefault();
    exportUI.open();
    return;
  }
  if (typing) {
    if (e.key === 'Escape') t.blur();
    return;
  }
  if (mod && key === 'a') {
    e.preventDefault();
    app.library.setAllInView(!e.shiftKey);
    return;
  }
  if (mod && key === 'c') {
    if (String(window.getSelection() || '')) return;
    e.preventDefault();
    exportUI.copy();
    return;
  }
  if (mod || e.altKey) return;
  if ((key === ' ' || key === 'Enter') && t && t.closest('button, a, summary, label')) return;

  // 焦点在模板栏里时，左右箭头切换模板（预览随之更新）；其他位置仍是切换照片
  if ((key === 'ArrowLeft' || key === 'ArrowRight') && !e.shiftKey && t && t.closest('#tpl-strip')) {
    e.preventDefault();
    stepTemplate(key === 'ArrowLeft' ? -1 : 1, true);
    return;
  }

  const cur = app.current && !app.current.isSample ? app.current : null;
  const handlers = {
    ArrowLeft: () => move(-1),
    ArrowRight: () => move(1),
    ArrowUp: () => move(-app.library.columns()),
    ArrowDown: () => move(app.library.columns()),
    '[': () => stepTemplate(-1),
    ']': () => stepTemplate(1),
    ' ': () => cur && app.library.toggle(cur),
    Enter: () => lightbox.open(),
    Delete: () => cur && removeItems([cur]),
    Backspace: () => cur && removeItems([cur]),
    l: () => app.current && locate.open(),
    '/': () => $('lib-search').focus(),
    '?': () => openHelp()
  };
  const fn = handlers[key];
  if (!fn) return;
  e.preventDefault();
  fn();
}

function bindDrop() {
  let depth = 0;
  const hasFiles = (e) => [...((e.dataTransfer && e.dataTransfer.types) || [])].includes('Files');
  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    depth += 1;
    $('drop-overlay').hidden = false;
  });
  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (!depth) $('drop-overlay').hidden = true;
  });
  window.addEventListener('dragover', (e) => {
    if (hasFiles(e)) e.preventDefault();
  });
  window.addEventListener('drop', async (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    $('drop-overlay').hidden = true;
    setStatus('正在扫描拖入的文件…');
    await addFiles(await collectFromDrop(e.dataTransfer));
  });
}

function bindControls() {
  const s = app.settings;
  const pickFiles = () => $('file-input').click();
  const pickFolder = () => $('folder-input').click();
  $('btn-add').onclick = pickFiles;
  $('btn-empty-add').onclick = pickFiles;
  $('btn-add-folder').onclick = pickFolder;
  $('btn-empty-folder').onclick = pickFolder;
  ['file-input', 'folder-input'].forEach((id) => {
    $(id).onchange = async (e) => {
      const files = [...e.target.files];
      e.target.value = '';
      await addFiles(files);
    };
  });
  $('btn-places').onclick = () => places.open();
  $('btn-help').onclick = openHelp;
  $('btn-theme').onclick = () => cycleAppearance(app);
  $('btn-settings').onclick = () => settingsUI.open();
  $('btn-export').onclick = () => exportUI.open();

  $('btn-prev').onclick = () => move(-1);
  $('btn-next').onclick = () => move(1);
  $('btn-lightbox').onclick = () => lightbox.open();
  $('btn-copy').onclick = () => exportUI.copy();
  $('btn-export-one').onclick = () => exportUI.exportOne();
  $('btn-remove').onclick = () => removeItems(app.items.filter((it) => it.selected));

  onSeg($('mode-seg'), (mode) => {
    if (mode === s.batchMode) return;
    s.batchMode = mode;
    app.persist();
    syncDockTools();
    if (mode === 'random') reshuffle(true);
    else pickTemplate(app.dock.activeId());
    toast(mode === 'random' ? '随机模板：每张照片在当前分类内随机分配不同模板' : '统一模板：全部照片使用同一个模板');
  }, 'mode');
  $('btn-reshuffle').onclick = () => reshuffle();
  $('btn-tpl-selected').onclick = applyTemplateToSelected;

  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('beforeunload', (e) => {
    edits.flush();
    if (app.exporting) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  window.addEventListener('pagehide', () => edits.flush());
}

/* ------------------------------------------------------------------ */
/* 启动                                                                 */
/* ------------------------------------------------------------------ */

async function init() {
  initToast();
  initDialogs();
  applyAppearance(app.settings.appearance);

  app.resolver = new PlaceResolver(app);
  app.preview = new Preview(app, $('preview'), $('preview-wrap'));
  ensurePool();
  app.library = new Library(app, {
    setCurrent,
    openLightbox: (it) => lightbox.open(it),
    selectionChanged: syncDockTools,
    countsChanged: onCounts,
    viewChanged: syncStage
  });
  app.dock = new TemplateDock(app, { pick: pickTemplate, categoryChanged: onCategoryChanged });
  inspector = createInspector(app, {
    itemEdited,
    applySpread,
    openLocate: () => locate.open(),
    relocalize,
    styleChanged: (opts = {}) => app.redraw(opts.delay ?? 0),
    footerChanged: () => {
      inspector.syncExportSize();
      app.preview.schedule(0);
    },
    notify: (text) => toast(text)
  });
  locate = createLocate(app, { located });
  places = createPlaces(app, { itemsEdited, selectOnly, openLocate: (scope) => locate.open(scope) });
  settingsUI = createSettings(app, {
    configSaved,
    rememberChanged: (on) => on && app.track(app.items)
  });
  exportUI = createExportUI(app, {
    ensurePool,
    setStatus,
    itemsChanged: (list) => {
      list.forEach((it) => app.library.update(it));
      app.library.scheduleCounts();
    },
    exportingChanged: (on) => {
      app.exporting = on;
      $('btn-export').disabled = on || !app.items.length;
    },
    settingsChanged: () => inspector.syncExportSize()
  });
  lightbox = createLightbox(app, { ensurePool, setCurrent, copy: (it) => exportUI.copy(it) });
  bindControls();
  bindDrop();

  app.dock.renderTabs();
  app.dock.renderStrip();
  app.library.refresh();
  syncDockTools();
  syncStage();

  try {
    app.sample = await createSampleItem(app.settings);
  } catch (e) {
    app.sample = null;
  }
  if (!app.current) setCurrent(null, { force: true });

  try {
    app.config = await api.getConfig();
    app.preview.maps.clear();
    app.dock.clearMaps();
    app.redraw(0);
  } catch (e) {
    setStatus('无法连接本地服务，请确认 npm start 正在运行');
  }
}

init();
