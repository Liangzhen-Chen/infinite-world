// 门禁测试用的临时仓库（非 git，按磁盘遍历）：声明表、§2.11 登记、整套门禁代码与绕法用例片段。临时根由 temp-root.mjs 的 testTempRoot 生成；
// 这里只对"临时根 + 常量相对路径"写（S12-2 判法，李白 11-17 裁定三）。需要额外文件的测试在自己里面按常量路径写。
import { join, extname, basename } from 'node:path';
import { cpSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { REGISTRY, readRegistry } from '../../tools/accept/read.mjs';
import { ROOT, testTempRoot, writeUnderTempRoot } from './temp-root.mjs';

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
  // lit_scope 判修正键直接 import kernel/handles/keys.mjs，其 import 闭包要原样放进临时仓库，classPrint 才算得出同样的指纹（S12-13）。
  // 只许"临时根 + 常量相对路径"写（S12-2，李白 11-17 裁定三），所以逐条按字面路径复制，不用变量拼路径。
  mkdirSync(join(dir, 'server-plugin/kernel/handles'), { recursive: true });
  mkdirSync(join(dir, 'server-plugin/kernel/validate'), { recursive: true });
  mkdirSync(join(dir, 'server-plugin/kernel/load'), { recursive: true });
  cpSync(join(ROOT, 'server-plugin/kernel/handles/keys.mjs'), join(dir, 'server-plugin/kernel/handles/keys.mjs'));
  cpSync(join(ROOT, 'server-plugin/kernel/handles/vocab-handle.mjs'), join(dir, 'server-plugin/kernel/handles/vocab-handle.mjs'));
  cpSync(join(ROOT, 'server-plugin/kernel/validate/types.mjs'), join(dir, 'server-plugin/kernel/validate/types.mjs'));
  cpSync(join(ROOT, 'server-plugin/kernel/det-math.mjs'), join(dir, 'server-plugin/kernel/det-math.mjs'));
  cpSync(join(ROOT, 'server-plugin/kernel/rx.mjs'), join(dir, 'server-plugin/kernel/rx.mjs'));
  // lit_scope 的 vocabIndex 走 kernel/load/vocab-load.mjs 的 loadVocab，同样按字面路径放进临时仓库（其自身无 import）。
  cpSync(join(ROOT, 'server-plugin/kernel/load/vocab-load.mjs'), join(dir, 'server-plugin/kernel/load/vocab-load.mjs'));
  cpSync(join(ROOT, 'server-plugin/kernel/error-codes.mjs'), join(dir, 'server-plugin/kernel/error-codes.mjs'));
  // 卷六 A6-1.1 的读者与范围文件由 state-owners 写者登记派生（path_access ownerFiles），派生文件不在仓库即 E-ACC-ITEM-PARAM；临时仓库用真声明表，故带上账本内核本身。
  cpSync(join(ROOT, 'server-plugin/kernel/ledger.mjs'), join(dir, 'server-plugin/kernel/ledger.mjs'));
  // 放进来的 kernel 文件要在两处登记里站得住：成员闭集清单（E-FILE-UNASSIGNED，S19）与 S10 的常数登记豁免表。
  cpSync(join(ROOT, 'server-plugin/kernel/files.json'), join(dir, 'server-plugin/kernel/files.json'));
  mkdirSync(join(dir, 'world/rules/tables'), { recursive: true });
  cpSync(join(ROOT, 'world/rules/tables/kernel-constants.json'), join(dir, 'world/rules/tables/kernel-constants.json'));
  cpSync(join(ROOT, 'tests/accept/bypass'), join(dir, 'tests/accept/bypass'), {
    recursive: true,
    filter: (src) => extname(src) === '' || extname(src) === '.txt' || extname(src) === '.json',
  });
  // 已实现条目的 impl（卷十二 §2.2 :203，登记器要求 implemented 起文件存在）：门禁目录外的（方法是测试的条目的测试文件）
  // 按登记行逐个经临时根写入口放进来，登记器在临时仓库里才站得住。只放文件本身，不放它 import 的内核与世界数据（world 整份太大），
  // 所以这些条目在临时仓库里执行必不过——临时仓库的测试按条目看结果，或用条目过滤（R12-10.2）只跑要看的条目。
  for (const it of readRegistry(ROOT, 'items')) {
    if (it.state === 'registered' || !it.impl || it.impl.startsWith('tools/accept/') || existsSync(join(dir, it.impl))) continue;
    writeUnderTempRoot(dir, it.impl, readFileSync(join(ROOT, it.impl)));
  }
  return dir;
}
