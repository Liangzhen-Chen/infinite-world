// 块 3 第 3-2 张《post 与批次存储》：post 规则 2、3、5、7、13，transfer 简写，reason 格式与 verb not_run（K3-43），
// 批次存储 stockLots 与批次键（李白 11-18 04:10），拆分带出 costBasis（卷六 §4.2 规则 5 :418）、转移不改 taint（卷三乙 K-4 :1031），
// K-8 一致性审计 auditLots，物理律通道预警派生 alertGaps（李白 11-18 04:20 选 A）。
// 依据卷六 §3.2 :286–288、§4.1 规则 2、3、5、6、7、13（:356、:361、:363、:375、:378、:384）、附 本卷错误码表 :1630–1635；卷三乙 §2.3 :262–280、§3.3 :433–436。
// 期望值一律手写字面量，不用被测函数算。
// 资源种类行、用途分区、持有人按 K3-44 用登记场景：在规则表与注册表的副本里加行（不进 world/），不造测试设施。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installVocab } from '../../server-plugin/kernel/vocab.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { post, transfer, auditLots, auditLedger, alertGaps, openAccount, dayUsage, budgetOn, checkSubjectFlagDims } from '../../server-plugin/kernel/ledger.mjs';
import { registerViewReader, resetViewRegistry } from '../../server-plugin/kernel/view-registry.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = loadWorld(ROOT);
assert.ok(W.ok, W.text);

// 登记场景：用途分区（货架可见、钱袋跟踪流出）、持有人、资源种类行。
const SHELF = { spendable: true, locksFor: null, visibleToMarket: true, trackOutflow: false };
const PURSE = { spendable: true, locksFor: null, visibleToMarket: false, trackOutflow: true };
const vocab = {
  families: W.vocab.families,
  index: new Map([...W.vocab.index,
    ['purpose_test_shelf', { family: 'purpose', prefix: 'purpose_', entry: SHELF }],
    ['purpose_test_purse', { family: 'purpose', prefix: 'purpose_', entry: PURSE }]]),
};
// 测试用 place 表（只登主体标记维度，照卷二 §5.6 :1765 boolean / always / error）：每行显式写 ledgerHolder；loc_bare 故意缺写（加载期由公用行校验拒，
// 这里绕过加载只验 post 读到"不为真"也拒）。bld_kiln 是只当位置用的炉窑行（固定装置所在），item_crate 是容器（物品），fixture_t_hearth 是固定装置代号（非实体）。
const FLAG_DEF = { type: 'boolean', required: 'always', onUnknown: 'error', modifiable: false, source: 'test', owner: 'test' };
const PLACE = {
  doc: { kind: 'place', entity: { idPrefix: ['bld_', 'loc_'], singletonIds: [] }, dimensions: { ledgerHolder: FLAG_DEF } },
  flat: { rows: new Map([['loc_shop', { ledgerHolder: true }], ['loc_square', { ledgerHolder: false }], ['bld_kiln', { ledgerHolder: false }], ['loc_bare', {}]]), classes: new Map() },
};
const tables = new Map([...W.tables, ['place', PLACE]]);
installVocab({ vocab, idIndex: new Map([...W.idIndex, ['npc_a', 'person'], ['org_b', 'org'], ['npc_c', 'person'], ['loc_shop', 'place'], ['loc_square', 'place'], ['bld_kiln', 'place'], ['loc_bare', 'place'], ['item_crate', 'item']]), tables });
const row = (family, transferable, sources, sinks, extra = {}) => ({ family, unit: 'bps', transferable, counterpartRX: null, sources, sinks, issuerBacked: false, ...extra });
const rules = structuredClone(W.rules);
Object.assign(rules.economyResources, {
  res_t_coin: row('resfam_coin', 'tr_free', ['src_genesis', 'src_issue'], ['sink_redeem']),
  res_t_grain: row('resfam_goods', 'tr_free', ['src_regrow'], ['sink_consume', 'sink_transform']),
  res_t_flour: row('resfam_goods', 'tr_free', ['src_transform'], ['sink_consume']),
  res_t_bound: row('resfam_point', 'tr_bound', ['src_issue'], ['sink_redeem']),
  res_t_restr: row('resfam_claim', 'tr_restricted', ['src_issue'], ['sink_redeem']),
  res_t_backed: row('resfam_claim', 'tr_free', ['src_issue'], ['sink_redeem'], { issuerBacked: true }),
});
rules.economyLedger.alert.res_t_grain = { sink_consume: 10 };
// 限额通道格：第 0 日日限额 3（窗口 [0, 0]），用来验 post 不在单笔上按限额拒（卷六 §4.1 规则 6 :376、§2.5 :224）。
rules.economyLedger.budget.res_t_coin = { src_genesis: { limit: 3, activeFromDay: 0, activeToDay: 0 } };
const ENGINE = { vocab, rules, units: W.env.units, tables };

const CTX = { node: 'test_node', file: 'test/ledger-post.test.mjs' };
const SH = 'purpose_test_shelf';
const PU = 'purpose_test_purse';
const acc = (holder, purpose, kind, key) => ({ holder, purpose, resource: key === undefined ? { kind } : { kind, key } });
const run = (state, fn) => runTransaction(state, CTX, fn);
const clone = (v) => JSON.parse(JSON.stringify(v));
// 世界日 day 的状态（clockView：一日 1440 分钟，卷二十 :491）；usedByDay 的日取它。
const at = (day, extra = {}) => ({ clock: { minute: day * 1440, seq: 0 }, ...extra });

// ---------- 规则 2：L − S + K = 0、非负、全成全败 ----------

test('规则 2 正例：凭空产出、纯转移、用掉三种腿型手算通过；来源去处累计入 ledgerTotals（cumulative 与当日 usedByDay）', () => {
  const state = at(2);
  let r;
  assert.deepEqual(run(state, (s) => { r = post(ENGINE, s, { legs: [{ account: acc('npc_a', SH, 'res_t_coin', 'coin_x'), delta: 5 }, { flow: 'src_issue', kind: 'res_t_coin', qty: 5 }], reason: 'verb_test_mint' }); }), { ok: true });
  assert.deepEqual(r, { lots: [], notRun: ['reason_verb'] });
  assert.deepEqual(run(state, (s) => { post(ENGINE, s, { legs: [{ account: acc('npc_a', SH, 'res_t_coin', 'coin_x'), delta: -3 }, { account: acc('org_b', SH, 'res_t_coin', 'coin_x'), delta: 3 }], reason: 'verb_test_pay' }); }), { ok: true });
  assert.deepEqual(run(state, (s) => { post(ENGINE, s, { legs: [{ account: acc('npc_a', SH, 'res_t_coin', 'coin_x'), delta: -2 }, { flow: 'sink_redeem', kind: 'res_t_coin', qty: 2 }], reason: 'verb_test_redeem' }); }), { ok: true });
  assert.deepEqual(state, {
    clock: { minute: 2880, seq: 0 },
    accounts: { npc_a: { purpose_test_shelf: { res_t_coin: { coin_x: 0 } } }, org_b: { purpose_test_shelf: { res_t_coin: { coin_x: 3 } } } },
    ledgerTotals: { res_t_coin: { src_issue: { cumulative: 5, usedByDay: [{ day: 2, used: 5 }] }, sink_redeem: { cumulative: 2, usedByDay: [{ day: 2, used: 2 }] } } },
  });
});

test('规则 2 反例：不平而未带代号 E-LEDGER-CODE-UNREGISTERED；带了仍不平 E-LEDGER-UNBALANCED；余额为负 E-LEDGER-NEGATIVE；整笔不落', () => {
  const state = at(0, { accounts: { npc_a: { purpose_test_shelf: { res_t_coin: { coin_x: 2 } } } } });
  const before = clone(state);
  const p = (legs) => run(state, (s) => { post(ENGINE, s, { legs, reason: 'verb_test' }); });
  assert.deepEqual(p([{ account: acc('npc_a', SH, 'res_t_coin', 'coin_x'), delta: 5 }]), { ok: false, code: 'E-LEDGER-CODE-UNREGISTERED' });
  assert.deepEqual(p([{ account: acc('npc_a', SH, 'res_t_coin', 'coin_x'), delta: 5 }, { flow: 'src_issue', kind: 'res_t_coin', qty: 3 }]), { ok: false, code: 'E-LEDGER-UNBALANCED' });
  assert.deepEqual(p([{ account: acc('npc_a', SH, 'res_t_coin', 'coin_x'), delta: -3 }, { account: acc('org_b', SH, 'res_t_coin', 'coin_x'), delta: 3 }]), { ok: false, code: 'E-LEDGER-NEGATIVE' });
  // 未开的账户出账：余额按 0 起算，同样为负
  assert.deepEqual(p([{ account: acc('npc_c', SH, 'res_t_coin', 'coin_x'), delta: -1 }, { flow: 'sink_redeem', kind: 'res_t_coin', qty: 1 }]), { ok: false, code: 'E-LEDGER-NEGATIVE' });
  assert.deepEqual(state, before);
});

test('全成全败：同一事务里先开户、先过一笔，后一笔被拒（规则层 catch 住也一样），整笔回滚', () => {
  const state = at(0);
  const r = run(state, (s) => {
    openAccount(ENGINE, s, 'org_b', { kind: 'res_t_coin', key: 'coin_x' }, SH);
    post(ENGINE, s, { legs: [{ account: acc('npc_a', SH, 'res_t_coin', 'coin_x'), delta: 4 }, { flow: 'src_issue', kind: 'res_t_coin', qty: 4 }], reason: 'verb_test' });
    try { post(ENGINE, s, { legs: [{ account: acc('npc_a', SH, 'res_t_coin', 'coin_x'), delta: -9 }, { flow: 'sink_redeem', kind: 'res_t_coin', qty: 9 }], reason: 'verb_test' }); } catch { /* 吞掉也不放行 */ }
  });
  assert.deepEqual(r, { ok: false, code: 'E-LEDGER-NEGATIVE' });
  assert.deepEqual(state, { clock: { minute: 0, seq: 0 } });
});

test('post 只在本状态的事务内写', () => {
  assert.throws(() => post(ENGINE, {}, { legs: [{ flow: 'src_issue', kind: 'res_t_coin', qty: 1 }], reason: 'verb_test' }), (e) => e.code === 'E-VIEW-UNDECLARED-WRITE');
});

// ---------- 规则 3：来源去处代号 ----------

test('规则 3：代号不是 src/sink 条目、或不在该种类行 sources/sinks 内 → E-LEDGER-CODE-UNREGISTERED', () => {
  const p = (flow) => run(at(0), (s) => { post(ENGINE, s, { legs: [{ account: acc('npc_a', SH, 'res_t_coin', 'coin_x'), delta: 1 }, { flow, kind: 'res_t_coin', qty: 1 }], reason: 'verb_test' }); });
  assert.deepEqual(p('src_regrow'), { ok: false, code: 'E-LEDGER-CODE-UNREGISTERED' });
  assert.deepEqual(p('purpose_test_shelf'), { ok: false, code: 'E-LEDGER-CODE-UNREGISTERED' });
  assert.deepEqual(p('src_nope'), { ok: false, code: 'E-LEDGER-CODE-UNREGISTERED' });
  // 去处代号记在增量一侧：sink_redeem 是 K，L − S + K = 1 + 1 ≠ 0
  assert.deepEqual(p('sink_redeem'), { ok: false, code: 'E-LEDGER-UNBALANCED' });
  assert.deepEqual(p('src_issue'), { ok: true });
});

// ---------- 规则 5：转换成对 ----------

test('规则 5：src_transform 与 sink_transform 互指，缺一腿 E-LEDGER-PAIR-MISSING；成对即过（两种资源各自平）', () => {
  const state = at(1, { accounts: { npc_a: { purpose_test_shelf: { res_t_grain: { lot_0: 4 } } } }, stockLots: { npc_a: { purpose_test_shelf: { res_t_grain: { lot_0: { taint: 0.5 } } } } }, ledgerCounters: { lotNext: 1 } });
  const before = clone(state);
  const consume = { account: acc('npc_a', SH, 'res_t_grain', 'lot_0'), delta: -4 };
  const toSink = { flow: 'sink_transform', kind: 'res_t_grain', qty: 4 };
  const make = { account: acc('npc_a', SH, 'res_t_flour'), delta: 2, lot: { attrs: { taint: 0.5 } } };
  const fromSrc = { flow: 'src_transform', kind: 'res_t_flour', qty: 2 };
  assert.deepEqual(run(state, (s) => { post(ENGINE, s, { legs: [consume, toSink], reason: 'verb_test_mill' }); }), { ok: false, code: 'E-LEDGER-PAIR-MISSING' });
  assert.deepEqual(run(state, (s) => { post(ENGINE, s, { legs: [make, fromSrc], reason: 'verb_test_mill' }); }), { ok: false, code: 'E-LEDGER-PAIR-MISSING' });
  assert.deepEqual(state, before);
  let r;
  assert.deepEqual(run(state, (s) => { r = post(ENGINE, s, { legs: [consume, toSink, make, fromSrc], reason: 'verb_test_mill' }); }), { ok: true });
  assert.deepEqual(r, { lots: [[2, 'lot_1']], notRun: ['reason_verb'] });
  assert.equal(state.accounts.npc_a.purpose_test_shelf.res_t_grain.lot_0, 0);
  assert.equal(state.accounts.npc_a.purpose_test_shelf.res_t_flour.lot_1, 2);
  assert.deepEqual(state.ledgerTotals, { res_t_grain: { sink_transform: { cumulative: 4, usedByDay: [{ day: 1, used: 4 }] } }, res_t_flour: { src_transform: { cumulative: 2, usedByDay: [{ day: 1, used: 2 }] } } });
});

// ---------- 规则 7：转让限制 ----------

test('规则 7：tr_restricted 而 counterpartRX 空，持有人之间转 E-LEDGER-TRANSFER-RESTRICTED；tr_bound 要读发行者，读不到 E-DIM-UNKNOWN-READ；同一持有人分区之间与 tr_free 照过', () => {
  const state = { accounts: { npc_a: { purpose_test_shelf: { res_t_restr: { k1: 5 }, res_t_bound: { k1: 5 }, res_t_coin: { coin_x: 5 } } } } };
  const mv = (kind, key, toHolder, toPurpose) => run(state, (s) => { post(ENGINE, s, { legs: [{ account: acc('npc_a', SH, kind, key), delta: -1 }, { account: acc(toHolder, toPurpose, kind, key), delta: 1 }], reason: 'verb_test' }); });
  assert.deepEqual(mv('res_t_restr', 'k1', 'org_b', SH), { ok: false, code: 'E-LEDGER-TRANSFER-RESTRICTED' });
  assert.deepEqual(mv('res_t_bound', 'k1', 'org_b', SH), { ok: false, code: 'E-DIM-UNKNOWN-READ' });
  assert.deepEqual(mv('res_t_bound', 'k1', 'npc_a', PU), { ok: true });
  assert.deepEqual(mv('res_t_restr', 'k1', 'npc_a', PU), { ok: true });
  assert.deepEqual(mv('res_t_coin', 'coin_x', 'org_b', SH), { ok: true });
  assert.deepEqual(state.accounts.npc_a, { purpose_test_shelf: { res_t_restr: { k1: 4 }, res_t_bound: { k1: 4 }, res_t_coin: { coin_x: 4 } }, purpose_test_purse: { res_t_bound: { k1: 1 }, res_t_restr: { k1: 1 } } });
});

// ---------- 规则 13：outflowTotals ----------

test('规则 13：trackOutflow 为真的分区每条出账腿累计减少量（转移、去处都算），为假的分区不开键；被拒不加', () => {
  const state = at(0, { accounts: { npc_a: { purpose_test_purse: { res_t_coin: { coin_x: 10 } }, purpose_test_shelf: { res_t_coin: { coin_x: 10 } } } } });
  assert.equal(run(state, (s) => { post(ENGINE, s, { legs: [{ account: acc('npc_a', PU, 'res_t_coin', 'coin_x'), delta: -3 }, { account: acc('org_b', SH, 'res_t_coin', 'coin_x'), delta: 3 }], reason: 'verb_test' }); }).ok, true);
  assert.equal(run(state, (s) => { post(ENGINE, s, { legs: [{ account: acc('npc_a', PU, 'res_t_coin', 'coin_x'), delta: -2 }, { flow: 'sink_redeem', kind: 'res_t_coin', qty: 2 }], reason: 'verb_test' }); }).ok, true);
  assert.equal(run(state, (s) => { post(ENGINE, s, { legs: [{ account: acc('npc_a', SH, 'res_t_coin', 'coin_x'), delta: -4 }, { flow: 'sink_redeem', kind: 'res_t_coin', qty: 4 }], reason: 'verb_test' }); }).ok, true);
  assert.equal(run(state, (s) => { post(ENGINE, s, { legs: [{ account: acc('npc_a', PU, 'res_t_coin', 'coin_x'), delta: -99 }, { flow: 'sink_redeem', kind: 'res_t_coin', qty: 99 }], reason: 'verb_test' }); }).ok, false);
  assert.deepEqual(state.outflowTotals, { npc_a: { purpose_test_purse: { res_t_coin: { coin_x: { cumulative: 5 } } } } });
});

// ---------- reason（K3-43） ----------

test('reason 必填、代号形；是否已登记 verb 块 5 前报 not_run（回执 notRun 列 reason_verb）', () => {
  const legs = [{ account: acc('npc_a', SH, 'res_t_coin', 'coin_x'), delta: 1 }, { flow: 'src_issue', kind: 'res_t_coin', qty: 1 }];
  assert.deepEqual(run(at(0), (s) => { post(ENGINE, s, { legs }); }), { ok: false, code: 'E-DIM-STRUCT-FIELD' });
  assert.deepEqual(run(at(0), (s) => { post(ENGINE, s, { legs, reason: '' }); }), { ok: false, code: 'E-DIM-ID-FORMAT' });
  assert.deepEqual(run(at(0), (s) => { post(ENGINE, s, { legs, reason: 'Verb Pay' }); }), { ok: false, code: 'E-DIM-ID-FORMAT' });
  assert.deepEqual(run(at(0), (s) => { post(ENGINE, s, { legs, reason: 7 }); }), { ok: false, code: 'E-DIM-ID-FORMAT' });
  let r;
  // 格式合法而未登记的代号不拒（verb 族块 5 才有），但不静默：notRun 列出
  assert.deepEqual(run(at(0), (s) => { r = post(ENGINE, s, { legs, reason: 'verb_not_yet_registered' }); }), { ok: true });
  assert.deepEqual(r.notRun, ['reason_verb']);
});

test('notRun：限额通道腿列 budget（日终按比例分配归 3-3）；issuerBacked 行列 issuer_backed（卷六 §4.15 块 7）', () => {
  let r;
  assert.equal(run(at(0), (s) => { r = post(ENGINE, s, { legs: [{ account: acc('npc_a', SH, 'res_t_coin', 'coin_x'), delta: 1 }, { flow: 'src_genesis', kind: 'res_t_coin', qty: 1 }], reason: 'verb_test' }); }).ok, true);
  assert.deepEqual(r.notRun, ['budget', 'reason_verb']);
  assert.equal(run(at(0), (s) => { r = post(ENGINE, s, { legs: [{ account: acc('npc_a', SH, 'res_t_backed', 'k1'), delta: 1 }, { flow: 'src_issue', kind: 'res_t_backed', qty: 1 }], reason: 'verb_test' }); }).ok, true);
  assert.deepEqual(r.notRun, ['issuer_backed', 'reason_verb']);
});

test('入账腿持有人照 openAccount 核对：未载入实体 E-DIM-UNKNOWN-READ、已终止 E-TERM-RESIDUE', () => {
  const legs = (h) => [{ account: acc(h, SH, 'res_t_coin', 'coin_x'), delta: 1 }, { flow: 'src_issue', kind: 'res_t_coin', qty: 1 }];
  assert.deepEqual(run({}, (s) => { post(ENGINE, s, { legs: legs('npc_ghost'), reason: 'verb_test' }); }), { ok: false, code: 'E-DIM-UNKNOWN-READ' });
  const dead = { terminated: { npc_a: { day: 1, cause: 'verb_x', mode: 'inherit' } } };
  assert.deepEqual(run(dead, (s) => { post(ENGINE, s, { legs: legs('npc_a'), reason: 'verb_test' }); }), { ok: false, code: 'E-TERM-RESIDUE' });
  assert.deepEqual(Object.keys(dead), ['terminated']);
});

// ---------- transfer 简写 ----------

test('transfer 与两腿 post 结果逐字相同', () => {
  const start = { accounts: { npc_a: { purpose_test_shelf: { res_t_coin: { coin_x: 6 } } } } };
  const a = clone(start);
  const b = clone(start);
  let ra;
  let rb;
  assert.equal(run(a, (s) => { ra = transfer(ENGINE, s, { from: { holder: 'npc_a', purpose: SH }, to: { holder: 'org_b', purpose: PU }, resource: { kind: 'res_t_coin', key: 'coin_x' }, qty: 4, reason: 'verb_test_pay' }); }).ok, true);
  assert.equal(run(b, (s) => { rb = post(ENGINE, s, { legs: [{ account: acc('npc_a', SH, 'res_t_coin', 'coin_x'), delta: -4 }, { account: acc('org_b', PU, 'res_t_coin', 'coin_x'), delta: 4 }], reason: 'verb_test_pay' }); }).ok, true);
  assert.deepEqual(a, b);
  assert.deepEqual(ra, rb);
  assert.deepEqual(a.accounts, { npc_a: { purpose_test_shelf: { res_t_coin: { coin_x: 2 } } }, org_b: { purpose_test_purse: { res_t_coin: { coin_x: 4 } } } });
  assert.deepEqual(run(a, (s) => { transfer(ENGINE, s, { from: { holder: 'npc_a', purpose: SH }, to: { holder: 'org_b', purpose: SH }, resource: { kind: 'res_t_coin', key: 'coin_x' }, qty: 0, reason: 'verb_test' }); }), { ok: false, code: 'E-DIM-DOMAIN-RANGE' });
});

// ---------- 批次存储（李白 11-18 04:10；K3-46） ----------

const GRAIN0 = { enteredDay: 3, taint: 0.25, costBasis: 100, source: 'org_b' };

function grainState() {
  const state = at(3);
  let r;
  assert.deepEqual(run(state, (s) => { r = post(ENGINE, s, { legs: [{ account: acc('npc_a', SH, 'res_t_grain'), delta: 10, lot: { attrs: GRAIN0 } }, { flow: 'src_regrow', kind: 'res_t_grain', qty: 10 }], reason: 'verb_test_harvest' }); }), { ok: true });
  assert.deepEqual(r, { lots: [[0, 'lot_0']], notRun: ['reason_verb'] });
  return state;
}

test('新批次：批次键 lot_ + 计数器（handleRadix 进制）由 post 发，属性存 stockLots、不存数量，数量只在余额', () => {
  const state = grainState();
  assert.deepEqual(state, {
    clock: { minute: 4320, seq: 0 },
    accounts: { npc_a: { purpose_test_shelf: { res_t_grain: { lot_0: 10 } } } },
    stockLots: { npc_a: { purpose_test_shelf: { res_t_grain: { lot_0: { enteredDay: 3, taint: 0.25, costBasis: 100, source: 'org_b' } } } } },
    ledgerCounters: { lotNext: 1 },
    ledgerTotals: { res_t_grain: { src_regrow: { cumulative: 10, usedByDay: [{ day: 3, used: 10 }] } } },
  });
  // 计数器到 36 进 base36 两位：lot_10 是第 36 号
  const s2 = at(0, { ledgerCounters: { lotNext: 36 } });
  let r;
  assert.equal(run(s2, (s) => { r = post(ENGINE, s, { legs: [{ account: acc('npc_a', SH, 'res_t_grain'), delta: 1, lot: { attrs: {} } }, { flow: 'src_regrow', kind: 'res_t_grain', qty: 1 }], reason: 'verb_test' }); }).ok, true);
  assert.deepEqual(r.lots, [[0, 'lot_10']]);
  assert.equal(s2.ledgerCounters.lotNext, 37);
});

test('拆分：transfer 一部分开新批次，taint 等属性原样带出；costBasis 拆出 floor(100×3÷10)=30、原批留 70', () => {
  const state = grainState();
  let r;
  assert.equal(run(state, (s) => { r = transfer(ENGINE, s, { from: { holder: 'npc_a', purpose: SH }, to: { holder: 'org_b', purpose: SH }, resource: { kind: 'res_t_grain', key: 'lot_0' }, qty: 3, reason: 'verb_test_sell' }); }).ok, true);
  assert.deepEqual(r.lots, [[1, 'lot_1']]);
  assert.deepEqual(state.accounts, { npc_a: { purpose_test_shelf: { res_t_grain: { lot_0: 7 } } }, org_b: { purpose_test_shelf: { res_t_grain: { lot_1: 3 } } } });
  assert.deepEqual(state.stockLots, {
    npc_a: { purpose_test_shelf: { res_t_grain: { lot_0: { enteredDay: 3, taint: 0.25, costBasis: 70, source: 'org_b' } } } },
    org_b: { purpose_test_shelf: { res_t_grain: { lot_1: { enteredDay: 3, taint: 0.25, costBasis: 30, source: 'org_b' } } } },
  });
  assert.equal(state.ledgerCounters.lotNext, 2);
  // 同一笔拆两份（7 件、costBasis 70 → 2 件与 5 件）：floor(70×2÷7)=20、floor(70×5÷7)=50，原批留 70−20−50=0
  assert.equal(run(state, (s) => {
    post(ENGINE, s, { legs: [
      { account: acc('npc_a', SH, 'res_t_grain', 'lot_0'), delta: -7 },
      { account: acc('npc_c', SH, 'res_t_grain'), delta: 2, lot: { splitFrom: 'lot_0' } },
      { account: acc('org_b', PU, 'res_t_grain'), delta: 5, lot: { splitFrom: 'lot_0' } },
    ], reason: 'verb_test' });
  }).ok, true);
  assert.equal(state.stockLots.npc_c.purpose_test_shelf.res_t_grain.lot_2.costBasis, 20);
  assert.equal(state.stockLots.org_b.purpose_test_purse.res_t_grain.lot_3.costBasis, 50);
  assert.equal(state.stockLots.npc_a.purpose_test_shelf.res_t_grain.lot_0.costBasis, 0);
  assert.equal(state.stockLots.org_b.purpose_test_purse.res_t_grain.lot_3.taint, 0.25);
  assert.equal(state.accounts.npc_a.purpose_test_shelf.res_t_grain.lot_0, 0);
  assert.deepEqual(auditLots(ENGINE, state), []);
});

test('批次腿反例：物品入账不开新批次、属性带数量、splitFrom 不在本笔出账腿、拆出多于出账量；被拒时计数器一并回滚', () => {
  const state = grainState();
  state.accounts.npc_a.purpose_test_shelf.res_t_grain.lot_9 = 5;
  state.stockLots.npc_a.purpose_test_shelf.res_t_grain.lot_9 = { taint: 0 };
  state.ledgerCounters.lotNext = 10;
  const before = clone(state);
  const p = (legs) => run(state, (s) => { post(ENGINE, s, { legs, reason: 'verb_test' }); });
  assert.deepEqual(p([{ account: acc('npc_a', SH, 'res_t_grain', 'lot_0'), delta: -1 }, { account: acc('org_b', SH, 'res_t_grain', 'lot_0'), delta: 1 }]), { ok: false, code: 'E-DIM-STRUCT-FIELD' });
  assert.deepEqual(p([{ account: acc('npc_a', SH, 'res_t_grain'), delta: 1, lot: { attrs: { qty: 1 } } }, { flow: 'src_regrow', kind: 'res_t_grain', qty: 1 }]), { ok: false, code: 'E-DIM-STRUCT-FIELD' });
  assert.deepEqual(p([{ account: acc('npc_a', SH, 'res_t_grain'), delta: 1, lot: { attrs: { taint: 2 } } }, { flow: 'src_regrow', kind: 'res_t_grain', qty: 1 }]), { ok: false, code: 'E-DIM-DOMAIN-RANGE' });
  assert.deepEqual(p([{ account: acc('npc_a', SH, 'res_t_grain', 'lot_0'), delta: -1 }, { account: acc('org_b', SH, 'res_t_grain'), delta: 1, lot: { splitFrom: 'lot_9' } }]), { ok: false, code: 'E-DIM-STRUCT-FIELD' });
  // 种类层面平（−1 −2 +3），但从 lot_0 带出 3 件而 lot_0 只出 1 件
  assert.deepEqual(p([
    { account: acc('npc_a', SH, 'res_t_grain', 'lot_0'), delta: -1 },
    { account: acc('npc_a', SH, 'res_t_grain', 'lot_9'), delta: -2 },
    { account: acc('org_b', SH, 'res_t_grain'), delta: 3, lot: { splitFrom: 'lot_0' } },
  ]), { ok: false, code: 'E-LEDGER-UNBALANCED' });
  // 后一腿为负：前面已发的批次键与计数器一并回滚
  assert.deepEqual(p([
    { account: acc('npc_a', SH, 'res_t_grain', 'lot_0'), delta: -11 },
    { account: acc('org_b', SH, 'res_t_grain'), delta: 11, lot: { splitFrom: 'lot_0' } },
  ]), { ok: false, code: 'E-LEDGER-NEGATIVE' });
  assert.deepEqual(state, before);
});

// ---------- K-8 一致性审计 ----------

test('K-8：物品类余额行与 stockLots 一一对应、批次键发过且只在一个账户；反例逐项', () => {
  const ok = grainState();
  assert.deepEqual(auditLots(ENGINE, ok), []);
  const bad = clone(ok);
  delete bad.stockLots.npc_a.purpose_test_shelf.res_t_grain.lot_0;
  bad.accounts.org_b = { purpose_test_shelf: { res_t_grain: { lot_0: 1 } } };
  bad.stockLots.org_b = { purpose_test_shelf: { res_t_grain: { lot_0: { qty: 1 } } } };
  bad.accounts.npc_c = { purpose_test_shelf: { res_t_grain: { lot_z9: 2 } } };
  bad.stockLots.npc_c = { purpose_test_shelf: { res_t_grain: { lot_z9: { taint: 1.5 } }, res_t_flour: { lot_0a: {} } } };
  assert.deepEqual(auditLots(ENGINE, bad).map((x) => [x.code, x.path]), [
    ['E-DIM-REF-MISSING', 'accounts.npc_a.purpose_test_shelf.res_t_grain.lot_0'],
    ['E-DIM-ID-FORMAT', 'accounts.npc_c.purpose_test_shelf.res_t_grain.lot_z9'],
    ['E-DIM-ID-DUPLICATE', 'accounts.org_b.purpose_test_shelf.res_t_grain.lot_0'],
    ['E-DIM-REF-MISSING', 'stockLots.npc_c.purpose_test_shelf.res_t_flour.lot_0a'],
    ['E-DIM-DOMAIN-RANGE', 'stockLots.npc_c.purpose_test_shelf.res_t_grain.lot_z9'],
    ['E-DIM-STRUCT-FIELD', 'stockLots.org_b.purpose_test_shelf.res_t_grain.lot_0'],
  ]);
});

// ---------- 逐日用量 usedByDay（卷二 §1.5 :247；卷六 §4.1.1 :347；李白 11-18 04:22、04:31 第 5 条） ----------

const mint = (qty, flow = 'src_issue') => (s) => { post(ENGINE, s, { legs: [{ account: acc('npc_a', SH, 'res_t_coin', 'coin_x'), delta: qty }, { flow, kind: 'res_t_coin', qty }], reason: 'verb_test' }); };

test('usedByDay：同日累加、跨日追加（按 clockView 世界日），同笔同代号两腿合一项；dayUsage 取当日项、无项即 0', () => {
  const state = at(5);
  assert.equal(run(state, mint(3)).ok, true);
  assert.equal(run(state, mint(4)).ok, true);
  assert.deepEqual(state.ledgerTotals.res_t_coin.src_issue, { cumulative: 7, usedByDay: [{ day: 5, used: 7 }] });
  assert.equal(dayUsage(ENGINE, state, 'res_t_coin', 'src_issue'), 7);
  // 第 6 日 0 时（minute 8640）：当日无项即 0，前一日的项留着（清理归 3-3 月结）
  state.clock.minute = 8640;
  assert.equal(dayUsage(ENGINE, state, 'res_t_coin', 'src_issue'), 0);
  assert.equal(run(state, (s) => { post(ENGINE, s, { legs: [{ account: acc('npc_a', SH, 'res_t_coin', 'coin_x'), delta: 3 }, { flow: 'src_issue', kind: 'res_t_coin', qty: 1 }, { flow: 'src_issue', kind: 'res_t_coin', qty: 2 }], reason: 'verb_test' }); }).ok, true);
  assert.deepEqual(state.ledgerTotals.res_t_coin.src_issue, { cumulative: 10, usedByDay: [{ day: 5, used: 7 }, { day: 6, used: 3 }] });
  assert.equal(dayUsage(ENGINE, state, 'res_t_coin', 'src_issue'), 3);
  assert.equal(dayUsage(ENGINE, state, 'res_t_coin', 'sink_redeem'), 0);
});

test('usedByDay 乱序、重复日、末项晚于当日：post 拒 E-LEDGER-USEDBYDAY-ORDER 整笔不落；dayUsage 与 auditLedger 同样报；缺字段 E-DIM-STRUCT-FIELD', () => {
  // 余额 5 与来源累计 5 对平（3-3 起 auditLedger 核守恒式，卷六 §4.1 规则 4 :362），本测试只看 usedByDay。
  const cell = (usedByDay) => at(4, { accounts: { npc_a: { purpose_test_shelf: { res_t_coin: { coin_x: 5 } } } }, ledgerTotals: { res_t_coin: { src_issue: { cumulative: 5, usedByDay } } } });
  for (const list of [[{ day: 3, used: 2 }, { day: 2, used: 3 }], [{ day: 3, used: 2 }, { day: 3, used: 3 }], [{ day: 7, used: 5 }]]) {
    const state = cell(list);
    const before = clone(state);
    assert.deepEqual(run(state, mint(1)), { ok: false, code: 'E-LEDGER-USEDBYDAY-ORDER' });
    assert.deepEqual(state, before);
  }
  assert.throws(() => dayUsage(ENGINE, cell([{ day: 4, used: 2 }, { day: 4, used: 3 }]), 'res_t_coin', 'src_issue'), (e) => e.code === 'E-LEDGER-USEDBYDAY-ORDER');
  // 末项晚于当日只在写入时拒（不在当日之后追加）；存量本身升序、合格，审计不报
  assert.deepEqual(auditLedger(ENGINE, cell([{ day: 7, used: 5 }])), []);
  assert.deepEqual(auditLedger(ENGINE, cell([{ day: 3, used: 2 }, { day: 2, used: 3 }])).map((x) => [x.code, x.path]), [['E-LEDGER-USEDBYDAY-ORDER', 'ledgerTotals.res_t_coin.src_issue']]);
  // 只有 cumulative 的旧形状不兼容
  const old = at(4, { accounts: { npc_a: { purpose_test_shelf: { res_t_coin: { coin_x: 5 } } } }, ledgerTotals: { res_t_coin: { src_issue: { cumulative: 5 } } } });
  assert.deepEqual(run(old, mint(1)), { ok: false, code: 'E-DIM-STRUCT-FIELD' });
  assert.deepEqual(auditLedger(ENGINE, old).map((x) => x.code), ['E-DIM-STRUCT-FIELD']);
});

// ---------- 限额通道不在单笔上拒（卷六 §4.1 规则 6 :376；§2.5 :224） ----------

test('限额通道：超日限额（第 0 日限 3，记 5）与窗口外（第 4 日限额按零）post 都照过，回执 notRun 列 budget，用量照记待日终分配', () => {
  assert.deepEqual(budgetOn(ENGINE, 'res_t_coin', 'src_genesis', 0), { active: true, limit: 3 });
  assert.deepEqual(budgetOn(ENGINE, 'res_t_coin', 'src_genesis', 4), { active: false, limit: 0 });
  const state = at(0);
  let r;
  assert.deepEqual(run(state, (s) => { mint(5, 'src_genesis')(s); r = post(ENGINE, s, { legs: [{ account: acc('npc_a', SH, 'res_t_coin', 'coin_x'), delta: 1 }, { flow: 'src_genesis', kind: 'res_t_coin', qty: 1 }], reason: 'verb_test' }); }), { ok: true });
  assert.deepEqual(r.notRun, ['budget', 'reason_verb']);
  state.clock.minute = 5760;
  assert.deepEqual(run(state, (s) => { r = post(ENGINE, s, { legs: [{ account: acc('npc_a', SH, 'res_t_coin', 'coin_x'), delta: 2 }, { flow: 'src_genesis', kind: 'res_t_coin', qty: 2 }], reason: 'verb_test' }); }), { ok: true });
  assert.deepEqual(r.notRun, ['budget', 'reason_verb']);
  assert.deepEqual(state.ledgerTotals.res_t_coin.src_genesis, { cumulative: 8, usedByDay: [{ day: 0, used: 6 }, { day: 4, used: 2 }] });
  assert.equal(state.accounts.npc_a.purpose_test_shelf.res_t_coin.coin_x, 8);
});

// ---------- 持有人只能是主体（卷六 §2.1 :103、S6-14；卷三乙 K-2 :1030；李白 11-18 04:45） ----------

test('持有人：place 行 ledgerHolder 为真才可作持有人；为假或缺写 E-LEDGER-HOLDER-NOT-SUBJECT（入账、出账、开户、transfer 都核）', () => {
  const issue = (h) => run(at(0), (s) => { post(ENGINE, s, { legs: [{ account: acc(h, SH, 'res_t_coin', 'coin_x'), delta: 2 }, { flow: 'src_issue', kind: 'res_t_coin', qty: 2 }], reason: 'verb_test' }); });
  assert.deepEqual(issue('loc_shop'), { ok: true });
  assert.deepEqual(issue('loc_square'), { ok: false, code: 'E-LEDGER-HOLDER-NOT-SUBJECT' });
  assert.deepEqual(issue('loc_bare'), { ok: false, code: 'E-LEDGER-HOLDER-NOT-SUBJECT' });
  assert.deepEqual(run(at(0), (s) => { openAccount(ENGINE, s, 'loc_square', { kind: 'res_t_coin', key: 'coin_x' }, SH); }), { ok: false, code: 'E-LEDGER-HOLDER-NOT-SUBJECT' });
  // 出账腿：账上已有余额的非主体 place 也不能往外记
  const held = at(0, { accounts: { loc_square: { purpose_test_shelf: { res_t_coin: { coin_x: 4 } } } }, ledgerTotals: { res_t_coin: { src_issue: { cumulative: 4, usedByDay: [] } } } });
  const before = clone(held);
  assert.deepEqual(run(held, (s) => { transfer(ENGINE, s, { from: { holder: 'loc_square', purpose: SH }, to: { holder: 'npc_a', purpose: SH }, resource: { kind: 'res_t_coin', key: 'coin_x' }, qty: 1, reason: 'verb_test' }); }), { ok: false, code: 'E-LEDGER-HOLDER-NOT-SUBJECT' });
  assert.deepEqual(run(held, (s) => { transfer(ENGINE, s, { from: { holder: 'npc_a', purpose: SH }, to: { holder: 'loc_square', purpose: SH }, resource: { kind: 'res_t_coin', key: 'coin_x' }, qty: 0, reason: 'verb_test' }); }).code, 'E-DIM-DOMAIN-RANGE');
  assert.deepEqual(held, before);
  // 审计入口（加载存档后调）：非主体 place 名下的账户行报出
  assert.deepEqual(auditLedger(ENGINE, held).map((x) => [x.code, x.path]), [['E-LEDGER-HOLDER-NOT-SUBJECT', 'accounts.loc_square']]);
});

test('持有人：固定装置与容器不作持有人——炉窑所在的 place 行（ledgerHolder 假）E-LEDGER-HOLDER-NOT-SUBJECT，容器（物品）E-DIM-REF-MISSING，装置代号（非实体）E-DIM-UNKNOWN-READ', () => {
  const grain = (h) => run(at(0), (s) => { post(ENGINE, s, { legs: [{ account: acc(h, SH, 'res_t_grain'), delta: 1, lot: { attrs: {} } }, { flow: 'src_regrow', kind: 'res_t_grain', qty: 1 }], reason: 'verb_test' }); });
  assert.deepEqual(grain('bld_kiln'), { ok: false, code: 'E-LEDGER-HOLDER-NOT-SUBJECT' });
  assert.deepEqual(grain('item_crate'), { ok: false, code: 'E-DIM-REF-MISSING' });
  assert.deepEqual(grain('fixture_t_hearth'), { ok: false, code: 'E-DIM-UNKNOWN-READ' });
  assert.deepEqual(grain('loc_shop'), { ok: true });
});

test('加载：place 表载入时表头须照卷二 §5.6 登 ledgerHolder（boolean、always、error），缺或不合逐项 E-DIM-STRUCT-FIELD；表未载入不查', () => {
  assert.deepEqual(checkSubjectFlagDims(new Map([['place', PLACE]])), []);
  assert.deepEqual(checkSubjectFlagDims(new Map()), []);
  assert.deepEqual(checkSubjectFlagDims(new Map([['place', { doc: { dimensions: {} } }]])).map((e) => [e.code, e.path]), [
    ['E-DIM-STRUCT-FIELD', 'place#/dimensions/ledgerHolder/type'],
    ['E-DIM-STRUCT-FIELD', 'place#/dimensions/ledgerHolder/required'],
    ['E-DIM-STRUCT-FIELD', 'place#/dimensions/ledgerHolder/onUnknown'],
  ]);
  assert.deepEqual(checkSubjectFlagDims(new Map([['place', { doc: { dimensions: { ledgerHolder: { ...FLAG_DEF, required: 'never' } } } }]])).map((e) => [e.path, e.got]), [['place#/dimensions/ledgerHolder/required', 'never']]);
});

// ---------- 物理律通道预警（W-LEDGER-ALERT） ----------

test('alertGaps：只对物理律通道、alert 非空、当日用量大于 alert 才派生；不写状态，按（种类、代号、日）升序', () => {
  const usage = [
    { resource: 'res_t_grain', flow: 'sink_consume', day: 4, used: 11 },
    { resource: 'res_t_grain', flow: 'sink_consume', day: 3, used: 10 },
    { resource: 'res_t_grain', flow: 'sink_consume', day: 2, used: 12 },
    { resource: 'res_building_share', flow: 'sink_loss', day: 1, used: 99 },
    { resource: 'res_t_coin', flow: 'src_genesis', day: 0, used: 99 },
  ];
  assert.deepEqual(alertGaps(ENGINE, usage), [
    { code: 'W-LEDGER-ALERT', resource: 'res_t_grain', flow: 'sink_consume', day: 2, used: 12, alert: 10 },
    { code: 'W-LEDGER-ALERT', resource: 'res_t_grain', flow: 'sink_consume', day: 4, used: 11, alert: 10 },
  ]);
  assert.throws(() => alertGaps(ENGINE, [{ resource: 'res_t_grain', flow: 'sink_consume', day: -1, used: 1 }]), (e) => e.code === 'E-DIM-DOMAIN-RANGE');
  assert.throws(() => alertGaps(ENGINE, [{ resource: 'res_t_grain', flow: 'purpose_test_shelf', day: 1, used: 1 }]), (e) => e.code === 'E-DIM-REF-MISSING');
});

// ---------- 拆分余额先于除法（卷六 §4.2 规则 5 :418"原数量为 0 的批次无可拆，不做这次除法"；Opus 只核必须改 1） ----------

test('拆分：入账腿排在出账腿前，原批余额 0 带 costBasis 即 E-LEDGER-NEGATIVE（不除以零）；余额够时腿序不影响拆分', () => {
  const state = grainState();
  state.accounts.npc_a.purpose_test_shelf.res_t_grain.lot_9 = 0;
  state.stockLots.npc_a.purpose_test_shelf.res_t_grain.lot_9 = { costBasis: 50 };
  state.ledgerCounters.lotNext = 10;
  const before = clone(state);
  const p = (legs) => run(state, (s) => { post(ENGINE, s, { legs, reason: 'verb_test' }); });
  assert.deepEqual(p([
    { account: acc('org_b', SH, 'res_t_grain'), delta: 2, lot: { splitFrom: 'lot_9' } },
    { account: acc('npc_a', SH, 'res_t_grain', 'lot_9'), delta: -2 },
  ]), { ok: false, code: 'E-LEDGER-NEGATIVE' });
  assert.deepEqual(state, before);
  // lot_0 余额 10、costBasis 100，入账腿在前拆 4：floor(100×4÷10)=40，原批留 60
  assert.deepEqual(p([
    { account: acc('org_b', SH, 'res_t_grain'), delta: 4, lot: { splitFrom: 'lot_0' } },
    { account: acc('npc_a', SH, 'res_t_grain', 'lot_0'), delta: -4 },
  ]), { ok: true });
  assert.equal(state.stockLots.org_b.purpose_test_shelf.res_t_grain.lot_a.costBasis, 40);
  assert.equal(state.stockLots.npc_a.purpose_test_shelf.res_t_grain.lot_0.costBasis, 60);
  assert.equal(state.accounts.npc_a.purpose_test_shelf.res_t_grain.lot_0, 6);
});

// ---------- 居民聚合体作持有人（卷六 §2.1 :103、S6-14；卷三乙 K-2 :1031；卷二 §5.6 :1765；卷二十七 §3.1 :200；勘误 1118k9） ----------

// 视图读取函数夹具（李白 11-18 05:28 裁定①：规则层 aggregateView（卷二十七 §3.1）、buildProjectView（卷十九 §3.2 :242）尚未建，本卡不建，
// 测试以夹具登记；账本只经登记名调用，不读 state 里的 aggregates、buildProject）。FIX 给每个 id 的视图返回值，没有即 null。
const FIX = { aggs: {}, projects: {} };
const fixtureView = (key) => (_engine, _state, id) => (Object.hasOwn(FIX[key], id) ? FIX[key][id] : null);
const registerFixtureViews = () => {
  registerViewReader('aggregateView', 'rules/test-views.mjs', fixtureView('aggs'));
  registerViewReader('buildProjectView', 'rules/test-views.mjs', fixtureView('projects'));
};
registerFixtureViews();
// 视图未登记时跑 fn（工程、聚合体系统未上线的情形），跑完照原样登记回去。
const withoutViews = (fn) => { resetViewRegistry(); try { return fn(); } finally { registerFixtureViews(); } };

test('持有人：居民聚合体经视图 aggregateView 按 ledgerHolder 判，为真可作；为假、缺写或非布尔 E-LEDGER-HOLDER-NOT-SUBJECT；视图给不出、返回非对象、视图未登记 E-DIM-UNKNOWN-READ', () => {
  FIX.aggs = { agg_t_reg: { ledgerHolder: true }, agg_t_off: { ledgerHolder: false }, agg_t_none: {}, agg_t_str: { ledgerHolder: 'true' }, agg_t_bad: 7 };
  const issue = (h, extra = {}) => run(at(0, extra), (s) => { post(ENGINE, s, { legs: [{ account: acc(h, SH, 'res_t_coin', 'coin_x'), delta: 2 }, { flow: 'src_issue', kind: 'res_t_coin', qty: 2 }], reason: 'verb_test' }); });
  assert.deepEqual(issue('agg_t_reg'), { ok: true });
  assert.deepEqual(issue('agg_t_off'), { ok: false, code: 'E-LEDGER-HOLDER-NOT-SUBJECT' });
  assert.deepEqual(issue('agg_t_none'), { ok: false, code: 'E-LEDGER-HOLDER-NOT-SUBJECT' });
  assert.deepEqual(issue('agg_t_str'), { ok: false, code: 'E-LEDGER-HOLDER-NOT-SUBJECT' });
  assert.deepEqual(issue('agg_t_bad'), { ok: false, code: 'E-DIM-UNKNOWN-READ' });
  assert.deepEqual(issue('agg_t_ghost'), { ok: false, code: 'E-DIM-UNKNOWN-READ' });
  // 不直读 state：state 里写着 aggregates.agg_t_ghost.ledgerHolder = true，视图给不出它，照样读到未知
  assert.deepEqual(issue('agg_t_ghost', { aggregates: { agg_t_ghost: { ledgerHolder: true } } }), { ok: false, code: 'E-DIM-UNKNOWN-READ' });
  // 视图未登记：不放行；实体持有人不经视图，照常可作（先查实体、再查聚合体）
  withoutViews(() => {
    assert.deepEqual(issue('agg_t_reg'), { ok: false, code: 'E-DIM-UNKNOWN-READ' });
    assert.deepEqual(issue('npc_a'), { ok: true });
  });
  // 登记为主体的聚合体：开户、转给人物都过，余额手算 5 − 2 = 3
  const ok = at(0, { accounts: { agg_t_reg: { purpose_test_shelf: { res_t_coin: { coin_x: 5 } } } }, ledgerTotals: { res_t_coin: { src_issue: { cumulative: 5, usedByDay: [] } } } });
  assert.deepEqual(run(ok, (s) => { transfer(ENGINE, s, { from: { holder: 'agg_t_reg', purpose: SH }, to: { holder: 'npc_a', purpose: SH }, resource: { kind: 'res_t_coin', key: 'coin_x' }, qty: 2, reason: 'verb_test' }); }), { ok: true });
  assert.equal(ok.accounts.agg_t_reg.purpose_test_shelf.res_t_coin.coin_x, 3);
  // 出账腿与审计：标记为假的聚合体名下已有余额，往外记被拒、审计报出
  const held = at(0, { accounts: { agg_t_off: { purpose_test_shelf: { res_t_coin: { coin_x: 4 } } } }, ledgerTotals: { res_t_coin: { src_issue: { cumulative: 4, usedByDay: [] } } } });
  const before = clone(held);
  assert.deepEqual(run(held, (s) => { transfer(ENGINE, s, { from: { holder: 'agg_t_off', purpose: SH }, to: { holder: 'npc_a', purpose: SH }, resource: { kind: 'res_t_coin', key: 'coin_x' }, qty: 1, reason: 'verb_test' }); }), { ok: false, code: 'E-LEDGER-HOLDER-NOT-SUBJECT' });
  assert.deepEqual(held, before);
  assert.deepEqual(auditLedger(ENGINE, held).map((x) => [x.code, x.path]), [['E-LEDGER-HOLDER-NOT-SUBJECT', 'accounts.agg_t_off']]);
  assert.deepEqual(auditLedger(ENGINE, ok), []);
});

// ---------- 批次属性 project 与 E-LEDGER-STAGING-SPONSOR（卷三乙 §2.3 :280、K-8 :1037；卷十九 §3.2 :242、§3.3 :272、§4.4 规则 7 :531；卷六码表） ----------

const PROJECTS = { bp_t_house: { sponsor: 'npc_a' }, bp_t_hall: { sponsor: 'org_b' } };
function stagedState(projects = PROJECTS) {
  FIX.projects = clone(projects);
  return grainState();
}
// npc_a 从 lot_0 拆 n 件到自己名下用途 PU 的新批次，lot 写法由调用方给
const supply = (state, n, lot, to = 'npc_a') => run(state, (s) => { post(ENGINE, s, { legs: [{ account: acc('npc_a', SH, 'res_t_grain', 'lot_0'), delta: -n }, { account: acc(to, PU, 'res_t_grain'), delta: n, lot }], reason: 'verb_test_supply' }); });

test('project：供料拆分 {splitFrom, project} 设新批次 project，其余属性原样带出（costBasis 照拆）；再拆原样带出 project；K-8 审计通过', () => {
  const state = stagedState();
  assert.deepEqual(supply(state, 4, { splitFrom: 'lot_0', project: 'bp_t_house' }), { ok: true });
  // floor(100×4÷10)=40，原批留 60
  assert.deepEqual(state.stockLots.npc_a.purpose_test_purse.res_t_grain.lot_1, { enteredDay: 3, taint: 0.25, costBasis: 40, source: 'org_b', project: 'bp_t_house' });
  assert.equal(state.stockLots.npc_a.purpose_test_shelf.res_t_grain.lot_0.costBasis, 60);
  // 从 lot_1 拆 1 件回 SH：project 原样带出，costBasis floor(40×1÷4)=10，lot_1 留 30
  assert.deepEqual(run(state, (s) => { post(ENGINE, s, { legs: [{ account: acc('npc_a', PU, 'res_t_grain', 'lot_1'), delta: -1 }, { account: acc('npc_a', SH, 'res_t_grain'), delta: 1, lot: { splitFrom: 'lot_1' } }], reason: 'verb_test' }); }), { ok: true });
  assert.deepEqual(state.stockLots.npc_a.purpose_test_shelf.res_t_grain.lot_2, { enteredDay: 3, taint: 0.25, costBasis: 10, source: 'org_b', project: 'bp_t_house' });
  assert.equal(state.stockLots.npc_a.purpose_test_purse.res_t_grain.lot_1.costBasis, 30);
  // 新属性批次带 project、持有人即 sponsor 也过
  assert.deepEqual(run(state, (s) => { post(ENGINE, s, { legs: [{ account: acc('org_b', PU, 'res_t_grain'), delta: 2, lot: { attrs: { project: 'bp_t_hall' } } }, { flow: 'src_regrow', kind: 'res_t_grain', qty: 2 }], reason: 'verb_test' }); }), { ok: true });
  assert.deepEqual(auditLots(ENGINE, state), []);
  // 拆分写 project: null 即清掉（转出备料）
  assert.deepEqual(run(state, (s) => { post(ENGINE, s, { legs: [{ account: acc('npc_a', PU, 'res_t_grain', 'lot_1'), delta: -1 }, { account: acc('npc_c', SH, 'res_t_grain'), delta: 1, lot: { splitFrom: 'lot_1', project: null } }], reason: 'verb_test' }); }), { ok: true });
  assert.equal(state.stockLots.npc_c.purpose_test_shelf.res_t_grain.lot_4.project, null);
});

test('project 反例：持有人≠sponsor、指向不存在工程、带出 project 转给非 sponsor 都 E-LEDGER-STAGING-SPONSOR；视图未登记、返回缺 sponsor E-DIM-UNKNOWN-READ；非代号 E-DIM-ID-FORMAT；整笔不落', () => {
  const state = stagedState();
  const before = clone(state);
  assert.deepEqual(supply(state, 2, { splitFrom: 'lot_0', project: 'bp_t_hall' }), { ok: false, code: 'E-LEDGER-STAGING-SPONSOR' });
  assert.deepEqual(supply(state, 2, { splitFrom: 'lot_0', project: 'bp_t_gone' }), { ok: false, code: 'E-LEDGER-STAGING-SPONSOR' });
  assert.deepEqual(supply(state, 2, { splitFrom: 'lot_0', project: 'BP!' }), { ok: false, code: 'E-DIM-ID-FORMAT' });
  assert.deepEqual(run(state, (s) => { post(ENGINE, s, { legs: [{ account: acc('npc_c', PU, 'res_t_grain'), delta: 1, lot: { attrs: { project: 'bp_t_house' } } }, { flow: 'src_regrow', kind: 'res_t_grain', qty: 1 }], reason: 'verb_test' }); }), { ok: false, code: 'E-LEDGER-STAGING-SPONSOR' });
  assert.deepEqual(state, before);
  // 先供料成 lot_1（project bp_t_house），再原样转给 org_b：带出的 project 不改，org_b 不是 sponsor
  assert.deepEqual(supply(state, 3, { splitFrom: 'lot_0', project: 'bp_t_house' }), { ok: true });
  const mid = clone(state);
  assert.deepEqual(run(state, (s) => { transfer(ENGINE, s, { from: { holder: 'npc_a', purpose: PU }, to: { holder: 'org_b', purpose: PU }, resource: { kind: 'res_t_grain', key: 'lot_1' }, qty: 1, reason: 'verb_test' }); }), { ok: false, code: 'E-LEDGER-STAGING-SPONSOR' });
  assert.deepEqual(state, mid);
  // 视图未登记（卷十九 construction.mjs 未建）：读不到，不放行
  const none = stagedState();
  withoutViews(() => assert.deepEqual(supply(none, 2, { splitFrom: 'lot_0', project: 'bp_t_house' }), { ok: false, code: 'E-DIM-UNKNOWN-READ' }));
  // 视图返回形状不合：无 sponsor、sponsor 非代号、返回非对象，都 E-DIM-UNKNOWN-READ
  const odd = stagedState({ bp_t_nosp: { site: 'loc_shop' }, bp_t_num: { sponsor: 5 }, bp_t_bad: 'npc_a' });
  const oddBefore = clone(odd);
  for (const p of ['bp_t_nosp', 'bp_t_num', 'bp_t_bad']) assert.deepEqual(supply(odd, 2, { splitFrom: 'lot_0', project: p }), { ok: false, code: 'E-DIM-UNKNOWN-READ' }, p);
  assert.deepEqual(odd, oddBefore);
  // 不直读 state：state 里的 buildProject 写着 sponsor npc_a，视图说是 org_b，以视图为准
  const viaView = stagedState({ bp_t_house: { sponsor: 'org_b' } });
  viaView.buildProject = { bp_t_house: { sponsor: 'npc_a' } };
  assert.deepEqual(supply(viaView, 2, { splitFrom: 'lot_0', project: 'bp_t_house' }), { ok: false, code: 'E-LEDGER-STAGING-SPONSOR' });
});

test('K-8 审计 project：持有人≠sponsor、工程不存在逐项 E-LEDGER-STAGING-SPONSOR；视图未登记、返回缺 sponsor E-DIM-UNKNOWN-READ', () => {
  const state = stagedState();
  state.accounts.npc_a.purpose_test_purse = { res_t_grain: { lot_1: 2, lot_2: 1 } };
  state.stockLots.npc_a.purpose_test_purse = { res_t_grain: { lot_1: { project: 'bp_t_hall' }, lot_2: { project: 'bp_t_gone' } } };
  state.ledgerCounters.lotNext = 3;
  assert.deepEqual(auditLots(ENGINE, state).map((x) => [x.code, x.path]), [
    ['E-LEDGER-STAGING-SPONSOR', 'stockLots.npc_a.purpose_test_purse.res_t_grain.lot_1'],
    ['E-LEDGER-STAGING-SPONSOR', 'stockLots.npc_a.purpose_test_purse.res_t_grain.lot_2'],
  ]);
  withoutViews(() => assert.deepEqual(auditLots(ENGINE, state).map((x) => x.code), ['E-DIM-UNKNOWN-READ', 'E-DIM-UNKNOWN-READ']));
  FIX.projects = { bp_t_hall: {}, bp_t_gone: { sponsor: 'npc_a' } };
  assert.deepEqual(auditLots(ENGINE, state).map((x) => [x.code, x.path]), [['E-DIM-UNKNOWN-READ', 'stockLots.npc_a.purpose_test_purse.res_t_grain.lot_1']]);
});
