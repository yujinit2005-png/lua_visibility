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

## 🔒 보안 및 시크릿 관리 (Security & Secret Protection)

1. **GitHub Secret Scanning 준수**:
   - 소스 코드 내 하드코딩된 API Key 문자열(`sk-proj-...`, `pplx-...` 등)을 완전히 제거하고, 환경 변수(`import.meta.env`) 및 Supabase `system_config` 테이블을 통해서만 안전하게 공급합니다.
2. **관리자 인증 (`AuthContext`)**:
   - SHA-256 해시 검증 및 세션 관리를 통해 인가된 사용자만 진단 파라미터 및 시스템 설정을 제어할 수 있습니다.
