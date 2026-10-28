const express = require('express');
const router = express.Router();
const dataService = require('../services/dataService');

router.get('/', (req, res) => {
  try {
    const research = dataService.getResearchData();
    res.json(research);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve research data', message: err.message });
  }
});

module.exports = router;

