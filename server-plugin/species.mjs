// 物种读入口 `speciesView`（卷四《生物身体与人物》§3.1 :408、§4.1.2 :465）：物种行是静态数据，规则层无写者，本文件纯读。
// `dims` = 物种表表头 §2.1 的全部维度（基值 Fact，经 kernelApi dim）；另附 `capabilityBaseline`（S-4，身体图结构基值）、
// `meanMassKg`（S-3，分布均值）与 `meanDailyFoodNeed`（§4.7 代谢三率的聚合层读数）。
// 登记在案的未建派生（_unbuilt-derived.json entries，内核读到抛 E-MOD-RX）及依赖它的派生按未知交出（卷二 §1.6、§1.12 勘误 1118k23）；
// 其余 E-MOD-RX（派生结果类型不合、除零等真错）照抛（同 kernel/place.mjs placeView 口径，判定共用 kernelApi readsUnbuilt）。
// 不认任何物种或类别代号，不按 id 前缀或名称判定（§4.1.6）。

import { dim, readsUnbuilt } from './kernel/dimensions.mjs';
import { kindOf } from './kernel/vocab.mjs';
import { E } from './kernel/handles/generated.mjs';
import { capabilityBaseline } from './body.mjs';

const S = Object.freeze({ bodyPlan: 'bodyPlan', meanMassKg: 'meanMassKg' });
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const UNKNOWN = Object.freeze({ known: false, applicable: true });

// 一个维度的基值 Fact；只有登记在案的未建派生（或依赖它的派生）读到 E-MOD-RX 时按未知交出并带上码。
function readDim(engine, state, kind, id, key) {
  try {
    return dim(engine, state, kind, id, key);
  } catch (e) {
    if (isObj(e) && e.code === E.E_MOD_RX && readsUnbuilt(engine, kind, key)) return Object.freeze({ ...UNKNOWN, reason: E.E_MOD_RX });
    throw e;
  }
}

/**
 * `speciesView(engine, state, speciesId)`（卷四 §3.1；签名与返回形状按卷二 §2.2）。
 * @param {object} engine @param {object} state @param {string} speciesId
 */
export function speciesView(engine, state, speciesId) {
  const kind = kindOf(speciesId);
  const t = engine.tables instanceof Map ? engine.tables.get(kind) : undefined;
  const header = t && isObj(t.doc) && isObj(t.doc.dimensions) ? t.doc.dimensions : {};
  const dims = Object.fromEntries(Object.keys(header).sort().map((k) => [k, readDim(engine, state, kind, speciesId, k)]));
  const plan = dims[S.bodyPlan];
  return Object.freeze({
    dims: Object.freeze(dims),
    capabilityBaseline: plan && plan.known && typeof plan.value === 'string' ? capabilityBaseline(engine, state, plan.value) : null,
    meanMassKg: dims[S.meanMassKg] || UNKNOWN,
    // §4.7 代谢三率（metabolism）未建：聚合层的均值日需按未知交出。
    meanDailyFoodNeed: UNKNOWN,
  });
}
