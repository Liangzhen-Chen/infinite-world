# 卡 K15：家户真实进餐与购粮反馈（K13 浸泡发现 HH01/HH03/MKT02）

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/K15，分支 t-k15-law，基于 s5a@07477535。

## 浸泡发现（F:/dnd/logs/sessions/K13.final.md "系统性问题" 一节）
20 组年度运行中，NPC 购入食品中位 176.5/187.5 份，但购入食品品类的实际消耗（consume 流）全部为 0；基线第 3–6 月 10 个种子市场成交均为 0。business.mjs:689 按 householdBudget.resources.procurementShortfall 派生需求、:781 后重算家计；advance-registry.mjs:392 跳过 granary=false 城市；agriculture.mjs:216 只处理公粮消耗；daily-actions.mjs:49、:72 实际进餐写入者只有 player。证据：F:/dnd/logs/audit/K13-soak/s5-law-soak-k13-final/。

## 规律
每个家户每天真实进餐：按 公共配给（有公粮的聚落）→ 自家存粮 → 已买食品 的来源依次取用，按营养需求（body/营养数据，不按物品名）真实消耗库存（源汇守恒）；吃不上的记缺餐。实际消耗后，K02 预算的采购缺口自然再现，进而产生下一次购买（K08 客流）——形成"买→吃→再买"的闭环。公粮与私粮不双扣；不清空库存、不注资制造需求。无公粮的城市也按同一口径计缺餐。
个体差异（K02 已有节俭偏好）沿用；不另造随机。性能：每户每日一次结算，复用 PERFS5 的 stateMemo/索引，不得每人扫全表。

## 文件所有权
- 可改：npc-life*.mjs 或现有 NPC 日结进餐处（找到真实写入点）、agriculture.mjs 公粮消耗段、advance-registry.mjs 日结编排、household-budget.mjs、business.mjs 的需求派生段。
- 不改：building-maintenance.mjs、npc-autonomy.mjs（K14 并行）。

## 验收
手算锚点：两口之家每日需 120 饱食，有公粮配给 60、自家面包 30/份 → 消耗 2 份面包；无存粮且无配给 → 缺餐记录；吃完后次日采购缺口出现并在开市时真实购买。新增 s5-law-household-meals 专项（含有/无公粮城市、重放、存读档、共享粮袋不双扣）。逐文件：s5-law-household-budget、s5-law-periodic-market、s5-02、s5-05、shop-restock、agriculture 相关短测、npc-life-health、settlement-trade、CORE、同步四件套；FIELDS_INDEX_CHECK=1 跑专项。金快照会变，出字段表。性能门同 K14。
