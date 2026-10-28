const mlService = require('../server/services/mlService');
const app = require('../server/server');

async function testClear() {
  console.log('--- Testing clear action ---');
  // Mock add 5 dummy events to mlService
  for (let i = 1; i <= 5; i++) {
    mlService._recordEvent({
      event_id: `FLOW-00000${i}`,
      flow_id: `TEST-FLOW-00000${i}`,
      timestamp: new Date().toISOString(),
      enterprise_id: 'E1',
      enterprise_name: 'E1 - SIMULATED',
      source: 'HELD_OUT_TEST_POOL',
      prediction: 'DrDoS_DNS',
      class_id: 1,
      confidence: 0.95,
      severity: 'CRITICAL',
      status: 'DETECTED',
      model: 'FedProx-G20',
      inference_mode: 'LIVE_ML_INFERENCE',
      key_features: {},
      ground_truth_label: 'DrDoS_DNS',
      ground_truth_class_id: 1,
      correct: true,
      result: 'CORRECT'
    });
  }

  const server = app.listen(5097, async () => {
    try {
      // 1. Check before clear
      const evBefore = await fetch('http://localhost:5097/api/live/events');
      const jsonBefore = await evBefore.json();
      console.log('Before clear:', {
        count: jsonBefore.count,
        flowsProcessed: jsonBefore.stats.flowsProcessed
      });
      if (jsonBefore.count !== 5 || jsonBefore.stats.flowsProcessed !== 5) {
        throw new Error('Events not populated properly');
      }

      // 2. Call POST /api/live/clear
      const clearRes = await fetch('http://localhost:5097/api/live/clear', { method: 'POST' });
      const clearJson = await clearRes.json();
      console.log('Clear response:', clearJson.status);

      // 3. Check after clear
      const evAfter = await fetch('http://localhost:5097/api/live/events');
      const jsonAfter = await evAfter.json();
      console.log('After clear:', {
        count: jsonAfter.count,
        flowsProcessed: jsonAfter.stats.flowsProcessed,
        eventsLength: jsonAfter.events.length
      });

      if (jsonAfter.count !== 0 || jsonAfter.stats.flowsProcessed !== 0 || jsonAfter.events.length !== 0) {
        throw new Error('History was not completely cleared!');
      }

      console.log('[PASS] POST /api/live/clear completely wipes all events, counters, and buffer!');
    } catch (e) {
      console.error('Test failed:', e);
    } finally {
      server.close();
      process.exit(0);
    }
  });
}

testClear();

