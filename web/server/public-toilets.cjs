'use strict';
const fs = require('node:fs');
const pilot = require('./public-toilet-pilot.cjs');
const SOURCE = 'https://www.data.go.kr/data/15012892/standard.do';
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_ROWS = 60000;
const clean = (v, max) => typeof v === 'string' && v.trim() && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v) ? v.trim() : null;
const count = v => Number.isSafeInteger(v) && v >= 0 && v <= 100 ? v : null;
function validDate(v, today) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || v > today) return false;
  const d = new Date(v + 'T00:00:00Z');
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === v;
}
function normalize(row, today) {
  if (!row || typeof row !== 'object') return null;
  const id = clean(row.source_id, 100), name = clean(row.name, 100), address = clean(row.address, 200);
  const lat = row.lat, lng = row.lng, evidence = row.coordinate_evidence;
  if (!id || !name || !address || !/^(서울특별시|경기도)\s/.test(address) || !validDate(row.reference_date, today)) return null;
  // Coarse regional plausibility, never a substitute for coordinate/address review.
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 36.8 || lat > 38.4 || lng < 126.2 || lng > 128 || row.coordinates_status !== 'verified') return null;
  const url = clean(evidence?.source_url, 500);
  if (!url || !/^https:\/\/[^\s/]+(?:\/|$)/.test(url) || evidence?.redistribution_approved !== true || !validDate(evidence?.verified_at, today)) return null;
  const male = count(row.accessibility_report?.accessible_male_stalls), female = count(row.accessibility_report?.accessible_female_stalls);
  const status = male > 0 || female > 0 ? 'reported_present' : male === 0 && female === 0 ? 'none_reported' : 'unknown';
  const opening = ['always_reported','scheduled_reported','irregular_reported','closed_reported'].includes(row.opening_status) ? row.opening_status : 'unknown';
  const item = { id, name, address, lat, lng, category: 'public_toilet', referenceDate: row.reference_date, sourceUrl: SOURCE,
    coordinateEvidence: { sourceUrl: url, verifiedAt: evidence.verified_at }, openingStatus: opening,
    openingHours: clean(row.opening_hours_raw, 160), accessibleStalls: { status, male, female }, accessibleRoute: 'unknown' };
  // Only the reviewed municipal pilot has this distinct source contract. Never infer a toilet door or accessible route.
  if (evidence.precision === 'facility_location') {
    if (url !== pilot.coverageDetail.sourceUrl || evidence.license !== pilot.coverageDetail.license || !validDate(evidence.sourceDatasetUpdatedAt,today) || !clean(evidence.sourceRecordId,100) || !/^https:\/\/www\.geumcheon\.go\.kr\//.test(evidence.identitySourceUrl || '')) return null;
    item.coordinatePrecision = 'facility_location';
    Object.assign(item.coordinateEvidence, {sourceRecordId:evidence.sourceRecordId,identitySourceUrl:evidence.identitySourceUrl,sourceDatasetUpdatedAt:evidence.sourceDatasetUpdatedAt,license:evidence.license,attribution:pilot.coverageDetail.attribution});
    item.openingSourceUrl = pilot.coverageDetail.sourceUrl;
    item.accessibleFacilityReport = {status:row.facility_accessibility_report?.status === 'reported_present' ? 'reported_present' : 'unknown',note:clean(row.facility_accessibility_report?.note,180),sourceUrl:pilot.coverageDetail.sourceUrl};
  }
  return item;
}
function buildIndex(rows, today = new Date().toISOString().slice(0, 10)) {
  if (!Array.isArray(rows) || rows.length > MAX_ROWS) throw Error('invalid_dataset');
  const ids = new Map();
  for (const row of rows) { const id = clean(row?.source_id, 100); if (id) ids.set(id, (ids.get(id) || 0) + 1); }
  const records = [];
  for (const row of rows) { const item = normalize(row, today); if (item && ids.get(item.id) === 1) records.push(item); }
  return { records, inputCount: rows.length, excludedCount: rows.length - records.length };
}
function number(value, min, max, fallback, integer = false) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(value)) throw Error('invalid_query');
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) throw Error('invalid_query');
  return n;
}
function parseQuery(q = {}) {
  return { lat: number(q.lat, 33, 39), lng: number(q.lng, 124, 132), radius: number(q.radius, 100, 10000, 2000), limit: number(q.limit, 1, 50, 20, true), offset: number(q.offset, 0, 500, 0, true) };
}
function distance(a,b,c,d) {
  const rad = Math.PI / 180, x = Math.sin((c-a)*rad/2)**2 + Math.cos(a*rad)*Math.cos(c*rad)*Math.sin((d-b)*rad/2)**2;
  return 6371000 * 2 * Math.asin(Math.min(1,Math.sqrt(x)));
}
function query(index, q) {
  const params = parseQuery(q);
  if (!index?.records?.length) return { status: 'unavailable', coverage: 'unverified', items: [], nextOffset: null };
  const hits = [];
  for (const item of index.records) { const meters = distance(params.lat,params.lng,item.lat,item.lng); if (meters <= params.radius) hits.push({ ...item, distanceMeters: Math.round(meters), _distance: meters }); }
  hits.sort((a,b) => a._distance-b._distance || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const end = params.offset + params.limit;
  return { status: 'ok', coverage: 'partial_seoul_gyeonggi', ...(index.coverageDetail ? {coverageDetail:index.coverageDetail} : {}), distanceType: 'straight_line', total: hits.length, items: hits.slice(params.offset,end).map(({_distance,...item}) => item), nextOffset: end < hits.length && end <= 500 ? end : null };
}
let cached, pilotIndex;
function loadIndex(path = process.env.HB_PUBLIC_TOILETS_DATA_FILE) {
  if (!path) return pilotIndex ||= {...buildIndex(pilot.rows),coverageDetail:pilot.coverageDetail};
  if (cached?.path === path) return cached.index;
  const stat = fs.statSync(path);
  if (!stat.isFile() || stat.size > MAX_BYTES) throw Error('invalid_dataset');
  const rows = fs.readFileSync(path,'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const index = buildIndex(rows);
  cached = { path, index }; // immutable approved snapshot; redeploy to replace.
  return index;
}
function serve(req,res,loader = loadIndex) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  const send = (code,body) => { res.statusCode = code; res.end(JSON.stringify(body)); };
  if (req.method !== 'GET') { res.setHeader('Allow','GET'); return send(405,{status:'invalid_method',items:[]}); }
  let q;
  try { q = req.query || Object.fromEntries(new URL(req.url,'http://localhost').searchParams); parseQuery(q); }
  catch { return send(400,{status:'invalid_query',items:[]}); }
  try { const result = query(loader(),q); return send(result.status === 'ok' ? 200 : 503,result); }
  catch { return send(503,{status:'unavailable',coverage:'unverified',items:[],nextOffset:null}); }
}
module.exports = { buildIndex, query, parseQuery, loadIndex, serve };
