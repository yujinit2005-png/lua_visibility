import { useState } from 'react';
import LeftPanel from '../components/dashboard/LeftPanel';
import RightPanel from '../components/dashboard/RightPanel';
import Header from '../components/layout/Header';
import AdminSettingsModal from '../components/common/AdminSettingsModal';
import HospitalManagementModal from '../components/dashboard/HospitalManagementModal';
import RerunModal from '../components/dashboard/RerunModal';
import WebVerificationModal from '../components/dashboard/WebVerificationModal';
import StorageFileManagerModal from '../components/dashboard/StorageFileManagerModal';
import TrendAnalysisModal from '../components/dashboard/TrendAnalysisModal';
import { DashboardProvider, useDashboard } from '../contexts/DashboardContext';
import { useHospitals } from '../hooks/useHospitals';

const DashboardContent = () => {
  const { hospitalCode } = useDashboard();
  const { hospitals } = useHospitals();
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHospMgmtOpen, setIsHospMgmtOpen] = useState(false);
  const [isRerunOpen, setIsRerunOpen] = useState(false);
  const [isWebVerifOpen, setIsWebVerifOpen] = useState(false);
  const [isStorageManagerOpen, setIsStorageManagerOpen] = useState(false);
  const [isTrendAnalysisOpen, setIsTrendAnalysisOpen] = useState(false);

  const currentHosp = hospitals.find(h => h.hospital_code === hospitalCode);
  const hospitalName = currentHosp ? currentHosp.name : (hospitalCode || '병원');

  return (
    <div className="flex flex-col w-full h-screen bg-[#F0F4F8] overflow-hidden select-none">
      
      {/* Top Global Navigation Bar */}
      <Header
        onOpenHospitalMgmt={() => setIsHospMgmtOpen(true)}
        onOpenRerun={() => {
          if (!hospitalCode) return alert("대상 병원을 먼저 선택해 주세요.");
          setIsRerunOpen(true);
        }}
        onOpenWebVerif={() => {
          if (!hospitalCode) return alert("대상 병원을 먼저 선택해 주세요.");
          setIsWebVerifOpen(true);
        }}
        onOpenStorageManager={() => setIsStorageManagerOpen(true)}
        onOpenTrendAnalysis={() => {
          if (!hospitalCode) return alert("대상 병원을 먼저 선택해 주세요.");
          setIsTrendAnalysisOpen(true);
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Body (Left Control Panel + Right Wide Terminal Panel) */}
      <main className="flex flex-1 w-full h-[calc(100vh-3.5rem)] overflow-hidden">
        <LeftPanel
          isRerunOpen={isRerunOpen}
          setIsRerunOpen={setIsRerunOpen}
          isWebVerifOpen={isWebVerifOpen}
          setIsWebVerifOpen={setIsWebVerifOpen}
          isHospMgmtOpen={isHospMgmtOpen}
          setIsHospMgmtOpen={setIsHospMgmtOpen}
        />
        <RightPanel />
      </main>

      {/* Global Modals */}
      <AdminSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <HospitalManagementModal
        isOpen={isHospMgmtOpen}
        onClose={() => setIsHospMgmtOpen(false)}
        onRefreshHospitals={() => {
          window.location.reload();
        }}
      />

      <RerunModal
        isOpen={isRerunOpen}
        onClose={() => setIsRerunOpen(false)}
        hospitalCode={hospitalCode}
        hospitalName={hospitalName}
      />

      <WebVerificationModal
        isOpen={isWebVerifOpen}
        onClose={() => setIsWebVerifOpen(false)}
        hospitalCode={hospitalCode}
        hospitalName={hospitalName}
      />

      {/* [신규] 스토리지 파일 보관함 모달 */}
      <StorageFileManagerModal
        isOpen={isStorageManagerOpen}
        onClose={() => setIsStorageManagerOpen(false)}
        hospitalName={hospitalName}
      />

      {/* [신규] 다중 회차 추이 분석 대시보드 모달 */}
      <TrendAnalysisModal
        isOpen={isTrendAnalysisOpen}
        onClose={() => setIsTrendAnalysisOpen(false)}
        hospitalCode={hospitalCode}
        hospitalName={hospitalName}
      />
    </div>
  );
};

const Dashboard = () => {
  return (
    <DashboardProvider>
      <DashboardContent />
    </DashboardProvider>
  );
};

export default Dashboard;
