卡 S2c 最终收口。项目《无限原野》Node 规则引擎。用中文汇报。工作区 F:/dnd-wt/S2C（分支 s2c，已合入 K1–K5 全部成果，主会话已提交）。沙箱不允许 git 写操作；改完不提交。node 命令设 TEMP/TMP 为 F:/dnd-tmp，最多 2 个 node 进程。【进程规则】只能结束你本会话启动且记录了 PID 的进程；禁止按名称或批量结束 node。临时调试文件结束前删除。
依据：F:/dnd/logs/sessions/S2C-astra-plan.md；交接 S2C-K123-sol.final.txt（scale 月推 152.9s > 120s 预算）、S2C-K4-sol.final.txt（E11 3/5，缺实际双 NPC 战斗与真实供献减少；月费调度失败）、S2C-K5-sol.final.txt（rawLiteral 118→53、activeSemantic 25、legacy 2；任务板 15/16、怪物社会 8/10 失败，称 HEAD 原版也复现）。S2 退出标准：docs/架构设计/10-现状映射与迁移路线.md 第 98 行。
任务：
1. scale：node --cpu-prof 剖析，优化到预算内；不许放宽预算。
2. E11 ≥80%（实现缺的两条行为），然后完整跑 tests/s2c-run001r.test.mjs，报 E02/E03/E06/E11/E14 每题分数（均须 ≥80%）。
3. “死亡”关键词：按计划第一节口径，activeSemantic 降到个位；剩余的逐个列出并说明为何属于合法的协议实现层（如 transition.mjs 本身）。
4. 任务板与怪物社会失败、月费调度失败：用 git stash 不可用，故用 git show master:<file> 对照或在报告里列出失败用例名，判断是否本分支引入（与 master 上同文件同测试结果对比：可用 git worktree 不可用，所以只读对比实现差异）；本分支引入的必须修，确为 master 既有的写明。
5. 最后跑：tests/s2c-*.test.mjs、transition-*、holdings-*、ledger-reconcile、save-roundtrip、invariants/i31-total-order、advance-registry、scale、a2-*、CORE。金快照不整批盲更新。
硬规则：不删/跳过测试、不放宽断言或预算；不读 secrets.json；不改 docs/架构设计/。
报告 F:/dnd/logs/sessions/S2C-final-sol.final.txt；最后回复 ≤250 字：五题分数、activeSemantic 数与清单、scale 数字、各测试组通过/失败、既有失败清单、未完成项。
