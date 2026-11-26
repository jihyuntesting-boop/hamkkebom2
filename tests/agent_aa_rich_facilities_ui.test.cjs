'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {nearbyPublicFacilities}=require('../web/server/rich-facilities.cjs');
const {buildDetailModel}=require('../web/assets/components/rich-place-detail.js');
test('existing coordinate-reviewed municipal pilot is nearby only, not tourist-owned',()=>{
 const data=nearbyPublicFacilities({lat:37.47021904,lng:126.89704375});
 assert.equal(data.status,'ok');
 assert.ok(data.items.length);
 for(const f of data.items){assert.equal(f.relationship,'nearby_unaffiliated');assert.equal(f.distanceType,'straight_line');assert.equal(f.routeStatus,'unknown');assert.ok(f.coordinateEvidence.verifiedAt);}
 assert.equal(nearbyPublicFacilities({lat:null,lng:null}).status,'missing_place_coordinates');
});
test('detail view model omits missing rows and filters invalid facility coordinates',()=>{
 const model=buildDetailModel({id:'tour-1',name:'fixture',fields:{hours:{value:'09:00',state:'official_reported'}},accessStatus:'conflicting',
 facilities:[{id:'bad',kind:'entrance',lat:null,lng:127},{id:'ok',kind:'public_toilet',lat:37.5,lng:127,coordinateEvidence:{sourceUrl:'https://example.invalid',verifiedAt:'2026-11-25'}}]},
 {placeId:'tour-2',imagePath:'/images/places/tour-2.webp',credit:'test',license:'test',verifiedAt:'2026-11-25'});
 assert.equal(model.points.length,1);assert.equal(model.photo,null);assert.match(model.warnings[0],/서로 달라/);
 assert.equal(model.cards.find(c=>c.key==='walking'),undefined,'no row for a missing value');assert.equal(model.cards.find(c=>c.key==='hours').value,'09:00');
});
