卡 S3（义务统一，架构迁移核心阶段）。项目《无限原野》：中西合璧修仙文字 RPG，Node 规则引擎是唯一真相源。用中文汇报。工作区 F:/dnd-wt/S3（分支 s3，基于最新 master，S2 已完成）。【进程规则】只能结束你本会话启动且记录了 PID 的进程；禁止按名称或批量结束 node。临时调试文件结束前删除。沙箱不允许 git 写操作：只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。node 命令设 TEMP/TMP 为 F:/dnd-tmp，最多 2 个 node 进程。
先读：docs/架构设计/10-现状映射与迁移路线.md 第 100 行（S3 范围与退出标准）及第 112–116 行各轮“S3 加”；05-统一模型.md 中义务（obligation）部分；15-经济与货币.md §15.1.1（在场与寄汇校验）；附录A §A.15（累计闭式）；02-不变量.md I29。已有基础：S2c 的 obligation-kinds.mjs、contract-state.mjs（义务种类声明 onDebtorGone/onCreditorGone）、transition.mjs、lifecycle-state.mjs；S1 账本 ledger.mjs/money.mjs。
建议先做规划：用 git grep 统计现有债务/义务处理点（设计说 41 处），按种类归并方案写进报告“计划”一节，再实施。
范围（S3）：41 处债务处理合并为义务种类（含 forward、bounty 开放债权人、approval、pact/gratitude/grievance/vow 的注册形状、onDebtorGone/onCreditorGone 含 pursue/heirs、宽限读 grace()、票据 = 义务 + 代表物品、actedAs 条款快照）；在场与寄汇校验；accruedTo 闭式；日程堆（与 S2b 调度器的日程堆统一）；F1 的 finance-* 改为义务种类数据；第 112–116 行“S3 加”各项（exclusive、redenominated、语言技能与沟通度、服务容量与紧迫度排队、salary 读职能有效、wageQuote、时效 limitation、关闭后债权、损失填补）。
退出标准：run-001 E04/E05/E12/E18 ≥80%（题面 docs/probes/run-001/，参照 tests/s2c-run001r.test.mjs 的写法建 tests/s3-run001.test.mjs）；run-002 E1/E3/N1 与 run-003 E15 的义务条目与 I29 通过；义务模块无逐日累计写（写一个静态检查测试）；日推进时间下降可测（scale 前后对比，月推须 ≤120 秒预算）。
测试：新测试 + tests/s2c-*、transition-*、holdings-*、ledger-reconcile、save-roundtrip、invariants/i31-total-order、advance-registry、a2-*、finance 相关、scale、CORE。金快照不可整批盲更新（若义务改道合法地改变快照，逐哈希写依据并停下）。
硬规则：不降标准、不删/跳过测试、不改断言迁就实现；不读 secrets.json；不改 docs/架构设计/；世界内容只写 world/。单个子问题超过 1 小时无进展就记线索继续别的。
报告 F:/dnd/logs/sessions/S3-sol.final.txt；最后回复 ≤300 字：归并了多少处、各退出标准结果、测试数字、scale 前后、未完成项。如实写。
