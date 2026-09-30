/**
 * posters-extra.js
 *
 * 第三批 9 个模板：
 *   社交：相机水印 / 音乐播放器 / 社交贴文          旅行：地点卡片 / 舷窗 / 指南针 / 站牌
 *   艺术：等高线                                    简约：三联画
 * 结构与 posters-more.js 相同：每个模板自带元数据（分类、定位针位置、取景区域）与绘制函数，由 posters.js 统一注册。
 * 坐标同样基于 400 x 533.33 的逻辑单位。
 */
import {
  POSTER_W, POSTER_H, FULL_PHOTO, SANS, SERIF, DIDOT, FUTURA, CONDENSED, MONO, CENTER_PIN, tplMap, brandOf, sloganOf,
  setFont, measureSpaced, drawSpacedText, fitFontSize, ellipsize, drawImageCover, fitInside, withAlpha,
  drawMapRegion, drawMapWindow, roundedRectPath, drawShadowed, drawPlane, drawLogoMark, vividOf, inkOn, capLuminance, isNeutral,
  hueOf, hexToRgba, mixHex, shortCoord, dateParts, titleCase, circlePath, strokeLine, scaleBar, clamp, pad2
} from './poster-kit.js';
import { hexToRgb, hsvToHex } from './themes.js';
import { containsCjk, toLatinName, SHORT_LIMIT } from './place-name.js';

const W = POSTER_W;
const H = POSTER_H;
const DEG = Math.PI / 180;

export const EXTRA_CATEGORIES = [{ id: 'social', name: '社交' }];

const hasLoc = (info) => Number.isFinite(info.lat) && Number.isFinite(info.lon);

// "35.00° N  135.78° E"；没有坐标时返回空串
function coordPair(info, sep = '  ') {
  if (!hasLoc(info)) return '';
  const c = shortCoord(info);
  return `${c.lat}${sep}${c.lon}`;
}

const dateTime = (info, sep = '  ') => [info.dateText, info.time].filter(Boolean).join(sep);

// 拍摄时刻在一天中的比例（"16:48" -> 0.7）；没有时间时返回 null
function dayFraction(time) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time || '');
  return m ? clamp((Number(m[1]) * 60 + Number(m[2])) / 1440, 0, 1) : null;
}

function sentenceCase(text) {
  const s = String(text || '').trim();
  if (containsCjk(s) || s !== s.toUpperCase()) return s;
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function roundedPhoto(ctx, assets, style, x, y, w, h, r) {
  ctx.save();
  roundedRectPath(ctx, x, y, w, h, r);
  ctx.clip();
  withAlpha(ctx, style.photoAlpha, () => drawImageCover(ctx, assets.photo, x, y, w, h, style.crop));
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* 图标（按 24 单位网格或尺寸参数绘制，颜色由调用方设置）                   */
/* ------------------------------------------------------------------ */

function heartPath(ctx, cx, cy, size) {
  const s = size / 24;
  ctx.save();
  ctx.translate(cx - 12 * s, cy - 12 * s);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(12, 20.5);
  ctx.bezierCurveTo(6, 16, 2.5, 12.5, 2.5, 8.6);
  ctx.bezierCurveTo(2.5, 5.6, 4.8, 3.5, 7.5, 3.5);
  ctx.bezierCurveTo(9.4, 3.5, 11, 4.6, 12, 6.2);
  ctx.bezierCurveTo(13, 4.6, 14.6, 3.5, 16.5, 3.5);
  ctx.bezierCurveTo(19.2, 3.5, 21.5, 5.6, 21.5, 8.6);
  ctx.bezierCurveTo(21.5, 12.5, 18, 16, 12, 20.5);
  ctx.closePath();
  ctx.restore();
}

// 定位针轮廓（尖端在 x, y，高 s）
function pinGlyph(ctx, x, y, s, color) {
  const r = s * 0.36;
  const cy = y - s + r;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(0.6, s * 0.1);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x - r * 0.3, y - s * 0.3, x - r, cy + r * 0.6, x - r, cy);
  ctx.arc(x, cy, r, Math.PI, 0);
  ctx.bezierCurveTo(x + r, cy + r * 0.6, x + r * 0.3, y - s * 0.3, x, y);
  ctx.closePath();
  ctx.stroke();
  circlePath(ctx, x, cy, r * 0.38);
  ctx.fill();
  ctx.restore();
}

function skipIcon(ctx, cx, cy, s, dir) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(dir, 1);
  ctx.beginPath();
  ctx.moveTo(-s * 0.45, -s * 0.5);
  ctx.lineTo(s * 0.3, 0);
  ctx.lineTo(-s * 0.45, s * 0.5);
  ctx.closePath();
  ctx.fill();
  roundedRectPath(ctx, s * 0.32, -s * 0.5, s * 0.15, s, s * 0.06);
  ctx.fill();
  ctx.restore();
}

function shuffleIcon(ctx, cx, cy, s) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-s, -s * 0.5);
  ctx.bezierCurveTo(-s * 0.1, -s * 0.5, s * 0.1, s * 0.5, s, s * 0.5);
  ctx.moveTo(-s, s * 0.5);
  ctx.bezierCurveTo(-s * 0.1, s * 0.5, s * 0.1, -s * 0.5, s, -s * 0.5);
  ctx.moveTo(s * 0.65, -s * 0.82);
  ctx.lineTo(s, -s * 0.5);
  ctx.lineTo(s * 0.65, -s * 0.18);
  ctx.moveTo(s * 0.65, s * 0.18);
  ctx.lineTo(s, s * 0.5);
  ctx.lineTo(s * 0.65, s * 0.82);
  ctx.stroke();
  ctx.restore();
}

function repeatIcon(ctx, cx, cy, s) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-s, s * 0.15);
  ctx.lineTo(-s, -s * 0.15);
  ctx.quadraticCurveTo(-s, -s * 0.55, -s * 0.6, -s * 0.55);
  ctx.lineTo(s * 0.85, -s * 0.55);
  ctx.moveTo(s * 0.55, -s * 0.88);
  ctx.lineTo(s * 0.88, -s * 0.55);
  ctx.lineTo(s * 0.55, -s * 0.22);
  ctx.moveTo(s, -s * 0.15);
  ctx.lineTo(s, s * 0.15);
  ctx.quadraticCurveTo(s, s * 0.55, s * 0.6, s * 0.55);
  ctx.lineTo(-s * 0.85, s * 0.55);
  ctx.moveTo(-s * 0.55, s * 0.22);
  ctx.lineTo(-s * 0.88, s * 0.55);
  ctx.lineTo(-s * 0.55, s * 0.88);
  ctx.stroke();
  ctx.restore();
}

function queueIcon(ctx, cx, cy, s, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.1;
  ctx.lineCap = 'round';
  [-0.6, 0, 0.6].forEach((d) => {
    strokeLine(ctx, cx - s * 0.45, cy + d * s, cx + s, cy + d * s);
    circlePath(ctx, cx - s, cy + d * s, 0.9);
    ctx.fill();
  });
  ctx.restore();
}

function bubbleIcon(ctx, cx, cy, s) {
  ctx.beginPath();
  ctx.arc(cx, cy, s, Math.PI * 0.86, Math.PI * 2.62);
  ctx.lineTo(cx - s * 1.05, cy + s * 1.05);
  ctx.closePath();
  ctx.stroke();
}

function planeIcon(ctx, cx, cy, s) {
  ctx.beginPath();
  ctx.moveTo(cx + s, cy - s);
  ctx.lineTo(cx - s, cy - s * 0.2);
  ctx.lineTo(cx - s * 0.12, cy + s * 0.12);
  ctx.lineTo(cx + s * 0.2, cy + s);
  ctx.closePath();
  ctx.moveTo(cx + s, cy - s);
  ctx.lineTo(cx - s * 0.12, cy + s * 0.12);
  ctx.stroke();
}

function bookmarkIcon(ctx, cx, cy, s) {
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.68, cy - s);
  ctx.lineTo(cx + s * 0.68, cy - s);
  ctx.lineTo(cx + s * 0.68, cy + s);
  ctx.lineTo(cx, cy + s * 0.45);
  ctx.lineTo(cx - s * 0.68, cy + s);
  ctx.closePath();
  ctx.stroke();
}

// 导航箭头（右上方向）
function navArrow(ctx, cx, cy, s, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(45 * DEG);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(s * 0.72, s * 0.85);
  ctx.lineTo(0, s * 0.42);
  ctx.lineTo(-s * 0.72, s * 0.85);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function cameraGlyph(ctx, cx, cy, s, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 0.9;
  ctx.lineJoin = 'round';
  roundedRectPath(ctx, cx - s, cy - s * 0.55, s * 2, s * 1.35, s * 0.3);
  ctx.stroke();
  circlePath(ctx, cx, cy + s * 0.12, s * 0.42);
  ctx.stroke();
  roundedRectPath(ctx, cx - s * 0.42, cy - s * 0.85, s * 0.84, s * 0.34, s * 0.1);
  ctx.fill();
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* 社交：相机水印                                                         */
/* ------------------------------------------------------------------ */

const WM_MARGIN = 22;
const WM_BAR = 60;

// 照片完整显示（不裁切），信息栏宽度跟随照片，整体在海报里略偏上居中
function watermarkLayout(photo) {
  const maxW = W - WM_MARGIN * 2;
  const maxH = H - WM_MARGIN * 2 - WM_BAR;
  const fit = fitInside(photo, maxW, maxH);
  const k = clamp(fit.w / maxW, 0.8, 1);
  const bar = WM_BAR * k;
  return { x: (W - fit.w) / 2, y: Math.max(WM_MARGIN, (H - fit.h - bar) / 2 - 8), w: fit.w, h: fit.h, bar, k };
}

// 两行信息：主行加粗，副行灰色；只有一行时垂直居中
function infoLines(ctx, lines, x, mid, align, maxW, k, colors) {
  const [a, b] = lines;
  const size = 11 * k;
  ctx.fillStyle = colors[0];
  fitFontSize(ctx, a, maxW, size, size * 0.75, 700, SANS, 0.2);
  drawSpacedText(ctx, ellipsize(ctx, a, maxW, 0.2), x, b ? mid - 1.5 * k : mid + size * 0.36, 0.2, align);
  if (!b) return;
  ctx.fillStyle = colors[1];
  setFont(ctx, 6.6 * k, 400, SANS);
  drawSpacedText(ctx, ellipsize(ctx, b, maxW, 0.3), x, mid + 11 * k, 0.3, align);
}

function paintWatermark(ctx, scale, assets, info, tpl, style) {
  const { theme } = style;
  const dark = theme.dark;
  const card = dark ? '#161618' : '#FFFFFF';
  const colors = dark ? ['#F5F4F0', 'rgba(245,244,240,0.5)'] : ['#1B1B1B', 'rgba(27,27,27,0.45)'];
  const L = watermarkLayout(assets.photo);
  const k = L.k;

  ctx.fillStyle = dark ? mixHex(theme.tint, '#000000', 0.3) : mixHex(theme.tint, '#FFFFFF', 0.3);
  ctx.fillRect(0, 0, W, H);
  drawShadowed(ctx, scale, 26, 10, dark ? 'rgba(0,0,0,0.5)' : 'rgba(60,50,40,0.16)', () => {
    ctx.fillStyle = card;
    ctx.fillRect(L.x, L.y, L.w, L.h + L.bar);
  });
  withAlpha(ctx, style.photoAlpha, () => ctx.drawImage(assets.photo, L.x, L.y, L.w, L.h));

  // 左：相机型号 / 地名与时间；右：曝光参数 / 坐标；中间是圆形迷你地图充当“标志”
  const mid = L.y + L.h + L.bar / 2;
  const x0 = L.x + 14 * k;
  const x1 = L.x + L.w - 14 * k;
  const when = dateTime(info, ' ');
  const left = info.camera ? [info.camera, [info.place, when].filter(Boolean).join(' · ')] : [info.place, when];
  const right = [info.exposure, coordPair(info)].filter(Boolean);
  ctx.textBaseline = 'alphabetic';

  let rw = 0;
  if (right[0]) {
    setFont(ctx, 11 * k, 700, SANS);
    rw = measureSpaced(ctx, right[0], 0.2);
  }
  if (right[1]) {
    setFont(ctx, 6.6 * k, 400, SANS);
    rw = Math.max(rw, measureSpaced(ctx, right[1], 0.3));
  }
  rw = Math.min(rw, L.w * 0.46);
  const r = 11.5 * k;
  const divider = x1 - rw - 11 * k;
  const cx = right.length ? divider - 11 * k - r : x1 - r;

  infoLines(ctx, left, x0, mid, 'left', cx - r - 12 * k - x0, k, colors);
  if (right.length) {
    infoLines(ctx, right, x1, mid, 'right', rw, k, colors);
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.16)';
    ctx.lineWidth = 0.7;
    strokeLine(ctx, divider, mid - 12 * k, divider, mid + 13 * k);
  }
  ctx.save();
  circlePath(ctx, cx, mid, r);
  ctx.clip();
  drawMapWindow(ctx, assets.map, cx - r, mid - r, r * 2, r * 2, tpl, info, style, 6.5);
  ctx.restore();
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.14)';
  ctx.lineWidth = 0.6;
  circlePath(ctx, cx, mid, r);
  ctx.stroke();

  const below = H - (L.y + L.h + L.bar);
  const slogan = sloganOf(style);
  if (slogan && below >= 34) {
    ctx.fillStyle = dark ? 'rgba(245,244,240,0.42)' : hexToRgba(mixHex(theme.tint, '#000000', 0.72), 0.55);
    setFont(ctx, 5.8, 500, SANS);
    drawSpacedText(ctx, ellipsize(ctx, slogan, W - 60, 2.2), W / 2, H - below / 2 + 2, 2.2, 'center');
  }
}

/* ------------------------------------------------------------------ */
/* 社交：音乐播放器                                                       */
/* ------------------------------------------------------------------ */

const PLAYER_ART = { left: 56, top: 62, w: 288, h: 288 };

// 逐级缩小再放大：不依赖 ctx.filter（Safari / Worker 支持不一），也能得到大半径的柔和模糊
function blurredCover(img, w, h, crop) {
  const step = (cw, src) => {
    const c = new OffscreenCanvas(cw, Math.max(2, Math.round((cw * h) / w)));
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    if (src) x.drawImage(src, 0, 0, c.width, c.height);
    else drawImageCover(x, img, 0, 0, c.width, c.height, crop);
    return c;
  };
  return step(40, step(10, step(64)));
}

function paintPlayer(ctx, scale, assets, info, tpl, style) {
  const { theme } = style;
  const a = PLAYER_ART;
  const x0 = a.left;
  const x1 = a.left + a.w;
  const white = '#FFFFFF';
  const dim = 'rgba(255,255,255,0.64)';

  ctx.fillStyle = theme.dark ? theme.tint : mixHex(theme.tint, '#000000', 0.62);
  ctx.fillRect(0, 0, W, H);
  withAlpha(ctx, style.photoAlpha, () => {
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(blurredCover(assets.photo, W, H, style.crop), 0, 0, W, H);
  });
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(0,0,0,0.14)');
  shade.addColorStop(0.5, 'rgba(0,0,0,0.26)');
  shade.addColorStop(1, 'rgba(0,0,0,0.52)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);

  ctx.textBaseline = 'alphabetic';
  ctx.strokeStyle = white;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x0 + 1, 31);
  ctx.lineTo(x0 + 6, 36);
  ctx.lineTo(x0 + 11, 31);
  ctx.stroke();
  ctx.fillStyle = dim;
  setFont(ctx, 5.5, 600, SANS);
  drawSpacedText(ctx, 'PLAYING FROM', W / 2, 30, 1.8, 'center');
  ctx.fillStyle = white;
  setFont(ctx, 8, 700, SANS);
  drawSpacedText(ctx, ellipsize(ctx, brandOf(style).name, 200, 0.8), W / 2, 42, 0.8, 'center');
  [-5.5, 0, 5.5].forEach((d) => {
    circlePath(ctx, x1 - 6 + d, 33.5, 1.4);
    ctx.fill();
  });

  drawShadowed(ctx, scale, 28, 12, 'rgba(0,0,0,0.42)', () => {
    ctx.fillStyle = '#000000';
    roundedRectPath(ctx, a.left, a.top, a.w, a.h, 10);
    ctx.fill();
  });
  roundedPhoto(ctx, assets, style, a.left, a.top, a.w, a.h, 10);

  ctx.fillStyle = white;
  fitFontSize(ctx, info.place, a.w - 36, 21, 12, 700, SANS, 0.2);
  drawSpacedText(ctx, ellipsize(ctx, info.place, a.w - 36, 0.2), x0, 388, 0.2, 'left');
  ctx.fillStyle = dim;
  setFont(ctx, 9.5, 400, SANS);
  const artist = [info.dateText, info.camera].filter(Boolean).join(' · ') || coordPair(info) || '—';
  drawSpacedText(ctx, ellipsize(ctx, artist, a.w - 36, 0.2), x0, 405, 0.2, 'left');
  heartPath(ctx, x1 - 9, 391, 18);
  ctx.fillStyle = vividOf(style.theme, '#FF5C7A', 0.6, 1);
  ctx.fill();

  // 进度条：一首“歌”就是一天，播放进度是拍摄时刻
  const frac = dayFraction(info.time);
  const f = frac === null ? 0.4 : frac;
  const py = 428;
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  roundedRectPath(ctx, x0, py - 1.6, a.w, 3.2, 1.6);
  ctx.fill();
  ctx.fillStyle = white;
  if (a.w * f > 3.2) {
    roundedRectPath(ctx, x0, py - 1.6, a.w * f, 3.2, 1.6);
    ctx.fill();
  }
  circlePath(ctx, x0 + a.w * f, py, 4.6);
  ctx.fill();
  ctx.fillStyle = dim;
  setFont(ctx, 6.8, 500, SANS);
  const rest = frac === null ? null : 1440 - Math.round(frac * 1440);
  drawSpacedText(ctx, frac === null ? '--:--' : info.time, x0, 444, 0.3, 'left');
  drawSpacedText(ctx, rest === null ? '--:--' : `-${Math.floor(rest / 60)}:${pad2(rest % 60)}`, x1, 444, 0.3, 'right');

  const cy = 478;
  ctx.fillStyle = white;
  ctx.strokeStyle = white;
  shuffleIcon(ctx, x0 + 8, cy, 7);
  skipIcon(ctx, 132, cy, 14, -1);
  circlePath(ctx, W / 2, cy, 24);
  ctx.fill();
  ctx.fillStyle = '#141414';
  roundedRectPath(ctx, W / 2 - 7.5, cy - 8.5, 5, 17, 1.4);
  ctx.fill();
  roundedRectPath(ctx, W / 2 + 2.5, cy - 8.5, 5, 17, 1.4);
  ctx.fill();
  ctx.fillStyle = white;
  skipIcon(ctx, 268, cy, 14, 1);
  repeatIcon(ctx, x1 - 8, cy, 7);

  pinGlyph(ctx, x0 + 4, 521, 9, dim);
  ctx.fillStyle = dim;
  setFont(ctx, 6.8, 500, SANS);
  drawSpacedText(ctx, ellipsize(ctx, coordPair(info, ' · ') || info.coordText, a.w - 40, 0.6), x0 + 13, 519, 0.6, 'left');
  queueIcon(ctx, x1 - 7, 516, 6.5, dim);
}

/* ------------------------------------------------------------------ */
/* 社交：社交贴文                                                         */
/* ------------------------------------------------------------------ */

const SOCIAL = { x: 30, y: 24, w: 340, head: 50, foot: 92 };
const SOCIAL_PHOTO = { left: SOCIAL.x, top: SOCIAL.y + SOCIAL.head, w: SOCIAL.w, h: SOCIAL.w };

// 头像外圈的渐变：中性主题用暖色日落渐变，其余取主题色相两侧
function ringColors(theme) {
  if (isNeutral(theme.tint)) return ['#F9A23F', '#D0307C'];
  const h = hueOf(theme.tint);
  return [hsvToHex(h - 30, 0.72, 1), hsvToHex(h + 40, 0.78, 0.86)];
}

function paintSocial(ctx, scale, assets, info, tpl, style) {
  const { theme } = style;
  const dark = theme.dark;
  const ink = dark ? '#F5F5F5' : '#111111';
  const gray = dark ? 'rgba(245,245,245,0.55)' : 'rgba(17,17,17,0.5)';
  const { x, y, w } = SOCIAL;
  const h = SOCIAL.head + SOCIAL.w + SOCIAL.foot;
  const p = SOCIAL_PHOTO;
  const user = brandOf(style).name.toLowerCase().replace(/\s+/g, '_');

  drawMapRegion(ctx, assets.map, 0, 0, W, H, tpl, info, style);
  drawShadowed(ctx, scale, 24, 8, 'rgba(0,0,0,0.28)', () => {
    ctx.fillStyle = dark ? '#000000' : '#FFFFFF';
    roundedRectPath(ctx, x, y, w, h, 14);
    ctx.fill();
  });
  ctx.save();
  ctx.beginPath();
  ctx.rect(p.left, p.top, p.w, p.h);
  ctx.clip();
  withAlpha(ctx, style.photoAlpha, () => drawImageCover(ctx, assets.photo, p.left, p.top, p.w, p.h, style.crop));
  ctx.restore();

  const ax = x + 27;
  const ay = y + 25;
  const [c1, c2] = ringColors(theme);
  const ring = ctx.createLinearGradient(ax - 16, ay + 16, ax + 16, ay - 16);
  ring.addColorStop(0, c1);
  ring.addColorStop(1, c2);
  ctx.strokeStyle = ring;
  ctx.lineWidth = 1.8;
  circlePath(ctx, ax, ay, 15.5);
  ctx.stroke();
  ctx.fillStyle = dark ? '#1C1C1E' : '#F2F2F2';
  circlePath(ctx, ax, ay, 12.8);
  ctx.fill();
  drawLogoMark(ctx, ax, ay, 7, ink);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ink;
  setFont(ctx, 9, 700, SANS);
  drawSpacedText(ctx, ellipsize(ctx, user, w - 110, 0.1), ax + 24, ay - 1.5, 0.1, 'left');
  setFont(ctx, 7.5, 400, SANS);
  drawSpacedText(ctx, ellipsize(ctx, titleCase(info.place), w - 110, 0.1), ax + 24, ay + 10, 0.1, 'left');
  [-4.5, 0, 4.5].forEach((d) => {
    circlePath(ctx, x + w - 20 + d, ay, 1.3);
    ctx.fill();
  });

  const iy = p.top + p.h + 19;
  heartPath(ctx, x + 22, iy + 0.5, 19);
  ctx.fillStyle = '#FF3040';
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  bubbleIcon(ctx, x + 51, iy, 7.2);
  planeIcon(ctx, x + 79, iy, 7.4);
  bookmarkIcon(ctx, x + w - 21, iy, 7.6);

  ctx.fillStyle = ink;
  setFont(ctx, 8, 700, SANS);
  drawSpacedText(ctx, `${(1000 + (info.seed % 9000)).toLocaleString('en-US')} likes`, x + 14, iy + 25, 0.1, 'left');

  const slogan = sloganOf(style);
  const caption = slogan ? sentenceCase(slogan) : coordPair(info) || info.coordText;
  const name = ellipsize(ctx, user, 120, 0.1);
  const nw = measureSpaced(ctx, name, 0.1);
  drawSpacedText(ctx, name, x + 14, iy + 41, 0.1, 'left');
  setFont(ctx, 8, 400, SANS);
  drawSpacedText(ctx, ellipsize(ctx, caption, w - 28 - nw - 5, 0.1), x + 14 + nw + 5, iy + 41, 0.1, 'left');
  ctx.fillStyle = gray;
  setFont(ctx, 6, 500, SANS);
  const meta = [info.dateText, coordPair(info, ' · ')].filter(Boolean).join('  ·  ').toUpperCase();
  drawSpacedText(ctx, ellipsize(ctx, meta, w - 28, 0.8), x + 14, iy + 57, 0.8, 'left');
}

/* ------------------------------------------------------------------ */
/* 旅行：地点卡片                                                         */
/* ------------------------------------------------------------------ */

const MAPCARD_PIN = { x: 0.5, y: 0.4 };
const MAPCARD_MARKER = { x: 106, y: 30, w: 188, h: 172 };
const MAPCARD_PHOTO = { left: 111, top: 35, w: 178, h: 162 };
const MAPCARD_SHEET = 360;

// 圆角矩形 + 底部指向坐标的尖角，合成一条路径
function markerPath(ctx, x, y, w, h, r, tipX, tipY, half) {
  const b = y + h;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, b - r);
  ctx.arcTo(x + w, b, x + w - r, b, r);
  ctx.lineTo(tipX + half, b);
  ctx.lineTo(tipX, tipY);
  ctx.lineTo(tipX - half, b);
  ctx.lineTo(x + r, b);
  ctx.arcTo(x, b, x, b - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function sheetPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

function valuePill(ctx, x, y, w, h, bg, label, value, colors) {
  ctx.fillStyle = bg;
  roundedRectPath(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.fillStyle = colors[1];
  setFont(ctx, 5.5, 700, SANS);
  drawSpacedText(ctx, label, x + 12, y + 15, 1.4, 'left');
  ctx.fillStyle = colors[0];
  fitFontSize(ctx, value, w - 24, 11, 7, 700, SANS, 0.2);
  drawSpacedText(ctx, value, x + 12, y + 29, 0.2, 'left');
}

function paintMapcard(ctx, scale, assets, info, tpl, style) {
  const { theme } = style;
  const dark = theme.dark;
  const ink = dark ? '#F5F5F7' : '#1D1D1F';
  const gray = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const fill = dark ? '#2C2C2E' : '#F2F2F7';
  const accent = vividOf(theme, '#0A84FF', 0.78, 0.92);

  drawMapRegion(ctx, assets.map, 0, 0, W, H, tpl, info, style);

  // 照片标注（相册“地点”视图的样式）：白边圆角 + 指向拍摄位置的尖角
  const m = MAPCARD_MARKER;
  const p = MAPCARD_PHOTO;
  drawShadowed(ctx, scale, 16, 6, 'rgba(0,0,0,0.3)', () => {
    ctx.fillStyle = '#FFFFFF';
    markerPath(ctx, m.x, m.y, m.w, m.h, 16, W * MAPCARD_PIN.x, H * MAPCARD_PIN.y, 10);
    ctx.fill();
  });
  roundedPhoto(ctx, assets, style, p.left, p.top, p.w, p.h, 12);

  const sy = MAPCARD_SHEET;
  drawShadowed(ctx, scale, 20, -2, 'rgba(0,0,0,0.16)', () => {
    ctx.fillStyle = dark ? '#1C1C1E' : '#FFFFFF';
    sheetPath(ctx, 0, sy, W, H - sy, 20);
    ctx.fill();
  });
  ctx.fillStyle = dark ? 'rgba(235,235,245,0.3)' : 'rgba(60,60,67,0.3)';
  roundedRectPath(ctx, W / 2 - 18, sy + 7, 36, 4.5, 2.25);
  ctx.fill();

  const x0 = 24;
  const x1 = W - 24;
  ctx.fillStyle = fill;
  circlePath(ctx, x1 - 11, sy + 33, 11);
  ctx.fill();
  ctx.strokeStyle = gray;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  strokeLine(ctx, x1 - 14.5, sy + 29.5, x1 - 7.5, sy + 36.5);
  strokeLine(ctx, x1 - 7.5, sy + 29.5, x1 - 14.5, sy + 36.5);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ink;
  fitFontSize(ctx, info.place, x1 - x0 - 36, 24, 13, 800, SANS, 0.2);
  drawSpacedText(ctx, ellipsize(ctx, info.place, x1 - x0 - 36, 0.2), x0, sy + 44, 0.2, 'left');
  ctx.fillStyle = gray;
  setFont(ctx, 9, 400, SANS);
  drawSpacedText(ctx, ellipsize(ctx, dateTime(info, ' · ') || '—', x1 - x0, 0.2), x0, sy + 61, 0.2, 'left');

  const by = sy + 76;
  const bh = 38;
  const bw = (x1 - x0 - bh - 16) / 2;
  const { lat, lon } = shortCoord(info);
  const onAccent = inkOn(accent);
  valuePill(ctx, x0, by, bw, bh, accent, 'LATITUDE', lat, [onAccent, hexToRgba(onAccent, 0.72)]);
  valuePill(ctx, x0 + bw + 8, by, bw, bh, fill, 'LONGITUDE', lon, [ink, gray]);
  ctx.fillStyle = fill;
  circlePath(ctx, x1 - bh / 2, by + bh / 2, bh / 2);
  ctx.fill();
  navArrow(ctx, x1 - bh / 2 - 1, by + bh / 2 + 1, 8, dark ? accent : capLuminance(accent, 0.5));

  ctx.strokeStyle = dark ? 'rgba(84,84,88,0.65)' : 'rgba(60,60,67,0.14)';
  ctx.lineWidth = 0.6;
  strokeLine(ctx, x0, by + bh + 13, x1, by + bh + 13);
  const fy = by + bh + 32;
  const brand = brandOf(style).name;
  setFont(ctx, 6.5, 800, SANS);
  const brandW = measureSpaced(ctx, brand, 2);
  ctx.fillStyle = gray;
  drawSpacedText(ctx, brand, x1, fy, 2, 'right');
  const note = info.camera || sloganOf(style);
  if (note) {
    let tx = x0;
    if (info.camera) {
      cameraGlyph(ctx, x0 + 5, fy - 3, 4.6, gray);
      tx += 15;
    }
    ctx.fillStyle = gray;
    setFont(ctx, 7.5, 400, SANS);
    drawSpacedText(ctx, ellipsize(ctx, note, x1 - brandW - 20 - tx, 0.2), tx, fy, 0.2, 'left');
  }
}

/* ------------------------------------------------------------------ */
/* 艺术：等高线                                                           */
/* ------------------------------------------------------------------ */

const TOPO_PHOTO = { left: 48, top: 46, w: 304, h: 300 };
const TOPO_CELL = 5;
const TOPO_LEVELS = 18;

function hash2(i, j, seed) {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = x - xi;
  const ty = y - yi;
  const fx = tx * tx * tx * (tx * (tx * 6 - 15) + 10);
  const fy = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

// 按坐标种子生成的伪地形（分形噪声 + 坐标扭曲），归一化到 0~1；同一地点每次结果相同
function terrainField(seed) {
  const cols = Math.ceil(W / TOPO_CELL);
  const rows = Math.ceil(H / TOPO_CELL);
  const f = new Float32Array((cols + 1) * (rows + 1));
  let min = Infinity;
  let max = -Infinity;
  for (let j = 0; j <= rows; j += 1) {
    for (let i = 0; i <= cols; i += 1) {
      const x = i * TOPO_CELL;
      const y = j * TOPO_CELL;
      const wx = x + (valueNoise(x / 110, y / 110, seed + 7) - 0.5) * 120;
      const wy = y + (valueNoise(x / 110 + 5.2, y / 110 + 1.3, seed + 11) - 0.5) * 120;
      let v = 0;
      let amp = 1;
      let freq = 1 / 170;
      for (let o = 0; o < 4; o += 1) {
        v += valueNoise(wx * freq, wy * freq, seed + o * 131) * amp;
        amp *= 0.48;
        freq *= 2.1;
      }
      const k = j * (cols + 1) + i;
      f[k] = v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  const span = max - min || 1;
  for (let k = 0; k < f.length; k += 1) f[k] = (f[k] - min) / span;
  return { f, cols, rows };
}

// 行进方块法：把某一高度的等值线追加到当前路径
function contourPath(ctx, field, level) {
  const { f, cols, rows } = field;
  const n = cols + 1;
  const c = TOPO_CELL;
  const seg = (p, q) => {
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(q[0], q[1]);
  };
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const a = f[j * n + i];
      const b = f[j * n + i + 1];
      const d = f[(j + 1) * n + i];
      const e = f[(j + 1) * n + i + 1];
      const code = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (e > level ? 2 : 0) | (d > level ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const x = i * c;
      const y = j * c;
      const top = [x + (c * (level - a)) / (b - a), y];
      const right = [x + c, y + (c * (level - b)) / (e - b)];
      const bottom = [x + (c * (level - d)) / (e - d), y + c];
      const left = [x, y + (c * (level - a)) / (d - a)];
      const center = (a + b + d + e) / 4 > level;
      switch (code) {
        case 1: case 14: seg(left, bottom); break;
        case 2: case 13: seg(bottom, right); break;
        case 3: case 12: seg(left, right); break;
        case 4: case 11: seg(top, right); break;
        case 6: case 9: seg(top, bottom); break;
        case 7: case 8: seg(left, top); break;
        case 5:
          if (center) { seg(left, top); seg(bottom, right); } else { seg(top, right); seg(left, bottom); }
          break;
        case 10:
          if (center) { seg(top, right); seg(left, bottom); } else { seg(left, top); seg(bottom, right); }
          break;
        default: break;
      }
    }
  }
}

// 高度着色：低处浅、高处略深，按网格点绘成小图后平滑放大
function reliefImage(field, lo, hi) {
  const { f, cols, rows } = field;
  const c = new OffscreenCanvas(cols + 1, rows + 1);
  const x = c.getContext('2d');
  const img = x.getImageData(0, 0, cols + 1, rows + 1);
  const d = img.data;
  const A = hexToRgb(lo);
  const B = hexToRgb(hi);
  for (let p = 0; p < f.length; p += 1) {
    const t = f[p];
    d[p * 4] = A.r + (B.r - A.r) * t;
    d[p * 4 + 1] = A.g + (B.g - A.g) * t;
    d[p * 4 + 2] = A.b + (B.b - A.b) * t;
    d[p * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}

function northArrow(ctx, cx, cy, s, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(cx, cy - s);
  ctx.lineTo(cx + s * 0.42, cy + s * 0.55);
  ctx.lineTo(cx, cy + s * 0.25);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx, cy - s);
  ctx.lineTo(cx - s * 0.42, cy + s * 0.55);
  ctx.lineTo(cx, cy + s * 0.25);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function paintTopo(ctx, scale, assets, info, tpl, style) {
  const { theme } = style;
  const dark = theme.dark;
  const paper = dark ? theme.tint : mixHex(theme.tint, '#FFFFFF', 0.4);
  const ink = dark ? '#EDE9E1' : '#23211E';
  const line = dark ? '#FFFFFF' : isNeutral(theme.tint) ? '#8C5A2E' : mixHex(theme.tint, '#000000', 0.62);
  const field = terrainField(info.seed);

  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.imageSmoothingQuality = 'high';
  const relief = reliefImage(field, paper, dark ? mixHex(paper, '#FFFFFF', 0.06) : mixHex(paper, line, 0.09));
  ctx.drawImage(relief, -TOPO_CELL / 2, -TOPO_CELL / 2, (field.cols + 1) * TOPO_CELL, (field.rows + 1) * TOPO_CELL);
  ctx.restore();

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 1; i < TOPO_LEVELS; i += 1) {
    const major = i % 4 === 0;
    ctx.strokeStyle = hexToRgba(line, dark ? (major ? 0.3 : 0.14) : major ? 0.5 : 0.26);
    ctx.lineWidth = major ? 1 : 0.55;
    ctx.beginPath();
    contourPath(ctx, field, i / TOPO_LEVELS);
    ctx.stroke();
  }
  ctx.restore();

  const p = TOPO_PHOTO;
  drawShadowed(ctx, scale, 14, 5, 'rgba(0,0,0,0.2)', () => {
    ctx.fillStyle = paper;
    ctx.fillRect(p.left - 6, p.top - 6, p.w + 12, p.h + 12);
  });
  withAlpha(ctx, style.photoAlpha, () => drawImageCover(ctx, assets.photo, p.left, p.top, p.w, p.h, style.crop));
  ctx.strokeStyle = hexToRgba(ink, 0.5);
  ctx.lineWidth = 0.6;
  ctx.strokeRect(p.left - 6, p.top - 6, p.w + 12, p.h + 12);

  // 图例框：地名 / 坐标 / 日期 + 位置图 + 指北针 / 比例尺 / 等高距
  const bx = p.left - 6;
  const bw = p.w + 12;
  const by = 366;
  const bh = 134;
  ctx.fillStyle = paper;
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeRect(bx, by, bw, bh);
  ctx.strokeStyle = hexToRgba(ink, 0.25);
  ctx.strokeRect(bx + 3, by + 3, bw - 6, bh - 6);

  const ms = 62;
  const mx = bx + bw - 14 - ms;
  const my = by + 14;
  drawMapWindow(ctx, assets.map, mx, my, ms, ms, tpl, info, style);
  ctx.strokeStyle = hexToRgba(ink, 0.55);
  ctx.lineWidth = 0.6;
  ctx.strokeRect(mx, my, ms, ms);

  const tx = bx + 16;
  const tw = mx - 14 - tx;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = hexToRgba(ink, 0.6);
  setFont(ctx, 5.5, 700, FUTURA);
  drawSpacedText(ctx, 'TOPOGRAPHIC SURVEY', tx, by + 24, 2.2, 'left');
  ctx.fillStyle = ink;
  fitFontSize(ctx, info.place, tw, 30, 13, 700, FUTURA, 1.6);
  drawSpacedText(ctx, ellipsize(ctx, info.place, tw, 1.6), tx - 1, by + 54, 1.6, 'left');
  ctx.fillStyle = hexToRgba(ink, 0.78);
  setFont(ctx, 6.5, 500, MONO);
  drawSpacedText(ctx, ellipsize(ctx, info.coordText, tw, 0.4), tx, by + 70, 0.4, 'left');
  drawSpacedText(ctx, ellipsize(ctx, dateTime(info) || '—', tw, 0.4), tx, by + 82, 0.4, 'left');

  const ly = by + 96;
  ctx.strokeStyle = hexToRgba(ink, 0.3);
  ctx.lineWidth = 0.5;
  strokeLine(ctx, tx, ly, bx + bw - 14, ly);
  const ry = ly + 22;
  northArrow(ctx, tx + 5, ry - 4, 7, ink);
  ctx.fillStyle = ink;
  setFont(ctx, 5.5, 700, FUTURA);
  drawSpacedText(ctx, 'N', tx + 5, ry + 9, 0, 'center');

  // 像真实地形图一样，等高距写在比例尺下方；标语单独占右侧
  const bar = hasLoc(info) ? scaleBar(info.lat, info.zoom, 64) : null;
  const sx = tx + 22;
  if (bar) {
    ctx.fillStyle = ink;
    ctx.fillRect(sx, ry - 2, bar.length / 2, 2.2);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(sx, ry - 2, bar.length, 2.2);
    setFont(ctx, 5, 600, FUTURA);
    drawSpacedText(ctx, '0', sx, ry - 6, 0, 'center');
    drawSpacedText(ctx, bar.label, sx + bar.length, ry - 6, 0.4, 'center');
  }
  ctx.fillStyle = hexToRgba(ink, 0.7);
  setFont(ctx, 4.6, 600, FUTURA);
  const legend = `CONTOUR INTERVAL ${(info.seed % 3) * 5 + 10} METERS`;
  drawSpacedText(ctx, legend, sx, bar ? ry + 9 : ry + 1, 0.9, 'left');
  const used = Math.max(bar ? bar.length + 8 : 0, measureSpaced(ctx, legend, 0.9));
  const slogan = sloganOf(style);
  const room = bx + bw - 14 - (sx + used + 16);
  if (slogan && room > 40) {
    ctx.fillStyle = hexToRgba(ink, 0.7);
    setFont(ctx, 5.5, 400, SERIF, 'italic');
    drawSpacedText(ctx, ellipsize(ctx, slogan, room, 0.8), bx + bw - 14, ry + 3, 0.8, 'right');
  }
}

/* ------------------------------------------------------------------ */
/* 旅行：舷窗                                                             */
/* ------------------------------------------------------------------ */

const WINDOW_GLASS = { left: 100, top: 62, w: 200, h: 280 };
const WINDOW_R = 92;

function paintWindow(ctx, scale, assets, info, tpl, style) {
  const { theme } = style;
  const dark = theme.dark;
  const g = { ...WINDOW_GLASS, r: WINDOW_R };
  const cx = g.left + g.w / 2;
  const cy = g.top + g.h / 2;
  const wallTop = dark ? mixHex(theme.tint, '#FFFFFF', 0.14) : mixHex(theme.tint, '#FFFFFF', 0.72);
  const wallBottom = dark ? mixHex(theme.tint, '#000000', 0.1) : mixHex(theme.tint, '#FFFFFF', 0.4);
  const ink = dark ? '#F1EEE8' : '#26241F';
  const accent = dark ? vividOf(theme, '#8FB3FF', 0.45, 0.95) : vividOf(theme, '#2F5DA8', 0.6, 0.62);

  const wall = ctx.createLinearGradient(0, 0, 0, H);
  wall.addColorStop(0, wallTop);
  wall.addColorStop(1, wallBottom);
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 1;
  roundedRectPath(ctx, 20, 20, W - 40, 356, 34);
  ctx.stroke();

  // 窗框：外圈凹陷 -> 框体 -> 玻璃（照片）
  const ring = (pad) => roundedRectPath(ctx, g.left - pad, g.top - pad, g.w + pad * 2, g.h + pad * 2, g.r + pad);
  const recess = ctx.createLinearGradient(0, g.top - 30, 0, g.top + g.h + 30);
  recess.addColorStop(0, dark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.12)');
  recess.addColorStop(1, dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.6)');
  ctx.fillStyle = recess;
  ring(30);
  ctx.fill();
  ctx.fillStyle = wallTop;
  ring(27);
  ctx.fill();
  const frame = ctx.createLinearGradient(0, g.top - 14, 0, g.top + g.h + 14);
  frame.addColorStop(0, dark ? '#4A4D55' : '#D9D5CC');
  frame.addColorStop(1, dark ? '#2E3036' : '#EEEBE4');
  drawShadowed(ctx, scale, 10, 3, 'rgba(0,0,0,0.22)', () => {
    ctx.fillStyle = frame;
    ring(14);
    ctx.fill();
  });

  ctx.save();
  ring(0);
  ctx.clip();
  withAlpha(ctx, style.photoAlpha, () => drawImageCover(ctx, assets.photo, g.left, g.top, g.w, g.h, style.crop));
  const shadeH = 30;
  ctx.fillStyle = dark ? mixHex(theme.tint, '#FFFFFF', 0.2) : mixHex(theme.tint, '#FFFFFF', 0.8);
  ctx.fillRect(g.left, g.top, g.w, shadeH);
  const edge = ctx.createLinearGradient(0, g.top + shadeH, 0, g.top + shadeH + 10);
  edge.addColorStop(0, 'rgba(0,0,0,0.3)');
  edge.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = edge;
  ctx.fillRect(g.left, g.top + shadeH, g.w, 10);
  ctx.fillStyle = dark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.18)';
  roundedRectPath(ctx, cx - 16, g.top + shadeH - 7, 32, 4.5, 2.25);
  ctx.fill();
  const glare = ctx.createLinearGradient(g.left, g.top, g.left + g.w, g.top + g.h);
  glare.addColorStop(0.25, 'rgba(255,255,255,0)');
  glare.addColorStop(0.42, 'rgba(255,255,255,0.14)');
  glare.addColorStop(0.5, 'rgba(255,255,255,0)');
  ctx.fillStyle = glare;
  ctx.fillRect(g.left, g.top, g.w, g.h);
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 0.8;
  ring(0);
  ctx.stroke();

  // 左侧文字，右侧机上航线图
  const tx = 44;
  const ty = 408;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = accent;
  setFont(ctx, 6, 700, FUTURA);
  drawSpacedText(ctx, 'NOW FLYING OVER', tx, ty, 2.6, 'left');
  ctx.fillStyle = ink;
  fitFontSize(ctx, info.place, 196, 28, 13, 800, FUTURA, 1);
  drawSpacedText(ctx, ellipsize(ctx, info.place, 196, 1), tx - 1, ty + 32, 1, 'left');
  ctx.fillStyle = hexToRgba(ink, 0.72);
  setFont(ctx, 7, 500, FUTURA);
  drawSpacedText(ctx, ellipsize(ctx, info.coordText, 196, 0.8), tx, ty + 50, 0.8, 'left');
  drawSpacedText(ctx, ellipsize(ctx, dateTime(info, '  ·  ') || '—', 196, 0.8), tx, ty + 63, 0.8, 'left');
  const seat = `SEAT ${12 + (info.seed % 28)}${['A', 'F', 'K'][info.seed % 3]}`;
  setFont(ctx, 6, 800, FUTURA);
  const sw = measureSpaced(ctx, seat, 1.6) + 16;
  ctx.strokeStyle = hexToRgba(ink, 0.5);
  ctx.lineWidth = 0.7;
  roundedRectPath(ctx, tx, ty + 74, sw, 14, 7);
  ctx.stroke();
  ctx.fillStyle = ink;
  drawSpacedText(ctx, seat, tx + sw / 2, ty + 83.6, 1.6, 'center');

  const sx = 262;
  const sy = 394;
  const ss = 96;
  drawShadowed(ctx, scale, 10, 4, 'rgba(0,0,0,0.3)', () => {
    ctx.fillStyle = '#18191C';
    roundedRectPath(ctx, sx, sy, ss, ss, 12);
    ctx.fill();
  });
  const inner = { x: sx + 5, y: sy + 5, s: ss - 10 };
  ctx.save();
  roundedRectPath(ctx, inner.x, inner.y, inner.s, inner.s, 8);
  ctx.clip();
  const screenTheme = { ...theme, dark: true, tint: dark ? theme.tint : mixHex(theme.tint, '#0B1830', 0.85) };
  drawMapWindow(ctx, assets.map, inner.x, inner.y, inner.s, inner.s, tpl, info, { ...style, theme: screenTheme });
  const mcx = inner.x + inner.s / 2;
  const mcy = inner.y + inner.s / 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2.5, 2.5]);
  ctx.beginPath();
  ctx.moveTo(inner.x + 6, inner.y + inner.s - 8);
  ctx.quadraticCurveTo(inner.x + 14, mcy - 4, mcx - 6, mcy + 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.save();
  ctx.translate(mcx, mcy);
  ctx.rotate(-28 * DEG);
  drawPlane(ctx, 0, 0, 15, '#FFFFFF');
  ctx.restore();
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* 旅行：指南针                                                           */
/* ------------------------------------------------------------------ */

const COMPASS = { cx: 200, cy: 218, r: 118, bezel: 30 };
const COMPASS_PHOTO = { left: COMPASS.cx - COMPASS.r, top: COMPASS.cy - COMPASS.r, w: COMPASS.r * 2, h: COMPASS.r * 2 };
const COMPASS_PIN = { x: 0.5, y: COMPASS.cy / H };

function paintCompass(ctx, scale, assets, info, tpl, style) {
  const { theme } = style;
  const dark = theme.dark;
  const { cx, cy, r } = COMPASS;
  const R = r + COMPASS.bezel;
  const paper = dark ? theme.tint : mixHex(theme.tint, '#FFFFFF', 0.45);
  const ink = dark ? '#F1EEE8' : '#1E1E20';
  const bezel = dark ? '#ECE9E2' : '#1D1E21';
  const mark = dark ? '#1D1E21' : '#F4F2ED';
  const red = '#E0473E';

  drawMapRegion(ctx, assets.map, 0, 0, W, H, tpl, info, style);
  const fade = ctx.createLinearGradient(0, 360, 0, 410);
  fade.addColorStop(0, hexToRgba(paper, 0));
  fade.addColorStop(1, hexToRgba(paper, 1));
  ctx.fillStyle = fade;
  ctx.fillRect(0, 360, W, 50);
  ctx.fillStyle = paper;
  ctx.fillRect(0, 409.5, W, H - 409.5);

  drawShadowed(ctx, scale, 22, 8, 'rgba(0,0,0,0.35)', () => {
    ctx.fillStyle = bezel;
    circlePath(ctx, cx, cy, R);
    ctx.fill();
  });
  ctx.save();
  circlePath(ctx, cx, cy, r);
  ctx.clip();
  withAlpha(ctx, style.photoAlpha, () => drawImageCover(ctx, assets.photo, cx - r, cy - r, r * 2, r * 2, style.crop));
  ctx.restore();
  ctx.strokeStyle = mark;
  ctx.lineWidth = 1.2;
  circlePath(ctx, cx, cy, r);
  ctx.stroke();

  ctx.save();
  ctx.strokeStyle = mark;
  ctx.lineCap = 'butt';
  for (let d = 0; d < 360; d += 2) {
    const len = d % 30 === 0 ? 7 : d % 10 === 0 ? 4.6 : 2.4;
    const a = (d - 90) * DEG;
    ctx.lineWidth = d % 10 === 0 ? 0.9 : 0.5;
    strokeLine(ctx, cx + Math.cos(a) * (R - 3), cy + Math.sin(a) * (R - 3), cx + Math.cos(a) * (R - 3 - len), cy + Math.sin(a) * (R - 3 - len));
  }
  ctx.restore();

  ctx.textBaseline = 'middle';
  for (let d = 0; d < 360; d += 30) {
    const a = (d - 90) * DEG;
    const cardinal = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[d];
    const rr = R - 18;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    ctx.rotate(d * DEG);
    ctx.fillStyle = cardinal === 'N' ? red : mark;
    setFont(ctx, cardinal ? 10 : 5.5, cardinal ? 800 : 600, FUTURA);
    drawSpacedText(ctx, cardinal || String(d), 0, 0.5, 0, 'center');
    ctx.restore();
  }
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = red;
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy - R - 12);
  ctx.lineTo(cx + 6, cy - R - 12);
  ctx.lineTo(cx, cy - R - 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = ink;
  fitFontSize(ctx, info.place, W - 70, 40, 16, 800, CONDENSED, 2);
  drawSpacedText(ctx, info.place, W / 2, 428, 2, 'center');
  const { lat, lon } = shortCoord(info);
  const fields = [['LATITUDE', lat], ['LONGITUDE', lon], ['DATE', info.dateText || '—']];
  const colW = 108;
  fields.forEach(([k, v], i) => {
    const x = W / 2 + (i - 1) * colW;
    ctx.fillStyle = hexToRgba(ink, 0.55);
    setFont(ctx, 5.5, 700, FUTURA);
    drawSpacedText(ctx, k, x, 450, 1.8, 'center');
    ctx.fillStyle = ink;
    fitFontSize(ctx, v, colW - 14, 9, 6, 700, FUTURA, 0.6);
    drawSpacedText(ctx, v, x, 464, 0.6, 'center');
  });
  ctx.strokeStyle = hexToRgba(ink, 0.22);
  ctx.lineWidth = 0.6;
  [-0.5, 0.5].forEach((d) => strokeLine(ctx, W / 2 + d * colW, 442, W / 2 + d * colW, 468));
  const slogan = sloganOf(style);
  if (slogan) {
    ctx.fillStyle = hexToRgba(ink, 0.6);
    setFont(ctx, 7, 400, SERIF, 'italic');
    drawSpacedText(ctx, ellipsize(ctx, slogan, W - 80, 1.6), W / 2, 500, 1.6, 'center');
  }
}

/* ------------------------------------------------------------------ */
/* 旅行：站牌                                                             */
/* ------------------------------------------------------------------ */

const SIGN = { x: 24, y: 340, w: 352, h: 124, band: 22 };

function paintStation(ctx, scale, assets, info, tpl, style) {
  const { theme } = style;
  const s = SIGN;
  const lineColor = capLuminance(vividOf(theme, '#2E9E4F', 0.72, theme.dark ? 0.8 : 0.66), 0.5);
  const ink = '#1C1C1E';
  const gray = '#76767C';

  withAlpha(ctx, style.photoAlpha, () => {
    drawImageCover(ctx, assets.photo, 0, 0, W, H, style.crop);
    const g = ctx.createLinearGradient(0, H * 0.55, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(0, H * 0.55, W, H * 0.45);
  });

  // 立柱
  [86, 314].forEach((px) => {
    const post = ctx.createLinearGradient(px - 4, 0, px + 4, 0);
    post.addColorStop(0, '#3A3C40');
    post.addColorStop(0.45, '#6E7177');
    post.addColorStop(1, '#2F3134');
    ctx.fillStyle = post;
    ctx.fillRect(px - 4, s.y + s.h - 4, 8, H - s.y - s.h + 4);
  });

  drawShadowed(ctx, scale, 18, 8, 'rgba(0,0,0,0.4)', () => {
    ctx.fillStyle = '#FAFAF7';
    roundedRectPath(ctx, s.x, s.y, s.w, s.h, 5);
    ctx.fill();
  });
  ctx.save();
  roundedRectPath(ctx, s.x, s.y, s.w, s.h, 5);
  ctx.clip();
  const bandY = s.y + s.h - s.band;
  ctx.fillStyle = lineColor;
  ctx.fillRect(s.x, bandY, s.w, s.band);
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 0.6;
  roundedRectPath(ctx, s.x, s.y, s.w, s.h, 5);
  ctx.stroke();

  // 站点编号：品牌首字母 + 拍摄日
  const code = brandOf(style).name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'GP';
  const dp = dateParts(info);
  const num = pad2(dp ? dp.d : info.seed % 100);
  const bx = s.x + 18;
  const by = s.y + 22;
  ctx.fillStyle = '#FFFFFF';
  roundedRectPath(ctx, bx, by, 38, 46, 7);
  ctx.fill();
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2.6;
  ctx.stroke();
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ink;
  setFont(ctx, 8, 800, SANS);
  drawSpacedText(ctx, code, bx + 19, by + 16, 0.6, 'center');
  setFont(ctx, 17, 800, SANS);
  drawSpacedText(ctx, num, bx + 19, by + 37, 0, 'center');

  // 右侧对称放一枚“现在地”圆形地图
  const mr = 23;
  const mcx = s.x + s.w - 18 - mr;
  const mcy = by + 23;
  ctx.save();
  circlePath(ctx, mcx, mcy, mr);
  ctx.clip();
  drawMapWindow(ctx, assets.map, mcx - mr, mcy - mr, mr * 2, mr * 2, tpl, info, style);
  ctx.restore();
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2.6;
  circlePath(ctx, mcx, mcy, mr);
  ctx.stroke();

  // 站名下的拼音行：长地名的拼音会被缩写成首字母，在站牌上不像站名，只给短地名加
  const place = info.place;
  const cjk = Array.from(place).filter((ch) => containsCjk(ch)).length;
  const latin = cjk && cjk <= SHORT_LIMIT ? toLatinName(place) : '';
  const nameX = s.x + s.w / 2;
  const nameW = s.w - 150;
  const spacing = cjk ? 6 : 1.5;
  ctx.fillStyle = gray;
  setFont(ctx, 7, 600, SANS);
  drawSpacedText(ctx, ellipsize(ctx, dateTime(info, '  ') || ' ', nameW, 1.6), nameX, s.y + 20, 1.6, 'center');
  ctx.fillStyle = ink;
  fitFontSize(ctx, place, nameW, cjk ? 42 : 36, 14, 800, SANS, spacing);
  drawSpacedText(ctx, ellipsize(ctx, place, nameW, spacing), nameX, latin ? s.y + 66 : s.y + 72, spacing, 'center');
  if (latin) {
    ctx.fillStyle = gray;
    setFont(ctx, 8, 600, SANS);
    drawSpacedText(ctx, ellipsize(ctx, latin, nameW, 2.4), nameX, s.y + 84, 2.4, 'center');
  }

  // 色带：左右两“站”是纬度与经度
  const { lat, lon } = shortCoord(info);
  const midY = bandY + s.band / 2;
  ctx.fillStyle = '#FFFFFF';
  const tri = (x, dir) => {
    ctx.beginPath();
    ctx.moveTo(x, midY);
    ctx.lineTo(x - dir * 6, midY - 4.5);
    ctx.lineTo(x - dir * 6, midY + 4.5);
    ctx.closePath();
    ctx.fill();
  };
  tri(s.x + 12, -1);
  tri(s.x + s.w - 12, 1);
  setFont(ctx, 7.5, 700, SANS);
  drawSpacedText(ctx, lat, s.x + 24, midY + 2.7, 0.8, 'left');
  drawSpacedText(ctx, lon, s.x + s.w - 24, midY + 2.7, 0.8, 'right');
  const coordW = Math.max(measureSpaced(ctx, lat, 0.8), measureSpaced(ctx, lon, 0.8));
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  setFont(ctx, 6, 700, SANS);
  const slogan = sloganOf(style);
  if (slogan) {
    drawSpacedText(ctx, ellipsize(ctx, slogan, s.w - 2 * (coordW + 40), 1.4), s.x + s.w / 2, midY + 2.2, 1.4, 'center');
  }
}

/* ------------------------------------------------------------------ */
/* 简约：三联画                                                           */
/* ------------------------------------------------------------------ */

const TRIPTYCH = { x: 30, y: 54, w: 340, h: 346, gap: 9, inset: 18 };
const TRIPTYCH_PHOTO = { left: TRIPTYCH.x, top: TRIPTYCH.y, w: TRIPTYCH.w, h: TRIPTYCH.h };

function paintTriptych(ctx, scale, assets, info, tpl, style) {
  const { theme } = style;
  const dark = theme.dark;
  const t = TRIPTYCH;
  const wall = dark ? theme.tint : mixHex(theme.tint, '#FFFFFF', 0.45);
  const ink = dark ? '#F1EEE8' : '#24221F';

  drawMapRegion(ctx, assets.map, 0, 0, W, H, tpl, info, style);
  ctx.fillStyle = hexToRgba(wall, 0.88);
  ctx.fillRect(0, 0, W, H);
  const light = ctx.createRadialGradient(W / 2, 40, 10, W / 2, 180, 330);
  light.addColorStop(0, dark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)');
  light.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, W, H);

  const pw = (t.w - t.gap * 2) / 3;
  const panels = [0, 1, 2].map((i) => {
    const inset = i === 1 ? 0 : t.inset;
    return { x: t.x + i * (pw + t.gap), y: t.y + inset, w: pw, h: t.h - inset * 2 };
  });
  panels.forEach((p) => {
    drawShadowed(ctx, scale, 14, 7, dark ? 'rgba(0,0,0,0.55)' : 'rgba(40,30,20,0.28)', () => {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(p.x, p.y, p.w, p.h);
    });
  });
  panels.forEach((p) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.x, p.y, p.w, p.h);
    ctx.clip();
    withAlpha(ctx, style.photoAlpha, () => drawImageCover(ctx, assets.photo, t.x, t.y, t.w, t.h, style.crop));
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 0.6;
    ctx.strokeRect(p.x + 0.3, p.y + 0.3, p.w - 0.6, p.h - 0.6);
  });

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ink;
  fitFontSize(ctx, info.place, W - 80, 30, 14, 400, DIDOT, 5);
  drawSpacedText(ctx, info.place, W / 2, 452, 5, 'center');
  ctx.strokeStyle = hexToRgba(ink, 0.35);
  ctx.lineWidth = 0.5;
  strokeLine(ctx, W / 2 - 18, 466, W / 2 + 18, 466);
  ctx.fillStyle = hexToRgba(ink, 0.7);
  setFont(ctx, 6.5, 500, SANS);
  drawSpacedText(ctx, ellipsize(ctx, [coordPair(info, '   '), info.dateText].filter(Boolean).join('   ·   ') || '—', W - 70, 1.8), W / 2, 484, 1.8, 'center');
  const slogan = sloganOf(style);
  if (slogan) {
    ctx.fillStyle = hexToRgba(ink, 0.55);
    setFont(ctx, 7, 400, SERIF, 'italic');
    drawSpacedText(ctx, ellipsize(ctx, slogan, W - 90, 1.2), W / 2, 504, 1.2, 'center');
  }
}

/* ------------------------------------------------------------------ */
/* 注册                                                                 */
/* ------------------------------------------------------------------ */

export const EXTRA_TEMPLATES = [
  { id: 'watermark', name: '相机水印', category: 'social', also: ['minimal'], hot: true, map: tplMap(CENTER_PIN), paint: paintWatermark },
  { id: 'player', name: '音乐播放器', category: 'social', hot: true, map: tplMap(CENTER_PIN), crop: PLAYER_ART, paint: paintPlayer },
  { id: 'social', name: '社交贴文', category: 'social', map: tplMap(CENTER_PIN), crop: SOCIAL_PHOTO, paint: paintSocial },
  { id: 'mapcard', name: '地点卡片', category: 'travel', also: ['classic'], hot: true, map: tplMap(MAPCARD_PIN), crop: MAPCARD_PHOTO, paint: paintMapcard },
  { id: 'window', name: '舷窗', category: 'travel', map: tplMap(CENTER_PIN), mapDark: true, crop: WINDOW_GLASS, paint: paintWindow },
  { id: 'compass', name: '指南针', category: 'travel', also: ['classic'], map: tplMap(COMPASS_PIN), crop: COMPASS_PHOTO, paint: paintCompass },
  { id: 'station', name: '站牌', category: 'travel', also: ['social'], map: tplMap(CENTER_PIN), crop: FULL_PHOTO, paint: paintStation },
  { id: 'topo', name: '等高线', category: 'art', also: ['minimal'], map: tplMap(CENTER_PIN), crop: TOPO_PHOTO, paint: paintTopo },
  { id: 'triptych', name: '三联画', category: 'minimal', also: ['art'], map: tplMap(CENTER_PIN), crop: TRIPTYCH_PHOTO, paint: paintTriptych }
];
