# Trust Signal 상세 점수 산정 로직 구현 계획

기존 파이썬 소스(`trust_signal.py`)를 분석한 결과, A, B, C, D 각 항목에 대해 매우 구체적이고 정교한 배점 기준이 존재함을 확인했습니다. 
현재 웹 버전(`trustSignal.ts`)은 이 로직이 온전히 이식되지 않고 임시(하드코딩) 점수를 반환하고 있습니다. 이를 파이썬 원본과 100% 동일하게 실제 분석 기반으로 작동하도록 수정하고자 합니다.

## User Review Required
> [!IMPORTANT]
> 웹 브라우저 환경(프론트엔드)에서 타 병원 홈페이지를 직접 분석(Fetch)하려고 하면 **CORS 보안 정책**에 의해 차단될 수 있습니다. 
> 현재 구조에서는 CORS 우회 프록시 서비스(예: `corsproxy.io` 또는 `allorigins.win`)를 경유하여 데이터를 수집하도록 구현해야 정상 작동합니다. 프록시 적용에 동의하시는지 확인 부탁드립니다.

## Proposed Changes

### `src/lib/trustSignal.ts`
파이썬 엔진의 정밀 분석 로직을 타입스크립트로 포팅합니다.

1. **A. AI 크롤러 접근성 (25점)**
   - `robots.txt` 파일을 실제로 요청하여 파싱합니다.
   - `GPTBot`, `OAI-SearchBot`, `ClaudeBot`, `PerplexityBot`, `Google-Extended`, `Applebot-Extended` 총 6개의 봇 접근 허용 여부를 검사하고, 허용된 봇 1개당 약 4.1점씩 비례하여 점수를 산정합니다.

2. **B. 구조화 데이터 (30점)**
   - HTML 내의 `<script type="application/ld+json">`을 파싱합니다.
   - `MedicalClinic`, `Hospital`, `Physician` 등 의료기관 스키마 존재 여부(+14점)
   - `FAQPage` 스키마 존재 여부(+8점)
   - `LocalBusiness` 스키마 존재 여부(+5점)
   - `AggregateRating` 또는 `Review` 스키마 존재 여부(+3점)

3. **C. 신뢰 콘텐츠 자산 (25점)**
   - 단순히 키워드가 '존재하는지'를 넘어, 본문 텍스트, 링크(`href`), 임베드(`iframe`)를 종합적으로 분석합니다.
   - 의료진 소개 관련 키워드(+7점), FAQ/질문 관련(+6점), 블로그/칼럼 관련(+6점), 유튜브 연결 관련(+6점)으로 25점을 구성합니다.

4. **D. 기술적 AI 가독성 (20점)**
   - `HTTPS` 적용 여부(+4점)
   - `<title>` 태그 존재 여부(+4점)
   - `<meta name="description">` 존재 여부(+4점)
   - 본문 텍스트 600자 이상 여부(+5점)
   - `sitemap.xml` 존재 여부(+3점)

## Verification Plan
1. 코드를 적용한 뒤 프록시를 통해 실제 외부 병원 URL을 입력하여 테스트합니다.
2. A, B, C, D 각 점수가 세부 항목에 맞게 가산되고 있는지 결과 리포트와 콘솔 로그를 통해 검증합니다.
