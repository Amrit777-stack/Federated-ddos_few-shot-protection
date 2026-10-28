import React, { useRef, useEffect } from 'react';
import { ShieldAlert, ArrowUpRight, AlertCircle } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { isAlertActive, isAlertMitigated, isAlertResolved } from '../services/api';
import { formatEventTime, formatFullDateTime } from '../utils/time';

export default function AlertFeed({ alerts = [], onSelectAlert, onViewAll }) {
  const isFirstRenderRef = useRef(true);
  const seenIdsRef = useRef(new Set());

  useEffect(() => {
    if (isFirstRenderRef.current) {
      alerts.forEach(a => {
        if (a && a.id) seenIdsRef.current.add(a.id);
      });
      isFirstRenderRef.current = false;
    }
  }, [alerts]);

  return (
    <div className="p-3.5 sm:p-4 rounded-sm bg-[#141414] border border-[#262626] flex flex-col h-full">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center space-x-2">
          <ShieldAlert className="w-4 h-4 text-orange-400" />
          <h3 className="text-xs font-sans font-semibold text-[#EDEDED]">
            Ingress Threat Feed
          </h3>
        </div>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="text-[11px] font-sans text-orange-400 hover:text-orange-300 flex items-center space-x-1 transition-colors duration-150"
          >
            <span>View All</span>
            <ArrowUpRight className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto max-h-[285px] pr-0.5">
        {alerts.length === 0 ? (
          <div className="text-center py-6 text-[#737373] text-xs font-sans">
            No active threat alerts in queue.
          </div>
        ) : (
          alerts.slice(0, 5).map((alert) => {
            const isResolved = isAlertResolved(alert);
            const isMitigated = !isResolved && isAlertMitigated(alert);
            const isActiveHigh = !isResolved && !isMitigated && (
              alert.severity === 'HIGH' || 
              alert.severity === 'CRITICAL' || 
              isAlertActive(alert)
            );

            // Only animate new arrivals; existing incidents remain stable
            const isNew = !seenIdsRef.current.has(alert.id);
            if (isNew) {
              seenIdsRef.current.add(alert.id);
            }

            return (
              <div
                key={alert.id}
                onClick={() => onSelectAlert && onSelectAlert(alert)}
                className={`p-2.5 rounded-sm border transition-all duration-150 cursor-pointer ${
                  isNew ? 'animate-incident-slide-in' : ''
                } ${
                  isActiveHigh
                    ? 'bg-red-950/20 border-red-800/50 hover:border-red-600/70 hover:bg-red-950/30'
                    : isMitigated
                    ? 'bg-amber-950/20 border-amber-800/40 hover:border-amber-700/60 hover:bg-amber-950/30'
                    : isResolved
                    ? 'bg-[#151515] border-[#222222] hover:border-[#333333] opacity-80 hover:opacity-100'
                    : 'bg-[#181818] border-[#262626] hover:border-orange-500/40 hover:bg-[#1E1915]'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-1.5 min-w-0">
                    <span className="font-sans text-xs font-semibold text-[#EDEDED] truncate">
                      {alert.threatType}
                    </span>
                    <span className="text-[10px] font-mono px-1 py-0.2 rounded-sm bg-[#1E1E1E] text-[#A3A3A3] border border-[#2B2B2B] font-semibold">
                      {alert.id}
                    </span>
                  </div>
                  <StatusBadge status={alert.status} size="xs" />
                </div>

                <div className="mt-1 flex items-center justify-between text-[11px] text-[#737373] font-sans">
                  <div className="flex items-center space-x-1.5 min-w-0">
                    <span className="truncate">{alert.enterpriseName}</span>
                    {alert.timestamp && (
                      <span 
                        className="font-mono text-[10px] text-[#A3A3A3] cursor-help"
                        title={formatFullDateTime(alert.timestamp, true)}
                      >
                        • {formatEventTime(alert.timestamp)}
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-orange-400 font-medium">
                    {(alert.confidence * 100).toFixed(1)}% conf
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-2.5 pt-2 border-t border-[#262626] text-[11px] text-[#737373] font-sans flex items-center justify-between">
        <span className="flex items-center space-x-1">
          <AlertCircle className="w-3.5 h-3.5 text-orange-400" />
          <span>Simulated event stream</span>
        </span>
        <span className="font-mono text-[10px] text-[#EDEDED] font-medium">Zero-Day Filter: Ready</span>
      </div>
    </div>
  );
}
