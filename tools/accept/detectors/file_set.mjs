// 检测器 file_set（卷十二 §2.3）：磁盘上的真实文件（内容）与登记不一致。
// S12-13（E-ACC-CRITERION-UNVERSIONED，R12-14.3）：判据版本登记（params.tables 所列、带 rev 的登记表，即 criteria）每行记着
// 该版本时的判据代码指纹 print（read.mjs classPrint：类别登记的各检测器模块及其 import 闭包的词法指纹，登记器写入）。
// 现算指纹与登记的不同，即判定逻辑改了而版本号未变；没有 print 的行同样计入。
// 局限：只比当前内容与登记，同时改代码与登记里的 print 而不升 rev 要靠登记器拒（登记器是 criteria 的唯一写者，S12-2）。

import { LAYOUT, REGISTRY, regContent, classPrint } from '../read.mjs';

export function detect(ctx, params) {
  const hits = [];
  for (const kind of params.tables || []) {
    const rows = regContent(ctx, kind);
    if (!rows) continue;
    const file = `${LAYOUT.accDir}/${REGISTRY[kind].file}`;
    for (const row of rows) {
      if (row.print !== classPrint(ctx, row.scanClass)) hits.push({ file, line: 0, nodeKind: 'row', symbolPath: String(row[REGISTRY[kind].key]), code: params.code || '' });
    }
  }
  return hits;
}
