# 함께봄 검증 결과

이 문서의 결과는 모두 팀이 직접 실행한 기록(자기보고)입니다. 통과 수는 실행 도구가 출력한 숫자를 그대로 옮겼습니다. 실기기·실사용자 수락은 아직 하지 않았습니다.

## 1. 실행 환경

| 항목 | 값 |
| --- | --- |
| 기준 커밋 | 비공개 정본 main `c89ac4f6d9f4ea83ed5818d5694b5155757b325c` (+ 이 제출 문서·공개 동기화 변경, 앱 코드 변경 없음) |
| 실행 시각 | 2026-11-26 11:33~11:34 KST (02:33~02:34 UTC) |
| 실행 환경 | Windows 11, Node.js v26.13.1, Python 3.13.17 |
| CI 환경 | GitHub Actions ubuntu-latest, Node.js 22.16.0, Python 3, Playwright 1.62.0 Chromium |

## 2. 로컬 검사 7종

| 번호 | 명령 | 검사 내용 | 결과 |
| --- | --- | --- | --- |
| 1 | `python scripts/verify_context.py` | 정본 문서 등록부, SHA-256, 링크, 기능 계약 추적 | PASS |
| 2 | `python scripts/build_core_modules.py --check` | 6개 원본으로 만든 번들과 배포 번들 일치(358,917바이트) | PASS |
| 3 | `python scripts/verify_source_split.py --parity` | HTML·CSS·보조 JS 원본 분리 동등성, 11개 CSS·3개 JS 연결 | PASS |
| 4 | `python scripts/check_web_snapshot.py` | 화면 표식과 자체 API 핸들러, 외부 배포 rewrite 없음 | PASS |
| 5 | `python scripts/verify_api_contract.py` | 관찰된 API 응답 7종의 스키마 | PASS |
| 6 | `node --check web/assets/scripts/00-app-core.js` | 번들 구문 | PASS(종료 코드 0) |
| 7 | `python scripts/run_unit_regression.py` | Node 단위 테스트 74개 파일을 따로 실행한 뒤 전체를 한 번 더 실행 | 74개 파일 모두 종료 코드 0, 합본 577건 중 575 통과·0 실패·2 건너뜀 |

건너뛴 2건은 실제 API 키가 있어야 실행되는 선택형 실연동 테스트입니다(`accessibility_provider_smoke`, `weather_provider`의 기상청 직접 호출). 키 없이 실행했으므로 건너뛰었습니다.

### 2.1 공개 스냅샷에서도 실행되는 검사 (npm)

같은 시각, 같은 커밋에서 실행했습니다. 규칙은 [CODE_CONVENTION.md](CODE_CONVENTION.md), 공개 저장소에서는 `.github/workflows/ci.yml`이 같은 단계를 실행합니다.

| 명령 | 결과 |
| --- | --- |
| `npm ci` | 고정 버전 개발 의존성 82개 설치 |
| `npm run lint` (ESLint) | 0 errors, 35 warnings |
| `npm run format:check` (Prettier, 도구 파일 대상) | 통과 |
| `npm test` (`scripts/run_public_tests.mjs`) | 공개 테스트 51개 파일, 408건 중 407 통과·0 실패·1 건너뜀, 외부 네트워크 시도 0 |

공개 동기화를 로컬에서 재현해 만든 스냅샷 폴더에서도 같은 단계를 실행했습니다: lint 0 errors, format 통과, 번들 일치, 공개 테스트 통과(1 건너뜀). `npm test`가 건너뛴 1건은 `weather_provider`의 기상청 실연동 선택 테스트입니다. 공개 저장소의 GitHub Actions에서 `ci.yml`이 실제로 실행된 결과는 이 문서 작성 시점에 아직 없습니다(확인 안 됨).

## 3. GitHub Actions 실행 기록

개발 정본 저장소가 비공개라 평가자는 아래 실행 링크를 열 수 없을 수 있습니다. 2026-11-26 11:0x KST에 GitHub API(`gh api repos/.../actions/runs`)로 읽은 값을 옮깁니다.

### 3.1 최신 main과 직전 PR

| 워크플로 | 실행 번호(run id) | 대상 | 결론 |
| --- | --- | --- | --- |
| Verify official HAMKKEBOM docs | #307 (45740948300) | main `191135f` push | success |
| Evaluation public source sync | #34 (45740948270) | main `191135f` push | success |
| QA-01 regression | #270 (45740735458) | PR #119 head `5d11391` | success |
| Verify official HAMKKEBOM docs | #300 (45738995155) | main `dd5cfd7` push | success |
| Evaluation public source sync | #32 (45738995256) | main `dd5cfd7` push | success |
| QA-01 regression (units + browser) | #266 (45738636134) | PR #116 head `1089071` | success (units 24초, browser 약 1분 50초) |
| Verify official HAMKKEBOM docs | #298 (45733107827) | main `e06819c` push | success |
| Evaluation public source sync | #31 (45733107785) | main `e06819c` push | success |
| QA-01 regression | #265 (45732730568) | PR #115 | success |
| 날씨 회귀 (`agent-v-weather.yml`) | #27 (45732730469) | PR #115 | success |

`QA-01 regression`의 browser 작업은 정적 서버를 띄우고 Chromium으로 320·375·768·1280px 화면에서 전체 사용자 흐름(`scripts/qa_regression.py --full-frontend`)을 실행합니다.

### 3.2 최근 100회 실행 집계 (2026-11-26 08:32~11:04 KST)

| 워크플로 | success | failure |
| --- | --- | --- |
| Verify official HAMKKEBOM docs | 39 | 0 |
| QA-01 regression | 22 | 0 |
| 사진 화면 브라우저 검사 (`agent-s-photo-app.yml`) | 19 | 0 |
| Evaluation public source sync | 14 | 1 |
| 날씨 회귀 (`agent-v-weather.yml`) | 4 | 0 |
| 사진 권리 확인 반입 검사 (`agent-s-photos.yml`) | 1 | 0 |

실패 1건(공개 동기화 #30, run 45732425913)은 장소 근거 URL의 `?key=` 숫자 파라미터가 비밀값 패턴에 걸린 오탐이었고, 근거 URL을 바꾼 PR #115 병합 후 #31부터 다시 성공했습니다. 비밀값 검사는 끄지 않았습니다.

저장소 전체 실행 이력(2026-11-22~11-26)에는 개발 중 실패·취소된 실행도 있습니다(예: QA-01 regression success 167, failure 57, cancelled 42). 현재 병합 규칙은 "검사 모두 통과 후 병합"([GIT_WORKFLOW.md](GIT_WORKFLOW.md))이며, 과거 PR 전체가 이 규칙대로 병합됐는지는 전수 확인하지 않았습니다.

## 4. 운영 URL 응답 확인

2026-11-26 11:07 KST, `https://hamkkebom-omega.vercel.app/` 에 GET 요청을 한 번씩 보냈습니다.

| 경로 | HTTP | 응답 요약 |
| --- | --- | --- |
| `/` | 200 | 홈 HTML |
| `/migration.html` | 200 | 이전 도구 HTML |
| `/api/nearby.js?lat=37.5665&lng=126.9780` | 200 | `mode: live`, 주변 장소 50건 |
| `/api/data?type=places&region=서울` | 200 | `mode: live`, 서울 장소 목록 |
| `/api/data?type=places&region=경기` | 200 | `mode: live`, 경기 장소 목록 |
| `/api/data?type=weather&region=서울&date=2026-11-27` | 200 | `status: available`, 기상청 단기예보 |
| `/api/weather?type=alerts&region=서울&date=2026-11-27` | 200 | `status: unknown`(현재 특보만 조회 가능, 여행일 특보는 미확인으로 표시) |
| `/api/toilets?lat=37.5665&lng=126.978&radius=2000&limit=50` | 200 | `status: ok`, 부분 범위(시범 자료) |
| `/api/photo?placeId=tour-126508` | 200 | 권리 확인된 로컬 사진 |
| `/api/featured.js?lat=37.5665&lng=126.9780` | 503 | `upstream_rate_limited`(관광공사 API가 429 응답). 같은 날 11:05 이전 요청은 200 |
| `/api/rich-tour?action=search&...` | 503 | `rich_tour_disabled`(전국 실시간 검색은 운영 플래그 꺼짐, 의도된 상태) |
| `/api/rich-tour?action=detail&contentId=126508&contentTypeId=12` (11:34 KST) | 200 | 경복궁 세부정보(저장소의 공식 출처 카탈로그에서 응답) |
| `/api/featured.js?lat=999&lng=0` | 400 | `invalid_coordinates`(입력 검증) |
| `/api/recommend` (GET) | 405 | `method_not_allowed`(POST 전용) |
| `/api/ai-assist` (11:18 KST 확인 → 키 등록 후 재확인) | 200 | 11:18에는 `{"enabled":false}`(키 미등록). 키 등록 후 `{"enabled":true}`, 자연어 조건 정리 실제 호출 1건 정상(약 1.9초) |

대표 명소 API의 503은 외부 공급자 호출 한도에 걸린 상태를 그대로 알린 것이며, 화면은 "대표 관광지 자료를 불러오지 못했어요." 문구를 보여 주고 다른 기능은 계속 동작하도록 되어 있습니다(`web/assets/core-src/50-map-and-startup.js:623`). 원인이 일일 호출 한도 소진인지는 확인 안 됨. 장시간 측정 결과는 [STABILITY.md](STABILITY.md)에 있습니다.

POST API(`/api/recommend`, `/api/travel-times`, `/api/trip-endpoints`)의 운영 실호출, 실제 GPS, 실기기(Android·iOS) 확인은 이번에 하지 않았습니다.

## 5. 요구사항별 검증 체크리스트

결과의 숫자는 2절 7번 실행에서 해당 파일들의 통과 수 / 전체 수입니다. 요구사항 정의는 [REQUIREMENTS.md](REQUIREMENTS.md)에 있습니다.

| 요구사항 | 검증 방법 | 테스트 파일(`tests/`) | 결과 | 남은 확인 |
| --- | --- | --- | --- | --- |
| F01 조건 입력 | 입력 검증·필수값·단계 이동·날짜 범위·복원 단위 테스트 | `rec01_input_contract`, `wizard_step_navigation`, `travel_date_time_window`, `finish_error_empty_box`, `planner_rest_preferences`, `submission_local_restore` | 40/40 | 실기기 입력 |
| F02·F03 추천 | 절대 조건 분류(충족/확인 필요/불일치), 보조기구 조건, 계절 추천, 서버 조건 검증 | `mvp_recommendation_flow`, `mobility_recommendation`, `seasonal_recommendation`, `server_travel` | 54/54 | 실데이터 추천 품질 표본 |
| F04·F08 상세·근거 | 사실 단위 출처·상태 정규화, 상충·오래됨 처리, 공급자 오류 분류, 상세 화면 표시 | `access_evidence`, `accessibility_live`, `accessibility_provider_smoke`, `catalog_accessibility_integration`, `agent_u_accessibility_quality`, `legacy_accessibility_parity`, `frontend_accessibility_detail`, `agent_aa_rich_tour`, `agent_aa_rich_tour_audit`, `agent_x_rich_tour_integration`, `daechi_places_catalog`, `place_details_catalog`, `nationwide_tour_catalog` | 90/91 (1건 키 필요로 건너뜀) | 현장 검증, 전국 표본 |
| F04 사진 | 권리 확인 사진 우선, 같은 장소 ID 공식 이미지만, 출처 표기, 실패 시 대체 표시 | `place_photos`, `place_photo_display`, `place_photo_api_contract_q`, `tour_official_image`, `home_photo_credit_compact` | 36/36 | 사진 커버리지 |
| F05 일정 | 일정 엔진·편집·충돌, 집 출발·귀가 시각, 이동시간(실제/예상), 경로 공급자 실패 격리, 저장 스키마 | `frontend_itinerary_editor`, `itinerary_schema`, `itinerary_trip_endpoints`, `planner_home_times`, `planner_route_button`, `planner_travel_preview`, `planner_trip_endpoints`, `naver_provider_integration`, `agent_r_naver_route`, `agent_r_naver_handoff`, `endpoints_unify_indoor_weathertext` | 113/113 | 운영 경로 API 실응답, 서버 저장(미구현) |
| F06 재조정 | 컨디션 하·중·상 변경안, 보호 일정 유지, 비교·적용·되돌리기 | `frontend_replan`, `mvp_condition_replan` | 14/14 | 서버 승인·동시성(미구현) |
| F07·F14 날씨 | 예보 정규화, 공급자 오류·재시도·쿨다운, 특보 표시, 날씨 기반 제안 | `weather_normalizer`, `weather_provider`, `weather_recommendation_options`, `weather_suggestions`, `weather_time_candidates`, `agent_v_weather_reliability`, `agent_v_weather_ui_handoff`, `hide_remaining_notices` | 88/89 (1건 키 필요로 건너뜀) | 실제 특보 발효 사례 |
| F19 생성형 AI | 키 없음 시 비노출·API 미호출, 구조화 출력 요청 형식, 모델 출력 재검증, 실패 8종·시간 초과 폴백, 프롬프트 인젝션 문장, 호출 제한, 안전 보장 표현·근거 없는 숫자 제거 (Anthropic API를 흉내 낸 모킹) | `ai_assistant` | 15/15 | 실제 Claude 응답 품질·지연·비용. 운영 활성 후 실제 호출 1건만 확인(2026-11-26) |
| F09·F13 공유·큰 글씨 | 읽기 전용 링크, 개인정보 제외, 큰 글씨·인쇄 전환 | `frontend_family_share`, `mvp_family_share_completion` | 19/19 | 교차 기기 실기기 |
| F10·F11·F12 도착·시설 | 시설 표시, 화장실 좌표 검수 자료만 표시, 지도 오버레이 경합 처리 | `agent_aa_rich_facilities_ui`, `agent_aa_walking_provider`, `agent_t_public_toilets`, `agent_t_toilet_overlay`, `agent_t_toilet_pilot` | 16/16 | 좌표 승인 범위 확대 |
| F20·F21·F22 지도·탐색 | 위치 거부 폴백, 지도 정리, 중심 재검색, 핀·목록 연동, 대표 명소, 탐색 페이지 | `frontend_map_center_search`, `frontend_map_lifecycle`, `frontend_place_exploration`, `mvp_map_completion`, `nearby_location_search`, `featured_catalog`, `place_data_api`, `discovery-editorial`, `home_rich_discovery_hidden`, `header_home_nav` | 62/62 | 실제 GPS·SDK 실기기 |
| NFR-01 접근성 UI | 모바일 폭·포커스·모션 줄이기 CSS 규칙, CI 브라우저 회귀 4개 폭 | `frontend_ui_polish`, `illustration_system` + CI browser 작업 | 11/11, CI success | 200% 확대·스크린리더 실기기 |
| NFR-04·07 배포·비밀 | 자동 배포 범위, 외부 rewrite 제거, 레거시 독립, 공개 동기화 비밀값 검사 | `deployment_policy`, `vercel_cutover_stage1`, `legacy_browser_migration`, `legacy_retirement_independence`, `mvp_integration_api` | 17/17 | 비밀값 검사는 기본 패턴 검사이며 완전한 보안 감사가 아님 |
| NFR-05 장애 격리 | 시간 제한·재시도·폴백 코드와 운영 저빈도 측정 | [STABILITY.md](STABILITY.md) | 운영 35분 측정 210회 중 189 성공. 실패 21회는 모두 대표 명소 API 503(외부 한도), 나머지 7개 대상 183/183 | 24시간 이상 관측, 한도 상황 대체 표시 |
| NFR-06 재현 빌드 | 원본→번들 재생성 일치 | 2절 2번 | PASS | — |

합계: 74개 파일, 577건 중 575 통과, 2 건너뜀(실연동 선택 테스트), 0 실패.

평가 요건으로 추가한 요구사항 F23(AI Agent 여행 초안)·F24(RAG 장소 Q&A)·F25(Long-term Memory)·F26(피드백 수집)과 F27의 AI 생성 배지 화면은 2026-11-26 현재 작업 브랜치에서 구현 중이라 위 표와 합계에 들어 있지 않습니다. 병합 후 검증 방법·테스트 파일·결과를 이 표에 추가합니다. 그 전까지는 "확인 안 됨"입니다.

## 6. 다시 실행하는 방법

비공개 정본 저장소에서:

```sh
python scripts/verify_context.py
python scripts/build_core_modules.py --check
python scripts/verify_source_split.py --parity
python scripts/check_web_snapshot.py
python scripts/verify_api_contract.py
node --check web/assets/scripts/00-app-core.js
python scripts/run_unit_regression.py
```

`run_unit_regression.py`는 각 파일 로그와 `summary.json`을 `qa-unit-results/`에 저장합니다. 공개 스냅샷에서 실행할 수 있는 범위는 README의 실행 방법을 따릅니다.
