'use strict';
const {sharedClient,WeatherError,locationFor,dateAt,kst,WARNING}=require('./weather-provider.cjs');
const SOURCE={name:'기상청 기상특보 조회서비스',url:'https://www.data.go.kr/data/15000415/openapi.do',type:'kma_warning'};
const AREA_SOURCE='https://www.weather.go.kr/w/forecast/guide/wrn-area.do?stn=109';
const HOUR=3600000;
const SEOUL={
  '서울동남권':['강동구','송파구','강남구','서초구'],
  '서울동북권':['도봉구','노원구','강북구','성북구','동대문구','중랑구','성동구','광진구'],
  '서울서남권':['강서구','양천구','구로구','영등포구','동작구','관악구','금천구'],
  '서울서북권':['은평구','종로구','마포구','서대문구','중구','용산구']
};
// Only exact known local names; subdivided areas must be verified separately.
const GYEONGGI=new Set('수원 안성 오산 평택 과천 군포 안양 의왕 안산 성남 이천 광주 하남 고양 양주 의정부 동두천 포천 가평 연천 구리 남양주 광명 시흥 김포 부천'.split(' '));
const TYPES={1:'강풍',2:'호우',3:'한파',4:'건조',5:'폭풍해일',6:'풍랑',7:'태풍',8:'대설',9:'황사',12:'폭염'};
function timestamp(value){
  const s=String(value??'');
  if(!/^\d{12}$/.test(s))return null;
  const label=s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8)+'T'+s.slice(8,10)+':'+s.slice(10,12)+':00+09:00';
  const ms=Date.parse(label);
  return Number.isFinite(ms)&&kst(ms)===label?ms:null;
}
function items(payload){
  const b=payload?.response?.body;
  if(b?.totalCount==null||!Number.isSafeInteger(Number(b.totalCount))||Number(b.totalCount)<0)throw new WeatherError('invalid_provider_payload');
  const count=Number(b.totalCount);
  const row=b.items?.item;
  const arr=Array.isArray(row)?row:row&&typeof row==='object'?[row]:[];
  if(arr.length!==count)throw new WeatherError('incomplete_warning_page');
  return arr;
}
function warningAreas(q,location,verifiedDistrict){
  const district=location.scope==='regional_reference'?(q.region==='서울'?'중구':'수원'):(verifiedDistrict??q.district);
  if(typeof district!=='string')return null;
  if(q.region==='서울'){
    const part=Object.entries(SEOUL).find(([,districts])=>districts.includes(district));
    return part?{district,names:['서울',part[0]],source:AREA_SOURCE,scope:location.scope,verified:location.scope==='regional_reference'||typeof verifiedDistrict==='string'}:null;
  }
  const city=district.replace(/(?:시|군)$/,'');
  return GYEONGGI.has(city)?{district:city,names:[city],source:AREA_SOURCE,scope:location.scope,verified:location.scope==='regional_reference'||typeof verifiedDistrict==='string'}:null;
}
function normalizeEvents(rows,area,now){
  if(!area)return {events:[],unresolved:true};
  const names=new Set(area.names),groups=new Map();
  let unresolved=false;
  for(const row of rows){
    if(!names.has(row.areaName))continue;
    const code=String(row.warnVar),kind=TYPES[code],severity={'0':'주의보','1':'경보'}[String(row.warnStress)];
    const issued=timestamp(row.tmFc),start=timestamp(row.startTime),end=timestamp(row.endTime),allEnd=timestamp(row.allEndTime);
    const command=String(row.command),cancel=String(row.cancel);
    if(cancel==='1')continue;
    if(cancel!=='0'||!kind||!severity||!row.areaCode||issued===null||!['1','2','3','6','7','8'].includes(command)){unresolved=true;continue;}
    if(issued>now){unresolved=true;continue;}
    const isEnd=['2','8'].includes(command);
    const effective=isEnd?end:start;
    if(effective===null){unresolved=true;continue;}
    const event={areaCode:String(row.areaCode),areaName:row.areaName,hazard:kind,severity,issuedAt:kst(issued),
      effectiveAt:kst(effective),endedAt:null,command,issued,effective,allEnd,isEnd};
    const key=event.areaCode+':'+code;
    const group=groups.get(key)||[];
    group.push(event);groups.set(key,group);
  }
  const events=[];
  for(const group of groups.values()){
    group.sort((a,b)=>a.effective-b.effective||a.issued-b.issued);
    const current=group.filter(x=>x.effective<=now).at(-1);
    const future=group.filter(x=>x.effective>now);
    if(current){
      const ended=current.isEnd||(current.allEnd!==null&&current.allEnd<=now);
      const {issued,effective,allEnd,isEnd,...event}=current;
      events.push({...event,state:ended?'ended':'active',endedAt:ended?kst(isEnd?effective:allEnd):null});
    }
    for(const e of future){
      const {issued,effective,allEnd,isEnd,...event}=e;
      events.push({...event,state:isEnd?'pending_end':'pending'});
    }
  }
  return {events,unresolved};
}
function snapshotState(rows,area,now){
  const snapshots=rows.map(x=>({issued:timestamp(x.tmFc),effective:timestamp(x.tmEf),text:x.t6}));
  if(snapshots.some(x=>x.issued===null||x.effective===null||typeof x.text!=='string'))return {state:'unknown',reason:'invalid_warning_snapshot'};
  const latest=snapshots.filter(x=>x.issued<=now&&x.effective<=now).sort((a,b)=>b.issued-a.issued||b.effective-a.effective)[0];
  if(!latest)return {state:'unknown',reason:'empty_warning_snapshot'};
  const metadata={issuedAt:kst(latest.issued),effectiveAt:kst(latest.effective)};
  // Provisional product freshness, not a guarantee that a weather warning expired.
  if(now-latest.issued>24*HOUR)return {...metadata,state:'stale',reason:'warning_snapshot_old'};
  const cleaned=latest.text.trim().replace(/\s+/g,' ');
  if(/^(?:현재\s*)?(?:발효\s*(?:중인\s*)?)?(?:기상\s*)?특보(?:가|는)?\s*(?:없음|없습니다)[.!]?$/.test(cleaned))
    return {...metadata,state:'none',reason:'explicit_nationwide_no_warning'};
  if(!area)return {...metadata,state:'unknown',reason:'warning_area_unverified'};
  // Corroborate exact area tokens only, never substrings (광주 vs 경기 광주).
  const matches=[];
  for(const line of latest.text.split(/\r?\n/)){
    const m=/^\s*[o○●\-]?\s*(강풍|호우|한파|건조|폭풍해일|풍랑|태풍|대설|황사|폭염)(주의보|경보)\s*[:：]\s*(.+)$/.exec(line);
    if(!m)continue;
    const list=m[3];
    const tokens=list.split(/[,()]/).map(x=>x.trim());
    for(const name of area.names){
      if(!tokens.includes(name))continue;
      // 경기 도시 must be explicitly under 경기/경기도 parentheses in the same line.
      if(!name.startsWith('서울')&&!new RegExp('경기도?\\s*\\([^)]*(?:^|[,\\s(])'+name+'(?:[,\\s)]|$)').test(list)
        && !new RegExp('경기도?\\s*\\(\\s*'+name+'(?:[,\\s)]|$)').test(list))continue;
      matches.push({hazard:m[1],severity:m[2],areaName:name});
    }
  }
  return {...metadata,state:matches.length?'matched':'unknown',reason:matches.length?'exact_snapshot_match':'warning_scope_unresolved',matches};
}
async function getAlerts(q,{client=sharedClient,now=Date.now(),verifiedDistrict}={}){
  const base={status:'unknown',reason:null,source:SOURCE,checkedAt:new Date(now).toISOString(),region:q.region,events:[],area:null,issuedAt:null,effectiveAt:null};
  try{
    const location=locationFor(q),area=warningAreas(q,location,verifiedDistrict);
    const result={...base,area,location};
    const date=q.date??dateAt(now);
    if(date!==dateAt(now))return {...result,reason:'current_warning_only'};
    const today=dateAt(now).replace(/-/g,''),from=dateAt(now-7*24*HOUR).replace(/-/g,'');
    // Current snapshot is authoritative for nationwide absence; code history alone cannot prove absence.
    const [current,history]=await Promise.allSettled([
      client.get(WARNING+'getPwnStatus',{},60000),
      area?client.get(WARNING+'getPwnCd',{stnId:109,fromTmFc:from,toTmFc:today},60000):Promise.resolve(null)
    ]);
    if(current.status==='rejected')throw current.reason;
    const snapshot=snapshotState(items(current.value),area,now);
    const enriched={...result,issuedAt:snapshot.issuedAt??null,effectiveAt:snapshot.effectiveAt??null};
    if(history.status==='rejected')return {...enriched,status:'error',reason:history.reason instanceof WeatherError?history.reason.code:'warning_history_failed'};
    const parsed=history.value?normalizeEvents(items(history.value),area,now):{events:[],unresolved:false};
    const evidence={...enriched,events:parsed.events};
    if(!area||!area.verified)return {...evidence,reason:'warning_area_unverified'};
    if(snapshot.state==='stale')return {...evidence,status:'stale',reason:snapshot.reason};
    if(snapshot.state==='none'&&!parsed.events.some(e=>e.state==='active')&&!parsed.unresolved)
      return {...evidence,status:'none',reason:snapshot.reason};
    if(snapshot.state==='matched'){
      const active=parsed.events.filter(e=>e.state==='active'&&snapshot.matches.some(m=>m.areaName===e.areaName&&m.hazard===e.hazard&&m.severity===e.severity));
      if(active.length&&!parsed.unresolved)return {...evidence,status:'active',reason:'snapshot_and_event_match',active};
    }
    return {...evidence,reason:'warning_scope_or_history_unresolved'};
  }catch(e){return {...base,status:e instanceof WeatherError&&['invalid_location','unsupported_region'].includes(e.code)?'invalid':'error',reason:e instanceof WeatherError?e.code:'internal_warning_error'};}
}
module.exports={getAlerts,warningAreas,normalizeEvents,snapshotState,timestamp};
