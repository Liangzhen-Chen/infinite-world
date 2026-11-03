# S1b 账本：物品、粮与库存（执行计划，未纳入版本库）

1. [x] L0 扩展：多开账函数与开账范围（stock 后补开）、源通配预算、批次 lots 形状；词汇表补源汇与资源；stock.mjs 适配器（账户键、legacyStock、bookStock）；items.mjs 带账 —— 完成，fd6fd26e；ledger-stock 一季对账通过
2. [x] 写入点双写：行囊（itemDelta/changeItems/transferItems/produceItems 全部调用点）、势力/组织库存、聚落库存、粮仓与种粮（批次）、周贸易在途、军粮、质押与钱庄货、工程材料、矿脉与林木储量、托运等 —— 完成 c9879447
3. [x] 审计预加载跑相关测试，补全漏记，漏记 0 —— 全量（除 agriculture）审计：非测试夹具漏记 0
4. [x] 新对账/守恒测试（逐日推进：交易、制作、采集、农业一季、离屏）—— tests/ledger-stock.test.mjs 6/6
5. [-] agriculture 三年断言：拆给 R27，线索见 S1B-cc-001.final.txt；加工优先改动已撤回
6. [x] 度量、arch-layers、system-map 重生成；验收测试 —— 度量不变，223 项相关测试仅 actions-catalog（基线即失败）
7. [x] merge master、复验、提交、日志 —— caaf39f8
