'use strict';
// §5 / PLAN-03 / F05-02 / F05-03: verified vs placeholder travel, origin/return
// points, home departure back-calculation and return ETA. Fixture requests only.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const script=fs.readFileSync(path.join(__dirname,'../web/assets/core-src/30-itinerary-engine-and-ui.js'),'utf8');
const pure=script.slice(0,script.indexOf('function hbApplyScheduleFromSelection()'));
const api=vm.runInNewContext(pure+'\n;({hbCreateSchedule,hbEditDraftStop,hbFetchPlanTravelTimes,hbPreviewPlanTravel,hbTravelIssueLabel,hbTravelBasis,hbTravelBasisSummary,hbTripPoint,hbTripEndpointAnchors,hbTripEndpointTimes,hbTripEndpointRequest,hbFetchTripEndpoints,hbTripEndpointLine})',{});
const {hbCreateSchedule,hbEditDraftStop,hbFetchPlanTravelTimes,hbPreviewPlanTravel,hbTravelIssueLabel,hbTravelBasis,hbTravelBasisSummary,
 hbTripPoint,hbTripEndpointAnchors,hbTripEndpointTimes,hbTripEndpointRequest,hbFetchTripEndpoints,hbTripEndpointLine}=api;
const JSONcopy=x=>JSON.parse(JSON.stringify(x));
const context={region:'서울',transport:'car'};
const now=()=>new Date().toISOString();
const stop=(id,arrival,stay=60,other={})=>({id,placeId:id,kind:'spot',name:id,plannedArrival:arrival,time:arrival,stayMinutes:stay,
 transitionBufferMinutes:25,travelTimeStatus:'unknown',done:false,must:false,reserved:false,booked:false,...other});
const home=hbTripPoint({lat:37.51234,lng:127.05678},'current_location');
const catalog=[{id:'tour-1',name:'궁궐',kind:'spot',lat:37.58,lng:126.98},{id:'tour-2',name:'박물관',kind:'spot',lat:37.52,lng:126.98},{id:'food-1',name:'식당',kind:'food',lat:37.57,lng:126.99}];

test('five configuration/provider categories have distinct, non-safety labels',()=>{
 const codes=['env_missing','env_not_injected','feature_disabled','provider_unauthorized','quota_exceeded'];
 const labels=codes.map(c=>hbTravelIssueLabel(c));
 assert.equal(new Set(labels).size,5);
 for(const label of labels)assert.doesNotMatch(label,/안전|보장/);
 assert.equal(hbTravelIssueLabel('rate_limited'),hbTravelIssueLabel('quota_exceeded'));
 assert.equal(hbTravelIssueLabel('authentication_failed'),hbTravelIssueLabel('provider_unauthorized'));
 // diagnostic wins over the coarse reason; unknown/hostile codes fall back.
 assert.equal(hbTravelIssueLabel('env_not_injected','provider_disabled'),hbTravelIssueLabel('env_not_injected'));
 assert.equal(hbTravelIssueLabel('<script>'),'이동시간을 계산하지 못했어요');
 assert.equal(hbTravelIssueLabel(),'이동시간을 계산하지 못했어요');
});

test('between-stop preview keeps diagnostic and per-leg reason, never a fake duration',async()=>{
 const items=[stop('a','10:00'),stop('b','11:30')];
 const disabled=await hbFetchPlanTravelTimes(items,context,async()=>({status:'provider_disabled',reason:'provider_disabled',diagnostic:'env_missing',segments:[]}));
 assert.equal(disabled.status,'provider_disabled');
 assert.equal(disabled.diagnostic,'env_missing');
 const limited=await hbFetchPlanTravelTimes(items,context,async()=>({status:'incomplete',segments:[
  {from:'a',to:'b',status:'unknown',minutes:null,distanceMeters:null,reason:'rate_limited',diagnostic:'quota_exceeded',source:null,checkedAt:null}]}));
 assert.equal(limited.segments[0].status,'unknown');
 assert.equal(limited.segments[0].minutes,null);
 assert.equal(limited.segments[0].diagnostic,'quota_exceeded');
 const preview=hbPreviewPlanTravel(items,limited);
 assert.equal(preview.canApply,false);
 assert.deepEqual(JSONcopy(preview.stops),JSONcopy(items));
});

test('generated draft labels every gap as placeholder until a Directions leg is applied',async()=>{
 const draft=hbCreateSchedule(['tour-1','tour-2'],catalog,{start:'10:00'});
 assert.equal(draft.errors.length,0);
 const before=hbTravelBasisSummary(draft.stops);
 assert.equal(before.verified,0);
 assert.ok(before.placeholder>=2);
 assert.equal(before.placeholderMinutes,before.placeholder*25);
 const sightIndex=draft.stops.findIndex(x=>x.placeId==='tour-2');
 assert.deepEqual(JSONcopy(hbTravelBasis(draft.stops,sightIndex)),{kind:'placeholder',minutes:25});
 const travel=await hbFetchPlanTravelTimes(draft.stops,context,async(_u,body)=>({status:'estimated',segments:[
  {from:body.stopIds[0],to:body.stopIds[1],status:'estimated',minutes:20,distanceMeters:4000,source:'naver_directions',checkedAt:now()}]}));
 const preview=hbPreviewPlanTravel(draft.stops,travel,draft.summary);
 const after=hbTravelBasisSummary(preview.stops);
 assert.equal(after.verified,1);
 assert.equal(hbTravelBasis(preview.stops,sightIndex).kind,'verified');
 assert.equal(hbTravelBasis(preview.stops,sightIndex).minutes,20);
 // First stop has no incoming gap; out-of-range index is harmless.
 assert.equal(hbTravelBasis(preview.stops,0).kind,'none');
 assert.equal(hbTravelBasis(preview.stops,99).kind,'none');
 assert.equal(hbTravelBasisSummary(null).verified,0);
});

test('verified leg on a reordered stop is reported stale, not confirmed',()=>{
 const items=[stop('a','10:00'),stop('b','11:30',60,{travelTimeStatus:'estimated',travelTimeMinutes:20,travelFromId:'x',travelToId:'b'})];
 assert.equal(hbTravelBasis(items,1).kind,'stale');
 assert.equal(hbTravelBasisSummary(items).stale,1);
});

test('trip points: rounded, Korea-bounded, label-only has no coordinates',()=>{
 assert.deepEqual(JSONcopy(home),{source:'current_location',label:'현재 위치',lat:37.512,lng:127.057});
 assert.equal(hbTripPoint({lat:35.68,lng:139.76},'current_location'),null);
 assert.equal(hbTripPoint({lat:NaN,lng:127},'place'),null);
 assert.equal(hbTripPoint({lat:37.5,lng:127},'gps'),null);
 assert.deepEqual(JSONcopy(hbTripPoint(null,'label_only','  우리   집 ')),{source:'label_only',label:'우리 집',lat:null,lng:null});
 assert.equal(hbTripPoint(null,'label_only','   '),null);
 assert.equal(hbTripPoint({lat:37.5,lng:127},'place','가'.repeat(80)).label.length,40);
});

test('anchors skip placeholders and use the end of the whole schedule',()=>{
 const items=[stop('rest-0','09:30',20,{placeId:null,isPlaceholder:true,kind:'rest'}),stop('a','10:00'),stop('b','12:00'),
  stop('rest-3','13:00',15,{placeId:null,isPlaceholder:true,kind:'rest'})];
 const anchors=hbTripEndpointAnchors(items);
 assert.equal(anchors.first.placeId,'a');
 assert.equal(anchors.first.arrival,600);
 assert.equal(anchors.last.placeId,'b');
 assert.equal(anchors.last.scheduleEnd,795);
 assert.equal(hbTripEndpointAnchors([]).first,null);
});

const legsFor=(items,state,legs)=>({...state,result:{key:hbTripEndpointTimes(items,state).key,legs}});
const est=(kind,stopId,minutes)=>({kind,stopId,status:'estimated',minutes,source:'naver_directions',checkedAt:'2026-11-26T00:00:00.000Z'});

test('home departure is back-calculated and return is added only from verified legs',()=>{
 const items=[stop('a','10:00'),stop('b','12:00',90)];
 const state=legsFor(items,{origin:home,returnMode:'same'},[est('departure','a',48),est('return','b',52)]);
 const times=hbTripEndpointTimes(items,state);
 assert.equal(times.departure.status,'estimated');
 assert.equal(times.departure.label,'09:12');
 assert.equal(times.return.label,'14:22');
 assert.match(hbTripEndpointLine('departure',times.departure,times.anchors),/집 출발 예상: 09:12 .*a 도착 시각 기준.*약 48분/);
});

test('midnight crossing: previous-day departure and next-day return',()=>{
 const items=[stop('a','00:30'),stop('b','22:30',60)];
 const state=legsFor(items,{origin:home,returnMode:'same'},[est('departure','a',50),est('return','b',45)]);
 const times=hbTripEndpointTimes(items,state);
 assert.equal(times.departure.label,'전날 23:40');
 assert.equal(times.departure.dayOffset,-1);
 assert.equal(times.return.label,'다음날 00:15');
 assert.equal(times.return.dayOffset,1);
 // Exactly midnight stays on the same calendar boundary label.
 const edge=legsFor([stop('a','01:00')],{origin:home,returnMode:'none'},[est('departure','a',60)]);
 assert.equal(hbTripEndpointTimes([stop('a','01:00')],edge).departure.label,'00:00');
});

// 2026-11-26 사용자 결정(같은 로직): 네이버 경로가 없거나 맞지 않으면 1단계와 같은 기본 예상값 25분("예상")을 쓴다.
// (이전 기대 'unchecked/stale/unknown은 25분을 쓰지 않음'을 바꾼 것. 상태 이유는 reason으로 남는다.)
test('no verified leg: unchecked, stale, unknown and label-only use the same 25-minute estimate as step 1',()=>{
 const items=[stop('a','10:00'),stop('b','12:00')];
 assert.equal(hbTripEndpointTimes(items,{}).departure.status,'no_point');
 const unchecked=hbTripEndpointTimes(items,{origin:home}).departure;
 assert.equal(unchecked.status,'default');assert.equal(unchecked.reason,'unchecked');assert.equal(unchecked.minutes,25);assert.equal(unchecked.label,'09:35');
 const state=legsFor(items,{origin:home},[est('departure','a',30),est('return','b',30)]);
 const moved={...state,origin:hbTripPoint({lat:37.6,lng:127.1},'place','지도 중심')};
 assert.equal(hbTripEndpointTimes(items,moved).departure.status,'default');
 assert.equal(hbTripEndpointTimes(items,moved).departure.reason,'stale');
 const reordered=[stop('b','10:00'),stop('a','12:00')];
 assert.equal(hbTripEndpointTimes(reordered,state).departure.reason,'stale');
 assert.equal(hbTripEndpointTimes(reordered,state).departure.minutes,25);
 const unknown=legsFor(items,{origin:home},[{kind:'departure',stopId:'a',status:'unknown',minutes:null,reason:'rate_limited',diagnostic:'quota_exceeded'},est('return','b',30)]);
 const times=hbTripEndpointTimes(items,unknown);
 assert.equal(times.departure.status,'default');
 assert.equal(times.departure.reason,'unknown');
 assert.equal(times.return.status,'estimated');assert.equal(times.return.minutes,30);
 const line=hbTripEndpointLine('departure',times.departure,times.anchors);
 assert.match(line,/09:35 .*약 25분, 예상/);
 assert.match(line,/계산하지 못해/);
 assert.match(line,/호출 한도 초과/);
 const labelOnly=hbTripEndpointTimes(items,{origin:hbTripPoint(null,'label_only','우리 집')});
 assert.equal(labelOnly.departure.status,'default');
 assert.equal(labelOnly.departure.reason,'invalid_coordinates');
 assert.equal(hbTripEndpointTimes(items,{origin:home,returnMode:'none'}).return.status,'not_requested');
 assert.equal(hbTripEndpointTimes([stop('r','10:00',20,{placeId:null,isPlaceholder:true})],{origin:home}).departure.status,'no_anchor');
 for(const status of ['no_point','unchecked','stale','not_requested','no_anchor'])
  assert.match(hbTripEndpointLine('return',{status},{}),/^귀가 도착 예상: /);
});

test('request sends only rounded user coordinates and catalog stop IDs',()=>{
 const items=[stop('a','10:00'),stop('b','12:00')];
 const other=hbTripPoint({lat:37.4,lng:127.2},'place','지도 중심');
 const r=hbTripEndpointRequest(items,context,{origin:home,returnMode:'other',returnTo:other});
 assert.deepEqual(JSONcopy(r.body),{region:'서울',transport:'car',origin:{lat:37.512,lng:127.057},firstStopId:'a',returnTo:{lat:37.4,lng:127.2},lastStopId:'b'});
 assert.equal(hbTripEndpointRequest(items,{region:'서울',transport:'public_transit'},{origin:home}).skip,'unsupported_mode');
 assert.equal(hbTripEndpointRequest(items,{region:'부산',transport:'car'},{origin:home}).skip,'invalid_context');
 assert.equal(hbTripEndpointRequest(items,context,{}).skip,'no_point');
 assert.equal(hbTripEndpointRequest(items,context,{origin:hbTripPoint(null,'label_only','집')}).skip,'no_point');
 const departureOnly=hbTripEndpointRequest(items,context,{origin:home,returnMode:'none'});
 assert.equal(departureOnly.body.returnTo,undefined);
});

test('fetch: success, provider categories, network and malformed responses',async()=>{
 const items=[stop('a','10:00'),stop('b','12:00')];
 const state={origin:home,returnMode:'same'};
 let sent=null;
 const ok=await hbFetchTripEndpoints(items,context,state,async(url,body)=>{sent=[url,body];return {status:'estimated',legs:[
  {kind:'departure',stopId:'a',status:'estimated',minutes:40,distanceMeters:9000,source:'naver_directions',checkedAt:now()},
  {kind:'return',stopId:'b',status:'estimated',minutes:35,distanceMeters:8000,source:'naver_directions',checkedAt:now()}]}});
 assert.equal(sent[0],'/api/trip-endpoints');
 assert.equal(ok.status,'estimated');
 assert.equal(ok.key,hbTripEndpointTimes(items,state).key);
 const stored=hbTripEndpointTimes(items,{...state,result:{key:ok.key,legs:ok.legs}});
 assert.equal(stored.departure.label,'09:20');
 assert.equal(stored.return.label,'13:35');

 for(const diagnostic of ['env_missing','env_not_injected','feature_disabled']){
  const r=await hbFetchTripEndpoints(items,context,state,async()=>({status:'provider_disabled',reason:'provider_disabled',diagnostic,legs:[]}));
  assert.equal(r.status,'provider_disabled');
  assert.equal(r.diagnostic,diagnostic);
  assert.equal(r.key,undefined);
 }
 const quota=await hbFetchTripEndpoints(items,context,state,async()=>({status:'incomplete',legs:[
  {kind:'departure',stopId:'a',status:'unknown',minutes:null,source:null,reason:'rate_limited',diagnostic:'quota_exceeded'},
  {kind:'return',stopId:'b',status:'unknown',minutes:null,source:null,reason:'authentication_failed',diagnostic:'provider_unauthorized'}]}));
 assert.equal(quota.status,'incomplete');
 assert.deepEqual(JSONcopy(quota.legs.map(l=>l.diagnostic)),['quota_exceeded','provider_unauthorized']);
 assert.equal((await hbFetchTripEndpoints(items,context,state,async()=>{throw Error('offline')})).status,'network_error');
 const bad=[
  {status:'estimated',legs:[]},
  {status:'estimated',legs:[{kind:'return',stopId:'b',status:'estimated',minutes:3,source:'naver_directions',checkedAt:now()},{kind:'departure',stopId:'a',status:'estimated',minutes:3,source:'naver_directions',checkedAt:now()}]},
  {status:'estimated',legs:[{kind:'departure',stopId:'a',status:'estimated',minutes:0,source:'naver_directions',checkedAt:now()},{kind:'return',stopId:'b',status:'estimated',minutes:3,source:'naver_directions',checkedAt:now()}]},
  {status:'estimated',legs:[{kind:'departure',stopId:'a',status:'estimated',minutes:25,source:'placeholder',checkedAt:now()},{kind:'return',stopId:'b',status:'estimated',minutes:3,source:'naver_directions',checkedAt:now()}]},
  {status:'estimated',legs:[{kind:'departure',stopId:'a',status:'unknown',minutes:25,source:null},{kind:'return',stopId:'b',status:'estimated',minutes:3,source:'naver_directions',checkedAt:now()}]},
  {status:'estimated',legs:[{kind:'departure',stopId:'a',status:'unknown',minutes:null,source:null},{kind:'return',stopId:'b',status:'estimated',minutes:3,source:'naver_directions',checkedAt:now()}]},
  null
 ];
 for(const payload of bad)assert.equal((await hbFetchTripEndpoints(items,context,state,async()=>payload)).status,'invalid_response',JSON.stringify(payload));
 let called=0;
 const skipped=await hbFetchTripEndpoints(items,context,{},async()=>{called++});
 assert.equal(skipped.status,'no_point');
 assert.equal(called,0);
});
