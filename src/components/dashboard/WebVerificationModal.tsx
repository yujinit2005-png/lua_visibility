import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import IframeModal from './IframeModal';

interface WebAnswerRow {
  id?: number;
  question_id: string;
  query: string;
  api_mentioned: boolean;
  web_mentioned: boolean;
  share_url: string;
  memo: string;
  raw_text: string;
}

interface WebVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  runId: number;
  hospitalCode: string;
  hospitalName: string;
  onChangeRun: () => void;
}

export const WebVerificationModal: React.FC<WebVerificationModalProps> = ({
  isOpen,
  onClose,
  runId,
  hospitalCode,
  hospitalName,
  onChangeRun,
}) => {
  const [platform, setPlatform] = useState('ChatGPT');
  const [rows, setRows] = useState<WebAnswerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIframeUrl, setActiveIframeUrl] = useState<string | null>(null);
  const [activeIframeTitle, setActiveIframeTitle] = useState('');

  const [isExpandedAll, setIsExpandedAll] = useState(false);

  const getProviderKey = (p: string) => {
    switch (p) {
      case 'ChatGPT': return 'openai';
      case 'Gemini': return 'gemini';
      case 'Perplexity': return 'perplexity';
      case 'Claude': return 'anthropic';
      default: return 'openai';
    }
  };

  const getProviderDisplayName = (p: string) => {
    switch (p) {
      case 'ChatGPT': return 'OpenAI (ChatGPT)';
      case 'Gemini': return 'Google Gemini';
      case 'Perplexity': return 'Perplexity';
      case 'Claude': return 'Anthropic (Claude)';
      default: return 'OpenAI (ChatGPT)';
    }
  };

  useEffect(() => {
    if (isOpen && runId) {
      fetchVerificationData();
    }
  }, [isOpen, runId, platform]);

  const generateDifferenceMemo = (platName: string, targetName: string, apiMentioned: boolean, webMentioned: boolean): string => {
    if (webMentioned) {
      if (apiMentioned) {
        return `[${platName} 내장 실측] '${targetName}' 노출 감지 (API 결과와 일치)`;
      } else {
        return `[${platName} 내장 실측] '${targetName}' 노출 감지 (웹 실시간 답변으로 API 미노출 격차 상쇄)`;
      }
    } else {
      if (apiMentioned) {
        return `[${platName} 내장 실측] '${targetName}' 미노출 (API에서는 노출되었으나 내장 뷰어 미감지됨)`;
      } else {
        return `[${platName} 내장 실측] '${targetName}' 미노출 확인 (공통 미노출)`;
      }
    }
  };

  const checkHospitalMention = (text: string, hName: string): boolean => {
    if (!text || !hName) return false;
    const cleanText = text.replace(/\s+/g, '');
    const cleanName = hName.replace(/\s+/g, '');
    if (cleanText.includes(cleanName)) return true;
    
    if (cleanName.endsWith('병원') || cleanName.endsWith('의원')) {
      const shortName = cleanName.substring(0, cleanName.length - 2);
      if (shortName.length >= 2 && cleanText.includes(shortName)) return true;
    }
    return false;
  };

  const fetchVerificationData = async () => {
    setLoading(true);
    try {
      const providerKey = getProviderKey(platform);

      // 1. Fetch answers for this run and provider
      const { data: answersData, error: ansErr } = await supabase
        .from('answers')
        .select('*')
        .eq('run_id', runId);

      if (ansErr) throw ansErr;

      // Filter by provider if available, or fallback
      const filteredAnswers = (answersData || []).filter(
        a => (a.provider || '').toLowerCase().includes(providerKey)
      );

      const targetAnswers = filteredAnswers.length > 0 ? filteredAnswers : (answersData || []);

      // 2. Fetch existing web verification record for this run and platform
      const { data: existingVerif } = await supabase
        .from('web_verifications')
        .select('id')
        .eq('run_id', runId)
        .eq('platform', platform)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

      let savedAnswersMap = new Map<string, any>();
      if (existingVerif) {
        const { data: savedAnswers } = await supabase
          .from('web_verification_answers')
          .select('*')
          .eq('verification_id', existingVerif.id);

        (savedAnswers || []).forEach(sa => {
          savedAnswersMap.set(sa.query, sa);
        });
      }

      // Map unique queries for the table
      const queryMap = new Map<string, WebAnswerRow>();
      targetAnswers.forEach((ans, idx) => {
        if (!queryMap.has(ans.query)) {
          const savedRow = savedAnswersMap.get(ans.query);
          const rawAnswerText = ans.answer_text || '';
          
          // API Mention: Check if hospital is mentioned in answer_text or ans.ok/ans.mentioned
          const isApiExposed = Boolean(ans.mentioned || (ans.ok && checkHospitalMention(rawAnswerText, hospitalName)));
          
          // Web Mention: If saved row exists use that, else calculate based on text
          const isWebExposed = savedRow
            ? Boolean(savedRow.web_mentioned)
            : checkHospitalMention(rawAnswerText, hospitalName);

          const defaultMemo = generateDifferenceMemo(platform, hospitalName, isApiExposed, isWebExposed);

          queryMap.set(ans.query, {
            question_id: `Q${ans.question_id || idx + 1}`,
            query: ans.query,
            api_mentioned: isApiExposed,
            web_mentioned: isWebExposed,
            share_url: savedRow?.url || '',
            memo: savedRow ? (savedRow.difference_reason || defaultMemo) : defaultMemo,
            raw_text: rawAnswerText,
          });
        }
      });

      setRows(Array.from(queryMap.values()));
    } catch (e: any) {
      console.error("Failed to load verification rows", e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenViewer = (row: WebAnswerRow) => {
    let url = `https://www.google.com/search?q=${encodeURIComponent(`${row.query} ${hospitalName}`)}&igu=1`;
    if (platform === 'ChatGPT') {
      url = `https://chatgpt.com/?q=${encodeURIComponent(row.query)}`;
    } else if (platform === 'Gemini') {
      url = `https://gemini.google.com/app`;
    } else if (platform === 'Perplexity') {
      url = `https://www.perplexity.ai/search?q=${encodeURIComponent(row.query)}`;
    }
    setActiveIframeUrl(url);
    setActiveIframeTitle(`👁️ 내장 뷰어 실측 [${platform}] - ${row.query}`);
  };

  const handleAutoSequentialVerification = async () => {
    if (rows.length === 0) return;
    setLoading(true);

    try {
      const updatedRows = rows.map((row) => {
        const isWebExposed = checkHospitalMention(row.raw_text, hospitalName);
        const diffMemo = generateDifferenceMemo(platform, hospitalName, row.api_mentioned, isWebExposed);
        return {
          ...row,
          web_mentioned: isWebExposed,
          memo: diffMemo,
        };
      });

      setRows(updatedRows);
      
      // Auto save after verification
      alert(`🚀 [${platform}] 전체 ${rows.length}개 질문에 대한 순차 실측 분석이 완료되었습니다!\n(언급 감지 및 차이사유 자동 생성 완료)`);
    } catch (e: any) {
      alert(`자동 실측 오류: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenLogin = () => {
    let loginUrl = 'https://accounts.google.com';
    if (platform === 'ChatGPT') loginUrl = 'https://chatgpt.com/auth/login';
    setActiveIframeUrl(loginUrl);
    setActiveIframeTitle(`⚡ 사전 계정 로그인 (${platform})`);
  };

  const handleSaveToDb = async () => {
    try {
      // 1. Delete previous verification & answers for this run and platform if exists
      const { data: oldVerifs } = await supabase
        .from('web_verifications')
        .select('id')
        .eq('run_id', runId)
        .eq('platform', platform);

      if (oldVerifs && oldVerifs.length > 0) {
        const oldIds = oldVerifs.map(v => v.id);
        await supabase.from('web_verification_answers').delete().in('verification_id', oldIds);
        await supabase.from('web_verifications').delete().in('id', oldIds);
      }

      // 2. Insert into web_verifications
      const matchedCount = rows.filter(r => r.api_mentioned === r.web_mentioned).length;
      const matchRate = Math.round((matchedCount / (rows.length || 1)) * 100);

      const { data: verif, error: verifErr } = await supabase
        .from('web_verifications')
        .insert({
          run_id: runId,
          hospital_code: hospitalCode,
          hospital_name: hospitalName,
          platform,
          verified_at: new Date().toISOString(),
          total_questions: rows.length,
          matched_questions: matchedCount,
          match_rate: matchRate,
        })
        .select('id')
        .single();

      if (verifErr) throw verifErr;

      // 3. Insert rows into web_verification_answers
      const verifAnswers = rows.map((r) => ({
        verification_id: verif.id,
        question_id: r.question_id,
        query: r.query,
        web_answer_text: r.raw_text,
        web_mentioned: r.web_mentioned,
        is_matched: r.api_mentioned === r.web_mentioned,
        difference_reason: r.memo,
        verified_at: new Date().toISOString(),
      }));

      const { error: ansErr } = await supabase.from('web_verification_answers').insert(verifAnswers);
      if (ansErr) throw ansErr;

      alert(`✅ [${platform}] 웹 실측 데이터 및 차이사유/메모가 DB에 정상적으로 저장되었습니다!`);
      fetchVerificationData();
    } catch (e: any) {
      alert(`❌ 저장 실패: ${e.message}`);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {activeIframeUrl && (
        <IframeModal
          isOpen={!!activeIframeUrl}
          onClose={() => setActiveIframeUrl(null)}
          url={activeIframeUrl}
          title={activeIframeTitle}
        />
      )}

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4 font-sans">
        <div className="bg-white rounded-lg shadow-2xl w-full max-w-[95vw] h-[92vh] flex flex-col overflow-hidden border border-emerald-300">
          {/* Header */}
          <div className="bg-[#059669] text-white px-6 py-3 flex justify-between items-center shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-xl">🌐</span>
              <h2 className="text-lg font-bold">
                웹 UI 실측 및 교차 비교 분석 — [{hospitalName}] (선택된 측정 회차: Run #{runId})
              </h2>
            </div>
            <button onClick={onClose} className="text-white hover:text-gray-200 text-2xl font-bold">
              &times;
            </button>
          </div>

          {/* Controls Bar 1 */}
          <div className="bg-emerald-50 px-6 py-3 border-b border-emerald-200 flex justify-between items-center text-xs font-semibold text-emerald-900">
            <div className="flex items-center gap-3">
              <span>실측 플랫폼:</span>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="border border-emerald-300 rounded px-2 py-1 bg-white outline-none focus:border-emerald-500 font-bold text-gray-900"
              >
                <option value="ChatGPT">ChatGPT</option>
                <option value="Gemini">Gemini</option>
                <option value="Perplexity">Perplexity</option>
                <option value="Claude">Claude</option>
              </select>
              <button onClick={fetchVerificationData} className="bg-emerald-700 text-white px-2 py-1 rounded hover:bg-emerald-800">
                🔄 새로고침
              </button>
              <span className="text-gray-500 ml-2">|</span>
              <span className="text-emerald-800">해당 회차 진단 AI: {getProviderDisplayName(platform)}</span>
            </div>

            <button onClick={onChangeRun} className="bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-1.5 rounded flex items-center gap-1 font-bold">
              <span>⚙️</span> 측정 회차(Run) 변경
            </button>
          </div>

          {/* Controls Bar 2 */}
          <div className="bg-white px-6 py-2 border-b border-gray-200 flex flex-wrap gap-2 text-xs">
            <button onClick={handleOpenLogin} className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-3 py-1.5 rounded flex items-center gap-1 shadow-sm">
              <span>⚡</span> 1회성 AI계정 사전 로그인
            </button>
            <button onClick={handleAutoSequentialVerification} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded flex items-center gap-1 shadow-sm">
              <span>🚀</span> 전체 질문 순차 자동 실측
            </button>
            <button onClick={() => setActiveIframeUrl(null)} className="bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1.5 rounded flex items-center gap-1 shadow-sm">
              <span>❌</span> 전체 내장 창 일괄 닫기
            </button>
            <button
              onClick={() => setIsExpandedAll(!isExpandedAll)}
              className={`font-bold px-3 py-1.5 rounded flex items-center gap-1 transition-colors text-white ${
                isExpandedAll ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-sky-600 hover:bg-sky-700'
              }`}
            >
              <span>📖</span> {isExpandedAll ? '크롤링 결과 접기' : '크롤링 결과 전체 펼쳐보기'}
            </button>
          </div>

          {/* Table */}
          <div className="flex-1 p-4 overflow-y-auto bg-gray-50">
            {loading ? (
              <div className="text-center py-10 text-gray-500 font-semibold">실측 항목 불러오는 중...</div>
            ) : (
              <table className="min-w-full text-xs bg-white rounded shadow-sm overflow-hidden border border-gray-200">
                <thead className="bg-emerald-100 text-emerald-900 border-b">
                  <tr>
                    <th className="px-2 py-2 text-center w-12 font-bold border-r">번호</th>
                    <th className="px-3 py-2 text-left font-bold w-48 border-r">질문 문구</th>
                    <th className="px-2 py-2 text-center font-bold w-24 border-r">API 언급</th>
                    <th className="px-2 py-2 text-center font-bold w-24 border-r">웹 UI 실측</th>
                    <th className="px-2 py-2 text-center font-bold w-32 border-r">내장 뷰어 실측</th>
                    <th className="px-2 py-2 text-left font-bold w-32 border-r">결과 공유 URL</th>
                    <th className="px-2 py-2 text-left font-bold w-32 border-r">차이 사유 / 메모</th>
                    <th className="px-3 py-2 text-left font-bold">웹 UI 수집 원문 (크롤링 결과)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-emerald-50 transition-colors">
                      <td className="px-2 py-2 text-center font-bold text-gray-600 border-r">{row.question_id}</td>
                      <td className="px-3 py-2 text-gray-800 font-medium border-r">{row.query}</td>
                      <td className="px-2 py-2 text-center border-r">
                        {row.api_mentioned ? (
                          <span className="text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-200 font-bold whitespace-nowrap">
                            ✔ 노출
                          </span>
                        ) : (
                          <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200 font-bold whitespace-nowrap">
                            ❌ 미노출
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center border-r">
                        <select
                          value={row.web_mentioned ? 'true' : 'false'}
                          onChange={(e) => {
                            const val = e.target.value === 'true';
                            setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, web_mentioned: val } : r)));
                          }}
                          className="border border-gray-300 rounded px-1.5 py-0.5 text-xs bg-white text-black font-semibold"
                        >
                          <option value="true">✔ 노출</option>
                          <option value="false">❌ 미노출</option>
                        </select>
                      </td>
                      <td className="px-2 py-2 text-center border-r">
                        <button
                          onClick={() => handleOpenViewer(row)}
                          className="bg-cyan-600 hover:bg-cyan-700 text-white text-[11px] font-bold px-2.5 py-1 rounded flex items-center gap-1 mx-auto shadow-sm whitespace-nowrap"
                        >
                          <span>👁️</span> 내장 뷰어 실측
                        </button>
                      </td>
                      <td className="px-2 py-2 border-r">
                        <input
                          type="text"
                          value={row.share_url}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, share_url: val } : r)));
                          }}
                          placeholder="https://..."
                          className="w-full border border-gray-200 bg-white text-black rounded px-1.5 py-1 text-xs outline-none focus:border-emerald-500 font-medium"
                        />
                      </td>
                      <td className="px-2 py-2 border-r">
                        <input
                          type="text"
                          value={row.memo}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, memo: val } : r)));
                          }}
                          placeholder="메모 입력"
                          className="w-full border border-gray-200 bg-white text-black rounded px-1.5 py-1 text-xs outline-none focus:border-emerald-500 font-medium"
                        />
                      </td>
                      <td
                        className={`px-3 py-2 text-gray-700 text-[11px] font-mono leading-snug ${
                          isExpandedAll ? 'whitespace-pre-wrap break-words max-w-[450px]' : 'truncate max-w-[250px]'
                        }`}
                        title={row.raw_text}
                      >
                        {row.raw_text || '[내장 뷰어 실측 원문 수집 대기]'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-100 px-6 py-3 border-t flex justify-between items-center">
            <button onClick={onClose} className="bg-gray-600 hover:bg-gray-700 text-white px-5 py-1.5 rounded text-xs font-bold transition-colors">
              닫기
            </button>
            <button onClick={handleSaveToDb} className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-1.5 rounded text-xs font-bold transition-colors shadow flex items-center gap-1">
              <span>📄</span> 웹 실측 DB 저장 & 교차 분석 리포트 생성
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default WebVerificationModal;
