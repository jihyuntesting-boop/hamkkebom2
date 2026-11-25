/* Agent AA: independently mountable detail panel. Not loaded by the existing
 * application until Agent X connects the place-selection and Naver adapters.
 * Uses the official --hb design tokens and does not replace existing pick logic.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.HBRichPlaceDetail=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const states={official_reported:'공식 자료 안내',source_reported:'공식 자료 안내',verified:'현장 확인',verified_yes:'이용 가능 확인',verified_no:'이용 제한 확인',stale:'오래된 정보',conflicting:'출처 상충',provider_error:'조회 실패',missing:'확인 필요',unknown:'확인 필요',not_mapped:'확인 필요',not_applicable:'해당 없음'};
 const kinds={parking:'주차장',dropoff:'하차 지점',entrance:'입구',public_toilet:'주변 공중화장실',accessible_toilet:'장애인 화장실',rest:'휴식 공간',wheelchair:'휠체어 대여소',attraction:'관람시설'};
 const validPoint=f=>Number.isFinite(f?.lat)&&Number.isFinite(f?.lng)&&f.lat>=33&&f.lat<=39&&f.lng>=124&&f.lng<=132&&typeof f?.coordinateEvidence?.sourceUrl==='string'&&!!f.coordinateEvidence.verifiedAt;
 const txt=v=>typeof v==='string'&&v.trim()?v.trim():null;
 function buildDetailModel(data,photo){
  const field=k=>data.fields?.[k]||{};
  const access=k=>data.accessibility?.attributes?.[k]||{};
  const note=(key)=>{const entry=access(key);return {state:entry.status||'unknown',value:txt(entry.evidence?.[0]?.description)||null};};
  const brief=(v)=>v&&v.length>100?v.slice(0,100)+'…':v;
  const card=(key,label,icon,entry)=>{const differing=entry.additionalReports?.length>0;return {key,label,icon,value:differing?'자료별 설명 확인':brief(txt(entry.value))||states[entry.state]||'확인 필요',status:differing?'자료 설명 상이':states[entry.state]||'확인 필요',full:txt(entry.value)};};
  const parking=field('parking'),accessibleParking=note('accessibleParking');
  const prefer=(primary,alternate)=>primary.state==='conflicting'||primary.value?primary:alternate;
  const toilet=note('accessibleToilet'),rest=note('restFacilities'),wheelchair=note('wheelchairRental');
  const cards=[
   card('parking','주차','P',prefer(parking,accessibleParking)),
   card('walking','걷는 거리','↔',{state:'missing'}),
   card('stairs','계단·경사','⌞',{state:'missing'}),
   card('wheelchair','휠체어','♿',wheelchair),
   card('toilet','화장실','WC',prefer(field('restroom'),toilet)),
   card('rest','휴식 공간','‖',prefer(field('rest'),rest)),
   card('admission','입장료','₩',field('admission')),
   card('hours','운영시간','◷',field('hours'))
  ];
  const issues=Object.values(data.accessibility?.attributes||{}).map(x=>x.status);
  const warnings=['주차장에서 입구까지 실제 보행거리와 계단 없는 경로는 확인되지 않았어요.'];
  if(issues.includes('conflicting')||data.accessStatus==='conflicting')warnings.unshift('접근성 자료가 서로 달라요. 방문 전에 직접 확인해 주세요.');
  if(issues.includes('stale')||data.accessStatus==='stale')warnings.unshift('오래된 시설 정보가 있어요. 방문 전에 최신 상태를 확인해 주세요.');
  if(Object.values(data.fields||{}).some(f=>f.additionalReports?.length))warnings.push('운영·시설 자료의 설명이 서로 달라요. 자세한 자료를 함께 확인해 주세요.');
  if(data.partial)warnings.push('일부 정보를 가져오지 못했어요.');
  const seen=new Set();
  const points=(data.facilities||[]).filter(f=>validPoint(f)&&kinds[f.kind]&&typeof f.id==='string'&&!seen.has(f.id)&&(seen.add(f.id),true));
  const approved=photo&&photo.placeId===data.id&&photo.imagePath==='/images/places/'+data.id+'.webp'&&/^tour-\d{1,12}$/.test(data.id)&&txt(photo.credit)&&txt(photo.license)&&txt(photo.verifiedAt);
  return {name:data.name,address:data.address,cards,warnings,points,photo:approved?{path:photo.imagePath,credit:photo.credit,license:photo.license}:null};
 }
 function mount(container,{data,photo=null,photoAlreadyShown=false,onAdd,mapAdapter}={}){
  if(!container||!data)throw TypeError('detail_mount_required');
  const doc=container.ownerDocument,model=buildDetailModel(data,photo);
  const node=(tag,text,style)=>{const e=doc.createElement(tag);if(text!=null)e.textContent=text;if(style)Object.assign(e.style,style);return e;};
  const touch={minHeight:'var(--hb-touch, 48px)',fontSize:'var(--hb-text-md, 1rem)',whiteSpace:'normal'};
  const section=node('section',null,{display:'grid',gap:'var(--hb-space-4, 16px)',minWidth:'0',overflowWrap:'anywhere',fontFamily:'var(--hb-font, sans-serif)',color:'var(--hb-ink)'});
  section.setAttribute('aria-label','장소 상세 보강 정보');
  if(model.photo){
   const figure=node('figure',null,{margin:'0'});
   const img=node('img',null,{display:'block',width:'100%',maxHeight:'320px',objectFit:'cover',borderRadius:'var(--hb-radius, 12px)'});
   img.alt=model.name+' 실제 장소 사진';img.src=model.photo.path;
   // No photo/failed photo: omit the area entirely, no status wording (MVP decision 2026-11-26).
   img.addEventListener('error',()=>figure.remove(),{once:true});
   figure.append(img,node('figcaption',model.photo.credit+' · '+model.photo.license));section.append(figure);
  }
  section.append(node('h2',model.name),node('p',model.address||'주소 확인 필요'));
  for(const key of ['closed','seniorDiscount','parkingFee','phone']){
   const entry=data.fields?.[key],value=entry?.additionalReports?.length?'자료별 설명 확인':entry?.value;if(txt(value))section.append(node('p',({closed:'휴무일',seniorDiscount:'경로우대',parkingFee:'주차요금',phone:'문의'})[key]+': '+value));
  }
  if(typeof onAdd==='function'){const add=node('button','일정에 담기',touch);add.type='button';add.onclick=()=>onAdd(data.id);section.append(add);}
  const warnings=node('div',null,{background:'var(--hb-warning-bg)',color:'var(--hb-warning-ink)',borderRadius:'var(--hb-radius, 12px)',padding:'var(--hb-space-3, 12px)'});
  warnings.setAttribute('role','note');model.warnings.forEach(w=>warnings.append(node('p',w)));section.append(warnings);
  const grid=node('div',null,{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 8rem), 1fr))',gap:'var(--hb-space-2, 8px)'});
  for(const card of model.cards){
   const box=node('article',null,{border:'1px solid var(--hb-line)',borderRadius:'var(--hb-radius, 12px)',padding:'var(--hb-space-3, 12px)',minWidth:'0',background:'var(--hb-surface)'});
   const icon=node('span',card.icon,{fontSize:'1.5rem',fontWeight:'700'});icon.setAttribute('aria-hidden','true');
   box.append(icon,node('h3',card.label,{fontSize:'var(--hb-text-lg, 1.125rem)'}),node('strong',card.value,{fontSize:'var(--hb-text-lg, 1.125rem)'}),node('p',card.status));
   grid.append(box);
  }
  section.append(grid);
  const mapSection=node('section');mapSection.append(node('h3','주변 시설 지도'),node('p','가까운 시설도 관광지 소속이나 이동 가능한 경로로 확인된 것은 아니에요.'));
  const map=node('div',null,{width:'100%',minHeight:model.points.length&&typeof mapAdapter==='function'?'240px':'0'});
  const list=node('div',null,{display:'grid',gap:'8px'}),sheet=node('section',null,{padding:'var(--hb-space-3, 12px)',background:'var(--hb-quiet)',borderRadius:'var(--hb-radius, 12px)'});
  sheet.setAttribute('aria-label','선택한 시설 정보');sheet.hidden=true;
  const filter=node('select',null,touch);filter.setAttribute('aria-label','시설 종류');
  for(const [value,label] of [['all','모든 시설'],...Object.entries(kinds).filter(([k])=>model.points.some(f=>f.kind===k))]){
   const opt=node('option',label);opt.value=value;filter.append(opt);
  }
  function select(id){
   const f=model.points.find(p=>p.id===id);if(!f)return;
   sheet.hidden=false;sheet.replaceChildren(node('h4',f.name||kinds[f.kind]),node('p',f.address||'주소 확인 필요'),node('p',kinds[f.kind]),node('p',f.relationship==='nearby_unaffiliated'?'주변 시설 · 관광지 소속 미확인':'시설 소속 근거 확인 필요'));
   if(Number.isFinite(f.distanceFromPlaceCenterM)&&f.distanceType==='straight_line')sheet.append(node('p','장소 중심에서 직선거리 '+f.distanceFromPlaceCenterM+'m (보행거리 아님)'));
   if(f.openingHours)sheet.append(node('p','개방 안내: '+f.openingHours));
   if(f.accessibleFacilityReport?.note)sheet.append(node('p',f.accessibleFacilityReport.note));
   sheet.append(node('p','실제 보행 경로 확인 필요'));
  }
  let dispose;
  function refresh(){
   if(typeof dispose==='function')dispose();dispose=undefined;map.replaceChildren();list.replaceChildren();sheet.hidden=true;
   const points=model.points.filter(p=>filter.value==='all'||p.kind===filter.value);
   if(!points.length)list.append(node('p','지도에 표시할 좌표 확인 시설이 없어요.'));
   else{
    for(const f of points){const b=node('button',kinds[f.kind]+' · '+(f.name||''),touch);b.type='button';b.onclick=()=>select(f.id);list.append(b);}
    if(typeof mapAdapter==='function'){try{dispose=mapAdapter({container:map,points,onSelect:select});}catch{map.replaceChildren(node('p','지도를 불러오지 못했어요. 시설 목록은 계속 사용할 수 있어요.'));}}
    else map.append(node('p','지도 연결 전이에요. 시설 목록에서 위치 정보를 확인하세요.'));
   }
  }
  filter.onchange=refresh;mapSection.append(filter,map,list,sheet);section.append(mapSection);
  const details=node('details');const summary=node('summary','자세한 정보와 출처',touch);details.append(summary);
  const addEvidence=(label,f)=>{if(!f||(!txt(f.value)&&!f.additionalReports?.length))return;details.append(node('h4',label));for(const report of [f,...(f.additionalReports||[])]){if(!txt(report.value))continue;details.append(node('p',report.value),node('p',(states[report.state||report.status]||'자료 안내')+(report.collectedAt?' · 수집 '+report.collectedAt:'')+(report.sourceUrl?' · '+report.sourceUrl:'')));}};
  for(const [key,value] of Object.entries(data.fields||{}))addEvidence(({overview:'장소 소개',parking:'주차',hours:'운영시간',admission:'입장료',closed:'휴무일',seniorDiscount:'경로우대',phone:'문의',mainMenu:'대표 메뉴',menu:'메뉴',reservation:'예약',seats:'좌석',parkingFee:'주차요금',restroom:'화장실',rest:'휴식',amenities:'편의시설'})[key]||key,value);
  for(const f of data.additional||[])addEvidence(f.name,f);
  for(const f of data.accessFacts||[])addEvidence(({entrance:'출입구',parking:'장애인 주차',toilet:'장애인 화장실',elevator:'엘리베이터'})[f.attribute]||f.detail||'접근성 안내',{...f,value:f.description||f.value});
  section.append(details);container.replaceChildren(section);refresh();
  return ()=>{if(typeof dispose==='function')dispose();section.remove();};
 }
 return {buildDetailModel,mount};
});
