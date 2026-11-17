// 检测器 doc_struct（卷十二 §2.3、§4.12）：文稿的编号与登记表之间的结构关系。只数编号、比编号，不读文字（R12-11.3）。
// params.checks：orphan（S12-3 第二项，E-ACC-ITEM-ORPHAN）——登记表（被查内容里的 items）里的条目，在它的卷（扫描类别登记行
// docVolumes：卷代号 → 卷文件）里找不到它的原编号 localNo（前后不接编号字符）；卷代号没有登记卷文件的同样计入。
// S12-3 另两项（正文有、登记表无的编号 E-ACC-ITEM-UNREGISTERED；转录条数不等 E-ACC-ITEM-COUNT）要"正文带编号条目"的识别口径，
// 卷十二没有写（R12-11.3、R12-11.9 只说按编号数），P-1b 不自补，列为待定。

import { LAYOUT, REGISTRY, regContent } from '../read.mjs';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function detect(ctx, params, cls) {
  const checks = new Set(params.checks || []);
  const hits = [];
  if (!checks.has('orphan')) return hits;
  const vols = (cls || {}).docVolumes || {};
  const all = new Set(ctx.files);
  const text = new Map();
  const file = `${LAYOUT.accDir}/${REGISTRY.items.file}`;
  for (const it of regContent(ctx, 'items') || []) {
    const doc = vols[it.volume];
    let found = false;
    if (doc && all.has(doc) && it.localNo) {
      if (!text.has(doc)) text.set(doc, ctx.read(doc));
      found = new RegExp(`(?<![A-Za-z0-9_.-])${esc(it.localNo)}(?![A-Za-z0-9_]|[.-][A-Za-z0-9])`).test(text.get(doc));
    }
    if (!found) hits.push({ file, line: 0, nodeKind: 'row', symbolPath: it.itemKey, code: 'E-ACC-ITEM-ORPHAN' });
  }
  return hits;
}
