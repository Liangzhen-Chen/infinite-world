【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

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
