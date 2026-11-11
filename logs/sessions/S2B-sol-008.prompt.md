卡 S2b-1 集成修复。项目《无限原野》Node 规则引擎。用中文汇报。工作区 F:/dnd-wt/S2B（分支 s2b，已合入最新 master，含 A2；同刻调度器 schedulerWired 默认开启）。沙箱不允许 git 写操作；改完不提交。node 命令加 TEMP=F:/dnd-tmp TMP=F:/dnd-tmp，最多 2 个 node 进程。

问题：合入 A2 后，A2 的测试“N5 托人送货按期到场真实交付，账本守恒，无模型”失败（在 tests/a2-*.test.mjs 中，grep 'N5 托人送货' 找）。在 master（调度器未合入）上它通过。请找到根因（调度器接线后送货义务/到场/交付的到期项或 seq、结算游标的交互），修实现（优先修调度器接线或送货路径中与 §14.2 不符的部分），不许改该测试断言，也不许对 N5 特判，不许把调度器默认关闭来绕过。规格 docs/架构设计/14-确定性与时序.md §14.2。
修后跑：该测试文件；tests/invariants/i31-total-order.test.mjs；tests/advance-registry、save-roundtrip、ledger-reconcile、holdings-reconcile、a2-decision、a2-autonomy、a2-dialogue、scale；以及 grep 找到的送货（delivery/送货）相关测试。金快照不可再改；若修复导致金快照变化，停下说明逐哈希依据。
报告 F:/dnd/logs/sessions/S2B-sol-008.final.txt；最后回复 ≤150 字：根因（文件:函数）、改动、测试数字。
