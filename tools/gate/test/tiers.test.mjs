import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadAlwaysFast, loadStaticSlow, loadThresholdMs, medianPassMs, splitTiers, slowFiles, DEFAULT_THRESHOLD_MS } from '../tiers.mjs';
import { nextMarker } from '../slow-sweep.mjs';

const runs = (...ms) => ms.map(durationMs => ({ durationMs, status: 'PASS' }));
const history = { runs: {
  'tests/fast.test.mjs': runs(900, 1200), 'tests/slow.test.mjs': runs(90000, 120000, 100000),
  'tests/edge.test.mjs': runs(60000), 'tests/outlier.test.mjs': runs(1000, 2000, 300000) } };
const tests = Object.keys(history.runs).concat('tests/new.test.mjs');

test('median PASS duration ignores non-PASS samples', () => {
  assert.equal(medianPassMs(history, 'tests/slow.test.mjs'), 100000);
  assert.equal(medianPassMs(history, 'tests/outlier.test.mjs'), 2000);
  assert.equal(medianPassMs({ runs: { f: [{ durationMs: 9, status: 'FAIL' }] } }, 'f'), null);
});

test('threshold splits fast from slow; at-threshold is slow, an outlier does not move the median', () => {
  const { fast, slow } = splitTiers({ tests, history, thresholdMs: 60000 });
  assert.deepEqual(slow, ['tests/slow.test.mjs', 'tests/edge.test.mjs']);
  assert.ok(fast.includes('tests/fast.test.mjs') && fast.includes('tests/outlier.test.mjs'));
});

test('only files with no history at all stay fast; TIMEOUT or a long FAIL is slow, quick FAIL/INCOMPLETE is not', () => {
  const h = { runs: { ...history.runs, 'tests/failonly.test.mjs': [{ durationMs: 900, status: 'FAIL' }], 'tests/longfail.test.mjs': [{ durationMs: 999999, status: 'FAIL' }], 'tests/cancelled.test.mjs': [{ durationMs: 999999, status: 'INCOMPLETE' }], 'tests/timeout.test.mjs': [{ durationMs: 900000, status: 'TIMEOUT' }] } };
  const { fast, slow } = splitTiers({ tests: Object.keys(h.runs).concat('tests/new.test.mjs'), history: h, thresholdMs: 60000 });
  assert.ok(fast.includes('tests/new.test.mjs'));
  assert.ok(slow.includes('tests/timeout.test.mjs') && slow.includes('tests/longfail.test.mjs'));
  assert.ok(fast.includes('tests/failonly.test.mjs'), 'a quick FAIL is a failing file, not a slow one');
  assert.ok(fast.includes('tests/cancelled.test.mjs'), 'INCOMPLETE samples are no slowness evidence');
  assert.ok(slowFiles(h, 60000).includes('tests/timeout.test.mjs'));
});

test('alwaysFast regexes keep matching files in the fast tier like required; shipped policy covers s5 tests', () => {
  const h = { runs: { 'tests/s5-12.test.mjs': runs(200000), 'tests/s6-1.test.mjs': runs(200000), 'tests/s5-x.test.mjs': runs(200000) } };
  const alwaysFast = loadAlwaysFast(new URL('../policy/tiers.json', import.meta.url));
  const { fast, slow } = splitTiers({ tests: Object.keys(h.runs), alwaysFast, history: h, thresholdMs: 60000 });
  assert.deepEqual(fast, ['tests/s5-12.test.mjs']);
  assert.deepEqual(slow, ['tests/s6-1.test.mjs', 'tests/s5-x.test.mjs']);
  assert.deepEqual(splitTiers({ tests: ['tests/a.test.mjs'], alwaysFast: ['('], history: { runs: { 'tests/a.test.mjs': runs(200000) } } }).slow, ['tests/a.test.mjs']);
  assert.equal(loadAlwaysFast('/nonexistent/x.json').length, 1);
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

test('static slow list is unioned with the history-derived tier in both gate and sweep', () => {
  const staticSlow = ['tests/fast.test.mjs', 'tests/listed-no-history.test.mjs'];
  const { fast, slow } = splitTiers({ tests: tests.concat('tests/listed-no-history.test.mjs'), history, thresholdMs: 60000, staticSlow });
  assert.ok(slow.includes('tests/fast.test.mjs') && slow.includes('tests/listed-no-history.test.mjs') && slow.includes('tests/slow.test.mjs'));
  assert.ok(!fast.includes('tests/fast.test.mjs'));
  assert.deepEqual(splitTiers({ tests, required: ['tests/fast.test.mjs'], history, staticSlow }).fast.includes('tests/fast.test.mjs'), true);
  assert.deepEqual(slowFiles(history, 60000, () => true, staticSlow), ['tests/edge.test.mjs', 'tests/fast.test.mjs', 'tests/listed-no-history.test.mjs', 'tests/slow.test.mjs']);
  assert.ok(loadStaticSlow(new URL('../slow-tests.tsv', import.meta.url)).length >= 15);
  assert.deepEqual(loadStaticSlow('/nonexistent/x.tsv'), []);
});

test('sweep marker: lastGood moves only on PASS', () => {
  const a = nextMarker(null, { sha: 'aaa', status: 'PASS', at: 't1' });
  assert.equal(a.lastGood.sha, 'aaa');
  const b = nextMarker(a, { sha: 'bbb', status: 'FAIL', failing: ['x'], at: 't2' });
  assert.equal(b.lastGood.sha, 'aaa');
  assert.deepEqual(b.last.failing, ['x']);
  assert.equal(nextMarker(null, { sha: 'c', status: 'FAIL', at: 't' }).lastGood, null);
});
