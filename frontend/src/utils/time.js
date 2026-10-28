/**
 * SENTINEL-FL Time & Date Normalization Utility
 * 
 * Provides robust, timezone-aware date parsing and formatting across all
 * browser environments (including Safari/WebKit and mobile browsers)
 * when connected to cloud or distributed server backends.
 */

/**
 * Robustly parses a timestamp into a valid JavaScript Date instance.
 * Handles:
 * - Date instances
 * - Numeric epochs in milliseconds or seconds
 * - Numeric epoch strings ("1730132371000", "1730132371")
 * - Space-separated strings ("2026-10-28 17:05:22") which break Safari/WebKit
 * - ISO strings without timezone offsets (appends 'Z' to treat as UTC)
 * - ISO strings with Python-style timezone offsets (+00:00)
 * 
 * @param {string|number|Date|null|undefined} ts 
 * @returns {Date|null} Valid Date object or null if unparseable
 */
export function parseDate(ts) {
  if (ts === null || ts === undefined || ts === '') {
    return null;
  }

  if (ts instanceof Date) {
    return isNaN(ts.getTime()) ? null : ts;
  }

  if (typeof ts === 'number') {
    if (isNaN(ts)) return null;
    // If timestamp is in seconds (< 1e11 corresponds to Nov 1973 if ms, or > 2001 if sec), scale to ms
    const ms = ts < 1e11 ? ts * 1000 : ts;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof ts === 'string') {
    const trimmed = ts.trim();
    if (!trimmed) return null;

    // Check for purely numeric string (epoch)
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      const num = parseFloat(trimmed);
      const ms = num < 1e11 ? num * 1000 : num;
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }

    // Replace space between date and time with 'T' for WebKit / Safari compatibility
    let norm = trimmed.replace(' ', 'T');

    // If string matches YYYY-MM-DDTHH:mm:ss(.sss) with no trailing timezone ('Z', '+', or '-'),
    // assume server UTC and append 'Z' so client browsers don't incorrectly interpret as local time
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(norm)) {
      norm += 'Z';
    }

    const d = new Date(norm);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

/**
 * Returns the short abbreviation for the client's local timezone (e.g., "IST", "EDT", "PST", "GMT+5:30").
 */
export function getClientTimeZoneAbbr() {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZoneName: 'short'
    }).formatToParts(new Date());
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    if (tzPart && tzPart.value) {
      return tzPart.value;
    }
  } catch (e) {
    // Fallback if Intl.DateTimeFormat parts fails
  }

  const offset = -new Date().getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const pad = (n) => String(Math.abs(n)).padStart(2, '0');
  const hours = pad(Math.floor(Math.abs(offset) / 60));
  const mins = pad(Math.abs(offset) % 60);
  return `UTC${sign}${hours}:${mins}`;
}

/**
 * Returns the full IANA name of the client's local timezone (e.g., "Asia/Kolkata", "America/New_York").
 */
export function getClientTimeZoneName() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (e) {
    return 'UTC';
  }
}

/**
 * Formats an event timestamp into standard client local time (HH:mm:ss).
 * 
 * @param {string|number|Date} timestamp 
 * @returns {string} e.g. "17:05:22" or "—"
 */
export function formatEventTime(timestamp) {
  const d = parseDate(timestamp);
  if (!d) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Formats an event timestamp into standard client local date and time (YYYY-MM-DD HH:mm:ss).
 * 
 * @param {string|number|Date} timestamp 
 * @param {boolean} includeTz Whether to append the local timezone code
 * @returns {string} e.g. "2026-10-28 17:05:22" or "—"
 */
export function formatFullDateTime(timestamp, includeTz = false) {
  const d = parseDate(timestamp);
  if (!d) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const min = pad(d.getMinutes());
  const s = pad(d.getSeconds());
  const base = `${y}-${m}-${day} ${h}:${min}:${s}`;
  if (includeTz) {
    return `${base} (${getClientTimeZoneAbbr()})`;
  }
  return base;
}

/**
 * Formats relative elapsed time from an event to reference time (defaults to now).
 * Gracefully handles clock skew where event time is slightly ahead of client time.
 * 
 * @param {string|number|Date} timestamp 
 * @param {number} [referenceNow] Reference timestamp in ms (defaults to Date.now())
 * @returns {string} e.g. "Just now", "12s ago", "4m ago", "1h ago"
 */
export function formatRelativeTime(timestamp, referenceNow = Date.now()) {
  const d = parseDate(timestamp);
  if (!d) return '—';
  const diffMs = referenceNow - d.getTime();
  if (diffMs < 3000) return 'Just now';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

/**
 * Formats local clock timestamp for live dashboard header display.
 * 
 * @param {Date} [now] 
 * @returns {string} YYYY-MM-DD HH:mm:ss
 */
export function formatLocalClock(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const h = pad(now.getHours());
  const min = pad(now.getMinutes());
  const s = pad(now.getSeconds());
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
}

