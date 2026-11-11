【进程规则】只能结束你本会话启动且记录了 PID 的进程；禁止按名称或批量结束 node。临时调试文件结束前删除。
【省额度规则】测试输出必须过滤，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（不要用 grep/head）；禁止读完整输出。本轮限时 75 分钟：到 65 分钟停手写交接。
沙箱不允许 git 写操作；改完不提交。node 命令设 TEMP/TMP 为 F:/dnd-tmp，最多 3 个 node 进程。用中文汇报。

卡 S3-E04（run-001 E04 最后两条，质量优先）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/S3E04（分支 s3-e04，基于 s3）。依据 F:/dnd/logs/sessions/S3-sol-replan.md 第 2.1 节 E04-2、E04-3 两行；题面 docs/probes/run-001/events.md（E04）。设计：docs/架构设计/15-经济与货币.md（价格读账户、区域报价）、10 章 S4（法域派生、规范栈、两步立案）与 S5（市场）的相关条目——本卡实现的是这些机制在 E04 链路上的最小正确版本，须按设计写在将来 S4/S5 会扩展的位置（不写一次性特判），并在报告里列出留给 S4/S5 扩展的接口。
1. E04-2 停工→铁价→打造成本：矿工停工使矿石产出账户减少，经 settlement-trade.mjs:regionalTradePrice 与 shop.mjs 报价/补货读账户存量（S1c 已改为读账户），铁价按存量变化上涨，铁匠打造投入成本随之上升；全链读真实账户，不写死系数。
2. E04-3 本地盗采罪与收赃追责：矿脉所在地的法域派生到有法院的上级政体（而非仅自治习俗时无法立案），盗采所得矿石带赃物来源标记（extraction.mjs:mineActor），买入赃物者按当地法典 receiving_stolen 追责，立真实法院案件。
更新 tests/probes/run-001/e04.mjs 这两条判据为驱动真实引擎的检查。跑：tests/s3-run001.test.mjs（E04 各判据）、tests/s2c-run001r.test.mjs、ledger-price/ledger-stock（可能较慢，单独跑）、law/extraction/settlement-trade 相关测试、CORE。
报告 F:/dnd/logs/sessions/S3-E04-sol.final.txt；回复 ≤150 字。
