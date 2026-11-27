// S1-3c（开局化身建档派生）黑盒验收：卡文第 3、4、5 条。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s13c。
// 依据见 docs/卡档案/feat-s1-3c/出题.md（卷:行 为依据）。
// 玩家入口：init 返回的 submitProposal，以 create 提案按人物模板建人（卷九 :640 建档用 create 的 template）。
// 不 mock，不改 world/：第 5 条需要一个「没有 species」的模板行，只在临时副本里删去该列（S1-3a 第 8 条同口径的 copyTree）。
// 不写死表名、id、数值：物种分布 clamp、精度、模板行 id 都从 world/ 读。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { express } from '../../support/express.mjs';
import { init } from '../../../server-plugin/index.mjs';
import { testTempRoot, removeTempRoot, writeUnderTempRoot } from '../../accept/temp-root.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const WORLD = join(ROOT, 'world');
const loadJson = (/** @type {string} */ p) => JSON.parse(readFileSync(p, 'utf8'));

const PERSON_DOC = loadJson(join(WORLD, 'ontology/dimensions/person.json'));
const PERSON_ROWS = PERSON_DOC.rows;
const SPECIES_ROWS = loadJson(join(WORLD, 'ontology/dimensions/species.json')).rows;
const ADULT_MASS_PRECISION = PERSON_DOC.dimensions.adultMassKg.precision;

const isOk = (r) => r.ok === true || r.result === 'ok';
const codeOf = (r) => String(r?.code ?? r?.error?.code ?? '');
const stateJson = (s) => JSON.stringify(s, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v));
const personIds = (world) =>
  Object.keys(world.state.created ?? {}).filter((id) => world.state.created[id].kind === 'person');

// 来历模板行（person 表中带 culture 与 origin 的行）；只取 origin 为字串的行，数据驱动。
const ORIGIN_IDS = Object.keys(PERSON_ROWS).filter((id) => typeof PERSON_ROWS[id].origin === 'string' && typeof PERSON_ROWS[id].culture === 'string');
const TEMPLATE = ORIGIN_IDS[0];
const SPECIES_OF = (/** @type {string} */ tmpl) => {
  const sp = SPECIES_ROWS[PERSON_ROWS[tmpl].species];
  assert.ok(sp, `来历模板 ${tmpl} 应给出可查的物种行（设计册 14 :228）`);
  return sp;
};

const roots = [];
after(() => {
  for (const r of roots.splice(0)) removeTempRoot(r);
});

async function fresh(/** @type {string} */ prefix = 's13c-create-') {
  const root = testTempRoot(prefix);
  roots.push(root);
  const world = await init(express.Router(), { saveRoot: root });
  return { world, root };
}

// 经真实 create 提案建一个人（按人物模板）。返回 submitProposal 的结果与新增的 person id 列表。
// species 不写进个体 props：个体经 rec.template 指向来历模板行，读入口先看 props、再看该行（与 kernel readBase 同序）。
const readSpecies = (/** @type {any} */ world, /** @type {string} */ id) => {
  const rec = world.state.created[id];
  return Object.hasOwn(rec.props, 'species') ? rec.props.species : PERSON_ROWS[rec.template].species;
};

function createPerson(world, /** @type {string} */ tmpl, /** @type {Record<string, unknown>} */ facts = {}) {
  const before = new Set(personIds(world));
  const r = world.submitProposal({ effects: [{ op: 'create', kind: 'person', template: tmpl, facts }] });
  const added = personIds(world).filter((id) => !before.has(id));
  return { r, added };
}

// 复制 server-plugin 与 world 到临时根，并允许改写其中一个文件（同 S1-3a 第 8 条口径）。
function copyTree(/** @type {string} */ root, /** @type {string} */ rel) {
  for (const e of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
    const sub = join(rel, e.name);
    if (e.isDirectory()) copyTree(root, sub);
    else writeUnderTempRoot(root, sub, readFileSync(join(ROOT, sub)));
  }
}
async function freshPatched(patch) {
  const root = testTempRoot('s13c-patched-');
  roots.push(root);
  copyTree(root, 'server-plugin');
  copyTree(root, 'world');
  const rel = 'world/ontology/dimensions/person.json';
  const doc = loadJson(join(root, rel));
  patch(doc);
  writeUnderTempRoot(root, rel, JSON.stringify(doc, null, 2));
  const { init: initCopy } = await import(pathToFileURL(join(root, 'server-plugin/index.mjs')).href);
  const world = await initCopy(express.Router(), { saveRoot: root });
  return { world, root };
}

// ---------- 用例 ----------

test('3. 同一局建两个同模板的人：species 相同，adultMassKg 各自采样（分布退化为常数则相同，否则一般不同）', async () => {
  const { world } = await fresh();
  const a = createPerson(world, TEMPLATE);
  assert.equal(a.r.ok, true, `第一次 create 应成功：${JSON.stringify(a.r)}`);
  const b = createPerson(world, TEMPLATE);
  assert.equal(b.r.ok, true, `第二次 create 应成功：${JSON.stringify(b.r)}`);
  assert.equal(a.added.length, 1);
  assert.equal(b.added.length, 1);
  const x = world.state.created[a.added[0]].props;
  const y = world.state.created[b.added[0]].props;
  assert.equal(x.species, y.species, '同模板两人的 species 应相同');

  const [lo, hi] = SPECIES_OF(TEMPLATE).bodyMassKg.clamp;
  for (const v of [x.adultMassKg, y.adultMassKg]) assert.ok(v >= lo && v <= hi, `adultMassKg ${v} 应落在 clamp [${lo}, ${hi}] 内`);

  const sd = SPECIES_OF(TEMPLATE).bodyMassKg.sd;
  if (sd === 0) assert.equal(x.adultMassKg, y.adultMassKg, '分布退化为常数时两人相同');
  else assert.notEqual(x.adultMassKg, y.adultMassKg, '分布非退化时同模板两个个体的 adultMassKg 应不同（个体键不同，不同流）');
});

test('4. 已有值不覆盖：create 提案 facts 显式给了 adultMassKg 的，结果保留该值（按该维度精度取整后比对）', async () => {
  const { world } = await fresh();
  const [lo, hi] = SPECIES_OF(TEMPLATE).bodyMassKg.clamp;
  const given = Math.round(((lo + hi) / 2) * 10 ** ADULT_MASS_PRECISION) / 10 ** ADULT_MASS_PRECISION;
  const { r, added } = createPerson(world, TEMPLATE, { adultMassKg: given });
  assert.equal(r.ok, true, `带 adultMassKg 的 create 应成功：${JSON.stringify(r)}`);
  assert.equal(added.length, 1);
  const props = world.state.created[added[0]].props;
  assert.equal(props.adultMassKg, given, 'facts 显式给出的 adultMassKg 应保留，不被采样覆盖');
  assert.equal(typeof props.birthMinute, 'number', '其余 always 维度仍应补齐（birthMinute）');
  assert.equal(readSpecies(world, added[0]), PERSON_ROWS[TEMPLATE].species, '其余 always 维度仍应补齐（species 取模板行）');
});

test('5. 缺 species 整笔拒：模板与 facts 都给不出 species 的 person create 被拒，码 E-DIM-UNKNOWN-READ，state 逐位不变、无新增实体', async () => {
  const { world } = await freshPatched((doc) => {
    // 临时副本里删去该来历模板行的 species（模板给不出 species）；facts 也不给。
    delete doc.rows[TEMPLATE].species;
  });
  const before = stateJson(world.state);
  const beforeCount = personIds(world).length;
  const { r, added } = createPerson(world, TEMPLATE, {});
  assert.equal(isOk(r), false, `缺 species 的 create 应被拒：${JSON.stringify(r)}`);
  assert.ok(codeOf(r).includes('E-DIM-UNKNOWN-READ'), `拒绝码应为 E-DIM-UNKNOWN-READ，实得 ${codeOf(r)}`);
  assert.equal(added.length, 0, '被拒时不应新增实体');
  assert.equal(personIds(world).length, beforeCount);
  assert.equal(stateJson(world.state), before, '被拒时 state 逐位不变');
});
