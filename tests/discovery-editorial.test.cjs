const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../web/assets/core-src/40-sharing-and-data.js'),'utf8');
const code=source.split('// BEGIN HB_DISCOVERY_EDITORIAL')[1].split('// END HB_DISCOVERY_EDITORIAL')[0];
const h=new Function('hbRichIdentity',code+';return {hbDiscoveryRecords,hbDiscoveryThemeMatch,hbDiscoveryCourseStops,hbDiscoveryAudienceNote,hbDiscoveryPriority,hbDiscoveryApprovedCohorts,hbDiscoveryAudienceMatch,hbDiscoveryVisibleCourses,hbDiscoveryCurrentSeason,hbDiscoveryFeaturedRows}')(p=>p&&/^tour-\d+$/.test(p.id)&&['spot','food','culture'].includes(p.kind));
const a={id:'tour-126508',kind:'spot',name:'경복궁',areaCode:'1'};
const b={id:'tour-126537',kind:'spot',name:'북촌한옥마을',areaCode:'1'};
test('deduplication and theme classification',()=>{assert.deepEqual(h.hbDiscoveryRecords([a,a,b,{id:'bad'}]),[a,b]);assert.equal(h.hbDiscoveryThemeMatch(a,'culture'),true);assert.equal(h.hbDiscoveryThemeMatch(a,'food'),false);});
test('course requires both actual IDs in matching region and theme',()=>{assert.deepEqual(h.hbDiscoveryCourseStops([a,b],'all','all'),[a,b]);assert.deepEqual(h.hbDiscoveryCourseStops([a],'all','all'),[]);assert.deepEqual(h.hbDiscoveryCourseStops([a,b],'31','all'),[]);assert.deepEqual(h.hbDiscoveryCourseStops([a,b],'all','food'),[]);});
test('no invented demographic popularity',()=>{assert.match(h.hbDiscoveryAudienceNote('60','female'),/아직 연결되지/);assert.match(h.hbDiscoveryAudienceNote('all','all'),/공식 인기 순위가 아니/);assert.equal(h.hbDiscoveryPriority(a.id,'서울'),0);});

test('approved exact cohort only; no invented aggregation or ambiguous period',()=>{
 const c={rightsStatus:'approved',rightsEvidence:'fixture only',sourceUrl:'https://datalab.visitkorea.or.kr/datalab/portal/loc/getTourDataFormView2.do',age:'60',sex:'female',region:'1',periodStart:'2026-01',periodEnd:'2026-02',metric:'visit_concentration',unit:'percent',methodology:'fixture',rows:[{id:a.id,value:12},{id:b.id,value:30}]};
 assert.deepEqual(h.hbDiscoveryApprovedCohorts({schemaVersion:1,cohorts:[{...c,rightsStatus:'unknown'}]}),[]);
 const approved=h.hbDiscoveryApprovedCohorts({schemaVersion:1,cohorts:[c]});
 assert.deepEqual(h.hbDiscoveryAudienceMatch(approved,'60','female','1',[a,b]).ranked,[b,a]);
 assert.equal(h.hbDiscoveryAudienceMatch(approved,'70plus','female','1',[a,b]),null);
 assert.equal(h.hbDiscoveryAudienceMatch(approved,'60','female','all',[a,b]),null);
 assert.deepEqual(h.hbDiscoveryApprovedCohorts({schemaVersion:1,cohorts:[c,c]}),[]);
});

test('multiple courses require full real IDs and regions; seasons are editorial',()=>{
 const art=[{id:'tour-129703',areaCode:'1',name:'국립중앙박물관',kind:'culture'},{id:'tour-2470006',areaCode:'1',name:'DDP',kind:'culture'}];
 const parks=[{id:'tour-128611',areaCode:'1',name:'서울숲',kind:'spot'},{id:'tour-126532',areaCode:'1',name:'올림픽공원',kind:'spot'}];
 const gg=[{id:'tour-125555',areaCode:'31',name:'수원 화성',kind:'spot'},{id:'tour-125449',areaCode:'31',name:'남한산성도립공원',kind:'spot'}];
 const rows=[a,b,...art,...parks,...gg];
 assert.deepEqual(h.hbDiscoveryVisibleCourses(rows,'all','all','all').map(x=>x.course.id),['palace','art','parks','fortress']);
 assert.deepEqual(h.hbDiscoveryVisibleCourses(rows,'all','all','winter').map(x=>x.course.id),['art']);
 assert.deepEqual(h.hbDiscoveryVisibleCourses(rows,'31','culture','all').map(x=>x.course.id),['fortress']);
 assert.deepEqual(h.hbDiscoveryVisibleCourses([a,...gg],'1','all','all'),[]);
 assert.equal(h.hbDiscoveryCurrentSeason(11),'autumn');assert.equal(h.hbDiscoveryCurrentSeason(12),'winter');
});
test('featured geography is verified, not assigned from query context',()=>{
 const rows=h.hbDiscoveryFeaturedRows({places:[{...a,region:'서울',address:'서울특별시 종로구'},{...b,region:'서울',address:'경기도 수원시'},{id:'tour-125555',region:'경기',address:'경기도 수원시',kind:'spot'}]});
 assert.deepEqual(rows.map(x=>[x.id,x.areaCode]),[[a.id,'1'],['tour-125555','31']]);
 assert.throws(()=>h.hbDiscoveryFeaturedRows({}));
});
test('filter UI hidden by one flag; filter code kept; defaults forced (user decision 2026-11-26)',()=>{
 assert.match(code,/const hbDiscoveryFiltersVisible=false;/);
 assert.match(code,/\+\(hbDiscoveryFiltersVisible\?'<section class="hb-discovery-filter"/);
 assert.match(code,/if\(!hbDiscoveryFiltersVisible\)\{const d=hbDiscoveryState;d\.age='all';d\.sex='all';/);
 assert.match(code,/const region=el\.querySelector\('#hb-discovery-region'\);if\(region\)/);
});
