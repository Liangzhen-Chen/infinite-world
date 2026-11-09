// tools/affected-tests.mjs: scanner precision cases, run end-to-end against a throw-away fixture repo (nothing real is read).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const TOOL = path.resolve(import.meta.dirname, '..', 'tools', 'affected-tests.mjs');
const FILES = {
    // method definitions named import: must not make the file opaque
    'server-plugin/storage.mjs': 'export class S {\n  async import(bundle, id = `c_${mk(a(b))}`) {\n    return bundle;\n  }\n  import2(x) { return x.import(x); }\n}\nexport const o = { import(p) { return p; } };\n',
    'server-plugin/a.mjs': 'export const a = 1;\n',
    'server-plugin/b.mjs': 'export const b = 1;\n',
    // a real computed dynamic import: opaque, imports every script in its directory
    'server-plugin/dyn.mjs': 'export async function load(name) { return await import(name); }\n',
    // object key / comparison / case values that are just words
    'server-plugin/keys.mjs': "export const slots = {tools: 1, 'tools': 2};\nexport const f = n => n === 'tools' || 'tools' !== n;\nexport const g = n => { switch (n) { case 'tools': return 1; } };\n",
    // genuine path use
    'tools/x.json': '{}\n',
    'tools/README.md': 'readme\n',
    'tests/method.test.mjs': "import '../server-plugin/storage.mjs';\n",
    'tests/dyn.test.mjs': "import '../server-plugin/dyn.mjs';\n",
    'tests/keys.test.mjs': "import '../server-plugin/keys.mjs';\n",
    'tests/read.test.mjs': "import fs from 'node:fs';\nimport path from 'node:path';\nconst root = path.resolve(import.meta.dirname, '..');\nfs.readFileSync(path.join(root, 'tools', 'x.json'));\n",
    'tests/readdir.test.mjs': "import fs from 'node:fs';\nfs.readdirSync(path.join(root, 'tools'));\n",
};
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aff-'));
for (const [f, c] of Object.entries(FILES)) { fs.mkdirSync(path.dirname(path.join(root, f)), {recursive: true}); fs.writeFileSync(path.join(root, f), c); }
execFileSync('git', ['init', '-q', root]);
const pick = (...changed) => JSON.parse(execFileSync('node', [TOOL, '--root', root, '--json', '--files', ...changed], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']})).selected.map(t => path.basename(t, '.test.mjs'));

test.after(() => fs.rmSync(root, {recursive: true, force: true}));

test('method definition import(...) {} is not a dynamic import', () => {
    assert.ok(!pick('server-plugin/a.mjs').includes('method'));
    assert.ok(pick('server-plugin/storage.mjs').includes('method'));
});
test('a real import(expression) stays opaque', () => {
    assert.ok(pick('server-plugin/b.mjs').includes('dyn'));
});
test('object keys and comparison values are not directory reads', () => {
    assert.ok(!pick('tools/README.md').includes('keys'));
    assert.ok(!pick('tools/x.json').includes('keys'));
});
test('real fs/path.join reads of tools/ still select', () => {
    assert.ok(pick('tools/x.json').includes('read'));
    assert.ok(pick('tools/README.md').includes('readdir'));
});
