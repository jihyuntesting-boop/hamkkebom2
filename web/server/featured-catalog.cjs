'use strict';
// Agent N: curated IDs, independently fetched by TourAPI detailCommon2.
const {listPhotoFields,photoFields}=require('./tour-official-image.cjs');
const SOURCE = 'https://www.data.go.kr/data/15101578/openapi.do';
const ENDPOINT = 'https://apis.data.go.kr/B551011/KorService2/detailCommon2';
const RADIUS_KM = 42;
const TTL = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 2000;
// Candidate IDs only, not live-verified records. See Agent N progress for provenance.
// Geographic bounds are sanity checks, not stored/displayed location estimates.
const CANDIDATES = [
  ['126508','경복궁','서울','종로구','12',[37.55,37.61,126.94,127.01],'사직로 161'],
  ['126537','북촌한옥마을','서울','종로구','12',[37.55,37.61,126.95,127.03],'계동길 37'],
  ['126535','남산서울타워','서울','용산구','12',[37.53,37.57,126.96,127.02],'남산공원길 105'],
  ['2470006','동대문디자인플라자(DDP)','서울','중구','12|14',[37.54,37.59,126.98,127.04],'을지로 281'],
  ['129703','국립중앙박물관','서울','용산구','14',[37.49,37.55,126.95,127.01],'서빙고로 137'],
  ['128611','서울숲','서울','성동구','12',[37.52,37.57,127.01,127.07],'뚝섬로 273'],
  ['126532','올림픽공원','서울','송파구','12',[37.49,37.55,127.09,127.15],'올림픽로 424'],
  ['2649975','광명동굴','경기','광명시','12',[37.40,37.45,126.84,126.89],'가학로85번길 142'],
  ['125555','수원 화성','경기','수원시','12',[37.25,37.33,126.98,127.06],'영화동 320-2'],
  ['125449','남한산성도립공원','경기','광주시','12',[37.45,37.51,127.15,127.22],'남한산성로 731']
].map(([id,title,region,district,type,bounds,street])=>({id,title,region,district,type,bounds,street}));
const ERROR = {upstream_unauthorized:502,upstream_rate_limited:503,upstream_timeout:504,
  upstream_unavailable:502,upstream_invalid_response:502,upstream_invalid_schema:502,
  upstream_identity_mismatch:502,upstream_error:502,missing_api_key:503};
function failure(code,upstreamStatus){return Object.assign(new Error(code),{code,status:ERROR[code]||502,upstreamStatus});}
function providerError(code){
  const c=String(Number(code)).padStart(2,'0');
  if(['20','29','30','31','32','33'].includes(c))return failure('upstream_unauthorized',401);
  if(['22','23'].includes(c))return failure('upstream_rate_limited',429);
  if(c==='05')return failure('upstream_timeout');
  return failure('upstream_error');
}
function httpError(status){
  if(status===401||status===403)return failure('upstream_unauthorized',status);
  if(status===429)return failure('upstream_rate_limited',status);
  if(status===408||status===504)return failure('upstream_timeout',status);
  return failure('upstream_unavailable',status);
}
function number(value,min,max){
  if(!['number','string'].includes(typeof value)||!String(value).trim()||String(value).length>40)return null;
  const n=Number(value);return Number.isFinite(n)&&n>=min&&n<=max?n:null;
}
function canonicalTitle(value){return typeof value==='string'?value.trim().replace(/\s+/g,'').replace(/\[유네스코세계(?:문화)?유산\]$/,''):'';}
function normalize(item,c,checkedAt){
  const address=typeof item?.addr1==='string'?item.addr1.trim():'';
  const [minLat,maxLat,minLng,maxLng]=c.bounds;
  const lat=number(item?.mapy,minLat,maxLat),lng=number(item?.mapx,minLng,maxLng);
  const prefix=c.region==='서울'?/^서울(?:특별시|\s)/:/^경기(?:도|\s)/;
  const area=c.region==='서울'?'1':'31',legalArea=c.region==='서울'?'11':'41';
  const legal=String(item?.lDongRegnCd??'').trim();
  const oldArea=String(item?.areacode??'').trim();
  if(String(item?.contentid)!==c.id||canonicalTitle(item?.title)!==canonicalTitle(c.title)||
    !c.type.split('|').includes(String(item?.contenttypeid))||!prefix.test(address)||!address.includes(c.district)||
    !address.replace(/\s+/g,'').includes(c.street.replace(/\s+/g,''))||
    address.length>400||item.title.length>180||lat===null||lng===null||
    (legal?legal!==legalArea:oldArea&&oldArea!==area))throw failure('upstream_identity_mismatch');
  const updated=String(item.modifiedtime||'');
  return {id:'tour-'+c.id,contentId:c.id,name:item.title.trim(),address,lat,lng,region:c.region,
    kind:String(item.contenttypeid)==='14'?'culture':'spot',matched:true,accessStatus:'unverified',accessFacts:[],
    source:'한국관광공사 국문 관광정보 TourAPI',sourceUrl:SOURCE,collectedAt:checkedAt,
    sourceUpdatedAt:/^\d{8}(?:\d{6})?$/.test(updated)?updated.slice(0,4)+'-'+updated.slice(4,6)+'-'+updated.slice(6,8):null,
    imageIdentifier:c.id,imageUrl:null,featured:true,dataMode:'live',...listPhotoFields(item,c.id)};
}
function resolveKey(env){
  const raw=[env.HB_TOURAPI_KEY,env.DATA_GO_KR_KEY].find(v=>typeof v==='string'&&v.trim());
  if(!raw)throw failure('missing_api_key');
  try{return decodeURIComponent(raw.trim());}catch{return raw.trim();}
}
async function detail(c,fetcher,key,checkedAt,timeoutMs){
  const url=new URL(ENDPOINT);
  for(const [k,v] of Object.entries({serviceKey:key,MobileOS:'ETC',MobileApp:'HAMKKEBOM',_type:'json',contentId:c.id}))url.searchParams.set(k,v);
  let timer;const controller=new AbortController();
  try{
    return await Promise.race([(async()=>{
      const res=await fetcher(url.toString(),{signal:controller.signal,headers:{Accept:'application/json'}});
      if(!res||typeof res.ok!=='boolean')throw failure('upstream_invalid_response');
      if(!res.ok)throw httpError(res.status);
      let data;
      if(typeof res.text==='function'){
        const body=await res.text();
        try{data=JSON.parse(body);}catch{
          const xml=body.match(/<(?:returnReasonCode|resultCode)>\s*(\d{1,4})\s*<\//i);
          if(xml){if(Number(xml[1])===3)return null;throw providerError(xml[1]);}
          throw failure('upstream_invalid_response');
        }
      }else if(typeof res.json==='function'){
        try{data=await res.json();}catch{throw failure('upstream_invalid_response');}
      }else throw failure('upstream_invalid_response');
      const gateway=data?.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnReasonCode;
      const code=data?.response?.header?.resultCode??gateway;
      if(code==null)throw failure('upstream_invalid_schema');
      if(['03','3','0003'].includes(String(code)))return null;
      if(!['0000','00','0'].includes(String(code)))throw providerError(code);
      const body=data?.response?.body;
      const total=number(body?.totalCount,0,1);
      if(total===null||!Number.isInteger(total))throw failure('upstream_invalid_schema');
      const raw=body?.items?.item;
      const items=raw==null||raw===''?[]:Array.isArray(raw)?raw:[raw];
      if(items.length!==total)throw failure('upstream_invalid_schema');
      return total===0?null:normalize(items[0],c,checkedAt);
    })(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(failure('upstream_timeout'));},timeoutMs);})]);
  }catch(e){
    if(e&&Object.hasOwn(ERROR,e.code))throw e;
    throw failure(e?.name==='AbortError'||e?.name==='TimeoutError'?'upstream_timeout':'upstream_unavailable');
  }finally{clearTimeout(timer);}
}
function distance(a,b){const r=Math.PI/180,dlat=(a.lat-b.lat)*r,dlng=(a.lng-b.lng)*r;
  const h=Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlng/2)**2;
  return 6371*2*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));}
// Saved fallback (web/catalog/featured-snapshot.v1.json): served when TourAPI fails or hits its
// quota, so the editorial list never disappears. Each record passes the same identity checks as
// a live row; a record that fails them is dropped, never shown.
function loadSnapshot(data){
  if(data?.schemaVersion!==1||!Array.isArray(data.records)||typeof data.checkedAt!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(data.checkedAt))return new Map();
  const checkedAt=data.checkedAt+'T00:00:00+09:00',byId=new Map();
  for(const r of data.records){
    const c=CANDIDATES.find(x=>x.id===r?.contentId);
    if(!c||byId.has(c.id))continue;
    const item={contentid:r.contentId,title:r.name,contenttypeid:r.contentTypeId,addr1:r.address,mapy:r.lat,mapx:r.lng,
      firstimage:typeof r.officialImageUrl==='string'?r.officialImageUrl:''};
    try{
      const place=normalize(item,c,checkedAt);
      // No saved image URL means "not known", not "confirmed without a photo".
      byId.set(c.id,{...place,...(item.firstimage?{}:photoFields('tour-'+c.id,undefined)),source:'한국관광공사 국문 관광정보 TourAPI (저장 자료)',dataMode:'snapshot',snapshotVersion:String(data.catalogVersion||''),collectedAt:checkedAt});
    }catch{/* identity mismatch: omit */}
  }
  return byId;
}
const SNAPSHOT=loadSnapshot(require('../catalog/featured-snapshot.v1.json'));
// Transient provider failures fall back to the snapshot. A live identity mismatch does not:
// the provider then says something different from our saved record.
const SNAPSHOT_FALLBACK=new Set(['upstream_unauthorized','upstream_rate_limited','upstream_timeout','upstream_unavailable',
  'upstream_invalid_response','upstream_invalid_schema','upstream_error','missing_api_key']);
const QUOTA_COOLDOWN=10*60*1000,ERROR_COOLDOWN=2*60*1000;
function createCatalog({fetcher=globalThis.fetch,env=process.env,now=Date.now,timeoutMs=TIMEOUT_MS,snapshot=SNAPSHOT}={}){
  // Memory keeps successes only. A failed refresh never replaces an earlier live place.
  const live=new Map(),missing=new Set(),lastErrors=new Map();
  let freshUntil=0,cooldownUntil=0,fetchedAt=null,inFlight=null;
  async function refresh(key){
    const checkedAt=new Date(now()).toISOString();let cursor=0,halt=null;
    const results=Array(CANDIDATES.length);
    async function worker(){while(!halt&&cursor<CANDIDATES.length){const i=cursor++,c=CANDIDATES[i];
      try{const place=await detail(c,fetcher,key,checkedAt,timeoutMs);results[i]=place?{place}:{missing:true};}
      catch(e){results[i]={error:e};if(['upstream_unauthorized','upstream_rate_limited'].includes(e.code))halt=e;}
    }}
    await Promise.all([worker(),worker(),worker()]);
    let failed=0;
    CANDIDATES.forEach((c,i)=>{const r=results[i]||{error:halt,skipped:true};
      if(r.place){live.set(c.id,r.place);missing.delete(c.id);lastErrors.delete(c.id);}
      else if(r.missing){live.delete(c.id);missing.add(c.id);lastErrors.delete(c.id);}
      else{failed++;lastErrors.set(c.id,{error:r.error,skipped:!!r.skipped});}
    });
    fetchedAt=checkedAt;
    if(!failed)freshUntil=now()+TTL;
    // Bound repeated failing refreshes under Hobby quotas; serve memory/snapshot meanwhile.
    else cooldownUntil=now()+(halt?QUOTA_COOLDOWN:ERROR_COOLDOWN);
  }
  async function load(){
    let key=null,keyError=null;
    try{key=resolveKey(env);}catch(e){keyError=e;}
    if(key&&now()>=freshUntil&&now()>=cooldownUntil){
      // A deployment has one server key; one shared refresh across map centers.
      if(!inFlight)inFlight=refresh(key).finally(()=>{inFlight=null;});
      await inFlight;
    }
    return CANDIDATES.map(c=>{
      if(live.has(c.id))return {place:live.get(c.id)};
      if(missing.has(c.id))return {missing:true};
      const row=keyError?{error:keyError,skipped:false}:lastErrors.get(c.id)||{error:failure('upstream_unavailable'),skipped:true};
      if(snapshot?.has(c.id)&&SNAPSHOT_FALLBACK.has(row.error?.code))return {place:snapshot.get(c.id),fallback:row.error.code};
      return row;
    });
  }
  return async function get(query){
    const lat=number(query.lat,-90,90),lng=number(query.lng,-180,180);
    if(lat===null||lng===null)throw Object.assign(new Error('invalid_coordinates'),{code:'invalid_coordinates',status:400});
    if(query.region!==undefined&&!['서울','경기'].includes(query.region))throw Object.assign(new Error('invalid_region'),{code:'invalid_region',status:400});
    const center={lat,lng};const results=await load();
    const relevant=results.map((result,i)=>({...result,candidate:CANDIDATES[i]})).filter(r=>!query.region||r.candidate.region===query.region);
    const failed=relevant.filter(r=>r.error),missingRows=relevant.filter(r=>r.missing);
    const valid=relevant.filter(r=>r.place),fallback=valid.filter(r=>r.fallback);
    const places=valid.map(r=>({place:r.place,km:distance(center,r.place)})).filter(r=>r.km<=RADIUS_KM)
      .sort((a,b)=>a.km-b.km||a.place.id.localeCompare(b.place.id)).slice(0,10)
      .map(r=>({...r.place,distanceKm:Math.round(r.km*10)/10,distanceType:'straight_line',drivingDistanceKm:null}));
    // Never return a seemingly normal empty list when a selected lookup failed.
    if(!places.length&&failed.length){const priorities=['upstream_rate_limited','upstream_unauthorized','upstream_timeout'];
      throw priorities.map(code=>failed.find(r=>r.error.code===code)?.error).find(Boolean)||failed[0].error;}
    const partial=failed.length>0||missingRows.length>0;
    const mode=valid.length&&fallback.length===valid.length?'snapshot':'live';
    return {mode,source:'한국관광공사 TourAPI',selection:'editorial-shortlist-confirmed-exact-title',
      note:'편집 선정 목록이며 공식 인기순위 아님. 직선거리이며 자동차 이동거리는 미확인.',
      radiusKm:RADIUS_KM,requested:relevant.length,validated:places.length,failedQueries:failed.filter(r=>!r.skipped).length,
      center,distanceType:'straight_line',meta:{dataStatus:partial?'partial':'ok',partial,sourceUpdatedAt:null,fetchedAt,
        coverage:['서울','경기'].filter(r=>!query.region||r===query.region).map(region=>({region,mode,count:valid.filter(r=>r.candidate.region===region).length})),
        selectionCoverage:'curated_content_ids',resolved:valid.length,skippedQueries:failed.filter(r=>r.skipped).length,missingIds:missingRows.map(r=>'tour-'+r.candidate.id),
        failures:failed.map(r=>({id:'tour-'+r.candidate.id,code:r.error.code,skipped:!!r.skipped})),
        fallback:fallback.length?{source:'featured_snapshot',ids:fallback.map(r=>'tour-'+r.candidate.id),reason:fallback[0].fallback}:null,
        emptyReason:places.length?null:valid.length?'outside_radius':'no_data'},places};
  };
}
// CDN policy: live editorial list 1 day (+7 days stale while revalidating). Snapshot-backed
// answers stay short so live data replaces them soon. Errors are never stored.
const CACHE_LIVE='public, max-age=300, s-maxage=86400, stale-while-revalidate=604800';
const CACHE_FALLBACK='public, max-age=60, s-maxage=600, stale-while-revalidate=3600';
const getFeatured=createCatalog();const traffic=new Map();
async function serve(req,res,get=getFeatured){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'method_not_allowed'});}
  try{
    const ip=String(req.headers?.['x-real-ip']||req.headers?.['x-forwarded-for']||'anonymous').split(',')[0].slice(0,70);
    const now=Date.now();let hit=traffic.get(ip);if(!hit||hit.until<=now)hit={count:0,until:now+60000};
    if(traffic.size>=2048&&!traffic.has(ip))traffic.delete(traffic.keys().next().value);
    traffic.set(ip,hit);if(++hit.count>90)return res.status(429).json({error:'rate_limited'});
    const query=req.query&&Object.keys(req.query).length?req.query:Object.fromEntries(new URL(req.url||'/','https://localhost').searchParams);
    const body=await get(query);
    res.setHeader('Cache-Control',body.meta?.fallback||body.meta?.partial?CACHE_FALLBACK:CACHE_LIVE);
    return res.status(200).json(body);
  }catch(e){const code=['invalid_coordinates','invalid_region'].includes(e?.code)||Object.hasOwn(ERROR,e?.code)?e.code:'upstream_unavailable';
    const status=code.startsWith('invalid_')?400:ERROR[code];
    res.setHeader('Cache-Control','no-store');
    return res.status(status).json({error:code,...(Number.isInteger(e?.upstreamStatus)?{upstreamStatus:e.upstreamStatus}:{})});}
}
module.exports={createCatalog,serve,CANDIDATES,SNAPSHOT,CACHE_LIVE,CACHE_FALLBACK};
