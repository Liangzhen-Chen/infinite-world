// 门禁测试用的临时仓库（非 git，按磁盘遍历）：声明表、§2.11 登记、整套门禁代码与绕法用例片段。临时根由 temp-root.mjs 的 testTempRoot 生成；
// 这里只对"临时根 + 常量相对路径"写（S12-2 判法，李白 11-17 裁定三）。需要额外文件的测试在自己里面按常量路径写。
import { join, extname, basename } from 'node:path';
import { cpSync } from 'node:fs';
import { REGISTRY } from '../../tools/accept/read.mjs';
import { ROOT, testTempRoot } from './temp-root.mjs';

export { ROOT };

const REG_FILES = new Set(Object.values(REGISTRY).map((r) => r.file));

export function tempRepo() {
  const dir = testTempRoot('p1-accept-');
  cpSync(join(ROOT, 'world/ontology/state-owners.json'), join(dir, 'world/ontology/state-owners.json'));
  // 登记文件与整套门禁代码（S12-13 按类别登记的检测器模块及其 import 闭包算判据指纹；P-1b）。
  cpSync(join(ROOT, 'tools/accept'), join(dir, 'tools/accept'), {
    recursive: true,
    filter: (src) => basename(src) !== 'out' && (extname(src) === '' || extname(src) === '.mjs' || REG_FILES.has(basename(src))),
  });
  cpSync(join(ROOT, 'tests/accept/bypass'), join(dir, 'tests/accept/bypass'), {
    recursive: true,
    filter: (src) => extname(src) === '' || extname(src) === '.txt' || extname(src) === '.json',
  });
  return dir;
}
