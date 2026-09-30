import test from 'node:test';
import assert from 'node:assert';
import { normalizePlaceName, shortenCityName, formatPlace } from '../public/js/lib/place-name.js';
import { parseHex, resolveTheme, hexToRgba, hsvToHex, hexToHsv, DEFAULT_CUSTOM_HEX } from '../public/js/lib/themes.js';
import { pickRandomTemplates } from '../public/js/lib/batch.js';
import { baseName, sanitize, renderNamePattern, createNamer, formatDateForFile } from '../public/js/lib/filename.js';

test('place-name: short CJK names become pinyin, long names become initials', () => {
  assert.strictEqual(normalizePlaceName('北京', 'en'), 'BEIJING');
  assert.strictEqual(normalizePlaceName('杭州市', 'en'), 'HANGZHOU');
  assert.strictEqual(normalizePlaceName('成都', 'en'), 'CHENGDU');
  assert.strictEqual(normalizePlaceName('重庆', 'en'), 'CHONGQING');
  assert.strictEqual(normalizePlaceName('厦门', 'en'), 'XIAMEN');
  assert.strictEqual(normalizePlaceName('中关村软件园', 'en'), 'ZGCRJY');
  assert.strictEqual(normalizePlaceName('中国科学技术大学', 'en'), 'ZGKXJSDX');
});

test('place-name: latin names are uppercased, zh mode keeps CJK', () => {
  assert.strictEqual(normalizePlaceName('Zermatt', 'en'), 'ZERMATT');
  assert.strictEqual(normalizePlaceName('Hong Kong', 'en'), 'HONG KONG');
  assert.strictEqual(normalizePlaceName('杭州', 'zh'), '杭州');
  assert.strictEqual(normalizePlaceName('', 'en'), '');
});

test('place-name: long city names drop German/English qualifiers', () => {
  assert.strictEqual(shortenCityName('St. Wolfgang im Salzkammergut'), 'St. Wolfgang');
  assert.strictEqual(shortenCityName('Frankfurt am Main'), 'Frankfurt');
  assert.strictEqual(shortenCityName('Newcastle upon Tyne'), 'Newcastle');
  assert.strictEqual(shortenCityName('Rothenburg ob der Tauber'), 'Rothenburg');
  assert.strictEqual(shortenCityName('Weil am Rhein'), 'Weil am Rhein');
  assert.strictEqual(shortenCityName('San Francisco Bay Area'), 'San Francisco Bay Area');
  assert.strictEqual(shortenCityName('杭州市西湖区'), '杭州市西湖区');
});

test('place-name: formatPlace shows city only by default, region on demand', () => {
  const parts = { city: 'St. Wolfgang im Salzkammergut', locality: 'Ried', district: 'Gmunden', region: 'Upper Austria', country: 'Austria' };
  assert.strictEqual(formatPlace(parts, 'city', 'en'), 'ST. WOLFGANG');
  assert.strictEqual(formatPlace(parts, 'detail', 'en'), 'RIED, ST. WOLFGANG');
  assert.strictEqual(formatPlace({ locality: 'Hallstatt', region: 'Upper Austria' }, 'city', 'en'), 'HALLSTATT');
  assert.strictEqual(formatPlace({ district: 'Gmunden', country: 'Austria' }, 'city', 'en'), 'GMUNDEN');
  assert.strictEqual(formatPlace({ country: 'Austria' }, 'city', 'en'), 'AUSTRIA');
  assert.strictEqual(formatPlace({}, 'city', 'en'), '');
  assert.strictEqual(formatPlace({ city: 'Zermatt', locality: 'Zermatt' }, 'detail', 'en'), 'ZERMATT');
  assert.strictEqual(formatPlace({ city: '杭州市', district: '西湖区' }, 'detail', 'zh'), '杭州市西湖区');
  assert.strictEqual(formatPlace({ city: '杭州市', district: '西湖区' }, 'city', 'en'), 'HANGZHOU');
  assert.strictEqual(formatPlace({ city: '北京市', district: '朝阳区' }, 'detail', 'en'), 'CHAOYANG, BEIJING');
});

test('themes: parseHex accepts 3/6 digit hex with or without #', () => {
  assert.strictEqual(parseHex('#e8dfd0'), '#E8DFD0');
  assert.strictEqual(parseHex('abc'), '#AABBCC');
  assert.strictEqual(parseHex(' #123456 '), '#123456');
  assert.strictEqual(parseHex('#12345'), null);
  assert.strictEqual(parseHex('zzzzzz'), null);
  assert.strictEqual(parseHex(''), null);
});

test('themes: presets and custom colors resolve dark/light and ink', () => {
  const paper = resolveTheme('paper');
  assert.strictEqual(paper.dark, false);
  assert.strictEqual(paper.ink, '#141414');
  const midnight = resolveTheme('midnight');
  assert.strictEqual(midnight.dark, true);
  assert.strictEqual(midnight.ink, '#F3EFE6');
  assert.strictEqual(resolveTheme('custom', '#102030').dark, true);
  assert.strictEqual(resolveTheme('custom', '#F0E0D0').dark, false);
  assert.strictEqual(resolveTheme('custom', 'nope').tint, DEFAULT_CUSTOM_HEX);
  assert.strictEqual(hexToRgba('#FF8000', 0.5), 'rgba(255,128,0,0.5)');
});

test('themes: hsv <-> hex round trip', () => {
  assert.strictEqual(hsvToHex(0, 1, 1), '#FF0000');
  assert.strictEqual(hsvToHex(120, 1, 1), '#00FF00');
  assert.strictEqual(hsvToHex(240, 1, 1), '#0000FF');
  assert.strictEqual(hsvToHex(360, 1, 1), '#FF0000');
  for (const hex of ['#E8DFD0', '#0F1B2D', '#2B1218', '#6699CC', '#808080']) {
    const { h, s, v } = hexToHsv(hex);
    assert.strictEqual(hsvToHex(h, s, v), hex);
  }
});

test('batch: random templates cycle through every template before repeating', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const picked = pickRandomTemplates(ids, 4);
  assert.deepStrictEqual(picked.slice().sort(), ids);
  const nine = pickRandomTemplates(ids, 9);
  assert.strictEqual(nine.length, 9);
  assert.deepStrictEqual(nine.slice(0, 4).slice().sort(), ids);
  assert.deepStrictEqual(nine.slice(4, 8).slice().sort(), ids);
  for (let i = 1; i < nine.length; i += 1) assert.notStrictEqual(nine[i], nine[i - 1]);
});

test('batch: deterministic with a seeded random function and handles edge cases', () => {
  const seq = [0.1, 0.9, 0.5, 0.3];
  let n = 0;
  const rand = () => seq[n++ % seq.length];
  const a = pickRandomTemplates(['x', 'y', 'z'], 3, rand);
  n = 0;
  assert.deepStrictEqual(pickRandomTemplates(['x', 'y', 'z'], 3, rand), a);
  assert.deepStrictEqual(pickRandomTemplates(['only'], 3), ['only', 'only', 'only']);
  assert.deepStrictEqual(pickRandomTemplates(['a', 'b'], 0), []);
});

test('batch: thousands of photos still deal a full bag before repeating', () => {
  const ids = Array.from({ length: 15 }, (_, i) => `t${i}`);
  const out = pickRandomTemplates(ids, 3000);
  for (let start = 0; start + 15 <= out.length; start += 15) {
    assert.strictEqual(new Set(out.slice(start, start + 15)).size, 15);
  }
  for (let i = 1; i < out.length; i += 1) assert.notStrictEqual(out[i], out[i - 1]);
});

test('filename: base name, sanitizing and patterns', () => {
  assert.strictEqual(baseName('IMG_0001.HEIC'), 'IMG_0001');
  assert.strictEqual(baseName('a.b.c.jpg'), 'a.b.c');
  assert.strictEqual(baseName('.hidden'), '.hidden');
  assert.strictEqual(sanitize('a/b:c*?.jpg'), 'a_b_c__.jpg');
  assert.strictEqual(sanitize('...'), 'photo');
  assert.strictEqual(
    renderNamePattern('{index}-{place}-{date}', { index: '007', place: 'NEW YORK', date: '20240616' }),
    '007-NEW YORK-20240616'
  );
  assert.strictEqual(renderNamePattern('{unknown}', {}), '{unknown}');
  assert.strictEqual(renderNamePattern('', { name: 'IMG_1' }), 'IMG_1_geo');
  assert.strictEqual(formatDateForFile('2024-06-16'), '20240616');
  assert.strictEqual(formatDateForFile(''), 'nodate');
});

test('filename: namer never returns the same name twice (case-insensitive)', () => {
  const name = createNamer();
  assert.strictEqual(name('IMG_1', 'jpg'), 'IMG_1.jpg');
  assert.strictEqual(name('img_1', 'jpg'), 'img_1-2.jpg');
  assert.strictEqual(name('IMG_1', 'jpg'), 'IMG_1-3.jpg');
  assert.strictEqual(name('IMG_1', 'png'), 'IMG_1.png');
});
