/**
 * params.js：把「全局设置 + 单张照片」翻译成绘制所需的参数（预览与批量导出共用）。
 */
import { resolveTheme } from './lib/themes.js';
import { DEFAULT_CROP, TEMPLATES } from './lib/posters.js';

export const tplOf = (id) => TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];

export function buildStyle(settings, item) {
  return {
    theme: resolveTheme(settings.mapColorId, settings.customHex),
    mapAlpha: settings.mapOpacity / 100,
    photoAlpha: settings.photoOpacity / 100,
    textAlpha: settings.textOpacity / 100,
    crop: item.crops[item.templateId] || DEFAULT_CROP,
    footer: settings.footerOn,
    brand: { name: settings.brandName, tagline: settings.brandTagline }
  };
}

export function buildInfo(item) {
  const seed = item.lat === null ? 7 : Math.floor((item.lat + 90) * 1000) * 397 + Math.floor((item.lon + 180) * 1000);
  return {
    place: item.place || 'UNKNOWN',
    coordText: item.coordText || '-- ° --  -- ° --',
    dateText: item.dateText || '',
    seed
  };
}

export function buildMapSpec(settings, item, style, tiles) {
  if (item.lat === null || item.lon === null) return null;
  const tpl = tplOf(item.templateId);
  return {
    lat: item.lat,
    lon: item.lon,
    zoom: settings.zoom,
    width: tpl.map.width,
    height: tpl.map.height,
    pin: tpl.map.pin,
    dark: style.theme.dark,
    tiles
  };
}

export const mapKey = (m) => `${m.tiles ? m.tiles.id : ''}|${m.lat.toFixed(6)},${m.lon.toFixed(6)},${m.zoom},${m.width}x${m.height},${m.pin.x},${m.pin.y},${m.dark ? 'd' : 'l'}`;
