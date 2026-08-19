import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

interface Hospital {
  hospital_code: string;
  name: string;
  director_name?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  address?: string;
  homepage?: string;
}

interface HospitalConfigVersion {
  id: number;
  hospital_code: string;
  version: string;
  aliases?: string;
  region_terms?: string;
  competitors?: string;
  queries?: string;
  naver_queries?: string;
  is_active?: boolean;
  memo?: string;
  created_at?: string;
}

// 4단어 네이버 검색 키워드 자동 분리 헬퍼
export const extractNaverKeywordsFromQuery = (q: string): string => {
  if (!q) return '';
  let text = q.trim();

  // 1. 구두점 및 따옴표 제거
  text = text.replace(/["'“”‘’`?.,!~()\[\]]/g, ' ');

  // 2. 종결어 및 의문형/서술형 불용어 정규식 정리
  text = text
    .replace(/(어디야|어디가|어디서|어디|알려줘|알려주세요|추천해줘|추천해주세요|추천|어떻게|어떤가요|될까요|있나요|할까요|있을까요|어떨까요|무엇인가요)/g, ' ')
    .replace(/(받을\s*수\s*있는|받으려면|받을|진료\s*잘하는|잘하는|진료하는|진료하|진료|치료하는|치료|검사하고|검사\s*가능한|검사|상담할|상담\s*가능한|상담까지|상담|수술\s*상담할|수술하는|수술|진단\s*받을\s*수\s*있는|진단)/g, ' ')
    .replace(/(모시고|다니기|갈만한|있는|가능한|가능|알려진|유명한|좋은|괜찮은|가까운|편한|함께)/g, ' ')
    .replace(/(우리|부모님|부모님이|아이|내가|가족|누가|누구|곳|여기|저기|이런|가장|많은|계속\s*나는|나는|질환)/g, ' ')
    .replace(/(근처|주변|인근)/g, ' ');

  // 3. 단어 단위로 쪼개기
  const tokens = text.split(/\s+/).filter((t) => t.length > 0);
  const resultWords: string[] = [];

  // 한국어 조사 및 불필요 접미사 제거
  const stripParticles = (word: string): string => {
    let w = word;
    w = w.replace(/(에서|이나|거나|하고|으로|까지|부터|에게|로써|보다)$/g, '');
    w = w.replace(/(은|는|이|가|을|를|의|와|과|에|로)$/g, '');
    return w.trim();
  };

  const stopWords = new Set([
    '어디', '추천', '진료', '치료', '검사', '수술', '상담', '진단', '질환', '증상', '방법'
  ]);

  for (const token of tokens) {
    const cleaned = stripParticles(token);
    if (!cleaned || cleaned.length < 2) continue;
    
    if (stopWords.has(cleaned) && !token.includes('이비인후과') && !token.includes('한방병원') && !token.includes('정형외과') && !token.includes('내과') && !token.includes('안과') && !token.includes('치과') && !token.includes('피부과')) {
      continue;
    }

    if (!resultWords.includes(cleaned)) {
      resultWords.push(cleaned);
      if (resultWords.length >= 4) break;
    }
  }

  // 4단어 미만이고 질문 원문에 이비인후과/내과/병원 등이 있는데 아직 포함 안 된 경우 보완
  const commonHospTypes = ['이비인후과', '정형외과', '안과', '치과', '피부과', '내과', '한의원', '한방병원', '병원', '의원'];
  if (resultWords.length < 4) {
    for (const ht of commonHospTypes) {
      if (q.includes(ht) && !resultWords.some(rw => rw.includes(ht))) {
        resultWords.push(ht);
        if (resultWords.length >= 4) break;
      }
    }
  }

  return resultWords.join(' ');
};

interface HospitalManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshHospitals?: () => void;
  initialHospitalCode?: string;
  initialVersion?: string;
}

export const HospitalManagementModal: React.FC<HospitalManagementModalProps> = ({
  isOpen,
  onClose,
  onRefreshHospitals,
  initialHospitalCode,
  initialVersion,
}) => {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [selectedHospitalCode, setSelectedHospitalCode] = useState<string>('');
  
  // Hospital Master Form
  const [hospitalForm, setHospitalForm] = useState<Hospital>({
    hospital_code: '',
    name: '',
    director_name: '',
    phone: '',
    mobile: '',
    email: '',
    address: '',
    homepage: '',
  });

  // Versions List & Selected Version
  const [versions, setVersions] = useState<HospitalConfigVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);

  // Version Form
  const [versionForm, setVersionForm] = useState<{
    version: string;
    memo: string;
    aliases: string;
    region_terms: string;
    competitors: string;
    queries: string;
    naver_queries: string;
  }>({
    version: 'v1.0',
    memo: '',
    aliases: '',
    region_terms: '',
    competitors: '',
    queries: '',
    naver_queries: '',
  });

  // Tab Selection
  const [activeTab, setActiveTab] = useState<'aliases' | 'region_terms' | 'competitors' | 'queries' | 'naver_queries'>('aliases');
  const [_loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchHospitals();
    }
  }, [isOpen, initialHospitalCode, initialVersion]);

  const fetchHospitals = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('hospitals')
        .select('*')
        .order('hospital_code', { ascending: true });

      if (error) throw error;
      const hospList = data || [];
      setHospitals(hospList);
      
      if (hospList.length > 0) {
        // 메인 화면에서 선택된 병원(initialHospitalCode)이 있으면 해당 병원 우선 선택
        const matchedHosp = initialHospitalCode ? hospList.find(h => h.hospital_code === initialHospitalCode) : null;
        const targetCode = matchedHosp ? matchedHosp.hospital_code : hospList[0].hospital_code;
        setSelectedHospitalCode(targetCode);
        loadHospitalDetails(targetCode, hospList, initialVersion);
      } else {
        handleNewHospital();
      }
    } catch (e: any) {
      alert(`병원 목록 조회 실패: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadHospitalDetails = async (code: string, hospList: Hospital[], targetVersion?: string) => {
    const hosp = hospList.find((h) => h.hospital_code === code);
    if (hosp) {
      setHospitalForm({ ...hosp });
    }

    // Fetch versions for this hospital
    try {
      const { data: verData, error: verErr } = await supabase
        .from('hospital_config_versions')
        .select('*')
        .eq('hospital_code', code)
        .order('id', { ascending: false });

      if (verErr) throw verErr;
      const vers = verData || [];
      setVersions(vers);

      if (vers.length > 0) {
        // 메인 화면에서 선택된 버전(targetVersion)이 있으면 해당 버전 우선 선택
        const matchedVer = targetVersion ? vers.find(v => v.version === targetVersion) : null;
        const targetVer = matchedVer || vers[0];
        setSelectedVersionId(targetVer.id);
        bindVersionForm(targetVer);
      } else {
        // Reset version form
        setVersionForm({
          version: 'v1.0',
          memo: '기존 설정 파일',
          aliases: hosp ? `${hosp.name}\n` : '',
          region_terms: '',
          competitors: '',
          queries: '',
          naver_queries: '',
        });
        setSelectedVersionId(null);
      }
    } catch (e) {
      console.error('Versions fetch error', e);
    }
  };

  const cleanLineText = (line: string): string => {
    return line
      .trim()
      .replace(/^[“"'`]+|[“"'`,]+$/g, '')
      .trim();
  };

  const parseArrayToText = (rawStr?: string): string => {
    if (!rawStr) return '';
    try {
      const trimmed = rawStr.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        const arr = JSON.parse(trimmed);
        if (Array.isArray(arr)) {
          return arr
            .map((item) => cleanLineText(String(item)))
            .filter(Boolean)
            .join('\n');
        }
      }
    } catch (e) {
      // Fallback if not valid JSON
    }
    // 일반 문자열인 경우 줄단위로 쪼개어 따옴표 및 콤마 정제
    return rawStr
      .split('\n')
      .map((line) => cleanLineText(line))
      .filter(Boolean)
      .join('\n');
  };

  const formatTextToArrayJson = (text: string): string => {
    if (!text) return '[]';
    const lines = text
      .split('\n')
      .map((line) => cleanLineText(line))
      .filter((line) => line.length > 0);
    return JSON.stringify(lines);
  };

  const bindVersionForm = (ver: HospitalConfigVersion) => {
    setVersionForm({
      version: ver.version || 'v1.0',
      memo: ver.memo || '',
      aliases: parseArrayToText(ver.aliases),
      region_terms: parseArrayToText(ver.region_terms),
      competitors: parseArrayToText(ver.competitors),
      queries: parseArrayToText(ver.queries),
      naver_queries: parseArrayToText(ver.naver_queries),
    });
  };

  const handleAutoGenerateNaverQueries = () => {
    if (!versionForm.queries || !versionForm.queries.trim()) {
      alert('먼저 "분석 / 질의 문구" 탭에 질문을 입력해 주세요.');
      return;
    }
    const lines = versionForm.queries.split('\n').map((l) => l.trim()).filter(Boolean);
    const extracted = lines.map((line) => extractNaverKeywordsFromQuery(line)).filter(Boolean);
    const generatedText = extracted.join('\n');
    setVersionForm((prev) => ({
      ...prev,
      naver_queries: generatedText,
    }));
    setActiveTab('naver_queries');
  };

  const handleHospitalChange = (code: string) => {
    setSelectedHospitalCode(code);
    loadHospitalDetails(code, hospitals);
  };

  const handleVersionChange = (verId: number) => {
    setSelectedVersionId(verId);
    const ver = versions.find((v) => v.id === verId);
    if (ver) {
      bindVersionForm(ver);
    }
  };

  const handleNewHospital = () => {
    const nextNum = hospitals.length + 1;
    const newCode = `HOSP_${String(nextNum).padStart(3, '0')}`;
    setSelectedHospitalCode(newCode);
    setHospitalForm({
      hospital_code: newCode,
      name: '',
      director_name: '',
      phone: '',
      mobile: '',
      email: '',
      address: '',
      homepage: '',
    });
    setVersions([]);
    setSelectedVersionId(null);
    setVersionForm({
      version: 'v1.0',
      memo: '신규 병원 등록',
      aliases: '',
      region_terms: '',
      competitors: '',
      queries: '',
      naver_queries: '',
    });
  };

  const handleDeleteHospital = async () => {
    if (!selectedHospitalCode) return;
    if (!confirm(`정말로 병원 [${hospitalForm.name || selectedHospitalCode}]을(를) 삭제하시겠습니까? 관련 질문 세트 버전도 삭제됩니다.`)) {
      return;
    }

    try {
      // Delete versions
      await supabase.from('hospital_config_versions').delete().eq('hospital_code', selectedHospitalCode);
      // Delete hospital
      await supabase.from('hospitals').delete().eq('hospital_code', selectedHospitalCode);

      alert('삭제되었습니다.');
      onRefreshHospitals();
      fetchHospitals();
    } catch (e: any) {
      alert(`삭제 오류: ${e.message}`);
    }
  };

  const handleSaveCurrentVersion = async () => {
    if (!hospitalForm.name) {
      alert('병원 이름을 입력해 주세요.');
      return;
    }

    try {
      // 1. Upsert Hospital
      const { error: hospErr } = await supabase.from('hospitals').upsert({
        hospital_code: hospitalForm.hospital_code,
        name: hospitalForm.name,
        director_name: hospitalForm.director_name,
        phone: hospitalForm.phone,
        mobile: hospitalForm.mobile,
        email: hospitalForm.email,
        address: hospitalForm.address,
        homepage: hospitalForm.homepage,
        updated_at: new Date().toISOString(),
      });

      if (hospErr) throw hospErr;

      // Format textareas to JSON arrays for DB storage
      const aliasesJson = formatTextToArrayJson(versionForm.aliases);
      const regionTermsJson = formatTextToArrayJson(versionForm.region_terms);
      const competitorsJson = formatTextToArrayJson(versionForm.competitors);
      const queriesJson = formatTextToArrayJson(versionForm.queries);
      const naverQueriesJson = formatTextToArrayJson(versionForm.naver_queries);

      // 2. Upsert or Update selected version
      if (selectedVersionId) {
        const updatePayload: any = {
          version: versionForm.version,
          memo: versionForm.memo,
          aliases: aliasesJson,
          region_terms: regionTermsJson,
          competitors: competitorsJson,
          queries: queriesJson,
          naver_queries: naverQueriesJson,
          updated_at: new Date().toISOString(),
        };

        let { error: verErr } = await supabase
          .from('hospital_config_versions')
          .update(updatePayload)
          .eq('id', selectedVersionId);

        // 컬럼이 아직 DB에 생성되지 않은 경우 안내 및 fallback 시도
        if (verErr && verErr.message?.includes('naver_queries')) {
          const fallbackPayload = { ...updatePayload };
          delete fallbackPayload.naver_queries;
          const { error: fbErr } = await supabase
            .from('hospital_config_versions')
            .update(fallbackPayload)
            .eq('id', selectedVersionId);

          if (!fbErr) {
            alert('⚠️ DB에 naver_queries 컬럼이 없어 기존 항목들만 우선 저장되었습니다.\n\n네이버 질문셋도 함께 저장하려면 Supabase SQL Editor에서 아래 쿼리를 실행해 주세요:\n\nALTER TABLE public.hospital_config_versions ADD COLUMN IF NOT EXISTS naver_queries text;');
            onRefreshHospitals();
            fetchHospitals();
            return;
          }
        }

        if (verErr) throw verErr;
      } else {
        // Insert new version row
        const insertPayload: any = {
          hospital_code: hospitalForm.hospital_code,
          version: versionForm.version,
          memo: versionForm.memo,
          aliases: aliasesJson,
          region_terms: regionTermsJson,
          competitors: competitorsJson,
          queries: queriesJson,
          naver_queries: naverQueriesJson,
          is_active: true,
        };

        let { error: verErr } = await supabase.from('hospital_config_versions').insert(insertPayload);

        if (verErr && verErr.message?.includes('naver_queries')) {
          const fallbackPayload = { ...insertPayload };
          delete fallbackPayload.naver_queries;
          const { error: fbErr } = await supabase.from('hospital_config_versions').insert(fallbackPayload);
          if (!fbErr) {
            alert('⚠️ DB에 naver_queries 컬럼이 없어 기존 항목들만 우선 저장되었습니다.\n\n네이버 질문셋도 함께 저장하려면 Supabase SQL Editor에서 아래 쿼리를 실행해 주세요:\n\nALTER TABLE public.hospital_config_versions ADD COLUMN IF NOT EXISTS naver_queries text;');
            onRefreshHospitals();
            fetchHospitals();
            return;
          }
        }

        if (verErr) throw verErr;
      }

      alert('✅ 성공적으로 저장되었습니다!');
      onRefreshHospitals();
      fetchHospitals();
    } catch (e: any) {
      if (e.message?.includes('naver_queries')) {
        alert(`저장 실패: DB 테이블에 'naver_queries' 컬럼이 아직 없습니다.\n\nSupabase 대시보드 SQL Editor에서 다음 명령을 실행해 주세요:\n\nALTER TABLE public.hospital_config_versions ADD COLUMN IF NOT EXISTS naver_queries text;`);
      } else {
        alert(`저장 실패: ${e.message}`);
      }
    }
  };

  const handleSaveAsNewVersion = async () => {
    if (!hospitalForm.name) {
      alert('병원 이름을 입력해 주세요.');
      return;
    }

    const newVer = prompt('새 버전명을 입력하세요:', `v1.${versions.length + 1}`);
    if (!newVer) return;

    try {
      // 1. Upsert Hospital
      await supabase.from('hospitals').upsert({
        hospital_code: hospitalForm.hospital_code,
        name: hospitalForm.name,
        director_name: hospitalForm.director_name,
        phone: hospitalForm.phone,
        mobile: hospitalForm.mobile,
        email: hospitalForm.email,
        address: hospitalForm.address,
        homepage: hospitalForm.homepage,
        updated_at: new Date().toISOString(),
      });

      // Format textareas to JSON arrays for DB storage
      const aliasesJson = formatTextToArrayJson(versionForm.aliases);
      const regionTermsJson = formatTextToArrayJson(versionForm.region_terms);
      const competitorsJson = formatTextToArrayJson(versionForm.competitors);
      const queriesJson = formatTextToArrayJson(versionForm.queries);
      const naverQueriesJson = formatTextToArrayJson(versionForm.naver_queries);

      // 2. Insert new version
      const insertPayload: any = {
        hospital_code: hospitalForm.hospital_code,
        version: newVer,
        memo: versionForm.memo || '새 버전 생성',
        aliases: aliasesJson,
        region_terms: regionTermsJson,
        competitors: competitorsJson,
        queries: queriesJson,
        naver_queries: naverQueriesJson,
        is_active: true,
      };

      let { error: verErr } = await supabase.from('hospital_config_versions').insert(insertPayload);

      if (verErr && verErr.message?.includes('naver_queries')) {
        const fallbackPayload = { ...insertPayload };
        delete fallbackPayload.naver_queries;
        const { error: fbErr } = await supabase.from('hospital_config_versions').insert(fallbackPayload);
        if (!fbErr) {
          alert(`⚠️ DB에 naver_queries 컬럼이 없어 기존 항목들만 새 버전 [${newVer}]으로 저장되었습니다.\n\n네이버 질문셋도 함께 저장하려면 Supabase SQL Editor에서 아래 쿼리를 실행해 주세요:\n\nALTER TABLE public.hospital_config_versions ADD COLUMN IF NOT EXISTS naver_queries text;`);
          onRefreshHospitals();
          fetchHospitals();
          return;
        }
      }

      if (verErr) throw verErr;

      alert(`✅ 새 버전 [${newVer}]으로 저장되었습니다!`);
      onRefreshHospitals();
      fetchHospitals();
    } catch (e: any) {
      if (e.message?.includes('naver_queries')) {
        alert(`새 버전 저장 실패: DB 테이블에 'naver_queries' 컬럼이 아직 없습니다.\n\nSupabase 대시보드 SQL Editor에서 다음 명령을 실행해 주세요:\n\nALTER TABLE public.hospital_config_versions ADD COLUMN IF NOT EXISTS naver_queries text;`);
      } else {
        alert(`새 버전 저장 실패: ${e.message}`);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-[850px] h-[90vh] flex flex-col overflow-hidden border border-slate-300">
        {/* Header */}
        <div className="bg-[#0E2A47] text-white px-6 py-3 flex justify-between items-center shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-xl">📄</span>
            <h3 className="font-bold text-sm">병원 마스타 & 질문 세트 버전 관리</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-300 hover:text-white font-bold text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Top Hospital Select Bar */}
        <div className="bg-gray-100 px-6 py-3 border-b flex justify-between items-center text-xs font-semibold text-gray-800">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-gray-800">병원 선택:</span>
            <select
              value={selectedHospitalCode}
              onChange={(e) => handleHospitalChange(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1.5 bg-white text-black font-semibold text-xs outline-none focus:border-blue-500 min-w-[280px]"
            >
              {hospitals.map((h) => (
                <option key={h.hospital_code} value={h.hospital_code} className="text-black bg-white">
                  [{h.hospital_code}] {h.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleNewHospital}
              className="bg-teal-600 hover:bg-teal-700 text-white font-bold px-3 py-1.5 rounded flex items-center gap-1 transition-colors"
            >
              <span>+</span> 신규 병원
            </button>
          </div>

          <button
            onClick={handleDeleteHospital}
            className="bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1.5 rounded flex items-center gap-1 transition-colors"
          >
            <span>🗑️</span> 삭제
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4 text-xs text-gray-800">
          {/* Section 1: 병원 기본 정보 (마스타) */}
          <fieldset className="border border-gray-300 rounded p-4 bg-white">
            <legend className="font-bold text-gray-900 px-2 text-xs">병원 기본 정보 (마스타)</legend>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <div className="flex items-center">
                <span className="w-20 text-gray-800 font-semibold">병원 코드</span>
                <input
                  type="text"
                  value={hospitalForm.hospital_code}
                  readOnly
                  className="flex-1 border border-gray-300 bg-gray-100 text-gray-900 font-mono font-bold rounded px-2 py-1 outline-none"
                />
              </div>
              <div className="flex items-center">
                <span className="w-20 text-gray-900 font-bold">병원 이름 *</span>
                <input
                  type="text"
                  value={hospitalForm.name}
                  onChange={(e) => setHospitalForm({ ...hospitalForm, name: e.target.value })}
                  placeholder="병원 이름 입력"
                  className="flex-1 border border-gray-300 bg-white text-black font-bold rounded px-2 py-1 outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center">
                <span className="w-20 text-gray-800 font-semibold">병원장</span>
                <input
                  type="text"
                  value={hospitalForm.director_name || ''}
                  onChange={(e) => setHospitalForm({ ...hospitalForm, director_name: e.target.value })}
                  className="flex-1 border border-gray-300 bg-white text-black rounded px-2 py-1 outline-none focus:border-blue-500 font-medium"
                />
              </div>
              <div className="flex items-center">
                <span className="w-20 text-gray-800 font-semibold">병원 전화</span>
                <input
                  type="text"
                  value={hospitalForm.phone || ''}
                  onChange={(e) => setHospitalForm({ ...hospitalForm, phone: e.target.value })}
                  className="flex-1 border border-gray-300 bg-white text-black rounded px-2 py-1 outline-none focus:border-blue-500 font-medium"
                />
              </div>

              <div className="flex items-center">
                <span className="w-20 text-gray-800 font-semibold">휴대폰</span>
                <input
                  type="text"
                  value={hospitalForm.mobile || ''}
                  onChange={(e) => setHospitalForm({ ...hospitalForm, mobile: e.target.value })}
                  className="flex-1 border border-gray-300 bg-white text-black rounded px-2 py-1 outline-none focus:border-blue-500 font-medium"
                />
              </div>
              <div className="flex items-center">
                <span className="w-20 text-gray-800 font-semibold">이메일</span>
                <input
                  type="text"
                  value={hospitalForm.email || ''}
                  onChange={(e) => setHospitalForm({ ...hospitalForm, email: e.target.value })}
                  className="flex-1 border border-gray-300 bg-white text-black rounded px-2 py-1 outline-none focus:border-blue-500 font-medium"
                />
              </div>

              <div className="flex items-center col-span-2">
                <span className="w-20 text-gray-800 font-semibold">주소</span>
                <input
                  type="text"
                  value={hospitalForm.address || ''}
                  onChange={(e) => setHospitalForm({ ...hospitalForm, address: e.target.value })}
                  className="flex-1 border border-gray-300 bg-white text-black rounded px-2 py-1 outline-none focus:border-blue-500 font-medium"
                />
              </div>

              <div className="flex items-center col-span-2">
                <span className="w-20 text-gray-800 font-semibold">홈페이지 URL</span>
                <input
                  type="text"
                  value={hospitalForm.homepage || ''}
                  onChange={(e) => setHospitalForm({ ...hospitalForm, homepage: e.target.value })}
                  placeholder="https://..."
                  className="flex-1 border border-gray-300 bg-white text-black rounded px-2 py-1 outline-none focus:border-blue-500 font-medium"
                />
              </div>
            </div>
          </fieldset>

          {/* Section 2: 질문 세트 버전 관리 */}
          <fieldset className="border border-gray-300 rounded p-4 bg-white">
            <legend className="font-bold text-gray-900 px-2 text-xs">질문 세트 버전 관리</legend>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-gray-800 font-semibold">버전 선택:</span>
                <select
                  value={selectedVersionId || ''}
                  onChange={(e) => handleVersionChange(Number(e.target.value))}
                  className="border border-gray-300 rounded px-2 py-1 bg-white text-black font-semibold outline-none focus:border-blue-500 min-w-[200px]"
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.id} className="text-black bg-white">
                      {v.version} {v.is_active ? '(최신/활성)' : ''} - {v.created_at ? v.created_at.split('T')[0] : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-gray-800 font-semibold">버전명:</span>
                <input
                  type="text"
                  value={versionForm.version}
                  onChange={(e) => setVersionForm({ ...versionForm, version: e.target.value })}
                  className="border border-gray-300 bg-white text-black font-semibold rounded px-2 py-1 w-24 outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center gap-2 flex-1">
                <span className="text-gray-800 font-semibold">변경 메모:</span>
                <input
                  type="text"
                  value={versionForm.memo}
                  onChange={(e) => setVersionForm({ ...versionForm, memo: e.target.value })}
                  className="border border-gray-300 bg-white text-black rounded px-2 py-1 flex-1 outline-none focus:border-blue-500 font-medium"
                />
              </div>
            </div>
          </fieldset>

          {/* Section 3: Tabs & Textarea */}
          <div className="border border-gray-300 rounded overflow-hidden bg-white">
            <div className="flex bg-gray-100 border-b border-gray-300 overflow-x-auto">
              <button
                onClick={() => setActiveTab('aliases')}
                className={`px-3 py-2 font-bold text-xs border-r border-gray-300 whitespace-nowrap ${
                  activeTab === 'aliases'
                    ? 'bg-white text-orange-600 border-b-2 border-b-orange-500'
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                대표 / 별칭 명칭
              </button>
              <button
                onClick={() => setActiveTab('region_terms')}
                className={`px-3 py-2 font-bold text-xs border-r border-gray-300 whitespace-nowrap ${
                  activeTab === 'region_terms'
                    ? 'bg-white text-orange-600 border-b-2 border-b-orange-500'
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                지역 키워드
              </button>
              <button
                onClick={() => setActiveTab('competitors')}
                className={`px-3 py-2 font-bold text-xs border-r border-gray-300 whitespace-nowrap ${
                  activeTab === 'competitors'
                    ? 'bg-white text-orange-600 border-b-2 border-b-orange-500'
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                경쟁 병원
              </button>
              <button
                onClick={() => setActiveTab('queries')}
                className={`px-3 py-2 font-bold text-xs border-r border-gray-300 whitespace-nowrap ${
                  activeTab === 'queries'
                    ? 'bg-white text-orange-600 border-b-2 border-b-orange-500'
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                분석 / 질의 문구 (AI 공통)
              </button>
              <button
                onClick={() => setActiveTab('naver_queries')}
                className={`px-3 py-2 font-bold text-xs whitespace-nowrap flex items-center gap-1 ${
                  activeTab === 'naver_queries'
                    ? 'bg-white text-emerald-700 border-b-2 border-b-emerald-600 font-extrabold'
                    : 'text-emerald-800 bg-emerald-50/70 hover:bg-emerald-100'
                }`}
              >
                <span>🟢</span> 네이버 API 질의어 (전용 질문셋)
              </button>
            </div>

            <div className="p-3 bg-white space-y-2">
              {/* Naver Queries Toolbar & Auto Extraction Banner */}
              {activeTab === 'naver_queries' && (
                <div className="flex flex-wrap items-center justify-between bg-emerald-50 border border-emerald-200 rounded p-2.5 gap-2">
                  <div className="text-emerald-900 text-xs leading-relaxed">
                    <span className="font-bold">💡 네이버 지역검색 API 전용 질문셋:</span> 질문별 최대 4단어의 핵심 검색어를 줄바꿈으로 관리합니다.
                  </div>
                  <button
                    type="button"
                    onClick={handleAutoGenerateNaverQueries}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded shadow-sm flex items-center gap-1.5 transition-colors"
                  >
                    <span>⚡</span> 질문에서 4단어 자동 분리 및 불러오기
                  </button>
                </div>
              )}

              {/* Queries Tab Hint for Naver queries generation */}
              {activeTab === 'queries' && (
                <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded p-2 text-xs">
                  <span className="text-blue-900 font-medium">💡 생성형 AI (ChatGPT, Gemini, Perplexity 등) 공통 진단 질문 문구입니다.</span>
                  <button
                    type="button"
                    onClick={handleAutoGenerateNaverQueries}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-2.5 py-1 rounded flex items-center gap-1 shadow-sm transition-colors"
                  >
                    <span>⚡</span> 네이버 API 질문셋 자동 생성 ➔
                  </button>
                </div>
              )}

              <textarea
                rows={10}
                value={versionForm[activeTab]}
                onChange={(e) => setVersionForm({ ...versionForm, [activeTab]: e.target.value })}
                className="w-full p-3 border border-gray-200 bg-white text-black font-semibold rounded outline-none focus:border-orange-500 font-mono text-xs leading-relaxed"
                placeholder={
                  activeTab === 'naver_queries'
                    ? "네이버 지역검색 API에 전송할 핵심 키워드를 줄바꿈(Enter)으로 입력하세요.\n예:\n청주 비염 이비인후과\n청주 만성비염 코막힘 이비인후과\n청주 흥덕구 알레르기비염 이비인후과\n(상단의 '질문에서 4단어 자동 분리 및 불러오기' 버튼을 누르면 자동 추출됩니다.)"
                    : "항목을 줄바꿈(Enter)으로 구분하여 입력하세요."
                }
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-100 px-6 py-3 border-t flex justify-between items-center">
          <button
            onClick={onClose}
            className="bg-gray-500 hover:bg-gray-600 text-white px-5 py-1.5 rounded text-xs font-bold transition-colors"
          >
            닫기
          </button>

          <div className="flex gap-2">
            <button
              onClick={handleSaveAsNewVersion}
              className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-1.5 rounded text-xs font-bold transition-colors flex items-center gap-1 shadow"
            >
              <span>📌</span> 새 버전으로 저장 & JSON 생성
            </button>
            <button
              onClick={handleSaveCurrentVersion}
              className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-1.5 rounded text-xs font-bold transition-colors flex items-center gap-1 shadow"
            >
              <span>💾</span> 현재 버전 저장 & JSON 생성
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HospitalManagementModal;
