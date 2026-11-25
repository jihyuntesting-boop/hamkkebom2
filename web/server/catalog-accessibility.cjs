'use strict';
// DATA-01 / REC-03/04: bounded Preview-only enrichment of authoritative regional lists.
// No user-controlled IDs, no request on the production or disabled path.
// Process limits are not account-wide quota enforcement.
const {createAccessibilityProvider}=require('./accessibility-provider.cjs');
const {createAccessibilityEnrichment,tourIdentity}=require('./accessibility-enrichment.cjs');
const LIMIT=6;
const LABELS=Object.freeze({
 exit:'출입통로',parking:'장애인 주차 안내',restroom:'장애인 화장실 안내',
 elevator:'엘리베이터 안내',route:'대중교통 안내',publictransport:'접근로 안내',
 wheelchair:'휠체어 대여 안내',auditorium:'관람석 안내',handicapetc:'기타 편의시설 안내'
});
const instances=new WeakMap();
function enabled(env){return env.HB_ACCESSIBILITY_ENRICHMENT_ENABLED==='1'&&env.VERCEL_ENV!=='production'&&Boolean(String(env.DATA_GO_KR_KEY||env.HB_TOURAPI_KEY||'').trim());}
function select(places){
 const buckets=['spot','culture','food'].map(kind=>places.filter(p=>p.kind===kind&&tourIdentity(p)).sort((a,b)=>a.id.localeCompare(b.id)));
 const result=[];
 while(result.length<LIMIT&&buckets.some(b=>b.length)){
  for(const bucket of buckets)if(bucket.length&&result.length<LIMIT)result.push(bucket.shift());
 }
 return result;
}
function createCatalogAccessibility({env=process.env,fetcher=globalThis.fetch,now=Date.now}={}){
 const provider=createAccessibilityProvider({env,fetcher,now,timeoutMs:1800,concurrency:3,maxCallsPerDay:30,cacheTtlMs:86400000});
 const enrichment=createAccessibilityEnrichment({provider,now:()=>new Date(now())});
 const cache=new Map(),pending=new Map();
 async function enrich(catalog){
  if(!enabled(env)||catalog.mode!=='live')return catalog;
  const selected=select(catalog.places);
  const key=JSON.stringify([catalog.region,selected.map(p=>p.id)]);
  let saved=cache.get(key);
  if(!saved||saved.until<=now()){
   if(!pending.has(key)){
    const task=(async()=>{
     const result=await enrichment.enrichPlaces(selected,{refresh:true,maxPlaces:LIMIT});
     const value={data:result.data,counts:result.meta.counts};
     // Cool down failures too; a new user cannot immediately retry the upstream API.
     cache.set(key,{value,until:now()+(value.counts.errors?300000:900000)});
     while(cache.size>16)cache.delete(cache.keys().next().value);
     return value;
    })();
    pending.set(key,task);
    task.finally(()=>pending.delete(key)).catch(()=>{});
   }
   try{saved={value:await pending.get(key)};}catch{
    return {...catalog,meta:{...catalog.meta,accessibility:{status:'unavailable',partial:true,selected:selected.length,withEvidence:0}}};
   }
  }
  const byId=new Map(saved.value.data.map(row=>[row.placeId,row]));
  const places=catalog.places.map(place=>{
   const row=byId.get(place.id);
   if(!row)return place;
   const facts=row.evidence.filter(f=>f.placeId===place.id&&f.sourceId===tourIdentity(place)&&Object.hasOwn(LABELS,f.sourceField)).map(f=>({
    ...f,label:LABELS[f.sourceField],status:f.stale?'stale':'source_reported',verifiedAt:null
   }));
   // Raw official notes retain provider/ID/field/source/date. Never manufacture
   // mobilityAssessment; existing verified facts and explicit conflicts remain.
   const accessStatus=['conflicting','stale'].includes(place.accessStatus)?place.accessStatus:
    ['conflicting','stale'].includes(row.accessStatus)?row.accessStatus:
    facts.length?'info':place.accessStatus;
   return {...place,accessStatus,accessFacts:[...(place.accessFacts||[]),...facts],
    accessibilityFetchStatus:row.fetchStatus};
  });
  const counts=saved.value.counts;
  return {...catalog,places,meta:{...catalog.meta,accessibility:{status:counts.errors===selected.length&&selected.length?'unavailable':'partial',
   partial:true,selected:selected.length,total:places.length,withEvidence:counts.withEvidence,
   errors:counts.errors,empty:counts.empty,notSelected:places.length-selected.length,
   source:'한국관광공사 무장애 관광정보',routeVerified:false}}};
 }
 return {enrich};
}
async function enrichCatalog(catalog,options={}){
 const env=options.env||process.env;
 if(!enabled(env)||catalog.mode!=='live')return catalog;
 // Injected fetchers are isolated in tests; normal requests share one process cache.
 if(options.fetcher||options.now)return createCatalogAccessibility({env,fetcher:options.fetcher||globalThis.fetch,now:()=>options.now||Date.now()}).enrich(catalog);
 let service=instances.get(env);
 if(!service){service=createCatalogAccessibility({env});instances.set(env,service);}
 return service.enrich(catalog);
}
module.exports={enrichCatalog,createCatalogAccessibility,select,LIMIT};
