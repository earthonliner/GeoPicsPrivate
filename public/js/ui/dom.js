/**
 * dom.js：界面通用小工具（取元素、图标、分段控件、滑块、提示条、确认框）。
 */

export const $ = (id) => document.getElementById(id);

export const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
export const MOD = isMac ? '⌘' : 'Ctrl';

export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
export const idle = () => new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 60 }) : setTimeout(r, 0)));

export const icon = (name, cls = 'i') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ---------------------------- 分段控件 ---------------------------- */

export function setSeg(seg, value, key = 'value') {
  seg.querySelectorAll('button').forEach((b) => {
    const on = b.dataset[key] === String(value);
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

export function segValue(seg, key = 'value') {
  const b = seg.querySelector('button.active');
  return b ? b.dataset[key] : null;
}

export function onSeg(seg, fn, key = 'value') {
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled || !seg.contains(b) || b.dataset[key] === undefined) return;
    fn(b.dataset[key], b);
  });
}

/* ---------------------------- 滑块 ---------------------------- */

export function paintRange(input) {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const p = max > min ? ((Number(input.value) - min) / (max - min)) * 100 : 0;
  input.style.setProperty('--p', `${p}%`);
}

export function setRange(input, value) {
  input.value = value;
  paintRange(input);
}

/* ---------------------------- 提示条 ---------------------------- */

let toastTimer = null;
let toastAction = null;

/**
 * @param {string} text
 * @param {{ms?: number, action?: string, onAction?: () => void}} opts
 */
export function toast(text, opts = {}) {
  const box = $('toast');
  const btn = $('toast-action');
  $('toast-text').textContent = text;
  toastAction = opts.onAction || null;
  btn.hidden = !opts.action;
  btn.textContent = opts.action || '';
  box.classList.toggle('has-action', !!opts.action);
  box.hidden = false;
  box.style.animation = 'none';
  void box.offsetWidth;
  box.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    box.hidden = true;
    toastAction = null;
  }, opts.ms || (opts.action ? 6000 : 2600));
}

export function initToast() {
  $('toast-action').addEventListener('click', () => {
    const fn = toastAction;
    $('toast').hidden = true;
    toastAction = null;
    if (fn) fn();
  });
}

/* ---------------------------- 确认框 ---------------------------- */

export function confirmDialog({ title, text = '', ok = '确定', danger = false }) {
  const dlg = $('dlg-confirm');
  $('confirm-title').textContent = title;
  $('confirm-text').textContent = text;
  $('confirm-text').hidden = !text;
  const okBtn = $('confirm-ok');
  okBtn.textContent = ok;
  okBtn.style.background = danger ? 'var(--danger)' : '';
  return new Promise((resolve) => {
    const done = (value) => {
      okBtn.onclick = null;
      $('confirm-cancel').onclick = null;
      dlg.removeEventListener('close', onClose);
      if (dlg.open) dlg.close();
      resolve(value);
    };
    const onClose = () => done(false);
    okBtn.onclick = () => done(true);
    $('confirm-cancel').onclick = () => done(false);
    dlg.addEventListener('close', onClose);
    dlg.showModal();
    okBtn.focus();
  });
}

/** 所有对话框：点击 [data-close] 或背景关闭 */
export function initDialogs() {
  document.querySelectorAll('dialog').forEach((dlg) => {
    dlg.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) dlg.close();
      else if (e.target === dlg && dlg.id !== 'dlg-progress') {
        const r = dlg.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!inside) dlg.close();
      }
    });
  });
  if (!isMac) document.querySelectorAll('kbd[data-mod]').forEach((k) => { k.textContent = MOD; });
}

export function formatDuration(sec) {
  if (!Number.isFinite(sec)) return '—';
  const s = Math.round(sec);
  if (s < 60) return `${s} 秒`;
  return `${Math.floor(s / 60)} 分 ${String(s % 60).padStart(2, '0')} 秒`;
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
