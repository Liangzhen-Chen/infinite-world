// I31 同刻全序（14 §14.2）：给定存档与输入，任意两次推进的事件序列逐字节相同。
// 第一版测试：同刻多到期项、同刻死亡、级联反应（广度优先 + 深度上限）、
// 打乱注册顺序/实体 id 后序列不变（争夺结果只随骰值键）、逐日 vs 一次推进序列相同（含 seq）。
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
    runTick, resolveContest, ScheduleHeap, diceKey, rollDice, clockDiceKey,
    compareDue, compareClock, applyConfigSet, schedulerConfig, advanceSystemSortKey,
    PHASE, runReactions,
} from '../../server-plugin/scheduler.mjs';
import { canonical } from '../../server-plugin/storage.mjs';

const hash = value => crypto.createHash('sha256').update(canonical(value)).digest('hex');
const SEED = 'i31-seed';
// 确定性洗牌（固定种子，便于复现）。
function seededShuffle(items, seed = 1) {
    const out = [...items]; let state = seed >>> 0;
    const rand = () => (state = (state * 1664525 + 1013904223) >>> 0) / 0x100000000;
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
}

test('阶段 2：同刻多到期项按 (到期项类, 锚实体 id, 登记序号) 排序，与输入顺序无关', () => {
    const items = [
        { id: 'b', dueClass: 'obligation', anchorId: 'e2', registeredSeq: 1 },
        { id: 'a', dueClass: 'case', anchorId: 'e9', registeredSeq: 1 },
        { id: 'c', dueClass: 'obligation', anchorId: 'e1', registeredSeq: 2 },
        { id: 'd', dueClass: 'case', anchorId: 'e1', registeredSeq: 1 },
    ];
    const { events } = runTick({ seed: SEED, minute: 600, dueItems: items });
    const ids = events.map(e => e.id);
    assert.deepEqual(ids, ['d', 'a', 'c', 'b'], '按 (类, 锚, 登记序号) 排序');
    // 打乱输入顺序，输出不变。
    const shuffled = seededShuffle(items, 7);
    const again = runTick({ seed: SEED, minute: 600, dueItems: shuffled });
    assert.deepEqual(again.events.map(e => e.id), ids);
    assert.deepEqual(again.events.map(e => e.seq), events.map(e => e.seq));
});

test('阶段 3：同刻时钟规则按 (层级, 包, 规则, 对象骰值键序) 排序，不按 id 字典序偏向', () => {
    const rules = [
        { id: 'c1', layer: 'statistical', packId: 'p', ruleId: 'r1', objectId: 'objA' },
        { id: 'c2', layer: 'intelligent', packId: 'p', ruleId: 'r1', objectId: 'objB' },
        { id: 'c3', layer: 'intelligent', packId: 'p', ruleId: 'r0', objectId: 'objA' },
    ];
    const { events } = runTick({ seed: SEED, minute: 600, clockRules: rules });
    // 智能层先于统计层；同层同包按 ruleId；对象顺序由骰值键决定而非 id 字典序。
    const ids = events.map(e => e.id);
    assert.equal(ids[0], 'c3', '智能层 ruleId 更小者先');
    assert.equal(ids[1], 'c2');
    assert.equal(ids[2], 'c1', '统计层最后');
    assert.ok(!(ids[0] === 'c2' && ids[1] === 'c3'), '对象顺序不由 id 字典序决定');
});

test('争夺池：同刻指向同一稀缺标的按缺省表裁决，抽签只随骰值键，不随阶段或实体 id', () => {
    const proposals = [
        { id: 'p_low', target: 'scarce', contest: 'lottery', ruleId: 'r', objectId: 'aaa', seq: 1 },
        { id: 'p_high', target: 'scarce', contest: 'lottery', ruleId: 'r', objectId: 'zzz', seq: 2 },
        { id: 'p_mid', target: 'scarce', contest: 'lottery', ruleId: 'r', objectId: 'mmm', seq: 3 },
    ];
    const [outcome] = resolveContest(proposals, { seed: SEED, minute: 600 });
    const winner = outcome.winners[0];
    // 胜者是骰值键最大者，而不是 id 字典序最小或 seq 最早者。
    const keys = proposals.map(p => [p.id, diceKey(SEED, p.ruleId, p.objectId, 600, p.seq)]);
    const expected = keys.reduce((best, cur) => cur[1] > best[1] ? cur : best)[0];
    assert.equal(winner.id, expected, '抽签胜者 = 骰值键最大者');
    assert.notEqual(winner.id, 'p_low', '不按 id 字典序取最小');
    // price：出价高者胜，同价抽签。
    const price = resolveContest([
        { id: 'bid1', target: 'goods', contest: 'price', bid: 10, ruleId: 'r', objectId: 'o1', seq: 1 },
        { id: 'bid2', target: 'goods', contest: 'price', bid: 20, ruleId: 'r', objectId: 'o2', seq: 2 },
    ], { seed: SEED, minute: 600 });
    assert.equal(price[0].winners[0].id, 'bid2');
    // firstToSatisfy → lottery（缺省表）。
    const fts = resolveContest([
        { id: 'f1', target: 'bounty', contest: 'firstToSatisfy', ruleId: 'r', objectId: 'o1', seq: 1 },
        { id: 'f2', target: 'bounty', contest: 'firstToSatisfy', ruleId: 'r', objectId: 'o2', seq: 2 },
    ], { seed: SEED, minute: 600 });
    assert.equal(fts[0].contest, 'lottery');
    assert.equal(fts[0].winners.length, 1);
});

test('同刻两位继承人死亡：按锚实体序确定 transition 顺序，争夺裁决不偏向实体 id', () => {
    const heirs = [
        { id: 'heirA', dueClass: 'estate', anchorId: 'heirA', registeredSeq: 1, target: 'crown', ruleId: 'inherit', objectId: 'heirA' },
        { id: 'heirB', dueClass: 'estate', anchorId: 'heirB', registeredSeq: 2, target: 'crown', ruleId: 'inherit', objectId: 'heirB' },
    ];
    const a = runTick({ seed: SEED, minute: 600, dueItems: heirs });
    const b = runTick({ seed: SEED, minute: 600, dueItems: [...heirs].reverse() });
    assert.deepEqual(a.events.map(e => e.seq), b.events.map(e => e.seq));
    const dueEvents = a.events.filter(e => e.phase === PHASE.due);
    assert.deepEqual(dueEvents.map(e => e.anchorId), ['heirA', 'heirB'], 'transition 顺序 = 锚实体序');
    const win = a.events.find(e => e.verb === 'contest_win');
    assert.ok(win, '争夺有唯一胜者');
    assert.ok(['heirA', 'heirB'].includes(win.id));
});

test('级联反应：广度优先 + 深度上限，超限写 reaction_cut', () => {
    const expand = cause => (cause.depth >= 2 ? [] : [
        { id: `r${cause.seq}-a`, ruleId: 'ruleA', packId: 'p', priorityClass: 'social' },
        { id: `r${cause.seq}-b`, ruleId: 'ruleB', packId: 'p', priorityClass: 'social' },
    ]);
    const { events } = runTick({
        seed: SEED, minute: 0,
        external: [{ id: 'root', priorityClass: 'social' }],
        expand, config: { depthLimit: 2, proposalLimit: 100 },
    });
    const reactions = events.filter(e => e.phase === PHASE.reaction);
    const depth1 = reactions.filter(e => e.depth === 1);
    const depth2 = reactions.filter(e => e.depth === 2);
    const cuts = events.filter(e => e.verb === 'reaction_cut');
    assert.equal(depth1.length, 2); assert.equal(depth2.length, 4);
    assert.equal(Math.max(...depth1.map(e => e.seq)), 3);
    assert.ok(Math.min(...depth2.map(e => e.seq)) > Math.max(...depth1.map(e => e.seq)), '广度优先：深度 1 全部先于深度 2');
    assert.equal(depth1[0].ruleId, 'ruleA'); assert.equal(depth1[1].ruleId, 'ruleB');
    assert.equal(cuts.length, 4); assert.ok(cuts.every(c => c.depth === 3));
    assert.deepEqual(cuts.map(c => c.cause).sort((a, b) => a - b), [4, 5, 6, 7]);
});

test('每刻提案上限：超限被截断并写 reaction_cut', () => {
    const expand = () => Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, ruleId: `rule${i}`, packId: 'p', priorityClass: 'social' }));
    const { events, cut } = runTick({
        seed: SEED, minute: 0,
        external: [{ id: 'root', priorityClass: 'social' }],
        expand, config: { depthLimit: 8, proposalLimit: 3 },
    });
    assert.equal(events.filter(e => e.phase === PHASE.reaction && e.verb !== 'reaction_cut').length, 3, '只执行 3 条提案');
    assert.ok(cut.some(c => c.limit === 'proposal'));
});

test('打乱注册顺序与实体 id 后事件序列哈希不变（争夺结果只随骰值键）', () => {
    const dueItems = [
        { id: 'd:e1', dueClass: 'obligation', anchorId: 'e1', registeredSeq: 1, target: 'scarce', ruleId: 'r1', objectId: 'e1' },
        { id: 'd:e2', dueClass: 'obligation', anchorId: 'e2', registeredSeq: 2, target: 'scarce', ruleId: 'r2', objectId: 'e2' },
        { id: 'd:e3', dueClass: 'obligation', anchorId: 'e3', registeredSeq: 3, target: 'scarce', ruleId: 'r3', objectId: 'e3' },
    ];
    const clockRules = [
        { id: 'c:e1', layer: 'intelligent', packId: 'p', ruleId: 'r1', objectId: 'e1' },
        { id: 'c:e2', layer: 'intelligent', packId: 'p', ruleId: 'r2', objectId: 'e2' },
        { id: 'c:e3', layer: 'intelligent', packId: 'p', ruleId: 'r3', objectId: 'e3' },
    ];
    const base = hash(runTick({ seed: SEED, minute: 600, dueItems, clockRules }).events);
    const regShuffled = hash(runTick({ seed: SEED, minute: 600, dueItems: seededShuffle(dueItems, 3), clockRules: seededShuffle(clockRules, 5) }).events);
    assert.equal(regShuffled, base, '打乱注册顺序 → 同一哈希');
    // 实体 id：枚举顺序被打乱（登记序号按规范化 id 序给出），输出不变。
    const entities = [
        { id: 'e1', ruleId: 'r1' }, { id: 'e2', ruleId: 'r2' }, { id: 'e3', ruleId: 'r3' },
    ];
    const build = list => {
        const rank = new Map([...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((e, i) => [e.id, i + 1]));
        return {
            dueItems: list.map(e => ({ id: `d:${e.id}`, dueClass: 'obligation', anchorId: e.id, registeredSeq: rank.get(e.id), target: 'scarce', ruleId: e.ruleId, objectId: e.id })),
            clockRules: list.map(e => ({ id: `c:${e.id}`, layer: 'intelligent', packId: 'p', ruleId: e.ruleId, objectId: e.id })),
        };
    };
    const f1 = build(entities);
    const f2 = build(seededShuffle(entities, 11));
    const h1 = hash(runTick({ seed: SEED, minute: 600, ...f1 }).events);
    const h2 = hash(runTick({ seed: SEED, minute: 600, ...f2 }).events);
    assert.equal(h2, h1, '打乱实体 id 枚举顺序 → 同一哈希');
});

test('逐日推进与一次推进 N 天产生相同的刻集合与事件序列（含 seq）', () => {
    const buildHeap = () => {
        const heap = new ScheduleHeap();
        for (const [minute, anchor] of [[500, 'e1'], [1500, 'e2'], [2500, 'e3']]) {
            heap.add({ kind: 'due', minute, dueClass: 'obligation', anchorId: anchor, registeredSeq: 1, ruleId: 'r', objectId: anchor });
        }
        for (const [minute, ruleId, objectId] of [[1000, 'c1', 'e1'], [2000, 'c2', 'e2']]) {
            heap.add({ kind: 'clock', minute, layer: 'intelligent', packId: 'p', ruleId, objectId });
        }
        return heap;
    };
    const runSpan = (heap, start, end, seq = 0) => {
        const events = [];
        for (const t of heap.ticksBetween(start, end)) {
            const due = heap.due(t); due.forEach(e => { e.processed = true; });
            const clocks = heap.clocks(t, SEED); clocks.forEach(e => { e.processed = true; });
            const r = runTick({ seed: SEED, minute: t, dueItems: due, clockRules: clocks, config: { depthLimit: 8, proposalLimit: 12 }, seq });
            events.push(...r.events); seq = r.seq;
        }
        return { events, seq };
    };
    const DAY = 1440, N = 2;
    const oneShot = runSpan(buildHeap(), 0, N * DAY);
    // 逐日推进沿用同一个日程堆（到期项处理一次后不再重现），只是分天跑 span。
    const dailyHeap = buildHeap();
    let dailyEvents = [], seq = 0;
    for (let d = 0; d < N; d++) { const r = runSpan(dailyHeap, d * DAY, (d + 1) * DAY, seq); dailyEvents.push(...r.events); seq = r.seq; }
    assert.deepEqual(dailyEvents.map(e => e.seq), oneShot.events.map(e => e.seq), 'seq 逐字节相同');
    assert.equal(hash(dailyEvents), hash(oneShot.events), '逐日 vs 一次推进事件序列相同');
    assert.equal(seq, oneShot.seq);
});

test('调度配置：config_set 校验键与值，写入存档，缺省深度 8 / 提案 12', () => {
    assert.deepEqual(schedulerConfig({}), { depthLimit: 8, proposalLimit: 12 });
    assert.deepEqual(applyConfigSet({}, 'depthLimit', 3), { depthLimit: 3, proposalLimit: 12 });
    assert.deepEqual(applyConfigSet({ scheduler: { depthLimit: 3, proposalLimit: 12 } }, 'proposalLimit', 5), { depthLimit: 3, proposalLimit: 5 });
    assert.throws(() => applyConfigSet({}, 'bogus', 1), /未知调度配置键/);
    assert.throws(() => applyConfigSet({}, 'depthLimit', -1), /0 到 100000/);
    assert.throws(() => applyConfigSet({}, 'depthLimit', 1.5), /0 到 100000/);
});

test('推进系统阶段归序键：未声明 phase 的系统保持原 order（默认顺序不变）', () => {
    assert.deepEqual(advanceSystemSortKey({ id: 'a', order: 100 }), [PHASE.due, 100]);
    const systems = [
        { id: 'x', order: 300 },
        { id: 'y', order: 100 },
        { id: 'z', order: 200 },
    ];
    const sorted = [...systems].sort((a, b) => {
        const x = advanceSystemSortKey(a), y = advanceSystemSortKey(b);
        for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
        return 0;
    });
    assert.deepEqual(sorted.map(s => s.id), ['y', 'z', 'x'], '全部未声明 phase 时按 order 排序');
});
