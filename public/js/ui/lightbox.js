/**
 * lightbox.js：按导出参数渲染的大图预览（与批量导出同一条 Worker 流水线，所见即所得）。
 */
import { renderOne } from '../exporter.js';
import { $, toast, download } from './dom.js';
import { fileNameFor } from './export-ui.js';

/**
 * @param actions { ensurePool(), setCurrent(item), copy(item) }
 */
export function createLightbox(app, actions) {
  const box = $('lightbox');
  const img = $('lb-img');
  let item = null;
  let url = '';
  let blob = null;
  let seq = 0;

  const list = () => {
    const view = app.library.view;
    return item && view.includes(item) ? view : item && !item.isSample ? app.items : [];
  };

  async function show(target) {
    item = target;
    const id = ++seq;
    const s = app.settings;
    const nav = list();
    const idx = nav.indexOf(item);
    $('lb-title').textContent = item.isSample ? '示例照片' : item.name;
    $('lb-info').textContent = idx >= 0 ? `${idx + 1} / ${nav.length} · 正在渲染…` : '正在渲染…';
    $('lb-prev').disabled = idx <= 0;
    $('lb-next').disabled = idx < 0 || idx >= nav.length - 1;
    $('lb-spin').hidden = false;
    img.classList.remove('ready');
    blob = null;
    actions.ensurePool();
    try {
      const res = await renderOne(app, item, { scale: s.exportScale, format: s.exportFormat, quality: s.exportQuality / 100, maxSide: s.maxSide });
      if (id !== seq) return;
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(res.blob);
      blob = res.blob;
      img.src = url;
      await img.decode().catch(() => {});
      if (id !== seq) return;
      img.classList.add('ready');
      const kb = res.blob.size / 1024;
      const size = kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;
      $('lb-info').textContent = `${idx >= 0 ? `${idx + 1} / ${nav.length} · ` : ''}${res.width} × ${res.height} px · ${size}${res.mapOk === false ? ' · 地图不可用，已用简约底图' : ''}`;
    } catch (e) {
      if (id !== seq) return;
      $('lb-info').textContent = `渲染失败：${e.message}`;
    } finally {
      if (id === seq) $('lb-spin').hidden = true;
    }
  }

  function open(target) {
    const it = target || app.current;
    if (!it) return;
    box.hidden = false;
    document.body.classList.add('lb-open');
    show(it);
  }

  function close() {
    if (box.hidden) return;
    seq += 1;
    box.hidden = true;
    document.body.classList.remove('lb-open');
    img.removeAttribute('src');
    img.classList.remove('ready');
    if (url) URL.revokeObjectURL(url);
    url = '';
    blob = null;
    if (item && !item.isSample && item !== app.current && app.items.includes(item)) actions.setCurrent(item);
    item = null;
  }

  function step(delta) {
    const nav = list();
    const next = nav[nav.indexOf(item) + delta];
    if (next) show(next);
  }

  function onKey(e) {
    if (e.key === 'Escape' || e.key === ' ' || (e.key === 'Enter' && !e.target.closest('button'))) {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      step(-1);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      step(1);
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      actions.copy(item);
    }
  }

  $('lb-close').onclick = close;
  $('lb-prev').onclick = () => step(-1);
  $('lb-next').onclick = () => step(1);
  $('lb-copy').onclick = () => item && actions.copy(item);
  $('lb-download').onclick = () => {
    if (!item) return;
    if (!blob) return toast('还在渲染，请稍候');
    download(blob, fileNameFor(app, item));
  };
  $('lb-stage').addEventListener('click', (e) => {
    if (e.target === $('lb-stage')) close();
  });

  return { open, close, onKey, get isOpen() { return !box.hidden; } };
}
