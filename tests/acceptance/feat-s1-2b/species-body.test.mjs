// S1-2b（物种、身体、尸体与 null 键）黑盒验收。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2b。
// 依据：卷四:410（bodyView 形状）、卷四:543（B-9 组织材料取值顺序）、卷四:874 与 卷四:882（carcassOf 签名与 D-4 公式）、
// 卷四:144（species.tissues 键集 = 身体图 tissueFractions 键集）、卷四:197（tissueFractions 和为 1）、卷四:202（能力贡献和为 0 或 1）、
// 卷四:584（扩展性式：新身体图只加数据）、卷二:263（§1.6 第 4 项：映射覆盖全族，缺键写 null）、契约 ctr_map_nonnull_view（world/ontology/contracts.json:225）。
// 派卡约定（docs/卡档案/feat-s1-2b/派卡.md）：speciesView / bodyView / carcassOf 经 init 或 mountKernel 返回值的 views 暴露，已绑 engine、state，
// 调用形状为 views.bodyView(subjectId)、views.carcassOf({speciesId, massKg})。
// 不写死表名、id、数值：身体图表与物种表按维度名（tissueFractions；tissues 与 bodyPlan）识别；组织与能力族条目从 world/ontology/dimensions/_vocab.json 读；
// 物种质量均值从物种行读；期望值按卷文公式从数据算。加载期坏数据与扩展性用例只在内存副本（镜像 index.mjs#readWorld 的 raw 形状）上改，不改 world/。
// 测试内的探针 id（前缀取自表的 idPrefix + 固定后缀）只用于副本，不是世界数据。
import { express } from '../../support/express.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { init } from '../../../server-plugin/index.mjs';
import { mountKernel } from '../../../server-plugin/rules/load/mount.mjs';
import { mergeOwners, shardDirOf } from '../../../server-plugin/rules/load/registry-shards.mjs';
import { createDigestCap } from '../../../server-plugin/textcore/digest.mjs';
import { testTempRoot } from '../../accept/temp-root.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const WORLD = join(ROOT, 'world');
const ONTOLOGY = join(WORLD, 'ontology');
// 与 server-plugin/index.mjs#readOwners 同形：主文件 + state-owners.d/ 分片按文件名次序合并（生产合并入口 registry-shards.mjs，不另抄一份）。
function ownersOf() {
  const main = 'world/ontology/state-owners.json';
  const dir = join(ROOT, shardDirOf(main));
  const names = existsSync(dir) ? readdirSync(dir).sort() : [];
  const shards = names.map((n) => ({ file: `${shardDirOf(main)}/${n}`, doc: JSON.parse(readFileSync(join(dir, n), 'utf8')) }));
  return structuredClone(mergeOwners({ file: main, doc: JSON.parse(readFileSync(join(ROOT, main), 'utf8')) }, shards).doc);
}

const DIM_DIR = join(ONTOLOGY, 'dimensions');

const loadJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

// 实体表：维度表目录里除下划线开头的元表外都是实体表（与 index.mjs 同口径）。
const TABLES = readdirSync(DIM_DIR)
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .sort()
  .map((f) => loadJson(join(DIM_DIR, f)));
const VOCAB = loadJson(join(DIM_DIR, '_vocab.json')).families;
const REGISTRY_ROWS = loadJson(join(WORLD, 'rules/registry.json')).rows;

const isBodyDoc = (d) => Boolean(d.dimensions && 'tissueFractions' in d.dimensions);
const isSpeciesDoc = (d) => Boolean(d.dimensions && 'tissues' in d.dimensions && 'bodyPlan' in d.dimensions);
const BODY_DOC = TABLES.find(isBodyDoc);
const SPECIES_DOC = TABLES.find(isSpeciesDoc);
assert.ok(BODY_DOC, '维度表中应有身体图表（含 tissueFractions 维度）');
assert.ok(SPECIES_DOC, '维度表中应有物种表（含 tissues 与 bodyPlan 维度）');

const TISSUE_FAMILY = SPECIES_DOC.dimensions.tissues.key.vocab;
const TISSUE_IDS = Object.keys(VOCAB[TISSUE_FAMILY].entries);
const CAPS = Object.entries(VOCAB.capability.entries).map(([id, e]) => ({ id, dimKey: e.dimKey }));
assert.ok(CAPS.length > 0 && CAPS.every((c) => typeof c.dimKey === 'string'), '能力族条目应有 dimKey');

const PLANS = BODY_DOC.rows;
const SPECIES = SPECIES_DOC.rows;
const SPECIES_IDS = Object.keys(SPECIES);
const planOf = (speciesId) => PLANS[SPECIES[speciesId].bodyPlan];
const nonNullKeys = (m) => Object.keys(m).filter((k) => m[k] !== null);
const nullKeys = (m) => Object.keys(m).filter((k) => m[k] === null);
// 人：身体图含 null 键的物种（人形身体图带进新组织后，其缺省组织写 null）；第二物种：其余物种。
const HUMAN_IDS = SPECIES_IDS.filter((id) => nullKeys(planOf(id).tissueFractions).length > 0);
const SECOND_IDS = SPECIES_IDS.filter((id) => !HUMAN_IDS.includes(id));

const close = (a, b) => Math.abs(a - b) < 1e-9;
const fx = (x) => Math.round(x * 10000); // 定点 4 位比较
const entriesOf = (x) => (x instanceof Map ? [...x.entries()] : Object.entries(x));
const keysOf = (x) => (x instanceof Map ? [...x.keys()] : Object.keys(x));

function capFact(dims, cap) {
  const f = dims[cap.dimKey] ?? dims[cap.id];
  assert.ok(f && typeof f === 'object', `bodyView.dims 应含能力 ${cap.id}（维度 ${cap.dimKey}）`);
  return f;
}
// 结构基值：完好主体下能力 = 各部位贡献之和（卷四:202 不变量保证其为 0 或 1）。
const structuralBase = (plan, capId) => plan.parts.reduce((s, p) => s + (p.contributes[capId] ?? 0), 0);

// D-4 / B-9：完好主体下材料构成 = Σ 非 null 组织份额，归到各组织的物种材料。
function expectedMaterial(species, tf) {
  const out = new Map();
  for (const t of Object.keys(tf)) {
    const m = species.tissues[t];
    assert.ok(typeof m === 'string', `组织 ${t} 应有物种材料`);
    out.set(m, (out.get(m) ?? 0) + tf[t]);
  }
  return out;
}

// ---------- 装配 ----------

function mjsUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    if (d.isDirectory()) return mjsUnder(p);
    return d.name.endsWith('.mjs') ? [p] : [];
  });
}
let SOURCES = null;
function readSources() {
  if (SOURCES) return SOURCES;
  const kernel = loadJson(join(ROOT, 'server-plugin/kernel/files.json'));
  const rules = mjsUnder(join(ROOT, 'server-plugin/rules')).map((p) => relative(ROOT, p).split('\\').join('/'));
  SOURCES = [...kernel, ...rules].sort().map((path) => ({ path, text: readFileSync(join(ROOT, path), 'utf8') }));
  return SOURCES;
}
function goodCaps(root) {
  return {
    digestCap: createDigestCap(),
    saveRoot: new URL(pathToFileURL(root).href.replace(/\/?$/, '/')),
    sources: readSources(),
    modifierSources: [],
  };
}
// 镜像 index.mjs#readWorld 的 raw 形状（只读，取一次后每个用例深拷贝）。
let BASE_RAW = null;
function readRaw() {
  const json = (f) => loadJson(join(ONTOLOGY, f));
  const tableDocs = Object.fromEntries(REGISTRY_ROWS.map((r) => [r.code, loadJson(join(WORLD, 'rules', r.file))]));
  return {
    dimensionDocs: TABLES,
    namedStructsDoc: json('named-structs.json'),
    owners: ownersOf(),
    registryRows: REGISTRY_ROWS,
    tableDocs,
    digestExclude: loadJson(join(WORLD, 'rules/tables/digest-exclude.json')).paths,
    primitivesDoc: json('primitives.json'),
    vocabDoc: json('dimensions/_vocab.json'),
    // 开局一步现经账本入账，账本按单位表算日序，镜像须带单位表（同 index.mjs#readWorld，同 tests/kernel/s1-2b-body.test.mjs:47）。
    unitsDoc: json('dimensions/_units.json'),
  };
}
const rawCopy = () => structuredClone((BASE_RAW ??= readRaw()));
const docOf = (raw, pred) => raw.dimensionDocs.find(pred);
const firstKey = (o) => Object.keys(o)[0];
const newRoot = () => testTempRoot('s2b-');
// 内存副本装配（与真实入口同一 mountKernel；坏数据时抛错由调用方断言）。
const mountWith = (raw) => mountKernel(raw, goodCaps(newRoot()));

async function expectCode(fn, code, label = '') {
  let err = null;
  try {
    await fn();
  } catch (e) {
    err = e;
  }
  assert.ok(err, `${label} 应抛出 ${code}，实际没有抛错`);
  assert.equal(err.code, code, `${label} 错误码应为 ${code}，实为 ${err.code}：${err.message}`);
}

// 以真实世界开局后，以物种为模板 create 一个个体，返回新实体 id。
async function createIndividual(env, speciesId) {
  const before = new Set(Object.keys(env.state.created ?? {}));
  const r = await env.submitProposal({ effects: [{ op: 'create', kind: SPECIES_DOC.kind, template: speciesId, facts: {} }] });
  assert.equal(r.ok, true, `以 ${speciesId} 为模板 create 应成功：${JSON.stringify(r)}`);
  const added = Object.keys(env.state.created ?? {}).filter((id) => !before.has(id));
  assert.equal(added.length, 1, 'create 应恰好新增一个实体');
  return added[0];
}

// ---------- 用例 ----------

test('9. 现世界（人 + 第二物种）开局成功，checkBodyPlans 不抛，身体图含 null 键', async () => {
  assert.ok(Object.values(PLANS).some((p) => nullKeys(p.tissueFractions).length >= 1), '身体图 tissueFractions 中应有值为 null 的键（第二物种带进的新组织）');
  assert.ok(HUMAN_IDS.length >= 1, '应有含 null 键身体图的人类物种');
  assert.ok(SECOND_IDS.length >= 1, '世界应有第二物种');
  const env = await init(express.Router(), { saveRoot: newRoot() });
  const { checkBodyPlans } = await import('../../../server-plugin/rules/body/body-plan.mjs');
  assert.doesNotThrow(() => checkBodyPlans(env.engine));
});

test('10. 每个物种（人与第二物种）以其为模板的个体：bodyView 的 parts 与 tissues 键集、能力值与结构基值对齐', async () => {
  const env = await init(express.Router(), { saveRoot: newRoot() });
  assert.ok(SECOND_IDS.length >= 1, '应有第二物种');
  for (const speciesId of SPECIES_IDS) {
    const plan = planOf(speciesId);
    const subject = await createIndividual(env, speciesId);
    const view = env.views.bodyView(subject);
    assert.deepEqual(
      view.parts.map((p) => p.id).sort(),
      plan.parts.map((p) => p.id).sort(),
      `${speciesId}：parts 的 id 集合应为其身体图部位集合`,
    );
    const wantTissues = nonNullKeys(plan.tissueFractions).sort();
    for (const part of view.parts) {
      const keys = keysOf(part.tissues).sort();
      assert.deepEqual(keys, wantTissues, `${speciesId}：部位 ${part.id} 的 tissues 键集应为身体图非 null 组织`);
      assert.ok(keys.every((k) => plan.tissueFractions[k] !== null), `${speciesId}：部位 ${part.id} 的 tissues 不含 null 键`);
    }
    for (const cap of CAPS) {
      const f = capFact(view.dims, cap);
      const want = structuralBase(plan, cap.id);
      assert.ok(want === 0 || want === 1, `${speciesId}：能力 ${cap.id} 的结构基值应为 0 或 1（卷四:202）`);
      assert.ok(close(f.value, want), `${speciesId}：能力 ${cap.id} 的值 ${f.value} 应等于结构基值 ${want}`);
      if ('base' in f) assert.ok(close(f.base, want), `${speciesId}：能力 ${cap.id} 的 base ${f.base} 应等于结构基值 ${want}`);
    }
    // partIntegrity 是 map<body_part, fraction>（卷四表：实例维度，基值恒 1）：完好主体每个部位为 1。
    assert.ok(view.dims.partIntegrity, `${speciesId}：bodyView.dims 应含 partIntegrity`);
    const integrity = view.dims.partIntegrity.value;
    for (const p of plan.parts) {
      assert.ok(close(integrity[p.id], 1), `${speciesId}：完好主体部位 ${p.id} 的 partIntegrity 应为 1，实为 ${integrity[p.id]}`);
    }
  }
});

test('11. carcassOf（物种均值路径）：massKg 相等，材料和为 1，键集与逐键值等于删去 null 键后的 D-4 手算', async () => {
  const env = await init(express.Router(), { saveRoot: newRoot() });
  for (const speciesId of SPECIES_IDS) {
    const sp = SPECIES[speciesId];
    const massKg = sp.bodyMassKg?.mean;
    assert.equal(typeof massKg, 'number', `${speciesId} 应有质量均值（卷四 D-5 物种均值路径）`);
    const c = env.views.carcassOf({ speciesId, massKg });
    assert.ok(c, `${speciesId} 应有尸体（物种有实体，卷四 S-5）`);
    assert.ok(close(c.massKg, massKg), `${speciesId}：carcass.massKg ${c.massKg} 应等于 ${massKg}`);
    const got = entriesOf(c.material);
    const sum = got.reduce((s, [, f]) => s + f, 0);
    assert.ok(Math.abs(sum - 1) < 1e-4, `${speciesId}：material 各值之和 ${sum} 应为 1（定点 4 位）`);
    const noNull = { ...planOf(speciesId).tissueFractions };
    for (const k of nullKeys(noNull)) delete noNull[k];
    const want = expectedMaterial(sp, noNull);
    assert.deepEqual(
      got.map(([m]) => m).sort(),
      [...want.keys()].sort(),
      `${speciesId}：material 键集应为非 null 组织对应的物种材料集合`,
    );
    for (const [m, f] of got) {
      assert.equal(fx(f), fx(want.get(m)), `${speciesId}：材料 ${m} 的份额应为 ${want.get(m)}`);
    }
  }
});

test('12a. 身体图 sizeFraction 和 ≠ 1 → E-BODY-PLAN-SHAPE', async () => {
  const raw = rawCopy();
  const plan = docOf(raw, isBodyDoc).rows[firstKey(PLANS)];
  plan.parts[0].sizeFraction += 0.01;
  await expectCode(() => mountWith(raw), 'E-BODY-PLAN-SHAPE', '12a');
});

test('12b. 物种 tissues 非 null 键集 ≠ 身体图非 null 键集 → E-BODY-TISSUE-KEYS', async () => {
  const raw = rawCopy();
  const sp = docOf(raw, isSpeciesDoc).rows[firstKey(SPECIES)];
  delete sp.tissues[firstKey(sp.tissues)];
  await expectCode(() => mountWith(raw), 'E-BODY-TISSUE-KEYS', '12b');
});

test('12c. 身体图非 null 份额和 ≠ 1 → E-BODY-PLAN-SHAPE', async () => {
  const raw = rawCopy();
  const plan = docOf(raw, isBodyDoc).rows[firstKey(PLANS)];
  const k = nonNullKeys(plan.tissueFractions)[0];
  plan.tissueFractions[k] += 0.01;
  await expectCode(() => mountWith(raw), 'E-BODY-PLAN-SHAPE', '12c');
});

test('12d. 两份数据仅在 null 键上不同（身体图侧或物种侧写 null），都通过加载（ctr_map_nonnull_view）', async () => {
  assert.ok(HUMAN_IDS.length >= 1, '应有含 null 键身体图的人类物种（见用例 9）');
  const humanId = HUMAN_IDS[0];
  const humanPlanId = SPECIES[humanId].bodyPlan;
  const nonNullOfHuman = nonNullKeys(PLANS[humanPlanId].tissueFractions);
  const probe = TISSUE_IDS.find((t) => !nonNullOfHuman.includes(t));
  assert.ok(probe, '需要一个人形身体图未用的组织条目作 null 探针');
  await assert.doesNotReject(async () => {
    await mountWith(rawCopy());
  }, '基线应通过');
  const bodySide = rawCopy();
  docOf(bodySide, isBodyDoc).rows[humanPlanId].tissueFractions[probe] = null;
  await assert.doesNotReject(async () => {
    await mountWith(bodySide);
  }, '身体图侧仅多一个 null 键应通过');
  const speciesSide = rawCopy();
  docOf(speciesSide, isSpeciesDoc).rows[humanId].tissues[probe] = null;
  await assert.doesNotReject(async () => {
    await mountWith(speciesSide);
  }, '物种侧仅多一个 null 键应通过');
});

test('13. 扩展性：测试副本加一张新身体图（含新能力条目与新组织）及其物种，不改 .mjs，bodyView 各能力可求值', async () => {
  assert.ok(HUMAN_IDS.length >= 1, '应有含 null 键身体图的人类物种（见用例 9）');
  const humanId = HUMAN_IDS[0];
  const hp = planOf(humanId);
  const usedCaps = new Set(hp.parts.flatMap((p) => Object.keys(p.contributes)));
  const capProbe = CAPS.find((c) => !usedCaps.has(c.id));
  const usedTissues = new Set(nonNullKeys(hp.tissueFractions));
  const tissueProbe = TISSUE_IDS.find((t) => !usedTissues.has(t));
  assert.ok(capProbe && tissueProbe, '需要人形未用的能力与组织条目作探针');

  const raw = rawCopy();
  const bodyDoc = docOf(raw, isBodyDoc);
  const spDoc = docOf(raw, isSpeciesDoc);
  const newPlanId = `${BODY_DOC.entity.idPrefix[0]}s2b_probe`;
  const newSpId = `${SPECIES_DOC.entity.idPrefix[0]}s2b_probe`;

  const np = structuredClone(hp);
  const donor = nonNullKeys(hp.tissueFractions).find((k) => hp.tissueFractions[k] >= 0.1);
  assert.ok(donor, '人形身体图应有不小于 0.1 的组织份额作让渡来源');
  np.tissueFractions[tissueProbe] = 0.1;
  np.tissueFractions[donor] = Math.round((hp.tissueFractions[donor] - 0.1) * 1000) / 1000;
  np.parts[0].contributes = { ...np.parts[0].contributes, [capProbe.id]: 1 };
  bodyDoc.rows[newPlanId] = np;

  const hs = spDoc.rows[humanId];
  const ns = structuredClone(hs);
  ns.bodyPlan = newPlanId;
  const anyMaterial = Object.values(hs.tissues)[0];
  ns.tissues = Object.fromEntries(nonNullKeys(np.tissueFractions).map((t) => [t, hs.tissues[t] ?? anyMaterial]));
  spDoc.rows[newSpId] = ns;

  const env = await mountWith(raw);
  const subject = await createIndividual(env, newSpId);
  const view = env.views.bodyView(subject);
  for (const cap of CAPS) {
    const f = capFact(view.dims, cap);
    assert.notEqual(f.known, false, `能力 ${cap.id} 应可求值`);
    assert.equal(typeof f.value, 'number', `能力 ${cap.id} 的值应为数`);
  }
  assert.ok(close(capFact(view.dims, capProbe).value, 1), '新能力只由一个部位承担且贡献为 1，其值应为 1');
  const want = nonNullKeys(np.tissueFractions).sort();
  for (const part of view.parts) assert.deepEqual(keysOf(part.tissues).sort(), want, `部位 ${part.id} 的 tissues 键集应为新身体图非 null 组织`);
});
