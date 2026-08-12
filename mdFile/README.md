# LUVIS AI Visibility Web Application (v2.0)

대형 언어 모델(ChatGPT, Google Gemini, Perplexity 등)에서 특정 병원이 얼마나 노출되고 추천되는지를 실시간으로 측정, 검증 및 분석하는 **LUVIS AI 가시성 진단 웹 웹 애플리케이션**입니다.

---

## 🚀 주요 웹 기능 (Key Features)

1. **실시간 AI 가시성 진단 엔진 (Realtime AI Diagnostic Engine)**
   - OpenAI(ChatGPT), Google Gemini, Perplexity API 연동을 통한 질문별 노출 및 추천 확률 자동 산출.
   - N회 반복 측정 및 불안정 구간(노이즈) 자동 판정.
   - 비동기 작업 취소(`AbortController`) 및 중단 버튼 제어.

2. **정밀 모달 팝업 4종 (Interactive Dashboard Modals)**
   - **⚙️ 병원 정보 & 질문 세트 관리 (`HospitalManagementModal`)**: 병원 기본 정보 및 별칭/지역키워드/경쟁사/질문문구 관리. 줄바꿈(`\n`) UI ↔ JSON 배열 DB 직렬화 자동 변환.
   - **🔄 가시성 진단 재실행 (`RerunModal`)**: 실패 질문 선택적 재실행, 스텝 3/4 (언급률/GEO준비도) UPDATE 저장 및 `Remake Report/` 전용 PDF 리포트 생성.
   - **🌐 웹 UI 실측 및 교차 비교 (`WebVerificationModal`)**: 실측 플랫폼별(ChatGPT, Gemini, Perplexity, Claude) 노출 비교, 내장 뷰어 연동, 파이썬 매칭 격차 사유/메모 자동 생성기 및 전체 질문 순차 자동 실측.
   - **⚙️ 측정 회차(Run) 선택 (`RunSelectionModal`)**: 병원별 과거 진단 이력(Run) 선택 팝업 연동.

3. **자동ized 리포트 생성 & Supabase Storage 연동 (`reportGenerator.ts`)**
   - HTML, Markdown, PDF 리포트 및 Audit JSON 자동 생성.
   - **`Report/` 폴더**: 대시보드 메인 영업용 리포트 저장.
   - **`Remake Report/` 폴더**: 가시성 진단 재실행 모달 리포트 저장.
   - **`Audit/` 폴더**: 감사/로그 데이터 JSON 보관.
   - 파일명 내 실제 병원명 반영 (예: `001_청주필한방병원_진단.pdf`).

---

## 🛠️ 기술 스택 (Tech Stack)

* **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Lucide React
* **Backend & DB**: Supabase PostgreSQL (Row Level Security, Storage RLS)
* **PDF Engine**: html2pdf.js / html2canvas / jsPDF
* **Icons & UI**: Lucide Icons, Custom Modern Dark/Light Design Token

---

## 💻 개발 및 실행 (Getting Started)

### 1) 패키지 설치
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

---

## 🗂️ 프로젝트 디렉토리 구조 (Directory Layout)

```
lua_visibility_Web/
├── .agents/                                # 프로젝트 전용 에이전트 지침 및 스킬
├── public/                                 # 파비콘 및 정적 자산
├── src/
│   ├── components/
│   │   ├── dashboard/                      # 대시보드 및 팝업 모달 5종
│   │   │   ├── HospitalManagementModal.tsx # 병원 및 질문 세트 관리 모달
│   │   │   ├── IframeModal.tsx             # 내장 뷰어 브라우저 모달
│   │   │   ├── LeftPanel.tsx               # 진단 설정 및 실행 패널
│   │   │   ├── RerunModal.tsx              # 진단 재실행 및 스텝 3,4 모달
│   │   │   ├── RightPanel.tsx              # 실시간 로그 및 현황 패널
│   │   │   ├── RunSelectionModal.tsx       # 회차 선택 모달
│   │   │   └── WebVerificationModal.tsx    # 웹 UI 실측 및 교차 비교 모달
│   ├── contexts/                           # 대시보드 상태 관리 전역 Context
│   ├── hooks/                              # Supabase 커스텀 훅 (useHospitals 등)
│   ├── lib/                                # API 클라이언트, 리포트 생성기, Supabase 연동
│   └── pages/                              # 메인 대시보드 페이지
├── supabase/
│   └── migrations/
│       └── schema.sql                      # Supabase DDL 및 RLS 정책
└── mdFile/                                 # 마이그레이션 문서 및 컨텍스트 모음
```
