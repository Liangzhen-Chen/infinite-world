K15 续做：只做性能，行为必须与你当前版本逐字节一致（以你的 K15-golden-table.md 为准，不再改规律）。

现状：bench-farm-pests 30×2 master 105.5 秒 / K15 135.3 秒，比值 1.28（门槛 ≤1.10）。

做法（参考 PERFS5/PERFS6 已合入的手段：stateMemo、类别记录索引、精确预筛、同次推进复用视图）：
1. 用 `node --cpu-prof` 对 K15 与基线（git show 07477535 的同一基准）做剖析，`node F:/dnd-tools/profile-diff.mjs base tip 30` 找出进餐结算新增的热点。
2. 典型可省之处（需剖析确认）：householdMealPlan 每户每日重复构建 householdResources/家庭成员/营养需求；同一聚落同一日的公粮配给与粮仓读取可一次计算后分配；无变化的家户（库存充足、无新事件）可以由精确条件跳过重复的全量预算重算但仍真实扣粮；避免每户扫全部 records/持有。
3. 证据：advance-registry 结果与你当前 K15 版本逐字节一致（导出前后 golden-dump 对比为 0 差异），numeric-digest 一致；FIELDS_INDEX_CHECK=1 跑 s5-law-household-meals、s5-law-household-budget、npc-life-health、s5-law-periodic-market。
4. 目标 bench 相对 master ≤1.10（F:/dnd-tools/perf-gate.sh F:/dnd-wt/K15 默认配对；你不能 checkout 的话，按你上轮的顺序双树运行法给三对中位数）。

汇报：每处热点修法与提速数字、最终比值、逐字节一致的证据。
