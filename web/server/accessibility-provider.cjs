'use strict';

// Server only. Do not log request URLs or upstream exception messages.
const SOURCES = Object.freeze({
  tour: {url:'https://apis.data.go.kr/B551011/KorWithService2/detailWithTour2', sourceUrl:'https://www.data.go.kr/data/15101897/openapi.do'},
  general: {url:'https://apis.data.go.kr/B551011/KorService2/areaCode2', sourceUrl:'https://www.data.go.kr/data/15101578/openapi.do'},
  culture: {url:'https://api.odcloud.kr/api/15111386/v1/uddi:c23c2f46-bd0d-4679-bb4f-818da7c5f160', sourceUrl:'https://www.data.go.kr/data/15111386/fileData.do'},
  parking: {url:'https://api.data.go.kr/openapi/tn_pubr_prkplce_info_api', sourceUrl:'https://www.data.go.kr/data/15012896/standard.do'}
});
class ProviderError extends Error {
  constructor(code, provider) { super(code); this.name='ProviderError'; this.code=code; this.provider=provider; }
}
const idOf = v => /^\d{1,16}$/.test(String(v??'')) ? String(v) : null;
function keyOf(env) {
  const key=String(env.DATA_GO_KR_KEY||env.HB_TOURAPI_KEY||'').trim();
  if (!key) return null;
  // Support portal's encoded and decoded key without double encoding.
  try { return decodeURIComponent(key); } catch { return key; }
}
function bounded(n,min,max) {
  if (!Number.isInteger(n)||n<min||n>max) throw new RangeError('invalid_limit');
  return n;
}
function responseCode(code) {
  const c=String(code??'').padStart(2,'0');
  if (['22','23'].includes(c)) return 'quota';
  if (c==='05') return 'timeout';
  if (['20','21','30','31','32','33'].includes(c)) return 'auth';
  return 'upstream';
}
function parsePage(provider, json) {
  const fail=code=>{throw new ProviderError(code,provider);};
  let items,total;
  if (provider==='culture') {
    if (!Array.isArray(json?.data)) fail('invalid_response');
    items=json.data; total=json.totalCount;
  } else {
    const response=json?.response;
    const code=response?.header?.resultCode;
    if (code==null) fail('invalid_response');
    if (!['0','00','0000'].includes(String(code))) fail(responseCode(code));
    const body=response.body;
    if (!body||typeof body!=='object') fail('invalid_response');
    total=body.totalCount;
    const raw=body.items;
    if (Array.isArray(raw)) items=raw;
    else if (Array.isArray(raw?.item)) items=raw.item;
    else if (raw?.item && typeof raw.item==='object') items=[raw.item];
    else if ((raw===''||raw==null||Object.keys(raw).length===0) && Number(total)===0) items=[];
    else fail('invalid_response');
  }
  if (total==null||total===''||!Number.isSafeInteger(Number(total))||Number(total)<0||
      items.length>Number(total)||items.some(x=>!x||typeof x!=='object'||Array.isArray(x))) fail('invalid_response');
  return {items,totalCount:Number(total)};
}
function createAccessibilityProvider({env=process.env,fetcher=globalThis.fetch,
  now=Date.now,timeoutMs=4500,concurrency=3,maxCallsPerDay=200,
  cacheTtlMs=86400000,maxCacheEntries=512}={}) {
  bounded(concurrency,1,4); bounded(maxCallsPerDay,1,500);
  bounded(timeoutMs,100,15000); bounded(maxCacheEntries,1,2000);
  if (!Number.isFinite(cacheTtlMs)||cacheTtlMs<1000) throw new RangeError('invalid_cache_ttl');
  const cache=new Map(),pending=new Map(),counts=new Map(),queue=[];
  let active=0,day='';
  const limit=fn=>new Promise((resolve,reject)=>{
    if(queue.length>=512) return reject(new ProviderError('busy','local'));
    queue.push({fn,resolve,reject}); drain();
  });
  function drain(){
    while(active<concurrency&&queue.length){
      const job=queue.shift(); active++;
      Promise.resolve().then(job.fn).then(job.resolve,job.reject).finally(()=>{active--;drain();});
    }
  }
  async function request(provider,params,{cacheOnly=false}={}){
    const cacheKey=provider+':'+JSON.stringify(params);
    const saved=cache.get(cacheKey);
    if(saved&&saved.until>now()) return structuredClone(saved.value);
    if(saved) cache.delete(cacheKey);
    if(cacheOnly) throw new ProviderError('cache_miss',provider);
    if(pending.has(cacheKey)) return structuredClone(await pending.get(cacheKey));
    const task=limit(async()=>{
      const key=keyOf(env);
      if(!key) throw new ProviderError('not_configured',provider);
      const today=new Date(now()+9*3600000).toISOString().slice(0,10);
      if(day!==today){day=today;counts.clear();}
      const used=counts.get(provider)||0;
      if(used>=maxCallsPerDay) throw new ProviderError('budget_exhausted',provider);
      counts.set(provider,used+1);
      const url=new URL(SOURCES[provider].url);
      for(const [k,v] of Object.entries(params)) url.searchParams.set(k,String(v));
      url.searchParams.set('serviceKey',key);
      const signal=AbortSignal.timeout(timeoutMs);
      try {
        const res=await fetcher(url.toString(),{signal,redirect:'error',headers:{accept:'application/json'}});
        if(!res.ok) throw new ProviderError(res.status===429?'quota':[401,403].includes(res.status)?'auth':'upstream',provider);
        const raw=await res.text();
        if(raw.length>4_000_000) throw new ProviderError('invalid_response',provider);
        let json;
        try {json=JSON.parse(raw);} catch {
          const code=/<returnReasonCode>\s*(\d+)\s*<\/returnReasonCode>/.exec(raw)?.[1];
          throw new ProviderError(code?responseCode(code):'invalid_response',provider);
        }
        const value={...parsePage(provider,json),collectedAt:new Date(now()).toISOString()};
        cache.set(cacheKey,{value,until:now()+cacheTtlMs});
        while(cache.size>maxCacheEntries) cache.delete(cache.keys().next().value);
        return value;
      } catch(e) {
        if(e instanceof ProviderError) throw e;
        throw new ProviderError(signal.aborted?'timeout':'unavailable',provider);
      }
    });
    pending.set(cacheKey,task);
    try {return structuredClone(await task);} finally {pending.delete(cacheKey);}
  }
  const mobile={MobileOS:'ETC',MobileApp:'HAMKKEBOM',_type:'json'};
  async function getTourDetail(contentId,{cacheOnly=false}={}){
    const id=idOf(contentId);
    if(!id) throw new ProviderError('invalid_id','tour');
    const page=await request('tour',{...mobile,contentId:id,pageNo:1,numOfRows:10},{cacheOnly});
    if(page.totalCount!==page.items.length||page.items.some(x=>idOf(x.contentid??x.contentId)!==id))
      throw new ProviderError('identity_or_partial','tour');
    return page;
  }
  async function getPage(provider,{pageNo=1,pageSize=50,cacheOnly=false}={}){
    bounded(pageNo,1,10000); bounded(pageSize,1,100);
    if(provider==='culture') return request(provider,{page:pageNo,perPage:pageSize},{cacheOnly});
    if(provider==='parking') return request(provider,{pageNo,numOfRows:pageSize,type:'json'},{cacheOnly});
    if(provider==='general') return request(provider,{...mobile,pageNo,numOfRows:pageSize},{cacheOnly});
    throw new TypeError('unsupported_page_provider');
  }
  async function scan(provider,{startPage=1,maxPages=2,pageSize=50}={}){
    bounded(startPage,1,10000);bounded(maxPages,1,10);
    const pages=[];let nextPage=startPage,error=null;
    for(let i=0;i<maxPages;i++){
      try {
        const p=await getPage(provider,{pageNo:nextPage,pageSize});
        pages.push(p);
        // Even the final page must contain the number of records advertised.
        // Preserve received rows but do not report completion on truncation.
        const expected=Math.max(0,Math.min(pageSize,p.totalCount-(nextPage-1)*pageSize));
        if(p.items.length!==expected){error='partial_page';break;}
        if(nextPage*pageSize>=p.totalCount){nextPage=null;break;}
        nextPage++;
      } catch(e){error=e.code||'unavailable';break;}
    }
    return {pages,nextPage,partial:nextPage!==null,error};
  }
  return {getTourDetail,getPage,scan};
}
module.exports={SOURCES,ProviderError,createAccessibilityProvider,idOf};
