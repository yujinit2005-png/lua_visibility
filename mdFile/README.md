# LUA AI Visibility 측정 엔진 v1

병원이 ChatGPT·Gemini·Perplexity 답변에서 얼마나 언급·추천되는지를
**재현 가능한 방식으로** 측정하는 내부 운영용 엔진입니다.

## v0.2와 무엇이 다른가 (핵심)

v0.2는 문자열을 1회 판정하는 프로토타입이었고, 그나마 실제 AI가 아니라
모의 답변으로 돌린 것이었습니다. 이 v1은 실제로 다음을 합니다:

1. **N회 반복 측정** — 질의당 5회(기본) 호출해서 "언급됨/안됨"이 아니라
   "5회 중 몇 회 언급"으로 기록합니다. 그래서 점수가 흔들릴 때 그게 개선인지
   노이즈인지 구분됩니다. (측정 재현성 문제를 정면으로 다룸)
2. **불안정 구간 자동 플래그** — 애매하게 걸치는 질의(예: 5회 중 2회)를
   "노이즈"로 표시해, 리포트에서 과대해석을 막습니다.
3. **원문 증거 저장** — 모든 답변을 시점·모델버전과 함께 SQLite에 통째로
   보관합니다. "그때 AI가 실제로 이렇게 답했다"의 증거입니다.
4. **언급 vs 추천 구분 + 경쟁 점유율** — 단순 등장과 추천 맥락을 구분하고,
   경쟁 병원 대비 답변 점유율(Share of Answer)을 계산합니다.

## 설치

```bash
pip install requests
```

## 실행

### 1) 검증용 (외부 API 불필요)
engine이 제대로 도는지 먼저 확인:
```bash
py -m lua_visibility.run --hospital Hospital_info/hospital.example.json --mock --mode demo
```

### 2) 실측 (API 키 필요)
```bash
set OPENAI_API_KEY=sk-...
set ANTHROPIC_API_KEY=sk-ant-... (현재 비활성화)
set GEMINI_API_KEY=...
set PERPLEXITY_API_KEY=...
py -m lua_visibility.run --hospital Hospital_info/hospital.example.json
```
키가 없는 모델은 자동으로 건너뜁니다. 하나만 있어도 그 모델로 돌아갑니다.

결과물:
- `report_YYYY-MM-DD.md` — 사람이 읽는 리포트
- `lua_visibility.db` — 모든 답변 원문(증거) + 분석 결과

## 병원 설정 바꾸기
`hospital.example.json`을 복사해 병원명·별칭·경쟁사·질문 세트를 채우면 됩니다.
질문 세트와 경쟁사 사전이 측정 품질을 좌우하므로, 이 부분이 루아의 핵심
방법론 자산입니다.

## 정직한 한계 (알고 쓰세요)

- **네이버는 빠져 있습니다.** 공식 API/약관 이슈로 기본 비활성입니다. 병원에게
  가장 중요한 채널이라, 당분간은 수동 캡처를 병행해야 합니다.
- **추천 판정은 휴리스틱입니다.** 신호어 + 목록 등장으로 판단합니다. 더
  정밀하게 하려면 `analyzer.py`의 추천 로직을 LLM 심판(judge) 호출로
  교체하세요(구조는 분리해 뒀습니다).
- **temperature 0.7로 측정합니다.** 0으로 고정하면 현실보다 안정적으로 나와
  언급률을 과대측정하게 됩니다. 실제 환자가 겪는 변동을 그대로 재는 게 목적입니다.
- **이 점수는 순위 보장이 아닙니다.** 리포트 하단 고지문이 이를 명시합니다.

## 구조 (모듈화 / API 교체 용이)

```
run.py                     실행기 (CLI)
lua_visibility/
  config.py    측정 프로토콜 정의 ← 진짜 자산
  providers.py 모델 클라이언트 (새 모델은 여기 한 줄 추가)
  analyzer.py  답변 1건 분석 (언급/추천/경쟁/위치)
  scorer.py    N회 → 빈도·변동성 집계
  storage.py   SQLite 증거 저장
  report.py    마크다운 리포트
hospital.example.json      병원 설정 (청주필 예시)
```

## 다음 단계 후보
- PDF 리포트 출력(현재 마크다운 → 변환)
- 추천 판정 LLM 심판 교체
- 월별 추이 비교(같은 병원 여러 run 비교)
- 네이버 반자동 캡처 워크플로

---

## Trust Signal Score (신규 모듈)

AI가 뭐라 답하는지가 아니라, **병원 자체 사이트가 AI에게 읽히고 신뢰받을 준비가
됐는지**를 점검합니다. 결정론적이라 노이즈가 없고, 실패 항목이 곧 할 일이 됩니다.

```bash
pip install beautifulsoup4
python check_trust.py --url https://병원홈페이지.com --save trust_report.md
```

100점 = A.크롤러 접근성(25) + B.구조화 데이터(30) + C.콘텐츠 자산(25) + D.기술 가독성(20).
각 항목의 감점은 "robots.txt에서 ClaudeBot 차단 해제", "FAQPage 스키마 추가" 같은
구체적 체크리스트로 출력됩니다. 이 할 일 목록이 곧 루아가 파는 최적화 서비스 항목입니다.

*외부 사이트를 읽으므로 인터넷 연결이 필요합니다. 판정 로직(analyze_html)은
네트워크 없이도 검증 가능하도록 fetch와 분리돼 있습니다.*

---

## Opportunity Finder (기회 지도)

측정기가 만든 데이터를 재집계해, 각 질문을 네 가지로 자동 분류합니다.
새 API 호출이 없어 비용 0입니다. 측정기를 돌리면 리포트 2번 섹션에 자동 포함됩니다.

| 유형 | 조건 | 뜻 |
|---|---|---|
| 선점기회 | 우리 낮음 + 경쟁사 낮음 | 무주공산. 먼저 콘텐츠 심으면 선점 |
| 탈환대상 | 우리 낮음 + 경쟁사 높음 | 경쟁사가 가져가는 중. 뺏어와야 함 |
| 경합 | 둘 다 높음 | 노출되나 경쟁 치열. 추천맥락 강화 |
| 독점우위 | 우리만 높음 | 이미 우리 것. 방어 |

"우리가 안 보이는 질문"(선점기회 + 탈환대상)이 무료진단에서 미팅을 여는 무기입니다.
각 우선 기회에는 "무주공산 콘텐츠 선점", "자생이 선점 중 — 차별화 각도로 탈환" 같은
규칙 기반 실행 문구가 붙습니다. 질문별 맞춤 콘텐츠 기획까지 자동화하려면 별도 LLM
호출을 붙이면 됩니다(후속 단계).

---

## 영업용 무료진단 PDF

세 축(측정 + Trust Signal + Opportunity Finder)을 한 장의 4페이지 영업 문서로 합칩니다.
구조: ①충격(노출률) → ②반전(경쟁사가 선점 중) → ③원인·해법(Trust Signal) → ④다음 단계(CTA).

```bash
pip install playwright
playwright install chromium     # 최초 1회 (브라우저 엔진 설치)

# 디자인 샘플 생성 (예시 데이터)
python make_sample_pdf.py       # → sample_무료진단.pdf
```

실측 데이터로 만들려면 `sales_pdf.from_engine(...)`에 측정기의 model_scores,
Opportunity 결과, Trust Signal 리포트를 넘기면 됩니다(도구 간 연결 지점).
3페이지(Trust Signal)를 채우려면 check_trust.py를 함께 돌려야 합니다.

*렌더링은 Playwright(Chromium) + Noto Sans CJK KR. HTML/CSS 템플릿이라 색상·문구
수정이 쉽습니다(sales_pdf.py 안 CSS/문구 블록).*

---

## 창(GUI)으로 실행하기 · 바탕화면 아이콘

검은 명령창 대신 창에서 클릭으로 진단 PDF를 만들 수 있습니다. 고객 앞 시연에 적합합니다.

### 실행
- `lua_gui.pyw` 를 **더블클릭** (콘솔 없이 창만 뜸)
- 또는 `진단기_실행.bat` 더블클릭

### 바탕화면 아이콘 만들기
1. `lua_gui.pyw` 에 **오른쪽 클릭 → 보내기 → 바탕 화면에 바로 가기 만들기**
2. 바탕화면에 생긴 바로가기를 **"AI 가시성 진단기"** 로 이름 변경
3. (선택) 아이콘 변경: 바로가기 오른쪽 클릭 → 속성 → **아이콘 변경 → 찾아보기** → 폴더 안 `icon.ico` 선택

### 창 사용법
- **데모 모드 체크** (기본): API 키 없이 즉시 샘플 PDF 생성 — 고객 시연·디자인 확인용
- **실측**: 데모 모드 해제 + API 키 입력(한 번 넣으면 `keys.json`에 저장). 홈페이지 URL을 넣으면 Trust Signal 3페이지도 채워짐
- **진단 PDF 생성** 버튼 → 완료되면 PDF가 자동으로 열림

※ GUI는 파이썬 기본 포함 tkinter만 사용합니다(추가 설치 불필요). 내부적으로 검증된 run.py를 호출하므로 결과는 명령창 실행과 동일합니다.

---

## 로고 넣기

표지에 루아컴퍼니 로고를 자동으로 넣을 수 있습니다.

1. 로고 이미지 파일 이름을 **정확히 `logo.png`** 로 바꿔, `run.py`가 있는 폴더에 넣으세요.
   (jpg/jpeg/webp/gif, 또는 `로고.png` 이름도 자동 인식합니다.)
2. 그다음 PDF를 생성하면, 표지 상단 왼쪽에 흰 카드 형태로 로고가 자동 삽입됩니다.
3. 로고 파일이 없으면 글자 로고("루아컴퍼니")로 나오며, 오류 없이 정상 작동합니다.

*네이비 표지 위 어떤 색 로고든 깔끔히 보이도록 흰색 카드 위에 얹는 방식입니다.
투명배경·흰배경 PNG 모두 잘 맞습니다.*

---

## 새로 추가된 주요 기능 (웹 실측 및 세분화된 컨트롤)

1. **웹 UI 실측 및 교차 비교**: API가 아닌 실제 브라우저 웹 UI(Chat 형태)를 띄워 검색 결과를 수집하고, 기존 실측 API 결과와 비교하는 마크다운 교차 비교 리포트(Report/report_web_verification...md)를 자동 생성합니다. (Playwright 기반)
2. **실패 질문 보완 (세분화된 재실행)**: 메인 파이프라인에서 수집 실패한 질의만 선별하여 다시 실행하는 전용 창을 제공합니다.
   - **실패 질문 일괄/개별 재실행**: 누락된 데이터만 복구(DB 개별 UPDATE).
   - **스텝 3,4번 재실행**: 데이터 복구 후 2x2 기회 지도 및 통계(Step 3)와 Trust Signal(Step 4)만 단독으로 다시 산출하여 최신화.
   - **진단 PDF 별도 생성**: 보완이 완료된 데이터를 바탕으로 Report/Remake 폴더에 즉시 영업용 PDF를 재생성.

---

## v3 업그레이드 (진단 유형 · 데모/고객 · 8페이지)

### 새로 생긴 것
- **진단 유형**: 무료 AI 진단 / 정밀 AI 리포트 (창 상단 라디오)
- **리포트 모드**: 데모/샘플(연습·시연) / 고객 제출용(실측)
  - 데모: 표지에 "예시 데이터·디자인 샘플" 표시, 채널명 "예시 AI"
  - 고객 제출용: mock·demo·sample 등 내부 단어가 본문에 절대 안 나옴
- **분석 옵션 체크박스**: AEO / GEO / 경쟁병원 / Trust Signal / 용어 설명
- **무료진단 PDF 8페이지**: 표지 → AEO 노출분석 → 기회지도(+2x2 매트릭스) →
  GEO 준비도(체크리스트) → Trust Signal → 개선 우선순위 5가지 → Next Step → 용어집
- 완화된 문구 + 의료광고법 위험표현 배제 + 하단 필수 고지문

### 명령줄로도 가능
```
py run.py --hospital hospital.example.json --pdf 진단.pdf --report-type free --mode demo
py run.py --hospital hospital.example.json --pdf 정밀.pdf --report-type precision --mode client --trust-url https://병원.com
```
`--sections aeo,geo,competitor,trust,glossary` 로 포함 섹션 조절.

### 오류 날 때 체크리스트
1. `py --version` 이 안 나오면 → 파이썬 PATH 문제 (재설치 시 Add to PATH 체크)
2. `No module named playwright/requests/bs4` → `py -m pip install requests beautifulsoup4 playwright`
3. PDF 생성 / 내장 뷰어 브라우저 오류 → 타 PC 환경에서는 시스템에 설치된 MS Edge / Chrome 브라우저가 자동 대체 작동하며, 최후의 보루로 시스템 기본 웹브라우저 탭이 자동 오픈됩니다.
4. 고객 제출용인데 API 키 없음 → 데모 모드로 실행되거나, 키 입력 필요
5. 로고 안 나옴 → 파일명이 정확히 `logo.png` 인지 확인

---

## 🚀 React + Supabase + Cloudflare 웹 마이그레이션 안내
본 파이썬 애플리케이션을 웹(React Dashboard + Supabase DB + Cloudflare Serverless) 사양으로 마이그레이션하기 위한 기술 명세서가 [mdFile/Mig_to_Web.md](file:///c:/1.RuaCompany/lua_visibility_engine/mdFile/Mig_to_Web.md)에 정리되어 있습니다.
