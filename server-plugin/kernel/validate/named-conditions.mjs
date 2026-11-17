// 表头声明的命名必填条件（卷二 §1.2 `.required` 的 byDigestible 一类；判据唯一定义在声明它的卷，如卷三甲 §2.1）。
// 表头 namedConditions.<名> = {family, field, rowNs, reads?}，含义只有一种：词表族 family 里存在一个条目，
// 它的 field（数据档 RX 文本）对本行求值为真或为未知，本条件即成立。rowNs 是 RX 里读本行的命名空间代号
// （须在 state-owners.json 的 rxNamespaces 登记，按字段读），reads 是求值时固定的其余读数（如腐坏进度取 0）。
// 只按声明通用处理，不认表名、族名与条目；未声明的命名条件照旧只记入 notCovered。

import { compileRXInScope, evaluateRX, RxError } from '../rx.mjs';

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

// 本行的读数：rowNs.<维度键> 取本行按取值算法已知的值，rowNs.classes 取本行组件类与类别连同上位链。
// 未知的维度不给读数：读到它的条目求值失败，按"未知"计入成立（卷三甲 §2.1 byDigestible"为真或为未知"）。
export function rowReads(rowNs, known, classes) {
  const reads = {};
  for (const [dim, v] of known) reads[`${rowNs}.${dim}`] = v;
  reads[`${rowNs}.classes`] = classes;
  return reads;
}

export function namedHolds(cond, reads) {
  const all = { ...reads, ...cond.reads };
  return cond.trees.some(({ tree }) => {
    try { return evaluateRX(tree, { dim: {} }, all) === true; } catch (e) {
      if (e instanceof RxError) return true;
      throw e;
    }
  });
}
