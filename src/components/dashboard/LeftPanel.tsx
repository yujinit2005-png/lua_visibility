import { useState, useEffect } from 'react';
import { useDashboard } from '../../contexts/DashboardContext';
import IframeModal from './IframeModal';
import RunSelectionModal from './RunSelectionModal';
import RerunModal from './RerunModal';
import WebVerificationModal from './WebVerificationModal';
import HospitalManagementModal from './HospitalManagementModal';
import { executeRun } from '../../lib/analyzer';
import { useHospitals } from '../../hooks/useHospitals';
import { generateAndUploadReport } from '../../lib/reportGenerator';
import { Sliders, Sparkles, FileText, Square } from 'lucide-react';

const parseQueries = (raw: any): string[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
    }
    return trimmed.split('\n').map(s => s.trim()).filter(s => s.length > 0);
  }
  return [];
};

interface LeftPanelProps {
  isRerunOpen?: boolean;
  setIsRerunOpen?: (val: boolean) => void;
  isWebVerifOpen?: boolean;
  setIsWebVerifOpen?: (val: boolean) => void;
  isHospMgmtOpen?: boolean;
  setIsHospMgmtOpen?: (val: boolean) => void;
}

const LeftPanel: React.FC<LeftPanelProps> = ({
  isRerunOpen: propIsRerunOpen,
  setIsRerunOpen: propSetIsRerunOpen,
  isWebVerifOpen: propIsWebVerifOpen,
  setIsWebVerifOpen: propSetIsWebVerifOpen,
  isHospMgmtOpen: propIsHospMgmtOpen,
  setIsHospMgmtOpen: propSetIsHospMgmtOpen,
}) => {
  const {
    diagnosticType, setDiagnosticType,
    aiTools, setAiTools,
    options, setOptions,
    reps, setReps,
    timeLimit, setTimeLimit,
    hospitalCode, setHospitalCode,
    version, setVersion,
    hospitalUrl, setHospitalUrl,
    pdfName, setPdfName,
    apiKeys, setApiKeys,
    isRunning, setIsRunning,
    appendLog, clearLogs, setStepStatus, resetStepStatus, setStartTime,
    abortController
  } = useDashboard();

  const [isIframeOpen, setIsIframeOpen] = useState(false);
  const [iframeUrl, _setIframeUrl] = useState('');
  
  // PDF 생성용 회차 선택 모달
  const [isPdfRunModalOpen, setIsPdfRunModalOpen] = useState(false);
  
  // 내부 모달 상태 (props가 없을 때 fallback)
  const [localIsRerunOpen, setLocalIsRerunOpen] = useState(false);
  const [localIsWebVerifOpen, setLocalIsWebVerifOpen] = useState(false);
  const [localIsHospMgmtOpen, setLocalIsHospMgmtOpen] = useState(false);

  const isRerunModalOpen = propIsRerunOpen !== undefined ? propIsRerunOpen : localIsRerunOpen;
  const setIsRerunModalOpen = propSetIsRerunOpen || setLocalIsRerunOpen;

  const isWebVerifModalOpen = propIsWebVerifOpen !== undefined ? propIsWebVerifOpen : localIsWebVerifOpen;
  const setIsWebVerifModalOpen = propSetIsWebVerifOpen || setLocalIsWebVerifOpen;

  const isHospMgmtOpen = propIsHospMgmtOpen !== undefined ? propIsHospMgmtOpen : localIsHospMgmtOpen;
  const setIsHospMgmtOpen = propSetIsHospMgmtOpen || setLocalIsHospMgmtOpen;
  
  const { hospitals, versions, fetchVersionsForHospital } = useHospitals();
  const [currentQueries, setCurrentQueries] = useState<string[]>([]);

  // 1. Initial load or when hospitals list changes
  useEffect(() => {
    if (hospitals.length > 0 && (!hospitalCode || !hospitals.find(h => h.hospital_code === hospitalCode))) {
      setHospitalCode(hospitals[0].hospital_code);
    }
  }, [hospitals, hospitalCode, setHospitalCode]);

  // 2. When hospitalCode changes, fetch its versions and update details
  useEffect(() => {
    if (!hospitalCode) {
      setHospitalUrl('');
      setPdfName('');
      setVersion('');
      setCurrentQueries([]);
      return;
    }
    
    const hosp = hospitals.find(h => h.hospital_code === hospitalCode);
    if (hosp) {
      setHospitalUrl(hosp.homepage || '');
      setPdfName(`${hosp.name}_진단.pdf`);
    }

    fetchVersionsForHospital(hospitalCode).then((loadedVersions) => {
      if (loadedVersions && loadedVersions.length > 0) {
        let targetVersion = loadedVersions.find(v => v.is_active === 1);
        if (!targetVersion) targetVersion = loadedVersions[0];
        
        setVersion(targetVersion.version);
        setCurrentQueries(parseQueries(targetVersion.queries));
      } else {
        setVersion('');
        setCurrentQueries([]);
      }
    });
  }, [hospitalCode, hospitals]);

  // 3. When version dropdown changes manually
  useEffect(() => {
    const v = versions.find(v => v.version === version);
    if (v) {
      setCurrentQueries(parseQueries(v.queries));
    }
  }, [version, versions]);

  const handleRunDiagnosis = async () => {
    if (isRunning) return;
    
    // Check API Keys
    const activeTools: string[] = [];
    if (aiTools.openai) {
      if (!apiKeys.openai) { alert("OpenAI API 키가 필요합니다."); return; }
      activeTools.push('openai');
    }
    if (aiTools.gemini) {
      if (!apiKeys.gemini) { alert("Gemini API 키가 필요합니다."); return; }
      activeTools.push('gemini');
    }
    if (aiTools.perplexity) {
      if (!apiKeys.perplexity) { alert("Perplexity API 키가 필요합니다."); return; }
      activeTools.push('perplexity');
    }
    if (aiTools.naver) {
      if (!apiKeys.naverId || !apiKeys.naverSecret) { alert("Naver API 키(Client ID & Secret)가 필요합니다."); return; }
      activeTools.push('naver');
    }
    if (aiTools.anthropic) {
      if (!apiKeys.anthropic) { alert("Anthropic API 키가 필요합니다."); return; }
      activeTools.push('anthropic');
    }

    if (activeTools.length === 0) {
      alert("진단에 사용할 AI 도구를 최소 1개 이상 선택하세요.");
      return;
    }

    if (currentQueries.length === 0) {
      alert("선택된 버전에 질문 세트(queries)가 등록되어 있지 않습니다. 상단 [병원정보 질문세트관리]를 확인하세요.");
      return;
    }

    setIsRunning(true);
    clearLogs();
    abortController.current = new AbortController();
    const signal = abortController.current.signal;
    const now = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    setStartTime(now);

    appendLog(`[진단 수집 시작] 선택된 모델: ${activeTools.join(', ')}`);
    setStepStatus('init', 'running');

    try {
      await new Promise(r => setTimeout(r, 500));
      appendLog("1. 설정 로드 및 API 준비 완료.");
      setStepStatus('init', 'done');
      
      const hospObj = hospitals.find(h => h.hospital_code === hospitalCode);
      await executeRun({
        hospitalCode,
        hospitalName: hospObj ? hospObj.name : hospitalCode,
        version,
        aiTools: activeTools,
        options,
        apiKeys,
        appendLog,
        setStepStatus,
        queries: currentQueries,
        reps,
        signal
      });
      
    } catch (err: any) {
      if (err.message === 'ABORTED' || signal.aborted) {
        appendLog(`\n⚠ 측정이 사용자에 의해 중단되어 실시간 진단 현황이 초기화되었습니다.`);
        resetStepStatus();
      } else {
        appendLog(`❌ 오류 발생: ${err.message}`);
      }
    } finally {
      setIsRunning(false);
      abortController.current = null;
      appendLog("\n진단 프로세스 종료.");
    }
  };

  const handleStop = () => {
    if (abortController.current) {
      abortController.current.abort();
    }
    setIsRunning(false);
    resetStepStatus();
  };

  const handleSelectRunForPdf = async (selectedRunId: number) => {
    if (isRunning) return;
    setIsRunning(true);
    clearLogs();
    setStepStatus('render', 'running');
    try {
      const hosp = hospitals.find(h => h.hospital_code === hospitalCode);
      const hName = hosp ? hosp.name : 'Unknown';
      await generateAndUploadReport(hospitalCode, hName, appendLog, selectedRunId, 'Report');
      setStepStatus('render', 'done');
    } catch (err: any) {
      appendLog(`❌ PDF 생성 오류: ${err.message}`);
      setStepStatus('render', 'error');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <>
      <RunSelectionModal
        isOpen={isPdfRunModalOpen}
        onClose={() => setIsPdfRunModalOpen(false)}
        hospitalCode={hospitalCode}
        title="영업용 PDF 생성"
        onSelectRun={handleSelectRunForPdf}
      />
      <RerunModal
        isOpen={isRerunModalOpen}
        onClose={() => setIsRerunModalOpen(false)}
        hospitalCode={hospitalCode}
        hospitalName={hospitals.find(h => h.hospital_code === hospitalCode)?.name || '병원'}
      />
      <WebVerificationModal
        isOpen={isWebVerifModalOpen}
        onClose={() => setIsWebVerifModalOpen(false)}
        hospitalCode={hospitalCode}
        hospitalName={hospitals.find(h => h.hospital_code === hospitalCode)?.name || '병원'}
      />
      <HospitalManagementModal
        isOpen={isHospMgmtOpen}
        onClose={() => setIsHospMgmtOpen(false)}
        onRefreshHospitals={() => {
          window.location.reload();
        }}
      />
      <IframeModal 
        isOpen={isIframeOpen} 
        onClose={() => setIsIframeOpen(false)} 
        url={iframeUrl} 
        title="🌐 웹 UI 실측 및 교차 비교 (내부 브라우저)" 
      />
      
      {/* Slim Left Panel Container */}
      <div className="w-[490px] lg:w-[510px] shrink-0 bg-white h-full overflow-y-auto flex flex-col shadow-sm border-r border-slate-200">
        
        {/* Section Header */}
        <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-800">
            <Sliders size={18} className="text-orange-500" />
            <h2 className="font-extrabold text-sm tracking-tight">AI 진단 파라미터 & 병원 설정</h2>
          </div>
          <span className="text-[11px] font-semibold text-slate-500 bg-slate-200/80 px-2 py-0.5 rounded-full">
            설정 제어
          </span>
        </div>

        <div className="p-5 space-y-4 flex-1 text-slate-800 text-sm font-medium">
          
          {/* 진단 유형 */}
          <div className="bg-slate-50/70 p-3 rounded-xl border border-slate-200/80">
            <h3 className="font-bold text-slate-800 text-xs mb-2 flex items-center gap-1.5">
              <span>📌</span> 진단 유형
            </h3>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold">
                <input type="radio" checked={diagnosticType === 'free'} onChange={() => setDiagnosticType('free')} className="w-4 h-4 text-orange-500 focus:ring-orange-500 accent-orange-500" />
                <span>무료 AI 진단</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold">
                <input type="radio" checked={diagnosticType === 'premium'} onChange={() => setDiagnosticType('premium')} className="w-4 h-4 text-orange-500 focus:ring-orange-500 accent-orange-500" />
                <span>정밀 AI 리포트</span>
              </label>
            </div>
          </div>

          {/* AI 진단 도구 선택 (3개씩 배열) */}
          <div className="bg-slate-50/70 p-3 rounded-xl border border-slate-200/80">
            <h3 className="font-bold text-slate-800 text-xs mb-2 flex items-center gap-1.5">
              <span>🤖</span> AI 진단 도구 선택
            </h3>
            <div className="grid grid-cols-3 gap-2 text-xs font-semibold">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={aiTools.openai} onChange={e => setAiTools({...aiTools, openai: e.target.checked})} className="rounded text-orange-500 focus:ring-orange-500 accent-orange-500" />
                <span className="truncate">OpenAI</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={aiTools.gemini} onChange={e => setAiTools({...aiTools, gemini: e.target.checked})} className="rounded text-orange-500 focus:ring-orange-500 accent-orange-500" />
                <span className="truncate">Gemini</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={aiTools.perplexity} onChange={e => setAiTools({...aiTools, perplexity: e.target.checked})} className="rounded text-orange-500 focus:ring-orange-500 accent-orange-500" />
                <span className="truncate">Perplexity</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={aiTools.naver} onChange={e => setAiTools({...aiTools, naver: e.target.checked})} className="rounded text-orange-500 focus:ring-orange-500 accent-orange-500" />
                <span className="truncate">Naver API</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-not-allowed opacity-40 col-span-2" title="현재 비활성화됨">
                <input type="checkbox" checked={false} disabled className="rounded text-gray-400 accent-gray-400 cursor-not-allowed" />
                <span className="text-gray-400 line-through truncate">Anthropic (Claude)</span>
              </label>
            </div>
          </div>

          {/* 횟수 및 시간 */}
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-slate-50/70 p-2.5 rounded-xl border border-slate-200/80 flex items-center justify-between">
              <span className="font-bold text-slate-800 text-xs">진단 횟수:</span>
              <select value={reps} onChange={e => setReps(Number(e.target.value))} className="border border-gray-300 rounded px-2 py-1 text-xs bg-white font-semibold outline-none focus:border-orange-500" disabled={diagnosticType === 'free'}>
                <option value={1}>1회</option>
                <option value={2}>2회</option>
                <option value={3}>3회</option>
              </select>
            </div>
            <div className="flex-1 bg-slate-50/70 p-2.5 rounded-xl border border-slate-200/80 flex items-center justify-between">
              <span className="font-bold text-slate-800 text-xs">제한시간(초):</span>
              <input type="number" value={timeLimit} onChange={e => setTimeLimit(Number(e.target.value))} className="border border-gray-300 rounded px-2 py-1 w-16 text-xs text-right font-semibold bg-white outline-none focus:border-orange-500" />
            </div>
          </div>

          {/* 분석 옵션 */}
          <div className="bg-slate-50/70 p-3 rounded-xl border border-slate-200/80">
            <h3 className="font-bold text-slate-800 text-xs mb-2 flex items-center gap-1.5">
              <span>📊</span> 분석 옵션
            </h3>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={options.aeo} onChange={e => setOptions({...options, aeo: e.target.checked})} className="rounded text-orange-500 accent-orange-500" />
                <span>AEO 노출</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={options.geo} onChange={e => setOptions({...options, geo: e.target.checked})} className="rounded text-orange-500 accent-orange-500" />
                <span>GEO 준비도</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={options.competitor} onChange={e => setOptions({...options, competitor: e.target.checked})} className="rounded text-orange-500 accent-orange-500" />
                <span>경쟁병원</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={options.trust} onChange={e => setOptions({...options, trust: e.target.checked})} className="rounded text-orange-500 accent-orange-500" />
                <span>Trust Signal</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={options.glossary} onChange={e => setOptions({...options, glossary: e.target.checked})} className="rounded text-orange-500 accent-orange-500" />
                <span>용어 설명</span>
              </label>
            </div>
          </div>

          {/* 대상 병원 & 질문 세트 선택 (가로 배열) */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="flex flex-col gap-1">
              <label className="font-bold text-slate-800 text-xs flex items-center gap-1">
                <span>🏥</span> 대상 병원 선택
              </label>
              <select value={hospitalCode} onChange={e => setHospitalCode(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-semibold w-full bg-white outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500">
                {hospitals.map(h => (
                  <option key={h.hospital_code} value={h.hospital_code}>
                    [{h.hospital_code}] {h.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-bold text-slate-800 text-xs flex items-center gap-1">
                <span>📝</span> 질문 세트 버전
              </label>
              <select value={version} onChange={e => setVersion(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-semibold w-full bg-white outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500">
                {versions.map(v => (
                  <option key={v.version} value={v.version}>
                    {v.version} {v.is_active === 1 ? '(활성)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* URL & PDF 이름 */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="flex flex-col gap-1">
              <label className="font-bold text-slate-700 text-xs">병원 URL</label>
              <input type="text" value={hospitalUrl} onChange={e => setHospitalUrl(e.target.value)} className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs w-full outline-none focus:border-orange-500" placeholder="https://" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-bold text-slate-700 text-xs">저장할 PDF 명</label>
              <input type="text" value={pdfName} onChange={e => setPdfName(e.target.value)} className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs w-full outline-none focus:border-orange-500" />
            </div>
          </div>

          {/* Action Buttons (진단 실행 + 영업용 PDF + 측정 중단만 유지) */}
          <div className="space-y-2 pt-1">
            
            {/* 1행: 메인 진단 실행 + 측정 중단 */}
            <div className="flex gap-2">
              <button 
                onClick={handleRunDiagnosis} 
                disabled={isRunning} 
                className={`flex-1 text-white font-bold py-2.5 px-3 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-sm ${
                  isRunning 
                    ? 'bg-slate-400 cursor-not-allowed' 
                    : 'bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 active:scale-[0.98]'
                }`}
              >
                <Sparkles size={16} />
                <span>{isRunning ? 'AI 가시성 진단 중...' : 'AI 가시성 진단 실행'}</span>
              </button>
              
              <button 
                onClick={handleStop} 
                disabled={!isRunning} 
                className={`font-bold py-2.5 px-3 rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 text-xs ${
                  !isRunning 
                    ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed' 
                    : 'bg-red-500 hover:bg-red-600 text-white active:scale-[0.98]'
                }`}
              >
                <Square size={14} />
                <span>중단</span>
              </button>
            </div>

            {/* 2행: 영업용 PDF 생성 */}
            <button 
              onClick={() => {
                if (!hospitalCode) return alert("대상 병원을 먼저 선택해 주세요.");
                setIsPdfRunModalOpen(true);
              }} 
              disabled={isRunning} 
              className="w-full bg-[#248EAA] hover:bg-[#1C738A] text-white font-bold py-2 px-3 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 text-xs active:scale-[0.99]"
            >
              <FileText size={15} />
              <span>영업용 진단 PDF 생성</span>
            </button>

          </div>

          {/* API 키 (상단으로 정돈 배치) */}
          <div className="mt-2 pt-2.5 border-t border-slate-200">
            <h3 className="font-bold text-slate-800 text-xs mb-2 flex items-center justify-between">
              <span>🔑 API 키 설정 (실측 시 필요)</span>
              <span className="text-[10px] text-slate-400 font-normal">자동 저장/연동됨</span>
            </h3>
            <div className="space-y-1.5">
              <div className="flex items-center">
                <span className="w-28 text-slate-500 text-[11px] font-semibold">OpenAI (ChatGPT)</span>
                <input type="password" value={apiKeys.openai} onChange={e => setApiKeys({...apiKeys, openai: e.target.value})} className="flex-1 border-b border-slate-300 px-2 py-0.5 text-xs bg-transparent outline-none border-dotted focus:border-solid focus:border-orange-500 tracking-[0.2em]" />
              </div>
              <div className="flex items-center">
                <span className="w-28 text-slate-500 text-[11px] font-semibold">Google Gemini</span>
                <input type="password" value={apiKeys.gemini} onChange={e => setApiKeys({...apiKeys, gemini: e.target.value})} className="flex-1 border-b border-slate-300 px-2 py-0.5 text-xs bg-transparent outline-none border-dotted focus:border-solid focus:border-orange-500 tracking-[0.2em]" />
              </div>
              <div className="flex items-center">
                <span className="w-28 text-slate-500 text-[11px] font-semibold">Perplexity</span>
                <input type="password" value={apiKeys.perplexity} onChange={e => setApiKeys({...apiKeys, perplexity: e.target.value})} className="flex-1 border-b border-slate-300 px-2 py-0.5 text-xs bg-transparent outline-none border-dotted focus:border-solid focus:border-orange-500 tracking-[0.2em]" />
              </div>
              <div className="flex items-center">
                <span className="w-28 text-slate-500 text-[11px] font-semibold">Naver Client ID</span>
                <input type="password" value={apiKeys.naverId} onChange={e => setApiKeys({...apiKeys, naverId: e.target.value})} className="flex-1 border-b border-slate-300 px-2 py-0.5 text-xs bg-transparent outline-none border-dotted focus:border-solid focus:border-orange-500 tracking-[0.2em]" />
              </div>
              <div className="flex items-center">
                <span className="w-28 text-slate-500 text-[11px] font-semibold">Naver Secret</span>
                <input type="password" value={apiKeys.naverSecret} onChange={e => setApiKeys({...apiKeys, naverSecret: e.target.value})} className="flex-1 border-b border-slate-300 px-2 py-0.5 text-xs bg-transparent outline-none border-dotted focus:border-solid focus:border-orange-500 tracking-[0.2em]" />
              </div>
              <div className="flex items-center opacity-40">
                <span className="w-28 text-slate-400 text-[11px] font-semibold">Claude</span>
                <input type="password" disabled value={apiKeys.anthropic} placeholder="(비활성화됨)" className="flex-1 border-b border-slate-300 px-2 py-0.5 text-xs bg-transparent outline-none border-dotted tracking-[0.2em] cursor-not-allowed" />
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
};

export default LeftPanel;
