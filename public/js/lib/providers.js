/**
 * providers.js：底图来源的静态描述（主线程、Worker 与服务端共用）。
 *
 *   scale    瓦片像素倍率：1 = 256px 瓦片，2 = 512px（@2x）瓦片
 *   maxZoom  服务商提供的最大 XYZ 级别，超过时会放大低级别瓦片
 *   gray     返回的是彩色图，需要在本地转成灰阶后再按主题上色
 *   darkStyle 深色主题请求哪套瓦片：'dark' 为服务商的深色底图，'light' 表示复用浅色瓦片并在本地反相
 */
export const PROVIDERS = {
  esri: { label: 'Esri 灰度底图（免 key）', scale: 1, maxZoom: 16, gray: false, darkStyle: 'dark' },
  osm: { label: 'OpenStreetMap（灰度化，含标注）', scale: 1, maxZoom: 19, gray: true, darkStyle: 'light' },
  mapbox: { label: 'Mapbox（需 token）', scale: 2, maxZoom: 22, gray: false, darkStyle: 'dark' },
  custom: { label: '自定义瓦片 URL', scale: 1, maxZoom: 19, gray: false, darkStyle: 'dark' }
};

export const DEFAULT_PROVIDER = 'esri';

/**
 * @param {{mapProvider?: string, customTileScale?: number}} config
 */
export function tileInfo(config) {
  const id = config && PROVIDERS[config.mapProvider] ? config.mapProvider : DEFAULT_PROVIDER;
  const base = PROVIDERS[id];
  const scale = id === 'custom' && Number(config.customTileScale) === 2 ? 2 : base.scale;
  return { id, scale, maxZoom: base.maxZoom, gray: base.gray, darkStyle: base.darkStyle };
}
