// 统一加载器（卷二 §1.1 文件布局、§4.1）：读规则表（经 rules.mjs 按登记读）、维度表目录与公共表、声明表里本卷要用的登记，
// 交校验器跑 L0–L3，再按登记查规则表的类型与取值域。任一 error 即加载失败（ok 为假）。只按目录、文件名约定与登记读，不认任何具体表。

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseJsonStrict } from './json-text.mjs';
import { readRules, checkRules, rulesReport, ruleTable } from './rules.mjs';
import { validateDimensions } from '../validate/dimensions-validate.mjs';

export const LAYOUT = Object.freeze({
  dimensionsDir: 'world/ontology/dimensions',
  units: '_units.json',
  vocab: '_vocab.json',
  effects: '_effects.json',
  stateOwners: 'world/ontology/state-owners.json',
  // 内核常数表在 engine.rules 下的表代号（卷二 S10 登记豁免表；登记行见 world/rules/registry.json）。
  constants: 'kernelConstants',
});

const readText = (p) => readFileSync(p, 'utf8');

export function loadWorld(root, opts = {}) {
  const dir = join(root, opts.dimensionsDir || LAYOUT.dimensionsDir);
  const read = readRules(root, { rulesDir: opts.rulesDir });
  const head = rulesReport(read.errors);
  if (!head.ok) return { ok: false, errors: head.errors, text: head.text, coverage: '', rules: read.rules };
  // 校验器自己的上限取自内核常数表；登记了该表时缺键即加载失败（不设缺省）。
  const constants = ruleTable(read.rules, LAYOUT.constants);
  const need = (k) => { if (!Number.isInteger(constants[k])) throw new Error(`E-DIM-STRUCT-FIELD rules.${LAYOUT.constants}: ${k} missing`); return constants[k]; };
  const declPath = join(root, LAYOUT.stateOwners);
  const decl = existsSync(declPath) ? parseJsonStrict(readText(declPath)).value || {} : {};
  const names = readdirSync(dir).filter((n) => n.endsWith('.json')).sort();
  const sources = {
    units: readText(join(dir, LAYOUT.units)),
    vocab: readText(join(dir, LAYOUT.vocab)),
    effects: names.includes(LAYOUT.effects) ? readText(join(dir, LAYOUT.effects)) : undefined,
    tables: names.filter((n) => !n.startsWith('_')).map((file) => ({ file, text: readText(join(dir, file)) })),
  };
  const report = validateDimensions(sources, {
    namespaces: opts.namespaces || ['core'],
    // §1.5 string 行要求的 state-owners "display 集合"还没有机读键（声明表的 display 键是客户端模块组），暂为空集，见 docs/问题.md。
    displaySet: [],
    ns: Array.isArray(decl.rxNamespaces) ? decl.rxNamespaces : [],
    limits: { extendsMaxDepth: need('extendsMaxDepth'), rxMaxDepth: need('rxMaxDepth') },
  });
  const tail = rulesReport(checkRules(read, report.env));
  return { ...report, ok: report.ok && tail.ok, errors: [...report.errors, ...tail.errors], text: tail.text + report.text, rules: read.rules };
}
