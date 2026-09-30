import test from 'node:test';
import assert from 'node:assert';
import { parseDateValue, formatDateParts, formatCoordText, formatCamera, clockOf, DATE_FORMATS, COORD_FORMATS } from '../public/js/lib/formats.js';
import { formatCoordinates, formatDate } from '../public/js/lib/exif.js';
import { buildInfo, buildStyle, NO_COORD_TEXT } from '../public/js/params.js';
import { DEFAULT_SETTINGS } from '../public/js/store.js';

test('formats: parseDateValue validates calendar dates', () => {
  assert.deepStrictEqual(parseDateValue('2024-06-16'), { y: 2024, m: 6, d: 16 });
  assert.deepStrictEqual(parseDateValue(' 2024-2-5 '), { y: 2024, m: 2, d: 5 });
  assert.deepStrictEqual(parseDateValue('2024-02-29'), { y: 2024, m: 2, d: 29 });
  assert.strictEqual(parseDateValue('2023-02-29'), null);
  assert.strictEqual(parseDateValue('2024-13-01'), null);
  assert.strictEqual(parseDateValue('2024-06-31'), null);
  assert.strictEqual(parseDateValue(''), null);
  assert.strictEqual(parseDateValue(null), null);
  assert.strictEqual(parseDateValue('JUN 16, 2024'), null);
});

test('formats: every date format renders, default matches the EXIF formatter', () => {
  const p = { y: 2024, m: 6, d: 16 };
  assert.strictEqual(formatDateParts(p, 'en'), 'JUN 16, 2024');
  assert.strictEqual(formatDateParts(p, 'en'), formatDate('2024:06:16 10:22:33'));
  assert.strictEqual(formatDateParts({ y: 2024, m: 1, d: 5 }, 'en'), 'JAN 05, 2024');
  assert.strictEqual(formatDateParts(p, 'long'), '16 JUNE 2024');
  assert.strictEqual(formatDateParts(p, 'dot'), '2024.06.16');
  assert.strictEqual(formatDateParts(p, 'iso'), '2024-06-16');
  assert.strictEqual(formatDateParts(p, 'cn'), '2024年6月16日');
  assert.strictEqual(formatDateParts(p, 'nope'), 'JUN 16, 2024');
  assert.strictEqual(formatDateParts(null, 'en'), '');
  for (const f of DATE_FORMATS) assert.strictEqual(formatDateParts(p, f.id), f.name, `sample label of ${f.id}`);
});

test('formats: decimal coordinates match the legacy formatter; DMS rounds and carries', () => {
  assert.strictEqual(formatCoordText(30.259, 120.1388, 'dec'), formatCoordinates(30.259, 120.1388).text);
  assert.strictEqual(formatCoordText(30.259, 120.1388), '30.2590° N  120.1388° E');
  assert.strictEqual(formatCoordText(-33.8688, -151.2093, 'dec'), '33.8688° S  151.2093° W');
  assert.strictEqual(formatCoordText(30.259, 120.1388, 'dms'), '30°15′32″ N  120°08′20″ E');
  assert.strictEqual(formatCoordText(-33.8688, 151.2093, 'dms'), '33°52′08″ S  151°12′33″ E');
  assert.strictEqual(formatCoordText(10.99999, 0.5, 'dms'), '11°00′00″ N  0°30′00″ E');
  assert.strictEqual(formatCoordText(NaN, 1, 'dec'), '');
  for (const f of ['dec', 'dms']) assert.strictEqual(formatCoordText(35.0116, 135.7681, f).split('  ').length, 2);
  assert.strictEqual(COORD_FORMATS.find((f) => f.id === 'dms').name, formatCoordText(30.259, 120.1388, 'dms').split('  ')[0]);
});

test('formats: camera names drop maker suffixes and duplicated brands', () => {
  assert.strictEqual(formatCamera('Apple', 'iPhone 15 Pro'), 'iPhone 15 Pro');
  assert.strictEqual(formatCamera('SONY', 'ILCE-7M4'), 'SONY ILCE-7M4');
  assert.strictEqual(formatCamera('NIKON CORPORATION', 'NIKON D850'), 'NIKON D850');
  assert.strictEqual(formatCamera('Canon', 'Canon EOS R5'), 'Canon EOS R5');
  assert.strictEqual(formatCamera('OLYMPUS IMAGING CORP.', 'E-M1'), 'OLYMPUS E-M1');
  assert.strictEqual(formatCamera('RICOH IMAGING COMPANY, LTD.', 'RICOH GR III'), 'RICOH GR III');
  assert.strictEqual(formatCamera('LEICA CAMERA AG', 'LEICA Q2'), 'LEICA Q2');
  assert.strictEqual(formatCamera('FUJIFILM', 'X-T5'), 'FUJIFILM X-T5');
  assert.strictEqual(formatCamera('NIKON\0', null), 'NIKON');
  assert.strictEqual(formatCamera(null, '  Pixel   8 '), 'Pixel 8');
  assert.strictEqual(formatCamera('', ''), '');
});

test('formats: clockOf reads HH:MM from EXIF and ISO timestamps', () => {
  assert.strictEqual(clockOf('2024:06:16 10:22:33'), '10:22');
  assert.strictEqual(clockOf('2024-06-16T08:05:00'), '08:05');
  assert.strictEqual(clockOf('2024:06:16'), '');
  assert.strictEqual(clockOf(null), '');
});

function sampleItem(extra) {
  return { templateId: 'polaroid', crops: {}, place: 'KYOTO', lat: 35.0116, lon: 135.7681, dateValue: '2024-06-16', dateText: 'JUN 16, 2024', clock: '10:22', camera: 'iPhone 15 Pro', ...extra };
}

test('params: buildInfo applies the date / coordinate formats', () => {
  const settings = { ...DEFAULT_SETTINGS };
  const info = buildInfo(sampleItem(), settings);
  assert.strictEqual(info.dateText, 'JUN 16, 2024');
  assert.strictEqual(info.coordText, '35.0116° N  135.7681° E');
  assert.deepStrictEqual(info.date, { y: 2024, m: 6, d: 16 });
  assert.strictEqual(info.time, '10:22');
  assert.strictEqual(info.camera, 'iPhone 15 Pro');
  assert.strictEqual(info.zoom, settings.zoom);

  const cn = buildInfo(sampleItem(), { ...settings, dateFormat: 'cn', coordFormat: 'dms' });
  assert.strictEqual(cn.dateText, '2024年6月16日');
  assert.strictEqual(cn.coordText, '35°00′42″ N  135°46′05″ E');
  assert.strictEqual(cn.coordFormat, 'dms');

  const none = buildInfo(sampleItem({ lat: null, lon: null, place: '', dateValue: '', dateText: '' }), settings);
  assert.strictEqual(none.coordText, NO_COORD_TEXT);
  assert.strictEqual(none.place, 'UNKNOWN');
  assert.strictEqual(none.date, null);
  assert.strictEqual(none.dateText, '');
  assert.strictEqual(none.lat, null);
});

test('params: buildStyle slogan is hidden, custom or template default', () => {
  const item = sampleItem();
  assert.strictEqual(buildStyle({ ...DEFAULT_SETTINGS, sloganOn: false, slogan: 'HELLO' }, item).slogan, '');
  assert.strictEqual(buildStyle({ ...DEFAULT_SETTINGS, slogan: '  HELLO  ' }, item).slogan, 'HELLO');
  assert.strictEqual(buildStyle({ ...DEFAULT_SETTINGS, slogan: '   ' }, item).slogan, undefined);
  const crop = { zoom: 2, x: 0.5, y: 0 };
  assert.deepStrictEqual(buildStyle(DEFAULT_SETTINGS, sampleItem({ crops: { film: crop } }), 'film').crop, crop);
});
