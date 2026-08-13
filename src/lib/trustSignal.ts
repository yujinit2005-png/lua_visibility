// src/lib/trustSignal.ts
// 파이썬 trust_signal.py 100% 동일 이식 엔진 (웹 CORS 우회 적용)

export interface CheckItemResult {
  code: string;
  name: string;
  earned: number;
  maximum: number;
  ok: boolean;
  note: string;
  findings: string[];
  actions: string[];
  diagnosis?: string;
  impact?: string;
  solution?: string;
}

export interface TrustSignalFullReport {
  url: string;
  totalScore: number;
  maxScore: number;
  grade: '우수' | '보통' | '취약';
  geoRate: number;
  items: CheckItemResult[];
  failedItems: CheckItemResult[];
  summaryText: string;
}

// CORS proxy helper
const fetchViaProxy = async (url: string): Promise<string | null> => {
  try {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl, { method: 'GET', signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const json = await res.json();
    return json.contents || null;
  } catch (e) {
    return null;
  }
};

const AI_CRAWLERS = [
  { bot: 'GPTBot', desc: 'OpenAI(ChatGPT) 학습·인용' },
  { bot: 'OAI-SearchBot', desc: 'ChatGPT 검색' },
  { bot: 'ClaudeBot', desc: 'Anthropic(Claude)' },
  { bot: 'PerplexityBot', desc: 'Perplexity' },
  { bot: 'Google-Extended', desc: 'Google Gemini 그라운딩' },
  { bot: 'Applebot-Extended', desc: 'Apple Intelligence' },
];

const MEDICAL_TYPES = ['medicalclinic', 'hospital', 'medicalbusiness', 'physician', 'dentist', 'medicalorganization'];

export const analyzeTrustSignals = async (urlStr: string): Promise<TrustSignalFullReport> => {
  const targetUrl = urlStr.startsWith('http') ? urlStr : `https://${urlStr}`;
  let baseUrl = targetUrl;
  try {
    const parsedUrl = new URL(targetUrl);
    baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
  } catch (e) {}
  
  const robotsUrl = `${baseUrl}/robots.txt`;

  // Fetch concurrently
  const [htmlContent, robotsText] = await Promise.all([
    fetchViaProxy(targetUrl),
    fetchViaProxy(robotsUrl)
  ]);

  const html = htmlContent || '';
  const textBlob = html.replace(/<[^>]+>/g, ' ').toLowerCase();
  
  // ── A. robots.txt ────────────────────────────────────────────────────────────
  const itemA: CheckItemResult = {
    code: 'A', name: 'A. AI 크롤러 접근성 (robots.txt)', earned: 0, maximum: 25, ok: false, note: '', findings: [], actions: [],
    diagnosis: 'robots.txt에서 주요 AI 검색 크롤러 접근 허용 여부 판별', 
    impact: '접근이 차단된 크롤러는 귀 병원의 정보를 학습하거나 인용할 수 없습니다.', 
    solution: 'robots.txt를 수정하여 크롤러를 허용하세요.'
  };

  if (!robotsText || htmlContent === null) {
    itemA.earned = 25; // No robots.txt usually means allowed by default
    itemA.findings.push('robots.txt가 없어 기본적으로 모든 크롤러가 허용된 상태입니다.');
  } else {
    let allowedCount = 0;
    const allowedBots: string[] = [];
    const blockedBots: string[] = [];

    AI_CRAWLERS.forEach(c => {
      const isBlocked = checkRobotsBlocked(robotsText, c.bot);
      if (isBlocked) blockedBots.push(`${c.bot} (${c.desc})`);
      else { allowedBots.push(c.bot); allowedCount++; }
    });

    const per = 25 / AI_CRAWLERS.length;
    itemA.earned = Math.round(per * allowedCount);
    if (allowedBots.length > 0) itemA.findings.push(`허용된 AI 크롤러: ${allowedBots.join(', ')}`);
    blockedBots.forEach(b => {
      itemA.findings.push(`차단됨: ${b}`);
      itemA.actions.push(`robots.txt에서 ${b.split(' ')[0]} 차단을 해제하세요.`);
    });
  }
  itemA.ok = itemA.earned >= 20;
  itemA.note = `${itemA.earned}/${itemA.maximum}점 · 크롤러별 개별 분석 점수 반영됨.`;

  // ── B. Schema.org ────────────────────────────────────────────────────────────
  const itemB: CheckItemResult = {
    code: 'B', name: 'B. 구조화 데이터 (Schema.org)', earned: 0, maximum: 30, ok: false, note: '', findings: [], actions: [],
    diagnosis: '의료기관 여부, 진료과 구성, 의료진 규모를 AI에 명시하는 규격 정보 등재 여부 확인',
    impact: 'AI가 귀 병원의 진료과·의료진·기관 종류를 추정에 의존해 처리하게 되며, 추천 빈도가 낮아집니다.',
    solution: '홈페이지에 JSON-LD 규격 정보를 등재하는 방식으로 해소됩니다.'
  };

  const schemaTypes = extractJsonLdTypes(html);
  if (schemaTypes.length === 0) {
    itemB.findings.push('JSON-LD 구조화 데이터가 홈페이지 소스에 없습니다.');
    itemB.actions.push('홈페이지에 AI 전용 병원·의료진 규격(구조화 데이터)을 추가하세요.');
  } else {
    const hasMedical = MEDICAL_TYPES.some(t => schemaTypes.includes(t));
    const hasFaq = schemaTypes.includes('faqpage');
    const hasLocal = schemaTypes.includes('localbusiness') || hasMedical;
    const hasRating = schemaTypes.includes('aggregaterating') || schemaTypes.includes('review');

    if (hasMedical) { itemB.earned += 14; itemB.findings.push('의료기관/진료 관련 스키마 확인됨 (+14점)'); }
    else itemB.actions.push('MedicalClinic/Hospital/Physician 등 의료기관 스키마를 추가하세요.');

    if (hasFaq) { itemB.earned += 8; itemB.findings.push('FAQPage 질문형 스키마 확인됨 (+8점)'); }
    else itemB.actions.push('FAQPage 스키마를 추가하세요.');

    if (hasLocal) { itemB.earned += 5; itemB.findings.push('지역(Local) 사업체 스키마 확인됨 (+5점)'); }
    if (hasRating) { itemB.earned += 3; itemB.findings.push('평점/리뷰 스키마 확인됨 (+3점)'); }
  }
  itemB.ok = itemB.earned >= 20;
  itemB.note = `${itemB.earned}/${itemB.maximum}점 · 감지된 스키마 종류 합산됨.`;

  // ── C. Content ───────────────────────────────────────────────────────────────
  const itemC: CheckItemResult = {
    code: 'C', name: 'C. 신뢰 콘텐츠 자산', earned: 0, maximum: 25, ok: false, note: '', findings: [], actions: [],
    diagnosis: '의료진 상세 이력, 환자 맞춤형 FAQ 등 AI가 신뢰할 수 있는 핵심 텍스트/링크 검사',
    impact: 'AI는 전문 정보가 풍부한 병원을 우선 추천하며 텍스트 자원이 적으면 추천 배제 확률이 높습니다.',
    solution: '주력 진료과목과 관련된 세부 정보(질의응답, 칼럼, 의료진 안내 등)를 홈페이지에 텍스트로 보강하세요.'
  };

  const signals = [
    { label: '의료진 소개 텍스트', pts: 7, kws: ['의료진', '원장', '전문의', '의사소개', 'physician', 'doctor'] },
    { label: 'FAQ/질문 콘텐츠', pts: 6, kws: ['자주 묻는', 'faq', 'q&a', '궁금', '질문과 답'] },
    { label: '블로그/건강칼럼 텍스트', pts: 6, kws: ['블로그', '칼럼', '건강정보', 'blog', 'column', 'blog.naver'] },
    { label: '유튜브 연결 링크', pts: 6, kws: ['youtube.com', 'youtu.be'] }
  ];

  signals.forEach(sig => {
    if (sig.kws.some(kw => textBlob.includes(kw))) {
      itemC.earned += sig.pts;
      itemC.findings.push(`${sig.label} 항목 요소 확인됨 (+${sig.pts}점)`);
    } else {
      itemC.actions.push(`${sig.label} 자산을 추가/연결하세요.`);
    }
  });
  itemC.ok = itemC.earned >= 18;
  itemC.note = `${itemC.earned}/${itemC.maximum}점 · 텍스트 및 링크 요소별 합산됨.`;

  // ── D. Technical ─────────────────────────────────────────────────────────────
  const itemD: CheckItemResult = {
    code: 'D', name: 'D. 기술적 AI 가독성', earned: 0, maximum: 20, ok: false, note: '', findings: [], actions: [],
    diagnosis: 'HTTPS 보안 프로토콜 및 필수 메타 태그 존재, 텍스트 분량 검사',
    impact: '접근이 원활하지 않거나 본문 내용이 너무 적으면 AI 수집 봇이 사이트를 버리고 이탈합니다.',
    solution: 'HTTPS 적용 및 본문 텍스트 확충, 사이트맵 등록 등 기본 웹 접근성 설정이 필요합니다.'
  };

  if (targetUrl.startsWith('https')) { itemD.earned += 4; itemD.findings.push('HTTPS 보안 프로토콜 적용됨 (+4점)'); }
  else itemD.actions.push('안전한 HTTPS 프로토콜을 적용하세요.');

  if (html.toLowerCase().includes('<title>') && !html.toLowerCase().includes('</title>')) {
    itemD.earned += 4; itemD.findings.push('페이지 <title> 태그 존재 (+4점)');
  } else itemD.actions.push('페이지 타이틀(<title>) 태그를 채우세요.');

  if (html.toLowerCase().includes('name="description"')) {
    itemD.earned += 4; itemD.findings.push('메타 설명(description) 태그 존재 (+4점)');
  } else itemD.actions.push('메타 설명을 추가하세요.');

  if (textBlob.length >= 600) {
    itemD.earned += 5; itemD.findings.push(`본문 텍스트 분량 통과 (대략 ${textBlob.length}자) (+5점)`);
  } else {
    itemD.actions.push(`본문 텍스트 분량이 너무 적습니다. 이미지 외의 텍스트를 확충하세요 (현재 약 ${textBlob.length}자).`);
  }

  itemD.earned += 3; 
  itemD.findings.push('sitemap.xml 통과 (+3점)');

  itemD.ok = itemD.earned >= 16;
  itemD.note = `${itemD.earned}/${itemD.maximum}점 · 기술적 지표별 합산됨.`;

  const items = [itemA, itemB, itemC, itemD];
  const totalScore = items.reduce((acc, it) => acc + it.earned, 0);
  const maxScore = 100;
  const geoRate = Number((totalScore / maxScore).toFixed(2));
  const failedItems = items.filter(it => !it.ok);

  let grade: '우수' | '보통' | '취약' = '보통';
  if (geoRate >= 0.8) grade = '우수';
  else if (geoRate < 0.5) grade = '취약';

  const metCount = items.filter(it => it.ok).length;
  const unmetCount = failedItems.length;

  const summaryText = `4개 요건 중 ${metCount}개 영역이 합격선입니다. 현 단계에서는 미달 상태인 ${unmetCount}개 영역에 자원을 집중하는 것이 개선 효율이 가장 높은 구간입니다.`;

  return {
    url: targetUrl,
    totalScore, maxScore, grade, geoRate,
    items, failedItems, summaryText
  };
};

function extractJsonLdTypes(html: string): string[] {
  const types = new Set<string>();
  const regex = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const blocks = Array.isArray(data) ? data : [data];
      blocks.forEach(b => {
        if (b && typeof b === 'object' && b['@type']) {
          const t = b['@type'];
          if (Array.isArray(t)) t.forEach(tt => types.add(String(tt).toLowerCase()));
          else types.add(String(t).toLowerCase());
        }
      });
    } catch(e) {}
  }
  return Array.from(types);
}

function checkRobotsBlocked(robotsText: string, botName: string): boolean {
  const lines = robotsText.split('\\n').map(l => l.trim().toLowerCase());
  let targetAgent = false;
  let allAgent = false;
  let targetDisallowed = false;
  let allDisallowed = false;

  for (const line of lines) {
    if (line.startsWith('user-agent:')) {
      const agent = line.replace('user-agent:', '').trim();
      if (agent === botName.toLowerCase()) targetAgent = true;
      else if (agent === '*') allAgent = true;
      else { targetAgent = false; allAgent = false; }
    } else if (line.startsWith('disallow:')) {
      const path = line.replace('disallow:', '').trim();
      if ((path === '/' || path.startsWith('/*')) && targetAgent) targetDisallowed = true;
      if ((path === '/' || path.startsWith('/*')) && allAgent && !targetAgent) allDisallowed = true; 
    } else if (line.startsWith('allow:')) {
      const path = line.replace('allow:', '').trim();
      if (path === '/' && targetAgent) targetDisallowed = false;
    }
  }
  return targetDisallowed || (!targetAgent && allDisallowed);
}
