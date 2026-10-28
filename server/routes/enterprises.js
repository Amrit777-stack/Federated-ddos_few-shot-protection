const express = require('express');
const router = express.Router();
const dataService = require('../services/dataService');
const mlService = require('../services/mlService');

// GET /api/enterprises
router.get('/', (req, res) => {
  try {
    const enterprises = dataService.getEnterprises();
    const offlineList = mlService.getOfflineEnterprises();

    const enriched = enterprises.map(e => {
      const norm = `E${e.id.replace(/\D/g, '')}`;
      const isOffline = offlineList.includes(norm) || e.status === 'OFFLINE';
      return {
        ...e,
        status: isOffline ? 'OFFLINE' : (e.status === 'OFFLINE' ? 'ONLINE' : e.status),
        isOffline
      };
    });

    res.json({
      count: enriched.length,
      mode: 'SIMULATED ENTERPRISE CLIENTS',
      offlineEnterprises: offlineList,
      enterprises: enriched
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve enterprise data', message: err.message });
  }
});

// GET /api/enterprises/status
router.get('/status', (req, res) => {
  try {
    const offlineEnterprises = mlService.getOfflineEnterprises();
    const enterpriseStatuses = dataService.getEnterpriseStatuses();
    res.json({
      offlineEnterprises,
      enterpriseStatuses
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve enterprise statuses', message: err.message });
  }
});

// POST /api/enterprises/:id/toggle
router.post('/:id/toggle', (req, res) => {
  try {
    const { id } = req.params;
    const match = String(id).match(/([1-5])/);
    const num = match ? match[1] : '1';
    const key = `enterprise_${num}`;
    const entNorm = `E${num}`;

    const currentStatuses = dataService.getEnterpriseStatuses();
    const isCurrentlyOffline = currentStatuses[key] === 'OFFLINE' || mlService.getOfflineEnterprises().includes(entNorm);
    const newStatus = isCurrentlyOffline ? 'ONLINE' : 'OFFLINE';

    dataService.setEnterpriseStatus(key, newStatus);
    mlService.setEnterpriseStatus(entNorm, newStatus);

    res.json({
      success: true,
      enterpriseId: key,
      nodeId: entNorm,
      status: newStatus,
      isOffline: newStatus === 'OFFLINE',
      offlineEnterprises: mlService.getOfflineEnterprises(),
      message: `Enterprise ${entNorm} is now ${newStatus}. ${newStatus === 'OFFLINE' ? 'Attacks targeting this partition will be suppressed.' : 'Partition resumed normal ingress and FL gradient synchronization.'}`
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle enterprise status', message: err.message });
  }
});

// POST /api/enterprises/:id/status
router.post('/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const match = String(id).match(/([1-5])/);
    const num = match ? match[1] : '1';
    const key = `enterprise_${num}`;
    const entNorm = `E${num}`;
    const newStatus = String(status || '').toUpperCase() === 'OFFLINE' ? 'OFFLINE' : 'ONLINE';

    dataService.setEnterpriseStatus(key, newStatus);
    mlService.setEnterpriseStatus(entNorm, newStatus);

    res.json({
      success: true,
      enterpriseId: key,
      nodeId: entNorm,
      status: newStatus,
      isOffline: newStatus === 'OFFLINE',
      offlineEnterprises: mlService.getOfflineEnterprises()
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to set enterprise status', message: err.message });
  }
});

module.exports = router;
