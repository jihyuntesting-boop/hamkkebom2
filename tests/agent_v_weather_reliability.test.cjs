'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {makeClient,getWeather,FORECAST}=require('../web/server/weather-provider.cjs');
const {getAlerts}=require('../web/server/weather-alerts.cjs');
const NOW=Date.parse('2026-11-25T20:30:00+09:00');
const q={region:'서울',date:'2026-11-25'};
const envelope=(rows,count=rows.length,pageNo=1)=>({response:{header:{resultCode:'00'},body:{totalCount:count,pageNo,items:{item:rows}}}});
const reply=body=>({ok:true,status:200,text:async()=>JSON.stringify(body)});
const params={base_date:'20261125',base_time:'2000',nx:60,ny:127};
const rows=Array.from({length:1001},(_,i)=>({baseDate:'20261125',baseTime:'2000',fcstDate:'20261125',fcstTime:'2100',nx:60,ny:127,category:'fixture'+i,fcstValue:'0'}));
test('complete two pages, coalesce and canonicalize cache key',async()=>{
  const calls=[];
  const c=makeClient({key:'fixture',fetchImpl:async u=>{const p=Number(u.searchParams.get('pageNo'));calls.push(p);return reply(p===1?envelope(rows.slice(0,1000),1001):envelope(rows.slice(1000),1001,2));}});
  const [a,b]=await Promise.all([c.get(FORECAST,params),c.get(FORECAST,{nx:60,ny:127,base_time:'2000',base_date:'20261125'})]);
  assert.equal(a.response.body.items.item.length,1001);assert.deepEqual(a,b);
  await c.get(FORECAST,params);assert.deepEqual(calls,[1,2]);
});
test('truncated second page is never cached',async()=>{
  let calls=0;
  const c=makeClient({key:'fixture',fetchImpl:async u=>{calls++;return reply(u.searchParams.get('pageNo')==='1'?envelope(rows.slice(0,1000),1001):envelope([],1001,2));}});
  for(let i=0;i<2;i++)await assert.rejects(c.get(FORECAST,params),e=>['invalid_provider_payload','incomplete_kma_page'].includes(e.code));
  assert.equal(calls,4);
});
test('duplicate or mismatched pages are rejected',async()=>{
  const c=makeClient({key:'fixture',fetchImpl:async u=>reply(u.searchParams.get('pageNo')==='1'?envelope(rows.slice(0,1000),1001):envelope([rows[0]],1001,2))});
  await assert.rejects(c.get(FORECAST,params),e=>e.code==='duplicate_forecast_item');
});
test('uncooperative response body cannot exceed bounded attempts',async()=>{
  let calls=0;
  const c=makeClient({key:'fixture',timeoutMs:10,budgetMs:100,fetchImpl:async()=>{calls++;return {ok:true,status:200,text:()=>new Promise(()=>{})};}});
  await assert.rejects(c.get(FORECAST,params),e=>e.code==='timeout');
  assert.equal(calls,2);
});
test('per-second quota code 23 cools down without retry',async()=>{
  let calls=0;
  const c=makeClient({key:'fixture',fetchImpl:async()=>{calls++;return reply({response:{header:{resultCode:'23'}}});}});
  await assert.rejects(c.get(FORECAST,params),e=>e.code==='rate_limited');
  await assert.rejects(c.get(FORECAST,{...params,nx:61}),e=>e.code==='rate_limited');
  assert.equal(calls,1);
});
test('provider-invalid data produces error rather than client-invalid or sunny',async()=>{
  const x=await getWeather(q,{now:NOW,client:{get:async()=>envelope([{...rows[0],category:'TMP',fcstValue:'invalid'}])}});
  assert.equal(x.status,'error');assert.equal(x.summary,null);assert.equal(x.mode,'unavailable');
});
test('pending warning cannot be reported as none',async()=>{
  const pending={areaName:'서울서북권',areaCode:'fixture',warnVar:2,warnStress:0,command:1,cancel:0,tmFc:'202611252000',startTime:'202611252100'};
  const snap={tmFc:'202611252000',tmEf:'202611252000',t6:'특보 없음'};
  const x=await getAlerts(q,{now:NOW,client:{get:async path=>envelope(path.endsWith('getPwnStatus')?[snap]:[pending])}});
  assert.equal(x.status,'unknown');assert.equal(x.events[0].state,'pending');
});
test('forecast before issue is rejected',async()=>{
  const x=await getWeather(q,{now:NOW,client:{get:async()=>envelope([{...rows[0],fcstTime:'1900',category:'TMP',fcstValue:'1'}])}});
  assert.equal(x.status,'error');assert.equal(x.reason,'forecast_before_issue');
});

test('empty status uses one nationwide bulletin fallback with strict KST effective time',async()=>{
  const calls=[];
  const row={stnId:108,tmFc:'202611252000',t5:'2026년 11월 25일(수) 20:00 이후',t6:'o 호우주의보 : 서울서북권'};
  const event={areaName:'서울서북권',areaCode:'fixture',warnVar:2,warnStress:0,command:1,cancel:0,tmFc:'202611252000',startTime:'202611252000'};
  const x=await getAlerts(q,{now:NOW,client:{get:async(path,params)=>{calls.push(path);if(path.endsWith('getPwnStatus'))return envelope([]);if(path.endsWith('getWthrWrnMsg')){assert.equal(params.stnId,108);return envelope([row]);}return envelope([event]);}}});
  assert.equal(x.status,'active');assert.equal(x.snapshotEvidence.operation,'getWthrWrnMsg');
  assert.equal(x.issuedAt,'2026-11-25T20:00:00+09:00');assert.equal(x.snapshotEvidence.fallbackCount,1);
  assert.equal(calls.length,3);
});
test('local or malformed bulletin cannot establish nationwide absence',async()=>{
  for(const row of [{stnId:109,tmFc:'202611252000',t5:'202611252000',t6:'특보 없음'},{stnId:108,tmFc:'202611252000',t5:'unknown',t6:'특보 없음'}]){
    const x=await getAlerts(q,{now:NOW,client:{get:async path=>envelope(path.endsWith('getWthrWrnMsg')?[row]:[])}});
    assert.equal(x.status,'unknown');assert.equal(x.snapshotEvidence.operation,'getPwnStatus');
  }
});
test('fallback failure stays unknown and is observable, not none',async()=>{
  const x=await getAlerts(q,{now:NOW,client:{get:async path=>{if(path.endsWith('getWthrWrnMsg'))throw new (require('../web/server/weather-provider.cjs').WeatherError)('authentication_failed');return envelope([]);}}});
  assert.equal(x.status,'unknown');assert.equal(x.snapshotEvidence.fallbackStatus,'authentication_failed');
});
test('no bulletin call on primary auth or quota failure',async()=>{
  let fallback=0;
  const x=await getAlerts(q,{now:NOW,client:{get:async path=>{if(path.endsWith('getPwnStatus'))throw new (require('../web/server/weather-provider.cjs').WeatherError)('rate_limited');if(path.endsWith('getWthrWrnMsg'))fallback++;return envelope([]);}}});
  assert.equal(x.status,'error');assert.equal(x.reason,'rate_limited');assert.equal(fallback,0);
});

test('parent Seoul scope never expands a different district to whole city',async()=>{
  const {snapshotState}=require('../web/server/weather-alerts.cjs');
  const snapshot={tmFc:'202611252000',tmEf:'202611252000',t6:'o 건조주의보 : 서울(서울동북권, 서울서남권)'};
  const area={names:['서울','서울서북권']};
  const state=snapshotState([snapshot],area,NOW);
  assert.equal(state.state,'regional_none');assert.equal(state.matches.length,0);
  const active={areaName:'서울',areaCode:'fixture',warnVar:4,warnStress:0,command:1,cancel:0,tmFc:'202611252000',startTime:'202611252000'};
  const x=await getAlerts(q,{now:NOW,client:{get:async path=>envelope(path.endsWith('getPwnStatus')?[snapshot]:[active])}});
  assert.equal(x.status,'unknown');
});
test('complete nationwide snapshot outside reference area proves scoped absence only',async()=>{
  const snapshot={tmFc:'202611252000',tmEf:'202611252000',t6:'o 강풍주의보 : 강원도(속초평지, 양양산지)\no 풍랑주의보 : 동해중부바깥먼바다\no 건조주의보 : 경상북도(울진평지)'};
  for(const region of ['서울','경기']){
    const x=await getAlerts({...q,region},{now:NOW,client:{get:async path=>envelope(path.endsWith('getPwnStatus')?[snapshot]:[])}});
    assert.equal(x.status,'none');assert.equal(x.reason,'complete_snapshot_region_not_listed');
    assert.equal(x.snapshotEvidence.complete,true);
  }
});
test('ambiguous exclusion, unknown place and newer pending bulletin never prove absence',async()=>{
  const {snapshotState}=require('../web/server/weather-alerts.cjs');
  const area={names:['서울','서울서북권']};
  const snap=t6=>({tmFc:'202611252000',tmEf:'202611252000',t6});
  for(const text of ['o 호우주의보 : 수도권','o 호우주의보 : 서울(서울서북권 제외)','o 호우주의보 : 광주','unrecognized']){
    assert.equal(snapshotState([snap(text)],area,NOW).state,'unknown');
  }
  assert.equal(snapshotState([snap('o 강풍주의보 : 강원도(속초평지)'),{tmFc:'202611252010',tmEf:'202611252100',t6:'o 호우주의보 : 서울서북권'}],area,NOW).state,'unknown');
});
test('Gyeonggi and Gwangju cannot be conflated; grouped local names supported',()=>{
  const {snapshotState}=require('../web/server/weather-alerts.cjs');
  const snap=t6=>({tmFc:'202611252000',tmEf:'202611252000',t6});
  assert.equal(snapshotState([snap('o 호우주의보 : 경기도(광주시, 수원시)')],{names:['광주']},NOW).state,'matched');
  assert.equal(snapshotState([snap('o 호우주의보 : 광주광역시')],{names:['광주']},NOW).state,'regional_none');
  assert.equal(snapshotState([snap('o 호우주의보 : 광주')],{names:['광주']},NOW).state,'unknown');
});

test('KST labelled current status and unrelated pending bulletin can prove scoped absence',()=>{
  const {snapshotState}=require('../web/server/weather-alerts.cjs');
  const area={names:['서울','서울서북권']};
  const rows=[{tmFc:'202611252000',tmEf:'2026년 11월 25일(수) 20시 00분 이후',t6:'특보 발효현황\no 강풍주의보 : 강원도(속초평지)'},{tmFc:'202611252010',tmEf:'202611252100',t6:'o 호우주의보 : 경기도(수원)'}];
  const x=snapshotState(rows,area,NOW);
  assert.equal(x.state,'regional_none');assert.equal(x.newerPending,true);assert.equal(x.pendingScopeClear,true);
});
test('explicit none does not conceal later relevant or ambiguous bulletin',()=>{
  const {snapshotState}=require('../web/server/weather-alerts.cjs');
  const area={names:['서울','서울서북권']};
  const prior={tmFc:'202611252000',tmEf:'202611252000',t6:'특보 없음'};
  for(const t6 of ['o 강풍주의보 : 서울서북권','o 강풍주의보 : 수도권']){
    const x=snapshotState([prior,{tmFc:'202611252010',tmEf:'202611252100',t6}],area,NOW);
    assert.equal(x.state,'unknown');assert.equal(x.pendingScopeClear,false);
  }
});

test('official Jeonbuk alias in a remote island warning cannot block verified Seoul/Gyeonggi scope',()=>{
  const {snapshotState}=require('../web/server/weather-alerts.cjs');
  const rows=[
    {tmFc:'202611252000',tmEf:'202611252000',t6:'o 강풍주의보 : 전북자치도(군산어청도), 강원도(속초평지)'},
    {tmFc:'202611252010',tmEf:'202611252100',t6:'o 강풍주의보 : 전북자치도(군산어청도)'}
  ];
  for(const names of [['서울','서울서북권'],['수원']]){
    const x=snapshotState(rows,{names},NOW);
    assert.equal(x.state,'regional_none');
    assert.equal(x.complete,true);
    assert.equal(x.pendingScopeClear,true);
    assert.equal(x.unresolvedEntries,0);
  }
});
