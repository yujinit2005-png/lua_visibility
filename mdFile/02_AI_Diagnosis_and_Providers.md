# 02. AI 진단 엔진 및 프로바이더 연동 (AI Diagnosis & Providers)

## 📌 개요
루비스 시스템은 주요 대형 언어 모델(LLM)과 검색 엔진 API를 통합하여, 질문별로 질의를 전송하고 수신된 응답 텍스트를 정밀 분석합니다.

---

## 🤖 지원 AI 프로바이더 목록

| 프로바이더 | 주력 모델 | 특징 및 연결 방식 |
|---|---|---|
| **OpenAI** | `gpt-4o-search-preview` | 실시간 웹 검색 내장 모델, 환각 방지 시스템 프롬프트 및 Vite 역방향 프록시(`/api-openai`) 경유 |
| **Google Gemini** | `gemini-2.0-flash` | 503 과부하 시 대체 모델(`gemini-1.5-flash`, `gemini-1.5-pro`) 자동 Fallback |
| **Perplexity** | `sonar`, `sonar-pro` | 실시간 웹 검색 기반 답변 및 인용 출처(Citations) 수집 |
| **Anthropic** | `claude-3-5-sonnet` | Web Search Tool 연동 실시간 검색 및 엄격 추천 신뢰도 지표화 |
| **Naver API** | `naver-local-search` | 전용 질의어(`naver_queries`) 기반 지역검색 API Hub 독립 연동 |

---

## 🛡️ 브라우저 CORS 문제 해결 (Vite Reverse Proxy)

웹 브라우저 환경에서 LLM API를 직접 호출할 때 발생하는 CORS(Cross-Origin Resource Sharing) 차단을 해결하기 위해 `vite.config.ts`에 프록시 라우트를 구성하였습니다:

```typescript
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api-openai': {
        target: 'https://api.openai.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-openai/, ''),
      },
      '/api-perplexity': {
        target: 'https://api.perplexity.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-perplexity/, ''),
      },
      '/api-anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-anthropic/, ''),
      },
      '/api-naver': {
        target: 'https://naverapihub.apigw.ntruss.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-naver/, ''),
      },
    },
  },
});
```

---

## 🔑 API Key 동기화 및 우선순위 관리

- **1순위**: 사용자가 대시보드 하단 UI 또는 `system_config`에 직접 입력한 최신 키
- **2순위**: Supabase `system_config` 테이블의 `api_keys` 레코드
- **3순위**: 로컬 `.env` 환경 변수 (`VITE_OPENAI_API_KEY`, `VITE_GEMINI_API_KEY` 등)

---

## 🔄 진단 중단 및 데이터 보존 규칙

1. **중단(Stop) 시 실시간 현황 초기화**:
   - 사용자가 진단 중 `[중단]` 버튼을 누르면 `resetStepStatus()`를 즉시 호출하여 진행률을 0%로 초기화하고 5단계 카드를 리셋합니다.
2. **재수집 실패 시 기존 답변 보존**:
   - `RerunModal.tsx`에서 개별 질문 재실행 시 네트워크 에러나 API 오류로 수집이 실패한 경우, `answers` 테이블의 기존 답변과 언급/추천 결과를 덮어쓰지 않고 원본 데이터를 안전하게 보존합니다.
