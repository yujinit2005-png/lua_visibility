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

// ============================================================
// [v1.0.8 이전 구버전 callOpenAI — 환각 문제로 주석 처리]
// ============================================================
// export const callOpenAI_OLD = async (prompt: string, config: ProviderConfig): Promise<ProviderResult> => {
//   const modelName = 'gpt-4o';
//   const urls = ['/api-openai/v1/chat/completions', 'https://api.openai.com/v1/chat/completions'];
//   let response: Response | null = null;
//   let lastErr = '';
//   for (const url of urls) {
//     try {
//       response = await fetch(url, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
//         body: JSON.stringify({
//           model: modelName,
//           messages: [
//             { role: 'system', content: '사용자의 질문에 실시간 웹 검색 결과를 바탕으로 최신 및 위치 정보(행정구역)를 정확히 파악하여 답변하세요. 검색된 결과를 바탕으로 병원명, 주소, 진료시간, 출처(URL)를 구조화하여 한국어로 답변해야 합니다. 실제 존재하지 않는 병원이나 기관을 절대 만들어내지(환각) 마세요.' },
//             { role: 'user', content: prompt }
//           ],
//           temperature: 0.1
//         })
//       });
//       if (response.ok) break;
//       if (response.status === 401 || response.status === 429 || response.status === 400) break;
//     } catch (e: any) { lastErr = e.message || String(e); }
//   }
//   if (!response || !response.ok) { const err = response ? await response.text() : lastErr; throw new Error(`OpenAI Error: ${err}`); }
//   const data = await response.json();
//   const choice = data.choices?.[0];
//   const text = choice?.message?.content || '';
//   const citations: string[] = [];
//   if (choice?.message?.annotations) { choice.message.annotations.forEach((ann: any) => { if (ann.type === 'url_citation' && ann.url) citations.push(ann.url); }); }
//   return { text, model: data.model || modelName, searchUsed: true, citations: citations.length > 0 ? citations : null, httpStatus: response.status };
// };

// ============================================================
// [v1.0.10] callOpenAI — gpt-4o + 환각 억제 프롬프트 + 저온도(temperature: 0.2)
// ============================================================
export const callOpenAI = async (prompt: string, config: ProviderConfig): Promise<ProviderResult> => {
  const modelName = 'gpt-4o';
  const urls = [
    '/api-openai/v1/chat/completions',
    'https://api.openai.com/v1/chat/completions'
  ];

  const systemPrompt = `당신은 대한민국 의료기관 정보 검색 전문가입니다.

[핵심 규칙]
1. 반드시 실제 웹 검색 결과에 존재하는 병원만 출력한다.
2. 검색으로 확인되지 않은 병원명, 주소, 진료시간, 전화번호는 절대 생성하거나 추론하지 않는다.
3. 병원명과 주소가 동일한 출처에서 함께 확인된 경우에만 출력한다.
4. 확인되지 않은 항목은 반드시 "확인되지 않음"으로 표시한다.
5. 출처 URL은 실제 검색 결과에서 가져온 것만 사용한다.

병원명, 주소, 진료시간, 전화번호, 공식 홈페이지를 구조화하여 한국어로 답변하라.`;

  let response: Response | null = null;
  let lastErr = '';

  console.log('[OPENAI REQUEST]', {
    model: modelName,
    promptLength: prompt.length,
    promptPreview: prompt.substring(0, 500)
  });

  for (const url of urls) {
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: modelName,
          temperature: 0.2, // 사실 기반 일관성 및 환각(Hallucination) 억제
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          tools: [
            { type: 'web_search' } // OpenAI 공식 실시간 웹 검색 도구 활성화
          ]
        })
      });
      if (response.ok) break;
      if (response.status === 401 || response.status === 429 || response.status === 400) {
        break;
      }
    } catch (e: any) {
      lastErr = e.message || String(e);
    }
  }

  if (!response || !response.ok) {
    const err = response ? await response.text() : lastErr;
    throw new Error(`OpenAI Error (${response ? response.status : 'Network Error'}): ${err}`);
  }

  const data = await response.json();

  // 토큰 사용량 콘솔 출력
  console.log('[OPENAI USAGE]', data.usage);

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
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-1.5-flash-8b"
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
      .filter((m: string) => !m.includes('1.0'));
    
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
      retriesLeft = 1;
      continue;
    }

    // 2. 400 에러 시 그라운딩 미지원 판단 -> 그라운딩 끄고 1회 재시도
    if (response.status === 400 && useGrounding && !groundingDropped) {
      groundingDropped = true;
      useGrounding = false;
      continue;
    }

    // 3. 429/500/502/503/504 속도제한 및 서버 과부하 시 재시도 및 다음 대체 모델로 자동 전환
    if ([429, 500, 502, 503, 504].includes(response.status)) {
      let bodyJson: any = null;
      let rawText = '';
      try {
        rawText = await response.text();
        bodyJson = JSON.parse(rawText);
      } catch (e) {}

      lastErrorDetail = formatErrDetail(response.status, rawText, bodyJson, apiKey);

      if (retriesLeft > 0) {
        retriesLeft--;
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }

      // 1회 재시도 후에도 해당 모델이 과부하(503) 상태면, 에러로 멈추지 않고 다음 대체 모델로 자동 전환!
      currentModelIdx++;
      retriesLeft = 1;
      continue;
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
      lastErrorDetail = errDetail;
      currentModelIdx++;
      retriesLeft = 1;
      continue;
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
  const urls = [
    '/api-perplexity/chat/completions',
    'https://api.perplexity.ai/chat/completions'
  ];

  let response: Response | null = null;
  let lastErr = '';

  for (const url of urls) {
    try {
      response = await fetch(url, {
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
      if (response.ok) break;
      if (response.status === 401 || response.status === 429 || response.status === 400) break;
    } catch (e: any) {
      lastErr = e.message || String(e);
    }
  }
  
  if (!response || !response.ok) {
    const err = response ? await response.text() : lastErr;
    throw new Error(`Perplexity Error (${response ? response.status : 'Network Error'}): ${err}`);
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
  const urls = [
    '/api-anthropic/v1/messages',
    'https://api.anthropic.com/v1/messages'
  ];

  let response: Response | null = null;
  let lastErr = '';

  for (const url of urls) {
    try {
      response = await fetch(url, {
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
      if (response.ok) break;
      if (response.status === 401 || response.status === 429 || response.status === 400) break;
    } catch (e: any) {
      lastErr = e.message || String(e);
    }
  }
  
  if (!response || !response.ok) {
    const err = response ? await response.text() : lastErr;
    throw new Error(`Anthropic Error (${response ? response.status : 'Network Error'}): ${err}`);
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

export const callNaverLocal = async (prompt: string, config: NaverProviderConfig, _aliases?: string[], customNaverQuery?: string): Promise<ProviderResult> => {
  const clientId = config.clientId || import.meta.env.NCP_APIGW_API_KEY_ID || 'i8ciwrvzln';
  const clientSecret = config.clientSecret || import.meta.env.NCP_APIGW_API_KEY || '9EXRQssZga4OCcnnn1hdM3V9KlSEYzKefwJMvK2x';

  // 1. 불용어 및 서술어/조사 정리 (수술/치료 등 핵심 의학어는 보존)
  const cleaned = prompt
    .replace(/어디야\??|어디가\??|어디서\??|어디\??|알려줘|알려주세요|추천해줘|추천해주세요|추천\??|어떻게|어떤가요\??|될까요\??|있나요\??|할까요\??|있을까요\??|어떨까요\??/g, ' ')
    .replace(/우리|부모님|부모님이|아이|내가|가족|누가|누구|곳|여기|저기|이런/g, ' ')
    .replace(/가까운|편한|다니기|갈만한|모시고|받을 수 있는|받으려면|있는|많은|가장|잘하는|유명한|좋은|괜찮은|잘되어|잘되어있는|가능한|가능|알려진/g, ' ')
    .replace(/전문의가|전문의|전문|진료하는|진료하|진료|치료하는|수술하는|함께|받을/g, ' ')
    .replace(/적정성 평가가|적정성 평가|적정성|평가가|평가|1등급/g, ' ')
    .replace(/근처|주변|인근/g, ' ')
    .replace(/에서|으로|까지|부터|은|는|이|가|을|를|의|와|과|에/g, ' ')
    .replace(/[?.,!'"~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = cleaned.split(' ').filter(w => w.length >= 2);

  const hospitalTypes = [
    '이비인후과의원', '이비인후과', '한방병원', '한의원', '요양병원', '종합병원', '정형외과', '신장내과', 
    '내과의원', '내과', '치과의원', '치과', '안과의원', '안과', '피부과의원', '피부과', '병원', '의원'
  ];

  // 긴 복합 키워드부터 우선 매칭 (무릎 로봇수술 -> 로봇수술 -> 인공관절 수술 -> 인공관절 -> 관절 순)
  const diseaseKeywords = [
    '알레르기 비염', '알레르기비염', '만성 비염', '만성비염', '코막힘 수술', '코막힘수술', '비염 수술', '비염수술', '비염',
    '수면무호흡증', '수면 무호흡증', '코골이', '이석증', '어지럼증', '난청', '이명', '청력검사', '보청기',
    '무릎 로봇수술', '무릎로봇수술', '로봇인공관절수술', '로봇 인공관절 수술', '로봇인공관절', '로봇 인공관절', '로봇수술', '로봇 수술',
    '인공관절수술', '인공관절 수술', '인공관절', '관절경수술', '관절경', '관절수술', '무릎수술', '무릎 수술', '퇴행성관절염', '관절염',
    '척추관협착증', '척추협착증', '허리디스크', '목디스크', '척추관절', '척추', '무릎', '관절', 
    '도수치료', '추나요법', '교통사고', '오십견', '회전근개',
    '만성콩팥병', '신부전', '신장질환', '신장내과', '인공신장실', '인공신장센터', '혈액투석', '투석',
    '백내장', '라식', '라섹', '임플란트', '치아교정'
  ].sort((a, b) => b.length - a.length);

  const diseaseToDeptMap: Record<string, string> = {
    '알레르기 비염': '이비인후과',
    '알레르기비염': '이비인후과',
    '만성 비염': '이비인후과',
    '만성비염': '이비인후과',
    '코막힘 수술': '이비인후과',
    '코막힘수술': '이비인후과',
    '비염 수술': '이비인후과',
    '비염수술': '이비인후과',
    '비염': '이비인후과',
    '수면무호흡증': '이비인후과',
    '수면 무호흡증': '이비인후과',
    '코골이': '이비인후과',
    '이석증': '이비인후과',
    '어지럼증': '이비인후과',
    '난청': '이비인후과',
    '이명': '이비인후과',
    '청력검사': '이비인후과',
    '보청기': '이비인후과',
    '무릎 로봇수술': '정형외과',
    '무릎로봇수술': '정형외과',
    '로봇인공관절수술': '정형외과',
    '로봇 인공관절 수술': '정형외과',
    '로봇인공관절': '정형외과',
    '로봇 인공관절': '정형외과',
    '로봇수술': '정형외과',
    '로봇 수술': '정형외과',
    '인공관절수술': '정형외과',
    '인공관절 수술': '정형외과',
    '인공관절': '정형외과',
    '관절경수술': '정형외과',
    '관절경': '정형외과',
    '관절수술': '정형외과',
    '무릎수술': '정형외과',
    '무릎 수술': '정형외과',
    '무릎': '정형외과',
    '퇴행성관절염': '정형외과',
    '관절염': '정형외과',
    '척추관협착증': '정형외과',
    '척추협착증': '정형외과',
    '허리디스크': '정형외과',
    '목디스크': '정형외과',
    '척추관절': '정형외과',
    '척추': '정형외과',
    '관절': '정형외과',
    '오십견': '정형외과',
    '회전근개': '정형외과',
    '신장질환': '신장내과',
    '만성콩팥병': '신장내과',
    '신부전': '신장내과',
    '혈액투석': '인공신장실',
    '투석': '인공신장실',
    '인공신장실': '인공신장실',
    '인공신장센터': '인공신장실',
    '백내장': '안과',
    '라식': '안과',
    '라섹': '안과',
    '임플란트': '치과',
    '치아교정': '치과'
  };

  const foundHospType = hospitalTypes.find(t => prompt.includes(t)) || '';

  // 질문에서 가장 긴 의학/질환 키워드 추출 (부분 중복 배제)
  const foundDiseases: string[] = [];
  for (const dk of diseaseKeywords) {
    if (prompt.includes(dk) && !foundDiseases.some(fd => fd.includes(dk))) {
      foundDiseases.push(dk);
    }
  }

  const regionCandidates = words.filter(w => 
    !hospitalTypes.some(t => w.includes(t)) && 
    !diseaseKeywords.some(d => w.includes(d) || d.includes(w))
  );

  let region = regionCandidates.length > 0 ? regionCandidates[0] : '';
  if (regionCandidates.length > 1 && (regionCandidates[1].endsWith('동') || regionCandidates[1].endsWith('구') || regionCandidates[1].endsWith('신도시') || regionCandidates[1].endsWith('시') || regionCandidates[1].endsWith('군'))) {
    region += ' ' + regionCandidates[1];
  }

  // 검색 키워드 후보 생성
  const candidateKeywords: string[] = [];
  if (foundDiseases.length > 0) {
    for (const d of foundDiseases) {
      candidateKeywords.push(`${region} ${d}`.trim());
      if (diseaseToDeptMap[d]) {
        candidateKeywords.push(`${region} ${diseaseToDeptMap[d]}`.trim());
      }
    }
  }
  if (foundHospType) {
    candidateKeywords.push(`${region} ${foundHospType}`.trim());
  } else {
    candidateKeywords.push(`${region} 병원`.trim());
  }

  // 네이버 API 전용 질의어가 전달된 경우, 해당 검색어를 단독 최우선으로 지정
  let uniqueCandidates: string[] = [];
  if (customNaverQuery && customNaverQuery.trim()) {
    uniqueCandidates = [customNaverQuery.trim()];
  } else {
    uniqueCandidates = Array.from(new Set(candidateKeywords)).filter(Boolean);
    if (uniqueCandidates.length === 0) uniqueCandidates.push(cleaned || prompt);
  }

  // 순수 네이버 공식 검색 API 호출 함수
  const fetchNaverSearch = async (kw: string) => {
    const queryParam = `?query=${encodeURIComponent(kw)}&display=20&start=1&sort=random`;
    const targets = [
      `/api-naver/search/v1/local${queryParam}`,
      `http://127.0.0.1:5000/api/naver-search${queryParam}`,
      `https://naverapihub.apigw.ntruss.com/search/v1/local${queryParam}`
    ];

    let lastErr = '';
    for (const targetUrl of targets) {
      try {
        const res = await fetch(targetUrl, {
          method: 'GET',
          headers: {
            'X-NCP-APIGW-API-KEY-ID': clientId,
            'X-NCP-APIGW-API-KEY': clientSecret
          }
        });

        if (!res.ok) {
          const t = await res.text().catch(() => '');
          lastErr = `HTTP ${res.status}: ${t.substring(0, 200)}`;
          continue;
        }

        const rawText = await res.text();
        // HTML 문서(index.html 등 프록시 미지원 환경) 응답 감지
        if (rawText.trim().startsWith('<')) {
          lastErr = `HTML page returned from ${targetUrl}`;
          continue;
        }

        const parsed = JSON.parse(rawText);
        return { data: parsed, lastErr: '' };
      } catch (e: any) {
        lastErr = e.message || String(e);
      }
    }
    return { data: null, lastErr };
  };

  let actualSearchKeyword = uniqueCandidates[0];
  let items: any[] = [];
  let totalCount = 0;
  let lastErrorMsg = '';

  // 1차 후보부터 순차적으로 API 호출하여 검색 결과(items)가 있는 것을 채택
  for (const candKw of uniqueCandidates) {
    const { data, lastErr } = await fetchNaverSearch(candKw);
    if (data && data.items && data.items.length > 0) {
      items = data.items;
      totalCount = data.total || items.length;
      actualSearchKeyword = candKw;
      break;
    } else if (data) {
      lastErrorMsg = lastErr;
    }
  }

  // 만약 모든 후보에서 결과가 0건이면 첫 번째 후보 결과 데이터 유지
  if (items.length === 0) {
    const { data, lastErr } = await fetchNaverSearch(uniqueCandidates[0]);
    if (data) {
      items = data.items || [];
      totalCount = data.total || 0;
    } else {
      throw new Error(`Naver Local Search Error: ${lastErr || lastErrorMsg || 'API 호출에 실패했습니다.'}`);
    }
  }

  const cleanTag = (str: string) => (str || '').replace(/<[^>]*>?/g, '');
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
    
    return `[${index + 1}] 
🏥 병원명(타이틀): ${title}
🌐 홈페이지(링크): ${link}
📞 전화번호: ${telephone}
📍 주소: ${address}
🏷️ 카테고리 및 매칭 키워드: ${category} | ${questionWords}
📝 설명: ${description}`;
  }).join('\n\n');

  const resultHeader = `네이버 지역검색(NAVER API HUB) 실측 결과입니다.
📌 원문 질문: ${prompt}
🔍 실제 검색 쿼리: '${actualSearchKeyword}'
📊 총 검색 결과: ${totalCount || items.length}건 중 상위 ${items.length}건`;

  let naverRankPosition: number | null = null;
  const aliasList = _aliases || [];
  for (let i = 0; i < items.length; i++) {
    const title = cleanTag(items[i].title).replace(/\s/g, '').toLowerCase();
    const desc = cleanTag(items[i].description).replace(/\s/g, '').toLowerCase();
    const found = aliasList.some(a => {
      const cleanA = a.replace(/\s/g, '').toLowerCase();
      return title.includes(cleanA) || desc.includes(cleanA);
    });
    if (found) {
      naverRankPosition = i + 1;
      break;
    }
  }

  return {
    text: `${resultHeader}\n\n${formattedItems || '(검색된 지역 병원 데이터가 없습니다.)'}`,
    model: 'naver-local-search',
    searchUsed: true,
    citations: citations.length > 0 ? citations : null,
    httpStatus: 200,
    naverRankPosition
  };
};

