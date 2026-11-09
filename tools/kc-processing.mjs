#!/usr/bin/env node
// 卡 C：通用初加工链的数据生成器（构建期，一次写入 world/，可重复运行，结果确定）。
// 规律在这里只有一处：每一类加工 = 工位 + 技能 + 工具 + 按原料重量派生的投入、产率与工时。
// 成员只写"原料 → 产物"对；数量、工时、副产物都由物品的 weight 与类参数推出，不逐条手调。
// 工具类按工具自身的材料构成（金属/木/石/骨/苇/毛/革）派生投入与工位，覆盖世界里每一种被当作工具用的物品。
// 抄书类覆盖每一件带 book 结构的物品：照原本（工具，不消耗）用羊皮纸与墨抄出一本。
// 已审行不改（A1）：生成器只写新增的行（recipe_kc_* 配方、两种新物品），作者原有的行一字不动；
// 对作者行起作用的是本文件的运行时规律 applyChainLaws，由 tools/load-world.mjs 在加载期施加到运行时世界：
//   据点：制成品（任何配方的产物）不再生；自然资源的储量与再生按"资源类 × 据点栖地"派生，并给每个据点补上本栖地原生的资源，
//   参数表 world/design/kc-site-ecology.json；栖地不长的遗留物（废墟旧木料、积盐）不再生。
//   初加工类里没有师傅的作者配方不要求拜师；只由本类配方造出的东西，基准价不低于它最省那条配方的材料价。
// 改不成规律的作者行更正（羊皮纸按链改价、冶炼不要锻锤、矿道口铁砂的物品登记）不在这里做，见 docs/审查/2026-11-05-已审内容改动盘点.md，走审批管线。
// 用法：node tools/kc-processing.mjs [--write] [--root <树>]。改类参数或资源表后重跑 --write，生成的配方行不手改。
import fs from 'node:fs';
import path from 'node:path';

// Command-line options belong to this script only when it is the entry point; imported as a library (runtime-world) the host's own --root must not redirect it.
const isMain = path.resolve(process.argv[1] ?? '') === path.resolve(import.meta.filename);
const argv = isMain ? process.argv.slice(2) : [];
const ROOT = argv.includes('--root') ? argv[argv.indexOf('--root') + 1] : path.resolve(import.meta.dirname, '..');
const WRITE = argv.includes('--write');
const P = rel => path.join(ROOT, rel);
const readJSON = rel => JSON.parse(fs.readFileSync(P(rel), 'utf8'));

// ---------- 新的自然物与中间物 ----------
// 只补链上缺的两种：麻的植株（自然物，据点再生），动物胶（熬胶类的产物，"墨 ← 烟炱 + 胶"里的胶）。
const NEW_ITEMS = [
  {id: 'item_flax_stalk', name: '野亚麻茎束', basePrice: 1, weight: 1, aliases: ['亚麻茎'], quality: '木', durability: 100, scope: null, origin: 'loc_wild_wt_mist', shelfLifeDays: 120,
    tags: ['plant', 'fiber_plant', 'material'], seasonality: '夏末拔取，雨季须摊晾', use: '一公斤带籽野亚麻茎，须沤软、捶打、梳理后才能得到可纺纤维；不能直接纺线。',
    description: '湿地边成片自生的野亚麻，夏末连根拔起，去叶后捆成约一公斤的一束。茎秆细长，外皮青褐，折断处可见纤维成丝。须先在水中沤软，再捶打、梳理，才能取出可纺的麻纤维。',
    inspection: '抽一根对折，外皮应能剥出连续细丝；发黑腐软或一折即碎的已沤过头或受潮。', storage: '摊在通风处晾干后成束立放，避雨，120天内沤制。'},
  {id: 'item_hide_glue', name: '熬制皮骨胶', basePrice: 4, weight: 0.05, aliases: ['皮胶', '骨胶'], quality: '木', durability: 100, scope: null, origin: 'bld_hw_weaving', shelfLifeDays: 365,
    tags: ['glue', 'material'], seasonality: '全年可熬，暑天易腐须阴干', use: '五十克干胶块，温水化开后作颜料与墨的黏结剂，也可黏木；遇潮回软。',
    description: '用生皮边角或生骨加水久熬，滤去渣后摊薄阴干的胶块，色呈琥珀到深褐，断面有光。温水泡软化开即成胶液，调烟炱可成墨，调色粉可作胶彩。',
    inspection: '对光看应透亮无渣，敲之脆响；发霉、发臭或一捏即软的已受潮。', storage: '纸包后装干罐，避潮避热，一年内用完。'},
  // 怪物据点生产：这四种自然物供晾干、脱壳两类初加工用（鲜菌、鲜浆果可晾干；带壳榛、带壳核桃可脱壳）。重量按成品重量÷类产率反推（一份原料恰出一份成品），基准价按成品价平价，数字待标定。
  {"id":"item_fresh_mushroom","name":"鲜栽培蘑菇","basePrice":5,"weight":0.2,"aliases":[],"quality":"木","durability":100,"scope":null,"origin":"site_ms_tj_fungus","shelfLifeDays":7,"tags":["food"],"seasonality":"菌床常年出菇，暖潮时出得多","use":"二百克一份的鲜栽培蘑菇，须煮透；采下后不及时晾干或烹煮，几天内就会发黏变味。","description":"菌床洞里培出的鲜蘑菇，一份约二百克，菌盖浅褐，菌褶细密，掰开菌柄断面洁白。采下当天最嫩，放久会发黏出水，须趁鲜煮食或切片晾成干菌片。","inspection":"菌盖应挺括干爽，菌柄断面洁白；发黏、出水、带酸臭或霉斑的整份弃去，不作试尝。","storage":"摊开放在阴凉通风处，不堆压不密封，七天内用完或晾干。"},
  {"id":"item_fresh_berry","name":"鲜林下浆果","basePrice":3,"weight":0.5,"aliases":[],"quality":"木","durability":100,"scope":null,"origin":"loc_ms_taideng","shelfLifeDays":7,"tags":["fruit","food"],"seasonality":"林下浆果夏秋成熟","use":"五百克一份的林下鲜浆果，可鲜食或切片晾成干果；熟透的易烂。","description":"林下采来的鲜浆果，一份约五百克，果皮薄，色从暗红到紫黑不等，熟透处一碰就破。当天吃最好，吃不完要切片摊开晾成干果。","inspection":"挑去压烂、出汁、生霉的果子；闻有酸馊味的整份弃去。","storage":"摊薄放在阴凉通风处，七天内吃完或晾干。"},
  {"id":"item_hazelnut_inshell","name":"带壳榛","basePrice":6,"weight":0.4,"aliases":[],"quality":"木","durability":100,"scope":null,"origin":"site_ms_yg_nursery","shelfLifeDays":60,"tags":["plant","material"],"seasonality":"秋季成熟采收","use":"四百克一份的带壳榛子，须敲裂外壳取仁；不能直接当干粮。","description":"榆根里育苗地榛树结的带壳榛子，一份约四百克，硬壳棕褐，圆头尖尾。须敲裂外壳、拣净碎壳才得榛仁。","inspection":"摇一摇听有无空响，空壳与有虫孔的拣出；壳面发霉的整份弃去。","storage":"装在透气筐里放干燥处，六十天内脱壳。"},
  {"id":"item_walnut_inshell","name":"带壳核桃","basePrice":6,"weight":0.3,"aliases":[],"quality":"木","durability":100,"scope":null,"origin":"site_ms_yg_nursery","shelfLifeDays":60,"tags":["plant","material"],"seasonality":"秋季成熟采收","use":"三百克一份的带壳核桃，须去青皮、敲壳取仁；不能直接当干粮。","description":"育苗地核桃树结的带壳核桃，一份约三百克，外壳起皱、色黄褐，须敲开壳、拣净隔膜碎壳才得核桃仁。","inspection":"掂有无分量，轻飘的多为空壳；壳缝发黑、出油腥的整份弃去。","storage":"装在透气筐里放干燥处，六十天内脱壳。"},
];

// ---------- 加工类 ----------
// yield：产物重量 / 原料重量；minutesPerKg：每公斤原料的劳动分钟；reagents：每公斤原料另需的辅料（份数，向上取整）。
// 每条配方处理一份原料（按原料最小计量单位），产物份数 = floor(原料重 × 产率 / 产物单重)，至少要能出 1 份，否则多取几份原料。
const PROCESSES = [
  {id: 'char', name: '烧炭', skill: 'skill_life_6_core', workstation: null, tools: [], yield: 0.25, minutesPerKg: 20,
    process: '把原料截段码进土窑或炭坑，引火后封闷，看烟色转青再封死冷却，扒出炭块敲碎装袋；烧过头成灰、欠火留生柴，失败不返料。',
    members: [['item_wood', 'item_charcoal']]},
  {id: 'saw', name: '开料', skill: 'skill_life_6_core', workstation: 'woodworking', tools: ['item_frame_saw'], yield: 0.5, minutesPerKg: 15, shavings: true,
    process: '挑无裂段顺纹弹线，锯开成规格料，修去树皮与毛边，余下边角刨成刨屑；料面开裂即成废料。',
    members: [['item_wood', 'item_pine_board'], ['item_wood', 'item_beech_blank'], ['item_wood', 'item_ash_stave']]},
  {id: 'mill', name: '磨粉', skill: 'skill_life_0_core', workstation: 'woodworking', tools: ['item_fine_sieve'], yield: 0.8, minutesPerKg: 40,
    process: '谷粒脱壳后上磨碾细，过细筛分出麸壳；潮粒结块须先晾干，筛不净的粗粉不算成品。',
    members: [['item_oats', 'item_oat_flour']]},
  {id: 'ret', name: '沤麻', skill: 'skill_life_0_core', workstation: null, tools: [], yield: 0.3, minutesPerKg: 60, reagents: {item_water: 2},
    process: '麻茎捆浸水中沤软，取出捶打去皮，再用梳篦理顺成纤维束；沤过头纤维发脆，捶断的短纤维弃置。',
    members: [['item_flax_stalk', 'item_flax']]},
  {id: 'spin', name: '纺线', skill: 'skill_life_4_core', workstation: 'weaving', tools: ['item_spindle'], yield: 0.9, minutesPerKg: 120,
    process: '纤维先松开理顺，挂上纺锤牵出纤维加捻，绕成线团；捻度不匀处断头接续，过细断线的短头弃置。',
    members: [['item_flax', 'item_hemp_thread'], ['item_wool', 'item_wool_yarn']]},
  {id: 'felt', name: '擀毡', skill: 'skill_life_4_core', workstation: 'weaving', tools: [], yield: 0.9, minutesPerKg: 150, reagents: {item_water: 2},
    process: '毛絮层层铺匀，洒温水反复卷压揉搓，使毛鳞咬合成片，晾干后修边；擀不实的松片要拆了重铺。',
    members: [['item_wool', 'item_wool_felt_sheet']]},
  {id: 'weave', name: '织布', skill: 'skill_life_4_core', workstation: 'weaving', tools: ['item_spindle', 'item_loom'], yield: 0.85, minutesPerKg: 300,
    process: '纤维纺成经纬线，上织架设经，逐行打紧纬线，下机修边；跳纱稀松处须拆织。',
    members: [['item_flax', 'item_linen_canvas']]},
  {id: 'tan', name: '鞣革', skill: 'skill_life_20_core', workstation: 'weaving', tools: ['item_hide_scraper'], yield: 0.65, minutesPerKg: 90, reagents: {item_tannin_bark: 3, item_water: 2},
    process: '生皮浸水回软，刮去残肉与毛，入捣碎树皮泡成的鞣液反复翻浸，漂洗后绷晾、揉软；鞣不透的生心发硬，失败不返料。',
    members: [['item_rawhide', 'item_tanned_leather'], ['item_rawhide', 'item_goat_skin']]},
  {id: 'parchment', name: '制羊皮纸', skill: 'skill_life_20_core', workstation: 'weaving', tools: ['item_hide_scraper'], yield: 0.3, minutesPerKg: 120, reagents: {item_water: 2},
    process: '生皮浸水脱毛，绷在框上边晾边刮，刮到薄而匀，再裁成张；刮穿或起皱的废张不算成品。',
    members: [['item_rawhide', 'item_parchment']]},
  {id: 'glue', name: '熬胶', skill: 'skill_life_20_core', workstation: null, tools: ['item_cooking_pot'], yield: 0.2, minutesPerKg: 120, reagents: {item_water: 2},
    process: '皮边或生骨洗净加水久熬，撇去浮油，滤渣后摊薄阴干切块；熬焦的发黑胶不能调墨。',
    members: [['item_rawhide', 'item_hide_glue'], ['item_raw_bone', 'item_hide_glue']]},
  {id: 'pitch', name: '熬脂', skill: 'skill_life_6_core', workstation: null, tools: ['item_cooking_pot'], yield: 0.8, minutesPerKg: 200,
    process: '树脂隔水化开，滤去树皮碎屑，小火熬去水分到能拉丝，倒模冷凝成块；火大起焦的弃置。',
    members: [['item_resin', 'item_pine_pitch']]},
  {id: 'soot', name: '收烟', skill: 'skill_life_22_core', workstation: null, tools: ['item_cooking_pot'], yield: 0.25, minutesPerKg: 300,
    process: '点燃原料，倒扣锅底于火焰上方收烟，刮下烟炱过筛；火苗过旺烟粗、熏不满的余烟弃置。',
    members: [['item_resin', 'item_lampblack']]},
  {id: 'ink', name: '调墨', skill: 'skill_life_14_core', workstation: 'woodworking', tools: ['item_stone_mortar', 'item_fine_sieve'], yield: 1, minutesPerKg: 0, fixedMinutes: 50, batch: 1,
    // 墨 ← 烟炱 + 胶：主料是烟炱，胶按黏结剂属性任选其一（树胶或熬制的皮骨胶），每份烟炱配一份胶一份水
    process: '胶块以清水浸软研成胶液，分次研入烟炱，压散团块，过细筛滤去粗粒，静置沉泡；过稠继续研散，不再加料。',
    binder: ['item_gum_grain', 'item_hide_glue'], members: [['item_lampblack', 'item_soot_ink']]},
  {id: 'paper', name: '抄纸', skill: 'skill_life_22_core', workstation: null, tools: ['item_fine_sieve'], yield: 0.4, minutesPerKg: 400, reagents: {item_water: 4},
    process: '纤维料切碎浸泡，捣成纸浆，以细筛在浆槽里抄起薄层，压水后贴墙晾干揭下；厚薄不匀或破洞的废张回槽。',
    members: [['item_reed_bundle', 'item_s2_yellow_paper']]},
  {id: 'smelt', name: '冶炼', skill: 'skill_life_5_core', workstation: 'smithing', tools: [], yield: 1, minutesPerKg: 60, reagents: {item_charcoal: 1},
    process: '分选含铁矿石，与木炭分层入炉鼓风还原，扒出铁块趁热夹去渣；矿劣或炉温不足只得炉渣。',
    members: [['item_iron_ore', 'item_iron']], perOutput: 2},
  {id: 'cut', name: '分料', skill: 'skill_life_5_core', workstation: 'smithing', tools: ['item_smith_hammer', 'item_smith_tongs'], yield: 0.9, minutesPerKg: 20, reagents: {item_charcoal: 1},
    process: '铁料回炉烧红，按规格剁开、拔长或拉细，冷后分拣；烧过火起泡的料归废边。',
    members: [['item_iron', 'item_iron_scrap'], ['item_iron', 'item_iron_wire'], ['item_iron', 'item_steel_bar']]},
  // 晾干：类参数取自仓库唯一的已审晾干配方「薄梨干片」（0.3 公斤鲜梨→0.09 公斤，300 分钟）：产率 0.3、每公斤原料 1000 分钟。calibration: pending。
  {id: 'dry', name: '晾干', skill: 'skill_life_9_core', workstation: null, tools: [], yield: 0.3, minutesPerKg: 1000, calibration: 'pending',
    process: '原料切片或摊开在竹筛与晾架上，放在通风处翻面晾到发脆，收袋；阴雨回潮或晾不透的发霉，失败不返料。',
    members: [['item_fresh_mushroom', 'item_dry_mushroom'], ['item_fresh_berry', 'item_dried_fruit']]},
  // 脱壳：仓库里没有已审的脱壳产率，产率 0.5 与每公斤 40 分钟均为占位（工时借「磨粉」类每公斤 40 分钟的脱壳磨粉工序）。calibration: pending，待标定。
  {id: 'shell', name: '脱壳', skill: 'skill_life_9_core', workstation: null, tools: [], yield: 0.5, minutesPerKg: 40, calibration: 'pending',
    process: '带壳的果实敲开或砸裂外壳，挑出果仁，拣净碎壳与空壳；砸碎了仁的归废，失败不返料。',
    members: [['item_hazelnut_inshell', 'item_hazelnut'], ['item_walnut_inshell', 'item_walnut']]},
];

// ---------- 工具类 ----------
// 每种工具按自身材料构成派生：主材决定工位、技能与所用工具；份额乘工具重量换成原料份数。
const MATERIAL = {
  // 锻工位自己的锤、钳用整块铁料锻（还没有锤钳时剁不出边料）；其余金属件用边料
  metal: {item: 'item_iron_scrap', stock: 'item_iron', fuel: 'item_charcoal'},
  // 生铁一次浇成的器物（锅、锭模）直接用矿石入炉熔铸
  cast: {item: 'item_iron_ore', fuel: 'item_charcoal'},
  wood: {item: 'item_wood', handle: 'item_tool_handle'},
  stone: {item: 'item_stone'},
  bone: {item: 'item_raw_bone'},
  reed: {item: 'item_reed_bundle'},
  hair: {item: 'item_raw_animal_hair'},
  leather: {item: 'item_tanned_leather'},
  // 竹竿、芦竿一类的长杆：取竹节芦管（干直芦管束里有竹节）
  rod: {item: 'item_reed_bundle'},
  thread: {item: 'item_hemp_thread'},
};
const SHOP = {
  metal: {skill: 'skill_life_5_core', workstation: 'smithing', tools: ['item_smith_hammer', 'item_smith_tongs'], minutesPerKg: 90, verb: '锻',
    process: '铁边料回炉烧红锻合成坯，按样打出形状，淬火回火后锉修；装木柄或铆接的部件最后合装。锻裂或淬裂的坯归废边。'},
  cast: {skill: 'skill_life_5_core', workstation: 'smithing', tools: ['item_smith_tongs'], minutesPerKg: 60, verb: '铸',
    process: '矿石与木炭入炉熔成铁水，以铁钳夹坩埚浇入砂模，冷后破模修去飞边；浇不满或炸裂的坯回炉不算成品。'},
  wood: {skill: 'skill_life_6_core', workstation: 'woodworking', tools: ['item_whittling_knife'], minutesPerKg: 60, verb: '削',
    process: '挑直纹木料下料，顺纹削出形状，修光边角，需要镶件的另行装合；逆纹崩裂的料弃作刨屑。'},
  stone: {skill: 'skill_life_14_core', workstation: null, tools: ['item_mason_chisel'], minutesPerKg: 50, verb: '凿',
    process: '选无暗裂的石块，凿去棱角找平，按用途凿出臼腹或磨面，最后以细砂磨平；凿出裂纹的废料不返。'},
  bone: {skill: 'skill_life_14_core', workstation: 'woodworking', tools: ['item_whittling_knife'], minutesPerKg: 300, verb: '磨',
    process: '生骨煮去油脂晾干，锯出坯料，以小刀削形再磨光；骨裂的坯弃置。'},
  reed: {skill: 'skill_life_14_core', workstation: 'woodworking', tools: ['item_whittling_knife'], minutesPerKg: 300, verb: '削',
    process: '挑干透无裂的芦管或细杆，削出所需形状，需要毛头的以麻线缠紧；劈裂的料弃置。'},
  rod: {skill: 'skill_life_6_core', workstation: 'woodworking', tools: ['item_whittling_knife'], minutesPerKg: 60, verb: '削',
    process: '挑匀直的细杆削去枝节，火烤校直，梢头系线；校直时折断的杆弃置。'},
};
const SHOP_TOOLS = new Set(Object.values(SHOP).flatMap(s => s.tools));
// 每种工具的材料构成（份额按重量，合计约为 1）；主材是份额最大的一项。
const TOOL_PARTS = {
  item_bamboo_fishing_rod: {rod: 0.9, thread: 0.1}, item_bench_plane: {wood: 0.85, metal: 0.15}, item_bone_folder: {bone: 1},
  item_brace_drill: {metal: 0.5, wood: 0.5}, item_button_shank_tool: {metal: 1}, item_chasing_punch: {metal: 1}, item_cooking_pot: {cast: 1},
  item_drawknife: {metal: 0.7, wood: 0.3}, item_fine_sewing_needle: {metal: 1}, item_fine_sieve: {wood: 0.7, hair: 0.3}, item_flat_file: {metal: 1}, item_frame_saw: {wood: 0.6, metal: 0.4},
  item_fuller: {metal: 0.75, wood: 0.25}, item_goat_hair_brush: {reed: 0.55, hair: 0.45}, item_grooving_wheel: {metal: 1}, item_hand_auger: {metal: 0.75, wood: 0.25},
  item_hand_bellows: {wood: 0.6, leather: 0.4}, item_herb_hoe: {metal: 0.6, wood: 0.4}, item_hide_scraper: {metal: 0.7, wood: 0.3}, item_hollow_gouge: {metal: 0.6, wood: 0.4},
  item_honing_stone: {stone: 1}, item_ingot_mold: {cast: 1}, item_ink_brush: {reed: 0.7, hair: 0.3}, item_iron_punch: {metal: 1}, item_jeweler_pliers: {metal: 1},
  item_jeweler_saw: {wood: 0.6, metal: 0.4}, item_kitchen_knife: {metal: 0.7, wood: 0.3}, item_leather_shears: {metal: 1}, item_leather_strop: {wood: 0.7, leather: 0.3},
  item_line_level: {wood: 1}, item_loom: {wood: 1}, item_loom_reed: {reed: 0.6, wood: 0.4}, item_loop_turner: {metal: 1}, item_marking_gauge: {wood: 0.9, metal: 0.1},
  item_mason_chisel: {metal: 1}, item_mining_pick: {metal: 0.65, wood: 0.35}, item_mortise_chisel: {metal: 1}, item_netting_needle: {wood: 1}, item_plumb_bob: {metal: 1},
  item_pottery_wheel: {wood: 0.95, metal: 0.05}, item_quill_knife: {metal: 0.5, wood: 0.5}, item_reed_pen: {reed: 1}, item_rivet_set: {metal: 1},
  item_riveting_hammer: {metal: 0.75, wood: 0.25}, item_rope_fid: {bone: 1}, item_round_file: {metal: 1}, item_sewing_needle: {metal: 1}, item_sheet_shears: {metal: 1},
  item_sighting_rule: {wood: 0.8, metal: 0.2}, item_singlebit_axe: {metal: 0.7, wood: 0.3}, item_smith_hammer: {metal: 0.85, wood: 0.15}, item_smith_tongs: {metal: 1},
  item_spindle: {wood: 1}, item_spokeshave: {wood: 0.6, metal: 0.4}, item_steel_dividers: {metal: 1}, item_stitching_awl: {metal: 1}, item_stone_mortar: {stone: 1},
  item_stone_point: {metal: 1}, item_swage_block: {metal: 1}, item_try_square: {wood: 0.75, metal: 0.25}, item_veining_chisel: {metal: 1},
  item_whittling_knife: {metal: 0.75, wood: 0.25}, item_wood_mallet: {wood: 1}, item_wood_rasp: {metal: 0.85, wood: 0.15},
};
// 自举：一个工位自己的工具，按列表次序只用排在它前面的那些（第一把锻锤在石砧上锻成），工具链因此有起点。
const BOOTSTRAP_ORDER = ['item_smith_hammer', 'item_smith_tongs', 'item_mason_chisel', 'item_whittling_knife', 'item_frame_saw', 'item_spindle', 'item_hide_scraper', 'item_cooking_pot', 'item_fine_sieve', 'item_stone_mortar'];

// ---------- 据点自然资源 ----------
// 储量与再生由"资源类 × 据点栖地"派生，参数在 world/design/kc-site-ecology.json；栖地由地形（或 biomes.json 群落标签）派生。
const SITE_ECOLOGY = JSON.parse(fs.readFileSync(P('world/design/kc-site-ecology.json'), 'utf8'));

const ceil = (x, step = 1) => Math.ceil(x / step - 1e-9) * step;
const kg = (items, id) => {const w = items.get(id)?.weight; if (!(w > 0)) throw Error(`缺重量 ${id}`); return w;};

function recipeBase(id, name, {skill, workstation, tools, minutes, process, kind}) {
  const r = {id, name, aliases: [], scope: null, skill, minimumProficiency: 0, minutes: Math.max(5, ceil(minutes, 5)), difficulty: 10};
  if (workstation) r.workstation = workstation;
  Object.assign(r, {process, materials: [], tools: [...tools], output: null, byproducts: [], learningRequired: false, learnFee: 0, learnMinutes: 30, teachers: [],
    toolWear: 1, failure: {recoverFraction: 0, injury: 0}, prerequisites: [], processing: kind});
  return r;
}

export function generate(root = ROOT) {
  const R = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
  const itemsArr = R('world/meta/items.json').filter(i => !NEW_ITEMS.some(n => n.id === i.id));
  const items = new Map([...itemsArr, ...NEW_ITEMS].map(i => [i.id, i]));
  const authored = R('world/meta/recipes.json').filter(r => !r.id.startsWith('recipe_kc_'));
  const out = [];
  const covered = (input, product) => authored.some(r => r.output.item === product && r.materials.some(m => m.item === input));
  // 加工类
  for (const p of PROCESSES) for (const [input, product] of p.members) {
    if (!p.binder && covered(input, product)) continue; // 已有作者写的同类配方（例如筛磨燕麦粉、选矿冶炼），不重复
    const inKg = kg(items, input), outKg = kg(items, product);
    // 一批取几份原料：至少够出 1 份产物；调墨这类加水成液的按份配（成品重量里有水，不按重量算产率）
    let units = p.batch ?? p.perOutput ?? 1;
    if (!p.batch) while (Math.floor(units * inKg * p.yield / outKg + 1e-9) < 1) units++;
    const qty = p.batch ? 1 : Math.min(200, Math.floor(units * inKg * p.yield / outKg + 1e-9));
    const binders = p.binder ?? [null];
    for (const binder of binders) {
      if (binder && authored.some(r => r.output.item === product && r.materials.some(m => m.item === binder) && r.materials.some(m => m.item === input))) continue;
      const suffix = binder ? `_${binder.replace(/^item_/, '')}` : '';
      const r = recipeBase(`recipe_kc_${p.id}_${input.replace(/^item_/, '')}_${product.replace(/^item_/, '')}${suffix}`, `${p.name}：${items.get(input).name}成${items.get(product).name}`,
        {skill: p.skill, workstation: p.workstation, tools: p.tools, minutes: p.fixedMinutes ?? units * inKg * p.minutesPerKg, process: p.process, kind: p.id});
      r.materials.push({item: input, amount: units});
      if (binder) r.materials.push({item: binder, amount: 1}, {item: 'item_water', amount: 1});
      for (const [item, perKg] of Object.entries(p.reagents ?? {})) r.materials.push({item, amount: Math.max(1, ceil(perKg * units * inKg))});
      r.output = {item: product, quantity: qty};
      if (p.shavings) {const waste = units * inKg - qty * outKg, n = Math.floor(waste * 0.5 / kg(items, 'item_wood_shavings') + 1e-9); if (n > 0) r.byproducts.push({item: 'item_wood_shavings', amount: Math.min(200, n)});}
      out.push(r);
    }
  }
  // 工具类
  const authoredTools = new Set(authored.map(r => r.output.item));
  for (const [tool, parts] of Object.entries(TOOL_PARTS).sort()) {
    if (authoredTools.has(tool) || !items.has(tool)) continue;
    const w = kg(items, tool), main = Object.entries(parts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    const shop = SHOP[main] ?? SHOP.wood;
    const rank = BOOTSTRAP_ORDER.indexOf(tool);
    const tools = shop.tools.filter(t => t !== tool && !(rank >= 0 && BOOTSTRAP_ORDER.indexOf(t) > rank));
    const r = recipeBase(`recipe_kc_tool_${tool.replace(/^item_/, '')}`, `${shop.verb}制${items.get(tool).name}`,
      {skill: shop.skill, workstation: shop.workstation, tools, minutes: 15 + w * shop.minutesPerKg, process: shop.process, kind: `tool_${main}`});
    for (const [m, share] of Object.entries(parts).sort()) {
      const partKg = w * share, def = MATERIAL[m];
      // 每个部件取能覆盖该重量、按基准价最省的那种料（锻工位自己的锤钳只能用整块铁料：还没有锤钳剁不出边料）
      const options = (def.stock && shop.tools.includes(tool)) ? [def.stock] : [def.item, def.stock, def.handle && partKg <= kg(items, def.handle) && !SHOP_TOOLS.has(tool) ? def.handle : null].filter(Boolean);
      const cost = id => ceil(partKg / kg(items, id)) * items.get(id).basePrice;
      const stock = options.sort((a, b) => cost(a) - cost(b) || a.localeCompare(b))[0];
      r.materials.push({item: stock, amount: Math.max(1, ceil(partKg / kg(items, stock)))});
      // 炉火燃料：每满两公斤金属另加一袋木炭（轻件在已生着的炉火里顺带锻成，不单独计炭）
      const fuel = Math.floor(partKg / 2 + 1e-9);
      if (def.fuel && fuel) r.materials.push({item: def.fuel, amount: fuel});
    }
    r.output = {item: tool, quantity: 1};
    out.push(r);
  }
  // 抄书类：照原本（工具，不消耗）抄写。用纸按书的品级定张数（初级一张对折成册，品级每高一级多一张），
  // 墨按每四张一份：现成墨液，或烟炱粉当场研水（几滴水不计）。两种墨都生成；材料价超过成书基准价的那种，
  // 按世界校验"配方售价不低于材料"的同一条规律不登记（抄低价书不会用贵墨）。
  // 抄书靠识字：识字的人照着原本就能抄，不必另拜师（识字向教识字的人学）。
  for (const b of [...items.values()].filter(i => i.book).sort((a, c) => a.id.localeCompare(c.id))) {
    const pages = GRADE_PAGES[b.book.grade] ?? 1;
    for (const ink of ['item_lampblack', 'item_soot_ink']) {
      const materials = [{item: 'item_parchment', amount: pages}, {item: ink, amount: Math.max(1, ceil(pages / 4))}];
      if (materials.reduce((n, m) => n + items.get(m.item).basePrice * m.amount, 0) > b.basePrice) continue;
      const r = recipeBase(`recipe_kc_copy_${b.id.replace(/^item_/, '')}_${ink.replace(/^item_/, '')}`, `照原本抄写${b.name}（${items.get(ink).name}）`,
        {skill: 'skill_literacy', workstation: null, tools: [b.id, 'item_reed_pen'], minutes: pages * 90,
          process: '把原本摊在案上，羊皮纸裁齐压平，逐页对照誊写，写完一页对读一遍；抄错的页刮不净就作废另抄，墨与纸按实耗。', kind: 'copy'});
      r.materials.push(...materials);
      r.output = {item: b.id, quantity: 1};
      out.push(r);
    }
  }
  return {items: [...NEW_ITEMS], recipes: out, authored, priceFloor: priceFloor([...authored, ...out], items)};
}
const GRADE_PAGES = {'初级': 1, '中级': 2, '高级': 3, '特级': 4, '终极': 5};

// 价格底线：作者没写配方、只由本类配方造出的东西，基准价不低于它最省那条配方的材料价（世界校验"配方售价不低于材料"的同一条规律）。
// 本类配方带 processing（加工类）；抄书（copy）的产物是书，书价由作者定。返回 {物品: 底线价}，只列高于现价的。
export function priceFloor(recipes, items) {
  const authoredOut = new Set(recipes.filter(r => !r.processing).flatMap(r => [r.output.item, ...(r.byproducts ?? []).map(b => b.item)]));
  const floor = {};
  for (const r of recipes) {
    if (!r.processing || authoredOut.has(r.output.item) || r.processing === 'copy') continue;
    const cost = r.materials.reduce((n, m) => n + items.get(m.item).basePrice * m.amount, 0), need = Math.ceil(cost / r.output.quantity);
    floor[r.output.item] = Math.min(floor[r.output.item] ?? Infinity, need);
  }
  return Object.fromEntries(Object.entries(floor).filter(([id, p]) => p > items.get(id).basePrice));
}
// 初加工是常识手艺：初加工类成员（原料 → 产物）的作者配方，没有任何师傅的，不要求拜师（原先学不到也做不了）。
const MEMBER_PAIRS = PROCESSES.flatMap(p => p.members);
export const teacherlessPrimary = r => !r.processing && !r.teachers?.length && MEMBER_PAIRS.some(([i, o]) => r.output?.item === o && r.materials?.some(m => m.item === i));

// 本链对运行时世界的规律（tools/load-world.mjs 加载期调用；就地改加载出的行，盘上的已审行不动）。
// 重复施加结果不变：再生规划幂等，拜师与价格底线只取一次。ecology 缺省（这一版世界没有据点资源表）时不派生据点。
export function applyChainLaws({locations, recipes, items}, {ecology, biomes = {}} = {}) {
  if (ecology) {
    const plan = regrowPlan(locations, recipes, null, biomes, ecology);
    locations.forEach((l, i) => {if (l.site) l.site = plan.locations[i].site;});
  }
  for (const r of recipes) if (teacherlessPrimary(r)) r.learningRequired = false;
  const byId = new Map(items.map(i => [i.id, i]));
  for (const [id, price] of Object.entries(priceFloor(recipes, byId))) byId.get(id).basePrice = price;
}

export function habitatsOf(location, biomes = {}, ECOLOGY = SITE_ECOLOGY) {
  if (ECOLOGY.siteHabitats?.[location.id]) return ECOLOGY.habitatOrder.filter(h => ECOLOGY.siteHabitats[location.id].includes(h));
  const tags = biomes[location.id]?.biome ?? [];
  const fromBiome = tags.flatMap(t => ECOLOGY.biomeHabitats[t] ?? []);
  const hs = new Set(fromBiome.length ? fromBiome : ECOLOGY.terrainHabitats[location.terrain] ?? []);
  return ECOLOGY.habitatOrder.filter(h => hs.has(h));
}
// 某资源在某据点的参数：资源本身就是产地（'*'）优先，否则按栖地次序取第一个长这类东西的栖地；都不长就是遗留物，返回 null。
export function ecologyFor(item, habitats, ECOLOGY = SITE_ECOLOGY) {
  const row = ECOLOGY.resources[item];
  if (!row) return undefined;
  const hit = row['*'] ?? habitats.map(h => row[h]).find(Boolean);
  return hit ? {reserve: hit[0], quantity: hit[1], everyDays: hit[2]} : null;
}
export function regrowPlan(locations, recipesAll, items, biomes = {}, ECOLOGY = SITE_ECOLOGY) {
  const made = new Set(recipesAll.flatMap(r => [r.output.item, ...(r.byproducts ?? []).map(b => b.item)]));
  const removed = [], added = [], resized = [];
  const next = structuredClone(locations);
  for (const l of next) {
    if (!l.site) continue;
    const hadResources = l.site.resources !== undefined;
    l.site.resources ??= [];
    const habitats = habitatsOf(l, biomes, ECOLOGY);
    const had = l.site.changes !== undefined;
    let changes = [...(l.site.changes ?? [])];
    const res = new Map(l.site.resources.map(r => [r.id, r]));
    // 制成品不再生
    changes = changes.filter(c => {
      if (c.kind !== 'regrow') return true;
      const item = res.get(c.resource)?.item;
      if (made.has(item)) {removed.push({location: l.id, change: c.id, item, why: 'manufactured'}); return false;}
      return true;
    });
    // 本栖地的自然资源：每个据点按它的栖地补上该栖地原生的东西（已有同物品的不重复补）
    const short = l.id.replace(/^(site_w5_|site_|loc_wild_|loc_)/, '');
    for (const h of habitats) for (const n of ECOLOGY.native?.[h] ?? []) {
      if (l.site.resources.some(r => r.item === n.item) || !ecologyFor(n.item, habitats, ECOLOGY)) continue;
      const row = {id: `${short}_native_${n.item.replace(/^item_/, '')}`, name: n.name, item: n.item, quantity: 1, minutes: n.minutes};
      l.site.resources.push(row); res.set(row.id, row); added.push({location: l.id, resource: row.id, item: n.item, native: h});
    }
    // 资源表里的自然物：按栖地定储量与再生；栖地不长的是遗留物，不再生
    for (const r of l.site.resources) {
      const eco = ecologyFor(r.item, habitats, ECOLOGY);
      if (eco === undefined) continue;
      const at = changes.findIndex(c => c.kind === 'regrow' && c.resource === r.id);
      // 持续采集资源：储量与季节密度另有产量表，只补缺的再生登记，上限取原储量
      if (r.gather) {
        if (eco && at < 0) {const c = {id: `${r.id}_regrow`, kind: 'regrow', resource: r.id, quantity: Math.min(eco.quantity, r.quantity), everyDays: eco.everyDays, max: r.quantity}; changes.push(c); added.push({location: l.id, change: c.id, item: r.item});}
        continue;
      }
      if (eco === null) {if (at >= 0) {removed.push({location: l.id, change: changes[at].id, item: r.item, why: 'not-native', habitats}); changes.splice(at, 1);} continue;}
      const before = {quantity: r.quantity, regrow: at >= 0 ? `${changes[at].quantity}/${changes[at].everyDays}d` : null};
      r.quantity = eco.reserve;
      const c = {id: at >= 0 ? changes[at].id : `${r.id}_regrow`, kind: 'regrow', resource: r.id, quantity: eco.quantity, everyDays: eco.everyDays, max: eco.reserve};
      if (at >= 0) changes[at] = {...changes[at], ...c}; else {changes.push(c); added.push({location: l.id, change: c.id, item: r.item});}
      resized.push({location: l.id, resource: r.id, item: r.item, habitats, before, after: {quantity: eco.reserve, regrow: `${eco.quantity}/${eco.everyDays}d`}});
    }
    if (had || changes.length) l.site.changes = changes;
    if (!hadResources && !l.site.resources.length) delete l.site.resources;
  }
  return {locations: next, removed, added, resized};
}

// 原文切出每个顶层条目与它前面的分隔原文（保留作者条目的原格式，含一行多条的写法）
const BACKSLASH = String.fromCharCode(92);
function splitEntries(src) {
  const pieces = []; let i = src.indexOf('[') + 1;
  const n = JSON.parse(src).length;
  for (let k = 0; k < n; k++) {
    const from = i;
    while (/[\s,]/.test(src[i])) i++;
    let d = 0, j = i, inStr = false;
    for (; j < src.length; j++) {const ch = src[j]; if (inStr) {if (ch === BACKSLASH) j++; else if (ch === '"') inStr = false;} else if (ch === '"') inStr = true; else if (ch === '{') d++; else if (ch === '}' && --d === 0) break;}
    pieces.push({sep: src.slice(from, i), text: src.slice(i, j + 1)}); i = j + 1;
  }
  return {head: src.slice(0, src.indexOf('[') + 1), pieces, tail: src.slice(i)};
}
// 作者条目原文不动（被修正的那条就地换成单行），生成条目一行一条追加在末尾；旧的生成条目先去掉，结果可重复
function writeTable(rel, isGenerated, fix, generated) {
  const file = P(rel), raw = fs.readFileSync(file, 'utf8'), eol = raw.includes('\r\n') ? '\r\n' : '\n', src = raw.replace(/\r\n/g, '\n');
  const {head, pieces, tail} = splitEntries(src);
  let body = '', first = true;
  for (const {sep, text} of pieces) {
    const row = JSON.parse(text);
    if (isGenerated(row)) continue;
    const next = fix(row), out = JSON.stringify(next) === JSON.stringify(row) ? text : JSON.stringify(next);
    body += (first ? sep.replace(/^\s*,/, '') : sep) + out; first = false;
  }
  for (const r of generated) body += `,\n  ${JSON.stringify(r)}`;
  fs.writeFileSync(file, (head + body + tail).replace(/\n/g, eol));
}

if (isMain) {
  const g = generate();
  const all = [...g.authored, ...g.recipes];
  // 下面几项是运行时规律（applyChainLaws）在当前数据上的作用，只打印供核对，不写回作者行
  const plan = regrowPlan(readJSON('world/geo/locations.json'), all, null, readJSON('world/geo/biomes.json').locations ?? {});
  console.log(JSON.stringify({recipes: g.recipes.length, byKind: g.recipes.reduce((m, r) => (m[r.processing] = (m[r.processing] ?? 0) + 1, m), {}), primaryAuthored: g.authored.filter(teacherlessPrimary).map(r => r.id), priceFloor: g.priceFloor, regrowRemoved: plan.removed, regrowAdded: plan.added, resized: plan.resized}, null, 1));
  if (WRITE) {
    writeTable('world/meta/recipes.json', r => r.id.startsWith('recipe_kc_'), r => r, g.recipes);
    writeTable('world/meta/items.json', r => NEW_ITEMS.some(n => n.id === r.id), r => r, g.items);
    console.log('written');
  }
}
