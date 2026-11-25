'use strict';

/** DATA-01: evidence normalization, not a step-free route or safety certification.
 *
 * Legacy API accessFacts (label/description), editor-reviewed guides (topic,
 * status: source_reported) and structured facts must all fail closed when an
 * attribute, site scope, field verification date or provenance is missing.
 * This module does not call external services, modify the raw catalog, or
 * derive accessibility from images, names, prose or geographic proximity.
 */

const ATTRIBUTES = Object.freeze({
  stairs: 'stairs', stair: 'stairs', stairs_required: 'stairs', '계단': 'stairs',
  slope: 'slope', gradient: 'slope', slope_level: 'slope', '경사': 'slope', '경사로': 'slope',
  entrance: 'entrance', entrance_step_free: 'entrance', entry: 'entrance',
  '출입구': 'entrance', '출입통로': 'entrance', '입구': 'entrance',
  parking: 'parking', disabled_parking: 'parking', '주차': 'parking', '장애인주차': 'parking',
  dropoff: 'dropoff', '하차': 'dropoff', '승하차': 'dropoff',
  toilet: 'toilet', restroom: 'toilet', '화장실': 'toilet', '장애인화장실': 'toilet',
  rest: 'rest', rest_area: 'rest', '휴식': 'rest', '휴게': 'rest', '쉼터': 'rest',
  elevator: 'elevator', '엘리베이터': 'elevator', '승강기': 'elevator',
});
const STATES = new Set(['verified_yes', 'verified_no', 'unknown', 'conflicting']);
const GRADES = new Set(['field_verified', 'official_reported', 'unknown']);
const MAX_FACTS = 500;
const SLOPE_UNITS = new Set(['degrees', 'percent']);
const FIELD_SOURCES = new Set(['field_inspection', 'on_site_audit', 'site_survey']);
const ATTR_KEYS = Object.freeze(['stairs','slope','entrance','parking','dropoff','toilet','rest']);

const text = (value, limit = 500) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, limit) : null;
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/** Validates a civil day before Date.parse can normalize impossible dates. */
function isoDate(value, now = new Date()) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2}))?$/.exec(value);
  if (!match) return null;
  const [, y, m, d, hh, mm, ss, , tz] = match;
  const year = +y, month = +m, day = +d;
  const civil = new Date(Date.UTC(year, month - 1, day));
  if (civil.getUTCFullYear() !== year || civil.getUTCMonth() !== month - 1 || civil.getUTCDate() !== day) return null;
  if (hh !== undefined && (+hh > 23 || +mm > 59 || +ss > 59)) return null;
  if (tz && tz !== 'Z') {
    const parts = tz.slice(1).split(':').map(Number);
    if (parts[0] > 14 || parts[1] > 59 || (parts[0] === 14 && parts[1] !== 0)) return null;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || !Number.isFinite(now?.getTime?.())) return null;
  // A date-only value denotes the reported civil date; allow the end of that day.
  const timestamp = hh === undefined ? parsed + 86400000 : parsed;
  if (timestamp > now.getTime() + 86400000) return null;
  return value;
}

function sourceUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.hostname && !parsed.username && !parsed.password ? parsed.href : null;
  } catch { return null; }
}

function attributeOf(fact) {
  for (const candidate of [fact.attribute, fact.topic, fact.label]) {
    const key = text(candidate, 90);
    if (!key) continue;
    const attribute = ATTRIBUTES[key.toLowerCase()];
    if (attribute) return attribute;
  }
  return null;
}

/** Explicit values only: descriptions are evidence text, never inferred booleans. */
function typedValue(fact, attribute) {
  if (own(fact, 'value')) {
    const value=fact.value;
    if(value===null)return null;
    if(typeof value==='boolean')return value;
    if(Number.isFinite(value)&&value>=0&&(attribute!=='slope'||SLOPE_UNITS.has(fact.unit)))return value;
    if(typeof value==='string')return text(value,1200);
    return null;
  }
  return text(fact.description,1200);
}

function normalizeFact(fact,options={}) {
  if(!fact||typeof fact!=='object'||Array.isArray(fact))return null;
  const attribute=attributeOf(fact);
  if(!attribute)return null;
  const now=options.now instanceof Date?options.now:new Date();
  const value=typedValue(fact,attribute);
  const scope=text(fact.scope,300);
  const url=sourceUrl(fact.sourceUrl??fact.source_url);
  const collectedAt=isoDate(fact.collectedAt??fact.collected_at,now);
  const verifiedAt=isoDate(fact.verifiedAt??fact.verified_at,now);
  const sourceType=text(fact.sourceType??fact.source_type,80)||
    (fact.status==='source_reported'?'operator_document_review':'unknown');
  const sourceName=text(fact.source??fact.sourceName,160);
  const reviewer=text(fact.reviewer,160);
  const gradeRaw=fact.evidenceGrade??fact.evidence_grade;
  const grade=GRADES.has(gradeRaw)?gradeRaw:'unknown';
  const ageLimit=Number.isFinite(options.maxAgeDays)&&options.maxAgeDays>=0?options.maxAgeDays:null;
  const referenceTime=verifiedAt||collectedAt;
  const tooOld=ageLimit!==null&&referenceTime!==null&&
    now.getTime()-Date.parse(referenceTime)>ageLimit*86400000;
  const stale=fact.stale===true||fact.status==='stale'||fact.accessStatus==='stale'||tooOld;
  const isReported=fact.status==='source_reported'||grade==='official_reported';
  const explicit=fact.status,assertedBoolean=typeof fact.value==='boolean';
  const fieldVerified=grade==='field_verified'&&!!scope&&!!verifiedAt&&
    FIELD_SOURCES.has(sourceType)&&Boolean(url||reviewer)&&!stale&&
    (attribute==='slope'?
      (assertedBoolean||(typeof fact.value==='number'&&Number.isFinite(fact.value)&&fact.value>=0&&SLOPE_UNITS.has(fact.unit))):
      (assertedBoolean||(['parking','dropoff','toilet','rest','elevator'].includes(attribute)&&
       Number.isInteger(fact.value)&&fact.value>=0)));
  let status='unknown';
  if(explicit==='conflicting')status='conflicting';
  else if((STATES.has(explicit)||explicit==='verified')&&explicit!=='unknown'&&fieldVerified){
    if(explicit==='verified')status=fact.value===false||fact.value===0?'verified_no':'verified_yes';
    if(explicit==='verified_yes'&&(fact.value===true||(typeof fact.value==='number'&&
      (attribute==='slope'?fact.value>=0:fact.value>0))))status=explicit;
    if(explicit==='verified_no'&&(fact.value===false||fact.value===0))status=explicit;
  }
  const evidenceGrade=fieldVerified&&(status.startsWith('verified_')||status==='conflicting')?
    'field_verified':isReported&&url?'official_reported':'unknown';
  const evidenceState=status==='conflicting'?'conflicting':stale?'stale':
    status.startsWith('verified_')?'verified':isReported?'source_reported':'unknown';
  return {attribute,value:value??null,status,evidenceState,evidenceGrade,
    sourceUrl:url,sourceType,collectedAt,verifiedAt,scope,stale,sourceName,reviewer,
    sourceState:evidenceState==='verified'?'field_verified':evidenceState,
    description:text(fact.description,1200),label:text(fact.label,160),
    unit:attribute==='slope'&&SLOPE_UNITS.has(fact.unit)?fact.unit:null};
}

function rawFacts(place){
  if(!place||typeof place!=='object'||Array.isArray(place))return [];
  // Ignore image, photograph, nearby distance and place-name fields.
  const records=[place.accessibility,place.accessFacts,place.facts].filter(Array.isArray).flat();
  for(let i=0;i<records.length;i++){
    const fact=records[i];
    if(place.accessStatus==='info'&&fact&&typeof fact==='object'&&!Array.isArray(fact)&&
       !own(fact,'status')&&!own(fact,'evidenceGrade'))
      records[i]={...fact,status:'source_reported',sourceType:'legacy_public_api'};
  }
  const mobility=place.mobilityAssessment;
  if(mobility&&typeof mobility==='object'&&!Array.isArray(mobility)&&
     typeof mobility.stairsRequired==='boolean')
    records.push({attribute:'stairs',value:mobility.stairsRequired,
      status:mobility.status==='verified'?(mobility.stairsRequired?'verified_yes':'verified_no'):'unknown',
      evidenceGrade:mobility.evidenceGrade||(mobility.status==='verified'?'field_verified':'unknown'),
      sourceType:mobility.sourceType||'unknown',sourceUrl:mobility.sourceUrl,
      reviewer:mobility.reviewer,collectedAt:mobility.collectedAt,verifiedAt:mobility.verifiedAt,
      scope:mobility.scope,stale:mobility.status==='stale',description:mobility.description});
  return place.accessStatus==='stale'?records.map(fact=>fact&&typeof fact==='object'&&!Array.isArray(fact)?
    {...fact,stale:true}:fact):records;
}

function fingerprint(fact) {
  return JSON.stringify([fact.attribute, fact.value, fact.status, fact.evidenceGrade,
    fact.sourceUrl, fact.sourceType, fact.collectedAt, fact.verifiedAt,
    fact.scope, fact.stale, fact.sourceName, fact.reviewer, fact.unit,
    fact.description, fact.label]);
}

function normalizeFacts(facts, options = {}) {
  if (facts.length > MAX_FACTS) throw new RangeError('too_many_evidence_facts');
  const unique = new Map();
  for (const raw of facts) {
    const fact = normalizeFact(raw, options);
    if (fact) unique.set(fingerprint(fact), fact);
  }
  const entries = [...unique.values()];
  // Only explicit facts about the SAME named segment can contradict each other.
  // Unknown prose cannot be parsed safely as a fact, and different entrances
  // cannot automatically be treated as a source disagreement.
  const byScope = new Map();
  for (const fact of entries) {
    if (!fact.scope || fact.stale ||
        !(typeof fact.value === 'boolean' ||
          (fact.attribute === 'slope' && typeof fact.value === 'number' &&
           Number.isFinite(fact.value) && SLOPE_UNITS.has(fact.unit))) ||
        !['field_verified', 'official_reported'].includes(fact.evidenceGrade) ||
        (fact.evidenceGrade === 'official_reported' && !fact.collectedAt)) continue;
    // Numeric slopes must use the SAME measurement unit before comparison.
    const key = JSON.stringify([fact.attribute, fact.scope,
      fact.attribute === 'slope' && typeof fact.value === 'number' ? fact.unit : 'boolean']);
    if (!byScope.has(key)) byScope.set(key, []);
    byScope.get(key).push(fact);
  }
  for (const group of byScope.values()) {
    if (new Set(group.map(f => typeof f.value + ':' + String(f.value))).size > 1) {
      for(const fact of group){
        fact.status='conflicting';fact.sourceState='conflicting';fact.evidenceState='conflicting';
      }
    }
  }
  return entries;
}

function summarize(facts,placeStates=[]){
  const statuses={verified_yes:0,verified_no:0,unknown:0,conflicting:0};
  const states={verified:0,source_reported:0,unknown:0,conflicting:0,stale:0};
  const sourceStates={field_verified:0,source_reported:0,unknown:0,conflicting:0,stale:0};
  const byAttribute=Object.fromEntries(ATTR_KEYS.map(key=>[key,'unknown']));
  for(const fact of facts){statuses[fact.status]++;states[fact.evidenceState]++;sourceStates[fact.sourceState]++;}
  const placeStatuses=[...new Set(placeStates.filter(state=>['stale','conflicting'].includes(state)))];
  for(const attribute of ATTR_KEYS){
    const matching=facts.filter(fact=>fact.attribute===attribute).map(fact=>fact.evidenceState);
    if(matching.includes('conflicting'))byAttribute[attribute]='conflicting';
    else if(matching.includes('stale'))byAttribute[attribute]='stale';
    else if(matching.includes('unknown'))byAttribute[attribute]='unknown';
    else if(matching.includes('source_reported'))byAttribute[attribute]='source_reported';
    else if(matching.includes('verified'))byAttribute[attribute]='verified';
  }
  // Independent facts about parking, entrance and facilities NEVER certify
  // the entire connecting walking route, even when each fact is inspected.
  // Route clearance requires a separate end-to-end mobility assessment.
  return {statuses,states,sourceStates,byAttribute,placeStatuses,
    routeStatus:'unknown',reviewRequired:true};
}

function coordinatesOf(place){
  const pos=place&&typeof place.coordinates==='object'&&place.coordinates!==null?
    place.coordinates:place;
  const result={status:'missing'};
  if(!pos||typeof pos!=='object')return result;
  const lat=own(pos,'lat'),lng=own(pos,'lng');
  if(lat)result.lat=pos.lat;
  if(lng)result.lng=pos.lng;
  if(!lat&&!lng)return result;
  if(!lat||!lng)result.status='partial';
  else if(pos.lat===null&&pos.lng===null)result.status='null';
  else if(typeof pos.lat==='number'&&Number.isFinite(pos.lat)&&pos.lat>=-90&&pos.lat<=90&&
          typeof pos.lng==='number'&&Number.isFinite(pos.lng)&&pos.lng>=-180&&pos.lng<=180)
    result.status='provided';
  else result.status='invalid';
  return result;
}

function normalizePlaceEvidence(place,options={}){
  const facts=normalizeFacts(rawFacts(place),options);
  return {placeId:text(place?.id,80),accessibility:facts,coordinates:coordinatesOf(place),
    evidenceSummary:summarize(facts,[place?.accessStatus])};
}

function identity(place) {
  if (!place || typeof place !== 'object' || Array.isArray(place)) return null;
  const providedId=text(place.providerPlaceId,80)||
    (typeof place.contentId==='number'&&Number.isSafeInteger(place.contentId)&&place.contentId>=0?
      String(place.contentId):text(place.contentId,80));
  const publicId = text(place.id, 80);
  const idMatch = /^tour-(\d{1,16})$/.exec(publicId || '');
  if (idMatch && providedId && idMatch[1] !== providedId) return null;
  const provider=text(place.provider,100)?.toLowerCase()||(idMatch?'tourapi':null);
  if(idMatch&&provider!=='tourapi')return null;
  const providerPlaceId = providedId || idMatch?.[1] || null;
  if (!provider || !providerPlaceId || !/^[a-z0-9_-]{1,80}$/i.test(providerPlaceId)) return null;
  return {provider, providerPlaceId, id: publicId};
}

/** Merge by provider + providerPlaceId; name/coordinates/photo never merge records. */
function mergePlaceEvidence(records,options={}){
  if(!Array.isArray(records))throw new TypeError('records must be an array');
  const groups=new Map(),rejected=[];
  for(const place of records){
    const info=identity(place);
    if(!info){rejected.push({id:text(place?.id,80),reason:'unresolved_or_mismatched_source_identity'});continue;}
    const key=JSON.stringify([info.provider,info.providerPlaceId]);
    if(!groups.has(key))groups.set(key,{id:info.id,provider:info.provider,providerPlaceId:info.providerPlaceId,
      raw:[],placeStates:[],coordinates:{status:'missing'}});
    const group=groups.get(key);
    group.raw.push(...rawFacts(place));
    group.placeStates.push(place.accessStatus);
    const coordinates=coordinatesOf(place);
    if(coordinates.status==='provided'){
      if(group.coordinates.status==='provided'&&
          (group.coordinates.lat!==coordinates.lat||group.coordinates.lng!==coordinates.lng))
        group.coordinates={status:'conflicting'};
      else if(group.coordinates.status!=='conflicting')group.coordinates=coordinates;
    }else if(group.coordinates.status==='missing')group.coordinates=coordinates;
  }
  const places=[...groups.values()].map(({raw,placeStates,...item})=>{
    const accessibility=normalizeFacts(raw,options);
    return {...item,accessibility,evidenceSummary:summarize(accessibility,placeStates)};
  });
  return {places,rejected};
}

module.exports = {normalizeFact, normalizePlaceEvidence, mergePlaceEvidence, isoDate};
