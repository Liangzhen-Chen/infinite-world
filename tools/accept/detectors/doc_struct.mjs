// 检测器 doc_struct（卷十二 §2.3、§4.12）：文稿的编号与登记表之间的结构关系。只数编号、比编号，不读文字（R12-11.3）。
// 条目编号口径（李白 11-17 裁定二）：只数各卷"判定/验收"那一族编号，在定义处出现的才算——表格首列，或标题、加粗行开头
// （前面可有列表符、表格竖线、反引号；卷二的 S 条是列表项开头，按定义处收）；纯段落开头的编号是引用；条文下面的"第 n 条"与别处的引用都不算条目。每卷算哪几族是登记数据：扫描类别登记行
// docFamilies：{卷代号: [编号前缀]}（编号 = 前缀 + 数字，数字间可带 . 或 -），卷文件在 docVolumes；代码里没有卷名与前缀。
// params.checks：
//   orphan（E-ACC-ITEM-ORPHAN）  登记表里的条目，它的 localNo 不在所属卷的定义处编号里；卷没有登记卷文件或编号族的同样计入。
//   unregistered（E-ACC-ITEM-UNREGISTERED）  卷里定义处有、登记表（该卷条目的 localNo）里没有的编号，每个编号一行。
//   count（E-ACC-ITEM-COUNT）  登记行数不等于该卷定义处不同编号数的卷，每卷一行。
// 后两项只对登了编号族与卷文件的卷做。

import { LAYOUT, REGISTRY, regContent } from '../read.mjs';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 卷里定义处的编号 → 首次出现的行号（1 起）。
export function definedNumbers(text, prefixes) {
  const out = new Map();
  if (!prefixes.length) return out;
  // 行首须有定义处的记号：表格竖线、标题井号、列表符、加粗；纯段落开头的编号是引用，不算。
  const lead = '(?:[ \\t>]*(?:[-*+]|\\d+\\.|#+|\\|)[ \\t]*(?:\\*\\*|`)*|[ \\t>]*\\*\\*)';
  const re = new RegExp(`^${lead}((?:${prefixes.map(esc).join('|')})\\d+(?:[.-]\\d+)*)(?![A-Za-z0-9_])`);
  text.split('\n').forEach((line, i) => {
    const m = re.exec(line);
    if (m && !out.has(m[1])) out.set(m[1], i + 1);
  });
  return out;
}

export function detect(ctx, params, cls) {
  const checks = new Set(params.checks || []);
  const vols = (cls || {}).docVolumes || {};
  const fams = (cls || {}).docFamilies || {};
  const all = new Set(ctx.files);
  const items = regContent(ctx, 'items') || [];
  const file = `${LAYOUT.accDir}/${REGISTRY.items.file}`;
  const defs = new Map();
  const defsOf = (vol) => {
    if (!defs.has(vol)) {
      const doc = vols[vol];
      defs.set(vol, doc && all.has(doc) && fams[vol] ? definedNumbers(ctx.read(doc), fams[vol]) : null);
    }
    return defs.get(vol);
  };
  const hits = [];
  if (checks.has('orphan')) {
    for (const it of items) {
      const d = defsOf(it.volume);
      if (!d || !it.localNo || !d.has(it.localNo)) hits.push({ file, line: 0, nodeKind: 'row', symbolPath: it.itemKey, code: 'E-ACC-ITEM-ORPHAN' });
    }
  }
  for (const vol of Object.keys(vols).sort()) {
    const d = defsOf(vol);
    if (!d) continue;
    const own = items.filter((it) => it.volume === vol);
    if (checks.has('unregistered')) {
      const have = new Set(own.map((it) => it.localNo));
      for (const [no, line] of [...d.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
        if (!have.has(no)) hits.push({ file: vols[vol], line, nodeKind: 'doc', symbolPath: `${vol}.${no}`, code: 'E-ACC-ITEM-UNREGISTERED' });
      }
    }
    if (checks.has('count') && own.length !== d.size) hits.push({ file, line: 0, nodeKind: 'volume', symbolPath: vol, code: 'E-ACC-ITEM-COUNT' });
  }
  return hits;
}
