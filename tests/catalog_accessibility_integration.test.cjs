'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createCatalogAccessibility,LIMIT}=require('../web/server/catalog-accessibility.cjs');
const {serve}=require('../web/server/place-catalog.cjs');
const {handler}=require('../web/server/travel.cjs');
const env={DATA_GO_KR_KEY:'fixture',HB_ACCESSIBILITY_ENRICHMENT_ENABLED:'1',VERCEL_ENV:'preview'};
const now=()=>Date.now();
const places=Array.from({length:12},(_,i)=>({id:'tour-'+(100+i),contentId:String(100+i),name:'fixture '+i,region:'서울',kind:['spot','culture','food'][i%3],address:'서울특별시 중구 예시로 1',lat:37.5,lng:126.9,accessFacts:[],accessStatus:'unverified'}));
const catalog={region:'서울',mode:'live',places,meta:{partial:true}};
const reply=items=>({response:{header:{resultCode:'0000'},body:{totalCount:items.length,items:{item:items}}}});
function fake(calls,{mismatch=false,fail=false}={}){
 return async url=>{
  const u=new URL(url);
  if(u.pathname.includes('detailWithTour2')){
   const id=u.searchParams.get('contentId');calls.push(id);
   const body=reply([{contentid:mismatch?'99999':id,exit:'자동문 안내',parking:'장애인 주차장 안내',wheelchair:'휠체어 대여',restroom:'정보 없음'}]);
   return {ok:!fail,status:fail?403:200,text:async()=>JSON.stringify(body)};
  }
  const type=u.searchParams.get('contentTypeId'),kind={'12':'spot','14':'culture','39':'food'}[type];
  const body=reply(places.filter(p=>p.kind===kind).map(p=>({contentid:p.contentId,title:p.name,addr1:p.address,mapy:p.lat,mapx:p.lng})));
  return {ok:true,status:200,json:async()=>body};
 };
}
function res(){return {code:null,body:null,setHeader(){},status(n){this.code=n;return this;},json(b){this.body=b;return b;}}}
test('disabled and production make zero additional upstream calls',async()=>{
 for(const e of [{...env,HB_ACCESSIBILITY_ENRICHMENT_ENABLED:''},{...env,VERCEL_ENV:'production'},{...env,DATA_GO_KR_KEY:''}]){
  const service=createCatalogAccessibility({env:e,fetcher:()=>assert.fail('unexpected fetch')});
  assert.equal(await service.enrich(catalog),catalog);
 }
});
test('six exact ID lookups, coalescing, source notes not route verification, no mutation',async()=>{
 const calls=[],service=createCatalogAccessibility({env,fetcher:fake(calls),now});
 const [a,b]=await Promise.all([service.enrich(catalog),service.enrich(catalog)]);
 assert.deepEqual(a,b);assert.equal(calls.length,LIMIT);assert.equal(a.meta.accessibility.withEvidence,LIMIT);
 assert.equal(a.meta.accessibility.notSelected,places.length-LIMIT);assert.equal(a.meta.accessibility.routeVerified,false);
 assert.ok(places.every(p=>p.accessFacts.length===0));
 const enriched=a.places.filter(p=>p.accessFacts.length);assert.equal(enriched.length,LIMIT);
 for(const p of enriched){assert.ok(!p.mobilityAssessment);assert.ok(p.accessFacts.every(f=>f.placeId===p.id&&f.status==='source_reported'&&f.verifiedAt===null));}
 await service.enrich(catalog);assert.equal(calls.length,LIMIT);
});
test('identity mismatch and auth failure remain unknown; failure cooldown',async()=>{
 for(const option of [{mismatch:true},{fail:true}]){
  const calls=[],service=createCatalogAccessibility({env,fetcher:fake(calls,option),now});
  const a=await service.enrich(catalog);assert.equal(a.meta.accessibility.withEvidence,0);
  assert.equal(a.meta.accessibility.errors,LIMIT);assert.ok(a.places.every(p=>!p.accessFacts.length));
  await service.enrich(catalog);assert.equal(calls.length,LIMIT);
 }
});
test('data and recommend handlers actually use same authoritative enrichment, not user data',async()=>{
 const calls=[],fetcher=fake(calls),a=res(),b=res();
 await serve('data',{method:'GET',query:{type:'places',region:'서울'},headers:{}},a,{env,fetcher});
 assert.equal(a.code,200);assert.equal(a.body.meta.accessibility.withEvidence,LIMIT);
 await handler('recommend',{env,fetcher})({method:'POST',headers:{'content-type':'application/json'},body:{region:'서울',date:'2099-01-01',transport:'car',tripType:'day',stairs:'impossible',walkingMinutes:15,partySize:2,mobilityAid:'wheelchair',places:[{id:'tour-evil'}]}},b);
 assert.equal(b.code,200);assert.equal(b.body.accessibility.withEvidence,LIMIT);
 assert.equal(b.body.eligible.length,0);assert.equal(b.body.needsReview.length,places.length);assert.equal(calls.length,LIMIT*2);
 assert.ok(!JSON.stringify(b.body).includes('fixture-key'));
});
