# 함께봄 안정성·예외 복구 검증

기준일: 2026-11-26 (KST). 실제로 실행한 측정과 코드에서 확인한 예외 처리만 적습니다. 실행하지 않은 것은 마지막 절에 따로 적었습니다.

## 1. 운영 URL 장시간 저빈도 측정

### 1.1 방법

- 도구: `scripts/stability_probe.mjs` (Node.js 내장 `fetch`만 사용, 외부 패키지 없음)
- 대상: 운영 서비스 `https://hamkkebom-omega.vercel.app/`
- 요청: 읽기 전용 GET만. 아래 8개 대상을 순서대로 돌아가며 **10초에 한 번, 한 요청씩**(분당 약 6회) 보냈습니다. 각 대상은 약 80초에 한 번 호출됩니다. 부하 시험이 아닙니다.
- 판정: 페이지는 HTTP 2xx이고 본문에 `<html`이 있으면 성공, API는 HTTP 2xx이고 JSON 객체에 정해진 키가 있으면 성공. 15초 안에 응답이 없으면 시간 초과.
- 저장: 요청 시각, 대상 이름, HTTP 상태, 지연(ms), 실패 분류만 저장합니다. 응답 본문, 쿠키, 키는 저장하지 않습니다.

| 대상 | 경로 | 성공 기준 키 |
| --- | --- | --- |
| page:home | `/` | HTML |
| api:featured | `/api/featured.js?lat=37.5665&lng=126.9780` | `mode` |
| api:nearby | `/api/nearby.js?lat=37.5665&lng=126.9780` | `places` |
| api:places-seoul | `/api/data?type=places&region=서울` | `places` |
| api:weather-forecast | `/api/data?type=weather&region=서울&date=(내일)` | `status` |
| api:weather-alerts | `/api/weather?type=alerts&region=서울&date=(내일)` | `status` |
| api:toilets | `/api/toilets?lat=37.5665&lng=126.978&radius=2000&limit=50` | `status` |
| page:migration | `/migration.html` | HTML |

실행 명령:

```sh
node scripts/stability_probe.mjs --minutes 35 --interval 10 --out <결과 폴더>
```

### 1.2 결과

- 실행: 2026-11-26 10:57:42 ~ 11:32:34 KST (01:57:42 ~ 02:32:34 UTC), 34분 52초, 팀 PC(Windows 11, Node.js v26.13.1)에서 1회 실행
- 총 210회 요청, 성공 189회(90.0%). 실패 21회는 모두 대표 명소 API의 HTTP 503이었고, 나머지 7개 대상은 183회 모두 성공했습니다.
- 시간 초과(15초)·네트워크 오류·잘못된 JSON: 0회

| 대상 | 요청 | 성공 | 성공률 | p50(ms) | p95(ms) | 최대(ms) | 실패 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| page:home | 27 | 27 | 100% | 44 | 473 | 481 | 없음 |
| api:featured | 27 | 6 | 22.2% | 243 | 455 | 463 | HTTP 503 × 21 |
| api:nearby | 26 | 26 | 100% | 246 | 1,555 | 1,745 | 없음 |
| api:places-seoul | 26 | 26 | 100% | 53 | 259 | 496 | 없음 |
| api:weather-forecast | 26 | 26 | 100% | 254 | 2,491 | 2,760 | 없음 |
| api:weather-alerts | 26 | 26 | 100% | 242 | 263 | 448 | 없음 |
| api:toilets | 26 | 26 | 100% | 251 | 451 | 509 | 없음 |
| page:migration | 26 | 26 | 100% | 40 | 457 | 524 | 없음 |
| **전체** | **210** | **189** | **90.0%** | **241** | **496** | **2,760** | HTTP 503 × 21 |

지연은 측정 PC에서 본 전체 응답 시간(네트워크 포함)입니다. p95가 큰 `nearby`·`weather-forecast`는 캐시가 없는 첫 요청에서 외부 API를 부른 경우로 보이며, 이후 요청은 250ms 안팎이었습니다(캐시 적중 여부를 응답에서 직접 확인하지는 않음).

#### 관찰된 장애: 대표 명소 API 503

- 11:04:33 KST까지 6회 성공, 11:05:53 KST부터 측정 종료(11:32)까지 21회 연속 `503 {"error":"upstream_rate_limited","upstreamStatus":429}`. 측정 직후(11:33)에도 같은 응답이었습니다.
- 뜻: 서버가 관광공사 상세 API에서 429(호출 한도 초과)를 받았고, 이를 숨기지 않고 원인 코드와 함께 503으로 돌려준 것입니다. 실패는 1시간만 캐시해 같은 인스턴스에서 외부 호출을 반복하지 않습니다(`web/server/featured-catalog.cjs:122`).
- 다른 기능 영향: 같은 시간 동안 홈 페이지, 주변 장소, 서울 장소 목록, 날씨, 화장실 API는 모두 정상 응답했습니다. 화면은 대표 명소 영역에 "대표 관광지 자료를 불러오지 못했어요."를 표시하도록 되어 있습니다(`web/assets/core-src/50-map-and-startup.js:623`).
- 확인 안 됨: 한도 소진의 원인(같은 날 개발·검증 호출량, 공급자 일일 한도 값), 이 측정의 요청이 한도 소진에 기여했는지. 이 측정은 대표 명소를 약 80초에 한 번 호출했고, 정상일 때는 서버 캐시(6시간)가 응답했습니다(응답 약 240ms).
- 후속: 한도 상황에서도 대표 명소를 보여 줄 수 있도록 마지막 정상 결과나 저장소 스냅샷으로 대체하는 개선이 필요합니다(아직 하지 않음).

## 2. 코드의 예외 처리·재시도·폴백

아래 줄 번호는 비공개 정본 main `c89ac4f` 기준입니다. 단위 테스트가 있는 항목은 [VERIFICATION.md](VERIFICATION.md) 5절의 해당 테스트로 검사합니다.

| 상황 | 처리 | 근거(파일:줄) |
| --- | --- | --- |
| 기상청 응답 지연·네트워크 오류·5xx | 요청당 3.5초 제한, 전체 7초 예산 안에서 1회만 재시도 | `web/server/weather-provider.cjs:67`, `:79`, `:114` |
| 기상청 429(호출 한도) | 60초 동안 같은 인스턴스에서 재호출하지 않음(쿨다운) | `web/server/weather-provider.cjs:113` |
| 날씨 API 오류 응답 | 원인별 HTTP 코드로 구분(입력 400, 한도 429, 시간 초과 504, 키 없음·과부하 503, 기타 502) | `web/api/weather.js:4-11` |
| 관광공사 목록 API 지연 | 5초 제한, 시간 초과는 504 `upstream_timeout` | `web/server/place-catalog.cjs:129-133` |
| 관광 API 키가 없음 | 저장소의 장소 스냅샷으로 응답하고 `mode: snapshot`으로 표시 | `web/server/place-catalog.cjs:172` |
| 주변 장소 일부 유형 실패 | 요청당 최대 3회 호출, 자동 재시도 없음. 실패한 유형은 응답에 표시하고 캐시하지 않음 | `web/server/place-catalog.cjs:292`, `:310-312` |
| 같은 요청 동시 다발 | 진행 중인 요청을 공유해 외부 호출을 한 번으로 묶음 | `web/server/place-catalog.cjs:285-286` |
| 대표 명소 상세 실패 | 정상 6시간, 실패 시 1시간만 캐시해 한도 상황에서 반복 호출 제한 | `web/server/featured-catalog.cjs:6`, `:122` |
| 무장애 정보 보강 | 인스턴스당 하루 호출 상한, 실패도 5분 쿨다운 | `web/server/accessibility-provider.cjs:57`, `:87`, `web/server/catalog-accessibility.cjs:37-38` |
| 네이버 자동차 경로 지연 | 5초 제한, 시간 초과는 "알 수 없음"으로 돌려주고 화면은 예상 이동시간 사용 | `web/server/naver-directions.cjs:86`, `:95`, `:102`, `:119` |
| 상세 조회 공급자 오류 | 실시간 조회가 꺼져 있거나 키가 없을 때만 공식 출처 카탈로그로 응답하고, 한도·시간 초과·인증 오류는 카탈로그로 감추지 않고 오류로 응답 | `web/server/rich-tour.cjs:102-107` |
| 위치 권한 거부·시간 초과 | 서울 시청을 지도 기본 중심으로 쓰고 "출발지가 아님"을 안내 | `web/assets/core-src/50-map-and-startup.js:34-62` |
| 지도 SDK 정리 실패 | 리스너·마커·지도 정리를 각각 try/catch로 감싸 화면 전환 유지 | `web/assets/core-src/50-map-and-startup.js:120-126` |
| 화장실 지도 요청 경합 | 이전 요청 취소(AbortController)와 버전 번호로 늦게 온 응답 무시 | `web/assets/core-src/50-map-and-startup.js:290-316` |
| 대표 명소 API 실패 | "대표 관광지 자료를 불러오지 못했어요." 표시 후 나머지 화면 유지 | `web/assets/core-src/50-map-and-startup.js:623` |
| 예보·특보 중 하나 실패 | `Promise.allSettled`로 따로 처리해 하나가 실패해도 다른 하나는 표시 | `web/assets/core-src/40-sharing-and-data.js:683-686` |
| 추천·이동시간 POST 지연 | 브라우저 요청 18초 제한 | `web/assets/core-src/40-sharing-and-data.js:689-690` |
| 생성형 AI 호출 실패 | 9초 제한, 인스턴스 분당 40회 상한. 키 없음·429·시간 초과·네트워크 오류는 모두 `unavailable`로 응답하고 화면은 AI 영역을 숨긴 채 수동 입력 유지 | `web/server/ai-assistant.cjs:25`, `:30`, `:193-216`, `:242` |
| 테스트 멈춤 | 단위 테스트 시간 초과를 건너뜀이 아니라 실패로 처리 | `scripts/run_unit_regression.py` |

서버리스 구조라 상시 실행되는 프로세스를 직접 재시작하는 방식은 쓰지 않습니다. 함수 하나가 실패해도 다음 요청은 새로 처리되며, 배포 단위 복구는 Vercel의 이전 정상 배포로 되돌리는 방식입니다([GIT_WORKFLOW.md](GIT_WORKFLOW.md)).

## 3. 실행하지 않은 것

| 항목 | 상태 |
| --- | --- |
| 24시간 이상 연속 관측, 가용성(SLA) 수치 | 실행 안 함. 1절은 약 35분 표본 1회 |
| 부하·동시 접속 시험 | 실행 안 함(무료 플랜 호출 한도 보호) |
| POST API 운영 실호출 장시간 측정 | 실행 안 함 |
| 외부 공급자 장애를 일부러 일으키는 시험 | 운영에서는 하지 않음. 단위 테스트의 가짜 응답(시간 초과·429·5xx·잘못된 본문)으로만 검사 |
| Vercel 함수 오류율·로그 대시보드 집계 | 이 문서에 포함하지 않음 |
| 실기기 장시간 사용 | 실행 안 함 |
