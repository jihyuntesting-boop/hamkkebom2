'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseBackup,moveShare,writeBackup,OLD,NEW,KEY}=require('../web/assets/migration/legacy-migration.js');
const fixture=()=>({region:'서울',date:'2026-11-26',walk:'15',stairs:'avoid',chosen:['tour-126508'],hbWalkConfirmed:true,hbStairsChoice:'impossible',hbTransport:'car',hbParty:'2',momNeeds:['toilet'],stops:[{id:'tour-126508',placeId:'tour-126508',kind:'spot',name:'경복궁',address:'서울특별시 종로구 사직로 161',time:'10:00',plannedArrival:'10:00',stayMinutes:60,restMinutes:0,transitionBufferMinutes:0,travelTimeStatus:'not_applicable',isRestCandidate:false,isPlaceholder:false,position:1,done:true,must:true,reserved:true,booked:true}],hbPlanInfo:{start:'10:00',end:'11:00',sightCount:1,foodSelected:false,date:'2026-11-26'},hbReplanUndo:{before:[],after:'[]'}});
const raw=o=>JSON.stringify(o);
const link=o=>OLD+'/#/share/'+Buffer.from(raw(o)).toString('base64url');
function store(init=null){let v=init;return {getItem:k=>{assert.equal(k,KEY);return v},setItem:(k,n)=>{assert.equal(k,KEY);v=n}}}
test('legacy itinerary and protected flags preserved; undo only in original backup',()=>{
 const o=fixture(),parsed=parseBackup(raw(o));
 assert.deepEqual(parsed.state.stops,o.stops);
 assert.equal(parsed.protectedCount,1);
 assert.equal(parsed.state.hbPlanInfo.region,'서울');
 assert.equal(parsed.state.hbStairsChoice,'impossible');
 assert.equal(parsed.undoArchived,true);
 assert.equal(Object.hasOwn(parsed.state,'hbReplanUndo'),false);
});
test('unknown, malformed, unsafe, oversized and prototype fields rejected without repair',()=>{
 for(const bad of [null,[],{...fixture(),date:'2026-02-30'},{...fixture(),token:'secret'},
 {...fixture(),stops:[{...fixture().stops[0],name:'<img src=x>'}]},
 {...fixture(),stops:[{...fixture().stops[0],done:'false'}]},
 {...fixture(),stops:[{...fixture().stops[0],unexpected:'unknown'}]}])
  assert.throws(()=>parseBackup(raw(bad)));
 assert.throws(()=>parseBackup('{"__proto__":{},"region":"서울","date":"2026-11-26","chosen":[],"stops":[]}'));
 assert.throws(()=>parseBackup('x'.repeat(262145)));
});
test('owner import cannot silently overwrite or race stale preview',()=>{
 const p=parseBackup(raw(fixture())),s=store();
 writeBackup(s,p,null);
 assert.deepEqual(JSON.parse(s.getItem(KEY)),p.state);
 const original=s.getItem(KEY);
 assert.throws(()=>writeBackup(s,p,original));
 assert.throws(()=>writeBackup(s,p,null,{replace:true}));
 assert.equal(s.getItem(KEY),original);
 writeBackup(s,p,original,{replace:true});
 assert.equal(s.getItem(KEY),original);
});
test('legacy v1 share converts Unicode and uses public whitelist only',()=>{
 const o={v:1,region:'서울',date:'2026-11-26',stops:[{time:'10:00',name:'경복궁'}]};
 const migrated=moveShare(link(o));assert.ok(migrated.startsWith(NEW+'/#/share/'));
 const decoded=JSON.parse(Buffer.from(migrated.split('/share/')[1],'base64url').toString());
 assert.deepEqual(decoded,o);
 for(const bad of [link({...o,walk:'5'}),link({...o,stops:[{...o.stops[0],reserved:true}]}),link({...o,stops:[]}),link({...o,v:2}),link(o).replace(OLD,'https://evil.example'),link(o).replace('/#','/?x=y#')])assert.throws(()=>moveShare(bad));
});
