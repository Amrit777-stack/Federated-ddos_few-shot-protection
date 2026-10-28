import React, { useState, useEffect } from 'react';
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
import { 
  fetchOverview, 
  fetchAlerts, 
  fetchFewShotSummary, 
  fetchLiveEvents, 
  mitigateAlert, 
  mitigateEnterpriseAlerts,
  isAlertMitigated,
  normalizeEnterpriseId,
  getOfflineEnterprises,
  toggleEnterpriseStatus
} from '../services/api';
import { Power } from 'lucide-react';

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

        if (overviewRes) setData(overviewRes);
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

    return () => {
      isMounted = false;
      clearInterval(interval);
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

  // Quick simulated mitigation directly from the homepage inspection card
  const handleQuickMitigate = async (alertIdOrList, enterpriseId = null) => {
    let ids = [];
    if (Array.isArray(alertIdOrList)) {
      ids = alertIdOrList.filter(Boolean);
    } else if (alertIdOrList) {
      ids = [alertIdOrList];
    }
    if (!ids.length && !enterpriseId) return;

    try {
      setMitigatingId(ids[0] || enterpriseId);

      const updatedTimestamp = new Date().toISOString();
      const normEnt = enterpriseId ? normalizeEnterpriseId(enterpriseId) : null;

      // Optimistically update local alerts immediately
      setAlerts(prev => prev.map(a => {
        const matchesId = ids.includes(a.id);
        const matchesEnt = normEnt && normalizeEnterpriseId(a.enterpriseId || a.enterpriseName) === normEnt;
        if (matchesId || matchesEnt) {
          return {
            ...a,
            status: 'MITIGATED · SIMULATION',
            mitigationStatus: 'MITIGATION_SIMULATED',
            mitigatedAt: updatedTimestamp
          };
        }
        return a;
      }));

      // Mitigate via batch endpoint if enterpriseId provided
      if (enterpriseId) {
        await mitigateEnterpriseAlerts(enterpriseId);
      }

      // Also mitigate individual alert IDs to ensure persistence
      if (ids.length > 0) {
        await Promise.all(ids.map(id => mitigateAlert(id).catch(err => console.error(err))));
      }

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
    const isOffline = offlineList.includes(normId) || node.status === 'OFFLINE';

    // If an enterprise is offline, attacks NEVER come for that enterprise
    if (isOffline) {
      return {
        ...node,
        status: 'OFFLINE',
        health: 'OFFLINE',
        riskScore: 0,
        activeThreat: null,
        activeAlertsCount: 0,
        activeAlerts: [],
        isLiveTarget: false,
        isOffline: true
      };
    }

    // Active unmitigated alerts targeting this node
    const activeAlerts = alerts.filter(a => {
      const target = normalizeEnterpriseId(a.enterpriseId || a.enterpriseName);
      return target === normId && !isAlertMitigated(a);
    });

    // Check if enterprise has recent mitigated alerts
    const enterpriseMitigatedAlerts = alerts.filter(a => {
      const target = normalizeEnterpriseId(a.enterpriseId || a.enterpriseName);
      return target === normId && isAlertMitigated(a);
    });

    const latestMitigatedTime = enterpriseMitigatedAlerts.reduce((latest, a) => {
      const t = a.mitigatedAt ? new Date(a.mitigatedAt).getTime() : 0;
      return t > latest ? t : latest;
    }, 0);

    // Recent live simulated detection event targeting this node
    const recentLiveEvent = liveEvents.find(e => {
      const target = normalizeEnterpriseId(e.enterprise_id || e.enterprise_name);
      return target === normId;
    });

    // A live event is ONLY considered an active ongoing attack if:
    // 1) It occurred recently (within the last 12 seconds)
    // 2) It is not BENIGN
    // 3) It occurred AFTER the latest mitigation timestamp (with a 5s grace window)
    const isLiveEventRecent = recentLiveEvent?.timestamp && 
      (Date.now() - new Date(recentLiveEvent.timestamp).getTime() < 12000);

    const isLiveAttack = isLiveEventRecent && 
      recentLiveEvent.prediction && 
      recentLiveEvent.prediction !== 'BENIGN' &&
      (!latestMitigatedTime || new Date(recentLiveEvent.timestamp).getTime() > (latestMitigatedTime + 5000));

    const hasActiveAlert = activeAlerts.length > 0;

    let status = 'ONLINE';
    let health = 'HEALTHY';
    let riskScore = node.riskScore || 14;
    let activeThreat = null;

    if (hasActiveAlert) {
      const topAlert = activeAlerts[0];
      activeThreat = topAlert.threatType;
      if (topAlert.severity === 'CRITICAL') {
        status = 'CRITICAL';
        health = 'CRITICAL';
        riskScore = 92;
      } else {
        status = 'ATTACK DETECTED';
        health = 'ELEVATED';
        riskScore = 78;
      }
    } else if (isLiveAttack) {
      status = 'ATTACK DETECTED';
      health = 'ELEVATED';
      riskScore = 74;
      activeThreat = recentLiveEvent.prediction;
    }

    return {
      ...node,
      status,
      health,
      riskScore,
      activeThreat,
      activeAlertsCount: activeAlerts.length,
      activeAlerts,
      isLiveTarget: Boolean(isLiveAttack),
      isOffline: false
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
                selectedNode.isOffline ? 'text-[#525252]' : selectedNode.status === 'ONLINE' ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {selectedNode.isOffline ? 'OFFLINE (Ingress Blocked)' : selectedNode.status === 'ONLINE' ? 'HEALTHY / ONLINE' : `UNDER ATTACK (${selectedNode.activeThreat})`}
              </span>
            </div>
            <div>
              <span className="text-[#737373] block text-[11px] font-sans">Dynamic Risk Score:</span>
              <span className={`font-mono font-bold ${
                selectedNode.isOffline ? 'text-[#525252]' : selectedNode.riskScore > 50 ? 'text-red-400' : 'text-emerald-400'
              }`}>
                {selectedNode.isOffline ? '0% (MUTED)' : `${selectedNode.riskScore}% ${selectedNode.riskScore > 50 ? '(ELEVATED)' : '(NORMAL)'}`}
              </span>
            </div>
          </div>

          {/* Action Required Banner if node is under attack */}
          {selectedNode.activeAlertsCount > 0 && selectedNode.activeAlerts?.[0] && (
            <div className="mt-3 pt-2.5 border-t border-[#262626] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-red-950/20 p-2.5 rounded-sm border border-red-800/50">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span className="text-red-200 text-[11px] font-sans">
                  Active Threat: <strong className="font-mono text-white">{selectedNode.activeAlerts[0].threatType}</strong> ({selectedNode.activeAlerts[0].id}) • Action Required
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  disabled={mitigatingId !== null}
                  onClick={() => handleQuickMitigate(selectedNode.activeAlerts.map(a => a.id), selectedNode.id)}
                  className="px-2.5 py-1 rounded-sm bg-orange-600 hover:bg-orange-500 text-white font-mono text-[11px] font-semibold flex items-center space-x-1 shadow-sm transition-all duration-150 border border-orange-500 disabled:opacity-50"
                >
                  {mitigatingId ? (
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
                  onClick={() => onNavigateTab && onNavigateTab('alerts')}
                  className="px-2.5 py-1 rounded-sm bg-[#181818] hover:bg-[#222222] border border-[#2E2E2E] text-[#A3A3A3] hover:text-[#EDEDED] font-sans text-[11px] flex items-center space-x-1 transition-colors duration-150"
                >
                  <span>Triage Runbook</span>
                  <ArrowRight className="w-3 h-3 ml-0.5 text-orange-400" />
                </button>
              </div>
            </div>
          )}

          {/* Protected Confirmation Banner when all threats targeting this node are mitigated */}
          {selectedNode.activeAlertsCount === 0 && !selectedNode.isOffline && (
            <div className="mt-3 pt-2.5 border-t border-[#262626] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-emerald-950/20 p-2.5 rounded-sm border border-emerald-800/50">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span className="text-emerald-300 text-[11px] font-sans">
                  Perimeter Protected • All threats mitigated • 1-NN similarity filter & dynamic rate-limiting active
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded-sm bg-emerald-950/70 text-emerald-400 border border-emerald-700/50 font-mono text-[10px] font-semibold">
                  STATUS: HEALTHY
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
