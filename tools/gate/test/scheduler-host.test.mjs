// Real-process tests for tools/gate/scheduler.mjs: a real scheduler process, the real submit.ps1,
// real runner child processes running second-long fixtures. Thresholds are injected short through a
// private policy file. Overlap is measured from the fixtures' own start/end log, not from scheduler state.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const gate = path.dirname(here);
const fixtures = path.join(here, 'fixtures', 'scheduler');
const scratch = fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), 'scheduler-host-'));
const started = [];                                       // scheduler PIDs this test file started (own PIDs only)
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const GB = 1024 ** 3;
let n = 0;

after(async () => {
  for (const pid of started) if (alive(pid)) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
  await sleep(300);
  fs.rmSync(scratch, { recursive: true, force: true });
});

async function until(check, ms = 60000, what = 'condition') {
  const end = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > end) throw new Error(`timeout waiting for ${what}`);
    await sleep(150);
  }
}
const readJson = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
const readLog = file => { try { return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { return []; } };

function setup(policyExtra = {}) {
  const dir = path.join(scratch, `s${++n}`);
  const env = { dir, root: path.join(dir, 'gate'), tmp: path.join(dir, 'tmp'), log: path.join(dir, 'fx.jsonl'), avail: path.join(dir, 'avail.txt'),
    nm: path.join(dir, 'nm-target'), st: path.join(dir, 'st-target') };
  fs.mkdirSync(env.nm, { recursive: true }); fs.mkdirSync(env.st, { recursive: true });
  fs.writeFileSync(path.join(env.nm, 'sentinel.txt'), 'keep'); fs.writeFileSync(path.join(env.st, 'sentinel.txt'), 'keep');
  fs.writeFileSync(env.avail, String(64 * GB));
  const policy = { ...JSON.parse(fs.readFileSync(path.join(gate, 'policy', 'resources.json'), 'utf8')),
    hardCap: 3, perCard: 2, reserveBytes: { normal: 64 * 1048576, browser: 64 * 1048576, coverage: 64 * 1048576 }, minFreeAfterBytes: 64 * 1048576,
    pauseBelowBytes: 1 * GB, resumeAboveBytes: 2 * GB, resumeHoldMs: 800, sampleMs: 200, realizeMs: 1000, heartbeatMs: 400, overviewMs: 400,
    deadlinesMs: { default: 30000, slowTier: 30000, min: 30000, max: 60000, collect: 30000 }, links: { node_modules: env.nm, SillyTavern: env.st }, ...policyExtra };
  env.policyFile = path.join(dir, 'policy.json');
  fs.writeFileSync(env.policyFile, JSON.stringify(policy));
  env.start = () => {
    const child = spawn(process.execPath, [path.join(gate, 'scheduler.mjs'), '--root', env.root, '--tmp', env.tmp, '--policy', env.policyFile, '--avail-file', env.avail, '--tick-ms', '150'],
      { env: { ...process.env, FX_LOG: env.log }, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    started.push(child.pid);
    child.stderrText = ''; child.stderr.on('data', d => { child.stderrText += d; });
    child.exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
    return child;
  };
  env.submit = (args) => new Promise((resolve, reject) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(gate, 'submit.ps1'), '-Root', env.root, ...args],
    { encoding: 'utf8' }, (error, stdout, stderr) => (error ? reject(new Error(`${error.message}\n${stderr}`)) : resolve(stdout.trim().split(/\r?\n/).pop()))));
  env.result = id => readJson(path.join(env.root, 'jobs', id, 'result.json'));
  env.up = () => until(() => fs.existsSync(path.join(env.root, 'scheduler.heartbeat')), 20000, 'scheduler heartbeat');
  env.stop = async child => { fs.mkdirSync(path.join(env.root, 'control'), { recursive: true }); fs.writeFileSync(path.join(env.root, 'control', 'stop'), ''); return Promise.race([child.exited, sleep(15000).then(() => 'late')]); };
  return env;
}
const card = (env, id, files, extra = []) => env.submit(['-Kind', 'card', '-Card', id, '-Worktree', fixtures, '-Files', files.join(','), '-Env', `FX_CARD=${id};FX_SLEEP=1200`, ...extra]);

function overlap(entries, key) {
  const edges = entries.filter(e => !key || key(e)).map(e => ({ t: e.t, d: e.kind === 'S' ? 1 : -1 })).sort((a, b) => a.t - b.t || a.d - b.d);
  let cur = 0, max = 0;
  for (const e of edges) { cur += e.d; max = Math.max(max, cur); }
  return max;
}

test('four cards + a collect + a baseline submitted at once: caps hold, collect yields, baseline worktree is isolated and cleaned', async () => {
  const env = setup();
  // a throw-away repo for the baseline job
  const repo = path.join(env.dir, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  for (const f of ['a', 'b']) fs.copyFileSync(path.join(fixtures, `${f}.fx.mjs`), path.join(repo, `${f}.fx.mjs`));
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't'); git('add', '-A'); git('commit', '-q', '-m', 'base');
  const sha = git('rev-parse', 'HEAD').trim();

  const ids = await Promise.all([
    card(env, 'c1', ['a.fx.mjs', 'b.fx.mjs', 'c.fx.mjs']), card(env, 'c2', ['a.fx.mjs', 'b.fx.mjs', 'c.fx.mjs']),
    card(env, 'c3', ['b.fx.mjs', 'c.fx.mjs', 'd.fx.mjs']), card(env, 'c4', ['a.fx.mjs', 'd.fx.mjs', 'c.fx.mjs']),
    env.submit(['-Kind', 'collect', '-Card', 'col', '-Worktree', fixtures, '-Files', 'a.fx.mjs,b.fx.mjs,c.fx.mjs', '-Env', 'FX_CARD=col;FX_SLEEP=1200']),
    env.submit(['-Kind', 'baseline', '-Card', 'bs', '-Worktree', repo, '-Base', sha, '-Files', 'a.fx.mjs,b.fx.mjs', '-Env', 'FX_CARD=bs;FX_SLEEP=1200']),
  ]);
  const [c1, , , , col, bs] = ids;
  const sched = env.start();                               // started after all submissions so that one tick sees the whole queue
  await env.up();
  const second = env.start();                              // a second instance must refuse while the first lives
  const refused = await second.exited;
  assert.equal(refused.code, 1);
  assert.match(second.stderrText, /already running/);
  let sawWorktree = false;
  await until(() => {
    if (fs.existsSync(path.join(env.tmp, 'base', sha))) sawWorktree = true;
    return ids.every(id => env.result(id));
  }, 120000, 'all six jobs');
  for (const id of ids) assert.equal(env.result(id).status, 'PASS', id);
  assert.equal(env.result(c1).files.length, 3);

  const log = readLog(env.log);
  assert.equal(log.filter(e => e.kind === 'S').length, 12 + 3 + 2);
  assert.ok(overlap(log) <= 3, `global overlap ${overlap(log)} must be <= hardCap 3`);
  assert.ok(overlap(log) >= 2, 'jobs really ran in parallel');
  for (const c of ['c1', 'c2', 'c3', 'c4', 'col', 'bs']) assert.ok(overlap(log, e => e.card === c) <= 2, `card ${c} over its cap`);
  // collect only gets new files admitted once nothing else is queued (admission times from the scheduler's own events)
  const admitted = id => readLog(path.join(env.root, 'jobs', id, 'events.jsonl')).filter(e => e.type === 'admitted').map(e => Date.parse(e.ts));
  const lastOtherAdmit = Math.max(...ids.filter(id => id !== col).flatMap(admitted));
  const firstCollectAdmit = Math.min(...admitted(col));
  assert.ok(firstCollectAdmit >= lastOtherAdmit, 'collect was admitted while other files were still queued');

  // overview: published by the scheduler; run data layout
  const overview = readJson(path.join(env.root, 'overview.json'));
  assert.equal(overview.hardCap, 3); assert.ok(overview.updatedAt); assert.equal(overview.slotsUsed <= 3, true);
  const jobDir = path.join(env.root, 'jobs', c1);
  for (const f of ['request.json', 'events.jsonl', 'result.json', 'summary.md']) assert.ok(fs.existsSync(path.join(jobDir, f)), f);
  assert.equal(fs.readdirSync(path.join(jobDir, 'results')).length, 3);
  const eventTypes = new Set(readLog(path.join(jobDir, 'events.jsonl')).map(e => e.type));
  for (const t of ['queued', 'admitted', 'test_start', 'test_end', 'job_end']) assert.ok(eventTypes.has(t), t);

  // baseline ran in its own worktree under <tmp>/base/<sha>/<runId>, which is removed afterwards without touching link targets
  assert.ok(sawWorktree, 'baseline worktree was created under base/<sha>/');
  const wsDir = path.join(env.tmp, 'base', sha, bs);
  await until(() => !fs.existsSync(wsDir), 30000, 'baseline worktree removal');
  assert.ok(fs.existsSync(path.join(env.nm, 'sentinel.txt')) && fs.existsSync(path.join(env.st, 'sentinel.txt')), 'junction targets must survive');
  assert.equal(git('worktree', 'list').trim().split('\n').length, 1);

  const exit = await env.stop(sched);
  assert.notEqual(exit, 'late');
  assert.ok(!fs.existsSync(path.join(env.root, 'scheduler.lock')), 'lock released on graceful stop');
});

test('duplicate submission yields one job: same runId from submit.ps1, and a raw duplicate request is answered DUPLICATE', async () => {
  const env = setup();
  const sched = env.start(); await env.up();
  const args = ['-Kind', 'card', '-Card', 'dup', '-Worktree', fixtures, '-Files', 'a.fx.mjs,b.fx.mjs', '-TreeHash', 'deadbeef', '-Env', 'FX_CARD=dup;FX_SLEEP=600'];
  const [one, two] = await Promise.all([env.submit(args), env.submit(args)]);
  assert.equal(one, two);
  const request = readJson(path.join(env.root, 'jobs', one, 'request.json'));
  const raw = path.join(env.root, 'jobs', 'manual-dup');
  fs.mkdirSync(raw, { recursive: true });
  fs.writeFileSync(path.join(raw, 'request.json'), JSON.stringify({ ...request, runId: 'manual-dup', createdAt: new Date().toISOString() }));
  await until(() => env.result(one) && env.result('manual-dup'), 60000, 'both results');
  assert.equal(env.result(one).status, 'PASS');
  assert.deepEqual(env.result('manual-dup'), { runId: 'manual-dup', status: 'DUPLICATE', duplicateOf: one });
  assert.equal(readLog(env.log).filter(e => e.kind === 'S').length, 2, 'files ran exactly once');
  await env.stop(sched);
});

test('scheduler killed mid-run: restart takes over the stale lock, marks ORPHANED, keeps their slots (also per card), never reruns; release frees them', async () => {
  const env = setup({ hardCap: 3, perCard: 2 });
  const first = env.start(); await env.up();
  const id = await env.submit(['-Kind', 'card', '-Card', 'orph', '-Worktree', fixtures, '-Files', 'a.fx.mjs,b.fx.mjs,c.fx.mjs', '-Env', 'FX_CARD=orph;FX_SLEEP=6000']);
  const runningNow = () => readJson(path.join(env.root, 'queue.json'))?.jobs?.find(j => j.runId === id)?.files?.filter(f => f.state === 'RUNNING' && f.pid) || [];
  await until(() => runningNow().length === 2, 30000, 'two running files with pids');
  await until(() => readLog(env.log).filter(e => e.kind === 'S').length === 2, 30000, 'both fixtures really started');
  process.kill(first.pid, 'SIGKILL');                       // our own scheduler: no graceful shutdown, the test children keep running
  await first.exited;
  assert.ok(fs.existsSync(path.join(env.root, 'scheduler.lock')), 'stale lock left behind by the kill');
  fs.rmSync(path.join(env.root, 'scheduler.heartbeat'), { force: true });

  const second = env.start(); await env.up();
  const overview = await until(() => { const o = readJson(path.join(env.root, 'overview.json')); return o?.orphanSlots === 2 && o; }, 20000, 'orphans in overview');
  assert.equal(overview.oldestAlert.type, 'ORPHANED');
  assert.equal(overview.slotsUsed, 2);
  await sleep(1500);
  assert.equal(readLog(env.log).filter(e => e.file === 'c').length, 0, 'orphan slots are not reused: the third file stays queued');
  assert.equal(env.result(id), null);
  const orphans = readJson(path.join(env.root, 'queue.json')).orphans;
  assert.equal(orphans.length, 2);
  const release = orphan => { fs.mkdirSync(path.join(env.root, 'control'), { recursive: true }); fs.writeFileSync(path.join(env.root, 'control', `release-${orphan.id}`), ''); };
  release(orphans[0]);                                      // main session verified that exit: now the queued file may take the slot
  const res = await until(() => env.result(id), 40000, 'job result');
  assert.equal(res.status, 'INCOMPLETE');
  assert.deepEqual(res.files.map(f => f.status), ['ORPHANED', 'ORPHANED', 'PASS']);
  const starts = readLog(env.log).filter(e => e.kind === 'S');
  assert.deepEqual(starts.map(e => e.file).sort(), ['a', 'b', 'c'], 'every file started exactly once; orphans were not rerun');
  assert.equal(readJson(path.join(env.root, 'jobs', id, 'results', `${res.files[0].id}.json`)).status, 'INCOMPLETE');
  assert.equal(readJson(path.join(env.root, 'overview.json')).slotsUsed >= 1, true, 'the other orphan still holds its slot');
  release(orphans[1]);
  await until(() => readJson(path.join(env.root, 'overview.json'))?.slotsUsed === 0, 20000, 'all slots released');
  await env.stop(second);
});

test('memory pause/resume with a real scheduler: no start while low, no kill of anything, resumes after the hold', async () => {
  const env = setup();
  const sched = env.start(); await env.up();
  fs.writeFileSync(env.avail, String(Math.round(0.2 * GB)));
  await until(() => readJson(path.join(env.root, 'overview.json'))?.paused === true, 20000, 'pause');
  const id = await card(env, 'mem', ['a.fx.mjs', 'b.fx.mjs']);
  await sleep(2500);
  assert.equal(readLog(env.log).length, 0, 'nothing started while paused');
  assert.equal(env.result(id), null);
  fs.writeFileSync(env.avail, String(Math.round(1.5 * GB)));   // above pause but below resume threshold: still paused
  await sleep(1500);
  assert.equal(readJson(path.join(env.root, 'overview.json')).paused, true);
  fs.writeFileSync(env.avail, String(8 * GB));
  await until(() => env.result(id), 30000, 'job after resume');
  assert.equal(env.result(id).status, 'PASS');
  const alerts = readLog(path.join(env.root, 'alerts.jsonl'));
  assert.equal(alerts.filter(a => a.type === 'RESOURCE_PAUSE').length, 1);
  assert.ok(readLog(path.join(env.root, 'events.jsonl')).some(e => e.type === 'resource_resume'));
  await env.stop(sched);
});
