# AUDIT1 交接（工具 tools/audit-food-causes.mjs，未提交；完整结果 logs/sessions/AUDIT1-result.json）

**判据**：一日路程=engine.route 往返≤travel.dailyTravelMinutes(480)；开门=scheduleAt 含 trade 槽，所在聚落按店主正午位置；可售=saleableStock+foodProducerSurplus；需求=householdFoodDemand/statisticalFoodNeed；现钱=householdBudget；价=marketQuote/quoteSupply。

**30日**：歉收0；贫穷368次（45户151人，636.5餐，全是名册户：无钱包无库存）；分配0；链断567次（43户820人，18062.25餐）。合计18698.75，与基线一致。

**链断根因**：镇无食物店在售（shop_bs_yanzhe 店主常在 loc_hw/野外，shop.mjs:225、business.mjs:682），四村粮仓余粮>0、路通、统计组有钱27855却不运进镇（food-supply.mjs:162 要对方聚落店报价）。

**对账**：货币差0（流入7100，流出97142，faction_stage 81050 最大）；粮差0；账与旧字段无漂移。野食64000为懒开账（边界）。

**抽查**：链断2例（统计组第10天、house_bs_078 第4天）手工核对原状态无误；贫穷、歉收用放宽/收窄路程的反事实各复现45例；分配正式世界0例，仅单元验证。

**缺**：openShops 未导出，按 scheduleAt 重算；无套利工具。**未决**：45户名册户无资产是数据缺口还是真贫穷；同种子两次逐字节相同；t-ti3 基线同样4败，无新增。
