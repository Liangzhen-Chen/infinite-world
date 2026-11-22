// 规则层唯一对装配文件开放的导出 `registerSystems`（卷二 §2.9 第 0 条"装配文件"；§2.7 groupApi `systems.mjs#registerSystems`，调用者只 `index.mjs`）。
// 本文件 import 各系统模块，由模块加载触发它们的 declare* 与 registerAdvanceHook 登记；自己不碰 state。
// 各系统首次上线那张卡在这里加一行 import，并在 world/ontology/state-owners.json 的 systems 里写该系统的登记项（卷二 §2.7）。
// 装配期接点（6-19，块 5 遗留 1）：装配文件把 mountKernel 读到的世界原语目录交进来，在这里核对它与规则层的可执行契约一致
// （checkPrimitiveCatalog，卷九 §4.2.2 :652；它在规则层，kernel 不得 import，卷二 :811），不一致即启动失败。

import './item-lots.mjs'; // 6-3：itemRot 推进钩子（卷三乙 §3.3 系统登记表）
import './death.mjs'; // 6-6：settleBody 终止清理函数（卷四 §3.3；systems.death.terminationCleanup）
import './position.mjs'; // 6-27（格子 G12）：placeSubject 位置写者、rebaseBubble 日界钩子（卷十七 §3.3；卷二十七 R27-1.16）
import { checkPrimitiveCatalog } from './primitives-runtime.mjs';

/**
 * 装配文件调一次。各系统模块的登记在上面的 import 求值时已完成；这里核对世界原语目录。
 * @param {{primitives: unknown}} world mountKernel 返回的世界部分（primitives 是 world/ontology/primitives.json 的解析结果；文件缺失即 undefined，同样拒）
 * @returns {void}
 */
export function registerSystems(world) {
  const checked = checkPrimitiveCatalog(world === null || typeof world !== 'object' ? undefined : world.primitives);
  if (!checked.ok) throw new Error(`primitive catalog does not match the runtime contract:\n${checked.errors.join('\n')}`);
}
