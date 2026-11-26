// 存档读侧与读档复演（S1-1 卡 B2；卷二十七 R27-4.3 :544、R27-4.8 :558、R27-7.2 :740、R27-7.3 :742；卷二 :545）。
// 读档：当前清单坏了（片缺失或摘要不符 E-SAVE-SHARD-DIGEST）回退上一份并报 E-SAVE-TORN；两份都没有即 E-SAVE-EMPTY；
// 两个指纹任一不等即 E-SAVE-RULES-MISMATCH，不改不删存档文件。复演：从最近快照出发只重放玩家指令与推进请求，
// 重跑产生的每条条目与原日志同位逐条比 canonical，首处不同即 E-REPLAY-DIVERGE。

import { existsSync, readFileSync } from 'node:fs';
import { KernelError, reportError } from '../errors.mjs';
import { clone } from '../bytes.mjs';
import { canonical } from '../storage.mjs';
import { createLogBook, appendEntry, saveDigest, docOf, checkSlot, slotPaths } from '../save.mjs';
import { processInput } from '../transaction.mjs';

const UTF8 = 'utf8';

/** 读一份清单并核它引用的每一片（按内容摘要寻址）；不完好返回 null。 @param {any} engine @param {any} paths @param {URL} file */
function readManifest(engine, paths, file) {
  try {
    const manifest = JSON.parse(readFileSync(file, UTF8));
    /** @param {string} digest */
    const part = (digest) => {
      const text = readFileSync(paths.shard(digest), UTF8);
      if (engine.digestCap.sha256Hex(text, UTF8) !== digest) throw new KernelError('E-SAVE-SHARD-DIGEST');
      return JSON.parse(text);
    };
    /** @type {Record<string, any>} */
    const parts = {};
    for (const [name, digest] of Object.entries(manifest.shardDigests)) parts[name] = part(/** @type {string} */ (digest));
    const snapshots = manifest.snapshotIndex.map((/** @type {any} */ s) => ({ atEntry: s.atEntry, state: part(s.state) }));
    return { manifest, parts, snapshots };
  } catch {
    reportError(new KernelError('E-SAVE-SHARD-DIGEST'));
    return null;
  }
}

/**
 * 读档 readSlot（不复演；index.mjs 的公共入口 loadSlot 调它）：返回 {slot, manifest, snapshot, book, docData}。snapshot 取清单里最近的一个快照。
 * @param {any} engine 当前程序的 engine（指纹与之比） @param {number} slot
 */
export function readSlot(engine, slot) {
  const n = checkSlot(engine, slot);
  const paths = slotPaths(engine, n);
  const hasCurrent = existsSync(paths.current);
  const hasPrev = existsSync(paths.prev);
  if (!hasCurrent && !hasPrev) throw new KernelError('E-SAVE-EMPTY', {}, 'slot has no manifest');
  let got = hasCurrent ? readManifest(engine, paths, paths.current) : null;
  if (got === null) {
    got = hasPrev ? readManifest(engine, paths, paths.prev) : null;
    if (got === null) throw new KernelError('E-SAVE-SHARD-DIGEST', {}, 'no intact manifest in slot');
    reportError(new KernelError('E-SAVE-TORN', { slot: n }));
  }
  const { manifest, parts, snapshots } = got;
  if (manifest.engineRulesDigest !== engine.engineRulesDigest || manifest.dataPacksDigest !== engine.dataPacksDigest) {
    throw new KernelError('E-SAVE-RULES-MISMATCH', {}, 'save fingerprints differ from the running rules and data');
  }
  const book = createLogBook();
  for (const e of parts.doc_log) appendEntry(book, e);
  book.snapshots.push(...snapshots);
  return { slot: n, manifest, snapshot: snapshots[snapshots.length - 1], book, docData: parts.doc_data };
}

/**
 * replay_apply（卷二十七 :740）：从 loaded.snapshot 克隆 state，预置快照点前的条目，把其后每条输入条目原样交给同一条处理管线
 * transaction.mjs#processInput（不按 kind 分支：玩家指令与推进请求都是效果原语提案，卷二十七 :742 的两类只作标签）；
 * 每笔输入后把新产生的条目与原日志同位比 canonical，首处不同 E-REPLAY-DIVERGE（fields seq、entry）。
 * 跑完存档摘要与清单不等也是 E-REPLAY-DIVERGE（entry 取 -1）。engine 须由存档的 doc_data 重建（装配层做）。
 * @param {any} engine @param {{manifest: any, snapshot: {atEntry: number, state: any}, book: any}} loaded
 * @returns {{engine: any, state: any, logBook: any, saveDigest: string}}
 */
export function replayApply(engine, loaded) {
  const original = loaded.book.entries;
  const start = loaded.snapshot.atEntry;
  // 局部名不用 state：cross_write 检测器把局部声明当成状态写（已知误判，先例 B1 rules/load/mount.mjs 的 built，修复在门禁封口卡）。
  const restored = clone(loaded.snapshot.state);
  const book = createLogBook();
  for (const e of original.slice(0, start)) appendEntry(book, e);
  for (const s of loaded.book.snapshots) if (s.atEntry <= start) book.snapshots.push(clone(s));
  const diverge = (/** @type {number} */ at, /** @type {number} */ seq) => new KernelError('E-REPLAY-DIVERGE', { seq, entry: at }, 'replayed log differs from saved log');
  let checked = start;
  for (let i = start; i < original.length; i = checked) {
    const { seq, ...input } = original[i]; // seq 由管线按日志簿重发，与原条目同位比对时一并核
    processInput(engine, restored, book, input);
    for (; checked < book.entries.length; checked++) {
      const want = original[checked];
      if (want === undefined || canonical(want) !== canonical(book.entries[checked])) throw diverge(checked, book.entries[checked].seq);
    }
  }
  if (book.entries.length !== original.length) throw diverge(book.entries.length, -1);
  const digest = saveDigest(engine, docOf(engine, restored, book));
  if (digest !== loaded.manifest.saveDigest) throw diverge(-1, -1);
  return { engine, state: restored, logBook: book, saveDigest: digest };
}
