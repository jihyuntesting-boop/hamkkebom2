'use strict';
/**
 * 일정 설명 RAG(검색 증강) — 검색 단계.
 *
 * 지식 원천: web/catalog/place-details.v1.json + daechi-area-details.v1.json
 * (공식 페이지에서 옮긴 사실, 항목마다 sourceUrl·sourceName·checkedAt). 두 카탈로그의
 * 검증·병합은 curated-place-details.cjs 를 그대로 재사용한다.
 * 검색 방식: 일정 장소의 placeId(tour-<contentId>) 일치, 없으면 정규화한 이름 일치.
 * 벡터 DB·임베딩은 쓰지 않는다. 값과 출처 URL이 있는 항목만 짧은 사실로 돌려준다.
 */
const curated=require('./curated-place-details.cjs');
const daechi=require('../catalog/daechi-area-details.v1.json');
const placeDetails=require('../catalog/place-details.v1.json');

const MAX_PER_PLACE=4;
const MAX_TOTAL=20;
const VALUE_CHARS=120;
const TYPE_IDS=['12','14','39'];
// 가족 일정 설명에 쓸 항목만, 이 순서로. 소개문·전화·웹사이트는 넣지 않는다.
const FIELD_LABELS=Object.freeze({
  hours:'운영시간',closed:'휴무',admission:'입장료',seniorDiscount:'경로 할인',
  parking:'주차',parkingFee:'주차 요금',restroom:'화장실',amenities:'편의시설',rest:'쉼터'
});
const ACCESS_LABELS=Object.freeze({
  accessibleParking:'장애인 주차',accessibleToilet:'장애인 화장실',elevator:'엘리베이터',ramp:'경사로',
  wheelchairRental:'휠체어 대여',strollerRental:'유모차 대여',wheelchairAccess:'휠체어 이용'
});

function normalizeName(value){
  return String(value||'').normalize('NFC').toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g,'').replace(/[^\p{L}\p{N}]/gu,'');
}
function httpsUrl(value){
  try{const u=new URL(value);return u.protocol==='https:'}catch{return false}
}
function shortValue(value){
  const t=String(value||'').replace(/\s+/g,' ').trim();
  return t.length>VALUE_CHARS?t.slice(0,VALUE_CHARS-1)+'…':t;
}

function buildIndex(artifacts=[daechi,placeDetails]){
  const lookup=curated.createCuratedDetails(artifacts);
  const byName=new Map();
  for(const data of artifacts){
    if(!curated.validateArtifact(data).ok)continue;
    for(const r of data.records){
      const key=normalizeName(r.name);
      if(key&&!byName.has(key))byName.set(key,{id:r.id,type:r.contentTypeId});
    }
  }
  const byId=id=>{
    const m=/^tour-(\d{1,12})$/.exec(String(id||''));
    if(!m)return null;
    for(const type of TYPE_IDS){const d=lookup(m[1],type);if(d)return d;}
    return null;
  };
  return {
    find(stop){
      if(!stop||typeof stop!=='object')return null;
      const hit=byId(stop.placeId);
      if(hit)return hit;
      const named=byName.get(normalizeName(stop.name));
      return named?lookup(named.id.slice(5),named.type):null;
    }
  };
}
const defaultIndex=buildIndex();

/** 일정 장소 목록 → [{placeName, field, value, sourceTitle, sourceUrl}] (장소당 4개, 전체 20개 이하). */
function retrieveFacts(stops,{index=defaultIndex}={}){
  const out=[],seen=new Set();
  for(const stop of Array.isArray(stops)?stops:[]){
    if(out.length>=MAX_TOTAL)break;
    const detail=index.find(stop);
    if(!detail||seen.has(detail.id))continue;
    seen.add(detail.id);
    const candidates=[];
    for(const [key,label] of Object.entries(FIELD_LABELS)){
      const f=detail.fields&&detail.fields[key];
      if(f&&f.value&&httpsUrl(f.sourceUrl))candidates.push({field:label,value:f.value,sourceTitle:f.sourceName,sourceUrl:f.sourceUrl});
    }
    for(const [key,label] of Object.entries(ACCESS_LABELS)){
      const ev=detail.accessibility&&detail.accessibility.attributes&&detail.accessibility.attributes[key]&&detail.accessibility.attributes[key].evidence[0];
      if(ev&&ev.description&&httpsUrl(ev.sourceUrl))candidates.push({field:label,value:ev.description,sourceTitle:ev.sourceName,sourceUrl:ev.sourceUrl});
    }
    for(const c of candidates.slice(0,Math.min(MAX_PER_PLACE,MAX_TOTAL-out.length))){
      out.push({placeName:detail.name,field:c.field,value:shortValue(c.value),sourceTitle:String(c.sourceTitle||'').trim()||'공식 자료',sourceUrl:c.sourceUrl});
    }
  }
  return out;
}

module.exports={retrieveFacts,buildIndex,normalizeName,MAX_PER_PLACE,MAX_TOTAL};
