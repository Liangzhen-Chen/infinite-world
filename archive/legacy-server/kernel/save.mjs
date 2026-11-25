// 存档写盘（卷二 §2.9 第 0 条"存档四路" :940–944、登记出口表 kernel/save.mjs 行 :1065；卷二十七 §4.4、R27-4.1–4.10 :495–514）。
// 读档入口在 kernel/load/save.mjs（JSON 文本解析只许在 kernel/load/*，§2.8 表 kernel 行 :844）；分片文件名与清单字段只在这两个文件出现（S27-7）。
//
// 逻辑文档五个部分（族 docpart，R27-4.1）：doc_data（世界数据副本 {base: {<表代号>: 值}, appends: [追加段…]}）、
// doc_state、doc_holdings、doc_ledger（三者都是按 pathTypes 路径组织的对象树）、doc_log（事件日志，条目列表；以日志簿 LogBook 为准）。
// 存档摘要对逻辑文档算，只此一种（R27-4.1）：排除表按卷二 §2.9 第 3 条（:1137）生成，见 digestExcludeOf；物理分片不影响摘要（A27-4.2）。
// 存哪些路径、存成什么类型唯一依据 pathTypes（R27-4.4）：序列化逐层按 kernel/storage.mjs 的 pathTypes 查询走，不认任何具体路径名；
// 未声明的路径 E-PATH-UNDECLARED；sealed 类型写成 {"$sealed": 1, "bytes", "digest"}（:1128）。
// 事件日志加快照（R27-4.5）：日志只追加；封段与快照只在一刻全部处理完时（tickEnd）做；快照是除日志外四个部分的分片集合。
// 分片（R27-4.6）、写时复制（R27-4.7：分片文件按内容摘要寻址，已有即不重写）、原子提交（R27-4.8：先写齐分片，最后原子改名提交清单）、
// 修剪只管日志与快照、不碰状态（R27-4.9）、清单无墙钟（R27-4.10：显示字段只有 clockMinute 与槽位编号）。
// 摘要经装配文件注入的 DigestCap（:987；kernel 不 import node:crypto），注入前调用即抛错（启动失败）。

import { openSync, writeSync, fsyncSync, closeSync, renameSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { canonical, pathTypeOf, pathTypeHasDeeper, pathTypeRecords, isSealedValue, hasExactKeys } from './storage.mjs';

import { statePathSegments, isHex64 } from './handles/keys.mjs';
import { KernelError, codeOf } from './errors.mjs';
import { clone } from './clone.mjs';
import { markersOf } from './validate/types.mjs';
import { GRAMMAR_TOKENS, T } from './handles/markers.mjs';
import { postReply } from './transport/reply-channel.mjs';

// 本文件内部的固定记号：空字串、分片覆盖判定的三种结果（R27-4.6 覆盖核对的返回值）。
const SEG = Object.freeze({ empty: '' });
const COVER = Object.freeze({ partial: 'partial', full: 'full' });
import { readManifestDigests, checkManifest, MANIFEST_STATE, importEntry } from './load/save.mjs';
import { saveEnv, currentGame } from './save-session.mjs';
import { report } from './report.mjs';

// ---------- 存档布局的名字（S27-7：只在本文件与 kernel/load/save.mjs 出现） ----------

/** 逻辑文档五个部分（族 docpart 的条目，卷二十七 §1.9 表 :124）。 */
export const DOC_PARTS = Object.freeze(['doc_data', 'doc_state', 'doc_holdings', 'doc_ledger', 'doc_log']);
/** 按 pathTypes 路径组织的三个部分（R27-4.6"状态路径的匹配语义用卷二 §2.7"）。 */
export const PATH_PARTS = Object.freeze(['doc_state', 'doc_holdings', 'doc_ledger']);
/** 分片切分方式（族 partition，:126；part_by_chunk 第五版加，R27-4.6 :555）。 */
export const PARTITIONS = Object.freeze(['part_single', 'part_by_unit', 'part_by_segment', 'part_by_chunk']);
// 文档部分与切分方式的族句柄：成员由上面的 DOC_PARTS、PARTITIONS 派生。
const PART = markersOf('doc_part', DOC_PARTS);
const PARTITION = markersOf('partition', PARTITIONS);
// 格差分路径的顶层键句柄（卷五 §3.3 :362）；part_by_chunk 只用于 cells.<w>.<chunk>.<cellKey>（卷二十七 R27-4.6 :555）。
const GRID_KEY = markersOf('grid_diff_key', Object.freeze(['cells']));
// 格差分路径的段形状 cells.<格空间号>.<里块号>.<格键>：段数与片键下标都从本形状派生，不另写 0/1/-1 之外的数字字面量（卷二 S10 白名单）。
const GRID_PATH_SEGS = Object.freeze([GRID_KEY.cells, GRAMMAR_TOKENS.wildcard, GRAMMAR_TOKENS.wildcard, GRAMMAR_TOKENS.wildcard]);
/** 槽位目录、分片目录与两份清单（当前与上一个完好清单，R27-4.8 回退用）。 */
export const LAYOUT_NAMES = Object.freeze({ slotPrefix: 'slot-', shardsDir: 'shards', current: 'manifest.json', previous: 'manifest.prev.json', shardExt: '.json', tmpExt: '.tmp' });
/** 清单字段（§4.4.1 :487；另加槽位编号 slot，R27-4.10 显示字段之一）。没有墙钟字段。 */
export const MANIFEST_FIELDS = Object.freeze(['clockMinute', 'dataDigest', 'logSegments', 'rulesDigest', 'saveDigest', 'shardDigests', 'slot', 'snapshotIndex']);

const SEALED_TAG = '$sealed';

// ---------- 摘要能力（:981、:987） ----------

/** @typedef {{sha256Hex: (data: string, encoding: 'utf8' | 'base64') => string}} DigestCap 结构类型（构造者 textcore/digest.mjs，不为取类型 import 它，:984） */

/** @type {DigestCap | null} */
let digestCap = null;

/**
 * 装配时注入 DigestCap（mountKernel 那张卡在挂接时调；kernel 组内用，不在 kernelApi）。
 * @param {DigestCap | null} cap
 */
export function installDigestCap(cap) {
  digestCap = cap && typeof cap.sha256Hex === 'function' ? cap : null;
}

function cap() {
  if (!digestCap) throw new Error('kernel/save.mjs: DigestCap not injected (startup failure, 卷二 :1128)');
  return digestCap;
}

/** sha256(UTF-8(text)) 十六进制（kernel 组内：存档摘要、分片内容寻址）。 @param {string} text @returns {string} */
export function sha256Text(text) {
  return cap().sha256Hex(text, 'utf8');
}

/** sha256(base64 解出的字节) 十六进制（kernel 组内：Sealed 读档重算）。 @param {string} b64 @returns {string} */
export function sha256Base64(b64) {
  return cap().sha256Hex(b64, 'base64');
}

// ---------- 摘要排除表（卷二 §2.9 第 3 条 :1137、:824；卷一 §8.3 :644；卷二十七 R27-5.8） ----------

/** 排除表里除 display 字段集合之外的两项（卷二 :1137 原文列名：玩家起名与玩家手记，整键排除）。 */
export const EXCLUDE_WHOLE_KEYS = Object.freeze(['displayNames.*', 'playerNotes.*']);

/**
 * 生成排除表：state-owners.json 各顶层键的 display 字段集合（合并器已转成绝对模式的 displayPaths）∪ displayNames.* ∪ playerNotes.*，去重后升序。
 * 生成器（tools/gen-digest-exclude.mjs）与读档比对（kernel/load/save.mjs loadDigestExclude）共用这一个函数。
 * @param {{displayPaths?: string[]}} merged 声明表合并结果
 * @returns {string[]}
 */
export function digestExcludeOf(merged) {
  const all = new Set([...(merged.displayPaths || []), ...EXCLUDE_WHOLE_KEYS]);
  return [...all].sort();
}

/**
 * 入库生成文件的内容（tools/gen-digest-exclude.mjs 写出；读档前 kernel/load/save.mjs 逐值比对，不一致 E-DIGEST-EXCLUDE-DRIFT）。
 * @param {{displayPaths?: string[]}} merged
 * @returns {{generatedBy: string, rule: string, paths: string[]}}
 */
export function digestExcludeDoc(merged) {
  return { generatedBy: 'tools/gen-digest-exclude.mjs', rule: 'vol2 s2.9 rule 3: display field set union displayNames.* union playerNotes.*', paths: digestExcludeOf(merged) };
}

/** @type {string[][] | null} */
let excludeSegs = null;

/**
 * 收下（已与生成结果比对过的）排除表（kernel/load/save.mjs loadDigestExclude 调；kernel 组内用）。
 * @param {string[] | null} patterns
 */
export function installDigestExclude(patterns) {
  excludeSegs = patterns === null ? null : patterns.map((p) => {
    const s = statePathSegments(p);
    if (!s) throw new KernelError('E-DIGEST-EXCLUDE-DRIFT', {}, `bad exclude pattern ${p}`);
    return s;
  });
}

const segMatch = (pat, segs) => pat.length === segs.length && pat.every((s, i) => s === GRAMMAR_TOKENS.wildcard || s === segs[i]);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const OMIT = Symbol('omit');

// 按排除表剔除；某层对象的子项全被剔除而变空的，这一层也剔除（有没有起名、写没写手记都不改摘要，卷一 §8.3 三条性质第 2 条）。
function excludeTree(node, segs, pats) {
  if (segs.length && pats.some((p) => segMatch(p, segs))) return OMIT;
  if (!isObj(node)) return node;
  const out = {};
  let dropped = false;
  for (const k of Object.keys(node)) {
    const v = excludeTree(node[k], [...segs, k], pats);
    if (v === OMIT) dropped = true; else out[k] = v;
  }
  return dropped && Object.keys(out).length === 0 && segs.length ? OMIT : out;
}

// ---------- 按 pathTypes 序列化（R27-4.4） ----------

/**
 * 走一棵按 pathTypes 组织的树：每个值落在恰一条声明模式上（最具体者），交给 leaf(segs, value, rec)；中间层只能是对象。
 * 没有声明的路径 E-PATH-UNDECLARED。
 * @param {any} tree @param {(segs: string[], value: any, rec: {pattern: string, sealed: boolean}) => void} leaf
 */
export function walkPathTree(tree, leaf) {
  if (!isObj(tree)) throw new KernelError('E-PATH-UNDECLARED', { entity: null }, 'part root must be an object');
  const visit = (node, segs) => {
    for (const k of Object.keys(node).sort()) {
      const here = [...segs, k];
      const rec = pathTypeOf(here);
      if (rec) { leaf(here, node[k], rec); continue; }
      if (isObj(node[k]) && pathTypeHasDeeper(here)) { visit(node[k], here); continue; }
      throw new KernelError('E-PATH-UNDECLARED', { entity: null }, `no pathTypes pattern for ${here.join(GRAMMAR_TOKENS.pathSep)}`);
    }
  };
  visit(tree, []);
}

function setIn(root, segs, value) {
  let cur = root;
  for (const s of segs.slice(0, -1)) {
    if (!Object.hasOwn(cur, s)) cur[s] = {};
    cur = cur[s];
  }
  cur[segs[segs.length - 1]] = value;
}

/** Sealed 的存档形态（:1128）。 @param {any} v */
function encodeSealedValue(v) {
  if (!isSealedValue(v)) throw new KernelError('E-TEXT-UNGATED', { entity: null }, 'sealed path holds a non-Sealed value');
  return { [SEALED_TAG]: 1, bytes: v.bytes, digest: v.digest };
}

const SEALED_STORE_KEYS = Object.freeze([SEALED_TAG, 'bytes', 'digest'].sort());

/**
 * 存档里 Sealed 的形态 {"$sealed": 1, bytes, digest}（:1128）。
 * @param {any} v
 * @returns {boolean}
 */
export function isSealedStoreForm(v) {
  return hasExactKeys(v, SEALED_STORE_KEYS) && v[SEALED_TAG] === 1 && typeof v.bytes === 'string' && typeof v.digest === 'string';
}

/**
 * 一个按路径组织的部分 → 存档形态（sealed 换成存档形态，其余值原样复制）。
 * @param {any} tree
 * @returns {any}
 */
export function serializePathTree(tree) {
  const out = {};
  walkPathTree(tree, (segs, v, rec) => setIn(out, segs, rec.sealed ? encodeSealedValue(v) : clone(v)));
  return out;
}

/**
 * 存档摘要（R27-4.1，只此一种）：五个部分的存档形态，三个路径部分按排除表剔除后，sha256(UTF-8(canonical(文档)))。
 * 排除表须先经 kernel/load/save.mjs loadDigestExclude 比对收下。
 * @param {{doc_data: any, doc_state: any, doc_holdings: any, doc_ledger: any, doc_log: any[]}} doc
 * @returns {string}
 */
export function saveDigest(doc) {
  if (!excludeSegs) throw new Error('kernel/save.mjs: digest exclude table not installed (load order)');
  /** @type {Record<string, any>} */
  const view = {};
  for (const part of DOC_PARTS) {
    if (PATH_PARTS.includes(part)) {
      const v = excludeTree(serializePathTree(doc[part]), [], excludeSegs);
      view[part] = v === OMIT ? {} : v;
    } else view[part] = doc[part];
  }
  return sha256Text(canonical(view));
}

/** 世界数据副本的摘要 dataDigest（R27-4.2：覆盖原有部分加全部追加段）。 @param {any} docData @returns {string} */
export function dataDigestOf(docData) {
  return sha256Text(canonical(docData));
}

// ---------- part_by_unit 的"路径→模拟单元"映射（注入；李白 11-18 块 2-4 三件裁定 a；卷二十七 R27-4.6） ----------

/** @typedef {(segs: readonly string[]) => string | null | undefined} UnitOfPath 一个状态路径（逐段）归哪个模拟单元；返回单元代号，不归任何单元返回空 */

/** @type {UnitOfPath | null} */
let unitOfPath = null;

/**
 * kernelApi `registerUnitOfPath(fn)`：规则层在启动时交入"路径→模拟单元"映射函数（与 registerHoldWhileRecompute 同一做法，kernel 不 import 规则层）。
 * part_by_unit 分片行只经它取单元：没登记即 compileLayout 按未覆盖拒；登记了而某值的路径返回空（不是非空字串）即该次快照按未覆盖拒，不猜。
 * 只许交入一次（E-WRITER-DUPLICATE）。
 * @param {UnitOfPath} fn
 * @returns {void}
 */
export function registerUnitOfPath(fn) {
  if (typeof fn !== 'function') throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'registerUnitOfPath: fn must be a function');
  if (unitOfPath) throw new KernelError('E-WRITER-DUPLICATE', {}, 'unit-of-path mapping already registered');
  unitOfPath = fn;
}

/** 测试与重新挂接用：清掉已交入的映射（kernel 组内用，不在 kernelApi）。 */
export function resetUnitOfPath() {
  unitOfPath = null;
}

// 一个值的路径归哪个单元；没登记或返回空即 E-SAVE-SHARD-UNCOVERED。
function unitOf(row, segs) {
  const u = unitOfPath ? unitOfPath(Object.freeze([...segs])) : null;
  if (typeof u !== 'string' || u === SEG.empty) throw new KernelError('E-SAVE-SHARD-UNCOVERED', {}, `${row.shard}: ${segs.join(GRAMMAR_TOKENS.pathSep)} maps to no simulation unit`);
  return u;
}

// 一个格差分路径的里块片键：第二、三段（格空间号与里块号），不经注入映射（R27-4.6 :555）。
// 下标由 GRID_PATH_SEGS 派生（段形状 cells.<w>.<chunk>.<cellKey>），不另写数字字面量。
function chunkKeyOf(segs) {
  return segs.slice(1, GRID_PATH_SEGS.length - 1).join(GRAMMAR_TOKENS.pathSep);
}

// ---------- 存档布局参数与分片表（规则表 save-layout、host，卷二十七 §2.2 :161–164、:184） ----------

/**
 * @typedef {{shard: string, part: string, paths: string[], partition: string}} ShardRow
 * @typedef {{shards: ShardRow[], segmentEvents: number, snapshotEveryEvents: number, keepSnapshots: number, saveSlotCount: number}} SaveLayout
 * 由挂接方从规则表 rules.saveLayout 与 rules.host 取值交入；本文件不设任何缺省值。
 */

const posInt = (v) => Number.isInteger(v) && v >= 1;

// 分片行的路径模式完全覆盖某条 pathTypes 模式：段数不多于它，逐段相同或为 `*`；在它是 `*` 的段上分片行也必须是 `*`（否则只盖住一部分）。
function rowCovers(rowSegs, typeSegs) {
  if (rowSegs.length > typeSegs.length) return 'none';
  let partial = false;
  for (let i = 0; i < rowSegs.length; i++) {
    if (rowSegs[i] === GRAMMAR_TOKENS.wildcard) continue;
    if (typeSegs[i] === GRAMMAR_TOKENS.wildcard) { partial = true; continue; }
    if (rowSegs[i] !== typeSegs[i]) return 'none';
  }
  return partial ? 'partial' : 'full';
}

/**
 * 核对存档布局并把分片表编成查找表（R27-4.6；A27-4.1 逐条核对的模式一级）。
 * 每条 pathTypes 模式恰被一行完全覆盖；只盖住一部分、没盖住、被两行盖住，都是 E-SAVE-SHARD-UNCOVERED。
 * doc_log 恰一行且为 part_by_segment；doc_data 的 part_by_segment 行至多一行（追加段）。
 * part_by_segment 用在路径部分：pathTypes 还没有"只追加"标记（卷二十七 §5 登记未落），没有可用的路径，按未覆盖处理；
 * part_by_unit 只用在路径部分，路径归单元只经 registerUnitOfPath 注入的映射；没登记映射即按未覆盖处理（李白 11-18 块 2-4 三件裁定 a）。
 * @param {SaveLayout} layout
 * @returns {{rowOfPattern: Map<string, ShardRow>, dataRows: {row: ShardRow, segs: string[][]}[], appendRow: ShardRow | null, logRow: ShardRow, pathRows: ShardRow[]}}
 */
export function compileLayout(layout) {
  if (!isObj(layout)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'save layout must be an object');
  for (const k of ['segmentEvents', 'snapshotEveryEvents', 'keepSnapshots', 'saveSlotCount']) {
    if (!posInt(layout[k])) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `save layout ${k} must be an integer >= 1`);
  }
  if (layout.segmentEvents > layout.snapshotEveryEvents) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'segmentEvents must be <= snapshotEveryEvents');
  if (!Array.isArray(layout.shards)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'save layout shards must be a list');
  const codes = new Set();
  const uncovered = (detail) => new KernelError('E-SAVE-SHARD-UNCOVERED', {}, detail);
  /** @type {ShardRow[]} */ const pathRows = [];
  /** @type {{row: ShardRow, segs: string[][]}[]} */ const dataRows = [];
  let appendRow = null;
  const logRows = [];
  for (const row of layout.shards) {
    if (!isObj(row) || typeof row.shard !== 'string' || !DOC_PARTS.includes(row.part) || !PARTITIONS.includes(row.partition) || !Array.isArray(row.paths)) {
      throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'shard row must be {shard, part: docpart, paths: list, partition}');
    }
    if (codes.has(row.shard)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `duplicate shard code ${row.shard}`);
    codes.add(row.shard);
    if (row.part === PART.doc_log) { logRows.push(row); continue; }
    if (row.partition === PARTITION.part_by_unit) {
      if (row.part === PART.doc_data) throw uncovered(`${row.shard}: part_by_unit on doc_data (data tables are not state paths)`);
      if (!unitOfPath) throw uncovered(`${row.shard}: part_by_unit without a registered unit mapping`);
    }
    if (row.partition === PARTITION.part_by_chunk) {
      // 只用于格差分 cells.<w>.<chunk>.<cellKey>（第二、三段是格空间号与里块号，R27-4.6 :555）；别的路径即加载失败。
      if (row.part === PART.doc_data) throw uncovered(`${row.shard}: part_by_chunk on doc_data (data tables are not state paths)`);
      for (const p of row.paths) {
        const segs = statePathSegments(p);
        if (!segs || segs.length !== GRID_PATH_SEGS.length || segs[0] !== GRID_KEY.cells) throw uncovered(`${row.shard}: part_by_chunk needs cells.<w>.<chunk>.<cellKey> paths, got ${p}`);
      }
    }
    if (row.part === PART.doc_data) {
      if (row.partition === PARTITION.part_by_segment) {
        if (appendRow) throw uncovered(`two doc_data append rows: ${appendRow.shard}, ${row.shard}`);
        appendRow = row;
      } else dataRows.push({ row, segs: row.paths.map((p) => statePathSegments(p)).map((s) => (s && s.length === 1 ? s : null)) });
      continue;
    }
    if (row.partition === PARTITION.part_by_segment) throw uncovered(`${row.shard}: part_by_segment on a ${row.part} row needs append-only paths (none registered)`);
    pathRows.push(row);
  }
  if (logRows.length !== 1 || logRows[0].partition !== PARTITION.part_by_segment) throw uncovered('doc_log must be covered by exactly one part_by_segment row');
  for (const d of dataRows) if (d.segs.some((s) => s === null)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `${d.row.shard}: doc_data paths are single table codes or *`);
  /** @type {Map<string, ShardRow>} */
  const rowOfPattern = new Map();
  for (const t of pathTypeRecords()) {
    const full = [];
    for (const row of pathRows) for (const p of row.paths) {
      const rs = statePathSegments(p);
      if (!rs) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `${row.shard}: bad path pattern ${p}`);
      const c = rowCovers(rs, t.segs);
      if (c === COVER.partial) throw uncovered(`${row.shard}: ${p} covers only part of ${t.pattern}`);
      if (c === COVER.full && !full.includes(row)) full.push(row);
    }
    if (full.length === 0) throw uncovered(`${t.pattern} is not covered by any shard row`);
    if (full.length > 1) throw uncovered(`${t.pattern} is covered by ${full.map((r) => r.shard).join(', ')}`);
    // part_by_chunk 只用于格差分 cells.<w>.<chunk>.<cellKey>（段数恰为 GRID_PATH_SEGS.length，R27-4.6 :555）：它覆盖的 pathTypes 模式
    // 段数也必须恰为 4，否则（如更深的 cells.*.*.*.<字段>）按"用于别的路径即加载失败"拒收。
    if (full[0].partition === PARTITION.part_by_chunk && t.segs.length !== GRID_PATH_SEGS.length) {
      throw uncovered(`${full[0].shard}: part_by_chunk covers ${t.pattern} (${t.segs.length} segments), needs exactly ${GRID_PATH_SEGS.length} (cells.<w>.<chunk>.<cellKey>)`);
    }
    rowOfPattern.set(t.pattern, full[0]);
  }
  return { rowOfPattern, dataRows, appendRow, logRow: logRows[0], pathRows };
}

// ---------- 快照与日志簿（R27-4.5、R27-4.9、R27-7.3） ----------

/**
 * @typedef {{text: string, digest: string}} ShardFile
 * @typedef {{atEvent: number, shards: Record<string, string | string[]>, files: ShardFile[]}} Snapshot shards：分片代号 → 文件摘要（追加段一行与 part_by_unit 一行是摘要列表）
 * @typedef {{count: number, text: string, digest: string}} Segment
 * @typedef {{layout: SaveLayout, compiled: ReturnType<typeof compileLayout>, entries: any[], segments: Segment[], sealedCount: number, snapshots: Snapshot[]}} LogBook
 */

/** @typedef {{doc_data: any, doc_state: any, doc_holdings: any, doc_ledger: any}} Doc 逻辑文档除日志外的四个部分 */

const fileOf = (value) => { const text = canonical(value); return { text, digest: sha256Text(text) }; };

/**
 * 当前世界状态 → 逻辑文档的四个部分（存档与快照的来源）。状态是一棵按 pathTypes 组织的树；每个值落在恰一条声明模式上，
 * 模式归哪个部分由分片表的那一行的 part 定（R27-4.6），本函数不认任何路径名。读取不复制：返回的部分里的值就是状态里的值，调用方只读用
 * （takeSnapshot、saveDigest 各自复制或序列化）。
 * @param {ReturnType<typeof compileLayout>} compiled @param {any} state @param {{base: any, appends: any[]}} data 世界数据副本
 * @returns {Doc}
 */
export function docOfState(compiled, state, data) {
  /** @type {Doc} */
  const doc = { doc_data: data, doc_state: {}, doc_holdings: {}, doc_ledger: {} };
  walkPathTree(state, (segs, v, rec) => {
    const row = compiled.rowOfPattern.get(rec.pattern);
    if (!row || !PATH_PARTS.includes(row.part)) throw new KernelError('E-SAVE-SHARD-UNCOVERED', {}, `${segs.join(GRAMMAR_TOKENS.pathSep)} has no state-part shard row`);
    setIn(doc[row.part], segs, v);
  });
  return doc;
}

/**
 * 逻辑文档的三个路径部分 → 状态（读档恢复的起点）。三部分的值按各自路径放回同一棵树，值复制一份；Sealed 是 {bytes, digest} 原样。
 * @param {Doc} doc
 * @returns {any}
 */
export function stateOfDoc(doc) {
  // 新造的一棵树，不是某局进行中的 state：读档入口造出它、重跑成功才由 startGame 换上；活局的写仍只经 writePath（卷二 §2.6）。
  const fresh = {};
  for (const part of PATH_PARTS) walkPathTree(doc[part], (segs, v) => setIn(fresh, segs, clone(v)));
  return fresh;
}

/**
 * 一个快照：逻辑文档除日志外四个部分按分片表切成分片文件（R27-4.6"快照不是第六个部分"）。
 * 路径部分的每个值归它所在模式的那一行；值所在的部分与该行的 part 不同即 E-SAVE-SHARD-UNCOVERED。
 * @param {ReturnType<typeof compileLayout>} compiled @param {any} doc @param {number} atEvent
 * @returns {Snapshot}
 */
function takeSnapshot(compiled, doc, atEvent) {
  /** @type {Record<string, any>} */
  const content = {};
  for (const row of compiled.pathRows) content[row.shard] = {};
  for (const part of PATH_PARTS) {
    walkPathTree(doc[part], (segs, v, rec) => {
      const row = compiled.rowOfPattern.get(rec.pattern);
      if (!row || row.part !== part) throw new KernelError('E-SAVE-SHARD-UNCOVERED', {}, `${segs.join(GRAMMAR_TOKENS.pathSep)} found in ${part}, shard row is ${row ? row.part : 'none'}`);
      const value = rec.sealed ? encodeSealedValue(v) : clone(v);
      if (row.partition === PARTITION.part_by_unit) {
        // 按单元各成一片：content[行] 是 单元代号 → 该单元的路径子树。
        const u = unitOf(row, segs);
        if (!Object.hasOwn(content[row.shard], u)) content[row.shard][u] = {};
        setIn(content[row.shard][u], segs, value);
      } else if (row.partition === PARTITION.part_by_chunk) {
        // 按（格空间, 里块）各成一片：content[行] 是 片键 → 该里块的路径子树。
        const ck = chunkKeyOf(segs);
        if (!Object.hasOwn(content[row.shard], ck)) content[row.shard][ck] = {};
        setIn(content[row.shard][ck], segs, value);
      } else setIn(content[row.shard], segs, value);
    });
  }
  const data = doc.doc_data;
  if (!isObj(data) || !isObj(data.base) || !Array.isArray(data.appends)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'doc_data must be {base: object, appends: list}');
  for (const { row } of compiled.dataRows) content[row.shard] = {};
  for (const table of Object.keys(data.base).sort()) {
    const hit = compiled.dataRows.filter((d) => d.segs.some((s) => s[0] === GRAMMAR_TOKENS.wildcard || s[0] === table));
    if (hit.length !== 1) throw new KernelError('E-SAVE-SHARD-UNCOVERED', {}, `data table ${table} covered by ${hit.length} rows`);
    content[hit[0].row.shard][table] = clone(data.base[table]);
  }
  if (data.appends.length && !compiled.appendRow) throw new KernelError('E-SAVE-SHARD-UNCOVERED', {}, 'doc_data appends present but no part_by_segment doc_data row');
  /** @type {Record<string, string | string[]>} */
  const shards = {};
  const files = [];
  const multi = new Set(compiled.pathRows.filter((r) => r.partition === PARTITION.part_by_unit || r.partition === PARTITION.part_by_chunk).map((r) => r.shard));
  for (const code of Object.keys(content).sort()) {
    if (multi.has(code)) {
      // part_by_unit / part_by_chunk 一行是摘要列表，按片键（单元代号 / 格空间.里块）升序，每个一片（片里是带完整路径的子树，读回直接拼）。
      const fs = Object.keys(content[code]).sort().map((u) => fileOf(content[code][u]));
      shards[code] = fs.map((f) => f.digest);
      files.push(...fs);
      continue;
    }
    const f = fileOf(content[code]);
    shards[code] = f.digest;
    files.push(f);
  }
  if (compiled.appendRow) {
    const fs = data.appends.map(fileOf);
    shards[compiled.appendRow.shard] = fs.map((f) => f.digest);
    files.push(...fs);
  }
  return { atEvent, shards, files };
}

/**
 * 新世界的日志簿：核对布局，并在第 0 条事件处做第一个快照（恢复 = 最近完好快照 + 其后的日志，R27-4.5；没有快照就无处可恢复）。
 * @param {SaveLayout} layout
 * @param {{doc_data: any, doc_state: any, doc_holdings: any, doc_ledger: any}} doc 开局时的四个部分
 * @returns {LogBook}
 */
export function createLogBook(layout, doc) {
  const compiled = compileLayout(layout);
  return { layout, compiled, entries: [], segments: [], sealedCount: 0, snapshots: [takeSnapshot(compiled, doc, 0)] };
}

/**
 * 由读档结果重建日志簿（kernel/load/save.mjs 用；kernel 组内）。
 * @param {SaveLayout} layout @param {any[]} entries @param {Segment[]} segments @param {Snapshot[]} snapshots
 * @returns {LogBook}
 */
export function bookFrom(layout, entries, segments, snapshots) {
  const sealedCount = segments.reduce((n, s) => n + s.count, 0);
  return { layout, compiled: compileLayout(layout), entries: [...entries], segments: [...segments], sealedCount, snapshots: [...snapshots] };
}

/**
 * 把一条请求条目单独记入 doc_log（R27-7.3 :668"条目先单独提交"；卷二 §2.6 :503）。日志只追加；条目须是存档数据（canonical 可写），按副本记。
 * 由 kernel/transaction.mjs submitProposal 在处理事务之前调；处理事务回滚不抹它。
 * @param {LogBook} book @param {any} entry
 * @returns {number} 这条条目的序号（从 0 起）
 */
export function appendLogEntry(book, entry) {
  if (!book || !Array.isArray(book.entries)) throw new Error('kernel/save.mjs: appendLogEntry without a log book (mount order)');
  canonical(entry);
  book.entries.push(clone(entry));
  return book.entries.length - 1;
}

/**
 * 一刻全部处理完时调（R27-4.5"快照与封段只在一刻全部处理完时做；条数已到而这一刻还没处理完的，顺延到该刻末"）：
 * 未封条目 ≥ segmentEvents 即把它们封成一段；距上一个快照 ≥ snapshotEveryEvents 条即做快照，并只留最近 keepSnapshots 个（R27-4.9）。
 * 修剪只动快照与日志簿，不碰 state；更早的日志段原样保留（折叠归 R27-4.12，不在本卡）。
 * doc 可以是此刻四个部分的对象，也可以是产生它的函数：函数只在真要做快照时才调（每刻末都从状态拆一遍四个部分太贵）。
 * @param {LogBook} book @param {Doc | (() => Doc)} doc 此刻的四个部分
 * @returns {{sealed: boolean, snapshot: boolean}}
 */
export function tickEnd(book, doc) {
  const { segmentEvents, snapshotEveryEvents, keepSnapshots } = book.layout;
  let sealed = false, snapshot = false;
  const open = book.entries.length - book.sealedCount;
  if (open >= segmentEvents) {
    const f = fileOf(book.entries.slice(book.sealedCount));
    book.segments.push({ count: open, text: f.text, digest: f.digest });
    book.sealedCount = book.entries.length;
    sealed = true;
  }
  const last = book.snapshots[book.snapshots.length - 1];
  if (book.entries.length - last.atEvent >= snapshotEveryEvents) {
    book.snapshots.push(takeSnapshot(book.compiled, typeof doc === 'function' ? doc() : doc, book.entries.length));
    while (book.snapshots.length > keepSnapshots) book.snapshots.shift();
    snapshot = true;
  }
  return { sealed, snapshot };
}

// ---------- 写盘（R27-4.7、R27-4.8） ----------

/**
 * 原子写一个文件：先写临时文件并落盘，再改名覆盖（体检 K2-01 搬旧 atomicJSON；临时名确定，不用随机标识，R27-4.10）。
 * @param {string} file @param {string} text
 */
function atomicWriteText(file, text) {
  const tmp = file + LAYOUT_NAMES.tmpExt;
  const fd = openSync(tmp, 'w');
  try {
    writeSync(fd, text);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, file);
}

/**
 * 原子写 JSON（规范序列化，同值同字节）。
 * @param {string} file @param {unknown} value
 */
export function atomicJSON(file, value) {
  atomicWriteText(file, canonical(value));
}

/** 槽位编号合法：整数且在 [0, saveSlotCount)。 @param {unknown} slot @param {SaveLayout} layout */
export function slotOk(slot, layout) {
  return Number.isInteger(slot) && slot >= 0 && slot < layout.saveSlotCount;
}

/** 槽位目录。 @param {string} root @param {number} slot */
export function slotDir(root, slot) {
  return join(root, LAYOUT_NAMES.slotPrefix + slot);
}

/** 分片文件路径。 @param {string} dir @param {string} digest */
export function shardPath(dir, digest) {
  return join(dir, LAYOUT_NAMES.shardsDir, digest + LAYOUT_NAMES.shardExt);
}

/**
 * 存档写盘（菜单"存档"动作经 menu-entry 在 kernel 组内调用，卷二 :940 第 1 条）。
 * 存下：保留的各快照的分片、已封的日志段、尚未封段的日志尾（作一段写，下次存档封段后不再引用）、清单。
 * 写时复制：分片文件以内容摘要为名，已有即不写。先写齐分片，再把当前清单改名为上一个清单，最后原子改名提交新清单；
 * 中断在任一步，读档得到新清单或上一个清单的完整状态（A27-4.4）。提交后回收两份清单都不引用的分片文件（R27-4.9）。
 * 结果：成功 {ok: true, written, manifest}；槽位越界 E-SAVE-SLOT-INVALID；写盘失败 E-SAVE-WRITE-FAIL。
 * @param {{root: string, slot: number, book: LogBook, doc: {doc_data: any, doc_state: any, doc_holdings: any, doc_ledger: any}, rulesDigest: string, clockMinute: number}} args
 * @returns {{ok: true, written: number, manifest: Record<string, any>} | {ok: false, code: import('./types.d.ts').ErrorCode}}
 */
export function saveToSlot({ root, slot, book, doc, rulesDigest, clockMinute }) {
  if (!slotOk(slot, book.layout)) return { ok: false, code: new KernelError('E-SAVE-SLOT-INVALID').code };
  if (!isHex64(rulesDigest)) throw new Error('saveToSlot: rulesDigest must be a 64-hex digest');
  if (!Number.isInteger(clockMinute)) throw new Error('saveToSlot: clockMinute must be an integer');
  const full = { doc_data: doc.doc_data, doc_state: doc.doc_state, doc_holdings: doc.doc_holdings, doc_ledger: doc.doc_ledger, doc_log: book.entries };
  /** @type {Map<string, string>} */
  const files = new Map();
  for (const s of book.snapshots) for (const f of s.files) files.set(f.digest, f.text);
  // logSegments 每项 {count, digest, sealed}：sealed 为假的是存档时尚未封段的日志尾（至多一项、在末尾）。
  const logSegments = book.segments.map((s) => ({ count: s.count, digest: s.digest, sealed: true }));
  for (const s of book.segments) files.set(s.digest, s.text);
  const tail = book.entries.slice(book.sealedCount);
  if (tail.length) {
    const f = fileOf(tail);
    files.set(f.digest, f.text);
    logSegments.push({ count: tail.length, digest: f.digest, sealed: false });
  }
  const manifest = {
    clockMinute,
    dataDigest: dataDigestOf(doc.doc_data),
    logSegments,
    rulesDigest,
    saveDigest: saveDigest(full),
    shardDigests: [...files.keys()].sort(),
    slot,
    snapshotIndex: book.snapshots.map((s) => ({ atEvent: s.atEvent, shards: s.shards })),
  };
  const done = commitSlot(root, slot, files, manifest);
  return done.ok ? { ok: true, written: done.written, manifest } : done;
}

/**
 * 写分片、轮换清单、原子提交新清单、回收（本机存档与导入共用这一条写盘路径，卷二 :968"没有第二条读档路径"；R27-4.7–4.9）。
 * @param {string} root @param {number} slot @param {Map<string, string>} files 摘要 → 分片文本 @param {Record<string, any>} manifest
 * @returns {{ok: true, written: number} | {ok: false, code: import('./types.d.ts').ErrorCode}}
 */
export function commitSlot(root, slot, files, manifest) {
  const dir = slotDir(root, slot);
  let written = 0;
  try {
    mkdirSync(join(dir, LAYOUT_NAMES.shardsDir), { recursive: true });
    for (const [digest, text] of files) {
      const p = shardPath(dir, digest);
      if (existsSync(p)) continue;
      atomicWriteText(p, text);
      written++;
    }
    const cur = join(dir, LAYOUT_NAMES.current);
    // 当前清单完好才改名为上一个清单；残缺的不改名，保留原来那份完好的上一个清单（R27-4.8、A27-4.4）。
    if (existsSync(cur) && checkManifest(dir, LAYOUT_NAMES.current).state === MANIFEST_STATE.ok) renameSync(cur, join(dir, LAYOUT_NAMES.previous));
    atomicJSON(cur, manifest);
  } catch (e) {
    if (codeOf(e) !== null) throw e;
    return { ok: false, code: new KernelError('E-SAVE-WRITE-FAIL').code };
  }
  // 提交之后才回收；回收出错不改"已存好"的结果，错误原样抛出（不是存档失败，不吞）。
  reclaim(dir, manifest.shardDigests);
  return { ok: true, written };
}

// 回收当前清单与上一个清单都不引用的分片文件（R27-4.9"不被任何保留清单引用的分片文件才可回收"）。
function reclaim(dir, currentDigests) {
  const keep = new Set(currentDigests.map((d) => d + LAYOUT_NAMES.shardExt));
  for (const d of readManifestDigests(join(dir, LAYOUT_NAMES.previous))) keep.add(d + LAYOUT_NAMES.shardExt);
  const sdir = join(dir, LAYOUT_NAMES.shardsDir);
  for (const name of readdirSync(sdir)) if (!keep.has(name)) unlinkSync(join(sdir, name));
}

// ---------- 存档动作与路由（卷二 §2.9 第 0 条"存档四路" :940–944、通路第 1、2c、2d、5s 环；体检 K6-84） ----------
// 存档与读档是 menu 路由上的动作（第 1 条）：本文件的 saveAction、kernel/load/save.mjs 的 loadAction 只返回 ReplyResult（代号结构），
// 交给 menu-entry 的处理函数经第 2a 环回去；动作代号与槽位编号的线上载荷（schema:wire-up-menu-v1、动作行）未建，分流随 6-14、6-16、6-21。
// 导出（第 4 条）：入口在本文件，成功时直接经 ReplyCap.send 发存档字节（第 5s 环，wire_body = bytes），不调 postReply；失败调一次 postReply（第 2c 环）。
// 导入（第 5 条）：入口在 kernel/load/save.mjs。两条路由都由 mountSaveRoutes 向 RequestCap 登记（第 1 环）。
// 没有存档环境（saveEnv 未交入）时回 save_unavailable，不写盘、不改 state，不假装成功。

const RESULT = T.code_enum.reply_result;
const WIRE_BODY = T.code_enum.wire_body;
const CODE_SLOT = 'E-SAVE-SLOT-INVALID';
const CODE_FORM = 'E-DIM-STRUCT-FIELD';
/** 存档文件（导出的字节、导入的原文）是一个 JSON 对象，只有这两个键：清单与它引用的全部分片（摘要 → 分片文本）。 */
export const BUNDLE = Object.freeze({ manifest: 'manifest', shards: 'shards' });

const rejected = (code) => ({ resultCode: RESULT.rejected, rejectCode: code });

/**
 * 菜单"存档"动作（卷二 :940 第 1 条）：把当前游戏存进槽位。成功 ok；没有进行中的游戏 save_unavailable；槽位越界 rejected + E-SAVE-SLOT-INVALID；
 * 写盘失败 rejected + E-SAVE-WRITE-FAIL（先 report）。清单只带 clockMinute 与槽位编号两样显示字段（第 3 条），不记墙钟。
 * @param {unknown} slot 槽位编号（未核对的数值）
 * @returns {{resultCode: string, rejectCode?: string}}
 */
export function saveAction(slot) {
  const env = saveEnv();
  const game = currentGame();
  if (env === null || game === null) return { resultCode: RESULT.save_unavailable };
  if (!slotOk(slot, env.layout)) return rejected(CODE_SLOT);
  const doc = docOfState(game.book.compiled, game.state, game.data);
  const r = saveToSlot({ root: env.root, slot, book: game.book, doc, rulesDigest: env.rulesDigest, clockMinute: game.clockMinute(game.state) });
  if (r.ok) return { resultCode: RESULT.ok };
  report(r.code, { slot });
  return rejected(r.code);
}

// 槽位里最近的完好清单连同它引用的全部分片，写成存档文件的文本。当前清单完好用当前的；否则用完好的上一个（提交改名之间中断的槽位只剩它）。
function bundleOfSlot(root, slot) {
  const dir = slotDir(root, slot);
  const cur = checkManifest(dir, LAYOUT_NAMES.current);
  const prev = checkManifest(dir, LAYOUT_NAMES.previous);
  const chosen = cur.state === MANIFEST_STATE.ok ? cur : prev.state === MANIFEST_STATE.ok ? prev : null;
  if (chosen === null) {
    const empty = cur.state === MANIFEST_STATE.missing && prev.state === MANIFEST_STATE.missing;
    return { ok: false, code: new KernelError(empty ? 'E-SAVE-EMPTY' : 'E-SAVE-TORN').code };
  }
  /** @type {Record<string, string>} */
  const shards = {};
  for (const [digest, text] of chosen.texts) shards[digest] = text;
  return { ok: true, text: canonical({ [BUNDLE.manifest]: chosen.manifest, [BUNDLE.shards]: shards }) };
}

/**
 * `save_export` 路由的入口（卷二 :966 第 4 条；第 1、2c、5s 环）。请求体当 unknown，只读 `slot`（头部显示字段由 router-caps 带走，不在这里读）；
 * 每条返回路径恰好用这个句柄一次：成功经 replyCap.send 发存档字节、不调 postReply；失败调 postReply 交带拒收代号的结果。
 * @param {unknown} body @param {object} handle ReplyHandle @param {{send: (handle: object, body: string, wireBody: string) => void}} replyCap
 * @returns {Promise<void>}
 */
export async function exportEntry(body, handle, replyCap) {
  if (!isObj(body) || !Object.hasOwn(body, 'slot')) { postReply(handle, rejected(CODE_FORM)); return; }
  const env = saveEnv();
  if (env === null) { postReply(handle, { resultCode: RESULT.save_unavailable }); return; }
  if (!slotOk(body.slot, env.layout)) { postReply(handle, rejected(CODE_SLOT)); return; }
  const out = bundleOfSlot(env.root, body.slot);
  if (!out.ok) { postReply(handle, rejected(out.code)); return; }
  replyCap.send(handle, out.text, WIRE_BODY.bytes);
}

/**
 * kernelApi `mountSaveRoutes(caps)`（只对 index.mjs 开放；卷二 :974 清单第六个，挂 `save_export` 与 `save_import` 两条路由）。
 * @param {{requestCap: {register: (route: string, entry: (body: unknown, handle: object) => unknown) => void}, replyCap: {send: (handle: object, body: string, wireBody: string) => void}}} caps createRouterCaps 的返回值
 * @returns {void}
 */
export function mountSaveRoutes(caps) {
  caps.requestCap.register(T.code_enum.wire_route.save_export, (body, handle) => exportEntry(body, handle, caps.replyCap));
  caps.requestCap.register(T.code_enum.wire_route.save_import, importEntry);
}
