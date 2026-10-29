import {
  normalizeEnterpriseId,
  isAlertActive,
  isAlertMitigated,
  isAlertResolved,
  getEnterpriseSecurityState
} from '../frontend/src/services/api.js';

async function diagnose() {
  const res = await fetch('http://localhost:5000/api/alerts');
  const data = await res.json();
  const alerts = data.alerts;

  console.log('Total alerts fetched from server:', alerts.length);

  ['E1', 'E2', 'E3', 'E4', 'E5'].forEach(ent => {
    const sec = getEnterpriseSecurityState(ent, alerts, false);
    console.log(`Enterprise ${ent}: status = ${sec.status}, health = ${sec.health}, activeCount = ${sec.activeAlertsCount}, mitCount = ${sec.mitigatedAlertsCount}, resCount = ${sec.resolvedAlertsCount}`);
  });
}

diagnose().catch(console.error);

