# 卡片门禁 s504-business
worktree F:/dnd-wt/S504 vs 0960452b35a4cda22ee0e0feb98674bb3ac96378；覆盖率选测 (shadow)；耗时 216 分钟
总判定：**INCOMPLETE**；退出码：1
通过 440/446（快档 446）
- [基础设施] INCOMPLETE：候选任务未完整结束：INCOMPLETE
## FAIL（4）
- tests/action-registry.test.mjs（测试）：注册表：数据声明、带命名空间、与 S0 动作清单一一对应且为最新同步：两次基线仅 0/2 次出现相同完整用例路径和指纹（共 2 个用例）
- tests/actions-catalog.test.mjs（测试）：actions.json 是最新导出（改工具枚举后须重新运行 node tools/export-actions.mjs）：两次基线仅 0/2 次出现相同完整用例路径和指纹
- tests/advance-registry.test.mjs（测试）：对照：full存档推进结果可重放且与快照逐字节相同：两次基线仅 0/2 次出现相同完整用例路径和指纹（共 2 个用例）
- tests/runtime.test.mjs（测试）：E2/E19 浏览器：失败对账阻止出站生成，编辑撤销刷新玩家账本，元数据只留引用：两次基线仅 1/2 次出现相同完整用例路径和指纹
## BLOCKED（1）
- tests/baseline/regression.test.mjs（测试）：E1 战役重放使用自己的初始快照，世界种子改变不能改旧档：两次基线同败；缺少有效登记（未登记、owner/到期日无效、已过期或缺判定时间），需主会话决定（共 23 个用例）
## INCOMPLETE（1）
- tests/probes/run-001.test.mjs（基础设施）：候选结果不完整：TIMEOUT；deadline exceeded
已登记既有失败（KNOWN，已判 PASS）：0 个用例
既有待办：既有 86，新增 0，已移除 4，未核实 0
影子选测：保守集合 461，裁剪集合 461，裁剪会漏掉 0 个文件
慢档未跑（15）：tests/a3-acceptance.test.mjs、tests/agriculture.test.mjs、tests/farm-pests-clock.test.mjs、tests/farm-pests-harvest.test.mjs、tests/farm-pests-hunt.test.mjs、tests/ledger-price.test.mjs、tests/ledger-stock.test.mjs、tests/monster-society-content.test.mjs、tests/playtest-lifecycle.test.mjs、tests/s3-offscreen-life.test.mjs、tests/s3-run001.test.mjs、tests/seasonal-migration.test.mjs、tests/w4-b2.test.mjs、tests/w4-b3.test.mjs、tests/wildlife.test.mjs
