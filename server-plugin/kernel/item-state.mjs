// 物品实例与批次的读法、成色与新鲜的锚点式（卷三乙《物态类别与物品》§4.4 容器与批次 K-1、K-2、K-8；§4.10 耐久与劣化 D-1、D-2；
// §4.12 腐坏与保质 P-1、P-3、P-4、P-7；§3.1 :420–:425 lotsView、containerView；§2.3 :225 批次与实例维度；块 6 第 6-3 张）。
// 状态：实例 `itemInstances.<id>`（模板、taint、品质档、耐久与锚点日、腐坏与锚点日……）、批次 `stockLots.<持有人>.<用途>.<资源种类>.<批次键>`（只存属性），
// 批次数量只在账本余额 `accounts.…`（卷三乙 §2.3 :264）；本文件纯读，不写状态（写者见 dimension-writers.mjs、ledger.mjs、server-plugin/item-lots.mjs、item-condition.mjs）。
// 锚点式（D-2、P-1）：存的是锚点日的值，读到的是"锚点值 + 锚点日之后各日环境累计量 × 率 × 保存系数"，与推进方式无关；条件变化才重设锚点（写者做）。
// 环境累计：腐坏读逐日温度经 rules.rot.tempCurve 的累加 C，劣化读逐日湿度经 rules.wear.envCurve 的累加 H；两者都是"地点→气候输入"的纯函数。
// 地点到气候输入的接线（地点所在天气单元、纬度）属地点表（6-7），本文件只读登记的接线函数 registerPlaceEnv；没有登记或接线给不出就按未知带缺口，不借常数。
// 不认任何物品、材料、类别、物态代号；族条目的字段按登记读；数值一律经 det-math 定点。

import { KernelError, codeOf } from './errors.mjs';
import { clockView, minutesPerDay } from './scheduler.mjs';
import { dim } from './dimensions.mjs';
import { materialView, itemView } from './item.mjs';
import { dailyMeanTemp, tempAt } from './climate.mjs';
import { weatherAt } from './weather.mjs';
import { lotsUnmergeable, resourceAllows, SCHEMA as LEDGER } from './ledger.mjs';
import { buildE } from './handles/generated.mjs';
import { placeClimateInput } from './place.mjs';
import { kindOf } from './vocab.mjs';
import { fixedUnits, fixedUnits8, fixedAdd, fixedSub, fixedMultiply, fixedMultiply8, fixedDivide, fixedDivide8, fixedToNumber, fixedToNumber8, fixedScale, fixedCurveAt } from './det-math.mjs';

const E = buildE();
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// 状态顶层键、规则表、表头维度名（固定记号，单一定义）；表代号 item、material 是维度表的 kind。
const KIND = Object.freeze({ item: 'item' });
const ST = Object.freeze({ instances: 'itemInstances', lots: 'stockLots', accounts: 'accounts' });
const RT = Object.freeze({ rot: 'rot', wear: 'wear', kernelConstants: 'kernelConstants' });
const RK = Object.freeze({ tempCurve: 'tempCurve', stages: 'stages', mergeMaxGap: 'mergeMaxGap', envCurve: 'envCurve', radix: 'handleRadix' });
const F = Object.freeze({
  template: 'template', taint: 'taint', durability: 'durability', wearAnchorDay: 'wearAnchorDay', spoilage: 'spoilage', rotAnchorDay: 'rotAnchorDay',
  qualityTier: 'qualityTier', enteredDay: 'enteredDay', source: 'source', purports: 'purports', batchTag: 'batchTag', material: 'material', project: 'project',
  temperature: 'temperature', burn: 'burn', leakAnchorDay: 'leakAnchorDay', oreGrade: 'oreGrade',
});
const DIMN = Object.freeze({
  wearPerUse: 'wearPerUse', dailyUses: 'dailyUses', volumeCapacity: 'volumeCapacity', maxLoadKg: 'maxLoadKg', sealed: 'sealed', holdsLiquid: 'holdsLiquid',
  accepts: 'accepts', rotRate: 'rotRate', corrosionRate: 'corrosionRate', wearResistance: 'wearResistance', massKg: 'massKg', volumeL: 'volumeL',
  possibleMatterStates: 'possibleMatterStates',
});
const FAMILY = Object.freeze({ resource: 'resource', matter: 'matter' });
const RES_FIELD = Object.freeze({ item: 'item' });
const MATTER_FLAG = Object.freeze({ needsHolds: 'needsHolds', needsSealed: 'needsSealed' });
// 坏透日外推的最长日数读物品表头 `shelfLifeDays` 的取值域上限（卷三乙 §2.2 [0,36500]），不在本文件写数。
const SHELF = 'shelfLifeDays';
const CAUSE = Object.freeze({ use: 'use', worn: 'worn', passive: 'passive', damage: 'damage' });
const GAP = Object.freeze({ env: 'place_env_unbuilt', weather: 'weather_ctx_unbuilt', anchor: 'rot_anchor_missing', wearAnchor: 'wear_anchor_missing', clock: 'clock_unset', humidity: 'weather_humidity' });

const KNOWN = (value, extra = {}) => Object.freeze({ known: true, applicable: true, value, ...extra });
const UNKNOWN = (...gaps) => Object.freeze({ known: false, applicable: true, gaps: Object.freeze([...new Set(gaps)].sort()) });
const NA = Object.freeze({ known: false, applicable: false });

// ---------- 读状态 ----------

function at(state, ...segs) {
  let cur = state;
  for (const s of segs) {
    if (!isObj(cur) || !Object.hasOwn(cur, s)) return undefined;
    cur = cur[s];
  }
  return cur;
}

const ruleVal = (engine, table, key) => (isObj(engine.rules) && isObj(engine.rules[table]) && Object.hasOwn(engine.rules[table], key) ? engine.rules[table][key] : undefined);

/**
 * 实例行（模板、taint、各实例维度）；不是实例即 undefined。
 * @param {any} state @param {string} id
 */
export function instanceRow(state, id) {
  const r = at(state, ST.instances, id);
  return isObj(r) ? r : undefined;
}

/** 世界日序（clockView.day）；时钟未设按 null（读者按未知带缺口）。 */
function todayOf(engine, state) {
  try { return clockView(engine, state).day; } catch (e) {
    if (codeOf(e) === E.E_DIM_UNKNOWN_READ) return null;
    throw e;
  }
}

// ---------- 资源种类与批次 ----------

/**
 * 物品模板对应的资源种类（goods 族条目带 item 字段指向模板；一件物品一行资源种类，卷六 §2.1 :104）。
 * @param {any} engine @param {string} itemId
 * @returns {string[]}
 */
export function resourceKindsOf(engine, itemId) {
  const out = [];
  for (const [code, rec] of engine.vocab.index) if (rec.family === FAMILY.resource && isObj(rec.entry) && rec.entry[RES_FIELD.item] === itemId) out.push(code);
  return out.sort(cmp);
}

/**
 * 资源种类对应的物品模板；没有指向即 null。
 * @param {any} engine @param {string} kind
 * @returns {string | null}
 */
export function itemOfResource(engine, kind) {
  const rec = engine.vocab.index.get(kind);
  return rec && rec.family === FAMILY.resource && isObj(rec.entry) && typeof rec.entry[RES_FIELD.item] === 'string' ? rec.entry[RES_FIELD.item] : null;
}

function radixOf(engine) {
  const r = ruleVal(engine, RT.kernelConstants, RK.radix);
  if (!Number.isSafeInteger(r)) throw new KernelError('E-RULES-UNREGISTERED', {}, 'rules.kernelConstants.handleRadix is not set');
  return r;
}

/**
 * 批次键的序号（批次键即 lot_＋序号按 handleRadix 进制，先后由序号承担，卷三乙 §2.3 :264）。
 * @param {any} engine @param {string} lotKey
 * @returns {number}
 */
export function lotSeq(engine, lotKey) {
  return parseInt(lotKey.slice(LEDGER.lotPrefix.length), radixOf(engine));
}

/** 批次引用 lotRef = {account: {holder, purpose, kind}, lotKey} 的形状核对与取值。 */
function lotParts(ref) {
  if (!isObj(ref) || !isObj(ref.account) || typeof ref.lotKey !== 'string') return null;
  const { holder, purpose, kind } = ref.account;
  return typeof holder === 'string' && typeof purpose === 'string' && typeof kind === 'string' ? { holder, purpose, kind, lotKey: ref.lotKey } : null;
}

const lotAttrs = (state, p) => at(state, ST.lots, p.holder, p.purpose, p.kind, p.lotKey);
const lotQty = (state, p) => at(state, ST.accounts, p.holder, p.purpose, p.kind, p.lotKey);

// ---------- 地点环境接线（卷二十 §4.5 温度、§4.3 湿度） ----------

// 主体所在处的气候输入：持有人是地点时读 place.mjs 的唯一定义 placeClimateInput（单元解析与纬度推导都在那里，本文件不另写）；
// 持有人不是地点（人物所在处读人物表，未建）、实例（所在处走持有边，装入关系未登记）给不出（null，按未知带缺口）。
// 天气上下文（湿度）给不出：世界种子流代号登记 rules.seedKeys 未建，自然劣化读数因此按未知带缺口。
const ENV_OF_KIND = Object.freeze({ __proto__: null, place: placeClimateInput });
function envOf(engine, state, subject) {
  if (subject.holder === undefined) return null;
  let kind;
  try { kind = kindOf(subject.holder); } catch (e) {
    if (codeOf(e) === E.E_DIM_REF_MISSING) return null;
    throw e;
  }
  const input = ENV_OF_KIND[kind];
  return input ? input(engine, state, subject.holder) : null;
}

// 逐日累计量的记忆：按（接线给的 input 对象，曲线）记，只省重算，值与不记忆逐位相同；不入存档。
const dayMemo = new WeakMap();
function memoOf(owner, curve) {
  let byCurve = dayMemo.get(owner);
  if (!byCurve) { byCurve = new WeakMap(); dayMemo.set(owner, byCurve); }
  let m = byCurve.get(curve);
  if (!m) { m = new Map(); byCurve.set(curve, m); }
  return m;
}

const curvePoints = (c) => (Array.isArray(c) ? c.map(([x, y]) => [fixedUnits(x), fixedUnits(y)]) : null);

// 一日的腐坏温度因子 f(d) = tempCurve(当日温度)（定点）。室外取日均温（纯函数）；围合与地下取当日正午温度（室内温度由热源与围护决定，卷二十 §4.5）。
function rotDayFactor(engine, env, curve, d) {
  const memo = memoOf(env.input, curve);
  if (memo.has(d)) return memo.get(d);
  const inp = env.input;
  const perDay = minutesPerDay(engine);
  const t = inp.enclosed === true || inp.underground === true ? tempAt(engine, inp, d * perDay + (perDay >> 1)) : dailyMeanTemp(engine, inp, d);
  const v = t.known ? fixedCurveAt(curvePoints(curve), t.fixed) : { gaps: t.gaps };
  memo.set(d, v);
  return v;
}

// 一日的劣化湿度因子 g(d) = envCurve(当日湿度)（定点）。
function wearDayFactor(engine, env, curve, d) {
  if (!isObj(env.weather)) return { gaps: [GAP.weather] };
  const memo = memoOf(env.weather, curve);
  if (memo.has(d)) return memo.get(d);
  const w = weatherAt(engine, env.weather, d);
  const v = w.humidity.known ? fixedCurveAt(curvePoints(curve), w.humidity.fixed) : { gaps: w.humidity.gaps || [GAP.humidity] };
  memo.set(d, v);
  return v;
}

// 锚点日（不含）到某日（含）逐日因子之和；任一日未知即带缺口返回。
function sumFactors(day0, day1, factorAt) {
  let sum = 0n;
  for (let d = day0 + 1; d <= day1; d++) {
    const f = factorAt(d);
    if (typeof f !== 'bigint') return { gaps: f.gaps };
    sum += f;
  }
  return { sum };
}

// ---------- 材料聚合率 ----------

// 物品模板的聚合材料量（M-1）：{known, applicable, value}；整件不适用（没有可腐份、没有耐用份）交 applicable:false。
function aggregated(engine, state, templateId, key) {
  const v = materialView(engine, state, templateId, { dimensions: [key] }).dims[key];
  if (v.applicable === false) return NA;
  return v.known === true && typeof v.value === 'number' ? KNOWN(v.value) : UNKNOWN(key);
}

// 坏透日外推的最长日数：物品表头 shelfLifeDays 的取值域上限；表头没有即 0（不外推，坏透日按未知）。
function horizonDays(engine) {
  const def = engine.tables.get(KIND.item).doc.dimensions[SHELF];
  return isObj(def) && Array.isArray(def.domain) && Number.isSafeInteger(def.domain[1]) ? def.domain[1] : 0;
}

// 容器的保存系数（K-7）：不在容器内为 1。装入关系本卡没有可读的存放处（持有种类里没有登记装入关系），故恒为 1。
const preserveNone = () => fixedUnits(1);

// ---------- 腐坏（P-1、P-3、P-4） ----------

/**
 * 某批次或可腐实例在世界日 day 的腐坏进度（P-1，锚点式）：存的 spoilage ＋ trunc(腐坏率 × 保存系数 ×（C(day) − C(锚点日)))，上限 1。
 * subject：{template, stored: 锚点日的 spoilage, anchorDay, holder? , instance?}。返回 Fact（value 为 [0,1] 的数；未知带 gaps；整件不可腐 applicable:false）。
 * @param {any} engine @param {any} state @param {{template: string, stored: number, anchorDay: number, holder?: string, instance?: string}} subject @param {number} day
 * @returns {any}
 */
export function spoilageOn(engine, state, subject, day) {
  const rate = aggregated(engine, state, subject.template, DIMN.rotRate);
  if (!rate.applicable) return NA;
  if (!rate.known) return rate;
  if (!Number.isSafeInteger(day) || day < subject.anchorDay) throw new KernelError('E-DIM-DOMAIN-RANGE', {}, `spoilage read day ${day} is before the anchor day ${subject.anchorDay}`);
  const stored = fixedUnits(subject.stored);
  if (day === subject.anchorDay || rate.value === 0) return KNOWN(fixedToNumber(stored));
  const curve = ruleVal(engine, RT.rot, RK.tempCurve);
  if (!Array.isArray(curve) || !curve.length) return UNKNOWN('rules.rot.tempCurve');
  const env = envOf(engine, state, subject.holder !== undefined ? { holder: subject.holder } : { instance: subject.instance });
  if (!env || !isObj(env.input)) return UNKNOWN(GAP.env);
  const s = sumFactors(subject.anchorDay, day, (d) => rotDayFactor(engine, env, curve, d));
  if (s.sum === undefined) return UNKNOWN(...s.gaps);
  const add = fixedMultiply(fixedMultiply(fixedUnits(rate.value), preserveNone()), s.sum);
  const total = fixedAdd(stored, add);
  const one = fixedUnits(1);
  return KNOWN(fixedToNumber(total > one ? one : total));
}

// 腐坏档（P-3、P-7）：当日进度落在哪一档＝minSpoilage 不大于它的最后一档的下标；规则表没给档表即 null。
function stageOf(engine, spoilage) {
  const list = ruleVal(engine, RT.rot, RK.stages);
  if (!Array.isArray(list) || !list.length) return null;
  let idx = null;
  list.forEach((s, i) => { if (fixedUnits(s.minSpoilage) <= fixedUnits(spoilage)) idx = i; });
  return idx;
}

// 批次或实例上没有腐坏进度或锚点日：整件不可腐才是"不适用"；可腐物这两字段必填（卷三乙 §2.3 :271–:272），缺了是数据错，
// 读数按未知带缺口（不当不可腐，永不坏、永不结算就是绕过）。
function absentAnchor(engine, state, template) {
  const rate = aggregated(engine, state, template, DIMN.rotRate);
  return { none: true, fact: rate.applicable ? UNKNOWN(GAP.anchor) : NA };
}

function rotSubject(engine, state, ref) {
  if (typeof ref === 'string') {
    const row = instanceRow(state, ref);
    if (!row) throw new KernelError('E-DIM-REF-MISSING', { entity: ref }, `${JSON.stringify(ref)} is not an item instance`);
    if (typeof row[F.spoilage] !== 'number' || !Number.isSafeInteger(row[F.rotAnchorDay])) return absentAnchor(engine, state, row[F.template]);
    return { template: row[F.template], stored: row[F.spoilage], anchorDay: row[F.rotAnchorDay], instance: ref };
  }
  const p = lotParts(ref);
  if (!p) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'rot ref is an instance id or lotRef {account: {holder, purpose, kind}, lotKey}');
  const a = lotAttrs(state, p);
  if (!isObj(a)) throw new KernelError('E-DIM-REF-MISSING', { entity: p.holder }, `lot ${p.lotKey} has no ${ST.lots} row`);
  const template = itemOfResource(engine, p.kind);
  if (template === null) throw new KernelError('E-DIM-REF-MISSING', { entity: p.holder }, `resource kind ${p.kind} has no item (resource entry field ${RES_FIELD.item})`);
  if (typeof a[F.spoilage] !== 'number' || !Number.isSafeInteger(a[F.rotAnchorDay])) return absentAnchor(engine, state, template);
  return { template, stored: a[F.spoilage], anchorDay: a[F.rotAnchorDay], holder: p.holder, lot: p };
}

/**
 * kernelApi `rotStep(engine, state, ref, days)`（卷三乙 §4.12.2）：ref 是 lotRef 或可腐实例的 id。返回 days 天后（days 为 0 即当日）的
 * {spoilage: Fact, stage: 档下标或 null, expiresDay: 坏透日或 null, transform, reanchor}。纯读。
 * expiresDay＝使 P-1 式首次达到 1 的最小日期（式子对日期单调，倍增后二分，不超过保质日数取值域上限 36500 日；放着不坏或没有可腐份为 null）。
 * reanchor：锚点日不是当日时给"把当日值写回、锚点日设为当日"的提案 {spoilage, rotAnchorDay}（由写者 item-lots.mjs 执行）；已是当日为 null。
 * transform：当日值已到 1 时给坏透提案 {to: 'sink'}（P-4 的可腐份入去处；转腐殖类产物与不可腐份留存需配方、rawForm 数据，登记缺口，不在本卡）；否则 null。
 * @param {any} engine @param {any} state @param {string | {account: {holder: string, purpose: string, kind: string}, lotKey: string}} ref @param {number} days @param {{expiry?: boolean}} [options] expiry 为假时不求坏透日（日拍只判当日值）
 */
export function rotStep(engine, state, ref, days, options = {}) {
  if (!Number.isSafeInteger(days) || days < 0) throw new KernelError('E-DIM-DOMAIN-RANGE', {}, 'rotStep: days must be a non-negative integer');
  const today = todayOf(engine, state);
  if (today === null) return Object.freeze({ spoilage: UNKNOWN(GAP.clock), stage: null, expiresDay: null, transform: null, reanchor: null });
  const s = rotSubject(engine, state, ref);
  if (s.none) return Object.freeze({ spoilage: s.fact, stage: null, expiresDay: null, transform: null, reanchor: null });
  const at0 = (d) => spoilageOn(engine, state, s, d);
  const target = at0(today + days);
  const now = days === 0 ? target : at0(today);
  let expires = null;
  if (options.expiry !== false && target.known && target.applicable) {
    const horizon = horizonDays(engine);
    let hi = Math.max(s.anchorDay + 1, today);
    let hv = at0(hi);
    while (hv.known && hv.value < 1 && hi - s.anchorDay < horizon) { hi += hi - s.anchorDay; hv = at0(hi); }
    if (hv.known && hv.value >= 1) {
      let lo = s.anchorDay;
      while (hi - lo > 1) { const mid = lo + ((hi - lo) >> 1); if (at0(mid).value >= 1) hi = mid; else lo = mid; }
      expires = at0(s.anchorDay).value >= 1 ? s.anchorDay : hi;
    }
  }
  const stage = target.known ? stageOf(engine, target.value) : null;
  const reanchor = now.known && s.anchorDay !== today ? Object.freeze({ spoilage: now.value, rotAnchorDay: today }) : null;
  const transform = now.known && now.value >= 1 ? Object.freeze({ to: 'sink' }) : null;
  return Object.freeze({ spoilage: target, stage, expiresDay: expires, transform, reanchor });
}

// 坏透结算的去处代号与材料表可腐率维度（卷六 :1246 sink_decay "腐坏、磨损殆尽、自然损耗"；卷三乙 P-4）。
const ROT = Object.freeze({ sink: 'sink_decay', material: 'material' });

/**
 * kernelApi `rottenLots(engine, state)`（卷三乙 P-4；itemRot 钩子用）：已坏透、可以结算的批次清单，按账户与批次键升序。
 * 条件：今日腐坏进度读得出且已到 1（rotStep 给出坏透提案）、物品每一份材料都可腐（整件可腐：P-4 里不可腐的份要按 rawForm 留下、可腐份转腐殖类产物，
 * 这些要配方与 rawForm 数据，本卡没有，所以有不可腐份的批次不在清单里，留在账上，进度封顶 1）、该物品的资源种类行 sinks 登了 sink_decay。
 * @param {any} engine @param {any} state
 * @returns {readonly {account: {holder: string, purpose: string, kind: string}, lotKey: string, qty: number}[]}
 */
export function rottenLots(engine, state) {
  const out = [];
  const accounts = at(state, ST.accounts);
  for (const holder of Object.keys(isObj(accounts) ? accounts : {}).sort(cmp)) {
    for (const purpose of Object.keys(accounts[holder]).sort(cmp)) {
      for (const kind of Object.keys(accounts[holder][purpose]).sort(cmp)) {
        const template = itemOfResource(engine, kind);
        if (template === null || !resourceAllows(engine, kind, ROT.sink)) continue;
        const shares = itemViewShares(engine, state, template);
        if (!shares.length || !shares.every((s) => dim(engine, state, ROT.material, s.materialRef, DIMN.rotRate).applicable)) continue;
        for (const lotKey of Object.keys(accounts[holder][purpose][kind]).sort((a, b) => lotSeq(engine, a) - lotSeq(engine, b))) {
          const qty = accounts[holder][purpose][kind][lotKey];
          if (!(qty > 0)) continue;
          const r = rotStep(engine, state, { account: { holder, purpose, kind }, lotKey }, 0, { expiry: false });
          if (r.transform !== null) out.push(Object.freeze({ account: { holder, purpose, kind }, lotKey, qty }));
        }
      }
    }
  }
  return Object.freeze(out);
}

function itemViewShares(engine, state, templateId) {
  const m = itemView(engine, state, templateId).dims.material;
  return m && m.known && Array.isArray(m.value) ? m.value.filter((s) => s.share > 0) : [];
}

// ---------- 成色（D-1、D-2） ----------

/**
 * 实例在世界日 day 的耐久（D-2，锚点式）：存的 durability − trunc(劣化率 × 保存系数 ×（H(day) − H(锚点日)))，下限 0。
 * 劣化率是按 M-1 聚合的 corrosionRate（整件没有耐用份即不适用）；H 是逐日湿度经 rules.wear.envCurve 的累加。
 * 当日就是锚点日、或劣化率为 0 时不读环境，直接是存的值。
 * @param {any} engine @param {any} state @param {string} instanceId @param {number} day
 * @returns {any}
 */
export function durabilityOn(engine, state, instanceId, day) {
  const row = instanceRow(state, instanceId);
  if (!row) throw new KernelError('E-DIM-REF-MISSING', { entity: instanceId }, `${JSON.stringify(instanceId)} is not an item instance`);
  if (typeof row[F.durability] !== 'number' || !Number.isSafeInteger(row[F.wearAnchorDay])) return aggregated(engine, state, row[F.template], DIMN.corrosionRate).applicable ? UNKNOWN(GAP.wearAnchor) : NA;
  const anchor = row[F.wearAnchorDay];
  if (!Number.isSafeInteger(day) || day < anchor) throw new KernelError('E-DIM-DOMAIN-RANGE', {}, `durability read day ${day} is before the anchor day ${anchor}`);
  const stored = fixedUnits8(row[F.durability]);
  if (day === anchor) return KNOWN(fixedToNumber8(stored));
  const rate = aggregated(engine, state, row[F.template], DIMN.corrosionRate);
  if (!rate.applicable) return KNOWN(fixedToNumber8(stored));
  if (!rate.known) return rate;
  if (rate.value === 0) return KNOWN(fixedToNumber8(stored));
  const curve = ruleVal(engine, RT.wear, RK.envCurve);
  if (!Array.isArray(curve) || !curve.length) return UNKNOWN('rules.wear.envCurve');
  const env = envOf(engine, state, { instance: instanceId });
  if (!env || !isObj(env.input)) return UNKNOWN(GAP.env);
  const s = sumFactors(anchor, day, (d) => wearDayFactor(engine, env, curve, d));
  if (s.sum === undefined) return UNKNOWN(...s.gaps);
  // 自然劣化量按 10⁴ 标度算（率与湿度累计本是 10⁴ 的数，D-2 例 0.9136），升到 10⁸ 标度（乘 SCALE，不丢位）再从 10⁸ 的存值里减。
  const loss = fixedMultiply(fixedMultiply(fixedUnits(rate.value), preserveNone()), s.sum) * fixedScale();
  const left = stored - loss;
  return KNOWN(fixedToNumber8(left < 0n ? 0n : left));
}

/**
 * kernelApi `wearStep(engine, state, instanceId, cause)`（卷三乙 §4.10.2）：返回 {delta: Fact, fault: null}（提案，不写状态）。
 * cause 是代号 use / worn / passive / damage：
 * use＝一次用损 wearPerUse ÷ wearResistance（D-1，两量按 M-1 与表头读；wearResistance 读聚合量）；worn＝一日穿用 dailyUses 次用损（D-4）；
 * passive＝自上次锚点至今日的自然劣化量（D-2，即存的耐久与当日耐久之差）；damage＝伤害量由调用方给（卷十三），本入口不替它定，按未知带缺口。
 * fault 随故障（卷三乙 §4.9）卡，这里恒 null。
 * @param {any} engine @param {any} state @param {string} instanceId @param {string} cause
 */
export function wearStep(engine, state, instanceId, cause) {
  if (!Object.values(CAUSE).includes(cause)) throw new KernelError('E-DIM-DOMAIN-ENUM', { entity: instanceId }, `wearStep cause ${JSON.stringify(cause)} is not one of ${Object.values(CAUSE).join('/')}`);
  const row = instanceRow(state, instanceId);
  if (!row) throw new KernelError('E-DIM-REF-MISSING', { entity: instanceId }, `${JSON.stringify(instanceId)} is not an item instance`);
  const out = (delta) => Object.freeze({ delta, fault: null });
  if (cause === CAUSE.damage) return out(UNKNOWN('damage_amount'));
  if (cause === CAUSE.passive) {
    const today = todayOf(engine, state);
    if (today === null) return out(UNKNOWN(GAP.clock));
    const d = durabilityOn(engine, state, instanceId, today);
    return out(d.known ? KNOWN(fixedToNumber8(fixedUnits8(row[F.durability]) - fixedUnits8(d.value))) : d);
  }
  return out(wearCost(engine, state, row, cause, 1));
}

// 模板维度的值，读表头定义的路径 dim()（wearPerUse、dailyUses 必填 byClass:comp_durable，材料派生组件由 dimensions.mjs 的成员关系算入）；
// 不适用或行上没写即 undefined（按未知，不当 0）。
function templateValue(engine, state, templateId, key) {
  const f = dim(engine, state, KIND.item, templateId, key);
  return f.known && typeof f.value === 'number' ? f.value : undefined;
}

// 用损量（D-1、D-4）：use＝times × wearPerUse ÷ wearResistance；worn＝一日 dailyUses 次用损。先乘次数、后除耐磨，定点向零截断，次数越多截断损失越小。
// 耐久是 stockMode extScale 字段（precision 8，卷二 §3.3 第 6 条），用损全程在 10⁸ 标度算（李白 11-19 20:3x ③）：单次 0.002 ÷ 60 不再截成 0。
function wearCost(engine, state, row, cause, times) {
  const perUse = templateValue(engine, state, row[F.template], DIMN.wearPerUse);
  const resist = aggregated(engine, state, row[F.template], DIMN.wearResistance);
  if (!resist.applicable) return NA;
  if (perUse === undefined || !resist.known) return UNKNOWN(DIMN.wearPerUse, DIMN.wearResistance);
  let count = fixedUnits8(times);
  if (cause === CAUSE.worn) {
    const uses = templateValue(engine, state, row[F.template], DIMN.dailyUses);
    if (uses === undefined) return UNKNOWN(DIMN.dailyUses);
    count = fixedMultiply8(count, fixedUnits8(uses));
  }
  return KNOWN(fixedToNumber8(fixedDivide8(fixedMultiply8(fixedUnits8(perUse), count), fixedUnits8(resist.value))));
}

/**
 * kernelApi `useWear(engine, state, instanceId, times)`（卷三乙 D-1、D-2；写者 item-condition.mjs 用）：用损提案——返回要写的 {durability, wearAnchorDay}（不写状态）。
 * 每用一次耐久减 wearPerUse ÷ wearResistance（wearStep 的 use），共 times 次，下限 0。
 * 今日耐久读得出（自然劣化可算，或当日就是锚点日）：重设锚点（D-2）——写回「今日耐久 − 用损」，锚点日设为今日；
 * 今日耐久读不出（环境接线或曲线没给，自然劣化未知）：只从存的值里扣用损、锚点日不动——自然劣化是锚点后的累计量，与用损相加不分先后，结果同重设锚点一样，且不编自然劣化量。
 * 实例没有耐久维度（整件不要求耐久）即 null。
 * @param {any} engine @param {any} state @param {string} instanceId @param {number} times
 */
export function useWear(engine, state, instanceId, times) {
  if (!Number.isSafeInteger(times) || times < 1) throw new KernelError('E-DIM-DOMAIN-RANGE', {}, 'useWear: times is a positive integer');
  const row = instanceRow(state, instanceId);
  if (!row) throw new KernelError('E-DIM-REF-MISSING', { entity: instanceId }, `${JSON.stringify(instanceId)} is not an item instance`);
  if (typeof row[F.durability] !== 'number' || !Number.isSafeInteger(row[F.wearAnchorDay])) {
    if (aggregated(engine, state, row[F.template], DIMN.corrosionRate).applicable) throw new KernelError('E-DIM-UNKNOWN-READ', { entity: instanceId }, 'useWear: a durable instance has no durability or anchor day (required, vol3b s2.3 :225)');
    return null;
  }
  const today = todayOf(engine, state);
  if (today === null) throw new KernelError('E-DIM-UNKNOWN-READ', { entity: instanceId }, 'useWear: the world clock is not set');
  const step = wearCost(engine, state, row, CAUSE.use, times);
  if (!step.known) throw new KernelError('E-DIM-UNKNOWN-READ', { entity: instanceId }, `useWear: per-use wear is unknown (${(step.gaps || []).join(',') || 'not applicable'})`);
  const cost = fixedUnits8(step.value);
  const now = durabilityOn(engine, state, instanceId, today);
  const base = now.known ? fixedUnits8(now.value) : fixedUnits8(row[F.durability]);
  const left = base - cost;
  return Object.freeze({ durability: fixedToNumber8(left < 0n ? 0n : left), wearAnchorDay: now.known ? today : row[F.wearAnchorDay] });
}

/**
 * kernelApi `lotMergeVerdict(engine, state, a, b)`（卷三乙 K-3；item-lots.mjs 用）：同一账户同一种类的两批 a、b（lotRef）可不可以合并：
 * ① 账本侧判同键与空条件（lotsUnmergeable）；② 腐坏侧——两批都不可腐则无需判；否则两批今日腐坏进度都读得出、落在同一腐坏档、进度差不超 rules.rot.mergeMaxGap
 * （规则表没给 stages 或 mergeMaxGap 即按读不出，不合并，不编数）。可合并时给合并后的腐坏进度：按两批余额（件数之比即质量之比，判同键含 material 相同）加权平均，定点 4 位向零截断。
 * 返回 {ok, reason, spoilage}（spoilage 不可腐时 null）。
 * @param {any} engine @param {any} state @param {{account: {holder: string, purpose: string, kind: string}, lotKey: string}} a @param {{account: {holder: string, purpose: string, kind: string}, lotKey: string}} b
 * @returns {{ok: boolean, reason: string | null, spoilage: number | null}}
 */
export function lotMergeVerdict(engine, state, a, b) {
  const pa = lotParts(a);
  const pb = lotParts(b);
  if (!pa || !pb || pa.holder !== pb.holder || pa.purpose !== pb.purpose || pa.kind !== pb.kind) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'lotMergeVerdict: two lotRefs of the same account and kind');
  const A = lotAttrs(state, pa);
  const B = lotAttrs(state, pb);
  if (!isObj(A) || !isObj(B)) throw new KernelError('E-DIM-REF-MISSING', { entity: pa.holder }, 'lotMergeVerdict: both lots have a stockLots row');
  const bad = lotsUnmergeable(A, B);
  if (bad !== null) return Object.freeze({ ok: false, reason: bad, spoilage: null });
  const ra = rotStep(engine, state, a, 0);
  const rb = rotStep(engine, state, b, 0);
  if (!ra.spoilage.applicable && !rb.spoilage.applicable) return Object.freeze({ ok: true, reason: null, spoilage: null });
  if (ra.spoilage.applicable !== rb.spoilage.applicable) return Object.freeze({ ok: false, reason: 'rot applies to one lot only', spoilage: null });
  if (!ra.spoilage.known || !rb.spoilage.known) return Object.freeze({ ok: false, reason: 'spoilage unknown', spoilage: null });
  const gap = ruleVal(engine, RT.rot, RK.mergeMaxGap);
  if (typeof gap !== 'number' || ra.stage === null || rb.stage === null) return Object.freeze({ ok: false, reason: 'rules.rot stages or mergeMaxGap unbuilt', spoilage: null });
  if (ra.stage !== rb.stage) return Object.freeze({ ok: false, reason: 'different rot stages', spoilage: null });
  const d = fixedSub(fixedUnits(ra.spoilage.value), fixedUnits(rb.spoilage.value));
  if ((d < 0n ? -d : d) > fixedUnits(gap)) return Object.freeze({ ok: false, reason: 'spoilage gap exceeds rules.rot.mergeMaxGap', spoilage: null });
  const qa = lotQty(state, pa);
  const qb = lotQty(state, pb);
  const num = fixedAdd(fixedMultiply(fixedUnits(ra.spoilage.value), fixedUnits(qa)), fixedMultiply(fixedUnits(rb.spoilage.value), fixedUnits(qb)));
  return Object.freeze({ ok: true, reason: null, spoilage: fixedToNumber(fixedDivide(num, fixedUnits(qa + qb))) });
}

// ---------- 读入口：实例与批次 ----------

/**
 * kernelApi `instanceView(engine, state, id)`：物品实例 id → {id, template, taint, qualityTier, madeDay, …, durability, spoilage}。
 * 带时间锚点的量（durability、spoilage）返回今日值的 Fact（卷三乙 §3.1 :420），不是存的锚点值；没有该维度的实例对应项为 null。不是实例返回 null。
 * @param {any} engine @param {any} state @param {string} id
 */
export function instanceView(engine, state, id) {
  const row = instanceRow(state, id);
  if (!row) return null;
  const today = todayOf(engine, state);
  const rest = Object.fromEntries(Object.keys(row).filter((k) => ![F.durability, F.wearAnchorDay, F.spoilage, F.rotAnchorDay].includes(k)).sort(cmp).map((k) => [k, row[k]]));
  const durability = typeof row[F.durability] === 'number' ? (today === null ? UNKNOWN(GAP.clock) : durabilityOn(engine, state, id, today)) : null;
  const spoilage = typeof row[F.spoilage] === 'number' ? rotStep(engine, state, id, 0).spoilage : null;
  return Object.freeze({ id, ...rest, durability, spoilage });
}

/**
 * kernelApi `lotsView(engine, state, holderId, itemId, purpose)`（卷三乙 §4.4.2）：某账户某物的批次清单，按批次键序号升序（先后由序号承担）。
 * 每项 {lotKey, qty, attrs, spoilage, stage, expiresDay}；spoilage 是今日值的 Fact（不可腐为 applicable:false，未知带缺口）。只读。
 * @param {any} engine @param {any} state @param {string} holderId @param {string} itemId @param {string} purpose
 * @returns {readonly object[]}
 */
export function lotsView(engine, state, holderId, itemId, purpose) {
  const out = [];
  for (const kind of resourceKindsOf(engine, itemId)) {
    const bucket = at(state, ST.accounts, holderId, purpose, kind);
    if (!isObj(bucket)) continue;
    for (const lotKey of Object.keys(bucket)) {
      if (bucket[lotKey] === 0) continue;
      const attrs = at(state, ST.lots, holderId, purpose, kind, lotKey);
      const r = rotStep(engine, state, { account: { holder: holderId, purpose, kind }, lotKey }, 0);
      out.push({ lotKey, kind, qty: bucket[lotKey], attrs: isObj(attrs) ? attrs : {}, spoilage: r.spoilage, stage: r.stage, expiresDay: r.expiresDay });
    }
  }
  out.sort((a, b) => lotSeq(engine, a.lotKey) - lotSeq(engine, b.lotKey));
  return Object.freeze(out.map((x) => Object.freeze(x)));
}

// ---------- 容器（K-1、K-2） ----------

const flagOf = (engine, matterCode, flag) => {
  const rec = engine.vocab.index.get(matterCode);
  return rec && rec.family === FAMILY.matter && isObj(rec.entry) ? rec.entry[flag] : undefined;
};

// 某物品模板此刻的物态：可能物态集恰有一项即那一项；多于一项需物温（§4.11 matterStateOf，本卡没有）按未知；集合未知即未知。
function matterNow(engine, state, templateId) {
  const v = itemView(engine, state, templateId);
  const s = v && v.dims[DIMN.possibleMatterStates];
  return s && s.known && Array.isArray(s.value) && s.value.length === 1 ? s.value[0] : null;
}

/**
 * kernelApi `containerView(engine, state, instanceId)`（卷三乙 §4.4.2）：容器实例 → {contents, usedL, usedKg, freeL, freeKg}（数为 Fact 值）。
 * 容器不作账本持有人，装入走持有边（K-2）；持有种类里至今没有登记装入关系，所以内容物恒为空，已用为 0。登记装入关系的卡接上时在此读持有边。
 * @param {any} engine @param {any} state @param {string} instanceId
 */
export function containerView(engine, state, instanceId) {
  const row = instanceRow(state, instanceId);
  if (!row) throw new KernelError('E-DIM-REF-MISSING', { entity: instanceId }, `${JSON.stringify(instanceId)} is not an item instance`);
  const cap = dim(engine, state, 'item', row[F.template], DIMN.volumeCapacity);
  const load = dim(engine, state, 'item', row[F.template], DIMN.maxLoadKg);
  if (!cap.applicable) throw new KernelError('E-DIM-REF-MISSING', { entity: instanceId }, `${instanceId} is not a container (no ${DIMN.volumeCapacity})`);
  return Object.freeze({ contents: Object.freeze([]), usedL: 0, usedKg: 0, freeL: cap.known ? cap.value : null, freeKg: load.known ? load.value : null });
}

/**
 * kernelApi `canContain(engine, state, containerId, itemRef, qty)`（卷三乙 §4.4.2、K-1）：返回 {ok, reason}，reason 是代号
 * volume / load / accepts / leak / matter_unknown。itemRef 是物品模板 id、批次引用或实例 id；qty 是件数（可为小数）。
 * 物态取装入那一刻的物态（本卡无物温，只在可能物态集恰一项时确定，否则 matter_unknown，不许装入）；该物态条目 needsHolds 为真须装进 holdsLiquid 的容器、
 * needsSealed 为真须装进 sealed 的容器（读条目的布尔字段，不点名哪种物态，不合 reason 为 leak）；accepts 非空时物品的组件类、各份材料的本源成分或派生大类、
 * 当时物态代号须与之相交；体积合计不超 volumeCapacity、质量合计不超 maxLoadKg。已有内容物取 containerView（今恒为空）。
 * @param {any} engine @param {any} state @param {string} containerId @param {any} itemRef @param {number} qty
 */
export function canContain(engine, state, containerId, itemRef, qty) {
  const row = instanceRow(state, containerId);
  if (!row) throw new KernelError('E-DIM-REF-MISSING', { entity: containerId }, `${JSON.stringify(containerId)} is not an item instance`);
  if (!(typeof qty === 'number' && qty > 0)) throw new KernelError('E-DIM-DOMAIN-RANGE', {}, 'canContain qty must be > 0');
  const tpl = typeof itemRef === 'string' ? (instanceRow(state, itemRef) ? instanceRow(state, itemRef)[F.template] : itemRef) : itemOfResource(engine, itemRef.account.kind);
  if (tpl === null) throw new KernelError('E-DIM-REF-MISSING', {}, 'canContain: item reference has no item template');
  const view = itemView(engine, state, tpl);
  if (!view) throw new KernelError('E-DIM-REF-MISSING', {}, `canContain: ${tpl} is not an item template`);
  const c = dim(engine, state, 'item', row[F.template], DIMN.volumeCapacity);
  const used = containerView(engine, state, containerId);
  const matter = matterNow(engine, state, tpl);
  if (matter === null) return Object.freeze({ ok: false, reason: 'matter_unknown' });
  const holdsLiquid = dim(engine, state, 'item', row[F.template], DIMN.holdsLiquid);
  const sealed = dim(engine, state, 'item', row[F.template], DIMN.sealed);
  const accepts = dim(engine, state, 'item', row[F.template], DIMN.accepts);
  if (flagOf(engine, matter, MATTER_FLAG.needsHolds) === true && holdsLiquid.value !== true) return Object.freeze({ ok: false, reason: 'leak' });
  if (flagOf(engine, matter, MATTER_FLAG.needsSealed) === true && sealed.value !== true) return Object.freeze({ ok: false, reason: 'leak' });
  if (accepts.known && Array.isArray(accepts.value) && accepts.value.length > 0) {
    const tags = new Set([...view.classes, matter]);
    const shares = view.dims.material && view.dims.material.known ? view.dims.material.value : [];
    for (const s of shares) {
      const m = materialView(engine, state, s.materialRef).dims;
      for (const k of ['substance', 'categories']) {
        const val = m[k] && m[k].known ? m[k].value : null;
        for (const x of Array.isArray(val) ? val : val === null || val === undefined ? [] : [val]) tags.add(x);
      }
    }
    if (!accepts.value.some((a) => tags.has(a))) return Object.freeze({ ok: false, reason: 'accepts' });
  }
  const vol = view.dims[DIMN.volumeL];
  const mass = view.dims[DIMN.massKg];
  const maxKg = dim(engine, state, 'item', row[F.template], DIMN.maxLoadKg);
  // 容量或载重上限未知（读不出）不当"不限"：按装不下拒，不放行。
  if (!c.known || !vol.known || fixedAdd(fixedUnits(used.usedL), fixedMultiply(fixedUnits(qty), fixedUnits(vol.value))) > fixedUnits(c.value)) return Object.freeze({ ok: false, reason: 'volume' });
  if (!maxKg.known || !mass.known || fixedAdd(fixedUnits(used.usedKg), fixedMultiply(fixedUnits(qty), fixedUnits(mass.value))) > fixedUnits(maxKg.value)) return Object.freeze({ ok: false, reason: 'load' });
  return Object.freeze({ ok: true, reason: null });
}

/**
 * kernelApi `loadPlan(engine, state, batches, containers)`（卷三乙 §4.4.2、K-9；纯函数）：分户时的容器装载方案。
 * batches 是 [{item: 物品模板, qty: 件数（正整数）}]，containers 是容器实例 id 列表。凡按 T-2 须装进容器的批次（所处物态条目 needsHolds 或 needsSealed 为真）
 * 才参与；次序：批次按物品代号升序，容器按实例 id 升序，逐件装到 K-1 判为装不下为止（体积、载重按此前已装入本方案的量累计）；装不进的留在 left，不分出去。
 * 返回 {placed: [{container, item, qty}], left: [{item, qty}]}（无需容器的批次不出现在两者里）。
 * @param {any} engine @param {any} state @param {{item: string, qty: number}[]} batches @param {string[]} containers
 * @returns {{placed: {container: string, item: string, qty: number}[], left: {item: string, qty: number}[]}}
 */
export function loadPlan(engine, state, batches, containers) {
  const used = new Map();
  const placed = [];
  const left = [];
  const ids = [...containers].sort(cmp);
  for (const b of [...batches].sort((x, y) => cmp(x.item, y.item))) {
    const matter = matterNow(engine, state, b.item);
    const needs = matter !== null && (flagOf(engine, matter, MATTER_FLAG.needsHolds) === true || flagOf(engine, matter, MATTER_FLAG.needsSealed) === true);
    if (!needs) continue;
    const view = itemView(engine, state, b.item);
    const vol = view.dims[DIMN.volumeL];
    const mass = view.dims[DIMN.massKg];
    let rest = b.qty;
    for (const c of ids) {
      if (rest === 0) break;
      const row = instanceRow(state, c);
      if (!row || !vol.known || !mass.known || !canContain(engine, state, c, b.item, 1).ok) continue;
      const u = used.get(c) || { l: fixedUnits(0), kg: fixedUnits(0) };
      const capL = fixedUnits(dim(engine, state, KIND.item, row[F.template], DIMN.volumeCapacity).value);
      const capKg = fixedUnits(dim(engine, state, KIND.item, row[F.template], DIMN.maxLoadKg).value);
      let n = 0;
      while (n < rest && fixedAdd(u.l, fixedMultiply(fixedUnits(n + 1), fixedUnits(vol.value))) <= capL && fixedAdd(u.kg, fixedMultiply(fixedUnits(n + 1), fixedUnits(mass.value))) <= capKg) n++;
      if (n === 0) continue;
      used.set(c, { l: fixedAdd(u.l, fixedMultiply(fixedUnits(n), fixedUnits(vol.value))), kg: fixedAdd(u.kg, fixedMultiply(fixedUnits(n), fixedUnits(mass.value))) });
      placed.push({ container: c, item: b.item, qty: n });
      rest -= n;
    }
    if (rest > 0) left.push({ item: b.item, qty: rest });
  }
  return { placed, left };
}

// ---------- 加载期校验（P-7） ----------

/**
 * 规则表 rules.rot、rules.wear 的跨键校验：stages 的 minSpoilage 严格递增且首档为 0（P-7）；tempCurve 单调不降（P-7，曲线值不为负由本函数补查）；
 * envCurve 值不为负；mergeMaxGap 在 [0,1] 由类型域查。返回错误行（同 checkLedgerTables 格式）。
 * @param {Record<string, any>} rules engine.rules
 */
export function checkItemStateTables(rules) {
  const errors = [];
  const push = (code, table, row, got, want) => errors.push({ code, level: 'L2', table: `rules.${table}`, row, dim: '', path: `rules.${table}#/${row}`, got, want });
  const rot = isObj(rules.rot) ? rules.rot : {};
  if (Array.isArray(rot.stages)) {
    const ms = rot.stages.map((s) => s.minSpoilage);
    if (ms.length && ms[0] !== 0) push('E-DIM-DOMAIN-RANGE', 'rot', RK.stages, ms[0], 'first stage minSpoilage is 0');
    if (ms.some((x, i) => i > 0 && !(x > ms[i - 1]))) push('E-DIM-DOMAIN-RANGE', 'rot', RK.stages, ms, 'minSpoilage strictly increasing');
  }
  if (Array.isArray(rot.tempCurve) && rot.tempCurve.some((p, i) => i > 0 && p[1] < rot.tempCurve[i - 1][1])) push('E-DIM-DOMAIN-CURVE', 'rot', RK.tempCurve, rot.tempCurve.map((p) => p[1]), 'tempCurve monotone non-decreasing');
  if (Array.isArray(rot.tempCurve) && rot.tempCurve.some((p) => p[1] < 0)) push('E-DIM-DOMAIN-CURVE', 'rot', RK.tempCurve, rot.tempCurve.map((p) => p[1]), 'tempCurve values >= 0');
  const wear = isObj(rules.wear) ? rules.wear : {};
  if (Array.isArray(wear.envCurve) && wear.envCurve.some((p) => p[1] < 0)) push('E-DIM-DOMAIN-CURVE', 'wear', RK.envCurve, wear.envCurve.map((p) => p[1]), 'envCurve values >= 0');
  return errors;
}
