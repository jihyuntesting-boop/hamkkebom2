'use strict';
// UI-02 step 3 (선호사항): the "확인 필요" disclaimer line is removed from the finish area, and the
// #hb-finish-error warn box is hidden while it has no message. It must still show real errors.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const source=read('web/assets/core-src/10-recommendation-and-profile.js');
const bundle=read('web/assets/scripts/00-app-core.js');
const styleDir=path.join(root,'web/assets/styles');
const css=fs.readdirSync(styleDir).filter(f=>f.endsWith('.css')).map(f=>({f,text:fs.readFileSync(path.join(styleDir,f),'utf8')}));
const notice='안전·접근성이 검증된 곳이 아니에요';
const box='<p id="hb-finish-error" role="alert" class="warn"></p>';

test('step 3 no longer renders the review disclaimer line',()=>{
 assert.equal(source.includes(notice),false);
 assert.equal(bundle.includes(notice),false);
 assert.equal(source.includes('추천 목록의 ‘확인 필요’'),false);
});

test('finish error box is still rendered (empty) and hidden only while empty',()=>{
 assert.equal(source.split(box).length-1,1,'finish error box stays in step 3 markup');
 const rules=css.filter(x=>x.text.includes('#hb-finish-error'));
 assert.deepEqual(rules.map(x=>x.f),['13-editorial.css']);
 const selectors=[...rules[0].text.matchAll(/([^{}]*#hb-finish-error[^{}]*)\{([^}]*)\}/g)].map(m=>[m[1].replace(/\/\*[\s\S]*?\*\//g,'').trim(),m[2].trim()]);
 assert.deepEqual(selectors,[['#hb-finish-error:empty','display: none;']]);
});

function finish(errors){
 const start=source.indexOf("document.getElementById('hb-finish').onclick=");
 assert.ok(start>0,'finish handler exists');
 const end=source.indexOf('\n',start);
 const target={textContent:''},button={};
 const c=vm.createContext({
  s:{hbStep:3,date:'2099-01-01'},routes:[],saves:0,
  hbRefreshAutomaticDate:s=>s,hbTravelDateError:()=>'',newPlan:()=>{},
  hbTravelInput:()=>({errors}),save(){c.saves++},go(r){c.routes.push(r)},
  document:{getElementById:id=>id==='hb-finish'?button:id==='hb-finish-error'?target:null}
 });
 vm.runInContext(source.slice(start,end),c);
 vm.runInContext("document.getElementById('hb-finish').onclick()",c);
 return {target,c};
}

test('real validation errors fill the box, so :empty no longer hides it',()=>{
 const {target,c}=finish(['이동 방법을 골라 주세요.','함께 가는 인원을 골라 주세요.']);
 assert.equal(target.textContent,'이동 방법을 골라 주세요. 함께 가는 인원을 골라 주세요.');
 assert.ok(target.textContent.length>0);
 assert.deepEqual(c.routes,[]);
});

test('without errors the box stays empty (hidden) and the flow continues',()=>{
 const {target,c}=finish([]);
 assert.equal(target.textContent,'');
 assert.deepEqual(c.routes,['/places']);
});
