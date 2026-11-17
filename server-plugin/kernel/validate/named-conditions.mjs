// 表头声明的命名必填条件（卷二 §1.2 `.required` 的 byDigestible 一类；判据唯一定义在声明它的卷，如卷三甲 §2.1）。
// 表头 namedConditions.<名> = {family, field, rowNs, reads?}，含义只有一种：词表族 family 里存在一个条目，
// 它的 field（数据档 RX 文本）对本行求值为真或为未知，本条件即成立。rowNs 是 RX 里读本行的命名空间代号
// （须在 state-owners.json 的 rxNamespaces 登记，按字段读），reads 是求值时固定的其余读数（如腐坏进度取 0）。
// 只按声明通用处理，不认表名、族名与条目；未声明的命名条件照旧只记入 notCovered。

import { compileRXInScope, evaluateRX, nsKey, RxError } from '../rx.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// 加载期每条目编译一次；编不过的条目报在词表条目上（E-MOD-RX / E-RX-NS-UNKNOWN），不参与判定。
export function prepareNamedConditions(t, env, err) {
  const decl = isObj(t.doc.namedConditions) ? t.doc.namedConditions : {};
  const out = new Map();
  for (const name of Object.keys(decl).sort()) {
    const d = decl[name];
    const at = { table: t.kind, row: '', dim: `namedConditions.${name}`, path: `${t.file}#/namedConditions/${name}` };
    if (!isObj(d) || typeof d.family !== 'string' || typeof d.field !== 'string' || typeof d.rowNs !== 'string' || (d.reads !== undefined && !isObj(d.reads))) {
      err({ code: 'E-DIM-STRUCT-FIELD', level: 'L1', ...at, got: isObj(d) ? Object.keys(d).sort().join(',') : d, want: '{family, field, rowNs, reads?}' });
      continue;
    }
    const fam = env.vocab.families.get(d.family);
    if (!fam) { err({ code: 'E-DIM-REF-MISSING', level: 'L2', ...at, got: d.family, want: 'registered vocab family' }); continue; }
    const trees = [];
    for (const id of Object.keys(fam.entries).sort()) {
      const text = (fam.entries[id] || {})[d.field];
      const eat = { table: '_vocab', row: id, dim: d.field, path: `_vocab.json#/families/${d.family}/entries/${id}/${d.field}` };
      if (typeof text !== 'string') { err({ code: 'E-MOD-RX', level: 'L2', ...eat, got: typeof text, want: 'RX text' }); continue; }
      try { trees.push({ id, tree: compileRXInScope(text, 'data', env.rxScope).tree }); } catch (e) {
        if (!e.code) throw e;
        err({ code: e.code, level: 'L2', ...eat, got: text, want: e.message });
      }
    }
    out.set(name, { rowNs: d.rowNs, reads: d.reads || {}, trees });
  }
  return out;
}

// 字段定义处写 null 的含义（卷二 §1.6 :254）：维度定义上的 `nullMeans`，取 'none' 即"null = 没有"。
// 没写 nullMeans 的字段，null 的含义定义处未定，按保守处理（条目对本行不成立，同旧行为）。
const NULL_IS_NONE = 'none';

// 本行的读数：rowNs.<维度键> 取本行按取值算法已知的值，rowNs.classes 取本行组件类与类别连同上位链。
// 两种"读不到"分开（卷二 §1.6 :254）：显式 null 是"没有"（含义在字段定义处），记入 none，不给读数；
// 其中定义处写明 null = 没有的记入 absent（求值时 != 成立、== 不成立）；缺值才是未知，同样不给读数。
// 求值器只有四种读数类型，null 不进求值器。dims = 本表维度定义（取各字段的 nullMeans）。
export function rowReads(rowNs, known, classes, dims = {}) {
  const reads = {};
  const none = new Set();
  const absent = new Set();
  for (const [dim, v] of known) {
    const key = `${rowNs}.${dim}`;
    if (v !== null) { reads[key] = v; continue; }
    none.add(key);
    if (isObj(dims[dim]) && dims[dim].nullMeans === NULL_IS_NONE) absent.add(key);
  }
  reads[`${rowNs}.classes`] = classes;
  return { reads, none, absent };
}

const TRUE_NODE = { op: 'cmp', cmpOp: 'eq', left: { op: 'num', value: 0 }, right: { op: 'num', value: 0 } };
const FALSE_NODE = { op: 'cmp', cmpOp: 'ne', left: { op: 'num', value: 0 }, right: { op: 'num', value: 0 } };

// "没有"的读数参与 ==/!= 比较时按含义定值：== 不成立、!= 成立；其余用法（序比较、算术、member）不改，仍按读不到处理。
function foldAbsent(n, absent) {
  if (!n || typeof n !== 'object') return n;
  if (n.op === 'cmp' && (n.cmpOp === 'eq' || n.cmpOp === 'ne')) {
    const hit = [n.left, n.right].some((x) => x && x.op === 'ns' && absent.has(nsKey(x)));
    if (hit) return n.cmpOp === 'ne' ? TRUE_NODE : FALSE_NODE;
  }
  const out = { ...n };
  for (const f of ['left', 'right', 'item', 'set', 'filter']) if (n[f]) out[f] = foldAbsent(n[f], absent);
  if (Array.isArray(n.items)) out.items = n.items.map((x) => foldAbsent(x, absent));
  return out;
}

// 条目求值遇到读数缺失：缺的是"没有"的字段，条目对本行不成立（没有成分就不是任何成分）；缺的是未知的，
// 按"未知"计入成立（卷三甲 §2.1 byDigestible"为真或为未知"）。
export function namedHolds(cond, { reads, none, absent = new Set() }) {
  const all = { ...reads, ...cond.reads };
  return cond.trees.some(({ tree }) => {
    const t = absent.size ? foldAbsent(tree, absent) : tree;
    try { return evaluateRX(t, { dim: {} }, all) === true; } catch (e) {
      if (e instanceof RxError) return !none.has(e.key);
      throw e;
    }
  });
}
