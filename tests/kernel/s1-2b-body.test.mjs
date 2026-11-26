// S1-2b 单测：物种、身体、尸体与 null 键（写码方自补，不作验收依据；草案 §8 第 9–14 条的行为）。
// 期望值一律从世界数据按卷四公式现算（B-1 结构基值、D-4 尸体），不抄仓库此刻的计数；坏数据经测试副本改动，不改 world/。
// 存档根目录用 tests/accept/temp-root.mjs#testTempRoot（不清理）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { testTempRoot } from '../accept/temp-root.mjs';
import { init } from '../../server-plugin/index.mjs';
import { mountKernel } from '../../server-plugin/rules/load/mount.mjs';
import { presentEntries, modifiedWith } from '../../server-plugin/kernel/dimensions.mjs';
import { createDigestCap } from '../../server-plugin/textcore/digest.mjs';

const code = (c) => (e) => /** @type {any} */ (e).code === c;
const ONT = new URL('../../world/ontology/', import.meta.url);
const json = (f) => JSON.parse(readFileSync(new URL(f, ONT), 'utf8'));

/** 世界数据原文（与 index.mjs#readWorld 同形）。 */
function rawWorld() {
  const dir = new URL('dimensions/', ONT);
  const registryRows = json('../rules/registry.json').rows;
  return {
    dimensionDocs: readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort().map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'))),
    namedStructsDoc: json('named-structs.json'),
    owners: json('state-owners.json'),
    registryRows,
    tableDocs: Object.fromEntries(registryRows.map((r) => [r.code, json(`../rules/${r.file}`)])),
    digestExclude: json('../rules/tables/digest-exclude.json').paths,
    primitivesDoc: json('primitives.json'),
    vocabDoc: json('dimensions/_vocab.json'),
  };
}
const caps = (dir) => ({ digestCap: createDigestCap(), saveRoot: pathToFileURL(join(dir, '/')), sources: [{ path: 'x.mjs', text: '' }], modifierSources: Object.freeze([]) });
const mount = (raw) => mountKernel(raw, caps(testTempRoot('s1-2b')));
const docOf = (raw, kind) => raw.dimensionDocs.find((d) => d.kind === kind);

// 测试侧的定点：小数 4 位（rules.kernelConstants.SCALE），按整数算免浮点误差。
const SCALE = json('../rules/tables/kernel-constants.json').rows.find((r) => r.key === 'SCALE').value;
const fx = (x) => Math.round(x * SCALE);
const nonNull = (m) => Object.keys(m).filter((k) => m[k] !== null).sort();

/** 卷四 B-1：身体图各能力的结构基值（能力族全部条目的 dimKey；没有部位贡献的为 0）。 */
function expectedBase(raw, planId) {
  const parts = docOf(raw, 'body_plan').rows[planId].parts;
  const out = {};
  for (const [cap, entry] of Object.entries(raw.vocabDoc.families.capability.entries)) {
    out[entry.dimKey] = parts.reduce((s, p) => s + fx(p.contributes[cap] ?? 0), 0) / SCALE;
  }
  return out;
}

/** 卷四 D-4（物种均值路径，全部部位参与）：材料份额 = Σ_p size_p × tf_t ÷ Σ size，按 tissues 归到材料；null 键整个不算。 */
function expectedCarcass(raw, speciesId) {
  const sp = docOf(raw, 'species').rows[speciesId];
  const plan = docOf(raw, 'body_plan').rows[sp.bodyPlan];
  const size = plan.parts.reduce((s, p) => s + fx(p.sizeFraction), 0);
  const acc = {};
  for (const p of plan.parts) {
    for (const t of nonNull(plan.tissueFractions)) {
      const mat = (p.tissueOverride && p.tissueOverride[t]) || sp.tissues[t];
      acc[mat] = (acc[mat] ?? 0) + fx(p.sizeFraction) * fx(plan.tissueFractions[t]);
    }
  }
  return Object.fromEntries(Object.entries(acc).map(([m, v]) => [m, Math.trunc(v / size) / SCALE]));
}

test('presentEntries：只给非 null 项、按键码点序、冻结；非映射抛 E-DIM-STRUCT-FIELD', () => {
  const got = presentEntries({ b: 2, a: 1, z: null, '\u{1F600}': 3, '￿': 4 });
  assert.deepEqual(got.map(([k]) => k), ['a', 'b', '￿', '\u{1F600}']);
  assert.ok(Object.isFrozen(got) && Object.isFrozen(got[0]));
  assert.deepEqual(presentEntries({ x: null }), []);
  for (const bad of [null, [], 'x', 3]) assert.throws(() => presentEntries(bad), code('E-DIM-STRUCT-FIELD'));
});

test('modifiedWith：基值加 add 项再过修正来源；非数值基值配 add 项即抛', () => {
  const engine = { modifierSources: Object.freeze([(v) => v * 2]) };
  const f = modifiedWith(engine, null, 'k', 'id', 'd', 1, [-0.25]);
  assert.equal(f.base, 1);
  assert.equal(f.value, 1.5);
  assert.throws(() => modifiedWith(engine, null, 'k', 'id', 'd', {}, [1]), code('E-DIM-STRUCT-FIELD'));
  assert.throws(() => modifiedWith({}, null, 'k', 'id', 'd', 1, []), code('E-DIM-STRUCT-FIELD'));
});

test('第 9 条：现世界开局成功（checkBodyPlans 不抛）；人形图 tissueFractions 有 null 键（第二物种带进新组织）', async () => {
  const w = await init({ saveRoot: testTempRoot('s1-2b-init') });
  assert.equal(typeof w.views.bodyView, 'function');
  const raw = rawWorld();
  const plans = docOf(raw, 'body_plan').rows;
  const humanPlan = docOf(raw, 'species').rows.species_human.bodyPlan;
  const nulls = Object.keys(plans[humanPlan].tissueFractions).filter((k) => plans[humanPlan].tissueFractions[k] === null);
  assert.ok(nulls.length >= 1);
  // 那个 null 键正是别的身体图的非 null 组织
  assert.ok(nulls.every((t) => Object.values(plans).some((p) => p.tissueFractions[t] !== null && p.tissueFractions[t] !== undefined)));
});

test('第 10 条：每个物种（含经 create 以物种行为模板的实体）bodyView 不抛；部位集合、组织键集、完好主体能力值 = 结构基值', async () => {
  const w = await init({ saveRoot: testTempRoot('s1-2b-body') });
  const raw = rawWorld();
  const species = docOf(raw, 'species').rows;
  for (const [sid, row] of Object.entries(species)) {
    const r = w.submitProposal({ effects: [{ op: 'create', kind: 'species', template: sid, facts: {} }] });
    assert.equal(r.ok, true);
    const made = Object.keys(w.state.created).filter((k) => w.state.created[k].template === sid);
    for (const id of [sid, ...made]) {
      const v = w.views.bodyView(id);
      const plan = docOf(raw, 'body_plan').rows[row.bodyPlan];
      assert.equal(v.bodyPlan, row.bodyPlan);
      assert.deepEqual(v.parts.map((p) => p.id).sort(), plan.parts.map((p) => p.id).sort());
      for (const p of v.parts) {
        assert.deepEqual(Object.keys(p.tissues).sort(), nonNull(plan.tissueFractions));
        for (const [t, f] of Object.entries(p.tissues)) assert.equal(f.value, row.tissues[t]);
        assert.equal(p.eff, 1);
      }
      const base = expectedBase(raw, row.bodyPlan);
      for (const [k, b] of Object.entries(base)) {
        assert.equal(v.dims[k].base, b, `${sid}.${k}`);
        assert.equal(v.dims[k].value, b, `${sid}.${k}`);
      }
      assert.equal(v.condition, 1);
      assert.equal(v.massKg.known, false);
    }
  }
});

test('第 11 条：carcassOf 物种均值路径——质量原样、材料和为 1、键集 = 非 null 组织的材料，逐键等于 D-4 手算；个体路径质量未知即抛', async () => {
  const w = await init({ saveRoot: testTempRoot('s1-2b-carcass') });
  const raw = rawWorld();
  for (const [sid, row] of Object.entries(docOf(raw, 'species').rows)) {
    const m = 3.25;
    const c = w.views.carcassOf({ speciesId: sid, massKg: m });
    assert.equal(c.massKg, m);
    const plan = docOf(raw, 'body_plan').rows[row.bodyPlan];
    assert.deepEqual(Object.keys(c.material).sort(), [...new Set(nonNull(plan.tissueFractions).map((t) => row.tissues[t]))].sort());
    assert.equal(Object.values(c.material).reduce((s, v) => s + fx(v), 0), SCALE);
    assert.deepEqual(c.material, expectedCarcass(raw, sid));
  }
  assert.throws(() => w.views.carcassOf({ subjectId: Object.keys(docOf(raw, 'species').rows)[0] }), code('E-DIM-UNKNOWN-READ'));
  assert.throws(() => w.views.carcassOf({ speciesId: 'species_human', massKg: -1 }), code('E-DIM-DOMAIN-RANGE'));
});

test('第 11 条补：tissues 无非 null 键的物种（S-5 无实体）没有尸体', () => {
  const raw = rawWorld();
  const sp = docOf(raw, 'species');
  const plans = docOf(raw, 'body_plan');
  const [sid, row] = Object.entries(sp.rows)[0];
  plans.rows[row.bodyPlan].tissueFractions = Object.fromEntries(Object.keys(plans.rows[row.bodyPlan].tissueFractions).map((t) => [t, null]));
  for (const r of Object.values(sp.rows)) if (r.bodyPlan === row.bodyPlan) r.tissues = Object.fromEntries(Object.keys(r.tissues).map((t) => [t, null]));
  const w = mount(raw);
  assert.equal(w.views.carcassOf({ speciesId: sid, massKg: 10 }), null);
});

test('第 12 条：加载期拒坏数据；仅在 null 键上不同的数据照过', () => {
  const pick = (raw) => {
    const sp = docOf(raw, 'species');
    const [sid, row] = Object.entries(sp.rows).find(([, r]) => docOf(raw, 'body_plan').rows[r.bodyPlan].parts.length > 1);
    return { sp, sid, row, plan: docOf(raw, 'body_plan').rows[row.bodyPlan] };
  };
  { const raw = rawWorld(); const { plan } = pick(raw); plan.parts[0].sizeFraction += 0.01; assert.throws(() => mount(raw), code('E-BODY-PLAN-SHAPE')); }
  { const raw = rawWorld(); const { plan } = pick(raw); const t = nonNull(plan.tissueFractions); plan.tissueFractions[t[0]] += 0.01; assert.throws(() => mount(raw), code('E-BODY-PLAN-SHAPE')); }
  { const raw = rawWorld(); const { row } = pick(raw); const t = nonNull(row.tissues); row.tissues[t[0]] = null; assert.throws(() => mount(raw), code('E-BODY-TISSUE-KEYS')); }
  { const raw = rawWorld(); const { plan } = pick(raw); plan.parts.push({ ...plan.parts[1] }); assert.throws(() => mount(raw), code('E-BODY-PLAN-SHAPE')); }
  { const raw = rawWorld(); const { plan } = pick(raw); plan.parts[1].parent = plan.parts[1].id; assert.throws(() => mount(raw), code('E-BODY-PLAN-SHAPE')); }
  { const raw = rawWorld(); const { plan } = pick(raw); plan.parts.forEach((p) => { p.vital = false; }); assert.throws(() => mount(raw), code('E-BODY-PLAN-SHAPE')); }
  { const raw = rawWorld(); const { plan } = pick(raw); const p = plan.parts.find((x) => Object.keys(x.contributes).length > 0); const c = Object.keys(p.contributes)[0]; p.contributes[c] = p.contributes[c] / 2; assert.throws(() => mount(raw), code('E-BODY-PLAN-SHAPE')); }
  { const raw = rawWorld(); const { plan } = pick(raw); plan.parts[0].tissueOverride = { tissue_no_such_s12b: 'mat_bone' }; assert.throws(() => mount(raw), code('E-BODY-PLAN-SHAPE')); }
  // 仅在 null 键上不同：两边同加一个 null 键、同删一个 null 键，都过
  { const raw = rawWorld(); const { plan, row } = pick(raw); plan.tissueFractions.tissue_extra_s12b = null; row.tissues.tissue_other_s12b = null; assert.doesNotThrow(() => mount(raw)); }
  { const raw = rawWorld(); for (const p of Object.values(docOf(raw, 'body_plan').rows)) for (const t of Object.keys(p.tissueFractions)) if (p.tissueFractions[t] === null) delete p.tissueFractions[t]; assert.doesNotThrow(() => mount(raw)); }
});

test('第 13 条：加一张新身体图（新能力条目、新组织）只改数据，以它为身体的物种 bodyView 各能力可求值', () => {
  const raw = rawWorld();
  const planDoc = docOf(raw, 'body_plan');
  const sp = docOf(raw, 'species');
  const fam = raw.vocabDoc.families;
  fam.capability.entries.cap_glow_s12b = { dimKey: 'glowS12b', limitedBy: {} };
  planDoc.capabilities.glowS12b = { ...Object.values(planDoc.capabilities)[0] };
  fam.tissue.entries.tissue_gel_s12b = { depthOrder: 9, reserve: false };
  fam.body_part.entries.bpart_mass_s12b = {};
  const caps = Object.fromEntries(Object.keys(fam.capability.entries).filter((c) => c !== 'cap_flying').map((c) => [c, 1]));
  planDoc.rows.body_blob_s12b = { tissueFractions: { tissue_gel_s12b: 1 }, parts: [{ id: 'bpart_mass_s12b', parent: null, sizeFraction: 1, contributes: caps, vital: true }] };
  for (const p of Object.values(planDoc.rows)) if (p !== planDoc.rows.body_blob_s12b) p.tissueFractions.tissue_gel_s12b = null;
  for (const r of Object.values(sp.rows)) r.tissues.tissue_gel_s12b = null;
  const tissues = Object.fromEntries(Object.keys(fam.tissue.entries).map((t) => [t, null]));
  sp.rows.species_blob_s12b = { classes: [], bodyPlan: 'body_blob_s12b', tissues: { ...tissues, tissue_gel_s12b: 'mat_fat' } };
  const w = mount(raw);
  const v = w.views.bodyView('species_blob_s12b');
  assert.equal(v.dims.glowS12b.value, 1);
  for (const e of Object.values(fam.capability.entries)) assert.equal(typeof v.dims[e.dimKey].value, 'number');
  assert.equal(v.dims.flying.value, 0);
  assert.deepEqual(w.views.carcassOf({ speciesId: 'species_blob_s12b', massKg: 2 }), { massKg: 2, material: { mat_fat: 1 } });
});

test('第 14 条：kernel/files.json 仍 15；rules/body 无物种、身体图、组织代号字面量；rules/ 不对 dim/modified 结果直接 Object.keys/entries/values', () => {
  const repo = new URL('../../', import.meta.url);
  assert.equal(JSON.parse(readFileSync(new URL('server-plugin/kernel/files.json', repo), 'utf8')).length, 15);
  const bodyDir = new URL('server-plugin/rules/body/', repo);
  for (const f of readdirSync(bodyDir)) {
    const src = readFileSync(new URL(f, bodyDir), 'utf8');
    assert.doesNotMatch(src, /['"`](species_|body_|tissue_)/, f);
  }
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(new URL(`${d.name}/`, dir)) : d.name.endsWith('.mjs') ? [new URL(d.name, dir)] : []));
  for (const u of walk(new URL('server-plugin/rules/', repo))) {
    assert.doesNotMatch(readFileSync(u, 'utf8'), /Object\.(keys|entries|values)\(\s*(dim|modified|modifiedWith)\(/, u.pathname);
  }
});
