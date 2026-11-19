// 规则层唯一对装配文件开放的导出 `registerSystems`（卷二 §2.9 第 0 条"装配文件"；§2.7 groupApi `systems.mjs#registerSystems`，调用者只 `index.mjs`）。
// 本文件 import 各系统模块，由模块加载触发它们的 declare* 与 registerAdvanceHook 登记；自己不做判定、不碰 state。
// 骨架（块 2 第 2-2 张，体检 K2-08）：现在还没有任何系统模块。各系统首次上线那张卡在这里加一行 import，
// 并在 world/ontology/state-owners.json 的 systems 里写该系统的登记项（卷二 §2.7）。

import './item-lots.mjs'; // 6-3：itemRot 推进钩子（卷三乙 §3.3 系统登记表）
import './death.mjs'; // 6-6：settleBody 终止清理函数（卷四 §3.3；systems.death.terminationCleanup）

/**
 * 装配文件调一次。各系统模块的登记在上面的 import 求值时已完成，这里不再做别的事。
 * @returns {void}
 */
export function registerSystems() {}
