// 卷八 R8-18.9 开局政体、持有与职位阶段（生成器 server-plugin/kernel/gen/polity.mjs）：① 政体、② 聚落与层级、③ 统治边与 originSite（封卷后勘误 1123k32）、手写优先、同种子同结果、输入缺口。
// 生成器是纯函数：输入（政区与站点、落位文化、站点类型条目、开局人数、规则表、模板与职位种类行）全由本测试造，期望值按卷文规则手算成字面量；id 的形状取 instanceIdOf（卷十 R10-12.1）同一函数。
// 站点类型条目、落位文化、开局人数在真实世界里还没有生产者（卷五 §4.6、卷十 R10-4.2、R10-3.3），所以最后一条验"缺输入整段进 deferred 并列缺口，不编"。只跑不推进世界的小检查（本机 F 盘）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { genPolity } from '../../server-plugin/kernel/gen/polity.mjs';
import { instanceIdOf } from '../../server-plugin/kernel/gen/ids.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });

const SEED = 'seed_one';
const STAGE = 'gstage_polity';
const slot = (kind, parentKinds) => ({ kind, parentKinds, clocked: false });
const entries = {
  idslot_realm: slot('org', ['place']), idslot_settlement: slot('org', ['place']), idslot_genoffice: slot('office', ['org']),
};
const orgkind = (sovereign, template) => ({ family: 'orgkind', prefix: 'orgkind_', entry: { sovereign, settlement: !sovereign, internal: false, template } });
const tier = (order, grantsOffices) => ({ family: 'settletier', prefix: 'settletier_', entry: { order, requiresRX: '1 == 1', grantsOffices, modifiers: [] } });
const VOCAB = {
  families: new Map([['idslot', { entries, prefix: 'idslot_' }]]),
  index: new Map([
    ['idslot_realm', { family: 'idslot', prefix: 'idslot_', entry: entries.idslot_realm }],
    ['idslot_settlement', { family: 'idslot', prefix: 'idslot_', entry: entries.idslot_settlement }],
    ['idslot_genoffice', { family: 'idslot', prefix: 'idslot_', entry: entries.idslot_genoffice }],
    ['orgkind_state', orgkind(true, 'class_org_state')],
    ['orgkind_village', orgkind(false, 'class_org_village')],
    ['settletier_hamlet', tier(1, [])],
    ['settletier_village', tier(2, ['office_k_reeve'])],
    ['settletier_town', tier(2, [])], // 与 village 同 order，用来验并列取代号最小
  ]),
};

// 地点树：world → reg_a、reg_b、reg_c（落位级政区，层级 lvl_c）；reg_a 之下站点 site_a1、site_a2，其下 mill_p 是改挂到政区下、作者字段 originSite 指回 site_a1 的地点；reg_b 之下 site_b1；reg_c 之下没有站点。
const row = (id, parent, regionLevel, dims = {}) => [id, { id, parent, regionLevel, kind: 'x', classes: new Set(), flowing: false, dims }];
const ROWS = new Map([
  row('world', null, 'lvl_w'),
  row('reg_a', 'world', 'lvl_c'), row('reg_b', 'world', 'lvl_c'), row('reg_c', 'world', 'lvl_c'),
  row('site_a1', 'reg_a', null), row('site_a2', 'reg_a', null), row('mill_p', 'reg_a', null, { originSite: 'site_a1' }),
  row('site_b1', 'reg_b', null),
]);
const SITES = new Map([
  ['site_a1', { rank: 2, dims: {} }], ['site_a2', { rank: 3, dims: {} }], ['site_b1', { rank: 1, dims: {} }],
]);
const POP = { site_a1: 150, site_a2: 10, site_b1: 500 };
// whenRX 求值器：测试里 whenRX 文本只是三个标签，按标签读 dims（真实世界由 gen/when.mjs 编译 RX 求值）。
const WHEN = {
  realm_x: (d) => d.cultureTag === 'x',
  pop_lt_100: (d) => d.sitePop < 100,
  pop_ge_20: (d) => d.sitePop >= 20,
};
const base = (over = {}) => ({
  stage: STAGE, worldSeed: SEED, genesisMinute: 0, vocab: VOCAB, rows: ROWS,
  polityRules: {
    genRealmRows: [{ whenRX: 'realm_x', orgKind: 'orgkind_state', polity: 'polity_p' }],
    genSettlementKind: 'orgkind_village',
    genOpenTiers: [{ tier: 'settletier_hamlet', whenRX: 'pop_lt_100' }, { tier: 'settletier_village', whenRX: 'pop_ge_20' }],
    genHoldCause: 'verb_grant',
    genIdSlots: { realm: 'idslot_realm', settlement: 'idslot_settlement', office: 'idslot_genoffice' },
  },
  officeActualKind: 'orowk_actual',
  classRows: new Map([
    ['class_org_state', { abstract: true, orgKind: 'orgkind_state', charter: '1 == 1', covert: false, termination: { mode: 'liquidate' }, basis: 'x' }],
    ['class_org_village', { abstract: true, orgKind: 'orgkind_village', charter: '1 == 1', covert: false, tenure: 'tenure_common', termination: { mode: 'liquidate' }, basis: 'x' }],
  ]),
  cultureLevel: 'lvl_c',
  seatCultureOf: (r) => ({ reg_a: 'cult_x', reg_b: null, reg_c: 'cult_x' }[r] ?? null),
  cultureDimsOf: () => ({ cultureTag: 'x' }),
  siteOf: (id) => SITES.get(id) ?? null,
  sitePopOf: (id) => POP[id],
  orgRows: new Map(), polityRows: new Map([['polity_p', { councilOffices: ['office_k_head', 'office_k_clerk'] }]]),
  officeRows: new Map([
    ['office_k_head', { rank: 5, powers: ['p'], titular: true, revoked: true, officeKind: null, domain: 'x', holder: 'ignored' }],
    ['office_k_clerk', { rank: 1, powers: [], titular: false, revoked: false, officeKind: null, domain: null }],
    ['office_k_reeve', { rank: 2, powers: [], titular: false, revoked: false, officeKind: null, domain: null }],
  ]),
  orgDims: { orgKind: {}, charter: {}, covert: {}, tenure: {}, offices: {}, seat: {}, parent: {}, polity: {}, headOffice: {}, treasury: {}, tier: {} }, officeDims: { rank: {}, powers: {}, titular: {}, revoked: {}, officeKind: {}, domain: {}, officeRowKind: {}, jurisdictionLevel: {}, holder: { derived: 'x' } },
  orgIdPrefix: 'org_', officeIdPrefix: 'office_',
  treasury: ['purpose_general'], heldBy: new Map(),
  when: (text, dims) => WHEN[text](dims),
  ...over,
});
const idOf = (s, parent, n, prefix) => instanceIdOf(VOCAB, SEED, 0, s, parent, n, prefix);
const byId = (r) => Object.fromEntries(r.proposals.map((p) => [p.id, p]));
const REALM_A = idOf('idslot_realm', 'reg_a', 0, 'org_');
const SET = (s) => idOf('idslot_settlement', s, 0, 'org_');

test('R8-18.9 ①：有落位文化、其下有站点且有 realmRows 真行的政区各建一条主权组织行；没有落位文化（reg_b）、没有站点（reg_c）的不建；个数 = 三项都成立的政区数', () => {
  const r = genPolity(base());
  assert.deepEqual(r.deferred, []);
  const sovereign = r.proposals.filter((p) => p.table === 'org' && p.dims.parent === null && p.dims.polity !== null);
  assert.deepEqual(sovereign.map((p) => p.id), [REALM_A]);
  const realm = byId(r)[REALM_A];
  assert.equal(realm.dims.orgKind, 'orgkind_state');
  assert.equal(realm.dims.polity, 'polity_p');
  assert.equal(realm.by, STAGE);
});

test('R8-18.9 ①：seat 取该政区之下站点类型条目 rank 最大的站点（site_a2，rank 3 > 2），并列取 id 最小', () => {
  assert.equal(byId(genPolity(base()))[REALM_A].dims.seat, 'site_a2');
  const tie = new Map(SITES);
  tie.set('site_a2', { rank: 2, dims: {} }); // 与 site_a1 并列 rank 2：取 id 最小 site_a1
  assert.equal(byId(genPolity(base({ siteOf: (id) => tie.get(id) ?? null })))[REALM_A].dims.seat, 'site_a1');
});

test('R8-18.9 ①：主权组织按 R8-3.3 建 councilOffices 所列各种类的职位行，序号取各种类行按 id 升序的位次（clerk=0、head=1）；职位行按 §2.2 表后取种类行的值，titular、revoked 取假，domain 取 null，officeKind 指种类行，派生列不抄', () => {
  const r = genPolity(base());
  const clerk = idOf('idslot_genoffice', REALM_A, 0, 'office_');
  const head = idOf('idslot_genoffice', REALM_A, 1, 'office_');
  assert.deepEqual(byId(genPolity(base()))[REALM_A].dims.offices, [clerk, head]);
  const o = byId(r);
  assert.equal(o[clerk].dims.officeKind, 'office_k_clerk');
  assert.equal(o[head].dims.officeKind, 'office_k_head');
  assert.equal(o[head].dims.rank, 5);
  assert.deepEqual([o[head].dims.titular, o[head].dims.revoked, o[head].dims.domain, o[head].dims.officeRowKind], [false, false, null, 'orowk_actual']);
  assert.equal(Object.hasOwn(o[head].dims, 'holder'), false);
});

test('R8-18.9 ②：R 之下每个站点各建一条聚落组织行（orgKind 取 settlementKind、seat 为该站点），parent 取 ① 的主权组织；没有主权组织的政区（reg_b）parent 写 null', () => {
  const r = genPolity(base());
  const o = byId(r);
  for (const s of ['site_a1', 'site_a2']) {
    assert.equal(o[SET(s)].dims.orgKind, 'orgkind_village');
    assert.equal(o[SET(s)].dims.seat, s);
    assert.equal(o[SET(s)].dims.parent, REALM_A);
    assert.equal(o[SET(s)].dims.polity, null);
  }
  assert.equal(o[SET('site_b1')].dims.parent, null);
  assert.equal(r.proposals.filter((p) => p.table === 'org').length, 4); // realm_a + 三个站点
});

test('R8-18.9 ②：tier 取 openTiers 里 whenRX 为真的各行所指层级中 order 最大者：150 人 → village；10 人 → hamlet；无一行为真则不写 tier', () => {
  const o = byId(genPolity(base()));
  assert.equal(o[SET('site_a1')].dims.tier, 'settletier_village');
  assert.equal(o[SET('site_a2')].dims.tier, 'settletier_hamlet');
  const none = byId(genPolity(base({ sitePopOf: () => 5000, polityRules: { ...base().polityRules, genOpenTiers: [{ tier: 'settletier_hamlet', whenRX: 'pop_lt_100' }] } })));
  assert.equal(Object.hasOwn(none[SET('site_a1')].dims, 'tier'), false);
});

test('R8-18.9 ②：order 并列取代号最小（town 与 village 同为 2，取 settletier_town）；该层级 grantsOffices 为空则不建职位行', () => {
  const rules = { ...base().polityRules, genOpenTiers: [{ tier: 'settletier_village', whenRX: 'pop_ge_20' }, { tier: 'settletier_town', whenRX: 'pop_ge_20' }] };
  const o = byId(genPolity(base({ polityRules: rules })));
  assert.equal(o[SET('site_a1')].dims.tier, 'settletier_town');
  assert.deepEqual(o[SET('site_a1')].dims.offices, []);
});

test('R8-18.9 ②：层级定下后按 grantsOffices 建职位行（village 授 reeve）：site_a1 有一条职位行，序号 0，officeKind 指 reeve；hamlet 的 site_a2 没有', () => {
  const o = byId(genPolity(base()));
  const reeve = idOf('idslot_genoffice', SET('site_a1'), 0, 'office_');
  assert.deepEqual(o[SET('site_a1')].dims.offices, [reeve]);
  assert.equal(o[reeve].dims.officeKind, 'office_k_reeve');
  assert.deepEqual(o[SET('site_a2')].dims.offices, []);
});

test('R8-18.9 ⑤：组织行取种类条目 template 所指模板行的值（整值：charter、covert、tenure，不抄 abstract、basis、termination 这些非维度键）并挂 classes；公库分区取规则表给的缺省分区；不写任职边、不写 priceRule', () => {
  const o = byId(genPolity(base()));
  assert.deepEqual([o[REALM_A].dims.charter, o[REALM_A].dims.covert, Object.hasOwn(o[REALM_A].dims, 'tenure')], ['1 == 1', false, false]);
  assert.equal(o[SET('site_a1')].dims.tenure, 'tenure_common');
  for (const k of ['abstract', 'basis', 'termination']) assert.equal(Object.hasOwn(o[SET('site_a1')].dims, k), false);
  assert.deepEqual(o[REALM_A].dims.classes, ['class_org_state']);
  assert.deepEqual(o[SET('site_a1')].dims.classes, ['class_org_village']);
  assert.deepEqual(o[SET('site_a1')].dims.treasury, ['purpose_general']);
  assert.equal(Object.hasOwn(o[SET('site_a1')].dims, 'priceRule'), false);
});

test('R8-18.9 ⑤：id 由 instanceIdOf 给——主权组织以政区为父、聚落组织以站点为父，序号都取 0；来源标记 seedKey 是 64 位十六进制', () => {
  const r = genPolity(base());
  const ids = r.proposals.filter((p) => p.table === 'org').map((p) => p.id).sort();
  assert.deepEqual(ids, [REALM_A, SET('site_a1'), SET('site_a2'), SET('site_b1')].sort());
  for (const p of r.proposals) assert.match(p.seedKey, /^[0-9a-f]{64}$/);
});

test('R8-18.9 ③：对 ② 的每个站点交一份 setGovernor（原因取 holdCause，不是强取原因）；再对写了 originSite 的地点（mill_p）连到原站点的聚落组织；次序站点 id 升序后接 originSite 行', () => {
  const r = genPolity(base());
  assert.deepEqual(r.calls, [
    { place: 'site_a1', org: SET('site_a1'), cause: 'verb_grant' },
    { place: 'site_a2', org: SET('site_a2'), cause: 'verb_grant' },
    { place: 'site_b1', org: SET('site_b1'), cause: 'verb_grant' },
    { place: 'mill_p', org: SET('site_a1'), cause: 'verb_grant' },
  ]);
});

test('R8-18.9 ③ 手写优先：已有统治边的站点（site_a2）与 originSite 地点（mill_p）都不再交调用提案，其余照旧', () => {
  const hand = (org) => ({ org, cause: 'verb_hand' });
  const r = genPolity(base({ heldBy: new Map([['site_a2', hand('org_hand_a2')], ['mill_p', hand('org_hand_mill')]]) }));
  assert.deepEqual(r.calls.map((c) => c.place), ['site_a1', 'site_b1']);
});

test('R8-18.9 ③ 手写的统治边也被认（Opus 核 G5b 必须改第 1 条）：原站点 site_a1 有作者手写的边（持有组织 org_hand_a1、原因 verb_hand），mill_p 的边取同持有组织、同原因；原站点自己不再交调用', () => {
  const heldBy = new Map([['site_a1', { org: 'org_hand_a1', cause: 'verb_hand' }]]);
  const r = genPolity(base({ heldBy, orgRows: new Map([['org_hand_a1', { orgKind: 'orgkind_village', seat: 'site_a1' }]]) }));
  assert.deepEqual(r.calls.filter((c) => c.place === 'mill_p'), [{ place: 'mill_p', org: 'org_hand_a1', cause: 'verb_hand' }]);
  assert.equal(r.calls.some((c) => c.place === 'site_a1'), false);
});

test('R8-18.9 ③：originSite 所指站点没有被 ② 建聚落组织（该站点已有手写聚落组织）时，originSite 地点不连到它', () => {
  const r = genPolity(base({ orgRows: new Map([['org_hand_a1', { orgKind: 'orgkind_village', seat: 'site_a1' }]]) }));
  assert.equal(r.proposals.some((p) => p.id === SET('site_a1')), false);
  assert.equal(r.calls.some((c) => c.place === 'mill_p'), false);
  assert.equal(r.calls.some((c) => c.place === 'site_a1'), false);
});

test('R10-1.7 手写优先：政区之下已有手写主权组织驻地的不做 ①（reg_a 不再建政体、聚落组织 parent 为 null）；已有手写聚落组织驻地的站点不做 ②', () => {
  const r = genPolity(base({ orgRows: new Map([['org_hand_state', { orgKind: 'orgkind_state', seat: 'site_a1' }]]) }));
  assert.equal(r.proposals.some((p) => p.id === REALM_A), false);
  assert.equal(byId(r)[SET('site_a1')].dims.parent, null);
  const r2 = genPolity(base({ orgRows: new Map([['org_hand_v', { orgKind: 'orgkind_village', seat: 'site_a2' }]]) }));
  assert.equal(r2.proposals.some((p) => p.id === SET('site_a2')), false);
  assert.equal(r2.proposals.some((p) => p.id === SET('site_a1')), true);
});

test('A10-1.2 确定性：同种子两次生成逐位相同；换种子，id 全变', () => {
  const a = JSON.stringify(genPolity(base()));
  assert.equal(a, JSON.stringify(genPolity(base())));
  const other = genPolity(base({ worldSeed: 'seed_two' }));
  const ids = new Set(genPolity(base()).proposals.map((p) => p.id));
  assert.ok(other.proposals.length > 0 && other.proposals.every((p) => !ids.has(p.id)));
});

test('输入缺口不编：落位文化读入口、站点类型读入口、开局人数读入口、层级、holdCause、公库分区缺任一，整阶段进 deferred 并列缺口，不出提案与调用', () => {
  const r = genPolity(base({ seatCultureOf: undefined, siteOf: undefined, sitePopOf: undefined, cultureLevel: undefined, treasury: [], polityRules: { ...base().polityRules, genHoldCause: undefined } }));
  assert.deepEqual(r.proposals, []);
  assert.deepEqual(r.calls, []);
  assert.deepEqual(r.deferred, [{ id: STAGE, reason: 'inputs_unbuilt_for_polity', gaps: ['input_gen_pop_cultureLevel', 'input_seat_culture_reader', 'input_site_type_reader', 'input_site_pop_reader', 'input_rules_gen_holdCause', 'input_rules_roles_purposes_general'] }]);
});

test('M3 realmRows、openTiers 未建（没有这两项规则表值）时记缺口、整阶段不出行提案，不顶成空表；写了空表（作者明确没有）不记缺口', () => {
  const r = genPolity(base({ polityRules: { ...base().polityRules, genRealmRows: undefined, genOpenTiers: undefined } }));
  assert.deepEqual(r.proposals, []);
  assert.deepEqual(r.deferred[0].gaps, ['input_rules_gen_realmRows', 'input_rules_gen_openTiers']);
  assert.deepEqual(genPolity(base({ polityRules: { ...base().polityRules, genRealmRows: [], genOpenTiers: [] } })).deferred, []);
});

test('输入缺口时 originSite 连边照做（它只读作者写的边与地点行，不缺输入）：作者手写了 site_a1 的边，缺输入的整阶段仍不建行，但 mill_p 连到该边的持有组织', () => {
  const heldBy = new Map([['site_a1', { org: 'org_hand_a1', cause: 'verb_hand' }]]);
  const r = genPolity(base({ heldBy, seatCultureOf: undefined }));
  assert.deepEqual(r.proposals, []);
  assert.deepEqual(r.calls, [{ place: 'mill_p', org: 'org_hand_a1', cause: 'verb_hand' }]);
  assert.equal(r.deferred.length, 1);
});
