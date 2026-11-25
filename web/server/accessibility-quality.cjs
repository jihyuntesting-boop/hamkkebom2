'use strict';

// DATA-01/02 Agent U: read-only quality arithmetic. Reported text is not a
// verified route; an unanswered field counts in the denominator as unknown.
const {classify}=require('./travel.cjs');
const FEATURES=Object.freeze([
  ['stairs','stairs','fact'],['slope','slope','fact'],
  ['step_free_entrance','stepFreeEntrance','detail'],
  ['accessible_parking','accessibleParking','detail'],
  ['dropoff_possible','dropoff','fact'],['elevator','elevator','detail'],
  ['accessible_toilet','accessibleToilet','detail'],
  ['wheelchair_rental','wheelchairRental','detail'],
  ['seating','seating','detail'],['rest_facilities','restFacilities','detail'],
  ['parking_to_entrance','parkingToEntrance','detail'],
  ['parking_to_table','parkingToTable','detail'],['approach_path','walkingPath','detail']
]);
const STATUS=['verified_yes','verified_no','unknown','conflicting'];
function metric() {
  return {verified_yes:0,verified_no:0,unknown:0,conflicting:0,
    source_reported:0,stale:0,evidence_count:0};
}
function statusFor(facts) {
  if(facts.some(f=>f?.status==='conflicting'||f?.evidenceState==='conflicting'))return 'conflicting';
  const verified=new Set(facts.filter(f=>!f?.stale&&['verified_yes','verified_no'].includes(f?.status)).map(f=>f.status));
  if(verified.size>1)return 'conflicting';
  // A stale or uncertain fact cannot turn a route into a confirmed claim.
  if(facts.some(f=>f?.stale||f?.evidenceState==='stale'||f?.status==='stale'))return 'unknown';
  if(verified.size===1)return [...verified][0];
  return 'unknown';
}
function evidenceFor(record,name,kind) {
  if(kind==='fact')return (Array.isArray(record?.accessFacts)?record.accessFacts:[])
    .filter(f=>f.attribute===name);
  return Array.isArray(record?.attributes?.[name]?.evidence)
    ?record.attributes[name].evidence:[];
}
function observedStatus(record,name,kind) {
  const records=evidenceFor(record,name,kind);
  if(kind==='detail'&&record?.attributes?.[name]?.status==='conflicting')
    return {status:'conflicting',records};
  return {status:statusFor(records),records};
}
function verifyIdRecord(place,record){
  const id=typeof place?.id==='string'?/^tour-(\d{1,16})$/.exec(place.id):null;
  if(!id||record?.contentId!==id[1]||record.fetchStatus!=='ok')return false;
  return Array.isArray(record.evidence)&&record.evidence.length>0&&record.evidence.every(f=>
    f.placeId===place.id&&f.sourceId===id[1]&&f.provider==='tour');
}
function summarizeAccessibilityCoverage(places,enriched,{mode='mock',sampleTarget=40}={}){
  if(!Array.isArray(places)||!Array.isArray(enriched)||places.length>500||enriched.length>500)
    throw new TypeError('invalid_audit_records');
  const duplicateIds=places.length-new Set(places.map(p=>p.id)).size;
  if(duplicateIds)throw new TypeError('duplicate_place_ids');
  const byId=new Map(enriched.map(p=>[p.placeId,p]));
  const details=Object.fromEntries(FEATURES.map(([name])=>[name,metric()]));
  const outcome={ok:0,empty:0,error:0,deferred:0,unmatched:0,missing:0};
  const region={};
  const recommendation={stairsImpossible:{eligible:0,needsReview:0,excluded:0},
    wheelchair:{eligible:0,needsReview:0,excluded:0},
    slopeAvoid:{eligible:0,needsReview:0,excluded:0}};
  const profiles={
    stairsImpossible:{stairs:'impossible',walkingMinutes:10,slopePreference:'flexible',mobilityAid:'none'},
    wheelchair:{stairs:'impossible',walkingMinutes:10,slopePreference:'flexible',mobilityAid:'wheelchair'},
    slopeAvoid:{stairs:'avoid',walkingMinutes:10,slopePreference:'avoid_steep',mobilityAid:'none'}
  };
  let matched=0,responded=0,officialNotes=0,withAnyVerified=0,withoutCritical=0;
  const reviewIds=[];
  for(const place of places){
    const record=byId.get(place.id);
    const status=record?.fetchStatus||'missing';
    outcome[Object.hasOwn(outcome,status)?status:'error']++;
    if(['ok','empty'].includes(status))responded++;
    if(verifyIdRecord(place,record))matched++;
    if(record?.evidence?.length)officialNotes++;
    const area=place.region||'unspecified';
    region[area]??={total:0,matched:0,withOfficialNotes:0};
    region[area].total++;
    if(verifyIdRecord(place,record))region[area].matched++;
    if(record?.evidence?.length)region[area].withOfficialNotes++;
    let verified=false;
    for(const [name,key,kind] of FEATURES){
      const {status:factStatus,records}=observedStatus(record,key,kind);
      const m=details[name];
      m[factStatus]++;
      m.evidence_count+=records.length;
      if(records.some(f=>f?.status==='source_reported'||f?.evidenceState==='source_reported'))m.source_reported++;
      if(records.some(f=>f?.stale||f?.status==='stale'||f?.evidenceState==='stale'))m.stale++;
      if(['verified_yes','verified_no'].includes(factStatus))verified=true;
    }
    if(verified)withAnyVerified++;
    const critical=['stairs','slope','step_free_entrance','parking_to_entrance'];
    if(critical.some(k=>details[k]&&observedStatus(record,
      FEATURES.find(f=>f[0]===k)[1],FEATURES.find(f=>f[0]===k)[2]).status==='unknown')){
      withoutCritical++;
      if(reviewIds.length<12)reviewIds.push(place.id);
    }
    // Call the existing recommendation contract, without modifying its logic.
    const inputPlace={...place,accessFacts:record?.accessFacts||place.accessFacts||[],
      accessStatus:record?.accessStatus||place.accessStatus};
    for(const [name,profile] of Object.entries(profiles)){
      const result=classify(inputPlace,profile);
      recommendation[name][result.status]++;
    }
  }
  const total=places.length;
  for(const v of Object.values(details)){
    v.ratios=Object.fromEntries(STATUS.map(s=>[s,total?v[s]/total:null]));
    v.reported_ratio=total?v.source_reported/total:null;
  }
  return {auditMode:mode,sampleTarget,placesChecked:total,region,
    matching:{validProviderResponses:responded,matchedWithEvidence:matched,
      withQualitativeNotes:officialNotes,matchingRate:total?matched/total:null,
      verifiedFactPlaces:withAnyVerified,missingCriticalEvidence:withoutCritical},
    fetchOutcomes:outcome,attributes:details,recommendation,reviewSampleIds:reviewIds,
    caveats:['Source-reported prose is unknown for yes/no verification',
      'No parking-to-entrance length or safe route is inferred',
      'Mock, live API and physical inspection must be reported separately']};
}
module.exports={FEATURES,summarizeAccessibilityCoverage,statusFor,verifyIdRecord};
