【进程规则】只能结束你本会话启动且记录了 PID 的进程；禁止按名称或批量结束 node。临时调试文件结束前删除。
【省额度规则】测试输出必须过滤，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（不要用 grep/head）；禁止读完整输出。本轮限时 60 分钟：到 50 分钟时停手，写交接报告（已完成、剩余、下一步）。
沙箱不允许 git 写操作；改完不提交。node 命令设 TEMP/TMP 为 F:/dnd-tmp，最多 3 个 node 进程。用中文汇报。

卡 S3-F 第 1 轮。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/S3-F（分支 s3-f，基于 s3，已含 S3-A/B/C/D/E、R1、R2、T 与最新 master）。
卡定义：F:/dnd/logs/sessions/S3-sol-replan.md 第 5 节“S3-F：继承、到期与真实付款接点”，失分条目见第 2.1 节表格中归 S3-F 的行。本轮只做该卡中对 tests/s3-run001.test.mjs 的 E04/E05/E18 分数贡献最大的 2–3 项，做完一项就跑一次 s3-run001 记录分数变化。不碰 S3-G/H 拥有的文件（计划第 5 节）。
最后跑：tests/s3-run001.test.mjs、tests/s3-*.test.mjs、transition-*、holdings-reconcile、ledger-reconcile、save-roundtrip、CORE。金快照不可改，不改断言。
报告 F:/dnd/logs/sessions/S3-F-sol.final.txt；回复 ≤150 字：本轮完成项、E04/E05/E18 分数前后、测试结果、剩余项。
