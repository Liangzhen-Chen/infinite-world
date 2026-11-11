// w3-journey 配方工序的 L1 确定性检查：骨架外器具、用火须交代火源、骨架外数量、泛称器具（tools/w3-process-check.mjs）。
// 全部用例用内嵌的最小骨架与物品目录（下方 SKELETON_*，由真实骨架裁出所需字段），正文样例取自 L4 前后真实草稿；
// 只有一条“接线”用例（validateTradesDraft 接入、context.catalog 不可枚举）要用真实 journeyContext，在用例内动态加载真实数据。不联网、不调模型。
import test from 'node:test';
import assert from 'node:assert/strict';
import {processIssues,unitlessMeasureIssues,buildVocabulary,utensilHeads,WORKSTATION_FACILITIES} from '../tools/w3-process-check.mjs';

// 漏判样例：L2 放过、L1 应拦下的真实正文。
const MISSED = {
  caraway_oat_crust: "取香芹籽置于案板，以切刀刀背逐粒压裂，令香气散出。将燕麦粉与粗盐倒入厚底煮锅，加入清水，用长柄搅糊板顺同一方向搅成稠糊，再拌入压裂的香芹籽至分布均匀。干木刨屑作燃料引火，小灶上置厚底煮锅，以文火加热，用搅糊板不断翻动，使糊中水分收去、渐成团块。将团块按薄片摊在锅底，逐片烘至两面干硬、边缘微翘，取出后所有成片合为一份交付。余下碎屑弃置，工具保留。全程80分钟。",
  pear_vinegar_slice: "取脆肉梨一份，用案上切刀剖开、剔去果核，再切成薄片。将滤蜜小罐份与两瓶酸果醋倒入厚底煮锅，持偏柄木匙搅至蜜散匀，随即下梨片短浸，使片片沾匀蜜醋。浸好后以木匙沿锅缘舀取梨片，装入使用者另备的容器；锅内余汁弃置，不随货交付。切刀与木匙用后拭去残汁收存。全程90分钟。",
  bottle_divider_crate: "取两块风干松木短板，用窄框木锯按格位宽度锯成箱壁与隔条短料，锯口贴齐板边推进。以直口木凿配枣木敲凿槌在箱壁内侧凿出接槽，槽深与隔条厚度相当，凿刃朝离手方向下切。将隔条逐根嵌入接槽试合，轻敲校正至格间匀齐。把小铁钉分点钉在箱壁与隔条交接处，每处先立稳再钉入，避免钉裂板边。软木薄片剪成与格底相合的垫片，逐格铺入垫平。空箱交付，不附瓶。全程260分钟。",
  broadbean_garlic_mash: "干蚕豆瓣置于厚底煮锅，注入规定清水浸泡至软，连水煮透。晒皮蒜头剥瓣去皮，以案上切刀切成细粒，投入锅中同煮。粗盐以刀背压碎后撒入，搅匀。煮至豆瓣轻压即散，用偏柄木匙沿锅缘翻压成泥，挑出残皮弃置；锅底焦屑刮下弃去，不混入泥中。木匙柄偏，便于贴锅壁舀取翻动。全程100分钟。",
  redwood_dye: "取厚底煮锅置于小灶，以干木刨屑引火，将规定份清水注入锅中，投入红染木碎片，以温火煎出颜色。煎毕，把宽口滤布搭在自备承接容器上，将染液滤过布面，去净碎屑。随后把工艺明矾粒溶入滤出的染液，用偏柄木匙沿锅缘搅匀，使明矾与染液充分混合。所得染液非食用、非药品，盛装容器须使用者另备，不随货提供。滤布上残渣与余下刨屑弃置，煮锅、木匙、滤布保留。全程100分钟。",
  seal_thread_bundle: "将麻线团退绕，按封结所需剪成短段，逐段薄拉过蜂蜡块表面，使蜡层附于线身。以平脊骨压片的圆端沿线束反复压顺，令蜡入捻隙、线体平伏。再用短锋修羽刀齐平各段线端，抖去碎屑，将线束与剩余蜡块一并收拢。全程五十五分钟，得卷札封结线一份；剩余蜡随线束交付，线束不具官方印章效力。",
  forged_chain_short: "将两公斤铁料按环数分作等长短条，逐条入炉烧至可锻，用长柄铁钳夹出置于砧面，以锻工手锤把每根条卷成环并趁热穿接上一环，接口叠合后锤击收拢，使相邻环相扣闭合。全部环穿接完毕，持圆身孔锉沿孔轴推拉，冷锉各环接缝与孔缘，去除毛刺并校圆。总耗时三百三十分钟，仅得一段短链，不承诺吊人负载；炉内炭屑不混入产品，余料弃置，三件工具保留。",
  mutton_turnip_stew: "取去骨羊肉与带皮芜菁，各在案上用切刀切成入口大小的块，芜菁的根须与坏斑先削去。切完生肉后，以干布面把刀面擦净，生熟分开。厚底煮锅置于小灶上，倾入配额清水，下羊肉与芜菁，投粗盐，取干木刨屑引火，慢煨至肉熟根软。其间用偏柄木匙沿锅缘翻动，拨去浮沫。锅壁破裂或内锈脱落时需维修。成煨一份，余料弃置，工具保留。全程120分钟。",
};
// 已严格 L4 通过的正文：不得误报。
const CLEAN = {
  mustard_relish: "取黄芥籽置于厚底煮锅干燥锅底，以案上切刀刀背分次压裂，每压一轮拨拢再压，使多数籽粒裂开而仍存粗粒。将酸果醋与粗盐倒入锅中，以偏柄木匙翻拌，令盐粒散开、醋液浸没籽粒。拌好后留在锅内静置吸润，中途再用木匙翻两次，使上下籽粒吸润均匀。全程不研成细粉，不另加染料或药材，保留颗粒感。完成后以木匙舀入待装容器，容器须使用者另备，不随货提供；锅内余料弃置，木匙与切刀保留。全程40分钟。",
  poppy_rye_crisp: "将细筛黑麦粉倒入厚底煮锅，加入清水，用长柄搅糊板顺同一方向搅成无干粉的稠糊，再拌入全部食用罂粟籽至分布均匀。取菜籽油薄薄润过锅底，以干木刨屑引火，小灶上分批摊薄稠糊，每批摊平后烘至饼身硬挺、内部干爽再起出。全程不加酵种。余油与散落籽粒弃置，煮锅与搅糊板留用。全程95分钟。",
  beet_barley_pot: "取红根甜菜就案上切刀削去外皮，切成小丁，根皮弃置不用。脱壳大麦倒入厚底煮锅，注入配额清水，以干木刨屑引火，火源只取这份刨屑，煮至麦粒软透。用偏柄木匙把甜菜丁拌入锅中，继续煨至菜丁熟软、红汁浸入麦粒，中途不另添水。撒入粗盐调味，以木匙沿锅缘搅匀，使红汁与麦饭相合。停火后仍用木匙将麦饭盛出，即得一份红根麦饭；余下刨屑与根皮弃置，锅、刀、匙留用。全程90分钟。",
  ledger_cover: "将薄鞣山羊革平铺，以短刃裁革剪逐段合剪，修去边角使对折后两页齐平。革料对折，用缝革扁锥沿折口两侧刺出扁缝孔，粗眼缝针穿细捻麻线依次缝边，针脚收紧。黄铜窄带以弯柄金属剪短行程分次合剪，分出四枚角片，各片对折夹住封皮四角，压合贴边。成品只是一副封皮，账页另备。全程180分钟。",
  small_bell_frame: "在铁匠铺砧台上，用弯柄金属剪把黄铜窄带短行程分次合剪，剪出一段作弯框、一段作悬片。框料以锻工手锤在砧上轻敲弯成弧形，两端对齐。悬片边缘用金属剪修齐，再用短身冲子配锻工手锤在砧台承托下于悬片与框端各冲小孔，孔位对齐。取退火铁线，用窄嘴饰线钳绕成挂环，穿入悬片与框端小孔，把悬片悬在框内，钳嘴夹合环口。晃动时悬片相碰发声，不警示远处敌情。剪下的铜屑与铁线余头弃置，工具保留。全程240分钟。",
  steel_gouge_tip: "用长柄铁钳夹住钢条置于炉上，以木炭为火源加热至可锻，移上砧台，用锻工手锤反复锤打，把刃端锻成卷曲的圆口，柄舌一并留出成形。锻毕趁热将圆口浸入清水淬口，再回火使刃口略带韧性。冷却后用圆身孔锉沿孔轴推拉，修整内弧至圆顺，换细面刃磨石磨利刃口。最后把柄舌插入小工具木柄装牢，检查刃口与柄接合。锻打与淬火中掉落的氧化皮、锉屑与磨浆均弃置，工具保留。全程320分钟。",
};

const SKELETON_ITEMS = [
  {id: 'item_cooking_pot', name: '厚底煮锅', tags: ['liquid_container', 'tool'], weight: 1.5},
  {id: 'item_kitchen_knife', name: '案上切刀', tags: ['tool'], weight: 0.3},
  {id: 'item_mixing_paddle', name: '长柄搅糊板', tags: [], weight: 0.24},
  {id: 'item_caraway_seed', name: '香芹籽', tags: [], weight: 0.04, shelfLifeDays: 180},
  {id: 'item_oat_flour', name: '燕麦粉', tags: [], weight: 0.4, shelfLifeDays: 30},
  {id: 'item_water', name: '清水一份', tags: [], weight: 0.25, shelfLifeDays: 1},
  {id: 'item_salt', name: '粗盐小包', tags: [], weight: 0.02},
  {id: 'item_wood_shavings', name: '干木刨屑', tags: ['fuel'], weight: 0.1, shelfLifeDays: 30},
  {id: 'item_caraway_oat_crust', name: '香籽燕麦硬片', tags: [], weight: 0.27, shelfLifeDays: 7},
  {id: 'item_wood_spoon', name: '偏柄木匙', tags: [], weight: 0.08},
  {id: 'item_pear', name: '脆肉梨', tags: [], weight: 0.3, shelfLifeDays: 7},
  {id: 'item_fruit_vinegar', name: '酸果醋小瓶', tags: [], weight: 0.05, shelfLifeDays: 90},
  {id: 'item_honey', name: '滤蜜小罐份', tags: [], weight: 0.1, shelfLifeDays: 180},
  {id: 'item_pear_vinegar_slice', name: '醋浸梨片', tags: [], weight: 0.26, shelfLifeDays: 2},
  {id: 'item_frame_saw', name: '窄框木锯', tags: ['tool'], weight: 1.1},
  {id: 'item_mortise_chisel', name: '直口木凿', tags: ['tool'], weight: 0.35},
  {id: 'item_wood_mallet', name: '枣木敲凿槌', tags: ['tool'], weight: 0.55},
  {id: 'item_pine_board', name: '风干松木短板', tags: [], weight: 1},
  {id: 'item_iron_nail', name: '小铁钉', tags: [], weight: 0.04},
  {id: 'item_cork_sheet', name: '软木薄片', tags: [], weight: 0.12, shelfLifeDays: 365},
  {id: 'item_bottle_divider_crate', name: '分格小瓶木箱', tags: [], weight: 1.25},
  {id: 'item_broad_bean', name: '干蚕豆瓣', tags: [], weight: 0.3, shelfLifeDays: 180},
  {id: 'item_garlic', name: '晒皮蒜头', tags: [], weight: 0.1, shelfLifeDays: 60},
  {id: 'item_broadbean_garlic_mash', name: '蒜香蚕豆泥', tags: [], weight: 0.48, shelfLifeDays: 1},
  {id: 'item_linen_filter', name: '宽口滤布', tags: [], weight: 0.27, shelfLifeDays: 180},
  {id: 'item_red_dyewood', name: '红染木碎片', tags: [], weight: 0.1, shelfLifeDays: 180},
  {id: 'item_alum_grain', name: '工艺明矾粒', tags: [], weight: 0.05, shelfLifeDays: 365},
  {id: 'item_redwood_dye', name: '温煎红木染液', tags: [], weight: 0.25, shelfLifeDays: 3},
  {id: 'item_bone_folder', name: '平脊骨压片', tags: ['tool'], weight: 0.08},
  {id: 'item_quill_knife', name: '短锋修羽刀', tags: ['tool'], weight: 0.1},
  {id: 'item_hemp_thread', name: '细捻麻线团', tags: [], weight: 0.15, shelfLifeDays: 365},
  {id: 'item_beeswax', name: '滤净蜂蜡块', tags: [], weight: 0.05},
  {id: 'item_seal_thread_bundle', name: '卷札封结线', tags: [], weight: 0.11, shelfLifeDays: 365},
  {id: 'item_smith_hammer', name: '锻工手锤', tags: ['tool'], weight: 1.2},
  {id: 'item_smith_tongs', name: '长柄铁钳', tags: ['tool'], weight: 0.7},
  {id: 'item_round_file', name: '圆身孔锉', tags: ['tool'], weight: 0.28},
  {id: 'item_iron', name: '铁料', tags: [], weight: 2},
  {id: 'item_charcoal', name: '木炭小袋', tags: ['fuel'], weight: 0.25},
  {id: 'item_forged_chain_short', name: '连扣铁短链', tags: [], weight: 1.4},
  {id: 'item_mutton', name: '去骨羊肉', tags: [], weight: 0.4, shelfLifeDays: 1},
  {id: 'item_turnip', name: '带皮芜菁', tags: [], weight: 0.4, shelfLifeDays: 10},
  {id: 'item_mutton_turnip_stew', name: '羊肉芜菁煨', tags: [], weight: 0.83, shelfLifeDays: 1},
  {id: 'item_mustard_seed', name: '黄芥籽', tags: [], weight: 0.05, shelfLifeDays: 180},
  {id: 'item_mustard_relish', name: '粗粒芥醋酱', tags: [], weight: 0.085, shelfLifeDays: 3},
  {id: 'item_poppy_seed', name: '食用罂粟籽', tags: [], weight: 0.05, shelfLifeDays: 120},
  {id: 'item_rye_flour', name: '细筛黑麦粉', tags: [], weight: 0.4, shelfLifeDays: 30},
  {id: 'item_rapeseed_oil', name: '菜籽油小份', tags: [], weight: 0.1, shelfLifeDays: 90},
  {id: 'item_poppy_rye_crisp', name: '籽香黑麦脆饼', tags: [], weight: 0.48, shelfLifeDays: 7},
  {id: 'item_beet', name: '红根甜菜', tags: [], weight: 0.4, shelfLifeDays: 10},
  {id: 'item_pearl_barley', name: '脱壳大麦', tags: [], weight: 0.5, shelfLifeDays: 180},
  {id: 'item_beet_barley_pot', name: '红根麦饭', tags: [], weight: 0.8, shelfLifeDays: 1},
  {id: 'item_leather_shears', name: '短刃裁革剪', tags: ['tool'], weight: 0.4},
  {id: 'item_stitching_awl', name: '缝革扁锥', tags: ['tool'], weight: 0.15},
  {id: 'item_sewing_needle', name: '粗眼缝针', tags: ['tool'], weight: 0.005},
  {id: 'item_sheet_shears', name: '弯柄金属剪', tags: ['tool'], weight: 0.85},
  {id: 'item_goat_skin', name: '薄鞣山羊革', tags: [], weight: 0.5, shelfLifeDays: 365},
  {id: 'item_brass_strip', name: '黄铜窄带', tags: [], weight: 0.2},
  {id: 'item_ledger_cover', name: '包角账页封皮', tags: [], weight: 0.38, shelfLifeDays: 365},
  {id: 'item_iron_punch', name: '短身冲子', tags: ['tool'], weight: 0.3},
  {id: 'item_jeweler_pliers', name: '窄嘴饰线钳', tags: ['tool'], weight: 0.2},
  {id: 'item_iron_wire', name: '退火铁线卷', tags: [], weight: 0.2},
  {id: 'item_small_bell_frame', name: '悬片响铃架', tags: [], weight: 0.25},
  {id: 'item_honing_stone', name: '细面刃磨石', tags: ['tool'], weight: 0.5},
  {id: 'item_steel_bar', name: '淬用钢条', tags: [], weight: 1},
  {id: 'item_tool_handle', name: '小工具木柄', tags: [], weight: 0.3, shelfLifeDays: 365},
  {id: 'item_steel_gouge_tip', name: '套柄圆口钢凿', tags: ['tool'], weight: 0.56},
];
const SKELETONS = {
  caraway_oat_crust: {id: 'recipe_w3c_caraway_oat_crust', workstation: 'cooking', tools: ['item_cooking_pot', 'item_kitchen_knife', 'item_mixing_paddle'], materials: [{item: 'item_caraway_seed', amount: 1}, {item: 'item_oat_flour', amount: 1}, {item: 'item_water', amount: 1}, {item: 'item_salt', amount: 1}, {item: 'item_wood_shavings', amount: 2}], output: {item: 'item_caraway_oat_crust'}, minutes: 80},
  pear_vinegar_slice: {id: 'recipe_w3c_pear_vinegar_slice', workstation: 'cooking', tools: ['item_cooking_pot', 'item_kitchen_knife', 'item_wood_spoon'], materials: [{item: 'item_pear', amount: 1}, {item: 'item_fruit_vinegar', amount: 2}, {item: 'item_honey', amount: 1}], output: {item: 'item_pear_vinegar_slice'}, minutes: 90},
  bottle_divider_crate: {id: 'recipe_w3c_bottle_divider_crate', workstation: 'woodworking', tools: ['item_frame_saw', 'item_mortise_chisel', 'item_wood_mallet'], materials: [{item: 'item_pine_board', amount: 2}, {item: 'item_iron_nail', amount: 8}, {item: 'item_cork_sheet', amount: 1}], output: {item: 'item_bottle_divider_crate'}, minutes: 260},
  broadbean_garlic_mash: {id: 'recipe_w3c_broadbean_garlic_mash', workstation: 'cooking', tools: ['item_cooking_pot', 'item_kitchen_knife', 'item_wood_spoon'], materials: [{item: 'item_broad_bean', amount: 1}, {item: 'item_garlic', amount: 1}, {item: 'item_water', amount: 2}, {item: 'item_salt', amount: 1}, {item: 'item_wood_shavings', amount: 2}], output: {item: 'item_broadbean_garlic_mash'}, minutes: 100},
  redwood_dye: {id: 'recipe_w3c_redwood_dye', workstation: 'cooking', tools: ['item_cooking_pot', 'item_wood_spoon', 'item_linen_filter'], materials: [{item: 'item_red_dyewood', amount: 1}, {item: 'item_alum_grain', amount: 1}, {item: 'item_water', amount: 2}, {item: 'item_wood_shavings', amount: 2}], output: {item: 'item_redwood_dye'}, minutes: 100},
  seal_thread_bundle: {id: 'recipe_w3c_seal_thread_bundle', workstation: 'woodworking', tools: ['item_bone_folder', 'item_quill_knife'], materials: [{item: 'item_hemp_thread', amount: 1}, {item: 'item_beeswax', amount: 1}], output: {item: 'item_seal_thread_bundle'}, minutes: 55},
  forged_chain_short: {id: 'recipe_w3c_forged_chain_short', workstation: 'smithing', tools: ['item_smith_hammer', 'item_smith_tongs', 'item_round_file'], materials: [{item: 'item_iron', amount: 1}, {item: 'item_charcoal', amount: 5}], output: {item: 'item_forged_chain_short'}, minutes: 330},
  mutton_turnip_stew: {id: 'recipe_w3c_mutton_turnip_stew', workstation: 'cooking', tools: ['item_cooking_pot', 'item_kitchen_knife', 'item_wood_spoon'], materials: [{item: 'item_mutton', amount: 1}, {item: 'item_turnip', amount: 1}, {item: 'item_water', amount: 2}, {item: 'item_salt', amount: 1}, {item: 'item_wood_shavings', amount: 3}], output: {item: 'item_mutton_turnip_stew'}, minutes: 120},
  mustard_relish: {id: 'recipe_w3c_mustard_relish', workstation: 'cooking', tools: ['item_cooking_pot', 'item_kitchen_knife', 'item_wood_spoon'], materials: [{item: 'item_mustard_seed', amount: 1}, {item: 'item_fruit_vinegar', amount: 1}, {item: 'item_salt', amount: 1}], output: {item: 'item_mustard_relish'}, minutes: 40},
  poppy_rye_crisp: {id: 'recipe_w3c_poppy_rye_crisp', workstation: 'cooking', tools: ['item_cooking_pot', 'item_mixing_paddle'], materials: [{item: 'item_poppy_seed', amount: 1}, {item: 'item_rye_flour', amount: 1}, {item: 'item_water', amount: 1}, {item: 'item_rapeseed_oil', amount: 1}, {item: 'item_wood_shavings', amount: 2}], output: {item: 'item_poppy_rye_crisp'}, minutes: 95},
  beet_barley_pot: {id: 'recipe_w3c_beet_barley_pot', workstation: 'cooking', tools: ['item_cooking_pot', 'item_kitchen_knife', 'item_wood_spoon'], materials: [{item: 'item_beet', amount: 1}, {item: 'item_pearl_barley', amount: 1}, {item: 'item_water', amount: 2}, {item: 'item_salt', amount: 1}, {item: 'item_wood_shavings', amount: 2}], output: {item: 'item_beet_barley_pot'}, minutes: 90},
  ledger_cover: {id: 'recipe_w3c_ledger_cover', workstation: 'woodworking', tools: ['item_leather_shears', 'item_stitching_awl', 'item_sewing_needle', 'item_sheet_shears'], materials: [{item: 'item_goat_skin', amount: 1}, {item: 'item_brass_strip', amount: 1}, {item: 'item_hemp_thread', amount: 1}], output: {item: 'item_ledger_cover'}, minutes: 180},
  small_bell_frame: {id: 'recipe_w3c_small_bell_frame', workstation: 'smithing', tools: ['item_sheet_shears', 'item_iron_punch', 'item_smith_hammer', 'item_jeweler_pliers'], materials: [{item: 'item_brass_strip', amount: 1}, {item: 'item_iron_wire', amount: 1}], output: {item: 'item_small_bell_frame'}, minutes: 240},
  steel_gouge_tip: {id: 'recipe_w3c_steel_gouge_tip', workstation: 'smithing', tools: ['item_smith_hammer', 'item_smith_tongs', 'item_round_file', 'item_honing_stone'], materials: [{item: 'item_steel_bar', amount: 1}, {item: 'item_charcoal', amount: 4}, {item: 'item_water', amount: 1}, {item: 'item_tool_handle', amount: 1}], output: {item: 'item_steel_gouge_tip'}, minutes: 320},
};
const SKELETON_TOOLS = ['item_cooking_pot', 'item_kitchen_knife', 'item_wood_spoon', 'item_mixing_paddle', 'item_frame_saw', 'item_mortise_chisel', 'item_wood_mallet', 'item_smith_hammer', 'item_smith_tongs', 'item_round_file', 'item_honing_stone', 'item_sheet_shears', 'item_iron_punch', 'item_jeweler_pliers', 'item_leather_shears', 'item_stitching_awl', 'item_sewing_needle', 'item_bone_folder', 'item_quill_knife', 'item_linen_filter'];

const CTX = {catalog: SKELETON_ITEMS, catalogRecipes: [{tools: SKELETON_TOOLS}]};
const recipe = id => SKELETONS[id];
const issues = id => processIssues(MISSED[id] ?? CLEAN[id], recipe(id), CTX);

test('词表从目录派生：器具、燃料不写死条目', () => {
  const gauges = [{id: 'compass', name: '铁脚圆规', tags: ['tool']}, {id: 'ruler', name: '木直尺', tags: ['tool']}];
  const vocab = buildVocabulary([...SKELETON_ITEMS, ...gauges], CTX.catalogRecipes);
  assert.ok(vocab.heads.has('圆规') && vocab.heads.has('直尺') && !vocab.heads.has('规') && !vocab.heads.has('尺'), '日常常用字不单独当中心词，两字词形仍在');
  assert.ok(vocab.heads.has('厚底煮锅') && vocab.heads.has('煮锅'), '器具全名与两字中心词来自目录');
  assert.ok(vocab.heads.has('剪') && vocab.heads.has('锯'), '手工具的单字中心词来自目录');
  const fuelIds = SKELETON_ITEMS.filter(item => item.tags?.includes('fuel')).map(item => item.id);
  assert.deepEqual([...vocab.fuels.keys()].sort(), fuelIds.sort());
  assert.deepEqual(utensilHeads('平脊骨压片'), ['压片'], '量词尾字不单独当中心词');
  assert.ok(['cooking', 'smithing', 'woodworking', 'weaving'].every(kind => WORKSTATION_FACILITIES[kind]?.length));
  for (const kind of new Set(Object.values(SKELETONS).map(row => row.workstation))) assert.ok(WORKSTATION_FACILITIES[kind], '每种工作台都有设施表：' + kind);
});

test('caraway_oat_crust：案板不在骨架里', () => {
  const found = issues('caraway_oat_crust');
  assert.equal(found.length, 1);
  assert.match(found[0], /骨架外器具「板」.*案板/);
  assert.match(found[0], /修复/);
});

test('pear_vinegar_slice：拭去需要布，骨架没有', () => {
  const found = issues('pear_vinegar_slice');
  assert.equal(found.length, 1);
  assert.match(found[0], /动作「拭去」.*布巾/);
});

test('bottle_divider_crate：没有剪类工具却剪成垫片', () => {
  const found = issues('bottle_divider_crate');
  assert.equal(found.length, 1);
  assert.match(found[0], /骨架外器具「剪」/);
});

test('seal_thread_bundle：同类，另一条剪成短段也被拦', () => {
  assert.match(issues('seal_thread_bundle').join(' '), /骨架外器具「剪」/);
});

test('broadbean_garlic_mash：骨架有燃料但正文没交代火源', () => {
  const found = issues('broadbean_garlic_mash');
  assert.equal(found.length, 1);
  assert.match(found[0], /用火.*没有交代火源/);
});

test('forged_chain_short：锻打入炉，木炭在骨架但正文没说作火源', () => {
  assert.match(issues('forged_chain_short').join(' '), /没有交代火源/);
});

test('mutton_turnip_stew：干布与擦净，骨架没有布', () => {
  const found = issues('mutton_turnip_stew').join(' ');
  assert.match(found, /泛称器具「干布」/);
  assert.match(found, /动作「擦净」/);
});

test('redwood_dye：滤进另备容器后又沿锅缘搅匀', () => {
  const found = issues('redwood_dye');
  assert.equal(found.length, 1);
  assert.match(found[0], /另备容器只作交付终点/);
});

for (const id of Object.keys(CLEAN)) test('正例不误报：' + id, () => assert.deepEqual(issues(id), []));

test('另备容器如实说明不算引入：声明与装入在同一句；去掉声明后容器与盖都是引入', () => {
  const entry = recipe('mustard_relish');
  assert.ok(/另备/.test(CLEAN.mustard_relish) && /容器/.test(CLEAN.mustard_relish));
  assert.deepEqual(processIssues(CLEAN.mustard_relish, entry, CTX), []);
  const bare = CLEAN.mustard_relish.replace('容器须使用者另备，不随货提供', '再盖好备用');
  const found = processIssues(bare, entry, CTX);
  assert.ok(found.some(message => /泛称器具「容器」/.test(message)), '没声明另备的“待装容器”是骨架外器具（骨架的锅会写成锅）：' + found.join(' '));
  assert.ok(found.some(message => /动作「盖好」.*盖具/.test(message)), '盖也是骨架外器具：' + found.join(' '));
});

test('骨架无燃料却写用火：错误', () => {
  const entry = recipe('mustard_relish');
  const fuelless = recipe('beet_barley_pot');
  const isFuel = row => SKELETON_ITEMS.find(item => item.id === row.item)?.tags?.includes('fuel');
  const stripped = {...fuelless, materials: fuelless.materials.filter(row => !isFuel(row))};
  assert.ok(stripped.materials.length < fuelless.materials.length);
  const found = processIssues(CLEAN.beet_barley_pot, stripped, CTX);
  assert.ok(found.some(message => /materials 里没有燃料/.test(message)));
  assert.deepEqual(processIssues(CLEAN.mustard_relish, entry, CTX), []);
});

test('否定的加热不算用火', () => {
  const entry = recipe('mustard_relish');
  const found = processIssues('蒜瓣切细，与软化黄油压拌，全程不加热，也不加酥油。', entry, CTX);
  assert.ok(!found.some(message => /用火/.test(message)), found.join(' '));
  assert.match(processIssues('蒜瓣切细，与软化黄油压拌，不断加热。', entry, CTX).join(' '), /用火/, '不断加热不是否定');
});

test('误报回归：架子、吸拭、翻折盖住、成品名里的动作字', () => {
  const entry = recipe('redwood_dye');
  const text = '干木刨屑两份引火，仅作灶下燃料与吸拭漏液之用。装好后把架子放平，包边翻折盖住毡边。';
  const found = processIssues(text, entry, CTX);
  assert.ok(!found.some(message => /吸拭|架子|盖住|子」/.test(message)), found.join(' '));
});

// 接线用例：要用真实 context 构造器（journeyContext 附带不可枚举的 catalog），所以动态加载真实数据。
test('接入 validateTradesDraft：命中进 errors，正例无新增错误；catalog 不可枚举', async () => {
  const {loadWorld} = await import('../tools/load-world.mjs');
  const {economyW3Journey} = await import('../world/design/economy-w3-journey.mjs');
  const {journeyContext} = await import('../tools/w3-journey.mjs');
  const {validateTradesDraft} = await import('../tools/w3-trades.mjs');
  const world = await loadWorld(), bones = economyW3Journey(world);
  const real = id => bones.recipes.find(row => row.id === 'recipe_w3c_' + id);
  const block = {names: [], realPeople: []};
  const entry = real('caraway_oat_crust');
  const result = validateTradesDraft({id: entry.id, process: MISSED.caraway_oat_crust}, entry, block, journeyContext(world, bones, entry));
  assert.ok(result.errors.some(message => /骨架外器具「板」/.test(message)));
  const clean = real('steel_gouge_tip');
  const context = journeyContext(world, bones, clean);
  const ok = validateTradesDraft({id: clean.id, process: CLEAN.steel_gouge_tip}, clean, block, context);
  assert.deepEqual(ok.errors, []);
  assert.ok(Array.isArray(context.catalog) && context.catalog.length > 0);
  assert.ok(!Object.keys(JSON.parse(JSON.stringify(context))).includes('catalog'), 'catalog 不可枚举：不进指纹与审核请求');
});

test('catalog 缺失：抛错，不静默跳过检查', () => {
  assert.throws(() => processIssues('取案板，煮熟。', {id: 'recipe_x', tools: [], materials: []}, {}), /catalog/);
  assert.throws(() => processIssues('取案板，煮熟。', {id: 'recipe_x', tools: [], materials: []}, undefined), /catalog/);
});

// ───────── 以下用例只依赖内嵌的最小目录与骨架，不读真实 recipe_w3c_* 数据 ─────────
const FX_CATALOG = [
  {id: 'pot', name: '厚底煮锅', tags: ['container']},
  {id: 'spoon', name: '偏柄木匙', tags: []}, // 经 catalogRecipes 的 tools 入器具表
  {id: 'board', name: '长柄搅糊板', tags: []}, // 同上，但不在测试骨架里
  {id: 'shear', name: '短刃裁革剪', tags: ['tool']},
  {id: 'jar', name: '陶罐', tags: ['container', 'ceramic']},
  {id: 'pressplate', name: '平脊骨压片', tags: ['tool']},
  {id: 'gauge', name: '直角量规', tags: ['tool']},
  {id: 'wipe', name: '干净布巾', tags: ['cloth']},
  {id: 'shaving', name: '干木刨屑', tags: ['fuel']},
  {id: 'wire', name: '退火铁线卷', tags: []},
  {id: 'flour', name: '黑麦粉', tags: [], weight: 0.5},
  {id: 'cake', name: '黑麦饼', tags: [], shelfLifeDays: 3},
  {id: 'basin', name: '宽口木盆', tags: ['container']},
  {id: 'sieve', name: '宽口滤布', tags: ['cloth']},
  {id: 'canvas', name: '麻帆布', tags: ['cloth']},
];
const fxContext = {catalog: FX_CATALOG, catalogRecipes: [{tools: ['spoon', 'board']}]};
const fxEntry = {id: 'recipe_fx', workstation: 'cooking', tools: ['pot', 'spoon'], materials: [{item: 'flour'}, {item: 'shaving'}], output: {item: 'cake'}};
const fxBare = {...fxEntry, tools: ['spoon']}; // 没有容器
const fxFacts = {...fxEntry, minutes: 40, processFacts: '黑麦粉按规定份量，浸泡30分钟，另加水一百毫升。'};
const fx = (text, entry = fxEntry) => processIssues(text, entry, fxContext);
const fxJoin = (text, entry) => fx(text, entry).join(' ');

test('夹具：词表从最小目录派生', () => {
  const vocab = buildVocabulary(FX_CATALOG, fxContext.catalogRecipes);
  assert.ok(vocab.heads.has('厚底煮锅') && vocab.heads.has('煮锅') && vocab.heads.has('剪'));
  assert.ok(vocab.heads.has('压片') && !vocab.heads.has('片'), '量词尾字不单独当中心词');
  assert.ok(vocab.heads.has('量规') && !vocab.heads.has('规'), '日常常用字不单独当中心词，但两字词形仍在');
  assert.deepEqual([...vocab.fuels.keys()], ['shaving']);
});

test('另备声明只豁免被声明的对象：不再放过同分句或同句里的其他器具', () => {
  assert.match(fxJoin('另备案板，用剪裁片。'), /骨架外器具「剪」/);
  assert.match(fxJoin('另备案板用剪裁片。'), /骨架外器具「剪」/);
  assert.doesNotMatch(fxJoin('另备案板用剪裁片。'), /「板」/, '被声明的案板本身不判');
  assert.match(fxJoin('不含水用案板切开。'), /骨架外器具「板」/);
  assert.match(fxJoin('不含水，用案板切开。'), /骨架外器具「板」/);
  assert.match(fxJoin('另备案板，倒入陶罐中。'), /骨架外器具「陶罐」/, '只声明了案板，陶罐不被豁免');
  assert.deepEqual(fx('另备案板，在案板上切开。'), [], '被声明的对象本句内再提到不算引入');
  assert.deepEqual(fx('倒入使用者另备的陶罐。'), []);
  assert.deepEqual(fx('盛入容器，容器须使用者另备，不随货提供。', fxBare), []);
  assert.match(fxJoin('盛入容器。', fxBare), /泛称器具「容器」/);
  assert.deepEqual(fx('空箱交付，不附陶罐。'), []);
});

test('否定只管紧邻的动作或器具：不断、不停不是否定', () => {
  assert.match(fxJoin('用偏柄木匙不断加热锅内糊料。'), /用火/);
  assert.match(fxJoin('用偏柄木匙不停加热锅内糊料。'), /用火/);
  assert.match(fxJoin('不断用案板搅匀。'), /骨架外器具「板」/);
  assert.deepEqual(fx('全程不加热。'), []);
  assert.deepEqual(fx('不再加热，也不坐灶加热，更不用火加热。'), []);
  assert.deepEqual(fx('不用案板，在锅中搅匀。'), []);
  assert.deepEqual(fx('不再用案板。'), []);
  assert.deepEqual(fx('糊料不经加热，静置即可。'), []);
  assert.deepEqual(fx('全程只作手压承板，不承重锤击。'), [], '否定与器具字之间隔一个性状词仍是否定');
  assert.deepEqual(fx('此板不受力敲打。'), []);
  assert.match(fxJoin('不断用案板搅匀。'), /骨架外器具「板」/, '不断不是否定，不能因放宽隔字而漏判');
  assert.match(fxJoin('不停用剪裁片。'), /骨架外器具「剪」/);
});

test('火源交代必须是肯定句并与燃料对上', () => {
  const pot = '锅置小灶上煮至软烂。';
  assert.deepEqual(fx('以干木刨屑引火，' + pot), []);
  assert.match(fxJoin('不以干木刨屑引火，' + pot), /没有交代火源/);
  assert.match(fxJoin('火源不取干木刨屑，' + pot), /没有交代火源/);
  assert.match(fxJoin('干木刨屑不作燃料，' + pot), /没有交代火源/);
  assert.match(fxJoin('以木炭引火，' + pot), /没有交代火源/, '火源用语有，但燃料不是骨架里的那份');
  assert.match(fxJoin(pot), /没有交代火源/);
});

test('用火词表：淬火、退火、熔炼、烧软、烧开、蒸都算用火；物料状态词不算', () => {
  for (const verb of ['淬火', '退火', '熔炼', '烧软', '烧开', '蒸', '回火', '焙']) assert.match(fxJoin('把料' + verb + '后取出。'), /用火/, verb);
  assert.deepEqual(fx('静置待水分蒸发。'), []);
  assert.deepEqual(fx('取退火铁线绕成环。'), [], '退火铁线是物料简称');
  assert.match(fxJoin('把铁线退火后绕成环。'), /用火/);
  assert.deepEqual(fx('以干木刨屑引火，把料淬火后取出。'), []);
});

test('身体部位擦拭不需要布巾；其他擦拭仍需要', () => {
  for (const text of ['用拇指擦去浮粉。', '以手掌轻轻擦净台面。', '用手指擦拭台面。', '用指腹慢慢擦去浮粉。']) assert.deepEqual(fx(text), [], text);
  assert.match(fxJoin('擦去浮粉。'), /动作「擦去」/);
  assert.match(fxJoin('手持布擦去浮粉。'), /动作「擦去」/);
  assert.match(fxJoin('用拇指压住，再擦去浮粉。'), /动作「擦去」/);
  assert.match(fxJoin('擦拭锅沿。'), /动作「擦拭」/);
});

test('另备容器之后：只有继续加工才算错，煮锅保留、翻倒弃置不算', () => {
  const end = /另备容器只作交付终点/;
  assert.doesNotMatch(fxJoin('倒入使用者另备的容器，煮锅保留，翻倒弃置余渣。'), end);
  assert.doesNotMatch(fxJoin('倒入使用者另备的容器，不再搅动。'), end);
  assert.match(fxJoin('倒入使用者另备的容器，再沿锅缘搅匀。'), end);
  assert.match(fxJoin('倒入使用者另备的容器，煮锅保留，再翻拌。'), end);
});

test('样例拟合的词表有反例：不会放过真错误', () => {
  // WEAK_TAIL：量词尾字不当中心词，但两字词形照判。
  assert.deepEqual(fx('取下薄片，再取一片碎片。'), []);
  assert.match(fxJoin('用压片压平。'), /骨架外器具「压片」/);
  // COMMON_CHARS：规定、规矩不当器具词，量规照判。
  assert.deepEqual(fx('按规定份量称取。'), []);
  assert.match(fxJoin('用量规比对。'), /骨架外器具「量规」/);
  // (?<!吸)拭：只有“吸拭”（物料吸收）放过，其余拭、擦拭照判。
  assert.deepEqual(fx('垫料吸拭漏液。'), []);
  assert.match(fxJoin('拭去残汁。'), /动作「拭去」/);
  assert.match(fxJoin('拭干锅沿。'), /动作「拭」/);
});

test('骨架外数量：质量容量须来自骨架或事实', () => {
  assert.match(fxJoin('称取七百克黑麦粉。', fxFacts), /骨架外数量「七百克」/);
  assert.match(fxJoin('倒入两升水。', fxFacts), /骨架外数量「两升」/);
  assert.match(fxJoin('倒入250毫升水。', fxFacts), /骨架外数量「250毫升」/);
  assert.deepEqual(fx('取五百克黑麦粉。', fxFacts), [], '等于材料重量×份数');
  assert.deepEqual(fx('另加一百毫升水。', fxFacts), [], 'processFacts 写明的数量');
  assert.match(fxJoin('取半斤黑麦粉。', fxFacts), /骨架外数量「半斤」/, '半斤=250克，不是骨架里的数');
  assert.deepEqual(fx('取一斤黑麦粉。', fxFacts), [], '一斤=500克，等于材料重量');
  assert.match(fxJoin('单片重零点一二千克。', fxFacts), /骨架外数量「零点一二千克」/, '小数按整体读，不截成一二千克');
  assert.match(fxJoin('整器重二点八千克。', fxFacts), /骨架外数量「二点八千克」/);
  assert.deepEqual(fx('行商偶尔带一两支现货，磨平四周。', fxFacts), [], '一两支是概数、四周是四边');
  assert.match(fxJoin('四周内用完。', fxFacts), /骨架外期限「四周」/, '周只在期限语境才算数量');
});

test('骨架外时长：分段时长判错，只放行事实里的数字与系统追加的总时长', () => {
  assert.match(fxJoin('约45分钟收汁。', fxFacts), /骨架外时长「45分钟」/);
  assert.match(fxJoin('静置十分钟。', fxFacts), /骨架外时长「十分钟」/);
  assert.match(fxJoin('全程约45分钟。', fxFacts), /骨架外时长「45分钟」/, '总括词后的数字也必须等于骨架 minutes');
  assert.deepEqual(fx('浸泡约30分钟。', fxFacts), [], 'processFacts 写明');
  assert.deepEqual(fx('全程40分钟。', fxFacts), [], '系统追加的总时长句');
  assert.deepEqual(fx('第二天再取用。', fxFacts), []);
});

test('骨架外期限：保存期以骨架为准', () => {
  assert.match(fxJoin('两日内用完。', fxFacts), /骨架外期限「两日」/);
  assert.match(fxJoin('五天内食用。', fxFacts), /骨架外期限「五天」/);
  assert.match(fxJoin('可保存七天。', fxFacts), /骨架外期限「七天」/);
  assert.match(fxJoin('存放五日。', fxFacts), /骨架外期限「五日」/);
  assert.match(fxJoin('五天用完。', fxFacts), /骨架外期限「五天」/);
  assert.match(fxJoin('食用期十天。', fxFacts), /骨架外期限「十天」/);
  assert.deepEqual(fx('晾半天，一天之中翻两次，再晾一天。', fxFacts), [], '晾半天、一天之中不是期限');
  assert.match(fxJoin('七天之内食用。', fxFacts), /骨架外期限「七天」/);
  assert.deepEqual(fx('三天内食用。', fxFacts), [], '等于骨架保存期');
});

test('泛称器具补全：碗盘盆罐与单字布', () => {
  assert.match(fxJoin('蛋液盛入碗中。'), /泛称器具「碗」/);
  assert.match(fxJoin('倒入陶碗。'), /泛称器具「陶碗」/);
  assert.match(fxJoin('成品装盘即可。'), /泛称器具「盘」/);
  assert.match(fxJoin('倒入盆内。'), /泛称器具「盆」/);
  assert.match(fxJoin('用布擦去浮粉。'), /泛称器具「布」/);
  assert.match(fxJoin('把糊摊在布上。'), /泛称器具「布」/);
  assert.deepEqual(fx('倒入盆内。', {...fxEntry, tools: ['pot', 'spoon', 'basin']}), [], '骨架里有盆类物品');
  assert.deepEqual(fx('倒入使用者另备的碗。'), [], '声明另备');
  assert.deepEqual(fx('不用碗，直接在锅中搅匀。'), []);
  assert.deepEqual(fx('盘绕成环，分布均匀，布置妥当。'), [], '盘绕、分布、布置不是器具');
  // 物品全名里含布字的不误报：骨架有宽口滤布；滤布简称带前字，不是单字布。
  const withCloth = {...fxEntry, tools: ['pot', 'spoon', 'sieve']};
  assert.deepEqual(fx('把宽口滤布搭在锅上，滤布上摊开糊料。', withCloth), []);
  assert.doesNotMatch(fxJoin('取麻帆布包住。'), /泛称器具「布」/, '麻帆布是目录物品，缺骨架时报它的全名而不是泛称布');
  assert.match(fxJoin('取麻帆布包住。'), /骨架外器具「麻帆布」/);
});

test('否定排除表：不过、不然、不料、不足、不够、不得不、分别不是否定', () => {
  for (const word of ['不过', '不然', '不料', '不足', '不够', '不得不', '不断', '不停'])
    assert.match(fxJoin(word + '用案板搅匀。'), /骨架外器具「板」/, word);
  assert.match(fxJoin('分别用剪裁片。'), /骨架外器具「剪」/, '“分别”里的别不是否定');
  assert.match(fxJoin('特别用剪裁片。'), /骨架外器具「剪」/);
  assert.match(fxJoin('分别煮熟后取出。'), /用火/);
  // 反面：真正的否定仍然成立。
  for (const text of ['不用案板搅匀。', '不得用案板搅匀。', '不必用案板搅匀。', '别用案板搅匀。', '别用剪裁片。']) assert.deepEqual(fx(text), [], text);
});

test('数量单位：勺、杯、滴、寸、个时辰', () => {
  assert.match(fxJoin('加入两勺盐。', fxFacts), /骨架外数量「两勺」/);
  assert.match(fxJoin('注入一杯水。', fxFacts), /骨架外数量「一杯」/);
  assert.match(fxJoin('滴入五滴油。', fxFacts), /骨架外数量「五滴」/);
  assert.match(fxJoin('裁成长五寸。', fxFacts), /骨架外数量「五寸」/);
  assert.match(fxJoin('静置三个时辰。', fxFacts), /骨架外时长「三个时辰」/);
  assert.deepEqual(fx('加盐两勺。', {...fxFacts, processFacts: '加盐两勺。'}), [], 'processFacts 写明');
  assert.deepEqual(fx('静置二个时辰。', {...fxFacts, processFacts: '静置二个时辰。'}), []);
});

test('用火词：加温、融化、炸、烫算用火；溶化、炸裂、烫手不算', () => {
  for (const verb of ['加温', '融化', '炸', '烫']) assert.match(fxJoin('把料' + verb + '后取出。'), /用火/, verb);
  for (const text of ['盐在水里溶化后取出。', '锅壁炸裂时需维修。', '锅沿烫手，勿碰。']) assert.deepEqual(fx(text), [], text);
});

test('期限只认天日周月；分钟时长走时长分支', () => {
  assert.match(fxJoin('二十分钟内收汁。', fxFacts), /骨架外时长「二十分钟」/);
  assert.doesNotMatch(fxJoin('二十分钟内收汁。', fxFacts), /期限/);
  assert.deepEqual(fx('三十分钟内收汁。', fxFacts), [], 'processFacts 写明 30 分钟');
  assert.match(fxJoin('五日内食用。', fxFacts), /骨架外期限「五日」/);
  assert.deepEqual(fx('三天内食用。', fxFacts), []);
});

test('度只在温度语境算单位；爆炸不是炸', () => {
  assert.deepEqual(fx('糊料一度翻动，再两度翻动。', fxFacts), [], '一度、两度是次数');
  assert.match(fxJoin('水温六十度。', fxFacts), /骨架外数量「六十度」/);
  assert.match(fxJoin('糊料升至九十度。', fxFacts), /骨架外数量「九十度」/);
  assert.deepEqual(fx('防止锅体爆炸。', fxFacts), []);
  assert.match(fxJoin('把料炸熟。', fxFacts), /用火/);
});

test('双重否定不算否定：不可不用、不能不用、非…不可、不得不', () => {
  for (const text of ['不可不用案板搅匀。', '不能不用案板搅匀。', '不得不用案板搅匀。', '非用案板不可。']) assert.match(fxJoin(text), /骨架外器具「板」/, text);
  for (const text of ['不可用案板搅匀。', '非用案板搅匀。']) assert.deepEqual(fx(text), [], text);
});

test('单位补全：g、ml、kg、钱、斗、合、尺', () => {
  assert.match(fxJoin('称取100g黑麦粉。', fxFacts), /骨架外数量「100g」/);
  assert.match(fxJoin('倒入200ml水。', fxFacts), /骨架外数量「200ml」/);
  assert.match(fxJoin('称取3kg黑麦粉。', fxFacts), /骨架外数量「3kg」/);
  assert.match(fxJoin('加三钱盐。', fxFacts), /骨架外数量「三钱」/);
  assert.match(fxJoin('倒一斗米。', fxFacts), /骨架外数量「一斗」/);
  assert.match(fxJoin('倒三合米。', fxFacts), /骨架外数量「三合」/);
  assert.match(fxJoin('裁长三尺。', fxFacts), /骨架外数量「三尺」/);
  assert.deepEqual(fx('另加100ml水。', fxFacts), [], '等于 processFacts 的一百毫升');
  assert.deepEqual(fx('取500g黑麦粉。', fxFacts), [], '等于材料重量');
  assert.deepEqual(fx('用尺规量好，三合土垫底。', fxFacts), [], '尺规、三合土不是单位');
  assert.deepEqual(fx('交付一件折口零钱夹。', fxFacts), [], '零钱夹里的零钱不是数量');
});

test('第5轮误报：度的温度语境、贮存安全写法、百合、烙印', () => {
  assert.deepEqual(fx('温水后一度翻动。', fxFacts), [], '一度是次数');
  assert.deepEqual(fx('水温升高后一度翻动。', fxFacts), []);
  assert.match(fxJoin('加热到九十度。', fxFacts), /骨架外数量「九十度」/);
  assert.match(fxJoin('折成九十度角。', fxFacts), /骨架外数量「九十度」/);
  for (const text of ['远离明火存放。', '忌见明火。', '避开明火，阴凉存放。']) assert.deepEqual(fx(text), [], text);
  assert.match(fxJoin('置于明火上。'), /用火/);
  assert.deepEqual(fx('取百合粉拌匀。', fxFacts), [], '百合不是数量');
  assert.match(fxJoin('倒三合米。', fxFacts), /骨架外数量「三合」/);
  assert.deepEqual(fx('在革面压出烙印。'), [], '烙印不是用火');
  assert.match(fxJoin('把料烙熟。'), /用火/);
});

test('总时长句的写法变体：等于 minutes 放行，不等于或分段仍判错', () => {
  for (const text of ['共耗时四十分钟。', '全程用四十分钟。', '总计四十分钟。', '前后共四十分钟。', '一共用四十分钟。', '全程含等待约40分钟。', '全程约40分钟。'])
    assert.deepEqual(fx(text, fxFacts), [], text);
  for (const text of ['共耗时四十五分钟。', '全程用四十五分钟。', '一共用五十分钟。', '全程含等待约45分钟。'])
    assert.match(fxJoin(text, fxFacts), /骨架外时长/, text);
  assert.match(fxJoin('熬煮约25分钟。', fxFacts), /骨架外时长「25分钟」/, '分段时长照判');
  assert.match(fxJoin('先静置，再约40分钟收汁。', fxFacts), /骨架外时长「40分钟」/, '没有总括词的“约N分钟”即使等于 minutes 也是分段');
});

test('物品正文：重量、容量、长度的数字必须带单位', () => {
  for (const text of ['整器重0.35，质地轻软。', '约重0.5。', '单片重零点一二，质地轻软。', '重二点八，重心偏前。', '长三十，宽十二。', '可容0.5，盛汤。', '直径 12 厘米，重0.3。'])
    assert.ok(unitlessMeasureIssues(text).length >= 1, text);
  // 边界：数字取最长匹配，“重240克”不会被截成“重24”判错。
  for (const text of ['重240克。', '重0.5千克。', '重二百五十克。', '重两千克。', '整器重二点八千克。', '长三十厘米，宽12cm。', '容0.5升。', '约重 300 g。', '长三尺。'])
    assert.deepEqual(unitlessMeasureIssues(text), [], text);
  // 同形词与量词：不是度量。
  for (const text of ['重叠三层。', '重复三次。', '宽三指。', '增长三成。', '提高三成。', '加厚三层。', '重两件。', '长三节。', '长约两臂。', '内容一致。', '一头厚一头薄。', '厚一点。', '长一截。', '高一些。', '深一点。', '宽一等。', '厚一倍。'])
    assert.deepEqual(unitlessMeasureIssues(text), [], text);
  for (const text of ['厚2。', '长三。', '深0.5，', '高十二。']) assert.ok(unitlessMeasureIssues(text).length === 1, text); // 相对说法不判，无单位数字仍判
  assert.match(unitlessMeasureIssues('整器重0.35，质地轻软。')[0], /重0.35.*没有单位/);
});

test('盘：动词用法（盘压、盘绕）与部件名词（轮盘、转盘）不是器皿；器皿用法照判', () => {
  for (const text of ['勿长期盘压成死结。', '线盘绕成圈。', '留有轮盘转过的旋纹。', '转盘上转动。'])
    assert.deepEqual(fx(text), [], text);
  assert.match(fxJoin('盛入盘中。'), /泛称器具「盘」/);
  assert.match(fxJoin('倒入木盘。'), /泛称器具「木盘」/);
});
