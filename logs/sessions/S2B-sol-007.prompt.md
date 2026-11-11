卡 S2b-1 最终收尾。项目《无限原野》Node 规则引擎。用中文汇报。工作区 F:/dnd-wt/S2B（分支 s2b，上一轮已提交）。沙箱不允许 git 写操作；改完不提交。node 命令加 TEMP=F:/dnd-tmp TMP=F:/dnd-tmp，最多 2 个 node 进程。

上一轮报告 F:/dnd/logs/sessions/S2B-sol-006.final.txt 第 37 行列出默认开启的两个阻碍：①本地/连续物件追平；②入学起始时刻语义（开课学生 life.since）。差异裁定见 S2B-sol-006.golden-rationale.txt 与 golden-diff.json。规格 docs/架构设计/14-确定性与时序.md §14.2、01-世界本体.md §1.9（刻集由日程堆唯一确定）、附录A §A.15（累计闭式）。

任务：解决这两个阻碍，使 schedulerWired 默认开启后：每一处金快照差异都能由规格解释（写入 F:/dnd/logs/sessions/S2B-sol-007.golden-rationale.txt，逐哈希写依据），守恒、对账、存档往返全过，“逐日推进 vs 一次推进”事件序列与状态相同。满足后默认开启，并用 advance-registry 测试已有机制更新金快照。若仍有不可解释差异：保持关闭，写清剩余问题，不要更新金快照。
跑：i31；tests/engine、storage、plugin、system-map、advance-registry、save-roundtrip、ledger-reconcile、holdings-reconcile、scale、a2-decision、a2-autonomy、education 相关测试（grep 找）。
硬规则：不删/跳过测试、不放宽断言或预算；不读 secrets.json；不改 docs/架构设计/。
报告 F:/dnd/logs/sessions/S2B-sol-007.final.txt；最后回复 ≤200 字：是否默认开启、金快照是否更新、测试数字、剩余问题。
