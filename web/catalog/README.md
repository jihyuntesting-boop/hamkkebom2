# Agent J — 서울·경기 MVP 장소 카탈로그 (2026-11-24)

## 출처·이용허락·범위

- 공식 1차 출처: 한국관광공사 국문 관광정보 서비스_GW (TourAPI KorService2) — https://www.data.go.kr/data/15101578/openapi.do
- 보조 정보의 원천 서비스: 한국관광공사 무장애 여행 정보 — https://www.data.go.kr/data/15101897/openapi.do
- 공공데이터포털 표시(2026-11-24 확인): 무료, 기본 데이터 **이용허락범위 제한 없음**. 다만 운영 계정 심의, 호출 한도, 사진별 공공누리 유형(1·3유형)을 별도로 확인해야 한다. 사진의 수정·2차 재배포·기업 CI/BI 이용 권한을 이 카탈로그가 보증하지 않는다.
- **사진 URL은 저장·노출하지 않는다.** 'imageIdentifier'는 한국관광공사 콘텐츠 ID를 식별하기 위한 값으로, 사진 이용권 검증의 증거가 아니다.

### 정적 MVP 스냅샷: 완전한 카탈로그가 아니다

'places.v1.json'은 2026-11-23 읽기 전용 관찰 결과인 'tests/fixtures/legacy-api-observed.json'에서 복사 가능한 **개별 8개 레코드만** 추렸다.

| 영역 | 기록된 검색 원본 건수 | 현재 실제 확보한 정적 레코드 |
|---|---:|---:|
| 서울 지역 조회 | 20 | 2 (문화시설) |
| 경기 지역 조회 | 20 | 2 (문화시설) |
| 서울시청 주변 조회 | 45 | 추가 2 (음식점) |
| 대표 명소 조회 | 8 | 추가 2 (관광지) |
| **중복 제거 후 합계** | **합산 불가 — 서로 다른 조회** | **서울 6 / 경기 2 = 8** |

- **경기 음식점 0개**, 경기 관광지 'kind=spot' 0개: 임의 데이터로 보충하지 않는다. 동적 TourAPI 응답으로 확장해야 한다.
- 관찰된 이전 API 데이터가 오늘까지 영업·운영·주소·좌표가 유효함을 뜻하지는 않는다. 좌표·주소는 관찰 기록과 일치하나, 외부 현장 재확인은 **BLOCKED**.
- 'accessFacts'는 공공자료의 **시설 설명**일 뿐, 주차장→입구/식탁 동선·무단차·보행거리 검증이 아니다. 'source_reported'로만 내려보내고 'mobilityAssessment:verified'를 생성하지 않는다.
- 'sourceUpdatedAt=null'이면 갱신일 **미확인**이다. 'collectedAt=2026-11-23'은 관찰 날짜이지 현장 검증 날짜가 아니다.
- 정적 카탈로그 버전: '2026-11-24.snapshot-1'. 새 스냅샷은 원본 ID/주소/좌표·이용권 재검증 후 명시적 버전업. 월 1회 재검토, 서비스 출시 전 최신 응답 확인 권고.

## 실데이터 API 모드

'web/server/place-catalog.cjs'는 서버 환경변수 'HB_TOURAPI_KEY'가 설정되면 TourAPI 'areaBasedList2'를 호출한다. 서버 변수는 커밋하거나 브라우저에 보내지 않는다. **다른 배포의 키나 비밀을 복사하지 않는다.**

- 서울 'areaCode=1', 경기 'areaCode=31'; 카테고리: 'contentTypeId=12' 관광지→'spot', '14' 문화시설→'culture', '39' 음식점→'food'.
- 1회 조회는 **카테고리당 첫 페이지 40건**까지, 지역당 최대 120건. 더 많으면 'meta.partial=true', 'meta.totalAvailable'에 공급자 보고 수를 표기. 서버 비용을 제한하는 초기 MVP 정책이며 전체 지역 목록이 아니다.
- 15분 인스턴스 메모리 캐시, 동일 지역 병렬 요청 합침, 최대 요청 5초, 한 요청당 공급자 재시도 0회. 다중 서버 인스턴스 간 전역 호출 한도는 제공하지 않음. 데이터 갱신/영업상태 모니터링은 별도.
- 인증·쿼터·제공기관 오류는 **502/503/504**로 구분해 노출. 정상 0건은 **200 + []**. 응답에는 발급 키 미포함.
- 키가 **없을 때만** 명시적인 'mode:snapshot', 'meta.partial=true'로 작은 표본을 제공한다. 키가 설정됐는데 상위 API에 오류가 나면 표본을 새 데이터인 것처럼 조용히 대신 반환하지 않는다.
- 동일 'tour-<contentid>'를 지역·지도·추천·일정에서 사용할 수 있도록 유지. 근거 없는 이미지 URL/접근성 검증 상태는 생성하지 않는다.
- 'GET /api/data?type=places&region=서울|경기': legacy 'places' 계약 및 추가 'meta' 보존.
- 'GET /api/nearby.js?lat=&lng=': 정적/동적 카탈로그 중 기준 좌표 직선거리 **10km 이내 최대 50건**. 'distanceType:straight_line', 도보거리 아님.
- 'GET /api/featured.js?lat=&lng=': 명칭/ID가 관찰 기록과 일치한 **편집 명소 2곳**만, 42km 이내. 공식 인기순위 아님.
- 메서드/지역/좌표·중복/스키마/404 없는 데이터/제공자 401·429·500·타임아웃 회귀는 'tests/place_data_api.test.cjs'.

## 통합 담당자에게 요청 (Agent J가 변경하지 않음)

1. **'web/vercel.json'에 과거 API로 보내는 3개 rewrite가 남음.** 새 API 파일을 추가해도 프록시가 먼저 잡히면 소비자가 구형 배포를 사용한다. 분기/배포 순서를 확인한 뒤 통합 담당자가 변경할 것.
2. '/api/data?type=weather'는 **Agent C** 전담. '/api/data' URL 단위 rewrite를 제거하면 날씨까지 영향을 받으므로, 날씨 구현과 라우팅 분리/위임을 먼저 수락해야 함. 새 'data.js'는 weather를 구현하지 않으며 호출 시 501을 응답.
3. 'web/server/travel.cjs'의 추천 엔진은 별도 고정 이전 API URL('LEGACY')을 호출한다. **통합 담당자가 내부 카탈로그 호출 또는 동일 릴리스 API로 교체**하기 전까지 추천의 원격 의존성은 남는다.
4. 'web/api/photo'는 아직 옛 리라이트이며 이 PR은 수정하지 않음. 권리 검증/기본 이미지의 소유자는 DATA-03.
5. Vercel Preview에서 공식 **개발 승인된 키**로 서울·경기 실제 호출(건수/분류/ID·좌표·주소/401·429/업스트림 장애), 지도/추천 기능, 'scripts/verify_api_contract.py --base-url <preview>'를 실행하고 소스·배포 ID 기록. Agent J 세션에서 실배포·키·네트워크 검증은 **BLOCKED**.

## 검증 실행

'node --test tests/place_data_api.test.cjs'

회귀 테스트: 'node --test tests/server_travel.test.cjs tests/frontend_map_center_search.test.cjs tests/frontend_place_exploration.test.cjs' 및 'python3 scripts/verify_api_contract.py'.

변경파일은 이 디렉터리와 'web/server/place-catalog.cjs', 'web/api/{data,nearby,featured}.js', 'tests/place_data_api.test.cjs'로 한정한다. 'AGENTS.md', 'STATUS.md', TODO/CI/routing은 이 에이전트의 독점 수정 범위 밖이므로 통합 담당자가 기록·변경해야 한다.

## 대치동 인근 장소 보강 (2026-11-26, MVP)

- 'daechi-area-details.v1.json': 대치동(37.4945, 127.0628) 반경 약 6km 안의 7곳에 대해 **공식 페이지에서 확인한 값만** 기록한다. 각 값에 'sourceUrl'·'sourceName'·'checkedAt'(확인일)을 둔다. 확인되지 않은 항목(계단·경사·보행거리·입구, 일부 운영시간·요금)은 넣지 않는다.
- 식별(ID·이름·주소·좌표)은 운영 사이트 공개 API의 읽기 전용 GET 응답(TourAPI)에서만 가져온다: '/api/nearby.js'(locationBasedList2), '/api/featured.js'(detailCommon2), 기존 키워드 보강 파일. 공식 페이지 값으로 좌표·주소를 바꾸지 않는다.
- 'nearby-landmark-supplement.v1.json'에 올림픽공원(tour-126532)·서울숲(tour-128611)을 추가했다. 운영 위치 조회(locationBasedList2) 응답에 빠져 있던 곳이다. 레코드별 'source'·'observedVia'·'collectedDate'가 있으면 그것이 출처다(없으면 파일 상단의 키워드 조회). 프런트 호환을 위해 'discoverySource'는 기존 값 'keyword_snapshot'을 유지한다.
- 앱 반영 경로: 주변 탐색은 실시간 모드에서 보강 레코드를 반경 10km 안에 합친다. 상세 '운영시간·요금·시설 더 보기'는 '/api/rich-tour?action=detail'이 **실시간 상세가 꺼져 있거나 키가 없을 때만** 이 파일의 값을 'sourceMode:curated_snapshot', 'partial:true'로 돌려준다('web/server/curated-place-details.cjs'). 공급자 오류(429·시간초과·인증)는 그대로 오류로 둔다.
- 추천 후보('/api/recommend' → 'getCatalog')에는 아직 넣지 않았다. 'getCatalog'에 보강 레코드를 합치면 일정 경로 좌표 확인(travel-times)까지 바뀌므로 일정·추천 담당과 조율 후 진행한다.
- 사진 URL·이미지 권리는 기록하지 않는다(운영 응답에 이미지 URL이 없었고, 사진은 사진 파이프라인 소관).
- 검증: 'node --test tests/daechi_places_catalog.test.cjs'.

## 사진 있는 장소 세부 정보 (2026-11-26, MVP)

- 'place-details.v1.json': 사진이 보이는 장소 15곳(대표 명소 경복궁·국립중앙박물관·DDP·광명동굴·북촌한옥마을·남한산성도립공원, 목록 장소 마장호수·청운문학도서관·안터생태공원·두루뫼박물관·조병화문학관·과천향교·은이성지·반룡송·봉돈)의 운영시간·휴무·입장료·경로우대·소요시간·주차·주차요금·휴식 공간·문의·공식 홈페이지와 시설 메모(장애인 주차·휠체어/유모차 대여·휠체어 이동 제한)를 **기관·지자체 공식 누리집에서 확인한 값만** 기록한다. 값마다 'sourceUrl'·'sourceName'·'checkedAt'.
- 계단·경사·보행거리·무단차 입구는 받지 않는다(검증기 거부). 확인 못 한 항목은 넣지 않고 화면에서도 행이 생기지 않는다.
- 식별: 운영 '/api/featured.js'(detailCommon2)·'/api/data?type=places'(areaBasedList2) 응답의 ID·이름·주소·좌표. 대표 명소 일부는 주소·좌표 없이 ID·이름만 둔다(선택 항목).
- 서빙: 'curated-place-details.cjs'가 대치 카탈로그와 함께 읽고, '/api/rich-tour?action=detail'이 실시간 상세가 꺼져 있거나 키가 없을 때(운영) 'sourceMode:curated_snapshot'으로 돌려준다. 세부페이지는 자동으로 조회해 값 있는 항목만 표시한다.
- 검증: 'node --test tests/place_details_catalog.test.cjs'.
