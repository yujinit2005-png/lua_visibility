import React, { useEffect, useState, useCallback, useRef } from 'react';
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

import { RunSelector } from './RunSelector';
import type { RunItemWithDetails } from './RunSelector';
import { Trash2, Download, Settings, RefreshCw, CheckCircle2, AlertCircle, X } from 'lucide-react';

interface WebVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  runId?: number | null;
  hospitalCode: string;
  hospitalName: string;
  onChangeRun?: () => void;
}

// ── 플랫폼 목록 정의 ──────────────────────────────────────────────────
const PLATFORM_LIST = [
  { key: 'ChatGPT',   providerKey: 'openai',     label: 'ChatGPT',      color: '#10A37F' },
  { key: 'Gemini',    providerKey: 'gemini',      label: 'Gemini',       color: '#4285F4' },
  { key: 'Perplexity',providerKey: 'perplexity',  label: 'Perplexity',   color: '#7C3AED' },
  { key: 'Naver',     providerKey: 'naver',       label: 'Naver API',    color: '#03C75A' },
  { key: 'Claude',    providerKey: 'anthropic',   label: 'Claude',       color: '#D97706' },
];

const GENERIC_EXCLUDE_WORDS = new Set(['병원', '의원', '한방병원', '한의원', '한방', '센터', '클리닉', '의료원', '진료', '치료']);

// ── 병원명 하이라이트 유틸 ────────────────────────────────────────────
const highlightText = (text: string, aliases: string[]): React.ReactNode => {
  if (!text || !aliases || aliases.length === 0) return text;

  // 빈 문자열 및 일반 명사 단독 제외 후 길이 내림차순 정렬 (긴 것 먼저 매칭)
  const validAliases = aliases
    .filter(a => typeof a === 'string')
    .map(a => a.trim())
    .filter(a => a.length >= 2 && !GENERIC_EXCLUDE_WORDS.has(a));

  const sortedAliases = Array.from(new Set(validAliases)).sort((a, b) => b.length - a.length);
  if (sortedAliases.length === 0) return text;

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
  isOpen, onClose, runId: initialRunId, hospitalCode, hospitalName,
}) => {
  const [runs, setRuns] = useState<RunItemWithDetails[]>([]);
  const [currentRunId, setCurrentRunId] = useState<number | null>(initialRunId || null);

  // [변경] 단일 platform → 체크박스 Set
  const [checkedPlatforms, setCheckedPlatforms] = useState<Set<string>>(new Set());
  const [executedPlatforms, setExecutedPlatforms] = useState<Set<string>>(new Set());

  const [rows, setRows] = useState<WebAnswerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoCrawling, setIsAutoCrawling] = useState(false);
  const autoCrawlCancelledRef = useRef<boolean>(false);
  const [activeIframeUrl, setActiveIframeUrl] = useState<string | null>(null);
  const [activeIframeTitle] = useState('');
  const [isExpandedAll, setIsExpandedAll] = useState(false);

  // aliases 로드
  const [_hospitalAliases, setHospitalAliases] = useState<string[]>([]);

  // ── 로컬 크롤러 에이전트 연동 상태 ────────────────────────────────
  const [crawlerApiUrl, setCrawlerApiUrl] = useState<string>(() => {
    return localStorage.getItem('lua_crawler_api_url') || (import.meta.env.VITE_CRAWLER_API_URL as string) || 'http://127.0.0.1:5000';
  });
  const [tempApiUrl, setTempApiUrl] = useState<string>(crawlerApiUrl);
  const [crawlerStatus, setCrawlerStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [showCrawlerModal, setShowCrawlerModal] = useState<boolean>(false);
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);

  // 크롤러 헬스체크 함수
  const checkCrawlerHealth = useCallback(async (urlToCheck?: string) => {
    const targetUrl = (urlToCheck || crawlerApiUrl).replace(/\/+$/, '');
    setCrawlerStatus('checking');
    try {
      const res = await fetch(`${targetUrl}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });
      if (res.ok) {
        setCrawlerStatus('connected');
        return true;
      } else {
        setCrawlerStatus('disconnected');
        return false;
      }
    } catch {
      setCrawlerStatus('disconnected');
      return false;
    }
  }, [crawlerApiUrl]);

  // 모달 열릴 때 및 API URL 변경 시 크롤러 상태 점검
  useEffect(() => {
    if (isOpen) {
      checkCrawlerHealth();
    }
  }, [isOpen, crawlerApiUrl, checkCrawlerHealth]);

  // 원클릭 로컬 크롤러 실행기 다운로드 (.bat)
  const handleDownloadCrawlerScript = () => {
    const batContent = `@echo off\r
setlocal\r
chcp 65001 > nul\r
title [LUVIS] 루비스 AI 웹 실측 로컬 크롤러 에이전트\r
\r
echo ===================================================================\r
echo   🌟 [LUVIS] 루비스 AI 웹 실측 로컬 크롤러 에이전트 (Port: 5000)\r
echo ===================================================================\r
echo.\r
\r
:: 1. 작업 디렉토리 설정 (C:\\lua_crawler)\r
set "TARGET_DIR=C:\\lua_crawler"\r
if not exist "%TARGET_DIR%" (\r
    echo [1/4] 크롤러 전용 디렉토리(%TARGET_DIR%) 생성 중...\r
    mkdir "%TARGET_DIR%" > nul 2>&1\r
)\r
\r
:: 2. 파이썬 설치 확인 및 부재 시 자동 설치\r
set "PY_CMD=python"\r
%PY_CMD% --version > nul 2>&1\r
if errorlevel 1 (\r
    py --version > nul 2>&1\r
    if not errorlevel 1 (\r
        set "PY_CMD=py"\r
    ) else (\r
        echo [2/4] 파이썬이 설치되어 있지 않습니다.\r
        echo       Python 3.11 자동 다운로드 및 설치를 시작합니다 (약 30초 소요)...\r
        powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe', \\"$env:TEMP\\python_installer.exe\\")"\r
        echo       파이썬 설치를 진행합니다. 잠시만 기다려주세요...\r
        start /wait "" "%TEMP%\\python_installer.exe" /quiet InstallAllUsers=1 PrependPath=1 Include_pip=1\r
        set "PATH=%LOCALAPPDATA%\\Programs\\Python\\Python311;%LOCALAPPDATA%\\Programs\\Python\\Python311\\Scripts;C:\\Program Files\\Python311;C:\\Program Files\\Python311\\Scripts;%PATH%"\r
    )\r
)\r
\r
echo [2/4] 파이썬 환경 확인 완료 (%PY_CMD%)\r
\r
:: 3. 최신 크롤링 엔진 파일(api_server.py) 동기화\r
echo [3/4] 최신 크롤링 엔진(api_server.py)을 다운로드 및 점검합니다...\r
powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; try { (New-Object System.Net.WebClient).DownloadFile('https://raw.githubusercontent.com/yujinit2005-png/lua_visibility/main/src/services/api_server.py', 'C:\\lua_crawler\\api_server.py') } catch { exit 1 }" > nul 2>&1\r
\r
if not exist "%TARGET_DIR%\\api_server.py" (\r
    if exist "%~dp0src\\services\\api_server.py" (\r
        copy /Y "%~dp0src\\services\\api_server.py" "%TARGET_DIR%\\api_server.py" > nul 2>&1\r
    )\r
)\r
\r
:: 4. 서버 구동\r
echo [4/4] 루비스 로컬 크롤링 API 서버를 구동합니다...\r
echo -------------------------------------------------------------------\r
echo  * 실행 파일: %TARGET_DIR%\\api_server.py\r
echo  * 로컬 API 주소: http://127.0.0.1:5000 (Port 5000)\r
echo  * 상태: Cloudflare 배포 웹사이트(https://lua-visibility.pages.dev)\r
echo          및 로컬 웹앱과 실시간 연동 대기 중...\r
echo  * (본 창을 닫지 마시고 최소화하여 유지해주세요.)\r
echo -------------------------------------------------------------------\r
echo.\r
\r
cd /d "%TARGET_DIR%"\r
%PY_CMD% api_server.py\r
\r
echo.\r
echo ===================================================================\r
echo   [안내] 크롤러 서버가 종료되었습니다.\r
echo ===================================================================\r
pause\r
`;
    const blob = new Blob([batContent], { type: 'application/x-bat;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'run_crawler_agent.bat';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── runs 목록 로드 & 최신 회차 자동 선택 ──────────────────────────
  useEffect(() => {
    if (isOpen && hospitalCode) {
      fetchRunsAndInit();
    }
  }, [isOpen, hospitalCode]);

  useEffect(() => {
    if (initialRunId) {
      setCurrentRunId(initialRunId);
    }
  }, [initialRunId]);

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
          setCurrentRunId(detailedRuns[0].id);
        } else {
          setCurrentRunId(initialRunId);
        }
      } else {
        setCurrentRunId(null);
        setRows([]);
      }
    } catch (e) {
      console.error('Failed to fetch runs in WebVerificationModal:', e);
    }
  };

  const handleDeleteRun = async (targetRunId: number) => {
    try {
      setLoading(true);

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

      alert(`✅ Run #${targetRunId} 진단 회차 및 연계된 비교검색 데이터가 모두 삭제되었습니다.`);

      // 4. 목록 다시 불러오기
      await fetchRunsAndInit();
    } catch (err: any) {
      alert(`❌ 회차 삭제 실패: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

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
    if (!currentRunId) return;
    setLoading(true);
    try {
      const aliases = await loadAliases();

      // answers 전체 조회
      const { data: answersData, error: ansErr } = await supabase
        .from('answers')
        .select('*')
        .eq('run_id', currentRunId)
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
      // 회차 선택 시 당시 실제 실행된 AI들로 자동 체크
      setCheckedPlatforms(new Set(detected));

      // web_verifications 저장 데이터 조회 (모든 플랫폼)
      const savedAnswersMap = new Map<string, any>();
      const { data: allVerifs } = await supabase
        .from('web_verifications')
        .select('id, platform')
        .eq('run_id', currentRunId);

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
  }, [currentRunId, hospitalCode, hospitalName, loadAliases]);

  useEffect(() => {
    if (isOpen && currentRunId) {
      fetchVerificationData();
    }
  }, [isOpen, currentRunId, fetchVerificationData]);

  // ── 내장 뷰어 실측 (파이썬 팝업 크롤링 API 연동) ────────────────────────
  const handleOpenViewer = async (row: WebAnswerRow, isSilent: boolean = false) => {
    // 로딩 상태 시작
    setRows(prev => prev.map(r => 
      (r.platform === row.platform && r.query === row.query) 
        ? { ...r, isLoading: true, web_raw_text: '🚀 백그라운드 브라우저 크롤링 진행 중...' } 
        : r
    ));

    const baseApiUrl = crawlerApiUrl.replace(/\/+$/, '');

    try {
      const res = await fetch(`${baseApiUrl}/api/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: row.platform, query: row.query }),
      });

      if (!res.ok) throw new Error(`API 서버 오류 (${res.status})`);
      const data = await res.json();
      
      const crawledText = data.raw_text || '[크롤링 결과 없음]';
      const cleanText = crawledText.replace(/\s+/g, '');
      const isMentioned = row.aliases.some(a => cleanText.includes(a.replace(/\s+/g, '')));

      setCrawlerStatus('connected');
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
      setCrawlerStatus('disconnected');
      setRows(prev => prev.map(r => 
        (r.platform === row.platform && r.query === row.query) 
          ? { ...r, isLoading: false, web_raw_text: `❌ 크롤링 실패 (파이썬 API 서버 미실행/타임아웃): ${e.message}` } 
          : r
      ));
      if (!isSilent) {
        setShowCrawlerModal(true);
      }
      throw e;
    }
  };



  // ── DB 저장 ───────────────────────────────────────────────────────
  const handleSaveToDb = async () => {
    if (!currentRunId) return;
    setIsSaving(true);
    try {
      // 체크된 플랫폼별 저장
      for (const platKey of Array.from(checkedPlatforms)) {
        const platRows = rows.filter(r => r.platform === platKey);
        if (platRows.length === 0) continue;

        // 기존 삭제
        const { data: oldVerifs } = await supabase
          .from('web_verifications').select('id')
          .eq('run_id', currentRunId).eq('platform', platKey);
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
            run_id: currentRunId,
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

  // ── 전체 내장 창 일괄 닫기 & 크롤링 중단 ─────────────────────────────────
  const handleCloseAllAndStop = async () => {
    // 1. 자동 실측 루프 즉시 취소 플래그 설정
    autoCrawlCancelledRef.current = true;
    setIsAutoCrawling(false);
    setActiveIframeUrl(null);

    // 2. 파이썬 크롤링 백엔드에 모든 활성 브라우저 창 종료 요청
    const baseApiUrl = crawlerApiUrl.replace(/\/+$/, '');
    try {
      await fetch(`${baseApiUrl}/api/close_all`, { method: 'POST' });
    } catch (e) {
      console.warn('close_all API 호출 경고:', e);
    }
  };

  // ── 전체 자동 실측 (7초 간격 병렬) ──────────────────────────────────────────────────
  const handleAutoCrawl = async () => {
    if (filteredRows.length === 0) return alert('실측할 데이터가 없습니다.');
    if (!window.confirm(`총 ${filteredRows.length}개의 질문을 자동 실측합니다.\n(각 브라우저 창이 7초 간격으로 순차적으로 띄워집니다.)\n진행하시겠습니까?`)) return;

    autoCrawlCancelledRef.current = false;
    setIsAutoCrawling(true);
    const baseApiUrl = crawlerApiUrl.replace(/\/+$/, '');

    try {
      // 1. 사전 헬스체크: 서버가 살아있는지 먼저 확인
      try {
        const healthRes = await fetch(`${baseApiUrl}/api/health`, { signal: AbortSignal.timeout(2500) });
        if (!healthRes.ok) throw new Error();
        setCrawlerStatus('connected');
      } catch {
        setCrawlerStatus('disconnected');
        setShowCrawlerModal(true);
        return;
      }

      for (let i = 0; i < filteredRows.length; i++) {
        if (autoCrawlCancelledRef.current || !isOpen) {
          console.log('[LUA AI] 사용자에 의해 전체 자동 실측이 중단되었습니다.');
          break;
        }
        const row = filteredRows[i];
        
        // 개별 실측 실행 (isSilent=true)
        handleOpenViewer(row, true).catch((e) => {
          console.warn('[LUA AI] 개별 실측 예외:', e);
        });
        
        // 다음 창을 띄우기 전 7초 대기 (1초 단위로 취소 여부 체크)
        if (i < filteredRows.length - 1) {
          for (let s = 0; s < 7; s++) {
            if (autoCrawlCancelledRef.current || !isOpen) break;
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
      if (!autoCrawlCancelledRef.current && isOpen) {
        alert('✅ 전체 질문 실측 명령 전송 완료!\n각 창에서 크롤링이 완료될 때까지 잠시만 기다려주세요.');
      }
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

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-3 font-sans">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-[99vw] h-[96vh] flex flex-col overflow-hidden border border-emerald-300">
          {/* Header */}
          <div className="bg-[#059669] text-white px-6 py-3 flex justify-between items-center shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-xl">🌐</span>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold">
                  웹 UI 실측 및 교차 비교 분석 — [{hospitalName}]
                </h2>
                {currentRunId && (
                  <span className="bg-emerald-900/60 border border-emerald-300/40 text-emerald-100 text-xs px-2.5 py-0.5 rounded-full font-semibold">
                    현재 회차: Run #{currentRunId}
                  </span>
                )}
              </div>
            </div>
            <button 
              onClick={() => {
                handleCloseAllAndStop();
                onClose();
              }} 
              className="text-white hover:text-gray-200 text-2xl font-bold p-1 rounded transition-colors"
            >
              &times;
            </button>
          </div>

          {/* Controls Bar 1 - 회차 선택 & 체크박스 플랫폼 선택 */}
          <div className="bg-emerald-50 px-6 py-2.5 border-b border-emerald-200 flex justify-between items-center text-xs font-semibold text-emerald-900 flex-wrap gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              
              {/* 회차 선택 커스텀 컴포넌트 (통합: 상태, 도구 태그, 삭제 지원) */}
              <RunSelector
                runs={runs}
                currentRunId={currentRunId}
                onSelectRun={(selectedId) => setCurrentRunId(selectedId)}
                onDeleteRun={handleDeleteRun}
                disabled={loading}
                themeColor="emerald"
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
                  disabled={loading}
                  title="현재 선택된 회차 삭제"
                  className="flex items-center gap-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg px-2.5 py-1.5 font-bold transition-all active:scale-95 disabled:opacity-50"
                >
                  <Trash2 size={13} />
                  <span>회차 삭제</span>
                </button>
              )}

              <div className="h-4 w-px bg-emerald-200" />

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
                className="bg-emerald-700 text-white px-2 py-1 rounded hover:bg-emerald-800 ml-1"
              >
                🔄 새로고침
              </button>
            </div>
          </div>

          {/* Controls Bar 2 */}
          <div className="bg-white px-6 py-2 border-b border-gray-200 flex flex-wrap gap-2 text-xs items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleAutoCrawl}
                disabled={isAutoCrawling}
                className={`${isAutoCrawling ? 'bg-gray-400 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-700'} text-white font-bold px-3.5 py-1.5 rounded flex items-center gap-1 shadow-sm transition-colors`}
              >
                <span>{isAutoCrawling ? '⏳' : '🚀'}</span> {isAutoCrawling ? '전체 자동 실측 진행중...' : '전체 질문 순차 자동 실측'}
              </button>
              <button
                onClick={() => setIsExpandedAll(!isExpandedAll)}
                className={`font-bold px-3.5 py-1.5 rounded flex items-center gap-1 transition-colors text-white ${isExpandedAll ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-sky-600 hover:bg-sky-700'}`}
              >
                <span>📖</span> {isExpandedAll ? '크롤링 결과 접기' : '크롤링 결과 전체 펼쳐보기'}
              </button>

              <div className="h-4 w-px bg-gray-300 mx-1" />

              {/* 크롤러 상태 인디케이터 및 설정 열기 */}
              <button
                type="button"
                onClick={() => {
                  setTempApiUrl(crawlerApiUrl);
                  setShowCrawlerModal(true);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all shadow-sm ${
                  crawlerStatus === 'connected'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                    : crawlerStatus === 'checking'
                    ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                    : 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100 animate-pulse'
                }`}
                title="로컬 크롤러 에이전트 연결 상태 및 설정"
              >
                <span className={`w-2.5 h-2.5 rounded-full ${
                  crawlerStatus === 'connected' ? 'bg-emerald-500' :
                  crawlerStatus === 'checking' ? 'bg-amber-500 animate-ping' : 'bg-rose-500'
                }`} />
                <span>
                  {crawlerStatus === 'connected' ? '로컬 크롤러 연결됨 (5000)' :
                   crawlerStatus === 'checking' ? '크롤러 확인 중...' : '로컬 크롤러 미연결'}
                </span>
                <Settings size={13} className="text-gray-500 hover:text-gray-800 ml-0.5" />
              </button>

              {/* 원클릭 다운로드 버튼 */}
              <button
                type="button"
                onClick={handleDownloadCrawlerScript}
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold px-3 py-1.5 rounded-lg shadow-sm transition-all"
                title="로컬 PC에서 크롤러를 바로 띄울 수 있는 실행 파일(.bat) 다운로드"
              >
                <Download size={13} />
                <span>크롤러 다운로드 (.bat)</span>
              </button>
            </div>

            {/* 오른쪽 상단: 전체 내장 창 일괄 닫기 + 닫기 버튼 */}
            <div className="flex items-center gap-2 ml-auto">
              <button 
                onClick={handleCloseAllAndStop} 
                className="bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold px-3.5 py-1.5 rounded flex items-center gap-1 shadow-sm transition-all"
                title="진행 중인 크롤링을 즉시 중단하고 모든 브라우저 창을 닫습니다"
              >
                <span>❌</span> 전체 내장 창 일괄 닫기
              </button>
              <button 
                onClick={() => {
                  handleCloseAllAndStop();
                  onClose();
                }} 
                className="bg-gray-600 hover:bg-gray-700 active:scale-95 text-white font-bold px-4 py-1.5 rounded flex items-center gap-1 shadow-sm transition-colors"
              >
                닫기
              </button>
            </div>
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
                    <th className="px-2 py-2 text-left font-bold w-96 min-w-[380px] border-r">API검색결과 / 메모</th>
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
                      <td className="px-3 py-2 border-r align-top w-96 min-w-[380px]">
                        <div className={`mb-2 text-gray-700 text-[11px] font-mono leading-snug ${
                          isExpandedAll ? 'whitespace-pre-wrap break-words' : 'max-w-[420px] overflow-hidden'
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
          <div className="bg-gray-100 px-6 py-3 border-t flex justify-end items-center">
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

      {/* ── 로컬 크롤러 에이전트 연동 & 다운로드 가이드 모달 ────────────────── */}
      {showCrawlerModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 font-sans animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-200">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-5 py-4 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🤖</span>
                <h3 className="text-base font-bold">로컬 크롤러 에이전트 연동 & 가이드</h3>
              </div>
              <button
                onClick={() => setShowCrawlerModal(false)}
                className="text-white/80 hover:text-white text-xl p-1 rounded transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-xs text-gray-700 max-h-[80vh] overflow-y-auto">
              {/* Status Banner */}
              <div className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                crawlerStatus === 'connected'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-rose-50 border-rose-300 text-rose-900'
              }`}>
                <div className="flex items-center gap-2.5">
                  {crawlerStatus === 'connected' ? (
                    <CheckCircle2 size={22} className="text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle size={22} className="text-rose-600 shrink-0" />
                  )}
                  <div>
                    <div className="font-bold text-sm">
                      {crawlerStatus === 'connected' ? '로컬 크롤러 정상 연결됨' : '로컬 크롤러 서버 미연결'}
                    </div>
                    <div className="text-[11px] opacity-80 mt-0.5">
                      {crawlerStatus === 'connected'
                        ? '파이썬 브라우저 제어 서버(Port 5000)가 정상 응답하고 있습니다.'
                        : '로컬 PC에서 크롤러 실행 파일(.bat)을 구동해주세요.'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isTestingConnection}
                  onClick={async () => {
                    setIsTestingConnection(true);
                    await checkCrawlerHealth();
                    setIsTestingConnection(false);
                  }}
                  className="bg-white hover:bg-gray-100 text-gray-800 border border-gray-300 px-2.5 py-1.5 rounded-lg font-bold shrink-0 flex items-center gap-1 shadow-sm transition-all"
                >
                  <RefreshCw size={12} className={isTestingConnection ? 'animate-spin' : ''} />
                  <span>{isTestingConnection ? '확인 중' : '재확인'}</span>
                </button>
              </div>

              {/* 3-Step Simple Guide */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-2.5">
                <div className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                  <span>💡</span>
                  <span>로컬 크롤러 3초 구동 방법</span>
                </div>
                <ol className="list-decimal list-inside space-y-2 text-gray-600 leading-relaxed font-medium">
                  <li className="pl-1">
                    <span className="font-semibold text-gray-800">1단계:</span> 아래 <strong>[크롤러 실행기 다운로드]</strong> 버튼을 클릭하여 <code className="bg-gray-200 text-gray-800 px-1 py-0.5 rounded">run_crawler_agent.bat</code> 파일을 다운로드합니다.
                  </li>
                  <li className="pl-1">
                    <span className="font-semibold text-gray-800">2단계:</span> 다운로드 폴더에서 <strong>run_crawler_agent.bat</strong>을 더블 클릭하여 실행합니다. (파이썬 및 브라우저 환경 자동 점검)
                  </li>
                  <li className="pl-1">
                    <span className="font-semibold text-gray-800">3단계:</span> 검은색 터미널 창이 뜨면 상단의 <strong>[재확인]</strong>을 눌러 초록색 불이 들어온 후 웹 실측을 진행하시면 됩니다!
                  </li>
                </ol>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleDownloadCrawlerScript}
                    className="w-full bg-amber-500 hover:bg-amber-600 active:scale-98 text-white font-bold py-2.5 px-4 rounded-xl shadow-md flex items-center justify-center gap-2 text-sm transition-all"
                  >
                    <Download size={16} />
                    <span>로컬 크롤러 실행기 다운로드 (run_crawler_agent.bat)</span>
                  </button>
                </div>
              </div>

              {/* Advanced Settings */}
              <div className="border-t pt-3 space-y-2">
                <div className="font-bold text-gray-800 flex items-center justify-between">
                  <span>⚙️ API 엔드포인트 URL 설정</span>
                  <button
                    type="button"
                    onClick={() => setTempApiUrl('http://127.0.0.1:5000')}
                    className="text-[11px] text-emerald-700 hover:underline"
                  >
                    기본값(127.0.0.1:5000)으로 복원
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tempApiUrl}
                    onChange={(e) => setTempApiUrl(e.target.value)}
                    placeholder="http://127.0.0.1:5000 또는 https://xxx.trycloudflare.com"
                    className="flex-1 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-emerald-600 font-mono"
                  />
                  <button
                    type="button"
                    disabled={isTestingConnection}
                    onClick={async () => {
                      setIsTestingConnection(true);
                      const clean = tempApiUrl.trim().replace(/\/+$/, '');
                      localStorage.setItem('lua_crawler_api_url', clean);
                      setCrawlerApiUrl(clean);
                      const ok = await checkCrawlerHealth(clean);
                      setIsTestingConnection(false);
                      if (ok) {
                        alert(`✅ 크롤러 API 연결 성공!\n(${clean})`);
                      } else {
                        alert(`❌ 연결 실패: ${clean} 에서 응답이 없습니다.\n로컬에서 run_crawler_agent.bat 이 구동 중인지 확인해주세요.`);
                      }
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg transition-colors shrink-0"
                  >
                    저장 및 테스트
                  </button>
                </div>
                <p className="text-[10px] text-gray-400">
                  ※ 로컬 PC에서 Cloudflare Tunnel을 사용할 경우 터널링 HTTPS 주소를 입력하시면 완벽하게 연결됩니다.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-gray-50 px-5 py-3 border-t flex justify-end">
              <button
                type="button"
                onClick={() => setShowCrawlerModal(false)}
                className="bg-gray-800 hover:bg-gray-900 text-white font-bold px-4 py-1.5 rounded-lg text-xs transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default WebVerificationModal;
