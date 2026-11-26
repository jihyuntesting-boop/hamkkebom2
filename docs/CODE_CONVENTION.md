# 함께봄 코드 컨벤션

이 문서는 저장소에 이미 있는 관행을 정리한 것입니다. 새 규칙을 소급 적용하려고 기존 코드를 일괄 수정하지 않습니다. 여러 작업이 같은 파일을 동시에 고치기 때문에, 일괄 재포맷은 열린 브랜치 모두와 충돌합니다.

## 1. 파일 구조

| 경로                                              | 역할                                                   | 형식                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `web/index.html`, `web/migration.html`            | 웹 진입점                                              | 정적 HTML, 클래식 `<script>` 로드                                                          |
| `web/assets/core-src/`                            | 핵심 앱 JavaScript의 기능별 원본 6개 + `manifest.json` | **독립 실행 불가** 조각 (하나의 IIFE 공유)                                                 |
| `web/assets/scripts/00-app-core.js`               | `core-src` 6개를 이어 붙인 생성 번들                   | 직접 수정 금지                                                                             |
| `web/assets/scripts/01~04-*.js`                   | 보조 스크립트 (로드 순서는 `web/index.html` 기준)      | 브라우저 클래식 스크립트                                                                   |
| `web/assets/components/`, `web/assets/migration/` | 상세 화면 컴포넌트, 이전 데이터 이관 화면              | 브라우저 클래식 스크립트                                                                   |
| `web/assets/styles/NN-*.css`                      | 화면 스타일. 번호 순서가 로드 순서                     | `--hb` 디자인 토큰은 `13-editorial.css`만 정의                                             |
| `web/api/*.js`                                    | Vercel 서버리스 핸들러                                 | CommonJS, `module.exports = (req, res) => ...`                                             |
| `web/server/*.cjs`                                | 핸들러가 쓰는 서버 로직                                | CommonJS, `'use strict'`                                                                   |
| `web/catalog/*.json`                              | 장소 데이터와 원천 정보                                | 생성·검수 데이터, 손으로 재포맷 금지                                                       |
| `scripts/`                                        | 빌드·검사·데이터 수집 도구                             | Python 3(`*.py`), Node(`*.cjs`, `*.mjs`)                                                   |
| `tests/`                                          | 단위·브라우저 테스트                                   | Node `node:test`(`*.test.cjs`), Python `unittest`(`test_*.py`), Playwright(`*_browser.py`) |

## 2. 이름 규칙

- 파일
  - 스크립트·스타일: 두 자리 순번 + kebab-case (`02-place-thumbnails.js`, `09-planner.css`). 순번은 로드 순서를 뜻합니다.
  - 서버 모듈·API: kebab-case (`weather-provider.cjs`, `trip-endpoints.js`).
  - Python 스크립트: snake_case (`build_core_modules.py`).
  - Node 테스트: snake_case + `.test.cjs` (`planner_trip_endpoints.test.cjs`). 대부분 snake_case이고 `discovery-editorial.test.cjs` 하나만 kebab-case입니다.
- 코드 (핵심 번들 기준)
  - 함수·변수: camelCase. 새로 추가하는 전역 범위 함수는 `hb` 접두사를 붙입니다 (`hbPlanViewEnhance`, `hbTripEndpointRequest`). 현재 `core-src`에 `function hb...` 정의가 약 230개 있습니다.
  - 규칙·기능 플래그 상수: `HB_` 접두사 + UPPER_SNAKE_CASE (`HB_WEATHER_SUGGEST_RULE`, `HB_PLAN_PANEL_ENDPOINTS`).
  - 테스트가 원본에서 잘라 실행하는 구간은 `// BEGIN HB_이름` / `// END HB_이름` 표식으로 감쌉니다. 표식 이름을 바꾸면 해당 테스트도 함께 고칩니다.
  - 기존 함수를 확장할 때는 원래 함수를 받아 감싸는 방식을 씁니다 (`const oldView = plan; plan = function () { oldView(); ... }`).
- 브랜치: `<에이전트>/<주제>-<YYYYMMDD>` (예: `claude/weather-suggestions-20261126`).

## 3. core-src → 번들 빌드 규칙

`00-app-core.js`는 `web/assets/core-src/manifest.json`에 적힌 순서대로 6개 조각을 바이트 그대로 이어 붙인 결과입니다.

```bash
# 원본 조각을 고친 뒤 번들을 다시 만든다 (로컬에서만)
python scripts/build_core_modules.py --write

# 번들이 원본과 일치하는지 검사한다 (CI는 이것만 실행)
python scripts/build_core_modules.py --check
node --check web/assets/scripts/00-app-core.js
```

- 수정은 `core-src/`의 조각에서 하고, 같은 커밋에 `--write`로 만든 번들을 함께 넣습니다.
- 번들을 직접 고치면 `--check`가 실패합니다.
- 조각은 하나의 IIFE 안에서 `s`, `places`, `render` 같은 변수를 공유하므로 HTML에서 따로 로드하지 않습니다.

## 4. Lint · Format

설치(Node 22.13 이상, 버전은 `package.json`에 고정, `package-lock.json` 사용):

```bash
npm ci
npm run lint          # ESLint, 오류 0건이어야 통과
npm run format:check  # Prettier, 도구 설정·문서 파일만 검사
```

ESLint(`eslint.config.mjs`, flat config):

- 실행 환경별로 전역을 나눕니다.
  - `web/assets/**/*.js`: 브라우저 클래식 스크립트(`sourceType: script`). 테스트용으로 `typeof module` 확인 뒤 내보내는 파일이 있어 `module`을 읽기 전용 전역으로 둡니다.
  - `web/api/**/*.js`, `**/*.cjs`: Node CommonJS.
  - `**/*.mjs`: Node ES 모듈.
- `web/assets/core-src/`는 검사하지 않습니다. 조각만으로는 문법이 완성되지 않으므로, 같은 코드를 생성 번들 `00-app-core.js`에서 검사합니다.
- 버그를 잡는 규칙은 오류로 유지합니다: `no-undef`, `no-dupe-keys`, `no-unreachable`, `no-redeclare` 등 `@eslint/js` 권장 규칙 전체.
- 기존 코드 통과를 위해 조정한 규칙(이유):
  - `no-unused-vars`, `no-useless-assignment`: 경고. 기존 코드에 정리 대상이 남아 있지만 동작 버그는 아닙니다.
  - `no-useless-escape`, `no-regex-spaces`: 경고. 표기 문제입니다.
  - `no-control-regex`: 끔. 입력 검증기가 제어문자를 막으려고 `/[\u0000-\u001f\u007f]/`를 의도적으로 씁니다.
  - `no-empty`: 빈 `catch`만 허용. 저장소 접근 실패를 무시하는 코드가 있습니다.
  - 번들의 `no-func-assign`: 경고. 위 2절의 함수 감싸기 방식 때문입니다.
  - `tests/**`의 `no-constant-condition`, `no-constant-binary-expression`: 경고. 테스트가 일부러 상수 조건을 입력으로 만듭니다.
- 경고는 남아 있어도 통과합니다. 새 코드에서는 경고도 만들지 않습니다.

Prettier(`.prettierrc.json`, `.prettierignore`):

- `npm run format:check`는 이번에 추가한 도구 설정·러너·CI 템플릿과 이 문서만 검사합니다 (`package.json`의 목록). 기존 소스는 대상이 아닙니다. 일괄 재포맷은 병렬 작업과 충돌하고, 생성 번들은 재포맷하면 `--check`가 깨지기 때문입니다.
- 새 파일을 만들 때만 Prettier 형식을 따르고, 기존 파일은 고치는 줄 주변의 원래 스타일을 유지합니다.
- `.editorconfig`: UTF-8, LF, 파일 끝 줄바꿈. JS·JSON·YAML·CSS·HTML 들여쓰기 2칸, Python 4칸.

## 5. 테스트

```bash
npm test             # 공개 스냅샷에서도 돌아가는 단위 테스트 (scripts/run_public_tests.mjs)
npm run test:unit    # 저장소 전체 Node 단위 테스트 (tests/*.test.cjs)
```

- Node 단위 테스트는 내장 `node:test`와 `node:assert/strict`만 씁니다. Python 테스트는 표준 `unittest`를 씁니다.
- 외부 API는 가짜 응답(fixture)이나 주입한 `fetch`로 대체합니다. 실제 키가 필요한 실환경 확인은 환경 변수로 켜야만 실행되고 기본값은 건너뜀입니다.
- `scripts/run_public_tests.mjs`는 고정 목록 51개 파일만 실행합니다. 선정 기준:
  1. `web/` 안의 파일만 읽는다 (`docs/`, `tests/fixtures/`, 내부 `scripts/`, `web/vercel.json` 등 공개 스냅샷에 없는 파일을 읽지 않는다).
  2. API 키가 필요 없고 외부 네트워크를 쓰지 않는다. 러너는 키·토큰·`*_LIVE` 이름의 환경 변수를 넘기지 않고, `scripts/public_test_network_guard.cjs`를 모든 테스트 프로세스에 미리 로드해 루프백 이외의 DNS 조회·`fetch`를 막고 기록합니다. 한 번이라도 시도하면 실행 전체가 실패합니다.
  3. 공개 sync의 비밀값 패턴 검사에 걸리는 문자열(가짜 키라도 `API_KEY:'...'` 형태)이 없다.
- 공개 목록에서 뺀 테스트와 이유:

| 이유                                                                | 테스트                                                                                                                                                                                                                |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/fixtures/` 필요                                              | `access_evidence`, `place_data_api`                                                                                                                                                                                   |
| 내부 `scripts/` 필요                                                | `agent_aa_rich_tour_audit`, `agent_u_accessibility_quality`, `nationwide_tour_catalog`                                                                                                                                |
| 공개 제외 파일(`web/vercel.json`, `web/photo-candidates.json`) 필요 | `deployment_policy`, `legacy_retirement_independence`, `vercel_cutover_stage1`, `place_photos`                                                                                                                        |
| 공개본은 사진 목록을 비워 내보내므로 기대값이 다름                  | `place_photo_display`, `tour_official_image`                                                                                                                                                                          |
| 실환경 키가 있어야만 실행 (기본 건너뜀)                             | `accessibility_provider_smoke`                                                                                                                                                                                        |
| 가짜 키 문자열이 공개 sync 비밀값 패턴에 걸림                       | `agent_aa_rich_tour`, `agent_r_naver_route`, `daechi_places_catalog`, `featured_catalog`, `itinerary_trip_endpoints`, `legacy_accessibility_parity`, `mvp_integration_api`, `nearby_location_search`, `server_travel` |

- 테스트를 새로 공개 목록에 넣을 때는 위 3가지를 확인하고, 공개 sync 경로 목록에도 같은 파일을 추가합니다. 목록의 파일이 없으면 러너가 실패하므로 빠진 경로가 바로 드러납니다.

## 6. 커밋 · PR 규칙

- 커밋 제목: `type(scope): 요약` 형식을 주로 씁니다. `type`은 `feat`, `fix`, `ci`, `docs` 등이고 `scope`는 `plan`, `weather`, `wizard`, `catalog`, `sync`처럼 기능 영역입니다. 관련 작업 ID가 있으면 괄호로 붙입니다 (예: `fix(wizard): ... (UI-02)`, `feat(catalog): ... (DATA-02, F04-01)`). 한국어·영어 모두 씁니다.
- 작업마다 전용 브랜치를 만들고 PR로 `main`에 병합합니다. `main`에 직접 push하거나 force push하지 않습니다.
- PR 본문은 저장소 PR 템플릿을 따릅니다: 작업 ID, 변경 내용과 선행조건, 테스트와 증거(정상·오류·빈 상태, 데이터·보안 확인, 미리보기·배포 ID, 수락 여부, 롤백 계획).
- PR 전에 최신 `main`을 병합하고 번들 일치 검사와 단위 테스트를 실행해 결과를 본문에 적습니다. 실행하지 못한 검사는 실행하지 못했다고 적습니다.
- 비밀값·개인정보·내부 배포 주소는 코드·테스트·문서·커밋 어디에도 넣지 않습니다. 키는 이름만 다룹니다.
