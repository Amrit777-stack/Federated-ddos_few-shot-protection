const fs = require('fs');
const path = require('path');

// Resolve project root (one level up from server/)
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const METRICS_DIR = path.join(PROJECT_ROOT, 'results', 'metrics');
const FEDERATED_DIR = path.join(PROJECT_ROOT, 'results', 'federated');

// In-memory cache
const cache = {
  fewShotMaster: null,
  fewShotSummary: null,
  roundHistory: null,
  g20Metrics: null,
  finalComparison: null,
  heldoutUdpMetrics: null,
  heldoutSnmpMetrics: null,
  heldoutNetbiosMetrics: null,
  fewShotLivePool: null,
  lastLoaded: null
};

// Operational online/offline status for simulated enterprises
const enterpriseStatuses = {
  enterprise_1: 'ONLINE',
  enterprise_2: 'ONLINE',
  enterprise_3: 'ONLINE',
  enterprise_4: 'ONLINE',
  enterprise_5: 'ONLINE'
};

/**
 * Robust CSV parser for RFC4180 / standard comma-separated files
 */
function parseCSV(content) {
  const lines = content.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];

  // Parse header
  const headers = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === headers.length) {
      const row = {};
      headers.forEach((h, idx) => {
        const val = values[idx];
        const num = Number(val);
        row[h] = !isNaN(num) && val !== '' && !val.includes('-') && isFinite(num) ? num : val;
      });
      rows.push(row);
    }
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Safely load JSON file
 */
function safeLoadJSON(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn(`[dataService] Error loading JSON from ${filePath}:`, err.message);
  }
  return null;
}

/**
 * Safely load CSV file
 */
function safeLoadCSV(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      return parseCSV(raw);
    }
  } catch (err) {
    console.warn(`[dataService] Error loading CSV from ${filePath}:`, err.message);
  }
  return null;
}

/**
 * Refresh cache from disk
 */
function refreshData() {
  const all12Path = path.join(METRICS_DIR, 'true_heldout_few_shot_all12.csv');
  const all12SummaryPath = path.join(METRICS_DIR, 'true_heldout_few_shot_all12_summary.csv');

  if (fs.existsSync(all12Path)) {
    cache.fewShotMaster = safeLoadCSV(all12Path);
    cache.fewShotSummary = safeLoadCSV(all12SummaryPath);
  } else {
    cache.fewShotMaster = safeLoadCSV(path.join(METRICS_DIR, 'true_heldout_few_shot.csv'));
    cache.fewShotSummary = safeLoadCSV(path.join(METRICS_DIR, 'true_heldout_few_shot_summary.csv'));
  }

  cache.finalComparison = safeLoadCSV(path.join(METRICS_DIR, 'final_comparison.csv'));

  cache.roundHistory = safeLoadJSON(path.join(FEDERATED_DIR, 'run_010_20_rounds', 'round_history.json'));
  cache.g20Metrics = safeLoadJSON(path.join(FEDERATED_DIR, 'run_010_20_rounds', 'metrics.json'));
  cache.heldoutUdpMetrics = safeLoadJSON(path.join(FEDERATED_DIR, 'heldout_udp', 'metrics.json'));
  cache.heldoutSnmpMetrics = safeLoadJSON(path.join(FEDERATED_DIR, 'heldout_snmp', 'metrics.json'));
  cache.heldoutNetbiosMetrics = safeLoadJSON(path.join(FEDERATED_DIR, 'heldout_netbios', 'metrics.json'));

  cache.lastLoaded = new Date().toISOString();
  console.log(`[dataService] Data loaded at ${cache.lastLoaded}. Few-shot rows: ${cache.fewShotMaster?.length || 0}`);
}

// Initial load
refreshData();

module.exports = {
  refreshData,

  // Overview
  getOverview() {
    if (!cache.fewShotSummary || !cache.g20Metrics) {
      refreshData();
    }

    const fsSummary = this.getFewShotSummary();
    const bestConfig = fsSummary?.bestConfiguration || {
      averageF1: 91.96,
      averageRecall: 97.48,
      averageFpr: 15.16
    };

    return {
      system: 'SENTINEL-FL',
      title: 'Federated DDoS Defense SOC',
      status: 'OPERATIONAL',
      mode: 'RESEARCH MODE',
      environment: 'SIMULATED ENTERPRISE ENVIRONMENT',
      timestamp: new Date().toISOString(),
      topMetrics: {
        enterpriseClients: 5,
        flRounds: cache.g20Metrics?.rounds || 20,
        fedproxAccuracy: cache.g20Metrics?.final_metrics?.accuracy ? +(cache.g20Metrics.final_metrics.accuracy * 100).toFixed(2) : 72.69,
        fedproxF1: cache.g20Metrics?.final_metrics?.f1 ? +(cache.g20Metrics.final_metrics.f1 * 100).toFixed(2) : 70.55,
        fewShotBestF1: bestConfig.averageF1, // Optimal few-shot configuration across all held-out zero-day attacks
        fewShotBestRecall: bestConfig.averageRecall,
        fewShotBestFpr: bestConfig.averageFpr,
        centralizedRfAccuracy: 87.11,
        centralizedNnAccuracy: 75.55,
        vanillaFedavgAccuracy: 57.42
      },
      federationNodes: [
        { id: 'E1', name: 'Enterprise 1 (DNS/LDAP Core)', status: enterpriseStatuses.enterprise_1 || 'ONLINE', samples: 11700, round: 20, health: enterpriseStatuses.enterprise_1 === 'OFFLINE' ? 'OFFLINE' : 'HEALTHY', riskScore: enterpriseStatuses.enterprise_1 === 'OFFLINE' ? 0 : 12 },
        { id: 'E2', name: 'Enterprise 2 (NTP/SSDP Gateway)', status: enterpriseStatuses.enterprise_2 || 'ONLINE', samples: 15000, round: 20, health: enterpriseStatuses.enterprise_2 === 'OFFLINE' ? 'OFFLINE' : 'HEALTHY', riskScore: enterpriseStatuses.enterprise_2 === 'OFFLINE' ? 0 : 18 },
        { id: 'E3', name: 'Enterprise 3 (Database & Syn Core)', status: enterpriseStatuses.enterprise_3 || 'ONLINE', samples: 17400, round: 20, health: enterpriseStatuses.enterprise_3 === 'OFFLINE' ? 'OFFLINE' : 'HEALTHY', riskScore: enterpriseStatuses.enterprise_3 === 'OFFLINE' ? 0 : 16 },
        { id: 'E4', name: 'Enterprise 4 (SNMP/NetBIOS Cluster)', status: enterpriseStatuses.enterprise_4 || 'ONLINE', samples: 13312, round: 20, health: enterpriseStatuses.enterprise_4 === 'OFFLINE' ? 'OFFLINE' : 'HEALTHY', riskScore: enterpriseStatuses.enterprise_4 === 'OFFLINE' ? 0 : 24 },
        { id: 'E5', name: 'Enterprise 5 (TFTP/WebDDoS Ingress)', status: enterpriseStatuses.enterprise_5 || 'ONLINE', samples: 14939, round: 20, health: enterpriseStatuses.enterprise_5 === 'OFFLINE' ? 'OFFLINE' : 'HEALTHY', riskScore: enterpriseStatuses.enterprise_5 === 'OFFLINE' ? 0 : 21 }
      ],
      recentAlertsSummary: {
        totalAlerts24h: 342,
        mitigatedZeroDay: 18,
        activeHighThreats: 1,
        simulatedNotice: 'All telemetry and alerts are generated from benchmark evaluation datasets.'
      }
    };
  },

  // Enterprises
  getEnterprises() {
    return [
      {
        id: 'enterprise_1',
        label: 'Enterprise 1',
        name: 'Enterprise 1 - Infrastructure Core',
        clientSize: 11700,
        status: 'ONLINE',
        lastRound: 20,
        flParticipation: '100% (20/20 rounds)',
        anomalyScore: 0.12,
        statusBadge: 'HEALTHY',
        isSimulated: true,
        trafficProfile: {
          BENIGN: 25.0,
          DrDoS_DNS: 70.0,
          DrDoS_LDAP: 70.0,
          TFTP: 30.0
        },
        description: 'Hosts core directory and resolver infrastructure. Dominated by recursive DNS and LDAP query patterns.',
        totalSamplesHeldout: 11700
      },
      {
        id: 'enterprise_2',
        label: 'Enterprise 2',
        name: 'Enterprise 2 - Cloud Gateway',
        clientSize: 15000,
        status: 'ONLINE',
        lastRound: 20,
        flParticipation: '100% (20/20 rounds)',
        anomalyScore: 0.18,
        statusBadge: 'HEALTHY',
        isSimulated: true,
        trafficProfile: {
          BENIGN: 20.0,
          DrDoS_DNS: 30.0,
          DrDoS_LDAP: 30.0,
          DrDoS_NTP: 70.0,
          DrDoS_SSDP: 70.0,
          'UDP-lag': 30.0
        },
        description: 'Cloud interconnect and IoT boundary proxy. Heavy SSDP discovery and NTP synchronization flows.',
        totalSamplesHeldout: 15000
      },
      {
        id: 'enterprise_3',
        label: 'Enterprise 3',
        name: 'Enterprise 3 - Financial Data Center',
        clientSize: 17400,
        status: 'ONLINE',
        lastRound: 20,
        flParticipation: '100% (20/20 rounds)',
        anomalyScore: 0.18,
        statusBadge: 'HEALTHY',
        isSimulated: true,
        trafficProfile: {
          BENIGN: 20.0,
          DrDoS_MSSQL: 70.0,
          DrDoS_NetBIOS: 30.0,
          DrDoS_NTP: 30.0,
          DrDoS_UDP: 70.0,
          Syn: 70.0
        },
        description: 'Transaction processing and database clusters. Target of heavy SYN flooding and UDP reflection attempts.',
        totalSamplesHeldout: 13200 // When DrDoS_UDP held out
      },
      {
        id: 'enterprise_4',
        label: 'Enterprise 4',
        name: 'Enterprise 4 - Industrial Telemetry Node',
        clientSize: 13312,
        status: 'ONLINE',
        lastRound: 20,
        flParticipation: '100% (20/20 rounds)',
        anomalyScore: 0.24,
        statusBadge: 'HEALTHY',
        isSimulated: true,
        trafficProfile: {
          BENIGN: 20.0,
          DrDoS_MSSQL: 30.0,
          DrDoS_NetBIOS: 70.0,
          DrDoS_SNMP: 70.0,
          Syn: 30.0,
          WebDDoS: 32.0
        },
        description: 'SCADA and operational network management. Heavy SNMP monitoring and NetBIOS endpoint traffic.',
        totalSamplesHeldout: 9112 // When SNMP or NetBIOS held out
      },
      {
        id: 'enterprise_5',
        label: 'Enterprise 5',
        name: 'Enterprise 5 - Regional Edge Perimeter',
        clientSize: 14939,
        status: 'ONLINE',
        lastRound: 20,
        flParticipation: '100% (20/20 rounds)',
        anomalyScore: 0.31,
        statusBadge: 'HEALTHY',
        isSimulated: true,
        trafficProfile: {
          BENIGN: 15.0,
          DrDoS_SNMP: 30.0,
          DrDoS_SSDP: 30.0,
          DrDoS_UDP: 30.0,
          TFTP: 70.0,
          'UDP-lag': 70.0,
          WebDDoS: 68.0
        },
        description: 'High-bandwidth transit edge with diverse peerings. Vulnerable to blended TFTP and UDP-lag bursts.',
        totalSamplesHeldout: 13139 // When UDP held out
      }
    ].map(e => ({
      ...e,
      status: enterpriseStatuses[e.id] || 'ONLINE',
      isOffline: (enterpriseStatuses[e.id] || 'ONLINE') === 'OFFLINE'
    }));
  },

  setEnterpriseStatus(id, status) {
    const raw = String(id || '').toLowerCase();
    const match = raw.match(/([1-5])/);
    const key = match ? `enterprise_${match[1]}` : 'enterprise_1';
    const newStatus = String(status || '').toUpperCase() === 'OFFLINE' ? 'OFFLINE' : 'ONLINE';
    enterpriseStatuses[key] = newStatus;
    return { enterpriseId: key, status: newStatus, isOffline: newStatus === 'OFFLINE' };
  },

  getEnterpriseStatuses() {
    return { ...enterpriseStatuses };
  },

  // Few-Shot Master Records with dynamic filtering
  getFewShotRecords(attack, shots, method) {
    if (!cache.fewShotMaster) refreshData();

    if (!cache.fewShotMaster) {
      return { error: 'Artifact unavailable', details: 'results/metrics/true_heldout_few_shot.csv not found' };
    }

    let records = [...cache.fewShotMaster];

    if (attack) {
      records = records.filter(r => r.unseen_attack.toLowerCase() === attack.toLowerCase());
    }
    if (shots) {
      const numShots = Number(shots);
      records = records.filter(r => r.support_size === numShots);
    }
    if (method) {
      records = records.filter(r => r.method.toLowerCase() === method.toLowerCase());
    }

    return {
      count: records.length,
      filters: { attack: attack || 'all', shots: shots ? Number(shots) : 'all', method: method || 'all' },
      records
    };
  },

  // Get records for specific attack
  getFewShotByAttack(attack) {
    if (!cache.fewShotMaster) refreshData();

    if (!cache.fewShotMaster) {
      return { error: 'Artifact unavailable', details: 'results/metrics/true_heldout_few_shot.csv not found' };
    }

    const filtered = cache.fewShotMaster.filter(r => r.unseen_attack.toLowerCase() === attack.toLowerCase());
    if (filtered.length === 0) {
      return { error: 'Invalid attack', message: `No records found for attack '${attack}'` };
    }

    return {
      attack,
      count: filtered.length,
      records: filtered
    };
  },

  // Few-Shot Summary
  getFewShotSummary() {
    if (!cache.fewShotSummary || !cache.fewShotMaster) refreshData();

    if (!cache.fewShotSummary && !cache.fewShotMaster) {
      return { error: 'Artifact unavailable', details: 'results/metrics/true_heldout_few_shot_summary.csv not found' };
    }

    const records = cache.fewShotMaster || [];
    const attacks = [...new Set(records.map(r => r.unseen_attack))];
    const attackHighlights = {};

    attacks.forEach(att => {
      const attRecords = records.filter(r => r.unseen_attack === att);
      let best = attRecords[0];
      attRecords.forEach(r => {
        if ((r.f1 || 0) > (best?.f1 || 0)) best = r;
      });
      if (best) {
        attackHighlights[att] = {
          method: best.method,
          supportSize: best.support_size,
          f1: +(best.f1 * 100).toFixed(2),
          recall: +(best.recall * 100).toFixed(2),
          fpr: +(best.fpr * 100).toFixed(2),
          accuracy: +(best.accuracy * 100).toFixed(2)
        };
      }
    });

    // Find best overall configuration across support_size & method
    const configs = {};
    records.forEach(r => {
      const key = `${r.method}-${r.support_size}`;
      if (!configs[key]) configs[key] = { method: r.method, supportSize: r.support_size, sumF1: 0, sumRec: 0, sumFpr: 0, sumAcc: 0, count: 0 };
      configs[key].sumF1 += r.f1 || 0;
      configs[key].sumRec += r.recall || 0;
      configs[key].sumFpr += r.fpr || 0;
      configs[key].sumAcc += r.accuracy || 0;
      configs[key].count += 1;
    });

    let bestConfig = { method: '1-NN', supportSize: 50, averageF1: 94.44, averageRecall: 97.31, averageFpr: 9.02, averageAccuracy: 94.14 };
    let maxAvgF1 = 0;
    Object.values(configs).forEach(c => {
      const avgF1 = c.sumF1 / c.count;
      if (avgF1 > maxAvgF1) {
        maxAvgF1 = avgF1;
        bestConfig = {
          method: c.method,
          supportSize: c.supportSize,
          averageF1: +(avgF1 * 100).toFixed(2),
          averageRecall: +((c.sumRec / c.count) * 100).toFixed(2),
          averageFpr: +((c.sumFpr / c.count) * 100).toFixed(2),
          averageAccuracy: +((c.sumAcc / c.count) * 100).toFixed(2)
        };
      }
    });

    return {
      totalAttacks: attacks.length,
      totalConfigurations: records.length,
      summary: cache.fewShotSummary,
      bestConfiguration: {
        ...bestConfig,
        description: 'Optimal trade-off balancing exemplar coverage without intra-class boundary dilution'
      },
      attackHighlights
    };
  },

  // Few-Shot Live Inference / Replay Pool
  getFewShotLivePool(attack) {
    if (!cache.fewShotLivePool) {
      const serverPoolPath = path.join(__dirname, '..', 'data', 'few_shot_live_pool.json');
      const rootPoolPath = path.join(PROJECT_ROOT, 'results', 'few_shot', 'few_shot_live_pool.json');
      if (fs.existsSync(serverPoolPath)) {
        cache.fewShotLivePool = safeLoadJSON(serverPoolPath);
      } else if (fs.existsSync(rootPoolPath)) {
        cache.fewShotLivePool = safeLoadJSON(rootPoolPath);
      }
    }

    if (!cache.fewShotLivePool) {
      return { error: 'Live few-shot pool data unavailable', message: 'few_shot_live_pool.json not found' };
    }

    if (attack) {
      const targetClean = attack.toLowerCase().replace(/[-_]/g, '');
      const canonicalKey = Object.keys(cache.fewShotLivePool).find(
        k => k.toLowerCase().replace(/[-_]/g, '') === targetClean
      );
      if (!canonicalKey || !cache.fewShotLivePool[canonicalKey]) {
        return { error: 'Attack not found', message: `No live pool for attack '${attack}'` };
      }
      const pool = cache.fewShotLivePool[canonicalKey];
      return {
        attack: canonicalKey,
        target: pool.target,
        total_queries: pool.total_queries,
        target_queries: pool.target_queries,
        negative_queries: pool.negative_queries,
        thresholds: pool.thresholds
      };
    }

    return {
      attacks: Object.keys(cache.fewShotLivePool),
      count: Object.keys(cache.fewShotLivePool).length
    };
  },

  getFewShotLiveNext(attack = 'DrDoS_UDP', method = '1-NN', shots = 50, index = 1) {
    if (!cache.fewShotLivePool) {
      const serverPoolPath = path.join(__dirname, '..', 'data', 'few_shot_live_pool.json');
      const rootPoolPath = path.join(PROJECT_ROOT, 'results', 'few_shot', 'few_shot_live_pool.json');
      if (fs.existsSync(serverPoolPath)) {
        cache.fewShotLivePool = safeLoadJSON(serverPoolPath);
      } else if (fs.existsSync(rootPoolPath)) {
        cache.fewShotLivePool = safeLoadJSON(rootPoolPath);
      }
    }

    if (!cache.fewShotLivePool) {
      return { error: 'Live few-shot pool data unavailable', message: 'few_shot_live_pool.json not found' };
    }

    const targetClean = attack.toLowerCase().replace(/[-_]/g, '');
    const canonicalKey = Object.keys(cache.fewShotLivePool).find(
      k => k.toLowerCase().replace(/[-_]/g, '') === targetClean
    ) || 'DrDoS_UDP';

    const pool = cache.fewShotLivePool[canonicalKey];
    if (!pool || !pool.flows || pool.flows.length === 0) {
      return { error: 'Empty pool', message: `No query flows available for ${canonicalKey}` };
    }

    const flows = pool.flows;
    const reqIndex = Number(index) || 1;
    const flowIdx = ((reqIndex - 1) % flows.length + flows.length) % flows.length;
    const flow = flows[flowIdx];

    const normMethod = method.toLowerCase().includes('proto') ? 'Prototype' : '1-NN';
    const normShots = [10, 20, 50, 100].includes(Number(shots)) ? Number(shots) : 50;
    const evalKey = `${normMethod}_${normShots}`;
    const evaluation = (flow.evaluations && flow.evaluations[evalKey]) || {
      similarity: 0.5,
      threshold: 0.7,
      is_detected: false,
      audit: 'TN',
      confidence_pct: 75.0
    };

    const isDetected = Boolean(evaluation.is_detected);

    return {
      timestamp: new Date().toISOString(),
      attack: canonicalKey,
      method: normMethod,
      shots: normShots,
      index: flowIdx + 1,
      total_in_pool: flows.length,
      flow_id: flow.flow_id,
      ground_truth: flow.label,
      is_target: Boolean(flow.is_target),
      target_attack: canonicalKey,
      netflow: flow.netflow,
      latent_norm: flow.latent_norm,
      latent_preview: flow.latent_preview,
      similarity: evaluation.similarity,
      threshold: evaluation.threshold,
      is_detected: isDetected,
      predicted_label: isDetected ? canonicalKey : (flow.is_target ? 'BENIGN (Missed)' : flow.label),
      audit: evaluation.audit,
      confidence_pct: evaluation.confidence_pct,
      pipeline: {
        step1_flow: {
          timestamp: new Date().toISOString(),
          flow_id: flow.flow_id,
          dport: flow.netflow?.destination_port,
          duration_ms: flow.netflow?.flow_duration_ms,
          packets_s: flow.netflow?.flow_packets_s,
          bytes_s: flow.netflow?.flow_bytes_s,
          pkt_len_mean: flow.netflow?.packet_length_mean,
          ground_truth: flow.label
        },
        step2_embedding: {
          latent_dim: 64,
          l2_norm: flow.latent_norm,
          vector_head: flow.latent_preview
        },
        step3_similarity: {
          method: normMethod,
          shots: normShots,
          score: evaluation.similarity,
          threshold: evaluation.threshold,
          margin: +(evaluation.similarity - evaluation.threshold).toFixed(4)
        },
        step4_detection: {
          decision: isDetected ? `DETECTED (${canonicalKey})` : `NORMAL / BENIGN`,
          is_alert: isDetected,
          audit_code: evaluation.audit,
          confidence_pct: evaluation.confidence_pct
        }
      }
    };
  },

  // Research comparison
  getResearchData() {
    if (!cache.roundHistory || !cache.fewShotSummary) refreshData();

    return {
      modelComparisons: [
        {
          name: 'Centralized Random Forest',
          type: 'Centralized Baseline',
          accuracy: 87.11,
          f1: 86.96,
          trainingSamples: 72351,
          testSamples: 18088,
          notes: 'Upper-bound reference; requires aggregating raw network telemetry centrally.'
        },
        {
          name: 'Centralized Neural Network',
          type: 'Centralized Deep Learning',
          accuracy: 75.55,
          f1: null,
          trainingSamples: 72351,
          testSamples: 18088,
          notes: 'Standard MLP (81-128-64-13), centralized Adam optimizer, 10 epochs.'
        },
        {
          name: 'FedProx (20 Rounds)',
          type: 'Federated Defense (Best)',
          accuracy: 72.69,
          f1: 70.55,
          trainingSamples: 72351,
          testSamples: 18088,
          notes: '5 enterprise non-IID clients, 20 rounds, mu=0.1 proximal term, local epochs=1.'
        },
        {
          name: 'Vanilla FedAvg (10 Rounds)',
          type: 'Federated Baseline',
          accuracy: 57.42,
          f1: 49.69,
          trainingSamples: 72351,
          testSamples: 18088,
          notes: 'Standard McMahan et al. averaging without proximal stabilizer on non-IID data.'
        }
      ],
      convergenceHistory: cache.roundHistory || [],
      fewShotSummary: cache.fewShotSummary || [],
      fewShotMaster: cache.fewShotMaster || []
    };
  },

  // Round History
  getRoundHistory() {
    if (!cache.roundHistory) refreshData();
    return cache.roundHistory || [];
  },

  // Simulated Alerts Queue
  getAlerts() {
    return [
      {
        id: 'ALT-9041',
        timestamp: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
        enterpriseId: 'enterprise_3',
        enterpriseName: 'SIMULATED ENTERPRISE 3',
        threatType: 'DrDoS_UDP',
        category: 'Volumetric Reflection Flood',
        severity: 'HIGH',
        confidence: 0.968,
        status: 'RESOLVED',
        tier: 'Tier 2 (Zero-Day 50-Shot Cache)',
        trafficMetrics: {
          flowDuration: 1204892,
          packetRate: 14820.4,
          byteRate: 18920400,
          avgPacketSize: 1276.5
        },
        recommendedResponse: [
          'Deploy 50-shot 1-NN similarity filter at perimeter ingress',
          'Rate-limit UDP reflection amplification vectors',
          'Block spoofed UDP sources via BCP 38 filtering'
        ],
        mitigationStatus: 'RESTORED',
        isSimulated: true
      },
      {
        id: 'ALT-9040',
        timestamp: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
        enterpriseId: 'enterprise_4',
        enterpriseName: 'SIMULATED ENTERPRISE 4',
        threatType: 'DrDoS_SNMP',
        category: 'Reflection Amplification',
        severity: 'CRITICAL',
        confidence: 0.989,
        status: 'RESOLVED',
        tier: 'Tier 2 (Zero-Day 50-Shot Cache)',
        trafficMetrics: {
          flowDuration: 840210,
          packetRate: 21900.2,
          byteRate: 31200900,
          avgPacketSize: 1424.0
        },
        recommendedResponse: [
          'Filter inbound UDP port 161 reflection responses',
          'Isolate public SNMP community string reflectors',
          'Enforce edge rate-limiting rules'
        ],
        mitigationStatus: 'RESTORED',
        isSimulated: true
      },
      {
        id: 'ALT-9039',
        timestamp: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
        enterpriseId: 'enterprise_4',
        enterpriseName: 'SIMULATED ENTERPRISE 4',
        threatType: 'DrDoS_NetBIOS',
        category: 'Name Service Reflection',
        severity: 'MEDIUM',
        confidence: 0.906,
        status: 'RESOLVED',
        tier: 'Tier 2 (Zero-Day 50-Shot Cache)',
        trafficMetrics: {
          flowDuration: 2309100,
          packetRate: 8400.1,
          byteRate: 9802000,
          avgPacketSize: 1166.8
        },
        recommendedResponse: [
          'Throttle broadcast NetBIOS NS query floods',
          'Block inbound NetBIOS ports (137/138/139) at perimeter edge',
          'Update few-shot support exemplar cache'
        ],
        mitigationStatus: 'RESTORED',
        mitigatedAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
        isSimulated: true
      },
      {
        id: 'ALT-9038',
        timestamp: new Date(Date.now() - 1000 * 60 * 85).toISOString(),
        enterpriseId: 'enterprise_1',
        enterpriseName: 'SIMULATED ENTERPRISE 1',
        threatType: 'DrDoS_DNS',
        category: 'Known Vector - Recursive DNS Flood',
        severity: 'HIGH',
        confidence: 0.892,
        status: 'RESOLVED',
        tier: 'Tier 1 (Global 12-Class Head)',
        trafficMetrics: {
          flowDuration: 450120,
          packetRate: 19400.8,
          byteRate: 28400100,
          avgPacketSize: 1464.0
        },
        recommendedResponse: [
          'Apply Response Rate Limiting (RRL) on resolvers',
          'Drop non-whitelisted ANY and large TXT query floods',
          'Enforce source-IP validation on upstream transit links'
        ],
        mitigationStatus: 'RESTORED',
        mitigatedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
        isSimulated: true
      },
      {
        id: 'ALT-9037',
        timestamp: new Date(Date.now() - 1000 * 60 * 140).toISOString(),
        enterpriseId: 'enterprise_3',
        enterpriseName: 'SIMULATED ENTERPRISE 3',
        threatType: 'Syn',
        category: 'Known Vector - TCP SYN Flood',
        severity: 'CRITICAL',
        confidence: 0.941,
        status: 'RESOLVED',
        tier: 'Tier 1 (Global 12-Class Head)',
        trafficMetrics: {
          flowDuration: 994000,
          packetRate: 38200.5,
          byteRate: 24500000,
          avgPacketSize: 64.0
        },
        recommendedResponse: [
          'Enable TCP SYN Cookies',
          'Enforce half-open connection limits',
          'Block spoofed source ranges'
        ],
        mitigationStatus: 'RESTORED',
        mitigatedAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
        isSimulated: true
      }
    ];
  },

  // Demonstration detection samples
  getDetectionDemo() {
    return {
      mode: 'DEMONSTRATION MODE',
      disclaimer: 'Sample packet telemetry extracted from research evaluation test sets for demonstration of dual-tier detection.',
      samples: [
        {
          id: 'SAMPLE-001',
          name: 'Zero-Day UDP Reflection Packet (DrDoS_UDP)',
          targetLabel: 'DrDoS_UDP',
          isZeroDay: true,
          predictedAttack: 'DrDoS_UDP',
          confidence: 0.968,
          severity: 'HIGH',
          threatStatus: 'ZERO-DAY THREAT DETECTED',
          detectionTier: 'Tier 2 (50-Shot 1-NN Exemplar Cache)',
          features: {
            'Flow Duration': '1,204,892 μs',
            'Total Fwd Packets': '2,490',
            'Total Backward Packets': '0',
            'Flow Bytes/s': '18,920,400 B/s',
            'Flow Packets/s': '14,820.4 pkts/s',
            'Fwd Packet Length Mean': '1,276.5 B',
            'Fwd IAT Mean': '482.9 μs',
            'Destination Port': '123 (NTP) / UDP',
            'Protocol': '17 (UDP)'
          },
          penultimateVectorNorm: 4.82,
          closestSupportCosineSimilarity: 0.9987,
          decisionThreshold: 0.9986,
          mitigationRecommendation: 'Zero-day UDP reflection signature detected via 1-NN exemplar match. Route traffic to scrubbing filter.'
        },
        {
          id: 'SAMPLE-002',
          name: 'Zero-Day SNMP Amplification Burst (DrDoS_SNMP)',
          targetLabel: 'DrDoS_SNMP',
          isZeroDay: true,
          predictedAttack: 'DrDoS_SNMP',
          confidence: 0.989,
          severity: 'CRITICAL',
          threatStatus: 'ZERO-DAY THREAT DETECTED',
          detectionTier: 'Tier 2 (50-Shot 1-NN Exemplar Cache)',
          features: {
            'Flow Duration': '840,210 μs',
            'Total Fwd Packets': '4,102',
            'Total Backward Packets': '1',
            'Flow Bytes/s': '31,200,900 B/s',
            'Flow Packets/s': '21,900.2 pkts/s',
            'Fwd Packet Length Mean': '1,424.0 B',
            'Fwd IAT Mean': '204.8 μs',
            'Destination Port': '161 (SNMP) / UDP',
            'Protocol': '17 (UDP)'
          },
          penultimateVectorNorm: 5.14,
          closestSupportCosineSimilarity: 0.9998,
          decisionThreshold: 0.9995,
          mitigationRecommendation: 'High-volume SNMP amplification confirmed with 0.00% False Positive Rate profile. Immediate drop recommended.'
        },
        {
          id: 'SAMPLE-003',
          name: 'Zero-Day NetBIOS Name Query Flood (DrDoS_NetBIOS)',
          targetLabel: 'DrDoS_NetBIOS',
          isZeroDay: true,
          predictedAttack: 'DrDoS_NetBIOS',
          confidence: 0.906,
          severity: 'HIGH',
          threatStatus: 'ZERO-DAY THREAT DETECTED',
          detectionTier: 'Tier 2 (50-Shot 1-NN Exemplar Cache)',
          features: {
            'Flow Duration': '2,309,100 μs',
            'Total Fwd Packets': '1,894',
            'Total Backward Packets': '0',
            'Flow Bytes/s': '9,802,000 B/s',
            'Flow Packets/s': '8,400.1 pkts/s',
            'Fwd Packet Length Mean': '1,166.8 B',
            'Fwd IAT Mean': '1,219.1 μs',
            'Destination Port': '137 (NetBIOS-NS) / UDP',
            'Protocol': '17 (UDP)'
          },
          penultimateVectorNorm: 4.41,
          closestSupportCosineSimilarity: 0.9811,
          decisionThreshold: 0.9811,
          mitigationRecommendation: 'NetBIOS flood matched to 50-shot support cluster. Isolate vulnerable legacy endpoints.'
        },
        {
          id: 'SAMPLE-004',
          name: 'Standard Benign HTTPS Web Traffic (BENIGN)',
          targetLabel: 'BENIGN',
          isZeroDay: false,
          predictedAttack: 'BENIGN',
          confidence: 0.974,
          severity: 'INFO',
          threatStatus: 'NORMAL TRAFFIC',
          detectionTier: 'Tier 1 (Global 12-Class FedProx Head)',
          features: {
            'Flow Duration': '45,820,100 μs',
            'Total Fwd Packets': '84',
            'Total Backward Packets': '92',
            'Flow Bytes/s': '24,500 B/s',
            'Flow Packets/s': '3.8 pkts/s',
            'Fwd Packet Length Mean': '412.3 B',
            'Fwd IAT Mean': '545,477 μs',
            'Destination Port': '443 (HTTPS) / TCP',
            'Protocol': '6 (TCP)'
          },
          penultimateVectorNorm: 2.11,
          closestSupportCosineSimilarity: 0.421,
          decisionThreshold: 0.9800,
          mitigationRecommendation: 'Benign bidirectional application flow. Allowed without intervention.'
        }
      ]
    };
  }
};

