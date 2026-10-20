import { AD_LIMITS, placementLimits } from './config';

// Frequency caps. Per-day counts and the last show time persist in
// localStorage; per-session counts live in memory. Only successful shows count.
const KEY = 'fb.ads.caps.v1';

let sessionCounts = {};
let lastShownThisSession = 0;

function storage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function today(now) {
  const date = new Date(now);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function read() {
  try {
    const parsed = JSON.parse(storage()?.getItem(KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function write(state) {
  try {
    storage()?.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private mode or a full quota: caps fall back to this session only.
  }
}

// Returns '' when the placement may show now, or the reason it may not.
export function capReason(placement, now = Date.now()) {
  const limits = placementLimits(placement);
  if ((sessionCounts[placement] || 0) >= limits.maxPerSession) return 'capped';
  const state = read();
  const day = state.day === today(now) ? state.counts || {} : {};
  if ((day[placement] || 0) >= limits.maxPerDay) return 'capped';
  // The in-memory time keeps the interval working when storage is unavailable.
  const last = Math.max(Number(state.lastShownAt) || 0, lastShownThisSession);
  if (last && now - last < AD_LIMITS.minIntervalMs) return 'interval';
  return '';
}

export function recordShow(placement, now = Date.now()) {
  sessionCounts = { ...sessionCounts, [placement]: (sessionCounts[placement] || 0) + 1 };
  lastShownThisSession = now;
  const state = read();
  const counts = state.day === today(now) ? { ...(state.counts || {}) } : {};
  counts[placement] = (counts[placement] || 0) + 1;
  write({ day: today(now), counts, lastShownAt: now });
}

export function resetCaps() {
  sessionCounts = {};
  lastShownThisSession = 0;
  try {
    storage()?.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
