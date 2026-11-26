// 尸体只读入口 carcassOf（卷四 §4.8.2 :874、D-4 :882、D-5、S-5 :473）：给主体或「物种 + 质量」推出尸体的质量与材料构成。纯读，不写状态。
// 写入口 die/settleBody 与终止协议属阶段 2 首卡 S2-0，本文件不做。
// 质量 = massKg × 参与部位 sizeFraction 之和（rules.death.lostPartsExcluded 为真时不计已丧失部位，eff = 0）；
// 材料 = 参与部位按大小加权的 Σ tissueFractions[t]，各组织按 B-9 优先级归到材料（同材料相加）；分母为参与部位 sizeFraction 之和，为 0 时无尸体。
// 物种 tissues 无非 null 键（S-5 无实体）时无尸体。无尸体返回 null。遍历一律经 presentEntries；不认任何具体代号。
import { presentEntries } from '../../kernel/dimensions.mjs';
import { kindOfEntity } from '../../kernel/storage.mjs';
import { KernelError } from '../../kernel/errors.mjs';
import { fixedUnits, fixedAdd, fixedMultiply, fixedDivide, fixedScale, fixedToNumber } from '../../kernel/det-math.mjs';
import { SPECIES_KIND, fixedZero } from './body-plan.mjs';
import { bodyOf, bodyView, tissueMaterial } from './body.mjs';
import { ruleValue } from '../load/registry.mjs';

/** @typedef {{subjectId: string} | {speciesId: string, massKg: number}} CarcassArg */

/**
 * kernelApi 读入口 carcassOf(engine, state, {subjectId} | {speciesId, massKg})（卷四 :874）。
 * 个体路径的主体质量依 life（卷四 L-2）未建：读出未知即 E-DIM-UNKNOWN-READ（不编值）。物种均值路径（D-5 畜群、屠宰）全部部位参与。
 * @param {import('./body-plan.mjs').BodyEngine} engine @param {unknown} state @param {CarcassArg} arg
 * @returns {Readonly<{massKg: number, material: Readonly<Record<string, number>>}> | null}
 */
export function carcassOf(engine, state, arg) {
  const a = Object(arg);
  const bySubject = Object.hasOwn(a, 'subjectId');
  if (bySubject === Object.hasOwn(a, 'speciesId')) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'carcassOf: pass exactly one of {subjectId} or {speciesId, massKg}');
  let mass = a.massKg;
  /** @type {Set<string>} */
  const lostIds = new Set();
  if (bySubject) {
    const view = bodyView(engine, state, a.subjectId);
    if (!view.massKg.known) throw new KernelError('E-DIM-UNKNOWN-READ', {}, `carcassOf: mass of ${JSON.stringify(a.subjectId)} is unknown (life not built)`);
    mass = view.massKg.value;
    for (const p of view.parts) if (p.eff === 0) lostIds.add(p.id);
  } else {
    if (kindOfEntity(engine, state, a.speciesId) !== SPECIES_KIND) throw new KernelError('E-DIM-REF-MISSING', {}, `carcassOf: ${JSON.stringify(a.speciesId)} is not a species`);
    if (typeof mass !== 'number' || !Number.isFinite(mass) || mass < 0) throw new KernelError('E-DIM-DOMAIN-RANGE', {}, 'carcassOf: massKg must be a finite number ≥ 0');
  }
  const body = bodyOf(engine, state, bySubject ? a.subjectId : a.speciesId);
  if (presentEntries(body.tissues).length === 0) return null;
  const excludeLost = ruleValue(engine.docData, 'death', 'lostPartsExcluded') === true;
  const parts = body.parts.filter((p) => !(excludeLost && lostIds.has(p.id)));
  const sizeSum = parts.reduce((acc, p) => fixedAdd(acc, fixedUnits(Number(p.sizeFraction))), fixedZero());
  if (sizeSum === fixedZero()) return null;
  // 加权和在定点平方标度上累加（不逐项截断），最后除一次分母：Σ (size × fraction) ÷ Σ size。
  /** @type {Map<string, bigint>} */
  const acc = new Map();
  for (const p of parts) {
    for (const [t, f] of body.fractions) {
      const mat = tissueMaterial(body, p, t);
      if (mat === undefined) throw new KernelError('E-DIM-UNKNOWN-READ', {}, `carcassOf: tissue ${JSON.stringify(t)} of part ${JSON.stringify(p.id)} has no material`);
      acc.set(mat, (acc.get(mat) ?? fixedZero()) + fixedUnits(Number(p.sizeFraction)) * fixedUnits(Number(f)));
    }
  }
  const material = Object.freeze(Object.fromEntries(presentEntries(Object.fromEntries(acc)).map(([m]) => [m, fixedToNumber(fixedDivide(acc.get(m) ?? fixedZero(), sizeSum * fixedScale()))])));
  return Object.freeze({ massKg: fixedToNumber(fixedMultiply(fixedUnits(Number(mass)), sizeSum)), material });
}
