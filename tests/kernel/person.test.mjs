// 块 6 第 6-6 张《人物表与终止登记》：人物表头、instantiatePerson（建行一次采样）、personView、living 不顶替、年龄与阶段与体重。
// 卷四《生物身体与人物》§2.3 :204–:232、§3.3 :419、§4.3、§4.4 L-1/L-2（:639–:640）、§4.10 P-1/P-4（:979–:981）、§4.12 G-3/G-6（:1086、:1089）；
// 卷二 §1.10 种子键；迁移体检 K6-22、K6-23、K6-103、K6-104；对照表第 16 行。
// 测试先写；期望值按卷四公式手算成字面量；前提在临时世界里造（tests/kernel/person-world.mjs：年长 365 日 = 525600 分钟，采样用 clamp 相等的"钉死分布"使结果可手算），不读仓库当前数据。
// 只跑不推进世界的小检查（本机 F 盘）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildPersonWorld, MPY, PLACE, ATTR, ATTRS, personRow } from './person-world.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { installModifierSource, resetModifierSource, rowClassesOf } from '../../server-plugin/kernel/dimensions.mjs';
import { personView, instantiatePerson, speciesAttributeMeans, bandMidpoint } from '../../server-plugin/person.mjs';
import { lifeFacts, lifeInputs } from '../../server-plugin/life.mjs';
import { bodyView } from '../../server-plugin/body.mjs';
import { terminated } from '../../server-plugin/action-capacity.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import { checkHoldingKindRows } from '../../server-plugin/kernel/holdings.mjs';

useReportSink(() => {});
installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });

const { engine: ENGINE } = buildPersonWorld();
const NOW = 60 * MPY; // 第 60 年
const born = (ageYears) => NOW - ageYears * MPY;
const state = (extra = {}) => ({ clock: { minute: NOW, seq: 0, dueNext: 0 }, ...extra });
const CTX = { node: 'test_person', file: 'person.mjs' };
const run = (s, fn) => runTransaction(s, CTX, fn);
const make = (s, spec, eng = ENGINE) => run(s, (st) => { instantiatePerson(eng, st, spec); });
const base = (over = {}) => ({ instanceId: 'npc_new', species: 'species_test_a', birthplace: PLACE, birthMinute: born(20), ...over });

// ---------- 人物表头（真实世界） ----------

test('真实 world：person 表有卷四 §2.3 的头：always 维度、他卷 always 维度整类登未建列、派生登未建派生；类别行 termination 三字段齐', () => {
  const real = buildPersonWorld().W;
  const doc = real.tables.get('person').doc;
  const always = Object.entries(doc.dimensions).filter(([, d]) => d.required === 'always').map(([k]) => k).sort();
  assert.deepEqual(always, ['adultMassKg', 'attributes', 'birthMinute', 'birthplace', 'lifespanYears', 'location', 'origin', 'personality', 'sensitivity', 'sex', 'species']);
  // 他卷 always（personality、sensitivity、origin）与卷十七 location 登记为未建列（丙9）：行上缺值放行，不写缺省。
  assert.deepEqual([...real.tables.get('person').unbuiltColumns].sort(), ['location', 'origin', 'personality', 'sensitivity']);
  for (const k of ['adult', 'ageYears', 'attrMod', 'lifeStage', 'living', 'massKg', 'nativeLanguage', 'relAge', 'relMaturity', 'identityKeys', 'fatKg', 'forcePower', 'moveSpeed', 'level', 'esteemTier']) assert.ok(doc.dimensions[k].derived !== undefined && real.tables.get('person').unbuilt.has(k), k);
  // 卷四 §2.3 的其余维度全部在表头声明（不省略；commandBonus 的键族卷文未给，未写，见回报）。
  assert.ok(Object.keys(doc.dimensions).length >= 70, String(Object.keys(doc.dimensions).length));
  // 阶段表与成长曲线真实世界已由 WHO 数据建成（不在 unbuilt）：ageYears 路径建人成功，三个读数确知。
  assert.deepEqual(['stages', 'growthCurve'].filter((k) => real.rules.life.unbuilt.includes(k)), []);
  const unk = { ...ENGINE, rules: { ...ENGINE.rules, life: real.rules.life } };
  const st0 = state({ created: {} });
  assert.deepEqual(make(st0, base({ birthMinute: undefined, ageYears: 20 }), unk), { ok: true });
  const f = lifeFacts(unk, st0, 'npc_new');
  assert.deepEqual([f.lifeStage.known, f.adult.known, f.massKg.known, f.ageYears.known], [true, true, true, true]);
  assert.equal(doc.dimensions.massKg.modifiable, true);
  assert.equal(doc.dimensions.attributes.stacking, 'penalized');
  assert.deepEqual(Object.keys(doc.classes).filter((c) => !c.startsWith('class_test')).sort(), ['class_person_beast', 'class_person_mind']);
  for (const c of ['class_person_beast', 'class_person_mind']) assert.deepEqual(Object.keys(doc.classes[c].termination).sort(), ['mode', 'reviveWindowDays', 'successorRX']);
});

test('K6-29（人物端，对照表第 12 行）：person 表建成且类别行写了 termination（可终止实体类）后，端类型只认实体模板名（卷十八 §4.1.1 :457：可终止的表由模板名覆盖），写表名 person 不再算；agent 等模板名照认；不可终止的表名（status）照旧可解析；解析不到的仍 E-HK-END-TYPE', () => {
  const kind = [...ENGINE.vocab.index].find(([, rec]) => rec.family === 'holding_kind');
  const check = (from, tables) => checkHoldingKindRows({ vocab: { index: new Map([[kind[0], { family: 'holding_kind', entry: { ...kind[1].entry, from }, prefix: 'hk_' }]]) }, rules: ENGINE.rules, tables }).errors.filter((e) => e.startsWith('E-HK-END-TYPE'));
  assert.deepEqual(check(['agent'], ENGINE.tables), []);
  assert.deepEqual(check(['status'], ENGINE.tables), []);
  assert.equal(check(['person'], ENGINE.tables).length > 0, true);
  assert.equal(check(['no_such_table'], ENGINE.tables).length > 0, true);
  // 只收模板名的引擎（没有实体表）：不是模板名的表名不解析。
  assert.equal(check(['status'], undefined).length > 0, true);
});

test('RX 维度歧义只比类型签名：物品与个体都有 massKg（number kg，文档字段不同），规则表里的 massKg > 0 照常编得过（建夹具世界即证）；类型不同（个体 massKg 改成 integer）仍判歧义，加载失败 E-MOD-RX', () => {
  assert.doesNotThrow(() => buildPersonWorld());
  assert.throws(() => buildPersonWorld((f) => { const edit = f.editPersonDoc; f.editPersonDoc = (doc) => { edit(doc); doc.dimensions.massKg.type = 'integer'; }; }), /E-MOD-RX/);
});

// ---------- life.mjs：年龄、阶段、体重（L-1、L-2） ----------

test('lifeFacts：20 岁（lifespan 60、成熟龄 16）→ ageYears 20、relMaturity 1.25、relAge 0.3333（向零截断）、成年阶段、成年、体重 = adultMassKg × 曲线端点 1 = 70', () => {
  const st = state({ created: {} });
  assert.deepEqual(make(st, base()), { ok: true });
  const f = lifeFacts(ENGINE, st, 'npc_new');
  assert.deepEqual([f.ageYears.value, f.relMaturity.value, f.relAge.value], [20, 1.25, 0.3333]);
  assert.deepEqual([f.lifeStage.value, f.adult.value, f.massKg.value], ['lstage_adult', true, 70]);
});

test('阶段与成长：8 岁 → relMaturity 0.5 入少年阶段（≥ 0.15、< 1），非成年，体重 70 × (0.05 + 0.5 × 0.95) = 36.75；45 岁 → relAge 0.75 ≥ 0.7 入老年阶段，仍成年', () => {
  const st = state({ created: {} });
  assert.deepEqual(make(st, base({ instanceId: 'npc_kid', birthMinute: born(8) })), { ok: true });
  assert.deepEqual(make(st, base({ instanceId: 'npc_old', birthMinute: born(45) })), { ok: true });
  const kid = lifeFacts(ENGINE, st, 'npc_kid');
  assert.deepEqual([kid.relMaturity.value, kid.lifeStage.value, kid.adult.value, kid.massKg.value], [0.5, 'lstage_juvenile', false, 36.75]);
  const old = lifeFacts(ENGINE, st, 'npc_old');
  assert.deepEqual([old.relAge.value, old.lifeStage.value, old.adult.value], [0.75, 'lstage_elder', true]);
  // 阶段在边界上：relMaturity 恰为 1（16 岁）入成年阶段（"≥"），差一分钟仍是少年。
  assert.deepEqual(make(st, base({ instanceId: 'npc_edge', birthMinute: born(16) })), { ok: true });
  assert.equal(lifeFacts(ENGINE, st, 'npc_edge').lifeStage.value, 'lstage_adult');
});

// 真实 world 的阶段表与成长曲线（WHO 数据，rules/tables/life.json）：人类成熟龄 19 年（该表依据所写前提），寿命钉 60 年。
// 手算：relMaturity = 年龄 ÷ 19；婴儿→少年界 0.0526（1 岁 ÷ 19 = 0.05263 ≥ 0.0526，0.99 岁 = 0.0521 < 0.0526）；老年 relAge ≥ 0.7（42 ÷ 60 = 0.7）；
// 曲线在 [0.4737, 0.5263] 两点 (0.4737, 0.4516)、(0.5263, 0.5056) 间线性：9.5 岁 relMaturity = 0.5 恰在中点 → 0.4516 + 0.5 × (0.5056 − 0.4516) = 0.4786，体重 = 70 × 0.4786 = 33.502；0 岁 = 70 × 0.0525 = 3.675；19 岁 = 70 × 1 = 70。
test('真实世界人类阶段与体重：19 岁成年、差一岁入少年、不满 1 岁为婴儿、42 岁（relAge 0.7）入老年；体重按 WHO 归一曲线手算', () => {
  const { engine, W } = buildPersonWorld((f) => { f.species.species_test_a.maturityYears = 19; });
  const eng = { ...engine, rules: { ...engine.rules, life: W.rules.life } };
  const st = state({ created: {} });
  const at = (k, age) => { const id = `npc_${k}`; assert.deepEqual(make(st, base({ instanceId: id, birthMinute: born(age) }), eng), { ok: true }); return lifeFacts(eng, st, id); };
  const stageOf = (f) => [f.lifeStage.value, f.adult.value];
  assert.deepEqual(stageOf(at('p_born', 0)), ['lstage_infant', false]);
  assert.deepEqual(stageOf(at('p_099', 0.99)), ['lstage_infant', false]);
  assert.deepEqual(stageOf(at('p_1', 1)), ['lstage_juvenile', false]);
  assert.deepEqual(stageOf(at('p_189', 18.9)), ['lstage_juvenile', false]);
  assert.deepEqual(stageOf(at('p_19', 19)), ['lstage_adult', true]);
  assert.deepEqual(stageOf(at('p_41', 41)), ['lstage_adult', true]);
  assert.deepEqual(stageOf(at('p_42', 42)), ['lstage_elder', true]);
  assert.equal(lifeFacts(eng, st, 'npc_p_born').massKg.value, 3.675);
  assert.equal(lifeFacts(eng, st, 'npc_p_19').massKg.value, 70);
  assert.equal(at('p_95', 9.5).massKg.value, 33.502);
});

test('出生时刻在现刻之后（负年龄，取值域 ≥ 0）是数据错误，照抛 E-DIM-DOMAIN-RANGE；不当 0', () => {
  const st = state({ created: {} });
  assert.deepEqual(make(st, base({ birthMinute: NOW + 1 })), { ok: true });
  assert.throws(() => lifeFacts(ENGINE, st, 'npc_new'), (e) => e.code === 'E-DIM-DOMAIN-RANGE');
});

test('成熟龄为 0 是数据错误（除数恒正）：relMaturity 不当 0 也不除零，照抛；寿命钉在 0.01 以下被表头取值域拒（写入时）', () => {
  const eng = { ...ENGINE, tables: new Map(ENGINE.tables) };
  const sp = ENGINE.tables.get('species');
  const patched = { ...sp, flat: { ...sp.flat, rows: new Map(sp.flat.rows) } };
  patched.flat.rows.set('species_test_a', { ...sp.flat.rows.get('species_test_a'), maturityYears: 0 });
  eng.tables.set('species', patched);
  const st = state({ created: {} });
  assert.deepEqual(make(st, base(), eng), { ok: true });
  assert.throws(() => lifeFacts(eng, st, 'npc_new'), (e) => e.code === 'E-DIM-DOMAIN-RANGE');
  assert.deepEqual(make(state({ created: {} }), base({ lifespanYears: 0 })), { ok: false, code: 'E-DIM-DOMAIN-RANGE' });
});

test('阶段表登在 unbuilt（读到按未知）与表为空（E-LIFE-STAGES）：未知带原因，不取默认阶段；空表/首行下界非 0 即抛', () => {
  const st = state({ created: {} });
  assert.deepEqual(make(st, base()), { ok: true });
  const unbuilt = { ...ENGINE, rules: { ...ENGINE.rules, life: { ...ENGINE.rules.life, stages: undefined, unbuilt: ['stages'] } } };
  const f = lifeFacts(unbuilt, st, 'npc_new');
  assert.deepEqual([f.lifeStage.known, f.adult.known, f.lifeStage.reason], [false, false, 'life.unbuilt']);
  assert.equal(f.ageYears.value, 20);
  const empty = { ...ENGINE, rules: { ...ENGINE.rules, life: { ...ENGINE.rules.life, stages: [] } } };
  assert.throws(() => lifeFacts(empty, st, 'npc_new'), (e) => e.code === 'E-LIFE-STAGES');
  const rows = ENGINE.rules.life.stages.map((r, i) => (i === 0 ? { ...r, relMaturityMin: 0.1 } : r));
  assert.throws(() => lifeFacts({ ...ENGINE, rules: { ...ENGINE.rules, life: { ...ENGINE.rules.life, stages: rows } } }, st, 'npc_new'), (e) => e.code === 'E-LIFE-STAGES');
});

test('生长曲线登在 unbuilt：体重按未知带原因（不取成年体重顶替）；无出生时刻读数则六项都未知', () => {
  const st = state({ created: {} });
  assert.deepEqual(make(st, base()), { ok: true });
  const noCurve = { ...ENGINE, rules: { ...ENGINE.rules, life: { ...ENGINE.rules.life, growthCurve: undefined, unbuilt: ['growthCurve'] } } };
  const f = lifeFacts(noCurve, st, 'npc_new');
  assert.deepEqual([f.massKg.known, f.massKg.reason, f.lifeStage.value], [false, 'life.growthCurve', 'lstage_adult']);
});

// ---------- living（卷四 :39）：不给缺省、不以常数代替 ----------

test('K6-22 living：卷六未建（登记的未建派生）→ personView.dims.living 与 lifeInputs.living 都是 known:false 带原因 E-MOD-RX；relMaturity、relAge 照常给，曲线入参里没有任何常数顶替', () => {
  const st = state({ created: {} });
  assert.deepEqual(make(st, base()), { ok: true });
  const v = personView(ENGINE, st, 'npc_new');
  assert.deepEqual([v.dims.living.known, v.dims.living.reason, v.dims.living.value], [false, 'E-MOD-RX', undefined]);
  const inp = lifeInputs(ENGINE, st, 'npc_new');
  assert.deepEqual(Object.keys(inp).sort(), ['living', 'relAge', 'relMaturity']);
  assert.deepEqual([inp.living.known, inp.living.value, inp.relMaturity.value, inp.relAge.value], [false, undefined, 1.25, 0.3333]);
});

test('K6-22 living：卷六交来已知 Fact（此处把 living 造成存储维度、行上写 3）原样带出；交来 0 也原样是 0（不因 0 视为缺省）', () => {
  // 卷六把 living 作为数值 Fact 交来：真实表头里它是登记的未建派生；这里在抄件里让它成为存储维度（去掉 derived 与未建登记），行上写值，等价于"卷六已建、交来已知值"。
  const eng = buildPersonWorld((f) => {
    f.personRows.npc_a = personRow({ heir: 'npc_b', living: 3 });
    f.personRows.npc_b = personRow({ living: 0 });
    const edit = f.editPersonDoc;
    f.editPersonDoc = (doc) => { edit(doc); delete doc.dimensions.living.derived; };
    f.editUnbuilt = (doc) => { doc.entries = doc.entries.filter((e) => !(e.table === 'person' && e.dimension === 'living')); };
  }).engine;
  const st = state();
  const a = lifeInputs(eng, st, 'npc_a').living;
  const b = lifeInputs(eng, st, 'npc_b').living;
  assert.deepEqual([a.known, a.value, b.known, b.value], [true, 3, true, 0]);
});

// ---------- instantiatePerson（P-4）：必给、采样一次、校验 ----------

test('instantiatePerson 采样：钉死分布的物种，性别取唯一正权重者，寿命 60、成年体重 70、各属性 10、外貌轴 0.25；不存类别（偏离行没有 classes，类别由物种行派生）；basis 记 generated', () => {
  const st = state({ created: {} });
  assert.deepEqual(make(st, base()), { ok: true });
  const row = st.created.npc_new;
  assert.equal('classes' in row, false);
  const p = row.props;
  assert.deepEqual([p.species, p.sex, p.birthMinute, p.birthplace, p.lifespanYears, p.adultMassKg], ['species_test_a', 'sex_male', born(20), PLACE, 60, 70]);
  assert.deepEqual(p.attributes, ATTRS(10));
  assert.deepEqual(p.traits, { trait_test_a: 0.25 });
  assert.deepEqual(p.basis, { kind: 'generated', seedKey: null, writer: 'test_person' });
  assert.equal('culture' in p, false);
  assert.equal('personality' in p || 'sensitivity' in p || 'location' in p, false, '他卷 always 维度不写缺省');
});

test('给定值优先于采样：性别、寿命、体重、部分属性、外貌轴、culture 都按给定写；没给的属性仍由物种分布采样', () => {
  const st = state({ created: {} });
  // sex_female 在物种 sexes 里权重 0（键在映射里、值是 0 不是 null）：有这一性别，只是采样不会抽到，给定可写。
  assert.deepEqual(make(st, base({ sex: 'sex_female', lifespanYears: 80, adultMassKg: 55.5, attributes: { attr_test: 12, attr_luck: 7 }, traits: { trait_test_a: -0.5 } })), { ok: true });
  const row = st.created.npc_new;
  assert.deepEqual([row.props.sex, row.props.lifespanYears, row.props.adultMassKg, row.props.traits], ['sex_female', 80, 55.5, { trait_test_a: -0.5 }]);
  assert.deepEqual([row.props.attributes.attr_test, row.props.attributes.attr_luck, row.props.attributes.attr_agility], [12, 7, 10]);
});

test('采样确定、一键一抽：同种子同 id 同值；换 id 值可不同；同一人的各属性不同键独立（非全相等）；值在 clamp 内且按表头精度截断', () => {
  const run1 = (id) => { const st = state({ created: {} }); assert.deepEqual(make(st, base({ instanceId: id, species: 'species_test_beast' })), { ok: true }); return st.created[id].props; };
  const a1 = run1('npc_r1');
  const a2 = run1('npc_r1');
  assert.deepEqual(a1, a2);
  const b = run1('npc_r2');
  assert.notDeepEqual([a1.lifespanYears, a1.adultMassKg, a1.attributes], [b.lifespanYears, b.adultMassKg, b.attributes]);
  const vals = Object.values(a1.attributes);
  assert.ok(new Set(vals).size > 1, 'every attribute drawn with its own seed key');
  assert.ok(vals.every((v) => v >= 3 && v <= 18 && Math.round(v * 1e4) === v * 1e4), JSON.stringify(vals));
  assert.ok(a1.lifespanYears >= 30 && a1.lifespanYears <= 90 && a1.adultMassKg >= 40 && a1.adultMassKg <= 100);
  assert.ok(['sex_male', 'sex_female'].includes(a1.sex));
});

test('instantiatePerson 拒收：缺必给项、birthMinute 与 ageYears 二选一、id 缺或重复或前缀不属个体、物种不是物种、性别不在物种 sexes、未知属性键、属性出域、无种子', () => {
  const bad = (spec, code, eng) => assert.deepEqual(make(state({ created: {} }), spec, eng), { ok: false, code }, JSON.stringify(spec));
  bad(base({ species: undefined }), 'E-DIM-REQUIRED-MISSING');
  bad(base({ birthplace: undefined }), 'E-DIM-REQUIRED-MISSING');
  bad(base({ birthMinute: undefined }), 'E-DIM-REQUIRED-MISSING');
  bad(base({ ageYears: 20 }), 'E-DIM-REQUIRED-MISSING');
  bad(base({ instanceId: undefined }), 'E-ACT-WRITER-NOT-READY');
  bad(base({ instanceId: 'npc_a' }), 'E-DIM-ID-DUPLICATE');
  bad(base({ instanceId: 'item_x' }), 'E-DIM-ID-FORMAT');
  bad(base({ species: 'body_test_humanoid' }), 'E-DIM-REF-MISSING');
  bad(base({ sex: 'sex_none' }), 'E-PERSON-SEX');
  bad(base({ attributes: { attr_nope: 1 } }), 'E-DIM-REF-MISSING');
  bad(base({ attributes: { attr_test: -1 } }), 'E-DIM-DOMAIN-RANGE');
  bad(base({ extra: 1 }), 'E-DIM-STRUCT-FIELD');
  bad(base(), 'E-DIM-SAMPLE-PARAM', { ...ENGINE, template: { seed: '带 空格' } });
});

test('ageYears 路径（G-6）：须落在成年阶段，转成 birthMinute = 现刻 − ageYears × 年长；少年 10 岁（relMaturity 0.625 < 1）整笔拒收不留行；恰 16 岁成年可过', () => {
  const ok = state({ created: {} });
  assert.deepEqual(make(ok, base({ birthMinute: undefined, ageYears: 20 })), { ok: true });
  assert.equal(ok.created.npc_new.props.birthMinute, NOW - 20 * MPY);
  const kid = state({ created: {} });
  assert.deepEqual(make(kid, base({ birthMinute: undefined, ageYears: 10 })), { ok: false, code: 'E-DIM-DOMAIN-RANGE' });
  assert.deepEqual(kid, state({ created: {} }));
  const edge = state({ created: {} });
  assert.deepEqual(make(edge, base({ birthMinute: undefined, ageYears: 16 })), { ok: true });
  assert.deepEqual(make(state({ created: {} }), base({ birthMinute: undefined, ageYears: -1 })), { ok: false, code: 'E-DIM-DOMAIN-RANGE' });
});

test('个体只存不可再算的东西（P-1）：偏离行里没有年龄、体重、阶段、成年、职业等派生量；派生维度写进 props 被拒；写者之外的路径写不进', () => {
  const st = state({ created: {} });
  assert.deepEqual(make(st, base()), { ok: true });
  assert.deepEqual(Object.keys(st.created.npc_new.props).sort(), ['adultMassKg', 'attributes', 'basis', 'birthMinute', 'birthplace', 'lifespanYears', 'sex', 'species', 'traits']);
});

// ---------- personView ----------

test('personView：dims 键集 = 表头全部维度；派生五项取 lifeFacts；有修正的属性逐键给有效值（基值 10 + add 2 = 12）；别卷未建派生按未知带码；occupation、presentedKey 未建；body 是 bodyView', () => {
  const st = state({ created: {} });
  assert.deepEqual(make(st, base()), { ok: true });
  resetModifierSource();
  installModifierSource((_e, _s, at) => (at.target === 'person.attributes[attr_test]' && at.id === 'npc_new' ? [{ id: 'm1', target: at.target, stage: 'add', value: 2, source: { kind: 'status', id: 'm1' } }] : []));
  try {
    const v = personView(ENGINE, st, 'npc_new');
    assert.deepEqual(Object.keys(v.dims).sort(), Object.keys(ENGINE.tables.get('person').doc.dimensions).sort());
    assert.deepEqual([v.dims.ageYears.value, v.dims.relMaturity.value, v.dims.lifeStage.value, v.dims.adult.value, v.dims.massKg.value], [20, 1.25, 'lstage_adult', true, 70]);
    assert.equal(v.dims.attributes.attr_test.value, 12);
    assert.equal(v.dims.attributes.attr_luck.value, 10);
    assert.deepEqual([v.dims.attrMod.known, v.dims.attrMod.reason, v.dims.nativeLanguage.known], [false, 'E-MOD-RX', false]);
    assert.deepEqual([v.occupation.known, v.presentedKey.known], [false, false]);
    assert.equal(v.dims.species.value, 'species_test_a');
    assert.deepEqual(v.body, bodyView(ENGINE, st, 'npc_new'));
  } finally { resetModifierSource(); }
});

test('运行期建出的个体与作者行同一读法：bodyView 取其体重算部位质量（躯干 0.46 × 70 = 32.2）；终止谓词为假', () => {
  const st = state({ created: {} });
  assert.deepEqual(make(st, base()), { ok: true });
  const body = bodyView(ENGINE, st, 'npc_new');
  assert.equal(body.parts.find((p) => p.id === 'bpart_torso').massKg.value, 32.2);
  assert.deepEqual(terminated(ENGINE, st, 'npc_new'), { ok: false, reason: null });
  // 作者行（npc_a，20 岁）同样读：成年体重 70、躯干 32.2。
  assert.equal(bodyView(ENGINE, state({ clock: { minute: 20 * MPY, seq: 0, dueNext: 0 } }), 'npc_a').parts.find((p) => p.id === 'bpart_torso').massKg.value, 32.2);
});

test('人物类别由物种行派生，偏离行不存类别：运行期个体读到物种行的类别，作者行同法（终止协议按派生类别找 termination 的端到端见 death.test.mjs 建人后即可死）', () => {
  const personTable = ENGINE.tables.get('person');
  const st = state({ created: {} });
  assert.deepEqual(make(st, base()), { ok: true });
  assert.deepEqual(rowClassesOf(ENGINE, st, personTable, 'npc_new'), ['class_test_heir']);
  assert.deepEqual(make(st, base({ instanceId: 'npc_beast2', species: 'species_test_beast' })), { ok: true });
  assert.deepEqual(rowClassesOf(ENGINE, st, personTable, 'npc_beast2'), ['class_person_beast']);
  assert.deepEqual(rowClassesOf(ENGINE, state(), personTable, 'npc_beast'), ['class_person_beast'], '作者行手写的类别照取');
  assert.deepEqual(rowClassesOf(ENGINE, st, personTable, 'npc_nobody'), [], '没有这一行：读不到即空');
});

// ---------- G-3、G-6 的纯函数 ----------

test('G-3 物种属性分布均值：normal 取 mean、uniform 取 (min+max)/2、triangular 取 (min+mode+max)/3（定点）；不认的分布拒', () => {
  const eng = buildPersonWorld((f) => {
    f.species.species_test_a.attributesBase = { ...f.species.species_test_a.attributesBase, attr_agility: { dist: 'uniform', min: 4, max: 9 }, attr_luck: { dist: 'triangular', min: 3, mode: 6, max: 10 }, attr_test: { dist: 'normal', mean: 12.5, sd: 2, clamp: [3, 18] } };
  }).engine;
  const means = speciesAttributeMeans(eng, state(), 'species_test_a');
  assert.deepEqual([means.attr_agility, means.attr_luck, means.attr_test, means.attr_charisma], [6.5, 6.3333, 12.5, 10]);
  const lognormal = buildPersonWorld((f) => { f.species.species_test_a.attributesBase.attr_test = { dist: 'lognormal', mu: 2, sigma: 0.2 }; }).engine;
  assert.throws(() => speciesAttributeMeans(lognormal, state(), 'species_test_a'), (e) => e.code === 'E-DIM-SAMPLE-PARAM');
});

test('G-6 外貌轴档中点：[−1, 1] 等分 4 档，第 0 档 −0.75、第 1 档 −0.25、第 3 档 0.75；1 档恒为 0；档号越界、非整数、档数不为正整数都拒', () => {
  assert.deepEqual([0, 1, 2, 3].map((b) => bandMidpoint(ENGINE, b, 4)), [-0.75, -0.25, 0.25, 0.75]);
  assert.equal(bandMidpoint(ENGINE, 0, 1), 0);
  for (const [b, n] of [[4, 4], [-1, 4], [0, 0], [1.5, 4], [0, 2.5]]) assert.throws(() => bandMidpoint(ENGINE, b, n), (e) => e.code === 'E-DIM-DOMAIN-RANGE', `${b}/${n}`);
});
