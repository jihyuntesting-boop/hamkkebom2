'use strict';
(function(){
 const M=window.HBMigration,$=id=>document.getElementById(id);
 let pending=null,expected=null,backedUp=false,generation=0;
 const exportCode='javascript:'+encodeURIComponent("(function(){if(location.origin!=='https://hamkkebom-mvp.vercel.app'){alert('기존 함께봄 주소에서 실행하세요.');return;}try{const raw=localStorage.getItem('hamkkebom-cloud');if(raw===null){alert('저장된 일정이 없습니다.');return;}const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='hamkkebom-legacy-private.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}catch(e){alert('백업 실패: 브라우저 저장 권한을 확인하세요.');}})()");
 $('copy-export').onclick=async()=>{
  try{await navigator.clipboard.writeText(exportCode);$('export-status').textContent='복사했습니다. 새 북마크의 주소로 붙여 넣으세요.'}
  catch{$('export-code').hidden=false;$('export-code').textContent=exportCode;$('export-status').textContent='위 주소를 직접 복사하세요.'}
 };
 function reset(){
  pending=null;expected=null;backedUp=false;$('apply').disabled=true;$('backup-current').disabled=true;$('replace').checked=false;$('replace').disabled=true;$('preview').textContent='';$('result').textContent='';
 }
 function refresh(){ $('apply').disabled=!pending||(expected!==null&&(!backedUp||!$('replace').checked)); }
 $('backup-file').onchange=async()=>{
  reset();const request=++generation;const f=$('backup-file').files[0];if(!f)return;
  try{
   if(location.origin!==M.NEW)throw Error('공식 신규 운영 주소에서만 가져올 수 있습니다.');
   if(f.size>262144)throw Error('백업 파일이 너무 큽니다.');
   const raw=await f.text();if(request!==generation)return;
   const parsed=M.parseBackup(raw);
   const current=localStorage.getItem(M.KEY);pending=parsed;expected=current;
   $('preview').textContent=parsed.state.region+' · '+parsed.state.date+' · 일정 '+parsed.state.stops.length+'개 · 보호 일정 '+parsed.protectedCount+'개'+(parsed.undoArchived?' · 과거 재조정 되돌리기 기록은 원본 백업에만 남습니다.':'')+(current!==null?' · 현재 신규 저장값이 있습니다.':'');
   $('backup-current').disabled=current===null;refresh();
  }catch(e){if(request!==generation)return;reset();$('result').textContent=e.message;}
 };
 $('backup-current').onclick=()=>{
  try{
   if(expected===null||localStorage.getItem(M.KEY)!==expected)throw Error('저장값이 바뀌었습니다. 다시 파일을 선택하세요.');
   const url=URL.createObjectURL(new Blob([expected],{type:'application/json'})),a=document.createElement('a');
   a.href=url;a.download='hamkkebom-new-before-import-private.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
   backedUp=true;$('replace').disabled=false;refresh();
  }catch(e){reset();$('result').textContent=e.message;}
 };
 $('replace').onchange=refresh;
 $('apply').onclick=()=>{
  if(!pending||location.origin!==M.NEW)return;
  if(!confirm('미리보기한 개인 일정을 이 브라우저에 가져올까요? 다른 함께봄 탭은 닫아 주세요.'))return;
  try{M.writeBackup(localStorage,pending,expected,{replace:backedUp&&$('replace').checked});reset();$('result').textContent='가져오기 완료. 새 일정을 확인하세요. 원본 백업은 계속 보관하세요.'}
  catch(e){reset();$('result').textContent=e.message;}
 };
 $('convert').onclick=()=>{
  $('new-link').hidden=true;$('new-link').removeAttribute('href');$('new-link').textContent='';
  try{const u=M.moveShare($('old-link').value);$('new-link').href=u;$('new-link').textContent=u;$('new-link').hidden=false;$('link-status').textContent='새 읽기 전용 링크를 확인한 후 가족에게 다시 보내 주세요.'}
  catch(e){$('link-status').textContent=e.message;}
 };
})();
