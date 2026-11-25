// RX 数据档单项（卷二 §2.9 第 4 条）：编译成冻结 rxTree、两档变体限制、类型规则、命名空间登记，求值走定点算术。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileRX, compileRXInScope, evaluateRX, nsArgCount } from '../../server-plugin/kernel/rx.mjs';
import { installFixedConstants } from '../../server-plugin/kernel/det-math.mjs';

// 求值走定点算术，常数照 world/rules/tables/kernel-constants.json 在测试里安装（卷二 S10；不经 loadWorld）。
installFixedConstants({ BASE: 10, SCALE: 10000, PERMILLE: 1000, BPS: 10000 });

/** @type {Map<string, any>} */
const dims = new Map([
  ['mass', { type: 'number' }],
  ['open', { type: 'boolean' }],
  ['grade', { type: 'enum', vocab: 'grade' }],
  ['owner', { type: 'ref', kind: 'gadget' }],
  ['tagset', { type: 'set', of: { type: 'ref', vocab: 'grade' } }],
  ['label', { type: 'string' }],
]);
/** @type {Map<string, any>} */
const vocabIndex = new Map([
  ['grd_a', { family: 'grade', prefix: 'grd_' }],
  ['agx_count', { family: 'aggregate', prefix: 'agx_' }],
  ['agx_exists', { family: 'aggregate', prefix: 'agx_' }],
  ['rel_part', { family: 'relation', prefix: 'rel_' }],
]);
const ns = [{ ns: 'story', shape: '<字段>', type: 'number' }, { ns: 'pop.total', shape: 'count', type: 'number' }, { ns: 'ev', shape: '<字段>，另有 tags（set，只作 member 的 set）', type: 'field' }];
const SCOPE = { dims, vocabIndex, ns, maxDepth: 16 };
const c = (text, scope = SCOPE) => compileRXInScope(text, 'data', scope);
const code = (fn) => { try { fn(); return 'ok'; } catch (e) { return e.code || e.message; } };

test('编译：中缀式编成判别联合树，冻结，收集命名空间引用', () => {
  const { tree, nsRefs } = c('mass * 2 > story.wealth + pop.total && !open');
  assert.equal(tree.op, 'and');
  assert.equal(tree.items[0].op, 'cmp');
  assert.equal(tree.items[0].cmpOp, 'gt');
  assert.deepEqual(tree.items[0].right.left, { op: 'ns', ns: 'story', arg: ['wealth'] });
  assert.deepEqual(nsRefs, ['pop.total', 'story.wealth']);
  assert.ok(Object.isFrozen(tree.items[0].left));
  assert.deepEqual(c('clock.day >= 3').tree.left, { op: 'clock', field: 'day' });
  assert.deepEqual(c('agg(agx_count, rel_part) > 0').tree.left, { op: 'agg', fn: 'agx_count', rel: 'rel_part', dim: null, filter: null });
  assert.equal(c('member(grd_a, tagset)').tree.op, 'member');
});

test('数据档不收 slot、mod、broader；显示档 P-2 未做', () => {
  assert.equal(code(() => c('mass % 2 == 0')), 'E-MOD-RX');
  assert.equal(code(() => c('broader(grade, grd_a)')), 'E-MOD-RX');
  assert.equal(code(() => compileRXInScope('1 + 1', 'display', SCOPE)), 'E-MOD-RX');
  // 两参对外接口：签名照卷二 :1222；两档在 P-2 都不经它编（数据档在加载期带作用域编）。
  assert.equal(compileRX.length, 2);
  assert.equal(code(() => compileRX('1 + 1', 'display')), 'E-MOD-RX');
  assert.equal(code(() => compileRX('1 + 1', 'data')), 'E-MOD-RX');
});

test('类型规则在编译期核：算术要数值、与或非要布尔、eq 两边同类、string 维度不能读', () => {
  assert.equal(code(() => c('mass + grade')), 'E-MOD-RX');
  assert.equal(code(() => c('mass && open')), 'E-MOD-RX');
  assert.equal(code(() => c('grade == 1')), 'E-MOD-RX');
  assert.equal(code(() => c('owner == grd_a')), 'E-MOD-RX');
  assert.equal(code(() => c('label == grd_a')), 'E-MOD-RX');
  assert.equal(code(() => c('member(grd_a, mass)')), 'E-MOD-RX');
  assert.equal(code(() => c('grade == grd_a')), 'ok');
  assert.equal(code(() => c('ev.qty > 1')), 'ok'); // 随字段：求值时核
});

test('命名空间：未登记即 E-RX-NS-UNKNOWN，段数不合即 E-MOD-RX；深度上限', () => {
  assert.equal(code(() => c('nowhere.x > 1')), 'E-RX-NS-UNKNOWN');
  assert.equal(code(() => c('story > 1')), 'E-MOD-RX');
  assert.equal(code(() => c('pop.total.extra > 1')), 'E-MOD-RX');
  assert.equal(code(() => c('1 + 1 + 1', { ...SCOPE, maxDepth: 2 })), 'E-MOD-RX');
  assert.equal(code(() => c('mass > ')), 'E-MOD-RX');
  assert.equal(code(() => c('"x" == grade')), 'E-MOD-RX');
});

test('求值：定点算术逐位确定，ns 只查读数表，缺读数即失败', () => {
  const { tree } = c('mass * 0.1 + story.wealth / 3');
  const v = evaluateRX(tree, { dim: { mass: 2.5 } }, { 'story.wealth': 1 });
  assert.equal(v, 0.5833);
  assert.equal(evaluateRX(tree, { dim: { mass: 2.5 } }, { 'story.wealth': 1 }), v);
  assert.equal(code(() => evaluateRX(tree, { dim: { mass: 2.5 } }, {})), 'E-MOD-RX');
  assert.equal(code(() => evaluateRX(c('mass / 0').tree, { dim: { mass: 1 } }, {})), 'E-MOD-RX');
  assert.equal(evaluateRX(c('grade == grd_a && !open').tree, { dim: { grade: 'grd_a', open: false } }, {}), true);
  assert.equal(evaluateRX(c('member(grd_a, tagset)').tree, { dim: { tagset: ['grd_a'] } }, {}), true);
  assert.equal(evaluateRX(c('-mass + 1').tree, { dim: { mass: 0.00009 } }, {}), 1);
  assert.equal(code(() => evaluateRX(c('ev.qty > 1').tree, {}, { 'ev.qty': 'grd_a' })), 'E-MOD-RX');
});

test('卷文数据行写法（卷四 §4.7.5 eats）：and/or/not 单词、`集 has 项`、命名空间字段作集；null 读数不收（求值失败）', () => {
  assert.deepEqual(c('mass > 1 and open').tree, c('mass > 1 && open').tree);
  assert.deepEqual(c('not open or mass < 2').tree, c('!open || mass < 2').tree);
  const has = c('ev.tags has grd_a and mass <= 0.3').tree;
  assert.equal(has.items[0].op, 'member');
  assert.deepEqual(has.items[0].set, { op: 'ns', ns: 'ev', arg: ['tags'] });
  assert.equal(evaluateRX(has, { dim: { mass: 0 } }, { 'ev.tags': ['grd_a'] }), true);
  assert.equal(evaluateRX(has, { dim: { mass: 0 } }, { 'ev.tags': [] }), false);
  assert.equal(code(() => evaluateRX(has, { dim: { mass: 0 } }, {})), 'E-MOD-RX');
  assert.equal(c('tagset has grd_a').tree.op, 'member');
  assert.equal(code(() => c('mass has grd_a')), 'E-MOD-RX');
  assert.equal(code(() => c('story.wealth has grd_a')), 'E-MOD-RX');
  // 窄规则（卷二 §2.9 第 4 条第 1 点）：只有登记为 set 型的 ns 字段可作 member 的 set，且只能作 member 的 set。
  assert.equal(code(() => c('ev.qty has grd_a')), 'E-MOD-RX'); // 反例：非 set 字段作 member 的 set
  assert.equal(code(() => c('ev.tags > 1')), 'E-MOD-RX'); // 反例：set 型 ns 字段用在 cmp
  assert.equal(code(() => c('ev.tags == grd_a')), 'E-MOD-RX');
  assert.equal(code(() => c('ev.tags + 1 > 1')), 'E-MOD-RX'); // 反例：set 型 ns 字段用在 add
  assert.equal(code(() => c('ev.tags')), 'E-MOD-RX');
  // 只有四种读数类型：null 读数不收，求值失败（显式 null 由调用方按字段定义处的含义处理，见 grades-named.test.mjs）；缺读数的失败带缺的键。
  for (const t of ['ev.kind == grd_a', 'ev.kind != grd_a', 'ev.qty >= 0.5']) assert.equal(code(() => evaluateRX(c(t).tree, {}, { 'ev.kind': null, 'ev.qty': null })), 'E-MOD-RX', t);
  assert.throws(() => evaluateRX(c('ev.kind == grd_a').tree, {}, {}), (e) => /** @type {any} */ (e).code === 'E-MOD-RX' && /** @type {any} */ (e).key === 'ev.kind');
});

test('命名空间 arg 段数由返回形状推出（五列封闭，无 argCount 列）：每个 <…> 占位一段，单值形状不带 arg', () => {
  assert.equal(nsArgCount({ shape: 'fraction' }), 0);
  assert.equal(nsArgCount({ shape: '<维度键>，另有 classes' }), 1);
  assert.equal(nsArgCount({ shape: '<字段>.<句柄>' }), 2);
  assert.equal(code(() => nsArgCount({})), 'E-RX-NS-UNKNOWN');
  const scope = { ns: [{ ns: 'lot.x', shape: 'fraction', type: 'number' }, { ns: 'mat', shape: '<维度键>', type: 'field' }], dims: new Map(), vocabIndex: new Map(), maxDepth: 16 };
  assert.equal(compileRXInScope('lot.x <= 0.3', 'data', scope).tree.left.op, 'ns');
  assert.equal(compileRXInScope('mat.fiber > 0', 'data', scope).tree.left.arg[0], 'fiber');
  assert.throws(() => compileRXInScope('lot.x.y <= 0.3', 'data', scope), { code: 'E-MOD-RX' });
  assert.throws(() => compileRXInScope('mat > 0', 'data', scope), { code: 'E-MOD-RX' });
});

// 勘误 1118k31：数据档 RX 读规则表值（加载期取成 num / handle）、map 维度的下标读（DimKey `<维>[<下标>]`，卷二 :1613）、无关系原语 known。
const KSCOPE = {
  ...SCOPE,
  dims: new Map([...dims, ['yields', { type: 'map', key: { type: 'ref', vocab: 'grade' }, value: { type: 'number', unit: 'fraction' } }]]),
  vocabIndex: new Map([...vocabIndex, ['agx_known', { family: 'aggregate', prefix: 'agx_' }]]),
  rules: { tbl: { pick: 'grd_a', min: 2.5, nested: { deep: 3 }, list: [1], text: 'not_a_code' } },
};
const kc = (text) => compileRXInScope(text, 'data', KSCOPE);

test('规则表值：数值编成 num、已登记代号编成 handle、可逐段取子键；缺表缺键、非数值非代号即 E-MOD-RX', () => {
  assert.deepEqual(kc('mass >= rules.tbl.min').tree.right, { op: 'num', value: 2.5 });
  assert.deepEqual(kc('grade == rules.tbl.pick').tree.right, { op: 'handle', value: 'grd_a' });
  assert.deepEqual(kc('mass > rules.tbl.nested.deep').tree.right, { op: 'num', value: 3 });
  for (const t of ['mass > rules.tbl.none', 'mass > rules.nope.min', 'mass > rules.tbl.list', 'grade == rules.tbl.text', 'mass > rules.tbl.nested', 'mass > rules']) assert.equal(code(() => kc(t)), 'E-MOD-RX', t);
  assert.equal(code(() => c('mass >= rules.tbl.min')), 'E-MOD-RX'); // 作用域没交规则表
  assert.equal(evaluateRX(kc('mass >= rules.tbl.min').tree, { dim: { mass: 2.5 } }, {}), true);
});

test('map 下标读：下标须编译期定成代号或数值，读值类型取 map 的值类型；缺键即缺读数', () => {
  const { tree } = kc('yields[rules.tbl.pick] * 2');
  assert.deepEqual(tree.left, { op: 'dim', key: 'yields[grd_a]' });
  assert.equal(evaluateRX(tree, { dim: { 'yields[grd_a]': 0.25 } }, {}), 0.5);
  assert.equal(kc('yields[grd_a] > 0').tree.left.key, 'yields[grd_a]');
  assert.throws(() => evaluateRX(tree, { dim: {} }, {}), (e) => /** @type {any} */ (e).code === 'E-MOD-RX' && /** @type {any} */ (e).key === 'yields[grd_a]');
  for (const t of ['yields[mass] > 0', 'mass[grd_a] > 0', 'yields[grd_a] == grd_a', 'yields[grd_a > 0']) assert.equal(code(() => kc(t)), 'E-MOD-RX', t);
});

test('known(x)：有读数为真、缺读数为假（唯一不按未知传播的原语）；aggregate 族没登记该条目、参数不是读数即 E-MOD-RX', () => {
  const { tree } = kc('!known(mass) && open');
  assert.deepEqual(tree.items[0].item, { op: 'agg', fn: 'agx_known', rel: null, dim: null, filter: null, args: [{ op: 'dim', key: 'mass' }] });
  assert.equal(evaluateRX(tree, { dim: { open: true } }, {}), true);
  assert.equal(evaluateRX(tree, { dim: { open: true, mass: 1 } }, {}), false);
  assert.equal(evaluateRX(kc('known(story.wealth)').tree, {}, { 'story.wealth': 3 }), true);
  for (const t of ['known(mass + 1)', 'known(mass, open)', 'known(2)']) assert.equal(code(() => kc(t)), 'E-MOD-RX', t);
  assert.equal(code(() => c('known(mass)')), 'E-MOD-RX'); // 族里没登 known
  assert.equal(code(() => kc('count(mass)')), 'E-MOD-RX'); // 族里没登的原语名
});
