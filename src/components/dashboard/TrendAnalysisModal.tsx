import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  TrendingUp, 
  BarChart3, 
  Layers, 
  Calendar, 
  CheckSquare, 
  Square, 
  RefreshCw, 
  X, 
  ArrowUpRight, 
  ArrowDownRight, 
  Minus 
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar
} from 'recharts';

interface TrendAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  hospitalCode: string;
  hospitalName: string;
}

interface RunSummary {
  id: number;
  created_at: string;
  version?: string;
  overall_mention_rate?: number;
  overall_recommend_rate?: number;
  overall_top_rate?: number;
  trust_score?: number;
  answer_count?: number;
}

interface RunAnalysisData {
  runId: number;
  dateStr: string;
  label: string;
  mentionRate: number;     // %
  recommendRate: number;   // %
  topRate: number;         // %
  trustScore: number;      // 점수 (0~100)
  platformRates: Record<string, number>; // { ChatGPT: 80, Gemini: 70, ... }
  queryStatusMap: Record<string, { query: string; mentioned: boolean; recommended: boolean }>;
}

const AI_PLATFORMS = [
  { key: 'ChatGPT', label: 'ChatGPT', color: '#10A37F' },
  { key: 'Gemini', label: 'Gemini', color: '#4285F4' },
  { key: 'Perplexity', label: 'Perplexity', color: '#7C3AED' },
  { key: 'Naver', label: 'Naver API', color: '#03C75A' },
  { key: 'Claude', label: 'Claude', color: '#D97706' },
];

export const TrendAnalysisModal: React.FC<TrendAnalysisModalProps> = ({
  isOpen,
  onClose,
  hospitalCode,
  hospitalName,
}) => {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedRunIds, setSelectedRunIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState<boolean>(false);
  const [analysisDataList, setAnalysisDataList] = useState<RunAnalysisData[]>([]);
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'PLATFORM' | 'QUERY'>('OVERVIEW');

  // 병원 회차 목록 로드
  const fetchHospitalRuns = useCallback(async () => {
    if (!hospitalCode) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('runs')
        .select('*')
        .eq('hospital_code', hospitalCode)
        .order('id', { ascending: false });

      if (error) throw error;

      const runList: RunSummary[] = (data || []).map(r => ({
        id: r.id,
        created_at: r.created_at || new Date().toISOString(),
        version: r.version || 'v1.0',
        overall_mention_rate: r.overall_mention_rate || 0,
        trust_score: r.trust_score || 85,
      }));

      setRuns(runList);

      // 기본적으로 최근 최대 5개 회차 자동 선택
      if (runList.length > 0) {
        const top5 = runList.slice(0, 5).map(r => r.id);
        setSelectedRunIds(new Set(top5));
      } else {
        setSelectedRunIds(new Set());
      }
    } catch (e: any) {
      console.error('Failed to fetch hospital runs for trends:', e);
    } finally {
      setLoading(false);
    }
  }, [hospitalCode]);

  useEffect(() => {
    if (isOpen) {
      fetchHospitalRuns();
    }
  }, [isOpen, fetchHospitalRuns]);

  // 선택된 회차들의 상세 데이터(answers) 집계
  const fetchAnalysisForSelectedRuns = useCallback(async () => {
    if (selectedRunIds.size === 0) {
      setAnalysisDataList([]);
      return;
    }

    setLoading(true);
    const sortedRunIds = Array.from(selectedRunIds).sort((a, b) => a - b); // 오래된 순 -> 최신순 (X축 시간순)

    try {
      const { data: answersData, error: ansErr } = await supabase
        .from('answers')
        .select('id, run_id, provider, query, mentioned, recommended, first_position')
        .in('run_id', sortedRunIds);

      if (ansErr) throw ansErr;
      const allAnswers = answersData || [];

      const result: RunAnalysisData[] = [];

      for (const runId of sortedRunIds) {
        const runMeta = runs.find(r => r.id === runId);
        const ansOfRun = allAnswers.filter(a => a.run_id === runId);
        const totalAns = ansOfRun.length || 1;

        const dateObj = new Date(runMeta?.created_at || new Date());
        const dateStr = `${String(dateObj.getMonth() + 1).padStart(2, '0')}/${String(dateObj.getDate()).padStart(2, '0')}`;
        const label = `Run #${runId} (${dateStr})`;

        const mentionCount = ansOfRun.filter(a => Boolean(a.mentioned)).length;
        const recommendCount = ansOfRun.filter(a => Boolean(a.recommended)).length;
        const topCount = ansOfRun.filter(a => a.first_position !== null && a.first_position !== undefined && a.first_position <= 50).length;

        const mentionRate = Math.round((mentionCount / totalAns) * 100);
        const recommendRate = Math.round((recommendCount / totalAns) * 100);
        const topRate = Math.round((topCount / totalAns) * 100);

        // 신뢰도 점수 (DB 저장값 또는 노출률 기반 계산)
        const trustScore = runMeta?.trust_score || Math.min(100, Math.round(mentionRate * 0.6 + recommendRate * 0.4 + 20));

        // AI 플랫폼별 언급률 계산
        const platformRates: Record<string, number> = {};
        AI_PLATFORMS.forEach(p => {
          const provKey = p.key.toLowerCase();
          const platAnswers = ansOfRun.filter(a => {
            const pv = (a.provider || '').toLowerCase();
            if (p.key === 'ChatGPT') return pv.includes('openai');
            if (p.key === 'Naver') return pv.includes('naver');
            if (p.key === 'Claude') return pv.includes('anthropic') || pv.includes('claude');
            return pv.includes(provKey);
          });

          if (platAnswers.length > 0) {
            const mCount = platAnswers.filter(a => Boolean(a.mentioned)).length;
            platformRates[p.key] = Math.round((mCount / platAnswers.length) * 100);
          } else {
            platformRates[p.key] = 0;
          }
        });

        // 각 질문별 노출 맵
        const queryStatusMap: Record<string, { query: string; mentioned: boolean; recommended: boolean }> = {};
        ansOfRun.forEach(a => {
          const q = a.query;
          if (!queryStatusMap[q]) {
            queryStatusMap[q] = { query: q, mentioned: false, recommended: false };
          }
          if (a.mentioned) queryStatusMap[q].mentioned = true;
          if (a.recommended) queryStatusMap[q].recommended = true;
        });

        result.push({
          runId,
          dateStr,
          label,
          mentionRate,
          recommendRate,
          topRate,
          trustScore,
          platformRates,
          queryStatusMap,
        });
      }

      setAnalysisDataList(result);
    } catch (e: any) {
      console.error('Failed to compute trend metrics:', e);
    } finally {
      setLoading(false);
    }
  }, [selectedRunIds, runs]);

  useEffect(() => {
    if (isOpen && selectedRunIds.size > 0) {
      fetchAnalysisForSelectedRuns();
    }
  }, [isOpen, selectedRunIds, fetchAnalysisForSelectedRuns]);

  // 고유 질문 목록 추출
  const allUniqueQueries = useMemo(() => {
    const qSet = new Set<string>();
    analysisDataList.forEach(ad => {
      Object.keys(ad.queryStatusMap).forEach(q => qSet.add(q));
    });
    return Array.from(qSet);
  }, [analysisDataList]);

  // 전체 선택 / 해제
  const handleSelectAllRuns = () => {
    if (selectedRunIds.size === runs.length) {
      setSelectedRunIds(new Set());
    } else {
      setSelectedRunIds(new Set(runs.map(r => r.id)));
    }
  };

  const handleSelectRecent = (count: number) => {
    const recent = runs.slice(0, count).map(r => r.id);
    setSelectedRunIds(new Set(recent));
  };

  const toggleRun = (runId: number) => {
    setSelectedRunIds(prev => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });
  };

  if (!isOpen) return null;

  // 최신 vs 직전 회차 비교 증감 계산
  const latestData = analysisDataList[analysisDataList.length - 1];
  const prevData = analysisDataList.length >= 2 ? analysisDataList[analysisDataList.length - 2] : null;

  const getDiffBadge = (current: number, previous?: number, unit: string = '%') => {
    if (previous === undefined || previous === null) return null;
    const diff = current - previous;
    if (diff > 0) {
      return (
        <span className="inline-flex items-center text-emerald-600 font-extrabold text-[11px] ml-1.5">
          <ArrowUpRight size={12} /> +{diff}{unit}
        </span>
      );
    } else if (diff < 0) {
      return (
        <span className="inline-flex items-center text-red-500 font-extrabold text-[11px] ml-1.5">
          <ArrowDownRight size={12} /> {diff}{unit}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center text-slate-400 font-semibold text-[11px] ml-1.5">
        <Minus size={11} /> 0{unit}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 font-sans">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden border border-indigo-300">
        
        {/* Header */}
        <div className="bg-[#4338CA] text-white px-6 py-3 flex justify-between items-center shadow-md shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-900/60 border border-indigo-300/40 flex items-center justify-center text-indigo-200">
              <TrendingUp size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold tracking-tight">다중 회차 가시성 추이 분석 대시보드</h2>
                <span className="bg-indigo-950/70 text-indigo-100 text-xs px-2.5 py-0.5 rounded-full font-bold border border-indigo-400/30">
                  {hospitalName}
                </span>
              </div>
              <p className="text-[11px] text-indigo-200 mt-0.5">
                여러 진단 회차(Run ID)를 선택하여 4대 지표, AI 채널별 언급률, 질문별 개선 추이를 종합 비교합니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-indigo-200 hover:text-white p-1 rounded-lg hover:bg-indigo-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Top Filter Bar: 회차 다중 선택 영역 */}
        <div className="bg-indigo-50/70 px-6 py-3 border-b border-indigo-100 flex flex-col gap-2 shrink-0">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-indigo-900 flex items-center gap-1">
                <Calendar size={14} className="text-indigo-600" />
                분석 대상 회차 선택 ({selectedRunIds.size}/{runs.length}):
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleSelectRecent(3)}
                  className="px-2 py-0.5 text-[11px] font-bold bg-white text-indigo-700 border border-indigo-200 rounded hover:bg-indigo-100 transition-colors"
                >
                  최근 3회차
                </button>
                <button
                  onClick={() => handleSelectRecent(5)}
                  className="px-2 py-0.5 text-[11px] font-bold bg-white text-indigo-700 border border-indigo-200 rounded hover:bg-indigo-100 transition-colors"
                >
                  최근 5회차
                </button>
                <button
                  onClick={handleSelectAllRuns}
                  className="px-2 py-0.5 text-[11px] font-bold bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
                >
                  {selectedRunIds.size === runs.length ? '전체 해제' : '전체 선택'}
                </button>
              </div>
            </div>

            <button
              onClick={fetchHospitalRuns}
              className="flex items-center gap-1 text-xs font-bold text-indigo-700 bg-white border border-indigo-200 px-2.5 py-1 rounded hover:bg-indigo-100 shadow-sm"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              <span>회차 목록 갱신</span>
            </button>
          </div>

          {/* Run Selection Chips */}
          <div className="flex items-center gap-1.5 flex-wrap max-h-16 overflow-y-auto pt-1">
            {runs.map(run => {
              const isChecked = selectedRunIds.has(run.id);
              const d = new Date(run.created_at);
              const dateLabel = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;

              return (
                <button
                  key={run.id}
                  onClick={() => toggleRun(run.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    isChecked
                      ? 'bg-indigo-600 text-white shadow-sm border border-indigo-700 ring-2 ring-indigo-300'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {isChecked ? <CheckSquare size={13} className="text-indigo-200" /> : <Square size={13} className="text-slate-400" />}
                  <span>Run #{run.id}</span>
                  <span className={`text-[10px] font-normal ${isChecked ? 'text-indigo-200' : 'text-slate-400'}`}>
                    ({dateLabel})
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* View Mode Tabs */}
        <div className="bg-white px-6 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={() => setActiveTab('OVERVIEW')}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-extrabold border-b-2 transition-colors ${
                activeTab === 'OVERVIEW'
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <TrendingUp size={14} />
              <span>1. 4대 핵심 지표 추이 그래프</span>
            </button>

            <button
              onClick={() => setActiveTab('PLATFORM')}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-extrabold border-b-2 transition-colors ${
                activeTab === 'PLATFORM'
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <BarChart3 size={14} />
              <span>2. AI 채널별 언급률 비교</span>
            </button>

            <button
              onClick={() => setActiveTab('QUERY')}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-extrabold border-b-2 transition-colors ${
                activeTab === 'QUERY'
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Layers size={14} />
              <span>3. 질문별 회차 매트릭스 테이블</span>
            </button>
          </div>

          <div className="text-xs text-slate-500 font-medium">
            선택된 회차: <strong className="text-indigo-700">{analysisDataList.length}개</strong>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
              <RefreshCw className="animate-spin text-indigo-600" size={32} />
              <span className="text-sm font-semibold">회차별 가시성 지표 및 질문 데이터를 집계하는 중입니다...</span>
            </div>
          ) : analysisDataList.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              상단에서 비교 분석할 진단 회차(Run ID)를 1개 이상 선택해 주세요.
            </div>
          ) : (
            <>
              {/* TAB 1: 4대 핵심 지표 종합 추이 */}
              {activeTab === 'OVERVIEW' && (
                <div className="space-y-6">
                  {/* Summary Metric Cards */}
                  {latestData && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* 평균 언급률 */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <div className="text-xs font-bold text-slate-500">최신 평균 AI 언급률</div>
                        <div className="flex items-baseline mt-1">
                          <span className="text-2xl font-black text-indigo-600">{latestData.mentionRate}%</span>
                          {getDiffBadge(latestData.mentionRate, prevData?.mentionRate)}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">환자 질문에 우리 병원이 등장한 비율</p>
                      </div>

                      {/* 추천 포함률 */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <div className="text-xs font-bold text-slate-500">최신 추천 포함률</div>
                        <div className="flex items-baseline mt-1">
                          <span className="text-2xl font-black text-emerald-600">{latestData.recommendRate}%</span>
                          {getDiffBadge(latestData.recommendRate, prevData?.recommendRate)}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">AI가 대안으로 추천을 명시한 비율</p>
                      </div>

                      {/* 상위 노출률 */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <div className="text-xs font-bold text-slate-500">최신 상위 노출률</div>
                        <div className="flex items-baseline mt-1">
                          <span className="text-2xl font-black text-orange-600">{latestData.topRate}%</span>
                          {getDiffBadge(latestData.topRate, prevData?.topRate)}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">답변 초반에 우선 언급된 비율</p>
                      </div>

                      {/* 신뢰도 점수 */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <div className="text-xs font-bold text-slate-500">최신 GEO 신뢰도 점수</div>
                        <div className="flex items-baseline mt-1">
                          <span className="text-2xl font-black text-purple-600">{latestData.trustScore}점</span>
                          {getDiffBadge(latestData.trustScore, prevData?.trustScore, '점')}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">AI 검색 인용 가능성 및 신뢰도</p>
                      </div>
                    </div>
                  )}

                  {/* 4대 지표 Line Chart */}
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-bold text-slate-800">회차별 4대 핵심 지표 추이 그래프</h3>
                        <p className="text-xs text-slate-400">회차 경과에 따른 가시성 지표 변화율</p>
                      </div>
                    </div>

                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={analysisDataList} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis dataKey="label" stroke="#64748B" fontSize={11} />
                          <YAxis stroke="#64748B" fontSize={11} domain={[0, 100]} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#1E293B', color: '#F8FAFC', borderRadius: '8px', fontSize: '12px' }} 
                          />
                          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                          <Line type="monotone" dataKey="mentionRate" name="평균 AI 언급률 (%)" stroke="#4F46E5" strokeWidth={3} activeDot={{ r: 6 }} />
                          <Line type="monotone" dataKey="recommendRate" name="추천 포함률 (%)" stroke="#10B981" strokeWidth={2.5} />
                          <Line type="monotone" dataKey="topRate" name="상위 노출률 (%)" stroke="#F97316" strokeWidth={2.5} />
                          <Line type="monotone" dataKey="trustScore" name="GEO 신뢰도 (점)" stroke="#8B5CF6" strokeWidth={2} strokeDasharray="4 4" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: AI 채널별 언급률 비교 */}
              {activeTab === 'PLATFORM' && (
                <div className="space-y-6">
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-bold text-slate-800">회차별 AI 플랫폼별 언급률 추이</h3>
                        <p className="text-xs text-slate-400">각 AI 검색 엔진(ChatGPT, Gemini, Perplexity, Naver, Claude)별 노출도 비교</p>
                      </div>
                    </div>

                    {/* Transform Data for BarChart */}
                    <div className="h-80 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={analysisDataList.map(ad => ({
                            label: ad.label,
                            ChatGPT: ad.platformRates['ChatGPT'] || 0,
                            Gemini: ad.platformRates['Gemini'] || 0,
                            Perplexity: ad.platformRates['Perplexity'] || 0,
                            Naver: ad.platformRates['Naver'] || 0,
                            Claude: ad.platformRates['Claude'] || 0,
                          }))}
                          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis dataKey="label" stroke="#64748B" fontSize={11} />
                          <YAxis stroke="#64748B" fontSize={11} domain={[0, 100]} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#1E293B', color: '#F8FAFC', borderRadius: '8px', fontSize: '12px' }} 
                            formatter={(value: any) => [`${value}%`, '언급률']}
                          />
                          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                          <Bar dataKey="ChatGPT" fill="#10A37F" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Gemini" fill="#4285F4" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Perplexity" fill="#7C3AED" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Naver" fill="#03C75A" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Claude" fill="#D97706" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: 질문별 회차 매트릭스 테이블 */}
              {activeTab === 'QUERY' && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-3.5 bg-slate-800 text-white flex justify-between items-center">
                    <div>
                      <h3 className="text-xs font-bold">각 질문(Query)별 회차 간 노출 상태 매트릭스</h3>
                      <p className="text-[11px] text-slate-300">어떤 질문에서 노출이 개선되었거나 미노출이 지속되는지 정밀 추적합니다.</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3 w-12 text-center border-r">번호</th>
                          <th className="py-2.5 px-3 min-w-[280px] border-r">환자 질문 문구 (Query)</th>
                          {analysisDataList.map(ad => (
                            <th key={ad.runId} className="py-2.5 px-3 text-center border-r w-28">
                              <div>{ad.label}</div>
                            </th>
                          ))}
                          <th className="py-2.5 px-3 text-center w-28">종합 노출 상태</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                        {allUniqueQueries.map((query, idx) => {
                          // 각 회차별 노출 횟수 집계
                          let exposedCount = 0;
                          analysisDataList.forEach(ad => {
                            if (ad.queryStatusMap[query]?.mentioned) exposedCount++;
                          });
                          const isNeverExposed = exposedCount === 0;
                          const isFullyExposed = exposedCount === analysisDataList.length;

                          return (
                            <tr
                              key={query}
                              className={`hover:bg-slate-50 transition-colors ${
                                isNeverExposed ? 'bg-red-50/40' : isFullyExposed ? 'bg-emerald-50/30' : ''
                              }`}
                            >
                              <td className="py-2.5 px-3 text-center font-bold text-slate-500 border-r">
                                Q{String(idx + 1).padStart(2, '0')}
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-slate-900 border-r">
                                <div className="leading-snug">{query}</div>
                              </td>

                              {analysisDataList.map(ad => {
                                const status = ad.queryStatusMap[query];
                                const isMentioned = status?.mentioned;
                                const isRecommended = status?.recommended;

                                return (
                                  <td key={ad.runId} className="py-2 px-2 text-center border-r">
                                    {isMentioned ? (
                                      <div className="inline-flex flex-col items-center">
                                        <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold px-2 py-0.5 rounded text-[11px]">
                                          ✔ 노출
                                        </span>
                                        {isRecommended && (
                                          <span className="text-[9px] text-emerald-600 font-semibold mt-0.5">
                                            (추천포함)
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="bg-red-100 text-red-700 border border-red-200 font-bold px-2 py-0.5 rounded text-[11px]">
                                        ❌ 미노출
                                      </span>
                                    )}
                                  </td>
                                );
                              })}

                              <td className="py-2.5 px-3 text-center">
                                {isNeverExposed ? (
                                  <span className="bg-red-500 text-white font-extrabold text-[10px] px-2 py-0.5 rounded-full shadow-sm">
                                    🚨 지속 미노출
                                  </span>
                                ) : isFullyExposed ? (
                                  <span className="bg-emerald-600 text-white font-extrabold text-[10px] px-2 py-0.5 rounded-full shadow-sm">
                                    ✨ 완전 선점
                                  </span>
                                ) : (
                                  <span className="bg-indigo-100 text-indigo-800 font-bold text-[10px] px-2 py-0.5 rounded-full border border-indigo-200">
                                    개선 진행중 ({exposedCount}/{analysisDataList.length})
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-between items-center shrink-0">
          <div className="text-xs text-slate-500">
            루비스 AI 가시성 진단 분석 시스템 · <span className="font-semibold text-slate-700">{hospitalName}</span>
          </div>
          <button
            onClick={onClose}
            className="bg-indigo-700 hover:bg-indigo-800 text-white px-5 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm"
          >
            닫기
          </button>
        </div>

      </div>
    </div>
  );
};

export default TrendAnalysisModal;
