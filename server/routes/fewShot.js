const express = require('express');
const router = express.Router();
const dataService = require('../services/dataService');

const VALID_ATTACKS = [
  'drdos_dns',
  'drdos_ldap',
  'drdos_mssql',
  'drdos_ntp',
  'drdos_netbios',
  'drdos_snmp',
  'drdos_ssdp',
  'drdos_udp',
  'syn',
  'tftp',
  'udp-lag',
  'webddos'
];
const VALID_SHOTS = [10, 20, 50, 100];
const VALID_METHODS = ['1-nn', 'prototype'];

// GET /api/few-shot/live/pool - stream pool metadata & thresholds
router.get('/live/pool', (req, res) => {
  try {
    const { attack } = req.query;
    const result = dataService.getFewShotLivePool(attack);
    if (result.error) {
      return res.status(404).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve live pool info', message: err.message });
  }
});

// GET /api/few-shot/live/next - retrieve next deterministic query flow & pipeline evaluation
router.get('/live/next', (req, res) => {
  try {
    const { attack = 'DrDoS_UDP', method = '1-NN', shots = 50, index = 1 } = req.query;
    const result = dataService.getFewShotLiveNext(attack, method, shots, index);
    if (result.error) {
      console.warn(`[FewShot Live Error] ${result.error}: ${result.message}`);
      return res.status(404).json(result);
    }
    const timeStr = new Date(result.timestamp || Date.now()).toISOString().replace('T', ' ').substring(0, 19);
    console.log(`[${timeStr}] [FewShot Live] Flow #${result.index}/${result.total_in_pool}: ${result.flow_id} [${result.ground_truth}] -> ${result.audit} (${result.method}-${result.shots}s | Sim=${result.similarity.toFixed(4)} | τ=${result.threshold.toFixed(4)} | ${result.pipeline.step4_detection.decision})`);
    res.json(result);
  } catch (err) {
    console.error(`[FewShot Live Exception]`, err.message);
    res.status(500).json({ error: 'Failed to evaluate live few-shot flow', message: err.message });
  }
});

// GET /api/few-shot with query params ?attack=...&shots=...&method=...
router.get('/', (req, res) => {
  try {
    const { attack, shots, method } = req.query;

    // Validation
    if (attack && !VALID_ATTACKS.includes(attack.toLowerCase())) {
      return res.status(400).json({
        error: 'Invalid attack parameter',
        allowed: VALID_ATTACKS,
        received: attack
      });
    }

    if (shots && !VALID_SHOTS.includes(Number(shots))) {
      return res.status(400).json({
        error: 'Invalid support size parameter',
        allowed: [10, 20, 50, 100],
        received: shots
      });
    }

    if (method && !VALID_METHODS.includes(method.toLowerCase())) {
      return res.status(400).json({
        error: 'Invalid method parameter',
        allowed: ['1-NN', 'Prototype'],
        received: method
      });
    }

    const result = dataService.getFewShotRecords(attack, shots, method);
    if (result.error) {
      return res.status(404).json(result);
    }

    // Attach summary for convenience
    const summaryData = dataService.getFewShotSummary();
    res.json({
      ...result,
      summary: summaryData.summary || [],
      bestConfiguration: summaryData.bestConfiguration
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve few-shot records', message: err.message });
  }
});

// GET /api/few-shot/summary
router.get('/summary', (req, res) => {
  try {
    const summary = dataService.getFewShotSummary();
    if (summary.error) {
      return res.status(404).json(summary);
    }
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve few-shot summary', message: err.message });
  }
});

// GET /api/few-shot/:attack
router.get('/:attack', (req, res) => {
  try {
    const attack = req.params.attack;
    if (!VALID_ATTACKS.includes(attack.toLowerCase())) {
      return res.status(400).json({
        error: 'Invalid attack name in path',
        allowed: VALID_ATTACKS,
        received: attack
      });
    }

    const result = dataService.getFewShotByAttack(attack);
    if (result.error) {
      return res.status(404).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve attack few-shot records', message: err.message });
  }
});

module.exports = router;

