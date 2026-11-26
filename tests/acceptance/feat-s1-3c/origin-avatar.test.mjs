// S1-3c（开局化身建档派生）黑盒验收：卡文第 1、2、6 条。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s13c。
// 依据见 docs/卡档案/feat-s1-3c/出题.md（卷:行 为依据）。
// 口径：只经 init 返回的产品入口（world.menu、world.act、world.views）与存档薄壳读写；state 只用于读化身的 props（与 S1-3a 同口径）。
// 前提全由真实动作 act_choose_origin 造；期望值从 world/ 读：物种 bodyMassKg.clamp、来历模板行、成年阶段行、年与分钟的单位换算。
// 不写死表名、id、数值：species id、来历行 id、阶段名都从数据推出；只有 act_choose_origin 与 act_wait 两个动作名取自卡文与 S1-3a 的动作目录。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { init } from '../../../server-plugin/index.mjs';
import { testTempRoot, removeTempRoot } from '../../accept/temp-root.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const WORLD = join(ROOT, 'world');
const loadJson = (/** @type {string} */ p) => JSON.parse(readFileSync(p, 'utf8'));
const rowsOf = (doc) => Object.fromEntries(doc.rows.map((r) => [r.key, r.value]));

const PERSON_ROWS = loadJson(join(WORLD, 'ontology/dimensions/person.json')).rows;
const SPECIES_ROWS = loadJson(join(WORLD, 'ontology/dimensions/species.json')).rows;
const UNITS = loadJson(join(WORLD, 'ontology/dimensions/_units.json')).units;
const ASTRO = rowsOf(loadJson(join(WORLD, 'rules/tables/astro.json')));
const LIFE = rowsOf(loadJson(join(WORLD, 'rules/tables/life.json')));

const isOk = (r) => r.ok === true || r.result === 'ok';
const stateJson = (s) => JSON.stringify(s, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v));

// 每年分钟数（卷四 :214 ageYears 的分母；卷二十 §4.2）：year 的 si 由 rules.astro.yearDays（日）求出，再除以 minute 的 si。
const minutesPerYear = (() => {
  const yearDays = ASTRO.yearDays.num / ASTRO.yearDays.den;
  const daySi = UNITS.find((u) => u.id === 'day').si;
  const minuteSi = UNITS.find((u) => u.id === 'minute').si;
  return (yearDays * daySi) / minuteSi;
})();

// 成年阶段行（卷四 L-1 :639）：阶段表中名为成年的那一行（名字以 adult 结尾，数据驱动）。
const ADULT = LIFE.stages.find((s) => /adult$/.test(s.stage));

// 开局年龄（卷四 :631 成年年龄 = species.maturityYears；L-1 成年行 relMaturityMin）：模板行有 startAgeYears 时取它，否则取成年下界。
const startAgeOf = (/** @type {string} */ tmplId) => {
  const row = PERSON_ROWS[tmplId];
  if (typeof row.startAgeYears === 'number') return row.startAgeYears;
  const sp = SPECIES_ROWS[row.species];
  return ADULT.relMaturityMin * sp.maturityYears;
};

const roots = [];
after(() => {
  for (const r of roots.splice(0)) removeTempRoot(r);
});

async function fresh() {
  const root = testTempRoot('s13c-avatar-');
  roots.push(root);
  const world = await init({ saveRoot: root });
  return { world, root };
}

const candidatesOf = (world, /** @type {string} */ act, /** @type {string} */ slot) => {
  const a = world.menu(null).affordances.find((x) => (x.act ?? x.id) === act);
  assert.ok(a, `开局菜单投影应含动作 ${act}`);
  const list = a.slots?.[slot];
  assert.ok(Array.isArray(list), `${act} 的槽位 ${slot} 应给出候选 id 数组`);
  return list;
};

// 化身 id：state.created 中 kind 为 person 的实体（开局只有它一个人）。
const avatarOf = (world) =>
  Object.keys(world.state.created ?? {}).find((id) => world.state.created[id].kind === 'person');

// 选来历（真实动作）：返回 {id, template}。
async function chooseOrigin(world, oi = 0, pi = 0) {
  const origin = candidatesOf(world, 'act_choose_origin', 'origin');
  const place = candidatesOf(world, 'act_choose_origin', 'place');
  const r = await world.act({ act: 'act_choose_origin', slots: { origin: oi, place: pi } });
  assert.equal(isOk(r), true, `选来历应成功：${JSON.stringify(r)}`);
  const id = avatarOf(world);
  assert.ok(id, '选来历后应有化身');
  return { id, template: origin[oi], place: place[pi] };
}

// ---------- 用例 ----------

test('1. 玩家入口零 mock：经 act_choose_origin 建化身；species、adultMassKg、birthMinute 可读且非空；species 等于该来历模板行的 species', async () => {
  const { world } = await fresh();
  const { id, template } = await chooseOrigin(world, 0, 0);
  const rec = world.state.created[id];

  const want = PERSON_ROWS[template].species;
  assert.ok(typeof want === 'string' && want.length > 0, '来历模板行应写 species（设计册 14 :228：species 取文化的物种）');
  assert.ok(Object.hasOwn(SPECIES_ROWS, want), 'species 应指向物种表中的行');

  assert.equal(rec.props.species, want, '化身 species 应等于来历模板行的 species');
  assert.equal(typeof rec.props.adultMassKg, 'number', 'adultMassKg 应为数');
  assert.ok(Number.isFinite(rec.props.adultMassKg), 'adultMassKg 应为有限数');
  assert.equal(typeof rec.props.birthMinute, 'number', 'birthMinute 应为数');
  assert.ok(Number.isInteger(rec.props.birthMinute), 'birthMinute 应为整数分钟');

  // 公共读入口：bodyView 的 massKg 应已知（adultMassKg 经 L-2 派生后可读，卷四 :221、:640）。
  const body = world.views.bodyView(id);
  assert.equal(body.massKg.known, true, '化身 massKg 应可读（bodyView(化身).massKg.known 为真）');
});

test('2. 采样确定且落在分布内：同一来历两次独立 init，化身 adultMassKg 逐位相同；值落在物种 bodyMassKg.clamp 内', async () => {
  const first = await fresh();
  const a = await chooseOrigin(first.world, 0, 0);
  const second = await fresh();
  const b = await chooseOrigin(second.world, 0, 0);
  assert.equal(a.template, b.template, '两次选的应是同一来历');

  const va = first.world.state.created[a.id].props.adultMassKg;
  const vb = second.world.state.created[b.id].props.adultMassKg;
  assert.ok(Object.is(va, vb), `两次独立 init 的 adultMassKg 应逐位相同：${va} 对 ${vb}`);

  const sp = SPECIES_ROWS[PERSON_ROWS[a.template].species];
  const [lo, hi] = sp.bodyMassKg.clamp;
  assert.ok(va >= lo && va <= hi, `adultMassKg ${va} 应落在 bodyMassKg.clamp [${lo}, ${hi}] 内`);
});

test('6. 年龄：birthMinute = 建行分钟 − 开局年龄折算分钟（年龄口径按 startAgeYears 或成年下界，单位从单位表与 rules.astro.yearDays 读）', async () => {
  assert.ok(ADULT, '阶段表应含成年行（卷四 L-1 :639）');
  const { world } = await fresh();
  const before = world.state.clock.minute;
  const { id, template } = await chooseOrigin(world, 0, 0);
  const rec = world.state.created[id];

  // 选来历不推进时钟，建行分钟即选来历前的时钟读数。
  const exact = before - startAgeOf(template) * minutesPerYear;
  // 折分钟取整的口径卡文未定，允许 1 分钟内误差；仍须是整数（上面已验）。
  assert.ok(Math.abs(rec.props.birthMinute - exact) < 1, `birthMinute ${rec.props.birthMinute} 应接近 ${exact}（建行分钟 ${before} − 年龄折分钟）`);
  assert.ok(rec.props.birthMinute <= before, '出生时刻不应晚于建行时刻');
});

// 只在数据给出 startAgeYears 列时生效；当前数据无此列即跳过（不编数，口径见出题.md 说明）。
const AGE_ROWS = Object.keys(PERSON_ROWS).filter((id) => typeof PERSON_ROWS[id].startAgeYears === 'number');
test('6b. 模板行带 startAgeYears 时年龄取它（与 6 同式，只换年龄来源）', { skip: AGE_ROWS.length === 0 ? '数据未给 startAgeYears 列，成年下界口径由第 6 条覆盖' : false }, async () => {
  const { world } = await fresh();
  const origin = candidatesOf(world, 'act_choose_origin', 'origin');
  const oi = origin.findIndex((id) => AGE_ROWS.includes(id));
  assert.ok(oi >= 0, '带 startAgeYears 的来历应在候选中');
  const before = world.state.clock.minute;
  const { id } = await chooseOrigin(world, oi, 0);
  const exact = before - PERSON_ROWS[origin[oi]].startAgeYears * minutesPerYear;
  assert.ok(Math.abs(world.state.created[id].props.birthMinute - exact) < 1, 'birthMinute 应按 startAgeYears 折算');
});
