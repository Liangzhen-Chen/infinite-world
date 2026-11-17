// 统一加载器（卷二 §1.1 文件布局、§4.1）：读规则表（经 rules.mjs 按登记读）、维度表目录与公共表、声明表里本卷要用的登记，
// 交校验器跑 L0–L3，再按登记查规则表的类型与取值域，并经声明表合并器（state-owners.mjs）核对 state-owners.json。
// 任一 error 即加载失败（ok 为假）；全部通过才收下注册表与句柄 V、E、P。只按目录、文件名约定与登记读，不认任何具体表。

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseJsonStrict } from './json-text.mjs';
import { readRules, checkRules, rulesReport, ruleTable } from './rules.mjs';
import { validateDimensions } from '../validate/dimensions-validate.mjs';
import { mergeStateOwners } from './state-owners.mjs';
import { installVocab } from '../vocab.mjs';
import { installHandles } from '../handles/generated.mjs';

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
  const parsed = existsSync(declPath) ? parseJsonStrict(readText(declPath)) : { value: {}, errors: [] };
  const decl = parsed.value || {};
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
  // 声明表合并与核对（卷二 §2.7；state-owners.json 的 L0 语法错误一并报出）。
  const families = report.vocab && report.vocab.families ? [...report.vocab.families.keys()] : [];
  const owners = mergeStateOwners(decl, { units: report.env.units, kinds: new Set(report.tables.keys()), families: new Set(families) });
  const syntax = (parsed.errors || []).map((e) => ({ code: e.code, severity: 'error', level: 'L0', table: 'state-owners', row: '', dim: '', path: `#${e.pointer}`, got: e.got, want: e.want }));
  const ok = report.ok && tail.ok && owners.ok && syntax.length === 0;
  // 校验全部通过后收下注册表与句柄 V、E、P（kernel/vocab.mjs、kernel/handles/generated.mjs）；任一失败不收，句柄保持原值。
  if (ok) {
    installVocab(report);
    installHandles({ vocab: report.vocab, decl, ledgerPaths: owners.merged.ledgerPaths });
  }
  const syntaxText = syntax.map((e) => `${e.code}  ${e.table}/.  got ${JSON.stringify(e.got)}  want ${e.want}  — ${e.path}\n`).join('');
  return {
    ...report, ok, errors: [...report.errors, ...tail.errors, ...syntax, ...owners.errors], text: tail.text + report.text + syntaxText + owners.text,
    rules: read.rules, owners: owners.merged,
  };
}
