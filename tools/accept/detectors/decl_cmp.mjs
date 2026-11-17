// 检测器 decl_cmp（卷十二 §2.3）：声明的输入、输出与调用图内实际读写不一致。块 2 第 2-3 张起用（扫描类别 undeclared_io；卷十二 R12-3.4、R12-3.5）。
// params.groups：范围；params.checks：
//   dynamicState  卷二 S15 / R12-3.4 动态访问一律计入（E-VIEW-DYNAMIC-STATE）：顶层键用变量取 `state[k]`；
//                 state 整体被展开（`...state`）、被枚举（Object.keys/values/entries/assign/fromEntries、for…in 的对象）。
//   inputs        卷二 S9 / R12-3.5 叶子核对：每个声明节点有 declareInputs，调用图内 state 读取 ⊆ own ∪ 闭包。
//                 依赖声明与 kernel/declare.mjs#declareInputs 在 2-5 才建（块 2 排期 e14），本项现在没有输入，调用即报错，不静默放过。
// 局限（2-3 回报）：state 的根按名字认（lib/js-state.mjs）；"state 传给 §2.3 三类对象之外的函数"要调用图与类型，未判。

import { tokenize, isP, symbolPaths } from '../lib/js-scan.mjs';
import { stateChains } from '../lib/js-state.mjs';
import { filesOfGroups } from '../read.mjs';

const ENUM_FNS = new Set(['keys', 'values', 'entries', 'assign', 'fromEntries', 'getOwnPropertyNames']);

function dynamicHits(toks) {
  const out = [];
  // 顶层键用变量取（`state[k]`）：路径归不到声明的顶层键上。`state.<键>[id]` 按 pathTypes 的 `*` 段取实体是登记的写法，不计。
  for (const ch of stateChains(toks)) if (ch.segs[0] === '*') out.push({ i: ch.start, nodeKind: 'state_computed' });
  toks.forEach((t, i) => {
    if (!(t.t === 'id' && t.v === 'state') || isP(toks[i - 1], '.') || isP(toks[i + 1], '.') || isP(toks[i + 1], '[') || isP(toks[i + 1], '?.')) return;
    if (isP(toks[i - 1], '...')) out.push({ i, nodeKind: 'state_spread' });
    else if (isP(toks[i - 1], '(') && toks[i - 2] && toks[i - 2].t === 'id' && ENUM_FNS.has(toks[i - 2].v) && isP(toks[i - 3], '.') && toks[i - 4] && toks[i - 4].v === 'Object') out.push({ i, nodeKind: 'state_enumerate' });
    else if (toks[i - 1] && toks[i - 1].t === 'id' && toks[i - 1].v === 'in' && isP(toks[i + 1], ')')) out.push({ i, nodeKind: 'state_for_in' });
  });
  return out.sort((a, b) => a.i - b.i);
}

export function detect(ctx, params) {
  const checks = params.checks || [];
  const hits = [];
  if (checks.includes('inputs')) throw new Error('E-ACC-ITEM-UNIMPLEMENTED decl_cmp inputs: declareInputs not built (block 2 card 2-5)');
  for (const file of filesOfGroups(ctx.files, ctx.model, params.groups || [])) {
    const toks = tokenize(ctx.read(file));
    const sym = symbolPaths(toks);
    if (checks.includes('dynamicState')) for (const h of dynamicHits(toks)) hits.push({ file, line: toks[h.i].line, nodeKind: h.nodeKind, symbolPath: sym[h.i], code: 'E-VIEW-DYNAMIC-STATE' });
  }
  return hits;
}
