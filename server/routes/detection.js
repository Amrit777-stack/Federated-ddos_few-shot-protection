const express = require('express');
const router = express.Router();
const dataService = require('../services/dataService');

router.get('/demo', (req, res) => {
  try {
    const demo = dataService.getDetectionDemo();
    res.json(demo);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve detection demo', message: err.message });
  }
});

router.get('/demo/:id', (req, res) => {
  try {
    const demo = dataService.getDetectionDemo();
    const sample = demo.samples.find(s => s.id.toLowerCase() === req.params.id.toLowerCase());
    if (!sample) {
      return res.status(404).json({ error: 'Sample not found', sampleId: req.params.id });
    }
    res.json(sample);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve demo sample', message: err.message });
  }
});

module.exports = router;

