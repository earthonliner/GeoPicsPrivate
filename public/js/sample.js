/**
 * sample.js：还没有导入照片时，用一张程序绘制的示例照片（京都黄昏）预览全部模板。
 */
import { createItem } from './store.js';
import { formatCoordinates } from './lib/exif.js';
import { mulberry32 } from './lib/poster-kit.js';

const W = 1600;
const H = 1200;
const HORIZON = H * 0.64;

function ridge(ctx, base, amp, seed, color) {
  const rand = mulberry32(seed);
  const waves = [0, 1, 2].map((i) => ({ f: (1.2 + rand() * 2) * (i + 1), p: rand() * Math.PI * 2, a: amp / (i + 1.4) }));
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 8) {
    const t = x / W;
    const y = base - waves.reduce((sum, w) => sum + Math.sin(t * w.f * Math.PI + w.p) * w.a, 0) - amp * 0.6;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}

// 五重塔剪影：底部中心 (x, y)，高 h
function pagoda(ctx, x, y, h, color) {
  const tier = h / 6.2;
  ctx.fillStyle = color;
  for (let i = 0; i < 5; i += 1) {
    const top = y - tier * (i + 1);
    const w = tier * (2.6 - i * 0.28);
    const body = w * 0.52;
    ctx.fillRect(x - body / 2, top + tier * 0.28, body, tier * 0.72);
    ctx.beginPath();
    ctx.moveTo(x - w / 2 - tier * 0.25, top + tier * 0.34);
    ctx.quadraticCurveTo(x - w / 2, top + tier * 0.12, x - w * 0.28, top);
    ctx.lineTo(x + w * 0.28, top);
    ctx.quadraticCurveTo(x + w / 2, top + tier * 0.12, x + w / 2 + tier * 0.25, top + tier * 0.34);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillRect(x - tier * 0.05, y - tier * 5 - tier * 1.2, tier * 0.1, tier * 1.2);
}

function paintScene(ctx) {
  const sky = ctx.createLinearGradient(0, 0, 0, HORIZON);
  sky.addColorStop(0, '#2B3F6E');
  sky.addColorStop(0.38, '#6F7FB8');
  sky.addColorStop(0.72, '#E9A48A');
  sky.addColorStop(1, '#F8D3A4');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, HORIZON + 4);

  const sunX = W * 0.66;
  const sunY = HORIZON - 120;
  const glow = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 420);
  glow.addColorStop(0, 'rgba(255, 236, 196, 0.95)');
  glow.addColorStop(0.18, 'rgba(255, 214, 160, 0.55)');
  glow.addColorStop(1, 'rgba(255, 200, 150, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, HORIZON);
  ctx.fillStyle = '#FFF1D6';
  ctx.beginPath();
  ctx.arc(sunX, sunY, 58, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(40, 34, 70, 0.55)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  [[410, 260, 1], [470, 300, 0.8], [360, 318, 0.7], [520, 250, 0.6]].forEach(([bx, by, s]) => {
    ctx.beginPath();
    ctx.moveTo(bx - 16 * s, by - 6 * s);
    ctx.quadraticCurveTo(bx - 6 * s, by - 10 * s, bx, by);
    ctx.quadraticCurveTo(bx + 6 * s, by - 10 * s, bx + 16 * s, by - 6 * s);
    ctx.stroke();
  });

  ridge(ctx, HORIZON - 90, 120, 11, '#9A8FBE');
  ridge(ctx, HORIZON - 30, 90, 29, '#6C6199');
  ridge(ctx, HORIZON + 10, 60, 47, '#3F3766');
  pagoda(ctx, W * 0.3, HORIZON - 18, 330, '#262143');

  const water = ctx.createLinearGradient(0, HORIZON, 0, H);
  water.addColorStop(0, '#E8A98D');
  water.addColorStop(0.35, '#8C7AA8');
  water.addColorStop(1, '#2E2A4F');
  ctx.fillStyle = water;
  ctx.fillRect(0, HORIZON, W, H - HORIZON);

  const rand = mulberry32(7);
  for (let i = 0; i < 140; i += 1) {
    const y = HORIZON + 8 + Math.pow(rand(), 1.6) * (H - HORIZON - 8);
    const near = (y - HORIZON) / (H - HORIZON);
    const x = sunX + (rand() - 0.5) * (80 + near * 520);
    const w = 20 + rand() * 90 * (0.4 + near);
    ctx.fillStyle = `rgba(255, 228, 190, ${0.5 * (1 - near) + 0.08})`;
    ctx.fillRect(x - w / 2, y, w, 2 + near * 3);
  }
}

let cached = null;

async function samplePhotoFile() {
  if (!cached) {
    cached = (async () => {
      const canvas = new OffscreenCanvas(W, H);
      paintScene(canvas.getContext('2d'));
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
      return new File([blob], 'sample-kyoto.jpg', { type: 'image/jpeg', lastModified: Date.UTC(2024, 10, 23, 16, 48) });
    })();
  }
  return cached;
}

export const SAMPLE_PLACE = { en: 'KYOTO', zh: '京都' };

export async function createSampleItem(settings) {
  const item = createItem(await samplePhotoFile(), settings.templateId);
  const lat = 34.9986;
  const lon = 135.7792;
  Object.assign(item, {
    isSample: true,
    selected: false,
    lat,
    lon,
    hasGps: true,
    coordText: formatCoordinates(lat, lon).text,
    place: SAMPLE_PLACE[settings.placeLang] || SAMPLE_PLACE.en,
    placeStatus: 'ok',
    dateValue: '2024-11-23',
    dateText: 'NOV 23, 2024',
    autoDate: { text: 'NOV 23, 2024', value: '2024-11-23', fromExif: true },
    clock: '16:48',
    camera: 'iPhone 15 Pro',
    aspect: W / H
  });
  return item;
}
