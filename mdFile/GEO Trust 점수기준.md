# GEO Trust (생성형 검색 최적화 & 웹 신뢰도) 점수 기준 및 파싱 엔진 설계서

본 문서는 병원 공식 홈페이지를 실시간 크롤링하여 AI 검색 엔진(ChatGPT, Perplexity, Gemini, Claude 등)에 대한 **GEO(Generative Engine Optimization) 준비도**와 **웹 신뢰 시그널(Trust Signal)**을 100점 만점으로 정밀 평가·수집하는 기준 및 파싱 알고리즘 명세입니다.

---

## 🏛️ GEO Trust 4대 영역 종합 배점표

| 영역 코드 | 평가 영역 | 배점 | 합격선 | 주요 측정 대상 및 가치 |
|:---:|---|:---:|:---:|---|
| **A** | **AI 크롤러 접근성 (robots.txt)** | **25점** | 20점 | 6대 생성형 AI 봇 접근 허용 여부 (학습 및 실시간 검색 차단 방지) |
| **B** | **구조화 데이터 (Schema.org)** | **30점** | 20점 | JSON-LD 규격(의료기관, FAQ, 지역, 평점) 등재 여부 |
| **C** | **신뢰 콘텐츠 자산 (Trust Signals)** | **25점** | 18점 | 의료진 약력, FAQ 질의응답, 건강칼럼/블로그, 유튜브 연동 실재성 |
| **D** | **기술적 AI 가독성 (Technical GEO)** | **20점** | 16점 | HTTPS, Title, Meta Description, 본문 텍스트 600자↑, 사이트맵 |
| **합계** | **종합 GEO Trust Score** | **100점** | **80점(우수)** | **우수(80~100점) · 보통(50~79점) · 취약(0~49점)** |

---

## 🔍 4대 평가 영역별 세부 파싱 기준 및 알고리즘

### 1. A. AI 크롤러 접근성 (25점 만점, 합격선 20점)

- **수집 대상**: `{홈페이지_기본_URL}/robots.txt`
- **배점 산정식**: 6대 주요 AI 크롤러 봇별 허용 여부를 판별하여 봇 1개당 **약 4.17점**씩 비례 가산
- **분석 대상 6대 봇 목록**:
  1. `GPTBot` (OpenAI ChatGPT 모델 학습 및 인용)
  2. `OAI-SearchBot` (ChatGPT 실시간 서치 엔진)
  3. `ClaudeBot` (Anthropic Claude 수집 및 인용)
  4. `PerplexityBot` (Perplexity 실시간 AI 검색)
  5. `Google-Extended` (Google Gemini 그라운딩 및 학습)
  6. `Applebot-Extended` (Apple Intelligence)
- **파싱 알고리즘 (`checkRobotsBlocked`)**:
  - `User-agent:` 라인에서 특정 봇 또는 전체 봇(`*`) 지시어 감지.
  - `Disallow: /` 또는 `Disallow: /*` 감지 시 **차단(`BLOCKED`, 0점)** 처리.
  - `Allow: /` 명시 또는 robots.txt 파일 미존재 시 기본 **허용(`ALLOWED`, 4.17점)** 처리.

---

### 2. B. 구조화 데이터 (Schema.org / JSON-LD) (30점 만점, 합격선 20점)

- **수집 대상**: 메인 HTML 내 `<script type="application/ld+json">` 태그 전체
- **파싱 알고리즘 (`extractJsonLdInfo`)**:
  - 정규식을 통해 모든 JSON-LD 블록을 파싱하고, `@type` 배열 및 중첩 객체 탐색.
  - 파싱된 원본 JSON-LD 블록 전체를 보존하여 DB `schema_details.rawJsonLd`에 백업.
- **세부 항목별 배점 및 판별 기준**:
  1. **의료기관/진료 스키마 (+14점)**:
     - 감지 타입: `MedicalClinic`, `Hospital`, `MedicalBusiness`, `Physician`, `Dentist`, `MedicalOrganization`
     - 영향: AI가 추정에 의존하지 않고 병원의 공식 진료과목, 의료진 구성, 기관 분류를 확정 인식.
  2. **FAQPage 질문형 스키마 (+8점)**:
     - 감지 타입: `FAQPage` (내부 `Question`, `Answer` 구조체 포함 여부)
     - 영향: AI가 환자의 질문에 답변을 생성할 때 해당 FAQ 문답을 직접 인용(Citation).
  3. **지역(Local) 사업체 스키마 (+5점)**:
     - 감지 타입: `LocalBusiness` 또는 의료기관 스키마 내 주소/위치 명시.
     - 영향: 지역 기반 질의(예: "청주 정형외과") 시 위치 기반 검색 가시성 대폭 증대.
  4. **평점/리뷰 스키마 (+3점)**:
     - 감지 타입: `AggregateRating`, `Review`
     - 영향: 환자 평점 및 리뷰 신뢰도를 AI 답변에 점수 근거로 활용.

---

### 3. C. 신뢰 콘텐츠 자산 (Trust Signals) (25점 만점, 합격선 18점)

- **수집 대상**: 본문 정제 텍스트(`cleanBodyText`) 및 전체 앵커 태그(`<a href>`)
- **파싱 원리**: 단순 키워드 존재 여부만 체크하지 않고, **(1) 키워드 매칭 여부**, **(2) 실제 본문 문맥 발췌문(스니펫 140자)**, **(3) 연결된 실제 하이퍼링크(URL)**를 복합 추출하여 `content_details`에 증빙 데이터로 영구 저장합니다.

#### 세부 항목별 파싱 기준표
| 세부 항목 | 배점 | 텍스트 감지 키워드 (Target Keywords) | 링크 감지 패턴 (`<a href>`) | 추출 스니펫 및 증빙 데이터 |
|---|:---:|---|---|---|
| **① 의료진 소개 & 약력** | **7점** | `의료진`, `원장`, `전문의`, `의사소개`, `physician`, `doctor` | `doctor`, `intro`, `staff`, `member`, `medical` | • 약력 문맥 140자 스니펫<br/>• 의료진 소개 페이지 내부 링크 URL |
| **② FAQ / 질의응답** | **6점** | `자주 묻는`, `faq`, `q&a`, `궁금`, `질문과 답`, `질문` | `faq`, `qna`, `question`, `help` | • 자주 묻는 질문 텍스트 스니펫<br/>• FAQ/고객센터 링크 URL |
| **③ 블로그 / 건강칼럼** | **6점** | `블로그`, `칼럼`, `건강정보`, `blog`, `column`, `blog.naver` | `blog.naver.com`, `blog`, `column`, `news` | • 칼럼/사례 텍스트 스니펫<br/>• 공식 네이버 블로그/칼럼 URL |
| **④ 유튜브 영상/채널** | **6점** | `youtube.com`, `youtu.be`, `유튜브` | `youtube.com`, `youtu.be` | • 영상 설명 문맥 스니펫<br/>• 실제 유튜브 채널/동영상 URL |

#### 핵심 파싱 알고리즘
```typescript
// 1. 키워드 매칭 주변 140자 문맥 스니펫 발췌
function extractSnippet(cleanText: string, keywords: string[], maxLen = 140): string {
  const lower = cleanText.toLowerCase();
  for (const kw of keywords) {
    const idx = lower.indexOf(kw.toLowerCase());
    if (idx !== -1) {
      const start = Math.max(0, idx - 25);
      const end = Math.min(cleanText.length, idx + kw.length + maxLen);
      let snippet = cleanText.substring(start, end).replace(/\s+/g, ' ').trim();
      if (start > 0) snippet = '...' + snippet;
      if (end < cleanText.length) snippet = snippet + '...';
      return snippet;
    }
  }
  return '';
}

// 2. 해당 섹션의 실제 URL 링크 추출 (최대 5개)
function extractHrefLinks(html: string, patterns: string[]): string[] {
  const links = new Set<string>();
  const regex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const href = match[1].trim();
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
    if (patterns.some(p => href.toLowerCase().includes(p.toLowerCase()))) {
      links.add(href);
    }
  }
  return Array.from(links).slice(0, 5);
}
```

---

### 4. D. 기술적 AI 가독성 (Technical GEO) (20점 만점, 합격선 16점)

- **수집 대상**: HTML 헤더 태그(`<title>`, `<meta>`), 프로토콜(`http/https`), 순수 본문 텍스트 길이, 사이트맵
- **파싱 알고리즘 및 세부 가점 기준**:
  1. **HTTPS 보안 프로토콜 (+4점)**:
     - 검사: URL 시작 문자열이 `https://` 인지 판별.
     - 가치: AI 봇은 비보안 HTTP 사이트에 대한 인용 신뢰도를 낮게 책정함.
  2. **페이지 `<title>` 태그 (+4점)**:
     - 검사: `<title>...</title>` 정규식 추출 및 실제 타이틀 문자열 저장.
     - 가치: 병원의 공식 명칭과 대표 진료분야를 AI가 파악하는 1순위 메타 정보.
  3. **메타 설명 `<meta name="description">` (+4점)**:
     - 검사: `<meta name="description" content="...">` 내용 추출 및 저장.
     - 가치: AI 검색 엔진의 스니펫 요약문으로 직접 활용되는 설명 자산.
  4. **본문 텍스트 분량 600자 이상 확보 (+5점)**:
     - 검사: `<script>`, `<style>`, HTML 태그를 모두 제거한 **순수 본문 글자수(`cleanBodyText.length`)** 측정.
     - 가치: 통이미지/플래시 기반 사이트 여부를 필터링하고, AI 크롤러가 충분한 텍스트 정보를 수집할 수 있는지 검증 (미달 시 이미지 외 텍스트 보강 권고).
  5. **`sitemap.xml` 사이트맵 구조화 (+3점)**:
     - 검사: 사이트맵 경로 확인 및 기본 기술 규격 점수 반영.

---

## 💾 DB `trust_signal_audits` 테이블 저장 규격

진단 완료 시 PostgreSQL Supabase `trust_signal_audits` 테이블에 아래와 같은 완벽한 스키마로 저장됩니다:

```sql
CREATE TABLE public.trust_signal_audits (
    id bigint PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
    run_id bigint NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
    hospital_code text REFERENCES public.hospitals(hospital_code),
    target_url text NOT NULL,
    total_score integer NOT NULL DEFAULT 0,       -- 종합 점수 (0~100)
    grade text NOT NULL DEFAULT '보통',           -- 우수 / 보통 / 취약
    geo_rate double precision NOT NULL DEFAULT 0.0,
    
    -- 4대 영역별 점수
    crawler_score integer NOT NULL DEFAULT 0,    -- A 영역 (25점)
    schema_score integer NOT NULL DEFAULT 0,     -- B 영역 (30점)
    content_score integer NOT NULL DEFAULT 0,    -- C 영역 (25점)
    technical_score integer NOT NULL DEFAULT 0,  -- D 영역 (20점)
    
    -- 4대 영역별 원천 세부 데이터 (스니펫, 링크, 봇별 상태 등)
    crawler_details jsonb NOT NULL DEFAULT '{}'::jsonb,
    schema_details jsonb NOT NULL DEFAULT '{}'::jsonb,
    content_details jsonb NOT NULL DEFAULT '{}'::jsonb,
    technical_details jsonb NOT NULL DEFAULT '{}'::jsonb,
    
    full_report_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc', now())
);
```

---

## 📑 리포트 연계 가이드 (1페이지 완성형 구조)
- **리포트 5페이지 (GEO Readiness & 신뢰도 진단 — 1페이지 완결)**:
  - 상단: 52% 도넛 차트 및 A/B/C/D 4대 카드 현황
  - 중단: **4대 영역별 점수 산정 근거 (Rationale) & 핵심 개선 방안 (Action Plan) 원페이지 통합 요약 테이블**
  - 하단: 최단기 우수 등급(85점↑) 달성을 위한 종합 액션 가이드 박스
- **리포트 6페이지 (Trust Signal Audit)**: C(신뢰 콘텐츠 4대 자산) & D(기술적 가독성) 12개 점검 리스트 및 실재 텍스트/링크 증빙 출력.
- **리포트 7페이지 (Action Priority)**: 미달된 항목 중 개선 효과가 가장 높은 **5대 핵심 개선 과제(Action Plan)** 자동 산출.


