// 检测器 doc_struct（卷十二 §2.3、§4.12）：文稿的编号与登记表之间的结构关系。只数编号、比编号，不读文字（R12-11.3）。
// 条目编号口径（李白 11-17 裁定二）：只数各卷"判定/验收"那一族编号，在定义处出现的才算——表格首列，或标题、加粗行开头
// 或列表项开头（李白 11-17 门禁小修卡裁定二追认，对所有卷一样）；编号前只允许列表符、加粗（表格竖线、标题井号、反引号是另几种位置的记号）；
// 列表项开头还允许"四种形式名之一＋全角冒号＋编号"（裁定一，卷十二的 A12 条）。纯段落开头的编号与段落中间的引用不算；条文下面的"第 n 条"也不算条目。
// 作废条目（李白 11-17 S12-3 三类问题裁定第 3 条）：定义处在列表符之后、编号之前加删除线记号 ~~，不在上面允许的前导记号之内，所以不算定义处、不计入；
// 该行文字照留作历史。拆行的原条目（跨两类，行上 part/parts）按原条目计，见 detect 内说明。
// 每卷算哪几族是登记数据：扫描类别登记行 docFamilies：{卷代号: [编号前缀]}（编号 = 前缀 + 数字，数字间可带 . 或 -），卷文件在 docVolumes；
// 四个形式名在同一行的 formNames：{acc_form 值: 中文名}（键取自 item-form 的 ENUM.form）；代码里没有卷名、前缀与形式名。
// params.checks：
//   orphan（E-ACC-ITEM-ORPHAN）  登记表里的条目，它的 localNo 不在所属卷的定义处编号里；卷没有登记卷文件或编号族的同样计入。
//   unregistered（E-ACC-ITEM-UNREGISTERED）  卷里定义处有、登记表（该卷条目的 localNo）里没有的编号，每个编号一行。
//   count（E-ACC-ITEM-COUNT）  登记行数不等于该卷定义处不同编号数的卷，每卷一行。
// 后两项只对登了编号族与卷文件的卷做。

import { LAYOUT, REGISTRY, regContent } from '../read.mjs';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 卷里定义处的编号 → 首次出现的行号（1 起）。
export function definedNumbers(text, prefixes, formNames = []) {
  const out = new Map();
  if (!prefixes.length) return out;
  // 行首须有定义处的记号：表格竖线、标题井号、列表符、加粗；纯段落开头的编号是引用，不算。
  const mark = '(?:\\*\\*|`)*';
  const bold = '(?:\\*\\*)*';
  const list = '[ \\t>]*(?:[-*+]|\\d+\\.)[ \\t]*';
  const names = formNames.filter(Boolean).map(esc).join('|');
  const lead = `(?:[ \\t>]*(?:#+|\\|)[ \\t]*${mark}|${list}${bold}|[ \\t>]*\\*\\*${names ? `|${list}(?:${names})：[ \\t]*${bold}` : ''})`;
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
  const formNames = Object.values((cls || {}).formNames || {});
  const all = new Set(ctx.files);
  const items = regContent(ctx, 'items') || [];
  const file = `${LAYOUT.accDir}/${REGISTRY.items.file}`;
  const defs = new Map();
  const defsOf = (vol) => {
    if (!defs.has(vol)) {
      const doc = vols[vol];
      defs.set(vol, doc && all.has(doc) && fams[vol] ? definedNumbers(ctx.read(doc), fams[vol], formNames) : null);
    }
    return defs.get(vol);
  };
  // 原条目口径（李白 11-17 S12-3 三类问题裁定第 2 条）：跨两类的条目拆成几行，行上写 part 与全部 parts；登记表按"卷＋localNo"为一个原条目，
  // 各行 parts 列的每一部分都有行在才算已登记（缺任一部分的原条目按未登记）；计数按原条目，不按行数重复计。
  const complete = new Set();
  for (const key of new Set(items.map((it) => `${it.volume}\n${it.localNo}`))) {
    const rows = items.filter((it) => `${it.volume}\n${it.localNo}` === key);
    const have = new Set(rows.map((r) => r.part));
    if (rows.every((r) => !r.parts || r.parts.every((p) => have.has(p)))) complete.add(key);
  }
  const originalsOf = (vol) => new Set(items.filter((it) => it.volume === vol && complete.has(`${it.volume}\n${it.localNo}`)).map((it) => it.localNo));
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
    const have = originalsOf(vol);
    if (checks.has('unregistered')) {
      for (const [no, line] of [...d.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
        if (!have.has(no)) hits.push({ file: vols[vol], line, nodeKind: 'doc', symbolPath: `${vol}.${no}`, code: 'E-ACC-ITEM-UNREGISTERED' });
      }
    }
    if (checks.has('count') && have.size !== d.size) hits.push({ file, line: 0, nodeKind: 'volume', symbolPath: vol, code: 'E-ACC-ITEM-COUNT' });
  }
  return hits;
}
