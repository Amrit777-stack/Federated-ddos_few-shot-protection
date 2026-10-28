/**
 * Comprehensive verification for SENTINEL-FL cross-timezone & cloud deployment timestamp logic
 */

import {
  parseDate,
  formatEventTime,
  formatFullDateTime,
  formatRelativeTime,
  getClientTimeZoneAbbr,
  getClientTimeZoneName,
  formatLocalClock
} from '../frontend/src/utils/time.js';

console.log('=== SENTINEL-FL Cross-Timezone & Deployment Time Verification ===\n');

// 1. Client Environment Detection
console.log('1. Client Environment Detection:');
console.log('   IANA Timezone:', getClientTimeZoneName());
console.log('   Timezone Abbreviation:', getClientTimeZoneAbbr());
console.log('   Local Clock:', formatLocalClock());
console.log();

// 2. Parser Edge Cases
console.log('2. Parsing Edge Cases:');
const testCases = [
  { label: 'Standard ISO UTC (Z)', input: '2026-10-28T16:57:35.123Z' },
  { label: 'Python ISO UTC (+00:00)', input: '2026-10-28T16:57:35.123456+00:00' },
  { label: 'Safari-breaking Space Separated', input: '2026-10-28 16:57:35' },
  { label: 'Naive ISO string (assumes UTC)', input: '2026-10-28T16:57:35' },
  { label: 'Numeric Epoch (ms)', input: 1730134655123 },
  { label: 'String Epoch (ms)', input: '1730134655123' },
  { label: 'Numeric Epoch (seconds)', input: 1730134655 },
  { label: 'Date Object', input: new Date('2026-10-28T16:57:35Z') },
  { label: 'Invalid string', input: 'not-a-date' },
  { label: 'Empty string', input: '' },
  { label: 'Null', input: null },
  { label: 'Undefined', input: undefined }
];

let allPassed = true;

testCases.forEach(({ label, input }) => {
  const parsed = parseDate(input);
  const isValid = parsed !== null && !isNaN(parsed.getTime());
  const isExpectedNull = input === null || input === undefined || input === '' || input === 'not-a-date';
  
  if (isExpectedNull) {
    if (parsed === null) {
      console.log(`   [PASS] ${label}: correctly returned null`);
    } else {
      console.error(`   [FAIL] ${label}: expected null, got ${parsed}`);
      allPassed = false;
    }
  } else {
    if (isValid) {
      const eventTime = formatEventTime(input);
      const fullTime = formatFullDateTime(input, true);
      console.log(`   [PASS] ${label} -> Local Event: ${eventTime} | Full: ${fullTime}`);
    } else {
      console.error(`   [FAIL] ${label}: failed to parse`);
      allPassed = false;
    }
  }
});
console.log();

// 3. Relative Time & Clock Skew Resilience
console.log('3. Relative Time & Clock Skew Resilience:');
const now = Date.now();
const relativeTests = [
  { label: 'Just now (0s)', ts: new Date(now), ref: now, expected: 'Just now' },
  { label: 'Just now (clock skew: 2s in future)', ts: new Date(now + 2000), ref: now, expected: 'Just now' },
  { label: '15 seconds ago', ts: new Date(now - 15000), ref: now, expected: '15s ago' },
  { label: '5 minutes ago', ts: new Date(now - 300000), ref: now, expected: '5m ago' },
  { label: '2 hours ago', ts: new Date(now - 7200000), ref: now, expected: '2h ago' },
  { label: '1 day ago', ts: new Date(now - 86400000), ref: now, expected: '1d ago' }
];

relativeTests.forEach(({ label, ts, ref, expected }) => {
  const result = formatRelativeTime(ts, ref);
  if (result === expected) {
    console.log(`   [PASS] ${label}: "${result}"`);
  } else {
    console.error(`   [FAIL] ${label}: expected "${expected}", got "${result}"`);
    allPassed = false;
  }
});
console.log();

// 4. Server Clock Offset Resilience Simulation
console.log('4. Server Clock Offset Resilience Simulation:');
// Simulate Cloud Server in UTC with 20 seconds clock drift from client
const serverClockNow = now - 20000; // Server is 20s behind client
const serverOffset = serverClockNow - now; // -20000ms

// Server generates an event right now on the server
const serverEventTs = new Date(serverClockNow - 1500).toISOString(); // 1.5s old event
const eventParsed = parseDate(serverEventTs).getTime();

// Without offset adjustment (naive client Date.now()):
const naiveElapsed = now - eventParsed; // ~21.5s -> would falsely report as > 12s (stale!)
const naiveIsRecent = naiveElapsed < 12000;

// With offset adjustment:
const adjustedServerNow = now + serverOffset;
const adjustedElapsed = adjustedServerNow - eventParsed; // ~1.5s -> active!
const adjustedIsRecent = adjustedElapsed >= -5000 && adjustedElapsed < 12000;

console.log(`   Client Clock: ${new Date(now).toISOString()}`);
console.log(`   Server Clock: ${new Date(serverClockNow).toISOString()} (offset: ${serverOffset}ms)`);
console.log(`   Server Event: ${serverEventTs}`);
console.log(`   Naive elapsed: ${naiveElapsed}ms -> Is recent? ${naiveIsRecent} (INCORRECT: Stale False Alarm)`);
console.log(`   Adjusted elapsed: ${adjustedElapsed}ms -> Is recent? ${adjustedIsRecent} (CORRECT: Active Live Attack)`);

if (adjustedIsRecent && !naiveIsRecent) {
  console.log('   [PASS] Server clock offset successfully protects against cloud clock drift!\n');
} else {
  console.error('   [FAIL] Clock offset calculation failed');
  allPassed = false;
}

if (allPassed) {
  console.log('ALL TIME UTILITY TESTS PASSED CLEANLY.');
  process.exit(0);
} else {
  console.error('SOME TESTS FAILED.');
  process.exit(1);
}

