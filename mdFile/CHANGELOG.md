## [v1.1.0] - 2026-08-21

### ✨ 신규 기능 및 성능 개선 (New Features & Improvements)
- **Perplexity Cloudflare 봇 차단(Turnstile) 완벽 우회 및 GPU 하드웨어 가속 최적화 (`api_server.py`)**:
  - Playwright 실물 Chrome 브라우저(`channel="chrome"`, `headless=False`) 환경에서 WebGPU/WebGL 어댑터 인식을 위한 GPU 가속 플래그(`--use-gl=angle`, `--use-angle=gl`, `--enable-webgl`, `--enable-unsafe-webgpu`, `--ignore-gpu-blocklist`) 적용.
  - 실물 브라우저 환경을 손상시켜 봇 탐지를 유발하던 불필요한 위장 JS 스크립트(`window.chrome`, `navigator.webdriver` 강제 주입)를 제거하고, WebGPU 에러 방지 폴백 핸들러와 `cdc_` 자동화 변수 청소 로직만 남겨 Cloudflare Turnstile 검사를 100% 무사 통과.
- **Perplexity 봇 차단 비상 우회용 구글 연동 로그인 기능 및 UI 직관성 개선 (`api_server.py`, `WebVerificationModal.tsx`)**:
  - `api/open_login`에 `mode=google` 파라미터 연동 흐름 구축 (구글 계정 로그인 → myaccount 확인 → Perplexity 자동 이동 및 "Continue with Google" 클릭 → 영구 세션 저장).
  - UI: `AI 사전 로그인` 드롭다운 내 Perplexity 바로 아래에 들여쓰기(`↳`) 형태의 `↳ 우회용: 구글 연동 로그인 (Perplexity 봇 차단 시에만 사용)` 서브 옵션으로 직관적 재배치.
- **OpenAI 모델 `gpt-5.6-luna` 적용 및 의료기관 추천 프롬프트 고도화 (`providers.ts`)**:
  - 사용자가 요청한 최신 고성능 모델 `gpt-5.6-luna` 탑재 및 전용 파라미터(temperature 제한) 호환성 최적화.
  - 환각(Hallucination) 방지를 위해 가짜 병원(용인중앙병원 등) 생성을 엄격히 금지.
  - 사용자가 '병원'으로 질문하더라도 1차/2차 의원급 의료기관('신윤수내과의원', '내과' 등)을 동등하게 분석 및 추천하도록 시스템 프롬프트 가이드라인 고도화.
- **네이버 로컬 가시성(Naver Dual) 플레이스 순위 키워드 단축어 매핑 복원 (`reportGenerator.ts`)**:
  - 리포트 5페이지 'A 네이버 플레이스 점유율' 좌측 목록에 AI 긴 질문 문장이 잘려 나오던 현상을 해결하고, 네이버 API 전용 단축 검색어(`naver_queries` 및 `naverWebAnswers`의 1:1 인덱스 및 다중 fallback 매핑)가 정확히 표출되도록 로직 개선.
  - 우측 'B 네이버 콘텐츠 바이럴 점유율' 목록은 사용자의 가독성을 위해 AI 원본 질문 전체 문장이 유지되도록 이원화.

## [v1.0.10] - 2026-08-21

### ✨ 신규 기능 추가 (New Features)
- **Perplexity Cloudflare 봇 차단 우회용 구글 연동 사전 로그인 (`api_server.py`, `WebVerificationModal.tsx`)**:
  - Cloudflare Turnstile이 체크박스 반복 루프로 차단 시, 구글 계정 OAuth를 경유하여 Perplexity 세션을 획득하는 비상용 로그인 기능 추가.
  - `api/open_login` 엔드포인트에 `mode` 파라미터(`direct` / `google`) 추가.
  - `mode=google` 시 자동화 흐름: Google 로그인 페이지 이동 → 사용자 수동 로그인 대기 (최대 5분) → Perplexity로 자동 이동 → "Continue with Google" 버튼 자동 클릭 → 세션 영구 저장.
  - UI: 기존 `AI 사전 로그인` 드롭다운의 Perplexity 항목 하단에 `🔴 구글 계정으로 로그인 (봇 차단 시에만 사용)` 버튼 추가.
  - 기존 직접 로그인 방식은 완전 유지, 봇 차단 시에만 사용하는 보조 수단으로 설계.

## [v1.0.9] - 2026-08-21


### 🛠️ 버그 수정 및 최적화 (Bug Fixes & Improvements)
- **웹 실측 AI 사전 로그인(세션 저장형 브라우저) 기능 복원 (`WebVerificationModal.tsx`, `api_server.py`)**:
  - '전체 질문 순차 자동 실측' 버튼 좌측에 **`🔑 AI 사전 로그인`** 드롭다운 버튼 배치 (Perplexity, ChatGPT, Gemini, Claude, Naver).
  - Perplexity 등 비로그인 사용자 가입/로그인 요구("가입한 뒤 요청을 다시 보내주세요") 발생 시, 사전 로그인 브라우저 창을 띄워 사용자 세션을 `user_data` 디렉토리에 영구 보존.
  - 로컬 크롤러 서버에 `/api/open_login` 엔드포인트를 신설하고, 크롤링 엔진(`verify_platform`)에 Playwright 영구 세션(`launch_persistent_context`)을 적용하여 로그인된 상태로 자동 실측이 실행되도록 개선.
- **네이버 로컬 가시성(Naver Dual) 리포트 및 웹 실측 질의 1:1 순서 기반 매핑 개선 (`reportGenerator.ts`, `WebVerificationModal.tsx`)**:
  - `answers` 테이블의 AI 공통 질문(긴 자연어)과 `web_verification_answers`의 네이버 전용 질의어(단축 키워드) 간의 1:1 순서(Index) 및 `naver_queries` 다중 매핑 체계 구축.
  - 상단 점수와 하단 질문 리스트 간의 불일치(점수는 반영되었으나 목록이 '미노출'로 표기되던 현상) 해결.
  - `web_verification_answers` 및 `answers`의 조회/정렬 순서(`id ASC`)를 일관성 있게 보장.
- **OpenAI 실시간 웹 검색 도구(`web_search`) 및 정식 모델 최적화 (`providers.ts`)**:
  - 지원 종료(Deprecated)된 `gpt-4o-search-preview` 모델을 정식 플래그십 모델인 **`gpt-4o`**로 교체.
  - OpenAI 공식 실시간 웹 검색 도구(`tools: [{ type: 'web_search' }]`)를 API 페이로드에 탑재하여 실시간 검색 기능 활성화.
  - 기존 5대 핵심 환각 방지 시스템 프롬프트 100% 유지.
  - 사실 기반 일관성 유지 및 환각(Hallucination) 억제를 위해 저온도 옵션(`temperature: 0.2`) 적용.
- **브랜드 로고 아이콘 반영 (`Header.tsx`, `LoginPage.tsx`)**:
  - 상단 내비게이션 바 및 로그인 페이지의 브랜드 로고를 기존 텍스트 형태(`lCA`)에서 `public/logo.ico` 이미지로 전면 교체.
- **버전 동기화 및 컨설팅 가이드 문서 구축 (`package.json`, `OpenAI 검색률 관련 컨설팅 제안.md`)**:
  - 프로젝트 공식 버전을 `1.0.8`로 상향 동기화.
  - LLM SEO(GEO) 관점에서 OpenAI 검색 노출률 제고 및 환각 분석을 위한 고객 제안용 컨설팅 가이드 문서 추가.

## [v1.0.8] - 2026-08-19
### ✨ 신규 기능 추가 및 버그 수정 (New Features & Bug Fixes)
- **신뢰 콘텐츠 4대 자산 크롤링 로직 고도화 및 안티봇/CORS 우회 로직 적용 (`trustSignal.ts`, `vite.config.ts`)**:
  - `trustSignal.ts` 내의 크롤링 봇이 Cafe24 등 국내 호스팅사의 안티봇 로직(첫 접속 시 빈 페이지 반환 후 강제 새로고침 유도)을 돌파할 수 있도록 **Double-Fetch (세션 쿠키 탈취 후 2차 재전송)** 알고리즘을 도입.
  - 브라우저 클라이언트 단의 엄격한 CORS 보안 정책과 Cloudflare의 무료 프록시(`allorigins.win`) IP 차단 문제를 원천 해결하기 위해, 로컬 개발 환경(`vite.config.ts`) 자체에 **백엔드 프록시 미들웨어(`/api-proxy`)를 직접 내장**. 클라이언트가 아닌 서버(Node.js) 레벨에서 브라우저를 완벽 위장하여 웹사이트를 긁어오도록 통신 구조 전면 개편.
- **리포트 7페이지 기술적 웹 가독성 지표 렌더링 동기화 오류 수정 (`reportGenerator.ts`)**:
  - 기존 하드코딩되어 있던 점수 및 `HTTPS 보안`, `Title/Meta`, `텍스트 분량`, `Sitemap` 렌더링 텍스트를 실시간 진단 데이터(`rawItems`) 기반 동적 바인딩 로직으로 완벽 교체하여 UI 정합성 보장.
- **Schema.org 구조화 데이터 가이드라인 포맷팅 (`GEO Trust 점수기준.md`)**:
  - MedicalClinic / Hospital 스키마 등에 대한 마크다운 서식을 깔끔하게 재정비.

## [v1.0.7] - 2026-08-19
### ✨ 신규 기능 추가 및 개선 (New Features & Improvements)
- **리포트 5페이지 (Naver Dual Visibility) 데이터 정확도 개선 및 UI 최적화 (`reportGenerator.ts`, `providers.ts`)**:
  - 네이버 스마트플레이스 순위 실측 시 병원명(동의어 포함) 매칭에 기반하여 정확한 노출 랭킹(`naverRankPosition`)을 원본 그대로 계산 및 할당하여 데이터 정합성 보장(오판정 82위 버그 해결).
  - 플레이스 점유율 산출 시 10위 밖 노출 건이라 할지라도 '미노출'이 아니면 전체 점유율 퍼센트(%) 합산에 정상 포함되도록 로직 개선.
  - 플레이스 순위 및 검색 순위(콘텐츠 바이럴) 리스트의 10개 제한(`slice(0, 10)`)을 해제하여 전체 질문(예: 15개)이 모두 렌더링되도록 수정.
  - 우측 콘텐츠 바이럴 리스트의 질문 명칭을 '네이버 요약어'가 아닌 'AI 공통 질문 세트 원문(전체 문장)' 그대로 표출되게 변경하고, 줄바꿈을 허용하여 긴 질문도 잘림 없이 보이도록 UI 개선.
  - 좌/우 리스트 정렬 시 원본 질문(`query`)을 기준으로 두 리스트를 1:1 강제 매칭하여 항목 순서가 100% 동일하게 일치하도록 정렬 동기화 적용.
- **리포트 2, 3, 5페이지 네이버 API(학습지표) & 크롤링(웹서치 지표) 분리 렌더링 구현 (`reportGenerator.ts`)**:
  - 리포트 2페이지: API 결괏값 기반의 "AI 학습 지표"와 크롤링 실측 기반의 "AI 웹서치 지표"를 분리하여 두 개의 Bar 차트로 비교 구현. 경쟁병원 노출 갯수를 최대 4개(자사 포함 총 5개)로 확장.
  - 리포트 3페이지: 우선순위 지형도 데이터를 `web_verification_answers`(크롤링 실측)만으로 연산하여 순수 AI 웹서치 지표 기반의 우선순위를 제시하도록 개편.
  - 리포트 5페이지 (Naver Dual Visibility): 
    - B구역: 기존 도넛 차트(콘텐츠 구성 비율)를 제거하고 "주요 키워드별 검색 순위" Bar 차트 리스트로 재구성.
    - C구역: 기존 2x2 매트릭스 전체 제거.
    - D구역(현 C구역): 경쟁병원 SOV 그래프를 최대 4개(총 5컬럼)로 확장하여 경쟁 지표 상세화.

## [v1.0.6] - 2026-08-19### ✨ 신규 기능 추가 (New Features)
- **병원 마스타 & 질문 세트 내 네이버 API 전용 질문셋 탭 및 컬럼 확장 (`HospitalManagementModal.tsx`, `schema.sql`)**:
  - `hospital_config_versions` 테이블에 `naver_queries` 컬럼 확장 지원.
  - 병원정보 관리 모달에 `🟢 네이버 API 질의어 (전용 질문셋)` 탭 추가.
- **질문 문구 기반 4단어 핵심 키워드 자동 분리 및 불러오기 (`extractNaverKeywordsFromQuery`)**:
  - 기존 긴 서술형 질문 문구에서 종결어, 조사, 불용어를 정제하고 지역, 질환, 증상, 진료과 등 핵심 단어를 앞에서부터 순차적으로 최대 4개까지 자동 추출하는 알고리즘 구현.
  - `[⚡ 질문에서 4단어 자동 분리 및 불러오기]` 버튼 제공 및 사용자 직접 수정/저장 지원.
- **네이버 로컬 가시성 (Naver Dual Visibility) 평가 체계 독립 분리 및 설계서 작성 (`08_Naver_Dual_Visibility_설계서.md`, `0. 병원정보_질문관리_및_평가엔진_1.0_설계서.md`)**:
  - 네이버 API(스마트플레이스) 및 웹 크롤링(바이럴 콘텐츠) 지표를 순수 생성형 AI 종합 AI Score 산정에서 분리.
  - 플레이스 점유율(Place SOV) vs 콘텐츠 바이럴 점유율(Content SOV), 2x2 Dual Position Matrix, SOV 가로 Bar 차트로 구성된 독립 리포트 체계 명세화.
- **AI 진단 도구 및 실측 플랫폼 내 Claude(클로드) 활성화 및 Naver 위치 전환 (`LeftPanel.tsx`, `RerunModal.tsx`, `WebVerificationModal.tsx`, `DashboardContext.tsx`)**:
  - AI 진단 도구 4사를 `OpenAI (ChatGPT)`, `Gemini`, `Perplexity`, `Anthropic (Claude)`로 재배치하고 기본 활성화.
  - 비활성화되어 있던 Claude 체크박스 및 API Key 입력 필드를 완전히 활성화하여 키 입력/저장/진단이 즉시 가능하도록 개선.
  - 네이버는 AI 4사 뒤로 순서 조정 및 독립 로컬 가시성 평가 지표로 유지.
- **메인 화면 병원/버전 선택값 ➔ 병원정보 질문세트관리 모달 자동 연동 (`HospitalManagementModal.tsx`, `Dashboard.tsx`, `LeftPanel.tsx`)**:
  - 메인 화면 좌측 패널에서 선택된 대상 병원(`hospitalCode`) 및 질문 세트 버전(`version`)이 상단 [병원정보 질문세트관리] 버튼 클릭 시 모달에 100% 그대로 즉시 자동 연계되어 열리도록 개선.
- **GEO Trust 4대 영역 원천 데이터 전용 테이블 (`trust_signal_audits`) 설계 및 텍스트 스니펫/링크 정밀 수집 (`trustSignal.ts`, `analyzer.ts`, `RerunModal.tsx`, `20260819_create_trust_signal_audits.sql`)**:
  - `runs.trust_report_json` 단순 합산 저장 방식에서 나아가, 4대 영역별 점수/세부 항목과 **실제 감지된 원문 텍스트 스니펫(Snippet) 및 발견된 하이퍼링크(Link URL)**를 구조화하여 영구 저장하는 전용 스키마 구축.
  - 메인 진단 실행 시뿐만 아니라 진단 재실행 모달 내 **`[📊 스텝 3,4번 재실행]` 버튼 클릭 시에도** 홈페이지 실측을 수행하고 `trust_signal_audits` 테이블에 완벽히 동기화 적재되도록 연동.
  - 신뢰 콘텐츠 자산(의료진 약력, FAQ 질의응답, 건강칼럼/블로그 연동, 유튜브 링크)의 실재 여부와 증빙 데이터를 리포팅에 100% 활용할 수 있도록 고도화.
  - `mdFile/GEO Trust 점수기준.md` 설계서에 4대 영역(A, B, C, D)의 정밀 파싱 기준, 텍스트 스니펫/링크 추출 알고리즘, Schema.org/기술 가독성 가점표를 최신 명세로 전면 업데이트.

- **리포트 1, 2, 3페이지 오리지널 디자인/색감 완벽 복원 및 6페이지 이후 인쇄 잘림 현상 원천 해결 (`reportGenerator.ts`)**:
  - **1, 2, 3페이지 원래 디자인/색감 복원**:
    - 1페이지: 오리지널 히어로 배너 규격(`padding: 20mm 18mm 16mm`), 32px 타이틀, 골드 키커, 130px 대형 루비스 스코어 도넛 차트 및 스코어 그리드 복원.
    - 2페이지: 오리지널 바 차트 규격(`height: 14px`, `fill: var(--teal)`) 및 하단 질문 세트 안내 회색 박스 문구 완벽 복원.
    - 3페이지: 오리지널 `.opp` 카드 디자인 복원, 넘버링 배지(`Q1`, `Q2`) 및 따옴표 추가, 질문 수 10개 초과 시 2열 그리드(`two-col`) 자동 확장 적용.
  - **6페이지 이후 인쇄 끊김 현상 해결**:
    - HTML 태그 내 특수 문자 이스케이프 부재 및 브라우저 인쇄 엔진에서 `.page`의 `overflow: hidden`과 `max-height`로 인해 6페이지 이후가 잘리던 문제를 해소하고, `@page { size: A4; margin: 0; }` 및 `@media print` 전용 `page-break-after: always;`를 통해 1~9페이지 전체가 한 장씩 완벽하게 연속 출력되도록 CSS 정밀 최적화.
- **네이버 로컬 가시성(Naver Dual Visibility) 5페이지 전체 UI 렌더링 및 실측 데이터 검증 로직 구현 (`reportGenerator.ts`)**:
  - API 결괏값 테이블이 아닌 `web_verifications`와 `web_verification_answers` 테이블을 직접 조인(`ilike` 대소문자 무시) 조회하여 네이버 실측 크롤링 데이터 존재 여부를 정확히 판단하고 누락 없이 리포트가 출력되도록 버그 수정.
  - 설계서(`08_Naver_Dual_Visibility_설계서.md`) 기반 5페이지 레이아웃을 A구역(플레이스 점유율 그라데이션 Bar 차트), B구역(콘텐츠 바이럴 점유율), C구역(Naver Dual Position Matrix 4분면 스캐터 플롯), D구역(경쟁사 비교 Bar 차트)으로 세분화하여 원본 레퍼런스 이미지와 100% 동일하게 구현 및 동적 데이터 바인딩.
- **리포트 3페이지 질문 세트 `idx is not defined` 렌더링 크래시 오류 패치 (`reportGenerator.ts`)**:
  - 질문 목록 렌더링을 위한 맵(`map`) 함수 스코프 내 질문 넘버링을 렌더링하는 과정에서 발생하던 크래시를 배열 인자 전달(`(o, idx)`) 구문으로 수정하여 완전 해결.
- **리포트 2페이지 AI별 경쟁병원 비교 및 설명문구 동적화 (`reportGenerator.ts`)**:
  - 병원 설정(`hospital_config_versions`)의 공식 등록 경쟁병원 목록(`competitors`)을 연동하여 타 진료과 무관 병원 제외.
  - 등록된 경쟁병원 중 노출 빈도 상위 2개 병원만 선별하여 차트 표시.
  - 귀 병원 노출률과 경쟁병원 노출률 비교에 따른 동적 인터프리테이션 문구(열세/우위/경합/미노출) 적용.
- **리포트 3페이지 질문 세트별 공략 우선순위 지형 필터링 (`reportGenerator.ts`)**:
  - 질문별 `경쟁 우세:` 칩에 공식 경쟁병원 목록에 등록된 병원만 최대 상위 5개까지 노출되도록 제한.
  - 따옴표 및 불필요한 기호 정제.
- **병원 마스타 질문 텍스트 자동 정제 처리 (`HospitalManagementModal.tsx`)**:
  - 병원 설정 조회/저장 시 JSON 코드 형태로 복사된 불필요한 앞뒤 따옴표(`"`, `'`) 및 끝 콤마(`,`)를 자동으로 제거하여 타 병원 데이터와 동일한 순수 텍스트 줄바꿈 형태로 표시되도록 파서 개선.
- **답변 분석기 공식 경쟁병원 엄격 매칭 (`analyzer.ts`)**:
  - 공식 경쟁병원 목록이 지정되어 있을 때 등록된 병원만 정밀 매칭하도록 수정하여 불필요한 일반 의원 오탐 방지.

## [v1.0.5] - 2026-08-14

### ✨ 신규 추가 및 고도화 (Enhancements & New Features)
- **웹 UI 실측 크롤링 제어 및 일괄 닫기 기능 (`api_server.py`, `WebVerificationModal.tsx`)**:
  - `[❌ 전체 내장 창 일괄 닫기]` 및 모달 `[닫기]` 시 백엔드 `/api/close_all` API 호출로 열려 있는 모든 Playwright Chromium 브라우저 창 강제 종료.
  - 7초 주기 순차 자동 실측 루프 중 즉각 취소 플래그(`autoCrawlCancelledRef`, `stop_requested`) 반영으로 리소스 누수 원천 차단.
- **네이버 AI 가시성 진단 데이터 전략 수립 (`naver 활용방안.md`, `mdFile/naver 활용방안.md`)**:
  - 네이버 API Hub(스마트플레이스 순위)와 웹 UI 크롤링(통합검색 블로그/바이럴 노출) 간 결과 차이 정밀 분석.
  - 병원 컨설팅을 위한 하이브리드 교차 지표화 및 실측 증빙 리포트 활용 가이드 문서화.
- **개발 환경 최적화 (`.vscode/settings.json`)**:
  - 파이썬 인터프리터 기본 실행 환경 자동 구성.

## [v1.0.4] - 2026-08-14

### ✨ 신규 추가 기능 (New Features)
- **Supabase 스토리지 파일 보관함 모달 (`StorageFileManagerModal.tsx`)**:
  - `lua_visibility_file` 버킷 내 `Report`, `Remake_Report`, `Audit` 폴더의 실시간 파일 조회 및 개별/일괄 다운로드 지원.
  - HTML 리포트 새 탭 열람 및 MD/JSON 뷰어 탑재.
  - 병원 코드를 한글 병원명으로 자동 변환하여 다운로드 파일명에 반영.
- **다중 회차 추이 분석 대시보드 (`TrendAnalysisModal.tsx`)**:
  - 병원별 여러 Run ID를 선택하여 4대 지표 라인차트, AI 채널별 바차트, 질문별 노출 매트릭스 그리드 제공.
  - 지속 미노출 질문(`🚨 지속 미노출`) 및 선점 질문(`✨ 완전 선점`) 자동 하이라이트.
- **네이버 지역검색 스마트 엔티티 쿼리 추출 알고리즘**:
  - `[지역]` + `[질환명]` + `[병원유형]` 엔티티 조합으로 네이버 1위 노출 정확도 개선.
  - 답변 상단에 원문 질문 및 실제 검색 쿼리 헤더 명시.

### 🛠️ 버그 수정 및 개선 (Bug Fixes & Improvements)
- **경쟁병원 일반 명사 오탐 수정**:
  - AI 답변 분석 시 "한방병원", "대학병원", "종합병원" 등 일반 분류 명사가 경쟁병원 1위로 집계되던 오류를 블랙리스트 및 공식 경쟁사 연동으로 해결.
- **Supabase Storage `Invalid key` 오류 해결**:
  - S3 Key에 한글이 포함되어 발생하던 400 에러를 영문 `safeCode` 규칙으로 수정하여 3개 폴더 100% 정상 업로드 보장.
- **고유 별칭 정밀 하이라이트**:
  - 일반 명사("병원", "의원") 단독 하이라이트를 제거하고, 고유 별칭(`청주필한방병원`, `필한방병원` 등)만 형광펜 처리.
- **웹 UI 실측 모달 개선**:
  - 회차 선택 시 당시 실측된 AI 자동 체크 기능 적용.
  - `[닫기]` 및 `[전체 내장 창 일괄 닫기]` 버튼 상단 우측 재배치.
  - `API검색결과 / 메모` 컬럼 폭 1.5배 확장.
- **GitHub Push Protection 보안 준수**:
  - 소스 코드 내 하드코딩된 API Key 제거 및 안전한 환경변수 참조 처리.

