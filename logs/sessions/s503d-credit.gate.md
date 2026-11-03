# 交卡门禁 s503d-credit
worktree F:/dnd-wt/S503 vs s5a（import 关系选测）；受影响 434（快档 420，慢档跳过 14）；用时 81 分钟
- 通过 418/420
- **新回归 1**：tests/runtime.test.mjs 1/1〔E2/E19 浏览器：失败对账阻止出站生成，编辑撤销刷新玩家账本，元数据只留引用〕
- 基线同败 1：tests/actions-catalog.test.mjs
- 慢档未跑：tests/a3-acceptance.test.mjs；tests/agriculture.test.mjs；tests/farm-pests-clock.test.mjs；tests/farm-pests-harvest.test.mjs；tests/farm-pests-hunt.test.mjs；tests/ledger-price.test.mjs；tests/ledger-stock.test.mjs；tests/monster-society-content.test.mjs；tests/playtest-lifecycle.test.mjs；tests/s3-offscreen-life.test.mjs；tests/seasonal-migration.test.mjs；tests/w4-b2.test.mjs；tests/w4-b3.test.mjs；tests/wildlife.test.mjs
