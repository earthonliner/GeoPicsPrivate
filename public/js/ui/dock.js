/**
 * dock.js：底部模板栏。分类标签 + 用当前照片实时渲染的模板缩略图。
 * 缩略图用缩小的照片与半分辨率地图绘制，按可见顺序分批画，不阻塞界面。
 */
import { CATEGORIES, TEMPLATES, templatesOf, paintPoster } from '../lib/posters.js';
import { buildMapCanvas } from '../lib/tiles.js';
import { buildStyle, buildInfo, buildMapSpec, mapKey } from '../params.js';
import { $, el, idle } from './dom.js';

const THUMB_W = 76;
const THUMB_H = Math.round((THUMB_W * 4) / 3);
const PHOTO_SIDE = 560;
const MAP_CACHE_MAX = 32;

export class TemplateDock {
  /**
   * @param app
   * @param {{pick: (id: string) => void}} actions
   */
  constructor(app, actions) {
    this.app = app;
    this.actions = actions;
    this.buttons = new Map();
    this.maps = new Map();
    this.photo = null;
    this.gen = 0;
    this.timer = null;
    this.bind();
  }

  /* ---------------------------- 结构 ---------------------------- */

  renderTabs() {
    const active = this.app.settings.catId;
    $('cat-tabs').replaceChildren(
      ...CATEGORIES.map((c) => {
        const b = el('button', `tab${c.id === active ? ' active' : ''}`, c.name);
        b.dataset.id = c.id;
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(c.id === active));
        b.appendChild(el('b', '', String(templatesOf(c.id).length)));
        return b;
      })
    );
  }

  renderStrip() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.buttons.clear();
    $('tpl-strip').replaceChildren(
      ...templatesOf(this.app.settings.catId).map((t) => {
        const b = el('button', 'tpl');
        b.dataset.id = t.id;
        b.title = t.name;
        const c = document.createElement('canvas');
        c.width = Math.round(THUMB_W * dpr);
        c.height = Math.round(THUMB_H * dpr);
        const uses = el('span', 'uses');
        b.append(c, el('span', '', t.name), uses);
        this.buttons.set(t.id, { b, c, uses });
        return b;
      })
    );
    this.markActive();
    this.updateUses();
    this.schedule(0);
  }

  activeId() {
    const it = this.app.current;
    return it ? it.templateId : this.app.settings.templateId;
  }

  markActive() {
    const id = this.activeId();
    for (const [tid, x] of this.buttons) {
      x.b.classList.toggle('active', tid === id);
      x.b.setAttribute('aria-pressed', String(tid === id));
    }
  }

  revealActive(smooth = true) {
    const x = this.buttons.get(this.activeId());
    if (x) x.b.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: smooth ? 'smooth' : 'auto' });
  }

  /** 随机模式下显示每个模板被多少张照片使用 */
  updateUses() {
    const random = this.app.settings.batchMode === 'random' && this.app.items.length > 0;
    const counts = new Map();
    if (random) for (const it of this.app.items) counts.set(it.templateId, (counts.get(it.templateId) || 0) + 1);
    for (const [tid, x] of this.buttons) {
      const n = counts.get(tid) || 0;
      x.uses.textContent = random && n ? `${n} 张` : '';
      x.uses.hidden = !(random && n);
    }
  }

  /* ---------------------------- 绘制 ---------------------------- */

  schedule(delay = 150) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.paintAll(), delay);
  }

  clearMaps() {
    this.maps.clear();
  }

  async thumbPhoto(item) {
    if (this.photo && this.photo.id === item.id && this.photo.v === item.aspect) return this.photo.canvas;
    const image = await this.app.preview.ensurePhoto(item);
    const k = Math.min(1, PHOTO_SIDE / Math.max(image.width, image.height));
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(image.width * k)), Math.max(1, Math.round(image.height * k)));
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    this.photo = { id: item.id, v: item.aspect, canvas };
    return canvas;
  }

  /** 可见的缩略图优先绘制 */
  paintOrder() {
    const strip = $('tpl-strip');
    const left = strip.scrollLeft - THUMB_W;
    const right = strip.scrollLeft + strip.clientWidth + THUMB_W;
    const entries = [...this.buttons.entries()];
    const visible = (x) => x.b.offsetLeft + x.b.offsetWidth > left && x.b.offsetLeft < right;
    return entries.filter(([, x]) => visible(x)).concat(entries.filter(([, x]) => !visible(x)));
  }

  async paintAll(onlyId) {
    const gen = ++this.gen;
    const app = this.app;
    const item = app.current;
    if (!item || !this.buttons.size) return;
    let photo;
    try {
      photo = await this.thumbPhoto(item);
    } catch (e) {
      return;
    }
    if (gen !== this.gen) return;

    const settings = { ...app.settings, footerOn: false };
    const info = buildInfo(item, settings);
    const tiles = app.tileInfo();
    const pending = new Map();
    const paint = (tid, map) => {
      const x = this.buttons.get(tid);
      if (x) paintPoster(x.c, tid, { photo, map, qr: null }, info, buildStyle(settings, item, tid));
    };

    let n = 0;
    for (const [tid] of this.paintOrder()) {
      if (onlyId && tid !== onlyId) continue;
      const style = buildStyle(settings, item, tid);
      const spec = buildMapSpec(settings, item, style, tiles, tid);
      let map = null;
      if (spec) {
        const key = mapKey({ ...spec, pixelScale: 0.5 });
        map = this.maps.get(key) || null;
        if (!map) {
          if (!pending.has(key)) pending.set(key, { spec: { ...spec, pixelScale: 0.5 }, ids: [] });
          pending.get(key).ids.push(tid);
        }
      }
      paint(tid, map);
      n += 1;
      if (n % 4 === 0) {
        await idle();
        if (gen !== this.gen) return;
      }
    }

    await Promise.all(
      [...pending].map(async ([key, job]) => {
        const map = await buildMapCanvas(job.spec).catch(() => null);
        if (!map || gen !== this.gen) return;
        this.maps.set(key, map);
        if (this.maps.size > MAP_CACHE_MAX) this.maps.delete(this.maps.keys().next().value);
        job.ids.forEach((tid) => paint(tid, map));
      })
    );
  }

  /** 只重画一个模板（拖动取景时） */
  repaint(tplId) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.paintAll(tplId), 120);
  }

  /* ---------------------------- 事件 ---------------------------- */

  setCategory(id) {
    const s = this.app.settings;
    if (!CATEGORIES.some((c) => c.id === id) || id === s.catId) return false;
    s.catId = id;
    this.app.persist();
    this.renderTabs();
    this.renderStrip();
    $('tpl-strip').scrollLeft = 0;
    return true;
  }

  /** 当前模板不在所选分类中时，切到它所属的分类 */
  ensureCategory() {
    const id = this.activeId();
    if (templatesOf(this.app.settings.catId).some((t) => t.id === id)) return;
    const tpl = TEMPLATES.find((t) => t.id === id);
    if (tpl) this.setCategory(tpl.category);
  }

  bind() {
    $('cat-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('.tab');
      if (b && this.setCategory(b.dataset.id)) this.actions.categoryChanged();
    });
    $('tpl-strip').addEventListener('click', (e) => {
      const b = e.target.closest('.tpl');
      if (b) this.actions.pick(b.dataset.id);
    });
    $('tpl-strip').addEventListener(
      'wheel',
      (e) => {
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
        e.preventDefault();
        $('tpl-strip').scrollLeft += e.deltaY;
      },
      { passive: false }
    );
  }
}
