/**
 * posters-more.js
 *
 * 本地版新增的 16 个模板：
 *   旅行：登机牌 / 护照印章 / 旅行手账 / 邮票        艺术：字中图 / 双色印刷 / 黑胶唱片 / 蓝图 / 霓虹
 *   杂志：瑞士网格 / 报纸头版                        简约：拱门 / 月历
 *   经典：地图标注                                   复古：印样 / 小票
 * 每个模板自带元数据（分类、定位针位置、取景区域）与绘制函数，由 posters.js 统一注册。
 * 坐标同样基于 400 x 533.33 的逻辑单位。
 */
import {
  POSTER_W, POSTER_H, FULL_PHOTO, SANS, SERIF, DIDOT, FUTURA, CONDENSED, MONO, TYPEWRITER, SCRIPT, ROUNDED,
  CENTER_PIN, tplMap, brandOf, sloganOf, setFont, measureSpaced, drawSpacedText, fitFontSize, ellipsize,
  drawArcText, drawImageCover, withAlpha, drawMapRegion, drawMapWindow, drawFallbackMap, roundedRectPath,
  drawShadowed, makeLayer, drawLayer, drawBarcode, drawGrain, drawPlane, paperOf, vividOf, isNeutral,
  hueOf, hexToRgba, mixHex, splitCoord, dateParts, calendarOf, shortCoord, titleCase, wrapText,
  drawHaloText, circlePath, strokeLine, scaleBar, mulberry32, clamp, pad2, MONTHS_LONG, WEEKDAYS_LONG
} from './poster-kit.js';
import { hexToRgb, hsvToHex } from './themes.js';

const W = POSTER_W;
const H = POSTER_H;
const DEG = Math.PI / 180;
const AMBER = '#F2A03D';

export const MORE_CATEGORIES = [
  { id: 'travel', name: '旅行' },
  { id: 'art', name: '艺术' }
];

// 印在浅色纸面上的深色强调色：中性主题用航空蓝，其余取主题色相的深色
function deepAccent(theme) {
  if (isNeutral(theme.tint)) return theme.dark ? '#2B2D33' : '#1F3F7A';
  return theme.dark ? theme.tint : hsvToHex(hueOf(theme.tint), 0.55, 0.45);
}

const yearOf = (info) => {
  const p = dateParts(info);
  return p ? String(p.y) : '';
};

const capitalize = (s) => titleCase(s);

function rotateAbout(ctx, cx, cy, deg) {
  ctx.translate(cx, cy);
  ctx.rotate(deg * DEG);
  ctx.translate(-cx, -cy);
}

// 含空格的长地名拆成长度接近的两行；断行处的分隔符（· , - / |）去掉
function splitBalanced(text) {
  const words = String(text || '').trim().split(/\s+/);
  if (words.length < 2) return [text];
  const tidy = (s) => s.replace(/^[\s·,，、\-–—/|]+|[\s·,，、\-–—/|]+$/g, '');
  let best = null;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i += 1) {
    const pair = [tidy(words.slice(0, i).join(' ')), tidy(words.slice(i).join(' '))];
    if (!pair[0] || !pair[1]) continue;
    const diff = Math.abs(Array.from(pair[0]).length - Array.from(pair[1]).length);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = pair;
    }
  }
  return best || [text];
}

/* ------------------------------------------------------------------ */
/* 旅行：登机牌                                                          */
/* ------------------------------------------------------------------ */

const BOARDING = { x: 28, y: 28, w: 344, h: H - 56, r: 16, notch: 414 };
const BOARDING_PHOTO = { left: 28, top: 28, w: 344, h: 240 };

// 票面外形：圆角矩形 + 撕线两端的半圆缺口
function ticketPath(ctx, x, y, w, h, r, ny, nr) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, ny - nr);
  ctx.arc(x + w, ny, nr, -Math.PI / 2, Math.PI / 2, true);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, ny + nr);
  ctx.arc(x, ny, nr, Math.PI / 2, -Math.PI / 2, true);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function paintBoarding(ctx, scale, assets, info, tpl, style) {
  const t = BOARDING;
  const accent = deepAccent(style.theme);
  const paper = '#FBF9F4';
  const ink = '#1D1D1F';
  const label = '#8F8B82';

  drawMapRegion(ctx, assets.map, 0, 0, W, H, tpl, info, style);
  drawShadowed(ctx, scale, 26, 10, 'rgba(0,0,0,0.3)', () => {
    ticketPath(ctx, t.x, t.y, t.w, t.h, t.r, t.notch, 9);
    ctx.fillStyle = paper;
    ctx.fill();
  });

  const p = BOARDING_PHOTO;
  ctx.save();
  ticketPath(ctx, t.x, t.y, t.w, t.h, t.r, t.notch, 9);
  ctx.clip();
  withAlpha(ctx, style.photoAlpha, () => drawImageCover(ctx, assets.photo, p.left, p.top, p.w, p.h, style.crop));
  ctx.restore();

  ctx.textBaseline = 'alphabetic';
  const x0 = t.x + 20;
  const x1 = t.x + t.w - 20;
  drawPlane(ctx, x0 + 6, 289, 13, accent);
  ctx.fillStyle = accent;
  setFont(ctx, 7, 700, FUTURA);
  drawSpacedText(ctx, 'BOARDING PASS', x0 + 18, 292, 2.6, 'left');

  const brand = brandOf(style).name;
  setFont(ctx, 6.5, 800, FUTURA);
  const bw = measureSpaced(ctx, brand, 2) + 16;
  ctx.fillStyle = accent;
  roundedRectPath(ctx, x1 - bw, 282, bw, 14, 7);
  ctx.fill();
  ctx.fillStyle = paper;
  drawSpacedText(ctx, brand, x1 - bw / 2, 291.6, 2, 'center');

  ctx.fillStyle = label;
  setFont(ctx, 6, 700, FUTURA);
  drawSpacedText(ctx, 'DESTINATION', x0, 318, 2.2, 'left');
  ctx.fillStyle = ink;
  fitFontSize(ctx, info.place, x1 - x0, 40, 18, 800, FUTURA, 1.5);
  drawSpacedText(ctx, info.place, x0 - 1, 354, 1.5, 'left');

  const { lat, lon } = shortCoord(info);
  const fields = [['DATE', info.dateText], ['TIME', info.time || '--:--'], ['LAT', lat], ['LON', lon]];
  const colW = (x1 - x0) / 4;
  fields.forEach(([k, v], i) => {
    const x = x0 + i * colW;
    ctx.fillStyle = label;
    setFont(ctx, 5.5, 700, FUTURA);
    drawSpacedText(ctx, k, x, 380, 1.8, 'left');
    ctx.fillStyle = ink;
    fitFontSize(ctx, v || '—', colW - 8, 9, 6, 700, FUTURA, 0.6);
    drawSpacedText(ctx, v || '—', x, 395, 0.6, 'left');
  });

  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 0.8;
  ctx.setLineDash([3, 3]);
  strokeLine(ctx, t.x + 14, t.notch, t.x + t.w - 14, t.notch);
  ctx.restore();

  drawBarcode(ctx, x0, 430, 206, 36, info.seed, ink);
  ctx.fillStyle = label;
  setFont(ctx, 5.5, 500, MONO);
  drawSpacedText(ctx, ellipsize(ctx, info.coordText, 206, 1), x0, 480, 1, 'left');

  const ms = 58;
  const mx = x1 - ms;
  const my = 428;
  ctx.save();
  roundedRectPath(ctx, mx, my, ms, ms, 8);
  ctx.clip();
  drawMapWindow(ctx, assets.map, mx, my, ms, ms, tpl, info, style);
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 0.6;
  roundedRectPath(ctx, mx, my, ms, ms, 8);
  ctx.stroke();
}

/* ------------------------------------------------------------------ */
/* 旅行：护照印章                                                         */
/* ------------------------------------------------------------------ */

const PASSPORT_PHOTO = { left: 62, top: 92, w: 222, h: 262 };
const STAMP_RED = '#B3261E';

function paintPassport(ctx, scale, assets, info, tpl, style) {
  const { theme } = style;
  const dark = theme.dark;
  const ink = dark ? '#F1EDE4' : '#2A2622';
  const page = dark ? mixHex(theme.tint, '#000000', 0.25) : mixHex(paperOf(theme), '#F5F0E4', 0.6);
  const accent = dark ? vividOf(theme, '#8FB3FF', 0.4, 0.95) : deepAccent(theme);

  drawMapRegion(ctx, assets.map, 0, 0, W, H, tpl, info, style);
  ctx.fillStyle = hexToRgba(page, dark ? 0.8 : 0.78);
  ctx.fillRect(0, 0, W, H);

  // 防伪底纹：细密的正弦波纹
  ctx.save();
  ctx.strokeStyle = hexToRgba(accent, dark ? 0.16 : 0.11);
  ctx.lineWidth = 0.5;
  for (let k = 0; k < 22; k += 1) {
    ctx.beginPath();
    for (let x = 0; x <= W; x += 4) {
      const y = 40 + k * 22 + Math.sin(x / 17 + k * 0.7) * 5 + Math.sin(x / 41) * 3;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = hexToRgba(ink, 0.7);
  setFont(ctx, 8.5, 700, FUTURA);
  drawSpacedText(ctx, 'VISAS · 签证', W / 2, 42, 6, 'center');
  ctx.strokeStyle = hexToRgba(ink, 0.25);
  ctx.lineWidth = 0.5;
  strokeLine(ctx, 40, 54, W - 40, 54);

  // 照片：带白边的相纸，略微倾斜
  const p = PASSPORT_PHOTO;
  ctx.save();
  rotateAbout(ctx, p.left + p.w / 2, p.top + p.h / 2, -4);
  drawShadowed(ctx, scale, 12, 4, 'rgba(0,0,0,0.28)', () => {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(p.left - 7, p.top - 7, p.w + 14, p.h + 14);
  });
  withAlpha(ctx, style.photoAlpha, () => drawImageCover(ctx, assets.photo, p.left, p.top, p.w, p.h, style.crop));
  ctx.restore();

  // 地图贴纸
  const ms = 76;
  const mx = 300;
  const my = 70;
  ctx.save();
  rotateAbout(ctx, mx + ms / 2, my + ms / 2, 6);
  drawShadowed(ctx, scale, 8, 3, 'rgba(0,0,0,0.25)', () => {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(mx - 3, my - 3, ms + 6, ms + 6);
  });
  drawMapWindow(ctx, assets.map, mx, my, ms, ms, tpl, info, style);
  ctx.restore();

  // 印章画在独立图层上，打上随机缺墨再以正片叠底贴回，模拟真实盖印
  const layer = makeLayer(ctx);
  const l = layer.ctx;
  const dp = dateParts(info);
  const stampDate = dp ? `${pad2(dp.d)} ${MONTHS_LONG[dp.m - 1].slice(0, 3)} ${dp.y}` : info.dateText;

  l.save();
  const rx = 286;
  const ry = 352;
  const rr = 60;
  const red = dark ? '#E8675A' : STAMP_RED;
  l.translate(rx, ry);
  l.rotate(10 * DEG);
  l.strokeStyle = red;
  l.fillStyle = red;
  l.lineWidth = 2.2;
  circlePath(l, 0, 0, rr);
  l.stroke();
  l.lineWidth = 0.8;
  circlePath(l, 0, 0, rr - 5);
  l.stroke();
  circlePath(l, 0, 0, rr - 23);
  l.stroke();
  l.textBaseline = 'middle';
  setFont(l, 9, 800, FUTURA);
  drawArcText(l, ellipsize(l, info.place, 130, 1.6), 0, 0, rr - 14, -Math.PI / 2, 1.6, false);
  setFont(l, 7, 800, FUTURA);
  drawArcText(l, 'ARRIVAL · 入境', 0, 0, rr - 14, Math.PI / 2, 1.6, true);
  l.textBaseline = 'alphabetic';
  setFont(l, 8.5, 800, FUTURA);
  drawSpacedText(l, stampDate, 0, 3, 0.6, 'center');
  l.lineWidth = 0.8;
  strokeLine(l, -26, -9, 26, -9);
  strokeLine(l, -26, 10, 26, 10);
  l.restore();

  l.save();
  const bx = 48;
  const by = 402;
  const bw = 164;
  const bh = 70;
  rotateAbout(l, bx + bw / 2, by + bh / 2, -7);
  l.strokeStyle = accent;
  l.fillStyle = accent;
  l.lineWidth = 2;
  roundedRectPath(l, bx, by, bw, bh, 9);
  l.stroke();
  l.lineWidth = 0.7;
  roundedRectPath(l, bx + 4, by + 4, bw - 8, bh - 8, 6);
  l.stroke();
  drawPlane(l, bx + 22, by + 35, 20, accent);
  l.textBaseline = 'alphabetic';
  setFont(l, 6.5, 800, FUTURA);
  drawSpacedText(l, 'ENTRY PERMITTED', bx + 42, by + 22, 1.6, 'left');
  fitFontSize(l, info.coordText, bw - 54, 8.5, 6, 800, FUTURA, 0.4);
  drawSpacedText(l, info.coordText, bx + 42, by + 39, 0.4, 'left');
  setFont(l, 6.5, 700, FUTURA);
  drawSpacedText(l, [info.time, stampDate].filter(Boolean).join('  ·  '), bx + 42, by + 55, 1, 'left');
  l.restore();

  const rand = mulberry32(info.seed);
  l.globalCompositeOperation = 'destination-out';
  l.fillStyle = '#000000';
  for (let i = 0; i < 900; i += 1) {
    const x = 30 + rand() * 340;
    const y = 280 + rand() * 220;
    const r = 0.25 + rand() * 1.1;
    l.globalAlpha = 0.4 + rand() * 0.6;
    l.fillRect(x, y, r * 1.6, r);
  }
  l.globalAlpha = 1;
  l.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.globalCompositeOperation = dark ? 'source-over' : 'multiply';
  drawLayer(ctx, layer, 0.88);
  ctx.restore();

  ctx.fillStyle = hexToRgba(ink, 0.55);
  setFont(ctx, 6, 700, FUTURA);
  drawSpacedText(ctx, brandOf(style).name, 40, H - 20, 3, 'left');
  setFont(ctx, 8, 700, FUTURA);
  drawSpacedText(ctx, pad2((info.seed % 44) + 3), W - 40, H - 20, 1, 'right');
}

/* ------------------------------------------------------------------ */
/* 旅行：旅行手账                                                         */
/* ------------------------------------------------------------------ */

const JOURNAL_PHOTO = { left: 46, top: 82, w: 236, h: 266 };

function washiTape(ctx, cx, cy, w, h, deg, color, seed) {
  const rand = mulberry32(seed);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(deg * DEG);
  ctx.beginPath();
  const teeth = 5;
  ctx.moveTo(-w / 2, -h / 2);
  ctx.lineTo(w / 2, -h / 2);
  for (let i = 1; i <= teeth; i += 1) ctx.lineTo(w / 2 + (i % 2 ? -2.2 : 0) + rand(), -h / 2 + (h * i) / teeth);
  ctx.lineTo(-w / 2, h / 2);
  for (let i = teeth - 1; i >= 0; i -= 1) ctx.lineTo(-w / 2 + (i % 2 ? 2.2 : 0) - rand(), -h / 2 + (h * i) / teeth);
  ctx.closePath();
  ctx.fillStyle = hexToRgba(color, 0.62);
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let x = -w; x < w; x += 7) strokeLine(ctx, x, h, x + h, -h);
  ctx.restore();
}

// 撕边纸片：沿矩形四边加抖动
function tornPath(ctx, x, y, w, h, seed, jitter) {
  const rand = mulberry32(seed);
  const j = () => (rand() - 0.5) * jitter;
  ctx.beginPath();
  ctx.moveTo(x + j(), y + j());
  for (let px = x + 6; px < x + w; px += 6) ctx.lineTo(px, y + j());
  for (let py = y + 6; py < y + h; py += 6) ctx.lineTo(x + w + j(), py);
  for (let px = x + w - 6; px > x; px -= 6) ctx.lineTo(px, y + h + j());
  for (let py = y + h - 6; py > y; py -= 6) ctx.lineTo(x + j(), py);
  ctx.closePath();
}

function paintJournal(ctx, scale, assets, info, tpl, style) {
  const { theme } = style;
  const dark = theme.dark;
  const page = dark ? mixHex(theme.tint, '#000000', 0.12) : mixHex(theme.tint, '#FFFFFF', 0.62);
  const ink = dark ? '#EFEAE0' : '#3A332C';
  const accent = dark ? vividOf(theme, '#F4A259', 0.5, 0.95) : isNeutral(theme.tint) ? '#D9785B' : hsvToHex(hueOf(theme.tint), 0.5, 0.78);
  const tape2 = isNeutral(theme.tint) ? '#7FA7C9' : hsvToHex((hueOf(theme.tint) + 150) % 360, 0.38, 0.85);

  ctx.fillStyle = page;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = hexToRgba(ink, dark ? 0.16 : 0.13);
  for (let y = 14; y < H; y += 14) {
    for (let x = 14; x < W; x += 14) ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
  }

  const dp = dateParts(info);
  const cal = dp ? calendarOf(dp) : null;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ink;
  setFont(ctx, 8, 400, TYPEWRITER);
  drawSpacedText(ctx, cal ? `${WEEKDAYS_LONG[cal.weekday].slice(0, 3)} · ${info.dateText}` : info.dateText, 40, 40, 1.2, 'left');
  drawSpacedText(ctx, cal ? `No.${String(cal.doy).padStart(3, '0')}` : '', W - 40, 40, 1.2, 'right');
  ctx.strokeStyle = hexToRgba(ink, 0.3);
  ctx.lineWidth = 0.6;
  strokeLine(ctx, 40, 48, W - 40, 48);

  // 地图纸片（先画，被照片压住一角）
  const mx = 238;
  const my = 300;
  const ms = 128;
  ctx.save();
  rotateAbout(ctx, mx + ms / 2, my + ms / 2, 5);
  drawShadowed(ctx, scale, 6, 2, 'rgba(0,0,0,0.2)', () => {
    tornPath(ctx, mx - 5, my - 5, ms + 10, ms + 10, info.seed + 3, 3.2);
    ctx.fillStyle = '#FFFEFA';
    ctx.fill();
  });
  tornPath(ctx, mx, my, ms, ms, info.seed + 5, 2.2);
  ctx.clip();
  drawMapWindow(ctx, assets.map, mx - 4, my - 4, ms + 8, ms + 8, tpl, info, style);
  ctx.restore();
  washiTape(ctx, mx + ms / 2, my - 2, 64, 16, -4, tape2, info.seed + 9);

  const p = JOURNAL_PHOTO;
  ctx.save();
  rotateAbout(ctx, p.left + p.w / 2, p.top + p.h / 2, -3.5);
  drawShadowed(ctx, scale, 10, 4, 'rgba(0,0,0,0.25)', () => {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(p.left - 8, p.top - 8, p.w + 16, p.h + 30);
  });
  withAlpha(ctx, style.photoAlpha, () => drawImageCover(ctx, assets.photo, p.left, p.top, p.w, p.h, style.crop));
  ctx.fillStyle = '#6B6259';
  setFont(ctx, 8, 400, TYPEWRITER);
  drawSpacedText(ctx, [info.time, info.camera].filter(Boolean).join(' · ') || info.coordText, p.left, p.top + p.h + 15, 0.6, 'left');
  ctx.restore();
  washiTape(ctx, p.left + 6, p.top - 4, 70, 18, -38, accent, info.seed + 1);
  washiTape(ctx, p.left + p.w - 4, p.top - 2, 70, 18, 34, accent, info.seed + 2);

  // 日期贴纸
  if (dp) {
    const sx = p.left + p.w + 4;
    const sy = p.top + 62;
    drawShadowed(ctx, scale, 5, 2, 'rgba(0,0,0,0.22)', () => {
      ctx.fillStyle = accent;
      circlePath(ctx, sx, sy, 23);
      ctx.fill();
    });
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 0.8;
    ctx.setLineDash([2, 2]);
    circlePath(ctx, sx, sy, 19);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#FFFFFF';
    setFont(ctx, 16, 800, ROUNDED);
    drawSpacedText(ctx, String(dp.d), sx, sy + 3, 0, 'center');
    setFont(ctx, 5.5, 800, ROUNDED);
    drawSpacedText(ctx, MONTHS_LONG[dp.m - 1].slice(0, 3), sx, sy + 12, 1.2, 'center');
  }

  // 手写地名 + 下划线 + 虚线箭头
  ctx.fillStyle = ink;
  const place = titleCase(info.place);
  fitFontSize(ctx, place, 196, 40, 18, 400, SCRIPT, 0.5);
  drawSpacedText(ctx, place, 42, 426, 0.5, 'left');
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(44, 438);
  ctx.bezierCurveTo(90, 432, 140, 444, 206, 434);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = hexToRgba(ink, 0.75);
  setFont(ctx, 7.5, 400, TYPEWRITER);
  drawSpacedText(ctx, info.coordText, 44, 460, 0.8, 'left');
  ctx.fillStyle = hexToRgba(ink, 0.55);
  setFont(ctx, 6.5, 400, TYPEWRITER);
  drawSpacedText(ctx, ellipsize(ctx, sloganOf(style), 190, 0.6), 44, 476, 0.6, 'left');

  ctx.save();
  ctx.strokeStyle = hexToRgba(ink, 0.55);
  ctx.lineWidth = 0.9;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(214, 458);
  ctx.bezierCurveTo(236, 488, 262, 480, 262, 450);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(257, 456);
  ctx.lineTo(262, 448);
  ctx.lineTo(266, 457);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = hexToRgba(ink, 0.5);
  setFont(ctx, 6, 700, FUTURA);
  drawSpacedText(ctx, brandOf(style).name, W - 40, H - 22, 3, 'right');
}

/* ------------------------------------------------------------------ */
/* 旅行：邮票                                                            */
/* ------------------------------------------------------------------ */

const STAMP = { x: 50, y: 66, w: 272, h: 344 };
const STAMP_PHOTO = { left: 66, top: 82, w: 240, h: 254 };
const STAMP_PIN = { x: 0.84, y: 0.86 };

function paintStamp(ctx, scale, assets, info, tpl, style) {
  const { theme } = style;
  const ink = theme.ink;
  const halo = theme.dark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.75)';
  const post = theme.dark ? '#DCE3F5' : '#2F3D66';
  drawMapRegion(ctx, assets.map, 0, 0, W, H, tpl, info, style);

  // 航空信封边：红蓝斜纹
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, H - 10, W, 10);
  ctx.rect(0, 0, W, 10);
  ctx.clip();
  for (let x = -20, i = 0; x < W + 20; x += 14, i += 1) {
    ctx.fillStyle = i % 2 ? '#C8323A' : '#2B4C8C';
    ctx.beginPath();
    ctx.moveTo(x, H);
    ctx.lineTo(x + 7, H);
    ctx.lineTo(x + 17, H - 10);
    ctx.lineTo(x + 10, H - 10);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, 10);
    ctx.lineTo(x + 7, 10);
    ctx.lineTo(x + 17, 0);
    ctx.lineTo(x + 10, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  const s = STAMP;
  const p = STAMP_PHOTO;
  const layer = makeLayer(ctx);
  const l = layer.ctx;
  l.save();
  rotateAbout(l, s.x + s.w / 2, s.y + s.h / 2, -2);
  l.fillStyle = '#FFFDF7';
  l.fillRect(s.x, s.y, s.w, s.h);
  l.globalCompositeOperation = 'destination-out';
  const step = 11.3;
  const hr = 4;
  l.beginPath();
  for (let x = s.x + step / 2; x < s.x + s.w; x += step) {
    l.moveTo(x + hr, s.y);
    l.arc(x, s.y, hr, 0, Math.PI * 2);
    l.moveTo(x + hr, s.y + s.h);
    l.arc(x, s.y + s.h, hr, 0, Math.PI * 2);
  }
  for (let y = s.y + step / 2; y < s.y + s.h; y += step) {
    l.moveTo(s.x + hr, y);
    l.arc(s.x, y, hr, 0, Math.PI * 2);
    l.moveTo(s.x + s.w + hr, y);
    l.arc(s.x + s.w, y, hr, 0, Math.PI * 2);
  }
  l.fill();
  l.globalCompositeOperation = 'source-over';
  withAlpha(l, style.photoAlpha, () => drawImageCover(l, assets.photo, p.left, p.top, p.w, p.h, style.crop));
  l.strokeStyle = 'rgba(0,0,0,0.25)';
  l.lineWidth = 0.6;
  l.strokeRect(p.left, p.top, p.w, p.h);

  l.textBaseline = 'alphabetic';
  const year = yearOf(info);
  l.fillStyle = '#1E1B18';
  setFont(l, 20, 800, FUTURA);
  const yw = year ? measureSpaced(l, year, 0.5) : 0;
  if (year) drawSpacedText(l, year, p.left + p.w, p.top + p.h + 32, 0.5, 'right');
  fitFontSize(l, info.place, p.w - yw - 16, 20, 10, 700, SERIF, 1.2);
  drawSpacedText(l, info.place, p.left, p.top + p.h + 32, 1.2, 'left');
  l.fillStyle = '#7A7268';
  setFont(l, 6, 600, FUTURA);
  drawSpacedText(l, ellipsize(l, info.coordText, p.w - 70, 1), p.left, p.top + p.h + 50, 1, 'left');
  drawSpacedText(l, `${brandOf(style).name} POST`, p.left + p.w, p.top + p.h + 50, 1.6, 'right');
  l.restore();

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 14 * scale;
  ctx.shadowOffsetY = 5 * scale;
  drawLayer(ctx, layer);
  ctx.restore();

  // 邮戳 + 波浪消印线
  const dp = dateParts(info);
  ctx.save();
  ctx.translate(318, 100);
  ctx.rotate(14 * DEG);
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = post;
  ctx.fillStyle = post;
  ctx.lineWidth = 1.6;
  circlePath(ctx, 0, 0, 38);
  ctx.stroke();
  ctx.lineWidth = 0.7;
  circlePath(ctx, 0, 0, 33);
  ctx.stroke();
  ctx.textBaseline = 'middle';
  setFont(ctx, 6.5, 800, FUTURA);
  drawArcText(ctx, ellipsize(ctx, info.place, 70, 1.2), 0, 0, 27, -Math.PI / 2, 1.2, false);
  setFont(ctx, 5.5, 800, FUTURA);
  drawArcText(ctx, 'AIR MAIL', 0, 0, 27, Math.PI / 2, 1.4, true);
  ctx.textBaseline = 'alphabetic';
  setFont(ctx, 7, 800, FUTURA);
  drawSpacedText(ctx, dp ? `${pad2(dp.d)}.${pad2(dp.m)}.${dp.y}` : info.dateText, 0, 2.5, 0.2, 'center');
  ctx.lineWidth = 1.1;
  for (let i = -2; i <= 2; i += 1) {
    ctx.beginPath();
    for (let x = -44; x >= -150; x -= 2) {
      const y = i * 6 + Math.sin(x / 4.5) * 2;
      if (x === -44) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = ink;
  const place = titleCase(info.place);
  fitFontSize(ctx, `To ${place}`, 250, 24, 12, 400, SCRIPT, 0.3);
  drawHaloText(ctx, `To ${place}`, 58, 462, 0.3, 'left', halo, 4);
  ctx.fillStyle = hexToRgba(ink, 0.8);
  setFont(ctx, 7.5, 400, TYPEWRITER);
  drawHaloText(ctx, [info.dateText, info.time].filter(Boolean).join('  ·  '), 60, 484, 0.6, 'left', halo, 3);
}

/* ------------------------------------------------------------------ */
/* 艺术：字中图                                                          */
/* ------------------------------------------------------------------ */

const CUTOUT_BOX = { left: 18, top: 112, w: 364, h: 250 };
const CUTOUT_PIN = { x: 0.5, y: 0.8 };

// 把蒙版图层向四周膨胀 radius 个逻辑单位并填色，得到贴纸式的描边底
function dilateLayer(ctx, mask, radius, color) {
  const out = makeLayer(ctx);
  const o = out.ctx;
  const r = radius * mask.scale;
  o.save();
  o.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    o.drawImage(mask.canvas, Math.cos(a) * r, Math.sin(a) * r);
  }
  o.globalCompositeOperation = 'source-in';
  o.fillStyle = color;
  o.fillRect(0, 0, out.canvas.width, out.canvas.height);
  o.restore();
  return out;
}

function paintCutout(ctx, scale, assets, info, tpl, style) {
  const { theme } = style;
  const ink = theme.ink;
  const halo = theme.dark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.7)';
  drawMapRegion(ctx, assets.map, 0, 0, W, H, tpl, info, style);

  const b = CUTOUT_BOX;
  const mask = makeLayer(ctx);
  const m = mask.ctx;
  const text = (info.place || '').trim() || '—';
  let lines = [text];
  if (/\s/.test(text) && fitFontSize(m, text, b.w, 220, 20, 900, CONDENSED, 0) < 96) lines = splitBalanced(text);
  const gap = 12;
  const rowH = (b.h - gap * (lines.length - 1)) / lines.length;
  const rows = lines.map((ln) => {
    const size = fitFontSize(m, ln, b.w, 220, 20, 900, CONDENSED, 0);
    const mt = m.measureText(ln);
    const asc = mt.actualBoundingBoxAscent || size * 0.72;
    const desc = mt.actualBoundingBoxDescent || 0;
    const stretch = clamp(rowH / (asc + desc), 1, 2.2);
    return { ln, size, asc, stretch, h: (asc + desc) * stretch };
  });
  let y = b.top + (b.h - rows.reduce((s, r) => s + r.h, 0) - gap * (rows.length - 1)) / 2;
  m.fillStyle = '#FFFFFF';
  m.textAlign = 'center';
  m.textBaseline = 'alphabetic';
  rows.forEach((r) => {
    setFont(m, r.size, 900, CONDENSED);
    m.save();
    m.translate(W / 2, y + r.asc * r.stretch);
    m.scale(1, r.stretch);
    m.fillText(r.ln, 0, 0);
    m.restore();
    y += r.h + gap;
  });

  const border = dilateLayer(ctx, mask, 3, theme.dark ? '#F4F1EA' : '#FFFFFF');
  m.globalCompositeOperation = 'source-in';
  drawImageCover(m, assets.photo, b.left, b.top, b.w, b.h, style.crop);
  m.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 14 * scale;
  ctx.shadowOffsetY = 5 * scale;
  drawLayer(ctx, border);
  ctx.restore();
  drawLayer(ctx, mask, style.photoAlpha);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ink;
  setFont(ctx, 8, 800, FUTURA);
  drawHaloText(ctx, brandOf(style).name, 24, 42, 3.2, 'left', halo, 3);
  setFont(ctx, 8, 600, FUTURA);
  drawHaloText(ctx, info.dateText, W - 24, 42, 2, 'right', halo, 3);
  setFont(ctx, 8.5, 600, FUTURA);
  drawHaloText(ctx, info.coordText, W / 2, H * CUTOUT_PIN.y + 26, 3, 'center', halo, 3);
  ctx.fillStyle = hexToRgba(ink, 0.7);
  setFont(ctx, 6, 500, SERIF);
  drawHaloText(ctx, sloganOf(style), W / 2, H - 36, 2.4, 'center', halo, 3);
}

/* ------------------------------------------------------------------ */
/* 艺术：双色印刷                                                         */
/* ------------------------------------------------------------------ */

export function duotoneColors(theme) {
  if (isNeutral(theme.tint)) return theme.dark ? ['#15171C', '#F2C14E'] : ['#1E2A4A', '#F6C9A8'];
  const h = hueOf(theme.tint);
  return theme.dark
    ? [mixHex(theme.tint, '#000000', 0.2), hsvToHex((h + 180) % 360, 0.45, 1)]
    : [hsvToHex(h, 0.6, 0.3), hsvToHex((h + 30) % 360, 0.28, 0.98)];
}

// 把图层上的像素按亮度映射到两种颜色之间，并加少量颗粒
function duotoneLayer(layer, darkHex, lightHex, seed) {
  const { canvas, ctx } = layer;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const a = hexToRgb(darkHex);
  const b = hexToRgb(lightHex);
  const rand = mulberry32(seed);
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    let t = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    t = t * t * (3 - 2 * t);
    t = clamp(t + (rand() - 0.5) * 0.07, 0, 1);
    d[i] = a.r + (b.r - a.r) * t;
    d[i + 1] = a.g + (b.g - a.g) * t;
    d[i + 2] = a.b + (b.b - a.b) * t;
  }
  ctx.putImageData(img, 0, 0);
}

function registrationMark(ctx, x, y, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.7;
  circlePath(ctx, x, y, 4.5);
  ctx.stroke();
  strokeLine(ctx, x - 8, y, x + 8, y);
  strokeLine(ctx, x, y - 8, x, y + 8);
}

function paintDuotone(ctx, scale, assets, info, tpl, style) {
  const [dark, light] = duotoneColors(style.theme);
  drawMapRegion(ctx, assets.map, 0, 0, W, H, tpl, info, style);

  const layer = makeLayer(ctx);
  drawImageCover(layer.ctx, assets.photo, 0, 0, W, H, style.crop);
  duotoneLayer(layer, dark, light, info.seed);
  drawLayer(ctx, layer, style.photoAlpha);

  const bandH = 118;
  const by = H - bandH;
  ctx.fillStyle = dark;
  ctx.fillRect(0, by, W, bandH);
  // 半调网点过渡
  ctx.fillStyle = dark;
  for (let row = 0; row < 4; row += 1) {
    const r = 2.6 - row * 0.6;
    for (let x = 3 + (row % 2) * 3; x < W; x += 6) {
      circlePath(ctx, x, by - 3 - row * 5, r);
      ctx.fill();
    }
  }

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = light;
  fitFontSize(ctx, info.place, W - 120, 42, 18, 800, FUTURA, 1);
  drawSpacedText(ctx, info.place, 24, by + 54, 1, 'left');
  ctx.fillStyle = hexToRgba(light, 0.82);
  setFont(ctx, 7.5, 600, FUTURA);
  drawSpacedText(ctx, info.coordText, 24, by + 74, 1.6, 'left');
  drawSpacedText(ctx, info.dateText, 24, by + 88, 1.6, 'left');
  ctx.fillStyle = hexToRgba(light, 0.55);
  setFont(ctx, 5.5, 600, FUTURA);
  drawSpacedText(ctx, ellipsize(ctx, sloganOf(style), 230, 1.8), 24, by + 104, 1.8, 'left');

  const r = 32;
  const mx = W - 24 - r;
  const my = by + bandH / 2 - 2;
  ctx.save();
  circlePath(ctx, mx, my, r);
  ctx.clip();
  drawMapWindow(ctx, assets.map, mx - r, my - r, r * 2, r * 2, tpl, info, style);
  ctx.restore();
  ctx.strokeStyle = light;
  ctx.lineWidth = 1;
  circlePath(ctx, mx, my, r + 3);
  ctx.stroke();

  registrationMark(ctx, 20, 20, hexToRgba(light, 0.9));
  registrationMark(ctx, W - 20, 20, hexToRgba(light, 0.9));
}

/* ------------------------------------------------------------------ */
/* 艺术：黑胶唱片                                                         */
/* ------------------------------------------------------------------ */

const VINYL_SLEEVE = { left: 24, top: 56, w: 256, h: 256 };

function paintVinyl(ctx, scale, assets, info, tpl, style) {
  const { theme } = style;
  const ink = theme.ink;
  drawMapRegion(ctx, assets.map, 0, 0, W, H, tpl, info, style);

  const s = VINYL_SLEEVE;
  const r = 104;
  const cx = s.left + s.w + 12;
  const cy = s.top + s.h / 2;
  drawShadowed(ctx, scale, 16, 5, 'rgba(0,0,0,0.35)', () => {
    ctx.fillStyle = '#111112';
    circlePath(ctx, cx, cy, r);
    ctx.fill();
  });
  ctx.save();
  circlePath(ctx, cx, cy, r);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 0.6;
  for (let rr = 42; rr < r - 3; rr += 2.3) {
    circlePath(ctx, cx, cy, rr);
    ctx.stroke();
  }
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0.28, 'rgba(255,255,255,0)');
  g.addColorStop(0.42, 'rgba(255,255,255,0.12)');
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.08)');
  g.addColorStop(0.7, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();

  const lr = 36;
  ctx.save();
  circlePath(ctx, cx, cy, lr);
  ctx.clip();
  drawMapWindow(ctx, assets.map, cx - lr, cy - lr, lr * 2, lr * 2, tpl, info, style);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 0.8;
  circlePath(ctx, cx, cy, lr);
  ctx.stroke();
  ctx.fillStyle = '#111112';
  circlePath(ctx, cx, cy, 3);
  ctx.fill();

  drawShadowed(ctx, scale, 22, 8, 'rgba(0,0,0,0.4)', () => {
    ctx.fillStyle = '#202020';
    ctx.fillRect(s.left, s.top, s.w, s.h);
  });
  withAlpha(ctx, style.photoAlpha, () => drawImageCover(ctx, assets.photo, s.left, s.top, s.w, s.h, style.crop));
  const sheen = ctx.createLinearGradient(s.left, s.top, s.left + s.w, s.top + s.h);
  sheen.addColorStop(0, 'rgba(255,255,255,0.16)');
  sheen.addColorStop(0.35, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(s.left, s.top, s.w, s.h);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 0.6;
  ctx.strokeRect(s.left + 0.3, s.top + 0.3, s.w - 0.6, s.h - 0.6);

  const brand = brandOf(style).name;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ink;
  fitFontSize(ctx, info.place, W - 48, 32, 16, 800, FUTURA, 1);
  drawSpacedText(ctx, info.place, 23, 356, 1, 'left');
  ctx.fillStyle = hexToRgba(ink, 0.7);
  setFont(ctx, 8, 500, FUTURA);
  drawSpacedText(ctx, `${brand} · ${info.dateText}`, 24, 374, 1.4, 'left');

  const { lat, lon } = splitCoord(info);
  const tracks = [
    ['A1', 'LATITUDE', lat || '--'],
    ['A2', 'LONGITUDE', lon || '--'],
    ['B1', 'RECORDED', [info.time, info.dateText].filter(Boolean).join(' · ')]
  ];
  if (info.camera) tracks.push(['B2', 'EQUIPMENT', info.camera]);
  let ty = 404;
  tracks.forEach(([no, k, v]) => {
    ctx.fillStyle = hexToRgba(ink, 0.45);
    setFont(ctx, 6.5, 700, MONO);
    drawSpacedText(ctx, no, 24, ty, 0.5, 'left');
    ctx.fillStyle = ink;
    setFont(ctx, 6.5, 700, FUTURA);
    drawSpacedText(ctx, k, 50, ty, 1.8, 'left');
    ctx.fillStyle = hexToRgba(ink, 0.78);
    setFont(ctx, 7, 500, FUTURA);
    drawSpacedText(ctx, ellipsize(ctx, v, 200, 0.6), W - 24, ty, 0.6, 'right');
    ctx.strokeStyle = hexToRgba(ink, 0.14);
    ctx.lineWidth = 0.5;
    strokeLine(ctx, 24, ty + 6, W - 24, ty + 6);
    ty += 17;
  });
  ctx.fillStyle = hexToRgba(ink, 0.55);
  setFont(ctx, 5.5, 600, FUTURA);
  const year = yearOf(info);
  drawSpacedText(ctx, ellipsize(ctx, `℗ ${year ? `${year} ` : ''}${brand} RECORDS   ${sloganOf(style)}`, W - 48, 1.6), 24, H - 18, 1.6, 'left');
}

/* ------------------------------------------------------------------ */
/* 艺术：蓝图                                                            */
/* ------------------------------------------------------------------ */

const BLUEPRINT_PIN = { x: 0.5, y: 0.715 };
const BLUEPRINT_PHOTO = { left: 62, top: 88, w: 276, h: 228 };

function arrowHead(ctx, x, y, dx, dy, size) {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - ux * size - uy * size * 0.45, y - uy * size + ux * size * 0.45);
  ctx.lineTo(x - ux * size + uy * size * 0.45, y - uy * size - ux * size * 0.45);
  ctx.closePath();
  ctx.fill();
}

function dimension(ctx, x1, y1, x2, y2, label, color, bg) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 0.6;
  strokeLine(ctx, x1, y1, x2, y2);
  arrowHead(ctx, x1, y1, x1 - x2, y1 - y2, 5);
  arrowHead(ctx, x2, y2, x2 - x1, y2 - y1, 5);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  ctx.save();
  ctx.translate(mx, my);
  if (x1 === x2) ctx.rotate(-Math.PI / 2);
  setFont(ctx, 6.5, 500, MONO);
  const tw = measureSpaced(ctx, label, 0.8) + 10;
  ctx.fillStyle = bg;
  ctx.fillRect(-tw / 2, -5, tw, 10);
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  drawSpacedText(ctx, label, 0, 0.5, 0.8, 'center');
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

function paintBlueprint(ctx, scale, assets, info, tpl, style) {
  const blue = isNeutral(style.theme.tint) ? '#1D4E89' : hsvToHex(hueOf(style.theme.tint), 0.72, 0.5);
  const line = 'rgba(235,244,255,0.88)';
  const faint = 'rgba(235,244,255,0.55)';
  ctx.fillStyle = blue;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.75 * style.mapAlpha;
  if (assets.map) drawImageCover(ctx, assets.map, 0, 0, W, H);
  else drawFallbackMap(ctx, 0, 0, W, H, info.seed, BLUEPRINT_PIN, true);
  ctx.restore();

  ctx.strokeStyle = 'rgba(235,244,255,0.07)';
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 10) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  for (let y = 0; y <= H; y += 10) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(235,244,255,0.15)';
  ctx.beginPath();
  for (let x = 0; x <= W; x += 50) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  for (let y = 0; y <= H; y += 50) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();

  ctx.strokeStyle = line;
  ctx.lineWidth = 0.9;
  ctx.strokeRect(14, 14, W - 28, H - 28);
  ctx.lineWidth = 0.4;
  ctx.strokeRect(18, 18, W - 36, H - 36);

  const p = BLUEPRINT_PHOTO;
  withAlpha(ctx, style.photoAlpha, () => drawImageCover(ctx, assets.photo, p.left, p.top, p.w, p.h, style.crop));
  ctx.strokeStyle = line;
  ctx.lineWidth = 0.9;
  ctx.strokeRect(p.left, p.top, p.w, p.h);
  ctx.lineWidth = 0.4;
  strokeLine(ctx, p.left, p.top - 4, p.left, p.top - 24);
  strokeLine(ctx, p.left + p.w, p.top - 4, p.left + p.w, p.top - 24);
  strokeLine(ctx, p.left - 4, p.top, p.left - 30, p.top);
  strokeLine(ctx, p.left - 4, p.top + p.h, p.left - 30, p.top + p.h);
  const { lat, lon } = splitCoord(info);
  dimension(ctx, p.left, p.top - 16, p.left + p.w, p.top - 16, lon || 'LON --', line, blue);
  dimension(ctx, p.left - 22, p.top, p.left - 22, p.top + p.h, lat || 'LAT --', line, blue);

  // 定位点十字准星
  const px = W * BLUEPRINT_PIN.x;
  const py = H * BLUEPRINT_PIN.y;
  ctx.strokeStyle = line;
  ctx.lineWidth = 0.8;
  circlePath(ctx, px, py, 9);
  ctx.stroke();
  circlePath(ctx, px, py, 2);
  ctx.stroke();
  strokeLine(ctx, px - 16, py, px - 4, py);
  strokeLine(ctx, px + 4, py, px + 16, py);
  strokeLine(ctx, px, py - 16, px, py - 4);
  strokeLine(ctx, px, py + 4, px, py + 16);
  ctx.fillStyle = line;
  setFont(ctx, 6, 600, MONO);
  ctx.textBaseline = 'alphabetic';
  drawSpacedText(ctx, 'POINT A', px + 14, py - 10, 1, 'left');

  // 标题栏
  const tb = { x: 196, y: 414, w: 186, h: 104 };
  ctx.fillStyle = hexToRgba(blue, 0.85);
  ctx.fillRect(tb.x, tb.y, tb.w, tb.h);
  ctx.strokeStyle = line;
  ctx.lineWidth = 0.8;
  ctx.strokeRect(tb.x, tb.y, tb.w, tb.h);
  ctx.lineWidth = 0.4;
  const rows = [30, 24, 24, 26];
  let ry = tb.y;
  rows.slice(0, -1).forEach((h) => {
    ry += h;
    strokeLine(ctx, tb.x, ry, tb.x + tb.w, ry);
  });
  strokeLine(ctx, tb.x + tb.w / 2, tb.y + rows[0], tb.x + tb.w / 2, tb.y + tb.h);
  const cell = (label, value, x, y, w, size) => {
    ctx.fillStyle = faint;
    setFont(ctx, 4.8, 600, MONO);
    drawSpacedText(ctx, label, x + 6, y + 8.5, 0.8, 'left');
    ctx.fillStyle = line;
    fitFontSize(ctx, value, w - 12, size, 5, 700, MONO, 0.4);
    drawSpacedText(ctx, value, x + 6, y + 8.5 + size + 2.5, 0.4, 'left');
  };
  const sb = scaleBar(info.lat, info.zoom, 60);
  cell('PROJECT', info.place, tb.x, tb.y, tb.w, 12);
  let cy = tb.y + rows[0];
  cell('DATE', info.dateText, tb.x, cy, tb.w / 2, 7);
  cell('SCALE', sb ? `BAR = ${sb.label}` : 'N.T.S.', tb.x + tb.w / 2, cy, tb.w / 2, 7);
  cy += rows[1];
  cell('LAT', lat || '--', tb.x, cy, tb.w / 2, 7);
  cell('LON', lon || '--', tb.x + tb.w / 2, cy, tb.w / 2, 7);
  cy += rows[2];
  cell('DRAWN BY', brandOf(style).name, tb.x, cy, tb.w / 2, 7);
  cell('SHEET', '01 / 01', tb.x + tb.w / 2, cy, tb.w / 2, 7);

  ctx.fillStyle = line;
  setFont(ctx, 6, 700, MONO);
  drawSpacedText(ctx, 'NOTES', 30, 426, 1.4, 'left');
  ctx.fillStyle = faint;
  setFont(ctx, 5.5, 500, MONO);
  const notes = wrapText(ctx, `1. ${sloganOf(style) || 'FIELD RECORD'}.`, 150, 0.4)
    .concat(['2. COORDINATES IN WGS-84.', `3. ${info.time ? `TIME ${info.time}` : 'TIME N/A'}.`]);
  notes.slice(0, 5).forEach((t, i) => drawSpacedText(ctx, t, 30, 440 + i * 10, 0.4, 'left'));
  if (sb) {
    const x0 = 30;
    const y0 = 500;
    ctx.strokeStyle = line;
    ctx.lineWidth = 0.7;
    strokeLine(ctx, x0, y0, x0 + sb.length, y0);
    strokeLine(ctx, x0, y0 - 3, x0, y0 + 3);
    strokeLine(ctx, x0 + sb.length, y0 - 3, x0 + sb.length, y0 + 3);
    strokeLine(ctx, x0 + sb.length / 2, y0 - 2, x0 + sb.length / 2, y0 + 2);
    ctx.fillStyle = line;
    setFont(ctx, 5, 600, MONO);
    drawSpacedText(ctx, sb.label, x0 + sb.length + 5, y0 + 2, 0.6, 'left');
  }
}

/* ------------------------------------------------------------------ */
/* 艺术：霓虹                                                            */
/* ------------------------------------------------------------------ */

function neonColors(theme) {
  if (isNeutral(theme.tint)) return ['#FF3EA5', '#39E6FF'];
  const h = hueOf(theme.tint);
  return [hsvToHex(h, 0.72, 1), hsvToHex((h + 150) % 360, 0.65, 1)];
}

function glow(ctx, scale, color, passes, draw) {
  ctx.save();
  ctx.shadowColor = color;
  passes.forEach((blur) => {
    ctx.shadowBlur = blur * scale;
    draw();
  });
  ctx.restore();
}

function paintNeon(ctx, scale, assets, info, tpl, style) {
  const [neon, neon2] = neonColors(style.theme);
  drawMapRegion(ctx, assets.map, 0, 0, W, H, tpl, info, style);
  withAlpha(ctx, style.photoAlpha, () => {
    drawImageCover(ctx, assets.photo, 0, 0, W, H, style.crop);
    ctx.fillStyle = 'rgba(6,5,14,0.5)';
    ctx.fillRect(0, 0, W, H);
    const v = ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, 360);
    v.addColorStop(0, 'rgba(6,5,14,0)');
    v.addColorStop(1, 'rgba(6,5,14,0.7)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  });

  ctx.lineWidth = 2;
  ctx.strokeStyle = neon2;
  glow(ctx, scale, neon2, [14, 6], () => {
    roundedRectPath(ctx, 18, 18, W - 36, H - 36, 22);
    ctx.stroke();
  });
  ctx.strokeStyle = mixHex(neon2, '#FFFFFF', 0.7);
  ctx.lineWidth = 0.7;
  roundedRectPath(ctx, 18, 18, W - 36, H - 36, 22);
  ctx.stroke();

  const r = 30;
  const mx = W / 2;
  const my = 96;
  ctx.save();
  circlePath(ctx, mx, my, r);
  ctx.clip();
  drawMapWindow(ctx, assets.map, mx - r, my - r, r * 2, r * 2, tpl, info, style);
  ctx.restore();
  ctx.strokeStyle = neon2;
  ctx.lineWidth = 1.4;
  glow(ctx, scale, neon2, [10], () => {
    circlePath(ctx, mx, my, r + 3);
    ctx.stroke();
  });

  ctx.textBaseline = 'alphabetic';
  const place = titleCase(info.place);
  const size = fitFontSize(ctx, place, W - 80, 76, 24, 700, SCRIPT, 0.5);
  const y = H * 0.54 + size * 0.2;
  ctx.fillStyle = neon;
  glow(ctx, scale, neon, [28, 14], () => drawSpacedText(ctx, place, W / 2, y, 0.5, 'center'));
  ctx.fillStyle = mixHex(neon, '#FFFFFF', 0.72);
  glow(ctx, scale, neon, [4], () => drawSpacedText(ctx, place, W / 2, y, 0.5, 'center'));

  ctx.fillStyle = mixHex(neon2, '#FFFFFF', 0.4);
  setFont(ctx, 9, 700, ROUNDED);
  glow(ctx, scale, neon2, [8], () => {
    drawSpacedText(ctx, info.dateText, W / 2, H - 86, 3, 'center');
  });
  setFont(ctx, 7.5, 600, ROUNDED);
  glow(ctx, scale, neon2, [6], () => {
    drawSpacedText(ctx, info.coordText, W / 2, H - 68, 2.2, 'center');
  });
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  setFont(ctx, 6, 700, ROUNDED);
  drawSpacedText(ctx, brandOf(style).name, W / 2, H - 38, 4, 'center');
}

/* ------------------------------------------------------------------ */
/* 杂志：瑞士网格                                                         */
/* ------------------------------------------------------------------ */

const SWISS_PHOTO = { left: 132, top: 172, w: 268, h: 268 };

function paintSwiss(ctx, scale, assets, info, tpl, style) {
  const { theme } = style;
  const page = theme.dark ? theme.tint : mixHex(theme.tint, '#FFFFFF', 0.7);
  const ink = theme.dark ? '#F3EFE6' : '#111111';
  const red = '#E4322B';
  const m = 20;
  ctx.fillStyle = page;
  ctx.fillRect(0, 0, W, H);

  const dp = dateParts(info);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ink;
  if (dp) {
    const cal = calendarOf(dp);
    setFont(ctx, 150, 800, SANS);
    const day = pad2(dp.d);
    drawSpacedText(ctx, day, m - 6, 150, -5, 'left');
    const x2 = m + measureSpaced(ctx, day, -5) + 12;
    setFont(ctx, 22, 700, SANS);
    drawSpacedText(ctx, MONTHS_LONG[dp.m - 1], x2, 70, 0, 'left');
    setFont(ctx, 22, 300, SANS);
    drawSpacedText(ctx, String(dp.y), x2, 96, 0, 'left');
    ctx.fillStyle = red;
    ctx.fillRect(x2, 113, 9, 9);
    ctx.fillStyle = hexToRgba(ink, 0.7);
    setFont(ctx, 7, 700, SANS);
    drawSpacedText(ctx, WEEKDAYS_LONG[cal.weekday], x2 + 15, 121.5, 2, 'left');
  } else {
    fitFontSize(ctx, info.place, W - 2 * m, 64, 18, 800, SANS, -0.5);
    drawSpacedText(ctx, info.place, m - 2, 140, -0.5, 'left');
  }
  ctx.fillStyle = ink;
  setFont(ctx, 7, 800, SANS);
  drawSpacedText(ctx, brandOf(style).name, W - m, 34, 2.4, 'right');
  ctx.fillRect(m, 160, W - 2 * m, 2);

  const p = SWISS_PHOTO;
  withAlpha(ctx, style.photoAlpha, () => drawImageCover(ctx, assets.photo, p.left, p.top, p.w, p.h, style.crop));

  const { lat, lon } = splitCoord(info);
  const fields = [['LAT', lat || '--'], ['LON', lon || '--'], ['TIME', info.time || '--:--']];
  fields.forEach(([k, v], i) => {
    const y = 186 + i * 36;
    ctx.fillStyle = red;
    setFont(ctx, 6, 800, SANS);
    drawSpacedText(ctx, k, m, y, 1.6, 'left');
    ctx.fillStyle = ink;
    fitFontSize(ctx, v, 100, 8.5, 6, 500, SANS, 0.2);
    drawSpacedText(ctx, v, m, y + 13, 0.2, 'left');
  });
  const ms = 100;
  drawMapWindow(ctx, assets.map, m, p.top + p.h - ms, ms, ms, tpl, info, style);

  ctx.fillStyle = ink;
  const title = dp ? info.place : info.lat != null ? info.coordText : '';
  fitFontSize(ctx, title, W - 2 * m, dp ? 46 : 28, 14, 800, SANS, -0.5);
  drawSpacedText(ctx, title, m - 1, 486, -0.5, 'left');
  setFont(ctx, 7, 500, SANS);
  drawSpacedText(ctx, ellipsize(ctx, info.dateText, 140, 0.6), m, 510, 0.6, 'left');
  ctx.fillStyle = hexToRgba(ink, 0.55);
  setFont(ctx, 6, 500, SANS);
  drawSpacedText(ctx, ellipsize(ctx, sloganOf(style), 220, 1.2), W - m, 510, 1.2, 'right');
}

/* ------------------------------------------------------------------ */
/* 杂志：报纸头版                                                         */
/* ------------------------------------------------------------------ */

const NEWS_PHOTO = { left: 24, top: 150, w: 352, h: 206 };

function fauxLines(ctx, x, y0, y1, w, seed, color) {
  const rand = mulberry32(seed);
  ctx.fillStyle = color;
  for (let y = y0; y <= y1; y += 7.2) {
    const lineEnd = x + (rand() < 0.16 ? w * (0.35 + rand() * 0.4) : w);
    for (let cx = x; cx < lineEnd - 2; ) {
      const ww = Math.min(4 + rand() * 15, lineEnd - cx);
      ctx.fillRect(cx, y, ww, 2.1);
      cx += ww + 2.2;
    }
  }
}

function paintNewspaper(ctx, scale, assets, info, tpl, style) {
  const paper = mixHex(paperOf(style.theme), '#ECE6D8', 0.65);
  const ink = '#1A1A1A';
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);
  drawGrain(ctx, 0, 0, W, H, info.seed, 'rgba(0,0,0,0.06)', 0.02);

  const dp = dateParts(info);
  const cal = dp ? calendarOf(dp) : null;
  const brand = brandOf(style).name;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = hexToRgba(ink, 0.75);
  setFont(ctx, 5.5, 700, SANS);
  drawSpacedText(ctx, cal ? `VOL. ${String(dp.y).slice(2)} · NO. ${cal.doy}` : 'VOL. I', 24, 26, 1.4, 'left');
  drawSpacedText(ctx, 'LOCAL EDITION', W / 2, 26, 1.8, 'center');
  drawSpacedText(ctx, 'PRICELESS', W - 24, 26, 1.4, 'right');
  ctx.fillStyle = ink;
  ctx.fillRect(24, 31, W - 48, 0.5);

  const masthead = `The ${capitalize(brand)} Gazette`;
  fitFontSize(ctx, masthead, W - 48, 34, 16, 700, DIDOT, 0.5);
  drawSpacedText(ctx, masthead, W / 2, 62, 0.5, 'center');
  ctx.fillRect(24, 69, W - 48, 1.4);
  ctx.fillRect(24, 72.5, W - 48, 0.5);
  setFont(ctx, 6.5, 600, SANS);
  drawSpacedText(ctx, cal ? `${WEEKDAYS_LONG[cal.weekday]}, ${info.dateText}` : info.dateText, 24, 84, 1, 'left');
  drawSpacedText(ctx, info.coordText, W - 24, 84, 1, 'right');
  ctx.fillRect(24, 89, W - 48, 0.6);

  fitFontSize(ctx, info.place, W - 48, 56, 22, 800, DIDOT, 1);
  drawSpacedText(ctx, info.place, W / 2, 138, 1, 'center');

  const p = NEWS_PHOTO;
  withAlpha(ctx, style.photoAlpha, () => drawImageCover(ctx, assets.photo, p.left, p.top, p.w, p.h, style.crop));
  ctx.fillStyle = hexToRgba(ink, 0.8);
  setFont(ctx, 7, 400, SERIF, 'italic');
  const caption = `Photographed at ${info.coordText}${info.time ? `, ${info.time}` : ''} — ${info.dateText}.`;
  drawSpacedText(ctx, ellipsize(ctx, caption, p.w, 0.2), p.left, p.top + p.h + 13, 0.2, 'left');
  ctx.fillStyle = ink;
  ctx.fillRect(24, 378, W - 48, 0.6);

  const top = 390;
  const bottom = 508;
  const gap = 12;
  const colW = (W - 48 - gap * 2) / 3;
  const cols = [24, 24 + colW + gap, 24 + (colW + gap) * 2];
  const faux = 'rgba(26,26,26,0.26)';
  ctx.fillStyle = ink;
  setFont(ctx, 7, 800, SANS);
  drawSpacedText(ctx, 'THE MOMENT', cols[0], top + 8, 1.2, 'left');
  fauxLines(ctx, cols[0], top + 16, bottom, colW, info.seed, faux);

  drawMapWindow(ctx, assets.map, cols[1], top, colW, 72, tpl, info, style);
  ctx.strokeStyle = hexToRgba(ink, 0.5);
  ctx.lineWidth = 0.5;
  ctx.strokeRect(cols[1], top, colW, 72);
  ctx.fillStyle = hexToRgba(ink, 0.75);
  setFont(ctx, 5.5, 400, SERIF, 'italic');
  drawSpacedText(ctx, ellipsize(ctx, `Fig. 1 — ${titleCase(info.place)}`, colW, 0.2), cols[1], top + 82, 0.2, 'left');
  fauxLines(ctx, cols[1], top + 90, bottom, colW, info.seed + 1, faux);

  ctx.fillStyle = ink;
  setFont(ctx, 10.5, 400, DIDOT, 'italic');
  const quote = wrapText(ctx, `“${titleCase(sloganOf(style) || info.place)}”`, colW, 0);
  quote.slice(0, 4).forEach((ln, i) => drawSpacedText(ctx, ln, cols[2], top + 11 + i * 14, 0, 'left'));
  const qEnd = top + 11 + Math.min(4, quote.length) * 14;
  ctx.fillRect(cols[2], qEnd - 4, 24, 0.8);
  fauxLines(ctx, cols[2], qEnd + 4, bottom, colW, info.seed + 2, faux);

  ctx.fillStyle = hexToRgba(ink, 0.3);
  ctx.fillRect(cols[1] - gap / 2, top, 0.5, bottom - top + 2);
  ctx.fillRect(cols[2] - gap / 2, top, 0.5, bottom - top + 2);
}

/* ------------------------------------------------------------------ */
/* 简约：拱门                                                            */
/* ------------------------------------------------------------------ */

const ARCH_PHOTO = { left: 72, top: 62, w: 256, h: 326 };

function archPath(ctx, x, y, w, h) {
  const r = w / 2;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, 0);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

function paintArch(ctx, scale, assets, info, tpl, style) {
  const ink = style.theme.ink;
  drawMapRegion(ctx, assets.map, 0, 0, W, H, tpl, info, style);
  const p = ARCH_PHOTO;
  ctx.strokeStyle = hexToRgba(ink, 0.5);
  ctx.lineWidth = 0.7;
  archPath(ctx, p.left - 10, p.top - 10, p.w + 20, p.h + 20);
  ctx.stroke();
  drawShadowed(ctx, scale, 18, 6, 'rgba(0,0,0,0.2)', () => {
    archPath(ctx, p.left, p.top, p.w, p.h);
    ctx.fillStyle = style.theme.tint;
    ctx.fill();
  });
  ctx.save();
  archPath(ctx, p.left, p.top, p.w, p.h);
  ctx.clip();
  withAlpha(ctx, style.photoAlpha, () => drawImageCover(ctx, assets.photo, p.left, p.top, p.w, p.h, style.crop));
  ctx.restore();

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ink;
  fitFontSize(ctx, info.place, W - 80, 34, 16, 400, DIDOT, 4);
  drawSpacedText(ctx, info.place, W / 2, 446, 4, 'center');
  ctx.strokeStyle = hexToRgba(ink, 0.45);
  ctx.lineWidth = 0.6;
  strokeLine(ctx, W / 2 - 14, 462, W / 2 + 14, 462);
  ctx.fillStyle = hexToRgba(ink, 0.75);
  setFont(ctx, 7.5, 500, SANS);
  drawSpacedText(ctx, info.dateText, W / 2, 482, 3, 'center');
  ctx.fillStyle = hexToRgba(ink, 0.58);
  setFont(ctx, 6.5, 400, SANS);
  drawSpacedText(ctx, info.coordText, W / 2, 498, 2, 'center');
}

/* ------------------------------------------------------------------ */
/* 简约：月历                                                            */
/* ------------------------------------------------------------------ */

const CAL_PHOTO = { left: 24, top: 24, w: 352, h: 240 };

function paintCalendar(ctx, scale, assets, info, tpl, style) {
  const { theme } = style;
  const dark = theme.dark;
  const page = dark ? theme.tint : paperOf(theme);
  const ink = dark ? '#F3EFE6' : '#1D1D1F';
  const accent = dark ? vividOf(theme, '#FF8A65', 0.55, 0.95) : deepAccent(theme);
  ctx.fillStyle = page;
  ctx.fillRect(0, 0, W, H);
  const p = CAL_PHOTO;
  withAlpha(ctx, style.photoAlpha, () => drawImageCover(ctx, assets.photo, p.left, p.top, p.w, p.h, style.crop));

  const dp = dateParts(info);
  const cal = dp ? calendarOf(dp) : null;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ink;
  if (dp) {
    setFont(ctx, 30, 400, DIDOT);
    const month = MONTHS_LONG[dp.m - 1];
    drawSpacedText(ctx, month, 23, 306, 1, 'left');
    const mw = measureSpaced(ctx, month, 1);
    setFont(ctx, 13, 300, FUTURA);
    ctx.fillStyle = hexToRgba(ink, 0.6);
    drawSpacedText(ctx, String(dp.y), 24 + mw + 10, 306, 3, 'left');
    const placeW = Math.max(60, 352 - mw - 30 - measureSpaced(ctx, String(dp.y), 3));
    ctx.fillStyle = ink;
    fitFontSize(ctx, info.place, placeW, 11, 6, 700, FUTURA, 2.4);
    drawSpacedText(ctx, info.place, 376, 293, 2.4, 'right');
    ctx.fillStyle = hexToRgba(ink, 0.55);
    fitFontSize(ctx, info.coordText, placeW, 6.5, 5, 500, FUTURA, 1);
    drawSpacedText(ctx, info.coordText, 376, 306, 1, 'right');
  } else {
    // 没有日期：地名做标题，地图铺满日历区
    fitFontSize(ctx, info.place, 352, 30, 14, 400, DIDOT, 1);
    drawSpacedText(ctx, info.place, 23, 306, 1, 'left');
  }
  ctx.fillStyle = hexToRgba(ink, 0.25);
  ctx.fillRect(24, 320, 352, 0.6);

  const gx = 24;
  const colW = 31;
  const gy = 340;
  if (cal) {
    setFont(ctx, 6.5, 700, FUTURA);
    ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach((d, i) => {
      ctx.fillStyle = i === 0 ? accent : hexToRgba(ink, 0.5);
      drawSpacedText(ctx, d, gx + colW * i + colW / 2, gy, 0, 'center');
    });
    for (let day = 1; day <= cal.days; day += 1) {
      const idx = cal.first + day - 1;
      const cx = gx + (idx % 7) * colW + colW / 2;
      const cy = gy + 20 + Math.floor(idx / 7) * 21;
      if (day === dp.d) {
        ctx.fillStyle = accent;
        circlePath(ctx, cx, cy - 3.2, 9.5);
        ctx.fill();
        ctx.fillStyle = page;
        setFont(ctx, 9, 800, FUTURA);
      } else {
        ctx.fillStyle = idx % 7 === 0 ? hexToRgba(accent, 0.85) : ink;
        setFont(ctx, 8.5, 500, FUTURA);
      }
      drawSpacedText(ctx, String(day), cx, cy, 0, 'center');
    }
  }

  const mx = cal ? 252 : 24;
  const my = 332;
  const mw = cal ? 124 : 352;
  const mh = 104;
  ctx.save();
  roundedRectPath(ctx, mx, my, mw, mh, 8);
  ctx.clip();
  drawMapWindow(ctx, assets.map, mx, my, mw, mh, tpl, info, style);
  ctx.restore();
  ctx.fillStyle = ink;
  if (cal) {
    setFont(ctx, 9, 700, FUTURA);
    drawSpacedText(ctx, WEEKDAYS_LONG[cal.weekday], mx, 456, 2, 'left');
    ctx.fillStyle = hexToRgba(ink, 0.55);
    setFont(ctx, 6.5, 500, FUTURA);
    drawSpacedText(ctx, [`DAY ${cal.doy} / ${cal.yearDays}`, info.time].filter(Boolean).join('  ·  '), mx, 470, 1.2, 'left');
  } else {
    setFont(ctx, 7.5, 600, FUTURA);
    drawSpacedText(ctx, ellipsize(ctx, info.coordText, mw, 2), mx, 462, 2, 'left');
  }

  ctx.fillStyle = hexToRgba(ink, 0.2);
  ctx.fillRect(24, 488, 352, 0.6);
  ctx.fillStyle = hexToRgba(ink, 0.55);
  setFont(ctx, 6, 600, FUTURA);
  drawSpacedText(ctx, brandOf(style).name, 24, 507, 3, 'left');
  drawSpacedText(ctx, ellipsize(ctx, sloganOf(style), 250, 2), 376, 507, 2, 'right');
}

/* ------------------------------------------------------------------ */
/* 经典：地图标注                                                         */
/* ------------------------------------------------------------------ */

const ATLAS_PIN = { x: 0.5, y: 0.66 };
const ATLAS_PHOTO = { left: 114, top: 154, w: 172, h: 172 };

function paintAtlas(ctx, scale, assets, info, tpl, style) {
  const { theme } = style;
  const ink = theme.ink;
  const paper = theme.dark ? '#121315' : '#FBFAF6';
  const halo = theme.dark ? 'rgba(10,10,12,0.82)' : 'rgba(255,255,255,0.88)';
  drawMapRegion(ctx, assets.map, 0, 0, W, H, tpl, info, style);

  const p = ATLAS_PHOTO;
  const pinX = W * ATLAS_PIN.x;
  const tipY = H * ATLAS_PIN.y - 11;
  const b = 4;
  drawShadowed(ctx, scale, 20, 8, 'rgba(0,0,0,0.32)', () => {
    ctx.fillStyle = '#FFFFFF';
    roundedRectPath(ctx, p.left - b, p.top - b, p.w + b * 2, p.h + b * 2, 14);
    ctx.moveTo(pinX - 10, p.top + p.h + b - 0.5);
    ctx.lineTo(pinX, tipY);
    ctx.lineTo(pinX + 10, p.top + p.h + b - 0.5);
    ctx.closePath();
    ctx.fill();
  });
  ctx.save();
  roundedRectPath(ctx, p.left, p.top, p.w, p.h, 10);
  ctx.clip();
  withAlpha(ctx, style.photoAlpha, () => drawImageCover(ctx, assets.photo, p.left, p.top, p.w, p.h, style.crop));
  ctx.restore();

  ctx.strokeStyle = paper;
  ctx.lineWidth = 26;
  ctx.strokeRect(0, 0, W, H);
  ctx.strokeStyle = hexToRgba(ink, 0.55);
  ctx.lineWidth = 0.6;
  ctx.strokeRect(17, 17, W - 34, H - 34);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ink;
  fitFontSize(ctx, info.place, W - 90, 36, 16, 700, FUTURA, 6);
  drawHaloText(ctx, info.place, W / 2, 84, 6, 'center', halo, 5);
  ctx.fillStyle = hexToRgba(ink, 0.85);
  setFont(ctx, 7.5, 600, FUTURA);
  drawHaloText(ctx, info.coordText, W / 2, 106, 2, 'center', halo, 4);

  const ly = 490;
  const sb = scaleBar(info.lat, info.zoom, 76);
  if (sb) {
    const x0 = 38;
    ctx.fillStyle = halo;
    ctx.fillRect(x0 - 3, ly - 6, sb.length + 6, 9.5);
    ctx.fillStyle = ink;
    ctx.fillRect(x0, ly - 3, sb.length / 2, 3.5);
    ctx.fillStyle = theme.dark ? '#111111' : '#FFFFFF';
    ctx.fillRect(x0 + sb.length / 2, ly - 3, sb.length / 2, 3.5);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 0.6;
    ctx.strokeRect(x0, ly - 3, sb.length, 3.5);
    ctx.fillStyle = ink;
    setFont(ctx, 5.5, 700, FUTURA);
    drawHaloText(ctx, '0', x0, ly + 10, 0, 'center', halo, 3);
    drawHaloText(ctx, sb.label, x0 + sb.length, ly + 10, 0.8, 'center', halo, 3);
  }
  ctx.fillStyle = ink;
  setFont(ctx, 7, 600, FUTURA);
  drawHaloText(ctx, info.dateText, W / 2, ly + 3, 2.4, 'center', halo, 4);

  const nx = W - 46;
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.moveTo(nx, ly - 9);
  ctx.lineTo(nx + 5, ly + 7);
  ctx.lineTo(nx, ly + 3.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(nx, ly - 9);
  ctx.lineTo(nx - 5, ly + 7);
  ctx.lineTo(nx, ly + 3.5);
  ctx.closePath();
  ctx.stroke();
  setFont(ctx, 6, 800, FUTURA);
  drawHaloText(ctx, 'N', nx, ly - 13, 0, 'center', halo, 3);
}

/* ------------------------------------------------------------------ */
/* 复古：印样（灯箱上的中画幅底片）                                        */
/* ------------------------------------------------------------------ */

const CONTACT_STRIP = { x: 44, y: 38, w: 312, h: 350 };
const CONTACT_PHOTO = { left: 60, top: 70, w: 280, h: 280 };
const PENCIL = '#D0342C';

function pencilRect(ctx, x, y, w, h, seed, color, width) {
  const rand = mulberry32(seed);
  const j = () => (rand() - 0.5) * 3;
  const pts = [[x + j(), y + j()], [x + w + j(), y + j()], [x + w + j(), y + h + j()], [x + j(), y + h + j()]];
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    const ox = (b[0] - a[0]) * 0.05;
    const oy = (b[1] - a[1]) * 0.05;
    ctx.beginPath();
    ctx.moveTo(a[0] - ox, a[1] - oy);
    ctx.quadraticCurveTo((a[0] + b[0]) / 2 + j(), (a[1] + b[1]) / 2 + j(), b[0] + ox, b[1] + oy);
    ctx.stroke();
  }
  ctx.restore();
}

function paintContact(ctx, scale, assets, info, tpl, style) {
  const ink = '#2B2825';
  drawMapRegion(ctx, assets.map, 0, 0, W, H, tpl, info, style);
  ctx.fillStyle = 'rgba(252,252,250,0.84)';
  ctx.fillRect(0, 0, W, H);

  const s = CONTACT_STRIP;
  drawShadowed(ctx, scale, 10, 2, 'rgba(0,0,0,0.25)', () => {
    ctx.fillStyle = '#141210';
    ctx.fillRect(s.x, s.y, s.w, s.h);
  });
  const p = CONTACT_PHOTO;
  withAlpha(ctx, style.photoAlpha, () => drawImageCover(ctx, assets.photo, p.left, p.top, p.w, p.h, style.crop));

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = AMBER;
  setFont(ctx, 6.5, 700, SANS);
  drawSpacedText(ctx, `${brandOf(style).name} 160 PRO`, p.left, s.y + 20, 1.8, 'left');
  drawSpacedText(ctx, '▶ 7', p.left + p.w, s.y + 20, 1.2, 'right');
  drawSpacedText(ctx, '6×6', p.left, p.top + p.h + 24, 1.4, 'left');
  drawSpacedText(ctx, '7A', W / 2, p.top + p.h + 24, 1.4, 'center');
  drawSpacedText(ctx, '▶ 8', p.left + p.w, p.top + p.h + 24, 1.2, 'right');
  for (let i = 0; i < 3; i += 1) ctx.fillRect(s.x + 5, s.y + 110 + i * 9, 5, 4);

  pencilRect(ctx, p.left - 7, p.top - 7, p.w + 14, p.h + 14, info.seed, PENCIL, 2.2);

  // 放大镜：看地图
  const lx = 318;
  const ly = 404;
  const lr = 44;
  drawShadowed(ctx, scale, 16, 6, 'rgba(0,0,0,0.35)', () => {
    ctx.fillStyle = '#2A2A2C';
    circlePath(ctx, lx, ly, lr + 7);
    ctx.fill();
  });
  ctx.save();
  circlePath(ctx, lx, ly, lr);
  ctx.clip();
  drawMapWindow(ctx, assets.map, lx - lr, ly - lr, lr * 2, lr * 2, tpl, info, style);
  const shine = ctx.createLinearGradient(lx - lr, ly - lr, lx + lr, ly + lr);
  shine.addColorStop(0, 'rgba(255,255,255,0.35)');
  shine.addColorStop(0.4, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  ctx.fillRect(lx - lr, ly - lr, lr * 2, lr * 2);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 0.8;
  circlePath(ctx, lx, ly, lr + 4);
  ctx.stroke();

  ctx.fillStyle = PENCIL;
  const place = titleCase(info.place);
  fitFontSize(ctx, place, 220, 34, 16, 400, SCRIPT, 0.4);
  drawSpacedText(ctx, place, 46, 438, 0.4, 'left');
  ctx.fillStyle = ink;
  setFont(ctx, 7.5, 400, TYPEWRITER);
  drawSpacedText(ctx, info.coordText, 48, 462, 0.6, 'left');
  drawSpacedText(ctx, [info.dateText, info.time].filter(Boolean).join('  ·  '), 48, 476, 0.6, 'left');
  ctx.fillStyle = hexToRgba(ink, 0.55);
  setFont(ctx, 6, 400, TYPEWRITER);
  drawSpacedText(ctx, ellipsize(ctx, sloganOf(style), 230, 0.8), 48, H - 24, 0.8, 'left');
  setFont(ctx, 6, 400, TYPEWRITER);
  drawSpacedText(ctx, 'CONTACT SHEET · ROLL 07', s.x, s.y - 12, 1.4, 'left');
}

/* ------------------------------------------------------------------ */
/* 复古：购物小票                                                         */
/* ------------------------------------------------------------------ */

const RECEIPT = { x: 96, y: 30, w: 208, h: 472 };
const RECEIPT_PHOTO = { left: 110, top: 94, w: 180, h: 176 };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function receiptPath(ctx, x, y, w, h) {
  const n = Math.round(w / 7);
  const s = w / n;
  ctx.beginPath();
  ctx.moveTo(x, y + 3);
  for (let i = 0; i < n; i += 1) {
    ctx.lineTo(x + i * s + s / 2, y);
    ctx.lineTo(x + (i + 1) * s, y + 3);
  }
  ctx.lineTo(x + w, y + h - 3);
  for (let i = n - 1; i >= 0; i -= 1) {
    ctx.lineTo(x + i * s + s / 2, y + h);
    ctx.lineTo(x + i * s, y + h - 3);
  }
  ctx.closePath();
}

// 热敏打印效果：灰度 + 有序抖动，按逻辑单位取样，放大后能看到网点
function thermalPhoto(photo, w, h, crop, density) {
  const cw = Math.max(1, Math.round(w * density));
  const ch = Math.max(1, Math.round(h * density));
  const c = new OffscreenCanvas(cw, ch);
  const x = c.getContext('2d');
  drawImageCover(x, photo, 0, 0, cw, ch, crop);
  const img = x.getImageData(0, 0, cw, ch);
  const d = img.data;
  for (let i = 0, p = 0; i < d.length; i += 4, p += 1) {
    const px = p % cw;
    const py = (p / cw) | 0;
    let l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    l = clamp((l - 0.5) * 1.3 + 0.56, 0, 1);
    const on = l > (BAYER[(py & 3) * 4 + (px & 3)] + 0.5) / 16;
    const v = on ? 250 : 38;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = on ? 247 : 38;
    d[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}

function dashedRule(ctx, x1, x2, y, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.7;
  ctx.setLineDash([2.5, 2]);
  strokeLine(ctx, x1, y, x2, y);
  ctx.restore();
}

function paintReceipt(ctx, scale, assets, info, tpl, style) {
  const ink = '#262626';
  const r = RECEIPT;
  drawMapRegion(ctx, assets.map, 0, 0, W, H, tpl, info, style);
  ctx.save();
  rotateAbout(ctx, r.x + r.w / 2, r.y + r.h / 2, -1.5);
  drawShadowed(ctx, scale, 16, 6, 'rgba(0,0,0,0.28)', () => {
    receiptPath(ctx, r.x, r.y, r.w, r.h);
    ctx.fillStyle = '#FDFDFA';
    ctx.fill();
  });

  const brand = brandOf(style);
  const cx = r.x + r.w / 2;
  const x0 = r.x + 14;
  const x1 = r.x + r.w - 14;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ink;
  setFont(ctx, 13, 800, MONO);
  drawSpacedText(ctx, ellipsize(ctx, brand.name, r.w - 30, 2.4), cx, 58, 2.4, 'center');
  setFont(ctx, 5.5, 500, MONO);
  drawSpacedText(ctx, ellipsize(ctx, brand.tagline || 'LOCAL PHOTO LAB', r.w - 30, 1.2), cx, 70, 1.2, 'center');
  dashedRule(ctx, x0, x1, 82, ink);

  const p = RECEIPT_PHOTO;
  const density = Math.min(1.5, scale);
  const thermal = thermalPhoto(assets.photo, p.w, p.h, style.crop, density);
  withAlpha(ctx, style.photoAlpha, () => {
    ctx.imageSmoothingEnabled = density >= scale;
    ctx.drawImage(thermal, p.left, p.top, p.w, p.h);
    ctx.imageSmoothingEnabled = true;
  });

  const { lat, lon } = splitCoord(info);
  const rows = [
    ['LOCATION', info.place], ['DATE', info.dateText], ['TIME', info.time || '--:--'], ['LAT', lat || '--'], ['LON', lon || '--'],
    info.camera ? ['CAMERA', info.camera] : ['ITEM', '1 × PHOTO']
  ];
  let y = p.top + p.h + 22;
  rows.forEach(([k, v]) => {
    ctx.fillStyle = ink;
    setFont(ctx, 7, 500, MONO);
    drawSpacedText(ctx, k, x0, y, 0.4, 'left');
    const kw = measureSpaced(ctx, k, 0.4);
    setFont(ctx, 7, 700, MONO);
    drawSpacedText(ctx, ellipsize(ctx, v, x1 - x0 - kw - 10, 0.2), x1, y, 0.2, 'right');
    y += 13;
  });
  dashedRule(ctx, x0, x1, y - 4, ink);
  y += 12;
  setFont(ctx, 10, 800, MONO);
  drawSpacedText(ctx, 'TOTAL', x0, y, 0.6, 'left');
  drawSpacedText(ctx, '1 MOMENT', x1, y, 0.6, 'right');
  dashedRule(ctx, x0, x1, y + 9, ink);
  y += 22;
  drawBarcode(ctx, x0 + 10, y, x1 - x0 - 20, 26, info.seed, ink);
  y += 40;
  setFont(ctx, 5.5, 600, MONO);
  drawSpacedText(ctx, 'THANK YOU FOR TRAVELING', cx, y, 1.4, 'center');
  const dp = dateParts(info);
  const no = dp ? String(calendarOf(dp).doy).padStart(6, '0') : String(info.seed % 1000000).padStart(6, '0');
  setFont(ctx, 5, 500, MONO);
  ctx.fillStyle = hexToRgba(ink, 0.6);
  drawSpacedText(ctx, `NO.${no}   ${info.time || ''}`.trim(), cx, y + 10, 1, 'center');
  setFont(ctx, 5.5, 500, MONO);
  ctx.fillStyle = hexToRgba(ink, 0.75);
  drawSpacedText(ctx, ellipsize(ctx, `* ${sloganOf(style)} *`, r.w - 30, 1), cx, r.y + r.h - 24, 1, 'center');
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* 注册                                                                 */
/* ------------------------------------------------------------------ */

export const MORE_TEMPLATES = [
  { id: 'boarding', name: '登机牌', category: 'travel', hot: true, map: tplMap(CENTER_PIN), crop: BOARDING_PHOTO, paint: paintBoarding },
  { id: 'cutout', name: '字中图', category: 'art', also: ['editorial'], hot: true, map: tplMap(CUTOUT_PIN), crop: CUTOUT_BOX, paint: paintCutout },
  { id: 'arch', name: '拱门', category: 'minimal', hot: true, map: tplMap(CENTER_PIN), crop: ARCH_PHOTO, paint: paintArch },
  { id: 'atlas', name: '地图标注', category: 'classic', also: ['travel'], hot: true, map: tplMap(ATLAS_PIN), crop: ATLAS_PHOTO, paint: paintAtlas },
  { id: 'calendar', name: '月历', category: 'minimal', hot: true, map: tplMap(CENTER_PIN), crop: CAL_PHOTO, paint: paintCalendar },
  { id: 'swiss', name: '瑞士网格', category: 'editorial', map: tplMap(CENTER_PIN), crop: SWISS_PHOTO, paint: paintSwiss },
  { id: 'newspaper', name: '报纸头版', category: 'editorial', map: tplMap(CENTER_PIN), crop: NEWS_PHOTO, paint: paintNewspaper },
  { id: 'passport', name: '护照印章', category: 'travel', map: tplMap(CENTER_PIN), crop: PASSPORT_PHOTO, paint: paintPassport },
  { id: 'journal', name: '旅行手账', category: 'travel', map: tplMap(CENTER_PIN), crop: JOURNAL_PHOTO, paint: paintJournal },
  { id: 'stamp', name: '邮票', category: 'travel', also: ['retro'], map: tplMap(STAMP_PIN), crop: STAMP_PHOTO, paint: paintStamp },
  { id: 'duotone', name: '双色印刷', category: 'art', map: tplMap(CENTER_PIN), crop: FULL_PHOTO, paint: paintDuotone },
  { id: 'vinyl', name: '黑胶唱片', category: 'art', map: tplMap(CENTER_PIN), crop: VINYL_SLEEVE, paint: paintVinyl },
  { id: 'blueprint', name: '蓝图', category: 'art', map: tplMap(BLUEPRINT_PIN), mapDark: true, crop: BLUEPRINT_PHOTO, paint: paintBlueprint },
  { id: 'neon', name: '霓虹', category: 'art', map: tplMap(CENTER_PIN), mapDark: true, crop: FULL_PHOTO, paint: paintNeon },
  { id: 'contact', name: '印样', category: 'retro', map: tplMap(CENTER_PIN), crop: CONTACT_PHOTO, paint: paintContact },
  { id: 'receipt', name: '小票', category: 'retro', also: ['travel'], map: tplMap(CENTER_PIN), crop: RECEIPT_PHOTO, paint: paintReceipt }
];
