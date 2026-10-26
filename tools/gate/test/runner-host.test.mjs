// Real-process tests for tools/gate/runner.mjs. Clock thresholds are injected short
// (deadline 3s, grace 0.5s, heartbeat 1s); nothing waits for real 5/45 minute limits.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runFile, fileEventSink } from '../runner.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, 'fixtures', 'runner');
const scratch = fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), 'runner-host-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const short = { deadline: 3000, graceMs: 500, heartbeatMs: 1000 };
const go = (name, extra = {}) => runFile({ cwd: fixtures, file: `${name}.fx.mjs`, runId: `host-${name}`, ownerSession: 'host-test', ...short, ...extra });

test('normal pass', async () => {
  const result = await go('pass');
  assert.equal(result.status, 'PASS');
  assert.equal(result.exitCode, 0);
  assert.equal(result.counts.passed >= 2, true);
  assert.equal(result.streamComplete, true);
  assert.deepEqual(result.failures, []);
  assert.ok(result.specTail.some(line => line.includes('suite')));
});

test('normal failure reports the full case path and an assertion fingerprint', async () => {
  const result = await go('fail');
  assert.equal(result.status, 'FAIL');
  assert.equal(result.exitCode, 1);
  assert.equal(result.failures.length, 1);
  const [failure] = result.failures;
  assert.deepEqual(failure.path, ['suite', 'bad']);
  assert.match(failure.location, /fail\.fx\.mjs:\d+:\d+$/);
  assert.match(failure.fingerprint, /^[0-9a-f]{16}$/);
  const again = await go('fail');
  assert.equal(again.failures[0].fingerprint, failure.fingerprint, 'stable across runs');
});

test('startup crash is CRASH, not PASS', async () => {
  const result = await go('crash');
  assert.equal(result.status, 'CRASH');
  assert.equal(result.exitCode, 3);
});

test('import-time exception is a FAIL with a fingerprint', async () => {
  const result = await go('import-error');
  assert.equal(result.status, 'FAIL');
  assert.equal(result.failures.length, 1);
});

test('non-zero exit without any failing case is INCOMPLETE, never PASS', async () => {
  const result = await go('exit-nonzero');
  assert.equal(result.status, 'INCOMPLETE');
  assert.equal(result.exitCode, 5);
});

test('zero cases and unauthorised skips are not PASS', async () => {
  assert.equal((await go('zero')).status, 'INCOMPLETE');
  assert.equal((await go('zero', { allowZeroTests: true })).status, 'PASS');
  assert.equal((await go('skip')).status, 'INCOMPLETE');
  assert.equal((await go('skip', { allowSkip: true })).status, 'PASS');
});

test('a silent hang ends at the deadline; heartbeats flow; an unrelated node process survives', async () => {
  const survivor = spawn(process.execPath, [path.join(fixtures, 'survivor.mjs')], { stdio: 'ignore' });
  try {
    const eventsFile = path.join(scratch, 'hang-events.jsonl');
    const resultFile = path.join(scratch, 'hang-result.json');
    const beats = [];
    const sink = fileEventSink(eventsFile);
    const started = Date.now();
    const result = await go('hang', { resultFile, onEvent: e => { sink(e); if (e.type === 'heartbeat') beats.push(e); } });
    const elapsed = Date.now() - started;
    assert.equal(result.status, 'TIMEOUT');
    assert.equal(result.killed.requested, true);
    assert.ok(elapsed >= 3000 && elapsed < 20000, `elapsed ${elapsed}`);
    assert.ok(beats.length >= 2, `heartbeats: ${beats.length}`);
    assert.equal(beats[0].file, 'hang.fx.mjs');
    assert.ok(beats[0].deadlineAt);
    assert.equal(alive(result.pid), false, 'runner child is gone');
    assert.equal(alive(survivor.pid), true, 'unregistered external node process untouched');
    assert.equal(JSON.parse(fs.readFileSync(resultFile, 'utf8')).status, 'TIMEOUT');
    assert.ok(fs.readFileSync(eventsFile, 'utf8').includes('"type":"end"'));
  } finally { survivor.kill(); }
});

test('an endless output loop is cut off at the deadline and memory stays bounded', async () => {
  const result = await go('flood');
  assert.equal(result.status, 'TIMEOUT');
  assert.equal(alive(result.pid), false);
  assert.ok(result.specTail.length <= 60);
  assert.ok(result.specTail.every(line => line.length <= 400));
});

test('timeout kills the whole child tree of the process it started, and only that', async () => {
  const pidFile = path.join(scratch, 'grandchild.pid');
  const survivor = spawn(process.execPath, [path.join(fixtures, 'survivor.mjs')], { stdio: 'ignore' });
  try {
    const result = await go('hang-tree', { env: { GATE_FX_PIDFILE: pidFile } });
    assert.equal(result.status, 'TIMEOUT');
    assert.equal(result.killed.forced, true, 'request alone does not end a hung Windows console child');
    const grandchild = Number(fs.readFileSync(pidFile, 'utf8'));
    assert.ok(grandchild > 0);
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(alive(grandchild), false, 'grandchild died with the tree');
    assert.equal(alive(survivor.pid), true);
  } finally { survivor.kill(); }
});

// ---- watchdog.ps1 ------------------------------------------------------------------------

const watchdog = path.resolve(here, '..', 'watchdog.ps1');
const runWatchdog = (args, timeout = 30000) => new Promise(resolve => {
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', watchdog, ...args], { stdio: 'ignore', windowsHide: true });
  const timer = setTimeout(() => { child.kill(); resolve({ code: 'test-timeout' }); }, timeout);
  child.once('exit', code => { clearTimeout(timer); resolve({ code }); });
});

test('watchdog: a heartbeat that stops produces one deduplicated alert and a non-zero exit', async () => {
  const hb = path.join(scratch, 'wd-heartbeat.jsonl');
  const alerts = path.join(scratch, 'wd', 'alerts.jsonl');
  fs.writeFileSync(hb, '');
  const keepAlive = setInterval(() => fs.appendFileSync(hb, 'beat\n'), 200);
  setTimeout(() => clearInterval(keepAlive), 1500);
  const started = Date.now();
  const first = await runWatchdog(['-HeartbeatFile', hb, '-AlertsFile', alerts, '-RunId', 'wd1', '-IntervalSec', '0.3', '-StaleSec', '1.5']);
  assert.equal(first.code, 2);
  assert.ok(Date.now() - started >= 2500, 'did not alert while heartbeats were flowing');
  const lines = fs.readFileSync(alerts, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].runId, 'wd1');
  assert.equal(lines[0].type, 'HEARTBEAT_LOST');
  const second = await runWatchdog(['-HeartbeatFile', hb, '-AlertsFile', alerts, '-RunId', 'wd1', '-IntervalSec', '0.3', '-StaleSec', '1']);
  assert.equal(second.code, 2, 'still exits non-zero');
  assert.equal(fs.readFileSync(alerts, 'utf8').trim().split('\n').length, 1, 'same runId+type is not duplicated');
  const other = await runWatchdog(['-HeartbeatFile', hb, '-AlertsFile', alerts, '-RunId', 'wd2', '-IntervalSec', '0.3', '-StaleSec', '1']);
  assert.equal(other.code, 2);
  assert.equal(fs.readFileSync(alerts, 'utf8').trim().split('\n').length, 2, 'another run gets its own alert');
});

test('watchdog: live heartbeats and a stop file exit 0 without alerts', async () => {
  const hb = path.join(scratch, 'wd-live.jsonl');
  const alerts = path.join(scratch, 'wd-live-alerts.jsonl');
  fs.writeFileSync(hb, '');
  const keepAlive = setInterval(() => fs.appendFileSync(hb, 'beat\n'), 200);
  try {
    const live = await runWatchdog(['-HeartbeatFile', hb, '-AlertsFile', alerts, '-RunId', 'live', '-IntervalSec', '0.3', '-StaleSec', '2', '-MaxChecks', '6']);
    assert.equal(live.code, 0);
  } finally { clearInterval(keepAlive); }
  const stop = path.join(scratch, 'stop');
  fs.writeFileSync(stop, '');
  assert.equal((await runWatchdog(['-HeartbeatFile', path.join(scratch, 'missing'), '-AlertsFile', alerts, '-RunId', 'live', '-StopFile', stop])).code, 0);
  assert.equal(fs.existsSync(alerts), false);
});
