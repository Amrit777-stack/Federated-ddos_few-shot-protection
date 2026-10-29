import assert from 'assert';

const API_BASE = 'http://localhost:5000/api';

function normalizeEnterpriseId(enterpriseId) {
  if (enterpriseId === null || enterpriseId === undefined) return '';
  const str = String(enterpriseId).trim();
  const match = str.match(/([1-5])/);
  return match ? match[1] : str.replace(/\D/g, '');
}

function isAlertResolved(alert) {
  if (!alert) return false;
  const status = String(alert.status || '').toUpperCase();
  const mitStatus = String(alert.mitigationStatus || '').toUpperCase();
  return status.includes('RESOLV') || mitStatus.includes('RESTORE') || mitStatus.includes('RESOLV');
}

function isAlertMitigated(alert) {
  if (!alert) return false;
  if (isAlertResolved(alert)) return false;
  const status = String(alert.status || '').toUpperCase();
  const mitStatus = String(alert.mitigationStatus || '').toUpperCase();
  return status.includes('MITIGAT') || mitStatus.includes('SIMULAT');
}

function isAlertActive(alert) {
  if (!alert) return false;
  return !isAlertMitigated(alert) && !isAlertResolved(alert);
}

function getEnterpriseSecurityState(normId, allAlerts = [], isOffline = false) {
  if (isOffline) {
    return {
      status: 'OFFLINE',
      health: 'OFFLINE',
      riskScore: 0,
      activeThreat: null,
      currentAlert: null,
      allIncidents: [],
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

async function runMultiIncidentTests() {
  console.log('====================================================');
  console.log('STARTING MULTI-INCIDENT INDEPENDENT RESOLUTION TEST');
  console.log('====================================================\n');

  // Step 0: Clean baseline
  console.log('[Setup] Resetting alerts to baseline...');
  await fetch(`${API_BASE}/alerts/reset-all`, { method: 'POST' });

  // Step 1: Create 3 attacks on E3
  console.log('[Step 1] Creating 3 attacks on E3:');
  console.log('  1. DrDoS_UDP');
  const atk1 = await fetch(`${API_BASE}/alerts/test-inject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enterpriseId: 'E3', prediction: 'DrDoS_UDP', groundTruth: 'DrDoS_UDP' })
  }).then(r => r.json());
  await new Promise(r => setTimeout(r, 200));

  console.log('  2. Syn');
  const atk2 = await fetch(`${API_BASE}/alerts/test-inject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enterpriseId: 'E3', prediction: 'Syn', groundTruth: 'Syn' })
  }).then(r => r.json());
  await new Promise(r => setTimeout(r, 200));

  console.log('  3. DrDoS_DNS');
  const atk3 = await fetch(`${API_BASE}/alerts/test-inject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enterpriseId: 'E3', prediction: 'DrDoS_DNS', groundTruth: 'DrDoS_DNS' })
  }).then(r => r.json());

  console.log(`  -> Attack 1 ID: ${atk1.alert.id}`);
  console.log(`  -> Attack 2 ID: ${atk2.alert.id}`);
  console.log(`  -> Attack 3 ID: ${atk3.alert.id}\n`);

  // Step 2: Verify E3 stays RED, all 3 stored, and latest is Attack 3 (DrDoS_DNS)
  console.log('[Step 2] Verifying initial state with 3 attacks:');
  let alertsRes = await fetch(`${API_BASE}/alerts`).then(r => r.json());
  let state = getEnterpriseSecurityState('3', alertsRes.alerts, false);

  assert.strictEqual(state.status, 'UNDER ATTACK', 'E3 must be UNDER ATTACK (RED)');
  assert.strictEqual(state.activeAlertsCount, 3, 'E3 must have exactly 3 active attacks');
  assert.strictEqual(state.activeThreat, 'DrDoS_DNS', 'Latest attack (DrDoS_DNS) must be activeThreat');
  assert.strictEqual(state.currentAlert.id, atk3.alert.id, 'Current alert must be Attack 3');
  console.log('  -> PASS: E3 is 🔴 UNDER ATTACK, 3 active attacks queued, latest shown is DrDoS_DNS.\n');

  // Step 3: Mitigate/Resolve Attack #3 (DrDoS_DNS)
  console.log('[Step 3] Mitigating / Resolving Attack #3 (DrDoS_DNS)...');
  await fetch(`${API_BASE}/alerts/${atk3.alert.id}/restore`, { method: 'POST' });

  alertsRes = await fetch(`${API_BASE}/alerts`).then(r => r.json());
  state = getEnterpriseSecurityState('3', alertsRes.alerts, false);

  assert.strictEqual(state.status, 'UNDER ATTACK', 'E3 must STAY RED because 2 attacks are still active');
  assert.strictEqual(state.activeAlertsCount, 2, 'E3 must now have 2 active attacks remaining');
  assert.strictEqual(state.activeThreat, 'Syn', 'Attack #2 (Syn) must automatically become current');
  assert.strictEqual(state.currentAlert.id, atk2.alert.id, 'Current alert must be Attack 2');
  console.log('  -> PASS: Attack #3 resolved. E3 stays 🔴 UNDER ATTACK. Attack #2 (Syn) automatically became current.\n');

  // Step 4: Mitigate / Resolve Attack #2 (Syn)
  console.log('[Step 4] Mitigating / Resolving Attack #2 (Syn)...');
  await fetch(`${API_BASE}/alerts/${atk2.alert.id}/restore`, { method: 'POST' });

  alertsRes = await fetch(`${API_BASE}/alerts`).then(r => r.json());
  state = getEnterpriseSecurityState('3', alertsRes.alerts, false);

  assert.strictEqual(state.status, 'UNDER ATTACK', 'E3 must STAY RED because Attack #1 is still active');
  assert.strictEqual(state.activeAlertsCount, 1, 'E3 must have 1 active attack remaining');
  assert.strictEqual(state.activeThreat, 'DrDoS_UDP', 'Attack #1 (DrDoS_UDP) must automatically become current');
  assert.strictEqual(state.currentAlert.id, atk1.alert.id, 'Current alert must be Attack 1');
  console.log('  -> PASS: Attack #2 resolved. E3 stays 🔴 UNDER ATTACK. Attack #1 (DrDoS_UDP) automatically became current.\n');

  // Step 5: Resolve Attack #1 (DrDoS_UDP) -> only now E3 becomes GREEN
  console.log('[Step 5] Resolving final Attack #1 (DrDoS_UDP)...');
  await fetch(`${API_BASE}/alerts/${atk1.alert.id}/restore`, { method: 'POST' });

  alertsRes = await fetch(`${API_BASE}/alerts`).then(r => r.json());
  state = getEnterpriseSecurityState('3', alertsRes.alerts, false);

  assert.strictEqual(state.status, 'ONLINE', 'E3 must now become ONLINE (GREEN)');
  assert.strictEqual(state.activeAlertsCount, 0, 'E3 must have 0 active attacks');
  assert.strictEqual(state.activeThreat, null, 'activeThreat must be null');
  console.log('  -> PASS: Attack #1 resolved. Only now E3 becomes 🟢 ONLINE.\n');

  // Step 6: Test Mitigate -> Mitigate -> Mitigate -> Restore lifecycle
  console.log('[Step 6] Testing Mitigate-first workflow:');
  const mAtk1 = await fetch(`${API_BASE}/alerts/test-inject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enterpriseId: 'E3', prediction: 'DrDoS_UDP' })
  }).then(r => r.json());
  await new Promise(r => setTimeout(r, 100));

  const mAtk2 = await fetch(`${API_BASE}/alerts/test-inject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enterpriseId: 'E3', prediction: 'Syn' })
  }).then(r => r.json());

  // Mitigate attack 2
  await fetch(`${API_BASE}/alerts/${mAtk2.alert.id}/mitigate`, { method: 'POST' });
  alertsRes = await fetch(`${API_BASE}/alerts`).then(r => r.json());
  let mState = getEnterpriseSecurityState('3', alertsRes.alerts, false);
  assert.strictEqual(mState.status, 'UNDER ATTACK', 'E3 must stay RED because Attack 1 is still active');
  assert.strictEqual(mState.activeThreat, 'DrDoS_UDP', 'Attack 1 is current active attack');

  // Mitigate attack 1
  await fetch(`${API_BASE}/alerts/${mAtk1.alert.id}/mitigate`, { method: 'POST' });
  alertsRes = await fetch(`${API_BASE}/alerts`).then(r => r.json());
  mState = getEnterpriseSecurityState('3', alertsRes.alerts, false);
  assert.strictEqual(mState.status, 'MITIGATED', 'E3 must become ORANGE (MITIGATED) once all active are mitigated');

  // Restore attack 1 and 2
  await fetch(`${API_BASE}/alerts/${mAtk1.alert.id}/restore`, { method: 'POST' });
  await fetch(`${API_BASE}/alerts/${mAtk2.alert.id}/restore`, { method: 'POST' });
  alertsRes = await fetch(`${API_BASE}/alerts`).then(r => r.json());
  mState = getEnterpriseSecurityState('3', alertsRes.alerts, false);
  assert.strictEqual(mState.status, 'ONLINE', 'E3 returns to 🟢 ONLINE once all are restored');
  console.log('  -> PASS: Mitigate workflow preserves RED while any attack is unmitigated, turns ORANGE when all mitigated, and GREEN when all restored.\n');

  console.log('====================================================');
  console.log('ALL MULTI-INCIDENT TESTS COMPLETED SUCCESSFULLY! (6/6 PASS)');
  console.log('====================================================');
}

runMultiIncidentTests().catch(err => {
  console.error('TEST FAILURE:', err);
  process.exit(1);
});

