'use strict';
// Published photo metadata only: no hot-linking, external API proxy or remote guessing.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const catalog = require('../photo-catalog.json');

const LICENSES = new Set(['CC0-1.0', 'CC-BY-2.0', 'CC-BY-SA-2.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'KOGL-TYPE-1', 'PD-self']);
const PLACE_ID = /^tour-\d{1,12}$/;
const FILE_LIMIT = 2 * 1024 * 1024;
const MIN_DIM = 320;
const MAX_DIM = 8192;
function safeHttps(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
  } catch (_) { return false; }
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && parsed.getTime() <= Date.now();
}
// Vercel system environment is trusted; never reflect a caller's Host header.
function configuredOrigin() {
  const host = process.env.VERCEL_URL;
  return typeof host === 'string' && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.vercel\.app$/i.test(host)
    ? 'https://' + host : null;
}
function validOrigin(value) {
  if (!safeHttps(value)) return null;
  const url = new URL(value);
  return url.pathname === '/' && !url.search && !url.hash ? url.origin : null;
}

function webpDimensions(bytes) {
  if (bytes.length < 30 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') return null;
  // RIFF file size must agree with the actual file; truncated assets are not acceptable.
  if (bytes.readUInt32LE(4) + 8 !== bytes.length) return null;
  const mode = bytes.toString('ascii', 12, 16);
  let width = 0, height = 0;
  if (mode === 'VP8X' && bytes.length >= 30) {
    width = 1 + bytes.readUIntLE(24, 3);
    height = 1 + bytes.readUIntLE(27, 3);
  } else if (mode === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    width = bytes.readUInt16LE(26) & 0x3fff;
    height = bytes.readUInt16LE(28) & 0x3fff;
  } else if (mode === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const flags = bytes.readUInt32LE(21);
    width = 1 + (flags & 0x3fff);
    height = 1 + ((flags >>> 14) & 0x3fff);
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < MIN_DIM || height < MIN_DIM || width > MAX_DIM || height > MAX_DIM) return null;
  return {width, height};
}

function publishedPhoto(entry, id, root) {
  if (!entry || typeof entry !== 'object' || entry.placeId !== id || !PLACE_ID.test(id) ||
      entry.rightsStatus !== 'approved' || !LICENSES.has(entry.license) ||
      typeof entry.source !== 'string' || !entry.source.trim() ||
      typeof entry.credit !== 'string' || !entry.credit.trim() ||
      typeof entry.verifiedBy !== 'string' || !entry.verifiedBy.trim() ||
      typeof entry.placeMatchEvidence !== 'string' || !entry.placeMatchEvidence.trim() ||
      typeof entry.changeNotice !== 'string' || !entry.changeNotice.trim() ||
      !validDate(entry.verifiedAt) ||
      !safeHttps(entry.originalUrl) || !safeHttps(entry.licenseUrl) ||
      typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(entry.sha256)) return null;
  // The immutable TourAPI ID must be identical in file path, catalog key, and record.
  const expected = '/images/places/' + id + '.webp';
  if (entry.imagePath !== expected) return null;
  const file = path.join(root, 'images', 'places', id + '.webp');
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 30 || stat.size > FILE_LIMIT) return null;
    const bytes = fs.readFileSync(file);
    const actual = webpDimensions(bytes);
    if (!actual || actual.width !== entry.width || actual.height !== entry.height ||
        crypto.createHash('sha256').update(bytes).digest('hex').toLowerCase() !== entry.sha256.toLowerCase()) return null;
    return {
      contentId: id.slice(5), placeId: id, imageUrl: expected, imagePath: expected, source: entry.source,
      license: entry.license, licenseUrl: entry.licenseUrl, credit: entry.credit,
      originalUrl: entry.originalUrl, verifiedAt: entry.verifiedAt,
      changeNotice: entry.changeNotice, width: actual.width, height: actual.height
    };
  } catch (_) { return null; }
}

function createHandler({manifest = catalog, rootDir = path.resolve(__dirname, '..'), publicOrigin = configuredOrigin()} = {}) {
  const origin = validOrigin(publicOrigin);
  return function handler(req, res) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return res.status(405).json({status: 'method_not_allowed', imageUrl: null, source: null});
    }
    const candidate = req.query?.contentId ?? req.query?.placeId;
    if (typeof candidate !== 'string' || !/^(?:tour-)?\d{1,12}$/.test(candidate)) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(400).json({status: 'invalid_place_id', imageUrl: null, source: null});
    }
    const id = candidate.startsWith('tour-') ? candidate : 'tour-' + candidate;
    const result = publishedPhoto(manifest?.photos?.[id], id, rootDir);
    // Published deployment must return an absolute HTTPS URL per legacy contract.
    // Local development may use same-origin relative paths; no proxy fallback.
    const available = result && (origin || process.env.VERCEL !== '1');
    if (available && origin) result.imageUrl = new URL(result.imagePath, origin).href;
    res.setHeader('Cache-Control', available ? 'public, max-age=600' : 'public, max-age=60');
    if (req.method === 'HEAD') return res.status(available ? 200 : 404).end();
    return res.status(200).json(available ? result : {contentId: id.slice(5), placeId: id, status: 'unverified_or_unavailable', imageUrl: null, source: null});
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.publishedPhoto = publishedPhoto;
module.exports.webpDimensions = webpDimensions;