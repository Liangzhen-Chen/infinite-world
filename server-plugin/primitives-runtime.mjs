// 原语执行器（规则层）：卷九《AI接口》§4.2 原语目录与执行器、§4.2.2 统一入口 :653、R9-2.3 一次事务 :658、R9-2.4 适配器按原语分 :659、
// R9-2.5 参数只有代号与数值 :660；李白 11-18 22:10 块 5 体检裁定 五.1（执行器归规则层、文件 server-plugin/primitives-runtime.mjs、入口 execute、
// 只由 resolve() 提交段与推进钩子调度方调用、kernelApi 不登执行器）与 五.2／丙6／丙7／丙9（写者未上线的原语整笔拒收 E-ACT-WRITER-NOT-READY）、
// 丙8（world/ontology/primitives.json 同路径按新契约改写）。契约数据只在两个地方：本文件的 CATALOG（执行器要用的唯一一份可执行契约）
// 与 world/ontology/primitives.json（世界侧目录数据，卡内测试逐行比对两者）；规则层不读 world/ 文件（卷二 §2.7 import 矩阵：规则层无 node:fs）。
//
// 分工边界（本卡只做骨架）：
// - 只实现目标写者现已存在的适配器：transfer（kernel/ledger.mjs#transfer）。见 docs/卡回报/ds-b5-1.md 的“已建适配器／拒收清单”。
// - 5-3 补 holding 四条、5-4 补 destroy（转调 kernel/terminate.mjs#terminate）。
// - 6-27（格子 G12）补 move（经委托调 position.mjs#placeSubject）与 create（按实体类查创建例程，现只有 person；其余类整笔拒收）。time 适配器未落：time 原语的写者是卷二十调度器的推进
//   （卷九 R9-3.11 :723 "推进只经 time 原语与卷二十的调度器"），而 execute 在已开的内核事务里跑、调度器 advance 自开事务逐刻（kernel/transaction.mjs 禁嵌套事务），
//   卷九没给"提交后再推进"的交接形状，卷文推不出，留待裁定，仍整笔拒收 E-ACT-WRITER-NOT-READY。
// - 其余原语（含 emit、learn、transform、schedule 等）没有适配器，一律整笔拒收 E-ACT-WRITER-NOT-READY，
//   抛出后由调用方已开的内核事务整笔回滚；不造桩、不静默跳过。
// - 一次 execute 一次事务由调用方保证：execute 只由 resolve() 提交段与推进钩子调度方调用，二者都在调用方已开的内核事务里
//   （kernel/transaction.mjs#runTransaction 是 kernel 组内用、不在 kernelApi；规则层只能经 kernelApi 调 kernel，卷二 §2.7 :790）。
//   本文件不自开事务，写入直接落在调用方事务上；任一适配器拒绝即抛出，由调用方事务整笔回滚（卷九 R9-2.3 :658、R9-3.1 commit 段 :707）。
// - 事务事件本卡不写：事件 `verb`／`visibility` 须来自本批 `emit` 原语（表 A :134／:142；卷九 §4.2.1 :643），
//   `actor`／`targets`／`payload` 与 id 主体、位次须来自提交段或钩子上下文（卷九 §2.9 :437／:439），块 5 都拿不到，
//   按李白 11-18 22:10 总原则／五.2 不造桩、不放空：批里没有 `emit` 原语即整笔拒收 E-ACT-WRITER-NOT-READY
//   （"恰一条事件"记“部分”，挂块 6 建 emit 适配器／提交段接线的卡）。
// - 效果族 effects() 的调用面归 5-5，本卡不写。

import { transfer } from './kernel/ledger.mjs';
import { openHolding, closeHolding, transferHolding, rescaleHolding } from './kernel/holdings.mjs';
import { terminate } from './kernel/terminate.mjs';
import { runDelegated } from './kernel/transaction.mjs';
import { instantiatePerson } from './person.mjs';

// 账户 id 的段序（卷六 §4.1 规则 1、kernel/ledger.mjs 的 accountKey）：持有人、用途、资源种类、资源键。
// 原语 transfer 的 from、to 是账户 id（卷九 §4.2.1 transfer 行只给 from、to、qty；账户包含资源，
// 见 §4.2.5 数据实例“transfer（钱，买方到卖方）”），适配器按此段序拆出 ledger.transfer 的参数。
const ACCOUNT_PARTS = Object.freeze(['holder', 'purpose', 'kind', 'key']);
// 事件写载体原语（卷九 §4.2.1 :643）：事务事件的 verb、visibility 由它给；账本 reason 也取它给的 verb（卷六 §3.2 :286）。
// 取法用查表（同 BY_OP、ADAPTERS 的写法），不写码值比较（卷二 S13 ④）。
const EVENT_OP = 'emit';
const EVENT_OPS = Object.freeze({ [EVENT_OP]: true });

// 原语目录（封闭，设计 20 个、15 族；卷九 :625、R9-2.1 :656）。每行一份参数契约：required 为必填字段与类型；
// oneOf 为若干“恰取一组”的备选字段组（组内每个备选是一组字段，整批恰命中一组）；unless 为条件必填（字段不等于 notEquals 时另须字段）。
// 行序即 R9-2.3 的“原语在目录中的固定序”。字段名与类型逐项照卷九 §4.2.1 的表（:628–:646）。
// 字段类型记号只用卷二 §1.5 的类型名（number、integer、ref、enum、map），另加执行器用的 id（实体 id）、account（账户 id，恰四段）、
// dimension（维度键）与 shares（map<id, number>：键是实体 id、值是数值，键值两边都按文法与类型校）。按字段类型分开校，避免把 §1.9 的两条文法并成一条更宽的（只核第 4 条）。
const CATALOG = [
  { op: 'transfer', family: 'transfer', channel: 'ledger', required: { from: 'account', to: 'account', qty: 'integer' } },
  { op: 'holding.open', family: 'holding', channel: 'holding', required: { holdingKind: 'ref', holder: 'id', subject: 'id' }, optional: { terms: 'consentTerms' } },
  { op: 'holding.close', family: 'holding', channel: 'holding', oneOf: [[{ holding: 'id' }, { id: 'id' }, { holdingKind: 'ref', holder: 'id', subject: 'id' }]] },
  { op: 'holding.transfer', family: 'holding', channel: 'holding', oneOf: [[{ holding: 'id' }, { id: 'id' }], [{ newHolder: 'id' }, { holder: 'id' }]], optional: { terms: 'consentTerms' } },
  { op: 'holding.rescale', family: 'holding', channel: 'holding', required: { holdingKind: 'ref', subject: 'id', shares: 'shares' }, optional: { terms: 'consentTerms' } },
  { op: 'obligation.create', family: 'obligation', channel: 'declared', required: { id: 'id', obligationKind: 'ref', debtor: 'id', creditor: 'id' } },
  { op: 'obligation.settle', family: 'obligation', channel: 'declared', required: { id: 'id' } },
  { op: 'obligation.cancel', family: 'obligation', channel: 'declared', required: { id: 'id' } },
  { op: 'fact.set', family: 'fact', channel: 'declared', required: { entity: 'id', field: 'dimension' }, oneOf: [[{ value: 'number' }, { delta: 'number' }]] },
  { op: 'vital', family: 'vital', channel: 'declared', required: { target: 'id', delta: 'number' } },
  { op: 'status', family: 'status', channel: 'declared', required: { target: 'id', status: 'ref', duration: 'integer', magnitude: 'integer' } },
  { op: 'move', family: 'move', channel: 'declared', required: { to: 'id' }, optional: { subject: 'id', facing: { type: 'integer', nullable: true } } },
  { op: 'create', family: 'create', channel: 'declared', required: { kind: 'ref', facts: 'map' }, unless: [{ field: 'kind', notEquals: 'mark', required: { template: 'ref' } }] },
  { op: 'destroy', family: 'destroy', channel: 'kernel', required: { entity: 'id' } },
  { op: 'transform', family: 'transform', channel: 'invoke', required: { subject: 'id', variant: 'ref', direction: { type: 'enum', values: ['apply', 'revert'] }, cause: 'id' } },
  { op: 'emit', family: 'emit', channel: 'event', required: { verb: 'ref', visibility: { type: 'enum', values: ['public', 'private', 'witnessed'] } } },
  { op: 'schedule', family: 'schedule', channel: 'due', required: { at: 'integer' }, oneOf: [[{ action: 'ref' }, { rule: 'ref' }]] },
  { op: 'transition', family: 'transition', channel: 'declared', required: { entity: 'id', kind: 'ref', cause: 'id' } },
  { op: 'learn', family: 'learn', channel: 'invoke', required: { subject: 'id', skill: 'ref', source: 'ref', minutes: 'integer', difficulty: { type: 'number', nullable: true } } },
  { op: 'time', family: 'time', channel: 'declared', required: { minutes: 'integer' } },
];

const FAMILY_COUNT = new Set(CATALOG.map((row) => row.family)).size;

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

deepFreeze(CATALOG);
const BY_OP = new Map(CATALOG.map((row, i) => [row.op, { row, i }]));

// 契约定型的错误码（卷二 §4.3、卷九 §2.8）：契约不合与目录外原语是 E-ACT-PRIMITIVE；适配器或其目标写者未上线是 E-ACT-WRITER-NOT-READY。
const CODE = Object.freeze({ contract: 'E-ACT-PRIMITIVE', writerNotReady: 'E-ACT-WRITER-NOT-READY' });

// 登记码错误（形状同 kernel/errors.mjs#KernelError）：kernel/transaction.mjs 的 codeOf 按 e.code 认；fields 只含代号与数值。
function deny(code, detail) {
  const e = new Error(`${code} ${detail}`);
  e.code = code;
  e.fields = {};
  return e;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// 卷二 §1.9 :285 的两条文法，逐字符查允许集（不写正则字面量，S13 ①）：
// CODE = ^[a-z][a-z0-9_]{1,47}$（实体 id、类别 id、枚举值，至少 2 字符、总长至多 48）；
// KEY  = ^[a-z][a-zA-Z0-9]{0,47}$（维度键与 struct 字段名，至少 1 字符、总长至多 48，允许后续大写、不许下划线）。
// 总长上限照 S10 登记成规则表常数 kernelConstants.grammarMaxLength（world/rules/tables/kernel-constants.json，
// 登记行见 world/rules/registry.json），执行器经 engine.rules 读，不在规则层写数值字面量。
const SCHEMA = Object.freeze({ constantsTable: 'kernelConstants', maxLengthKey: 'grammarMaxLength' });
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const CODE_TAIL = LOWER + '0123456789_';
const KEY_TAIL = LOWER + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

// 文法总长上限：缺键、非正整数即拒（不回落默认、不静默跳过），形状同加载器读同表常数的方式。
function grammarMaxLength(engine) {
  const table = isPlainObject(engine) && isPlainObject(engine.rules) ? engine.rules[SCHEMA.constantsTable] : undefined;
  const v = isPlainObject(table) ? table[SCHEMA.maxLengthKey] : undefined;
  if (!Number.isSafeInteger(v) || v < 1) {
    throw deny('E-DIM-STRUCT-FIELD', `rules.${SCHEMA.constantsTable}.${SCHEMA.maxLengthKey} is a positive integer`);
  }
  return v;
}

function isCode(s, maxLength) {
  // CODE_RE 的尾段至少一个字符：首字符之外还要有一位（用 0/1 只在白名单内，不写字面量 2）。
  if (typeof s !== 'string' || s.length === 0 || s.length === 1) return false;
  if (s.length > maxLength) return false;
  if (!LOWER.includes(s[0])) return false;
  for (const ch of s.slice(1)) if (!CODE_TAIL.includes(ch)) return false;
  return true;
}

function isKey(s, maxLength) {
  if (typeof s !== 'string' || s.length === 0) return false;
  if (s.length > maxLength) return false;
  if (!LOWER.includes(s[0])) return false;
  for (const ch of s.slice(1)) if (!KEY_TAIL.includes(ch)) return false;
  return true;
}

// 账户 id 是恰 ACCOUNT_PARTS.length 段代号以路径分隔符相连（持有人、用途、资源种类、资源键；卷六 §4.1 规则 1）。
function isAccountId(s, maxLength) {
  if (typeof s !== 'string') return false;
  const segs = s.split('.');
  return segs.length === ACCOUNT_PARTS.length && segs.every((seg) => isCode(seg, maxLength));
}

// 契约类型的检查表：键用 §1.5 类型名（数据里的类型记号，不写比较字面量），另加执行器的 id、account、dimension 与 shares。
// 值为 (值, 字段规格, 文法总长上限) => 是否合契约；查表而不是逐个 === 字面量比较（卷十二 bareCompare 扫描）。
const TYPE_CHECK = Object.freeze({
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  integer: (v) => Number.isSafeInteger(v),
  ref: (v, spec, maxLength) => typeof v === 'string' && isCode(v, maxLength),
  enum: (v, spec, maxLength) => typeof v === 'string' && isCode(v, maxLength) && Array.isArray(spec.values) && spec.values.includes(v),
  map: (v) => isPlainObject(v),
  id: (v, spec, maxLength) => typeof v === 'string' && isCode(v, maxLength),
  account: (v, spec, maxLength) => typeof v === 'string' && isAccountId(v, maxLength),
  dimension: (v, spec, maxLength) => typeof v === 'string' && isKey(v, maxLength),
  shares: (v, spec, maxLength) => isPlainObject(v) && Object.keys(v).every((k) => isCode(k, maxLength)) && Object.values(v).every((x) => typeof x === 'number' && Number.isFinite(x)),
  // 持有原语的可选 terms（卷九 §4.2.1，勘误 1118k28）：只核是普通对象。其中 consentAct 的 EventId 校验与当事人覆盖核对、其余键的类型与是否许写，
  // 都由内核持有写者判（李白 11-19 03:20 裁定 3：适配器只原样透传 terms，不自补、不自判）。
  consentTerms: (v) => isPlainObject(v),
});

function fits(spec, value, maxLength) {
  const nullable = isPlainObject(spec) && spec.nullable === true;
  if (nullable && value === null) return true;
  const type = typeof spec === 'string' ? spec : spec.type;
  const check = Object.prototype.hasOwnProperty.call(TYPE_CHECK, type) ? TYPE_CHECK[type] : undefined;
  if (!check) throw deny(CODE.contract, `unknown contract field type ${JSON.stringify(type)}`);
  return check(value, spec, maxLength);
}

/**
 * `primitiveContract(op)`（卷九 §4.2.2 读入口 :653）：返回原语的参数契约；op 不在封闭目录即 E-ACT-PRIMITIVE（R9-2.1）。
 * @param {string} op
 * @returns {Readonly<object>}
 */
export function primitiveContract(op) {
  const hit = typeof op === 'string' ? BY_OP.get(op) : undefined;
  if (!hit) throw deny(CODE.contract, `primitive ${JSON.stringify(op)} is not in the closed catalog`);
  return hit.row;
}

/**
 * 按 R9-2.3 排定次序：原语在目录中的固定序，同原语按列表下标。不认识的 op 即 E-ACT-PRIMITIVE。
 * @param {readonly object[]} primitives
 * @returns {object[]} 排好序的新数组（元素原样）
 */
export function sortPrimitives(primitives) {
  if (!Array.isArray(primitives)) throw deny(CODE.contract, 'primitives is a list');
  const ranked = primitives.map((p, i) => {
    if (!isPlainObject(p) || typeof p.op !== 'string') throw deny(CODE.contract, `primitive at index ${i} is not {op, ...fields}`);
    const hit = BY_OP.get(p.op);
    if (!hit) throw deny(CODE.contract, `primitive ${JSON.stringify(p.op)} is not in the closed catalog`);
    return { p, i, rank: hit.i };
  });
  ranked.sort((a, b) => (a.rank - b.rank) || (a.i - b.i));
  return ranked.map((x) => x.p);
}

// 每个原语在契约之上的整类约束（R9-2.3 第一句“逐个按契约校验”的一部分，不合即整批不执行）。
// transfer 一笔只搬一种资源（卷六 §4.1 规则 1、2）：from、to 是账户 id，资源不同即契约不合，前移到校验期。
const CONTRACT_EXTRAS = Object.freeze({
  // move 的行动者：契约只列必填 to（卷九 §4.2.1 :639），行动者由提交段的上下文给（卷九 §2.9 :437 actor），resolve() 提交段未建，所以本适配器现要求调用方带 subject（个体 id）；
  // 没带即契约不合，不猜"当前行动者"（对照表 #18；resolve 落地后缺省取行动者时去掉这一条）。
  move(p) {
    if (!Object.hasOwn(p, 'subject')) throw deny(CODE.contract, 'move.subject required until resolve() supplies the actor (commit stage not built)');
  },
  transfer(p, maxLength) {
    const from = splitAccount(p.from, maxLength);
    const to = splitAccount(p.to, maxLength);
    if (from.resource.kind !== to.resource.kind || from.resource.key !== to.resource.key) {
      throw deny(CODE.contract, 'transfer from/to are accounts of different resources');
    }
  },
});

// 契约校验（R9-2.3 第一句：逐个按契约校验，不合即 E-ACT-PRIMITIVE，整批不执行）。只查契约登记的字段；未登记的字段当可选字段放行。
function checkContract(p, maxLength) {
  if (!isPlainObject(p) || typeof p.op !== 'string') throw deny(CODE.contract, 'primitive is {op, ...fields}');
  const row = primitiveContract(p.op);
  for (const [field, spec] of Object.entries(row.required || {})) {
    if (!Object.hasOwn(p, field) || !fits(spec, p[field], maxLength)) throw deny(CODE.contract, `${row.op}.${field} required (${JSON.stringify(spec)})`);
  }
  for (const [field, spec] of Object.entries(row.optional || {})) {
    if (Object.hasOwn(p, field) && !fits(spec, p[field], maxLength)) throw deny(CODE.contract, `${row.op}.${field} (${JSON.stringify(spec)})`);
  }
  for (const group of row.oneOf || []) {
    let hits = 0;
    for (const alt of group) {
      if (Object.entries(alt).every(([field, spec]) => Object.hasOwn(p, field) && fits(spec, p[field], maxLength))) hits += 1;
    }
    if (hits !== 1) throw deny(CODE.contract, `${row.op}: exactly one of ${group.map((alt) => Object.keys(alt).join('+')).join(' | ')}`);
  }
  for (const rule of row.unless || []) {
    if (p[rule.field] === rule.notEquals) continue;
    for (const [field, spec] of Object.entries(rule.required)) {
      if (!Object.hasOwn(p, field) || !fits(spec, p[field], maxLength)) throw deny(CODE.contract, `${row.op}.${field} required unless ${rule.field} is ${rule.notEquals}`);
    }
  }
  const extra = CONTRACT_EXTRAS[row.op];
  if (extra) extra(p, maxLength);
  return row;
}

// 账户 id → ledger.transfer 的 from/to（{holder, purpose}）；资源从同一账户 id 取出。
function splitAccount(id, maxLength) {
  const segs = id.split('.');
  if (segs.length !== ACCOUNT_PARTS.length || !segs.every((seg) => isCode(seg, maxLength))) throw deny(CODE.contract, `account id ${JSON.stringify(id)} is ${ACCOUNT_PARTS.join('.')}`);
  const [holder, purpose, kind, key] = segs;
  return { holder, purpose, resource: { kind, key } };
}

// 适配器按原语分，不按领域分（R9-2.4）：每个原语一个函数，领域差别只来自参数与目标写者。
// 已建目标写者的适配器：transfer（kernel/ledger.mjs#transfer）、holding 四条（kernel/holdings.mjs，5-3）与 destroy（kernel/terminate.mjs，5-4）。
// 其余原语不在此表，由 execute 整笔拒收 E-ACT-WRITER-NOT-READY。
// holding 四条只经 kernelApi 调持有写者（卷二 §2.7 kernelApi 的 kernel/holdings.mjs 条目）；可选字段 terms / grantedBy 照原样转交。
const ADAPTERS = Object.freeze({
  transfer(engine, state, p, reason, maxLength) {
    const from = splitAccount(p.from, maxLength);
    const to = splitAccount(p.to, maxLength);
    // from/to 资源相同由 checkContract 的 CONTRACT_EXTRAS 先核（R9-2.3 整批先校验）。
    // reason 取本笔真实事件动词（本批 emit 原语的 verb），不拿规则/指令代号 cause 充数（卷六 §3.2 :286、5-2 只核必须改 2 附）。
    transfer(engine, state, {
      from: { holder: from.holder, purpose: from.purpose },
      to: { holder: to.holder, purpose: to.purpose },
      resource: from.resource,
      qty: p.qty,
      reason,
    });
  },
  'holding.open'(engine, state, p, reason) {
    openHolding(engine, state, { holdingKind: p.holdingKind, holder: p.holder, subject: p.subject, terms: p.terms, grantedBy: p.grantedBy, cause: reason });
  },
  'holding.close'(engine, state, p, reason) {
    closeHolding(engine, state, { id: p.holding === undefined ? p.id : p.holding, holdingKind: p.holdingKind, holder: p.holder, subject: p.subject, endReason: p.endReason, cause: reason });
  },
  'holding.transfer'(engine, state, p, reason) {
    transferHolding(engine, state, {
      id: p.holding === undefined ? p.id : p.holding,
      holdingKind: p.holdingKind,
      holder: p.holder,
      subject: p.subject,
      newHolder: p.newHolder,
      terms: p.terms,
      cause: reason,
    });
  },
  'holding.rescale'(engine, state, p, reason) {
    rescaleHolding(engine, state, { holdingKind: p.holdingKind, subject: p.subject, shares: p.shares, terms: p.terms, cause: reason });
  },
  // destroy 落内核实体终止协议（卷九 §4.2.1 :640；卷二 §2.6 :519）：cause 取本笔事件动词，无死因细分写 null。
  // 涉实物的去处腿（R9-2.7 :667）在终止第 3 步按资源种类行 onTerminate 经账本处置；sink 去处登记为未建
  // （rules.terminate.unbuilt），与目标实体表或其写者未上线同由 terminate 拒 E-ACT-WRITER-NOT-READY。
  destroy(engine, state, p, reason) {
    terminate(engine, state, p.entity, reason, null);
  },
  // move 落位置写者 placeSubject（卷九 §4.2.1 :639；卷十七 C17-11 :873，S17-4：除经 placeSubject 外不存在让个体换位置的写路径）：目标是地点 id，经 runDelegated 以 position.mjs 的身份写
  // （systems.position.writeDelegations 登记了委托方文件 primitives-runtime.mjs；resolve() 提交段落地时，它的节点文件另加一行委托）。facing 缺省为空：按新旧位置折朝向（卷十七 :305）。
  move(engine, state, p, reason) {
    runDelegated(state, 'position.mjs#placeSubject', engine, state, p.subject, { place: p.to }, p.facing === undefined ? null : p.facing, reason);
  },
  // create 按实体类（kind）查创建例程；没有登记例程的类整笔拒收（对照表 #18、PLAN.md :70 ③、:82 ②）：
  // 地点行没有建行写者（K6-42 未建），物品实例要持有人、用途、来源代号（createItemInstance 的 holder、purpose、flow），原语契约里没有，留痕归 mark-actions.mjs（卷九 R9-15.2，未建）。
  create(engine, state, p, reason) {
    const make = Object.hasOwn(CREATORS, p.kind) ? CREATORS[p.kind] : undefined;
    if (!make) throw deny(CODE.writerNotReady, `create of ${p.kind}: no creation routine registered for this entity kind`);
    make(engine, state, p, reason);
  },
});

// create 的创建例程表（按实体类）。person：建行与初值位置成对写在同一事务里（PLAN.md :82 ②"建实例与初值成对写入"）：
// template 是物种行；facts 里 pos（struct:pos）或 place（地点 id）二取一给初值位置（都不给则不写位置，读到按未知），facing 可选；其余 facts 原样交 instantiatePerson（它核字段与取值域）。
const CREATORS = Object.freeze({
  person(engine, state, p, reason) {
    const { pos, place, facing, ...rest } = p.facts;
    if (pos !== undefined && place !== undefined) throw deny(CODE.contract, 'create person: facts.pos and facts.place are alternatives');
    if (rest.species !== undefined && rest.species !== p.template) throw deny(CODE.contract, 'create person: facts.species conflicts with template');
    const made = instantiatePerson(engine, state, { ...rest, species: p.template });
    if (pos === undefined && place === undefined) return;
    const target = pos !== undefined ? { pos } : { place };
    runDelegated(state, 'position.mjs#placeSubject', engine, state, made.id, target, facing === undefined ? null : facing, reason);
  },
});

/**
 * `execute(engine, state, primitives, cause)`（卷九 §4.2.2 写入口 :653）：在一个已开的内核事务里提交一批原语。
 * 只由 resolve() 提交段与推进钩子调度方调用，二者都在调用方已开的内核事务里（runTransaction 是 kernel 组内用、不在 kernelApi）；
 * 本函数不自开事务，写入直接落在调用方事务上：任一适配器拒绝（含写者未上线的 E-ACT-WRITER-NOT-READY）即抛出，由调用方事务整笔回滚。
 * 次序照 R9-2.3：先整批按契约校验（不合即抛 E-ACT-PRIMITIVE，整批不执行），再按目录固定序、同原语按列表下标逐个交给适配器。
 * 事务事件的 verb（`emit` 原语必填，表 A :134／:142）与账本 reason（卷六 §3.2 :286）都取本批 `emit` 原语的 verb；
 * 批里没有 `emit` 原语即拿不到真实动词，按李白 11-18 22:10 总原则／五.2 整笔拒收 E-ACT-WRITER-NOT-READY，不拿 cause／null／{} 顶替。
 * 事件本身本卡不写（actor／targets／payload 与 id 主体、位次须来自提交段或钩子上下文，卷九 §2.9 :437／:439）：
 * “成功后恰一条事件”（R9-2.3 :658、R24-1.1 :395）记“部分”，挂块 6 建 emit 适配器／提交段接线的卡。
 * @param {{vocab: object, rules: object, template?: {seed?: string}}} engine
 * @param {object} state
 * @param {readonly object[]} primitives 原语列表，每项 {op, ...契约字段}
 * @param {string} cause 规则或指令代号（卷二十四表 A 的 cause）
 * @returns {{ok: true}}
 */
export function execute(engine, state, primitives, cause) {
  if (!Array.isArray(primitives)) throw deny(CODE.contract, 'primitives is a list');
  // 文法总长上限先读：缺键或非正整数即拒，整批不执行（不回落默认，不留绕过口子）。
  const maxLength = grammarMaxLength(engine);
  for (const p of primitives) checkContract(p, maxLength);
  if (typeof cause !== 'string' || cause.length === 0) throw deny(CODE.contract, 'cause is a non-empty code');
  // 本笔真实事件动词只来自本批 emit 原语（表 A :134／:142 "卷九 emit 原语必填"；卷九 §4.2.5 :676 的成交一笔即 transfer、transfer、emit）；
  // 没有它就没有 verb，账本 reason 与事务事件都无从取真值，整笔拒收（E-ACT-WRITER-NOT-READY）。
  const eventPrim = primitives.find((p) => Object.hasOwn(EVENT_OPS, p.op));
  if (!eventPrim) throw deny(CODE.writerNotReady, `no ${EVENT_OP} primitive: the transaction event verb and the ledger reason come from it`);
  const ordered = sortPrimitives(primitives);
  // 写入前先对整批核适配器存在性（5-1 终核非阻塞建议 1）：整批拒收不依赖调用方事务回滚。
  for (const p of ordered) if (!ADAPTERS[p.op]) throw deny(CODE.writerNotReady, `no adapter for ${p.op}`);
  for (const p of ordered) ADAPTERS[p.op](engine, state, p, eventPrim.verb, maxLength);
  return { ok: true };
}

// ---------- 目录数据核对（world/ontology/primitives.json；K5-12 加载期封闭与行数校验的卡内测试面） ----------

// 旧格式字段（改前 world/ontology/primitives.json）：文件顶层与每条原语行上都不许再出现。
const OLD_TOP_FIELDS = Object.freeze(['$schema', 'kind', 'namespace', 'note', 'entries']);
const OLD_ROW_FIELDS = Object.freeze(['event', 'params', 'writable']);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isPlainObject(value)) return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}

// 契约各位置（required、oneOf 各备选、unless 的 required）出现的类型记号：必须是执行器认识的类型表（TYPE_CHECK 的键）。
// §1.5 的 string 不在表内，因此无需另写一个 string 字面量比较（R9-2.5 :661 只收 string 之外的类型）。
function specTokens(row) {
  const out = [];
  const add = (spec) => {
    const t = typeof spec === 'string' ? spec : (isPlainObject(spec) ? spec.type : undefined);
    if (typeof t === 'string') out.push(t);
  };
  for (const spec of Object.values(isPlainObject(row.required) ? row.required : {})) add(spec);
  for (const spec of Object.values(isPlainObject(row.optional) ? row.optional : {})) add(spec);
  for (const group of Array.isArray(row.oneOf) ? row.oneOf : []) {
    for (const alt of Array.isArray(group) ? group : []) for (const spec of Object.values(isPlainObject(alt) ? alt : {})) add(spec);
  }
  for (const rule of Array.isArray(row.unless) ? row.unless : []) {
    for (const spec of Object.values(isPlainObject(rule) && isPlainObject(rule.required) ? rule.required : {})) add(spec);
  }
  return out;
}

function unknownSpecType(row) {
  return specTokens(row).find((t) => !Object.hasOwn(TYPE_CHECK, t)) || null;
}

/**
 * 核对世界侧原语目录（world/ontology/primitives.json）：封闭 20 行、15 族、含 transform、无旧格式字段、无 string 类型字段，
 * 且逐行与本文件的 CATALOG 一致（防止可执行契约与世界目录漂移）。纯数据核对，不改任何状态。
 * @param {unknown} doc JSON.parse 后的 primitives.json
 * @returns {{ok: boolean, errors: string[]}}
 */
export function checkPrimitiveCatalog(doc) {
  const errors = [];
  if (!isPlainObject(doc)) return { ok: false, errors: ['catalog is an object'] };
  for (const field of OLD_TOP_FIELDS) if (Object.hasOwn(doc, field)) errors.push(`old top-level field ${field}`);
  const rows = Array.isArray(doc.primitives) ? doc.primitives : null;
  if (!rows) return { ok: false, errors: [...errors, 'missing primitives[]'] };
  if (rows.length !== CATALOG.length) errors.push(`row count ${rows.length} want ${CATALOG.length}`);
  const families = new Set(rows.map((r) => (isPlainObject(r) ? r.family : undefined)));
  if (families.size !== FAMILY_COUNT) errors.push(`family count ${families.size} want ${FAMILY_COUNT}`);
  rows.forEach((row, i) => {
    if (!isPlainObject(row)) { errors.push(`row ${i} is not a row object`); return; }
    const want = CATALOG[i];
    if (!want) { errors.push(`row ${i} ${JSON.stringify(row.op)} is beyond the closed catalog`); return; }
    if (row.op !== want.op) { errors.push(`row ${i} op ${JSON.stringify(row.op)} want ${want.op}`); return; }
    for (const field of OLD_ROW_FIELDS) if (Object.hasOwn(row, field)) errors.push(`${row.op}: old field ${field}`);
    const badType = unknownSpecType(row);
    if (badType !== null) errors.push(`${row.op}: type ${JSON.stringify(badType)} is not an executor type (string not allowed)`);
    if (canonical(row) !== canonical(want)) errors.push(`${row.op}: contract differs from the runtime catalog`);
  });
  return { ok: errors.length === 0, errors };
}
