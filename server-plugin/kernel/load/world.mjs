// 统一加载器（卷二 §1.1 文件布局、§4.1）：读维度表目录与公共表、内核常数表与声明表里本卷要用的登记，交校验器跑 L0–L3。
// 任一 error 即加载失败（ok 为假）。只按目录与文件名约定读，不认任何具体表。

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseJsonStrict } from './json-text.mjs';
import { validateDimensions } from '../validate/dimensions-validate.mjs';

export const LAYOUT = Object.freeze({
  dimensionsDir: 'world/ontology/dimensions',
  units: '_units.json',
  vocab: '_vocab.json',
  effects: '_effects.json',
  constants: 'world/rules/tables/kernel-constants.json',
  stateOwners: 'world/ontology/state-owners.json',
});

const readText = (p) => readFileSync(p, 'utf8');

// 内核常数表：{"rows": [{"key", "value", …}]}；按键取值，缺键即加载失败（不设缺省）。
export function readConstants(text) {
  const { value, errors } = parseJsonStrict(text);
  if (errors.length || !value || !Array.isArray(value.rows)) throw new Error('E-DIM-STRUCT-FIELD kernel-constants.json: {"rows": [...]} expected');
  const out = Object.create(null);
  for (const r of value.rows) out[r.key] = r.value;
  return out;
}

export function loadWorld(root, opts = {}) {
  const dir = join(root, opts.dimensionsDir || LAYOUT.dimensionsDir);
  const constants = readConstants(readText(join(root, LAYOUT.constants)));
  const need = (k) => { if (!Number.isInteger(constants[k])) throw new Error(`E-DIM-STRUCT-FIELD kernel-constants.json: ${k} missing`); return constants[k]; };
  const declPath = join(root, LAYOUT.stateOwners);
  const decl = existsSync(declPath) ? parseJsonStrict(readText(declPath)).value || {} : {};
  const names = readdirSync(dir).filter((n) => n.endsWith('.json')).sort();
  const sources = {
    units: readText(join(dir, LAYOUT.units)),
    vocab: readText(join(dir, LAYOUT.vocab)),
    effects: names.includes(LAYOUT.effects) ? readText(join(dir, LAYOUT.effects)) : undefined,
    tables: names.filter((n) => !n.startsWith('_')).map((file) => ({ file, text: readText(join(dir, file)) })),
  };
  return validateDimensions(sources, {
    namespaces: opts.namespaces || ['core'],
    // §1.5 string 行要求的 state-owners "display 集合"还没有机读键（声明表的 display 键是客户端模块组），暂为空集，见 docs/问题.md。
    displaySet: [],
    ns: Array.isArray(decl.rxNamespaces) ? decl.rxNamespaces : [],
    limits: { extendsMaxDepth: need('extendsMaxDepth'), rxMaxDepth: need('rxMaxDepth') },
  });
}
