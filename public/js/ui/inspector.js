/**
 * inspector.js：右侧检查器。照片（地点 / 日期 / 批量应用 / 取景）、样式（配色 / 地图 / 不透明度 / 文字格式）、
 * 品牌（底栏 / 标语）三个标签页。
 */
import { THEMES, CUSTOM_ID, DEFAULT_CUSTOM_HEX, parseHex, resolveTheme } from '../lib/themes.js';
import { CROP_REGIONS, DEFAULT_CROP, POSTER_W, posterHeight } from '../lib/posters.js';
import { DATE_FORMATS, formatCoordText } from '../lib/formats.js';
import { formatDate } from '../lib/exif.js';
import { $, el, icon, setSeg, segValue, onSeg, paintRange, setRange } from './dom.js';

const ZOOM_LABELS = [[5, '国家'], [7, '省 / 州'], [9, '都市圈'], [11, '城市'], [13, '城区'], [15, '街区'], [99, '街道']];
const zoomLabel = (z) => ZOOM_LABELS.find(([max]) => z <= max)[1];
const isDefaultCrop = (c) => !c || (c.zoom === 1 && !c.x && !c.y);
const focused = (node) => document.activeElement === node;

/**
 * @param app
 * @param actions {
 *   itemEdited(item, {delay?}), applySpread(kind, scope), openLocate(), relocalize(),
 *   styleChanged({delay?}), footerChanged()
 * }
 */
export function createInspector(app, actions) {
  const s = app.settings;

  /* ---------------------------- 同步 ---------------------------- */

  function pill(node, state) {
    node.hidden = !state;
    if (!state) return;
    node.className = `pill ${state[0]}`;
    node.textContent = state[1];
  }

  function syncItem() {
    const it = app.current;
    const place = $('place-input');
    const loading = !!it && it.placeStatus === 'loading';
    if (!focused(place)) place.value = it && !loading ? it.place : '';
    place.placeholder = loading ? '正在解析地名…' : '地名';
    place.disabled = !it;
    pill(
      $('place-status'),
      !it ? null
        : loading ? ['busy', '解析中']
          : it.placeManual ? ['manual', '手动']
            : it.lat === null ? ['warn', '无定位']
              : it.placeStatus === 'fail' ? ['warn', '未解析']
                : null
    );
    const hasLoc = !!it && it.lat !== null;
    const coord = $('coord-text');
    coord.textContent = hasLoc ? formatCoordText(it.lat, it.lon, s.coordFormat) : it ? '照片里没有位置信息' : '—';
    coord.classList.toggle('none', !!it && !hasLoc);
    coord.title = hasLoc ? `${it.lat.toFixed(6)}, ${it.lon.toFixed(6)}${it.locManual ? '（手动定位）' : ''}` : '';
    $('btn-locate').disabled = !it;
    $('btn-place-reset').disabled = !it || (!it.placeManual && it.placeStatus !== 'fail');

    const date = $('date-input');
    if (!focused(date)) date.value = it ? it.dateValue : '';
    date.disabled = !it;
    pill(
      $('date-status'),
      !it ? null : it.dateManual ? ['manual', '手动'] : it.autoDate && !it.autoDate.fromExif ? ['warn', '文件日期'] : null
    );
    $('btn-date-reset').disabled = !it || !it.dateManual;

    const meta = [];
    if (it && it.camera) meta.push(['camera', it.camera]);
    if (it && it.clock) meta.push(['clock', it.clock]);
    if (it && it.exposure) meta.push(['aperture', it.exposure]);
    if (it && it.locManual) meta.push(['target', '手动定位']);
    $('exif-meta').innerHTML = '';
    meta.forEach(([name, text]) => {
      const span = el('span');
      span.innerHTML = icon(name);
      span.append(text);
      $('exif-meta').appendChild(span);
    });

    const none = !app.items.length;
    document.querySelectorAll('[data-apply]').forEach((b) => { b.disabled = none || !it; });
    syncCrop();
  }

  function syncCrop() {
    const it = app.current;
    const enabled = !!it && !!CROP_REGIONS[it.templateId];
    const crop = (it && it.crops[it.templateId]) || DEFAULT_CROP;
    const vals = { 'crop-zoom': Math.round(crop.zoom * 100), 'crop-x': Math.round(crop.x * 100), 'crop-y': Math.round(crop.y * 100) };
    Object.entries(vals).forEach(([id, v]) => {
      setRange($(id), v);
      $(id).disabled = !enabled;
      $(`${id}-out`).textContent = id === 'crop-zoom' ? `${(v / 100).toFixed(2)}×` : String(v);
    });
    $('btn-crop-reset').disabled = !enabled || isDefaultCrop(crop);
    $('crop-note').hidden = !it || enabled;
    $('crop-group').classList.toggle('off', !enabled);
    $('preview-hint').textContent = enabled ? '拖动照片调整取景 · 滚轮或双指缩放 · 双击复位' : '';
  }

  function syncSettings() {
    setSeg($('lang-seg'), s.placeLang, 'lang');
    setSeg($('level-seg'), s.placeLevel, 'level');

    const theme = resolveTheme(s.mapColorId, s.customHex);
    $('swatches').querySelectorAll('.swatch').forEach((b) => {
      b.classList.toggle('active', b.dataset.id === s.mapColorId);
      if (b.dataset.id === CUSTOM_ID) b.style.setProperty('--custom', s.customHex);
    });
    $('theme-name').textContent = `${theme.name}${theme.dark ? ' · 深色' : ''}`;
    $('custom-color').hidden = s.mapColorId !== CUSTOM_ID;
    $('custom-picker').value = s.customHex.toLowerCase();
    if (!focused($('custom-hex'))) $('custom-hex').value = s.customHex;

    setRange($('map-zoom'), s.zoom);
    $('map-zoom-out').textContent = String(s.zoom);
    $('map-zoom-label').textContent = zoomLabel(s.zoom);
    [['op-map', s.mapOpacity], ['op-photo', s.photoOpacity], ['op-text', s.textOpacity]].forEach(([id, v]) => {
      setRange($(id), v);
      $(`${id}-out`).textContent = String(v);
    });
    $('btn-opacity-reset').disabled = s.mapOpacity === 100 && s.photoOpacity === 100 && s.textOpacity === 100;

    $('date-format').value = s.dateFormat;
    setSeg($('coord-format'), s.coordFormat);

    $('footer-toggle').checked = s.footerOn;
    ['brand-name', 'brand-tagline'].forEach((id) => { $(id).disabled = !s.footerOn; });
    if (!focused($('brand-name'))) $('brand-name').value = s.brandName;
    if (!focused($('brand-tagline'))) $('brand-tagline').value = s.brandTagline;
    const thumb = $('logo-thumb');
    thumb.classList.toggle('has', !!s.logoDataUrl);
    thumb.style.backgroundImage = s.logoDataUrl ? `url("${s.logoDataUrl}")` : '';
    $('btn-logo-clear').hidden = !s.logoDataUrl;

    $('slogan-toggle').checked = s.sloganOn !== false;
    $('slogan-input').disabled = s.sloganOn === false;
    if (!focused($('slogan-input'))) $('slogan-input').value = s.slogan || '';

    syncExportSize();
    syncTab();
  }

  function syncExportSize() {
    const scale = s.exportScale;
    $('export-size').textContent = `导出 ${POSTER_W * scale} × ${Math.round(posterHeight(s.footerOn) * scale)} px · ${s.exportFormat === 'png' ? 'PNG' : 'JPEG'}`;
  }

  function syncTab() {
    const tab = ['photo', 'style', 'brand'].includes(s.inspectorTab) ? s.inspectorTab : 'photo';
    setSeg($('insp-tabs'), tab, 'tab');
    document.querySelectorAll('.tab-panel').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
  }

  /* ---------------------------- 构建 ---------------------------- */

  function buildSwatches() {
    const all = THEMES.concat([{ id: CUSTOM_ID, name: '自定义', tint: DEFAULT_CUSTOM_HEX }]);
    $('swatches').replaceChildren(
      ...all.map((t) => {
        const b = el('button', `swatch${t.id === CUSTOM_ID ? ' custom' : ''}${t.dark ? ' dark' : ''}`);
        b.dataset.id = t.id;
        b.title = t.name;
        b.setAttribute('aria-label', t.name);
        if (t.id !== CUSTOM_ID) b.style.background = t.tint;
        return b;
      })
    );
  }

  function buildDateFormats() {
    $('date-format').replaceChildren(...DATE_FORMATS.map((f) => new Option(f.name, f.id)));
  }

  /* ---------------------------- 事件 ---------------------------- */

  const edited = (it, opts) => actions.itemEdited(it, opts);
  const styleChanged = (opts) => {
    app.persist();
    syncSettings();
    actions.styleChanged(opts);
  };

  function bindSlider(id, apply) {
    const input = $(id);
    input.addEventListener('input', () => {
      paintRange(input);
      apply(Number(input.value));
    });
  }

  function setCustomColor(hex) {
    const parsed = parseHex(hex);
    if (!parsed) return false;
    s.customHex = parsed;
    s.mapColorId = CUSTOM_ID;
    styleChanged({ delay: 30 });
    return true;
  }

  function bind() {
    onSeg($('insp-tabs'), (tab) => {
      s.inspectorTab = tab;
      app.persist();
      syncTab();
    }, 'tab');

    /* 地点 */
    $('place-input').addEventListener('input', (e) => {
      const it = app.current;
      if (!it) return;
      it.place = e.target.value;
      it.placeManual = true;
      it.placeStatus = 'ok';
      it.locId += 1;
      edited(it, { delay: 180 });
    });
    $('place-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') e.target.blur();
    });
    $('btn-place-reset').onclick = () => {
      const it = app.current;
      if (!it) return;
      it.placeManual = false;
      if (it.lat !== null) {
        it.place = 'LOCATING…';
        it.placeStatus = 'loading';
        app.resolver.enqueue([it]);
      } else {
        it.place = 'UNKNOWN';
        it.placeStatus = 'none';
      }
      edited(it);
    };
    $('btn-locate').onclick = () => actions.openLocate();
    onSeg($('lang-seg'), (v) => {
      if (v === s.placeLang) return;
      s.placeLang = v;
      app.persist();
      syncSettings();
      actions.relocalize();
    }, 'lang');
    onSeg($('level-seg'), (v) => {
      if (v === s.placeLevel) return;
      s.placeLevel = v;
      app.persist();
      syncSettings();
      actions.relocalize();
    }, 'level');

    /* 日期 */
    $('date-input').addEventListener('change', (e) => {
      const it = app.current;
      const text = formatDate(e.target.value);
      if (!it || !text) return;
      Object.assign(it, { dateText: text, dateValue: e.target.value, dateManual: true });
      edited(it);
    });
    $('btn-date-reset').onclick = () => {
      const it = app.current;
      if (!it || !it.autoDate) return;
      Object.assign(it, { dateText: it.autoDate.text, dateValue: it.autoDate.value, dateManual: false });
      edited(it);
    };

    /* 批量应用 */
    onSeg($('apply-scope'), (v) => setSeg($('apply-scope'), v));
    setSeg($('apply-scope'), 'selected');
    document.querySelectorAll('[data-apply]').forEach((b) => {
      b.onclick = () => actions.applySpread(b.dataset.apply, segValue($('apply-scope')) || 'selected');
    });

    /* 取景 */
    bindSlider('crop-zoom', (v) => app.preview.setCrop({ zoom: v / 100 }));
    bindSlider('crop-x', (v) => app.preview.setCrop({ x: v / 100 }));
    bindSlider('crop-y', (v) => app.preview.setCrop({ y: v / 100 }));
    $('btn-crop-reset').onclick = () => app.preview.resetCrop();

    /* 配色 */
    $('swatches').addEventListener('click', (e) => {
      const b = e.target.closest('.swatch');
      if (!b || b.dataset.id === s.mapColorId) return;
      s.mapColorId = b.dataset.id;
      styleChanged({ delay: 0 });
    });
    $('custom-picker').addEventListener('input', (e) => setCustomColor(e.target.value));
    $('custom-hex').addEventListener('input', (e) => setCustomColor(e.target.value));
    $('custom-hex').addEventListener('blur', (e) => { e.target.value = s.customHex; });

    /* 地图 / 不透明度 */
    bindSlider('map-zoom', (v) => {
      s.zoom = v;
      styleChanged({ delay: 160 });
    });
    const opacity = (key) => (v) => {
      s[key] = v;
      styleChanged({ delay: 16 });
    };
    bindSlider('op-map', opacity('mapOpacity'));
    bindSlider('op-photo', opacity('photoOpacity'));
    bindSlider('op-text', opacity('textOpacity'));
    $('btn-opacity-reset').onclick = () => {
      Object.assign(s, { mapOpacity: 100, photoOpacity: 100, textOpacity: 100 });
      styleChanged({ delay: 0 });
    };

    /* 文字格式 */
    $('date-format').onchange = (e) => {
      s.dateFormat = e.target.value;
      styleChanged({ delay: 0 });
    };
    onSeg($('coord-format'), (v) => {
      if (v === s.coordFormat) return;
      s.coordFormat = v;
      styleChanged({ delay: 0 });
      syncItem();
    });

    /* 品牌底栏 */
    $('footer-toggle').onchange = (e) => {
      s.footerOn = e.target.checked;
      app.persist();
      syncSettings();
      actions.footerChanged();
    };
    $('brand-name').addEventListener('input', (e) => {
      s.brandName = e.target.value;
      styleChanged({ delay: 150 });
    });
    $('brand-tagline').addEventListener('input', (e) => {
      s.brandTagline = e.target.value;
      styleChanged({ delay: 150 });
    });
    $('btn-logo').onclick = () => $('logo-input').click();
    $('logo-thumb').onclick = () => $('logo-input').click();
    $('logo-input').onchange = async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const bmp = await createImageBitmap(file);
        const k = Math.min(1, 320 / Math.max(bmp.width, bmp.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bmp.width * k));
        canvas.height = Math.max(1, Math.round(bmp.height * k));
        canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
        bmp.close();
        s.logoDataUrl = canvas.toDataURL('image/png');
        if (!s.footerOn) {
          s.footerOn = true;
          app.persist();
          syncSettings();
          actions.footerChanged();
          return;
        }
        styleChanged({ delay: 0 });
      } catch (err) {
        actions.notify('无法读取这张图片');
      }
    };
    $('btn-logo-clear').onclick = () => {
      s.logoDataUrl = '';
      styleChanged({ delay: 0 });
    };

    /* 标语 */
    $('slogan-toggle').onchange = (e) => {
      s.sloganOn = e.target.checked;
      styleChanged({ delay: 0 });
    };
    $('slogan-input').addEventListener('input', (e) => {
      s.slogan = e.target.value;
      styleChanged({ delay: 150 });
    });
  }

  buildSwatches();
  buildDateFormats();
  bind();
  syncSettings();
  syncItem();

  return { syncItem, syncCrop, syncSettings, syncExportSize };
}
