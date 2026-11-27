// 持有与起始物的加载期核对（S2-H 草案 §3 第 11 行、§4 末段）：坏数据开局即拒，不等到开边或选来历才失败。装配层 rules/load/mount.mjs#mountKernel 按名直调，开局与读档同核。
// 同一判断只在本文件；判据全按种类行字段与 rules.social、rules.economyLedger 数据，不认任何种类、物品或来历代号。
import { KernelError } from '../../kernel/errors.mjs';
import { ruleValue } from '../load/registry.mjs';
import { LEDGER, FAM, CAPPED, vocabEntry, resourceRow, codesOf } from '../economy/ledger.mjs';
import { SOCIAL, RULE, KIND_FAMILY, ROW, TRIGGER, STAY, kindRow, writeEntryNames, dispositionNames } from './holdings.mjs';
import { outfitRule, outfitPlan, resourceOfItem } from './outfit.mjs';

const BUDGET = 'budget';
const BUDGET_MODE = 'budgetMode';
const ROW_SOURCES = 'sources';

const cmp = (/** @type {string} */ a, /** @type {string} */ b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * 持有种类表与 rules.social 的核对：
 * ① 每个种类行写全本写者读的字段（E-HK-ROW-FIELDS）；终止格不许取「不动」、holdWhile 非空的行离任格不许空也不许取「不动」、三格取值须是已知处置（E-HK-PROTOCOL，卷十八 R18-1.2、R18-1.12）；
 *    incompatible 所指种类须在表里（E-HK-UNREGISTERED）；
 * ② endKinds 只指已登记的实体表（E-DIM-REF-MISSING）；primitiveOps 的键是原语目录里的 op、值是写入口（E-DIM-REF-MISSING / E-DIM-STRUCT-FIELD）。
 * events 的动词与 rules.control.seatKind 的种类由登记声明（ref vocab）核。
 * @param {import('./holdings.mjs').SocialEngine & {primitives?: ReadonlyMap<string, unknown>}} engine
 */
export function checkHoldingKinds(engine) {
  const entries = Object(Object(Object(Object(engine.vocab).families)[KIND_FAMILY]).entries);
  const { built, unbuilt } = dispositionNames();
  for (const kind of Object.keys(entries).sort(cmp)) {
    const row = Object(entries[kind]);
    const missing = Object.values(ROW).filter((f) => !Object.hasOwn(row, f));
    if (missing.length > 0) throw new KernelError('E-HK-ROW-FIELDS', {}, `${kind}: missing ${missing.join(', ')}`);
    for (const t of Object.values(TRIGGER)) {
      const cell = row[t];
      if (cell !== null && !built.includes(cell) && !unbuilt.includes(cell)) throw new KernelError('E-HK-PROTOCOL', {}, `${kind}.${t}: ${JSON.stringify(cell)} is not a disposition`);
    }
    if (row[TRIGGER.gone] === STAY) throw new KernelError('E-HK-PROTOCOL', {}, `${kind}.${TRIGGER.gone}: a holder ending may not keep the edge`);
    if (row[ROW.holdWhile] !== null && (row[TRIGGER.vacated] === null || row[TRIGGER.vacated] === STAY)) throw new KernelError('E-HK-PROTOCOL', {}, `${kind}: holdWhile needs a ${TRIGGER.vacated} disposition other than keep`);
    // holderMax 只许空或非负整数（卷十八 R18-1.5 :521；否则运行期上限无从核，等于绕过）。
    const max = row[ROW.holderMax];
    if (max !== null && !(Number.isSafeInteger(max) && Number(max) >= 0)) throw new KernelError('E-HK-ROW-FIELDS', {}, `${kind}.${ROW.holderMax}: ${JSON.stringify(max)} must be null or a non-negative integer`);
    // exclusive 种类的离任格不许取「不动」：让出后旧边必须不在（卷十八:678 A18-1.2）。
    if (row[ROW.exclusive] === true && row[TRIGGER.vacated] === STAY) throw new KernelError('E-HK-PROTOCOL', {}, `${kind}: exclusive needs a ${TRIGGER.vacated} disposition other than keep`);
    for (const inc of Array.isArray(row[ROW.incompatible]) ? row[ROW.incompatible] : []) kindRow(engine, Object(inc).kind);
  }
  const ends = Object(ruleValue(engine.docData, SOCIAL, RULE.endKinds));
  for (const t of Object.keys(ends).sort(cmp)) {
    for (const k of ends[t]) if (!engine.registry.tables.has(k)) throw new KernelError('E-DIM-REF-MISSING', {}, `rules.${SOCIAL}.${RULE.endKinds}.${t}: ${k} is not a registered entity table`);
  }
  const ops = Object(ruleValue(engine.docData, SOCIAL, RULE.primitiveOps));
  const names = writeEntryNames();
  for (const op of Object.keys(ops).sort(cmp)) {
    if (!(engine.primitives instanceof Map) || !engine.primitives.has(op)) throw new KernelError('E-DIM-REF-MISSING', {}, `rules.${SOCIAL}.${RULE.primitiveOps}: ${op} is not in the primitives catalog`);
    if (!names.includes(ops[op])) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `rules.${SOCIAL}.${RULE.primitiveOps}.${op}: ${JSON.stringify(ops[op])} is not a holding write entry`);
  }
}

/**
 * 起始物核对：放置规则所指种类在表里；凡表头声明了 outfit.originDimension（ref 词表）的表，其词表族每个条目的起始物——
 * 每件物都有恰一条资源种类（resourceOfItem），资源行 sources 含 outfit.source（E-LEDGER-CODE-UNREGISTERED），该来源是限额通道即须有 budget 窗口（E-DIM-REF-MISSING）；
 * 逐件物按放置规则都找得到放处（outfitPlan，否则 E-DIM-REF-MISSING）。
 * @param {import('./holdings.mjs').SocialEngine} engine
 */
export function checkOutfitTables(engine) {
  const o = outfitRule(engine);
  for (const p of Array.isArray(o.placement) ? o.placement : []) kindRow(engine, Object(p).holdingKind);
  const srcEntry = vocabEntry(engine, FAM.src, o.source);
  const budget = Object(ruleValue(engine.docData, LEDGER, BUDGET));
  /** @type {Set<string>} */
  const families = new Set();
  for (const table of engine.registry.tables.values()) {
    const v = Object(Object(Object(table).dimensions)[String(o.originDimension)]).vocab;
    if (typeof v === 'string') families.add(v);
  }
  for (const family of [...families].sort(cmp)) {
    const entries = Object(Object(Object(Object(engine.vocab).families)[family]).entries);
    for (const id of Object.keys(entries).sort(cmp)) {
      const list = Object(entries[id])[String(o.itemsField)];
      if (!Array.isArray(list)) continue;
      for (const raw of list) {
        const item = String(Object(raw).item);
        const resource = resourceOfItem(engine, item);
        if (!codesOf(resourceRow(engine, resource), ROW_SOURCES).includes(o.source)) throw new KernelError('E-LEDGER-CODE-UNREGISTERED', {}, `${family} ${id}: ${resource}.${ROW_SOURCES} lacks ${o.source}`);
        if (srcEntry[BUDGET_MODE] === CAPPED && !Object.hasOwn(Object(budget[resource]), String(o.source))) throw new KernelError('E-DIM-REF-MISSING', {}, `${family} ${id}: rules.${LEDGER}.${BUDGET}.${resource}.${o.source} window missing`);
      }
      outfitPlan(engine, list);
    }
  }
}
