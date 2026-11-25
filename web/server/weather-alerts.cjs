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
const GYEONGGI=new Set('수원 안성 오산 평택 과천 군포 안양 의왕 안산 성남 이천 광주 하남 고양 양주 의정부 동두천 포천 가평 연천 구리 남양주 광명 시흥 김포 부천 화성'.split(' '));
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
// Bulletin t5 can be a compact KST timestamp or a Korean date/time label.
function bulletinTime(value){
  const compact=timestamp(value);
  if(compact!==null)return compact;
  if(typeof value!=='string')return null;
  const m=/^\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일(?:\s*\([월화수목금토일]\))?\s*(\d{1,2})(?::|시\s*)(\d{2})(?:분)?(?:\s*이후)?\s*$/.exec(value);
  return m?timestamp(m[1]+m.slice(2).map(x=>x.padStart(2,'0')).join('')):null;
}
function bulletinSnapshots(rows){
  // Nationwide bulletin (central office 108) only. No local bulletin can establish nationwide absence.
  return rows.filter(x=>String(x.stnId)==='108').map(x=>{
    const effective=bulletinTime(x.t5);
    return {tmFc:x.tmFc,tmEf:effective===null?null:kst(effective).slice(0,16).replace(/\D/g,''),t6:x.t6};
  });
}
function snapshotState(rows,area,now){
  const snapshots=rows.map(x=>({issued:bulletinTime(x.tmFc),effective:bulletinTime(x.tmEf),text:x.t6}));
  if(snapshots.some(x=>x.issued===null||x.effective===null||typeof x.text!=='string'))return {state:'unknown',reason:'invalid_warning_snapshot'};
  const latest=snapshots.filter(x=>x.issued<=now&&x.effective<=now).sort((a,b)=>b.issued-a.issued||b.effective-a.effective)[0];
  if(!latest)return {state:'unknown',reason:'empty_warning_snapshot'};
  const metadata={issuedAt:kst(latest.issued),effectiveAt:kst(latest.effective)};
  // Provisional product freshness, not a guarantee that a weather warning expired.
  if(now-latest.issued>24*HOUR)return {...metadata,state:'stale',reason:'warning_snapshot_old'};
  if(!area)return {...metadata,state:'unknown',reason:'warning_area_unverified'};
  function classifyText(text){
  const cleaned=text.trim().replace(/\s+/g,' ');
  if(/^(?:현재\s*)?(?:발효\s*(?:중인\s*)?)?(?:기상\s*)?특보(?:가|는)?\s*(?:없음|없습니다)[.!]?$/.test(cleaned))
    return {matches:[],recognizedLines:0,complete:true,explicitNone:true};
  // Parenthesized regional lists are scoped to the children, not the parent.
  // A non-match alone never proves absence. Only a fully parsed, explicit nationwide
  // snapshot with every listed area definitively outside the target can establish it.
  const matches=[];
  let complete=true,recognizedLines=0,unparsedLines=0,unresolvedEntries=0;const unresolvedAreas=[];
  const targetSeoul=area.names.includes('서울');
  const targetNames=new Set(area.names);
  const normalizeSeoul=s=>s==='서울특별시'?'서울':/^(동남|동북|서남|서북)권$/.test(s)?'서울'+s:s;
  const normalizeCity=s=>s.replace(/(?:시|군)$/,'');
  const outsideParent=/^(?:강원(?:도|특별자치도)?|충청북도|충청남도|충북|충남|전라북도|전북(?:특별자치도|자치도)?|전라남도|전남|경상북도|경상남도|경북|경남|제주(?:도|특별자치도)?|인천(?:광역시)?|부산(?:광역시)?|대구(?:광역시)?|대전(?:광역시)?|울산(?:광역시)?|세종(?:특별자치시)?|광주광역시|전남광주통합특별시)$/;
  function splitTop(text){
    let depth=0,part='',out=[];
    for(const c of text){
      if(c==='(')depth++;
      if(c===')')depth--;
      if(depth<0)return null;
      if(c===','&&depth===0){out.push(part.trim());part='';}
      else part+=c;
    }
    if(depth!==0)return null;
    out.push(part.trim());return out.every(Boolean)?out:null;
  }
  function classify(entry){
    const m=/^([^()]+?)(?:\(([^()]+)\))?$/.exec(entry);
    if(!m)return {unknown:true};
    const name=m[1].trim(),children=m[2]?.split(',').map(s=>s.trim())??null;
    if(children&&children.some(s=>!s||/제외|일부|이외|등$/.test(s)))return {unknown:true};
    if(/제외|일부|이외|등$/.test(name))return {unknown:true};
    if(/^(서울|서울특별시)$/.test(name)){
      if(!targetSeoul)return {};
      if(!children)return {hits:['서울']};
      const normalized=children.map(normalizeSeoul);
      if(normalized.some(s=>!Object.hasOwn(SEOUL,s)))return {unknown:true};
      return {hits:normalized.filter(s=>targetNames.has(s))};
    }
    if(/^(경기|경기도)$/.test(name)){
      if(targetSeoul)return {};
      if(!children)return {unknown:true}; // province-wide cannot be corroborated by city history alone
      const normalized=children.map(normalizeCity);
      // subdivided or unknown cities are conservatively unresolved for absence.
      const known=normalized.every(s=>GYEONGGI.has(s)||/^(파주|용인|여주|양평)/.test(s));
      return {hits:normalized.filter(s=>targetNames.has(s)),unknown:!known};
    }
    if(Object.hasOwn(SEOUL,normalizeSeoul(name))&&!children)return {hits:targetSeoul&&targetNames.has(normalizeSeoul(name))?[normalizeSeoul(name)]:[]};
    if(outsideParent.test(name))return {};
    // Explicit marine areas and named island groups are outside the supported inland references.
    if(/^(?:동해|서해|남해|제주도|인천[.·]경기).*(?:바다|해역)$/.test(name)||/^(?:울릉도[.·]독도|서해5도|흑산도[.·]홍도)$/.test(name))return {};
    return {unknown:true}; // unqualified 광주, 수원, 수도권, exclusions, new formats
  }
  for(const line of text.replace(/<br\s*\/?>/gi,'\n').split(/\r\n?|\n/)){
    if(!line.trim()||/^(?:특보\s*발효현황|특보\s*내용)\s*[:：]?$/.test(line.trim()))continue;
    const m=/^\s*[o○●\-]?\s*(강풍|호우|한파|건조|폭풍해일|풍랑|태풍|대설|황사|폭염|안개|지진해일)\s*(주의보|경보)\s*[:：]\s*(.+)$/.exec(line);
    if(!m){complete=false;unparsedLines++;continue;}
    const entries=splitTop(m[3]);
    if(!entries){complete=false;unparsedLines++;continue;}
    recognizedLines++;
    for(const entry of entries){
      const result=classify(entry);
      if(result.unknown){
        complete=false;unresolvedEntries++;
        // Public warning area labels only, never raw HTTP body, URL, credential or free-form log.
        const label=entry.trim().slice(0,120);
        if(unresolvedAreas.length<3&&/^[가-힣\s(),.·ㆍ\-]+$/.test(label))unresolvedAreas.push(label);
      }
      for(const name of result.hits??[])matches.push({hazard:m[1],severity:m[2],areaName:name});
    }
  }
  return {matches,recognizedLines,complete:complete&&recognizedLines>0,unparsedLines,unresolvedEntries,unresolvedAreas,explicitNone:false};
  }
  const current=classifyText(latest.text);
  const pending=snapshots.filter(x=>x.issued<=now&&x.effective>now&&x.issued>=latest.issued);
  const pendingClassifications=pending.map(x=>classifyText(x.text));
  const pendingScopeClear=pendingClassifications.every(p=>p.complete&&p.matches.length===0);
  const details={...metadata,...current,newerPending:pending.length>0,pendingScopeClear,pendingUnresolvedAreas:pendingClassifications.flatMap(p=>p.unresolvedAreas??[]).slice(0,3)};
  if(current.matches.length)return {...details,state:'matched',reason:'exact_snapshot_match'};
  if(current.complete&&pendingScopeClear)return {...details,state:current.explicitNone?'none':'regional_none',reason:current.explicitNone?'explicit_nationwide_no_warning':'complete_snapshot_region_not_listed'};
  return {...details,state:'unknown',reason:'warning_scope_unresolved'};
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
    const primaryRows=items(current.value);
    let snapshot=snapshotState(primaryRows,area,now);
    let snapshotSource='getPwnStatus',fallbackStatus=null,fallbackCount=null;
    // An empty/invalid current-status feed is not absence. Try one nationwide
    // bulletin request from the same approved KMA service; never scrape a page
    // or reuse a legacy project. No fallback on auth/quota/network errors.
    if(['empty_warning_snapshot','invalid_warning_snapshot'].includes(snapshot.reason)){
      try{
        const bulletinRows=items(await client.get(WARNING+'getWthrWrnMsg',{
          stnId:108,fromTmFc:dateAt(now-24*HOUR).replace(/-/g,''),toTmFc:today
        },60000));
        fallbackCount=bulletinRows.length;
        const candidate=snapshotState(bulletinSnapshots(bulletinRows),area,now);
        fallbackStatus=candidate.reason;
        if(candidate.issuedAt!=null){snapshot=candidate;snapshotSource='getWthrWrnMsg';}
      }catch(e){
        fallbackStatus=e instanceof WeatherError?e.code:'warning_bulletin_failed';
      }
    }
    const enriched={...result,issuedAt:snapshot.issuedAt??null,effectiveAt:snapshot.effectiveAt??null,
      snapshotEvidence:{operation:snapshotSource,primaryCount:primaryRows.length,fallbackCount,fallbackStatus,
        reason:snapshot.reason,recognizedLines:snapshot.recognizedLines??null,complete:snapshot.complete??null,newerPending:snapshot.newerPending??null,pendingScopeClear:snapshot.pendingScopeClear??null,unparsedLines:snapshot.unparsedLines??null,unresolvedEntries:snapshot.unresolvedEntries??null,unresolvedAreas:snapshot.unresolvedAreas??[],pendingUnresolvedAreas:snapshot.pendingUnresolvedAreas??[]}};
    if(history.status==='rejected')return {...enriched,status:'error',reason:history.reason instanceof WeatherError?history.reason.code:'warning_history_failed'};
    const parsed=history.value?normalizeEvents(items(history.value),area,now):{events:[],unresolved:false};
    const evidence={...enriched,events:parsed.events,historyCount:history.value?items(history.value).length:null};
    if(!area||!area.verified)return {...evidence,reason:'warning_area_unverified'};
    if(snapshot.state==='stale')return {...evidence,status:'stale',reason:snapshot.reason};
    if(['none','regional_none'].includes(snapshot.state)&&!parsed.events.some(e=>e.state==='active'||e.state==='pending')&&!parsed.unresolved)
      return {...evidence,status:'none',reason:snapshot.reason};
    if(snapshot.state==='matched'){
      const active=parsed.events.filter(e=>e.state==='active'&&snapshot.matches.some(m=>m.areaName===e.areaName&&m.hazard===e.hazard&&m.severity===e.severity));
      if(active.length&&!parsed.unresolved)return {...evidence,status:'active',reason:'snapshot_and_event_match',active};
    }
    return {...evidence,reason:snapshot.state==='unknown'?snapshot.reason:'warning_scope_or_history_unresolved'};
  }catch(e){return {...base,status:e instanceof WeatherError&&['invalid_location','unsupported_region'].includes(e.code)?'invalid':'error',reason:e instanceof WeatherError?e.code:'internal_warning_error'};}
}
module.exports={getAlerts,warningAreas,normalizeEvents,snapshotState,timestamp,bulletinTime,bulletinSnapshots};
