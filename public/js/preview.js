/**
 * preview.js：预览画布。与批量导出共用 posters.js 的绘制代码，
 * 并支持拖动 / 滚轮 / 触控板捏合调整照片取景。
 */
import { paintPoster, POSTER_W, POSTER_H, posterHeight, CROP_REGIONS, DEFAULT_CROP, MAX_CROP_ZOOM, clamp } from './lib/posters.js';
import { decodePhoto } from './lib/photo.js';
import { buildMapCanvas } from './lib/tiles.js';
import { buildStyle, buildInfo, buildMapSpec, mapKey } from './params.js';
import { withSource } from './source.js';

const PREVIEW_MAX_SIDE = 2200;

export class Preview {
  constructor(app, canvas, wrap) {
    this.app = app;
    this.canvas = canvas;
    this.wrap = wrap;
    this.renderId = 0;
    this.photo = null;
    this.maps = new Map();
    this.logo = { url: '', bitmap: null };
    this.size = { w: 0, h: 0 };
    this.timer = null;
    this.gesture = null;

    new ResizeObserver(() => this.schedule(30)).observe(wrap);
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onUp(e));
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    canvas.addEventListener('dblclick', (e) => {
      const region = this.item && CROP_REGIONS[this.item.templateId];
      if (region && this.inRegion(this.toLogical(e), region)) this.resetCrop();
    });
    let gestureStart = 1;
    canvas.addEventListener('gesturestart', (e) => {
      e.preventDefault();
      gestureStart = this.currentCrop().zoom;
    });
    canvas.addEventListener('gesturechange', (e) => {
      e.preventDefault();
      this.setCrop({ zoom: gestureStart * e.scale });
    });
  }

  get item() {
    return this.app.current;
  }

  currentCrop() {
    const it = this.item;
    return (it && it.crops[it.templateId]) || DEFAULT_CROP;
  }

  setCrop(patch) {
    const it = this.item;
    if (!it || !CROP_REGIONS[it.templateId]) return;
    const cur = this.currentCrop();
    it.crops[it.templateId] = {
      zoom: clamp(patch.zoom === undefined ? cur.zoom : patch.zoom, 1, MAX_CROP_ZOOM),
      x: clamp(patch.x === undefined ? cur.x : patch.x, -1, 1),
      y: clamp(patch.y === undefined ? cur.y : patch.y, -1, 1)
    };
    this.app.ui.syncCrop();
    this.schedule(16);
  }

  resetCrop() {
    const it = this.item;
    if (!it || !it.crops[it.templateId]) return;
    delete it.crops[it.templateId];
    this.app.ui.syncCrop();
    this.schedule(0);
  }

  /* ---------------------------- 尺寸 ---------------------------- */

  layout() {
    const footer = this.app.settings.footerOn;
    const ratio = posterHeight(footer) / POSTER_W;
    const pad = 32;
    const availW = Math.max(120, this.wrap.clientWidth - pad);
    const availH = Math.max(160, this.wrap.clientHeight - pad);
    const w = Math.floor(Math.min(availW, availH / ratio, 620));
    const h = Math.round(w * ratio);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.size = { w, h };
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
  }

  /* ---------------------------- 渲染 ---------------------------- */

  schedule(delay = 0) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.render(), delay);
  }

  async logoBitmap() {
    const url = this.app.settings.logoDataUrl;
    if (!url) return null;
    if (this.logo.url === url) return this.logo.bitmap;
    try {
      const blob = await (await fetch(url)).blob();
      this.logo = { url, bitmap: await createImageBitmap(blob) };
    } catch (e) {
      this.logo = { url, bitmap: null };
    }
    return this.logo.bitmap;
  }

  ensurePhoto(item) {
    if (this.photo && this.photo.id === item.id) return this.photo.promise;
    this.releasePhoto();
    const entry = { id: item.id, image: null, promise: null };
    entry.promise = withSource(item, PREVIEW_MAX_SIDE, (blob) => decodePhoto(blob, PREVIEW_MAX_SIDE), { cache: true }).then(
      (image) => {
        entry.image = image;
        item.aspect = image.width / image.height;
        return image;
      },
      (err) => {
        if (this.photo === entry) this.photo = null;
        throw err;
      }
    );
    this.photo = entry;
    return entry.promise;
  }

  releasePhoto(item) {
    const entry = this.photo;
    if (!entry || (item && entry.id !== item.id)) return;
    this.photo = null;
    entry.promise.then((image) => typeof image.close === 'function' && image.close(), () => {});
  }

  get photoImage() {
    return this.photo && this.photo.image;
  }

  async render() {
    this.layout();
    const id = ++this.renderId;
    const app = this.app;
    const item = this.item;
    const settings = app.settings;
    this.canvas.classList.toggle('croppable', !!item && !!CROP_REGIONS[item.templateId]);
    app.ui.setPreviewMessage('');

    if (!item) {
      paintPoster(this.canvas, settings.templateId, null, null, { footer: settings.footerOn, theme: { dark: false }, brand: { name: settings.brandName, tagline: settings.brandTagline } });
      return;
    }

    const style = buildStyle(settings, item);
    const info = buildInfo(item, settings);
    const spec = buildMapSpec(settings, item, style, app.tileInfo());
    const key = spec ? mapKey(spec) : '';

    let photo;
    const slow = setTimeout(() => id === this.renderId && app.ui.setPreviewMessage('正在读取照片…'), 250);
    try {
      photo = await this.ensurePhoto(item);
    } catch (e) {
      if (id === this.renderId) app.ui.setPreviewMessage(`无法读取这张照片：${e.message}`);
      return;
    } finally {
      clearTimeout(slow);
    }
    if (id !== this.renderId) return;
    app.ui.setPreviewMessage('');

    const qr = await this.logoBitmap();
    if (id !== this.renderId) return;

    const cachedMap = spec && this.maps.has(key) ? this.maps.get(key) : null;
    paintPoster(this.canvas, item.templateId, { photo, map: cachedMap, qr }, info, style);
    if (!spec || cachedMap) return;

    app.ui.setPreviewMessage('地图加载中…');
    const map = await buildMapCanvas({ ...spec }).catch(() => null);
    if (id !== this.renderId) return;
    if (!map) {
      app.ui.setPreviewMessage('地图不可用，已使用简约底图（检查网络或设置中的地图来源）');
      return;
    }
    this.maps.set(key, map);
    if (this.maps.size > 12) this.maps.delete(this.maps.keys().next().value);
    app.ui.setPreviewMessage('');
    paintPoster(this.canvas, item.templateId, { photo, map, qr }, info, style);
  }

  /* ---------------------------- 取景手势 ---------------------------- */

  toLogical(e) {
    const rect = this.canvas.getBoundingClientRect();
    const k = POSTER_W / rect.width;
    return { x: (e.clientX - rect.left) * k, y: (e.clientY - rect.top) * k, k };
  }

  inRegion(p, region) {
    return p.x >= region.left && p.x <= region.left + region.w && p.y >= region.top && p.y <= region.top + region.h;
  }

  onDown(e) {
    const item = this.item;
    const region = item && CROP_REGIONS[item.templateId];
    if (!region || !this.photoImage) return;
    const p = this.toLogical(e);
    if (!this.inRegion(p, region)) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.canvas.classList.add('dragging');
    this.gesture = { start: this.currentCrop(), x: e.clientX, y: e.clientY, k: p.k, region };
  }

  onMove(e) {
    const g = this.gesture;
    if (!g || !this.photoImage) return;
    const { width: iw, height: ih } = this.photoImage;
    const { region } = g;
    const cover = Math.max(region.w / iw, region.h / ih) * g.start.zoom;
    const sw = region.w / cover;
    const sh = region.h / cover;
    const slackX = (iw - sw) / 2;
    const slackY = (ih - sh) / 2;
    const dx = (e.clientX - g.x) * g.k;
    const dy = (e.clientY - g.y) * g.k;
    this.setCrop({
      x: slackX > 0.5 ? g.start.x - (dx * (sw / region.w)) / slackX : g.start.x,
      y: slackY > 0.5 ? g.start.y - (dy * (sh / region.h)) / slackY : g.start.y
    });
  }

  onUp() {
    this.gesture = null;
    this.canvas.classList.remove('dragging');
  }

  onWheel(e) {
    const item = this.item;
    const region = item && CROP_REGIONS[item.templateId];
    if (!region || !this.photoImage) return;
    if (!this.inRegion(this.toLogical(e), region)) return;
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025));
    this.setCrop({ zoom: this.currentCrop().zoom * factor });
  }
}

export { POSTER_H };
