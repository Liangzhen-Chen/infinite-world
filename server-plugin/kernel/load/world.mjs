// 统一加载器（卷二 §1.1 文件布局、§4.1）：读规则表（经 rules.mjs 按登记读）、维度表目录与公共表、声明表里本卷要用的登记，
// 交校验器跑 L0–L3，再按登记查规则表的类型与取值域，并经声明表合并器（state-owners.mjs）核对 state-owners.json。
// 任一 error 即加载失败（ok 为假）；全部通过才收下注册表与句柄 V、E、P。只按目录、文件名约定与登记读，不认任何具体表。

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { checkCalendarClimateTables } from '../calendar.mjs';
import { prepareWeatherRx, installWeather } from '../weather.mjs';
import { installFixedConstants, installExpTable } from '../det-math.mjs';
import { installSampleConstants, installSampleDistributions } from '../sample.mjs';
import { installByteConstants } from '../bytes.mjs';
import { checkVerbRows } from '../events.mjs';
import { checkHoldingKindRows } from '../holdings.mjs';
import { checkTerminationTables, installTermination, TERMINATE_RULES_TABLE } from '../terminate.mjs';
import { installDelegations } from '../transaction.mjs';
import { checkPlaceTable } from '../place.mjs';
import { checkItemTables, checkItemClasses } from '../item.mjs';
import { checkItemStateTables } from '../item-state.mjs';
import { checkRecipeTable } from '../recipe.mjs';
import { checkValuationTables } from '../valuation.mjs';
import { checkPriceTables } from '../validate/price-tables.mjs';
import { checkBodyTables } from '../validate/body-tables.mjs';
import { installNamedStructs } from '../named-structs.mjs';

export const LAYOUT = Object.freeze({
  dimensionsDir: 'world/ontology/dimensions',
  units: '_units.json',
  vocab: '_vocab.json',
  effects: '_effects.json',
  // 冻结分布表（卷二 §1.10 :324–:325；卷二十七 R27-5.2）：与 _units.json 同目录、同一种读法，读入后装配到内核。
  distributions: '_distributions.json',
  // 未建派生登记（卷二 §1.12 封卷后勘误 1118k23）：加载器读，与维度表同目录、下划线前缀，不当维度表。
  unbuiltDerived: '_unbuilt-derived.json',
  stateOwners: 'world/ontology/state-owners.json',
  // 效果族行引用闭合要核的原语目录（卷二 §3.9 :1479：`op` 是 primitives.json 的原语）；文件不存在时不交，效果族的原语输出一律被拒。
  primitives: 'world/ontology/primitives.json',
  // 命名 struct 登记（卷二 §1.5 :252 struct:pos；事件载荷 pos 的形状从这里派生，G1 记账第一条）；文件不存在时不装入。
  namedStructs: 'world/ontology/named-structs.json',
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
  // 字节与文字编解码（kernel/bytes.mjs，导入存档用）的进制与档位同表登记，缺键即拒（卷二 :1047、S10）。
  installByteConstants(constants);
  // 冻结分布表与 _units.json 同目录、同一种读法（卷二 §1.10 :324–:325）：读入后交内核 det-math（exp 表）与 sample（分位数表）。
  // 只在文件存在时装配；校验器夹具目录没有这张表，用到 normal/lognormal/fixedExp 时由内核报缺少表，不静默给值。
  const distPath = join(dir, LAYOUT.distributions);
  if (existsSync(distPath)) {
    const dist = parseJsonStrict(readText(distPath));
    if (dist.errors.length) throw new Error(`E-DIM-STRUCT-FIELD ${LAYOUT.distributions}: ${dist.errors[0].code} at ${dist.errors[0].pointer}`);
    installExpTable(dist.value && dist.value.expTable);
    installSampleDistributions(dist.value);
  }
  // 原语目录：读到即交效果族校验；JSON 语法错同冻结分布表，直接拒。
  const primitivesPath = join(root, LAYOUT.primitives);
  let primitivesDoc;
  if (existsSync(primitivesPath)) {
    const parsedCatalog = parseJsonStrict(readText(primitivesPath));
    if (parsedCatalog.errors.length) throw new Error(`E-DIM-STRUCT-FIELD ${LAYOUT.primitives}: ${parsedCatalog.errors[0].code} at ${parsedCatalog.errors[0].pointer}`);
    primitivesDoc = parsedCatalog.value;
  }
  // 命名 struct 登记：读到即交内核 named-structs.mjs（事件 payload.pos 的字段与类型从登记派生）；JSON 语法错同原语目录直接拒。
  const namedStructsPath = join(root, LAYOUT.namedStructs);
  let namedStructsDoc;
  if (existsSync(namedStructsPath)) {
    const parsedStructs = parseJsonStrict(readText(namedStructsPath));
    if (parsedStructs.errors.length) throw new Error(`E-DIM-STRUCT-FIELD ${LAYOUT.namedStructs}: ${parsedStructs.errors[0].code} at ${parsedStructs.errors[0].pointer}`);
    namedStructsDoc = parsedStructs.value;
  }
  const declPath = join(root, LAYOUT.stateOwners);
  const parsed = existsSync(declPath) ? parseJsonStrict(readText(declPath)) : { value: {}, errors: [] };
  const decl = parsed.value || {};
  const names = readdirSync(dir).filter((n) => n.endsWith('.json')).sort();
  const sources = {
    units: readText(join(dir, LAYOUT.units)),
    vocab: readText(join(dir, LAYOUT.vocab)),
    effects: names.includes(LAYOUT.effects) ? readText(join(dir, LAYOUT.effects)) : undefined,
    unbuilt: names.includes(LAYOUT.unbuiltDerived) ? readText(join(dir, LAYOUT.unbuiltDerived)) : undefined,
    tables: names.filter((n) => !n.startsWith('_')).map((file) => ({ file, text: readText(join(dir, file)) })),
  };
  const report = validateDimensions(sources, {
    namespaces: opts.namespaces || ['core'],
    // §1.5 string 行要求的 state-owners "display 集合"还没有机读键（声明表的 display 键是客户端模块组），暂为空集，见 docs/问题.md。
    displaySet: [],
    ns: Array.isArray(decl.rxNamespaces) ? decl.rxNamespaces : [],
    limits: { extendsMaxDepth: need('extendsMaxDepth'), rxMaxDepth: need('rxMaxDepth') },
    primitives: primitivesDoc && Array.isArray(primitivesDoc.primitives) ? primitivesDoc.primitives : undefined,
    // 数据档 RX 读规则表值、加载期规则分类读条件列表（卷二 §2.9 第 4 条、§1.12，封卷后勘误 1118k31）。
    rules: read.rules,
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
  const domain = report.env ? [...checkLedgerTables(read.rules, report.env), ...checkSubjectFlagDims(report.tables),...checkClockTables(read.rules, report.env), ...checkHookCadence(read.rules, owners.merged.hooks), ...checkItemStateTables(read.rules), ...checkValuationTables(read.rules, { vocab: report.vocab }), ...checkCalendarClimateTables(read.rules, report.env)] : [];
  // 词表族 weather 各行的 weightRX 文本在这里经 compileRXInScope 编（卷二 §2.9 第 4 条，卷二十 §2.5 :276）；编不过的并入 domain 报 E-MOD-RX，编好的树校验全过后交 kernel/weather.mjs。
  const weatherRx = report.env ? prepareWeatherRx(report.env) : { trees: new Map(), errors: [] };
  domain.push(...weatherRx.errors);
  // 物品行 classes 不许手写 class 族条目与材料派生组件（卷三乙 I-6；对照表第 2 行）：只读表数据，不等其他校验通过，先于卷二 §1.8 的组件类只属一张表报 E-DIM-DERIVED-WRITTEN。
  if (report.vocab && report.tables) domain.push(...writerCheckRows('item', checkItemClasses({ vocab: report.vocab, tables: report.tables }).errors));
  // 块 5 内核写者的加载期核对，违者加载失败、各用本函数已登记的码（字段含义只在各写者文件读）：verb 族与发出系统（卷二 §2.7 :774；
  // 卷二十四 R24-1.3、R24-2.1）、持有种类行（卷十八 §2.5、§2.6）、终止登记与去留表（卷二 §2.6 :526–:529）。词表收齐（report.ok）才核；
  // 词表不全时前面已经失败，不另报。终止去留表同 checkClockTables：规则目录登记了该表才核（只放内核常数表的校验器夹具目录不登记）；
  // 未登记的世界运行期调 terminate 读表即 E-RULES-UNREGISTERED 拒收，不静默放行。
  if (report.ok) {
    const view = { vocab: report.vocab, rules: read.rules, tables: report.tables };
    domain.push(...writerCheckRows('verb', checkVerbRows(view, decl).errors), ...writerCheckRows('holding_kind', checkHoldingKindRows(view).errors));
    if (Object.hasOwn(read.rules, TERMINATE_RULES_TABLE)) domain.push(...writerCheckRows('terminate', checkTerminationTables(view, decl)));
    // 地点表的树、边校验（卷五 §4.1.3 规则 1、3、4；A5-1.2；块 6 第 6-7 张）。
    domain.push(...writerCheckRows('place', checkPlaceTable({ ...view, env: report.env }).errors));
    // 物品表的行校验与类别派生（卷三乙 I-5、I-6、I-8、I-9、C-1、C-8；块 6 第 6-2 张）；派生结果挂在 item 表的 itemDerived，itemView 只读它。
    domain.push(...writerCheckRows('item', checkItemTables({ ...view, env: report.env, ns: Array.isArray(decl.rxNamespaces) ? decl.rxNamespaces : [], maxDepth: need('rxMaxDepth') }).errors));
    // 配方表的行校验（N-7、R-6 除数下界、R-7、Q-2、R-12 价值递归判环；块 6 第 6-9 张），读 itemDerived，故排在物品表校验之后；价格角色与用途行的跨字段校验（卷六 §2.2、§4.21）。
    domain.push(...writerCheckRows('recipe', checkRecipeTable(view)), ...writerCheckRows('price', checkPriceTables(view)));
    // 卷四本卷表与词表族的跨字段校验（§2.1、§2.2 身体图不变量、§2.4 条目字段、§2.7 E-BODY-*、E-SPECIES-ATTR-KEYS），违者加载失败。
    domain.push(...checkBodyTables(view, { maxChainDepth: need('bodyPartChainMaxDepth'), unbuiltFields: report.env.unbuiltFields }));
  }
  const tail = rulesReport([...checkRules(read, report.env), ...domain]);
  const syntax = (parsed.errors || []).map((e) => ({ code: e.code, severity: 'error', level: 'L0', table: 'state-owners', row: '', dim: '', path: `#${e.pointer}`, got: e.got, want: e.want }));
  // 依赖声明定稿（卷二 §2.3 :470–471、§2.7 :828）：机器生成 dim:<kind> 与 modified:<kind>，对 uses 做传递闭包，写回 systems[*].inputs。
  const deps = report.ok && tail.ok && owners.ok && syntax.length === 0 ? finalizeDeps(report.tables, decl.systems) : { errors: [], systems: undefined };
  const ok = report.ok && tail.ok && owners.ok && syntax.length === 0 && deps.errors.length === 0;
  // 校验全部通过后收下注册表与句柄 V、E、P（kernel/vocab.mjs、kernel/handles/generated.mjs）；任一失败不收，句柄保持原值。
  if (ok) {
    installVocab(report);
    if (namedStructsDoc) installNamedStructs(namedStructsDoc); // 命名 struct 登记（卷二 §1.5 :252；kernel/named-structs.mjs，G1 记账第一条）
    installHandles({ vocab: report.vocab, decl, ledgerPaths: owners.merged.ledgerPaths });
    installStorage(owners.merged); // readPath/writePath 运行期核对用的声明表合并结果（kernel/storage.mjs，块 2 第 2-3 张）
    installWeather(weatherRx.trees); // weatherAt 只读加载期编好的 weightRX 树（kernel/weather.mjs，块 6 第 6-28 张）
    installScheduler(read.rules); // schedule 入堆缩放读 rules.clock（kernel/scheduler.mjs，块 4 第 4-2 张）
    installDelegations(decl); // 写者委托登记（systems.*.writeDelegations，卷二 §2.6 第 3 条勘误 1119k16；kernel/transaction.mjs runDelegated）
    installTermination(decl); // 终止协议读声明表的 stateKeys.subjectRecords 与 systems.terminationCleanup（kernel/terminate.mjs，块 5 第 5-4 张；与 installStorage 同法）
    owners.merged.systems = deps.systems;
  }
  const syntaxText = syntax.map((e) => `${e.code}  ${e.table}/.  got ${JSON.stringify(e.got)}  want ${e.want}  - ${e.path}\n`).join('');
  const depsText = deps.errors.map((e) => `${e.code}  ${e.table}/.  got ${JSON.stringify(e.got)}  want ${e.want}  - ${e.path}\n`).join('');
  return {
    ...report, ok, errors: [...report.errors, ...tail.errors, ...syntax, ...owners.errors, ...deps.errors], text: tail.text + report.text + syntaxText + owners.text + depsText,
    rules: read.rules, owners: owners.merged,
    // 世界侧原语目录（world/ontology/primitives.json）的解析结果；没有该文件为 undefined。装配文件经 mountKernel 取得后交规则层核对（checkPrimitiveCatalog）。
    primitives: primitivesDoc,
  };
}

/**
 * 仓库根：本文件在 `<根>/server-plugin/kernel/load/world.mjs`，由自己的位置推出（装配文件不碰 import.meta.url、node:url，卷二 :996 扫描规则）。
 * @returns {string}
 */
export function repoRoot() {
  return dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
}

// 写者核对函数返回的错误行是 "<登记码> <所在> <说明>" 文字；转成加载报告的统一行（码取首段，其余作 got），按所属表归组。
function writerCheckRows(table, lines) {
  return lines.map((line) => {
    const cut = line.indexOf(' ');
    return { code: cut < 0 ? line : line.slice(0, cut), level: 'L2', table, row: '', dim: '', path: table, got: cut < 0 ? '' : line.slice(cut + 1), want: 'load-time check of the kernel writer' };
  });
}

// `dim:<kind>` = `created.<前缀>*.props`（该表 idPrefix 逐个）∪ 该表 derived 用到的 relation 的闭包；`modified:<kind>` = `dim:<kind>` ∪ `modifiers` ∪ `statuses`
// ∪ 该表修正项用到的 scope 的闭包（卷二 §2.3 :470 末句）。derived 公式的编译与维度级环已在 validate 的 L1 做（编译树随加载结果交出）；
// derived 用到的 relation 闭包（实例级聚合未建）与修正项作用域收集仍未建，两处闭包暂为空，见回报。
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
