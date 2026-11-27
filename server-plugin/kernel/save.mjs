// 存档写侧与公共序列化（S1-1 卡 B2；卷二十七 R27-4.1–4.11 :542–:563、R27-7.3 :742；卷二 :1012、:1212）。
// 日志簿（logBook）即卷二十七的事件日志 `doc_log`：与 state 并列、只追加，不随事务回滚（卷二十七 :742 条目先单独提交）。
// 序列化只有 storage.mjs 的 canonical 一种（:545；卷一:643 指 storage）；摘要只经注入的 engine.digestCap.sha256Hex（卷二 :1054，kernel 不 import node:crypto）。
// 布局名、分片方式、快照间隔与保留数都读 engine.saveLayout（rules.saveLayout），槽位数读 engine.host.saveSlotCount（rules.host）。
// 不读墙钟（:562）；不放模块级状态，日志簿与 state 一律显式传参。

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { clone } from './bytes.mjs';
import { KernelError, codeOf } from './errors.mjs';
import { GRAMMAR_TOKENS, T } from './handles.mjs';
import { importEntry } from './load/save.mjs';
import { canonical, readPath } from './storage.mjs';

const UTF8 = 'utf8';

/** @typedef {{entries: any[], snapshots: Array<{atEntry: number, state: any}>}} LogBook */

/** 新建空日志簿（doc_log）。 @returns {LogBook} */
export function createLogBook() {
  return { entries: [], snapshots: [] };
}

/** @param {any} v @returns {any} */
function freezeDeep(v) {
  if (v !== null && typeof v === 'object') { for (const k of Object.keys(v)) freezeDeep(v[k]); Object.freeze(v); }
  return v;
}

/** 只追加一条（深拷贝后冻结）；无删改接口（卷二十七 :551）。 @param {LogBook} book @param {Record<string, any>} entry @returns {void} */
export function appendEntry(book, entry) {
  book.entries.push(freezeDeep(clone(entry)));
}

/** 下一个请求编号 = 最后一条条目的编号 + 1（从日志派生，不另存计数器）；空簿从 1 起。 @param {LogBook} book @returns {number} */
export function nextRequestSeq(book) {
  const n = book.entries.length;
  return n === 0 ? 1 : book.entries[n - 1].seq + 1;
}

/**
 * 一笔请求处理完（刻边界）时调（卷二十七 :551 快照只在刻边界）：还没有快照、或距上个快照的条目数达 snapshotEveryEvents 即拍一个
 * {atEntry, state}；只留最近 keepSnapshots 个。
 * @param {any} engine @param {any} state @param {LogBook} book @returns {void}
 */
export function tickEnd(engine, state, book) {
  const { snapshotEveryEvents, keepSnapshots } = engine.saveLayout;
  const shots = book.snapshots;
  const last = shots.length === 0 ? null : shots[shots.length - 1];
  if (last !== null && book.entries.length - last.atEntry < snapshotEveryEvents) return;
  shots.push({ atEntry: book.entries.length, state: clone(state) });
  while (shots.length > keepSnapshots) shots.shift();
}

/**
 * 组装逻辑文档五部分（卷二十七 :542；持有与账本尚无，留空对象）。分片表覆盖的核对在装配期（rules/load/mount.mjs）。
 * @param {any} engine @param {any} state @param {LogBook} book @returns {Record<string, any>}
 */
export function docOf(engine, state, book) {
  return { doc_data: engine.docData, doc_state: state, doc_holdings: {}, doc_ledger: {}, doc_log: book.entries };
}

/** 按排除表剔除子树（卷二 :1212；模式按 `.` 分段、`*` 恰配一段）：返回新对象，不改原值。 @param {any} v @param {string[][]} pats @returns {any} */
function prune(v, pats) {
  if (v === null || typeof v !== 'object' || Array.isArray(v) || pats.length === 0) return v;
  /** @type {Record<string, any>} */
  const out = {};
  for (const k of Object.keys(v)) {
    const here = pats.filter((p) => p[0] === GRAMMAR_TOKENS.wildcard || p[0] === k);
    if (here.some((p) => p.length === 1)) continue;
    out[k] = prune(v[k], here.map((p) => p.slice(1)));
  }
  return out;
}

/** @param {any} engine @param {unknown} value @returns {string} */
const sha = (engine, value) => engine.digestCap.sha256Hex(canonical(value), UTF8);

/**
 * 存档摘要（卷二十七 :542 只此一种）：对逻辑文档（doc_state 剔除排除表后）取 canonical 的 sha256。
 * @param {any} engine @param {Record<string, any>} doc @returns {string}
 */
export function saveDigest(engine, doc) {
  const pats = engine.digestExclude.map((/** @type {string} */ p) => p.split(GRAMMAR_TOKENS.pathSep));
  return sha(engine, { ...doc, doc_state: prune(doc.doc_state, pats) });
}

/** 世界数据副本摘要（卷二十七 :543 的 dataDigest，清单字段 dataPacksDigest）。 @param {any} engine @param {any} docData @returns {string} */
export function dataPacksDigestOf(engine, docData) {
  return sha(engine, docData);
}

/** 源码清单摘要（清单字段 engineRulesDigest；卷二十七 :544）。 @param {any} engine @param {Array<{path: string, text: string}>} sources @returns {string} */
export function engineRulesDigestOf(engine, sources) {
  return sha(engine, sources);
}

/** 槽位核对（卷二十七 :562：取值 [0, saveSlotCount)）。 @param {any} engine @param {unknown} slot @returns {number} */
export function checkSlot(engine, slot) {
  if (!Number.isInteger(slot) || /** @type {number} */ (slot) < 0 || /** @type {number} */ (slot) >= engine.host.saveSlotCount) {
    throw new KernelError('E-SAVE-SLOT-INVALID', {}, 'slot must be an integer in [0, saveSlotCount)');
  }
  return /** @type {number} */ (slot);
}

/** 槽位的目录与文件 URL（名字全读 rules.saveLayout.files）。 @param {any} engine @param {number} slot */
export function slotPaths(engine, slot) {
  const f = engine.saveLayout.files;
  const dir = new URL(`${f.slotDirPrefix}${slot}/`, engine.saveRoot);
  const shardDir = new URL(`${f.shardDir}/`, dir);
  return {
    dir, shardDir,
    current: new URL(f.manifest, dir), prev: new URL(f.prevManifest, dir), tmp: new URL(`${f.manifest}${f.tmpSuffix}`, dir),
    shard: (/** @type {string} */ digest) => new URL(`${digest}${f.shardExt}`, shardDir),
  };
}

/**
 * 把一份清单及其各片提交进槽位（卷二十七 :558）：写各片（按内容摘要寻址，已存在即不重写）→ 写临时清单 → 旧清单改名为上一份 → 原子改名提交。
 * writeSlot 与导入 importSlot 共用这一条写盘流程。写盘失败 E-SAVE-WRITE-FAIL。
 * @param {any} engine @param {number} n 已核过的槽位 @param {Map<string, string>} texts 片摘要 → 片文本 @param {Record<string, any>} manifest
 */
export function commitSlot(engine, n, texts, manifest) {
  const paths = slotPaths(engine, n);
  const fail = () => new KernelError('E-SAVE-WRITE-FAIL', {}, 'save write failed');
  try { mkdirSync(paths.shardDir, { recursive: true }); } catch { throw fail(); }
  for (const [digest, text] of texts) {
    const file = paths.shard(digest);
    if (existsSync(file)) continue;
    const tmp = new URL(`${file.href}${engine.saveLayout.files.tmpSuffix}`);
    try { writeFileSync(tmp, text, UTF8); renameSync(tmp, file); } catch { throw fail(); }
  }
  try {
    writeFileSync(paths.tmp, canonical(manifest), UTF8);
    if (existsSync(paths.current)) renameSync(paths.current, paths.prev);
    renameSync(paths.tmp, paths.current);
  } catch { throw fail(); }
}

/**
 * 存槽 writeSlot（index.mjs 的公共入口 saveSlot 与菜单存档 menu-entry 经 world.save 调它；卷二十七 :556–:558、:562）：各片按内容摘要寻址，经 commitSlot 落盘。
 * 清单只含 slot、clockMinute、两个指纹、快照索引、片摘要、日志段、存档摘要，不含任何墙钟。写盘失败 E-SAVE-WRITE-FAIL。
 * @param {any} engine @param {{state: any, logBook: LogBook}} world @param {number} slot @returns {{slot: number} & Record<string, any>} 清单
 */
export function writeSlot(engine, world, slot) {
  const n = checkSlot(engine, slot);
  const doc = docOf(engine, world.state, world.logBook);
  /** @type {Map<string, string>} */
  const texts = new Map();
  const put = (/** @type {unknown} */ content) => {
    const text = canonical(content);
    const digest = engine.digestCap.sha256Hex(text, UTF8);
    texts.set(digest, text);
    return digest;
  };
  /** @type {Record<string, string>} */
  const shardDigests = {};
  for (const part of Object.keys(doc)) shardDigests[part] = put(doc[part]);
  const manifest = {
    slot: n,
    clockMinute: readPath(world.state, engine.P.clock_minute()),
    engineRulesDigest: engine.engineRulesDigest,
    dataPacksDigest: engine.dataPacksDigest,
    snapshotIndex: world.logBook.snapshots.map((s) => ({ atEntry: s.atEntry, state: put(s.state) })),
    shardDigests,
    // 不封段（segmentEvents 本卡只核取值域）：日志整份一片在 shardDigests.doc_log，已封的段为空。
    logSegments: [],
    saveDigest: saveDigest(engine, doc),
  };
  commitSlot(engine, n, texts, manifest);
  return manifest;
}

/** 清单引用的全部片摘要（各部分与各快照）。 @param {any} manifest @returns {string[]} */
export function shardDigestsOf(manifest) {
  return [...Object.values(manifest.shardDigests), ...manifest.snapshotIndex.map((/** @type {any} */ s) => s.state)];
}

/**
 * 导出 exportSlot（卷二 :1015；格式按主会话裁定 Q5）：取槽位里完好的清单（当前一份坏了退上一份，同 readSlot 的回退）及它引用的各片原文，
 * 打成 canonical({format, manifest, shards:{摘要: 片文本}})，其 UTF-8 即存档字节。format 读 world/schema/wire-v1.json 的 exportFormat。
 * 只核片摘要、不比规则指纹（导出是原样收发，卷二十七 :563）。槽位越界 E-SAVE-SLOT-INVALID；两份清单都没有 E-SAVE-EMPTY；都不完好 E-SAVE-SHARD-DIGEST。
 * @param {any} engine @param {unknown} slot @returns {string}
 */
function exportSlot(engine, slot) {
  const paths = slotPaths(engine, checkSlot(engine, slot));
  const files = [paths.current, paths.prev].filter((f) => existsSync(f));
  if (files.length === 0) throw new KernelError('E-SAVE-EMPTY', {}, 'slot has no manifest');
  for (const file of files) {
    try {
      const manifest = JSON.parse(readFileSync(file, UTF8));
      /** @type {Record<string, string>} */
      const shards = {};
      for (const digest of shardDigestsOf(manifest)) {
        const text = readFileSync(paths.shard(digest), UTF8);
        if (engine.digestCap.sha256Hex(text, UTF8) !== digest) throw new KernelError('E-SAVE-SHARD-DIGEST');
        shards[digest] = text;
      }
      return canonical({ format: engine.docData.wire.exportFormat, manifest, shards });
    } catch { /* 这一份不完好，试上一份 */ }
  }
  throw new KernelError('E-SAVE-SHARD-DIGEST', {}, 'no intact manifest in slot');
}

/**
 * mountSaveRoutes（卷二 :1033、:1015–:1016；kernelApi 只对 index.mjs 开放）：在 requestCap 上挂 save_export 与 save_import 两路。
 * save_export：收窄 schema:wire-up-save-v1 → exportSlot → 成功经 replyCap.send 发字节（wire_body=bytes，第 5s 环），失败经 postReply 交拒收代号（第 2c 环）。
 * save_import：入口在 kernel/load/save.mjs#importEntry（第 2d 环）。两路都只用本局 engine（指纹与槽位目录），不改 state。
 * @param {{on: Function, narrow: (wire: any, name: string, raw: unknown) => any}} requestCap @param {{send: Function, postReply: Function}} replyCap @param {{engine: any}} world
 */
export function mountSaveRoutes(requestCap, replyCap, world) {
  const { engine } = world;
  const route = T.code_enum.wire_route;
  requestCap.on(route.save_export, (/** @type {unknown} */ raw, /** @type {object} */ reply) => {
    /** @type {string} */
    let bytes;
    try {
      bytes = exportSlot(engine, requestCap.narrow(engine.docData.wire, 'wire-up-save-v1', raw).slot);
    } catch (e) {
      const code = codeOf(e);
      if (code === null) throw e;
      replyCap.postReply(reply, { result: T.code_enum.reply_result.rejected, code });
      return;
    }
    replyCap.send(reply, bytes, T.code_enum.wire_body.bytes);
  });
  requestCap.on(route.save_import, (/** @type {unknown} */ raw, /** @type {object} */ reply) => importEntry(engine, requestCap, replyCap, raw, reply));
}
