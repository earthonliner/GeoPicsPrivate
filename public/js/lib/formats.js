/**
 * formats.js：海报上的日期 / 坐标 / 相机型号文案（主线程、Worker、Node 通用）。
 */

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTHS_LONG = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const pad2 = (n) => String(n).padStart(2, '0');

export const DATE_FORMATS = [
  { id: 'en', name: 'JUN 16, 2024' },
  { id: 'long', name: '16 JUNE 2024' },
  { id: 'dot', name: '2024.06.16' },
  { id: 'iso', name: '2024-06-16' },
  { id: 'cn', name: '2024年6月16日' }
];

export const COORD_FORMATS = [
  { id: 'dec', name: '30.2590° N' },
  { id: 'dms', name: '30°15′32″ N' }
];

// "2024-06-16" -> { y, m, d }；无效日期返回 null
export function parseDateValue(value) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(value || '').trim());
  if (!m) return null;
  const p = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  const probe = new Date(Date.UTC(p.y, p.m - 1, p.d));
  if (probe.getUTCFullYear() !== p.y || probe.getUTCMonth() !== p.m - 1 || probe.getUTCDate() !== p.d) return null;
  return p;
}

export function formatDateParts(p, format) {
  if (!p) return '';
  switch (format) {
    case 'long':
      return `${p.d} ${MONTHS_LONG[p.m - 1]} ${p.y}`;
    case 'dot':
      return `${p.y}.${pad2(p.m)}.${pad2(p.d)}`;
    case 'iso':
      return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
    case 'cn':
      return `${p.y}年${p.m}月${p.d}日`;
    default:
      return `${MONTHS[p.m - 1]} ${pad2(p.d)}, ${p.y}`;
  }
}

function dms(value, pos, neg) {
  const a = Math.abs(value);
  let d = Math.floor(a);
  let m = Math.floor((a - d) * 60);
  let s = Math.round(((a - d) * 60 - m) * 60);
  if (s === 60) {
    s = 0;
    m += 1;
  }
  if (m === 60) {
    m = 0;
    d += 1;
  }
  return `${d}°${pad2(m)}′${pad2(s)}″ ${value >= 0 ? pos : neg}`;
}

// 纬度与经度之间固定用两个空格分隔（模板按此拆分成两段）
export function formatCoordText(lat, lon, format) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '';
  if (format === 'dms') return `${dms(lat, 'N', 'S')}  ${dms(lon, 'E', 'W')}`;
  return `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'E' : 'W'}`;
}

const MAKER_SUFFIX = /[\s,]+(camera\s+ag|(imaging\s+|optical\s+)?(corporation|corp\.?|company|co\.?)(,?\s*ltd\.?)?|inc\.?|ltd\.?|gmbh|ag)$/i;

// EXIF Make / Model -> "iPhone 15 Pro" / "SONY ILCE-7M4" / "NIKON D850"
export function formatCamera(make, model) {
  const clean = (s) => String(s || '').replace(/\0/g, '').replace(/\s+/g, ' ').trim();
  const mk = clean(make).replace(MAKER_SUFFIX, '').trim();
  const md = clean(model);
  if (!md) return mk;
  if (!mk || /^apple$/i.test(mk) || md.toLowerCase().startsWith(mk.toLowerCase())) return md;
  return `${mk} ${md}`;
}

// EXIF 时间 "2024:06:16 10:22:33" -> "10:22"
export function clockOf(raw) {
  const m = /\d{4}[:\-/]\d{2}[:\-/]\d{2}[ T](\d{2}):(\d{2})/.exec(String(raw || ''));
  return m ? `${m[1]}:${m[2]}` : '';
}
