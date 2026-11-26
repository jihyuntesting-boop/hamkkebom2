'use strict';
// 2026-11-26 사용자 지시 3건 (PLAN-03/PLAN-04 일부·F05-02/F05-03, WTH-02/03·REC-04, F07-02):
// 1) 집↔첫 방문지·마지막 방문지↔집 이동시간을 hbHomeLeg 하나로 통일하고 1단계 미리보기·일정 생성이 같은 값을 쓴다.
// 2) 실내/야외 분류는 장소 ID별 확인 목록(공식 근거·확인일)을 이름 추정보다 먼저 쓴다.
// 3) 날씨 카드의 안내 문구는 숨기고, 발효 중인 특보 내용은 그대로 보여 준다.
// 네이버 경로는 fixture 값만 쓴다(네트워크·키 없음).
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const read=n=>fs.readFileSync(path.join(__dirname,'../web/assets/core-src',n),'utf8');
const s10=read('10-recommendation-and-profile.js'),s30=read('30-itinerary-engine-and-ui.js'),s40=read('40-sharing-and-data.js');
const between=(src,a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);assert.ok(i>=0&&j>i,a);return src.slice(i,j+b.length);};
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const J=x=>JSON.parse(JSON.stringify(x));

// ---- 1. unified home leg -------------------------------------------------
const E=vm.createContext({safe});
vm.runInContext(s30.slice(0,s30.indexOf('function hbApplyScheduleFromSelection(){')),E);
const home=E.hbTripPoint({lat:37.51234,lng:127.05678},'current_location');
const stop=(id,arrival,stay=60,other={})=>({id,placeId:id,kind:'spot',name:id,plannedArrival:arrival,time:arrival,stayMinutes:stay,
 transitionBufferMinutes:25,travelTimeStatus:'unknown',...other});
const naverState=(items,legs,extra={})=>{const state={origin:home,returnMode:'same',...extra};return {...state,result:{key:E.hbTripEndpointTimes(items,state).key,legs}};};
const est=(kind,stopId,minutes)=>({kind,stopId,status:'estimated',minutes,source:'naver_directions',checkedAt:'2026-11-26T00:12:00.000Z'});

test('hbHomeLeg: saved NAVER leg wins (with source and check time), otherwise the same 25-minute estimate',()=>{
 const items=[stop('a','10:00'),stop('b','12:00',90)];
 const state=naverState(items,[est('departure','a',40),est('return','b',35)]);
 const leg=E.hbHomeLeg('departure','a',state);
 assert.deepEqual(J(leg),{kind:'departure',stopId:'a',minutes:40,basis:'naver_directions',checkedAt:'2026-11-26T00:12:00.000Z'});
 assert.equal(E.hbHomeLegText(leg),'약 40분, 네이버 자동차 경로 · 조회 11월 26일 09:12');
 assert.equal(E.hbHomeLeg('return','b',state).minutes,35);
 // No data, other visit, moved origin, label-only origin → 25분 예상 with a reason.
 for(const [kind,id,st,reason] of [['departure','a',{origin:home},'unchecked'],['departure','b',state,'stale'],
  ['departure','a',{...state,origin:E.hbTripPoint({lat:37.6,lng:127.1},'place','다른 곳')},'stale'],
  ['departure','a',{origin:E.hbTripPoint(null,'label_only','우리 집')},'invalid_coordinates'],['departure','a',{},'no_point'],['departure',null,state,'no_anchor']]){
  const fallback=E.hbHomeLeg(kind,id,st);
  assert.equal(fallback.minutes,25,reason);assert.equal(fallback.basis,'placeholder',reason);assert.equal(fallback.reason,reason);
  assert.equal(E.hbHomeLegText(fallback),'약 25분, 예상');
 }
 // A leg that is not a NAVER estimate is never used as one.
 const bogus=naverState(items,[{kind:'departure',stopId:'a',status:'estimated',minutes:3,source:'placeholder'}]);
 assert.equal(E.hbHomeLeg('departure','a',bogus).basis,'placeholder');
});

test('plan page and step 1 share the rule: endpoint times use the NAVER leg, else 25분 예상; midnight crossing is labelled',()=>{
 const items=[stop('a','00:20'),stop('b','23:00',50)];
 const verified=E.hbTripEndpointTimes(items,naverState(items,[est('departure','a',40),est('return','b',35)]));
 assert.equal(verified.departure.label,'전날 23:40');assert.equal(verified.departure.dayOffset,-1);
 assert.equal(verified.return.label,'다음날 00:25');assert.equal(verified.return.dayOffset,1);
 const estimate=E.hbTripEndpointTimes(items,{origin:home});
 assert.equal(estimate.departure.status,'default');assert.equal(estimate.departure.label,'전날 23:55');
 assert.equal(estimate.return.label,'다음날 00:15');
 assert.match(E.hbTripEndpointLine('departure',estimate.departure,estimate.anchors),/집 출발 예상: 전날 23:55 .*약 25분, 예상/);
 // The step-1 window uses the same leg values.
 const w=E.hbHomeWindow({depart:'09:00',departLeg:E.hbHomeLeg('departure','a',naverState(items,[est('departure','a',40)]))});
 assert.equal(w.start,'09:40');assert.equal(w.homeDeparture.basis,'naver_directions');assert.equal(w.homeDeparture.stopId,'a');
 assert.match(w.warnings[0],/이동 약 40분, 네이버 자동차 경로/);
 const plain=E.hbHomeWindow({depart:'09:00'});
 assert.equal(plain.start,'09:25');assert.equal(plain.homeDeparture.basis,'placeholder');assert.match(plain.warnings[0],/이동 약 25분, 예상/);
 // Late departure crossing midnight with the NAVER leg is reported like the 25-minute case.
 assert.match(E.hbHomeWindow({depart:'23:30',departLeg:{minutes:40,basis:'naver_directions'}}).errors[0],/자정/);
});

test('step-1 preview: nothing without origin or time; estimate with origin+time; saved NAVER data reused',()=>{
 assert.equal(E.hbHomePreview({depart:'09:00'},{},[]),null,'no origin → no preview');
 assert.equal(E.hbHomePreview({},{origin:home},[]),null,'no time → no preview');
 assert.equal(E.hbHomePreview({depart:'09:00',planStart:'11:00'},{origin:home},[]),null,'legacy first-visit time keeps its own note');
 const p=E.hbHomePreview({depart:'09:00',returnTime:'19:00'},{origin:home},[]);
 assert.deepEqual(J(p.lines.map(l=>l.text)),['예상 첫 방문지 도착 09:25 (집 출발 09:00 · 이동 약 25분, 예상)','예상 귀가 19:00 (집 도착 희망 · 일정은 18:35까지 · 귀가 이동 약 25분, 예상)']);
 const saved=[stop('gyeong','10:00',90,{name:'경복궁'}),stop('park','13:00',60,{name:'서울숲'})];
 const state=naverState(saved,[est('departure','gyeong',42),est('return','park',31)]);
 const reused=E.hbHomePreview({depart:'08:30'},state,saved);
 assert.equal(reused.lines[0].basis,'naver_directions');
 assert.equal(reused.lines[0].text,'예상 첫 방문지 도착 09:12 (집 출발 08:30 · 경복궁까지 이동 약 42분, 네이버 자동차 경로 · 조회 11월 26일 09:12)');
 assert.equal(reused.lines[1].text,'예상 귀가 14:31 (저장된 일정 종료 14:00 후 서울숲까지 귀가 이동 약 31분, 네이버 자동차 경로 · 조회 11월 26일 09:12)');
 // Midnight: late departure shows the next-day arrival, next-day return keeps its day word.
 const late=E.hbHomePreview({depart:'23:50',returnTime:'01:00',returnDay:1},{origin:home},[]);
 assert.match(late.lines[0].text,/^예상 첫 방문지 도착 다음날 00:15 /);
 assert.equal(late.lines[1].text,'예상 귀가 다음날 01:00 (집 도착 희망 · 귀가 이동 약 25분, 예상)');
 // Early hours are allowed (no dawn/evening limit).
 assert.match(E.hbHomePreview({depart:'04:10'},{origin:home},[]).lines[0].text,/04:35/);
 const banned=/미확인|미지원|확인되지 않|확인 안 됨|안전/;
 for(const pv of [p,reused,late])for(const l of pv.lines)assert.doesNotMatch(l.text,banned,l.text);
});

test('step-1 markup: preview sits right under the time inputs and refreshes with the clock fields',()=>{
 const step1=s10.slice(s10.indexOf("if(step===1){"),s10.indexOf("hbDiscoveryBindPending(newPlan);bindPrefs();"));
 const row=step1.indexOf('hb-trip-time-row'),preview=step1.indexOf('id="hb-trip-home-preview"'),help=step1.indexOf('id="hb-trip-time-help"');
 assert.ok(row>0&&preview>row&&help>preview,'time row → preview → help');
 assert.match(step1,/네이버 자동차 경로로 계산한 이동시간이 있으면 그 값을, 없으면 이동 약 25분 \(예상\)/);
 const labels=s10.slice(s10.indexOf('function hbUpdateTripDateLabels('),s10.indexOf('function hbBindClockFields('));
 assert.ok(labels.includes("getElementById('hb-trip-home-preview')")&&labels.includes('hbHomePreviewMarkup()'));
 // Markup reads the stored state through the same function.
 const ctx=vm.createContext({safe});
 vm.runInContext(s30.slice(0,s30.indexOf('function hbApplyScheduleFromSelection(){'))+s30.slice(s30.indexOf('function hbTripEndpointState(){'),s30.indexOf('function hbSaveTripEndpointState(')),ctx);
 ctx.s={hbDepartTime:'09:00',hbReturnTime:'',hbReturnDay:0,stops:[],hbTripEndpoints:{origin:{source:'current_location',label:'현재 위치',lat:37.512,lng:127.057}}};
 const html=vm.runInContext('hbHomePreviewMarkup()',ctx);
 assert.match(html,/<li data-hb-preview="arrival" data-hb-preview-basis="placeholder">예상 첫 방문지 도착 09:25/);
 ctx.s.hbTripEndpoints={};assert.equal(vm.runInContext('hbHomePreviewMarkup()',ctx),'');
});

test('schedule creation uses the same leg: NAVER minutes for the resulting first visit, else 25분 예상; protected fallback',()=>{
 const places=[{id:'a',name:'A',kind:'spot'},{id:'b',name:'B',kind:'spot'}];
 const create=w=>E.hbCreateSchedule(['a','b'],places,{start:w.start,end:w.end});
 const input={depart:'09:00',returnTime:'',returnDay:0,originSet:true};
 const plain=E.hbScheduleWithHomeLegs(input,{origin:home},create);
 assert.equal(plain.plan.stops[0].time,'09:25');assert.equal(plain.home.homeDeparture.basis,'placeholder');
 const items=plain.plan.stops;
 const withNaver=E.hbScheduleWithHomeLegs(input,naverState(items,[est('departure','a',50)]),create);
 assert.equal(withNaver.plan.stops[0].time,'09:50');assert.equal(withNaver.home.homeDeparture.basis,'naver_directions');
 assert.equal(withNaver.home.start,'09:50');assert.match(withNaver.home.warnings[0],/이동 약 50분, 네이버 자동차 경로/);
 // A NAVER leg for another visit is not used.
 const other=naverState([stop('b','10:00'),stop('a','12:00')],[est('departure','b',50)]);
 assert.equal(E.hbScheduleWithHomeLegs(input,other,create).plan.stops[0].time,'09:25');
 // Same-day return: schedule end = home arrival − NAVER return leg for the resulting last visit.
 const retInput={depart:'',returnTime:'18:00',returnDay:0,originSet:true};
 const base=E.hbScheduleWithHomeLegs(retInput,{origin:home},create);
 assert.equal(base.home.end,'17:35');
 const last=E.hbTripEndpointAnchors(base.plan.stops).last.placeId;
 const ret=E.hbScheduleWithHomeLegs(retInput,naverState(base.plan.stops,[est('return',last,70)]),create);
 assert.equal(ret.home.end,'16:50');assert.equal(ret.home.homeReturn.basis,'naver_directions');
 // Legacy first-visit times are never reinterpreted.
 const legacy=E.hbScheduleWithHomeLegs({planStart:'11:00',planEnd:'',depart:'09:00'},naverState(items,[est('departure','a',50)]),create);
 assert.equal(legacy.plan.stops[0].time,'11:00');assert.equal(legacy.home.source,'first_visit');
 // hbApplyScheduleFromSelection goes through the shared helper.
 const apply=s30.slice(s30.indexOf('function hbApplyScheduleFromSelection(){'),s30.indexOf('// §5 origin / return UI.'));
 assert.ok(apply.includes('hbScheduleWithHomeLegs(homeInput,hbTripEndpointState(),'));
 // Plan page endpoint panel stays hidden.
 assert.match(s30,/const HB_PLAN_PANEL_ENDPOINTS=false;/);
});

// ---- 2. verified indoor/outdoor list -------------------------------------
const placeSrc=between(s10,'// BEGIN HB_WEATHER_SUGGEST','// END HB_WEATHER_SUGGEST\n');
const P=vm.createContext({safe,s:{hbPlanStart:'',hbPlanEnd:''}});
vm.runInContext(placeSrc,P);
const EXPECTED={
 'tour-126508':['경복궁','spot','outdoor'],'tour-126537':['북촌한옥마을','spot','outdoor'],'tour-126535':['남산서울타워','spot','mixed'],
 'tour-2470006':['동대문디자인플라자(DDP)','spot','mixed'],'tour-129703':['국립중앙박물관','culture','mixed'],'tour-128611':['서울숲','spot','outdoor'],
 'tour-126532':['올림픽공원','spot','outdoor'],'tour-3432213':['논현문화마루도서관','culture','indoor'],'tour-3429640':['성동책마루도서관','culture','indoor'],
 'tour-2692866':['청운문학도서관','culture','indoor'],'tour-2649975':['광명동굴','spot','indoor'],'tour-125449':['남한산성도립공원 [유네스코 세계유산]','spot','outdoor'],
 'tour-750804':['마장호수','spot','outdoor'],'tour-3456435':['부락산분수공원','spot','outdoor'],'tour-3452786':['시흥시청소년수련관','spot','indoor'],
 'tour-3428221':['시흥시 대야평생학습관','culture','indoor'],'tour-3449158':['시흥시립대야도서관','culture','indoor'],'tour-2736429':['에코센터','culture','indoor']
};

test('verified list covers the 18 shown places with official sources and check dates, and wins over name guessing',()=>{
 const list=vm.runInContext('HB_WEATHER_PLACE_ENV',P);
 assert.deepEqual(Object.keys(list).sort(),Object.keys(EXPECTED).sort());
 for(const [id,[name,kind,expected]] of Object.entries(EXPECTED)){
  const entry=list[id];
  assert.equal(entry.kind,expected,name);
  assert.ok(Array.isArray(entry.sources)&&entry.sources.length&&entry.sources.every(u=>/^https:\/\/[^\s]+$/.test(u)),name+' sources');
  assert.match(entry.checkedAt,/^2026-11-26$/);assert.ok(['page','search','tourapi'].includes(entry.via),name);
  assert.doesNotMatch(entry.label,/안전|보장/,name);
  // Public sync (.github/workflows/evaluation-public-sync.yml) rejects key-like query strings; source URLs must not look like one.
  for(const u of entry.sources)assert.doesNotMatch(u,/[?&](?:serviceKey|apiKey|token|key)=[A-Za-z0-9_%.-]{8,}/i,name+' '+u);
  const c=P.hbWeatherPlaceClass({id,name,kind});
  assert.equal(c.kind,expected,name);assert.equal(c.basis,'verified_list',name);
  // Stops carry placeId instead of id.
  assert.equal(P.hbWeatherPlaceClass({placeId:id,name,kind}).kind,expected,name+' via placeId');
 }
 // DDP / 수련관: the name alone would say indoor; the verified list decides.
 assert.equal(P.hbWeatherPlaceClass({name:'동대문디자인플라자(DDP)',kind:'spot'}).basis,'name_keyword');
 assert.equal(P.hbWeatherPlaceClass({id:'tour-2470006',name:'동대문디자인플라자(DDP)',kind:'spot'}).kind,'mixed');
 // Places outside the list keep the auxiliary rules; food is never classified.
 assert.equal(P.hbWeatherPlaceClass({id:'tour-1',name:'어느 박물관',kind:'culture'}).kind,'indoor');
 assert.equal(P.hbWeatherPlaceClass({id:'tour-126508',name:'경복궁',kind:'food'}).kind,null);
});

test('mixed-facility rule: rain → indoor, mixed, unclassified, outdoor; sunny → outdoor, mixed, others; notes never claim safety',()=>{
 const adverse={mode:'adverse',label:'비 예보(오후 강수확률 70%)',source:'기상청 단기예보 · 05:00 발표'};
 const pleasant={mode:'pleasant',label:'맑고 온화한 날씨',source:'기상청 단기예보 · 05:00 발표'};
 const places=[{id:'tour-128611',name:'서울숲',kind:'spot'},{id:'tour-2470006',name:'동대문디자인플라자(DDP)',kind:'spot'},
  {id:'tour-x',name:'어느 관광지',kind:'spot'},{id:'tour-3432213',name:'논현문화마루도서관',kind:'culture'}];
 const order=signal=>[...places].sort((a,b)=>P.hbWeatherPlaceRank(b,signal)-P.hbWeatherPlaceRank(a,signal)).map(p=>p.name);
 assert.deepEqual(order(adverse),['논현문화마루도서관','동대문디자인플라자(DDP)','어느 관광지','서울숲']);
 assert.deepEqual(order(pleasant),['서울숲','동대문디자인플라자(DDP)','어느 관광지','논현문화마루도서관']);
 const ddp=P.hbWeatherPlaceNote(places[1],adverse);
 assert.match(ddp,/data-hb-weather-fit="mixed"/);
 assert.match(ddp,/비 예보\(오후 강수확률 70%\) · 실내 전시관\(DDP 뮤지엄\)과 야외 광장이 함께 있는 시설로 분류된 곳/);
 assert.match(P.hbWeatherPlaceNote(places[3],adverse),/실내 도서관으로 분류된 곳/);
 assert.match(P.hbWeatherPlaceNote({id:'tour-2649975',name:'광명동굴',kind:'spot'},adverse),/동굴 내부 관람 시설로 분류된 곳/);
 assert.match(P.hbWeatherPlaceNote(places[0],pleasant),/야외 공원으로 분류된 곳/);
 for(const id of Object.keys(EXPECTED))for(const sg of [adverse,pleasant]){
  const note=P.hbWeatherPlaceNote({id,name:EXPECTED[id][0],kind:EXPECTED[id][1]},sg);
  assert.doesNotMatch(note,/안전|보장|미확인/,id);
 }
 const course=P.hbWeatherCourseNote(places.map(p=>({p})),adverse);
 assert.match(course,/실내 시설로 분류된 곳 1곳 · 실내 시설이 있는 곳 1곳 · 야외 장소 1곳/);
 assert.equal(P.hbWeatherJosaRo('공원'),'으로');assert.equal(P.hbWeatherJosaRo('시설'),'로');assert.equal(P.hbWeatherJosaRo('관람지'),'로');
});

// ---- 3. weather card wording --------------------------------------------
const cardSrc=s40.slice(s40.indexOf('let forecast ='),s40.indexOf('async function hbTravelRequest'));
function weatherCtx(forecast){
 const ctx=vm.createContext({s:{region:'서울',date:'2026-11-27',stops:[]},path:()=>'/places',URLSearchParams,queueMicrotask:()=>{},safe,
  document:{querySelector:()=>null,querySelectorAll:()=>[]},HB_WEATHER_SUGGEST_RULE:{wetTypes:['비','비 또는 눈','눈','소나기'],wetProbabilityPercent:60,hotTemperatureC:31,coldTemperatureC:-5}});
 vm.runInContext(cardSrc.replace(/const HB_WEATHER_SUGGEST_RULE=Object\.freeze\(\{[\s\S]*?\}\);/,''),ctx);
 ctx.forecast={key:JSON.stringify(['서울','2026-11-27']),...forecast};
 vm.runInContext('forecast=this.forecast',ctx);
 return ctx;
}
const HIDDEN=/특보는 여행일에 다시 확인|보장하지 않|지역 기준점|대표 예보|대표 |미확인|특보 상태 확인|확인 필요|재검토|실내 대안|보장 아님|다를 수 있어요/;

test('weather card hides guidance text and keeps temperature, rain chance, condition, issue time and 기상청 source',()=>{
 const data={summary:'기온 7°C · 강수확률 20% · 구름많음',precipitationType:'없음',issuedAt:'2026-11-26T05:00:00+09:00',evidence:{representativeAt:'2026-11-27T12:00:00+09:00'},location:{scope:'regional_reference'}};
 for(const alerts of [{status:'unknown'},{status:'none',area:{verified:true}},{status:'unknown',reason:'current_warning_only'},{status:'stale'},null]){
  const ctx=weatherCtx({state:'available',data,alerts});
  const text=vm.runInContext('weatherText()',ctx);
  assert.equal(text,'기온 7°C · 강수확률 20% · 구름많음 (발표 2026-11-26 05:00 KST)',JSON.stringify(alerts));
  const card=vm.runInContext('weatherCard()',ctx);
  assert.match(card,/<p class="muted">출처: 기상청<\/p>/);
  assert.doesNotMatch(card,HIDDEN);
  assert.doesNotMatch(card,/<p><\/p>/,'regular recommendation adds no empty paragraph');
 }
 // No issue time → the time is omitted, never "미확인".
 const noTime=vm.runInContext('weatherText()',weatherCtx({state:'available',data:{summary:'기온 7°C · 맑음',precipitationType:'없음'},alerts:{status:'unknown'}}));
 assert.equal(noTime,'기온 7°C · 맑음');
 // Rain no longer appends the indoor-alternative advice.
 const rain=vm.runInContext('weatherText()',weatherCtx({state:'available',data:{...data,summary:'기온 7°C · 강수확률 80% · 비',precipitationType:'비'},alerts:{status:'unknown'}}));
 assert.doesNotMatch(rain,HIDDEN);assert.match(rain,/강수확률 80% · 비 \(발표 2026-11-26 05:00 KST\)$/);
});

test('active warnings stay visible: kind, area and effective time, without the review guidance',()=>{
 const ctx=weatherCtx({state:'available',data:{summary:'기온 2°C · 비',precipitationType:'비',issuedAt:'2026-11-26T05:00:00+09:00'},
  alerts:{status:'active',effectiveAt:'2026-11-26T07:00:00+09:00',active:[{hazard:'호우',severity:'주의보',areaName:'서울'},{hazard:'강풍',severity:'주의보'}]}});
 const text=vm.runInContext('weatherText()',ctx);
 assert.equal(text,'기온 2°C · 비 (발표 2026-11-26 05:00 KST) · 발효 중인 특보: 호우주의보(서울), 강풍주의보 / 발효 2026-11-26 07:00 KST');
 assert.doesNotMatch(text,HIDDEN);
 const rec=vm.runInContext('hbWeatherRecommendation(forecast,currentWeatherKey())',ctx);
 assert.equal(rec.kind,'caution');
 const adverse=vm.runInContext('hbWeatherRecommendation({key:currentWeatherKey(),state:"available",data:{precipitationType:"비"},alerts:{status:"none"}},currentWeatherKey())',ctx);
 assert.equal(adverse.kind,'adverse');assert.doesNotMatch(adverse.message,/별도 확인이 필요해요/);
 // Short-course draft in the same card drops the "미확인" sentence.
 assert.ok(!s40.includes('실제 운영·이동시간은 미확인입니다.'));
});
