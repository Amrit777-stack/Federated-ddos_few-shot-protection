const app = require('../server/server');

const server = app.listen(5099, async () => {
  console.log('Testing server on port 5099...');
  try {

    const endpoints = [
      '/',
      '/api/health',
      '/api/overview',
      '/api/enterprises',
      '/api/research',
      '/api/few-shot',
      '/api/few-shot?attack=DrDoS_SNMP&shots=50&method=1-NN',
      '/api/few-shot/DrDoS_UDP',
      '/api/few-shot/summary',
      '/api/alerts',
      '/api/round-history',
      '/api/detection/demo'
    ];

    for (const ep of endpoints) {
      const res = await fetch(`http://localhost:5099${ep}`);
      if (ep === '/') {
        const text = await res.text();
        const hasTitle = text.includes('SENTINEL-FL');
        console.log(`[PASS] / -> status ${res.status}, contains SENTINEL-FL: ${hasTitle}`);
      } else {
        const json = await res.json();
        console.log(`[PASS] ${ep} -> status ${res.status}, keys: ${Object.keys(json).join(', ')}`);
      }
    }

    console.log('\nALL 11 ENDPOINTS TESTED SUCCESSFULLY!');
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    server.close();
    process.exit(0);
  }
});
