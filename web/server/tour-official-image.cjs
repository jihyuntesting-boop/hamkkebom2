'use strict';
// MVP exception (docs/DECISIONS.md, 2026-11-26 user decision): show the image that the
// Korea Tourism Organization registers for the SAME TourAPI content ID, with source and
// KOGL type attribution. Never search by name, never substitute another place's image,
// never proxy or store the bytes. Only official KTO image hosts over HTTPS are returned.
const SOURCE_URL = 'https://www.data.go.kr/data/15101578/openapi.do';
const ENDPOINT = 'https://apis.data.go.kr/B551011/KorService2/detailCommon2';
const IMAGE_HOSTS = new Set(['tong.visitkorea.or.kr', 'cdn.visitkorea.or.kr']);
const KOGL_URLS = {
  1: 'https://www.kogl.or.kr/info/licenseType1.do',
  2: 'https://www.kogl.or.kr/info/licenseType2.do',
  3: 'https://www.kogl.or.kr/info/licenseType3.do',
  4: 'https://www.kogl.or.kr/info/licenseType4.do'
};
const FOUND_TTL = 6 * 60 * 60 * 1000;
const EMPTY_TTL = 6 * 60 * 60 * 1000;
const ERROR_TTL = 60 * 1000;
const BREAKER_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 2000;
const TIMEOUT_MS = 2500;

class TourImageError extends Error {
  constructor(code) { super(code); this.code = code; }
}

// Returns an https URL on an official KTO image host, upgrading KTO's own http links.
function officialImageUrl(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 500 || /\s/.test(value.trim())) return null;
  let url;
  try { url = new URL(value.trim()); } catch (_) { return null; }
  if (url.username || url.password || url.port || !IMAGE_HOSTS.has(url.hostname.toLowerCase())) return null;
  if (url.protocol === 'http:') url.protocol = 'https:';
  if (url.protocol !== 'https:' || !/\.(?:jpe?g|png|gif|webp)$/i.test(url.pathname)) return null;
  url.hash = '';
  return url.href;
}

function koglTerms(code) {
  const match = /^Type([1-4])$/.exec(typeof code === 'string' ? code.trim() : '');
  if (!match) return {copyrightCode: null, license: null, licenseUrl: null, licenseLabel: null};
  const n = Number(match[1]);
  return {copyrightCode: 'Type' + n, license: 'KOGL-TYPE-' + n, licenseUrl: KOGL_URLS[n], licenseLabel: '공공누리 제' + n + '유형'};
}

// item: one TourAPI detailCommon2/areaBasedList2 row. contentId: the requested ID.
function officialTourImage(item, contentId) {
  if (!item || typeof item !== 'object' || String(item.contentid ?? '') !== String(contentId)) return null;
  const imageUrl = officialImageUrl(item.firstimage) || officialImageUrl(item.firstimage2);
  if (!imageUrl) return null;
  return {
    status: 'official_tourapi', imageUrl, imagePath: null,
    source: '한국관광공사 TourAPI', sourceUrl: SOURCE_URL, credit: '한국관광공사',
    ...koglTerms(item.cpyrhtDivCd),
    rightsBasis: 'MVP 예외: 같은 장소 ID의 TourAPI 공식 등록 이미지 (docs/DECISIONS.md 2026-11-26)'
  };
}

function resolveKey(env) {
  const raw = [env?.HB_TOURAPI_KEY, env?.DATA_GO_KR_KEY].find(v => typeof v === 'string' && v.trim());
  if (!raw) return null;
  try { return decodeURIComponent(raw.trim()); } catch (_) { return raw.trim(); }
}

async function fetchDetail(contentId, {fetcher, key, timeoutMs}) {
  const url = new URL(ENDPOINT);
  for (const [k, v] of Object.entries({serviceKey: key, MobileOS: 'ETC', MobileApp: 'HAMKKEBOM', _type: 'json', contentId})) url.searchParams.set(k, v);
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer;
  try {
    return await Promise.race([(async () => {
      const res = await fetcher(url.toString(), {signal: controller?.signal, headers: {Accept: 'application/json'}});
      if (!res || typeof res.ok !== 'boolean') throw new TourImageError('upstream_invalid_response');
      if (res.status === 429) throw new TourImageError('upstream_rate_limited');
      if (!res.ok) throw new TourImageError('upstream_unavailable');
      let data;
      const body = typeof res.text === 'function' ? await res.text() : null;
      try { data = body === null ? await res.json() : JSON.parse(body); } catch (_) {
        const code = typeof body === 'string' && body.match(/<(?:returnReasonCode|resultCode)>\s*(\d{1,4})\s*<\//i);
        if (code && ['22', '0022'].includes(code[1])) throw new TourImageError('upstream_rate_limited');
        throw new TourImageError('upstream_invalid_response');
      }
      const code = String(data?.response?.header?.resultCode ?? data?.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnReasonCode ?? '');
      if (['03', '3', '0003'].includes(code)) return null;
      if (['22', '0022', '23', '0023'].includes(code)) throw new TourImageError('upstream_rate_limited');
      if (!['0000', '00', '0'].includes(code)) throw new TourImageError('upstream_error');
      const raw = data?.response?.body?.items?.item;
      const items = raw == null || raw === '' ? [] : Array.isArray(raw) ? raw : [raw];
      // Exactly the requested content ID; an extra or different row is not trusted.
      if (items.length > 1) throw new TourImageError('upstream_invalid_schema');
      return items.length ? officialTourImage(items[0], contentId) : null;
    })(), new Promise((_, reject) => { timer = setTimeout(() => { controller?.abort(); reject(new TourImageError('upstream_timeout')); }, timeoutMs); })]);
  } catch (e) {
    if (e instanceof TourImageError) throw e;
    throw new TourImageError(e?.name === 'AbortError' ? 'upstream_timeout' : 'upstream_unavailable');
  } finally { clearTimeout(timer); }
}

function createTourImageLookup({fetcher = globalThis.fetch, env = process.env, now = Date.now, timeoutMs = TIMEOUT_MS} = {}) {
  const cache = new Map();
  const inFlight = new Map();
  let breakerUntil = 0;
  function remember(id, value, ttl) {
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value);
    cache.set(id, {value, until: now() + ttl});
  }
  // Resolves to {image} | {image:null} | {error}. Never throws; never exposes the key.
  async function lookup(contentId) {
    const id = String(contentId);
    if (!/^\d{1,12}$/.test(id)) return {image: null};
    const key = resolveKey(env);
    if (!key || typeof fetcher !== 'function') return {image: null, disabled: true};
    const hit = cache.get(id);
    if (hit && hit.until > now()) return hit.value;
    if (breakerUntil > now()) return {error: 'upstream_rate_limited'};
    if (inFlight.has(id)) return inFlight.get(id);
    const pending = fetchDetail(id, {fetcher, key, timeoutMs}).then(image => {
      const value = {image};
      remember(id, value, image ? FOUND_TTL : EMPTY_TTL);
      return value;
    }, e => {
      if (e.code === 'upstream_rate_limited') breakerUntil = now() + BREAKER_MS;
      const value = {error: e.code || 'upstream_error'};
      remember(id, value, ERROR_TTL);
      return value;
    }).finally(() => inFlight.delete(id));
    inFlight.set(id, pending);
    return pending;
  }
  lookup.enabled = () => !!resolveKey(env) && typeof fetcher === 'function';
  return lookup;
}

module.exports = {createTourImageLookup, officialTourImage, officialImageUrl, koglTerms, IMAGE_HOSTS, SOURCE_URL};
