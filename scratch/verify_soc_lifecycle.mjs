import assert from 'assert';

const API_BASE = 'http://localhost:5000/api';

// Replicate normalization function from frontend/src/services/api.js
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
    return { status: 'OFFLINE', health: 'OFFLINE', activeAlertsCount: 0 };
  }

  const targetDigit = normalizeEnterpriseId(normId);

  const entAlerts = (allAlerts || []).filter(a => {
    if (!a) return false;
    const alertDigit = normalizeEnterpriseId(a.enterpriseId || a.enterpriseName);
    return alertDigit === targetDigit;
  });

  const activeAlerts = entAlerts.filter(isAlertActive);
  const mitigatedAlerts = entAlerts.filter(isAlertMitigated);
  const resolvedAlerts = entAlerts.filter(isAlertResolved);

  let status = 'ONLINE';
  let health = 'HEALTHY';
  let activeThreat = null;

  if (activeAlerts.length > 0) {
    status = 'UNDER ATTACK';
    health = 'CRITICAL';
    activeThreat = activeAlerts[0].threatType;
  } else if (mitigatedAlerts.length > 0) {
    status = 'MITIGATED';
    health = 'ELEVATED';
    activeThreat = mitigatedAlerts[0].threatType;
  } else {
    status = 'ONLINE';
    health = 'HEALTHY';
    activeThreat = null;
  }

  return {
    status,
    health,
    activeThreat,
    activeAlertsCount: activeAlerts.length,
    mitigatedAlertsCount: mitigatedAlerts.length,
    resolvedAlertsCount: resolvedAlerts.length
  };
}

// Replicate AlertsPage auto-selection priority
function selectAlertPriority(loadedAlerts, prev) {
  const activeAlert = loadedAlerts.find(a => isAlertActive(a));
  const mitigatedAlert = loadedAlerts.find(a => isAlertMitigated(a));
  const resolvedAlert = loadedAlerts.find(a => isAlertResolved(a));

  if (prev) {
    const updated = loadedAlerts.find(a => a.id.toLowerCase() === prev.id.toLowerCase());
    if (updated) {
      if (isAlertResolved(updated)) {
        if (activeAlert) return activeAlert;
        if (mitigatedAlert) return mitigatedAlert;
      }
      return updated;
    }
  }

  return activeAlert || mitigatedAlert || resolvedAlert || loadedAlerts[0] || null;
}

async function runTests() {
  console.log('====================================================');
  console.log('STARTING SENTINEL-FL SOC LIFECYCLE VERIFICATION');
  console.log('====================================================\n');

  // Test 1: Enterprise ID Normalization
  console.log('[Test 1] Testing enterprise ID normalization across all formats...');
  assert.strictEqual(normalizeEnterpriseId('E1'), '1');
  assert.strictEqual(normalizeEnterpriseId(1), '1');
  assert.strictEqual(normalizeEnterpriseId('1'), '1');
  assert.strictEqual(normalizeEnterpriseId('enterprise_1'), '1');
  assert.strictEqual(normalizeEnterpriseId('Enterprise 1'), '1');
  assert.strictEqual(normalizeEnterpriseId('SIMULATED ENTERPRISE 1'), '1');
  assert.strictEqual(normalizeEnterpriseId('enterprise_3'), '3');
  assert.strictEqual(normalizeEnterpriseId('E3'), '3');
  assert.strictEqual(normalizeEnterpriseId('Enterprise 3'), '3');
  assert.strictEqual(normalizeEnterpriseId('3'), '3');
  assert.strictEqual(normalizeEnterpriseId('enterprise_5'), '5');
  console.log('  -> PASS: All formats (E1, 1, enterprise_1, Enterprise 1, etc.) normalize to digit correctly.\n');

  // Test 2: Clean baseline
  console.log('[Test 2] Resetting to clean baseline...');
  await fetch(`${API_BASE}/alerts/reset-all`, { method: 'POST' });
  const baseRes = await fetch(`${API_BASE}/alerts`).then(r => r.json());
  const baseAlerts = baseRes.alerts || [];
  
  for (const id of ['1', '2', '3', '4', '5']) {
    const state = getEnterpriseSecurityState(id, baseAlerts, false);
    assert.strictEqual(state.status, 'ONLINE', `Enterprise ${id} should be ONLINE at baseline`);
  }
  console.log('  -> PASS: All enterprises are initially 🟢 ONLINE.\n');

  // Test 3: Attack Injection for E3
  console.log('[Test 3] Injecting Attack on E3 (DrDoS_UDP)...');
  const injectE3Res = await fetch(`${API_BASE}/alerts/test-inject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enterpriseId: 'E3', prediction: 'DrDoS_UDP', groundTruth: 'DrDoS_UDP' })
  }).then(r => r.json());
  assert.strictEqual(injectE3Res.success, true);
  assert.strictEqual(injectE3Res.isAttackDetected, true);

  const alertsAfterE3 = await fetch(`${API_BASE}/alerts`).then(r => r.json());
  const stateE3 = getEnterpriseSecurityState('3', alertsAfterE3.alerts, false);
  const stateE1Init = getEnterpriseSecurityState('1', alertsAfterE3.alerts, false);
  const stateE2Init = getEnterpriseSecurityState('2', alertsAfterE3.alerts, false);
  const stateE4Init = getEnterpriseSecurityState('4', alertsAfterE3.alerts, false);
  const stateE5Init = getEnterpriseSecurityState('5', alertsAfterE3.alerts, false);

  assert.strictEqual(stateE3.status, 'UNDER ATTACK', 'E3 must be UNDER ATTACK');
  assert.strictEqual(stateE1Init.status, 'ONLINE', 'E1 must remain ONLINE');
  assert.strictEqual(stateE2Init.status, 'ONLINE', 'E2 must remain ONLINE');
  assert.strictEqual(stateE4Init.status, 'ONLINE', 'E4 must remain ONLINE');
  assert.strictEqual(stateE5Init.status, 'ONLINE', 'E5 must remain ONLINE');
  console.log('  -> PASS: E3 is 🔴 UNDER ATTACK, other enterprises remain 🟢 ONLINE.\n');

  // Test 4: Attack Injection for E1
  console.log('[Test 4] Injecting Attack on E1 (Syn)...');
  const injectE1Res = await fetch(`${API_BASE}/alerts/test-inject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enterpriseId: 'E1', prediction: 'Syn', groundTruth: 'Syn' })
  }).then(r => r.json());
  assert.strictEqual(injectE1Res.success, true);

  const alertsAfterE1 = await fetch(`${API_BASE}/alerts`).then(r => r.json());
  const stateE1 = getEnterpriseSecurityState('1', alertsAfterE1.alerts, false);
  const stateE3_both = getEnterpriseSecurityState('3', alertsAfterE1.alerts, false);
  assert.strictEqual(stateE1.status, 'UNDER ATTACK', 'E1 must be UNDER ATTACK');
  assert.strictEqual(stateE3_both.status, 'UNDER ATTACK', 'E3 must still be UNDER ATTACK');
  console.log('  -> PASS: Both E1 and E3 are 🔴 UNDER ATTACK simultaneously and independently.\n');

  // Test 5: Simulating Live Polling / Traffic Flow & Pruning retention
  console.log('[Test 5] Simulating live polling and stream flow to verify alerts remain RED...');
  // Check after waiting 2 seconds and multiple poll requests
  for (let poll = 1; poll <= 3; poll++) {
    await new Promise(r => setTimeout(r, 700));
    const polled = await fetch(`${API_BASE}/alerts`).then(r => r.json());
    const s1 = getEnterpriseSecurityState('1', polled.alerts, false);
    const s3 = getEnterpriseSecurityState('3', polled.alerts, false);
    assert.strictEqual(s1.status, 'UNDER ATTACK', `Poll ${poll}: E1 must stay UNDER ATTACK`);
    assert.strictEqual(s3.status, 'UNDER ATTACK', `Poll ${poll}: E3 must stay UNDER ATTACK`);
  }
  console.log('  -> PASS: E1 and E3 remain 🔴 UNDER ATTACK across polling cycles and never auto-mitigate.\n');

  // Test 6: History Clear / Metrics Reset retention
  console.log('[Test 6] Testing history clear / metrics reset...');
  await fetch(`${API_BASE}/live/clear`, { method: 'POST' });
  const polledAfterClear = await fetch(`${API_BASE}/alerts`).then(r => r.json());
  const s1Clear = getEnterpriseSecurityState('1', polledAfterClear.alerts, false);
  const s3Clear = getEnterpriseSecurityState('3', polledAfterClear.alerts, false);
  assert.strictEqual(s1Clear.status, 'UNDER ATTACK', 'E1 must survive history clear');
  assert.strictEqual(s3Clear.status, 'UNDER ATTACK', 'E3 must survive history clear');
  console.log('  -> PASS: Active alerts are preserved on history clear/reset.\n');

  // Test 7: Mitigate E3
  console.log('[Test 7] Executing Mitigate for Enterprise 3...');
  const mitRes = await fetch(`${API_BASE}/alerts/mitigate-enterprise/3`, { method: 'POST' }).then(r => r.json());
  assert.strictEqual(mitRes.success, true);

  const alertsAfterMit = await fetch(`${API_BASE}/alerts`).then(r => r.json());
  const s3Mitigated = getEnterpriseSecurityState('3', alertsAfterMit.alerts, false);
  const s1StillAttack = getEnterpriseSecurityState('1', alertsAfterMit.alerts, false);

  assert.strictEqual(s3Mitigated.status, 'MITIGATED', 'E3 must become MITIGATED (orange)');
  assert.strictEqual(s1StillAttack.status, 'UNDER ATTACK', 'E1 must remain UNDER ATTACK (red)');
  console.log('  -> PASS: E3 successfully transitioned from 🔴 UNDER ATTACK to 🟠 MITIGATED.\n');

  // Test 8: Restore / Resolve E3
  console.log('[Test 8] Executing Restore for Enterprise 3...');
  const resRes = await fetch(`${API_BASE}/alerts/restore-enterprise/3`, { method: 'POST' }).then(r => r.json());
  assert.strictEqual(resRes.success, true);

  const alertsAfterRestore = await fetch(`${API_BASE}/alerts`).then(r => r.json());
  const s3Restored = getEnterpriseSecurityState('3', alertsAfterRestore.alerts, false);
  const s1AfterRestore = getEnterpriseSecurityState('1', alertsAfterRestore.alerts, false);

  assert.strictEqual(s3Restored.status, 'ONLINE', 'E3 must return to ONLINE (green)');
  assert.strictEqual(s1AfterRestore.status, 'UNDER ATTACK', 'E1 must remain UNDER ATTACK (red)');
  console.log('  -> PASS: E3 successfully transitioned from 🟠 MITIGATED to 🟢 ONLINE.\n');

  // Test 9: Re-attack on E3 after Resolution
  console.log('[Test 9] Injecting a new attack on E3 after it was resolved...');
  const reattackRes = await fetch(`${API_BASE}/alerts/test-inject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enterpriseId: 'E3', prediction: 'DrDoS_UDP', groundTruth: 'DrDoS_UDP' })
  }).then(r => r.json());
  assert.strictEqual(reattackRes.success, true);

  const alertsAfterReattack = await fetch(`${API_BASE}/alerts`).then(r => r.json());
  const s3Reattack = getEnterpriseSecurityState('3', alertsAfterReattack.alerts, false);
  assert.strictEqual(s3Reattack.status, 'UNDER ATTACK', 'E3 must become UNDER ATTACK again');
  console.log('  -> PASS: E3 immediately turns 🔴 UNDER ATTACK again; stale resolution is not applied.\n');

  // Test 10: AlertsPage Auto-selection Priority
  console.log('[Test 10] Testing AlertsPage auto-selection priority (ACTIVE → MITIGATED → RESOLVED)...');
  const mockAlerts = [
    { id: 'ALT-RESOLVED-1', status: 'RESOLVED', mitigationStatus: 'RESTORED' },
    { id: 'ALT-MITIGATED-1', status: 'MITIGATED · SIMULATION', mitigationStatus: 'SIMULATED' },
    { id: 'ALT-ACTIVE-1', status: 'ACTION REQUIRED', mitigationStatus: 'ACTION_REQUIRED' }
  ];
  
  // Case A: No previous selection -> should pick ACTIVE
  const sel1 = selectAlertPriority(mockAlerts, null);
  assert.strictEqual(sel1.id, 'ALT-ACTIVE-1', 'Must select active alert over resolved/mitigated');

  // Case B: Previous selection was resolved alert -> should switch to ACTIVE
  const sel2 = selectAlertPriority(mockAlerts, mockAlerts[0]);
  assert.strictEqual(sel2.id, 'ALT-ACTIVE-1', 'Must switch from resolved to active alert');

  // Case C: No active alert, only mitigated and resolved -> should pick MITIGATED
  const mockNoActive = [
    { id: 'ALT-RESOLVED-1', status: 'RESOLVED', mitigationStatus: 'RESTORED' },
    { id: 'ALT-MITIGATED-1', status: 'MITIGATED · SIMULATION', mitigationStatus: 'SIMULATED' }
  ];
  const sel3 = selectAlertPriority(mockNoActive, null);
  assert.strictEqual(sel3.id, 'ALT-MITIGATED-1', 'Must select mitigated alert over resolved');

  console.log('  -> PASS: Auto-selection strictly obeys ACTIVE → MITIGATED → RESOLVED and never defaults to resolved.\n');

  console.log('====================================================');
  console.log('ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY! (10/10 PASS)');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('TEST FAILURE:', err);
  process.exit(1);
});

