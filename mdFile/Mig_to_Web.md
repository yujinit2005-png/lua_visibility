# 🚀 LUA AI 가시성 진단기 (LUVIS) 웹 마이그레이션 종합 개발 명세서 (Mig_to_Web.md)

> 본 문서는 기존 Python (Tkinter GUI + SQLite + Playwright) 기반 **LUVIS AI 가시성 진단기**를 **React + Node.js (TypeScript) + Supabase + Cloudflare** 사양의 웹 애플리케이션으로 100% 이관하기 위한 AI 에이전트 전용 완벽 마이그레이션 지침서입니다.

---

## 📐 1. 목표 웹 아키텍처

```mermaid
graph TD
    User([사용자 브라우저]) <--> React[React / Next.js Web UI (Cloudflare Pages)]
    React <--> Supabase[Supabase DB / Auth / Storage]
    React <--> CF_Workers[Cloudflare Workers / Edge Functions]
    CF_Workers <--> AI_APIs[AI APIs (OpenAI, Gemini, Perplexity (Claude 비활성화))]
    CF_Workers <--> Browserless[Cloudflare Browser Rendering / Browserless.io]
    Browserless --> PDF[PDF 리포트 생성 & 웹 UI 크롤링]
```

* **Frontend**: React.js / Next.js (TypeScript, Tailwind CSS, Lucide Icons)
* **Backend / Serverless**: Cloudflare Workers 또는 Supabase Edge Functions (TypeScript)
* **Database & Auth**: Supabase PostgreSQL (Row Level Security, Storage, Auth)
* **PDF & Browser Crawling**: Cloudflare Browser Rendering API 또는 Browserless.io (Puppeteer)

---

## 🗂️ 2. 소스 파일 대조 및 마이그레이션 매핑표

| 기존 Python 소스 | 역할 | 변환 대상 웹 컴포넌트 / 기술 |
| :--- | :--- | :--- |
| `lua_gui.pyw` (95KB) | 전체 Tkinter GUI 메인 화면 | React Dashboard App (`src/pages`, `src/components`) |
| `storage.py` (30KB) | SQLite DB CRUD 및 스키마 관리 | Supabase Client (`@supabase/supabase-js`) & SQL Migrations |
| `providers.py` (22KB) | AI 플랫폼별 (OpenAI, Gemini, Claude 등) API 호출 | Node.js API Service / Edge Functions (`src/services/ai/`) |
| `run.py` (25KB) | 진단 실행 엔진 & 질문 세트 오케스트레이터 | Backend Task Runner / Queue (`src/services/engine/`) |
| `sales_pdf.py` (70KB) | Jinja2 HTML 템플릿 & Playwright PDF 생성 | React-PDF 또는 Headless Browser PDF Engine (`/api/pdf`) |
| `web_verifier.py` (26KB) | 웹 UI 실측 접속 & Playwright 크롤링 | Cloudflare Browser Rendering API / Browserless.io |
| `analyzer.py` / `scorer.py` | 점수 산출 & 답변 키워드 분석 | TypeScript Core Analytics (`src/utils/analyzer.ts`) |
| `hospital_manager.py` | 병원 프로필 & 경쟁사/키워드 DB 관리 | Supabase React Query Hooks (`src/hooks/useHospitals.ts`) |

---

## 📋 3. 단계별 상세 마이그레이션 실행 플랜

### Phase 1: DB 스키마 생성 및 Supabase 연동 (`schema.sql`)
* **목표**: `lua_visibility.db` (SQLite) 스키마를 Supabase PostgreSQL DDL로 100% 변환.
* **주요 세부 과제**:
  1. `hospitals` (병원 정보, 별칭 JSONB, 지역)
  2. `runs` (진단 회차, 실행 모드, 점수, 실행 일시)
  3. `answers` (질문 ID, 질문 문구, AI 플랫폼, 언급 여부, 텍스트, 신뢰도 점수)
  4. `verification_items` (웹 UI 실측 교차 비교 결과, 캡처 이미지 URL, 수집 원문)
  5. `system_config` (API 키 및 시스템 설정)
  6. RLS (Row Level Security) 정책 작성 및 Supabase TypeScript 타입 정의 자동 생성 (`database.types.ts`).

### Phase 2: AI 엔진 및 API 레이어 이관 (Node.js / TypeScript)
* **목표**: `providers.py`, `run.py`, `regenerate.py` 파이썬 API 호출부를 Node.js API 서비스로 100% 이관.
* **주요 세부 과제**:
  1. **AI API 통합 클라이언트**: OpenAI (`gpt-4o`), Google Gemini (`gemini-1.5-pro`), Anthropic Claude, Perplexity API 호출 구현.
  2. **재생성 및 병렬 비동기 엔진**: `Promise.all` 및 스트리밍 기반 비동기 진단 엔진 구현.
  3. **분석기 및 스코어러**: `analyzer.ts`, `scorer.ts` 구현 (노출점수, 긍정점수, 신뢰도 점수 산출).

### Phase 3: React 대시보드 웹 UI 구현 (`Frontend`)
* **목표**: `lua_gui.pyw` Tkinter 윈도우 창을 반응형 웹 UI로 재구성.
* **주요 세부 과제**:
  1. **메인 화면 Layout**: 사이드바 (병원 선택, 진단 회차 선택), 상단 탭 navigation.
  2. **AI 진단 컨트롤러**: 플랫폼 선택, 진단 시작 버튼, 진행률(Progress Bar) 실시간 표시 (WebSockets / Supabase Realtime).
  3. **웹 UI 실측 & 교차 비교 테이블**: API 노출 vs 웹 UI 노출 비교 표, 내장 뷰어 팝업 모달, 크롤링 원문 뷰어 및 Markdown 리포트 다운로드.
  4. **실패 질문 보완 (Rerun) 모달 UI**: 개별/일괄 질문 재실행, 스텝 3/4 재산출, Report/Remake 경로용 별도 PDF 생성 제어 컴포넌트.
  4. **기회 영역 분석 & 리포트 뷰어**: 키워드 기회 카드, 경쟁사 비교 그래프 (Recharts / Chart.js).

### Phase 4: 웹 실측 크롤링 및 PDF 리포트 서버리스 구현
* **목표**: `sales_pdf.py` 및 `web_verifier.py` 브라우저 의존성 이관.
* **주요 세부 과제**:
  1. **웹 UI 실측 크롤러**: Cloudflare Browser Rendering API를 호출하여 AI 웹사이트 답변 캡처 및 DOM 텍스트 엑스트랙션.
  2. **PDF 리포트 생성기**: HTML/CSS 템플릿 기반 PDF 렌더링 서버리스 엔드포인트 `/api/generate-pdf` 구현.

### Phase 5: 환경변수 설정 및 배포 (Cloudflare Pages + Supabase)
* **환경변수 설정 (`.env`)**:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `OPENAI_API_KEY`
  - `GEMINI_API_KEY`
  - `CLAUDE_API_KEY`
  - `PERPLEXITY_API_KEY`
* **배포**: Cloudflare Pages (`npm run build`) 배포 및 Supabase Edge Functions 배포.

---

## 🤖 AI 에이전트 한방 실행용 프롬프트 (Instruction for AI Agent)

```text
[마이그레이션 실행 프롬프트]
Mig_to_Web.md 파일에 명시된 아키텍처에 따라 현재 파이썬 프로젝트(lua_visibility_engine)를 React + Node.js (TypeScript) + Supabase 웹 프로젝트로 변환해줘.

1. src/ 폴더에 React 대시보드 UI (Vite + TailwindCSS) 구축
2. supabase/migrations/에 PostgreSQL schema.sql 작성
3. src/services/에 AI Providers 및 진단 엔진 TypeScript 로직 작성
4. /api/pdf 엔드포인트 구현 (독립 재생성 API 포함)
5. 실패 질문 재수집(Rerun) 및 웹 UI 실측 교차검증 파이프라인 포팅
5. 기존 파이썬 데이터 구조와 100% 동일하게 동작하도록 완성해줘.
```
