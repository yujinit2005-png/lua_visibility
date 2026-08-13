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
  is_active?: boolean;
  memo?: string;
  created_at?: string;
}

interface HospitalManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshHospitals: () => void;
}

export const HospitalManagementModal: React.FC<HospitalManagementModalProps> = ({
  isOpen,
  onClose,
  onRefreshHospitals,
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
  }>({
    version: 'v1.0',
    memo: '',
    aliases: '',
    region_terms: '',
    competitors: '',
    queries: '',
  });

  // Tab Selection
  const [activeTab, setActiveTab] = useState<'aliases' | 'region_terms' | 'competitors' | 'queries'>('aliases');
  const [_loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchHospitals();
    }
  }, [isOpen]);

  const fetchHospitals = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('hospitals')
        .select('*')
        .order('hospital_code', { ascending: true });

      if (error) throw error;
      setHospitals(data || []);
      
      if (data && data.length > 0) {
        const firstCode = data[0].hospital_code;
        setSelectedHospitalCode(firstCode);
        loadHospitalDetails(firstCode, data);
      } else {
        handleNewHospital();
      }
    } catch (e: any) {
      alert(`병원 목록 조회 실패: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadHospitalDetails = async (code: string, hospList: Hospital[]) => {
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
      setVersions(verData || []);

      if (verData && verData.length > 0) {
        const firstVer = verData[0];
        setSelectedVersionId(firstVer.id);
        bindVersionForm(firstVer);
      } else {
        // Reset version form
        setVersionForm({
          version: 'v1.0',
          memo: '기존 설정 파일',
          aliases: hosp ? `${hosp.name}\n` : '',
          region_terms: '',
          competitors: '',
          queries: '',
        });
        setSelectedVersionId(null);
      }
    } catch (e: any) {
      console.error('Versions fetch error', e);
    }
  };

  const parseArrayToText = (rawStr?: string): string => {
    if (!rawStr) return '';
    try {
      const trimmed = rawStr.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        const arr = JSON.parse(trimmed);
        if (Array.isArray(arr)) {
          return arr.join('\n');
        }
      }
    } catch (e) {
      // Fallback if not valid JSON
    }
    return rawStr;
  };

  const formatTextToArrayJson = (text: string): string => {
    if (!text) return '[]';
    const lines = text
      .split('\n')
      .map((line) => line.trim())
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
    });
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

      // 2. Upsert or Update selected version
      if (selectedVersionId) {
        const { error: verErr } = await supabase
          .from('hospital_config_versions')
          .update({
            version: versionForm.version,
            memo: versionForm.memo,
            aliases: aliasesJson,
            region_terms: regionTermsJson,
            competitors: competitorsJson,
            queries: queriesJson,
            updated_at: new Date().toISOString(),
          })
          .eq('id', selectedVersionId);

        if (verErr) throw verErr;
      } else {
        // Insert new version row
        const { error: verErr } = await supabase.from('hospital_config_versions').insert({
          hospital_code: hospitalForm.hospital_code,
          version: versionForm.version,
          memo: versionForm.memo,
          aliases: aliasesJson,
          region_terms: regionTermsJson,
          competitors: competitorsJson,
          queries: queriesJson,
          is_active: true,
        });

        if (verErr) throw verErr;
      }

      alert('✅ 성공적으로 저장되었습니다!');
      onRefreshHospitals();
      fetchHospitals();
    } catch (e: any) {
      alert(`저장 실패: ${e.message}`);
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

      // 2. Insert new version
      const { error: verErr } = await supabase.from('hospital_config_versions').insert({
        hospital_code: hospitalForm.hospital_code,
        version: newVer,
        memo: versionForm.memo || '새 버전 생성',
        aliases: aliasesJson,
        region_terms: regionTermsJson,
        competitors: competitorsJson,
        queries: queriesJson,
        is_active: true,
      });

      if (verErr) throw verErr;

      alert(`✅ 새 버전 [${newVer}]으로 저장되었습니다!`);
      onRefreshHospitals();
      fetchHospitals();
    } catch (e: any) {
      alert(`새 버전 저장 실패: ${e.message}`);
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
            <h2 className="text-base font-bold">병원 마스타 & 질문 세트 버전 관리</h2>
          </div>
          <button onClick={onClose} className="text-white hover:text-gray-300 text-2xl font-bold">
            &times;
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
            <div className="flex bg-gray-100 border-b border-gray-300">
              <button
                onClick={() => setActiveTab('aliases')}
                className={`px-4 py-2 font-bold text-xs border-r border-gray-300 ${
                  activeTab === 'aliases'
                    ? 'bg-white text-orange-600 border-b-2 border-b-orange-500'
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                대표 / 별칭 명칭 (줄바꿈 구분)
              </button>
              <button
                onClick={() => setActiveTab('region_terms')}
                className={`px-4 py-2 font-bold text-xs border-r border-gray-300 ${
                  activeTab === 'region_terms'
                    ? 'bg-white text-orange-600 border-b-2 border-b-orange-500'
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                지역 키워드 (줄바꿈 구분)
              </button>
              <button
                onClick={() => setActiveTab('competitors')}
                className={`px-4 py-2 font-bold text-xs border-r border-gray-300 ${
                  activeTab === 'competitors'
                    ? 'bg-white text-orange-600 border-b-2 border-b-orange-500'
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                경쟁 병원 (줄바꿈 구분)
              </button>
              <button
                onClick={() => setActiveTab('queries')}
                className={`px-4 py-2 font-bold text-xs ${
                  activeTab === 'queries'
                    ? 'bg-white text-orange-600 border-b-2 border-b-orange-500'
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                분석 / 질의 문구 (줄바꿈 구분)
              </button>
            </div>

            <div className="p-2 bg-white">
              <textarea
                rows={10}
                value={versionForm[activeTab]}
                onChange={(e) => setVersionForm({ ...versionForm, [activeTab]: e.target.value })}
                className="w-full p-3 border border-gray-200 bg-white text-black font-semibold rounded outline-none focus:border-orange-500 font-mono text-xs leading-relaxed"
                placeholder="항목을 줄바꿈(Enter)으로 구분하여 입력하세요."
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
