卡 R40（推进性能，主会话已剖析定位）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/R39（分支 r39，已含 R39 未验证的部分改动——补 nextMinute、作息/课程复用、增量记录索引——并已合入最新 master）。
主会话实测（tools/bench-farm-pests.mjs，60 天 = 30天×2）：R31 23s → R38 合入 77s → S3 合入后 124s（S3 带来 +62%）。剖析（master，1天×30，总 64.6s，包含时间）：advanceInterval 44.7、runAdvanceSystems 40.3、advanceNpcObligations 23.9 ≈ advanceNpcSchedules 23.9 → settleSchedules 22.9 → scheduleAt 18.7 → scheduledSlot 15.2；buildScheduleHeap 17.9；educationCourses 8.0；自身时间最高 settleSchedules 5.0、lifecycleState 3.6、personConstraint 2.7、scheduledSlot 2.7、npcSchedule 2.5。
成因：server-plugin/npc-obligations.mjs:advanceNpcObligations 每刻对 state.obligations 全表 filter(live)+sort（S3 把大量义务并入该表）并总是调用 advanceNpcSchedules；advanceNpcSchedules/settleSchedules 每刻对所有 NPC 计算 scheduleAt/scheduledSlot，同一 NPC 同一时刻反复从头算。
任务：
1. scheduleAt/scheduledSlot 在一次推进（runAdvance）内按 (npc, minute) 缓存，缓存键包含影响作息的状态（routine、location、约束/预约、节日等），写入这些状态即失效；FIELDS_INDEX_CHECK=1 下加自检比对（命中时重算比较）。
2. settleSchedules 只处理本刻确有槽位边界或预约/约束变化的 NPC（由日程堆的到期项给出），不每刻遍历全部 NPC。
3. advanceNpcObligations 只取预约类义务（按 kind/category 用记录索引或单独索引），不全表扫描排序。
4. 先验证 R39 的部分改动正确：金快照、I31、farm-pests“长等待与逐日一致”、save-roundtrip、s3-*、s2c-* 全过；有问题就修或撤回该部分并在报告说明。
5. 结果逐字节等价（金快照不变，必须变则逐哈希写依据并停下）。目标：60 天 ≤40s（主会话实测 R38 为 77s，R31 为 23s）、1天×30 ≤20s；在报告里给出 tools/bench-farm-pests.mjs 前后数字与新剖析前 10 项。
跑：上述测试；CORE；tests/scale.test.mjs、tests/performance.test.mjs 单独跑。长测试（agriculture、farm-pests-*、ledger-price、seasonal-migration、wildlife）各单跑一次记录耗时（可并行 ≤3 个）。
报告 F:/dnd/logs/sessions/R40-sol.final.txt；回复 ≤200 字。
