/** 构造带 GPS / DateTimeOriginal / Orientation 的最小 JPEG（大端 TIFF），供单元测试使用。 */
// 构造一个带 GPS / DateTimeOriginal / Orientation 的最小 JPEG（大端 TIFF）
export function buildJpeg({ lat, lon, latRef = 'N', lonRef = 'E', date = '2024:06:16 10:22:33' }) {
  const parts = [];
  const tiff = [];
  const u16 = (v) => [(v >> 8) & 0xff, v & 0xff];
  const u32 = (v) => [(v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
  const entry = (tag, type, count, valueBytes) => [...u16(tag), ...u16(type), ...u32(count), ...valueBytes];
  const rational = (n, d) => [...u32(n), ...u32(d)];
  const dms = (v) => {
    const d = Math.floor(v);
    const m = Math.floor((v - d) * 60);
    const s = Math.round(((v - d) * 60 - m) * 60 * 10000);
    return [...rational(d, 1), ...rational(m, 1), ...rational(s, 10000)];
  };

  // 布局：header(8) | IFD0(2+3*12+4=42) | ExifIFD(2+12+4=18) | GPS IFD(2+4*12+4=54) | data
  const ifd0Off = 8;
  const exifOff = ifd0Off + 42;
  const gpsOff = exifOff + 18;
  const dataOff = gpsOff + 54;
  const dateBytes = [...Buffer.from(date + '\0', 'ascii')];
  const latData = dms(lat);
  const lonData = dms(lon);
  const dateOff = dataOff;
  const latOff = dateOff + dateBytes.length;
  const lonOff = latOff + latData.length;

  tiff.push(0x4d, 0x4d, 0, 42, ...u32(ifd0Off));
  tiff.push(
    ...u16(3),
    ...entry(0x0112, 3, 1, [...u16(6), 0, 0]),
    ...entry(0x8769, 4, 1, u32(exifOff)),
    ...entry(0x8825, 4, 1, u32(gpsOff)),
    ...u32(0)
  );
  tiff.push(...u16(1), ...entry(0x9003, 2, dateBytes.length, u32(dateOff)), ...u32(0));
  tiff.push(
    ...u16(4),
    ...entry(0x0001, 2, 2, [latRef.charCodeAt(0), 0, 0, 0]),
    ...entry(0x0002, 5, 3, u32(latOff)),
    ...entry(0x0003, 2, 2, [lonRef.charCodeAt(0), 0, 0, 0]),
    ...entry(0x0004, 5, 3, u32(lonOff)),
    ...u32(0)
  );
  tiff.push(...dateBytes, ...latData, ...lonData);

  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  parts.push(0xff, 0xd8);
  // 先放一个 APP0，验证 marker 遍历
  parts.push(0xff, 0xe0, 0, 4, 0, 0);
  parts.push(0xff, 0xe1, ...u16(app1.length + 2), ...app1);
  parts.push(0xff, 0xda, 0, 2, 0xff, 0xd9);
  return Uint8Array.from(parts).buffer;
}
