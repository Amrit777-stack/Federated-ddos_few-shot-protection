import React from 'react';
import { Server, ShieldCheck, Layers, Power } from 'lucide-react';
import StatusBadge from './StatusBadge';

export default function EnterpriseCard({ enterprise, onToggleStatus }) {
  const {
    id,
    name,
    clientSize,
    status,
    flParticipation,
    anomalyScore,
    trafficProfile = {},
    description,
    totalSamplesHeldout,
    isOffline: propIsOffline
  } = enterprise;

  const isOffline = propIsOffline || status === 'OFFLINE';
  const isAlert = !isOffline && (status === 'ALERT' || status === 'HIGH_ALERT' || status === 'ATTACK DETECTED' || status === 'CRITICAL');

  return (
    <div
      className={`p-4 sm:p-5 rounded-sm border flex flex-col justify-between transition-all duration-200 ${
        isOffline
          ? 'bg-[#0D0D0D] border-[#1F1F1F] opacity-90'
          : isAlert
          ? 'bg-[#141414] border-red-600/70 hover:border-red-500'
          : 'bg-[#141414] border-[#262626] hover:border-[#383838]'
      }`}
    >
      {/* Top Header */}
      <div>
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-sm border ${
              isOffline
                ? 'bg-[#181818] border-[#262626] text-[#525252]'
                : isAlert 
                ? 'bg-red-950/40 border-red-800/60 text-red-400' 
                : 'bg-orange-950/30 border-orange-700/40 text-orange-400'
            }`}>
              <Server className={`w-4 h-4 ${isOffline ? 'text-[#525252]' : isAlert ? 'text-red-400' : 'text-orange-400'}`} />
            </div>
            <div>
              <h4 className={`text-sm font-semibold font-sans tracking-tight ${isOffline ? 'text-[#737373]' : 'text-[#EDEDED]'}`}>
                {name}
              </h4>
              <p className="text-xs text-[#737373] font-sans mt-0.5">
                <span className="font-mono text-orange-400 font-bold">{id.toUpperCase()}</span> • {isOffline ? 'Partition Suspended' : 'Round 20/20 Participation'}
              </p>
            </div>
          </div>

          {/* Interactive Online / Offline Toggle Switch */}
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => onToggleStatus && onToggleStatus(id)}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border transition-colors duration-200 ease-in-out focus:outline-none ${
                isOffline 
                  ? 'bg-[#1F1F1F] border-[#333333] hover:border-[#444444]' 
                  : 'bg-emerald-600 border-emerald-500 hover:bg-emerald-500'
              }`}
              title={`Click to switch ${isOffline ? 'ONLINE' : 'OFFLINE'}`}
            >
              <span
                className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full shadow transition duration-200 ease-in-out mt-[2px] ml-[2px] ${
                  isOffline ? 'translate-x-0 bg-[#737373]' : 'translate-x-4 bg-white'
                }`}
              />
            </button>
            <StatusBadge status={isOffline ? 'OFFLINE' : (status || 'ONLINE')} size="xs" />
          </div>
        </div>

        {/* Offline Notice Banner */}
        {isOffline && (
          <div className="mb-3 p-2 rounded-sm bg-[#121212] border border-[#262626] text-[#737373] text-[11px] font-sans flex items-center space-x-1.5">
            <Power className="w-3.5 h-3.5 text-[#525252] flex-shrink-0" />
            <span>Partition is OFFLINE: Attack flows suppressed & gradient aggregation paused.</span>
          </div>
        )}

        {/* Description */}
        <p className="text-xs text-[#A3A3A3] font-sans mb-4 leading-relaxed">
          {description}
        </p>

        {/* Core Stats Grid */}
        <div className="grid grid-cols-2 gap-2.5 mb-4 p-3 rounded-sm bg-[#181818] border border-[#262626]">
          <div>
            <span className="text-[#737373] font-sans text-[11px] font-medium block">Client Dataset</span>
            <span className="text-sm font-mono font-semibold text-[#EDEDED]">
              {Number(clientSize).toLocaleString()}{' '}
              <span className="text-[11px] font-normal text-[#737373] font-sans">flows</span>
            </span>
          </div>

          <div>
            <span className="text-[#737373] font-sans text-[11px] font-medium block">FL Status</span>
            <span className={`text-sm font-mono font-semibold flex items-center space-x-1.5 ${isOffline ? 'text-[#737373]' : 'text-emerald-400'}`}>
              <ShieldCheck className={`w-3.5 h-3.5 flex-shrink-0 ${isOffline ? 'text-[#525252]' : 'text-emerald-400'}`} />
              <span>{isOffline ? 'Paused' : flParticipation}</span>
            </span>
          </div>

          <div>
            <span className="text-[#737373] font-sans text-[11px] font-medium block">Anomaly Score</span>
            <span className={`text-sm font-mono font-semibold ${isOffline ? 'text-[#525252]' : anomalyScore > 0.5 ? 'text-red-400' : 'text-[#EDEDED]'}`}>
              {isOffline ? '0.0%' : `${(anomalyScore * 100).toFixed(1)}%`}
            </span>
          </div>

          <div>
            <span className="text-[#737373] font-sans text-[11px] font-medium block">Held-Out Train Vol</span>
            <span className={`text-sm font-mono font-bold ${isOffline ? 'text-[#525252]' : 'text-orange-400'}`}>
              {Number(totalSamplesHeldout).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Non-IID Traffic Distribution Profile */}
        <div>
          <span className="text-xs font-sans font-medium text-[#A3A3A3] block mb-2">
            Non-IID Traffic Distribution (% class allocation)
          </span>

          <div className="space-y-2">
            {Object.entries(trafficProfile).map(([attackClass, pct]) => (
              <div key={attackClass} className="text-xs">
                <div className="flex justify-between text-xs mb-1 font-sans">
                  <span className={attackClass === 'BENIGN' ? 'text-emerald-400 font-medium' : 'text-[#A3A3A3]'}>
                    {attackClass}
                  </span>
                  <span className="text-orange-400 font-mono text-[11px]">{pct}%</span>
                </div>
                <div className="w-full h-1.5 bg-[#202020] rounded-sm overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      isOffline
                        ? 'bg-[#333333]'
                        : attackClass === 'BENIGN'
                        ? 'bg-emerald-500'
                        : attackClass.includes('UDP')
                        ? 'bg-red-500'
                        : 'bg-orange-500'
                    }`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer Node Bar */}
      <div className="mt-4 pt-3 border-t border-[#262626] flex items-center justify-between text-xs font-sans text-[#737373]">
        <span className="flex items-center space-x-1.5">
          <Layers className="w-3.5 h-3.5 text-orange-400" />
          <span>{isOffline ? 'Ingress Inactive' : 'Local SGD + Proximal Regularizer'}</span>
        </span>
        <span className="font-mono text-orange-400 font-semibold">{isOffline ? 'STATUS: OFF' : 'μ = 0.1'}</span>
      </div>
    </div>
  );
}
