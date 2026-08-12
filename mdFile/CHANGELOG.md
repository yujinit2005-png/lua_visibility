# LUVIS AI 가시성 진단기 - CHANGELOG

모든 중요 변경사항과 기능 추가, 버그 수정 내역을 일자별로 기록합니다.

---

## [v2.0.0-web] - 2026-08-13

### 🚀 React + TypeScript + Supabase 웹 마이그레이션 및 팝업 모달 4종 정밀 완성
- **웹 마이그레이션완료**: 기존 Python (Tkinter + SQLite + Playwright) 구조를 React 18, Vite, TypeScript, Supabase 기반 반응형 웹 애플리케이션으로 이관 완료.
- **모달 4종 정밀 복원 & 고도화**:
  - **`HospitalManagementModal.tsx`**: 병원 프로필 및 4종 질문/키워드 세트 CRUD 구현. UI 줄바꿈(`\n`) ↔ DB JSON 배열(`JSON.stringify`) 양방향 파싱 직렬화 이중화 처리.
  - **`RerunModal.tsx`**: 원작 파이썬 앱 1:1 컬러/폰트 배색 복원. 해당 회차 실행 AI 자동 체크, 스텝 3/4 (언급률/GEO준비도) 재산출 및 DB UPDATE 저장 반영. `Remake Report/` 폴더 저장 연동.
  - **`WebVerificationModal.tsx`**: 실측 플랫폼별(ChatGPT, Gemini, Perplexity, Claude) 노출 비교, 내장 뷰어 연동, 파이썬 매칭 차이사유/메모 자동 생성기(`generateDifferenceMemo`), 및 `📖 크롤링 결과 전체 펼쳐보기` 토글 연동. `🚀 전체 질문 순차 자동 실측` 프로세스 구현.
  - **`RunSelectionModal.tsx`**: 병원별 past Run 선택 팝업 구축.
- **Supabase Storage 업로드 분개 및 파일명 커스텀**:
  - **`Report/`**: 대시보드 메인 영업용 PDF 리포트 저장.
  - **`Remake Report/`**: 가시성 진단 재실행 모달 PDF 리포트 저장.
  - **`Audit/`**: 감사 데이터 JSON 저장.
  - 저장키 파일명에 영문 코드 대신 실제 병원명 반영 (`001_청주필한방병원_진단.pdf`).
- **Storage RLS 보안 정책 반영 (`schema.sql`)**:
  - `storage.objects` 테이블에 `lua_visibility_file` 버킷용 INSERT, SELECT, UPDATE RLS 보안 정책 추가.

---

## [v1.0.14] - 2026-08-12

### ⚙️ AI 진단 분리, 실패 질문 덮어쓰기 재실행 및 재생성 오류 수정 (GUI & Core)
- **1회당 제한시간 기본값 상향 (1000초)**: `limit_sec` 기본값을 600초에서 1000초로 변경.
- **AI 진단 실행과 PDF 생성 기능 분리**:
  - `🚀 AI 가시성 진단 실행`: AI 수집 및 2x2 기회지도 분석/DB 저장만 진행 (PDF 자동 렌더링 제외).
  - `📄 영업용 진단 PDF 생성`: 최신/선택된 DB Run 데이터로 독립적 PDF 리포트 출력.
- **실패 질문 개별/일괄 재실행 & 기존 진단 SEQ 덮어쓰기 (UPDATE)**:
  - `Storage.overwrite_answer()` 및 `recalculate_run_stats()` 신설. 재실행 시 기존 `run_id` 레코드를 UPDATE로 덮어쓰고 성공률/노출률 자동 재산출.
  - 교차 비교 창 내 질문별 `⚡ 개별 재실행` 및 `⚡ 실패 질문 일괄 재실행` 버튼 구현.
- **from-run 재생성 임시 차단 오류 수정 (`regenerate.py`)**: `client+precision` 모드 재생성 시 무조건 차단(exit code 2)되던 레거시 코드 제거로 PDF 재생성 완벽 지원.

---

## [v1.0.13] - 2026-08-12

### 🌐 다중 PC 환경 PDF 생성 및 내장 뷰어 브라우저 호환성 강화 (Core & Verifier)
- **Playwright 바이너리 다중 론처 보강 (`sales_pdf.py`, `web_verifier.py`)**: Playwright Chromium 바이너리가 설치되지 않은 타 PC/배포 환경에서도 Windows 기본 MS Edge(`channel="msedge"`) 및 Chrome(`channel="chrome"`) 브라우저를 자동 탐지하여 1차 PDF 변환 및 내장 뷰어 실측 창이 정상 작동하도록 개선.
- **2차 헤드리스 PDF 폴백 고도화**: MS Edge 검색 경로를 사용자 계정 폴더(`%LOCALAPPDATA%`) 및 32/64비트 Program Files로 확장하고, 최신 Edge `--headless=new` 및 `--no-sandbox` CLI 옵션 적용 및 구버전 CLI 자동 재시도 로직 구현.
- **내장 뷰어/순차 자동 실측 미열림 현상 방지**: 브라우저 론칭이 차단되는 사내 보안 환경일지라도 시스템 기본 웹 브라우저(`webbrowser.open`)로 해당 URL 탭을 강제 오픈하는 예외 처리 수록.
- **실행파일(.exe) 재컴파일 완료**: `build.py` 패키징 완료 (`LUVIS_AI가시성진단기.exe`, 55.6MB).

### 🚀 웹 마이그레이션 종합 기획 명세서 작성 (Docs & Architecture)
- **`Mig_to_Web.md` 신설**: Python (Tkinter + SQLite + Playwright) 기반 소스코드를 React (TypeScript) + Supabase + Cloudflare 사양으로 이관하기 위한 5단계 기술 명세서 및 AI 에이전트 전용 한방 실행 프롬프트 작성.
