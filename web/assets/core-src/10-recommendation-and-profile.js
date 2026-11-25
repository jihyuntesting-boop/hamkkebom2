function hbAccessFacts(place){
  return Array.isArray(place.accessFacts)?place.accessFacts.filter(f=>f&&typeof f==='object'):[];
}

function hbScopedMobility(value){
  return value?.status==='verified'&&typeof value.scope==='string'&&value.scope.trim()!==''&&typeof value.verifiedAt==='string'&&Number.isFinite(Date.parse(value.verifiedAt));
}

const hbMobilityAidLabels={none:'사용 안 함',cane:'지팡이',walker:'보행 보조기',wheelchair:'휠체어',other:'기타 보조기구'};

function hbEvaluatePlace(p,profile){
  const facts=hbAccessFacts(p);
  const needs=Array.isArray(profile.needs)?profile.needs:[];
  const fields=facts.map(f=>String(f.label||'')+' '+String(f.description||''));
  const has=(r)=>fields.some(x=>r.test(x));
  const mobility=p.mobilityAssessment;
  const aid=profile.mobilityAid;
  const hasAid=Boolean(aid&&aid!=='none');
  const stepFreeRequired=aid==='wheelchair'||aid==='walker';
  const stale=p.accessStatus==='stale'||facts.some(f=>f.status==='stale');
  const documented=!stale&&hbScopedMobility(mobility);
  const aidVerified=!hasAid||aid!=='other'&&documented&&
    Array.isArray(mobility.verifiedMobilityAids)&&mobility.verifiedMobilityAids.includes(aid)&&
    (!stepFreeRequired||mobility.stairsRequired===false);
  const conflict=p.accessStatus==='conflicting'||facts.some(f=>f.status==='conflicting');
  const excludes=!conflict&&documented&&(profile.stairsMode==='impossible'||aid==='wheelchair')&&mobility.stairsRequired===true;
  const checks=[['toilet',/화장실/,'화장실'],['rest',/휴식|휴게|쉼터|벤치/,'휴식 공간'],['elevator',/엘리베이터|승강기/,'엘리베이터'],['dropoff',/승하차|하차\s*지점|차량\s*진입/,'하차 지점'],['wheelchair',/휠체어|무단차|단차\s*없/,'휠체어 관련 정보']];
  const found=checks.filter(([key,re])=>needs.includes(key)&&has(re)).map(x=>x[2]);
  const missing=checks.filter(([key,re])=>needs.includes(key)&&!has(re)).map(x=>x[2]+' 정보 미확인');
  const verified=!!(documented&&Number.isFinite(mobility.walkMinutes)&&mobility.walkMinutes>=0&&Number(profile.walk)>0&&mobility.walkMinutes<=Number(profile.walk)&&(['impossible','avoid'].includes(profile.stairsMode)?mobility.stairsRequired===false:profile.stairsMode==='possible'));
  const facilityVerified=checks.filter(([key])=>needs.includes(key)).every(([key])=>mobility&&Array.isArray(mobility.verifiedFacilities)&&mobility.verifiedFacilities.includes(key));
  // Facility labels alone cannot verify a complete route's slope or environment.
  const slopeNeedsReview=profile.slopePreference==='avoid_steep';
  const environmentNeedsReview=['indoor','outdoor'].includes(profile.indoorPreference);
  const status=excludes?'excluded':!conflict&&verified&&aidVerified&&facilityVerified&&!slopeNeedsReview&&!environmentNeedsReview?'confirmed':'review';
  const gaps=[];
  if(conflict)gaps.push('출처의 설명이 달라 방문 전 확인 필요');
  if(excludes)gaps.push('검증된 동선에 필수 계단 있음');
  if(hasAid&&!aidVerified&&!excludes)gaps.push((hbMobilityAidLabels[aid]||'보조기구')+'로 이동 가능한 범위 확인 필요');
  if(stale)gaps.push('오래된 정보라 최신 상태 확인 필요');
  if(slopeNeedsReview)gaps.push('가파른 경사 여부 확인 필요');
  if(environmentNeedsReview)gaps.push(profile.indoorPreference==='indoor'?'실내 동선·시설 확인 필요':'야외 동선·시설 확인 필요');
  if(!profile.stairsMode)gaps.push('계단 이용 가능 조건 미선택');
  else if(profile.stairsMode==='impossible'&&!verified)gaps.push('계단 없는 전체 이동 동선 확인 필요');
  else if(profile.stairsMode==='avoid'&&!verified)gaps.push('계단·경사 실제 이동 동선 확인 필요');
  if(!verified)gaps.push('연속 보행시간·실제 이동 거리 확인 필요');
  gaps.push(...missing);
  if(!facts.length)gaps.push('장소 편의시설 상세 공공자료 없음');
  const score=Math.min(facts.length,5)*2+found.length*4+(p.accessStatus==='info'?1:0);
  return {status,score,found,gaps,sourceReported:facts.length>0,conflict,scope:status==='confirmed'||status==='excluded'?mobility.scope:null};
}

/** Local-only typed form contract. This is not a server eligibility assessment. */
function hbTodaySeoul(){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const value=key=>parts.find(p=>p.type===key)?.value;
  return value('year')+'-'+value('month')+'-'+value('day');
}
function hbTravelInput(profile,today=hbTodaySeoul()){
  const errors=[];
  const allowed=(value,choices)=>choices.includes(value)?value:null;
  const text=value=>typeof value==='string'?value:'';
  const region=allowed(profile.region,['서울','경기']);
  if(!region)errors.push('여행 지역을 선택해 주세요.');
  const date=text(profile.date);
  const format=/^\d{4}-\d{2}-\d{2}$/.test(date);
  const parsed=format?new Date(date+'T00:00:00Z'):null;
  const validDate=!!(parsed&&Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date);
  if(!validDate)errors.push('올바른 여행 날짜를 선택해 주세요.');
  else if(date<today)errors.push('과거 날짜로 여행을 만들 수 없어요. 오늘 이후 날짜를 선택해 주세요.');
  const duration=allowed(profile.hbDuration||'day',['day','overnight']);
  const transport=allowed(profile.hbTransport||'car',['car','transit','mixed']);
  const party=Number(profile.hbParty||2);
  if(!duration)errors.push('여행 형태를 다시 선택해 주세요.');
  if(!transport)errors.push('이동 수단을 다시 선택해 주세요.');
  if(!Number.isInteger(party)||party<2||party>12)errors.push('동행 인원은 2명에서 12명까지 선택해 주세요.');
  const walk=profile.hbWalkConfirmed?allowed(String(profile.walk),['5','10','15','20','30']):null;
  const stairs=allowed(profile.hbStairsChoice,['impossible','avoid','possible']);
  if(!walk)errors.push('한 번에 걸을 수 있는 시간을 직접 선택해 주세요.');
  if(!stairs)errors.push('계단 이용 조건을 직접 선택해 주세요.');
  const foodCodes=['less_spicy','easy_to_chew','vegetarian'];
  const foods=Array.isArray(profile.hbFoodPreferences)?[...new Set(profile.hbFoodPreferences.filter(x=>foodCodes.includes(x)))]:[];
  return {errors,input:{
    region,date,tripType:duration,transport:transport==='transit'?'public_transit':transport,
    partySize:Number.isInteger(party)&&party>=2&&party<=12?party:null,
    walkingMinutes:walk?Number(walk):null,stairs,
    slopePreference:allowed(profile.hbSlopePreference,['avoid_steep','flexible']),
    mobilityAid:allowed(profile.hbMobilityAid,['none','cane','walker','wheelchair','other']),
    restIntervalMinutes:[30,45,60].includes(Number(profile.hbRestIntervalMinutes))?Number(profile.hbRestIntervalMinutes):null,
    indoorPreference:allowed(profile.hbIndoorPreference,['any','indoor','outdoor']),
    placePreference:allowed(profile.hbInterest,['all','spot','food'])||'all',
    foodPreferences:foods
  }};
}
function newPlan(){
  const step=[1,2,3].includes(Number(s.hbStep))?Number(s.hbStep):1;
  s.momNeeds=Array.isArray(s.momNeeds)?s.momNeeds:[];
  s.hbFoodPreferences=Array.isArray(s.hbFoodPreferences)?[...new Set(s.hbFoodPreferences.filter(x=>['less_spicy','easy_to_chew','vegetarian'].includes(x)))]:[];
  const walkChoices=[['5','5분 이하'],['10','10분 정도'],['15','15분 정도'],['20','20분 정도'],['30','30분 이상']];
  const stairChoices=[['possible','계단 이용 가능'],['avoid','가능하면 계단 피하기'],['impossible','계단 이용 불가']];
  const card=(items,key,value)=>items.map(([id,name])=>'<button type="button" class="hb-choice '+(value===id?'chosen':'')+'" data-hb-'+key+'="'+id+'" aria-pressed="'+String(value===id)+'">'+safe(name)+'</button>').join('');
  const refreshChoice=selector=>{newPlan();document.querySelector(selector)?.focus()};
  const changeStep=next=>{s.hbStep=next;save();newPlan();el.querySelector('h2')?.focus()};
  const prev=step>1?'<button class="light" type="button" id="hb-prev">← 이전 단계</button>':'';
  const intro='<h1>부모님과 여행 만들기</h1><p class="muted">여행 지역과 이동 조건부터 확인해요. 방문 가능한 동선이 검증됐다는 뜻은 아니에요.</p><div class="hb-progress" aria-label="3단계 중 '+step+'단계">1. 여행 정보 <span>›</span> 2. 이동 조건 <span>›</span> 3. 선호사항 <strong>('+step+'/3)</strong></div>';
  if(step===1){
    el.innerHTML=intro+'<section class="panel"><h2 tabindex="-1">1. 여행 정보</h2>'+prefs()+'<div class="row"><div class="field"><label for="hb-duration">여행 형태</label><select id="hb-duration"><option value="day">당일 여행</option><option value="overnight">숙박 여행</option></select></div><div class="field"><label for="hb-transport">주요 이동 수단</label><select id="hb-transport"><option value="car">자동차</option><option value="transit">대중교통</option><option value="mixed">상황에 따라 선택</option></select></div><div class="field"><label for="hb-party">동행 인원</label><select id="hb-party"><option value="2">2명</option><option value="3">3명</option><option value="4">4명</option><option value="5">5명</option><option value="6">6명</option><option value="7">7명</option><option value="8">8명</option><option value="9">9명</option><option value="10">10명</option><option value="11">11명</option><option value="12">12명</option></select></div></div><div class="actions"><button type="button" id="hb-next">다음: 이동 조건 →</button></div><p class="muted" id="hb-step-error" role="alert"></p></section>';
    bindPrefs();
    const ids=[['hb-duration','hbDuration','day'],['hb-transport','hbTransport','car'],['hb-party','hbParty','2']];
    ids.forEach(([id,key,defaultValue])=>{const x=document.getElementById(id);x.value=s[key]||defaultValue;x.onchange=()=>{s[key]=x.value;save()}});
    document.getElementById('hb-next').onclick=()=>{const result=hbTravelInput(s);const issues=result.errors.filter(x=>!x.includes('걸을 수 있는 시간')&&!x.includes('계단 이용 조건'));if(issues.length){document.getElementById('hb-step-error').textContent=issues.join(' ');return;}changeStep(2)};
    return;
  }
  if(step===2){
    el.innerHTML=intro+'<section class="panel"><h2 tabindex="-1">2. 이동 조건</h2><p class="muted">필수 항목이에요. 실제 보행 거리와 계단 여부는 장소별 확인이 필요해요.</p><h3>한 번에 얼마나 걸을 수 있나요?</h3><div class="hb-choice-grid">'+card(walkChoices,'walk',s.hbWalkConfirmed?s.walk:null)+'</div><h3>계단 이용은 어떤가요?</h3><div class="hb-choice-grid">'+card(stairChoices,'stairs',s.hbStairsChoice)+'</div><div class="actions">'+prev+'<button type="button" id="hb-next">다음: 선호사항 →</button></div><p id="hb-step-error" class="warn" role="alert" hidden></p></section>';
    document.querySelectorAll('[data-hb-walk]').forEach(b=>b.onclick=()=>{s.walk=b.dataset.hbWalk;s.hbWalkConfirmed=true;save();refreshChoice('[data-hb-walk="'+b.dataset.hbWalk+'"]')});
    document.querySelectorAll('[data-hb-stairs]').forEach(b=>b.onclick=()=>{s.hbStairsChoice=b.dataset.hbStairs;s.stairs=s.hbStairsChoice==='possible'?'possible':'avoid';save();refreshChoice('[data-hb-stairs="'+b.dataset.hbStairs+'"]')});
    document.getElementById('hb-prev').onclick=()=>{changeStep(1)};
    document.getElementById('hb-next').onclick=()=>{const issues=hbTravelInput(s).errors;if(issues.length){const m=document.getElementById('hb-step-error');m.hidden=false;m.textContent=issues.join(' ');return;}changeStep(3)};
    return;
  }
  const needs=[['toilet','화장실 가까이'],['rest','쉴 곳 많게'],['dropoff','입구 가까운 하차'],['elevator','엘리베이터'],['wheelchair','휠체어 편의시설']];
  const optionalFields=[
    ['hb-slope-pref','hbSlopePreference','경사는 어떤가요?',[
      ['','선택하지 않음'],['avoid_steep','가파른 경사 피하기'],['flexible','특별한 제한 없음']]],
    ['hb-rest-interval','hbRestIntervalMinutes','얼마나 자주 쉬면 좋을까요?',[
      ['','선택하지 않음'],['30','약 30분마다'],['45','약 45분마다'],['60','약 60분마다']]],
    ['hb-indoor-pref','hbIndoorPreference','어떤 장소를 선호하나요?',[
      ['','선택하지 않음'],['any','실내외 모두'],['indoor','실내 위주'],['outdoor','야외 위주']]]
  ];
  const optionalMarkup='<h3>추가 여행 선호 (선택)</h3><p class="muted">선택 내용은 이 기기에 저장돼요. 휴식 간격은 일정 초안에 반영돼요.</p><div class="row">'+optionalFields.map(([id,key,label,options])=>{
    const selected=s[key]==null?'':String(s[key]);
    return '<div class="field"><label for="'+id+'">'+safe(label)+'</label><select id="'+id+'" data-hb-pref="'+key+'">'+options.map(([value,name])=>'<option value="'+safe(value)+'"'+(selected===value?' selected':'')+'>'+safe(name)+'</option>').join('')+'</select></div>';
  }).join('')+'</div>';
  const aidOptions=[['','선택하지 않음'],['none','사용 안 함'],['cane','지팡이'],['walker','보행 보조기'],['wheelchair','휠체어'],['other','기타']];
  const foodOptions=[['less_spicy','덜 매운 음식'],['easy_to_chew','씹기 편한 음식'],['vegetarian','채식']];
  const aidValue=aidOptions.some(([id])=>id===s.hbMobilityAid)?s.hbMobilityAid:'';
  const mobilityMarkup='<div class="field"><label for="hb-mobility-aid">이동 보조기구 (선택)</label><select id="hb-mobility-aid">'+aidOptions.map(([id,label])=>'<option value="'+safe(id)+'"'+(id===aidValue?' selected':'')+'>'+safe(label)+'</option>').join('')+'</select></div>';
  const extraMarkup='<h3>식사 선호 (선택)</h3><p class="muted">식사 선호는 현재 식당 자동 필터로 적용되지 않아요. 식당 방문 전에 메뉴를 확인해 주세요.</p><div class="hb-choice-grid">'+foodOptions.map(([id,label])=>'<button type="button" class="hb-choice '+(s.hbFoodPreferences.includes(id)?'chosen':'')+'" data-hb-food="'+id+'" aria-pressed="'+String(s.hbFoodPreferences.includes(id))+'">'+safe(label)+'</button>').join('')+'</div>';
  el.innerHTML=intro+'<section class="panel"><h2 tabindex="-1">3. 선호사항</h2><p class="muted">편의시설 정보는 확인된 자료 범위 안에서 참고할 수 있어요. 추가 선택은 선택사항이에요.</p>'+mobilityMarkup+'<h3>어떤 장소를 먼저 볼까요?</h3><div class="hb-choice-grid">'+card([['all','관광지와 식당 모두'],['spot','관광지·문화시설'],['food','식당']], 'interest',s.hbInterest||'all')+'</div><h3>중요한 편의시설이 있나요?</h3><div class="hb-choice-grid">'+needs.map(([id,name])=>'<button type="button" class="hb-choice '+(s.momNeeds.includes(id)?'chosen':'')+'" data-hb-need="'+id+'" aria-pressed="'+String(s.momNeeds.includes(id))+'">'+safe(name)+'</button>').join('')+'</div>'+optionalMarkup+extraMarkup+'<div class="actions">'+prev+'<button type="button" id="hb-finish">이 조건으로 장소 살펴보기 →</button></div><p class="muted">추천 목록의 ‘확인 필요’ 장소는 안전·접근성이 검증된 곳이 아니에요.</p><p id="hb-finish-error" role="alert" class="warn"></p></section>';
  document.querySelectorAll('[data-hb-interest]').forEach(b=>b.onclick=()=>{s.hbInterest=b.dataset.hbInterest;s.hbBrowseFilter=s.hbInterest;save();refreshChoice('[data-hb-interest="'+b.dataset.hbInterest+'"]')});
  document.querySelectorAll('[data-hb-need]').forEach(b=>b.onclick=()=>{let n=b.dataset.hbNeed;s.momNeeds=s.momNeeds.includes(n)?s.momNeeds.filter(x=>x!==n):[...s.momNeeds,n];save();refreshChoice('[data-hb-need="'+n+'"]')});
  document.querySelectorAll('[data-hb-pref]').forEach(node=>node.onchange=()=>{
    const key=node.dataset.hbPref;
    if(!optionalFields.some(([,allowed])=>allowed===key))return;
    s[key]=key==='hbRestIntervalMinutes'?(node.value?Number(node.value):null):(node.value||null);
    save();
  });
  document.getElementById('hb-mobility-aid').onchange=e=>{s.hbMobilityAid=e.target.value||null;save()};
  document.querySelectorAll('[data-hb-food]').forEach(node=>node.onclick=()=>{const key=node.dataset.hbFood;s.hbFoodPreferences=s.hbFoodPreferences.includes(key)?s.hbFoodPreferences.filter(x=>x!==key):[...s.hbFoodPreferences,key];save();refreshChoice('[data-hb-food="'+key+'"]')});
  document.getElementById('hb-prev').onclick=()=>{changeStep(2)};
  document.getElementById('hb-finish').onclick=()=>{const result=hbTravelInput(s);if(result.errors.length){document.getElementById('hb-finish-error').textContent=result.errors.join(' ');return;}s.hbBrowseLimit=30;s.hbBrowseFilter=s.hbInterest||'all';save();go('/places')};
}
function hbBrowseText(value){
  return String(value??'').normalize('NFKC').toLocaleLowerCase('ko').replace(/\s+/g,'').trim();
}

function hbSearchPlaces(list,filter,query){
  const term=hbBrowseText(query);
  return list.filter(place=>{
    const category=filter==='all'||filter==='spot'&&place.kind!=='food'||filter==='food'&&place.kind==='food'||filter==='access'&&hbAccessFacts(place).length>0;
    return category&&(!term||[place.name,place.address].some(value=>hbBrowseText(value).includes(term)));
  });
}

function hbPlaceCategory(place){
  return place.kind==='food'?'식당':place.kind==='culture'?'문화시설':'관광지';
}

function hbPlaceDetailPath(id){
  return '#/place/'+encodeURIComponent(id);
}

function browse(){
  const filter=['all','spot','food','access'].includes(s.hbBrowseFilter)?s.hbBrowseFilter:(s.hbInterest||'all');
  const query=typeof s.hbBrowseQuery==='string'?s.hbBrowseQuery:'';
  const chosen=Array.isArray(s.chosen)?s.chosen:[];
  const profile={
    walk:s.hbWalkConfirmed?s.walk:null,stairsMode:s.hbStairsChoice,needs:s.momNeeds,mobilityAid:s.hbMobilityAid,
    slopePreference:s.hbSlopePreference,indoorPreference:s.hbIndoorPreference
  };
  const ready=!loading&&!issue&&hbPlacesLoadedRegion===s.region;
  const filtered=ready?hbSearchPlaces(places,filter,query):[];
  const ranked=filtered.map(p=>({p,e:hbEvaluatePlace(p,profile)}))
    .sort((a,b)=>b.e.score-a.e.score||String(a.p.name||'').localeCompare(String(b.p.name||''),'ko'));
  const good=ranked.filter(x=>x.e.status==='confirmed');
  const review=ranked.filter(x=>x.e.status==='review');
  const excluded=ranked.filter(x=>x.e.status==='excluded');
  const limited=Math.max(10,Number(s.hbBrowseLimit)||30);
  const available=new Map(places.map(place=>[place.id,place]));
  const selections=chosen.map(id=>({id,place:available.get(id)}));
  const card=({p,e})=>{
    const picked=chosen.includes(p.id);
    const status=e.status==='confirmed'?'이동 조건 확인됨':e.status==='excluded'?'조건 충돌':e.conflict?'출처 상충':'이동 조건 확인 필요';
    return '<article class="card hb-recommend-card"><div class="hb-card-top"><span class="chip">'+hbPlaceCategory(p)+'</span><span class="hb-recommend-state">'+status+'</span></div>'+
      '<h3>'+safe(p.name)+'</h3><p class="muted">'+safe(p.address||'주소 미확인')+'</p>'+
      (e.scope?'<p>확인 범위: '+safe(e.scope)+'</p>':'')+
      (e.found.length?'<p>관련 편의시설 안내: '+safe(e.found.join(', '))+'</p>':'')+
      (e.gaps.length?'<p class="muted">'+safe(e.gaps.slice(0,3).join(' · '))+'</p>':'')+
      '<div class="actions"><a class="light" data-hb-info="'+safe(p.id)+'" href="'+safe(hbPlaceDetailPath(p.id))+'">상세 정보</a>'+
      (e.status==='excluded'&&!picked?'':'<button type="button" data-hb-pick="'+safe(p.id)+'" aria-pressed="'+picked+'">'+(picked?'선택 취소':'일정에 담기')+'</button>')+'</div></article>';
  };
  const section=(title,arr,empty='')=>'<section class="hb-result-section"><h2>'+title+' <span class="hb-result-count">'+arr.length+'곳</span></h2>'+
    (arr.length?'<div class="grid">'+arr.slice(0,limited).map(card).join('')+'</div>':'<p class="muted">'+empty+'</p>')+'</section>';
  const results=!ready?'':!ranked.length?
    panel('검색 결과가 없어요',places.length?'<p>검색어나 필터를 바꿔 보세요.</p>':'<p>이 지역에서 조회된 장소가 없어요. 여행 지역을 바꿔 보세요.</p>'):
    section('이동 조건 확인된 후보',good,'현재 자료로 이동 조건이 검증된 장소는 없어요.')+
    (review.length?section('방문 전 확인 필요한 후보',review):'')+
    (excluded.length?'<details class="hb-conflict"><summary>조건과 충돌하는 장소 '+excluded.length+'곳</summary><div class="grid">'+excluded.slice(0,limited).map(card).join('')+'</div></details>':'')+
    (Math.max(good.length,review.length,excluded.length)>limited?'<button type="button" class="light" id="hb-more">장소 더 보기</button>':'');
  const extraPrefs=[
    s.hbMobilityAid&&s.hbMobilityAid!=='none'?hbMobilityAidLabels[s.hbMobilityAid]:null,
    s.hbSlopePreference==='avoid_steep'?'가파른 경사 피하기':null,
    [30,45,60].includes(Number(s.hbRestIntervalMinutes))?'휴식 간격 '+Number(s.hbRestIntervalMinutes)+'분':null,
    s.hbIndoorPreference==='indoor'?'실내 위주':s.hbIndoorPreference==='outdoor'?'야외 위주':null
  ].filter(Boolean);
  const stairs={impossible:'이용 불가',avoid:'피하기',possible:'이용 가능'}[s.hbStairsChoice]||'미선택';
  const foodNote=filter==='food'?'<p class="muted">음식 선호와 영업시간은 방문 전에 확인해 주세요.</p>':'';
  const note=s.hbWalkConfirmed&&s.hbStairsChoice?'공공자료 안내만 있는 장소는 방문 전 확인이 필요해요.':'이동 조건이 아직 없어 일반 장소를 보여드려요.';
  const selectedList=selections.length?'<ul class="hb-selected-places">'+selections.map(({id,place})=>
    '<li><span>'+safe(place?.name||'현재 자료에서 조회되지 않은 장소')+'</span> <button type="button" class="light" data-hb-unpick="'+safe(id)+'">선택 취소</button></li>'
  ).join('')+'</ul>':'<p>상세 정보를 확인하고 일정에 넣을 장소를 담아보세요.</p>';
  el.innerHTML='<h1>여행 장소 찾기</h1>'+prefs()+
    '<div class="hb-profile-summary"><strong>여행 조건</strong><p>걷기 '+safe(s.hbWalkConfirmed?s.walk+'분':'미선택')+' · 계단 '+safe(stairs)+
    (extraPrefs.length?' · '+safe(extraPrefs.join(' / ')):'')+'</p><button type="button" class="light" id="hb-edit-profile">조건 수정</button></div>'+
    (s.hbWalkConfirmed&&s.hbStairsChoice?'<section class="panel"><h2>서버 추천 확인</h2><button type="button" class="light" id="hb-server-recommend">서버에서 조건 확인</button><p id="hb-server-recommend-status" role="status"></p></section>':'')+
    (typeof weatherCard==='function'?weatherCard():'')+
    '<form class="row" role="search" id="hb-browse-search"><div class="field"><label for="hb-place-search">장소 이름 또는 주소</label><input type="search" id="hb-place-search" maxlength="100" value="'+safe(query)+'"></div>'+
    '<button type="submit" id="hb-place-search-submit">검색</button>'+(query?'<button type="button" class="light" id="hb-search-reset">검색 지우기</button>':'')+'</form>'+
    '<div class="hb-filter-bar" role="group" aria-label="장소 필터">'+[['all','전체'],['spot','관광지'],['food','식당'],['access','편의시설 안내 있음']].map(([id,label])=>
    '<button type="button" data-hb-filter="'+id+'" class="light '+(filter===id?'hb-filter-active':'')+'" aria-pressed="'+String(filter===id)+'">'+label+'</button>').join('')+'</div>'+
    '<p class="muted">'+note+'</p>'+foodNote+
    '<p role="status">'+(ready?ranked.length+'곳을 찾았어요.':'')+'</p><div id="hb-place-results" aria-busy="'+loading+'">'+results+'</div>'+
    panel('일정에 담은 장소 '+chosen.length+'곳',selectedList+'<button type="button" id="build"'+(ready&&selections.some(x=>x.place)?'':' disabled')+'>선택한 장소로 일정 만들기</button>');
  bindPrefs();
  const serverButton=document.getElementById('hb-server-recommend');
  if(serverButton)serverButton.onclick=async()=>{
    const note=document.getElementById('hb-server-recommend-status');
    const {input,errors}=hbTravelInput(s);
    if(errors.length){note.textContent=errors.join(' ');return;}
    serverButton.disabled=true;
    note.textContent='공공자료를 바탕으로 조건을 확인하는 중이에요.';
    try{
      const result=await hbTravelRequest('/api/recommend',{...input,facilityNeeds:s.momNeeds});
      note.textContent='서버 목록 기준: 조건 확인 '+result.eligible.length+'곳, 방문 전 확인 '+result.needsReview.length+'곳, 조건 충돌 '+result.excluded.length+'곳. 음식 선호와 실제 이동 동선은 방문 전에 확인해 주세요.';
      for(const group of ['eligible','needsReview','excluded']){
        for(const place of result[group]){
          const card=[...el.querySelectorAll('[data-hb-info]')].find(link=>link.dataset.hbInfo===place.id)?.closest('article');
          if(!card||!note.isConnected)continue;
          const status=document.createElement('p');
          status.className='muted';
          status.textContent='서버 확인: '+{eligible:'조건 확인',needsReview:'방문 전 확인 필요',excluded:'필수 계단으로 조건 충돌'}[group];
          card.append(status);
          if(group==='excluded'){
            const pick=card.querySelector('[data-hb-pick][aria-pressed="false"]');
            if(pick)pick.disabled=true;
          }
        }
      }
    }catch{
      note.textContent='서버 추천을 확인하지 못했어요. 기존 장소 목록은 계속 이용할 수 있어요.';
    }finally{serverButton.disabled=false;}
  };
  document.getElementById('hb-edit-profile').onclick=()=>{s.hbStep=1;save();go('/new')};
  function updateAndFocus(selector){
    save();browse();document.querySelector(selector)?.focus();
  }
  document.getElementById('hb-browse-search').onsubmit=event=>{
    event.preventDefault();
    s.hbBrowseQuery=document.getElementById('hb-place-search').value.trim();
    s.hbBrowseLimit=30;
    updateAndFocus('#hb-place-search');
  };
  const reset=document.getElementById('hb-search-reset');
  if(reset)reset.onclick=()=>{s.hbBrowseQuery='';s.hbBrowseLimit=30;updateAndFocus('#hb-place-search')};
  document.querySelectorAll('[data-hb-filter]').forEach(b=>b.onclick=()=>{
    s.hbBrowseFilter=b.dataset.hbFilter;s.hbBrowseLimit=30;
    updateAndFocus('[data-hb-filter="'+b.dataset.hbFilter+'"]');
  });
  document.querySelectorAll('[data-hb-pick],[data-hb-unpick]').forEach(b=>b.onclick=()=>{
    const id=b.dataset.hbPick||b.dataset.hbUnpick;
    s.chosen=chosen.includes(id)?chosen.filter(x=>x!==id):[...chosen,id];
    save();
    browse();
    const button=document.querySelector('[data-hb-pick="'+CSS.escape(id)+'"],[data-hb-unpick="'+CSS.escape(id)+'"]');
    (button||document.getElementById('hb-place-search'))?.focus();
  });
  const more=document.getElementById('hb-more');
  if(more)more.onclick=()=>{s.hbBrowseLimit=limited+30;updateAndFocus('#hb-more, #build')};
  document.getElementById('build').onclick=hbApplyScheduleFromSelection;
}
