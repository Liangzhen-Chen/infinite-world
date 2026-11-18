// 存档读档入口（卷二 §2.9 第 0 条"存档四路" :940–944、登记入口表 kernel/load/save.mjs；§2.9 第 3 条 Sealed 读回重算 :1128；
// 卷二十七 R27-4.3、R27-4.8、R27-7.5、A27-4.4、A27-4.6）。JSON 文本解析只在 kernel/load/*（§2.8 表 kernel 行 :844）。
// 读档只读不写：任何失败都不改、不删存档目录下的文件（A27-4.6）。
// 规则指纹：读档入口对 rulesDigest 只做一次相等比较，不等即 E-SAVE-RULES-MISMATCH 拒读，不迁移、不修补（R27-4.3、R27-7.5；体检 K2-21）。
// 清单引用的分片缺失或摘要不符：报 E-SAVE-SHARD-DIGEST，回退到上一个完好清单并报 E-SAVE-TORN（R27-4.8）；两份都不完好即 E-SAVE-TORN 拒读。
// 恢复 = 最近一个完好快照 + 其后日志里的请求重跑（R27-4.5）；重跑是块 4 的复演，本文件交回快照与其后的日志条目，不重跑。
// 摘要排除表：读入库生成文件，与按声明表生成的结果逐值比对，不一致 E-DIGEST-EXCLUDE-DRIFT（卷二十七 R27-5.8；卷二 :826）。

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseJsonStrict } from './json-text.mjs';
import {
  LAYOUT_NAMES, MANIFEST_FIELDS, slotOk, slotDir, shardPath, sha256Text, sha256Base64, walkPathTree, bookFrom, compileLayout,
  digestExcludeDoc, installDigestExclude, isSealedStoreForm,
} from '../save.mjs';
import { canonicalEqual } from '../storage.mjs';
import { KernelError, codeOf } from '../errors.mjs';
import { report } from '../report.mjs';

/** 入库的摘要排除表（生成文件，取代旧的手写表；卷一 §8.3 :643 的文件名不变）。 */
export const DIGEST_EXCLUDE_FILE = 'world/rules/tables/digest-exclude.json';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const HEX64 = /^[0-9a-f]{64}$/;

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
  return isObj(m) && Array.isArray(m.shardDigests) ? m.shardDigests.filter((d) => typeof d === 'string' && HEX64.test(d)) : [];
}

function manifestShapeOk(m) {
  if (!isObj(m)) return false;
  const keys = Object.keys(m).sort();
  if (keys.length !== MANIFEST_FIELDS.length || keys.some((k, i) => k !== MANIFEST_FIELDS[i])) return false;
  return Array.isArray(m.shardDigests) && m.shardDigests.every((d) => typeof d === 'string' && HEX64.test(d))
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
    if (!row || typeof ref !== 'string') throw new KernelError('E-SAVE-SHARD-UNCOVERED', {}, `snapshot shard ${code} has no row in the layout`);
    const content = parseShard(texts, ref);
    if (row.part === 'doc_data') { Object.assign(doc.doc_data.base, content); continue; }
    walkPathTree(content, (segs, v, rec) => setIn(doc[row.part], segs, rec.sealed ? decodeSealedValue(v) : v));
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
 * 成功：{ok: true, doc（快照处四个部分 + 全部日志）, atEvent（快照所在的事件序号）, logTail（其后待重跑的条目）, clockMinute, book, fellBack}。
 * 失败：{ok: false, code}，code ∈ E-SAVE-SLOT-INVALID、E-SAVE-TORN、E-SAVE-RULES-MISMATCH、E-SEAL-DIGEST、E-SAVE-SHARD-DIGEST 等。
 * @param {{root: string, slot: number, layout: import('../save.mjs').SaveLayout, rulesDigest: string}} args
 * @returns {{ok: true, doc: any, atEvent: number, logTail: any[], clockMinute: number, book: import('../save.mjs').LogBook, fellBack: boolean} | {ok: false, code: import('../types.d.ts').ErrorCode}}
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
      return { stop: { ok: true, doc: out.doc, atEvent: out.atEvent, logTail: out.logTail, clockMinute: m.clockMinute, book: out.book, fellBack: false } };
    } catch (e) {
      const code = codeOf(e);
      if (code === null) throw e;
      // Sealed 字节与摘要不符是闭集里的拒读码（:1128），原样交回；其余拼回失败走回退。
      if (code === 'E-SEAL-DIGEST') return { stop: { ok: false, code } };
      return { stop: null };
    }
  };
  const cur = checkManifest(dir, LAYOUT_NAMES.current);
  let wasCommitted = cur.state !== 'missing';
  if (cur.state === 'ok') {
    const r = tryManifest(cur);
    if (r.stop) return r.stop;
  } else if (cur.state === 'torn') report(new KernelError('E-SAVE-SHARD-DIGEST').code, fields);
  const prev = checkManifest(dir, LAYOUT_NAMES.previous);
  if (prev.state !== 'ok') return { ok: false, code: tornCode };
  const r = tryManifest(prev);
  if (!r.stop) return { ok: false, code: tornCode };
  // 当前清单坏了才算残缺回退；当前清单不存在（提交改名之间中断）时上一个清单就是最近完好的清单。
  if (wasCommitted) { report(tornCode, fields); if (r.stop.ok) r.stop.fellBack = true; }
  return r.stop;
}

/**
 * 启动时自动读档（卷二 :942 第 2 条）：没有请求也就没有回应句柄，失败时先 report(code, {slot})，交回失败结果；
 * 调用方据此记下"存档不可用"（reply_result 的 save_unavailable），第一次菜单响应带上它。
 * @param {{root: string, slot: number, layout: import('../save.mjs').SaveLayout, rulesDigest: string}} args
 */
export function autoLoadSlot(args) {
  const r = loadSlot(args);
  if (!r.ok) report(r.code, { slot: Number.isInteger(args.slot) ? args.slot : null });
  return r;
}
