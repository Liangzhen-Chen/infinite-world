// Pure state-machine tests for tools/gate/scheduler.mjs: runFile, memory sampling and the clock
// are injected; only a throw-away root directory on disk is real. Nothing here spawns a process.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Scheduler, acquireLock, jobKey, loadPolicy, p95, PRIORITY } from '../scheduler.mjs';

const GB = 1024 ** 3;
const scratch = fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), 'scheduler-unit-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); };
let counter = 0;

function make({ policy = {}, mem = 64 * GB, root } = {}) {
  root ??= path.join(scratch, `r${++counter}`);
  const env = { clock: { t: Date.parse('2026-10-26T00:00:00Z') }, mem: { v: mem }, runs: [], n: 0, root, tmpRoot: path.join(root, 'tmp') };
  const runFile = options => new Promise(resolve => {
    const run = { options, file: options.file, runId: options.runId, done: false,
      finish: (status = 'PASS', extra = {}) => { run.done = true; resolve({ status, reason: status === 'PASS' ? 'ok' : status.toLowerCase(), counts: { passed: 1, failed: 0 }, failures: [], durationMs: 5, peakMemBytes: null, exitCode: 0, ...extra }); },
      boom: error => { run.done = true; throw error; } };
    env.runs.push(run);
    options.onEvent({ type: 'start', pid: 5000 + env.runs.length, deadlineAt: 'x' });
  });
  env.policy = { ...loadPolicy(), ...policy };
  const build = () => new Scheduler({ root, tmpRoot: env.tmpRoot, policy: env.policy, now: () => env.clock.t, availMem: async () => env.mem.v, runFile,
    prepareWorkspace: async job => ({ cwd: job.request.worktree || 'snap', created: false }), releaseWorkspace: async () => {} });
  env.sched = build(); env.sched.load();
  env.restart = () => { env.sched = build(); env.sched.load(); return env.sched; };
  env.submit = (id, req) => {
    const dir = path.join(root, 'jobs', id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'request.json'), JSON.stringify({ kind: 'card', worktree: 'wt', createdAt: new Date(Date.UTC(2026, 9, 26, 0, 0, 0, ++env.n)).toISOString(), ...req }));
    return id;
  };
  env.tick = async (advanceMs = 0) => { env.clock.t += advanceMs; await env.sched.tick(); await flush(); };
  env.running = () => env.runs.filter(r => !r.done);
  env.result = id => JSON.parse(fs.readFileSync(path.join(root, 'jobs', id, 'result.json'), 'utf8'));
  env.alerts = () => { try { return fs.readFileSync(path.join(root, 'alerts.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse); } catch { return []; } };
  return env;
}
const names = n => Array.from({ length: n }, (_, i) => `t${i}.test.mjs`);

test('memory admission: available - unrealized reservations - this reservation must stay >= 2GB', async () => {
  const e = make({ mem: 6 * GB });
  e.submit('j1', { cardId: 'A', files: names(1) }); e.submit('j2', { cardId: 'B', files: names(1) }); e.submit('j3', { cardId: 'C', files: names(1) });
  await e.tick();
  // 6-0-2=4 ok; 6-2-2=2 ok (boundary is inclusive); 6-4-2=0 < 2 -> third waits
  assert.equal(e.running().length, 2);
  assert.equal(e.sched.jobs.get('j3').files[0].waitReason, 'memory');
  assert.equal(e.sched.outstanding(), 4 * GB);
  e.mem.v = 5 * GB;                                  // still inside the realize window: reservations still count
  await e.tick(1000);
  assert.equal(e.running().length, 2);
  await e.tick(31000);                               // realized: their memory is part of "available" now
  assert.equal(e.running().length, 3);
});

test('hard slot cap holds and a freed slot is taken by the next queued file', async () => {
  const e = make({ policy: { hardCap: 4 } });
  for (const c of 'ABCD') e.submit(`j${c}`, { cardId: c, files: names(3) });
  await e.tick();
  assert.equal(e.running().length, 4);
  assert.equal(e.sched.slotsInUse(), 4);
  e.runs[0].finish(); await e.tick();
  assert.equal(e.running().length, 4);
  assert.equal(e.runs.length, 5);
});

test('per-card cap is 2 but other cards can use the remaining slots', async () => {
  const e = make();
  e.submit('big', { cardId: 'A', files: names(5) });
  await e.tick();
  assert.equal(e.running().length, 2);
  assert.equal(e.sched.jobs.get('big').files.filter(f => f.waitReason === 'card-cap').length, 3);
  e.submit('other', { cardId: 'B', files: names(3) });
  await e.tick();
  assert.equal(e.running().length, 4);
  assert.equal(e.running().filter(r => r.runId === 'big').length, 2);
});

test('priority core > gate > card > scan > collect, FIFO inside one level', async () => {
  const e = make({ policy: { hardCap: 1, perCard: 1 } });
  e.submit('first', { cardId: 'F', files: ['f.test.mjs'] });
  await e.tick();
  assert.equal(e.running().length, 1);
  e.submit('col', { kind: 'collect', cardId: 'col', snapshot: 'abc', files: ['c.test.mjs'], priority: undefined });
  e.submit('scan', { kind: 'full', cardId: 'scan', snapshot: 'abc', files: ['s.test.mjs'] });
  e.submit('cardLevel', { cardId: 'V', files: ['v.test.mjs'], priority: 'card' });
  e.submit('gate1', { cardId: 'G1', files: ['g1.test.mjs'] });
  e.submit('core', { cardId: 'X', files: ['x.test.mjs'], priority: 'core' });
  e.submit('gate2', { cardId: 'G2', files: ['g2.test.mjs'] });
  await e.tick();
  const order = [];
  for (let i = 0; i < 6; i++) {
    e.running()[0].finish(); await e.tick();
    order.push(e.running()[0]?.runId);
  }
  assert.deepEqual(order.slice(0, 5), ['core', 'gate1', 'gate2', 'cardLevel', 'scan']);
  assert.equal(order[4], 'scan'); assert.equal(PRIORITY.core < PRIORITY.collect, true);
  await e.tick();
  assert.equal(e.runs.at(-1).runId, 'col');
});

test('collect starts new files only when nothing else is queued, and does not preempt running files', async () => {
  const e = make();
  e.submit('big', { cardId: 'A', files: names(3) });         // 2 run, 1 queued (card cap)
  e.submit('col', { kind: 'collect', cardId: 'col', snapshot: 's1', files: ['c1.test.mjs', 'c2.test.mjs'] });
  await e.tick();
  assert.deepEqual(e.running().map(r => r.runId), ['big', 'big']);
  assert.equal(e.sched.jobs.get('col').files[0].waitReason, 'collect-yield');
  e.runs[0].finish(); await e.tick();                         // third big file starts; now nothing else is queued
  assert.equal(e.running().filter(r => r.runId === 'big').length, 2);
  assert.equal(e.running().filter(r => r.runId === 'col').length, 2, 'collect fills the free slots only once the queue is empty');
  assert.equal(e.running().length, 4);
});

test('same card + tree is one job; a different tree or an explicit rerun is a new job', async () => {
  const e = make();
  e.submit('r1', { cardId: 'A', treeHash: 'T1', files: names(2) });
  e.submit('r2', { cardId: 'A', treeHash: 'T1', files: names(2) });
  e.submit('r3', { cardId: 'A', treeHash: 'T2', files: names(2) });
  e.submit('r4', { cardId: 'A', treeHash: 'T1', files: names(2), rerun: true });
  await e.tick();
  assert.deepEqual(e.result('r2'), { runId: 'r2', status: 'DUPLICATE', duplicateOf: 'r1' });
  assert.equal([...e.sched.jobs.values()].filter(j => !j.terminal).length, 3);
  assert.equal(jobKey({ kind: 'card', cardId: 'A', files: ['x'] }), null, 'no tree/base/snapshot -> no idempotency');
  // idempotency survives a restart
  e.restart();
  e.submit('r5', { cardId: 'A', treeHash: 'T2', files: names(2) });
  await e.tick();
  assert.equal(e.result('r5').duplicateOf, 'r3');
});

test('memory pause after two low samples, hysteresis resume after 30s at >=3GB, running files untouched', async () => {
  const e = make({ mem: 8 * GB });
  e.submit('run', { cardId: 'A', files: ['a.test.mjs'] });
  await e.tick();
  assert.equal(e.running().length, 1);
  e.mem.v = 1 * GB;
  await e.tick(10000);                                  // low #1
  assert.equal(e.sched.paused, false);
  await e.tick(10000);                                  // low #2 -> pause
  assert.equal(e.sched.paused, true);
  e.submit('late', { cardId: 'B', files: ['b.test.mjs'] });
  await e.tick(1000);
  assert.equal(e.running().length, 1, 'no new start while paused; the running file is not killed');
  assert.equal(e.alerts().filter(a => a.type === 'RESOURCE_PAUSE').length, 1);
  e.mem.v = 2.5 * GB;                                   // between thresholds: not enough to resume
  for (let i = 0; i < 4; i++) await e.tick(10000);
  assert.equal(e.sched.paused, true);
  e.mem.v = 4 * GB;
  await e.tick(10000); await e.tick(10000); await e.tick(10000);   // 20s at >= 3GB
  assert.equal(e.sched.paused, true);
  e.mem.v = 2.9 * GB; await e.tick(10000);              // dip resets the hold
  e.mem.v = 4 * GB;
  await e.tick(10000); await e.tick(10000); await e.tick(10000);
  assert.equal(e.sched.paused, true);
  await e.tick(10000);                                  // 30s continuous
  assert.equal(e.sched.paused, false);
  assert.equal(e.running().length, 2);
  assert.equal(e.sched.overview().oldestAlert, null, 'pause alert cleared on resume');
});

test('a single low sample does not pause', async () => {
  const e = make({ mem: 8 * GB });
  e.mem.v = 1 * GB; await e.tick(10000);
  e.mem.v = 8 * GB; await e.tick(10000);
  e.mem.v = 1 * GB; await e.tick(10000);
  assert.equal(e.sched.paused, false);
});

test('TIMEOUT, CRASH and a throwing runner all release their slot; the next file starts', async () => {
  const e = make({ policy: { hardCap: 1, perCard: 1 } });
  e.submit('j', { cardId: 'A', files: names(3) });
  await e.tick();
  e.runs[0].finish('TIMEOUT', { timedOut: true, exitCode: null }); await e.tick();
  assert.equal(e.sched.slotsInUse(), 1, 'next file took the freed slot');
  e.runs[1].finish('CRASH'); await e.tick();
  assert.equal(e.runs.length, 3);
  e.runs[2].finish('PASS'); await e.tick();
  assert.equal(e.sched.slotsInUse(), 0);
  const result = e.result('j');
  assert.equal(result.status, 'INCOMPLETE');
  assert.deepEqual(result.counts, { TIMEOUT: 1, CRASH: 1, PASS: 1 });
  // an injected runner that throws
  const t = make({ policy: { hardCap: 1, perCard: 1 } });
  t.sched.runFile = async () => { throw new Error('kaboom'); };
  t.submit('k', { cardId: 'K', files: names(2) });
  await t.tick(); await t.tick();
  assert.equal(t.sched.slotsInUse(), 0);
  assert.equal(t.result('k').files.every(f => f.status === 'CRASH' && /kaboom/.test(f.reason)), true);
});

test('failing files make the job FAIL; all-pass is PASS; results and summary are written', async () => {
  const e = make();
  e.submit('p', { cardId: 'P', files: names(2) }); e.submit('f', { cardId: 'F', files: names(2) });
  await e.tick();
  e.runs[0].finish(); e.runs[1].finish(); e.runs[2].finish('FAIL', { counts: { failed: 1 } }); e.runs[3].finish();
  await e.tick();
  assert.equal(e.result('p').status, 'PASS');
  assert.equal(e.result('f').status, 'FAIL');
  const dir = path.join(e.root, 'jobs', 'f');
  assert.ok(fs.existsSync(path.join(dir, 'summary.md')));
  assert.equal(fs.readdirSync(path.join(dir, 'events.jsonl', '..')).includes('events.jsonl'), true);
  const types = fs.readFileSync(path.join(dir, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l).type);
  for (const type of ['queued', 'admitted', 'test_start', 'test_end', 'job_end']) assert.ok(types.includes(type), type);
});

test('restart marks RUNNING as ORPHANED, keeps its slot, never reruns it; release by control file frees the slot', async () => {
  const e = make({ policy: { hardCap: 1, perCard: 1 } });
  e.submit('j', { cardId: 'A', files: names(2) });
  await e.tick();
  assert.equal(e.running().length, 1);
  const before = e.runs.length;
  const s2 = e.restart();                               // old instance "crashed" mid-run
  await e.tick();
  const job = s2.jobs.get('j');
  assert.equal(job.files[0].status, 'ORPHANED');
  assert.equal(s2.slotsInUse(), 1, 'orphan keeps its slot');
  assert.equal(e.runs.length, before, 'the orphaned file is not run again and the queued one cannot start');
  assert.equal(job.files[1].state, 'QUEUED');
  assert.equal(e.alerts().some(a => a.type === 'ORPHANED'), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(e.root, 'jobs', 'j', 'results', `${job.files[0].id}.json`))).status, 'INCOMPLETE');
  assert.equal(s2.overview().orphanSlots, 1);
  const [orphanId] = [...s2.orphans.keys()];
  fs.mkdirSync(path.join(e.root, 'control'), { recursive: true });
  fs.writeFileSync(path.join(e.root, 'control', `release-${orphanId}`), '');
  await e.tick();
  assert.equal(s2.slotsInUse(), 1, 'the queued file now holds the freed slot');
  assert.equal(e.runs.length, before + 1);
  e.runs.at(-1).finish(); await e.tick();
  assert.equal(e.result('j').status, 'INCOMPLETE', 'a job that lost a file to an orphan can never report PASS');
});

test('orphan of a one-file job finishes the job INCOMPLETE immediately', async () => {
  const e = make();
  e.submit('j', { cardId: 'A', files: names(1) });
  await e.tick();
  e.restart(); await e.tick();
  assert.equal(e.result('j').status, 'INCOMPLETE');
  assert.equal(e.sched.slotsInUse(), 1);
});

test('adaptive reservation: >=5 samples -> max(1GB, 1.3*p95 of last 20); defaults per class otherwise', () => {
  const e = make();
  const job = { kind: 'card' }, file = { file: 'a.test.mjs' };
  assert.equal(e.sched.reservationOf(job, file), 2 * GB);
  assert.equal(e.sched.reservationOf(job, { file: 'tests/browser/x.test.mjs' }), 3 * GB);
  assert.equal(e.sched.reservationOf({ kind: 'collect' }, file), 3 * GB);
  e.sched.history['normal:a.test.mjs'] = [GB / 2, GB / 2, GB / 2, GB / 2];
  assert.equal(e.sched.reservationOf(job, file), 2 * GB, '4 samples is not enough');
  e.sched.history['normal:a.test.mjs'].push(GB / 2);
  assert.equal(e.sched.reservationOf(job, file), GB, 'floor 1GB');
  e.sched.history['normal:a.test.mjs'] = [...Array(30).fill(10 * GB), ...Array(18).fill(GB), 2 * GB, 2 * GB];
  assert.equal(e.sched.reservationOf(job, file), Math.round(1.3 * 2 * GB), 'only the last 20 count');
  assert.equal(p95([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 10);
});

test('a PASS records its peak so later reservations adapt', async () => {
  const e = make();
  for (let i = 0; i < 5; i++) {
    e.submit(`h${i}`, { cardId: `H${i}`, files: ['same.test.mjs'] });
    await e.tick(); e.runs.at(-1).finish('PASS', { peakMemBytes: 400 * 1024 * 1024 }); await e.tick();
  }
  assert.equal(e.sched.reservationOf({ kind: 'card' }, { file: 'same.test.mjs' }), GB);
});

test('waiting 5 min alerts once, 30 min marks RESOURCE_BLOCKED (no auto concurrency raise); overview shows it', async () => {
  const e = make({ policy: { hardCap: 1, perCard: 1 } });
  e.submit('hold', { cardId: 'A', files: ['h.test.mjs'] });
  await e.tick();
  e.submit('wait', { cardId: 'B', files: ['w.test.mjs'] });
  await e.tick(1000);
  await e.tick(5 * 60000);
  await e.tick(1000);
  assert.equal(e.alerts().filter(a => a.type === 'WAIT_5MIN' && a.runId === 'wait').length, 1);
  assert.equal(e.sched.overview().jobs.find(j => j.runId === 'wait').status, 'WAIT_RESOURCE');
  await e.tick(26 * 60000);
  const row = e.sched.overview().jobs.find(j => j.runId === 'wait');
  assert.equal(row.status, 'RESOURCE_BLOCKED');
  assert.equal(e.alerts().some(a => a.type === 'RESOURCE_BLOCKED'), true);
  assert.equal(e.sched.policy.hardCap, 1);
  assert.equal(e.running().length, 1);
  assert.equal(e.sched.overview().oldestAlert.type, 'WAIT_5MIN');
  e.runs[0].finish(); await e.tick();                   // blocked files still run once there is room
  assert.equal(e.running()[0].runId, 'wait');
});

test('cancel drops queued files, lets the running one finish, and frees everything', async () => {
  const e = make({ policy: { hardCap: 1, perCard: 1 } });
  e.submit('j', { cardId: 'A', files: names(3) });
  await e.tick();
  fs.mkdirSync(path.join(e.root, 'control'), { recursive: true });
  fs.writeFileSync(path.join(e.root, 'control', 'cancel-j'), '');
  await e.tick();
  assert.equal(e.running().length, 1);
  e.runs[0].finish(); await e.tick();
  assert.equal(e.sched.slotsInUse(), 0);
  const r = e.result('j');
  assert.equal(r.status, 'INCOMPLETE');
  assert.deepEqual(r.files.map(f => f.status), ['PASS', 'INCOMPLETE', 'INCOMPLETE']);
});

test('overview and heartbeat: fields, rewritten without state changes, queue.json is written by the scheduler', async () => {
  const e = make({ mem: 10 * GB });
  e.submit('j', { cardId: 'S503', ownerSession: 'sess-1', files: names(3) });
  await e.tick();
  const overview = JSON.parse(fs.readFileSync(path.join(e.root, 'overview.json'), 'utf8'));
  assert.equal(overview.hardCap, 4);
  assert.equal(overview.slotsUsed, 2);
  assert.equal(overview.availMemBytes, 10 * GB);
  const row = overview.jobs[0];
  assert.equal(row.card, 'S503'); assert.equal(row.owner, 'sess-1'); assert.equal(row.status, 'RUNNING');
  assert.equal(row.done, 0); assert.equal(row.total, 3); assert.equal(row.currentFiles.length, 2); assert.equal(row.slots, 2);
  assert.ok(fs.existsSync(path.join(e.root, 'scheduler.heartbeat')));
  assert.ok(fs.existsSync(path.join(e.root, 'queue.json')));
  const stamp = overview.updatedAt;
  await e.tick(16000);                                  // 15s timer rewrites overview although nothing changed
  assert.notEqual(JSON.parse(fs.readFileSync(path.join(e.root, 'overview.json'), 'utf8')).updatedAt, stamp);
});

test('invalid requests get an INCOMPLETE result instead of hanging the waiter', async () => {
  const e = make();
  e.submit('bad1', { kind: 'bogus', files: ['a'] });
  e.submit('bad2', { cardId: 'A', files: [] });
  e.submit('bad3', { kind: 'baseline', cardId: 'A', files: ['a'] });
  await e.tick();
  for (const id of ['bad1', 'bad2', 'bad3']) assert.equal(e.result(id).status, 'INCOMPLETE');
});

test('single-instance lock: live holder refuses, dead or PID-reused holder is taken over', async () => {
  const root = path.join(scratch, 'lock');
  const first = await acquireLock(root, { pid: 111, startTimeOf: () => 'T1', isAlive: () => true });
  assert.equal(JSON.parse(fs.readFileSync(first.file, 'utf8')).startTime, 'T1');
  await assert.rejects(acquireLock(root, { pid: 222, startTimeOf: () => 'T1', isAlive: () => true }), /already running \(pid 111/);
  const dead = await acquireLock(root, { pid: 333, startTimeOf: () => 'T3', isAlive: () => false });
  assert.equal(JSON.parse(fs.readFileSync(dead.file, 'utf8')).pid, 333);
  // pid alive but now a different process (creation time differs) -> stale
  const reused = await acquireLock(root, { pid: 444, startTimeOf: pid => (pid === 333 ? 'OTHER' : 'T4'), isAlive: () => true });
  assert.equal(JSON.parse(fs.readFileSync(reused.file, 'utf8')).pid, 444);
  dead.release();                                       // not the holder: must not delete the live lock
  assert.ok(fs.existsSync(reused.file));
  reused.release();
  assert.ok(!fs.existsSync(reused.file));
});

test('slots weight: a 2-slot file occupies two slots', async () => {
  const e = make({ policy: { hardCap: 3, perCard: 2 } });
  e.submit('a-w', { cardId: 'A', files: ['heavy.test.mjs', 'x.test.mjs'], slots: { 'heavy.test.mjs': 2 } });
  e.submit('b-o', { cardId: 'B', files: ['o1.test.mjs', 'o2.test.mjs'] });
  await e.tick();
  assert.equal(e.sched.slotsInUse(), 3);
  assert.deepEqual(e.running().map(r => r.file), ['heavy.test.mjs', 'o1.test.mjs']);
});

test('deadline: explicit job value wins; no history -> 15 min fast / 45 min slow tier; coverage keeps 20 min', () => {
  const e = make();
  e.sched.slowSet = new Set(['tests/slow.test.mjs']);
  const job = { kind: 'card', request: {} };
  assert.equal(e.sched.deadlineOf(job, { file: 'tests/fast.test.mjs' }), 15 * 60000);
  assert.equal(e.sched.deadlineOf(job, { file: 'tests/slow.test.mjs' }), 45 * 60000);
  assert.equal(e.sched.deadlineOf({ kind: 'collect', request: {} }, { file: 'tests/fast.test.mjs' }), 20 * 60000);
  assert.equal(e.sched.deadlineOf({ kind: 'card', request: { deadlineMs: 1234 } }, { file: 'tests/slow.test.mjs' }), 1234);
});

test('deadline with history: >=3 samples -> clamp(3 x p95, 10 min, 45 min); fewer samples fall back to the default', () => {
  const e = make();
  const job = { kind: 'card', request: {} };
  const runs = (file, ...secs) => { e.sched.history.runs = { ...e.sched.history.runs, [file]: secs.map(s => ({ file, durationMs: s * 1000, status: 'PASS' })) }; };
  runs('a', 100, 110); assert.equal(e.sched.deadlineOf(job, { file: 'a' }), 15 * 60000, '2 samples are not enough');
  runs('a', 100, 110, 120); assert.equal(e.sched.deadlineOf(job, { file: 'a' }), 10 * 60000, '3 x 120s = 6 min is raised to the 10 min floor');
  runs('b', 300, 350, 385); assert.equal(e.sched.deadlineOf(job, { file: 'b' }), 3 * 385 * 1000, 'a 385 s test gets 19.25 min, not 5');
  runs('c', 1000, 1200, 1500); assert.equal(e.sched.deadlineOf(job, { file: 'c' }), 45 * 60000, 'capped at 45 min');
  assert.equal(e.sched.deadlineOf({ kind: 'collect', request: {} }, { file: 'a' }), 20 * 60000, 'coverage floor stays 20 min');
});

test('deadline: timed-out / crashed samples are censored and never enter the p95; settle() records the history', async () => {
  const e = make({ policy: { hardCap: 1, perCard: 1 } });
  const job = { kind: 'card', request: {} };
  e.sched.history.runs = { x: [{ durationMs: 200000, status: 'PASS' }, { durationMs: 210000, status: 'FAIL' }, { durationMs: 220000, status: 'PASS' },
    { durationMs: 900000, status: 'TIMEOUT', timedOut: true }, { durationMs: 5000, status: 'CRASH' }] };
  assert.equal(e.sched.deadlineOf(job, { file: 'x' }), 3 * 220000);
  for (let i = 0; i < 22; i++) {
    e.submit('d' + i, { cardId: 'D' + i, files: ['rec.test.mjs'] });
    await e.tick(); e.runs.at(-1).finish(i === 21 ? 'TIMEOUT' : 'PASS', { durationMs: 1000 + i, timedOut: i === 21 }); await e.tick();
  }
  const stored = JSON.parse(fs.readFileSync(path.join(e.root, 'history.json'), 'utf8')).runs['rec.test.mjs'];
  assert.equal(stored.length, 20);
  assert.deepEqual(Object.keys(stored[0]).sort(), ['durationMs', 'endedAt', 'file', 'status', 'timedOut']);
  assert.equal(stored.at(-1).status, 'TIMEOUT');
  assert.equal(e.sched.deadlineOf(job, { file: 'rec.test.mjs' }), 10 * 60000, 'the TIMEOUT sample is ignored; 3 x p95 of ~1s is below the floor');
});
