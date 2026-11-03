# 交卡门禁 s507e-water
worktree F:/dnd-wt/S507 vs s5a（import 关系选测）；受影响 430（快档 416，慢档跳过 14）；用时 108 分钟
- 通过 413/416
- **新回归 2**：tests/performance.test.mjs 2/1〔5000消息：真实历史分组、覆盖裁剪、场景与工具提示组装≤150ms，保持输入与增量索引〕；tests/world-clock.test.mjs 5/1〔真实周贸易到货后推进阶段并消费区域报价，不把常量阶段当演变〕
- 基线同败 1：tests/scale.test.mjs
- 慢档未跑：tests/a3-acceptance.test.mjs；tests/agriculture.test.mjs；tests/farm-pests-clock.test.mjs；tests/farm-pests-harvest.test.mjs；tests/farm-pests-hunt.test.mjs；tests/ledger-price.test.mjs；tests/ledger-stock.test.mjs；tests/monster-society-content.test.mjs；tests/playtest-lifecycle.test.mjs；tests/s3-offscreen-life.test.mjs；tests/seasonal-migration.test.mjs；tests/w4-b2.test.mjs；tests/w4-b3.test.mjs；tests/wildlife.test.mjs
