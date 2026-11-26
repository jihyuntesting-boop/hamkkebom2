'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createWalkingProvider}=require('../web/server/agent-aa-walking-provider.cjs');
async function checks(create,assert){
 const a={id:'parking:fixture',lat:37.5,lng:127,coordinateEvidence:{sourceUrl:'https://example.test/fixture',verifiedAt:'2026-01-01'}};
 const b={...a,id:'entrance:fixture',lat:37.501};
 let calls=0,mode='ok',clock=0;
 const fetcher=async(url,options)=>{calls++;assert(url.includes('start_x=127')&&url.includes('end_y=37.501')&&url.includes('route_mode=ACCESSIBLE'),'official coordinate and mode');assert(options.headers.Authorization==='KakaoAK fixture-key'&&!url.includes('fixture-key')&&options.redirect==='error','server key');if(mode==='timeout')throw Object.assign(new Error('timeout'),{name:'TimeoutError'});if(mode==='429')return {ok:false,status:429};if(mode==='bad')return {ok:true,json:async()=>({status:'OK',route:{properties:{totalDistance:'300',totalTime:100}}})};if(mode==='empty')return {ok:true,json:async()=>({status:'ROUTE_RESULT_NOT_FOUND'})};return {ok:true,json:async()=>({status:'OK',route:{properties:{totalDistance:300,totalTime:240},legs:[{steps:[{path:{points:[[127,37.5],[127,37.501]]}}]}]}})};};
 const env={HB_WALKING_PREVIEW_ENABLED:'1',VERCEL_ENV:'preview',HB_KAKAO_WALK_KEY:'fixture-key'};
 const factory=(extra={})=>create({approved:true,env,fetcher,signalFactory:()=>undefined,now:()=>clock,...extra});
 const args={from:a,to:b,speedKmh:1.5,preferComfort:true};
 const denied=await factory({approved:false}).walk(args);assert(denied.reason==='provider_not_approved'&&calls===0,'approval gate');
 assert((await factory({env:{...env,VERCEL_ENV:'production'}}).walk(args)).reason==='provider_not_approved'&&calls===0,'production gate');
 assert((await factory().walk({...args,from:{...a,coordinateEvidence:null}})).reason==='coordinate_evidence_missing'&&calls===0,'missing facility evidence');
 assert((await factory().walk({...args,speedKmh:0})).reason==='invalid_speed'&&calls===0,'invalid speed');
 assert((await factory().walk({...args,to:a})).reason==='same_point'&&calls===0,'same point');
 const provider=factory({dailyLimit:1});const result=await provider.walk(args);
 assert(result.distanceMeters===300&&result.estimatedMinutes===12&&result.providerDurationSeconds===240,'distance and personal estimate');
 assert(result.distanceType==='walking_route'&&result.routeVerified===false&&result.stepFreeStatus==='unknown'&&result.geometry===null&&result.mapDisplayAllowed===false,'not certified and no cross-map geometry');
 assert((await provider.walk(args)).reason==='local_budget_exhausted','local cap');
 for(const [m,reason] of [['timeout','provider_timeout'],['bad','invalid_response'],['empty','route_not_found']]){mode=m;const out=await factory().walk(args);assert(out.reason===reason&&out.distanceMeters===null&&out.estimatedMinutes===null,'no straight line fallback '+m);}
 mode='429';const limited=factory();assert((await limited.walk(args)).reason==='provider_rate_limited','429');const n=calls;assert((await limited.walk(args)).reason==='provider_rate_limited'&&calls===n,'cooldown no retry');
 clock+=61000;mode='ok';assert((await limited.walk(args)).status==='provider_reported','cooldown expiry');
}
test('Agent AA: walking provider contract (fixtures, no external requests)',async()=>checks(createWalkingProvider,(ok,msg)=>assert.ok(ok,msg)));
