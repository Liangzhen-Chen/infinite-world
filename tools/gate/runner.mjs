// Bounded single-file test runner (DESIGN 4.2 / 6.1). One test file = one Node
// process with a hard deadline, heartbeats, an exact-PID process-tree kill and an
// atomically written terminal result. Never kills by process name.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn as nodeSpawn } from 'node:child_process';

export const TERMINAL = Object.freeze(['PASS', 'FAIL', 'TIMEOUT', 'CRASH', 'INCOMPLETE']);
const REPORTER = new URL('./reporter.mjs', import.meta.url).href;

const sha = text => crypto.createHash('sha1').update(text).digest('hex').slice(0, 16);

// Fingerprint = error codes + assertion location + actual/expected digests. The
// message text is deliberately excluded (line drift / wording must not matter).
export function failureFingerprint(err) {
  if (!err) return sha('no-error');
  return sha(JSON.stringify([err.code, err.causeCode, err.name, err.operator, err.loc,
    err.actual === undefined ? null : sha(err.actual), err.expected === undefined ? null : sha(err.expected)]));
}

export function parseEventLines(text) {
  const events = [], bad = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { events.push(JSON.parse(line)); } catch { bad.push(line.slice(0, 120)); }
  }
  return { events, bad };
}

// Pure reduction of the reporter's event stream.
export function analyzeEvents(events) {
  const state = { hello: false, summary: null, started: 0, finished: 0, leaf: { pass: 0, fail: 0, skip: 0, todo: 0 },
    failures: [], lastEvent: null, unfinished: [] };
  const stack = [], open = new Map(), seen = new Map();
  const keyOf = e => `${e.n}:${e.line}:${e.col}:${e.name}`;
  for (const e of events) {
    if (e.t === 'hello') state.hello = true;
    else if (e.t === 'summary') state.summary = e;
    else if (e.t === 'start') {
      state.started++; stack.length = e.n; stack[e.n] = e.name;
      open.set(keyOf(e), (open.get(keyOf(e)) ?? 0) + 1);
      const pathKey = stack.join(' > ');
      seen.set(pathKey, (seen.get(pathKey) ?? 0) + 1);
    } else if (e.t === 'pass' || e.t === 'fail') {
      state.finished++;
      const key = keyOf(e);
      if (open.get(key) > 0) open.set(key, open.get(key) - 1);
      const pathParts = [...stack.slice(0, e.n), e.name];
      const pathKey = pathParts.join(' > ');
      const duplicate = seen.get(pathKey) > 1 ? ` #${seen.get(pathKey)}` : '';
      const suite = e.kind === 'suite' || e.fileLevel === true;
      if (e.t === 'pass') {
        if (!suite) { state.leaf.pass++; if (e.skip) state.leaf.skip++; if (e.todo) state.leaf.todo++; }
      } else if (e.err?.failureType !== 'subtestsFailed') {
        // A parent that only reports "N subtests failed" is not a new assertion failure.
        if (!suite) state.leaf.fail++;
        state.failures.push({ path: pathParts, id: pathKey + duplicate, kind: e.kind, line: e.line, code: e.err?.code ?? null,
          failureType: e.err?.failureType ?? null, location: e.err?.loc ?? null, fingerprint: failureFingerprint(e.err),
          detail: e.err?.detail ?? null });
      }
    }
    if (e.t === 'start' || e.t === 'pass' || e.t === 'fail') state.lastEvent = { t: e.t, name: e.name, n: e.n };
  }
  state.unfinished = [...open].filter(([, count]) => count > 0).map(([key]) => key);
  return state;
}

// DESIGN 6.1: PASS needs exit 0, no signal/timeout/spawn error, a complete event
// stream with a summary, every started case finished, >=1 case, no unauthorised skip/todo.
export function classify(analysis, proc, options = {}) {
  const { allowSkip = false, allowZeroTests = false } = options;
  const counts = analysis.summary?.counts;
  const out = (status, reason) => ({ status, reason });
  if (proc.spawnError) return out('CRASH', `spawn-error: ${proc.spawnError}`);
  if (proc.timedOut) return out('TIMEOUT', 'deadline exceeded');
  if (proc.signal) return out('CRASH', `signal ${proc.signal}`);
  if (proc.exitCode !== 0) {
    if (analysis.failures.length) return out('FAIL', `exit ${proc.exitCode}, ${analysis.failures.length} failing`);
    if (!analysis.hello) return out('INCOMPLETE', `exit ${proc.exitCode} before reporter loaded`);
    if (!analysis.summary) return out('CRASH', `exit ${proc.exitCode} without summary`);
    return out('INCOMPLETE', `exit ${proc.exitCode} with no failing case`);
  }
  if (!analysis.hello) return out('INCOMPLETE', 'reporter produced no events');
  if (!analysis.summary) return out('INCOMPLETE', 'event stream has no summary');
  if (analysis.failures.length || counts?.failed > 0) return out('FAIL', 'failing cases with exit 0');
  if (counts?.cancelled > 0) return out('INCOMPLETE', `${counts.cancelled} cancelled`);
  if (analysis.unfinished.length) return out('INCOMPLETE', `${analysis.unfinished.length} started case(s) never finished`);
  if (!allowZeroTests && analysis.leaf.pass + analysis.leaf.fail === 0) return out('INCOMPLETE', 'zero test cases');
  if (!allowSkip && ((counts?.skipped ?? 0) > 0 || (counts?.todo ?? 0) > 0 || analysis.leaf.skip || analysis.leaf.todo))
    return out('INCOMPLETE', 'unauthorised skip/todo');
  return out('PASS', 'ok');
}

export function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temp, file);
}

// Appending event sink for the caller's onEvent; mtime of the file is the heartbeat for watchdog.ps1.
export function fileEventSink(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return event => fs.appendFileSync(file, `${JSON.stringify(event)}\n`);
}

const run = (command, args) => new Promise(resolve =>
  execFile(command, args, { windowsHide: true, timeout: 15000 }, (error, stdout) => resolve({ error, stdout: String(stdout || '') })));

export async function processStartTime(pid) {
  if (process.platform === 'win32') {
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `(Get-Process -Id ${Number(pid)} -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o')`]);
    return stdout.trim() || null;
  }
  const { stdout } = await run('ps', ['-o', 'lstart=', '-p', String(pid)]);
  return stdout.trim() || null;
}

export async function sampleMemory(pid) {
  if (process.platform === 'win32') {
    const { stdout } = await run('tasklist', ['/FI', `PID eq ${Number(pid)}`, '/FO', 'CSV', '/NH']);
    const fields = stdout.trim().split('","');
    const kb = Number((fields[4] || '').replace(/\D/g, ''));
    return kb ? kb * 1024 : null;
  }
  const { stdout } = await run('ps', ['-o', 'rss=', '-p', String(pid)]);
  const kb = Number(stdout.trim());
  return kb ? kb * 1024 : null;
}

// Exact-PID kill only. `force=false` is the polite request, `force=true` the tree kill.
export async function killTree(pid, force) {
  if (process.platform === 'win32') {
    const { error } = await run('taskkill', ['/PID', String(Number(pid)), '/T', ...(force ? ['/F'] : [])]);
    return !error;
  }
  try { process.kill(force ? -pid : pid, force ? 'SIGKILL' : 'SIGTERM'); return true; } catch { try { process.kill(pid, force ? 'SIGKILL' : 'SIGTERM'); return true; } catch { return false; } }
}

class Tail {
  constructor(maxLines = 60, maxLine = 400) { this.lines = []; this.partial = ''; this.maxLines = maxLines; this.maxLine = maxLine; this.bytes = 0; }
  push(chunk) {
    this.bytes += chunk.length;
    this.partial += chunk.toString('utf8');
    const parts = this.partial.split(/\r?\n/);
    this.partial = parts.pop().slice(-65536);
    for (const line of parts) { this.lines.push(line.slice(0, this.maxLine)); if (this.lines.length > this.maxLines) this.lines.shift(); }
  }
  snapshot() { return [...this.lines, ...(this.partial ? [this.partial.slice(0, this.maxLine)] : [])].slice(-this.maxLines); }
}

/**
 * Run one test file in its own Node process. `deadline` is the hard timeout in ms
 * counted from process start. Returns a terminal result (never rejects).
 * Injectable for tests: spawn, killTree, processStartTime, sampleMemory,
 * heartbeatMs, graceMs, killWaitMs, resultFile, eventsFile, allowSkip, allowZeroTests, nodeArgs.
 */
export async function runFile({ cwd, file, deadline = 600000, runId = `run-${Date.now()}`, ownerSession = null, env = {}, onEvent = () => {},
  heartbeatMs = 15000, graceMs = 10000, killWaitMs = 5000, resultFile, eventsFile, allowSkip = false, allowZeroTests = false, nodeArgs = [],
  spawn = nodeSpawn, kill = killTree, startTimeOf = processStartTime, memoryOf = sampleMemory } = {}) {
  const ownDir = eventsFile ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'gate-run-'));
  const events = eventsFile || path.join(ownDir, 'events.jsonl');
  fs.mkdirSync(path.dirname(events), { recursive: true });
  fs.writeFileSync(events, '');
  const emit = event => { try { onEvent({ runId, file, ownerSession, ts: new Date().toISOString(), ...event }); } catch { /* sink errors never kill a run */ } };
  const startedAt = Date.now();
  const proc = { exitCode: null, signal: null, timedOut: false, spawnError: null };
  const killInfo = { requested: false, forced: false, refused: false, failed: false };
  const tail = new Tail();
  let startTimeP = Promise.resolve(), child, pid = null, startTime = null, peak = null, offset = 0, carry = '', parsed = [], badLines = 0;

  const readEvents = () => {
    try {
      const size = fs.statSync(events).size;
      if (size <= offset) return;
      const fd = fs.openSync(events, 'r');
      const buffer = Buffer.alloc(size - offset);
      fs.readSync(fd, buffer, 0, buffer.length, offset); fs.closeSync(fd);
      offset = size;
      const text = carry + buffer.toString('utf8');
      const cut = text.lastIndexOf('\n');
      carry = text.slice(cut + 1);
      const { events: fresh, bad } = parseEventLines(text.slice(0, cut + 1));
      parsed.push(...fresh); badLines += bad.length;
    } catch { /* file not there yet */ }
  };

  const exited = new Promise(resolve => {
    try {
      child = spawn(process.execPath, [...nodeArgs, '--test', '--test-isolation=none',
        '--test-reporter=spec', '--test-reporter-destination=stdout',
        `--test-reporter=${REPORTER}`, '--test-reporter-destination=stderr', file],
      { cwd, env: { ...process.env, ...env, GATE_EVENTS_FILE: events }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (error) { proc.spawnError = error.message; resolve(); return; }
    pid = child.pid ?? null;
    child.stdout?.on('data', chunk => tail.push(chunk));
    child.stderr?.on('data', chunk => tail.push(chunk));
    child.once('error', error => { proc.spawnError = error.message; resolve(); });
    child.once('exit', (code, signal) => { proc.exitCode = code; proc.signal = signal; setTimeout(resolve, 1500).unref?.(); child.once('close', resolve); });
  });
  let exitedFlag = false;
  exited.then(() => { exitedFlag = true; });

  if (pid != null) {
    // Registered identity: PID + creation time, checked again before any forced kill.
    emit({ type: 'start', pid, cwd, deadlineMs: deadline, deadlineAt: new Date(startedAt + deadline).toISOString() });
    startTimeP = Promise.resolve(startTimeOf(pid)).then(value => { startTime = value; }, () => {});
  }

  const stillOurs = async () => {
    if (!pid || exitedFlag || child.exitCode !== null || child.signalCode !== null) return false;
    await startTimeP;
    if (startTime) {
      const now = await startTimeOf(pid);
      if (now && now !== startTime) { killInfo.refused = true; return false; }
    }
    return true;
  };

  const sample = async () => {
    if (!pid || exitedFlag) return;
    try { const bytes = await memoryOf(pid); if (bytes && (peak == null || bytes > peak)) peak = bytes; } catch { /* optional */ }
  };
  const first = setTimeout(sample, Math.min(heartbeatMs, 1000));
  const beat = setInterval(async () => {
    readEvents(); await sample();
    emit({ type: 'heartbeat', pid, elapsedMs: Date.now() - startedAt, lastEvent: analyzeEvents(parsed).lastEvent, events: parsed.length,
      deadlineAt: new Date(startedAt + deadline).toISOString(), memBytes: peak, outputBytes: tail.bytes });
  }, heartbeatMs);

  const deadlineTimer = pid != null ? setTimeout(async () => {
    if (exitedFlag) return;
    proc.timedOut = true; killInfo.requested = true;
    emit({ type: 'kill-request', pid, elapsedMs: Date.now() - startedAt });
    try { await kill(pid, false); } catch { /* best effort */ }
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, graceMs))]);
    if (exitedFlag) return;
    if (await stillOurs()) {
      killInfo.forced = true;
      emit({ type: 'kill-force', pid, elapsedMs: Date.now() - startedAt });
      try { killInfo.failed = !(await kill(pid, true)); } catch { killInfo.failed = true; }
    }
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, killWaitMs))]);
    if (!exitedFlag) { killInfo.failed = true; exitedForce(); }
  }, deadline) : null;
  let exitedForce = () => {};
  const forced = new Promise(resolve => { exitedForce = resolve; });

  await Promise.race([exited, forced]);
  clearTimeout(first); clearInterval(beat); clearTimeout(deadlineTimer);
  readEvents();
  if (carry.trim()) { const { events: last } = parseEventLines(carry); parsed.push(...last); carry = ''; }
  const analysis = analyzeEvents(parsed);
  const verdict = classify(analysis, proc, { allowSkip, allowZeroTests });
  const endedAt = Date.now();
  const result = { runId, ownerSession, file, status: verdict.status, reason: verdict.reason, exitCode: proc.exitCode, signal: proc.signal,
    timedOut: proc.timedOut, pid, startedAt: new Date(startedAt).toISOString(), endedAt: new Date(endedAt).toISOString(),
    durationMs: endedAt - startedAt, deadlineMs: deadline, peakMemBytes: peak, killed: killInfo,
    streamComplete: !!analysis.summary && !analysis.unfinished.length, badEventLines: badLines,
    counts: analysis.summary?.counts ?? null, failures: analysis.failures, lastEvent: analysis.lastEvent,
    specTail: tail.snapshot() };
  if (proc.spawnError) result.spawnError = proc.spawnError;
  if (resultFile) writeJsonAtomic(resultFile, result);
  emit({ type: 'end', status: result.status, reason: result.reason, durationMs: result.durationMs, exitCode: result.exitCode });
  if (ownDir) fs.rmSync(ownDir, { recursive: true, force: true });
  return result;
}
