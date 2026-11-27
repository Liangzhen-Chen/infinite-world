// S1-3d（来历与种族解耦）黑盒验收：卡文第 4 条。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s13d。
// 依据与每条测什么，见 docs/卡档案/feat-s1-3d/出题.md（卷:行 为依据）。
// 口径：来历候选经开局菜单 act_choose_origin 的 origin 槽读；建档经真实动作（选种族+来历）或 create 提案（facts 给 species）。
// 不写死 id：来历行、开关、非人来历子集都从 world/ 推出（子集 = 出身条目 gate 非空的行，即受开关管的兽裔与怪物社会行）。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { express } from '../../support/express.mjs';
import { init } from '../../../server-plugin/index.mjs';
import { testTempRoot, removeTempRoot } from '../../accept/temp-root.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const WORLD = join(ROOT, 'world');
const loadJson = (/** @type {string} */ p) => JSON.parse(readFileSync(p, 'utf8'));
const rowsOf = (/** @type {any} */ doc) => Object.fromEntries(doc.rows.map((/** @type {any} */ r) => [r.key, r.value]));

const PERSON_ROWS = loadJson(join(WORLD, 'ontology/dimensions/person.json')).rows;
const SPECIES_ROWS = loadJson(join(WORLD, 'ontology/dimensions/species.json')).rows;
const ORIGIN_VOCAB = loadJson(join(WORLD, 'ontology/dimensions/_vocab.json')).families.origin.entries;
const SWITCHES = rowsOf(loadJson(join(WORLD, 'rules/tables/player-origins.json')));
const PLAYABLE_CLASS = rowsOf(loadJson(join(WORLD, 'rules/tables/chargen.json'))).playableClass;
const PLAYABLE = Object.keys(SPECIES_ROWS).filter((id) => SPECIES_ROWS[id].classes.includes(PLAYABLE_CLASS)).sort();

// 来历行：person 表中带 origin 与 culture 的行（数据驱动）。
const ORIGIN_IDS = Object.keys(PERSON_ROWS)
  .filter((id) => typeof PERSON_ROWS[id].origin === 'string' && typeof PERSON_ROWS[id].culture === 'string')
  .sort();
const gateOf = (/** @type {string} */ id) => ORIGIN_VOCAB[PERSON_ROWS[id].origin]?.gate ?? null;
// 开关为真的来历（gate 为空或所指开关为真）：应全部进候选。
const OPEN_IDS = ORIGIN_IDS.filter((id) => gateOf(id) === null || SWITCHES[gateOf(id)] === true);
// 受开关管的来历（非人来历子集，数据推出）：兽裔与怪物社会的行。
const GATED_IDS = ORIGIN_IDS.filter((id) => gateOf(id) !== null);

const roots = [];
after(() => {
  for (const r of roots.splice(0)) removeTempRoot(r);
});

const isOk = (/** @type {any} */ r) => r.ok === true || r.result === 'ok';

async function fresh() {
  const root = testTempRoot('s13d-open-');
  roots.push(root);
  const world = await init(express.Router(), { saveRoot: root });
  return { world, root };
}

const candidatesOf = (/** @type {any} */ world, /** @type {string} */ slot) => {
  const a = world.menu(null).affordances.find((/** @type {any} */ x) => (x.act ?? x.id) === 'act_choose_origin');
  assert.ok(a, '开局菜单投影应含 act_choose_origin');
  assert.ok(Array.isArray(a.slots?.[slot]), `槽位 ${slot} 应给出候选数组`);
  return a.slots[slot];
};

const avatarIds = (/** @type {any} */ world) =>
  Object.keys(world.state.created ?? {}).filter((id) => world.state.created[id].kind === 'person');

test('4a. 原先被挡的非人来历开放：开局来历候选 = 全部 origin.open 来历行（开关为真者全入列，与种族无关）', async () => {
  assert.ok(OPEN_IDS.length > 0, '前提：应有开放的来历行');
  const { world } = await fresh();
  const offered = candidatesOf(world, 'origin');
  assert.deepEqual([...offered].sort(), OPEN_IDS, '来历候选集应恰为 origin.open 的来历行');
  for (const id of GATED_IDS.filter((g) => SWITCHES[gateOf(g)] === true)) {
    assert.ok(offered.includes(id), `开关为真的非人来历 ${id} 应出现在候选里`);
  }
});

test('4b. 非人来历经真实动作可建档：逐个选中受开关管的来历（种族取第一个可扮演候选），建档成功，化身模板为所选行', async () => {
  assert.ok(PLAYABLE.length > 0, '前提：应有可扮演物种');
  for (const want of GATED_IDS.filter((g) => SWITCHES[gateOf(g)] === true)) {
    const { world } = await fresh();
    const origin = candidatesOf(world, 'origin');
    const oi = origin.indexOf(want);
    assert.ok(oi >= 0, `开关为真的非人来历 ${want} 应在候选里`);
    const species = candidatesOf(world, 'species');
    const place = candidatesOf(world, 'place');
    const r = await world.act({ act: 'act_choose_origin', slots: { species: 0, origin: oi, place: 0 } });
    assert.equal(isOk(r), true, `选来历 ${want} 应成功：${JSON.stringify(r)}`);
    const ids = avatarIds(world);
    assert.equal(ids.length, 1, `选 ${want} 后应恰有一个化身`);
    const rec = world.state.created[ids[0]];
    assert.equal(rec.template, want, '化身模板应为所选来历行');
    assert.equal(rec.props.species, species[0], '化身种族应为所选候选');
    assert.equal(rec.props.birthplace, place[0], '化身出生地应为所选地点');
  }
});

test('4c. create 提案给 species 即可建：全部来历行（含非人来历）以 facts.species 建人成功，各得一个个体', async () => {
  assert.ok(PLAYABLE.length > 0, '前提：应有可扮演物种');
  const { world } = await fresh();
  for (const tmpl of OPEN_IDS) {
    const before = new Set(Object.keys(world.state.created ?? {}));
    const r = world.submitProposal({ effects: [{ op: 'create', kind: 'person', template: tmpl, facts: { species: PLAYABLE[0] } }] });
    assert.equal(r.ok, true, `以 ${tmpl} 为模板 create（facts.species 给出）应成功：${JSON.stringify(r)}`);
    // Q5 甲（S2-H 起始物实例进 created）：只数 person，其余断言不变。
    const added = Object.keys(world.state.created ?? {}).filter((id) => !before.has(id) && world.state.created[id].kind === 'person');
    assert.equal(added.length, 1, `以 ${tmpl} 建人应恰新增一个 person`);
    assert.equal(world.state.created[added[0]].props.species, PLAYABLE[0], '个体 species 应为 facts 所给');
  }
});
