// 试玩地区（河湾村）19 栋建筑的开局归属（李白 11-24 S6-1、H-1；卷六 §4.1 规则 5 :370、规则 11 :642、§4.18 规则 2 :1078、§4.22 规则 3；卷十 R10-3.9、R10-7.2 ④、勘误 1124k20）：
// 开局建筑的所有权份额 = 一笔 src_genesis 资产分录记到 ownerRef 名下，账本是唯一存储，"所有"持有边是只读投影、不另写；资产持有者是家户，不是居民聚合体（H-1）。
// 本文件走生产调用点：generateFill（世界创建的生成流水）里的阶段 gstage_holdings 交出入账提案 assets 与缺口 assetGaps，再由世界创建事务里的 applyOpeningAssets 经账本入账；不直接调生成函数。
// 输入全是真实作者数据与真实世界表：真实 org 表（王国、河湾村村社、河湾村 22 户家户行，家户行由户籍索引 world/people/households.json 物化）、真实 place 表的建筑行（parent）、
// world/geo/start-buildings.json 与 building-classes.json（转换输入：建筑 id 与 intendedType）、world/geo/locations.json 的旧 owner（作者覆盖）、world/design/opening-polity-hw.json 的两条开局统治边；整个世界经真实加载器一遍过。
// 期望值按卷文规则对着作者数据逐栋手列成字面量，不用被测函数算：
//   磨坊、小学堂、铁铺巷公仓：旧 owner 是地点 loc_hw → 作者覆盖取 governorOf(loc_hw) = 河湾村村社；
//   青灯酒馆、村务屋、铁匠铺、药草院、织坊、河湾石坛：没写 owner、不是住处 → 卷六 :642：沿包含树到站点 loc_hw，聚落组织是村社、tenure 归组织公有（卷八 :260）→ 村社；
//   小驿站：旧 owner 是派系 faction_bs_government，没有对应组织行，作者值不采用 → 同上取村社（它的 parent 是 loc_hw，不是白石镇）；
//   住处九栋（意图 fac_house，start-buildings.json）：归驻地就是这栋的家户（H-1、卷十 R10-7.2 ④ 勘误）：home_15–22 归 org_house_hw_15–22，河边小屋归 org_house_hw_03（索引里 house_hw_03 的 homeLocation 是它）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installVocab, kindOf } from '../../server-plugin/kernel/vocab.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { installEventLog } from '../../server-plugin/kernel/events.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import { installHoldingEngine } from '../../server-plugin/kernel/holdings.mjs';
import { balance, auditLedger } from '../../server-plugin/kernel/ledger.mjs';
import { applyGovernorCalls } from '../../server-plugin/kernel/gen/holdcalls.mjs';
import { GAP, VIA } from '../../server-plugin/kernel/gen/holdings-open.mjs';
import { generateFill } from '../../server-plugin/kernel/gen/worldgen.mjs';
import { applyOpeningAssets } from '../../server-plugin/kernel/gen/assetcalls.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { ROOT } from './polity-world.mjs'; // 同时装入摘要常数（installDigestCap）

useReportSink(() => {});
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const OPENING = json('world/design/opening-polity-hw.json');
const LOCATIONS = json('world/geo/locations.json');
const HOUSEHOLDS = json('world/people/households.json');
const START = json('world/geo/start-buildings.json').rows;
const CLASSES = json('world/geo/building-classes.json').rows;

const W = loadWorld(ROOT);
assert.equal(W.ok, true, W.text);
installVocab({ vocab: W.vocab, idIndex: W.idIndex, tables: W.tables });
const ENGINE = { vocab: W.vocab, rules: W.rules, units: W.env.units, tables: W.tables, template: { seed: 'opening_hw_seed' } };
const CTX = { node: 'test_opening_hw', file: 'tests/kernel/opening-holdings-hw.test.mjs' };
const RES = { kind: 'res_building_share', key: '' };
const GENERAL = 'purpose_general';
const VILLAGE = 'org_village_hw';
const PLACES = W.tables.get('place').flat.rows;
const ORGS = W.tables.get('org').flat.rows;

// 转换输入里标明是建筑、且在真实 place 表里有行的建筑 id（G5b 换表前，足迹种类取建筑靠这份清单，rows.mjs buildingIds）。
const BUILDING_IDS = [...new Set([...START.map((r) => r.id), ...CLASSES.map((r) => r.id)])].filter((id) => PLACES.has(id)).sort();
// 旧数据里作者写的建筑 owner（place 表没有这一维，经 genViews.ownerOf 交入作为作者覆盖）。
const OWNER_OF = new Map(LOCATIONS.filter((r) => typeof r.owner === 'string').map((r) => [r.id, r.owner]));
// 阶段 gstage_holdings 的 intendedType 取自行本身：真实 place 表的建筑行还没有（G5b 换表前），由转换输入经 geo.authored 交入。
const AUTHORED = new Map([...CLASSES, ...START].filter((r) => typeof r.intendedType === 'string' && PLACES.has(r.id)).map((r) => [r.id, { intendedType: r.intendedType }]));
const fill = (world = W) => generateFill(world, {
  worldSeed: 'opening_hw_seed', genesisMinute: 0,
  geo: { authored: AUTHORED, downhill: [], buildingIds: BUILDING_IDS },
  genViews: { heldBy: OPENING.governs.map((g) => [g.place, { org: g.org, cause: g.cause }]), ownerOf: (id) => OWNER_OF.get(id) },
});
const governed = () => {
  installHoldingEngine(ENGINE);
  installEventLog({ entries: [] });
  const state = { clock: { minute: 0, seq: 0 } };
  assert.deepEqual(runTransaction(state, CTX, (s) => { assert.equal(applyGovernorCalls(ENGINE, s, OPENING.governs.map((g) => ({ place: g.place, org: g.org, cause: g.cause }))).skipped.length, 0); }), { ok: true });
  return state;
};

const HW19 = [
  'bld_hw_altar', 'bld_hw_council', 'bld_hw_forge', 'bld_hw_grain_annex', 'bld_hw_herbs', 'bld_hw_home_15', 'bld_hw_home_16', 'bld_hw_home_17', 'bld_hw_home_18',
  'bld_hw_home_19', 'bld_hw_home_20', 'bld_hw_home_21', 'bld_hw_home_22', 'bld_hw_mill', 'bld_hw_post', 'bld_hw_qingdeng', 'bld_hw_riverhome', 'bld_hw_school', 'bld_hw_weaving',
];
const EXPECT = [
  { building: 'bld_hw_altar', owner: VILLAGE, via: VIA.tenureCommon },
  { building: 'bld_hw_council', owner: VILLAGE, via: VIA.tenureCommon },
  { building: 'bld_hw_forge', owner: VILLAGE, via: VIA.tenureCommon },
  { building: 'bld_hw_grain_annex', owner: VILLAGE, via: VIA.authorPlaceGovernor },
  { building: 'bld_hw_herbs', owner: VILLAGE, via: VIA.tenureCommon },
  { building: 'bld_hw_home_15', owner: 'org_house_hw_15', via: VIA.dwellingHousehold },
  { building: 'bld_hw_home_16', owner: 'org_house_hw_16', via: VIA.dwellingHousehold },
  { building: 'bld_hw_home_17', owner: 'org_house_hw_17', via: VIA.dwellingHousehold },
  { building: 'bld_hw_home_18', owner: 'org_house_hw_18', via: VIA.dwellingHousehold },
  { building: 'bld_hw_home_19', owner: 'org_house_hw_19', via: VIA.dwellingHousehold },
  { building: 'bld_hw_home_20', owner: 'org_house_hw_20', via: VIA.dwellingHousehold },
  { building: 'bld_hw_home_21', owner: 'org_house_hw_21', via: VIA.dwellingHousehold },
  { building: 'bld_hw_home_22', owner: 'org_house_hw_22', via: VIA.dwellingHousehold },
  { building: 'bld_hw_mill', owner: VILLAGE, via: VIA.authorPlaceGovernor },
  { building: 'bld_hw_post', owner: VILLAGE, via: VIA.tenureCommon, ignoredOwner: 'faction_bs_government' },
  { building: 'bld_hw_qingdeng', owner: VILLAGE, via: VIA.tenureCommon },
  { building: 'bld_hw_riverhome', owner: 'org_house_hw_03', via: VIA.dwellingHousehold },
  { building: 'bld_hw_school', owner: VILLAGE, via: VIA.authorPlaceGovernor },
  { building: 'bld_hw_weaving', owner: VILLAGE, via: VIA.tenureCommon },
];
const inHw = (e) => HW19.includes(e.building);

test('前提：19 栋就是转换输入 start-buildings.json 的全部行，都在真实 place 表里；阶段 gstage_holdings 已登记，排在 gstage_polity 之后', () => {
  assert.deepEqual(START.map((r) => r.id).sort(), [...HW19].sort());
  for (const id of HW19) assert.ok(PLACES.has(id), id);
  const order = fill().plan.map((p) => p.stage);
  assert.ok(order.includes('gstage_holdings'));
  assert.ok(order.indexOf('gstage_holdings') > order.indexOf('gstage_polity'));
});

test('家户行（H-1）：河湾村户籍索引的 22 户各有一条家户组织行（orgkind_household，orgTraits domestic 真），驻地就是索引的 homeLocation，公库取 purpose_general；村社 tenure 公有', () => {
  const index = HOUSEHOLDS.filter((h) => h.settlement === 'loc_hw');
  assert.equal(index.length, 22);
  for (const h of index) {
    const row = ORGS.get(`org_${h.id}`);
    assert.ok(row, h.id);
    assert.deepEqual([row.orgKind, row.seat, row.treasury, row.parent, row.polity], ['orgkind_household', h.homeLocation, ['purpose_general'], null, null], h.id);
  }
  assert.deepEqual([...ORGS.keys()].filter((id) => id.startsWith('org_house_')).length, 22);
  assert.equal(W.rules.social.orgTraits.orgkind_household.domestic, true);
  assert.equal(W.vocab.index.get('orgkind_household').entry.settlement, false);
  assert.equal(ORGS.get(VILLAGE).tenure, 'tenure_common');
});

test('试玩地区 19 栋逐栋（生产调用点 generateFill 交出的 assets）：十栋归河湾村村社、九栋住处归各自家户；无缺口', () => {
  const r = fill();
  assert.deepEqual(r.assets.filter(inHw), EXPECT);
  assert.deepEqual(r.assetGaps.filter((g) => HW19.includes(g.building)), []);
});

test('入账（世界创建事务内，经 applyOpeningAssets）：19 栋各记一万基点到各自持有人名下；src_genesis 累计 = 十九万；账本守恒审计无违例', () => {
  const state = governed();
  const r = fill();
  assert.deepEqual(runTransaction(state, CTX, (s) => { applyOpeningAssets(ENGINE, s, r.assets); }), { ok: true });
  for (const e of EXPECT) assert.equal(balance(ENGINE, state, e.owner, { ...RES, key: e.building }, GENERAL), 10000, e.building);
  assert.equal(balance(ENGINE, state, VILLAGE, { ...RES, key: 'bld_hw_home_15' }, GENERAL), 0); // 住处不在村社名下
  assert.equal(balance(ENGINE, state, 'org_house_hw_15', { ...RES, key: 'bld_hw_mill' }, GENERAL), 0);
  assert.equal(state.ledgerTotals.res_building_share.src_genesis.cumulative, r.assets.length * 10000);
  assert.equal(r.assets.length, 19); // 试玩地区之外的建筑都是缺口（下一条），入账的恰是这 19 栋
  assert.deepEqual(auditLedger(ENGINE, state), []);
});

test('其余建筑（转换输入里有行的、试玩地区之外的建筑）同一条规则：每栋恰进 assets 或 assetGaps 之一；缺口不入账；缺口原因都是登记的代号', () => {
  const state = governed();
  const r = fill();
  const all = [...r.assets.map((e) => e.building), ...r.assetGaps.map((g) => g.building)].sort();
  assert.deepEqual(all, [...BUILDING_IDS]);
  const codes = new Set(Object.values(GAP));
  for (const g of r.assetGaps) assert.ok(codes.has(g.reason), `${g.building}: ${g.reason}`);
  assert.deepEqual(runTransaction(state, CTX, (s) => { applyOpeningAssets(ENGINE, s, r.assets); }), { ok: true });
  for (const g of r.assetGaps) for (const holder of [VILLAGE, 'org_realm_main']) assert.equal(balance(ENGINE, state, holder, { ...RES, key: g.building }, GENERAL), 0, g.building);
  for (const e of r.assets) assert.ok(['org', 'person'].includes(kindOf(e.owner)), e.building);
});

test('家户成员与家长（H-1 家户行先带成员和家长）：户籍索引的成员对应的 person 行真实世界还没有载入，成员边写不了；索引里没有家长字段——两项都是缺口（docs/问题.md），不造人、不编家长', () => {
  const index = HOUSEHOLDS.filter((h) => h.settlement === 'loc_hw');
  const members = index.flatMap((h) => h.members);
  assert.ok(members.length > 0);
  assert.equal(members.filter((m) => W.idIndex.has(m)).length, 0);
  for (const h of index) assert.equal(Object.hasOwn(h, 'head'), false, h.id);
});

test('同输入同结果：两次从头建世界、生成、入账，提案与账本状态逐字节相同', () => {
  const once = () => {
    const state = governed();
    const r = fill();
    assert.deepEqual(runTransaction(state, CTX, (s) => { applyOpeningAssets(ENGINE, s, r.assets); }), { ok: true });
    return JSON.stringify([r.assets, r.assetGaps, state.accounts, state.ledgerTotals]);
  };
  assert.equal(once(), once());
});

test('规则表键（李白 11-24「家户两问1122」①）：住处意图 dwellingIntendedType 登在规则表、值是设施类型表的住宅类（九栋住处的 intendedType 都是它）；缺住处意图键或保有方式键，阶段拒收（E-RULES-UNREGISTERED），不再有交入或推迟的口子', () => {
  assert.equal(W.rules.gen.dwellingIntendedType, 'fac_house');
  assert.deepEqual(START.filter((r) => r.intendedType === W.rules.gen.dwellingIntendedType).map((r) => r.id).sort(), ['bld_hw_home_15', 'bld_hw_home_16', 'bld_hw_home_17', 'bld_hw_home_18', 'bld_hw_home_19', 'bld_hw_home_20', 'bld_hw_home_21', 'bld_hw_home_22', 'bld_hw_riverhome']);
  for (const k of ['dwellingIntendedType', 'tenureModes']) {
    const gen = { ...W.rules.gen };
    delete gen[k];
    assert.throws(() => fill({ ...W, rules: { ...W.rules, gen } }), (e) => e.code === 'E-RULES-UNREGISTERED' && e.message.includes(k));
  }
});
