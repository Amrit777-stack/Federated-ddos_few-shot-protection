import React, { useState, useEffect } from 'react';
import { Shield, Server, Clock } from 'lucide-react';
import { formatLocalClock, getClientTimeZoneAbbr, getClientTimeZoneName } from '../utils/time';

export default function TopBar() {
  const [time, setTime] = useState(() => formatLocalClock());
  const timeZoneAbbr = getClientTimeZoneAbbr();
  const timeZoneName = getClientTimeZoneName();

  useEffect(() => {
    const update = () => {
      setTime(formatLocalClock());
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-12 border-b border-[#262626] bg-[#0D0D0D] px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40 select-none">
      {/* Brand Identity */}
      <div className="flex items-center space-x-3">
        <div className="w-6 h-6 rounded-sm bg-orange-950/40 border border-orange-700/60 flex items-center justify-center text-orange-400">
          <Shield className="w-3.5 h-3.5 text-orange-400" />
        </div>
        <div className="flex items-baseline space-x-2">
          <span className="font-sans font-bold text-sm tracking-tight text-[#EDEDED]">SENTINEL-FL</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-sm bg-[#181818] text-[#A3A3A3] font-mono border border-[#2B2B2B] font-semibold">
            v2.4
          </span>
          <span className="text-xs text-[#737373] hidden md:inline font-sans">
            Federated DDoS Defense & Few-Shot Zero-Day Detection
          </span>
        </div>
      </div>

      {/* Operational Telemetry */}
      <div className="flex items-center space-x-2.5 text-xs">
        {/* Engine Status */}
        <div className="hidden sm:flex items-center space-x-1.5 px-2 py-0.5 rounded-sm bg-[#141414] border border-[#262626] text-[11px] font-sans">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-live-pulse" />
          <span className="font-medium text-emerald-400">Engine Online</span>
        </div>

        {/* Model Backbone */}
        <div className="hidden lg:flex items-center space-x-1.5 px-2 py-0.5 rounded-sm bg-[#141414] border border-[#262626] text-[11px]">
          <Server className="w-3 h-3 text-orange-400" />
          <span className="font-mono text-orange-400 font-semibold">FedProx-G20</span>
          <span className="text-[#404040]">•</span>
          <span className="font-mono text-[#A3A3A3]">64-D Latent</span>
        </div>

        {/* Evaluation Pool Flag */}
        <div className="hidden xl:flex items-center space-x-1.5 px-2 py-0.5 rounded-sm bg-[#141414] border border-[#262626] text-[11px]">
          <span className="text-[#737373] font-sans">Pool:</span>
          <span className="font-mono text-[#EDEDED] font-semibold">18,088 Held-Out Flows</span>
        </div>

        {/* System Local Clock */}
        <div 
          className="flex items-center space-x-1.5 px-2 py-0.5 rounded-sm bg-[#141414] border border-[#262626] font-mono text-[11px]" 
          title={`Client System Time: ${timeZoneName} (${timeZoneAbbr})`}
        >
          <Clock className="w-3 h-3 text-[#737373]" />
          <span className="text-[#D4D4D4]">{time}</span>
          <span className="text-[10px] text-orange-400 font-semibold px-1 py-0.2 rounded-sm bg-[#1A1612] border border-orange-500/20">
            {timeZoneAbbr}
          </span>
        </div>
      </div>
    </header>
  );
}
