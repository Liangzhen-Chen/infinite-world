卡 A3-A 第 10 轮（独立验收暴露的原语缺陷）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3A（分支 a3a，已合入 A3-E 判分工具与 v2 语料 tests/fixtures/a3-intents-v2.json）。
主会话用 tools/a3-score.mjs 对 v2 语料（120 条，含逐条 setup）实测，完整结果 F:/dnd/logs/sessions/a3-score-v2c.json。最大一类失败：preview 报错“账户键无效：player”29 条、“账户键无效：npc_hw_yanzhe”3 条——自指/人物解析为实体 id 后，transfer 等原语把它直接当账本账户持有人，未经账本的 actor→账户键映射（参照 server-plugin/money.mjs、stock.mjs 中 accountKey/actorId 的用法）。
任务：修原语层账户解析，使人物/玩家/组织/地点等实体作为 transfer 的 from/to 时按账本规则映射到正确账户（行囊、钱袋、公库等按资源与用途），不合法时给出明确拒绝理由。补测试。然后重跑 `node tools/a3-score.mjs tests/fixtures/a3-intents-v2.json` 报各指标变化（不改语料与判分工具）。
跑：tests/a3-*.test.mjs、ledger-reconcile、CORE。报告 F:/dnd/logs/sessions/A3A-sol10.final.txt；回复 ≤150 字。
