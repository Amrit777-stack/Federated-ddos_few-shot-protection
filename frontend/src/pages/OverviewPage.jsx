import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, 
  RotateCw, 
  Shield, 
  Sparkles, 
  Server,
  Activity,
  CheckCircle2,
  ArrowRight,
  AlertTriangle,
  Radio,
  Play
} from 'lucide-react';
import MetricCard from '../components/MetricCard';
import ThreatMap from '../components/ThreatMap';
import AlertFeed from '../components/AlertFeed';
import StatusBadge from '../components/StatusBadge';
import { 
  fetchOverview, 
  fetchAlerts, 
  fetchFewShotSummary, 
  fetchLiveEvents, 
  mitigateAlert, 
  restoreAlert,
  mitigateEnterpriseAlerts,
  restoreEnterpriseAlerts,
  isAlertActive,
  isAlertMitigated,
  isAlertResolved,
  getEnterpriseSecurityState,
  normalizeEnterpriseId,
  getOfflineEnterprises,
  toggleEnterpriseStatus
} from '../services/api';
import { Power } from 'lucide-react';
import { parseDate, formatEventTime, formatFullDateTime } from '../utils/time';

export default function OverviewPage({ onNavigateTab }) {
  const [data, setData] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [liveEvents, setLiveEvents] = useState([]);
  const [fewShotSummary, setFewShotSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [error, setError] = useState(null);
  const [mitigatingId, setMitigatingId] = useState(null);
  const [lastSyncTime, setLastSyncTime] = useState(new Date());
  const serverClockOffsetRef = useRef(0);

  // Polling loop to keep homepage dynamically synchronized with live attacks and incident mitigations
  useEffect(() => {
    let isMounted = true;

    async function load(isInitial = false) {
      try {
        if (isInitial) setLoading(true);
        const [overviewRes, alertsRes, fewShotRes, liveRes] = await Promise.all([
          fetchOverview().catch(() => null),
          fetchAlerts().catch(() => ({ alerts: [] })),
          fetchFewShotSummary().catch(() => null),
          fetchLiveEvents(10).catch(() => ({ events: [] }))
        ]);

        if (!isMounted) return;

        if (overviewRes) {
          setData(overviewRes);
          if (overviewRes.timestamp) {
            const serverMs = parseDate(overviewRes.timestamp)?.getTime();
            if (serverMs) {
              serverClockOffsetRef.current = serverMs - Date.now();
            }
          }
        }
        if (alertsRes?.alerts) setAlerts(alertsRes.alerts);
        if (fewShotRes) setFewShotSummary(fewShotRes);
        if (liveRes?.events) setLiveEvents(liveRes.events);
        setLastSyncTime(new Date());
      } catch (err) {
        if (isMounted) {
          console.error('Failed to load overview data:', err);
          setError(err.message);
        }
      } finally {
        if (isMounted && isInitial) setLoading(false);
      }
    }

    load(true);

    // Dynamic auto-sync every 3.5 seconds
    const interval = setInterval(() => {
      load(false);
    }, 3500);

    const handleSync = () => {
      load(false);
    };

    window.addEventListener('storage', handleSync);
    window.addEventListener('sentinel_attack_injected', handleSync);
    window.addEventListener('sentinel_alerts_updated', handleSync);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('storage', handleSync);
      window.removeEventListener('sentinel_attack_injected', handleSync);
      window.removeEventListener('sentinel_alerts_updated', handleSync);
    };
  }, []);

  // Toggle enterprise status directly from inspection card
  const handleToggleEnterprise = async (nodeId) => {
    try {
      await toggleEnterpriseStatus(nodeId);
      const [overviewRes, alertsRes] = await Promise.all([
        fetchOverview().catch(() => null),
        fetchAlerts().catch(() => ({ alerts: [] }))
      ]);
      if (overviewRes) setData(overviewRes);
      if (alertsRes?.alerts) setAlerts(alertsRes.alerts);
    } catch (err) {
      console.error('Failed to toggle enterprise status:', err);
    }
  };

  // Quick mitigation for an individual incident directly from the homepage inspection card
  const handleQuickMitigate = async (alertId) => {
    if (!alertId) return;

    try {
      setMitigatingId(alertId);
      const updatedTimestamp = new Date().toISOString();

      // Optimistically update ONLY this specific alert
      setAlerts(prev => prev.map(a => {
        if (a.id === alertId) {
          return {
            ...a,
            status: 'MITIGATED · SIMULATION',
            mitigationStatus: 'SIMULATED',
            mitigatedAt: updatedTimestamp
          };
        }
        return a;
      }));

      // Mitigate only this individual alert ID
      await mitigateAlert(alertId);

      // Re-synchronize alerts from backend
      const refreshed = await fetchAlerts().catch(() => null);
      if (refreshed?.alerts) {
        setAlerts(refreshed.alerts);
      }
    } catch (err) {
      console.error('Quick mitigation error:', err);
    } finally {
      setMitigatingId(null);
    }
  };

  // Quick unblock / restore directly from the homepage inspection card
  const handleQuickRestore = async (alertId) => {
    if (!alertId) return;

    try {
      setMitigatingId(alertId);
      const updatedTimestamp = new Date().toISOString();

      // Optimistically update ONLY this specific alert
      setAlerts(prev => prev.map(a => {
        if (a.id === alertId) {
          return {
            ...a,
            status: 'RESOLVED',
            mitigationStatus: 'RESTORED',
            resolvedAt: updatedTimestamp
          };
        }
        return a;
      }));

      // Restore only this individual alert ID
      await restoreAlert(alertId);

      // Re-synchronize alerts from backend
      const refreshed = await fetchAlerts().catch(() => null);
      if (refreshed?.alerts) {
        setAlerts(refreshed.alerts);
      }
    } catch (err) {
      console.error('Quick restore error:', err);
    } finally {
      setMitigatingId(null);
    }
  };

  const top = data?.topMetrics || {
    enterpriseClients: 5,
    flRounds: 20,
    fedproxAccuracy: 72.69,
    fewShotBestF1: 91.96,
    fewShotBestRecall: 97.48,
    centralizedRfAccuracy: 87.11,
    vanillaFedavgAccuracy: 57.42
  };

  const bestFewShot = fewShotSummary?.bestConfiguration || {
    averageF1: top.fewShotBestF1 || 91.96,
    averageRecall: top.fewShotBestRecall || 97.48,
    method: '1-NN',
    supportSize: 50
  };

  const totalAttacksEvaluated = fewShotSummary?.totalAttacks || 12;

  // Base raw nodes from telemetry or fallback
  const rawNodes = data?.federationNodes && data.federationNodes.length > 0
    ? data.federationNodes
    : [
        { id: 'E1', name: 'Enterprise 1 (DNS/LDAP Core)', samples: 11700, traffic: 'DrDoS_DNS, DrDoS_LDAP', riskScore: 12 },
        { id: 'E2', name: 'Enterprise 2 (NTP/SSDP Gateway)', samples: 15000, traffic: 'DrDoS_NTP, SSDP', riskScore: 18 },
        { id: 'E3', name: 'Enterprise 3 (Database & Syn Core)', samples: 17400, traffic: 'DrDoS_UDP, Syn', riskScore: 16 },
        { id: 'E4', name: 'Enterprise 4 (SNMP/NetBIOS Cluster)', samples: 13312, traffic: 'DrDoS_SNMP, NetBIOS', riskScore: 24 },
        { id: 'E5', name: 'Enterprise 5 (TFTP/WebDDoS Ingress)', samples: 14939, traffic: 'TFTP, WebDDoS', riskScore: 21 }
      ];

  // Dynamically enrich enterprise nodes with live unmitigated alerts & incoming traffic
  const offlineList = getOfflineEnterprises();

  const enrichedNodes = rawNodes.map(node => {
    const normId = node.id; // 'E1', 'E2', 'E3', etc.
    const targetDigit = normalizeEnterpriseId(normId);
    const isOffline = offlineList.includes(normId) || offlineList.includes(`E${targetDigit}`) || offlineList.includes(targetDigit) || node.status === 'OFFLINE';

    // Compute independent operational IDS security state strictly from ACTIVE incidents
    const secState = getEnterpriseSecurityState(normId, alerts, isOffline);

    // Active live packet telemetry targeting this enterprise (only flagged if currently under attack)
    const isLiveTarget = !isOffline && secState.status === 'UNDER ATTACK' && (liveEvents || []).some(e => {
      if (!e) return false;
      const target = normalizeEnterpriseId(e.enterprise_id || e.enterprise_name);
      return target === targetDigit && e.prediction && e.prediction !== 'BENIGN';
    });

    let status = secState.status;
    let health = secState.health;
    let riskScore = secState.riskScore;
    let activeThreat = secState.activeThreat;

    // Operational IDS state:
    // When an attack is injected or detected, secState.status === 'UNDER ATTACK' (red).
    // It remains red until the user explicitly clicks Mitigate (orange).
    // Only after restore does it return to ONLINE (green).
    if (secState.status === 'UNDER ATTACK' && !isOffline) {
      status = 'UNDER ATTACK';
      health = 'CRITICAL';
      activeThreat = secState.activeThreat || 'Volumetric Attack';
      riskScore = 86;
    } else if (secState.status === 'MITIGATED' && !isOffline) {
      status = 'MITIGATED';
      health = 'ELEVATED';
      activeThreat = secState.activeThreat || 'Mitigated Protection';
      riskScore = 32;
    } else if (!isOffline) {
      status = 'ONLINE';
      health = 'HEALTHY';
      riskScore = 12;
      activeThreat = null;
    }

    return {
      ...node,
      status,
      health,
      riskScore,
      activeThreat,
      currentAlert: secState.currentAlert,
      allIncidents: secState.allIncidents,
      activeAlertsCount: secState.activeAlertsCount,
      activeAlerts: secState.activeAlerts,
      mitigatedAlertsCount: secState.mitigatedAlertsCount,
      mitigatedAlerts: secState.mitigatedAlerts,
      resolvedAlertsCount: secState.resolvedAlertsCount,
      resolvedAlerts: secState.resolvedAlerts,
      isLiveTarget,
      isOffline
    };
  });

  const selectedNode = selectedNodeId 
    ? enrichedNodes.find(n => n.id === selectedNodeId) || null 
    : null;

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[350px] font-mono text-[#737373] text-xs">
        <RotateCw className="w-4 h-4 animate-spin mr-2 text-orange-400" />
        <span>Initializing telemetry...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Banner Notice */}
      <div className="p-3.5 rounded-sm bg-[#141414] border border-[#262626] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-sm bg-orange-950/30 text-orange-400 border border-orange-700/50">
            <Activity className="w-4 h-4 text-orange-400" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-sans font-semibold text-[#EDEDED] text-sm">
                SENTINEL-FL SOC Command Center
              </span>
              <span className="px-1.5 py-0.2 rounded-sm bg-[#181818] border border-[#2B2B2B] text-[#D4D4D4] text-[11px] font-mono font-semibold">
                5 Client Nodes
              </span>
              <span className="px-1.5 py-0.2 rounded-sm bg-emerald-950/40 border border-emerald-700/40 text-emerald-300 text-[10px] font-mono flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-live-pulse" />
                <span>Live Dynamic Telemetry</span>
              </span>
            </div>
            <p className="text-[#737373] text-xs mt-0.5 font-sans">
              Dual-tier defense: FedProx (μ=0.1, 20 rounds) backbone + 64-D penultimate few-shot zero-day exemplar cache.
            </p>
          </div>
        </div>

        <button
          onClick={() => onNavigateTab && onNavigateTab('few-shot')}
          className="px-3 py-1.5 rounded-sm bg-orange-600 hover:bg-orange-500 active:bg-orange-700 active:scale-[0.985] active:translate-y-[0.5px] border border-orange-500 text-white font-sans text-xs font-medium flex items-center space-x-1.5 transition-all duration-180 ease-out shadow-sm group"
        >
          <Sparkles className="w-3.5 h-3.5 text-white" />
          <span>Few-Shot Zero-Day Lab</span>
          <ArrowRight className="w-3.5 h-3.5 text-white/80 transition-transform duration-180 group-hover:translate-x-0.5" />
        </button>
      </div>

      {/* Top 4 Key Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          title="Enterprise Clients"
          value={top.enterpriseClients}
          subtitle="Non-IID federated nodes with localized packet distributions"
          icon={Users}
          badgeText="5 Active"
          badgeType="emerald"
        />

        <MetricCard
          title="FedProx Convergence"
          value={`Round ${top.flRounds}`}
          subtitle="20 communication rounds completed with proximal μ=0.1"
          icon={RotateCw}
          badgeText="Converged"
          badgeType="orange"
        />

        <MetricCard
          title="Global Model Accuracy"
          value={`${top.fedproxAccuracy}%`}
          subtitle={`+${(top.fedproxAccuracy - top.vanillaFedavgAccuracy).toFixed(2)}% over Vanilla FedAvg baseline (57.42%)`}
          icon={Shield}
          badgeText="G20 Online"
          badgeType="orange"
        />

        <MetricCard
          title={`Zero-Day Few-Shot F1 (${totalAttacksEvaluated} Attacks)`}
          value={`${bestFewShot.averageF1}%`}
          subtitle={`Optimal ${bestFewShot.supportSize}s ${bestFewShot.method} (Recall: ${bestFewShot.averageRecall}%) across all held-out attacks`}
          icon={Sparkles}
          badgeText="96 Configs"
          badgeType="emerald"
        />
      </div>

      {/* Main Grid: Threat Topology & Real-time Alert Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
        <div className="lg:col-span-2">
          <ThreatMap
            nodes={enrichedNodes}
            onSelectNode={(node) => setSelectedNodeId(node.id === selectedNodeId ? null : node.id)}
            selectedNodeId={selectedNodeId}
          />
        </div>

        <div className="lg:col-span-1">
          <AlertFeed
            alerts={alerts}
            onViewAll={() => onNavigateTab && onNavigateTab('alerts')}
            onSelectAlert={() => onNavigateTab && onNavigateTab('alerts')}
          />
        </div>
      </div>

      {/* Selected Node Detailed Inspection (if clicked) */}
      {selectedNode && (
        <div className="p-3.5 rounded-sm bg-[#141414] border border-[#262626] text-xs">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Server className="w-3.5 h-3.5 text-orange-400" />
              <span className="font-semibold text-[#EDEDED] font-sans">
                Inspection: {selectedNode.name} ({selectedNode.id})
              </span>
              <span className={`px-1.5 py-0.2 rounded-sm text-[10px] font-mono font-semibold ${
                selectedNode.isOffline 
                  ? 'bg-[#181818] text-[#737373] border border-[#262626]' 
                  : 'bg-[#181818] text-orange-400 border border-[#2E2E2E]'
              }`}>
                {selectedNode.isOffline ? 'OFFLINE' : 'Partition Client'}
              </span>
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleToggleEnterprise(selectedNode.id)}
                className={`px-2 py-1 rounded-sm text-[10px] font-mono font-semibold border transition-all flex items-center space-x-1 ${
                  selectedNode.isOffline
                    ? 'bg-emerald-950/40 border-emerald-600/60 text-emerald-300 hover:bg-emerald-900/60'
                    : 'bg-[#181818] border-[#2E2E2E] text-[#A3A3A3] hover:bg-[#222222] hover:border-[#404040]'
                }`}
                title={`Toggle ${selectedNode.id} status`}
              >
                <Power className="w-3 h-3" />
                <span>{selectedNode.isOffline ? 'BRING ONLINE' : 'TAKE OFFLINE'}</span>
              </button>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="text-[#737373] hover:text-[#EDEDED] transition-colors"
              >
                ✕ Close
              </button>
            </div>
          </div>

          {selectedNode.isOffline && (
            <div className="mb-2.5 p-2 rounded-sm bg-[#121212] border border-[#262626] text-[#737373] text-[11px] font-sans flex items-center space-x-2">
              <Power className="w-3.5 h-3.5 text-[#525252] flex-shrink-0" />
              <span>Partition is OFFLINE: Ingress attacks suppressed & federated gradient aggregation paused.</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-[#A3A3A3]">
            <div>
              <span className="text-[#737373] block text-[11px] font-sans">Local Dataset:</span>
              <span className="text-[#EDEDED] font-mono font-bold">
                {Number(selectedNode.samples).toLocaleString()} flow records
              </span>
            </div>
            <div>
              <span className="text-[#737373] block text-[11px] font-sans">Federation Status:</span>
              <span className={`font-sans font-medium ${selectedNode.isOffline ? 'text-[#525252]' : 'text-emerald-400'}`}>
                {selectedNode.isOffline ? 'OFFLINE (Suspended)' : 'ONLINE (Round 20/20)'}
              </span>
            </div>
            <div>
              <span className="text-[#737373] block text-[11px] font-sans">Current Security State:</span>
              <span className={`font-sans font-semibold ${
                selectedNode.isOffline 
                  ? 'text-[#525252]' 
                  : selectedNode.status === 'UNDER ATTACK' 
                  ? 'text-red-400' 
                  : selectedNode.status === 'MITIGATED'
                  ? 'text-orange-400'
                  : 'text-emerald-400'
              }`}>
                {selectedNode.isOffline 
                  ? 'OFFLINE (Ingress Blocked)' 
                  : selectedNode.status === 'UNDER ATTACK'
                  ? `UNDER ATTACK (${selectedNode.activeThreat || 'Alert Detected'})` 
                  : selectedNode.status === 'MITIGATED'
                  ? `MITIGATED · SIMULATION (${selectedNode.activeThreat || 'Protected'})`
                  : 'ONLINE / HEALTHY'}
              </span>
            </div>
            <div>
              <span className="text-[#737373] block text-[11px] font-sans">Dynamic Risk Score:</span>
              <span className={`font-mono font-bold ${
                selectedNode.isOffline 
                  ? 'text-[#525252]' 
                  : selectedNode.status === 'UNDER ATTACK' 
                  ? 'text-red-400' 
                  : selectedNode.status === 'MITIGATED'
                  ? 'text-orange-400'
                  : 'text-emerald-400'
              }`}>
                {selectedNode.isOffline ? '0% (MUTED)' : `${selectedNode.riskScore}% ${selectedNode.riskScore > 50 ? '(ELEVATED)' : '(NORMAL)'}`}
              </span>
            </div>
          </div>

          {/* Action Required Banner if node is under attack */}
          {selectedNode.status === 'UNDER ATTACK' && !selectedNode.isOffline && (
            <div className="mt-3 pt-2.5 border-t border-[#262626] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-red-950/20 p-2.5 rounded-sm border border-red-800/50">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span className="text-red-200 text-[11px] font-sans">
                  Active Threat: <strong className="font-mono text-white">{selectedNode.activeThreat || 'Volumetric Vector'}</strong> ({selectedNode.activeAlerts?.[0]?.id || `INCIDENT-${selectedNode.id}`}) • Action Required
                  {selectedNode.activeAlertsCount > 1 && (
                    <span className="ml-2 px-1.5 py-0.5 rounded-sm bg-red-900/60 text-red-300 font-mono text-[10px]">
                      {selectedNode.activeAlertsCount} active attacks queued
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  disabled={mitigatingId !== null}
                  onClick={() => handleQuickMitigate(selectedNode.activeAlerts?.[0]?.id)}
                  className="px-2.5 py-1 rounded-sm bg-orange-600 hover:bg-orange-500 text-white font-mono text-[11px] font-semibold flex items-center space-x-1 shadow-sm transition-all duration-150 border border-orange-500 disabled:opacity-50"
                  title="Mitigate current active incident"
                >
                  {mitigatingId === selectedNode.activeAlerts?.[0]?.id ? (
                    <>
                      <RotateCw className="w-3 h-3 animate-spin mr-1" />
                      <span>SIMULATING...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3 mr-1 fill-current" />
                      <span>SIMULATE MITIGATION</span>
                    </>
                  )}
                </button>
                <button
                  disabled={mitigatingId !== null}
                  onClick={() => handleQuickRestore(selectedNode.activeAlerts?.[0]?.id)}
                  className="px-2.5 py-1 rounded-sm bg-[#181818] hover:bg-[#222222] border border-[#2E2E2E] text-emerald-400 hover:text-emerald-300 font-mono text-[11px] font-semibold flex items-center space-x-1 transition-colors duration-150 disabled:opacity-50"
                  title="Resolve current active incident directly"
                >
                  {mitigatingId === selectedNode.activeAlerts?.[0]?.id ? (
                    <>
                      <RotateCw className="w-3 h-3 animate-spin mr-1" />
                      <span>RESOLVING...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-400" />
                      <span>RESOLVE</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => onNavigateTab && onNavigateTab('alerts')}
                  className="px-2.5 py-1 rounded-sm bg-[#181818] hover:bg-[#222222] border border-[#2E2E2E] text-[#A3A3A3] hover:text-[#EDEDED] font-sans text-[11px] flex items-center space-x-1 transition-colors duration-150"
                >
                  <span>Triage Runbook</span>
                  <ArrowRight className="w-3 h-3 ml-0.5 text-orange-400" />
                </button>
              </div>
            </div>
          )}

          {/* Mitigated Simulation Banner if node threats are currently mitigated */}
          {selectedNode.status === 'MITIGATED' && !selectedNode.isOffline && (
            <div className="mt-3 pt-2.5 border-t border-[#262626] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-orange-950/20 p-2.5 rounded-sm border border-orange-800/50">
              <div className="flex items-center space-x-2">
                <Shield className="w-4 h-4 text-orange-400 flex-shrink-0" />
                <span className="text-orange-200 text-[11px] font-sans">
                  🟠 Mitigated · Simulation • Rate-limiting & 50-shot exemplar filter active on {selectedNode.id}
                  {selectedNode.mitigatedAlertsCount > 1 && (
                    <span className="ml-2 px-1.5 py-0.5 rounded-sm bg-orange-900/60 text-orange-300 font-mono text-[10px]">
                      {selectedNode.mitigatedAlertsCount} mitigated queued
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  disabled={mitigatingId !== null}
                  onClick={() => handleQuickRestore(selectedNode.mitigatedAlerts?.[0]?.id)}
                  className="px-2.5 py-1 rounded-sm bg-[#1A1612] hover:bg-[#241D17] text-orange-300 font-mono text-[11px] font-semibold flex items-center space-x-1 shadow-sm transition-all duration-150 border border-orange-600/70 disabled:opacity-50"
                  title="Unblock and restore current mitigated incident"
                >
                  {mitigatingId === selectedNode.mitigatedAlerts?.[0]?.id ? (
                    <>
                      <RotateCw className="w-3 h-3 animate-spin mr-1" />
                      <span>RESTORING...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3 h-3 mr-1 text-orange-400" />
                      <span>UNBLOCK / RESTORE</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => onNavigateTab && onNavigateTab('alerts')}
                  className="px-2.5 py-1 rounded-sm bg-[#181818] hover:bg-[#222222] border border-[#2E2E2E] text-[#A3A3A3] hover:text-[#EDEDED] font-sans text-[11px] flex items-center space-x-1 transition-colors duration-150"
                >
                  <span>Triage Runbook</span>
                  <ArrowRight className="w-3 h-3 ml-0.5 text-orange-400" />
                </button>
              </div>
            </div>
          )}

          {/* Protected Confirmation Banner when node is online & all threats are resolved */}
          {selectedNode.status === 'ONLINE' && !selectedNode.isOffline && (
            <div className="mt-3 pt-2.5 border-t border-[#262626] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-emerald-950/20 p-2.5 rounded-sm border border-emerald-800/50">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="text-emerald-300 text-[11px] font-sans">
                  Perimeter Protected • All threats resolved • System operating normally
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded-sm bg-emerald-950/70 text-emerald-400 border border-emerald-700/50 font-mono text-[10px] font-semibold">
                  STATUS: ONLINE
                </span>
                <button
                  onClick={() => onNavigateTab && onNavigateTab('alerts')}
                  className="px-2.5 py-1 rounded-sm bg-[#181818] hover:bg-[#222222] border border-[#2E2E2E] text-[#A3A3A3] hover:text-[#EDEDED] font-sans text-[11px] flex items-center space-x-1 transition-colors duration-150"
                >
                  <span>Audit Log</span>
                  <ArrowRight className="w-3 h-3 ml-0.5 text-orange-400" />
                </button>
              </div>
            </div>
          )}

          {/* Incident Queue & History for this enterprise */}
          {selectedNode.allIncidents && selectedNode.allIncidents.length > 0 && (
            <div className="mt-3 pt-2.5 border-t border-[#262626]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-sans font-medium text-[#737373]">
                  Enterprise Incidents ({selectedNode.allIncidents.length} total • {selectedNode.activeAlertsCount} active):
                </span>
                <span className="text-[10px] font-mono text-[#525252]">
                  Latest active incident shown first
                </span>
              </div>
              <div className="max-h-44 overflow-y-auto rounded-sm border border-[#262626] divide-y divide-[#262626]">
                {selectedNode.allIncidents.map((inc, idx) => {
                  const isActive = isAlertActive(inc);
                  const isMitigated = isAlertMitigated(inc);
                  const isCurrent = idx === 0;

                  return (
                    <div
                      key={inc.id}
                      className={`p-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] ${
                        isCurrent && isActive
                          ? 'bg-red-950/20 text-[#EDEDED]'
                          : isCurrent && isMitigated
                          ? 'bg-orange-950/20 text-[#EDEDED]'
                          : 'bg-[#101010] text-[#A3A3A3]'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-[10px] text-[#737373]">
                          {formatEventTime(inc.timestamp)}
                        </span>
                        <span className="font-mono font-semibold text-white">
                          {inc.threatType}
                        </span>
                        <span className="text-[10px] font-mono text-[#737373]">
                          ({inc.id})
                        </span>
                        {isCurrent && isActive && (
                          <span className="px-1.5 py-0.2 rounded-sm bg-red-900/60 text-red-300 font-mono text-[9px] font-bold">
                            CURRENT ACTIVE
                          </span>
                        )}
                        {isCurrent && isMitigated && (
                          <span className="px-1.5 py-0.2 rounded-sm bg-orange-900/60 text-orange-300 font-mono text-[9px] font-bold">
                            CURRENT MITIGATED
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-2">
                        <StatusBadge status={inc.status} size="xs" />
                        {isActive && (
                          <>
                            <button
                              disabled={mitigatingId !== null}
                              onClick={() => handleQuickMitigate(inc.id)}
                              className="px-2 py-0.5 rounded-sm bg-orange-600 hover:bg-orange-500 text-white font-mono text-[10px] font-semibold transition-all disabled:opacity-50"
                            >
                              Mitigate
                            </button>
                            <button
                              disabled={mitigatingId !== null}
                              onClick={() => handleQuickRestore(inc.id)}
                              className="px-2 py-0.5 rounded-sm bg-[#181818] hover:bg-[#222222] border border-[#2E2E2E] text-emerald-400 hover:text-emerald-300 font-mono text-[10px] font-semibold transition-all disabled:opacity-50"
                            >
                              Resolve
                            </button>
                          </>
                        )}
                        {isMitigated && (
                          <button
                            disabled={mitigatingId !== null}
                            onClick={() => handleQuickRestore(inc.id)}
                            className="px-2 py-0.5 rounded-sm bg-[#1A1612] hover:bg-[#251D16] text-orange-300 border border-orange-600/70 font-mono text-[10px] font-semibold transition-all disabled:opacity-50"
                          >
                            Restore
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom Architectural Summary Bar */}
      <div className="p-2.5 rounded-sm bg-[#141414] border border-[#262626] flex flex-col md:flex-row items-center justify-between gap-2 text-xs font-sans text-[#737373]">
        <div className="flex items-center space-x-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[#A3A3A3]">
            Dual-Tier Pipeline: Known attacks classified by FedProx 12/13-Class Head; unseen zero-day attacks resolved via 64-D 1-NN Exemplar Cache.
          </span>
        </div>
        <div className="flex items-center space-x-2 text-[11px] font-mono">
          <span className="text-orange-400 font-semibold">Backbone: PyTorch G20</span>
          <span className="text-[#333333]">|</span>
          <span className="text-[#D4D4D4]">Zero-Day Budget: k ∈ [10, 20, 50, 100]</span>
        </div>
      </div>
    </div>
  );
}
