'use strict';
// Agent AA — isolated, opt-in KTO adapter; not a recommendation or route certification.
const {loadNationwideCatalog,areaFor}=require('./nationwide-tour-catalog.cjs');
const curatedDefault=require('./curated-place-details.cjs').curatedDetail;
function createRichTour({env={},fetcher,now=Date.now,signalFactory=ms=>AbortSignal.timeout(ms),limit=30,enrich,loadFacilities,nationwideCatalog,curatedDetail=curatedDefault}={}){
 const source='https://www.data.go.kr/data/15101578/openapi.do';
 const root='https://apis.data.go.kr/B551011/KorService2/';
 const types={'12':'spot','14':'culture','39':'food'};
 const cache=new Map(), pending=new Map(); let day='',calls=0,active=0,cooldownUntil=0;
 const error=(code,status=502)=>Object.assign(new Error(code),{code,status});
 const clean=(v,max=4000)=>{
  if(typeof v!=='string')return null;
  const t=v.replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,'').trim().slice(0,max);
  return !t||/^(정보\s*없음|미확인|미상|null|undefined|-|N\/A)$/i.test(t)?null:t;
 };
 const id=v=>/^(?:tour-)?\d{1,12}$/.test(String(v??''))?String(v).replace(/^tour-/,''):null;
 const integer=(v,min,max)=>/^\d{1,6}$/.test(String(v??''))&&Number(v)>=min&&Number(v)<=max?Number(v):null;
 const number=(v,min,max)=>typeof v==='number'||typeof v==='string'&&v.trim()!==''?Number.isFinite(Number(v))&&Number(v)>=min&&Number(v)<=max?Number(v):null:null;
 const coords=(lat,lng)=>{let y=number(lat,32,39),x=number(lng,124,133);return y===null||x===null?null:{lat:y,lng:x};};
 const prefixes={'1':['서울특별시','서울'],'2':['인천광역시','인천'],'3':['대전광역시','대전'],'4':['대구광역시','대구'],'5':['광주광역시','광주'],'6':['부산광역시','부산'],'7':['울산광역시','울산'],'8':['세종특별자치시','세종'],'31':['경기도','경기'],'32':['강원특별자치도','강원도','강원'],'33':['충청북도','충북'],'34':['충청남도','충남'],'35':['경상북도','경북'],'36':['경상남도','경남'],'37':['전북특별자치도','전라북도','전북'],'38':['전라남도','전남'],'39':['제주특별자치도','제주도','제주']};
 const addressArea=areaFor;
 function place(item){
  const contentId=id(item?.contentid),contentTypeId=String(item?.contenttypeid??''),name=clean(item?.title,180),address=clean(item?.addr1,400),point=coords(item?.mapy,item?.mapx);
  if(!contentId||!Object.hasOwn(types,contentTypeId)||!name)return null;
  const rawArea=clean(String(item.areacode??''),10),inferredArea=addressArea(address);
  const reportedArea=Object.hasOwn(prefixes,rawArea)?rawArea:null;
  const conflict=reportedArea&&inferredArea&&reportedArea!==inferredArea;
  return {id:'tour-'+contentId,contentId,contentTypeId,kind:types[contentTypeId],name,address,...(point||{lat:null,lng:null}),imageIdentifier:contentId,imageUrl:null,accessStatus:'unknown',sourceUrl:source,areaCode:conflict?null:reportedArea||inferredArea,areaCodeBasis:conflict?'conflicting':reportedArea?'provider_code':inferredArea?'official_address_prefix':'unknown',sigunguCode:conflict?null:clean(String(item.sigungucode??''),10)};
 }
 function put(key,value,ttl){cache.set(key,{value,until:now()+ttl});while(cache.size>128)cache.delete(cache.keys().next().value);}
 async function request(op,params){
  const key=[op,JSON.stringify(params)].join(':'); const saved=cache.get(key);
  if(saved&&saved.until>now()){if(saved.value.error)throw error(saved.value.error,saved.value.status);return saved.value;}
  if(pending.has(key))return pending.get(key);
  const task=(async()=>{
   if(env.HB_RICH_TOUR_ENABLED!=='1'||env.VERCEL_ENV==='production')throw error('rich_tour_disabled',503);
   let secret=[env.HB_TOURAPI_KEY,env.DATA_GO_KR_KEY].find(v=>typeof v==='string'&&v.trim())?.trim();
   if(!secret)throw error('provider_key_missing',503);
   try{secret=decodeURIComponent(secret);}catch{}
   const today=new Date(now()+9*3600000).toISOString().slice(0,10);
   if(day!==today){day=today;calls=0;}
   if(now()<cooldownUntil)throw error('upstream_rate_limited',503);
   if(calls>=limit||active>=4)throw error('local_budget_exhausted',503);
   calls++;active++;
   try{
    const query={serviceKey:secret,MobileOS:'ETC',MobileApp:'HAMKKEBOM',_type:'json',...params};
    const url=root+op+'?'+Object.entries(query).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(String(v))).join('&');
    let res;try{res=await fetcher(url,{signal:signalFactory(4500),redirect:'error',headers:{Accept:'application/json'}});}catch(e){throw error(['TimeoutError','AbortError'].includes(e?.name)?'upstream_timeout':'upstream_unavailable',e?.name==='TimeoutError'||e?.name==='AbortError'?504:502);}
    if(!res?.ok)throw error(res?.status===429?'upstream_rate_limited':res?.status===401||res?.status===403?'upstream_unauthorized':'upstream_unavailable',res?.status===429?503:502);
    let data;try{data=await res.json();}catch{throw error('upstream_invalid_json');}
    const header=data?.response?.header,body=data?.response?.body,code=String(header?.resultCode??'');
    if(!['0','00','0000'].includes(code))throw error(['22','23'].includes(code)?'upstream_rate_limited':['20','21','30','31','32','33'].includes(code)?'upstream_unauthorized':'upstream_error',['22','23'].includes(code)?503:502);
    const total=integer(body?.totalCount,0,999999);
    if(total===null)throw error('upstream_invalid_schema');
    const raw=body.items?.item;const items=raw==null||raw===''?[]:Array.isArray(raw)?raw:[raw];
    if(items.some(x=>!x||typeof x!=='object'||Array.isArray(x))||items.length>total)throw error('upstream_invalid_schema');
    const result={items,total,collectedAt:new Date(now()).toISOString()};
    put(key,result,900000);return result;
   }catch(e){const safe=typeof e?.code==='string'?e:error('upstream_unavailable');if(safe.code==='upstream_rate_limited')cooldownUntil=now()+60000;
   put(key,{error:safe.code,status:safe.status},60000);throw safe;}
   finally{active--;}
  })();
  pending.set(key,task);try{return await task;}finally{pending.delete(key);}
 }
 function page(q){const pageNo=integer(q.pageNo??1,1,10000),numOfRows=integer(q.numOfRows??20,1,40);if(pageNo===null||numOfRows===null)throw error('invalid_page',400);return {pageNo,numOfRows};}
 function region(q){const areaCode=q.areaCode==null?null:integer(q.areaCode,1,99),sigunguCode=q.sigunguCode==null?null:integer(q.sigunguCode,1,999);if(q.areaCode!=null&&areaCode===null||q.sigunguCode!=null&&(sigunguCode===null||areaCode===null))throw error('invalid_region',400);return {...(areaCode!==null?{areaCode}:{}),...(sigunguCode!==null?{sigunguCode}:{})};}
 async function search(q={}){
  const p=page(q),loc=region(q),type=String(q.contentTypeId??'12');
  if(!Object.hasOwn(types,type))throw error('invalid_content_type',400);
  const mode=q.mode??'area';let op,params={...p,...loc,contentTypeId:type,arrange:'A'};
  if(mode==='area'){op='areaBasedList2';}
  else if(mode==='keyword'){op='searchKeyword2';let keyword=clean(q.keyword,100);if(!keyword||typeof q.keyword!=='string'||q.keyword.length>100)throw error('invalid_keyword',400);params.keyword=keyword;}
  else if(mode==='location'){op='locationBasedList2';const point=coords(q.lat,q.lng),radius=integer(q.radius??5000,1,20000);if(!point||radius===null)throw error('invalid_coordinates',400);delete params.areaCode;delete params.sigunguCode;Object.assign(params,{mapX:point.lng,mapY:point.lat,radius});}
  else throw error('invalid_mode',400);
  const index=nationwideCatalog||loadNationwideCatalog(env,now());
  if(index)return index.search({type,mode,areaCode:loc.areaCode,sigunguCode:loc.sigunguCode,keyword:params.keyword,center:mode==='location'?{lat:params.mapY,lng:params.mapX}:null,radius:params.radius,...p,clock:now()});
  let result=await request(op,params),fallback=false,districtName=null;
  // A genuine zero-total keyword result may omit places without legacy codes.
  // Never broaden a location or area-list query; keep the user's region filter.
  if(mode==='keyword'&&loc.areaCode&&result.total===0){
   const broad={...params};delete broad.areaCode;delete broad.sigunguCode;
   if(loc.sigunguCode){
    const districts=await request('areaCode2',{pageNo:1,numOfRows:40,areaCode:loc.areaCode});
    districtName=clean(districts.items.find(x=>String(x.code)===String(loc.sigunguCode))?.name,100);
   }
   if(!loc.sigunguCode||districtName){result=await request(op,broad);fallback=true;}
  }
  const inRegion=x=>!fallback||(x.areaCode===String(loc.areaCode)&&(!loc.sigunguCode||
   (x.sigunguCode?x.sigunguCode===String(loc.sigunguCode):x.address?.split(/\s+/).slice(1,3).includes(districtName))));
  const places=[...new Map(result.items.map(place).filter(x=>x&&x.contentTypeId===type&&inRegion(x)).map(x=>[x.id,x])).values()];
  const hasNext=p.pageNo*p.numOfRows<result.total;
  return {places,pageNo:p.pageNo,numOfRows:p.numOfRows,totalAvailable:fallback?(p.pageNo===1&&!hasNext?places.length:null):result.total,hasNext,returned:places.length,providerReturned:result.items.length,sourceUrl:source,collectedAt:result.collectedAt,regionFallback:fallback,providerTotalScope:fallback?'nationwide_keyword':'requested_query'};
 }
 async function areas(q={}){const p=page(q),loc=region(q);if(loc.sigunguCode)throw error('invalid_region',400);const index=nationwideCatalog||loadNationwideCatalog(env,now());if(index)return index.areas(loc.areaCode,p.pageNo,p.numOfRows);const result=await request('areaCode2',{...p,...loc});return {areas:result.items.map(x=>({code:integer(x.code,1,999),name:clean(x.name,100)})).filter(x=>x.code&&x.name),...p,totalAvailable:result.total,hasNext:p.pageNo*p.numOfRows<result.total,sourceUrl:source};}
 const introFields={12:{hours:'usetime',closed:'restdate',parking:'parking',phone:'infocenter',useSeason:'useseason',experience:'expguide',stroller:'chkbabycarriage',pets:'chkpet',creditCard:'chkcreditcard',capacity:'accomcount'},14:{hours:'usetimeculture',closed:'restdateculture',parking:'parkingculture',parkingFee:'parkingfee',admission:'usefee',phone:'infocenterculture',stay:'spendtime',capacity:'accomcountculture',scale:'scale'},39:{hours:'opentimefood',closed:'restdatefood',parking:'parkingfood',phone:'infocenterfood',mainMenu:'firstmenu',menu:'treatmenu',reservation:'reservationfood',seats:'seat',smoking:'smoking',takeout:'packing',children:'kidsfacility',creditCard:'chkcreditcardfood'}};
 const evidence=(value,endpoint,field,collectedAt,state)=>({value:value??null,state:state??(value==null?'missing':'official_reported'),sourceUrl:source,endpoint,field,collectedAt:collectedAt??null,verifiedAt:null});
 async function detail(q={}){
  const contentId=id(q.contentId),type=String(q.contentTypeId??'');
  if(!contentId||!Object.hasOwn(types,type))throw error('invalid_place_identity',400);
  const p={contentId,contentTypeId:type};
  let common;
  try{common=await request('detailCommon2',{contentId});}
  catch(e){
   // Only when live detail is switched off or has no key: serve curated official-page facts.
   // Provider errors (quota, timeout, auth) are never masked by the snapshot.
   const curated=['rich_tour_disabled','provider_key_missing'].includes(e?.code)&&typeof curatedDetail==='function'?curatedDetail(contentId,type):null;
   if(curated)return curated;
   throw e;
  }
  const same=x=>String(x?.contentid??'')===contentId&&String(x?.contenttypeid??type)===type;
  if(common.items.length!==1||!same(common.items[0])||String(common.items[0].contenttypeid??'')!==type)throw error(common.items.length===0?'place_not_found':'provider_identity_mismatch',common.items.length===0?404:502);
  const item=common.items[0],basic=place(item);if(!basic)throw error('upstream_invalid_place');
  const fields={overview:evidence(clean(item.overview),'detailCommon2','overview',common.collectedAt),phone:evidence(clean(item.tel,300),'detailCommon2','tel',common.collectedAt)};
  const jobs=await Promise.allSettled([request('detailIntro2',p),request('detailInfo2',{...p,pageNo:1,numOfRows:40}),enrich?Promise.resolve().then(()=>enrich(basic)):Promise.resolve(null)]);
  const issues=[];const intro=jobs[0],info=jobs[1];
  if(intro.status==='rejected')issues.push({endpoint:'detailIntro2',code:intro.reason.code||'upstream_error'});
  else if(intro.value.items.length>1||intro.value.items.some(x=>!same(x)))issues.push({endpoint:'detailIntro2',code:'provider_identity_mismatch'});
  const introOk=intro.status==='fulfilled'&&!issues.some(x=>x.endpoint==='detailIntro2');
  const row=introOk?intro.value.items[0]||{}:{};
  for(const [key,field] of Object.entries(introFields[type])){
   const value=clean(row[field]);if(key==='phone'&&fields.phone.value){if(value&&value!==fields.phone.value)fields.phoneAdditional=evidence(value,'detailIntro2',field,intro.value.collectedAt);continue;}
   fields[key]=evidence(value,'detailIntro2',field,introOk?intro.value.collectedAt:null,introOk?undefined:'provider_error');
  }
  for(const key of ['admission','seniorDiscount','parkingFee','mainMenu','menu','reservation','seats'])if(!Object.hasOwn(fields,key))fields[key]=evidence(null,null,null,null,type!=='39'&&['mainMenu','menu','reservation','seats'].includes(key)?'not_applicable':'not_mapped');
  let additional=[],additionalHasNext=false;
  if(info.status==='rejected')issues.push({endpoint:'detailInfo2',code:info.reason.code||'upstream_error'});
  else if(info.value.items.some(x=>!same(x)))issues.push({endpoint:'detailInfo2',code:'provider_identity_mismatch'});
  else{additional=info.value.items.map(x=>({name:clean(x.infoname,200),...evidence(clean(x.infotext),'detailInfo2','infotext',info.value.collectedAt)})).filter(x=>x.name&&x.value);additionalHasNext=info.value.total>40;}
  // Exact official repeat-info labels supplement missing type-specific fields.
  // Different texts are retained separately; never synthesize a discount or amount.
  const repeatLabels={'입장료':'admission','입장요금':'admission','이용요금':'admission','관람료':'admission','경로우대':'seniorDiscount','경로우대할인':'seniorDiscount','주차요금':'parkingFee','주차료':'parkingFee','주차시설':'parking','관람시간':'hours','이용시간':'hours','영업시간':'hours','휴무일':'closed','쉬는날':'closed','화장실':'restroom','휴식시설':'rest','편의시설':'amenities'};
  for(const extra of additional){
   const key=repeatLabels[extra.name.replace(/\s+/g,'')];if(!key)continue;
   const {name,...fact}=extra;
   const existing=fields[key];
   if(existing?.state==='conflicting'){
    if(!existing.additionalReports.some(x=>x.value===fact.value))existing.additionalReports.push(fact);
   }else if(!existing?.value)fields[key]=fact;
   else if(existing.value.replace(/\s+/g,' ')!==fact.value.replace(/\s+/g,' ')){
    // Differing notes may describe separate seasons, fees or entrances.
    // Until reviewed do not promote either one to an unqualified answer.
    fields[key]={...existing,value:null,state:'conflicting',reviewReason:'different_reports_need_scope_review',additionalReports:[existing,fact]};
   }
  }
  // General provider prose is not accessibility verification. No facility
  // coordinates or rights are derived from descriptions or an image ID.
  const coverage={};for(const key of ['basic','hours','admission','parking','entrance','walking','stairsSlope','toilet','rest','photo','course']){
   coverage[key]=key==='basic'?(basic.address&&basic.lat!==null?'official_reported':'missing'):
     fields[key==='toilet'?'restroom':key]?.state??'missing';
  }
  let accessibility=null;
  const result=jobs[2];
  if(enrich){
   if(result.status==='rejected'||!result.value||result.value.placeId!==basic.id||result.value.contentId!==contentId){
    issues.push({endpoint:'detailWithTour2',code:'accessibility_unavailable'});
   }else{
    accessibility=result.value;
    if(accessibility.fetchStatus==='error')issues.push({endpoint:'detailWithTour2',code:'accessibility_unavailable'});
    for(const [key,attribute] of Object.entries({entrance:'stepFreeEntrance',toilet:'accessibleToilet',rest:'restFacilities'})){
     const state=accessibility.attributes?.[attribute]?.status;
     coverage[key]=coverage[key]==='conflicting'?'conflicting':state==='source_reported'?'official_reported':state==='stale'?'stale':state==='conflicting'?'conflicting':coverage[key]==='official_reported'?'official_reported':accessibility.fetchStatus==='error'?'provider_error':'missing';
    }
    // Walking-path prose is not actual measured walking distance.
   }
  }
  let facilityData={status:'not_connected',scope:'nearby_only',items:[]};
  if(loadFacilities){
   try{facilityData=await loadFacilities(basic);}catch{facilityData={status:'unavailable',scope:'nearby_only',items:[]};}
  }
  const coverageCounts=Object.values(coverage).reduce((a,v)=>(a[v]=(a[v]||0)+1,a),{});
  return {...basic,fields,additional,additionalHasNext,coverage,coverageCounts,accessStatus:accessibility?.accessStatus||'unknown',accessFacts:accessibility?.evidence||[],accessibility,facilities:facilityData.items||[],facilityData,issues,partial:issues.length>0||additionalHasNext,routeVerified:false};
 }
 return {search,areas,detail,usage:()=>({day,calls,active,scope:'process_only',limit})};
}
module.exports={createRichTour};
