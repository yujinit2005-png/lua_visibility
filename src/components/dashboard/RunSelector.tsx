import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Trash2, CheckCircle2, AlertCircle, Clock } from 'lucide-react';

export interface RunItemWithDetails {
  id: number;
  hospital_code: string;
  config_version: string;
  started_at: string;
  status: string;
  total_tasks: number;
  completed_tasks: number;
  providers?: string[];
  answer_count?: number;
}

interface RunSelectorProps {
  runs: RunItemWithDetails[];
  currentRunId: number | null;
  onSelectRun: (runId: number) => void;
  onDeleteRun: (runId: number) => Promise<void>;
  disabled?: boolean;
  themeColor?: 'purple' | 'emerald';
}

const PROVIDER_BADGE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  openai: { label: 'ChatGPT', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
  chatgpt: { label: 'ChatGPT', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
  gemini: { label: 'Gemini', bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700' },
  google: { label: 'Gemini', bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700' },
  perplexity: { label: 'Perplexity', bg: 'bg-purple-50 border-purple-200', text: 'text-purple-700' },
  naver: { label: 'Naver', bg: 'bg-green-50 border-green-200', text: 'text-green-700' },
  anthropic: { label: 'Claude', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700' },
  claude: { label: 'Claude', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700' },
};

export const RunSelector: React.FC<RunSelectorProps> = ({
  runs,
  currentRunId,
  onSelectRun,
  onDeleteRun,
  disabled = false,
  themeColor = 'purple',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentRun = runs.find((r) => r.id === currentRunId) || (runs.length > 0 ? runs[0] : null);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDeleteClick = async (e: React.MouseEvent, runId: number) => {
    e.stopPropagation();
    
    const confirmMsg = 
      `⚠️ [진단 회차 삭제]\n\n` +
      `정말 Run #${runId} 회차를 삭제하시겠습니까?\n\n` +
      `※ 주의:\n` +
      `해당 회차에 수집된 AI 진단 답변 데이터와 함께\n` +
      `[웹 UI 실측 및 교차 비교검색 데이터]까지 모두 영구 삭제되며 복구할 수 없습니다.`;

    if (window.confirm(confirmMsg)) {
      await onDeleteRun(runId);
    }
  };

  const getStatusBadge = (status?: string) => {
    const s = (status || '').toUpperCase();
    if (s === 'SUCCESS' || s === 'COMPLETED') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
          <CheckCircle2 size={11} />
          성공
        </span>
      );
    }
    if (s === 'RUNNING') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
          <Clock size={11} />
          진행중
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-800 border border-red-300">
        <AlertCircle size={11} />
        {status || '실패'}
      </span>
    );
  };

  const borderTheme = themeColor === 'purple' ? 'border-purple-300 focus:border-purple-500' : 'border-emerald-300 focus:border-emerald-500';
  const textTheme = themeColor === 'purple' ? 'text-purple-900' : 'text-emerald-900';

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled || runs.length === 0}
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 bg-white ${borderTheme} border rounded-lg px-3 py-1.5 shadow-sm text-xs font-semibold hover:bg-slate-50 transition-all ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        }`}
      >
        <span className="font-bold flex items-center gap-1 text-slate-700">
          <span>📋</span> 회차:
        </span>

        {currentRun ? (
          <div className="flex items-center gap-2">
            <span className={`font-extrabold ${textTheme}`}>
              #{currentRun.id} ({currentRun.config_version || 'v1.0'})
            </span>
            {getStatusBadge(currentRun.status)}
            <span className="text-slate-500 text-[11px] hidden sm:inline">
              {new Date(currentRun.started_at).toLocaleDateString('ko-KR')}
            </span>
          </div>
        ) : (
          <span className="text-slate-400">진단 기록 없음</span>
        )}

        <ChevronDown size={14} className={`text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Popover Menu */}
      {isOpen && (
        <div className="absolute left-0 mt-1.5 w-[460px] max-w-[90vw] bg-white rounded-xl shadow-2xl border border-slate-200 z-[100] overflow-hidden animate-fadeIn">
          {/* Menu Header */}
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex justify-between items-center text-xs">
            <span className="font-bold text-slate-700 flex items-center gap-1.5">
              <span>📋</span> 진단 실행 회차 목록 ({runs.length}건)
            </span>
            <span className="text-[11px] text-slate-400">회차 클릭 시 즉시 결과 전환</span>
          </div>

          {/* List Items */}
          <div className="max-h-[320px] overflow-y-auto divide-y divide-slate-100">
            {runs.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                진단 실행 기록이 존재하지 않습니다.
              </div>
            ) : (
              runs.map((r, idx) => {
                const isSelected = r.id === currentRunId;
                const providers = r.providers || [];

                return (
                  <div
                    key={r.id}
                    onClick={() => {
                      onSelectRun(r.id);
                      setIsOpen(false);
                    }}
                    className={`p-3 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                      isSelected
                        ? themeColor === 'purple' ? 'bg-purple-50/80 hover:bg-purple-100/70' : 'bg-emerald-50/80 hover:bg-emerald-100/70'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    {/* Left: Info */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`font-black text-xs ${isSelected ? (themeColor === 'purple' ? 'text-purple-700' : 'text-emerald-700') : 'text-slate-800'}`}>
                          Run #{r.id}
                        </span>
                        <span className="text-[11px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded border border-slate-200">
                          {r.config_version || 'v1.0'}
                        </span>
                        {idx === 0 && (
                          <span className="text-[10px] font-extrabold bg-orange-100 text-orange-700 px-1.5 py-0.2 rounded">
                            최신
                          </span>
                        )}
                        {getStatusBadge(r.status)}
                      </div>

                      {/* Providers badges & Task count */}
                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                        {providers.length > 0 ? (
                          providers.map((p) => {
                            const conf = PROVIDER_BADGE_CONFIG[p.toLowerCase()] || {
                              label: p,
                              bg: 'bg-slate-100 border-slate-200',
                              text: 'text-slate-600',
                            };
                            return (
                              <span
                                key={p}
                                className={`text-[10px] font-semibold px-1.5 py-0.2 rounded border ${conf.bg} ${conf.text}`}
                              >
                                {conf.label}
                              </span>
                            );
                          })
                        ) : (
                          <span className="text-[10px] text-slate-400">도구 정보 없음</span>
                        )}

                        <span className="text-[11px] text-slate-400 font-mono ml-auto">
                          답변: {r.answer_count !== undefined ? `${r.answer_count}건` : `${r.completed_tasks || 0}/${r.total_tasks || 0}`}
                        </span>
                      </div>

                      <div className="text-[10px] text-slate-400">
                        {new Date(r.started_at).toLocaleString('ko-KR')}
                      </div>
                    </div>

                    {/* Right: Delete Action Button */}
                    <button
                      type="button"
                      onClick={(e) => handleDeleteClick(e, r.id)}
                      title={`Run #${r.id} 삭제 (비교검색 데이터 포함)`}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RunSelector;
