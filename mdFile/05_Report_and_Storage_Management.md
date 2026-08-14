# 05. 리포트 생성 및 스토리지 관리 (Report & Storage Management)

## 📌 개요
진단된 데이터를 기반으로 고품질 영업용 5페이지 브라우저 PDF/HTML/Markdown 리포트 및 감사 JSON 데이터를 생성하고, Supabase Storage(`lua_visibility_file`)에 안전하게 저장 및 관리합니다.

---

## 📊 리포트 경쟁병원 일반 명사 오탐 방지

### 1. 문제 원인 및 해결
- AI 답변 분석 시 정규식이 일반 분류 명사(`"한방병원"`, `"종합병원"`, `"대학병원"`)를 경쟁병원으로 잘못 집계하여 차트 1위로 출력되던 버그 해결.
- **조치 내용**:
  1. `analyzer.ts`에 일반 분류 명사 블랙리스트 적용.
  2. `reportGenerator.ts`에서 병원 설정(`hospital_config_versions`)의 공식 `competitors` 목록 및 `aliases`를 연동하여 실제 병원 브랜드명만 차트에 집계.

---

## 📁 Supabase Storage 파일명 표준화 및 S3 Key 규칙

### 1. 파일명 생성 규칙
```text
[runid]_[병원명칭]_[yyyymmdd]_[seq].[확장자]
```

- **`runid`**: 3자리 숫자 (예: `045`)
- **`병원명칭`**: 정제된 병원명 (예: `청주필한방병원`)
- **`yyyymmdd`**: 생성 일자 (예: `20260814`)
- **`seq`**: 순번 (예: `01`)

### 2. S3 호환 Object Key 관리
Supabase Storage는 ASCII 외 비영문(한글) 경로를 `Invalid key`로 차단하므로, 스토리지 저장 키는 `safeCode`(`HOSP_001` 등)를 사용하여 안전하게 저장하고, 웹 화면 및 다운로드 시 한글 병원명으로 자동 치환합니다:

| 폴더 | 실제 스토리지 저장 경로 | 다운로드 시 자동 변환 파일명 | 파일 내용 |
|---|---|---|---|
| **`Report/`** | `Report/045_HOSP_001_20260814_01.html` | `045_청주필한방병원_20260814_01.html` | 정규 HTML 리포트 |
| **`Remake_Report/`** | `Remake_Report/045_HOSP_001_20260814_01.html` | `045_청주필한방병원_20260814_01.html` | 재실행 보완 리포트 |
| **`Audit/`** | `Audit/045_HOSP_001_20260814_01.json` | `045_청주필한방병원_20260814_01.json` | 진단 원본 전체 JSON |

---

## 🗄️ 스토리지 파일 보관함 모달 (`StorageFileManagerModal`)

- **3개 폴더 탭 전환**: `전체`, `Report`, `Remake_Report`, `Audit`
- **파일 목록 상세 정보**: 폴더명, 파일명, 확장자, 크기, 생성 일시
- **다운로드 & 미리보기**:
  - 개별 다운로드 및 **선택 파일 일괄 다운로드** 지원
  - HTML 파일 클릭 시 브라우저 새 탭에서 즉시 리포트 열람
  - MD / JSON 파일 내장 뷰어 제공
