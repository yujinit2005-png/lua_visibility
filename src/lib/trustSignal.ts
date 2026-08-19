// src/lib/trustSignal.ts
// 파이썬 trust_signal.py 100% 동일 이식 엔진 + 원천 데이터(스니펫, 링크, 세부 점수) 정밀 추출기

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

export interface CrawlerDetail {
  bot: string;
  desc: string;
  status: 'ALLOWED' | 'BLOCKED';
  score: number;
  maxScore: number;
  rule?: string;
}

export interface ContentSignalDetail {
  label: string;
  exists: boolean;
  score: number;
  maxScore: number;
  snippet?: string;
  links: string[];
  matchedKeywords: string[];
}

export interface TechnicalDetail {
  key: string;
  label: string;
  ok: boolean;
  score: number;
  maxScore: number;
  value?: string | number;
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
  
  // ── [신규] 원천 세부 데이터 (DB 및 리포트 연동용) ──
  crawlerScore: number;
  schemaScore: number;
  contentScore: number;
  technicalScore: number;
  
  crawlerDetails: CrawlerDetail[];
  schemaDetails: {
    schemasFound: string[];
    hasMedical: boolean;
    hasFaq: boolean;
    hasLocal: boolean;
    hasRating: boolean;
    rawJsonLd: any[];
  };
  contentDetails: {
    doctorIntro: ContentSignalDetail;
    faqContent: ContentSignalDetail;
    blogColumn: ContentSignalDetail;
    youtubeMedia: ContentSignalDetail;
  };
  technicalDetails: {
    https: TechnicalDetail;
    title: TechnicalDetail;
    description: TechnicalDetail;
    textVolume: TechnicalDetail;
    sitemap: TechnicalDetail;
  };
}

// CORS proxy helper
const fetchViaProxy = async (url: string): Promise<string | null> => {
  try {
    const fetchOptions: RequestInit = {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'max-age=0'
      },
      signal: AbortSignal.timeout(8000)
    };
    
    // 1. Direct fetch 시도
    let directRes = await fetch(url, fetchOptions);
    let html = await directRes.text();

    // 새로고침(리다이렉트/안티봇) 로직이 의심되는 경우 쿠키를 담아서 2차 요청
    const isSuspicious = html.length < 2000 || html.includes('location.reload') || html.includes('location.href=') || html.includes('location.replace');
    const setCookie = directRes.headers.get('set-cookie');
    
    if (isSuspicious) {
      if (setCookie) {
        (fetchOptions.headers as Record<string, string>)['Cookie'] = setCookie;
      }
      const secondRes = await fetch(url, fetchOptions);
      html = await secondRes.text();
    }
    
    if (html && html.length > 0) return html;
  } catch (e) {
    // fallback to proxy
  }

  try {
    // 2. Proxy fetch 시도 (최후의 수단)
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
  { bot: 'OAI-SearchBot', desc: 'ChatGPT 실시간 검색' },
  { bot: 'ClaudeBot', desc: 'Anthropic(Claude) 수집' },
  { bot: 'PerplexityBot', desc: 'Perplexity 실시간 검색' },
  { bot: 'Google-Extended', desc: 'Google Gemini 그라운딩' },
  { bot: 'Applebot-Extended', desc: 'Apple Intelligence' },
];

const MEDICAL_TYPES = ['medicalclinic', 'hospital', 'medicalbusiness', 'physician', 'dentist', 'medicalorganization'];

// ── 헬퍼: 텍스트 스니펫(발췌문) 추출 ─────────────────────────────────
function extractSnippet(cleanText: string, keywords: string[], maxLen = 140): string {
  if (!cleanText || keywords.length === 0) return '';
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

function extractHrefLinks(html: string, patterns: string[]): string[] {
  if (!html) return [];
  const links = new Set<string>();
  const aRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = aRegex.exec(html)) !== null) {
    const href = match[1].trim();
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
    const lowerHref = href.toLowerCase();
    if (patterns.some(p => lowerHref.includes(p.toLowerCase()))) {
      links.add(href);
    }
  }
  const iframeRegex = /<iframe[^>]+src=["']([^"']+)["'][^>]*>/gi;
  while ((match = iframeRegex.exec(html)) !== null) {
    const src = match[1].trim();
    const lowerSrc = src.toLowerCase();
    if (patterns.some(p => lowerSrc.includes(p.toLowerCase()))) {
      links.add(src);
    }
  }
  return Array.from(links).slice(0, 5); // 최대 5개까지 수집
}

export const analyzeTrustSignals = async (urlStr: string): Promise<TrustSignalFullReport> => {
  const targetUrl = urlStr.startsWith('http') ? urlStr : `https://${urlStr}`;
  let baseUrl = targetUrl;
  try {
    const parsedUrl = new URL(targetUrl);
    baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
  } catch (e) {}
  
  const robotsUrl = `${baseUrl}/robots.txt`;
  const sitemapUrl = `${baseUrl}/sitemap.xml`;

  // Fetch concurrently
  const [htmlContent, robotsText, sitemapText] = await Promise.all([
    fetchViaProxy(targetUrl),
    fetchViaProxy(robotsUrl),
    fetchViaProxy(sitemapUrl)
  ]);

  let html = htmlContent || '';
  
  // Depth 1 scanning: 서브페이지 일부 텍스트 및 링크 보강 (최대 3개)
  if (html) {
    const internalLinks = new Set<string>();
    const aRegex = /<a[^>]+href=["'](\/[^"']+)["'][^>]*>/gi;
    let match;
    while ((match = aRegex.exec(html)) !== null) {
      const href = match[1].trim();
      if (!href.startsWith('#') && !href.startsWith('javascript:') && !href.includes('.png') && !href.includes('.jpg')) {
        internalLinks.add(baseUrl + href);
      }
    }
    const linksToFetch = Array.from(internalLinks).slice(0, 3);
    if (linksToFetch.length > 0) {
      const subpages = await Promise.all(linksToFetch.map(l => fetchViaProxy(l)));
      subpages.forEach(subHtml => {
        if (subHtml) html += '\n\n' + subHtml;
      });
    }
  }

  let processedHtml = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
    
  // <img> 태그의 alt 속성을 추출하여 텍스트로 보존
  processedHtml = processedHtml.replace(/<img[^>]+alt=["']([^"']+)["'][^>]*>/gi, ' $1 ');

  const cleanBodyText = processedHtml
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const textBlob = cleanBodyText.toLowerCase();
  
  // ── A. robots.txt (25점 만점) ─────────────────────────────────────────
  const itemA: CheckItemResult = {
    code: 'A', name: 'A. AI 크롤러 접근성 (robots.txt)', earned: 0, maximum: 25, ok: false, note: '', findings: [], actions: [],
    diagnosis: 'robots.txt에서 주요 AI 검색 크롤러 접근 허용 여부 판별', 
    impact: '접근이 차단된 크롤러는 귀 병원의 정보를 학습하거나 인용할 수 없습니다.', 
    solution: 'robots.txt를 수정하여 크롤러를 허용하세요.'
  };

  const crawlerDetails: CrawlerDetail[] = [];
  const perBotScore = Math.round((25 / AI_CRAWLERS.length) * 10) / 10;

  if (!robotsText || htmlContent === null) {
    itemA.earned = 25;
    itemA.findings.push('robots.txt가 없어 기본적으로 모든 크롤러가 허용된 상태입니다.');
    AI_CRAWLERS.forEach(c => {
      crawlerDetails.push({
        bot: c.bot,
        desc: c.desc,
        status: 'ALLOWED',
        score: perBotScore,
        maxScore: perBotScore,
        rule: '기본 허용 (robots.txt 미존재)'
      });
    });
  } else {
    let allowedCount = 0;
    const allowedBots: string[] = [];
    const blockedBots: string[] = [];

    AI_CRAWLERS.forEach(c => {
      const isBlocked = checkRobotsBlocked(robotsText, c.bot);
      if (isBlocked) {
        blockedBots.push(`${c.bot} (${c.desc})`);
        crawlerDetails.push({
          bot: c.bot,
          desc: c.desc,
          status: 'BLOCKED',
          score: 0,
          maxScore: perBotScore,
          rule: 'Disallow 규칙 감지됨'
        });
      } else {
        allowedBots.push(c.bot);
        allowedCount++;
        crawlerDetails.push({
          bot: c.bot,
          desc: c.desc,
          status: 'ALLOWED',
          score: perBotScore,
          maxScore: perBotScore,
          rule: '접근 허용됨'
        });
      }
    });

    itemA.earned = Math.round(perBotScore * allowedCount);
    if (allowedBots.length > 0) itemA.findings.push(`허용된 AI 크롤러: ${allowedBots.join(', ')}`);
    blockedBots.forEach(b => {
      itemA.findings.push(`차단됨: ${b}`);
      itemA.actions.push(`robots.txt에서 ${b.split(' ')[0]} 차단을 해제하세요.`);
    });
  }
  itemA.ok = itemA.earned >= 20;
  itemA.note = `${itemA.earned}/${itemA.maximum}점 · 크롤러별 개별 분석 점수 반영됨.`;

  // ── B. Schema.org (30점 만점) ─────────────────────────────────────────
  const itemB: CheckItemResult = {
    code: 'B', name: 'B. 구조화 데이터 (Schema.org)', earned: 0, maximum: 30, ok: false, note: '', findings: [], actions: [],
    diagnosis: '의료기관 여부, 진료과 구성, 의료진 규모를 AI에 명시하는 규격 정보 등재 여부 확인',
    impact: 'AI가 귀 병원의 진료과·의료진·기관 종류를 추정에 의존해 처리하게 되며, 추천 빈도가 낮아집니다.',
    solution: '홈페이지에 JSON-LD 규격 정보를 등재하는 방식으로 해소됩니다.'
  };

  const { types: schemaTypes, rawJsonLd } = extractJsonLdInfo(html);
  const hasMedical = MEDICAL_TYPES.some(t => schemaTypes.includes(t));
  const hasFaq = schemaTypes.includes('faqpage');
  const hasLocal = schemaTypes.includes('localbusiness') || hasMedical;
  const hasRating = schemaTypes.includes('aggregaterating') || schemaTypes.includes('review');

  if (schemaTypes.length === 0) {
    itemB.findings.push('JSON-LD 구조화 데이터가 홈페이지 소스에 없습니다.');
    itemB.actions.push('홈페이지에 AI 전용 병원·의료진 규격(구조화 데이터)을 추가하세요.');
  } else {
    if (hasMedical) { itemB.earned += 14; itemB.findings.push('의료기관/진료 관련 스키마 확인됨 (+14점)'); }
    else itemB.actions.push('MedicalClinic/Hospital/Physician 등 의료기관 스키마를 추가하세요.');

    if (hasFaq) { itemB.earned += 8; itemB.findings.push('FAQPage 질문형 스키마 확인됨 (+8점)'); }
    else itemB.actions.push('FAQPage 스키마를 추가하세요.');

    if (hasLocal) { itemB.earned += 5; itemB.findings.push('지역(Local) 사업체 스키마 확인됨 (+5점)'); }
    if (hasRating) { itemB.earned += 3; itemB.findings.push('평점/리뷰 스키마 확인됨 (+3점)'); }
  }
  itemB.ok = itemB.earned >= 20;
  itemB.note = `${itemB.earned}/${itemB.maximum}점 · 감지된 스키마 종류 합산됨.`;

  const schemaDetails = {
    schemasFound: schemaTypes,
    hasMedical,
    hasFaq,
    hasLocal,
    hasRating,
    rawJsonLd
  };

  // ── C. Content (25점 만점) ───────────────────────────────────────────
  const itemC: CheckItemResult = {
    code: 'C', name: 'C. 신뢰 콘텐츠 자산', earned: 0, maximum: 25, ok: false, note: '', findings: [], actions: [],
    diagnosis: '의료진 상세 이력, 환자 맞춤형 FAQ 등 AI가 신뢰할 수 있는 핵심 텍스트/링크 검사',
    impact: 'AI는 전문 정보가 풍부한 병원을 우선 추천하며 텍스트 자원이 적으면 추천 배제 확률이 높습니다.',
    solution: '주력 진료과목과 관련된 세부 정보(질의응답, 칼럼, 의료진 안내 등)를 홈페이지에 텍스트로 보강하세요.'
  };

  // 1) 의료진 소개
  const doctorKws = ['의료진', '원장', '대표원장', '전문의', '의사소개', '약력', 'doctor', 'physician'];
  const hasDoctor = doctorKws.some(kw => textBlob.includes(kw));
  const doctorSnippet = hasDoctor ? extractSnippet(cleanBodyText, doctorKws) : undefined;
  const doctorLinks = extractHrefLinks(html, ['doctor', 'intro', 'staff', 'member', 'medical', 'profile', 'about']);
  const doctorIntroDetail: ContentSignalDetail = {
    label: '의료진 소개 텍스트 & 약력',
    exists: hasDoctor,
    score: hasDoctor ? 7 : 0,
    maxScore: 7,
    snippet: doctorSnippet,
    links: doctorLinks,
    matchedKeywords: doctorKws.filter(kw => textBlob.includes(kw))
  };
  if (hasDoctor) { itemC.earned += 7; itemC.findings.push(`의료진 소개 요소 확인됨 (+7점) [발췌: ${doctorSnippet?.slice(0, 40) || ''}...]`); }
  else itemC.actions.push('의료진 상세 약력/소개 텍스트를 확충하세요.');

  // 2) FAQ 질문형 콘텐츠
  const faqKws = ['자주 묻는', 'faq', 'q&a', '궁금', '질문과 답', '질문', '온라인상담', '고객센터'];
  const hasFaqContent = faqKws.some(kw => textBlob.includes(kw));
  const faqSnippet = hasFaqContent ? extractSnippet(cleanBodyText, faqKws) : undefined;
  const faqLinks = extractHrefLinks(html, ['faq', 'qna', 'question', 'help', 'board', 'bbs', 'consult', 'counsel']);
  const faqContentDetail: ContentSignalDetail = {
    label: 'FAQ / 질문과 답변 콘텐츠',
    exists: hasFaqContent,
    score: hasFaqContent ? 6 : 0,
    maxScore: 6,
    snippet: faqSnippet,
    links: faqLinks,
    matchedKeywords: faqKws.filter(kw => textBlob.includes(kw))
  };
  if (hasFaqContent) { itemC.earned += 6; itemC.findings.push(`FAQ 질의응답 콘텐츠 확인됨 (+6점)`); }
  else itemC.actions.push('환자 주요 궁금증을 해소하는 FAQ 콘텐츠를 추가하세요.');

  // 3) 블로그 / 건강칼럼
  const blogKws = ['블로그', '칼럼', '건강정보', '치료사례', 'blog', 'column', 'blog.naver'];
  const hasBlog = blogKws.some(kw => textBlob.includes(kw)) || html.includes('blog.naver.com');
  const blogSnippet = hasBlog ? extractSnippet(cleanBodyText, blogKws) : undefined;
  const blogLinks = extractHrefLinks(html, ['blog.naver.com', 'blog', 'column', 'news']);
  const blogColumnDetail: ContentSignalDetail = {
    label: '블로그 / 건강칼럼 자산',
    exists: hasBlog,
    score: hasBlog ? 6 : 0,
    maxScore: 6,
    snippet: blogSnippet,
    links: blogLinks,
    matchedKeywords: blogKws.filter(kw => textBlob.includes(kw))
  };
  if (hasBlog) { itemC.earned += 6; itemC.findings.push(`건강칼럼/블로그 연동 자산 확인됨 (+6점) [연결 링크: ${blogLinks[0] || '본문 내 칼럼'}]`); }
  else itemC.actions.push('원장 건강칼럼 또는 네이버 블로그 채널을 연동하세요.');

  // 4) 유튜브 미디어
  const ytKws = ['youtube.com', 'youtu.be', '유튜브', 'TV'];
  const hasYt = ytKws.some(kw => html.toLowerCase().includes(kw.toLowerCase()));
  const ytSnippet = hasYt ? extractSnippet(cleanBodyText, ['유튜브', 'youtube', '영상', 'TV']) : undefined;
  const ytLinks = extractHrefLinks(html, ['youtube.com', 'youtu.be', 'youtube.com/embed/']);
  const youtubeMediaDetail: ContentSignalDetail = {
    label: '유튜브 채널 및 영상 링크',
    exists: hasYt,
    score: hasYt ? 6 : 0,
    maxScore: 6,
    snippet: ytSnippet,
    links: ytLinks,
    matchedKeywords: ytKws.filter(kw => html.toLowerCase().includes(kw.toLowerCase()))
  };
  if (hasYt) { itemC.earned += 6; itemC.findings.push(`유튜브 영상/채널 연동 확인됨 (+6점) [URL: ${ytLinks[0] || 'YouTube'}]`); }
  else itemC.actions.push('원장 인터뷰/설명 영상 유튜브 채널을 연결하세요.');

  itemC.ok = itemC.earned >= 18;
  itemC.note = `${itemC.earned}/${itemC.maximum}점 · 텍스트 및 링크 요소별 합산됨.`;

  const contentDetails = {
    doctorIntro: doctorIntroDetail,
    faqContent: faqContentDetail,
    blogColumn: blogColumnDetail,
    youtubeMedia: youtubeMediaDetail
  };

  // ── D. Technical (20점 만점) ─────────────────────────────────────────
  const itemD: CheckItemResult = {
    code: 'D', name: 'D. 기술적 AI 가독성', earned: 0, maximum: 20, ok: false, note: '', findings: [], actions: [],
    diagnosis: 'HTTPS 보안 프로토콜 및 필수 메타 태그 존재, 텍스트 분량 검사',
    impact: '접근이 원활하지 않거나 본문 내용이 너무 적으면 AI 수집 봇이 사이트를 버리고 이탈합니다.',
    solution: 'HTTPS 적용 및 본문 텍스트 확충, 사이트맵 등록 등 기본 웹 접근성 설정이 필요합니다.'
  };

  // 1) HTTPS
  const isHttps = targetUrl.startsWith('https');
  if (isHttps) { itemD.earned += 4; itemD.findings.push('HTTPS 보안 프로토콜 적용됨 (+4점)'); }
  else itemD.actions.push('안전한 HTTPS 프로토콜을 적용하세요.');

  // 2) Title
  let titleVal = '';
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch && titleMatch[1]) titleVal = titleMatch[1].replace(/\s+/g, ' ').trim();
  const hasTitle = Boolean(titleVal);
  if (hasTitle) { itemD.earned += 4; itemD.findings.push(`페이지 <title> 태그 확인 (+4점) ["${titleVal.slice(0, 30)}..."]`); }
  else itemD.actions.push('페이지 타이틀(<title>) 태그를 채우세요.');

  // 3) Meta Description
  let descVal = '';
  const descMatch = html.match(/<meta\s+(?:[^>]*?\s+)?name=["']?description["']?\s+(?:[^>]*?\s+)?content=["']?([^"'>]+)["']?/i) 
                 || html.match(/<meta\s+(?:[^>]*?\s+)?content=["']?([^"'>]+)["']?\s+(?:[^>]*?\s+)?name=["']?description["']?/i);
  if (descMatch && descMatch[1]) descVal = descMatch[1].trim();
  const hasDesc = Boolean(descVal);
  if (hasDesc) { itemD.earned += 4; itemD.findings.push(`메타 설명(description) 태그 확인 (+4점) ["${descVal.slice(0, 30)}..."]`); }
  else itemD.actions.push('메타 설명을 추가하세요.');

  // 4) Text Volume
  const textCount = cleanBodyText.length;
  const isTextEnough = textCount >= 600;
  if (isTextEnough) { itemD.earned += 5; itemD.findings.push(`본문 텍스트 분량 통과 (${textCount}자) (+5점)`); }
  else itemD.actions.push(`본문 텍스트 분량이 너무 적습니다. 이미지 외의 텍스트를 확충하세요 (현재 약 ${textCount}자).`);

  // 5) Sitemap
  const hasSitemapFile = typeof sitemapText === 'string' && sitemapText.includes('xml');
  const hasSitemapInRobots = typeof robotsText === 'string' && robotsText.toLowerCase().includes('sitemap:');
  const isSitemapFound = hasSitemapFile || hasSitemapInRobots;
  
  if (isSitemapFound) {
    itemD.earned += 3;
    itemD.findings.push('sitemap.xml 통과 (+3점)');
  } else {
    itemD.actions.push('검색 엔진용 사이트맵(sitemap.xml)을 제출하세요.');
  }

  itemD.ok = itemD.earned >= 16;
  itemD.note = `${itemD.earned}/${itemD.maximum}점 · 기술적 지표별 합산됨.`;

  const technicalDetails = {
    https: { key: 'https', label: 'HTTPS 보안 프로토콜', ok: isHttps, score: isHttps ? 4 : 0, maxScore: 4, value: isHttps ? 'HTTPS' : 'HTTP' },
    title: { key: 'title', label: '페이지 타이틀(<title>)', ok: hasTitle, score: hasTitle ? 4 : 0, maxScore: 4, value: titleVal },
    description: { key: 'description', label: '메타 설명 태그', ok: hasDesc, score: hasDesc ? 4 : 0, maxScore: 4, value: descVal },
    textVolume: { key: 'textVolume', label: '본문 텍스트 분량', ok: isTextEnough, score: isTextEnough ? 5 : 0, maxScore: 5, value: textCount },
    sitemap: { key: 'sitemap', label: 'sitemap.xml 사이트맵', ok: true, score: 3, maxScore: 3, value: `${baseUrl}/sitemap.xml` }
  };

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
    totalScore, 
    maxScore, 
    grade, 
    geoRate,
    items, 
    failedItems, 
    summaryText,
    
    crawlerScore: itemA.earned,
    schemaScore: itemB.earned,
    contentScore: itemC.earned,
    technicalScore: itemD.earned,

    crawlerDetails,
    schemaDetails,
    contentDetails,
    technicalDetails
  };
};

function extractJsonLdInfo(html: string): { types: string[]; rawJsonLd: any[] } {
  const types = new Set<string>();
  const rawJsonLd: any[] = [];
  const regex = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      rawJsonLd.push(data);
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
  return { types: Array.from(types), rawJsonLd };
}

function checkRobotsBlocked(robotsText: string, botName: string): boolean {
  const lines = robotsText.split('\n').map(l => l.trim().toLowerCase());
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

