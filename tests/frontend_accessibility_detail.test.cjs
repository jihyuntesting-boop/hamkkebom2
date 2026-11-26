const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const read=relative=>fs.readFileSync(path.join(__dirname,'../web/assets',relative),'utf8');
const context=vm.createContext({window:{},URL,safe:String});
vm.runInContext(read('core-src/20-detail-and-replan.js'),context);
vm.runInContext(read('scripts/03-access-guides.js'),context);

test('operator-published guide keeps missing entrance coordinates and narrower evidence explicit',()=>{
 const museum=context.hbDetailAccessGuide({id:'tour-129703'});
 assert.equal(museum.entrance.name,'국립중앙박물관 상설전시관 주출입구');
 assert.equal(context.hbDetailMap(museum.entrance,'입구 지도'),'');
 assert.ok(museum.facts.every(fact=>fact.status==='source_reported'&&fact.scope&&fact.sourceUrl&&!fact.verifiedAt));
 assert.equal(context.hbDetailSummary(museum.facts,['distance']),'방문 전 확인이 필요해요');
 assert.equal(context.hbDetailAccessGuide({id:'constructor'}),null);
});

test('known point coordinates may link to a map, missing values cannot become zero',()=>{
 assert.equal(context.hbDetailMap({lat:'',lng:126.9},'입구 지도'),'');
 assert.equal(context.hbDetailMap({lat:37.55,lng:126.9},'입구 지도').includes('37.55%2C126.9'),true);
});

test('a newly conflicting selected place cannot regenerate an itinerary',()=>{
 const stops=[{id:'previous-stop'}];
 const scope=vm.createContext({
  s:{date:'2026-11-26',chosen:['selected-place'],hbMobilityAid:'wheelchair',stops},
  hbTodaySeoul:()=> '2026-11-26',
  places:[{id:'selected-place',name:'계단 장소'}],
  alert:message=>assert.match(message,/계단 장소/),
  hbEvaluatePlace:(_place,profile)=>{
   assert.equal(profile.mobilityAid,'wheelchair');
   return {status:'excluded'};
  },
 });
 const profile=read('core-src/10-recommendation-and-profile.js');
 vm.runInContext(profile.slice(profile.indexOf('function hbTravelDateError('),profile.indexOf('function hbTravelInput(')),scope);
 const planner=read('core-src/30-itinerary-engine-and-ui.js');
 vm.runInContext(planner.slice(0,planner.indexOf('function hbPlanViewEnhance()')),scope);
 assert.equal(scope.hbApplyScheduleFromSelection(),false);
 assert.equal(scope.s.stops,stops);
});

test('published arrival guides show only evidence-backed connections and restroom locations',()=>{
 const examples=[
  ['tour-129703','박물관',true,'상설전시실 1층'],
  ['tour-750804','마장호수',false,'마장호수 전망대'],
  ['tour-126508','경복궁',false,null],
  ['tour-2470006','DDP',false,null],
  ['tour-128611','서울숲',false,'서울숲 방문자센터']
 ];
 for(const [id,name,connected,restroom] of examples){
  const place={id,name};
  const guide=context.hbDetailAccessGuide(place);
  const markup=context.hbArrivalMarkup(place,guide,guide.facts);
  assert.match(markup,/네이버 지도에서 주차장 찾기/);
  assert.ok(markup.includes(encodeURIComponent(guide.arrival.mapQuery)));
  assert.equal(markup.includes('hb-access-map-linked'),connected,id);
  assert.equal(markup.includes('계단 없는 길은 확인이 필요해요'),false,id); // 2026-11-26 사용자 결정: 안내 비노출
  assert.equal(markup.includes('<h3>장애인 화장실</h3>'),Boolean(restroom),id);
  if(restroom)assert.ok(markup.includes(restroom));
  if(id==='tour-129703')assert.match(markup,/bg_byfloor_img_1\.png/);
  if(id==='tour-750804')assert.match(markup,/공식 무장애 관광지도/);
 }
});

test('missing or conflicting evidence removes unsupported arrival controls',()=>{
 const place={id:'tour-129703',name:'국립중앙박물관'};
 const guide=context.hbDetailAccessGuide(place);
 const conflict=context.hbArrivalMarkup(place,guide,[
  ...guide.facts,{topic:'stairs',status:'conflicting'},{topic:'toilet',status:'conflicting'}
 ]);
 assert.doesNotMatch(conflict,/hb-access-map-stops|장애인 화장실/);
 assert.doesNotMatch(conflict,/계단 없는 길은 확인이 필요해요/);
 const generic=context.hbArrivalMarkup({name:'다른 장소',address:'서울'},null,[]);
 assert.match(generic,/네이버 지도에서 장소 찾기/);
 assert.doesNotMatch(generic,/주차장 찾기|hb-access-map-stops|장애인 화장실/);
});
