import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, 
  ShieldCheck, 
  FileText, 
  RotateCw, 
  AlertTriangle,
  Cpu,
  Play,
  Square,
  Radio,
  Check,
  X,
  Info,
  Trash2,
  Server,
  Power,
  Zap
} from 'lucide-react';
import { 
  fetchDetectionDemo, 
  fetchLiveStatus, 
  fetchLiveEvents, 
  fetchLivePoolInfo,
  startLiveSimulation, 
  stopLiveSimulation,
  clearLiveHistory,
  getOfflineEnterprises,
  toggleEnterpriseStatus,
  injectTestAttack
} from '../services/api';
import { formatEventTime, formatFullDateTime } from '../utils/time';

function getEventAuditDetails(evt) {
  if (!evt) return { 
    isAttack: false, 
    groundTruth: 'BENIGN', 
    detectionLabel: 'NO ATTACK', 
    classification: 'CORRECT', 
    badgeColor: 'emerald',
    description: 'Normal traffic flow'
  };

  const predictedClass = evt.prediction || 'BENIGN';
  const isAttack = predictedClass !== 'BENIGN';
  const groundTruth = evt.ground_truth_label || evt.ground_truth_evaluation_only || evt.ground_truth || 'BENIGN';
  const isActualAttack = groundTruth !== 'BENIGN';

  let classification = 'CORRECT';
  let badgeColor = 'emerald';
  let description = 'Prediction matches ground truth verification.';

  if (isAttack && isActualAttack) {
    if (predictedClass === groundTruth) {
      classification = 'CORRECT';
      badgeColor = 'emerald';
      description = 'Attack correctly detected and classified to its exact attack family.';
    } else {
      classification = 'MISCLASSIFIED';
      badgeColor = 'amber';
      description = 'Attack detected by IDS; specific attack family misclassified (malicious traffic flagged).';
    }
  } else if (!isAttack && !isActualAttack) {
    classification = 'CORRECT';
    badgeColor = 'emerald';
    description = 'Benign traffic correctly recognized (True Negative).';
  } else if (isAttack && !isActualAttack) {
    classification = 'FALSE POSITIVE';
    badgeColor = 'amber';
    description = 'False positive: model predicted attack on benign traffic. Enterprise alerted per IDS detection.';
  } else if (!isAttack && isActualAttack) {
    classification = 'MISSED (FN)';
    badgeColor = 'red';
    description = 'False negative: attack missed by model (predicted BENIGN). Recorded in evaluation metrics; enterprise not alerted.';
  }

  return {
    isAttack,
    groundTruth,
    detectionLabel: isAttack ? 'ATTACK DETECTED' : 'NO ATTACK',
    classification,
    badgeColor,
    description
  };
}

export default function DetectionPage() {
  const [activeMode, setActiveMode] = useState('live');
  
  const [liveStatus, setLiveStatus] = useState({ status: 'checking', isSimulating: false });
  const [liveData, setLiveData] = useState({ count: 0, events: [], stats: {} });
  const [poolInfo, setPoolInfo] = useState({
    total_rows: 18088,
    remaining_rows_in_cycle: 18088,
    rows_processed_this_cycle: 0,
    cycle_count: 1,
    train_rows_included: 0,
    source: 'Exact Held-Out Test Set (Centralized 20% Stratified Split)'
  });
  const [selectedLiveEvent, setSelectedLiveEvent] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [offlineEnterprises, setOfflineEnterprises] = useState(getOfflineEnterprises());

  const [demoData, setDemoData] = useState(null);
  const [selectedSample, setSelectedSample] = useState(null);
  const [loading, setLoading] = useState(true);

  const pollIntervalRef = useRef(null);

  const handleToggleEnterprise = async (entId) => {
    try {
      const res = await toggleEnterpriseStatus(entId);
      setOfflineEnterprises(res.offlineEnterprises || getOfflineEnterprises());
      const eventsRes = await fetchLiveEvents(30).catch(() => null);
      if (eventsRes) setLiveData(eventsRes);
    } catch (err) {
      console.error('Failed to toggle enterprise:', err);
    }
  };

  const handleInjectScenario = async (enterpriseId, prediction, groundTruth) => {
    try {
      setActionLoading(true);
      await injectTestAttack({ enterpriseId, prediction, groundTruth });
      const eventsRes = await fetchLiveEvents(30).catch(() => null);
      if (eventsRes) {
        setLiveData(eventsRes);
        if (eventsRes.events?.length > 0) {
          setSelectedLiveEvent(eventsRes.events[0]);
        }
      }
    } catch (err) {
      console.error('Failed to inject test scenario:', err);
    } finally {
      setActionLoading(false);
    }
  };



  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        const [demoRes, statusRes, eventsRes, poolRes] = await Promise.all([
          fetchDetectionDemo().catch(() => null),
          fetchLiveStatus().catch(() => ({ status: 'offline' })),
          fetchLiveEvents().catch(() => ({ count: 0, events: [], stats: {} })),
          fetchLivePoolInfo().catch(() => null)
        ]);

        if (demoRes) {
          setDemoData(demoRes);
          if (demoRes.samples && demoRes.samples.length > 0) {
            setSelectedSample(demoRes.samples[0]);
          }
        }

        setLiveStatus(statusRes);
        setLiveData(eventsRes);
        if (poolRes) setPoolInfo(poolRes);
        if (eventsRes?.events && eventsRes.events.length > 0) {
          setSelectedLiveEvent(eventsRes.events[0]);
        }
      } catch (err) {
        console.error('Detection page init error:', err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  useEffect(() => {
    const poll = async () => {
      try {
        const [statusRes, eventsRes, poolRes] = await Promise.all([
          fetchLiveStatus().catch(() => ({ status: 'offline' })),
          fetchLiveEvents(30).catch(() => null),
          fetchLivePoolInfo().catch(() => null)
        ]);

        setLiveStatus(statusRes);
        setOfflineEnterprises(getOfflineEnterprises());
        if (poolRes) setPoolInfo(poolRes);
        if (eventsRes) {
          setLiveData(eventsRes);
          if (!selectedLiveEvent && eventsRes.events?.length > 0) {
            setSelectedLiveEvent(eventsRes.events[0]);
          }
        }
      } catch (err) {
        // quiet poll
      }
    };

    pollIntervalRef.current = setInterval(poll, 2000);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [selectedLiveEvent]);

  const handleStartSimulation = async () => {
    try {
      setActionLoading(true);
      await startLiveSimulation();
      const statusRes = await fetchLiveStatus();
      setLiveStatus(statusRes);
    } catch (err) {
      console.error('Failed to start simulation:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStopSimulation = async () => {
    try {
      setActionLoading(true);
      await stopLiveSimulation();
      const statusRes = await fetchLiveStatus();
      setLiveStatus(statusRes);
    } catch (err) {
      console.error('Failed to stop simulation:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleClearHistory = async () => {
    try {
      setActionLoading(true);
      setLiveData({
        count: 0,
        events: [],
        stats: {
          flowsProcessed: 0,
          correctPredictions: 0,
          incorrectPredictions: 0,
          liveAccuracy: 0,
          macroF1: 0,
          weightedF1: 0,
          attacksDetected: 0,
          benignFlows: 0,
          criticalAlerts: 0,
          averageConfidence: 0
        }
      });
      setSelectedLiveEvent(null);
      setLiveStatus(prev => ({ ...prev, isSimulating: false }));

      await clearLiveHistory().catch(e => console.warn('Clear backend call:', e.message));

      const [statusRes, eventsRes, poolRes] = await Promise.all([
        fetchLiveStatus().catch(() => null),
        fetchLiveEvents(30).catch(() => null),
        fetchLivePoolInfo().catch(() => null)
      ]);
      if (statusRes) setLiveStatus(statusRes);
      if (eventsRes) setLiveData(eventsRes);
      if (poolRes) setPoolInfo(poolRes);
    } catch (err) {
      console.error('Failed to clear live simulation history:', err);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[350px] font-sans text-[#737373] text-xs">
        <RotateCw className="w-4 h-4 animate-spin mr-2 text-orange-400" />
        <span>Initializing live inference service...</span>
      </div>
    );
  }

  const isEngineOnline = liveStatus?.status === 'online';
  const isSimulating = liveStatus?.isSimulating || false;
  const stats = liveData?.stats || {
    flowsProcessed: 0,
    correctPredictions: 0,
    incorrectPredictions: 0,
    liveAccuracy: 0,
    macroF1: 0,
    weightedF1: 0,
    attacksDetected: 0,
    benignFlows: 0,
    criticalAlerts: 0,
    averageConfidence: 0
  };

  const selectedAudit = selectedLiveEvent ? getEventAuditDetails(selectedLiveEvent) : null;

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="p-3.5 sm:p-4 rounded-sm bg-[#141414] border border-[#262626] flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-orange-400" />
            <h2 className="text-sm sm:text-base font-sans font-semibold text-[#EDEDED]">
              Live SOC Traffic Detection & Model Inference
            </h2>
          </div>
          <p className="text-xs text-[#737373] font-sans mt-0.5">
            Streaming from the 18,088-sample centralized held-out test split into the 13-class PyTorch FedProx G20 backbone.
          </p>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex items-center space-x-1 bg-[#101010] p-1 rounded-sm border border-[#262626] font-sans text-xs">
          <button
            onClick={() => setActiveMode('live')}
            className={`px-2.5 py-1 rounded-sm transition-all duration-180 ease-out active:scale-[0.985] flex items-center space-x-1.5 ${
              activeMode === 'live'
                ? 'bg-orange-600 text-white font-medium border border-orange-500 shadow-sm'
                : 'text-[#A3A3A3] hover:text-[#EDEDED] hover:bg-[#181818] border border-transparent'
            }`}
          >
            <Radio className="w-3 h-3 text-orange-300" />
            <span>Live Replay</span>
          </button>

          <button
            onClick={() => setActiveMode('demo')}
            className={`px-2.5 py-1 rounded-sm transition-all duration-180 ease-out active:scale-[0.985] ${
              activeMode === 'demo'
                ? 'bg-orange-600 text-white font-medium border border-orange-500 shadow-sm'
                : 'text-[#A3A3A3] hover:text-[#EDEDED] hover:bg-[#181818] border border-transparent'
            }`}
          >
            Demo Scenarios
          </button>
        </div>
      </div>

      {/* Engine Status & Simulation Controls Bar */}
      <div className="p-3.5 sm:p-4 rounded-sm bg-[#141414] border border-[#262626] space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Status Badges */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-sans">
            {/* ML Engine Status */}
            <div className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-sm border text-xs ${
              isEngineOnline 
                ? 'bg-emerald-950/40 border-emerald-700/50 text-emerald-300' 
                : 'bg-red-950/40 border-red-700/50 text-red-300'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isEngineOnline ? 'bg-emerald-400 animate-live-pulse' : 'bg-red-500'}`} />
              <span className="font-medium">Engine: {isEngineOnline ? 'Online' : 'Offline'}</span>
            </div>

            {/* Traffic Simulator Status */}
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-sm bg-[#181818] border border-[#262626] text-[#A3A3A3] text-xs">
              <span className={`w-1.5 h-1.5 rounded-full ${isSimulating ? 'bg-orange-400 animate-live-pulse' : 'bg-[#525252]'}`} />
              <span>Simulator: <span className="font-medium text-orange-400">{isSimulating ? 'Streaming' : 'Idle'}</span></span>
            </div>

            {/* Model Architecture */}
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-sm bg-[#181818] border border-[#262626] text-[#A3A3A3] text-xs">
              <Cpu className="w-3 h-3 text-orange-400" />
              <span className="font-mono text-[#EDEDED]">FedProx G20 (13 Classes)</span>
            </div>

            {/* Zero Leakage Badge */}
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-sm bg-[#181818] border border-[#262626] text-[#D4D4D4] text-xs font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-mono">0 Train Leakage</span>
            </div>
          </div>

          {/* Start / Stop Control Buttons */}
          <div className="flex items-center space-x-2 font-sans text-xs">
            {isSimulating ? (
              <button
                onClick={handleStopSimulation}
                disabled={actionLoading}
                className="px-3 py-1.5 rounded-sm bg-red-700 hover:bg-red-600 active:bg-red-800 active:scale-[0.985] text-white font-medium flex items-center space-x-1.5 transition-all duration-180 ease-out border border-red-600 shadow-sm"
              >
                <Square className="w-3 h-3 fill-white" />
                <span>Stop Replay</span>
              </button>
            ) : (
              <button
                onClick={handleStartSimulation}
                disabled={!isEngineOnline || actionLoading}
                className={`px-3 py-1.5 rounded-sm font-medium flex items-center space-x-1.5 transition-all duration-180 ease-out ${
                  isEngineOnline
                    ? 'bg-orange-600 hover:bg-orange-500 active:bg-orange-700 active:scale-[0.985] text-white border border-orange-500 shadow-sm'
                    : 'bg-[#1E1E1E] text-[#525252] cursor-not-allowed border border-[#2E2E2E]'
                }`}
              >
                <Play className="w-3 h-3 fill-current" />
                <span>Start Live Stream</span>
              </button>
            )}
            
            {(stats.flowsProcessed > 0 || liveData.events?.length > 0) && (
              <button
                onClick={handleClearHistory}
                disabled={actionLoading}
                className="px-2.5 py-1.5 rounded-sm bg-[#181818] hover:bg-[#222222] active:bg-[#151515] active:scale-[0.985] text-[#A3A3A3] hover:text-[#EDEDED] font-sans text-xs transition-all duration-180 ease-out border border-[#2E2E2E] flex items-center space-x-1"
                title="Clear simulation history and reset counters"
              >
                <Trash2 className="w-3.5 h-3.5 text-[#737373]" />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        {/* Enterprise Ingress Target Endpoints (Online/Offline Toggles) */}
        <div className="pt-2.5 border-t border-[#262626] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-sans">
          <div className="flex items-center space-x-2">
            <Server className="w-3.5 h-3.5 text-orange-400" />
            <span className="text-[#EDEDED] font-medium">Enterprise Ingress Targets:</span>
            <span className="text-[11px] text-[#737373] font-mono hidden sm:inline">(Toggle to suppress attacks for that partition)</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {['E1', 'E2', 'E3', 'E4', 'E5'].map(entId => {
              const isOff = offlineEnterprises.includes(entId);
              return (
                <button
                  key={entId}
                  onClick={() => handleToggleEnterprise(entId)}
                  className={`px-2 py-0.5 rounded-sm font-mono text-[11px] font-semibold border transition-all duration-180 ease-out active:scale-[0.98] flex items-center space-x-1.5 ${
                    isOff
                      ? 'bg-[#181818] border-[#2E2E2E] text-[#737373] hover:border-[#404040] hover:text-[#A3A3A3]'
                      : 'bg-emerald-950/40 border-emerald-700/50 text-emerald-300 hover:bg-emerald-900/60'
                  }`}
                  title={`Click to switch ${entId} ${isOff ? 'ONLINE' : 'OFFLINE'}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isOff ? 'bg-[#525252]' : 'bg-emerald-400'}`} />
                  <span>{entId}</span>
                  <span className={`text-[9px] uppercase font-sans ${isOff ? 'text-[#737373]' : 'text-emerald-400 font-bold'}`}>
                    {isOff ? 'OFF' : 'ON'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {offlineEnterprises.length > 0 && (
          <div className="p-2 rounded-sm bg-amber-950/20 border border-amber-800/40 text-amber-200 text-[11px] font-sans flex items-center space-x-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <span>
              <strong>Perimeter Filter Active:</strong> Partition{offlineEnterprises.length > 1 ? 's' : ''} <strong className="font-mono text-white">[{offlineEnterprises.join(', ')}]</strong> {offlineEnterprises.length > 1 ? 'are' : 'is'} OFFLINE. All attacks targeting {offlineEnterprises.length > 1 ? 'these partitions' : 'this partition'} are automatically dropped & suppressed.
            </span>
          </div>
        )}

        {/* Live Threat Injection & Verification Sandbox Controls */}
        <div className="pt-2 border-t border-[#262626] space-y-1.5 text-xs font-sans">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Zap className="w-3.5 h-3.5 text-orange-400" />
              <span className="text-[#EDEDED] font-semibold text-xs">Simulated Threat Injection Controls:</span>
              <span className="text-[11px] text-[#737373] font-mono hidden md:inline">(Instant live validation of independent SOC detection & classification)</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => handleInjectScenario('E3', 'DrDoS_UDP', 'DrDoS_UDP')}
              disabled={actionLoading}
              className="px-2.5 py-1 rounded-sm bg-red-950/40 border border-red-700/50 hover:bg-red-900/60 active:scale-[0.98] text-red-200 text-[11px] font-sans font-medium flex items-center space-x-1.5 transition-all"
              title="Test A: Attack E3 -> E3 becomes RED (Under Attack)"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-live-pulse" />
              <span>Attack E3 (DrDoS_UDP)</span>
            </button>

            <button
              onClick={() => handleInjectScenario('E1', 'DrDoS_DNS', 'DrDoS_DNS')}
              disabled={actionLoading}
              className="px-2.5 py-1 rounded-sm bg-red-950/40 border border-red-700/50 hover:bg-red-900/60 active:scale-[0.98] text-red-200 text-[11px] font-sans font-medium flex items-center space-x-1.5 transition-all"
              title="Test C: Attack E1 -> E1 and E3 both turn RED independently"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-live-pulse" />
              <span>Attack E1 (DrDoS_DNS)</span>
            </button>

            <button
              onClick={() => handleInjectScenario('E3', 'Syn', 'DrDoS_UDP')}
              disabled={actionLoading}
              className="px-2.5 py-1 rounded-sm bg-amber-950/40 border border-amber-700/50 hover:bg-amber-900/60 active:scale-[0.98] text-amber-200 text-[11px] font-sans font-medium flex items-center space-x-1.5 transition-all"
              title="Test G: GT DrDoS_UDP + Pred Syn -> E3 turns RED + audit flags MISCLASSIFIED"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>GT: DrDoS_UDP | Pred: Syn (Misclassified)</span>
            </button>

            <button
              onClick={() => handleInjectScenario('E3', 'BENIGN', 'DrDoS_UDP')}
              disabled={actionLoading}
              className="px-2.5 py-1 rounded-sm bg-emerald-950/40 border border-emerald-700/50 hover:bg-emerald-900/60 active:scale-[0.98] text-emerald-200 text-[11px] font-sans font-medium flex items-center space-x-1.5 transition-all"
              title="Test H: GT DrDoS_UDP + Pred BENIGN -> E3 stays GREEN from IDS perspective (Missed FN)"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>GT: DrDoS_UDP | Pred: BENIGN (Missed FN)</span>
            </button>

            <button
              onClick={() => handleInjectScenario('E3', 'Syn', 'BENIGN')}
              disabled={actionLoading}
              className="px-2.5 py-1 rounded-sm bg-red-950/40 border border-red-700/50 hover:bg-red-900/60 active:scale-[0.98] text-red-200 text-[11px] font-sans font-medium flex items-center space-x-1.5 transition-all"
              title="Test I: GT BENIGN + Pred Syn -> E3 turns RED (False Positive)"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              <span>GT: BENIGN | Pred: Syn (False Positive)</span>
            </button>
          </div>
        </div>

        

        {/* Live Session Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1">
          {/* Flows Processed */}
          <div className="p-2.5 rounded-sm bg-[#181818] border border-[#262626] text-xs font-sans">
            <span className="text-[#737373] text-[11px] block">Flows Evaluated</span>
            <span className="text-lg font-mono font-bold text-orange-400 mt-0.5 block">
              {stats.flowsProcessed}
            </span>
            <span className="text-[10px] text-[#737373] font-mono">of 18,088 Test Split</span>
          </div>

          {/* Live Accuracy */}
          <div className="p-2.5 rounded-sm bg-[#181818] border border-[#262626] text-xs font-sans">
            <span className="text-[#737373] text-[11px] block">Live Accuracy</span>
            <span className="text-lg font-mono font-bold text-emerald-400 mt-0.5 block">
              {stats.flowsProcessed > 0 ? `${stats.liveAccuracy}%` : '—'}
            </span>
            <span className="text-[10px] text-[#737373] font-mono">
              {stats.correctPredictions} ✓ / {stats.incorrectPredictions} ✗
            </span>
          </div>

          {/* Live Macro F1 */}
          <div className="p-2.5 rounded-sm bg-[#181818] border border-[#262626] text-xs font-sans">
            <span className="text-[#737373] text-[11px] block">Live Macro F1</span>
            <span className="text-lg font-mono font-bold text-orange-400 mt-0.5 block">
              {stats.macroF1 > 0 ? `${stats.macroF1}%` : '—'}
            </span>
            <span className="text-[10px] text-[#737373] font-sans">Unweighted Mean</span>
          </div>

          {/* Live Weighted F1 */}
          <div className="p-2.5 rounded-sm bg-[#181818] border border-[#262626] text-xs font-sans">
            <span className="text-[#737373] text-[11px] block">Live Weighted F1</span>
            <span className="text-lg font-mono font-bold text-[#EDEDED] mt-0.5 block">
              {stats.weightedF1 > 0 ? `${stats.weightedF1}%` : '—'}
            </span>
            <span className="text-[10px] text-[#737373] font-mono">Ref: 70.55% G20</span>
          </div>

          {/* Attacks Detected */}
          <div className="p-2.5 rounded-sm bg-[#181818] border border-[#262626] text-xs font-sans">
            <span className="text-[#737373] text-[11px] block">Attacks Detected</span>
            <span className="text-lg font-mono font-bold text-red-400 mt-0.5 block">
              {stats.attacksDetected}
            </span>
            <span className="text-[10px] text-[#737373] font-mono">{stats.benignFlows} Benign</span>
          </div>

          {/* Average Confidence */}
          <div className="p-2.5 rounded-sm bg-[#181818] border border-[#262626] text-xs font-sans">
            <span className="text-[#737373] text-[11px] block">Avg Confidence</span>
            <span className="text-lg font-mono font-bold text-[#EDEDED] mt-0.5 block">
              {stats.averageConfidence > 0 ? `${stats.averageConfidence}%` : '—'}
            </span>
            <span className="text-[10px] text-[#737373] font-sans">Softmax Score</span>
          </div>
        </div>

        {/* Research Context Footnote */}
        <div className="text-[11px] font-sans text-[#737373] flex items-center justify-between border-t border-[#262626] pt-2 px-0.5">
          <div className="flex items-center space-x-1.5">
            <Info className="w-3.5 h-3.5 text-[#525252] flex-shrink-0" />
            <span>
              <strong>Scientific Protocol:</strong> Detection state is governed exclusively by model prediction (<code className="text-orange-400 font-mono">prediction !== 'BENIGN'</code>). Ground truth serves post-inference evaluation & research metrics only.
            </span>
          </div>
          <span className="text-[#737373] font-mono text-[10px] hidden md:inline">
            Pool: {poolInfo.remaining_rows_in_cycle?.toLocaleString() || 18088} remaining in Cycle #{poolInfo.cycle_count || 1}
          </span>
        </div>
      </div>

      {/* Main Content Area based on Active Mode */}
      {activeMode === 'live' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
          {/* Streaming Live Traffic Table (2 cols) */}
          <div className="lg:col-span-2 p-3.5 sm:p-4 rounded-sm bg-[#141414] border border-[#262626]">
            <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-[#262626]">
              <div className="flex items-center space-x-2">
                <Radio className="w-3.5 h-3.5 text-orange-400" />
                <h3 className="text-xs font-sans font-semibold text-[#EDEDED]">
                  Live Traffic Ingress Stream (Recent {liveData.events?.length || 0} Flows)
                </h3>
              </div>
              <span className="text-[11px] font-sans text-orange-400">
                Click any row to inspect
              </span>
            </div>

            {(!liveData.events || liveData.events.length === 0) ? (
              <div className="py-10 text-center text-[#737373] font-sans text-xs space-y-2">
                <div>No live test flows buffered yet.</div>
                {isEngineOnline && !isSimulating && (
                  <button 
                    onClick={handleStartSimulation}
                    className="text-orange-400 hover:text-orange-300 underline inline-flex items-center space-x-1 font-medium"
                  >
                    <span>Click here to start held-out test stream.</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[460px]">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-[#101010] border-b border-[#262626] text-[#737373] font-sans text-[11px] z-10">
                    <tr>
                      <th className="py-2 px-2.5 font-medium">Time</th>
                      <th className="py-2 px-2.5 font-medium">Event</th>
                      <th className="py-2 px-2.5 font-medium">Node</th>
                      <th className="py-2 px-2.5 font-medium">Model Prediction</th>
                      <th className="py-2 px-2.5 font-medium">Confidence</th>
                      <th className="py-2 px-2.5 font-medium">Detection</th>
                      <th className="py-2 px-2.5 font-medium">Ground Truth</th>
                      <th className="py-2 px-2.5 text-center font-medium">Classification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#202020] font-mono">
                    {liveData.events.map((evt) => {
                      const isSelected = selectedLiveEvent?.event_id === evt.event_id;
                      const timeStr = formatEventTime(evt.timestamp);
                      const audit = getEventAuditDetails(evt);

                      return (
                        <tr
                          key={evt.event_id}
                          onClick={() => setSelectedLiveEvent(evt)}
                          className={`transition-colors duration-100 cursor-pointer ${
                            isSelected
                              ? 'bg-[#1E1915] text-[#EDEDED] font-medium'
                              : 'text-[#A3A3A3] hover:bg-[#1A1A1A] hover:text-[#EDEDED]'
                          }`}
                        >
                          <td 
                            className="py-1.5 px-2.5 text-[#737373] text-[11px] whitespace-nowrap cursor-help"
                            title={formatFullDateTime(evt.timestamp, true)}
                          >
                            {timeStr}
                          </td>
                          <td className="py-1.5 px-2.5 font-medium text-orange-400 text-[11px] whitespace-nowrap">{evt.event_id}</td>
                          <td className="py-1.5 px-2.5 font-sans">
                            <span className={offlineEnterprises.includes(evt.enterprise_id) ? 'line-through text-[#525252]' : 'text-[#EDEDED]'}>
                              {evt.enterprise_id}
                            </span>
                            {offlineEnterprises.includes(evt.enterprise_id) && (
                              <span className="ml-1 text-[9px] font-mono text-[#525252]">(OFF)</span>
                            )}
                          </td>
                          <td className="py-1.5 px-2.5">
                            <span className={audit.isAttack ? 'text-red-400 font-semibold' : 'text-emerald-400 font-medium'}>
                              {evt.prediction}
                            </span>
                          </td>
                          <td className="py-1.5 px-2.5 text-[#EDEDED] font-medium">
                            {(evt.confidence * 100).toFixed(1)}%
                          </td>
                          <td className="py-1.5 px-2.5 whitespace-nowrap font-sans">
                            {audit.isAttack ? (
                              <span className="px-1.5 py-0.2 rounded-sm text-[10px] font-medium bg-red-950/40 text-red-300 border border-red-700/40 inline-flex items-center space-x-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-400 mr-1 animate-live-pulse" />
                                <span>ATTACK DETECTED</span>
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded-sm text-[10px] font-medium bg-emerald-950/30 text-emerald-400 border border-emerald-800/40 inline-flex items-center space-x-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1" />
                                <span>NO ATTACK</span>
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 px-2.5 text-[11px] text-[#737373] truncate max-w-[100px]">
                            {audit.groundTruth}
                          </td>
                          <td className="py-1.5 px-2.5 text-center whitespace-nowrap font-sans">
                            {audit.classification === 'CORRECT' && (
                              <span className="px-1.5 py-0.2 rounded-sm text-[10px] font-medium bg-emerald-950/40 text-emerald-300 border border-emerald-700/40 inline-flex items-center space-x-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1" />
                                <span>CORRECT</span>
                              </span>
                            )}
                            {audit.classification === 'MISCLASSIFIED' && (
                              <span className="px-1.5 py-0.2 rounded-sm text-[10px] font-medium bg-amber-950/40 text-amber-300 border border-amber-700/40 inline-flex items-center space-x-1" title="Attack detected; attack family misclassified">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1" />
                                <span>MISCLASSIFIED</span>
                              </span>
                            )}
                            {audit.classification === 'FALSE POSITIVE' && (
                              <span className="px-1.5 py-0.2 rounded-sm text-[10px] font-medium bg-amber-950/40 text-amber-300 border border-amber-700/40 inline-flex items-center space-x-1" title="Model predicted attack on benign traffic">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1" />
                                <span>FALSE POSITIVE</span>
                              </span>
                            )}
                            {audit.classification === 'MISSED (FN)' && (
                              <span className="px-1.5 py-0.2 rounded-sm text-[10px] font-medium bg-red-950/40 text-red-300 border border-red-700/40 inline-flex items-center space-x-1" title="Attack missed by model (evaluated as BENIGN)">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-400 mr-1" />
                                <span>MISSED (FN)</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Inspected Live Flow Inspector (1 col) */}
          <div>
            {selectedLiveEvent && selectedAudit ? (
              <div className="p-3.5 sm:p-4 rounded-sm bg-[#141414] border border-[#262626] space-y-2.5">
                <div className="flex items-center justify-between pb-2 border-b border-[#262626]">
                  <div className="flex items-center space-x-1.5">
                    <FileText className="w-3.5 h-3.5 text-orange-400" />
                    <span className="font-sans font-semibold text-[#EDEDED] text-xs">
                      Flow Inspector: {selectedLiveEvent.event_id}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-sm bg-[#181818] text-[#A3A3A3] border border-[#2B2B2B] font-semibold">
                    {selectedLiveEvent.flow_id || selectedLiveEvent.source}
                  </span>
                </div>

                <div className="space-y-2 font-sans text-xs">
                  {/* Flow Event Timestamp */}
                  <div className="p-2 rounded-sm bg-[#181818] border border-[#262626] text-[11px] font-mono flex items-center justify-between">
                    <span className="text-[#737373]">Flow Timestamp</span>
                    <span className="text-[#EDEDED] font-semibold">{formatFullDateTime(selectedLiveEvent.timestamp, true)}</span>
                  </div>

                  {/* IDS Detection State Banner */}
                  <div className={`p-2 rounded-sm border ${
                    selectedAudit.isAttack
                      ? 'bg-red-950/30 border-red-700/40 text-red-200'
                      : 'bg-emerald-950/30 border-emerald-700/40 text-emerald-300'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5 font-sans font-semibold text-xs">
                        <span className={`w-2 h-2 rounded-full ${selectedAudit.isAttack ? 'bg-red-400 animate-live-pulse' : 'bg-emerald-400'}`} />
                        <span>{selectedAudit.isAttack ? 'IDS Attack Detected' : 'IDS Normal Traffic'}</span>
                      </div>
                      <span className="text-[10px] font-mono font-medium">
                        {selectedAudit.isAttack ? 'UNDER ATTACK' : 'ONLINE / BENIGN'}
                      </span>
                    </div>
                  </div>

                  {/* Classification Evaluation Audit Banner */}
                  <div className={`p-2 rounded-sm border ${
                    selectedAudit.classification === 'CORRECT'
                      ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300'
                      : selectedAudit.classification === 'MISSED (FN)'
                      ? 'bg-red-950/25 border-red-800/40 text-red-300'
                      : 'bg-amber-950/20 border-amber-800/40 text-amber-300'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-mono uppercase font-semibold">Audit Classification</span>
                      <span className="text-[10px] font-sans font-bold">{selectedAudit.classification}</span>
                    </div>
                    <p className="text-[11px] font-sans leading-tight opacity-90">
                      {selectedAudit.description}
                    </p>
                  </div>

                  {/* PyTorch Prediction Box */}
                  <div className="p-2.5 rounded-sm bg-[#181818] border border-[#262626]">
                    <span className="text-orange-400 text-[11px] block font-sans font-medium">Model Inference</span>
                    <div className="text-base font-sans font-bold text-[#EDEDED] mt-0.5 flex items-center justify-between">
                      <span className={selectedAudit.isAttack ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>
                        {selectedLiveEvent.prediction}
                      </span>
                      <span className="font-mono text-sm text-orange-400 font-semibold">
                        {(selectedLiveEvent.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                    <span className="text-[10px] text-[#737373] font-mono">Class ID {selectedLiveEvent.class_id} • FedProx G20</span>
                  </div>

                  {/* Audit Ground Truth Box */}
                  <div className="p-2.5 rounded-sm bg-[#181818] border border-[#262626]">
                    <span className="text-[#737373] text-[11px] block font-sans">Audit Ground Truth</span>
                    <div className="text-xs font-sans font-semibold text-[#A3A3A3] mt-0.5 flex items-center justify-between">
                      <span>{selectedAudit.groundTruth}</span>
                      <span className="text-[10px] text-[#737373] font-mono">Class ID {selectedLiveEvent.ground_truth_class_id ?? '—'}</span>
                    </div>
                  </div>

                  {/* Enterprise Routing Box */}
                  <div className="p-2.5 rounded-sm bg-[#181818] border border-[#262626]">
                    <div className="flex items-center justify-between">
                      <span className="text-[#737373] text-[11px] block font-sans">Simulated Routing</span>
                      {offlineEnterprises.includes(selectedLiveEvent.enterprise_id) && (
                        <span className="text-[10px] font-mono text-amber-300 bg-amber-950/70 border border-amber-800/60 px-1 py-0.2 rounded-sm font-semibold">
                          PARTITION OFFLINE
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-sans font-semibold text-[#EDEDED] mt-0.5">
                      {selectedLiveEvent.enterprise_name}
                    </div>
                  </div>

                  {/* Cycle Information */}
                  {selectedLiveEvent.cycle_info && (
                    <div className="p-2 rounded-sm bg-[#181818] border border-[#262626] text-[10px] text-[#737373] font-mono">
                      Cycle {selectedLiveEvent.cycle_info.cycle} • Row {selectedLiveEvent.cycle_info.current_in_cycle} of 18,088
                    </div>
                  )}

                  {/* Key Features */}
                  {selectedLiveEvent.key_features && (
                    <div className="p-2.5 rounded-sm bg-[#181818] border border-[#262626] space-y-1">
                      <span className="text-[11px] font-sans font-medium text-[#A3A3A3] block mb-1">
                        Flow Telemetry Attributes (Unscaled)
                      </span>
                      {Object.entries(selectedLiveEvent.key_features).map(([k, v]) => (
                        <div key={k} className="flex justify-between text-[10px] font-mono">
                          <span className="text-[#737373]">{k}:</span>
                          <span className="text-[#EDEDED]">{v}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-sm bg-[#141414] border border-[#262626] text-center font-sans text-[#737373] text-xs">
                Select any row in the live traffic stream to inspect telemetry attributes.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Demo Scenarios View */
        <div className="space-y-3.5">
          <div className="p-3.5 rounded-sm bg-[#141414] border border-[#262626]">
            <span className="text-xs font-sans text-[#A3A3A3] font-medium mb-2 block">
              Reference Evaluation Scenarios:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {(demoData?.samples || []).map((sample) => (
                <button
                  key={sample.id}
                  onClick={() => setSelectedSample(sample)}
                  className={`p-2.5 rounded-sm border text-left transition-colors text-xs ${
                    selectedSample?.id === sample.id
                      ? 'bg-[#1E1915] border-orange-500 text-[#EDEDED] font-medium'
                      : 'bg-[#181818] border-[#262626] text-[#A3A3A3] hover:text-[#EDEDED] hover:bg-[#1C1C1C]'
                  }`}
                >
                  <span className="font-mono text-orange-400 text-[11px] block">{sample.id}</span>
                  <div className="truncate text-xs font-sans font-medium text-[#EDEDED] mt-0.5">{sample.name}</div>
                </button>
              ))}
            </div>
          </div>

          {selectedSample && (
            <div className="p-3.5 sm:p-4 rounded-sm bg-[#141414] border border-[#262626] font-sans text-xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[#737373] text-[11px] block">Scenario Details</span>
                  <h3 className="text-sm font-sans font-bold text-[#EDEDED]">{selectedSample.predictedAttack}</h3>
                </div>
                <div className="text-right">
                  <span className="text-[#737373] text-[11px] block">Confidence</span>
                  <span className="text-sm font-mono font-bold text-orange-400">
                    {(selectedSample.confidence * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {Object.entries(selectedSample.features || {}).map(([k, v]) => (
                  <div key={k} className="p-2 rounded-sm bg-[#181818] border border-[#262626] font-mono">
                    <span className="text-[10px] text-[#737373] block">{k}</span>
                    <span className="text-[#EDEDED]">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
