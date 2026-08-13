import { createContext, useContext, useState, useRef } from 'react';
import type { ReactNode } from 'react';

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
  const [apiKeys, setApiKeys] = useState({ 
    openai: import.meta.env.OPENAI_API_KEY || '', 
    gemini: import.meta.env.GEMINI_API_KEY || '', 
    perplexity: import.meta.env.PERPLEXITY_API_KEY || '', 
    naverId: import.meta.env.NAVER_CLIENT_ID || 'i8ciwrvzln',
    naverSecret: import.meta.env.NAVER_CLIENT_SECRET || '9EXRQssZga4OCcnnn1hdM3V9KlSEYzKefwJMvK2x',
    anthropic: import.meta.env.ANTHROPIC_API_KEY || '' 
  });

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
