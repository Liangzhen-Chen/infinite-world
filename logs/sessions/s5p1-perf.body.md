# 卡 S5-P1：找回 S5 带来的推进性能回退（60 天配对 1.111 → ≤1.05）

工作树 F:/dnd-wt/S5P1（分支 t-s5p1，基于 s5a 966d2561）。你可以在本分支上自己提交（`sh F:/dnd-tools/guard-commit.sh F:/dnd-wt/S5P1 "<msg>" <路径...>`，它先跑 overfit-guard）；不要 merge、不要切分支、不要动其他工作树（F:/dnd-wt/PERFBASE 只由 perf-gate.sh 使用，你不要手动 checkout 它），不要用 git stash。

## 背景
- 10-28 夜间安静条件下配对基准（`sh F:/dnd-tools/perf-gate.sh <wt> "" 3`，60 天 = bench-farm-pests 30 天×2）：master 4128a59b 约 71.1 秒，s5a 966d2561 约 79.0 秒，三对比值 1.101/1.115/1.111，中位 1.111，判据 ≤1.10 未过（指南 C.9；阶段门要求）。
- 主会话已做 CPU 剖析对比（工具：`node F:/dnd-tools/profile-summary.mjs <x.cpuprofile>`、`node F:/dnd-tools/profile-diff.mjs <base> <branch>`；剖析命令 `node --cpu-prof --cpu-prof-dir=F:/dnd-tmp/<dir> F:/dnd-tools/bench-farm-pests.mjs 30 2`，在工作树根目录跑）。总自耗时 84.8→91.9 秒，增量主要来自：
  - market.mjs 全新 1.6 秒：commitments 0.55、saleableStock 0.38、stockSupply 0.20（W2b 柜台/补货决策，疑似每刻对每店全量统计）；
  - det-math.mjs 全新 1.4 秒：mul 0.71、sinCosFix 0.20、isqrt 0.18（W5 定点三角/开方，疑似天气/天文/时钟每刻重复计算同一天的值）；
  - obligation-state.mjs obligationRows 0→1.07 秒（新的调用方在推进路径上全表扫描义务）；
  - education-state.mjs 匿名函数 +0.96；storage.mjs updateRecordGroups +0.78；festival festivalCalendar +0.60；engine peek +0.56；bounty issue/advanceWanted +1.0；facility-state facilityRouteStates +0.49；settlement-trade advanceSettlementTrade +0.38；contracts advanceShadowContracts +0.36；magic-ritual advanceRituals +0.35；ledger parseAccount +0.34（还有 core 命名空间正则 +0.28）；weather calendarDateAt +0.30。
- 以往同类修复做法（R38/R40，见 F:/dnd/docs/PROGRESS.md 10-19、10-20 条）：按刻只跑有到期项的系统、按 (实体, 分钟/日) 缓存派生值并带失效与自检、建索引替代全表扫描。

## 先读
F:/dnd/docs/产品原则.md（北极星）；指南 docs/无限原野_开发指南v3.md C.9；docs/架构设计/14-确定性与时序.md 数值确定性一节。只汇报与本卡相关的部分。

## 要做
1. 自己在 S5P1 上复测剖析（先跑一次基准确认 ~79 秒量级），逐个热点找出"为什么变多"（调用次数暴增？每刻全量重算？），写进汇报（每项一句）。
2. 按热点修：缓存/记忆化（键必须覆盖全部输入，失效条件写明）、索引替代全表扫描、把每刻计算挪到真正变化时（nextMinute/到期驱动）、热循环里避免重复 parse/正则/structuredClone。**结果必须逐字节不变**：
   - 金快照 tests/advance-registry.test.mjs 必须原样通过（不得重生成）；
   - `node tools/numeric-digest.mjs` 输出与改前完全一致（改前先跑一次存下）；
   - 不改任何规则、公式、数值、文案；不删功能、不缩场景、不改基准脚本与 perf-gate.sh。
3. 不得为过门槛降低世界规模、跳过系统、减少 NPC 或减少推进刻；不得在测试或基准里打特判。
4. 目标：`sh F:/dnd-tools/perf-gate.sh F:/dnd-wt/S5P1 "" 3` 中位比值 ≤1.05（留余量；≤1.10 是硬线）。机器若有别的重负载（同时 >2 个 node 测试进程），结果不作数，等空闲再测。

## 跑
tests/advance-registry.test.mjs；tests/scale.test.mjs；tests/numeric-persistence.test.mjs；tests/det-math.test.mjs；tests/world-clock.test.mjs；tests/invariants*.test.mjs；tests/overfit-guard.test.mjs；tests/arch-metrics.test.mjs；你改到模块对应的测试（market/business/s5-0x、weather/festival/education/bounty/facility/settlement-trade/contracts 等相关）。命令一律 `TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node --test --test-reporter=tap <文件>`，只看 `# pass`/`# fail`/`not ok` 行。新增模块需在 tools/arch-layers.mjs 归层，且不得新增 import 图违例。

## 进程规则
只结束你自己启动并记下 PID 的进程，禁止按名称或批量杀 node；同时最多 2 个 node 进程（测基准时只跑基准，不并行跑测试）。临时文件放 F:/dnd-tmp，用完删掉（只删你自己建的）。如果某个动作被权限拦下，不要绕，写进汇报。

## 汇报（≤300 字）
改了哪些文件；每个热点的原因与修法（一句）；perf-gate 三对数值与中位；金快照、numeric-digest 是否完全一致；测试命令与 pass/fail 数；偏离本卡的地方；未解决的问题。不要贴完整代码或完整日志。
