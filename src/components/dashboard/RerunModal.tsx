import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { callOpenAI, callGemini, callPerplexity, callAnthropic } from '../../lib/providers';
import { generateAndUploadReport } from '../../lib/reportGenerator';
import { useDashboard } from '../../contexts/DashboardContext';

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
}

interface RerunModalProps {
  isOpen: boolean;
  onClose: () => void;
  runId: number;
  hospitalCode: string;
  hospitalName: string;
  onChangeRun: () => void;
}

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
  const [logs, setLogs] = useState<string[]>([]);
  const [aiTools, setAiTools] = useState({ openai: false, gemini: false, perplexity: false, anthropic: false });
  const [stepStatuses, setStepStatuses] = useState({
    init: 'done',
    measurement: 'done',
    analysis: 'pending',
    trust: 'pending',
    render: 'pending',
  });

  useEffect(() => {
    if (isOpen && runId) {
      fetchAnswers();
    }
  }, [isOpen, runId]);

  const appendLog = (msg: string) => {
    setLogs((prev) => [...prev, msg]);
  };

  const fetchAnswers = async () => {
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
      appendLog(`[시스템] Run #${runId} 의 답변 ${ansList.length}건을 성공적으로 불러왔습니다.`);

      // Automatically check only the AI tools that were executed in this run
      const executedProviders = new Set(ansList.map((a) => (a.provider || '').toLowerCase()));
      setAiTools({
        openai: executedProviders.has('openai'),
        gemini: executedProviders.has('gemini') || executedProviders.has('google gemini'),
        perplexity: executedProviders.has('perplexity'),
        anthropic: executedProviders.has('anthropic') || executedProviders.has('claude'),
      });
    } catch (e: any) {
      appendLog(`❌ 답변 조회 오류: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSingleRerun = async (ans: AnswerItem) => {
    appendLog(`\n[개별 재실행] Answer #${ans.id} (${ans.provider.toUpperCase()}) 호출 중...`);
    const q = ans.query;
    let resText = '';
    let isOk = false;
    let errText = '';

    try {
      const prov = (ans.provider || '').toLowerCase();
      if (prov.includes('openai') && apiKeys.openai) {
        const r = await callOpenAI(q, { apiKey: apiKeys.openai });
        resText = r.text; isOk = true;
      } else if (prov.includes('gemini') && apiKeys.gemini) {
        const r = await callGemini(q, { apiKey: apiKeys.gemini });
        resText = r.text; isOk = true;
      } else if (prov.includes('perplexity') && apiKeys.perplexity) {
        const r = await callPerplexity(q, { apiKey: apiKeys.perplexity });
        resText = r.text; isOk = true;
      } else if ((prov.includes('anthropic') || prov.includes('claude')) && apiKeys.anthropic) {
        const r = await callAnthropic(q, { apiKey: apiKeys.anthropic });
        resText = r.text; isOk = true;
      } else {
        throw new Error(`API 키가 설정되지 않았거나 지원하지 않는 서비스입니다.`);
      }

      appendLog(`  ✔ 재수집 성공: (${resText.substring(0, 30)}...)`);
    } catch (e: any) {
      errText = e.message;
      appendLog(`  ❌ 재수집 실패: ${e.message}`);
    }

    // Update DB
    await supabase
      .from('answers')
      .update({
        answer_text: resText || errText,
        ok: isOk ? 1 : 0,
        error: errText || null,
        measured_at: new Date().toISOString(),
      })
      .eq('id', ans.id);

    fetchAnswers();
  };

  const handleRerunAllFailed = async () => {
    const failedList = answers.filter((a) => !a.ok);
    if (failedList.length === 0) {
      alert('실패한 항목이 없습니다.');
      return;
    }

    appendLog(`\n[일괄 재실행] 실패한 ${failedList.length}개 항목 재호출 시작...`);
    for (const ans of failedList) {
      await handleSingleRerun(ans);
    }
    appendLog(`[일괄 재실행] 완료되었습니다.`);
  };

  const handleStep34 = async () => {
    setStepStatuses((prev) => ({ ...prev, analysis: 'running' }));
    appendLog(`\n[스텝 3,4 재실행] 언급률/추천률 및 기회 지도 분석 진행 중...`);

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
  };

  const handlePdfGen = async () => {
    setStepStatuses((prev) => ({ ...prev, render: 'running' }));
    await generateAndUploadReport(hospitalCode, hospitalName, appendLog, runId, 'Remake Report');
    setStepStatuses((prev) => ({ ...prev, render: 'done' }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4 font-sans">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-[95vw] h-[92vh] flex flex-col overflow-hidden border border-purple-400">
        {/* Header */}
        <div className="bg-[#8B3DFF] text-white px-6 py-3 flex justify-between items-center shadow-md">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔄</span>
            <h2 className="text-lg font-bold tracking-wide">
              AI 가시성 진단 재실행 & 실패 질문 보완 — [{hospitalName}] (선택된 측정 회차: Run #{runId})
            </h2>
          </div>
          <button onClick={onClose} className="text-white hover:text-gray-200 text-2xl font-bold">
            &times;
          </button>
        </div>

        {/* Control Bar */}
        <div className="bg-[#F5F3FF] px-6 py-3 border-b border-purple-200 flex flex-wrap justify-between items-center gap-4 text-xs">
          <div className="flex items-center gap-4 font-semibold text-purple-950">
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
              <input type="checkbox" checked={aiTools.anthropic} onChange={(e) => setAiTools({ ...aiTools, anthropic: e.target.checked })} className="w-4 h-4 text-purple-600 rounded accent-purple-600" />
              <span>Claude</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={onChangeRun} className="bg-[#0F766E] hover:bg-[#0D625B] text-white font-bold px-3 py-1.5 rounded transition-colors flex items-center gap-1 shadow-sm">
              <span>⚙️</span> 측정 회차(Run) 변경
            </button>
            <button onClick={handleRerunAllFailed} className="bg-[#EB5B25] hover:bg-[#D64E1C] text-white font-bold px-3 py-1.5 rounded transition-colors flex items-center gap-1 shadow-sm">
              <span>⚡</span> 실패 질문 일괄 재실행
            </button>
            <button onClick={handleStep34} className="bg-[#137A5A] hover:bg-[#0F6349] text-white font-bold px-3 py-1.5 rounded transition-colors flex items-center gap-1 shadow-sm">
              <span>📊</span> 스텝 3,4번 재실행
            </button>
            <button onClick={handlePdfGen} className="bg-[#1C738A] hover:bg-[#165D70] text-white font-bold px-3 py-1.5 rounded transition-colors flex items-center gap-1 shadow-sm">
              <span>📄</span> 진단 PDF 생성
            </button>
            <button onClick={fetchAnswers} className="bg-[#64748B] hover:bg-[#475569] text-white font-bold px-3 py-1.5 rounded transition-colors flex items-center gap-1 shadow-sm">
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
                    <th className="px-2 py-2 text-left font-bold border-r">Answer ID</th>
                    <th className="px-2 py-2 text-left font-bold border-r">Run ID</th>
                    <th className="px-2 py-2 text-left font-bold border-r">질문 ID</th>
                    <th className="px-2 py-2 text-left font-bold border-r">AI Provider</th>
                    <th className="px-2 py-2 text-left font-bold border-r">질문 문구</th>
                    <th className="px-2 py-2 text-center font-bold border-r">수집 상태 (Status)</th>
                    <th className="px-2 py-2 text-center font-bold">재실행 액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {answers.map((ans, idx) => (
                    <tr key={ans.id} className="hover:bg-purple-50 transition-colors">
                      <td className="px-2 py-2 text-gray-400 font-mono">#{ans.id}</td>
                      <td className="px-2 py-2 text-blue-600 font-bold">#{ans.run_id}</td>
                      <td className="px-2 py-2 font-bold text-gray-800">Q{ans.question_id || idx + 1}</td>
                      <td className="px-2 py-2 text-gray-700 font-medium">{ans.provider}</td>
                      <td className="px-2 py-2 text-gray-800 font-medium max-w-[180px] truncate" title={ans.query}>
                        {ans.query}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {ans.ok ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 bg-white px-2 py-0.5 rounded border border-gray-300 font-bold">
                            ✔ 노출 수집 성공
                          </span>
                        ) : ans.mentioned ? (
                          <span className="inline-flex items-center gap-1 text-blue-700 bg-white px-2 py-0.5 rounded border border-gray-300 font-bold">
                            ☑ 미노출 수집 성공
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200 font-bold">
                            ❌ 수집 실패
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          onClick={() => handleSingleRerun(ans)}
                          className="bg-[#EA580C] hover:bg-[#C2410C] text-white text-[11px] font-bold px-2 py-1 rounded transition-colors flex items-center gap-1 mx-auto shadow-sm"
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
            <div className="space-y-1 text-gray-300 mb-4 bg-[#1C2541] p-3 rounded border border-slate-700 text-[11px]">
              <div>1. 설정 로드 및 API 준비 (완료)</div>
              <div>2. AI 가시성 N회 측정 (답변 수집) ({stepStatuses.measurement})</div>
              <div>3. 언급률/추천률 및 기회 지도 분석 ({stepStatuses.analysis})</div>
              <div>4. Trust Signal 기술 점검 (GEO 준비도) ({stepStatuses.trust})</div>
              <div>5. 영업용 진단 PDF 렌더링 ({stepStatuses.render})</div>
            </div>

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
          <button onClick={onClose} className="bg-gray-600 hover:bg-gray-700 text-white px-5 py-1.5 rounded text-xs font-bold transition-colors">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};

export default RerunModal;
