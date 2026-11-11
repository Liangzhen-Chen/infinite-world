# 交卡门禁 s5a-ledgerprice
worktree F:/dnd-wt/S5A vs master（import 关系选测）；受影响 434（快档 420，慢档跳过 14）；用时 102 分钟
- 通过 417/420
- **新回归 1**：tests/performance.test.mjs 2/1〔5000消息：真实历史分组、覆盖裁剪、场景与工具提示组装≤150ms，保持输入与增量索引〕
- 基线同败 2：tests/actions-catalog.test.mjs；tests/scale.test.mjs
- 慢档未跑：tests/a3-acceptance.test.mjs；tests/agriculture.test.mjs；tests/farm-pests-clock.test.mjs；tests/farm-pests-harvest.test.mjs；tests/farm-pests-hunt.test.mjs；tests/ledger-price.test.mjs；tests/ledger-stock.test.mjs；tests/monster-society-content.test.mjs；tests/playtest-lifecycle.test.mjs；tests/s3-offscreen-life.test.mjs；tests/seasonal-migration.test.mjs；tests/w4-b2.test.mjs；tests/w4-b3.test.mjs；tests/wildlife.test.mjs
