'use strict';

// Agent J: place API only. The weather route remains Agent C's responsibility.
const SNAPSHOT = require('../catalog/places.v1.json');
const SOURCE_URL = 'https://www.data.go.kr/data/15101578/openapi.do';
const BASE_URL = 'https://apis.data.go.kr/B551011/KorService2/areaBasedList2';
const REGION_CODES = { '서울': '1', '경기': '31' };
const TYPES = [['12', 'spot'], ['14', 'culture'], ['39', 'food']];
const MAX_PER_TYPE = 40; // Bounded, explicitly partial MVP coverage.
const CACHE_MS = 15 * 60 * 1000;
const cache = new Map();
const inFlight = new Map();
const traffic = new Map();
const FEATURED_IDS = new Set(['tour-126508', 'tour-126537']);

class PlaceError extends Error {
  constructor(code, status = 502, upstreamStatus = null) {
    super(code);
    this.code = code;
    this.status = status;
    this.upstreamStatus = upstreamStatus;
  }
}

const validId = id => typeof id === 'string' && /^tour-[0-9]{1,12}$/.test(id);
const coord = (n, low, high) => typeof n === 'number' && Number.isFinite(n) && n >= low && n <= high;
const regionFor = address => /^서울(?:특별시|\s)/.test(address) ? '서울' :
  /^경기(?:도|\s)/.test(address) ? '경기' : null;
const category = value => ['spot', 'culture', 'food'].includes(value);

function normalizePlace(raw) {
  if (!raw || !validId(raw.id) || typeof raw.name !== 'string' || !raw.name.trim() ||
      raw.name.length > 180 || typeof raw.address !== 'string' || !raw.address.trim() ||
      raw.address.length > 400 || !category(raw.kind) ||
      !coord(raw.lat, 36.5, 38.5) || !coord(raw.lng, 125.5, 129) ||
      !['서울', '경기'].includes(raw.region) || regionFor(raw.address) !== raw.region) return null;
  const contentId = raw.id.slice(5);
  return {
    id: raw.id, contentId, name: raw.name.trim(), address: raw.address.trim(),
    kind: raw.kind, lat: raw.lat, lng: raw.lng, region: raw.region,
    matched: true, accessStatus: ['info','unverified','unknown','conflicting','stale'].includes(raw.accessStatus)
      ? raw.accessStatus : 'unverified',
    accessFacts: Array.isArray(raw.accessFacts) ? raw.accessFacts.filter(f =>
      f && typeof f.label === 'string' && typeof f.description === 'string'
    ).map(f => ({
      label: f.label.slice(0, 100), description: f.description.slice(0, 500),
      status: 'source_reported', sourceUrl: 'https://www.data.go.kr/data/15101897/openapi.do',
      collectedAt: f.collectedAt || null, verifiedAt: null
    })) : [],
    source: raw.source || '한국관광공사 국문 관광정보',
    sourceUrl: SOURCE_URL, collectedAt: raw.collectedAt || null,
    sourceUpdatedAt: raw.sourceUpdatedAt || null,
    // Identifier only: image reuse rights are NOT asserted by a content ID.
    imageIdentifier: contentId, imageUrl: null,
    ...(raw.featured === true ? { featured: true } : {})
  };
}

function uniquePlaces(input) {
  const result = new Map();
  for (const item of input) {
    const place = normalizePlace(item);
    if (place && !result.has(place.id)) result.set(place.id, place);
  }
  return [...result.values()];
}

function staticCatalog(region) {
  const records = uniquePlaces(SNAPSHOT.records).filter(p => p.region === region);
  return {
    region, mode: 'snapshot', places: records,
    meta: { source: 'KTO legacy API observed subset', catalogVersion: SNAPSHOT.catalogVersion,
      fetchedAt: null, sourceUpdatedAt: null, dataStatus: 'partial', partial: true,
      coverage: SNAPSHOT.coverage, totalAvailable: null },
    warnings: ['저장된 일부 장소 표본만 제공됩니다. 전체 관광지 목록이나 최신 현장 정보가 아닙니다.']
  };
}

function normalizeTour(item, kind, region, checkedAt) {
  const id = String(item?.contentid ?? '');
  const name = item?.title;
  const address = item?.addr1;
  const updated = String(item?.modifiedtime || '');
  return normalizePlace({
    id: 'tour-' + id, name, address, kind, region,
    lat: Number(item?.mapy), lng: Number(item?.mapx),
    accessStatus: 'unverified', accessFacts: [],
    source: '한국관광공사 국문 관광정보 TourAPI',
    collectedAt: checkedAt,
    sourceUpdatedAt: /^\d{8}(?:\d{6})?$/.test(updated)
      ? updated.slice(0,4)+'-'+updated.slice(4,6)+'-'+updated.slice(6,8) : null
  });
}

function classifyUpstream(status) {
  if (status === 401 || status === 403) return new PlaceError('upstream_unauthorized', 502, status);
  if (status === 429) return new PlaceError('upstream_rate_limited', 503, status);
  return new PlaceError('upstream_unavailable', 502, status);
}

async function fetchType(region, type, kind, { fetcher, key, checkedAt }) {
  const url = new URL(BASE_URL);
  // The key stays server-side. Never log or return the full request URL.
  for (const [k,v] of Object.entries({
    serviceKey: key, MobileOS: 'ETC', MobileApp: 'HAMKKEBOM',
    _type: 'json', arrange: 'A', pageNo: '1',
    numOfRows: String(MAX_PER_TYPE), areaCode: REGION_CODES[region], contentTypeId: type
  })) url.searchParams.set(k,v);
  let response;
  try {
    response = await fetcher(url.toString(), { signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/json' } });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError')
      throw new PlaceError('upstream_timeout', 504);
    throw new PlaceError('upstream_unavailable', 502);
  }
  if (!response || typeof response.ok !== 'boolean')
    throw new PlaceError('upstream_invalid_response');
  if (!response.ok) throw classifyUpstream(response.status);
  let payload;
  try { payload = await response.json(); } catch { throw new PlaceError('upstream_invalid_json'); }
  const header = payload?.response?.header;
  if (!header || String(header.resultCode) !== '0000') {
    const code = String(header?.resultCode || '');
    if (code === '22' || code === '23') throw new PlaceError('upstream_rate_limited', 503, 429);
    if (code === '20' || code === '30') throw new PlaceError('upstream_unauthorized', 502, 401);
    if (code === '05') throw new PlaceError('upstream_timeout', 504);
    throw new PlaceError('upstream_error', 502);
  }
  const body = payload?.response?.body;
  if (!body || !Number.isFinite(Number(body.totalCount)) || Number(body.totalCount) < 0)
    throw new PlaceError('upstream_invalid_schema');
  const rawItems = body.items?.item;
  const items = rawItems == null || rawItems === '' ? [] :
    Array.isArray(rawItems) ? rawItems : [rawItems];
  return {
    total: Number(body.totalCount),
    places: items.map(item => normalizeTour(item, kind, region, checkedAt)).filter(Boolean)
  };
}

async function getCatalog(region, options = {}) {
  if (!Object.hasOwn(REGION_CODES, region)) throw new PlaceError('invalid_region', 400);
  const env = options.env || process.env;
  // Migration alias: the previous deployment used DATA_GO_KR_KEY for TourAPI.
  // Prefer the explicit provider-specific key. Never expose either key to the client.
  const key = [env.HB_TOURAPI_KEY, env.DATA_GO_KR_KEY]
    .find(value => typeof value === 'string' && value.trim())?.trim() || '';
  if (!key) return staticCatalog(region);
  const fetcher = options.fetcher || globalThis.fetch;
  // Cache only normal live runtime calls; injected test clients bypass caching.
  const useCache = !options.fetcher && !options.now;
  const now = Date.now();
  if (useCache && cache.has(region) && cache.get(region).expires > now)
    return cache.get(region).value;
  if (useCache && inFlight.has(region)) return inFlight.get(region);
  const task = (async () => {
    const checkedAt = new Date(options.now || now).toISOString();
    const results = await Promise.all(TYPES.map(([type,kind]) =>
      fetchType(region,type,kind,{fetcher,key,checkedAt})));
    const places = uniquePlaces(results.flatMap(r=>r.places));
    const partial = results.some(r=>r.total > MAX_PER_TYPE || r.places.length < Math.min(r.total,MAX_PER_TYPE));
    const result = {
      region, mode: 'live', places,
      meta: {source:'한국관광공사 국문 관광정보 TourAPI', catalogVersion:'tourapi2-page1-v1',
        fetchedAt: checkedAt, sourceUpdatedAt: null, dataStatus: partial?'partial':'ok',
        partial, coverage:'first_page_per_category', totalAvailable: results.reduce((n,r)=>n+r.total,0)},
      warnings: partial?['MVP 데이터는 카테고리별 첫 페이지로 제한됩니다. 모든 장소를 포함하지 않습니다.']:[]
    };
    if (useCache) cache.set(region,{expires:now+CACHE_MS,value:result});
    return result;
  })();
  if (useCache) inFlight.set(region,task);
  try { return await task; } finally { if (useCache) inFlight.delete(region); }
}

const radians = degrees => degrees * Math.PI / 180;
function distanceMeters(a,b) {
  const dLat=radians(a.lat-b.lat),dLng=radians(a.lng-b.lng);
  const h=Math.sin(dLat/2)**2+Math.cos(radians(a.lat))*Math.cos(radians(b.lat))*Math.sin(dLng/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
async function allPlaces(options) {
  const results=await Promise.all(['서울','경기'].map(region=>getCatalog(region,options)));
  return {places:uniquePlaces(results.flatMap(r=>r.places)), sources:results};
}
function decorateDistances(places,center,limit) {
  return places.map(p=>({...p,distanceKm:Math.round(distanceMeters(p,center)/100)/10}))
    .sort((a,b)=>a.distanceKm-b.distanceKm || a.id.localeCompare(b.id))
    .slice(0,limit);
}

function queryParams(req) {
  const query=req?.query || {};
  if (Object.keys(query).length) return query;
  try { return Object.fromEntries(new URL(req.url || '/', 'https://localhost').searchParams); }
  catch { return {}; }
}
function validateLocation(query) {
  const parse = (value, min, max) => {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    if (String(value).trim() === '' || String(value).length > 40) return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max ? number : null;
  };
  const lat=parse(query.lat,-90,90),lng=parse(query.lng,-180,180);
  if (lat === null || lng === null) throw new PlaceError('invalid_coordinates',400);
  return {lat,lng};
}
function hitLimit(req) {
  const ip = String(req?.headers?.['x-real-ip'] || req?.headers?.['x-forwarded-for'] || 'anonymous').split(',')[0].slice(0,70);
  const now=Date.now(), last=traffic.get(ip);
  const count=last && last.expires>now ? last.count+1 : 1;
  if (traffic.size>2048) traffic.clear();
  traffic.set(ip,{count,expires:last&&last.expires>now?last.expires:now+60000});
  if (count>90) throw new PlaceError('rate_limited',429);
}
function respondError(res,error) {
  const safe=error instanceof PlaceError ? error : new PlaceError('catalog_unavailable',502);
  res.setHeader('Cache-Control','no-store');
  return res.status(safe.status).json({error:safe.code,...(safe.upstreamStatus?{upstreamStatus:safe.upstreamStatus}:{})});
}

async function serve(kind,req,res,options={}) {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow','GET');
    return res.status(405).json({error:'method_not_allowed'});
  }
  try {
    hitLimit(req);
    const query = queryParams(req);
    if (kind === 'data') {
      if (query.type === 'weather')
        throw new PlaceError('weather_handler_not_connected',501); // Agent C, not Agent J.
      if (query.type !== 'places') throw new PlaceError('invalid_type',400);
      const result=await getCatalog(query.region,options);
      res.setHeader('Cache-Control','public, max-age=0, s-maxage=300');
      return res.status(200).json(result);
    }
    const center=validateLocation(query);
    const {places,sources}=await allPlaces(options);
    const meta={dataStatus:sources.some(s=>s.meta.partial)?'partial':'ok',
      partial:sources.some(s=>s.meta.partial),sourceUpdatedAt:null,
      fetchedAt:sources.find(s=>s.meta.fetchedAt)?.meta.fetchedAt || null,
      coverage:sources.map(s=>({region:s.region,mode:s.mode,count:s.places.length}))};
    if (kind === 'nearby') {
      const radiusMeters=10000;
      const nearby=decorateDistances(places.filter(p=>distanceMeters(p,center)<=radiusMeters),center,50);
      return res.status(200).json({mode:sources.every(s=>s.mode==='live')?'live':'snapshot',
        center,radiusMeters,count:nearby.length,
        source:'한국관광공사 국문 관광정보',distanceType:'straight_line',
        note:'직선거리이며 실제 보행거리·경사·이동 적합 여부는 확인되지 않음',
        fetchedAt:meta.fetchedAt,meta,places:nearby.map(p=>({...p,subtype:p.kind==='food'?'음식점':'관광지'}))});
    }
    if (kind === 'featured') {
      const radiusKm=42;
      const candidates=places.filter(p=>FEATURED_IDS.has(p.id)&&p.name ===
        ({'tour-126508':'경복궁','tour-126537':'북촌한옥마을'})[p.id] &&
        distanceMeters(p,center)<=radiusKm*1000);
      const featured=decorateDistances(candidates,center,10).map(p=>({...p,featured:true}));
      return res.status(200).json({mode:sources.every(s=>s.mode==='live')?'live':'snapshot',
        source:'한국관광공사 TourAPI',selection:'editorial-shortlist-confirmed-exact-title',
        note:'편집 후보와 공공데이터 장소명 대조. 공식 인기순위 아님',
        radiusKm,requested:FEATURED_IDS.size,validated:featured.length,failedQueries:0,
        meta,places:featured});
    }
    throw new PlaceError('unknown_handler',500);
  } catch (error) { return respondError(res,error); }
}

module.exports = {getCatalog,staticCatalog,normalizePlace,normalizeTour,uniquePlaces,
  distanceMeters,validateLocation,serve,PlaceError};
