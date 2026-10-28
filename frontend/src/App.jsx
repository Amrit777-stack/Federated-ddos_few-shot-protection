import React, { useState } from 'react';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import OverviewPage from './pages/OverviewPage';
import EnterprisePage from './pages/EnterprisePage';
import DetectionPage from './pages/DetectionPage';
import FewShotLabPage from './pages/FewShotLabPage';
import ResearchPage from './pages/ResearchPage';
import AlertsPage from './pages/AlertsPage';

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-soc-bg text-soc-text flex flex-col font-sans selection:bg-orange-600/30 selection:text-orange-200 relative">
      {/* Precision Industrial Security Console Background */}
      <div className="soc-bg-canvas" aria-hidden="true">
        <div className="soc-grid-layer" />
        <div className="soc-dots-layer" />
        <div className="soc-console-glow" />
      </div>

      {/* Global Command TopBar */}
      <TopBar />

      {/* Main Body Layout: Sidebar + Page Content */}
      <div className="flex-1 flex overflow-hidden relative z-10">
        {/* Navigation Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          collapsed={collapsed}
          setCollapsed={setCollapsed}
        />

        {/* Dynamic Page View Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6 w-full max-w-[1720px] mx-auto">
          {activeTab === 'overview' && (
            <OverviewPage onNavigateTab={(tab) => setActiveTab(tab)} />
          )}
          {activeTab === 'enterprises' && <EnterprisePage />}
          {activeTab === 'detection' && <DetectionPage />}
          {activeTab === 'few-shot' && <FewShotLabPage />}
          {activeTab === 'research' && <ResearchPage />}
          {activeTab === 'alerts' && <AlertsPage />}
        </main>
      </div>
    </div>
  );
}
