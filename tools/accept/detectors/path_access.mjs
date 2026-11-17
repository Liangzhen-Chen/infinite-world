// 检测器 path_access（卷十二 §2.3）：对某状态路径模式的读点或写点不在登记的读者、写者内。
// params.groups：范围（模块组键）；params.paths：状态路径模式（`.` 分段，段内 `*` 通配）；
// params.access：read（凡读即计）或 branch（读到并据此分支才计，卷一 R-8 判定）；params.readers：登记的读者组键（缺省为空）；
// params.code：命中所报的错误码。
// 局限（写进 P-1 汇报）：按成员链读路径，解构取出后的分支追不到，要等块 2 的类型检查。

import { tokenize, memberChains, conditionSpans, symbolPaths, BRANCH_OPS } from '../lib/js-scan.mjs';
import { filesOfGroups, globToRe } from '../read.mjs';

export function detect(ctx, params) {
  const pats = (params.paths || []).map((p) => p.split('.').map((seg) => globToRe(seg, [])));
  const readers = new Set(filesOfGroups(ctx.files, ctx.model, params.readers || []));
  const hits = [];
  for (const file of filesOfGroups(ctx.files, ctx.model, params.groups || [])) {
    if (readers.has(file)) continue;
    const toks = tokenize(ctx.read(file));
    const cond = params.access === 'branch' ? conditionSpans(toks) : null;
    const sym = symbolPaths(toks);
    for (const ch of memberChains(toks)) {
      if (!pats.some((pat) => windowMatch(ch.segs, pat))) continue;
      if (cond && !isBranch(toks, ch, cond)) continue;
      hits.push({ file, line: toks[ch.start].line, nodeKind: 'member', symbolPath: sym[ch.start], code: params.code || '' });
    }
  }
  return hits;
}

function windowMatch(segs, pat) {
  for (let s = 0; s + pat.length <= segs.length; s++) if (pat.every((re, k) => re.test(segs[s + k]))) return true;
  return false;
}

function isBranch(toks, ch, cond) {
  for (let k = ch.start; k < ch.end; k++) if (cond[k]) return true;
  const after = toks[ch.end]; const before = toks[ch.start - 1];
  const op = (t) => t && (t.t === 'p' || t.t === 'id') && (BRANCH_OPS.has(t.v) || t.v === 'case');
  return op(after) || op(before);
}
