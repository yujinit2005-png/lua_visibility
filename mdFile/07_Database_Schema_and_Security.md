# 07. 데이터베이스 스키마 및 보안 (Database Schema & Security)

## 📌 Supabase `answers` 테이블 스키마 (27개 컬럼)

진단 수집 데이터는 Supabase PostgreSQL `answers` 테이블의 정확한 컬럼 스키마와 100% 일치하여 저장됩니다:

| 컬럼명 | 데이터 타입 | 설명 |
|---|---|---|
| `id` | bigint (PK) | 고유 답변 ID |
| `run_id` | bigint (FK) | 진단 회차 번호 |
| `provider` | text | AI 프로바이더 (`openai`, `gemini`, `perplexity`, `naver`, `anthropic`) |
| `model` | text | 사용 모델명 (`gpt-4o`, `gemini-2.0-flash` 등) |
| `query` | text | 환자 질문 문구 |
| `rep_index` | integer | 반복 측정 회차 (기본값: 1) |
| `answer_text` | text | AI 응답 원문 |
| `ok` | boolean | 응답 수집 성공 여부 |
| `error` | text | 오류 메시지 |
| `mentioned` | boolean | 병원 언급 여부 |
| `recommended` | boolean | 병원 추천 포함 여부 |
| `first_position` | integer | 첫 언급 위치 (글자수 인덱스) |
| `competitors` | jsonb / text | 발견된 경쟁병원 목록 (일반 명사 제외) |
| `measured_at` | timestamp | 측정 일시 |
| `search_used` | boolean | 실시간 검색 사용 여부 |
| `citations` | jsonb / text | 인용 링크 목록 |
| `reviewed` | boolean | 검토 여부 |
| `review_verdict` | text | 검토 결과 |
| `task_id` | text | 비동기 태스크 ID |
| `question_id` | text | 질문 번호 (`QQ1`, `QQ2` 등) |
| `use_grounding` | boolean | 그라운딩 사용 여부 |
| `started_at` | timestamp | 요청 시작 일시 |
| `completed_at` | timestamp | 응답 완료 일시 |
| `duration_seconds`| numeric | 소요 시간(초) |
| `http_status` | integer | HTTP 응답 코드 (200, 429, 500 등) |
| `retry_count` | integer | 재시도 횟수 |
| `status` | text | 상태 (`completed`, `failed` 등) |

---

## 🏛️ Supabase `trust_signal_audits` 테이블 스키마 (GEO Trust 원천 데이터)

홈페이지의 기술적 GEO 가독성, 크롤러 접근성, 스키마, 신뢰 콘텐츠 자산(원문 스니펫 및 링크 포함)을 정밀 저장하는 테이블입니다:

| 컬럼명 | 데이터 타입 | 설명 |
|---|---|---|
| `id` | bigint (PK) | 고유 감사 레코드 ID |
| `run_id` | bigint (FK) | 진단 회차 ID (`runs.id`) |
| `hospital_code` | text (FK) | 대상 병원 코드 |
| `target_url` | text | 진단 대상 홈페이지 URL |
| `total_score` | integer | 종합 점수 (0~100점) |
| `grade` | text | 등급 (`우수`, `보통`, `취약`) |
| `geo_rate` | double precision | GEO 달성 비율 (0.00 ~ 1.00) |
| `crawler_score` | integer | A. AI 크롤러 점수 (25점 만점) |
| `schema_score` | integer | B. 구조화 데이터 점수 (30점 만점) |
| `content_score` | integer | C. 신뢰 콘텐츠 자산 점수 (25점 만점) |
| `technical_score`| integer | D. 기술적 가독성 점수 (20점 만점) |
| `crawler_details`| jsonb | 6대 AI 크롤러별 허용/차단 상태 및 규칙 |
| `schema_details` | jsonb | 발견된 스키마 종류 및 원본 JSON-LD 블록 |
| `content_details`| jsonb | 의료진/FAQ/칼럼/유튜브 **존재 여부, 텍스트 스니펫, 발견된 링크(URL)** |
| `technical_details`| jsonb | HTTPS, 타이틀, 메타설명, 텍스트 글자수, 사이트맵 |
| `full_report_json`| jsonb | 진단 리포트 전체 원본 백업 |
| `created_at` | timestamp | 감사 생성 일시 |

---

## 🔒 보안 및 시크릿 관리 (Security & Secret Protection)

1. **API Key 보안:**
   - 소스 코드 내 하드코딩된 API Key 문자열(`sk-proj-...`, `pplx-...` 등)을 완전히 제거하고, 환경 변수(`import.meta.env`) 및 Supabase `system_config` 테이블을 통해서만 안전하게 공급합니다.
   - Vite Reverse Proxy(`vite.config.ts`)를 경유하여 브라우저에서 API를 직접 호출하더라도 CORS 차단 및 Key 노출 문제를 최소화합니다.

2. **Row Level Security (RLS) 정책:**
   - 모든 테이블(`hospitals`, `hospital_config_versions`, `runs`, `answers`, `trust_signal_audits`, `verification_items`, `system_config`)에 RLS를 적용하여 인가되지 않은 외부 변조를 방지합니다.
