// 验收测试（出题方 Claude Sonnet 5.5 中档，写码方不得看、不得改）：跨卷判定 D —— 派生维度自引用缺 recursive 报 E-DIM-DERIVED-RECURSIVE。
// 依据：卷二 §1.2 :110（`.recursive`：derived 自引用时必须，码 E-DIM-DERIVED-RECURSIVE）；卷二 附录 A6 :2461（"`necessityTier` 自引用带 recursive → 通过；去掉 recursive → E-DIM-DERIVED-RECURSIVE"；
//   "两表 derived 互引成环 → E-DIM-DERIVED-CYCLE"）；卷二 §1.12 :400（勘误后第一句改"否则 E-DIM-DERIVED-RECURSIVE"，非自环的维度级环一律报错、实例级成环仍 CYCLE）；§4.3 :1587 两码都登记；
//   裁定 X-D；判定文 docs/研究/偏离清查-1122-跨卷判定.md 第 9 条。
// 测什么：经公开入口 validateDimensions（虚构表 gadget，造的最小样例）：① 直接自引用且不带 recursive → 报 E-DIM-DERIVED-RECURSIVE，且该维度不再报 CYCLE；② 带 recursive 的自引用 → 通过（对照）；
//   ③ 非自环的维度级环（a 引 b、b 引 a；三环 a→b→c→a）→ 仍报 E-DIM-DERIVED-CYCLE，不报 RECURSIVE（卷二 :2461 A6、:400 "非自环的维度级环一律报错"）；④ 自引用夹在别的派生里（间接引到自引用者）不连带报。
// 关于出题卡写的"直接或间接"：卷文只把"自引用"（本维度公式里出现自己）归 RECURSIVE，互引成环归 CYCLE，故间接成环按 :2461 断言为 CYCLE，不断言 RECURSIVE（理由写在 docs/卡档案/ds-xvol-cde/出题.md）。
// 修前为什么红：dimensions-validate.mjs 对不带 recursive 的自引用报 E-DIM-DERIVED-CYCLE，全仓无处触发 RECURSIVE，①红；②③④ 是修后不得破坏的对照。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDimensions } from '../../../server-plugin/kernel/validate/dimensions-validate.mjs';
import { fixture, OPTIONS, sourcesOf } from '../../kernel/fixture.mjs';

const derived = (expr, extra = {}) => ({ type: 'number', unit: 'kg', domain: [0, 200], precision: 2, derived: expr, modifiable: false, required: 'never', onUnknown: 'gap', source: 'test', owner: 'test', ...extra });
const run = (dims) => {
  const f = fixture();
  Object.assign(f.gadget.dimensions, dims);
  return validateDimensions(sourcesOf(f), OPTIONS);
};
const codesOn = (r, dim) => r.errors.filter((e) => e.severity === 'error' && e.dim === dim).map((e) => e.code).sort();

test('D①：派生维度直接引用自己、不带 recursive → E-DIM-DERIVED-RECURSIVE（卷二 :110、:400 勘误、:2461 A6），且这一维度不再报 CYCLE', () => {
  const r = run({ loop: derived('loop + 1') });
  assert.equal(r.ok, false);
  assert.deepEqual(codesOn(r, 'loop'), ['E-DIM-DERIVED-RECURSIVE']);
});

test('D①b：自引用藏在较长公式里（mass * loop）同样报 RECURSIVE', () => {
  const r = run({ loop: derived('mass * loop') });
  assert.deepEqual(codesOn(r, 'loop'), ['E-DIM-DERIVED-RECURSIVE']);
});

test('D②：自引用带 recursive:{relation} → 加载期通过，不报 RECURSIVE 也不报 CYCLE（卷二 :2461 "带 recursive → 通过"）', () => {
  const r = run({ deep: derived('deep + 1', { recursive: { relation: 'rel_part' } }) });
  assert.deepEqual(codesOn(r, 'deep'), []);
});

test('D③：非自环的维度级环（两维互引、三维成环）仍报 E-DIM-DERIVED-CYCLE，不报 RECURSIVE（卷二 :400 "非自环的维度级环一律报错"、:2461 A6 "互引成环 → CYCLE"）', () => {
  const two = run({ ping: derived('pong + 1'), pong: derived('ping + 1') });
  const codes2 = [...codesOn(two, 'ping'), ...codesOn(two, 'pong')];
  assert.ok(codes2.length >= 1);
  assert.ok(codes2.every((c) => c === 'E-DIM-DERIVED-CYCLE'), JSON.stringify(codes2));
  const three = run({ ra: derived('rb + 1'), rb: derived('rc + 1'), rc: derived('ra + 1') });
  const codes3 = [...codesOn(three, 'ra'), ...codesOn(three, 'rb'), ...codesOn(three, 'rc')];
  assert.ok(codes3.length >= 1);
  assert.ok(codes3.every((c) => c === 'E-DIM-DERIVED-CYCLE'), JSON.stringify(codes3));
});

test('D④：引用一个带 recursive 的自引用维度的普通派生维度不连带报错（只有自引用者本身受 recursive 条款约束）', () => {
  const r = run({ deep: derived('deep + 1', { recursive: { relation: 'rel_part' } }), user: derived('deep * 2') });
  assert.deepEqual(codesOn(r, 'user'), []);
  assert.deepEqual(codesOn(r, 'deep'), []);
});

test('D⑤：无环的链式派生（a 引 b，b 引 mass）零 E，不被新码误伤（对照）', () => {
  const r = run({ chainA: derived('chainB * 2'), chainB: derived('mass + 1') });
  assert.deepEqual(codesOn(r, 'chainA'), []);
  assert.deepEqual(codesOn(r, 'chainB'), []);
});
