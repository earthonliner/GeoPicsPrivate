/**
 * poster-kit.js
 *
 * 海报绘制的公共部件：尺寸常量、字体、文字排版、照片裁切、地图上色、图层与装饰元素。
 * 原版 15 个模板（posters.js）与新增模板（posters-more.js）共用，只依赖标准 Canvas 2D API，
 * 主线程（HTMLCanvasElement / OffscreenCanvas）与 Web Worker（OffscreenCanvas）都能运行。
 */

import { hexToRgba, hexToHsv, hsvToHex, mixHex, luminance } from './themes.js';

// 海报逻辑尺寸 400 x 533.33（3:4）。所有绘制坐标基于逻辑单位，
// 预览按屏幕 dpr 缩放，导出按 2~4 倍缩放 => 800~1600 px 宽。
export const POSTER_W = 400;
export const POSTER_H = (POSTER_W * 4) / 3;
export const EXPORT_SCALE = 3;
// 底端品牌栏（可选）拼接在海报下方，整张图高度 = POSTER_H + FOOTER_H
export const FOOTER_H = 64;
export const MAX_CROP_ZOOM = 4;

export const posterHeight = (footer) => POSTER_H + (footer ? FOOTER_H : 0);
export const exportSizeText = (footer) => `${POSTER_W * EXPORT_SCALE} × ${Math.round(posterHeight(footer) * EXPORT_SCALE)}`;

export const FULL_PHOTO = { left: 0, top: 0, w: POSTER_W, h: POSTER_H };

/* ------------------------------------------------------------------ */
/* 字体：优先 macOS 自带字体，其他系统逐级回退                            */
/* ------------------------------------------------------------------ */

export const SANS = '"Helvetica Neue", Helvetica, Arial, "PingFang SC", "Microsoft YaHei", sans-serif';
export const SERIF = 'Georgia, "Times New Roman", "Songti SC", serif';
export const DIDOT = 'Didot, "Bodoni 72", "Bodoni MT", "Playfair Display", Georgia, "Songti SC", serif';
export const FUTURA = 'Futura, "Avenir Next", "Century Gothic", "Trebuchet MS", "PingFang SC", sans-serif';
export const CONDENSED = '"Avenir Next Condensed", "Helvetica Neue", Impact, "Arial Narrow", "PingFang SC", sans-serif';
export const MONO = '"SF Mono", Menlo, Monaco, "Courier New", "PingFang SC", monospace';
export const TYPEWRITER = '"American Typewriter", "Courier New", Courier, "Songti SC", monospace';
export const SCRIPT = '"Snell Roundhand", "Apple Chancery", "Brush Script MT", "Segoe Script", "Kaiti SC", "STKaiti", cursive';
export const ROUNDED = '"SF Pro Rounded", "Arial Rounded MT Bold", "Avenir Next", "PingFang SC", sans-serif';

export const TAGLINE = 'CAPTURED MOMENT · LASTING PLACE';
export const DEFAULT_BRAND = { name: 'GEOPICS', tagline: 'MAP YOUR MOMENT' };

export const brandOf = (style) => ({
  name: (style.brand && style.brand.name && style.brand.name.trim()) || DEFAULT_BRAND.name,
  tagline: style.brand && style.brand.tagline !== undefined ? style.brand.tagline : DEFAULT_BRAND.tagline
});

// 海报标语：未设置时用默认标语，设为空字符串则不显示
export const sloganOf = (style) => (style && typeof style.slogan === 'string' ? style.slogan : TAGLINE);

/**
 * 所有模板都请求整张海报比例（3:4）的地图，作为最底层背景，
 * 这样照片降低不透明度时可以与地图自然融合。
 * pin: 定位针在海报中的比例位置，用于避开被照片遮挡的区域（徽章模板中即圆心）
 */
export const MAP_SIZE = { width: 600, height: 800 };
export const CENTER_PIN = { x: 0.5, y: 0.5 };
export const tplMap = (pin) => Object.assign({ pin }, MAP_SIZE);

/* ------------------------------------------------------------------ */
/* 通用工具                                                             */
/* ------------------------------------------------------------------ */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/* ------------------------------------------------------------------ */
/* 文字                                                                 */
/* ------------------------------------------------------------------ */

export function setFont(ctx, size, weight, family, style) {
  ctx.font = `${style || 'normal'} ${weight || 400} ${size}px ${family || SANS}`;
}

export function measureSpaced(ctx, text, spacing) {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + spacing;
  return Math.max(0, w - spacing);
}

// 当前海报的文字不透明度（paintPoster 内同步设置）
let textAlpha = 1;
export function setTextAlpha(alpha) {
  textAlpha = alpha;
}

// 小程序 Canvas 2D 不保证支持 letterSpacing，这里逐字绘制实现字距
export function drawSpacedText(ctx, text, x, y, spacing, align, mode) {
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * textAlpha;
  ctx.textAlign = 'left';
  const total = measureSpaced(ctx, text, spacing);
  let cursor = x;
  if (align === 'center') cursor = x - total / 2;
  else if (align === 'right') cursor = x - total;
  for (const ch of text) {
    if (mode !== 'stroke') ctx.fillText(ch, cursor, y);
    if (mode === 'stroke' || mode === 'both') ctx.strokeText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + spacing;
  }
  ctx.globalAlpha = prevAlpha;
}

// 让大字地名自适应宽度：从 maxSize 开始逐步缩小
export function fitFontSize(ctx, text, maxWidth, maxSize, minSize, weight, family, spacing, style) {
  let size = maxSize;
  // 名称特别长时允许比 minSize 再缩小一些，宁可小一点也不要超出边界
  const floor = Math.max(6, Math.floor(minSize * 0.6));
  while (size > floor) {
    setFont(ctx, size, weight, family, style);
    if (measureSpaced(ctx, text, spacing) <= maxWidth) break;
    size -= 1;
  }
  setFont(ctx, size, weight, family, style);
  return size;
}

// 截断过长的单行文字（末尾加省略号）
export function ellipsize(ctx, text, maxWidth, spacing) {
  const s = String(text || '');
  if (measureSpaced(ctx, s, spacing) <= maxWidth) return s;
  const chars = Array.from(s);
  while (chars.length > 1 && measureSpaced(ctx, `${chars.join('')}…`, spacing) > maxWidth) chars.pop();
  return `${chars.join('').trimEnd()}…`;
}

/**
 * 沿圆弧排字（印章、唱片标签）。centerAngle 为文字中点所在角度（弧度，0 = 正右，-PI/2 = 正上）；
 * inside=false 时文字顶部朝外（适合上半圆），true 时顶部朝圆心（适合下半圆，从左往右读）。
 */
export function drawArcText(ctx, text, cx, cy, radius, centerAngle, spacing, inside) {
  const chars = Array.from(String(text || ''));
  if (!chars.length) return;
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  const dir = inside ? -1 : 1;
  let angle = centerAngle - (dir * total) / 2 / radius;
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * textAlpha;
  ctx.textAlign = 'center';
  chars.forEach((ch, i) => {
    const half = widths[i] / 2 / radius;
    angle += dir * half;
    ctx.save();
    ctx.translate(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.rotate(angle + (dir * Math.PI) / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    angle += dir * (half + spacing / radius);
  });
  ctx.textAlign = 'left';
  ctx.globalAlpha = prevAlpha;
}

/* ------------------------------------------------------------------ */
/* 照片                                                                 */
/* ------------------------------------------------------------------ */

/**
 * 计算 cover 裁切区域。crop = { zoom: 1~4, x: -1~1, y: -1~1 }：
 * zoom 在“刚好铺满”的基础上放大；x / y 为取景窗口在可移动范围内的归一化位置
 * （-1 = 最左 / 最上，0 = 居中，1 = 最右 / 最下），保证窗口永远不会越出图片。
 */
export function coverRect(iw, ih, w, h, crop) {
  const zoom = clamp((crop && crop.zoom) || 1, 1, MAX_CROP_ZOOM);
  const r = Math.max(w / iw, h / ih) * zoom;
  const sw = w / r;
  const sh = h / r;
  const cx = iw / 2 + clamp((crop && crop.x) || 0, -1, 1) * ((iw - sw) / 2);
  const cy = ih / 2 + clamp((crop && crop.y) || 0, -1, 1) * ((ih - sh) / 2);
  return { sx: cx - sw / 2, sy: cy - sh / 2, sw, sh };
}

export function drawImageCover(ctx, img, x, y, w, h, crop) {
  const c = coverRect(img.width, img.height, w, h, crop);
  ctx.drawImage(img, c.sx, c.sy, c.sw, c.sh, x, y, w, h);
}

export function fitInside(img, maxW, maxH) {
  const r = Math.min(maxW / img.width, maxH / img.height);
  return { w: img.width * r, h: img.height * r };
}

// 照片按不透明度绘制，低不透明度时会与下方的地图 / 主题色融合
export function withAlpha(ctx, alpha, draw) {
  ctx.save();
  ctx.globalAlpha = alpha;
  draw();
  ctx.restore();
}

export function photoText(style) {
  const onPhoto = style.photoAlpha >= 0.5;
  const ink = style.theme.ink;
  return {
    main: onPhoto ? '#ffffff' : ink,
    sub: onPhoto ? 'rgba(255,255,255,0.82)' : hexToRgba(ink, 0.8)
  };
}

// 全屏照片 + 上下暗角，杂志封面 / 玻璃卡片 / 巨字共用
export function drawFullBleedPhoto(ctx, assets, style, topShade, bottomShade) {
  const W = POSTER_W;
  const H = POSTER_H;
  withAlpha(ctx, style.photoAlpha, () => {
    drawImageCover(ctx, assets.photo, 0, 0, W, H, style.crop);
    if (topShade) {
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.4);
      g.addColorStop(0, `rgba(0,0,0,${topShade})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H * 0.4);
    }
    if (bottomShade) {
      const g = ctx.createLinearGradient(0, H * 0.5, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${bottomShade})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, H * 0.5, W, H * 0.5);
    }
  });
}

/* ------------------------------------------------------------------ */
/* 地图                                                                 */
/* ------------------------------------------------------------------ */

// 无 token / 下载失败时的本地极简底图（按坐标做伪随机，同一位置结果稳定）
export function drawFallbackMap(ctx, x, y, w, h, seed, pin, dark) {
  const rand = mulberry32(seed);
  ctx.fillStyle = dark ? '#1c1d1f' : '#ecebe7';
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
  ctx.lineWidth = 0.6;
  const step = 24;
  ctx.beginPath();
  for (let gx = x; gx <= x + w; gx += step) {
    ctx.moveTo(gx, y);
    ctx.lineTo(gx, y + h);
  }
  for (let gy = y; gy <= y + h; gy += step) {
    ctx.moveTo(x, gy);
    ctx.lineTo(x + w, gy);
  }
  ctx.stroke();

  ctx.fillStyle = dark ? '#2a2c31' : '#dedde9';
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.ellipse(x + w * (0.15 + rand() * 0.3), y + h * (0.6 + rand() * 0.3), w * 0.28, h * 0.12, rand(), 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    const major = i % 4 === 0;
    ctx.strokeStyle = dark
      ? major ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.14)'
      : major ? '#ffffff' : 'rgba(255,255,255,0.75)';
    ctx.lineWidth = major ? 3.2 : 1.4;
    ctx.beginPath();
    const sx = x + rand() * w;
    const sy = y + rand() * h;
    ctx.moveTo(sx, sy);
    ctx.bezierCurveTo(
      x + rand() * w,
      y + rand() * h,
      x + rand() * w,
      y + rand() * h,
      x + rand() * w,
      y + rand() * h
    );
    ctx.stroke();
  }

  if (pin) {
    const px = x + w * pin.x;
    const py = y + h * pin.y;
    ctx.fillStyle = dark ? '#111111' : '#ffffff';
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = dark ? '#ffffff' : '#111111';
    ctx.beginPath();
    ctx.arc(px, py, 3.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

// 用主题色给灰阶地图上色；设备不支持混合模式时退化为半透明色罩
export function applyTint(ctx, theme, x, y, w, h) {
  const op = theme.dark ? 'screen' : 'multiply';
  ctx.save();
  ctx.globalCompositeOperation = op;
  if (ctx.globalCompositeOperation !== op) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.55;
  }
  ctx.fillStyle = theme.tint;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

/**
 * 绘制带主题色与不透明度的地图区域。
 * 浅色：白底 -> 地图(alpha) -> multiply 主题色；深色：黑底 -> 地图(alpha) -> screen 主题色。
 * alpha=0 时恰为纯主题色。
 */
export function drawMapRegion(ctx, mapImg, x, y, w, h, tpl, info, style) {
  const { theme } = style;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  ctx.fillStyle = theme.dark ? '#000000' : '#ffffff';
  ctx.fillRect(x, y, w, h);

  // 深色地图再压暗一档，避免 screen 叠加后主题色被“洗灰”
  ctx.globalAlpha = theme.dark ? style.mapAlpha * 0.6 : style.mapAlpha;
  if (mapImg) drawImageCover(ctx, mapImg, x, y, w, h);
  else drawFallbackMap(ctx, x, y, w, h, info.seed, tpl.map.pin, theme.dark);
  ctx.globalAlpha = 1;

  applyTint(ctx, theme, x, y, w, h);
  ctx.restore();
}

/**
 * 以定位针为中心，从整张地图上截取 1:1 的一小块（迷你地图），并按主题上色。
 * 调用方可先设置圆角 / 圆形 clip。
 */
export function drawMapWindow(ctx, mapImg, x, y, w, h, tpl, info, style) {
  const { theme } = style;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = theme.dark ? '#000000' : '#ffffff';
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = theme.dark ? 0.6 : 1;
  if (mapImg) {
    const k = mapImg.width / POSTER_W;
    const sw = Math.min(w * k, mapImg.width);
    const sh = Math.min(h * k, mapImg.height);
    const sx = clamp(mapImg.width * tpl.map.pin.x - sw / 2, 0, mapImg.width - sw);
    const sy = clamp(mapImg.height * tpl.map.pin.y - sh / 2, 0, mapImg.height - sh);
    ctx.drawImage(mapImg, sx, sy, sw, sh, x, y, w, h);
  } else {
    drawFallbackMap(ctx, x, y, w, h, info.seed, { x: 0.5, y: 0.5 }, theme.dark);
  }
  ctx.globalAlpha = 1;
  applyTint(ctx, theme, x, y, w, h);
  ctx.restore();
}

// 地图比例尺：返回海报逻辑单位下 maxLen 以内最“整”的距离（1/2/5 × 10^n 米）
export function scaleBar(lat, zoom, maxLen) {
  if (!Number.isFinite(lat) || !Number.isFinite(zoom)) return null;
  const metersPerUnit = ((MAP_SIZE.width / POSTER_W) * 40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * Math.pow(2, zoom));
  const maxMeters = maxLen * metersPerUnit;
  const pow = Math.pow(10, Math.floor(Math.log10(maxMeters)));
  const nice = [5, 2, 1].map((n) => n * pow).find((m) => m <= maxMeters) || pow;
  return { length: nice / metersPerUnit, label: nice >= 1000 ? `${nice / 1000} KM` : `${nice} M` };
}

/* ------------------------------------------------------------------ */
/* 形状与图层                                                            */
/* ------------------------------------------------------------------ */

export function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export function drawShadowed(ctx, scale, blur, offsetY, color, draw) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur * scale;
  ctx.shadowOffsetY = offsetY * scale;
  draw();
  ctx.restore();
}

/**
 * 与主画布同尺寸、同坐标系的离屏图层，用于镂空、打孔、做旧等需要独立合成的效果。
 * 用完后 drawLayer(ctx, layer) 贴回主画布。
 */
export function makeLayer(ctx) {
  const t = ctx.getTransform();
  const canvas = new OffscreenCanvas(ctx.canvas.width, ctx.canvas.height);
  const lctx = canvas.getContext('2d');
  lctx.setTransform(t);
  return { canvas, ctx: lctx, scale: t.a };
}

export function drawLayer(ctx, layer, alpha) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (alpha !== undefined) ctx.globalAlpha = alpha;
  ctx.drawImage(layer.canvas, 0, 0);
  ctx.restore();
}

// 条形码（按种子生成，同一张照片稳定）
export function drawBarcode(ctx, x, y, w, h, seed, color) {
  const rand = mulberry32(seed);
  ctx.fillStyle = color;
  let cx = x;
  while (cx < x + w) {
    const bar = rand() < 0.3 ? 2.2 : rand() < 0.5 ? 1.4 : 0.7;
    if (cx + bar > x + w) break;
    ctx.fillRect(cx, y, bar, h);
    cx += bar + (rand() < 0.5 ? 0.9 : 1.8);
  }
}

// 纸张颗粒：在指定区域撒随机细点，增加印刷质感
export function drawGrain(ctx, x, y, w, h, seed, color, density) {
  const rand = mulberry32(seed);
  const n = Math.round(w * h * (density || 0.02));
  ctx.fillStyle = color;
  for (let i = 0; i < n; i += 1) {
    const r = rand() * 0.6 + 0.2;
    ctx.fillRect(x + rand() * w, y + rand() * h, r, r);
  }
}

// 小飞机图标（朝右），size 为机身长度
export function drawPlane(ctx, x, y, size, color) {
  const s = size / 24;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.quadraticCurveTo(12, -1.6, 10, -1.6);
  ctx.lineTo(3.5, -1.6);
  ctx.lineTo(-2.5, -9.5);
  ctx.lineTo(-5, -9.5);
  ctx.lineTo(-1.5, -1.6);
  ctx.lineTo(-7.5, -1.6);
  ctx.lineTo(-10, -4.6);
  ctx.lineTo(-12, -4.6);
  ctx.lineTo(-10.3, 0);
  ctx.lineTo(-12, 4.6);
  ctx.lineTo(-10, 4.6);
  ctx.lineTo(-7.5, 1.6);
  ctx.lineTo(-1.5, 1.6);
  ctx.lineTo(-5, 9.5);
  ctx.lineTo(-2.5, 9.5);
  ctx.lineTo(3.5, 1.6);
  ctx.lineTo(10, 1.6);
  ctx.quadraticCurveTo(12, 1.6, 12, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* 配色                                                                 */
/* ------------------------------------------------------------------ */

// 主题色是否接近中性灰（按色度判断，深色的低亮度颜色也不会被误判为有色）
export function isNeutral(hex) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (Math.max(...c) - Math.min(...c)) / 255 < 0.035;
}

export const hueOf = (hex) => hexToHsv(hex).h;

// 印在浅色纸上的强调色：深色主题直接用主题色，浅色主题取同色相的深色
export function accentOf(theme) {
  return theme.dark ? theme.tint : mixHex(theme.tint, '#000000', 0.62);
}

// 纸张底色：浅色主题用淡化的主题色，深色主题用暖白
export function paperOf(theme) {
  return theme.dark ? '#F4F1EA' : mixHex(theme.tint, '#FFFFFF', 0.55);
}

// 高饱和的发光色（霓虹 / 蓝图）：中性色主题回退到 fallback
export function vividOf(theme, fallback, s = 0.72, v = 1) {
  if (isNeutral(theme.tint)) return fallback;
  return hsvToHex(hexToHsv(theme.tint).h, s, v);
}

export { hexToRgba, mixHex, luminance };

/* ------------------------------------------------------------------ */
/* 日期 / 坐标拆分                                                       */
/* ------------------------------------------------------------------ */

export function splitCoord(info) {
  const parts = (info.coordText || '').split('  ');
  return { lat: parts[0] || '', lon: parts[1] || '' };
}

export const MONTHS_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export const MONTHS_LONG = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const MONTH_INDEX = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };

/**
 * 拍摄日期的年 / 月 / 日。优先使用 info.date（{ y, m, d }），
 * 否则尝试从 "JUN 16, 2024" 形式的 dateText 解析；都没有时返回 null。
 */
export function dateParts(info) {
  if (info && info.date && info.date.y) return info.date;
  const m = /^([A-Z]{3}) (\d{1,2}), (\d{4})$/.exec((info && info.dateText) || '');
  if (!m || !MONTH_INDEX[m[1]]) return null;
  return { y: Number(m[3]), m: MONTH_INDEX[m[1]], d: Number(m[2]) };
}

export const pad2 = (n) => String(n).padStart(2, '0');

export const WEEKDAYS_LONG = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

// 月历信息：当月第一天是星期几、天数、当天星期几、一年中的第几天
export function calendarOf(p) {
  const day = Date.UTC(p.y, p.m - 1, p.d);
  const leap = (p.y % 4 === 0 && p.y % 100 !== 0) || p.y % 400 === 0;
  return {
    first: new Date(Date.UTC(p.y, p.m - 1, 1)).getUTCDay(),
    days: new Date(Date.UTC(p.y, p.m, 0)).getUTCDate(),
    weekday: new Date(day).getUTCDay(),
    doy: Math.floor((day - Date.UTC(p.y, 0, 1)) / 86400000) + 1,
    yearDays: leap ? 366 : 365
  };
}

// 两位小数的简短经纬度，如 "35.01° N"
export function shortCoord(info) {
  if (info && Number.isFinite(info.lat) && Number.isFinite(info.lon)) {
    return {
      lat: `${Math.abs(info.lat).toFixed(2)}° ${info.lat >= 0 ? 'N' : 'S'}`,
      lon: `${Math.abs(info.lon).toFixed(2)}° ${info.lon >= 0 ? 'E' : 'W'}`
    };
  }
  const c = splitCoord(info || {});
  return { lat: c.lat || '--', lon: c.lon || '--' };
}

// 拉丁字母单词首字母大写（KYOTO -> Kyoto），汉字保持不变
export const titleCase = (text) =>
  String(text || '').toLowerCase().replace(/(^|[\s\-'.(])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());

/**
 * 按宽度折行：拉丁文字按空格断词，汉字逐字断开。返回行数组。
 */
export function wrapText(ctx, text, maxWidth, spacing) {
  const tokens = String(text || '').match(/[\u3000-\u9fff\uff00-\uffef]|[^\s\u3000-\u9fff\uff00-\uffef]+|\s+/g) || [];
  const lines = [];
  let line = '';
  tokens.forEach((tok) => {
    if (/^\s+$/.test(tok)) {
      if (line) line += ' ';
      return;
    }
    const next = line + tok;
    if (line && measureSpaced(ctx, next.trimEnd(), spacing) > maxWidth) {
      lines.push(line.trimEnd());
      line = tok;
    } else {
      line = next;
    }
  });
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}

// 带描边光晕的文字（地图上的标注），先描边再填充
export function drawHaloText(ctx, text, x, y, spacing, align, halo, width) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = halo;
  ctx.lineWidth = width;
  drawSpacedText(ctx, text, x, y, spacing, align, 'stroke');
  ctx.restore();
  drawSpacedText(ctx, text, x, y, spacing, align);
}

export function circlePath(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

export function strokeLine(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

// 相机背刻风格日期： '24 06 16
export function filmDate(dateText, parts) {
  const p = parts || dateParts({ dateText });
  if (!p) return dateText || '';
  return `'${String(p.y).slice(2)}  ${pad2(p.m)}  ${pad2(p.d)}`;
}
