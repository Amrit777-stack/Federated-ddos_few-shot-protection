const express = require('express');
const router = express.Router();
const dataService = require('../services/dataService');
const mlService = require('../services/mlService');

let alertOverrides = {};
const liveAlerts = [];

// Register real-time alert listener from PyTorch live inference
mlService.onAlertGenerated = (event) => {
  const alertId = `ALT-${event.event_id.replace('FLOW-', '')}`;
  let isoTime;
  try {
    isoTime = event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString();
  } catch (e) {
    isoTime = new Date().toISOString();
  }

  const newAlert = {
    id: alertId,
    timestamp: isoTime,
    enterpriseId: event.enterprise_id.toLowerCase().replace('e', 'enterprise_'),
    enterpriseName: event.enterprise_name,
    threatType: event.prediction,
    category: `Model Detected Vector (${event.prediction})`,
    severity: event.severity,
    confidence: event.confidence,
    status: 'ACTION REQUIRED',
    tier: 'Tier 1 (Global 12-Class Head)',
    trafficMetrics: {
      flowDuration: 1204892,
      packetRate: 14820.4,
      byteRate: 18920400,
      avgPacketSize: 1276.5
    },
    recommendedResponse: [
      `Enforce flow rate limits on ${event.enterprise_name}`,
      `Filter anomalous ${event.prediction} ingress signatures`,
      'Deploy 50-shot exemplar defense on edge buffer'
    ],
    mitigationStatus: 'ACTION_REQUIRED',
    isSimulated: true
  };

  // Prepend
  liveAlerts.unshift(newAlert);
  if (liveAlerts.length > 30) {
    liveAlerts.pop();
  }
};

// Register history clear listener to remove generated live alerts
mlService.onHistoryCleared = () => {
  liveAlerts.length = 0;
  alertOverrides = {};
  console.log('[Alerts] Live simulated alerts cleared.');
};

router.get('/', (req, res) => {
  try {
    const staticAlerts = dataService.getAlerts();
    const combined = [...liveAlerts, ...staticAlerts];

    const alerts = combined.map(alt => {
      const overrideKey = Object.keys(alertOverrides).find(k => k.toLowerCase() === alt.id.toLowerCase());
      if (overrideKey) {
        return { ...alt, ...alertOverrides[overrideKey] };
      }
      return alt;
    });

    res.json({
      count: alerts.length,
      mode: 'SIMULATED SOC INCIDENT QUEUE',
      disclaimer: 'No actual network blocking or firewall reconfigurations occur. Actions simulate SOC runbook execution.',
      alerts
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve alerts', message: err.message });
  }
});

router.post('/:id/mitigate', (req, res) => {
  try {
    const { id } = req.params;
    const combined = [...liveAlerts, ...dataService.getAlerts()];
    const alert = combined.find(a => a.id.toLowerCase() === String(id).toLowerCase());

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found', alertId: id });
    }

    const actualId = alert.id;
    const timestamp = new Date().toISOString();

    // Apply simulated mitigation
    alertOverrides[actualId] = {
      status: 'MITIGATED · SIMULATION',
      mitigationStatus: 'MITIGATION_SIMULATED',
      mitigatedAt: timestamp,
      mitigationActionTaken: 'Simulated mitigation executed. No real network configuration changed.'
    };

    res.json({
      success: true,
      alertId: actualId,
      message: 'Mitigation workflow executed successfully in simulation mode.',
      updatedStatus: 'MITIGATED · SIMULATION',
      alert: { ...alert, ...alertOverrides[actualId] }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to simulate mitigation', message: err.message });
  }
});

// Reset simulated mitigation override for a specific alert
router.post('/:id/reset', (req, res) => {
  try {
    const { id } = req.params;
    const combined = [...liveAlerts, ...dataService.getAlerts()];
    const alert = combined.find(a => a.id.toLowerCase() === String(id).toLowerCase());

    if (alert) {
      delete alertOverrides[alert.id];
    }
    delete alertOverrides[id];

    res.json({
      success: true,
      alertId: id,
      message: 'Incident simulation reset to ACTION REQUIRED.'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset alert', message: err.message });
  }
});

// Batch mitigate all active alerts for a specific enterprise partition
router.post('/mitigate-enterprise/:enterpriseId', (req, res) => {
  try {
    const { enterpriseId } = req.params;
    const raw = String(enterpriseId || '').toUpperCase();
    const match = raw.match(/([1-5])/);
    const targetDigit = match ? match[1] : '1';

    const combined = [...liveAlerts, ...dataService.getAlerts()];
    const timestamp = new Date().toISOString();
    const mitigatedAlerts = [];

    combined.forEach(a => {
      const entStr = String(a.enterpriseId || a.enterpriseName || '').toUpperCase();
      const entMatch = entStr.match(/([1-5])/);
      if (entMatch && entMatch[1] === targetDigit) {
        alertOverrides[a.id] = {
          status: 'MITIGATED · SIMULATION',
          mitigationStatus: 'MITIGATION_SIMULATED',
          mitigatedAt: timestamp,
          mitigationActionTaken: `Simulated mitigation executed for Enterprise ${targetDigit}. No real network configuration changed.`
        };
        mitigatedAlerts.push({ ...a, ...alertOverrides[a.id] });
      }
    });

    res.json({
      success: true,
      enterpriseId: `E${targetDigit}`,
      count: mitigatedAlerts.length,
      message: `All alerts for Enterprise ${targetDigit} mitigated in simulation mode.`,
      mitigatedAlerts
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mitigate enterprise alerts', message: err.message });
  }
});

module.exports = router;
