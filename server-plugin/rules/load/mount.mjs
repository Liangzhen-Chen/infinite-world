// 内核装配（卷二 :608、:859、:1033；state-owners.json assembly.calls 的 mountKernel）：
// 先核装配层注入的能力（assertCaps，启动强断言唯一一处），再按登记组装世界数据（registry.mjs#loadWorld），
// 建 engine（路径句柄 P、host、存档布局、原语目录、依赖闭包、修正来源、推进钩子、摘要能力与两个指纹）与 state、日志簿，
// 返回 {engine, state, logBook, submitProposal, advance, save, opening, views}（S1-1 卡 B2、卡 C；opening 为 openingOf 的薄闭包，S1-2a；act、menu 为动作入口与菜单投影的薄闭包，S1-3a；views 为 S1-2b 的物种、身体、尸体只读入口）。给了 resume（readSlot 的结果）即由 replayApply 复演得 state 与日志簿，另带 saveDigest。
// 本文件不读盘（rules 层不许引 node:fs，world 数据由装配层 index.mjs 读入后传入），状态只经登记写者的初始化函数在一笔事务里建，或经复演重建。
import { loadWorld } from './registry.mjs';
import { makePathHandles } from '../../kernel/handles.mjs';
import { installNamedStructs } from '../../kernel/named-structs.mjs';
import { buildState, submitProposal, submitIntent, runTransaction } from '../../kernel/transaction.mjs';
import { advance, advanceRequest, initClock } from '../../kernel/scheduler.mjs';
import { createLogBook, tickEnd, docOf, writeSlot, dataPacksDigestOf, engineRulesDigestOf } from '../../kernel/save.mjs';
import { replayApply } from '../../kernel/load/save.mjs';
import { closeInputs } from '../../kernel/memo.mjs';
import { DIM_DECL } from '../../kernel/dimensions.mjs';
import { clone, installByteConstants } from '../../kernel/bytes.mjs';
import { KernelError } from '../../kernel/errors.mjs';
import { installFixedConstants, installExpTable } from '../../kernel/det-math.mjs';
import { checkBodyPlans } from '../body/body-plan.mjs';
import { speciesView } from '../body/species.mjs';
import { bodyView } from '../body/body.mjs';
import { carcassOf } from '../body/carcass.mjs';
import { runGenesis, runOpening, openingOf } from '../gen/worldgen-writeback.mjs';
import { bakePlaceTree, placeTreeDigest } from '../bake/place-tree.mjs';
import { checkTerminationTables, destroyEntity, instantiateEntity } from '../lifecycle/terminate.mjs';
import { SETTLE_BODY_CLEANUP, DIE_BY_DESTROY_TRIGGER } from '../body/death.mjs';
import { PERSON_INSTANTIATOR } from '../body/person.mjs';
import { checkRecordCoverage } from '../lifecycle/records.mjs';
import { loadActions, menuOf } from '../act/catalog.mjs';
import { resolveIntent } from '../act/resolve.mjs';

// 终止清理函数的登记项（卷二 :561；各系统模块经 registerTerminationCleanup 产出、在此收齐）。
const TERMINATION_CLEANUPS = Object.freeze([SETTLE_BODY_CLEANUP]);
// 终止发起方的登记项（草案 §4.1；各系统模块经 registerTerminationTrigger 产出、在此收齐，destroy 原语按 systems.*.terminationTrigger 路由）。
const TERMINATION_TRIGGERS = Object.freeze([DIE_BY_DESTROY_TRIGGER]);
// 建档实例化的登记项（S1-3c 草案 §5；各系统模块经 registerInstantiator 产出、在此收齐，create 原语按 systems.*.instantiate 路由）。
const INSTANTIATORS = Object.freeze([PERSON_INSTANTIATOR]);
// 协议入口注入（kernel/transaction.mjs HANDLERS.destroy、HANDLERS.create 调 engine.lifecycle.*；内核不 import 规则层，与 engine.advance 同一做法）。
const LIFECYCLE = Object.freeze({ destroy: destroyEntity, instantiate: instantiateEntity });

// 装配层注入能力的形状（启动强断言；S1-1c 派卡「主会话已定」第 1–3 条）：一张「字段 → 要求 → 判定」表，assertCaps 循环判。
// unitOfPath 可缺省（卷二十七 :553 只在分片表用到按单元分片时才须有；缺时由 checkShards 同一判定报 E-SAVE-SHARD-UNCOVERED）。
/** @type {ReadonlyArray<readonly [string, string, (v: any) => boolean]>} */
const CAPS_SHAPE = Object.freeze([
  ['saveRoot', 'a file: URL ending with /', (v) => v instanceof URL && v.protocol === 'file:' && v.href.endsWith('/')],
  ['digestCap', 'an object whose sha256Hex is a function', (v) => v !== null && typeof v === 'object' && typeof v.sha256Hex === 'function'],
  ['sources', 'a non-empty array of {path: non-empty string, text: string}', (v) => Array.isArray(v) && v.length > 0
    && v.every((x) => x !== null && typeof x === 'object' && typeof x.path === 'string' && x.path !== '' && typeof x.text === 'string')],
  ['modifierSources', 'an array of functions', (v) => Array.isArray(v) && v.every((x) => typeof x === 'function')],
  ['unitOfPath', 'undefined or a function', (v) => v === undefined || typeof v === 'function'],
  ['verifyBake', 'undefined or a boolean', (v) => v === undefined || typeof v === 'boolean'],
]);

/** 启动断言（唯一一处，建 engine 之前）：caps 逐字段按 CAPS_SHAPE 判，不合即 E-DIM-STRUCT-FIELD，消息带字段名。 @param {any} caps */
function assertCaps(caps) {
  const c = caps !== null && typeof caps === 'object' ? caps : {};
  for (const [name, want, ok] of CAPS_SHAPE) {
    if (!ok(c[name])) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `mountKernel: caps.${name} must be ${want}`);
  }
}

// 依赖声明（卷二 :509–:513）：各模块导出的冻结常量在此收齐，装配期交 memo.mjs#closeInputs 算一次闭包挂 engine.inputs。
const INPUT_DECLS = Object.freeze([DIM_DECL]);

// 本卡只实现整片一个文件的分片方式（卷二十七 :553 part_single；族 partition 见卷二十七 :130）。后续加分片方式时同改本处与 kernel/save.mjs。
const SUPPORTED_PARTITION = 'part_single';

/**
 * rules.kernelConstants（已按登记声明核过的键值）交 det-math#installFixedConstants 的形状：四条定点常数与 fixedLn 的算法常数（卷二 §3.3 :1335–:1339）；
 * 取值与缺值由 installFixedConstants 自己核（非正整数即抛），这里只按其参数形状转交，不给缺省。
 * @param {Readonly<Record<string, unknown>>} kc
 */
function fixedConstantsOf(kc) {
  const opt = (/** @type {string} */ k) => (kc[k] === undefined ? undefined : Number(kc[k]));
  return {
    BASE: Number(kc.BASE), SCALE: Number(kc.SCALE), PERMILLE: Number(kc.PERMILLE), BPS: Number(kc.BPS),
    fixedLnWorkExponent: opt('fixedLnWorkExponent'), fixedLnInputExponent: opt('fixedLnInputExponent'), fixedLnSeriesTerms: opt('fixedLnSeriesTerms'),
    LN2: kc.LN2 === undefined ? undefined : String(kc.LN2),
  };
}

// _distributions.json 的摘要口径（该文件 note：sha256 对 values.map(String).join(',') 的 UTF-8 字节；离线由 tools/gen-det-tables.mjs 生成冻结）。
const DIST_SHA_JOIN = ',';
const UTF8 = 'utf8';

/**
 * 采样表装入（卷二 §1.10 :331 normalQuantile 带 sha256、:332 expTable）：分位数表摘要与文件所记不符即 E-DIM-STRUCT-FIELD；exp 表交 det-math#installExpTable（它核形状）。
 * @param {{sha256Hex: (data: string, encoding: 'utf8') => string}} digestCap @param {unknown} doc
 */
function installDistributions(digestCap, doc) {
  const q = Object(Object(doc).normalQuantile);
  const ok = Array.isArray(q.values) && typeof q.sha256 === 'string' && digestCap.sha256Hex(q.values.map(String).join(DIST_SHA_JOIN), UTF8) === q.sha256;
  if (!ok) throw new KernelError('E-DIM-STRUCT-FIELD', {}, '_distributions.json normalQuantile: values do not match the recorded sha256');
  installExpTable(Object(doc).expTable);
}

/**
 * 分片表覆盖核对（卷二十七 :556，一处判）：逻辑文档的每一部分须恰有一行、方式为本卡实现的那一种，表里也不许有文档外的部分；
 * 不合即 E-SAVE-SHARD-UNCOVERED（出现未实现的方式同此，不逐种分支；按单元分片还须注入 caps.unitOfPath，卷二十七 :553，未实现前一并按未覆盖报）。
 * @param {unknown} shards rules.saveLayout.shards（登记类型 map，装配期已按声明核过） @param {string[]} parts 逻辑文档的部分名
 */
function checkShards(shards, parts) {
  const rows = new Map(Object.entries(Object(shards)));
  const covered = parts.every((p) => rows.get(p) === SUPPORTED_PARTITION) && [...rows.keys()].every((p) => parts.includes(p));
  if (!covered) throw new KernelError('E-SAVE-SHARD-UNCOVERED', {}, 'rules.saveLayout.shards must map every docpart to a supported partition (by-unit partitions also need caps.unitOfPath)');
}

/**
 * 新开一局（卷十 R10-1.2、R10-11.4、R10-12.7）：世界创建事务由登记写者建 state（genesisMinute 先于时钟），紧接开局一步一笔事务；任一被拒即抛。
 * @param {Parameters<typeof runOpening>[0]} engine @returns {ReturnType<typeof buildState>}
 */
function openWorld(engine) {
  const fresh = buildState(engine, [runGenesis, initClock]);
  const r = runTransaction(engine, fresh, (tx) => runOpening(engine, fresh, tx));
  if (!r.ok) throw new KernelError(String(r.code), {}, 'opening step rejected');
  return fresh;
}

/**
 * @param {any} raw 装配层读入的世界数据原文（形状见 registry.mjs#loadWorld）；整份即存档的世界数据副本 doc_data（卷二十七 :543、:547）
 * @param {{digestCap: {sha256Hex: (data: string, encoding: 'utf8' | 'base64') => string}, saveRoot: URL, sources: Array<{path: string, text: string}>,
 *   modifierSources: ReadonlyArray<Function>, unitOfPath?: Function, verifyBake?: boolean}} caps
 *   装配层注入：摘要能力（卷二 :1060）、存档根目录、源码清单（engineRulesDigest 用）、修正来源（可为空数组）、路径→模拟单元映射（可缺省）、烘焙层两次构建核对开关（可缺省）
 * @param {any} [resume] readSlot 的结果：给了即复演（卷二十七 :740）代替开局建 state
 */
export function mountKernel(raw, caps, resume) {
  assertCaps(caps);
  const docData = clone(raw);
  const { registry, rules } = loadWorld(docData);
  // 定点常数（rules.kernelConstants）装入 det-math，规则层的定点运算由此取标度（S1-2b）。
  installFixedConstants(fixedConstantsOf(rules.kernelConstants));
  // 字节常数（base64、UTF-8 编解码与导入长度计量用，卷二 :1047）同表装入 kernel/bytes.mjs（S1-3b 导入存档用）。
  installByteConstants(rules.kernelConstants);
  const { namedStructsDoc, owners, digestExclude, primitivesDoc, vocabDoc } = docData;
  const structs = installNamedStructs(namedStructsDoc);
  // 顶层状态键的登记表（state-owners.json 的 stateKeys，卷二 §2.7 :580）；内核按它判 writePath 的顶层键是否已声明。
  const stateKeys = Object.freeze({ ...(owners && owners.stateKeys ? owners.stateKeys : {}) });
  // 路径句柄 P：按 pathTypes / keyKinds / textPaths 在加载期生成，规则层只能经 engine.P 得到读写路径（卷二 §2.6 :536）。
  const P = makePathHandles(owners.pathTypes || {}, owners.keyKinds || {}, owners.textPaths || []);
  // 规则表 host（推进步长 :190、槽位数 :191 等）与 saveLayout（快照间隔、保留数、封段条数、分片表、布局名）已由 loadWorld 按登记声明逐键核。
  const { host, saveLayout } = rules;
  const primitives = new Map(primitivesDoc.primitives.map((/** @type {any} */ p) => [p.op, p]));
  const { digestCap, saveRoot, sources, modifierSources, unitOfPath, verifyBake } = caps;
  // 采样表（卷二 §1.10 :331–:332）：世界数据带了 _distributions.json 即核分位数表摘要、装入 exp 表；没带时采样（rules/gen/sample.mjs）用到即报错。
  if (docData.distributionsDoc !== undefined) installDistributions(digestCap, docData.distributionsDoc);
  // 烘焙层（卷二十七 R27-4.13、R27-5.9）：由 doc_data 纯函数建出，挂 engine.bake，不进 state 与 doc_*；开局与读档复演同样从空重建。
  const bake = Object.freeze({ placeTree: bakePlaceTree(registry) });
  if (verifyBake === true && placeTreeDigest({ digestCap }, bakePlaceTree(registry)) !== placeTreeDigest({ digestCap }, bake.placeTree)) {
    throw new KernelError('E-REPLAY-DIVERGE', { bake: 'place_tree' }, 'baked place tree differs between two builds of the same doc_data');
  }
  // 动作目录（卷九 §2.2；S1-3a）：加载期编成冻结目录挂 engine.actions；世界数据未带动作目录（actionDocs 缺）即为空，act/menu 调用即拒 E-ACT-UNKNOWN。
  const actions = docData.actionDocs === undefined ? null : loadActions({ registry, docData, vocab: vocabDoc, primitives });
  // 提交后推进由本层注入 engine.advance（transaction 不 import scheduler，免成环）；openStates 记「事务已开」的 state（不嵌套）。
  /** @type {any} */
  const engine = Object.freeze({
    registry, structs, modifierSources: Object.freeze([...modifierSources]), unitOfPath, inputs: closeInputs(INPUT_DECLS),
    stateKeys, P, host, saveLayout, primitives, bake, vocab: vocabDoc, actions,
    advanceHooks: Object.freeze([]), terminationCleanups: TERMINATION_CLEANUPS, terminationTriggers: TERMINATION_TRIGGERS, instantiators: INSTANTIATORS, lifecycle: LIFECYCLE, openStates: new WeakSet(),
    advance: (/** @type {object} */ st, /** @type {import('../../kernel/save.mjs').LogBook} */ book, /** @type {number} */ m) => advance(engine, st, book, m),
    // 意图收窄由本层注入（transaction 不 import 规则层；同 advance 注入），开局与复演同一函数（S1-3a）。
    resolveIntent: (/** @type {object} */ st, /** @type {unknown} */ intent) => resolveIntent(engine, st, intent),
    docData, digestExclude: Object.freeze([...digestExclude]), digestCap, saveRoot,
    engineRulesDigest: engineRulesDigestOf({ digestCap }, sources),
    dataPacksDigest: dataPacksDigestOf({ digestCap }, docData),
  });
  // 装配期核身体图与物种的身体配对（卷四 :202、:197、:144；S1-2b），不合即抛，开局与读档同核。
  checkBodyPlans(engine);
  // 装配期核终止协议的登记（S2-0a）：类别行 termination 与未建数据门（主会话裁定 R7）、去留表取值；去留表覆盖核对（卷二 :562 E-TERM-RECORD-UNLISTED）。
  checkTerminationTables(engine);
  checkRecordCoverage(engine);
  // 开局：世界创建事务（genesisMinute 与时钟）→ 开局一步事务（openingMinute 与开放范围），都在 0 号快照之前、不进日志输入（卷十 R10-11.4、卷二十七 :742）；
  // 读档：同一 engine 上复演（不按种类分支，只看有无 resume）。
  /** @type {{state: any, logBook: any, saveDigest?: string}} */
  const start = resume === undefined ? { state: openWorld(engine), logBook: createLogBook() } : replayApply(engine, resume);
  const { state: built, logBook, saveDigest } = start;
  // 装配期核分片表覆盖（卷二十七 :556）；开局再拍 0 号快照（读档的快照随日志簿复演带回）。
  checkShards(saveLayout.shards, Object.keys(docOf(engine, built, logBook)));
  if (resume === undefined) tickEnd(engine, built, logBook);
  const live = { engine, state: built, logBook };
  return {
    ...live,
    submitProposal: (/** @type {any} */ p) => submitProposal(engine, built, logBook, p),
    advance: (/** @type {number} */ m) => advanceRequest(engine, built, logBook, m),
    opening: () => openingOf(engine, built),
    // 动作入口（S1-3a；S1-3b 菜单入口调）：意图作输入条目先记日志，再经 engine.resolveIntent 换成效果原语提案落事务；被拒也留在日志（卷二:545），不写状态。
    act: (/** @type {unknown} */ intent) => submitIntent(engine, built, logBook, intent),
    // 菜单投影（纯读）：subjectId 为空即开局菜单（主会话 11-26 裁定），返回 {affordances, visible}。
    menu: (/** @type {string | null} */ subjectId) => menuOf(engine, built, subjectId),
    save: (/** @type {number} */ slot) => writeSlot(engine, live, slot),
    // 只读入口（卷四 §3.1、:874），绑本局 engine 与 state，供 S1-3 菜单接（S1-2b）。
    views: Object.freeze({
      speciesView: (/** @type {string} */ id) => speciesView(engine, built, id),
      bodyView: (/** @type {string} */ id) => bodyView(engine, built, id),
      carcassOf: (/** @type {import('../body/carcass.mjs').CarcassArg} */ arg) => carcassOf(engine, built, arg),
    }),
    ...(saveDigest === undefined ? {} : { saveDigest }),
  };
}
