// Two-tier split by measured duration (DESIGN §14). Pure helpers shared by card-gate.mjs and slow-sweep.mjs.
// Slow tier = history median PASS duration >= threshold; without a PASS sample, a TIMEOUT sample or a FAIL sample that
// itself ran >= threshold. INCOMPLETE samples (cancelled/orphaned) and quick FAILs are no slowness evidence.
// No history, a card-required file, or an alwaysFast match => fast tier.
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

// Regex strings (policy alwaysFast) for files that always run in the card gate, like `required`.
export const DEFAULT_ALWAYS_FAST = ['^tests/s5-\\d+\\.test\\.mjs$'];
export function loadAlwaysFast(file) {
  try {
    const list = JSON.parse(fs.readFileSync(file, 'utf8')).alwaysFast;
    return Array.isArray(list) ? list.map(String) : DEFAULT_ALWAYS_FAST;
  } catch { return DEFAULT_ALWAYS_FAST; }
}
export const matchesAny = (patterns, file) => patterns.some(p => { try { return new RegExp(p).test(file); } catch { return false; } });

// Static list (slow-tests.tsv, first column = file) that is always slow; unioned with the history-derived tier.
export function loadStaticSlow(file) {
  try { return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(l => l.split('\t')[0]); } catch { return []; }
}

export const isSlow = (history, file, thresholdMs = DEFAULT_THRESHOLD_MS, staticSlow = []) => {
  if (staticSlow.includes(file)) return true;
  const median = medianPassMs(history, file);
  if (median != null) return median >= thresholdMs;
  return (history?.runs?.[file] || []).some(r => r.status === 'TIMEOUT' || (r.status === 'FAIL' && r.durationMs >= thresholdMs));
};

// required: files that always run (changed tests, CORE) whatever their history says.
export function splitTiers({ tests, required = [], alwaysFast = [], history, thresholdMs = DEFAULT_THRESHOLD_MS, staticSlow = [] }) {
  const must = new Set(required), fast = [], slow = [];
  for (const file of tests) (must.has(file) || matchesAny(alwaysFast, file) || !isSlow(history, file, thresholdMs, staticSlow) ? fast : slow).push(file);
  return { fast, slow };
}

// Every history file at/over the threshold (the slow sweep's universe), filtered by `exists`.
export function slowFiles(history, thresholdMs = DEFAULT_THRESHOLD_MS, exists = () => true, staticSlow = []) {
  return [...new Set([...Object.keys(history?.runs || {}), ...staticSlow])].filter(f => isSlow(history, f, thresholdMs, staticSlow) && exists(f)).sort();
}
