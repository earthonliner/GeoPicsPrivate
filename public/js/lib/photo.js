/**
 * photo.js
 *
 * 照片解码与缩略图。长边超过 maxSide 的原图会先等比缩小（手机原图 12MP~48MP，
 * 批量处理时直接常驻内存会非常占用资源）。EXIF 位置 / 日期仍从原文件读取。
 */

export const DEFAULT_MAX_SIDE = 2560;

function scaleDown(source, maxSide, smoothing) {
  const long = Math.max(source.width, source.height);
  if (!(long > maxSide)) return source;
  const k = maxSide / long;
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(source.width * k)), Math.max(1, Math.round(source.height * k)));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = smoothing || 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if (typeof source.close === 'function') source.close();
  return canvas;
}

/**
 * 解码为可 drawImage 的对象（ImageBitmap 或 OffscreenCanvas），已应用 EXIF 方向。
 * 解码失败（如浏览器不支持 HEIC）时抛出错误，由调用方走服务端转换。
 */
export async function decodePhoto(blob, maxSide = DEFAULT_MAX_SIDE) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch (e) {
    throw Object.assign(new Error('decode failed'), { code: 'DECODE' });
  }
  return scaleDown(bitmap, maxSide);
}

/**
 * 生成 JPEG 缩略图（长边 size 像素）。
 */
export async function makeThumbnail(blob, size = 320) {
  const photo = await decodePhoto(blob, size);
  const canvas = new OffscreenCanvas(photo.width, photo.height);
  canvas.getContext('2d').drawImage(photo, 0, 0);
  const dims = { width: photo.width, height: photo.height };
  if (typeof photo.close === 'function') photo.close();
  const out = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.78 });
  return { blob: out, ...dims };
}

/**
 * 只为得到原图尺寸（取景拖动需要）：解码后立即释放。
 */
export async function photoSize(blob) {
  const photo = await decodePhoto(blob, Infinity);
  const size = { w: photo.width, h: photo.height };
  if (typeof photo.close === 'function') photo.close();
  return size;
}
