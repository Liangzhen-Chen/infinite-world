// 总登记表派生脚本（tools/entry-registry.mjs）的行为测试：自造小模块树，期望值按总纲手算。
import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveRegistry } from '../../tools/entry-registry.mjs';

const KINDS = ['read', 'predicate', 'write', 'hook', 'kernel', 'part'];
function tree() {
  return new Map([
    ['server-plugin/index.mjs', "import './dead.mjs';\nimport { boot } from './boot.mjs';\nexport async function init(router) { boot(router); }\n"],
    ['server-plugin/boot.mjs', "import './sys.mjs';\nimport { live } from './live.mjs';\nimport { other } from './other.mjs';\nexport function boot(r) { other(); return live(r); }\n"],
    ['server-plugin/kernel.mjs', 'export function registerHook(k, f) { return [k, f]; }\n'],
    ['server-plugin/sys.mjs', "import { registerHook } from './kernel.mjs';\nexport function hooked(x) { return x; }\nregisterHook('k', hooked);\n"],
    ['server-plugin/live.mjs', 'export function live(r) { return r; }\n'],
    ['server-plugin/other.mjs', 'function live(x) { return x + 1; }\nexport function other() { return live(1); }\n'],
    ['server-plugin/dead.mjs', "import { deadTarget } from './target.mjs';\nexport function deadCaller() { return deadTarget(1); }\n"],
    ['server-plugin/target.mjs', 'export function deadTarget(n) { return n; }\n'],
    ['server-plugin/lonely.mjs', 'export function lonely() { return 1; }\n'],
    ['tests/lonely.test.mjs', "import { lonely } from '../server-plugin/lonely.mjs';\nlonely();\n"],
  ]);
}
const row = (name, file, extra = {}) => ({ name, file, vol: '卷测', sec: '§3.1', kind: 'read', needs: [], rules: [], ...extra });
const vols = (lines) => new Map([['卷测', lines]]);
const DOC = ['# 卷测', '### 3.1 读入口', '| `hooked(x)` | sys.mjs |', '| `live(r)` | live.mjs |', '| `deadTarget(n)` | target.mjs |', '| `lonely()` | lonely.mjs |', '| `ghost()` | ghost.mjs |', '### 3.2 谓词'];
const entries = () => [row('hooked', 'sys.mjs'), row('live', 'live.mjs'), row('deadTarget', 'target.mjs'), row('lonely', 'lonely.mjs'), row('ghost', 'ghost.mjs')];
const byName = (res, n) => res.rows.find((r) => r.name === n);

test('经 register* 交入的入口判为已接通', () => {
  const res = deriveRegistry({ files: tree(), registry: { kinds: KINDS, entries: entries() }, volumes: vols(DOC), stateOwners: null });
  const r = byName(res, 'hooked');
  assert.equal(r.接通状态, '已接通');
  assert.deepEqual(r.生产调用, ['server-plugin/sys.mjs:3（交入）']);
});

test('只被一个本身未接通的函数调用的，判为未接通，并列出死调用点', () => {
  const res = deriveRegistry({ files: tree(), registry: { kinds: KINDS, entries: entries() }, volumes: vols(DOC), stateOwners: null });
  const r = byName(res, 'deadTarget');
  assert.equal(r.接通状态, '有代码无生产调用');
  assert.deepEqual(r.生产调用, []);
  assert.equal(r.死调用点.length, 1);
  assert.match(r.死调用点[0], /dead\.mjs:2.*deadCaller/);
});

test('仅测试调用与完全没建，状态各自分清', () => {
  const res = deriveRegistry({ files: tree(), registry: { kinds: KINDS, entries: entries() }, volumes: vols(DOC), stateOwners: null });
  assert.equal(byName(res, 'lonely').接通状态, '有代码无生产调用');
  assert.equal(byName(res, 'lonely').接通说明, '仅测试调用');
  assert.equal(byName(res, 'ghost').接通状态, '未建');
  assert.equal(byName(res, 'live').接通状态, '已接通');
});

test('别处自有同名定义、不经提供方的，判为绕开', () => {
  const res = deriveRegistry({ files: tree(), registry: { kinds: KINDS, entries: entries() }, volumes: vols(DOC), stateOwners: null });
  assert.deepEqual(byName(res, 'live').同名另定义, ['server-plugin/other.mjs:1']);
  assert.equal(res.problems.同名另定义.length, 1);
});

test('卷文锚点按节找名字：上面插行不影响，名字不在节里即报缺', () => {
  const shifted = ['', '', '新增的几行', ...DOC];
  const a = deriveRegistry({ files: tree(), registry: { kinds: KINDS, entries: entries() }, volumes: vols(DOC), stateOwners: null });
  const b = deriveRegistry({ files: tree(), registry: { kinds: KINDS, entries: entries() }, volumes: vols(shifted), stateOwners: null });
  assert.equal(byName(a, 'live').卷文行, '卷测:4');
  assert.equal(byName(b, 'live').卷文行, '卷测:7');
  assert.equal(b.problems.锚点缺失.length, 0);
  const miss = deriveRegistry({ files: tree(), registry: { kinds: KINDS, entries: [row('hooked', 'sys.mjs', { sec: '§3.2' })] }, volumes: vols(DOC), stateOwners: null });
  assert.equal(miss.problems.锚点缺失.length, 1);
});

test('needs 指向不存在与成环都报；依赖次序被依赖的在前', () => {
  const es = entries();
  es[0].needs = ['target.mjs#deadTarget'];
  es[1].needs = ['live.mjs#live'];
  es[2].needs = ['nowhere.mjs#nothing'];
  const res = deriveRegistry({ files: tree(), registry: { kinds: KINDS, entries: es }, volumes: vols(DOC), stateOwners: null });
  assert.equal(res.problems.needs指向不存在.length, 1);
  assert.equal(res.problems.needs环.length, 1);
  assert.deepEqual(res.problems.needs环[0], ['live.mjs#live']);
  const lvl = (n) => byName(res, n).层;
  assert.equal(lvl('deadTarget'), 0);
  assert.equal(lvl('hooked'), 1);
});

test('代码已导出而登记 file 为空，报违例，不豁免', () => {
  const res = deriveRegistry({ files: tree(), registry: { kinds: KINDS, entries: [row('lonely', null)] }, volumes: vols(DOC), stateOwners: null });
  assert.equal(res.problems.代码已导出但file为空或不符.length, 1);
});
