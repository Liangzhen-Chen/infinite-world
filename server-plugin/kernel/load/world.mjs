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
import { installStorage } from '../storage.mjs';
import { finalizeInputs, inputsBySystem, resetFinalized } from '../declare.mjs';
import { codeOf } from '../errors.mjs';
import { checkLedgerTables, checkSubjectFlagDims } from '../ledger.mjs';
import { checkClockTables, checkHookCadence, installScheduler } from '../scheduler.mjs';
import { installFixedConstants, installExpTable } from '../det-math.mjs';
import { installSampleConstants, installSampleDistributions } from '../sample.mjs';

export const LAYOUT = Object.freeze({
  dimensionsDir: 'world/ontology/dimensions',
  units: '_units.json',
  vocab: '_vocab.json',
  effects: '_effects.json',
  // 冻结分布表（卷二 §1.10 :324–:325；卷二十七 R27-5.2）：与 _units.json 同目录、同一种读法，读入后装配到内核。
  distributions: '_distributions.json',
  stateOwners: 'world/ontology/state-owners.json',
  // 内核常数表在 engine.rules 下的表代号（卷二 S10 登记豁免表；登记行见 world/rules/registry.json）。
  constants: 'kernelConstants',
});

const readText = (p) => readFileSync(p, 'utf8');

/**
 * @param {string} root 仓库根
 * @param {{dimensionsDir?: string, rulesDir?: string, namespaces?: string[]}} [opts]
 */
export function loadWorld(root, opts = {}) {
  const dir = join(root, opts.dimensionsDir || LAYOUT.dimensionsDir);
  const read = readRules(root, { rulesDir: opts.rulesDir });
  const head = rulesReport(read.errors);
  if (!head.ok) return { ok: false, errors: head.errors, text: head.text, coverage: '', rules: read.rules };
  // 校验器自己的上限取自内核常数表；登记了该表时缺键即加载失败（不设缺省）。
  const constants = ruleTable(read.rules, LAYOUT.constants);
  const need = (k) => { if (!Number.isInteger(constants[k])) throw new Error(`E-DIM-STRUCT-FIELD rules.${LAYOUT.constants}: ${k} missing`); return constants[k]; };
  const needDigits = (k) => { if (typeof constants[k] !== 'string' || !constants[k]) throw new Error(`E-DIM-STRUCT-FIELD rules.${LAYOUT.constants}: ${k} missing`); return constants[k]; };
  // 定点标度常数只从规则表来（卷二 S10 登记豁免表）：校验维度前收下，det-math 的全部算术读它（李白 11-18 08:20 第 2 条）。
  // fixedLn 的 W、升标度、级数项数与 LN2 同表登记（卷二 §3.3 :1335–:1339）；缺键与上面同一种方式拒。
  installFixedConstants({
    BASE: need('BASE'), SCALE: need('SCALE'), PERMILLE: need('PERMILLE'), BPS: need('BPS'),
    fixedLnWorkExponent: need('fixedLnWorkExponent'), fixedLnInputExponent: need('fixedLnInputExponent'),
    fixedLnSeriesTerms: need('fixedLnSeriesTerms'), LN2: needDigits('LN2'),
  });
  // 骰值键限定成分个数上限也在同一张登记表（卷二 S10 :2407；卷二十七 R27-8.5 :728）：缺键照上面同一方式拒，
  // 读到了就交给 kernel/sample.mjs（§2.7 :579 kernelApi sample），sample/diceKeyOf 运行期才拿得到上限。
  need('diceKeyMaxQualifiers');
  installSampleConstants(read.rules);
  // 冻结分布表与 _units.json 同目录、同一种读法（卷二 §1.10 :324–:325）：读入后交内核 det-math（exp 表）与 sample（分位数表）。
  // 只在文件存在时装配；校验器夹具目录没有这张表，用到 normal/lognormal/fixedExp 时由内核报缺少表，不静默给值。
  const distPath = join(dir, LAYOUT.distributions);
  if (existsSync(distPath)) {
    const dist = parseJsonStrict(readText(distPath));
    if (dist.errors.length) throw new Error(`E-DIM-STRUCT-FIELD ${LAYOUT.distributions}: ${dist.errors[0].code} at ${dist.errors[0].pointer}`);
    installExpTable(dist.value && dist.value.expTable);
    installSampleDistributions(dist.value);
  }
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
  // 账本的资源种类表、ledger.json 与本卷词表条目的跨字段校验（卷六 §2.1、§2.2、§2.5；字段含义只在 kernel/ledger.mjs 读，A6-1.1）。
  // 声明表合并与核对（卷二 §2.7；state-owners.json 的 L0 语法错误一并报出）。
  const families = report.vocab && report.vocab.families ? [...report.vocab.families.keys()] : [];
  // 可终止实体类（卷二 §2.6 :516）：实体表的类别行写了 termination（整表一致由校验器另核）。
  const terminableKinds = [...report.tables].filter(([, t]) => t.doc && t.doc.classes && typeof t.doc.classes === 'object' && Object.values(t.doc.classes).some((c) => c && typeof c === 'object' && c.termination !== undefined)).map(([k]) => k);
  const tableDims = new Map([...report.tables].map(([k, t]) => [k, t.doc && t.doc.dimensions ? t.doc.dimensions : {}]));
  const owners = mergeStateOwners(decl, { units: report.env.units, kinds: new Set(report.tables.keys()), families: new Set(families), terminableKinds, tableDims });
  // rules.clock 与 due_kind、reaction_priority 条目的加载校验（卷二十 §2.1；字段含义只在 kernel/scheduler.mjs 读）；
  // cadence/phaseOffset 按声明表的钩子逐个查（§2.1 :130，E-CLOCK-CADENCE，块 4-2），所以排在声明表合并之后。
  // 持有人主体标记维度的表头登记（卷二 §5.6 ledgerHolder；卷六 §2.1 holder），该 kind 的表载入了才查。
  const domain = report.env ? [...checkLedgerTables(read.rules, report.env), ...checkSubjectFlagDims(report.tables),...checkClockTables(read.rules, report.env), ...checkHookCadence(read.rules, owners.merged.hooks)] : [];
  const tail = rulesReport([...checkRules(read, report.env), ...domain]);
  const syntax = (parsed.errors || []).map((e) => ({ code: e.code, severity: 'error', level: 'L0', table: 'state-owners', row: '', dim: '', path: `#${e.pointer}`, got: e.got, want: e.want }));
  // 依赖声明定稿（卷二 §2.3 :470–471、§2.7 :828）：机器生成 dim:<kind> 与 modified:<kind>，对 uses 做传递闭包，写回 systems[*].inputs。
  const deps = report.ok && tail.ok && owners.ok && syntax.length === 0 ? finalizeDeps(report.tables, decl.systems) : { errors: [], systems: undefined };
  const ok = report.ok && tail.ok && owners.ok && syntax.length === 0 && deps.errors.length === 0;
  // 校验全部通过后收下注册表与句柄 V、E、P（kernel/vocab.mjs、kernel/handles/generated.mjs）；任一失败不收，句柄保持原值。
  if (ok) {
    installVocab(report);
    installHandles({ vocab: report.vocab, decl, ledgerPaths: owners.merged.ledgerPaths });
    installStorage(owners.merged); // readPath/writePath 运行期核对用的声明表合并结果（kernel/storage.mjs，块 2 第 2-3 张）
    installScheduler(read.rules); // schedule 入堆缩放读 rules.clock（kernel/scheduler.mjs，块 4 第 4-2 张）
    owners.merged.systems = deps.systems;
  }
  const syntaxText = syntax.map((e) => `${e.code}  ${e.table}/.  got ${JSON.stringify(e.got)}  want ${e.want}  - ${e.path}\n`).join('');
  const depsText = deps.errors.map((e) => `${e.code}  ${e.table}/.  got ${JSON.stringify(e.got)}  want ${e.want}  - ${e.path}\n`).join('');
  return {
    ...report, ok, errors: [...report.errors, ...tail.errors, ...syntax, ...owners.errors, ...deps.errors], text: tail.text + report.text + syntaxText + owners.text + depsText,
    rules: read.rules, owners: owners.merged,
  };
}

// `dim:<kind>` = `created.<前缀>*.props`（该表 idPrefix 逐个）∪ 该表 derived 用到的 relation 的闭包；`modified:<kind>` = `dim:<kind>` ∪ `modifiers` ∪ `statuses`
// ∪ 该表修正项用到的 scope 的闭包（卷二 §2.3 :470 末句）。derived 公式的编译与修正项的作用域收集尚未建（kernel/validate 头注），两处闭包暂为空，见回报。
// `modifiers`、`statuses` 是卷文写明的协议状态键（:470；与 load/state-owners.mjs PROTOCOL_KEYS 同一出处 :519）。
const MODIFIED_KEYS = Object.freeze(['modifiers', 'statuses']);

function finalizeDeps(tables, systems) {
  const generated = new Map();
  for (const [kind, t] of tables) {
    const entity = t.doc && t.doc.entity && typeof t.doc.entity === 'object' ? t.doc.entity : {};
    const prefixes = Array.isArray(entity.idPrefix) ? entity.idPrefix : [];
    generated.set(kind, { dim: { own: prefixes.map((p) => `created.${p}*.props`), uses: [] }, modified: { own: [...MODIFIED_KEYS], uses: [] } });
  }
  try {
    resetFinalized();
    finalizeInputs(generated);
    const bySystem = inputsBySystem(systems);
    const out = {};
    for (const [name, s] of Object.entries(systems && typeof systems === 'object' ? systems : {})) out[name] = { ...s, inputs: bySystem.get(name) };
    return { errors: [], systems: out };
  } catch (e) {
    const code = codeOf(e);
    if (code === null) throw e;
    return { errors: [{ code, severity: 'error', level: 'L2', table: 'declare', row: '', dim: '', path: 'declareInputs', got: e.message, want: 'acyclic dependency declarations over declared nodes' }], systems: undefined };
  }
}
