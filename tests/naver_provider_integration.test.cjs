'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {
  ENDPOINT,OPTION,validCoordinates,configuration,validResponse,getDrivingTime,getDrivingSegments
}=require('../web/server/naver-directions.cjs');

const start={id:'city-hall',lat:37.5665,lng:126.978};
const goal={id:'palace',lat:37.5796,lng:126.977};
const env={
  HB_NAVER_DIRECTIONS_ENABLED:'1',
  HB_NAVER_DIRECTIONS_ID:'test-id',
  HB_NAVER_DIRECTIONS_SECRET:'private-test-secret'
};
const success=(duration=61001)=>({
  status:200,ok:true,json:async()=>({
    code:0,route:{trafast:[{summary:{duration,distance:1200}}]}
  })
});
const safeFetch=()=>assert.fail('provider must not be called');
const query={start,goal,mode:'car'};

test('authenticated call uses GET, lon/lat order and response milliseconds -> rounded minutes',async()=>{
 let calls=0;
 const result=await getDrivingTime(query,{
  env,now:()=>new Date('2026-11-24T00:00:00.000Z'),
  fetcher:async(url,opts)=>{
   calls++;
   assert.equal(new URL(url).origin,new URL(ENDPOINT).origin);
   assert.equal(new URL(url).pathname,new URL(ENDPOINT).pathname);
   assert.equal(new URL(url).searchParams.get('start'),'126.978,37.5665');
   assert.equal(new URL(url).searchParams.get('goal'),'126.977,37.5796');
   assert.equal(new URL(url).searchParams.get('option'),OPTION);
   assert.equal(opts.method,'GET');
   assert.equal(opts.headers['x-ncp-apigw-api-key-id'],env.HB_NAVER_DIRECTIONS_ID);
   assert.equal(opts.headers['x-ncp-apigw-api-key'],env.HB_NAVER_DIRECTIONS_SECRET);
   assert.equal(opts.signal.aborted,false);
   return success();
  }
 });
 assert.equal(calls,1);
 assert.deepEqual(result,{
  status:'estimated',minutes:2,reason:null,source:'naver_directions',
  checkedAt:'2026-11-24T00:00:00.000Z'
 });
 assert.equal(JSON.stringify(result).includes(env.HB_NAVER_DIRECTIONS_SECRET),false);
});

test('disabled and missing keys are fail-closed, no provider request',async()=>{
 for(const change of [
  {HB_NAVER_DIRECTIONS_ENABLED:'0'},
  {HB_NAVER_DIRECTIONS_ENABLED:undefined},
  {HB_NAVER_DIRECTIONS_ID:''},
  {HB_NAVER_DIRECTIONS_SECRET:undefined}
 ]){
  const result=await getDrivingTime(query,{env:{...env,...change},fetcher:safeFetch});
  assert.equal(result.status,'unknown');
  assert.equal(result.minutes,null);
  assert.equal(result.source,null);
  assert.equal(result.checkedAt,null);
  assert.equal(result.reason,/ENABLED/.test(Object.keys(change)[0])?'provider_disabled':'missing_credentials');
 }
 assert.deepEqual(configuration({}),{ready:false,reason:'provider_disabled'});
});

test('401 and 403 authentication failures return unknown, not zero',async()=>{
 for(const status of [401,403]){
  const res=await getDrivingTime(query,{env,fetcher:async()=>({status,ok:false})});
  assert.deepEqual(res,{status:'unknown',minutes:null,reason:'authentication_failed',source:null,checkedAt:null});
 }
});

test('429 rate limit, 500 outage, bad HTTP all leave unknown minutes',async()=>{
 for(const [status,reason] of [[429,'rate_limited'],[500,'upstream_error'],[404,'upstream_error']]){
  const res=await getDrivingTime(query,{env,fetcher:async()=>({status,ok:false})});
  assert.equal(res.reason,reason);
  assert.equal(res.minutes,null);
 }
});

test('official NAVER code 1..5 reports no route even with HTTP 200',async()=>{
 for(const code of [1,2,3,4,5]){
  const res=await getDrivingTime(query,{
   env,fetcher:async()=>({ok:true,status:200,json:async()=>({code,message:'unavailable',route:{}})})
  });
  assert.equal(res.status,'unknown');
  assert.equal(res.reason,'no_route');
  assert.equal(res.minutes,null);
 }
});

test('response schema validation rejects wrong code, empty option, negative or fake duration',async()=>{
 const failures=[
  null,{}, {code:0,route:{}},
  {code:9,route:{trafast:[{summary:{duration:60000}}]}},
  {code:0,route:{traoptimal:[{summary:{duration:60000}}]}},
  {code:0,route:{trafast:[]}},
  ...[0,-1,NaN,Infinity,'90000',1.5,8*86400000].map(duration=>({
   code:0,route:{trafast:[{summary:{duration}}]}
  }))
 ];
 for(const body of failures){
  assert.equal(validResponse(body),null);
  const res=await getDrivingTime(query,{
   env,fetcher:async()=>({ok:true,status:200,json:async()=>body})
  });
  assert.equal(res.reason,'invalid_response');
  assert.equal(res.minutes,null);
 }
 const res=await getDrivingTime(query,{
  env,fetcher:async()=>({ok:true,status:200,json:async()=>{throw new SyntaxError('bad json');}})
 });
 assert.equal(res.reason,'invalid_response');
});

test('valid and invalid coordinates, including non-numeric and out-of-Korea points',async()=>{
 assert.equal(validCoordinates(start),true);
 for(const bad of [null,undefined,[],{lat:37.5},{lat:'37.5',lng:127},
  {lat:NaN,lng:127},{lat:90,lng:127},{lat:37,lng:122}]){
  assert.equal(validCoordinates(bad),false);
  assert.equal((await getDrivingTime({...query,start:bad},{env,fetcher:safeFetch})).reason,'invalid_coordinates');
 }
 const same=await getDrivingTime({...query,goal:{...start}},{env,fetcher:safeFetch});
 assert.equal(same.reason,'no_route');
 assert.equal(same.minutes,null);
});

test('public transit, walking and mixed transport explicitly unsupported',async()=>{
 for(const mode of ['public_transit','walking','mixed']){
  const result=await getDrivingTime({...query,mode},{env,fetcher:safeFetch});
  assert.equal(result.reason,'unsupported_mode');
  assert.equal(result.minutes,null);
 }
});

test('timeout and transport/network failures preserve unknown without exposing exceptions',async()=>{
 for(const name of ['TimeoutError','AbortError']){
  const err=new Error('possibly sensitive');
  err.name=name;
  const res=await getDrivingTime(query,{env,fetcher:async()=>{throw err;}});
  assert.equal(res.reason,'timeout');
  assert.equal(res.minutes,null);
 }
 const res=await getDrivingTime(query,{env,fetcher:async()=>{throw new Error(env.HB_NAVER_DIRECTIONS_SECRET);}});
 assert.equal(res.reason,'upstream_error');
 assert.equal(JSON.stringify(res).includes(env.HB_NAVER_DIRECTIONS_SECRET),false);
});

test('partial or missing driving segments remain incomplete with an unknown interval',async()=>{
 let calls=0;
 const third={id:'park',lat:37.55,lng:127.01};
 const result=await getDrivingSegments([start,goal,third],{
  env,fetcher:async()=>{
   calls++;
   return calls===1?success(60001):{status:429,ok:false};
  }
 });
 assert.equal(calls,2);
 assert.equal(result.status,'incomplete');
 assert.equal(result.segments.length,2);
 assert.equal(result.segments[0].minutes,2);
 assert.equal(result.segments[1].minutes,null);
 assert.equal(result.segments[1].status,'unknown');
 assert.equal(result.segments[1].reason,'rate_limited');
 assert.deepEqual(result.segments.map(s=>[s.from,s.to]),[['city-hall','palace'],['palace','park']]);
});

test('invalid segments do not consume a call; batch size capped at two API requests',async()=>{
 const bad={id:'missing',lat:null,lng:127};
 const result=await getDrivingSegments([start,bad,goal],{env,fetcher:safeFetch});
 assert.equal(result.status,'incomplete');
 assert.deepEqual(result.segments.map(s=>s.reason),['invalid_coordinates','invalid_coordinates']);
 assert.deepEqual(await getDrivingSegments([start],{env,fetcher:safeFetch}),{
  status:'incomplete',segments:[],reason:'invalid_stops'
 });
 assert.equal((await getDrivingSegments([start,goal,start,goal],{env,fetcher:safeFetch})).reason,'invalid_stops');
});

test('provider is never called with an unsupported mode or absent credentials in a batch',async()=>{
 for(const options of [{mode:'public_transit',env},{mode:'car',env:{...env,HB_NAVER_DIRECTIONS_SECRET:''}}]){
  const result=await getDrivingSegments([start,goal],{...options,fetcher:safeFetch});
  assert.equal(result.status,'incomplete');
  assert.equal(result.segments[0].minutes,null);
 }
});
