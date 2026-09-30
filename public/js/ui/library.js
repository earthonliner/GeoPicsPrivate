/**
 * library.js：左侧照片库（搜索 / 筛选 / 排序 / 勾选 / 缩略图懒加载）。
 * 上千张照片时只更新变化的卡片，计数合并到下一帧统一刷新。
 */
import { TEMPLATES } from '../lib/posters.js';
import { withSource } from '../source.js';
import { $, el, icon, setRange } from './dom.js';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const SORTERS = {
  import: (a, b) => a.id - b.id,
  time: (a, b) => a.time - b.time || a.id - b.id,
  name: (a, b) => collator.compare(a.name, b.name) || a.id - b.id,
  place: (a, b) => collator.compare(a.place || '\uffff', b.place || '\uffff') || a.time - b.time || a.id - b.id
};

const FILTERS = {
  all: () => true,
  noloc: (it) => it.lat === null,
  checked: (it) => it.selected,
  done: (it) => it.exportState === 'done',
  error: (it) => it.exportState === 'error'
};

const tplNames = new Map(TEMPLATES.map((t) => [t.id, t.name]));
const THUMB_PX = 320;

export class Library {
  /**
   * @param app
   * @param {{setCurrent: Function, openLightbox: Function, selectionChanged: Function, countsChanged: Function, viewChanged: Function}} actions
   */
  constructor(app, actions) {
    this.app = app;
    this.actions = actions;
    this.grid = $('grid');
    this.cards = new Map();
    this.byId = new Map();
    this.view = [];
    this.filter = 'all';
    this.query = '';
    this.anchor = null;
    this.countsQueued = false;
    this.observer = new IntersectionObserver((entries) => this.onVisible(entries), { root: this.grid, rootMargin: '400px' });
    this.bind();
    this.setThumbSize(app.settings.thumbSize);
    $('sort-select').value = app.settings.sortMode in SORTERS ? app.settings.sortMode : 'import';
  }

  /* ---------------------------- 视图 ---------------------------- */

  /** 全部照片（不筛选），按当前排序 */
  sorted() {
    return this.app.items.slice().sort(SORTERS[this.app.settings.sortMode] || SORTERS.import);
  }

  computeView() {
    const sorter = SORTERS[this.app.settings.sortMode] || SORTERS.import;
    const test = FILTERS[this.filter] || FILTERS.all;
    const q = this.query.trim().toLowerCase();
    return this.app.items
      .filter((it) => test(it) && (!q || `${it.name}\n${it.place}\n${it.camera}`.toLowerCase().includes(q)))
      .sort(sorter);
  }

  refresh() {
    this.view = this.computeView();
    const live = new Set(this.app.items);
    for (const [id, card] of this.cards) {
      const item = this.byId.get(id);
      if (live.has(item)) continue;
      this.observer.unobserve(card);
      card.remove();
      this.cards.delete(id);
      this.byId.delete(id);
    }
    const frag = document.createDocumentFragment();
    for (const item of this.view) {
      frag.appendChild(this.cards.get(item.id) || this.makeCard(item));
      this.update(item);
    }
    this.grid.replaceChildren(frag);
    const hasItems = this.app.items.length > 0;
    $('library').classList.toggle('has-items', hasItems);
    $('lib-nomatch').hidden = !hasItems || this.view.length > 0;
    this.scheduleCounts();
  }

  setFilter(filter) {
    this.filter = filter in FILTERS ? filter : 'all';
    $('lib-filters').querySelectorAll('.filter').forEach((b) => b.classList.toggle('active', b.dataset.filter === this.filter));
    this.refresh();
    this.actions.viewChanged();
  }

  setQuery(q) {
    this.query = q;
    if ($('lib-search').value !== q) $('lib-search').value = q;
    this.refresh();
    this.actions.viewChanged();
  }

  setThumbSize(px) {
    const size = Math.max(72, Math.min(168, Number(px) || 104));
    this.grid.style.setProperty('--thumb', `${size}px`);
    this.grid.classList.toggle('compact', size < 96);
    setRange($('thumb-size'), size);
  }

  columns() {
    const cols = getComputedStyle(this.grid).gridTemplateColumns.split(' ').filter(Boolean).length;
    return Math.max(1, cols);
  }

  reveal(item) {
    const card = item && this.cards.get(item.id);
    if (card && card.isConnected) card.scrollIntoView({ block: 'nearest' });
  }

  /* ---------------------------- 卡片 ---------------------------- */

  makeCard(item) {
    const card = el('div', 'card');
    card.dataset.id = item.id;
    card.innerHTML = `<div class="ph loading"></div><button class="chk" tabindex="-1" aria-label="勾选">${icon('check')}</button><div class="badges"></div><div class="cap"><span class="cap-place"></span><span class="cap-tpl"></span></div>`;
    card._badges = '';
    this.cards.set(item.id, card);
    this.byId.set(item.id, item);
    this.observer.observe(card);
    return card;
  }

  update(item) {
    const card = this.cards.get(item.id);
    if (!card) return;
    card.classList.toggle('current', item === this.app.current);
    card.classList.toggle('on', item.selected);
    const loading = item.placeStatus === 'loading';
    const place = card.querySelector('.cap-place');
    place.textContent = loading ? '解析地名…' : item.place || 'UNKNOWN';
    place.classList.toggle('pending', loading);
    card.querySelector('.cap-tpl').textContent = tplNames.get(item.templateId) || '';
    card.title = [item.name, [item.place, item.dateText].filter(Boolean).join(' · '), item.camera].filter(Boolean).join('\n');

    const badges = `${item.lat === null ? 'n' : ''}${item.exportState}`;
    if (card._badges !== badges) {
      card._badges = badges;
      card.querySelector('.badges').innerHTML =
        (item.lat === null ? `<span class="badge noloc" title="没有位置信息">${icon('pin-off')}</span>` : '') +
        (item.exportState === 'done' ? `<span class="badge done" title="已导出">${icon('check')}</span>` : '') +
        (item.exportState === 'error' ? '<span class="badge err" title="导出失败">!</span>' : '');
    }

    const ph = card.querySelector('.ph');
    if (item.thumbUrl) {
      let img = card.querySelector('img');
      if (!img) {
        img = document.createElement('img');
        img.decoding = 'async';
        img.alt = '';
        img.draggable = false;
        card.prepend(img);
      }
      if (img.getAttribute('src') !== item.thumbUrl) img.src = item.thumbUrl;
      if (ph) ph.remove();
    } else if (ph) {
      ph.classList.toggle('loading', item.thumbState !== 'error');
      ph.textContent = item.thumbState === 'error' ? '无法预览' : '';
    }
  }

  updateAll() {
    for (const item of this.app.items) this.update(item);
    this.scheduleCounts();
  }

  onVisible(entries) {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      this.observer.unobserve(e.target);
      const item = this.byId.get(Number(e.target.dataset.id));
      if (item) this.loadThumb(item);
    }
  }

  async loadThumb(item) {
    if (item.thumbState !== 'idle') return;
    item.thumbState = 'loading';
    try {
      const res = await withSource(item, 1200, (blob) => this.app.pool.run('thumb', { blob, size: THUMB_PX }, { priority: 2 }));
      item.thumbUrl = URL.createObjectURL(res.blob);
      item.aspect = res.width / res.height;
      item.thumbState = 'ready';
    } catch (err) {
      item.thumbState = 'error';
    }
    this.update(item);
  }

  /* ---------------------------- 计数 ---------------------------- */

  scheduleCounts() {
    if (this.countsQueued) return;
    this.countsQueued = true;
    requestAnimationFrame(() => {
      this.countsQueued = false;
      this.renderCounts();
    });
  }

  renderCounts() {
    const items = this.app.items;
    const n = { all: items.length, noloc: 0, checked: 0, done: 0, error: 0 };
    for (const it of items) {
      if (it.lat === null) n.noloc += 1;
      if (it.selected) n.checked += 1;
      if (it.exportState === 'done') n.done += 1;
      else if (it.exportState === 'error') n.error += 1;
    }
    $('lib-filters').querySelectorAll('.filter').forEach((b) => {
      const v = n[b.dataset.filter];
      b.querySelector('b').textContent = String(v);
      b.classList.toggle('zero', b.dataset.filter !== 'all' && v === 0);
    });
    const inView = this.view.filter((it) => it.selected).length;
    const all = $('chk-all');
    all.checked = this.view.length > 0 && inView === this.view.length;
    all.indeterminate = inView > 0 && inView < this.view.length;
    all.disabled = this.view.length === 0;
    $('sel-count').textContent = `已勾选 ${n.checked} / ${n.all}`;
    $('btn-invert').disabled = this.view.length === 0;
    $('btn-remove').disabled = n.checked === 0;
    this.actions.countsChanged(n);
  }

  /* ---------------------------- 勾选 ---------------------------- */

  toggle(item, value) {
    item.selected = value === undefined ? !item.selected : value;
    this.anchor = item;
    this.update(item);
    this.scheduleCounts();
    this.actions.selectionChanged();
  }

  rangeTo(item) {
    const anchor = this.anchor && this.view.includes(this.anchor) ? this.anchor : this.app.current;
    const a = this.view.indexOf(anchor);
    const b = this.view.indexOf(item);
    if (a < 0 || b < 0) return this.toggle(item);
    const value = anchor.selected;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    for (let i = lo; i <= hi; i += 1) {
      this.view[i].selected = value;
      this.update(this.view[i]);
    }
    this.scheduleCounts();
    this.actions.selectionChanged();
  }

  setAllInView(on) {
    this.view.forEach((it) => {
      it.selected = on;
      this.update(it);
    });
    this.scheduleCounts();
    this.actions.selectionChanged();
  }

  invertInView() {
    this.view.forEach((it) => {
      it.selected = !it.selected;
      this.update(it);
    });
    this.scheduleCounts();
    this.actions.selectionChanged();
  }

  /* ---------------------------- 事件 ---------------------------- */

  bind() {
    this.grid.addEventListener('click', (e) => {
      const card = e.target.closest('.card');
      const item = card && this.byId.get(Number(card.dataset.id));
      if (!item) return;
      if (e.target.closest('.chk') || e.metaKey || e.ctrlKey) {
        if (e.shiftKey) this.rangeTo(item);
        else this.toggle(item);
        return;
      }
      if (e.shiftKey) return this.rangeTo(item);
      this.actions.setCurrent(item, { reveal: false });
    });
    this.grid.addEventListener('dblclick', (e) => {
      const card = e.target.closest('.card');
      const item = card && this.byId.get(Number(card.dataset.id));
      if (item && !e.target.closest('.chk')) this.actions.openLightbox(item);
    });
    $('lib-filters').addEventListener('click', (e) => {
      const b = e.target.closest('.filter');
      if (b) this.setFilter(b.dataset.filter === this.filter && b.dataset.filter !== 'all' ? 'all' : b.dataset.filter);
    });
    let searchTimer = null;
    $('lib-search').addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => this.setQuery(e.target.value), 120);
    });
    $('lib-search').addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && e.target.value) {
        e.stopPropagation();
        this.setQuery('');
      } else if (e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault();
        e.target.blur();
        if (this.view.length && !this.view.includes(this.app.current)) this.actions.setCurrent(this.view[0]);
      }
    });
    $('btn-clear-filter').onclick = () => {
      this.query = '';
      $('lib-search').value = '';
      this.setFilter('all');
    };
    $('sort-select').onchange = (e) => {
      this.app.settings.sortMode = e.target.value;
      this.app.persist();
      this.refresh();
      this.actions.viewChanged();
    };
    $('chk-all').onchange = (e) => this.setAllInView(e.target.checked);
    $('btn-invert').onclick = () => this.invertInView();
    $('thumb-size').addEventListener('input', (e) => {
      this.setThumbSize(e.target.value);
      this.app.settings.thumbSize = Number(e.target.value);
      this.app.persist();
    });
  }
}
