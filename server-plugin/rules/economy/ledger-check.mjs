// 账本核对（S2-L 草案 §4）：守恒核对 conservationCheck（卷六 §4.1 规则 4、A6-1.2；纯读，读档复演后由装配层调）与
// 加载期表核对 checkLedgerTables（资源种类行、budget 窗口、出身起始钱可解析；坏数据开局即拒，不等到选来历才失败）。同一判断只在本文件。
import { KernelError } from '../../kernel/errors.mjs';
import { readPath } from '../../kernel/storage.mjs';
import { ruleValue } from '../load/registry.mjs';
import { LEDGER, FAM, CAPPED, WINDOW, vocabEntry, resourceRow, allHolders } from './ledger.mjs';

// rules.economyLedger 的键与来源去处条目字段（同 ledger.mjs 口径）。
const BUDGET = 'budget';
const ENDOWMENT = 'endowment';
const BUDGET_MODE = 'budgetMode';
// 资源种类表的行集合（卷六 §2.1 sources、sinks）。
const ROW_SETS = Object.freeze({ src: 'sources', sink: 'sinks' });

const cmp = (/** @type {string} */ a, /** @type {string} */ b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * 守恒核对（卷六 §4.1 规则 4；A6-1.2）：对每一种资源，全部普通账户余额之和 = 各来源累计之和 − 各去处累计之和（整数相等，不设容差），所有余额非负。
 * 返回违例列表（空即守恒），按资源种类、账户排序，冻结。只读。
 * @param {any} engine @param {any} state
 * @returns {ReadonlyArray<Readonly<{resource: string, balances: number, net: number} | {account: string, balance: number}>>}
 */
export function conservationCheck(engine, state) {
  /** @type {Map<string, {balances: number, net: number}>} */
  const sums = new Map();
  const at = (/** @type {string} */ r) => sums.get(r) || sums.set(r, { balances: 0, net: 0 }).get(r);
  /** @type {Array<Readonly<{account: string, balance: number}>>} */
  const negatives = [];
  for (const { holder, book } of allHolders(engine, state)) {
    for (const [purpose, byRes] of Object.entries(book)) {
      for (const [resource, byKey] of Object.entries(Object(byRes))) {
        for (const [key, v] of Object.entries(Object(byKey))) {
          Object(at(resource)).balances += Number(v);
          if (Number(v) < 0) negatives.push(Object.freeze({ account: [holder, purpose, resource, key].join(' '), balance: Number(v) }));
        }
      }
    }
  }
  // 声明表没登记 ledgerTotals 即无累计可写（同 allHolders），按空计。
  const totals = Object.hasOwn(engine.P, 'ledgerTotals') ? Object(readPath(state, engine.P.ledgerTotals())) : {};
  for (const [resource, byCode] of Object.entries(totals)) {
    for (const [code, c] of Object.entries(Object(byCode))) {
      const isSrc = Object.hasOwn(Object(Object(Object(engine.vocab).families)[FAM.src]).entries, code);
      Object(at(resource)).net += (isSrc ? 1 : -1) * Number(Object(c).cumulative);
    }
  }
  const out = [...sums.entries()].filter(([, s]) => s.balances !== s.net).sort(([a], [b]) => cmp(a, b))
    .map(([resource, s]) => Object.freeze({ resource, balances: s.balances, net: s.net }));
  return Object.freeze([...out, ...negatives.sort((a, b) => cmp(a.account, b.account))]);
}

/**
 * 加载期账本表核对（registry.json economyResources、economyLedger 登记所指；装配层 rules/load/mount.mjs#mountKernel 调，不合即抛、开局与读档同核）：
 * ① resource 族每个条目都有资源种类行，每行按登记声明核（公共部件 ruleRow）；
 * ② budget 每格：资源种类行的 sources ∪ sinks 含该代号（E-LEDGER-CODE-UNREGISTERED）、该代号是限额通道、窗口 activeFromDay ≤ activeToDay 都写了（E-DIM-STRUCT-FIELD）；
 * ③ endowment：凡表头声明了 originDimension（ref 词表）的表，其词表族每个条目的起始钱 moneyField 写了即须为非负整数；为正的，钱种 coinField 须有资源种类行、
 *    sources 含 endowment.source、该来源若是限额通道须有 budget 窗口（不合即 E-DIM-STRUCT-FIELD / E-DIM-REF-MISSING / E-LEDGER-CODE-UNREGISTERED）。
 * @param {any} engine
 */
export function checkLedgerTables(engine) {
  const doc = Object(engine.docData);
  const resources = Object(Object(Object(engine.vocab).families)[FAM.resource]).entries;
  for (const id of Object.keys(Object(resources)).sort(cmp)) resourceRow(engine, id);
  const budget = Object(ruleValue(doc, LEDGER, BUDGET));
  for (const [resource, byCode] of Object.entries(budget)) {
    const row = resourceRow(engine, resource);
    for (const [code, w] of Object.entries(Object(byCode))) {
      const fam = Object.hasOwn(Object(Object(Object(engine.vocab).families)[FAM.src]).entries, code) ? FAM.src : FAM.sink;
      const set = row[ROW_SETS[fam]];
      if (!Array.isArray(set) || !set.includes(code)) throw new KernelError('E-LEDGER-CODE-UNREGISTERED', {}, `rules.${LEDGER}.${BUDGET}.${resource}.${code}: not in the resource row's ${ROW_SETS[fam]}`);
      if (vocabEntry(engine, fam, code)[BUDGET_MODE] !== CAPPED) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `rules.${LEDGER}.${BUDGET}.${resource}.${code}: only capped channels carry a budget window`);
      const win = Object(w);
      if (!(Number.isInteger(win[WINDOW.from]) && Number.isInteger(win[WINDOW.to]) && win[WINDOW.from] <= win[WINDOW.to])) {
        throw new KernelError('E-DIM-STRUCT-FIELD', {}, `rules.${LEDGER}.${BUDGET}.${resource}.${code}: needs ${WINDOW.from} <= ${WINDOW.to}`);
      }
    }
  }
  const e = Object(ruleValue(doc, LEDGER, ENDOWMENT));
  const srcEntry = vocabEntry(engine, FAM.src, e.source);
  vocabEntry(engine, FAM.purpose, e.purpose);
  /** @type {Set<string>} */
  const families = new Set();
  for (const table of engine.registry.tables.values()) {
    const v = Object(Object(Object(table).dimensions)[e.originDimension]).vocab;
    if (typeof v === 'string') families.add(v);
  }
  for (const family of [...families].sort(cmp)) {
    const entries = Object(Object(Object(Object(engine.vocab).families)[family]).entries);
    for (const id of Object.keys(entries).sort(cmp)) {
      const ent = Object(entries[id]);
      const n = ent[e.moneyField];
      if (n === undefined) continue;
      const where = `${family} ${id}.${e.moneyField}`;
      if (!Number.isSafeInteger(n) || n < 0) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `${where}: must be a non-negative integer`);
      if (n === 0) continue;
      const coin = ent[e.coinField];
      if (typeof coin !== 'string') throw new KernelError('E-DIM-STRUCT-FIELD', {}, `${family} ${id}: ${e.moneyField} > 0 needs ${e.coinField}`);
      const row = resourceRow(engine, coin);
      if (!Array.isArray(row[ROW_SETS.src]) || !row[ROW_SETS.src].includes(e.source)) throw new KernelError('E-LEDGER-CODE-UNREGISTERED', {}, `${family} ${id}: ${coin}.${ROW_SETS.src} lacks ${e.source}`);
      if (srcEntry[BUDGET_MODE] === CAPPED && !Object.hasOwn(Object(budget[coin]), e.source)) {
        throw new KernelError('E-DIM-REF-MISSING', {}, `${family} ${id}: rules.${LEDGER}.${BUDGET}.${coin}.${e.source} window missing`);
      }
    }
  }
}
