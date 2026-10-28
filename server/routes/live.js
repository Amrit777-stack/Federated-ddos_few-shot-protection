const express = require('express');
const router = express.Router();
const mlService = require('../services/mlService');

// GET /api/live/status
router.get('/status', async (req, res) => {
  try {
    const status = await mlService.checkStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({
      status: 'error',
      service: 'sentinel-fl-ml-service',
      message: err.message
    });
  }
});

// GET /api/live/pool-info
router.get('/pool-info', async (req, res) => {
  try {
    const poolInfo = await mlService.fetchPoolInfo();
    res.json(poolInfo);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch test pool information', message: err.message });
  }
});

// GET /api/live/metrics
router.get('/metrics', (req, res) => {
  try {
    const metrics = mlService.getMetrics();
    res.json(metrics);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve live metrics', message: err.message });
  }
});

// POST /api/live/predict
router.post('/predict', async (req, res) => {
  try {
    const { features } = req.body;
    if (!features) {
      return res.status(400).json({ error: 'Missing features in request body' });
    }

    const prediction = await mlService.predict(features);
    res.json(prediction);
  } catch (err) {
    res.status(502).json({
      error: 'Inference service unavailable or returned error',
      message: err.message
    });
  }
});

// GET /api/live/events
router.get('/events', (req, res) => {
  try {
    const limit = Number(req.query.limit) || 20;
    const eventsData = mlService.getEvents(limit);
    res.json(eventsData);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve live events', message: err.message });
  }
});

// POST /api/live/start
router.post('/start', (req, res) => {
  try {
    const result = mlService.startSimulation();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to start simulation', message: err.message });
  }
});

// POST /api/live/stop
router.post('/stop', (req, res) => {
  try {
    const result = mlService.stopSimulation();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to stop simulation', message: err.message });
  }
});

// POST /api/live/clear
router.post('/clear', async (req, res) => {
  try {
    const result = await mlService.clearHistory();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear simulation history', message: err.message });
  }
});

// POST /api/live/reset-metrics
router.post('/reset-metrics', async (req, res) => {
  try {
    const result = await mlService.clearHistory();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset metrics', message: err.message });
  }
});

module.exports = router;
