// Share links contain a static, read-only snapshot in the URL fragment.
// No server token, expiry, revocation or live synchronization is provided.
const MAX_SHARED_STOPS = 60;
const MAX_SHARE_CODE = 24000;
const MAX_SHARE_URL = 25000;
const enc = value => {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const dec = code => {
  if (typeof code !== 'string' || !code || code.length > MAX_SHARE_CODE
      || !/^[A-Za-z0-9_-]+$/.test(code)) throw Error('Invalid share code');
  const bytes = Uint8Array.from(atob(code.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes));
};

function shareData(date, stops) {
  const validDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  if (!validDate || !Array.isArray(stops) || !stops.length || stops.length > MAX_SHARED_STOPS) {
    throw Error('Invalid itinerary');
  }
  // Strict public whitelist: never spread draft stops, profile fields or storage.
  const publicStops = stops.map(stop => {
    if (!stop || typeof stop.time !== 'string' || !/^([01]?\d|2[0-3]):[0-5]\d$/.test(stop.time)
        || typeof stop.name !== 'string' || !stop.name.trim() || stop.name.length > 300) throw Error('Invalid stop');
    return {time:stop.time.padStart(5,'0'), name:stop.name.trim()};
  });
  return {v:1, date, stops:publicStops};
}

function hbSharedPlaceFields(placeId, location, address, notice) {
  if (typeof placeId !== 'string' || !/^tour-\d{1,12}$/.test(placeId)) return {};
  const coordinates = hbMapCoordinates(location);
  const publicAddress = typeof address === 'string' && address.trim() && address.length <= 200
    && !/[\u0000-\u001f\u007f]/.test(address) ? address.trim() : null;
  const publicNotice = typeof notice === 'string' && notice.trim() && notice.length <= 240
    && !/[\u0000-\u001f\u007f]/.test(notice) ? notice.trim() : null;
  return {placeId, ...(coordinates ? {coordinates} : {}),
    ...(publicAddress ? {address:publicAddress} : {}), ...(publicNotice ? {notice:publicNotice} : {})};
}

function hbPublicShareNotice(place) {
  // Opt-in only: a public catalog entry must explicitly mark its notice
  // public AND verified. User-entered memo, reason and access profile never qualify.
  const note = place?.shareNotice;
  return note?.public === true && note?.verification === 'verified' ? note.text : null;
}

function hbShareMapData(date, stops, catalog, sharedAt) {
  const schedule = shareData(date, stops);
  // Loaded public place records only. Saved owner-only picked records may also
  // be present in the places array and must not supply address/coordinates.
  const publicPlaces = new Map(catalog.filter(place => place && !place.hbPickedRegion
    && typeof place.id === 'string' && /^tour-\d{1,12}$/.test(place.id))
    .map(place => [place.id, place]));
  const publicStops = schedule.stops.map((stop, index) => {
    const item = stops[index];
    if (item.isPlaceholder) return stop;
    const match = publicPlaces.get(item.placeId || item.id);
    return match ? {...stop, ...hbSharedPlaceFields(match.id, match, match.address, hbPublicShareNotice(match))} : stop;
  });
  return {v:2, date, sharedAt, stops:publicStops};
}

function hbReadShareMap(data) {
  const schedule = shareData(data.date, data.stops);
  if (typeof data.sharedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(data.sharedAt)
      || !Number.isFinite(Date.parse(data.sharedAt)) || new Date(data.sharedAt).toISOString() !== data.sharedAt) {
    throw Error('Invalid share timestamp');
  }
  const stops = schedule.stops.map((stop, index) => {
    const {placeId, coordinates, address, notice} = data.stops[index];
    return {...stop, ...hbSharedPlaceFields(placeId, coordinates, address, notice)};
  });
  return {...schedule, v:2, sharedAt:data.sharedAt, stops};
}

function share() {
  let url;
  try {
    const region = s.hbPlanInfo?.region || s.region;
    const catalog = hbPlacesLoadedRegion === region ? places : [];
    const code = enc(hbShareMapData(s.hbPlanInfo?.date || s.date, s.stops, catalog, new Date().toISOString()));
    if (code.length > MAX_SHARE_CODE) throw Error('Schedule exceeds link limit');
    const base = new URL(location.pathname, location.origin);
    base.hash = '/share/' + code;
    url = base.href;
    if (url.length > MAX_SHARE_URL) throw Error('Schedule exceeds link limit');
  } catch (error) {
    const message = error?.message === 'Schedule exceeds link limit'
      ? '공유 링크가 길이 제한을 넘었어요. 정보를 잘라 보내지 않았습니다. 방문지 수나 이름을 줄여 다시 시도해 주세요.'
      : '여행 날짜와 시간, 장소명이 있는 유효한 일정을 먼저 준비해 주세요.';
    el.innerHTML = '<h1>가족에게 일정 공유</h1><p id="hb-share-error" role="alert">'
      + safe(message) + '</p><p><a class="hb-back-link" href="#/plan"><span aria-hidden="true">←</span> 내 일정으로 돌아가기</a></p>';
    return;
  }
  el.innerHTML = '<h1>가족에게 일정 공유</h1>'
    + '<section class="panel" aria-labelledby="hb-share-link-title"><h2 id="hb-share-link-title">읽기 전용 일정 링크</h2>'
    + '<p>이 링크에는 여행 날짜, 시간, 장소 이름, 링크 생성 시각과 공개 장소 목록에서 확인한 위치·주소 및 승인된 공개 주의사항만 포함돼요.</p>'
    + '<p>이 링크를 가진 사람은 누구나 볼 수 있고 다시 전달할 수 있어요. 만료나 회수 기능이 없어요. 내 일정을 수정해도 이미 보낸 링크의 일정은 그대로예요.</p>'
    + '<label><input type="checkbox" id="hb-share-confirm"> 공유 링크에 담기는 정보를 확인했어요.</label>'
    + '<div id="hb-share-controls" hidden><div class="field"><label for="hb-share-url">공유 링크</label>'
    + '<input id="hb-share-url" class="link" type="url" readonly value="' + safe(url) + '" style="max-width:100%"></div>'
    + '<div class="actions"><button id="copy" type="button">링크 복사</button>'
    + '<a id="hb-share-open" href="' + safe(url) + '" target="_blank" rel="noopener noreferrer">공유 일정 미리 보기</a></div>'
    + '<p id="hb-share-copy-status" role="status" aria-live="polite"></p></div></section>'
    + '<p><a class="hb-back-link" href="#/plan"><span aria-hidden="true">←</span> 내 일정으로 돌아가기</a></p>';
  const input = document.getElementById('hb-share-url');
  const status = document.getElementById('hb-share-copy-status');
  document.getElementById('hb-share-confirm').onchange = event => {
    document.getElementById('hb-share-controls').hidden = !event.target.checked;
  };
  document.getElementById('copy').onclick = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(url);
      status.textContent = '링크를 복사했어요.';
      return;
    } catch {
      // execCommand works on some browsers where the async Clipboard API is
      // blocked. A false result is not success: keep the link selected.
      try {
        input.focus();
        input.select();
        input.setSelectionRange?.(0, url.length);
        if (typeof document.execCommand === 'function' && document.execCommand('copy')) {
          status.textContent = '링크를 복사했어요.';
          return;
        }
      } catch {}
      status.textContent = '자동으로 복사하지 못했어요. 선택된 링크를 복사 단축키로 복사해 주세요. 휴대폰에서는 링크 입력창을 길게 눌러 복사할 수 있어요.';
    }
  };
}

function hbSharedMapLink(stop) {
  // Do not treat the recipient's local places, draft address or a supplied URL
  // as trusted; search the public address / position via a fixed HTTPS host.
  if (!stop.address && !stop.coordinates && !stop.placeId) return '';
  const query = stop.address ? [stop.name, stop.address].join(' ')
    : stop.coordinates ? stop.coordinates.lat + ',' + stop.coordinates.lng : stop.name;
  return 'https://map.naver.com/p/search/' + encodeURIComponent(query);
}

function hbShareReadOnlyStop(stop) {
  const mapUrl = hbSharedMapLink(stop);
  return '<li class="hb-share-stop" style="overflow-wrap:anywhere;word-break:break-word;margin-block:0.8em">'
    + '<time datetime="' + safe(stop.time) + '">' + safe(stop.time) + '</time> '
    + '<strong style="overflow-wrap:anywhere">' + safe(stop.name) + '</strong>'
    + (stop.address ? '<p style="overflow-wrap:anywhere">공개 장소 주소: ' + safe(stop.address) + '</p>'
      : '<p class="muted">주소 정보 없음</p>')
    + (stop.notice ? '<p>공유된 현장 주의사항 (방문 전 재확인): ' + safe(stop.notice) + '</p>' : '')
    + (mapUrl ? '<p><a href="' + safe(mapUrl) + '" target="_blank" rel="noopener noreferrer" style="overflow-wrap:anywhere">네이버지도에서 장소 확인</a></p>' : '')
    + '</li>';
}

function shared(code) {
  try {
    const data = dec(code);
    if (data?.v !== 1 && data?.v !== 2) throw Error('Unsupported share link');
    const {date, stops, sharedAt} = data.v === 2 ? hbReadShareMap(data) : shareData(data.date, data.stops);
    const names = stops.map(hbShareReadOnlyStop).join('');
    el.innerHTML = '<section id="hb-share-receiver" aria-labelledby="hb-share-heading"'
      + ' style="max-width:100%;overflow-wrap:anywhere;line-height:1.65">'
      + '<h1 id="hb-share-heading">가족 여행 일정</h1>'
      + '<p><time datetime="' + safe(date) + '">' + safe(date) + '</time> · 읽기 전용</p>'
      + (sharedAt ? '<p class="muted">링크 생성 <time datetime="' + safe(sharedAt) + '">'
        + safe(new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'}).format(new Date(sharedAt)))
        + '</time> (한국 시간)</p>' : '')
      + '<p>이 화면에서는 일정을 편집할 수 없어요. 원본을 수정해도 이 링크는 자동으로 바뀌지 않으며 만료·회수 기능도 없어요.</p>'
      + '<button id="hb-share-large-text" type="button" aria-pressed="false">큰 글씨로 보기</button>'
      + '<section class="panel" aria-labelledby="hb-share-list-heading"><h2 id="hb-share-list-heading">방문 순서와 주소</h2>'
      + '<ol id="hb-shared-fallback-list" style="max-width:100%;font-size:1.05em;line-height:1.7;padding-inline-start:1.7em">'
      + names + '</ol></section>'
      + (sharedAt ? '<div id="hb-shared-map-slot" aria-label="공유 일정 지도"></div>' : '')
      + '<p><a id="hb-own-trip" href="#/new">새 여행 만들기 (원본과 별개)</a></p></section>';
    const ownTrip=document.getElementById('hb-own-trip');
    if(ownTrip)ownTrip.onclick=event=>{event.preventDefault();hbEnsureOwnerState('/new');hbBeginNewTravel();if(!hbIsShareReceiver(path())&&hbPlacesLoadedRegion!==s.region)load();};
    const receiver = document.getElementById('hb-share-receiver');
    const large = document.getElementById('hb-share-large-text');
    large.onclick = () => {
      const on = large.getAttribute('aria-pressed') !== 'true';
      large.setAttribute('aria-pressed', String(on));
      large.textContent = on ? '기본 글씨로 보기' : '큰 글씨로 보기';
      receiver.style.fontSize = on ? '1.35rem' : '';
      receiver.style.lineHeight = on ? '1.8' : '1.65';
    };
    if (sharedAt) {
      try {
        hbRenderItineraryMap(document.getElementById('hb-shared-map-slot'), stops, []);
      } catch {
        const slot = document.getElementById('hb-shared-map-slot');
        if (slot) slot.innerHTML = '<p role="status">지도를 표시하지 못했어요. 위의 방문 순서·주소·지도 링크를 이용해 주세요.</p>';
      }
    }
  } catch {
    el.innerHTML = '<h1>공유 링크를 열 수 없어요</h1><p id="hb-share-error" role="alert">'
      + '링크가 비어 있거나 손상되었거나 길이 제한을 넘었어요. 보낸 사람에게 링크를 다시 받아 주세요.'
      + '</p><p><a href="#/">홈으로 가기</a></p>';
  }
}


// BEGIN HB_DISCOVERY_EDITORIAL
const hbDiscoveryState={age:'all',sex:'all',region:'all',theme:'all',season:'all',records:[],status:'idle',partial:false,sequence:0,audience:[],audienceRequested:false};
// 사용자 결정 2026-11-26: 연령·성별·지역·테마 필터 화면 숨김(코드·데이터 보존). true로 되돌리면 다시 표시.
const hbDiscoveryFiltersVisible=false;
let hbDiscoveryPending=null,hbDiscoveryDetailId=null,hbDiscoveryMapDispose=null;
const hbDiscoveryRegions=[['all','전체 지역'],['1','서울'],['31','경기'],['32','강원'],['33','충북'],['34','충남'],['35','경북'],['36','경남'],['37','전북'],['38','전남'],['39','제주'],['2','인천'],['3','대전'],['4','대구'],['5','광주'],['6','부산'],['7','울산'],['8','세종']];
const hbDiscoveryThemes=[['all','전체'],['nature','자연·정원'],['culture','역사·문화'],['food','미식'],['coast','바다·드라이브']];
const hbDiscoverySeasons=[['all','모든 계절'],['spring','봄'],['summer','여름'],['autumn','가을'],['winter','겨울']];
const hbDiscoveryCourses=[
 {id:'palace',title:'서울 궁궐과 한옥 골목 나들이',region:'서울',areaCode:'1',theme:'culture',seasons:['spring','autumn'],description:'궁궐과 한옥 건축을 만나는 역사 여행',ids:['tour-126508','tour-126537']},
 {id:'art',title:'서울 문화와 디자인 나들이',region:'서울',areaCode:'1',theme:'culture',seasons:['summer','winter'],description:'박물관과 디자인 공간을 둘러보는 문화 여행',ids:['tour-129703','tour-2470006']},
 {id:'parks',title:'서울의 푸른 공원 두 곳',region:'서울',areaCode:'1',theme:'nature',seasons:['spring','autumn'],description:'서울숲과 올림픽공원을 둘러보는 자연 여행',ids:['tour-128611','tour-126532']},
 {id:'fortress',title:'경기 성곽 역사 여행',region:'경기',areaCode:'31',theme:'culture',seasons:['spring','autumn'],description:'수원 화성과 남한산성의 역사 탐방. 서로 다른 지역을 잇는 자동차 여행 후보',ids:['tour-125555','tour-125449']}
];
const hbDiscoveryCourse=hbDiscoveryCourses[0];
const hbDiscoveryCache=new Map();
function hbDiscoveryCurrentSeason(month){return month>=3&&month<=5?'spring':month>=6&&month<=8?'summer':month>=9&&month<=11?'autumn':'winter';}
function hbDiscoverySeasonLabel(season){return hbDiscoverySeasons.find(([id])=>id===season)?.[1]||'';}
function hbDiscoveryThemeMatch(p,theme){
 if(theme==='all')return true;
 if(theme==='food')return p.kind==='food';
 const name=String(p.name||'');
 if(theme==='culture')return p.kind==='culture'||/궁|한옥|박물관|미술관|기념관|유적|성곽|사찰|문화/.test(name);
 if(theme==='nature')return p.kind!=='food'&&/정원|수목원|공원|숲|호수|습지|휴양림|산책/.test(name);
 if(theme==='coast')return p.kind!=='food'&&/해변|해수욕장|바다|해안|항구|전망대|등대/.test(name);
 return false;
}
function hbDiscoveryRecords(items){
 const records=new Map();
 for(const p of items){if(!hbRichIdentity(p)||typeof p.name!=='string'||!p.name.trim())continue;
  if(!records.has(p.id)||(!records.get(p.id).areaCode&&p.areaCode))records.set(p.id,p);
 }
 return [...records.values()];
}
function hbDiscoveryCourseStops(records,region,theme,course=hbDiscoveryCourse){
 if(!['all',course.areaCode].includes(region)||!['all',course.theme].includes(theme))return [];
 const stops=course.ids.map(id=>records.find(p=>p.id===id&&String(p.areaCode)===course.areaCode));
 return stops.every(Boolean)?stops:[];
}
function hbDiscoveryVisibleCourses(records,region,theme,season){
 return hbDiscoveryCourses.filter(c=>season==='all'||c.seasons.includes(season)).map(c=>({course:c,stops:hbDiscoveryCourseStops(records,region,theme,c)})).filter(x=>x.stops.length);
}
function hbDiscoveryFeaturedRows(data){
 if(!Array.isArray(data?.places))throw Error('invalid featured response');
 const prefixes={서울:/^서울(?:특별시|\s)/,경기:/^경기(?:도|\s)/};
 return data.places.filter(p=>p&&Object.hasOwn(prefixes,p.region)&&typeof p.address==='string'&&prefixes[p.region].test(p.address)).map(p=>({...p,areaCode:p.region==='서울'?'1':'31',kind:p.kind||'spot'}));
}
function hbDiscoveryApprovedCohorts(data){
 if(data?.schemaVersion!==1||!Array.isArray(data.cohorts))return [];
 const validMonth=m=>typeof m==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(m);
 const approved=data.cohorts.filter(c=>c&&c.rightsStatus==='approved'&&typeof c.rightsEvidence==='string'&&c.rightsEvidence.trim()&&
  c.sourceUrl==='https://datalab.visitkorea.or.kr/datalab/portal/loc/getTourDataFormView2.do'&&
  ['all','40','50','60','70plus'].includes(c.age)&&['all','male','female'].includes(c.sex)&&
  hbDiscoveryRegions.some(([id])=>id===c.region)&&validMonth(c.periodStart)&&validMonth(c.periodEnd)&&c.periodStart<=c.periodEnd&&
  c.metric==='visit_concentration'&&['percent','index'].includes(c.unit)&&typeof c.methodology==='string'&&c.methodology.trim()&&
  Array.isArray(c.rows)&&c.rows.length&&c.rows.every(row=>row&&/^tour-\d{1,12}$/.test(row.id)&&Number.isFinite(row.value)&&row.value>=0&&(c.unit!=='percent'||row.value<=100))&&
  new Set(c.rows.map(row=>row.id)).size===c.rows.length);
 return approved.filter(c=>approved.filter(other=>other.age===c.age&&other.sex===c.sex&&other.region===c.region).length===1);
}
function hbDiscoveryAudienceMatch(cohorts,age,sex,region,records){
 if(age==='all'&&sex==='all')return null;
 const cohort=cohorts.find(c=>c.age===age&&c.sex===sex&&c.region===region);
 if(!cohort)return null;
 const values=new Map(cohort.rows.map(row=>[row.id,row.value]));
 const ranked=records.filter(p=>values.has(p.id)).sort((a,b)=>values.get(b.id)-values.get(a.id)||a.id.localeCompare(b.id));
 return ranked.length?{cohort,values,ranked}:null;
}
function hbDiscoveryAudienceNote(age,sex){
 return age==='all'&&sex==='all'?'함께봄 편집 추천':
 '선택한 연령대·성별의 실제 방문 통계는 아직 연결되지 않았어요. 아래는 연령·성별과 무관한 함께봄 편집 추천이에요.';
}
function hbDiscoveryClearMap(){if(hbDiscoveryMapDispose)hbDiscoveryMapDispose();hbDiscoveryMapDispose=null;}
function hbDiscoveryOpen(id){
 const p=hbDiscoveryState.records.find(item=>item.id===id);
 if(!p)return;
 hbDiscoveryDetailId=id;hbRichSelected=p;go('/place/'+encodeURIComponent(id));
}
function hbDiscoveryStartCourse(course,stops){
 if(!hbDiscoveryCourses.includes(course)||stops.length!==course.ids.length||!stops.every((p,i)=>p.id===course.ids[i]&&String(p.areaCode)===course.areaCode))return;
 hbDiscoveryPending={title:course.title,region:course.region,ids:stops.map(p=>p.id),names:stops.map(p=>p.name)};
 go('/new');
}
function hbDiscoveryPendingMarkup(){
 if(!hbDiscoveryPending)return '';
 const p=hbDiscoveryPending;
 return '<section class="panel hb-discovery-handoff"><h2>추천 코스에서 가져온 방문 후보</h2><p>'+safe(p.title)+' · '+safe(p.names.join(' → '))+'</p><p class="muted">여행 지역을 '+safe(p.region)+'으로 선택하고 이동 조건을 확인해 주세요. 조건 확인 후 장소별로 직접 담을 수 있어요.</p><button type="button" class="light" id="hb-discovery-clear">코스 후보 연결 해제</button></section>';
}
function hbDiscoveryBindPending(redraw){
 const clear=document.getElementById('hb-discovery-clear');
 if(clear)clear.onclick=()=>{hbDiscoveryPending=null;redraw();};
}
function hbDiscoveryPriority(id,region){
 return hbDiscoveryPending?.region===region&&hbDiscoveryPending.ids.includes(id)?1:0;
}
function hbDiscoveryDraw(focus){
 if(path()!=='/discover')return;
 hbDiscoveryClearMap();
 const d=hbDiscoveryState;
 const chips=(key,values)=>'<div class="hb-discovery-chips" role="group" aria-label="'+({age:'연령대',sex:'성별',theme:'여행 테마',season:'계절'}[key])+'">'+values.map(([id,label])=>'<button type="button" class="light" data-discovery-filter="'+key+'" data-discovery-value="'+id+'" aria-pressed="'+(d[key]===id)+'">'+safe(label)+'</button>').join('')+'</div>';
 const available=d.records.filter(p=>(d.region==='all'||String(p.areaCode)===d.region)&&hbDiscoveryThemeMatch(p,d.theme));
 const audience=hbDiscoveryAudienceMatch(d.audience,d.age,d.sex,d.region,available);
 const courseIds=new Set(hbDiscoveryCourses.flatMap(c=>c.ids));
 const ordered=audience?audience.ranked:available.sort((a,b)=>Number(courseIds.has(b.id))-Number(courseIds.has(a.id)));
 const courses=hbDiscoveryVisibleCourses(d.records,d.region,d.theme,d.season);
 const thisSeason=hbDiscoveryCurrentSeason(Number(new Intl.DateTimeFormat('en',{month:'numeric',timeZone:'Asia/Seoul'}).format(new Date())));
 const seasonal=hbDiscoveryVisibleCourses(d.records,d.region,d.theme,thisSeason);
 const cards=ordered.slice(0,24).map(p=>'<article class="card hb-discovery-card"><h3>'+safe(p.name)+'</h3>'+(p.address?'<p class="muted">'+safe(p.address)+'</p>':'')+'<p>'+safe(hbPlaceCategory(p))+' · 방문 전 이동 조건 확인</p>'+(audience?'<p>방문 집중률 '+safe(audience.values.get(p.id))+(audience.cohort.unit==='percent'?'%':' (지수)')+'</p>':'')+'<a data-hb-info="'+safe(p.id)+'" data-discovery-open="'+safe(p.id)+'" href="'+safe(hbPlaceDetailPath(p.id))+'">장소 상세 보기</a></article>').join('');
 const courseCard=({course:c,stops})=>'<article class="panel hb-discovery-course" data-discovery-course="'+c.id+'"><p class="hb-discovery-kicker">'+safe(c.region+' · '+c.seasons.map(hbDiscoverySeasonLabel).join('·'))+' · 편집 제안</p><h3>'+safe(c.title)+'</h3><p>'+safe(c.description)+'</p><ol>'+stops.map(p=>'<li><a data-discovery-open="'+safe(p.id)+'" href="'+safe(hbPlaceDetailPath(p.id))+'">'+safe(p.name)+'</a></li>').join('')+'</ol><p class="muted">방문 순서 아이디어예요.</p><div class="actions"><button class="light" type="button" data-discovery-map="'+c.id+'" aria-expanded="false">코스 지도 보기</button><button type="button" data-discovery-start="'+c.id+'">이 코스로 여행 만들기</button></div><div class="hb-discovery-course-map" data-discovery-map-host="'+c.id+'" hidden></div></article>';
 const seasonalIntro=seasonal.length&&d.season==='all'?'<section class="hb-discovery-seasonal"><h2>이번 계절의 여행 아이디어 · '+safe(hbDiscoverySeasonLabel(thisSeason))+'</h2><p>함께봄 편집 제안이에요.</p><div class="hb-discovery-season-links">'+seasonal.map(({course:c})=>'<a href="#/discover" data-discovery-season-jump="'+c.id+'">'+safe(c.title)+'</a>').join('')+'</div></section>':'';
 const course= d.status==='loading'?'':'<section class="hb-discovery-section"><h2>함께봄이 제안하는 여행 코스</h2>'+chips('season',hbDiscoverySeasons)+'<p class="muted">계절은 편집 테마예요. 현재 확인한 관광 데이터와 일치하는 장소가 모두 있는 코스만 표시해요.</p>'+(courses.length?'<div class="hb-discovery-course-grid">'+courses.map(courseCard).join('')+'</div>':'<p>현재 조회 자료에서 이 지역·테마·계절의 완성된 추천 코스를 찾지 못했어요.</p>')+'</section>';
 const status=d.status==='loading'?'여행지 콘텐츠를 불러오는 중이에요.':d.status==='error'?'여행지 자료를 불러오지 못했어요.':d.partial?'일부 자료만 조회됐어요.':available.length?'현재 조회 자료 '+available.length+'곳 · 일부 편집 후보':'현재 조회 자료에 이 테마의 장소가 없어요.';
 el.innerHTML='<div class="hb-discovery"><section class="hb-discovery-hero"><p class="hb-discovery-kicker">여행 아이디어</p><h1>부모님과 어디로 떠나볼까요?</h1><p>사진과 여행지, 코스를 둘러보고 마음에 드는 곳을 발견해 보세요.</p><a href="#/">지도에서 여행지 탐색</a></section>'+(hbDiscoveryFiltersVisible?'<section class="hb-discovery-filter" aria-label="콘텐츠 필터"><h2>관심 있는 여행을 둘러보세요</h2>'+chips('age',[['all','모든 연령'],['40','40대'],['50','50대'],['60','60대'],['70plus','70대 이상']])+chips('sex',[['all','전체 성별'],['female','어머니'],['male','아버지']])+'<p class="muted" role="status">'+safe(audience?'한국관광 데이터랩 · '+audience.cohort.periodStart+'~'+audience.cohort.periodEnd+' · 현재 조회 장소 중 방문 집중률 기준 (방문자 수·만족도 순위 아님)':hbDiscoveryAudienceNote(d.age,d.sex))+'</p>'+(audience?'<p><a href="https://datalab.visitkorea.or.kr/datalab/portal/loc/getTourDataFormView2.do" target="_blank" rel="noopener noreferrer">통계 출처</a> · '+safe(audience.cohort.methodology)+'</p>':'')+'<label for="hb-discovery-region">여행 지역</label><select id="hb-discovery-region">'+hbDiscoveryRegions.map(([id,label])=>'<option value="'+id+'"'+(d.region===id?' selected':'')+'>'+safe(label)+'</option>').join('')+'</select><h3>취향에 따라 떠나는 여행</h3>'+chips('theme',hbDiscoveryThemes)+'</section>':'')+seasonalIntro+course+'<section class="hb-discovery-section"><h2>'+(audience?'선택 조건의 방문 집중률':'둘러보기 좋은 여행지')+'</h2><p role="'+(d.status==='error'?'alert':'status')+'">'+safe(status)+'</p>'+(d.status==='error'||d.partial?'<button type="button" class="light" id="hb-discovery-retry">다시 불러오기</button>':'')+(cards?'<div class="grid hb-discovery-grid">'+cards+'</div>':'')+'</section><section class="panel"><h2>우리 가족 여행을 계획해 볼까요?</h2><p>여행 날짜와 부모님의 실제 이동 조건을 반영한 일정은 여행 만들기에서 준비할 수 있어요.</p><a href="#/new">여행 만들기</a></section></div>';
 el.querySelectorAll('[data-discovery-filter]').forEach(b=>b.onclick=()=>{const k=b.dataset.discoveryFilter,v=b.dataset.discoveryValue;d[k]=v;if(k==='theme')hbDiscoveryLoad([k,v]);else hbDiscoveryDraw([k,v]);});
 const region=el.querySelector('#hb-discovery-region');if(region)region.onchange=e=>{d.region=e.target.value;hbDiscoveryLoad('region');};
 el.querySelectorAll('[data-discovery-open]').forEach(a=>a.onclick=e=>{e.preventDefault();hbDiscoveryOpen(a.dataset.discoveryOpen);});
 const retry=el.querySelector('#hb-discovery-retry');if(retry)retry.onclick=()=>hbDiscoveryLoad(null,true);
 el.querySelectorAll('[data-discovery-start]').forEach(b=>b.onclick=()=>{const x=courses.find(x=>x.course.id===b.dataset.discoveryStart);if(x)hbDiscoveryStartCourse(x.course,x.stops);});
 el.querySelectorAll('[data-discovery-map]').forEach(toggle=>toggle.onclick=()=>{
  const id=toggle.dataset.discoveryMap,x=courses.find(x=>x.course.id===id),host=el.querySelector('[data-discovery-map-host="'+id+'"]');if(!x||!host)return;
  const open=host.hidden;hbDiscoveryClearMap();el.querySelectorAll('[data-discovery-map-host]').forEach(n=>n.hidden=true);el.querySelectorAll('[data-discovery-map]').forEach(n=>n.setAttribute('aria-expanded','false'));
  if(open){host.hidden=false;toggle.setAttribute('aria-expanded','true');hbDiscoveryMapDispose=hbRichMapAdapter({container:host,points:x.stops,onSelect:hbDiscoveryOpen});}
 });
 el.querySelectorAll('[data-discovery-season-jump]').forEach(a=>a.onclick=e=>{e.preventDefault();const card=el.querySelector('[data-discovery-course="'+a.dataset.discoverySeasonJump+'"]');if(card){card.scrollIntoView({block:'nearest'});card.querySelector('a,button')?.focus();}});
 if(focus==='region')el.querySelector('#hb-discovery-region')?.focus();else if(focus)el.querySelector('[data-discovery-filter="'+focus[0]+'"][data-discovery-value="'+focus[1]+'"]')?.focus();
}
async function hbDiscoveryLoad(focus,force=false){
 const d=hbDiscoveryState,seq=++d.sequence,region=d.region,theme=d.theme,key=region+':'+theme;
 const cached=hbDiscoveryCache.get(key);
 if(!force&&cached&&Date.now()-cached.at<300000){d.records=cached.records;d.status='ready';d.partial=false;hbDiscoveryDraw(focus);return;}
 d.records=[];d.status='loading';d.partial=false;hbDiscoveryDraw(focus);
 const types=theme==='food'?['39']:theme==='culture'?['12','14']:theme==='all'?['12','14','39']:['12'];
 const jobs=types.map(type=>get('/api/rich-tour?'+new URLSearchParams({action:'search',mode:'area',contentTypeId:type,numOfRows:'20',pageNo:'1',...(region==='all'?{}:{areaCode:region})})).then(data=>{if(!Array.isArray(data.places))throw Error('invalid discovery response');return data.places;}));
 if(['all','1','31'].includes(region)&&['all','culture','nature'].includes(theme)){
  if(['all','1'].includes(region))jobs.push(get('/api/featured.js?lat=37.5665&lng=126.9780&region='+encodeURIComponent('서울')).then(hbDiscoveryFeaturedRows));
  if(['all','31'].includes(region))jobs.push(get('/api/featured.js?lat=37.2636&lng=127.0286&region='+encodeURIComponent('경기')).then(hbDiscoveryFeaturedRows));
 }
 const result=await Promise.allSettled(jobs);
 if(seq!==d.sequence)return;
 d.records=hbDiscoveryRecords(result.flatMap(x=>x.status==='fulfilled'?x.value:[]));
 d.partial=result.some(x=>x.status==='rejected');
 d.status=result.every(x=>x.status==='rejected')?'error':'ready';
 if(d.status==='ready'&&!d.partial){if(hbDiscoveryCache.size>=24)hbDiscoveryCache.delete(hbDiscoveryCache.keys().next().value);hbDiscoveryCache.set(key,{at:Date.now(),records:d.records});}
 if(path()==='/discover')hbDiscoveryDraw();
}
function hbDiscoveryRender(){
 if(!hbDiscoveryFiltersVisible){const d=hbDiscoveryState;d.age='all';d.sex='all';if(d.region!=='all'||d.theme!=='all'){d.region='all';d.theme='all';d.status='idle';}}
 if(hbDiscoveryState.status==='idle')hbDiscoveryLoad();else hbDiscoveryDraw();
 if(!hbDiscoveryState.audienceRequested){hbDiscoveryState.audienceRequested=true;get('/discovery-audience.json').then(data=>{hbDiscoveryState.audience=hbDiscoveryApprovedCohorts(data);if(path()==='/discover'&&hbDiscoveryState.audience.length)hbDiscoveryDraw();}).catch(()=>{});}
}
// END HB_DISCOVERY_EDITORIAL

function render(){if(typeof hbRichCleanup==='function')hbRichCleanup();const p=path();if(p!=='/discover')hbDiscoveryClearMap();if(!p.startsWith('/place/'))hbDiscoveryDetailId=null;const initialize=hbEnsureOwnerState(p);if(initialize)queueMicrotask(()=>{if(!hbIsShareReceiver(path()))load();});if(p!=='/')dropNearbyMap();if(p!=='/plan')hbDropPlanMap();if(p==='/')home();else if(p==='/new')newPlan();else if(p==='/places')browse();else if(p==='/discover')hbDiscoveryRender();else if(p.startsWith('/place/'))detail(hbDecodePlaceId(p.slice(7)));else if(p==='/plan')plan();else if(p==='/travel')travel();else if(p==='/share/create')share();else if(p.startsWith('/share/'))shared(p.slice(7));else home()}
async function get(u){
 const response=await fetch(u);
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw Error(data?.error||'서버 오류 '+response.status);
 if(!data||typeof data!=='object')throw Error('응답 자료를 읽을 수 없어요.');
 return data;
}

let hbPlacesLoadedRegion=null;
let hbPlaceRequest=0;

function hbRefreshPlacesView(){
 if(path()==='/places'||path().startsWith('/place/'))render();
 else if(path()==='/new'){
  const message=document.getElementById('hb-place-data-state');
  if(message)message.outerHTML=hbPlaceDataMessage();
 }
}

async function load(){
 const request=++hbPlaceRequest,region=s.region;
 const stillCurrent=()=>request===hbPlaceRequest&&region===s.region;
 loading=true;
 issue='';
 hbRefreshPlacesView();
 try{
  const data=await get('/api/data?type=places&region='+encodeURIComponent(region));
  if(!stillCurrent())return;
  if(!Array.isArray(data.places))throw Error('장소 목록 자료를 읽을 수 없어요.');
  const records=new Map();
  function add(place){
   if(!place||typeof place.id!=='string'||!place.id||typeof place.name!=='string'||!place.name)return;
   const previous=records.get(place.id);
   if(!previous){records.set(place.id,place);return;}
   let combined=previous;
   if(hbAccessFacts(place).length>hbAccessFacts(previous).length){
    combined={...combined,accessFacts:place.accessFacts,accessStatus:place.accessStatus,reason:place.reason||previous.reason};
   }
   // Keep a known photo flag (hasPhoto true/false) over an unknown one (HB_PHOTO_LIST_GATE).
   if(combined.hasPhoto==null&&place.hasPhoto!=null){
    combined={...combined,hasPhoto:place.hasPhoto,photoSource:place.photoSource??null,officialImage:place.officialImage??null};
   }
   if(!combined.imageUrl&&place.imageUrl){
    combined={...combined,imageUrl:place.imageUrl,imageLicense:place.imageLicense,imageSource:place.imageSource};
   }
   records.set(place.id,combined);
  }
  const catalogFile={서울:'/catalog/seoul.json',경기:'/catalog/gyeonggi.json'}[region];
  const [catalog,featured]=await Promise.all([
   catalogFile?get(catalogFile).catch(()=>[]):[],
   region==='서울'?get('/api/featured.js?lat=37.5665&lng=126.9780').catch(()=>null):null
  ]);
  if(!stillCurrent())return;
  const catalogPlaces=Array.isArray(catalog)?catalog.filter(Boolean):[];
  const catalogById=new Map(catalogPlaces.map(place=>[place.id,place]));
  window.hbCatalogImages=Object.create(null);
  for(const place of catalogPlaces){
   if(place.imageUrl)window.hbCatalogImages[String(place.id).replace(/^tour-/,'')]={imageUrl:place.imageUrl,license:place.imageLicense,source:place.imageSource};
  }
  const featuredPlaces=Array.isArray(featured?.places)?featured.places:[];
  for(const place of featuredPlaces){
   if(!place)continue;
   const linked=catalogById.get(place.id);
   add({...place,kind:place.kind||'spot',accessFacts:[],accessStatus:'unknown',
    ...(linked?{imageUrl:linked.imageUrl,imageLicense:linked.imageLicense,imageSource:linked.imageSource}:{}),
    reason:'서울 대표 관광지예요.'});
  }
  catalogPlaces.forEach(add);
  data.places.forEach(add);
  for(const place of places){
   if(Array.isArray(s.chosen)&&s.chosen.includes(place.id)&&!records.has(place.id)&&place.hbPickedRegion===region)add(place);
  }
  places=[...records.values()];
  hbPlacesLoadedRegion=region;
 }catch(error){
  if(!stillCurrent())return;
  places=[];
  issue=error.message||'장소를 불러올 수 없어요.';
  hbPlacesLoadedRegion=null;
 }finally{
  if(stillCurrent()){
   loading=false;
   hbRefreshPlacesView();
   if(path()==='/plan')hbRenderPlanMap();
   if(path()==='/travel')hbRefreshTravelConditionMap?.();
  }
 }
 if(stillCurrent())getWeather();
}
let forecast = {key:"", state:"unknown", alerts:null};
let weatherRequest = 0;
function weatherScope() {
  if (path()==='/plan' && s.stops.length && s.hbPlanInfo?.date) return {region:s.hbPlanInfo.region || s.region,date:s.hbPlanInfo.date};
  return s;
}
const currentWeatherKey = () => JSON.stringify([weatherScope().region, weatherScope().date]);
function hbWeatherTime(value) {
  return typeof value==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/.test(value)
    ? value.slice(0,16).replace('T',' ')+' KST' : '';
}
function weatherText() {
  if (forecast.key !== currentWeatherKey() || forecast.state==='loading') return '여행일 예보를 확인하고 있어요…';
  const f=forecast.data, a=forecast.alerts;
  let text;
  if(forecast.state==='error') text='날씨를 불러오지 못했어요. 출발 전에 다시 확인해 주세요.';
  else if(forecast.state==='stale') text='오래된 예보예요. 최신 정보를 다시 확인해 주세요.';
  else if(forecast.state==='no_forecast') text='선택한 날짜의 예보 제공 범위를 확인해 주세요.';
  else if(forecast.state==='available' && typeof f?.summary==='string' && f.summary.trim()){
    // 2026-11-26 사용자 지시: 안내 문구(대표 예보·지역 기준점·특보 재확인·보장 안 함·미확인 등)는 숨기고
    // 기온·강수확률·날씨 상태와 발표 시각만 남긴다. 발표 시각이 없으면 시각 표기 자체를 생략한다.
    const issued=hbWeatherTime(f.issuedAt);
    text=f.summary+(issued?' (발표 '+issued+')':'');
  }else text='선택한 날짜의 예보를 확인할 수 없어요.';
  // 실제로 발효 중인 특보는 정보이므로 종류·지역·발효 시각을 그대로 보여 준다(재검토·확인 필요 같은 안내만 뺀다).
  if(a?.status==='active' && Array.isArray(a.active) && a.active.length){
    const hazards=a.active.map(x=>String(x.hazard??'')+String(x.severity??'')+(x.areaName?'('+x.areaName+')':'')).join(', ');
    const effective=hbWeatherTime(a.effectiveAt);
    text+=' · 발효 중인 특보: '+hazards+(effective?' / 발효 '+effective:'');
  }
  return text;
}
// Illustration state is derived only from the same scoped, available forecast DTO.
function hbWeatherArtKind(){
 if(forecast.key!==currentWeatherKey()||forecast.state!=='available')return 'weather';
 const f=forecast.data;
 if(!f||typeof f.summary!=='string'||!f.summary.trim())return 'weather';
 if(f.precipitationType==='눈')return 'snow';
 if(['비','비 또는 눈','소나기'].includes(f.precipitationType))return 'rain';
 if(/(?:^| · )맑음(?:$| · )/.test(f.summary))return 'sunny';
 if(/구름많음|흐림/.test(f.summary))return 'cloudy';
 return 'weather';
}
function hbWeatherRecommendation(snapshot,key){
  if(!snapshot||snapshot.key!==key)return {kind:'unknown',message:'여행일 예보를 확인한 뒤 날씨에 맞는 선택지를 보여드려요.'};
  const a=snapshot.alerts;
  if(a?.status==='active'&&Array.isArray(a.active)&&a.active.length)
    return {kind:'caution',message:'기상특보가 확인됐어요. 날짜 변경이나 이동을 줄인 코스를 먼저 검토해 주세요.'};
  if(snapshot.state!=='available')return {kind:'unknown',message:'확인된 여행일 예보가 없어 날씨 기반 추천을 보류해요. 일반 여행지 탐색은 계속할 수 있어요.'};
  const f=snapshot.data||{};
  const R=HB_WEATHER_SUGGEST_RULE;
  const precipitation=R.wetTypes.includes(f.precipitationType);
  const probability=typeof f.precipitationProbabilityPercent==='number'&&f.precipitationProbabilityPercent>=R.wetProbabilityPercent&&f.precipitationProbabilityPercent<=100;
  const temperature=typeof f.temperatureC==='number'&&Number.isFinite(f.temperatureC)?f.temperatureC:null;
  const hourlyBurden=Array.isArray(f.hourly)&&f.hourly.some(v=>R.wetTypes.includes(v.precipitationType)||
    typeof v.precipitationProbabilityPercent==='number'&&v.precipitationProbabilityPercent>=R.wetProbabilityPercent&&v.precipitationProbabilityPercent<=100||
    typeof v.temperatureC==='number'&&(v.temperatureC>=R.hotTemperatureC||v.temperatureC<=R.coldTemperatureC));
  if(precipitation||probability||temperature!==null&&(temperature>=R.hotTemperatureC||temperature<=R.coldTemperatureC)||hourlyBurden){
    return {kind:'adverse',message:'여행일 예보의 일부 시간대에 강수 또는 기온 부담 신호가 있어요. '+(HB_WEATHER_CATEGORY_COMPARE_ENABLED?'문화시설 후보, 휴식이 포함된 짧은 코스, 날짜 변경을 비교해 보세요.':'휴식이 포함된 짧은 코스나 날짜 변경을 검토해 보세요.')};
  }
  // 2026-11-26 사용자 지시: '대표 예보를 참고했어요 · 보장하지 않아요' 안내는 숨긴다(비교 화면을 켤 때만 비교 안내).
  return {kind:'regular',message:HB_WEATHER_CATEGORY_COMPARE_ENABLED?'일반 여행지와 문화시설 후보를 비교할 수 있어요.':''};
}
// 2026-11-26 사용자 결정: 의도(날씨 기반 일정·여행지 제안)와 다른 화면 진입을 끈다. 모듈·바인딩은 보존하며 true로 되돌릴 수 있다.
const HB_WEATHER_CATEGORY_COMPARE_ENABLED=false; // '문화시설 후보 보기'·'전체 후보 비교'
const HB_WEATHER_TIME_COMPARE_ENABLED=false; // '시간대별 날씨와 일정 비교'
// BEGIN HB_WEATHER_SUGGEST_SIGNAL
// 날씨 기반 여행지·일정 제안의 판단 기준값을 이 한 곳에 모은다 (hbWeatherRecommendation도 같은 값을 쓴다).
// 임시 기준 (2026-11-26): 함께봄 제품 판단용 잠정값이며 기상청 공식 기준이나 안전 기준이 아니다.
// 실사용 피드백·QA 후 조정한다. 값을 바꾸면 tests/weather_suggestions.test.cjs 경계 시험도 함께 고친다.
const HB_WEATHER_SUGGEST_RULE=Object.freeze({
 wetProbabilityPercent:60,   // 시간대 강수확률이 이 값 이상이면 강수 시간대로 본다
 dryProbabilityPercent:30,   // '맑고 온화' 판단은 모든 시간대 강수확률이 이 값 이하일 때만
 hotTemperatureC:30,         // 이 값 이상이면 더위 부담 시간대
 coldTemperatureC:-5,        // 이 값 이하이면 추위 부담 시간대
 mildMinTemperatureC:10,     // '맑고 온화' 기온 하한 (모든 시간대)
 mildMaxTemperatureC:27,     // '맑고 온화' 기온 상한 (모든 시간대)
 wetTypes:Object.freeze(['비','비 또는 눈','눈','소나기']),
 defaultWindow:Object.freeze({start:'09:00',end:'18:00'}), // 여행 시간이 없을 때 장소 순서 판단에 쓰는 시간대
 maxReorderStops:6           // 순서 제안에서 함께 비교하는 관광지 수 상한 (6! = 720가지)
});
function hbWeatherBand(minute){return minute<360?'새벽':minute<720?'오전':minute<1080?'오후':'저녁'}
function hbWeatherClockMinute(value){
 const m=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value||''));
 return m?Number(m[1])*60+Number(m[2]):null;
}
/** Forecast/alert snapshot -> one suggestion signal. mode: adverse | pleasant | neutral | none.
 * 'none' means no weather-based change (pending, out of range, error, stale). Never a safety claim. */
function hbWeatherSignal(snapshot,key,window={}){
 const R=HB_WEATHER_SUGGEST_RULE;
 const result=(mode,reason,extra={})=>{
  const out={mode,reason,label:'',source:'',hours:new Map(),hazards:[],...extra};
  out.fingerprint=[out.mode,out.reason,out.label,out.source].join('|');
  return out;
 };
 if(!snapshot||snapshot.key!==key)return result('none','pending');
 let date='';try{date=String(JSON.parse(key)[1]||'')}catch{date=''}
 const clock=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)?v.slice(11,16):'';
 const a=snapshot.alerts;
 const hazards=a?.status==='active'&&Array.isArray(a.active)?[...new Set(a.active.map(x=>String(x?.hazard||'')+String(x?.severity||'')).filter(x=>x.trim()))]:[];
 const f=snapshot.state==='available'&&snapshot.data&&typeof snapshot.data==='object'?snapshot.data:null;
 if(!hazards.length&&!f)return result('none',snapshot.state==='no_forecast'?'out_of_range':snapshot.state==='loading'?'pending':'unavailable');
 const hours=new Map();
 for(const v of f&&Array.isArray(f.hourly)?f.hourly:[]){
  if(typeof v?.at!=='string'||(date&&!v.at.startsWith(date+'T'))||!/T(?:[01]\d|2[0-3]):00:00\+09:00$/.test(v.at))continue;
  const pop=v.precipitationProbabilityPercent,temp=v.temperatureC,wetType=R.wetTypes.includes(v.precipitationType);
  if(!Number.isFinite(pop)||pop<0||pop>100||!Number.isFinite(temp)||(!wetType&&v.precipitationType!=='없음'))continue;
  const minute=Number(v.at.slice(11,13))*60;
  hours.set(minute,{minute,pop,temp,type:v.precipitationType,wet:wetType||pop>=R.wetProbabilityPercent,hot:temp>=R.hotTemperatureC,cold:temp<=R.coldTemperatureC});
 }
 const start=hbWeatherClockMinute(window?.start)??hbWeatherClockMinute(R.defaultWindow.start);
 let end=hbWeatherClockMinute(window?.end)??hbWeatherClockMinute(R.defaultWindow.end);
 if(end<=start)end=Math.min(1440,start+540);
 const inWindow=[...hours.values()].filter(h=>h.minute+60>start&&h.minute<end);
 let slots=inWindow.length?inWindow:[...hours.values()];
 if(!slots.length&&f){
  // Representative value only (no hourly slots): never invented as an hourly series.
  const pop=f.precipitationProbabilityPercent,temp=f.temperatureC,wetType=R.wetTypes.includes(f.precipitationType);
  const p=Number.isFinite(pop)&&pop>=0&&pop<=100?pop:null,t=Number.isFinite(temp)?temp:null;
  if(p!==null||t!==null||wetType)slots=[{minute:null,pop:p,temp:t,type:f.precipitationType,wet:wetType||p!==null&&p>=R.wetProbabilityPercent,
   hot:t!==null&&t>=R.hotTemperatureC,cold:t!==null&&t<=R.coldTemperatureC,representative:true}];
 }
 const reasons=[];
 if(hazards.length)reasons.push(hazards.slice(0,2).join('·')+' 발효');
 const wet=slots.filter(h=>h.wet),hot=slots.filter(h=>h.hot),cold=slots.filter(h=>h.cold);
 if(wet.length){
  const peak=wet.reduce((m,h)=>(h.pop??-1)>(m.pop??-1)?h:m,wet[0]);
  const type=wet.find(h=>R.wetTypes.includes(h.type))?.type;
  const detail=peak.pop===null?'':'('+(peak.minute===null?'':hbWeatherBand(peak.minute)+' ')+'강수확률 '+peak.pop+'%)';
  reasons.push((type||'강수')+' 예보'+detail);
 }
 if(hot.length)reasons.push('더위 부담(최고 '+Math.max(...hot.map(h=>h.temp))+'℃)');
 if(cold.length)reasons.push('추위 부담(최저 '+Math.min(...cold.map(h=>h.temp))+'℃)');
 const forecastSource=f?('기상청 단기예보'+(clock(f.issuedAt)?' · '+clock(f.issuedAt)+' 발표':'')):'';
 const alertSource=hazards.length?'기상청 기상특보'+(clock(a.effectiveAt)?' · '+clock(a.effectiveAt)+' 발효':''):'';
 if(reasons.length)return result('adverse','weather_burden',{label:reasons.slice(0,2).join(' · '),
  source:[alertSource,wet.length||hot.length||cold.length?forecastSource:''].filter(Boolean).join(' · ')||forecastSource,hours,hazards});
 const hourly=slots.filter(h=>!h.representative);
 if(hourly.length&&hourly.every(h=>h.pop<=R.dryProbabilityPercent&&h.temp>=R.mildMinTemperatureC&&h.temp<=R.mildMaxTemperatureC)){
  const lo=Math.min(...hourly.map(h=>h.temp)),hi=Math.max(...hourly.map(h=>h.temp)),pop=Math.max(...hourly.map(h=>h.pop));
  return result('pleasant','mild_dry',{label:(f.summary==='맑음'?'맑고 온화한 날씨':'비 소식 없는 온화한 날씨')+'(강수확률 '+pop+'% 이하 · '+(lo===hi?lo:lo+'~'+hi)+'℃)',source:forecastSource,hours});
 }
 return result('neutral','no_burden',{source:forecastSource,hours});
}
/** After a forecast update, redraw only views whose weather suggestion actually changes. */
function hbWeatherSuggestRefresh(){
 const at=path();
 if(at==='/places'&&typeof hbWeatherBrowseNeedsRefresh==='function'&&hbWeatherBrowseNeedsRefresh())browse();
 else if(at==='/plan'&&typeof hbPlanWeatherRefresh==='function')hbPlanWeatherRefresh();
}
// END HB_WEATHER_SUGGEST_SIGNAL
function hbWeatherOptionsMarkup(){
 const rec=hbWeatherRecommendation(forecast,currentWeatherKey());
 const browsing=path()==='/places';
 const actions=browsing&&['adverse','caution','regular'].includes(rec.kind)&&(HB_WEATHER_CATEGORY_COMPARE_ENABLED||rec.kind!=='regular')?
  '<div class="actions">'+(HB_WEATHER_CATEGORY_COMPARE_ENABLED?'<button type="button" class="light" id="hb-weather-culture">문화시설 후보 보기</button><button type="button" class="light" id="hb-weather-all">전체 후보 비교</button>':'')+
  (rec.kind==='regular'?'':'<button type="button" class="light" id="hb-weather-short">짧은 코스 제안 보기</button><button type="button" class="light" id="hb-weather-date">날짜 다시 선택</button>')+'</div><div id="hb-weather-option-result" role="status"></div>':'';
 const timeOption=HB_WEATHER_TIME_COMPARE_ENABLED&&browsing&&rec.kind!=='caution'&&forecast.key===currentWeatherKey()&&forecast.state==='available'&&Array.isArray(forecast.data?.hourly)&&forecast.data.hourly.length?
    '<button type="button" class="light" id="hb-weather-times">시간대별 날씨와 일정 비교</button><div id="hb-weather-time-result" role="status"></div>':'';
 return (rec.message?'<p>'+safe(rec.message)+'</p>':'')+actions+timeOption;
}
function hbBindWeatherOptions(){
 const node=document.querySelector?.('[data-hb-weather-options]');
 if(!node)return;
 const bind=(id,fn)=>{const button=document.getElementById(id);if(button)button.onclick=fn;};
 const choose=filter=>{s.hbBrowseFilter=filter;s.hbBrowseQuery='';s.hbBrowseLimit=30;save();browse();document.getElementById('hb-place-search')?.focus();};
 bind('hb-weather-culture',()=>choose('culture'));
 bind('hb-weather-all',()=>choose('all'));
 bind('hb-weather-date',()=>{const field=document.getElementById('date');field?.focus();field?.scrollIntoView?.({block:'center'});});
 bind('hb-weather-times',()=>{
  const output=document.getElementById('hb-weather-time-result');
  if(!output)return;
  const ids=hbUniquePlaceIds(s.chosen),key=currentWeatherKey(),snapshot=forecast;
  const opt={start:s.hbPlanStart,end:s.hbPlanEnd,restIntervalMinutes:s.hbRestIntervalMinutes,tripType:s.hbDuration||'day'};
  if(!ids.length){output.textContent='먼저 여행지를 담아 주세요. 선택한 장소로 시간대별 초안을 비교할 수 있어요.';return;}
  const candidates=hbWeatherTimeCandidates(ids,places,opt,snapshot,key);
  if(!candidates.length){output.textContent='선택 조건의 전체 시간대를 확인할 수 있는 예보가 부족해요. 기존 시간표나 선택은 변경하지 않았어요.';return;}
  output.innerHTML='<p>지역 기준점 예보를 비교한 임시 시간표예요. 실제 출발지·영업시간·장소별 날씨 및 도로 상황은 확인 전이에요.</p>'+
   candidates.map((c,i)=>'<section class="panel"><strong>'+safe(c.start)+' ~ '+safe(c.end)+'</strong><p>강수 신호 '+safe(c.wetHours)+'시간대 · 최고 강수확률 '+safe(c.maxPop)+'% · 기온 부담 '+safe(c.temperatureBurdenHours)+'시간대</p><ol>'+c.draft.stops.map(stop=>'<li>'+safe(stop.time)+' · '+safe(stop.name)+'</li>').join('')+'</ol><button type="button" class="light" id="hb-weather-time-'+i+'">이 시작 시간 선택</button></section>').join('');
  candidates.forEach((c,i)=>bind('hb-weather-time-'+i,()=>{
   if(key!==currentWeatherKey()||snapshot!==forecast||JSON.stringify(ids)!==JSON.stringify(hbUniquePlaceIds(s.chosen))||
     opt.start!==s.hbPlanStart||opt.end!==s.hbPlanEnd||opt.restIntervalMinutes!==s.hbRestIntervalMinutes||opt.tripType!==(s.hbDuration||'day')){
    output.textContent='여행 조건이나 날씨 정보가 변경됐어요. 다시 비교해 주세요.';return;
   }
   const prior=s.hbPlanStart;s.hbPlanStart=c.start;
   try{save()}catch{s.hbPlanStart=prior;output.textContent='저장하지 못했어요. 기존 선택을 유지해요.';return;}
   browse();
  }));
 });
 bind('hb-weather-short',()=>{
  const output=document.getElementById('hb-weather-option-result');
  if(!output)return;
  const ids=hbUniquePlaceIds(s.chosen);
  const must=new Set(hbUniquePlaceIds(s.hbMustVisitIds));
  const selected=ids.map(id=>places.find(p=>p.id===id));
  const sights=selected.filter(p=>p&&p.kind!=='food');
  if(selected.some(p=>!p)||sights.length<2){
   output.textContent='문화시설이나 관광지 한 곳과 식사·휴식을 중심으로 담아보세요. 두 곳 이상 담으면 줄인 코스를 비교할 수 있어요.';return;
  }
  if(sights.filter(p=>must.has(p.id)).length>1){output.textContent='필수 방문지가 여러 곳 있어 자동 축소하지 않아요. 필수 일정은 그대로 유지해 주세요.';return;}
  const keep=sights.find(p=>must.has(p.id))||sights.find(p=>p.kind==='culture')||sights[0];
  const candidate=ids.filter(id=>id===keep.id||must.has(id)||places.find(p=>p.id===id)?.kind==='food');
  const draft=hbCreateSchedule(candidate,places,{start:s.hbPlanStart,end:s.hbPlanEnd,restIntervalMinutes:s.hbRestIntervalMinutes});
  if(draft.errors.length){output.textContent=draft.errors.join(' ');return;}
  const list=draft.stops.map(stop=>'<li>'+safe(stop.time)+' · '+safe(stop.name)+'</li>').join('');
  output.innerHTML='<p>선택한 장소 중 '+safe(keep.name)+' 중심의 짧은 초안이에요.</p><ol>'+list+'</ol><button type="button" class="light" id="hb-weather-apply-short">이 장소 선택으로 변경</button>';
  document.getElementById('hb-weather-apply-short').onclick=()=>{
   if(JSON.stringify(hbUniquePlaceIds(s.chosen))!==JSON.stringify(ids)||hbUniquePlaceIds(s.hbMustVisitIds).some(id=>!candidate.includes(id))){output.textContent='선택 조건이 변경됐어요. 다시 비교해 주세요.';return;}
   const previous=s.chosen;s.chosen=candidate;
   try{save()}catch{s.chosen=previous;output.textContent='저장하지 못했어요. 원래 선택을 유지해요.';return;}
   browse();
  };
 });
}
function weatherCard() {
  if (forecast.key !== currentWeatherKey()) queueMicrotask(() => {
    if (document.querySelector('[data-hb-weather]') && forecast.key !== currentWeatherKey()) getWeather();
  });
  queueMicrotask(()=>hbBindWeatherOptions());
  return '<section class="panel hb-weather-card"><h2>여행일 날씨 · 자동 조회</h2><p data-hb-weather role="status" data-hb-weather-art="'+hbWeatherArtKind()+'">'
    + safe(weatherText()) + '</p><p class="muted">출처: 기상청</p><div data-hb-weather-options>'+hbWeatherOptionsMarkup()+'</div></section>';
}
async function getWeather() {
  const key=currentWeatherKey(), id=++weatherRequest;
  const update=value=>{
    if(id!==weatherRequest)return;
    forecast={...forecast,key,...value};
    if(key===currentWeatherKey()){
     document.querySelectorAll('[data-hb-weather]').forEach(node=>{node.textContent=weatherText();node.setAttribute?.('data-hb-weather-art',hbWeatherArtKind());});
     const options=document.querySelector?.('[data-hb-weather-options]');
     if(options){options.innerHTML=hbWeatherOptionsMarkup();hbBindWeatherOptions();}
     hbWeatherSuggestRefresh();
    }
  };
  const {region,date}=weatherScope();
  if(!date||typeof hbTravelDateError==='function'&&hbTravelDateError(date)){update({state:'unknown',data:null,alerts:null});return;}
  update({state:'loading',data:null,alerts:null});
  const f=new URLSearchParams({type:'weather',region,date});
  const a=new URLSearchParams({type:'alerts',region,date});
  await Promise.allSettled([
    get('/api/data?'+f).then(data=>update({state:['available','stale','no_forecast'].includes(data.status)?data.status:'unknown',data})).catch(()=>update({state:'error',data:null})),
    get('/api/weather?'+a).then(alerts=>update({alerts})).catch(()=>update({alerts:{status:'error'}}))
  ]);
}

async function hbTravelRequest(url,input){
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(18000)});
  if(!response.ok)throw Error('Travel API unavailable');
  return response.json();
}
