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
import { assertionAnchor, stableSerialize } from '../reporter.mjs';

const hello = { t: 'hello', v: 1 };
const counts = (o = {}) => ({ tests: 1, failed: 0, passed: 1, cancelled: 0, skipped: 0, todo: 0, ...o });
const summary = c => ({ t: 'summary', success: true, counts: counts(c) });
const start = (name, n = 0, line = 1) => ({ t: 'start', n, name, line, col: 1 });
const pass = (name, n = 0, line = 1, extra = {}) => ({ t: 'pass', n, name, line, col: 1, kind: 'test', ...extra });
const ERR = { code: 'ERR_TEST_FAILURE', causeCode: 'ERR_ASSERTION', operator: 'strictEqual', loc: 'a.test.mjs:3:5', locFile: 'a.test.mjs', anchor: 'abc123#0', actual: '1', expected: '2', actualFp: 'fa', expectedFp: 'fe' };
const fail = (name, n = 0, line = 1, err = ERR, kind = 'test') =>
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

test('a failing todo body is deferred, not an assertion failure, and is listed for the baseline comparison', () => {
  // Node runs todo bodies; their failures do not fail the file (cand-s503: 19 todo bodies, exit 0).
  const events = [hello, start('real'), pass('real'), start('later', 0, 2), { ...fail('later', 0, 2), todo: true },
    start('off', 0, 3), pass('off', 0, 3, { skip: true }), summary({ tests: 3, passed: 1, todo: 1, skipped: 1 })];
  const analysis = analyzeEvents(events);
  assert.deepEqual(analysis.failures, []);
  assert.deepEqual(analysis.deferred.map(d => [d.id, d.kind]), [['later', 'todo'], ['off', 'skip']]);
  assert.equal(classify(analysis, proc()).status, 'INCOMPLETE');
  assert.equal(classify(analysis, proc(), { allowSkip: true }).status, 'PASS');
});

test('failures carry full suite/case path; failed parent suites are not extra failures', () => {
  const analysis = analyzeEvents([hello, start('S', 0, 1), start('inner', 1, 2), start('bad', 2, 3),
    fail('bad', 2, 3), fail('inner', 1, 2, { code: 'ERR_TEST_FAILURE', failureType: 'subtestsFailed' }, 'suite'),
    fail('S', 0, 1, { code: 'ERR_TEST_FAILURE', failureType: 'subtestsFailed' }, 'suite'), summary({ failed: 1, passed: 0 })]);
  assert.equal(analysis.failures.length, 1);
  assert.deepEqual(analysis.failures[0].path, ['S', 'inner', 'bad']);
  assert.equal(analysis.failures[0].location, 'a.test.mjs:3:5');
  assert.equal(analysis.failures[0].fingerprint, failureFingerprint(ERR, ['S', 'inner', 'bad']));
});

test('duplicate case names get a sequence number', () => {
  const analysis = analyzeEvents([hello, start('S', 0, 1), start('same', 1, 2), fail('same', 1, 2), start('same', 1, 3), fail('same', 1, 3), summary({ failed: 2, passed: 0 })]);
  assert.deepEqual(analysis.failures.map(f => f.id), ['S > same', 'S > same #2']);
});

test('fingerprint: code, case path, anchor and full actual/expected digests matter; line numbers, message and display text do not', () => {
  const path1 = ['S', 'case'];
  const base = failureFingerprint(ERR, path1);
  assert.equal(base, failureFingerprint({ ...ERR, loc: 'a.test.mjs:40:9', detail: 'other wording', actual: 'shown differently' }, path1), 'line drift / display text ignored');
  assert.notEqual(base, failureFingerprint({ ...ERR, actualFp: 'other' }, path1));
  assert.notEqual(base, failureFingerprint({ ...ERR, expectedFp: 'other' }, path1));
  assert.notEqual(base, failureFingerprint({ ...ERR, anchor: 'zzz#0' }, path1), 'different assertion in the same case');
  assert.notEqual(base, failureFingerprint({ ...ERR, anchor: 'abc123#1' }, path1), 'same text, later occurrence');
  assert.notEqual(base, failureFingerprint({ ...ERR, locFile: 'b.test.mjs' }, path1));
  assert.notEqual(base, failureFingerprint({ ...ERR, causeCode: 'ERR_OTHER' }, path1));
  assert.notEqual(base, failureFingerprint(ERR, ['S', 'another case']));
});

test('stableSerialize tells deep, differently-shaped values apart and ignores key order', () => {
  const deep = leaf => ({ a: { b: { c: { d: { e: { f: leaf } } } } } });
  assert.notEqual(stableSerialize(deep(1)), stableSerialize(deep(2)));
  assert.equal(stableSerialize({ x: 1, y: [1, 2] }), stableSerialize({ y: [1, 2], x: 1 }));
  assert.notEqual(stableSerialize({ x: undefined }), stableSerialize({}));
  assert.notEqual(stableSerialize(undefined), stableSerialize(null));
  assert.notEqual(stableSerialize(10n), stableSerialize(10));
  assert.notEqual(stableSerialize(new Map([[1, 'a']])), stableSerialize(new Map([[1, 'b']])));
  assert.equal(stableSerialize(new Set([1, 2])), stableSerialize(new Set([2, 1])));
  assert.notEqual(stableSerialize(new Set([1])), stableSerialize([1]));
  assert.notEqual(stableSerialize(Number.NaN), stableSerialize(null));
  const cyclic = { name: 'c' }; cyclic.self = cyclic;
  assert.equal(typeof stableSerialize(cyclic), 'string');
  const long = 'x'.repeat(5000);
  assert.notEqual(stableSerialize({ v: long + 'a' }), stableSerialize({ v: long + 'b' }), 'no truncation');
});

test('assertion anchor survives moving the assertion, but separates different and repeated assertions', () => {
  const body = ['import a from "x";', 'test("same", () => {', '  assert.equal(compute(1), 2);', '});', 'test("same", () => {', '  assert.equal(compute(2), 3);', '  assert.equal(compute(1), 2);', '});'];
  const anchorAt = (lines, line) => assertionAnchor({ file: 'f', line }, () => lines.join('\n'));
  const shifted = ['// new header comment', '', ...body];
  assert.equal(anchorAt(body, 3), anchorAt(shifted, 5), 'two lines lower, same anchor');
  assert.notEqual(anchorAt(body, 3), anchorAt(body, 6), 'different assertion text');
  assert.notEqual(anchorAt(body, 3), anchorAt(body, 7), 'identical text, later occurrence');
  assert.equal(anchorAt(body, 99), null);
});

test('a damaged or contradictory event stream is INCOMPLETE, never PASS', () => {
  const analysis = analyzeEvents(okEvents);
  assert.equal(classify(analysis, proc(), { badLines: 1 }).status, 'INCOMPLETE');
  assert.equal(classify(analysis, proc(), { badLines: 0 }).status, 'PASS');
  const noCounts = analyzeEvents([hello, start('a'), pass('a'), { t: 'summary', success: true }]);
  assert.equal(classify(noCounts, proc()).status, 'INCOMPLETE');
  const partialCounts = analyzeEvents([hello, start('a'), pass('a'), { t: 'summary', success: true, counts: { tests: 1 } }]);
  assert.equal(classify(partialCounts, proc()).status, 'INCOMPLETE');
  assert.equal(verdict([hello, start('a'), pass('a'), summary({ tests: 5, passed: 5 })]), 'INCOMPLETE', 'summary claims more cases than were reported');
  assert.equal(verdict([hello, start('a'), pass('a'), summary({ tests: 1, passed: 3 })]), 'INCOMPLETE', 'summary claims more passes than cases');
  assert.equal(verdict([hello, start('a'), pass('a'), start('b'), pass('b'), summary({ tests: 1, passed: 1 })]), 'INCOMPLETE', 'fewer cases in summary than events');
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

async function timeoutRun({ startTimes, ...extra }) {
  const kills = [], seen = [];
  const { spawn } = fakeSpawn(({ events }) => write(events, [hello, start('a')]));
  let n = 0;
  const result = await runFile({ cwd: '.', file: 'a.test.mjs', deadline: 40, graceMs: 40, killWaitMs: 40, spawn, memoryOf: async () => null,
    startTimeOf: async () => startTimes(n++), kill: async (pid, force) => { kills.push([pid, force]); return true; }, onEvent: e => seen.push(e.type), ...extra });
  return { kills, seen, result };
}

test('runFile: a PID whose creation time changed gets no kill at all, polite or forced', async () => {
  const { kills, seen, result } = await timeoutRun({ startTimes: n => `T${n}` });
  assert.deepEqual(kills, []);
  assert.equal(result.status, 'TIMEOUT');
  assert.equal(result.killed.refused, true);
  assert.equal(result.killed.refusedReason, 'mismatch');
  assert.equal(result.killed.possiblyAlive, true, 'result tells the caller the process may still be running');
  assert.ok(seen.includes('kill-refused'));
});

test('runFile: an unverifiable identity (no creation time) is never killed', async () => {
  const { kills, seen, result } = await timeoutRun({ startTimes: () => null });
  assert.deepEqual(kills, []);
  assert.equal(result.killed.refusedReason, 'unverifiable');
  assert.equal(result.killed.possiblyAlive, true);
  assert.equal(result.killed.requested, false);
  assert.ok(seen.includes('kill-refused'));
});

test('runFile: identity is re-checked before the forced kill; a changed PID gets only the polite request', async () => {
  const { kills, result } = await timeoutRun({ startTimes: n => (n < 2 ? 'T0' : 'T9') });
  assert.deepEqual(kills, [[424242, false]]);
  assert.equal(result.killed.refused, true);
  assert.equal(result.killed.forced, false);
  assert.equal(result.killed.possiblyAlive, true);
});

test('runFile: descendants left behind by an exited root are killed by exact PID after identity check, and pipes are destroyed', async () => {
  const kills = [];
  let child;
  const { spawn } = fakeSpawn(({ child: c, events }) => { child = c; write(events, okEvents); c.emit('exit', 0, null); /* no 'close': a grandchild holds the pipes */ });
  const result = await runFile({ cwd: '.', file: 'a.test.mjs', closeWaitMs: 30, spawn, memoryOf: async () => null,
    startTimeOf: async pid => (pid === 777 ? '2026-01-01T00:00:00.500Z' : 'T0'),
    descendantsOf: async root => [{ pid: 777, parent: root, startTime: '2026-01-01T00:00:00.500Z' }, { pid: 778, parent: 777, startTime: '2026-01-01T00:00:01.000Z' }],
    kill: async (pid, force) => { kills.push([pid, force]); return true; } });
  assert.equal(result.status, 'PASS');
  assert.deepEqual(kills, [[777, true]], 'only the orphan root is killed (with its tree); never anything unverified');
  assert.deepEqual(result.descendantsCleaned, [{ pid: 777, killed: true, refused: false }]);
  assert.equal(child.stdout.destroyed, true);
  assert.equal(child.stderr.destroyed, true);
});

test('runFile: a descendant whose creation time does not match is refused, not killed', async () => {
  const kills = [];
  const { spawn } = fakeSpawn(({ child, events }) => { write(events, okEvents); child.emit('exit', 0, null); });
  const result = await runFile({ cwd: '.', file: 'a.test.mjs', closeWaitMs: 30, spawn, memoryOf: async () => null,
    startTimeOf: async pid => (pid === 777 ? '2030-01-01T00:00:00.000Z' : 'T0'),
    descendantsOf: async root => [{ pid: 777, parent: root, startTime: '2026-01-01T00:00:00.000Z' }],
    kill: async (pid, force) => { kills.push([pid, force]); return true; } });
  assert.deepEqual(kills, []);
  assert.deepEqual(result.descendantsCleaned, [{ pid: 777, killed: false, refused: true }]);
});

test('runFile: a bad line in the event file prevents PASS', async () => {
  const { spawn } = fakeSpawn(({ child, events }) => { write(events, okEvents); fs.appendFileSync(events, '{broken json}\n'); child.finish(0); });
  const result = await runFile({ cwd: '.', file: 'a.test.mjs', spawn, ...quick });
  assert.equal(result.status, 'INCOMPLETE');
  assert.equal(result.badEventLines, 1);
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
