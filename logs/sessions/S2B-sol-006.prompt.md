卡 S2b-1 收尾（架构迁移核心阶段）。项目《无限原野》Node 规则引擎。用中文汇报。工作区 F:/dnd-wt/S2B（分支 s2b，上一轮已由主会话提交）。沙箱不允许 git 写操作：只用 git status/diff/log/show；改完不提交。node 命令加 TEMP=F:/dnd-tmp TMP=F:/dnd-tmp，最多 2 个 node 进程。

上一轮报告：F:/dnd/logs/sessions/S2B-sol-005.final.txt（你自己写的；未完成：阶段/反应接线、读取追平缺口；开启时两项快照差异、scale 超预算）。规格：docs/架构设计/14-确定性与时序.md §14.2（五阶段、排序键、反应队列广度优先与深度上限）、02-不变量.md I31。本卡范围不含跨区补算（§14.3 跨区陈旧读）与分片并行，若读取追平属于跨区补算则只记录。

任务：
1. 把五阶段归序与反应队列（广度优先、深度上限、config_set 可配）接到真实推进；I31 测试补“级联反应”真实引擎用例。
2. scale 超预算：剖析（node --cpu-prof）调度器开销并优化到预算内，不许放宽预算。
3. 开启状态下的快照差异：逐条判断是否为 §14.2 规则要求；全部可解释且守恒/对账/存档往返全过，则默认开启并按 advance-registry 测试已有机制更新金快照，依据写入 F:/dnd/logs/sessions/S2B-sol-006.golden-rationale.txt；否则保持关闭并说明。
4. 跑：i31；tests/engine、storage、plugin、system-map、advance-registry、save-roundtrip、ledger-reconcile、holdings-reconcile、scale、a2-decision、a2-autonomy。
硬规则：不删/跳过测试、不放宽断言或预算；不读 secrets.json；不改 docs/架构设计/。
报告写 F:/dnd/logs/sessions/S2B-sol-006.final.txt；最后回复 ≤250 字：完成项、是否默认开启与金快照是否更新、测试数字、未完成项。
