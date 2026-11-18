// 表头声明的命名必填条件（卷二 §1.2 `.required` 的 byDigestible 一类；判据唯一定义在声明它的卷，如卷三甲 §2.1）。
// 表头 namedConditions.<名> = {family, field, rowNs, reads?}，含义只有一种：词表族 family 里存在一个条目，
// 它的 field（数据档 RX 文本）对本行求值为真或为未知，本条件即成立。rowNs 是 RX 里读本行的命名空间代号
// （须在 state-owners.json 的 rxNamespaces 登记，按字段读），reads 是求值时固定的其余读数（如腐坏进度取 0）。
// 只按声明通用处理，不认表名、族名与条目；未声明的命名条件照旧只记入 notCovered。

import { compileRXInScope, evaluateRX, nsKey, RxError } from '../rx.mjs';
import { T } from '../handles/markers.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// 加载期每条目编译一次；编不过的条目报在词表条目上（E-MOD-RX / E-RX-NS-UNKNOWN），不参与判定。
/** @param {Record<string, unknown>} t 一张表 @param {Record<string, unknown>} env @param {(...args: unknown[]) => void} err */
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

// 本行的读数：rowNs.<维度键> 取本行按取值算法已知的值，rowNs.classes 取本行组件类与类别连同上位链。
// 两种"读不到"分开（卷二 §1.6 第 2 点 :254）：显式 null 是已知值，表示没有任何条目，记入 none，不给读数；
// 条件比较里 null 只等于 null；序比较与 member 遇 null 不成立（见 foldAbsent）——整类通则，对所有 nullable 字段一样，不读字段说明文字。
// 缺值才是未知，同样不给读数。求值器只有四种读数类型，null 不进求值器。
// 未声明 nullable 的字段写 null，加载时已在类型与取值域校验层报 E-DIM-DOMAIN-RANGE（types.mjs checkValue），到不了这里。
/** @param {Record<string, unknown>} rowNs 行的命名空间读数 @param {Set<string>} known 已知字段 @param {Set<string>} classes 行所挂类别 */
export function rowReads(rowNs, known, classes) {
  const reads = {};
  const none = new Set();
  for (const [dim, v] of known) { if (v === null) none.add(`${rowNs}.${dim}`); else reads[`${rowNs}.${dim}`] = v; }
  reads[`${rowNs}.classes`] = classes;
  return { reads, none };
}

const TRUE_NODE = { op: 'cmp', cmpOp: 'eq', left: { op: 'num', value: 0 }, right: { op: 'num', value: 0 } };
const FALSE_NODE = { op: 'cmp', cmpOp: 'ne', left: { op: 'num', value: 0 }, right: { op: 'num', value: 0 } };

// 显式 null 是已知值（卷二 §1.6 第 2 点，勘误 1117rx2）：它参与比较类节点时按下表定值，之后外层 not/and/or 由求值器照常运算。
// 表按节点类别给"某操作数是显式 null 时的取值"，不按字段、表名、运算逐个特判：
//   eq/ne：null 只等于 null——两边都是显式 null 时 == 成立、!= 不成立；只一边是时 == 不成立、!= 成立；
//   lt/le/gt/ge、member：null 没有大小、也不属于任何集合，任一操作数是显式 null 即不成立（外层 not 取反成立）。
// 算术里的显式 null（如 null + 1 < 3）裁定未覆盖，不折叠，仍按读不到处理。缺值不在此处，走求值器抛 RxError 的未知路径。
const NULL_RULES = {
  cmp: { fields: ['left', 'right'], by: (n) => ({ eq: (l, r) => l && r, ne: (l, r) => !(l && r) }[n.cmpOp] || (() => false)) },
  member: { fields: ['item', 'set'], by: () => () => false },
};

function foldAbsent(n, absent) {
  if (!n || typeof n !== 'object') return n;
  const rule = NULL_RULES[n.op];
  if (rule) {
    const isNull = (x) => !!x && x.op === T.rx_op.ns && absent.has(nsKey(x));
    const [l, r] = rule.fields.map((f) => isNull(n[f]));
    if (l || r) return rule.by(n)(l, r) ? TRUE_NODE : FALSE_NODE;
  }
  const out = { ...n };
  for (const f of ['left', 'right', 'item', 'set', 'filter']) if (n[f]) out[f] = foldAbsent(n[f], absent);
  if (Array.isArray(n.items)) out.items = n.items.map((x) => foldAbsent(x, absent));
  return out;
}

// 条目求值遇到读数缺失：缺的是"没有"的字段但仍未被折叠（如算术里的 null），条目对本行不成立；缺的是未知的，
// 按"未知"计入成立（卷三甲 §2.1 byDigestible"为真或为未知"）。
/** @param {Record<string, unknown>} cond 已编译的条目 @param {{reads: Record<string, unknown>, none: Set<string>}} rr 行读数与"没有"的字段 */
export function namedHolds(cond, { reads, none }) {
  const all = { ...reads, ...cond.reads };
  return cond.trees.some(({ tree }) => {
    const t = none.size ? foldAbsent(tree, none) : tree;
    try { return evaluateRX(t, { dim: {} }, all) === true; } catch (e) {
      if (e instanceof RxError) return !none.has(e.key);
      throw e;
    }
  });
}
