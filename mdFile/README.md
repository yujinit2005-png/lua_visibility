# LUVIS AI Visibility Web Application (v1.0.9)

대형 언어 모델(ChatGPT, Google Gemini, Perplexity, Naver API Hub, Claude 등)에서 특정 병원이 잠재 환자 질문에 얼마나 노출되고 추천되는지를 실시간으로 측정, 검증 및 분석하는 **LUVIS AI 가시성 진단 시스템**입니다.

---

## 📚 세부 기능별 기술 문서 (Documentation Index)

1. [01. 시스템 아키텍처 및 전체 기능 개요](./01_System_Architecture_and_Overview.md)
2. [02. AI 진단 엔진 및 프로바이더 연동](./02_AI_Diagnosis_and_Providers.md)
3. [03. 네이버 지역검색 API Hub 연동 및 스마트 쿼리 추출](./03_Naver_Local_Search_Hub.md)
4. [04. 웹 UI 실측 및 교차 비교 분석](./04_Web_Verification_and_Comparison.md)
5. [05. 리포트 생성 및 스토리지 관리](./05_Report_and_Storage_Management.md)
6. [06. 다중 회차 가시성 추이 분석 대시보드](./06_Multi_Run_Trend_Analysis_Dashboard.md)
7. [07. 데이터베이스 스키마 및 보안 규칙](./07_Database_Schema_and_Security.md)
8. [08. 네이버 로컬 가시성(Naver Dual) 설계서](./08_Naver_Dual_Visibility_설계서.md)
9. [업데이트 이력 (CHANGELOG)](./CHANGELOG.md)

---

## 🛠️ 기술 스택 (Tech Stack)

* **Frontend**: React 19, Vite, TypeScript, Tailwind CSS, Lucide React, Recharts
* **Backend & Storage**: Supabase PostgreSQL, Supabase Storage (`lua_visibility_file`)
* **AI Providers**: OpenAI (`gpt-4o` + `web_search`), Google Generative AI (`gemini-2.0-flash`), Perplexity AI (`sonar-pro`), Naver API Hub (Local Search), Anthropic (`claude-3-5-sonnet`)
* **Proxy Engine**: Vite Reverse Proxy (`/api-openai`, `/api-perplexity`, `/api-anthropic`, `/api-naver`, `/api-proxy`)

---

## 💻 빠른 시작 가이드 (Quick Start)

### 1) 의존성 설치
```bash
npm install
```

### 2) 로컬 개발 서버 실행
```bash
npm run dev
```

### 3) 프로덕션 빌드
```bash
npm run build
```
