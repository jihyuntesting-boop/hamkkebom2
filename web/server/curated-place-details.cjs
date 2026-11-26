'use strict';
// Curated official-page facts:
//  - web/catalog/daechi-area-details.v1.json (Daechi-area nearby places)
//  - web/catalog/place-details.v1.json (places shown with a photo)
// Used only when the live TourAPI detail adapter is disabled or has no key.
// Each value keeps its own official sourceUrl/checkedAt; nothing is inferred.
const daechi=require('../catalog/daechi-area-details.v1.json');
const placeDetails=require('../catalog/place-details.v1.json');
const SOURCE='https://www.data.go.kr/data/15101578/openapi.do';
const TYPES={'12':'spot','14':'culture','39':'food'};
const FIELDS=new Set(['overview','hours','closed','admission','seniorDiscount','stay','parking','parkingFee','restroom','rest','amenities','phone','reservation','website']);
// Facility notes only. Step-free entrance, walking route or stairs/slope claims are never accepted from a page summary.
const ACCESS=new Set(['wheelchairRental','strollerRental','accessibleParking','accessibleToilet','elevator','ramp','wheelchairAccess']);
const REGIONS={서울:/^서울(?:특별시|\s)/,경기:/^경기(?:도|\s)/};
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const httpsUrl=v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
const text=(v,max)=>typeof v==='string'&&v.trim()&&v.length<=max?v.trim():null;
function validFact(f,key){
  return Boolean(f&&typeof f==='object'&&!Array.isArray(f)&&text(f.value,600)&&httpsUrl(f.sourceUrl)&&text(f.sourceName,120)&&
    typeof f.checkedAt==='string'&&DATE.test(f.checkedAt)&&(f.scope==null||text(f.scope,200))&&(key!=='website'||httpsUrl(f.value)));
}
function validRecord(r){
  if(!r||!/^tour-\d{1,12}$/.test(r.id)||!Object.hasOwn(TYPES,r.contentTypeId)||!text(r.name,180)||!Object.hasOwn(REGIONS,r.region)||
    !text(r.identitySource,300)||!r.fields||typeof r.fields!=='object'||Array.isArray(r.fields))return false;
  // Identity is the TourAPI content ID. Address/coordinates are optional; when present they must agree with the region.
  if(r.address!=null&&(!text(r.address,400)||!REGIONS[r.region].test(r.address)))return false;
  if((r.lat!=null||r.lng!=null)&&(!Number.isFinite(r.lat)||!Number.isFinite(r.lng)||r.lat<33||r.lat>39||r.lng<124||r.lng>132))return false;
  const keys=Object.keys(r.fields);
  if(!keys.length||keys.some(k=>!FIELDS.has(k)||!validFact(r.fields[k],k)))return false;
  if(r.accessibility!=null&&(typeof r.accessibility!=='object'||Array.isArray(r.accessibility)||
    Object.keys(r.accessibility).some(k=>!ACCESS.has(k)||!validFact(r.accessibility[k],k))))return false;
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
// An invalid artifact serves nothing. When two valid artifacts carry the same ID with the
// same content type, the earlier artifact's facts win and the later one only fills gaps.
function indexArtifacts(list){
  const byId=new Map();
  for(const data of list){
    if(!validateArtifact(data).ok)continue;
    for(const r of data.records){
      const prev=byId.get(r.id);
      if(!prev){byId.set(r.id,{record:r,versions:[data.catalogVersion]});continue;}
      if(prev.record.contentTypeId!==r.contentTypeId)continue;
      const p=prev.record;
      prev.record={...p,address:p.address??r.address,lat:p.lat??r.lat,lng:p.lng??r.lng,
        fields:{...r.fields,...p.fields},accessibility:{...(r.accessibility||{}),...(p.accessibility||{})}};
      prev.versions.push(data.catalogVersion);
    }
  }
  return byId;
}
function createCuratedDetails(data=[daechi,placeDetails]){
  const byId=indexArtifacts(Array.isArray(data)?data:[data]);
  return function curatedDetail(contentId,contentTypeId){
    const entry=byId.get('tour-'+contentId),r=entry?.record;
    if(!r||r.contentTypeId!==String(contentTypeId))return null;
    const scoped=f=>f.scope?{scope:f.scope}:{};
    const fields={};
    for(const [key,f] of Object.entries(r.fields))fields[key]={value:f.value,state:'official_reported',sourceUrl:f.sourceUrl,sourceName:f.sourceName,
      endpoint:'curated_official_page',field:key,collectedAt:f.checkedAt,verifiedAt:null,...scoped(f)};
    const attributes={};
    for(const [key,f] of Object.entries(r.accessibility||{}))attributes[key]={status:'source_reported',
      evidence:[{description:f.value,sourceUrl:f.sourceUrl,sourceName:f.sourceName,collectedAt:f.checkedAt,verifiedAt:null,...scoped(f)}]};
    const coverage={};
    for(const key of ['basic','hours','admission','parking','entrance','walking','stairsSlope','toilet','rest','photo','course'])
      coverage[key]=key==='basic'||fields[key==='toilet'?'restroom':key]||key==='toilet'&&attributes.accessibleToilet?'official_reported':'missing';
    const coverageCounts=Object.values(coverage).reduce((a,v)=>(a[v]=(a[v]||0)+1,a),{});
    const contentIdText=r.id.slice(5);
    return {id:r.id,contentId:contentIdText,contentTypeId:r.contentTypeId,kind:TYPES[r.contentTypeId],name:r.name,
      address:r.address??null,lat:r.lat??null,lng:r.lng??null,
      imageIdentifier:contentIdText,imageUrl:null,accessStatus:'unknown',sourceUrl:SOURCE,areaCode:r.region==='서울'?'1':'31',areaCodeBasis:'official_address_prefix',sigunguCode:null,
      fields,additional:[],additionalHasNext:false,coverage,coverageCounts,accessFacts:[],
      accessibility:Object.keys(attributes).length?{placeId:r.id,contentId:contentIdText,accessStatus:'unknown',fetchStatus:'curated',attributes}:null,
      facilities:[],facilityData:{status:'not_connected',scope:'nearby_only',items:[]},
      issues:[{endpoint:'detailCommon2',code:'live_detail_unavailable'}],partial:true,routeVerified:false,
      sourceMode:'curated_snapshot',curatedCatalogVersion:entry.versions.join('+'),identitySource:r.identitySource};
  };
}
module.exports={createCuratedDetails,validateArtifact,curatedDetail:createCuratedDetails()};
