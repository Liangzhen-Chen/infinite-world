卡 S2b-1 审查与收尾（架构迁移核心阶段）。项目《无限原野》Node 规则引擎。用中文汇报。工作区 F:/dnd-wt/S2B（分支 s2b，主会话已合入 master）。沙箱不允许 git 写操作：不要 merge/add/commit/checkout，只用 git status/diff/log/show 只读；改完不提交，由主会话代提交。所有 node 命令加 TEMP=F:/dnd-tmp TMP=F:/dnd-tmp，同时最多 2 个 node 进程。

背景：DeepSeek 执行者在 s2b 上实现了 L0 同刻调度器 server-plugin/scheduler.mjs 并接入 world_time（开关 schedulerWired，默认关）。报告：F:/dnd/logs/sessions/S2B-ds-001.final.txt、S2B-ds-002.final.txt；开关打开后金快照差异清单：F:/dnd/logs/sessions/S2B-ds-003.golden-diff.txt。规格：docs/架构设计/14-确定性与时序.md §14.2–§14.3、02-不变量.md I31 行、10-现状映射与迁移路线.md 第 98 行。

一、严格审查（你是独立审查者，不要轻信执行者的报告）：
1. git diff master...HEAD 全部改动：调度器是否真正驱动真实推进（不是只在测试里调用纯函数）；seq 是否全局单调且存档往返后续写；刻集是否只来自日程堆；争夺池是否不按实体 id/阶段先后偏向；有没有为过测试而特判。
2. tests/invariants/i31-total-order.test.mjs：哪些用例驱动真实引擎，哪些只测纯函数；断言是否足够强（序列哈希、含 seq）。
3. 金快照差异清单里的每一条差异：是否确实是 §14.2/§14.3 规则要求的后果，而不是 bug（例如事件丢失、重复、守恒被破坏、数值改变）。用守恒与对账测试佐证：开关打开时跑 tests/ledger-reconcile、holdings-reconcile、save-roundtrip、agriculture 以外的 village/settlement 相关测试。
二、处理：
- 若差异全部是规则要求的顺序/编号变化且守恒、对账、存档往返全过：把 schedulerWired 默认改为开启，按 tests/advance-registry.test.mjs 里已有的金快照更新方式（找文件内或 tools/ 下的更新开关）更新金快照，并在 F:/dnd/logs/sessions/S2B-sol-004.golden-rationale.txt 写明每个哈希变化的依据。然后跑：i31 测试、tests/engine/storage/plugin/system-map/advance-registry/save-roundtrip/ledger-reconcile/holdings-reconcile/scale 测试，全部通过才算完成。
- 若发现任何 bug 或不能由规则解释的差异：不要更新金快照，修 bug（若范围小）或列出问题清单交回。
- 删除未跟踪的临时脚本 tools/debug-i31.mjs、tools/s2b-golden-diff.mjs（删除文件本身允许）。system-map 测试改写的 docs/system-map.* 在报告里注明由主会话还原。
硬规则：不删/跳过测试、不放宽断言；不读 secrets.json；不改 docs/架构设计/。
报告写 F:/dnd/logs/sessions/S2B-sol-004.final.txt；最后回复 ≤250 字：审查结论（发现的问题）、是否开启并更新金快照、测试命令与通过/失败数、未解决项。
