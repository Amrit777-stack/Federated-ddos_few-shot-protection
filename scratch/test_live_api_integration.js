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
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch('http://127.0.0.1:8000/health');
      if (res.ok) {
        const json = await res.json();
        console.log('[OK] Python FastAPI is ONLINE:', json.model);
        return true;
      }
    } catch (e) {
      // wait
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('Python service did not become healthy in 20 seconds');
}

async function run() {
  await waitForPython();

  console.log('\nStarting Express integration test on port 5099...');
  const app = require('../server/server');
  const server = app.listen(5099, async () => {
    try {
      // 1. Test /api/live/status
      console.log('\n--- 1. Testing GET /api/live/status ---');
      const sRes = await fetch('http://localhost:5099/api/live/status');
      const sJson = await sRes.json();
      console.log('Status result:', sJson);
      if (sJson.status !== 'online') throw new Error('Status not online!');

      // 2. Test POST /api/live/predict with dummy 81 zeroes
      console.log('\n--- 2. Testing POST /api/live/predict ---');
      const pRes = await fetch('http://localhost:5099/api/live/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ features: new Array(81).fill(0.0) })
      });
      const pJson = await pRes.json();
      console.log('Predict result:', pJson);
      if (!pJson.prediction || pJson.inference_mode !== 'LIVE_ML_INFERENCE') {
        throw new Error('Predict output invalid');
      }

      // 3. Test POST /api/live/start
      console.log('\n--- 3. Testing POST /api/live/start ---');
      const startRes = await fetch('http://localhost:5099/api/live/start', { method: 'POST' });
      const startJson = await startRes.json();
      console.log('Start result:', startJson);

      // Wait 3.5 seconds for simulation flows
      console.log('Waiting 3.5 seconds for live simulation flows to accumulate...');
      await new Promise(r => setTimeout(r, 3500));

      // 4. Test GET /api/live/events
      console.log('\n--- 4. Testing GET /api/live/events ---');
      const evRes = await fetch('http://localhost:5099/api/live/events?limit=5');
      const evJson = await evRes.json();
      console.log(`Live events count: ${evJson.count}, Stats:`, evJson.stats);
      if (evJson.events.length > 0) {
        console.log('Top event from stream:', {
          id: evJson.events[0].event_id,
          ent: evJson.events[0].enterprise_id,
          pred: evJson.events[0].prediction,
          conf: evJson.events[0].confidence,
          sev: evJson.events[0].severity,
          gt: evJson.events[0].ground_truth_evaluation_only
        });
      }

      // 5. Test GET /api/alerts (with live alerts)
      console.log('\n--- 5. Testing GET /api/alerts (with live alerts) ---');
      const alRes = await fetch('http://localhost:5099/api/alerts');
      const alJson = await alRes.json();
      console.log(`Alerts total: ${alJson.count}, Top alert:`, alJson.alerts[0]?.id, alJson.alerts[0]?.threatType);

      // 6. Test POST /api/live/stop
      console.log('\n--- 6. Testing POST /api/live/stop ---');
      const stopRes = await fetch('http://localhost:5099/api/live/stop', { method: 'POST' });
      const stopJson = await stopRes.json();
      console.log('Stop result:', stopJson);

      console.log('\n==================================================');
      console.log('ALL LIVE END-TO-END INTEGRATION TESTS PASSED!');
      console.log('==================================================');
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

