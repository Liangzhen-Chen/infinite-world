【续跑说明】上一会话于 07:55 被意外终止（另一执行会话误杀了 node 进程），你已做的部分改动已由主会话提交为 WIP：先 git log -3 与 git show HEAD --stat 了解进度，再从中断处继续，不要重做已完成部分。【进程规则】禁止结束任何不是你本会话亲自启动的进程；禁止按名称或批量用 Stop-Process/taskkill 结束 node；只能结束你记录了 PID 的自己的测试进程。临时调试文件（如 debug-*.mjs）结束前删除。

卡 S2c 余项收口（K1/K2/K3 剩余）。项目《无限原野》Node 规则引擎。用中文汇报。工作区 F:/dnd-wt/S2C（分支 s2c，已合入 K2、K3，主会话已提交）。沙箱不允许 git 写操作；改完不提交。node 命令设 TEMP/TMP 为 F:/dnd-tmp，最多 2 个 node 进程。
依据：F:/dnd/logs/sessions/S2C-astra-plan.md（K1/K2/K3 节与第四、五节）；三份交接：S2C-K1b-sol.final.txt、S2C-K2-sol.final.txt（含对 K1 的请求、管事审批回归失败）、S2C-K3-sol.final.txt（建筑重建、持有新增接点、共享路径验收失败）。注意 K4（组织争位）与 K5（查询迁移）正在其他工作区并行，不要改它们拥有的文件。
任务：完成三份交接里的未完成项（真实到岗、封地 I6、质押清算、爵权保留、主权/实控适配、公开授爵/除爵入口、管事审批回归、建筑重建、持有新增接点、K2 对 K1 的请求），并把 E02 推到 ≥80%（补选等待已具备）。
跑：tests/s2c-*.test.mjs、tests/transition-*、holdings-*、ledger-reconcile、save-roundtrip、invariants/i31-total-order、advance-registry、scale、CORE。金快照不整批盲更新；硬规则同前：不删/跳过测试、不放宽断言；不读 secrets.json；不改 docs/架构设计/。
报告 F:/dnd/logs/sessions/S2C-K123-sol.final.txt；最后回复 ≤200 字：完成项、E02/E03/E06/E14 当前分数、测试数字、未完成项。
