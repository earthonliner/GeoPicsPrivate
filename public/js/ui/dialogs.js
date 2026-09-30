/**
 * dialogs.js：定位、地点汇总、设置、快捷键帮助，以及浅色 / 深色外观切换。
 */
import { parseCoordinates, gcj02ToWgs84 } from '../lib/geo.js';
import { setLocation } from '../importer.js';
import * as edits from '../edits.js';
import * as api from '../api.js';
import { $, el, icon, setSeg, onSeg, toast, confirmDialog } from './dom.js';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/* ---------------------------- 外观 ---------------------------- */

const darkMedia = window.matchMedia('(prefers-color-scheme: dark)');
const APPEARANCE = {
  system: { icon: 'monitor', name: '跟随系统' },
  light: { icon: 'sun', name: '浅色' },
  dark: { icon: 'moon', name: '深色' }
};
let appearanceMode = 'system';

export function applyAppearance(mode) {
  appearanceMode = APPEARANCE[mode] ? mode : 'system';
  const dark = appearanceMode === 'dark' || (appearanceMode === 'system' && darkMedia.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('theme-icon').setAttribute('href', `#i-${APPEARANCE[appearanceMode].icon}`);
  $('btn-theme').title = `外观：${APPEARANCE[appearanceMode].name}（点击切换）`;
}
darkMedia.addEventListener('change', () => applyAppearance(appearanceMode));

export function cycleAppearance(app) {
  const order = ['system', 'light', 'dark'];
  const next = order[(order.indexOf(app.settings.appearance) + 1) % order.length];
  app.settings.appearance = next;
  app.persist();
  applyAppearance(next);
  toast(`外观：${APPEARANCE[next].name}`);
}

/* ---------------------------- 定位 ---------------------------- */

/**
 * @param actions { located(items) }
 */
export function createLocate(app, actions) {
  const dlg = $('dlg-locate');
  let scope = 'current';
  let results = [];
  let active = -1;
  let searchSeq = 0;
  const scopeBtn = (v) => $('loc-scope').querySelector(`[data-value="${v}"]`);

  function targets() {
    if (scope === 'selected') return app.items.filter((it) => it.selected);
    if (scope === 'noloc') return app.items.filter((it) => it.lat === null);
    return app.current ? [app.current] : [];
  }

  function syncScope() {
    const sel = app.items.filter((it) => it.selected).length;
    const noloc = app.items.filter((it) => it.lat === null).length;
    scopeBtn('selected').querySelector('b').textContent = sel ? String(sel) : '';
    scopeBtn('noloc').querySelector('b').textContent = noloc ? String(noloc) : '';
    scopeBtn('current').disabled = !app.current;
    scopeBtn('selected').disabled = !sel;
    scopeBtn('noloc').disabled = !noloc;
    if (scopeBtn(scope).disabled) scope = 'current';
    setSeg($('loc-scope'), scope);
    const n = targets().length;
    $('btn-coord-apply').textContent = n > 1 ? `使用坐标（${n} 张）` : '使用坐标';
  }

  function markActive() {
    [...$('search-results').children].forEach((li, i) => li.classList.toggle('active', i === active));
    const li = $('search-results').children[active];
    if (li) li.scrollIntoView({ block: 'nearest' });
  }

  function open(initialScope = 'current') {
    scope = initialScope;
    results = [];
    active = -1;
    $('search-results').replaceChildren();
    $('search-empty').hidden = true;
    $('search-input').value = '';
    $('coord-input').value = '';
    const it = app.current;
    $('coord-input').placeholder = it && it.lat !== null ? `${it.lat.toFixed(5)}, ${it.lon.toFixed(5)}` : '30.2741, 120.1551  或  30°16′N 120°09′E';
    syncScope();
    dlg.showModal();
    $('search-input').focus();
  }

  function apply(lat, lon, name) {
    const list = targets();
    if (!list.length) return toast('没有可定位的照片');
    list.forEach((it) => setLocation(app, it, lat, lon, name));
    dlg.close();
    actions.located(list);
  }

  async function search() {
    const q = $('search-input').value.trim();
    if (!q) return;
    $('search-input').dataset.q = q;
    const seq = ++searchSeq;
    $('btn-search').disabled = true;
    $('search-empty').hidden = true;
    try {
      const found = await api.searchPlaces(q, app.settings.placeLang);
      if (seq !== searchSeq) return;
      results = found;
      active = found.length ? 0 : -1;
      $('search-empty').hidden = found.length > 0;
      $('search-results').replaceChildren(
        ...found.map((r, i) => {
          const li = el('li');
          li.innerHTML = icon('pin');
          const box = el('div');
          box.append(el('b', '', r.name), el('small', '', r.address || `${r.lat.toFixed(4)}, ${r.lon.toFixed(4)}`));
          li.appendChild(box);
          li.addEventListener('click', () => apply(r.lat, r.lon, r.name));
          li.addEventListener('mouseenter', () => {
            active = i;
            markActive();
          });
          return li;
        })
      );
      markActive();
    } catch (e) {
      toast(`搜索失败：${e.message}`);
    } finally {
      if (seq === searchSeq) $('btn-search').disabled = false;
    }
  }

  function applyCoords() {
    const raw = $('coord-input').value.trim() || (app.current && app.current.lat !== null ? $('coord-input').placeholder : '');
    const c = parseCoordinates(raw);
    if (!c) return toast('无法识别坐标，格式示例：30.2741, 120.1551');
    const p = $('coord-gcj').checked ? gcj02ToWgs84(c.lat, c.lon) : c;
    apply(p.lat, p.lon, '');
  }

  onSeg($('loc-scope'), (v) => {
    scope = v;
    syncScope();
  });
  $('btn-search').onclick = search;
  $('search-input').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!results.length) return;
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      markActive();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[active];
      if (r && $('search-input').dataset.q === $('search-input').value.trim()) apply(r.lat, r.lon, r.name);
      else search();
    }
  });
  $('coord-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyCoords();
    }
  });
  $('btn-coord-apply').onclick = applyCoords;

  return { open };
}

/* ---------------------------- 地点汇总 ---------------------------- */

/**
 * @param actions { itemsEdited(items), selectOnly(items, label), openLocate(scope) }
 */
export function createPlaces(app, actions) {
  const dlg = $('dlg-places');

  function groups() {
    const map = new Map();
    for (const it of app.items) {
      if (it.placeStatus === 'loading') continue;
      const p = (it.place || '').trim();
      if (!p || p === 'UNKNOWN') continue;
      if (!map.has(p)) map.set(p, []);
      map.get(p).push(it);
    }
    return [...map].sort((a, b) => b[1].length - a[1].length || collator.compare(a[0], b[0]));
  }

  function rename(old, items, value) {
    const name = value.trim();
    if (!name || name === old) return render();
    items.forEach((it) => {
      it.locId += 1;
      it.place = name;
      it.placeManual = true;
      it.placeStatus = 'ok';
    });
    actions.itemsEdited(items);
    toast(`已把 ${items.length} 张照片的地名改为「${name}」`);
    render();
  }

  function render() {
    const rows = groups().map(([place, items]) => {
      const row = el('div', 'place-row');
      const input = el('input');
      input.type = 'text';
      input.value = place;
      input.spellcheck = false;
      input.title = '修改后按回车，应用到这些照片';
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
        else if (e.key === 'Escape') {
          e.preventDefault();
          input.value = place;
          input.blur();
        }
      });
      input.addEventListener('change', () => rename(place, items, input.value));
      const pick = el('button', 'btn sm', '只勾选这些');
      pick.onclick = () => {
        dlg.close();
        actions.selectOnly(items, place);
      };
      row.append(input, el('span', 'n', `${items.length} 张`), pick);
      return row;
    });
    $('places-list').replaceChildren(...rows);
    const noloc = app.items.filter((it) => it.lat === null).length;
    $('places-noloc').hidden = !noloc;
    $('places-noloc-text').textContent = `${noloc} 张照片没有位置信息`;
  }

  $('btn-places-locate').onclick = () => {
    dlg.close();
    actions.openLocate('noloc');
  };

  return {
    open() {
      render();
      dlg.showModal();
    },
    /** 不同地名的数量（工具栏角标） */
    count() {
      const set = new Set();
      for (const it of app.items) if (it.placeStatus !== 'loading' && it.place && it.place !== 'UNKNOWN') set.add(it.place.trim());
      return set.size;
    }
  };
}

/* ---------------------------- 设置 ---------------------------- */

/**
 * @param actions { configSaved(), rememberChanged(on) }
 */
export function createSettings(app, actions) {
  const dlg = $('dlg-settings');
  const s = app.settings;

  function syncNotes() {
    const custom = $('cfg-map').value === 'custom';
    document.querySelectorAll('[data-custom]').forEach((node) => { node.hidden = !custom; });
    const geocoder = $('cfg-geocoder').value;
    const mapbox = geocoder === 'mapbox' || (geocoder === 'auto' && app.config && app.config.hasMapboxToken);
    const notes = [];
    if (!mapbox) {
      notes.push('Nominatim 限速 1 次/秒：按约 1 km 网格合并请求并缓存，上千张同城照片只需极少请求。');
      notes.push('OpenStreetMap 在中国大陆 / 日本常只给出区县名，要城市级名称可配置 Mapbox token，或在「地点」里批量改名。');
    }
    notes.push('底图瓦片与地名缓存在 ~/.geophotograph/cache，离线可复用。');
    $('cfg-note').textContent = notes.join(' ');
  }

  function syncEditsCount() {
    const n = edits.count();
    $('cfg-edits-count').textContent = n ? `已为 ${n} 张照片保存修改` : '还没有保存的修改';
    $('btn-clear-edits').disabled = !n;
  }

  async function open() {
    try {
      app.config = await api.getConfig();
    } catch (e) {
      toast('无法读取设置：请确认 npm start 正在运行');
      return;
    }
    const c = app.config;
    $('cfg-map').value = c.mapProvider;
    $('cfg-token').value = '';
    $('cfg-token').placeholder = c.hasMapboxToken ? '已保存（留空保持不变）' : 'pk.…';
    $('cfg-tile-light').value = c.tileUrlLight || '';
    $('cfg-tile-dark').value = c.tileUrlDark || '';
    $('cfg-tile-scale').value = String(c.customTileScale || 1);
    $('cfg-geocoder').value = c.geocoder;
    $('cfg-outdir').value = c.outputDir;
    setSeg($('cfg-appearance'), s.appearance);
    $('cfg-remember').checked = s.rememberEdits;
    syncEditsCount();
    syncNotes();
    dlg.showModal();
  }

  async function save() {
    const patch = {
      mapProvider: $('cfg-map').value,
      geocoder: $('cfg-geocoder').value,
      tileUrlLight: $('cfg-tile-light').value.trim(),
      tileUrlDark: $('cfg-tile-dark').value.trim(),
      customTileScale: Number($('cfg-tile-scale').value),
      outputDir: $('cfg-outdir').value.trim()
    };
    if ($('cfg-token').value.trim()) patch.mapboxToken = $('cfg-token').value.trim();
    $('btn-cfg-save').disabled = true;
    try {
      app.config = await api.saveConfig(patch);
      dlg.close();
      toast('设置已保存');
      actions.configSaved();
    } catch (e) {
      toast(`保存失败：${e.message}`);
    } finally {
      $('btn-cfg-save').disabled = false;
    }
  }

  onSeg($('cfg-appearance'), (v) => {
    s.appearance = v;
    app.persist();
    setSeg($('cfg-appearance'), v);
    applyAppearance(v);
  });
  $('cfg-remember').onchange = (e) => {
    s.rememberEdits = e.target.checked;
    app.persist();
    actions.rememberChanged(s.rememberEdits);
    syncEditsCount();
  };
  $('btn-clear-edits').onclick = async () => {
    const n = edits.count();
    const ok = await confirmDialog({ title: `清除 ${n} 张照片的已保存修改？`, text: '当前列表中的修改不受影响；只是下次导入时不再自动恢复。', ok: '清除', danger: true });
    if (!ok) return;
    edits.clearAll();
    syncEditsCount();
    toast('已清除保存的修改');
  };
  $('cfg-map').onchange = syncNotes;
  $('cfg-geocoder').onchange = syncNotes;
  $('btn-cfg-cancel').onclick = () => dlg.close();
  $('btn-cfg-save').onclick = save;

  return { open };
}

export function openHelp() {
  $('dlg-help').showModal();
}
