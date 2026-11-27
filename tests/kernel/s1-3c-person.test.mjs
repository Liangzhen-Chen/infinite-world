// S1-3c 单测：开局化身建档派生与骰值键采样（写码方自补，不作验收依据；S1-3c 草案 §2–§5、§7）。
// 期望值按卷二 §1.10 :330–:334（PRNG、normal 分位数插值、categorical）与卷四、rules.life、单位表手算，或在测试里先造前提；不抄仓库基线计数。
// 世界数据经测试副本改动，不改 world/；存档根目录用 tests/accept/temp-root.mjs#testTempRoot。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { testTempRoot } from '../accept/temp-root.mjs';
import { init, saveSlot, loadSlot, replay_apply } from '../../server-plugin/index.mjs';
import { express } from '../support/express.mjs';
import { mountKernel } from '../../server-plugin/rules/load/mount.mjs';
import { dim } from '../../server-plugin/kernel/dimensions.mjs';
import { clockMinute } from '../../server-plugin/kernel/scheduler.mjs';
import { drawByKey } from '../../server-plugin/rules/gen/sample.mjs';
import { createDigestCap } from '../../server-plugin/textcore/digest.mjs';

const W = new URL('../../world/', import.meta.url);
const json = (rel) => JSON.parse(readFileSync(new URL(rel, W), 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));

/** 世界数据原文（与 index.mjs#readWorld 同形）。 */
function rawWorld() {
  const dims = new URL('ontology/dimensions/', W);
  const acts = new URL('actions/', W);
  const registryRows = json('rules/registry.json').rows;
  return {
    dimensionDocs: readdirSync(dims).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort().map((f) => JSON.parse(readFileSync(new URL(f, dims), 'utf8'))),
    namedStructsDoc: json('ontology/named-structs.json'),
    owners: json('ontology/state-owners.json'),
    registryRows,
    tableDocs: Object.fromEntries(registryRows.map((r) => [r.code, json(`rules/${r.file}`)])),
    digestExclude: json('rules/tables/digest-exclude.json').paths,
    primitivesDoc: json('ontology/primitives.json'),
    vocabDoc: json('ontology/dimensions/_vocab.json'),
    unitsDoc: json('ontology/dimensions/_units.json'),
    distributionsDoc: json('ontology/dimensions/_distributions.json'),
    effectsDoc: json('ontology/dimensions/_effects.json'),
    actionDocs: readdirSync(acts).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(new URL(f, acts), 'utf8'))),
  };
}
const caps = (tag) => ({ digestCap: createDigestCap(), saveRoot: pathToFileURL(join(testTempRoot(tag), '/')), sources: [{ path: 'x.mjs', text: '' }], modifierSources: Object.freeze([]) });
const mount = (raw, tag) => mountKernel(raw, caps(tag));
const docOf = (raw, kind) => raw.dimensionDocs.find((d) => d.kind === kind);
const ruleOf = (raw, code, key) => raw.tableDocs[code].rows.find((r) => r.key === key).value;
const SPECIES = docOf(rawWorld(), 'species').rows;
const sha = (t) => createHash('sha256').update(t, 'utf8').digest('hex');

/** 卷二 :330 第 0 个均匀数：键 = sha256(五段以 | 相连)，h_0 = sha256(键 | 0)，取前 16 位十六进制。 */
function u0(seed, stream, subject, time, site) {
  const key = sha([String(seed), stream, subject.join('|'), String(time), site].join('|'));
  return BigInt(`0x${sha(`${key}|0`).slice(0, 16)}`);
}

/** 开局建化身（选第 index 条来历、第 0 个地点），返回 {g, id}。 */
function spawn(g, index = 0) {
  const a = g.menu(null).affordances[0];
  const r = g.act({ act: a.act, slots: { origin: index, place: 0 } });
  assert.equal(r.ok, true, JSON.stringify(r));
  return Object.keys(g.state.created).find((id) => g.state.created[id].kind === 'person');
}

test('1 采样确定性：同五段同分布即同值；换对象段或世界种子即换流（键成分不含计数）', () => {
  const w = mount(rawWorld(), 's13c-det-');
  const dist = { dist: 'normal', mean: 0, sd: 1000 };
  const one = drawByKey('person_instantiate', 'person_sample', w.engine, 7, ['npc_1', 'adultMassKg'], 0, dist);
  assert.equal(drawByKey('person_instantiate', 'person_sample', w.engine, 7, ['npc_1', 'adultMassKg'], 0, dist), one);
  assert.notEqual(drawByKey('person_instantiate', 'person_sample', w.engine, 7, ['npc_2', 'adultMassKg'], 0, dist), one);
  assert.notEqual(drawByKey('person_instantiate', 'person_sample', w.engine, 8, ['npc_1', 'adultMassKg'], 0, dist), one);
  assert.notEqual(drawByKey('person_instantiate', 'person_sample', w.engine, 7, ['npc_1', 'lifespanYears'], 0, dist), one);
});

test('2 normal 按卷二 :331 分位数表整数插值、mean + sd×z 定点截断，再按分布 clamp 夹取：与手算逐位相同', () => {
  const w = mount(rawWorld(), 's13c-normal-');
  const q = json('ontology/dimensions/_distributions.json').normalQuantile;
  const dist = SPECIES.species_human.bodyMassKg;
  for (const subject of [['npc_1', 'adultMassKg'], ['npc_9', 'adultMassKg'], ['creature_3', 'adultMassKg']]) {
    const u = u0(3, 'person_instantiate', subject, -5, 'person_sample');
    const j = Number(u >> 52n);
    const f = u & ((1n << 52n) - 1n);
    const z = BigInt(q.values[j]) + ((BigInt(q.values[j + 1]) - BigInt(q.values[j])) * f) / (1n << 52n);
    let v = BigInt(Math.round(dist.mean * 1e4)) + (BigInt(Math.round(dist.sd * 1e4)) * z) / 10000n;
    const [lo, hi] = dist.clamp.map((x) => BigInt(Math.round(x * 1e4)));
    v = v < lo ? lo : v > hi ? hi : v;
    assert.equal(drawByKey('person_instantiate', 'person_sample', w.engine, 3, subject, -5, dist), Number(v) / 1e4, subject.join('|'));
  }
});

test('3 categorical：u mod Σw 按键码点序累加命中，空值权重不参与（卷二 :334）', () => {
  const w = mount(rawWorld(), 's13c-cat-');
  const weights = SPECIES.species_human.sexes;
  const keys = Object.keys(weights).filter((k) => weights[k] !== null).sort();
  const total = keys.reduce((s, k) => s + BigInt(weights[k]), 0n);
  for (const id of ['npc_1', 'npc_2', 'npc_3', 'npc_4']) {
    let left = u0(0, 'person_instantiate', [id, 'sex'], 0, 'person_sample') % total;
    const want = keys.find((k) => { if (left < BigInt(weights[k])) return true; left -= BigInt(weights[k]); return false; });
    assert.equal(drawByKey('person_instantiate', 'person_sample', w.engine, 0, [id, 'sex'], 0, { dist: 'categorical', weights }), want, id);
  }
});

test('4 非法分布与键成分：sd ≤ 0、未实现种类报 E-DIM-SAMPLE-PARAM；负权重或权重和为 0 报 E-DIM-SAMPLE-WEIGHTS；键成分不合报 E-SEED-COMPONENT', () => {
  const w = mount(rawWorld(), 's13c-bad-');
  const draw = (dist, subject = ['npc_1', 'sex'], stream = 'person_instantiate') => drawByKey(stream, 'person_sample', w.engine, 0, subject, 0, dist);
  const code = (c) => (e) => e.code === c;
  assert.throws(() => draw({ dist: 'normal', mean: 1, sd: 0 }), code('E-DIM-SAMPLE-PARAM'));
  assert.throws(() => draw({ dist: 'uniform', min: 2, max: 1 }), code('E-DIM-SAMPLE-PARAM'));
  assert.throws(() => draw({ dist: 'curve', curve: 'x', x: 'y' }), code('E-DIM-SAMPLE-PARAM'));
  assert.throws(() => draw({ dist: 'normal', mean: 1, sd: 1, clamp: [2, 1] }), code('E-DIM-SAMPLE-PARAM'));
  assert.throws(() => draw({ dist: 'categorical', weights: { a: -1, b: 2 } }), code('E-DIM-SAMPLE-WEIGHTS'));
  assert.throws(() => draw({ dist: 'categorical', weights: { a: 0, b: null } }), code('E-DIM-SAMPLE-WEIGHTS'));
  assert.throws(() => draw({ dist: 'categorical', weights: { a: 1 } }, ['npc_1', 'a', 'b', 'c']), code('E-SEED-COMPONENT'));
  assert.throws(() => draw({ dist: 'categorical', weights: { a: 1 } }, ['npc|1']), code('E-SEED-COMPONENT'));
});

test('5 真实入口选来历：化身补齐 species、adultMassKg、birthMinute、sex、lifespanYears、attributes；birthMinute = 建行分钟 − 成年下界年龄折分钟', async () => {
  const raw = rawWorld();
  const g = await init(express.Router(), { saveRoot: testTempRoot('s13c-spawn-') });
  const t0 = clockMinute(g.engine, g.state);
  const id = spawn(g);
  const tpl = docOf(raw, 'person').rows[g.state.created[id].template];
  const read = (d) => dim(g.engine, g.state, 'person', id, d).value;
  assert.equal(read('species'), tpl.species);
  const sp = SPECIES[tpl.species];
  const mass = read('adultMassKg');
  assert.ok(mass >= sp.bodyMassKg.clamp[0] && mass <= sp.bodyMassKg.clamp[1], String(mass));
  assert.equal(Math.round(mass * 1e4) / 1e4, mass);
  assert.ok(Object.keys(sp.sexes).filter((k) => sp.sexes[k] !== null).includes(read('sex')));
  assert.deepEqual(Object.keys(read('attributes')).sort(), Object.keys(sp.attributesBase).filter((k) => sp.attributesBase[k] !== null).sort());
  // 成年下界：rules.life.stages 中首个 life_stage 条目 adult 为真的行 × 物种 maturityYears；年→分钟取单位表（year 的 si 由 rules.astro.yearDays × day）。
  const stage = ruleOf(raw, 'life', 'stages').find((s) => raw.vocabDoc.families.life_stage.entries[s.stage].adult === true);
  const units = Object.fromEntries(raw.unitsDoc.units.map((u) => [u.id, u]));
  const yd = ruleOf(raw, 'astro', 'yearDays');
  const ageFixed = (BigInt(Math.round(stage.relMaturityMin * 1e4)) * BigInt(Math.round(sp.maturityYears * 1e4))) / 10000n;
  const minutes = (ageFixed * BigInt(yd.num) * BigInt(units.day.si)) / (BigInt(yd.den) * BigInt(units.minute.si) * 10000n);
  assert.equal(read('birthMinute'), t0 - Number(minutes));
  assert.equal(g.views.bodyView(id).massKg.known, true);
});

test('6 已有值不覆盖：create 的 facts 给了 adultMassKg、birthMinute，结果等于所给值；其余仍补齐', async () => {
  const raw = rawWorld();
  const g = await init(express.Router(), { saveRoot: testTempRoot('s13c-keep-') });
  const tpl = Object.keys(docOf(raw, 'person').rows).find((k) => Object.hasOwn(SPECIES, String(docOf(raw, 'person').rows[k].species)));
  const r = g.submitProposal({ effects: [{ op: 'create', kind: 'person', template: tpl, facts: { adultMassKg: 50, birthMinute: -100 } }] });
  assert.equal(r.ok, true, JSON.stringify(r));
  const id = Object.keys(g.state.created)[0];
  assert.equal(dim(g.engine, g.state, 'person', id, 'adultMassKg').value, 50);
  assert.equal(dim(g.engine, g.state, 'person', id, 'birthMinute').value, -100);
  assert.equal(typeof dim(g.engine, g.state, 'person', id, 'lifespanYears').value, 'number');
});

test('7 缺 species 整笔拒：以无 species 的模板行 create 人物，E-DIM-UNKNOWN-READ，state 不变；建物品不受影响', async () => {
  const raw = rawWorld();
  const g = await init(express.Router(), { saveRoot: testTempRoot('s13c-nospecies-') });
  const rows = docOf(raw, 'person').rows;
  const tpl = Object.keys(rows).find((k) => !Object.hasOwn(rows[k], 'species'));
  assert.ok(tpl, '前提：有未写 species 的模板行');
  const r = g.submitProposal({ effects: [{ op: 'create', kind: 'person', template: tpl, facts: {} }] });
  assert.equal(r.code, 'E-DIM-UNKNOWN-READ');
  assert.equal(Object.keys(g.state.created || {}).length, 0);
  const itemTpl = Object.keys(docOf(raw, 'item').rows)[0];
  const item = g.submitProposal({ effects: [{ op: 'create', kind: 'item', template: itemTpl, facts: {} }] });
  assert.equal(item.ok, true, JSON.stringify(item));
  const made = Object.keys(g.state.created)[0];
  assert.deepEqual(g.state.created[made].props, {});
});

test('8 数据门 origin.ready：候选里没有无物种行的模板；测试副本给一条补上 species 即出现（只改数据）', () => {
  const raw = rawWorld();
  const rows = docOf(raw, 'person').rows;
  const ready = (r) => Object.hasOwn(SPECIES, String(r.species));
  const got = mount(raw, 's13c-ready-').menu(null).affordances[0].slots.origin;
  assert.ok(got.length > 0 && got.every((id) => ready(rows[id])));
  const hidden = Object.keys(rows).find((k) => k.startsWith('npc_bg_') && !ready(rows[k]));
  assert.ok(hidden && !got.includes(hidden));
  const r = clone(raw);
  docOf(r, 'person').rows[hidden].species = Object.keys(SPECIES).find((s) => SPECIES[s].sapient === true);
  assert.ok(mount(r, 's13c-ready2-').menu(null).affordances[0].slots.origin.includes(hidden));
});

test('9 同种子同值、换种子不同；sampleFrom 删一行即不再补那一维（只改数据）', () => {
  const raw = rawWorld();
  const propsOf = (r, tag) => { const g = mount(r, tag); return g.state.created[spawn(g)].props; };
  const a = propsOf(raw, 's13c-seed-a-');
  assert.deepEqual(propsOf(raw, 's13c-seed-b-'), a);
  const other = clone(raw);
  other.tableDocs.gen.rows.find((x) => x.key === 'worldSeed').value = ruleOf(raw, 'gen', 'worldSeed') + 1;
  assert.notDeepEqual(propsOf(other, 's13c-seed-c-'), a);
  const less = clone(raw);
  const sf = less.tableDocs.person.rows.find((x) => x.key === 'sampleFrom');
  const dropped = sf.value.shift().target;
  const p = propsOf(less, 's13c-seed-d-');
  assert.equal(Object.hasOwn(p, dropped), false);
  for (const row of sf.value) assert.deepEqual(p[row.target], a[row.target], row.target);
});

test('10 存槽读档复演：化身各补齐维度逐位相同，saveDigest 相同', async () => {
  const dir = testTempRoot('s13c-replay-');
  const g = await init(express.Router(), { saveRoot: dir });
  spawn(g);
  const saved = saveSlot(g);
  const r = replay_apply(loadSlot(saved, { saveRoot: dir }));
  assert.equal(r.saveDigest, saved.saveDigest);
  assert.deepEqual(r.state.created, g.state.created);
});
