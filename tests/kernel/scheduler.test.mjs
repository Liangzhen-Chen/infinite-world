// 块 4 第 4-1 张《调度器骨架、同刻全序与时钟入口》：tick_stage 六段、同刻全序键、clockView、advance 刻级回退点、争夺缺省表进规则表、
// 中文原因改代号、kernelApi 三名、rules.clock 与 due_kind / reaction_priority 加载校验。
// 依据卷二十《时间日历天气与环境》§2.1 :128–151、§3.1 :420、§3.2 :444、§4.1.3 第 1、2、4、7、8 条（:491–518）、§4.1.6 :548；
// 方案 §1.2 第 10 行 :53；迁移体检 块4.md 第四节 4-1 条。期望值一律手写字面量，不用被测函数算。
// 只跑不推进世界的小检查：advance 用两三刻的造的来源，不推进真实世界。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import { writePath } from '../../server-plugin/kernel/storage.mjs';
import {
  TICK_STAGE, PACE_CLASS, CONTEST_MODES, stageRank, dueKey, clockKey, reactionKey, sourceKey, compareKeys, dueKindRank, reactionPriorityRank,
  minutesPerDay, clockView, schedule, cancel, advance, resolveContest, checkClockTables, createWallTimer,
} from '../../server-plugin/kernel/scheduler.mjs';
import { testTempRoot, writeUnderTempRoot } from '../accept/temp-root.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = loadWorld(ROOT);
assert.ok(W.ok, W.text);
const ENGINE = { vocab: W.vocab, rules: W.rules, units: W.env.units };
const codeIs = (code) => (e) => e.code === code;
const SRC = readFileSync(join(ROOT, 'server-plugin/kernel/scheduler.mjs'), 'utf8');
// 去掉注释后的代码（扫描只看代码，不看注释里的出处文字）。
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
const clone = (v) => JSON.parse(JSON.stringify(v));

// ---------- tick_stage 与同刻全序 ----------

test('tick_stage 六段按卷二十 :495 的次序；位次 0–5；不是六段之一即 E-DIM-DOMAIN-ENUM', () => {
  assert.deepEqual([...TICK_STAGE], ['external', 'due', 'clock', 'contest', 'reaction', 'assertion']);
  assert.deepEqual(TICK_STAGE.map(stageRank), [0, 1, 2, 3, 4, 5]);
  assert.throws(() => stageRank('外部提案'), codeIs('E-DIM-DOMAIN-ENUM'));
  assert.throws(() => stageRank('settle'), codeIs('E-DIM-DOMAIN-ENUM'));
  assert.deepEqual([...PACE_CLASS], ['equilibrium', 'latency']);
  assert.deepEqual([...CONTEST_MODES], ['arrival', 'lottery', 'price', 'rank']);
});

test('同刻全序：段位次在前；due 段按 due_kind.rank（280 先于 340）；同 rank 按 owner、ref、registeredMinute；登记先后不影响', () => {
  assert.equal(dueKindRank(ENGINE, 'due_revive_window'), 280);
  assert.equal(dueKindRank(ENGINE, 'due_recurrence'), 340);
  assert.throws(() => dueKindRank(ENGINE, 'due_nope'), codeIs('E-DIM-REF-MISSING'));
  const items = {
    ext_b: sourceKey('external', { layerRank: 0, source: 'src_menu', subject: 'npc_b' }),
    ext_a: sourceKey('external', { layerRank: 0, source: 'src_menu', subject: 'npc_a' }),
    due_rec: dueKey({ kindRank: 340, layerRank: 0, owner: 'npc_a', ref: 'ref_1', registeredMinute: 10 }),
    due_rev_late: dueKey({ kindRank: 280, layerRank: 0, owner: 'npc_a', ref: 'ref_1', registeredMinute: 20 }),
    due_rev_early: dueKey({ kindRank: 280, layerRank: 0, owner: 'npc_a', ref: 'ref_1', registeredMinute: 5 }),
    due_rev_b: dueKey({ kindRank: 280, layerRank: 0, owner: 'npc_b', ref: 'ref_0', registeredMinute: 0 }),
    clk_p1: clockKey({ phaseRank: 1, sortKey: 1, layerRank: 0, hook: 'hook_a', subject: 'plc_x' }),
    clk_p0s2: clockKey({ phaseRank: 0, sortKey: 2, layerRank: 0, hook: 'hook_a', subject: 'plc_x' }),
    clk_p0s1: clockKey({ phaseRank: 0, sortKey: 1, layerRank: 1, hook: 'hook_z', subject: 'plc_x' }),
    con: sourceKey('contest', { layerRank: 0, source: 'src_pool', subject: 'tgt_1' }),
    rx_hi: reactionKey({ priorityRank: 1, pack: 'core', rule: 'rule_a', subject: 'npc_a' }),
    rx_lo: reactionKey({ priorityRank: 0, pack: 'core', rule: 'rule_b', subject: 'npc_a' }),
    asr: sourceKey('assertion', { layerRank: 0, source: 'src_check', subject: 'npc_a' }),
  };
  const want = ['ext_a', 'ext_b', 'due_rev_early', 'due_rev_late', 'due_rev_b', 'due_rec', 'clk_p0s1', 'clk_p0s2', 'clk_p1', 'con', 'rx_lo', 'rx_hi', 'asr'];
  const order = (names) => [...names].sort((a, b) => compareKeys(items[a], items[b]));
  assert.deepEqual(order(Object.keys(items)), want);
  assert.deepEqual(order(Object.keys(items).reverse()), want);
  // 卷二十 :543 示例：种类位次 2 与 5 的两个到期项，位次 2 的先执行，与显示名无关。
  const r5 = dueKey({ kindRank: 5, layerRank: 0, owner: 'npc_a', ref: 'ref_a', registeredMinute: 0 });
  const r2 = dueKey({ kindRank: 2, layerRank: 0, owner: 'npc_z', ref: 'ref_z', registeredMinute: 9 });
  assert.equal(compareKeys(r2, r5), -1);
  assert.deepEqual([...r2], [1, 2, 0, 'npc_z', 'ref_z', 9]);
});

test('全序键只收整数位次与代号：中文层键、字串位次、空段即 E-DIM-DOMAIN-RANGE；sourceKey 不收 due/clock/reaction', () => {
  assert.throws(() => dueKey({ kindRank: '效果与状态到期', layerRank: 0, owner: 'npc_a', ref: 'r', registeredMinute: 0 }), codeIs('E-DIM-DOMAIN-RANGE'));
  assert.throws(() => clockKey({ phaseRank: 0, sortKey: 1, layerRank: '规则', hook: 'h', subject: 's' }), codeIs('E-DIM-DOMAIN-RANGE'));
  assert.throws(() => reactionKey({ priorityRank: 'social', pack: 'core', rule: 'r', subject: 's' }), codeIs('E-DIM-DOMAIN-RANGE'));
  assert.throws(() => sourceKey('external', { layerRank: 0, source: '', subject: 's' }), codeIs('E-DIM-DOMAIN-RANGE'));
  assert.throws(() => sourceKey('due', { layerRank: 0, source: 'x', subject: 's' }), codeIs('E-DIM-DOMAIN-ENUM'));
  assert.throws(() => compareKeys([1, 'a'], [1, 2]), codeIs('E-DIM-DOMAIN-RANGE'));
  assert.throws(() => reactionPriorityRank(ENGINE, 'rprio_none'), codeIs('E-DIM-REF-MISSING'));
});

// ---------- clockView ----------

test('clockView：日 = 1440 分钟（_units day.si / minute.si，卷二十 :491）；{minute, day, seq} 全整数', () => {
  assert.equal(minutesPerDay(ENGINE), 1440);
  assert.deepEqual(clockView(ENGINE, { clock: { minute: 0, seq: 0 } }), { minute: 0, day: 0, seq: 0 });
  assert.deepEqual(clockView(ENGINE, { clock: { minute: 1439, seq: 3 } }), { minute: 1439, day: 0, seq: 3 });
  assert.deepEqual(clockView(ENGINE, { clock: { minute: 1440, seq: 3 } }), { minute: 1440, day: 1, seq: 3 });
  assert.deepEqual(clockView(ENGINE, { clock: { minute: 4320, seq: 7 } }), { minute: 4320, day: 3, seq: 7 });
  assert.throws(() => clockView(ENGINE, {}), codeIs('E-DIM-UNKNOWN-READ'));
  assert.throws(() => clockView(ENGINE, { clock: { minute: 5 } }), codeIs('E-DIM-UNKNOWN-READ'));
  assert.throws(() => minutesPerDay({ units: new Map([['day', { si: 86400 }]]) }), codeIs('E-DIM-UNIT-UNKNOWN'));
  assert.throws(() => minutesPerDay({ units: new Map([['day', { si: 100 }], ['minute', { si: 60 }]]) }), codeIs('E-DIM-UNIT-UNKNOWN'));
});

// ---------- advance 与刻级回退点 ----------

// 造的来源：在给定的刻、段放项；项按 file 写 pendingPost.<事件>（写者只有 kernel/transaction.mjs；别的 file 即被拒 E-VIEW-UNDECLARED-WRITE）。
function source(plan) {
  return {
    next: (_state, after) => {
      const ms = plan.map((p) => p.minute).filter((m) => m > after);
      return ms.length ? Math.min(...ms) : null;
    },
    items: (_state, minute, stage) => plan.filter((p) => p.minute === minute && p.stage === stage).map((p) => ({
      key: p.stage === 'due' ? dueKey({ kindRank: p.rank, layerRank: 0, owner: 'npc_a', ref: p.ev, registeredMinute: 0 }) : sourceKey(p.stage, { layerRank: 0, source: 'src_test', subject: p.ev }),
      node: 'test_item',
      file: p.file,
      run: (st) => { p.log.push(p.ev); if (p.write !== false) writePending(st, p.ev); },
    })),
  };
}
const writePending = (st, ev) => writePath(st, `pendingPost.${ev}`, []);
const OK = 'kernel/transaction.mjs';

test('advance：逐刻跳到下一个有项的刻再到目标；一刻内按段与键执行；时钟停在目标', () => {
  const state = { clock: { minute: 100, seq: 0 } };
  const log = [];
  const plan = [
    { minute: 105, stage: 'external', ev: 'ev_c', file: OK, log },
    { minute: 105, stage: 'due', rank: 340, ev: 'ev_b', file: OK, log },
    { minute: 105, stage: 'due', rank: 280, ev: 'ev_a', file: OK, log },
    { minute: 103, stage: 'assertion', ev: 'ev_0', file: OK, log },
  ];
  const r = advance(ENGINE, state, 10, [source(plan)]);
  assert.deepEqual(r, { ok: true, minute: 110 });
  assert.deepEqual(log, ['ev_0', 'ev_c', 'ev_a', 'ev_b']);
  assert.deepEqual(state.clock, { minute: 110, seq: 0 });
  assert.deepEqual(Object.keys(state.pendingPost).sort(), ['ev_0', 'ev_a', 'ev_b', 'ev_c']);
  assert.deepEqual(advance(ENGINE, state, 0, []), { ok: true, minute: 110 });
  assert.throws(() => advance(ENGINE, state, -1, []), codeIs('E-DIM-DOMAIN-RANGE'));
});

test('advance 刻级回退点：一刻内任一项被拒即整刻作废——本刻已执行的写入与时钟跳动都撤销、之前各刻保留；报告带刻与段位次；重推照样从这一刻重做', () => {
  const state = { clock: { minute: 0, seq: 0 } };
  const log = [];
  const plan = [
    { minute: 2, stage: 'due', rank: 280, ev: 'ev_early', file: OK, log },
    { minute: 5, stage: 'external', ev: 'ev_kept_then_undone', file: OK, log },
    { minute: 5, stage: 'contest', ev: 'ev_bad', file: 'test/not-the-writer.mjs', log },
    { minute: 5, stage: 'assertion', ev: 'ev_never', file: OK, log },
  ];
  const reports = [];
  const prev = useReportSink((rec) => reports.push(rec));
  try {
    const r = advance(ENGINE, state, 9, [source(plan)]);
    assert.deepEqual(r, { ok: false, code: 'E-VIEW-UNDECLARED-WRITE', tick: 5, stage: 3 });
    assert.deepEqual(log, ['ev_early', 'ev_kept_then_undone', 'ev_bad']);
    assert.deepEqual(state.clock, { minute: 2, seq: 0 });
    assert.deepEqual(Object.keys(state.pendingPost), ['ev_early']);
    assert.deepEqual(reports.map((x) => [x.code, x.fields.tick, x.fields.stage]), [['E-VIEW-UNDECLARED-WRITE', 5, 3]]);
    // 同一版规则与内容下重推：照第 2 条取到的仍是刻 5，从头再做，再被拒，时钟仍停在 2（"卡住"的代价，§4.1.3 第 7 条 :517）。
    const again = advance(ENGINE, state, 9, [source(plan)]);
    assert.deepEqual(again, { ok: false, code: 'E-VIEW-UNDECLARED-WRITE', tick: 5, stage: 3 });
    assert.deepEqual(log, ['ev_early', 'ev_kept_then_undone', 'ev_bad', 'ev_kept_then_undone', 'ev_bad']);
    assert.deepEqual(state.clock, { minute: 2, seq: 0 });
    // 修好内容（被拒项改由登记写者执行）后，刻 5 一项不跳过地重做，再到目标。
    plan[2].file = OK;
    assert.deepEqual(advance(ENGINE, state, 9, [source(plan)]), { ok: true, minute: 11 });
    assert.deepEqual(Object.keys(state.pendingPost).sort(), ['ev_bad', 'ev_early', 'ev_kept_then_undone', 'ev_never']);
  } finally { useReportSink(prev); }
});

test('advance：来源本身抛出无码错误（程序缺陷）也先撤销整刻再原样抛；来源给的下一刻不在当前刻之后即 E-DIM-DOMAIN-RANGE；两项同键即 E-DIM-ID-DUPLICATE', () => {
  const state = { clock: { minute: 0, seq: 0 } };
  const boom = { next: () => 1, items: (_s, _m, stage) => { if (stage === 'clock') throw new TypeError('boom'); return []; } };
  assert.throws(() => advance(ENGINE, state, 3, [boom]), (e) => e instanceof TypeError);
  assert.deepEqual(state.clock, { minute: 0, seq: 0 });
  assert.throws(() => advance(ENGINE, state, 3, [{ next: () => 0, items: () => [] }]), codeIs('E-DIM-DOMAIN-RANGE'));
  const log = [];
  const dup = [{ minute: 1, stage: 'external', ev: 'ev_x', file: OK, log }, { minute: 1, stage: 'external', ev: 'ev_x', file: OK, log }];
  assert.throws(() => advance(ENGINE, state, 3, [source(dup)]), codeIs('E-DIM-ID-DUPLICATE'));
  assert.deepEqual(state.clock, { minute: 0, seq: 0 });
  // 项给错了段：E-DIM-DOMAIN-ENUM。
  const wrong = { next: () => 1, items: (_s, _m, stage) => (stage === 'external' ? [{ key: dueKey({ kindRank: 1, layerRank: 0, owner: 'a', ref: 'b', registeredMinute: 0 }), node: 'n', file: OK, run: () => {} }] : []) };
  assert.throws(() => advance(ENGINE, state, 3, [wrong]), codeIs('E-DIM-DOMAIN-ENUM'));
  assert.deepEqual(state.clock, { minute: 0, seq: 0 });
});

test('只有一条推进路径：调度器不读 process.env、无 config_set；源码无非 ASCII 字串（注释以外，中文类名、层键、原因文字清零，卷二十 :548）', () => {
  assert.equal(CODE.includes('process.env'), false);
  assert.equal(CODE.includes('config_set'), false);
  assert.equal(/createHash|node:crypto/.test(CODE), false);
  assert.equal(/[^\x00-\x7f]/.test(CODE), false);
});

// ---------- 争夺裁决：缺省表在规则表 ----------

const claim = (target, quantity, capacity, contest) => ({ target, quantity, capacity, contest });
const ids = (out) => out.map((o) => [o.target, o.contest, o.winners.map((p) => p.id), o.losers.map((p) => p.id)]);
// 造的抽取值（4-3 前的待补接口由调用方给）：按表查，未列的抽取即测试失败。
const drawFrom = (table) => (p, target) => { const k = `${p.id}@${target}`; if (!Object.hasOwn(table, k)) throw new Error(`unexpected draw ${k}`); return table[k]; };

test('CONTEST_RULES 缺省表进 rules.clock：contestDefault 取自规则表（lottery）；换表即换方式；表里没有就报错，代码不留缺省', () => {
  assert.equal(W.rules.clock.contestDefault, 'lottery');
  const props = [
    { id: 'pr_a', claims: [claim('tgt_1', 1, 1, null)], rank: 2 },
    { id: 'pr_b', claims: [claim('tgt_1', 1, 1, null)], rank: 1 },
  ];
  const lottery = resolveContest(ENGINE, props, drawFrom({ 'pr_a@tgt_1': 9, 'pr_b@tgt_1': 4 }));
  assert.deepEqual(ids(lottery), [['tgt_1', 'lottery', ['pr_a'], ['pr_b']]]);
  const asRank = { ...ENGINE, rules: { ...ENGINE.rules, clock: { ...ENGINE.rules.clock, contestDefault: 'rank' } } };
  assert.deepEqual(ids(resolveContest(asRank, props, drawFrom({}))), [['tgt_1', 'rank', ['pr_b'], ['pr_a']]]);
  const noTable = { ...ENGINE, rules: {} };
  assert.throws(() => resolveContest(noTable, props, drawFrom({})), codeIs('E-DIM-DOMAIN-ENUM'));
  assert.equal(/goods|office|detained|bounty|lodges|residence|repayment|firstToSatisfy/.test(CODE), false);
});

test('争夺裁决：价高者先、同价比抽取值；容量与份数；败者原因是方式代号、不带文字；没有抽取接口即抛（待 4-3）', () => {
  const props = [
    { id: 'pr_lo', claims: [claim('tgt_g', 1, 2, 'price')], bid: 30 },
    { id: 'pr_x', claims: [claim('tgt_g', 1, 2, 'price')], bid: 50 },
    { id: 'pr_y', claims: [claim('tgt_g', 1, 2, 'price')], bid: 50 },
    { id: 'pr_big', claims: [claim('tgt_g', 2, 2, 'price')], bid: 40 },
  ];
  const out = resolveContest(ENGINE, props, drawFrom({ 'pr_x@tgt_g': 3, 'pr_y@tgt_g': 8 }));
  assert.deepEqual(ids(out), [['tgt_g', 'price', ['pr_y', 'pr_x'], ['pr_big', 'pr_lo']]]);
  assert.deepEqual(Object.keys(out[0]), ['target', 'contest', 'winners', 'losers']);
  // 先到：arrival 小者先；同到比抽取值；再同按 id。
  const arr = [
    { id: 'pr_2', claims: [claim('tgt_a', 1, 1, 'arrival')], arrival: 7 },
    { id: 'pr_1', claims: [claim('tgt_a', 1, 1, 'arrival')], arrival: 7 },
    { id: 'pr_3', claims: [claim('tgt_a', 1, 1, 'arrival')], arrival: 9 },
  ];
  assert.deepEqual(ids(resolveContest(ENGINE, arr, drawFrom({ 'pr_1@tgt_a': 5, 'pr_2@tgt_a': 5 }))), [['tgt_a', 'arrival', ['pr_1'], ['pr_2', 'pr_3']]]);
  assert.throws(() => resolveContest(ENGINE, props), (e) => e instanceof Error && !('code' in e));
  assert.throws(() => resolveContest(ENGINE, [{ id: 'pr_n', claims: [claim('tgt_g', 1, 1, 'price')] }], drawFrom({})), codeIs('E-DIM-STRUCT-FIELD'));
  assert.throws(() => resolveContest(ENGINE, [{ id: 'pr_n', claims: [claim('tgt_g', 1, 1, 'auction')], bid: 1 }], drawFrom({})), codeIs('E-DIM-DOMAIN-ENUM'));
  assert.throws(() => resolveContest(ENGINE, [{ id: 'pr_n', claims: [{ target: 'tgt_g', quantity: 1, capacity: 1 }] }], drawFrom({})), codeIs('E-DIM-STRUCT-FIELD'));
  assert.throws(() => resolveContest(ENGINE, [
    { id: 'pr_a', claims: [claim('tgt_g', 1, 1, 'rank')], rank: 1 },
    { id: 'pr_b', claims: [claim('tgt_g', 1, 1, 'price')], bid: 1 },
  ], drawFrom({})), codeIs('E-DIM-DOMAIN-ENUM'));
  assert.throws(() => resolveContest(ENGINE, [{ id: 'pr_a', claims: [claim('tgt_g', 1, 1, null)] }, { id: 'pr_b', claims: [claim('tgt_g', 1, 1, null)] }], () => 0.5), codeIs('E-DIM-DOMAIN-RANGE'));
});

test('争夺裁决多标的整单分配：要两个标的的提案两个都拿到才赢，不执行半份；总序按（首个标的序号、名次、id）', () => {
  const props = [
    { id: 'pr_both', claims: [claim('tgt_a', 1, 1, 'rank'), claim('tgt_b', 1, 1, 'rank')], rank: 2 },
    { id: 'pr_a', claims: [claim('tgt_a', 1, 1, 'rank')], rank: 1 },
    { id: 'pr_b', claims: [claim('tgt_b', 1, 1, 'rank')], rank: 3 },
  ];
  // tgt_a 名次：pr_a(1) 先于 pr_both(2)；总序 pr_a、pr_both、pr_b：pr_a 拿 tgt_a，pr_both 缺 tgt_a 整单落空，pr_b 拿 tgt_b。
  assert.deepEqual(ids(resolveContest(ENGINE, props, drawFrom({}))), [['tgt_a', 'rank', ['pr_a'], ['pr_both']], ['tgt_b', 'rank', ['pr_b'], ['pr_both']]]);
  props[1].rank = 5;
  // 改为 pr_both 在 tgt_a 名列第一：总序 pr_both、pr_a、pr_b：pr_both 两个都拿到，其余落空。
  assert.deepEqual(ids(resolveContest(ENGINE, props, drawFrom({}))), [['tgt_a', 'rank', ['pr_both'], ['pr_a']], ['tgt_b', 'rank', ['pr_both'], ['pr_b']]]);
});

// ---------- kernelApi 与到期登记待 4-2 ----------

test('kernelApi 登记 schedule、cancel、clockView（K4-13）与 createWallTimer（只给 index.mjs）；schedule/cancel 在事务外调用即 E-VIEW-UNDECLARED-WRITE', () => {
  const decl = JSON.parse(readFileSync(join(ROOT, 'world/ontology/state-owners.json'), 'utf8'));
  const rows = decl.kernelApi.exports.filter((x) => x.export.startsWith('kernel/scheduler.mjs#'));
  assert.deepEqual(rows, [
    { export: 'kernel/scheduler.mjs#schedule', callers: ['rules'], acceptsState: false },
    { export: 'kernel/scheduler.mjs#cancel', callers: ['rules'], acceptsState: false },
    { export: 'kernel/scheduler.mjs#clockView', callers: ['rules'], acceptsState: true },
    // 6-6：冷却按日数折分钟（卷四 §4.8 D-6 cooldownDays），death.mjs 读一日的分钟数。
    { export: 'kernel/scheduler.mjs#minutesPerDay', callers: ['rules'], acceptsState: false },
    { export: 'kernel/scheduler.mjs#createWallTimer', callerFiles: ['index.mjs'], acceptsState: false },
  ]);
  assert.deepEqual(decl.stateKeys.clock, { readers: [], writers: { minute: 'kernel/scheduler.mjs', seq: 'kernel/scheduler.mjs', dueNext: 'kernel/scheduler.mjs' } });
  assert.equal(decl.pathTypes['clock.minute'], 'integer:minute');
  assert.equal(decl.pathTypes['clock.seq'], 'integer:count');
  assert.deepEqual(decl.systems['sys.time_env'], { tables: ['clock'], writers: ['clock.minute', 'clock.seq', 'clock.dueNext', 'due.*'], entryCallerFiles: {}, entryJudges: [] });
  assert.ok(JSON.parse(readFileSync(join(ROOT, 'server-plugin/kernel/files.json'), 'utf8')).includes('server-plugin/kernel/scheduler.mjs'));
  assert.throws(() => schedule('npc_a', 'due_recurrence', 10, 'ref_1'), codeIs('E-VIEW-UNDECLARED-WRITE'));
  assert.throws(() => cancel('due_recurrence-npc_a-ref_1'), codeIs('E-VIEW-UNDECLARED-WRITE'));
});

test('createWallTimer：时长须是整数毫秒；deadline 到点中止；heartbeat 可停', async () => {
  const t = createWallTimer();
  assert.throws(() => t.deadline(1.5), codeIs('E-DIM-DOMAIN-RANGE'));
  assert.throws(() => t.heartbeat(0, () => {}), codeIs('E-DIM-DOMAIN-RANGE'));
  const sig = t.deadline(1);
  await new Promise((res) => sig.addEventListener('abort', res, { once: true }));
  assert.equal(sig.aborted, true);
  let n = 0;
  await new Promise((res) => { const stop = t.heartbeat(1, () => { n++; if (n === 2) { stop(); res(); } }); });
  assert.equal(n, 2);
});

// ---------- 加载校验 ----------

test('rules.clock 按登记载入：七键手写字面量（4-2 加 cadence、phaseOffset 空表与入堆缩放配置项 paceFactor 1/1）', () => {
  assert.deepEqual({ ...W.rules.clock }, {
    reactionDepthMax: 8,
    proposalMax: 12,
    drawSites: ['site.emit.chance', 'site.weather.precip', 'site.weather.state', 'site.weather.windDir', 'site.weather.windSpeed'],
    cadence: { itemRot: 1440 }, // 6-3 登记的 itemRot 钩子：一日一拍，相位 0
    phaseOffset: { itemRot: 0 },
    paceFactor: { num: 1, den: 1 },
    contestDefault: 'lottery',
  });
  assert.deepEqual(Object.keys(W.vocab.families.get('due_kind').entries), ['due_recurrence', 'due_revive_window']);
  assert.deepEqual(W.vocab.families.get('reaction_priority').entries, {});
  assert.equal(W.vocab.families.get('reaction_priority').prefix, 'rprio_');
});

// 复制真实规则目录到仓库外临时目录，改 clock.json 一处再加载。
function withClock(edit, fn) {
  const tmp = testTempRoot('clock-rules-');
  try {
    const real = (f) => readFileSync(join(ROOT, 'world/rules', f), 'utf8');
    const reg = JSON.parse(real('registry.json'));
    writeUnderTempRoot(tmp, 'registry.json', JSON.stringify(reg));
    for (const r of reg.rows) {
      let text = real(r.file);
      if (r.code === 'clock') { const doc = JSON.parse(text); edit(doc.rows); text = JSON.stringify(doc); }
      writeUnderTempRoot(tmp, r.file, text);
    }
    return fn(loadWorld(ROOT, { rulesDir: tmp }));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
const errs = (r) => r.errors.filter((e) => e.table === 'rules.clock').map((e) => [e.code, e.row]);
const setVal = (key, v) => (rows) => { rows.find((x) => x.key === key).value = v; };

test('clock.json 加载校验反例：争夺缺省不是方式之一、缺键、上限 < 1、抽取点未排序或重复', () => {
  withClock(() => {}, (r) => assert.ok(r.ok, r.text));
  withClock(setVal('contestDefault', 'auction'), (r) => { assert.equal(r.ok, false); assert.deepEqual(errs(r), [['E-DIM-DOMAIN-ENUM', 'contestDefault']]); });
  withClock((rows) => rows.splice(rows.findIndex((x) => x.key === 'proposalMax'), 1), (r) => { assert.equal(r.ok, false); assert.deepEqual(errs(r), [['E-DIM-STRUCT-FIELD', 'proposalMax']]); });
  withClock(setVal('reactionDepthMax', 0), (r) => { assert.equal(r.ok, false); assert.deepEqual(errs(r), [['E-DIM-DOMAIN-RANGE', 'reactionDepthMax']]); });
  withClock(setVal('drawSites', ['site.weather.state', 'site.emit.chance']), (r) => { assert.equal(r.ok, false); assert.deepEqual(errs(r), [['E-DIM-DOMAIN-SIZE', 'drawSites']]); });
  withClock(setVal('drawSites', ['site.a', 'site.a']), (r) => { assert.equal(r.ok, false); assert.deepEqual(errs(r), [['E-DIM-DOMAIN-SIZE', 'drawSites']]); });
});

test('due_kind / reaction_priority 条目校验反例：rank 重复 E-DUE-RANK-DUP、缺 paceClass E-PACE-UNCLASSIFIED、paceClass 不在 pace_class、四字段漏写、floorRX 编不过；反应优先类 rank 重复', () => {
  const families = (dues, rps) => new Map([...W.vocab.families, ['due_kind', { name: 'due_kind', prefix: 'due_', closed: false, entries: dues }], ['reaction_priority', { name: 'reaction_priority', prefix: 'rprio_', closed: false, entries: rps }]]);
  const run = (dues, rps = {}) => checkClockTables({}, { ...W.env, compiled: new Map(), vocab: { ...W.vocab, families: families(dues, rps) } }).map((e) => [e.code, e.table, e.row, e.dim]);
  const row = (rank, extra = {}) => ({ rank, paceClass: 'equilibrium', floorRX: null, calendarBound: true, ...extra });
  assert.deepEqual(run(clone(W.vocab.families.get('due_kind').entries)), []);
  assert.deepEqual(run({ due_a: row(10), due_b: row(10) }), [['E-DUE-RANK-DUP', '_vocab.due_kind', 'due_b', 'rank']]);
  const noPace = row(1); delete noPace.paceClass;
  assert.deepEqual(run({ due_a: noPace }), [['E-PACE-UNCLASSIFIED', '_vocab.due_kind', 'due_a', 'paceClass']]);
  assert.deepEqual(run({ due_a: row(1, { paceClass: 'fast' }) }), [['E-DIM-DOMAIN-ENUM', '_vocab.due_kind', 'due_a', 'paceClass']]);
  const noCal = row(1); delete noCal.calendarBound;
  assert.deepEqual(run({ due_a: noCal }), [['E-DIM-STRUCT-FIELD', '_vocab.due_kind', 'due_a', 'calendarBound']]);
  assert.deepEqual(run({ due_a: row(-1) }), [['E-DIM-DOMAIN-RANGE', '_vocab.due_kind', 'due_a', 'rank']]);
  assert.deepEqual(run({ due_a: row(1, { calendarBound: 'yes' }) }), [['E-DIM-DOMAIN-RANGE', '_vocab.due_kind', 'due_a', 'calendarBound']]);
  assert.deepEqual(run({ due_a: row(1, { label: 'x' }) }), [['E-DIM-STRUCT-FIELD', '_vocab.due_kind', 'due_a', 'label']]);
  assert.equal(run({ due_a: row(1, { floorRX: '((' }) }).length, 1);
  assert.deepEqual(run({}, { rprio_a: { rank: 1 }, rprio_b: { rank: 1 } }), [['E-DIM-VOCAB-FIELD', '_vocab.reaction_priority', 'rprio_b', 'rank']]);
  assert.deepEqual(run({}, { rprio_a: {} }), [['E-DIM-STRUCT-FIELD', '_vocab.reaction_priority', 'rprio_a', 'rank']]);
});
