/**
 * store.js：全局设置（持久化到 localStorage）与照片条目的数据模型。
 */
import { DEFAULT_THEME_ID, DEFAULT_CUSTOM_HEX } from './lib/themes.js';

const SETTINGS_KEY = 'geophotograph.settings.v1';

export const DEFAULT_SETTINGS = {
  batchMode: 'unique',
  catId: 'hot',
  templateId: 'polaroid',
  placeLang: 'en',
  placeLevel: 'city',
  zoom: 12,
  mapColorId: DEFAULT_THEME_ID,
  customHex: DEFAULT_CUSTOM_HEX,
  mapOpacity: 100,
  photoOpacity: 100,
  textOpacity: 100,
  footerOn: true,
  brandName: 'GEOPICS',
  brandTagline: 'MAP YOUR MOMENT',
  logoDataUrl: '',
  exportScale: 3,
  exportFormat: 'jpeg',
  exportQuality: 92,
  exportMode: 'folder',
  namePattern: '{name}_geo',
  maxSide: 2560,
  workers: 0,
  scope: 'selected',
  dateFormat: 'en',
  coordFormat: 'dec',
  sloganOn: true,
  slogan: '',
  thumbSize: 104,
  sortMode: 'import',
  inspectorTab: 'photo',
  appearance: 'system',
  rememberEdits: true
};

export function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    // 存储已满或被禁用时忽略（设置只是便利功能）
  }
}

let seq = 0;

export function createItem(file, templateId) {
  seq += 1;
  return {
    id: seq,
    file,
    name: file.name,
    templateId,
    selected: true,
    lat: null,
    lon: null,
    hasGps: false,
    place: '',
    fallbackName: '',
    placeManual: false,
    placeStatus: 'idle',
    coordText: '',
    dateText: '',
    dateValue: '',
    dateManual: false,
    autoDate: null,
    time: file.lastModified || 0,
    clock: '',
    camera: '',
    needsConvert: false,
    crops: {},
    thumbUrl: '',
    thumbState: 'idle',
    aspect: 0,
    locId: 0,
    exportState: ''
  };
}

export const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif|tiff?|avif|gif|bmp)$/i;
export const isImageFile = (f) => (f.type && f.type.startsWith('image/')) || IMAGE_EXT.test(f.name);
