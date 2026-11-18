// 块 3 第 3-3 张：账本守恒类不变量（方案 §3.3 :367–369 I1′ 守恒、I2′ 非负、I15′ 单一账户；K3-05）、
// 卷六 A6-1.2 账本部分（:399：守恒式整数相等、余额非负、分段推进逐位相同、outflowTotals 只增且等于减量腿之和、
// trackOutflow 为假的分区无键；打乱同日申请次序分配不变见 ledger-capped.test.mjs）与 A6-1.3 扩展性（:400）。
// 输入用登记场景（卷十二 R12-5.6；K3-44：规则表与词表副本里加行，不进 world/，不造测试设施）加性质测试（种子化的随机操作序列），
// 不在测试里写某实例应是多少；守恒式在测试里独立求和，不用被测的审计函数算期望。反例：改坏一份存档，审计必须抓住（:367）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installVocab } from '../../server-plugin/kernel/vocab.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { post, transfer, openAccount, auditLedger, balance, allocateCapped, closeLedgerPeriod } from '../../server-plugin/kernel/ledger.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = loadWorld(ROOT);
assert.ok(W.ok, W.text);

const SHELF = { spendable: true, locksFor: null, visibleToMarket: true, trackOutflow: false };
const PURSE = { spendable: true, locksFor: null, visibleToMarket: false, trackOutflow: true };
// A6-1.3 扩展：新加一个来源代号（限额通道）与一个去处代号（物理律通道），只加词表行与种类行，不改代码。
const GUILD_SRC = { budgetMode: 'bm_capped', families: ['resfam_claim'], pairedWith: null, reportGroup: null };
const GUILD_SINK = { budgetMode: 'bm_physical', families: ['resfam_claim'], pairedWith: null, reportGroup: null };
const vocab = {
  families: W.vocab.families,
  index: new Map([...W.vocab.index,
    ['purpose_test_shelf', { family: 'purpose', prefix: 'purpose_', entry: SHELF }],
    ['purpose_test_purse', { family: 'purpose', prefix: 'purpose_', entry: PURSE }],
    ['src_t_guild', { family: 'src', prefix: 'src_', entry: GUILD_SRC }],
    ['sink_t_guild', { family: 'sink', prefix: 'sink_', entry: GUILD_SINK }]]),
};
installVocab({ vocab, idIndex: new Map([...W.idIndex, ['npc_a', 'person'], ['org_b', 'org'], ['npc_c', 'person']]), tables: W.tables });
const row = (family, transferable, sources, sinks) => ({ family, unit: 'bps', transferable, counterpartRX: null, sources, sinks, issuerBacked: false });
const rules = structuredClone(W.rules);
Object.assign(rules.economyResources, {
  res_t_coin: row('resfam_coin', 'tr_free', ['src_issue'], ['sink_redeem']),
  res_t_scrip: row('resfam_coin', 'tr_free', ['src_issue'], ['sink_redeem']),
});
const ENGINE = { vocab, rules, units: W.env.units, tables: W.tables };
const CTX = { node: 'test_node', file: 'test/ledger-invariants.test.mjs' };
const SH = 'purpose_test_shelf';
const PU = 'purpose_test_purse';
const HOLDERS = ['npc_a', 'npc_c', 'org_b'];
const PURPOSES = [SH, PU];
const KINDS = ['res_t_coin', 'res_t_scrip'];
const KEYS = ['coin_x', 'coin_y'];
const acc = (holder, purpose, kind, key) => ({ holder, purpose, resource: { kind, key } });
const clone = (v) => JSON.parse(JSON.stringify(v));
const setDay = (state, day) => { state.clock = { minute: day * 1440, seq: 0 }; };

// 种子化的操作序列（登记场景）：产出（src_issue）、用掉（sink_redeem）、转移（含同一持有人分区之间）；数量 1..9，余额不够的会被拒。
function ops(seed, n) {
  let x = seed >>> 0;
  const next = (m) => { x = (Math.imul(x, 1103515245) + 12345) >>> 0; return (x >>> 8) % m; };
  const out = [];
  for (let i = 0; i < n; i++) {
    const pick = (a) => a[next(a.length)];
    out.push({ day: Math.floor(i / 25), op: pick(['mint', 'burn', 'move', 'move']), h1: pick(HOLDERS), p1: pick(PURPOSES), h2: pick(HOLDERS), p2: pick(PURPOSES), kind: pick(KINDS), key: pick(KEYS), qty: 1 + next(9) });
  }
  return out;
}

// 执行一条操作（各自一笔事务）；返回 {ok, code} 与本笔对 trackOutflow 分区的减量（只在入账时记，测试自己的模型）。
function apply(state, o) {
  setDay(state, o.day);
  const a = acc(o.h1, o.p1, o.kind, o.key);
  let draft;
  if (o.op === 'mint') draft = { legs: [{ account: a, delta: o.qty }, { flow: 'src_issue', kind: o.kind, qty: o.qty }], reason: 'verb_test_mint' };
  else if (o.op === 'burn') draft = { legs: [{ account: a, delta: -o.qty }, { flow: 'sink_redeem', kind: o.kind, qty: o.qty }], reason: 'verb_test_burn' };
  else draft = { legs: [{ account: a, delta: -o.qty }, { account: acc(o.h2, o.p2, o.kind, o.key), delta: o.qty }], reason: 'verb_test_move' };
  const r = runTransaction(state, CTX, (s) => { post(ENGINE, s, draft); });
  const out = r.ok && o.op !== 'mint' && o.p1 === PU ? o.qty : 0;
  return { r, out };
}

// 测试自己的守恒求和（不调审计）：每种资源 Σ余额 −（Σ来源累计 − Σ去处累计）。
function conservationGap(state) {
  const gap = {};
  for (const [, byP] of Object.entries(state.accounts || {})) for (const [, byK] of Object.entries(byP)) for (const [k, byKey] of Object.entries(byK)) for (const v of Object.values(byKey)) gap[k] = (gap[k] || 0) + v;
  for (const [k, byCode] of Object.entries(state.ledgerTotals || {})) for (const [code, cell] of Object.entries(byCode)) gap[k] = (gap[k] || 0) + (vocab.index.get(code).family === 'src' ? -cell.cumulative : cell.cumulative);
  return gap;
}
const balances = (state) => {
  const out = [];
  for (const [h, byP] of Object.entries(state.accounts || {})) for (const [p, byK] of Object.entries(byP)) for (const [k, byKey] of Object.entries(byK)) for (const [key, v] of Object.entries(byKey)) out.push([h, p, k, key, v]);
  return out;
};

function scenario(seed, n) {
  const state = {};
  const outflowModel = {};
  const codes = {};
  for (const o of ops(seed, n)) {
    const { r, out } = apply(state, o);
    codes[r.ok ? 'ok' : r.code] = (codes[r.ok ? 'ok' : r.code] || 0) + 1;
    if (out) { const k = `${o.h1}|${o.kind}|${o.key}`; outflowModel[k] = (outflowModel[k] || 0) + out; }
  }
  return { state, outflowModel, codes };
}

// ---------- I1′ 守恒、I2′ 非负（性质测试） ----------

test('I1′/I2′ 性质：三个种子各 300 笔随机操作后，每种资源守恒式整数相等、余额全非负、审计无违例；被拒笔不留痕', () => {
  for (const seed of [1, 7, 20261118]) {
    const { state, codes } = scenario(seed, 300);
    assert.ok(codes.ok > 100, `seed ${seed}: enough accepted posts (${JSON.stringify(codes)})`);
    assert.ok(codes['E-LEDGER-NEGATIVE'] > 0, `seed ${seed}: some posts were rejected for going negative`);
    assert.deepEqual(Object.values(conservationGap(state)).filter((g) => g !== 0), []);
    assert.deepEqual(balances(state).filter((b) => b[4] < 0), []);
    assert.deepEqual(auditLedger(ENGINE, state), []);
  }
});

test('I1′ 反例：改坏一份存档（余额多 1、来源累计少 1、出现未登记代号），审计必须抓住', () => {
  const { state } = scenario(7, 300);
  const [h, p, k, key] = balances(state).find((b) => b[4] > 0);
  const bumped = clone(state);
  bumped.accounts[h][p][k][key] += 1;
  assert.deepEqual(auditLedger(ENGINE, bumped).map((v) => [v.code, v.path]), [['E-LEDGER-UNBALANCED', `accounts/ledgerTotals:${k}`]]);
  const shaved = clone(state);
  shaved.ledgerTotals[k].src_issue.cumulative -= 1;
  assert.deepEqual(auditLedger(ENGINE, shaved).map((v) => [v.code, v.path]), [['E-LEDGER-UNBALANCED', `accounts/ledgerTotals:${k}`]]);
  const stray = clone(state);
  stray.ledgerTotals[k].purpose_test_shelf = { cumulative: 0, usedByDay: [] };
  assert.deepEqual(auditLedger(ENGINE, stray).map((v) => v.code), ['E-LEDGER-CODE-UNREGISTERED']);
});

test('I2′ 反例：存档里一个余额为负（总量仍对平），审计报 E-LEDGER-NEGATIVE；入账时同样整笔拒', () => {
  const state = {};
  setDay(state, 0);
  assert.deepEqual(runTransaction(state, CTX, (s) => { post(ENGINE, s, { legs: [{ account: acc('npc_a', SH, 'res_t_coin', 'coin_x'), delta: 4 }, { flow: 'src_issue', kind: 'res_t_coin', qty: 4 }], reason: 'verb_test' }); }), { ok: true });
  assert.deepEqual(runTransaction(state, CTX, (s) => { transfer(ENGINE, s, { from: { holder: 'npc_a', purpose: SH }, to: { holder: 'org_b', purpose: SH }, resource: { kind: 'res_t_coin', key: 'coin_x' }, qty: 5, reason: 'verb_test' }); }), { ok: false, code: 'E-LEDGER-NEGATIVE' });
  assert.deepEqual(auditLedger(ENGINE, state), []);
  const bad = clone(state);
  bad.accounts.npc_a[SH].res_t_coin.coin_x = -2;
  bad.accounts.org_b = { [SH]: { res_t_coin: { coin_x: 6 } } };
  assert.deepEqual(auditLedger(ENGINE, bad).map((v) => [v.code, v.path]), [['E-LEDGER-NEGATIVE', 'accounts.npc_a.purpose_test_shelf.res_t_coin.coin_x']]);
});

// ---------- I15′ 单一账户（三元键） ----------

test('I15′：同一持有人同资源同用途只有一个账户；组织公库与成员私囊按持有人与用途分开，分区之间移动也是一笔转移', () => {
  const state = {};
  setDay(state, 0);
  const run = (fn) => runTransaction(state, CTX, fn);
  assert.deepEqual(run((s) => { post(ENGINE, s, { legs: [{ account: acc('org_b', PU, 'res_t_coin', 'coin_x'), delta: 5 }, { flow: 'src_issue', kind: 'res_t_coin', qty: 5 }], reason: 'verb_test' }); }), { ok: true });
  // 同一三元键再入账、再开户：仍是同一个账户（余额累加，不出第二份）
  assert.deepEqual(run((s) => { openAccount(ENGINE, s, 'org_b', { kind: 'res_t_coin', key: 'coin_x' }, PU); post(ENGINE, s, { legs: [{ account: acc('org_b', PU, 'res_t_coin', 'coin_x'), delta: 2 }, { flow: 'src_issue', kind: 'res_t_coin', qty: 2 }], reason: 'verb_test' }); }), { ok: true });
  assert.deepEqual(state.accounts, { org_b: { [PU]: { res_t_coin: { coin_x: 7 } } } });
  // 首领（npc_a）私囊与组织公库是不同持有人的账户
  assert.equal(balance(ENGINE, state, 'npc_a', { kind: 'res_t_coin', key: 'coin_x' }, PU), 0);
  // 分区之间移动：同一持有人 PU → SH 3，来源累计不变（7），PU 是 trackOutflow 分区，流出累计 3
  assert.deepEqual(run((s) => { transfer(ENGINE, s, { from: { holder: 'org_b', purpose: PU }, to: { holder: 'org_b', purpose: SH }, resource: { kind: 'res_t_coin', key: 'coin_x' }, qty: 3, reason: 'verb_test' }); }), { ok: true });
  assert.deepEqual(state.accounts, { org_b: { [PU]: { res_t_coin: { coin_x: 4 } }, [SH]: { res_t_coin: { coin_x: 3 } } } });
  assert.equal(state.ledgerTotals.res_t_coin.src_issue.cumulative, 7);
  assert.deepEqual(state.outflowTotals, { org_b: { [PU]: { res_t_coin: { coin_x: { cumulative: 3 } } } } });
});

test('I15′ 反例：存档里出现三元键以外的第二种存法（资源种类挂在用途一层、用途未登记），审计报 E-DIM-REF-MISSING', () => {
  const state = { accounts: { npc_a: { res_t_coin: { coin_x: 3 } } }, ledgerTotals: { res_t_coin: { src_issue: { cumulative: 3, usedByDay: [] } } } };
  assert.deepEqual(auditLedger(ENGINE, state).map((v) => [v.code, v.path]), [['E-DIM-REF-MISSING', 'accounts.npc_a.res_t_coin'], ['E-LEDGER-UNBALANCED', 'accounts/ledgerTotals:res_t_coin']]);
  const wrongKind = { accounts: { npc_a: { [SH]: { coin_x: { res_t_coin: 3 } } } } };
  assert.deepEqual(auditLedger(ENGINE, wrongKind).map((v) => [v.code, v.path]), [['E-DIM-REF-MISSING', 'accounts.npc_a.purpose_test_shelf.coin_x']]);
});

// ---------- A6-1.2 账本部分：分段推进、流出累计 ----------

test('A6-1.2：同一操作序列一次跑完与分三段（段间存档往返）跑完，accounts、ledgerTotals、outflowTotals 逐位相同', () => {
  const list = ops(42, 240);
  const whole = {};
  for (const o of list) apply(whole, o);
  let seg = {};
  for (const [from, to] of [[0, 70], [70, 161], [161, 240]]) {
    for (const o of list.slice(from, to)) apply(seg, o);
    seg = JSON.parse(JSON.stringify(seg));
  }
  assert.deepEqual(seg, JSON.parse(JSON.stringify(whole)));
});

test('A6-1.2：outflowTotals 等于各 trackOutflow 分区减量腿之和、两次推进之间只增不减；trackOutflow 为假的分区无键', () => {
  const list = ops(99, 300);
  const state = {};
  const model = {};
  let prev = {};
  for (const [i, o] of list.entries()) {
    const { out } = apply(state, o);
    if (out) { const k = `${o.h1}|${o.kind}|${o.key}`; model[k] = (model[k] || 0) + out; }
    if (i % 50 === 49) {
      const cur = {};
      for (const [h, byP] of Object.entries(state.outflowTotals || {})) {
        assert.deepEqual(Object.keys(byP), [PU]);
        for (const [k, byKey] of Object.entries(byP[PU])) for (const [key, c] of Object.entries(byKey)) cur[`${h}|${k}|${key}`] = c.cumulative;
      }
      for (const [k, v] of Object.entries(prev)) assert.ok(cur[k] >= v, `${k} only grows`);
      assert.deepEqual(cur, model);
      prev = cur;
    }
  }
  assert.ok(Object.keys(model).length > 0);
});

// ---------- A6-1.3 扩展性 ----------

test('A6-1.3：新增一行资源种类（行会工分，受限转让）与一对新来源去处代号，不改代码即可开户、入账、转移、受限转让被拒、限额分配、进月结', () => {
  const ext = structuredClone(rules);
  ext.economyResources.res_t_guildscrip = row('resfam_claim', 'tr_restricted', ['src_t_guild'], ['sink_t_guild']);
  ext.economyLedger.budget.res_t_guildscrip = { src_t_guild: { limit: 4 } };
  ext.economyLedger.alert.res_t_guildscrip = { sink_t_guild: 2 };
  const E = { ...ENGINE, rules: ext };
  const R = (holder, purpose) => ({ holder, purpose, resource: { kind: 'res_t_guildscrip', key: 'scrip_hall' } });
  const state = {};
  setDay(state, 3);
  const run = (fn) => runTransaction(state, CTX, fn);
  // 新来源是限额通道：当日两条申请 3、3 超过限额 4，各 3×4÷6=2，无余数。
  const alloc = allocateCapped(E, 'res_t_guildscrip', 'src_t_guild', 3, [{ key: 'npc_c', qty: 3 }, { key: 'npc_a', qty: 3 }]);
  assert.deepEqual(alloc.map((a) => [a.key[0], a.granted]), [['npc_a', 2], ['npc_c', 2]]);
  assert.deepEqual(run((s) => { openAccount(E, s, 'npc_a', { kind: 'res_t_guildscrip', key: 'scrip_hall' }, SH); for (const a of alloc) post(E, s, { legs: [{ account: R(a.key[0], SH), delta: a.granted }, { flow: 'src_t_guild', kind: 'res_t_guildscrip', qty: a.granted }], reason: 'verb_test' }); }), { ok: true });
  // 同一持有人分区之间可移动；给别人即受限（counterpartRX 空）
  assert.deepEqual(run((s) => { post(E, s, { legs: [{ account: R('npc_a', SH), delta: -1 }, { account: R('npc_a', PU), delta: 1 }], reason: 'verb_test' }); }), { ok: true });
  assert.deepEqual(run((s) => { post(E, s, { legs: [{ account: R('npc_a', SH), delta: -1 }, { account: R('npc_c', SH), delta: 1 }], reason: 'verb_test' }); }), { ok: false, code: 'E-LEDGER-TRANSFER-RESTRICTED' });
  // 新去处是物理律通道：用掉 3 超过 alert 2，月结派生预警缺口
  assert.deepEqual(run((s) => { post(E, s, { legs: [{ account: R('npc_c', SH), delta: -2 }, { account: R('npc_a', SH), delta: -1 }, { flow: 'sink_t_guild', kind: 'res_t_guildscrip', qty: 3 }], reason: 'verb_test' }); }), { ok: true });
  assert.deepEqual(auditLedger(E, state), []);
  let rep;
  assert.deepEqual(run((s) => { closeLedgerPeriod(E, s, 3, (r) => { rep = r; }); }), { ok: true });
  assert.deepEqual(JSON.parse(JSON.stringify(rep.gaps)), [{ code: 'W-LEDGER-ALERT', resource: 'res_t_guildscrip', flow: 'sink_t_guild', day: 3, used: 3, alert: 2 }]);
  assert.deepEqual(state.ledgerTotals.res_t_guildscrip, { sink_t_guild: { cumulative: 3, usedByDay: [] }, src_t_guild: { cumulative: 4, usedByDay: [] } });
});
