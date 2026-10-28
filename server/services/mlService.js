const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000';

const ALL_CLASSES = [
  "BENIGN",
  "DrDoS_DNS",
  "DrDoS_LDAP",
  "DrDoS_MSSQL",
  "DrDoS_NTP",
  "DrDoS_NetBIOS",
  "DrDoS_SNMP",
  "DrDoS_SSDP",
  "DrDoS_UDP",
  "Syn",
  "TFTP",
  "UDP-lag",
  "WebDDoS"
];

class MLServiceManager {
  constructor() {
    this.serviceUrl = ML_SERVICE_URL;
    this.isSimulating = false;
    this.simulationTimer = null;
    this.simulationIntervalMs = 2000; // 2 seconds per simulated flow
    
    // In-memory telemetry buffer (last 50 events)
    this.recentEvents = [];
    this.maxEvents = 50;

    // Running aggregate metrics for the live session
    this.sessionMetrics = this._createFreshMetrics();

    // Reference to external alert callback (optional)
    this.onAlertGenerated = null;

    // Offline enterprises set (e.g. Set {'E3'})
    this.offlineEnterprises = new Set();
  }

  setEnterpriseStatus(id, status) {
    const raw = String(id || '').toUpperCase();
    const match = raw.match(/([1-5])/);
    const entId = match ? `E${match[1]}` : 'E1';
    const isOffline = raw.includes('OFF') || String(status || '').toUpperCase() === 'OFFLINE';
    
    if (isOffline) {
      this.offlineEnterprises.add(entId);
    } else {
      this.offlineEnterprises.delete(entId);
    }

    console.log(`[MLService] Enterprise ${entId} status set to ${isOffline ? 'OFFLINE' : 'ONLINE'}. Offline set:`, Array.from(this.offlineEnterprises));

    // Forward status to Python simulation service if available
    fetch(`${this.serviceUrl}/enterprises/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enterprise_id: entId, status: isOffline ? 'OFFLINE' : 'ONLINE' })
    }).catch(() => {});

    return { enterpriseId: entId, status: isOffline ? 'OFFLINE' : 'ONLINE', isOffline };
  }

  getOfflineEnterprises() {
    return Array.from(this.offlineEnterprises);
  }

  _createFreshMetrics() {
    const confusion = {};
    const predictionsByClass = {};
    const groundTruthByClass = {};

    for (const c1 of ALL_CLASSES) {
      confusion[c1] = {};
      predictionsByClass[c1] = 0;
      groundTruthByClass[c1] = 0;
      for (const c2 of ALL_CLASSES) {
        confusion[c1][c2] = 0;
      }
    }

    return {
      sessionStartTime: new Date().toISOString(),
      flowsProcessed: 0,
      correctPredictions: 0,
      incorrectPredictions: 0,
      liveAccuracy: 0.0,
      macroPrecision: 0.0,
      macroRecall: 0.0,
      macroF1: 0.0,
      weightedF1: 0.0,
      attacksDetected: 0,
      benignFlows: 0,
      criticalAlerts: 0,
      sumConfidence: 0.0,
      averageConfidence: 0.0,
      highConfidenceCount: 0, // >= 80%
      lowConfidenceCount: 0,  // < 50%
      enterpriseCounts: { E1: 0, E2: 0, E3: 0, E4: 0, E5: 0 },
      enterpriseAttacks: { E1: 0, E2: 0, E3: 0, E4: 0, E5: 0 },
      predictionsByClass,
      groundTruthByClass,
      confusionMatrix: confusion
    };
  }

  /**
   * Health check to Python FastAPI inference service
   */
  async checkStatus() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);

      const res = await fetch(`${this.serviceUrl}/health`, { signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        return {
          status: 'online',
          service: data.service || 'sentinel-fl-ml-service',
          model: data.model || 'FedProx-G20',
          inputFeatures: data.input_features || 81,
          classes: data.classes || 13,
          isSimulating: this.isSimulating,
          trafficSource: data.traffic_source || 'EXACT_HELD_OUT_TEST_POOL_18088',
          url: this.serviceUrl
        };
      }
    } catch (err) {
      // Python service unreachable
    }

    return {
      status: 'offline',
      service: 'sentinel-fl-ml-service',
      model: 'FedProx-G20',
      isSimulating: false,
      url: this.serviceUrl,
      message: 'Python ML service is offline. Start via: .\\venv\\Scripts\\python.exe ml_service/app.py'
    };
  }

  /**
   * Fetch held-out test pool statistics from Python service
   */
  async fetchPoolInfo() {
    try {
      const res = await fetch(`${this.serviceUrl}/pool-info`);
      if (res.ok) {
        const poolData = await res.json();
        return {
          ...poolData,
          sessionFlowsProcessed: this.sessionMetrics.flowsProcessed,
          isSimulating: this.isSimulating
        };
      }
    } catch (err) {
      // Fallback
    }

    return {
      total_rows: 18088,
      remaining_rows_in_cycle: 18088,
      rows_processed_this_cycle: 0,
      cycle_count: 1,
      total_flows_served: 0,
      source: 'Exact Held-Out Test Set (Centralized 20% Stratified Split)',
      train_rows_included: 0,
      feature_count: 81,
      class_count: 13,
      sampling: 'WITHOUT REPLACEMENT per cycle',
      model: 'FedProx G20',
      scaler: 'train-fitted StandardScaler'
    };
  }

  /**
   * Forward feature vector to PyTorch model for inference
   */
  async predict(features) {
    const res = await fetch(`${this.serviceUrl}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ features })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || `Inference error: HTTP ${res.status}`);
    }

    return res.json();
  }

  /**
   * Fetch one simulated flow and real model prediction from Python service.
   * If an enterprise is marked OFFLINE, attack flows targeting it are suppressed/skipped
   * so attacks will NEVER come for that enterprise.
   */
  async fetchNextSimulatedFlow() {
    let attempts = 0;
    while (attempts < 20) {
      attempts++;
      const res = await fetch(`${this.serviceUrl}/simulate/next`);
      if (!res.ok) {
        throw new Error(`Simulation fetch error: HTTP ${res.status}`);
      }
      const event = await res.json();
      const ent = event.enterprise_id || 'E1';

      // If enterprise is offline and flow is an attack, skip this flow so attacks do not come for it
      if (this.offlineEnterprises.has(ent) && event.prediction !== 'BENIGN') {
        continue;
      }

      this._recordEvent(event);
      return event;
    }
  }

  /**
   * Internal recording of live event and running session statistics
   */
  _recordEvent(event) {
    const ent = event.enterprise_id || 'E1';
    const isEnterpriseOffline = this.offlineEnterprises.has(ent);

    // If an attack somehow reached an offline enterprise, suppress it completely
    if (isEnterpriseOffline && event.prediction !== 'BENIGN') {
      event.status = 'SUPPRESSED (ENTERPRISE OFFLINE)';
      event.severity = 'LOW';
      return;
    }

    this.recentEvents.unshift(event);
    if (this.recentEvents.length > this.maxEvents) {
      this.recentEvents.pop();
    }

    const sm = this.sessionMetrics;
    sm.flowsProcessed += 1;
    sm.sumConfidence += event.confidence;
    sm.averageConfidence = +(sm.sumConfidence / sm.flowsProcessed * 100).toFixed(2);

    if (event.confidence >= 0.80) sm.highConfidenceCount += 1;
    if (event.confidence < 0.50) sm.lowConfidenceCount += 1;

    sm.enterpriseCounts[ent] = (sm.enterpriseCounts[ent] || 0) + 1;

    // Ground truth & correctness
    const gt = event.ground_truth_label || event.ground_truth_evaluation_only;
    const pred = event.prediction;

    if (event.correct) {
      sm.correctPredictions += 1;
    } else {
      sm.incorrectPredictions += 1;
    }
    sm.liveAccuracy = +((sm.correctPredictions / sm.flowsProcessed) * 100).toFixed(2);

    // Track per-class distributions and confusion matrix
    if (gt && sm.confusionMatrix[gt]) {
      sm.groundTruthByClass[gt] = (sm.groundTruthByClass[gt] || 0) + 1;
      sm.predictionsByClass[pred] = (sm.predictionsByClass[pred] || 0) + 1;
      if (sm.confusionMatrix[gt][pred] !== undefined) {
        sm.confusionMatrix[gt][pred] += 1;
      }
    }

    // Compute Macro and Weighted F1 over observed data
    this._recalculateF1Metrics();

    if (pred === 'BENIGN') {
      sm.benignFlows += 1;
    } else {
      // Attacks ONLY recorded and alerted if enterprise is NOT offline
      if (!isEnterpriseOffline) {
        sm.attacksDetected += 1;
        sm.enterpriseAttacks[ent] = (sm.enterpriseAttacks[ent] || 0) + 1;

        if (event.severity === 'CRITICAL') {
          sm.criticalAlerts += 1;
        }

        // Trigger alert callback if registered
        if (this.onAlertGenerated) {
          this.onAlertGenerated(event);
        }
      }
    }
  }

  /**
   * Recalculates live macro precision, recall, macro F1, and weighted F1
   */
  _recalculateF1Metrics() {
    const sm = this.sessionMetrics;
    const conf = sm.confusionMatrix;
    let totalSupport = 0;
    let sumPrecision = 0;
    let sumRecall = 0;
    let sumMacroF1 = 0;
    let sumWeightedF1 = 0;
    let activeClasses = 0;

    for (const c of ALL_CLASSES) {
      const tp = conf[c][c] || 0;
      let fp = 0;
      let fn = 0;

      for (const other of ALL_CLASSES) {
        if (other !== c) {
          fp += conf[other][c] || 0;
          fn += conf[c][other] || 0;
        }
      }

      const support = tp + fn;
      if (support > 0 || (tp + fp) > 0) {
        activeClasses += 1;
        const prec = (tp + fp) > 0 ? tp / (tp + fp) : 0;
        const rec = (tp + fn) > 0 ? tp / (tp + fn) : 0;
        const f1 = (prec + rec) > 0 ? (2 * prec * rec) / (prec + rec) : 0;

        sumPrecision += prec;
        sumRecall += rec;
        sumMacroF1 += f1;

        if (support > 0) {
          totalSupport += support;
          sumWeightedF1 += f1 * support;
        }
      }
    }

    if (activeClasses > 0) {
      sm.macroPrecision = +((sumPrecision / activeClasses) * 100).toFixed(2);
      sm.macroRecall = +((sumRecall / activeClasses) * 100).toFixed(2);
      sm.macroF1 = +((sumMacroF1 / activeClasses) * 100).toFixed(2);
    }
    if (totalSupport > 0) {
      sm.weightedF1 = +((sumWeightedF1 / totalSupport) * 100).toFixed(2);
    }
  }

  /**
   * Start live simulation timer
   */
  startSimulation() {
    if (this.isSimulating) {
      return { status: 'already_running', isSimulating: true };
    }

    this.isSimulating = true;
    console.log('[MLService] Live traffic simulation STARTED from held-out test pool.');

    // Run first step immediately
    this.fetchNextSimulatedFlow().catch(err => {
      console.warn('[MLService] Simulation initial step failed:', err.message);
    });

    // Schedule periodic replay
    this.simulationTimer = setInterval(async () => {
      try {
        await this.fetchNextSimulatedFlow();
      } catch (err) {
        console.warn('[MLService] Periodic simulation flow error:', err.message);
      }
    }, this.simulationIntervalMs);

    return { status: 'started', isSimulating: true, intervalMs: this.simulationIntervalMs };
  }

  /**
   * Stop live simulation timer
   */
  stopSimulation() {
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer);
      this.simulationTimer = null;
    }
    this.isSimulating = false;
    console.log('[MLService] Live traffic simulation STOPPED.');
    return { status: 'stopped', isSimulating: false };
  }

  /**
   * Clear live event buffer and reset session metrics
   */
  async clearHistory() {
    // 1. If currently simulating, stop the timer so new events don't immediately arrive
    if (this.isSimulating) {
      this.stopSimulation();
    }

    // 2. Clear in-memory event buffer
    this.recentEvents = [];

    // 3. Reset running metrics
    this.sessionMetrics = this._createFreshMetrics();

    // 4. Reset alerts in the alert queue if registered
    if (this.onHistoryCleared) {
      try {
        this.onHistoryCleared();
      } catch (e) {
        console.warn('[MLService] onHistoryCleared error:', e.message);
      }
    }

    // 5. Notify Python simulator to reset flow counters & cycles
    try {
      await fetch(`${this.serviceUrl}/reset`, { method: 'POST' }).catch(() => {});
    } catch (e) {
      // ignore if offline
    }

    console.log('[MLService] Live simulation event history, metrics, and counters CLEARED.');
    return {
      status: 'cleared',
      count: 0,
      recentEvents: [],
      sessionMetrics: this.sessionMetrics
    };
  }

  /**
   * Reset session metrics
   */
  resetSessionMetrics() {
    this.sessionMetrics = this._createFreshMetrics();
    return { status: 'reset', sessionMetrics: this.sessionMetrics };
  }

  getEvents(limit = 20) {
    return {
      count: this.recentEvents.length,
      limit,
      isSimulating: this.isSimulating,
      stats: this.sessionMetrics,
      events: this.recentEvents.slice(0, limit)
    };
  }

  getMetrics() {
    return {
      sessionStartTime: this.sessionMetrics.sessionStartTime,
      flowsProcessed: this.sessionMetrics.flowsProcessed,
      correctPredictions: this.sessionMetrics.correctPredictions,
      incorrectPredictions: this.sessionMetrics.incorrectPredictions,
      liveAccuracy: this.sessionMetrics.liveAccuracy,
      macroPrecision: this.sessionMetrics.macroPrecision,
      macroRecall: this.sessionMetrics.macroRecall,
      macroF1: this.sessionMetrics.macroF1,
      weightedF1: this.sessionMetrics.weightedF1,
      averageConfidence: this.sessionMetrics.averageConfidence,
      highConfidenceCount: this.sessionMetrics.highConfidenceCount,
      lowConfidenceCount: this.sessionMetrics.lowConfidenceCount,
      confusionMatrix: this.sessionMetrics.confusionMatrix,
      predictionsByClass: this.sessionMetrics.predictionsByClass,
      groundTruthByClass: this.sessionMetrics.groundTruthByClass,
      officialTestBaseline: {
        dataset: "18,088 Centralized Held-Out Test Set",
        model: "FedProx-G20 (run_010_20_rounds)",
        accuracy: 72.69,
        weightedF1: 70.55
      }
    };
  }
}

// Singleton export
const mlService = new MLServiceManager();
module.exports = mlService;
