const express = require('express');
const router = express.Router();
const dataService = require('../services/dataService');
const mlService = require('../services/mlService');

let alertOverrides = {};
const liveAlerts = [];

// Register real-time alert listener from PyTorch live inference
mlService.onAlertGenerated = (event) => {
  const alertId = `ALT-${(event.event_id || 'LIVE-' + Date.now()).replace('FLOW-', '')}`;
  let isoTime;
  try {
    isoTime = event.timestamp ? new Date(event.timestamp).toISOString() : new Date().toISOString();
  } catch (e) {
    isoTime = new Date().toISOString();
  }

  const entNum = String(event.enterprise_id || 'E1').replace(/\D/g, '') || '1';

  const newAlert = {
    id: alertId,
    timestamp: isoTime,
    enterpriseId: `enterprise_${entNum}`,
    enterpriseName: event.enterprise_name || `Enterprise ${entNum}`,
    threatType: event.prediction,
    category: `Model Detected Vector (${event.prediction})`,
    severity: event.severity || 'HIGH',
    confidence: event.confidence || 0.90,
    status: 'ACTION REQUIRED',
    mitigationStatus: 'ACTION_REQUIRED',
    tier: 'Tier 1 (Global 12-Class Head)',
    groundTruth: event.ground_truth_label || event.ground_truth_evaluation_only,
    trafficMetrics: {
      flowDuration: 1204892,
      packetRate: 14820.4,
      byteRate: 18920400,
      avgPacketSize: 1276.5
    },
    recommendedResponse: [
      `Enforce flow rate limits on Enterprise ${entNum}`,
      `Filter anomalous ${event.prediction} ingress signatures`,
      'Deploy 50-shot exemplar defense on edge buffer'
    ],
    isSimulated: true
  };

  // Prepend
  liveAlerts.unshift(newAlert);
  if (liveAlerts.length > 50) {
    liveAlerts.pop();
  }
};

// Register history clear listener to remove generated live alerts
mlService.onHistoryCleared = () => {
  liveAlerts.length = 0;
  alertOverrides = {};
  console.log('[Alerts] Live simulated alerts and overrides cleared.');
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

// Simulate Mitigation for an individual incident
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
      ...(alertOverrides[actualId] || {}),
      status: 'MITIGATED · SIMULATION',
      mitigationStatus: 'SIMULATED',
      mitigatedAt: timestamp,
      mitigationActionTaken: 'Simulated mitigation executed. 50-shot exemplar filter & rate limiting deployed (simulation only; no real network changes).'
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

// Unblock / Restore an individual incident (marks incident as RESOLVED)
router.post(['/:id/restore', '/:id/unblock'], (req, res) => {
  try {
    const { id } = req.params;
    const combined = [...liveAlerts, ...dataService.getAlerts()];
    const alert = combined.find(a => a.id.toLowerCase() === String(id).toLowerCase());

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found', alertId: id });
    }

    const actualId = alert.id;
    const timestamp = new Date().toISOString();

    // Mark incident as RESOLVED. Keep previous mitigatedAt for historical auditing
    const prevOverride = alertOverrides[actualId] || {};
    alertOverrides[actualId] = {
      ...prevOverride,
      status: 'RESOLVED',
      mitigationStatus: 'RESTORED',
      resolvedAt: timestamp,
      resolutionActionTaken: 'Incident resolved. Ingress unblocked and restored in simulation.'
    };

    res.json({
      success: true,
      alertId: actualId,
      message: 'Incident resolved. Traffic unblocked in simulation.',
      updatedStatus: 'RESOLVED',
      alert: { ...alert, ...alertOverrides[actualId] }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to restore alert', message: err.message });
  }
});

// Reset simulated mitigation override for a specific alert back to ACTION REQUIRED
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
        // Only mitigate if not already resolved
        const currentOverride = alertOverrides[a.id];
        const isResolved = (currentOverride?.status === 'RESOLVED') || (a.status === 'RESOLVED');
        if (!isResolved) {
          alertOverrides[a.id] = {
            ...(alertOverrides[a.id] || {}),
            status: 'MITIGATED · SIMULATION',
            mitigationStatus: 'SIMULATED',
            mitigatedAt: timestamp,
            mitigationActionTaken: `Simulated mitigation executed for Enterprise ${targetDigit}. No real network configuration changed.`
          };
          mitigatedAlerts.push({ ...a, ...alertOverrides[a.id] });
        }
      }
    });

    res.json({
      success: true,
      enterpriseId: `E${targetDigit}`,
      count: mitigatedAlerts.length,
      message: `Active alerts for Enterprise ${targetDigit} mitigated in simulation mode.`,
      mitigatedAlerts
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mitigate enterprise alerts', message: err.message });
  }
});

// Batch restore / unblock all alerts for a specific enterprise partition
router.post(['/restore-enterprise/:enterpriseId', '/unblock-enterprise/:enterpriseId'], (req, res) => {
  try {
    const { enterpriseId } = req.params;
    const raw = String(enterpriseId || '').toUpperCase();
    const match = raw.match(/([1-5])/);
    const targetDigit = match ? match[1] : '1';

    const combined = [...liveAlerts, ...dataService.getAlerts()];
    const timestamp = new Date().toISOString();
    const restoredAlerts = [];

    combined.forEach(a => {
      const entStr = String(a.enterpriseId || a.enterpriseName || '').toUpperCase();
      const entMatch = entStr.match(/([1-5])/);
      if (entMatch && entMatch[1] === targetDigit) {
        const prevOverride = alertOverrides[a.id] || {};
        alertOverrides[a.id] = {
          ...prevOverride,
          status: 'RESOLVED',
          mitigationStatus: 'RESTORED',
          resolvedAt: timestamp,
          resolutionActionTaken: `Incident resolved for Enterprise ${targetDigit}. Traffic unblocked in simulation.`
        };
        restoredAlerts.push({ ...a, ...alertOverrides[a.id] });
      }
    });

    res.json({
      success: true,
      enterpriseId: `E${targetDigit}`,
      count: restoredAlerts.length,
      message: `All alerts for Enterprise ${targetDigit} restored and resolved.`,
      restoredAlerts
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to restore enterprise alerts', message: err.message });
  }
});

// Reset all alert overrides (clean baseline)
router.post('/reset-all', (req, res) => {
  try {
    alertOverrides = {};
    liveAlerts.length = 0;
    res.json({
      success: true,
      message: 'All alert overrides and live alerts cleared to default.'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset all alerts', message: err.message });
  }
});

// Test injection endpoint to support exact testing scenarios (e.g. Test 1 to 10)
router.post('/test-inject', (req, res) => {
  try {
    const { enterpriseId, prediction, groundTruth, confidence, severity } = req.body;
    const match = String(enterpriseId || 'E1').match(/([1-5])/);
    const num = match ? match[1] : '1';
    const entId = `E${num}`;
    const pred = prediction || 'BENIGN';
    const gt = groundTruth || pred;

    const event = {
      event_id: `FLOW-TEST-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      enterprise_id: entId,
      enterprise_name: `Enterprise ${num} (${entId})`,
      prediction: pred,
      ground_truth_label: gt,
      ground_truth_evaluation_only: gt,
      confidence: confidence || 0.92,
      severity: severity || (pred === 'BENIGN' ? 'LOW' : 'HIGH'),
      correct: pred === gt
    };

    // Record the test event in mlService: this automatically adds it to recentEvents,
    // updates session metrics, and triggers mlService.onAlertGenerated if pred !== 'BENIGN'
    mlService._recordEvent(event);

    res.json({
      success: true,
      message: `Injected test flow for ${entId}`,
      event,
      isAttackDetected: pred !== 'BENIGN',
      classificationCorrect: pred === gt
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to inject test event', message: err.message });
  }
});

module.exports = router;
