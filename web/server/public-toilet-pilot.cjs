'use strict';
// Curated, rights-checked facility POIs only; not a full municipal dataset.
// 서울특별시 「서울시 공중화장실 위치정보」 (OA-22586), 공공누리 제1유형.
// Original nationwide ZIP row date is not the municipal dataset update date.
const SOURCE = 'https://data.seoul.go.kr/dataList/OA-22586/S/1/datasetView.do';
const IDENTITY = 'https://www.geumcheon.go.kr/portal/contents.do?key=551';
const LICENSE = 'KOGL-1';
const UPDATED = '2026-11-18';
const CHECKED = '2026-11-25';
const rows = [
  ['202031700000100053','290056','독산1동 주민센터','서울특별시 금천구 시흥대로123길 11',37.47021904,126.89704375,'scheduled_reported','09:00~18:00','reported_present','서울시 자료에 여자 장애인 화장실 표기; 2020년 전국 자료와 성별 표기 상충. 수량·접근 경로 미확인.'],
  ['202031700000100088','290044','동광석유㈜ 구광주유소','서울특별시 금천구 서부샛길 674',37.48200921,126.87518826,'unknown','05:00~10:30','unknown','서울시 자료에 장애인 화장실 현황 미기재. 민간 개방 조건은 방문 전 확인.'],
  ['202031700000100090','290060','대득에너지(금천셀프주유소)','서울특별시 금천구 시흥대로 81',37.44131141,126.90309824,'always_reported','24시간','unknown','서울시 자료에 장애인 화장실 현황 미기재. 민간 개방 조건은 방문 전 확인.'],
].map(([source_id,sourceRecordId,name,address,lat,lng,opening_status,opening_hours_raw,status,note]) => ({
  source_id,name,address,lat,lng,reference_date:'2020-07-31',opening_status,opening_hours_raw,
  accessibility_report:{accessible_male_stalls:null,accessible_female_stalls:null},
  coordinates_status:'verified',
  coordinate_evidence:{source_url:SOURCE,verified_at:CHECKED,redistribution_approved:true,precision:'facility_location',sourceRecordId,identitySourceUrl:IDENTITY,sourceDatasetUpdatedAt:UPDATED,license:LICENSE,attribution:'서울특별시 공중화장실 위치정보 (공공누리 1유형)'},
  facility_accessibility_report:{status,note},
  opening_source_url:SOURCE,
}));
const coverageDetail = Object.freeze({region:'서울특별시 금천구',scope:'curated_pilot',complete:false,facilityCount:rows.length,sourceDatasetUpdatedAt:UPDATED,sourceUrl:SOURCE,license:LICENSE,attribution:'서울특별시 공중화장실 위치정보 (공공누리 1유형)'});
module.exports = {rows,coverageDetail};
