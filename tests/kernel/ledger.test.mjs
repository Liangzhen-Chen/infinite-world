// 块 3 第 3-1 张《资源种类表、词表与账本骨架》：三元键、openAccount、balance / accountsOf / stockIn、资源种类表与本卷词表族加载校验、
// ledger.json 生效日窗口（K3-40）、families 反推与 reportGroup 显式空（K3-41）、开户实体核对待块 6（K3-44）。
// 依据卷六 §2.1 :103–122、§2.2 :128–132、§2.5 :224、§3.1 :253–255、§3.2 :288、§4.1 规则 1、10（:355、:381）、§4.22.1 :1236–1248；
// 李白 11-18 02:20 块 3 丙类裁定。期望值一律手写字面量，不用被测函数算。
// 持有人：块 3 没有人物、组织等实体表，按 K3-44 用登记场景——在加载期注册表里登记几个测试 id（不进 world/）；
// 可见用途分区 purpose_test_shelf 同理放扩展登记场景（迁移体检块3 第三节第 3 条：块 3 测试用的用途行不进 world/）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installVocab } from '../../server-plugin/kernel/vocab.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { accountKey, parseAccount, openAccount, balance, accountsOf, stockIn, checkLedgerTables, budgetOn } from '../../server-plugin/kernel/ledger.mjs';
import { compileLayout } from '../../server-plugin/kernel/save.mjs';
import { testTempRoot, writeUnderTempRoot } from '../accept/temp-root.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = loadWorld(ROOT);
assert.ok(W.ok, W.text);

// 登记场景：几个持有人 id 与一个对市场可见的用途分区。
const SHELF = { spendable: true, locksFor: null, visibleToMarket: true, trackOutflow: false };
const vocab = {
  families: W.vocab.families,
  index: new Map([...W.vocab.index, ['purpose_test_shelf', { family: 'purpose', prefix: 'purpose_', entry: SHELF }]]),
};
installVocab({ vocab, idIndex: new Map([...W.idIndex, ['npc_a', 'person'], ['org_b', 'org'], ['faith_c', 'faith'], ['item_q', 'item']]), tables: W.tables });
const ENGINE = { vocab, rules: W.rules };

const BLD = { kind: 'res_building_share', key: 'bld_x' };
const UNMAT = 'purpose_unmaterialized';
const CTX = { node: 'test_node', file: 'test/ledger.test.mjs' };
const codeIs = (code) => (e) => e.code === code;
const clone = (v) => JSON.parse(JSON.stringify(v));

// ---------- 三元键 ----------

test('三元键往返：accountKey → [持有人, 用途, 资源种类, 资源键]，parseAccount 还原', () => {
  const k = accountKey('npc_a', BLD, UNMAT);
  assert.deepEqual([...k], ['npc_a', 'purpose_unmaterialized', 'res_building_share', 'bld_x']);
  assert.deepEqual(parseAccount(k), { holder: 'npc_a', resource: { kind: 'res_building_share', key: 'bld_x' }, purpose: 'purpose_unmaterialized' });
  assert.deepEqual([...accountKey('org_b', { kind: 'res_unmaterialized_share', key: 'loc_p' }, UNMAT)], ['org_b', 'purpose_unmaterialized', 'res_unmaterialized_share', 'loc_p']);
});

test('三元键反例：段不是代号形、资源不是 {kind, key}、段数不对 → E-DIM-ID-FORMAT', () => {
  assert.throws(() => accountKey('Npc A', BLD, UNMAT), codeIs('E-DIM-ID-FORMAT'));
  assert.throws(() => accountKey('npc_a', { kind: 'res_building_share', key: 'bld_x', extra: 1 }, UNMAT), codeIs('E-DIM-ID-FORMAT'));
  assert.throws(() => accountKey('npc_a', { kind: 'res_building_share' }, UNMAT), codeIs('E-DIM-ID-FORMAT'));
  assert.throws(() => accountKey('npc_a', BLD, 'purpose.x'), codeIs('E-DIM-ID-FORMAT'));
  assert.throws(() => parseAccount(['npc_a', 'purpose_unmaterialized', 'res_building_share']), codeIs('E-DIM-ID-FORMAT'));
  assert.throws(() => parseAccount('npc_a|res_building_share|purpose_unmaterialized'), codeIs('E-DIM-ID-FORMAT'));
});

// ---------- openAccount ----------

test('openAccount 正例：事务内开零余额账户，返回账户键；已有账户原样返回不改余额', () => {
  const state = {};
  let key;
  assert.deepEqual(runTransaction(state, CTX, (s) => { key = openAccount(ENGINE, s, 'npc_a', BLD, UNMAT); }), { ok: true });
  assert.deepEqual([...key], ['npc_a', 'purpose_unmaterialized', 'res_building_share', 'bld_x']);
  assert.deepEqual(state, { accounts: { npc_a: { purpose_unmaterialized: { res_building_share: { bld_x: 0 } } } } });
  state.accounts.npc_a.purpose_unmaterialized.res_building_share.bld_x = 2500;
  assert.deepEqual(runTransaction(state, CTX, (s) => { openAccount(ENGINE, s, 'npc_a', BLD, UNMAT); }), { ok: true });
  assert.equal(state.accounts.npc_a.purpose_unmaterialized.res_building_share.bld_x, 2500);
  // 组织持有点数类以外的资源；地点持有未物化份额
  const s2 = {};
  assert.equal(runTransaction(s2, CTX, (s) => { openAccount(ENGINE, s, 'org_b', { kind: 'res_unmaterialized_share', key: 'loc_p' }, UNMAT); }).ok, true);
  assert.deepEqual(s2, { accounts: { org_b: { purpose_unmaterialized: { res_unmaterialized_share: { loc_p: 0 } } } } });
});

test('openAccount 整笔回滚：同一事务里后面被拒，前面开的户一并撤销', () => {
  const state = {};
  const r = runTransaction(state, CTX, (s) => {
    openAccount(ENGINE, s, 'npc_a', BLD, UNMAT);
    openAccount(ENGINE, s, 'npc_a', { kind: 'res_nope', key: 'bld_x' }, UNMAT);
  });
  assert.deepEqual(r, { ok: false, code: 'E-DIM-REF-MISSING' });
  assert.deepEqual(state, {});
});

test('openAccount 被拒原因码：资源、用途、持有人逐项', () => {
  const reject = (holder, res, purpose, state = {}) => runTransaction(state, CTX, (s) => { openAccount(ENGINE, s, holder, res, purpose); });
  assert.deepEqual(reject('npc_a', { kind: 'res_nope', key: 'bld_x' }, UNMAT), { ok: false, code: 'E-DIM-REF-MISSING' });
  assert.deepEqual(reject('npc_a', { kind: 'res_building_share', key: 'Bld X' }, UNMAT), { ok: false, code: 'E-DIM-ID-FORMAT' });
  assert.deepEqual(reject('npc_a', BLD, 'purpose_nope'), { ok: false, code: 'E-DIM-REF-MISSING' });
  assert.deepEqual(reject('npc_a', BLD, 'src_genesis'), { ok: false, code: 'E-DIM-REF-MISSING' });
  assert.deepEqual(reject('Npc A', BLD, UNMAT), { ok: false, code: 'E-DIM-ID-FORMAT' });
  // holder 的 kind 不在卷六 :103 的五类里
  assert.deepEqual(reject('item_q', BLD, UNMAT), { ok: false, code: 'E-DIM-REF-MISSING' });
  // faith、deity 目录行只用于点数类（:103）
  assert.deepEqual(reject('faith_c', BLD, UNMAT), { ok: false, code: 'E-DIM-REF-MISSING' });
  // 已终止（state.terminated 有标记）
  const dead = { terminated: { npc_a: { day: 3, cause: 'verb_x', mode: 'inherit' } } };
  assert.deepEqual(reject('npc_a', BLD, UNMAT, dead), { ok: false, code: 'E-TERM-RESIDUE' });
  assert.deepEqual(Object.keys(dead), ['terminated']);
});

test('openAccount 持有人实体核对待块 6（K3-44）：不在已载入实体注册表的持有人按 onUnknown error 报 E-DIM-UNKNOWN-READ，不静默开户', () => {
  const state = {};
  assert.deepEqual(runTransaction(state, CTX, (s) => { openAccount(ENGINE, s, 'npc_ghost', BLD, UNMAT); }), { ok: false, code: 'E-DIM-UNKNOWN-READ' });
  assert.deepEqual(state, {});
});

test('openAccount 只在事务内写；规则层 catch 住拒绝也照样整笔回滚', () => {
  assert.throws(() => openAccount(ENGINE, {}, 'npc_a', BLD, UNMAT), codeIs('E-VIEW-UNDECLARED-WRITE'));
  const state = {};
  const r = runTransaction(state, CTX, (s) => {
    openAccount(ENGINE, s, 'npc_a', BLD, UNMAT);
    try { openAccount(ENGINE, s, 'npc_ghost', BLD, UNMAT); } catch { /* 规则层吞掉也不放行 */ }
  });
  assert.deepEqual(r, { ok: false, code: 'E-DIM-UNKNOWN-READ' });
  assert.deepEqual(state, {});
});

// ---------- 读入口 ----------

const STATE = {
  accounts: {
    npc_a: {
      purpose_test_shelf: { res_building_share: { bld_y: 300 } },
      purpose_unmaterialized: { res_building_share: { bld_x: 2500 }, res_unmaterialized_share: { loc_p: 10000 } },
    },
    org_b: { purpose_unmaterialized: { res_unmaterialized_share: { loc_p: 0 } } },
  },
};

test('balance：已开账户读余额，未开为 0；资源与用途不合即拒', () => {
  assert.equal(balance(ENGINE, STATE, 'npc_a', BLD, UNMAT), 2500);
  assert.equal(balance(ENGINE, STATE, 'npc_a', { kind: 'res_unmaterialized_share', key: 'loc_p' }, UNMAT), 10000);
  assert.equal(balance(ENGINE, STATE, 'npc_a', BLD, 'purpose_test_shelf'), 0);
  assert.equal(balance(ENGINE, STATE, 'org_b', BLD, UNMAT), 0);
  assert.throws(() => balance(ENGINE, STATE, 'npc_a', { kind: 'res_nope', key: 'bld_x' }, UNMAT), codeIs('E-DIM-REF-MISSING'));
  assert.throws(() => balance(ENGINE, STATE, 'npc_a', BLD, 'purpose_nope'), codeIs('E-DIM-REF-MISSING'));
});

test('accountsOf：按族与用途筛，按（用途、种类、键）升序；筛选项不合即拒', () => {
  assert.deepEqual(clone(accountsOf(ENGINE, STATE, 'npc_a')), [
    { holder: 'npc_a', resource: { kind: 'res_building_share', key: 'bld_y' }, purpose: 'purpose_test_shelf', balance: 300 },
    { holder: 'npc_a', resource: { kind: 'res_building_share', key: 'bld_x' }, purpose: 'purpose_unmaterialized', balance: 2500 },
    { holder: 'npc_a', resource: { kind: 'res_unmaterialized_share', key: 'loc_p' }, purpose: 'purpose_unmaterialized', balance: 10000 },
  ]);
  assert.deepEqual(clone(accountsOf(ENGINE, STATE, 'npc_a', { family: 'resfam_claim' })), [
    { holder: 'npc_a', resource: { kind: 'res_unmaterialized_share', key: 'loc_p' }, purpose: 'purpose_unmaterialized', balance: 10000 },
  ]);
  assert.deepEqual(clone(accountsOf(ENGINE, STATE, 'npc_a', { family: 'resfam_asset', purpose: 'purpose_unmaterialized' })), [
    { holder: 'npc_a', resource: { kind: 'res_building_share', key: 'bld_x' }, purpose: 'purpose_unmaterialized', balance: 2500 },
  ]);
  assert.deepEqual(clone(accountsOf(ENGINE, STATE, 'npc_a', { family: 'resfam_goods' })), []);
  assert.deepEqual(clone(accountsOf(ENGINE, STATE, 'faith_c')), []);
  assert.throws(() => accountsOf(ENGINE, STATE, 'npc_a', { family: 'resfam_nope' }), codeIs('E-DIM-REF-MISSING'));
  assert.throws(() => accountsOf(ENGINE, STATE, 'npc_a', { purpose: 'res_building_share' }), codeIs('E-DIM-REF-MISSING'));
  assert.throws(() => accountsOf(ENGINE, STATE, 'npc_a', { place: 'loc_p' }), codeIs('E-DIM-STRUCT-FIELD'));
});

test('stockIn 已做一半：只数 visibleToMarket 为真的分区；没有候选账户即 0', () => {
  // 余额都在不可见分区 purpose_unmaterialized（卷六 :130 visibleToMarket 假）
  assert.equal(stockIn(ENGINE, STATE, 'loc_p', { kind: 'res_unmaterialized_share' }), 0);
  // 可见分区里该键没有账户
  assert.equal(stockIn(ENGINE, STATE, 'loc_p', { kind: 'res_building_share', key: 'bld_x' }), 0);
  // 可见分区的账户余额为 0
  const zero = clone(STATE);
  zero.accounts.npc_a.purpose_test_shelf.res_building_share.bld_y = 0;
  assert.equal(stockIn(ENGINE, zero, 'loc_p', { kind: 'res_building_share' }), 0);
  assert.throws(() => stockIn(ENGINE, STATE, 'loc_p', { kind: 'res_nope' }), codeIs('E-DIM-REF-MISSING'));
  assert.throws(() => stockIn(ENGINE, STATE, 'loc_p', { kind: 'res_building_share', place: 'x' }), codeIs('E-DIM-STRUCT-FIELD'));
});

test('stockIn 在场一半待块 6（K3-44）：有可见候选时范围与在场读不到，抛 E-DIM-UNKNOWN-READ，不当全在或全不在', () => {
  assert.throws(() => stockIn(ENGINE, STATE, 'loc_p', { kind: 'res_building_share' }), codeIs('E-DIM-UNKNOWN-READ'));
  assert.throws(() => stockIn(ENGINE, STATE, 'loc_p', { kind: 'res_building_share', key: 'bld_y' }), codeIs('E-DIM-UNKNOWN-READ'));
});

// ---------- 资源种类表与词表 ----------

test('资源种类表两行（卷六 :112、:371）与本卷词表族按登记载入', () => {
  const rows = W.rules.economyResources;
  assert.deepEqual(Object.keys(rows).sort(), ['res_building_share', 'res_unmaterialized_share']);
  assert.deepEqual([rows.res_building_share.family, rows.res_building_share.unit, rows.res_building_share.sources, rows.res_building_share.sinks],
    ['resfam_asset', 'asset_share_bp', ['src_genesis', 'src_transform'], ['sink_loss']]);
  assert.deepEqual([rows.res_unmaterialized_share.family, rows.res_unmaterialized_share.unit, rows.res_unmaterialized_share.sources, rows.res_unmaterialized_share.sinks],
    ['resfam_claim', 'asset_share_bp', ['src_genesis'], ['sink_transform']]);
  const fam = (f) => Object.keys(W.vocab.families.get(f).entries).sort();
  assert.deepEqual(fam('resfam'), ['resfam_asset', 'resfam_claim', 'resfam_coin', 'resfam_goods', 'resfam_point', 'resfam_stock']);
  assert.equal(W.vocab.families.get('resfam').closed, true);
  assert.deepEqual(fam('transferability'), ['tr_bound', 'tr_free', 'tr_restricted']);
  assert.deepEqual(fam('budget_mode'), ['bm_capped', 'bm_physical']);
  assert.deepEqual(fam('purpose'), ['purpose_unmaterialized']);
  assert.deepEqual(W.vocab.index.get('purpose_unmaterialized').entry, { locksFor: null, spendable: false, trackOutflow: false, visibleToMarket: false });
  assert.deepEqual(fam('src'), ['src_birth', 'src_boundary', 'src_genesis', 'src_issue', 'src_regrow', 'src_transform']);
  assert.deepEqual(fam('sink'), ['sink_boundary', 'sink_consume', 'sink_death', 'sink_decay', 'sink_depart', 'sink_loss', 'sink_redeem', 'sink_seized', 'sink_transform']);
  assert.deepEqual(checkLedgerTables(W.rules, W.env), []);
});

test('families 由资源种类行反推（K3-41）：字面量；src_boundary 照卷六 :1242 明写只含物品', () => {
  const families = (id) => W.vocab.index.get(id).entry.families;
  assert.deepEqual(families('src_genesis'), ['resfam_asset', 'resfam_claim']);
  assert.deepEqual(families('src_transform'), ['resfam_asset']);
  assert.deepEqual(families('sink_loss'), ['resfam_asset']);
  assert.deepEqual(families('sink_transform'), ['resfam_claim']);
  assert.deepEqual(families('src_boundary'), ['resfam_goods']);
  for (const id of ['src_birth', 'src_issue', 'src_regrow', 'sink_boundary', 'sink_consume', 'sink_death', 'sink_decay', 'sink_depart', 'sink_redeem', 'sink_seized']) assert.deepEqual(families(id), [], id);
  assert.equal(W.vocab.index.get('src_genesis').entry.grade, 'designed');
  assert.equal(W.vocab.index.get('src_boundary').entry.grade, 'referenced');
  assert.equal(W.vocab.index.get('src_transform').entry.pairedWith, 'sink_transform');
  assert.equal(W.vocab.index.get('sink_transform').entry.pairedWith, 'src_transform');
  assert.equal(W.vocab.index.get('src_genesis').entry.budgetMode, 'bm_capped');
  assert.equal(W.vocab.index.get('src_boundary').entry.budgetMode, 'bm_capped');
  assert.equal(W.vocab.index.get('sink_loss').entry.budgetMode, 'bm_physical');
});

test('reportGroup 显式写 null，不缺键（K3-41；indicator 族在块 7）', () => {
  const ids = [...W.vocab.index].filter(([, r]) => r.family === 'src' || r.family === 'sink');
  assert.equal(ids.length, 15);
  for (const [id, r] of ids) {
    assert.ok(Object.hasOwn(r.entry, 'reportGroup'), id);
    assert.equal(r.entry.reportGroup, null, id);
  }
  // 缺键即加载校验报错
  const v = vocabWith((idx) => { const e = { ...idx.get('sink_decay').entry }; delete e.reportGroup; idx.set('sink_decay', { ...idx.get('sink_decay'), entry: e }); });
  assert.deepEqual(errs(W.rules, v), [['E-DIM-STRUCT-FIELD', 'sink_decay', 'reportGroup']]);
});

// 改一处的 env 与 rules 拷贝。
function vocabWith(edit) {
  const index = new Map([...W.vocab.index].map(([k, r]) => [k, { ...r, entry: clone(r.entry) }]));
  const families = new Map([...W.vocab.families].map(([k, f]) => [k, { ...f, entries: clone(f.entries) }]));
  edit(index, families);
  // families 的条目与 index 同步（加载校验按族枚举条目、按 index 取字段）
  for (const [id, r] of index) if (families.has(r.family)) families.get(r.family).entries[id] = r.entry;
  return { ...W.env, vocab: { ...W.env.vocab, index, families } };
}
const rulesWith = (edit) => { const r = clone(W.rules); edit(r); return r; };
const errs = (rules, env = W.env) => checkLedgerTables(rules, env).map((e) => [e.code, e.row, e.dim]);

test('词表加载校验反例：来源去处条目、用途条目', () => {
  // 多出字段
  assert.deepEqual(errs(W.rules, vocabWith((idx) => { idx.get('src_regrow').entry.weight = 1; })), [['E-DIM-STRUCT-FIELD', 'src_regrow', 'weight']]);
  // budgetMode 不是 budget_mode 条目
  assert.deepEqual(errs(W.rules, vocabWith((idx) => { idx.get('src_regrow').entry.budgetMode = 'tr_free'; })), [['E-DIM-DOMAIN-ENUM', 'src_regrow', 'budgetMode']]);
  // families 未排序或不是 resfam 条目
  assert.deepEqual(errs(W.rules, vocabWith((idx) => { idx.get('src_regrow').entry.families = ['resfam_stock', 'resfam_goods']; })), [['E-DIM-DOMAIN-ENUM', 'src_regrow', 'families']]);
  assert.deepEqual(errs(W.rules, vocabWith((idx) => { idx.get('src_regrow').entry.families = ['res_building_share']; })), [['E-DIM-DOMAIN-ENUM', 'src_regrow', 'families']]);
  // pairedWith 不互指、指向同族
  assert.deepEqual(errs(W.rules, vocabWith((idx) => { idx.get('sink_transform').entry.pairedWith = null; })), [['E-DIM-REF-MISSING', 'src_transform', 'pairedWith']]);
  assert.deepEqual(errs(W.rules, vocabWith((idx) => { idx.get('src_regrow').entry.pairedWith = 'src_birth'; })), [['E-DIM-REF-MISSING', 'src_regrow', 'pairedWith']]);
  // reportGroup 非空而 indicator 族未登记
  assert.deepEqual(errs(W.rules, vocabWith((idx) => { idx.get('src_regrow').entry.reportGroup = 'ind_x'; })), [['E-DIM-REF-MISSING', 'src_regrow', 'reportGroup']]);
  // grade 不在来源级别里
  assert.deepEqual(errs(W.rules, vocabWith((idx) => { idx.get('src_regrow').entry.grade = 'guess'; })), [['E-DIM-DOMAIN-ENUM', 'src_regrow', 'grade']]);
  // 用途条目缺 trackOutflow、spendable 不是布尔、locksFor 不是 ckind 条目
  assert.deepEqual(errs(W.rules, vocabWith((idx) => { delete idx.get('purpose_unmaterialized').entry.trackOutflow; })), [['E-DIM-STRUCT-FIELD', 'purpose_unmaterialized', 'trackOutflow']]);
  assert.deepEqual(errs(W.rules, vocabWith((idx) => { idx.get('purpose_unmaterialized').entry.spendable = 0; })), [['E-DIM-DOMAIN-RANGE', 'purpose_unmaterialized', 'spendable']]);
  assert.deepEqual(errs(W.rules, vocabWith((idx) => { idx.get('purpose_unmaterialized').entry.locksFor = 'ckind_x'; })), [['E-DIM-REF-MISSING', 'purpose_unmaterialized', 'locksFor']]);
});

test('资源种类表加载校验反例：族条目缺行、unit 不在单位表、counterpartRX 只在 tr_restricted、行族不在来源 families 里', () => {
  // resource 族多一个条目而表里没有行
  assert.deepEqual(errs(W.rules, vocabWith((idx) => { idx.set('res_extra', { family: 'resource', prefix: 'res_', entry: {} }); })), [['E-DIM-REF-MISSING', 'res_extra', '']]);
  assert.deepEqual(errs(rulesWith((r) => { r.economyResources.res_building_share.unit = 'zz_unit'; })), [['E-DIM-UNIT-UNKNOWN', 'res_building_share', 'unit']]);
  assert.deepEqual(errs(rulesWith((r) => { r.economyResources.res_building_share.counterpartRX = 'true'; })), [['E-DIM-STRUCT-FIELD', 'res_building_share', 'counterpartRX']]);
  // 以 src_regrow（families 为空）为来源：families 须含该行的族（families 由行反推，登行的卡同时补 families）
  assert.deepEqual(errs(rulesWith((r) => { r.economyResources.res_building_share.sources = ['src_genesis', 'src_regrow', 'src_transform']; })), [['E-DIM-DOMAIN-ENUM', 'res_building_share', 'sources']]);
});

test('ledger.json 加载校验反例：budget 只登限额通道、alert 只登物理律通道、代号须在该行 sources ∪ sinks', () => {
  assert.deepEqual(errs(rulesWith((r) => { r.economyLedger.budget.res_building_share.src_transform = { limit: 1 }; })),
    [['E-DIM-DOMAIN-ENUM', 'budget', 'res_building_share/src_transform']]);
  assert.deepEqual(errs(rulesWith((r) => { r.economyLedger.alert.res_building_share.src_genesis = 5; })),
    [['E-DIM-DOMAIN-ENUM', 'alert', 'res_building_share/src_genesis']]);
  assert.deepEqual(errs(rulesWith((r) => { r.economyLedger.alert.res_building_share.sink_consume = null; })),
    [['E-DIM-REF-MISSING', 'alert', 'res_building_share/sink_consume']]);
});

// ---------- 生效日窗口（K3-40） ----------

test('生效日窗口：src_genesis 窗口 [0,0] 合法——第 0 日不限，第 1 日起关闭', () => {
  assert.deepEqual(clone(W.rules.economyLedger.budget.res_building_share.src_genesis), { activeFromDay: 0, activeToDay: 0, limit: null });
  assert.deepEqual(budgetOn(ENGINE, 'res_building_share', 'src_genesis', 0), { active: true, limit: null });
  assert.deepEqual(budgetOn(ENGINE, 'res_building_share', 'src_genesis', 1), { active: false, limit: 0 });
  assert.deepEqual(budgetOn(ENGINE, 'res_unmaterialized_share', 'src_genesis', 365), { active: false, limit: 0 });
  // 没有这一格 = 不限（卷六 :224 空 = 不限）
  assert.deepEqual(budgetOn(ENGINE, 'res_building_share', 'src_transform', 9), { active: true, limit: null });
  assert.throws(() => budgetOn(ENGINE, 'res_building_share', 'src_genesis', -1), codeIs('E-DIM-DOMAIN-RANGE'));
  assert.throws(() => budgetOn(ENGINE, 'res_building_share', 'src_genesis', 0.5), codeIs('E-DIM-DOMAIN-RANGE'));
});

test('生效日窗口缺省全程：两端都不写，任何一日都在窗口内', () => {
  const rules = rulesWith((r) => { r.economyLedger.budget.res_building_share.src_genesis = { limit: 5 }; });
  assert.deepEqual(errs(rules), []);
  const e = { vocab, rules };
  assert.deepEqual(budgetOn(e, 'res_building_share', 'src_genesis', 0), { active: true, limit: 5 });
  assert.deepEqual(budgetOn(e, 'res_building_share', 'src_genesis', 100000), { active: true, limit: 5 });
  // 只写下端：下端之前关闭
  const from = { vocab, rules: rulesWith((r) => { r.economyLedger.budget.res_building_share.src_genesis = { limit: 5, activeFromDay: 10 }; }) };
  assert.deepEqual(budgetOn(from, 'res_building_share', 'src_genesis', 9), { active: false, limit: 0 });
  assert.deepEqual(budgetOn(from, 'res_building_share', 'src_genesis', 10), { active: true, limit: 5 });
});

// 经统一加载器（规则表加载器 + checkLedgerTables 接点）跑一份改坏 ledger.json 的规则目录。
function loadWithLedger(cell) {
  const tmpRoot = testTempRoot('b31-ledger-');
  try {
    const real = (f) => readFileSync(join(ROOT, 'world/rules', f), 'utf8');
    const reg = JSON.parse(real('registry.json'));
    writeUnderTempRoot(tmpRoot, 'registry.json', JSON.stringify(reg));
    for (const row of reg.rows) writeUnderTempRoot(tmpRoot, row.file, real(row.file));
    const led = JSON.parse(real('tables/economy/ledger.json'));
    led.rows.find((r) => r.key === 'budget').value.res_building_share.src_genesis = cell;
    writeUnderTempRoot(tmpRoot, 'tables/economy/ledger.json', JSON.stringify(led));
    const r = loadWorld(ROOT, { rulesDir: tmpRoot });
    return r.errors.filter((e) => e.severity === 'error').map((e) => [e.code, e.table]);
  } finally { rmSync(tmpRoot, { recursive: true, force: true }); }
}

test('生效日窗口经统一加载器：from>to 报 E-DIM-DOMAIN-RANGE；负日、非整数日按登记类型报同码；[0,0] 与缺省全程通过', () => {
  assert.deepEqual(loadWithLedger({ activeFromDay: 5, activeToDay: 2, limit: null }), [['E-DIM-DOMAIN-RANGE', 'rules.economyLedger']]);
  assert.deepEqual(loadWithLedger({ activeFromDay: -1, activeToDay: 0, limit: null }), [['E-DIM-DOMAIN-RANGE', 'rules.economyLedger']]);
  assert.deepEqual(loadWithLedger({ activeFromDay: 0, activeToDay: 0.5, limit: null }), [['E-DIM-DOMAIN-RANGE', 'rules.economyLedger']]);
  assert.deepEqual(loadWithLedger({ activeFromDay: 0, activeToDay: 0, limit: null }), []);
  assert.deepEqual(loadWithLedger({ limit: 3 }), []);
  // 窗口字段以外的键
  assert.deepEqual(loadWithLedger({ limit: 3, untilDay: 4 }), [['E-DIM-STRUCT-FIELD', 'rules.economyLedger']]);
});

// ---------- 登记 ----------

test('doc_ledger 落片（卷二十七 R27-4.6 第 6 行 :540）：真实声明表的账本路径可由一条 doc_ledger 分片行完全覆盖', () => {
  // 分片表现由挂接方交入（kernel/save.mjs SaveLayout；save-layout.json 还没有 shards 键，登收尾待办）；这里按真实 pathTypes 拼一张，
  // 账本两条模式归 doc_ledger 一行，其余顶层键归 doc_state 一行。
  const ledgerTops = [...new Set(W.owners.ledgerPaths.map((p) => p.split('.')[0]))].sort();
  const stateTops = [...new Set(Object.keys(W.owners.pathTypes).map((p) => p.split('.')[0]))].filter((k) => !ledgerTops.includes(k)).sort();
  // 块 3-2 加 stockLots（卷三乙 :433 写者 kernel/ledger.mjs）与批次键计数器 ledgerCounters（李白 11-18 04:10）。
  // 块 6 第 6-3 张加 itemInstances（卷三乙 §3.3：实例路径 itemInstances.<id>.taint 与批次 taint 同一个写者 kernel/ledger.mjs，故该键含账本路径）。
  assert.deepEqual(ledgerTops, ['accounts', 'itemInstances', 'ledgerCounters', 'ledgerTotals', 'outflowTotals', 'stockLots']);
  const layout = {
    shards: [
      { shard: 'shd_data', part: 'doc_data', paths: ['*'], partition: 'part_single' },
      { shard: 'shd_append', part: 'doc_data', paths: [], partition: 'part_by_segment' },
      { shard: 'shd_state', part: 'doc_state', paths: stateTops, partition: 'part_single' },
      { shard: 'shd_ledger', part: 'doc_ledger', paths: ledgerTops, partition: 'part_single' },
      { shard: 'shd_log', part: 'doc_log', paths: [], partition: 'part_by_segment' },
    ],
    segmentEvents: 1, snapshotEveryEvents: 1, keepSnapshots: 1, saveSlotCount: 1,
  };
  const c = compileLayout(layout);
  assert.equal(c.rowOfPattern.get('accounts.*').part, 'doc_ledger');
  assert.equal(c.rowOfPattern.get('outflowTotals.*').part, 'doc_ledger');
  assert.equal(c.rowOfPattern.get('ledgerTotals').part, 'doc_ledger');
  assert.equal(c.rowOfPattern.get('stockLots.*').part, 'doc_ledger');
  assert.equal(c.rowOfPattern.get('ledgerCounters.lotNext').part, 'doc_ledger');
});

test('kernelApi 登记账本已实现的入口（卷六 :351 六名加 alertGaps）；账本路径写者只有 kernel/ledger.mjs；sys.economy 两个闭集字段显式空值', () => {
  const decl = JSON.parse(readFileSync(join(ROOT, 'world/ontology/state-owners.json'), 'utf8'));
  assert.deepEqual(decl.kernelApi.exports.filter((x) => x.export.startsWith('kernel/ledger.mjs#')).map((x) => [x.export, x.callers, x.acceptsState]), [
    ['kernel/ledger.mjs#openAccount', ['rules'], true],
    ['kernel/ledger.mjs#balance', ['rules'], true],
    ['kernel/ledger.mjs#accountsOf', ['rules'], true],
    ['kernel/ledger.mjs#stockIn', ['rules'], true],
    ['kernel/ledger.mjs#post', ['rules'], true],
    ['kernel/ledger.mjs#transfer', ['rules'], true],
    // 3-3c：日终分配结算入口（调用者块 7 settleTrade 所在层，现按 rules；卷六 §4.1 规则 6 :376、李白 11-18 07:02 选丙；S6-13 照核）。
    ['kernel/ledger.mjs#settleCappedAllocation', ['rules'], true],
    ['kernel/ledger.mjs#alertGaps', ['rules'], false],
    // 3-3：限额通道分配（调用者 trade.mjs 的 settleTrade，卷六 §4.6 规则 8 :582）与月结账本侧（调用者 economy-report.mjs 的 closePeriod，§4.22 规则 4 :1261），块 7 接。
    ['kernel/ledger.mjs#prorateCapped', ['rules'], false],
    ['kernel/ledger.mjs#allocateCapped', ['rules'], false],
    ['kernel/ledger.mjs#closeLedgerPeriod', ['rules'], true],
    // 6-3：批次合并（K-3）、判同键纯函数与赃物份额记录（§3.3 "taint 的写者"）；调用者 item-lots.mjs 与卷八b 的执行器所在层，现按 rules。
    ['kernel/ledger.mjs#mergeLots', ['rules'], true],
    ['kernel/ledger.mjs#lotsUnmergeable', ['rules'], false],
    ['kernel/ledger.mjs#recordTaint', ['rules'], true],
  ]);
  // 5-4：内核终止协议第 3 步账户分流经账本转移（卷二 §2.6 :522），transfer 另以 callerFiles 只放行该文件（李白 11-19 11:1x ①；卷二 §2.7 勘误 1118k30 两者取并集）。
  assert.deepEqual(decl.kernelApi.exports.filter((x) => x.callerFiles && x.export.startsWith('kernel/ledger.mjs#')).map((x) => [x.export, x.callerFiles]), [['kernel/ledger.mjs#post', ['kernel/dimension-writers.mjs']], ['kernel/ledger.mjs#transfer', ['kernel/terminate.mjs']]]);
  // 6-3：建物品实例（卷九 R9-2.7）由内核写者 kernel/dimension-writers.mjs 在同一事务内 post 来源腿，post 另以 callerFiles 放行该文件。
  assert.deepEqual(decl.stateKeys.accounts.writers, { '*': 'kernel/ledger.mjs' });
  assert.deepEqual(decl.stateKeys.outflowTotals.writers, { '*': 'kernel/ledger.mjs' });
  // 6-3：批次的腐坏两字段（spoilage、rotAnchorDay）的声明写者是 item-lots.mjs（卷三乙 §3.3），其余批次属性仍只有账本写。
  assert.deepEqual(decl.stateKeys.stockLots.writers, { '*': 'kernel/ledger.mjs', '*.*.*.*.spoilage': 'item-lots.mjs', '*.*.*.*.rotAnchorDay': 'item-lots.mjs' });
  assert.deepEqual(decl.stateKeys.ledgerCounters.writers, { lotNext: 'kernel/ledger.mjs' });
  assert.equal(decl.pathTypes['stockLots.*'], 'struct:holderLots');
  assert.equal(decl.pathTypes['ledgerCounters.lotNext'], 'integer:count');
  // ledgerTotals 整键（卷二 §1.5 :247 struct:resourceTotals，李白 11-18 02:55；块 3-2）
  assert.deepEqual(decl.stateKeys.ledgerTotals.writers, { '': 'kernel/ledger.mjs' });
  assert.equal(decl.pathTypes.ledgerTotals, 'struct:resourceTotals');
  assert.equal(decl.keyKinds.ledgerTotals, undefined);
  assert.equal(decl.pathTypes['npcs.*.coins'], undefined);
  const eco = decl.systems['sys.economy'];
  // stockLots.* 写者 ledger.mjs（卷三乙 §3.3 :434），系统写者列表同登（Opus 只核必须改 2）
  assert.deepEqual([eco.entryCallerFiles, eco.entryJudges, eco.writers], [{}, [], ['accounts.*', 'ledgerCounters.lotNext', 'ledgerTotals', 'outflowTotals.*', 'stockLots.*']]);
  assert.deepEqual(Object.keys(eco.sources), ['src_birth', 'src_boundary', 'src_genesis', 'src_issue', 'src_regrow', 'src_transform']);
  assert.equal(eco.sinks.length, 9);
  assert.equal(decl.kernelApi.exports.some((x) => x.export.endsWith('#declareLedgerWriter')), false);
});
