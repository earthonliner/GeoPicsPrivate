import test from 'node:test';
import assert from 'node:assert';
import { parseExif, formatCoordinates, formatDate, toDateValue, extractFromBlob } from '../public/js/lib/exif.js';
import { formatExposure } from '../public/js/lib/formats.js';
import { buildJpeg } from './helpers/exif-fixture.js';

const IPHONE = {
  make: 'Apple',
  model: 'iPhone 15 Pro',
  exposure: { time: [1, 250], fNumber: [178, 100], iso: 64, focal: [676, 100], focal35: 24 }
};

test('parseExif reads GPS, date and orientation', () => {
  const r = parseExif(buildJpeg({ lat: 46.0192, lon: 7.7459 }));
  assert.ok(Math.abs(r.latitude - 46.0192) < 1e-4);
  assert.ok(Math.abs(r.longitude - 7.7459) < 1e-4);
  assert.strictEqual(r.dateTimeOriginal, '2024:06:16 10:22:33');
  assert.strictEqual(r.orientation, 6);
});

test('parseExif reads camera and exposure settings', () => {
  const r = parseExif(buildJpeg({ lat: 35.0116, lon: 135.7681, ...IPHONE }));
  assert.strictEqual(r.make, 'Apple');
  assert.strictEqual(r.model, 'iPhone 15 Pro');
  assert.strictEqual(r.exposureTime, 0.004);
  assert.strictEqual(r.fNumber, 1.78);
  assert.strictEqual(r.iso, 64);
  assert.strictEqual(r.focalLength, 6.76);
  assert.strictEqual(r.focalLength35, 24);
  assert.strictEqual(r.orientation, 6);
  assert.ok(Math.abs(r.latitude - 35.0116) < 1e-4);
  assert.strictEqual(formatExposure(r), '24mm f/1.8 1/250s ISO64');

  const bare = parseExif(buildJpeg({ lat: 1, lon: 1 }));
  assert.strictEqual(bare.exposureTime, null);
  assert.strictEqual(bare.iso, null);
  assert.strictEqual(formatExposure(bare), '');
  const zero = parseExif(buildJpeg({ lat: 1, lon: 1, exposure: { time: [0, 0], fNumber: [0, 1], iso: 0 } }));
  assert.strictEqual(formatExposure(zero), '');
});

test('parseExif applies S / W references', () => {
  const r = parseExif(buildJpeg({ lat: 33.8688, lon: 151.2093, latRef: 'S', lonRef: 'W' }));
  assert.ok(r.latitude < 0 && r.longitude < 0);
});

test('parseExif returns null for non-exif data', () => {
  assert.strictEqual(parseExif(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]).buffer), null);
  assert.strictEqual(parseExif(new ArrayBuffer(0)), null);
});

test('parseExif finds Exif inside a non-JPEG container (HEIC-like)', () => {
  const jpeg = new Uint8Array(buildJpeg({ lat: 35.6595, lon: 139.7005 }));
  // 取出 APP1 里的 "Exif\0\0" + TIFF，前面垫上任意的容器头
  const start = jpeg.findIndex((b, i) => b === 0x45 && jpeg[i + 1] === 0x78 && jpeg[i + 2] === 0x69 && jpeg[i + 3] === 0x66);
  const payload = jpeg.slice(start);
  const container = new Uint8Array(64 + payload.length);
  container.set([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], 0);
  container.set(payload, 64);
  const r = parseExif(container.buffer);
  assert.ok(r && Math.abs(r.latitude - 35.6595) < 1e-4);
});

test('parseExif ignores 0,0 placeholder coordinates', () => {
  const r = parseExif(buildJpeg({ lat: 0, lon: 0 }));
  assert.strictEqual(r.latitude, null);
  assert.strictEqual(r.longitude, null);
});

test('formatters', () => {
  assert.strictEqual(formatCoordinates(46.0192, 7.7459).text, '46.0192° N  7.7459° E');
  assert.strictEqual(formatCoordinates(-33.5, -70.25, 2).text, '33.50° S  70.25° W');
  assert.strictEqual(formatDate('2024:06:16 10:22:33'), 'JUN 16, 2024');
  assert.strictEqual(formatDate('garbage'), '');
});

test('toDateValue for the date picker', () => {
  assert.strictEqual(toDateValue('2024:06:16 10:22:33'), '2024-06-16');
  assert.strictEqual(toDateValue(new Date(2024, 0, 5)), '2024-01-05');
  assert.strictEqual(toDateValue('2024:13:40 00:00:00'), '');
  assert.strictEqual(toDateValue(''), '');
  assert.strictEqual(formatDate('2024-01-05'), 'JAN 05, 2024');
});

test('extractFromBlob reads a Blob and never rejects', async () => {
  const ok = await extractFromBlob(new Blob([buildJpeg({ lat: 46.0192, lon: 7.7459 })]));
  assert.strictEqual(ok.hasGps, true);
  assert.strictEqual(ok.coordText, '46.0192° N  7.7459° E');
  assert.strictEqual(ok.dateText, 'JUN 16, 2024');
  assert.strictEqual(ok.dateValue, '2024-06-16');
  assert.strictEqual(ok.exposure, '');
  const phone = await extractFromBlob(new Blob([buildJpeg({ lat: 46.0192, lon: 7.7459, ...IPHONE })]));
  assert.strictEqual(phone.camera, 'iPhone 15 Pro');
  assert.strictEqual(phone.exposure, '24mm f/1.8 1/250s ISO64');
  assert.strictEqual(phone.clock, '10:22');
  const none = await extractFromBlob(new Blob([new Uint8Array([1, 2, 3])]));
  assert.strictEqual(none.hasGps, false);
  assert.strictEqual(none.dateText, '');
  assert.strictEqual(none.exposure, '');
});
