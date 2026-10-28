import React, { useState } from 'react';
import { Shield, Server, Activity, AlertTriangle, CheckCircle2 } from 'lucide-react';
import StatusBadge from './StatusBadge';

export default function ThreatMap({ nodes = [], onSelectNode, selectedNodeId }) {
  const [hoveredNode, setHoveredNode] = useState(null);

  const defaultNodes = [
    { id: 'E1', name: 'Enterprise 1', status: 'ONLINE', samples: 11700, role: 'DNS/LDAP Core', traffic: 'DrDoS_DNS, DrDoS_LDAP', riskScore: 12 },
    { id: 'E2', name: 'Enterprise 2', status: 'ONLINE', samples: 15000, role: 'Gateway Interconnect', traffic: 'DrDoS_NTP, SSDP', riskScore: 18 },
    { id: 'E3', name: 'Enterprise 3', status: 'ONLINE', samples: 17400, role: 'Database & Syn Core', traffic: 'DrDoS_UDP, Syn', riskScore: 16 },
    { id: 'E4', name: 'Enterprise 4', status: 'ONLINE', samples: 13312, role: 'SCADA / SNMP', traffic: 'DrDoS_SNMP, NetBIOS', riskScore: 24 },
    { id: 'E5', name: 'Enterprise 5', status: 'ONLINE', samples: 14939, role: 'Edge Perimeter', traffic: 'TFTP, WebDDoS', riskScore: 21 }
  ];

  const displayNodes = nodes.length > 0 ? nodes : defaultNodes;

  const totalOffline = displayNodes.filter(n => n.status === 'OFFLINE' || n.isOffline).length;
  const onlineCount = displayNodes.length - totalOffline;

  const totalUnderAttack = displayNodes.filter(n => 
    (n.status === 'ATTACK DETECTED' || 
     n.status === 'CRITICAL' || 
     n.status === 'HIGH_ALERT' || 
     n.status === 'ALERT') &&
    n.status !== 'OFFLINE' &&
    !n.isOffline
  ).length;

  const xCoords = ['10%', '30%', '50%', '70%', '90%'];

  return (
    <div className="p-3.5 sm:p-4 rounded-sm bg-[#141414] border border-[#262626]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3">
        <div>
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-orange-400" />
            <h3 className="text-xs font-sans font-semibold text-[#EDEDED] tracking-normal">
              Federated Network Topology & Client Partitions
            </h3>
          </div>
          <p className="text-[11px] text-[#737373] font-sans mt-0.5">
            5 Non-IID enterprise client partitions with real-time threat telemetry & gradient synchronization
          </p>
        </div>

        <div className="flex items-center space-x-2 text-[11px] font-sans">
          <span className="text-[#737373]">Federation:</span>
          <span className={`px-2 py-0.5 rounded-sm font-medium flex items-center space-x-1 ${
            totalUnderAttack === 0
              ? 'bg-emerald-950/40 border border-emerald-700/40 text-emerald-300'
              : 'bg-red-950/50 border border-red-700/50 text-red-300'
          }`}>
            {totalUnderAttack === 0 ? (
              <>
                <CheckCircle2 className="w-3 h-3 text-emerald-400 inline mr-1" />
                <span>
                  {onlineCount}/5 Clients Online {totalOffline > 0 ? `(${totalOffline} Offline)` : '(Clean)'}
                </span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-3 h-3 text-red-400 inline mr-1" />
                <span>{onlineCount - totalUnderAttack}/{onlineCount} Clean • {totalUnderAttack} Under Attack</span>
              </>
            )}
          </span>
        </div>
      </div>

      {/* Topology Graph */}
      <div className="relative w-full h-[260px] bg-[#0D0D0D] rounded-sm border border-[#262626] p-3 flex flex-col justify-between">
        {/* Layer 1: Global Backbone Hub */}
        <div className="flex justify-center items-center relative z-10">
          <div className="px-3.5 py-1.5 rounded-sm bg-[#181818] border border-[#262626] flex items-center space-x-2.5">
            <div className="w-6 h-6 rounded-sm bg-orange-950/30 border border-orange-700/40 flex items-center justify-center text-orange-400">
              <Shield className="w-3.5 h-3.5 text-orange-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-sans font-semibold text-[#EDEDED]">FedProx Aggregator</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-sm bg-[#1E1E1E] text-orange-400 border border-[#2E2E2E] font-semibold">
                  G20 (20/20 Rounds)
                </span>
              </div>
              <div className="text-[10px] text-[#737373] font-sans">
                <span className="font-mono text-orange-400 font-semibold">μ = 0.1</span> Proximal Regularization • <span className="font-mono text-[#EDEDED] font-semibold">64-D</span> Latent Embeddings
              </div>
            </div>
          </div>
        </div>

        {/* SVG Dynamic Connecting Flow Lines with Subtle Telemetry Data-Flow Pulses */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
          {displayNodes.map((node, idx) => {
            const xPos = xCoords[idx] || `${10 + idx * 20}%`;
            const isOffline = node.status === 'OFFLINE' || node.isOffline;
            const isAttack = !isOffline && (node.status === 'ATTACK DETECTED' || node.status === 'CRITICAL' || node.status === 'HIGH_ALERT' || node.status === 'ALERT');
            const isLive = !isOffline && node.isLiveTarget;

            return (
              <React.Fragment key={`conn-${node.id}`}>
                {/* Structural Topology Guide Line */}
                <line
                  x1="50%"
                  y1="48"
                  x2={xPos}
                  y2="185"
                  stroke={isOffline ? '#262626' : isAttack ? '#EF4444' : isLive ? '#FB923C' : '#EA580C'}
                  strokeOpacity={isOffline ? 0.25 : isAttack ? 0.8 : isLive ? 0.7 : 0.35}
                  strokeWidth={isAttack ? 2 : 1.25}
                  strokeDasharray={isOffline ? '4 4' : isAttack ? '3 2' : undefined}
                />

                {/* Subtle Animated Data-Flow Pulse (Communicates Model/Telemetry Flow) */}
                {!isOffline && (
                  <line
                    x1="50%"
                    y1="48"
                    x2={xPos}
                    y2="185"
                    stroke={isAttack ? '#EF4444' : '#F97316'}
                    strokeOpacity={isAttack ? 0.7 : 0.45}
                    strokeWidth={isAttack ? 2 : 1.25}
                    strokeDasharray="3 14"
                    strokeLinecap="round"
                    className={isAttack ? 'animate-flow-attack' : 'animate-flow-normal'}
                    style={{ animationDelay: `${idx * 0.35}s` }}
                  />
                )}
              </React.Fragment>
            );
          })}
          <line x1="10%" y1="210" x2="90%" y2="210" stroke="#262626" strokeOpacity="0.4" strokeWidth="1" strokeDasharray="2 2" />
        </svg>

        {/* Layer 2: 5 Enterprise Client Nodes */}
        <div className="grid grid-cols-5 gap-2 relative z-10 pt-1">
          {displayNodes.map((node) => {
            const isSelected = selectedNodeId === node.id;
            const isOffline = node.status === 'OFFLINE' || node.isOffline;
            const isUnderAttack = !isOffline && (node.status === 'ATTACK DETECTED' || node.status === 'CRITICAL' || node.status === 'HIGH_ALERT' || node.status === 'ALERT');
            const isLiveTarget = !isOffline && node.isLiveTarget;

            return (
              <div
                key={node.id}
                onClick={() => onSelectNode && onSelectNode(node)}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                className={`p-2 rounded-sm border text-center transition-all duration-150 cursor-pointer select-none relative ${
                  isSelected
                    ? 'bg-[#1E1915] border-orange-500 shadow-[0_0_10px_-2px_rgba(249,115,22,0.3)]'
                    : isOffline
                    ? 'bg-[#0D0D0D] border-[#1F1F1F] text-[#525252] hover:border-[#2E2E2E]'
                    : isUnderAttack
                    ? 'bg-red-950/20 border-red-600/70 shadow-[0_0_10px_-2px_rgba(239,68,68,0.3)] hover:border-red-500 hover:bg-red-950/30'
                    : isLiveTarget
                    ? 'bg-[#1E1915] border-orange-400/70 hover:border-orange-400'
                    : 'bg-[#181818] border-[#262626] hover:border-orange-500/40 hover:-translate-y-[1px]'
                }`}
              >
                <div className="flex items-center justify-center space-x-1 mb-1">
                  <Server className={`w-3 h-3 ${isOffline ? 'text-[#525252]' : isUnderAttack ? 'text-red-400' : 'text-orange-400'}`} />
                  <span className={`text-xs font-mono font-bold ${isOffline ? 'text-[#525252]' : isUnderAttack ? 'text-red-200' : 'text-[#EDEDED]'}`}>
                    {node.id}
                  </span>
                </div>

                <div className="text-[11px] font-sans font-medium text-[#A3A3A3] truncate">
                  {node.name.split('(')[0].trim()}
                </div>

                <div className="text-[10px] text-[#737373] font-mono mt-0.5">
                  {Number(node.samples).toLocaleString()} flows
                </div>

                <div className="mt-1">
                  <StatusBadge status={isOffline ? 'OFFLINE' : (node.status || 'ONLINE')} size="xs" />
                </div>

                {isOffline ? (
                  <div className="mt-1 text-[9px] font-mono text-[#525252] truncate">
                    Ingress Suppressed
                  </div>
                ) : node.activeThreat ? (
                  <div className="mt-1 text-[9px] font-mono text-red-400 truncate font-semibold" title={node.activeThreat}>
                    {node.activeThreat}
                  </div>
                ) : (
                  <div className="mt-1 text-[9px] font-mono text-[#737373] truncate">
                    Risk: <span className="text-emerald-400">{node.riskScore || 14}%</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Node Status Summary Footer */}
      <div className="mt-2.5 p-2 rounded-sm bg-[#141414] border border-[#262626] flex flex-wrap items-center justify-between text-xs font-sans gap-2 text-[#737373]">
        <div className="flex items-center space-x-2">
          <span className="font-medium text-[#A3A3A3]">Participation:</span>
          {displayNodes.map((n, i) => {
            const isOff = n.status === 'OFFLINE' || n.isOffline;
            const isAttack = !isOff && (n.status === 'ATTACK DETECTED' || n.status === 'CRITICAL' || n.status === 'HIGH_ALERT' || n.status === 'ALERT');
            return (
              <React.Fragment key={n.id}>
                {i > 0 && <span className="text-[#333333]">•</span>}
                <span className={`font-mono ${isOff ? 'text-[#525252] line-through' : isAttack ? 'text-red-400 font-semibold' : 'text-[#EDEDED]'}`}>
                  {n.id} ({n.samples ? (n.samples / 1000).toFixed(1) + 'k' : ''})
                </span>
              </React.Fragment>
            );
          })}
        </div>

        <div className="text-[11px]">
          Status:{' '}
          <span className={totalUnderAttack > 0 ? 'text-red-400 font-semibold font-mono' : 'text-emerald-400 font-medium'}>
            {totalUnderAttack > 0 ? `${totalUnderAttack} Partition${totalUnderAttack > 1 ? 's' : ''} Under Attack` : `${onlineCount}/5 Ingress Active`}
          </span>
        </div>
      </div>
    </div>
  );
}
