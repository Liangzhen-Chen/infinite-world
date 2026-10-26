import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeMap, main as collect } from '../collect.mjs';
import { main as select, selectChanges } from '../select.mjs';
import { affectedTests, byteLineStarts, dependencySnapshot, discoverTests, hash, lockHash,
  publishMap, readMap, recordInvalidReason, staticGraph, TTL_MS, worktreeContext } from '../common.mjs';

const a = 'tests/a.test.mjs', b = 'tests/b.test.mjs', c = 'tests/c.test.mjs';
const tests = [a, b, c], now = Date.now();
const text = "export function calc() {\n  return 1;\n}\n";
const context = { now, head: 'head', dirty: false, nodeVersion: process.version, lockHash: 'lock' };
const record = (extra = {}) => ({ commit: 'head', collectedAt: new Date(now - 10).toISOString(),
  nodeVersion: process.version, lockHash: 'lock', dependencies: {}, durationMs: 1, exitCode: 0, sources: {}, ...extra });
function mapOf() {
  const snapshot = executed => ({ hash: hash(text), normalizedHash: hash(text), bytes: Buffer.byteLength(text),
    lineStarts: byteLineStarts(text), topLevel: [{ start: 0, end: text.length, name: '', executed: true }],
    functions: [{ start: 7, end: text.length - 1, name: 'calc', executed }] });
  return mergeMap(undefined, { [a]: record({ sources: { 'server-plugin/math.mjs': snapshot(true) } }),
    [b]: record({ sources: { 'server-plugin/math.mjs': snapshot(false) } }), [c]: record() }, 'head');
}
const change = (extra = {}) => ({ file: 'server-plugin/math.mjs', kind: 'modified', oldText: text,
  hunks: [{ startLine: 2, lineCount: 1 }], patch: '-  return 1;\n+  return 2;', ...extra });
const choose = (changes = [change()], map = mapOf(), extra = {}) => selectChanges(map, changes, { allTests: tests, context, ...extra });

function fixture(files, run) {
  const root = fs.mkdtempSync(path.join(fileURLToPath(new URL('.', import.meta.url)), 'lifecycle-'));
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }
  const result = (() => { try { return run(root); } catch (error) { fs.rmSync(root, { recursive: true, force: true }); throw error; } })();
  if (result?.then) return result.finally(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.rmSync(root, { recursive: true, force: true });
  return result;
}

test('shadow default exposes two reasoned sets and omitted files; prune is explicit', () => {
  const result = choose();
  assert.equal(result.mode, 'shadow');
  assert.deepEqual(result.tests, [a, b]);
  assert.deepEqual(result.conservative.tests, [a, b]);
  assert.deepEqual(result.coverage.tests, [a]);
  assert.deepEqual(result.shadow, { omittedFiles: [b] });
  assert.deepEqual(result.coverage.reasons[a], ['function-executor:server-plugin/math.mjs']);
  assert.deepEqual(result.conservative.reasons[b], ['static-or-loader:server-plugin/math.mjs']);
  assert.deepEqual(choose(undefined, undefined, { mode: 'prune' }).tests, [a]);
  assert.deepEqual(JSON.parse(JSON.stringify({ selection: result })).selection, result, 'gate.json payload is plain JSON');
  assert.throws(() => choose(undefined, undefined, { mode: 'auto' }), /Invalid selection mode/);
});

test('CORE, explicit acceptance and failed records remain in both sets', () => {
  const map = mapOf();
  const core = ['tests/engine.test.mjs', 'tests/storage.test.mjs', 'tests/plugin.test.mjs'];
  for (const file of core) map.tests[file] = record();
  const result = choose(undefined, map, { allTests: [...tests, ...core], mandatory: [c] });
  for (const set of [result.conservative, result.coverage]) for (const file of [...core, c]) assert.ok(set.reasons[file].length);
  assert.deepEqual(result.requiredFiles, [...core, c].sort());
  const missing = 'tests/missing.test.mjs';
  const required = choose(undefined, undefined, { mandatory: [missing] });
  assert.ok(required.tests.includes(missing), 'explicit acceptance cannot silently disappear from the denominator');
});

for (const file of ['extension/entry.mjs', 'world/item.json', 'package.json', 'package-lock.json', 'pnpm-lock.yaml', '.node-version', '.nvmrc',
  'server-plugin/storage.mjs', 'server-plugin/ledger.mjs', 'server-plugin/engine.mjs', 'server-plugin/prompt-scope.mjs',
  'server-plugin/permissions.mjs', 'server-plugin/primitive-schema.mjs', 'server-plugin/enums.mjs', 'server-plugin/action-registry.mjs', 'data/config.json']) {
  test(`${file} always falls back to full, even with one known consumer`, () => {
    const result = choose([change({ file })], undefined, { fallback: () => [a] });
    assert.deepEqual(result.coverage.tests, tests);
    assert.deepEqual(result.tests, tests);
    assert.ok(result.decisions[0].reason);
  });
}

test('top-level, exports, registrations, dynamic import and runtime reads cannot prune', () => {
  const inputs = [change({ hunks: [{ startLine: 1, lineCount: 1 }] }),
    change({ patch: '-export { calc };\n+export { calc as renamed };' }),
    change({ patch: '-  return 1;\n+  register(calc);' }),
    change({ oldText: "const entry = import(name);\n" }),
    change({ oldText: "const data = readFileSync(file);\n" }),
    change({ patch: '-  return 1;\n+  return other;' }),
    change({ patch: '-  return 1;\n+  return next();' })];
  for (const input of inputs) assert.deepEqual(choose([input]).coverage.tests, tests, JSON.stringify(input));
});

test('unexecuted functions and missing ranges add old loaders AND current static consumers', () => {
  const map = mapOf();
  map.sources['server-plugin/math.mjs'].functions[0].tests = [];
  const result = choose(undefined, map, { fallback: () => [c] });
  assert.deepEqual(result.coverage.tests, tests);
  assert.equal(result.decisions[0].reason, 'unexecuted-function');
  delete map.sources['server-plugin/math.mjs'];
  assert.deepEqual(choose(undefined, map, { fallback: () => [c] }).coverage.tests, [c]);
  assert.deepEqual(choose(undefined, map).coverage.tests, tests, 'unknown consumers must never produce empty selection');
});

test('stale source fallback unions current consumers even when old loaders exist', () => {
  for (const extra of [{ stale: true }, { kind: 'deleted' }, { oldText: `${text}\n` }]) {
    assert.deepEqual(choose([change(extra)], undefined, { fallback: () => [c] }).coverage.tests, tests);
  }
});

test('TTL belongs to each record; merge does not renew older observations', () => {
  let map = mapOf();
  map.tests[b].collectedAt = new Date(now - TTL_MS).toISOString();
  map = mergeMap(map, { [c]: record() }, 'head');
  assert.notEqual(map.generatedAt, map.tests[b].collectedAt);
  assert.equal(recordInvalidReason(map.tests[b], context), 'record-expired');
  assert.deepEqual(choose(undefined, map).coverage.tests, [a, b]);
  assert.equal(recordInvalidReason(record({ collectedAt: new Date(now - TTL_MS + 1).toISOString() }), context), null);
  assert.equal(recordInvalidReason(record({ collectedAt: new Date(now + 1).toISOString() }), context), 'record-expired');
});

for (const [field, value, reason] of [['nodeVersion', 'v0.0.0', 'node-version'], ['lockHash', 'other-lock', 'lock-hash'],
  ['dirty', true, 'dirty-snapshot'], ['dependenciesUnknown', true, 'unknown-dependencies'],
  ['exitCode', 1, 'failed-collection'], ['unavailable', true, 'failed-collection'], ['partialCoverage', true, 'failed-collection']]) {
  test(`${reason}: invalid evidence cannot exclude its test`, () => {
    const map = mapOf(); map.tests[b][field] = value;
    assert.equal(recordInvalidReason(map.tests[b], context), reason);
    assert.deepEqual(choose(undefined, map).coverage.tests, [a, b]);
  });
}

test('same HEAD dirty worktree invalidates all matching records; clean tree remains eligible', () => {
  assert.deepEqual(choose(undefined, undefined, { context: { ...context, dirty: true } }).coverage.tests, tests);
  assert.deepEqual(choose().coverage.tests, [a]);
  assert.deepEqual(choose(undefined, undefined, { context: { ...context, head: 'different', dirty: true } }).coverage.tests, [a]);
});

test('legacy/missing/unsupported maps and missing records remain conservative', () => {
  for (const map of [null, { version: 99 }, { version: 2, tests: {}, sources: {} }]) assert.deepEqual(choose([], map).coverage.tests, tests);
  const map = mapOf(); delete map.tests[b].collectedAt;
  assert.deepEqual(choose(undefined, map).coverage.tests, [a, b]);
});

test('helper and fixture changes invalidate reverse consumers, including removed old edges', () => {
  const map = mapOf(); map.tests[b].dependencies['tests/helper.mjs'] = 'old';
  let result = choose([change({ file: 'tests/helper.mjs' })], map, { fallback: () => [c] });
  assert.deepEqual(result.coverage.tests, [b, c]);
  result = choose([change({ file: 'tests/helper.mjs', kind: 'deleted' })], map, { fallback: () => [c] });
  assert.deepEqual(result.coverage.tests, [b, c]);
  assert.deepEqual(choose([change({ file: 'tests/data.json' })], map).coverage.tests, tests, 'unknown helper consumers require full');
  assert.deepEqual(choose([change({ file: 'tests/helper.mjs' })], map, { dependenciesUnknown: true }).coverage.tests, tests);
  assert.deepEqual(choose([], map, { context: { ...context, dependencyHash: () => 'new' } }).coverage.tests, [b]);
});

test('changed test runs and invalidates its old record; deleted tests leave no old map edges', () => {
  const map = mapOf();
  assert.deepEqual(choose([change({ file: b })], map).coverage.tests, [b]);
  assert.deepEqual(choose([change({ file: b })], map).requiredFiles, [b]);
  assert.deepEqual(choose([change({ file: 'tests/new.test.mjs', kind: 'added' })], map).coverage.tests, ['tests/new.test.mjs']);
  const refreshed = mergeMap(map, { [a]: null }, 'head');
  assert.equal(refreshed.tests[a], undefined);
  assert.deepEqual(refreshed.sources['server-plugin/math.mjs'].loadedBy, [b]);
  assert.deepEqual(refreshed.sources['server-plugin/math.mjs'].functions[0].tests, []);
  assert.equal(Object.values(refreshed.snapshots).length, 1);
  const empty = mergeMap(refreshed, { [b]: null }, 'head');
  assert.deepEqual(empty.sources, {});
  assert.deepEqual(empty.snapshots, {});
});

test('static graph includes extension, re-exports, literal dynamic imports and JSON reads', () => fixture({
  'extension/entry.mjs': "export { calc } from '../server-plugin/math.mjs';",
  'server-plugin/math.mjs': text,
  [a]: "import '../extension/entry.mjs';",
  [b]: "import ('../server-plugin/math.mjs');",
  [c]: "import data from './data.json' with { type: 'json' }; readFileSync('./data.json');",
  'tests/data.json': '{}',
}, root => {
  const graph = staticGraph(root);
  assert.deepEqual(affectedTests(root, ['server-plugin/math.mjs'], graph), [a, b]);
  assert.deepEqual(affectedTests(root, ['extension/entry.mjs'], graph), [a]);
  assert.deepEqual(affectedTests(root, ['tests/data.json'], graph), [c]);
  assert.ok(graph.unknown.has(c), 'fs reads stay conservative despite literal indexing');
}));

test('dependency snapshots bind helpers/test content; new collection replaces removed edges', () => fixture({
  [a]: "import './helper.mjs';", [b]: "import(name);", 'tests/helper.mjs': 'export const value = 1;',
}, root => {
  const first = dependencySnapshot(root, a);
  assert.equal(first.dependenciesUnknown, false);
  assert.equal(first.dependencies['tests/helper.mjs'], hash('export const value = 1;'));
  assert.equal(first.dependencies[a], hash("import './helper.mjs';"));
  assert.equal(dependencySnapshot(root, b).dependenciesUnknown, true);
  fs.writeFileSync(path.join(root, a), '');
  const next = dependencySnapshot(root, a);
  assert.equal(next.dependencies['tests/helper.mjs'], undefined);
  const refreshed = mergeMap(mapOf(), { [a]: record(next) }, 'head');
  assert.deepEqual(refreshed.tests[a].dependencies, next.dependencies);
  assert.ok(!refreshed.sources['server-plugin/math.mjs'].loadedBy.includes(a));
}));

test('Node/lock identity and dirty discovery use source paths, excluding map artifacts only', () => fixture({
  'package-lock.json': '{"version":1}', [a]: '', 'tools/gate/test/unit.test.mjs': '',
  'tools/gate/test/fixtures/tests/not-a-real.test.mjs': '',
}, root => {
  const map = path.join(root, 'map.json');
  let dirty = 'map.json\0map.json.shards/a.json\0map.json.generations/a.json\0map.json.events.jsonl\0';
  const git = args => args[0] === 'rev-parse' ? 'head' : args[0] === 'diff' ? dirty : '';
  const clean = worktreeContext(root, map, git);
  assert.equal(clean.dirty, false);
  assert.equal(clean.nodeVersion, process.version);
  dirty += `${a}\0`;
  assert.equal(worktreeContext(root, map, git).dirty, true);
  const old = lockHash(root);
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{"version":2}');
  assert.notEqual(lockHash(root), old);
  assert.deepEqual(discoverTests(root), [a, 'tools/gate/test/unit.test.mjs']);
}));

test('generation publication pins readers across an interleaved writer and preserves old generation', () => fixture({}, root => {
  const file = path.join(root, 'map.json');
  const first = publishMap(file, mapOf());
  const secondMap = mergeMap(first, { [b]: record({ exitCode: 1 }) }, 'head');
  const old = readMap(file, { afterPin: () => publishMap(file, secondMap) });
  assert.equal(old.generation, first.generation);
  assert.equal(old.tests[b].exitCode, 0);
  const current = readMap(file);
  assert.notEqual(current.generation, first.generation);
  assert.equal(current.tests[b].exitCode, 1);
  assert.equal(fs.readdirSync(`${file}.generations`).length, 2);
  assert.equal(fs.readdirSync(root).some(name => name.endsWith('.tmp')), false);
}));

test('generation never switches before complete write; aborted publication leaves previous usable', () => fixture({}, root => {
  const file = path.join(root, 'map.json'), first = publishMap(file, mapOf());
  assert.throws(() => publishMap(file, mapOf(), { beforeSwitch: () => {
    assert.equal(readMap(file).generation, first.generation);
    throw new Error('interrupted');
  } }), /interrupted/);
  assert.equal(readMap(file).generation, first.generation);
  const pointer = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(path.resolve(root, pointer.generationFile), '{}');
  assert.throws(() => readMap(file), /hash mismatch/);
}));

test('interleaved publishers use independent immutable files; last pointer names a complete generation', () => fixture({}, root => {
  const file = path.join(root, 'map.json');
  publishMap(file, mapOf());
  let inner;
  const outer = publishMap(file, mapOf(), { beforeSwitch: () => {
    inner = publishMap(file, mergeMap(mapOf(), { [b]: record({ exitCode: 1 }) }, 'head'));
    assert.equal(readMap(file).generation, inner.generation);
  } });
  assert.notEqual(inner.generation, outer.generation);
  assert.equal(readMap(file).generation, outer.generation);
  assert.equal(readMap(file).tests[b].exitCode, 0);
  assert.equal(fs.readdirSync(`${file}.generations`).length, 3);
}));

test('CLI policy and JSON use the unified selector; missing/corrupt maps fail conservatively', () => fixture({
  [a]: "import '../server-plugin/math.mjs';", [b]: "import '../server-plugin/math.mjs';", [c]: '',
  'server-plugin/math.mjs': text,
}, root => {
  const file = path.join(root, 'map.json'), policy = path.join(root, 'policy.json');
  const map = mapOf();
  for (const record of Object.values(map.tests)) record.lockHash = lockHash(root);
  publishMap(file, map);
  let stdout;
  const git = args => {
    if (args[0] === 'rev-parse') return 'head';
    if (args[0] === 'merge-base') return args[1] === '--is-ancestor' ? '' : 'base';
    if (args[0] === 'log') return '';
    if (args[0] === 'ls-files') return '';
    if (args[0] === 'show') return text;
    if (args[0] === 'diff' && args.includes('--name-only')) return args.some(arg => arg.includes('...HEAD')) ? 'server-plugin/math.mjs\0' : '';
    if (args[0] === 'diff') return '@@ -2 +2 @@\n-  return 1;\n+  return 2;';
    throw new Error(`unexpected Git ${args}`);
  };
  const args = [root, 'base', '--map', file, '--policy', policy, '--json'];
  const run = () => select(args, { git, log: value => { stdout = value; } });
  const shadow = run();
  assert.deepEqual(JSON.parse(stdout), shadow);
  assert.equal(shadow.mode, 'shadow', 'missing policy defaults shadow');
  assert.deepEqual(shadow.tests, [a, b]);
  assert.deepEqual(shadow.coverage.tests, [a]);
  fs.writeFileSync(policy, '{"mode":"prune"}');
  assert.deepEqual(run().tests, [a]);
  fs.writeFileSync(policy, '{"mode":"auto"}');
  assert.equal(run().mode, 'shadow');
  fs.writeFileSync(policy, '{"mode":"prune"}');
  fs.writeFileSync(file, '{');
  assert.deepEqual(run().tests, tests);
  fs.rmSync(file);
  assert.deepEqual(run().tests, tests);
  fs.writeFileSync(file, '{"version":99}');
  assert.deepEqual(run().tests, tests);
}));

test('collector can resume pinned generations with injected runner/Git, and never reuses dirty shards', async () => fixture({
  [a]: '', [b]: '',
}, async root => {
  const map = path.join(root, 'map.json');
  let dirty = false, runs = [];
  const git = args => args[0] === 'rev-parse' ? 'head' : args[0] === 'diff' && dirty ? `${a}\0` : '';
  const runFile = async ({ file, env }) => {
    runs.push(file);
    fs.writeFileSync(path.join(env.NODE_V8_COVERAGE, 'coverage.json'), '{"result":[]}');
    return { status: 'PASS', exitCode: 0 };
  };
  const args = ['--root', root, '--map', map];
  await collect(args, { git, runFile, tempRoot: root });
  assert.deepEqual(runs, [a, b]);
  const first = readMap(map);
  assert.ok(first.tests[a].collectedAt);
  assert.equal(first.tests[a].nodeVersion, process.version);
  assert.equal(first.tests[a].lockHash, lockHash(root));
  runs = []; await collect(args, { git, runFile, tempRoot: root });
  assert.deepEqual(runs, []);
  assert.equal(readMap(map).generation, first.generation, 'a no-op resume must not publish a new generation or renew evidence');
  dirty = true; await collect(args, { git, runFile, tempRoot: root });
  assert.deepEqual(runs, [a, b]);
  assert.equal(readMap(map).tests[a].dirty, true);
  dirty = false; runs = []; await collect(args, { git, runFile, tempRoot: root });
  assert.deepEqual(runs, [a, b], 'dirty records remain unusable after restoring a clean tree');
  fs.rmSync(path.join(root, b)); runs = [];
  await collect(args, { git, runFile, tempRoot: root });
  assert.equal(readMap(map).tests[b], undefined, 'deleted tests retire old edges even with no tests to recollect');
}));

test('collector persists FAIL/CRASH/TIMEOUT/INCOMPLETE as non-excluding evidence', async () => fixture({ [a]: '' }, async root => {
  const savedExit = process.exitCode;
  try {
    for (const status of ['FAIL', 'CRASH', 'TIMEOUT', 'INCOMPLETE']) {
      const file = path.join(root, `map-${status}.json`);
      await collect(['--root', root, '--map', file], {
        git: args => args[0] === 'rev-parse' ? 'head' : '', tempRoot: root,
        runFile: async ({ env }) => {
          fs.writeFileSync(path.join(env.NODE_V8_COVERAGE, 'coverage.json'), '{"result":[]}');
          return { status, exitCode: 0 };
        },
      });
      const map = readMap(file), observed = map.tests[a];
      assert.notEqual(observed.exitCode, 0, status);
      assert.ok(observed.partialCoverage || observed.unavailable, status);
      assert.equal(process.exitCode, 1);
      assert.deepEqual(selectChanges(map, [], { context: { ...context, lockHash: lockHash(root) } }).coverage.tests, [a]);
    }
  } finally { process.exitCode = savedExit; }
}));

test('unknown dynamic dependencies stay selected, but same clean snapshot PASS collection can resume', async () => fixture({
  [a]: 'import(name);',
}, async root => {
  const file = path.join(root, 'map.json');
  let calls = 0;
  const injected = { git: args => args[0] === 'rev-parse' ? 'head' : '', tempRoot: root,
    runFile: async ({ env }) => {
      calls++;
      fs.writeFileSync(path.join(env.NODE_V8_COVERAGE, 'coverage.json'), '{"result":[]}');
      return { status: 'PASS', exitCode: 0 };
    } };
  const args = ['--root', root, '--map', file];
  await collect(args, injected);
  await collect(args, injected);
  assert.equal(calls, 1);
  const map = readMap(file);
  assert.equal(map.tests[a].dependenciesUnknown, true);
  assert.deepEqual(selectChanges(map, [], { context: { ...context, lockHash: lockHash(root) } }).coverage.tests, [a]);
}));
