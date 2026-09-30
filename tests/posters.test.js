import test from 'node:test';
import assert from 'node:assert';
import { installFakeCanvas } from './helpers/fake-canvas.js';
import { TEMPLATES, CATEGORIES, CROP_REGIONS, templatesOf, paintPoster, POSTER_W, POSTER_H, posterHeight } from '../public/js/lib/posters.js';
import { scaleBar, calendarOf, shortCoord, dateParts, sloganOf, TAGLINE, inkOn, capLuminance, luminance } from '../public/js/lib/poster-kit.js';
import { resolveTheme, mixHex, THEMES, CUSTOM_ID } from '../public/js/lib/themes.js';
import { buildInfo, buildStyle } from '../public/js/params.js';
import { DEFAULT_SETTINGS } from '../public/js/store.js';

const { FakeCanvas, log } = installFakeCanvas();

test('registry: unique ids, known categories, sane map pins and crop regions', () => {
  const ids = new Set();
  const cats = new Set(CATEGORIES.map((c) => c.id));
  for (const t of TEMPLATES) {
    assert.ok(!ids.has(t.id), `duplicate template id ${t.id}`);
    ids.add(t.id);
    assert.ok(t.name, `${t.id} has a name`);
    assert.ok(cats.has(t.category), `${t.id} category ${t.category}`);
    for (const c of t.also || []) assert.ok(cats.has(c), `${t.id} also ${c}`);
    assert.ok(t.map.width > 0 && t.map.height > 0, `${t.id} map size`);
    assert.ok(t.map.pin.x >= 0 && t.map.pin.x <= 1 && t.map.pin.y >= 0 && t.map.pin.y <= 1, `${t.id} pin`);
    assert.ok(!('paint' in t) && !('crop' in t), `${t.id} registry entry carries only metadata`);
  }
  for (const [id, r] of Object.entries(CROP_REGIONS)) {
    assert.ok(ids.has(id), `crop region for unknown template ${id}`);
    assert.ok(r.w > 0 && r.h > 0 && r.left >= 0 && r.top >= 0, `${id} crop region origin`);
    assert.ok(r.left + r.w <= POSTER_W + 1e-6 && r.top + r.h <= POSTER_H + 1e-6, `${id} crop region inside the poster`);
  }
  assert.strictEqual(templatesOf('all').length, TEMPLATES.length);
  for (const c of CATEGORIES) assert.ok(templatesOf(c.id).length > 0, `category ${c.id} is not empty`);
  assert.ok(templatesOf('hot').length >= 8);
});

const photo = { width: 900, height: 600 };
const portrait = { width: 600, height: 900 };
const map = new FakeCanvas(1200, 1600);

const ITEMS = {
  kyoto: { templateId: 'polaroid', crops: {}, place: 'KYOTO', lat: 35.0116, lon: 135.7681, dateValue: '2024-06-16', dateText: 'JUN 16, 2024', clock: '10:22', camera: 'iPhone 15 Pro', exposure: '24mm f/1.8 1/120s ISO80' },
  south: { templateId: 'polaroid', crops: {}, place: 'SYDNEY', lat: -33.8688, lon: -151.2093, dateValue: '2023-12-31', dateText: '', clock: '', camera: '' },
  long: { templateId: 'polaroid', crops: {}, place: 'ST. WOLFGANG IM SALZKAMMERGUT, UPPER AUSTRIA', lat: 47.7386, lon: 13.4478, dateValue: '2024-02-29', dateText: '', clock: '23:59', camera: 'SONY ILCE-7M4', exposure: '600mm f/6.3 1/4000s ISO12800' },
  cjk: { templateId: 'polaroid', crops: {}, place: '杭州市西湖区灵隐寺北高峰', lat: 30.259, lon: 120.1388, dateValue: '2024-01-01', dateText: '', clock: '', camera: '' },
  nodate: { templateId: 'polaroid', crops: {}, place: 'REYKJAVIK', lat: 64.1466, lon: -21.9426, dateValue: '', dateText: '', clock: '', camera: '' },
  nogps: { templateId: 'polaroid', crops: {}, place: '', lat: null, lon: null, dateValue: '2024-06-16', dateText: 'JUN 16, 2024', clock: '', camera: '' }
};

const VARIANTS = [
  { item: 'kyoto', theme: 'paper' },
  { item: 'kyoto', theme: 'midnight', footer: true, coordFormat: 'dms', dateFormat: 'cn' },
  { item: 'south', theme: CUSTOM_ID, hex: '#2A9D8F', mapOff: true, slogan: '' },
  { item: 'long', theme: 'sage', footer: true, dateFormat: 'long', slogan: 'A VERY LONG CUSTOM SLOGAN THAT SHOULD STILL FIT SOMEWHERE ON THE POSTER', crop: { zoom: 4, x: 1, y: -1 } },
  { item: 'cjk', theme: CUSTOM_ID, hex: '#F4E3B2', dateFormat: 'dot', portrait: true },
  { item: 'nodate', theme: 'midnight', mapOff: true },
  { item: 'nogps', theme: 'paper', footer: true, noBrand: true }
];

test('painters: every template paints every variant without errors or invalid geometry', () => {
  assert.ok(THEMES.some((t) => t.id === 'sage'));
  for (const v of VARIANTS) {
    const settings = {
      ...DEFAULT_SETTINGS,
      mapColorId: v.theme,
      customHex: v.hex || DEFAULT_SETTINGS.customHex,
      footerOn: !!v.footer,
      coordFormat: v.coordFormat || 'dec',
      dateFormat: v.dateFormat || 'en',
      sloganOn: v.slogan !== '',
      slogan: v.slogan || '',
      brandName: v.noBrand ? '' : 'GEOPICS',
      brandTagline: v.noBrand ? '' : 'MAP YOUR MOMENT'
    };
    for (const t of TEMPLATES) {
      const item = { ...ITEMS[v.item], templateId: t.id, crops: v.crop ? { [t.id]: v.crop } : {} };
      const canvas = new FakeCanvas(POSTER_W * 2, Math.round(posterHeight(settings.footerOn) * 2));
      const assets = { photo: v.portrait ? portrait : photo, map: v.mapOff || item.lat === null ? null : map, qr: null };
      log.length = 0;
      log.texts.length = 0;
      assert.doesNotThrow(() => paintPoster(canvas, t.id, assets, buildInfo(item, settings), buildStyle(settings, item)), `${t.id} / ${v.item} / ${v.theme}`);
      assert.deepStrictEqual(log.slice(0, 5), [], `${t.id} / ${v.item}: invalid draw calls`);
      // 字间距文字是逐字绘制的，拼起来再查
      const drawn = log.texts.join('');
      assert.ok(drawn.length > 0, `${t.id} draws some text`);
      assert.doesNotMatch(drawn, /undefined|NaN|null|\[object/, `${t.id} / ${v.item}`);
    }
  }
});

test('painters: empty state paints with and without the footer', () => {
  for (const footer of [false, true]) {
    const canvas = new FakeCanvas(400, Math.round(posterHeight(footer)));
    assert.doesNotThrow(() => paintPoster(canvas, 'polaroid', null, null, { footer, theme: { dark: false }, brand: { name: 'X', tagline: '' } }));
  }
});

test('poster-kit: scale bar picks a round length within the limit', () => {
  const bar = scaleBar(35, 12, 80);
  assert.ok(bar.length > 0 && bar.length <= 80);
  assert.match(bar.label, /^(1|2|5)(0*) (M|KM)$|^\d+(\.\d+)? KM$/);
  assert.ok(scaleBar(35, 16, 80).length <= 80);
  assert.notStrictEqual(scaleBar(35, 6, 80).label, bar.label);
  assert.strictEqual(scaleBar(null, 12, 80), null);
});

test('poster-kit: calendarOf handles leap years and weekdays', () => {
  const c = calendarOf({ y: 2024, m: 2, d: 29 });
  assert.strictEqual(c.days, 29);
  assert.strictEqual(c.first, 4);
  assert.strictEqual(c.weekday, 4);
  assert.strictEqual(c.doy, 60);
  assert.strictEqual(c.yearDays, 366);
  const d = calendarOf({ y: 2023, m: 12, d: 31 });
  assert.strictEqual(d.days, 31);
  assert.strictEqual(d.doy, 365);
  assert.strictEqual(d.yearDays, 365);
  assert.strictEqual(calendarOf({ y: 1900, m: 2, d: 1 }).yearDays, 365);
  assert.strictEqual(calendarOf({ y: 2000, m: 2, d: 1 }).days, 29);
});

test('poster-kit: shortCoord, dateParts and sloganOf', () => {
  assert.deepStrictEqual(shortCoord({ lat: 30.259, lon: -120.1388 }), { lat: '30.26° N', lon: '120.14° W' });
  assert.deepStrictEqual(shortCoord({ lat: 30.259, lon: 120.1388, coordFormat: 'dms' }), { lat: '30°16′ N', lon: '120°08′ E' });
  assert.deepStrictEqual(shortCoord({ lat: 10.9999, lon: 0, coordFormat: 'dms' }), { lat: '11°00′ N', lon: '0°00′ E' });
  assert.deepStrictEqual(shortCoord({ coordText: '-- ° --  -- ° --' }), { lat: '-- ° --', lon: '-- ° --' });
  assert.deepStrictEqual(dateParts({ dateText: 'JUN 16, 2024' }), { y: 2024, m: 6, d: 16 });
  assert.deepStrictEqual(dateParts({ date: { y: 2020, m: 1, d: 2 }, dateText: '2020年1月2日' }), { y: 2020, m: 1, d: 2 });
  assert.strictEqual(dateParts({ dateText: '' }), null);
  assert.strictEqual(sloganOf({}), TAGLINE);
  assert.strictEqual(sloganOf({ slogan: '' }), '');
  assert.strictEqual(sloganOf({ slogan: 'HI' }), 'HI');
});

test('poster-kit: text on solid theme colours stays readable', () => {
  assert.strictEqual(inkOn('#0A84FF'), '#FFFFFF');
  assert.strictEqual(inkOn('#E8D44D'), '#1C1C1E');
  assert.strictEqual(inkOn('#34E89A', '#000000'), '#000000');
  for (const hex of ['#E8D44D', '#34E89A', '#FFFFFF']) {
    const c = capLuminance(hex, 0.5);
    assert.ok(luminance(c) <= 0.5, `${hex} -> ${c}`);
    assert.strictEqual(inkOn(c), '#FFFFFF');
  }
  assert.strictEqual(capLuminance('#2E9E4F', 0.5), '#2E9E4F');
});

test('themes: mixHex blends linearly and clamps', () => {
  assert.strictEqual(mixHex('#000000', '#FFFFFF', 0), '#000000');
  assert.strictEqual(mixHex('#000000', '#FFFFFF', 1), '#FFFFFF');
  assert.strictEqual(mixHex('#000000', '#FFFFFF', 0.5), '#808080');
  assert.strictEqual(mixHex('#FF0000', '#0000FF', 0.25), '#BF0040');
  assert.strictEqual(mixHex('#102030', '#102030', 0.7), '#102030');
  assert.strictEqual(resolveTheme(CUSTOM_ID, '#2A9D8F').tint, '#2A9D8F');
});
