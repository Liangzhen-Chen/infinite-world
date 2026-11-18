# yupo oats environment=1.2414 核查（只读）

## 结论
1.2414213562373095 = 1 + 0.01 × 24.1421356 = 1 + 0.01 × (10 + 10√2)。不是 1+√2/…，而是"运输距离加价"。
探针的 environment 字段 = marketQuote.explanation.environment = regionalBase / catalogBase（market.mjs:391），所以名字叫"环境"，实际包含运输因子。
同行 hazardFactor / magicFactor / forestWaterFactor 全为 1，三者都不是来源。

## 代码（文件:行）
- server-plugin/settlement-trade.mjs:88-97 regionalTradeBase：
  base × environment(hazard×magic×forestWater，行91) × clamp((1 + distanceKm × r.distanceFactorPerKm) × risk, ...priceFactorLimits.transport)
  仅当 item === r.item（rules.settlementTrade.item = item_oats）且该聚落是某条 lane 的 buyer 时才乘运输因子（行92）。
- 输入：
  - world/meta/rules.json:6270 settlementTrade.distanceFactorPerKm = 0.01（手写全局常数）
  - rules.json:6310-6320 lane weekly_sb_yp：seller 桑坂、buyer 玉坡(yupo)，routes [route_bs_sb, route_bs_yp]
  - world/geo/routes.json：route_bs_yp lengthKm=10；route_bs_sb lengthKm=14.142135623730951（=10√2，几何距离）
  - rules.json:1652 priceFactorLimits.transport=[1,3]（clamp 未触发）
  - risk = max(1, movingMinutes/(km/walkKmh*60))，探针里 =1（无季节封路，探针路线 movingMinutes 为 0 或不超过步行基准）。封路则 risk=3。

## 公式代入
distanceKm = 10 + 14.142135623730951 = 24.142135623730951
(1 + 24.1421356×0.01) × 1 = 1.2414213562373095
regionalBase = 3 × 1.2414213562 = 3.7242640687；listPrice = 3.7243×scarcity(3)=11.1728（缺粮）或 ×0.5=1.862（压到下限）。

## 分类
(c)，偏 (a)：距离来自地图路线长度（有物理含义，合规）；但 distanceFactorPerKm=0.01 是一个手写、无来源的全局费率（每公里加价 1%），且只对 item_oats 一种货、只对 5 条 lane 的买方聚落生效。
- 问题1：费率 0.01 无物理推导（没有 运价=人力日工资×时间/载重 之类来源）。
- 问题2：只对 oats 加运输价，别的物品（flatbread 等同样可运）环境=1，是按物品写死的特判；同一物品其他聚落（非 lane buyer）也无运输成分。
- 问题3：同一聚落的价格被"周贸易 lane 配置"决定，而非"该物品从产地到此地的真实运输成本"；买方才加价，卖方（产地）无。
R5③ 判不通过的原因合理：费率来源不明、适用面是配置特例。

## 处理建议
用源头机制替换，整类覆盖所有聚落所有可运物品：运输成本 = 搬运人工成本 / 载重 ÷ 物品价值。
- 输入全可取自现有规则：engine.route() 的 movingMinutes（含地形倍率、季节）、carryKgPerWorker=10（rules:6269）、unitKg 或物品 weightKg、劳力日工价（用 labour/工资规则里已有的工匠/农工日薪，需确认键）、路线 toll。
- 公式：transportCost(item, 产地→聚落) = (movingMinutes/日工分钟 × 日薪 × 往返系数 + toll) / (carryKgPerWorker / itemKg)；factor = 1 + transportCost / catalogBase，仍 clamp 到 transport 限度。
- 产地：用物品的主产聚落（规则里的产出/ stock 来源）或"最近有盈余的聚落"，对所有物品通用；oats 只是其中一例，delete r.item 特判与 distanceFactorPerKm。
- 同时把探针字段 environment 拆为 hazard×magic×forestWater 与 transport 两列，避免误读。

## 改动范围估计
- settlement-trade.mjs:88-97 regionalTradeBase 改写（约 15 行）；rules.json 删 distanceFactorPerKm、加工价/载重来源引用；m5-trade-rules.mjs:14 同步；tests/fixtures/legacy-r2-primitives.json 与 docs/测试报告 frozen-inputs（历史，不动）。
- 价格基线会变：所有 lane 买方的 oats 价与周贸易合同单价、依赖这些价的测试期望值。
- 需先确认：日薪规则键、物品重量字段、产地如何定义（这三项我没查）。
