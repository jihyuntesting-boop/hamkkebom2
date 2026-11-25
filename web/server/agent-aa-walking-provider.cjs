'use strict';
// Agent AA: isolated, disabled-by-default provider; no API endpoint or map integration.
function createWalkingProvider({approved=false,env={},fetcher,now=Date.now,signalFactory=ms=>AbortSignal.timeout(ms),dailyLimit=10}={}){
 const sourceUrl='https://developers.kakao.com/docs/ko/kakaomap/rest-api';
 const invalid=reason=>({status:'unknown',reason,distanceMeters:null,distanceType:null,estimatedMinutes:null,routeVerified:false,stepFreeStatus:'unknown',geometry:null,sourceUrl});
 const point=p=>p&&typeof p.id==='string'&&p.id.length>0&&p.coordinateEvidence?.verifiedAt&&/^https:\/\//.test(p.coordinateEvidence?.sourceUrl||'')&&Number.isFinite(p.lat)&&p.lat>=32&&p.lat<=39&&Number.isFinite(p.lng)&&p.lng>=124&&p.lng<=133;
 const cap=Number.isSafeInteger(dailyLimit)&&dailyLimit>0&&dailyLimit<=30?dailyLimit:10;
 let day='',calls=0,active=0,cooldownUntil=0;
 async function walk({from,to,speedKmh,preferComfort=false}={}){
  if(!point(from)||!point(to))return invalid('coordinate_evidence_missing');
  if(from.id===to.id||(from.lat===to.lat&&from.lng===to.lng))return invalid('same_point');
  if(speedKmh!=null&&(!Number.isFinite(speedKmh)||speedKmh<0.5||speedKmh>6))return invalid('invalid_speed');
  if(!approved||env.HB_WALKING_PREVIEW_ENABLED!=='1'||env.VERCEL_ENV!=='preview')return invalid('provider_not_approved');
  const secret=typeof env.HB_KAKAO_WALK_KEY==='string'?env.HB_KAKAO_WALK_KEY.trim():'';
  if(!secret||typeof fetcher!=='function')return invalid('provider_key_missing');
  const today=new Date(now()+9*3600000).toISOString().slice(0,10);
  if(day!==today){day=today;calls=0;}
  if(now()<cooldownUntil)return invalid('provider_rate_limited');
  if(calls>=cap||active>=2)return invalid('local_budget_exhausted');
  const mode=preferComfort===true?'ACCESSIBLE':'BROAD_FIRST';
  const args={start_x:from.lng,start_y:from.lat,end_x:to.lng,end_y:to.lat,input_coord:'WGS84',output_coord:'WGS84',route_mode:mode};
  const url='https://dapi.kakao.com/v2/routing/walk?'+Object.entries(args).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(String(v))).join('&');
  calls++;active++;
  try{
   const res=await fetcher(url,{signal:signalFactory(3500),redirect:'error',headers:{Authorization:'KakaoAK '+secret,Accept:'application/json'}});
   if(res?.status===429){cooldownUntil=now()+60000;return invalid('provider_rate_limited');}
   if(!res?.ok)return invalid(res?.status===401||res?.status===403?'provider_unauthorized':'provider_unavailable');
   let payload;try{payload=await res.json();}catch{return invalid('invalid_response');}
   if(payload?.status!=='OK')return invalid(typeof payload?.status==='string'?'route_not_found':'invalid_response');
   const d=payload.route?.properties?.totalDistance,t=payload.route?.properties?.totalTime;
   if(!Number.isSafeInteger(d)||d<=0||!Number.isSafeInteger(t)||t<=0)return invalid('invalid_response');
   return {status:'provider_reported',reason:null,fromId:from.id,toId:to.id,distanceMeters:d,distanceType:'walking_route',providerDurationSeconds:t,estimatedMinutes:speedKmh==null?null:Math.ceil(d/(speedKmh*1000/60)),estimateType:speedKmh==null?null:'personal_speed_estimate',speedKmh:speedKmh??null,includesRest:false,routeMode:mode,stepFreeStatus:'unknown',routeVerified:false,geometry:null,mapDisplayAllowed:false,sourceUrl,collectedAt:new Date(now()).toISOString()};
  }catch(e){return invalid(['AbortError','TimeoutError'].includes(e?.name)?'provider_timeout':'provider_unavailable');}
  finally{active--;}
 }
 return {walk,usage:()=>({day,calls,active,limit:cap,scope:'process_only'})};
}
module.exports={createWalkingProvider};
