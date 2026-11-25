# 함께봄 (HAMKKEBOM)

부모님과 자동차로 여행하는 가족을 위한 지도 중심 여행 계획 서비스입니다. 인기보다 가족의 이동 부담과 조건을 고려하고, 접근성 근거를 함께 보여주는 것이 목표입니다.

## 평가 범위

이 저장소는 개발 통합 브랜치에서 선별한 공개 평가용 웹 소스 스냅샷입니다. 원본 Git 이력, 운영 설정, 실제 인증정보 및 내부 작업 기록은 포함하지 않습니다. 소스가 존재한다는 사실만으로 실환경 동작이 검증되었다는 뜻은 아닙니다.

- 지도 및 장소 탐색, 여행 조건 입력, 추천, 일정 작성·편집
- 컨디션에 따른 남은 일정 변경안과 가족 읽기 전용 링크
- 접근성 정보의 출처 및 확인 필요 상태 표시
- 관광·날씨·사진·자동차 이동 API는 배포 버전에 따라 지원 범위가 다르며 실제 키, 데이터 및 실환경 검증이 필요합니다. 사진 이용권이 확인되지 않은 경우 대체 표시를 사용합니다.
- 가족 공유는 서버 저장·만료·폐기 기능이 검증된 것으로 간주하지 않습니다.

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

## 로컬 확인

Python 3으로 번들 일치 여부를 확인합니다.

```sh
python3 scripts/build_core_modules.py --check
python3 -m http.server 8000 --directory web
```

브라우저에서 http://localhost:8000 을 엽니다. 두 번째 명령은 정적 화면 확인용이며 서버 API를 실행하지 않습니다.

### API까지 함께 실행 (Node 18+)

```sh
cp .env.example .env.local   # 키 입력 (커밋 금지)
node scripts/dev_server.cjs --port 3000
```

http://localhost:3000 에서 화면과 `/api/*` 핸들러가 함께 동작합니다. 외부 의존성은 없습니다. 키가 없으면 날씨·대표 관광지는 `missing_service_key`, 이동시간은 `provider_disabled`로 응답하고, 장소·주변·추천은 저장소의 카탈로그 스냅샷으로 동작합니다. `HB_NAVER_MAP_CLIENT_ID`를 설정하면 개발 서버가 화면 JS의 자리표시자에 서빙 시점에만 넣어 주며 소스 파일은 바뀌지 않습니다. 지도 SDK는 공개본의 YOUR_NAVER_MAP_CLIENT_ID를 본인의 허용 도메인에 맞는 클라이언트 ID로 설정해야 합니다. 실제 API를 실행하려면 Vercel 등 호환 런타임과 공급자별 서버 환경변수 설정이 별도로 필요합니다. 이 저장소에는 운영 배포 설정이 포함되지 않습니다.

## 데이터 및 신뢰

- 한국관광공사 관광정보 및 무장애 정보: https://www.data.go.kr/data/15101578/openapi.do 및 https://www.data.go.kr/data/15101897/openapi.do
- 기상청 단기예보 및 기상특보: https://www.data.go.kr/data/15084084/openapi.do 및 https://www.data.go.kr/data/15000415/openapi.do
- 장소 카탈로그 출처와 이용 범위: [web/catalog/README.md](web/catalog/README.md)

공공시설 안내는 현장 이동 가능성의 보증이 아닙니다. 미확인 접근성, 예보, 경로, 사진은 검증된 사실과 구분해야 합니다. 실제 인증키나 개인정보를 커밋하지 마세요.

<!-- managed-hamkkebom-evaluation-snapshot-v1 -->
