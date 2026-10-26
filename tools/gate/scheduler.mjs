// Whole-machine single-file test scheduler (DESIGN 3.1 / 4.1 / 7, P0b + section 14.1).
// One long-lived instance per machine (lock file with PID + creation time). Every job kind
// (card gate, baseline rerun, full scan, collect) expands to single-file tasks run by
// runner.runFile through ONE pool. Admission = hard slot cap + per-card cap + memory
// reservation. The scheduler is the only writer of queue.json / overview.json.
// Usage: node scheduler.mjs [--root F:/dnd/logs/gate] [--tmp F:/dnd-tmp/gate] [--policy file]
//        [--avail-file f]   (test seam: read "available bytes" from a file instead of os.freemem)
// Control files in <root>/control/: stop, cancel-<runId>, release-<orphanId> (orphanId = runId__fileId).
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runFile as realRunFile, writeJsonAtomic, processStartTime } from './runner.mjs';
import { readMap } from './test-impact/common.mjs';

export const PRIORITY = Object.freeze({ core: 0, gate: 1, card: 2, scan: 3, collect: 4 });
const DEFAULT_PRIORITY = { card: 'gate', baseline: 'gate', full: 'scan', collect: 'collect' };
const KINDS = Object.keys(DEFAULT_PRIORITY);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const sha = text => crypto.createHash('sha1').update(text).digest('hex');
const safe = text => String(text).replace(/[^\w.-]+/g, '_').slice(0, 60);
const inside = (child, parent) => { const rel = path.relative(path.resolve(parent), path.resolve(child)); return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel); };

export function loadPolicy(file = path.join(HERE, 'policy', 'resources.json'), overrides = {}) {
  return { ...JSON.parse(fs.readFileSync(file, 'utf8')), ...overrides };
}

export const p95 = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.max(0, Math.ceil(0.95 * sorted.length) - 1)] : 0;
};

// Idempotency key: same card + same tree (+ base/snapshot/file list) is one job, unless `rerun`.
export function jobKey(r) {
  if (r.rerun || !(r.treeHash || r.snapshot || r.base)) return null;
  return sha([r.kind, r.cardId || '', r.treeHash || '', r.base || '', r.snapshot || '', sha((r.files || []).join('\n'))].join('|'));
}

// ---- single-instance lock -------------------------------------------------------------
const isAliveDefault = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };

export async function acquireLock(root, { pid = process.pid, isAlive = isAliveDefault, startTimeOf = processStartTime, now = () => new Date() } = {}) {
  const file = path.join(root, 'scheduler.lock');
  fs.mkdirSync(root, { recursive: true });
  const mine = { pid, createdAt: now().toISOString(), startTime: await Promise.resolve(startTimeOf(pid)).catch(() => null) };
  for (let attempt = 0; attempt < 3; attempt++) {
    try { fs.writeFileSync(file, JSON.stringify(mine), { flag: 'wx' }); return { file, info: mine, release: () => releaseLock(file, pid) }; }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    let held = null;
    try { held = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* corrupt lock: treat as stale */ }
    if (held?.pid && isAlive(held.pid)) {
      const current = held.startTime ? await Promise.resolve(startTimeOf(held.pid)).catch(() => null) : null;
      if (!held.startTime || !current || current === held.startTime) throw new Error(`scheduler already running (pid ${held.pid}, since ${held.createdAt})`);
    }
    const stale = `${file}.stale.${pid}.${Date.now()}`;
    try { fs.renameSync(file, stale); fs.rmSync(stale, { force: true }); } catch { /* someone else took it over; retry wx */ }
  }
  throw new Error('could not acquire scheduler lock');
}
export function releaseLock(file, pid = process.pid) {
  try { if (JSON.parse(fs.readFileSync(file, 'utf8')).pid === pid) fs.rmSync(file, { force: true }); } catch { /* already gone */ }
}

// ---- workspaces (baseline / snapshot worktrees) ------------------------------------------
const git = (cwd, args) => new Promise((resolve, reject) =>
  execFile('git', ['-C', cwd, ...args], { windowsHide: true, timeout: 120000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) =>
    error ? reject(new Error(`git ${args[0]} failed: ${String(stderr || error.message).slice(0, 300)}`)) : resolve(String(stdout))));

export async function defaultPrepare(job, { tmpRoot, policy }) {
  const r = job.request;
  const rev = r.kind === 'baseline' ? r.base : r.snapshot;
  if (!rev) {
    if (!r.worktree) throw new Error('request has no worktree');
    return { cwd: r.worktree, created: false };
  }
  const ctx = r.worktree || policy.repo;
  const dir = path.join(tmpRoot, r.kind === 'baseline' ? 'base' : 'snap', safe(rev), safe(job.runId));
  if (!inside(dir, tmpRoot)) throw new Error('workspace path escapes tmp root');
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  await git(ctx, ['worktree', 'add', '--detach', dir, rev]);
  for (const [name, target] of Object.entries(policy.links || {})) {
    const link = path.join(dir, name);
    if (fs.existsSync(target) && !fs.existsSync(link)) fs.symlinkSync(target, link, 'junction');
  }
  return { cwd: dir, created: true, ctx };
}

// Remove junction links themselves first (never recurse into their targets), then the worktree.
export async function defaultRelease(job, workspace, { tmpRoot }) {
  if (!workspace?.created) return;
  const dir = workspace.cwd;
  if (!inside(dir, tmpRoot)) return;
  const links = () => (fs.existsSync(dir) ? fs.readdirSync(dir) : []).map(n => path.join(dir, n)).filter(p => { try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; } });
  for (const link of links()) {
    try { fs.unlinkSync(link); } catch { try { fs.rmdirSync(link); } catch { /* handled by the check below */ } }
  }
  if (links().length) return;                           // a link could not be removed: never let git/rm recurse into its target
  try { await git(workspace.ctx, ['worktree', 'remove', '--force', dir]); } catch { /* fall through to prune */ }
  try { await git(workspace.ctx, ['worktree', 'prune']); } catch { /* best effort */ }
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

// ---- the scheduler ------------------------------------------------------------------------
export class Scheduler {
  constructor({ root, tmpRoot, policy = loadPolicy(), now = Date.now, availMem = async () => os.freemem(), runFile = realRunFile,
    prepareWorkspace = defaultPrepare, releaseWorkspace = defaultRelease, runnerOptions = {}, log = () => {}, slowTestsFile = path.join(HERE, 'slow-tests.tsv'), slowTests = null, collectLib = () => import('./test-impact/collect.mjs') } = {}) {
    Object.assign(this, { collectLib, slowTestsFile, slowSet: slowTests, root, tmpRoot, policy, now, availMem, runFile, prepareWorkspace, releaseWorkspace, runnerOptions, log });
    this.jobsDir = path.join(root, 'jobs');
    this.jobs = new Map(); this.byKey = new Map(); this.running = new Map(); this.orphans = new Map(); this.pending = new Set();
    this.seq = 0; this.dirty = true; this.overviewDirty = true; this.ticking = false; this.stopping = false; this.stopped = false;
    this.lastAvail = null; this.lastSampleAt = null; this.lowCount = 0; this.paused = false; this.okSince = null; this.pauseCount = 0;
    this.alertKeys = new Set(); this.activeAlerts = new Map(); this.lastHeartbeat = -Infinity; this.lastOverview = -Infinity;
    this.history = {}; this.collectCtxs = new Map(); this.aggregating = new Set();
  }

  // -- persistence --
  path(...parts) { return path.join(this.root, ...parts); }
  track(promise) { this.pending.add(promise); promise.finally(() => this.pending.delete(promise)); }
  load() {
    fs.mkdirSync(this.jobsDir, { recursive: true });
    try { this.history = JSON.parse(fs.readFileSync(this.path('history.json'), 'utf8')); } catch { this.history = {}; }
    try {
      for (const line of fs.readFileSync(this.path('alerts.jsonl'), 'utf8').split('\n')) if (line.trim()) { try { this.alertKeys.add(JSON.parse(line).dedupe); } catch { /* skip */ } }
    } catch { /* none yet */ }
    let saved = null;
    try { saved = JSON.parse(fs.readFileSync(this.path('queue.json'), 'utf8')); } catch { /* fresh */ }
    if (!saved) return;
    this.seq = saved.seq || 0;
    for (const o of saved.orphans || []) {
      this.orphans.set(o.id, o);
      this.activate('ORPHANED', o.runId, `orphan ${o.id} (pid ${o.pid ?? '?'}) holds ${o.slots} slot(s)`, o.id);
    }
    for (const j of saved.jobs || []) {
      const job = { ...j, request: j.request || {}, files: j.files || [] };
      this.jobs.set(job.runId, job);
      if (job.key) this.byKey.set(job.key, job.runId);
    }
    for (const job of [...this.jobs.values()]) {
      if (job.terminal) continue;
      // Crash recovery: whatever was RUNNING is unverifiable -> ORPHANED/INCOMPLETE, slots stay held, never re-run.
      for (const f of job.files) if (f.state === 'RUNNING') {
        f.state = 'DONE'; f.status = 'ORPHANED'; f.reason = 'scheduler restarted while running; exit unverified'; f.endedAt = this.now();
        f.summary = { counts: null, durationMs: null, peakMemBytes: null, exitCode: null, timedOut: false, failures: [] };
        const id = `${job.runId}__${f.id}`;
        this.orphans.set(id, { id, runId: job.runId, file: f.file, pid: f.pid ?? null, slots: f.slots || 1, since: this.now() });
        writeJsonAtomic(path.join(this.jobsDir, job.runId, 'results', `${f.id}.json`), { runId: job.runId, file: f.file, status: 'INCOMPLETE', reason: f.reason, orphaned: true, pid: f.pid ?? null });
        this.alert('ORPHANED', job.runId, `${f.file} pid ${f.pid ?? '?'} orphaned by scheduler restart; slots held`, id);
      }
      this.maybeFinish(job);
    }
    this.dirty = this.overviewDirty = true;
  }
  persist() {
    if (!this.dirty) return;
    this.dirty = false;
    const all = [...this.jobs.values()].sort((a, b) => a.seq - b.seq);
    const terminal = all.filter(j => j.terminal).slice(-2000).map(j => ({ runId: j.runId, key: j.key, seq: j.seq, kind: j.kind, cardId: j.cardId, status: j.status, terminal: true, endedAt: j.endedAt, files: [], request: {} }));
    const live = all.filter(j => !j.terminal).map(({ wsPromise, ...rest }) => rest);
    writeJsonAtomic(this.path('queue.json'), { updatedAt: new Date(this.now()).toISOString(), seq: this.seq, orphans: [...this.orphans.values()], jobs: [...terminal, ...live] });
  }

  // -- events / alerts --
  event(job, type, extra = {}) {
    const line = JSON.stringify({ ts: new Date(this.now()).toISOString(), runId: job?.runId ?? null, type, ...extra });
    try { fs.appendFileSync(job ? path.join(this.jobsDir, job.runId, 'events.jsonl') : this.path('events.jsonl'), `${line}\n`); } catch { /* disk trouble must not stop admission */ }
  }
  alert(type, runId, message, suffix = '') {
    const dedupe = `${runId}:${type}${suffix ? `:${suffix}` : ''}`;
    if (this.alertKeys.has(dedupe)) return;
    this.alertKeys.add(dedupe);
    this.activate(type, runId, message, suffix);
    try { fs.mkdirSync(this.root, { recursive: true }); fs.appendFileSync(this.path('alerts.jsonl'), `${JSON.stringify({ ts: new Date(this.now()).toISOString(), runId, type, message, dedupe })}\n`); } catch { /* ignore */ }
    this.event(this.jobs.get(runId) || null, 'alert', { alert: type, message });
  }
  activate(type, runId, message, suffix = '') { this.activeAlerts.set(`${runId}:${type}${suffix ? `:${suffix}` : ''}`, { ts: this.now(), type, runId, message }); this.overviewDirty = true; }
  clearAlert(runId, type, suffix = '') { if (this.activeAlerts.delete(`${runId}:${type}${suffix ? `:${suffix}` : ''}`)) this.overviewDirty = true; }

  // -- intake --
  scanRequests() {
    let names; try { names = fs.readdirSync(this.jobsDir); } catch { return; }
    const fresh = [];
    for (const runId of names) {
      if (this.jobs.has(runId)) continue;
      const dir = path.join(this.jobsDir, runId);
      if (!fs.existsSync(path.join(dir, 'request.json')) || fs.existsSync(path.join(dir, 'result.json'))) continue;
      let request; try { request = JSON.parse(fs.readFileSync(path.join(dir, 'request.json'), 'utf8')); } catch { continue; } // half-written: next tick
      fresh.push({ ...request, runId });
    }
    // FIFO must follow submission order, not directory-listing order.
    fresh.sort((x, y) => String(x.createdAt || '').localeCompare(String(y.createdAt || '')) || x.runId.localeCompare(y.runId));
    for (const request of fresh) this.ingest(request);
  }
  ingest(raw) {
    const runId = raw.runId, dir = path.join(this.jobsDir, runId);
    const reject = reason => {
      const job = { runId, kind: raw.kind, cardId: raw.cardId ?? raw.card ?? null, request: {}, files: [], seq: ++this.seq, createdAt: this.now(), endedAt: this.now(), terminal: true, status: 'INCOMPLETE', key: null };
      this.jobs.set(runId, job);
      writeJsonAtomic(path.join(dir, 'result.json'), { runId, status: 'INCOMPLETE', reason: `invalid-request: ${reason}`, files: [] });
      this.dirty = true; return job;
    };
    if (!KINDS.includes(raw.kind)) return reject(`unknown kind ${raw.kind}`);
    let files = raw.files || [];
    if (raw.filesFile) { try { files = fs.readFileSync(raw.filesFile, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean); } catch { return reject('filesFile unreadable'); } }
    files = [...new Set(files)];
    if (!files.length) return reject('no files');
    if (raw.kind === 'baseline' && !raw.base) return reject('baseline needs base');
    if (raw.kind === 'collect' && !raw.map) return reject('collect needs map (coverage map file)');
    if (!raw.worktree && !raw.snapshot && !(raw.kind === 'baseline' && raw.base)) return reject('needs worktree or snapshot');
    const priority = raw.priority && PRIORITY[raw.priority] !== undefined ? raw.priority : DEFAULT_PRIORITY[raw.kind];
    const cardId = raw.cardId ?? raw.card ?? null;
    const request = { ...raw, cardId, files, rerun: !!raw.rerun };
    const key = jobKey(request);
    const first = key && this.byKey.get(key);
    if (first && first !== runId) {
      writeJsonAtomic(path.join(dir, 'result.json'), { runId, status: 'DUPLICATE', duplicateOf: first });
      const job = { runId, kind: raw.kind, request: {}, files: [], seq: ++this.seq, terminal: true, status: 'DUPLICATE', duplicateOf: first, key: null };
      this.jobs.set(runId, job); this.dirty = true; return job;
    }
    const t = this.now();
    const job = { runId, key, kind: raw.kind, cardId, owner: raw.ownerSession ?? null, priority, prio: PRIORITY[priority],
      seq: ++this.seq, createdAt: t, lastAdmitAt: t, request, status: 'QUEUED', terminal: false, workspace: null,
      files: files.map((file, i) => ({ id: `${String(i).padStart(3, '0')}-${safe(path.basename(file))}`, file, state: 'QUEUED', status: null, queuedAt: t, blocked: false })) };
    this.jobs.set(runId, job);
    if (key) this.byKey.set(key, runId);
    this.event(job, 'queued', { kind: job.kind, cardId, priority, files: files.length });
    this.dirty = this.overviewDirty = true;
    return job;
  }
  scanControl() {
    const dir = this.path('control');
    let names; try { names = fs.readdirSync(dir); } catch { return; }
    for (const name of names) {
      let handled = true;
      if (name === 'stop') this.stopping = true;
      else if (name.startsWith('cancel-')) this.cancel(name.slice(7));
      else if (name.startsWith('release-')) this.releaseOrphan(name.slice(8));
      else handled = false;
      if (handled) fs.rmSync(path.join(dir, name), { force: true });
    }
  }
  // Queued files are dropped; a file already running finishes at its own deadline (never force-killed here).
  cancel(runId) {
    const job = this.jobs.get(runId);
    if (!job || job.terminal) return;
    for (const f of job.files) if (f.state === 'QUEUED') this.settle(job, f, { status: 'INCOMPLETE', reason: 'cancelled before start' });
    this.event(job, 'cancel', {});
    this.maybeFinish(job);
  }
  releaseOrphan(id) {
    const o = this.orphans.get(id);
    if (!o) return;
    this.orphans.delete(id); this.clearAlert(o.runId, 'ORPHANED', id);
    const job = this.jobs.get(o.runId);
    this.event(job || null, 'orphan_released', { orphan: id });
    if (job?.terminal) this.cleanupWorkspace(job);
    this.dirty = this.overviewDirty = true;
  }

  // -- accounting --
  slotsInUse() { let n = 0; for (const r of this.running.values()) n += r.slots; for (const o of this.orphans.values()) n += o.slots; return n; }
  // Orphans may still be running, so they keep counting against their card as well.
  cardSlots(cardId) {
    let n = 0;
    for (const r of this.running.values()) if (r.cardId === cardId) n += r.slots;
    for (const o of this.orphans.values()) if (this.jobs.get(o.runId)?.cardId === cardId) n += o.slots;
    return n;
  }
  classOf(job, file) {
    if (job.kind === 'collect') return 'coverage';
    return new RegExp(this.policy.browserPattern || '$^', 'i').test(file.file) ? 'browser' : 'normal';
  }
  reservationOf(job, file) {
    const cls = this.classOf(job, file), a = this.policy.adaptive || {};
    const peaks = (this.history[`${cls}:${file.file}`] || []).slice(-(a.window || 20));
    if (peaks.length >= (a.minSamples || 5)) return Math.max(a.floorBytes, Math.round(a.factor * p95(peaks)));
    return this.policy.reserveBytes[cls];
  }
  slotsOf(job, file) { return Math.min(this.policy.hardCap, Math.max(1, Number(job.request.slots?.[file.file]) || 1)); }
  // Hard per-file deadline (DESIGN 4.2). An explicit job deadline wins. Otherwise: with >=3 completed
  // (PASS/FAIL, not timed out) samples of this file, clamp(3 x p95, min, max); without history 15 min,
  // or 45 min for slow-tier files. Timeouts/crashes are censored samples and never enter the p95.
  // Coverage collection keeps its own floor (20 min) and the same 45 min cap.
  deadlineOf(job, file) {
    if (job.request.deadlineMs) return job.request.deadlineMs;
    const d = this.policy.deadlinesMs, coverage = this.classOf(job, file) === 'coverage';
    const samples = (this.history.runs?.[file.file] || []).filter(r => (r.status === 'PASS' || r.status === 'FAIL') && !r.timedOut && r.durationMs > 0)
      .slice(-20).map(r => r.durationMs);
    const floor = coverage ? d.collect : d.min;
    if (samples.length >= 3) return Math.min(d.max, Math.max(floor, 3 * p95(samples)));
    return coverage ? d.collect : this.slowTests().has(file.file) ? d.slowTier : d.default;
  }
  slowTests() {
    if (!this.slowSet) {
      try { this.slowSet = new Set(fs.readFileSync(this.slowTestsFile, 'utf8').split('\n').filter(Boolean).map(l => l.split('\t')[0].trim())); } catch { this.slowSet = new Set(); }
    }
    return this.slowSet;
  }
  // Reservation of started files whose memory has not shown up in "available" yet.
  outstanding(t = this.now()) {
    let sum = 0;
    for (const r of this.running.values()) if (t - r.startedAt < this.policy.realizeMs) sum += Math.max(0, r.reserve - (r.memBytes || 0));
    return sum;
  }

  async sampleMemory(t) {
    if (this.lastSampleAt !== null && t - this.lastSampleAt < this.policy.sampleMs) return;
    this.lastSampleAt = t;
    const m = await this.availMem(); this.lastAvail = m; this.overviewDirty = true;
    const p = this.policy;
    if (!this.paused) {
      if (m < p.pauseBelowBytes) {
        if (++this.lowCount >= p.pauseConsecutive) {
          this.paused = true; this.okSince = null; this.pauseCount++;
          this.event(null, 'resource_pause', { availBytes: m });
          this.alert('RESOURCE_PAUSE', `scheduler#${this.pauseCount}`, `available memory ${Math.round(m / 1048576)}MB below limit; new starts paused`);
        }
      } else this.lowCount = 0;
    } else if (m >= p.resumeAboveBytes) {
      this.okSince ??= t;
      if (t - this.okSince >= p.resumeHoldMs) {
        this.paused = false; this.lowCount = 0; this.okSince = null;
        this.event(null, 'resource_resume', { availBytes: m });
        this.clearAlert(`scheduler#${this.pauseCount}`, 'RESOURCE_PAUSE');
      }
    } else this.okSince = null;
  }

  // Only waiting that is NOT explained by a fully busy machine counts: a queued file accrues idle-wait
  // time while at least one execution slot is free (or the whole machine is empty) yet it is not
  // being started (memory, pause, per-card cap...). A normal queue behind busy slots never alerts.
  // Time accrues per check interval; a job making progress (a file admitted) restarts the count.
  checkWaits(t) {
    const dt = this.lastWaitCheck == null ? 0 : Math.max(0, t - this.lastWaitCheck);
    this.lastWaitCheck = t;
    const slotFree = this.slotsInUse() < this.policy.hardCap;
    for (const job of this.jobs.values()) {
      if (job.terminal) continue;
      for (const f of job.files) {
        if (f.state !== 'QUEUED') continue;
        if (slotFree && f.waitReason !== 'collect-yield') f.idleMs = (f.idleMs || 0) + dt;
        const idle = f.idleMs || 0;
        if (idle >= this.policy.waitAlertMs) this.alert('WAIT_5MIN', job.runId, `${job.cardId || job.kind} waited ${Math.round(idle / 60000)} min with free execution slots but could not start (${f.waitReason || 'unknown'})`);
        if (idle >= this.policy.blockedMs && !f.blocked) {
          f.blocked = true; this.dirty = this.overviewDirty = true;
          this.alert('RESOURCE_BLOCKED', job.runId, `${job.cardId || job.kind} blocked >${Math.round(this.policy.blockedMs / 60000)} min with free slots; concurrency is not raised automatically`);
        }
      }
    }
  }

  candidates() {
    const out = [];
    for (const job of this.jobs.values()) if (!job.terminal) for (const f of job.files) if (f.state === 'QUEUED') out.push({ job, file: f });
    return out.sort((a, b) => a.job.prio - b.job.prio || a.job.seq - b.job.seq || a.file.id.localeCompare(b.file.id));
  }

  async admit() {
    if (this.paused || this.stopping) return;
    for (;;) {
      const all = this.candidates();
      const otherQueued = all.some(c => c.job.kind !== 'collect');
      let pick = null;
      for (const c of all) {
        c.file.waitReason = null;
        if (c.job.kind === 'collect' && otherQueued) { c.file.waitReason = 'collect-yield'; continue; }
        const slots = this.slotsOf(c.job, c.file), cardUsed = c.job.cardId ? this.cardSlots(c.job.cardId) : 0;
        if (this.slotsInUse() + slots > this.policy.hardCap) { c.file.waitReason = 'slots'; break; }   // strict order: nothing jumps the head
        if (cardUsed > 0 && cardUsed + slots > this.policy.perCard) { c.file.waitReason = 'card-cap'; continue; }
        pick = { ...c, slots }; break;
      }
      if (!pick) return;
      const reserve = this.reservationOf(pick.job, pick.file);
      const avail = await this.availMem();                                             // fresh read right before starting
      this.lastAvail = avail;
      if (this.paused || this.stopping) return;
      if (avail - this.outstanding() - reserve < this.policy.minFreeAfterBytes) { pick.file.waitReason = 'memory'; return; }
      this.launch(pick.job, pick.file, reserve, pick.slots);
    }
  }

  // Per-file test evidence lives beside the run's other temp files: removed with the run on PASS, kept on failure.
  artifactsDir(job, file) { return path.join(this.tmpRoot, 'run', safe(job.runId), 'artifacts', file.id); }

  launch(job, file, reserve, slots) {
    const t = this.now(), key = `${job.runId}/${file.id}`;
    file.state = 'RUNNING'; file.startedAt = t; file.reservation = reserve; file.slots = slots; file.blocked = false; file.waitReason = null;
    job.lastAdmitAt = t; job.startedAt ??= t; job.status = 'RUNNING';
    for (const other of job.files) if (other.state === 'QUEUED') other.idleMs = 0;
    this.clearAlert(job.runId, 'WAIT_5MIN'); this.clearAlert(job.runId, 'RESOURCE_BLOCKED');
    this.running.set(key, { key, runId: job.runId, cardId: job.cardId, file: file.file, slots, reserve, startedAt: t, memBytes: 0 });
    this.event(job, 'admitted', { file: file.file, reserveBytes: reserve, slots, queuedMs: t - file.queuedAt });
    this.dirty = this.overviewDirty = true;
    this.track((async () => {
      let result;
      const resultFile = path.join(this.jobsDir, job.runId, 'results', `${file.id}.json`);
      try {
        job.workspace ??= await (job.wsPromise ??= this.prepareWorkspace(job, { tmpRoot: this.tmpRoot, policy: this.policy }));
        const options = { cwd: job.workspace.cwd, file: file.file, deadline: this.deadlineOf(job, file), runId: job.runId, ownerSession: job.owner,
          env: { FIELDS_TEST_ARTIFACTS: this.artifactsDir(job, file), ...(job.request.env || {}), TEMP: this.tmpRoot, TMP: this.tmpRoot }, onEvent: e => this.onRunnerEvent(job, file, key, e), resultFile,
          eventsFile: path.join(this.tmpRoot, 'run', safe(job.runId), `${file.id}.events.jsonl`), ...this.runnerOptions };
        result = job.kind === 'collect' ? await this.collectOne(job, file, options) : await this.runFile(options);
      } catch (error) {
        result = { status: 'CRASH', reason: `runner-error: ${String(error.message).slice(0, 200)}`, failures: [] };
        try { writeJsonAtomic(resultFile, { runId: job.runId, file: file.file, ...result }); } catch { /* ignore */ }
      } finally { this.running.delete(key); }          // always: timeout/crash/throw never leak slots
      this.settle(job, file, result);
      this.maybeFinish(job);
    })());
  }

  // A collect task = run ONE test under V8 coverage through the scheduler's own runner (so slots, memory,
  // deadline and events apply) and persist its shard next to the map. The aggregated map is folded from
  // the shards once, when the whole job is done (aggregateCollect). A file with a usable shard is skipped.
  async collectOne(job, file, options) {
    const lib = await this.collectLib(), mapFile = path.resolve(job.request.map);
    let ctx = this.collectCtxs.get(job.runId);
    if (!ctx) { ctx = lib.openCollection(path.resolve(options.cwd), mapFile); this.collectCtxs.set(job.runId, ctx); }
    let previous = null; try { previous = readMap(mapFile); } catch { /* no map yet: shards decide */ }
    if (!lib.planResume(ctx, [file.file], previous).todo.length) return { status: 'PASS', reason: 'resumed from existing shard', failures: [], counts: null };
    fs.mkdirSync(this.tmpRoot, { recursive: true });
    const { ok, note, terminal, collected } = await lib.collectShard(ctx, file.file, { tempRoot: this.tmpRoot,
      runFileImpl: o => this.runFile({ ...options, env: { ...options.env, ...o.env }, allowSkip: o.allowSkip, allowZeroTests: o.allowZeroTests }) });
    if (terminal && collected) return terminal;                                 // PASS or FAIL with coverage kept
    return { ...(terminal || {}), status: terminal?.status && terminal.status !== 'PASS' ? terminal.status : 'INCOMPLETE', reason: `coverage unavailable: ${note}`, failures: terminal?.failures || [] };
  }
  async aggregateCollect(job) {
    const cwd = job.workspace?.cwd ?? job.request.worktree;
    if (!cwd) return;
    const { main } = await this.collectLib(), saved = process.exitCode;
    try { await main(['--root', cwd, '--map', path.resolve(job.request.map), ...job.files.map(f => f.file)], { aggregateOnly: true, runId: job.runId }); }
    finally { process.exitCode = saved; }
  }

  onRunnerEvent(job, file, key, e) {
    const run = this.running.get(key);
    if (e.type === 'start') { file.pid = e.pid; this.dirty = true; this.event(job, 'test_start', { file: file.file, pid: e.pid, deadlineAt: e.deadlineAt }); }
    else if (e.type === 'heartbeat') {
      if (run && e.memBytes) run.memBytes = e.memBytes;
      this.event(job, 'heartbeat', { file: file.file, pid: e.pid, elapsedMs: e.elapsedMs, memBytes: e.memBytes, lastEvent: e.lastEvent?.name ?? null });
    } else if (e.type === 'kill-request' || e.type === 'kill-force') this.event(job, 'timeout', { file: file.file, pid: e.pid, stage: e.type });
  }

  settle(job, file, result) {
    if (file.state === 'DONE') return;                  // a terminal state is never overwritten by a late event
    file.state = 'DONE'; file.endedAt = this.now(); file.status = result.status; file.reason = result.reason ?? null;
    file.summary = { counts: result.counts ?? null, durationMs: result.durationMs ?? null, peakMemBytes: result.peakMemBytes ?? null, exitCode: result.exitCode ?? null,
      timedOut: !!result.timedOut, failures: (result.failures || []).slice(0, 50).map(({ detail, ...rest }) => rest) };
    let learned = false;
    if (result.status === 'PASS' && result.peakMemBytes) {
      const k = `${this.classOf(job, file)}:${file.file}`;
      this.history[k] = [...(this.history[k] || []), result.peakMemBytes].slice(-(this.policy.adaptive?.window || 20));
      learned = true;
    }
    if (result.durationMs != null) {                    // only files that actually ran
      this.history.runs ??= {};
      this.history.runs[file.file] = [...(this.history.runs[file.file] || []),
        { file: file.file, durationMs: result.durationMs, status: result.status, timedOut: !!result.timedOut, endedAt: new Date(file.endedAt).toISOString() }].slice(-20);
      learned = true;
    }
    if (learned) { try { writeJsonAtomic(this.path('history.json'), this.history); } catch { /* optional */ } }
    this.event(job, 'test_end', { file: file.file, status: file.status, reason: file.reason, durationMs: result.durationMs ?? null });
    this.dirty = this.overviewDirty = true;
  }

  maybeFinish(job) {
    if (job.terminal || !job.files.every(f => f.state === 'DONE')) return;
    if (job.kind !== 'collect' || !job.request.map) return this.finishJob(job);
    if (this.aggregating.has(job.runId)) return;      // the result is published only after the map is
    this.aggregating.add(job.runId);
    this.track(this.aggregateCollect(job).catch(error => { job.aggError = String(error.message).slice(0, 200); this.event(job, 'aggregate_error', { message: job.aggError }); })
      .then(() => { this.aggregating.delete(job.runId); this.finishJob(job); }));
  }
  finishJob(job) {
    const sts = job.files.map(f => f.status);
    job.status = sts.every(s => s === 'PASS') ? 'PASS' : sts.every(s => s === 'PASS' || s === 'FAIL') ? 'FAIL' : 'INCOMPLETE';
    if (job.aggError) job.status = 'INCOMPLETE';
    job.terminal = true; job.endedAt = this.now();
    const counts = {}; for (const s of sts) counts[s] = (counts[s] || 0) + 1;
    const files = job.files.map(f => ({ file: f.file, id: f.id, status: f.status, reason: f.reason, ...f.summary,
      startedAt: f.startedAt ? new Date(f.startedAt).toISOString() : null, waitedMs: f.startedAt ? f.startedAt - f.queuedAt : null }));
    const result = { runId: job.runId, kind: job.kind, cardId: job.cardId, ownerSession: job.owner, status: job.status, base: job.request.base ?? null, treeHash: job.request.treeHash ?? null,
      createdAt: new Date(job.createdAt).toISOString(), startedAt: job.startedAt ? new Date(job.startedAt).toISOString() : null, endedAt: new Date(job.endedAt).toISOString(),
      queuedMs: (job.startedAt ?? job.endedAt) - job.createdAt, runMs: job.startedAt ? job.endedAt - job.startedAt : 0, counts, files, ...(job.aggError ? { reason: `map aggregation failed: ${job.aggError}` } : {}) };
    const bad = files.filter(f => f.status !== 'PASS');
    const md = [`# ${job.kind} ${job.cardId || ''} ${job.runId}`, `status: ${job.status}  (${files.length - bad.length}/${files.length} pass)`,
      `queued ${Math.round(result.queuedMs / 1000)}s, ran ${Math.round(result.runMs / 1000)}s`,
      ...bad.slice(0, 40).map(f => `- ${f.status} ${f.file}${f.reason ? ` (${f.reason})` : ''}`)].join('\n');
    try { fs.writeFileSync(path.join(this.jobsDir, job.runId, 'summary.md'), `${md}\n`); } catch { /* ignore */ }
    this.event(job, 'job_end', { status: job.status, counts });
    writeJsonAtomic(path.join(this.jobsDir, job.runId, 'result.json'), result);   // last: the waiters' signal
    this.cleanupWorkspace(job);
    if (job.status === 'PASS') { try { fs.rmSync(path.join(this.tmpRoot, 'run', safe(job.runId)), { recursive: true, force: true }); } catch { /* ignore */ } }
    for (const t of ['WAIT_5MIN', 'RESOURCE_BLOCKED']) this.clearAlert(job.runId, t);
    this.dirty = this.overviewDirty = true;
  }
  cleanupWorkspace(job) {
    if (!job.workspace?.created) return;
    if ([...this.orphans.values()].some(o => o.runId === job.runId)) return;   // an unverified orphan may still use the directory
    const ws = job.workspace; job.workspace = { ...ws, created: false };
    this.track(Promise.resolve().then(() => this.releaseWorkspace(job, ws, { tmpRoot: this.tmpRoot })).catch(() => {}));
  }

  // -- publication --
  overview() {
    const t = this.now(), iso = ms => (ms ? new Date(ms).toISOString() : null);
    const jobs = [...this.jobs.values()].filter(j => !j.terminal).sort((a, b) => a.prio - b.prio || a.seq - b.seq).map(j => {
      const run = j.files.filter(f => f.state === 'RUNNING'), queued = j.files.filter(f => f.state === 'QUEUED');
      const reason = queued.find(f => f.waitReason)?.waitReason ?? null;
      return { runId: j.runId, card: j.cardId, kind: j.kind, owner: j.owner, priority: j.priority,
        status: j.files.some(f => f.blocked) ? 'RESOURCE_BLOCKED' : run.length ? 'RUNNING' : reason ? 'WAIT_RESOURCE' : 'QUEUED', waitReason: reason,
        currentFiles: run.map(f => f.file), done: j.files.filter(f => f.state === 'DONE').length, total: j.files.length,
        queuedMs: (j.startedAt ?? t) - j.createdAt, runningMs: j.startedAt ? t - j.startedAt : 0, slots: run.reduce((n, f) => n + (f.slots || 1), 0), eta: null };
    });
    const recent = [...this.jobs.values()].filter(j => j.terminal && j.status !== 'DUPLICATE' && j.endedAt).sort((a, b) => b.endedAt - a.endedAt).slice(0, 20)
      .map(j => ({ runId: j.runId, card: j.cardId, kind: j.kind, status: j.status, endedAt: iso(j.endedAt) }));
    const alerts = [...this.activeAlerts.values()].sort((a, b) => a.ts - b.ts);
    return { updatedAt: iso(t), schedulerPid: process.pid, paused: this.paused, hardCap: this.policy.hardCap, perCard: this.policy.perCard,
      slotsUsed: this.slotsInUse(), orphanSlots: [...this.orphans.values()].reduce((n, o) => n + o.slots, 0), availMemBytes: this.lastAvail,
      outstandingReserveBytes: this.outstanding(t), oldestAlert: alerts[0] ? { ...alerts[0], ts: iso(alerts[0].ts) } : null, alertCount: alerts.length, jobs, recent };
  }
  publish(t) {
    this.persist();
    if (this.overviewDirty || t - this.lastOverview >= this.policy.overviewMs) {
      this.lastOverview = t; this.overviewDirty = false;
      writeJsonAtomic(this.path('overview.json'), this.overview());
    }
    if (t - this.lastHeartbeat >= this.policy.heartbeatMs) {
      this.lastHeartbeat = t;
      try { fs.writeFileSync(this.path('scheduler.heartbeat'), JSON.stringify({ ts: new Date(t).toISOString(), pid: process.pid, running: this.running.size })); } catch { /* ignore */ }
    }
  }

  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const t = this.now();
      this.scanControl(); this.scanRequests();
      await this.sampleMemory(t);
      this.checkWaits(t);
      await this.admit();
      this.publish(this.now());
    } finally { this.ticking = false; }
  }
  async run({ tickMs = 1000 } = {}) {
    while (!this.stopped) {
      try { await this.tick(); } catch (error) { this.log(`tick error: ${error.stack || error}`); }
      if (this.stopping && !this.running.size) break;
      await new Promise(resolve => setTimeout(resolve, tickMs));
    }
    await Promise.allSettled([...this.pending]);
    this.dirty = true; this.publish(this.now());
  }
}

// ---- CLI ----------------------------------------------------------------------------------
async function main(argv) {
  const arg = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const root = path.resolve(arg('--root') || 'F:/dnd/logs/gate'), tmpRoot = path.resolve(arg('--tmp') || 'F:/dnd-tmp/gate');
  const policy = loadPolicy(arg('--policy') || undefined);
  const availFile = arg('--avail-file');
  const lock = await acquireLock(root);
  const scheduler = new Scheduler({ root, tmpRoot, policy, log: line => console.error(line),
    availMem: availFile ? async () => Number(fs.readFileSync(availFile, 'utf8').trim()) : undefined });
  fs.mkdirSync(tmpRoot, { recursive: true });
  scheduler.load();
  const quit = () => { scheduler.stopping = true; };
  process.on('SIGINT', quit); process.on('SIGTERM', quit);
  console.error(`scheduler ${process.pid} up, root ${root}`);
  try { await scheduler.run({ tickMs: Number(arg('--tick-ms')) || 1000 }); } finally { lock.release(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
