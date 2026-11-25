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
  // 卷六 S6-14（in_core，必过）检测器读卷二 §1.5 命名 struct 机读登记与维度表实体行（卷六 :337、§4.1 规则 11 :382）：
  // 临时仓库带上这两处世界数据，必过条目才与真实仓库同口径，不会因缺登记被判 E-ACC-ITEM-PARAM。
  cpSync(join(ROOT, 'world/ontology/named-structs.json'), join(dir, 'world/ontology/named-structs.json'));
  cpSync(join(ROOT, 'world/ontology/dimensions'), join(dir, 'world/ontology/dimensions'), { recursive: true });
  // 登记文件与整套门禁代码（S12-13 按类别登记的检测器模块及其 import 闭包算判据指纹；P-1b）。
  // 基线文件 baseline.json 同属 §2.11 登记（执行器写、卷十二 §2.5 基线分量）：复制过来，临时仓库里的 V-11 才与真实仓库同口径
  // （内核组的逐行基线分量不为零，不复制会按零基线拒）；内核文件只拷一部分，实测行数是基线的子集，只降判定照过。
  cpSync(join(ROOT, 'tools/accept'), join(dir, 'tools/accept'), {
    recursive: true,
    filter: (src) => basename(src) !== 'out' && (extname(src) === '' || extname(src) === '.mjs' || REG_FILES.has(basename(src)) || basename(src) === 'baseline.json'),
  });
  // 门禁判据的 import 闭包（L-15 新骨架：kernel 只剩 14 个 L0 零件，读表辅助已收进 tools/accept/lib/）。
  // 只许"临时根 + 常量相对路径"写（S12-2，李白 11-17 裁定三），所以逐条按字面路径复制，不用变量拼路径。
  mkdirSync(join(dir, 'server-plugin/kernel/handles'), { recursive: true });
  mkdirSync(join(dir, 'server-plugin/kernel/validate'), { recursive: true });
  // 协议标记句柄叶子与 S13 正则叶子（S1-1 卡 A 合并为 handles.mjs）：validate/types.mjs、rx.mjs 的闭包都从这里取定义源。
  cpSync(join(ROOT, 'server-plugin/kernel/handles.mjs'), join(dir, 'server-plugin/kernel/handles.mjs'));
  cpSync(join(ROOT, 'server-plugin/kernel/validate/types.mjs'), join(dir, 'server-plugin/kernel/validate/types.mjs'));
  cpSync(join(ROOT, 'server-plugin/kernel/det-math.mjs'), join(dir, 'server-plugin/kernel/det-math.mjs'));
  cpSync(join(ROOT, 'server-plugin/kernel/rx.mjs'), join(dir, 'server-plugin/kernel/rx.mjs'));
  cpSync(join(ROOT, 'server-plugin/kernel/errors.mjs'), join(dir, 'server-plugin/kernel/errors.mjs'));
  cpSync(join(ROOT, 'server-plugin/kernel/named-structs.mjs'), join(dir, 'server-plugin/kernel/named-structs.mjs'));
  cpSync(join(ROOT, 'server-plugin/kernel/bytes.mjs'), join(dir, 'server-plugin/kernel/bytes.mjs'));
  // 放进来的 kernel 文件要在两处登记里站得住：成员闭集清单（E-FILE-UNASSIGNED，S19）与 S10 的常数登记豁免表。
  cpSync(join(ROOT, 'server-plugin/kernel/files.json'), join(dir, 'server-plugin/kernel/files.json'));
  // 卷六 S6-2 的规则表一支（data_shape entityKey）读统一加载器唯一登记 world/rules/registry.json 的全部登记行（经 tools/accept/lib/rules.mjs 的 readRules）：
  // 临时仓库带上登记、登记所指的全部表（含 kernel-constants.json，S10 豁免登记），登记缺失或所指文件不存在会报 E-ACC-ITEM-PARAM。
  cpSync(join(ROOT, 'world/rules/registry.json'), join(dir, 'world/rules/registry.json'));
  cpSync(join(ROOT, 'world/rules/tables'), join(dir, 'world/rules/tables'), { recursive: true });
  cpSync(join(ROOT, 'tests/accept/bypass'), join(dir, 'tests/accept/bypass'), {
    recursive: true,
    filter: (src) => extname(src) === '' || extname(src) === '.txt' || extname(src) === '.json',
  });
  // 已实现条目的 impl（卷十二 §2.2 :203，登记器要求 implemented 起文件存在）：门禁目录外的（方法是测试的条目的测试文件）
  // 按登记行逐个经临时根写入口放进来，登记器在临时仓库里才站得住。只放文件本身，不放它 import 的内核与世界数据（world 整份太大），
  // 所以这些条目在临时仓库里执行必不过——临时仓库的测试按条目看结果，或用条目过滤（R12-10.2）只跑要看的条目。
  for (const it of readRegistry(ROOT, 'items')) {
    if (it.state === 'registered' || !it.impl || it.impl.startsWith('tools/accept/') || existsSync(join(dir, it.impl)) || !existsSync(join(ROOT, it.impl))) continue;
    writeUnderTempRoot(dir, it.impl, readFileSync(join(ROOT, it.impl)));
  }
  // 卷二十七 R27-8.1（vol27.A27-8.1.b，seed_sites 双向比对，C0 升必过）：登记表每一行指向的抽取点源文件要在临时仓库里，
  // 否则“登记行在源码里找不到对应调用点”必报；只放登记行点名的文件本身，经临时根写入口逐个放入。
  const seedRows = JSON.parse(readFileSync(join(ROOT, 'world/rules/tables/seed-keys.json'), 'utf8')).rows;
  for (const e of (seedRows.find((r) => r.key === 'entries') || { value: [] }).value) {
    const rel = e.file.startsWith('server-plugin/') ? e.file : `server-plugin/${e.file}`;
    if (!existsSync(join(dir, rel)) && existsSync(join(ROOT, rel))) writeUnderTempRoot(dir, rel, readFileSync(join(ROOT, rel)));
  }
  // 语法树判（lib/ast.mjs）跨文件折叠 import 来的常量（如 ledger.mjs 的 TERMINATED_KEY）：被引文件不在临时仓库，折叠不出就多报“动态下标”，命中不再是基线的子集。
  // 清单放数据（temp-repo-files.json），只列实测需要的文件，经临时根写入口逐个放入。
  for (const rel of JSON.parse(readFileSync(join(ROOT, 'tests/accept/temp-repo-files.json'), 'utf8')).files) {
    if (!existsSync(join(dir, rel)) && existsSync(join(ROOT, rel))) writeUnderTempRoot(dir, rel, readFileSync(join(ROOT, rel)));
  }
  return dir;
}
