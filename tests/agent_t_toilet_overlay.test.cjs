'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('web/assets/core-src/50-map-and-startup.js','utf8');
const start = source.indexOf('function createToiletOverlay(');
const end = source.indexOf('let hbToiletOverlayView=', start);
assert.ok(start >= 0 && end > start);
const createToiletOverlay = vm.runInNewContext(source.slice(start,end)+'\ncreateToiletOverlay', {AbortController,URLSearchParams,globalThis:{fetch:globalThis.fetch}});
const pin = {category:'public_toilet',id:'test',lat:37.5,lng:127,accessibleRoute:'unknown'};
const ok = items => ({ok:true,json:async()=>({status:'ok',coverage:'partial_seoul_gyeonggi',items})});
function setup(fetchImpl) {
  let pins=[],status=''; const overlay=createToiletOverlay({fetchImpl,replacePins:p=>{pins=p},setStatus:s=>{status=s}});
  return {overlay,get pins(){return pins},get status(){return status}};
}
test('off by default; partial success and dispose',async()=>{
  let calls=0; const x=setup(async()=>{calls++;return ok([pin])});
  await x.overlay.refresh(37.5,127); assert.equal(calls,0);
  x.overlay.toggle(true); await x.overlay.refresh(37.5,127); assert.deepEqual(Array.from(x.pins),[pin]); assert.equal(x.status,'partial');
  x.overlay.dispose(); assert.deepEqual(Array.from(x.pins),[]); assert.equal(x.status,'disabled');
});
test('503 is unavailable not empty; 200 empty is partial coverage',async()=>{
  let i=0;const x=setup(async()=>++i===1?{ok:false,status:503}:ok([]));x.overlay.toggle(true);
  await x.overlay.refresh(37.5,127);assert.equal(x.status,'unavailable');
  await x.overlay.refresh(37.5,127);assert.equal(x.status,'empty_in_partial_coverage');
});
test('stale result after disabling never creates pins',async()=>{
  let resolve; const x=setup(()=>new Promise(r=>resolve=r));x.overlay.toggle(true);
  const p=x.overlay.refresh(37.5,127);x.overlay.toggle(false);resolve(ok([pin]));await p;
  assert.deepEqual(Array.from(x.pins),[]);assert.equal(x.status,'disabled');
});
test('reject malformed and falsely accessible pins',async()=>{
  const x=setup(async()=>ok([{...pin,accessibleRoute:'verified'}]));x.overlay.toggle(true);await x.overlay.refresh(37.5,127);assert.deepEqual(Array.from(x.pins),[]);assert.equal(x.status,'unavailable');
});

test('real pilot lookup preserves explicit facility scope and attribution',async()=>{
  const {loadIndex,query}=require('../web/server/public-toilets.cjs');
  const body=query(loadIndex(''),{lat:'37.47021904',lng:'126.89704375',radius:'5000'});
  let pins=[],status,detail;
  const x=createToiletOverlay({fetchImpl:async()=>({ok:true,json:async()=>body}),replacePins:p=>{pins=p},setStatus:(s,d)=>{status=s;detail=d}});
  x.toggle(true);await x.refresh(37.47021904,126.89704375);
  assert.equal(pins.length,3);assert.equal(status,'partial');assert.equal(detail.region,'서울특별시 금천구');assert.equal(detail.complete,false);assert.equal(detail.license,'KOGL-1');
  assert.ok(pins.every(p=>p.coordinatePrecision==='facility_location'&&p.accessibleRoute==='unknown'&&p.coordinateEvidence.attribution));
  delete body.coverageDetail;await x.refresh(37.47021904,126.89704375);
  assert.equal(status,'unavailable');assert.deepEqual(Array.from(pins),[]);
});
