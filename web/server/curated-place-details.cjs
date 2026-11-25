'use strict';
// Curated official-page facts (web/catalog/daechi-area-details.v1.json).
// Used only when the live TourAPI detail adapter is disabled or has no key.
// Each value keeps its own official sourceUrl/checkedAt; nothing is inferred.
const artifact=require('../catalog/daechi-area-details.v1.json');
const SOURCE='https://www.data.go.kr/data/15101578/openapi.do';
const TYPES={'12':'spot','14':'culture','39':'food'};
const FIELDS=new Set(['overview','hours','closed','admission','seniorDiscount','parking','parkingFee','restroom','rest','amenities','phone','reservation']);
const ACCESS=new Set(['wheelchairRental']);
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const httpsUrl=v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
const text=(v,max)=>typeof v==='string'&&v.trim()&&v.length<=max?v.trim():null;
function validFact(f){
  return Boolean(f&&typeof f==='object'&&!Array.isArray(f)&&text(f.value,600)&&httpsUrl(f.sourceUrl)&&text(f.sourceName,120)&&
    typeof f.checkedAt==='string'&&DATE.test(f.checkedAt)&&(f.scope==null||text(f.scope,200)));
}
function validRecord(r){
  if(!r||!/^tour-\d{1,12}$/.test(r.id)||!Object.hasOwn(TYPES,r.contentTypeId)||!text(r.name,180)||!text(r.address,400)||
    !Number.isFinite(r.lat)||!Number.isFinite(r.lng)||r.lat<33||r.lat>39||r.lng<124||r.lng>132||!/^서울(?:특별시|\s)/.test(r.address)||r.region!=='서울'||
    !text(r.identitySource,300)||!r.fields||typeof r.fields!=='object')return false;
  const keys=Object.keys(r.fields);
  if(!keys.length||keys.some(k=>!FIELDS.has(k)||!validFact(r.fields[k])))return false;
  if(r.accessibility!=null&&(typeof r.accessibility!=='object'||Object.keys(r.accessibility).some(k=>!ACCESS.has(k)||!validFact(r.accessibility[k]))))return false;
  return true;
}
function validateArtifact(data){
  if(data?.schemaVersion!==1||typeof data.catalogVersion!=='string'||!DATE.test(data.checkedAt||'')||!Array.isArray(data.records))return {ok:false,reason:'invalid_header'};
  const ids=new Set();
  for(const r of data.records){
    if(!validRecord(r))return {ok:false,reason:'invalid_record',id:r?.id??null};
    if(ids.has(r.id))return {ok:false,reason:'duplicate_id',id:r.id};
    ids.add(r.id);
  }
  return {ok:true,count:ids.size};
}
function createCuratedDetails(data=artifact){
  const valid=validateArtifact(data).ok;
  const byId=new Map(valid?data.records.map(r=>[r.id,r]):[]);
  return function curatedDetail(contentId,contentTypeId){
    const r=byId.get('tour-'+contentId);
    if(!r||r.contentTypeId!==String(contentTypeId))return null;
    const evidence=(f,key)=>({value:f.value,state:'official_reported',sourceUrl:f.sourceUrl,sourceName:f.sourceName,endpoint:'curated_official_page',field:key,collectedAt:f.checkedAt,verifiedAt:null,...(f.scope?{scope:f.scope}:{})});
    const fields={};
    for(const [key,f] of Object.entries(r.fields))fields[key]=evidence(f,key);
    const coverage={};
    for(const key of ['basic','hours','admission','parking','entrance','walking','stairsSlope','toilet','rest','photo','course'])
      coverage[key]=key==='basic'?'official_reported':fields[key==='toilet'?'restroom':key]?'official_reported':'missing';
    const coverageCounts=Object.values(coverage).reduce((a,v)=>(a[v]=(a[v]||0)+1,a),{});
    const attributes={};
    for(const [key,f] of Object.entries(r.accessibility||{}))attributes[key]={status:'source_reported',evidence:[{description:f.value,sourceUrl:f.sourceUrl,collectedAt:f.checkedAt,verifiedAt:null}]};
    const contentIdText=r.id.slice(5);
    return {id:r.id,contentId:contentIdText,contentTypeId:r.contentTypeId,kind:TYPES[r.contentTypeId],name:r.name,address:r.address,lat:r.lat,lng:r.lng,
      imageIdentifier:contentIdText,imageUrl:null,accessStatus:'unknown',sourceUrl:SOURCE,areaCode:'1',areaCodeBasis:'official_address_prefix',sigunguCode:null,
      fields,additional:[],additionalHasNext:false,coverage,coverageCounts,accessFacts:[],
      accessibility:Object.keys(attributes).length?{placeId:r.id,contentId:contentIdText,accessStatus:'unknown',fetchStatus:'curated',attributes}:null,
      facilities:[],facilityData:{status:'not_connected',scope:'nearby_only',items:[]},
      issues:[{endpoint:'detailCommon2',code:'live_detail_unavailable'}],partial:true,routeVerified:false,
      sourceMode:'curated_snapshot',curatedCatalogVersion:data.catalogVersion,identitySource:r.identitySource};
  };
}
module.exports={createCuratedDetails,validateArtifact,curatedDetail:createCuratedDetails()};
