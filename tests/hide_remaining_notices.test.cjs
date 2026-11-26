'use strict';
// 2026-11-26 사용자 결정(MVP): 특보 안내의 '실내라고 안전이 보장되는 것은 아니에요.' 문장과
// 장소 찾기 판정 패널의 '현장 동선·영업시간·실제 보행 거리는 별도로 확인해 주세요.' 문장은 화면에 나오지 않는다.
// 발효 특보 정보(종류·지역·발효 시각), 특보 안내의 나머지 문장, 판정 요약은 그대로 둔다. Fixtures only.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const read=n=>fs.readFileSync(path.join(__dirname,'../web/assets/core-src',n),'utf8');
const s10=read('10-recommendation-and-profile.js'),s30=read('30-itinerary-engine-and-ui.js'),s40=read('40-sharing-and-data.js');
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const INDOOR=/실내라고 안전이 보장되는 것은 아니에요/;
const FIELD=/현장 동선·영업시간·실제 보행 거리는 별도로 확인해 주세요/;
const GUARANTEE=/안전이 보장|안전합니다|안전 보장|보장해요|보장합니다/;

const cardSrc=s40.slice(s40.indexOf('let forecast ='),s40.indexOf('async function hbTravelRequest'));
function weatherCtx(forecast){
 const ctx=vm.createContext({s:{region:'서울',date:'2026-11-27',stops:[]},path:()=>'/places',URLSearchParams,queueMicrotask:()=>{},safe,
  document:{querySelector:()=>null,querySelectorAll:()=>[]},HB_WEATHER_SUGGEST_RULE:{wetTypes:['비','비 또는 눈','눈','소나기'],wetProbabilityPercent:60,hotTemperatureC:31,coldTemperatureC:-5}});
 vm.runInContext(cardSrc.replace(/const HB_WEATHER_SUGGEST_RULE=Object\.freeze\(\{[\s\S]*?\}\);/,''),ctx);
 ctx.forecast={key:JSON.stringify(['서울','2026-11-27']),...forecast};
 vm.runInContext('forecast=this.forecast',ctx);
 return ctx;
}

test('active warning: caution message drops the indoor-safety sentence, warning details and actions stay',()=>{
 const ctx=weatherCtx({state:'available',data:{summary:'기온 2°C · 비',precipitationType:'비',issuedAt:'2026-11-26T05:00:00+09:00'},
  alerts:{status:'active',effectiveAt:'2026-11-26T07:00:00+09:00',active:[{hazard:'호우',severity:'주의보',areaName:'서울'}]}});
 const rec=vm.runInContext('hbWeatherRecommendation(forecast,currentWeatherKey())',ctx);
 assert.equal(rec.kind,'caution');
 assert.equal(rec.message,'기상특보가 확인됐어요. 날짜 변경이나 이동을 줄인 코스를 먼저 검토해 주세요.');
 const card=vm.runInContext('weatherCard()',ctx);
 assert.doesNotMatch(card,INDOOR);assert.doesNotMatch(card,GUARANTEE);
 assert.match(card,/발효 중인 특보: 호우주의보\(서울\) \/ 발효 2026-11-26 07:00 KST/);
 assert.match(card,/기상특보가 확인됐어요\. 날짜 변경이나 이동을 줄인 코스를 먼저 검토해 주세요\./);
 assert.match(card,/id="hb-weather-short"/);assert.match(card,/id="hb-weather-date"/);
});

test('plan warnings: saved drafts keep the warning text but never show the indoor-safety sentence',()=>{
 const c=vm.createContext({});
 vm.runInContext(s10.slice(0,s10.indexOf('function newPlan(){'))+s30.slice(0,s30.indexOf('function hbApplyScheduleFromSelection(){')),c);
 const saved=['기상특보가 확인됐어요. 날짜 변경이나 이동을 줄인 코스를 먼저 검토해 주세요. 실내라고 안전이 보장되는 것은 아니에요.',
  '실내라고 안전이 보장되는 것은 아니에요.','식당을 고르지 않아 식사 시간만 넣어 두었어요.'];
 assert.deepEqual(JSON.parse(JSON.stringify(c.hbVisiblePlanWarnings(saved))),
  ['기상특보가 확인됐어요. 날짜 변경이나 이동을 줄인 코스를 먼저 검토해 주세요.','식당을 고르지 않아 식사 시간만 넣어 두었어요.']);
 // New drafts take the message from hbWeatherRecommendation, which no longer carries the sentence.
 assert.ok(s30.includes('plan.warnings.unshift(weatherChoice.message)'));
});

test('no core module renders either sentence; the places verdict panel still closes cleanly',()=>{
 for(const [name,src] of [['10',s10],['30',s30],['40',s40]]){
  const code=src.split('\n').filter(l=>!/^\s*\/\//.test(l)).join('\n');
  assert.doesNotMatch(code,/'[^'\n]*실내라고 안전이 보장되는 것은 아니에요\.[^'\n]*'/,name);
  assert.doesNotMatch(code,FIELD,name);
 }
 assert.ok(s10.includes("tripSummary+hbTripQuickConditions()+\n    '</section>'+"),'panel ends right after the condition summary');
});
