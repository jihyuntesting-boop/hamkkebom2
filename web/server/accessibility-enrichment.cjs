'use strict';

const {createHash}=require('node:crypto');
const {normalizePlaceEvidence,isoDate}=require('./access-evidence.cjs');
const {SOURCES,idOf,createAccessibilityProvider}=require('./accessibility-provider.cjs');
const FIELDS=Object.freeze({
  stairs:'stairs',stairCount:'stairCount',ramp:'ramp',stepFreeEntrance:'stepFreeEntrance',
  wheelchairEntrance:'wheelchairEntrance',elevator:'elevator',accessibleToilet:'accessibleToilet',
  accessibleParking:'accessibleParking',parkingToEntrance:'parkingToEntrance',walkingPath:'walkingPath',restFacilities:'restFacilities'
});
const TOUR_FIELDS={
  exit:{attribute:'entrance',scope:'entrance_unspecified',detail:'stepFreeEntrance'},
  parking:{attribute:'parking',scope:'parking_unspecified',detail:'accessibleParking'},
  restroom:{attribute:'toilet',scope:'toilet_unspecified',detail:'accessibleToilet'},
  elevator:{attribute:'elevator',scope:'elevator_unspecified',detail:'elevator'},
  route:{attribute:null,scope:'approach_unspecified',detail:'walkingPath'},
  wheelchair:{attribute:null,scope:'wheelchair_service_unspecified',detail:null}
};
const clean=v=>typeof v==='string'&&v.trim()&&!/^(정보\s*없음|미확인|미상|해당\s*없음|null|undefined|-|N\/A)$/i.test(v.trim())?v.trim().slice(0,1200):null;
const yn=v=>v==='Y'?true:v==='N'?false:null;
function civilDate(v,now){
  if(typeof v!=='string')return null;
  const match=/^(\d{4})(\d{2})(\d{2})(?:\d{6})?$/.exec(v);
  return isoDate(match?match.slice(1,4).join('-'):v,now);
}
function tourIdentity(place){
  const m=/^tour-(\d{1,16})$/.exec(place?.id||'');
  if(!m|| (place.provider&&place.provider.toLowerCase()!=='tourapi'))return null;
  for(const v of [place.contentId,place.providerPlaceId])if(v!=null&&idOf(v)!==m[1])return null;
  return m[1];
}
function evidence({provider,sourceId,sourceField,placeId=null,attribute=null,scope,
  detail=null,value,description,sourceUpdatedAt=null,collectedAt,now,maxAgeDays=365}){
  const stale=!!sourceUpdatedAt&&now.getTime()-Date.parse(sourceUpdatedAt)>maxAgeDays*86400000;
  return {placeId,provider,sourceId,sourceField,attribute,scope,detail,value,
    description:description??null,sourceUrl:SOURCES[provider].sourceUrl,
    source:SOURCES[provider].sourceUrl,sourceType:'public_api',
    sourceUpdatedAt,collectedAt,verifiedAt:null,evidenceGrade:'official_reported',
    status:stale?'stale':'source_reported',stale};
}
function tourEvidence(place,page,{now=new Date(),maxAgeDays=365}={}){
  const id=tourIdentity(place);
  if(!id) throw new TypeError('unresolved_tour_identity');
  if(page.totalCount!==page.items.length||page.items.some(row=>idOf(row.contentid??row.contentId)!==id))
    throw new TypeError('identity_or_partial');
  const records=[];
  for(const row of page.items){
    for(const [sourceField,field] of Object.entries(TOUR_FIELDS)){
      const raw=clean(row[sourceField]); if(!raw)continue;
      // Preserve free text, never parse "없음", stairs, counts, step-free or access
      // as structured yes/no. Wheelchair typically describes rental, not entrance.
      records.push(evidence({provider:'tour',sourceId:id,sourceField,placeId:place.id,
        ...field,value:raw,description:raw,collectedAt:page.collectedAt,
        sourceUpdatedAt:civilDate(row.modifiedtime??row.modifiedTime,now),now,maxAgeDays}));
    }
  }
  return records;
}
function independentRecords(provider,page,{now=new Date(),maxAgeDays=365}={}){
  if(!['culture','parking'].includes(provider))throw new TypeError('unsupported_provider');
  const result=[];
  for(const row of page.items){
    const parking=provider==='parking';
    const name=clean(parking?row.prkplceNm:row['시설명']);
    const address=clean(parking?(row.lnmadr||row.rdnmadr||row.rdnmadrNm||row.lnmadrNm||row.rdnmadrAddress||row.lnmadrAddress||row.lnmadr||row.rdnmadr||row.lotnoAddr||row.lnmadr):row['도로명주소']);
    const sourceId=parking?clean(String(row.prkplceNo??'')):null;
    if(!name||(!sourceId&&!address))continue;
    // Culture CSV has no published stable primary key; hash is a local candidate
    // identifier, never a cross-provider identity or an official source ID.
    const candidateId=sourceId||createHash('sha256').update(JSON.stringify([name,address,row['분점명']??null,row['지번주소']??null,row['위도']??null,row['경도']??null])).digest('hex');
    const sourceUpdatedAt=civilDate(parking?row.referenceDate:row['최종작성일'],now);
    const fields=parking?[
      ['pwdbsPpkZoneYn','parking','accessibleParking','parking_lot']
    ]:[
      ['장애인용 출입문','entrance',null,'accessible_door_unspecified'],
      ['장애인 화장실 유무','toilet','accessibleToilet','toilet_unspecified'],
      ['장애인 전용 주차장 여부','parking','accessibleParking','parking_unspecified'],
      ['휠체어 대여 가능 여부',null,null,'wheelchair_rental']
    ];
    const records=[];
    for(const [sourceField,attribute,detail,scope] of fields){
      const value=yn(row[sourceField]);if(value===null)continue;
      records.push(evidence({provider,sourceId,sourceField,attribute,detail,scope,value,
        collectedAt:page.collectedAt,sourceUpdatedAt,now,maxAgeDays}));
    }
    result.push({provider,sourceId,candidateId,name,address,sourceUpdatedAt,
      evidence:records,matchStatus:'unmatched',placeId:null});
  }
  return result;
}
function combine(place,records,{now=new Date(),maxAgeDays=365}={}){
  const original=Array.isArray(place.accessFacts)?place.accessFacts:[];
  const mapped=records.filter(r=>r.attribute);
  const sourcePlace={...place,accessFacts:[...original,...mapped]};
  const normalized=normalizePlaceEvidence(sourcePlace,{now,maxAgeDays});
  const attributes=Object.fromEntries(Object.keys(FIELDS).map(k=>[k,{value:null,status:'unknown',evidence:[]}]));
  for(const record of records){
    if(!record.detail)continue;
    const entry=attributes[record.detail];
    entry.evidence.push(record);
    // Free text is an official note, not a typed determination of availability.
    if(entry.status!=='conflicting')entry.status=record.stale?'stale':entry.status==='stale'?'stale':'source_reported';
  }
  for(const [detail,attribute] of Object.entries({stepFreeEntrance:'entrance',accessibleParking:'parking',accessibleToilet:'toilet',elevator:'elevator'})){
    if(normalized.accessibility.some(f=>f.attribute===attribute&&f.status==='conflicting'))attributes[detail].status='conflicting';
  }
  return {placeId:place.id,contentId:tourIdentity(place),accessFacts:normalized.accessibility,
    evidence:records,attributes,evidenceSummary:normalized.evidenceSummary,
    routeStatus:'unknown',reviewRequired:true,
    accessStatus:normalized.accessibility.some(f=>f.evidenceState==='conflicting')?'conflicting':
      normalized.accessibility.some(f=>f.evidenceState==='stale')?'stale':
      normalized.accessibility.some(f=>['source_reported','verified'].includes(f.evidenceState))?'info':'unverified'};
}
function createAccessibilityEnrichment({provider=createAccessibilityProvider(),now=()=>new Date()}={}){
  async function enrichPlaces(places,{refresh=false,maxPlaces=20,maxAgeDays=365}={}){
    if(!Array.isArray(places)||places.length>500||!Number.isInteger(maxPlaces)||maxPlaces<1||maxPlaces>200||
       !Number.isFinite(maxAgeDays)||maxAgeDays<0)throw new RangeError('invalid_enrichment_batch');
    const unique=new Map();
    for(const place of places)if(tourIdentity(place)&&!unique.has(place.id))unique.set(place.id,place);
    const eligible=[...unique.values()];
    const selected=refresh?eligible.slice(0,maxPlaces):eligible;
    const fetched=new Map();
    // Bound explicit refresh; cache-only normal requests do no network I/O.
    for(let i=0;i<selected.length;i+=3){
      await Promise.all(selected.slice(i,i+3).map(async place=>{
        try{
          const page=await provider.getTourDetail(tourIdentity(place),{cacheOnly:!refresh});
          const records=tourEvidence(place,page,{now:now(),maxAgeDays});
          fetched.set(place.id,{records,fetchStatus:records.length?'ok':'empty'});
        }catch(e){
          fetched.set(place.id,{records:[],fetchStatus:'error',error:typeof e.code==='string'?e.code:'invalid_response'});
        }
      }));
    }
    const data=places.map(place=>{
      const id=tourIdentity(place);
      const found=id?fetched.get(place.id):null;
      const outcome=found||{records:[],fetchStatus:id?'deferred':'unmatched'};
      return {...combine(place,outcome.records,{now:now(),maxAgeDays}),
        fetchStatus:outcome.fetchStatus,error:outcome.error??null};
    });
    const ids=new Set(data.filter(x=>x.contentId&&x.evidence.length).map(x=>x.placeId));
    const counts={eligible:eligible.length,withEvidence:ids.size,
      coverage:eligible.length?ids.size/eligible.length:null,
      errors:data.filter(x=>x.fetchStatus==='error').length,
      deferred:data.filter(x=>x.fetchStatus==='deferred').length,
      empty:data.filter(x=>x.fetchStatus==='empty').length,
      unmatched:data.filter(x=>x.fetchStatus==='unmatched').length};
    return {data,meta:{source:'tour',fetchedAt:now().toISOString(),
      partial:!!(counts.errors||counts.deferred||counts.unmatched),counts}};
  }
  async function loadIndependent(source,options={}){
    if(!['culture','parking'].includes(source))throw new TypeError('unsupported_provider');
    const result=await provider.scan(source,options);
    return {data:result.pages.flatMap(page=>independentRecords(source,page,{now:now()})),
      meta:{source,partial:result.partial,nextPage:result.nextPage,error:result.error}};
  }
  return {enrichPlaces,loadIndependent};
}
module.exports={createAccessibilityEnrichment,tourIdentity,tourEvidence,independentRecords,combine};
