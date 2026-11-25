'use strict';
const {normalizeWeather,KMA_SOURCE} = require('./weather-normalizer.cjs');
const HOUR=3600000, DAY=24*HOUR;
const ROOT='https://apis.data.go.kr/1360000/';
const FORECAST='VilageFcstInfoService_2.0/getVilageFcst';
const WARNING='WthrWrnInfoService/';
const REFERENCES=Object.freeze({
  '서울':{lat:37.5665,lng:126.9780,label:'서울시청'},
  '경기':{lat:37.2885,lng:127.0547,label:'수원 경기도청 인근'}
});
class WeatherError extends Error {
  constructor(code){super(code);this.code=code;}
}
const fail=code=>{throw new WeatherError(code);};
function kst(ms){return new Date(ms+9*HOUR).toISOString().slice(0,19)+'+09:00';}
function dateAt(ms){return kst(ms).slice(0,10);}
function isDate(s){
  if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
  const d=new Date(s+'T00:00:00Z');
  return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s;
}
function numeric(v){
  if(typeof v==='number')return Number.isFinite(v)?v:NaN;
  return typeof v==='string'&&/^-?\d+(?:\.\d+)?$/.test(v)?Number(v):NaN;
}
// KMA DFS Lambert conformal conic projection; 5 km grid.
function toGrid(lat,lng){
  lat=numeric(lat);lng=numeric(lng);
  if(!(lat>=33&&lat<=39&&lng>=124&&lng<=132))fail('invalid_location');
  const rad=Math.PI/180,re=6371.00877/5,sl1=30*rad,sl2=60*rad,olon=126*rad,olat=38*rad;
  const sn=Math.log(Math.cos(sl1)/Math.cos(sl2))/Math.log(Math.tan(Math.PI/4+sl2/2)/Math.tan(Math.PI/4+sl1/2));
  const sf=Math.pow(Math.tan(Math.PI/4+sl1/2),sn)*Math.cos(sl1)/sn;
  const ro=re*sf/Math.pow(Math.tan(Math.PI/4+olat/2),sn);
  const ra=re*sf/Math.pow(Math.tan(Math.PI/4+lat*rad/2),sn);
  let theta=lng*rad-olon;
  if(theta>Math.PI)theta-=2*Math.PI;
  if(theta<-Math.PI)theta+=2*Math.PI;
  theta*=sn;
  return {nx:Math.floor(ra*Math.sin(theta)+43+0.5),ny:Math.floor(ro-ra*Math.cos(theta)+136+0.5)};
}
function locationFor(q){
  if(!Object.hasOwn(REFERENCES,q.region))fail('unsupported_region');
  const hasCoords=q.lat!=null||q.lng!=null;
  if(hasCoords&&(q.lat==null||q.lng==null))fail('invalid_location');
  const p=hasCoords?{lat:numeric(q.lat),lng:numeric(q.lng),label:null}:REFERENCES[q.region];
  // Region is a caller label, not a reverse-geocoded administrative boundary.
  const grid=toGrid(p.lat,p.lng);
  return {...p,grid,scope:hasCoords?'destination_coordinate':'regional_reference',regionVerified:false};
}
function publication(ms,delayMinutes=10){
  const shifted=ms-delayMinutes*60000+9*HOUR;
  const day=new Date(shifted);
  const hour=day.getUTCHours();
  const baseHour=hour>=2?2+3*Math.floor((hour-2)/3):23;
  if(hour<2)day.setUTCDate(day.getUTCDate()-1);
  day.setUTCHours(baseHour,0,0,0);
  const wall=day.toISOString();
  return {base_date:wall.slice(0,10).replace(/-/g,''),base_time:wall.slice(11,13)+'00',ms:+day-9*HOUR};
}
function codeReason(code){
  if(['10','11','12','20','21','30','31','32','33'].includes(code))return 'authentication_failed';
  if(['22','23'].includes(code))return 'rate_limited';
  if(code==='03')return 'provider_no_data';
  if(['01','02','04','05','99'].includes(code))return 'provider_unavailable';
  return 'provider_error';
}
function makeClient({fetchImpl=globalThis.fetch,key=process.env.DATA_GO_KR_KEY,clock=()=>Date.now(),timeoutMs=3500,budgetMs=7000}={}){
  const cache=new Map(),pending=new Map();
  let cooldownUntil=0;
  async function raw(path,params,deadline){
    if(!key||typeof key!=='string')fail('missing_service_key');
    // Accept decoded or already percent-encoded key without double encoding.
    let decoded=key.trim();
    try{decoded=decodeURIComponent(decoded);}catch{fail('authentication_failed');}
    if(!decoded)fail('missing_service_key');
    const url=new URL(ROOT+path);
    url.searchParams.set('serviceKey',decoded);
    for(const [k,v] of Object.entries({dataType:'JSON',pageNo:1,numOfRows:1000,...params}))url.searchParams.set(k,String(v));
    for(let attempt=0;attempt<2;attempt++){
      if(clock()<cooldownUntil)fail('rate_limited');
      const remaining=deadline-performance.now();
      if(remaining<=0)fail('timeout');
      const controller=new AbortController();
      let timer,error;
      try{
        const timeout=new Promise((_,reject)=>{
          timer=setTimeout(()=>{controller.abort();reject(new WeatherError('timeout'));},Math.min(timeoutMs,remaining));
        });
        return await Promise.race([timeout,(async()=>{
        const response=await fetchImpl(url,{signal:controller.signal,redirect:'error',cache:'no-store'});
        if(response.status===401||response.status===403)fail('authentication_failed');
        if(response.status===429)fail('rate_limited');
        if(response.status>=500)fail('provider_unavailable');
        if(!response.ok)fail('provider_http_error');
        const body=await response.text();
        if(!body.trim())fail('empty_response');
        let data;
        try{data=JSON.parse(body);}catch{
          // Gateway errors sometimes arrive as XML even when JSON is requested.
          const m=body.match(/<returnReasonCode>\s*(\d{2})\s*<\/returnReasonCode>/);
          if(m&&m[1]==='03')return {response:{header:{resultCode:'00'},body:{totalCount:0,items:{item:[]}}}};
          if(m)fail(codeReason(m[1]));
          fail('invalid_provider_payload');
        }
        const code=String(data?.response?.header?.resultCode??data?.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnReasonCode??'');
        if(code==='03')return {response:{header:{resultCode:'00'},body:{totalCount:0,items:{item:[]}}}};
        if(code!=='00')fail(code?codeReason(code):'invalid_provider_payload');
        return data;
        })()]);
      }catch(e){
        error=e instanceof WeatherError?e:new WeatherError(controller.signal.aborted?'timeout':'network_error');
      }finally{clearTimeout(timer);}
      if(error.code==='rate_limited')cooldownUntil=clock()+60000;
      if(attempt===0&&performance.now()<deadline&&['timeout','network_error','provider_unavailable'].includes(error.code))continue;
      throw error;
    }
  }
  // A complete, validated envelope only; never cache an incomplete first page.
  function page(data){
    const b=data?.response?.body;
    const c=b?.totalCount;
    if(!((typeof c==='number')||(typeof c==='string'&&/^\d+$/.test(c)))||!Number.isSafeInteger(Number(c))||Number(c)<0)fail('invalid_provider_payload');
    const rawItems=b.items?.item;
    const rows=Array.isArray(rawItems)?rawItems:rawItems&&typeof rawItems==='object'?[rawItems]:[];
    if(rows.some(x=>!x||typeof x!=='object'||Array.isArray(x))||rows.length>Number(c)||(!rows.length&&Number(c)>0))fail('invalid_provider_payload');
    if(rawItems!=null&&!Array.isArray(rawItems)&&typeof rawItems!=='object')fail('invalid_provider_payload');
    return {b,count:Number(c),rows};
  }
  async function complete(path,params){
    const deadline=performance.now()+budgetMs;
    const first=await raw(path,params,deadline);
    const {b,count,rows}=page(first);
    let all=rows;
    if(path===FORECAST&&rows.length<count){
      // KMA expanded through D+3; the previous 1000-row request can truncate.
      // One extra page only, same publication and grid; fail closed on partial data.
      if(rows.length!==1000||count>2000||(b.pageNo!=null&&Number(b.pageNo)!==1))fail('incomplete_kma_page');
      const second=page(await raw(path,{...params,pageNo:2},deadline));
      if(second.count!==count||(second.b.pageNo!=null&&Number(second.b.pageNo)!==2)||rows.length+second.rows.length!==count)fail('incomplete_kma_page');
      all=[...rows,...second.rows];
    }
    if(all.length!==count)fail(path===FORECAST?'incomplete_kma_page':'incomplete_warning_page');
    if(path===FORECAST){
      const keys=new Set();
      for(const row of all){
        if(params.base_date!=null&&(String(row.baseDate)!==params.base_date||String(row.baseTime)!==params.base_time))fail('publication_mismatch');
        if(params.nx!=null&&(Number(row.nx)!==params.nx||Number(row.ny)!==params.ny))fail('region_grid_mismatch');
        const id=JSON.stringify([row.fcstDate,row.fcstTime,row.category]);
        if(keys.has(id))fail('duplicate_forecast_item');
        keys.add(id);
      }
    }
    return {...first,response:{...first.response,body:{...b,items:{item:all}}}};
  }
  async function get(path,params,ttl=300000){
    const id=JSON.stringify([path,Object.entries(params).sort(([a],[b])=>a.localeCompare(b))]);
    const now=clock();
    if(cache.has(id)){
      const entry=cache.get(id);
      if(entry.until>now)return entry.value;
      cache.delete(id);
    }
    if(pending.has(id))return pending.get(id);
    if(now<cooldownUntil)fail('rate_limited');
    if(pending.size>=16)fail('server_busy');
    const work=complete(path,params).then(value=>{
      if(cache.size>=128)cache.delete(cache.keys().next().value);
      const empty=Number(value?.response?.body?.totalCount)===0;
      cache.set(id,{value,until:clock()+(empty?Math.min(ttl,30000):ttl)});
      return value;
    }).finally(()=>pending.delete(id));
    pending.set(id,work);return work;
  }
  return {get};
}
const sharedClient=makeClient();
function responseBase(q,now){
  return {...normalizeWeather({region:q.region,date:q.date,now:new Date(now),payload:{status:'no_forecast'}}),source:KMA_SOURCE,summary:null,mode:'unavailable'};
}
function errorResult(q,now,code){
  const invalid=['invalid_location','unsupported_region','invalid_travel_date'].includes(code);
  return {...responseBase(q,now),status:invalid?'invalid':'error',reason:code};
}
async function getWeather(q,{client=sharedClient,now=Date.now()}={}){
  try{
    if(!isDate(q.date))fail('invalid_travel_date');
    const location=locationFor(q);
    const today=dateAt(now),limit=dateAt(now+3*DAY);
    if(q.date<today||q.date>limit)return {...responseBase(q,now),status:'no_forecast',reason:'outside_supported_window',location,grid:location.grid};
    const base=publication(now);
    const params={base_date:base.base_date,base_time:base.base_time,...location.grid};
    let payload=await client.get(FORECAST,params);
    let requested=base;
    // Missing publication at rollover: one previous-cycle fallback only.
    if(Number(payload?.response?.body?.totalCount)===0&&now-base.ms<=40*60000){
      requested=publication(base.ms-1,0);
      payload=await client.get(FORECAST,{base_date:requested.base_date,base_time:requested.base_time,...location.grid});
    }
    const body=payload?.response?.body;
    const rows=Array.isArray(body?.items?.item)?body.items.item:body?.items?.item?[body.items.item]:[];
    if(rows.some(row=>String(row.baseDate)!==requested.base_date||String(row.baseTime)!==requested.base_time))fail('publication_mismatch');
    const result=normalizeWeather({region:q.region,date:q.date,now:new Date(now),payload,expectedGrid:location.grid,preferUpcoming:true});
    const output={...result,location,grid:location.grid,source:result.source??KMA_SOURCE,mode:'unavailable',summary:null};
    // Invalid upstream data is not a bad user request (HTTP 400).
    if(result.status==='invalid')return {...output,status:'error'};
    if(result.status==='available'){
      const bits=[];
      if(result.temperatureC!=null)bits.push('기온 '+result.temperatureC+'°C');
      if(result.precipitationProbabilityPercent!=null)bits.push('강수확률 '+result.precipitationProbabilityPercent+'%');
      if(result.summary)bits.push(result.summary);
      return {...output,mode:'live',summary:bits.join(' · ')||null,condition:result.summary};
    }
    return output;
  }catch(e){return errorResult(q,now,e instanceof WeatherError?e.code:'internal_weather_error');}
}
module.exports={getWeather,toGrid,locationFor,publication,makeClient,WeatherError,sharedClient,kst,dateAt,isDate,FORECAST,WARNING};
