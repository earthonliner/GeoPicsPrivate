/** 构造带 GPS / DateTimeOriginal / Orientation（可选相机型号与曝光参数）的最小 JPEG（大端 TIFF），供单元测试使用。 */

const u16 = (v) => [(v >> 8) & 0xff, v & 0xff];
const u32 = (v) => [(v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
const rational = (n, d) => [...u32(n), ...u32(d)];
const ascii = (s) => [...Buffer.from(`${s}\0`, 'ascii')];

function dms(v) {
  const d = Math.floor(v);
  const m = Math.floor((v - d) * 60);
  const s = Math.round(((v - d) * 60 - m) * 60 * 10000);
  return [...rational(d, 1), ...rational(m, 1), ...rational(s, 10000)];
}

/**
 * IFD 依次排在 TIFF 头之后，超过 4 字节的值统一放到末尾的数据区。
 * entry: { tag, type, count, bytes } 或 { tag, ifd: 下标 }（指向另一个 IFD 的指针）
 */
function buildTiff(ifds) {
  const offsets = [];
  let off = 8;
  ifds.forEach((entries) => {
    offsets.push(off);
    off += 2 + entries.length * 12 + 4;
  });
  const out = [0x4d, 0x4d, 0, 42, ...u32(8)];
  const data = [];
  ifds.forEach((entries) => {
    out.push(...u16(entries.length));
    entries.forEach((e) => {
      const type = e.ifd === undefined ? e.type : 4;
      const count = e.ifd === undefined ? e.count : 1;
      let value = e.ifd === undefined ? e.bytes : u32(offsets[e.ifd]);
      if (value.length > 4) {
        const at = off + data.length;
        data.push(...value);
        value = u32(at);
      } else {
        value = [...value, 0, 0, 0, 0].slice(0, 4);
      }
      out.push(...u16(e.tag), ...u16(type), ...u32(count), ...value);
    });
    out.push(...u32(0));
  });
  return [...out, ...data];
}

/**
 * @param exposure 可选 { time: [分子, 分母], fNumber: [n, d], iso, focal: [n, d], focal35 }
 */
export function buildJpeg({ lat, lon, latRef = 'N', lonRef = 'E', date = '2024:06:16 10:22:33', make, model, exposure }) {
  const ifd0 = [];
  if (make) ifd0.push({ tag: 0x010f, type: 2, count: ascii(make).length, bytes: ascii(make) });
  if (model) ifd0.push({ tag: 0x0110, type: 2, count: ascii(model).length, bytes: ascii(model) });
  ifd0.push({ tag: 0x0112, type: 3, count: 1, bytes: u16(6) }, { tag: 0x8769, ifd: 1 }, { tag: 0x8825, ifd: 2 });

  const exif = [];
  const e = exposure || {};
  if (e.time) exif.push({ tag: 0x829a, type: 5, count: 1, bytes: rational(...e.time) });
  if (e.fNumber) exif.push({ tag: 0x829d, type: 5, count: 1, bytes: rational(...e.fNumber) });
  if (e.iso) exif.push({ tag: 0x8827, type: 3, count: 1, bytes: u16(e.iso) });
  exif.push({ tag: 0x9003, type: 2, count: ascii(date).length, bytes: ascii(date) });
  if (e.focal) exif.push({ tag: 0x920a, type: 5, count: 1, bytes: rational(...e.focal) });
  if (e.focal35) exif.push({ tag: 0xa405, type: 3, count: 1, bytes: u16(e.focal35) });

  const gps = [
    { tag: 0x0001, type: 2, count: 2, bytes: [latRef.charCodeAt(0), 0] },
    { tag: 0x0002, type: 5, count: 3, bytes: dms(lat) },
    { tag: 0x0003, type: 2, count: 2, bytes: [lonRef.charCodeAt(0), 0] },
    { tag: 0x0004, type: 5, count: 3, bytes: dms(lon) }
  ];

  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...buildTiff([ifd0, exif, gps])];
  const parts = [0xff, 0xd8];
  // 先放一个 APP0，验证 marker 遍历
  parts.push(0xff, 0xe0, 0, 4, 0, 0);
  parts.push(0xff, 0xe1, ...u16(app1.length + 2), ...app1);
  parts.push(0xff, 0xda, 0, 2, 0xff, 0xd9);
  return Uint8Array.from(parts).buffer;
}
