import test from 'node:test';
import assert from 'node:assert';
import { project, unproject, centerForPinAt, tilePlan, gcj02ToWgs84, parseCoordinates } from '../public/js/lib/geo.js';
import { tileInfo, PROVIDERS } from '../public/js/lib/providers.js';

test('project / unproject round trip', () => {
  for (const [lat, lon, z] of [[30.25, 120.16, 12], [-33.87, 151.21, 8], [64.14, -21.94, 16], [0, 0, 4]]) {
    const p = project(lat, lon, z);
    const q = unproject(p.x, p.y, z);
    assert.ok(Math.abs(q.lat - lat) < 1e-9 && Math.abs(q.lon - lon) < 1e-9);
  }
});

test('pin offset shifts the center but keeps the pin coordinate', () => {
  const c = centerForPinAt(46.0192, 7.7459, 12, 600, 800, 0.88, 0.5);
  assert.ok(c.lon < 7.7459);
  assert.ok(Math.abs(c.lat - 46.0192) < 1e-6);
  const same = centerForPinAt(46.0192, 7.7459, 12, 600, 800, 0.5, 0.5);
  assert.ok(Math.abs(same.lat - 46.0192) < 1e-9 && Math.abs(same.lon - 7.7459) < 1e-9);
});

test('tilePlan: 256px tiles use zoom+2 and cover the whole view', () => {
  const plan = tilePlan({ lat: 30.259, lon: 120.1388, zoom: 12, width: 600, height: 800, pin: { x: 0.5, y: 0.5 }, tileScale: 1, maxZoom: 16 });
  assert.strictEqual(plan.tileZoom, 14);
  assert.strictEqual(plan.tileLogical, 128);
  assert.ok(Math.abs(plan.pin.x - 300) < 1e-6 && Math.abs(plan.pin.y - 400) < 1e-6);
  const xs = plan.tiles.map((t) => t.dx);
  const ys = plan.tiles.map((t) => t.dy);
  assert.ok(Math.min(...xs) <= 0 && Math.max(...xs) + 128 >= 600);
  assert.ok(Math.min(...ys) <= 0 && Math.max(...ys) + 128 >= 800);
  assert.strictEqual(new Set(plan.tiles.map((t) => `${t.x},${t.y}`)).size, plan.tiles.length);
});

test('tilePlan: @2x tiles use zoom+1; maxZoom caps the level (no "no data" tiles)', () => {
  const retina = tilePlan({ lat: 10, lon: 10, zoom: 12, width: 600, height: 800, tileScale: 2, maxZoom: 22 });
  assert.strictEqual(retina.tileZoom, 13);
  assert.strictEqual(retina.tileLogical, 256);
  const capped = tilePlan({ lat: 10, lon: 10, zoom: 16, width: 600, height: 800, tileScale: 1, maxZoom: 16 });
  assert.strictEqual(capped.tileZoom, 16);
  assert.strictEqual(capped.tileLogical, 512);
  for (const t of capped.tiles) assert.ok(t.x >= 0 && t.x < 2 ** 16 && t.y >= 0 && t.y < 2 ** 16);
});

test('tilePlan: wraps across the antimeridian and clamps at the poles', () => {
  const wrap = tilePlan({ lat: 0, lon: 179.99, zoom: 6, width: 600, height: 800, tileScale: 2 });
  assert.ok(wrap.tiles.every((t) => t.x >= 0 && t.x < 2 ** wrap.tileZoom));
  assert.ok(wrap.tiles.some((t) => t.x === 0));
  const polar = tilePlan({ lat: 84, lon: 0, zoom: 4, width: 600, height: 800, tileScale: 2 });
  assert.ok(polar.tiles.every((t) => t.y >= 0 && t.y < 2 ** polar.tileZoom));
});

test('providers: tile info and custom scale', () => {
  assert.strictEqual(tileInfo({}).id, 'esri');
  assert.strictEqual(tileInfo({ mapProvider: 'mapbox' }).scale, 2);
  assert.strictEqual(tileInfo({ mapProvider: 'osm' }).gray, true);
  assert.strictEqual(tileInfo({ mapProvider: 'custom', customTileScale: 2 }).scale, 2);
  assert.strictEqual(tileInfo({ mapProvider: 'custom', customTileScale: 7 }).scale, 1);
  assert.strictEqual(tileInfo({ mapProvider: 'nope' }).id, 'esri');
  assert.ok(Object.keys(PROVIDERS).length >= 4);
});

test('gcj02ToWgs84 only shifts inside China', () => {
  assert.deepStrictEqual(gcj02ToWgs84(46.0192, 7.7459), { lat: 46.0192, lon: 7.7459 });
  const cn = gcj02ToWgs84(39.9087, 116.3975);
  assert.ok(Math.abs(cn.lat - 39.9087) > 1e-4 && Math.abs(cn.lat - 39.9087) < 0.01);
  assert.ok(Math.abs(cn.lon - 116.3975) > 1e-4 && Math.abs(cn.lon - 116.3975) < 0.02);
});

test('parseCoordinates accepts common formats', () => {
  assert.deepStrictEqual(parseCoordinates('30.2741, 120.1551'), { lat: 30.2741, lon: 120.1551 });
  assert.deepStrictEqual(parseCoordinates('30.2741 120.1551'), { lat: 30.2741, lon: 120.1551 });
  assert.deepStrictEqual(parseCoordinates('-33.87, 151.21'), { lat: -33.87, lon: 151.21 });
  assert.deepStrictEqual(parseCoordinates('30.27°N 120.16°E'), { lat: 30.27, lon: 120.16 });
  assert.deepStrictEqual(parseCoordinates('33.87° S, 70.65° W'), { lat: -33.87, lon: -70.65 });
  assert.deepStrictEqual(parseCoordinates('E120.16 N30.27'), { lat: 30.27, lon: 120.16 });
  assert.strictEqual(parseCoordinates('91, 10'), null);
  assert.strictEqual(parseCoordinates('10, 181'), null);
  assert.strictEqual(parseCoordinates('abc'), null);
  assert.strictEqual(parseCoordinates('1 2 3'), null);
  assert.strictEqual(parseCoordinates(''), null);
});
