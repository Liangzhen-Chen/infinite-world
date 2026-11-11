卡 A3-D 第 1 轮（迁移核心阶段 A3）。项目《无限原野》：中西合璧修仙文字 RPG，Node 规则引擎是唯一真相源。工作区 F:/dnd-wt/A3D（分支 a3d，基于 a3a：A3-A 原语内核、RX、权限/同意/能力接点已交付并合入最新 master）。
卡定义：F:/dnd/logs/sessions/A3-astra-plan.md 的“A3-D”一节（第 117 行起）与第 8 条文件所有权；只改 A3-D 拥有的文件。A3-A 已交付接口见 F:/dnd/logs/sessions/A3A-sol5.final.txt 与 A3A-sol.final.txt 的“接口”一节；需要 A3-A 新增接点时写进报告“对 A3-A 的请求”，不要改 A3-A 拥有的文件（primitives*.mjs、rx*.mjs、action-authority*/consent/capacity、engine.mjs 中 A 的接线等）。另有 A3-A 第 6 轮与 A3-B/C/D 三张卡在其他工作区并行。
设计依据：docs/架构设计/06-动作层与开放动作.md、10 章 A3 行与“A3 加”各项、docs/待用户确认.md 用户玩法决定（两层动作；LLM 提原语由引擎校验；不支持率为 0，兜底为带标签实体；d20 避开 SRD 受限部分）。静态提示 ≤12000 且 A1 口径 10593 测试须通过；工具面不得为本卡新增静态工具（新能力走动作目录 world_actions/world_act）。
本轮按小步完成该卡最核心的部分并写验收测试；整卡做不完正常，到时限写清已完成/剩余/下一步。
跑：计划中本卡验收文件（能跑的）+ CORE + tests/a3-*.test.mjs。金快照不可改。
报告 F:/dnd/logs/sessions/A3D-sol.final.txt；回复 ≤200 字。
