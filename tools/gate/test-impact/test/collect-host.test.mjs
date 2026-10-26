// Real-process tests for collect.mjs on a throw-away git repo with five fixture tests:
// #2 hangs, #4 crashes, the rest pass. Clock thresholds are injected short.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { main } from '../collect.mjs';
import { runFile } from '../../runner.mjs';

const base = fs.mkdtempSync(path.join(process.env.TEMP || os.tmpdir(), 'collect-host-'));
const repo = path.join(base, 'repo');
const map = path.join(base, 'map.json');
const files = [1, 2, 3, 4, 5].map(n => `tests/t${n}.test.mjs`);
const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
const body = n => `import test from 'node:test';\nimport { used } from '../lib.mjs';\ntest('t${n}', () => { used(${n}); });\n`;

before(() => {
  fs.mkdirSync(path.join(repo, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'lib.mjs'), 'export function used(n) { return n + 1; }\nexport function unused() { return 0; }\n');
  for (const n of [1, 3, 5]) fs.writeFileSync(path.join(repo, files[n - 1]), body(n));
  // #2 hangs until the untracked "unhang" marker exists; #4 always dies at startup.
  fs.writeFileSync(path.join(repo, files[1]), `import fs from 'node:fs';\nimport test from 'node:test';\nimport { used } from '../lib.mjs';\n`
    + `test('t2', async () => { used(2); if (!fs.existsSync(new URL('../unhang', import.meta.url))) { setInterval(() => {}, 1000); await new Promise(() => {}); } });\n`);
  fs.writeFileSync(path.join(repo, files[3]), `process.exit(3);\n`);
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't'); git('add', '-A'); git('commit', '-q', '-m', 'fixtures');
});
after(() => fs.rmSync(base, { recursive: true, force: true }));

async function collect(extra = []) {
  const called = [];
  const saved = process.exitCode;
  try {
    await main(['--root', repo, '--map', map, '--files', path.join(base, 'list.txt'), '--timeout-ms', '3000', '--grace-ms', '500', ...extra],
      { heartbeatMs: 1000, runFile: options => { called.push(options.file); return runFile(options); } });
    return { called, exitCode: process.exitCode };
  } finally { process.exitCode = saved; }
}
const readMap = () => JSON.parse(fs.readFileSync(map, 'utf8'));
const shardCount = () => fs.readdirSync(`${map}.shards`).filter(name => name.endsWith('.json')).length;

test('five files: hung #2 and crashed #4 are recorded unavailable, the other three keep full coverage', async () => {
  fs.writeFileSync(path.join(base, 'list.txt'), files.join('\n'));
  const { called, exitCode } = await collect();
  assert.deepEqual(called, files, 'every file ran, in order, one at a time');
  assert.equal(exitCode, 1);
  const tests = readMap().tests;
  for (const file of [files[0], files[2], files[4]]) {
    assert.equal(tests[file].exitCode, 0, file);
    assert.ok(!tests[file].unavailable);
    assert.ok(tests[file].sources['lib.mjs'], `${file} has coverage`);
  }
  for (const [file, status] of [[files[1], 'TIMEOUT'], [files[3], 'CRASH']]) {
    assert.equal(tests[file].unavailable, true, file);
    assert.equal(tests[file].status, status);
    assert.notEqual(tests[file].exitCode, 0, 'non-zero exitCode keeps it permanently selected');
    assert.deepEqual(tests[file].sources, {}, 'partial coverage is never used');
  }
  assert.equal(shardCount(), 5, 'one durable shard per file');
  const events = fs.readFileSync(`${map}.events.jsonl`, 'utf8');
  assert.ok(events.includes('"type":"heartbeat"') && events.includes('"type":"file-done"'));
});

test('resume re-runs only unavailable files; a still-crashing file stays unavailable', async () => {
  fs.writeFileSync(path.join(repo, 'unhang'), '');
  const { called } = await collect();
  assert.deepEqual(called, [files[1], files[3]]);
  const tests = readMap().tests;
  assert.equal(tests[files[1]].exitCode, 0);
  assert.ok(tests[files[1]].sources['lib.mjs']);
  assert.equal(tests[files[3]].unavailable, true);
  const third = await collect();
  assert.deepEqual(third.called, [files[3]], 'successes are not redone, the crash is retried');
});

test('after an interruption, shards refill the map and only the missing file is collected', async () => {
  fs.rmSync(map);
  const shardDir = `${map}.shards`;
  const victim = fs.readdirSync(shardDir).map(name => ({ name, shard: JSON.parse(fs.readFileSync(path.join(shardDir, name), 'utf8')) })).find(item => item.shard.file === files[4]);
  fs.rmSync(path.join(shardDir, victim.name));
  const { called } = await collect();
  assert.deepEqual(called.sort(), [files[3], files[4]].sort());
  const tests = readMap().tests;
  for (const file of [files[0], files[1], files[2], files[4]]) assert.equal(tests[file].exitCode, 0, `${file} restored`);
  assert.equal(tests[files[3]].unavailable, true);
});
