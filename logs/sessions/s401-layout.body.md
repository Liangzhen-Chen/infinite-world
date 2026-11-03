卡 s401-layout（S4 第一批 01：分区内移动真正可走）。项目《无限原野》。工作区 F:/dnd-wt/S401（分支 t-s401，自 a3a——A3 尚未合 master，S4 基于 a3a 开工）。先读 docs/产品原则.md、docs/当前状态.md“S4 规划”节（含主会话设计决定 A–E，尤其 A：分区邻接承担普通距离，已发布精细坐标只给现有法术适配，不建网格引擎，同分区不等于可接触），以及 S4 规划全文 F:/dnd/logs/sessions/s4-plan.final.txt 中“01｜分区内移动真正可走”一节（可改/锁定文件、验收命令、机制断言均以该节为准）。
目标（一句话）：玩家从地点菜单选择分区，沿实际邻接移动、耗时、绕障，移动后的地点描述与对象可及性一致。
依据：docs/架构设计/01 §1.5、08 §8.5、12 §12.4.4；docs/A3-后续阶段登记.md 中归 S4 的空间行（174、008/046、F5 等），只恢复其空间判据。
注意：另一张卡（a3t2-triage）可能改 extension/turn-contract.mjs 与 tools/playtest-*.mjs，本卡不碰；s4-plan 01 节列出的 action-affordances.mjs、action-router.mjs、action-text.mjs 若需改，改动保持最小并在报告逐处列出。布局规则若需世界数据，写 world/design/s4-layout.mjs 草案并经现有审批管线落地（真实模型 L2 上限 30 次、1 元，key 只从 DEEPSEEK_API_KEY）。
验收（逐文件单独运行）：tests/s4-layout.test.mjs（新增，前提用真实动作）、tests/action-registry.test.mjs、tests/a3-affordance-state.test.mjs、tests/a3-model-catalog.test.mjs；静态提示 ≤10593。
预计规模：约 55–65 分钟一个会话；做不完先提交可通过部分并写交接。
通用：TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，输出过滤为摘要。不为测试造接口或世界内容。不再启动其他会话或子代理。CORE 由主会话沙箱外跑。最后回复不超过 10 行，同样写到 F:/dnd/logs/sessions/s401-layout.final.txt。
