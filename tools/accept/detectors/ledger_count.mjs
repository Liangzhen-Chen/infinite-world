// 检测器 ledger_count（卷十二 §2.3）：执行记录、判据修订记录里满足某条件的条数。params.cond 是条件代号：
//   failedCode（S12-12）：执行器写在 §2.11 `tools/accept/out/` 下的执行记录里，不过的条目带 params.code 的条数
//     （扩展性条目前后代码文件集合指纹不同，执行器记该条目不过、码 E-ACC-EXT-CODE-CHANGED，run.mjs）。
//   termsUnrevised（S12-16，R12-11.11）：有 scanClass 的条目，登记的 expect、stage、gates 与它所属类别的判据修订记录里登记的（criteria 行 terms，
//     登记器在首次登记与每次修订时写入）不同，或没有登记的条数；没有 scanClass 的条目，读条目自身的 rev、revisions 与登记器盖的 print
//     （内容与指纹不符、或缺现 rev 的修订记录的条数；李白 11-17 S12-16 裁定）。
// 两种条件读的都是被查内容里的那一份记录（执行记录目录、条目与判据登记），不读判据输入。

import { LAYOUT, REGISTRY, regContent } from '../read.mjs';
import { itemPrint, revisionIssues } from '../lib/item-form.mjs';

const termsOf = (it) => JSON.stringify({ expect: it.expect, gates: it.gates, stage: it.stage });

const CONDS = {
  failedCode(ctx, params) {
    const hits = [];
    for (const file of ctx.files) {
      if (!file.startsWith(LAYOUT.outDir + '/') || !file.endsWith('.json')) continue;
      let rec; try { rec = JSON.parse(ctx.read(file)); } catch { continue; }
      for (const f of ((rec.items || {}).failed) || []) {
        if ((f.codes || []).includes(params.code)) hits.push({ file, line: 0, nodeKind: 'record', symbolPath: String(f.itemKey), code: params.code });
      }
    }
    return hits;
  },
  termsUnrevised(ctx, params) {
    const items = regContent(ctx, 'items') || [];
    const crit = new Map((regContent(ctx, 'criteria') || []).map((c) => [c.scanClass, c]));
    const file = `${LAYOUT.accDir}/${REGISTRY.items.file}`;
    return items.filter((it) => {
      // 没有 scanClass 的条目：修订记录在条目行自身（李白 11-17 S12-16 裁定）。登记器盖的内容指纹与现内容不符，
      // 或修订记录缺现 rev 的一条，即有改动而没走修订；rev 为 1 的首次登记带指纹与首条记录，不计。
      if (!it.scanClass) return it.print !== itemPrint(it) || revisionIssues(it).length > 0;
      const terms = ((crit.get(it.scanClass) || {}).terms || {})[it.itemKey];
      return !terms || termsOf(terms) !== termsOf(it);
    }).map((it) => ({ file, line: 0, nodeKind: 'row', symbolPath: it.itemKey, code: params.code || '' }));
  },
};

export function detect(ctx, params) {
  const run = CONDS[params.cond];
  if (!run) throw new Error(`E-ACC-ITEM-PARAM cond=${params.cond}`);
  return run(ctx, params);
}

export { termsOf };
