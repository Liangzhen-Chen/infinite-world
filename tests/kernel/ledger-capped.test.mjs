// 块 3 第 3-3 张：限额通道按比例分配（K3-45）与月结账本侧（李白 11-18 04:20、04:22）。
// 依据卷六 §4.1 规则 6 :376（当日全部申请先汇总；超过日限额按比例向下取整，余数按申请主体 id 升序逐个补一单位；结果只取决于申请集合）、
// §2.5 :224（budget 生效日窗口，窗口外日限额按零计；limit 空 = 不限）、§4.6 规则 8 :582（先归并；全序键（买方 id、计价资源键、货的资源键））、
// §4.22 规则 4 :1261（月结顺序：先派生预警缺口写报，写成功后清已结期逐日项、只留 cumulative；写报失败不得清；可重放）。
// 期望值一律按卷文公式手算成字面量，不用被测函数算。资源种类行按 K3-44 用登记场景（规则表副本里加行，不进 world/）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installVocab } from '../../server-plugin/kernel/vocab.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { post, prorateCapped, allocateCapped, settleCappedAllocation, closeLedgerPeriod } from '../../server-plugin/kernel/ledger.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = loadWorld(ROOT);
assert.ok(W.ok, W.text);
// 用途分区与持有人按 K3-44 用登记场景：在词表与注册表副本里加行（不进 world/）。
const SHELF = { spendable: true, locksFor: null, visibleToMarket: true, trackOutflow: false };
const vocab = {
  families: W.vocab.families,
  index: new Map([...W.vocab.index, ['purpose_test_shelf', { family: 'purpose', prefix: 'purpose_', entry: SHELF }]]),
};
installVocab({ vocab, idIndex: new Map([...W.idIndex, ['npc_a', 'person'], ['org_b', 'org'], ['npc_c', 'person']]), tables: W.tables });
const row = (family, sources, sinks) => ({ family, unit: 'bps', transferable: 'tr_free', counterpartRX: null, sources, sinks, issuerBacked: false });
const rules = structuredClone(W.rules);
Object.assign(rules.economyResources, {
  res_t_coin: row('resfam_coin', ['src_genesis', 'src_issue'], ['sink_redeem']),
  res_t_grain: row('resfam_goods', ['src_regrow', 'src_boundary'], ['sink_consume']),
});
rules.economyLedger.alert.res_t_grain = { sink_consume: 10 };
// 第 0 日日限额 3（窗口 [0, 0]）；res_t_grain 的 src_boundary 不登 budget 格（= 不限，:224）。
rules.economyLedger.budget.res_t_coin = { src_genesis: { limit: 3, activeFromDay: 0, activeToDay: 0 } };
const ENGINE = { vocab, rules, units: W.env.units, tables: W.tables };
const CTX = { node: 'test_node', file: 'test/ledger-capped.test.mjs' };
const at = (day, extra = {}) => ({ clock: { minute: day * 1440, seq: 0 }, ...extra });
const clone = (v) => JSON.parse(JSON.stringify(v));
const flat = (rows) => rows.map((r) => [r.key.join('|'), r.requested, r.granted]);
const SH = 'purpose_test_shelf';
const acc = (holder, purpose, kind, key) => ({ holder, purpose, resource: { kind, key } });

// 全排列（打乱申请次序用）。
function permutations(list) {
  if (list.length <= 1) return [list];
  return list.flatMap((x, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)]).map((p) => [x, ...p]));
}

// ---------- 按比例、取整、余数 ----------

test('规则 6：超限按比例向下取整，余数按申请主体 id 升序逐个补一（手算 a5 b3 c2 限 7 → 4 2 1）', () => {
  // 总量 10 > 7：a 5×7÷10=3.5→3，b 3×7÷10=2.1→2，c 2×7÷10=1.4→1，合计 6，余 1 补给 id 最小的 a。
  assert.deepEqual(flat(prorateCapped([{ key: 'npc_c', qty: 2 }, { key: 'npc_a', qty: 5 }, { key: 'npc_b', qty: 3 }], 7)),
    [['npc_a', 5, 4], ['npc_b', 3, 2], ['npc_c', 2, 1]]);
  // 三条各 1、限 2：向下取整全为 0，余 2 补给 id 升序前两位。
  assert.deepEqual(flat(prorateCapped([{ key: 'npc_z', qty: 1 }, { key: 'npc_y', qty: 1 }, { key: 'npc_x', qty: 1 }], 2)),
    [['npc_x', 1, 1], ['npc_y', 1, 1], ['npc_z', 1, 0]]);
});

test('规则 6：总量不超过日限额全部成交；limit 空（不限）全部成交；限额 0 全为 0', () => {
  assert.deepEqual(flat(prorateCapped([{ key: 'npc_a', qty: 2 }, { key: 'npc_b', qty: 3 }], 5)), [['npc_a', 2, 2], ['npc_b', 3, 3]]);
  assert.deepEqual(flat(prorateCapped([{ key: 'npc_a', qty: 2 }, { key: 'npc_b', qty: 3 }], null)), [['npc_a', 2, 2], ['npc_b', 3, 3]]);
  assert.deepEqual(flat(prorateCapped([{ key: 'npc_a', qty: 2 }, { key: 'npc_b', qty: 3 }], 0)), [['npc_a', 2, 0], ['npc_b', 3, 0]]);
  assert.deepEqual(prorateCapped([], 4), []);
});

test('先汇总：同一主体的多条申请相加并成一条（a 2+3、b 5 限 5 → a3 b2）', () => {
  // 归并后 a5、b5，总量 10：各 5×5÷10=2.5→2，余 1 补 a。
  assert.deepEqual(flat(prorateCapped([{ key: 'npc_a', qty: 2 }, { key: 'npc_b', qty: 5 }, { key: 'npc_a', qty: 3 }], 5)), [['npc_a', 5, 3], ['npc_b', 5, 2]]);
});

test('§4.6 规则 8 全序键：元组逐段比较，第一键是申请主体 id', () => {
  const k = (...s) => s;
  assert.deepEqual(flat(prorateCapped([
    { key: k('npc_b', 'coin_x', 'grain_1'), qty: 1 },
    { key: k('npc_a', 'coin_x', 'grain_2'), qty: 1 },
    { key: k('npc_a', 'coin_x', 'grain_1'), qty: 1 },
  ], 2)), [['npc_a|coin_x|grain_1', 1, 1], ['npc_a|coin_x|grain_2', 1, 1], ['npc_b|coin_x|grain_1', 1, 0]]);
});

test('打乱同日申请次序分配不变（A6-1.2 :399；24 种次序逐一比对手算结果）', () => {
  // 总量 17 > 11：a 5×11÷17=3.23→3，b 3×11÷17=1.94→1，c 2×11÷17=1.29→1，d 7×11÷17=4.52→4，合计 9，余 2 补 a、b。
  const reqs = [{ key: 'npc_a', qty: 5 }, { key: 'npc_b', qty: 3 }, { key: 'npc_c', qty: 2 }, { key: 'npc_d', qty: 7 }];
  const perms = permutations(reqs);
  assert.equal(perms.length, 24);
  for (const p of perms) assert.deepEqual(flat(prorateCapped(p, 11)), [['npc_a', 5, 4], ['npc_b', 3, 2], ['npc_c', 2, 1], ['npc_d', 7, 4]]);
});

test('申请形状：数量须正整数、键须非空字串或其列表、限额须非负整数或空', () => {
  assert.throws(() => prorateCapped([{ key: 'npc_a', qty: 0 }], 3), (e) => e.code === 'E-DIM-DOMAIN-RANGE');
  assert.throws(() => prorateCapped([{ key: 'npc_a', qty: 1.5 }], 3), (e) => e.code === 'E-DIM-DOMAIN-RANGE');
  assert.throws(() => prorateCapped([{ key: '', qty: 1 }], 3), (e) => e.code === 'E-DIM-STRUCT-FIELD');
  assert.throws(() => prorateCapped([{ key: 'npc_a', qty: 1, extra: 1 }], 3), (e) => e.code === 'E-DIM-STRUCT-FIELD');
  assert.throws(() => prorateCapped([{ key: 'npc_a', qty: 1 }], -1), (e) => e.code === 'E-DIM-DOMAIN-RANGE');
});

// ---------- 生效日窗口（读 ledger.json budget） ----------

test('allocateCapped：窗口内照 limit 分（第 0 日限 3：a2 b2 → 2 1），窗口外按零（第 1 日全为 0），无 budget 格不限', () => {
  const reqs = [{ key: 'org_b', qty: 2 }, { key: 'npc_a', qty: 2 }];
  // 第 0 日：总量 4 > 3，各 2×3÷4=1.5→1，余 1 补 npc_a。
  assert.deepEqual(flat(allocateCapped(ENGINE, 'res_t_coin', 'src_genesis', 0, reqs)), [['npc_a', 2, 2], ['org_b', 2, 1]]);
  assert.deepEqual(flat(allocateCapped(ENGINE, 'res_t_coin', 'src_genesis', 1, reqs)), [['npc_a', 2, 0], ['org_b', 2, 0]]);
  assert.deepEqual(flat(allocateCapped(ENGINE, 'res_t_grain', 'src_boundary', 9, reqs)), [['npc_a', 2, 2], ['org_b', 2, 2]]);
});

test('allocateCapped：代号不在该种类行 E-LEDGER-CODE-UNREGISTERED；物理律通道 E-DIM-DOMAIN-ENUM；不是 src/sink 条目 E-DIM-REF-MISSING', () => {
  const reqs = [{ key: 'npc_a', qty: 1 }];
  assert.throws(() => allocateCapped(ENGINE, 'res_t_grain', 'src_genesis', 0, reqs), (e) => e.code === 'E-LEDGER-CODE-UNREGISTERED');
  assert.throws(() => allocateCapped(ENGINE, 'res_t_coin', 'src_issue', 0, reqs), (e) => e.code === 'E-DIM-DOMAIN-ENUM');
  assert.throws(() => allocateCapped(ENGINE, 'res_t_coin', 'resfam_coin', 0, reqs), (e) => e.code === 'E-DIM-REF-MISSING');
});

// ---------- 日终分配结算入口（卷六 §4.1 规则 6 :376、码表 :1640；勘误 1118k13 续、李白 11-18 07:02 选丙；块 3 第 3-3c 张） ----------
// 期望值照卷文公式手算成字面量：第 0 日限 3，a2 b2 总量 4 > 3，各 2×3÷4=1.5→1，余 1 按主体 id 升序补 npc_a → a2 b1。

const REQS = [{ key: 'npc_a', qty: 2 }, { key: 'org_b', qty: 2 }];
const TARGETS = [
  { key: 'npc_a', account: acc('npc_a', SH, 'res_t_coin', 'coin_x') },
  { key: 'org_b', account: acc('org_b', SH, 'res_t_coin', 'coin_x') },
];
const settleDraft = (input) => ({ resourceKind: 'res_t_coin', code: 'src_genesis', day: 0, limit: 3, reason: 'verb_test_settle', requests: REQS, targets: TARGETS, ...input });
const settleRun = (state, input) => runTransaction(state, CTX, (s) => settleCappedAllocation(ENGINE, s, settleDraft(input)));
const settleGet = (state, input) => {
  let out;
  const run = runTransaction(state, CTX, (s) => { out = settleCappedAllocation(ENGINE, s, settleDraft(input)); });
  return { run, out };
};

test('结算入口：开局 src_genesis 第 0 日按分配结果逐申请者入账（a2 b2 限 3 → a2 b1），来源累计与当日用量照记', () => {
  const state = at(0);
  const { run, out } = settleGet(state, {});
  assert.deepEqual(run, { ok: true });
  assert.deepEqual(clone(out), {
    day: 0, resource: 'res_t_coin', source: 'src_genesis',
    allocations: [{ key: ['npc_a'], requested: 2, granted: 2 }, { key: ['org_b'], requested: 2, granted: 1 }],
    booked: 3, alreadyBooked: false,
  });
  assert.deepEqual(state, {
    clock: { minute: 0, seq: 0 },
    accounts: { npc_a: { purpose_test_shelf: { res_t_coin: { coin_x: 2 } } }, org_b: { purpose_test_shelf: { res_t_coin: { coin_x: 1 } } } },
    ledgerTotals: { res_t_coin: { src_genesis: { cumulative: 3, usedByDay: [{ day: 0, used: 3 }] } } },
  });
  // 账本仍守恒（来源累计 = 余额之和）。
  assert.equal(Object.values(state.accounts).reduce((n, h) => n + h[SH].res_t_coin.coin_x, 0), 3);
});

test('结算入口：同一申请集合换序，分配与日终存档逐位相同（卷六 :376 结果只取决于申请集合）', () => {
  const a = at(0);
  const b = at(0);
  assert.equal(settleRun(a, { requests: [{ key: 'org_b', qty: 2 }, { key: 'npc_a', qty: 2 }] }).ok, true);
  assert.equal(settleRun(b, { requests: REQS }).ok, true);
  assert.deepEqual(a, b);
});

test('结算入口：窗口外日限额按零（§2.5 :224）→ 全部 granted 0、不入账、不落 usedByDay；物品类经 lot 开新批次照常', () => {
  const outside = at(1);
  let r;
  assert.deepEqual(runTransaction(outside, CTX, (s) => { r = settleCappedAllocation(ENGINE, s, { resourceKind: 'res_t_coin', code: 'src_genesis', day: 1, limit: 0, reason: 'verb_test_settle', requests: REQS, targets: TARGETS }); }), { ok: true });
  assert.deepEqual(clone(r).allocations.map((x) => [x.key[0], x.granted]), [['npc_a', 0], ['org_b', 0]]);
  assert.deepEqual(clone(r), { day: 1, resource: 'res_t_coin', source: 'src_genesis', allocations: [{ key: ['npc_a'], requested: 2, granted: 0 }, { key: ['org_b'], requested: 2, granted: 0 }], booked: 0, alreadyBooked: false });
  assert.deepEqual(outside, { clock: { minute: 1440, seq: 0 } });
  // 物品类（resfam_goods）入账腿须开新批次：target 带 lot {attrs}，批次键由 post 发。
  const goods = at(0);
  assert.deepEqual(runTransaction(goods, CTX, (s) => {
    settleCappedAllocation(ENGINE, s, { resourceKind: 'res_t_grain', code: 'src_boundary', day: 0, limit: null, reason: 'verb_test_settle', requests: [{ key: 'npc_a', qty: 2 }], targets: [{ key: 'npc_a', account: { holder: 'npc_a', purpose: SH, resource: { kind: 'res_t_grain' } }, lot: { attrs: { taint: 0 } } }] });
  }), { ok: true });
  assert.deepEqual(goods, {
    clock: { minute: 0, seq: 0 },
    accounts: { npc_a: { purpose_test_shelf: { res_t_grain: { lot_0: 2 } } } },
    stockLots: { npc_a: { purpose_test_shelf: { res_t_grain: { lot_0: { taint: 0 } } } } },
    ledgerCounters: { lotNext: 1 },
    ledgerTotals: { res_t_grain: { src_boundary: { cumulative: 2, usedByDay: [{ day: 0, used: 2 }] } } },
  });
});

test('限额来源直接 post 整笔拒 E-LEDGER-CAPPED-DIRECT、账本不变；非限额来源照常', () => {
  const state = at(0);
  const before = clone(state);
  const p = (flow, kind) => runTransaction(state, CTX, (s) => { post(ENGINE, s, { legs: [{ account: acc('npc_a', SH, kind, 'coin_x'), delta: 1 }, { flow, kind, qty: 1 }], reason: 'verb_test' }); });
  assert.deepEqual(p('src_genesis', 'res_t_coin'), { ok: false, code: 'E-LEDGER-CAPPED-DIRECT' });
  assert.deepEqual(state, before);
  assert.deepEqual(p('src_issue', 'res_t_coin'), { ok: true });
  assert.deepEqual(state.ledgerTotals.res_t_coin.src_issue, { cumulative: 1, usedByDay: [{ day: 0, used: 1 }] });
});

test('结算入口：重跑同日同来源不重复入账（按日＋来源判，判据取 usedByDay 当日项，卷六 §4.1.1 :347、:376）', () => {
  const state = at(0);
  assert.equal(settleRun(state, {}).ok, true);
  const afterFirst = clone(state);
  const again = settleGet(state, {});
  assert.deepEqual(again.run, { ok: true });
  assert.equal(again.out.alreadyBooked, true);
  assert.equal(again.out.booked, 3);
  assert.deepEqual(state, afterFirst);
  // 换了申请集合重跑也不再加记：只记当日该来源一次。
  const other = { requests: [{ key: 'npc_c', qty: 5 }], targets: [{ key: 'npc_c', account: acc('npc_c', SH, 'res_t_coin', 'coin_x') }] };
  const changed = settleGet(state, other);
  assert.deepEqual(changed.run, { ok: true });
  assert.equal(changed.out.alreadyBooked, true);
  assert.deepEqual(state, afterFirst);
});

test('结算入口参数：day 须等于当日、入口只收 src 限额通道、targets 与申请一一对应、reason 须代号、须在本事务内', () => {
  const state = at(0);
  const run = (input) => runTransaction(state, CTX, (s) => settleCappedAllocation(ENGINE, s, { resourceKind: 'res_t_coin', code: 'src_genesis', day: 0, limit: 3, reason: 'verb_test_settle', requests: REQS, targets: TARGETS, ...input }));
  assert.deepEqual(run({ day: 1 }), { ok: false, code: 'E-DIM-DOMAIN-RANGE' });
  assert.deepEqual(run({ reason: 'Verb!' }), { ok: false, code: 'E-DIM-ID-FORMAT' });
  assert.deepEqual(run({ code: 'src_issue' }), { ok: false, code: 'E-DIM-DOMAIN-ENUM' });
  assert.deepEqual(run({ code: 'resfam_coin' }), { ok: false, code: 'E-DIM-REF-MISSING' });
  assert.deepEqual(run({ targets: [TARGETS[0]] }), { ok: false, code: 'E-DIM-REF-MISSING' });
  assert.deepEqual(run({ targets: [...TARGETS, TARGETS[0]] }), { ok: false, code: 'E-DIM-REF-MISSING' });
  assert.deepEqual(run({ targets: [...TARGETS, { key: 'npc_c', account: acc('npc_c', SH, 'res_t_coin', 'coin_x') }] }), { ok: false, code: 'E-DIM-REF-MISSING' });
  assert.deepEqual(state, at(0));
  assert.throws(() => settleCappedAllocation(ENGINE, at(0), { resourceKind: 'res_t_coin', code: 'src_genesis', day: 0, limit: 3, reason: 'verb_test_settle', requests: REQS, targets: TARGETS }), (e) => e.code === 'E-VIEW-UNDECLARED-WRITE');
});

// ---------- 月结账本侧 ----------

const closing = () => at(6, { ledgerTotals: { res_t_grain: {
  sink_consume: { cumulative: 25, usedByDay: [{ day: 3, used: 12 }, { day: 4, used: 8 }, { day: 6, used: 5 }] },
  src_regrow: { cumulative: 25, usedByDay: [{ day: 2, used: 25 }] },
} } });

test('月结：期末日 5 以前的逐日项派生预警缺口交写报，写报后清掉、只留 cumulative 与期后项', () => {
  const state = closing();
  const seen = [];
  let r;
  assert.deepEqual(runTransaction(state, CTX, (s) => { r = closeLedgerPeriod(ENGINE, s, 5, (rep) => seen.push(clone(rep))); }), { ok: true });
  const usage = [
    { resource: 'res_t_grain', flow: 'sink_consume', day: 3, used: 12 },
    { resource: 'res_t_grain', flow: 'sink_consume', day: 4, used: 8 },
    { resource: 'res_t_grain', flow: 'src_regrow', day: 2, used: 25 },
  ];
  // alert 只在 sink_consume 上为 10：第 3 日 12 > 10 记缺口，第 4 日 8 不记；src_regrow 无 alert 格不预警。
  const gaps = [{ code: 'W-LEDGER-ALERT', resource: 'res_t_grain', flow: 'sink_consume', day: 3, used: 12, alert: 10 }];
  assert.deepEqual(seen, [{ endDay: 5, usage, gaps }]);
  assert.deepEqual(clone(r), { endDay: 5, usage, gaps, cleared: 3 });
  assert.deepEqual(state.ledgerTotals, { res_t_grain: {
    sink_consume: { cumulative: 25, usedByDay: [{ day: 6, used: 5 }] },
    src_regrow: { cumulative: 25, usedByDay: [] },
  } });
});

test('月结：写报失败不得清（状态逐位不变）', () => {
  const state = closing();
  const before = clone(state);
  assert.throws(() => runTransaction(state, CTX, (s) => { closeLedgerPeriod(ENGINE, s, 5, () => { throw new Error('report store down'); }); }), /report store down/);
  assert.deepEqual(state, before);
  // 写报抛错被调用方吞掉，同一事务继续提交：照样一项不清。
  assert.deepEqual(runTransaction(state, CTX, (s) => { try { closeLedgerPeriod(ENGINE, s, 5, () => { throw new Error('x'); }); } catch { /* 吞掉 */ } }), { ok: true });
  assert.deepEqual(state, before);
});

test('月结可重放：同一输入两次结果与状态相同；已结期再结一次无项可清', () => {
  const a = closing(); const b = closing();
  const ra = []; const rb = [];
  runTransaction(a, CTX, (s) => { ra.push(clone(closeLedgerPeriod(ENGINE, s, 5, () => {}))); });
  runTransaction(b, CTX, (s) => { rb.push(clone(closeLedgerPeriod(ENGINE, s, 5, () => {}))); });
  assert.deepEqual(ra, rb);
  assert.deepEqual(a, b);
  const after = clone(a);
  let again;
  runTransaction(a, CTX, (s) => { again = closeLedgerPeriod(ENGINE, s, 5, () => {}); });
  assert.deepEqual(clone(again), { endDay: 5, usage: [], gaps: [], cleared: 0 });
  assert.deepEqual(a, after);
});

test('月结只在本状态的事务内写；期末日须为非负整数世界日；写报须由调用方传入', () => {
  assert.throws(() => closeLedgerPeriod(ENGINE, closing(), 5, () => {}), (e) => e.code === 'E-VIEW-UNDECLARED-WRITE');
  for (const [d, w, code] of [[-1, () => {}, 'E-DIM-DOMAIN-RANGE'], [2.5, () => {}, 'E-DIM-DOMAIN-RANGE'], [5, null, 'E-DIM-STRUCT-FIELD']]) {
    const r = runTransaction(closing(), CTX, (s) => { closeLedgerPeriod(ENGINE, s, d, w); });
    assert.deepEqual(r, { ok: false, code });
  }
});
