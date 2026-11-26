'use strict';
// §5 step 1: home departure/arrival times, typed clock input, weekday labels,
// return day, origin rules, legacy compatibility and no fixed place-count limit.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const read=n=>fs.readFileSync(path.join(__dirname,'../web/assets/core-src',n),'utf8');
const profile=read('10-recommendation-and-profile.js'),engine=read('30-itinerary-engine-and-ui.js');
const c=vm.createContext({});
vm.runInContext(profile.slice(0,profile.indexOf('function newPlan(){'))+engine.slice(0,engine.indexOf('function hbApplyScheduleFromSelection(){')),c);
const J=x=>JSON.parse(JSON.stringify(x));

test('typed clock input normalizes to 24-hour HH:MM',()=>{
 const ok={'7:30':'07:30','07:30':'07:30','0730':'07:30','730':'07:30','19:05':'19:05','7.30':'07:30','7':'07:00','19':'19:00',
  '00:00':'00:00','0':'00:00','23:59':'23:59','4:05':'04:05',' 07 : 30 ':'07:30','０７３０':'07:30','오후 7:30':'19:30','오전 12:10':'00:10',
  '오후12:00':'12:00','7pm':'19:00','7시 30분':'07:30','19시':'19:00','오전7시5분':'07:05'};
 for(const [raw,value] of Object.entries(ok))assert.deepEqual(J(c.hbParseClockInput(raw)),{value,error:''},raw);
 assert.deepEqual(J(c.hbParseClockInput('')),{value:'',error:''});
 assert.deepEqual(J(c.hbParseClockInput(null)),{value:'',error:''});
});

test('invalid clock input explains why',()=>{
 const cases={'24:00':/자정은 00:00/,'2400':/자정은 00:00/,'25:00':/0~23/,'7:60':/00~59/,'0790':/00~59/,'오후 13:00':/1~12시/,
  '오전 0:30':/1~12시/,'7:3':/7:30, 0730/,'abc':/7:30, 0730/,'12345':/7:30, 0730/,'7:30:00':/7:30, 0730/,['1'.repeat(30)]:/7:30, 0730/};
 for(const [raw,reason] of Object.entries(cases)){
  const r=c.hbParseClockInput(raw);
  assert.equal(r.value,'',raw);
  assert.match(r.error,reason,raw);
 }
});

test('home time validation: same day must be ordered, later return day crosses midnight',()=>{
 assert.equal(c.hbHomeTimeErrors('','').length,0);
 assert.equal(c.hbHomeTimeErrors('04:30','22:00').length,0);
 assert.equal(c.hbHomeTimeErrors('0430','2200').length,0);
 const same=c.hbHomeTimeErrors('14:00','13:00');
 assert.equal(same.length,1);
 assert.match(same[0],/종료 시간/);
 assert.match(same[0],/다음 날/);
 assert.equal(c.hbHomeTimeErrors('22:00','01:00',1,'day').length,0);
 assert.equal(c.hbHomeTimeErrors('08:00','18:00',3,'overnight').length,0);
 assert.match(c.hbHomeTimeErrors('08:00','18:00',3,'day')[0],/날짜를 다시/);
 assert.match(c.hbHomeTimeErrors('08:00','18:00',7,'overnight')[0],/날짜를 다시/);
 assert.match(c.hbHomeTimeErrors('8:70','')[0],/여행 출발 희망 시각: .*00~59/);
 assert.match(c.hbHomeTimeErrors('','25')[0],/집 도착 희망 시각: .*0~23/);
});

test('Seoul calendar weekday labels and return day options',()=>{
 assert.deepEqual(J(c.hbTravelWeekday('2026-11-28')),{date:'2026-11-28',index:6,short:'토',label:'11월 28일 (토)'});
 assert.equal(c.hbTravelWeekday('2026-11-28',1).label,'11월 29일 (일)');
 assert.equal(c.hbTravelWeekday('2026-12-31',1).label,'1월 1일 (금)');
 assert.equal(c.hbTravelWeekday('2028-02-28',1).label,'2월 29일 (화)');
 assert.equal(c.hbTravelWeekday('2026-11-26').short,'목');
 for(const bad of ['','2026-02-30','2026/11/28',null,'2026-11-28T00:00'])assert.equal(c.hbTravelWeekday(bad),null,String(bad));
 assert.equal(c.hbClockSummary('2026-11-28','0730',0,'출발'),'11월 28일 (토) 07:30 출발');
 assert.equal(c.hbClockSummary('2026-11-28','18:00',1,'도착'),'11월 29일 (일) 18:00 도착');
 assert.match(c.hbClockSummary('2026-11-28','',0,'출발'),/비우면 일정에 맞춰 제안/);
 assert.equal(c.hbClockSummary('','07:30',0,'출발'),'여행 날짜를 먼저 선택해 주세요.');
 assert.match(c.hbClockSummary('2026-11-28','25:00',0,'출발'),/다시 확인/);
 assert.equal(c.hbReturnDay(0,'day'),0);assert.equal(c.hbReturnDay(1,'day'),1);assert.equal(c.hbReturnDay(2,'day'),null);
 assert.equal(c.hbReturnDay(6,'overnight'),6);assert.equal(c.hbReturnDay('x','overnight'),null);assert.equal(c.hbReturnDay(undefined,'day'),0);
});

test('travel input carries the new home-time errors without breaking legacy fields',()=>{
 const base={region:'서울',date:'2099-11-28',hbWalkConfirmed:true,walk:'15',hbStairsChoice:'avoid'};
 assert.equal(c.hbTravelInput(base,'2026-11-26').errors.length,0);
 assert.equal(c.hbTravelInput({...base,hbDepartTime:'07:30',hbReturnTime:'19:00'},'2026-11-26').errors.length,0);
 assert.ok(c.hbTravelInput({...base,hbDepartTime:'25:00'},'2026-11-26').errors.some(e=>e.includes('여행 출발 희망 시각')));
 // Legacy first-visit window still validated with its own rule.
 assert.ok(c.hbTravelInput({...base,hbPlanStart:'14:00',hbPlanEnd:'13:00'},'2026-11-26').errors.length);
});

test('home window: departure adds a labelled placeholder, legacy first-visit times win',()=>{
 const home=c.hbHomeWindow({depart:'07:30',returnTime:'19:00',originSet:false});
 assert.equal(home.start,'07:55');assert.equal(home.end,'18:35');assert.equal(home.source,'home');
 assert.equal(home.homeDeparture.basis,'placeholder');
 assert.ok(home.warnings[0].includes('출발지를 입력하면 이동시간을 계산해요')&&home.warnings[0].includes('약 25분, 예상'));
 assert.ok(c.hbHomeWindow({depart:'07:30',originSet:true}).warnings[0].includes('실제 자동차 이동시간으로 맞출 수'));
 const legacy=c.hbHomeWindow({planStart:'11:00',planEnd:'17:00',depart:'07:30'});
 assert.equal(legacy.start,'11:00');assert.equal(legacy.end,'17:00');assert.equal(legacy.source,'first_visit');assert.equal(legacy.homeDeparture,null);
 assert.ok(legacy.warnings[0].includes('첫 방문지'));
 assert.equal(c.hbHomeWindow({}).source,'automatic');
 assert.match(c.hbHomeWindow({depart:'23:50'}).errors[0],/자정/);
 assert.match(c.hbHomeWindow({returnTime:'00:10'}).errors[0],/너무 일러/);
 assert.ok(c.hbHomeWindow({depart:'10:00',returnTime:'10:30'}).errors.length);
 const nextDay=c.hbHomeWindow({depart:'20:00',returnTime:'01:00',returnDay:1});
 assert.equal(nextDay.errors.length,0);assert.equal(nextDay.end,'');assert.equal(nextDay.homeReturn.dayOffset,1);
 assert.ok(nextDay.warnings.some(w=>w.includes('다음 날 01:00')));
});

test('legacy saved first-visit times are not reinterpreted when building a draft',()=>{
 const places=[{id:'a',name:'A',kind:'spot'},{id:'b',name:'B',kind:'spot'}];
 const legacy=c.hbHomeWindow({planStart:'11:00',planEnd:'',depart:'',returnTime:''});
 const draft=c.hbCreateSchedule(['a','b'],places,{start:legacy.start,end:legacy.end});
 assert.equal(draft.stops[0].time,'11:00');
 const home=c.hbHomeWindow({depart:'11:00'});
 assert.equal(c.hbCreateSchedule(['a','b'],places,{start:home.start,end:home.end}).stops[0].time,'11:25');
});

test('no fixed sight or restaurant count: 8 sights and 3 restaurants still produce a draft',()=>{
 const places=[...Array.from({length:8},(_,i)=>({id:'s'+i,name:'관광'+i,kind:'spot'})),{id:'f1',name:'식당1',kind:'food'},{id:'f2',name:'식당2',kind:'food'},{id:'f3',name:'식당3',kind:'food'}];
 const all=places.map(p=>p.id);
 const free=c.hbCreateSchedule(all,places,{start:'08:00'});
 assert.equal(free.errors.length,0);
 assert.equal(free.summary.sightCount,8);assert.equal(free.summary.foodCount,3);
 const placed=free.stops.filter(x=>x.placeId).map(x=>x.placeId);
 assert.equal(placed.length+free.summary.unscheduled.length,11);
 assert.ok(free.warnings.some(w=>w.startsWith('예상 소요: 약 ')));
 assert.equal(free.summary.overrunMinutes,0);
 const bounded=c.hbCreateSchedule(all.slice(0,6),places,{start:'09:00',end:'15:00'});
 assert.equal(bounded.errors.length,0);
 assert.ok(bounded.summary.overrunMinutes>0);
 assert.match(bounded.warnings[0],/약 .*초과해요/);
 assert.match(bounded.warnings[0],/다음 날로 나누기/);
 assert.match(bounded.warnings[0],/관광5/);
 assert.equal(bounded.summary.windowEnd,null);
 // Same-day contract: blocks past midnight are listed, never silently dropped.
 const late=c.hbCreateSchedule(all,places,{start:'18:00'});
 assert.equal(late.errors.length,0);
 assert.ok(late.summary.unscheduled.length>0);
 assert.ok(late.warnings[0].startsWith('자정 전에 넣지 못한 장소'));
 for(const stop of late.stops)assert.ok(c.hbDraftMinute(stop.time)+stop.stayMinutes<=1439);
 // Ten places with no time chosen: a draft without overrun warnings, with estimated duration.
 const auto=c.hbCreateSchedule(all.slice(0,10),places,{});
 assert.equal(auto.errors.length,0);
 assert.ok(!auto.warnings.some(w=>w.includes('초과해요')));
});

test('existing 2-sight + 1-restaurant layout and protection are unchanged',()=>{
 const places=[{id:'a',name:'A',kind:'spot'},{id:'b',name:'B',kind:'spot'},{id:'f',name:'F',kind:'food'}];
 const d=c.hbCreateSchedule(['a','b','f'],places,{start:'10:00',restIntervalMinutes:45});
 assert.deepEqual(J(d.stops.map(x=>x.kind)),['spot','rest','food','spot','rest']);
 const locked=d.stops.map((x,i)=>i===2?{...x,reserved:true}:x);
 assert.equal(c.hbShiftDraft(locked,10,{}).ok,false);
 assert.equal(c.hbEditDraftStop(locked,2,'duration','30').ok,false);
});

test('shift draft keeps same day and window',()=>{
 const items=[{time:'10:00',plannedArrival:'10:00',stayMinutes:60},{time:'11:30',plannedArrival:'11:30',stayMinutes:60}];
 const r=c.hbShiftDraft(items,18,{});
 assert.equal(r.ok,true);assert.deepEqual(J(r.stops.map(x=>x.time)),['10:18','11:48']);
 assert.equal(items[0].time,'10:00');
 assert.equal(c.hbShiftDraft(items,0).ok,false);
 assert.equal(c.hbShiftDraft(items,-700).ok,false);
 assert.equal(c.hbShiftDraft(items,700).ok,false);
 assert.equal(c.hbShiftDraft(items,30,{windowEnd:'12:00'}).ok,false);
 assert.equal(c.hbShiftDraft([],5).ok,false);
});

test('desired departure comparison uses verified legs only',()=>{
 const stop=(id,t)=>({id,placeId:id,kind:'spot',name:id,time:t,plannedArrival:t,stayMinutes:60});
 const items=[stop('a','10:00'),stop('b','12:00')];
 const origin=c.hbTripPoint({lat:37.51,lng:127.05},'current_location');
 const key=c.hbTripEndpointTimes(items,{origin}).key;
 const unverified=c.hbDesiredDepartureCheck(items,{origin},{time:'09:00',bufferMinutes:25});
 assert.equal(unverified.status,'unverified');assert.match(unverified.message,/약 25분 \(예상\)/);
 const leg=m=>({origin,result:{key,legs:[{kind:'departure',stopId:'a',status:'estimated',minutes:m,source:'naver_directions',checkedAt:'2026-11-26T00:00:00Z'}]}});
 const late=c.hbDesiredDepartureCheck(items,leg(78),{time:'09:00'});
 assert.equal(late.status,'mismatch');assert.equal(late.delta,18);assert.equal(late.canApply,true);assert.match(late.message,/10:18/);
 assert.equal(c.hbDesiredDepartureCheck(items,leg(60),{time:'09:00'}).status,'aligned');
 assert.equal(c.hbDesiredDepartureCheck(items,leg(90),{time:'23:00'}).status,'overflow');
 assert.equal(c.hbDesiredDepartureCheck(items,leg(60),null),null);
});

test('origin: denied or failed location leaves no origin; map state is never an origin',()=>{
 const ui=engine.slice(engine.indexOf('function hbLocateTripPoint('),engine.indexOf('function hbTripPointPlaces('));
 const ctx=vm.createContext({});
 vm.runInContext(engine.slice(0,engine.indexOf('function hbApplyScheduleFromSelection(){'))+ui,ctx);
 const run=geo=>{let out;ctx.hbLocateTripPoint((point,message)=>{out={point,message}},geo);return out};
 const denied=run({getCurrentPosition:(_ok,fail)=>fail({code:1})});
 assert.equal(denied.point,null);assert.match(denied.message,/권한이 꺼져/);assert.match(denied.message,/출발지는 설정되지 않았어요/);
 assert.equal(run({getCurrentPosition:(_ok,fail)=>fail({code:3})}).point,null);
 assert.equal(run({getCurrentPosition:(_ok,fail)=>fail({code:2})}).point,null);
 assert.equal(run(null).point,null);
 assert.equal(run({getCurrentPosition:()=>{throw Error('blocked')}}).point,null);
 assert.equal(run({getCurrentPosition:ok=>ok({coords:{latitude:35.68,longitude:139.76}})}).point,null);
 const granted=run({getCurrentPosition:ok=>ok({coords:{latitude:37.56651,longitude:126.97801}})});
 assert.deepEqual(J(granted.point),{source:'current_location',label:'현재 위치',lat:37.567,lng:126.978});
 // A legacy/map-centre source is rejected, and the planner never reads the home map centre.
 assert.equal(c.hbTripPoint({lat:37.5665,lng:126.978},'map_center','서울 시청'),null);
 assert.ok(!engine.includes('nearbyCenter'));
 assert.ok(!profile.slice(profile.indexOf('function hbClockField('),profile.indexOf('function newPlan(){')).includes('nearbyCenter'));
});

test('MVP wording: drafts and legacy saved warnings show no unconfirmed-information phrases',()=>{
 const banned=/미확인|확인되지 않|확인 불가|미입력|확인 전이에요|검증되지|실제 이동시간 아님|미지원|안전/;
 const places=[{id:'a',name:'A',kind:'spot'},{id:'b',name:'B',kind:'spot'}];
 const draft=c.hbCreateSchedule(['a','b'],places,{start:'10:00',slopePreference:'avoid_steep',indoorPreference:'indoor',tripType:'overnight'});
 for(const w of draft.warnings)assert.doesNotMatch(w,banned,w);
 assert.ok(draft.warnings.some(w=>w.includes('약 25분 (예상)')));
 for(const stop of draft.stops)assert.doesNotMatch(stop.name,/미정/);
 for(const w of c.hbHomeWindow({depart:'07:30',returnTime:'19:00'}).warnings)assert.doesNotMatch(w,banned,w);
 const legacy=['장소 간 이동은 실제 경로 소요시간이 아니라 임시 여유 시간 25분으로 배치했어요. 실제 이동·보행시간은 미확인입니다.',
  '모든 방문지의 영업시간·시설 운영·예약 가능 여부는 확인 전이에요.','휴식 블록은 휴식 장소가 지정된 상태가 아니에요.',
  '경사 회피 선호가 있지만 실제 경사·계단 없는 동선이 검증되지 않았어요. 방문 전 확인이 필요해요.','요청한 휴식 간격 45분에 맞춰 관광지 체류시간 초안을 45분으로 조정했어요.',null];
 const shown=c.hbVisiblePlanWarnings(legacy);
 assert.deepEqual(J(shown),['장소 사이 이동은 약 25분 (예상)으로 넣었어요. 자동차 이동시간을 확인하면 실제 경로 시간으로 바꿀 수 있어요.','요청한 휴식 간격 45분에 맞춰 관광지 체류시간 초안을 45분으로 조정했어요.']);
 assert.match(c.hbVisiblePlanWarnings(legacy,true)[0],/네이버 경로로 반영/);
 assert.deepEqual(J(c.hbVisiblePlanWarnings(undefined)),[]);
 for(const status of ['no_point','unchecked','stale','no_anchor'])assert.doesNotMatch(c.hbTripEndpointLine('departure',{status},{}),banned);
 assert.equal(c.hbTripEndpointLine('departure',{status:'no_point'},{}),'집 출발 예상: 출발지를 입력하면 이동시간을 계산해요');
});
