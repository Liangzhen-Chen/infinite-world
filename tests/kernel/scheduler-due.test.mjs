// 块 4 第 4-2 张《到期堆、推进钩子与整刻作废》：due.* 到期堆与 struct:dueItem、schedule/cancel 与墓碑、整刻作废与下次整刻重做、
// 反应队列代际顺序与两上限（E-CLOCK-REACTION-LIMIT）、keyKinds handle 类、入堆缩放配置项、registerAdvanceHook 与 cadence 逐钩子查。
// 依据卷二十《时间日历天气与环境》§2.1 :130–132、§4.1.1 :483、§4.1.3 第 2–5、7 条（:492–517）、§4.10.3 第 2、6 条（:969、:973）、§4.10.5；
// 卷二《维度表规范与统一入口》§2.7 :583–584、:773；李白 11-18 02:40 K4-43、03:22 裁定①②；体检 块4.md 4-2 条。期望值一律手写字面量。
// 只跑不推进真实世界的小检查：advance 用测试里造的状态与来源，推进十几分钟到一两日。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { mergeStateOwners, KEY_NONENTITY } from '../../server-plugin/kernel/load/state-owners.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import { writePath } from '../../server-plugin/kernel/storage.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import {
  schedule, cancel, advance, dueSource, hookSource, nextBeat, enqueueDelay, checkHookCadence, sourceKey, reactionKey,
} from '../../server-plugin/kernel/scheduler.mjs';
import { registerAdvanceHook, registerAdvancePlan, advanceHook, resetAdvanceRegistry } from '../../server-plugin/kernel/advance-registry.mjs';
import { testTempRoot, writeUnderTempRoot } from '../accept/temp-root.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = loadWorld(ROOT);
assert.ok(W.ok, W.text);
const ENGINE = { vocab: W.vocab, rules: W.rules, units: W.env.units };
const codeIs = (code) => (e) => e.code === code;
const RULE = { node: 'test_rule', file: 'rules/test-rule.mjs' };
const tx = (state, body) => runTransaction(state, RULE, body);
const quiet = (fn) => { const got = []; const prev = useReportSink((r) => got.push(r)); try { return fn(got); } finally { useReportSink(prev); } };

// 到期项来源：deliver 记下（刻、kind、owner、ref）；layerRank 一律 0（推进计划的层序归块 6）。
function dues(log, extra = () => {}) {
  return dueSource(ENGINE, { layerRankOf: () => 0, deliver: (st, item) => { log.push([st.clock.minute, item.kind, item.owner, item.ref]); extra(st, item); } });
}

// ---------- struct:dueItem 与 schedule ----------

test('schedule 在事务里写 due.<句柄> = struct:dueItem 五字段；句柄 = due_＋计数器 clock.dueNext 的 base36 小写；均衡类不缩放', () => {
  const state = { clock: { minute: 100, seq: 0 } };
  let h;
  assert.deepEqual(tx(state, () => { h = schedule('npc_b', 'due_recurrence', 10, 'ref_1'); }), { ok: true });
  assert.equal(h, 'due_0');
  assert.deepEqual(state.due, { due_0: { dueMinute: 110, kind: 'due_recurrence', owner: 'npc_b', ref: 'ref_1', registeredMinute: 100 } });
  assert.deepEqual(Object.keys(state.due[h]).sort(), ['dueMinute', 'kind', 'owner', 'ref', 'registeredMinute']);
  assert.equal(state.clock.dueNext, 1);
});

test('句柄手算字面量：第 1 个 due_0、第 11 个 due_a、第 36 个 due_z、第 37 个 due_10；cancel 后再 schedule 不复用旧句柄', () => {
  const state = { clock: { minute: 0, seq: 0 } };
  const got = [];
  tx(state, () => { for (let i = 0; i < 37; i++) got.push(schedule('npc_a', 'due_recurrence', 5, `ref_${i}`)); });
  assert.deepEqual([got[0], got[10], got[35], got[36]], ['due_0', 'due_a', 'due_z', 'due_10']);
  assert.equal(state.clock.dueNext, 37);
  tx(state, () => { cancel('due_10'); });
  let again;
  tx(state, () => { again = schedule('npc_a', 'due_recurrence', 5, 'ref_36'); });
  assert.equal(again, 'due_11');
  assert.equal(Object.hasOwn(state.due, 'due_10'), false);
});

test('同一存档重放得同一句柄：计数器随状态走，存档往返（JSON 序列化再读回）后继续 schedule 与不往返的得到相同句柄', () => {
  const a = { clock: { minute: 0, seq: 0 } };
  tx(a, () => { schedule('npc_a', 'due_recurrence', 5, 'ref_1'); schedule('npc_a', 'due_recurrence', 6, 'ref_2'); });
  const b = JSON.parse(JSON.stringify(a));
  let ha, hb;
  tx(a, () => { ha = schedule('npc_b', 'due_recurrence', 5, 'ref_1'); });
  tx(b, () => { hb = schedule('npc_b', 'due_recurrence', 5, 'ref_1'); });
  assert.equal(ha, 'due_2');
  assert.equal(hb, 'due_2');
  assert.deepEqual(a, b);
});

test('重复登记按 (owner, kind, ref) 三项判，不看句柄：三项任一不同即可并存，三项全同即使句柄不同也 E-DUE-DUPLICATE', () => {
  quiet(() => {
    const state = { clock: { minute: 0, seq: 0 } };
    assert.deepEqual(tx(state, () => {
      schedule('npc_a', 'due_recurrence', 5, 'ref_1');
      schedule('npc_b', 'due_recurrence', 5, 'ref_1');
      schedule('npc_a', 'due_revive_window', 5, 'ref_1');
      schedule('npc_a', 'due_recurrence', 5, 'ref_2');
    }), { ok: true });
    assert.deepEqual(Object.keys(state.due), ['due_0', 'due_1', 'due_2', 'due_3']);
    assert.deepEqual(tx(state, () => { schedule('npc_b', 'due_recurrence', 9, 'ref_1'); }), { ok: false, code: 'E-DUE-DUPLICATE' });
    assert.equal(state.clock.dueNext, 4);
  });
});

test('schedule 被拒即整笔回滚：同一 (owner, kind, ref) 重复 E-DUE-DUPLICATE、kind 不是 due_kind E-DUE-UNDECLARED、延迟 < 1 E-DIM-DOMAIN-RANGE、代号不合 E-DIM-ID-FORMAT；规则层 catch 住也回滚', () => {
  quiet(() => {
    const state = { clock: { minute: 0, seq: 0 } };
    assert.deepEqual(tx(state, () => { schedule('npc_a', 'due_recurrence', 5, 'ref_1'); }), { ok: true });
    assert.deepEqual(tx(state, () => { schedule('npc_a', 'due_recurrence', 9, 'ref_1'); }), { ok: false, code: 'E-DUE-DUPLICATE' });
    assert.deepEqual(tx(state, () => { schedule('npc_a', 'due_nope', 5, 'ref_1'); }), { ok: false, code: 'E-DUE-UNDECLARED' });
    assert.deepEqual(tx(state, () => { schedule('npc_a', 'due_recurrence', 0, 'ref_2'); }), { ok: false, code: 'E-DIM-DOMAIN-RANGE' });
    assert.deepEqual(tx(state, () => { schedule('NPC-A', 'due_recurrence', 5, 'ref_2'); }), { ok: false, code: 'E-DIM-ID-FORMAT' });
    assert.deepEqual(tx(state, () => { schedule('npc_a', 'due_recurrence', 5, 'ref_2'); try { schedule('npc_a', 'due_recurrence', 5, 'ref_2'); } catch { /* 吞掉也回滚 */ } }), { ok: false, code: 'E-DUE-DUPLICATE' });
    assert.deepEqual(Object.keys(state.due), ['due_0']);
    assert.equal(state.clock.dueNext, 1); // 被拒的 schedule 连计数器一并回滚
  });
});

// ---------- 到期堆按全序键出队 ----------

test('到期堆：先按 dueMinute，同刻按 (due_kind.rank, layerRank, owner, ref, registeredMinute)；登记先后不影响；到期即出堆', () => {
  const plan = [['npc_b', 'due_recurrence', 10, 'ref_1'], ['npc_a', 'due_recurrence', 10, 'ref_2'], ['npc_z', 'due_revive_window', 10, 'ref_9'], ['npc_a', 'due_revive_window', 5, 'ref_1']];
  const want = [[105, 'due_revive_window', 'npc_a', 'ref_1'], [110, 'due_revive_window', 'npc_z', 'ref_9'], [110, 'due_recurrence', 'npc_a', 'ref_2'], [110, 'due_recurrence', 'npc_b', 'ref_1']];
  for (const order of [plan, [...plan].reverse()]) {
    const state = { clock: { minute: 100, seq: 0 } };
    assert.deepEqual(tx(state, () => { for (const p of order) schedule(...p); }), { ok: true });
    const log = [];
    assert.deepEqual(advance(ENGINE, state, 20, [dues(log)]), { ok: true, minute: 120 });
    assert.deepEqual(log, want);
    assert.deepEqual(state.due, {});
    assert.deepEqual(state.clock, { minute: 120, seq: 0, dueNext: 4 });
  }
});

test('到期堆：推进到目标前未到期的留在堆里；分两次推进与一次推进出队顺序相同', () => {
  const state = { clock: { minute: 0, seq: 0 } };
  tx(state, () => { schedule('npc_a', 'due_recurrence', 3, 'ref_1'); schedule('npc_a', 'due_recurrence', 30, 'ref_2'); });
  const log = [];
  const src = dues(log);
  assert.deepEqual(advance(ENGINE, state, 10, [src]), { ok: true, minute: 10 });
  assert.deepEqual(log, [[3, 'due_recurrence', 'npc_a', 'ref_1']]);
  assert.deepEqual(Object.keys(state.due), ['due_1']);
  assert.deepEqual(advance(ENGINE, state, 20, [src]), { ok: true, minute: 30 });
  assert.deepEqual(log, [[3, 'due_recurrence', 'npc_a', 'ref_1'], [30, 'due_recurrence', 'npc_a', 'ref_2']]);
});

// ---------- cancel 与墓碑 ----------

test('cancel 只删状态行，堆里旧项成墓碑、弹出时丢弃；取消后同三项再登记得新句柄、只按新时刻到期一次', () => {
  const state = { clock: { minute: 0, seq: 0 } };
  const log = [];
  const src = dues(log);
  tx(state, () => { schedule('npc_a', 'due_recurrence', 5, 'ref_1'); schedule('npc_b', 'due_recurrence', 5, 'ref_1'); });
  assert.equal(src.next(state, 0), 5); // 堆已从状态建起
  assert.deepEqual(tx(state, () => { cancel('due_0'); }), { ok: true });
  assert.deepEqual(Object.keys(state.due), ['due_1']);
  let again;
  assert.deepEqual(tx(state, () => { again = schedule('npc_a', 'due_recurrence', 8, 'ref_1'); }), { ok: true });
  assert.equal(again, 'due_2'); // 不复用已取消的 due_0
  assert.deepEqual(advance(ENGINE, state, 10, [src]), { ok: true, minute: 10 });
  assert.deepEqual(log, [[5, 'due_recurrence', 'npc_b', 'ref_1'], [8, 'due_recurrence', 'npc_a', 'ref_1']]);
  assert.deepEqual(state.due, {});
});

test('同刻先执行的到期项取消了后一项：后一项成墓碑，不再发', () => {
  const state = { clock: { minute: 0, seq: 0 } };
  const log = [];
  tx(state, () => { schedule('npc_a', 'due_revive_window', 4, 'ref_1'); schedule('npc_b', 'due_recurrence', 4, 'ref_1'); });
  const src = dues(log, (_st, item) => { if (item.owner === 'npc_a') cancel('due_1'); });
  assert.deepEqual(advance(ENGINE, state, 4, [src]), { ok: true, minute: 4 });
  assert.deepEqual(log, [[4, 'due_revive_window', 'npc_a', 'ref_1']]);
  assert.deepEqual(state.due, {});
});

test('cancel 被拒：句柄不合运行时句柄文法 E-DIM-ID-FORMAT、堆里没有 E-DIM-REF-MISSING；规则层 catch 住也整笔回滚', () => {
  quiet(() => {
    const state = { clock: { minute: 0, seq: 0 } };
    tx(state, () => { schedule('npc_a', 'due_recurrence', 5, 'ref_1'); });
    assert.deepEqual(tx(state, () => { cancel('due.recurrence'); }), { ok: false, code: 'E-DIM-ID-FORMAT' });
    assert.deepEqual(tx(state, () => { cancel('due_7'); }), { ok: false, code: 'E-DIM-REF-MISSING' });
    assert.deepEqual(tx(state, () => { cancel('due_0'); try { cancel('Bad'); } catch { /* 吞掉也回滚 */ } }), { ok: false, code: 'E-DIM-ID-FORMAT' });
    assert.deepEqual(Object.keys(state.due), ['due_0']);
  });
});

// ---------- 整刻作废与下次整刻重做 ----------

test('整刻作废：到期项发事件时被拒，本刻已出堆的各项连同时钟一并撤销、到期堆从状态重建；修好后下次推进把这一刻从头重做、一项不跳', () => {
  quiet((reports) => {
    const state = { clock: { minute: 0, seq: 0 } };
    tx(state, () => { schedule('npc_a', 'due_recurrence', 2, 'ref_0'); schedule('npc_a', 'due_revive_window', 5, 'ref_1'); schedule('npc_b', 'due_recurrence', 5, 'ref_2'); });
    const log = [];
    let broken = true;
    // 发 npc_b 的事件时写 pendingPost（写者是 kernel/transaction.mjs，到期项事务的文件是 kernel/scheduler.mjs）即被拒 E-VIEW-UNDECLARED-WRITE。
    const src = dues(log, (st, item) => { if (broken && item.owner === 'npc_b') writePath(st, 'pendingPost.evt_x', []); });
    assert.deepEqual(advance(ENGINE, state, 9, [src]), { ok: false, code: 'E-VIEW-UNDECLARED-WRITE', tick: 5, stage: 1 });
    assert.deepEqual(log, [[2, 'due_recurrence', 'npc_a', 'ref_0'], [5, 'due_revive_window', 'npc_a', 'ref_1'], [5, 'due_recurrence', 'npc_b', 'ref_2']]);
    assert.deepEqual(state.clock, { minute: 2, seq: 0, dueNext: 3 });
    assert.deepEqual(Object.keys(state.due).sort(), ['due_1', 'due_2']);
    assert.deepEqual(reports.map((r) => [r.code, r.fields.tick, r.fields.stage]), [['E-VIEW-UNDECLARED-WRITE', 5, 1]]);
    // 不修：每次推进都停在刻 5（"卡住"的代价，§4.1.3 第 7 条）。
    assert.deepEqual(advance(ENGINE, state, 9, [src]), { ok: false, code: 'E-VIEW-UNDECLARED-WRITE', tick: 5, stage: 1 });
    assert.deepEqual(state.clock, { minute: 2, seq: 0, dueNext: 3 });
    broken = false;
    log.length = 0;
    assert.deepEqual(advance(ENGINE, state, 9, [src]), { ok: true, minute: 11 });
    assert.deepEqual(log, [[5, 'due_revive_window', 'npc_a', 'ref_1'], [5, 'due_recurrence', 'npc_b', 'ref_2']]);
    assert.deepEqual(state.due, {});
  });
});

// ---------- 反应队列 ----------

// 造的来源：刻 1 外部段两项、断言段一项；reactions 按起因的节点名查表给出反应项（每项写 pendingPost.<节点名>，事务文件是该键的写者）。
const WRITER = 'kernel/transaction.mjs';
function reacting(log, table, { assertion = true } = {}) {
  const item = (stage, name, key) => ({ key, node: name, file: WRITER, run: (st) => { log.push(name); writePath(st, `pendingPost.${name}`, []); } });
  return {
    next: (_s, after) => (after < 1 ? 1 : null),
    items: (_s, minute, stage) => {
      if (minute !== 1) return [];
      if (stage === 'external') return ['ext_b', 'ext_a'].map((n) => item(stage, n, sourceKey('external', { layerRank: 0, source: 'src_test', subject: n })));
      if (stage === 'assertion' && assertion) return [item(stage, 'asr_z', sourceKey('assertion', { layerRank: 0, source: 'src_test', subject: 'asr_z' }))];
      return [];
    },
    reactions: (_s, _m, cause) => (table[cause.node] || []).map(([name, prio]) => item('reaction', name, reactionKey({ priorityRank: prio, pack: 'core', rule: name, subject: 'npc_a' }))),
  };
}

test('反应队列按代广度优先：上一代全部执行完才下一代；同代按起因在本刻的先后；同一起因按 reaction_priority.rank 等键', () => {
  const state = { clock: { minute: 0, seq: 0 } };
  const log = [];
  const table = { ext_a: [['rx_a1', 1], ['rx_a2', 0]], ext_b: [['rx_b1', 0]], rx_a2: [['rx_a2x', 0]], rx_b1: [['rx_b1x', 0]] };
  assert.deepEqual(advance(ENGINE, state, 1, [reacting(log, table)]), { ok: true, minute: 1 });
  assert.deepEqual(log, ['ext_a', 'ext_b', 'rx_a2', 'rx_a1', 'rx_b1', 'rx_a2x', 'rx_b1x', 'asr_z']);
});

function chain(depth) {
  const t = { ext_a: [['rx_1', 0]] };
  for (let i = 1; i < depth; i++) t[`rx_${i}`] = [[`rx_${i + 1}`, 0]];
  return t;
}

test('反应深度超 reactionDepthMax（8）：第 9 代非空即整刻作废，报 E-CLOCK-REACTION-LIMIT，信息含键名、上限、实际值；恰 8 代通过', () => {
  quiet((reports) => {
    const state = { clock: { minute: 0, seq: 0 } };
    const log = [];
    assert.deepEqual(advance(ENGINE, state, 1, [reacting(log, chain(9), { assertion: false })]),
      { ok: false, code: 'E-CLOCK-REACTION-LIMIT', tick: 1, stage: 4, detail: 'reactionDepthMax: limit 8, actual 9' });
    assert.deepEqual(log, ['ext_a', 'ext_b', 'rx_1', 'rx_2', 'rx_3', 'rx_4', 'rx_5', 'rx_6', 'rx_7', 'rx_8']);
    assert.deepEqual(state, { clock: { minute: 0, seq: 0 } });
    assert.deepEqual(reports.map((r) => r.code), ['E-CLOCK-REACTION-LIMIT']);
    assert.deepEqual(reports[0].fields, { actual: 9, entity: null, limit: 8, limit_key: 'reaction_depth_max', request: null, stage: 4, tick: 1 });
    const ok = { clock: { minute: 0, seq: 0 } };
    assert.deepEqual(advance(ENGINE, ok, 1, [reacting([], chain(8), { assertion: false })]), { ok: true, minute: 1 });
  });
});

test('单刻反应项累计超 proposalMax（12）：第 13 项所在的代即整刻作废，报 E-CLOCK-REACTION-LIMIT，信息含键名、上限、实际值；恰 12 项通过', () => {
  quiet((reports) => {
    const fan = (n) => ({ ext_a: Array.from({ length: n }, (_, i) => [`rx_${String(i).padStart(2, '0')}`, 0]) });
    const state = { clock: { minute: 0, seq: 0 } };
    const log = [];
    assert.deepEqual(advance(ENGINE, state, 1, [reacting(log, fan(13), { assertion: false })]),
      { ok: false, code: 'E-CLOCK-REACTION-LIMIT', tick: 1, stage: 4, detail: 'proposalMax: limit 12, actual 13' });
    assert.deepEqual(log, ['ext_a', 'ext_b']);
    assert.deepEqual(state, { clock: { minute: 0, seq: 0 } });
    assert.deepEqual(reports[0].fields, { actual: 13, entity: null, limit: 12, limit_key: 'proposal_max', request: null, stage: 4, tick: 1 });
    const ok = { clock: { minute: 0, seq: 0 } };
    const okLog = [];
    assert.deepEqual(advance(ENGINE, ok, 1, [reacting(okLog, fan(12), { assertion: false })]), { ok: true, minute: 1 });
    assert.equal(okLog.length, 14);
  });
});

// ---------- keyKinds handle 与运行时句柄文法 ----------

test('keyKinds (c) 封闭清单含 handle；due.* 的 keyKinds 写 [handle]；handle 格式即代号文法，不合即拒', () => {
  assert.deepEqual([...KEY_NONENTITY], ['event', 'dimKey', 'identityKey', 'handle', 'seedKey']);
  const decl = JSON.parse(readFileSync(join(ROOT, 'world/ontology/state-owners.json'), 'utf8'));
  assert.deepEqual(decl.keyKinds['due.*'], ['handle']);
  assert.equal(decl.pathTypes['due.*'], 'struct:dueItem');
  assert.deepEqual(decl.stateKeys.due, { readers: [], writers: { '*': 'kernel/scheduler.mjs' } });
  const d = { stateKeys: { box: { readers: [], writers: { '*': 'box.mjs' } } }, pathTypes: { 'box.*': 'integer:count' }, keyKinds: { 'box.*': ['handle'] }, systems: {}, phases: [] };
  assert.deepEqual(mergeStateOwners(d, { units: new Set(['count']) }).errors, []);
  d.keyKinds['box.*'] = ['Handle'];
  assert.deepEqual(mergeStateOwners(d, { units: new Set(['count']) }).errors.map((e) => e.code), ['E-PATH-KEYKINDS']);
  // handle 类格式即 §1.9 代号文法（李白 11-18 03:31 裁定 1）：不合者 cancel 报 E-DIM-ID-FORMAT。
  const state = { clock: { minute: 0, seq: 0 } };
  tx(state, () => { schedule('npc_a', 'due_recurrence', 5, 'ref_1'); });
  quiet(() => {
    for (const bad of ['', 'a', 'Due_0', 'due-0', 'due.0', 'due 0', 7, null]) assert.deepEqual(tx(state, () => { cancel(bad); }), { ok: false, code: 'E-DIM-ID-FORMAT' }, String(bad));
  });
});

// ---------- 入堆缩放 ----------

test('入堆缩放：显式配置项 rules.clock.paceFactor 为 1/1（待补）；均衡类不缩放；延迟类 max(1, floor(延迟 × den ÷ num))；floorRX 求值待接入即抛', () => {
  assert.deepEqual(W.rules.clock.paceFactor, { num: 1, den: 1 });
  const row = JSON.parse(readFileSync(join(ROOT, 'world/rules/tables/clock.json'), 'utf8')).rows.find((r) => r.key === 'paceFactor');
  assert.ok(row.basis.startsWith('待补'));
  const eq = { paceClass: 'equilibrium', floorRX: null };
  const lat = { paceClass: 'latency', floorRX: null };
  assert.equal(enqueueDelay(W.rules.clock, eq, 4320), 4320);
  assert.equal(enqueueDelay(W.rules.clock, lat, 4320), 4320);
  // 卷二十 §4.10.5 示意：系数 2 下 4320 分钟入堆延迟 2160；系数只来自表，换表即换结果。
  assert.equal(enqueueDelay({ paceFactor: { num: 2, den: 1 } }, lat, 4320), 2160);
  assert.equal(enqueueDelay({ paceFactor: { num: 2, den: 1 } }, eq, 4320), 4320);
  assert.equal(enqueueDelay({ paceFactor: { num: 1, den: 4 } }, lat, 30), 120);
  assert.equal(enqueueDelay({ paceFactor: { num: 4, den: 1 } }, lat, 1), 1);
  assert.throws(() => enqueueDelay({}, lat, 10), codeIs('E-DIM-STRUCT-FIELD'));
  assert.throws(() => enqueueDelay(W.rules.clock, { paceClass: 'latency', floorRX: 'trip.minutes' }, 10), (e) => e instanceof Error && !('code' in e));
  assert.throws(() => enqueueDelay(W.rules.clock, eq, 0), codeIs('E-DIM-DOMAIN-RANGE'));
  // 块 4 两行 due_kind 都是均衡类（卷二十 :145、:147）。
  const kinds = W.vocab.families.get('due_kind').entries;
  assert.deepEqual([kinds.due_recurrence.paceClass, kinds.due_revive_window.paceClass], ['equilibrium', 'equilibrium']);
});

// ---------- 推进钩子：登记与节拍 ----------

test('registerAdvanceHook / registerAdvancePlan：形状核对、同一钩子交两次 E-PHASE-HOOK-DUPLICATE、provider 交两次 E-WRITER-DUPLICATE', () => {
  resetAdvanceRegistry();
  try {
    const fn = () => {};
    registerAdvanceHook('settleTest', 'rules/test-hooks.mjs', fn);
    assert.deepEqual(advanceHook('settleTest'), { file: 'rules/test-hooks.mjs', run: fn });
    assert.throws(() => registerAdvanceHook('settleTest', 'rules/test-hooks.mjs', fn), codeIs('E-PHASE-HOOK-DUPLICATE'));
    assert.throws(() => registerAdvanceHook('Settle', 'rules/test-hooks.mjs', fn), codeIs('E-DIM-ID-FORMAT'));
    assert.throws(() => registerAdvanceHook('settleB', '../x.mjs', fn), codeIs('E-DIM-STRUCT-FIELD'));
    assert.throws(() => registerAdvanceHook('settleB', 'rules/test-hooks.mjs', 'fn'), codeIs('E-DIM-STRUCT-FIELD'));
    registerAdvancePlan(() => []);
    assert.throws(() => registerAdvancePlan(() => []), codeIs('E-WRITER-DUPLICATE'));
    assert.throws(() => registerAdvancePlan(null), codeIs('E-DIM-STRUCT-FIELD'));
  } finally { resetAdvanceRegistry(); }
});

test('kernelApi 两行与 files.json：registerAdvanceHook、registerAdvancePlan 只给规则层、不收 state；advance-registry 不 import 规则层', () => {
  const decl = JSON.parse(readFileSync(join(ROOT, 'world/ontology/state-owners.json'), 'utf8'));
  assert.deepEqual(decl.kernelApi.exports.filter((x) => x.export.startsWith('kernel/advance-registry.mjs#')), [
    { export: 'kernel/advance-registry.mjs#registerAdvanceHook', callers: ['rules'], acceptsState: false },
    { export: 'kernel/advance-registry.mjs#registerAdvancePlan', callers: ['rules'], acceptsState: false },
  ]);
  assert.ok(JSON.parse(readFileSync(join(ROOT, 'server-plugin/kernel/files.json'), 'utf8')).includes('server-plugin/kernel/advance-registry.mjs'));
  const src = readFileSync(join(ROOT, 'server-plugin/kernel/advance-registry.mjs'), 'utf8');
  assert.deepEqual([...src.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]), ['./errors.mjs', './handles/keys.mjs']);
});

test('钩子节拍对齐绝对分钟：下一拍是 after 之后第一个满足 (m − phaseOffset) mod cadence = 0 的分钟', () => {
  assert.equal(nextBeat(0, 1440, 0), 1440);
  assert.equal(nextBeat(1439, 1440, 0), 1440);
  assert.equal(nextBeat(1440, 1440, 0), 2880);
  assert.equal(nextBeat(0, 60, 15), 15);
  assert.equal(nextBeat(15, 60, 15), 75);
  assert.equal(nextBeat(100, 7, 3), 101);
  assert.equal(nextBeat(-1, 1, 0), 0);
});

// 扩展包登记场景：真实声明表加一个系统、一个钩子（K4-46"扩展包登记场景加一行钩子验"）。
const PHASES = JSON.parse(readFileSync(join(ROOT, 'world/ontology/state-owners.json'), 'utf8')).phases;
function packDecl(hooks) {
  const d = JSON.parse(readFileSync(join(ROOT, 'world/ontology/state-owners.json'), 'utf8'));
  d.systems['sys.test_pack'] = { tables: [], entryCallerFiles: {}, entryJudges: [], phase: hooks };
  return mergeStateOwners(d, { units: W.env.units, kinds: new Set(W.tables.keys()), families: new Set(W.vocab.families.keys()) });
}
const withClockRules = (cadence, phaseOffset) => ({ ...W.rules, clock: { ...W.rules.clock, cadence, phaseOffset } });

test('cadence 逐钩子查：无钩子空表合法；登记一个钩子而缺 cadence 即 E-CLOCK-CADENCE；phaseOffset 每钩子一项且在 [0, cadence)；表里多出未登记钩子 E-DIM-REF-MISSING', () => {
  assert.deepEqual(W.owners.hooks, []);
  assert.deepEqual(checkHookCadence(W.rules, W.owners.hooks), []);
  const m = packDecl({ settleTest: { phase: 'economy', after: [], sortKey: 1 } });
  assert.deepEqual(m.errors, []);
  const run = (rules) => checkHookCadence(rules, m.merged.hooks).map((e) => [e.code, e.row, e.dim]);
  assert.deepEqual(run(W.rules), [['E-CLOCK-CADENCE', 'cadence', 'settleTest'], ['E-DIM-STRUCT-FIELD', 'phaseOffset', 'settleTest']]);
  assert.deepEqual(run(withClockRules({ settleTest: 1440 }, { settleTest: 0 })), []);
  assert.deepEqual(run(withClockRules({ settleTest: 1440 }, { settleTest: 1440 })), [['E-DIM-DOMAIN-RANGE', 'phaseOffset', 'settleTest']]);
  assert.deepEqual(run(withClockRules({ settleTest: 0 }, { settleTest: 0 })), [['E-DIM-DOMAIN-RANGE', 'cadence', 'settleTest']]);
  assert.deepEqual(run(withClockRules({ settleTest: 60, ghost: 60 }, { settleTest: 0, ghost: 0 })), [['E-DIM-REF-MISSING', 'cadence', 'ghost'], ['E-DIM-REF-MISSING', 'phaseOffset', 'ghost']]);
});

test('加载入口接上 cadence 核对：clock.json 写了声明表里没有的钩子即加载失败（E-DIM-REF-MISSING，经 loadWorld）', () => {
  const tmp = testTempRoot('clock-hooks-');
  try {
    const real = (f) => readFileSync(join(ROOT, 'world/rules', f), 'utf8');
    const reg = JSON.parse(real('registry.json'));
    const row = reg.rows.find((r) => r.code === 'clock');
    for (const k of ['cadence', 'phaseOffset']) row.type[k].fields.ghost = { type: 'integer', unit: 'minute' };
    writeUnderTempRoot(tmp, 'registry.json', JSON.stringify(reg));
    for (const r of reg.rows) {
      let text = real(r.file);
      if (r.code === 'clock') {
        const doc = JSON.parse(text);
        doc.rows.find((x) => x.key === 'cadence').value = { ghost: 60 };
        doc.rows.find((x) => x.key === 'phaseOffset').value = { ghost: 0 };
        text = JSON.stringify(doc);
      }
      writeUnderTempRoot(tmp, r.file, text);
    }
    const r = loadWorld(ROOT, { rulesDir: tmp });
    assert.equal(r.ok, false);
    assert.deepEqual(r.errors.filter((e) => e.table === 'rules.clock').map((e) => [e.code, e.row, e.dim]), [['E-DIM-REF-MISSING', 'cadence', 'ghost'], ['E-DIM-REF-MISSING', 'phaseOffset', 'ghost']]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    assert.ok(loadWorld(ROOT).ok); // 恢复真实世界的注册表与句柄
  }
});

test('钩子来源：按节拍与推进计划的单元执行，键 = (clock, phase 位次, sortKey, 层序, 钩子, 单元)；声明了没交函数、交了没声明都 E-DIM-REF-MISSING', () => {
  resetAdvanceRegistry();
  try {
    const m = packDecl({ settleTest: { phase: 'economy', after: [], sortKey: 1 }, tendTest: { phase: 'body', after: [], sortKey: 1 } });
    assert.deepEqual(m.errors, []);
    const decl = { hooks: m.merged.hooks, phases: PHASES };
    const engine = { ...ENGINE, rules: withClockRules({ settleTest: 1440, tendTest: 720 }, { settleTest: 0, tendTest: 0 }) };
    const plan = [{ unit: 'plc_b', tierOrder: 0, stepMinutes: 1, settleTo: 0 }, { unit: 'plc_a', tierOrder: 1, stepMinutes: 1, settleTo: 0 }];
    assert.throws(() => hookSource(engine, decl, plan), codeIs('E-DIM-REF-MISSING'));
    const log = [];
    const fn = (name) => (_e, st, beat) => log.push([st.clock.minute, name, beat.unit, beat.minute]);
    registerAdvanceHook('settleTest', 'rules/test-hooks.mjs', fn('settleTest'));
    registerAdvanceHook('tendTest', 'rules/test-hooks.mjs', fn('tendTest'));
    const state = { clock: { minute: 0, seq: 0 } };
    assert.deepEqual(advance(engine, state, 1440, [hookSource(engine, decl, plan)]), { ok: true, minute: 1440 });
    assert.deepEqual(log, [
      [720, 'tendTest', 'plc_b', 720], [720, 'tendTest', 'plc_a', 720],
      [1440, 'tendTest', 'plc_b', 1440], [1440, 'tendTest', 'plc_a', 1440],
      [1440, 'settleTest', 'plc_b', 1440], [1440, 'settleTest', 'plc_a', 1440],
    ]);
    registerAdvanceHook('strayTest', 'rules/test-hooks.mjs', fn('strayTest'));
    assert.throws(() => hookSource(engine, decl, plan), codeIs('E-DIM-REF-MISSING'));
  } finally { resetAdvanceRegistry(); }
});
