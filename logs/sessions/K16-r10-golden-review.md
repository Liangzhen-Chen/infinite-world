# K16 r10 advance golden review (main session, 11-02)
Compared final full/quiet trace states s5a@0faa9d14 vs t-k16@04dad855 (probe F:/dnd-tmp/probe/gdump.mjs, sdiff.mjs). Messages identical.
- family.meals.*: hydration/satiety shortfall -> 0 with real water/forage sources (K16 core); new household records for previously unregistered groups.
- family.meals.*.owner (108): group representative is now the first member in sorted order (householdSubsistenceGroups sorts ids); deterministic, no behavior.
- npcs location null + activity 生计出行 + scheduleTravel (53): on-road convention already used by s5a (赶路 travellers have location null).
- relationships (52): people meeting at shared water/forage sites.
- water-cycle / physical_feature: consumed/householdMl/waterMl/inflow/outflow/overflow follow real household draws; turbidity/pathogen float drift from volume.
- agriculture cohorts/sownUnits/seedBank/food: field hands fetch water, fewer area units sown (same cause as s5-05/world-clock).
- shop_hw_qingdeng paidCopper/cost, customer_flow paid, market-trade totals, finance_profit, coins: Linsui's 4 milk no longer drunk for thirst, retained -> D+4 (proven, quest-sources).
- finance_profit lots price 3/2 -> 2: same price shift, integer.
- quiet: same categories + world-clock grain-review effect (granary shift).
Verdict: all explained; regenerate.

## r11 补审（11-02 主会话）
r11 改两处：一是生计规划把节庆主持时段计入 physicalBlocked；二是首次规划时，规划时刻已在进行中的作息时段，从当前分钟起可用（通用裁剪；执行者原写 notBefore≤480 特判，已撤）。
对 r10 审过的轨迹（probe full-new/quiet-new）逐字段比对：
- 全部差异来自首日：开局时刻正处在工作时段中，规划改为从当前分钟出发，不再等下一个作息边界。
  - 首日多出觅食；多户未得饭日数减 1（full 2→1，quiet 5→4）。
  - 随之变化：觅食人选和地点重排；scheduleTravel 与位置、活动互换；forage 的 harvested/grown 略增；water-cycle 的 inflow/overflow 微变；新出行带来少量新关系。
- 节庆在两个场景内都未发生，金快照不受影响。
- s5-law-subsistence 午后计划例：字面量 780..860 → 600..680，由机制推出；“不早于当前时刻”的断言保留。
结论：重新生成。

## r11 更正（11-02 晚，主会话）
上面“r11 补审”所述的通用裁剪已撤回。它让开局那一刻全镇同时出门，s5a 合并关卡因此新增 5 个失败：钱庄、交易对方、目击者、报案人不在场，以及传闻路线。这次撤回是我的判断错误。
现行规律：活动不中途放下，出发只在作息边界；开工时刻（WORK_WINDOWS 起点 480，与家户工作窗口同一常量）之前尚未开工，所以跨黎明的时段可从规划时刻起用。
金快照 full、quiet 与 r10 审过的 probe 轨迹逐字节相同，按 r10 结论重新生成即可。午后计划例恢复 780..860。
