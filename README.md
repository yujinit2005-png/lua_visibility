# 🏥 루비스 (LUVIS) - AI 가시성(GEO) 자동 진단 및 모니터링 시스템

> **병원 브랜드를 위한 국내 유일의 생성형 AI 검색(GEO) 점유율 측정 및 실측 분석 통합 웹 솔루션**

---

## 📌 주요 기능 (Key Features)

1. **다중 AI 채널 자동 진단 및 가시성(GEO) 분석**
   - **ChatGPT, Google Gemini, Perplexity, Naver API Hub (지역검색)** 4대 플랫폼 동시 진단.
   - 키워드 질문별 실시간 AI 응답 수집, 병원 고유 별칭 감지 및 4대 핵심 지표 산출:
     - **평균 언급률(Mention Rate)**, **추천 포함률(Recommendation Rate)**, **상위 노출률(Top 1 Rate)**, **GEO 종합 가시성 점수**.
   - 경쟁병원 실시간 랭킹 및 시장 점유율 벤치마킹.

2. **웹 UI 실측 및 교차 비교 분석 (Playwright 엔진)**
   - 파이썬 크롤링 백엔드(`api_server.py`) 연동으로 실제 브라우저(UI) 화면 검색결과와 API 결과의 교차 검증.
   - 원문 질문 순차 자동 실측, 전체 내장 브라우저 창 일괄 닫기(`close_all`) 지원.
   - 실측 결과를 Supabase DB에 실시간 저장 및 리포트 즉시 생성.

3. **Supabase 스토리지 파일 보관함 (`lua_visibility_file`)**
   - 진단 완료된 리포트(HTML/MD) 및 감사 로그(Audit) 3대 디렉토리 자동 동기화.
   - 파일 목록 실시간 탐색, HTML 리포트 새 탭 열람 및 단일/일괄 다운로드.

4. **다중 회차 추이 분석 대시보드 (Multi-Run Trend Analysis)**
   - 병원별 여러 회차(Run ID)를 다중 선택하여 시계열 추이 분석.
   - 4대 지표 변화 라인 차트, AI 채널별 언급률 그룹 바 차트, 질문별 노출 매트릭스 그리드 제공.
   - 지속 미노출 취약 질문(`🚨 지속 미노출`) 및 선점 질문(`✨ 완전 선점`) 자동 분석.

5. **네이버 지역검색 스마트 엔티티 쿼리 추출 알고리즘**
   - 자연어 질문을 `[지역] + [질환] + [병원유형]` 엔티티로 정제하여 네이버 플레이스 1위 노출 정확도 극대화.

---

## 🛠️ 기술 스택 (Tech Stack)

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide React, Recharts
- **Backend / Crawler**: Python 3.x, Flask, Playwright (Chromium), Flask-CORS
- **Database & Storage**: Supabase (PostgreSQL, Storage Buckets, RLS Security)
- **AI Integrations**: OpenAI API (GPT-4o), Google Gemini 1.5, Perplexity API, Naver Search Open API

---

## 🚀 빠른 시작 가이드 (Quick Start)

### 1. 단독 앱 모드로 한 번에 실행
```cmd
start_app.bat
```
> 파이썬 크롤링 서버(Port 5000)와 Vite 프론트엔드(Port 5173)가 백그라운드로 실행되며 전용 앱 창이 자동으로 열립니다.

### 2. 수동 개발 모드 실행
```bash
# 1) 패키지 설치
npm install
pip install flask flask-cors playwright
playwright install chromium

# 2) 파이썬 크롤링 API 서버 실행 (터미널 1)
python src/services/api_server.py

# 3) 프론트엔드 개발 서버 실행 (터미널 2)
npm run dev
```

---

## 📂 문서 가이드 (`mdFile/`)

- [`01_System_Architecture_and_Overview.md`](file:///c:/1.RuaCompany/lua_visibility_Web/mdFile/01_System_Architecture_and_Overview.md): 시스템 아키텍처 및 데이터 흐름
- [`02_AI_Diagnosis_and_Providers.md`](file:///c:/1.RuaCompany/lua_visibility_Web/mdFile/02_AI_Diagnosis_and_Providers.md): AI 플랫폼별 연동 규격
- [`03_Naver_Local_Search_Hub.md`](file:///c:/1.RuaCompany/lua_visibility_Web/mdFile/03_Naver_Local_Search_Hub.md): 네이버 지역검색 알고리즘
- [`04_Web_Verification_and_Comparison.md`](file:///c:/1.RuaCompany/lua_visibility_Web/mdFile/04_Web_Verification_and_Comparison.md): 웹 UI 실측 및 교차비교
- [`05_Report_and_Storage_Management.md`](file:///c:/1.RuaCompany/lua_visibility_Web/mdFile/05_Report_and_Storage_Management.md): 리포트 및 스토리지 관리
- [`06_Multi_Run_Trend_Analysis_Dashboard.md`](file:///c:/1.RuaCompany/lua_visibility_Web/mdFile/06_Multi_Run_Trend_Analysis_Dashboard.md): 다중 회차 추이 분석 대시보드
- [`07_Database_Schema_and_Security.md`](file:///c:/1.RuaCompany/lua_visibility_Web/mdFile/07_Database_Schema_and_Security.md): DB 스키마 및 보안
- [`naver 활용방안.md`](file:///c:/1.RuaCompany/lua_visibility_Web/mdFile/naver%20%ED%99%9C%EC%9A%A9%EB%B0%A9%EC%95%88.md): 네이버 데이터 비교분석 및 컨설팅 전략
- [`CHANGELOG.md`](file:///c:/1.RuaCompany/lua_visibility_Web/mdFile/CHANGELOG.md): 버전별 업데이트 이력
