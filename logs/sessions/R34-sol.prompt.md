【进程规则】只能结束你本会话启动且记录了 PID 的进程；禁止按名称或批量结束 node。临时调试文件结束前删除。

卡 R34（主线回归：同刻调度器）。项目《无限原野》Node 规则引擎。用中文汇报。工作区 F:/dnd-wt/R34（分支 r34，基于最新 master）。沙箱不允许 git 写操作：只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。node 命令设 TEMP/TMP 为 F:/dnd-tmp，最多 2 个 node 进程。

问题：二分定位显示以下测试文件在 S2b-1（同刻调度器默认开启，合并提交 e5a280b4）合入前通过、合入后失败：
tests/arch-metrics.test.mjs tests/daily-b2-exact2.test.mjs tests/m4-integration.test.mjs tests/magic-forge.test.mjs tests/magic-mind-space.test.mjs tests/medicine.test.mjs tests/monster-society.test.mjs tests/magic-air.test.mjs tests/magic-message.test.mjs tests/magic-ritual.test.mjs tests/manufacturing.test.mjs tests/npc-furnace.test.mjs tests/monster-society-content.test.mjs 
设计依据：docs/架构设计/14-确定性与时序.md §14.2；调度器 server-plugin/scheduler.mjs；S2b-1 报告 F:/dnd/logs/sessions/S2B-sol-007.final.txt 与金快照依据 S2B-sol-007.golden-rationale.txt；类似已修案例：R33（F:/dnd/logs/sessions/R33-luna.final.txt：调度器给记录加序号后回执存旧副本；读取路径改档；错过时刻的待办被追办）与 N5（到场先于交付、无刻行程补算）。
任务：逐文件找根因（多半是少数几类共性问题），优先修调度器接线或受影响模块的实现，使上述全部文件通过；不许改测试断言、不许特判测试、不许把调度器默认关闭。若某测试的期望本身依赖旧的错误时序（与 §14.2 冲突），停下逐条写依据交主会话，不要自行改期望。
修后跑：上述全部文件；tests/invariants/i31-total-order.test.mjs；tests/advance-registry、save-roundtrip、ledger-reconcile、holdings-reconcile、governance、a2-*、scale；CORE。金快照不可改。
硬规则：不删/跳过测试；不读 secrets.json；不改 docs/架构设计/。
报告 F:/dnd/logs/sessions/R34-sol.final.txt；最后回复 ≤250 字：根因分类（每类涉及哪些文件、文件:函数）、修复、每个文件前后通过/失败、仍失败项。
