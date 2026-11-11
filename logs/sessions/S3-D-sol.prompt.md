【进程规则】只能结束你本会话启动且记录了 PID 的进程；禁止按名称或批量结束 node。临时调试文件结束前删除。

卡 S3-D（架构迁移核心阶段）。项目《无限原野》Node 规则引擎。用中文汇报。工作区 F:/dnd-wt/S3-D（分支 s3-d，基于 s3，已含 S3-A 接口与 S3-B、S3-C 成果）。沙箱不允许 git 写操作：只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。node 命令设 TEMP/TMP 为 F:/dnd-tmp，最多 2 个 node 进程。

卡定义：F:/dnd/logs/sessions/S3-astra-plan.md 的“S3-D”一节，以及第 2 节归属表、第 3 节八题失分中归 S3-D 的条目、第 6 节文件所有权。只改 S3-D 拥有的文件；S3-A 的共享接点（义务生命周期内核等）不要改，S3-A 已交付接口见 F:/dnd/logs/sessions/S3-A-sol.final.txt“接口”一节（open/amend/settle/closeObligation 及查询、同步接点）；需要新接点写进报告“对 S3-A 的请求”。完成归你的迁移项与失分条目，并写场景测试。
跑：你的新测试；tests/s3-*.test.mjs；受影响模块的相关测试（用 grep 找到所有导入你改动模块的测试文件，全部跑）；CORE（tests/engine、storage、plugin、system-map、advance-registry）；ledger-reconcile、holdings-reconcile、save-roundtrip。金快照不整批盲更新。
硬规则：不降标准、不删/跳过测试、不放宽断言；不读 secrets.json；不改 docs/架构设计/；世界内容只写 world/。
报告 F:/dnd/logs/sessions/S3-D-sol.final.txt；最后回复 ≤250 字：完成的迁移项与失分条目、测试数字、对 S3-A 的请求、未完成项。
