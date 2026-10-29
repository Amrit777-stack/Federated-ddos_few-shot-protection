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

export function normalizeEnterpriseId(enterpriseId) {
  if (enterpriseId === null || enterpriseId === undefined) return '';
  const str = String(enterpriseId).trim();
  const match = str.match(/([1-5])/);
  return match ? match[1] : str.replace(/\D/g, '');
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

/**
 * Checks whether an incident has been resolved / unblocked
 */
export function isAlertResolved(alert) {
  if (!alert) return false;
  const status = String(alert.status || '').toUpperCase();
  const mitStatus = String(alert.mitigationStatus || '').toUpperCase();
  return status.includes('RESOLV') || mitStatus.includes('RESTORE') || mitStatus.includes('RESOLV');
}

/**
 * Checks whether an incident is currently in simulated mitigated state (and not yet resolved)
 */
export function isAlertMitigated(alert) {
  if (!alert) return false;
  if (isAlertResolved(alert)) return false;
  const status = String(alert.status || '').toUpperCase();
  const mitStatus = String(alert.mitigationStatus || '').toUpperCase();
  return status.includes('MITIGAT') || mitStatus.includes('SIMULAT');
}

/**
 * Checks whether an incident is active and requiring action (unmitigated & unresolved)
 */
export function isAlertActive(alert) {
  if (!alert) return false;
  return !isAlertMitigated(alert) && !isAlertResolved(alert);
}

/**
 * Computes the independent operational IDS security state for an enterprise client.
 * Rules:
 * 1. If enterprise is marked OFFLINE -> 'OFFLINE'
 * 2. If enterprise has >= 1 active ACTION_REQUIRED incident -> 'UNDER ATTACK' (🔴)
 * 3. Else if enterprise has >= 1 MITIGATED incident -> 'MITIGATED' (🟠)
 * 4. Else (all incidents are RESOLVED or none exist) -> 'ONLINE' (🟢)
 */
export function getEnterpriseSecurityState(normId, allAlerts = [], isOffline = false) {
  if (isOffline) {
    return {
      status: 'OFFLINE',
      health: 'OFFLINE',
      riskScore: 0,
      activeThreat: null,
      activeAlertsCount: 0,
      activeAlerts: [],
      mitigatedAlertsCount: 0,
      mitigatedAlerts: [],
      resolvedAlertsCount: 0,
      resolvedAlerts: []
    };
  }

  const targetDigit = normalizeEnterpriseId(normId);

  const entAlerts = (allAlerts || []).filter(a => {
    if (!a) return false;
    const alertDigit = normalizeEnterpriseId(a.enterpriseId || a.enterpriseName);
    return alertDigit === targetDigit;
  });

  // Sort chronologically newest first
  entAlerts.sort((a, b) => {
    const timeA = new Date(a.timestamp || 0).getTime();
    const timeB = new Date(b.timestamp || 0).getTime();
    if (timeA !== timeB) return timeB - timeA;
    return String(b.id || '').localeCompare(String(a.id || ''));
  });

  const activeAlerts = entAlerts.filter(isAlertActive);
  const mitigatedAlerts = entAlerts.filter(isAlertMitigated);
  const resolvedAlerts = entAlerts.filter(isAlertResolved);

  let status = 'ONLINE';
  let health = 'HEALTHY';
  let riskScore = 14;
  let activeThreat = null;
  let currentAlert = null;

  if (activeAlerts.length > 0) {
    status = 'UNDER ATTACK';
    health = 'CRITICAL';
    currentAlert = activeAlerts[0];
    activeThreat = activeAlerts[0].threatType;
    riskScore = activeAlerts[0].severity === 'CRITICAL' ? 92 : 78;
  } else if (mitigatedAlerts.length > 0) {
    status = 'MITIGATED';
    health = 'ELEVATED';
    currentAlert = mitigatedAlerts[0];
    activeThreat = mitigatedAlerts[0].threatType;
    riskScore = 32;
  } else {
    status = 'ONLINE';
    health = 'HEALTHY';
    currentAlert = resolvedAlerts[0] || null;
    riskScore = 12;
    activeThreat = null;
  }

  return {
    status,
    health,
    riskScore,
    activeThreat,
    currentAlert,
    allIncidents: entAlerts,
    activeAlertsCount: activeAlerts.length,
    activeAlerts,
    mitigatedAlertsCount: mitigatedAlerts.length,
    mitigatedAlerts,
    resolvedAlertsCount: resolvedAlerts.length,
    resolvedAlerts
  };
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

  // Load persistent active injected alerts from localStorage to survive refreshes & stream cycles
  try {
    const localActive = JSON.parse(localStorage.getItem('sentinel_active_injected_alerts') || '[]');
    if (Array.isArray(localActive) && localActive.length > 0) {
      localActive.forEach(localAlt => {
        if (!localAlt || !localAlt.id) return;
        const exists = serverAlerts.some(sa => sa.id.toLowerCase() === localAlt.id.toLowerCase());
        if (!exists) {
          serverAlerts.unshift(localAlt);
        }
      });
    }
  } catch (err) {}

  // Merge client-side localStorage overrides so simulated mitigations and resolutions persist
  try {
    const savedOverrides = JSON.parse(localStorage.getItem('sentinel_alert_overrides') || '{}');
    let overridesModified = false;
    if (Object.keys(savedOverrides).length > 0) {
      serverAlerts = serverAlerts.map(a => {
        const override = savedOverrides[a.id];

        // Prevent stale sentinel_alert_overrides from overriding a newly created ACTIVE alert!
        if (a.status === 'ACTION REQUIRED') {
          const norm = normalizeEnterpriseId(a.enterpriseId || a.enterpriseName);
          if (norm && (savedOverrides[`E${norm}`] || savedOverrides[`enterprise_${norm}`])) {
            delete savedOverrides[`E${norm}`];
            delete savedOverrides[`enterprise_${norm}`];
            overridesModified = true;
          }
          if (override && override.status === 'RESOLVED') {
            delete savedOverrides[a.id];
            overridesModified = true;
            return a;
          }
        }

        if (override) {
          return { ...a, ...override };
        }
        return a;
      });

      if (overridesModified) {
        localStorage.setItem('sentinel_alert_overrides', JSON.stringify(savedOverrides));
      }
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
    mitigationStatus: 'SIMULATED',
    mitigatedAt: timestamp,
    mitigationActionTaken: 'Simulated mitigation executed. 50-shot exemplar filter & rate limiting deployed (simulation only; no real network changes).'
  };

  // Persist locally
  try {
    const saved = JSON.parse(localStorage.getItem('sentinel_alert_overrides') || '{}');
    saved[alertId] = { ...(saved[alertId] || {}), ...override };
    localStorage.setItem('sentinel_alert_overrides', JSON.stringify(saved));

    const localActive = JSON.parse(localStorage.getItem('sentinel_active_injected_alerts') || '[]');
    const updated = localActive.map(a => a.id === alertId ? { ...a, ...override } : a);
    localStorage.setItem('sentinel_active_injected_alerts', JSON.stringify(updated));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sentinel_alerts_updated'));
      window.dispatchEvent(new Event('storage'));
    }
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

export async function restoreAlert(alertId) {
  const timestamp = new Date().toISOString();
  const override = {
    status: 'RESOLVED',
    mitigationStatus: 'RESTORED',
    resolvedAt: timestamp,
    resolutionActionTaken: 'Incident resolved. Ingress unblocked and restored in simulation.'
  };

  // Persist locally
  try {
    const saved = JSON.parse(localStorage.getItem('sentinel_alert_overrides') || '{}');
    saved[alertId] = { ...(saved[alertId] || {}), ...override };
    localStorage.setItem('sentinel_alert_overrides', JSON.stringify(saved));

    const localActive = JSON.parse(localStorage.getItem('sentinel_active_injected_alerts') || '[]');
    const updated = localActive.filter(a => a.id !== alertId);
    localStorage.setItem('sentinel_active_injected_alerts', JSON.stringify(updated));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sentinel_alerts_updated'));
      window.dispatchEvent(new Event('storage'));
    }
  } catch (err) {
    // Ignore
  }

  // Call server to persist in-memory override
  try {
    const res = await fetch(`${API_BASE}/alerts/${alertId}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (res.ok) {
      return res.json();
    }
  } catch (err) {}

  return {
    success: true,
    alertId,
    updatedStatus: 'RESOLVED',
    alert: { id: alertId, ...override }
  };
}

export const unblockAlert = restoreAlert;

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
      if (match === norm && !isAlertResolved(a)) {
        saved[a.id] = {
          ...(saved[a.id] || {}),
          status: 'MITIGATED · SIMULATION',
          mitigationStatus: 'SIMULATED',
          mitigatedAt: timestamp,
          mitigationActionTaken: `Simulated mitigation executed for Enterprise ${digit}. No real network configuration changed.`
        };
      }
    });
    localStorage.setItem('sentinel_alert_overrides', JSON.stringify(saved));

    const localActive = JSON.parse(localStorage.getItem('sentinel_active_injected_alerts') || '[]');
    const updatedActive = localActive.map(a => {
      const match = normalizeEnterpriseId(a.enterpriseId || a.enterpriseName);
      if (match === norm && !isAlertResolved(a)) {
        return {
          ...a,
          status: 'MITIGATED · SIMULATION',
          mitigationStatus: 'SIMULATED',
          mitigatedAt: timestamp
        };
      }
      return a;
    });
    localStorage.setItem('sentinel_active_injected_alerts', JSON.stringify(updatedActive));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sentinel_alerts_updated'));
      window.dispatchEvent(new Event('storage'));
    }
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

export async function restoreEnterpriseAlerts(enterpriseId) {
  const norm = normalizeEnterpriseId(enterpriseId);
  const digit = norm.replace(/\D/g, '') || '1';
  const timestamp = new Date().toISOString();

  try {
    const alertsRes = await fetchAlerts();
    const saved = JSON.parse(localStorage.getItem('sentinel_alert_overrides') || '{}');
    (alertsRes.alerts || []).forEach(a => {
      const match = normalizeEnterpriseId(a.enterpriseId || a.enterpriseName);
      if (match === norm) {
        saved[a.id] = {
          ...(saved[a.id] || {}),
          status: 'RESOLVED',
          mitigationStatus: 'RESTORED',
          resolvedAt: timestamp,
          resolutionActionTaken: `Incident resolved for Enterprise ${digit}. Ingress unblocked and restored in simulation.`
        };
      }
    });
    localStorage.setItem('sentinel_alert_overrides', JSON.stringify(saved));

    const localActive = JSON.parse(localStorage.getItem('sentinel_active_injected_alerts') || '[]');
    const updatedActive = localActive.filter(a => {
      const match = normalizeEnterpriseId(a.enterpriseId || a.enterpriseName);
      return match !== norm;
    });
    localStorage.setItem('sentinel_active_injected_alerts', JSON.stringify(updatedActive));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sentinel_alerts_updated'));
      window.dispatchEvent(new Event('storage'));
    }
  } catch (err) {}

  try {
    const res = await fetch(`${API_BASE}/alerts/restore-enterprise/${norm}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (res.ok) {
      return res.json();
    }
  } catch (err) {}

  return { success: true, enterpriseId: norm };
}

export const unblockEnterpriseAlerts = restoreEnterpriseAlerts;

export async function resetAlertSimulation(alertId) {
  if (!alertId) return;
  try {
    const saved = JSON.parse(localStorage.getItem('sentinel_alert_overrides') || '{}');
    delete saved[alertId];
    localStorage.setItem('sentinel_alert_overrides', JSON.stringify(saved));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sentinel_alerts_updated'));
      window.dispatchEvent(new Event('storage'));
    }
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

export async function resetAllAlerts() {
  try {
    localStorage.removeItem('sentinel_alert_overrides');
    localStorage.removeItem('sentinel_active_injected_alerts');
  } catch (err) {}

  try {
    await fetch(`${API_BASE}/alerts/reset-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {}
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



export async function injectTestAttack({
  enterpriseId = 'E3',
  prediction = 'DrDoS_UDP',
  groundTruth = 'DrDoS_UDP',
  confidence = 0.92,
  severity = 'HIGH'
} = {}) {
  const res = await fetch(`${API_BASE}/alerts/test-inject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enterpriseId, prediction, groundTruth, confidence, severity })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  if (prediction !== 'BENIGN') {
    const norm = normalizeEnterpriseId(enterpriseId);
    const alertId = data.alert?.id || `ALT-${(data.event?.event_id || 'TEST-' + Date.now()).replace('FLOW-', '')}`;
    const newAlert = data.alert || {
      id: alertId,
      timestamp: data.event?.timestamp || new Date().toISOString(),
      enterpriseId: `enterprise_${norm}`,
      enterpriseName: `Enterprise ${norm}`,
      threatType: prediction,
      category: `Model Detected Vector (${prediction})`,
      severity: severity || 'HIGH',
      confidence: confidence || 0.92,
      status: 'ACTION REQUIRED',
      mitigationStatus: 'ACTION_REQUIRED',
      tier: 'Tier 1 (Global 12-Class Head)',
      groundTruth: groundTruth,
      isSimulated: true
    };

    try {
      const localActive = JSON.parse(localStorage.getItem('sentinel_active_injected_alerts') || '[]');
      const filtered = localActive.filter(a => a.id !== newAlert.id);
      filtered.unshift(newAlert);
      localStorage.setItem('sentinel_active_injected_alerts', JSON.stringify(filtered));

      // Clear any conflicting overrides for this specific new alert
      const saved = JSON.parse(localStorage.getItem('sentinel_alert_overrides') || '{}');
      delete saved[newAlert.id];
      delete saved[alertId];
      delete saved[`E${norm}`];
      delete saved[`enterprise_${norm}`];
      localStorage.setItem('sentinel_alert_overrides', JSON.stringify(saved));
    } catch (e) {}
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sentinel_attack_injected', { detail: data }));
    window.dispatchEvent(new CustomEvent('sentinel_alerts_updated'));
    window.dispatchEvent(new Event('storage'));
  }
  return data;
}
