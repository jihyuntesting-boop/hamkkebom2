# 함께봄 (HAMKKEBOM)

부모님과 자동차로 여행하는 가족을 위한 지도 중심 여행 계획 서비스입니다. 인기보다 가족의 이동 부담과 조건을 고려하고, 접근성 정보를 출처와 함께 보여주는 것이 목표입니다.

- 운영 서비스: https://hamkkebom-omega.vercel.app/
- 팀: 남지현(팀장, 개발·통합), 이윤희(기획·요구사항·UX), 백수현(데이터·검증) — [기여 내역](docs/CONTRIBUTORS.md)

## 평가 범위

이 저장소는 비공개 개발 저장소의 main에서 선별한 공개 평가용 스냅샷입니다. 원본 Git 이력, 운영 설정, 실제 인증정보 및 내부 작업 기록은 포함하지 않습니다. 소스가 존재한다는 사실만으로 실환경 동작이 검증되었다는 뜻은 아닙니다. 확인 범위는 아래 제출 문서에 적었습니다.

- 지도 및 장소 탐색, 여행 조건 입력, 추천, 일정 작성·편집
- 컨디션에 따른 남은 일정 변경안과 가족 읽기 전용 링크
- 접근성 정보의 출처 및 확인 필요 상태 표시
- 관광·날씨·사진·자동차 이동 API는 서버 환경변수와 기능 플래그에 따라 지원 범위가 다르며, 사진 이용권이 확인되지 않은 경우 대체 표시를 사용합니다.
- 가족 공유는 URL에 담은 읽기 전용 요약이며 서버 저장·만료·회수 기능은 없습니다.

## 제출 문서

처음 보신다면 [심사 가이드](docs/JUDGE_GUIDE.md)의 5분 확인 순서부터 따라 해 보세요.

| 문서 | 내용 |
| --- | --- |
| [심사 가이드](docs/JUDGE_GUIDE.md) | 운영 사이트 5분 확인 순서, 알려 둘 제약, 지금은 피하면 좋은 경로(초안) |
| [요구사항서](docs/REQUIREMENTS.md) | 문제, 사용자, 기능 요구사항(ID·우선순위·수락 조건·현재 상태), 비기능 요구사항, 범위 밖 |
| [서비스 아키텍처](docs/ARCHITECTURE.md) | 구성도, API, 데이터 흐름, 배포, 공개 스냅샷 관계 |
| [검증 결과](docs/VERIFICATION.md) | 요구사항별 검증 방법·테스트 파일·결과, CI 실행 기록, 운영 URL 응답 확인 |
| [안정성·예외 복구](docs/STABILITY.md) | 운영 URL 장시간 저빈도 측정 결과, 코드의 시간 제한·재시도·폴백 사례 |
| [코드 컨벤션](docs/CODE_CONVENTION.md) | ESLint·Prettier·EditorConfig 규칙 |
| [생성형 AI 통합](docs/AI_INTEGRATION.md) | Claude API 자연어 조건 정리·일정 설명 기능의 구조와 상태(운영은 키 미등록으로 비활성) |
| [Git 저장소와 브랜치 전략](docs/GIT_WORKFLOW.md) | 원격 저장소 주소, 브랜치·PR 규칙, 공개 동기화 |
| [커밋·PR 이력 요약](docs/COMMIT_LOG.md) | 날짜별 병합 PR, 작성 계정별 커밋 수 |
| [팀원과 기여](docs/CONTRIBUTORS.md) | 팀 신고 기준 역할 분담 |
| [실사용자 피드백](docs/FEEDBACK.md) | 수집 상태(아직 수집 전), 설문·안내 문구·기록 표 |

## 평가 항목과 증빙

| 번호 | 평가 항목 | 증빙 |
| --- | --- | --- |
| 1 | 요구사항서·서비스 아키텍처 문서 | [REQUIREMENTS.md](docs/REQUIREMENTS.md), [ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| 2 | 기능 테스트 실행 로그·CI 증거 | [VERIFICATION.md](docs/VERIFICATION.md) §2~4, `.github/workflows/ci.yml`, `npm test` |
| 3 | 장시간 안정성·예외 복구 검증 | [STABILITY.md](docs/STABILITY.md), `scripts/stability_probe.mjs` |
| 4 | 생성형 AI 통합·실사용자 피드백 | [AI_INTEGRATION.md](docs/AI_INTEGRATION.md)(코드·모킹 테스트 완료, 운영은 `ANTHROPIC_API_KEY` 미등록으로 비활성), [FEEDBACK.md](docs/FEEDBACK.md)(실사용자 응답은 아직 수집 전) |
| 5 | 요구사항별 검증 체크리스트·결과 | [VERIFICATION.md](docs/VERIFICATION.md) §5 |
| 6 | 코드 컨벤션(ESLint/Prettier 등) | [CODE_CONVENTION.md](docs/CODE_CONVENTION.md), `eslint.config.mjs`, `.prettierrc.json`, `.editorconfig` |
| 7 | 원격 저장소 URL·브랜치 전략 | [GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md) |
| 8 | 팀원별 기여 | [CONTRIBUTORS.md](docs/CONTRIBUTORS.md), [COMMIT_LOG.md](docs/COMMIT_LOG.md) |

## 코드 구조

| 경로 | 역할 |
| --- | --- |
| web/index.html | 웹 진입점 |
| web/assets/core-src/ | 기능별 JavaScript 원본 |
| web/assets/scripts/ | 생성 번들과 보조 스크립트 |
| web/assets/styles/ | 화면 스타일 |
| web/api/ 및 web/server/ | API 핸들러와 서버 로직 |
| web/catalog/ | 장소 데이터 및 원천 정보 |
| scripts/build_core_modules.py | JS 번들 생성 및 일치 검사 |
| scripts/stability_probe.mjs | 운영 URL 저빈도 안정성 측정 |
| scripts/run_public_tests.mjs | 오프라인 공개 테스트 러너(외부 네트워크 차단) |
| tests/ | 공개 스냅샷에서 실행 가능한 단위 테스트 51개 |
| .github/workflows/ci.yml | 공개 저장소 CI(lint, format, 번들 일치, 공개 테스트) |
| docs/ | 제출 문서 |

## 실행 방법

Node.js 22.13 이상과 Python 3이 필요합니다.

```sh
npm ci
npm run lint          # ESLint, 0 errors 필요
npm run format:check  # Prettier(도구 파일 대상)
npm test              # 공개 테스트 51개 파일, 외부 네트워크 차단
python3 scripts/build_core_modules.py --check
```

2026-11-26 팀 실행 기록(자기보고): lint 0 errors, 공개 테스트 407건 중 406 통과·1 건너뜀(실연동 키가 필요한 선택 테스트).

정적 화면만 확인하려면:

```sh
python3 -m http.server 8000 --directory web
```

브라우저에서 http://localhost:8000 을 엽니다. 이 명령은 서버 API를 실행하지 않습니다. 지도 SDK는 공개본의 YOUR_NAVER_MAP_CLIENT_ID를 본인의 허용 도메인에 맞는 클라이언트 ID로 설정해야 합니다. 실제 API를 실행하려면 Vercel 등 호환 런타임과 공급자별 서버 환경변수 설정이 별도로 필요합니다. 이 저장소에는 운영 배포 설정이 포함되지 않습니다.

운영 URL 안정성 측정(읽기 전용 GET, 10초에 1회):

```sh
node scripts/stability_probe.mjs --minutes 35 --interval 10 --out stability-results
```

## 데이터 및 신뢰

- 한국관광공사 관광정보 및 무장애 정보: https://www.data.go.kr/data/15101578/openapi.do 및 https://www.data.go.kr/data/15101897/openapi.do
- 기상청 단기예보 및 기상특보: https://www.data.go.kr/data/15084084/openapi.do 및 https://www.data.go.kr/data/15000415/openapi.do
- 장소 카탈로그 출처와 이용 범위: [web/catalog/README.md](web/catalog/README.md)

공공시설 안내는 현장 이동 가능성의 보증이 아닙니다. 미확인 접근성, 예보, 경로, 사진은 검증된 사실과 구분해야 합니다. 실제 인증키나 개인정보를 커밋하지 마세요.

<!-- managed-hamkkebom-evaluation-snapshot-v1 -->
