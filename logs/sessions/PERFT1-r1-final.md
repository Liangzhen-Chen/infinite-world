# PERFT1 交接（PFT，未提交；结论：未达 1.25）

**热点**（60 天 profile，PFT 165s vs s5a 136s，增 29s）：take 复制 records 表 +3.9；npc 自主采购 inputProcurement 及 marketSupply +4.8/+5.9；advanceFoodSupply +5.1（新）；householdResources +3.8；structuredClone +0.9；buildScheduleHeap 的 process.env 读取约 1.0。增长分散，无单点。

**改动与收益**（占 profile 总时长）：
1. market.mjs `marketSupply`→经 household-budget `budgetRead`（已 export）按草稿版本/状态 memo；`subjectiveMarketQuote` 新 `subjectiveReader` 同一观察者同一地点共用冻结投影：约 -2.2%。
2. food-supply/subjective-view/settlement-trade：structuredClone→cloneData：约 -0.9%。
3. advance-registry `buildScheduleHeap`、npc-schedule `withScheduleCache/cachedSchedule/settleSchedules`：env 开关提到循环外（仍每次推进重读）：约 -1.1%。

**对 master 三对**（机器满载，master 约 115s 而空闲时 41s）：PFT 1.326、1.556、1.345，中位 1.345；改前 1.519/1.579/1.419，中位 1.519。PFT/改前中位 0.948。

**行为**：gdump full/quiet 与改前逐字节相同，numeric-digest 相同；bench 60 天两步状态哈希相同；FIELDS_INDEX_CHECK=1 跑 30 天通过。

**测试**：受影响 410，超 900s 不跑 9（agriculture、farm-pests-clock/harvest/hunt、ledger-price/stock、monster-society-content、seasonal-migration、wildlife）；已跑 241，其余 160 未跑（耗时）。8 个文件有失败，与基准子测名完全相同，无新增失败。

**未解决**：剩余耗时在 storage.mjs:477 take（约 10%，records 表 627 键，每分钟级复制，源于 d.get('state') 逃逸，不改调用约定降不下来）、新食品供给、采购逐配方报价；达 1.25 需约再降 7%，须重构逃逸语义。
