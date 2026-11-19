// 块 6 第 6-4 张《物种与身体图表》：bodyView 是 body.* 的唯一出处，五项来源顺序固定（卷四 §4.11.3 C-1 :1020–:1030）；
// 部位完好度、丧失与传播、部位折算、能力依赖（§4.2.3 B-1 至 B-9 :534–:544）；身体图不变量与能力族校验（§2.2 :190–:202、§2.4 :283、§2.7 :360–:367）。
// 对照表 docs/迁移体检/块6-规矩检查对照.md 第 13 行。测试先写；期望值按卷文公式手算成字面量（部位大小与贡献取卷四 §4.2.5 人形示例，只在测试夹具里）。
// 只跑不推进世界的小检查（本机 F 盘）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { baseFixture, loadBodyWorld, engineOf, speciesRow, ROOT } from './body-world.mjs';
import { installModifierSource, resetModifierSource } from '../../server-plugin/kernel/dimensions.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { resolveRuleSi } from '../../server-plugin/kernel/load/vocab-load.mjs';

const clone = (v) => JSON.parse(JSON.stringify(v));
const W = loadBodyWorld(baseFixture());
assert.ok(W.ok, JSON.stringify(W.errors));
const ENGINE = engineOf(W.world);
const { bodyView } = await import('../../server-plugin/body.mjs');

// 修正项来源（卷二 §3.2；状态实例的档由 6-5 接入）：测试按 (修正键, 主体) 交登记项，模拟挂部位状态实例与整体状态的修正。
let registered = [];
resetModifierSource();
installModifierSource((_engine, _state, at) => registered.filter((r) => r.target === at.target && r.subject === at.id));
const view = (subject, rows = []) => { registered = rows; try { return bodyView(ENGINE, {}, subject); } finally { registered = []; } };
const injury = (part, value, id = `st_${part}`) => ({ id, subject: 'npc_test_a', target: `body_plan.partIntegrity[${part}]`, stage: 'add', value, source: { kind: 'status', id } });
const onCap = (cap, stage, value, id) => ({ id, subject: 'npc_test_a', target: `body.${cap}`, stage, value, source: { kind: 'status', id } });

test('完好人形：每个能力 = 结构基值（B-1），condition = 1；撤销全部修正后 v_c = base_c', () => {
  const v = view('npc_test_a');
  for (const c of ['consciousness', 'breathing', 'manipulation', 'moving']) {
    assert.equal(v.dims[c].known, true);
    assert.equal(v.dims[c].base, 1);
    assert.equal(v.dims[c].value, 1);
  }
  assert.equal(v.dims.smell.base, 0);
  assert.equal(v.dims.smell.value, 0);
  assert.equal(v.condition, 1);
});

test('左手丧失：manipulation = 1 − 0.3 × (1 − 0) = 0.7；左手 eff = 0（卷四 §4.2.5 求值示例）', () => {
  const v = view('npc_test_a', [injury('bpart_hand_l', -1)]);
  assert.equal(v.dims.manipulation.value, 0.7);
  assert.equal(v.dims.manipulation.base, 1);
  assert.equal(v.parts.find((p) => p.id === 'bpart_hand_l').eff, 0);
  // condition = Σ 大小 × eff = 1 − 0.01
  assert.equal(v.condition, 0.99);
});

test('两手都丧失：两条折算项来源不同、扣减相加，manipulation = 1 − 0.3 − 0.3 = 0.4（B-4）', () => {
  const v = view('npc_test_a', [injury('bpart_hand_l', -1), injury('bpart_hand_r', -1)]);
  assert.equal(v.dims.manipulation.value, 0.4);
  const handRows = v.dims.manipulation.steps.filter((s) => s.value === -0.3);
  assert.deepEqual(handRows.map((s) => s.source.id), [['body_test_humanoid', 'bpart_hand_l'], ['body_test_humanoid', 'bpart_hand_r']]);
});

test('两部位同时受损的扣减 = 各自单独受损扣减之和（§4.2.6 不变量）', () => {
  const both = 1 - view('npc_test_a', [injury('bpart_arm_l', -0.5), injury('bpart_hand_r', -1)]).dims.manipulation.value;
  const a = 1 - view('npc_test_a', [injury('bpart_arm_l', -0.5)]).dims.manipulation.value;
  const b = 1 - view('npc_test_a', [injury('bpart_hand_r', -1)]).dims.manipulation.value;
  // 0.1 + 0.3 = 0.4：手算 −0.2 × (1 − 0.5) 与 −0.3 × (1 − 0)
  assert.equal(Math.round(both * 1e4), Math.round((a + b) * 1e4));
  assert.equal(Math.round(both * 1e4), 4000);
});

test('左臂丧失传到左手：eff(臂) = eff(手) = 0，manipulation = 1 − 0.2 − 0.3 = 0.5（B-3）', () => {
  const v = view('npc_test_a', [injury('bpart_arm_l', -1)]);
  assert.equal(v.parts.find((p) => p.id === 'bpart_arm_l').eff, 0);
  assert.equal(v.parts.find((p) => p.id === 'bpart_hand_l').eff, 0);
  assert.equal(v.dims.manipulation.value, 0.5);
  assert.equal(v.condition, 0.94);
});

test('上游部分损伤不向下传播：左臂完好度 0.5 > 阈值，手 eff 仍 1，manipulation = 1 − 0.2 × 0.5 = 0.9（B-3）', () => {
  const v = view('npc_test_a', [injury('bpart_arm_l', -0.5)]);
  assert.equal(v.parts.find((p) => p.id === 'bpart_arm_l').eff, 0.5);
  assert.equal(v.parts.find((p) => p.id === 'bpart_hand_l').eff, 1);
  assert.equal(v.dims.manipulation.value, 0.9);
});

test('完好度恰等于阈值 lostBelow（0.1）即丧失；高出一个最小单位不丧失（B-3 "≤"）', () => {
  const at = view('npc_test_a', [injury('bpart_hand_l', -0.9)]);
  assert.equal(at.parts.find((p) => p.id === 'bpart_hand_l').eff, 0);
  assert.equal(at.dims.manipulation.value, 0.7);
  const above = view('npc_test_a', [injury('bpart_hand_l', -0.8999)]);
  assert.equal(above.parts.find((p) => p.id === 'bpart_hand_l').eff, 0.1001);
});

test('五项来源顺序：依赖项读限制者的最终值（含登记修正），登记项与合成项同入管线：consciousness = (1 − 0.25) × (1 − 0.5 × (1 − 0.6)) = 0.6', () => {
  const v = view('npc_test_a', [onCap('breathing', 'add', -0.4, 'st_smoke'), onCap('consciousness', 'add', -0.25, 'st_pain')]);
  assert.equal(v.dims.breathing.value, 0.6);
  const c = v.dims.consciousness;
  assert.equal(c.base, 1); // ① 结构基值
  assert.equal(c.value, 0.6); // ⑤ 管线结果
  // 管线逐段：add 段（② 部位折算 0、④ 登记 −0.25）在 mul 段（③ 依赖 −0.2）之前；每段来源可逐条复算。
  assert.deepEqual(c.steps.map((s) => [s.stage, s.value]), [['add', -0.25], ['add', 0], ['mul', -0.2]]);
  assert.deepEqual(c.chain, ['st_pain', ['body_test_humanoid', 'bpart_head'], ['cap_consciousness', 'cap_breathing']]);
  assert.equal(c.steps[c.steps.length - 1].after, c.value);
});

test('管线钳位到 [0,1]（⑤ B-7）：扣过头取 0，加过头取 1；0 是确知的 0', () => {
  const low = view('npc_test_a', [onCap('moving', 'add', -2, 'st_x')]);
  assert.deepEqual([low.dims.moving.known, low.dims.moving.value], [true, 0]);
  const high = view('npc_test_a', [onCap('moving', 'add', 0.5, 'st_y')]);
  assert.equal(high.dims.moving.value, 1);
});

test('身体图上没有的能力不构成限制（B-5 只对 base_k > 0）：无定形体无呼吸，consciousness 不受 breathing 限制仍为 1；breathing 是确知的 0（C-2）', () => {
  const v = view('npc_test_b');
  assert.deepEqual([v.dims.breathing.known, v.dims.breathing.base, v.dims.breathing.value], [true, 0, 0]);
  assert.equal(v.dims.consciousness.value, 1);
  assert.equal(v.dims.consciousness.steps.some((s) => s.stage === 'mul'), false);
});

test('有效身体图（B-9）：个体 bodyPlanOverride 非空即取它', () => {
  const v = view('npc_test_c');
  assert.equal(v.bodyPlan, 'body_test_blob');
  assert.equal(v.dims.breathing.base, 0);
});

test('部位质量 = 主体 massKg × sizeFraction；组织材料按 tissueDelta → tissueOverride → 物种 tissues 取第一个有值者（B-9）', () => {
  const v = view('npc_test_a');
  const head = v.parts.find((p) => p.id === 'bpart_head');
  const torso = v.parts.find((p) => p.id === 'bpart_torso');
  const hand = v.parts.find((p) => p.id === 'bpart_hand_l');
  assert.equal(hand.massKg.value, 0.6); // 60 × 0.01
  assert.equal(torso.massKg.value, 27.6); // 60 × 0.46
  const fx = baseFixture();
  assert.equal(head.tissues.tissue_bone.value, fx.persons.npc_test_a.tissueDelta.bpart_head.tissue_bone); // 个体偏离
  assert.equal(torso.tissues.tissue_flesh.value, fx.plans.body_test_humanoid.parts[0].tissueOverride.tissue_flesh); // 部位覆盖
  assert.equal(hand.tissues.tissue_flesh.value, fx.species.species_test_a.tissues.tissue_flesh); // 物种组织
  // 主体体重未知（npc_test_b 没写）即部位质量未知，不以常数代替。
  assert.equal(view('npc_test_b').parts[0].massKg.known, false);
});

test('规则表 rules.body.integrity.lostBelow 登在 unbuilt：丧失判不了，有部位贡献的能力与 eff、condition 都是未知；没有部位贡献的能力仍是确知的 0（C-2）', () => {
  const f = baseFixture();
  f.lostBelow = null;
  const r = loadBodyWorld(f);
  assert.ok(r.ok, JSON.stringify(r.errors));
  const v = bodyView(engineOf(r.world), {}, 'npc_test_a');
  assert.equal(v.dims.manipulation.known, false);
  assert.deepEqual([v.dims.smell.known, v.dims.smell.value], [true, 0]);
  assert.equal(v.parts[0].eff, null);
  assert.equal(v.condition, null);
});

test('body.mjs 只导出读入口，不导出任何谓词（卷四 §3.2；can/awake/capacity 只在 action-capacity.mjs，卷二 §2.5）', async () => {
  const body = await import('../../server-plugin/body.mjs');
  const species = await import('../../server-plugin/species.mjs');
  assert.deepEqual(Object.keys(body).sort(), ['bodyView', 'capabilityBaseline']);
  assert.deepEqual(Object.keys(species).sort(), ['speciesView']);
});

// ---------- 加载期校验（§2.2 不变量、§2.4 条目字段、§2.7） ----------

const loadErr = (edit) => { const f = baseFixture(); edit(f); return loadBodyWorld(f); };
const has = (r, code, row) => r.errors.some(([c, , rw]) => c === code && (row === undefined || rw === row));
const humanoid = (f) => f.plans.body_test_humanoid;

test('真实 world/ 原样加载通过（物种、身体图表头与本卷词表族）', () => {
  const r = loadWorld(ROOT);
  assert.equal(r.ok, true, r.text);
});

test('身体图两个根 / 没有根（空部位表）即 E-BODY-PLAN-SHAPE', () => {
  assert.ok(has(loadErr((f) => { humanoid(f).parts[1].parent = null; }), 'E-BODY-PLAN-SHAPE', 'body_test_humanoid'));
  assert.ok(has(loadErr((f) => { humanoid(f).parts = []; }), 'E-BODY-PLAN-SHAPE', 'body_test_humanoid'));
});

test('部位父链成环 / 父部位不在本图即 E-BODY-PLAN-SHAPE', () => {
  assert.ok(has(loadErr((f) => { const p = humanoid(f).parts; p[0].parent = 'bpart_head'; }), 'E-BODY-PLAN-SHAPE'));
  assert.ok(has(loadErr((f) => { humanoid(f).parts[3].parent = 'bpart_mass'; }), 'E-BODY-PLAN-SHAPE'));
});

test('链深上限 8：8 层通过，9 层即 E-BODY-PLAN-SHAPE', () => {
  const chain = (n) => (f) => {
    const ids = Array.from({ length: n }, (_, i) => `bpart_seg${i}`);
    f.vocab.body_part.push(...ids);
    f.plans.body_test_chain = { tissueFractions: { tissue_flesh: 0.6, tissue_bone: 0.4 }, basis: 'test',
      parts: ids.map((id, i) => ({ id, parent: i ? ids[i - 1] : null, sizeFraction: i ? 0 : 1, contributes: {}, vital: i === 0 })) };
  };
  assert.equal(has(loadErr(chain(8)), 'E-BODY-PLAN-SHAPE', 'body_test_chain'), false);
  assert.ok(has(loadErr(chain(9)), 'E-BODY-PLAN-SHAPE', 'body_test_chain'));
});

test('sizeFraction 之和 ≠ 1、某能力贡献和不是 0 也不是 1、没有致命部位、同 id 重复即 E-BODY-PLAN-SHAPE', () => {
  assert.ok(has(loadErr((f) => { humanoid(f).parts[0].sizeFraction = 0.45; }), 'E-BODY-PLAN-SHAPE'));
  assert.ok(has(loadErr((f) => { humanoid(f).parts[3].contributes = { cap_manipulation: 0.2 }; }), 'E-BODY-PLAN-SHAPE'));
  assert.ok(has(loadErr((f) => { for (const p of humanoid(f).parts) p.vital = false; }), 'E-BODY-PLAN-SHAPE'));
  assert.ok(has(loadErr((f) => { humanoid(f).parts[7].id = 'bpart_leg_l'; }), 'E-BODY-PLAN-SHAPE'));
});

test('能力贡献和为 0（整张图都不贡献该能力）合法', () => {
  const r = loadErr((f) => { humanoid(f).parts[0].contributes = {}; });
  assert.equal(has(r, 'E-BODY-PLAN-SHAPE'), false);
});

test('tissueOverride 的键不在 tissueFractions 内即 E-BODY-PLAN-SHAPE；tissueFractions 和 ≠ 1 即 E-DIM-DOMAIN-RANGE', () => {
  // 躯干覆盖了 tissue_flesh；把 tissue_flesh 从组织份额里拿掉（写 null），覆盖键就落到份额之外。
  assert.ok(has(loadErr((f) => { humanoid(f).tissueFractions = { tissue_flesh: null, tissue_bone: 1 }; }), 'E-BODY-PLAN-SHAPE', 'body_test_humanoid'));
  assert.ok(has(loadErr((f) => { humanoid(f).tissueFractions = { tissue_flesh: 0.6, tissue_bone: 0.3 }; }), 'E-DIM-DOMAIN-RANGE', 'body_test_humanoid'));
});

test('物种 tissues 键集 ≠ 身体图 tissueFractions 键集即 E-BODY-TISSUE-KEYS（含两边各写 null 的情形）', () => {
  assert.ok(has(loadErr((f) => { f.species.species_test_a.tissues = { tissue_flesh: f.species.species_test_a.tissues.tissue_flesh, tissue_bone: null }; }), 'E-BODY-TISSUE-KEYS', 'species_test_a'));
  assert.equal(has(loadBodyWorld(baseFixture()), 'E-BODY-TISSUE-KEYS'), false);
});

test('capability 条目 limitedBy 成环即 E-BODY-CAP-CYCLE；自限即成环', () => {
  assert.ok(has(loadErr((f) => { f.capabilities.cap_breathing.limitedBy = { cap_consciousness: 0.5 }; }), 'E-BODY-CAP-CYCLE'));
  assert.ok(has(loadErr((f) => { f.capabilities.cap_moving.limitedBy = { cap_moving: 0.5 }; }), 'E-BODY-CAP-CYCLE'));
});

test('capability 条目：limitedBy 为 null、权重 > 1 或键不是能力，dimKey 缺或重复，都拒（§2.4）；显式空映射合法；limitedBy 缺只在登为未建条目字段时放行', () => {
  assert.ok(has(loadErr((f) => { f.capabilities.cap_moving.limitedBy = null; }), 'E-DIM-STRUCT-FIELD', 'cap_moving'));
  const unreg = loadErr((f) => { delete f.capabilities.cap_moving.limitedBy; f.editUnbuilt = (doc) => { doc.fields = doc.fields.filter((x) => x.family !== 'capability'); }; });
  assert.ok(has(unreg, 'E-DIM-STRUCT-FIELD', 'cap_moving'), JSON.stringify(unreg.errors));
  assert.ok(has(loadErr((f) => { f.capabilities.cap_moving.limitedBy = { cap_breathing: 1.5 }; }), 'E-DIM-STRUCT-FIELD', 'cap_moving'));
  assert.ok(has(loadErr((f) => { f.capabilities.cap_moving.limitedBy = { bpart_head: 0.5 }; }), 'E-DIM-STRUCT-FIELD', 'cap_moving'));
  assert.ok(has(loadErr((f) => { f.capabilities.cap_moving = { limitedBy: {} }; }), 'E-DIM-STRUCT-FIELD', 'cap_moving'));
  assert.ok(has(loadErr((f) => { f.capabilities.cap_moving.dimKey = 'breathing'; }), 'E-DIM-DUPLICATE-KEY'));
  assert.equal(loadBodyWorld(baseFixture()).ok, true);
});

test('表头 capabilities 段键集 ≠ capability 族全部 dimKey 即 E-DIM-STRUCT-FIELD（新增能力 = 加族条目与表头一项）', () => {
  assert.equal(loadErr((f) => { f.capabilities.cap_flying = { dimKey: 'flying', limitedBy: {} }; }).ok, true);
  const missing = loadErr((f) => { f.editPlanDoc = (doc) => { delete doc.capabilities.moving; }; });
  assert.ok(missing.errors.some(([c, t, , d]) => c === 'E-DIM-STRUCT-FIELD' && t === 'body_plan' && d === 'capabilities'), JSON.stringify(missing.errors));
  const extra = loadErr((f) => { f.editPlanDoc = (doc) => { doc.capabilities.wingBeat = clone(doc.capabilities.moving); }; });
  assert.ok(extra.errors.some(([c, t, , d]) => c === 'E-DIM-STRUCT-FIELD' && t === 'body_plan' && d === 'capabilities'), JSON.stringify(extra.errors));
});

test('本卷词表族条目字段（列定义，§2.4）：写了的字段为 null 或类型不合即 E-DIM-STRUCT-FIELD；没登未建的字段缺了也报', () => {
  assert.ok(has(loadErr((f) => { f.vocab.attr.attr_test.heritability = null; }), 'E-DIM-STRUCT-FIELD', 'attr_test'));
  assert.ok(has(loadErr((f) => { f.vocab.attr.attr_test.heritability = 1.5; }), 'E-DIM-STRUCT-FIELD', 'attr_test'));
  assert.ok(has(loadErr((f) => { f.vocab.tissue.tissue_bone.reserve = null; }), 'E-DIM-STRUCT-FIELD', 'tissue_bone'));
  assert.ok(has(loadErr((f) => { delete f.vocab.tissue.tissue_bone.depthOrder; }), 'E-DIM-STRUCT-FIELD', 'tissue_bone')); // tissue 字段没登未建
  assert.ok(has(loadErr((f) => { f.vocab.sex.sex_test = { bears: 'yes' }; }), 'E-DIM-STRUCT-FIELD', 'sex_test'));
  assert.ok(has(loadErr((f) => { f.vocab.gait.gait_test.drivenBy = 'bpart_head'; }), 'E-DIM-STRUCT-FIELD', 'gait_test'));
  assert.ok(has(loadErr((f) => { f.vocab.life_stage.lstage_test = { adult: true, fertile: 3 }; }), 'E-DIM-STRUCT-FIELD', 'lstage_test'));
  assert.ok(has(loadErr((f) => { f.vocab.trait.trait_test = { heritability: 0.8, residualFactor: 0.8246, visible: true, bands: 0 }; }), 'E-DIM-STRUCT-FIELD', 'trait_test'));
  assert.equal(has(loadErr((f) => { f.vocab.trait.trait_test = { heritability: 0.8, residualFactor: 0.8246, visible: true, bands: 5 }; f.vocab.life_stage.lstage_test = { adult: true, fertile: false }; }), 'E-DIM-STRUCT-FIELD'), false);
});

test('夹具物种行另换身体图只是改 bodyPlan 引用（扩展性：新增身体图不改 .mjs）', () => {
  const f = baseFixture();
  f.capabilities.cap_flying = { dimKey: 'flying', limitedBy: {} };
  f.vocab.body_part.push('bpart_wing_l', 'bpart_wing_r');
  f.plans.body_test_avian = clone(f.plans.body_test_humanoid);
  f.plans.body_test_avian.parts[6].sizeFraction = 0.05; // 腿让出 0.24 给两翼
  f.plans.body_test_avian.parts[7].sizeFraction = 0.05;
  f.plans.body_test_avian.parts.push({ id: 'bpart_wing_l', parent: 'bpart_torso', sizeFraction: 0.12, contributes: { cap_flying: 0.5 }, vital: false },
    { id: 'bpart_wing_r', parent: 'bpart_torso', sizeFraction: 0.12, contributes: { cap_flying: 0.5 }, vital: false });
  f.species.species_test_bird = speciesRow('body_test_avian');
  f.persons.npc_test_bird = { species: 'species_test_bird', basis: 'test' };
  const r = loadBodyWorld(f);
  assert.ok(r.ok, JSON.stringify(r.errors));
  registered = [{ id: 'st_wing', subject: 'npc_test_bird', target: 'body_plan.partIntegrity[bpart_wing_l]', stage: 'add', value: -1, source: { kind: 'status', id: 'st_wing' } }];
  try {
    const v = bodyView(engineOf(r.world), {}, 'npc_test_bird');
    assert.equal(v.dims.flying.value, 0.5); // 折一翼：1 − 0.5
    assert.equal(v.dims.moving.value, 1); // 只损飞行不损行走
  } finally { registered = []; }
});

test('身体图表头的 capabilities 段与 instanceDimensions 走同一套表头校验：缺 stacking 即 E-MOD-STACKING，缺 bounds 即 E-MOD-BOUNDS，单位不登记即 E-DIM-UNIT-UNKNOWN', () => {
  const real = JSON.parse(readFileSync(join(ROOT, 'world/ontology/dimensions/body_plan.json'), 'utf8'));
  assert.equal(real.capabilities.smell.modifiable, true);
  const stacking = loadErr((f) => { f.editPlanDoc = (doc) => { delete doc.capabilities.smell.stacking; }; });
  assert.ok(stacking.errors.some(([c, t, , d]) => c === 'E-MOD-STACKING' && t === 'body_plan' && d === 'smell'), JSON.stringify(stacking.errors));
  const bounds = loadErr((f) => { f.editPlanDoc = (doc) => { delete doc.instanceDimensions.partIntegrity.bounds; }; });
  assert.ok(bounds.errors.some(([c, t, , d]) => c === 'E-MOD-BOUNDS' && t === 'body_plan' && d === 'partIntegrity'), JSON.stringify(bounds.errors));
  const unit = loadErr((f) => { f.editPlanDoc = (doc) => { doc.capabilities.touch.unit = 'no_such_unit'; }; });
  assert.ok(unit.errors.some(([c, t, , d]) => c === 'E-DIM-UNIT-UNKNOWN' && t === 'body_plan' && d === 'touch'), JSON.stringify(unit.errors));
});

// ---------- 未建条目字段（_unbuilt-derived.json fields）与未建词表族（families） ----------

test('limitedBy 登为未建条目字段：条目缺它加载放行，该能力读数按未知（卷二 §1.6）；族里每条都已写时再登即报应删', () => {
  const reg = { family: 'capability', field: 'limitedBy', missing: ['data'], card: 'pre_first_reader_card' };
  const r = loadErr((f) => { delete f.capabilities.cap_moving.limitedBy; f.editUnbuilt = (doc) => { doc.fields.push(reg); }; });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const v = bodyView(engineOf(r.world), {}, 'npc_test_a');
  assert.equal(v.dims.moving.known, false);
  assert.equal(v.dims.smell.known, true);
  // 真实 capability 族每条都写了 limitedBy（李白 11-19 15:5x ②）：再登这一字段即"应删"。
  const all = loadErr((f) => { f.editUnbuilt = (doc) => { doc.fields.push(reg); }; });
  assert.ok(all.errors.some(([c, t]) => c === 'E-DIM-STRUCT-FIELD' && t === '_unbuilt-derived'), JSON.stringify(all.errors));
});

test('year、per_year 的 si 由 rules.astro.yearDays（回归年）在加载期派生，不在 _units.json 写数；键不合即 E-DIM-UNIT-UNKNOWN', () => {
  const astro = JSON.parse(readFileSync(join(ROOT, 'world/rules/tables/astro.json'), 'utf8')).rows.find((x) => x.key === 'yearDays').value;
  const units = JSON.parse(readFileSync(join(ROOT, 'world/ontology/dimensions/_units.json'), 'utf8')).units;
  const day = units.find((u) => u.id === 'day').si;
  assert.equal(units.find((u) => u.id === 'year').si, undefined);
  assert.equal(W.world.env.units.get('year').si, (astro.num * day) / astro.den);
  assert.equal(W.world.env.units.get('per_year').si, astro.den / (astro.num * day));
  const m = new Map([['day', { id: 'day', dimension: 'time', si: day }], ['year', { id: 'year', dimension: 'time', siFromRule: { key: 'rules.astro.yearDays', unit: 'day', invert: false } }]]);
  const errs = [];
  resolveRuleSi(m, { astro: { yearDays: { num: 0, den: 1 } } }, (e) => errs.push(e.code));
  assert.deepEqual(errs, ['E-DIM-UNIT-UNKNOWN']);
  assert.equal(m.has('year'), false);
});

test('未建条目字段登记：族里每条都已写这一字段即报应删；字段不是该族条目字段、族没有条目字段核对处都拒', () => {
  const all = loadErr((f) => { f.editUnbuilt = (doc) => { doc.fields.push({ family: 'tissue', field: 'reserve', missing: ['data'], card: 'pre_first_reader_card' }); }; });
  assert.ok(all.errors.some(([c, t]) => c === 'E-DIM-STRUCT-FIELD' && t === '_unbuilt-derived'), JSON.stringify(all.errors));
  const notField = loadErr((f) => { f.editUnbuilt = (doc) => { doc.fields.push({ family: 'sex', field: 'weight', missing: ['data'], card: 'pre_first_reader_card' }); }; });
  assert.ok(notField.errors.some(([c, t, r, d]) => c === 'E-DIM-STRUCT-FIELD' && t === '_unbuilt-derived' && r === 'sex' && d === 'weight'), JSON.stringify(notField.errors));
  const noSchema = loadErr((f) => { f.editUnbuilt = (doc) => { doc.fields.push({ family: 'diet', field: 'eats', missing: ['data'], card: 'pre_first_reader_card' }); }; });
  assert.ok(noSchema.errors.some(([c, t]) => (c === 'E-DIM-REF-MISSING' || c === 'E-DIM-STRUCT-FIELD') && t === '_unbuilt-derived'), JSON.stringify(noSchema.errors));
  const noFamily = loadErr((f) => { f.editUnbuilt = (doc) => { doc.fields.push({ family: 'no_such_family', field: 'x', missing: ['data'], card: 'pre_first_reader_card' }); }; });
  assert.ok(noFamily.errors.some(([c, t]) => c === 'E-DIM-REF-MISSING' && t === '_unbuilt-derived'), JSON.stringify(noFamily.errors));
});

test('未建词表族：已登记的族只放行表头引用闭合；未登记的族 E-DIM-REF-MISSING', () => {
  assert.equal(loadBodyWorld(baseFixture()).ok, true); // species.habitats 引 biome（登为未建族），夹具物种行没写 habitats（另登在 columns）；运行期按未知见 species.test.mjs
  const r = loadErr((f) => { f.editUnbuilt = (doc) => { doc.families = doc.families.filter((x) => x.family !== 'biome'); }; });
  assert.ok(r.errors.some(([c, t, , d]) => c === 'E-DIM-REF-MISSING' && t === 'species' && d === 'habitats'), JSON.stringify(r.errors));
});

test('未建族、未建表、未建单位不免必填核对：引用它们的必填维度没登 columns，行上缺值照旧 E-DIM-REQUIRED-MISSING', () => {
  for (const dim of ['habitats', 'shiftStatus', 'sourceStrength']) {
    const r = loadErr((f) => {
      f.editUnbuilt = (doc) => { doc.columns = doc.columns.filter((x) => !(x.table === 'species' && x.dimension === dim)); };
      if (dim === 'shiftStatus') f.editVocab = (doc) => { doc.families.component.entries.comp_shifter = { table: 'species', requires: [] }; };
      if (dim === 'shiftStatus') for (const row of Object.values(f.species)) row.classes = ['comp_shifter'];
    });
    assert.ok(r.errors.some(([c, t, , d]) => c === 'E-DIM-REQUIRED-MISSING' && t === 'species' && d === dim), `${dim}: ${JSON.stringify(r.errors)}`);
  }
});

test('未建实体表：已登记的表只放行表头 ref；未登记即 E-DIM-REF-MISSING；表已载入仍登记即报应删；前缀重叠 E-DIM-VOCAB-PREFIX', () => {
  const unreg = loadErr((f) => { f.editUnbuilt = (doc) => { doc.kinds = doc.kinds.filter((x) => x.kind !== 'status'); }; });
  assert.ok(unreg.errors.some(([c, t, , d]) => c === 'E-DIM-REF-MISSING' && t === 'species' && d === 'shiftStatus'), JSON.stringify(unreg.errors));
  const loaded = loadErr((f) => { f.editUnbuilt = (doc) => { doc.kinds.push({ kind: 'material', prefix: 'zzmat_', volume: 'test', card: 'pre_first_reader_card' }); }; });
  assert.ok(loaded.errors.some(([c, t]) => c === 'E-DIM-STRUCT-FIELD' && t === '_unbuilt-derived'), JSON.stringify(loaded.errors));
  const clash = loadErr((f) => { f.editUnbuilt = (doc) => { doc.kinds.push({ kind: 'no_such_kind', prefix: 'mat_x_', volume: 'test', card: 'pre_first_reader_card' }); }; });
  assert.ok(clash.errors.some(([c, t]) => c === 'E-DIM-VOCAB-PREFIX' && t === '_unbuilt-derived'), JSON.stringify(clash.errors));
});

test('未建单位：已登记的单位只放行表头 unit；未登记即 E-DIM-UNIT-UNKNOWN；单位已在 _units.json 仍登记即报应删', () => {
  const unreg = loadErr((f) => { f.editUnbuilt = (doc) => { doc.units = doc.units.filter((x) => x.unit !== 'sense_arrival'); }; });
  assert.ok(unreg.errors.some(([c, t, , d]) => c === 'E-DIM-UNIT-UNKNOWN' && t === 'species' && d === 'sourceStrength'), JSON.stringify(unreg.errors));
  const dup = loadErr((f) => { f.editUnbuilt = (doc) => { doc.units.push({ unit: 'kg', missing: ['constant'], card: 'pre_first_reader_card' }); }; });
  assert.ok(dup.errors.some(([c, t]) => c === 'E-DIM-STRUCT-FIELD' && t === '_unbuilt-derived'), JSON.stringify(dup.errors));
});

test('未建词表族：族已在 _vocab.json 建成仍登记即报应删；前缀与已登记前缀重叠即 E-DIM-VOCAB-PREFIX；同族登两次 E-DIM-DUPLICATE-KEY', () => {
  const built = loadErr((f) => { f.editVocab = (doc) => { doc.families.biome = { closed: false, entries: {}, prefix: 'biome_' }; }; });
  assert.ok(built.errors.some(([c, t]) => c === 'E-DIM-STRUCT-FIELD' && t === '_unbuilt-derived'), JSON.stringify(built.errors));
  const clash = loadErr((f) => { f.editUnbuilt = (doc) => { doc.families.push({ family: 'no_such_family', prefix: 'cap_x_', volume: 'test', card: 'pre_first_reader_card' }); }; });
  assert.ok(clash.errors.some(([c, t]) => c === 'E-DIM-VOCAB-PREFIX' && t === '_unbuilt-derived'), JSON.stringify(clash.errors));
  const dup = loadErr((f) => { f.editUnbuilt = (doc) => { doc.families.push({ ...doc.families[0] }); }; });
  assert.ok(dup.errors.some(([c, t]) => c === 'E-DIM-DUPLICATE-KEY' && t === '_unbuilt-derived'), JSON.stringify(dup.errors));
});
