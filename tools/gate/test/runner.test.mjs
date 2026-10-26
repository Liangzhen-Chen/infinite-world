// Pure-logic tests for tools/gate/runner.mjs: terminal classification, failure
// fingerprints, event parsing, and runFile driven by an injected fake process.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { analyzeEvents, classify, failureFingerprint, parseEventLines, runFile } from '../runner.mjs';

const hello = { t: 'hello', v: 1 };
const counts = (o = {}) => ({ tests: 1, failed: 0, passed: 1, cancelled: 0, skipped: 0, todo: 0, ...o });
const summary = c => ({ t: 'summary', success: true, counts: counts(c) });
const start = (name, n = 0, line = 1) => ({ t: 'start', n, name, line, col: 1 });
const pass = (name, n = 0, line = 1, extra = {}) => ({ t: 'pass', n, name, line, col: 1, kind: 'test', ...extra });
const fail = (name, n = 0, line = 1, err = { code: 'ERR_TEST_FAILURE', causeCode: 'ERR_ASSERTION', loc: 'a.test.mjs:3:5', actual: '1', expected: '2' }, kind = 'test') =>
  ({ t: 'fail', n, name, line, col: 1, kind, err });
const okEvents = [hello, start('a'), pass('a'), summary()];
const proc = (o = {}) => ({ exitCode: 0, signal: null, timedOut: false, spawnError: null, ...o });
const verdict = (events, p, o) => classify(analyzeEvents(events), proc(p), o).status;

test('PASS requires exit 0, complete stream, summary and at least one case', () => {
  assert.equal(verdict(okEvents), 'PASS');
  assert.equal(verdict([hello, start('a'), pass('a')]), 'INCOMPLETE', 'no summary');
  assert.equal(verdict([hello, start('a'), summary()]), 'INCOMPLETE', 'case started but never finished');
  assert.equal(verdict([], {}), 'INCOMPLETE', 'no events at all');
  assert.equal(verdict([hello, summary({ tests: 0, passed: 0 })]), 'INCOMPLETE', 'zero cases');
  assert.equal(verdict([hello, summary({ tests: 0, passed: 0 })], {}, { allowZeroTests: true }), 'PASS', 'explicit tool fixture');
  assert.equal(verdict([hello, summary({ cancelled: 1 }), start('a'), pass('a')]), 'INCOMPLETE', 'cancelled');
});

test('a file-level pseudo test (no line) does not count as a case', () => {
  const pseudo = [hello, { t: 'start', n: 0, name: '/x/zero.mjs' }, { t: 'pass', n: 0, name: '/x/zero.mjs', kind: 'test', fileLevel: true }, summary()];
  assert.equal(verdict(pseudo), 'INCOMPLETE');
  const importError = [hello, { t: 'start', n: 0, name: '/x/e.mjs', fileLevel: true }, { t: 'fail', n: 0, name: '/x/e.mjs', kind: 'test', fileLevel: true,
    err: { code: 'ERR_TEST_FAILURE', failureType: 'testCodeFailure', loc: 'e.mjs:1:7' } }, summary({ failed: 1, passed: 0 })];
  assert.equal(verdict(importError, { exitCode: 1 }), 'FAIL');
});

test('exit code, signal, timeout and spawn errors can never be PASS', () => {
  assert.equal(verdict(okEvents, { exitCode: 1 }), 'INCOMPLETE', 'non-zero exit with no failing case');
  assert.equal(verdict(okEvents, { exitCode: null, signal: 'SIGSEGV' }), 'CRASH');
  assert.equal(verdict(okEvents, { timedOut: true }), 'TIMEOUT');
  assert.equal(verdict(okEvents, { spawnError: 'EPERM' }), 'CRASH');
  assert.equal(verdict([hello, start('a')], { exitCode: 3 }), 'CRASH', 'died without a summary');
  assert.equal(verdict([], { exitCode: 3 }), 'INCOMPLETE', 'reporter never loaded');
  assert.equal(verdict([hello, start('a'), fail('a'), summary({ failed: 1, passed: 0 })], { exitCode: 1 }), 'FAIL');
  assert.equal(verdict([hello, start('a'), fail('a'), summary({ failed: 1, passed: 0 })], { exitCode: 0 }), 'FAIL', 'failing case wins even with exit 0');
});

test('skip and todo are INCOMPLETE unless authorised', () => {
  const skipped = [hello, start('a'), pass('a', 0, 1, { skip: true }), summary({ skipped: 1 })];
  assert.equal(verdict(skipped), 'INCOMPLETE');
  assert.equal(verdict(skipped, {}, { allowSkip: true }), 'PASS');
  const todo = [hello, start('a'), pass('a', 0, 1, { todo: true }), summary({ todo: 1 })];
  assert.equal(verdict(todo), 'INCOMPLETE');
});

test('failures carry full suite/case path; failed parent suites are not extra failures', () => {
  const analysis = analyzeEvents([hello, start('S', 0, 1), start('inner', 1, 2), start('bad', 2, 3),
    fail('bad', 2, 3), fail('inner', 1, 2, { code: 'ERR_TEST_FAILURE', failureType: 'subtestsFailed' }, 'suite'),
    fail('S', 0, 1, { code: 'ERR_TEST_FAILURE', failureType: 'subtestsFailed' }, 'suite'), summary({ failed: 1, passed: 0 })]);
  assert.equal(analysis.failures.length, 1);
  assert.deepEqual(analysis.failures[0].path, ['S', 'inner', 'bad']);
  assert.equal(analysis.failures[0].location, 'a.test.mjs:3:5');
  assert.equal(analysis.failures[0].fingerprint, failureFingerprint({ code: 'ERR_TEST_FAILURE', causeCode: 'ERR_ASSERTION', loc: 'a.test.mjs:3:5', actual: '1', expected: '2' }));
});

test('duplicate case names get a sequence number', () => {
  const analysis = analyzeEvents([hello, start('S', 0, 1), start('same', 1, 2), fail('same', 1, 2), start('same', 1, 3), fail('same', 1, 3), summary({ failed: 2, passed: 0 })]);
  assert.deepEqual(analysis.failures.map(f => f.id), ['S > same', 'S > same #2']);
});

test('fingerprint depends on code, location and actual/expected, not on message wording', () => {
  const base = { code: 'ERR_TEST_FAILURE', causeCode: 'ERR_ASSERTION', operator: 'strictEqual', loc: 'a.test.mjs:3:5', actual: '1', expected: '2' };
  assert.equal(failureFingerprint(base), failureFingerprint({ ...base, detail: 'different message text' }));
  assert.notEqual(failureFingerprint(base), failureFingerprint({ ...base, actual: '9' }));
  assert.notEqual(failureFingerprint(base), failureFingerprint({ ...base, expected: '9' }));
  assert.notEqual(failureFingerprint(base), failureFingerprint({ ...base, loc: 'a.test.mjs:4:5' }));
  assert.notEqual(failureFingerprint(base), failureFingerprint({ ...base, causeCode: 'ERR_OTHER' }));
});

test('parseEventLines keeps good JSONL lines and counts garbage', () => {
  const { events, bad } = parseEventLines('{"t":"hello"}\nnot json\n\n{"t":"summary"}\n{"t":"sta');
  assert.deepEqual(events.map(e => e.t), ['hello', 'summary']);
  assert.equal(bad.length, 2);
});

// ---- runFile with an injected fake process ---------------------------------------------

function fakeSpawn(script) {
  const calls = [];
  const spawn = (cmd, args, options) => {
    const child = new EventEmitter();
    Object.assign(child, { pid: 424242, exitCode: null, signalCode: null, stdout: new PassThrough(), stderr: new PassThrough() });
    child.finish = (code, signal = null) => { child.exitCode = code; child.signalCode = signal; child.emit('exit', code, signal); child.emit('close', code, signal); };
    calls.push({ cmd, args, options, child });
    setImmediate(() => script({ child, events: options.env.GATE_EVENTS_FILE, options }));
    return child;
  };
  return { spawn, calls };
}
const write = (file, events) => fs.appendFileSync(file, events.map(e => `${JSON.stringify(e)}\n`).join(''));
const scratch = () => fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), 'runner-unit-'));
const quick = { startTimeOf: async () => 'T0', memoryOf: async () => 1234 };

test('runFile: normal pass writes an atomic result file and emits start/end events', async () => {
  const dir = scratch();
  try {
    const { spawn, calls } = fakeSpawn(({ child, events }) => { write(events, okEvents); child.stdout.write('spec line\n'); child.finish(0); });
    const seen = [];
    const resultFile = path.join(dir, 'results', 'r.json');
    const result = await runFile({ cwd: dir, file: 'a.test.mjs', runId: 'r1', ownerSession: 's1', deadline: 5000, spawn, resultFile, onEvent: e => seen.push(e), ...quick });
    assert.equal(result.status, 'PASS');
    assert.equal(result.exitCode, 0);
    assert.ok(result.specTail.includes('spec line'));
    assert.deepEqual(JSON.parse(fs.readFileSync(resultFile, 'utf8')).status, 'PASS');
    assert.deepEqual(fs.readdirSync(path.dirname(resultFile)), ['r.json'], 'no temp file left behind');
    assert.deepEqual(seen.map(e => e.type), ['start', 'end']);
    assert.ok(calls[0].args.includes('--test-isolation=none'));
    assert.ok(calls[0].args.some(a => a.startsWith('--test-reporter=file:') && a.endsWith('reporter.mjs')));
    assert.equal(calls[0].args.at(-1), 'a.test.mjs');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('runFile: spawn failures are CRASH, never PASS and never throw', async () => {
  const thrown = await runFile({ cwd: '.', file: 'a.test.mjs', spawn: () => { throw new Error('EPERM'); }, ...quick });
  assert.equal(thrown.status, 'CRASH');
  const { spawn } = fakeSpawn(({ child }) => child.emit('error', new Error('spawn ENOENT')));
  const evented = await runFile({ cwd: '.', file: 'a.test.mjs', spawn, ...quick });
  assert.equal(evented.status, 'CRASH');
  assert.match(evented.reason, /ENOENT/);
});

test('runFile: killed by signal is CRASH', async () => {
  const { spawn } = fakeSpawn(({ child, events }) => { write(events, [hello, start('a')]); child.finish(null, 'SIGSEGV'); });
  const result = await runFile({ cwd: '.', file: 'a.test.mjs', spawn, ...quick });
  assert.equal(result.status, 'CRASH');
  assert.equal(result.signal, 'SIGSEGV');
});

test('runFile: deadline requests a stop, then force-kills the exact PID after the grace period', async () => {
  const kills = [];
  const { spawn } = fakeSpawn(({ events }) => write(events, [hello, start('a')]));
  let child;
  const result = await runFile({ cwd: '.', file: 'a.test.mjs', deadline: 80, graceMs: 60, killWaitMs: 200, heartbeatMs: 25, spawn: (...a) => (child = spawn(...a)),
    kill: async (pid, force) => { kills.push([pid, force]); if (force) setImmediate(() => child.finish(null, 'SIGKILL')); return true; }, ...quick });
  assert.equal(result.status, 'TIMEOUT');
  assert.deepEqual(kills, [[424242, false], [424242, true]]);
  assert.deepEqual([result.killed.requested, result.killed.forced], [true, true]);
});

test('runFile: a process that obeys the polite request is not force-killed', async () => {
  const kills = [];
  const { spawn } = fakeSpawn(({ events }) => write(events, [hello, start('a')]));
  let child;
  const result = await runFile({ cwd: '.', file: 'a.test.mjs', deadline: 60, graceMs: 500, spawn: (...a) => (child = spawn(...a)),
    kill: async (pid, force) => { kills.push(force); if (!force) setImmediate(() => child.finish(1, null)); return true; }, ...quick });
  assert.equal(result.status, 'TIMEOUT');
  assert.deepEqual(kills, [false]);
});

test('runFile: force kill is refused when the PID creation time no longer matches', async () => {
  const kills = [];
  const { spawn } = fakeSpawn(({ events }) => write(events, [hello, start('a')]));
  let calls = 0;
  const result = await runFile({ cwd: '.', file: 'a.test.mjs', deadline: 40, graceMs: 40, killWaitMs: 40, spawn,
    startTimeOf: async () => `T${calls++}`, memoryOf: async () => null, kill: async (pid, force) => { kills.push(force); return true; } });
  assert.deepEqual(kills, [false], 'only the polite request, never a forced kill of a reused PID');
  assert.equal(result.killed.refused, true);
  assert.equal(result.status, 'TIMEOUT');
});

test('runFile: heartbeats carry file, elapsed time, last case event, deadline and peak memory', async () => {
  const beats = [];
  const { spawn } = fakeSpawn(({ child, events }) => { write(events, [hello, start('a'), pass('a')]); setTimeout(() => { write(events, [summary()]); child.finish(0); }, 150); });
  const result = await runFile({ cwd: '.', file: 'a.test.mjs', runId: 'hb', deadline: 5000, heartbeatMs: 30, spawn, onEvent: e => e.type === 'heartbeat' && beats.push(e), ...quick });
  assert.equal(result.status, 'PASS');
  assert.ok(beats.length >= 2, `got ${beats.length} heartbeats`);
  assert.equal(beats[0].file, 'a.test.mjs');
  assert.equal(beats[0].lastEvent.name, 'a');
  assert.ok(beats[0].deadlineAt && beats[0].elapsedMs >= 0);
  assert.equal(result.peakMemBytes, 1234);
});

test('runFile: infinite output is held to a bounded tail', async () => {
  const { spawn } = fakeSpawn(({ child, events }) => {
    write(events, [hello, start('a'), pass('a'), summary()]);
    for (let i = 0; i < 20000; i++) child.stdout.write(`line ${i} ${'x'.repeat(300)}\n`);
    setImmediate(() => child.finish(0));
  });
  const result = await runFile({ cwd: '.', file: 'a.test.mjs', spawn, ...quick });
  assert.equal(result.status, 'PASS');
  assert.ok(result.specTail.length <= 60);
  assert.ok(result.specTail.every(line => line.length <= 400));
});
