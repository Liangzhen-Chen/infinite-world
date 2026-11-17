// 推进钩子 sortKey 的离线生成器（卷十一 R11-3.14 算法；块 2 体检 K2-24：tools/ 下离线生成器写入 state-owners.json，不许手填）。
// 算法只有一份：kernel/load/state-owners.mjs 的 assignSortKeys，合并器加载时用同一函数重算比对。
// 用法：node tools/gen-sort-keys.mjs          按 after 重算并在有变化时改写 world/ontology/state-owners.json
//       node tools/gen-sort-keys.mjs --check  只比对，有变化退出码 1，不写盘

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assignSortKeys } from '../server-plugin/kernel/load/state-owners.mjs';
import { parseJsonStrict } from '../server-plugin/kernel/load/json-text.mjs';
import { repoRoot, safeSegment } from './path-segment.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * 按 R11-3.14 给每个推进钩子写 sortKey，返回新对象与是否有变化；after 成环、指向别的相位或不存在的钩子、同名钩子即抛错。
 * @param {any} decl 已解析的 state-owners.json（不改动入参）
 * @returns {{decl: any, changed: string[]}} changed：值有变化的钩子（"<钩子>: 旧 → 新"）
 */
export function applySortKeys(decl) {
  const out = structuredClone(decl);
  const { keys, problems } = assignSortKeys(out.systems);
  if (problems.length) throw new Error(`sortKey generation failed: ${problems.join('; ')}`);
  const changed = [];
  for (const sys of Object.keys(isObj(out.systems) ? out.systems : {})) {
    const ph = isObj(out.systems[sys]) ? out.systems[sys].phase : undefined;
    if (!isObj(ph)) continue;
    for (const hook of Object.keys(ph)) {
      if (ph[hook].sortKey !== keys.get(hook)) changed.push(`${hook}: ${ph[hook].sortKey} → ${keys.get(hook)}`);
      ph[hook].sortKey = keys.get(hook);
    }
  }
  return { decl: out, changed };
}

/**
 * 声明表的写法：短的对象与数组紧凑写在一行，长的逐项换行、一格缩进。确定性：同输入同输出。
 * @param {any} v @param {string} [pad]
 * @returns {string}
 */
export function formatDecl(v, pad = '') {
  const flat = JSON.stringify(v);
  if (!v || typeof v !== 'object' || (pad !== '' && flat.length <= 160)) return flat;
  const inner = pad + ' ';
  const items = Array.isArray(v) ? v.map((x) => inner + formatDecl(x, inner)) : Object.keys(v).map((k) => `${inner}${JSON.stringify(k)}: ${formatDecl(v[k], inner)}`);
  const [open, close] = Array.isArray(v) ? ['[', ']'] : ['{', '}'];
  return items.length ? `${open}\n${items.join(',\n')}\n${pad}${close}` : `${open}${close}`;
}

function main(argv) {
  const file = join(repoRoot(), 'world', 'ontology', 'state-owners.json');
  const parsed = parseJsonStrict(readFileSync(file, 'utf8'));
  if (parsed.errors.length) throw new Error(`state-owners.json does not parse: ${JSON.stringify(parsed.errors[0])}`);
  const { decl, changed } = applySortKeys(parsed.value);
  if (argv.includes('--check')) {
    process.stdout.write(changed.length ? `sortKey drift: ${changed.join('; ')}\n` : 'sortKey up to date\n');
    return changed.length ? 1 : 0;
  }
  // 写入路径写成 仓库根＋常量前导段＋校验函数尾段（卷十二 S12-2 可证明在 §2.11 之外）。
  if (changed.length) writeFileSync(join(repoRoot(), 'world', 'ontology', safeSegment('state-owners.json')), formatDecl(decl) + '\n');
  process.stdout.write(changed.length ? `rewrote sortKey: ${changed.join('; ')}\n` : 'sortKey up to date\n');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
