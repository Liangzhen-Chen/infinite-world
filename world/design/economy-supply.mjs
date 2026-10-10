// Finite opening stock. This is a source-world plan, never a live save refill.
// Quantities describe the opening day; production and trade replenishment remain
// separate world-clock mechanics and must not be simulated by resetting these.
export const economySupplyPlan = [
 {npc:'npc_hw_luqing',reason:'小学堂校订抄本，各工序一册，已售罄须另行抄写',stock:{
   item_book_mill_oats:1,item_book_bake_flatbread:1,item_book_cook_porridge:1,item_book_curdle_milk:1,item_book_salt_fish:1,
   item_book_spin_wool:1,item_book_weave_linen:1,item_book_dip_candles:1,item_book_fire_cup:1,item_book_fire_pot:1,
   item_book_forge_nails:1,item_book_forge_hinge:1,item_book_sew_sack:1}},
 {npc:'npc_hw_ayan',reason:'磨坊已有木料另保留，谷袋与小木器按当日存货销售',stock:{
   item_oats:8,item_oat_flour:4,item_spindle:2,item_wooden_peg:8,item_tool_handle:2,item_wood_shavings:10,item_staff:1}},
 {npc:'npc_hw_linsui',reason:'青灯酒馆小厨房的当日鲜货与烹饪用料，不随交易生成容器',stock:{
   item_ration:4,item_bread:6,item_water:12,item_milk:4,item_salt:5,item_oat_flatbread:4,item_fruit_porridge:2,item_fresh_curd:2,item_cooking_pot:1}},
 {npc:'npc_hw_duanyan',reason:'铁匠铺可售备料和小件，手锤与钳为少量备用工具',stock:{
   item_iron:8,item_iron_scrap:6,item_charcoal:8,item_kitchen_knife:2,item_hide_scraper:1,item_smith_hammer:2,
   item_smith_tongs:2,item_sewing_needle:4,item_iron_nail:40,item_iron_hinge:2}},
 {npc:'npc_hw_sulan',reason:'织坊的纤维、织成布料与余备织具',stock:{
   item_bag:2,item_clothes:3,item_flax:6,item_wool_yarn:6,item_linen_cloth:4,item_loom:1,item_grain_sack:3}},
 {npc:'npc_hw_zhengshuisheng',reason:'渡口当日鱼获和短腌鱼，石料按已有河运来料供应',stock:{item_fish:4,item_salt_fish:2,item_stone:4}},
 {npc:'npc_hw_wushuo',reason:'猎人当日皮料与林边采料，鲜皮须及时交付处理',stock:{item_rawhide:2,item_tannin_bark:4,item_resin:3}},
 {npc:'npc_hw_taozhi',reason:'药草院已扎束而尚待按药种辨认的药草',stock:{item_herb:6}},
 {npc:'npc_hw_meiling',reason:'园艺师秋后留存的果干和已发酵果醋',stock:{item_dried_fruit:5,item_fruit_vinegar:4}},
 {npc:'npc_hw_anhuai',reason:'蜂场少量滤净蜡料及已浸制的灯烛',stock:{item_beeswax:6,item_wax_candle:8}},
 {npc:'npc_hw_yanzhe',reason:'白石镇商旅行会代理的进口与作坊货，陶器及羊毛为有限存货',stock:{
   item_wool:4,item_tanned_leather:2,item_clay:4,item_pottery_wheel:1,item_clay_cup:6,item_clay_pot:3}}
];

export function applyEconomySupply(world){
 const candidate=structuredClone(world),npcs=new Map(candidate.npcs.map(row=>[row.id,row])),items=new Set(candidate.items.map(row=>row.id));
 for(const plan of economySupplyPlan){
   const npc=npcs.get(plan.npc);if(!npc)throw new Error(`供货者不存在：${plan.npc}`);
   for(const[item,quantity]of Object.entries(plan.stock)){
     if(!items.has(item))throw new Error(`供货物品不存在：${item}`);
     if(!Number.isSafeInteger(quantity)||quantity<1)throw new Error(`初始库存无效：${item}`);
     // Even explicitly depleted stock must remain depleted on a second build.
     if(!Object.hasOwn(npc.inventory,item))npc.inventory[item]=quantity;
   }
 }
 return candidate;
}
