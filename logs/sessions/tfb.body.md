# 卡 TFB：城镇粮食供应链 B——产地售粮、实运实售

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。设计依据（必读）：F:/dnd/logs/arch/townfood/design.md（astra 审计，含文件:行证据与手算）。本卡实现其中"B 产销"。

## 背景
白石镇登记 90 户 30 天 2700 户日中约一半缺粮，缺粮日镇上零售端无食品货架：村里有公仓余粮（agriculture.mjs:141/:213/:237），镇上铺子能收货（shop.mjs:402 收到站运单、:427 买在场货），但没有任何人主动把余粮卖出、运到镇上（settlement-trade.mjs:197 只在双公仓之间；K08 有消费无生产者发货；K12 有收货无主动采购发运）。

## 要做（按设计 §3，派生，不按名字特判）
1. 新模块 server-plugin/food-supply.mjs：planFoodSupply / advanceFoodSupply。产地（有公仓或私粮的聚落/家户）余粮 = 真实库存 − 自用到下次收成前的缺口 − 种粮 − 已签交付（预期产量不是现货）。经营者（公仓管理人或有权出售的人）按真实获知的报价（观察/消息，不全知）与净收益（扣运费、税、误工）决定售/运/不动，允许拒卖（噪声沿 14 §14.5.1）。
2. 运输：复用 transport.mjs 的 bookTransport/collectTransport（CT07 已合入车行等客与逐日行程钟点）；无车则人力分趟，运量受真实运力与负重限制。到场后经 K08/K12 现有成交路径卖给镇上铺子/集市；拒绝、腐坏、封路、损毁沿原账。
3. 镇上铺子的补货目标 = 供给间隔需求 − 库存 − 有效在途；数量 = min(真实余粮、运力、需求、现金/到岸价)。生成县同用此规律（行商不刷新）。
4. 性能：边界重算、聚落索引/路径缓存，持久量只增在途单与聚落统计，不新增逐户日写。
5. 不实现城镇抽象人口需求（卡 A，后续）与燕麦加工（卡 C）：本卡验收看"粮食实物真实到达镇上货架并被登记户买走"，加工成可食口粮另卡。若铺子只能卖不可直接食用的燕麦，如实报告到户营养缺口。
## 文件所有权
新建 server-plugin/food-supply.mjs；agriculture.mjs、shop.mjs、transport.mjs、advance-registry.mjs（daily 块接线）、settlement-trade.mjs（如需）、tools/arch-layers.mjs、tools/system-map.mjs、world/meta/rules.json 的新规则段与对应测试。不改 npc-life.mjs、household-budget.mjs、npc-state.mjs、household-subsistence.mjs（K16 在改）。
## 验收
共同规则清单（同文件逐子测对照）；新增 s5-law-food-supply 机制测试（两个镇及一个生成县实运实售；双卖/未知报价拒绝；封路/货损/无人接货；重放一致），手算锚点；跑 agriculture、shop-restock、settlement-trade、transport、s5-law-periodic-market（保留 :180/:194/:385"无货不生货"断言）；settlement-trade.test.mjs:81/:120 及 advance-registry 锚点变化逐字段解释（金快照字段表 TFB-golden-table.md，不重生成）；30 天审计：白石镇货架食品到货量、被登记户买走量。汇报 ≤300 字。
