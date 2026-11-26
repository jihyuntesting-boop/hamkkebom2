'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../web');
const source=fs.readFileSync(path.join(root,'assets/core-src/20-detail-and-replan.js'),'utf8');
const slice=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end));
const ctx={};vm.createContext(ctx);vm.runInContext(slice('function hbRichIdentity(','function hbRichMapAdapter('),ctx);
test('rich search identity and region gate protect existing plan contract',()=>{
 assert.equal(ctx.hbRichIdentity({id:'tour-126508',kind:'spot'}).contentTypeId,'12');
 assert.equal(ctx.hbRichIdentity({id:'tour-1',kind:'food',contentTypeId:'12'}),null);
 assert.equal(ctx.hbRichIdentity({id:'other-1',kind:'spot'}),null);
 assert.equal(ctx.hbRichMatchesRegion({areaCode:'39'},'서울'),false);
 assert.equal(ctx.hbRichMatchesRegion({areaCode:'1'},'서울'),true);
 assert.equal(ctx.hbRichMatchesRegion({},'서울'),false);
});
test('real index loads rich component before core; canonical bundle retains wiring',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const bundle=fs.readFileSync(path.join(root,'assets/scripts/00-app-core.js'),'utf8');
 assert.ok(html.indexOf('assets/components/rich-place-detail.js')>=0);
 assert.ok(html.indexOf('assets/components/rich-place-detail.js')<html.indexOf('assets/scripts/00-app-core.js'));
 for(const item of ['hbRichDiscoveryAttach','hbRichDetailAttach','hbRichCleanup','photoAlreadyShown:true','hbRichMatchesRegion(selectedRich,s.region)'])assert.ok(bundle.includes(item));
});
test('conflicting general field variants are not presented as definitive',()=>{
 const {buildDetailModel}=require('../web/assets/components/rich-place-detail.js');
 const model=buildDetailModel({id:'tour-1',name:'fixture',fields:{hours:{value:'9:00',state:'official_reported',additionalReports:[{value:'10:00'}]}}});
 assert.equal(model.cards.find(c=>c.key==='hours').value,'자료별 설명 확인');
 assert.ok(model.warnings.some(v=>v.includes('설명이 서로 달라')));
});
