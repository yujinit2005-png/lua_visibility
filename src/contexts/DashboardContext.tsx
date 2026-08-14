import { createContext, useContext, useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../lib/supabase';

type StepStatus = 'pending' | 'running' | 'done' | 'error';

export interface DashboardState {
  diagnosticType: string;
  setDiagnosticType: (val: string) => void;
  aiTools: { openai: boolean; gemini: boolean; perplexity: boolean; naver: boolean; anthropic: boolean };
  setAiTools: (val: any) => void;
  options: { aeo: boolean; geo: boolean; competitor: boolean; trust: boolean; glossary: boolean };
  setOptions: (val: any) => void;
  reps: number;
  setReps: (val: number) => void;
  timeLimit: number;
  setTimeLimit: (val: number) => void;
  hospitalCode: string;
  setHospitalCode: (val: string) => void;
  version: string;
  setVersion: (val: string) => void;
  hospitalUrl: string;
  setHospitalUrl: (val: string) => void;
  pdfName: string;
  setPdfName: (val: string) => void;
  apiKeys: { openai: string; gemini: string; perplexity: string; naverId: string; naverSecret: string; anthropic: string };
  setApiKeys: (val: any) => void;
  
  // Right Panel state
  logs: string[];
  appendLog: (log: string) => void;
  clearLogs: () => void;
  
  stepStatus: {
    init: StepStatus;
    measurement: StepStatus;
    scoring: StepStatus;
    trust: StepStatus;
    render: StepStatus;
  };
  setStepStatus: (step: string, status: StepStatus) => void;
  resetStepStatus: () => void;
  
  startTime: string;
  setStartTime: (val: string) => void;
  endTime: string;
  setEndTime: (val: string) => void;
  
  isRunning: boolean;
  setIsRunning: (val: boolean) => void;

  abortController: React.MutableRefObject<AbortController | null>;
}

const DashboardContext = createContext<DashboardState | undefined>(undefined);

export const DashboardProvider = ({ children }: { children: ReactNode }) => {
  const [diagnosticType, setDiagnosticType] = useState('free');
  const [aiTools, setAiTools] = useState({ openai: true, gemini: true, perplexity: true, naver: true, anthropic: false });
  const [options, setOptions] = useState({ aeo: true,    geo: true,
    competitor: true,
    trust: true,
    glossary: true
  });
  const [reps, setReps] = useState(1);
  const [timeLimit, setTimeLimit] = useState(1000);
  const [hospitalCode, setHospitalCode] = useState('');
  const [version, setVersion] = useState('');
  const [hospitalUrl, setHospitalUrl] = useState('');
  const [pdfName, setPdfName] = useState('');
  const ENV_DEFAULT_KEYS = { 
    openai: import.meta.env.OPENAI_API_KEY || import.meta.env.VITE_OPENAI_API_KEY || '', 
    gemini: import.meta.env.GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || '', 
    perplexity: import.meta.env.PERPLEXITY_API_KEY || import.meta.env.VITE_PERPLEXITY_API_KEY || '', 
    naverId: import.meta.env.NCP_APIGW_API_KEY_ID || import.meta.env.NAVER_CLIENT_ID || import.meta.env.VITE_NCP_APIGW_API_KEY_ID || 'i8ciwrvzln',
    naverSecret: import.meta.env.NCP_APIGW_API_KEY || import.meta.env.NAVER_CLIENT_SECRET || import.meta.env.VITE_NCP_APIGW_API_KEY || '9EXRQssZga4OCcnnn1hdM3V9KlSEYzKefwJMvK2x',
    anthropic: import.meta.env.ANTHROPIC_API_KEY || import.meta.env.VITE_ANTHROPIC_API_KEY || '' 
  };

  const getInitialKeys = () => {
    try {
      const localSaved = localStorage.getItem('luvis_api_keys');
      if (localSaved) {
        const parsed = JSON.parse(localSaved);
        return {
          openai: parsed.openai || ENV_DEFAULT_KEYS.openai,
          gemini: parsed.gemini || ENV_DEFAULT_KEYS.gemini,
          perplexity: parsed.perplexity || ENV_DEFAULT_KEYS.perplexity,
          naverId: parsed.naverId || ENV_DEFAULT_KEYS.naverId,
          naverSecret: parsed.naverSecret || ENV_DEFAULT_KEYS.naverSecret,
          anthropic: parsed.anthropic || ENV_DEFAULT_KEYS.anthropic,
        };
      }
    } catch(e) {}
    return ENV_DEFAULT_KEYS;
  };

  const [apiKeys, setApiKeysState] = useState(getInitialKeys());

  const setApiKeys = (updater: any) => {
    setApiKeysState((prev: any) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try {
        localStorage.setItem('luvis_api_keys', JSON.stringify(next));
      } catch(e) {}
      return next;
    });
  };

  useEffect(() => {
    const loadApiKeysFromSupabase = async () => {
      try {
        const { data, error } = await supabase
          .from('system_config')
          .select('value')
          .eq('key', 'api_keys')
          .maybeSingle();
        
        if (!error && data && data.value) {
          const remoteKeys = data.value as typeof apiKeys;
          setApiKeysState(prev => {
            const merged = {
              openai: (remoteKeys.openai && remoteKeys.openai.length > 20) ? remoteKeys.openai : (prev.openai || ENV_DEFAULT_KEYS.openai),
              gemini: (remoteKeys.gemini && remoteKeys.gemini.length > 10) ? remoteKeys.gemini : (prev.gemini || ENV_DEFAULT_KEYS.gemini),
              perplexity: (remoteKeys.perplexity && remoteKeys.perplexity.length > 10) ? remoteKeys.perplexity : (prev.perplexity || ENV_DEFAULT_KEYS.perplexity),
              naverId: remoteKeys.naverId || prev.naverId || ENV_DEFAULT_KEYS.naverId,
              naverSecret: remoteKeys.naverSecret || prev.naverSecret || ENV_DEFAULT_KEYS.naverSecret,
              anthropic: remoteKeys.anthropic || prev.anthropic || ENV_DEFAULT_KEYS.anthropic
            };
            try {
              localStorage.setItem('luvis_api_keys', JSON.stringify(merged));
            } catch(e) {}
            return merged;
          });
        }
      } catch (err) {
        console.error('Failed to load API keys from Supabase:', err);
      }
    };
    loadApiKeysFromSupabase();
  }, []);

  const [logs, setLogs] = useState<string[]>([]);
  const appendLog = (log: string) => setLogs(prev => [...prev, log]);
  const clearLogs = () => setLogs([]);

  const [stepStatus, setStepStatusState] = useState<{ init: StepStatus; measurement: StepStatus; scoring: StepStatus; trust: StepStatus; render: StepStatus }>({
    init: 'pending',
    measurement: 'pending',
    scoring: 'pending',
    trust: 'pending',
    render: 'pending'
  });
  
  const setStepStatus = (step: string, status: StepStatus) => {
    setStepStatusState(prev => ({ ...prev, [step]: status }));
  };

  const resetStepStatus = () => {
    setStepStatusState({
      init: 'pending',
      measurement: 'pending',
      scoring: 'pending',
      trust: 'pending',
      render: 'pending'
    });
    setStartTime('-');
    setEndTime('-');
  };

  const [startTime, setStartTime] = useState('-');
  const [endTime, setEndTime] = useState('-');
  const [isRunning, setIsRunning] = useState(false);
  const abortController = useRef<AbortController | null>(null);

  return (
    <DashboardContext.Provider value={{
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
      logs, appendLog, clearLogs,
      stepStatus, setStepStatus: setStepStatus as any,
      resetStepStatus,
      startTime, setStartTime,
      endTime, setEndTime,
      isRunning, setIsRunning,
      abortController
    }}>
      {children}
    </DashboardContext.Provider>
  );
};

export const useDashboard = () => {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
};
