卡 S2b-1 修复（架构迁移核心阶段）。项目《无限原野》Node 规则引擎。用中文汇报。工作区 F:/dnd-wt/S2B（分支 s2b）。沙箱不允许 git 写操作：只用 git status/diff/log/show；改完不提交，由主会话代提交。node 命令加 TEMP=F:/dnd-tmp TMP=F:/dnd-tmp，最多 2 个 node 进程。

你上一轮的独立审查报告：F:/dnd/logs/sessions/S2B-sol-004.final.txt（漏 seq、漏到期、结算游标混用致存档场景失败、真实阶段与争夺接线未完成；开启时 134 过 8 败）。规格：docs/架构设计/14-确定性与时序.md §14.2–§14.3、02-不变量.md I31 行。

任务：按报告逐条修好，使调度器在开启时真正驱动真实推进（阶段归序、全局单调 seq 且存档往返续写、刻集只来自日程堆、争夺池按 §14.2 缺省表裁决、不按实体 id 偏向），然后：
1. 开启状态下 8 个失败全部修复；i31 测试至少含 3 个驱动真实引擎的用例（一次推进 N 天 vs 逐日 N 次事件序列含 seq 相同；打乱系统注册顺序序列哈希不变；同刻争夺只随骰值键变化）。
2. 金快照：若开启后差异全部可由 §14.2/§14.3 规则解释、且守恒/对账/存档往返全过，则默认开启并按 advance-registry 测试已有的更新机制更新金快照，把每个哈希变化的依据写进 F:/dnd/logs/sessions/S2B-sol-005.golden-rationale.txt；否则保持默认关闭并说明还差什么。
3. 跑：i31；tests/engine、storage、plugin、system-map、advance-registry、save-roundtrip、ledger-reconcile、holdings-reconcile、scale；以及开启状态下你上轮跑出失败的那些文件。报告每条命令通过/失败数。
硬规则：不删/跳过测试、不放宽断言；不读 secrets.json；不改 docs/架构设计/。docs/system-map.* 若被测试改写，在报告注明。
报告写 F:/dnd/logs/sessions/S2B-sol-005.final.txt；最后回复 ≤250 字：修了什么、是否默认开启与金快照是否更新、测试数字、未解决项。如实写。
