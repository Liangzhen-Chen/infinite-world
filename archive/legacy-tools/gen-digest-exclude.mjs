// 存档摘要排除表的离线生成器（卷二 §2.9 第 3 条 :1137、:824–826；卷一 §8.3 :644；卷二十七 R27-5.8；体检 K2-04）。
// 排除表 = state-owners.json 各顶层键的 display 字段集合 ∪ displayNames.* ∪ playerNotes.*；生成规则只有一份：kernel/save.mjs 的 digestExcludeDoc，
// 读档前 kernel/load/save.mjs loadDigestExclude 用同一函数重算并与入库文件比对（E-DIGEST-EXCLUDE-DRIFT）。入库文件取代旧的手写表，不许手改。
// 用法：node tools/gen-digest-exclude.mjs          重新生成并在有变化时改写 world/rules/tables/digest-exclude.json
//       node tools/gen-digest-exclude.mjs --check  只比对，不一致退出码 1（E-DIGEST-EXCLUDE-DRIFT），不写盘

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadWorld } from '../server-plugin/kernel/load/world.mjs';
import { parseJsonStrict } from '../server-plugin/kernel/load/json-text.mjs';
import { digestExcludeDoc } from '../server-plugin/kernel/save.mjs';
import { canonicalEqual } from '../server-plugin/kernel/storage.mjs';
import { repoRoot, safeSegment } from './path-segment.mjs';

/**
 * 生成文件的写法：两格以内的短对象一行，paths 逐项一行。同输入同输出。
 * @param {{generatedBy: string, rule: string, paths: string[]}} doc
 * @returns {string}
 */
export function formatExclude(doc) {
  const paths = doc.paths.map((p) => `  ${JSON.stringify(p)}`).join(',\n');
  return `{\n "generatedBy": ${JSON.stringify(doc.generatedBy)},\n "rule": ${JSON.stringify(doc.rule)},\n "paths": [\n${paths}\n ]\n}\n`;
}

/**
 * 按仓库里的声明表生成排除表内容；声明表加载不过即抛错（不生成半截表）。
 * @param {string} root
 */
export function generate(root) {
  const r = loadWorld(root);
  if (!r.ok) throw new Error(`loadWorld failed; cannot generate digest exclude table:\n${r.text}`);
  return digestExcludeDoc(r.owners);
}

function main(argv) {
  const root = repoRoot();
  const want = generate(root);
  const file = join(root, 'world', 'rules', 'tables', 'digest-exclude.json');
  const got = existsSync(file) ? parseJsonStrict(readFileSync(file, 'utf8')).value : undefined;
  const same = got !== undefined && canonicalEqual(got, want);
  if (argv.includes('--check')) {
    process.stdout.write(same ? 'digest exclude table up to date\n' : 'E-DIGEST-EXCLUDE-DRIFT world/rules/tables/digest-exclude.json differs from the generated table\n');
    return same ? 0 : 1;
  }
  // 写入路径写成 仓库根＋常量前导段＋校验函数尾段（卷十二 S12-2 可证明在 §2.11 之外，同 tools/gen-sort-keys.mjs）。
  if (!same) writeFileSync(join(repoRoot(), 'world', 'rules', 'tables', safeSegment('digest-exclude.json')), formatExclude(want));
  process.stdout.write(same ? 'unchanged\n' : 'written\n');
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) process.exitCode = main(process.argv.slice(2));
