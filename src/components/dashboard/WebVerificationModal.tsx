import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import IframeModal from './IframeModal';

// ── 타입 정의 ─────────────────────────────────────────────────────────
interface WebAnswerRow {
  id?: number;
  question_id: string;
  platform: string;      // [추가] AI 플랫폼 구분
  query: string;
  api_mentioned: boolean;
  web_mentioned: boolean;
  share_url: string;
  memo: string;
  api_raw_text: string;
  web_raw_text: string;
  aliases: string[];     // [추가] 진단 시 사용된 유사명칭 목록
  isLoading?: boolean;
}

interface WebVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  runId: number;
  hospitalCode: string;
  hospitalName: string;
  onChangeRun: () => void;
}

// ── 플랫폼 목록 정의 ──────────────────────────────────────────────────
const PLATFORM_LIST = [
  { key: 'ChatGPT',   providerKey: 'openai',     label: 'ChatGPT',      color: '#10A37F' },
  { key: 'Gemini',    providerKey: 'gemini',      label: 'Gemini',       color: '#4285F4' },
  { key: 'Perplexity',providerKey: 'perplexity',  label: 'Perplexity',   color: '#7C3AED' },
  { key: 'Naver',     providerKey: 'naver',       label: 'Naver API',    color: '#03C75A' },
  { key: 'Claude',    providerKey: 'anthropic',   label: 'Claude',       color: '#D97706' },
];

// ── 병원명 하이라이트 유틸 ────────────────────────────────────────────
const highlightText = (text: string, aliases: string[]): React.ReactNode => {
  if (!text || aliases.length === 0) return text;

  // 빈 문자열 제거 후 길이 내림차순 정렬 (긴 것 먼저 매칭)
  const sortedAliases = [...aliases].filter(a => a.trim().length > 0).sort((a, b) => b.length - a.length);

  // 정규식 이스케이프
  const escapeReg = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = sortedAliases.map(escapeReg).join('|');
  if (!pattern) return text;

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

// ── 플랫폼 배지 ───────────────────────────────────────────────────────
const PlatformBadge: React.FC<{ platform: string }> = ({ platform }) => {
  const p = PLATFORM_LIST.find(pl => pl.key === platform);
  const color = p?.color || '#6B7280';
  return (
    <span style={{
      display: 'inline-block',
      background: color + '20',
      color,
      border: `1px solid ${color}50`,
      borderRadius: 5,
      padding: '1px 7px',
      fontWeight: 700,
      fontSize: 10,
      whiteSpace: 'nowrap',
    }}>
      {p?.label || platform}
    </span>
  );
};

// ── 메모 자동 생성 유틸 ─────────────────────────────────────────────
const getDefaultMemo = (platKey: string, hospName: string, isApi: boolean, isWeb: boolean) => {
  const platLabel = PLATFORM_LIST.find(p => p.key === platKey)?.label || platKey;
  if (isWeb && isApi) return `[${platLabel}] '${hospName}' 노출 감지 (API 결과와 일치)`;
  if (isWeb && !isApi) return `[${platLabel}] '${hospName}' 노출 감지 (웹 실시간 답변으로 API 미노출 상쇄)`;
  if (!isWeb && isApi) return `[${platLabel}] '${hospName}' 미노출 (API에서는 노출되었으나 미감지됨)`;
  return `[${platLabel}] '${hospName}' 미노출 확인 (공통 미노출)`;
};

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────
export const WebVerificationModal: React.FC<WebVerificationModalProps> = ({
  isOpen, onClose, runId, hospitalCode, hospitalName, onChangeRun,
}) => {
  // [변경] 단일 platform → 체크박스 Set
  const [checkedPlatforms, setCheckedPlatforms] = useState<Set<string>>(new Set());
  const [executedPlatforms, setExecutedPlatforms] = useState<Set<string>>(new Set());

  const [rows, setRows] = useState<WebAnswerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoCrawling, setIsAutoCrawling] = useState(false);
  const [activeIframeUrl, setActiveIframeUrl] = useState<string | null>(null);
  const [activeIframeTitle, setActiveIframeTitle] = useState('');
  const [isExpandedAll, setIsExpandedAll] = useState(false);

  // aliases 로드
  const [_hospitalAliases, setHospitalAliases] = useState<string[]>([]);

  // ── aliases 로드 ───────────────────────────────────────────────────
  const loadAliases = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('hospital_config_versions')
        .select('aliases')
        .eq('hospital_code', hospitalCode)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data?.aliases) {
        const parsed = typeof data.aliases === 'string' ? JSON.parse(data.aliases) : data.aliases;
        if (Array.isArray(parsed)) {
          // hospitalName 자체도 포함
          const all = Array.from(new Set([hospitalName, ...parsed].filter(Boolean)));
          setHospitalAliases(all);
          return all;
        }
      }
    } catch (e) {}
    return [hospitalName];
  }, [hospitalCode, hospitalName]);

  // ── 체크박스 토글 ──────────────────────────────────────────────────
  const togglePlatform = (key: string) => {
    setCheckedPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── 데이터 로드 ────────────────────────────────────────────────────
  const fetchVerificationData = useCallback(async () => {
    setLoading(true);
    try {
      const aliases = await loadAliases();

      // answers 전체 조회
      const { data: answersData, error: ansErr } = await supabase
        .from('answers')
        .select('*')
        .eq('run_id', runId)
        .order('id', { ascending: true });

      if (ansErr) throw ansErr;
      const allAnswers = answersData || [];

      // 실행된 플랫폼 자동 감지
      const detected = new Set<string>();
      allAnswers.forEach(a => {
        const prov = (a.provider || '').toLowerCase();
        if (prov.includes('openai')) detected.add('ChatGPT');
        else if (prov.includes('gemini')) detected.add('Gemini');
        else if (prov.includes('perplexity')) detected.add('Perplexity');
        else if (prov.includes('naver')) detected.add('Naver');
        else if (prov.includes('anthropic') || prov.includes('claude')) detected.add('Claude');
      });
      setExecutedPlatforms(detected);
      // 처음 로드 시 실행된 플랫폼 모두 체크
      setCheckedPlatforms(prev => {
        if (prev.size === 0) return new Set(detected);
        return prev;
      });

      // web_verifications 저장 데이터 조회 (모든 플랫폼)
      const savedAnswersMap = new Map<string, any>();
      const { data: allVerifs } = await supabase
        .from('web_verifications')
        .select('id, platform')
        .eq('run_id', runId);

      if (allVerifs && allVerifs.length > 0) {
        for (const verif of allVerifs) {
          const { data: savedAns } = await supabase
            .from('web_verification_answers')
            .select('*')
            .eq('verification_id', verif.id);
          (savedAns || []).forEach(sa => {
            savedAnswersMap.set(`${verif.platform}::${sa.query}`, sa);
          });
        }
      }

      // 각 answer → WebAnswerRow 변환
      const rowList: WebAnswerRow[] = [];
      const seenKeys = new Set<string>();

      allAnswers.forEach((ans, idx) => {
        // 플랫폼 매핑
        const prov = (ans.provider || '').toLowerCase();
        let platKey = 'ChatGPT';
        if (prov.includes('gemini')) platKey = 'Gemini';
        else if (prov.includes('perplexity')) platKey = 'Perplexity';
        else if (prov.includes('naver')) platKey = 'Naver';
        else if (prov.includes('anthropic') || prov.includes('claude')) platKey = 'Claude';

        const dedupKey = `${platKey}::${ans.query}`;
        if (seenKeys.has(dedupKey)) return;
        seenKeys.add(dedupKey);

        const savedRow = savedAnswersMap.get(dedupKey);
        const rawAnswerText = ans.answer_text || '';

        // aliases 기반 언급 판정 (answers.matched_alias 또는 텍스트 검색)
        const cleanText = rawAnswerText.replace(/\s+/g, '');
        const isApiExposed = Boolean(ans.mentioned) ||
          aliases.some(a => cleanText.includes(a.replace(/\s+/g, '')));

        const isWebExposed = savedRow
          ? Boolean(savedRow.web_mentioned)
          : isApiExposed;

        // 차이사유 기본 생성
        const defaultMemo = getDefaultMemo(platKey, hospitalName, isApiExposed, isWebExposed);

        // answers 행에 aliases_json 있으면 우선 사용
        let rowAliases = aliases;
        if (ans.aliases_json) {
          try {
            const parsed = typeof ans.aliases_json === 'string' ? JSON.parse(ans.aliases_json) : ans.aliases_json;
            if (Array.isArray(parsed) && parsed.length > 0) rowAliases = parsed;
          } catch (e) {}
        }

        rowList.push({
          question_id: `Q${ans.question_id || idx + 1}`,
          platform: platKey,
          query: ans.query,
          api_mentioned: isApiExposed,
          web_mentioned: isWebExposed,
          share_url: savedRow?.url || '',
          memo: savedRow ? (savedRow.difference_reason || defaultMemo) : defaultMemo,
          api_raw_text: rawAnswerText,
          web_raw_text: savedRow?.web_answer_text || '',
          aliases: rowAliases,
        });
      });

      setRows(rowList);
    } catch (e: any) {
      console.error('fetchVerificationData error', e);
    } finally {
      setLoading(false);
    }
  }, [runId, hospitalCode, hospitalName, loadAliases]);

  useEffect(() => {
    if (isOpen && runId) {
      fetchVerificationData();
    }
  }, [isOpen, runId]);

  // ── 내장 뷰어 실측 (파이썬 팝업 크롤링 API 연동) ────────────────────────
  const handleOpenViewer = async (row: WebAnswerRow) => {
    // 로딩 상태 시작
    setRows(prev => prev.map(r => 
      (r.platform === row.platform && r.query === row.query) 
        ? { ...r, isLoading: true, web_raw_text: '🚀 백그라운드 브라우저 크롤링 진행 중...' } 
        : r
    ));

    try {
      const res = await fetch('http://127.0.0.1:5000/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: row.platform, query: row.query }),
      });

      if (!res.ok) throw new Error('API 서버 응답 오류');
      const data = await res.json();
      
      const crawledText = data.raw_text || '[크롤링 결과 없음]';
      const cleanText = crawledText.replace(/\s+/g, '');
      const isMentioned = row.aliases.some(a => cleanText.includes(a.replace(/\s+/g, '')));

      setRows(prev => prev.map(r => 
        (r.platform === row.platform && r.query === row.query) 
          ? { 
              ...r, 
              isLoading: false, 
              web_raw_text: crawledText,
              web_mentioned: isMentioned, // 텍스트에 언급되었으면 자동 노출 체크
              memo: getDefaultMemo(r.platform, hospitalName, r.api_mentioned, isMentioned) // 상태에 맞춰 메모 자동 갱신
            } 
          : r
      ));
    } catch (e: any) {
      console.error(e);
      setRows(prev => prev.map(r => 
        (r.platform === row.platform && r.query === row.query) 
          ? { ...r, isLoading: false, web_raw_text: `❌ 크롤링 실패 (파이썬 API 서버 확인 필요): ${e.message}` } 
          : r
      ));
      alert('크롤링 API 서버 연결 실패! 백그라운드에서 API 서버가 구동 중인지 확인해주세요.');
    }
  };

  // ── 1회성 로그인 ──────────────────────────────────────────────────
  const handleOpenLogin = () => {
    // 첫 번째 체크된 플랫폼 기준
    const first = PLATFORM_LIST.find(p => checkedPlatforms.has(p.key));
    let loginUrl = 'https://accounts.google.com';
    if (first?.key === 'ChatGPT') loginUrl = 'https://chatgpt.com/auth/login';
    else if (first?.key === 'Perplexity') loginUrl = 'https://www.perplexity.ai';
    else if (first?.key === 'Claude') loginUrl = 'https://claude.ai';
    setActiveIframeUrl(loginUrl);
    setActiveIframeTitle(`⚡ 사전 계정 로그인 (${first?.label || ''})`);
  };

  // ── DB 저장 ───────────────────────────────────────────────────────
  const handleSaveToDb = async () => {
    setIsSaving(true);
    try {
      // 체크된 플랫폼별 저장
      for (const platKey of Array.from(checkedPlatforms)) {
        const platRows = rows.filter(r => r.platform === platKey);
        if (platRows.length === 0) continue;

        // 기존 삭제
        const { data: oldVerifs } = await supabase
          .from('web_verifications').select('id')
          .eq('run_id', runId).eq('platform', platKey);
        if (oldVerifs && oldVerifs.length > 0) {
          const ids = oldVerifs.map(v => v.id);
          await supabase.from('web_verification_answers').delete().in('verification_id', ids);
          await supabase.from('web_verifications').delete().in('id', ids);
        }

        const matchedCount = platRows.filter(r => r.api_mentioned === r.web_mentioned).length;
        const matchRate = Math.round((matchedCount / (platRows.length || 1)) * 100);

        const { data: verif, error: verifErr } = await supabase
          .from('web_verifications')
          .insert({
            run_id: runId,
            hospital_code: hospitalCode,
            hospital_name: hospitalName,
            platform: platKey,
            verified_at: new Date().toISOString(),
            total_questions: platRows.length,
            matched_questions: matchedCount,
            match_rate: matchRate,
          })
          .select('id').single();

        if (verifErr) throw verifErr;

        const verifAnswers = platRows.map(r => ({
          verification_id: verif.id,
          question_id: r.question_id,
          query: r.query,
          web_answer_text: r.web_raw_text,
          web_mentioned: r.web_mentioned,
          is_matched: r.api_mentioned === r.web_mentioned,
          difference_reason: r.memo,
          verified_at: new Date().toISOString(),
        }));

        const { error: ansErr } = await supabase.from('web_verification_answers').insert(verifAnswers);
        if (ansErr) throw ansErr;
      }

      alert(`✅ 웹 실측 데이터가 DB에 정상적으로 저장되었습니다!`);
      fetchVerificationData();
    } catch (e: any) {
      alert(`❌ 저장 실패: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ── 전체 자동 실측 (7초 간격 병렬) ──────────────────────────────────────────────────
  const handleAutoCrawl = async () => {
    if (filteredRows.length === 0) return alert('실측할 데이터가 없습니다.');
    if (!window.confirm(`총 ${filteredRows.length}개의 질문을 자동 실측합니다.\n(각 브라우저 창이 7초 간격으로 순차적으로 띄워집니다.)\n진행하시겠습니까?`)) return;

    setIsAutoCrawling(true);
    try {
      for (let i = 0; i < filteredRows.length; i++) {
        const row = filteredRows[i];
        if (!isOpen) break; // 모달이 닫히면 중단
        
        // 개별 실측 실행 (await 없이 던져서 브라우저가 열리게 함)
        handleOpenViewer(row).catch(console.error);
        
        // 다음 창을 띄우기 전 정확히 7초 대기
        if (i < filteredRows.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 7000));
        }
      }
      alert('✅ 전체 질문 실측 명령 전송 완료!\n각 창에서 크롤링이 완료될 때까지 잠시만 기다려주세요.');
    } catch (e) {
      console.error(e);
      alert('자동 실측 중 오류가 발생했습니다.');
    } finally {
      setIsAutoCrawling(false);
    }
  };

  // ── 필터링된 rows (체크된 플랫폼만) ──────────────────────────────
  const filteredRows = rows.filter(r => checkedPlatforms.has(r.platform));

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

          {/* Controls Bar 1 - 체크박스 플랫폼 선택 */}
          <div className="bg-emerald-50 px-6 py-3 border-b border-emerald-200 flex justify-between items-center text-xs font-semibold text-emerald-900 flex-wrap gap-2">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="font-bold text-emerald-800">실측 플랫폼:</span>
              {PLATFORM_LIST.map(pl => {
                const isExecuted = executedPlatforms.has(pl.key);
                const isChecked = checkedPlatforms.has(pl.key);
                return (
                  <label key={pl.key} className={`flex items-center gap-1.5 cursor-pointer ${!isExecuted ? 'opacity-40' : ''}`}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => togglePlatform(pl.key)}
                      disabled={!isExecuted}
                      style={{ accentColor: pl.color }}
                      className="w-4 h-4 rounded"
                    />
                    <span
                      className="font-bold"
                      style={{ color: isExecuted ? pl.color : '#9CA3AF' }}
                    >
                      {pl.label}
                    </span>
                    {!isExecuted && (
                      <span className="text-[9px] text-gray-400">(미수행)</span>
                    )}
                  </label>
                );
              })}
              <button
                onClick={fetchVerificationData}
                className="bg-emerald-700 text-white px-2 py-1 rounded hover:bg-emerald-800 ml-2"
              >
                🔄 새로고침
              </button>
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
            <button
              onClick={handleAutoCrawl}
              disabled={isAutoCrawling}
              className={`${isAutoCrawling ? 'bg-gray-400 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-700'} text-white font-bold px-3 py-1.5 rounded flex items-center gap-1 shadow-sm transition-colors`}
            >
              <span>{isAutoCrawling ? '⏳' : '🚀'}</span> {isAutoCrawling ? '전체 자동 실측 진행중...' : '전체 질문 순차 자동 실측'}
            </button>
            <button onClick={() => setActiveIframeUrl(null)} className="bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1.5 rounded flex items-center gap-1 shadow-sm">
              <span>❌</span> 전체 내장 창 일괄 닫기
            </button>
            <button
              onClick={() => setIsExpandedAll(!isExpandedAll)}
              className={`font-bold px-3 py-1.5 rounded flex items-center gap-1 transition-colors text-white ${isExpandedAll ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-sky-600 hover:bg-sky-700'}`}
            >
              <span>📖</span> {isExpandedAll ? '크롤링 결과 접기' : '크롤링 결과 전체 펼쳐보기'}
            </button>
          </div>

          {/* Table */}
          <div className="flex-1 p-4 overflow-y-auto bg-gray-50">
            {loading ? (
              <div className="text-center py-10 text-gray-500 font-semibold">실측 항목 불러오는 중...</div>
            ) : filteredRows.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                {checkedPlatforms.size === 0 ? '위에서 플랫폼을 선택해주세요.' : '해당 플랫폼의 수집 데이터가 없습니다.'}
              </div>
            ) : (
              <table className="min-w-full text-xs bg-white rounded shadow-sm overflow-hidden border border-gray-200">
                <thead className="bg-emerald-100 text-emerald-900 border-b">
                  <tr>
                    <th className="px-2 py-2 text-center w-12 font-bold border-r">번호</th>
                    <th className="px-2 py-2 text-center w-24 font-bold border-r">AI 플랫폼</th>
                    <th className="px-3 py-2 text-left font-bold w-48 border-r">질문 문구</th>
                    <th className="px-2 py-2 text-center font-bold w-24 border-r">API 언급</th>
                    <th className="px-2 py-2 text-center font-bold w-24 border-r">웹 UI 실측</th>
                    <th className="px-2 py-2 text-center font-bold w-28 border-r">내장 뷰어</th>
                    <th className="px-2 py-2 text-left font-bold w-64 border-r">API검색결과 / 메모</th>
                    <th className="px-3 py-2 text-left font-bold">웹 UI 수집 원문 (크롤링 결과)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredRows.map((row, idx) => (
                    <tr key={`${row.platform}-${idx}`} className="hover:bg-emerald-50 transition-colors">
                      <td className="px-2 py-2 text-center font-bold text-gray-600 border-r">{row.question_id}</td>
                      {/* [신규] AI 플랫폼 컬럼 */}
                      <td className="px-2 py-2 text-center border-r">
                        <PlatformBadge platform={row.platform} />
                      </td>
                      <td className="px-3 py-2 text-gray-800 font-medium border-r">{row.query}</td>
                      <td className="px-2 py-2 text-center border-r">
                        {row.api_mentioned ? (
                          <span className="text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-200 font-bold whitespace-nowrap">✔ 노출</span>
                        ) : (
                          <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200 font-bold whitespace-nowrap">❌ 미노출</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center border-r">
                        <select
                          value={row.web_mentioned ? 'true' : 'false'}
                          onChange={(e) => {
                            const val = e.target.value === 'true';
                            setRows(prev => prev.map((r) => (r.platform === row.platform && r.query === row.query ? { 
                              ...r, 
                              web_mentioned: val,
                              memo: getDefaultMemo(r.platform, hospitalName, r.api_mentioned, val)
                            } : r)));
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
                          disabled={row.isLoading}
                          className={`${row.isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-700'} text-white text-[11px] font-bold px-2.5 py-1 rounded flex items-center gap-1 mx-auto shadow-sm whitespace-nowrap transition-colors`}
                        >
                          <span>{row.isLoading ? '⏳' : '👁️'}</span> {row.isLoading ? '수집 중' : '내장 뷰어 실측'}
                        </button>
                      </td>
                      <td className="px-2 py-2 border-r align-top">
                        <div className={`mb-2 text-gray-700 text-[11px] font-mono leading-snug ${
                          isExpandedAll ? 'whitespace-pre-wrap break-words max-w-[450px]' : 'max-w-[300px] overflow-hidden'
                        }`} title={row.api_raw_text}>
                          {row.api_raw_text ? (
                            isExpandedAll ? (
                              <span>{highlightText(row.api_raw_text, row.aliases)}</span>
                            ) : (
                              <span className="truncate block">{row.api_raw_text}</span>
                            )
                          ) : (
                            <span className="text-gray-400 italic">[API 답변 없음]</span>
                          )}
                        </div>
                        <input
                          type="text"
                          value={row.memo}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRows(prev => prev.map(r => (r.platform === row.platform && r.query === row.query ? { ...r, memo: val } : r)));
                          }}
                          placeholder="메모 입력"
                          className="w-full border border-gray-200 bg-white text-black rounded px-1.5 py-1 text-xs outline-none focus:border-emerald-500 font-medium"
                        />
                      </td>
                      {/* [신규] 하이라이트 적용된 크롤링 결과 */}
                      <td
                        className={`px-3 py-2 text-gray-700 text-[11px] font-mono leading-snug ${
                          isExpandedAll ? 'whitespace-pre-wrap break-words max-w-[450px]' : 'max-w-[250px] overflow-hidden'
                        }`}
                        title={row.web_raw_text}
                      >
                        {row.web_raw_text ? (
                          isExpandedAll ? (
                            <span>{highlightText(row.web_raw_text, row.aliases)}</span>
                          ) : (
                            <span className="truncate block">{row.web_raw_text}</span>
                          )
                        ) : (
                          <span className="text-gray-400 italic">[내장 뷰어 실측 원문 수집 대기]</span>
                        )}
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
            <button 
              onClick={handleSaveToDb} 
              disabled={isSaving}
              className={`${isSaving ? 'bg-gray-400 cursor-progress' : 'bg-orange-600 hover:bg-orange-700'} text-white px-5 py-1.5 rounded text-xs font-bold transition-colors shadow flex items-center gap-1`}
            >
              <span>{isSaving ? '⏳' : '📄'}</span> {isSaving ? '웹 실측 DB 저장 중...' : '웹 실측 DB 저장 & 교차 분석 리포트 생성'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default WebVerificationModal;
