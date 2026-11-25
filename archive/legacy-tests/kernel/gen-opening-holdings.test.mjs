// 开局建筑归属生成器与入账应用器（server-plugin/kernel/gen/holdings-open.mjs、assetcalls.mjs；卷十 R10-3.9、R10-7.2 ④，卷六 §4.1 规则 5 :370、规则 11 :642、§4.18 规则 2 :1078、§4.22 规则 3；李白 11-24 H-1）。
// 生成器是纯函数：输入全由本测试造，期望值按下面的规则手算成字面量；入账走账本的限额通道结算入口 settleCappedAllocation，用真实世界加载结果（真实资源种类行、词表、规则表）。
// 规则：① 作者 owner 能指到组织、人物（或有统治组织的地点）就照作者，指不到不采用并列 ignoredOwner；② 住处归驻地就是这栋的家户（恰一户），不经聚落组织（H-1：聚合体不持有资产）；
// ③ 其余建筑沿包含树向上取第一个有聚落组织的站点，读该组织 tenure：公有 → 该组织、归上级 → 上级组织、归户 → 缺口（要技能数据）、别的值缺口；没有聚落组织可管辖缺口（分"不在任何站点之下"与"站点之上都没有聚落组织"两类）；输入形状不合拒收。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installVocab } from '../../server-plugin/kernel/vocab.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { balance, auditLedger } from '../../server-plugin/kernel/ledger.mjs';
import { genOpeningAssets, GAP, VIA } from '../../server-plugin/kernel/gen/holdings-open.mjs';
import { applyOpeningAssets, openingAssetChannel } from '../../server-plugin/kernel/gen/assetcalls.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { ROOT } from './polity-world.mjs';

// 夹具世界：reg_r 之下五个站点——vil_v（聚落组织 org_vil，公有）、town_t（org_town，归户）、sup_s（org_sub，归上级，上级 org_up）、sup_n（org_sub2，归上级但没有上级）、odd_o（org_odd，保有方式不在三项里）；
// wild_w 是站点但没有聚落组织；free_f 不是站点（它之上也没有站点）；建筑挂在各处之下。
const MODES = { common: 't_common', household: 't_house', superior: 't_super' };
const PARENT = {
  b_v1: 'vil_v', b_v2: 'vil_v', b_vhome: 'vil_v', b_dup: 'vil_v', b_none: 'vil_v', b_t1: 'town_t', b_s1: 'sup_s', b_s2: 'sup_n', b_o1: 'odd_o', b_w1: 'wild_w', b_whome: 'wild_w', b_n1: 'free_f',
  vil_v: 'reg_r', town_t: 'reg_r', sup_s: 'reg_r', sup_n: 'reg_r', odd_o: 'reg_r', wild_w: 'reg_r', free_f: 'reg_r', reg_r: null,
};
const SITES = ['vil_v', 'town_t', 'sup_s', 'sup_n', 'odd_o', 'wild_w'];
const ORG_AT = { vil_v: 'org_vil', town_t: 'org_town', sup_s: 'org_sub', sup_n: 'org_sub2', odd_o: 'org_odd' };
const TENURE = { org_vil: 't_common', org_town: 't_house', org_sub: 't_super', org_sub2: 't_super', org_odd: 't_weird' };
const PARENT_ORG = { org_sub: 'org_up' };
const HOMES = { b_vhome: ['org_h1'], b_dup: ['org_h3', 'org_h2'], b_whome: ['org_h4'] };
const KINDS = { loc_a: 'place', loc_wild: 'place', org_x: 'org', org_y: 'org', npc_p: 'person', fac_z: 'faction', org_vil: 'org', org_town: 'org', org_sub: 'org', org_sub2: 'org', org_odd: 'org', org_up: 'org', god_g: 'deity' };
const GOV = { loc_a: 'org_x' };
const chain = (id) => { const out = []; for (let c = id; c !== null && c !== undefined; c = PARENT[c]) out.push(c); return out; };
const gen = (buildings, over = {}) => genOpeningAssets({
  buildings, dwellingType: 'ty_home', tenureModes: MODES, placeKind: 'place', kindOf: (id) => KINDS[id] ?? null, holderKinds: ['org', 'person'],
  governorOf: (p) => GOV[p] ?? null, placeChain: chain, isSite: (p) => SITES.includes(p), settlementOrgAt: (p) => ORG_AT[p] ?? null,
  tenureOf: (o) => TENURE[o] ?? null, parentOrgOf: (o) => PARENT_ORG[o] ?? null, householdsAt: (p) => HOMES[p] ?? [], ...over,
});
const home = (id) => ({ id, intendedType: 'ty_home' });

test('① 作者覆盖：owner 是地点取统治组织、是组织或人物取它自己；派系、不是持有种类的实体、不存在的 id、无统治组织的地点：作者值不采用并列 ignoredOwner（这些建筑不在夹具包含树里，落成缺口）', () => {
  const r = gen([
    { id: 'x1', owner: 'loc_a' }, { id: 'x2', owner: 'org_y' }, { id: 'x3', owner: 'npc_p' },
    { id: 'x4', owner: 'fac_z' }, { id: 'x5', owner: 'god_g' }, { id: 'x6', owner: 'nobody_q' }, { id: 'x7', owner: 'loc_wild' },
  ]);
  assert.deepEqual(r.entries, [
    { building: 'x1', owner: 'org_x', via: VIA.authorPlaceGovernor },
    { building: 'x2', owner: 'org_y', via: VIA.author },
    { building: 'x3', owner: 'npc_p', via: VIA.author },
  ]);
  assert.deepEqual(r.gaps.map((g) => [g.building, g.reason, g.ignoredOwner]), [
    ['x4', GAP.noSiteAbove, 'fac_z'], ['x5', GAP.noSiteAbove, 'god_g'], ['x6', GAP.noSiteAbove, 'nobody_q'], ['x7', GAP.noSiteAbove, 'loc_wild'],
  ]);
});

test('① 作者值不采用时落到 ③：站点 vil_v 下 b_v1（owner 是派系）取公有 org_vil 并列出 ignoredOwner；没写 owner 的 b_v2 同取 org_vil、不带 ignoredOwner', () => {
  const r = gen([{ id: 'b_v1', owner: 'fac_z' }, { id: 'b_v2' }]);
  assert.deepEqual(r.entries, [
    { building: 'b_v1', owner: 'org_vil', via: VIA.tenureCommon, ignoredOwner: 'fac_z' },
    { building: 'b_v2', owner: 'org_vil', via: VIA.tenureCommon },
  ]);
});

test('③ tenure：公有 → 聚落组织；归上级 → 上级组织 org_up；归户 → 缺口（卷六 :642 要有效技能最高的家户，技能数据未建，不再退回聚合体）', () => {
  const r = gen([{ id: 'b_v2' }, { id: 'b_t1' }, { id: 'b_s1' }]);
  assert.deepEqual(r.entries, [
    { building: 'b_s1', owner: 'org_up', via: VIA.tenureSuperior },
    { building: 'b_v2', owner: 'org_vil', via: VIA.tenureCommon },
  ]);
  assert.deepEqual(r.gaps, [{ building: 'b_t1', reason: GAP.tenureHousehold, candidates: ['org_town'] }]);
});

test('③ 缺口：归上级但无上级组织、保有方式不在三项里、站点之上都没有聚落组织（wild_w 是站点）、不在任何站点之下（free_f 不是站点，卷六 :642 要按 reachOf 退回，reachOf 未建）；没有站点判定输入时后两类并成前者', () => {
  const r = gen([{ id: 'b_s2' }, { id: 'b_o1' }, { id: 'b_w1' }, { id: 'b_n1' }]);
  assert.deepEqual(r.entries, []);
  assert.deepEqual(r.gaps, [
    { building: 'b_n1', reason: GAP.noSiteAbove, candidates: [] },
    { building: 'b_o1', reason: GAP.tenureUnknown, candidates: ['org_odd'] },
    { building: 'b_s2', reason: GAP.noSuperior, candidates: ['org_sub2'] },
    { building: 'b_w1', reason: GAP.noSettlementOrg, candidates: [] },
  ]);
  assert.deepEqual(gen([{ id: 'b_n1' }], { isSite: undefined }).gaps, [{ building: 'b_n1', reason: GAP.noSettlementOrg, candidates: [] }]);
});

test('② 住处（意图是住处类型）：归驻地就是这栋的家户（恰一户），不看 tenure、不要聚落组织（wild_w 没有聚落组织，b_whome 照样归 org_h4）；零户、两户都记缺口（两户并列候选）；非住处意图的同站点建筑不受影响', () => {
  const r = gen([home('b_vhome'), home('b_whome'), home('b_dup'), home('b_none'), { id: 'b_v1', intendedType: 'ty_shop' }]);
  assert.deepEqual(r.entries, [
    { building: 'b_v1', owner: 'org_vil', via: VIA.tenureCommon },
    { building: 'b_vhome', owner: 'org_h1', via: VIA.dwellingHousehold },
    { building: 'b_whome', owner: 'org_h4', via: VIA.dwellingHousehold },
  ]);
  assert.deepEqual(r.gaps, [
    { building: 'b_dup', reason: GAP.householdAmbiguous, candidates: ['org_h2', 'org_h3'] },
    { building: 'b_none', reason: GAP.noHousehold, candidates: [] },
  ]);
});

test('特殊值拒收不绕过：空串 owner、非字串 owner、意图不是字串、重复建筑 id、空 id、空的持有种类集合、空 placeKind、没有住处意图、保有方式代号不全都抛错，不静默当空处理', () => {
  assert.throws(() => gen([{ id: 'b_v1', owner: '' }]), TypeError);
  assert.throws(() => gen([{ id: 'b_v1', owner: 7 }]), TypeError);
  assert.throws(() => gen([{ id: 'b_v1', intendedType: 3 }]), TypeError);
  assert.throws(() => gen([{ id: 'b_v1' }, { id: 'b_v1' }]), TypeError);
  assert.throws(() => gen([{ id: '' }]), TypeError);
  assert.throws(() => gen([{ id: 'b_v1' }], { holderKinds: [] }), TypeError);
  assert.throws(() => gen([{ id: 'b_v1' }], { placeKind: '' }), TypeError);
  assert.throws(() => gen([{ id: 'b_v1' }], { dwellingType: undefined }), TypeError);
  assert.throws(() => gen([{ id: 'b_v1' }], { dwellingType: '' }), TypeError);
  assert.throws(() => gen([{ id: 'b_v1' }], { tenureModes: { common: 'a', household: 'b' } }), TypeError);
});

test('结果与输入次序无关（按建筑 id 升序），同输入同结果', () => {
  const rows = [{ id: 'b_v2' }, home('b_vhome'), { id: 'b_w1' }];
  assert.deepEqual(gen(rows), gen([...rows].reverse()));
  assert.deepEqual(gen(rows).entries.map((e) => e.building), ['b_v2', 'b_vhome']);
});

// ---------- 入账（真实世界的资源种类行、词表、规则表；持有人加几个测试实体） ----------

const W = loadWorld(ROOT);
assert.equal(W.ok, true, W.text);
installVocab({ vocab: W.vocab, idIndex: new Map([...W.idIndex, ['npc_a', 'person'], ['npc_b', 'person']]), tables: W.tables });
const ENGINE = { vocab: W.vocab, rules: W.rules, units: W.env.units, tables: W.tables };
const CTX = { node: 'test_opening_assets', file: 'tests/kernel/gen-opening-holdings.test.mjs' };
const KIND = 'res_building_share';
const key = (k) => ({ kind: KIND, key: k });
const at = (day) => ({ clock: { minute: day * 1440, seq: 0 } });

test('入账口径全从规则表与词表派生：资源种类是资源表里唯一的建筑资产族行，来源是它的唯一限额通道，用途与原因取 rules.polity，满额是 kernelConstants.BPS', () => {
  assert.deepEqual(openingAssetChannel(ENGINE), { kind: 'res_building_share', source: 'src_genesis', purpose: 'purpose_general', reason: 'verb_opening', fullBp: 10000 });
});

test('开局入账：每栋一万基点记到各自 owner 名下（组织与人物都行）；src_genesis 累计 = 栋数 × 一万；账本守恒审计无违例；没入账的建筑余额为零', () => {
  const state = at(0);
  let r;
  assert.deepEqual(runTransaction(state, CTX, (s) => { r = applyOpeningAssets(ENGINE, s, [{ building: 'bld_t_one', owner: 'org_village_hw' }, { building: 'bld_t_two', owner: 'npc_a' }]); }), { ok: true });
  assert.equal(r.booked, 20000);
  assert.equal(balance(ENGINE, state, 'org_village_hw', key('bld_t_one'), 'purpose_general'), 10000);
  assert.equal(balance(ENGINE, state, 'npc_a', key('bld_t_two'), 'purpose_general'), 10000);
  assert.equal(balance(ENGINE, state, 'npc_a', key('bld_t_one'), 'purpose_general'), 0);
  assert.equal(balance(ENGINE, state, 'org_village_hw', key('bld_t_three'), 'purpose_general'), 0);
  assert.equal(state.ledgerTotals[KIND].src_genesis.cumulative, 20000);
  assert.deepEqual(auditLedger(ENGINE, state), []);
});

test('空提案不入账、不开任何账户；缺口不会进入入账（生成器不把缺口交出）', () => {
  const state = at(0);
  assert.deepEqual(runTransaction(state, CTX, (s) => { assert.deepEqual(applyOpeningAssets(ENGINE, s, []), { booked: 0, written: [] }); }), { ok: true });
  assert.equal(state.accounts, undefined);
  assert.deepEqual(gen([{ id: 'b_w1' }]).entries, []);
});

test('只有第 0 日一次：第 0 日之后（窗口外限额按零计）与同日第二次入账都整笔拒收，不静默吞、不留半截账', () => {
  const late = at(1);
  const lateRes = runTransaction(late, CTX, (s) => { applyOpeningAssets(ENGINE, s, [{ building: 'bld_t_one', owner: 'org_village_hw' }]); });
  assert.equal(lateRes.ok, false);
  assert.equal(late.accounts, undefined);
  const state = at(0);
  assert.deepEqual(runTransaction(state, CTX, (s) => { applyOpeningAssets(ENGINE, s, [{ building: 'bld_t_one', owner: 'org_village_hw' }]); }), { ok: true });
  const again = runTransaction(state, CTX, (s) => { applyOpeningAssets(ENGINE, s, [{ building: 'bld_t_two', owner: 'org_village_hw' }]); });
  assert.equal(again.ok, false);
  assert.equal(balance(ENGINE, state, 'org_village_hw', key('bld_t_two'), 'purpose_general'), 0);
  assert.equal(state.ledgerTotals[KIND].src_genesis.cumulative, 10000);
});

test('持有人不是已载入实体：账本拒收，整笔回滚（前面几栋也不入账）', () => {
  const state = at(0);
  const res = runTransaction(state, CTX, (s) => { applyOpeningAssets(ENGINE, s, [{ building: 'bld_t_one', owner: 'org_village_hw' }, { building: 'bld_t_two', owner: 'org_house_none' }]); });
  assert.equal(res.ok, false);
  assert.equal(balance(ENGINE, state, 'org_village_hw', key('bld_t_one'), 'purpose_general'), 0);
  assert.equal(state.ledgerTotals, undefined);
});
