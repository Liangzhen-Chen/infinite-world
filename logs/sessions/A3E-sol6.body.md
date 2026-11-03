卡 A3-E 第 6 轮（判分工具：能力前置与拒绝条目口径）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3E（分支 a3e，已同步最新 a3a）。你是验收工具作者：不改引擎实现。
1. setup 新增 abilities 字段（{skills:{id:熟练度}, spells:[id], recipes:[id], literacy, licenses:[id]}，出题者正在补入 F:/dnd/logs/sessions/a3-intents-v2.json）：用引擎正式的状态结构为玩家建立这些能力（读现有学习/法术/配方/识字的存档字段与测试夹具做法），建立失败记 setupUnmet。
2. 拒绝条目口径：expected.route 为 reject（或 outOfBounds=true 且应拒绝）的条目，签名判定改为“实际拒绝且已采用效果为空”即签名正确（拒绝后不应有已应用效果；expected.signature 视为被请求的效果仅作说明）。把口径写进工具注释与 a3-intents-v2.md 的“判分口径”节；自检补对应用例。
3. 语料更新后（文件修改时间晚于本卡开始），复制到 tests/fixtures/a3-intents-v2.json 并重跑 → F:/dnd/logs/sessions/a3-score-v2g.json，更新聚类 F:/dnd/logs/sessions/a3-gap-v2g.md。
跑：a3-score-self、CORE。报告 F:/dnd/logs/sessions/A3E-sol6.final.txt；回复 ≤150 字。
