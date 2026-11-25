/* HAMKKEBOM original vector illustration library: Butter & Rose / Black.
 * No external images, fonts, network, or user-controlled SVG markup.
 * Decorative only: existing Korean labels, event handlers and safety evidence remain authoritative.
 * No mascot or brand character. Generic facility diagrams are not actual site plans. */
(function(root){
'use strict';
const B='#FFD66B',R='#EFA6BA',W='#FFFFFF',I='#191F28',N='#E5E8EB',G='#F2F4F6';
const circle=(x,y,r,f,stroke='none')=>'<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="'+f+'" stroke="'+stroke+'"/>';
const rect=(x,y,w,h,rx,f,stroke='none')=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+rx+'" fill="'+f+'" stroke="'+stroke+'"/>';
const path=(d,f='none',stroke=I,sw=2)=>'<path d="'+d+'" fill="'+f+'" stroke="'+stroke+'" stroke-width="'+sw+'" stroke-linecap="round" stroke-linejoin="round"/>';
const ell=(x,y,rx,ry,f)=>'<ellipse cx="'+x+'" cy="'+y+'" rx="'+rx+'" ry="'+ry+'" fill="'+f+'"/>';
const rays=(x,y)=>[0,45,90,135,180,225,270,315].map(a=>'<path d="M'+x+' '+(y-34)+'v8" stroke="'+B+'" stroke-width="4" stroke-linecap="round" transform="rotate('+a+' '+x+' '+y+')"/>').join('');
const flower=(x,y)=>[0,72,144,216,288].map(a=>'<ellipse cx="'+x+'" cy="'+(y-17)+'" rx="11" ry="18" fill="'+W+'" transform="rotate('+a+' '+x+' '+y+')"/>').join('')+circle(x,y,10,B);
const cloud=path('M27 69Q10 69 13 52Q15 40 30 40Q35 16 56 25Q72 21 83 42Q108 43 106 58Q104 69 87 69Z',W,I,1.8);
const map=path('M10 29L42 15 78 30 110 15V85L78 99 42 85 10 99Z',W,I,1.6)+path('M42 15V85M78 30V99','none',N,2)+path('M20 78L39 52 58 67 98 46','none',R,4)+path('M63 68C44 48 41 41 41 32A22 22 0 0 1 85 32C85 43 80 49 63 68Z',R,I,1.5)+circle(63,32,8,W);
const calendar=rect(25,10,70,85,9,R)+rect(17,6,70,85,9,W,I)+rect(17,6,70,21,7,B)+path('M34 4V17M70 4V17','none',I,3)+[38,54,70].map(y=>rect(28,y,11,11,3,R)+path('M30 '+(y+5)+'l3 3 5-6','none',I,1.6)+rect(45,y+4,29,4,2,N)).join('');
const seat=rect(23,43,74,14,5,B,I)+rect(23,61,74,11,4,R,I)+path('M32 58V88M88 58V88','none',I,4);
const car=rect(12,55,96,28,12,B,I)+path('M27 55L39 35Q42 29 51 29H76Q84 29 91 42L99 55Z',B,I)+path('M37 51L47 36H58V51ZM65 36H77L88 51H65Z',W,'none')+circle(32,83,10,I)+circle(32,83,4,W)+circle(88,83,10,I)+circle(88,83,4,W)+rect(16,63,9,7,2,W)+rect(96,63,8,7,2,R);
const stairs=path('M10 92H39V71H64V50H89V29H110V92Z',B,I)+path('M24 63L100 11M39 54V71M64 37V50M89 20V29','none',I,2.5);
const ramp=path('M10 91L110 38V91Z',R,I)+path('M12 66L110 12M35 55V78M68 37V61M100 19V43','none',I,2.5);
const bowl=ell(60,88,43,7,B)+path('M17 49H103Q97 86 60 86Q23 86 17 49Z',R,I)+ell(60,49,43,12,W)+path('M42 40L80 10M48 42L88 11','none',I,3)+path('M29 47Q47 37 63 49T91 47','none',B,6);
const cup=ell(56,86,41,8,R)+path('M24 36H81V64Q81 82 53 82Q24 82 24 64Z',W,I)+path('M81 42H91Q107 54 91 65H81','none',I,3)+ell(52,36,28,7,B)+path('M40 25Q30 14 42 6M60 25Q50 14 62 6','none',R,4);
const heritage=path('M11 37L60 9 109 37Z',R,I,1.5)+rect(17,37,86,10,2,B)+[23,52,81].map(x=>rect(x,47,16,34,2,W,I)).join('')+rect(13,81,94,11,3,B,I);
const envelope=rect(12,30,94,63,7,W,I)+path('M13 35L59 68 105 35',R,I)+path('M14 90L45 57M105 90L74 57','none',I,1.5)+path('M87 39C63 23 77 9 89 21C103 8 116 25 98 40L89 48Z',R,I,1.5);
const walk=path('M27 29Q40 22 43 36L48 57 60 67Q70 82 55 87H31Q18 87 20 75L25 57Z',B,I)+path('M75 13Q88 8 91 22L96 42 108 53Q116 67 101 71H77Q64 71 66 59L71 40Z',R,I)+path('M31 58h14M31 66h19M77 41h14M77 49h18','none',I,1.6);
const face=(level)=>circle(60,52,36,level==='high'?G:level==='mid'?R:B)+circle(47,45,3,I)+circle(73,45,3,I)+ell(36,57,7,4,R)+ell(84,57,7,4,R)+path(level==='low'?'M47 58Q60 75 73 58':level==='mid'?'M49 63Q60 67 71 63':'M49 67Q60 56 71 67','none',I,3);
const art=Object.freeze({
 landscape:circle(88,22,20,B)+path('M3 78Q28 27 60 76Q89 42 117 78V104H3Z',R,'none')+path('M3 87Q28 61 60 87T117 83V104H3Z',B,'none')+path('M39 103V50','none',W,4)+flower(39,50),
 car:car, calendar:calendar, complete:calendar+circle(94,83,19,B,W)+path('M85 83l6 6 11-13','none',I,3),
 map:map, search:map+circle(96,83,17,B,I)+path('M108 95l10 10','none',I,5),
 share:envelope, rest:seat+circle(16,21,14,B)+path('M16 35V84','none',I,3),
 walk:walk, stairs:stairs, ramp:ramp, parking:rect(6,12,47,86,5,W,I)+path('M18 24v22M18 24h13q11 0 11 9t-11 9h-13','none',I,3)+rect(17,58,27,32,6,B,I)+path('M56 74h25','none',I,2)+rect(85,29,30,60,4,R,I)+rect(94,52,12,37,2,W,I),
 elevator:rect(27,8,66,88,5,R,I)+rect(35,27,50,69,3,W,I)+path('M60 27V96M48 23V13M44 17l4-4 4 4M72 13v10M68 19l4 4 4-4','none',I,2),
 wheelchair:circle(61,73,24,R,I)+circle(61,73,15,W,I)+circle(46,15,10,B,I)+path('M46 29L49 53H78L94 81H110M49 45H76','none',I,5),
 toilet:rect(37,10,31,39,5,W,I)+rect(32,39,55,12,5,R,I)+path('M32 51H87Q82 79 62 79V91H79V98H37V91H50V75Q32 67 32 51Z',W,I,2)+circle(56,24,4,B),
 food:bowl, coffee:cup, culture:heritage, nature:circle(86,24,17,B)+path('M5 87L38 27 77 87Z',R,'none')+path('M37 27L25 50 37 44 50 50Z',W,'none')+path('M55 87L89 47 115 87Z',B,'none'),
 garden:circle(60,54,41,R)+flower(60,54), sea:circle(60,39,28,B)+path('M5 63Q18 50 32 63T59 63T86 63T115 63V96H5Z',R,'none')+path('M5 78Q18 66 32 78T59 78T86 78T115 78','none',W,3),
 sunny:rays(60,52)+circle(60,52,25,B), cloudy:circle(79,28,20,B)+cloud, rain:cloud+[27,52,77,100].map(x=>path('M'+x+' 78l-7 12','none',R,4)).join(''), snow:cloud+[27,52,77,100].map(x=>circle(x,86,4,R)).join(''),
 weather:cloud+path('M52 82h16','none',I,3), error:circle(60,51,36,G)+path('M42 39l36 24M78 39L42 63','none',I,4)+path('M26 15l8 8M94 15l-8 8','none',R,4),
 'face-low':face('low'),'face-mid':face('mid'),'face-high':face('high'),
 route:map+path('M12 92L37 72 65 91 107 68','none',I,3),
 luggage:rect(30,30,60,63,9,B,I)+path('M47 30V17H73V30M45 38v45M75 38v45','none',I,3)+circle(42,98,5,I)+circle(78,98,5,I),
 cane:path('M53 96L65 29Q68 12 82 15Q94 18 91 29','none',I,6)+circle(60,56,24,B)+path('M53 96L65 29Q68 12 82 15Q94 18 91 29','none',I,6),
 walker:path('M31 94L41 21H80L91 94M38 42H83M35 70H87','none',I,5)+rect(39,36,45,10,4,R)+circle(31,95,6,B,I)+circle(91,95,6,B,I),
 family:circle(42,27,12,B,I)+circle(78,27,12,R,I)+path('M15 81Q15 45 42 45Q58 45 60 61Q63 45 78 45Q105 45 105 81Z',W,I)+path('M60 68C43 56 49 46 60 53C71 46 77 56 60 68Z',R,'none'),
 album:rect(18,17,76,73,8,R,I)+rect(27,26,58,49,4,W)+circle(70,37,8,B)+path('M27 65L44 43 61 65 73 50 85 66V75H27Z',B,'none')+path('M94 21l13 4v70H33','none',I,2),
 location:map, warning: path('M60 11L112 93H8Z',B,I,2)+path('M60 37V62','none',I,5)+circle(60,76,3,I)
});
const own=(obj,k)=>Object.prototype.hasOwnProperty.call(obj,k);
const names=Object.keys(art);
function svg(name){return own(art,name)?'<svg class="hb-illustration" data-hb-art="'+name+'" viewBox="0 0 120 110" width="120" height="110" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">'+art[name]+'</svg>':'';}
function choice(group,value){
 const groups={walk:{'5':'rest','10':'walk','15':'walk','20':'walk','30':'walk'},stairs:{possible:'stairs',avoid:'ramp',impossible:'stairs'},interest:{all:'map',spot:'culture',food:'food'},need:{toilet:'toilet',rest:'rest',dropoff:'parking',elevator:'elevator',wheelchair:'wheelchair'},food:{less_spicy:'food',easy_to_chew:'food',vegetarian:'nature'},fatigue:{low:'face-low',mid:'face-mid',high:'face-high'}};
 return own(groups,group)&&own(groups[group],value)?groups[group][value]:'';
}
function stopArt(kind){return ({food:'food',rest:'coffee',spot:'culture',travel:'car',move:'car',transport:'car'})[kind]||'map';}
function facilityArt(label){return /엘리베이터|승강기/.test(label)?'elevator':/휠체어/.test(label)?'wheelchair':/화장실/.test(label)?'toilet':/주차|하차/.test(label)?'parking':/계단|단차/.test(label)?'stairs':/경사/.test(label)?'ramp':/휴식|의자/.test(label)?'rest':/입구|출입/.test(label)?'map':'';}
const api={names,svg,choice,stopArt,facilityArt};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(!root||!root.document)return;
const doc=root.document,app=doc.getElementById('app');if(!app)return;
function put(node,name,mode='mini'){
 if(!node||!own(art,name))return;
 const existing=node.querySelector(':scope > .hb-art-slot');
 if(existing&&existing.dataset.artName===name&&existing.dataset.artMode===mode)return;
 if(existing)existing.remove();
 const span=doc.createElement('span');span.className='hb-art-slot hb-art-'+mode;span.dataset.artName=name;span.dataset.artMode=mode;span.setAttribute('aria-hidden','true');
 span.innerHTML=svg(name);node.prepend(span);
}
function headingArt(selector,name,mode='spot'){app.querySelectorAll(selector).forEach(node=>put(node,name,mode));}
function exactHeading(label,name,mode='spot'){
 app.querySelectorAll('h1,h2,h3').forEach(h=>{if(h.textContent.trim()===label)put(h,name,mode);});
}
function refresh(){
 const hero=app.querySelector('.hb-landing-hero');
 if(hero){put(hero,'landscape','hero');const benefits=hero.querySelectorAll('.hb-benefit');['walk','stairs','toilet','sunny'].forEach((name,i)=>put(benefits[i],name,'feature'));const how=app.querySelectorAll('.hb-how-grid > div');['search','calendar','rest'].forEach((name,i)=>put(how[i],name,'feature'));}
 for(const group of ['walk','stairs','interest','need','food','fatigue']){
  app.querySelectorAll('[data-hb-'+group+']').forEach(button=>{const name=choice(group,button.getAttribute('data-hb-'+group));if(name)put(button,name,'choice');});
 }
 exactHeading('1. 여행 정보','calendar');exactHeading('2. 이동 조건','car');exactHeading('3. 선호사항','nature');
 const fields={'hb-duration':'luggage','hb-transport':'car','hb-party':'family','hb-slope-pref':'ramp','hb-rest-interval':'rest','hb-indoor-pref':'culture'};
 for(const [id,name] of Object.entries(fields)){put(app.querySelector('label[for="'+id+'"]'),name,'label');}
 const aid=app.querySelector('#hb-mobility-aid');
 if(aid){put(app.querySelector('label[for="hb-mobility-aid"]'),({cane:'cane',walker:'walker',wheelchair:'wheelchair'})[aid.value]||'walk','label');if(!aid.dataset.hbArtBound){aid.dataset.hbArtBound='1';aid.addEventListener('change',refresh);}}
 exactHeading('검색 결과 0건','search');exactHeading('일정이 비어 있어요','calendar');
 exactHeading('장소를 찾지 못했어요','search');exactHeading('장소 정보를 가져오지 못했어요','error');exactHeading('장소 상세 정보','search');
 exactHeading('도착 안내','parking','mini');exactHeading('장애인 화장실','toilet','mini');
 app.querySelectorAll('.hb-evidence-head strong').forEach(node=>{const name=facilityArt(node.textContent.trim());if(name)put(node,name,'label');});
 app.querySelectorAll('.hb-recommend-card .chip').forEach(node=>put(node,/식당/.test(node.textContent)?'food':'culture','label'));
 app.querySelectorAll('.hb-itinerary-row[data-hb-stop-kind] h3').forEach(node=>put(node,stopArt(node.closest('.hb-itinerary-row').dataset.hbStopKind),'timeline'));
 exactHeading('하루 여행 일정 자동 구성','calendar','mini');exactHeading('자동차 이동시간 반영 미리보기','route','mini');
 exactHeading('다음 일정','car');exactHeading('다음 일정 없음','calendar');exactHeading('여행 일정을 모두 마쳤어요','album');exactHeading('변경안 미리보기','route','mini');
 exactHeading('가족에게 일정 공유','share');headingArt('#hb-share-heading','share');exactHeading('공유 링크를 열 수 없어요','error');
 headingArt('#hb-share-receiver .hb-share-stop strong','map','label');
 const copied=app.querySelector('#hb-share-copy-status');if(copied&&copied.textContent.trim()==='링크를 복사했어요.')put(copied,'complete','mini');
 const forecast=app.querySelector('[data-hb-weather]');if(forecast){const name=forecast.dataset.hbWeatherArt||'weather';put(forecast.closest('.hb-weather-card')?.querySelector('h2'),own(art,name)?name:'weather','mini');}
 const retry=app.querySelector('#hb-map-retry');if(retry)put(retry.parentElement.querySelector('[role="status"]'),'error','mini');
}
let queued=false;function schedule(){if(queued)return;queued=true;root.queueMicrotask(()=>{queued=false;refresh();});}
new MutationObserver(schedule).observe(app,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['data-hb-weather-art']});
refresh();
})(typeof window==='undefined'?null:window);
