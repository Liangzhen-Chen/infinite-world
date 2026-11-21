// 存档读档入口（卷二 §2.9 第 0 条"存档四路" :940–944、登记入口表 kernel/load/save.mjs；§2.9 第 3 条 Sealed 读回重算 :1128；
// 卷二十七 R27-4.3、R27-4.8、R27-7.5、A27-4.4、A27-4.6）。JSON 文本解析只在 kernel/load/*（§2.8 表 kernel 行 :844）。
// 读档只读不写：任何失败都不改、不删存档目录下的文件（A27-4.6）。
// 规则指纹：读档入口对 rulesDigest 只做一次相等比较，不等即 E-SAVE-RULES-MISMATCH 拒读，不迁移、不修补（R27-4.3、R27-7.5；体检 K2-21）。
// 清单引用的分片缺失或摘要不符：报 E-SAVE-SHARD-DIGEST，回退到上一个完好清单并报 E-SAVE-TORN（R27-4.8）；两份都不完好即 E-SAVE-TORN 拒读；两份都不存在是空槽，E-SAVE-EMPTY（首启自动读档视为新档，见 autoLoadSlot）。
// 恢复 = 最近一个完好快照 + 其后日志里的请求重跑（R27-4.5）：loadSlot 只交回快照与其后的日志条目（只读）；
// loadAction（菜单"读档"动作）在本文件内做重跑 replay_apply（R27-7.2：读档恢复出的状态就是重跑的结果），导入写盘后与本机存档同一条读档流程（卷二 :968）。
// 摘要排除表：读入库生成文件，与按声明表生成的结果逐值比对，不一致 E-DIGEST-EXCLUDE-DRIFT（卷二十七 R27-5.8；卷二 :826）。

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseJsonStrict } from './json-text.mjs';
import {
  LAYOUT_NAMES, MANIFEST_FIELDS, slotOk, slotDir, shardPath, sha256Text, sha256Base64, walkPathTree, bookFrom, compileLayout,
  digestExcludeDoc, installDigestExclude, isSealedStoreForm, docOfState, stateOfDoc, saveDigest, commitSlot, tickEnd, BUNDLE,
} from '../save.mjs';
import { canonicalEqual } from '../storage.mjs';
import { KernelError, codeOf } from '../errors.mjs';
import { report } from '../report.mjs';
import { isHex64 } from '../handles/keys.mjs';
import { buildE } from '../handles/generated.mjs';
import { T } from '../handles/markers.mjs';
import { postReply } from '../transport/reply-channel.mjs';
import { saveEnv, currentGame, setGame } from '../save-session.mjs';
import { installProposalSession, submitProposal } from '../transaction.mjs';
import { installEventLog } from '../events.mjs';
import { installTickEnd } from '../scheduler.mjs';
import { clone } from '../clone.mjs';
import { base64ToBytes, utf8ToText, utf8Length } from '../bytes.mjs';

const E = buildE();
// 分片切分方式与文档部分、清单状态的固定记号（卷二十七 R27-4.1 :124、§1.9 族 partition/state）：单一定义，比较处引用。
const PARTITION = Object.freeze({ byUnit: 'part_by_unit', byChunk: 'part_by_chunk' });
const DOC_PART = Object.freeze({ data: 'doc_data' });
/** 清单状态（checkManifest 的返回字段 state）：本文件的单一定义，写盘侧 save.mjs 也引用它比较。 */
export const MANIFEST_STATE = Object.freeze({ missing: 'missing', ok: 'ok', torn: 'torn' });

/** 入库的摘要排除表（生成文件，取代旧的手写表；卷一 §8.3 :643 的文件名不变）。 */
export const DIGEST_EXCLUDE_FILE = 'world/rules/tables/digest-exclude.json';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** 读并解析一个 JSON 文件；不存在或解析不过返回 undefined。 @param {string} file */
function readJson(file) {
  if (!existsSync(file)) return undefined;
  const parsed = parseJsonStrict(readFileSync(file, 'utf8'));
  return parsed.errors.length ? undefined : parsed.value;
}

// ---------- 摘要排除表（R27-5.8） ----------

/**
 * 读入库排除表、与生成结果比对，一致则收下（kernel/save.mjs installDigestExclude）并返回路径表；不一致或读不到即 E-DIGEST-EXCLUDE-DRIFT。
 * 挂接时在声明表合并通过之后调一次。
 * @param {string} root 仓库根 @param {{displayPaths?: string[]}} merged 声明表合并结果
 * @returns {string[]}
 */
export function loadDigestExclude(root, merged) {
  const want = digestExcludeDoc(merged);
  const got = readJson(join(root, DIGEST_EXCLUDE_FILE));
  if (got === undefined || !canonicalEqual(got, want)) throw new KernelError('E-DIGEST-EXCLUDE-DRIFT', {}, `${DIGEST_EXCLUDE_FILE} differs from the generated table (run tools/gen-digest-exclude.mjs)`);
  installDigestExclude(want.paths);
  return want.paths;
}

// ---------- 清单 ----------

/**
 * 清单引用的全部文件摘要（kernel/save.mjs 回收分片时用）；清单不存在或读不出返回空表。
 * @param {string} file
 * @returns {string[]}
 */
export function readManifestDigests(file) {
  const m = readJson(file);
  return isObj(m) && Array.isArray(m.shardDigests) ? m.shardDigests.filter(isHex64) : [];
}

function manifestShapeOk(m) {
  if (!isObj(m)) return false;
  const keys = Object.keys(m).sort();
  if (keys.length !== MANIFEST_FIELDS.length || keys.some((k, i) => k !== MANIFEST_FIELDS[i])) return false;
  return Array.isArray(m.shardDigests) && m.shardDigests.every(isHex64)
    && Array.isArray(m.logSegments) && m.logSegments.every((s, i) => isObj(s) && Number.isInteger(s.count) && typeof s.digest === 'string' && typeof s.sealed === 'boolean' && (s.sealed || i === m.logSegments.length - 1))
    && Array.isArray(m.snapshotIndex) && m.snapshotIndex.length > 0 && m.snapshotIndex.every((s) => isObj(s) && Number.isInteger(s.atEvent) && isObj(s.shards))
    && typeof m.rulesDigest === 'string' && Number.isInteger(m.clockMinute) && Number.isInteger(m.slot);
}

/**
 * 核对一份清单：不存在 missing；读不出或字段不合 bad；引用的分片缺失或摘要不符 torn；全部完好 ok（带分片文本）。
 * @param {string} dir @param {string} name
 * @returns {{state: 'missing' | 'bad' | 'torn'} | {state: 'ok', manifest: any, texts: Map<string, string>}}
 */
export function checkManifest(dir, name) {
  const file = join(dir, name);
  if (!existsSync(file)) return { state: 'missing' };
  const m = readJson(file);
  if (!manifestShapeOk(m)) return { state: 'bad' };
  /** @type {Map<string, string>} */
  const texts = new Map();
  for (const d of m.shardDigests) {
    const p = shardPath(dir, d);
    if (!existsSync(p)) return { state: 'torn' };
    const text = readFileSync(p, 'utf8');
    if (sha256Text(text) !== d) return { state: 'torn' };
    texts.set(d, text);
  }
  return { state: 'ok', manifest: m, texts };
}

// ---------- 读回分片 ----------

function parseShard(texts, digest) {
  const text = texts.get(digest);
  if (text === undefined) throw new KernelError('E-SAVE-SHARD-DIGEST', {}, `shard ${digest} not listed in shardDigests`);
  const parsed = parseJsonStrict(text);
  if (parsed.errors.length) throw new KernelError('E-SAVE-SHARD-DIGEST', {}, `shard ${digest} does not parse`);
  return parsed.value;
}

function setIn(root, segs, value) {
  let cur = root;
  for (const s of segs.slice(0, -1)) {
    if (!Object.hasOwn(cur, s)) cur[s] = {};
    cur = cur[s];
  }
  cur[segs[segs.length - 1]] = value;
}

/** Sealed 存档形态读回并重算摘要（:1128；不一致 E-SEAL-DIGEST）。 @param {any} v */
function decodeSealedValue(v) {
  if (!isSealedStoreForm(v) || sha256Base64(v.bytes) !== v.digest) throw new KernelError('E-SEAL-DIGEST', { entity: null }, 'sealed bytes do not match digest');
  return { bytes: v.bytes, digest: v.digest };
}

/**
 * 由完好清单拼回最近快照处的四个部分与全部日志条目。
 * @param {any} m 清单 @param {Map<string, string>} texts @param {import('../save.mjs').SaveLayout} layout
 */
function assemble(m, texts, layout) {
  const compiled = compileLayout(layout);
  /** @type {Record<string, any>} */
  const doc = { doc_data: { base: {}, appends: [] }, doc_state: {}, doc_holdings: {}, doc_ledger: {} };
  const snapIndex = m.snapshotIndex;
  const latest = snapIndex[snapIndex.length - 1];
  const rowOf = new Map([...compiled.pathRows, ...compiled.dataRows.map((d) => d.row)].map((r) => [r.shard, r]));
  for (const code of Object.keys(latest.shards).sort()) {
    const ref = latest.shards[code];
    if (compiled.appendRow && code === compiled.appendRow.shard) {
      if (!Array.isArray(ref)) throw new KernelError('E-SAVE-SHARD-UNCOVERED', {}, `${code}: append row needs a digest list`);
      doc.doc_data.appends = ref.map((d) => parseShard(texts, d));
      continue;
    }
    const row = rowOf.get(code);
    const multi = row !== undefined && (row.partition === PARTITION.byUnit || row.partition === PARTITION.byChunk);
    if (!row || (multi ? !Array.isArray(ref) || !ref.every((d) => typeof d === 'string') : typeof ref !== 'string')) throw new KernelError('E-SAVE-SHARD-UNCOVERED', {}, `snapshot shard ${code} has no row in the layout`);
    // part_by_unit / part_by_chunk 一行是各单元 / 里块一片的摘要列表；每片是带完整路径的子树，逐片拼回。
    for (const d of multi ? ref : [ref]) {
      const content = parseShard(texts, d);
      if (row.part === DOC_PART.data) { Object.assign(doc.doc_data.base, content); continue; }
      walkPathTree(content, (segs, v, rec) => setIn(doc[row.part], segs, rec.sealed ? decodeSealedValue(v) : v));
    }
  }
  /** @type {import('../save.mjs').Segment[]} */
  const segments = [];
  const entries = [];
  for (const s of m.logSegments) {
    const list = parseShard(texts, s.digest);
    if (!Array.isArray(list) || list.length !== s.count) throw new KernelError('E-SAVE-SHARD-DIGEST', {}, `log segment ${s.digest} count mismatch`);
    // 未封的日志尾读回后仍算未封，下次封段时与新条目一起封。
    if (s.sealed) segments.push({ count: s.count, text: texts.get(s.digest) || '', digest: s.digest });
    entries.push(...list);
  }
  // 快照的分片文本也带回日志簿，再存档时未变的分片不重写（R27-4.7）。
  const snapshots = snapIndex.map((s) => {
    const digests = Object.values(s.shards).flatMap((r) => (Array.isArray(r) ? r : [r]));
    return { atEvent: s.atEvent, shards: s.shards, files: digests.map((d) => ({ digest: d, text: texts.get(d) || '' })) };
  });
  const book = bookFrom(layout, entries, segments, snapshots);
  doc.doc_log = entries;
  return { doc, atEvent: latest.atEvent, logTail: entries.slice(latest.atEvent), book };
}

/**
 * 从槽位读档（菜单"读档"动作经 menu-entry 在 kernel 组内调用；导入写盘后同一流程，卷二 :944 第 5 条）。只读不写。
 * 成功：{ok: true, doc（快照处四个部分 + 全部日志）, atEvent（快照所在的事件序号）, logTail（其后待重跑的条目）, clockMinute, saveDigest（存档时的存档摘要，重跑后核对用）, book, fellBack}。
 * 失败：{ok: false, code}，code ∈ E-SAVE-SLOT-INVALID、E-SAVE-EMPTY（槽位无存档：当前与上一个清单都不存在）、E-SAVE-TORN、E-SAVE-RULES-MISMATCH、E-SEAL-DIGEST、E-SAVE-SHARD-DIGEST 等。
 * 本函数是"明确要求载入某个已有存档"的一路（菜单读档、导入后读档），空槽即 E-SAVE-EMPTY。
 * @param {{root: string, slot: number, layout: import('../save.mjs').SaveLayout, rulesDigest: string}} args
 * @returns {{ok: true, doc: any, atEvent: number, logTail: any[], clockMinute: number, saveDigest: string, book: import('../save.mjs').LogBook, fellBack: boolean} | {ok: false, code: import('../types.d.ts').ErrorCode}}
 */
export function loadSlot({ root, slot, layout, rulesDigest }) {
  if (!slotOk(slot, layout)) return { ok: false, code: new KernelError('E-SAVE-SLOT-INVALID').code };
  const dir = slotDir(root, slot);
  const fields = { slot };
  const tornCode = new KernelError('E-SAVE-TORN').code;
  // 拼回失败（路径无声明、分片无对应行等）与清单残缺同样处理：当清单残缺回退，内部原因不作对外码（卷二 :939 闭集）。
  const tryManifest = (chosen) => {
    const m = chosen.manifest;
    // 规则指纹：只此一次相等比较（R27-4.3、R27-7.5）。
    if (m.rulesDigest !== rulesDigest) return { stop: { ok: false, code: new KernelError('E-SAVE-RULES-MISMATCH').code } };
    try {
      const out = assemble(m, chosen.texts, layout);
      return { stop: { ok: true, doc: out.doc, atEvent: out.atEvent, logTail: out.logTail, clockMinute: m.clockMinute, saveDigest: m.saveDigest, book: out.book, fellBack: false } };
    } catch (e) {
      const code = codeOf(e);
      if (code === null) throw e;
      // Sealed 字节与摘要不符是闭集里的拒读码（:1128），原样交回；其余拼回失败走回退。
      if (code === E.E_SEAL_DIGEST) return { stop: { ok: false, code } };
      return { stop: null };
    }
  };
  const cur = checkManifest(dir, LAYOUT_NAMES.current);
  // 两份清单都不存在：槽位无存档，E-SAVE-EMPTY（不借用 E-SAVE-TORN；李白 11-18 块 2-4 三件裁定 b）。
  if (cur.state === MANIFEST_STATE.missing && checkManifest(dir, LAYOUT_NAMES.previous).state === MANIFEST_STATE.missing) return { ok: false, code: new KernelError('E-SAVE-EMPTY').code };
  let wasCommitted = cur.state !== MANIFEST_STATE.missing;
  if (cur.state === MANIFEST_STATE.ok) {
    const r = tryManifest(cur);
    if (r.stop) return r.stop;
  } else if (cur.state === MANIFEST_STATE.torn) report(new KernelError('E-SAVE-SHARD-DIGEST').code, fields);
  const prev = checkManifest(dir, LAYOUT_NAMES.previous);
  if (prev.state !== MANIFEST_STATE.ok) return { ok: false, code: tornCode };
  const r = tryManifest(prev);
  if (!r.stop) return { ok: false, code: tornCode };
  // 当前清单坏了才算残缺回退；当前清单不存在（提交改名之间中断）时上一个清单就是最近完好的清单。
  if (wasCommitted) { report(tornCode, fields); if (r.stop.ok) r.stop.fellBack = true; }
  return r.stop;
}

/**
 * 启动时自动读档（卷二 :942 第 2 条）：没有请求也就没有回应句柄，失败时先 report(code, {slot})，交回失败结果；
 * 调用方据此记下"存档不可用"（reply_result 的 save_unavailable），第一次菜单响应带上它。
 * 首次启动读到空槽（E-SAVE-EMPTY）视为新档、不报错：不 report，交回 {ok: true, fresh: true}，调用方开新世界（李白 11-18 块 2-4 三件裁定 b）。
 * @param {{root: string, slot: number, layout: import('../save.mjs').SaveLayout, rulesDigest: string}} args
 * @returns {ReturnType<typeof loadSlot> | {ok: true, fresh: true}}
 */
export function autoLoadSlot(args) {
  const r = loadSlot(args);
  if (!r.ok && r.code === new KernelError('E-SAVE-EMPTY').code) return { ok: true, fresh: true };
  if (!r.ok) report(r.code, { slot: Number.isInteger(args.slot) ? args.slot : null });
  return r;
}

// ---------- 读档恢复（菜单"读档"动作）----------

const RESULT = T.code_enum.reply_result;
const CODE_FORM = 'E-DIM-STRUCT-FIELD';
const CODE_DIVERGE = 'E-REPLAY-DIVERGE';
const CODE_SIZE = 'E-SAVE-IMPORT-SIZE';
const CODE_SLOT = 'E-SAVE-SLOT-INVALID';
const rejected = (code) => ({ resultCode: RESULT.rejected, rejectCode: code });
// 输入序列条目（卷二十七 R27-7.3：日志里的玩家指令与推进请求，带 kernel 发的请求编号）；日志里别的条目是事件记录，重跑时由规则重新写出。
const isRequestEntry = (e) => isObj(e) && Object.hasOwn(e, 'request');

// 把一份游戏接到全局的三处挂接：提案会话（submitProposal 的状态与日志簿）、事件日志簿（emit）、刻末封段与快照（调度器每刻处理完后调）。
function wire(g) {
  installProposalSession({ state: g.state, resolve: g.resolve, book: g.book });
  installEventLog(g.book);
  installTickEnd((st) => { if (st === g.state) tickEnd(g.book, () => docOfState(g.book.compiled, g.state, g.data)); });
}

/**
 * 开局或装配交入进行中的游戏（6-16 开局、读档成功后都走这一处；kernel 组内用，不在 kernelApi）。
 * @param {{state: any, book: any, data: {base: any, appends: any[]}, resolve: (proposal: any) => any, clockMinute: (state: any) => number}} g
 * @returns {void}
 */
export function startGame(g) {
  setGame(g);
  wire(g);
}

// 重跑之后的核对（R27-7.2：重跑产生的每条记录与日志里同序号的那条逐字节相同；R27-4.1：重跑到存档时刻的存档摘要必须等于清单里的）。
// 一致返回 undefined；不一致返回第一处分歧 {event, primitive}（R27-7.2：报告第一处分歧的事件序号与原语序号）：
// event 是日志里的序号（条数不等取两边较短的长度处；逐条比取第一条不等的）；primitive 是该条两边都带 primitives 列表时第一处不等的下标，取不到为 null；
// 记录全相同而只有存档摘要不符时（分歧在状态，不在事件）两个都是 null。
function replayDivergence(g, loaded) {
  const tail = loaded.logTail;
  const got = g.book.entries;
  const common = Math.min(got.length - loaded.atEvent, tail.length);
  for (let i = 0; i < common; i++) {
    const a = got[loaded.atEvent + i];
    const b = tail[i];
    if (canonicalEqual(a, b)) continue;
    return { event: loaded.atEvent + i, primitive: firstPrimitiveDiff(a, b) };
  }
  if (got.length !== loaded.atEvent + tail.length) return { event: loaded.atEvent + common, primitive: null };
  const doc = docOfState(g.book.compiled, g.state, g.data);
  return saveDigest({ ...doc, doc_log: got }) === loaded.saveDigest ? undefined : { event: null, primitive: null };
}

function firstPrimitiveDiff(a, b) {
  if (!isObj(a) || !isObj(b) || !Array.isArray(a.primitives) || !Array.isArray(b.primitives)) return null;
  const n = Math.min(a.primitives.length, b.primitives.length);
  for (let i = 0; i < n; i++) if (!canonicalEqual(a.primitives[i], b.primitives[i])) return i;
  return a.primitives.length === b.primitives.length ? null : n;
}

/**
 * replay_apply（R27-7.2、R27-4.5）：由快照恢复状态，把日志簿截回快照处，按序重跑其后的玩家指令与推进请求（走与活局同一条 submitProposal；
 * 记录由重跑重新写出，原语列表只作核对，不原样施加），核对记录与存档摘要。不符即不换世界：挂接退回原来的游戏，原状态原日志簿不动。
 * 新状态在候选对象上做：挂接与进行中的游戏同时换成候选（二者始终指向同一份），不一致或过程抛错就一起退回原来那份再返回或原样往上抛。
 * @param {NonNullable<ReturnType<typeof currentGame>>} game @param {Extract<ReturnType<typeof loadSlot>, {ok: true}>} loaded
 * @returns {undefined | {event: number | null, primitive: number | null}} 重跑一致并已换上新世界返回 undefined；否则第一处分歧（世界没换）
 */
function restore(game, loaded) {
  const { book, atEvent } = loaded;
  // 截回快照处：快照之后的条目与越过快照的已封段都由重跑重新产生（刻末封段照常在重跑里发生）。
  book.entries.length = atEvent;
  while (book.segments.length > 0 && book.sealedCount > atEvent) book.sealedCount -= book.segments.pop().count;
  // 世界数据副本取存档里读回的那份（R27-4.2：每个世界自带副本，追加段是存档的一部分），不沿用当前局的。
  const next = { ...game, state: stateOfDoc(loaded.doc), book, data: loaded.doc.doc_data };
  startGame(next);
  let diverged;
  let finished = false;
  try {
    for (const e of loaded.logTail) if (isRequestEntry(e)) submitProposal(clone(e));
    diverged = replayDivergence(next, loaded);
    finished = true;
  } finally {
    // 过程抛错（没走完）与不一致都退回原来那一局。
    if (!finished || diverged !== undefined) startGame(game);
  }
  return diverged;
}

/**
 * 菜单"读档"动作（卷二 :940 第 1 条；明确要求载入某个已有存档，空槽即 E-SAVE-EMPTY）。成功 ok；没有存档环境或进行中的游戏 save_unavailable；
 * 拒读回 rejected 加拒收代号（E-SAVE-RULES-MISMATCH、E-SAVE-TORN、E-SAVE-EMPTY、E-SAVE-SLOT-INVALID、E-SEAL-DIGEST 等，loadSlot 给）；
 * 重跑与存档不一致回 error 加 E-REPLAY-DIVERGE（先 report；世界不换）。
 * @param {unknown} slot 槽位编号（未核对的数值）
 * @returns {{resultCode: string, rejectCode?: string}}
 */
export function loadAction(slot) {
  const env = saveEnv();
  const game = currentGame();
  if (env === null || game === null) return { resultCode: RESULT.save_unavailable };
  const r = loadSlot({ root: env.root, slot: /** @type {number} */ (slot), layout: env.layout, rulesDigest: env.rulesDigest });
  if (!r.ok) return rejected(r.code);
  const diverged = restore(game, r);
  if (diverged !== undefined) {
    report(CODE_DIVERGE, { slot: /** @type {number} */ (slot), event: diverged.event, primitive: diverged.primitive });
    return { resultCode: RESULT.error, rejectCode: CODE_DIVERGE };
  }
  return { resultCode: RESULT.ok };
}

// ---------- 导入（卷二 :968 第 5 条） ----------

// 存档文件的文本 → 清单与分片。与读档同一套校验：清单形状、分片摘要、规则指纹一次相等比较、各 Sealed 重算（assemble）；全部过了才返回。
// 先规则指纹后拼回，与 loadSlot 同序（布局不同的版本拼不回，不能把"版本不符"误报成残缺）。
function checkBundle(text, env) {
  const parsed = parseJsonStrict(text);
  const torn = new KernelError('E-SAVE-TORN').code;
  const b = parsed.errors.length ? undefined : parsed.value;
  // 存档文件只有清单与分片两个键：键都在 BUNDLE 里，且两个都在、都是对象。
  if (!isObj(b) || !Object.keys(b).every((k) => Object.values(BUNDLE).includes(k)) || !isObj(b[BUNDLE.manifest]) || !isObj(b[BUNDLE.shards])) return { ok: false, code: torn };
  const m = b[BUNDLE.manifest];
  if (!manifestShapeOk(m)) return { ok: false, code: torn };
  /** @type {Map<string, string>} */
  const texts = new Map();
  for (const d of m.shardDigests) {
    const t = Object.hasOwn(b[BUNDLE.shards], d) ? b[BUNDLE.shards][d] : undefined;
    if (typeof t !== 'string' || sha256Text(t) !== d) return { ok: false, code: new KernelError('E-SAVE-SHARD-DIGEST').code };
    texts.set(d, t);
  }
  if (m.rulesDigest !== env.rulesDigest) return { ok: false, code: new KernelError('E-SAVE-RULES-MISMATCH').code };
  try {
    assemble(m, texts, env.layout);
  } catch (e) {
    const code = codeOf(e);
    if (code === null) throw e;
    return { ok: false, code: code === E.E_SEAL_DIGEST ? code : torn };
  }
  return { ok: true, manifest: m, texts };
}

/**
 * `save_import` 路由的入口（卷二 :961 第 1 环；:965 第 2d 环"成功与拒收都走这里"；:979 第 5 条）。请求体当 unknown：
 * 先核对长度（请求体总长按 UTF-8 字节数，超过 saveImportMaxBytes 即 E-SAVE-IMPORT-SIZE）与槽位编号（越界即 E-SAVE-SLOT-INVALID），
 * 再把 bytes 从 base64 解成存档文件文本（kernel 自带码表与严格 UTF-8 解码，kernel/bytes.mjs），按存档文件格式收窄、校验（checkBundle），
 * 全部通过才写进目标槽位（commitSlot，与本机存档同一条写盘路径；写盘失败即 E-SAVE-WRITE-FAIL），任一不过即拒收：不写盘、不改 state。
 * 写盘之后"与从该槽位读档是同一条流程"（卷二 :983）：调与菜单同一个 loadAction，它的结果（成功、拒读、重跑不一致）就是这次导入的回应。
 * 每条返回路径恰好一次 postReply（第 2d 环）。没有存档环境或进行中的游戏（读档无处换）回 save_unavailable，不写盘。
 * 已定：先比规则指纹再拼回，与 loadSlot 同序——布局不同的版本拼不回，免得把"版本不符"误报成残缺；只影响多项同时不过时回哪个码。
 * @param {unknown} body @param {object} handle ReplyHandle
 * @returns {Promise<void>}
 */
export async function importEntry(body, handle) {
  const reply = (r) => postReply(handle, r);
  const env = saveEnv();
  if (env === null || currentGame() === null) { reply({ resultCode: RESULT.save_unavailable }); return; }
  // 长度先于形状核对（卷二 :983 "先核对长度与槽位编号"）：按请求体序列化后的 UTF-8 字节数计（宿主已解析过请求体，量不到原始字节数，见 docs/问题.md）。
  const whole = JSON.stringify(body);
  if (typeof whole === 'string' && utf8Length(whole) > env.saveImportMaxBytes) { reply(rejected(CODE_SIZE)); return; }
  if (!isObj(body) || !Object.hasOwn(body, 'slot') || typeof body.bytes !== 'string') { reply(rejected(CODE_FORM)); return; }
  if (!slotOk(body.slot, env.layout)) { reply(rejected(CODE_SLOT)); return; }
  const raw = base64ToBytes(body.bytes);
  const text = raw === null ? null : utf8ToText(raw);
  const checked = text === null ? { ok: false, code: new KernelError('E-SAVE-TORN').code } : checkBundle(text, env);
  if (!checked.ok) { reply(rejected(checked.code)); return; }
  // 清单的槽位编号是显示字段，换成目标槽位（它不进任何摘要）。
  const done = commitSlot(env.root, body.slot, checked.texts, { ...checked.manifest, slot: body.slot });
  if (!done.ok) { report(done.code, { slot: body.slot }); reply(rejected(done.code)); return; }
  reply(loadAction(body.slot));
}
