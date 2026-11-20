// 市场需求的“预期与惯常价”半（卷六《经济》§4.4.3 规则 4 :499；块 6 第 6-11 张）：`expectWindowDays` 内成交量的移动平均是惯常成交量，同一窗口内的成交均价是惯常价；
// 预期只读已持久化的成交记录，不另存预期值（规则 4）。取值次序：窗口内该货在当地的成交不少于 `minTradesForHabit` 条时用成交记录；不足时惯常价取这件货自己的 `priceFor`（估值角色、不含稀缺项），
// 惯常成交量取零（规则 4：这取的是同一件货自己的估值，不是拿别的货或旧价顶替）。
// 成交记录由调用方读自 `marketTrades.<地点>`（卷六 §3.3 :310，写者 market.mjs，6-12 登记路径与记录结构）后传入：本卡不登记该路径，所以本文件不读状态路径，也不写任何状态。
// 记录形状照卷六 :310：{day, resource, qty, total, currency}（日、资源、量、总价、计价资源；量与总价各以资源、计价资源自己的最小记账单位计，不折算，卷六 §3.1 `tradeCount` :174）。
// 同一窗口里若有多种计价资源，惯常价取成交额加权的众数币（平局取代号字典序最小，卷六 §4.14 规则 2 :918），只用该币的记录求均价；不同币的数额不相加（不折算）。
// `demand` 入口（卷六 §4.4.2 :488、:159）：四来源 use、derived、replace、stockup 的输入（家户与用度类计数方式、作业记录、成员日需量、取暖折算量）尚未建，
// 按体检丙3 B 档与丙7 已裁的处置，各项返回未知并带各自缺口代号，perDay 为未知（null），不是 0、不是缺省（卷六 :220、:224；卷四 :39 同款处置）。
// 本文件不认任何物品、资源、用途、币种代号；规则层 import 只来自 kernelApi 与同层模块。

import { priceFor } from './price.mjs';
import { clockView } from './kernel/scheduler.mjs';
import { kindOf } from './kernel/vocab.mjs';
import { itemOfResource } from './kernel/item-state.mjs';
import { fixedUnits, fixedDivide, fixedToNumber } from './kernel/det-math.mjs';
import { E } from './kernel/handles/generated.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const isCount = (v) => Number.isSafeInteger(v) && v >= 0;

// 卷六 §2.5 :230 的键名；缺口代号 rules.<表>.<键> 同估值的写法。
const RULE = Object.freeze({ table: 'demand', window: 'expectWindowDays', minTrades: 'minTradesForHabit' });
const FIELD = Object.freeze({ day: 'day', resource: 'resource', qty: 'qty', total: 'total', currency: 'currency' });
const BASIS = Object.freeze({ trades: 'trades', valuation: 'valuation' });
const GAP = Object.freeze({ puse: 'habitual.puseCode', item: 'habitual.resourceItem' });
const rulesGap = (key) => `rules.${RULE.table}.${key}`;

function deny(code, detail) {
  const e = new Error(`${code} ${detail}`);
  e.code = code;
  e.fields = {};
  return e;
}

function ruleInt(engine, key) {
  const t = isObj(engine.rules) && isObj(engine.rules[RULE.table]) ? engine.rules[RULE.table] : undefined;
  const v = t !== undefined && Object.hasOwn(t, key) ? t[key] : undefined;
  return Number.isSafeInteger(v) && v >= 1 ? v : null;
}

// 成交记录逐条核形状：缺字段、非整数、量不为正、总价为负都拒（不当零，不跳过）。
function checkRecord(r, i) {
  const at = `trades[${i}]`;
  if (!isObj(r)) throw deny(E.E_DIM_STRUCT_FIELD, `${at} is not a record`);
  if (!Number.isSafeInteger(r[FIELD.day])) throw deny(E.E_DIM_STRUCT_FIELD, `${at}.${FIELD.day} must be an integer world day`);
  for (const k of [FIELD.resource, FIELD.currency]) if (typeof r[k] !== 'string' || r[k].length < 1) throw deny(E.E_DIM_STRUCT_FIELD, `${at}.${k} must be a resource kind code`);
  if (!Number.isSafeInteger(r[FIELD.qty]) || r[FIELD.qty] < 1) throw deny(E.E_DIM_DOMAIN_RANGE, `${at}.${FIELD.qty} must be a positive integer`);
  if (!isCount(r[FIELD.total])) throw deny(E.E_DIM_DOMAIN_RANGE, `${at}.${FIELD.total} must be a non-negative integer`);
}

// 成交额加权的众数币（平局取代号字典序最小）及该币的数量与总价和。
function modeCurrency(records) {
  const by = new Map();
  for (const r of records) {
    const a = by.get(r[FIELD.currency]) || { total: 0n, qty: 0n };
    a.total += BigInt(r[FIELD.total]);
    a.qty += BigInt(r[FIELD.qty]);
    by.set(r[FIELD.currency], a);
  }
  const pick = [...by.keys()].sort((a, b) => (by.get(a).total > by.get(b).total ? -1 : by.get(a).total < by.get(b).total ? 1 : cmp(a, b)))[0];
  return { currency: pick, ...by.get(pick) };
}

/**
 * `habitualOf(engine, state, resource, trades, ctx)`（卷六 §4.4.3 规则 4）：某地某货的惯常成交量与惯常价。纯读，不写状态。
 * trades：该地点 `marketTrades` 的记录（调用方传入，形状见文件头）；resource：资源种类代号；今日取状态时钟的世界日，窗口是 [今日 − expectWindowDays + 1, 今日]。
 * 返回 {known, basis, trades, qtyPerDay, price, priceUnit, gaps}：
 *   basis 'trades'：窗口内该货成交数 ≥ minTradesForHabit，qtyPerDay = 窗口内量之和 ÷ expectWindowDays，price = 众数币记录的总价和 ÷ 量之和，priceUnit 是该币代号；
 *   basis 'valuation'：成交不足，qtyPerDay 为 0，price 取 priceFor(ctx.puseCode, 该货对应的物品模板, ctx.priceCtx) 的值（ctx.puseCode 必须是估值角色且不含稀缺项的用途行，由调用方择定，本函数不替它挑）；
 *   两键规则表值缺（rules.demand.expectWindowDays、minTradesForHabit）或估值未知：known 为假、price 为 null，gaps 给缺口代号，不回退、不当零。
 * @param {object} engine @param {object} state @param {string} resource @param {readonly object[]} trades
 * @param {{puseCode?: string, priceCtx?: object}} [ctx]
 */
export function habitualOf(engine, state, resource, trades, ctx = {}) {
  if (typeof resource !== 'string' || resource.length < 1) throw deny(E.E_DIM_REQUIRED_MISSING, 'habitualOf needs a resource kind code');
  if (!Array.isArray(trades)) throw deny(E.E_DIM_STRUCT_FIELD, 'habitualOf needs the marketTrades records of the place as a list');
  trades.forEach(checkRecord);
  const window = ruleInt(engine, RULE.window);
  const minTrades = ruleInt(engine, RULE.minTrades);
  const gaps = [...(window === null ? [rulesGap(RULE.window)] : []), ...(minTrades === null ? [rulesGap(RULE.minTrades)] : [])];
  const unknown = (...more) => Object.freeze({ known: false, basis: null, trades: 0, qtyPerDay: null, price: null, priceUnit: null, gaps: Object.freeze([...new Set([...gaps, ...more])].sort(cmp)) });
  if (gaps.length) return unknown();

  const today = clockView(engine, state).day;
  const inWindow = trades.filter((r) => r[FIELD.resource] === resource && r[FIELD.day] > today - window && r[FIELD.day] <= today);
  if (inWindow.length >= minTrades) {
    const sumQty = inWindow.reduce((a, r) => a + BigInt(r[FIELD.qty]), 0n);
    const m = modeCurrency(inWindow);
    return Object.freeze({
      known: true, basis: BASIS.trades, trades: inWindow.length,
      qtyPerDay: fixedToNumber(fixedDivide(fixedUnits(sumQty), fixedUnits(window))),
      price: fixedToNumber(fixedDivide(fixedUnits(m.total), fixedUnits(m.qty))), priceUnit: m.currency, gaps: Object.freeze([]),
    });
  }
  // 成交不足：惯常成交量取零，惯常价取这件货自己的估值角色价（不含稀缺项）。
  const item = itemOfResource(engine, resource);
  if (item === null) return unknown(GAP.item);
  if (typeof ctx.puseCode !== 'string' || ctx.puseCode.length < 1) return unknown(GAP.puse);
  const puse = engine.vocab.index.get(ctx.puseCode);
  if (!puse || !isObj(puse.entry) || puse.entry.includesScarcity !== false) throw deny(E.E_DIM_REF_MISSING, `habitualOf: ${JSON.stringify(ctx.puseCode)} must be a puse row that excludes the scarcity term (vol6 s4.4.3 rule 4)`);
  const p = priceFor(engine, state, ctx.puseCode, item, isObj(ctx.priceCtx) ? ctx.priceCtx : {});
  if (!p.known) return unknown(...p.gaps);
  return Object.freeze({ known: true, basis: BASIS.valuation, trades: inWindow.length, qtyPerDay: 0, price: p.value, priceUnit: p.unit, gaps: Object.freeze([...(p.gaps || [])]) });
}

// 四来源各自的缺口代号（挂卡写在注释里，卡落地后该项改读真输入、删对应代号）。
const KIND = Object.freeze({ place: 'place', item: 'item', pool: 'pool' }); // 实体 kind 与词表族名（卷二 §1.9）
const PART = Object.freeze({ use: 'use', derived: 'derived', replace: 'replace', stockup: 'stockup' });
const PART_GAPS = Object.freeze({
  // 卷六 §4.12 规则 1：家户组织行（卷十八，块 7 首张卷十八卡）；usage_per 条目的计数方式（卷三乙 :301 无字段，待裁）；成员身体日需量（卷四 §4.7，补值卡与卷二十一）；取暖折算量 fuelEnergyMJ 与热交换（补值卡 E、卷二十 §4.5）。
  [PART.use]: ['demand.use.household', 'demand.use.usagePerCount', 'demand.use.memberDailyNeed', 'demand.use.heatingEnergy'],
  // 卷六 §4.4.3 规则 1 第二项、§4.9 规则 2：作业记录 jobs（卷二 §1.5 未登记结构，写者 production.mjs，生产卡）。
  [PART.derived]: ['demand.derived.jobs'],
  // 卷六 §4.4.3 规则 1 第三项：在用件数按卷三乙 D-5 :1393 取持有（持有人集合依赖家户）；“当前磨损折算”卷六 :492 无式，待裁。
  [PART.replace]: ['demand.replace.holders', 'demand.replace.wearTerm'],
  // 卷六 §4.4.3 规则 1 第四项：覆盖天数 coverDaysByTier 登在 rules.demand.unbuilt；差额要读 use 与现存库存。
  [PART.stockup]: ['rules.demand.coverDaysByTier', 'demand.stockup.use'],
});

/**
 * `demand(engine, state, scope, goodRef, horizonDays)`（卷六 §4.4.2 :488）：范围内某货（物品模板或替代池代号）在时域内的每日需求。
 * scope 是一个地点代号或地点代号列表（非空）；horizonDays 是不小于 1 的整数。返回 {known, perDay, parts: {use, derived, replace, stockup}, gaps}：
 * 四项输入都未建，每项 {known:false, value:null, gaps}，perDay 为 null（任一项未知则整体未知），不当 0、不取缺省；gaps 是各项缺口的并集。纯读。
 * @param {object} engine @param {object} state @param {string | string[]} scope @param {string} goodRef @param {number} horizonDays
 */
export function demand(engine, state, scope, goodRef, horizonDays) {
  const places = typeof scope === 'string' ? [scope] : scope;
  if (!Array.isArray(places) || places.length < 1) throw deny(E.E_DIM_REQUIRED_MISSING, 'demand needs a place or a non-empty list of places as scope');
  for (const p of places) if (typeof p !== 'string' || kindOf(p) !== KIND.place) throw deny(E.E_DIM_REF_MISSING, `demand: scope member ${JSON.stringify(p)} is not a place`);
  const isPool = typeof goodRef === 'string' && engine.vocab.index instanceof Map && engine.vocab.index.get(goodRef)?.family === KIND.pool;
  if (typeof goodRef !== 'string' || (!isPool && kindOf(goodRef) !== KIND.item)) throw deny(E.E_DIM_REF_MISSING, `demand: ${JSON.stringify(goodRef)} is neither an item template nor a pool`);
  if (!Number.isSafeInteger(horizonDays) || horizonDays < 1) throw deny(E.E_DIM_DOMAIN_RANGE, 'demand: horizonDays must be an integer not less than 1');
  const parts = Object.fromEntries(Object.values(PART).map((k) => [k, Object.freeze({ known: false, value: null, gaps: Object.freeze([...PART_GAPS[k]].sort(cmp)) })]));
  const gaps = [...new Set(Object.values(PART).flatMap((k) => PART_GAPS[k]))].sort(cmp);
  return Object.freeze({ known: false, perDay: null, parts: Object.freeze(parts), gaps: Object.freeze(gaps) });
}
