import { callOpenAI, callGemini, callPerplexity, callAnthropic } from './providers';
import { supabase } from './supabase';

interface RunOptions {
  hospitalCode: string;
  version: string;
  aiTools: string[];
  options: { aeo: boolean, geo: boolean, competitor: boolean, trust: boolean, glossary: boolean };
  apiKeys: Record<string, string>;
  appendLog: (msg: string) => void;
  setStepStatus: (step: 'init' | 'measurement' | 'analysis' | 'trust' | 'render', status: 'pending' | 'running' | 'done' | 'error') => void;
  queries: string[];
  reps: number;
  signal?: AbortSignal;
}

export const executeRun = async (opts: RunOptions) => {
  const { hospitalCode, version, aiTools, apiKeys, appendLog, setStepStatus, queries, reps, signal } = opts;

  // Insert a new run into Supabase
  let runId: number | null = null;
  try {
    const { data, error } = await supabase
      .from('runs')
      .insert({
        hospital_code: hospitalCode,
        config_version: version,
        started_at: new Date().toISOString(),
        status: 'RUNNING',
        repetitions: reps,
        total_tasks: queries.length * aiTools.length * reps
      })
      .select('id')
      .single();
    
    if (error) throw error;
    runId = data.id;
  } catch (err: any) {
    appendLog(`DB Error: Failed to create run (${err.message})`);
    // Fallback if no DB
  }

  setStepStatus('measurement', 'running');
  appendLog("2. AI 가시성 측정 중...");

  const activeProviders = aiTools.map(t => t.toLowerCase());

  let totalTasks = 0;
  for (let rep = 1; rep <= reps; rep++) {
    for (const tool of activeProviders) {
      appendLog(`\n[${tool.toUpperCase()}] API 호출 준비 중... (반복 ${rep}/${reps})`);
      
      for (let i = 0; i < queries.length; i++) {
        if (signal?.aborted) throw new Error('ABORTED');
        
        const q = queries[i];
        appendLog(`▶ 질문 ${i + 1}: ${q}`);
        
        try {
          let resText = '';
          let isOk = false;
          
          if (tool === 'openai' && apiKeys.openai) {
            const r = await callOpenAI(q, { apiKey: apiKeys.openai });
            resText = r.text; isOk = true;
          } else if (tool === 'gemini' && apiKeys.gemini) {
            const r = await callGemini(q, { apiKey: apiKeys.gemini });
            resText = r.text; isOk = true;
          } else if (tool === 'perplexity' && apiKeys.perplexity) {
            const r = await callPerplexity(q, { apiKey: apiKeys.perplexity });
            resText = r.text; isOk = true;
          } else if (tool === 'anthropic' && apiKeys.anthropic) {
            const r = await callAnthropic(q, { apiKey: apiKeys.anthropic });
            resText = r.text; isOk = true;
          } else {
            throw new Error(`API Key missing for ${tool}`);
          }
          
          appendLog(`  ✔ 답변 수집 완료 (${resText.substring(0, 30)}...)`);
          await saveAnswer(runId, tool, q, rep, resText, true);
        } catch (e: any) {
          appendLog(`  ❌ 호출 실패: ${tool} Error: ${e.message}`);
          await saveAnswer(runId, tool, q, rep, e.message, false, e.message);
        }
        totalTasks++;
      }
    }
  }

  if (signal?.aborted) throw new Error('ABORTED');

  setStepStatus('measurement', 'done');
  
  if (runId) {
    await supabase.from('runs').update({ status: 'SUCCESS', completed_tasks: totalTasks }).eq('id', runId);
  }

  // Placeholder for analysis
  setStepStatus('analysis', 'running');
  appendLog("\n3. 언급률/추천률 및 기회 지도 분석 진행 중...");
  await new Promise(r => setTimeout(r, 1000));
  if (signal?.aborted) throw new Error('ABORTED');
  setStepStatus('analysis', 'done');

  // Placeholder for trust
  setStepStatus('trust', 'running');
  appendLog("\n4. Trust Signal 기술 점검 진행 중...");
  await new Promise(r => setTimeout(r, 1000));
  if (signal?.aborted) throw new Error('ABORTED');
  setStepStatus('trust', 'done');

  // Placeholder for render
  setStepStatus('render', 'running');
  appendLog("\n5. 영업용 진단 PDF 생성 대기 중...");
  setStepStatus('render', 'done');
};

const saveAnswer = async (runId: number | null, provider: string, query: string, repIndex: number, text: string, ok: boolean, errorText?: string) => {
  if (!runId) return;
  try {
    await supabase.from('answers').insert({
      run_id: runId,
      provider: provider,
      query: query,
      rep_index: repIndex,
      answer_text: text,
      ok: ok ? 1 : 0,
      error: errorText,
      measured_at: new Date().toISOString()
    });
  } catch (err) {
    console.error("Failed to save answer", err);
  }
};

interface RerunOptions extends Omit<RunOptions, 'queries' | 'reps' | 'options' | 'version'> {
  targetRunId?: number;
}

export const executeRerun = async (opts: RerunOptions) => {
  const { hospitalCode, aiTools, apiKeys, appendLog, setStepStatus, targetRunId } = opts;
  
  appendLog(`[재실행] 진단 기록(#${targetRunId || '최신'})에서 실패한 질문을 검색합니다...`);
  setStepStatus('init', 'running');

  let runId = targetRunId;

  if (!runId) {
    // Find the latest run
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

  // Find failed answers for this run
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
    const rep = ans.rep_index;
    
    appendLog(`\n[${provider.toUpperCase()}] 재호출 중... (질문: ${q.substring(0, 15)}...)`);
    
    try {
      let resText = '';
      let isOk = false;
      
      if (provider === 'openai' && apiKeys.openai) {
        const r = await callOpenAI(q, { apiKey: apiKeys.openai });
        resText = r.text; isOk = true;
      } else if (provider === 'gemini' && apiKeys.gemini) {
        const r = await callGemini(q, { apiKey: apiKeys.gemini });
        resText = r.text; isOk = true;
      } else if (provider === 'perplexity' && apiKeys.perplexity) {
        const r = await callPerplexity(q, { apiKey: apiKeys.perplexity });
        resText = r.text; isOk = true;
      } else if (provider === 'anthropic' && apiKeys.anthropic) {
        const r = await callAnthropic(q, { apiKey: apiKeys.anthropic });
        resText = r.text; isOk = true;
      } else {
        appendLog(`  ❌ API 키가 없거나 지원되지 않는 모델입니다.`);
        continue;
      }

      appendLog(`  ✔ 답변 수집 완료 (${resText.substring(0, 30)}...)`);
      
      // Update the answer in DB
      await supabase.from('answers')
        .update({
          answer_text: resText,
          ok: 1,
          error: null,
          measured_at: new Date().toISOString()
        })
        .eq('id', ans.id);
        
      successCount++;
    } catch (e: any) {
      appendLog(`  ❌ 호출 실패: ${e.message}`);
      await supabase.from('answers')
        .update({
          answer_text: e.message,
          error: e.message,
          measured_at: new Date().toISOString()
        })
        .eq('id', ans.id);
    }
  }

  appendLog(`\n✔ 재실행 완료. (${successCount}/${failedAnswers.length}건 복구)`);
  setStepStatus('measurement', 'done');
};
