// 存档四路与存读恒等两个测试共用的夹具（块 6 第 6-20 张）：虚构顶层键（gauge、holdings、purse、clock、narration）、虚构分片表、
// 虚构的请求处理函数；不是世界内容，不进 world/。导入本文件即装好存储声明、摘要能力与排除表（与 tests/kernel/save.test.mjs 同法）。
import { mergeStateOwners } from '../../server-plugin/kernel/load/state-owners.mjs';
import { buildP } from '../../server-plugin/kernel/handles/generated.mjs';
import { installStorage, writePath } from '../../server-plugin/kernel/storage.mjs';
import { submitProposal } from '../../server-plugin/kernel/transaction.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import { installDigestCap, installDigestExclude, digestExcludeOf, saveDigest, createLogBook, appendLogEntry, tickEnd, docOfState, compileLayout } from '../../server-plugin/kernel/save.mjs';
import { startGame } from '../../server-plugin/kernel/load/save.mjs';
import { installSaveEnv, resetSaveSession, currentGame } from '../../server-plugin/kernel/save-session.mjs';
import { createDigestCap } from '../../server-plugin/textcore/digest.mjs';
import { testTempRoot } from '../accept/temp-root.mjs';

const DECL = {
  stateKeys: {
    gauge: { readers: [], writers: { '*.level': 'sys/gauge.mjs' } },
    holdings: { readers: [], writers: { '*.*': 'sys/hold.mjs' } },
    purse: { readers: [], writers: { '*.amount': 'sys/purse.mjs' } },
    clock: { readers: [], writers: { minute: 'kernel/scheduler.mjs', seq: 'kernel/scheduler.mjs' } },
    narration: { readers: [], writers: { '*': 'ai-gate/narration-gate.mjs' } },
  },
  systems: {},
  textPaths: ['narration.*'],
  textWriters: { 'narration.*': 'ai-gate/narration-gate.mjs' },
  pathTypes: {
    'gauge.*.level': 'integer:count',
    'holdings.*.*': 'integer:count',
    'purse.*.amount': 'integer:count',
    'clock.minute': 'integer:minute',
    'clock.seq': 'integer:count',
    'narration.*': 'sealed',
  },
  keyKinds: { 'gauge.*.level': ['gadget'], 'holdings.*.*': ['gadget', 'gadget'], 'purse.*.amount': ['gadget'] },
  phases: [],
};
const merged = mergeStateOwners(DECL, { units: new Set(['count', 'minute']), kinds: new Set(['gadget']) });
const P = buildP(DECL);
// 存储声明是全局的：测试文件里别处调 loadWorld 会换成真实世界的声明，所以每局开始都重装一次夹具的。
function installFixture() {
  installStorage(merged.merged);
  installDigestCap(createDigestCap());
  installDigestExclude(digestExcludeOf(merged.merged));
}
installFixture();

const HI_DIGEST = '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4'; // sha256("hi")，公认值
const SEALED_HI = { bytes: 'aGk=', digest: HI_DIGEST };
export const RULES = 'a'.repeat(64);
export const LAYOUT = {
  shards: [
    { shard: 'shd_data', part: 'doc_data', paths: ['*'], partition: 'part_single' },
    { shard: 'shd_append', part: 'doc_data', paths: [], partition: 'part_by_segment' },
    { shard: 'shd_state', part: 'doc_state', paths: ['gauge', 'clock', 'narration'], partition: 'part_single' },
    { shard: 'shd_hold', part: 'doc_holdings', paths: ['holdings'], partition: 'part_single' },
    { shard: 'shd_purse', part: 'doc_ledger', paths: ['purse'], partition: 'part_single' },
    { shard: 'shd_log', part: 'doc_log', paths: [], partition: 'part_by_segment' },
  ],
  segmentEvents: 2, snapshotEveryEvents: 4, keepSnapshots: 2, saveSlotCount: 3,
};
export const encode = (text) => Buffer.from(text, 'utf8').toString('base64');

export const logs = [];
useReportSink((rec) => logs.push(rec));

// 非确定的处理函数的计数器（只在"重跑不一致"一条里用）。
let drift = 0;
export const resetDrift = () => { drift = 0; };

// 提案 {request, as, kind, to, mark?} → 处理节点。mark 为真时处理函数另写一条非请求记录（像 emit 写的事件记录，重跑时由规则重新写出）。
export const resolve = (p) => ({
  node: 'view:act',
  file: p.as,
  handler: (s, q) => {
    if (q.kind === 'level') writePath(s, P.gauge_level('gad_one'), q.to);
    else if (q.kind === 'purse') writePath(s, P.purse_amount('gad_one'), q.to);
    else if (q.kind === 'hold') writePath(s, P.holdings('gad_one', 'gad_two'), q.to);
    else if (q.kind === 'drift') { drift += 1; writePath(s, P.gauge_level('gad_one'), drift); }
    if (q.mark) appendLogEntry(currentGame().book, { id: `mk${q.request}`, minute: q.to });
    // 非确定的记录：记录里的原语列表第二项取计数器（重跑时与存档时不同）。
    if (q.driftMark) appendLogEntry(currentGame().book, { id: `dm${q.request}`, minute: 0, primitives: [{ n: 1 }, { n: drift }] });
  },
});
export const lv = (n, to) => ({ request: n, as: 'sys/gauge.mjs', kind: 'level', to });
export const pu = (n, to, mark) => ({ request: n, as: 'sys/purse.mjs', kind: 'purse', to, mark });
export const ho = (n, to) => ({ request: n, as: 'sys/hold.mjs', kind: 'hold', to });

export function newGame() {
  const state = { gauge: { gad_one: { level: 0 } }, holdings: { gad_one: { gad_two: 1 } }, purse: { gad_one: { amount: 10 } }, clock: { minute: 0, seq: 0 }, narration: { nar_1: { ...SEALED_HI } } };
  const data = { base: { tbl_a: { x: 1 } }, appends: [] };
  const book = createLogBook(LAYOUT, docOfState(compileLayout(LAYOUT), state, data));
  return { state, book, data, resolve, clockMinute: (st) => st.clock.minute };
}
export const docNow = () => { const g = currentGame(); return docOfState(g.book.compiled, g.state, g.data); };
/** 当前游戏的存档摘要（全文档含日志）。 */
export const digestNow = () => saveDigest({ ...docNow(), doc_log: currentGame().book.entries });
/** 活局里的一步：提交一条请求，并像调度器那样在这一刻末调封段与快照挂接。 */
export function step(proposal) {
  const r = submitProposal(proposal);
  tickEnd(currentGame().book, docNow);
  return r;
}
/** 装好存档环境并开一局新游戏，返回存档根目录。 */
export function startNew(extraEnv = {}) {
  installFixture();
  resetSaveSession();
  const root = testTempRoot('saveroute-');
  installSaveEnv({ root, layout: LAYOUT, rulesDigest: RULES, saveImportMaxBytes: 104857600, ...extraEnv });
  startGame(newGame());
  return root;
}
