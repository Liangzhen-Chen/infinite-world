import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { runFile } from '../runner.mjs';
import { atomicWrite, byteLineStarts, dependencySnapshot, discoverTests, git, hash, isMain, normalizeEol, publishMap, readMap, recordInvalidReason, slash, staticGraph, unique, worktreeContext } from './common.mjs';

// V8 offsets count UTF-16 code units, not UTF-8 bytes. Convert at the boundary.
export function parseCoverage(root, documents, readSource = file => fs.readFileSync(file, 'utf8')) {
  root = path.resolve(root);
  const sources = {};
  const indexes = new Map();
  for (const document of documents) for (const script of document.result || []) {
    if (!script.url?.startsWith('file:')) continue;
    const absolute = fileURLToPath(script.url);
    const file = slash(path.relative(root, absolute));
    if (!file || file.startsWith('../') || path.isAbsolute(file)
      || file.split('/').some(part => ['node_modules', 'SillyTavern', 'tests'].includes(part))) continue;
    const text = readSource(absolute);
    const byte = offset => Buffer.byteLength(text.slice(0, offset), 'utf8');
    const entry = sources[file] ||= { hash: hash(text), normalizedHash: hash(normalizeEol(text)),
      bytes: Buffer.byteLength(text), lineStarts: byteLineStarts(text), topLevel: [], functions: [] };
    for (const fn of script.functions || []) {
      const range = fn.ranges?.[0];
      if (!range) continue;
      if (range.startOffset < 0 || range.endOffset > text.length || range.startOffset > range.endOffset)
        throw new Error(`V8 offsets do not match source: ${file}`);
      const topLevel = fn.functionName === '' && range.startOffset === 0 && range.endOffset === text.length;
      const target = topLevel ? entry.topLevel : entry.functions;
      const start = byte(range.startOffset), end = byte(range.endOffset);
      const key = `${file}:${topLevel}:${start}:${end}:${fn.functionName}`;
      const existing = indexes.get(key);
      if (existing) existing.executed ||= range.count > 0;
      else {
        const item = { start, end, name: fn.functionName, executed: range.count > 0 };
        target.push(item); indexes.set(key, item);
      }
    }
  }
  return sources;
}

// Retain per-test snapshots so partial refreshes remove old edges and cannot
// accidentally bless old offsets when a source changes between collections.
export function mergeMap(previous, updates, commit, { allTests } = {}) {
  if (previous && ![1, 2].includes(previous.version)) throw new Error('Unsupported coverage map version');
  const snapshots = { ...previous?.snapshots }, tests = { ...previous?.tests }, sources = {};
  const indexes = new Map();
  const key = (kind, fn) => `${kind}:${fn.start}:${fn.end}:${fn.name}`;
  for (const [test, record] of Object.entries(updates)) {
    if (record === null) { delete tests[test]; continue; }
    const compact = {};
    for (const [file, snapshot] of Object.entries(record.sources)) {
      // Function shapes are shared by content hash, rather than duplicated once
      // for every test that imports the engine (hundreds in the real project).
      const shapes = {};
      for (const kind of ['topLevel', 'functions']) {
        const union = new Map((snapshots[snapshot.hash]?.[kind] || []).map(fn => [key(kind, fn), fn]));
        // V8 can omit lazily compiled nested functions in another test's report.
        for (const { executed, ...fn } of snapshot[kind]) union.set(key(kind, fn), fn);
        shapes[kind] = [...union.values()];
      }
      snapshots[snapshot.hash] = { bytes: snapshot.bytes, normalizedHash: snapshot.normalizedHash, lineStarts: snapshot.lineStarts, ...shapes };
      compact[file] = { hash: snapshot.hash, executed: ['topLevel', 'functions']
        .flatMap(kind => snapshot[kind].filter(fn => fn.executed).map(fn => key(kind, fn))) };
    }
    tests[test] = { ...record, sources: compact };
  }
  if (allTests) for (const test of Object.keys(tests)) if (!allTests.includes(test)) delete tests[test];
  const usedHashes = new Set();
  for (const [test, record] of Object.entries(tests)) for (const [file, reference] of Object.entries(record.sources)) {
    const snapshot = { ...snapshots[reference.hash], hash: reference.hash };
    usedHashes.add(reference.hash);
    const executed = new Set(reference.executed);
    const source = sources[file] ||= { hash: snapshot.hash, bytes: snapshot.bytes,
      normalizedHash: snapshot.normalizedHash, lineStarts: snapshot.lineStarts,
      commits: [], stale: false, loadedBy: [], topLevel: [], functions: [] };
    source.loadedBy.push(test);
    source.commits.push(record.commit);
    source.stale ||= source.hash !== snapshot.hash;
    for (const kind of ['topLevel', 'functions']) for (const fn of snapshot[kind]) {
      const id = `${file}:${key(kind, fn)}`;
      let target = indexes.get(id);
      if (!target) {
        target = { start: fn.start, end: fn.end, name: fn.name, tests: [] };
        source[kind].push(target); indexes.set(id, target);
      }
      if (executed.has(key(kind, fn))) target.tests.push(test);
    }
  }
  for (const source of Object.values(sources)) {
    source.loadedBy = unique(source.loadedBy);
    source.commits = unique(source.commits);
    for (const kind of ['topLevel', 'functions']) source[kind].sort((a, b) => a.start - b.start || b.end - a.end);
  }
  return { version: 2, commit, generatedAt: new Date().toISOString(), tests, sources,
    snapshots: Object.fromEntries(Object.entries(snapshots).filter(([id]) => usedHashes.has(id))) };
}

export class CollectionUnavailable extends Error {
  constructor(terminal, message) { super(message); this.terminal = terminal; }
}

// `run` may return a bare exit code (legacy/injected) or a runFile terminal result.
// Only PASS/FAIL terminals carry trustworthy coverage; TIMEOUT/CRASH/INCOMPLETE never do.
export async function collectOne(root, test, commit, { run = runTest, tempRoot = os.tmpdir(), ...options } = {}) {
  const directory = fs.mkdtempSync(path.join(tempRoot, 'test-impact-'));
  const started = performance.now();
  try {
    const outcome = await run(root, test, directory, options);
    const terminal = outcome !== null && typeof outcome === 'object' ? outcome : { exitCode: outcome };
    if (terminal.status && !['PASS', 'FAIL'].includes(terminal.status))
      throw new CollectionUnavailable(terminal, `${terminal.status}: ${terminal.reason ?? 'no reason'}`);
    // Any non-PASS terminal (FAIL included) is stored with a non-zero exitCode so select.mjs always
    // picks it; a failing test may have stopped early, so its coverage can never exclude anything.
    const nonPass = !!terminal.status && terminal.status !== 'PASS';
    const documents = fs.readdirSync(directory).filter(file => file.endsWith('.json'))
      .map(file => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')));
    if (!documents.length) throw new Error(`No V8 coverage produced: ${test}`);
    return { commit, collectedAt: new Date().toISOString(), durationMs: Math.round(performance.now() - started), exitCode: nonPass ? (terminal.exitCode || -1) : terminal.exitCode,
      ...(terminal.status ? { status: terminal.status } : {}), ...(nonPass ? { partialCoverage: true } : {}), sources: parseCoverage(root, documents) };
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

function runTest(root, test, directory, options = {}) {
  return (options.runFileImpl ?? runFile)({ cwd: root, file: test, env: { NODE_V8_COVERAGE: directory },
    deadline: options.timeoutMs ?? Number(process.env.TIA_TIMEOUT_MS ?? 1200000), graceMs: options.graceMs, heartbeatMs: options.heartbeatMs,
    runId: options.runId, ownerSession: options.ownerSession, onEvent: options.onEvent,
    // Coverage collection does not judge the test's quality: skips and empty files are fine here.
    allowSkip: true, allowZeroTests: true });
}

const shardPath = (dir, file) => path.join(dir, `${hash(file).slice(0, 16)}.json`);
function readShard(dir, file) {
  try { const shard = JSON.parse(fs.readFileSync(shardPath(dir, file), 'utf8')); return shard.file === file ? shard : undefined; } catch { return undefined; }
}

// A failed/hung/crashed collection is stored as an explicit "unavailable" record with a
// non-zero exitCode: select.mjs always selects such tests, so partial data never excludes anything.
function unavailableRecord(commit, durationMs, terminal, message) {
  return { commit, collectedAt: new Date().toISOString(), durationMs, exitCode: terminal?.exitCode || -1, unavailable: true, status: terminal?.status ?? 'ERROR',
    reason: terminal?.reason ?? message, sources: {} };
}

// Shared by main() and the scheduler's collect jobs (one file per scheduler task).
export function openCollection(root, mapFile, runGit = args => git(root, args)) {
  const identity = worktreeContext(root, mapFile, runGit);
  return { root, mapFile, runGit, identity, commit: identity.head, graph: staticGraph(root), shardDir: `${mapFile}.shards` };
}

// Resume: per-file shards are the durable truth. A file needs (re)collection when it has no shard, or its
// shard is unavailable (timeout/crash/incomplete/no coverage). Shards of this commit that never reached the
// aggregated map are folded back in via `updates` without re-running.
export function planResume(ctx, files, previous) {
  const { shardDir, commit, identity } = ctx, todo = [], updates = {};
  for (const file of files) {
    const shard = readShard(shardDir, file);
    const record = previous?.tests?.[file];
    // A PASS on the same clean snapshot may be resumed even if its dynamic
    // dependencies prevent selection from using it to exclude any future test.
    if (shard?.commit === commit && !recordInvalidReason(shard.record, identity, { forResume: true })) {
      if (!record || record.commit !== commit || record.collectedAt !== shard.record.collectedAt
        || recordInvalidReason(record, identity, { forResume: true })) updates[file] = shard.record;
      if (shard.collected) continue;
    } else if (!shard && record?.commit === commit && !recordInvalidReason(record, identity, { forResume: true })) continue;
    todo.push(file);
  }
  return { todo, updates };
}

// Run one test under V8 coverage and persist its shard. Never throws for a bad collection: it is stored as an
// explicit "unavailable" record. Returns the record plus the runner terminal (for the caller's own accounting).
export async function collectShard(ctx, file, options = {}) {
  const { root, shardDir, commit, identity, runGit, mapFile } = ctx;
  const started = performance.now();
  const dependencies = dependencySnapshot(root, file, ctx.graph);
  let record, collected = false, note, terminal = null, ok = true;
  const capture = options.runFileImpl ?? runFile;
  try {
    record = await collectOne(root, file, commit, { ...options, runFileImpl: async o => (terminal = await capture(o)) });
    collected = true; note = `${record.durationMs}ms, exit=${record.exitCode}`;
    if (record.exitCode !== 0) ok = false;
  } catch (error) {
    ok = false;
    terminal = error.terminal ?? terminal;
    record = unavailableRecord(commit, Math.round(performance.now() - started), error.terminal, error.message);
    note = `UNAVAILABLE ${record.status}: ${record.reason}`;
  }
  const finished = worktreeContext(root, mapFile, runGit);
  record = { ...record, ...dependencies, nodeVersion: identity.nodeVersion, lockHash: identity.lockHash,
    dirty: identity.dirty || finished.dirty || finished.head !== commit || finished.lockHash !== identity.lockHash };
  atomicWrite(shardPath(shardDir, file), `${JSON.stringify({ file, commit, collected, status: record.status ?? 'PASS', finishedAt: new Date().toISOString(), record })}
`);
  return { record, collected, ok, note, terminal };
}

export async function main(args = process.argv.slice(2), injected = {}) {
  let root = process.cwd(), mapFile, listFile, jobs = 1, eventsFile, timeoutMs, graceMs;
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const option = args[i];
    if (['--root', '--map', '--files', '--jobs', '--events', '--timeout-ms', '--grace-ms'].includes(option)) {
      const value = args[++i];
      if (!value) throw new Error(`Missing value for ${option}`);
      if (option === '--root') root = value;
      if (option === '--map') mapFile = value;
      if (option === '--files') listFile = value;
      if (option === '--jobs') jobs = Number(value);
      if (option === '--events') eventsFile = value;
      if (option === '--timeout-ms') timeoutMs = Number(value);
      if (option === '--grace-ms') graceMs = Number(value);
    } else if (option.startsWith('--')) throw new Error(`Unknown option: ${option}`);
    else positional.push(option);
  }
  // Parent + two workers respects this project's three-node process limit.
  if (!Number.isInteger(jobs) || jobs < 1 || jobs > 2) throw new Error('--jobs must be 1 or 2 (three-node process limit)');
  root = path.resolve(root);
  mapFile = path.resolve(mapFile || path.join(root, 'test-impact-map.json'));
  eventsFile = path.resolve(eventsFile || `${mapFile}.events.jsonl`);
  const listed = listFile ? fs.readFileSync(listFile, 'utf8').replace(/^﻿/, '').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#')) : [];
  const files = unique((listFile || positional.length ? [...listed, ...positional] : discoverTests(root))
    .map(file => slash(path.relative(root, path.resolve(root, file)))));
  if (!files.length) throw new Error('No test files supplied');
  for (const file of files) if (file.startsWith('../') || path.isAbsolute(file) || !fs.existsSync(path.join(root, file)))
    throw new Error(`Test outside root or missing: ${file}`);
  const runGit = injected.git ?? (args => git(root, args));
  const ctx = openCollection(root, mapFile, runGit), { commit, identity } = ctx;
  let previous;
  try { previous = readMap(mapFile); } catch { /* restart from shards */ }
  if (previous && ![1, 2].includes(previous.version)) previous = undefined;
  let next = 0, done = 0;
  const allTests = discoverTests(root);
  const updatesFromPlan = planResume(ctx, files, previous);
  let updates = {};
  for (const test of Object.keys(previous?.tests || {})) if (!allTests.includes(test)) updates[test] = null;
  Object.assign(updates, updatesFromPlan.updates);
  // aggregateOnly: fold existing shards into the map without running anything (scheduler collect jobs).
  const todo = injected.aggregateOnly ? [] : updatesFromPlan.todo;
  // ...but an unavailable shard of this commit is still recorded (non-zero exit: always selected), as a run would.
  if (injected.aggregateOnly) for (const file of updatesFromPlan.todo) {
    const shard = readShard(ctx.shardDir, file);
    if (shard?.commit === commit) updates[file] = shard.record;
  }
  const failed = new Set();
  fs.mkdirSync(path.dirname(eventsFile), { recursive: true });
  const sink = event => fs.appendFileSync(eventsFile, `${JSON.stringify(event)}\n`);
  const runId = injected.runId ?? `collect-${Date.now()}`;
  const options = { timeoutMs: timeoutMs ?? injected.timeoutMs, graceMs: graceMs ?? injected.graceMs, heartbeatMs: injected.heartbeatMs,
    runFileImpl: injected.runFile, runId, ownerSession: injected.ownerSession, onEvent: sink, tempRoot: injected.tempRoot };
  if (!options.tempRoot) delete options.tempRoot;
  // Save the aggregated map every ten files, so an interrupted run keeps what it collected.
  const save = () => {
    if (!Object.keys(updates).length) return;
    const current = worktreeContext(root, mapFile, runGit);
    if (current.head !== commit) throw new Error('HEAD changed during collection; map not written');
    if (current.lockHash !== identity.lockHash || current.dirty) {
      for (const record of Object.values(updates)) if (record) record.dirty = true;
    }
    previous = publishMap(mapFile, mergeMap(previous, updates, commit, { allTests }));
    updates = {};
  };
  console.error(`collect ${todo.length}/${files.length} files at ${commit.slice(0, 8)}`);
  sink({ type: 'collect-start', runId, ts: new Date().toISOString(), todo: todo.length, total: files.length });
  await Promise.all(Array.from({ length: Math.min(jobs, todo.length) }, async () => {
    while (next < todo.length) {
      const file = todo[next++];
      // One failing file is reported and persisted as unavailable, never silently stops its worker.
      const { record, collected, ok, note } = await collectShard(ctx, file, options);
      if (!ok) failed.add(file);
      updates[file] = record;
      console.error(`${file}: ${note}`);
      sink({ type: 'file-done', runId, ts: new Date().toISOString(), file, collected, status: record.status ?? null });
      if (++done % 10 === 0) save();
    }
  }));
  save();
  if (failed.size) console.error(`failed or unavailable: ${failed.size}`);
  if (failed.size || files.some(file => previous?.tests?.[file] && previous.tests[file].exitCode !== 0)) process.exitCode = 1;
}

if (isMain(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
