/**
 * params.js：把「全局设置 + 单张照片」翻译成绘制所需的参数（预览、模板缩略图与批量导出共用）。
 */
import { resolveTheme } from './lib/themes.js';
import { DEFAULT_CROP, TEMPLATES } from './lib/posters.js';
import { parseDateValue, formatDateParts, formatCoordText } from './lib/formats.js';

export const tplOf = (id) => TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];

export const NO_COORD_TEXT = '-- ° --  -- ° --';

export function buildStyle(settings, item, templateId) {
  const tplId = templateId || item.templateId;
  return {
    theme: resolveTheme(settings.mapColorId, settings.customHex),
    mapAlpha: settings.mapOpacity / 100,
    photoAlpha: settings.photoOpacity / 100,
    textAlpha: settings.textOpacity / 100,
    crop: item.crops[tplId] || DEFAULT_CROP,
    footer: settings.footerOn,
    brand: { name: settings.brandName, tagline: settings.brandTagline },
    // 字符串（含空串 = 隐藏）直接使用；undefined 时模板使用默认标语
    slogan: settings.sloganOn === false ? '' : (settings.slogan || '').trim() || undefined
  };
}

export function buildInfo(item, settings = {}) {
  const hasLoc = item.lat !== null && item.lon !== null;
  const seed = hasLoc ? Math.floor((item.lat + 90) * 1000) * 397 + Math.floor((item.lon + 180) * 1000) : 7;
  const date = parseDateValue(item.dateValue);
  return {
    place: item.place || 'UNKNOWN',
    coordText: hasLoc ? formatCoordText(item.lat, item.lon, settings.coordFormat) : NO_COORD_TEXT,
    dateText: date ? formatDateParts(date, settings.dateFormat) : item.dateText || '',
    date,
    time: item.clock || '',
    camera: item.camera || '',
    exposure: item.exposure || '',
    lat: hasLoc ? item.lat : null,
    lon: hasLoc ? item.lon : null,
    zoom: settings.zoom || 12,
    coordFormat: settings.coordFormat || 'dec',
    seed
  };
}

export function buildMapSpec(settings, item, style, tiles, templateId) {
  if (item.lat === null || item.lon === null) return null;
  const tpl = tplOf(templateId || item.templateId);
  return {
    lat: item.lat,
    lon: item.lon,
    zoom: settings.zoom,
    width: tpl.map.width,
    height: tpl.map.height,
    pin: tpl.map.pin,
    dark: !!(tpl.mapDark || style.theme.dark),
    tiles
  };
}

export const mapKey = (m) =>
  `${m.tiles ? m.tiles.id : ''}|${m.lat.toFixed(6)},${m.lon.toFixed(6)},${m.zoom},${m.width}x${m.height},${m.pin.x},${m.pin.y},${m.dark ? 'd' : 'l'}${m.pixelScale ? `@${m.pixelScale}` : ''}`;
