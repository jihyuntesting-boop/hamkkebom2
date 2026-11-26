'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createAccessibilityProvider}=require('../web/server/accessibility-provider.cjs');
const {createAccessibilityEnrichment,tourEvidence,independentRecords,combine,tourIdentity}=require('../web/server/accessibility-enrichment.cjs');
const now=()=>new Date('2026-11-24T05:00:00Z');
const collectedAt=now().toISOString();
const seo={id:'tour-3432213',contentId:'3432213',region:'서울'};
const gye={id:'tour-3428221',contentId:'3428221',region:'경기'};
const page=(items)=>({items,totalCount:items.length,collectedAt});
const envelope=(items,totalCount=items.length)=>({response:{header:{resultCode:'0000'},body:{totalCount,items:{item:items}}}});
const reply=(body,status=200)=>({ok:status===200,status,text:async()=>typeof body==='string'?body:JSON.stringify(body)});
function client(fetcher,extra={}){return createAccessibilityProvider({env:{DATA_GO_KR_KEY:'test%2Bkey'},fetcher,now:()=>+now(),...extra});}
test('correct dedicated endpoint and ID; cached, coalesced and cache-only',async()=>{
  let calls=0;
  const p=client(async url=>{calls++;const u=new URL(url);assert.equal(u.pathname,'/B551011/KorWithService2/detailWithTour2');assert.equal(u.searchParams.get('contentId'),seo.contentId);assert.equal(u.searchParams.get('serviceKey'),'test+key');return reply(envelope([{contentid:seo.contentId,exit:'자동문'}]));});
  const [a,b]=await Promise.all([p.getTourDetail(seo.contentId),p.getTourDetail(seo.contentId)]);
  assert.deepEqual(a,b);await p.getTourDetail(seo.contentId,{cacheOnly:true});assert.equal(calls,1);
  await assert.rejects(p.getTourDetail(gye.contentId,{cacheOnly:true}),{code:'cache_miss'});
});
test('reject mismatched ID and partial detail response',async()=>{
  await assert.rejects(client(async()=>reply(envelope([{contentid:gye.contentId}]))).getTourDetail(seo.contentId),{code:'identity_or_partial'});
  await assert.rejects(client(async()=>reply(envelope([{contentid:seo.contentId}],2))).getTourDetail(seo.contentId),{code:'identity_or_partial'});
});
test('empty versus quota/auth/malformed/transport without leaked key',async()=>{
  assert.equal((await client(async()=>reply(envelope([]))).getTourDetail(seo.contentId)).totalCount,0);
  for(const [response,code] of [[reply({},429),'quota'],[reply({},403),'auth'],[reply({response:{header:{resultCode:'30'}}}),'auth'],[reply('<returnReasonCode>22</returnReasonCode>'),'quota'],[reply({}),'invalid_response']])
    await assert.rejects(client(async()=>response).getTourDetail(seo.contentId),{code});
  await assert.rejects(client(async()=>{throw new Error('test+key');}).getTourDetail(seo.contentId),e=>e.code==='unavailable'&&!e.message.includes('test+key'));
});
test('timeout and per-instance daily quota',async()=>{
  const p=client(async(_url,{signal})=>new Promise((_r,reject)=>signal.addEventListener('abort',()=>reject(new Error('timeout')))),{timeoutMs:100});
  // AbortSignal.timeout uses an unref timer; keep the event loop alive in this test.
  const timer=setTimeout(()=>{},200);
  try{await assert.rejects(p.getTourDetail(seo.contentId),{code:'timeout'});}finally{clearTimeout(timer);}
  const q=client(async()=>reply(envelope([])),{maxCallsPerDay:1});
  await q.getTourDetail(seo.contentId);
  await assert.rejects(q.getTourDetail(gye.contentId),{code:'budget_exhausted'});
});
test('independent provider pagination and partial failure',async()=>{
  const p=client(async url=>{const u=new URL(url);if(u.hostname==='api.odcloud.kr')return reply({data:[{'시설명':'예시'}],totalCount:2});return reply({},503);});
  const r=await p.scan('culture',{pageSize:1,maxPages:1});assert.equal(r.nextPage,2);assert.equal(r.partial,true);
  const e=await p.scan('parking');assert.equal(e.error,'upstream');assert.equal(e.partial,true);
});
test('Seoul and Gyeonggi fixture identity; free text remains reported only',()=>{
  assert.equal(tourIdentity({...seo,providerPlaceId:gye.contentId}),null);
  for(const place of [seo,gye]){
    const records=tourEvidence(place,page([{contentid:place.contentId,exit:'자동문',parking:'장애인 주차장 있음',wheelchair:'대여 가능',route:'계단 3개',restroom:'정보없음'}]),{now:now()});
    const dto=combine(place,records,{now:now()});
    assert.equal(records.length,4);assert.equal(dto.attributes.stairs.status,'unknown');
    assert.equal(dto.attributes.stairCount.value,null);assert.equal(dto.attributes.wheelchairEntrance.value,null);
    assert.equal(dto.attributes.stepFreeEntrance.value,null);assert.equal(dto.routeStatus,'unknown');
    assert.ok(dto.accessFacts.every(f=>f.status==='unknown'&&f.verifiedAt===null));
    assert.ok(records.every(f=>f.sourceId===place.contentId&&f.placeId===place.id));
  }
});
test('stale source date and existing same-scope contradictory evidence',()=>{
  const r=tourEvidence(seo,page([{contentid:seo.contentId,exit:'자동문',modifiedtime:'20221125000000'}]),{now:now()});
  assert.equal(combine(seo,r,{now:now()}).attributes.stepFreeEntrance.status,'stale');
  const base={attribute:'stairs',scope:'main_entrance',sourceUrl:'https://example.org',collectedAt,sourceType:'public_api',status:'source_reported',evidenceGrade:'official_reported'};
  const d=combine({...seo,accessFacts:[{...base,value:true},{...base,value:false}]},[],{now:now()});
  assert.equal(d.accessStatus,'conflicting');assert.equal(d.routeStatus,'unknown');
});
test('culture and parking records independent; wheelchair rental not entry; Y/N explicit only',()=>{
  const c=independentRecords('culture',page([{'시설명':'예시','도로명주소':'서울 예시로 1','장애인용 출입문':'Y','휠체어 대여 가능 여부':'Y','장애인 화장실 유무':'N','최종작성일':'2022-11-25'}]),{now:now()})[0];
  assert.equal(c.sourceId,null);assert.equal(c.matchStatus,'unmatched');assert.equal(c.placeId,null);assert.equal(c.evidence[0].detail,null);
  const p=independentRecords('parking',page([{prkplceNo:'123',prkplceNm:'예시',pwdbsPpkZoneYn:'N'}]),{now:now()})[0];
  assert.equal(p.evidence[0].value,false);assert.equal(p.evidence[0].scope,'parking_lot');assert.equal(p.placeId,null);
});
test('normal request is cache-only; explicit refresh bounded; partial and coverage honest',async()=>{
  const calls=[];
  const service=createAccessibilityEnrichment({now,provider:{async getTourDetail(id,opts){calls.push(opts.cacheOnly);if(opts.cacheOnly)throw Object.assign(new Error(),{code:'cache_miss'});return page([{contentid:id,exit:'자동문'}]);}}});
  const a=await service.enrichPlaces([seo,gye]);assert.deepEqual(calls,[true,true]);assert.equal(a.meta.partial,true);
  const b=await service.enrichPlaces([seo,gye,seo],{refresh:true,maxPlaces:1});
  assert.equal(b.meta.counts.withEvidence,1);assert.equal(b.meta.counts.eligible,2);assert.equal(b.meta.counts.coverage,0.5);assert.equal(b.data[1].fetchStatus,'deferred');
});

test('final page truncation is partial, and a complete short final page is valid',async()=>{
  const providerFor=finalRows=>client(async url=>{
    const pageNo=Number(new URL(url).searchParams.get('page'));
    return reply({data:Array.from({length:pageNo===1?2:finalRows},(_,i)=>({'시설명':'fixture-'+pageNo+'-'+i})),totalCount:3});
  });
  const incomplete=await providerFor(0).scan('culture',{pageSize:2,maxPages:2});
  assert.equal(incomplete.partial,true);
  assert.equal(incomplete.error,'partial_page');
  assert.equal(incomplete.nextPage,2);
  assert.equal(incomplete.pages.flatMap(p=>p.items).length,2);
  const complete=await providerFor(1).scan('culture',{pageSize:2,maxPages:2});
  assert.equal(complete.partial,false);
  assert.equal(complete.nextPage,null);
  assert.equal(complete.error,null);
  assert.equal(complete.pages.flatMap(p=>p.items).length,3);
});
