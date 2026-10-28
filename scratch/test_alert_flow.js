const express = require('express');
const mlService = require('../server/services/mlService');
const alertsRouter = require('../server/routes/alerts');
const fewshotRouter = require('../server/routes/fewshot');

const app = express();
app.use(express.json());
app.use('/api/alerts', alertsRouter);
app.use('/api/few-shot', fewshotRouter);

async function runTests() {
  console.log('--- STARTING COMPREHENSIVE INCIDENT ALERT & MITIGATION VERIFICATION ---');

  // Test 1: Emitting a live detection attack event
  console.log('1. Testing Live Stream Attack Alert Generation...');
  const testAttackEvent = {
    event_id: 'FLOW-LIVE-777',
    timestamp: new Date().toISOString(),
    enterprise_id: 'E3',
    enterprise_name: 'Enterprise 3 (Database & Syn Core)',
    prediction: 'Syn',
    severity: 'CRITICAL',
    confidence: 0.985,
    correct: true
  };

  mlService.onAlertGenerated(testAttackEvent);

  let captured = null;
  const mockRes = {
    json: (d) => { captured = d; },
    status: (code) => ({ json: (e) => { captured = { status: code, ...e }; } })
  };

  alertsRouter.handle({ method: 'GET', url: '/' }, mockRes, () => {});
  const alert777 = captured?.alerts?.find(a => a.id === 'ALT-LIVE-777');
  if (!alert777 || alert777.status !== 'ACTION REQUIRED') {
    console.error('✗ Failed: Live attack alert ALT-LIVE-777 not found or not in ACTION REQUIRED status!', alert777);
    process.exit(1);
  }
  console.log('✓ Pass: Alert ALT-LIVE-777 registered with ACTION REQUIRED');

  // Test 2: Simulating mitigation on the detected alert
  console.log('2. Testing Simulate Mitigation on ALT-LIVE-777...');
  let mitRes = null;
  alertsRouter.handle({ method: 'POST', url: '/ALT-LIVE-777/mitigate', params: { id: 'ALT-LIVE-777' } }, {
    status: (c) => ({ json: (e) => { mitRes = { status: c, ...e }; } }),
    json: (d) => { mitRes = d; }
  }, () => {});

  if (!mitRes || !mitRes.success || !mitRes.updatedStatus?.includes('MITIGATED')) {
    console.error('✗ Failed: Mitigation endpoint did not return success for ALT-LIVE-777!', mitRes);
    process.exit(1);
  }
  console.log('✓ Pass: Mitigation endpoint returned success and updatedStatus:', mitRes.updatedStatus);

  // Test 3: Verifying the queue reflects the mitigated state
  console.log('3. Verifying Alert Queue Reflects MITIGATED State...');
  alertsRouter.handle({ method: 'GET', url: '/' }, mockRes, () => {});
  const refreshed777 = captured?.alerts?.find(a => a.id === 'ALT-LIVE-777');
  if (!refreshed777 || !refreshed777.status.includes('MITIGATED') || refreshed777.mitigationStatus !== 'MITIGATION_SIMULATED') {
    console.error('✗ Failed: Queue did not reflect MITIGATED status for ALT-LIVE-777!', refreshed777);
    process.exit(1);
  }
  console.log('✓ Pass: Queue reflects:', refreshed777.status, 'mitigatedAt:', refreshed777.mitigatedAt);

  // Test 4: Testing reset endpoint
  console.log('4. Testing Reset Simulation for ALT-LIVE-777...');
  let resetRes = null;
  alertsRouter.handle({ method: 'POST', url: '/ALT-LIVE-777/reset', params: { id: 'ALT-LIVE-777' } }, {
    status: (c) => ({ json: (e) => { resetRes = { status: c, ...e }; } }),
    json: (d) => { resetRes = d; }
  }, () => {});

  if (!resetRes || !resetRes.success) {
    console.error('✗ Failed: Reset endpoint did not return success!', resetRes);
    process.exit(1);
  }

  alertsRouter.handle({ method: 'GET', url: '/' }, mockRes, () => {});
  const reset777 = captured?.alerts?.find(a => a.id === 'ALT-LIVE-777');
  if (!reset777 || reset777.status !== 'ACTION REQUIRED') {
    console.error('✗ Failed: Alert status was not reset to ACTION REQUIRED!', reset777);
    process.exit(1);
  }
  console.log('✓ Pass: Alert reset successfully back to ACTION REQUIRED');

  // Test 5: Testing Few-Shot Zero-Day Detection generating an alert
  console.log('5. Testing Few-Shot Live Next generating alert on zero-day attack flow...');
  let fsRes = null;
  fewshotRouter.handle({
    method: 'GET',
    url: '/live/next?attack=DrDoS_UDP&method=1-NN&shots=50&index=1',
    query: { attack: 'DrDoS_UDP', method: '1-NN', shots: 50, index: 1 }
  }, {
    status: (c) => ({ json: (e) => { fsRes = { status: c, ...e }; } }),
    json: (d) => { fsRes = d; }
  }, () => {});

  if (!fsRes || fsRes.error) {
    console.error('✗ FewShot live next failed:', fsRes);
    process.exit(1);
  }
  console.log(`✓ FewShot evaluated flow ${fsRes.flow_id} (${fsRes.ground_truth}) -> is_detected=${fsRes.is_detected}`);

  alertsRouter.handle({ method: 'GET', url: '/' }, mockRes, () => {});
  const fsAlert = captured?.alerts?.find(a => a.threatType === 'DrDoS_UDP' && a.id.includes(fsRes.flow_id.replace('FLOW-', '')));
  if (fsRes.is_detected) {
    if (!fsAlert) {
      console.error('✗ FewShot alert was not generated in the queue!');
      process.exit(1);
    }
    console.log(`✓ Pass: Zero-Day alert ${fsAlert.id} generated for ${fsAlert.enterpriseName}: ${fsAlert.threatType} (${fsAlert.status})`);

    // Mitigate this fewshot alert
    let fsMit = null;
    alertsRouter.handle({ method: 'POST', url: `/${fsAlert.id}/mitigate`, params: { id: fsAlert.id } }, {
      status: (c) => ({ json: (e) => { fsMit = { status: c, ...e }; } }),
      json: (d) => { fsMit = d; }
    }, () => {});
    if (!fsMit || !fsMit.success) {
      console.error('✗ FewShot alert mitigation failed!', fsMit);
      process.exit(1);
    }
    console.log(`✓ Pass: Zero-Day alert ${fsAlert.id} successfully mitigated: ${fsMit.updatedStatus}`);
  }

  console.log('--- ALL VERIFICATIONS PASSED SUCCESSFULLY ---');
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});

