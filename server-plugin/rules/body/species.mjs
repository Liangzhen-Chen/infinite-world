// 物种读入口 speciesView（卷四 §3.1 :409）：§2.1 全部维度（惰性 getter，经 modified 给修正后值）与派生字段 capabilityBaseline、meanDailyFoodNeed、meanMassKg。
// 不写状态；不认任何具体物种代号，维度集合取物种表头。表头标 derived 的维度（卷四 S-3、卷十六 R16-2.1 等）本卡不建派生，读出未知。
import { modified } from '../../kernel/dimensions.mjs';
import { kindOfEntity } from '../../kernel/storage.mjs';
import { KernelError } from '../../kernel/errors.mjs';
import { fixedToNumber } from '../../kernel/det-math.mjs';
import { SPECIES_KIND, DIM, tableOf, planKindOf, structuralBase } from './body-plan.mjs';

/** 未知 Fact（卷二 §2.2 :488：未知 → {known:false, applicable:true}）。 */
export const UNKNOWN = Object.freeze({ known: false, applicable: true, current: true, value: null });

/**
 * @param {import('./body-plan.mjs').BodyEngine} engine @param {unknown} state
 * @param {string} speciesId 物种行 id，或以物种行为 template 新建的实体 id（卷二:131）；不是物种即 E-DIM-REF-MISSING
 * @returns {Readonly<{kind: string, id: string, dims: Readonly<Record<string, unknown>>, capabilityBaseline: Readonly<Record<string, number>>, meanMassKg: typeof UNKNOWN, meanDailyFoodNeed: typeof UNKNOWN}>}
 */
export function speciesView(engine, state, speciesId) {
  if (kindOfEntity(engine, state, speciesId) !== SPECIES_KIND) throw new KernelError('E-DIM-REF-MISSING', {}, `speciesView: ${JSON.stringify(speciesId)} is not a species`);
  const defs = Object(tableOf(engine, SPECIES_KIND).dimensions);
  /** @type {Record<string, unknown>} */
  const dims = {};
  for (const d of Object.keys(defs).sort()) {
    Object.defineProperty(dims, d, { enumerable: true, get: () => (Object(defs[d]).derived !== undefined ? UNKNOWN : modified(engine, state, SPECIES_KIND, speciesId, d)) });
  }
  const planId = modified(engine, state, SPECIES_KIND, speciesId, DIM.bodyPlan).value;
  const parts = modified(engine, state, planKindOf(engine), planId, DIM.parts).value;
  const capabilityBaseline = Object.freeze(Object.fromEntries([...structuralBase(engine, parts)].map(([k, c]) => [k, fixedToNumber(c.base)])));
  // meanMassKg：bodyMassKg 分布的均值（卷四 S-3），读分布参数的原语未建（_unbuilt-derived.json species.meanMassKg）；meanDailyFoodNeed 依卷三甲营养，未建。
  return Object.freeze({ kind: SPECIES_KIND, id: speciesId, dims: Object.freeze(dims), capabilityBaseline, meanMassKg: UNKNOWN, meanDailyFoodNeed: UNKNOWN });
}
