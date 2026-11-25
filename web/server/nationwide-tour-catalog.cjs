'use strict';
// Shared nationwide discovery catalog. An uncollected/stale/invalid artifact is not a complete catalog.
const artifact=require('../catalog/nationwide-tour.v1.json');
const SOURCE='https://www.data.go.kr/data/15101578/openapi.do';
const TYPES={'12':'spot','14':'culture','39':'food'};
const AREAS={'1':['서울','서울특별시'],'2':['인천','인천광역시'],'3':['대전','대전광역시'],'4':['대구','대구광역시'],'5':['광주','광주광역시'],'6':['부산','부산광역시'],'7':['울산','울산광역시'],'8':['세종','세종특별자치시'],'31':['경기','경기도'],'32':['강원','강원특별자치도','강원도'],'33':['충북','충청북도'],'34':['충남','충청남도'],'35':['경북','경상북도'],'36':['경남','경상남도'],'37':['전북','전북특별자치도','전라북도'],'38':['전남','전라남도'],'39':['제주','제주특별자치도','제주도']};
const SUBTYPES={A0101:'자연 관광지',A0102:'자연 관광자원',A0201:'역사·문화유산',A0202:'휴양·여가',A0203:'체험시설',A0204:'산업관광',A0205:'건축·조형',A0206:'문화시설',A0207:'축제',A0208:'행사'};
const DAY=86400000,MAX_SCAN_AGE=7*DAY,MAX_SNAPSHOT_AGE=30*DAY;
function clean(value,max){
  if(typeof value!=='string')return null;
  const t=value.replace(/<[^>]*>/g,'').trim();
  return t&&t.length<=max&&!/^(정보\s*없음|미확인|미상|null|undefined|-|N\/A)$/i.test(t)?t:null;
}
function number(v,min,max){
  if(typeof v!=='number'&&(typeof v!=='string'||!v.trim()))return null;
  const n=Number(v);return Number.isFinite(n)&&n>=min&&n<=max?n:null;
}
// 2026-07-01 administrative merger: the live TourAPI areaCode2 still
// reports legacy tourism groups 5 (광주) and 38 (전남), not a new provider code.
// Use only exact former district names for the new official address prefix.
const GWANGJU_DISTRICTS=new Set(['동구','서구','남구','북구','광산구']);
const JEONNAM_DISTRICTS=new Set(['목포시','여수시','순천시','나주시','광양시','담양군','곡성군','구례군','고흥군','보성군','화순군','장흥군','강진군','해남군','영암군','무안군','함평군','영광군','장성군','완도군','진도군','신안군']);
function areaFor(address){
  const [prefix,district]=typeof address==='string'?address.trim().split(/\s+/):[];
  if(['전남광주통합특별시','광주특별시'].includes(prefix)){
    return GWANGJU_DISTRICTS.has(district)?'5':JEONNAM_DISTRICTS.has(district)?'38':null;
  }
  return Object.keys(AREAS).find(k=>AREAS[k].includes(prefix))||null;
}
function dateValue(v){
  if(typeof v!=='string'||!/^\d{8}(?:\d{6})?$/.test(v))return null;
  const d=v.slice(0,4)+'-'+v.slice(4,6)+'-'+v.slice(6,8),n=Date.parse(d+'T00:00:00Z');
  return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===d?d:null;
}
function normalizeRecord(row,type,collectedAt){
  const id=String(row?.contentid??''),kind=TYPES[type],name=clean(row?.title,180);
  if(!/^\d{1,12}$/.test(id)||!kind||String(row?.contenttypeid??'')!==type||!name)return null;
  const address=clean(row.addr1,400),inferred=areaFor(address),rawArea=String(row.areacode??'');
  const reported=Object.hasOwn(AREAS,rawArea)?rawArea:null,conflicting=Boolean(reported&&inferred&&reported!==inferred);
  const areaCode=conflicting?null:reported||inferred;
  const lat=number(row.mapy,32,39),lng=number(row.mapx,124,133);
  const district=String(row.sigungucode??'');
  const sigunguCode=!conflicting&&reported&&/^\d{1,3}$/.test(district)&&Number(district)>0?district:null;
  const categoryCode=typeof row.cat2==='string'&&/^[A-Z]\d{4}$/.test(row.cat2)?row.cat2:null;
  return {id:'tour-'+id,contentId:id,contentTypeId:type,kind,name,address,
    lat:lat===null||lng===null?null:lat,lng:lat===null||lng===null?null:lng,
    areaCode,region:areaCode?AREAS[areaCode][0]:null,
    areaCodeBasis:conflicting?'conflicting':reported?'provider_code':inferred?'official_address_prefix':'unknown',
    sigunguCode,providerCategoryCode:categoryCode,
    subtype:kind==='food'?'음식점':kind==='culture'?'문화시설':SUBTYPES[categoryCode]||'관광지 · 세부 유형 미확인',
    sourceUpdatedAt:dateValue(row.modifiedtime),collectedAt};
}
function kstYear(now){return new Date(now+9*3600000).getUTCFullYear();}
function pastEvent(p,now){return pastEventInYear(p,kstYear(now));}
function pastEventInYear(p,year){
  const m=p.name.match(/^(?:제\s*)?(20\d{2})\s*(?:년\s*)?/);
  return p.kind!=='food'&&Boolean(m)&&Number(m[1])<year&&(/축제|페어|박람회|페스티벌|행사|콘서트|공연|전시회/.test(p.name)||['A0207','A0208'].includes(p.providerCategoryCode));
}
function publicPlace(p,mode='nationwide_catalog'){
  return {...p,...(!p.areaCode?{lat:null,lng:null}:{}),source:mode==='nationwide_live'?'한국관광공사 TourAPI 위치 조회':'한국관광공사 TourAPI 전국 수집 자료',sourceUrl:SOURCE,discoverySource:mode,
    accessStatus:'unverified',accessFacts:[],imageIdentifier:p.contentId,imageUrl:null,matched:true};
}
function validRecord(r,start,end){
  if(!r||typeof r!=='object'||Array.isArray(r)||(r.sourceUpdatedAt!==null&&typeof r.sourceUpdatedAt!=='string'))return false;
  // Reconstruct through the allowlist. Unknown or extra fields (including images/keys) fail validation.
  const rebuilt=normalizeRecord({contentid:r.contentId,contenttypeid:r.contentTypeId,title:r.name,addr1:r.address,
    mapy:r.lat,mapx:r.lng,areacode:r.areaCodeBasis==='provider_code'?r.areaCode:'',
    sigungucode:r.sigunguCode,cat2:r.providerCategoryCode,modifiedtime:r.sourceUpdatedAt?.replaceAll('-','')},r.contentTypeId,r.collectedAt);
  if(!rebuilt)return false;
  if(r.areaCodeBasis==='conflicting'){
    if(r.areaCode!==null||r.region!==null||r.sigunguCode!==null)return false;
    rebuilt.areaCode=null;rebuilt.region=null;rebuilt.areaCodeBasis='conflicting';rebuilt.sigunguCode=null;
  }
  const t=Date.parse(r.collectedAt);
  return Number.isFinite(t)&&t>=start&&t<=end&&Object.keys(r).length===Object.keys(rebuilt).length&&Object.keys(rebuilt).every(k=>Object.hasOwn(r,k)&&r[k]===rebuilt[k]);
}
function validateCatalog(data,now=Date.now()){
  const fail=reason=>({ok:false,reason});
  if(data?.schemaVersion!==1||data.state!=='complete'||data.sourceUrl!==SOURCE||!Array.isArray(data.records)||!Array.isArray(data.coverage)||data.coverage.length!==3)return fail('not_complete');
  const start=Date.parse(data.startedAt),end=Date.parse(data.completedAt);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<start||end-start>MAX_SCAN_AGE||end>now+60000)return fail('invalid_scan_dates');
  if(now-end>MAX_SNAPSHOT_AGE)return fail('stale');
  if(data.records.length>500000)return fail('invalid_size');
  const ids=new Set(),counts={'12':0,'14':0,'39':0};
  for(const p of data.records){
    if(!validRecord(p,start,end)||ids.has(p.id))return fail('invalid_or_duplicate_record');
    ids.add(p.id);counts[p.contentTypeId]++;
  }
  const types=new Set();
  for(const c of data.coverage){
    if(!c||!Object.hasOwn(TYPES,c.contentTypeId)||types.has(c.contentTypeId)||!Number.isSafeInteger(c.providerTotal)||c.providerTotal<0||
      !Number.isSafeInteger(c.accepted)||!Number.isSafeInteger(c.rejected)||c.rejected<0||c.accepted<0||
      c.providerTotal!==c.accepted+c.rejected||c.accepted!==counts[c.contentTypeId]||c.completed!==true)return fail('incomplete_coverage');
    types.add(c.contentTypeId);
  }
  if(!data.records.length)return fail('empty_catalog');
  const byArea={};for(const k of Object.keys(AREAS))byArea[k]=0;
  let unknownArea=0,missingCoordinates=0;
  for(const p of data.records){if(p.areaCode)byArea[p.areaCode]++;else unknownArea++;if(p.lat===null)missingCoordinates++;}
  return {ok:true,quality:{byArea,unknownArea,missingCoordinates,rejected:data.coverage.reduce((n,c)=>n+c.rejected,0)}};
}
function meters(a,b){
  const rad=x=>x*Math.PI/180;
  const h=Math.sin(rad(a.lat-b.lat)/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(a.lng-b.lng)/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
const CELL=.1,cell=(lat,lng)=>Math.floor(lat/CELL)+':'+Math.floor(lng/CELL);
function createIndex(data,now=Date.now()){
  const validation=validateCatalog(data,now);if(!validation.ok)return null;
  const records=data.records.map(p=>publicPlace(p)),byId=new Map(),grid=new Map();
  for(const p of records){
    byId.set(p.id,p);
    if(p.lat===null||!p.areaCode)continue; // no pin for unlocated or conflicting-area records
    const k=cell(p.lat,p.lng);
    if(!grid.has(k))grid.set(k,[]);grid.get(k).push(p);
  }
  const matches=(p,type)=>!type||p.contentTypeId===type;
  function around(center,radius,type,clock,category='all'){
    const dy=radius/110000,dx=radius/(110000*Math.max(.1,Math.cos(center.lat*Math.PI/180)));
    const found=[],year=kstYear(clock);let hiddenPastEvents=0;
    for(let y=Math.floor((center.lat-dy)/CELL);y<=Math.floor((center.lat+dy)/CELL);y++)
      for(let x=Math.floor((center.lng-dx)/CELL);x<=Math.floor((center.lng+dx)/CELL);x++)
        for(const p of grid.get(y+':'+x)||[]){
          if(!matches(p,type)||category==='food'&&p.kind!=='food'||category==='spot'&&p.kind==='food')continue;const d=meters(center,p);if(d>radius)continue;
          if(pastEventInYear(p,year)){hiddenPastEvents++;continue;}
          found.push({p,d});
        }
    found.sort((a,b)=>a.d-b.d||a.p.id.localeCompare(b.p.id));
    return {places:found.map(({p,d})=>({...p,distanceKm:Math.round(d/100)/10})),hiddenPastEvents};
  }
  const quality=validation.quality;
  const catalogPartial=Boolean(quality.unknownArea||quality.missingCoordinates||quality.rejected||Object.values(quality.byArea).some(n=>n===0));
  return {
    collectedAt:data.completedAt,coverage:data.coverage,quality,catalogPartial,
    byId(id){return byId.get(id)||null;},
    nearby(center,radius,category='all',limit=50,clock=Date.now()){
      const result=around(center,radius,null,clock,category),selected=result.places;
      // In the mixed view, keep attractions and food represented instead of letting food crowd out all places.
      let places=selected.slice(0,limit);
      if(category==='all'){
        const reserve=Math.floor(limit/3),picked=new Map();
        for(const kind of ['spot','culture','food'])for(const p of selected.filter(p=>p.kind===kind).slice(0,reserve))picked.set(p.id,p);
        for(const p of selected)if(picked.size<limit)picked.set(p.id,p);
        places=[...picked.values()].sort((a,b)=>meters(a,center)-meters(b,center)||a.id.localeCompare(b.id));
      }
      return {places,totalAvailable:selected.length,hasNext:selected.length>places.length,hiddenPastEvents:result.hiddenPastEvents};
    },
    search({type,mode,areaCode,sigunguCode,keyword,center,radius,pageNo,numOfRows,clock=Date.now()}){
      let selected,hiddenPastEvents=0;
      if(mode==='location'){const r=around(center,radius,type,clock);selected=r.places;hiddenPastEvents=r.hiddenPastEvents;}
      else{
        selected=records.filter(p=>matches(p,type)&&(!areaCode||p.areaCode===String(areaCode))&&(!sigunguCode||p.sigunguCode===String(sigunguCode))&&(!keyword||p.name.toLocaleLowerCase('ko').includes(keyword.toLocaleLowerCase('ko'))));
        const year=kstYear(clock);
        hiddenPastEvents=selected.filter(p=>pastEventInYear(p,year)).length;
        selected=selected.filter(p=>!pastEventInYear(p,year)).sort((a,b)=>a.name.localeCompare(b.name,'ko')||a.id.localeCompare(b.id));
      }
      const places=selected.slice((pageNo-1)*numOfRows,pageNo*numOfRows);
      return {places,pageNo,numOfRows,totalAvailable:selected.length,hasNext:pageNo*numOfRows<selected.length,returned:places.length,sourceUrl:SOURCE,collectedAt:data.completedAt,sourceMode:'catalog_snapshot',catalogPartial,hiddenPastEvents,regionFallback:false,providerTotalScope:'local_catalog'};
    },
    areas(areaCode,pageNo,numOfRows){
      let rows=Object.entries(AREAS).map(([code,names])=>({code:Number(code),name:names[1]}));
      if(areaCode){
        const namesByCode=new Map();
        for(const p of records){
          if(p.areaCode!==String(areaCode)||!p.sigunguCode||!p.address)continue;
          const district=p.address.split(/\s+/)[1];
          if(!district||!/[시군구]$/.test(district))continue;
          if(!namesByCode.has(p.sigunguCode))namesByCode.set(p.sigunguCode,new Set());
          namesByCode.get(p.sigunguCode).add(district);
        }
        rows=[...namesByCode].filter(([,names])=>names.size===1).map(([code,names])=>({code:Number(code),name:[...names][0]}));
      }
      rows.sort((a,b)=>a.code-b.code);
      return {areas:rows.slice((pageNo-1)*numOfRows,pageNo*numOfRows),pageNo,numOfRows,totalAvailable:rows.length,hasNext:pageNo*numOfRows<rows.length,sourceUrl:SOURCE,collectedAt:data.completedAt,sourceMode:'catalog_snapshot',partial:Boolean(areaCode)};
    }
  };
}
let cached;
function loadNationwideCatalog(env=process.env,now=Date.now()){
  if(env.HB_NATIONWIDE_CATALOG_ENABLED!=='1')return null;
  if(cached===undefined){try{cached=createIndex(artifact,now);}catch{cached=null;}}
  if(!cached||now-Date.parse(cached.collectedAt)>MAX_SNAPSHOT_AGE)return null;
  return cached;
}
module.exports={SOURCE,TYPES,AREAS,MAX_SCAN_AGE,MAX_SNAPSHOT_AGE,normalizeRecord,validateCatalog,createIndex,loadNationwideCatalog,pastEvent,publicPlace,areaFor};
