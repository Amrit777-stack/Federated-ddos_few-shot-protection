import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Sparkles, 
  RotateCw, 
  Sliders, 
  Search,
  Play,
  Pause,
  RotateCcw,
  StepForward,
  Activity,
  ShieldAlert,
  ShieldCheck,
  Cpu,
  Layers,
  Trash2
} from 'lucide-react';
import FewShotResultCard from '../components/FewShotResultCard';
import { 
  fetchFewShot, 
  fetchFewShotSummary,
  fetchFewShotLivePool,
  fetchFewShotLiveNext,
  getOfflineEnterprises
} from '../services/api';
import { formatEventTime, formatFullDateTime } from '../utils/time';

const ATTACK_TO_ENTERPRISE = {
  'DrDoS_DNS': 'E1',
  'DrDoS_LDAP': 'E1',
  'DrDoS_NTP': 'E2',
  'DrDoS_SSDP': 'E2',
  'DrDoS_MSSQL': 'E3',
  'DrDoS_UDP': 'E3',
  'Syn': 'E3',
  'DrDoS_SNMP': 'E4',
  'DrDoS_NetBIOS': 'E4',
  'TFTP': 'E5',
  'UDP-lag': 'E5',
  'WebDDoS': 'E5'
};
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  CartesianGrid, 
  Legend 
} from 'recharts';

const ALL_ATTACK_CLASSES = [
  'DrDoS_DNS',
  'DrDoS_LDAP',
  'DrDoS_MSSQL',
  'DrDoS_NTP',
  'DrDoS_NetBIOS',
  'DrDoS_SNMP',
  'DrDoS_SSDP',
  'DrDoS_UDP',
  'Syn',
  'TFTP',
  'UDP-lag',
  'WebDDoS'
];

export default function FewShotLabPage() {
  const [targetAttack, setTargetAttack] = useState('DrDoS_UDP');
  const [supportSize, setSupportSize] = useState(50);
  const [method, setMethod] = useState('1-NN');

  // Table filtering and search
  const [searchTerm, setSearchTerm] = useState('');
  const [tableMethodFilter, setTableMethodFilter] = useState('ALL');
  const [tableShotFilter, setTableShotFilter] = useState('ALL');

  const [activeRecord, setActiveRecord] = useState(null);
  const [allRecords, setAllRecords] = useState([]);
  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Live Simulation State
  const [simStatus, setSimStatus] = useState('IDLE'); // 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED'
  const [replaySpeed, setReplaySpeed] = useState(800);
  const [streamIndex, setStreamIndex] = useState(1);
  const [totalQueries, setTotalQueries] = useState(120);
  const [currentFlow, setCurrentFlow] = useState(null);
  const [selectedFlow, setSelectedFlow] = useState(null);
  const [eventHistory, setEventHistory] = useState([]);
  const [simStats, setSimStats] = useState({
    flows: 0,
    detections: 0,
    tp: 0,
    fp: 0,
    tn: 0,
    fn: 0,
    targetCount: 0,
    negativeCount: 0
  });

  const timerRef = useRef(null);
  const streamIndexRef = useRef(1);
  const simStatusRef = useRef('IDLE');
  const targetAttackRef = useRef(targetAttack);
  const methodRef = useRef(method);
  const supportSizeRef = useRef(supportSize);
  const totalQueriesRef = useRef(120);
  const replaySpeedRef = useRef(800);
  const isFetchingRef = useRef(false);

  // Synchronize refs
  useEffect(() => {
    targetAttackRef.current = targetAttack;
  }, [targetAttack]);

  useEffect(() => {
    methodRef.current = method;
  }, [method]);

  useEffect(() => {
    supportSizeRef.current = supportSize;
  }, [supportSize]);

  useEffect(() => {
    simStatusRef.current = simStatus;
  }, [simStatus]);

  useEffect(() => {
    replaySpeedRef.current = replaySpeed;
  }, [replaySpeed]);

  useEffect(() => {
    async function loadInitial() {
      try {
        setLoading(true);
        const [fewShotRes, summaryRes] = await Promise.all([
          fetchFewShot(),
          fetchFewShotSummary()
        ]);
        setAllRecords(fewShotRes.records || []);
        setSummaryData(summaryRes);
      } catch (err) {
        console.error('Failed to load few-shot lab data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadInitial();
  }, []);

  useEffect(() => {
    if (allRecords.length > 0) {
      const match = allRecords.find(
        (r) =>
          r.unseen_attack.toLowerCase() === targetAttack.toLowerCase() &&
          r.support_size === Number(supportSize) &&
          r.method.toLowerCase() === method.toLowerCase()
      );
      setActiveRecord(match || allRecords[0]);
    }
  }, [targetAttack, supportSize, method, allRecords]);

  // Load pool metadata when attack changes & pre-load flow 1 preview
  useEffect(() => {
    async function loadPool() {
      try {
        const poolInfo = await fetchFewShotLivePool(targetAttack);
        if (poolInfo && poolInfo.total_queries) {
          setTotalQueries(poolInfo.total_queries);
          totalQueriesRef.current = poolInfo.total_queries;
        }
      } catch (e) {
        console.warn('Failed to fetch pool info:', e.message);
      }
    }
    loadPool();

    // Pre-populate flow 1 on attack change so the 4-stage pipeline is immediately active
    fetchFewShotLiveNext({
      attack: targetAttack,
      method: method,
      shots: supportSize,
      index: 1
    }).then((initialData) => {
      if (initialData && !initialData.error) {
        setCurrentFlow(initialData);
      }
    }).catch(() => {});

    // If simulating, reset stream for new attack to maintain integrity
    if (simStatusRef.current === 'RUNNING' || simStatusRef.current === 'PAUSED') {
      stopSimulation();
    }
  }, [targetAttack]);

  // Dynamically update current sample if method or shots changes while inspecting
  useEffect(() => {
    if (currentFlow) {
      fetchFewShotLiveNext({
        attack: targetAttack,
        method: method,
        shots: supportSize,
        index: currentFlow.index
      }).then((updated) => {
        if (updated && !updated.error) {
          setCurrentFlow(updated);
        }
      }).catch(() => {});
    }
  }, [method, supportSize]);

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Step a single flow
  const stepFlow = async (idxToFetch) => {
    try {
      const data = await fetchFewShotLiveNext({
        attack: targetAttackRef.current,
        method: methodRef.current,
        shots: supportSizeRef.current,
        index: idxToFetch
      });

      if (data && !data.error) {
        if (!data.timestamp) {
          data.timestamp = new Date().toISOString();
        }
        if (data.total_in_pool) {
          setTotalQueries(data.total_in_pool);
          totalQueriesRef.current = data.total_in_pool;
        }

        // If target enterprise is OFFLINE, suppress attack detections
        const offList = getOfflineEnterprises();
        const tEnt = ATTACK_TO_ENTERPRISE[targetAttackRef.current] || 'E1';
        if (offList.includes(tEnt) && data.is_target) {
          data.is_detected = false;
          data.predicted_label = `SUPPRESSED (${tEnt} OFFLINE)`;
          if (data.pipeline?.step4_detection) {
            data.pipeline.step4_detection.decision = `SUPPRESSED (${tEnt} Offline)`;
            data.pipeline.step4_detection.is_alert = false;
          }
        }

        setCurrentFlow(data);
        setEventHistory((prev) => [data, ...prev].slice(0, 80));

        setSimStats((prev) => {
          const next = { ...prev };
          next.flows += 1;
          if (data.is_detected) next.detections += 1;
          if (data.is_target) next.targetCount += 1;
          else next.negativeCount += 1;

          if (data.audit === 'TP') next.tp += 1;
          else if (data.audit === 'FP') next.fp += 1;
          else if (data.audit === 'TN') next.tn += 1;
          else if (data.audit === 'FN') next.fn += 1;
          return next;
        });

        console.log(`[${formatFullDateTime(data.timestamp)}] [Few-Shot SOC Stream] Flow #${data.index}/${data.total_in_pool || 120}: ${data.flow_id} (${data.ground_truth}) -> ${data.audit} [${data.method}-${data.shots}s | Sim=${data.similarity.toFixed(4)} | τ=${data.threshold.toFixed(4)} | ${data.predicted_label}]`);

        return data;
      }
    } catch (err) {
      console.warn('[Few-Shot Live] Failed to step flow:', err.message);
    }
    return null;
  };

  const scheduleNextTick = (delay) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (simStatusRef.current !== 'RUNNING') return;

      const currIdx = streamIndexRef.current;
      if (currIdx > totalQueriesRef.current) {
        setSimStatus('COMPLETED');
        simStatusRef.current = 'COMPLETED';
        timerRef.current = null;
        console.log(`[Few-Shot Live] Completed replay of all ${totalQueriesRef.current} held-out queries.`);
        return;
      }

      if (!isFetchingRef.current) {
        isFetchingRef.current = true;
        try {
          await stepFlow(currIdx);
          streamIndexRef.current = currIdx + 1;
          setStreamIndex(currIdx + 1);
        } finally {
          isFetchingRef.current = false;
        }
      }

      if (simStatusRef.current === 'RUNNING') {
        scheduleNextTick(replaySpeedRef.current);
      }
    }, delay);
  };

  const startSimulation = async () => {
    if (simStatus === 'PAUSED') {
      setSimStatus('RUNNING');
      simStatusRef.current = 'RUNNING';
      scheduleNextTick(60);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    streamIndexRef.current = 1;
    setStreamIndex(1);
    setEventHistory([]);
    setSelectedFlow(null);
    setSimStats({
      flows: 0,
      detections: 0,
      tp: 0,
      fp: 0,
      tn: 0,
      fn: 0,
      targetCount: 0,
      negativeCount: 0
    });

    setSimStatus('RUNNING');
    simStatusRef.current = 'RUNNING';

    // Step first immediately
    isFetchingRef.current = true;
    try {
      await stepFlow(1);
      streamIndexRef.current = 2;
      setStreamIndex(2);
    } finally {
      isFetchingRef.current = false;
    }

    scheduleNextTick(replaySpeedRef.current);
  };

  const pauseSimulation = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setSimStatus('PAUSED');
    simStatusRef.current = 'PAUSED';
  };

  const stopSimulation = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setSimStatus('IDLE');
    simStatusRef.current = 'IDLE';
    streamIndexRef.current = 1;
    setStreamIndex(1);
    setSelectedFlow(null);
  };

  const clearEventLogs = () => {
    setEventHistory([]);
  };

  const singleStep = async () => {
    if (simStatus === 'RUNNING') pauseSimulation();
    const currIdx = streamIndexRef.current;
    if (currIdx > totalQueriesRef.current) return;
    setSelectedFlow(null);
    isFetchingRef.current = true;
    try {
      await stepFlow(currIdx);
      streamIndexRef.current = currIdx + 1;
      setStreamIndex(currIdx + 1);
    } finally {
      isFetchingRef.current = false;
    }
  };

  const handleSpeedChange = (newSpeed) => {
    setReplaySpeed(newSpeed);
    replaySpeedRef.current = newSpeed;
    if (simStatus === 'RUNNING') {
      scheduleNextTick(newSpeed);
    }
  };

  const filteredTableRecords = useMemo(() => {
    return allRecords.filter((r) => {
      const matchesSearch =
        r.unseen_attack.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesMethod =
        tableMethodFilter === 'ALL' || r.method.toUpperCase() === tableMethodFilter.toUpperCase();
      const matchesShot =
        tableShotFilter === 'ALL' || r.support_size === Number(tableShotFilter);
      return matchesSearch && matchesMethod && matchesShot;
    });
  }, [allRecords, searchTerm, tableMethodFilter, tableShotFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[350px] font-sans text-slate-400 text-xs">
        <RotateCw className="w-4 h-4 animate-spin mr-2" />
        <span>Loading few-shot benchmarks...</span>
      </div>
    );
  }

  const isBestConfig = method === '1-NN' && Number(supportSize) === 50;

  const attackRecords = allRecords.filter(
    (r) => r.unseen_attack.toLowerCase() === targetAttack.toLowerCase()
  );

  const chartData = [10, 20, 50, 100].map((shots) => {
    const knn = attackRecords.find((r) => r.method === '1-NN' && r.support_size === shots);
    const proto = attackRecords.find((r) => r.method === 'Prototype' && r.support_size === shots);
    return {
      shots: `${shots}s`,
      '1-NN F1': knn ? +(knn.f1 * 100).toFixed(2) : null,
      'Prototype F1': proto ? +(proto.f1 * 100).toFixed(2) : null,
      '1-NN Recall': knn ? +(knn.recall * 100).toFixed(2) : null,
      'Prototype Recall': proto ? +(proto.recall * 100).toFixed(2) : null
    };
  });

  const bestConfigData = summaryData?.bestConfiguration || {
    method: '1-NN',
    supportSize: 50,
    averageF1: 91.96,
    averageRecall: 97.48,
    averageFpr: 15.16
  };

  const totalAttacksCount = summaryData?.totalAttacks || ALL_ATTACK_CLASSES.length;
  const totalConfigsCount = allRecords.length || 96;

  const liveRecall = simStats.tp + simStats.fn > 0
    ? ((simStats.tp / (simStats.tp + simStats.fn)) * 100).toFixed(1)
    : '--';

  const liveFpr = simStats.fp + simStats.tn > 0
    ? ((simStats.fp / (simStats.fp + simStats.tn)) * 100).toFixed(1)
    : '--';

  const offlineEnterprises = getOfflineEnterprises();
  const targetEnt = ATTACK_TO_ENTERPRISE[targetAttack] || 'E1';
  const isTargetEntOffline = offlineEnterprises.includes(targetEnt);

  const displayFlow = selectedFlow || currentFlow;

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="p-3.5 sm:p-4 rounded-sm bg-[#141414] border border-[#262626] flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-orange-400" />
            <h1 className="text-sm sm:text-base font-sans font-semibold text-[#EDEDED]">
              Zero-Day Few-Shot Detection Lab
            </h1>
          </div>
          <p className="text-xs text-[#737373] font-sans mt-0.5">
            Strict federated isolation: each attack class excluded prior to FL training. Evaluated via frozen 64-D penultimate embeddings.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-sans">
          <span className="px-2 py-0.5 rounded-sm bg-[#181818] border border-[#2B2B2B] text-emerald-400 font-medium text-[11px]">
            15-Point Leakage Audit: Passed
          </span>
          <span className="px-2 py-0.5 rounded-sm bg-[#181818] border border-[#2B2B2B] text-[#D4D4D4] font-mono text-[11px]">
            {totalAttacksCount} Attacks • {totalConfigsCount} Configs
          </span>
        </div>
      </div>

      {/* Global Optimal Configuration Banner */}
      <div className="p-3.5 rounded-sm bg-[#141414] border border-[#262626]">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
              <span className="text-xs font-sans font-medium text-orange-400">
                Optimal Zero-Day Configuration ({totalAttacksCount} Held-Out Attack Classes)
              </span>
            </div>
            <div className="text-sm font-sans font-semibold text-[#EDEDED] mt-0.5">
              {bestConfigData.supportSize}-Shot {bestConfigData.method} Nearest-Support Exemplar Head
            </div>
            <p className="text-[11px] text-[#737373] font-sans mt-0.5">
              Empirical maximum F1 trade-off balancing exemplar coverage without intra-cluster feature dilution.
            </p>
          </div>

          <div className="flex items-center space-x-2.5 text-center">
            <div className="px-3 py-1.5 rounded-sm bg-[#181818] border border-[#262626]">
              <span className="text-[10px] text-[#737373] font-sans block">Mean F1</span>
              <span className="text-base font-mono font-bold text-orange-400">
                {bestConfigData.averageF1}%
              </span>
            </div>
            <div className="px-3 py-1.5 rounded-sm bg-[#181818] border border-[#262626]">
              <span className="text-[10px] text-[#737373] font-sans block">Mean Recall</span>
              <span className="text-base font-mono font-bold text-emerald-400">
                {bestConfigData.averageRecall}%
              </span>
            </div>
            <div className="px-3 py-1.5 rounded-sm bg-[#181818] border border-[#262626]">
              <span className="text-[10px] text-[#737373] font-sans block">Mean FPR</span>
              <span className="text-base font-mono font-bold text-[#EDEDED]">
                {bestConfigData.averageFpr}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Parameter Selector Controls Bar */}
      <div className="p-3.5 sm:p-4 rounded-sm bg-[#141414] border border-[#262626] space-y-3.5">
        <div className="flex items-center justify-between border-b border-[#262626] pb-2">
          <div className="flex items-center space-x-1.5">
            <Sliders className="w-3.5 h-3.5 text-orange-400" />
            <h3 className="text-xs font-sans font-semibold text-[#EDEDED]">
              Evaluation Parameter Selector
            </h3>
          </div>
          <span className="text-[11px] font-sans text-[#737373]">
            Active: <span className="text-[#EDEDED] font-medium">{targetAttack}</span> • <span className="font-mono text-orange-400">{supportSize}s</span> • <span className="font-mono text-orange-400">{method}</span>
          </span>
        </div>

        {/* 1. Attack Class Grid Selector */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-sans font-medium text-[#A3A3A3] block">
              1. Target Held-Out Attack Class (12 Attacks)
            </label>
            {isTargetEntOffline && (
              <span className="text-[11px] font-mono text-amber-400 bg-amber-950/60 border border-amber-800/60 px-1.5 py-0.2 rounded-sm font-semibold">
                Partition {targetEnt} is OFFLINE — Attacks Suppressed
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-1.5">
            {ALL_ATTACK_CLASSES.map((att) => {
              const isSelected = targetAttack.toLowerCase() === att.toLowerCase();
              const displayName = att.replace('DrDoS_', '');
              const ent = ATTACK_TO_ENTERPRISE[att];
              const isOff = offlineEnterprises.includes(ent);

              return (
                <button
                  key={att}
                  onClick={() => setTargetAttack(att)}
                  className={`py-1.5 px-2 rounded-sm border font-sans text-xs transition-all duration-150 truncate flex items-center justify-between ${
                    isSelected
                      ? 'bg-[#1E1915] border-orange-500 text-[#EDEDED] font-medium shadow-[0_0_8px_-2px_rgba(249,115,22,0.25)]'
                      : isOff
                      ? 'bg-[#0D0D0D] border-[#1F1F1F] text-[#525252]'
                      : 'bg-[#181818] border-[#262626] text-[#A3A3A3] hover:text-[#EDEDED] hover:border-[#383838] hover:bg-[#1E1E1E]'
                  }`}
                  title={`${att} (Partition ${ent}${isOff ? ' - OFFLINE' : ''})`}
                >
                  <span className={isOff ? 'line-through text-[#525252]' : ''}>{displayName}</span>
                  <span className={`text-[9px] font-mono ml-1 ${isOff ? 'text-[#3E3E3E]' : 'text-[#737373]'}`}>{ent}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2 & 3: Budget and Method */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
          {/* Budget */}
          <div>
            <label className="text-xs font-sans font-medium text-[#A3A3A3] block mb-1">
              2. Support Budget (k Examples)
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {[10, 20, 50, 100].map((shots) => (
                <button
                  key={shots}
                  onClick={() => setSupportSize(shots)}
                  className={`py-1 px-2 rounded-sm border font-sans text-xs transition-all duration-180 ease-out active:scale-[0.98] ${
                    supportSize === shots
                      ? 'bg-[#1E1915] border-orange-500 text-orange-400 font-medium'
                      : 'bg-[#181818] border-[#262626] text-[#A3A3A3] hover:text-[#EDEDED] hover:border-[#383838]'
                  }`}
                >
                  {shots} shots
                </button>
              ))}
            </div>
          </div>

          {/* Method */}
          <div>
            <label className="text-xs font-sans font-medium text-[#A3A3A3] block mb-1">
              3. Classification Head
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {['1-NN', 'Prototype'].map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={`py-1 px-3 rounded-sm border font-sans text-xs transition-all duration-180 ease-out active:scale-[0.98] ${
                    method === m
                      ? 'bg-[#1E1915] border-orange-500 text-orange-400 font-medium'
                      : 'bg-[#181818] border-[#262626] text-[#A3A3A3] hover:text-[#EDEDED] hover:border-[#383838]'
                  }`}
                >
                  {m === '1-NN' ? '1-NN (Exemplar)' : 'Prototype (Centroid)'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* LIVE ZERO-DAY INFERENCE REPLAY SIMULATOR                   */}
      {/* ========================================================= */}
      <div className="p-3.5 sm:p-4 rounded-sm bg-[#141414] border border-[#262626] space-y-3.5">
        {/* Simulation Controls & Status */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-sm bg-[#181818] border border-[#262626]">
          <div className="flex items-center space-x-2.5">
            <span className={`w-2.5 h-2.5 rounded-full ${
              simStatus === 'RUNNING'
                ? 'bg-emerald-400 animate-live-pulse'
                : simStatus === 'PAUSED'
                ? 'bg-amber-400'
                : simStatus === 'COMPLETED'
                ? 'bg-orange-400'
                : 'bg-[#525252]'
            }`} />
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-xs font-sans font-semibold text-[#EDEDED]">
                  Live Zero-Day Inference Simulation
                </h3>
                <span className="px-2 py-0.2 rounded-sm text-[10px] font-mono uppercase bg-[#141414] border border-[#2B2B2B] text-[#A3A3A3]">
                  {simStatus}
                </span>
              </div>
              <p className="text-[11px] text-[#737373] font-sans">
                Replaying real held-out queries via frozen <span className="font-mono text-orange-400">{targetAttack}</span> FL backbone ({method}, k={supportSize})
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Speed Selector */}
            <div className="flex items-center space-x-1 text-xs font-sans text-[#737373]">
              <span className="text-[11px]">Speed:</span>
              <select
                value={replaySpeed}
                onChange={(e) => handleSpeedChange(Number(e.target.value))}
                className="py-1 px-1.5 rounded-sm bg-[#141414] border border-[#2B2B2B] text-xs text-[#EDEDED] focus:outline-none"
              >
                <option value={1200}>1.2s</option>
                <option value={800}>800ms</option>
                <option value={400}>400ms</option>
              </select>
            </div>

            {/* Primary Start / Pause / Resume Button */}
            {simStatus === 'RUNNING' ? (
              <button
                onClick={pauseSimulation}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-sm bg-amber-950/60 hover:bg-amber-900/80 active:bg-amber-950 active:scale-[0.985] active:translate-y-[0.5px] border border-amber-700/80 text-amber-200 text-xs font-sans font-medium transition-all duration-180 ease-out"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>Pause</span>
              </button>
            ) : (
              <button
                onClick={startSimulation}
                className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-sm bg-orange-600 hover:bg-orange-500 active:bg-orange-700 active:scale-[0.985] active:translate-y-[0.5px] border border-orange-500 text-white text-xs font-sans font-semibold shadow-sm transition-all duration-180 ease-out"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{simStatus === 'PAUSED' ? 'Resume Detection' : 'Start Live Detection'}</span>
              </button>
            )}

            {/* Single Step */}
            <button
              onClick={singleStep}
              disabled={simStatus === 'RUNNING'}
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-sm bg-[#141414] hover:bg-[#202020] active:bg-[#101010] active:scale-[0.985] active:translate-y-[0.5px] border border-[#2B2B2B] text-[#EDEDED] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-sans transition-all duration-180 ease-out"
              title="Single Step Next Query"
            >
              <StepForward className="w-3.5 h-3.5 text-orange-400" />
              <span>Step</span>
            </button>

            {/* Reset / Stop */}
            <button
              onClick={stopSimulation}
              disabled={simStatus === 'IDLE' && eventHistory.length === 0}
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-sm bg-[#141414] hover:bg-[#202020] active:bg-[#101010] active:scale-[0.985] active:translate-y-[0.5px] border border-[#2B2B2B] text-[#737373] hover:text-[#EDEDED] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-sans transition-all duration-180 ease-out"
              title="Reset Simulation"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Live Telemetry KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {/* 1. Flows Processed */}
          <div className="p-2.5 rounded-sm bg-[#181818] border border-[#262626]">
            <span className="text-[10px] text-[#737373] font-sans block">Flows Evaluated</span>
            <div className="flex items-baseline space-x-1.5 mt-0.5">
              <span className="text-base font-mono font-bold text-[#EDEDED]">
                {simStats.flows}
              </span>
              <span className="text-[11px] font-mono text-[#737373]">
                / {totalQueries}
              </span>
            </div>
            <div className="h-1 rounded-sm bg-[#222222] overflow-hidden mt-1.5">
              <div
                className="h-full bg-orange-500 transition-all duration-200"
                style={{ width: `${Math.min(100, (simStats.flows / (totalQueries || 1)) * 100)}%` }}
              />
            </div>
          </div>

          {/* 2. Detections */}
          <div className="p-2.5 rounded-sm bg-[#181818] border border-[#262626]">
            <span className="text-[10px] text-[#737373] font-sans block">Zero-Day Detections</span>
            <span className="text-base font-mono font-bold text-red-400 mt-0.5 block">
              {simStats.detections}
            </span>
            <span className="text-[10px] text-[#737373] font-sans">
              Alerts raised
            </span>
          </div>

          {/* 3. Live Recall (TPR) */}
          <div className="p-2.5 rounded-sm bg-[#181818] border border-[#262626]">
            <span className="text-[10px] text-[#737373] font-sans block">Live Recall (TPR)</span>
            <span className="text-base font-mono font-bold text-emerald-400 mt-0.5 block">
              {liveRecall !== '--' ? `${liveRecall}%` : '--'}
            </span>
            <span className="text-[10px] text-[#737373] font-sans">
              {simStats.tp} / {simStats.tp + simStats.fn} target caught
            </span>
          </div>

          {/* 4. Live FPR */}
          <div className="p-2.5 rounded-sm bg-[#181818] border border-[#262626]">
            <span className="text-[10px] text-[#737373] font-sans block">Live FPR</span>
            <span className="text-base font-mono font-bold text-[#EDEDED] mt-0.5 block">
              {liveFpr !== '--' ? `${liveFpr}%` : '--'}
            </span>
            <span className="text-[10px] text-[#737373] font-sans">
              {simStats.fp} false alarms
            </span>
          </div>

          {/* 5. Current Prediction */}
          <div className="p-2.5 rounded-sm bg-[#181818] border border-[#262626] col-span-2 sm:col-span-1">
            <span className="text-[10px] text-[#737373] font-sans block">Current Verdict</span>
            <span className={`text-xs font-mono font-bold mt-1 block truncate ${
              displayFlow?.is_detected ? 'text-red-400' : displayFlow ? 'text-emerald-400' : 'text-[#737373]'
            }`}>
              {displayFlow ? (displayFlow.is_detected ? `ALERT: ${displayFlow.predicted_label}` : 'NORMAL / BENIGN') : 'STANDBY'}
            </span>
            <span className="text-[10px] text-[#737373] font-sans">
              {displayFlow ? `Confidence: ${displayFlow.confidence_pct}%` : 'Awaiting flow'}
            </span>
          </div>

          {/* 6. Similarity vs Threshold */}
          <div className="p-2.5 rounded-sm bg-[#181818] border border-[#262626] col-span-2 sm:col-span-1">
            <span className="text-[10px] text-[#737373] font-sans block">Similarity vs τ</span>
            <div className="flex items-baseline space-x-1 font-mono text-xs mt-1">
              <span className="font-bold text-orange-400">
                {displayFlow ? Number(displayFlow.similarity).toFixed(3) : '--'}
              </span>
              <span className="text-[#525252]">/</span>
              <span className="text-[#737373]">
                {displayFlow ? Number(displayFlow.threshold).toFixed(3) : '--'}
              </span>
            </div>
            <span className="text-[10px] text-[#737373] font-sans">
              {displayFlow ? (displayFlow.similarity >= displayFlow.threshold ? 'Above threshold' : 'Below threshold') : 'Threshold unapplied'}
            </span>
          </div>
        </div>

        {/* Visible 4-Step Architecture Pipeline */}
        <div className="rounded-sm border border-[#262626] bg-[#0D0D0D] p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3 border-b border-[#262626] pb-2">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-orange-500" />
              <span className="text-xs font-sans font-semibold text-[#EDEDED]">
                4-Stage Zero-Day Inference Pipeline
              </span>
              <span className="text-[11px] font-mono text-[#737373]">
                FLOW → EMBEDDING → {method.toUpperCase()} → DETECTION
              </span>
            </div>
            {selectedFlow && (
              <button
                onClick={() => setSelectedFlow(null)}
                className="text-[11px] font-sans text-orange-400 hover:text-orange-300"
              >
                Return to latest stream flow
              </button>
            )}
          </div>

          {displayFlow ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5 items-stretch">
              {/* Stage 1: FLOW */}
              <div className="rounded-sm bg-[#141414] border border-[#262626] p-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b border-[#262626] pb-1.5">
                    <div className="flex items-center space-x-1.5">
                      <Activity className="w-3.5 h-3.5 text-orange-400" />
                      <span className="text-[11px] font-sans font-semibold text-[#EDEDED]">
                        1. FLOW (NetFlow Ingest)
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-[#737373]">
                      {displayFlow.flow_id}
                    </span>
                  </div>

                  <div className="space-y-1 text-[11px] font-mono">
                    <div className="flex justify-between text-[#EDEDED]">
                      <span className="text-[#737373] font-sans">Ground Truth:</span>
                      <span className={`px-1.5 py-0.2 rounded-sm text-[10px] font-semibold ${
                        displayFlow.is_target
                          ? 'bg-red-950/60 text-red-400 border border-red-800/60'
                          : 'bg-[#181818] text-[#A3A3A3] border border-[#262626]'
                      }`}>
                        {displayFlow.ground_truth}
                      </span>
                    </div>
                    <div className="flex justify-between text-[#EDEDED]">
                      <span className="text-[#737373] font-sans">Timestamp:</span>
                      <span className="text-orange-400 font-mono text-[10px]">{formatFullDateTime(displayFlow.timestamp, true)}</span>
                    </div>
                    <div className="flex justify-between text-[#EDEDED]">
                      <span className="text-[#737373] font-sans">Dest Port:</span>
                      <span>{displayFlow.netflow?.destination_port ?? '--'}</span>
                    </div>
                    <div className="flex justify-between text-[#EDEDED]">
                      <span className="text-[#737373] font-sans">Duration:</span>
                      <span>{(displayFlow.netflow?.flow_duration_ms ?? 0).toFixed(1)} ms</span>
                    </div>
                    <div className="flex justify-between text-[#EDEDED]">
                      <span className="text-[#737373] font-sans">Rate:</span>
                      <span>{(displayFlow.netflow?.flow_packets_s ?? 0).toLocaleString()} pps</span>
                    </div>
                    <div className="flex justify-between text-[#EDEDED]">
                      <span className="text-[#737373] font-sans">Mean Pkt:</span>
                      <span>{(displayFlow.netflow?.packet_length_mean ?? 0).toFixed(0)} B</span>
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 pt-2 border-t border-[#262626] text-[10px] text-[#737373] font-sans">
                  {displayFlow.is_target ? 'Zero-day target attack query' : 'Balanced benign network query'}
                </div>
              </div>

              {/* Stage 2: EMBEDDING */}
              <div className="rounded-sm bg-[#141414] border border-[#262626] p-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b border-[#262626] pb-1.5">
                    <div className="flex items-center space-x-1.5">
                      <Cpu className="w-3.5 h-3.5 text-orange-400" />
                      <span className="text-[11px] font-sans font-semibold text-[#EDEDED]">
                        2. EMBEDDING (64-D Latent)
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-[#737373]">
                      Layer 5
                    </span>
                  </div>

                  <div className="space-y-1.5 text-[11px] font-mono">
                    <div className="flex justify-between text-[#EDEDED]">
                      <span className="text-[#737373] font-sans">Backbone:</span>
                      <span className="text-[#A3A3A3]">DDoSModel (Frozen)</span>
                    </div>
                    <div className="flex justify-between text-[#EDEDED]">
                      <span className="text-orange-400 font-bold">64 dimensions</span>
                    </div>
                    <div className="flex justify-between text-[#EDEDED]">
                      <span className="text-[#737373] font-sans">L2 Norm:</span>
                      <span>||z||₂ = {(displayFlow.latent_norm ?? 0).toFixed(3)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#737373] font-sans block mb-1">Vector Head Preview:</span>
                      <div className="grid grid-cols-4 gap-1">
                        {(displayFlow.latent_preview || []).slice(0, 8).map((val, idx) => (
                          <span
                            key={idx}
                            className="px-1 py-0.5 rounded-sm bg-[#0D0D0D] border border-[#262626] text-center text-[10px] text-orange-400 font-mono"
                          >
                            {val.toFixed(2)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 pt-2 border-t border-[#262626] text-[10px] text-[#737373] font-sans flex items-center space-x-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" />
                  <span>Zero leakage: target excluded from FL training</span>
                </div>
              </div>

              {/* Stage 3: 1-NN / PROTOTYPE */}
              <div className="rounded-sm bg-[#141414] border border-[#262626] p-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b border-[#262626] pb-1.5">
                    <div className="flex items-center space-x-1.5">
                      <Layers className="w-3.5 h-3.5 text-orange-400" />
                      <span className="text-[11px] font-sans font-semibold text-[#EDEDED]">
                        3. {displayFlow.method === '1-NN' ? '1-NN EXEMPLAR' : 'PROTOTYPE CENTROID'}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-orange-400">
                      k = {displayFlow.shots}s
                    </span>
                  </div>

                  <div className="space-y-1.5 text-[11px] font-mono">
                    <div className="flex justify-between text-[#EDEDED]">
                      <span className="text-[#737373] font-sans">Cosine Sim:</span>
                      <span className="text-base font-bold text-orange-400">
                        {(displayFlow.similarity ?? 0).toFixed(4)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[#EDEDED]">
                      <span className="text-[#737373] font-sans">Threshold τ:</span>
                      <span className="text-[#A3A3A3]">
                        {(displayFlow.threshold ?? 0).toFixed(4)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[#EDEDED]">
                      <span className="text-[#737373] font-sans">Decision Margin:</span>
                      <span className={`font-semibold ${
                        displayFlow.similarity >= displayFlow.threshold ? 'text-emerald-400' : 'text-[#737373]'
                      }`}>
                        {displayFlow.similarity >= displayFlow.threshold ? '+' : ''}
                        {(displayFlow.similarity - displayFlow.threshold).toFixed(4)}
                      </span>
                    </div>

                    <div className="pt-1">
                      <div className="flex justify-between text-[10px] font-sans text-[#737373] mb-0.5">
                        <span>0.0</span>
                        <span>Threshold τ</span>
                        <span>1.0</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[#0D0D0D] overflow-hidden relative border border-[#262626]">
                        <div
                          className={`h-full transition-all ${
                            displayFlow.similarity >= displayFlow.threshold ? 'bg-orange-500' : 'bg-[#333333]'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(0, displayFlow.similarity * 100))}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 pt-2 border-t border-[#262626] text-[10px] text-[#737373] font-sans">
                  Support thresholds calibrated strictly on {displayFlow.shots} exemplars
                </div>
              </div>

              {/* Stage 4: DETECTION */}
              <div className={`rounded-sm p-3 flex flex-col justify-between border ${
                displayFlow.is_detected
                  ? 'bg-red-950/20 border-red-800/60'
                  : 'bg-emerald-950/20 border-emerald-800/60'
              }`}>
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b border-[#262626] pb-1.5">
                    <div className="flex items-center space-x-1.5">
                      {displayFlow.is_detected ? (
                        <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                      ) : (
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      )}
                      <span className={`text-[11px] font-sans font-semibold ${
                        displayFlow.is_detected ? 'text-red-300' : 'text-emerald-300'
                      }`}>
                        4. DETECTION (SOC Verdict)
                      </span>
                    </div>
                    <span className={`px-1.5 py-0.2 rounded-sm text-[10px] font-mono font-bold ${
                      displayFlow.audit === 'TP'
                        ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                        : displayFlow.audit === 'TN'
                        ? 'bg-[#181818] text-[#A3A3A3] border border-[#262626]'
                        : displayFlow.audit === 'FP'
                        ? 'bg-amber-950/60 text-amber-400 border border-amber-800/60'
                        : 'bg-red-950/60 text-red-400 border border-red-800/60'
                    }`}>
                      {displayFlow.audit === 'TP' ? 'TP · TRUE POSITIVE' :
                       displayFlow.audit === 'TN' ? 'TN · TRUE NEGATIVE' :
                       displayFlow.audit === 'FP' ? 'FP · FALSE POSITIVE' : 'FN · MISSED TARGET'}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-[11px]">
                    <div className="p-2 rounded-sm bg-[#0D0D0D] border border-[#262626]">
                      <span className="text-[10px] text-[#737373] font-sans block">Decision:</span>
                      <span className={`text-xs font-mono font-bold block ${
                        displayFlow.is_detected ? 'text-red-400' : 'text-emerald-400'
                      }`}>
                        {displayFlow.is_detected
                          ? `ZERO-DAY DETECTED: ${displayFlow.predicted_label}`
                          : `TRAFFIC PERMITTED: NORMAL`}
                      </span>
                    </div>

                    <div className="flex justify-between font-mono text-[#EDEDED] text-[11px]">
                      <span className="text-[#737373] font-sans">Confidence:</span>
                      <span className="text-[#EDEDED] font-semibold">{displayFlow.confidence_pct}%</span>
                    </div>

                    <div className="flex justify-between font-mono text-[#EDEDED] text-[11px]">
                      <span className="text-[#737373] font-sans">Threat Action:</span>
                      <span className={displayFlow.is_detected ? 'text-red-400 font-medium' : 'text-[#737373]'}>
                        {displayFlow.is_detected ? 'Raise Incident Ticket' : 'Allow Throughput'}
                      </span>
                    </div>

                    <div className="flex justify-between font-mono text-[#EDEDED] text-[11px]">
                      <span className="text-[#737373] font-sans">Detection Time:</span>
                      <span className="text-[#A3A3A3]">{formatEventTime(displayFlow.timestamp)}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 pt-2 border-t border-[#262626] text-[10px] text-[#737373] font-sans">
                  {displayFlow.is_detected
                    ? 'Open-set threshold exceeded: zero-day signature intercepted'
                    : 'Below anomaly threshold: recognized as benign network profile'}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-xs font-sans text-[#737373] border border-dashed border-[#262626] rounded-sm">
              Click <span className="text-orange-400 font-semibold">[ START LIVE DETECTION ]</span> or <span className="text-[#EDEDED] font-semibold">[ STEP ]</span> to stream real held-out query flows through the 4-stage pipeline.
            </div>
          )}
        </div>

        {/* Live Event Stream Table */}
        <div className="rounded-sm border border-[#262626] bg-[#141414] overflow-hidden">
          <div className="p-2.5 sm:p-3 bg-[#0D0D0D] border-b border-[#262626] flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Activity className="w-3.5 h-3.5 text-orange-400" />
              <span className="text-xs font-sans font-semibold text-[#EDEDED]">
                Live Replay Event Feed ({eventHistory.length} flows streamed)
              </span>
            </div>
            <div className="flex items-center space-x-2.5">
              <span className="text-[11px] font-sans text-[#737373] hidden sm:inline">
                Click any row to inspect embedding & pipeline details
              </span>
              {eventHistory.length > 0 && (
                <button
                  onClick={clearEventLogs}
                  className="flex items-center space-x-1 px-2 py-0.5 rounded-sm bg-[#181818] hover:bg-[#222222] active:bg-[#151515] active:scale-[0.985] border border-[#262626] text-[#A3A3A3] hover:text-[#EDEDED] text-[10px] font-sans transition-all duration-180 ease-out"
                  title="Clear event history table"
                >
                  <Trash2 className="w-3 h-3 text-[#737373]" />
                  <span>Clear Feed</span>
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto max-h-[260px]">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#0D0D0D] border-b border-[#262626] text-[#737373] font-sans text-[11px] z-10">
                <tr>
                  <th className="py-2 px-3 font-medium">#</th>
                  <th className="py-2 px-3 font-medium">Timestamp</th>
                  <th className="py-2 px-3 font-medium">Flow ID</th>
                  <th className="py-2 px-3 font-medium">Ground Truth</th>
                  <th className="py-2 px-3 font-medium">Dst Port</th>
                  <th className="py-2 px-3 font-medium">Latent ||z||₂</th>
                  <th className="py-2 px-3 font-medium">Similarity</th>
                  <th className="py-2 px-3 font-medium">Threshold τ</th>
                  <th className="py-2 px-3 font-medium">Verdict</th>
                  <th className="py-2 px-3 font-medium">Audit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#262626] font-mono">
                {eventHistory.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="py-6 text-center text-[#737373] font-sans text-xs">
                      No flows streamed yet. Click <span className="text-orange-400 font-medium">[ START LIVE DETECTION ]</span> above to begin.
                    </td>
                  </tr>
                ) : (
                  eventHistory.map((ev, i) => {
                    const isSelected = displayFlow?.flow_id === ev.flow_id;
                    return (
                      <tr
                        key={ev.flow_id + '-' + i}
                        onClick={() => setSelectedFlow(ev)}
                        className={`transition-colors cursor-pointer text-[11px] ${
                          isSelected ? 'bg-[#1E1915] text-[#EDEDED] font-medium border-l-2 border-l-orange-500' : 'text-[#EDEDED] hover:bg-[#1E1E1E]'
                        }`}
                      >
                        <td className="py-1.5 px-3 text-[#737373] font-sans">{ev.index || (eventHistory.length - i)}</td>
                        <td className="py-1.5 px-3 text-[#A3A3A3] font-mono text-[11px] whitespace-nowrap cursor-help" title={formatFullDateTime(ev.timestamp, true)}>
                          {formatEventTime(ev.timestamp)}
                        </td>
                        <td className="py-1.5 px-3 text-orange-400 font-medium">{ev.flow_id}</td>
                        <td className="py-1.5 px-3">
                          <span className={`px-1.5 py-0.2 rounded-sm text-[10px] font-medium ${
                            ev.is_target
                              ? 'bg-red-950/60 text-red-400 border border-red-800/40'
                              : 'bg-[#181818] text-[#A3A3A3] border border-[#262626]'
                          }`}>
                            {ev.ground_truth}
                          </span>
                        </td>
                        <td className="py-1.5 px-3 text-[#A3A3A3]">{ev.netflow?.destination_port ?? '--'}</td>
                        <td className="py-1.5 px-3 text-[#A3A3A3]">{(ev.latent_norm ?? 0).toFixed(2)}</td>
                        <td className="py-1.5 px-3 text-orange-400 font-semibold">{(ev.similarity ?? 0).toFixed(4)}</td>
                        <td className="py-1.5 px-3 text-[#A3A3A3]">{(ev.threshold ?? 0).toFixed(4)}</td>
                        <td className="py-1.5 px-3">
                          <span className={`px-1.5 py-0.2 rounded-sm text-[10px] font-semibold ${
                            ev.is_detected
                              ? 'bg-red-950/60 text-red-400 border border-red-800/60'
                              : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                          }`}>
                            {ev.is_detected ? 'DETECTED' : 'NORMAL'}
                          </span>
                        </td>
                        <td className="py-1.5 px-3">
                          <span className={`px-1.5 py-0.2 rounded-sm text-[10px] font-bold ${
                            ev.audit === 'TP'
                              ? 'text-emerald-400'
                              : ev.audit === 'TN'
                              ? 'text-[#737373]'
                              : ev.audit === 'FP'
                              ? 'text-amber-400'
                              : 'text-red-400'
                          }`}>
                            {ev.audit}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* OFFLINE BENCHMARK MATRIX & RESEARCH RESULTS               */}
      {/* ========================================================= */}

      {/* Active Configuration Detailed Result Card */}
      <FewShotResultCard record={activeRecord} isBest={isBestConfig} />

      {/* Comparison Curves */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        {/* Chart 1: F1 Score vs Support Size */}
        <div className="p-3.5 rounded-sm bg-[#141414] border border-[#262626]">
          <div className="flex items-center justify-between mb-2.5">
            <div>
              <h3 className="text-xs font-sans font-semibold text-[#EDEDED]">
                {targetAttack} — Open-Set F1 vs Support Budget
              </h3>
              <p className="text-[11px] text-[#737373] font-sans">
                1-NN Exemplar vs. Prototype Centroid Head
              </p>
            </div>
            <span className="text-[11px] font-mono text-[#737373]">
              {targetAttack === 'WebDDoS' ? '176 Queries' : '3,000 Queries'}
            </span>
          </div>

          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 15, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 2" stroke="#222222" />
                <XAxis dataKey="shots" stroke="#333333" tick={{ fill: '#737373', fontSize: 10, fontFamily: 'monospace' }} />
                <YAxis domain={['auto', 100]} stroke="#333333" tick={{ fill: '#737373', fontSize: 10, fontFamily: 'monospace' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#181818',
                    borderColor: '#262626',
                    borderRadius: '2px',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    color: '#EDEDED'
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'sans-serif' }} />
                <Line type="monotone" dataKey="1-NN F1" stroke="#F97316" strokeWidth={1.5} dot={{ r: 2.5 }} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="Prototype F1" stroke="#A3A3A3" strokeWidth={1.5} strokeDasharray="3 3" dot={{ r: 2.5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Recall vs Support Size */}
        <div className="p-3.5 rounded-sm bg-[#141414] border border-[#262626]">
          <div className="flex items-center justify-between mb-2.5">
            <div>
              <h3 className="text-xs font-sans font-semibold text-[#EDEDED]">
                {targetAttack} — Open-Set Recall (TPR) vs Support Budget
              </h3>
              <p className="text-[11px] text-[#737373] font-sans">
                Capture rate of held-out target attack flows
              </p>
            </div>
            <span className="text-[11px] font-mono text-[#737373]">
              {targetAttack === 'WebDDoS' ? '88 Positives' : '1,500 Positives'}
            </span>
          </div>

          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 15, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 2" stroke="#222222" />
                <XAxis dataKey="shots" stroke="#333333" tick={{ fill: '#737373', fontSize: 10, fontFamily: 'monospace' }} />
                <YAxis domain={['auto', 100]} stroke="#333333" tick={{ fill: '#737373', fontSize: 10, fontFamily: 'monospace' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#181818',
                    borderColor: '#262626',
                    borderRadius: '2px',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    color: '#EDEDED'
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'sans-serif' }} />
                <Line type="monotone" dataKey="1-NN Recall" stroke="#22C55E" strokeWidth={1.5} dot={{ r: 2.5 }} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="Prototype Recall" stroke="#EA580C" strokeWidth={1.5} strokeDasharray="3 3" dot={{ r: 2.5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Complete Benchmark Table */}
      <div className="p-3.5 sm:p-4 rounded-sm bg-[#141414] border border-[#262626] space-y-2.5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-sans font-semibold text-[#EDEDED]">
              Benchmark Matrix ({allRecords.length} Configurations Across 12 Attacks)
            </h3>
            <p className="text-[11px] text-[#737373] font-sans">
              Click any configuration to inspect parameters and confusion matrix
            </p>
          </div>

          {/* Table Filters & Search */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-sans w-full sm:w-auto">
            {/* Search */}
            <div className="relative flex-1 sm:flex-initial">
              <Search className="w-3.5 h-3.5 text-[#737373] absolute left-2.5 top-2" />
              <input
                type="text"
                placeholder="Filter attack..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1 rounded-sm bg-[#181818] border border-[#262626] text-xs text-[#EDEDED] placeholder-[#737373] focus:outline-none focus:border-orange-500"
              />
            </div>

            {/* Method filter */}
            <select
              value={tableMethodFilter}
              onChange={(e) => setTableMethodFilter(e.target.value)}
              className="py-1 px-2 rounded-sm bg-[#181818] border border-[#262626] text-xs text-[#EDEDED] focus:outline-none focus:border-orange-500"
            >
              <option value="ALL">All Methods</option>
              <option value="1-NN">1-NN</option>
              <option value="Prototype">Prototype</option>
            </select>

            {/* Shots filter */}
            <select
              value={tableShotFilter}
              onChange={(e) => setTableShotFilter(e.target.value)}
              className="py-1 px-2 rounded-sm bg-[#181818] border border-[#262626] text-xs text-[#EDEDED] focus:outline-none focus:border-orange-500"
            >
              <option value="ALL">All Shots</option>
              <option value="10">10s</option>
              <option value="20">20s</option>
              <option value="50">50s</option>
              <option value="100">100s</option>
            </select>
          </div>
        </div>

        {/* Dense Table */}
        <div className="overflow-x-auto max-h-[400px] rounded-sm border border-[#262626]">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-[#0D0D0D] border-b border-[#262626] text-[#737373] font-sans text-[11px] z-10">
              <tr>
                <th className="py-2 px-3 font-medium">Attack</th>
                <th className="py-2 px-3 font-medium">Method</th>
                <th className="py-2 px-3 font-medium">Shots</th>
                <th className="py-2 px-3 font-medium">Threshold τ</th>
                <th className="py-2 px-3 font-medium">F1 Score</th>
                <th className="py-2 px-3 font-medium">Recall</th>
                <th className="py-2 px-3 font-medium">FPR</th>
                <th className="py-2 px-3 font-medium">Accuracy</th>
                <th className="py-2 px-3 font-medium">Precision</th>
                <th className="py-2 px-3 font-medium">TP / TN / FP / FN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#262626] font-mono">
              {filteredTableRecords.map((r, i) => {
                const isSelectedRow =
                  r.unseen_attack.toLowerCase() === targetAttack.toLowerCase() &&
                  r.support_size === Number(supportSize) &&
                  r.method.toLowerCase() === method.toLowerCase();

                return (
                  <tr
                    key={i}
                    onClick={() => {
                      setTargetAttack(r.unseen_attack);
                      setSupportSize(r.support_size);
                      setMethod(r.method);
                    }}
                    className={`transition-colors cursor-pointer ${
                      isSelectedRow
                        ? 'bg-[#1E1915] text-[#EDEDED] font-medium border-l-2 border-l-orange-500'
                        : 'text-[#A3A3A3] hover:bg-[#1E1E1E] hover:text-[#EDEDED]'
                    }`}
                  >
                    <td className="py-1.5 px-3 font-sans font-medium text-[#EDEDED]">{r.unseen_attack}</td>
                    <td className="py-1.5 px-3">
                      <span className="px-1.5 py-0.2 rounded-sm text-[10px] bg-[#181818] text-[#A3A3A3] border border-[#262626]">
                        {r.method}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 text-[#EDEDED]">{r.support_size}s</td>
                    <td className="py-1.5 px-3 text-[#737373]">{Number(r.threshold).toFixed(4)}</td>
                    <td className="py-1.5 px-3 font-medium text-[#EDEDED]">
                      {(r.f1 * 100).toFixed(2)}%
                    </td>
                    <td className="py-1.5 px-3 font-medium text-[#EDEDED]">
                      {(r.recall * 100).toFixed(2)}%
                    </td>
                    <td className="py-1.5 px-3 text-[#737373]">{(r.fpr * 100).toFixed(2)}%</td>
                    <td className="py-1.5 px-3 text-[#A3A3A3]">{(r.accuracy * 100).toFixed(2)}%</td>
                    <td className="py-1.5 px-3 text-[#A3A3A3]">{(r.precision * 100).toFixed(2)}%</td>
                    <td className="py-1.5 px-3 text-[10px] text-[#737373]">
                      {r.tp} / {r.tn} / {r.fp} / {r.fn}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between items-center text-[11px] text-[#737373] font-sans px-0.5">
          <span>Showing {filteredTableRecords.length} of {allRecords.length} configurations</span>
          <span>Verified offline evaluation split</span>
        </div>
      </div>
    </div>
  );
}
