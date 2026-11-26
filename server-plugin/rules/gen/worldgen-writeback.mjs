// 世界创建与开局一步的写回器（S1-2a；卷十 §3.2 :221、:294 写者 worldgen-writeback.mjs，:285 openingOf）。
// runGenesis：世界创建事务里写 state.genesis.genesisMinute（卷十 R10-1.2 :378），值来自规则表 rules.gen.genesisMinute（R10-12.5 开局缺省三来路之一，不写代码常量）。
// runOpening：开局一步（R10-12.7 :974）写 openingMinute，并对每个地点求开放范围 gen.open：作者已给的不覆盖；
//   其余地点由 rules.gen.opening.openRX 求，该规则键尚未登记定值（卷十 :194；world/geo/gen-open.json 自注列缺口），故一律记 gap、不写偏离行（S1-2a 派卡「主会话已定」第 3 条）。
// openingOf：读 state.genesis（卷十 :285）。地点遍历只经烘焙层 engine.bake.placeTree.byLevel，不按地点 id 或名字分支。

import { readPath, writePath } from '../../kernel/storage.mjs';
import { dim } from '../../kernel/dimensions.mjs';
import { KernelError } from '../../kernel/errors.mjs';
import { ruleValue } from '../load/registry.mjs';

/**
 * 本模块读的 engine 字段：路径句柄 P、世界数据副本 docData、烘焙层 bake。
 * @typedef {{P: Readonly<Record<string, Function>>, docData: Parameters<typeof ruleValue>[0], bake: {placeTree: {kind: string, byLevel: readonly string[]}}}} OpeningEngine
 */

// 规则表代号与键名（卷十 §2.3 :156 rules.gen.*；世界模板参数暂落规则表，卷十封卷后勘误 1126k1）。
const GEN = 'gen';
// 开放范围维度（卷十 §2.2 :150 gen.open，键名驼峰平铺 genOpen，勘误 1123k51）；地点 kind 取烘焙层树的 kind，不另写。
const OPEN_DIM = 'genOpen';
// dim 读不到值时的码（kernel/dimensions.mjs readBase）；genOpen 表头 onUnknown 为 gap（卷十 :150），读不到即记缺口。
const UNKNOWN = 'E-DIM-UNKNOWN-READ';

/**
 * 世界创建事务（卷十 R10-1.2）：写 state.genesis.genesisMinute。手写世界（卷十 :866 skeletonSource authored）生成相各步不在本卡跑。
 * @param {OpeningEngine} engine @param {object} state @param {unknown} tx
 */
export function runGenesis(engine, state, tx) {
  const { P } = engine;
  writePath(state, P.genesis_genesisMinute(), ruleValue(engine.docData, GEN, 'genesisMinute'), tx);
}

/**
 * 开局一步（卷十 R10-12.7）：写 openingMinute；逐地点判 gen.open。返回 {gaps}：记缺口的地点 id（按 byLevel 序）；openRX 未定值，本步不写偏离行。
 * R10-11.4：years 为 0 时 openingMinute 等于 genesisMinute；预跑（years > 0）未建，rules.gen.historyYears 的登记取值域只收 0，非 0 加载即拒（E-DIM-DOMAIN-RANGE）。
 * @param {OpeningEngine} engine @param {object} state @param {unknown} tx
 * @returns {{gaps: string[]}}
 */
export function runOpening(engine, state, tx) {
  ruleValue(engine.docData, GEN, 'historyYears');
  const { P } = engine;
  writePath(state, P.genesis_openingMinute(), readPath(state, P.genesis_genesisMinute()), tx);
  const { kind, byLevel } = engine.bake.placeTree;
  /** @type {string[]} */
  const gaps = [];
  for (const id of byLevel) {
    if (!authored(engine, state, kind, id)) gaps.push(id);
  }
  return { gaps };
}

/**
 * 地点是否已有 gen.open 的值（作者已给，经 dim 读，不另查行）。读不到（E-DIM-UNKNOWN-READ）即否，别的错误照抛。
 * @param {OpeningEngine} engine @param {object} state @param {string} kind @param {string} id @returns {boolean}
 */
function authored(engine, state, kind, id) {
  try {
    dim(engine, state, kind, id, OPEN_DIM);
    return true;
  } catch (e) {
    if (e instanceof KernelError && e.code === UNKNOWN) return false;
    throw e;
  }
}

/**
 * openingOf（卷十 :285）：读 state.genesis。openingMinute 在开局一步之前为 null（卷十 :221 nullable）。
 * @param {OpeningEngine} engine @param {object} state
 * @returns {Readonly<{genesisMinute: number, openingMinute: number | null}>}
 */
export function openingOf(engine, state) {
  const { P } = engine;
  const opening = readPath(state, P.genesis_openingMinute());
  return Object.freeze({ genesisMinute: readPath(state, P.genesis_genesisMinute()), openingMinute: opening === undefined ? null : opening });
}
