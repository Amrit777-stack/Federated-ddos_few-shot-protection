const API_BASE = '/api';

export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error('Health check failed');
  return res.json();
}

export async function fetchOverview() {
  const res = await fetch(`${API_BASE}/overview`);
  if (!res.ok) throw new Error('Failed to fetch overview data');
  return res.json();
}

// Enterprise Online / Offline State Management
export function getOfflineEnterprises() {
  try {
    const raw = localStorage.getItem('sentinel_offline_enterprises');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function setEnterpriseStatus(enterpriseId, status) {
  const norm = normalizeEnterpriseId(enterpriseId);
  const isOffline = String(status).toUpperCase() === 'OFFLINE';
  let currentOffline = getOfflineEnterprises();

  if (isOffline) {
    if (!currentOffline.includes(norm)) currentOffline.push(norm);
  } else {
    currentOffline = currentOffline.filter(id => id !== norm);
  }

  try {
    localStorage.setItem('sentinel_offline_enterprises', JSON.stringify(currentOffline));
  } catch {
    // ignore
  }

  // Sync with server if online
  try {
    await fetch(`${API_BASE}/enterprises/${enterpriseId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: isOffline ? 'OFFLINE' : 'ONLINE' })
    });
  } catch {
    // offline fallback
  }

  return { enterpriseId: norm, status: isOffline ? 'OFFLINE' : 'ONLINE', isOffline, offlineEnterprises: currentOffline };
}

export async function toggleEnterpriseStatus(enterpriseId) {
  const norm = normalizeEnterpriseId(enterpriseId);
  const offlineList = getOfflineEnterprises();
  const isCurrentlyOffline = offlineList.includes(norm);
  return setEnterpriseStatus(enterpriseId, isCurrentlyOffline ? 'ONLINE' : 'OFFLINE');
}

export async function fetchEnterprises() {
  let list = [];
  try {
    const res = await fetch(`${API_BASE}/enterprises`);
    if (res.ok) {
      const data = await res.json();
      list = data.enterprises || [];
    }
  } catch (err) {
    console.warn('[API] Failed to fetch remote enterprises:', err.message);
  }

  // Merge client-side offline overrides
  const offlineList = getOfflineEnterprises();
  const enriched = list.map(ent => {
    const norm = normalizeEnterpriseId(ent.id);
    const isOffline = offlineList.includes(norm) || ent.status === 'OFFLINE';
    return {
      ...ent,
      status: isOffline ? 'OFFLINE' : (ent.status === 'OFFLINE' ? 'ONLINE' : ent.status),
      isOffline
    };
  });

  return { enterprises: enriched, count: enriched.length, offlineEnterprises: offlineList };
}

export async function fetchResearch() {
  const res = await fetch(`${API_BASE}/research`);
  if (!res.ok) throw new Error('Failed to fetch research data');
  return res.json();
}

export async function fetchFewShot(params = {}) {
  const query = new URLSearchParams();
  if (params.attack) query.append('attack', params.attack);
  if (params.shots) query.append('shots', params.shots);
  if (params.method) query.append('method', params.method);

  const qs = query.toString() ? `?${query.toString()}` : '';
  const res = await fetch(`${API_BASE}/few-shot${qs}`);
  if (!res.ok) throw new Error('Failed to fetch few-shot records');
  return res.json();
}

export async function fetchFewShotByAttack(attack) {
  const res = await fetch(`${API_BASE}/few-shot/${attack}`);
  if (!res.ok) throw new Error(`Failed to fetch few-shot records for ${attack}`);
  return res.json();
}

export async function fetchFewShotSummary() {
  const res = await fetch(`${API_BASE}/few-shot/summary`);
  if (!res.ok) throw new Error('Failed to fetch few-shot summary');
  return res.json();
}

// In-browser cache for client-side fallback pool
let clientPoolCache = null;

async function getClientPoolData() {
  if (clientPoolCache) return clientPoolCache;
  try {
    const res = await fetch('/data/few_shot_live_pool.json');
    if (res.ok) {
      clientPoolCache = await res.json();
      console.log('[FewShot Live Pool] Local dataset pool loaded successfully into browser memory.');
      return clientPoolCache;
    }
  } catch (e) {
    console.warn('[FewShot Live Pool] Could not load local static pool:', e.message);
  }
  return null;
}

function computeClientFlow(poolData, attack = 'DrDoS_UDP', method = '1-NN', shots = 50, index = 1) {
  if (!poolData) return null;
  const targetClean = (attack || 'DrDoS_UDP').toLowerCase().replace(/[-_]/g, '');
  const canonicalKey = Object.keys(poolData).find(
    k => k.toLowerCase().replace(/[-_]/g, '') === targetClean
  ) || 'DrDoS_UDP';

  const pool = poolData[canonicalKey];
  if (!pool || !pool.flows || pool.flows.length === 0) return null;

  const flows = pool.flows;
  const reqIndex = Number(index) || 1;
  const flowIdx = ((reqIndex - 1) % flows.length + flows.length) % flows.length;
  const flow = flows[flowIdx];

  const normMethod = (method || '1-NN').toLowerCase().includes('proto') ? 'Prototype' : '1-NN';
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
}

export async function fetchFewShotLivePool(attack) {
  try {
    const qs = attack ? `?attack=${encodeURIComponent(attack)}` : '';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${API_BASE}/few-shot/live/pool${qs}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    // Network or server unavailable; fallback to client pool
  }

  const poolData = await getClientPoolData();
  if (poolData && attack) {
    const targetClean = attack.toLowerCase().replace(/[-_]/g, '');
    const canonicalKey = Object.keys(poolData).find(
      k => k.toLowerCase().replace(/[-_]/g, '') === targetClean
    );
    if (canonicalKey && poolData[canonicalKey]) {
      const p = poolData[canonicalKey];
      return {
        attack: canonicalKey,
        target: p.target,
        total_queries: p.total_queries,
        target_queries: p.target_queries,
        negative_queries: p.negative_queries,
        thresholds: p.thresholds
      };
    }
  }
  return { total_queries: 120 };
}

export async function fetchFewShotLiveNext(params = {}) {
  try {
    const query = new URLSearchParams();
    if (params.attack) query.append('attack', params.attack);
    if (params.method) query.append('method', params.method);
    if (params.shots) query.append('shots', params.shots);
    if (params.index !== undefined) query.append('index', params.index);

    const qs = query.toString() ? `?${query.toString()}` : '';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${API_BASE}/few-shot/live/next${qs}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    // Remote endpoint unavailable; fallback immediately to local verified pool
  }

  const poolData = await getClientPoolData();
  const fallbackResult = computeClientFlow(poolData, params.attack, params.method, params.shots, params.index);
  if (fallbackResult) {
    return fallbackResult;
  }

  throw new Error('Failed to retrieve few-shot live query flow');
}

export async function fetchRoundHistory() {
  const res = await fetch(`${API_BASE}/round-history`);
  if (!res.ok) throw new Error('Failed to fetch round history');
  return res.json();
}

export function isAlertMitigated(alert) {
  if (!alert) return false;
  const status = String(alert.status || '').toUpperCase();
  const mitStatus = String(alert.mitigationStatus || '').toUpperCase();
  return status.includes('MITIGAT') || 
         status.includes('RESOLV') || 
         mitStatus.includes('MITIGAT') || 
         mitStatus.includes('RESOLV');
}

export function normalizeEnterpriseId(idOrName) {
  if (!idOrName) return 'E1';
  const str = String(idOrName).toUpperCase().trim();
  const match = str.match(/\bE(?:NTERPRISE)?[-_\s]?([1-5])\b/i) || str.match(/([1-5])/);
  if (match) {
    return `E${match[1]}`;
  }
  return 'E1';
}

export async function fetchAlerts() {
  let serverAlerts = [];
  try {
    const res = await fetch(`${API_BASE}/alerts`);
    if (res.ok) {
      const data = await res.json();
      serverAlerts = data.alerts || [];
    }
  } catch (e) {
    console.warn('[API] Could not fetch remote alerts, using fallback.');
  }

  // Merge client-side localStorage overrides so simulated mitigations persist across page reloads and tab navigation
  try {
    const savedOverrides = JSON.parse(localStorage.getItem('sentinel_alert_overrides') || '{}');
    if (Object.keys(savedOverrides).length > 0) {
      serverAlerts = serverAlerts.map(a => {
        if (savedOverrides[a.id]) {
          return { ...a, ...savedOverrides[a.id] };
        }
        return a;
      });
    }
  } catch (err) {
    // Ignore localStorage parse errors
  }

  return { alerts: serverAlerts, count: serverAlerts.length };
}

export async function mitigateAlert(alertId) {
  const timestamp = new Date().toISOString();
  const override = {
    status: 'MITIGATED · SIMULATION',
    mitigationStatus: 'MITIGATION_SIMULATED',
    mitigatedAt: timestamp,
    mitigationActionTaken: 'Simulated mitigation executed. No real network configuration changed.'
  };

  // Persist locally
  try {
    const saved = JSON.parse(localStorage.getItem('sentinel_alert_overrides') || '{}');
    saved[alertId] = override;
    localStorage.setItem('sentinel_alert_overrides', JSON.stringify(saved));
  } catch (err) {
    // Ignore localStorage errors
  }

  // Call server to persist in-memory override
  try {
    const res = await fetch(`${API_BASE}/alerts/${alertId}/mitigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (res.ok) {
      return res.json();
    }
  } catch (err) {
    // Backend offline / restarted; local override already saved
  }

  return {
    success: true,
    alertId,
    updatedStatus: 'MITIGATED · SIMULATION',
    alert: { id: alertId, ...override }
  };
}

export async function mitigateEnterpriseAlerts(enterpriseId) {
  const norm = normalizeEnterpriseId(enterpriseId);
  const digit = norm.replace(/\D/g, '') || '1';
  const timestamp = new Date().toISOString();

  // Persist locally for all matching alerts in localStorage
  try {
    const alertsRes = await fetchAlerts();
    const saved = JSON.parse(localStorage.getItem('sentinel_alert_overrides') || '{}');
    (alertsRes.alerts || []).forEach(a => {
      const match = normalizeEnterpriseId(a.enterpriseId || a.enterpriseName);
      if (match === norm) {
        saved[a.id] = {
          status: 'MITIGATED · SIMULATION',
          mitigationStatus: 'MITIGATION_SIMULATED',
          mitigatedAt: timestamp,
          mitigationActionTaken: `Simulated mitigation executed for Enterprise ${digit}. No real network configuration changed.`
        };
      }
    });
    localStorage.setItem('sentinel_alert_overrides', JSON.stringify(saved));
  } catch (err) {
    // Ignore
  }

  // Call server batch endpoint
  try {
    const res = await fetch(`${API_BASE}/alerts/mitigate-enterprise/${norm}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (res.ok) {
      return res.json();
    }
  } catch (err) {
    // Ignore
  }

  return { success: true, enterpriseId: norm };
}

export async function resetAlertSimulation(alertId) {
  if (!alertId) return;
  try {
    const saved = JSON.parse(localStorage.getItem('sentinel_alert_overrides') || '{}');
    delete saved[alertId];
    localStorage.setItem('sentinel_alert_overrides', JSON.stringify(saved));
  } catch (err) {
    // Ignore localStorage errors
  }

  try {
    await fetch(`${API_BASE}/alerts/${alertId}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    // Ignore server errors
  }
}

export async function fetchDetectionDemo() {
  const res = await fetch(`${API_BASE}/detection/demo`);
  if (!res.ok) throw new Error('Failed to fetch detection demo samples');
  return res.json();
}

// Live ML Inference & Simulation APIs
export async function fetchLiveStatus() {
  const res = await fetch(`${API_BASE}/live/status`);
  if (!res.ok) throw new Error('Failed to fetch live ML status');
  return res.json();
}

export async function predictLive(features) {
  const res = await fetch(`${API_BASE}/live/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ features })
  });
  if (!res.ok) throw new Error('Live prediction failed');
  return res.json();
}

export async function fetchLiveEvents(limit = 20) {
  const res = await fetch(`${API_BASE}/live/events?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch live events');
  const data = await res.json();

  // If any enterprise is marked OFFLINE, guarantee that attacks do NOT come for that enterprise
  const offlineList = getOfflineEnterprises();
  if (offlineList.length > 0 && Array.isArray(data.events)) {
    data.events = data.events.filter(e => {
      const norm = normalizeEnterpriseId(e.enterprise_id || e.enterprise_name);
      if (offlineList.includes(norm) && e.prediction !== 'BENIGN') {
        return false; // Suppress attack flow for offline enterprise!
      }
      return true;
    });
    data.count = data.events.length;
  }

  return data;
}

export async function startLiveSimulation() {
  const res = await fetch(`${API_BASE}/live/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error('Failed to start live simulation');
  return res.json();
}

export async function stopLiveSimulation() {
  const res = await fetch(`${API_BASE}/live/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error('Failed to stop live simulation');
  return res.json();
}

export async function fetchLivePoolInfo() {
  const res = await fetch(`${API_BASE}/live/pool-info`);
  if (!res.ok) throw new Error('Failed to fetch live pool information');
  return res.json();
}

export async function fetchLiveMetrics() {
  const res = await fetch(`${API_BASE}/live/metrics`);
  if (!res.ok) throw new Error('Failed to fetch live session metrics');
  return res.json();
}

export async function resetLiveMetrics() {
  const res = await fetch(`${API_BASE}/live/reset-metrics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error('Failed to reset live metrics');
  return res.json();
}

export async function clearLiveHistory() {
  const res = await fetch(`${API_BASE}/live/clear`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error('Failed to clear live simulation history');
  return res.json();
}

