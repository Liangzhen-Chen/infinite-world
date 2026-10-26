// Two-tier split by measured duration (DESIGN §14). Pure helpers shared by card-gate.mjs and slow-sweep.mjs.
// Slow tier = history median PASS duration >= threshold. No history, or a card-required file => fast tier.
import fs from 'node:fs';

export const DEFAULT_THRESHOLD_MS = 60000;

export function loadThresholdMs(file) {
  try {
    const value = Number(JSON.parse(fs.readFileSync(file, 'utf8')).slowThresholdMs);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_THRESHOLD_MS;
  } catch { return DEFAULT_THRESHOLD_MS; }
}

export function medianPassMs(history, file) {
  const samples = (history?.runs?.[file] || []).filter(r => r.status === 'PASS' && r.durationMs > 0).map(r => r.durationMs).sort((a, b) => a - b);
  if (!samples.length) return null;
  const mid = samples.length >> 1;
  return samples.length % 2 ? samples[mid] : (samples[mid - 1] + samples[mid]) / 2;
}

export const isSlow = (history, file, thresholdMs = DEFAULT_THRESHOLD_MS) => (medianPassMs(history, file) ?? -1) >= thresholdMs;

// required: files that always run (changed tests, CORE) whatever their history says.
export function splitTiers({ tests, required = [], history, thresholdMs = DEFAULT_THRESHOLD_MS }) {
  const must = new Set(required), fast = [], slow = [];
  for (const file of tests) (must.has(file) || !isSlow(history, file, thresholdMs) ? fast : slow).push(file);
  return { fast, slow };
}

// Every history file at/over the threshold (the slow sweep's universe), filtered by `exists`.
export function slowFiles(history, thresholdMs = DEFAULT_THRESHOLD_MS, exists = () => true) {
  return Object.keys(history?.runs || {}).filter(f => isSlow(history, f, thresholdMs) && exists(f)).sort();
}
