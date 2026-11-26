"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../web/assets/core-src/20-detail-and-replan.js"), "utf8");
const engine = fs.readFileSync(path.join(__dirname, '../web/assets/core-src/30-itinerary-engine-and-ui.js'), 'utf8');
const coordinateHelper = engine.slice(0, engine.indexOf('function hbCreateSchedule'));
assert.match(coordinateHelper, /function hbMapCoordinates/);
const itinerary = [
 {id:"finished",name:"완료",completed:true,kind:"spot",time:"09:00"},
 {id:"mandatory",name:"필수",mustVisit:true,kind:"spot",time:"10:00"},
 {id:"optional-1",name:"선택1",kind:"spot",time:"11:00"},
 {id:"booking",name:"예약",reserved:true,kind:"spot",time:"12:00"},
 {id:"food",name:"점심",kind:"food",time:"13:00"},
 {id:"optional-2",name:"선택2",kind:"spot",time:"14:00"},
];
function setup(stops=itinerary){
 const context=vm.createContext({
  s:{region:"서울",date:"2026-11-24",stops:structuredClone(stops)},
  KEY:"trip",saved:null,shouldFail:false,URL,
 });
 vm.runInContext("const save=()=>{if(shouldFail)throw Error('disk');saved=JSON.stringify(s)}; const localStorage={getItem:()=>saved};",context);
 vm.runInContext(coordinateHelper + source,context,{filename:"20-detail-and-replan.js"});
 return context;
}
const ids=items=>Array.from(items,stop=>stop.id);
const swap={place:{id:"verified-rest",name:"검증 근거가 있는 휴식지",kind:"rest"},point:{lat:37.5,lng:127},rest:true};

test("3 condition levels are previews and never mutate the original",()=>{
 const c=setup(),original=JSON.stringify(c.s);
 for(const [level,expected] of [["low",[]],["mid",["optional-2"]],["high",["optional-1","optional-2"]]]){
  const proposal=c.hbProposal(level,c.s.stops,[]);
  assert.deepEqual(ids(proposal.removed),expected);
  assert.deepEqual(ids(c.hbReplanResult(c.s.stops,proposal)),ids(proposal.kept));
 }
 assert.equal(JSON.stringify(c.s),original);
});
test("canonical and legacy completed, must and reserved fields protect time and order",()=>{
 const c=setup(),before=c.s.stops,proposal=c.hbProposal("high",before,[]);
 assert.deepEqual(ids(proposal.protected),["finished","mandatory","booking"]);
 const after=c.hbReplanResult(before,proposal,swap);
 assert.equal(c.hbReplanPreservesProtected(before,after),true);
 assert.equal(after.find(x=>x.id==="booking").time,"12:00");
 assert.equal(c.hbProtected({done:true}),true);
 assert.equal(c.hbProtected({must:true}),true);
 assert.equal(c.hbProtected({booked:true}),true);
 assert.equal(c.hbProtected({completed:true}),true);
 assert.equal(c.hbProtected({mustVisit:true}),true);
 const altered=after.map(x=>x.id==="booking"?{...x,time:"15:00"}:x);
 assert.equal(c.hbReplanPreservesProtected(before,altered),false);
});
test("empty itinerary, final stop and journey end",()=>{
 const c=setup([]);
 assert.equal(c.hbNextStop([]),-1);
 assert.deepEqual(ids(c.hbProposal("high",[],[]).removed),[]);
 assert.equal(c.hbNextStop([{id:"last"}]),0);
 assert.equal(c.hbNextStop([{id:"last",completed:true}]),-1);
 assert.equal(c.hbNextStop([{id:"last",done:true}]),-1);
 assert.throws(()=>c.hbProposal("high",[null],[]),/invalid/);
});
test("no grounded rest alternative does not invent a location",()=>{
 const c=setup();
 assert.deepEqual(Array.from(c.hbReplanAlternatives("mid",c.s.stops,[])),[]);
 assert.deepEqual(Array.from(c.hbReplanAlternatives("high",c.s.stops,[{id:"fake",name:"쉼터"}])),[]);
 c.s.stops[0].coordinates={lat:37.5,lng:127};
 assert.deepEqual(Array.from(c.hbReplanAlternatives("high",c.s.stops,[{id:"fake",name:"쉼터"}])),[]);
});
test("map overlay represents the same proposed visits and labels exclusions",()=>{
 const c=setup(),before=c.s.stops,proposal=c.hbProposal("high",before,[]);
 const result=c.hbReplanResult(before,proposal,swap);
 const map=c.hbReplanMapStops(before,proposal,result,swap);
 assert.deepEqual(ids(map.slice(0,result.length)),ids(result));
 assert.deepEqual(ids(map.slice(result.length)),ids(proposal.removed));
 assert.ok(map.slice(result.length).every(x=>x.mapLabel==="제외"));
 assert.ok(map.find(x=>x.id==="verified-rest").mapLabel.includes("휴식 후보"));
});
test("apply requires explicit invocation and local undo restores exact original",()=>{
 const c=setup(),before=JSON.stringify(c.s.stops),sig=c.hbTripSignature(c.s);
 const proposal=c.hbProposal("high",c.s.stops,[]);
 assert.equal(JSON.stringify(c.s.stops),before);
 const applied=c.hbApplyReplan(sig,c.s.stops,proposal,swap);
 assert.equal(applied.ok,true);
 assert.ok(c.s.hbReplanUndo);
 assert.notEqual(JSON.stringify(c.s.stops),before);
 assert.equal(c.hbUndoReplan().ok,true);
 assert.equal(JSON.stringify(c.s.stops),before);
 assert.equal(c.s.hbReplanUndo,null);
});
test("stale tabs, invalid undo and failed writes never approve changes",()=>{
 const c=setup(),before=JSON.stringify(c.s.stops),sig=c.hbTripSignature(c.s);
 const proposal=c.hbProposal("high",c.s.stops,[]);
 c.saved=JSON.stringify({...c.s,stops:[]});
 assert.equal(c.hbApplyReplan(sig,c.s.stops,proposal).ok,false);
 assert.equal(JSON.stringify(c.s.stops),before);
 c.saved=null;c.shouldFail=true;
 assert.equal(c.hbApplyReplan(sig,c.s.stops,proposal).ok,false);
 assert.equal(JSON.stringify(c.s.stops),before);
 c.shouldFail=false;
 assert.equal(c.hbApplyReplan(sig,c.s.stops,proposal).ok,true);
 c.s.hbReplanUndo.before=[null];
 assert.equal(c.hbUndoReplan().ok,false);
});
test("restored local draft can be undone and protected changes invalidate restoration",()=>{
 const c=setup(),sig=c.hbTripSignature(c.s),p=c.hbProposal("mid",c.s.stops,[]);
 assert.equal(c.hbApplyReplan(sig,c.s.stops,p).ok,true);
 const persisted=JSON.parse(c.saved),fresh=setup(persisted.stops);
 fresh.s=persisted;fresh.saved=JSON.stringify(persisted);
 assert.equal(fresh.hbUndoReplan().ok,true);
 assert.deepEqual(ids(fresh.s.stops),ids(itinerary));
 const tampered=setup();
 const proposal=tampered.hbProposal("mid",tampered.s.stops,[]);
 const bad=tampered.hbReplanResult(tampered.s.stops,proposal).map(x=>x.id==="booking"?{...x,time:"18:00"}:x);
 assert.equal(tampered.hbReplanPreservesProtected(tampered.s.stops,bad),false);
});
