// 世界创建入口 generateWorld（卷十 §3.2 :291；李白 11-22 18:36 P-28～P-30）：次序由步骤表数据给出，依赖检查在事务开启前拒收，任一步失败整笔回滚。
// 本机小夹具：虚构步骤模块与虚构状态（save-world.mjs 的夹具），只测入口本身的行为；真实世界跑一遍见 tests/cloud/world-create-hw.test.mjs。
// 期望值都是手列的字面量：调用次序、拒收的错误码、回滚后的状态。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame } from './save-world.mjs';
import { writePath } from '../../server-plugin/kernel/storage.mjs';
import { buildP } from '../../server-plugin/kernel/handles/generated.mjs';
import { KernelError } from '../../server-plugin/kernel/errors.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import { generateWorld, checkCreateSteps } from '../../server-plugin/world-create.mjs';

useReportSink(() => {});
const P = buildP({ pathTypes: { 'gauge.*.level': 'integer:count' } }); // 夹具里 gauge.*.level 的路径句柄（同 save-world.mjs）
const CTX = { node: 'view:act', file: 'sys/gauge.mjs' }; // 夹具里 gauge.*.level 的登记写者
const TEMPLATE = { worldSeed: 'seed_t', genesisMinute: 0 };
const level = (s) => s.gauge.gad_one.level;

// 步骤表（四步，形状同规则表 rules.gen.createSteps）：fill 读外部 world，写 a；gov 读 a，写 b；own 读 b，写 c；solo 读外部 roster，写 d。
const STEPS = [
  { step: 'fill', reads: ['world'], writes: ['a'] },
  { step: 'gov', reads: ['a'], writes: ['b'] },
  { step: 'own', reads: ['b'], writes: ['c'] },
  { step: 'solo', reads: ['roster'], writes: ['d'] },
];
const engineOf = (steps) => ({ rules: { gen: { createSteps: steps } } });
const INPUTS = { world: 'W', roster: 'R' };
function modules(calls, extra = {}) {
  const mk = (name, out) => ({ state, channels }) => { calls.push([name, Object.keys(channels).sort().join(',')]); return typeof out === 'function' ? out(state, channels) : out; };
  return {
    fill: mk('fill', { a: 1 }),
    gov: mk('gov', (s) => { writePath(s, P.gauge_level('gad_one'), 7); return { b: 2 }; }),
    own: mk('own', { c: 3 }),
    solo: mk('solo', { d: 4 }),
    ...extra,
  };
}

test('步骤表次序决定调用次序，各步只拿到外部通道与先行步骤的产出；返回全部通道', () => {
  const calls = [];
  const state = newGame().state;
  const r = generateWorld(engineOf(STEPS), state, TEMPLATE, INPUTS, { modules: modules(calls), ctx: CTX });
  assert.equal(r.ok, true);
  assert.deepEqual(calls.map((c) => c[0]), ['fill', 'gov', 'own', 'solo']);
  assert.deepEqual(calls[1], ['gov', 'a']); // 每步只拿到自己声明的 reads：gov 只读 a，看不到 world、roster，也还没有 b
  assert.deepEqual([r.channels.a, r.channels.b, r.channels.c, r.channels.d], [1, 2, 3, 4]);
  assert.equal(level(state), 7);
});

test('改步骤表次序（独立的一步挪到最前）仍合法，次序随表变，代码不动', () => {
  const calls = [];
  const steps = [STEPS[3], STEPS[0], STEPS[1], STEPS[2]];
  assert.equal(generateWorld(engineOf(steps), newGame().state, TEMPLATE, INPUTS, { modules: modules(calls), ctx: CTX }).ok, true);
  assert.deepEqual(calls.map((c) => c[0]), ['solo', 'fill', 'gov', 'own']);
});

test('依赖检查：把读者排到写者前面（own 排到 gov 之前）被拦下，E-GEN-STAGE-CYCLE，一步都没跑、状态不变', () => {
  const calls = [];
  const state = newGame().state;
  const bad = [STEPS[0], STEPS[2], STEPS[1], STEPS[3]];
  assert.throws(() => generateWorld(engineOf(bad), state, TEMPLATE, INPUTS, { modules: modules(calls), ctx: CTX }), (e) => e instanceof KernelError && e.code === 'E-GEN-STAGE-CYCLE' && e.message.includes('own reads b'));
  assert.deepEqual(calls, []);
  assert.equal(level(state), 0);
});

test('依赖检查：读了外部没交入的通道被拦下（缺 roster）', () => {
  assert.throws(() => generateWorld(engineOf(STEPS), newGame().state, TEMPLATE, { world: 'W' }, { modules: modules([]), ctx: CTX }), (e) => e.code === 'E-GEN-STAGE-CYCLE' && e.message.includes('solo reads roster'));
});

test('步骤表结构：没有模块的步骤 E-GEN-STAGE-UNKNOWN；步骤重复、通道被两步写、空表、行形状不对都拒收', () => {
  const ext = ['world', 'roster'];
  const mods = modules([]);
  assert.throws(() => checkCreateSteps([...STEPS, { step: 'ghost', reads: [], writes: ['z'] }], ext, mods), (e) => e.code === 'E-GEN-STAGE-UNKNOWN');
  assert.throws(() => checkCreateSteps([STEPS[0], STEPS[0]], ext, mods), (e) => e.code === 'E-DIM-STRUCT-FIELD');
  assert.throws(() => checkCreateSteps([STEPS[0], { step: 'gov', reads: [], writes: ['a'] }], ext, mods), (e) => e.code === 'E-DIM-STRUCT-FIELD');
  assert.throws(() => checkCreateSteps([{ step: 'fill', reads: [], writes: ['world'] }], ext, mods), (e) => e.code === 'E-DIM-STRUCT-FIELD'); // 写了外部通道
  assert.throws(() => checkCreateSteps([], ext, mods), (e) => e.code === 'E-RULES-UNREGISTERED');
  assert.throws(() => checkCreateSteps(undefined, ext, mods), (e) => e.code === 'E-RULES-UNREGISTERED');
  assert.throws(() => checkCreateSteps([{ step: 'fill', reads: 'world', writes: [] }], ext, mods), (e) => e.code === 'E-DIM-STRUCT-FIELD');
  assert.throws(() => checkCreateSteps([{ step: 'fill', reads: [''], writes: [] }], ext, mods), (e) => e.code === 'E-DIM-STRUCT-FIELD'); // 空串通道名
});

test('整笔回滚：第三步失败，第二步已写的状态撤回，返回失败码、不返回通道', () => {
  const calls = [];
  const state = newGame().state;
  const mods = modules(calls, { own: () => { throw new KernelError('E-GEN-ROW-INVALID', {}, 'boom'); } });
  const r = generateWorld(engineOf(STEPS), state, TEMPLATE, INPUTS, { modules: mods, ctx: CTX });
  assert.deepEqual(r, { ok: false, code: 'E-GEN-ROW-INVALID' });
  assert.deepEqual(calls.map((c) => c[0]), ['fill', 'gov']);
  assert.equal(level(state), 0); // gov 写的 7 已撤回
});

test('模块接口：返回的键须与步骤表声明的 writes 一一相符（多一个、少一个都整笔回滚）', () => {
  for (const out of [{ b: 2, extra: 1 }, {}]) {
    const state = newGame().state;
    const mods = modules([], { gov: (a) => { writePath(a.state, P.gauge_level('gad_one'), 7); return out; } });
    const r = generateWorld(engineOf(STEPS), state, TEMPLATE, INPUTS, { modules: mods, ctx: CTX });
    assert.deepEqual(r, { ok: false, code: 'E-DIM-STRUCT-FIELD' });
    assert.equal(level(state), 0);
  }
});

test('换模块：只换 modules 里的一项，步骤表不动', () => {
  const calls = [];
  const r = generateWorld(engineOf(STEPS), newGame().state, TEMPLATE, INPUTS, { modules: modules(calls, { own: () => ({ c: 'other' }) }), ctx: CTX });
  assert.equal(r.channels.c, 'other');
});

test('声明的读有约束力：模块读没声明的通道拿到 undefined（solo 只声明读 roster，读 world 得 undefined）', () => {
  let seenWorld = 'unset';
  const mods = modules([], { solo: ({ channels }) => { seenWorld = channels.world; return { d: channels.roster }; } });
  const r = generateWorld(engineOf(STEPS), newGame().state, TEMPLATE, INPUTS, { modules: mods, ctx: CTX });
  assert.equal(seenWorld, undefined);
  assert.equal(r.channels.d, 'R');
});

test('外部通道值是 undefined 即拒收（不等到模块里才炸），一步都不跑', () => {
  const calls = [];
  assert.throws(() => generateWorld(engineOf(STEPS), newGame().state, TEMPLATE, { world: 'W', roster: undefined }, { modules: modules(calls), ctx: CTX }), (e) => e.code === 'E-DIM-STRUCT-FIELD' && e.message.includes('roster'));
  assert.deepEqual(calls, []);
});

