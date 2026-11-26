'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildIndex, query, loadIndex, serve } = require('../web/server/public-toilets.cjs');
const pilot = require('../web/server/public-toilet-pilot.cjs');
const day = '2026-11-25';
const index = buildIndex(pilot.rows,day);
test('three rights-checked real records; separate sources, dates and facility-level location',()=>{
  assert.equal(index.records.length,3);
  assert.equal(index.excludedCount,0);
  for (const p of index.records) {
    assert.equal(p.coordinatePrecision,'facility_location');
    assert.equal(p.accessibleRoute,'unknown');
    assert.equal(p.referenceDate,'2020-07-31');
    assert.equal(p.coordinateEvidence.sourceDatasetUpdatedAt,'2026-11-18');
    assert.equal(p.coordinateEvidence.verifiedAt,day);
    assert.equal(p.coordinateEvidence.license,'KOGL-1');
    assert.equal(p.coordinateEvidence.sourceUrl,pilot.coverageDetail.sourceUrl);
    assert.equal(p.accessibleStalls.status,'unknown');
    assert.equal(p.accessibleStalls.male,null);
    assert.equal(p.accessibleStalls.female,null);
    assert.equal(p.phone,undefined);
  }
  assert.equal(index.records.find(p=>p.id.endsWith('053')).accessibleFacilityReport.status,'reported_present');
  assert.match(index.records.find(p=>p.id.endsWith('053')).accessibleFacilityReport.note,/상충/);
});
test('default bundle delivers genuine nearby records, partial scope, and no claims outside pilot',()=>{
  const actual = loadIndex('');
  const result = query(actual,{lat:'37.47021904',lng:'126.89704375',radius:'5000'});
  assert.equal(result.items.length,3);
  assert.equal(result.items[0].id,'202031700000100053');
  assert.equal(result.items[0].distanceMeters,0);
  assert.equal(result.coverageDetail.region,'서울특별시 금천구');
  assert.equal(result.coverageDetail.complete,false);
  assert.equal(query(actual,{lat:'37.2636',lng:'127.0286'}).items.length,0);
  assert.equal(query(actual,{lat:'37.2636',lng:'127.0286'}).coverageDetail.complete,false);
});
test('reject corrupted municipal evidence; never fallback for a configured invalid snapshot',()=>{
  const r=pilot.rows[0];
  assert.equal(buildIndex([{...r,coordinate_evidence:{...r.coordinate_evidence,license:'unknown'}}],day).records.length,0);
  assert.throws(()=>loadIndex('/nonexistent/hamkkebom/toilets.jsonl'));
  const res={setHeader(){},end(s){this.body=JSON.parse(s)}};
  serve({method:'GET',query:{lat:'37.47',lng:'126.897'}},res,()=>loadIndex(''));
  assert.equal(res.statusCode,200); assert.ok(res.body.items.length>0);
});
