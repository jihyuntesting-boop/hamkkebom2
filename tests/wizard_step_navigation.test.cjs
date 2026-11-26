'use strict';
// UI-02 / F01-06: clickable stepper. Earlier and current steps are free; a later
// step only when earlier steps are valid. Values persist; resume rules unchanged.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../web/assets/core-src/10-recommendation-and-profile.js'),'utf8');
const today='2026-11-26';
const ready={region:'서울',date:'2026-11-28',hbDateExplicit:true,hbDraftActive:true,hbTransport:'car',hbParty:'2'};
const moved={...ready,hbWalkConfirmed:true,walk:'15',hbStairsChoice:'avoid'};

function context(state){
 let handler=null;
 const box={hidden:true,textContent:''};
 const focused=[],scrolled=[];
 const notice={hidden:true,textContent:'',scrollIntoView(opt){scrolled.push(opt)}};
 const c=vm.createContext({
  s:{...state},saves:0,renders:0,
  el:{addEventListener:(type,fn)=>{if(type==='click')handler=fn},contains:()=>true,querySelector:()=>({focus(){focused.push('h2')}})},
  document:{getElementById:id=>id==='hb-step-error'?box:id==='hb-step-nav-notice'?notice:null,
   querySelector:selector=>({focus(opt){focused.push([selector,opt])}})},
  hbTodaySeoul:()=>today
 });
 vm.runInContext(source.slice(0,source.indexOf('function newPlan(){')),c);
 c.save=()=>{c.saves++};
 c.newPlan=()=>{c.renders++};
 const click=n=>{
  const button={dataset:{hbGotoStep:String(n)},focus(){focused.push('button')}};
  handler({target:{closest:()=>button}});
 };
 return {c,box,notice,scrolled,click,bind:()=>c.hbBindStepNav(),focused};
}

test('target rule: back/current always, forward only when earlier steps are valid',()=>{
 const {c}=context({});
 assert.equal(c.hbStepTarget({},1,3,today).ok,true);
 assert.equal(c.hbStepTarget({},2,2,today).ok,true);
 assert.equal(c.hbStepTarget({...ready,date:'2020-01-01'},2,1,today).ok,false);
 assert.equal(c.hbStepTarget({...ready,date:'2020-01-01'},2,1,today).step,1);
 assert.equal(c.hbStepTarget(ready,2,1,today).ok,true);
 const third=c.hbStepTarget(ready,3,1,today);
 assert.equal(third.ok,false);assert.equal(third.step,2);assert.match(third.reason,/2단계 이동 조건/);
 assert.equal(c.hbStepTarget(moved,3,1,today).ok,true);
 assert.equal(c.hbStepTarget(moved,4,1,today).ok,false);
 assert.equal(c.hbStepTarget(moved,0,1,today).ok,false);
});

test('click: going back keeps all values and re-renders the chosen step',()=>{
 const t=context({...moved,hbStep:3,hbFoodPreferences:['less_spicy']});
 t.bind();
 t.click(1);
 assert.equal(t.c.s.hbStep,1);assert.equal(t.c.s.hbDraftActive,true);
 assert.equal(t.c.s.walk,'15');assert.equal(t.c.s.hbStairsChoice,'avoid');assert.equal(t.c.s.hbFoodPreferences[0],'less_spicy');
 assert.equal(t.c.saves,1);assert.equal(t.c.renders,1);
});

test('click: current step only moves focus; reachable step still moves',()=>{
 const t=context({...ready,hbStep:1});
 t.bind();
 t.click(1);
 assert.equal(t.c.renders,0);assert.equal(t.c.s.hbStep,1);
 t.click(2);
 assert.equal(t.c.s.hbStep,2);assert.equal(t.c.renders,1);
 assert.equal(t.notice.hidden,true);
});

test('blocked step on the same page: stays, notice under the stepper, focus on the first missing choice',()=>{
 const t=context({...ready,hbStep:2});
 t.bind();
 t.click(3);
 assert.equal(t.c.s.hbStep,2);assert.equal(t.c.renders,0);assert.equal(t.c.saves,0);
 assert.equal(t.notice.hidden,false);assert.match(t.notice.textContent,/2단계 이동 조건/);
 assert.equal(t.box.textContent,t.notice.textContent);
 assert.equal(t.focused.at(-1)[0],'[data-hb-walk]');assert.equal(t.focused.at(-1)[1].preventScroll,true);
 assert.equal(t.scrolled.at(-1).block,'nearest');
 const walked=context({...ready,hbStep:2,hbWalkConfirmed:true,walk:'15'});
 walked.bind();walked.click(3);
 assert.equal(walked.focused.at(-1)[0],'[data-hb-stairs]');
});

test('blocked jump over an incomplete step opens that step and explains there',()=>{
 const t=context({...ready,hbStep:1});
 t.bind();
 t.click(3);
 assert.equal(t.c.s.hbStep,2);assert.equal(t.c.renders,1);
 assert.match(t.notice.textContent,/2단계 이동 조건/);
 assert.equal(t.focused.at(-1)[0],'[data-hb-walk]');
});

test('blocked from an invalid step 1: stays on step 1 and focuses the field to fix',()=>{
 const t=context({...ready,date:'2020-01-01',hbStep:1});
 t.bind();
 t.click(2);
 assert.equal(t.c.s.hbStep,1);assert.equal(t.c.renders,0);
 assert.match(t.notice.textContent,/1단계 여행 정보/);
 assert.equal(t.focused.at(-1)[0],'#date');
 const timed=context({...ready,hbDepartTime:'25:00',hbStep:1});
 timed.bind();timed.click(3);
 assert.equal(timed.focused.at(-1)[0],'#hb-trip-start');
});

test('binding happens once even though newPlan renders many times',()=>{
 let added=0;
 const t=context(ready);
 t.c.el.addEventListener=()=>{added++};
 t.c.hbBindStepNav();t.c.hbBindStepNav();
 assert.equal(added,1);
});

test('resume and new-trip rules are unchanged by the stepper',()=>{
 const {c}=context({});
 assert.equal(c.hbWizardStep({...moved,hbStep:3},today),3);
 assert.equal(c.hbWizardStep({...moved,hbStep:3,hbDraftActive:false},today),1);
 assert.equal(c.hbWizardStep({...ready,hbStep:3},today),2);
 assert.equal(c.hbWizardStep({...ready,hbStep:2,date:'2020-01-01',hbDateExplicit:true},today),1);
});

test('markup: buttons inside the existing pills, aria-current kept on one item, blocked steps aria-disabled',()=>{
 assert.match(source,/class="hb-step-link" data-hb-goto-step="'\+n\+'"/);
 assert.match(source,/aria-disabled="true" aria-label="'\+n\+'단계 '\+name\+' \(앞 단계를 먼저 완료해 주세요\)" aria-describedby="hb-step-error"/);
 assert.match(source,/'<li'\+\(i\+1===step\?' aria-current="step"'/);
 assert.match(source,/<\/ol><p id="hb-step-nav-notice" class="hb-step-nav-notice" role="status" aria-live="polite" hidden><\/p>/);
});
