# GEO Trust (생성형 검색 최적화 & 웹 신뢰도) 점수 기준 및 파싱 엔진 설계서

본 문서는 병원 공식 홈페이지를 실시간 크롤링하여 AI 검색 엔진(ChatGPT, Perplexity, Gemini, Claude 등)에 대한 **GEO(Generative Engine Optimization) 준비도**와 **웹 신뢰 시그널(Trust Signal)**을 100점 만점으로 정밀 평가·수집하는 기준 및 파싱 알고리즘 명세입니다.

---

## 🏛️ GEO Trust 4대 영역 종합 배점표

| 영역 코드 | 평가 영역 | 배점 | 합격선 | 주요 측정 대상 및 가치 |
| :---: | --- | :---: | :---: | --- |
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

# B. 구조화 데이터 (Schema.org) — 미달 원인과 개선 방안

### 1. 현황 진단 및 예상 영향
사람은 홈페이지를 눈으로 읽어 병원임을 알 수 있지만, AI는 오직 코드로만 정보를 읽습니다. 현재 귀 병원의 홈페이지에는 AI가 인식할 수 있는 전용 규격 정보(JSON-LD)가 등재되어 있지 않습니다. 이로 인해 AI가 귀 병원의 전문 진료과, 의료진 규모, 기관 종류를 100% 확신하지 못하며, 정보 확신성이 낮은 병원은 AI 추천 리스트에서 우선적으로 배제되는 경향을 보입니다.

### 2. 구체적 미달 항목
- **`MedicalClinic` / `Hospital` 스키마 미검출 (-14점)**: AI에게 "우리는 어떤 진료를 하는 무슨 병원이다"라고 명시하는 가장 핵심적인 의료기관 메타데이터가 없습니다.
- **`FAQPage` / `AggregateRating` 스키마 부재 (-11점)**: AI가 환자의 질문에 답변할 때 즉시 인용할 수 있는 '자주 묻는 질문(FAQ)' 구조와 '환자 평가(리뷰/별점)' 데이터가 AI 규격으로 연결되어 있지 않습니다.

### 3. 개선 솔루션 (웹 에이전시 전달용 가이드)
홈페이지의 `<head>` 태그 내에 AI가 읽을 수 있는 **JSON-LD(JavaScript Object Notation for Linked Data)** 형식의 스크립트를 삽입하는 단시간 작업으로 해결할 수 있습니다. 홈페이지 개발/유지보수 담당자에게 아래 가이드를 전달해 주시기 바랍니다.

---

> 💻 **웹에이전시/개발자 작업 요청서 [예시 코드]**
> 검색엔진 및 AI 크롤러(GPTBot, ClaudeBot 등)가 병원 정보를 명확히 파싱할 수 있도록, 홈페이지 공통 `<head>` 영역 또는 메인 페이지에 아래의 JSON-LD 구조화 데이터 삽입을 요청합니다.

#### ① 병원 기본 규격 (`MedicalClinic` 스키마)
병원의 이름, 주소, 연락처, 주요 진료과목을 명시합니다.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "MedicalClinic",
  "name": "청주OOO한방병원",
  "image": "https://www.example.com/logo.jpg",
  "url": "https://www.example.com",
  "telephone": "043-000-0000",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "강서로 00",
    "addressLocality": "청주시",
    "addressRegion": "충청북도",
    "postalCode": "28000",
    "addressCountry": "KR"
  },
  "medicalSpecialty": "TraditionalChineseMedicine"
}
</script>
```

#### ② 질문형 답변 최적화 (`FAQPage` 스키마)
환자들이 자주 묻는 대표 질문 2~3가지를 텍스트 기반으로 삽입하여 AI가 답변의 출처로 활용하도록 유도합니다.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [{
    "@type": "Question",
    "name": "교통사고 후유증 한방치료는 입원이 가능한가요?",
    "acceptedAnswer": {
      "@type": "Answer",
      "text": "네, 청주OOO한방병원에서는 교통사고 후유증 환자를 위한 집중 치료 입원실을 운영하고 있습니다."
    }
  }, {
    "@type": "Question",
    "name": "허리디스크 비수술 치료(추나요법)를 진행하나요?",
    "acceptedAnswer": {
      "@type": "Answer",
      "text": "숙련된 한의사가 직접 진행하는 한방 추나요법 및 도수치료를 통해 허리디스크 비수술 치료를 시행합니다."
    }
  }]
}
</script>
```

#### ③ 환자 평가/리뷰 (`AggregateRating` 스키마)
영업용 페이지나 주요 치료 랜딩 페이지에 별점 정보를 제공하여 신뢰도를 높입니다.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "MedicalClinic",
  "name": "청주OOO한방병원",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "reviewCount": "150"
  }
}
</script>
```

*(※ 안내 사항: 위 코드는 예시이므로, 병원의 실제 정보와 URL에 맞게 텍스트를 수정하여 적용해 주시면 됩니다.)*

---

### 3. C. 신뢰 콘텐츠 자산 (Trust Signals) (25점 만점, 합격선 18점)

- **수집 대상**: 본문 정제 텍스트(`cleanBodyText`) 및 전체 앵커 태그(`<a href>`)
- **파싱 원리**: 단순 키워드 존재 여부만 체크하지 않고, **(1) 키워드 매칭 여부**, **(2) 실제 본문 문맥 발췌문(스니펫 140자)**, **(3) 연결된 실제 하이퍼링크(URL)**를 복합 추출하여 `content_details`에 증빙 데이터로 영구 저장합니다.

#### 세부 항목별 파싱 기준표

| 세부 항목 | 배점 | 텍스트/요소 감지 키워드 (Target Keywords & Attributes) | 링크 감지 패턴 (`<a href>` 또는 `<iframe src>`) | 추출 스니펫 및 증빙 데이터 |
| --- | --- | --- | --- | --- |
| **① 의료진 소개 & 약력** | **7점** | `의료진`, `원장`, `대표원장`, `전문의`, `의사소개`, `약력`, `doctor`, `physician` *(+ img alt 태그 포함)* | `doctor`, `intro`, `staff`, `member`, `medical`, `profile`, `about` | • 약력/소개 문맥 140자 스니펫<br/>• 의료진 소개 페이지 내부 링크 URL |
| **② FAQ / 질의응답** | **6점** | `자주 묻는`, `faq`, `q&a`, `질문과 답`, `궁금`, `온라인상담`, `고객센터` | `faq`, `qna`, `question`, `help`, `board`, `bbs`, `consult`, `counsel` | • 질문/상담 관련 텍스트 스니펫<br/>• 게시판/고객센터 링크 URL |
| **③ 블로그 / 건강칼럼** | **6점** | `블로그`, `칼럼`, `건강정보`, `치료사례`, `blog`, `column`, `blog.naver` | `blog.naver.com`, `blog`, `column`, `news` | • 칼럼 제목/사례 텍스트 스니펫<br/>• 블로그/칼럼 게시판 하이퍼링크 URL |
| **④ 유튜브 영상/채널** | **6점** | `유튜브`, `youtube.com`, `youtu.be`, `TV` | `youtube.com`, `youtu.be`, `youtube.com/embed/` (iframe 포함) | • 영상 설명/제목 스니펫<br/>• 실제 유튜브 채널/동영상 URL |

#### 핵심 파싱 알고리즘

```typescript
// 1. 키워드 매칭 주변 140자 문맥 스니펫 발췌 (img alt 태그 내용 포함)
function extractSnippet(cleanText: string, keywords: string[], maxLen = 140): string {
  // 본문 텍스트 외에 <img> 태그의 alt 속성값도 cleanText에 포함하여 검사합니다.
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

// 2. 해당 섹션의 실제 URL 링크 추출 (최대 5개, <a> href 및 <iframe> src 지원)
function extractHrefLinks(html: string, patterns: string[]): string[] {
  const links = new Set<string>();
  // <a> 태그의 href 추출
  const aRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = aRegex.exec(html)) !== null) {
    const href = match[1].trim();
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
    if (patterns.some(p => href.toLowerCase().includes(p.toLowerCase()))) {
      links.add(href);
    }
  }
  // <iframe> 태그의 src 추출 (유튜브 등)
  const iframeRegex = /<iframe[^>]+src=["']([^"']+)["'][^>]*>/gi;
  while ((match = iframeRegex.exec(html)) !== null) {
    const src = match[1].trim();
    if (patterns.some(p => src.toLowerCase().includes(p.toLowerCase()))) {
      links.add(src);
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
