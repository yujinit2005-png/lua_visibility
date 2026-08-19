import { callOpenAI, callGemini, callPerplexity, callAnthropic, callNaverLocal } from './providers';
import type { ProviderResult } from './providers';
import { supabase } from './supabase';
import { analyzeTrustSignals } from './trustSignal';

const RECOMMEND_CUES = [
  "추천", "잘하는", "잘 하는", "유명", "손꼽", "대표적",
  "믿을", "좋은 곳", "좋습니다", "가볼 만", "권", "찾는 곳", "알려져"
];

const normalizeText = (s: string) => {
  return (s || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
};

// (파이썬 원본과 일치하도록 불필요한 별칭 자동 추출 로직인 generateSmartAliases를 제거하고 DB에 등록된 정식 별칭만 사용합니다)

export interface AnswerAnalysisResult {
  mentioned: boolean;
  recommended: boolean;
  first_position: number | null;
  competitors_found: string[];
  matched_alias: string | null;
}

export const analyzeAnswer = (
  answerText: string,
  aliases: string[],
  competitors: string[]
): AnswerAnalysisResult => {
  const result: AnswerAnalysisResult = {
    mentioned: false,
    recommended: false,
    first_position: null,
    competitors_found: [],
    matched_alias: null,
  };

  if (!answerText) return result;

  const normAnswer = normalizeText(answerText);

  // 1) 우리 병원 언급 여부 및 첫 등장 위치 (부분매칭 오탐 방지를 위해 긴 별칭부터 매칭)
  const sortedAliases = Array.from(new Set(aliases)).sort((a, b) => b.length - a.length);
  for (const alias of sortedAliases) {
    const na = normalizeText(alias);
    if (!na) continue;
    const idx = normAnswer.indexOf(na);
    if (idx !== -1) {
      result.mentioned = true;
      result.matched_alias = alias;
      result.first_position = idx;
      break;
    }
  }

  // 2) 경쟁 병원 집계 (등록된 경쟁사가 있으면 등록된 목록만 검사, 없을 때만 자동 감지)
  const GENERIC_HOSP_NOUNS = new Set([
    '한방병원', '한의원', '병원', '의원', '종합병원', '대학병원', '요양병원', 
    '전문병원', '일반병원', '치과의원', '피부과의원', '상급종합병원', '클리닉', '센터', '진료소', '보건소'
  ]);

  if (competitors && competitors.length > 0) {
    for (const comp of competitors) {
      const cleanComp = comp.replace(/^["']+|["']+$/g, '').trim();
      const nc = normalizeText(cleanComp);
      if (nc && !GENERIC_HOSP_NOUNS.has(cleanComp) && normAnswer.includes(nc)) {
        const isOurAlias = sortedAliases.some(a => normalizeText(a) === nc);
        if (!isOurAlias && !result.competitors_found.includes(cleanComp)) {
          result.competitors_found.push(cleanComp);
        }
      }
    }
  } else {
    // 2-2) 등록된 경쟁병원이 없을 때만 답변 원문에서 고유 병원 이름 자동 감지 (일반 명사 단독 제외)
    const hospMatches = answerText.match(/[가-힣]{2,10}(한방병원|한의원|병원|의원|내과의원|정형외과|이비인후과)/g);
    if (hospMatches) {
      hospMatches.forEach(hName => {
        const trimmed = hName.replace(/^["']+|["']+$/g, '').trim();
        const nh = normalizeText(trimmed);
        if (GENERIC_HOSP_NOUNS.has(trimmed)) return;
        const isOurAlias = sortedAliases.some(a => normalizeText(a) === nh || nh.includes(normalizeText(a)));
        if (!isOurAlias && !result.competitors_found.includes(trimmed)) {
          result.competitors_found.push(trimmed);
        }
      });
    }
  }

  // 3) 추천 판정 (휴리스틱): 언급되었고 추천 신호어가 있거나 목록/번호/플레이스 검색 형태인 경우
  if (result.mentioned) {
    const hasCue = RECOMMEND_CUES.some(cue => answerText.includes(cue));
    const inList = /(^|\n)\s*(\[\d+\]|\d+[.)]|[-*•])\s*/.test(answerText);
    const isNaverLocal = answerText.includes('네이버 지역검색') || answerText.includes('NAVER API HUB');
    result.recommended = hasCue || inList || isNaverLocal;
  }

  return result;
};

interface RunOptions {
  hospitalCode: string;
  hospitalName?: string;
  version: string;
  aiTools: string[];
  options: { aeo: boolean, geo: boolean, competitor: boolean, trust: boolean, glossary: boolean };
  apiKeys: Record<string, string>;
  appendLog: (msg: string) => void;
  setStepStatus: (step: 'init' | 'measurement' | 'scoring' | 'trust' | 'render', status: 'pending' | 'running' | 'done' | 'error') => void;
  queries: string[];
  reps: number;
  signal?: AbortSignal;
}

const parseList = (val: any): string[] => {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.map(s => String(s).replace(/^["']+|["']+$/g, '').trim()).filter(Boolean);
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map(s => String(s).replace(/^["']+|["']+$/g, '').trim()).filter(Boolean);
        }
      } catch (e) {}
    }
    return trimmed
      .split(/[\n,]+/)
      .map(s => s.replace(/^["']+|["']+$/g, '').trim())
      .filter(Boolean);
  }
  return [];
};

export const executeRun = async (opts: RunOptions) => {
  const { hospitalCode, hospitalName, version, aiTools, apiKeys, appendLog, setStepStatus, queries, reps, signal } = opts;

  // 병원 별칭, 경쟁사 및 네이버 전용 질의어 정보 조회 (DB 의존)
  let aliases: string[] = [hospitalName || '', hospitalCode];
  let competitors: string[] = [];
  let naverQueries: string[] = [];

  try {
    let verQuery = supabase
      .from('hospital_config_versions')
      .select('aliases, competitors, naver_queries')
      .eq('hospital_code', hospitalCode);

    if (version) {
      verQuery = verQuery.eq('version', version);
    }

    let { data: verData } = await verQuery
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!verData) {
      // fallback to latest version
      const { data: latestVer } = await supabase
        .from('hospital_config_versions')
        .select('aliases, competitors, naver_queries')
        .eq('hospital_code', hospitalCode)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
      verData = latestVer;
    }

    if (verData) {
      const parsedAliases = parseList(verData.aliases);
      const parsedCompetitors = parseList(verData.competitors);
      const parsedNaverQueries = parseList(verData.naver_queries);
      if (parsedAliases.length > 0) aliases = [...aliases, ...parsedAliases];
      if (parsedCompetitors.length > 0) competitors = parsedCompetitors;
      if (parsedNaverQueries.length > 0) naverQueries = parsedNaverQueries;
    }
  } catch (e) {
    // fallback
  }

  aliases = Array.from(new Set(aliases.filter(Boolean)));
  competitors = Array.from(new Set(competitors.filter(Boolean)));

  // Insert a new run into Supabase
  let runId: number | null = null;
  const totalTasksCount = queries.length * aiTools.length * reps;
  try {
    const targetHospName = hospitalName || hospitalCode;
    const { data, error } = await supabase
      .from('runs')
      .insert({
        hospital: targetHospName,
        hospital_code: hospitalCode,
        config_version: version,
        started_at: new Date().toISOString(),
        status: 'RUNNING',
        repetitions: reps,
        total_tasks: totalTasksCount,
        temperature: 0.1,
        device: 'pc',
        login_state: 'logged_out',
      })
      .select('id')
      .single();
    
    if (error) {
      console.error('Run insert error:', error);
      appendLog(`DB Error: Failed to create run (${error.message})`);
    } else {
      runId = data.id;
    }
  } catch (err: any) {
    appendLog(`DB Error: Failed to create run (${err.message})`);
  }

  setStepStatus('measurement', 'running');
  appendLog("2. AI 가시성 측정 중...");

  const activeProviders = aiTools.map(t => t.toLowerCase());

  let totalTasks = 0;
  let successTasks = 0;
  let mentionTasks = 0;

  for (let rep = 1; rep <= reps; rep++) {
    for (const tool of activeProviders) {
      appendLog(`\n[${tool.toUpperCase()}] API 호출 준비 중... (반복 ${rep}/${reps})`);
      
      for (let i = 0; i < queries.length; i++) {
        if (signal?.aborted) throw new Error('ABORTED');
        
        const q = queries[i];
        const questionId = `Q${i + 1}`;
        const taskId = `T${String(totalTasks + 1).padStart(3, '0')}`;
        const taskStartTime = Date.now();
        const customNaverQ = naverQueries[i] || '';

        appendLog(`▶ 질문 ${i + 1} (${questionId}): ${q}`);
        
        try {
          let pRes: ProviderResult;
          
          if (tool === 'openai' && apiKeys.openai) {
            pRes = await callOpenAI(q, { apiKey: apiKeys.openai });
          } else if (tool === 'gemini' && apiKeys.gemini) {
            pRes = await callGemini(q, { apiKey: apiKeys.gemini });
          } else if (tool === 'perplexity' && apiKeys.perplexity) {
            pRes = await callPerplexity(q, { apiKey: apiKeys.perplexity });
          } else if (tool === 'naver' && (apiKeys.naverId || apiKeys.naverSecret)) {
            // Naver에는 aliases 및 전용 질의어(customNaverQ) 전달
            pRes = await callNaverLocal(q, { clientId: apiKeys.naverId, clientSecret: apiKeys.naverSecret }, aliases, customNaverQ);
          } else if (tool === 'anthropic' && apiKeys.anthropic) {
            pRes = await callAnthropic(q, { apiKey: apiKeys.anthropic });
          } else {
            throw new Error(`API Key missing for ${tool}`);
          }
          
          const durationSeconds = Number(((Date.now() - taskStartTime) / 1000).toFixed(2));

          // 네이버 판독 결과도 타 AI와 100% 동일한 판정 기준(analyzeAnswer)을 사용합니다.
          const analysis = analyzeAnswer(pRes.text, aliases, competitors);

          if (analysis.mentioned) mentionTasks++;
          successTasks++;

          appendLog(`  ✔ 답변 수집 완료 (${pRes.text.substring(0, 30)}...) [언급: ${analysis.mentioned ? '✔' : '❌'}, 추천: ${analysis.recommended ? '✔' : '❌'}]`);
          
          await saveAnswer(runId, {
            provider: tool,
            model: pRes.model || tool,
            query: q,
            repIndex: rep,
            answerText: pRes.text,
            ok: true,
            analysis,
            searchUsed: pRes.searchUsed,
            citations: pRes.citations,
            taskId,
            questionId,
            durationSeconds,
            httpStatus: pRes.httpStatus || 200,
            status: 'success',
          });

        } catch (e: any) {
          const durationSeconds = Number(((Date.now() - taskStartTime) / 1000).toFixed(2));
          appendLog(`  ❌ 호출 실패: ${tool} Error: ${e.message}`);
          
          await saveAnswer(runId, {
            provider: tool,
            model: tool,
            query: q,
            repIndex: rep,
            answerText: e.message,
            ok: false,
            errorText: e.message,
            analysis: { mentioned: false, recommended: false, first_position: null, competitors_found: [], matched_alias: null },
            searchUsed: false,
            citations: null,
            taskId,
            questionId,
            durationSeconds,
            httpStatus: 500,
            status: 'failed',
          });
        }
        totalTasks++;
      }
    }
  }

  if (signal?.aborted) throw new Error('ABORTED');

  setStepStatus('measurement', 'done');
  
  const successRate = totalTasks > 0 ? Math.round((successTasks / totalTasks) * 100) : 0;
  const overallMentionRate = successTasks > 0 ? Math.round((mentionTasks / successTasks) * 100) : 0;
  const resultSummary = `진단 완료 (총 ${totalTasks}/${totalTasksCount}건 완료, 성공률 ${successRate}%, 언급률 ${overallMentionRate}%)`;

  if (runId) {
    await supabase.from('runs').update({
      status: 'SUCCESS',
      completed_tasks: totalTasks,
      success_rate: successRate,
      overall_mention_rate: overallMentionRate,
      result_summary: resultSummary,
      ended_at: new Date().toISOString()
    }).eq('id', runId);
  }

  // 3. 언급률/추천률 및 기회 지도 분석 (scoring 스텝 키 정상 동기화)
  setStepStatus('scoring', 'running');
  appendLog("\n3. 언급률/추천률 및 기회 지도 분석 진행 중...");
  await new Promise(r => setTimeout(r, 600));
  if (signal?.aborted) throw new Error('ABORTED');
  setStepStatus('scoring', 'done');

  // 4. Trust Signal 기술 점검 (GEO 준비도 파이썬 호환 정밀 실측 및 DB 저장)
  setStepStatus('trust', 'running');
  appendLog("\n4. Trust Signal 기술 점검 (GEO 준비도) 실측 진행 중...");
  
  // 병원 홈페이지 URL 수집
  let targetUrl = '';
  try {
    const { data: hospData } = await supabase
      .from('hospitals')
      .select('homepage')
      .eq('hospital_code', hospitalCode)
      .maybeSingle();
    if (hospData?.homepage) targetUrl = hospData.homepage;
  } catch (e) {}

  const trustReport = await analyzeTrustSignals(targetUrl);

  if (runId) {
    await supabase.from('runs').update({
      trust_report_json: JSON.stringify(trustReport)
    }).eq('id', runId);

    // [신규] trust_signal_audits 테이블에 4대 영역 원천 세부 데이터(스니펫, 링크, 세부 점수) 적재
    const auditPayload = {
      run_id: Number(runId),
      hospital_code: hospitalCode || null,
      target_url: targetUrl || trustReport.url || 'http://localhost',
      total_score: Number(trustReport.totalScore) || 0,
      grade: trustReport.grade || '보통',
      geo_rate: Number(trustReport.geoRate) || 0,
      crawler_score: Number(trustReport.crawlerScore ?? trustReport.items?.[0]?.earned) || 0,
      schema_score: Number(trustReport.schemaScore ?? trustReport.items?.[1]?.earned) || 0,
      content_score: Number(trustReport.contentScore ?? trustReport.items?.[2]?.earned) || 0,
      technical_score: Number(trustReport.technicalScore ?? trustReport.items?.[3]?.earned) || 0,
      crawler_details: trustReport.crawlerDetails || [],
      schema_details: trustReport.schemaDetails || {},
      content_details: trustReport.contentDetails || {},
      technical_details: trustReport.technicalDetails || {},
      full_report_json: trustReport
    };

    const { error: auditErr } = await supabase
      .from('trust_signal_audits')
      .insert(auditPayload);

    if (auditErr) {
      appendLog(`  ❌ trust_signal_audits 저장 실패: ${auditErr.message}`);
      console.error('trust_signal_audits insert error:', auditErr);
    } else {
      appendLog(`  ✔ trust_signal_audits 원천 데이터 DB 저장 성공 (Run #${runId})`);
    }
  }

  appendLog(`  ✔ 홈페이지 Trust Signal 점검 완료 (점수: ${trustReport.totalScore}점 ${trustReport.grade}, GEO 준비도 Math.round(${trustReport.geoRate * 100})%)`);
  await new Promise(r => setTimeout(r, 600));
  if (signal?.aborted) throw new Error('ABORTED');
  setStepStatus('trust', 'done');

  // 5. 영업용 진단 PDF 생성 대기
  setStepStatus('render', 'running');
  appendLog("\n5. 영업용 진단 PDF 생성 준비 중...");
  await new Promise(r => setTimeout(r, 400));
  setStepStatus('render', 'done');
};

interface SaveAnswerParams {
  provider: string;
  model: string;
  query: string;
  repIndex: number;
  answerText: string;
  ok: boolean;
  errorText?: string;
  analysis: AnswerAnalysisResult;
  searchUsed?: boolean;
  citations?: string[] | null;
  taskId: string;
  questionId: string;
  durationSeconds: number;
  httpStatus: number;
  status: string;
}

const saveAnswer = async (runId: number | null, p: SaveAnswerParams) => {
  if (!runId) return;
  try {
    const payload: any = {
      run_id: runId,
      provider: p.provider,
      model: p.model,
      query: p.query,
      rep_index: p.repIndex,
      answer_text: p.answerText,
      ok: p.ok ? 1 : 0,
      error: p.errorText || null,
      mentioned: p.analysis.mentioned ? 1 : 0,
      recommended: p.analysis.recommended ? 1 : 0,
      first_position: p.analysis.first_position,
      competitors: JSON.stringify(p.analysis.competitors_found || []),
      measured_at: new Date().toISOString(),
      search_used: p.searchUsed ? 1 : 0,
      citations: p.citations ? JSON.stringify(p.citations) : null,
      task_id: p.taskId,
      question_id: p.questionId,
      duration_seconds: p.durationSeconds,
      http_status: p.httpStatus,
      status: p.status,
    };

    const { error } = await supabase.from('answers').insert(payload);
    if (error) {
      console.error("Supabase insert answer error:", error);
    }
  } catch (err) {
    console.error("Failed to save answer to DB", err);
  }
};

interface RerunOptions extends Omit<RunOptions, 'queries' | 'reps' | 'options' | 'version'> {
  targetRunId?: number;
}

export const executeRerun = async (opts: RerunOptions) => {
  const { hospitalCode, hospitalName, apiKeys, appendLog, setStepStatus, targetRunId } = opts;
  
  appendLog(`[재실행] 진단 기록(#${targetRunId || '최신'})에서 실패한 질문을 검색합니다...`);
  setStepStatus('init', 'running');

  let runId = targetRunId;

  if (!runId) {
    const { data: run, error: runError } = await supabase
      .from('runs')
      .select('id')
      .eq('hospital_code', hospitalCode)
      .order('id', { ascending: false })
      .limit(1)
      .single();

    if (runError || !run) {
      appendLog(`❌ 재실행할 최신 진단 기록(run)을 찾을 수 없습니다.`);
      setStepStatus('init', 'error');
      return;
    }
    runId = run.id;
  }

  // 별칭 및 경쟁사 정보 조회
  let aliases: string[] = [hospitalName || '', hospitalCode];
  let competitors: string[] = [];
  let naverQueries: string[] = [];
  let hospQueries: string[] = [];

  try {
    const { data: hospVers } = await supabase
      .from('hospital_config_versions')
      .select('aliases, competitors, queries, naver_queries')
      .eq('hospital_code', hospitalCode)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (hospVers) {
      const parsedAliases = parseList(hospVers.aliases);
      const parsedCompetitors = parseList(hospVers.competitors);
      const parsedQueries = parseList(hospVers.queries);
      const parsedNaverQueries = parseList(hospVers.naver_queries);
      if (parsedAliases.length > 0) aliases = [...aliases, ...parsedAliases];
      if (parsedCompetitors.length > 0) competitors = parsedCompetitors;
      if (parsedQueries.length > 0) hospQueries = parsedQueries;
      if (parsedNaverQueries.length > 0) naverQueries = parsedNaverQueries;
    }
  } catch (e) {
    // fallback
  }

  aliases = Array.from(new Set(aliases.filter(Boolean)));
  competitors = Array.from(new Set(competitors.filter(Boolean)));

  const { data: failedAnswers, error: ansError } = await supabase
    .from('answers')
    .select('*')
    .eq('run_id', runId)
    .eq('ok', 0);

  if (ansError) {
    appendLog(`❌ 답변 조회 실패: ${ansError.message}`);
    setStepStatus('init', 'error');
    return;
  }

  if (!failedAnswers || failedAnswers.length === 0) {
    appendLog(`  ✔ 최근 진단 기록에 실패한 항목이 없습니다.`);
    setStepStatus('init', 'done');
    return;
  }

  appendLog(`  ⚠ 총 ${failedAnswers.length}개의 실패한 측정 항목을 재실행합니다.`);
  setStepStatus('init', 'done');
  setStepStatus('measurement', 'running');

  let successCount = 0;
  
  for (const ans of failedAnswers) {
    const q = ans.query;
    const provider = ans.provider;
    const taskStartTime = Date.now();
    const qIdx = hospQueries.findIndex(hq => hq === q);
    const customNaverQ = qIdx !== -1 && naverQueries[qIdx] ? naverQueries[qIdx] : '';
    
    appendLog(`\n[${provider.toUpperCase()}] 재호출 중... (질문: ${q.substring(0, 15)}...)`);
    
    try {
      let pRes: ProviderResult;
      
      if (provider === 'openai' && apiKeys.openai) {
        pRes = await callOpenAI(q, { apiKey: apiKeys.openai });
      } else if (provider === 'gemini' && apiKeys.gemini) {
        pRes = await callGemini(q, { apiKey: apiKeys.gemini });
      } else if (provider === 'perplexity' && apiKeys.perplexity) {
        pRes = await callPerplexity(q, { apiKey: apiKeys.perplexity });
      } else if (provider === 'naver' && (apiKeys.naverId || apiKeys.naverSecret)) {
        // Naver aliases 및 customNaverQ 전달 → title 엄격 일치 기반 순위 판정
        pRes = await callNaverLocal(q, { clientId: apiKeys.naverId, clientSecret: apiKeys.naverSecret }, aliases, customNaverQ);
      } else if (provider === 'anthropic' && apiKeys.anthropic) {
        pRes = await callAnthropic(q, { apiKey: apiKeys.anthropic });
      } else {
        appendLog(`  ❌ API 키가 없거나 지원되지 않는 모델입니다.`);
        continue;
      }

      const durationSeconds = Number(((Date.now() - taskStartTime) / 1000).toFixed(2));

      // Naver는 naverRankPosition 기반 언급 판정
      let analysis: ReturnType<typeof analyzeAnswer>;
      if (provider === 'naver' && pRes.naverRankPosition !== undefined) {
        const navMentioned = pRes.naverRankPosition !== null;
        analysis = {
          mentioned: navMentioned,
          recommended: navMentioned && (pRes.naverRankPosition as number) <= 3,
          first_position: pRes.naverRankPosition,
          competitors_found: [],
          matched_alias: navMentioned ? aliases[0] || null : null,
        };
      } else {
        analysis = analyzeAnswer(pRes.text, aliases, competitors);
      }

      appendLog(`  ✔ 답변 수집 완료 (${pRes.text.substring(0, 30)}...) [언급: ${analysis.mentioned ? '✔' : '❌'}]`);
      
      // Update DB record with full details
      await supabase.from('answers')
        .update({
          model: pRes.model || provider,
          answer_text: pRes.text,
          ok: 1,
          error: null,
          mentioned: analysis.mentioned ? 1 : 0,
          recommended: analysis.recommended ? 1 : 0,
          first_position: analysis.first_position,
          competitors: JSON.stringify(analysis.competitors_found || []),
          measured_at: new Date().toISOString(),
          search_used: pRes.searchUsed ? 1 : 0,
          citations: pRes.citations ? JSON.stringify(pRes.citations) : null,
          duration_seconds: durationSeconds,
          http_status: pRes.httpStatus || 200,
          status: 'success'
        })
        .eq('id', ans.id);
        
      successCount++;
    } catch (e: any) {
      appendLog(`  ❌ 호출 실패: ${e.message}`);
      await supabase.from('answers')
        .update({
          answer_text: e.message,
          error: e.message,
          measured_at: new Date().toISOString(),
          status: 'failed'
        })
        .eq('id', ans.id);
    }
  }

  appendLog(`\n✔ 재실행 완료. (${successCount}/${failedAnswers.length}건 복구)`);
  setStepStatus('measurement', 'done');
};

