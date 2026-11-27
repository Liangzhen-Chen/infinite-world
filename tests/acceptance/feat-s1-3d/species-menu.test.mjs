// S1-3d（开局选种族）黑盒验收：卡文第 1、2、3 条。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s13d。
// 依据与每条测什么，见 docs/卡档案/feat-s1-3d/出题.md（卷:行 为依据）。
// 口径：只经 init 返回的 world.menu、world.act、world.state、world.logBook 读写；前提全由真实动作 act_choose_origin 造。
// 不写死 id：可扮演组件类取 world/rules/tables/chargen.json 的 playableClass 行；可扮演物种集合按物种表 classes 推出。
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

const SPECIES_ROWS = loadJson(join(WORLD, 'ontology/dimensions/species.json')).rows;
const PLAYABLE_CLASS = rowsOf(loadJson(join(WORLD, 'rules/tables/chargen.json'))).playableClass;
// 可扮演物种 = 物种表中 classes 含 rules.chargen.playableClass 所指组件类的行（卷四 G-2 :1085）。
const PLAYABLE = Object.keys(SPECIES_ROWS)
  .filter((id) => SPECIES_ROWS[id].classes.includes(PLAYABLE_CLASS))
  .sort();

const roots = [];
after(() => {
  for (const r of roots.splice(0)) removeTempRoot(r);
});

const isInput = (/** @type {any} */ e) => e.kind === 'command' || e.kind === 'advance';
const isOk = (/** @type {any} */ r) => r.ok === true || r.result === 'ok';
const codeOf = (/** @type {any} */ r) => String(r?.code ?? r?.error?.code ?? '');
const stateJson = (/** @type {any} */ s) => JSON.stringify(s, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v));
const snap = (/** @type {any} */ world) => ({
  clock: world.state.clock.minute,
  json: stateJson(world.state),
  logLen: world.logBook.entries.length,
});
const newInputs = (/** @type {any} */ world, /** @type {any} */ before) =>
  world.logBook.entries.slice(before.logLen).filter(isInput);

function assertRejected(/** @type {any} */ world, /** @type {any} */ before, /** @type {any} */ r, /** @type {string} */ code) {
  assert.equal(isOk(r), false, `应被拒收：${JSON.stringify(r)}`);
  assert.ok(codeOf(r).includes(code), `拒收码应为 ${code}，实得 ${codeOf(r)}`);
  assert.equal(world.state.clock.minute, before.clock, '拒收时时钟不动');
  assert.equal(stateJson(world.state), before.json, '拒收时 state 逐位不变');
  assert.equal(newInputs(world, before).length, 1, '拒收时日志只多一条输入条目');
  for (const e of world.logBook.entries.slice(before.logLen).filter((/** @type {any} */ x) => !isInput(x))) {
    assert.equal(e.ok, false, '拒绝时追加的事件应为 ok:false');
  }
}

async function fresh() {
  const root = testTempRoot('s13d-species-');
  roots.push(root);
  const world = await init(express.Router(), { saveRoot: root });
  return { world, root };
}

// 开局菜单（subject 为空）上 act_choose_origin 某槽的候选数组。
const candidatesOf = (/** @type {any} */ world, /** @type {string} */ slot) => {
  const a = world.menu(null).affordances.find((/** @type {any} */ x) => (x.act ?? x.id) === 'act_choose_origin');
  assert.ok(a, '开局菜单投影应含 act_choose_origin');
  assert.ok(Array.isArray(a.slots?.[slot]), `act_choose_origin 的槽位 ${slot} 应给出候选数组`);
  return a.slots[slot];
};

const avatarIds = (/** @type {any} */ world) =>
  Object.keys(world.state.created ?? {}).filter((id) => world.state.created[id].kind === 'person');

// ---------- 用例 ----------

test('1. 种族候选 = 按数据推出的可扮演物种集合：开局菜单 species 槽的候选，排序后与物种表中 classes 含 chargen.playableClass 的行逐个相等', async () => {
  assert.ok(typeof PLAYABLE_CLASS === 'string' && PLAYABLE_CLASS.length > 0, 'rules.chargen.playableClass 应登记为组件类代号');
  assert.ok(PLAYABLE.length > 0, '物种表应至少有一个可扮演物种行');
  const { world } = await fresh();
  const offered = candidatesOf(world, 'species');
  assert.deepEqual([...offered].sort(), PLAYABLE, '种族候选应恰为可扮演物种集合');
});

test('2. 零 mock 端到端：index.mjs#init 后，经真实菜单 act_choose_origin 选种族+来历+出生地；化身 props.species 等于所选的种族候选', async () => {
  // 对每个种族候选下标各跑一局：候选下标 i 选中的物种必须是化身上写入的那一个。
  const { world: probe } = await fresh();
  const count = candidatesOf(probe, 'species').length;
  assert.ok(count > 0, '种族候选不应为空');
  for (let si = 0; si < count; si++) {
    const { world } = await fresh();
    const species = candidatesOf(world, 'species');
    const origin = candidatesOf(world, 'origin');
    const place = candidatesOf(world, 'place');
    const r = await world.act({ act: 'act_choose_origin', slots: { species: si, origin: 0, place: 0, lodge: 0 } });
    assert.equal(isOk(r), true, `选种族+来历+出生地应成功：${JSON.stringify(r)}`);

    const ids = avatarIds(world);
    assert.equal(ids.length, 1, '选来历后应恰有一个化身');
    const rec = world.state.created[ids[0]];
    assert.equal(rec.props.species, species[si], `化身 props.species 应等于所选候选 ${species[si]}`);
    assert.equal(rec.template, origin[0], '化身模板应为所选来历行');
    assert.equal(rec.props.birthplace, place[0], '化身出生地应为所选地点');
  }
});

test('3. 缺 species 槽或候选下标越界：E-ACT-SLOT，state 逐位不变、时钟不动、无新增化身', async () => {
  const cases = [
    [{ act: 'act_choose_origin', slots: { origin: 0, place: 0, lodge: 0 } }, '缺 species 槽'],
    [{ act: 'act_choose_origin', slots: { species: 1e9, origin: 0, place: 0, lodge: 0 } }, 'species 下标越界（大）'],
    [{ act: 'act_choose_origin', slots: { species: -1, origin: 0, place: 0, lodge: 0 } }, 'species 下标为负'],
  ];
  for (const [intent, why] of cases) {
    const { world } = await fresh();
    const before = snap(world);
    const r = await world.act(intent);
    assertRejected(world, before, r, 'E-ACT-SLOT');
    assert.equal(avatarIds(world).length, 0, `${why}：不应新增化身`);
  }
});
