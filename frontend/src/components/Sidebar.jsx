import React from 'react';
import { 
  LayoutDashboard, 
  Network, 
  Activity, 
  Sparkles, 
  BarChart3, 
  Bell,
  ChevronLeft,
  ChevronRight,
  Shield,
  Layers
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, collapsed, setCollapsed }) {
  const navItems = [
    {
      id: 'overview',
      name: 'Overview',
      icon: LayoutDashboard,
      badge: null
    },
    {
      id: 'enterprises',
      name: 'Enterprise Clients',
      icon: Network,
      badge: '5'
    },
    {
      id: 'detection',
      name: 'Live Detection',
      icon: Activity,
      badge: null
    },
    {
      id: 'few-shot',
      name: 'Few-Shot Zero-Day Lab',
      icon: Sparkles,
      badge: '12'
    },
    {
      id: 'research',
      name: 'Research Benchmarks',
      icon: BarChart3,
      badge: null
    },
    {
      id: 'alerts',
      name: 'Incident Alerts',
      icon: Bell,
      badge: null
    }
  ];

  return (
    <aside
      className={`border-r border-[#262626] bg-[#0D0D0D] flex flex-col transition-all duration-200 z-30 select-none ${
        collapsed ? 'w-16' : 'w-56'
      }`}
    >
      {/* Navigation Items */}
      <div className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        <div className="px-2.5 py-1 text-[11px] font-sans font-medium text-[#737373]">
          {!collapsed ? 'Console Navigation' : '•••'}
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              title={collapsed ? item.name : undefined}
              className={`w-full flex items-center rounded-sm transition-all duration-180 ease-out text-left relative group overflow-hidden ${
                collapsed ? 'justify-center p-2' : 'px-2.5 py-2'
              } ${
                isActive
                  ? 'bg-[#1A1613] text-[#EDEDED] font-medium border border-orange-500/40'
                  : 'text-[#A3A3A3] hover:text-[#EDEDED] hover:bg-[#181818] border border-transparent active:bg-[#151515]'
              }`}
            >
              {/* Smooth 180ms vertical orange active indicator */}
              <span
                aria-hidden="true"
                className={`absolute left-0 top-1 bottom-1 w-[3px] rounded-r-sm bg-[#F97316] transition-all duration-180 ease-out pointer-events-none ${
                  isActive
                    ? 'opacity-100 scale-y-100'
                    : 'opacity-0 scale-y-40 group-hover:opacity-35 group-hover:scale-y-75'
                }`}
              />

              <Icon
                className={`w-4 h-4 flex-shrink-0 transition-colors duration-180 ${
                  isActive ? 'text-[#F97316]' : 'text-[#737373] group-hover:text-[#EDEDED]'
                }`}
              />

              {!collapsed && (
                <div className="ml-2.5 flex-1 flex items-center justify-between min-w-0">
                  <span className="text-xs truncate tracking-tight">{item.name}</span>
                  {item.badge && (
                    <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-sm border transition-colors duration-180 ${
                      isActive 
                        ? 'bg-orange-950/60 text-orange-400 border-orange-800/60'
                        : 'bg-[#181818] text-[#737373] border-[#262626] group-hover:border-[#383838]'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Backbone Summary Footer */}
      {!collapsed ? (
        <div className="p-2.5 m-2 rounded-sm bg-[#141414] border border-[#262626] text-xs">
          <div className="flex items-center justify-between text-[#737373] text-[11px] mb-1.5 font-sans">
            <span className="flex items-center space-x-1.5 font-medium text-[#EDEDED]">
              <Layers className="w-3.5 h-3.5 text-orange-400" />
              <span>FedProx Engine</span>
            </span>
            <span className="text-emerald-400 text-[10px] font-mono font-medium flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-live-pulse" />
              <span>G20 Online</span>
            </span>
          </div>
          <div className="space-y-1 text-[10px] text-[#737373] font-mono">
            <div className="flex justify-between">
              <span>Proximal μ:</span>
              <span className="text-orange-400 font-semibold">0.1</span>
            </div>
            <div className="flex justify-between">
              <span>Partitions / Rounds:</span>
              <span className="text-[#EDEDED]">5 / 20</span>
            </div>
            <div className="flex justify-between">
              <span>Latent Dim:</span>
              <span className="text-orange-400 font-semibold">64-D</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-3 flex justify-center text-orange-400" title="FedProx G20 Active">
          <Shield className="w-4 h-4 text-orange-400" />
        </div>
      )}

      {/* Sidebar Collapse Toggle */}
      <div className="p-2 border-t border-[#262626] flex items-center justify-between">
        {!collapsed && <span className="text-[10px] text-[#737373] font-sans px-2">Collapse Panel</span>}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded-sm hover:bg-[#1E1E1E] text-[#737373] hover:text-[#EDEDED] transition-colors duration-150 mx-auto"
          aria-label="Toggle sidebar"
        >
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </div>
    </aside>
  );
}
