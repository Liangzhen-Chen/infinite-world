import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { byteLineStarts, git, hash, isMain, normalizeEol, slash, unique, walk } from './common.mjs';

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
export function mergeMap(previous, updates, commit) {
  if (previous && previous.version !== 1) throw new Error('Unsupported coverage map version');
  const snapshots = { ...previous?.snapshots }, tests = { ...previous?.tests }, sources = {};
  const indexes = new Map();
  const key = (kind, fn) => `${kind}:${fn.start}:${fn.end}:${fn.name}`;
  for (const [test, record] of Object.entries(updates)) {
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
  return { version: 1, commit, generatedAt: new Date().toISOString(), tests, sources,
    snapshots: Object.fromEntries(Object.entries(snapshots).filter(([id]) => usedHashes.has(id))) };
}

export async function collectOne(root, test, commit, { run = runTest, tempRoot = os.tmpdir() } = {}) {
  const directory = fs.mkdtempSync(path.join(tempRoot, 'test-impact-'));
  const started = performance.now();
  try {
    const exitCode = await run(root, test, directory);
    const documents = fs.readdirSync(directory).filter(file => file.endsWith('.json'))
      .map(file => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')));
    if (!documents.length) throw new Error(`No V8 coverage produced: ${test}`);
    return { commit, durationMs: Math.round(performance.now() - started), exitCode,
      sources: parseCoverage(root, documents) };
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

function runTest(root, test, directory) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--test', '--test-isolation=none', test], {
      cwd: root, env: { ...process.env, NODE_V8_COVERAGE: directory }, stdio: 'ignore',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(code ?? `signal:${signal}`));
  });
}

export async function main(args = process.argv.slice(2)) {
  let root = process.cwd(), mapFile, listFile, jobs = 1;
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const option = args[i];
    if (['--root', '--map', '--files', '--jobs'].includes(option)) {
      const value = args[++i];
      if (!value) throw new Error(`Missing value for ${option}`);
      if (option === '--root') root = value;
      if (option === '--map') mapFile = value;
      if (option === '--files') listFile = value;
      if (option === '--jobs') jobs = Number(value);
    } else if (option.startsWith('--')) throw new Error(`Unknown option: ${option}`);
    else positional.push(option);
  }
  // Parent + two workers respects this project's three-node process limit.
  if (!Number.isInteger(jobs) || jobs < 1 || jobs > 2) throw new Error('--jobs must be 1 or 2 (three-node process limit)');
  root = path.resolve(root);
  mapFile = path.resolve(mapFile || path.join(root, 'test-impact-map.json'));
  const listed = listFile ? fs.readFileSync(listFile, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#')) : [];
  const files = unique((listFile || positional.length ? [...listed, ...positional] : walk(root, 'tests').filter(file => /\.test\.mjs$/.test(file)))
    .map(file => slash(path.relative(root, path.resolve(root, file)))));
  if (!files.length) throw new Error('No test files supplied');
  for (const file of files) if (file.startsWith('../') || path.isAbsolute(file) || !fs.existsSync(path.join(root, file)))
    throw new Error(`Test outside root or missing: ${file}`);
  const commit = git(root, ['rev-parse', 'HEAD']).trim();
  const previous = fs.existsSync(mapFile) ? JSON.parse(fs.readFileSync(mapFile, 'utf8')) : undefined;
  const updates = {};
  let next = 0;
  const results = await Promise.allSettled(Array.from({ length: Math.min(jobs, files.length) }, async () => {
    while (next < files.length) {
      const file = files[next++];
      updates[file] = await collectOne(root, file, commit);
      console.error(`${file}: ${updates[file].durationMs}ms, exit=${updates[file].exitCode}`);
    }
  }));
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
  if (git(root, ['rev-parse', 'HEAD']).trim() !== commit) throw new Error('HEAD changed during collection; map not written');
  fs.writeFileSync(mapFile, `${JSON.stringify(mergeMap(previous, updates, commit), null, 2)}\n`);
  if (Object.values(updates).some(record => record.exitCode !== 0)) process.exitCode = 1;
}

if (isMain(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
