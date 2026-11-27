// S1-3d（种族与可扮演性解耦）黑盒验收：卡文第 5 条。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s13d。
// 依据与每条测什么，见 docs/卡档案/feat-s1-3d/出题.md（卷:行 为依据）。
// 口径：create 提案直调（玩家入口之一，submitProposal）；可扮演性只在菜单层核，create 不核。
// 不写死 id：非可扮演物种 = 物种表中 classes 不含 chargen.playableClass 的行（数据推出）；来历模板取来历行第一条。
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
const PLAYABLE_CLASS = rowsOf(loadJson(join(WORLD, 'rules/tables/chargen.json'))).playableClass;
const NONPLAYABLE = Object.keys(SPECIES_ROWS)
  .filter((id) => !SPECIES_ROWS[id].classes.includes(PLAYABLE_CLASS))
  .sort();
const TEMPLATE = Object.keys(PERSON_ROWS).find((id) => typeof PERSON_ROWS[id].origin === 'string');

const roots = [];
after(() => {
  for (const r of roots.splice(0)) removeTempRoot(r);
});

async function fresh() {
  const root = testTempRoot('s13d-nonplay-');
  roots.push(root);
  return init(express.Router(), { saveRoot: root });
}

test('5. create 直调可建非可扮演物种：facts.species 给非可扮演物种行，建人成功，个体 species 为所给（可扮演性不在 create 核）', async () => {
  assert.ok(typeof TEMPLATE === 'string', '前提：应有来历模板行');
  assert.ok(NONPLAYABLE.length > 0, '前提：物种表应有 classes 不含可扮演组件类的行');
  for (const sp of NONPLAYABLE) {
    const world = await fresh();
    const before = new Set(Object.keys(world.state.created ?? {}));
    const r = world.submitProposal({ effects: [{ op: 'create', kind: 'person', template: TEMPLATE, facts: { species: sp } }] });
    assert.equal(r.ok, true, `非可扮演物种 ${sp} 的 create 应成功：${JSON.stringify(r)}`);
    // Q5 甲（S2-H 起始物实例进 created）：只数 person，其余断言不变。
    const added = Object.keys(world.state.created ?? {}).filter((id) => !before.has(id) && world.state.created[id].kind === 'person');
    assert.equal(added.length, 1, 'create 应恰新增一个 person');
    assert.equal(world.state.created[added[0]].props.species, sp, '个体 species 应为 facts 所给的非可扮演物种');
  }
});
