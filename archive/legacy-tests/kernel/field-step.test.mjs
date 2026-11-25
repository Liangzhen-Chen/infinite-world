// G14 场步进的纯算法（卷二十 §4.7.3 第 1、3、8、9 条；对照表 #46、#50、#54 核心、#55、#56、#57 的权重式）。
// 期望值都按卷文公式手算成字面量（10⁸ 标度整数）；不读仓库此刻的数据。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROOT } from './perceive-world.mjs';
import { fixedUnits8, splitLastRemainder } from '../../server-plugin/kernel/det-math.mjs';
import { anchorRead, splitShares, windWeight, angleBetweenDeg, foldShare, stepLayer, cloneItems } from '../../server-plugin/field-step.mjs';

assert.ok(ROOT.length > 0);
const u = (x) => fixedUnits8(x);
const FIRE = { d8: u(0.75), rate8: u(0.2), quench8: u(2), advected: false, byproducts: [] };
const row = (over = {}) => ({ ...FIRE, ...over });
const mk = (spec) => ({
  minute: 1, stepMinutes: 1, epsilon8: u(0.01), windBias: 0.5, fullTurnDeg: 360,
  fields: new Map([['f', row()]]), items: new Map(), emissionNodes: [], emission: () => 0n,
  precipStep8: () => 0n, skyFactor8: () => u(1), windDirDeg: () => null, targets: () => [],
  ...spec,
});
const items = (...xs) => new Map(xs.map(([n, f, value, at]) => [n, new Map([[f, { value8: u(value), at }]])]));
const tgt = (id, extra = {}) => ({ key: id, kind: 'node', id, ...extra });

test('#46 强度 80、每步衰减 0.25，三步后 33.75（卷二十 :891 手算）', () => {
  assert.equal(anchorRead({ value8: u(80), at: 0 }, u(0.75), 5, 15), 3375000000n);
  assert.equal(anchorRead({ value8: u(80), at: 0 }, u(0.75), 5, 0), 8000000000n);
  assert.throws(() => anchorRead({ value8: u(80), at: 0 }, u(0.75), 5, 7), /E-DIM-DOMAIN-RANGE/);
});

test('#46 纯衰减段不写：四项皆 0 的步没有任何写，锚点不动', () => {
  const r = stepLayer(mk({ minute: 5, stepMinutes: 5, items: items(['A', 'f', 80, 0]) }));
  assert.deepEqual(r.writes, []);
  assert.deepEqual(r.records, []);
});

test('#46 强度低于 epsilon 按闭式读数比删除（纯衰减段）', () => {
  // 0.1 × 0.75 = 0.075 不低于 0.01；0.01 × 0.75 = 0.0075 低于 0.01 → 删除
  const keep = stepLayer(mk({ items: items(['A', 'f', 0.1, 0]) }));
  assert.deepEqual(keep.writes, []);
  const gone = stepLayer(mk({ items: items(['A', 'f', 0.01, 0]) }));
  assert.deepEqual(gone.writes, [{ node: 'A', field: 'f', op: 'delete', value8: 0n, at: 1 }]);
});

test('#46 新强度 = 旧强度×(1−衰减) + 排放 − 蔓延出 + 蔓延入，clamp 到 0；排放新建一项', () => {
  // A：100 → 读数(1) 75；排放 5；B 为新项只收排放 3；A 无目标所以无蔓延出：75 + 5 = 80
  const r = stepLayer(mk({ items: items(['A', 'f', 100, 0]), emissionNodes: ['A', 'B'], emission: (n) => (n === 'A' ? u(5) : u(3)) }));
  assert.deepEqual(r.writes, [
    { node: 'A', field: 'f', op: 'set', value8: u(80), at: 1 },
    { node: 'B', field: 'f', op: 'set', value8: u(3), at: 1 },
  ]);
});

test('#46 降水压制：quenchPerMm × 当步降水，压到 0 后清零（clamp）', () => {
  // A：100 → 75；降水 4 mm × quench 2 = 8，75 − 8 = 67；降水 40 mm → 80 > 75 → 0 → 删除
  const a = stepLayer(mk({ items: items(['A', 'f', 100, 0]), precipStep8: () => u(4) }));
  assert.equal(a.writes[0].value8, u(67));
  const b = stepLayer(mk({ items: items(['A', 'f', 100, 0]), precipStep8: () => u(40) }));
  assert.deepEqual(b.writes, [{ node: 'A', field: 'f', op: 'delete', value8: 0n, at: 1 }]);
  // 泡内格：压制再乘该格 openSky：0.5 × 8 = 4 → 71；openSky 0 的格（屋里）不被压
  const c = stepLayer(mk({ items: items(['A', 'f', 100, 0]), precipStep8: () => u(4), skyFactor8: () => u(0.5) }));
  assert.equal(c.writes[0].value8, u(71));
  const d = stepLayer(mk({ items: items(['A', 'f', 100, 0]), precipStep8: () => u(4), skyFactor8: () => 0n }));
  assert.deepEqual(d.writes, [], '压制项为 0 且别的项也为 0：纯衰减段，不写');
});

test('共用拆分原语 splitLastRemainder（房间行、账本成本、场蔓延三处共用）：手算 10 行按 0.3/0.3 分 → 3、3、4；成本 7 × 2 ÷ 5 → 2 余 5；分母须为正', () => {
  assert.deepEqual(splitLastRemainder(10n, [3000n, 3000n], 10000n), [3n, 3n, 4n]);
  assert.deepEqual(splitLastRemainder(7n, [2n], 5n), [2n, 5n]);
  assert.deepEqual(splitLastRemainder(5n, [], 1n), [5n]);
  assert.throws(() => splitLastRemainder(1n, [1n], 0n), (e) => e.code === 'E-DET-DOMAIN');
});

test('#50 拆分：前几份各一次整除、末份取差，Σ分到 = 蔓延出（③⑨）', () => {
  assert.deepEqual(splitShares(100n, [1n, 1n, 1n]), [33n, 33n, 34n]);
  assert.deepEqual(splitShares(2000000000n, [10000n, 5000n]), [1333333333n, 666666667n]);
  assert.throws(() => splitShares(5n, [0n, 0n]), /E-DIM-DOMAIN-RANGE/);
  assert.throws(() => splitShares(5n, []), /E-DIM-DOMAIN-RANGE/);
});

test('#50 随风权重：顺风 1、逆风 windBias、中间线性；方位角未知取四分之一圈（windBias 0.5 手算）', () => {
  assert.equal(windWeight(0, 0.5, 360), 10000n);
  assert.equal(windWeight(180, 0.5, 360), 5000n);
  assert.equal(windWeight(90, 0.5, 360), 7500n);
  assert.equal(windWeight(null, 0.5, 360), 7500n);
  assert.equal(windWeight(120, 0.5, 360), 6667n); // 10000 − ⌊5000 × 120 ÷ 180⌋
  assert.equal(windWeight(0, 1, 360), 10000n);
  assert.equal(windWeight(180, 0.0001, 360), 1n, '权重在 10⁴ 下求，最小为 windBias');
  assert.equal(angleBetweenDeg(350, 10, 360), 20);
  assert.equal(angleBetweenDeg(0, 180, 360), 180);
  assert.equal(angleBetweenDeg(270, 90, 360), 180);
});

test('#50 蔓延：A 100 → 蔓延出 20；B、C 各 10；记录三项逐位相等（③）；pass 0.5 的边只收一半、差额进开放度损失', () => {
  const r = stepLayer(mk({ items: items(['A', 'f', 100, 0]), targets: () => [tgt('B'), tgt('C')] }));
  assert.deepEqual(r.writes.map((w) => [w.node, w.value8]), [['A', u(55)], ['B', u(10)], ['C', u(10)]]);
  assert.deepEqual(r.records, [{ node: 'A', field: 'f', out: u(20), inSum: u(20), loss: 0n }]);
  const p = stepLayer(mk({ items: items(['A', 'f', 100, 0]), targets: () => [tgt('B', { pass8: u(0.5) }), tgt('C')] }));
  assert.deepEqual(p.writes.map((w) => [w.node, w.value8]), [['A', u(55)], ['B', u(5)], ['C', u(10)]]);
  assert.deepEqual(p.records, [{ node: 'A', field: 'f', out: u(20), inSum: u(15), loss: u(5) }]);
});

test('#50 随风分配：顺风目标 B（方位 0）、逆风目标 C（方位 180），风去向 0，windBias 0.5：20 按 10000:5000 拆', () => {
  const fields = new Map([['f', row({ advected: true })]]);
  const r = stepLayer(mk({
    fields, items: items(['A', 'f', 100, 0]), windDirDeg: () => 0,
    targets: () => [tgt('C', { bearingDeg: 180 }), tgt('B', { bearingDeg: 0 })],
  }));
  const by = Object.fromEntries(r.writes.map((w) => [w.node, w.value8]));
  assert.equal(by.B, 1333333333n);
  assert.equal(by.C, 666666667n);
  assert.equal(r.records[0].inSum, u(20));
});

test('#50 本地 openSky 为 0（windDirDeg 给 null）与权重合计为 0 都按等权', () => {
  const fields = new Map([['f', row({ advected: true })]]);
  const r = stepLayer(mk({ fields, items: items(['A', 'f', 100, 0]), windDirDeg: () => null, targets: () => [tgt('B', { bearingDeg: 0 }), tgt('C', { bearingDeg: 180 })] }));
  assert.deepEqual(r.writes.filter((w) => w.node !== 'A').map((w) => w.value8), [u(10), u(10)]);
});

test('#50 ⑨⑤⑯ 打乱节点与目标的遍历顺序，一步之后写入逐位相同', () => {
  const fields = new Map([['f', row({ advected: true })], ['g', row({ rate8: u(0.1) })]]);
  const base = new Map([
    ['A', new Map([['f', { value8: u(100), at: 0 }], ['g', { value8: u(30), at: 0 }]])],
    ['B', new Map([['f', { value8: u(7), at: 0 }]])],
    ['C', new Map([['g', { value8: u(9), at: 0 }]])],
  ]);
  const targets = (n) => ({ A: [tgt('B', { bearingDeg: 30 }), tgt('C', { bearingDeg: 200 }), tgt('D', { bearingDeg: 100 })], B: [tgt('A', { bearingDeg: 210 })], C: [tgt('A', { bearingDeg: 20 }), tgt('D', { bearingDeg: 90 })] }[n]);
  const run = (its, rev) => stepLayer(mk({ fields, items: its, windDirDeg: () => 45, targets: (n) => (rev ? [...targets(n)].reverse() : targets(n)) }));
  const one = run(base, false);
  const rev = new Map([...cloneItems(base)].reverse().map(([n, m]) => [n, new Map([...m].reverse())]));
  const two = run(rev, true);
  assert.deepEqual(two.writes, one.writes);
  assert.deepEqual(two.records, one.records);
  for (const rec of one.records) assert.equal(rec.out, rec.inSum + rec.loss, '③ 蔓延出 = Σ蔓延入 + 开放度损失');
});

test('#50 副产：来源场读数(k−1) × 份额转入同一节点的对方场（火生烟）', () => {
  const fields = new Map([['f', row({ rate8: 0n, byproducts: [['s', u(0.1)]] })], ['s', row({ rate8: 0n })]]);
  const r = stepLayer(mk({ fields, items: items(['A', 'f', 100, 0]) }));
  const by = Object.fromEntries(r.writes.map((w) => [`${w.node}/${w.field}`, w.value8]));
  assert.equal(by['A/s'], u(10));
  assert.equal(by['A/f'], undefined, '来源场自己这一步四项皆 0（副产不扣来源）：纯衰减段不写');
});

test('#54 泡内格层：天空目标整份计入开放度损失；格层 pass 取 1（⑬ 的格层部分见 env-fields 测试）', () => {
  const r = stepLayer(mk({ items: items(['x', 'f', 100, 0]), targets: () => [{ key: 'above', kind: 'sky' }, tgt('y')] }));
  assert.deepEqual(r.records, [{ node: 'x', field: 'f', out: u(20), inSum: u(10), loss: u(10) }]);
  assert.deepEqual(r.writes.map((w) => [w.node, w.value8]), [['x', u(55)], ['y', u(10)]]);
});

test('#55 ⑰ 泡边出流：目标格在泡外，一份按每格权重式记进地点背景蔓延入，不计开放度损失', () => {
  // 出 20，单一泡外目标；n_c = 2、a = 5000 m²、A = 10000 m²：(20 ÷ 2) × 0.5 = 5
  const r = stepLayer(mk({ items: items(['x', 'f', 100, 0]), targets: () => [{ key: 'z', kind: 'outside', id: 'Q', nc: 2, a: 5000, A: 10000 }] }));
  assert.equal(r.outsideIn.get('Q').get('f'), u(5));
  assert.deepEqual(r.records, [{ node: 'x', field: 'f', out: u(20), inSum: u(20), loss: 0n }]);
  assert.deepEqual(r.writes.map((w) => [w.node, w.value8]), [['x', u(55)]]);
  // 地点层接收：同一步经 extraIns 记进 Q 的蔓延入
  const q = stepLayer(mk({ items: items(['Q', 'f', 50, 0]), extraIns: r.outsideIn }));
  assert.equal(q.writes[0].value8, u(37.5) + u(5));
});

test('#55 #56 #57 每格权重式 (量 ÷ n) × (a ÷ A)：90、n 3、a 2500、A 10000 → 7.5；n 为 0 这一项为 0、不做除法（卷二十 :875、:879）', () => {
  assert.equal(foldShare(u(90), 3, 2500, 10000), u(7.5));
  assert.equal(foldShare(u(90), 0, 2500, 10000), 0n);
  // 泡边出流（:873）的 n_c 下限 1 由出流调用方取：nc 给 0 时按 1 算 (20 ÷ 1) × 0.5 = 10
  const r = stepLayer(mk({ items: items(['x', 'f', 100, 0]), targets: () => [{ key: 'z', kind: 'outside', id: 'Q', nc: 0, a: 5000, A: 10000 }] }));
  assert.equal(r.outsideIn.get('Q').get('f'), u(10));
  // 重复的目标 key：一对相接只算一个目标（卷二十 :854），拒收
  assert.throws(() => stepLayer(mk({ items: items(['x', 'f', 100, 0]), targets: () => [tgt('B'), tgt('B')] })), /E-DIM-STRUCT-FIELD/);
  // 逐步手算：10 ÷ 3 = 3；q = 1e8 × 1e8 ÷ 3e8 = 33333333；3 × 33333333 ÷ 1e8 = 0（三处都向零截断）
  assert.equal(foldShare(10n, 3, 1, 3), 0n);
});
