// state 类型声明的离线生成器（卷二 §2.8 第 1 条末句："state 的 JSDoc 类型由 state-owners pathTypes 生成（kernel/state-types.d.ts），不是 any"）。
// 只读 world/ontology/state-owners.json 的 pathTypes，按 §2.7 pathTypes 文法逐条换成类型；入库生成文件由测试比对漂移，不手改。
// 用法：node tools/gen-state-types.mjs          重写 server-plugin/kernel/state-types.d.ts
//       node tools/gen-state-types.mjs --check  只比对，不一致退出码 1，不写盘

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseJsonStrict } from '../server-plugin/kernel/load/json-text.mjs';
import { repoRoot, safeSegment } from './path-segment.mjs';

const sorted = (xs) => [...xs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const lit = (s) => `'${s}'`;

/**
 * pathTypes 的一个值类型 → TypeScript 类型（§2.7 文法；合并器已拒收不合文法的值，这里遇到即抛错）。
 * @param {string} t
 * @returns {string}
 */
export function tsTypeOf(t) {
  const list = /^list<(?<item>.+)>$/.exec(t);
  if (list) return `readonly (${tsTypeOf(list.groups.item)})[]`;
  if (/^(number|integer):/.test(t)) return 'number';
  const ref = /^ref:(?<kind>[a-z][a-z0-9_]*)$/.exec(t);
  if (ref) return `EntityId<${lit(ref.groups.kind)}>`;
  const en = /^enum:(?<family>[a-z][a-z0-9_]*)$/.exec(t);
  if (en) return `Handle<${lit(en.groups.family)}>`;
  const st = /^struct:(?<name>[a-zA-Z][a-zA-Z0-9_<>]*)$/.exec(t);
  if (st) return `StructValue<${lit(st.groups.name)}>`;
  const plain = { boolean: 'boolean', dimension: 'DimensionValue', sealed: 'SealedValue', EventId: 'EventId' };
  if (Object.hasOwn(plain, t)) return plain[t];
  throw new Error(`pathTypes value ${JSON.stringify(t)} outside the §2.7 grammar`);
}

// 模式树：字面段一个子节点，`*` 段一个子节点。
function treeOf(pathTypes) {
  const root = { lits: new Map(), star: null, value: null };
  for (const p of sorted(Object.keys(pathTypes))) {
    let n = root;
    for (const s of p.split('.')) {
      if (s === '*') n = n.star || (n.star = { lits: new Map(), star: null, value: null });
      else { if (!n.lits.has(s)) n.lits.set(s, { lits: new Map(), star: null, value: null }); n = n.lits.get(s); }
    }
    n.value = tsTypeOf(pathTypes[p]);
  }
  return root;
}

// 节点 → 类型：叶子取值类型；字面子节点写成可选只读属性；`*` 子节点写成索引签名，其值类型并上同层字面子节点的类型（索引签名须兼容同层属性）。
function render(n, pad) {
  const parts = [];
  const inner = pad + '  ';
  if (n.value) parts.push(n.value);
  const litTypes = [...n.lits].map(([k, c]) => [k, render(c, inner)]);
  if (litTypes.length) parts.push(`{\n${litTypes.map(([k, t]) => `${inner}readonly ${k}?: ${t};`).join('\n')}\n${pad}}`);
  if (n.star) {
    const starType = [render(n.star, inner), ...litTypes.map(([, t]) => t)];
    parts.push(`{ readonly [segment: string]: ${starType.length > 1 ? starType.map((t) => `(${t})`).join(' | ') : starType[0]} }`);
  }
  return parts.length ? parts.join(' & ') : 'never';
}

/**
 * 由 state-owners.json 生成 state-types.d.ts 全文。
 * @param {{pathTypes?: Record<string, string>}} decl
 * @returns {string}
 */
export function renderStateTypes(decl) {
  const pathTypes = decl && decl.pathTypes && typeof decl.pathTypes === 'object' ? decl.pathTypes : {};
  const lines = [
    '// 生成文件，勿手改：tools/gen-state-types.mjs 由 world/ontology/state-owners.json 的 pathTypes 生成（卷二 §2.8 第 1 条末句）。',
    '// 改 pathTypes 后重跑 node tools/gen-state-types.mjs；tests/kernel/state-owners.test.mjs 比对本文件与生成结果。',
    '',
    "import type { Handle, EntityId, EventId } from './types.d.ts';",
    '',
    '/** dimension 路径的值：按该维度表声明（§1.5 维度类型；string 维度不进 dimension 路径，§2.7）。 */',
    'export type DimensionValue = number | boolean | null | Handle<string> | EntityId<string> | readonly DimensionValue[] | { readonly [field: string]: DimensionValue };',
    '/** 命名 struct（§1.5 命名 struct 登记）；字段类型待命名 struct 有机读登记后生成，现只带名字。 */',
    'export type StructValue<N extends string> = { readonly [field: string]: unknown } & { readonly __struct?: N };',
    '/** textPaths 的封装值（§2.9 第 3 条）；Sealed 本身的声明不在规则层可见的文件里，这里只作不透明占位。 */',
    "export type SealedValue = { readonly __brand: 'SealedValue' };",
    '',
    '/** pathTypes 每条模式的值类型。 */',
    'export interface PathTypes {',
    ...sorted(Object.keys(pathTypes)).map((p) => `  readonly ${lit(p)}: ${tsTypeOf(pathTypes[p])};`),
    '}',
    '',
    '/** 模式 P 在 pathTypes 里声明的值类型（§2.6 第 1 条 PathValue<P>）。 */',
    'export type PathValue<P extends keyof PathTypes> = PathTypes[P];',
    '',
    '/** state 的形状：按 pathTypes 各模式展开，`*` 段为索引签名。 */',
    `export type State = ${render(treeOf(pathTypes), '')};`,
    '',
  ];
  return lines.join('\n');
}

function main(argv) {
  const parsed = parseJsonStrict(readFileSync(join(repoRoot(), 'world', 'ontology', 'state-owners.json'), 'utf8'));
  if (parsed.errors.length) throw new Error(`state-owners.json does not parse: ${JSON.stringify(parsed.errors[0])}`);
  const text = renderStateTypes(parsed.value);
  const target = join(repoRoot(), 'server-plugin', 'kernel', 'state-types.d.ts');
  let current = null;
  try { current = readFileSync(target, 'utf8'); } catch { current = null; }
  if (argv.includes('--check')) {
    process.stdout.write(current === text ? 'state-types.d.ts up to date\n' : 'state-types.d.ts drifted from pathTypes\n');
    return current === text ? 0 : 1;
  }
  // 写入路径写成 仓库根＋常量前导段＋校验函数尾段（卷十二 S12-2 可证明在 §2.11 之外）。
  if (current !== text) writeFileSync(join(repoRoot(), 'server-plugin', 'kernel', safeSegment('state-types.d.ts')), text);
  process.stdout.write(current === text ? 'state-types.d.ts up to date\n' : 'rewrote state-types.d.ts\n');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
