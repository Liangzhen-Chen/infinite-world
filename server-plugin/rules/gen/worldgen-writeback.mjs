// 世界创建与开局一步的写回器（S1-2a；卷十 §3.2 :221、:294 写者 worldgen-writeback.mjs，:285 openingOf）。
// runGenesis：世界创建事务里写 state.genesis.genesisMinute（卷十 R10-1.2 :378）与世界种子 worldSeed（S1-3c Q1），值来自规则表 rules.gen.genesisMinute（R10-12.5 开局缺省三来路之一，不写代码常量）。
// runOpening：开局一步（R10-12.7 :974）写 openingMinute，并对每个地点求开放范围 gen.open：作者已给的不覆盖；
//   其余地点由 rules.gen.opening.openRX 求，该规则键尚未登记定值（卷十 :194；world/geo/gen-open.json 自注列缺口），故一律记 gap、不写偏离行（S1-2a 派卡「主会话已定」第 3 条）。
//   末尾依次接开局统治边（卷八 R8-18.9 ③）→ 组织开局公库（卷六 §4.22 规则 3）→ 开局法阵（S2-TP1；主会话 TP 裁定 Q9 甲：接 runOpening 末尾，同在第 0 日这一笔事务里）。
// openingOf：读 state.genesis（卷十 :285）。地点遍历只经烘焙层 engine.bake.placeTree.byLevel，不按地点 id 或名字分支。

import { readPath, writePath } from '../../kernel/storage.mjs';
import { dim } from '../../kernel/dimensions.mjs';
import { KernelError } from '../../kernel/errors.mjs';
import { ruleValue } from '../load/registry.mjs';
import { runOpeningGovern } from '../polity/govern.mjs';
import { endowOrgs } from '../economy/org-endow.mjs';
import { runOpeningCircles } from '../travel/circle.mjs';

/**
 * 本模块读的 engine 字段：路径句柄 P、世界数据副本 docData、烘焙层 bake；开局一步末尾三步另要 polity 域的字段（S2-TP1）。
 * @typedef {{P: Readonly<Record<string, Function>>, docData: Parameters<typeof ruleValue>[0], bake: {placeTree: {kind: string, byLevel: readonly string[]}}}} OpeningEngine
 * @typedef {OpeningEngine & import('../polity/govern.mjs').PolityEngine} OpeningStepEngine
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
  // 世界种子（S1-3c 主会话 Q1：genesis.worldSeed ← rules.gen.worldSeed 缺省值；卷十 R10-1.3 :379 生成器读世界种子，骰值键第一段，卷二十七 R27-8.5）。
  writePath(state, P.genesis_worldSeed(), ruleValue(engine.docData, GEN, 'worldSeed'), tx);
}

/**
 * 开局一步（卷十 R10-12.7）：写 openingMinute；逐地点判 gen.open；再开统治边、组织公库入账、开法阵（S2-TP1）。
 * 返回 {gaps, unowned, circleGaps}：gaps 是 gen.open 记缺口的地点 id（按 byLevel 序；openRX 未定值，本步不写偏离行）；unowned 是原属站点无主的地点；circleGaps 是有规矩却没写宿主建筑的组织。
 * R10-11.4：years 为 0 时 openingMinute 等于 genesisMinute；预跑（years > 0）未建，rules.gen.historyYears 的登记取值域只收 0，非 0 加载即拒（E-DIM-DOMAIN-RANGE）。
 * @param {OpeningStepEngine} engine @param {object} state @param {unknown} tx
 * @returns {{gaps: string[], unowned: string[], circleGaps: string[]}}
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
  const { unowned } = runOpeningGovern(engine, state, tx);
  endowOrgs(engine, state, tx);
  const { gaps: circleGaps } = runOpeningCircles(engine, state, tx);
  return { gaps, unowned, circleGaps };
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
 * 已开放地点（卷十 R10-12.6、R10-12.7；卷四 §4.12.3 G-2）：烘焙层树上 gen.open 读为真的地点 id（按 byLevel 序）。读不到（gap）不算开放。
 * S1 菜单的可见集取它（主观视图卷二十二未建，S1-3 接口草案（主会话 11-26） §1 第 18 行；S1-3a）。
 * @param {OpeningEngine} engine @param {object} state @returns {string[]}
 */
export function openPlacesOf(engine, state) {
  const { kind, byLevel } = engine.bake.placeTree;
  return byLevel.filter((id) => authored(engine, state, kind, id) && dim(engine, state, kind, id, OPEN_DIM).value === true);
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
