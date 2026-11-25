'use strict';

// NAVER Directions 5 provider. travel.cjs uses the legacy time-only contract;
// getDrivingRoute exposes strict distance+time for explicit integration opt-in.
const ENDPOINT='https://maps.apigw.ntruss.com/map-direction/v1/driving';
const OPTION='trafast';
const SOURCE='naver_directions';

function validCoordinates(point){
  return Boolean(point&&typeof point==='object'&&!Array.isArray(point)&&
    Number.isFinite(point.lat)&&Number.isFinite(point.lng)&&
    point.lat>=33&&point.lat<=39&&point.lng>=124&&point.lng<=132);
}

function configuration(env=process.env){
  if(env?.HB_NAVER_DIRECTIONS_ENABLED!=='1')return {ready:false,reason:'provider_disabled'};
  if(typeof env.HB_NAVER_DIRECTIONS_ID!=='string'||!env.HB_NAVER_DIRECTIONS_ID.trim()||
     typeof env.HB_NAVER_DIRECTIONS_SECRET!=='string'||!env.HB_NAVER_DIRECTIONS_SECRET.trim())
    return {ready:false,reason:'missing_credentials'};
  return {ready:true,reason:null};
}

function unknown(reason){
  return {status:'unknown',minutes:null,reason,source:null,checkedAt:null};
}

function validResponse(body){
  const duration=body?.route?.[OPTION]?.[0]?.summary?.duration;
  return body?.code===0&&Number.isSafeInteger(duration)&&duration>0&&duration<=7*86400000
    ?duration:null;
}

/**
 * input: {start:{lat,lng},goal:{lat,lng},mode?:'car'}
 * options: {fetcher?, env?, now?:()=>Date, timeoutMs?}
 * output: {status:'estimated'|'unknown', minutes:number|null,
 *          reason:string|null, source:'naver_directions'|null, checkedAt:ISO|null}
 * Never converts a failure into zero or a guessed duration.
 */
async function requestDriving(input,{fetcher=globalThis.fetch,env=process.env,now=()=>new Date(),timeoutMs=5000}={},includeDistance=false){
  const mode=input?.mode??input?.transport??'car';
  if(mode!=='car')return unknown('unsupported_mode');
  if(!validCoordinates(input?.start)||!validCoordinates(input?.goal))return unknown('invalid_coordinates');
  if(input.start.lat===input.goal.lat&&input.start.lng===input.goal.lng)return unknown('no_route');
  const config=configuration(env);
  if(!config.ready)return unknown(config.reason);
  if(typeof fetcher!=='function')return unknown('upstream_error');
  const query=new URLSearchParams({
    start:input.start.lng+','+input.start.lat,
    goal:input.goal.lng+','+input.goal.lat,
    option:OPTION
  });
  const timeout=Number.isInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=30000?timeoutMs:5000;
  try{
    const response=await fetcher(ENDPOINT+'?'+query.toString(),{
      method:'GET',
      redirect:'error',
      headers:{
        'x-ncp-apigw-api-key-id':env.HB_NAVER_DIRECTIONS_ID,
        'x-ncp-apigw-api-key':env.HB_NAVER_DIRECTIONS_SECRET
      },
      signal:AbortSignal.timeout(timeout)
    });
    if(response?.status===401||response?.status===403)return unknown('authentication_failed');
    if(response?.status===429)return unknown('rate_limited');
    if(!response?.ok)return unknown('upstream_error');
    let body;
    try{body=await response.json();}catch(error){
      if(error?.name==='TimeoutError'||error?.name==='AbortError')return unknown('timeout');
      return unknown('invalid_response');
    }
    // Official Directions 5 response: 1=same endpoints, 2=off road,
    // 3=unavailable, 4=waypoint off road, 5=route >1500 km.
    if([1,2,3,4,5].includes(body?.code))return unknown('no_route');
    const duration=validResponse(body);
    if(duration===null)return unknown('invalid_response');
    const distance=body?.route?.[OPTION]?.[0]?.summary?.distance;
    if(includeDistance&&(!Number.isSafeInteger(distance)||distance<=0||distance>1500000))
      return unknown('invalid_response');
    let timestamp;
    try{timestamp=now().toISOString();}catch{return unknown('upstream_error');}
    return {status:'estimated',minutes:Math.ceil(duration/60000),
      reason:null,source:SOURCE,checkedAt:timestamp,
      ...(includeDistance?{distanceMeters:distance}:{})};
  }catch(error){
    if(error?.name==='TimeoutError'||error?.name==='AbortError')return unknown('timeout');
    return unknown('upstream_error');
  }
}

// Keep the existing time-only contract unchanged for travel.cjs and Agent K tests.
async function getDrivingTime(input,options={}){
  return requestDriving(input,options,false);
}

// Strict route contract: both duration and provider-measured distance are required.
// An unavailable route never falls back to straight-line distance or zero minutes.
async function getDrivingRoute(input,options={}){
  const result=await requestDriving(input,options,true);
  return result.status==='estimated'?result:{...result,distanceMeters:null};
}

/**
 * Conservative adapter for an ordered stop list. Calls at most two paid
 * requests (up to three stops), serially; invalid segments are never billed.
 * Each stop: {id?,lat,lng}. No raw provider payload or keys are returned.
 */
async function getDrivingSegments(stops,options={}){
  if(!Array.isArray(stops)||stops.length<2||stops.length>3)
    return {status:'incomplete',segments:[],reason:'invalid_stops'};
  const segments=[];
  for(let i=1;i<stops.length;i++){
    const from=stops[i-1],to=stops[i];
    const result=await getDrivingTime({
      start:from,goal:to,mode:options.mode??'car'
    },options);
    segments.push({
      from:typeof from?.id==='string'?from.id:null,
      to:typeof to?.id==='string'?to.id:null,
      ...result
    });
  }
  return {status:segments.every(s=>s.status==='estimated')?'estimated':'incomplete',segments};
}
module.exports={ENDPOINT,OPTION,SOURCE,validCoordinates,configuration,validResponse,getDrivingTime,getDrivingRoute,getDrivingSegments};
