// 登记分片合并（S2-SH 草案 §2；卷二 :57 state-owners 声明表、:512–:513 加载期一次合成并冻结）：纯函数，不读文件。
// 主文件 + 按文件名排序的分片 → 冻结的合并对象。读文件在装配层（index.mjs）与门禁读者（tools/accept/lib/registry-files.mjs），都调这里。
// 换合并规则只改本文件。错误码用已登记的 E-DIM-DUPLICATE-KEY（同一路径两处登记）与 E-DIM-STRUCT-FIELD（分片里出现不许分片的段、文件名不合文法），卷二 :408、:409。
import { KernelError } from '../../kernel/errors.mjs';

// 分片格式定义（草案 §2.1、§2.2；主会话 Q4 甲）：分片目录 = 主文件名去掉 .json 加 .d；分片文件名文法；各登记可分片的顶层段。
const MAIN_EXT_RE = /\.json$/;
const SHARD_DIR_SUFFIX = '.d';
const SHARD_NAME_RE = /^[a-z][a-z0-9-]*\.json$/;
const PATH_SEP = '/';
const OWNERS_SHARDABLE = Object.freeze(['stateKeys', 'systems', 'pathTypes', 'keyKinds', 'rxNamespaces', 'textPaths', 'textWriters', 'kernelApi', 'groupApi']);
const ENTRIES_SECTION = 'entries';
const ENTRIES_SHARDABLE = Object.freeze([ENTRIES_SECTION]);

/** 一份登记文件：仓库相对路径与解析后的内容。 @typedef {{file: string, doc: unknown}} ShardFile */
/** 合并中的路径（对象键或数组下标）。 @typedef {ReadonlyArray<string | number>} KeyPath */

/** 主文件路径 → 分片目录路径（同目录、主文件名去掉 .json 加 .d）。 @param {string} mainFile @returns {string} */
export function shardDirOf(mainFile) {
  return mainFile.replace(MAIN_EXT_RE, SHARD_DIR_SUFFIX);
}

const baseName = (/** @type {string} */ f) => f.split(PATH_SEP).pop() || f;
const cmpUnits = (/** @type {string} */ a, /** @type {string} */ b) => (a < b ? -1 : a > b ? 1 : 0);

/** JSON 值相等（数组按下标、对象按键集合）；只服务数组元素的重复判定。 @param {unknown} a @param {unknown} b @returns {boolean} */
function sameJson(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameJson(x, b[i]));
  if (a !== null && typeof a === 'object' && b !== null && typeof b === 'object') {
    const ea = Object.entries(a);
    const mb = new Map(Object.entries(b));
    return ea.length === mb.size && ea.every(([k, v]) => mb.has(k) && sameJson(v, mb.get(k)));
  }
  return a === b;
}

/** 深冻结（合并结果只读）。 @template T @param {T} v @returns {T} */
function deepFreeze(v) {
  if (v !== null && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}

/**
 * 分片排序与形状核对：文件名须合文法（不合即 E-DIM-STRUCT-FIELD），按文件名 UTF-16 码元升序（与 index.mjs#mjsUnder 同口径）；
 * 分片须为对象、顶层段只许在可分片清单里（不合即 E-DIM-STRUCT-FIELD）。
 * @param {ReadonlyArray<ShardFile>} shards @param {ReadonlyArray<string>} allowed @returns {ShardFile[]}
 */
function orderedShards(shards, allowed) {
  const out = [...shards].sort((a, b) => cmpUnits(baseName(a.file), baseName(b.file)));
  for (const s of out) {
    if (!SHARD_NAME_RE.test(baseName(s.file))) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `registry shard ${s.file}: file name must match ${SHARD_NAME_RE}`);
    if (s.doc === null || typeof s.doc !== 'object' || Array.isArray(s.doc)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `registry shard ${s.file}: must be a JSON object`);
    for (const k of Object.keys(s.doc)) {
      if (!allowed.includes(k)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `registry shard ${s.file}: section ${k} may only appear in the main file`);
    }
  }
  return out;
}

/**
 * 把分片的一个值并进已有值（不改两边，返回新值）：对象逐键递归；数组追加，与已有元素全等即 E-DIM-DUPLICATE-KEY；
 * 其余（两边都是叶子、或一边对象一边非对象）即 E-DIM-DUPLICATE-KEY。新登记的路径记进 origin。
 * @param {unknown} base @param {unknown} add @param {KeyPath} at @param {string} file @param {Map<string, string>} origin @returns {unknown}
 */
function mergeValue(base, add, at, file, origin) {
  if (Array.isArray(base) && Array.isArray(add)) {
    const out = [...base];
    for (const x of add) {
      if (out.some((y) => sameJson(x, y))) throw new KernelError('E-DIM-DUPLICATE-KEY', {}, `registry shard ${file}: duplicate element in ${JSON.stringify(at)}`);
      origin.set(JSON.stringify([...at, out.length]), file);
      out.push(x);
    }
    return out;
  }
  if (base !== null && typeof base === 'object' && !Array.isArray(base) && add !== null && typeof add === 'object' && !Array.isArray(add)) {
    /** @type {Record<string, unknown>} */
    const out = { ...base };
    for (const [k, v] of Object.entries(add)) {
      const here = [...at, k];
      if (Object.hasOwn(out, k)) { out[k] = mergeValue(out[k], v, here, file, origin); continue; }
      origin.set(JSON.stringify(here), file);
      out[k] = v;
    }
    return out;
  }
  throw new KernelError('E-DIM-DUPLICATE-KEY', {}, `registry shard ${file}: ${JSON.stringify(at)} is already registered`);
}

/**
 * state-owners 合并（草案 §2.1）：主文件在前、分片按文件名次序逐个并入（mergeValue）。无分片时原样返回主文件对象（只冻结，不重建、不重排）。
 * @param {ShardFile} main @param {ReadonlyArray<ShardFile>} shards
 * @returns {{doc: unknown, originOf: (path: KeyPath) => string}} originOf：该路径（或其最近的上级）由哪个文件登记，未由分片登记的即主文件
 */
export function mergeOwners(main, shards) {
  const list = orderedShards(shards, OWNERS_SHARDABLE);
  /** @type {Map<string, string>} */
  const origin = new Map();
  const doc = list.reduce((acc, s) => mergeValue(acc, s.doc, [], s.file, origin), main.doc);
  return Object.freeze({
    doc: deepFreeze(doc),
    originOf: (/** @type {KeyPath} */ path) => {
      for (let n = path.length; n > 0; n--) { const f = origin.get(JSON.stringify(path.slice(0, n))); if (f !== undefined) return f; }
      return main.file;
    },
  });
}

/** entry-registry 的行键 file#name（同 tools/entry-registry.mjs 的行键口径）。 @param {unknown} row */
const entryKey = (row) => `${Object(row).file || ''}#${Object(row).name}`;

/**
 * entry-registry 合并（草案 §2.2）：主文件的 entries 原序在前、分片按次序追加，不重排；跨文件出现相同行键 file#name 即 E-DIM-DUPLICATE-KEY（重复行键）。
 * 同一文件内的重复照旧留给 tools/entry-registry.mjs --check 报。无分片时原样返回主文件对象（只冻结）。
 * @param {ShardFile} main @param {ReadonlyArray<ShardFile>} shards
 * @returns {{registry: unknown, sourceOf: (index: number) => string}} sourceOf：合并后第 index 行来自哪个文件
 */
export function mergeEntries(main, shards) {
  const list = orderedShards(shards, ENTRIES_SHARDABLE);
  if (list.length === 0) return Object.freeze({ registry: deepFreeze(main.doc), sourceOf: () => main.file });
  const mainRows = Object(main.doc)[ENTRIES_SECTION];
  /** @type {unknown[]} */
  const rows = Array.isArray(mainRows) ? [...mainRows] : [];
  const sources = rows.map(() => main.file);
  /** @type {Map<string, string>} */
  const firstFile = new Map(rows.map((r) => [entryKey(r), main.file]));
  for (const s of list) {
    const add = Object(s.doc)[ENTRIES_SECTION];
    if (!Array.isArray(add)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `registry shard ${s.file}: ${ENTRIES_SECTION} must be an array`);
    for (const r of add) {
      const k = entryKey(r);
      const seen = firstFile.get(k);
      if (seen !== undefined && seen !== s.file) throw new KernelError('E-DIM-DUPLICATE-KEY', {}, `registry shard ${s.file}: 重复行键 ${k} (also in ${seen})`);
      firstFile.set(k, s.file);
      rows.push(r);
      sources.push(s.file);
    }
  }
  return Object.freeze({ registry: deepFreeze({ ...Object(main.doc), [ENTRIES_SECTION]: rows }), sourceOf: (/** @type {number} */ i) => sources[i] });
}
