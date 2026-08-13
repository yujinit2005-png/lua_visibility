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
import packageJson from '../../../package.json';
import { supabase } from '../../lib/supabase';

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

const LeftPanel = () => {
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
    appendLog, clearLogs, setStepStatus, setStartTime,
    abortController
  } = useDashboard();

  const [isIframeOpen, setIsIframeOpen] = useState(false);
  const [iframeUrl, _setIframeUrl] = useState('');
  
  const [isRunModalOpen, setIsRunModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState<'rerun' | 'web' | 'pdf' | null>(null);
  const [modalTitle, setModalTitle] = useState('');
  
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const [isRerunModalOpen, setIsRerunModalOpen] = useState(false);
  const [isWebVerifModalOpen, setIsWebVerifModalOpen] = useState(false);
  const [isHospMgmtOpen, setIsHospMgmtOpen] = useState(false);
  
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
        // Find active version or fallback to the most recent (highest ID)
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
      alert("선택된 버전에 질문 세트(queries)가 등록되어 있지 않습니다. 병원 정보 설정을 확인하세요.");
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
      if (err.message === 'ABORTED') {
        appendLog(`\n⚠ 측정이 사용자에 의해 중단되었습니다.`);
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
  };

  const openRunModal = async (action: 'rerun' | 'web' | 'pdf', title: string) => {
    if (!hospitalCode) {
      alert("대상 병원을 먼저 선택해 주세요.");
      return;
    }
    setModalAction(action);
    setModalTitle(title);

    try {
      const { data: latestRun } = await supabase
        .from('runs')
        .select('id')
        .eq('hospital_code', hospitalCode)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestRun) {
        setActiveRunId(latestRun.id);
        if (action === 'rerun') {
          setIsRerunModalOpen(true);
          return;
        } else if (action === 'web') {
          setIsWebVerifModalOpen(true);
          return;
        } else if (action === 'pdf') {
          handleSelectRunFromModal(latestRun.id);
          return;
        }
      }
    } catch (e) {
      // fallback
    }

    setIsRunModalOpen(true);
  };

  const handleSelectRunFromModal = async (selectedRunId: number) => {
    setActiveRunId(selectedRunId);
    if (modalAction === 'rerun') {
      setIsRerunModalOpen(true);
    } else if (modalAction === 'web') {
      setIsWebVerifModalOpen(true);
    } else if (modalAction === 'pdf') {
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
    }
  };

  return (
    <>
      <RunSelectionModal
        isOpen={isRunModalOpen}
        onClose={() => setIsRunModalOpen(false)}
        hospitalCode={hospitalCode}
        title={modalTitle}
        onSelectRun={handleSelectRunFromModal}
      />
      <RerunModal
        isOpen={isRerunModalOpen}
        onClose={() => setIsRerunModalOpen(false)}
        runId={activeRunId || 0}
        hospitalCode={hospitalCode}
        hospitalName={hospitals.find(h => h.hospital_code === hospitalCode)?.name || '병원'}
        onChangeRun={() => {
          setIsRerunModalOpen(false);
          setIsRunModalOpen(true);
        }}
      />
      <WebVerificationModal
        isOpen={isWebVerifModalOpen}
        onClose={() => setIsWebVerifModalOpen(false)}
        runId={activeRunId || 0}
        hospitalCode={hospitalCode}
        hospitalName={hospitals.find(h => h.hospital_code === hospitalCode)?.name || '병원'}
        onChangeRun={() => {
          setIsWebVerifModalOpen(false);
          setIsRunModalOpen(true);
        }}
      />
      <HospitalManagementModal
        isOpen={isHospMgmtOpen}
        onClose={() => setIsHospMgmtOpen(false)}
        onRefreshHospitals={() => {
          // Re-fetch hospital list when modal saves or deletes
          window.location.reload();
        }}
      />
      <IframeModal 
        isOpen={isIframeOpen} 
        onClose={() => setIsIframeOpen(false)} 
        url={iframeUrl} 
        title="🌐 웹 UI 실측 및 교차 비교 (내부 브라우저)" 
      />
      <div className="w-[60%] min-w-[650px] bg-white h-full overflow-y-auto flex flex-col shadow-sm border-r border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b-4 border-orange-500">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-500 text-white font-bold italic flex items-center justify-center text-xl rounded-sm">
              lCA
            </div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              루비스 (LUVIS)
              <span className="text-sm font-bold text-white bg-orange-500 px-2.5 py-0.5 rounded-full shadow-sm ml-1">v{packageJson.version}</span>
            </h1>
          </div>
          <span className="text-gray-500 text-sm font-semibold">루아컴퍼니</span>
        </div>

        <div className="p-6 space-y-5 flex-1 text-slate-800 text-sm font-medium">
          {/* 진단 유형 */}
          <div>
            <h3 className="font-bold text-slate-800 mb-2">진단 유형</h3>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={diagnosticType === 'free'} onChange={() => setDiagnosticType('free')} className="w-4 h-4 text-orange-500 focus:ring-orange-500 accent-orange-500" />
                <span>무료 AI 진단</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={diagnosticType === 'premium'} onChange={() => setDiagnosticType('premium')} className="w-4 h-4 text-orange-500 focus:ring-orange-500 accent-orange-500" />
                <span>정밀 AI 리포트</span>
              </label>
            </div>
          </div>

          {/* AI 진단 도구 선택 */}
          <div>
            <h3 className="font-bold text-slate-800 mb-2">AI 진단 도구 선택</h3>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={aiTools.openai} onChange={e => setAiTools({...aiTools, openai: e.target.checked})} className="rounded text-orange-500 focus:ring-orange-500 accent-orange-500" />
                <span>OpenAI (ChatGPT)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={aiTools.gemini} onChange={e => setAiTools({...aiTools, gemini: e.target.checked})} className="rounded text-orange-500 focus:ring-orange-500 accent-orange-500" />
                <span>Google Gemini</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={aiTools.perplexity} onChange={e => setAiTools({...aiTools, perplexity: e.target.checked})} className="rounded text-orange-500 focus:ring-orange-500 accent-orange-500" />
                <span>Perplexity</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={aiTools.naver} onChange={e => setAiTools({...aiTools, naver: e.target.checked})} className="rounded text-orange-500 focus:ring-orange-500 accent-orange-500" />
                <span>Naver API</span>
              </label>
              <label className="flex items-center gap-2 cursor-not-allowed opacity-50" title="현재 비활성화됨">
                <input type="checkbox" checked={false} disabled className="rounded text-gray-400 accent-gray-400 cursor-not-allowed" />
                <span className="text-gray-400 line-through">Anthropic (Claude)</span>
              </label>
            </div>
          </div>

          {/* 횟수 및 시간 */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-800">진단 횟수:</span>
              <select value={reps} onChange={e => setReps(Number(e.target.value))} className="border border-gray-300 rounded px-2 py-1 text-sm bg-white focus:border-orange-500" disabled={diagnosticType === 'free'}>
                <option value={1}>1회</option>
                <option value={2}>2회</option>
                <option value={3}>3회</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-800">1회당 제한시간(초):</span>
              <input type="number" value={timeLimit} onChange={e => setTimeLimit(Number(e.target.value))} className="border border-gray-300 rounded px-2 py-1 w-20 text-sm outline-none focus:border-orange-500" />
            </div>
          </div>

          {/* 분석 옵션 */}
          <div>
            <h3 className="font-bold text-slate-800 mb-2">분석 옵션</h3>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={options.aeo} onChange={e => setOptions({...options, aeo: e.target.checked})} className="rounded text-orange-500 accent-orange-500" />
                <span>AEO 노출</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={options.geo} onChange={e => setOptions({...options, geo: e.target.checked})} className="rounded text-orange-500 accent-orange-500" />
                <span>GEO 준비도</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={options.competitor} onChange={e => setOptions({...options, competitor: e.target.checked})} className="rounded text-orange-500 accent-orange-500" />
                <span>경쟁병원</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={options.trust} onChange={e => setOptions({...options, trust: e.target.checked})} className="rounded text-orange-500 accent-orange-500" />
                <span>Trust Signal</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={options.glossary} onChange={e => setOptions({...options, glossary: e.target.checked})} className="rounded text-orange-500 accent-orange-500" />
                <span>용어 설명</span>
              </label>
            </div>
          </div>

          {/* 대상 병원 & 질문 세트 선택 */}
          <div className="flex gap-4">
            <div className="flex-1 flex flex-col gap-1">
              <label className="font-bold text-slate-800">대상 병원 선택</label>
              <select value={hospitalCode} onChange={e => setHospitalCode(e.target.value)} className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full bg-white outline-none focus:border-orange-500">
                {hospitals.map(h => (
                  <option key={h.hospital_code} value={h.hospital_code}>
                    [{h.hospital_code}] {h.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <label className="font-bold text-slate-800">질문 세트 버전 선택</label>
              <select value={version} onChange={e => setVersion(e.target.value)} className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full bg-white outline-none focus:border-orange-500">
                {versions.map(v => (
                  <option key={v.version} value={v.version}>
                    {v.version} {v.is_active === 1 ? '(활성/최신)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Input Fields (가로 배열) */}
          <div className="flex gap-4">
            <div className="flex-1 flex flex-col gap-1">
              <label className="font-bold text-slate-800 text-sm">병원 홈페이지 URL <span className="font-normal text-gray-500 text-xs">(Trust점검용)</span></label>
              <input type="text" value={hospitalUrl} onChange={e => setHospitalUrl(e.target.value)} className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full outline-none focus:border-orange-500" />
            </div>

            <div className="flex-1 flex flex-col gap-1">
              <label className="font-bold text-slate-800 text-sm">저장할 PDF 이름</label>
              <input type="text" value={pdfName} onChange={e => setPdfName(e.target.value)} className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full outline-none focus:border-orange-500" />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2.5 mt-2">
            {/* 1행: 진단실행 + 영업용 PDF + 측정중단 */}
            <div className="flex gap-2">
              <button onClick={handleRunDiagnosis} disabled={isRunning} className={`flex-[1.5] text-white font-bold py-2.5 px-2 rounded shadow-sm transition-colors flex items-center justify-center gap-1.5 text-[14px] ${isRunning ? 'bg-gray-400' : 'bg-[#EB5B25] hover:bg-[#D64E1C]'}`}>
                <span>🚀</span> {isRunning ? '진단 중...' : 'AI 가시성 진단 실행'}
              </button>
              
              <button onClick={() => openRunModal('pdf', '영업용 PDF 생성')} disabled={isRunning} className="flex-[1.2] bg-[#248EAA] hover:bg-[#1C738A] text-white font-bold py-2.5 px-2 rounded shadow-sm transition-colors flex items-center justify-center gap-1.5 text-[13px]">
                <span>📄</span> 영업용 진단 PDF 생성
              </button>
              
              <button onClick={handleStop} disabled={!isRunning} className={`text-white font-bold py-2.5 px-3 rounded shadow-sm transition-colors text-[13px] ${!isRunning ? 'bg-gray-300' : 'bg-red-500 hover:bg-red-600'}`}>
                측정 중단
              </button>
            </div>
            
            {/* 2행: 진단 재실행 + 웹 교차비교 */}
            <div className="flex gap-2">
              <button onClick={() => openRunModal('rerun', '진단 재실행')} disabled={isRunning} className="flex-1 bg-[#8B3DFF] hover:bg-[#722CEB] text-white font-bold py-2 px-2 rounded shadow-sm transition-colors flex items-center justify-center gap-1.5 text-[13px]">
                <span>🔄</span> AI 가시성 진단 재실행
              </button>
              
              <button onClick={() => openRunModal('web', '웹 UI 실측')} disabled={isRunning} className="flex-1 bg-[#189B72] hover:bg-[#137A5A] text-white font-bold py-2 px-2 rounded shadow-sm transition-colors flex items-center justify-center gap-1.5 text-[13px]">
                <span>🌐</span> 웹 UI 실측 및 교차 비교
              </button>
            </div>
            
            <button onClick={() => setIsHospMgmtOpen(true)} disabled={isRunning} className="w-full bg-[#1A365D] hover:bg-[#122642] text-white font-bold py-2 px-4 rounded shadow-sm transition-colors flex items-center justify-center gap-2 text-[13px]">
              <span>⚙️</span> 병원 정보 & 질문세트 관리
            </button>
          </div>

          {/* API 키 (하단 배치) */}
          <div className="mt-4 pt-4 border-t border-gray-200">
            <h3 className="font-bold text-slate-800 mb-2">API 키 (실측 시 필요)</h3>
            <div className="space-y-2.5">
              <div className="flex items-center">
                <span className="w-32 text-gray-500 text-xs font-semibold">OpenAI (ChatGPT)</span>
                <input type="password" value={apiKeys.openai} onChange={e => setApiKeys({...apiKeys, openai: e.target.value})} className="flex-1 border-b border-gray-300 px-2 py-0.5 text-sm bg-transparent outline-none border-dotted focus:border-solid focus:border-orange-500 tracking-[0.2em]" />
              </div>
              <div className="flex items-center">
                <span className="w-32 text-gray-500 text-xs font-semibold">Google Gemini</span>
                <input type="password" value={apiKeys.gemini} onChange={e => setApiKeys({...apiKeys, gemini: e.target.value})} className="flex-1 border-b border-gray-300 px-2 py-0.5 text-sm bg-transparent outline-none border-dotted focus:border-solid focus:border-orange-500 tracking-[0.2em]" />
              </div>
              <div className="flex items-center">
                <span className="w-32 text-gray-500 text-xs font-semibold">Perplexity</span>
                <input type="password" value={apiKeys.perplexity} onChange={e => setApiKeys({...apiKeys, perplexity: e.target.value})} className="flex-1 border-b border-gray-300 px-2 py-0.5 text-sm bg-transparent outline-none border-dotted focus:border-solid focus:border-orange-500 tracking-[0.2em]" />
              </div>
              <div className="flex items-center">
                <span className="w-32 text-gray-500 text-xs font-semibold">Naver Client ID</span>
                <input type="password" value={apiKeys.naverId} onChange={e => setApiKeys({...apiKeys, naverId: e.target.value})} className="flex-1 border-b border-gray-300 px-2 py-0.5 text-sm bg-transparent outline-none border-dotted focus:border-solid focus:border-orange-500 tracking-[0.2em]" />
              </div>
              <div className="flex items-center">
                <span className="w-32 text-gray-500 text-xs font-semibold">Naver Secret</span>
                <input type="password" value={apiKeys.naverSecret} onChange={e => setApiKeys({...apiKeys, naverSecret: e.target.value})} className="flex-1 border-b border-gray-300 px-2 py-0.5 text-sm bg-transparent outline-none border-dotted focus:border-solid focus:border-orange-500 tracking-[0.2em]" />
              </div>
              <div className="flex items-center opacity-50">
                <span className="w-32 text-gray-400 text-xs font-semibold">Anthropic (Claude)</span>
                <input type="password" disabled value={apiKeys.anthropic} placeholder="(비활성화됨)" className="flex-1 border-b border-gray-300 px-2 py-0.5 text-sm bg-transparent outline-none border-dotted tracking-[0.2em] cursor-not-allowed" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default LeftPanel;
