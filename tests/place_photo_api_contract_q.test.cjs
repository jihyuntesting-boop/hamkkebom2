'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {createHandler, publishedPhoto} = require('../web/api/photo.js');
const ID = 'tour-126508';
// Agent L synthetic fixture, never published.
const image = Buffer.from('UklGRioBAABXRUJQVlA4IB4BAAAQHgCdASqQAUABPu12uFappyUjoCgBMB2JaW7hd2EbQAnsA99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snH8AA/v+UCf9Wk0i8/9JdLbVJtOBehWWnAgAAAAAAAAAAAAAAAAAA','base64');
const record = {placeId: ID, imagePath: '/images/places/'+ID+'.webp', source: 'Test fixture', credit: 'Fixture author', license: 'CC-BY-4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', originalUrl: 'https://example.org/photo', verifiedAt: '2026-11-20', verifiedBy: 'Test reviewer', placeMatchEvidence: 'Fixture only', rightsStatus: 'approved', changeNotice: 'WebP conversion only', sha256: crypto.createHash('sha256').update(image).digest('hex'), width:400,height:320};
function invoke(api,query,method='GET') {
  const result = {headers:{}};
  const res = {setHeader(k,v){result.headers[k]=v;}, status(n){result.status=n;return this;},json(v){result.body=v;return this;},end(){return this;}};
  api({method, query, headers:{host:'evil.example','x-forwarded-host':'evil.example'}},res);
  return result;
}
function withAsset(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'hb-q-'));
  const file = path.join(root,'images/places',ID+'.webp');
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,image);
  try {return fn(root,file);} finally {fs.rmSync(root,{recursive:true,force:true});}
}
test('empty manifest preserves observed legacy fields and status',()=>{
  const handler=createHandler({manifest:{photos:{}},publicOrigin:'https://photo-preview.vercel.app'});
  for(const contentId of ['0','3432213','126508','tour-126508']){
    const r=invoke(handler,{contentId});assert.equal(r.status,200);assert.equal(r.body.contentId,contentId.replace(/^tour-/,''));assert.equal(r.body.imageUrl,null);assert.equal(r.body.source,null);
  }
});
test('approved image has same deployment HTTPS URL and attribution, not caller host',()=>withAsset(root=>{
  const r=invoke(createHandler({manifest:{photos:{[ID]:record}},rootDir:root,publicOrigin:'https://photo-preview.vercel.app'}),{contentId:'126508'});
  assert.equal(r.status,200);assert.equal(r.body.imageUrl,'https://photo-preview.vercel.app/images/places/tour-126508.webp');assert.equal(r.body.contentId,'126508');assert.equal(r.body.credit,record.credit);assert.equal(r.body.licenseUrl,record.licenseUrl);assert.equal(r.body.changeNotice,record.changeNotice);
}));
test('reject invalid date, URL credentials, unapproved rights, invalid path, wrong place ID',()=>withAsset(root=>{
  for(const patch of [{verifiedAt:'2025-02-30'},{originalUrl:'https://user:pass@example.org/x'},{rightsStatus:'unknown'},{imagePath:'/images/places/tour-1.webp'},{placeId:'tour-1'},{changeNotice:''},{license:'CC-BY-NC-4.0'},{sha256:'0'.repeat(64)}]) assert.equal(publishedPhoto({...record,...patch},ID,root),null);
}));
test('missing, damaged, or mismatched bytes fail closed',()=>withAsset((root,file)=>{
  const handler=createHandler({manifest:{photos:{[ID]:record}},rootDir:root,publicOrigin:'https://photo-preview.vercel.app'});
  fs.writeFileSync(file,Buffer.from('not webp'));assert.equal(invoke(handler,{placeId:ID}).body.imageUrl,null);fs.unlinkSync(file);assert.equal(invoke(handler,{placeId:ID},'HEAD').status,404);
}));
test('invalid IDs and methods rejected; HEAD missing 404',()=>{
  const h=createHandler({manifest:{photos:{}}});assert.equal(invoke(h,{contentId:'../../1'}).status,400);assert.equal(invoke(h,{contentId:['1','2']}).status,400);assert.equal(invoke(h,{contentId:'0'},'POST').status,405);assert.equal(invoke(h,{contentId:'0'},'HEAD').status,404);
});
