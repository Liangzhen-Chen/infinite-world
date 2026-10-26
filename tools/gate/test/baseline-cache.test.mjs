import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { toolFingerprint, cacheable, mergeBaseline, readCached, splitCached, writeCached } from '../baseline-cache.mjs';

const root = fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), 'bcache-'));
after(() => fs.rmSync(root, { recursive: true, force: true }));
const res = (file, status = 'PASS', extra = {}) => ({ file, status, runId: 'run-1', counts: { passed: 3, failed: status === 'FAIL' ? 1 : 0 }, failures: [], ...extra });

test('hit after write keeps full detail; other base SHA or file misses', () => {
  assert.ok(writeCached(root, 'aaa', res('tests/a.test.mjs', 'FAIL', { failures: [{ id: 'x' }] })));
  assert.deepEqual(readCached(root, 'aaa', 'tests/a.test.mjs').failures, [{ id: 'x' }]);
  assert.equal(readCached(root, 'bbb', 'tests/a.test.mjs'), null, 'new base = new cache');
  assert.equal(readCached(root, 'aaa', 'tests/b.test.mjs'), null);
});

test('deferred-only results (pre-existing todo/skip) are cached with their evidence; tool fingerprint is stable and keys the entry', () => {
  const d = res('tests/d.test.mjs', 'INCOMPLETE', { reason: 'unauthorised skip/todo', exitCode: 0, streamComplete: true, badEventLines: 0,
    deferred: [{ id: 's > later', path: ['s', 'later'], kind: 'todo' }], counts: { tests: 2, passed: 1, failed: 0, cancelled: 0, skipped: 0, todo: 1 } });
  assert.ok(writeCached(root, 'ddd', d));
  assert.equal(readCached(root, 'ddd', 'tests/d.test.mjs').deferred.length, 1);
  assert.equal(writeCached(root, 'ddd', { ...d, file: 'tests/e.test.mjs', deferred: [] }), false);
  assert.equal(toolFingerprint(), toolFingerprint());
  const dir = path.join(root, 'baseline-cache', 'ddd');
  const entry = path.join(dir, fs.readdirSync(dir)[0]);
  fs.writeFileSync(entry, JSON.stringify({ ...JSON.parse(fs.readFileSync(entry, 'utf8')), fingerprint: 'other-tool' }));
  assert.equal(readCached(root, 'ddd', 'tests/d.test.mjs'), null, 'different tool/node fingerprint misses');
});

test('only terminal PASS/FAIL with runner detail is cached', () => {
  for (const status of ['INCOMPLETE', 'TIMEOUT', 'CRASH']) assert.equal(writeCached(root, 'aaa', res('tests/t.test.mjs', status)), false);
  assert.equal(writeCached(root, 'aaa', { file: 'tests/t.test.mjs', status: 'PASS' }), false, 'summary without detail');
  assert.equal(readCached(root, 'aaa', 'tests/t.test.mjs'), null);
  assert.equal(cacheable(null), false);
});

test('splitCached/mergeBaseline: hits supply run 1; a fresh -Rerun is a different run id', () => {
  writeCached(root, 'ccc', res('tests/h.test.mjs'));
  const files = ['tests/h.test.mjs', 'tests/m.test.mjs'];
  const { hits, misses } = splitCached(root, 'ccc', files);
  assert.deepEqual(misses, ['tests/m.test.mjs']);
  const first = mergeBaseline('ccc', files, hits, { status: 'PASS', runId: 'baseline-fresh', files: [res('tests/m.test.mjs', 'PASS', { runId: 'baseline-fresh' })] });
  assert.deepEqual(first.files.map(f => f.file), files);
  assert.deepEqual(first.cached, ['tests/h.test.mjs']);
  const allHit = mergeBaseline('ccc', ['tests/h.test.mjs'], hits, null);
  assert.equal(allHit.runId, 'cache-ccc');
  assert.notEqual(allHit.runId, 'baseline-rerun');
  assert.equal(mergeBaseline('ccc', ['tests/h.test.mjs'], [res('tests/h.test.mjs', 'FAIL')], null).status, 'FAIL');
});

test('card-gate uses the cache for the first baseline run only; the -Rerun stays fresh', () => {
  const src = fs.readFileSync(new URL('../card-gate.mjs', import.meta.url), 'utf8');
  assert.equal((src.match(/splitCached\(/g) || []).length, 1);
  assert.match(src, /splitCached\(ROOT, baseSHA, firstBaselineFiles\)/);
  assert.match(src, /runJob\('baseline', rerun, \['-Base', baseSHA, '-Rerun'\]\)/);
});
