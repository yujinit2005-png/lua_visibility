import { useEffect, useRef } from 'react';
import { useDashboard } from '../../contexts/DashboardContext';
import { Terminal, Trash2, ArrowDown, Activity } from 'lucide-react';

const StatusIcon = ({ status }: { status: 'pending' | 'running' | 'done' | 'error' }) => {
  if (status === 'pending') return <span className="w-2.5 h-2.5 rounded-full bg-slate-300"></span>;
  if (status === 'running') return <span className="w-2.5 h-2.5 rounded-full border-2 border-orange-500 border-t-transparent animate-spin"></span>;
  if (status === 'done') return <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>;
  return <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>;
};

const StatusText = ({ status }: { status: 'pending' | 'running' | 'done' | 'error' }) => {
  if (status === 'pending') return <span className="text-slate-400 text-xs">대기</span>;
  if (status === 'running') return <span className="text-orange-500 text-xs font-bold animate-pulse">진행중</span>;
  if (status === 'done') return <span className="text-emerald-600 text-xs font-bold">완료</span>;
  return <span className="text-red-500 text-xs font-bold">오류</span>;
};

const RightPanel = () => {
  const { logs, clearLogs, stepStatus, startTime, endTime, isRunning } = useDashboard();
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const scrollToBottom = () => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  };

  const completedCalls = logs.filter(l => 
    l.includes('DB 업데이트 완료') || l.includes('호출 중') || l.includes('성공') || l.includes('실패')
  ).length;

  let percent = 0;
  if (stepStatus.render === 'done') {
    percent = 100;
  } else if (stepStatus.trust === 'done') {
    percent = 90;
  } else if (stepStatus.scoring === 'done') {
    percent = 75;
  } else if (stepStatus.measurement === 'done') {
    percent = 60;
  } else if (stepStatus.measurement === 'running') {
    percent = Math.min(58, Math.max(20, 20 + Math.round(completedCalls * 1.5)));
  } else if (stepStatus.init === 'done') {
    percent = 15;
  } else if (isRunning) {
    percent = 5;
  }

  return (
    <div className="flex-1 min-w-0 bg-slate-100/70 h-full flex flex-col p-4 gap-3.5 overflow-hidden">
      
      {/* Top: Progress and Status Summary */}
      <div className="bg-white border border-slate-200/90 shadow-sm p-4 rounded-xl text-slate-800 shrink-0">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
            <Activity size={17} className="text-orange-500" />
            <span>실시간 진단 현황 및 프로그레스</span>
          </h3>
          <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
            <span>시작: <strong className="text-slate-700 font-mono">{startTime}</strong></span>
            <span>·</span>
            <span>종료: <strong className="text-slate-700 font-mono">{endTime}</strong></span>
          </div>
        </div>

        {/* 5단계 가로/그리드 스텝 표시 */}
        <div className="grid grid-cols-5 gap-2 text-xs">
          <div className="bg-slate-50 border border-slate-200/70 rounded-lg p-2 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700">1. 설정 로드</span>
              <StatusIcon status={stepStatus.init} />
            </div>
            <StatusText status={stepStatus.init} />
          </div>

          <div className="bg-slate-50 border border-slate-200/70 rounded-lg p-2 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700">2. 답변 수집</span>
              <StatusIcon status={stepStatus.measurement} />
            </div>
            <StatusText status={stepStatus.measurement} />
          </div>

          <div className="bg-slate-50 border border-slate-200/70 rounded-lg p-2 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700">3. 가시성 분석</span>
              <StatusIcon status={stepStatus.scoring} />
            </div>
            <StatusText status={stepStatus.scoring} />
          </div>

          <div className="bg-slate-50 border border-slate-200/70 rounded-lg p-2 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700">4. GEO 준비도</span>
              <StatusIcon status={stepStatus.trust} />
            </div>
            <StatusText status={stepStatus.trust} />
          </div>

          <div className="bg-slate-50 border border-slate-200/70 rounded-lg p-2 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700">5. PDF 렌더링</span>
              <StatusIcon status={stepStatus.render} />
            </div>
            <StatusText status={stepStatus.render} />
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-3.5 flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-xs font-bold">
            <span className="flex items-center gap-1.5">
              <span className={isRunning ? "text-orange-500 animate-pulse" : "text-emerald-600"}>
                {isRunning ? '◆ AI 모델 질의 및 실시간 수집 진행 중...' : percent === 100 ? '🎉 모든 진단 프로세스 완수!' : '◆ 준비 완료 / 대기 중'}
              </span>
            </span>
            <span className="text-slate-800 font-mono text-xs">{percent}%</span>
          </div>

          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden p-0.5 border border-slate-200">
            <div 
              className={`h-full rounded-full transition-all duration-300 ${
                percent === 100 
                  ? 'bg-gradient-to-r from-emerald-500 to-green-600' 
                  : 'bg-gradient-to-r from-orange-500 via-amber-500 to-emerald-500'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Bottom: Terminal / Dark Console Header & Container */}
      <div className="flex-1 min-h-0 bg-[#0D1117] rounded-xl shadow-lg border border-slate-800 flex flex-col overflow-hidden">
        
        {/* Terminal Header */}
        <div className="bg-[#161B22] px-4 py-2.5 border-b border-slate-800 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5 mr-2">
              <span className="w-3 h-3 rounded-full bg-[#FF5F56] inline-block" />
              <span className="w-3 h-3 rounded-full bg-[#FFBD2E] inline-block" />
              <span className="w-3 h-3 rounded-full bg-[#27C93F] inline-block" />
            </div>
            <Terminal size={14} className="text-slate-400" />
            <span className="text-xs font-mono font-bold text-slate-300">
              실시간 콘솔 로그 터미널
            </span>
            <span className="text-[11px] text-slate-500 font-mono">
              ({logs.length} 라인)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={scrollToBottom}
              className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-slate-200 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 transition-colors"
              title="맨 아래로 스크롤"
            >
              <ArrowDown size={12} />
              <span>하단 이동</span>
            </button>
            <button
              onClick={clearLogs}
              className="flex items-center gap-1 text-[11px] font-semibold text-red-400 hover:text-red-300 px-2 py-1 rounded bg-red-950/40 hover:bg-red-900/60 border border-red-800/40 transition-colors"
              title="로그 지우기"
            >
              <Trash2 size={12} />
              <span>로그 초기화</span>
            </button>
          </div>
        </div>

        {/* Terminal Content */}
        <div 
          ref={logContainerRef}
          className="flex-1 p-4 font-mono text-xs sm:text-sm text-slate-200 overflow-y-auto whitespace-pre-wrap leading-relaxed select-text"
        >
          {logs.length === 0 ? (
            <div className="text-slate-600 italic py-10 text-center">
              [시스템 대기 중] 'AI 가시성 진단 실행'을 클릭하면 실시간 진행 로그가 여기에 출력됩니다.
            </div>
          ) : (
            logs.map((log, i) => {
              let textColor = 'text-slate-300';
              if (log.includes('❌') || log.includes('오류') || log.includes('실패')) {
                textColor = 'text-red-400 font-bold';
              } else if (log.includes('🎉') || log.includes('완료') || log.includes('성공')) {
                textColor = 'text-emerald-400 font-semibold';
              } else if (log.includes('⚠')) {
                textColor = 'text-amber-400 font-semibold';
              } else if (log.includes('[진단 수집 시작]') || log.includes('호출 중')) {
                textColor = 'text-sky-300';
              }

              return (
                <div key={i} className={`${textColor} py-0.5 hover:bg-slate-800/50 px-1 rounded`}>
                  {log}
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
};

export default RightPanel;
