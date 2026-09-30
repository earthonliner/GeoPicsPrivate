import test, { before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gpg-test-'));
process.env.GEOPHOTOGRAPH_HOME = home;
delete process.env.MAPBOX_TOKEN;

const { listen } = await import('../server/index.js');
const { updateConfig, getConfig } = await import('../server/config.js');
const { partsFromNominatim, partsFromMapbox } = await import('../server/geocode.js');
const { tileUrl } = await import('../server/tiles.js');

let server;
let base;
const outDir = path.join(home, 'exports');

before(async () => {
  updateConfig({ outputDir: outDir });
  ({ server } = await listen({ port: 0 }));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const get = (url, headers) =>
  new Promise((resolve, reject) => {
    http.get(url, { headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });

test('serves the app shell and static modules', async () => {
  const html = await get(`${base}/`);
  assert.strictEqual(html.status, 200);
  assert.match(html.body.toString(), /GeoPhotoGraph/);
  const js = await get(`${base}/js/lib/posters.js`);
  assert.strictEqual(js.status, 200);
  assert.match(js.headers['content-type'], /javascript/);
});

test('static files cannot escape the public directory', async () => {
  const res = await get(`${base}/..%2fpackage.json`);
  assert.ok([403, 404].includes(res.status));
  assert.doesNotMatch(res.body.toString(), /geophotograph-local/);
});

test('rejects foreign Host headers and cross-site origins (DNS rebinding / CSRF)', async () => {
  assert.strictEqual((await get(`${base}/api/config`, { Host: 'evil.example.com' })).status, 403);
  assert.strictEqual((await get(`${base}/api/config`, { Origin: 'https://evil.example.com' })).status, 403);
  assert.strictEqual((await get(`${base}/api/config`, { Origin: base })).status, 200);
});

test('config never leaks the Mapbox token and validates input', async () => {
  const res = await fetch(`${base}/api/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapProvider: 'mapbox', mapboxToken: 'pk.secret', geocoder: 'bogus', customTileScale: 2 })
  });
  const cfg = await res.json();
  assert.strictEqual(cfg.mapProvider, 'mapbox');
  assert.strictEqual(cfg.hasMapboxToken, true);
  assert.strictEqual(cfg.geocoder, 'auto');
  assert.strictEqual(cfg.tiles.scale, 2);
  assert.ok(!JSON.stringify(cfg).includes('pk.secret'));
  assert.strictEqual(getConfig().mapboxToken, 'pk.secret');
  await fetch(`${base}/api/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mapProvider: 'esri', mapboxToken: '' }) });
});

test('tile URLs per provider', () => {
  updateConfig({ mapProvider: 'esri' });
  assert.match(tileUrl('light', 14, 3, 5), /World_Light_Gray_Base\/MapServer\/tile\/14\/5\/3$/);
  assert.match(tileUrl('dark', 14, 3, 5), /World_Dark_Gray_Base/);
  updateConfig({ mapProvider: 'osm' });
  assert.strictEqual(tileUrl('light', 14, 3, 5), 'https://tile.openstreetmap.org/14/3/5.png');
  updateConfig({ mapProvider: 'mapbox', mapboxToken: '' });
  assert.strictEqual(tileUrl('light', 1, 0, 0), null);
  updateConfig({ mapboxToken: 'pk.t' });
  assert.match(tileUrl('dark', 1, 0, 0), /dark-v11\/tiles\/256\/1\/0\/0@2x\?access_token=pk\.t$/);
  updateConfig({ mapProvider: 'custom', tileUrlLight: 'https://t.example/{z}/{x}/{y}.png', tileUrlDark: '' });
  assert.strictEqual(tileUrl('dark', 2, 1, 1), 'https://t.example/2/1/1.png');
  updateConfig({ mapProvider: 'esri', mapboxToken: '' });
});

test('tile endpoint rejects out-of-range tiles without hitting upstream', async () => {
  assert.strictEqual((await get(`${base}/api/tile/light/3/9/0`)).status, 404);
  assert.strictEqual((await get(`${base}/api/tile/light/25/0/0`)).status, 404);
  assert.strictEqual((await get(`${base}/api/tile/sepia/3/0/0`)).status, 404);
});

test('tile endpoint serves from the disk cache', async () => {
  const dir = path.join(home, 'cache', 'tiles', 'esri', 'light', '5');
  fs.mkdirSync(dir, { recursive: true });
  const png = Buffer.from('89504e470d0a1a0a00', 'hex');
  fs.writeFileSync(path.join(dir, '3_4.tile'), png);
  const res = await get(`${base}/api/tile/light/5/3/4`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers['content-type'], 'image/png');
  assert.ok(res.body.equals(png));
});

test('save endpoint writes into the output directory, never overwrites, never escapes', async () => {
  const post = (name, folder, body) => fetch(`${base}/api/save?${new URLSearchParams({ name, folder })}`, { method: 'POST', body }).then((r) => r.json());
  const a = await post('x.jpg', 'batch-1', Buffer.from([1, 2, 3]));
  const b = await post('x.jpg', 'batch-1', Buffer.from([4, 5, 6]));
  assert.strictEqual(path.basename(a.path), 'x.jpg');
  assert.strictEqual(path.basename(b.path), 'x-2.jpg');
  assert.deepStrictEqual([...fs.readFileSync(a.path)], [1, 2, 3]);
  assert.ok(a.path.startsWith(outDir + path.sep));

  const evil = await post('../../evil.jpg', '../../etc', Buffer.from([9]));
  assert.ok(evil.path.startsWith(outDir + path.sep));
  assert.ok(!fs.existsSync(path.join(home, 'evil.jpg')));
});

test('reveal refuses paths outside the output directory', async () => {
  const res = await fetch(`${base}/api/reveal`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: '/etc' }) });
  assert.strictEqual(res.status, 400);
});

test('convert is only available with macOS sips', async () => {
  if (process.platform === 'darwin') return;
  const res = await fetch(`${base}/api/convert`, { method: 'POST', body: Buffer.from([1]) });
  assert.strictEqual(res.status, 501);
});

test('geocode reverse validates coordinates', async () => {
  assert.strictEqual((await get(`${base}/api/geocode/reverse?lat=abc&lon=1`)).status, 400);
  assert.strictEqual((await get(`${base}/api/geocode/reverse?lat=91&lon=1`)).status, 400);
});

test('geocoder response mapping (Nominatim / Mapbox)', () => {
  assert.deepStrictEqual(
    partsFromNominatim({ city: 'Hangzhou', city_district: 'Xihu District', suburb: 'Xihu', state: 'Zhejiang', country: 'China' }),
    { city: 'Hangzhou', locality: 'Xihu District', region: 'Zhejiang', country: 'China' }
  );
  assert.strictEqual(partsFromNominatim({ village: 'Hallstatt', country: 'Austria' }).city, 'Hallstatt');
  assert.deepStrictEqual(partsFromNominatim(undefined), {});
  const features = [
    { place_type: ['neighborhood'], text: 'Shimokita' },
    { place_type: ['place'], text: 'Tokyo', context: [{ id: 'region.1', text: 'Tokyo Prefecture' }, { id: 'country.1', text: 'Japan' }] }
  ];
  assert.deepStrictEqual(partsFromMapbox(features).parts, { neighborhood: 'Shimokita', city: 'Tokyo', region: 'Tokyo Prefecture', country: 'Japan' });
  assert.strictEqual(partsFromMapbox([]), null);
});
