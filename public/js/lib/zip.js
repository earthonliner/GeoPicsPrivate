/**
 * zip.js
 *
 * 最小的 ZIP 写入器（仅存储、不压缩）：JPEG / PNG 本身已压缩，再压缩没有收益。
 * 用于「打包下载」：批量导出时按体积分卷，避免单个 Blob 过大。
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

export class ZipWriter {
  constructor() {
    this.parts = [];
    this.central = [];
    this.offset = 0;
    this.count = 0;
  }

  get size() {
    return this.offset;
  }

  /**
   * @param {string} name 文件名（UTF-8）
   * @param {Uint8Array} bytes
   */
  add(name, bytes, date = new Date()) {
    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(bytes);
    const { time, day } = dosDateTime(date);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 文件名
    local.setUint16(8, 0, true);
    local.setUint16(10, time, true);
    local.setUint16(12, day, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, bytes.length, true);
    local.setUint32(22, bytes.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);

    const head = new Uint8Array(local.buffer);
    this.parts.push(head, nameBytes, bytes);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, time, true);
    cd.setUint16(14, day, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, bytes.length, true);
    cd.setUint32(24, bytes.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, this.offset, true);
    this.central.push(new Uint8Array(cd.buffer), nameBytes);

    this.offset += head.length + nameBytes.length + bytes.length;
    this.count += 1;
  }

  toBlob() {
    let centralSize = 0;
    this.central.forEach((p) => {
      centralSize += p.length;
    });
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, this.count, true);
    end.setUint16(10, this.count, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, this.offset, true);
    return new Blob([...this.parts, ...this.central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  }
}
