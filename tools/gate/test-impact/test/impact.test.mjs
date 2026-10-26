import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseCoverage, mergeMap, collectOne } from '../collect.mjs';
import { selectChanges, parseHunks, lineBytes, discoverChanges } from '../select.mjs';
import { affectedTests, hash } from '../common.mjs';

const root = fileURLToPath(new URL('./fixtures/', import.meta.url));
const tempRoot = fileURLToPath(new URL('.', import.meta.url));
const text = fs.readFileSync(path.join(root, 'math.mjs'), 'utf8');
const a = 'tests/alpha.test.mjs', b = 'tests/beta.test.mjs';
function v8Function(name, count) {
  const startOffset = text.indexOf(`function ${name}`);
  const endOffset = name === 'outer' ? text.lastIndexOf('}') + 1 : text.indexOf('}', startOffset) + 1;
  return { functionName: name, ranges: [{ startOffset, endOffset, count }], isBlockCoverage: true };
}
function coverage(executed) {
  return { result: [{ url: pathToFileURL(path.join(root, 'math.mjs')).href, functions: [
    { functionName: '', ranges: [{ startOffset: 0, endOffset: text.length, count: 1 }] },
    ...['alpha', 'beta', 'unused', 'outer', 'inner'].map(name => v8Function(name, executed.includes(name) ? 1 : 0)),
  ] }] };
}
function record(executed, commit = 'map-commit') {
  // §5.3: fixtures must supply qualified per-record evidence, not map.generatedAt.
  return { commit, collectedAt: new Date().toISOString(), nodeVersion: process.version, lockHash: 'fixture-lock', dependencies: {},
    durationMs: 12, exitCode: 0, sources: parseCoverage(root, [coverage(executed)]) };
}
function makeMap() { return mergeMap(undefined, { [a]: record(['alpha', 'outer']), [b]: record(['beta', 'inner']) }, 'map-commit'); }
function change(line, extra = {}) {
  return { file: 'math.mjs', kind: 'modified', oldText: text, stale: false,
    patch: "-  return 'old';\n+  return 'new';", hunks: [{ startLine: line, lineCount: 1 }], ...extra };
}
// Existing executor assertions exercise the candidate prune set. Production's
// default shadow set and both reason maps are covered in lifecycle.test.mjs.
const choose = (changes, map = makeMap(), options) => selectChanges(map, changes,
  { mode: 'prune', context: { lockHash: 'fixture-lock' }, ...options });

test('function body change selects only its executor', () => {
  const result = choose([change(3)]);
  assert.deepEqual(result.tests, [a]);
  assert.equal(result.decisions[0].mode, 'functions');
  assert.deepEqual(result.decisions[0].functions.map(fn => fn.name), ['alpha']);
});
test('top-level change falls back to all loaders with a reason', () => {
  const result = choose([change(1)]);
  assert.deepEqual(result.tests, [a, b]);
  assert.equal(result.decisions[0].reason, 'top-level');
});
test('new file uses reverse imports, or all tests when no consumer is known', () => {
  const added = change(1, { file: 'new.mjs', kind: 'added' });
  const result = choose([added], makeMap(), { fallback: file => file === 'new.mjs' ? [b] : [] });
  assert.deepEqual(result.tests, [b]);
  assert.equal(result.decisions[0].reason, 'added-file');
  assert.deepEqual(choose([added]).tests, [a, b]);
  assert.equal(choose([added]).decisions[0].reason, 'added-file:all-tests');
});
test('unexecuted function retains loaders despite positive top-level coverage', () => {
  const result = choose([change(9)]);
  // §5.3 explicitly replaces empty execution evidence with loader/static fallback.
  assert.deepEqual(result.tests, [a, b]);
  assert.equal(result.decisions[0].mode, 'fallback');
  assert.equal(result.decisions[0].reason, 'unexecuted-function');
  assert.equal(result.decisions[0].functions[0].name, 'unused');
});
test('source changed since map commit falls back even for a function edit', () => {
  const result = choose([change(3, { stale: true })]);
  assert.deepEqual(result.tests, [a, b]);
  assert.equal(result.decisions[0].reason, 'source-changed-since-map');
});
test('nested edit chooses innermost executor; surrounding outer code chooses outer', () => {
  assert.deepEqual(choose([change(13)]).tests, [b]);
  assert.deepEqual(choose([change(15)]).tests, [a]);
  assert.deepEqual(choose([change(12, { hunks: [{ startLine: 12, lineCount: 4 }] })]).tests, [a, b]);
});
test('UTF-16 V8 ranges become UTF-8 bytes, including Chinese and astral characters', () => {
  const source = record(['alpha']).sources['math.mjs'];
  const alpha = source.functions.find(fn => fn.name === 'alpha');
  const offset = text.indexOf('function alpha');
  assert.equal(alpha.start, Buffer.byteLength(text.slice(0, offset)));
  assert.ok(alpha.start > offset);
  assert.equal(source.bytes, Buffer.byteLength(text));
  assert.equal(source.topLevel.length, 1);
  assert.equal(source.functions.some(fn => fn.start === 0), false);
});
test('Git LF hunks align with a CRLF V8 snapshot under core.autocrlf', () => {
  const crlf = text.replaceAll('\n', '\r\n');
  const document = coverage(['alpha']);
  const convert = offset => offset + (text.slice(0, offset).match(/\n/g) || []).length;
  for (const fn of document.result[0].functions) for (const range of fn.ranges) {
    range.startOffset = convert(range.startOffset);
    range.endOffset = convert(range.endOffset);
  }
  const sources = parseCoverage(root, [document], () => crlf);
  const map = mergeMap(undefined, { [a]: { ...record([]), durationMs: 1, sources } }, 'map-commit');
  const result = choose([change(3)], map);
  assert.equal(result.decisions[0].mode, 'functions');
  assert.deepEqual(result.tests, [a]);
  assert.ok(map.sources['math.mjs'].functions.find(fn => fn.name === 'alpha').start > record(['alpha']).sources['math.mjs'].functions[0].start);
});
test('parser ignores builtins, dependencies, external files, SillyTavern and test sources', () => {
  const script = coverage(['alpha']).result[0];
  const urls = ['node:fs', pathToFileURL(path.join(root, '../outside.mjs')).href,
    ...['node_modules/pkg/index.mjs', 'SillyTavern/app.mjs', a].map(file => pathToFileURL(path.join(root, file)).href)];
  const result = parseCoverage(root, [{ result: [script, ...urls.map(url => ({ ...script, url }))] }]);
  assert.deepEqual(Object.keys(result), ['math.mjs']);
});
test('positive block counts do not mark a never-entered function executed', () => {
  const document = coverage([]);
  document.result[0].functions[1].ranges.push({ startOffset: 1, endOffset: 2, count: 1 });
  assert.equal(parseCoverage(root, [document])['math.mjs'].functions[0].executed, false);
});
test('multiple V8 documents union actual executions', () => {
  const source = parseCoverage(root, [coverage(['alpha']), coverage(['beta'])])['math.mjs'];
  assert.equal(source.functions.length, 5);
  assert.deepEqual(source.functions.filter(fn => fn.executed).map(fn => fn.name), ['alpha', 'beta']);
});
test('shared snapshots retain lazy nested functions omitted by another report', () => {
  const first = record(['inner']);
  const second = record(['beta']);
  second.sources['math.mjs'].functions = second.sources['math.mjs'].functions.filter(fn => fn.name !== 'inner');
  const map = mergeMap(undefined, { [a]: first, [b]: second }, 'map-commit');
  assert.deepEqual(choose([change(13)], map).tests, [a]);
  const refreshed = mergeMap(map, { [b]: second }, 'map-commit');
  assert.deepEqual(choose([change(13)], refreshed).tests, [a]);
});
test('partial refresh removes old execution edges and preserves other tests and durations', () => {
  const map = mergeMap(makeMap(), { [a]: { ...record(['beta']), durationMs: 77 } }, 'new-map');
  assert.deepEqual(map.sources['math.mjs'].functions.find(fn => fn.name === 'alpha').tests, []);
  assert.deepEqual(map.sources['math.mjs'].functions.find(fn => fn.name === 'beta').tests, [a, b]);
  assert.equal(map.tests[a].durationMs, 77);
  assert.equal(map.tests[b].durationMs, 12);
  assert.equal(map.commit, 'new-map');
});
test('mixed snapshots force fallback until every remaining loader is refreshed', () => {
  const update = record(['alpha'], 'new-map');
  update.sources['math.mjs'].hash = hash(`${text}\n`);
  const mixed = mergeMap(makeMap(), { [a]: update }, 'new-map');
  assert.equal(mixed.sources['math.mjs'].stale, true);
  assert.equal(choose([change(3)], mixed).decisions[0].reason, 'mixed-source-snapshots');
  const refreshed = mergeMap(mixed, { [b]: update }, 'new-map');
  assert.equal(refreshed.sources['math.mjs'].stale, false);
});
test('offset/hash mismatch and invalid intervals fall back', () => {
  assert.equal(choose([change(3, { oldText: `${text}\n` })]).decisions[0].reason, 'source-offset-mismatch');
  const map = makeMap();
  map.sources['math.mjs'].functions[0].end = 999999;
  assert.equal(choose([change(3)], map).decisions[0].reason, 'invalid-function-offsets');
});
test('world data, deleted modules, and test files use documented fallback paths', () => {
  // §5.3: world data always requires full selection, even with known readers.
  assert.deepEqual(choose([change(1, { file: 'world/item.json' })], makeMap(), { fallback: () => [b] }).tests, [a, b]);
  assert.equal(choose([change(1, { file: 'world/item.json' })]).decisions[0].reason, 'world-data');
  assert.deepEqual(choose([change(1, { kind: 'deleted' })]).tests, [a, b]);
  const added = 'tests/new.test.mjs';
  assert.deepEqual(choose([change(1, { file: added, kind: 'added' })]).tests, [added]);
  assert.deepEqual(choose([change(1, { file: a })]).tests, [a]);
});
test('failed collection tests always remain selected', () => {
  const map = makeMap();
  map.tests[a].exitCode = 1;
  // Keep the failed record even when the edited function is executed only by b.
  assert.deepEqual(choose([change(13)], map).tests, [a, b]);
});
test('partial initial maps cannot omit tests that have never been collected', () => {
  const unknown = 'tests/uncollected.test.mjs';
  const result = choose([change(3)], makeMap(), { allTests: [a, b, unknown] });
  assert.deepEqual(result.tests, [a, unknown]);
  assert.deepEqual(result.uncollected, [unknown]);
});
test('hunks support replacement, deletion, insertion and CRLF byte boundaries', () => {
  assert.deepEqual(parseHunks('@@ -3 +3 @@\n@@ -7,2 +7,0 @@\n@@ -10,0 +9,2 @@'), [
    { startLine: 3, lineCount: 1 }, { startLine: 7, lineCount: 2 }, { startLine: 10, lineCount: 0 },
  ]);
  assert.deepEqual(lineBytes('中\r\nx\r\n', { startLine: 2, lineCount: 1 }), { start: 5, end: 8 });
  assert.deepEqual(choose([change(3, { hunks: [{ startLine: 2, lineCount: 0 }] })]).tests, [a]);
  assert.equal(choose([change(3, { hunks: [{ startLine: 4, lineCount: 0 }] })]).decisions[0].mode, 'fallback');
});
test('real fixture reverse-import closure finds consumers', () => {
  assert.deepEqual(affectedTests(root, ['math.mjs']), [a, b]);
});
test('Git discovery unions committed, dirty and untracked paths and checks per-source history', () => {
  const calls = [];
  const runGit = args => {
    calls.push(args);
    if (args[0] === 'merge-base') return args[1] === '--is-ancestor' ? '' : 'ancestor\n';
    if (args[0] === 'diff' && args.includes('--name-only')) return 'math.mjs\0';
    if (args[0] === 'ls-files') return 'tests/new.test.mjs\0';
    if (args[0] === 'show') { if (args[1].endsWith('math.mjs')) return text; throw new Error('new file'); }
    if (args[0] === 'log') return 'earlier-commit\n';
    if (args[0] === 'diff') return '@@ -3 +3 @@\n';
    throw new Error(`Unexpected git call: ${args}`);
  };
  const changes = discoverChanges(root, 'base', makeMap(), runGit);
  assert.deepEqual(changes.map(c => c.file), ['math.mjs', 'tests/new.test.mjs']);
  assert.equal(changes[0].stale, true);
  assert.equal(changes[1].kind, 'added');
  assert.ok(calls.some(args => args.includes('base...HEAD')));
  assert.ok(calls.some(args => args[0] === 'log' && args.includes('map-commit..HEAD')));
  assert.deepEqual(choose(changes).tests, [a, b, 'tests/new.test.mjs']);
});
test('collectOne reads simulated V8 JSON, records failure and duration, and removes temp files', async () => {
  let directory;
  const result = await collectOne(root, a, 'commit', { tempRoot, run: async (cwd, file, dir) => {
    assert.equal(cwd, root); assert.equal(file, a); directory = dir;
    fs.writeFileSync(path.join(dir, 'coverage-123.json'), JSON.stringify(coverage(['alpha'])));
    return 1;
  } });
  assert.equal(result.exitCode, 1);
  assert.equal(result.commit, 'commit');
  assert.ok(result.durationMs >= 0);
  assert.equal(result.sources['math.mjs'].functions.find(fn => fn.name === 'alpha').executed, true);
  assert.equal(fs.existsSync(directory), false);
});
test('collectOne cleans temp files on spawn errors and rejects absent coverage', async () => {
  let directory;
  await assert.rejects(collectOne(root, a, 'commit', { tempRoot, run: async (_cwd, _file, dir) => {
    directory = dir; throw new Error('EPERM');
  } }), /EPERM/);
  assert.equal(fs.existsSync(directory), false);
  await assert.rejects(collectOne(root, a, 'commit', { tempRoot, run: async () => 0 }), /No V8 coverage/);
});
