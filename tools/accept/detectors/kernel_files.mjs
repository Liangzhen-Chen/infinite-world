// 检测器 kernel_files（卷十二 §2.3 开放登记；L-09 ②，docs/gemini/kickoff-1125.md:480、diagnosis-1124.md:37）：L0 内核白名单冻结。
// 内核目录下实际存在的代码文件（不含清单文件本身）必须与 kernel/files.json 的条目集合逐一对应，且条目数不超过上限。
// 目录前缀、清单文件、上限全在扫描类别行（cls.root、cls.listFile、cls.limit）；本文件不列文件名，也不写上限数字。
// 清单缺失或读不出数组、上限不是正整数，报 E-ACC-ITEM-PARAM，不静默放过（同 data_shape/archive_ref 的缺失口径）。

import { LAYOUT, REGISTRY } from '../read.mjs';

function paramHit(cls, why) {
  return [{ file: `${LAYOUT.accDir}/${REGISTRY.scanclasses.file}`, line: 0, nodeKind: 'param', symbolPath: why, code: 'E-ACC-ITEM-PARAM' }];
}

export function detect(ctx, params = {}, cls = {}) {
  const root = cls.root;
  const listFile = cls.listFile;
  const limit = cls.limit;
  const code = params.code;
  if (typeof root !== 'string' || !root || typeof listFile !== 'string' || !listFile) return paramHit(cls, 'root/listFile');
  if (!Number.isInteger(limit) || limit <= 0) return paramHit(cls, `limit=${String(limit)}`);
  if (!ctx.files.includes(listFile)) return paramHit(cls, 'list file missing');
  let listed;
  try {
    listed = JSON.parse(ctx.read(listFile));
  } catch {
    return paramHit(cls, 'list file unparsable');
  }
  if (!Array.isArray(listed) || listed.some((x) => typeof x !== 'string')) return paramHit(cls, 'list file not a string array');
  const hits = [];
  const list = new Set(listed);
  const actual = ctx.files.filter((f) => f.startsWith(root) && f !== listFile && !f.endsWith('/')).sort();
  for (const f of actual) if (!list.has(f)) hits.push({ file: f, line: 0, nodeKind: 'file', symbolPath: '', code });
  const actualSet = new Set(actual);
  for (const f of listed) if (!actualSet.has(f)) hits.push({ file: f, line: 0, nodeKind: 'file', symbolPath: 'missing', code });
  if (listed.length > limit) hits.push({ file: listFile, line: 0, nodeKind: 'file', symbolPath: 'limit', code });
  return hits;
}
