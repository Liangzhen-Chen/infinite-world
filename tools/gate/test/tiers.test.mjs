import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadThresholdMs, medianPassMs, splitTiers, slowFiles, DEFAULT_THRESHOLD_MS } from '../tiers.mjs';
import { nextMarker } from '../slow-sweep.mjs';

const runs = (...ms) => ms.map(durationMs => ({ durationMs, status: 'PASS' }));
const history = { runs: {
  'tests/fast.test.mjs': runs(900, 1200), 'tests/slow.test.mjs': runs(90000, 120000, 100000),
  'tests/edge.test.mjs': runs(60000), 'tests/outlier.test.mjs': runs(1000, 2000, 300000),
  'tests/failonly.test.mjs': [{ durationMs: 999999, status: 'FAIL' }] } };
const tests = Object.keys(history.runs).concat('tests/new.test.mjs');

test('median PASS duration ignores non-PASS samples', () => {
  assert.equal(medianPassMs(history, 'tests/slow.test.mjs'), 100000);
  assert.equal(medianPassMs(history, 'tests/outlier.test.mjs'), 2000);
  assert.equal(medianPassMs(history, 'tests/failonly.test.mjs'), null);
});

test('threshold splits fast from slow; at-threshold is slow, an outlier does not move the median', () => {
  const { fast, slow } = splitTiers({ tests, history, thresholdMs: 60000 });
  assert.deepEqual(slow, ['tests/slow.test.mjs', 'tests/edge.test.mjs']);
  assert.ok(fast.includes('tests/fast.test.mjs') && fast.includes('tests/outlier.test.mjs'));
});

test('files without usable history stay in the fast tier', () => {
  const { fast } = splitTiers({ tests, history, thresholdMs: 60000 });
  assert.ok(fast.includes('tests/new.test.mjs') && fast.includes('tests/failonly.test.mjs'));
});

test('card-required slow files (changed tests, CORE) run in the fast tier', () => {
  const { fast, slow } = splitTiers({ tests, required: ['tests/slow.test.mjs'], history, thresholdMs: 60000 });
  assert.ok(fast.includes('tests/slow.test.mjs'));
  assert.deepEqual(slow, ['tests/edge.test.mjs']);
});

test('policy override changes the threshold; bad policy falls back to the default', () => {
  const dir = fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), 'tiers-'));
  try {
    const file = path.join(dir, 'tiers.json');
    fs.writeFileSync(file, JSON.stringify({ slowThresholdMs: 1500 }));
    assert.equal(loadThresholdMs(file), 1500);
    const { slow } = splitTiers({ tests, history, thresholdMs: loadThresholdMs(file) });
    assert.ok(slow.includes('tests/outlier.test.mjs') && slow.includes('tests/slow.test.mjs'));
    assert.ok(!slow.includes('tests/fast.test.mjs'));
    assert.ok(splitTiers({ tests, history, thresholdMs: 1000 }).slow.includes('tests/fast.test.mjs'));
    fs.writeFileSync(file, '{nope');
    assert.equal(loadThresholdMs(file), DEFAULT_THRESHOLD_MS);
    assert.equal(loadThresholdMs(path.join(dir, 'missing.json')), DEFAULT_THRESHOLD_MS);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('shipped policy/tiers.json parses to 60s', () => {
  assert.equal(loadThresholdMs(new URL('../policy/tiers.json', import.meta.url)), 60000);
});

test('slowFiles lists the sweep universe and honours the exists filter', () => {
  assert.deepEqual(slowFiles(history, 60000), ['tests/edge.test.mjs', 'tests/slow.test.mjs']);
  assert.deepEqual(slowFiles(history, 60000, f => f !== 'tests/edge.test.mjs'), ['tests/slow.test.mjs']);
});

test('sweep marker: lastGood moves only on PASS', () => {
  const a = nextMarker(null, { sha: 'aaa', status: 'PASS', at: 't1' });
  assert.equal(a.lastGood.sha, 'aaa');
  const b = nextMarker(a, { sha: 'bbb', status: 'FAIL', failing: ['x'], at: 't2' });
  assert.equal(b.lastGood.sha, 'aaa');
  assert.deepEqual(b.last.failing, ['x']);
  assert.equal(nextMarker(null, { sha: 'c', status: 'FAIL', at: 't' }).lastGood, null);
});
