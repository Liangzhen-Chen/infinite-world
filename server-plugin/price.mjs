// 价格四角色的统一入口 `priceFor`（卷六《经济》§4.21.2 :1195、§4.21.3 规则 1、2、5、8、9；块 6 第 6-9 张）：全书任何模块要“一个价”只调本入口并说明用途；
// 入口不提供缺省价（规则 1），按用途行的 `role` 路由到估值（卷三乙 §4.16 `valuation`）、成交报价（卷六 §4.2 marketQuote，6-12 起）、合同条款（§4.16）或源汇限额表（§4.1 规则 6），
// 估不出就如实返回未知与缺口代号，不回退到旧价、不回退到零（规则 5、9）。纯函数：不写任何状态（规则 8）；explain 的各项连乘等于结果。
// 本卡路由：`prole_worth` 估值角色（经 valuation 取内在值，按用途行的 includesScarcity 决定是否乘稀缺项，供需只计一次，卷三乙 §4.16.2）；
// 其余角色的路由所在卡（成交 6-12，已签条款与源汇限额表随各自卷）未建，按未知带缺口 price_route_unbuilt:<角色> 交出，不编数。
// 急售折价（用途行 liquidationCurveKey 非空）要读 market.json 的 liquidationCurve 与当地日成交量（卷六 §4.2，6-12 起，表未登记），读不到按未知带缺口，不当不折。
// 用途行（词表族 puse）的字段含义只在卷六 §2.2；本文件不认任何用途代号、物品代号，不按用途代号分支。规则层 import 只来自 kernelApi。

import { valuation } from './kernel/valuation.mjs';
import { fixedUnits, fixedMultiply, fixedToNumber } from './kernel/det-math.mjs';
import { E } from './kernel/handles/generated.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// 卷六 §2.2、§4.21 的固定记号：词表族名、估值角色代号（prole 是封闭四项）、用途行字段名；价的精度同物品表头 valueBase（铜，四位）即定点标度，定点乘法本身截到这一位。
const FAMILY = Object.freeze({ puse: 'puse' });
const ROLE = Object.freeze({ worth: 'prole_worth' });
const FIELD = Object.freeze({ role: 'role', includesScarcity: 'includesScarcity', liquidationCurveKey: 'liquidationCurveKey', basisRule: 'basisRule', frame: 'frame' });
const UNIT = 'copper';
const GAP = Object.freeze({ routeUnbuilt: 'price_route_unbuilt', liquidation: 'rules.market.liquidationCurve' });

// 登记码错误（形状同 kernel/errors.mjs#KernelError，按 e.code 认）。
function deny(code, detail) {
  const e = new Error(`${code} ${detail}`);
  e.code = code;
  e.fields = {};
  return e;
}

const unknown = (role, ...gaps) => Object.freeze({ known: false, applicable: true, role, gaps: Object.freeze([...new Set(gaps)].sort(cmp)), explain: Object.freeze([]) });

// 估值角色路由：valuation 给内在值 value 与单独的 scarcityFactor；includesScarcity 为真才把稀缺项乘上（供需只许计一次，卷三乙 §4.16.2）。
function routeWorth(engine, state, row, subjectRef, ctx) {
  const v = valuation(engine, state, subjectRef, { role: row[FIELD.role], frame: ctx.frame, place: ctx.place, supply: ctx.supply, demandPerDay: ctx.demandPerDay });
  if (!v.value.known) return unknown(row[FIELD.role], ...v.value.gaps);
  // 急售折价：曲线表与当地日成交量都在卷六 §4.2（6-12）建，这里读不到，不当“不折”。
  if (row[FIELD.liquidationCurveKey] !== null) return unknown(row[FIELD.role], GAP.liquidation);
  let acc = fixedUnits(v.value.value);
  const explain = v.explain.map((e) => ({ ...e }));
  const gaps = [...(v.value.gaps || [])];
  if (row[FIELD.includesScarcity] === true) {
    if (v.scarcityFactor.known) {
      acc = fixedMultiply(acc, fixedUnits(v.scarcityFactor.value));
      explain.push({ term: 'scarcity', factor: v.scarcityFactor.value });
    } else gaps.push(...v.scarcityFactor.gaps); // 稀缺项未知：按“不乘”并记缺口（卷三乙 V-3）
  }
  return Object.freeze({
    known: true, applicable: true, value: fixedToNumber(acc), unit: UNIT, role: row[FIELD.role], basis: row[FIELD.basisRule],
    partial: gaps.length > 0, gaps: Object.freeze([...new Set(gaps)].sort(cmp)), explain: Object.freeze(explain.map((e) => Object.freeze(e))),
  });
}

// 角色 → 路由（卷六 §4.21.2：用途行的 role 决定走哪条路；别的角色的路由随各自的卡加在这里）。
const ROUTES = Object.freeze({ [ROLE.worth]: routeWorth });

/**
 * `priceFor(engine, state, puseCode, subjectRef, ctx)` → Fact{value, role, explain}（卷六 §4.21.2；engine、state 是本仓库统一的读入口首两参）。
 * 先问用途再给价：puseCode 必给且必须是 puse 族条目，缺或不是即拒（规则 1，不设缺省价）。subjectRef 同卷三乙 valuation（模板、实例、批次引用、别类实体）。
 * ctx = {frame, place, supply, demandPerDay}：supply 是卷六 §4.2 规则 4 的 marketSupply 扣已买走量，demandPerDay 同规则 4（本入口原样交给估值，不自读账本）。
 * 估值未知：返回 known:false 与缺口代号 gaps（规则 5、9），不回退、不当零。
 * @param {object} engine @param {object} state @param {string} puseCode @param {string | object} subjectRef
 * @param {{frame?: unknown, place?: string, supply?: number | null, demandPerDay?: number | null}} [ctx]
 */
export function priceFor(engine, state, puseCode, subjectRef, ctx = {}) {
  if (puseCode === undefined || puseCode === null || (typeof puseCode === 'string' && puseCode.length < 1)) throw deny(E.E_DIM_REQUIRED_MISSING, 'priceFor needs a puseCode: the price depends on the use (vol6 s4.21.3 rule 1; there is no default price)');
  const rec = typeof puseCode === 'string' && engine.vocab.index instanceof Map ? engine.vocab.index.get(puseCode) : undefined;
  if (rec === undefined || rec.family !== FAMILY.puse || !isObj(rec.entry)) throw deny(E.E_DIM_REF_MISSING, `priceFor: ${JSON.stringify(puseCode)} is not an entry of the ${FAMILY.puse} family`);
  const row = rec.entry;
  const route = Object.hasOwn(ROUTES, row[FIELD.role]) ? ROUTES[row[FIELD.role]] : null;
  if (route === null) return unknown(row[FIELD.role], `${GAP.routeUnbuilt}:${row[FIELD.role]}`);
  return route(engine, state, row, subjectRef, isObj(ctx) ? ctx : {});
}
