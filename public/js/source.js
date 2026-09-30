/**
 * source.js：取得可解码的照片数据。
 *
 * 浏览器解不了的格式（如 Chrome 下的 HEIC）交给本地服务（macOS sips）按调用方需要的尺寸转成 JPEG。
 * 转换结果不挂在照片条目上：上千张照片不会同时占用内存，缩略图用的小图也不会被误用于导出。
 */
import * as api from './api.js';

const cache = new Map();
const CACHE_MAX = 6;

/**
 * @param item 照片条目
 * @param {number} side 需要的长边像素（转换时使用）
 * @param {(blob: Blob) => Promise<any>} run 用拿到的数据执行解码 / 渲染
 * @param {{cache?: boolean}} opts cache=true 时缓存少量转换结果（预览来回切换时免去重复转换）
 */
export async function withSource(item, side, run, opts = {}) {
  if (!item.needsConvert) {
    try {
      return await run(item.file);
    } catch (err) {
      if (err.code !== 'DECODE') throw err;
      item.needsConvert = true;
    }
  }
  const key = `${item.id}@${side}`;
  let blob = opts.cache ? cache.get(key) : null;
  if (!blob) {
    blob = await api.convertToJpeg(item.file, side);
    if (opts.cache) {
      cache.set(key, blob);
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    }
  }
  return run(blob);
}

export function forgetSource(item) {
  for (const key of cache.keys()) if (key.startsWith(`${item.id}@`)) cache.delete(key);
}
