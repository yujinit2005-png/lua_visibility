// src/lib/providers.ts

export interface ProviderConfig {
  apiKey: string;
}

export interface ProviderResult {
  text: string;
  model?: string;
  searchUsed?: boolean;
  citations?: string[] | null;
  httpStatus?: number;
  naverRankPosition?: number | null; // 네이버 지역검색: 병원명이 뮇번째에 노출되었는지 (null=미노출)
}

export const callOpenAI = async (prompt: string, config: ProviderConfig): Promise<ProviderResult> => {
  const modelName = 'gpt-4o';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        {
          role: 'system',
          content: '사용자의 질문에 실시간 웹 검색 결과를 바탕으로 최신 및 위치 정보(행정구역)를 정확히 파악하여 답변하세요. 검색된 결과를 바탕으로 병원명, 주소, 진료시간, 출처(URL)를 구조화하여 한국어로 답변해야 합니다. 실제 존재하지 않는 병원이나 기관을 절대 만들어내지(환각) 마세요.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1
    })
  });
  
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI Error (${response.status}): ${err}`);
  }
  
  const data = await response.json();
  const choice = data.choices?.[0];
  const text = choice?.message?.content || '';

  const citations: string[] = [];
  if (choice?.message?.annotations) {
    choice.message.annotations.forEach((ann: any) => {
      if (ann.type === 'url_citation' && ann.url) citations.push(ann.url);
    });
  }

  return {
    text,
    model: data.model || modelName,
    searchUsed: true,
    citations: citations.length > 0 ? citations : null,
    httpStatus: response.status
  };
};

let resolvedGeminiModel: string | null = null;

const redactApiKey = (str: string, apiKey: string): string => {
  if (!apiKey) return str;
  return str.replaceAll(apiKey, '***KEY***');
};

const STABLE_GEMINI_FALLBACKS = [
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-2.0-flash",
  "gemini-1.5-flash-latest"
];

const listUsableGeminiModels = async (apiKey: string): Promise<string[]> => {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!res.ok) return STABLE_GEMINI_FALLBACKS;
    const data = await res.json();
    const models: any[] = data.models || [];
    const usable = models
      .filter((m: any) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m: any) => (m.name || '').split('/').pop() || '')
      .filter((m: string) => !m.includes('2.5') && !m.includes('1.0')); // deprecated/invalid 필터링
    
    const flash = usable.filter((m: string) => m.toLowerCase().includes('flash'));
    const sorted = flash.length > 0 ? flash : usable;
    return Array.from(new Set([...sorted, ...STABLE_GEMINI_FALLBACKS]));
  } catch (e) {
    return STABLE_GEMINI_FALLBACKS;
  }
};

const formatErrDetail = (resStatus: number, resText: string, bodyJson: any, apiKey: string): string => {
  if (!bodyJson || !bodyJson.error) {
    return redactApiKey(`HTTP ${resStatus}: ${resText.substring(0, 800)}`, apiKey);
  }
  const err = bodyJson.error;
  const parts: string[] = [
    `HTTP ${resStatus}`,
    `status=${err.status || ''}`,
    `code=${err.code || ''}`,
    `message=${err.message || ''}`
  ];

  if (Array.isArray(err.details)) {
    err.details.forEach((d: any) => {
      const t = (d['@type'] || '').split('/').pop();
      if (t === 'QuotaFailure') {
        (d.violations || []).forEach((v: any) => {
          parts.push(`quotaId=${v.quotaId} metric=${v.quotaMetric} value=${v.quotaValue}`);
        });
      } else if (t === 'RetryInfo') {
        parts.push(`retryDelay=${d.retryDelay}`);
      } else if (t !== 'Help') {
        parts.push(`${t}=${JSON.stringify(d)}`);
      }
    });
  }
  return redactApiKey(parts.join(' · '), apiKey);
};

export const callGemini = async (prompt: string, config: ProviderConfig): Promise<ProviderResult> => {
  const apiKey = config.apiKey;
  if (!apiKey) throw new Error("Gemini API 키가 필요합니다.");

  // 동적 모델 순회 큐 구성
  let modelQueue: string[] = [];
  if (resolvedGeminiModel) {
    modelQueue.push(resolvedGeminiModel);
  }
  modelQueue.push(...STABLE_GEMINI_FALLBACKS);
  modelQueue = Array.from(new Set(modelQueue));

  let currentModelIdx = 0;
  let model = modelQueue[currentModelIdx];
  let useGrounding = true;
  let groundingDropped = false;
  let retriesLeft = 1;
  let fetchedDynamicModels = false;
  let lastErrorDetail = '';

  const getEndpoint = (m: string) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;

  while (currentModelIdx < modelQueue.length) {
    model = modelQueue[currentModelIdx];
    const body: any = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7 }
    };
    if (useGrounding) {
      body.tools = [{ google_search: {} }];
    }

    let response: Response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      response = await fetch(getEndpoint(model), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
    } catch (e: any) {
      const isTimeout = e.name === 'AbortError';
      throw new Error(isTimeout ? `[timeout] 요청 60초 초과` : `[failed] ${redactApiKey(e.message || String(e), apiKey)}`);
    }

    // 1. 404 모델 에러 발생 시 -> 다음 모델로 자동 교체 및 순회
    if (response.status === 404) {
      let bodyJson: any = null;
      let rawText = '';
      try {
        rawText = await response.text();
        bodyJson = JSON.parse(rawText);
      } catch (e) {}
      lastErrorDetail = formatErrDetail(response.status, rawText, bodyJson, apiKey);

      if (!fetchedDynamicModels) {
        fetchedDynamicModels = true;
        const dynamicModels = await listUsableGeminiModels(apiKey);
        dynamicModels.forEach(m => {
          if (!modelQueue.includes(m)) modelQueue.push(m);
        });
      }

      currentModelIdx++;
      continue;
    }

    // 2. 400 에러 시 그라운딩 미지원 판단 -> 그라운딩 끄고 1회 재시도
    if (response.status === 400 && useGrounding && !groundingDropped) {
      groundingDropped = true;
      useGrounding = false;
      continue;
    }

    // 3. 429/500/502/503/504 속도제한 및 서버에러 시 재시도
    if ([429, 500, 502, 503, 504].includes(response.status)) {
      let bodyJson: any = null;
      let rawText = '';
      try {
        rawText = await response.text();
        bodyJson = JSON.parse(rawText);
      } catch (e) {}

      const errDetail = formatErrDetail(response.status, rawText, bodyJson, apiKey);

      if (retriesLeft > 0) {
        retriesLeft--;
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      const tag = response.status === 429 ? 'rate_limited' : 'failed';
      throw new Error(`[${tag}] ${errDetail}`);
    }

    // 4. 400 이상 기타 에러
    if (response.status >= 400) {
      let bodyJson: any = null;
      let rawText = '';
      try {
        rawText = await response.text();
        bodyJson = JSON.parse(rawText);
      } catch (e) {}
      const errDetail = formatErrDetail(response.status, rawText, bodyJson, apiKey);
      throw new Error(`[failed] ${errDetail}`);
    }

    // 5. 성공 처리
    const data = await response.json();
    let text = '';
    let citations: string[] | null = null;

    try {
      const cand = data.candidates?.[0];
      if (cand?.content?.parts) {
        text = cand.content.parts.map((p: any) => p.text || '').join('');
      }
      const gm = cand?.groundingMetadata;
      if (gm?.groundingChunks) {
        const urls = gm.groundingChunks
          .map((c: any) => c.web?.uri)
          .filter(Boolean);
        if (urls.length > 0) citations = Array.from(new Set(urls));
      }
    } catch (e: any) {
      throw new Error(`[failed] 응답 파싱 실패: ${redactApiKey(e.message, apiKey)}`);
    }

    const resolvedModelName = data.modelVersion || model;
    resolvedGeminiModel = resolvedModelName;

    return {
      text,
      model: resolvedModelName,
      searchUsed: useGrounding,
      citations,
      httpStatus: response.status
    };
  }

  throw new Error(`[failed] ${lastErrorDetail || '모든 Gemini 모델 연결에 실패했습니다 (키 권한 확인).'}`);
};

export const callPerplexity = async (prompt: string, config: ProviderConfig): Promise<ProviderResult> => {
  const modelName = 'sonar';
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1
    })
  });
  
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Perplexity Error (${response.status}): ${err}`);
  }
  
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  const citations = data.citations || (data.search_results ? data.search_results.map((s: any) => s.url).filter(Boolean) : null);

  return {
    text,
    model: data.model || modelName,
    searchUsed: true,
    citations: citations && citations.length > 0 ? citations : null,
    httpStatus: response.status
  };
};

export const callAnthropic = async (prompt: string, config: ProviderConfig): Promise<ProviderResult> => {
  const modelName = 'claude-3-5-sonnet-20240620';
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: modelName,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1
    })
  });
  
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic Error (${response.status}): ${err}`);
  }
  
  const data = await response.json();
  const text = data.content?.map((b: any) => b.text || '').join('') || '';

  return {
    text,
    model: data.model || modelName,
    searchUsed: false,
    citations: null,
    httpStatus: response.status
  };
};

export interface NaverProviderConfig {
  clientId: string;
  clientSecret: string;
}

export const callNaverLocal = async (prompt: string, config: NaverProviderConfig, aliases?: string[]): Promise<ProviderResult> => {
  // 네이버 지역검색은 자연어(문장) 검색 시 결과가 0건으로 나오는 경우가 많음.
  // 질문 형태의 불용어를 제거하고 명사 위주의 키워드로 변환
  let searchKeyword = prompt
    // 1. 의미없는 명사/대명사/질문
    .replace(/어디야\??|어디가\??|어디서\??|어디\??|알려줘|알려주세요|추천해줘|추천해주세요|추천\??|어떻게|어떤가요\??|될까요\??|있나요\??|할까요\??|있을까요\??|어떨까요\??/g, ' ')
    .replace(/우리|부모님|부모님이|아이|내가|가족|누가|누구|곳|여기|저기/g, ' ')
    // 2. 수식어, 서술어, 동사형 찌꺼기
    .replace(/가까운|편한|다니기|갈만한|모시고|받을 수 있는|받으려면|있는|많은|가장|잘하는|유명한|좋은|괜찮은|잘되어|잘되어있는|가능한|가능/g, ' ')
    .replace(/전문의가|전문의|전문|진료하는|진료하|진료|치료하는|치료|수술하는|수술/g, ' ')
    .replace(/적정성 평가가|적정성 평가|적정성|평가가|평가|1등급/g, ' ')
    // 3. 조사 및 기호
    .replace(/에서|으로|까지|부터|은|는|이|가|을|를|의/g, ' ')
    .replace(/[?.,!'"~]/g, ' ')
    // 4. 연속 공백 제거
    .replace(/\s+/g, ' ')
    .trim();

  // 안전장치: 조건이 4단어 이상 길어지면 네이버 지역검색 0건 확률 급증. 
  // (보통 지역명 1~2단어 + 진료과목 1~2단어면 충분하므로 최대 3~4단어만 사용)
  const words = searchKeyword.split(' ');
  if (words.length > 4) {
    searchKeyword = words.slice(0, 4).join(' ');
  }
    
  if (searchKeyword.length < 2) searchKeyword = prompt;

  const queryParam = `?query=${encodeURIComponent(searchKeyword)}&display=20&start=1&sort=random`;
  
  const urls = [
    `/api-naver/search/v1/local${queryParam}`,
    `https://naverapihub.apigw.ntruss.com/search/v1/local${queryParam}`
  ];

  let response: Response | null = null;
  let lastErrStr = '';

  for (const url of urls) {
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-NCP-APIGW-API-KEY-ID': config.clientId,
          'X-NCP-APIGW-API-KEY': config.clientSecret
        }
      });
      if (response.ok) break;
    } catch (e: any) {
      lastErrStr = e.message;
    }
  }

  if (!response || !response.ok) {
    const errText = response ? await response.text() : lastErrStr;
    throw new Error(`Naver Local Search Error (${response ? response.status : 'Network Error'}): ${errText}`);
  }

  const data = await response.json();
  const items = data.items || [];

  const cleanTag = (str: string) => (str || '').replace(/<[^>]*>?/g, '');

  // 질문 문장을 형태소(단어) 단위로 대략 분리하여 콤마로 연결 (추천, 잘하는 등의 키워드가 텍스트에 포함되도록 유도)
  const questionWords = prompt.split(/\s+/).filter(w => w.length > 0).join(', ');

  const citations: string[] = [];
  const formattedItems = items.map((item: any, index: number) => {
    const title = cleanTag(item.title);
    const category = cleanTag(item.category);
    const address = cleanTag(item.roadAddress || item.address);
    const description = cleanTag(item.description);
    const telephone = cleanTag(item.telephone || '');
    const link = item.link || '';
    
    if (link) citations.push(link);
    
    // 네이버 검색 결과를 LLM 텍스트처럼 풍부하게 구성
    // 질문 키워드를 카테고리에 포함시켜 타 AI와 동일한 추천(recommended) 판정이 가능하도록 함
    return `[${index + 1}] 
🏥 병원명(타이틀): ${title}
🌐 홈페이지(링크): ${link}
📞 전화번호: ${telephone}
📍 주소: ${address}
🏷️ 카테고리 및 매칭 키워드: ${category} | ${questionWords}
📝 설명: ${description}`;
  }).join('\n\n');

  return {
    text: `네이버 지역검색(NAVER API HUB) 결과입니다.\n\n${formattedItems}`,
    model: 'naver-local-search',
    searchUsed: true,
    citations: citations.length > 0 ? citations : null,
    httpStatus: 200,
  };
};

