# 卡片门禁 s509b-remote
worktree F:/dnd-wt/S509 vs adb09c6986d0e48b0a4f994538336f2239b63fcc；覆盖率选测 (shadow)；耗时 196 分钟
总判定：**INCOMPLETE**；退出码：1
通过 438/445（快档 445）
- [基础设施] INCOMPLETE：候选任务未完整结束：INCOMPLETE
## FAIL（5）
- tests/actions-catalog.test.mjs（测试）：actions.json 是最新导出（改工具枚举后须重新运行 node tools/export-actions.mjs）：两次基线仅 0/2 次出现相同完整用例路径和指纹
- tests/education.test.mjs（测试）：统计层按种子人口与学馆容量授业，分段与重放一致，接近后还原技能且不重算：两次基线仅 0/2 次出现相同完整用例路径和指纹
- tests/mining-jurisdiction.test.mjs（测试）：展开的远方郡按各自统治政体的九省法典立案：王国寒炉与赭牙部盟的盗采分别判罚：两次基线仅 0/2 次出现相同完整用例路径和指纹
- tests/s3-e04.test.mjs（测试）：E04-3: upper court, stolen provenance, receiving case and witnessed report：两次基线仅 0/2 次出现相同完整用例路径和指纹
- tests/scale.test.mjs（测试）：统计层只留住区聚合；接近后种子重放逐字节恢复身份，保留已参与事件的整户：两次基线仅 0/2 次出现相同完整用例路径和指纹（共 2 个用例）
## BLOCKED（1）
- tests/baseline/regression.test.mjs（测试）：E1 战役重放使用自己的初始快照，世界种子改变不能改旧档：两次基线同败；缺少有效登记（未登记、owner/到期日无效、已过期或缺判定时间），需主会话决定（共 23 个用例）
## INCOMPLETE（1）
- tests/probes/run-001.test.mjs（基础设施）：候选结果不完整：TIMEOUT；deadline exceeded
已登记既有失败（KNOWN，已判 PASS）：0 个用例
既有待办：既有 94，新增 0，已移除 0，未核实 0
影子选测：保守集合 460，裁剪集合 460，裁剪会漏掉 0 个文件
慢档未跑（15）：tests/a3-acceptance.test.mjs、tests/agriculture.test.mjs、tests/farm-pests-clock.test.mjs、tests/farm-pests-harvest.test.mjs、tests/farm-pests-hunt.test.mjs、tests/ledger-price.test.mjs、tests/ledger-stock.test.mjs、tests/monster-society-content.test.mjs、tests/playtest-lifecycle.test.mjs、tests/s3-offscreen-life.test.mjs、tests/s3-run001.test.mjs、tests/seasonal-migration.test.mjs、tests/w4-b2.test.mjs、tests/w4-b3.test.mjs、tests/wildlife.test.mjs
