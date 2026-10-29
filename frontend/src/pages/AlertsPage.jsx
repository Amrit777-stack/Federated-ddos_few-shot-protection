import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  ShieldAlert, 
  CheckCircle2, 
  RotateCw, 
  AlertTriangle,
  Play,
  Filter,
  Check
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import { 
  fetchAlerts, 
  mitigateAlert, 
  restoreAlert, 
  isAlertActive, 
  isAlertMitigated, 
  isAlertResolved, 
  resetAlertSimulation 
} from '../services/api';
import { formatEventTime, formatFullDateTime } from '../utils/time';

const ATTACK_RECOMMENDED_MITIGATIONS = {
  'Syn': [
    'Enable TCP SYN Cookies',
    'Enforce half-open connection limits',
    'Block spoofed source ranges'
  ],
  'DrDoS_UDP': [
    'Deploy 50-shot 1-NN similarity filter at perimeter ingress',
    'Rate-limit UDP reflection amplification vectors',
    'Block spoofed UDP sources via BCP 38 filtering'
  ],
  'DrDoS_SNMP': [
    'Filter inbound UDP port 161 reflection responses',
    'Isolate public SNMP community string reflectors',
    'Enforce edge rate-limiting rules'
  ],
  'DrDoS_NetBIOS': [
    'Throttle broadcast NetBIOS NS query floods',
    'Block inbound NetBIOS ports (137/138/139) at perimeter edge',
    'Update few-shot support exemplar cache'
  ],
  'DrDoS_DNS': [
    'Apply Response Rate Limiting (RRL) on resolvers',
    'Drop non-whitelisted ANY and large TXT query floods',
    'Enforce source-IP validation on upstream transit links'
  ],
  'DrDoS_LDAP': [
    'Block unauthenticated CLDAP rootDSE search requests (port 389)',
    'Deploy deep packet inspection for LDAP reflection vectors',
    'Engage cloud scrubbing provider for upstream filtering'
  ],
  'DrDoS_MSSQL': [
    'Block inbound Microsoft SQL Server Browser queries (UDP 1434)',
    'Disable SQL Server Resolution Protocol (SSRP) on public interfaces',
    'Apply few-shot exemplar centroid filter on ingress flows'
  ],
  'DrDoS_NTP': [
    'Disable monlist / querylog features (ntpd >= 4.2.7p26)',
    'Filter asymmetric UDP port 123 amplification bursts',
    'Deploy ingress packet rate limiters on gateway routers'
  ],
  'DrDoS_SSDP': [
    'Block incoming SSDP M-SEARCH reflection responses (UDP 1900)',
    'Disable Universal Plug and Play (UPnP) on perimeter interfaces',
    'Apply 1-NN few-shot zero-day signature to border gateway'
  ],
  'TFTP': [
    'Block unauthorized UDP port 69 transfer initialization requests',
    'Rate-limit high-frequency read/write (RRQ/WRQ) packet sequences',
    'Route suspicious transit traffic to virtual inspection sandbox'
  ],
  'UDP-lag': [
    'Enforce jitter and latency anomaly detection thresholds',
    'Throttle fragmented packet bursts exceeding normal flow envelope',
    'Prioritize benign session traffic using QoS queue shaping'
  ],
  'WebDDoS': [
    'Activate HTTP challenge-response (JS / CAPTCHA validation)',
    'Apply application-layer request rate limiting per IP / JA3 hash',
    'Deploy WAF rule to block suspicious Layer-7 flood patterns'
  ]
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mitigating, setMitigating] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState('ALL');

  // Background polling loop to keep incident queue synchronized with live detected attacks & mitigations
  useEffect(() => {
    let isMounted = true;

    async function load(isInitial = false) {
      try {
        if (isInitial) setLoading(true);
        const res = await fetchAlerts();
        const loadedAlerts = res.alerts || [];
        if (!isMounted) return;

        setAlerts(loadedAlerts);

        setSelectedAlert(prev => {
          const activeAlert = loadedAlerts.find(a => isAlertActive(a));
          const mitigatedAlert = loadedAlerts.find(a => isAlertMitigated(a));
          const resolvedAlert = loadedAlerts.find(a => isAlertResolved(a));

          if (prev) {
            const updated = loadedAlerts.find(a => a.id.toLowerCase() === prev.id.toLowerCase());
            if (updated) {
              // If previously selected alert is now RESOLVED, prioritize any existing ACTIVE or MITIGATED alert
              if (isAlertResolved(updated)) {
                if (activeAlert) return activeAlert;
                if (mitigatedAlert) return mitigatedAlert;
              }
              return updated;
            }
          }

          // Prioritize: ACTIVE → MITIGATED → RESOLVED
          return activeAlert || mitigatedAlert || resolvedAlert || loadedAlerts[0] || null;
        });
      } catch (err) {
        console.error('Failed to load alerts:', err);
      } finally {
        if (isInitial && isMounted) {
          setLoading(false);
        }
      }
    }

    load(true);
    const interval = setInterval(() => load(false), 2500);

    const handleSync = (e) => {
      load(false);
      if (e?.detail?.alert) {
        setSelectedAlert(e.detail.alert);
      }
    };

    window.addEventListener('sentinel_attack_injected', handleSync);
    window.addEventListener('sentinel_alerts_updated', handleSync);
    window.addEventListener('storage', handleSync);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('sentinel_attack_injected', handleSync);
      window.removeEventListener('sentinel_alerts_updated', handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  const handleMitigate = async (alertId) => {
    if (!alertId) return;
    try {
      setMitigating(true);

      // Optimistically update local state immediately so table & details update instantly
      const updatedTimestamp = new Date().toISOString();
      const applyUpdate = (a) => {
        if (a.id === alertId) {
          return {
            ...a,
            status: 'MITIGATED · SIMULATION',
            mitigationStatus: 'SIMULATED',
            mitigatedAt: updatedTimestamp
          };
        }
        return a;
      };

      setAlerts(prev => prev.map(applyUpdate));
      setSelectedAlert(prev => prev && prev.id === alertId ? applyUpdate(prev) : prev);

      // Call backend to persist override in server and localStorage
      const res = await mitigateAlert(alertId);
      if (res.success && res.alert) {
        setAlerts(prev => prev.map(a => (a.id === alertId ? res.alert : a)));
        setSelectedAlert(res.alert);
      }
    } catch (err) {
      console.error('Mitigation error:', err);
    } finally {
      setMitigating(false);
    }
  };

  const handleRestore = async (alertId) => {
    if (!alertId) return;
    try {
      setMitigating(true);

      // Optimistically update local state immediately to RESOLVED
      const updatedTimestamp = new Date().toISOString();
      const applyRestore = (a) => {
        if (a.id === alertId) {
          return {
            ...a,
            status: 'RESOLVED',
            mitigationStatus: 'RESTORED',
            resolvedAt: updatedTimestamp
          };
        }
        return a;
      };

      setAlerts(prev => prev.map(applyRestore));
      setSelectedAlert(prev => prev && prev.id === alertId ? applyRestore(prev) : prev);

      // Call backend to persist resolution in server and localStorage
      const res = await restoreAlert(alertId);
      if (res.success && res.alert) {
        setAlerts(prev => prev.map(a => (a.id === alertId ? res.alert : a)));
        setSelectedAlert(res.alert);
      }
    } catch (err) {
      console.error('Restore error:', err);
    } finally {
      setMitigating(false);
    }
  };

  const handleResetSimulation = async (alertId) => {
    if (!alertId) return;
    try {
      await resetAlertSimulation(alertId);
      const resetStatus = (a) => a.id === alertId ? { ...a, status: 'ACTION REQUIRED', mitigationStatus: 'ACTION_REQUIRED', mitigatedAt: undefined, resolvedAt: undefined } : a;
      setAlerts(prev => prev.map(resetStatus));
      setSelectedAlert(prev => prev ? resetStatus(prev) : prev);
    } catch (err) {
      console.error('Reset simulation error:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[350px] font-sans text-[#737373] text-xs">
        <RotateCw className="w-4 h-4 animate-spin mr-2 text-orange-400" />
        <span>Loading incident response queue...</span>
      </div>
    );
  }

  const filteredAlerts = filterSeverity === 'ALL'
    ? alerts
    : filterSeverity === 'ACTION REQUIRED'
    ? alerts.filter(isAlertActive)
    : filterSeverity === 'MITIGATED'
    ? alerts.filter(isAlertMitigated)
    : filterSeverity === 'RESOLVED'
    ? alerts.filter(isAlertResolved)
    : alerts.filter(a => a.severity && a.severity.toUpperCase() === filterSeverity);

  // Compute recommended mitigations for selected alert (case-insensitive key match)
  const selectedMitigations = selectedAlert
    ? (selectedAlert.recommendedResponse && selectedAlert.recommendedResponse.length > 0
        ? selectedAlert.recommendedResponse
        : (ATTACK_RECOMMENDED_MITIGATIONS[selectedAlert.threatType] ||
           Object.entries(ATTACK_RECOMMENDED_MITIGATIONS).find(([k]) => k.toLowerCase() === String(selectedAlert.threatType || '').toLowerCase())?.[1] ||
           ATTACK_RECOMMENDED_MITIGATIONS['Syn']))
    : [];

  const isResolved = isAlertResolved(selectedAlert);
  const isMitigated = isAlertMitigated(selectedAlert);
  const isActive = isAlertActive(selectedAlert);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Header Banner */}
      <div className="p-4 sm:p-5 rounded-sm bg-[#141414] border border-[#262626] flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <Bell className="w-4 h-4 text-orange-400" />
            <h2 className="text-base sm:text-lg font-sans font-semibold text-[#EDEDED] tracking-tight">
              Incident Response Triage Queue
            </h2>
          </div>
          <p className="text-xs text-[#737373] font-sans mt-0.5">
            Operational triage flow: Action Required → Simulate Mitigation → Mitigated · Simulation
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="px-2.5 py-1 rounded-sm bg-[#181818] border border-[#262626] text-[#A3A3A3] font-mono text-xs">
            {alerts.length} Incidents Recorded
          </span>
        </div>
      </div>

      {/* Main Grid: Alert Table & Threat Detail Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        {/* Left Column: Alert Queue List (2 cols) */}
        <div className="lg:col-span-2 p-4 sm:p-5 rounded-sm bg-[#141414] border border-[#262626]">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3 pb-2.5 border-b border-[#262626]">
            <div className="flex items-center space-x-2">
              <Filter className="w-3.5 h-3.5 text-orange-400" />
              <span className="text-xs font-sans font-medium text-[#737373]">Filter Severity:</span>
              <div className="flex flex-wrap gap-1 ml-1 font-mono text-xs">
                {['ALL', 'ACTION REQUIRED', 'MITIGATED', 'RESOLVED', 'CRITICAL', 'HIGH'].map(sev => (
                  <button
                    key={sev}
                    onClick={() => setFilterSeverity(sev)}
                    className={`px-2 py-0.5 rounded-sm border transition-all duration-180 ease-out active:scale-[0.98] text-[10px] ${
                      filterSeverity === sev
                        ? 'bg-orange-600 border-orange-500 text-white font-medium shadow-sm'
                        : 'bg-[#181818] border-[#262626] text-[#A3A3A3] hover:text-[#EDEDED] hover:bg-[#202020]'
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>

            <span className="text-[11px] font-mono text-[#737373]">
              {filteredAlerts.length} Incidents
            </span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto max-h-[480px] rounded-sm border border-[#262626]">
            <table className="w-full text-left font-mono text-xs">
              <thead className="sticky top-0 bg-[#0D0D0D] border-b border-[#262626] text-[#737373] text-[11px] font-sans font-medium z-10">
                <tr>
                  <th className="py-2 px-2.5">Time</th>
                  <th className="py-2 px-2.5">Partition</th>
                  <th className="py-2 px-2.5">Threat Classification</th>
                  <th className="py-2 px-2.5">Severity</th>
                  <th className="py-2 px-2.5">Confidence</th>
                  <th className="py-2 px-2.5">Incident Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#262626]">
                {filteredAlerts.map(alert => {
                  const isSelected = selectedAlert?.id === alert.id;
                  const timeFormatted = formatEventTime(alert.timestamp);
                  const rowMitigated = isAlertMitigated(alert);

                  return (
                    <tr
                      key={alert.id}
                      onClick={() => setSelectedAlert(alert)}
                      className={`transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[#1E1915] text-[#EDEDED] font-medium border-l-2 border-l-orange-500'
                          : 'text-[#A3A3A3] hover:bg-[#1E1E1E] hover:text-[#EDEDED]'
                      }`}
                    >
                      <td 
                        className="py-2 px-2.5 text-[#737373] text-[11px] whitespace-nowrap cursor-help"
                        title={formatFullDateTime(alert.timestamp, true)}
                      >
                        {timeFormatted}
                      </td>
                      <td className="py-2 px-2.5 font-medium text-[#EDEDED]">{alert.enterpriseName}</td>
                      <td className="py-2 px-2.5">
                        <span className="font-semibold text-orange-400">{alert.threatType}</span>
                      </td>
                      <td className="py-2 px-2.5">
                        <span className={`px-1.5 py-0.2 rounded-sm text-[10px] font-semibold ${
                          alert.severity === 'CRITICAL'
                            ? 'bg-red-950/60 text-red-400 border border-red-800/60'
                            : alert.severity === 'HIGH'
                            ? 'bg-red-950/40 text-red-400 border border-red-800/40'
                            : 'bg-amber-950/60 text-amber-400 border border-amber-800/40'
                        }`}>
                          {alert.severity}
                        </span>
                      </td>
                      <td className="py-2 px-2.5 text-emerald-400 font-medium">
                        {(alert.confidence * 100).toFixed(1)}%
                      </td>
                      <td className="py-2 px-2.5 whitespace-nowrap">
                        <StatusBadge 
                          status={
                            isAlertResolved(alert) 
                              ? 'RESOLVED' 
                              : isAlertMitigated(alert) 
                              ? 'MITIGATED · SIMULATION' 
                              : 'ACTION REQUIRED'
                          } 
                          size="xs" 
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Alert Detail & Mitigation Runbook (1 col) */}
        {selectedAlert && (
          <div className="p-4 sm:p-5 rounded-sm bg-[#141414] border border-[#262626] flex flex-col justify-between">
            <div className="space-y-3.5">
              {/* Alert Header */}
              <div className="flex items-center justify-between pb-2.5 border-b border-[#262626]">
                <div className="flex items-center space-x-2">
                  <ShieldAlert className="w-4 h-4 text-red-400" />
                  <span className="font-mono font-medium text-[#EDEDED] text-xs">
                    Incident: {selectedAlert.id}
                  </span>
                </div>
                <StatusBadge 
                  status={isResolved ? 'RESOLVED' : isMitigated ? 'MITIGATED · SIMULATION' : 'ACTION REQUIRED'} 
                  size="xs" 
                />
              </div>

              {/* Threat Details */}
              <div className="space-y-2 font-mono text-xs">
                <div className="p-2.5 rounded-sm bg-[#0D0D0D] border border-[#262626] flex items-center justify-between">
                  <span className="text-[#737373] text-[10px] block font-sans">Timestamp</span>
                  <span className="text-xs font-mono text-orange-300">{formatFullDateTime(selectedAlert.timestamp, true)}</span>
                </div>

                <div className="p-2.5 rounded-sm bg-[#0D0D0D] border border-[#262626]">
                  <span className="text-[#737373] text-[10px] block font-sans">Detected Threat</span>
                  <div className="text-base font-bold font-mono text-[#EDEDED] mt-0.5">{selectedAlert.threatType}</div>
                  <span className="text-[11px] text-[#737373] font-sans">{selectedAlert.category}</span>
                </div>

                <div className="p-2.5 rounded-sm bg-[#0D0D0D] border border-[#262626]">
                  <span className="text-[#737373] text-[10px] block font-sans">Affected Partition</span>
                  <div className="text-sm font-semibold text-orange-400 mt-0.5 font-mono">{selectedAlert.enterpriseName}</div>
                  <span className="text-[10px] text-[#737373] font-sans">{selectedAlert.tier}</span>
                </div>
              </div>

              {/* Mitigation / Resolution Workflow Section */}
              <div className="space-y-2">
                {isActive ? (
                  /* 1. ACTION REQUIRED STATE */
                  <div className="space-y-3 font-mono">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-sans font-semibold text-[#EDEDED] tracking-wide">
                        Recommended Mitigation
                      </span>
                    </div>

                    {/* Unchecked Recommended Action List */}
                    <div className="space-y-2 bg-[#0D0D0D] p-3 rounded-sm border border-[#262626]">
                      {selectedMitigations.map((action, idx) => (
                        <div key={idx} className="flex items-start space-x-2.5 text-xs">
                          <span className="text-orange-500 font-mono select-none text-sm leading-none mt-0.5">□</span>
                          <span className="text-[#EDEDED] leading-snug font-sans">{action}</span>
                        </div>
                      ))}
                    </div>

                    {/* Prominent Mitigation Simulation Button */}
                    <button
                      onClick={() => handleMitigate(selectedAlert.id)}
                      disabled={mitigating}
                      className="w-full py-2.5 px-4 rounded-sm bg-orange-600 hover:bg-orange-500 active:bg-orange-700 active:scale-[0.985] active:translate-y-[0.5px] text-white font-sans text-xs font-semibold tracking-wide transition-all duration-180 ease-out border border-orange-500 flex items-center justify-center space-x-2 shadow-sm disabled:opacity-50"
                    >
                      {mitigating ? (
                        <>
                          <RotateCw className="w-3.5 h-3.5 animate-spin mr-1" />
                          <span>Simulating mitigation...</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-white" />
                          <span>[ SIMULATE MITIGATION ]</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : isMitigated ? (
                  /* 2. MITIGATED · SIMULATION STATE */
                  <div className="space-y-3 font-mono">
                    <div className="flex items-center space-x-2 text-orange-400">
                      <ShieldAlert className="w-4 h-4 text-orange-400" />
                      <span className="text-xs font-sans font-semibold tracking-wide">
                        🟠 Mitigated · Simulation
                      </span>
                    </div>

                    {/* Checked Action List showing simulated actions performed */}
                    <div className="space-y-2 bg-[#0D0D0D] p-3 rounded-sm border border-orange-900/40">
                      <span className="text-[10px] text-[#737373] font-sans font-medium block mb-1">
                        Actions Performed (Simulation):
                      </span>
                      {selectedMitigations.map((action, idx) => (
                        <div key={idx} className="flex items-start space-x-2.5 text-xs text-orange-300">
                          <span className="text-orange-400 font-bold select-none text-sm leading-none mt-0.5">☑</span>
                          <span className="text-[#EDEDED] leading-snug font-sans">{action}</span>
                        </div>
                      ))}
                    </div>

                    {/* Explicit Simulation Warning Notice */}
                    <div className="p-2.5 rounded-sm bg-amber-950/40 border border-amber-800/60 text-amber-400 text-xs font-sans flex items-start space-x-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                      <span className="font-medium leading-tight">
                        Simulation only — no real network configuration changed.
                      </span>
                    </div>

                    {/* Prominent Unblock / Restore Button */}
                    <button
                      onClick={() => handleRestore(selectedAlert.id)}
                      disabled={mitigating}
                      className="w-full py-2.5 px-4 rounded-sm bg-[#1A1612] hover:bg-[#251D16] active:bg-[#15120F] text-orange-300 font-sans text-xs font-semibold tracking-wide transition-all duration-180 ease-out border border-orange-500/80 flex items-center justify-center space-x-2 shadow-sm disabled:opacity-50"
                    >
                      {mitigating ? (
                        <>
                          <RotateCw className="w-3.5 h-3.5 animate-spin mr-1 text-orange-400" />
                          <span>Restoring ingress...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-orange-400" />
                          <span>[ UNBLOCK / RESTORE ]</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  /* 3. RESOLVED HISTORICAL STATE */
                  <div className="space-y-3 font-mono">
                    <div className="flex items-center space-x-2 text-emerald-400">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-sans font-semibold tracking-wide">
                        ✓ RESOLVED
                      </span>
                    </div>

                    <div className="p-3 rounded-sm bg-[#0D0D0D] border border-emerald-900/40 space-y-2">
                      <div className="text-xs text-emerald-300 font-sans">
                        Previously mitigated · simulation
                      </div>
                      {selectedAlert.resolvedAt && (
                        <div className="text-[11px] text-[#A3A3A3] font-mono">
                          Resolved at: <span className="text-white">{formatFullDateTime(selectedAlert.resolvedAt, true)}</span>
                        </div>
                      )}
                      <p className="text-[11px] text-[#737373] font-sans">
                        Historical incident record archived. Ingress unblocked and restored in simulation. No active threat remains for this incident.
                      </p>
                    </div>

                    <div className="text-[10px] text-[#525252] font-sans text-center italic">
                      Incident resolved — historical records cannot be modified.
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Meta Bar */}
            <div className="mt-4 pt-2.5 border-t border-[#262626] text-[10px] font-mono text-[#737373] flex items-center justify-between">
              <span>Incident ID: {selectedAlert.id}</span>
              <span>
                {isResolved ? 'Status: RESOLVED' : isMitigated ? 'Status: MITIGATED · SIMULATION' : 'Status: ACTION REQUIRED'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
