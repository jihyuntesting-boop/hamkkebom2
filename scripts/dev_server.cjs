#!/usr/bin/env node
'use strict';
// Local development server: serves web/ statically and runs web/api/*.js
// handlers with a minimal Vercel-compatible req/res surface. No dependencies.
//
//   node scripts/dev_server.cjs [--port 3000]
//
// Environment variables are read from .env.local (repo root, then web/).
// Values already set in the shell take precedence.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'web');
const API = path.join(WEB, 'api');
const MAX_BODY = 64 * 1024;
const MAP_PLACEHOLDER = 'YOUR_NAVER_MAP_CLIENT_ID';

function argPort() {
  const i = process.argv.indexOf('--port');
  const value = Number(i >= 0 ? process.argv[i + 1] : process.env.PORT || 3000);
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw Error('Invalid --port');
  return value;
}

function loadEnvFiles() {
  const loaded = [];
  for (const file of [path.join(ROOT, '.env.local'), path.join(WEB, '.env.local')]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m || line.trim().startsWith('#')) continue;
      let value = m[2];
      if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = value;
    }
    loaded.push(path.relative(ROOT, file));
  }
  return loaded;
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};

function decorate(res) {
  res.status = code => { res.statusCode = code; return res; };
  res.json = obj => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
    return res;
  };
  res.send = body => {
    if (body !== null && typeof body === 'object' && !Buffer.isBuffer(body)) return res.json(body);
    res.end(body);
    return res;
  };
  return res;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(Object.assign(Error('payload_too_large'), {status: 413})); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function resolveHandler(pathname) {
  const name = pathname.slice('/api/'.length).replace(/\.js$/, '');
  if (!/^[a-z0-9-]+$/.test(name)) return null;
  const file = path.join(API, name + '.js');
  return fs.existsSync(file) ? require(file) : null;
}

async function handleApi(req, res, url) {
  const handler = resolveHandler(url.pathname);
  if (typeof handler !== 'function') return res.status(404).json({error: 'not_found'});
  req.query = Object.fromEntries(url.searchParams);
  if (!['GET', 'HEAD'].includes(req.method)) {
    const raw = await readBody(req);
    req.body = raw;
    if (raw && String(req.headers['content-type'] || '').startsWith('application/json')) {
      try { req.body = JSON.parse(raw); } catch { /* handler validates the raw string */ }
    }
  }
  await handler(req, res);
}

function serveStatic(req, res, url) {
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { return res.status(400).end('Bad request'); }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(WEB, '.' + rel);
  const inside = path.relative(WEB, file);
  // Never expose dotfiles (.env.local), server sources or anything outside web/.
  if (inside.startsWith('..') || path.isAbsolute(inside) ||
      inside.split(path.sep).some(part => part.startsWith('.')) ||
      inside.split(path.sep)[0] === 'server') return res.status(404).end('Not found');
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return res.status(404).end('Not found');
    res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    const mapId = process.env.HB_NAVER_MAP_CLIENT_ID;
    if (mapId && path.extname(file) === '.js') {
      // Inject the map client ID at serve time so the committed source keeps its placeholder.
      const text = fs.readFileSync(file, 'utf8');
      if (text.includes(MAP_PLACEHOLDER)) return res.end(req.method === 'HEAD' ? undefined : text.split(MAP_PLACEHOLDER).join(encodeURIComponent(mapId)));
    }
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

function main() {
  const loaded = loadEnvFiles();
  const port = argPort();
  // recommend/travel-times read the place catalog from HB_LEGACY_API_BASE + /api/data.
  // Locally, point it at this server's own /api/data unless explicitly configured.
  if (!process.env.HB_LEGACY_API_BASE) process.env.HB_LEGACY_API_BASE = 'http://localhost:' + port;

  const server = http.createServer(async (req, res) => {
    decorate(res);
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
      else if (['GET', 'HEAD'].includes(req.method)) serveStatic(req, res, url);
      else res.status(405).end('Method not allowed');
    } catch (err) {
      if (!res.headersSent) res.status(err.status || 500).json({error: err.status === 413 ? 'payload_too_large' : 'dev_server_error'});
      if (!err.status) console.error(err);
    } finally {
      console.log(`${req.method} ${url.pathname}${url.search} -> ${res.statusCode}`);
    }
  });
  server.listen(port, () => {
    console.log(`HAMKKEBOM dev server: http://localhost:${port}`);
    console.log(`env files: ${loaded.length ? loaded.join(', ') : '(none)'}`);
    for (const key of ['DATA_GO_KR_KEY', 'HB_NAVER_MAP_CLIENT_ID', 'HB_NAVER_DIRECTIONS_ENABLED', 'HB_LEGACY_API_BASE'])
      console.log(`  ${key}: ${process.env[key] ? (key === 'HB_LEGACY_API_BASE' ? process.env[key] : 'set') : 'missing'}`);
  });
}

main();
