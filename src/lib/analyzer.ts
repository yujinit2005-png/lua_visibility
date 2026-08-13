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

  // 2) 경쟁 병원 집계 (등록된 경쟁사 + 정규식 자동 감지)
  for (const comp of competitors) {
    const nc = normalizeText(comp);
    if (nc && normAnswer.includes(nc)) {
      const isOurAlias = sortedAliases.some(a => normalizeText(a) === nc);
      if (!isOurAlias && !result.competitors_found.includes(comp)) {
        result.competitors_found.push(comp);
      }
    }
  }

  // 2-2) 답변 원문에서 등장하는 일반 병원 이름 자동 감지 (DB 수동 미등록 시 보완)
  const hospMatches = answerText.match(/[가-힣]{2,10}(한방병원|한의원|병원|의원|내과의원|정형외과)/g);
  if (hospMatches) {
    hospMatches.forEach(hName => {
      const nh = normalizeText(hName);
      const isOurAlias = sortedAliases.some(a => normalizeText(a) === nh);
      if (!isOurAlias && !result.competitors_found.includes(hName)) {
        result.competitors_found.push(hName);
      }
    });
  }

  // 3) 추천 판정 (휴리스틱): 언급되었고 추천 신호어가 있거나 목록/번호 형태인 경우
  if (result.mentioned) {
    const hasCue = RECOMMEND_CUES.some(cue => answerText.includes(cue));
    const inList = /(^|\n)\s*(\d+[.)]|[-*•])\s/.test(answerText);
    result.recommended = hasCue || inList;
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

export const executeRun = async (opts: RunOptions) => {
  const { hospitalCode, hospitalName, version, aiTools, apiKeys, appendLog, setStepStatus, queries, reps, signal } = opts;

  // 병원 별칭 및 경쟁사 정보 조회 (DB 의존)
  let aliases: string[] = [hospitalName || '', hospitalCode];
  let competitors: string[] = [];

  try {
    const { data: verData } = await supabase
      .from('hospital_config_versions')
      .select('aliases, competitors')
      .eq('hospital_code', hospitalCode)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (verData) {
      const parsedAliases = typeof verData.aliases === 'string' ? JSON.parse(verData.aliases) : (verData.aliases || []);
      const parsedCompetitors = typeof verData.competitors === 'string' ? JSON.parse(verData.competitors) : (verData.competitors || []);
      if (Array.isArray(parsedAliases)) aliases = [...aliases, ...parsedAliases];
      if (Array.isArray(parsedCompetitors)) competitors = parsedCompetitors;
    }
  } catch (e) {
    // fallback
  }

  aliases = Array.from(new Set(aliases.filter(Boolean)));

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
        total_tasks: totalTasksCount
      })
      .select('id')
      .single();
    
    if (error) throw error;
    runId = data.id;
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
            // Naver에는 aliases 전달 → title 엄격 일치 기반 순위 판정
            pRes = await callNaverLocal(q, { clientId: apiKeys.naverId, clientSecret: apiKeys.naverSecret }, aliases);
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
            aliases,  // 하이라이트용 aliases 저장
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
            aliases,  // 하이라이트용 aliases 저장
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
      trust_score: trustReport.totalScore,
      trust_grade: trustReport.grade,
      geo_readiness: JSON.stringify(trustReport)
    }).eq('id', runId);
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
  aliases?: string[];  // 하이라이트용 유사명칭 배열
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
      matched_alias: p.analysis.matched_alias || null,
      aliases_json: p.aliases ? JSON.stringify(p.aliases) : null,
    };

    await supabase.from('answers').insert(payload);
  } catch (err) {
    console.error("Failed to save answer to DB", err);
  }
};

interface RerunOptions extends Omit<RunOptions, 'queries' | 'reps' | 'options' | 'version'> {
  targetRunId?: number;
}

export const executeRerun = async (opts: RerunOptions) => {
  const { hospitalCode, hospitalName, aiTools, apiKeys, appendLog, setStepStatus, targetRunId } = opts;
  
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

  try {
    const { data: hospVers } = await supabase
      .from('hospital_config_versions')
      .select('aliases, competitors')
      .eq('hospital_code', hospitalCode)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (hospVers) {
      const parsedAliases = typeof hospVers.aliases === 'string' ? JSON.parse(hospVers.aliases) : (hospVers.aliases || []);
      const parsedCompetitors = typeof hospVers.competitors === 'string' ? JSON.parse(hospVers.competitors) : (hospVers.competitors || []);
      if (Array.isArray(parsedAliases)) aliases = [...aliases, ...parsedAliases];
      if (Array.isArray(parsedCompetitors)) competitors = parsedCompetitors;
    }
  } catch (e) {
    // fallback
  }

  aliases = Array.from(new Set(aliases.filter(Boolean)));

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
        // Naver aliases 전달 → title 엄격 일치 기반 순위 판정
        pRes = await callNaverLocal(q, { clientId: apiKeys.naverId, clientSecret: apiKeys.naverSecret }, aliases);
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

