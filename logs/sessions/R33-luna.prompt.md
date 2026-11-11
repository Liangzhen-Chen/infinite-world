卡 R33（主线回归修复）。项目《无限原野》Node 规则引擎。用中文汇报。工作区 F:/dnd-wt/R33（分支 r33，基于最新 master）。【进程规则】只能结束你本会话启动且记录了 PID 的进程；禁止按名称或批量结束 node。临时调试文件结束前删除。沙箱不允许 git 写操作：只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。node 命令设 TEMP/TMP 为 F:/dnd-tmp，最多 2 个 node 进程。
问题：tests/governance.test.mjs 在 master 上 2 过 6 败（管事待办/撤权/公账授权/日结回执/HTTP 签发等，如“建房待办无正式任命时明确停在权限决定…”“正式工具签发限期公账授权，必须真实主体与同意…”）。这些曾经通过，近期合入（S1 账本、S2a 持有存储、S2b 调度器与转移协议、A2、S2c）之一引入。任务：用 git log -- server-plugin/governance*.mjs 与相关模块的 diff 定位引入点，找出根因并修实现（修到 6 项全过）；不许改断言、不许跳过。修后跑 tests/governance.test.mjs、CORE（tests/engine、storage、plugin、system-map、advance-registry）、holdings-reconcile、ledger-reconcile、save-roundtrip。
硬规则：不删/跳过测试；不读 secrets.json；不改 docs/架构设计/。
报告 F:/dnd/logs/sessions/R33-luna.final.txt；最后回复 ≤150 字：根因（引入提交与文件:函数）、改动、测试数字。
