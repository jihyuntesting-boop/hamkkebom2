'use strict';
// Bug: "자동차 이동시간 확인 및 변경안 보기" showed only "이 교통수단은 지원하지 않아요"
// (transit/mixed) or a one-line disabled message (production: provider_disabled).
// The button now always yields a visible result; non-car modes get guidance instead.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../web/assets/core-src/30-itinerary-engine-and-ui.js'),'utf8');
const c=vm.createContext({});
vm.runInContext(source.slice(0,source.indexOf('function hbApplyScheduleFromSelection(){')),c);
const J=x=>JSON.parse(JSON.stringify(x));
const places=[{id:'tour-1',name:'궁궐',kind:'spot'},{id:'tour-2',name:'박물관',kind:'spot'},{id:'food-1',name:'식당',kind:'food'}];
const draft=()=>c.hbCreateSchedule(['tour-1','tour-2','food-1'],places,{start:'10:00'}).stops;
const banned=/지원하지 않|미지원|미확인|확인되지 않/;

test('route mode: car shows the estimate button, transit/mixed get guidance',()=>{
 assert.deepEqual(J(c.hbRouteMode({})),{kind:'car',transport:'car'});
 assert.deepEqual(J(c.hbRouteMode({hbTransport:'car',hbPlanInfo:{transport:'transit'}})),{kind:'car',transport:'car'});
 assert.equal(c.hbRouteMode({hbTransport:'transit'}).label,'대중교통');
 assert.equal(c.hbRouteMode({hbTransport:'mixed'}).label,'상황에 따라 선택');
 assert.equal(c.hbRouteMode({hbPlanInfo:{transport:'mixed'}}).kind,'guide');
});

test('non-car never calls the API (car ETA is not applied to transit)',async()=>{
 let calls=0;
 const r=await c.hbFetchPlanTravelTimes(draft(),{region:'서울',transport:'public_transit'},async()=>{calls++});
 assert.equal(r.status,'unsupported_mode');assert.equal(calls,0);
});

test('every failure status produces a visible per-leg result with a reason, never empty',async()=>{
 const items=draft();
 const cases=[
  [async()=>({status:'provider_disabled',reason:'provider_disabled',diagnostic:'env_missing',segments:[]}),'설정 미등록'],
  [async()=>({status:'provider_disabled',reason:'missing_credentials',diagnostic:'env_not_injected',segments:[]}),'설정 일부 누락'],
  [async()=>({status:'provider_disabled',reason:'provider_disabled',diagnostic:'feature_disabled',segments:[]}),'기능 꺼짐'],
  [async()=>{throw Error('502')},'네트워크 문제'],
  [async()=>({status:'estimated',segments:'bad'}),'응답 형식 오류']
 ];
 for(const [request,reason] of cases){
  const travel=await c.hbFetchPlanTravelTimes(items,{region:'서울',transport:'car'},request);
  assert.ok(!['estimated','incomplete'].includes(travel.status));
  const view=c.hbRouteFallbackView(items,travel);
  assert.ok(view.notice.includes('예상 이동시간으로 보여 드려요'),view.notice);
  assert.ok(view.notice.includes(reason),view.notice);
  assert.doesNotMatch(view.notice,banned);
  assert.ok(view.rows.length>=1);
  assert.ok(view.rows.every(row=>row.text&&row.from&&row.to));
  assert.ok(view.rows.some(row=>row.text==='약 25분 (예상)'));
 }
});

test('provider 401/403 and 429 legs are shown as expected travel with their reason',async()=>{
 const items=draft();
 const travel=await c.hbFetchPlanTravelTimes(items,{region:'서울',transport:'car'},async(_u,body)=>({status:'incomplete',segments:
  body.stopIds.slice(1).map((to,i)=>({from:body.stopIds[i],to,status:'unknown',minutes:null,distanceMeters:null,source:null,checkedAt:null,reason:i?'authentication_failed':'rate_limited',diagnostic:i?'provider_unauthorized':'quota_exceeded'}))}));
 assert.equal(travel.status,'incomplete');
 const labels=travel.segments.map(leg=>c.hbTravelIssueLabel(leg.diagnostic,leg.reason));
 assert.ok(labels.some(l=>l.includes('호출 한도 초과')));
});

test('handler source: no unsupported phrase and a fallback branch for non-preview statuses',()=>{
 assert.doesNotMatch(source,/이 교통수단은 지원하지 않아요/);
 assert.match(source,/if\(!\['estimated','incomplete'\]\.includes\(travel\.status\)\)\{\s*const view=hbRouteFallbackView/);
 assert.match(source,/id="hb-route-use-car"/);
 assert.doesNotMatch(source.slice(source.indexOf('const HB_TRAVEL_REASONS'),source.indexOf('function hbTravelIssueLabel')),banned);
});

test('plan page: "하루 여행 일정 자동 구성" form is off by flag; view controls and checks stay',()=>{
 assert.match(source,/const HB_PLAN_GENERATOR_FORM=false;/);
 const view=source.slice(source.indexOf('function hbPlanViewEnhance()'));
 // Hidden branch renders only the tools container with the checks list.
 assert.match(view,/const html=!HB_PLAN_GENERATOR_FORM\?'<section class="panel hb-plan-generator hb-plan-tools" aria-label="일정표 도구">'\+checksHtml\+'<\/section>'/);
 // Form bindings are guarded so the hidden inputs are never dereferenced.
 assert.match(view,/if\(HB_PLAN_GENERATOR_FORM\)\{\s*document\.getElementById\('hb-plan-start'\)/);
 for(const id of ['hb-edit-toggle','hb-large-toggle','hb-print-itinerary','hb-plan-edit-feedback'])assert.ok(view.includes(id),id);
});
