// 块 6 第 6-5 张《状态容器最小、谓词与 terminal 第二读数》：卷二 §2.5 :510–:511（can／awake／capacity 与 terminated 两读数）、§1.11 :334–:354（状态容器、族条目三字段）；
// 卷四 §3.2 :413（判死只调 terminated）；对照表 docs/迁移体检/块6-规矩检查对照.md 第 14、15 行；6-4 遗留 S3（能力命名空间防重）、S4（meanDailyFoodNeed 按登记给未知）。
// 测试先写；期望值按卷文规则与卷四 §4.2.5 示例手算成字面量；前提在测试里造（tests/kernel/body-world.mjs 临时世界：状态行、测试族、阈值表），真实 world/ 不放这些行。
// 只跑不推进世界的小检查（本机 F 盘）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseFixture, loadBodyWorld, engineOf } from './body-world.mjs';
import { installModifierSource, resetModifierSource } from '../../server-plugin/kernel/dimensions.mjs';

const clone = (v) => JSON.parse(JSON.stringify(v));
const row = (family) => ({ family, basis: 'test' });
const fixture = () => {
  const f = baseFixture();
  f.statuses = {
    status_test_dead: row('sfam_dead'),
    status_test_sleep: row('sfam_sleep'),
    status_test_unconscious: row('sfam_unconscious'),
    status_test_plain: row('sfam_test_plain'),
  };
  f.editVocab = (doc) => { doc.families.status_family.entries.sfam_test_plain = { terminal: false, incapacitating: false, suppressesAwake: false }; };
  return f;
};
const W = loadBodyWorld(fixture());
assert.ok(W.ok, JSON.stringify(W.errors));
const { terminated, dead, can, awake, capacity } = await import('../../server-plugin/action-capacity.mjs');
const { statusView } = await import('../../server-plugin/status.mjs');
const { speciesView } = await import('../../server-plugin/species.mjs');

// 阈值表（卷二 §2.5 :510 形状）：测试自己给数，真实世界该表登在 unbuilt。
const CAP = { awakeMin: 0.5, full: { consciousness: 0.8, manipulation: 0.7, moving: 0.6 }, limited: { consciousness: 0.4, manipulation: 0.3, moving: 0.3 } };
const engineWithCap = (cap) => { const e = engineOf(W.world); return { ...e, rules: { ...e.rules, capacity: cap } }; };
const ENGINE = engineWithCap(CAP);
const REAL = engineOf(W.world); // 真实 rules.capacity：暂定值已写

// 修正项来源（同 body.test.mjs）：状态实例的档怎么变成修正项归后面的卡，这里按 (修正键, 主体) 交登记项模拟。
let registered = [];
resetModifierSource();
installModifierSource((_engine, _state, at) => registered.filter((r) => r.target === at.target && r.subject === at.id));
const withMods = (rows, fn) => { registered = rows; try { return fn(); } finally { registered = []; } };
const injury = (part, value) => ({ id: `st_${part}`, subject: 'npc_test_a', target: `body_plan.partIntegrity[${part}]`, stage: 'add', value, source: { kind: 'status', id: `st_${part}` } });
const onCap = (cap, value) => ({ id: `st_${cap}`, subject: 'npc_test_a', target: `body.${cap}`, stage: 'add', value, source: { kind: 'status', id: `st_${cap}` } });

const inst = (status, extra = {}) => ({ status, severity: 0.5, since: 3, source: null, bodyPart: null, ...extra });
const stateWith = (statuses, terminatedMarks) => ({ ...(statuses ? { statuses } : {}), ...(terminatedMarks ? { terminated: terminatedMarks } : {}) });
const MARK = { cause: 'verb_entity_terminated', source: null, mode: 'inherit', successorId: null, at: 7 };

test('statusView：实例原样读出、保持写入次序，各带状态行的族代号；没有实例即空列表', () => {
  const st = stateWith({ npc_test_a: [inst('status_test_plain', { severity: 0.25, since: 9 }), inst('status_test_sleep', { bodyPart: 'bpart_head', source: 'npc_test_b' })] });
  const v = statusView(ENGINE, st, 'npc_test_a');
  assert.deepEqual(v.instances.map((i) => [i.status, i.family]), [['status_test_plain', 'sfam_test_plain'], ['status_test_sleep', 'sfam_sleep']]);
  assert.deepEqual([v.instances[0].severity, v.instances[0].since, v.instances[0].source, v.instances[0].bodyPart], [0.25, 9, null, null]);
  assert.deepEqual([v.instances[1].source, v.instances[1].bodyPart], ['npc_test_b', 'bpart_head']);
  assert.deepEqual(statusView(ENGINE, stateWith({ npc_test_a: [] }), 'npc_test_a').instances, []);
  assert.deepEqual(statusView(ENGINE, {}, 'npc_test_b').instances, []);
  // 别的主体的实例不串。
  assert.deepEqual(statusView(ENGINE, st, 'npc_test_b').instances, []);
});

test('statusView：实例指向的状态行不存在即抛（不静默当作没有族）', () => {
  assert.throws(() => statusView(ENGINE, stateWith({ npc_test_a: [inst('status_test_ghost')] }), 'npc_test_a'), (e) => typeof e.code === 'string');
});

test('terminated（对照表第 15 行）：仅有终止标记 → 真，reason 是终止原因 verb 代号', () => {
  assert.deepEqual(terminated(ENGINE, stateWith(null, { npc_test_a: MARK }), 'npc_test_a'), { ok: true, reason: 'verb_entity_terminated' });
});

test('terminated：仅有 terminal 状态实例（终止标记尚未写入）→ 真，reason 是该状态代号；dead 是同一个函数', () => {
  const st = stateWith({ npc_test_a: [inst('status_test_plain'), inst('status_test_dead')] });
  assert.deepEqual(terminated(ENGINE, st, 'npc_test_a'), { ok: true, reason: 'status_test_dead' });
  assert.equal(dead, terminated);
});

test('terminated：两者皆无 → 假；有状态实例但族不带 terminal（睡眠、无族效果、昏迷）→ 假；空实例列表、别人的标记 → 假', () => {
  const none = { ok: false, reason: null };
  assert.deepEqual(terminated(ENGINE, {}, 'npc_test_a'), none);
  assert.deepEqual(terminated(ENGINE, stateWith({ npc_test_a: [] }), 'npc_test_a'), none);
  assert.deepEqual(terminated(ENGINE, stateWith({ npc_test_a: [inst('status_test_sleep'), inst('status_test_unconscious'), inst('status_test_plain')] }), 'npc_test_a'), none);
  assert.deepEqual(terminated(ENGINE, stateWith({ npc_test_b: [inst('status_test_dead')] }, { npc_test_b: MARK }), 'npc_test_a'), none);
});

test('terminated：标记与 terminal 实例同时在，以终止标记为准（先读标记）', () => {
  const st = stateWith({ npc_test_a: [inst('status_test_dead')] }, { npc_test_a: MARK });
  assert.deepEqual(terminated(ENGINE, st, 'npc_test_a'), { ok: true, reason: 'verb_entity_terminated' });
});

test('can：完好者能用 consciousness、moving；无定形体没有呼吸部位，breathing 的 body 值为确知的 0 → 不能（reason 是能力代号）', () => {
  assert.deepEqual(can(ENGINE, {}, 'npc_test_a', 'cap_moving'), { ok: true, known: true, reason: null });
  assert.deepEqual(can(ENGINE, {}, 'npc_test_b', 'cap_breathing'), { ok: false, known: true, reason: 'cap_breathing' });
  assert.equal(can(ENGINE, {}, 'npc_test_b', 'cap_moving').ok, true);
});

test('can：丧失双腿 moving = 1 − 0.5 − 0.5 = 0 → 不能；丧失一条腿 moving = 0.5 > 0 → 能', () => {
  assert.equal(withMods([injury('bpart_leg_l', -1), injury('bpart_leg_r', -1)], () => can(ENGINE, {}, 'npc_test_a', 'cap_moving')).ok, false);
  assert.equal(withMods([injury('bpart_leg_l', -1)], () => can(ENGINE, {}, 'npc_test_a', 'cap_moving')).ok, true);
});

test('can：有 incapacitating 族实例即不能，reason 是该实例状态代号，对任何能力一样；睡眠（只压清醒）不挡 can', () => {
  const st = stateWith({ npc_test_a: [inst('status_test_plain'), inst('status_test_unconscious')] });
  assert.deepEqual(can(ENGINE, st, 'npc_test_a', 'cap_moving'), { ok: false, known: true, reason: 'status_test_unconscious' });
  assert.deepEqual(can(ENGINE, st, 'npc_test_a', 'cap_manipulation'), { ok: false, known: true, reason: 'status_test_unconscious' });
  assert.equal(can(ENGINE, stateWith({ npc_test_a: [inst('status_test_sleep')] }), 'npc_test_a', 'cap_moving').ok, true);
});

test('can：不是 capability 族条目的代号即抛（不当作"不能"）', () => {
  assert.throws(() => can(ENGINE, {}, 'npc_test_a', 'bpart_head'), (e) => typeof e.code === 'string');
  assert.throws(() => can(ENGINE, {}, 'npc_test_a', 'cap_no_such'), (e) => typeof e.code === 'string');
});

test('awake：consciousness ≥ awakeMin（取等算醒）；差 0.1 即不醒；reason 是能力键', () => {
  assert.deepEqual(awake(ENGINE, {}, 'npc_test_a'), { ok: true, known: true, reason: null });
  // consciousness = 1 + (−0.5) = 0.5：恰等于 awakeMin 0.5 → 醒
  assert.equal(withMods([onCap('consciousness', -0.5)], () => awake(ENGINE, {}, 'npc_test_a')).ok, true);
  // 1 − 0.6 = 0.4 < 0.5 → 不醒
  assert.deepEqual(withMods([onCap('consciousness', -0.6)], () => awake(ENGINE, {}, 'npc_test_a')), { ok: false, known: true, reason: 'consciousness' });
});

test('awake：有 suppressesAwake 族实例即不醒（睡眠、昏迷），reason 是该实例状态代号；无族效果的实例不挡', () => {
  assert.deepEqual(awake(ENGINE, stateWith({ npc_test_a: [inst('status_test_sleep')] }), 'npc_test_a'), { ok: false, known: true, reason: 'status_test_sleep' });
  assert.deepEqual(awake(ENGINE, stateWith({ npc_test_a: [inst('status_test_plain'), inst('status_test_unconscious')] }), 'npc_test_a'), { ok: false, known: true, reason: 'status_test_unconscious' });
  assert.equal(awake(ENGINE, stateWith({ npc_test_a: [inst('status_test_plain')] }), 'npc_test_a').ok, true);
});

test('capacity：三项都过 full → full；过 limited 不过 full → limited；否则 none；取等算过', () => {
  assert.deepEqual(capacity(ENGINE, {}, 'npc_test_a'), { level: 'full', known: true, reason: null });
  // 丧失一条腿：moving = 1 − 0.5 = 0.5，full 要 0.6 不过、limited 要 0.3 过 → limited
  assert.equal(withMods([injury('bpart_leg_l', -1)], () => capacity(ENGINE, {}, 'npc_test_a')).level, 'limited');
  // 丧失双腿：moving = 0 < 0.3 → none
  assert.equal(withMods([injury('bpart_leg_l', -1), injury('bpart_leg_r', -1)], () => capacity(ENGINE, {}, 'npc_test_a')).level, 'none');
  // 丧失左手：manipulation = 1 − 0.3 = 0.7，恰等于 full.manipulation 0.7 → 仍 full
  assert.equal(withMods([injury('bpart_hand_l', -1)], () => capacity(ENGINE, {}, 'npc_test_a')).level, 'full');
  // 丧失左臂（传到手）：manipulation = 1 − 0.2 − 0.3 = 0.5 < 0.7、≥ 0.3 → limited
  assert.equal(withMods([injury('bpart_arm_l', -1)], () => capacity(ENGINE, {}, 'npc_test_a')).level, 'limited');
});

test('真实世界的暂定阈值（awakeMin 1/2、full 2/3、limited 1/3，李白 11-19 18:1x ①）：awake、capacity 不再按未知交出；期望值按量程等分点手算', () => {
  assert.deepEqual(awake(REAL, {}, 'npc_test_a'), { ok: true, known: true, reason: null });
  assert.deepEqual(capacity(REAL, {}, 'npc_test_a'), { level: 'full', known: true, reason: null });
  // consciousness 1 − 0.6 = 0.4 < 0.5 不醒；1 − 0.5 = 0.5 取等醒。
  assert.equal(withMods([onCap('consciousness', -0.6)], () => awake(REAL, {}, 'npc_test_a')).ok, false);
  assert.equal(withMods([onCap('consciousness', -0.5)], () => awake(REAL, {}, 'npc_test_a')).ok, true);
  // 丧失一腿 moving 0.5：< 2/3 且 ≥ 1/3 → limited；双腿 0 → none。
  assert.equal(withMods([injury('bpart_leg_l', -1)], () => capacity(REAL, {}, 'npc_test_a')).level, 'limited');
  assert.equal(withMods([injury('bpart_leg_l', -1), injury('bpart_leg_r', -1)], () => capacity(REAL, {}, 'npc_test_a')).level, 'none');
  assert.equal(can(REAL, {}, 'npc_test_a', 'cap_moving').ok, true);
  assert.equal(terminated(REAL, stateWith(null, { npc_test_a: MARK }), 'npc_test_a').ok, true);
  // 状态实例的挡板在读阈值之前判。
  assert.deepEqual(awake(REAL, stateWith({ npc_test_a: [inst('status_test_sleep')] }), 'npc_test_a'), { ok: false, known: true, reason: 'status_test_sleep' });
});

test('阈值表既没给值也没登记 unbuilt 即抛（不静默当作未知）；full 只登一半时 capacity 仍按未知', () => {
  const noTable = { ...REAL, rules: { ...REAL.rules, capacity: { unbuilt: [] } } };
  assert.throws(() => awake(noTable, {}, 'npc_test_a'), (e) => typeof e.code === 'string');
  assert.throws(() => capacity(noTable, {}, 'npc_test_a'), (e) => typeof e.code === 'string');
  const half = engineWithCap({ ...CAP, unbuilt: ['limited'], limited: undefined });
  assert.deepEqual(capacity(half, {}, 'npc_test_a'), { level: null, known: false, reason: 'unbuilt' });
});

test('能力值读不出（部位完好度阈值未建 → eff 未知）：awake、can 按未知，原因 unknown_value；capacity 同', () => {
  const f = fixture();
  f.lostBelow = null;
  const w = loadBodyWorld(f);
  assert.ok(w.ok, JSON.stringify(w.errors));
  const e = { ...engineOf(w.world), rules: { ...w.world.rules, capacity: CAP } };
  assert.deepEqual(awake(e, {}, 'npc_test_a'), { ok: false, known: false, reason: 'unknown_value' });
  assert.deepEqual(can(e, {}, 'npc_test_a', 'cap_moving'), { ok: false, known: false, reason: 'unknown_value' });
  assert.deepEqual(capacity(e, {}, 'npc_test_a'), { level: null, known: false, reason: 'unknown_value' });
});

test('6-4 遗留 S4：meanDailyFoodNeed 按 rules.body.unbuilt 登记给未知并带原因；没登记即抛（不静默给未知）', () => {
  const v = speciesView(REAL, {}, 'species_test_a');
  assert.deepEqual(v.meanDailyFoodNeed, { known: false, applicable: true, reason: 'body.unbuilt' });
  const f = fixture();
  f.bodyUnbuilt = [];
  const w = loadBodyWorld(f);
  assert.ok(w.ok, JSON.stringify(w.errors));
  assert.throws(() => speciesView(engineOf(w.world), {}, 'species_test_a'), (e) => e.code === 'E-DIM-UNKNOWN-READ');
});

test('6-4 遗留 S3：第二张表头也带 capabilities 段 → 加载期 E-DIM-DUPLICATE-KEY（命名空间 body 不被静默覆盖）', () => {
  const f = fixture();
  f.editSpeciesDoc = (doc) => { doc.capabilities = clone({ breathing: { type: 'number', unit: 'fraction', domain: [0, 1], precision: 3, modifiable: true, stacking: 'none', bounds: [0, 1], required: 'never', onUnknown: 'gap', source: 'test', owner: 'test' } }); };
  const r = loadBodyWorld(f);
  assert.ok(r.errors.some(([c]) => c === 'E-DIM-DUPLICATE-KEY'), JSON.stringify(r.errors));
});
