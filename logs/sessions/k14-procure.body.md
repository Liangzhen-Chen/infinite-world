# 卡 K14：维修与生产投入的筹料闭环（K13 浸泡发现 AS01）

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/K14，分支 t-k14-law，基于 s5a@07477535。

## 浸泡发现（F:/dnd/logs/sessions/K13.final.md "系统性问题" 一节）
青灯酒馆在 20/20 组一年中从 70 降到 39–42，从未维修：业主现金 190–502、维修成本 106、修缮效用 1385–2198 均为正，但自身没有木/石。server-plugin/building-maintenance.mjs:193 缺料分支只看 :200 同地点可见 engineQuote 卖家、:201 卖家须在同一建筑——缺少把维修需求带到合法已知供给的出行或委托。基线 001 同聚落公库有木 28/石 12，但公库不属业主，不能自动取用。证据：F:/dnd/logs/audit/K13-soak/s5-law-soak-k13-final/mechanism-evidence.json。

## 规律（通用，不只酒馆、不只维修）
主体为自己的资产/生产需要投入品而手头不足时，按**本人可知**的供给来源（已知店铺/集市/卖家、已收报价、熟人）比较：亲自出行购买（K08 market_trip：真实路程、时段、路费，占家户时间 K04）、托人代购或下单送货（现有 delivery/transport 义务，K12 运力）、或暂缓。选划算且可行的，真实付款、对方同意、真实交付后材料才到手。无可知供给时明确记录供应约束，不凭空补料、不动公库、不回血。
个体差异与噪声沿用 K03 已有偏好/噪声，不另造。

## 文件所有权
- 可改：server-plugin/building-maintenance.mjs（缺料分支）、必要时 npc-autonomy.mjs 的候选/计划接点（多步计划：出行→购买→返回→施工）。
- 只读调用：business.mjs/npc-state.mjs 的 market_trip、transport.mjs、household-budget.mjs、market.mjs 报价；需要改这些文件时停下报告（K15 并行，拥有 business/household-budget/npc-life/agriculture/advance-registry）。
- 本卡与 K15 不重叠：不改 business.mjs、household-budget.mjs、npc-life*、agriculture.mjs、advance-registry.mjs。

## 验收
手算锚点：酒馆缺木 4/石 2，已知白石市场有货、往返 X 分钟、路费 Y，修缮净收益为正时生成出行购买计划并最终完工；无可知供给时记录约束、不修。新增 s5-law-procurement 专项（含重放、存读档、对方不同意、负重限制、无供给）。逐文件：building-maintenance、s5-law-maintenance、s5-law-public-maintenance、npc-autonomy、s5-law-periodic-market、s5-law-household-labor、CORE、同步四件套；FIELDS_INDEX_CHECK=1 跑上述专项。金快照若变出字段表。性能：bench-farm-pests 30 2 相对 master 不得超过 1.10（F:/dnd-tools/perf-gate.sh），超了说明。
