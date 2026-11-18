// 检测器 data_shape（卷十二 §2.3）：登记表、数据表里出现不许有的键形态或值形态。
// params.tables：要查的 §2.11 登记文件种类（读被查内容里的那一份）；params.checks：形态约束代号——
//   expect / formMethod / param / field：条目登记行的形式核对（lib/item-form.mjs，与登记器同一判据；S12-4 用前三项）；
//   namelist：按文件路径加行号、或按单条行键列出的排除项（S12-6，E-ACC-SCAN-NAMELIST）——值是"路径:行号"或"路径#L行号"的字串、
//   同时带路径与行号字段的对象、或行键形态（R12-8.2 五段，竖线分隔、末段为序号）的字串。
// 每个命中落在一行登记行上（一行多处同类只计一次）。

import { itemChecks, keySets } from '../lib/item-form.mjs';
import { LAYOUT, REGISTRY, regContent } from '../read.mjs';

const PATH_LINE = /[\w./-]+\.[A-Za-z]{1,5}(?::|#L)\d+\b/;
const ROW_KEY = /^[^|\s]*\|[^|]+\|[^|]*\|[^|]+\|\d+$/;

function namelistShape(v) {
  if (typeof v === 'string') return PATH_LINE.test(v) || ROW_KEY.test(v);
  if (Array.isArray(v)) return v.some(namelistShape);
  if (v && typeof v === 'object') {
    const vals = Object.values(v);
    const hasPath = vals.some((x) => typeof x === 'string' && /[\w-]\.[A-Za-z]{1,5}$/.test(x) && x.includes('/'));
    const hasLine = Object.entries(v).some(([k, x]) => /^line/i.test(k) && Number.isInteger(x));
    return (hasPath && hasLine) || vals.some(namelistShape);
  }
  return false;
}

export function detect(ctx, params) {
  const checks = new Set(params.checks || []);
  const keys = keySets(ctx.model, ctx.regs, ctx.decl);
  const hits = [];
  for (const kind of params.tables || []) {
    const rows = regContent(ctx, kind);
    if (!rows) continue;
    const file = `${LAYOUT.accDir}/${REGISTRY[kind].file}`;
    const key = REGISTRY[kind].key;
    for (const row of rows) {
      const codes = new Set();
      if (REGISTRY[kind].itemRows) {
        for (const e of itemChecks(row, keys)) if (checks.has(e.check)) codes.add(e.code);
      }
      if (checks.has('namelist') && namelistShape(row)) codes.add('E-ACC-SCAN-NAMELIST');
      for (const code of [...codes].sort()) hits.push({ file, line: 0, nodeKind: 'row', symbolPath: String(row[key]), code });
    }
  }
  return hits;
}
