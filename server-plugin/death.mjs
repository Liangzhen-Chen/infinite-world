// 个体死亡、尸体与复生的触发（卷四《生物身体与人物》§3.3 :414–:420、§4.8 :860–:922；终止协议与复生步骤在卷二 §2.6，内核 kernel/terminate.mjs）：
// `die`（全书致死的唯一入口，D-1、D-2）、`settleBody`（终止第 1 步的清理函数，只做尸体产出，D-3a、D-4）、`requestRevive`（个体复生的触发入口，D-6）、`carcassOf`（D-4 尸体质量与材料构成，D-5 屠宰输入）。
// 本文件是实参为个体的 `terminate`、`revive` 的唯一调用方；不读 status_family 条目的 terminal、不数终止类实例、不读 `state.terminated`（判死只调 action-capacity.mjs 的 `terminated`，§3.2）；
// 不删任何簿记路径（去留表由内核做，§2.6）；不 import 持有写者；不认任何物种、部位、材料、个体或物品代号。
// 卷四 D-4 :882：inherit、liquidate 时 settleBody 新建恰一件尸体；wreck 时协议原地生成的残骸实体就是尸体，本卷只给它补组件类与实例维度（残骸生成器 kernel 未建，补尸体组件类也未建）：
// wreck 整笔拒收 E-ACT-WRITER-NOT-READY，不另造第二份遗骸；
// 复生后的移位（placeSubject，6-27）、复生的付费与后果（报价上下文，卷九 R9-7.7）块 6 未建，登记的 revival.cost、revival.effects 非空即整笔拒收，不静默跳过。

import { terminate, revive, registerTerminationCleanup } from './kernel/terminate.mjs';
import { runDelegated } from './kernel/transaction.mjs';
import { createItemInstance, writeItemDeviation } from './kernel/dimension-writers.mjs';
import { rotStep, resourceKindsOf } from './kernel/item-state.mjs';
import { readPath, writePath } from './kernel/storage.mjs';
import { dim } from './kernel/dimensions.mjs';
import { kindOf, kindOfEntity, vocab } from './kernel/vocab.mjs';
import { clockView, minutesPerDay } from './kernel/scheduler.mjs';
import { fixedUnits, fixedAdd, fixedMultiply, fixedDivide, fixedToNumber, truncateTo } from './kernel/det-math.mjs';
import { E, P } from './kernel/handles/generated.mjs';
import { terminated } from './action-capacity.mjs';
import './status.mjs'; // 加载即交入被委托写者 status.mjs#addStatusInstance（registerDelegate）
import './item-lots.mjs'; // 同上：item-lots.mjs#initInstanceRot
import { bodyView } from './body.mjs';
import { massOf } from './life.mjs';

// 卷文定名：规则表键、维度、词表族与协议代号。
const S = Object.freeze({
  rules: Object.freeze({ table: 'death', terminalStatus: 'terminalStatus', lostPartsExcluded: 'lostPartsExcluded', corpseClass: 'corpseClass', corpsePurpose: 'corpsePurpose', unbuilt: 'unbuilt' }),
  dim: Object.freeze({ species: 'species', location: 'location', bodyPlan: 'bodyPlan', parts: 'parts', tissueFractions: 'tissueFractions', tissues: 'tissues', massKg: 'massKg', material: 'material', family: 'family' }),
  tables: Object.freeze({ item: 'item', species: 'species', status: 'status' }),
  precisionKey: 'precision',
  wreck: 'wreck',
  family: Object.freeze({ holdingKind: 'holding_kind' }),
  revival: Object.freeze({ field: 'revival', cooldownDays: 'cooldownDays', cost: 'cost', effects: 'effects' }),
  cleanupRef: 'death.mjs#settleBody',
  statusNode: 'status.mjs#addStatusInstance',
  lotsNode: 'item-lots.mjs#initInstanceRot',
  taint: 0,
  severity: 0,
  one: 1,
});

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// 登记码错误（形状同 kernel/errors.mjs#KernelError，kernel/transaction.mjs 的 codeOf 按 e.code 认）。
function deny(code, detail) {
  const e = new Error(`${code} ${detail}`);
  e.code = code;
  e.fields = {};
  return e;
}

const deathRule = (engine, key) => (isObj(engine.rules) && isObj(engine.rules[S.rules.table]) ? engine.rules[S.rules.table][key] : undefined);
const deathUnbuilt = (engine, key) => {
  const u = deathRule(engine, S.rules.unbuilt);
  return Array.isArray(u) && u.includes(key);
};
function need(engine, key) {
  const v = deathRule(engine, key);
  if (v === undefined) throw deny(deathUnbuilt(engine, key) ? E.E_ACT_WRITER_NOT_READY : E.E_RULES_UNREGISTERED, `rules.${S.rules.table}.${key} has no value${deathUnbuilt(engine, key) ? ' (registered unbuilt)' : ''}`);
  return v;
}

// ---------- carcassOf（D-4、D-5） ----------

/**
 * 尸体的质量与材料构成的共用算法（卷四 §4.8.3 D-4）：参与部位 {size: 定点 sizeFraction, material(t): 组织 t 的材料代号}；
 * 质量 = 总质量 × Σ参与部位 size；材料份额 = Σ_p (size_p × tissueFraction[t] 归到该材料) ÷ Σ size（分母为参与部位 size 之和，为 0 不做除法，返回 null）。
 * 份额逐项向零截断到 4 位，余量补给份额最大者（并列取代号最小）使份额之和恰为 1（§4.8.6 "材料份额之和为 1"）。
 */
function composition(parts, tissueFractions, totalMassFixed, precision) {
  const sizeSum = parts.reduce((s, p) => fixedAdd(s, p.size), 0n);
  if (sizeSum === 0n) return null;
  const acc = new Map();
  for (const p of parts) {
    for (const t of Object.keys(tissueFractions).sort(cmp)) {
      const m = p.material(t);
      acc.set(m, fixedAdd(acc.get(m) || 0n, fixedMultiply(p.size, fixedUnits(tissueFractions[t]))));
    }
  }
  const codes = [...acc.keys()].sort(cmp);
  const shares = new Map(codes.map((m) => [m, truncateTo(fixedDivide(acc.get(m), sizeSum), precision.share)]));
  let rest = fixedUnits(S.one);
  for (const m of codes) rest -= shares.get(m);
  const largest = codes.reduce((best, m) => (best === null || shares.get(m) > shares.get(best) ? m : best), null);
  shares.set(largest, shares.get(largest) + rest);
  return Object.freeze({
    massKg: fixedToNumber(truncateTo(fixedMultiply(totalMassFixed, sizeSum), precision.mass)),
    material: Object.freeze(Object.fromEntries(codes.map((m) => [m, fixedToNumber(shares.get(m))]))),
  });
}

// 尸体实例偏离行的两个数值的精度：读 item 表头 massKg 的 precision 与 material 列表元素 share 的 precision（不写数字）。
function precisionsOf(engine) {
  const dims = engine.tables.get(S.tables.item).doc.dimensions;
  return { mass: dims[S.dim.massKg][S.precisionKey], share: dims[S.dim.material].of.fields.share[S.precisionKey] };
}

const unknownRead = (what) => deny(E.E_DIM_UNKNOWN_READ, `carcassOf: ${what} is unknown`);

/**
 * `carcassOf(engine, state, {subjectId} | {speciesId, massKg})`（卷四 §4.8.2、D-4、D-5）→ `{massKg, material: map<ref material, fraction>}`，或 null（没有身体图的物种无实体；
 * 参与部位 sizeFraction 之和为 0：不做除法，按无遗骸）。个体：质量 = 主体 massKg × 参与部位 sizeFraction 之和（rules.death.lostPartsExcluded 为真时不计已丧失部位，即有效完好度 eff 为 0 者），
 * 材料构成按 B-9 读各部位各组织的材料（个体偏离 → 身体图部位 → 物种）；任一必需读数未知（体重、丧失阈值、某组织的材料）照抛 E-DIM-UNKNOWN-READ，不编值。
 * 物种均值（未个体化畜群，D-5）：质量取调用方给的 massKg，部位全部完好，材料取身体图部位覆盖或物种的组织材料。
 * @param {object} engine @param {object} state @param {{subjectId: string} | {speciesId: string, massKg: number}} target
 */
export function carcassOf(engine, state, target) {
  const excluded = need(engine, S.rules.lostPartsExcluded);
  if (isObj(target) && typeof target.subjectId === 'string') {
    const body = bodyView(engine, state, target.subjectId);
    if (body === null) return null;
    const planKind = kindOf(body.bodyPlan);
    const massFact = massOf(engine, state, target.subjectId);
    if (!massFact.known || typeof massFact.value !== 'number') throw unknownRead(`${S.dim.massKg} of ${target.subjectId}`);
    const fractions = dim(engine, state, planKind, body.bodyPlan, S.dim.tissueFractions);
    if (!fractions.known || !isObj(fractions.value)) throw unknownRead(`${S.dim.tissueFractions} of ${body.bodyPlan}`);
    const parts = [];
    for (const p of body.parts) {
      if (excluded === true) {
        if (p.eff === null) throw unknownRead('part effective integrity (rules.body.integrity.lostBelow)');
        if (!(p.eff > 0)) continue;
      }
      parts.push({
        size: fixedUnits(p.sizeFraction),
        material: (t) => {
          const f = p.tissues[t];
          if (!f || !f.known || typeof f.value !== 'string') throw unknownRead(`material of tissue ${t} on part ${p.id}`);
          return f.value;
        },
      });
    }
    return composition(parts, fractions.value, fixedUnits(massFact.value), precisionsOf(engine));
  }
  if (isObj(target) && typeof target.speciesId === 'string' && typeof target.massKg === 'number') {
    const sp = dim(engine, state, S.tables.species, target.speciesId, S.dim.bodyPlan);
    if (!sp.known || typeof sp.value !== 'string') return null;
    const planKind = kindOf(sp.value);
    const planParts = dim(engine, state, planKind, sp.value, S.dim.parts);
    const fractions = dim(engine, state, planKind, sp.value, S.dim.tissueFractions);
    if (!planParts.known || !Array.isArray(planParts.value) || !fractions.known || !isObj(fractions.value)) throw unknownRead(`body plan ${sp.value}`);
    const parts = planParts.value.map((p) => ({
      size: fixedUnits(p.sizeFraction),
      material: (t) => {
        if (isObj(p.tissueOverride) && typeof p.tissueOverride[t] === 'string') return p.tissueOverride[t];
        const m = dim(engine, state, S.tables.species, target.speciesId, S.dim.tissues, { key: t });
        if (!m.known || typeof m.value !== 'string') throw unknownRead(`material of tissue ${t} on part ${p.id}`);
        return m.value;
      },
    }));
    return composition(parts, fractions.value, fixedUnits(target.massKg), precisionsOf(engine));
  }
  throw deny(E.E_DIM_STRUCT_FIELD, 'carcassOf target is {subjectId} or {speciesId, massKg}');
}

// ---------- settleBody（D-3a、D-4） ----------

// 尸体物品模板：item 表里手写组件类含 rules.death.corpseClass 的行，须恰一行（模板挑选不按代号）。
function corpseTemplate(engine, corpseClass) {
  const doc = engine.tables.get(S.tables.item).doc;
  const rows = [...Object.entries(isObj(doc.rows) ? doc.rows : {}), ...Object.entries(isObj(doc.generated) ? doc.generated : {})];
  const hits = rows.filter(([, r]) => isObj(r) && Array.isArray(r.classes) && r.classes.includes(corpseClass)).map(([id, r]) => ({ id, row: r })).sort((a, b) => cmp(a.id, b.id));
  if (hits.length === 0) throw deny(E.E_ACT_WRITER_NOT_READY, `no item template carries corpse class ${corpseClass} (the corpse template row belongs to the item content cards)`);
  if (hits.length > 1) throw deny(E.E_DIM_STRUCT_FIELD, `${hits.length} item templates carry corpse class ${corpseClass}: exactly one is the corpse template`);
  return hits[0];
}

/**
 * `settleBody(engine, state, {id, cause, mode, successorId})`（卷四 §3.3 :419、§4.8.3 D-3a、D-4）：终止协议第 1 步里、写终止标记之前，由 kernel/terminate.mjs 调的清理函数（模块加载时经
 * registerTerminationCleanup 交入，登记在 systems.death.terminationCleanup），在个体终止时所在地点新建一件尸体物品（经物品写者 createItemInstance：账本 post 带登记来源的腿，
 * 同事务守恒，卷九 R9-2.7），写实例维度 ofSpecies、ofPerson、diedMinute，质量与材料构成按 carcassOf 写实例偏离行。carcassOf 为空（无实体、部位全无）不新建，恰一具或没有，不会两份。
 * 只做这一件事：不写身份键、不删任何路径、不调 terminate、revive，不读 state.terminated。
 * 实例模板取 item 表里唯一挂 rules.death.corpseClass 的行；来源代号取该资源种类行 sources 的唯一项；账户用途与材料组取自 rules.death.corpsePurpose 与模板参考组成的唯一组（任一不满足整笔拒收）。
 * @param {object} engine @param {object} state @param {{id: string, cause: string, mode: string, successorId: string | null}} info
 */
export function settleBody(engine, state, info) {
  // D-4：wreck 的残骸实体就是尸体（给它补 corpseClass 与实例维度），本卷不另造；补写未建（残骸生成器未建），不在残骸之外再新建一件。
  if (info.mode === S.wreck) throw deny(E.E_ACT_WRITER_NOT_READY, `${info.id}: wreck mode: the generated remains entity is the corpse (vol4 D-4), adding the corpse class to it is not built`);
  const corpseClass = need(engine, S.rules.corpseClass);
  const carcass = carcassOf(engine, state, { subjectId: info.id });
  if (carcass === null) return;
  const kind = kindOfEntity(state, info.id);
  const tpl = corpseTemplate(engine, corpseClass);
  const loc = dim(engine, state, kind, info.id, S.dim.location);
  if (!loc.known || typeof loc.value !== 'string') throw unknownRead(`${S.dim.location} of ${info.id} (the corpse lies where the person died)`);
  const sp = dim(engine, state, kind, info.id, S.dim.species);
  if (!sp.known || typeof sp.value !== 'string') throw unknownRead(`${S.dim.species} of ${info.id}`);
  const itemTable = engine.tables.get(S.tables.item).doc.entity;
  const diedMinute = clockView(engine, state).minute;
  // 尸体 id：物品前缀 + 死者 id + 死亡时刻（复生后再死是另一具尸体，id 不复用；id 超长按实体 id 文法拒）。
  const corpseId = `${itemTable.idPrefix[0]}${info.id}_${diedMinute}`;
  const kinds = resourceKindsOf(engine, tpl.id);
  const resourceRows = isObj(engine.rules) && isObj(engine.rules.economyResources) ? engine.rules.economyResources : {};
  const sources = kinds.length === 1 && isObj(resourceRows[kinds[0]]) ? resourceRows[kinds[0]].sources : null;
  if (!Array.isArray(sources) || sources.length !== 1) throw deny(E.E_DIM_STRUCT_FIELD, `corpse template ${tpl.id}: its resource kind lists exactly one source (the corpse's), got ${Array.isArray(sources) ? sources.length : 'no resource kind'}`);
  const groups = [...new Set((Array.isArray(tpl.row.material) ? tpl.row.material : []).map((m) => m.group))];
  if (groups.length !== 1) throw deny(E.E_DIM_STRUCT_FIELD, `corpse template ${tpl.id}: reference composition has exactly one material group, got ${groups.length}`);
  createItemInstance(engine, state, {
    id: corpseId, template: tpl.id, holder: loc.value, purpose: need(engine, S.rules.corpsePurpose), flow: sources[0], reason: info.cause, taint: S.taint,
    fields: { ofSpecies: sp.value, ofPerson: info.id, diedMinute },
  });
  writeItemDeviation(engine, state, corpseId, S.dim.massKg, carcass.massKg);
  writeItemDeviation(engine, state, corpseId, S.dim.material, Object.keys(carcass.material).sort(cmp).map((m) => ({ group: groups[0], materialRef: m, share: carcass.material[m] })));
  // 可腐实例（材料带可腐组件类）：腐坏初值与锚点日由 item-lots.mjs 在死亡日落下（卷三乙 §3.3）；不可腐的不适用，不写。
  const rot = rotStep(engine, state, corpseId, 0);
  if (rot.spoilage && rot.spoilage.applicable !== false && !rot.spoilage.known) runDelegated(state, S.lotsNode, engine, state, corpseId, 0);
}

// ---------- die（D-1、D-2、D-3） ----------

// D-2 写的终止类状态行：rules.death.terminalStatus（卷四 §2.5 :318，ref status，状态表里的一行代号；李白 11-19 22:0x ④）。必须是状态表里存在的行；这里不读 terminal 字段。
function terminalStatusRow(engine) {
  const row = need(engine, S.rules.terminalStatus);
  const t = engine.tables instanceof Map ? engine.tables.get(S.tables.status) : undefined;
  if (!(t && t.flat && t.flat.rows instanceof Map && t.flat.rows.has(row))) throw deny(E.E_DIM_REF_MISSING, `rules.${S.rules.table}.${S.rules.terminalStatus} ${JSON.stringify(row)} is not a row of the status table`);
  return row;
}

/**
 * `die(engine, state, subjectId, {cause, source})`（卷四 §3.3、§4.8.3 D-1 至 D-3）：全书致死的唯一入口，在调用方的事务里：
 * 已终止（`terminated` 谓词，§3.2）则无操作返回 `{already: true}`（幂等）；否则经 status.mjs 写入 rules.death.terminalStatus 所指状态行的实例（D-2），
 * 随后同一事务内调 terminate(subject, cause, source)（D-3；`cause` 是 kindOnly 死因行的 verb 句柄，`source` 可空，原样传下）。有没有复生点边都一样，不另设待复生状态。
 * 终止类实例由终止第 5 步清掉，提交后无痕。
 * @param {object} engine @param {object} state @param {string} subjectId @param {{cause: string, source: string | null}} how
 */
export function die(engine, state, subjectId, how) {
  if (!isObj(how) || typeof how.cause !== 'string') throw deny(E.E_DIM_STRUCT_FIELD, 'die needs {cause, source}');
  if (terminated(engine, state, subjectId).ok) return Object.freeze({ already: true });
  const status = terminalStatusRow(engine);
  runDelegated(state, S.statusNode, engine, state, { subject: subjectId, status, severity: S.severity, source: null, bodyPart: null });
  const r = terminate(engine, state, subjectId, how.cause, how.source === undefined ? null : how.source);
  return Object.freeze({ already: false, mode: r.mode, successorId: r.successorId });
}

// ---------- requestRevive（D-6） ----------

/**
 * `requestRevive(engine, state, subjectId, point, cause)`（卷四 §3.3、§4.8.3 D-6）：个体复生的触发入口，不是复生本身。`point` 是 `{kind, counterpart}`，`cause` 是 verb 句柄（传给 revive）。
 * 依次核对，任一不成立即 E-TERM-REVIVE-DENIED、不调 revive、不动任何状态：① `revivals.<主体>.points` 含该点；② 该点的对方 `counterpart` 未终止（`terminated` 谓词）；
 * ③ 该点 `kind` 所指持有种类行的 revival 维度非空；④ 距 `revivals.<主体>.lastMinute` 不少于 revival.cooldownDays（无记录视为满足）。
 * 主体是否已终止、是否仍在窗口内由内核 revive 自己核对并拒绝（不在此重复判断）。revival.cost 或 revival.effects 非空：付费需要付费方与账户用途（报价上下文，卷九 R9-7.7）、后果需要效果族执行，
 * 块 6 未建，整笔拒收 E-ACT-WRITER-NOT-READY（不静默当作免费）。成功后写 `revivals.<主体>.lastMinute` = 复生时刻；复生后的移位（placeSubject，卷十七，6-27）未建，不写位置。
 * @param {object} engine @param {object} state @param {string} subjectId @param {{kind: string, counterpart: string}} point @param {string} cause
 */
export function requestRevive(engine, state, subjectId, point, cause) {
  if (!isObj(point) || typeof point.kind !== 'string' || typeof point.counterpart !== 'string') throw deny(E.E_DIM_STRUCT_FIELD, 'requestRevive point is {kind, counterpart}');
  const denied = (why) => deny(E.E_TERM_REVIVE_DENIED, `${subjectId}: ${why}`);
  const points = readPath(state, P.revivals_points(subjectId));
  if (!Array.isArray(points) || !points.some((p) => p.kind === point.kind && p.counterpart === point.counterpart)) throw denied(`revivals.points has no point ${point.kind} at ${point.counterpart}`);
  if (terminated(engine, state, point.counterpart).ok) throw denied(`point counterpart ${point.counterpart} is terminated`);
  const row = vocab(engine, S.family.holdingKind, point.kind);
  const revival = row[S.revival.field];
  if (!isObj(revival)) throw denied(`holding kind ${point.kind} has no ${S.revival.field} (not a revival kind)`);
  const now = clockView(engine, state).minute;
  const last = readPath(state, P.revivals_lastMinute(subjectId));
  if (typeof last === 'number' && now - last < revival[S.revival.cooldownDays] * minutesPerDay(engine)) throw denied(`cooldown: ${revival[S.revival.cooldownDays]} days since the last revival`);
  if (revival[S.revival.cost] !== null && revival[S.revival.cost] !== undefined) throw deny(E.E_ACT_WRITER_NOT_READY, `${point.kind}: revival cost needs the payer and the account purpose from the quote context (vol9 R9-7.7), not built`);
  if (Array.isArray(revival[S.revival.effects]) && revival[S.revival.effects].length > 0) throw deny(E.E_ACT_WRITER_NOT_READY, `${point.kind}: revival effects need the effect-family executor, not built`);
  revive(engine, state, subjectId, cause);
  writePath(state, P.revivals_lastMinute(subjectId), now);
  return Object.freeze({ revived: true });
}

/**
 * 模块加载时把 `settleBody` 交给终止协议（卷二 §2.6 "领域清理的两个登记点"；handlerRef 与 state-owners systems.death.terminationCleanup.handler 一致）。
 * 导出供测试在 resetTermination 之后重登；正常装配靠 systems.mjs 的 import 触发加载时那一次。
 */
export function installDeath() {
  registerTerminationCleanup(S.cleanupRef, settleBody);
}
installDeath();
