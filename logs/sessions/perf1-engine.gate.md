# 卡片门禁 perf1-engine
worktree F:/dnd-wt/PERF1 vs a27acae4d9972ee1ce375f27fe7475daba8ca9fc；覆盖率选测 (shadow)；耗时 171 分钟
总判定：**FAIL**；退出码：1
通过 440/444（快档 444）
## FAIL（3）
- tests/actions-catalog.test.mjs（测试）：actions.json 是最新导出（改工具枚举后须重新运行 node tools/export-actions.mjs）：两次基线仅 0/2 次出现相同完整用例路径和指纹
- tests/ledger-price.test.mjs（测试）：价格输入点登记：每个读取点有调用处，每处调用都已登记；含价格字样的模块都已归类：两次基线仅 0/2 次出现相同完整用例路径和指纹
- tests/scale.test.mjs（测试）：真实日/月推进、5000消息提示与存档读写守住大世界预算：两次基线仅 1/2 次出现相同完整用例路径和指纹
## BLOCKED（1）
- tests/performance.test.mjs（测试）：5000消息：真实历史分组、覆盖裁剪、场景与工具提示组装≤150ms，保持输入与增量索引：两次基线同败；缺少有效登记（未登记、owner/到期日无效、已过期或缺判定时间），需主会话决定
已登记既有失败（KNOWN，已判 PASS）：0 个用例
既有待办：既有 90，新增 0，已移除 4，未核实 0
影子选测：保守集合 457，裁剪集合 457，裁剪会漏掉 0 个文件
慢档未跑（13）：tests/a3-acceptance.test.mjs、tests/agriculture.test.mjs、tests/farm-pests-clock.test.mjs、tests/farm-pests-harvest.test.mjs、tests/farm-pests-hunt.test.mjs、tests/monster-society-content.test.mjs、tests/playtest-lifecycle.test.mjs、tests/s3-offscreen-life.test.mjs、tests/s3-run001.test.mjs、tests/seasonal-migration.test.mjs、tests/w4-b2.test.mjs、tests/w4-b3.test.mjs、tests/wildlife.test.mjs
