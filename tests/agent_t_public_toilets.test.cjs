'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildIndex, query, serve, loadIndex } = require('../web/server/public-toilets.cjs');
const fixture = (id,lat,lng,extra = {}) => ({source_id:id,name:'Synthetic fixture',address:'서울특별시 테스트 1',lat,lng,reference_date:'2026-01-01',coordinates_status:'verified',coordinate_evidence:{source_url:'https://example.invalid/fixture',verified_at:'2026-01-01',redistribution_approved:true},accessibility_report:{accessible_male_stalls:0,accessible_female_stalls:1},opening_status:'always_reported',phone:'PRIVATE',...extra});
const day = '2026-11-25';
const seoul = {lat:'37.5665',lng:'126.9780'};
const suwon = {lat:'37.2636',lng:'127.0286'};
test('Seoul and Gyeonggi radius, straight line and nearest ordering',()=>{
  const index = buildIndex([fixture('far',37.5765,126.978),fixture('near',37.5665,126.978),fixture('suwon',37.2636,127.0286,{address:'경기도 테스트 1'})],day);
  const result = query(index,seoul);
  assert.deepEqual(result.items.map(x=>x.id),['near','far']);
  assert.equal(result.items[0].distanceMeters,0); assert.equal(result.distanceType,'straight_line');
  assert.deepEqual(query(index,suwon).items.map(x=>x.id),['suwon']);
  assert.equal(result.items[0].accessibleRoute,'unknown'); assert.equal(result.items[0].accessibleStalls.status,'reported_present');
  assert.equal(result.items[0].phone,undefined);
});
test('reject invalid coordinate, unapproved evidence, future date, duplicate and unknown pins',()=>{
  const rows = [fixture('a',0,0),fixture('b',37.5,127,{coordinates_status:'not_provided'}),fixture('c',37.5,127,{coordinate_evidence:{}}),fixture('d',37.5,127,{reference_date:'2026-12-11'}),fixture('e',37.5,127),fixture('e',37.6,127),fixture('f',37.5,127,{reference_date:'2026-02-30'})];
  const index = buildIndex(rows,day); assert.equal(index.excludedCount,7); assert.equal(query(index,seoul).status,'unavailable');
});
test('missing, zero and positive accessibility are distinct',()=>{
  const index = buildIndex([fixture('a',37.56,127,{accessibility_report:{}}),fixture('b',37.56,127,{accessibility_report:{accessible_male_stalls:0,accessible_female_stalls:0}}),fixture('c',37.56,127,{accessibility_report:{accessible_male_stalls:3}})],day);
  assert.deepEqual(index.records.map(x=>x.accessibleStalls.status),['unknown','none_reported','reported_present']);
});
test('limit, paging, invalid query and bounded payload at 50 results',()=>{
  const rows = Array.from({length:100},(_,i)=>fixture(String(i).padStart(3,'0'),37.5665,126.978));
  const index=buildIndex(rows,day), a=query(index,{...seoul,limit:'50'}), b=query(index,{...seoul,limit:'50',offset:'50'});
  assert.equal(a.items.length,50); assert.equal(a.nextOffset,50); assert.equal(b.nextOffset,null); assert.equal(new Set([...a.items,...b.items].map(x=>x.id)).size,100);
  assert.ok(Buffer.byteLength(JSON.stringify(a)) < 100000);
  for(const q of [{lat:'',lng:'127'},{...seoul,radius:'10001'},{...seoul,limit:'51'},{...seoul,lat:['37','38']},{...seoul,offset:'501'}]) assert.throws(()=>query(index,q),/invalid_query/);
  assert.equal(query(index,suwon).status,'ok'); assert.equal(query(index,suwon).items.length,0);
});
test('HTTP 503 unavailable vs 200 empty; 400, 405, no leaked errors',()=>{
  const call=(req,loader)=>{const res={setHeader(){},end(s){this.body=JSON.parse(s);}};serve(req,res,loader);return res;};
  assert.equal(call({method:'GET',query:seoul},()=>null).statusCode,503);
  assert.equal(call({method:'GET',query:seoul},()=>{throw Error('PRIVATE');}).body.status,'unavailable');
  assert.equal(call({method:'GET',query:suwon},()=>buildIndex([fixture('a',37.5665,126.978)],day)).statusCode,200);
  assert.equal(call({method:'GET',query:{}},()=>null).statusCode,400); assert.equal(call({method:'POST'},()=>null).statusCode,405);
});
