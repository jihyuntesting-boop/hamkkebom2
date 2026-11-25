
(()=>{const el=document.getElementById('app'),KEY='hamkkebom-cloud';let s={region:'서울',date:new Date(Date.now()+32400000).toISOString().slice(0,10),walk:'15',stairs:'avoid',chosen:[],stops:[]};try{s={...s,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{}let places=[],loading=false,issue='',weather='';const save=()=>localStorage.setItem(KEY,JSON.stringify(s)),path=()=>location.hash.slice(1)||'/',go=x=>{location.hash='#'+x;render()},safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),button=(id,name,alt=false)=>'<button '+(alt?'class="light" ':'')+'id="'+id+'">'+name+'</button>',panel=(h,b)=>'<section class="panel"><h2>'+h+'</h2>'+b+'</section>';
function hbPlaceDataMessage(){
 const status=loading?'장소를 불러오는 중이에요.':issue?'조회 실패: '+safe(issue):
  hbPlacesLoadedRegion===s.region?(places.length?'장소 '+places.length+'곳을 불러왔어요.':'조회된 장소가 없어요.'):'아직 장소를 조회하지 않았어요.';
 return '<div id="hb-place-data-state" role="'+(issue?'alert':'status')+'" class="message '+(issue?'error':'')+'">'+status+'</div>';
}

function prefs(){
 return '<div class="row"><div class="field"><label for="region">여행 지역</label><select id="region"><option>서울</option><option>경기</option></select></div>'+
  '<div class="field"><label for="date">여행 날짜</label><input type="date" id="date" value="'+safe(s.date)+'"></div>'+
  button('refresh',issue?'다시 조회':'장소 조회')+'</div>'+hbPlaceDataMessage();
}

function hbKeepItineraryContext(){
 if(!Array.isArray(s.stops)||!s.stops.length)return;
 s.hbPlanInfo={...s.hbPlanInfo,date:s.hbPlanInfo?.date||s.date,region:s.hbPlanInfo?.region||s.region};
}

function bindPrefs(){
 const region=document.getElementById('region');
 if(!region)return;
 region.value=s.region;
 region.onchange=()=>{
  if(s.region===region.value)return;
  hbKeepItineraryContext();
  s.region=region.value;
  s.chosen=[];
  s.hbBrowseQuery='';
  s.hbBrowseLimit=30;
  save();
  load();
 };
 document.getElementById('date').onchange=event=>{
  hbKeepItineraryContext();
  s.date=event.target.value;
  save();
  getWeather();
 };
 document.getElementById('refresh').onclick=load;
}
function home(){el.innerHTML='<section class="hb-landing-hero" aria-labelledby="hb-landing-title"><span class="hb-landing-eyebrow">🌷 부모님과 함께하는 편안한 여행, 함께봄</span><h1 id="hb-landing-title">좋은 곳보다,<br>함께 가기 편한 곳.</h1><p class="hb-landing-intro">계단, 화장실, 쉬어갈 곳까지. 부모님과 함께 갈 때 필요한 정보를 살펴보고 우리 가족에게 맞는 여행 일정을 만들어보세요.</p><div class="hb-landing-benefits" aria-label="함께봄의 주요 기능"><div class="hb-benefit"><span aria-hidden="true">🚶</span><strong>걷기 조건 선택</strong></div><div class="hb-benefit"><span aria-hidden="true">🪜</span><strong>계단·경사 정보</strong></div><div class="hb-benefit"><span aria-hidden="true">🚻</span><strong>화장실·휴식시설</strong></div><div class="hb-benefit"><span aria-hidden="true">🌦️</span><strong>날씨·일정 조정</strong></div></div><div class="hb-landing-actions"><button id="mom-start" class="hb-landing-cta" type="button">💗 부모님 맞춤 여행 만들기 <span aria-hidden="true">→</span></button><button id="hb-map-go" class="hb-landing-link" type="button">지도에서 여행지 둘러보기</button></div><p class="hb-landing-note">※ 이동 편의 정보는 장소별로 확인 범위가 달라요. 미확인 정보는 구분해서 보여드려요.</p></section><section class="panel" style="padding:13px;margin-bottom:15px"><div class="row" style="align-items:center;justify-content:space-between;margin:2px 0 10px"><div><strong>📍 내 주변 관광지 지도</strong><div class="muted" id="nearby-status">위치를 확인하고 있어요…</div></div><div class="actions" style="margin:0"><button class="light" id="locate-again">내 위치 다시 찾기</button><button class="light" id="locate-seoul">서울 중심 보기</button><button class="light" id="hb-search-map-center" type="button" disabled>이 지도 위치에서 다시 검색</button></div></div><div id="nearby-map" style="height:min(57vh,510px);min-height:330px;border-radius:14px;background:#dce9dc;z-index:0"></div><div class="muted" style="padding-top:10px">지도: 네이버지도 · 관광지: 한국관광공사 TourAPI · GPS는 허용 시에만 조회하며 저장하지 않아요.</div></section><section class="panel"><h2 style="margin-bottom:9px">내 주변 여행지 · 식당</h2><div class="actions" style="margin-bottom:12px"><button id="near-all" class="light">전체</button><button id="near-spot" class="light">관광지</button><button id="near-food" class="light">식당</button></div><div id="featured-summary" class="muted" style="margin-bottom:12px"></div><div id="featured-quicklinks" class="hb-featured-quicklinks" aria-label="대표 관광지 바로가기"></div><div id="nearby-list"><p class="muted">실제 장소를 찾는 중이에요.</p></div></section><section class="hb-landing-how" aria-label="함께봄 사용 방법"><h2>여행 준비부터 여행 중까지</h2><div class="hb-how-grid"><div><span aria-hidden="true">📍</span><strong>편한 장소 살펴보기</strong><p>알려진 편의시설 정보와 확인이 필요한 부분을 함께 살펴봐요.</p></div><div><span aria-hidden="true">🗓️</span><strong>우리 가족 일정 만들기</strong><p>방문 순서와 식사, 쉬는 시간을 고려해 일정을 준비해요.</p></div><div><span aria-hidden="true">💗</span><strong>피곤하면 일정 가볍게</strong><p>그날 컨디션에 맞춰 남은 일정을 줄이는 변경안을 확인해요.</p></div></div></section><div class="actions">'+button('start','💗 부모님 맞춤 여행 만들기 →')+'</div>';document.getElementById('start').onclick=()=>go('/new');document.getElementById('mom-start').onclick=()=>go('/new');document.getElementById('hb-map-go').onclick=()=>{let map=document.getElementById('nearby-map'), target=map||document.getElementById('nearby-list');if(!target)return;target.setAttribute('tabindex','-1');target.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});target.focus({preventScroll:true})};document.getElementById('locate-again').onclick=()=>requestLocation(true);document.getElementById('locate-seoul').onclick=()=>{nearbyMode='서울 시청 중심 (기본 위치)';fetchNearby(37.5665,126.9780,false)};document.getElementById('hb-search-map-center').onclick=hbSearchMapCenter;['all','spot','food'].forEach(f=>document.getElementById('near-'+f).onclick=()=>{nearFilter=f;featuredMode=false;drawNearbyList()});mountNearbyMap();if(!geoStarted){geoStarted=true;requestLocation(false)}else{setNearbyStatus();drawNearbyList()}}

