'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {getWeather,toGrid,publication,makeClient,FORECAST,WARNING}=require('../web/server/weather-provider.cjs');
const {getAlerts,normalizeEvents,snapshotState,warningAreas}=require('../web/server/weather-alerts.cjs');
const {serveWeather}=require('../web/api/weather.js');
const NOW=Date.parse('2026-11-24T14:25:00+09:00');
const q={region:'서울',date:'2026-11-24'};
const envelope=(rows,code='00',count=rows.length)=>({response:{header:{resultCode:code},body:{totalCount:count,items:{item:rows}}}});
const item=(category,fcstValue,extra={})=>({baseDate:'20261124',baseTime:'1400',fcstDate:'20261124',fcstTime:'1500',nx:60,ny:127,category,fcstValue,...extra});
const forecast=()=>envelope([item('TMP','0'),item('POP','0'),item('PTY','3')]);
const fakeClient=payload=>({get:async()=>payload});
const reply=(body,status=200)=>({status,ok:status>=200&&status<300,text:async()=>typeof body==='string'?body:JSON.stringify(body)});
const row=(extra={})=>({areaName:'서울서북권',areaCode:'fixture-seoul-nw',warnVar:2,warnStress:0,command:1,cancel:0,tmFc:'202611241300',startTime:'202611241400',...extra});
const current=(text='o 호우주의보 : 서울서북권')=>envelope([{tmFc:'202611241400',tmEf:'202611241400',t6:text}]);
const alertClient=(history,snapshot)=>({get:async path=>path.endsWith('getPwnStatus')?snapshot:history});

test('DFS Seoul city hall and Suwon city hall reference examples',()=>{
  assert.deepEqual(toGrid(37.5665,126.978),{nx:60,ny:127});
  assert.deepEqual(toGrid(37.2636,127.0286),{nx:61,ny:120});
  assert.throws(()=>toGrid('',127),/invalid_location/);
});
test('publication delay and KST midnight',()=>{
  assert.equal(publication(Date.parse('2026-11-24T02:09:00+09:00')).base_date,'20261123');
  assert.equal(publication(Date.parse('2026-11-24T02:09:00+09:00')).base_time,'2300');
  assert.equal(publication(Date.parse('2026-11-24T02:10:00+09:00')).base_time,'0200');
  assert.equal(publication(NOW).base_time,'1400');
});
test('direct fixture forecast preserves zero, PTY and location scope',async()=>{
  const x=await getWeather(q,{client:fakeClient(forecast()),now:NOW});
  assert.equal(x.status,'available');assert.equal(x.temperatureC,0);assert.equal(x.precipitationProbabilityPercent,0);
  assert.equal(x.precipitationType,'눈');assert.equal(x.issuedAt,'2026-11-24T14:00:00+09:00');
  assert.equal(x.evidence.representativeAt,'2026-11-24T15:00:00+09:00');
  assert.equal(x.location.scope,'regional_reference');assert.match(x.summary,/0°C/);
});
test('actual destination coordinate used for Gyeonggi grid (fixture)',async()=>{
  const x=await getWeather({region:'경기',date:q.date,lat:37.2636,lng:127.0286},{now:NOW,client:fakeClient(envelope([item('TMP','4',{nx:61,ny:120})]))});
  assert.equal(x.status,'available');assert.deepEqual(x.grid,{nx:61,ny:120});
  assert.equal(x.location.scope,'destination_coordinate');assert.equal(x.precipitationProbabilityPercent,null);
});
test('unsupported date and malformed input do not consume quota',async()=>{
  let count=0;const client={get:async()=>{count++;return forecast();}};
  for(const [query,status] of [[{...q,date:'2026-12-01'},'no_forecast'],[{...q,date:'2026-02-30'},'invalid'],[{...q,lat:'37'},'invalid'],[{...q,region:'부산'},'invalid']]){
    assert.equal((await getWeather(query,{client,now:NOW})).status,status);
  }assert.equal(count,0);
});
test('publication mismatch is an error and missing fields never become zero',async()=>{
  const x=await getWeather(q,{client:fakeClient(envelope([item('TMP','7',{baseTime:'1100'})])),now:NOW});
  assert.equal(x.reason,'publication_mismatch');assert.equal(x.summary,null);
  const y=await getWeather(q,{client:fakeClient(envelope([item('TMP','7')])),now:NOW});
  assert.equal(y.precipitationProbabilityPercent,null);
});
test('rollover fallback occurs once and older issue becomes stale at policy limit',async()=>{
  const calls=[];
  const x=await getWeather(q,{now:NOW,client:{get:async(path,params)=>{
    calls.push(params.base_time);return params.base_time==='1400'?envelope([]):envelope([item('TMP','3',{baseTime:'1100'})]);
  }}});
  assert.deepEqual(calls,['1400','1100']);assert.equal(x.status,'available');
  assert.equal(x.issuedAt,'2026-11-24T11:00:00+09:00');
});
test('transport caches and coalesces, decoded key is encoded exactly once',async()=>{
  let calls=0;
  const client=makeClient({key:'fake%2Bkey%3D',clock:()=>NOW,fetchImpl:async url=>{
    calls++;assert.equal(url.searchParams.get('serviceKey'),'fake+key=');assert.equal(url.hostname,'apis.data.go.kr');return reply(forecast());
  }});
  const params={nx:60,ny:127};
  await Promise.all([client.get(FORECAST,params),client.get(FORECAST,params)]);
  await client.get(FORECAST,params);assert.equal(calls,1);
});
test('authentication, quota, upstream, empty and malformed response are distinct',async()=>{
  for(const [response,reason,expectedCalls] of [[reply('',403),'authentication_failed',1],[reply('',429),'rate_limited',1],[reply('',500),'provider_unavailable',2],[reply(''),'empty_response',1],[reply('bad'),'invalid_provider_payload',1],[reply(envelope([],'30')),'authentication_failed',1]]){
    let calls=0;
    const client=makeClient({key:'fixture',fetchImpl:async()=>{calls++;return response;}});
    await assert.rejects(client.get(FORECAST,{}),e=>e.code===reason);assert.equal(calls,expectedCalls);
  }
});
test('timeout retry bounded and errors do not expose keys',async()=>{
  let calls=0;
  const client=makeClient({key:'fixture-secret',timeoutMs:5,fetchImpl:async(_url,{signal})=>new Promise((resolve,reject)=>{
    calls++;signal.addEventListener('abort',()=>reject(new Error('fixture-secret')),{once:true});
  })});
  await assert.rejects(client.get(FORECAST,{}),e=>e.code==='timeout'&&!e.message.includes('fixture-secret'));
  assert.equal(calls,2);
});
test('XML gateway no-data is an empty envelope; quota does not retry',async()=>{
  const client=makeClient({key:'fixture',fetchImpl:async()=>reply('<returnReasonCode>03</returnReasonCode>')});
  assert.equal((await client.get(FORECAST,{})).response.body.totalCount,0);
});
test('warning: active requires matching snapshot and exact area',async()=>{
  const x=await getAlerts(q,{now:NOW,client:alertClient(envelope([row()]),current())});
  assert.equal(x.status,'active');assert.equal(x.active[0].hazard,'호우');
  assert.equal(x.active[0].effectiveAt,'2026-11-24T14:00:00+09:00');
  const y=await getAlerts(q,{now:NOW,client:alertClient(envelope([row({areaName:'서울동남권'})]),current())});
  assert.equal(y.status,'unknown');
});
test('warning: ended versus pending release and cancelled events',()=>{
  const area={names:['서울서북권']};
  const ended=row({command:2,tmFc:'202611241410',endTime:'202611241420'});
  const pending=row({command:2,tmFc:'202611241410',endTime:'202611241500'});
  assert.equal(normalizeEvents([row(),ended],area,NOW).events[0].state,'ended');
  assert.deepEqual(normalizeEvents([row(),pending],area,NOW).events.map(e=>e.state),['active','pending_end']);
  assert.equal(normalizeEvents([row({cancel:1})],area,NOW).events.length,0);
});
test('warning: explicit fresh nationwide none, stale snapshot, empty and failed are different',async()=>{
  const x=await getAlerts(q,{now:NOW,client:alertClient(envelope([]),current('현재 발효 중인 특보는 없습니다.'))});
  assert.equal(x.status,'none');
  const old=envelope([{tmFc:'202611221400',tmEf:'202611221400',t6:'특보 없음'}]);
  assert.equal((await getAlerts(q,{now:NOW,client:alertClient(envelope([]),old)})).status,'stale');
  assert.equal((await getAlerts(q,{now:NOW,client:alertClient(envelope([]),envelope([]))})).status,'unknown');
  assert.equal((await getAlerts(q,{now:NOW,client:{get:async()=>{throw Error('network');}}})).status,'error');
});
test('destination warnings require server-verified district and do not conflate Gwangju',async()=>{
  const query={region:'경기',date:q.date,lat:'37.2636',lng:'127.0286',district:'수원'};
  const history=envelope([row({areaName:'수원',areaCode:'fixture-suwon'})]);
  const client=alertClient(history,current('o 호우주의보 : 경기도(수원, 성남)'));
  assert.equal((await getAlerts(query,{now:NOW,client})).status,'unknown');
  assert.equal((await getAlerts(query,{now:NOW,client,verifiedDistrict:'수원'})).status,'active');
  assert.equal(snapshotState([{tmFc:'202611241400',tmEf:'202611241400',t6:'o 호우주의보 : 광주'}],{names:['광주']},NOW).state,'unknown');
});
test('API contract: GET/legacy query/status and malformed query',async()=>{
  const res=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
  const result=res();
  await serveWeather({method:'GET',query:{type:'weather',...q}},result,{forecast:async()=>({status:'available',summary:'fixture'})});
  assert.equal(result.code,200);assert.equal(result.body.summary,'fixture');assert.equal(result.headers['Cache-Control'],'no-store');
  const bad=res();await serveWeather({method:'GET',query:{...q,lat:['1','2']}},bad);assert.equal(bad.code,400);
  const denied=res();await serveWeather({method:'POST',query:q},denied);assert.equal(denied.code,405);
  const timeout=res();await serveWeather({method:'GET',query:q},timeout,{forecast:async()=>({status:'error',reason:'timeout'})});assert.equal(timeout.code,504);
});
test('opt-in direct KMA smoke (requires approved key, no raw payload or key output)',{skip:process.env.HB_KMA_LIVE_TEST!=='1'},async()=>{
  assert.ok(process.env.DATA_GO_KR_KEY,'DATA_GO_KR_KEY missing');
  const now=Date.now(),date=new Date(now+9*3600000).toISOString().slice(0,10);
  const client=makeClient();
  const results=await Promise.all([
    getWeather({region:'서울',date,lat:37.5665,lng:126.978},{client,now}),
    getWeather({region:'경기',date,lat:37.2636,lng:127.0286},{client,now}),
    getAlerts({region:'서울',date},{client,now})
  ]);
  for(const x of results.slice(0,2)){
    assert.ok(['available','no_forecast','stale'].includes(x.status),'forecast: '+x.reason);
    assert.ok(x.issuedAt,'forecast issue missing; retry on next publication');
  }
  assert.ok(['active','none','unknown','stale'].includes(results[2].status),'warning: '+results[2].reason);
});
