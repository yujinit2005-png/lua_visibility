import { useEffect, useRef } from 'react';
import { useDashboard } from '../../contexts/DashboardContext';

const StatusIcon = ({ status }: { status: 'pending' | 'running' | 'done' | 'error' }) => {
  if (status === 'pending') return <span className="w-3 h-3 rounded-full border border-gray-400"></span>;
  if (status === 'running') return <span className="w-3 h-3 rounded-full border-2 border-orange-500 border-t-transparent animate-spin"></span>;
  if (status === 'done') return <span className="w-3 h-3 rounded-full bg-green-500"></span>;
  return <span className="w-3 h-3 rounded-full bg-red-500"></span>;
};

const StatusText = ({ status }: { status: 'pending' | 'running' | 'done' | 'error' }) => {
  if (status === 'pending') return <span>대기</span>;
  if (status === 'running') return <span className="text-orange-500">진행중</span>;
  if (status === 'done') return <span className="text-green-500">완료</span>;
  return <span className="text-red-500">오류</span>;
};

const RightPanel = () => {
  const { logs, stepStatus, startTime, endTime, isRunning } = useDashboard();
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // 프로그레스 퍼센티지 및 수집 건수 계산
  let doneCount = 0;
  if (stepStatus.init === 'done') doneCount++;
  if (stepStatus.measurement === 'done') doneCount++;
  if (stepStatus.scoring === 'done') doneCount++;
  if (stepStatus.trust === 'done') doneCount++;
  if (stepStatus.render === 'done') doneCount++;

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
    <div className="flex-1 bg-[#F7F9FA] h-full flex flex-col p-4 gap-4">
      
      {/* Top: Progress and Status */}
      <div className="bg-white border border-gray-200 shadow-sm p-4 text-sm font-medium text-slate-800 rounded">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <span className="text-blue-900">📊</span> 실시간 진단 현황 및 로그
          </h3>
          <span className="text-gray-500 text-xs">시작: {startTime} | 종료: {endTime}</span>
        </div>

        <div className="space-y-1.5 ml-1">
          <div className="flex justify-between items-center text-gray-500">
            <div className="flex items-center gap-2">
              <StatusIcon status={stepStatus.init} />
              <StatusText status={stepStatus.init} />
              <span className="ml-2">1. 설정 로드 및 API 준비</span>
            </div>
          </div>
          <div className="flex justify-between items-center text-gray-500">
            <div className="flex items-center gap-2">
              <StatusIcon status={stepStatus.measurement} />
              <StatusText status={stepStatus.measurement} />
              <span className="ml-2">2. AI 가시성 N회 측정 (답변 수집)</span>
            </div>
          </div>
          <div className="flex justify-between items-center text-gray-500">
            <div className="flex items-center gap-2">
              <StatusIcon status={stepStatus.scoring} />
              <StatusText status={stepStatus.scoring} />
              <span className="ml-2">3. 언급률/추천률 및 기회 지도 분석</span>
            </div>
          </div>
          <div className="flex justify-between items-center text-gray-500">
            <div className="flex items-center gap-2">
              <StatusIcon status={stepStatus.trust} />
              <StatusText status={stepStatus.trust} />
              <span className="ml-2">4. Trust Signal 기술 점검 (GEO 준비도)</span>
            </div>
          </div>
          <div className="flex justify-between items-center text-gray-500">
            <div className="flex items-center gap-2">
              <StatusIcon status={stepStatus.render} />
              <StatusText status={stepStatus.render} />
              <span className="ml-2">5. 영업용 진단 PDF 렌더링</span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar Section (메인 프로그레스 바) */}
      <div className="bg-white border border-gray-200 shadow-sm p-3 rounded flex flex-col gap-2">
        <div className="flex justify-between items-center text-xs font-bold">
          <span className="flex items-center gap-1.5 text-slate-700">
            <span className={isRunning ? "text-orange-500 animate-pulse" : "text-green-600"}>
              {isRunning ? '◆ 진단 프로세스 진행 중...' : percent === 100 ? '🎉 모든 진단 프로세스 완료!' : '◆ 대기 중'}
            </span>
          </span>
          <span className="text-slate-800 font-mono text-sm">{percent}%</span>
        </div>

        {/* 바 컨테이너 */}
        <div className="w-full bg-gray-200 rounded-full h-3.5 overflow-hidden p-0.5 border border-gray-300">
          <div 
            className={`h-full rounded-full transition-all duration-300 ${
              percent === 100 
                ? 'bg-gradient-to-r from-emerald-500 to-green-600' 
                : 'bg-gradient-to-r from-orange-500 via-amber-500 to-green-500 animate-pulse'
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Bottom: Terminal / Console */}
      <div 
        ref={logContainerRef}
        className="flex-1 bg-[#0D1117] rounded shadow-inner border border-gray-700 p-4 font-mono text-sm text-gray-300 overflow-y-auto whitespace-pre-wrap leading-relaxed"
      >
        {logs.length === 0 ? (
          <span className="text-gray-600 italic">로그가 여기에 표시됩니다...</span>
        ) : (
          logs.map((log, i) => (
            <div key={i}>{log}</div>
          ))
        )}
      </div>

    </div>
  );
};

export default RightPanel;
