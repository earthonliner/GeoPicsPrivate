/**
 * export-ui.js：导出对话框、进度面板、单张导出与复制到剪贴板。
 */
import { POSTER_W, posterHeight } from '../lib/posters.js';
import { renderNamePattern, baseName, formatDateForFile } from '../lib/filename.js';
import { runExport, renderOne } from '../exporter.js';
import { defaultWorkerCount } from '../pool.js';
import * as api from '../api.js';
import { $, el, setSeg, segValue, onSeg, setRange, paintRange, toast, formatDuration, download } from './dom.js';

const DEFAULT_PATTERN = '{name}_geo';

export function fileNameFor(app, item, index = 1, total = 1, opts = {}) {
  const s = app.settings;
  const pattern = (opts.pattern || s.namePattern || '').trim() || DEFAULT_PATTERN;
  const format = opts.format || s.exportFormat;
  const base = renderNamePattern(pattern, {
    name: baseName(item.name),
    place: item.place,
    date: formatDateForFile(item.dateValue),
    template: item.templateId,
    index: String(index).padStart(String(total).length, '0')
  });
  return `${base}.${format === 'png' ? 'png' : 'jpg'}`;
}

/**
 * @param actions { ensurePool(), setStatus(text, fraction), itemsChanged(items), exportingChanged(on), settingsChanged() }
 */
export function createExportUI(app, actions) {
  const s = app.settings;
  const dlg = $('dlg-export');
  const pg = $('dlg-progress');
  let job = null;
  const baseTitle = document.title;

  /* ---------------------------- 对话框 ---------------------------- */

  const scopeBtn = (v) => $('ex-scope').querySelector(`[data-value="${v}"]`);
  const modeBtn = (v) => $('ex-mode').querySelector(`[data-value="${v}"]`);

  function itemsFor(scope) {
    if (scope === 'current') return app.current && !app.current.isSample ? [app.current] : [];
    const list = app.library.sorted();
    return scope === 'all' ? list : list.filter((it) => it.selected);
  }

  function form() {
    return {
      scope: segValue($('ex-scope')) || 'all',
      exportMode: segValue($('ex-mode')) || 'folder',
      exportFormat: segValue($('ex-format')) || 'jpeg',
      exportScale: Number(segValue($('ex-scale')) || 3),
      exportQuality: Number($('ex-quality').value),
      namePattern: $('ex-pattern').value.trim() || DEFAULT_PATTERN,
      maxSide: Number($('ex-maxside').value),
      workers: Number($('ex-workers').value)
    };
  }

  function syncForm() {
    const f = form();
    const items = itemsFor(f.scope);
    $('ex-quality-row').classList.toggle('off', f.exportFormat === 'png');
    $('ex-quality').disabled = f.exportFormat === 'png';
    $('ex-quality-out').textContent = $('ex-quality').value;

    const sample = items[0] || app.items[0];
    $('ex-name-preview').textContent = sample ? fileNameFor(app, sample, 1, items.length || 1, { pattern: f.namePattern, format: f.exportFormat }) : '';

    const w = POSTER_W * f.exportScale;
    const h = Math.round(posterHeight(s.footerOn) * f.exportScale);
    const perMb = f.exportFormat === 'png' ? 0.9 * f.exportScale * f.exportScale : 0.09 * f.exportScale * f.exportScale * (0.5 + f.exportQuality / 200);
    const noLoc = items.filter((i) => i.lat === null).length;
    const parts = [`将导出 <b>${items.length}</b> 张`, `${w} × ${h} px`, `约 ${Math.max(1, Math.round(items.length * perMb))} MB`];
    if (noLoc) parts.push(`${noLoc} 张没有位置（使用简约底图）`);
    if (app.resolver.busy) parts.push('地名仍在解析，导出前会自动等待');
    $('ex-summary').innerHTML = parts.join(' · ');
    $('btn-export-go').disabled = items.length === 0;

    const cfg = app.config || {};
    $('ex-mode-note').textContent =
      f.exportMode === 'folder' ? `写入 ${cfg.outputDir || '输出目录'}/GeoPhotoGraph-时间戳/，适合成百上千张。`
        : f.exportMode === 'zip' ? '按约 400 MB 分卷打包，由浏览器下载（可能需要允许多文件下载）。'
          : '由浏览器直接写入你选择的文件夹（Chrome / Edge）。';
  }

  function open(scope) {
    if (!app.items.length) return toast('请先添加照片');
    const sel = app.items.filter((it) => it.selected).length;
    scopeBtn('selected').querySelector('b').textContent = String(sel);
    scopeBtn('all').querySelector('b').textContent = String(app.items.length);
    scopeBtn('selected').disabled = !sel;
    scopeBtn('current').disabled = !app.current || app.current.isSample;
    let pick = scope || s.scope;
    if (scopeBtn(pick).disabled) pick = sel ? 'selected' : 'all';
    setSeg($('ex-scope'), pick);

    modeBtn('fsa').hidden = !window.showDirectoryPicker;
    setSeg($('ex-mode'), s.exportMode === 'fsa' && !window.showDirectoryPicker ? 'folder' : s.exportMode);
    setSeg($('ex-format'), s.exportFormat);
    setSeg($('ex-scale'), String(s.exportScale));
    setRange($('ex-quality'), s.exportQuality);
    $('ex-pattern').value = s.namePattern;
    $('ex-maxside').value = String(s.maxSide);
    const sel2 = $('ex-workers');
    const cores = navigator.hardwareConcurrency || 4;
    sel2.replaceChildren(new Option(`自动（${defaultWorkerCount()}）`, '0'));
    for (let i = 1; i <= Math.max(2, Math.min(12, cores)); i += 1) sel2.appendChild(new Option(String(i), String(i)));
    sel2.value = String(s.workers);
    syncForm();
    dlg.showModal();
  }

  async function go() {
    const f = form();
    Object.assign(s, f);
    app.persist();
    actions.settingsChanged();
    const items = itemsFor(f.scope);
    if (!items.length) return;
    let dirHandle = null;
    if (f.exportMode === 'fsa') {
      try {
        dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      } catch (e) {
        return;
      }
    }
    dlg.close();
    await start(items, dirHandle);
  }

  /* ---------------------------- 进度 ---------------------------- */

  function setPct(fraction, cls = '') {
    const pct = Math.round(fraction * 100);
    const ring = $('pg-pct');
    ring.textContent = cls === 'done' ? '✓' : `${pct}%`;
    ring.className = `pg-pct${cls ? ` ${cls}` : ''}`;
    ring.style.setProperty('--pct', `${pct}%`);
    $('pg-fill').style.width = `${pct}%`;
  }

  function showProgress({ done, total, failed, elapsed }) {
    const fraction = total ? done / total : 0;
    setPct(fraction);
    $('pg-line').textContent = `已完成 ${done} / ${total}${failed ? ` · 失败 ${failed}` : ''}`;
    const rate = elapsed > 0.5 ? done / elapsed : 0;
    const remain = rate > 0 ? (total - done) / rate : NaN;
    $('pg-sub').textContent = rate ? `${rate.toFixed(1)} 张/秒 · 预计剩余 ${formatDuration(remain)}` : '准备中…';
    actions.setStatus(`导出 ${done} / ${total}`, fraction);
    document.title = `${Math.round(fraction * 100)}% · 导出中 · ${baseTitle}`;
  }

  async function start(items, dirHandle) {
    actions.ensurePool();
    job = { cancelled: false, items, dirHandle };
    actions.exportingChanged(true);
    items.forEach((it) => { it.exportState = ''; });
    actions.itemsChanged(items);

    $('pg-title').textContent = '正在导出…';
    $('pg-errors').hidden = true;
    ['btn-pg-reveal', 'btn-pg-retry', 'btn-pg-close'].forEach((id) => { $(id).hidden = true; });
    $('btn-pg-cancel').hidden = false;
    $('btn-pg-cancel').disabled = false;
    $('pg-line').textContent = '准备中…';
    $('pg-sub').textContent = '';
    setPct(0);
    if (!pg.open) pg.showModal();

    let result;
    const startedAt = performance.now();
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
        isCancelled: () => job.cancelled
      });
    } catch (err) {
      result = { ok: 0, failed: [{ item: { name: '（导出）' }, error: err.message }], cancelled: false, where: '', fallbackMaps: 0 };
    }

    job.result = result;
    actions.exportingChanged(false);
    document.title = baseTitle;
    const total = items.length;
    const secs = (performance.now() - startedAt) / 1000;
    const failed = result.failed.length;
    $('pg-title').textContent = result.cancelled ? '已取消' : failed ? '导出完成（部分失败）' : '导出完成';
    $('pg-line').textContent = `成功 ${result.ok} / ${total}${failed ? ` · 失败 ${failed}` : ''} · 用时 ${formatDuration(secs)}`;
    setPct(total ? (result.ok + failed) / total : 1, result.cancelled || failed ? 'fail' : 'done');
    const notes = [];
    if (result.where) notes.push(`输出位置：${result.where}`);
    if (result.fallbackMaps) notes.push(`${result.fallbackMaps} 张因地图不可用使用了简约底图`);
    $('pg-sub').textContent = notes.join(' · ');
    if (failed) {
      $('pg-errors').replaceChildren(...result.failed.slice(0, 200).map((f) => el('li', '', `${f.item.name}：${f.error}`)));
      $('pg-errors').hidden = false;
      $('btn-pg-retry').hidden = false;
    }
    $('btn-pg-reveal').hidden = !(s.exportMode === 'folder' && result.dir);
    $('btn-pg-cancel').hidden = true;
    $('btn-pg-close').hidden = false;
    $('btn-pg-close').focus();
    actions.setStatus(result.cancelled ? `导出已取消：完成 ${result.ok} 张` : `导出完成：成功 ${result.ok}${failed ? `，失败 ${failed}` : ''}`);
    actions.itemsChanged(items);
  }

  /* ---------------------------- 单张 ---------------------------- */

  async function exportOne(it = app.current) {
    if (!it) return;
    actions.ensurePool();
    toast('正在生成海报…', { ms: 20000 });
    try {
      const res = await renderOne(app, it, { scale: s.exportScale, format: s.exportFormat, quality: s.exportQuality / 100, maxSide: s.maxSide });
      download(res.blob, fileNameFor(app, it));
      toast(`已下载 ${res.width} × ${res.height} px 的海报`);
    } catch (e) {
      toast(`导出失败：${e.message}`);
    }
  }

  async function copy(it = app.current) {
    if (!it) return;
    if (!navigator.clipboard || !window.ClipboardItem) return toast('当前浏览器不支持复制图片');
    actions.ensurePool();
    const png = renderOne(app, it, { scale: 2, format: 'png', quality: 1, maxSide: Math.min(2560, s.maxSide) }).then((r) => r.blob);
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      toast('已复制海报图片，可直接粘贴到聊天或文档');
    } catch (e) {
      toast(`复制失败：${e.message}`);
    }
  }

  /* ---------------------------- 事件 ---------------------------- */

  ['ex-scope', 'ex-mode', 'ex-format', 'ex-scale'].forEach((id) => onSeg($(id), (v) => {
    setSeg($(id), v);
    syncForm();
  }));
  $('ex-quality').addEventListener('input', (e) => {
    paintRange(e.target);
    syncForm();
  });
  $('ex-pattern').addEventListener('input', syncForm);
  $('ex-tokens').addEventListener('click', (e) => {
    const b = e.target.closest('[data-token]');
    if (!b) return;
    const input = $('ex-pattern');
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.setRangeText(b.dataset.token, start, end, 'end');
    input.focus();
    syncForm();
  });
  $('btn-export-cancel').onclick = () => dlg.close();
  $('btn-export-go').onclick = go;

  $('btn-pg-cancel').onclick = () => {
    if (!job) return;
    job.cancelled = true;
    $('btn-pg-cancel').disabled = true;
    $('pg-title').textContent = '正在取消…';
  };
  $('btn-pg-close').onclick = () => pg.close();
  pg.addEventListener('cancel', (e) => {
    if (app.exporting) e.preventDefault();
  });
  $('btn-pg-reveal').onclick = () => job && job.result && api.revealFolder(job.result.dir).catch((err) => toast(err.message));
  $('btn-pg-retry').onclick = async () => {
    const failed = job.result.failed.map((f) => f.item).filter((it) => it.file);
    if (!failed.length) return;
    let dirHandle = job.dirHandle;
    if (s.exportMode === 'fsa' && !dirHandle) {
      try {
        dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      } catch (e) {
        return;
      }
    }
    await start(failed, dirHandle);
  };

  return { open, start, exportOne, copy };
}
