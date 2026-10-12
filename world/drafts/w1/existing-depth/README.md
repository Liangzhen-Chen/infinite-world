# T10 离线作者候选

152 份 full 档减去四村的 120 份，实际范围为 32 人。`audit.json` 保存该集合差及 323 项失败叶；`base.json` 冻结原档。设计按八批、每批四人准备，原有知识条目、记忆、钱物、教学、技能和其他合格字段保留。

15 条共同事件中，13 条复用原已发布亲历或具体关系往来。南田用水和林果边界各有一条三人交谈候选，依据原关系及地方烦恼派生，清沟分工与试验仍未定。`source-evidence.json` 保存涉及的原关系和记忆片段；设计逐行明确选择 `referenceRelationshipIds` 与 `referenceMemoryIds`，公共审核投影会带入这些原档数组并冻结其指纹。它们只供事实审核，不授予人物另一方的私密知识。

准备命令为 `node tools/npc-depth.mjs --design world/design/w1-existing-depth.mjs --root world/drafts/w1/existing-depth --prepare`。本目录未运行真实模型，未建预算账，L2 和 L4 未跑；候选未发布。主会话分配模型槽后须沿共用持久预算按 `--card T10` 审核，单卡增量最多 3 元，W1 总额最多 20 元。

`offline-report.json` 记录离线结果。合入 T24 的精确已审核教学增量兼容后，卡片的三份相关测试与 CORE 全部通过，复验日志分别保存在 `related-after-T24-results.txt`、`core-after-T24-results.txt`。候选、base、foundation、清单及来源证据的指纹与作者提交 `4f0bfe4` 一致，正文未改。

旧发布测试曾因许苓正式服务有四项、原 M2 冻结稿只有两项而失败，原文仍保存在 `publication-failure.txt`，具体对照及历史验收结果保留在报告中。T10 保留正式四项服务，未修改公共发布器。此次复验仍为零模型，L2 和 L4 未跑。

`offline-v1-evidence/` 保存首次成功 prepare 的冻结骨架、候选及清单。v2 只把新增知识可靠性中的内部档案措辞改为“亲历”，重新 prepare 后的现候选仍未付费审核；旧证据未删。
