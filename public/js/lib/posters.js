/**
 * posters.js
 *
 * 模板注册表与原版 15 种海报模板的 Canvas 2D 绘制代码，移植自 GeoPhotoGraph 小程序（earthonliner/GeoPhotoGraph）；
 * 新增模板见 posters-more.js / posters-extra.js，公共绘制部件见 poster-kit.js。
 * 只依赖标准 Canvas 2D API，因此可同时运行在主线程（HTMLCanvasElement）与
 * Web Worker（OffscreenCanvas）中：预览与批量导出共用同一份绘制逻辑。
 *
 * 所有绘制坐标基于 400 x 533.33 的逻辑单位，预览 / 导出时按 canvas.width / POSTER_W 缩放。
 */

import {
  POSTER_W, POSTER_H, FOOTER_H, FULL_PHOTO, SANS, SERIF, TAGLINE, CENTER_PIN, tplMap, brandOf, sloganOf,
  setFont, measureSpaced, drawSpacedText, fitFontSize, setTextAlpha, drawImageCover, fitInside, withAlpha,
  drawMapRegion, drawMapWindow, roundedRectPath, photoText, drawFullBleedPhoto, splitCoord, filmDate, dateParts, hexToRgba,
  drawLogoMark
} from './poster-kit.js';
import { MORE_TEMPLATES, MORE_CATEGORIES } from './posters-more.js';
import { EXTRA_TEMPLATES, EXTRA_CATEGORIES } from './posters-extra.js';

export {
  POSTER_W, POSTER_H, EXPORT_SCALE, FOOTER_H, MAX_CROP_ZOOM, posterHeight, exportSizeText, TAGLINE, DEFAULT_BRAND,
  MAP_SIZE, clamp, coverRect, filmDate
} from './poster-kit.js';

// 各模板中照片的取景区域（逻辑单位）；胶片 / 明信片的照片框固定，其余为整版或下半版
const FILM_PHOTO = { left: 68, top: 50, w: 264, h: 368 };
const POSTCARD_PHOTO = { left: 40, top: 46, w: 320, h: 236 };
const MAT_PHOTO = { left: 28, top: 28, w: 344, h: 404 };
const BAR_H = 100;
const BAR_PHOTO = { left: 0, top: 0, w: POSTER_W, h: POSTER_H - BAR_H };
const RAIL_W = 64;
const RAIL_PHOTO = { left: 0, top: 0, w: POSTER_W - RAIL_W, h: POSTER_H };
const CINEMA_PHOTO = { left: 0, top: 116, w: POSTER_W, h: 260 };

// 支持取景调整（拖动 / 缩放）的模板；拍立得与画廊展签完整显示照片，不需要裁切
export const CROP_REGIONS = {
  split: { left: 0, top: POSTER_H * 0.4, w: POSTER_W, h: POSTER_H * 0.6 },
  medallion: FULL_PHOTO,
  magazine: FULL_PHOTO,
  film: FILM_PHOTO,
  postcard: POSTCARD_PHOTO,
  glass: FULL_PHOTO,
  typo: FULL_PHOTO,
  mat: MAT_PHOTO,
  bar: BAR_PHOTO,
  frame: FULL_PHOTO,
  rail: RAIL_PHOTO,
  cinema: CINEMA_PHOTO,
  coord: FULL_PHOTO
};
export const DEFAULT_CROP = { zoom: 1, x: 0, y: 0 };

// category：模板所属分类；also：同时出现的其他分类；hot：同时出现在“热门”分类里
const BASE_TEMPLATES = [
  { id: 'polaroid', name: '拍立得', category: 'classic', hot: true, map: tplMap({ x: 0.88, y: 0.5 }) },
  { id: 'split', name: '上下分割', category: 'classic', map: tplMap({ x: 0.5, y: 0.19 }) },
  { id: 'medallion', name: '地图徽章', category: 'classic', map: tplMap({ x: 0.18, y: 0.846 }) },
  { id: 'mat', name: '极简白卡', category: 'minimal', hot: true, map: tplMap(CENTER_PIN) },
  { id: 'bar', name: '底栏', category: 'minimal', hot: true, map: tplMap(CENTER_PIN) },
  { id: 'frame', name: '细框', category: 'minimal', hot: true, map: tplMap(CENTER_PIN) },
  { id: 'rail', name: '侧栏', category: 'minimal', map: tplMap(CENTER_PIN) },
  { id: 'cinema', name: '影幕', category: 'minimal', map: tplMap(CENTER_PIN) },
  { id: 'coord', name: '坐标', category: 'minimal', map: tplMap(CENTER_PIN) },
  { id: 'magazine', name: '杂志封面', category: 'editorial', hot: true, map: tplMap(CENTER_PIN) },
  { id: 'glass', name: '玻璃卡片', category: 'editorial', hot: true, map: tplMap(CENTER_PIN) },
  { id: 'typo', name: '巨字', category: 'editorial', map: tplMap(CENTER_PIN) },
  { id: 'film', name: '胶片', category: 'retro', map: tplMap(CENTER_PIN) },
  { id: 'postcard', name: '明信片', category: 'retro', also: ['travel'], map: tplMap(CENTER_PIN) },
  { id: 'gallery', name: '画廊展签', category: 'retro', map: tplMap({ x: 0.9, y: 0.28 }) }
];

const ADDED_TEMPLATES = MORE_TEMPLATES.concat(EXTRA_TEMPLATES);
ADDED_TEMPLATES.forEach((t) => {
  if (t.crop) CROP_REGIONS[t.id] = t.crop;
});

export const TEMPLATES = BASE_TEMPLATES.concat(
  ADDED_TEMPLATES.map(({ paint, crop, ...meta }) => meta)
);

export const HOT_CATEGORY = 'hot';
export const ALL_CATEGORY = 'all';
export const CATEGORIES = [
  { id: ALL_CATEGORY, name: '全部' },
  { id: HOT_CATEGORY, name: '热门' },
  { id: 'minimal', name: '简约' },
  { id: 'classic', name: '经典' },
  { id: 'editorial', name: '杂志' },
  { id: 'retro', name: '复古' }
].concat(MORE_CATEGORIES, EXTRA_CATEGORIES);

export function templatesOf(categoryId) {
  if (categoryId === ALL_CATEGORY) return TEMPLATES.slice();
  return TEMPLATES.filter((t) =>
    categoryId === HOT_CATEGORY ? t.hot : t.category === categoryId || (t.also || []).includes(categoryId)
  );
}

/* ------------------------------------------------------------------ */
/* 三种海报样式                                                         */
/* ------------------------------------------------------------------ */

// 样式 A：地图全屏背景 + 拍立得相框（白边 + 投影）
function paintPolaroid(ctx, scale, assets, info, tpl, style) {
  const W = POSTER_W;
  const H = POSTER_H;
  const ink = style.theme.ink;

  drawMapRegion(ctx, assets.map, 0, 0, W, H, tpl, info, style);

  // 顶部：大字地名 + 坐标 / 日期
  ctx.fillStyle = ink;
  ctx.textBaseline = 'alphabetic';
  fitFontSize(ctx, info.place, W - 48, 46, 22, 800, SANS, 2);
  drawSpacedText(ctx, info.place, 24, 62, 2, 'left');

  ctx.fillStyle = hexToRgba(ink, 0.72);
  setFont(ctx, 8.5, 500, SANS);
  drawSpacedText(ctx, info.coordText, 24, 82, 1.2, 'left');
  drawSpacedText(ctx, info.dateText, W - 24, 82, 1.2, 'right');

  // 拍立得相框
  const pad = 12;
  const bottom = 44;
  const photo = fitInside(assets.photo, 252, 300);
  const frameW = photo.w + pad * 2;
  const frameH = photo.h + pad + bottom;
  const areaTop = 100;
  const areaBottom = H - 40;
  const fx = (W - frameW) / 2;
  const fy = areaTop + (areaBottom - areaTop - frameH) / 2;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.32)';
  ctx.shadowBlur = 26 * scale;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 10 * scale;
  ctx.fillStyle = '#fbfaf7';
  ctx.fillRect(fx, fy, frameW, frameH);
  ctx.restore();

  withAlpha(ctx, style.photoAlpha, () => {
    ctx.drawImage(assets.photo, fx + pad, fy + pad, photo.w, photo.h);
  });
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(fx + pad, fy + pad, photo.w, photo.h);

  // 相框底边小字（相框本身是浅色，文字固定深色）
  const stripY = fy + pad + photo.h + 27;
  ctx.fillStyle = '#2a2a2a';
  setFont(ctx, 9.5, 400, SERIF, 'italic');
  drawSpacedText(ctx, info.place, fx + pad, stripY, 1, 'left');
  setFont(ctx, 8, 500, SANS);
  ctx.fillStyle = '#777777';
  drawSpacedText(ctx, info.dateText, fx + frameW - pad, stripY, 1, 'right');

  // 底部标语
  ctx.fillStyle = hexToRgba(ink, 0.85);
  setFont(ctx, 8, 400, SERIF);
  drawSpacedText(ctx, sloganOf(style), W / 2, H - 20, 2.4, 'center');
}

// 样式 B：上 40% 地图 + 大字地名，下 60% 照片
function paintSplit(ctx, scale, assets, info, tpl, style) {
  const W = POSTER_W;
  const H = POSTER_H;
  const mapH = H * 0.4;
  const ink = style.theme.ink;

  // 地图铺满整张海报，照片不透明度 < 1 时下半部分会透出地图
  drawMapRegion(ctx, assets.map, 0, 0, W, H, tpl, info, style);
  withAlpha(ctx, style.photoAlpha, () => {
    drawImageCover(ctx, assets.photo, 0, mapH, W, H - mapH, style.crop);
  });

  ctx.fillStyle = hexToRgba(ink, 0.75);
  ctx.textBaseline = 'alphabetic';
  setFont(ctx, 8.5, 500, SANS);
  drawSpacedText(ctx, info.coordText, 22, 30, 1.2, 'left');
  drawSpacedText(ctx, info.dateText, W - 22, 30, 1.2, 'right');

  ctx.fillStyle = ink;
  fitFontSize(ctx, info.place, W - 44, 66, 26, 800, SANS, 3);
  drawSpacedText(ctx, info.place, 22, mapH - 22, 3, 'left');

  ctx.fillStyle = style.photoAlpha >= 0.5 ? 'rgba(255,255,255,0.9)' : hexToRgba(ink, 0.8);
  setFont(ctx, 7.5, 400, SERIF);
  drawSpacedText(ctx, sloganOf(style), W / 2, H - 16, 2.2, 'center');
}

// 样式 C：照片全屏 + 底部渐变 + 圆形地图徽章
function paintMedallion(ctx, scale, assets, info, tpl, style) {
  const W = POSTER_W;
  const H = POSTER_H;
  const ink = style.theme.ink;
  const onPhoto = style.photoAlpha >= 0.5;
  const textColor = onPhoto ? '#ffffff' : ink;

  drawMapRegion(ctx, assets.map, 0, 0, W, H, tpl, info, style);

  withAlpha(ctx, style.photoAlpha, () => {
    drawImageCover(ctx, assets.photo, 0, 0, W, H, style.crop);
    const gradTop = H * 0.52;
    const grad = ctx.createLinearGradient(0, gradTop, 0, H);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, gradTop, W, H - gradTop);
  });

  // 徽章圆心与地图中的定位针位置一致（见 TEMPLATES）
  const r = 48;
  const cx = W * tpl.map.pin.x;
  const cy = H * tpl.map.pin.y;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 14 * scale;
  ctx.shadowOffsetY = 4 * scale;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  drawMapRegion(ctx, assets.map, 0, 0, W, H, tpl, info, Object.assign({}, style, { mapAlpha: 1 }));
  ctx.restore();

  const tx = cx + r + 18;
  const maxW = W - tx - 24;
  ctx.fillStyle = textColor;
  ctx.textBaseline = 'alphabetic';
  fitFontSize(ctx, info.place, maxW, 40, 18, 800, SANS, 2);
  drawSpacedText(ctx, info.place, tx, cy - 2, 2, 'left');

  ctx.fillStyle = onPhoto ? 'rgba(255,255,255,0.85)' : hexToRgba(ink, 0.8);
  setFont(ctx, 8.5, 500, SANS);
  drawSpacedText(ctx, info.coordText, tx, cy + 18, 1.1, 'left');
  drawSpacedText(ctx, info.dateText, tx, cy + 34, 1.1, 'left');

  ctx.fillStyle = onPhoto ? 'rgba(255,255,255,0.8)' : hexToRgba(ink, 0.7);
  setFont(ctx, 7.5, 400, SERIF);
  drawSpacedText(ctx, sloganOf(style), W / 2, H - 14, 2.2, 'center');
}

/* ------------------------------------------------------------------ */
/* 氛围模板：杂志封面 / 胶片 / 明信片 / 画廊展签 / 玻璃卡片 / 巨字            */
/* ------------------------------------------------------------------ */

// 杂志封面：超大衬线刊头 + 细线栏目 + 封面标语 + 迷你地图
function paintMagazine(ctx, scale, assets, info, tpl, style) {
  const W = POSTER_W;
  const H = POSTER_H;
  const { main, sub } = photoText(style);

  drawMapRegion(ctx, assets.map, 0, 0, W, H, tpl, info, style);
  drawFullBleedPhoto(ctx, assets, style, 0.5, 0.62);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = main;
  const size = fitFontSize(ctx, info.place, W - 44, 96, 30, 700, SERIF, 3);
  const baseline = 30 + size * 0.8;
  drawSpacedText(ctx, info.place, W / 2, baseline, 3, 'center');

  ctx.strokeStyle = sub;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(22, baseline + 14);
  ctx.lineTo(W - 22, baseline + 14);
  ctx.stroke();
  ctx.fillStyle = sub;
  setFont(ctx, 8, 500, SANS);
  drawSpacedText(ctx, info.dateText, 22, baseline + 29, 1.6, 'left');
  drawSpacedText(ctx, info.coordText, W - 22, baseline + 29, 1.2, 'right');

  const mapSize = 92;
  const mx = W - 22 - mapSize;
  const my = H - 24 - mapSize;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 14 * scale;
  ctx.shadowOffsetY = 4 * scale;
  ctx.fillStyle = '#ffffff';
  roundedRectPath(ctx, mx - 2.5, my - 2.5, mapSize + 5, mapSize + 5, 6);
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundedRectPath(ctx, mx, my, mapSize, mapSize, 4);
  ctx.clip();
  drawMapWindow(ctx, assets.map, mx, my, mapSize, mapSize, tpl, info, style);
  ctx.restore();

  ctx.fillStyle = sub;
  setFont(ctx, 7.5, 600, SANS);
  drawSpacedText(ctx, 'SPECIAL ISSUE', 22, H - 104, 3.2, 'left');
  ctx.fillStyle = main;
  setFont(ctx, 27, 400, SERIF, 'italic');
  drawSpacedText(ctx, 'Captured Moment,', 22, H - 70, 0.4, 'left');
  drawSpacedText(ctx, 'Lasting Place.', 22, H - 40, 0.4, 'left');
}

const FILM_STRIP = { x: 44, w: POSTER_W - 88 };
const FILM_AMBER = '#f2a03d';
// 胶片：暗房底色 + 35mm 片基与齿孔 + 琥珀色背刻日期
function paintFilm(ctx, scale, assets, info, tpl, style) {
  const W = POSTER_W;
  const H = POSTER_H;

  drawMapRegion(ctx, assets.map, 0, 0, W, H, tpl, info, style);
  ctx.fillStyle = 'rgba(9,8,7,0.88)';
  ctx.fillRect(0, 0, W, H);

  const sx = FILM_STRIP.x;
  const sw = FILM_STRIP.w;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 18 * scale;
  ctx.fillStyle = '#17130f';
  ctx.fillRect(sx, 0, sw, H);
  ctx.restore();

  ctx.fillStyle = 'rgba(236,228,212,0.92)';
  for (let y = 9; y < H - 8; y += 21) {
    roundedRectPath(ctx, sx + 9, y, 9, 12, 2.2);
    ctx.fill();
    roundedRectPath(ctx, sx + sw - 18, y, 9, 12, 2.2);
    ctx.fill();
  }

  const p = FILM_PHOTO;
  ctx.fillStyle = '#000000';
  ctx.fillRect(p.left - 1, p.top - 1, p.w + 2, p.h + 2);
  withAlpha(ctx, style.photoAlpha, () => {
    drawImageCover(ctx, assets.photo, p.left, p.top, p.w, p.h, style.crop);
  });

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = FILM_AMBER;
  setFont(ctx, 7, 700, SANS);
  drawSpacedText(ctx, `${brandOf(style).name} 400`, p.left, 38, 1.8, 'left');
  drawSpacedText(ctx, '12A', p.left + p.w, 38, 1.8, 'right');

  const bottom = p.top + p.h;
  ctx.save();
  ctx.shadowColor = 'rgba(242,160,61,0.85)';
  ctx.shadowBlur = 5 * scale;
  ctx.fillStyle = FILM_AMBER;
  setFont(ctx, 15, 600, SANS);
  drawSpacedText(ctx, filmDate(info.dateText, dateParts(info)), p.left, bottom + 30, 2.2, 'left');
  ctx.restore();

  ctx.fillStyle = '#efe9dd';
  const maxW = p.w - 70;
  fitFontSize(ctx, info.place, maxW, 24, 12, 700, SANS, 3);
  drawSpacedText(ctx, info.place, p.left, bottom + 54, 3, 'left');
  ctx.fillStyle = 'rgba(239,233,221,0.6)';
  setFont(ctx, 7.5, 500, SANS);
  drawSpacedText(ctx, info.coordText, p.left, bottom + 70, 1.2, 'left');

  const ms = 54;
  const mx = p.left + p.w - ms;
  const my = bottom + 14;
  ctx.save();
  roundedRectPath(ctx, mx, my, ms, ms, 3);
  ctx.clip();
  drawMapWindow(ctx, assets.map, mx, my, ms, ms, tpl, info, style);
  ctx.restore();
  ctx.strokeStyle = 'rgba(239,233,221,0.7)';
  ctx.lineWidth = 0.8;
  roundedRectPath(ctx, mx, my, ms, ms, 3);
  ctx.stroke();

  ctx.fillStyle = 'rgba(242,160,61,0.75)';
  setFont(ctx, 6, 500, SANS);
  drawSpacedText(ctx, sloganOf(style), W / 2, H - 12, 1.8, 'center');
}

function drawPerforatedStamp(ctx, x, y, w, h, holeColor) {
  ctx.fillStyle = '#fffdf6';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = holeColor;
  const step = 8;
  for (let px = x + step / 2; px < x + w; px += step) {
    ctx.beginPath();
    ctx.arc(px, y, 2.4, 0, Math.PI * 2);
    ctx.arc(px, y + h, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let py = y + step / 2; py < y + h; py += step) {
    ctx.beginPath();
    ctx.arc(x, py, 2.4, 0, Math.PI * 2);
    ctx.arc(x + w, py, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

// 明信片：纸张卡片 + 拍立得式照片 + 手写地址线 + 邮票 + 邮戳
function paintPostcard(ctx, scale, assets, info, tpl, style) {
  const W = POSTER_W;
  const H = POSTER_H;
  const paper = '#f7f1e3';

  drawMapRegion(ctx, assets.map, 0, 0, W, H, tpl, info, style);

  const cx = 22;
  const cy = 26;
  const cw = W - 44;
  const ch = H - 52;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 22 * scale;
  ctx.shadowOffsetY = 8 * scale;
  ctx.fillStyle = paper;
  roundedRectPath(ctx, cx, cy, cw, ch, 4);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(120,100,70,0.22)';
  ctx.lineWidth = 0.6;
  ctx.strokeRect(cx + 7, cy + 7, cw - 14, ch - 14);

  const p = POSTCARD_PHOTO;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(p.left - 4, p.top - 4, p.w + 8, p.h + 8);
  withAlpha(ctx, style.photoAlpha, () => {
    drawImageCover(ctx, assets.photo, p.left, p.top, p.w, p.h, style.crop);
  });

  ctx.textBaseline = 'alphabetic';
  const ty = p.top + p.h + 24;
  ctx.fillStyle = '#8a7c66';
  setFont(ctx, 7.5, 600, SANS);
  drawSpacedText(ctx, 'GREETINGS FROM', p.left, ty, 3, 'left');
  ctx.fillStyle = '#2b2622';
  fitFontSize(ctx, info.place, 200, 36, 16, 700, SERIF, 1, 'italic');
  drawSpacedText(ctx, info.place, p.left, ty + 38, 1, 'left');

  ctx.save();
  ctx.strokeStyle = 'rgba(60,50,40,0.38)';
  ctx.lineWidth = 0.6;
  ctx.setLineDash([2, 3]);
  const lines = [ty + 62, ty + 84, ty + 106];
  lines.forEach((ly) => {
    ctx.beginPath();
    ctx.moveTo(p.left, ly);
    ctx.lineTo(p.left + 168, ly);
    ctx.stroke();
  });
  ctx.restore();
  ctx.fillStyle = '#5a4d3c';
  setFont(ctx, 9.5, 400, SERIF, 'italic');
  drawSpacedText(ctx, info.coordText, p.left + 2, lines[0] - 3, 0.6, 'left');
  drawSpacedText(ctx, info.dateText, p.left + 2, lines[1] - 3, 0.6, 'left');
  drawSpacedText(ctx, 'Wish you were here', p.left + 2, lines[2] - 3, 0.6, 'left');

  const stampW = 80;
  const stampH = 100;
  const sx = p.left + p.w - stampW;
  const sy = p.top + p.h + 14;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = 5 * scale;
  ctx.shadowOffsetY = 1.5 * scale;
  drawPerforatedStamp(ctx, sx, sy, stampW, stampH, paper);
  ctx.restore();
  drawPerforatedStamp(ctx, sx, sy, stampW, stampH, paper);
  ctx.save();
  ctx.beginPath();
  ctx.rect(sx + 7, sy + 7, stampW - 14, stampH - 32);
  ctx.clip();
  drawMapWindow(ctx, assets.map, sx + 7, sy + 7, stampW - 14, stampH - 32, tpl, info, style);
  ctx.restore();
  ctx.fillStyle = '#3a3a3a';
  setFont(ctx, 7.5, 800, SANS);
  drawSpacedText(ctx, brandOf(style).name, sx + stampW / 2, sy + stampH - 14, 2.2, 'center');
  setFont(ctx, 5.5, 500, SANS);
  ctx.fillStyle = '#8a8a86';
  drawSpacedText(ctx, 'AIR MAIL', sx + stampW / 2, sy + stampH - 6.5, 1.8, 'center');

  // 邮戳：斜置双圈 + 地名日期 + 波浪消印线
  const pmx = sx - 6;
  const pmy = sy + stampH - 26;
  ctx.save();
  ctx.translate(pmx, pmy);
  ctx.rotate((-12 * Math.PI) / 180);
  ctx.globalAlpha = 0.78;
  ctx.strokeStyle = '#30426e';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.arc(0, 0, 25, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.1;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    for (let x = -100; x <= -33; x += 2) {
      const y = i * 5.5 + Math.sin(x / 4.2) * 2;
      if (x === -100) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.fillStyle = '#30426e';
  fitFontSize(ctx, info.place, 40, 9, 5, 800, SANS, 0.8);
  drawSpacedText(ctx, info.place, 0, -2, 0.8, 'center');
  setFont(ctx, 5.5, 600, SANS);
  drawSpacedText(ctx, info.dateText, 0, 9, 0.5, 'center');
  ctx.restore();

  ctx.fillStyle = '#8a7c66';
  setFont(ctx, 7, 400, SERIF);
  drawSpacedText(ctx, sloganOf(style), W / 2, cy + ch - 18, 2.2, 'center');
}

// 画廊展签：地图作墙面，黑框 + 白色卡纸 + 博物馆式说明牌
function paintGallery(ctx, scale, assets, info, tpl, style) {
  const W = POSTER_W;
  const H = POSTER_H;
  const ink = style.theme.ink;

  drawMapRegion(ctx, assets.map, 0, 0, W, H, tpl, info, style);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = hexToRgba(ink, 0.7);
  setFont(ctx, 7.5, 500, SERIF);
  drawSpacedText(ctx, 'PERMANENT COLLECTION', W / 2, 34, 3.4, 'center');

  const bandTop = 54;
  const bandH = 358;
  const mat = 24;
  const photo = fitInside(assets.photo, 240, 310);
  const fw = photo.w + mat * 2;
  const fh = photo.h + mat * 2;
  const fx = (W - fw) / 2;
  const fy = bandTop + (bandH - fh) / 2;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.38)';
  ctx.shadowBlur = 28 * scale;
  ctx.shadowOffsetY = 12 * scale;
  ctx.fillStyle = '#181614';
  ctx.fillRect(fx - 4, fy - 4, fw + 8, fh + 8);
  ctx.restore();
  ctx.fillStyle = '#faf8f2';
  ctx.fillRect(fx, fy, fw, fh);
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(fx + mat - 1, fy + mat - 1, photo.w + 2, photo.h + 2);
  withAlpha(ctx, style.photoAlpha, () => {
    ctx.drawImage(assets.photo, fx + mat, fy + mat, photo.w, photo.h);
  });

  const pw = 176;
  const ph = 60;
  const px = fx + fw - pw;
  const py = bandTop + bandH + 22;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.22)';
  ctx.shadowBlur = 8 * scale;
  ctx.shadowOffsetY = 2 * scale;
  ctx.fillStyle = '#fdfcf8';
  ctx.fillRect(px, py, pw, ph);
  ctx.restore();
  ctx.fillStyle = '#1a1a1a';
  fitFontSize(ctx, info.place, pw - 24, 11, 7, 800, SANS, 1.6);
  drawSpacedText(ctx, info.place, px + 12, py + 19, 1.6, 'left');
  ctx.fillStyle = '#555555';
  setFont(ctx, 8.5, 400, SERIF, 'italic');
  drawSpacedText(ctx, info.coordText, px + 12, py + 33, 0.4, 'left');
  ctx.fillStyle = '#8a8a86';
  setFont(ctx, 6.5, 500, SANS);
  drawSpacedText(ctx, `${info.dateText}  ·  ARCHIVAL PIGMENT PRINT`, px + 12, py + 48, 0.9, 'left');

  ctx.fillStyle = hexToRgba(ink, 0.7);
  setFont(ctx, 7.5, 400, SERIF);
  drawSpacedText(ctx, sloganOf(style), W / 2, H - 20, 2.4, 'center');
}

// 玻璃卡片：全屏照片 + 底部半透明深色玻璃面板（含迷你地图）
function paintGlass(ctx, scale, assets, info, tpl, style) {
  const W = POSTER_W;
  const H = POSTER_H;

  drawMapRegion(ctx, assets.map, 0, 0, W, H, tpl, info, style);
  drawFullBleedPhoto(ctx, assets, style, 0.28, 0.25);

  ctx.textBaseline = 'alphabetic';
  setFont(ctx, 8, 600, SANS);
  const chipText = info.dateText;
  const chipW = measureSpaced(ctx, chipText, 1.6) + 36;
  const chipX = 20;
  const chipY = 22;
  ctx.fillStyle = 'rgba(18,20,24,0.42)';
  roundedRectPath(ctx, chipX, chipY, chipW, 24, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.32)';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(chipX + 13, chipY + 12, 2.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  drawSpacedText(ctx, chipText, chipX + 23, chipY + 15.3, 1.6, 'left');

  const x = 20;
  const y = H - 176;
  const w = W - 40;
  const h = 156;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 24 * scale;
  ctx.shadowOffsetY = 8 * scale;
  const glass = ctx.createLinearGradient(x, y, x + w, y + h);
  glass.addColorStop(0, 'rgba(24,27,32,0.62)');
  glass.addColorStop(1, 'rgba(14,16,20,0.42)');
  ctx.fillStyle = glass;
  roundedRectPath(ctx, x, y, w, h, 22);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 0.8;
  roundedRectPath(ctx, x, y, w, h, 22);
  ctx.stroke();

  const ms = 128;
  const mx = x + 14;
  const my = y + 14;
  ctx.save();
  roundedRectPath(ctx, mx, my, ms, ms, 16);
  ctx.clip();
  drawMapWindow(ctx, assets.map, mx, my, ms, ms, tpl, info, style);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 0.8;
  roundedRectPath(ctx, mx, my, ms, ms, 16);
  ctx.stroke();

  const tx = mx + ms + 18;
  const tw = x + w - 16 - tx;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  setFont(ctx, 6.5, 600, SANS);
  drawSpacedText(ctx, 'LOCATION', tx, y + 30, 3, 'left');
  ctx.fillStyle = '#ffffff';
  fitFontSize(ctx, info.place, tw, 32, 14, 800, SANS, 1.6);
  drawSpacedText(ctx, info.place, tx, y + 64, 1.6, 'left');
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(tx, y + 78);
  ctx.lineTo(tx + tw, y + 78);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.86)';
  setFont(ctx, 8.5, 500, SANS);
  drawSpacedText(ctx, info.coordText, tx, y + 98, 1, 'left');
  drawSpacedText(ctx, info.dateText, tx, y + 114, 1, 'left');
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  setFont(ctx, 6.5, 400, SERIF, 'italic');
  drawSpacedText(ctx, sloganOf(style), tx, y + 140, 0.9, 'left');
}

// 巨字：全屏照片 + 镂空巨型地名 + 竖排标语 + 圆形迷你地图
function paintTypo(ctx, scale, assets, info, tpl, style) {
  const W = POSTER_W;
  const H = POSTER_H;
  const onPhoto = style.photoAlpha >= 0.5;
  const { main, sub } = photoText(style);

  drawMapRegion(ctx, assets.map, 0, 0, W, H, tpl, info, style);
  drawFullBleedPhoto(ctx, assets, style, 0.3, 0.42);
  withAlpha(ctx, style.photoAlpha, () => {
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(0, 0, W, H);
  });

  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  const size = fitFontSize(ctx, info.place, W - 28, 140, 38, 900, SANS, 2);
  const baseline = H * 0.7;
  ctx.fillStyle = onPhoto ? 'rgba(255,255,255,0.14)' : hexToRgba(style.theme.ink, 0.12);
  ctx.strokeStyle = main;
  ctx.lineWidth = Math.max(0.9, size / 90);
  drawSpacedText(ctx, info.place, 14, baseline, 2, 'left', 'both');

  ctx.strokeStyle = sub;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(20, baseline + 18);
  ctx.lineTo(W - 20, baseline + 18);
  ctx.stroke();
  ctx.fillStyle = main;
  setFont(ctx, 8.5, 500, SANS);
  drawSpacedText(ctx, info.coordText, 20, baseline + 36, 1.6, 'left');
  drawSpacedText(ctx, info.dateText, W - 20, baseline + 36, 1.6, 'right');

  const r = 30;
  const mx = 20 + r;
  const my = 22 + r;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 12 * scale;
  ctx.shadowOffsetY = 3 * scale;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(mx, my, r + 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(mx, my, r, 0, Math.PI * 2);
  ctx.clip();
  drawMapWindow(ctx, assets.map, mx - r, my - r, r * 2, r * 2, tpl, info, style);
  ctx.restore();

  ctx.fillStyle = main;
  setFont(ctx, 9, 800, SANS);
  drawSpacedText(ctx, brandOf(style).name, W - 20, 40, 4.2, 'right');

  ctx.save();
  ctx.translate(W - 15, 190);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = sub;
  setFont(ctx, 6.5, 500, SERIF);
  drawSpacedText(ctx, sloganOf(style), 0, 0, 3.2, 'center');
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* 简约模板（适合批量）：白卡 / 底栏 / 细框 / 侧栏 / 影幕 / 坐标            */
/* 版式固定、文字量少，照片方向与地名长短不同也能保持整批统一               */
/* ------------------------------------------------------------------ */

// 极简白卡：宽边留白，照片下方一行细字说明
function paintMat(ctx, scale, assets, info, tpl, style) {
  const W = POSTER_W;
  const H = POSTER_H;
  const ink = style.theme.ink;
  const p = MAT_PHOTO;

  drawMapRegion(ctx, assets.map, 0, 0, W, H, tpl, info, style);
  withAlpha(ctx, style.photoAlpha, () => {
    drawImageCover(ctx, assets.photo, p.left, p.top, p.w, p.h, style.crop);
  });

  ctx.textBaseline = 'alphabetic';
  const baseline = p.top + p.h + 36;
  ctx.fillStyle = ink;
  setFont(ctx, 8.5, 500, SANS);
  const dateW = measureSpaced(ctx, info.dateText, 1.4);
  fitFontSize(ctx, info.place, W - p.left * 2 - dateW - 24, 17, 9, 700, SANS, 3);
  drawSpacedText(ctx, info.place, p.left, baseline, 3, 'left');
  setFont(ctx, 8.5, 500, SANS);
  ctx.fillStyle = hexToRgba(ink, 0.75);
  drawSpacedText(ctx, info.dateText, W - p.left, baseline, 1.4, 'right');

  ctx.strokeStyle = hexToRgba(ink, 0.25);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(p.left, baseline + 14);
  ctx.lineTo(W - p.left, baseline + 14);
  ctx.stroke();

  ctx.fillStyle = hexToRgba(ink, 0.6);
  setFont(ctx, 7.5, 400, SANS);
  drawSpacedText(ctx, info.coordText, p.left, baseline + 31, 1.2, 'left');
}

// 底栏：照片通栏，底部一条主题色信息栏，右侧迷你地图
function paintBar(ctx, scale, assets, info, tpl, style) {
  const W = POSTER_W;
  const H = POSTER_H;
  const ink = style.theme.ink;
  const p = BAR_PHOTO;
  const top = H - BAR_H;

  drawMapRegion(ctx, assets.map, 0, 0, W, H, tpl, info, style);
  withAlpha(ctx, style.photoAlpha, () => {
    drawImageCover(ctx, assets.photo, p.left, p.top, p.w, p.h, style.crop);
  });

  const ms = 60;
  const mx = W - 24 - ms;
  const my = top + (BAR_H - ms) / 2;
  ctx.save();
  roundedRectPath(ctx, mx, my, ms, ms, 6);
  ctx.clip();
  drawMapWindow(ctx, assets.map, mx, my, ms, ms, tpl, info, style);
  ctx.restore();
  ctx.strokeStyle = hexToRgba(ink, 0.3);
  ctx.lineWidth = 0.6;
  roundedRectPath(ctx, mx, my, ms, ms, 6);
  ctx.stroke();

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ink;
  fitFontSize(ctx, info.place, mx - 16 - 24, 22, 11, 800, SANS, 2);
  drawSpacedText(ctx, info.place, 24, top + 42, 2, 'left');
  ctx.fillStyle = hexToRgba(ink, 0.72);
  setFont(ctx, 8, 500, SANS);
  drawSpacedText(ctx, info.coordText, 24, top + 62, 1.1, 'left');
  drawSpacedText(ctx, info.dateText, 24, top + 78, 1.1, 'left');
}

// 细框：整幅照片 + 内缩发丝线框，地名居中置于底部
function paintFrame(ctx, scale, assets, info, tpl, style) {
  const W = POSTER_W;
  const H = POSTER_H;
  const { main, sub } = photoText(style);

  drawMapRegion(ctx, assets.map, 0, 0, W, H, tpl, info, style);
  drawFullBleedPhoto(ctx, assets, style, 0.2, 0.5);

  const inset = 16;
  ctx.strokeStyle = sub;
  ctx.lineWidth = 0.8;
  ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = sub;
  setFont(ctx, 7.5, 500, SANS);
  drawSpacedText(ctx, info.dateText, W / 2, inset + 26, 4, 'center');

  ctx.fillStyle = main;
  fitFontSize(ctx, info.place, W - 96, 30, 13, 300, SANS, 8);
  drawSpacedText(ctx, info.place, W / 2, H - 78, 8, 'center');

  ctx.strokeStyle = sub;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 14, H - 64);
  ctx.lineTo(W / 2 + 14, H - 64);
  ctx.stroke();

  ctx.fillStyle = sub;
  setFont(ctx, 7.5, 400, SANS);
  drawSpacedText(ctx, info.coordText, W / 2, H - 46, 2.4, 'center');
}

// 侧栏：左侧照片，右侧细长主题色栏，竖排地名从下往上阅读，顶部圆形迷你地图
function paintRail(ctx, scale, assets, info, tpl, style) {
  const W = POSTER_W;
  const H = POSTER_H;
  const ink = style.theme.ink;
  const p = RAIL_PHOTO;
  const cx = W - RAIL_W / 2;

  drawMapRegion(ctx, assets.map, 0, 0, W, H, tpl, info, style);
  withAlpha(ctx, style.photoAlpha, () => {
    drawImageCover(ctx, assets.photo, p.left, p.top, p.w, p.h, style.crop);
  });

  const r = 17;
  const my = 42;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, my, r, 0, Math.PI * 2);
  ctx.clip();
  drawMapWindow(ctx, assets.map, cx - r, my - r, r * 2, r * 2, tpl, info, style);
  ctx.restore();
  ctx.strokeStyle = hexToRgba(ink, 0.35);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(cx, my, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.save();
  ctx.translate(cx - 3, H - 30);
  ctx.rotate(-Math.PI / 2);
  ctx.textBaseline = 'alphabetic';
  const maxW = H - 30 - (my + r + 24);
  ctx.fillStyle = ink;
  fitFontSize(ctx, info.place, maxW, 20, 10, 800, SANS, 3);
  drawSpacedText(ctx, info.place, 0, -4, 3, 'left');
  ctx.fillStyle = hexToRgba(ink, 0.72);
  setFont(ctx, 7.5, 500, SANS);
  drawSpacedText(ctx, info.coordText, 0, 12, 1.2, 'left');
  drawSpacedText(ctx, info.dateText, 0, 24, 1.2, 'left');
  ctx.restore();
}

// 影幕：宽银幕画幅，上下留出主题色黑边，字幕式地名
function paintCinema(ctx, scale, assets, info, tpl, style) {
  const W = POSTER_W;
  const H = POSTER_H;
  const ink = style.theme.ink;
  const p = CINEMA_PHOTO;

  drawMapRegion(ctx, assets.map, 0, 0, W, H, tpl, info, style);
  withAlpha(ctx, style.photoAlpha, () => {
    drawImageCover(ctx, assets.photo, p.left, p.top, p.w, p.h, style.crop);
  });

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = hexToRgba(ink, 0.6);
  setFont(ctx, 7, 500, SANS);
  drawSpacedText(ctx, info.dateText, 24, p.top - 18, 3, 'left');
  drawSpacedText(ctx, 'LOCATION', W - 24, p.top - 18, 3.4, 'right');

  const bottom = p.top + p.h;
  ctx.fillStyle = ink;
  fitFontSize(ctx, info.place, W - 64, 34, 14, 300, SANS, 9);
  drawSpacedText(ctx, info.place, W / 2, bottom + 62, 9, 'center');
  ctx.fillStyle = hexToRgba(ink, 0.65);
  setFont(ctx, 7.5, 400, SANS);
  drawSpacedText(ctx, info.coordText, W / 2, bottom + 88, 2.6, 'center');
}

// 坐标：整幅照片 + 四角测绘标记，经纬度作为主视觉
function paintCoord(ctx, scale, assets, info, tpl, style) {
  const W = POSTER_W;
  const H = POSTER_H;
  const { main, sub } = photoText(style);
  const { lat, lon } = splitCoord(info);

  drawMapRegion(ctx, assets.map, 0, 0, W, H, tpl, info, style);
  drawFullBleedPhoto(ctx, assets, style, 0.22, 0.62);

  const m = 20;
  const t = 12;
  ctx.strokeStyle = sub;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]].forEach(([x, y, dx, dy]) => {
    ctx.moveTo(x + dx * t, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * t);
  });
  ctx.stroke();

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = sub;
  setFont(ctx, 7.5, 500, SANS);
  drawSpacedText(ctx, info.place, m + 10, m + 24, 3, 'left');
  drawSpacedText(ctx, info.dateText, W - m - 10, m + 24, 1.6, 'right');

  ctx.fillStyle = main;
  const size = fitFontSize(ctx, lon.length > lat.length ? lon : lat, W - 2 * (m + 10), 30, 14, 200, SANS, 2);
  drawSpacedText(ctx, lat, m + 10, H - m - 34 - size * 1.15, 2, 'left');
  drawSpacedText(ctx, lon, m + 10, H - m - 34, 2, 'left');
}

// 底端品牌栏：左侧标志与字标，右侧小程序码（没有码图时用文字提示）
function drawBrandFooter(ctx, y0, style, qr) {
  const W = POSTER_W;
  const brand = brandOf(style);
  const dark = style.theme.dark;
  const bg = dark ? '#0f1012' : '#fbfaf7';
  const ink = dark ? '#f2f0ea' : '#161616';
  const sub = dark ? 'rgba(242,240,234,0.6)' : 'rgba(22,22,22,0.55)';

  ctx.save();
  ctx.fillStyle = bg;
  ctx.fillRect(0, y0, W, FOOTER_H);
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(0, y0 + 0.3);
  ctx.lineTo(W, y0 + 0.3);
  ctx.stroke();

  const cy = y0 + FOOTER_H / 2;
  ctx.textBaseline = 'alphabetic';

  if (qr) {
    // 有小程序码：标志与字标靠左两行排列，码图在右
    drawLogoMark(ctx, 34, cy, 11, ink);
    ctx.fillStyle = ink;
    setFont(ctx, 14, 800, SANS);
    drawSpacedText(ctx, brand.name, 54, cy + 1, 4, 'left');
    ctx.fillStyle = sub;
    setFont(ctx, 6.5, 500, SANS);
    drawSpacedText(ctx, brand.tagline, 54, cy + 14, 2.4, 'left');

    const qs = 46;
    const qx = W - 22 - qs;
    const qy = y0 + (FOOTER_H - qs) / 2;
    ctx.fillStyle = '#ffffff';
    roundedRectPath(ctx, qx, qy, qs, qs, 4);
    ctx.fill();
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.1)';
    roundedRectPath(ctx, qx, qy, qs, qs, 4);
    ctx.stroke();
    ctx.drawImage(qr, qx + 3, qy + 3, qs - 6, qs - 6);
  } else {
    // 无码图：单行居中  ◯ GEOPICS | MAP YOUR MOMENT
    const markR = 9;
    const gap = 11;
    setFont(ctx, 13, 800, SANS);
    const nameW = measureSpaced(ctx, brand.name, 5);
    setFont(ctx, 6.5, 500, SANS);
    const tagW = measureSpaced(ctx, brand.tagline, 2.8);
    const divider = 26;
    const total = markR * 2 + gap + nameW + divider + tagW;
    let x = (W - total) / 2;

    drawLogoMark(ctx, x + markR, cy, markR, ink);
    x += markR * 2 + gap;
    ctx.fillStyle = ink;
    setFont(ctx, 13, 800, SANS);
    drawSpacedText(ctx, brand.name, x, cy + 4.6, 5, 'left');
    x += nameW + divider / 2;
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(x, cy - 7);
    ctx.lineTo(x, cy + 7);
    ctx.stroke();
    x += divider / 2;
    ctx.fillStyle = sub;
    setFont(ctx, 6.5, 500, SANS);
    drawSpacedText(ctx, brand.tagline, x, cy + 2.4, 2.8, 'left');
  }
  ctx.restore();
}

function paintEmpty(ctx) {
  const W = POSTER_W;
  const H = POSTER_H;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(60,60,67,0.12)';
  ctx.lineWidth = 0.6;
  ctx.strokeRect(20, 20, W - 40, H - 40);
  ctx.fillStyle = '#1c1c1e';
  ctx.textBaseline = 'alphabetic';
  setFont(ctx, 30, 800, SANS);
  drawSpacedText(ctx, 'GEOPICS', W / 2, H / 2 - 6, 5, 'center');
  ctx.fillStyle = '#8e8e93';
  setFont(ctx, 9, 400, SERIF, 'italic');
  drawSpacedText(ctx, 'SELECT A PHOTO TO BEGIN', W / 2, H / 2 + 18, 2.4, 'center');
}

const PAINTERS = {
  polaroid: paintPolaroid,
  split: paintSplit,
  medallion: paintMedallion,
  magazine: paintMagazine,
  film: paintFilm,
  postcard: paintPostcard,
  gallery: paintGallery,
  glass: paintGlass,
  typo: paintTypo,
  mat: paintMat,
  bar: paintBar,
  frame: paintFrame,
  rail: paintRail,
  cinema: paintCinema,
  coord: paintCoord
};
ADDED_TEMPLATES.forEach((t) => {
  PAINTERS[t.id] = t.paint;
});

/**
 * 统一入口：在任意 2D canvas 上绘制整张海报。
 * @param canvas  Canvas 2D 节点（其 width/height 已设置为物理像素）
 * @param assets  { photo: Image, map: Image|null } 为 null 时绘制占位
 * @param style   { theme, mapAlpha, photoAlpha, textAlpha }，透明度范围 0~1
 */
export function paintPoster(canvas, tplId, assets, info, style) {
  const ctx = canvas.getContext('2d');
  const scale = canvas.width / POSTER_W;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  if (!assets) {
    paintEmpty(ctx);
    if (style && style.footer) drawBrandFooter(ctx, POSTER_H, style, null);
    return;
  }
  const tpl = TEMPLATES.find((t) => t.id === tplId) || TEMPLATES[0];
  setTextAlpha(style.textAlpha);
  try {
    PAINTERS[tpl.id](ctx, scale, assets, info, tpl, style);
  } finally {
    setTextAlpha(1);
  }
  if (style.footer) drawBrandFooter(ctx, POSTER_H, style, assets.qr || null);
}

