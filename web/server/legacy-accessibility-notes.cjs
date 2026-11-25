'use strict';
// DATA-01 / ARCH-01: local historical facility observations only. No network.
// A 90-day display window is a conservative migration policy, not a source freshness guarantee.
const SNAPSHOT=require('../catalog/legacy-accessibility-observed.v1.json');
const SOURCE_URL="https://www.data.go.kr/data/15101897/openapi.do";
const MAX_AGE_MS=90*86400000;
function createLegacyNotesOverlay(records){
  const byId=new Map();
  for(const row of records){
    if(byId.has(row.id))throw new Error('duplicate_legacy_note_id');
    byId.set(row.id,row);
  }
  return function attachLegacyAccessNotes(place,now=Date.now()){
    if(!place||!/^tour-\d{1,12}$/.test(place.id)||String(place.contentId)!==place.id.slice(5))return place;
    const row=byId.get(place.id);
    if(!row||row.archiveOnly||row.contentId!==String(place.contentId)||
       row.name!==place.name||row.address!==place.address||row.region!==place.region||row.kind!==place.kind||
       !Array.isArray(place.accessFacts)||place.accessFacts.length||
       !['unverified','unknown'].includes(place.accessStatus))return place;
    const observed=Date.parse(row.observedAt);
    if(!Number.isFinite(now)||!Number.isFinite(observed)||observed>now||now-observed>MAX_AGE_MS)return place;
    const facts=row.facts.map(f=>({
      label:f.label,description:f.description,status:'source_reported',
      source:'기존 함께봄 공개 API 관측 기록 (원천 재조회 미실시)',
      sourceType:'legacy_public_api',sourceUrl:SOURCE_URL,sourceId:row.contentId,placeId:row.id,
      collectedAt:row.observedAt,sourceUpdatedAt:null,verifiedAt:null,historical:true
    }));
    return {...place,accessStatus:'info',accessFacts:facts};
  };
}
const attachLegacyAccessNotes=createLegacyNotesOverlay(SNAPSHOT.records);
module.exports={attachLegacyAccessNotes,createLegacyNotesOverlay,MAX_AGE_MS};
