// 存档读侧、导入与读档复演（S1-1 卡 B2；S1-3b 加导入 importSlot/importEntry，卷二 :1016；卷二十七 R27-4.3 :544、R27-4.8 :558、R27-7.2 :740、R27-7.3 :742；卷二 :545）。
// 读档：当前清单坏了（片缺失或摘要不符 E-SAVE-SHARD-DIGEST）回退上一份并报 E-SAVE-TORN；两份都没有即 E-SAVE-EMPTY；
// 两个指纹任一不等即 E-SAVE-RULES-MISMATCH，不改不删存档文件。复演：从最近快照出发只重放玩家指令与推进请求，
// 重跑产生的每条条目与原日志同位逐条比 canonical，首处不同即 E-REPLAY-DIVERGE。

import { existsSync, readFileSync } from 'node:fs';
import { KernelError, reportError, codeOf } from '../errors.mjs';
import { base64ToBytes, clone, utf8Length, utf8ToText } from '../bytes.mjs';
import { T } from '../handles.mjs';
import { canonical } from '../storage.mjs';
import { createLogBook, appendEntry, saveDigest, docOf, checkSlot, slotPaths, commitSlot, shardDigestsOf } from '../save.mjs';
import { processInput } from '../transaction.mjs';

const UTF8 = 'utf8';

/**
 * 核一份清单与它引用的每一片（按内容摘要寻址）：清单文本与片文本都经 read 取（磁盘或导入包，同一套校验，卷二 :1016）；不完好返回 null。
 * @param {any} engine @param {() => string} readManifestText @param {(digest: string) => string} readShard
 */
function verifyManifest(engine, readManifestText, readShard) {
  try {
    const manifest = JSON.parse(readManifestText());
    /** @param {string} digest */
    const part = (digest) => {
      const text = readShard(digest);
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

/** 磁盘上的一份清单（readSlot 用）。 @param {any} engine @param {any} paths @param {URL} file */
function readManifest(engine, paths, file) {
  return verifyManifest(engine, () => readFileSync(file, UTF8), (digest) => readFileSync(paths.shard(digest), UTF8));
}

/** 规则指纹比较（卷二十七 R27-4.3 :544）：两个指纹任一不等即 E-SAVE-RULES-MISMATCH。读档与导入共用。 @param {any} engine @param {any} manifest */
function checkFingerprints(engine, manifest) {
  if (manifest.engineRulesDigest !== engine.engineRulesDigest || manifest.dataPacksDigest !== engine.dataPacksDigest) {
    throw new KernelError('E-SAVE-RULES-MISMATCH', {}, 'save fingerprints differ from the running rules and data');
  }
}

/**
 * 读档 readSlot（不复演；index.mjs 的 loadSlot 与菜单读档 menu-entry 调它）：返回 {slot, manifest, snapshot, book, docData}。snapshot 取清单里最近的一个快照。
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
  checkFingerprints(engine, manifest);
  const book = createLogBook();
  for (const e of parts.doc_log) appendEntry(book, e);
  book.snapshots.push(...snapshots);
  return { slot: n, manifest, snapshot: snapshots[snapshots.length - 1], book, docData: parts.doc_data };
}

/**
 * 导入 importSlot（卷二 :1016 存档四路第 5 点）：请求体原文先核长度（UTF-8 字节数超 rules.host.saveImportMaxBytes 即 E-SAVE-IMPORT-SIZE），
 * 再按 schema:wire-up-import-v1 收窄（narrow 由 requestCap 交入）、核槽位（E-SAVE-SLOT-INVALID）；bytes 经 base64 与 UTF-8 严格解码成导出包
 * （格式见 kernel/save.mjs#exportSlot），format 不符或解不开按片摘要不符论（E-SAVE-SHARD-DIGEST）；清单与各片走 readSlot 同一个 verifyManifest，
 * 再比规则指纹（checkFingerprints）。全部通过才经 commitSlot 写进目标槽位（清单的 slot 改为目标槽位），不改 state；返回写入的清单。
 * @param {any} engine @param {(wire: any, name: string, raw: unknown) => any} narrow @param {unknown} raw
 */
function importSlot(engine, narrow, raw) {
  if (typeof raw !== 'string' || utf8Length(raw) > engine.host.saveImportMaxBytes) throw new KernelError('E-SAVE-IMPORT-SIZE', {}, 'import body exceeds saveImportMaxBytes');
  const body = narrow(engine.docData.wire, 'wire-up-import-v1', raw);
  const n = checkSlot(engine, body.slot);
  const corrupt = () => new KernelError('E-SAVE-SHARD-DIGEST', {}, 'import bytes are not an intact save package');
  const bytes = base64ToBytes(body.bytes);
  const text = bytes === null ? null : utf8ToText(bytes);
  if (text === null) throw corrupt();
  let pkg;
  try { pkg = JSON.parse(text); } catch { throw corrupt(); }
  if (pkg === null || typeof pkg !== 'object' || pkg.format !== engine.docData.wire.exportFormat || pkg.shards === null || typeof pkg.shards !== 'object') throw corrupt();
  /** @param {string} digest */
  const shard = (digest) => {
    if (!Object.hasOwn(pkg.shards, digest) || typeof pkg.shards[digest] !== 'string') throw corrupt();
    return pkg.shards[digest];
  };
  const got = verifyManifest(engine, () => canonical(pkg.manifest), shard);
  if (got === null) throw corrupt();
  checkFingerprints(engine, got.manifest);
  const manifest = { ...got.manifest, slot: n };
  commitSlot(engine, n, new Map(shardDigestsOf(manifest).map((d) => [d, shard(d)])), manifest);
  return manifest;
}

/**
 * save_import 路由的入口处理函数（卷二 :998 第 1 环、:1002 第 2d 环）：importSlot 成功回 ok 带 {slot, clockMinute}（卷二 :1014 存档清单只此两项），
 * 带登记码的失败回 rejected 加拒收代号；每条路径恰调一次 postReply。无登记码的错误原样上抛，由 router-caps 回 error。
 * @param {any} engine @param {{narrow: (wire: any, name: string, raw: unknown) => any}} requestCap @param {{postReply: Function}} replyCap
 * @param {unknown} raw @param {object} reply
 */
export function importEntry(engine, requestCap, replyCap, raw, reply) {
  const R = T.code_enum.reply_result;
  /** @type {Record<string, unknown>} */
  let result;
  try {
    const m = importSlot(engine, requestCap.narrow, raw);
    result = { result: R.ok, save: { slot: m.slot, clockMinute: m.clockMinute } };
  } catch (e) {
    const code = codeOf(e);
    if (code === null) throw e;
    result = { result: R.rejected, code };
  }
  replyCap.postReply(reply, result);
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
