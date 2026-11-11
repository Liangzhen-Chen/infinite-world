# 卡 s509c-remote：S5-09 第 3 会话（修门禁回归）

第 2 会话的门禁（与共同基线 adb09c69 两次独立复跑对照）发现以下 5 项基线两次都通过、本卡失败，均为真回归。修实现，不改这些测试（导出类除外）：
1. tests/actions-catalog.test.mjs「actions.json 是最新导出」——运行 `node tools/export-actions.mjs` 重新导出，确认差异只来自本卡。
2. tests/education.test.mjs「统计层按种子人口与学馆容量授业，分段与重放一致，接近后还原技能且不重算」
3. tests/mining-jurisdiction.test.mjs「展开的远方郡按各自统治政体的九省法典立案：王国寒炉与赭牙部盟的盗采分别判罚」
4. tests/s3-e04.test.mjs「E04-3: upper court, stolen provenance, receiving case and witnessed report」
5. tests/scale.test.mjs「统计层只留住区聚合；接近后种子重放逐字节恢复身份，保留已参与事件的整户」（2 个用例）
这些很可能都与你第 2 会话改的 remote-generation/population、advance-registry/npc-schedule 中"推进前恢复、钉住者保留"有关：物化/并回改变了展开郡的人物身份、技能或事件参与者。逐个查根因。

（tests/baseline/regression.test.mjs 的 23 项是历史预期失败、tests/probes/run-001 超时，都不归本卡。）

逐文件跑上述 5 个 + tests/s5-09.test.mjs、wildlife-encounters、CORE。不跑慢档。汇报（≤250 字，F:/dnd/logs/sessions/s509c-remote.final.md）：每项根因与改法、测试结果。
