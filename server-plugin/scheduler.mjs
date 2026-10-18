// L0 调度器：同刻全序（14 §14.2）第一版。
// 目标：给定存档与输入，任意两次推进产生的事件序列逐字节相同（I31）。
// 本模块只依赖 node:crypto，供推进路径、后续到期项/时钟规则转换与 I31 夹具共用。
// 关键机制：五个阶段、阶段内排序键、每存档单调序号 seq、含 seq 的骰值键、日程堆、
// 争夺池（缺省表）、广度优先反应队列与深度/提案上限、config_set 调度配置。
import {createHash} from 'node:crypto';

const sha256 = text => createHash('sha256').update(text).digest('hex');

// ---- 骰值键（14 §14.5）----
// roll(key) 的键 = hash(战役种子, 规则或动作 id, 对象 id, 时刻, 本刻内序号)。
export function diceKey(seed, ruleId, objectId, minute, seq) {
    return sha256(`${seed}:${ruleId}:${objectId}:${minute}:${seq}`);
}
export function rollDice(seed, ruleId, objectId, minute, seq, sides = 20) {
    const bytes = createHash('sha256').update(`${seed}:${ruleId}:${objectId}:${minute}:${seq}`).digest();
    return bytes.readUInt32LE(0) % sides + 1;
}
// 阶段 3 排序用对象的骰值键序 roll(规则 id, 对象 id, 刻)（不含序号，见 14 §14.2）。
export function clockDiceKey(seed, ruleId, objectId, minute) {
    return sha256(`${seed}:${ruleId}:${objectId}:${minute}`);
}

// ---- 阶段（14 §14.2）----
export const PHASE = Object.freeze({ external: 1, due: 2, clock: 3, contest: 4, reaction: 5, assertion: 6 });
export const PHASE_NAMES = Object.freeze({ 1: '外部提案', 2: '到期项', 3: '时钟规则', 4: '争夺裁决', 5: '反应队列', 6: '刻末断言' });
export const phaseName = phase => PHASE_NAMES[phase] ?? String(phase);

// ---- 层级（智能 → 规则 → 统计）----
const LAYER_RANK = { intelligent: 0, rule: 1, statistical: 2, 智能: 0, 规则: 1, 统计: 2 };
export function layerRank(layer) {
    const rank = LAYER_RANK[layer];
    if (rank === undefined) throw new Error(`未知层级：${layer}`);
    return rank;
}

// ---- 阶段内排序键（14 §14.2）----
// 阶段 2 到期项：(到期项类, 锚实体 id 字典序, 登记序号)。
export function dueSortKey(item) {
    const classes=['协议续步与承接实体阶段','义务','案件阶段','组织计划阶段','效果与状态到期','许可 / 托养 / 封印维护到期'];
    const rank=classes.indexOf(item.dueClass);
    return [rank<0?item.dueClass??'':rank, item.anchorId ?? '', Number.isInteger(item.registeredSeq) ? item.registeredSeq : 0];
}
// 阶段 3 时钟规则：(层级, 包 id, 规则 id, 对象的骰值键序)。
export function clockSortKey(seed, minute, rule) {
    return [layerRank(rule.layer ?? 'rule'), rule.packId ?? '', rule.ruleId ?? '', clockDiceKey(seed, rule.ruleId ?? '', rule.objectId ?? '', minute)];
}
const lex = (a, b) => {
    for (let i = 0; i < a.length; i++) {
        const x = a[i], y = b[i];
        if (x < y) return -1;
        if (x > y) return 1;
    }
    return 0;
};
export const compareDue = (a, b) => lex(dueSortKey(a), dueSortKey(b));
export function compareClock(seed, minute) {
    return (a, b) => lex(clockSortKey(seed, minute, a), clockSortKey(seed, minute, b));
}

// ---- 日程堆 ----
// 刻的集合只由日程堆唯一确定（01 §1.9 / 14 §14.2）：没有到期项与时钟规则的刻不存在。
export class ScheduleHeap {
    constructor() { this.entries = []; }
    add(entry) {
        if (!Number.isInteger(entry.minute)) throw new Error('日程项缺少整数 minute');
        if (!['due', 'clock'].includes(entry.kind)) throw new Error(`日程项 kind 无效：${entry.kind}`);
        this.entries.push(entry);
    }
    // (start, end] 内有到期项或时钟规则的刻（升序、去重）。
    ticksBetween(start, end) {
        const ticks = new Set();
        for (const entry of this.entries) if (entry.minute > start && entry.minute <= end) ticks.add(entry.minute);
        return [...ticks].sort((a, b) => a - b);
    }
    // 时刻 ≤ minute 且尚未处理的到期项。
    due(minute) {
        return this.entries.filter(e => e.kind === 'due' && e.minute <= minute && e.processed !== true).sort(compareDue);
    }
    // 恰好在本刻唤醒的时钟规则。
    clocks(minute, seed) {
        return this.entries.filter(e => e.kind === 'clock' && e.minute === minute && e.processed !== true).sort(compareClock(seed, minute));
    }
}

// ---- 争夺池（14 §14.2 缺省表，全篇唯一定义）----
// 未声明 contest 的标的一律 lottery；core 显式声明：限量货/每日成交量 → price、职位 → rank、
// 开放债权人 firstToSatisfy → lottery、guest_of{detained} → rank、驻地/服务名额/lodges → lottery。
export const CONTEST_RULES = new Set(['lottery', 'price', 'arrival', 'rank']);
const normalizeContest = rule => {
    if (rule === 'firstToSatisfy') return 'lottery';
    return rule ?? 'lottery';
};
export function contestRuleFor(kind) {
    return ({goods:'price',daily_volume:'price',office:'rank',detained:'rank',bounty:'lottery',lodges:'lottery',service:'lottery',residence:'lottery',repayment:'rank'})[kind]??'lottery';
}
export function submitContest(d,proposal){
    if(!Array.isArray(d.contestPool))throw new Error('调度器未接线，不能提交争夺提案');
    d.contestPool.push({...proposal});
    return {status:'pending',id:proposal.id};
}
// 同组抽签：按骰值键（含 seq）取最大者，平局按提案键稳定排序。
function lotteryWinner(group, seed, minute) {
    const keyed = group.map(proposal => ({
        proposal,
        key: diceKey(seed, proposal.ruleId ?? '', proposal.objectId ?? '', minute, proposal.seq ?? 0),
    }));
    keyed.sort((a, b) => a.key === b.key ? lex([a.proposal.id ?? ''], [b.proposal.id ?? '']) : a.key < b.key ? 1 : -1);
    return keyed[0].proposal;
}
// 按 (标的 id, contest 结果) 排序的结果数组。返回每组的 {target, contest, winners, losers, reason}。
export function resolveContest(proposals, { seed, minute }) {
    const byTarget = new Map();
    for (const proposal of proposals) {
        const target = proposal.target;
        if (target === undefined || target === null) continue;
        if (!byTarget.has(target)) byTarget.set(target, []);
        byTarget.get(target).push(proposal);
    }
    const results = [];
    for (const [target, group] of [...byTarget.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
        const declarations=new Set(group.map(p=>normalizeContest(p.contest??contestRuleFor(p.targetKind))));
        if(declarations.size!==1)throw new Error(`争夺标的规则不一致：${target}`);
        const contest = [...declarations][0];
        let remaining=group[0].capacity??1;
        const winners=[];
        let available=group.filter(p=>(p.quantity??1)<=remaining);
        while(available.length){
        let winner;
        if (contest === 'price') {
            const best = Math.max(...available.map(p => Number.isFinite(p.bid) ? p.bid : -Infinity));
            const tied = available.filter(p => (Number.isFinite(p.bid) ? p.bid : -Infinity) === best);
            winner = tied.length === 1 ? tied[0] : lotteryWinner(tied, seed, minute);
        } else if (contest === 'arrival') {
            const best = Math.min(...available.map(p => Number.isFinite(p.arrival) ? p.arrival : Infinity));
            const tied = available.filter(p => (Number.isFinite(p.arrival) ? p.arrival : Infinity) === best);
            winner = tied.length === 1 ? tied[0] : lotteryWinner(tied, seed, minute);
        } else if (contest === 'rank') {
            const best = Math.min(...available.map(p => Number.isFinite(p.rank) ? p.rank : Infinity));
            const tied = available.filter(p => (Number.isFinite(p.rank) ? p.rank : Infinity) === best);
            winner = tied.length === 1 ? tied[0] : lotteryWinner(tied, seed, minute);
        } else {
            winner = lotteryWinner(available, seed, minute);
        }
        winners.push(winner);remaining-=winner.quantity??1;
        available=available.filter(p=>p!==winner&&(p.quantity??1)<=remaining);
        }
        const losers = group.filter(p => !winners.includes(p));
        results.push({ target, contest, winners, losers, reason: '刚被人抢先了' });
    }
    return results;
}

// ---- 反应队列（14 §14.2 阶段 4，广度优先 + 深度/提案上限）----
// 按起因事件 seq 广度优先；同一事件触发的多条规则按 (优先级类, 包 id, 规则 id)。
// 深度上限只作用于 social 与 autonomy 优先级类（core/legal 豁免在此最小版简化为按 priorityClass 判断）。
const PRIORITY = { core: 0, settlement: 1, legal: 2, autonomy: 3, social: 4 };
const depthLimited = priorityClass => ['social','autonomy'].includes(priorityClass??'social');
export function reactionSortKey(rule) {
    return [PRIORITY[rule.priorityClass ?? 'social'] ?? 3, rule.packId ?? '', rule.ruleId ?? ''];
}
export function runReactions(rootEvents, expand, { seed, minute, depthLimit = 8, proposalLimit = 12, seq = 0 } = {}) {
    const events = [];
    const cut = [];
    let count = 0;
    let nextSeq = seq;
    const queue = [...rootEvents].sort((a, b) => a.seq - b.seq);
    let cursor = 0;
    while (cursor < queue.length) {
        const cause = queue[cursor++];
        const depth = (cause.depth ?? 0) + 1;
        const reactions = (expand ? expand(cause) : []).slice().sort((a, b) => lex(reactionSortKey(a), reactionSortKey(b)));
        if(!reactions.length&&depthLimited(cause.priorityClass)&&depth>depthLimit)cut.push({cause:cause.seq,depth});
        for (const rule of reactions) {
            if(depthLimited(rule.priorityClass??cause.priorityClass)&&depth>depthLimit){
                cut.push({cause:cause.seq,depth});continue;
            }
            if (depthLimited(rule.priorityClass ?? cause.priorityClass) && count >= proposalLimit) {
                cut.push({ cause: cause.seq, depth, limit: 'proposal' });
                continue;
            }
            count++;
            nextSeq += 1;
            const event = { seq: nextSeq, phase: PHASE.reaction, minute, depth, priorityClass: rule.priorityClass ?? cause.priorityClass, ...rule };
            events.push(event);
            queue.push(event);
        }
    }
    return { events, seq: nextSeq, cut };
}

// ---- 调度配置（14 §14.2：配置是输入事件 config_set，写入存档）----
export const DEFAULT_SCHEDULER_CONFIG = Object.freeze({ depthLimit: 8, proposalLimit: 12 });
export const SCHEDULER_CONFIG_KEYS = ['depthLimit', 'proposalLimit'];
export function schedulerConfig(state) {
    const scheduler = state?.scheduler ?? {};
    return {
        depthLimit: scheduler.depthLimit ?? DEFAULT_SCHEDULER_CONFIG.depthLimit,
        proposalLimit: scheduler.proposalLimit ?? DEFAULT_SCHEDULER_CONFIG.proposalLimit,
    };
}
export function applyConfigSet(state, key, value) {
    if (!SCHEDULER_CONFIG_KEYS.includes(key)) throw new Error(`未知调度配置键：${key}；可选 ${SCHEDULER_CONFIG_KEYS.join('、')}`);
    if (!Number.isInteger(value) || value < 0 || value > 100000) throw new Error('调度配置值必须是 0 到 100000 的整数');
    return { ...(state?.scheduler ?? {}), ...schedulerConfig(state), [key]: value };
}
// 推进路径接线开关：SCHEDULER_WIRE_ADVANCE=1 或存档 state.scheduler.wireAdvance=true 时，
// world_time 推进改经调度器（每事件 seq、日程堆刻集、阶段归序、争夺池）。
// 默认关闭：开启会使 advance-registry 金快照破裂（刻集改由日程堆唯一确定 + state.scheduler
// 写回 seq/lastSettled），差异已记录于 S2B-ds-003.golden-diff.txt（S2b-1 步 3）。
export function schedulerWired(state) {
    if(process.env.SCHEDULER_WIRE_ADVANCE === '0')return false;
    return process.env.SCHEDULER_WIRE_ADVANCE === '1' || state?.scheduler?.wireAdvance !== false;
}

// ---- 完整一刻驱动 ----
// 按五阶段依次处理并给每个事件分配单调 seq；contest 裁决（3′）产生的事件 seq 晚于阶段 1–3。
export function runTick({
    seed, minute, external = [], dueItems = [], clockRules = [], expand = null,
    config = DEFAULT_SCHEDULER_CONFIG, seq = 0,
}) {
    let nextSeq = seq;
    const events = [];
    const emit = (phase, base, extra = {}) => {
        nextSeq += 1;
        const event = { seq: nextSeq, phase, minute, ...base, ...extra };
        events.push(event);
        return event;
    };
    // 阶段 1 外部提案：提交顺序。
    for (const proposal of external) emit(PHASE.external, proposal);
    // 阶段 2 到期项：(到期项类, 锚实体 id, 登记序号)。
    for (const item of [...dueItems].sort(compareDue)) emit(PHASE.due, item);
    // 阶段 3 时钟规则：(层级, 包 id, 规则 id, 对象骰值键序)。
    for (const rule of [...clockRules].sort(compareClock(seed, minute))) emit(PHASE.clock, rule);
    // 阶段 3′ 争夺裁决：按标的缺省表，产生的事件 seq 晚于阶段 1–3。
    const contested = events.filter(e => e.target !== undefined && e.target !== null);
    const contests = resolveContest(contested, { seed, minute });
    for (const outcome of contests) {
        for (const winner of outcome.winners) emit(PHASE.contest, { verb: 'contest_win', target: outcome.target, id: winner.id }, { rule: outcome.contest });
        for (const loser of outcome.losers) emit(PHASE.contest, { verb: 'contest_lose', target: outcome.target, id: loser.id, reason: outcome.reason }, { rule: outcome.contest });
    }
    // 阶段 4 反应队列：广度优先，深度与提案上限。
    const reactionResult = runReactions(events, expand, { seed, minute, depthLimit: config.depthLimit, proposalLimit: config.proposalLimit, seq: nextSeq });
    for (const reaction of reactionResult.events) events.push(reaction);
    nextSeq = reactionResult.seq;
    for (const c of reactionResult.cut) emit(PHASE.reaction, { verb: 'reaction_cut', cause: c.cause, depth: c.depth, ...(c.limit ? { limit: c.limit } : {}) });
    return { events, seq: nextSeq, contests, cut: reactionResult.cut };
}

// ---- 推进系统的阶段归序键（S2b 接入推进路径）----
// 无 phase 声明的系统归阶段 2 并按原 order，保持默认顺序不变（金快照不因接入而变）。
export function advanceSystemSortKey(system) {
    return [Number.isInteger(system?.phase) ? system.phase : PHASE.due, system?.order ?? 0];
}

// ---- 有状态调度器（引擎集成与跨刻 seq 衔接）----
export class Scheduler {
    constructor({ seed, config = DEFAULT_SCHEDULER_CONFIG } = {}) { this.seed = seed; this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config }; this.seq = 0; }
    setConfig(config) { this.config = { ...this.config, ...config }; }
    roll(ruleId, objectId, minute, sides = 20) { this.seq += 1; return rollDice(this.seed, ruleId, objectId, minute, this.seq, sides); }
    nextSeq() { return ++this.seq; }
}
