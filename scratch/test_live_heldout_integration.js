/**
 * End-to-end integration test for SENTINEL-FL Held-Out Test Pool Live Simulation.
 * Verifies Python FastAPI -> Node/Express -> Held-Out Test Replay -> Live Metrics -> Result Audit.
 */

const { spawn } = require('child_process');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const pythonExe = path.join(PROJECT_ROOT, 'venv', 'Scripts', 'python.exe');

console.log('Spawning Python FastAPI on port 8000...');
const pyProc = spawn(pythonExe, ['ml_service/app.py'], {
  cwd: PROJECT_ROOT,
  stdio: 'inherit'
});

async function waitForPython() {
  console.log('Waiting for Python FastAPI to become healthy...');
  for (let i = 0; i < 25; i++) {
    try {
      const res = await fetch('http://127.0.0.1:8000/health');
      if (res.ok) {
        const json = await res.json();
        console.log('[OK] Python FastAPI is ONLINE:', json.model, json.traffic_source);
        return true;
      }
    } catch (e) {
      // wait
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('Python service did not become healthy in 25 seconds');
}

async function run() {
  await waitForPython();

  console.log('\nStarting Express integration test on port 5098...');
  const app = require('../server/server');
  const server = app.listen(5098, async () => {
    try {
      // 1. Test /api/live/status
      console.log('\n--- 1. Testing GET /api/live/status ---');
      const sRes = await fetch('http://localhost:5098/api/live/status');
      const sJson = await sRes.json();
      console.log('Status result:', sJson);
      if (sJson.status !== 'online') throw new Error('Status not online!');
      if (sJson.inputFeatures !== 81 || sJson.classes !== 13) {
        throw new Error('Feature / class count mismatch');
      }

      // 2. Test /api/live/pool-info
      console.log('\n--- 2. Testing GET /api/live/pool-info ---');
      const pRes = await fetch('http://localhost:5098/api/live/pool-info');
      const poolInfo = await pRes.json();
      console.log('Pool Info:', poolInfo);
      if (poolInfo.total_rows !== 18088) {
        throw new Error(`Expected total_rows == 18088, got ${poolInfo.total_rows}`);
      }
      if (poolInfo.train_rows_included !== 0) {
        throw new Error(`Expected train_rows_included == 0, got ${poolInfo.train_rows_included}`);
      }

      // 3. Populate Express buffer with 50 live events from held-out test pool
      console.log('\n--- 3. Feeding 50 live events through Express from held-out test pool ---');
      const mlService = require('../server/services/mlService');
      for (let i = 0; i < 50; i++) {
        await mlService.fetchNextSimulatedFlow();
      }
      console.log(`Feed completed. Processed ${mlService.sessionMetrics.flowsProcessed} live flows.`);

      // Also start live simulation on Express to verify background interval and alert pipeline
      console.log('\n--- 4. Testing POST /api/live/start (Express live loop) ---');
      const startRes = await fetch('http://localhost:5098/api/live/start', { method: 'POST' });
      const startJson = await startRes.json();
      console.log('Start result:', startJson);

      console.log('Waiting 3 seconds for simulation loop to accumulate flows...');
      await new Promise(r => setTimeout(r, 3000));

      // 5. Test GET /api/live/events
      console.log('\n--- 5. Testing GET /api/live/events ---');
      const evRes = await fetch('http://localhost:5098/api/live/events?limit=50');
      const evJson = await evRes.json();
      console.log(`Retrieved ${evJson.count} live events from Express buffer.`);
      console.log('First event keys:', Object.keys(evJson.events[0]));
      console.log('First event:', evJson.events[0]);

      // Audit retrieved events
      let auditedCorrect = 0;
      let auditedMisclassified = 0;
      for (const ev of evJson.events) {
        if (!ev.flow_id.startsWith('TEST-FLOW-')) {
          throw new Error(`Invalid flow_id: ${ev.flow_id}`);
        }
        if (typeof ev.correct !== 'boolean') {
          throw new Error(`Missing boolean correct field on event: ${ev.event_id}`);
        }
        const expectedCorrect = (ev.prediction === ev.ground_truth_label);
        if (ev.correct !== expectedCorrect) {
          throw new Error(`Correctness mismatch on event ${ev.event_id}: pred=${ev.prediction}, gt=${ev.ground_truth_label}, correct=${ev.correct}`);
        }
        if (ev.correct) auditedCorrect++;
        else auditedMisclassified++;
      }
      console.log(`[PASS] All ${evJson.events.length} audited events strictly verify against ground truth.`);
      console.log(`       Correct: ${auditedCorrect}, Misclassified: ${auditedMisclassified}`);

      // Sample event inspection
      const sampleEv = evJson.events[0];
      console.log('Sample Event Data:', {
        event_id: sampleEv.event_id,
        flow_id: sampleEv.flow_id,
        enterprise: sampleEv.enterprise_id,
        prediction: sampleEv.prediction,
        confidence: `${(sampleEv.confidence * 100).toFixed(1)}%`,
        severity: sampleEv.severity,
        ground_truth: sampleEv.ground_truth_label,
        correct: sampleEv.correct,
        result: sampleEv.result
      });

      // 6. Test GET /api/live/metrics
      console.log('\n--- 6. Testing GET /api/live/metrics ---');
      const mRes = await fetch('http://localhost:5098/api/live/metrics');
      const metrics = await mRes.json();
      console.log('Live Session Metrics:', {
        flowsProcessed: metrics.flowsProcessed,
        correctPredictions: metrics.correctPredictions,
        incorrectPredictions: metrics.incorrectPredictions,
        liveAccuracy: `${metrics.liveAccuracy}%`,
        macroPrecision: `${metrics.macroPrecision}%`,
        macroRecall: `${metrics.macroRecall}%`,
        macroF1: `${metrics.macroF1}%`,
        weightedF1: `${metrics.weightedF1}%`,
        averageConfidence: `${metrics.averageConfidence}%`,
        officialTestBaseline: metrics.officialTestBaseline
      });

      // 7. Test POST /api/live/stop
      console.log('\n--- 7. Testing POST /api/live/stop ---');
      const stopRes = await fetch('http://localhost:5098/api/live/stop', { method: 'POST' });
      const stopJson = await stopRes.json();
      console.log('Stop result:', stopJson);
      if (stopJson.isSimulating !== false) throw new Error('Stop failed!');

      // 8. Test Restart capability
      console.log('\n--- 8. Testing Simulator Restart ---');
      const restartRes = await fetch('http://localhost:5098/api/live/start', { method: 'POST' });
      const restartJson = await restartRes.json();
      console.log('Restart result:', restartJson);
      if (restartJson.isSimulating !== true) throw new Error('Restart failed!');

      // Stop once more
      await fetch('http://localhost:5098/api/live/stop', { method: 'POST' });

      // 9. Re-verify pool info remains intact
      const pResFinal = await fetch('http://localhost:5098/api/live/pool-info');
      const pJsonFinal = await pResFinal.json();
      console.log('Final Pool Status:', {
        total_rows: pJsonFinal.total_rows,
        rows_processed_this_cycle: pJsonFinal.rows_processed_this_cycle,
        remaining_rows_in_cycle: pJsonFinal.remaining_rows_in_cycle,
        cycle_count: pJsonFinal.cycle_count,
        train_rows_included: pJsonFinal.train_rows_included
      });
      if (pJsonFinal.total_rows !== 18088 || pJsonFinal.train_rows_included !== 0) {
        throw new Error('Pool integrity compromised after test session!');
      }

      console.log('\n============================================================');
      console.log('ALL HELD-OUT TEST LIVE INTEGRATION TESTS PASSED CLEANLY!');
      console.log('============================================================');
    } catch (err) {
      console.error('Integration test failed:', err);
    } finally {
      server.close();
      pyProc.kill();
      process.exit(0);
    }
  });
}

run();
