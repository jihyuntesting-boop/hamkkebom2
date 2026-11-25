
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
function home(){el.innerHTML='<section class="hb-landing-hero" aria-labelledby="hb-landing-title"><span class="hb-landing-eyebrow">'+hbIcon('flower')+'부모님과 함께하는 편안한 여행, 함께봄</span><h1 id="hb-landing-title">좋은 곳보다,<br>함께 가기 편한 곳.</h1><p class="hb-landing-intro">계단, 화장실, 쉬어갈 곳까지. 부모님과 함께 갈 때 필요한 정보를 살펴보고 우리 가족에게 맞는 여행 일정을 만들어보세요.</p><div class="hb-landing-benefits" aria-label="함께봄의 주요 기능"><div class="hb-benefit">'+hbIcon('walk')+'<strong>걷기 조건 선택</strong></div><div class="hb-benefit">'+hbIcon('stairs')+'<strong>계단·경사 정보</strong></div><div class="hb-benefit">'+hbIcon('restroom')+'<strong>화장실·휴식시설</strong></div><div class="hb-benefit">'+hbIcon('weather')+'<strong>날씨·일정 조정</strong></div></div><div class="hb-landing-actions"><button id="mom-start" class="hb-landing-cta" type="button">'+hbIcon('heart')+'부모님 맞춤 여행 만들기 <span aria-hidden="true">→</span></button><button id="hb-map-go" class="hb-landing-link" type="button">지도에서 여행지 둘러보기</button></div><p class="hb-landing-note">※ 이동 편의 정보는 장소별로 확인 범위가 달라요. 미확인 정보는 구분해서 보여드려요.</p></section><section class="panel hb-nearby-panel"><div class="row hb-nearby-head"><div><strong>'+hbIcon('pin')+'내 주변 관광지 지도</strong><div class="muted" id="nearby-status">위치를 확인하고 있어요…</div></div><div class="actions hb-actions-flush"><button class="light" id="locate-again">내 위치 다시 찾기</button><button class="light" id="locate-seoul">서울 중심 보기</button><button class="light" id="hb-search-map-center" type="button" disabled>이 지도 위치에서 다시 검색</button></div></div><div id="nearby-map"></div><div class="muted hb-map-credit">지도: 네이버지도 · 관광지: 한국관광공사 TourAPI · GPS는 허용 시에만 조회하며 저장하지 않아요.</div></section><section class="panel"><h2 class="hb-section-title">내 주변 여행지 · 식당</h2><div class="actions hb-actions-tight"><button id="near-all" class="light">전체</button><button id="near-spot" class="light">관광지</button><button id="near-food" class="light">식당</button></div><div id="featured-summary" class="muted hb-featured-summary"></div><div id="featured-quicklinks" class="hb-featured-quicklinks" aria-label="대표 관광지 바로가기"></div><div id="nearby-list"><p class="muted">실제 장소를 찾는 중이에요.</p></div></section><section class="hb-landing-how" aria-label="함께봄 사용 방법"><h2>여행 준비부터 여행 중까지</h2><div class="hb-how-grid"><div>'+hbIcon('pin')+'<strong>편한 장소 살펴보기</strong><p>알려진 편의시설 정보와 확인이 필요한 부분을 함께 살펴봐요.</p></div><div>'+hbIcon('calendar')+'<strong>우리 가족 일정 만들기</strong><p>방문 순서와 식사, 쉬는 시간을 고려해 일정을 준비해요.</p></div><div>'+hbIcon('heart')+'<strong>피곤하면 일정 가볍게</strong><p>그날 컨디션에 맞춰 남은 일정을 줄이는 변경안을 확인해요.</p></div></div></section><div class="actions">'+button('start','부모님 맞춤 여행 만들기 →')+'</div>';document.getElementById('start').onclick=()=>go('/new');document.getElementById('mom-start').onclick=()=>go('/new');document.getElementById('hb-map-go').onclick=()=>{let map=document.getElementById('nearby-map'), target=map||document.getElementById('nearby-list');if(!target)return;target.setAttribute('tabindex','-1');target.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});target.focus({preventScroll:true})};document.getElementById('locate-again').onclick=()=>requestLocation(true);document.getElementById('locate-seoul').onclick=()=>{nearbyMode='서울 시청 중심 (기본 위치)';fetchNearby(37.5665,126.9780,false)};document.getElementById('hb-search-map-center').onclick=hbSearchMapCenter;['all','spot','food'].forEach(f=>document.getElementById('near-'+f).onclick=()=>{nearFilter=f;featuredMode=false;drawNearbyList()});mountNearbyMap();if(!geoStarted){geoStarted=true;requestLocation(false)}else{setNearbyStatus();drawNearbyList()}}
// One icon set for the whole UI (replaces emoji): 24px grid, 2px stroke,
// currentColor. Decorative only, so always hidden from assistive tech.
const HB_ICON_PATHS={
 pin:'<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
 heart:'<path d="M12 20s-7.5-4.6-9.2-9.4A4.9 4.9 0 0 1 12 7.4a4.9 4.9 0 0 1 9.2 3.2C19.5 15.4 12 20 12 20z"/>',
 walk:'<circle cx="13" cy="4.5" r="2"/><path d="M10 21l2.2-6.5L15 17v4M8 12.5l2.4-4 3.6.8 2 3.7M12.2 14.5l-1.8-6"/>',
 stairs:'<path d="M3 20h5v-4h4v-4h4V8h5"/>',
 restroom:'<circle cx="7" cy="5" r="2"/><path d="M5 9h4v6H8v6H6v-6H5z"/><circle cx="17" cy="5" r="2"/><path d="M17 9l-3 7h2v5h2v-5h2z"/><path d="M12 4v17"/>',
 weather:'<circle cx="8.5" cy="8.5" r="3"/><path d="M8.5 2.5v1M3 8.5h1M4.6 4.6l.7.7"/><path d="M8 20h9a4 4 0 0 0 .3-8 5 5 0 0 0-9.4 1.6A3.2 3.2 0 0 0 8 20z"/>',
 calendar:'<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
 flower:'<circle cx="12" cy="12" r="2.4"/><path d="M12 9.6C10 6.6 11 3.6 12 3c1 .6 2 3.6 0 6.6zM14.4 12c3-2 6-1 6.6 0-.6 1-3.6 2-6.6 0zM12 14.4c2 3 1 6 0 6.6-1-.6-2-3.6 0-6.6zM9.6 12c-3 2-6 1-6.6 0 .6-1 3.6-2 6.6 0z"/>',
 food:'<path d="M3 12h18a9 9 0 0 1-18 0zM9 8.5c0-1.8 1.6-2 1.6-4M14 8.5c0-1.8 1.6-2 1.6-4"/>',
 leaf:'<path d="M5 19C5 10.5 10 5.2 20 4c-.8 10-6 15-15 15zM5 19l8-8"/>',
 star:'<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>'
};
function hbIcon(name){
 const path=HB_ICON_PATHS[name];
 return path?'<svg class="hb-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+path+'</svg>':'';
}
