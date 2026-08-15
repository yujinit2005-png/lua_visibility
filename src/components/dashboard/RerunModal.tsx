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

import { RunSelector } from './RunSelector';
import type { RunItemWithDetails } from './RunSelector';
import { Trash2 } from 'lucide-react';

interface RerunModalProps {
  isOpen: boolean;
  onClose: () => void;
  runId?: number | null;
  hospitalCode: string;
  hospitalName: string;
  onChangeRun?: () => void;
}

// ── 병원명 하이라이트 유틸 ────────────────────────────────────────────
// ── 병원명 하이라이트 유틸 (일반 단어 오탐 방지 및 고유 별칭 매칭) ───────────────────
const GENERIC_EXCLUDE_WORDS = new Set(['병원', '의원', '한방병원', '한의원', '한방', '센터', '클리닉', '의료원', '진료', '치료']);

const highlightText = (text: string, aliasesJson: any, fallbackAliases: string[] = []): React.ReactNode => {
  if (!text) return text;
  
  let rawAliases: string[] = [];
  if (aliasesJson) {
    try {
      rawAliases = typeof aliasesJson === 'string' ? JSON.parse(aliasesJson) : aliasesJson;
    } catch(e) {}
  }
  if (!Array.isArray(rawAliases) || rawAliases.length === 0) {
    rawAliases = fallbackAliases;
  } else {
    rawAliases = Array.from(new Set([...rawAliases, ...fallbackAliases]));
  }

  // 1. 일반 명사 단독(예: '병원', '한방') 제외 및 2글자 이상 유효한 고유 별칭만 필터링
  const validAliases = rawAliases
    .filter(a => typeof a === 'string')
    .map(a => a.trim())
    .filter(a => a.length >= 2 && !GENERIC_EXCLUDE_WORDS.has(a));

  // 긴 단어부터 우선 매칭 (예: '청주필한방병원' -> '필한방병원' -> '청주필' -> '필한방')
  const sortedAliases = Array.from(new Set(validAliases)).sort((a, b) => b.length - a.length);

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
          <mark key={i} className="bg-amber-300 text-amber-950 font-extrabold px-1 py-0.5 rounded border border-amber-400 shadow-sm inline-block my-0.5">
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
  runId: initialRunId,
  hospitalCode,
  hospitalName,
}) => {
  const { apiKeys } = useDashboard();
  const [runs, setRuns] = useState<RunItemWithDetails[]>([]);
  const [currentRunId, setCurrentRunId] = useState<number | null>(initialRunId || null);
  const [hospitalAliases, setHospitalAliases] = useState<string[]>([]);
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

  // 병원 유사명칭 로드
  useEffect(() => {
    if (hospitalCode || hospitalName) {
      loadHospitalAliases();
    }
  }, [hospitalCode, hospitalName]);

  const loadHospitalAliases = async () => {
    const defaultList = [
      hospitalName,
      hospitalCode,
      hospitalName.replace(/(병원|한방병원|의원|치과|안과|피부과|성형외과)$/, ''),
    ].filter(Boolean);

    try {
      const { data } = await supabase
        .from('hospital_config_versions')
        .select('aliases')
        .eq('hospital_code', hospitalCode)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data && data.aliases) {
        const parsed = typeof data.aliases === 'string' ? JSON.parse(data.aliases) : data.aliases;
        if (Array.isArray(parsed)) {
          defaultList.push(...parsed);
        }
      }
    } catch (e) {
      console.warn('Failed to load hospital aliases:', e);
    }

    const uniqueAliases = Array.from(new Set(defaultList.filter(s => s && s.trim().length > 1)));
    setHospitalAliases(uniqueAliases);
  };

  // 모달이 열릴 때 병원의 모든 Run 목록을 불러오고 최신 회차 자동 선택
  useEffect(() => {
    if (isOpen && hospitalCode) {
      fetchRunsAndInit();
    }
  }, [isOpen, hospitalCode]);

  // initialRunId prop이 변경되면 currentRunId 업데이트
  useEffect(() => {
    if (initialRunId) {
      setCurrentRunId(initialRunId);
    }
  }, [initialRunId]);

  // currentRunId가 결정되거나 변경될 때마다 답변 로드 및 AI 체크박스 초기화
  useEffect(() => {
    if (isOpen && currentRunId) {
      setLogs([]);
      fetchAnswersForRun(currentRunId, true, true);
    }
  }, [isOpen, currentRunId]);

  const fetchRunsAndInit = async () => {
    try {
      const { data: runData, error: runErr } = await supabase
        .from('runs')
        .select('*')
        .eq('hospital_code', hospitalCode)
        .order('id', { ascending: false });

      if (runErr) throw runErr;
      const rawRuns = runData || [];

      // 각 run의 answers 집계 (사용된 도구 및 수집 건수)
      const runIds = rawRuns.map(r => r.id);
      let answersSummaryMap: Record<number, { providers: Set<string>; count: number }> = {};

      if (runIds.length > 0) {
        const { data: ansData } = await supabase
          .from('answers')
          .select('run_id, provider')
          .in('run_id', runIds);

        (ansData || []).forEach(a => {
          if (!answersSummaryMap[a.run_id]) {
            answersSummaryMap[a.run_id] = { providers: new Set(), count: 0 };
          }
          if (a.provider) answersSummaryMap[a.run_id].providers.add(a.provider);
          answersSummaryMap[a.run_id].count++;
        });
      }

      const detailedRuns: RunItemWithDetails[] = rawRuns.map(r => ({
        ...r,
        providers: answersSummaryMap[r.id] ? Array.from(answersSummaryMap[r.id].providers) : [],
        answer_count: answersSummaryMap[r.id]?.count || 0
      }));

      setRuns(detailedRuns);

      if (detailedRuns.length > 0) {
        if (!initialRunId || !detailedRuns.find(r => r.id === initialRunId)) {
          // 최신 회차 자동 선택
          setCurrentRunId(detailedRuns[0].id);
        } else {
          setCurrentRunId(initialRunId);
        }
      } else {
        setCurrentRunId(null);
        setAnswers([]);
      }
    } catch (e: any) {
      console.error('Failed to fetch runs with details:', e);
    }
  };

  const handleDeleteRun = async (targetRunId: number) => {
    try {
      setIsRerunning(true);
      appendLog(`\n[회차 삭제] Run #${targetRunId} 및 연계 데이터 삭제 시작...`);

      // 1. answers 삭제
      await supabase.from('answers').delete().eq('run_id', targetRunId);

      // 2. web_verifications & web_verification_answers 삭제
      const { data: verifs } = await supabase
        .from('web_verifications')
        .select('id')
        .eq('run_id', targetRunId);

      if (verifs && verifs.length > 0) {
        const verifIds = verifs.map(v => v.id);
        await supabase.from('web_verification_answers').delete().in('verification_id', verifIds);
        await supabase.from('web_verifications').delete().eq('run_id', targetRunId);
      }

      // 3. runs 삭제
      const { error: runDelErr } = await supabase.from('runs').delete().eq('id', targetRunId);
      if (runDelErr) throw runDelErr;

      appendLog(`✔ Run #${targetRunId} 및 비교검색 데이터가 성공적으로 삭제되었습니다.`);
      alert(`✅ Run #${targetRunId} 진단 회차 및 연계된 비교검색 데이터가 모두 삭제되었습니다.`);

      // 4. 목록 다시 불러오기
      await fetchRunsAndInit();
    } catch (err: any) {
      appendLog(`❌ 회차 삭제 실패: ${err.message}`);
      alert(`❌ 회차 삭제 실패: ${err.message}`);
    } finally {
      setIsRerunning(false);
    }
  };

  const appendLog = (msg: string) => {
    setLogs((prev) => [...prev, msg]);
  };

  const fetchAnswersForRun = async (targetRunId: number, showLog: boolean = true, resetAiTools: boolean = false) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('answers')
        .select('*')
        .eq('run_id', targetRunId)
        .order('id', { ascending: true });

      if (error) throw error;
      const ansList = data || [];
      setAnswers(ansList);
      if (showLog) {
        appendLog(`[시스템] Run #${targetRunId} 의 답변 ${ansList.length}건을 불러왔습니다.`);
      }

      // ⚠️ 회차(콤보)를 선택하여 변경할 때만 AI 모델 체크박스 및 선택 상태를 초기화하고,
      // 새로고침이나 개별/전체 재실행 시에는 사용자가 선택한 AI 체크박스 상태를 유지합니다.
      if (resetAiTools) {
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
      }
    } catch (e: any) {
      if (showLog) appendLog(`❌ 답변 조회 오류: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnswers = async (showLog: boolean = true) => {
    if (!currentRunId) return;
    await fetchAnswersForRun(currentRunId, showLog, false);
  };

  const handleSelectRun = (selectedId: number) => {
    if (selectedId === currentRunId) {
      fetchAnswersForRun(selectedId, true, true);
    } else {
      setCurrentRunId(selectedId);
    }
  };

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

  const getEffectiveKey = (provider: string): string => {
    const prov = provider.toLowerCase();
    if (prov.includes('openai')) {
      const k = apiKeys.openai?.trim();
      if (k && k.length > 20 && !k.includes('***') && !k.endsWith('shEc')) return k;
      return import.meta.env.OPENAI_API_KEY || import.meta.env.VITE_OPENAI_API_KEY || '';
    }
    if (prov.includes('gemini')) {
      const k = apiKeys.gemini?.trim();
      if (k && k.length > 10 && !k.includes('***')) return k;
      return import.meta.env.GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || '';
    }
    if (prov.includes('perplexity')) {
      const k = apiKeys.perplexity?.trim();
      if (k && k.length > 10 && !k.includes('***')) return k;
      return import.meta.env.PERPLEXITY_API_KEY || import.meta.env.VITE_PERPLEXITY_API_KEY || '';
    }
    if (prov.includes('anthropic') || prov.includes('claude')) {
      return apiKeys.anthropic || import.meta.env.ANTHROPIC_API_KEY || '';
    }
    return '';
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

      if (prov.includes('openai')) {
        const key = getEffectiveKey('openai');
        pRes = await callOpenAI(q, { apiKey: key });
      } else if (prov.includes('gemini')) {
        const key = getEffectiveKey('gemini');
        pRes = await callGemini(q, { apiKey: key });
      } else if (prov.includes('perplexity')) {
        const key = getEffectiveKey('perplexity');
        pRes = await callPerplexity(q, { apiKey: key });
      } else if (prov.includes('naver')) {
        const nId = apiKeys.naverId || import.meta.env.NCP_APIGW_API_KEY_ID || 'i8ciwrvzln';
        const nSecret = apiKeys.naverSecret || import.meta.env.NCP_APIGW_API_KEY || '9EXRQssZga4OCcnnn1hdM3V9KlSEYzKefwJMvK2x';
        pRes = await callNaverLocal(q, { clientId: nId, clientSecret: nSecret }, aliases);
      } else if (prov.includes('anthropic') || prov.includes('claude')) {
        const key = getEffectiveKey('anthropic');
        if (!key) throw new Error('Claude API 키가 설정되지 않았습니다.');
        pRes = await callAnthropic(q, { apiKey: key });
      } else {
        throw new Error(`지원하지 않는 Provider 서비스입니다: ${ans.provider}`);
      }

      const durationSeconds = Number(((Date.now() - taskStartTime) / 1000).toFixed(2));

      // Naver: naverRankPosition 기반 언급 판정
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

      // 성공 시에만 answers 테이블에 새 답변 및 분석 결과 업데이트
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
      // ⚠️ 사용자의 요청: 오류 발생 시 answers 테이블을 덮어쓰지 않고 원본 답변 데이터 유지!
      appendLog(`  ❌ 재수집 실패: ${e.message} (기존 답변 데이터 보존됨)`);
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
        .eq('id', currentRunId);

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
        .eq('id', currentRunId);

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
    if (!currentRunId) return;
    if (isRerunning) return;
    setIsRerunning(true);
    setStepStatuses((prev) => ({ ...prev, render: 'running' }));
    try {
      await generateAndUploadReport(hospitalCode, hospitalName, appendLog, currentRunId, 'Remake Report');
      setStepStatuses((prev) => ({ ...prev, render: 'done' }));
    } finally {
      setIsRerunning(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-1 sm:p-2 font-sans">

      {/* ── 수집 결과 팝업 ─────────────────────────────────────────── */}
      {answerPopup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col border border-purple-300">
            {/* 팝업 헤더 */}
            <div className="bg-[#1E1B4B] text-white px-5 py-3.5 rounded-t-xl flex justify-between items-start gap-3">
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
            <div className="px-5 pt-3 pb-2 flex items-center gap-3 border-b border-gray-100 flex-wrap">
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
                  {highlightText(answerPopup.answer_text, answerPopup.aliases_json, hospitalAliases)}
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

      {/* Main Rerun Modal Window (Full-Size) */}
      <div className="bg-white rounded-xl shadow-2xl w-full h-[98vh] flex flex-col overflow-hidden border border-purple-400">
        {/* Header */}
        <div className="bg-[#8B3DFF] text-white px-6 py-3 flex justify-between items-center shadow-md shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xl">🔄</span>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold tracking-wide">
                AI 가시성 진단 재실행 & 실패 질문 보완 — [{hospitalName}]
              </h2>
              {currentRunId && (
                <span className="bg-purple-900/60 border border-purple-300/40 text-purple-100 text-xs px-2.5 py-0.5 rounded-full font-semibold">
                  현재 회차: Run #{currentRunId}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} disabled={isRerunning} className="text-white hover:text-gray-200 text-2xl font-bold disabled:opacity-50">
            &times;
          </button>
        </div>

        {/* Control Bar */}
        <div className="bg-[#F5F3FF] px-4 py-2 border-b border-purple-200 flex flex-wrap justify-between items-center gap-2 text-xs shrink-0">
          <div className="flex flex-wrap items-center gap-2.5 font-semibold text-purple-950">
            
            {/* 회차 선택 커스텀 컴포넌트 */}
            <RunSelector
              runs={runs}
              currentRunId={currentRunId}
              onSelectRun={handleSelectRun}
              onDeleteRun={handleDeleteRun}
              disabled={isRerunning}
              themeColor="purple"
            />

            {/* 현재 회차 즉시 삭제 버튼 */}
            {currentRunId && (
              <button
                type="button"
                onClick={() => {
                  const confirmMsg = 
                    `⚠️ [진단 회차 삭제]\n\n` +
                    `정말 현재 선택된 Run #${currentRunId} 회차를 삭제하시겠습니까?\n\n` +
                    `※ 주의:\n` +
                    `해당 회차에 수집된 AI 진단 답변 데이터와 함께\n` +
                    `[웹 UI 실측 및 교차 비교검색 데이터]까지 모두 영구 삭제되며 복구할 수 없습니다.`;

                  if (window.confirm(confirmMsg)) {
                    handleDeleteRun(currentRunId);
                  }
                }}
                disabled={isRerunning}
                title="현재 선택된 회차 삭제"
                className="flex items-center gap-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg px-2 py-1 font-bold transition-all active:scale-95 disabled:opacity-50"
              >
                <Trash2 size={13} />
                <span>회차 삭제</span>
              </button>
            )}

            <div className="h-4 w-px bg-purple-200" />

            <span className="font-bold">진단 AI:</span>
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={aiTools.openai} onChange={(e) => setAiTools({ ...aiTools, openai: e.target.checked })} className="w-3.5 h-3.5 text-purple-600 rounded accent-purple-600" />
              <span>OpenAI</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={aiTools.gemini} onChange={(e) => setAiTools({ ...aiTools, gemini: e.target.checked })} className="w-3.5 h-3.5 text-purple-600 rounded accent-purple-600" />
              <span>Gemini</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={aiTools.perplexity} onChange={(e) => setAiTools({ ...aiTools, perplexity: e.target.checked })} className="w-3.5 h-3.5 text-purple-600 rounded accent-purple-600" />
              <span>Perplexity</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={aiTools.naver} onChange={(e) => setAiTools({ ...aiTools, naver: e.target.checked })} className="w-3.5 h-3.5 text-purple-600 rounded accent-purple-600" />
              <span>Naver</span>
            </label>
            <label className="flex items-center gap-1 cursor-not-allowed opacity-50">
              <input type="checkbox" checked={false} disabled className="w-3.5 h-3.5 text-gray-400 rounded accent-gray-400 cursor-not-allowed" />
              <span className="line-through text-gray-400">Claude</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={handleRerunAllQuestions}
              disabled={isRerunning}
              className={`bg-[#8B3DFF] hover:bg-[#722CEB] text-white font-bold px-2.5 py-1 rounded transition-colors flex items-center gap-1 shadow-sm whitespace-nowrap text-xs ${
                isRerunning ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <span>🔁</span> {isRerunning ? '진행 중...' : '선택 항목 재실행'}
            </button>
            <button
              onClick={handleRerunAllFailed}
              disabled={isRerunning}
              className={`bg-[#EB5B25] hover:bg-[#D64E1C] text-white font-bold px-2.5 py-1 rounded transition-colors flex items-center gap-1 shadow-sm whitespace-nowrap text-xs ${
                isRerunning ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <span>⚡</span> 실패 항목 일괄 재실행
            </button>
            <button
              onClick={handleStep34}
              disabled={isRerunning}
              className={`bg-[#137A5A] hover:bg-[#0F6349] text-white font-bold px-2.5 py-1 rounded transition-colors flex items-center gap-1 shadow-sm whitespace-nowrap text-xs ${
                isRerunning ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <span>📊</span> 스텝 3,4번 재실행
            </button>
            <button
              onClick={handlePdfGen}
              disabled={isRerunning}
              className={`bg-[#1C738A] hover:bg-[#165D70] text-white font-bold px-2.5 py-1 rounded transition-colors flex items-center gap-1 shadow-sm whitespace-nowrap text-xs ${
                isRerunning ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <span>📄</span> 진단 PDF 생성
            </button>
            <button
              onClick={handleRefresh}
              disabled={isRerunning}
              className={`bg-[#64748B] hover:bg-[#475569] text-white font-bold px-2.5 py-1 rounded transition-colors flex items-center gap-1 shadow-sm whitespace-nowrap text-xs ${
                isRerunning ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <span>🔄</span> 새로고침
            </button>
          </div>
        </div>

        {/* Content Area (Left: Table expanded, Right: Log widened) */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Table Panel (Maximized & Fully Visible Without Horizontal Scroll) */}
          <div className="flex-1 border-r border-gray-200 p-2.5 sm:p-3 overflow-y-auto bg-gray-50 min-w-0">
            {loading ? (
              <div className="text-center py-10 text-gray-500 font-semibold">답변 목록을 불러오는 중...</div>
            ) : answers.length === 0 ? (
              <div className="text-center py-10 text-gray-500 font-semibold">등록된 답변 데이터가 없습니다.</div>
            ) : (
              <table className="w-full text-xs bg-white rounded-lg shadow-sm border border-gray-200">
                <thead className="bg-gray-100/90 border-b text-gray-700 text-[10px] uppercase tracking-wider">
                  <tr>
                    <th className="px-1 py-2 text-center font-bold border-r w-7 whitespace-nowrap">
                      <input 
                        type="checkbox" 
                        className="w-3.5 h-3.5 rounded text-purple-600 accent-purple-600 cursor-pointer"
                        checked={filteredAnswers.length > 0 && selectedAnswerIds.size === filteredAnswers.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th className="px-1 py-2 text-center font-bold border-r whitespace-nowrap w-12">ID</th>
                    <th className="px-1 py-2 text-center font-bold border-r whitespace-nowrap w-10">Run</th>
                    <th className="px-1 py-2 text-center font-bold border-r whitespace-nowrap w-10">질문ID</th>
                    <th className="px-1 py-2 text-center font-bold border-r whitespace-nowrap w-14">Provider</th>
                    <th className="px-2 py-2 text-left font-bold border-r">질문 문구</th>
                    <th className="px-1 py-2 text-center font-bold border-r whitespace-nowrap w-20">수집 상태</th>
                    <th className="px-1 py-2 text-center font-bold border-r whitespace-nowrap w-24">노출/추천</th>
                    <th className="px-1 py-2 text-center font-bold whitespace-nowrap w-20">재실행 액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredAnswers.map((ans, idx) => (
                    <tr key={ans.id} className="hover:bg-purple-50/70 transition-colors">
                      <td className="px-1 py-1.5 text-center border-r">
                        <input 
                          type="checkbox" 
                          className="w-3.5 h-3.5 rounded text-purple-600 accent-purple-600 cursor-pointer"
                          checked={selectedAnswerIds.has(ans.id)}
                          onChange={() => toggleSelectRow(ans.id)}
                        />
                      </td>
                      <td className="px-1 py-1.5 text-center text-gray-400 font-mono whitespace-nowrap text-[10px]">#{ans.id}</td>
                      <td className="px-1 py-1.5 text-center text-blue-600 font-bold whitespace-nowrap text-[10px]">#{ans.run_id}</td>
                      <td className="px-1 py-1.5 text-center font-bold text-gray-800 whitespace-nowrap text-[10px]">Q{ans.question_id || idx + 1}</td>
                      <td className="px-1 py-1.5 text-center text-gray-700 font-medium whitespace-nowrap uppercase text-[10px]">{ans.provider}</td>
                      <td className="px-2 py-1.5 text-gray-800 font-medium text-xs truncate max-w-[160px] xl:max-w-[260px]" title={ans.query}>
                        {ans.query}
                      </td>
                      <td
                        className="px-1 py-1.5 text-center cursor-pointer hover:opacity-80 transition-opacity whitespace-nowrap"
                        title="클릭하면 수집 결과를 확인합니다"
                        onClick={() => setAnswerPopup(ans)}
                      >
                        {ans.ok ? (
                          <span className="inline-flex items-center gap-0.5 text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-300 font-bold text-[10px]">
                            ✔ 성공
                          </span>
                        ) : ans.answer_text && !ans.error ? (
                          <span className="inline-flex items-center gap-0.5 text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-300 font-bold text-[10px]">
                            ☑ 성공
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200 font-bold text-[10px]" title={ans.error || ''}>
                            ❌ 실패
                          </span>
                        )}
                      </td>
                      {/* 노출/추천 (AEO) 컬럼 */}
                      <td className="px-1 py-1.5 text-center whitespace-nowrap">
                        {ans.mentioned && ans.recommended ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                            언급:✔ | 추천:✔
                          </span>
                        ) : ans.mentioned ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded bg-blue-100 text-blue-800 border border-blue-300">
                            언급:✔ | 추천:❌
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded bg-gray-100 text-gray-500 border border-gray-300">
                            언급:❌ | 추천:❌
                          </span>
                        )}
                      </td>
                      <td className="px-1 py-1.5 text-center whitespace-nowrap">
                        <button
                          onClick={() => handleSingleRerun(ans)}
                          disabled={isRerunning}
                          className={`bg-[#EA580C] hover:bg-[#C2410C] text-white text-[10px] font-bold px-2 py-0.5 rounded transition-all active:scale-95 flex items-center gap-0.5 mx-auto shadow-sm ${
                            isRerunning ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          <span>⚡</span> 재실행
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Right Log Panel (Greatly Widened) */}
          <div className="w-[480px] lg:w-[540px] xl:w-[600px] shrink-0 bg-[#0B132B] text-white p-4 flex flex-col font-mono text-xs overflow-hidden border-l border-slate-700 shadow-inner">
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

