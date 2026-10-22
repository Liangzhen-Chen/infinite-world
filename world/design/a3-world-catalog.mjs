// A3 收口修复（fix3-world）：补齐 A3B daily22 / A3F 写入世界文件、但当时没有 L1/L2/L4 回执的目录条目。
// 条目的行取自正式世界文件的当前值；之后任何手改都会使回执失效。依据逐条写明来源；
// 没有独立世界文本依据、只来自日常题/语料题面或同类物估价的，在 boundary 里如实写明，并列入交主会话清单。
export const catalogRevision = 'a3-world-approval-1';

const ITEM_SOURCES = {
  item_hoe: {path: 'tests/daily-b2-mechanisms.test.mjs（日常题D12翻土播种）；A3V2-200题面“完好锄头”；world/rules/tables/domain-rules.json#sowTool',
    detail: '翻土播种的手工农具；段岩铁匠铺的铁匠配方recipe_hoe产出它。目录价12铜与材料成本（铁边料2+木炭3+木料4=9铜）、同铺长柄铁钳12铜相邻。',
    boundary: '世界文本只有农事规则引用sowTool=item_hoe，没有对锄头本身的独立描述；价格沿材料成本与同铺工具估定，不是独立依据。仅目录定义，不赠送库存。'},
  item_sickle: {path: 'tests/daily-b2-mechanisms.test.mjs（日常题D13收割）；A3V2-201题面“完好镰刀”；world/rules/tables/domain-rules.json#harvestTool',
    detail: '收割成熟谷物的手工农具；recipe_sickle由段岩传授。目录价10铜与材料成本9铜、同铺工具相邻。',
    boundary: '世界文本只有农事规则引用harvestTool=item_sickle，没有对镰刀本身的独立描述；价格沿材料成本估定。仅目录定义，不赠送库存。'},
  item_fishing_bait: {path: 'world/meta/rules.json#extraction.fishing.bait；tests/daily-b2-exact2.test.mjs（日常题D15.2钓鱼耗饵）',
    detail: '按份计的谷粒钓饵，每次抛竿消耗一份；recipe_fishing_bait由林穗传授，一份燕麦（3铜）揉成十份，每份1铜。',
    boundary: '谷粒钓饵与A3V2-203的蚯蚓钓饵是两种目录物，互不替代；价格1铜沿燕麦成本折算。仅目录定义。'},
  item_external_medicine: {path: 'world/meta/rules.json#medicine.takeHome；tests/daily-b2-events2.test.mjs（日常题D32.2诊疗带回三日药）；A3V2-208题面',
    detail: '医者用一份药草碾配的外敷药，每份为一天用量；诊疗后患者带回三日份。',
    boundary: '目录价2铜低于所用一份药草的目录价3铜（碾配成本高于售价），没有独立依据说明这一折价，列入交主会话清单；无配方登记，库存来自医者既有库存。仅目录定义。'},
  item_lantern: {path: 'tests/daily-b2-trade.test.mjs（日常题D35.2灯谜奖品）；A3V2-210题面“主办人库存花灯1”',
    detail: '纸面竹骨的小花灯，可由主办者从实际库存发作灯谜奖品。',
    boundary: '世界文本（festivals.json、地点）没有任何花灯或灯谜记载，题面是唯一来源；价格6铜只是沿同类轻手工物（小工具木柄6铜）估价，没有独立依据，列入交主会话清单。仅目录定义。'},
};
const RECIPE_SOURCES = {
  recipe_hoe: {path: 'world/meta/recipes.json；tests/daily-b2-mechanisms.test.mjs', detail: '铁匠段岩传授，铁边料、木炭、木料各一份，锻工手锤与长柄铁钳，锻造台制出一把铁锄。',
    boundary: '配方沿同铺既有铁匠配方的结构；耗时六十分钟、学费4铜、难度10为日常题所定，没有独立世界文本依据。'},
  recipe_sickle: {path: 'world/meta/recipes.json；tests/daily-b2-mechanisms.test.mjs', detail: '铁匠段岩传授，材料、工具与耗时同铁锄。',
    boundary: '同recipe_hoe；与铁锄使用同一组材料与耗时，不是独立标定。'},
  recipe_fishing_bait: {path: 'world/meta/recipes.json；tests/daily-b2-exact2.test.mjs（日常题D15.2）', detail: '林穗传授，用案上切刀把一份燕麦粗粒揉成十份钓饵团，烹饪台十分钟。',
    boundary: '传授人林穗是酒馆老板，其技能须不低于配方技能；产出数量与耗时为日常题所定。'},
};
export const NUTRITION_IDS = ['item_ration', 'item_bread', 'item_water', 'item_milk', 'item_oat_flatbread', 'item_fish_broth', 'item_mutton_turnip_stew'];
const RULE_SOURCES = {
  repair_clothes_seam: {path: 'world/meta/rules.json#repairs；A3V2-028题面', detail: '裁缝基础手艺用细捻麻线和缝针补缝普通衣服，织作台二十分钟，每次修复20点，不够百点。',
    boundary: '修理方案参数沿repair_tool_handle_trim等既有修理方案（20分钟、20点）；耗材为一团麻线。'},
  repair_sword_service: {path: 'world/meta/rules.json#repairs；A3V2-205题面；tests/daily-b2-mechanisms.test.mjs（日常题D18.2铁匠修剑）', detail: '铁匠基础手艺在锻造台修整直刃单手剑，三十分钟修满，收服务费25铜，不耗材料。',
    boundary: '25铜取自A3V2-205题面中修理方“本人承诺”的价格，不是独立世界标定；方案耗时三十分钟，题面承诺六十分钟，以方案为底数、承诺另议。'},
  shop_hw_forge_mining_pick: {path: 'world/meta/rules.json#economy.shops.stores.shop_hw_forge；world/meta/items.json#item_mining_pick', detail: '河湾铁匠铺每周补一把普通矿镐，上限两把。',
    boundary: '依据只有目录物item_mining_pick的origin就是bld_hw_forge，且段岩铺中已有同类铁器补货；没有独立文本写明铺子出售矿镐，列入交主会话清单。'},
  fishing_bait: {path: 'world/meta/rules.json#extraction.fishing.bait', detail: '钓鱼每次抛竿消耗一份谷粒钓饵（item_fishing_bait）。',
    boundary: '数量1对应目录物“每次抛竿消耗一份”；只管谷粒饵，不替蚯蚓饵立规则。'},
  medicine_takeHome: {path: 'world/meta/rules.json#medicine.takeHome', detail: '伤口诊疗后患者带回外敷药三份，共三天用量。',
    boundary: '数量3、天数3对应目录物“每份为一天用量”与A3V2-208题面“含三日份外敷药”；仅适用伤口诊疗。'},
};
export const sources = {items: ITEM_SOURCES, recipes: RECIPE_SOURCES, rules: RULE_SOURCES};
export const nutritionSource = {path: 'world/rules/tables/balance/body.json#person/satiety、person/hydration（数值方案 §2.14）',
  detail: '一餐 nutrition.satiety 为 30–40，一次饮水 hydration 为 25。'};
export const nutritionBoundary = '只给出可食用/可饮用物品一次进食或饮用的数值；数值落在body表给定范围内，不是配方营养计算。';
