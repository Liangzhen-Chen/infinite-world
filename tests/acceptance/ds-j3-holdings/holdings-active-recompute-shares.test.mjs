// 验收测试（出题方：Claude Sonnet 5.5 中档；写修复的是另一个模型，审卡的是第三方）。
// 依据与测什么（偏离清查-1122 甲 5、6；甲 7 见下）：
// ⑤ 现役判定（09d #1）：卷十七 :637 "领队持有一条……`terms.until` 未过的关卡放行边"、A17-7.2 :665 "其 `terms.until` 未过期间"、
//    卷十八 R18-1.10 :526/A18-1.6 :682 "`until` 建立时等于边当刻的 `terms.until`（可空）"——建立时带预定到期时间的边在到期前是现役边，到期后才不是。
//    测：开边时带未来的 until，到期前 openHoldingsOfKind 列它、能按 id 关闭它（不能报"已关闭"）；时钟过了 until 后不再列。
//    修前失败：holdings.mjs:245-251 activeEdges 只认 until === null，带预定到期的现役边被当成已关闭（列不出、关不掉）。
// ⑥ R18-1.12 ② :531 "把同一持有者在该种类下的现役边按建立先后排序（先按 terms.since 升序，同刻按边 id 的代号序），从空集开始逐条放回：
//    放回后条件为真的留下，为假的……处置"。测：持有者 npc_a 有三条 holdWhile 种类的现役边，边句柄序与建立先后序不一致，
//    读数 handsHeld 取"此刻状态里该持有者现役边数"，graspLimbs 取 2。按卷文：建立最早两条（since 10、20）放回时 1、2 ≤ 2 留下，最晚一条（since 30）放回时 3 > 2 被关。
//    修前失败：holdings.mjs:878-893 按存储（句柄）顺序遍历，先关了句柄序最前的那条（since 10），不是建立最晚的。
// ⑦ checkShareSums（09e #4）本文件不出题：缺 share 一支，写入口 holdings.mjs:514-516 已先拒（缺 share 的边写不进来），"缺 share 记 0"从公开入口不可达；
//    空组一支，卷十八 :342 只说"各现役边之和等于 shareSum"，没说标的上一条边都没有时怎么判，终止协议关光全部边是合法路径，需裁定，见出题.md。
// 前提造法同 tests/kernel/holdings.test.mjs（真实 world 加载、测试种类行只进本进程注册表），不读仓库当前基线数。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from '../../../server-plugin/kernel/load/world.mjs';
import { installVocab } from '../../../server-plugin/kernel/vocab.mjs';
import { runTransaction, currentTransaction } from '../../../server-plugin/kernel/transaction.mjs';
import { installEventLog } from '../../../server-plugin/kernel/events.mjs';
import { installDigestCap } from '../../../server-plugin/kernel/save.mjs';
import { createDigestCap } from '../../../server-plugin/textcore/digest.mjs';
import { registerViewReader, resetViewRegistry } from '../../../server-plugin/kernel/view-registry.mjs';
import { useReportSink } from '../../../server-plugin/kernel/report.mjs';
import { openHolding, closeHolding, openHoldingsOfKind, installHoldingEngine } from '../../../server-plugin/kernel/holdings.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const W = loadWorld(ROOT);
assert.ok(W.ok, W.text);
installDigestCap(createDigestCap());
useReportSink(() => {});

const CAUSE = 'act_test_hold';
const CTX = { node: 'test_holdings', file: 'tests/acceptance/ds-j3-holdings/holdings-active-recompute-shares.test.mjs' };
const MINUTE = 10;

installVocab({
  vocab: W.vocab,
  idIndex: new Map([...W.idIndex, ['npc_a', 'person'], ['npc_b', 'person'], ['place_x', 'place'], ['item_q', 'item'], ['batch_y', 'item'], ['container_x', 'item']]),
  tables: W.tables,
});
const ENGINE = { vocab: W.vocab, rules: W.rules, units: W.env.units, tables: W.tables, template: { seed: 'test_holdings_seed' } };

let book;
function fresh(engine) {
  installHoldingEngine(engine);
  book = { entries: [] };
  installEventLog(book);
  return { clock: { minute: MINUTE, seq: 0 } };
}
const run = (state, body) => runTransaction(state, CTX, body);

// 种类行：字段照卷十八 §2.6 的 40 列给全（测试种类行，只在本进程注册表里）。
function row(over = {}) {
  return {
    id: 'hk_test_x', hyper: null, from: ['agent'], to: ['thing'], exclusive: false,
    gone: 'ho_close', vacated: 'ho_close', defected: null, subjectEnd: 'send_close',
    concluded: false, functional: false, membership: false, headship: false, carriesRel: false,
    conduct: 0, conductBack: 0, adopt: 0, pins: 'pside_none',
    intimate: false, bodyControl: false, holderMax: null, succeedBy: null, excludes: false,
    grantsEntry: false, entryRankMax: null, visibility: 'public', contest: null, capacityKey: null,
    transferable: false, incompatible: [], grants: [], hooks: [], termsKeys: [], shareSum: null,
    grantedBy: [], domicile: false, holdWhile: null, revival: null, admission: null, uniqueTriple: false,
    ...over,
  };
}
function engineWith(rows) {
  const index = new Map(W.vocab.index);
  for (const r of rows) index.set(r.id, { family: 'holding_kind', prefix: 'hk_', entry: r });
  return { ...ENGINE, vocab: { ...W.vocab, index } };
}

// ---------- ⑤ 带预定到期的现役边 ----------

test('⑤ 开边带未来的 until：到期前是现役边（openHoldingsOfKind 列出、能按 id 关闭），时钟过了 until 之后不再列（卷十七 :637、A17-7.2；卷十八 R18-1.10）', () => {
  const engine = engineWith([row({ id: 'hk_test_pass' })]);
  const state = fresh(engine);
  let id;
  assert.deepEqual(run(state, (s) => { id = openHolding(engine, s, { holdingKind: 'hk_test_pass', holder: 'npc_a', subject: 'place_x', terms: { until: 60 }, cause: CAUSE }); }), { ok: true });
  // 到期前（时钟 10 < until 60）：现役。
  assert.deepEqual(openHoldingsOfKind(state, 'hk_test_pass'), [{ id, holder: 'npc_a', subject: 'place_x' }]);
  // 时钟过了 until（100 > 60）：不再是现役边。
  state.clock.minute = 100;
  assert.deepEqual(openHoldingsOfKind(state, 'hk_test_pass'), []);
});

test('⑤ 带未来 until 的现役边可以被正常关闭（不报"已关闭"），关闭后 until 改写成关闭时刻', () => {
  const engine = engineWith([row({ id: 'hk_test_pass' })]);
  const state = fresh(engine);
  let id;
  assert.deepEqual(run(state, (s) => { id = openHolding(engine, s, { holdingKind: 'hk_test_pass', holder: 'npc_a', subject: 'place_x', terms: { until: 60 }, cause: CAUSE }); }), { ok: true });
  assert.deepEqual(run(state, (s) => closeHolding(engine, s, { id, cause: CAUSE })), { ok: true });
  assert.equal(state.holdings.npc_a[id].terms.until, MINUTE);
  assert.deepEqual(openHoldingsOfKind(state, 'hk_test_pass'), []);
});

// ---------- ⑥ R18-1.12 ②：从空集按建立先后逐条放回 ----------

const WIELD = 'hk_test_wield';
const edge = (id, subject, since) => [id, { kind: WIELD, holder: 'npc_a', subject, terms: { since, until: null, endReason: null, suspended: false, consentAct: null, grantor: null }, grantedBy: null }];

test('⑥ 重算按建立先后从空集放回：三条边句柄序与建立先后不一致，graspLimbs 收到 2 后，关的是建立最晚的那条（since 30），不是句柄序最前的', () => {
  const engine = engineWith([row({ id: WIELD, holdWhile: 'holder.handsHeld <= holder.graspLimbs && subject.wielders <= subject.wieldHands' })]);
  const state = fresh(engine);
  // 三条现役边：句柄序 hld_1、hld_2、hld_3；建立时刻 10、30、20。
  state.holdings = { npc_a: Object.fromEntries([edge('hld_1', 'item_q', 10), edge('hld_2', 'batch_y', 30), edge('hld_3', 'container_x', 20)]) };
  const values = { limbs: 2 };
  resetViewRegistry();
  // 读数：handsHeld = 传入状态里该持有者此种类的现役边数（until 为空）；物一端读数恒满足。
  registerViewReader('personView', 'test/holdings-view.mjs', (_e, s, id) => ({
    graspLimbs: values.limbs,
    handsHeld: Object.values((s.holdings && s.holdings[id]) || {}).filter((r) => r.kind === WIELD && r.terms.until === null).length,
  }));
  registerViewReader('itemView', 'test/holdings-view.mjs', () => ({ wieldHands: 2, wielders: 1 }));
  state.clock.minute = 40;
  // 模拟别的写者写到持有者的读数（不碰 holdings 路径），触发提交前重算。
  assert.deepEqual(run(state, () => { currentTransaction().written.push(['created', 'npc_a', 'props', 'graspLimbs']); }), { ok: true });
  const until = (id) => state.holdings.npc_a[id].terms.until;
  // 卷文：按 since 升序 10、20、30 从空集放回：放回 10 时 handsHeld=1、放回 20 时 2，都 ≤ 2 留下；放回 30 时 3 > 2，关闭。
  assert.equal(until('hld_1'), null, 'since 10 的边应留下');
  assert.equal(until('hld_3'), null, 'since 20 的边应留下');
  assert.equal(until('hld_2'), 40, 'since 30 的边（建立最晚）应被关闭，until 取当前时刻 40');
  resetViewRegistry();
});

