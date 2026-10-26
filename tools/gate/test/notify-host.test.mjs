// Real-process tests for tools/gate/notify.ps1: a real powershell child polls real files in a temp root.
// Thresholds and poll interval are injected short. Only child PIDs started here are ever killed.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const gate = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const scratch = fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), 'notify-host-'));
const started = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let n = 0;
after(async () => {
  for (const pid of started) { try { process.kill(pid, 0); process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
  await sleep(200);
  fs.rmSync(scratch, { recursive: true, force: true });
});

function env() {
  const dir = path.join(scratch, `n${++n}`);
  const e = { root: path.join(dir, 'gate'), sessions: path.join(dir, 'sessions') };
  fs.mkdirSync(e.root, { recursive: true }); fs.mkdirSync(e.sessions, { recursive: true });
  e.beat = () => fs.writeFileSync(path.join(e.root, 'scheduler.heartbeat'), String(Date.now()));
  e.alert = (runId, type, dedupe) => fs.appendFileSync(path.join(e.root, 'alerts.jsonl'), `${JSON.stringify({ ts: new Date().toISOString(), runId, type, message: `fixture ${type}`, dedupe: dedupe ?? `${runId}:${type}` })}\n`);
  return e;
}

// Starts notify.ps1; resolves with {code, out, ms} when it exits.
function notify(e, extra = []) {
  const t0 = Date.now();
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(gate, 'notify.ps1'),
    '-Root', e.root, '-Sessions', e.sessions, '-PollSec', '0.3', ...extra],
  { env: { ...process.env, TEMP: process.env.TEMP || 'F:/dnd-tmp', TMP: process.env.TMP || 'F:/dnd-tmp' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  started.push(child.pid);
  let out = ''; child.stdout.setEncoding('utf8'); child.stdout.on('data', d => { out += d; });
  let err = ''; child.stderr.on('data', d => { err += d; });
  const done = new Promise(resolve => child.once('exit', code => resolve({ code, out, err, ms: Date.now() - t0 })));
  const killer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, 60000);
  done.then(() => clearTimeout(killer));
  return done;
}

test('an unacked alert makes notify exit 10 with the reason and the ack path', async () => {
  const e = env(); e.beat(); e.alert('card-x-1', 'TIMEOUT', 'card-x-1:TIMEOUT:a.mjs');
  const r = await notify(e, ['-HeartbeatStaleSec', '0']);
  assert.equal(r.code, 10, r.err);
  assert.match(r.out, /NOTIFY\[alert\].*TIMEOUT.*card-x-1/);
  assert.match(r.out, /ack-card-x-1_TIMEOUT_a\.mjs/);
});

test('an alert written while notify is already waiting is picked up', async () => {
  const e = env(); e.beat();
  const pending = notify(e, ['-HeartbeatStaleSec', '0']);
  await sleep(2500);
  e.alert('job-late', 'WAIT_5MIN');
  const r = await pending;
  assert.equal(r.code, 10); assert.match(r.out, /WAIT_5MIN/); assert.ok(r.ms >= 2000, `fired too early: ${r.ms}`);
});

test('unacked alert is reported again on every restart; after ack it is not, and a new alert still is', async () => {
  const e = env(); e.beat(); e.alert('job-a', 'WAIT_5MIN');
  assert.equal((await notify(e, ['-HeartbeatStaleSec', '0'])).code, 10);
  assert.equal((await notify(e, ['-HeartbeatStaleSec', '0'])).code, 10, 'still unacked -> reported again');
  fs.mkdirSync(path.join(e.root, 'control'), { recursive: true });
  fs.writeFileSync(path.join(e.root, 'control', 'ack-job-a_WAIT_5MIN'), '');
  const quiet = await notify(e, ['-HeartbeatStaleSec', '0', '-MaxWaitSec', '2']);
  assert.equal(quiet.code, 0, quiet.out); assert.equal(quiet.out.trim(), '');
  e.alert('job-b', 'WAIT_5MIN');
  const r = await notify(e, ['-HeartbeatStaleSec', '0']);
  assert.equal(r.code, 10); assert.match(r.out, /job-b/); assert.doesNotMatch(r.out, /job-a/);
});

test('scheduler heartbeat that stops updating is reported (exit 13) once it is older than the injected threshold', async () => {
  const e = env(); e.beat();
  const r = await notify(e, ['-HeartbeatStaleSec', '2']);
  assert.equal(r.code, 13, r.err); assert.match(r.out, /NOTIFY\[heartbeat\].*心跳/);
  assert.ok(r.ms >= 1500, `must not fire before the threshold: ${r.ms}`);
});

test('a heartbeat that keeps updating never triggers', async () => {
  const e = env();
  const timer = setInterval(e.beat, 500); e.beat();
  const r = await notify(e, ['-HeartbeatStaleSec', '3', '-MaxWaitSec', '5']);
  clearInterval(timer);
  assert.equal(r.code, 0, r.out);
});

test('a watched card whose log stops moving is reported stalled (exit 11); an unwatched stalled card is not', async () => {
  const e = env(); e.beat();
  const now = Math.floor(Date.now() / 1000);
  for (const name of ['watched', 'other']) {
    fs.writeFileSync(path.join(e.sessions, `${name}.start`), `${now} 75\n`);
    fs.writeFileSync(path.join(e.sessions, `${name}.log`), 'working\n');
  }
  const r = await notify(e, ['-HeartbeatStaleSec', '0', '-CardStallSec', '2', '-Cards', 'watched']);
  assert.equal(r.code, 11, r.err);
  assert.match(r.out, /卡 watched 卡死/); assert.doesNotMatch(r.out, /other/);
  assert.ok(r.ms >= 1500, `must not fire before the stall threshold: ${r.ms}`);
});

test('a watched card that keeps writing its log is not stalled; delivering it triggers exit 11', async () => {
  const e = env(); e.beat();
  fs.writeFileSync(path.join(e.sessions, 'busy.start'), `${Math.floor(Date.now() / 1000)} 75\n`);
  const logFile = path.join(e.sessions, 'busy.log');
  const timer = setInterval(() => fs.appendFileSync(logFile, 'tick\n'), 400);
  const pending = notify(e, ['-HeartbeatStaleSec', '0', '-CardStallSec', '2', '-Cards', 'busy']);
  await sleep(4500);
  clearInterval(timer);
  fs.writeFileSync(path.join(e.sessions, 'busy.last.txt'), 'done');
  const r = await pending;
  assert.equal(r.code, 11); assert.match(r.out, /已交卡/); assert.ok(r.ms >= 4000, `stalled falsely: ${r.ms}`);
});

test('a watched job ending (result.json appears) triggers exit 12', async () => {
  const e = env(); e.beat();
  const dir = path.join(e.root, 'jobs', 'card-w-1'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'request.json'), JSON.stringify({ runId: 'card-w-1', kind: 'card', cardId: 'w' }));
  const pending = notify(e, ['-HeartbeatStaleSec', '0', '-Jobs', 'card-w-1']);
  await sleep(2000);
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({ runId: 'card-w-1', cardId: 'w', status: 'PASS', files: [], queuedMs: 1, runMs: 2 }));
  const r = await pending;
  assert.equal(r.code, 12); assert.match(r.out, /card-w-1 已结束：PASS/);
});
