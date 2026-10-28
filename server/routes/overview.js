const express = require('express');
const router = express.Router();
const dataService = require('../services/dataService');

router.get('/', (req, res) => {
  try {
    const overview = dataService.getOverview();
    res.json(overview);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve overview data', message: err.message });
  }
});

module.exports = router;

