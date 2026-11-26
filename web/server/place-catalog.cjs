'use strict';

// Agent J: place API only. The weather route remains Agent C's responsibility.
const SNAPSHOT = require('../catalog/places.v1.json');
const LANDMARKS = require('../catalog/nearby-landmark-supplement.v1.json');
const {loadNationwideCatalog,normalizeRecord,publicPlace}=require('./nationwide-tour-catalog.cjs');
const {enrichCatalog}=require('./catalog-accessibility.cjs');
const {attachLegacyAccessNotes}=require('./legacy-accessibility-notes.cjs');
const {officialTourImage,photoFields,listPhotoFields}=require('./tour-official-image.cjs');
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
    ...(raw.featured === true ? { featured: true } : {}),
    // Photo availability for list consumers (see tour-official-image.cjs photoFields):
    // raw.officialImage undefined = the source row carries no image data (unknown).
    ...photoFields(raw.id, raw.officialImage)
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
    officialImage: officialTourImage(item, id),
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

// The provider's category is not a safety assessment. Preserve unknown classifications.
const subtypeByCat2={A0101:'자연 관광지',A0102:'자연 관광자원',A0201:'역사·문화유산',A0202:'휴양·여가',A0203:'체험시설',A0204:'산업관광',A0205:'건축·조형',A0206:'문화시설',A0207:'축제',A0208:'행사'};
function discoveryFields(item,kind){
  const cat2=typeof item?.cat2==='string'&&/^[A-Z][0-9]{4}$/.test(item.cat2)?item.cat2:null;
  const subtype=kind==='food'?'음식점':kind==='culture'?'문화시설':subtypeByCat2[cat2]||'관광지 · 세부 유형 미확인';
  return {subtype,providerCategoryCode:cat2};
}
function pastDatedEvent(p,now){
  // Only suppress explicitly past-year event titles, not historic sites or a year in an ordinary name.
  const match=p.name.match(/^(?:제\s*)?(20\d{2})\s*(?:년\s*)?/);
  const year=Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric'}).format(new Date(now)));
  return p.kind!=='food'&&Boolean(match)&&Number(match[1])<year&&(/축제|페어|박람회|페스티벌|행사|콘서트|공연|전시회/.test(p.name)||['A0207','A0208'].includes(p.providerCategoryCode));
}
async function fetchType(region, type, kind, { fetcher, key, checkedAt, center, radiusMeters }) {
  const url = new URL(center ? BASE_URL.replace('areaBasedList2','locationBasedList2') : BASE_URL);
  // The key stays server-side. Never log or return the full request URL.
  for (const [k,v] of Object.entries({
    serviceKey: key, MobileOS: 'ETC', MobileApp: 'HAMKKEBOM',
    _type: 'json', arrange: center?'E':'A', pageNo: '1',
    numOfRows: String(MAX_PER_TYPE), contentTypeId: type,
    ...(center ? {mapX:String(center.lng),mapY:String(center.lat),radius:String(radiusMeters)} : {areaCode: REGION_CODES[region]})
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
    places: items.filter(item=>!center || String(item?.contenttypeid??'')===type)
      .map(item => {
        if(center){const p=normalizeRecord(item,type,checkedAt);return p&&p.areaCode&&p.lat!==null?{...publicPlace(p,'nationwide_live'),...listPhotoFields(item,p.contentId)}:null;}
        return normalizeTour(item,kind,region,checkedAt);
      }).filter(Boolean)
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
    const places = uniquePlaces(results.flatMap(r=>r.places))
      .map(place=>attachLegacyAccessNotes(place,options.now || now));
    const historicalNotesCount = places.filter(p=>p.accessFacts.some(f=>f.historical===true)).length;
    const partial = results.some(r=>r.total > MAX_PER_TYPE || r.places.length < Math.min(r.total,MAX_PER_TYPE));
    const result = {
      region, mode: 'live', places,
      meta: {source:'한국관광공사 국문 관광정보 TourAPI', catalogVersion:'tourapi2-page1-v1',
        fetchedAt: checkedAt, sourceUpdatedAt: null, dataStatus: partial?'partial':'ok',
        partial, coverage:'first_page_per_category', totalAvailable: results.reduce((n,r)=>n+r.total,0),
        historicalNotesCount},
      warnings: [...(partial?['MVP 데이터는 카테고리별 첫 페이지로 제한됩니다. 모든 장소를 포함하지 않습니다.']:[]),
        ...(historicalNotesCount?['일부 시설 안내는 기존 공개 API 관측 기록입니다. 원천 갱신일과 현장 이동 가능 여부는 확인되지 않았습니다.']:[])]
    };
    if (useCache) cache.set(region,{expires:now+CACHE_MS,value:result});
    return result;
  })();
  if (useCache) inFlight.set(region,task);
  try { return await task; }
  catch (error) {
    // TourAPI failed (e.g. 429): an earlier successful answer beats an error.
    const previous = useCache && cache.get(region);
    if (previous) return staleCopy(previous.value);
    throw error;
  } finally { if (useCache) inFlight.delete(region); }
}
// Marks a memory hit served past its TTL because the provider is failing.
function staleCopy(value){return {...value,meta:{...value.meta,cache:'stale'}};}

const radians = degrees => degrees * Math.PI / 180;
function distanceMeters(a,b) {
  const dLat=radians(a.lat-b.lat),dLng=radians(a.lng-b.lng);
  const h=Math.sin(dLat/2)**2+Math.cos(radians(a.lat))*Math.cos(radians(b.lat))*Math.sin(dLng/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
async function allPlaces(options) {
  const results=await Promise.all(['서울','경기'].map(region=>getCatalog(region,options)));
  // getCatalog already normalized every place. Keep first occurrence without
  // stripping historical provenance in a second normalization pass.
  const byId=new Map();
  for(const place of results.flatMap(r=>r.places))if(!byId.has(place.id))byId.set(place.id,place);
  return {places:[...byId.values()], sources:results};
}
function decorateDistances(places,center,limit) {
  return places.map(p=>({...p,distanceKm:Math.round(distanceMeters(p,center)/100)/10}))
    .sort((a,b)=>a.distanceKm-b.distanceKm || a.id.localeCompare(b.id))
    .slice(0,limit);
}

// Nearby is a separately bounded operation on the already-connected TourAPI.
// Do not turn on the gated nationwide rich-tour service or accessibility enrichment.
const nearbyCache=new Map(),nearbyPending=new Map();
let nearbyActive=0,nearbyCooldownUntil=0;
const NEARBY_RADIUS=10000;
const NEARBY_LIMIT=50;
function nearbyCategory(value){
  if(value==null)return 'all'; // legacy API consumers
  if(typeof value!=='string'||!['all','spot','food'].includes(value))throw new PlaceError('invalid_category',400);
  return value;
}
function matchesCategory(p,filter){return filter==='all'||filter==='food'&&p.kind==='food'||filter==='spot'&&['spot','culture'].includes(p.kind);}
async function nearbySearch(center,filter,options={}){
  const env=options.env||process.env;
  const nationwide=options.nationwideCatalog||loadNationwideCatalog(env);
  if(nationwide){
    const found=nationwide.nearby(center,NEARBY_RADIUS,filter,NEARBY_LIMIT,options.now||Date.now());
    const partial=nationwide.catalogPartial||found.hasNext||found.hiddenPastEvents>0;
    return {mode:'catalog_snapshot',center,radiusMeters:NEARBY_RADIUS,category:filter,count:found.places.length,source:'한국관광공사 TourAPI 전국 수집 자료',distanceType:'straight_line',note:'전국 카탈로그 수집 자료 · 현재 영업·보행·접근성 미확인 · 일정 작성은 서울·경기',fetchedAt:nationwide.collectedAt,meta:{dataStatus:partial?'partial':'ok',partial,coverage:nationwide.coverage,quality:nationwide.quality,searchMethod:'nationwide_catalog',snapshotCollectedAt:nationwide.collectedAt,totalAvailable:found.totalAvailable,hasNext:found.hasNext,hiddenPastEvents:found.hiddenPastEvents},places:found.places.map(p=>({...p,...photoFields(p.id,undefined)}))};
  }
  const key=[env.HB_TOURAPI_KEY,env.DATA_GO_KR_KEY].find(v=>typeof v==='string'&&v.trim())?.trim();
  const types=TYPES.filter(([type,kind])=>matchesCategory({kind},filter));
  const makeResult=(records,mode,coverage,checkedAt,failures=[])=>{
    const inRange=records.filter(p=>matchesCategory(p,filter)&&distanceMeters(p,center)<=NEARBY_RADIUS);
    const hiddenPastEvents=inRange.filter(p=>pastDatedEvent(p,checkedAt?Date.parse(checkedAt):Date.now())).length;
    const valid=inRange.filter(p=>!pastDatedEvent(p,checkedAt?Date.parse(checkedAt):Date.now()));
    const distinct=[...new Map(valid.map(p=>[p.id,p])).values()];
    // A provider location search may omit known landmarks. Supplement exact ID/address/coordinates
    // from separately observed official keyword results, never fake a live result or safety.
    const supplement=[];
    if(mode==='live'&&filter!=='food'){
      for(const raw of LANDMARKS.records){
        // Per-record provenance wins (e.g. detailCommon2-observed records); default is the keyword snapshot.
        const p=normalizePlace({...raw,source:raw.source||'한국관광공사 TourAPI 키워드 조회 보강',collectedAt:raw.collectedDate||LANDMARKS.collectedDate});
        if(p&&!distinct.some(x=>x.id===p.id)&&distanceMeters(p,center)<=NEARBY_RADIUS){
          const item={...p,areaCode:REGION_CODES[p.region],subtype:raw.subtype,discoverySource:'keyword_snapshot',accessStatus:'unverified',accessFacts:[]};
          distinct.push(item);supplement.push(item.id);
        }
      }
    }
    // In the explicit all view, reserve room for every available category.
    // The default attraction view queries only types 12 and 14.
    const selected=filter==='all'
      ? [...new Map([...types.flatMap(([type,kind])=>decorateDistances(distinct.filter(p=>p.kind===kind),center,Math.floor(NEARBY_LIMIT/types.length))),...decorateDistances(distinct,center,NEARBY_LIMIT)].map(p=>[p.id,p])).values()].slice(0,NEARBY_LIMIT)
      : decorateDistances(distinct,center,NEARBY_LIMIT);
    const places=selected.sort((a,b)=>a.distanceKm-b.distanceKm||a.id.localeCompare(b.id));
    const partial=mode!=='live'||failures.length>0||coverage.some(x=>x.total==null||x.returned<x.total)||places.length<distinct.length||hiddenPastEvents>0||supplement.length>0;
    return {mode,center,radiusMeters:NEARBY_RADIUS,category:filter,count:places.length,
      source:'한국관광공사 국문 관광정보',distanceType:'straight_line',
      note:(mode==='live'?'전국 유형별 위치 조회 일부 자료':'서울·경기 저장 일부 자료')+' · 직선거리이며 실제 보행거리·경사·이동 적합 여부는 확인되지 않음',
      fetchedAt:checkedAt,meta:{dataStatus:partial?'partial':'ok',partial,sourceUpdatedAt:null,fetchedAt:checkedAt,coverage,failures,hiddenPastEvents,supplementedIds:supplement,nationwideCatalogStatus:env.HB_NATIONWIDE_CATALOG_ENABLED==='1'?'unavailable_or_stale':'not_enabled',searchMethod:mode==='live'?'locationBasedList2':'saved_snapshot'},
      places:places.map(p=>({...p,subtype:p.subtype||(p.kind==='food'?'음식점':p.kind==='culture'?'문화시설':'관광지 · 세부 유형 미확인')}))};
  };
  if(!key){
    const records=['서울','경기'].flatMap(region=>staticCatalog(region).places);
    return makeResult(records,'snapshot',[],null);
  }
  const useCache=!options.fetcher&&!options.now;
  const now=options.now||Date.now(), fetcher=options.fetcher||globalThis.fetch;
  // Cache the exact validated request center in bounded process memory only.
  const cacheKey=filter+':'+center.lat+','+center.lng;
  if(useCache&&nearbyCache.get(cacheKey)?.expires>now)return nearbyCache.get(cacheKey).value;
  if(useCache&&nearbyPending.has(cacheKey))return nearbyPending.get(cacheKey);
  if(useCache&&(now<nearbyCooldownUntil||nearbyActive+types.length>6)){
    const previous=nearbyCache.get(cacheKey);
    if(previous)return staleCopy(previous.value);
    throw new PlaceError('upstream_rate_limited',503);
  }
  const task=(async()=>{
    if(useCache)nearbyActive+=types.length;
    try{
      const checkedAt=new Date(now).toISOString();
      // Max 3 calls/uncached request, one page per selected category; no automatic expansion/retries.
      const results=await Promise.allSettled(types.map(([type,kind])=>fetchType(null,type,kind,{fetcher,key,checkedAt,center,radiusMeters:NEARBY_RADIUS})));
      const failures=[],coverage=[],records=[];
      for(let i=0;i<results.length;i++){
        const [type,kind]=types[i],r=results[i];
        if(r.status==='rejected'){
          const e=r.reason instanceof PlaceError?r.reason:new PlaceError('upstream_unavailable');
          failures.push({kind,code:e.code});
          if(useCache&&e.code==='upstream_rate_limited')nearbyCooldownUntil=Date.now()+60000;
          coverage.push({kind,total:null,returned:0});
        }else{
          const valid=r.value.places.filter(p=>distanceMeters(p,center)<=NEARBY_RADIUS);
          records.push(...valid.map(p=>attachLegacyAccessNotes(p,now)));
          coverage.push({kind,total:r.value.total,returned:valid.length});
        }
      }
      if(results.every(r=>r.status==='rejected'))throw results[0].reason;
      const result=makeResult(records,'live',coverage,checkedAt,failures);
      // A failed category must be visible, never cached as complete or as genuine empty.
      if(useCache&&failures.length===0){
        nearbyCache.set(cacheKey,{expires:now+CACHE_MS,value:result});
        while(nearbyCache.size>128)nearbyCache.delete(nearbyCache.keys().next().value);
      }
      return result;
    }finally{if(useCache)nearbyActive-=types.length;}
  })();
  if(useCache)nearbyPending.set(cacheKey,task);
  try{return await task;}
  catch(error){const previous=useCache&&nearbyCache.get(cacheKey);if(previous)return staleCopy(previous.value);throw error;}
  finally{if(useCache)nearbyPending.delete(cacheKey);}
}

const detailCache=new Map(),detailPending=new Map();
let detailActive=0,detailCooldownUntil=0;
async function resolveRoutePlace(id,region,{fetcher=globalThis.fetch,env=process.env}={}){
  if(!validId(id)||!Object.hasOwn(REGION_CODES,region))return null;
  const indexed=loadNationwideCatalog(env)?.byId(id);
  if(indexed&&indexed.areaCode===REGION_CODES[region]&&indexed.region===region&&Number.isFinite(indexed.lat)&&Number.isFinite(indexed.lng)&&!pastDatedEvent(indexed,Date.now()))return indexed;
  const key=[env.HB_TOURAPI_KEY,env.DATA_GO_KR_KEY].find(v=>typeof v==='string'&&v.trim())?.trim();
  if(!key)return null;
  const useCache=fetcher===globalThis.fetch, now=Date.now(), cacheKey=region+':'+id;
  if(useCache&&detailCache.get(cacheKey)?.expires>now)return detailCache.get(cacheKey).place;
  if(useCache&&detailPending.has(cacheKey))return detailPending.get(cacheKey);
  if(useCache&&(detailActive>=3||now<detailCooldownUntil))return null;
  const task=(async()=>{
    if(useCache)detailActive++;
    try{
      const url=new URL(BASE_URL.replace('areaBasedList2','detailCommon2'));
      for(const [k,v] of Object.entries({serviceKey:key,MobileOS:'ETC',MobileApp:'HAMKKEBOM',_type:'json',contentId:id.slice(5)}))url.searchParams.set(k,v);
      const response=await fetcher(url.toString(),{signal:AbortSignal.timeout(4000),headers:{Accept:'application/json'}});
      if(!response?.ok){
        if(useCache&&response?.status===429)detailCooldownUntil=Date.now()+60000;
        return null;
      }
      const payload=await response.json(),header=String(payload?.response?.header?.resultCode??'');
      if(header!=='0000'){
        if(useCache&&['22','23'].includes(header))detailCooldownUntil=Date.now()+60000;
        return null;
      }
      const body=payload.response.body,raw=body?.items?.item,items=Array.isArray(raw)?raw:raw&&typeof raw==='object'?[raw]:[];
      if(Number(body?.totalCount)!==1||items.length!==1||String(items[0].contentid)!==id.slice(5))return null;
      const kind=TYPES.find(([type])=>type===String(items[0].contenttypeid))?.[1];
      if(!kind)return null;
      const place=normalizeTour(items[0],kind,region,new Date(now).toISOString());
      if(!place||pastDatedEvent(place,now))return null;
      if(useCache){detailCache.set(cacheKey,{place,expires:now+CACHE_MS});while(detailCache.size>128)detailCache.delete(detailCache.keys().next().value);}
      return place;
    }catch{return null;}finally{if(useCache)detailActive--;}
  })();
  if(useCache)detailPending.set(cacheKey,task);
  try{return await task;}finally{if(useCache)detailPending.delete(cacheKey);}
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
// CDN policy for TourAPI-backed place lists. The cache key is the full URL (region or
// coordinates + category); responses hold public provider data only, nothing per user.
const CACHE_LIST='public, max-age=60, s-maxage=3600, stale-while-revalidate=86400';
const CACHE_SHORT='public, max-age=0, s-maxage=60, stale-while-revalidate=300';
function listCachePolicy(result){
  const failed=Array.isArray(result?.meta?.failures)&&result.meta.failures.length>0;
  return failed||result?.meta?.cache==='stale'?CACHE_SHORT:CACHE_LIST;
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
      const result=await enrichCatalog(await getCatalog(query.region,options),options);
      res.setHeader('Cache-Control',result.meta.accessibility?'no-store':listCachePolicy(result));
      return res.status(200).json(result);
    }
    const center=validateLocation(query);
    if(kind==='nearby'){
      const result=await nearbySearch(center,nearbyCategory(query.category),options);
      res.setHeader('Cache-Control',listCachePolicy(result));
      return res.status(200).json(result);
    }
    const {places,sources}=await allPlaces(options);
    const meta={dataStatus:sources.some(s=>s.meta.partial)?'partial':'ok',
      partial:sources.some(s=>s.meta.partial),sourceUpdatedAt:null,
      fetchedAt:sources.find(s=>s.meta.fetchedAt)?.meta.fetchedAt || null,
      coverage:sources.map(s=>({region:s.region,mode:s.mode,count:s.places.length}))};
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
  distanceMeters,validateLocation,serve,PlaceError,resolveRoutePlace,CACHE_LIST,CACHE_SHORT};
