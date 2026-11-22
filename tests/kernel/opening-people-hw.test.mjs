// 试玩地区人物载入（李白 11-24「家户两问1122」H-4；卷四 §4.10 P-4 :984；卷十八 R18-2.9 :712、A18-2.2 :746）。输入全是真实作者数据与真实世界表：
// world/people/opening-roster-hw.json（tools/convert-people-hw.mjs 从旧作者数据 baseline.json、residents.json 转出）、真实 org 表的 22 条家户行、真实加载器一遍过。
// 期望值照旧作者数据逐户手列成字面量（成员见 world/people/households.json，年龄见 baseline.json、residents.json 的 age）：
// 户主 = 本户成员按 R18-2.9 取第一位（权重、亲等开局都没有数据，视为相等；birthMinute 早者在前 = 年长者在前；再比 id）。22 户里同户成员年龄都不相同，所以户主就是户内年龄最大者：
//   01 林穗 34 > 阿砚 19；02 陈柏 62 > 方芩 60；03 许玲 一人；04 段焰 42 > 段禾 16；05 吴朔 一人；06 范荣 59 > 陶芝 30；07 郑水生 46 > 何荻 45；08 石瑾 32 > 罗薇 30 > 罗杏 8；09 阮峥 58 > 苏兰 30；
//   10 俞星 68 > 顾岑 43；11 梅岳 63 > 桑悟 61 > 梅灵 30；12 陆询 64 > 陆清 30；13 安淮 一人；14 申鹤 56 > 申渡 30；15 邵禾 70；16 华慈 78；17 冉默 63；18 翁巧 66；19 杭丽 48 > 费凯 44；
//   20 钟秀 71；21 李岩 69；22 殷戈 52 > 金萍 50（名字只作注释，断言用 id）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installVocab } from '../../server-plugin/kernel/vocab.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { installEventLog } from '../../server-plugin/kernel/events.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import { installHoldingEngine, openHoldingsOfKind } from '../../server-plugin/kernel/holdings.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { applyOpeningPeople, firstInFullOrder } from '../../server-plugin/opening-people.mjs';
import { buildRoster } from '../../tools/convert-people-hw.mjs';
import { ROOT } from './polity-world.mjs'; // 同时装入摘要常数（installDigestCap）

useReportSink(() => {});
const ROSTER = JSON.parse(readFileSync(join(ROOT, 'world/people/opening-roster-hw.json'), 'utf8'));
const W = loadWorld(ROOT);
assert.equal(W.ok, true, W.text);
installVocab({ vocab: W.vocab, idIndex: W.idIndex, tables: W.tables });
const ENGINE = { vocab: W.vocab, rules: W.rules, units: W.env.units, tables: W.tables, template: { seed: 'opening_people_hw_seed' } };
const CTX = { node: 'test_opening_people_hw', file: 'tests/kernel/opening-people-hw.test.mjs' };
const MEMBER = W.rules.gen.householdMemberKind;
const HEAD = W.rules.gen.householdHeadKind;
// 开局时钟 0，年龄 a 岁（整数）的人 birthMinute = −⌊a × 年长⌋ 分钟，年长 = rules.astro.yearDays（回归年日数 num/den，卷二十 §2.2）× 1440 分钟每日，整数除手算。
const MINUTES_PER_DAY = 1440;
const birthOf = (ageYears) => { const y = W.rules.astro.yearDays; return -Number((BigInt(ageYears) * BigInt(y.num) * BigInt(MINUTES_PER_DAY)) / BigInt(y.den)); };

const world = (roster = ROSTER) => {
  installHoldingEngine(ENGINE);
  installEventLog({ entries: [] });
  const state = { clock: { minute: 0, seq: 0 } };
  let out;
  const r = runTransaction(state, CTX, (s) => { out = applyOpeningPeople(ENGINE, s, roster); });
  return { state, r, out };
};

// 22 户：户 id（组织行）→ [户主, 其余成员]；成员取自 households.json，户主按上面的年龄手算。
const HW = {
  org_house_hw_01: ['npc_hw_linsui', ['npc_hw_ayan']],
  org_house_hw_02: ['npc_hw_chenbai', ['npc_hw_fangqin']],
  org_house_hw_03: ['npc_hw_xuling', []],
  org_house_hw_04: ['npc_hw_duanyan', ['npc_hw_duanhe']],
  org_house_hw_05: ['npc_hw_wushuo', []],
  org_house_hw_06: ['npc_hw_fanrong', ['npc_hw_taozhi']],
  org_house_hw_07: ['npc_hw_zhengshuisheng', ['npc_hw_hedi']],
  org_house_hw_08: ['npc_hw_shijin', ['npc_hw_luowei', 'npc_hw_luoxing']],
  org_house_hw_09: ['npc_hw_ruanzheng', ['npc_hw_sulan']],
  org_house_hw_10: ['npc_hw_yuxing', ['npc_hw_gucen']],
  org_house_hw_11: ['npc_hw_meiyue', ['npc_hw_meiling', 'npc_hw_sangwu']],
  org_house_hw_12: ['npc_hw_luxun', ['npc_hw_luqing']],
  org_house_hw_13: ['npc_hw_anhuai', []],
  org_house_hw_14: ['npc_hw_shenhe', ['npc_hw_shendu']],
  org_house_hw_15: ['npc_hw_shaohe', ['npc_hw_miaozhen', 'npc_hw_shaoyu', 'npc_hw_shaoyun']],
  org_house_hw_16: ['npc_hw_huaci', ['npc_hw_xinglu', 'npc_hw_xingshu']],
  org_house_hw_17: ['npc_hw_ranmo', ['npc_hw_dengjia', 'npc_hw_dengtai', 'npc_hw_randai']],
  org_house_hw_18: ['npc_hw_wengqiao', ['npc_hw_puduo', 'npc_hw_puxin', 'npc_hw_wengqin']],
  org_house_hw_19: ['npc_hw_hangli', ['npc_hw_feikai', 'npc_hw_feiyin', 'npc_hw_feizhuo']],
  org_house_hw_20: ['npc_hw_zhongxiu', ['npc_hw_baihui', 'npc_hw_jiaoyou', 'npc_hw_zhongya']],
  org_house_hw_21: ['npc_hw_liyan', ['npc_hw_xiejin', 'npc_hw_xierui', 'npc_hw_xieyi']],
  org_house_hw_22: ['npc_hw_yinge', ['npc_hw_jinping', 'npc_hw_yinqiu', 'npc_hw_yinzhi']],
};
const NO_HOUSEHOLD = ['npc_hw_hezhou']; // 旧数据 scope 是试玩地区、户籍索引里没有、household 为空的人：明确无户
const ALL = [...Object.values(HW).flatMap(([h, ms]) => [h, ...ms]), ...NO_HOUSEHOLD].sort();
// 九栋私宅（家户行 seat、开局持有卡 H-1）：栋 → 户。
const DWELLING = {
  bld_hw_home_15: 'org_house_hw_15', bld_hw_home_16: 'org_house_hw_16', bld_hw_home_17: 'org_house_hw_17', bld_hw_home_18: 'org_house_hw_18', bld_hw_home_19: 'org_house_hw_19',
  bld_hw_home_20: 'org_house_hw_20', bld_hw_home_21: 'org_house_hw_21', bld_hw_home_22: 'org_house_hw_22', bld_hw_riverhome: 'org_house_hw_03',
};

test('名册：试玩地区 59 人（家户 58 人加明确无户 1 人），与旧作者数据转换结果逐字相同；scope 不在试玩地区的人不进名册', () => {
  assert.deepEqual(ROSTER, JSON.parse(JSON.stringify(buildRoster())));
  assert.deepEqual(ROSTER.persons.map((p) => p.id), ALL);
  assert.equal(ROSTER.persons.length, 59);
  assert.ok(!ROSTER.persons.some((p) => p.id === 'npc_hw_yanzhe')); // 旧 scope 是白石镇 loc_bs（household 里是 npc_bs_*）
  const noHome = ROSTER.persons.filter((p) => p.household === null).map((p) => p.id);
  assert.deepEqual(noHome, NO_HOUSEHOLD);
  const linsui = ROSTER.persons.find((p) => p.id === 'npc_hw_linsui');
  assert.deepEqual(linsui, { id: 'npc_hw_linsui', species: 'species_human', sex: 'sex_female', ageYears: 34, birthplace: 'loc_hw', household: 'org_house_hw_01' });
  const hezhou = ROSTER.persons.find((p) => p.id === 'npc_hw_hezhou');
  assert.deepEqual(hezhou, { id: 'npc_hw_hezhou', species: 'species_human', sex: 'sex_male', ageYears: 30, birthplace: 'loc_hw', household: null });
});

test('建人：59 人各一条个体行（物种、性别、出生地取名册，birthMinute = −⌊年龄 × 年长⌋），寿命、成年体重、属性按物种分布采样且落在物种取值范围内', () => {
  const { state, r, out } = world();
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(out.people, ALL);
  assert.deepEqual(Object.keys(state.created).sort(), ALL);
  const sp = W.tables.get('species').flat.rows.get('species_human');
  for (const p of ROSTER.persons) {
    const props = state.created[p.id].props;
    assert.equal(props.species, p.species, p.id);
    assert.equal(props.sex, p.sex, p.id);
    assert.equal(props.birthplace, p.birthplace, p.id);
    assert.equal(props.birthMinute, birthOf(p.ageYears), p.id);
    assert.ok(props.lifespanYears >= sp.lifespanYears.clamp[0] && props.lifespanYears <= sp.lifespanYears.clamp[1], p.id);
    assert.ok(props.adultMassKg >= sp.bodyMassKg.clamp[0] && props.adultMassKg <= sp.bodyMassKg.clamp[1], p.id);
    assert.deepEqual(Object.keys(props.attributes).sort(), Object.keys(sp.attributesBase).sort(), p.id);
    for (const [k, v] of Object.entries(props.attributes)) assert.ok(v >= sp.attributesBase[k].clamp[0] && v <= sp.attributesBase[k].clamp[1], `${p.id} ${k}`);
  }
});

test('22 户每户恰一个家长、成员数与名单对得上；家长是本户成员；每人至多一条家户边；明确无户者没有边', () => {
  const { state, out } = world();
  const heads = openHoldingsOfKind(state, HEAD);
  const members = openHoldingsOfKind(state, MEMBER);
  assert.equal(heads.length, 22);
  assert.equal(members.length, 36); // 58 人 − 22 户主
  for (const [house, [head, rest]] of Object.entries(HW)) {
    assert.deepEqual(heads.filter((e) => e.subject === house).map((e) => e.holder), [head], house); // 恰一个家长
    assert.deepEqual(members.filter((e) => e.subject === house).map((e) => e.holder).sort(), [...rest].sort(), house);
    assert.deepEqual(out.households.find((h) => h.household === house), { household: house, head, members: [...rest].sort() }, house);
    const ofHouse = ROSTER.persons.filter((p) => p.household === house).map((p) => p.id).sort(); // 家长在名册里就属于本户
    assert.deepEqual([head, ...rest].sort(), ofHouse, house);
  }
  const holders = [...heads, ...members].map((e) => e.holder);
  assert.equal(new Set(holders).size, holders.length); // 每人至多一条（成员边与户主边互斥）
  for (const id of NO_HOUSEHOLD) assert.ok(!holders.includes(id), id);
  assert.deepEqual(out.households.map((h) => h.household), Object.keys(HW)); // 户升序
});

test('确定、可复现：同种子同输入逐字相同；名册次序打乱不改结果（A18-2.2 末句）', () => {
  const a = world();
  const b = world();
  assert.deepEqual(a.state.created, b.state.created);
  assert.deepEqual(a.state.holdings, b.state.holdings);
  const c = world({ persons: [...ROSTER.persons].reverse() });
  assert.deepEqual(c.out.households, a.out.households);
  assert.deepEqual(openHoldingsOfKind(c.state, HEAD).map((e) => [e.holder, e.subject]), openHoldingsOfKind(a.state, HEAD).map((e) => [e.holder, e.subject]));
});

test('九栋私宅：驻地是该栋的家户行，其成员就是住在那一栋的人（开局持有卡把栋归这些户，归属本身见 tests/cloud/opening-holdings-hw.test.mjs）', () => {
  const { state } = world();
  const edges = [...openHoldingsOfKind(state, HEAD), ...openHoldingsOfKind(state, MEMBER)];
  const orgs = W.tables.get('org').flat.rows;
  assert.equal(Object.keys(DWELLING).length, 9);
  for (const [building, house] of Object.entries(DWELLING)) {
    assert.equal(orgs.get(house).seat, building, building);
    const [head, rest] = HW[house];
    assert.deepEqual(edges.filter((e) => e.subject === house).map((e) => e.holder).sort(), [head, ...rest].sort(), building);
  }
});

test('R18-2.9 全序取第一位：先 birthMinute 早者，相同再比 id 字典序，与输入次序无关', () => {
  assert.equal(firstInFullOrder([{ id: 'npc_b', birthMinute: -100 }, { id: 'npc_a', birthMinute: -50 }]), 'npc_b');
  assert.equal(firstInFullOrder([{ id: 'npc_b', birthMinute: -100 }, { id: 'npc_a', birthMinute: -100 }, { id: 'npc_c', birthMinute: -100 }]), 'npc_a');
  assert.equal(firstInFullOrder([{ id: 'npc_c', birthMinute: -100 }, { id: 'npc_a', birthMinute: -100 }, { id: 'npc_b', birthMinute: -100 }]), 'npc_a');
  assert.throws(() => firstInFullOrder([]), /non-empty/);
});

test('特殊值拒收：不是组织行的户、不是家户的组织、缺键或多键的名册行、非数字年龄；失败整笔回滚、不留半个世界', () => {
  const row = ROSTER.persons.find((p) => p.id === 'npc_hw_linsui');
  const rejects = (over, drop) => {
    const bad = { ...row, ...over };
    if (drop) delete bad[drop];
    const { state, r } = world({ persons: [bad] });
    assert.equal(r.ok, false, JSON.stringify(over));
    assert.equal(state.created, undefined);
    assert.equal(state.holdings, undefined);
  };
  rejects({ household: 'org_house_hw_nope' }); // 不是 org 行
  rejects({ household: '' }); // 空串
  rejects({ household: 'org_village_hw' }); // 是组织行但不是家户（orgTraits.domestic 假）
  rejects({ ageYears: -1 });
  rejects({ ageYears: '34' });
  rejects({ ageYears: null });
  rejects({ extra: 1 }); // 多键
  rejects({}, 'household'); // 缺键
  rejects({}, 'species');
  rejects({ species: 'species_nope' });
  rejects({ sex: 'sex_none' }); // 物种 sexes 里值为 null 的键不是合法性别
  assert.equal(world({ persons: [row, { ...row }] }).r.ok, false); // 同一个 id 两行
  assert.equal(world({}).r.ok, false); // 名册不是 {persons: [...]}
});

test('空名册：不建人、不写边，不是错误', () => {
  const { state, r, out } = world({ persons: [] });
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(out, { people: [], households: [] });
  assert.equal(state.created, undefined);
});

test('规则表缺家户边种类键即拒（E-RULES-UNREGISTERED），不回落任何默认', () => {
  const gen = { ...W.rules.gen };
  delete gen.householdHeadKind;
  const saved = ENGINE.rules;
  ENGINE.rules = { ...saved, gen };
  try {
    const { r } = world();
    assert.equal(r.ok, false);
  } finally { ENGINE.rules = saved; }
});
