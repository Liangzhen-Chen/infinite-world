# 卡片门禁 s503f-credit-r
worktree F:/dnd-wt/S503F vs 314e5e3f50da18258164d615e7dc86d467b587be；覆盖率选测 (shadow)；耗时 156 分钟
总判定：**INCOMPLETE**；退出码：1
通过 440/445（快档 445）
- [基础设施] INCOMPLETE：候选任务未完整结束：INCOMPLETE
## FAIL（3）
- tests/a1-lt-scenarios.test.mjs（测试）：L4 库存有限：铁匠铺的镐卖完后买不到，菜单说明下次进货的日子，到货后能再买：两次基线仅 0/2 次出现相同完整用例路径和指纹
- tests/actions-catalog.test.mjs（测试）：actions.json 是最新导出（改工具枚举后须重新运行 node tools/export-actions.mjs）：两次基线仅 0/2 次出现相同完整用例路径和指纹
- tests/arch-metrics.test.mjs（测试）：import 图：每个模块都已标层，没有新增的向上依赖或包间 import：两次基线仅 0/2 次出现相同完整用例路径和指纹
## BLOCKED（1）
- tests/baseline/regression.test.mjs（测试）：E1 战役重放使用自己的初始快照，世界种子改变不能改旧档：两次基线同败；缺少有效登记（未登记、owner/到期日无效、已过期或缺判定时间），需主会话决定（共 23 个用例）
## INCOMPLETE（1）
- tests/probes/run-001.test.mjs（基础设施）：候选结果不完整：TIMEOUT；deadline exceeded
已登记既有失败（KNOWN，已判 PASS）：0 个用例
既有待办：既有 90，新增 0，已移除 0，未核实 0
影子选测：保守集合 460，裁剪集合 460，裁剪会漏掉 0 个文件
慢档未跑（15）：tests/a3-acceptance.test.mjs、tests/agriculture.test.mjs、tests/farm-pests-clock.test.mjs、tests/farm-pests-harvest.test.mjs、tests/farm-pests-hunt.test.mjs、tests/ledger-price.test.mjs、tests/ledger-stock.test.mjs、tests/monster-society-content.test.mjs、tests/playtest-lifecycle.test.mjs、tests/s3-offscreen-life.test.mjs、tests/s3-run001.test.mjs、tests/seasonal-migration.test.mjs、tests/w4-b2.test.mjs、tests/w4-b3.test.mjs、tests/wildlife.test.mjs
