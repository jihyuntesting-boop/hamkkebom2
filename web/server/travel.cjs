'use strict';
const LEGACY=process.env.HB_LEGACY_API_BASE || 'https://example.invalid';
const DIRECTIONS='https://maps.apigw.ntruss.com/map-direction/v1/driving';
const includes=(values,value)=>values.includes(value);
const regions=['서울','경기'];
const transports=['car','public_transit','mixed'];
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(id);

function validProfile(input, now=new Date()){
  if(!input||!includes(regions,input.region)||!includes(transports,input.transport)||
    !includes(['day','overnight'],input.tripType)||!includes(['impossible','avoid','possible'],input.stairs)||
    !includes([5,10,15,20,30],input.walkingMinutes)||!Number.isInteger(input.partySize)||
    input.partySize<2||input.partySize>12) return false;
  if(typeof input.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return false;
  const date=new Date(input.date+'T00:00:00Z');
  if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==input.date) return false;
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(now);
  const optional=(name,values)=>input[name]==null||values.includes(input[name]);
  const choices=(name,values)=>input[name]==null||(Array.isArray(input[name])&&input[name].length<=values.length&&input[name].every(value=>values.includes(value)));
  return input.date>=today&&optional('slopePreference',['avoid_steep','flexible'])&&
    optional('indoorPreference',['any','indoor','outdoor'])&&optional('placePreference',['all','spot','food'])&&
    optional('mobilityAid',['none','cane','walker','wheelchair','other'])&&optional('restIntervalMinutes',[30,45,60])&&
    choices('facilityNeeds',['toilet','rest','dropoff','elevator','wheelchair'])&&
    choices('foodPreferences',['less_spicy','easy_to_chew','vegetarian']);
}

// Source-reported facilities are not a verified walking route. Reject impossible
// verification dates before using any mobility evidence to mark a place eligible.
function credibleVerificationDate(value,now=new Date()){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value))return false;
  const timestamp=Date.parse(value);
  if(!Number.isFinite(timestamp)||timestamp>now.getTime()+86400000)return false;
  if(/^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(timestamp).toISOString().slice(0,10)!==value)return false;
  return true;
}

function classify(place,input){
  const assessment=place.mobilityAssessment;
  const facts=Array.isArray(place.accessFacts)?place.accessFacts:[];
  if(place.accessStatus==='conflicting'||facts.some(f=>f?.status==='conflicting')) return {status:'needsReview',reason:'conflicting_evidence'};
  const aid=input.mobilityAid;
  const hasAid=Boolean(aid&&aid!=='none');
  const stepFreeRequired=aid==='wheelchair'||aid==='walker';
  if(place.accessStatus==='stale'||facts.some(f=>f?.status==='stale')) return {status:'needsReview',reason:'stale_evidence'};
  const verified=assessment?.status==='verified'&&typeof assessment.scope==='string'&&assessment.scope.trim()&&
    credibleVerificationDate(assessment.verifiedAt);
  if(verified&&(input.stairs==='impossible'||aid==='wheelchair')&&assessment.stairsRequired===true) return {status:'excluded',reason:'required_stairs'};
  const aidVerified=!hasAid||aid!=='other'&&verified&&
    Array.isArray(assessment.verifiedMobilityAids)&&assessment.verifiedMobilityAids.includes(aid)&&
    (!stepFreeRequired||assessment.stairsRequired===false);
  if(!aidVerified)return {status:'needsReview',reason:'mobility_aid_unverified'};
  if(verified&&Number.isFinite(assessment.walkMinutes)&&assessment.walkMinutes>=0&&assessment.walkMinutes<=input.walkingMinutes&&
    (input.stairs==='possible'||assessment.stairsRequired===false)&&input.slopePreference!=='avoid_steep'&&
    !includes(['indoor','outdoor'],input.indoorPreference)&&(!input.facilityNeeds?.length||Array.isArray(assessment.verifiedFacilities)&&input.facilityNeeds.every(need=>assessment.verifiedFacilities.includes(need)))) return {status:'eligible',reason:'documented_route'};
  return {status:'needsReview',reason:'insufficient_evidence'};
}

async function catalog(region,fetcher){
  const response=await fetcher(LEGACY+'/api/data?'+new URLSearchParams({type:'places',region}),{signal:AbortSignal.timeout(6000)});
  if(!response.ok) throw Error('catalog unavailable');
  const data=await response.json();
  if(!Array.isArray(data.places)) throw Error('invalid catalog');
  return data.places.filter(p=>validId(p?.id)&&typeof p.name==='string');
}

function point(place){
  if(!Number.isFinite(place?.lng)||!Number.isFinite(place?.lat)||place.lng<124||place.lng>132||place.lat<33||place.lat>39) return null;
  return place.lng+','+place.lat;
}

async function travelTimes(input,fetcher,env){
  if(input.transport!=='car') return {status:'unsupported_mode',segments:[]};
  if(env.HB_NAVER_DIRECTIONS_ENABLED!=='1'||!env.HB_NAVER_DIRECTIONS_ID||!env.HB_NAVER_DIRECTIONS_SECRET)
    return {status:'provider_disabled',segments:[]};
  const places=new Map((await catalog(input.region,fetcher)).map(p=>[p.id,p]));
  const segments=[];
  for(let i=1;i<input.stopIds.length;i++){
    const from=input.stopIds[i-1],to=input.stopIds[i];
    const start=point(places.get(from)),goal=point(places.get(to));
    let result={from,to,status:'unknown',minutes:null};
    if(start&&goal){
      try{
        const params=new URLSearchParams({start,goal,option:'trafast'});
        const response=await fetcher(DIRECTIONS+'?'+params,{signal:AbortSignal.timeout(5000),headers:{
          'x-ncp-apigw-api-key-id':env.HB_NAVER_DIRECTIONS_ID,'x-ncp-apigw-api-key':env.HB_NAVER_DIRECTIONS_SECRET
        }});
        const data=response.ok?await response.json():null;
        const ms=data?.route?.trafast?.[0]?.summary?.duration;
        if(data?.code===0&&Number.isFinite(ms)&&ms>0) result={from,to,status:'estimated',minutes:Math.ceil(ms/60000),source:'naver_directions',checkedAt:new Date().toISOString()};
      }catch{}
    }
    segments.push(result);
  }
  return {status:segments.every(s=>s.status==='estimated')?'estimated':'incomplete',segments};
}

function handler(kind,{fetcher=fetch,env=process.env}={}){
  return async (req,res)=>{
    res.setHeader('Cache-Control','no-store');
    if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'method_not_allowed'});}
    if(!String(req.headers['content-type']||'').startsWith('application/json'))return res.status(415).json({error:'json_required'});
    let body=req.body;
    try{
      if(typeof body==='string') body=JSON.parse(body);
      if(!body||typeof body!=='object'||Array.isArray(body)||JSON.stringify(body).length>4096)throw Error();
    }catch{return res.status(400).json({error:'invalid_request'});}
    if(kind==='recommend'&&!validProfile(body))return res.status(400).json({error:'invalid_travel_conditions'});
    if(kind==='travel-times'&&(!includes(regions,body.region)||!includes(transports,body.transport)||!Array.isArray(body.stopIds)||
      body.stopIds.length<2||body.stopIds.length>3||body.stopIds.some(id=>!validId(id))||new Set(body.stopIds).size!==body.stopIds.length))
      return res.status(400).json({error:'invalid_route'});
    try{
      if(kind==='travel-times')return res.status(200).json(await travelTimes(body,fetcher,env));
      const places=await catalog(body.region,fetcher);
      const groups={eligible:[],needsReview:[],excluded:[]};
      for(const place of places){
        if(body.placePreference==='food'&&place.kind!=='food'||body.placePreference==='spot'&&place.kind==='food')continue;
        const result=classify(place,body);
        groups[result.status].push({id:place.id,name:place.name,reason:result.reason});
      }
      return res.status(200).json({...groups,foodPreferencesApplied:false});
    }catch{return res.status(502).json({error:'catalog_unavailable'});}
  };
}
module.exports={handler,validProfile,classify,travelTimes};
