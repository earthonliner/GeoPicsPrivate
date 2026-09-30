import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig, updateConfig, publicConfig } from './config.js';
import { getTile } from './tiles.js';
import { reverseGeocode, searchPlaces, flushGeocodeCache } from './geocode.js';
import { saveExport, convertToJpeg, reveal } from './files.js';

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MAX_BODY = 256 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// 只允许本机页面访问：防止其他网站通过 DNS 重绑定 / 跨站请求调用本地接口
function isLocalHost(host) {
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host || '');
}

function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return isLocalHost(new URL(origin).host);
  } catch (e) {
    return false;
  }
}

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.resolve(PUBLIC_DIR, `.${rel}`);
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const stat = await fs.promises.stat(file);
    if (!stat.isFile()) throw new Error('not file');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache'
    });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(file).pipe(res);
  } catch (e) {
    res.writeHead(404).end('Not found');
  }
}

async function handleApi(req, res, url) {
  const { pathname, searchParams } = url;

  if (pathname === '/api/config') {
    if (req.method === 'POST') {
      const patch = JSON.parse((await readBody(req, 1024 * 64)).toString('utf8') || '{}');
      updateConfig(patch);
    }
    return sendJson(res, 200, publicConfig());
  }

  const tileMatch = /^\/api\/tile\/(light|dark)\/(\d+)\/(\d+)\/(\d+)$/.exec(pathname);
  if (tileMatch) {
    const tile = await getTile(tileMatch[1], Number(tileMatch[2]), Number(tileMatch[3]), Number(tileMatch[4]));
    if (!tile) return sendJson(res, 404, { error: 'tile unavailable' });
    res.writeHead(200, { 'Content-Type': tile.type, 'Cache-Control': 'public, max-age=86400', 'Content-Length': tile.body.length });
    return res.end(tile.body);
  }

  if (pathname === '/api/geocode/reverse') {
    const lat = Number(searchParams.get('lat'));
    const lon = Number(searchParams.get('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return sendJson(res, 400, { error: 'invalid coordinates' });
    }
    const lang = searchParams.get('lang') === 'zh' ? 'zh' : 'en';
    const level = searchParams.get('level') === 'detail' ? 'detail' : 'city';
    const result = await reverseGeocode(lat, lon, lang, level);
    return sendJson(res, 200, result || { parts: null });
  }

  if (pathname === '/api/geocode/search') {
    const lang = searchParams.get('lang') === 'zh' ? 'zh' : 'en';
    return sendJson(res, 200, { results: await searchPlaces(searchParams.get('q'), lang) });
  }

  if (pathname === '/api/save' && req.method === 'POST') {
    const body = await readBody(req);
    const saved = await saveExport({ folder: searchParams.get('folder'), name: searchParams.get('name'), body });
    return sendJson(res, 200, saved);
  }

  if (pathname === '/api/convert' && req.method === 'POST') {
    const out = await convertToJpeg(await readBody(req), Number(searchParams.get('maxSide')) || 2560);
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': out.length });
    return res.end(out);
  }

  if (pathname === '/api/reveal' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req, 1024 * 16)).toString('utf8') || '{}');
    return sendJson(res, 200, { path: await reveal(body.path) });
  }

  return sendJson(res, 404, { error: 'not found' });
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      if (!isLocalHost(req.headers.host) || !originAllowed(req)) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
      else await serveStatic(req, res, url.pathname);
    } catch (err) {
      if (!res.headersSent) sendJson(res, err.status || 500, { error: err.message || 'server error' });
      else res.end();
    }
  });
}

export function listen({ port = 5178, host = '127.0.0.1', maxTries = 20 } = {}) {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const attempt = (p) => {
      const server = createServer();
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && tries < maxTries) {
          tries += 1;
          attempt(p + 1);
        } else {
          reject(err);
        }
      });
      server.listen(p, host, () => resolve({ server, port: server.address().port, host }));
    };
    attempt(port);
  });
}

export function installShutdownHooks() {
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.once(sig, () => {
      flushGeocodeCache();
      process.exit(0);
    });
  }
}
