'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const provider=require('../web/server/naver-directions.cjs');
const root=path.resolve(__dirname,'..');
const files=['web/server/travel.cjs','web/assets/core-src/30-itinerary-engine-and-ui.js','tests/server_travel.test.cjs'];
const env={HB_NAVER_DIRECTIONS_ENABLED:'1',HB_NAVER_DIRECTIONS_ID:'fixture-id',HB_NAVER_DIRECTIONS_SECRET:'fixture-secret'};
const catalogPlaces=[{id:'a',name:'A',lat:37.5,lng:126.9},{id:'b',name:'B',lat:37.6,lng:127}];
const request={region:'서울',transport:'car',stopIds:['a','b']};
function loadHandoff(t){
 const server=fs.readFileSync(path.join(root,files[0]),'utf8');
 const client=fs.readFileSync(path.join(root,files[1]),'utf8');
 const module={exports:{}};
 const deps={
  './access-evidence.cjs':{normalizePlaceEvidence:()=>({accessibility:[]})},
  './place-catalog.cjs':{getCatalog:async()=>({places:catalogPlaces,mode:'fixture'}),PlaceError:class extends Error{}},
  './catalog-accessibility.cjs':{enrichCatalog:()=>assert.fail('travel-times must not trigger accessibility enrichment')},
  './naver-directions.cjs':provider
 };
 vm.runInNewContext(server,{module,require:name=>{assert.ok(Object.hasOwn(deps,name),name);return deps[name];},fetch:globalThis.fetch,Date,URL});
 const pure=client.slice(0,client.indexOf('function hbApplyScheduleFromSelection()'));
 assert.ok(pure.length>0);
 const ui=vm.runInNewContext(pure+'\n;({hbValidatePlanTravelResponse,hbPlanDistanceLabel,hbFetchPlanTravelTimes,hbPreviewPlanTravel})',{});
 return {travelTimes:module.exports.travelTimes,handler:module.exports.handler,ui,client};
}
const reply=(distance,duration=61001)=>({ok:true,status:200,json:async()=>({code:0,route:{trafast:[{summary:{distance,duration}}]}})});
const stops=[{id:'a',placeId:'a',name:'A',time:'10:00',stayMinutes:60,transitionBufferMinutes:25},{id:'b',placeId:'b',name:'B',time:'11:20',stayMinutes:60,transitionBufferMinutes:25}];
test('Integrated Agent R server distance survives API validation into the preview label',async t=>{
 const {handler,ui,client}=loadHandoff(t);
 let code,body,calls=0;
 const res={setHeader(){},status(n){code=n;return this;},json(v){body=v;}};
 await handler('travel-times',{env,fetcher:async()=>{calls++;return reply(2419);}})({method:'POST',headers:{'content-type':'application/json'},body:request},res);
 assert.equal(code,200);assert.equal(calls,1);assert.equal(body.segments[0].distanceMeters,2419);assert.equal(body.segments[0].minutes,2);
 const actual=await ui.hbFetchPlanTravelTimes(stops,{region:'서울',transport:'car'},async()=>body);
 assert.equal(actual.segments[0].distanceMeters,2419);
 assert.equal(ui.hbPlanDistanceLabel(actual.segments[0]),'자동차 경로 2.4km');
 assert.match(client,/safe\(hbPlanDistanceLabel\(leg\)\)/);
 const before=JSON.stringify(stops);ui.hbPreviewPlanTravel(stops,actual);assert.equal(JSON.stringify(stops),before);
});
test('Agent R handoff rejects invented distance and keeps unknown states / old time-only clients compatible',async t=>{
 const {travelTimes,ui}=loadHandoff(t);
 const unknown=await travelTimes(request,async()=>reply(undefined),env);
 assert.equal(unknown.status,'incomplete');assert.equal(unknown.segments[0].distanceMeters,null);assert.equal(unknown.segments[0].minutes,null);
 assert.equal(ui.hbPlanDistanceLabel(unknown.segments[0]),'');
 assert.equal((await travelTimes(request,()=>assert.fail('called'),{})).status,'provider_disabled');
 const wrong=await travelTimes({...request,stopIds:['a','missing']},()=>assert.fail('called'),env);
 assert.equal(wrong.segments[0].distanceMeters,null);
 const leg={from:'a',to:'b',status:'estimated',minutes:2,source:'naver_directions',checkedAt:new Date().toISOString()};
 assert.equal(ui.hbPlanDistanceLabel(ui.hbValidatePlanTravelResponse({status:'estimated',segments:[leg]},['a','b'])[0]),'');
 for(const distanceMeters of [-1,0,'2400',Infinity,1500001]){
  assert.throws(()=>ui.hbValidatePlanTravelResponse({status:'estimated',segments:[{...leg,distanceMeters}]},['a','b']),/invalid_distance/);
 }
 assert.throws(()=>ui.hbValidatePlanTravelResponse({status:'incomplete',segments:[{from:'a',to:'b',status:'unknown',minutes:null,distanceMeters:100}]},['a','b']),/invalid_unknown_leg/);
});
