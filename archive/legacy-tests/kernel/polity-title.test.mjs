// 卷八 §4.5 领地持有权：R8-5.1 实际统治是一条互斥边（governorOf 先取自身的边、没有再沿包含树向上）、R8-5.2 持有资格（holdingAllowed）、R8-5.3 和平取得须有资格（setGovernor 拒写 E-HOLD-INELIGIBLE；
// 强取原因不核资格）；封卷后勘误 1123k32：作者字段 originSite 的地点以自身统治边连回原村，governorOf(P) 先取自身的边，所以不靠空间包含也查回原村。
// 地点树取真实 place 表（loc_bs 之下：河湾村 loc_bs_hebu、其建筑 bld_bs_boat、同级的 loc_bs_liquan），组织行与政体行由夹具写进临时拷贝；期望值按卷文规则手算成字面量。只跑不推进世界的小检查（本机 F 盘）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installVocab } from '../../server-plugin/kernel/vocab.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { installEventLog } from '../../server-plugin/kernel/events.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import { installHoldingEngine, openHolding } from '../../server-plugin/kernel/holdings.mjs';
import { governorOf, holdingAllowed, setGovernor } from '../../server-plugin/kernel/title.mjs';
import { applyGovernorCalls } from '../../server-plugin/kernel/gen/holdcalls.mjs';
import { loadPolityWorld, orgRow, polityRow, SITE, BUILDING, SIBLING, PARENT } from './polity-world.mjs';

useReportSink(() => {});
const CTX = { node: 'test_title', file: 'tests/kernel/polity-title.test.mjs' };
const PEACE = 'verb_grant'; // 和平取得原因（不在 forcibleCauses）
const FORCE = 'verb_conquer'; // 强取原因（在 forcibleCauses）

// 组织：国家 org_realm（政体 polity_open，资格恒真）；村社 org_village（polity 为 null，沿 realm 取国家的政体）；
// 另一国 org_closed（政体 polity_shut，资格恒假）、无地国 org_landless（政体 polity_landless，landless 为真）。
const W = loadPolityWorld({
  org_realm: orgRow('orgkind_state', 'class_org_state', PARENT, null, 'polity_open'),
  org_village: orgRow('orgkind_village', 'class_org_village', SITE, 'org_realm', null),
  org_closed: orgRow('orgkind_state', 'class_org_state', SIBLING, null, 'polity_shut'),
  org_landless: orgRow('orgkind_state', 'class_org_state', SIBLING, null, 'polity_landless'),
}, {
  polity_open: polityRow('1 == 1'),
  polity_shut: polityRow('1 == 2'),
  polity_landless: polityRow('1 == 1', { landless: true }),
});
installVocab({ vocab: W.vocab, idIndex: W.idIndex, tables: W.tables });
const rules = structuredClone(W.rules);
rules.polity = { ...rules.polity, holdForcibleCauses: [FORCE, 'verb_usurp'] };
const ENGINE = { vocab: W.vocab, rules, units: W.env.units, tables: W.tables, template: { seed: 'test_title_seed' } };

let LOG = { entries: [] };
const changes = () => LOG.entries.filter((e) => e.verb === 'verb_governor_changed');
function fresh() {
  installHoldingEngine(ENGINE);
  LOG = { entries: [] };
  installEventLog(LOG);
  return { clock: { minute: 10, seq: 0 } };
}
const run = (state, body) => runTransaction(state, CTX, body);
const set = (state, place, org, cause = PEACE) => assert.deepEqual(run(state, (s) => { setGovernor(ENGINE, s, place, org, cause); }), { ok: true });

test('R8-5.1 governorOf：该地点自身没有统治边、祖先也没有 → 无主（null）', () => {
  assert.equal(governorOf(ENGINE, fresh(), SITE), null);
});

test('R8-5.1 governorOf：取该地点自身的统治边；自身没有则沿包含树向上取最近祖先的统治边（建筑 → 村 → loc_bs）', () => {
  const s = fresh();
  set(s, SITE, 'org_village');
  assert.deepEqual(governorOf(ENGINE, s, SITE), { org: 'org_village', direct: true, eligible: true, subject: SITE });
  // 建筑没有自身的边：取祖先河湾村的边（直接挂在本地点上的才算 direct）
  assert.deepEqual(governorOf(ENGINE, s, BUILDING), { org: 'org_village', direct: false, eligible: true, subject: SITE });
});

test('⑦ governorOf.direct（李白 11-23 b41e0801，卷八 1123k41）：边就挂在被问地点自身上 direct 为真；边是沿包含树从最近祖先继承来的 direct 为假，org 恒是该边的持有组织（两种情形各一例，持有者是下级聚落组织与上级国家各一）', () => {
  const s = fresh();
  set(s, PARENT, 'org_realm');
  assert.deepEqual(governorOf(ENGINE, s, PARENT), { org: 'org_realm', direct: true, eligible: true, subject: PARENT });
  assert.deepEqual(governorOf(ENGINE, s, SIBLING), { org: 'org_realm', direct: false, eligible: true, subject: PARENT });
  set(s, SIBLING, 'org_village');
  assert.deepEqual(governorOf(ENGINE, s, SIBLING), { org: 'org_village', direct: true, eligible: true, subject: SIBLING });
});

test('R8-5.1 governorOf：自身的边先于祖先的边——祖先 loc_bs 归国家、河湾村归村社，问河湾村得村社，问建筑也得村社（最近祖先）；问同级 loc_bs_liquan 得国家', () => {
  const s = fresh();
  set(s, PARENT, 'org_realm');
  set(s, SITE, 'org_village');
  assert.equal(governorOf(ENGINE, s, SITE).org, 'org_village');
  assert.equal(governorOf(ENGINE, s, BUILDING).org, 'org_village');
  assert.equal(governorOf(ENGINE, s, SIBLING).org, 'org_realm');
});

test('originSite（卷八勘误 1123k32）：不在原村包含子树里的地点 P（loc_bs_liquan 当作改挂后的子站点）有自身统治边指向原村社，governorOf(P) 查回原村，不靠空间包含', () => {
  const s = fresh();
  set(s, SITE, 'org_village');
  set(s, SIBLING, 'org_village');
  assert.deepEqual(governorOf(ENGINE, s, SIBLING), { org: 'org_village', direct: true, eligible: true, subject: SIBLING });
});

test('R8-5.1 一处至多一条现役统治边：对同一地点再 setGovernor，旧边让位（governorOf 只给新持有者）', () => {
  const s = fresh();
  set(s, SITE, 'org_village');
  set(s, SITE, 'org_realm');
  assert.equal(governorOf(ENGINE, s, SITE).org, 'org_realm');
});

test('M1 换边的旧边经持有写者"离任"格处置：统治行 vacated 取 ho_revert，授予者为空按关闭；旧边关闭（terms.until 非空）、新边现役，现役统治边恰一条', () => {
  const s = fresh();
  set(s, SITE, 'org_village');
  set(s, SITE, 'org_realm');
  const edges = Object.values(s.holdings).flatMap((h) => Object.values(h)).filter((r) => r.subject === SITE);
  assert.equal(edges.length, 2);
  assert.deepEqual(edges.filter((r) => r.terms.until === null).map((r) => r.holder), ['org_realm']);
});

test('M1 ho_revert 的旧边授予者在世（terms.grantor 指向未终止的组织）时仍整笔拒收 E-ACT-WRITER-NOT-READY，旧边不动', () => {
  const s = fresh();
  assert.deepEqual(run(s, (st) => { openHolding(ENGINE, st, { holdingKind: 'hk_governs', holder: 'org_village', subject: SITE, terms: { grantor: 'org_realm' }, cause: PEACE }); }), { ok: true });
  assert.deepEqual(run(s, (st) => { setGovernor(ENGINE, st, SITE, 'org_realm', PEACE); }), { ok: false, code: 'E-ACT-WRITER-NOT-READY' });
  assert.equal(governorOf(ENGINE, s, SITE).org, 'org_village');
});

test('R8-5.6 统治者变更事件：第一次写边 from 为空、换边 from 为旧持有者，每次恰一条；载荷 {from, to, cause}，targets 取旧新两组织去掉空且升序；同一持有者再写不是更换、不发', () => {
  const s = fresh();
  set(s, SITE, 'org_village');
  assert.equal(changes().length, 1);
  const pick = (e) => ({ from: e.payload.from, to: e.payload.to, cause: e.payload.cause });
  assert.deepEqual(changes().map((e) => e.payload.place), [SITE]); // 公共载荷 place 取统治边的标的地点（卷八 :395）
  assert.deepEqual([pick(changes()[0]), changes()[0].targets], [{ from: null, to: 'org_village', cause: PEACE }, ['org_village']]);
  set(s, SITE, 'org_realm');
  assert.equal(changes().length, 2);
  assert.equal(changes()[1].payload.place, SITE);
  assert.deepEqual([pick(changes()[1]), changes()[1].targets], [{ from: 'org_village', to: 'org_realm', cause: PEACE }, ['org_realm', 'org_village']]);
  set(s, SITE, 'org_realm');
  assert.equal(changes().length, 2);
});

test('R8-5.2 holdingAllowed：政体行 holderEligibility 为真且 landless 为假才允许；组织行 polity 为 null 时沿 realm 取国家的政体行（村社经国家的政体允许）', () => {
  const s = fresh();
  assert.deepEqual(holdingAllowed(ENGINE, s, 'org_realm', SITE), { ok: true, reason: null });
  assert.deepEqual(holdingAllowed(ENGINE, s, 'org_village', SITE), { ok: true, reason: null });
  assert.deepEqual(holdingAllowed(ENGINE, s, 'org_closed', SITE), { ok: false, reason: 'hold_ineligible' });
  assert.deepEqual(holdingAllowed(ENGINE, s, 'org_landless', SITE), { ok: false, reason: 'hold_landless' });
});

test('R8-5.3 setGovernor：和平取得原因下资格不成立即拒写 E-HOLD-INELIGIBLE（资格假与无地政体两种），不留边', () => {
  const s = fresh();
  assert.deepEqual(run(s, (st) => { setGovernor(ENGINE, st, SITE, 'org_closed', PEACE); }), { ok: false, code: 'E-HOLD-INELIGIBLE' });
  assert.deepEqual(run(s, (st) => { setGovernor(ENGINE, st, SITE, 'org_landless', PEACE); }), { ok: false, code: 'E-HOLD-INELIGIBLE' });
  assert.equal(governorOf(ENGINE, s, SITE), null);
});

test('R8-5.3 强取原因（在 forcibleCauses 里）不核资格，统治边照样成立，但 governorOf 的 eligible 是读时现算、得假', () => {
  const s = fresh();
  set(s, SITE, 'org_closed', FORCE);
  assert.deepEqual(governorOf(ENGINE, s, SITE), { org: 'org_closed', direct: true, eligible: false, subject: SITE });
});

test('R8-18.9 ③ 调用提案应用器：资格为真的写统治边，资格不为真的（含无地政体）不写、记入 skipped，该地开局无主', () => {
  const s = fresh();
  const calls = [
    { place: SITE, org: 'org_village', cause: PEACE },
    { place: SIBLING, org: 'org_closed', cause: PEACE },
    { place: PARENT, org: 'org_landless', cause: PEACE },
  ];
  let out;
  assert.deepEqual(run(s, (st) => { out = applyGovernorCalls(ENGINE, st, calls); }), { ok: true });
  assert.deepEqual(out.written.map((w) => [w.place, w.org]), [[SITE, 'org_village']]);
  assert.deepEqual(out.skipped, [
    { place: SIBLING, org: 'org_closed', reason: 'hold_ineligible' },
    { place: PARENT, org: 'org_landless', reason: 'hold_landless' },
  ]);
  assert.equal(governorOf(ENGINE, s, SIBLING), null);
});
