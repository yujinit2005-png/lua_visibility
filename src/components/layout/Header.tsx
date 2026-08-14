import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Settings, LogOut, Database, RefreshCw, Globe, Shield } from 'lucide-react';
import packageJson from '../../../package.json';

interface HeaderProps {
  onOpenHospitalMgmt: () => void;
  onOpenRerun: () => void;
  onOpenWebVerif: () => void;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenHospitalMgmt,
  onOpenRerun,
  onOpenWebVerif,
  onOpenSettings,
}) => {
  const { user, logout } = useAuth();

  return (
    <header className="w-full bg-slate-900 text-white h-14 px-6 flex items-center justify-between shadow-md border-b border-slate-800 shrink-0 z-30">
      
      {/* Left: Brand / Logo */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-gradient-to-tr from-orange-500 to-amber-500 text-white font-black italic flex items-center justify-center text-base rounded shadow-sm">
          lCA
        </div>
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-base tracking-tight text-white">
            루비스 (LUVIS)
          </span>
          <span className="text-[11px] font-bold text-white bg-orange-600 px-2 py-0.5 rounded-full shadow-sm">
            v{packageJson.version}
          </span>
          <span className="hidden md:inline text-xs text-slate-400 ml-1 font-normal border-l border-slate-700 pl-2">
            루아컴퍼니 AI 가시성 진단 시스템
          </span>
        </div>
      </div>

      {/* Center/Right: Navigation Menu Buttons */}
      <div className="flex items-center gap-2 sm:gap-3">
        
        {/* 1. 병원정보 질문세트관리 */}
        <button
          onClick={onOpenHospitalMgmt}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow-sm transition-all hover:border-slate-600 active:scale-95"
          title="병원 기본정보 및 질문 세트 관리"
        >
          <Database size={14} className="text-orange-400" />
          <span>병원정보 질문세트관리</span>
        </button>

        {/* 2. AI 가시성 진단 재실행 */}
        <button
          onClick={onOpenRerun}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#6D28D9]/40 hover:bg-[#6D28D9]/70 text-purple-200 border border-purple-500/40 shadow-sm transition-all hover:border-purple-400 active:scale-95"
          title="이전 진단 결과 조회 및 재실행"
        >
          <RefreshCw size={14} className="text-purple-300" />
          <span>AI가시성 진단 재실행</span>
        </button>

        {/* 3. 웹 UI 실측 및 교차비교 */}
        <button
          onClick={onOpenWebVerif}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#047857]/40 hover:bg-[#047857]/70 text-emerald-200 border border-emerald-500/40 shadow-sm transition-all hover:border-emerald-400 active:scale-95"
          title="실제 웹 브라우저 답변 실측 및 교차 비교"
        >
          <Globe size={14} className="text-emerald-300" />
          <span>웹 UI 실측 및 교차비교</span>
        </button>

        {/* 구분선 */}
        <div className="h-5 w-px bg-slate-700 mx-1" />

        {/* 4. 설정 (관리자 비밀번호 변경 등) */}
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all hover:text-white"
          title="관리자 계정 및 시스템 설정"
        >
          <Settings size={14} />
          <span className="hidden lg:inline">설정</span>
        </button>

        {/* 5. 사용자 정보 & 로그아웃 */}
        <div className="flex items-center gap-2 pl-1">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-300 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60">
            <Shield size={12} className="text-orange-400" />
            <span className="font-semibold text-white">{user?.username || 'luaadmin'}</span>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/30 transition-all"
            title="시스템 로그아웃"
          >
            <LogOut size={13} />
            <span className="hidden sm:inline">로그아웃</span>
          </button>
        </div>

      </div>
    </header>
  );
};

export default Header;
