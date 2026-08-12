import React from 'react';
import LeftPanel from '../components/dashboard/LeftPanel';
import RightPanel from '../components/dashboard/RightPanel';
import { DashboardProvider } from '../contexts/DashboardContext';

const Dashboard = () => {
  return (
    <DashboardProvider>
      <div className="flex w-full h-screen bg-[#F0F4F8] overflow-hidden">
        <LeftPanel />
        <RightPanel />
      </div>
    </DashboardProvider>
  );
};

export default Dashboard;
