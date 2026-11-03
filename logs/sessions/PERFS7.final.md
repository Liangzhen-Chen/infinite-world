# PERFS7 限时交接（未完成最终验收）

工作树 F:/dnd-wt/PF7，分支 t-perfs7，基线 4c972af1。未提交、未部署、未操作原存档。K15R4 所有权文件及 advance-registry daily 块未修改。

按限时停手。已交付三个热点的不变行为优化和相关回归覆盖；最终≤1.10性能门禁未跑，整张卡不能标完成。选测326文件：210通过、10失败（均原基线同败）、6按规则留外跑、100未完成。完整清单为PERFS7-affected.txt，未完成清单为PERFS7-remaining.txt，失败清单为PERFS7-failed.txt。没有把在途、取消或未跑的检查计为通过。

## 当前实现

- storage.mjs：写入的旧/新分类都没有已查询的桶时，共享已建分类桶，避免复制无关 Map。每个记录版本独立保存容器；懒补建新分类时复制桶映射，防止污染旧快照。
- facility-state.mjs：用现有 stateMemo 缓存路线通行系数和容量。依赖 buildings、created、facility_region 记录；不受钟点、交易、工作台费用影响。原计算函数用于 FIELDS_INDEX_CHECK 自检。
- npc-cognition.mjs：复盘只有在新增遗忘投影、反思或补缺初始字段时才复制认知；不改遗忘时刻、付款证据、欠款检查和随机性。
- tests/patch-cursor、record-index-update、perf-s5-cache、npc-cognition：保留宽表枚举/增删/旧快照/符号键保证，覆盖懒建桶在新旧版本两种查询顺序下互不污染、路线物理依赖失效和重建、七天遗忘边界只写一次及旧认知/证据不变。
- docs/actions.json：已按要求 export-actions 重导，无内容 diff。

尝试过复制键表缓存，但剖析 take 8.598→8.405 self 秒，同时 apply 1.114→1.984 秒，没有净收益，已撤回实现。

## 阶段剖析（同一 30 天×2 基准，非最终性能门禁）

以下 stage2 数字在补建桶容器修正之前采集，最终版本需补采；不能作为最终收益结论。

| 热点 | 改前 self 秒 | stage2 self 秒 | 做法 |
|---|---:|---:|---|
| updateRecordGroups | 2.502 | 约 0.96 | 保留无关分类桶 |
| facilityRouteStates + facilityDefinition | 2.623 | 约 0.04 | 按物理输入失效的路线投影 |
| settleNpcReflection | 2.491 | 约 1.59 | 有变化才复制 |

CPU profiler 运行内计时：master 95938ms，改前本树 115627ms，当前本树 103986ms。外部负载波动，不能用这组单次 profiler 时间代替三对门禁。

剩余热点：take 约7.91 self秒；buildScheduleHeap（advance-registry.mjs:162）约4.92秒。改前 take 调用链：magic-care.mjs:294 advanceFood→storeFresh 2.63秒，education.mjs:69 lesson 2.29秒，npc-schedule settleSchedules 1.03秒。
锁定文件建议：household-budget.mjs:41 的 budgetRead 用 d.document 检查草稿身份，会使整根引用逸出。其本模块 self 合计约1.42秒，复制成本记在 take；可在 K15R4 合并后核对读适配器，改用不会 expose 的身份检查。本卡未修改。
另一个锁定点为npc-autonomy.mjs:263的projectDocument，改前约0.61 self秒。历史在场投影必须保留；后续只宜核对同一次构造内的重复读取、等价投影复用，不得跳过历史状态或未知provider。npc-life.mjs:900所在模块改前约1.03 self秒，并非本轮最高增量，未碰其真实扣粮路径。

## 最终行为一致（容器修正后已重导确认）

改前本树仍为 4c972af1 原生产代码时导出 before；当前导出 after。

- golden-dump 两场景所有步骤输出文件逐字节一致。两份 SHA-256 均为 1A60F24D16CAD1927512D797FCE790BD1CB06409588B374B0726749DD7FBCB83。
- numeric-digest 完整输出文件逐字节一致，文件 SHA-256 均为 388CA453D42F8057A2590B1323FAEA0F40527B336E16E1F95FD2E14837190139。
- state full=4d59679c7658de092b7145971b356d0f7d95a19dfb2d87b399f227bd938bd337；quiet=f8c8a48d3dd733700ae733cd5c650354b4176db1dfea174ee190852a9b7deed0；13 个数值函数输出摘要均未变。
- 未设 UPDATE_ADVANCE_GOLDEN，未重生成 advance 金快照。

## 验收与环境

选测原命令 node F:/dnd-tools/affected-tests2.mjs . 4c972af1 WORKTREE 0 被 spawnSync git EPERM 阻断。通过 shell 只读 git diff/show 获取同样输入，临时桥接子进程读取，再原样执行同一选择脚本，得到326文件，清单 PERFS7-affected.txt。未改选择算法。

所有测试每文件独立进程、TEMP/TMP=F:/dnd-tmp，只读摘要。显式使用 TAP reporter，过滤规则补充 ^# (pass|fail)，因为此环境默认 reporter/编码不能稳定匹配 ℹ。摘要在 PERFS7-tests.tsv，亲启 Node PID 在 PERFS7-pids.txt。

最终 CORE engine22/22、storage14/14、plugin7/7；同步 actions-catalog4/4、action-registry7/7、arch-metrics5/5；advance-registry3/5，基线同样3/5，失败均为full/quiet旧金快照。最终 FIELDS_INDEX_CHECK=1 的 patch-cursor4/4、perf-s5-cache9/9、record-index-update6/6、npc-cognition10/10、facilities13/13 已通过；全部 invariants（含 i31 18/18）通过。

全部16个 s5-law 文件已完成：15文件通过（含 tenancy-sharing15/15、soak7/7），household-meals12/13。其失败为第4例“cities without public grain record real missing meals; food closes only the deficit it can feed”，4c972af1原代码同样12/13。未改该卡所有权文件或相关断言。

基线对照方法：用只读git show取得4c972af1的三个原生产模块，临时resolve hook只替换这三个模块且还原其相对导入上下文，使用同一测试与世界夹具。其余生产模块未改；未checkout或改Git状态。结果在PERFS7-baselines.tsv。最终短验收在PERFS7-final-checks.tsv。

bosses同样10/11，基线同败于独立巢穴迁移CLI用例。单失败用例末30行确认子进程status=null（期望0）；源测试直接spawnSync启动迁移CLI，stderr亦为空。列主会话沙箱外补跑，不当作机制回归或通过。

farm-pests同样6/7，基线同败于“田害与实际巡守在重启/导入/回滚中保留，CLI仅写独立副本”联合用例；未展开其完整输出，不把存档或CLI具体错误当作已查明。最终补充账户写入断言后的perf-s5-cache9/9（FIELDS_INDEX_CHECK=1）已通过。

其余已完成的长检查包括event-size180日完整导出<50MB、确定性导入和纯补丁重放同哈希，ledger-price11/11（按gate-skips排除农业季逐日推进）、ledger-reconcile5/5、ledger-stock6/6。未降断言或改金快照。

### 失败文件与原基线对照

| 文件（tests/） | 本树/原基线同结果 | 失败范围 |
|---|---|---|
| advance-registry | 3通过/2失败 | full、quiet旧金快照；本卡前后dump零差异 |
| s5-law-household-meals | 12/1 | 无公粮城市实际缺餐用例 |
| bosses | 10/1 | 迁移CLI子进程status=null，需外跑 |
| farm-pests | 6/1 | 重启/导入/回滚与CLI联合用例 |
| monster-society-content | 31/2 | 基线T162两地议题、时钟分粮；K15R4并行范围 |
| npc-life-t164 | 7/1 | 名册家人照护/继承/迁居联合用例 |
| npc-profile-publication | 0/1 | 已发布档案出处核验冲突：npc_hw_luqing/relationships[3] |
| numeric-persistence | 0/1 | 旧允许项records.finance_profit.lots.*.*.price未命中；并非发现新非整数 |
| overfit-guard | 2/2 | world/actions同义词与过期allowlist条目静态检查 |
| quest-sources | 7/1 | 无人接的过期任务托管退款用例；K15R4已在修相关行为 |

不改这些既有断言，也不越界修并行卡。npc-profile-publication和numeric-persistence各只查看单失败末30行，前者是数据出处冲突，后者是允许项失效，未误标为EPERM。

停止时100个未完成文件均逐项列在PERFS7-remaining.txt，首项record-index-check（修正版完整长测未完成），随后remote-generation等。最后取消的remote-generation不算通过；没有遗留本会话测试Node进程（按已记录PID与启动时刻核对为0）。

6个按规则留外跑：gate-skips的agriculture、farm-pests-clock、farm-pests-hunt、farm-pests-harvest、wildlife整文件，以及明确留主会话的s5-playthrough。

旧实现的 record-index-check 长测于 09:27 取消：发现懒建桶共享容器会污染旧快照，已修正并由新增回归用例通过。仅终止亲启且在 PERFS7-pids.txt 记录的 PID17384（启动09:07:51），该次不算验收通过。修正版完整长测需重跑。

最终 perf 三对尚未运行。perf-gate.sh 含 checkout（禁用），Bash 启动又被 CreateFileMapping Win32 error 5 拒绝，PowerShell 写共享 F:/dnd-tmp/perf.lock 被沙箱拒绝；已请主会话协调外部测量。后续只用卡片授权的顺序双树法，不与测试并行。

未收到外部协调时不再做未排队的计时。主会话需在沙箱外执行 F:/dnd-tools/perf-gate.sh F:/dnd-wt/PF7 3bbd7e0c 3，并在同一锁窗口补采最终profile。当前不能宣称≤1.10已达标。

## 交接下一步

1. 主会话在沙箱外持同一perf.lock补采最终profile，并执行三对perf-gate；目前没有最终比值或达标结论。
2. 按PERFS7-remaining.txt继续100个未完成文件。修正版record-index-check完整文件也在其中：旧实现的长测因修正懒桶容器取消，修正版短回归6/6已过，不能把旧取消的运行算作完整自检通过。
3. 合并K15R4后处理其行为差异及金快照字段表；本卡没有新增golden或numeric差异，不需要为本卡重生成金快照。原基线失败/发布出处/静态允许项问题分别保留给相应责任块。

测试已停止，亲启PID记录在PERFS7-pids.txt/parents.txt，主动取消记录在PERFS7-cancellations.txt。只结束本会话亲启且已记录的进程；取消的普通文件均恢复重跑，最后remote-generation因时限未完成。CPU profiles与全部.perfs7-*临时助手已删除，工作树.tmp无遗留。原有未跟踪.base保留。另发现.base-index和.base-src/（09:20生成，无本会话创建记录），未擅自删除，主会话需确认其所有权。

最终内容diff仅3生产模块和4测试文件；docs/actions.json重导无内容diff，仅工作树换行元数据仍显示M。git diff --check无空白错误。未触及docs/架构设计/、world/design/、dist/、docs/待办.md、docs/问题.md。无提交或部署。
