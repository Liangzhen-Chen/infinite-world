卡 S2c-K5（架构迁移核心阶段）。项目《无限原野》Node 规则引擎。用中文汇报。工作区 F:/dnd-wt/S2C-K5（分支 s2c-k5，基于 s2c，已含 K1 交付的接口）。沙箱不允许 git 写操作：只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。node 命令必须设 TEMP/TMP 为 F:/dnd-tmp（PowerShell：$env:TEMP='F:/dnd-tmp'; $env:TMP='F:/dnd-tmp'），最多 2 个 node 进程。

本卡完整定义见 F:/dnd/logs/sessions/S2C-astra-plan.md 的“K5”一节，以及第四节“文件所有权”与“调度”、第五节跨卡验收。只做 K5 拥有的文件，其他卡（含 K1 的 transition、holding-sources、activities 等共享接点）不碰。K1 已交付接口见 F:/dnd/logs/sessions/S2C-K1-sol.final.txt“接口”一节（lifecycleState、持有变更适配、succession 事件）；若需要 K1 新增接点，把需求写进报告“对 K1 的请求”，不要自己改共享文件。K5 是查询迁移与指标去噪：把计划第二节 B 类中归 K5 的 59 个模块改为调用 lifecycleState 等查询（机械替换，行为不得改变，相关测试必须保持通过），并按计划第一节的口径更新 tools/death-keyword-modules.mjs 的统计口径（口径改动须写依据）。
硬规则：不降标准、不删/跳过测试、不改断言迁就实现；金快照不可整批盲更新（若协议合法行为改变快照，逐条写依据并停下交主会话）；不读 secrets.json；不改 docs/架构设计/；世界内容只写 world/。
报告 F:/dnd/logs/sessions/S2C-K5-sol.final.txt；最后回复 ≤250 字：K5 负责的失分条目结果、测试数字、未完成项。
