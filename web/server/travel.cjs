'use strict';
const {normalizePlaceEvidence}=require('./access-evidence.cjs');
const {getCatalog,PlaceError,resolveRoutePlace}=require('./place-catalog.cjs');
const {enrichCatalog}=require('./catalog-accessibility.cjs');
const {getDrivingRoute,configuration:naverConfiguration,diagnoseReason}=require('./naver-directions.cjs');

/** Use the same-release catalog only. A missing provider key yields the
 * explicitly partial snapshot; upstream failures never trigger a remote legacy fallback.
 */
class CatalogError extends Error {
  constructor(code,httpStatus=502){super(code);this.code=code;this.httpStatus=httpStatus;}
}
function catalogProvider(){
  return {source:'first_party'};
}
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
  let evidence;
  try{evidence=normalizePlaceEvidence(place);}catch{
    return {status:'needsReview',reason:'invalid_evidence'};
  }
  const facts=evidence.accessibility;
  if(place.accessStatus==='conflicting'||facts.some(f=>f.status==='conflicting'||f.evidenceState==='conflicting'))
    return {status:'needsReview',reason:'conflicting_evidence'};
  const aid=input.mobilityAid;
  const hasAid=Boolean(aid&&aid!=='none');
  const stepFreeRequired=aid==='wheelchair'||aid==='walker';
  if(place.accessStatus==='stale'||facts.some(f=>f.stale||f.evidenceState==='stale'))
    return {status:'needsReview',reason:'stale_evidence'};
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

async function catalog(region,fetcher,env={},withAccessibility=false){
  let data;
  try{
    const options={env};
    if(fetcher!==globalThis.fetch)options.fetcher=fetcher;
    data=await getCatalog(region,options);
    if(withAccessibility)data=await enrichCatalog(data,options);
  }catch(error){
    if(error instanceof PlaceError){
      if(error.code==='upstream_unauthorized')throw new CatalogError('catalog_credentials_required',502);
      if(error.code==='upstream_rate_limited')throw new CatalogError('catalog_rate_limited',503);
      if(error.code==='upstream_timeout')throw new CatalogError('catalog_timeout',504);
      if(['upstream_invalid_schema','upstream_invalid_json','upstream_invalid_response'].includes(error.code))
        throw new CatalogError('invalid_catalog',502);
    }
    throw new CatalogError('catalog_unavailable');
  }
  if(!data||!Array.isArray(data.places))throw new CatalogError('invalid_catalog');
  const places=data.places.filter(p=>validId(p?.id)&&typeof p.name==='string'&&p.name.trim()&&
    (p.lat===undefined||p.lat===null||Number.isFinite(p.lat))&&
    (p.lng===undefined||p.lng===null||Number.isFinite(p.lng)));
  return {places,source:'first_party',mode:data.mode,partial:Boolean(data.meta?.partial),...(data.meta?.accessibility?{accessibility:data.meta.accessibility}:{})};
}

function point(place){
  if(!Number.isFinite(place?.lng)||!Number.isFinite(place?.lat)||
     place.lng<124||place.lng>132||place.lat<33||place.lat>39) return null;
  return {lat:place.lat,lng:place.lng};
}

async function travelTimes(input,fetcher,env){
  if(input.transport!=='car')return {status:'unsupported_mode',segments:[]};
  const config=naverConfiguration(env);
  if(!config.ready)return {status:'provider_disabled',reason:config.reason,diagnostic:diagnoseReason(config.reason,env),segments:[]};
  const places=await routePlaces(input.region,input.stopIds,fetcher,env);
  const segments=[];
  for(let i=1;i<input.stopIds.length;i++){
    const from=input.stopIds[i-1],to=input.stopIds[i];
    const start=point(places.get(from)),goal=point(places.get(to));
    if(!start||!goal){
      segments.push({from,to,status:'unknown',minutes:null,distanceMeters:null,reason:'invalid_coordinates',source:null,checkedAt:null});
      continue;
    }
    const result=await getDrivingRoute({start,goal,mode:input.transport},{fetcher,env});
    const diagnostic=diagnoseReason(result.reason,env);
    segments.push({from,to,status:result.status,minutes:result.minutes,distanceMeters:result.distanceMeters,
      reason:result.reason,...(diagnostic?{diagnostic}:{}),source:result.source,checkedAt:result.checkedAt});
  }
  return {status:segments.every(s=>s.status==='estimated')?'estimated':'incomplete',segments};
}

// Nearby search and regional catalog have different coverage. Resolve at most the
// already bounded requested IDs from the authoritative provider, not client coordinates.
async function routePlaces(region,ids,fetcher,env){
  const places=new Map((await catalog(region,fetcher,env)).places.map(p=>[p.id,p]));
  for(const id of ids){
    if(point(places.get(id))||!/^tour-[0-9]{1,12}$/.test(id))continue;
    const place=await resolveRoutePlace(id,region,{fetcher,env});
    if(place)places.set(id,place);
  }
  return places;
}

/* §5 home departure / return legs. Stops are still resolved from the catalog by ID;
 * only the traveller's own origin/return point is a client coordinate. It is
 * accepted under a separate opt-in flag, rounded to 3 decimals (~100 m) before
 * the provider request, bounded to Korea, never echoed back, logged or cached,
 * and limited to at most two provider requests per call. Policy note: F05-02
 * forbids routing arbitrary client coordinates *as stops*; enabling this flag in
 * an environment is an owner decision (see PR description). */
const ENDPOINT_FLAG='HB_TRIP_ENDPOINT_ROUTES_ENABLED';
const ENDPOINT_KEYS=['region','transport','origin','returnTo','firstStopId','lastStopId'];
function userPoint(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  if(Object.keys(value).some(key=>key!=='lat'&&key!=='lng'))return null;
  if(typeof value.lat!=='number'||typeof value.lng!=='number')return null;
  const round=n=>Math.round(n*1000)/1000;
  return point({lat:round(value.lat),lng:round(value.lng)});
}
function validTripEndpointsRequest(body){
  if(!body||Object.keys(body).some(key=>!ENDPOINT_KEYS.includes(key)))return false;
  if(!includes(regions,body.region)||!includes(transports,body.transport))return false;
  const departure=body.origin!=null,back=body.returnTo!=null;
  if(!departure&&!back)return false;
  if(departure&&(!userPoint(body.origin)||!validId(body.firstStopId)))return false;
  if(back&&(!userPoint(body.returnTo)||!validId(body.lastStopId)))return false;
  if(!departure&&body.firstStopId!=null||!back&&body.lastStopId!=null)return false;
  return true;
}
async function tripEndpoints(input,fetcher,env){
  if(input.transport!=='car')return {status:'unsupported_mode',legs:[]};
  const config=naverConfiguration(env);
  if(!config.ready)return {status:'provider_disabled',reason:config.reason,diagnostic:diagnoseReason(config.reason,env),legs:[]};
  if(env?.[ENDPOINT_FLAG]!=='1')return {status:'provider_disabled',reason:'endpoint_routes_disabled',diagnostic:'feature_disabled',legs:[]};
  const wanted=[];
  if(input.origin!=null)wanted.push({kind:'departure',stopId:input.firstStopId,user:userPoint(input.origin)});
  if(input.returnTo!=null)wanted.push({kind:'return',stopId:input.lastStopId,user:userPoint(input.returnTo)});
  const places=await routePlaces(input.region,[...new Set(wanted.map(w=>w.stopId))],fetcher,env);
  const legs=[];
  for(const want of wanted){
    const stop=point(places.get(want.stopId));
    if(!stop||!want.user){
      legs.push({kind:want.kind,stopId:want.stopId,status:'unknown',minutes:null,distanceMeters:null,reason:'invalid_coordinates',source:null,checkedAt:null});
      continue;
    }
    const route=want.kind==='departure'?{start:want.user,goal:stop}:{start:stop,goal:want.user};
    const result=await getDrivingRoute({...route,mode:'car'},{fetcher,env});
    const diagnostic=diagnoseReason(result.reason,env);
    legs.push({kind:want.kind,stopId:want.stopId,status:result.status,minutes:result.minutes,distanceMeters:result.distanceMeters,
      reason:result.reason,...(diagnostic?{diagnostic}:{}),source:result.source,checkedAt:result.checkedAt});
  }
  return {status:legs.every(leg=>leg.status==='estimated')?'estimated':'incomplete',legs};
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
    if(kind==='trip-endpoints'&&!validTripEndpointsRequest(body))return res.status(400).json({error:'invalid_route'});
    try{
      if(kind==='travel-times')return res.status(200).json(await travelTimes(body,fetcher,env));
      if(kind==='trip-endpoints')return res.status(200).json(await tripEndpoints(body,fetcher,env));
      const resultCatalog=await catalog(body.region,fetcher,env,true);
      const places=resultCatalog.places;
      const groups={eligible:[],needsReview:[],excluded:[]};
      for(const place of places){
        if(body.placePreference==='food'&&place.kind!=='food'||body.placePreference==='spot'&&place.kind==='food')continue;
        const result=classify(place,body);
        groups[result.status].push({id:place.id,name:place.name,reason:result.reason});
      }
      return res.status(200).json({...groups,foodPreferencesApplied:false,
        catalogSource:resultCatalog.source,catalogMode:resultCatalog.mode,catalogPartial:resultCatalog.partial,
        ...(resultCatalog.accessibility?{accessibility:resultCatalog.accessibility}:{})});
    }catch(error){
      const issue=error instanceof CatalogError?error:new CatalogError('catalog_unavailable');
      return res.status(issue.httpStatus).json({error:issue.code});
    }
  };
}
module.exports={handler,validProfile,classify,travelTimes,tripEndpoints,validTripEndpointsRequest,userPoint,ENDPOINT_FLAG,catalog,catalogProvider};
