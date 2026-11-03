【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

【交卡前必跑（10-26 起）】交卡前逐文件跑完以下检查并在汇报中写结果；不过的先修，不要留给门禁：
- CORE：tests/engine、tests/storage、tests/plugin；
- 同步四件套：先 `node tools/export-actions.mjs` 重导，再跑 tests/actions-catalog、tests/action-registry、tests/advance-registry、tests/arch-metrics。**不得重生成 advance-registry 金快照**（不得设 UPDATE_ADVANCE_GOLDEN）；若它因本卡有意改动而不一致，在汇报中逐项列出"字段：旧→新、原因"，由主会话审核后统一重生成。
- 本卡新增或修改的测试，以及本卡直接改到的模块的同名测试；
- 自查改动路径：不得触及禁区（docs/架构设计/、已审 W1 骨架 world/design/、dist/、docs/待办.md、docs/问题.md）。确有必要改的，停下写进汇报。
限时：240 分钟（到 230 分钟时停手写交接）。

# 卡 PERFS7：S5 最终形态的推进性能（≤1.10）

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/PF7，分支 t-perfs7，从整合分支 t-s5integ@4c972af1 切出（= s5a + I31FIX + K15 家户进餐 + 白石镇口粮修复）。.base = 4c972af1。

**并行边界**：另一张卡 K15R4 同时在 F:/dnd-wt/INTEG 修三处行为回归（存档时刻的自治任务、怪物聚落议题分粮、客店补货锚点），可能改 npc-life.mjs、household-budget.mjs、shop.mjs、monster-society*.mjs、npc-autonomy.mjs 和 advance-registry.mjs 的 daily 块。**这些文件/块你不改**；热点若在其中，写进汇报（文件:行、剖析数字、建议修法），由主会话合并后再处理。机器上同时有它的 1 个测试进程：性能测量一律经 perf-gate.sh（自带 perf.lock 排队），并以三对中位为准。

## 实测（主会话，机器空闲，perf-gate 三对中位，对 master 3bbd7e0c）
- PERFS6 合入时 1.047；当前 s5a 1.108；K15 单独（07477535 基）1.159；s5a+I31FIX 1.118。
- 逐提交单次测速（波动约 ±4 秒）：PERFS6 后 68.6s → K07 75.3s → K14 77.4s → 现在 78.6s；master 69.1s。
- 主会话剖析：K07/K14 段函数级增量都很小（<1s），是多张规律卡叠加的真实计算；K15 剖析最大剩余热点 storage.mjs（13.8→18.3 self 秒，storage.take 写时复制），每户每日真实扣粮写入不能省。
- 剖析工具：node --cpu-prof；node F:/dnd-tools/profile-diff.mjs <base.cpuprofile> <branch.cpuprofile> 30。基线用 F:/dnd-wt/PERFBASE（master）。

## 要做
1. 以 master 为基线剖析本分支，按 self 增量排序逐个定位；优先通用层（storage.take/写时复制、patch 记录、记录索引维护 updateRecordGroups、日程堆 buildScheduleHeap），其次各规律热点（goodsClass、calendarDateAt、settleNpcReflection、hazardPriceFactor、household-budget、householdWorkTime、tradesAt 等）。
2. 只用不改变行为的手段：批量写入/合并同一日同一账户的连续扣减为一次写（若账本语义允许且事件/流水逐条保留）、写时复制的路径缓存、索引增量维护、提到循环外、记忆化（stateMemo 已支持按范围失效）。**行为必须与 4c972af1 逐字节一致**：golden-dump 前后 0 差异、numeric-digest 一致、advance-registry 通过（不设 UPDATE）。
3. 每处改动附剖析前后数字；FIELDS_INDEX_CHECK=1 跑涉及缓存的测试。
4. 目标 F:/dnd-tools/perf-gate.sh F:/dnd-wt/PF7 默认三对中位 ≤1.10（你不能 commit/checkout 的话按顺序双树运行法给三对；同时不得运行其他测试）。

## 验收
按共同规则跑 affected-tests2 清单（.base=4c972af1，WORKTREE，深度0），注意 advance-registry 金快照在 4c972af1 上本来就有差异（待 K15R4 字段表），你的改动后差异必须与 4c972af1 完全相同（用 golden-dump 对比两树证明）。三对数字；逐字节一致证据；CORE、同步四件套、s5-law-* 全部、invariants 全部（含 i31）、s5-playthrough 留主会话。汇报：热点、修法、提速、最终比值。
