# 乙-4 H3 import 图采集摘要（脚本生成，勿手改）

- 生成脚本：脚本/卷十一/collect-import-graph.mjs（只读、确定性；同一提交重跑逐字一致）
- 采集对象：目录树哈希 server-plugin 2998475680、extension b32997d4ae（git 的树对象，与提交号无关；同一树即同一内容；工作树相对该树的未提交改动：无）
- 检索口径：静态读 server-plugin、extension 下全部 .mjs/.js 文本；先去掉块注释与行注释；匹配 import…from、import '…'、export…from、import('…') 四种形状里的相对路径说明符，按 ./、../、补 .mjs/.js、目录 index 解析；裸说明符（node: 内建、包名）不入边，只计数。不执行任何被读代码。
- 文件数：337（server-plugin 304、extension 33）
- 边数：2966（静态 2964、动态 2）
- 裸说明符 72 个；动态 import 字面量 3 处；相对路径但落在采集范围外或解析不到 28 条（列在下表）

被 import 最多的前 10 个文件：

| 文件 | 入边数 |
|---|---:|
| server-plugin/holdings.mjs | 123 |
| server-plugin/precondition.mjs | 122 |
| server-plugin/storage.mjs | 115 |
| server-plugin/lifecycle-state.mjs | 109 |
| server-plugin/ledger.mjs | 96 |
| server-plugin/entity-view.mjs | 89 |
| server-plugin/money.mjs | 70 |
| server-plugin/npc-state.mjs | 62 |
| server-plugin/items.mjs | 59 |
| server-plugin/stock.mjs | 52 |

范围外或解析不到的相对 import：

| 文件 | 说明符 | 形状 |
|---|---|---|
| extension/index.js | ../../../extensions.js | static |
| extension/runtime.js | ../../../extensions.js | static |
| server-plugin/carry.mjs | ../world/rules/tables/balance/attributes.json | static |
| server-plugin/civic.mjs | ../world/design/m5-civic-rules.mjs | static |
| server-plugin/consistency-review.mjs | ../tools/narrative-claims.mjs | static |
| server-plugin/consistency-service.mjs | ../tools/deepseek-client.mjs | static |
| server-plugin/currency.mjs | ../world/rules/tables/balance/economy.json | static |
| server-plugin/derived-consumers.mjs | ../world/ontology/slots/consumers.json | static |
| server-plugin/derived.mjs | ../world/ontology/derived-fields.json | static |
| server-plugin/deterrence.mjs | ../world/rules/tables/balance/combat.json | static |
| server-plugin/environment-state.mjs | ../world/ontology/statuses.json | static |
| server-plugin/environment.mjs | ../world/design/water-foundation.mjs | static |
| server-plugin/finance-bank.mjs | ../world/rules/tables/balance/credit.json | static |
| server-plugin/holding-sources.mjs | ../world/design/transport-rules.mjs | static |
| server-plugin/index.mjs | ../tools/load-world.mjs | static |
| server-plugin/interactions.mjs | ../world/design/interaction-rules.mjs | static |
| server-plugin/item-class.mjs | ../world/meta/item-use-tags.json | static |
| server-plugin/item-class.mjs | ../world/rules/tables/balance/crafting.json | static |
| server-plugin/law.mjs | ../world/rules/tables/balance/law.json | static |
| server-plugin/market.mjs | ../world/rules/tables/balance/economy.json | static |
| server-plugin/npc-life.mjs | ../world/rules/tables/balance/attributes.json | static |
| server-plugin/npc-life.mjs | ../world/rules/tables/balance/population.json | static |
| server-plugin/npc-planning-service.mjs | ../tools/npc-autonomy-planner.mjs | static |
| server-plugin/runtime-world.mjs | ../tools/kc-processing.mjs | static |
| server-plugin/service-queue.mjs | ../world/rules/tables/balance/health.json | static |
| server-plugin/traits.mjs | ../world/design/transport-rules.mjs | static |
| server-plugin/transport.mjs | ../world/design/transport-rules.mjs | static |
| server-plugin/transport.mjs | ../world/rules/tables/balance/transport.json | static |
