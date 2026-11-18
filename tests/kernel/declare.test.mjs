// 块 2 第 2-5 张：依赖声明 declareInputs、inputsOf 与加载期写回 systems[*].inputs（卷二 §2.3 :470–471、§2.7 :574–575、:828；验收 A10 :2377）。
// 节点名、路径、系统名都是本文件造的虚构值；期望的闭包按 :470–471 的定义手写字面量。

import test from 'node:test';
import assert from 'node:assert/strict';
import { declareInputs, finalizeInputs, inputsBySystem, resetDeclarations } from '../../server-plugin/kernel/declare.mjs';
import { inputsOf } from '../../server-plugin/kernel/memo.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { KernelError } from '../../server-plugin/kernel/errors.mjs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
// 接口调用错误：不带登记码的普通 Error（卷二 §4.3 勘误 1118b25），既不是 KernelError 也没有 code。
const plainError = (e) => e instanceof Error && !(e instanceof KernelError) && e.code === undefined;
const GEN = new Map([['gadget', { dim: { own: ['created.gad_*.props'], uses: [] }, modified: { own: ['modifiers', 'statuses'], uses: [] } }]]);

test('传递闭包：own 并 uses 闭包；dim:/modified: 机器生成；inputsOf 每次返回同一冻结对象（A10）', () => {
  resetDeclarations();
  declareInputs('view:alpha', { impl: ['alphaView', 'readAlpha'], own: [['alpha', '*']], uses: ['view:beta', 'modified:gadget'] });
  declareInputs('view:beta', { impl: ['betaView'], own: [{ path: ['records'], categories: ['ticket_b', 'ticket_a'] }], uses: ['dim:gadget'] });
  finalizeInputs(GEN);
  assert.deepEqual(inputsOf('view:alpha'), ['alpha.*', 'created.gad_*.props', 'modifiers', 'records[ticket_a,ticket_b]', 'statuses']);
  assert.deepEqual(inputsOf('modified:gadget'), ['created.gad_*.props', 'modifiers', 'statuses']);
  assert.deepEqual(inputsOf('dim:gadget'), ['created.gad_*.props']);
  assert.strictEqual(inputsOf('view:alpha'), inputsOf('view:alpha'));
  assert.ok(Object.isFrozen(inputsOf('view:alpha')));
  assert.throws(() => inputsOf('view:nosuch'), plainError);
});

test('改被调用节点的 own，调用者闭包随之变化（A10）', () => {
  resetDeclarations();
  declareInputs('view:alpha', { impl: ['alphaView'], own: [], uses: ['view:beta'] });
  declareInputs('view:beta', { impl: ['betaView'], own: [['beta', 'one']], uses: [] });
  finalizeInputs(new Map());
  assert.deepEqual(inputsOf('view:alpha'), ['beta.one']);
  resetDeclarations();
  declareInputs('view:alpha', { impl: ['alphaView'], own: [], uses: ['view:beta'] });
  declareInputs('view:beta', { impl: ['betaView'], own: [['beta', 'one'], ['beta', 'two']], uses: [] });
  finalizeInputs(new Map());
  assert.deepEqual(inputsOf('view:alpha'), ['beta.one', 'beta.two']);
});

test('成环 E-VIEW-DEPS-CYCLE；uses 指向未声明节点、重复登记、形状不合均为不带登记码的 Error', () => {
  resetDeclarations();
  declareInputs('view:alpha', { impl: ['a'], own: [], uses: ['view:beta'] });
  declareInputs('view:beta', { impl: ['b'], own: [], uses: ['view:alpha'] });
  assert.throws(() => finalizeInputs(new Map()), (e) => e.code === 'E-VIEW-DEPS-CYCLE');
  resetDeclarations();
  declareInputs('view:alpha', { impl: ['a'], own: [], uses: ['scope:nowhere'] });
  assert.throws(() => finalizeInputs(new Map()), plainError);
  resetDeclarations();
  declareInputs('view:alpha', { impl: ['a'], own: [], uses: [] });
  assert.throws(() => declareInputs('view:alpha', { impl: ['a'], own: [], uses: [] }), plainError);
  assert.throws(() => declareInputs('dim:gadget', { impl: ['a'], own: [], uses: [] }), plainError);
  assert.throws(() => declareInputs('view:gamma', { impl: [], own: [], uses: [] }), plainError);
});

test('写回 systems[*].inputs：节点按系统 view/predicates 的函数名落在 impl 组内归属', () => {
  resetDeclarations();
  declareInputs('view:alpha', { impl: ['alphaView'], own: [['alpha', '*']], uses: [] });
  declareInputs('scope:beta', { impl: ['resolveBeta'], own: [['beta']], uses: [] });
  finalizeInputs(new Map());
  const by = inputsBySystem({ 'sys.one': { view: 'one.mjs#alphaView', predicates: ['one.mjs#resolveBeta'] }, 'sys.two': { tables: [] } });
  assert.deepEqual(by.get('sys.one'), { 'scope:beta': ['beta'], 'view:alpha': ['alpha.*'] });
  assert.deepEqual(by.get('sys.two'), {});
});

test('统一加载器：加载期定稿并写回，dim:<kind> 按表 idPrefix 机器生成', () => {
  resetDeclarations();
  const r = loadWorld(ROOT, { dimensionsDir: 'tests/kernel/dims' });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(inputsOf('dim:gadget'), ['created.gad_*.props']);
  assert.deepEqual(inputsOf('modified:gadget'), ['created.gad_*.props', 'modifiers', 'statuses']);
  assert.deepEqual(r.owners.systems['sys.dimension_entry'].inputs, {});
});
