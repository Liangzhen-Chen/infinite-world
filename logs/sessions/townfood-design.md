# TOWNFOOD 设计审计
S=server-plugin/，W=world/。

## 1. 现状
农业：S/agriculture.mjs:141收获留种入仓，:213日粮供村民，:237保留人口×reserveDays；有生产公仓，缺镇零售出口。
周贸：S/advance-registry.mjs:419调用；S/settlement-trade.mjs:197要求双公仓，:204按余粮/需求/钱/运力取小值，:146入公仓。W/design/m5-trade-rules.mjs:17四村环线不供镇。
K08：S/business.mjs:655核营业、:683筛库存、:755预算及往返耗时、:834正午客流；S/npc-state.mjs:105集期选日程。有消费，无生产者发货。
K12：S/shop.mjs:402收实际到站运单、:427买在场货，:462无货不进口、:496拒托管公仓直补。有收货，无主动采购发运。
行商：S/remote-generation.mjs:569生成县供应者库存maximum−amount，:601走genesis；仅开局货，无循环供给。
K02：S/household-budget.mjs:183吃实物，:244市场替代须可达可负担货源，不造粮。W/meta/items.json:1燕麦、粉无nutrition；W/meta/recipes.json:1“筛磨→薄饼”才通向可食物。只运燕麦仍会饿。

## 2. 人口
W/design/w1-baishi-skeleton.mjs:78：306人90户+待生成694人210户=1000人。W/design/d1-system-data.mjs:30及S/advance-registry.mjs:394只跳过公仓日粮，不代表无需求。
S/npc-life.mjs:48结现有成员餐、公粮抵私粮；登记户保留此路，剩余人口按身体当量进统计消费/劳动收入账户。物化转移份额，两组不重计、不发钱粮。S/market.mjs:152–178目前读实体库存及货架，尚无此闭环。

## 3. 方案
产地售粮经K12实运、K08成交。新增S/food-supply.mjs：planFoodSupply/advanceFoodSupply。扣自用/种粮/承诺，经理按权限出售；报价经观察/消息获知，按净收益决定售/运/不动。同意后锁货钱，复用bookTransport/collectTransport；无车按人力分趟。到场成交；拒绝/腐坏/封路/损毁沿原账。
货架按营业能力/到货派生；加工须有配方/工具/设施/劳时，复用npc-autonomy，失败不补齐。生成县同用索引，行商不刷新。
补货目标=供给间隔需求−库存−有效在途；数量=min(真实余粮、运力、加工可处理量、需求、现金/到岸价)。余粮扣种用、已签交付及下次收成前本地缺口，发运重算；预期产量不是现货。marketQuote加运税，净益扣误工，合同锁价；噪声沿docs/架构设计/14-确定性与时序.md:69–76，允许拒卖。
新字段：无；复用集期/运力/损耗/营养/配方/价格表。
手算上界：80人村已入仓18000份、另有种粮2160，90日底线7200，余粮10800（W/meta/rules.json:5623–5664）；须再核收成前缺口。两人各10kg、每份0.5kg，一集只能运40份（W/design/m5-trade-rules.mjs:10–13）。设路8km、速4km/h，往返4小时另加装卸。40份经20分钟磨粉及35分钟烙4饼，共2200工分、水/盐/燃料各40份、得160饼；薄饼每份30饱食，标准成员每日60（W/meta/recipes.json:1、items.json:1；W/rules/tables/balance/body.json:10）。90户306人一周需4284饼、1071份粮、58905加工分钟，未计差异/失败；四村各一趟仅640饼，不到15%，且非周集。须按实际车辆/班次/加工劳力扩容。
性能：边界重算、聚落索引/路径缓存，约O(生产者+货架+候选路线)，新增持久量O(在途单+聚落统计账户)，不新增逐户日写。31郡性能待测。

## 4. 风险与拆卡
风险：90日保留未必覆盖生长期；灾年可缺粮。公仓份须换算营养；现货/在途不重计（S/market.mjs:181）。
A人口：独占S/{npc-life,household-budget,population,remote-generation,market}.mjs；新增food-demand测试：1000=306+694、物化守恒、非公仓消费、无逐户日写。
B产销：独占S/{food-supply,agriculture,shop,transport,advance-registry}.mjs及tools/{arch-layers,system-map}.mjs；验收两个镇及生成县实运实售、双卖/未知报价拒绝、封路/货损/无人接货/重放；跑agriculture、shop-restock、settlement-trade、transport、s5-law-periodic-market。
C加工：独占S/npc-autonomy.mjs及新制作候选模块；验配方材料/工具/劳时/失败、真实学习、30日到户营养与供需差额；跑npc-autonomy、s5-law-household-meals、新food-supply。shop接点归B；三卡串行，测试设计可并行。
每卡CORE/同步四件套/新增测试独进程。保留tests/s5-law-periodic-market.test.mjs:180/194/385无货不生货断言；settlement-trade.test.mjs:81/120及advance-registry粮钱/时序锚点会受采购竞争影响，逐字段解释，不重生金快照。

