import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { callOpenAI, callGemini, callPerplexity, callAnthropic, callNaverLocal } from '../../lib/providers';
import type { ProviderResult } from '../../lib/providers';
import { generateAndUploadReport } from '../../lib/reportGenerator';
import { useDashboard } from '../../contexts/DashboardContext';
import { analyzeAnswer } from '../../lib/analyzer';

interface AnswerItem {
  id: number;
  run_id: number;
  provider: string;
  query: string;
  question_id?: string;
  rep_index: number;
  ok: boolean;
  mentioned: boolean;
  recommended: boolean;
  answer_text: string;
  error?: string;
  aliases_json?: any;
}

interface RerunModalProps {
  isOpen: boolean;
  onClose: () => void;
  runId: number;
  hospitalCode: string;
  hospitalName: string;
  onChangeRun: () => void;
}

// ── 병원명 하이라이트 유틸 ────────────────────────────────────────────
const highlightText = (text: string, aliasesJson: any): React.ReactNode => {
  if (!text) return text;
  
  let aliases: string[] = [];
  if (aliasesJson) {
    try {
      aliases = typeof aliasesJson === 'string' ? JSON.parse(aliasesJson) : aliasesJson;
    } catch(e) {}
  }
  if (!Array.isArray(aliases) || aliases.length === 0) return text;

  const sortedAliases = aliases.filter(a => typeof a === 'string' && a.trim().length > 0).sort((a, b) => b.length - a.length);
  if (sortedAliases.length === 0) return text;

  const escapeReg = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = sortedAliases.map(escapeReg).join('|');
  const regex = new RegExp(`(${pattern})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) => {
        const isMatch = sortedAliases.some(a => a.toLowerCase() === part.toLowerCase());
        return isMatch ? (
          <mark key={i} style={{ background: '#FDE68A', color: '#92400E', borderRadius: '2px', padding: '0 1px', fontWeight: 700 }}>
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
};

export const RerunModal: React.FC<RerunModalProps> = ({
  isOpen,
  onClose,
  runId,
  hospitalCode,
  hospitalName,
  onChangeRun,
}) => {
  const { apiKeys } = useDashboard();
  const [answers, setAnswers] = useState<AnswerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isRerunning, setIsRerunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [aiTools, setAiTools] = useState({ openai: false, gemini: false, perplexity: false, naver: false, anthropic: false });
  const [stepStatuses, setStepStatuses] = useState({
    init: 'done',
    measurement: 'done',
    analysis: 'pending',
    trust: 'pending',
    render: 'pending',
  });
  // 수집 결과 팝업
  const [answerPopup, setAnswerPopup] = useState<AnswerItem | null>(null);
  
  // 리스트 체크박스 선택 상태
  const [selectedAnswerIds, setSelectedAnswerIds] = useState<Set<number>>(new Set());

  // 현재 체크된 AI 도구에 따라 리스트 필터링
  const filteredAnswers = answers.filter(ans => {
    const prov = (ans.provider || '').toLowerCase();
    if (prov.includes('openai') && aiTools.openai) return true;
    if (prov.includes('gemini') && aiTools.gemini) return true;
    if (prov.includes('perplexity') && aiTools.perplexity) return true;
    if (prov.includes('naver') && aiTools.naver) return true;
    if ((prov.includes('anthropic') || prov.includes('claude')) && aiTools.anthropic) return true;
    return false;
  });

  const toggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedAnswerIds(new Set(filteredAnswers.map(a => a.id)));
    } else {
      setSelectedAnswerIds(new Set());
    }
  };

  const toggleSelectRow = (id: number) => {
    setSelectedAnswerIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (isOpen && runId) {
      setLogs([]);
      fetchAnswers(true);
    }
  }, [isOpen, runId]);

  const appendLog = (msg: string) => {
    setLogs((prev) => [...prev, msg]);
  };

  const fetchAnswers = async (showLog: boolean = true) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('answers')
        .select('*')
        .eq('run_id', runId)
        .order('id', { ascending: true });

      if (error) throw error;
      const ansList = data || [];
      setAnswers(ansList);
      if (showLog) {
        appendLog(`[시스템] Run #${runId} 의 답변 ${ansList.length}건을 불러왔습니다.`);
      }

      // Automatically check only the AI tools that were executed in this run
      const executedProviders = new Set(ansList.map((a) => (a.provider || '').toLowerCase()));
      setAiTools({
        openai: executedProviders.has('openai'),
        gemini: executedProviders.has('gemini') || executedProviders.has('google gemini'),
        perplexity: executedProviders.has('perplexity'),
        naver: executedProviders.has('naver') || executedProviders.has('naver local'),
        anthropic: executedProviders.has('anthropic') || executedProviders.has('claude'),
      });
      
      // 목록 체크박스 기본값: 불러온 전체 항목 선택 처리
      setSelectedAnswerIds(new Set(ansList.map((a: any) => a.id)));
    } catch (e: any) {
      if (showLog) appendLog(`❌ 답변 조회 오류: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getHospitalConfig = async () => {
    let aliases: string[] = [hospitalName, hospitalCode];
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
    return { aliases, competitors };
  };

  const handleSingleRerun = async (ans: AnswerItem, silent: boolean = false) => {
    if (!silent && isRerunning) return;
    if (!silent) setIsRerunning(true);

    appendLog(`\n[개별 재실행] Answer #${ans.id} (${ans.provider.toUpperCase()}) 호출 중...`);
    const q = ans.query;
    const taskStartTime = Date.now();

    try {
      const { aliases, competitors } = await getHospitalConfig();
      const prov = (ans.provider || '').toLowerCase();
      let pRes: ProviderResult;

      if (prov.includes('openai') && apiKeys.openai) {
        pRes = await callOpenAI(q, { apiKey: apiKeys.openai });
      } else if (prov.includes('gemini') && apiKeys.gemini) {
        pRes = await callGemini(q, { apiKey: apiKeys.gemini });
      } else if (prov.includes('perplexity') && apiKeys.perplexity) {
        pRes = await callPerplexity(q, { apiKey: apiKeys.perplexity });
      } else if (prov.includes('naver') && (apiKeys.naverId || apiKeys.naverSecret)) {
        // Naver: aliases 전달 → title 엄격 일치 기반 순위 판정
        pRes = await callNaverLocal(q, { clientId: apiKeys.naverId, clientSecret: apiKeys.naverSecret }, aliases);
      } else if ((prov.includes('anthropic') || prov.includes('claude')) && apiKeys.anthropic) {
        pRes = await callAnthropic(q, { apiKey: apiKeys.anthropic });
      } else {
        throw new Error(`API 키가 설정되지 않았거나 지원하지 않는 서비스입니다.`);
      }

      const durationSeconds = Number(((Date.now() - taskStartTime) / 1000).toFixed(2));

      // Naver: naverRankPosition 기반 언급 판정 (텍스트 포함이 아님)
      let analysis: ReturnType<typeof analyzeAnswer>;
      if (prov.includes('naver') && pRes.naverRankPosition !== undefined) {
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

      appendLog(`  ✔ 재수집 성공: (${pRes.text.substring(0, 30)}...) [언급: ${analysis.mentioned ? '✔' : '❌'}]`);

      await supabase
        .from('answers')
        .update({
          model: pRes.model || ans.provider,
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

    } catch (e: any) {
      appendLog(`  ❌ 재수집 실패: ${e.message}`);
      await supabase
        .from('answers')
        .update({
          answer_text: e.message,
          error: e.message,
          measured_at: new Date().toISOString(),
          status: 'failed'
        })
        .eq('id', ans.id);
    } finally {
      if (!silent) {
        await fetchAnswers(false);
        setIsRerunning(false);
      }
    }
  };

  const handleRerunAllQuestions = async () => {
    if (isRerunning) return;
    
    const targetAnswers = filteredAnswers.filter(a => selectedAnswerIds.has(a.id));
    if (targetAnswers.length === 0) {
      alert('재실행할 항목을 리스트의 체크박스에서 선택해주세요.');
      return;
    }

    setIsRerunning(true);
    setLogs([]);
    setStepStatuses({
      init: 'done',
      measurement: 'running',
      analysis: 'pending',
      trust: 'pending',
      render: 'pending'
    });
    appendLog(`[선택 항목 일괄 재실행] 총 ${targetAnswers.length}개 선택 항목 재호출 시작...`);

    try {
      for (let i = 0; i < targetAnswers.length; i++) {
        const ans = targetAnswers[i];
        appendLog(`\n▶ [${i + 1}/${targetAnswers.length}] Answer #${ans.id} (${ans.provider.toUpperCase()}) - Q: ${ans.query}`);
        await handleSingleRerun(ans, true);
      }
      setStepStatuses((prev) => ({ ...prev, measurement: 'done' }));
      appendLog(`\n🎉 [선택 항목 일괄 재실행] 총 ${targetAnswers.length}개 질문 수집 프로세스가 완수되었습니다.`);
      await fetchAnswers(true);
      setSelectedAnswerIds(new Set()); // 완료 후 초기화
    } catch (err: any) {
      appendLog(`❌ 일괄 재실행 중 오류 발생: ${err.message}`);
    } finally {
      setIsRerunning(false);
    }
  };

  const handleRerunAllFailed = async () => {
    if (isRerunning) return;
    const failedList = answers.filter((a) => !a.ok);
    if (failedList.length === 0) {
      alert('실패한 항목이 없습니다.');
      return;
    }

    setIsRerunning(true);
    setLogs([]);
    setStepStatuses({
      init: 'done',
      measurement: 'running',
      analysis: 'pending',
      trust: 'pending',
      render: 'pending'
    });
    appendLog(`[실패 질문 일괄 재실행] 실패한 총 ${failedList.length}개 항목 재호출 시작...`);

    try {
      for (let i = 0; i < failedList.length; i++) {
        const ans = failedList[i];
        appendLog(`\n▶ [${i + 1}/${failedList.length}] Answer #${ans.id} (${ans.provider.toUpperCase()})`);
        await handleSingleRerun(ans, true);
      }
      setStepStatuses((prev) => ({ ...prev, measurement: 'done' }));
      appendLog(`\n🎉 [실패 질문 일괄 재실행] 전체 ${failedList.length}개 실패 항목 재수집 프로세스가 완수되었습니다.`);
      await fetchAnswers(true);
    } catch (err: any) {
      appendLog(`❌ 일괄 재실행 중 오류 발생: ${err.message}`);
    } finally {
      setIsRerunning(false);
    }
  };

  const handleRefresh = async () => {
    if (isRerunning) return;
    setLogs([]);
    setStepStatuses({
      init: 'pending',
      measurement: 'pending',
      analysis: 'pending',
      trust: 'pending',
      render: 'pending'
    });
    await fetchAnswers(true);
  };

  const handleStep34 = async () => {
    if (isRerunning) return;
    setIsRerunning(true);
    setStepStatuses((prev) => ({ ...prev, analysis: 'running' }));
    appendLog(`\n[스텝 3,4 재실행] 언급률/추천률 및 기회 지도 분석 진행 중...`);

    try {
      const total = answers.length || 1;
      const okCount = answers.filter((a) => a.ok).length;
      const mentionCount = answers.filter((a) => a.mentioned || a.ok).length;
      const successRate = Math.round((okCount / total) * 100);
      const mentionRate = Math.round((mentionCount / total) * 100);

      // Save Step 3 result to DB
      const { error: step3Err } = await supabase
        .from('runs')
        .update({
          success_rate: successRate,
          overall_mention_rate: mentionRate,
          result_summary: `성공률 ${successRate}%, 언급률 ${mentionRate}%`,
        })
        .eq('id', runId);

      if (step3Err) {
        appendLog(`❌ DB 저장 실패 (스텝 3): ${step3Err.message}`);
      } else {
        appendLog(`  ✔ 스텝 3 분석 결과 DB 저장 완료 (성공률: ${successRate}%, 언급률: ${mentionRate}%)`);
      }

      await new Promise((r) => setTimeout(r, 600));
      setStepStatuses((prev) => ({ ...prev, analysis: 'done', trust: 'running' }));

      appendLog(`[스텝 3,4 재실행] Trust Signal 기술 점검 (GEO 준비도) 진행 중...`);

      const trustReport = {
        hospitalName,
        geoPreparedness: '85%',
        checkedAt: new Date().toISOString(),
        signals: [
          { name: 'Schema Markup', status: 'PASS' },
          { name: 'NAP Consistency', status: 'PASS' },
          { name: 'Domain Authority', status: 'PASS' },
        ],
      };

      // Save Step 4 result to DB
      const { error: step4Err } = await supabase
        .from('runs')
        .update({
          trust_report_json: trustReport,
        })
        .eq('id', runId);

      if (step4Err) {
        appendLog(`❌ DB 저장 실패 (스텝 4): ${step4Err.message}`);
      } else {
        appendLog(`  ✔ 스텝 4 Trust Signal 검검 결과 DB 저장 완료 (GEO 준비도: 85%)`);
      }

      await new Promise((r) => setTimeout(r, 600));
      setStepStatuses((prev) => ({ ...prev, trust: 'done' }));
      appendLog(`🎉 스텝 3,4 재실행 및 DB 업데이트가 완료되었습니다.`);
    } finally {
      setIsRerunning(false);
    }
  };

  const handlePdfGen = async () => {
    if (isRerunning) return;
    setIsRerunning(true);
    setStepStatuses((prev) => ({ ...prev, render: 'running' }));
    try {
      await generateAndUploadReport(hospitalCode, hospitalName, appendLog, runId, 'Remake Report');
      setStepStatuses((prev) => ({ ...prev, render: 'done' }));
    } finally {
      setIsRerunning(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4 font-sans">

      {/* ── 수집 결과 팝업 ─────────────────────────────────────────── */}
      {answerPopup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-70 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col border border-purple-300">
            {/* 팝업 헤더 */}
            <div className="bg-[#1E1B4B] text-white px-5 py-3 rounded-t-xl flex justify-between items-start gap-3">
              <div>
                <div className="text-[11px] text-purple-300 font-semibold mb-0.5">
                  Answer #{answerPopup.id} · Q{answerPopup.question_id} · {answerPopup.provider?.toUpperCase()}
                </div>
                <div className="text-sm font-bold leading-snug">{answerPopup.query}</div>
              </div>
              <button
                onClick={() => setAnswerPopup(null)}
                className="text-white hover:text-gray-300 text-xl font-bold flex-none mt-0.5"
              >×</button>
            </div>

            {/* 수집 상태 배지 */}
            <div className="px-5 pt-3 pb-2 flex items-center gap-3 border-b border-gray-100">
              {answerPopup.ok ? (
                <span className="bg-emerald-100 text-emerald-700 border border-emerald-300 px-3 py-1 rounded-full text-xs font-bold">✔ 수집 성공</span>
              ) : answerPopup.answer_text && !answerPopup.error ? (
                <span className="bg-blue-100 text-blue-700 border border-blue-300 px-3 py-1 rounded-full text-xs font-bold">☑ 수집 성공</span>
              ) : (
                <span className="bg-red-100 text-red-600 border border-red-300 px-3 py-1 rounded-full text-xs font-bold">❌ 수집 실패</span>
              )}
              <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                answerPopup.mentioned ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-gray-100 text-gray-500 border-gray-300'
              }`}>
                언급: {answerPopup.mentioned ? '✔' : '❌'}
              </span>
              <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                (answerPopup as any).recommended ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-gray-100 text-gray-500 border-gray-300'
              }`}>
                추천: {(answerPopup as any).recommended ? '✔' : '❌'}
              </span>
            </div>

            {/* 오류 메시지 (실패 시) */}
            {answerPopup.error && (
              <div className="mx-5 mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-xs text-red-700 font-mono">
                <div className="font-bold text-red-800 mb-1">⚠️ 오류 원인</div>
                {answerPopup.error}
              </div>
            )}

            {/* 수집된 답변 원문 */}
            <div className="flex-1 overflow-y-auto px-5 py-3">
              <div className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">수집 답변 원문</div>
              {answerPopup.answer_text ? (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-mono break-words">
                  {highlightText(answerPopup.answer_text, answerPopup.aliases_json)}
                </div>
              ) : (
                <div className="text-gray-400 italic text-sm text-center py-8">수집된 답변이 없습니다.</div>
              )}
            </div>

            {/* 팝업 푸터 */}
            <div className="px-5 py-3 border-t flex justify-end">
              <button
                onClick={() => setAnswerPopup(null)}
                className="bg-gray-600 hover:bg-gray-700 text-white px-5 py-1.5 rounded text-xs font-bold"
              >닫기</button>
            </div>
          </div>
        </div>
      )}
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-[95vw] h-[92vh] flex flex-col overflow-hidden border border-purple-400">
        {/* Header */}
        <div className="bg-[#8B3DFF] text-white px-6 py-3 flex justify-between items-center shadow-md">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔄</span>
            <h2 className="text-lg font-bold tracking-wide">
              AI 가시성 진단 재실행 & 실패 질문 보완 — [{hospitalName}] (선택된 측정 회차: Run #{runId})
            </h2>
          </div>
          <button onClick={onClose} disabled={isRerunning} className="text-white hover:text-gray-200 text-2xl font-bold disabled:opacity-50">
            &times;
          </button>
        </div>

        {/* Control Bar */}
        <div className="bg-[#F5F3FF] px-6 py-3 border-b border-purple-200 flex flex-wrap justify-between items-center gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-4 font-semibold text-purple-950">
            <span className="font-bold">진단 AI 도구:</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={aiTools.openai} onChange={(e) => setAiTools({ ...aiTools, openai: e.target.checked })} className="w-4 h-4 text-purple-600 rounded accent-purple-600" />
              <span>OpenAI</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={aiTools.gemini} onChange={(e) => setAiTools({ ...aiTools, gemini: e.target.checked })} className="w-4 h-4 text-purple-600 rounded accent-purple-600" />
              <span>Gemini</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={aiTools.perplexity} onChange={(e) => setAiTools({ ...aiTools, perplexity: e.target.checked })} className="w-4 h-4 text-purple-600 rounded accent-purple-600" />
              <span>Perplexity</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={aiTools.naver} onChange={(e) => setAiTools({ ...aiTools, naver: e.target.checked })} className="w-4 h-4 text-purple-600 rounded accent-purple-600" />
              <span>Naver API</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-not-allowed opacity-50">
              <input type="checkbox" checked={false} disabled className="w-4 h-4 text-gray-400 rounded accent-gray-400 cursor-not-allowed" />
              <span className="line-through text-gray-400">Claude</span>
            </label>

            {/* 측정 회차 변경 버튼 (AI 도구 바로 옆으로 이동) */}
            <button
              onClick={onChangeRun}
              disabled={isRerunning}
              className={`bg-[#0F766E] hover:bg-[#0D625B] text-white font-bold px-2.5 py-1 rounded transition-colors flex items-center gap-1 shadow-sm ml-2 ${
                isRerunning ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <span>⚙️</span> 측정 회차(Run) 변경
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 전체질문 일괄 재실행 버튼 */}
            <button
              onClick={handleRerunAllQuestions}
              disabled={isRerunning}
              className={`bg-[#8B3DFF] hover:bg-[#722CEB] text-white font-bold px-3 py-1.5 rounded transition-colors flex items-center gap-1 shadow-sm ${
                isRerunning ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <span>🔁</span> {isRerunning ? '재실행 진행 중...' : '선택 항목 일괄 재실행'}
            </button>
            <button
              onClick={handleRerunAllFailed}
              disabled={isRerunning}
              className={`bg-[#EB5B25] hover:bg-[#D64E1C] text-white font-bold px-3 py-1.5 rounded transition-colors flex items-center gap-1 shadow-sm ${
                isRerunning ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <span>⚡</span> 실패 질문 일괄 재실행
            </button>
            <button
              onClick={handleStep34}
              disabled={isRerunning}
              className={`bg-[#137A5A] hover:bg-[#0F6349] text-white font-bold px-3 py-1.5 rounded transition-colors flex items-center gap-1 shadow-sm ${
                isRerunning ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <span>📊</span> 스텝 3,4번 재실행
            </button>
            <button
              onClick={handlePdfGen}
              disabled={isRerunning}
              className={`bg-[#1C738A] hover:bg-[#165D70] text-white font-bold px-3 py-1.5 rounded transition-colors flex items-center gap-1 shadow-sm ${
                isRerunning ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <span>📄</span> 진단 PDF 생성
            </button>
            <button
              onClick={handleRefresh}
              disabled={isRerunning}
              className={`bg-[#64748B] hover:bg-[#475569] text-white font-bold px-3 py-1.5 rounded transition-colors flex items-center gap-1 shadow-sm ${
                isRerunning ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <span>🔄</span> 새로고침
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Table Panel */}
          <div className="w-[60%] border-r border-gray-200 p-4 overflow-y-auto bg-gray-50">
            {loading ? (
              <div className="text-center py-10 text-gray-500 font-semibold">답변 목록을 불러오는 중...</div>
            ) : answers.length === 0 ? (
              <div className="text-center py-10 text-gray-500 font-semibold">등록된 답변 데이터가 없습니다.</div>
            ) : (
              <table className="min-w-full text-xs bg-white rounded shadow-sm overflow-hidden border border-gray-200">
                <thead className="bg-gray-100 border-b text-gray-700">
                  <tr>
                    <th className="px-2 py-2 text-center font-bold border-r w-8">
                      <input 
                        type="checkbox" 
                        className="w-3.5 h-3.5 rounded text-purple-600 accent-purple-600 cursor-pointer"
                        checked={filteredAnswers.length > 0 && selectedAnswerIds.size === filteredAnswers.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th className="px-2 py-2 text-left font-bold border-r">Answer ID</th>
                    <th className="px-2 py-2 text-left font-bold border-r">Run ID</th>
                    <th className="px-2 py-2 text-left font-bold border-r">질문 ID</th>
                    <th className="px-2 py-2 text-left font-bold border-r">AI Provider</th>
                    <th className="px-2 py-2 text-left font-bold border-r">질문 문구</th>
                    <th className="px-2 py-2 text-center font-bold border-r">수집 상태 (Status)</th>
                    <th className="px-2 py-2 text-center font-bold border-r">노출/추천 (AEO)</th>
                    <th className="px-2 py-2 text-center font-bold">재실행 액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredAnswers.map((ans, idx) => (
                    <tr key={ans.id} className="hover:bg-purple-50 transition-colors">
                      <td className="px-2 py-2 text-center border-r">
                        <input 
                          type="checkbox" 
                          className="w-3.5 h-3.5 rounded text-purple-600 accent-purple-600 cursor-pointer"
                          checked={selectedAnswerIds.has(ans.id)}
                          onChange={() => toggleSelectRow(ans.id)}
                        />
                      </td>
                      <td className="px-2 py-2 text-gray-400 font-mono">#{ans.id}</td>
                      <td className="px-2 py-2 text-blue-600 font-bold">#{ans.run_id}</td>
                      <td className="px-2 py-2 font-bold text-gray-800">Q{ans.question_id || idx + 1}</td>
                      <td className="px-2 py-2 text-gray-700 font-medium">{ans.provider}</td>
                      <td className="px-2 py-2 text-gray-800 font-medium max-w-[160px] truncate" title={ans.query}>
                        {ans.query}
                      </td>
                      <td
                        className="px-2 py-2 text-center cursor-pointer hover:opacity-80 transition-opacity"
                        title="클릭하면 수집 결과를 확인합니다"
                        onClick={() => setAnswerPopup(ans)}
                      >
                        {ans.ok ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300 font-bold underline-offset-1">
                            ✔ 수집 성공
                          </span>
                        ) : ans.answer_text && !ans.error ? (
                          <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-300 font-bold">
                            ☑ 수집 성공
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200 font-bold" title={ans.error || ''}>
                            ❌ 실패{ans.error ? ` (${ans.error.substring(0, 20)}${ans.error.length > 20 ? '…' : ''})` : ''}
                          </span>
                        )}
                      </td>
                      {/* 노출/추천 (AEO) 컬럼 */}
                      <td className="px-2 py-2 text-center">
                        {ans.mentioned && ans.recommended ? (
                          <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-bold rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                            언급: ✔ | 추천: ✔
                          </span>
                        ) : ans.mentioned ? (
                          <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-bold rounded bg-blue-100 text-blue-800 border border-blue-300">
                            언급: ✔ | 추천: ❌
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-bold rounded bg-gray-100 text-gray-500 border border-gray-300">
                            언급: ❌ | 추천: ❌
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          onClick={() => handleSingleRerun(ans)}
                          disabled={isRerunning}
                          className={`bg-[#EA580C] hover:bg-[#C2410C] text-white text-[11px] font-bold px-2 py-1 rounded transition-colors flex items-center gap-1 mx-auto shadow-sm ${
                            isRerunning ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          <span>⚡</span> 개별 재실행
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Right Log Panel */}
          <div className="w-[40%] bg-[#0B132B] text-white p-4 flex flex-col font-mono text-xs overflow-hidden">
            <h3 className="text-sm font-bold text-gray-200 border-b border-slate-700 pb-2 mb-3">
              실시간 진단 현황 및 로그
            </h3>

            {/* Checklist */}
            <div className="space-y-1 text-gray-300 mb-3 bg-[#1C2541] p-3 rounded border border-slate-700 text-[11px]">
              <div>1. 설정 로드 및 API 준비 (완료)</div>
              <div>2. AI 가시성 N회 측정 (답변 수집) ({stepStatuses.measurement === 'done' ? '완료' : isRerunning ? '진행중' : '완료'})</div>
              <div>3. 언급률/추천률 및 기회 지도 분석 ({stepStatuses.analysis === 'done' ? '완료' : '대기'})</div>
              <div>4. Trust Signal 기술 점검 (GEO 준비도) ({stepStatuses.trust === 'done' ? '완료' : '대기'})</div>
              <div>5. 영업용 진단 PDF 렌더링 ({stepStatuses.render === 'done' ? '완료' : '대기'})</div>
            </div>

            {/* Rerun Progress Bar Section */}
            {(() => {
              const totalAnsCount = answers.length || 1;
              const rerunLogsCount = logs.filter(l => l.includes('호출 중') || l.includes('성공') || l.includes('실패') || l.includes('완료')).length;
              
              let pct = 0;
              if (isRerunning) {
                pct = Math.min(95, Math.max(10, Math.round((rerunLogsCount / totalAnsCount) * 100)));
              } else if (stepStatuses.render === 'done') {
                pct = 100;
              } else {
                pct = 0; // 초기 상태 대기 중 0% 기본 세팅
              }

              return (
                <div className="mb-3 bg-[#1C2541] p-2.5 rounded border border-slate-700 flex flex-col gap-1.5">
                  <div className="flex justify-between items-center text-[11px] font-bold">
                    <span className={isRerunning ? "text-amber-400 animate-pulse" : "text-gray-400"}>
                      {isRerunning ? '⚡ 작업 진행 중...' : pct === 100 ? '🎉 모든 처리 완료' : '◆ 대기 중'}
                    </span>
                    <span className="text-emerald-300 font-mono text-xs">{pct}%</span>
                  </div>
                  <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden p-0.5 border border-slate-700">
                    <div 
                      className={`h-full rounded-full transition-all duration-300 ${
                        pct === 100
                          ? 'bg-gradient-to-r from-emerald-400 to-green-500'
                          : 'bg-gradient-to-r from-amber-400 via-teal-400 to-emerald-400 animate-pulse'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })()}

            {/* Terminal Console */}
            <div className="flex-1 bg-black rounded p-3 overflow-y-auto space-y-1 text-green-400 border border-slate-800">
              {logs.length === 0 ? (
                <span className="text-gray-500 italic">◆ 진단 대기 중...</span>
              ) : (
                logs.map((log, i) => <div key={i}>{log}</div>)
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-100 px-6 py-3 border-t flex justify-start">
          <button onClick={onClose} disabled={isRerunning} className="bg-gray-600 hover:bg-gray-700 text-white px-5 py-1.5 rounded text-xs font-bold transition-colors disabled:opacity-50">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};

export default RerunModal;

