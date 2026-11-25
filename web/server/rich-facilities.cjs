'use strict';
const {loadIndex,query}=require('./public-toilets.cjs');
// Only the existing, rights-reviewed coordinate index is consulted. A nearby
// facility does not become part of a tourist site, or a verified walking stop.
function nearbyPublicFacilities(place,{loader=loadIndex,search=query}={}){
 const empty=(status)=>({status,scope:'nearby_only',coverage:'unknown',items:[]});
 if(!Number.isFinite(place?.lat)||!Number.isFinite(place?.lng)||place.lat<33||place.lat>39||place.lng<124||place.lng>132)return empty('missing_place_coordinates');
 let result;
 try{result=search(loader(),{lat:String(place.lat),lng:String(place.lng),radius:'1000',limit:'12'});}catch{return empty('unavailable');}
 if(result?.status!=='ok')return empty('unavailable');
 const items=[];
 const seen=new Set();
 for(const row of result.items||[]){
  if(typeof row.id!=='string'||!row.id||seen.has(row.id)||!Number.isFinite(row.lat)||!Number.isFinite(row.lng)||
     row.lat<33||row.lat>39||row.lng<124||row.lng>132||!row.coordinateEvidence?.verifiedAt||!row.coordinateEvidence?.sourceUrl||
     !Number.isFinite(row.distanceMeters)||row.distanceMeters<0||row.distanceMeters>1000)continue;
  seen.add(row.id);
  items.push({id:'public-toilet:'+row.id,providerId:row.id,kind:'public_toilet',name:row.name,address:row.address,
   lat:row.lat,lng:row.lng,relationship:'nearby_unaffiliated',sourceUrl:row.sourceUrl,coordinateEvidence:row.coordinateEvidence,
   coordinatePrecision:row.coordinatePrecision||'verified_source_location',openingHours:row.openingHours,
   openingStatus:row.openingStatus,accessibleStalls:row.accessibleStalls,accessibleFacilityReport:row.accessibleFacilityReport||null,
   distanceFromPlaceCenterM:row.distanceMeters,distanceType:'straight_line',routeStatus:'unknown'});
 }
 return {status:items.length?'ok':'empty',scope:'nearby_only',coverage:result.coverage,coverageDetail:result.coverageDetail||null,
  radiusM:1000,items,nextOffset:result.nextOffset??null,routeVerified:false};
}
module.exports={nearbyPublicFacilities};
