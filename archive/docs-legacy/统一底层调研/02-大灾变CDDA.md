# 02 · 大灾变（Cataclysm: Dark Days Ahead）如何用统一底层搭建所有系统

调研日期：2026-11-13。资料来源：GitHub 仓库 CleverRaven/Cataclysm-DDA 的 master 分支（`data/json` 真实数据文件、`doc/JSON` 格式文档、`src` 源码），全部只读网页；本地只跑了一个草算脚本核对数字。每条结论后附原文链接；凡是没取到原文的地方，在文中直接标"未取到"。

## 目录

1. 摘要
2. 数据组织总览（文件在哪里、怎样加载）
3. 统一维度一：材料（material）
4. 统一维度二：物品通用字段与"子类型槽位"（ITEM / subtypes）
5. 统一维度三：伤害类型（damage_type）与防护
6. 统一维度四：工具品质（tool_quality）——配方不点名工具
7. 统一维度五：需求（requirement）——可复用、可嵌套的"配方零件"
8. 统一维度六：维生素/计数器（vitamin）——营养、毒、药、过敏、血量共用一条数轴
9. 统一维度七：收获（harvest）与屠宰需求——怪物到物品
10. 统一维度八：附魔值（enchantment values）——人物属性修改的通用口
11. 统一维度九：效果（effect_type）与条件效果（effect_on_condition）
12. 行为怎样由维度算出（伤害与防护、腐坏与温度、营养、制作匹配、修理与拆解、燃烧）
13. 系统之间怎样互相引用（引用图）
14. 继承机制：copy-from / abstract / extend / delete / relative / proportional
15. "新增物品只填 JSON"是怎样做到的
16. 局限：仍写死在 C++ 里的东西
17. 全部系统清单（含我们没有的）
18. 对 infinite-world 的启示（只借鉴架构）
19. 草算核对记录
20. 参考链接清单

---

## 1. 摘要

- CDDA 把游戏内容几乎全部放进 `data/json`（112 个条目：35 个目录、77 个文件），C++ 只负责"读字段、按字段算"。每种内容是一个带 `type` 的 JSON 对象，由对应的 C++ 加载器读入，类型之间用字符串 id 互相引用（[data/json 目录](https://github.com/CleverRaven/Cataclysm-DDA/tree/master/data/json)，[JSON_INFO.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/JSON_INFO.md)）。
- 几条"统一维度"贯穿所有系统：
  - **材料**（`material`）：密度、各伤害类型抗性、比热/潜热/冰点、燃烧数据、维生素含量、修理用料、拆解产物、透气性、挡风。物品、怪物、地形、车辆零件都引用材料（[materials.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/materials.json)）。
  - **伤害类型**（`damage_type`）：bash/cut/stab/bullet/acid/electric/heat/cold/biological/pure 十种，材料抗性、怪物护甲、身体部位护甲、车辆零件减伤全部按它分键（[damage_types.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/damage_types.json)）。
  - **工具品质**（`tool_quality`）：配方写"需要 HAMMER 3 级"，不写"需要 hammer 这件物品"；任何物品声明了该品质就能用（[tool_qualities.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/tool_qualities.json)）。
  - **需求**（`requirement`）：把"工具组 + 品质组 + 材料组"打包成可复用、可嵌套（`LIST`）、可按倍数引用（`using`）的零件；配方、拆解、屠宰、车辆安装、伤口处理、建造全部复用它（[requirements 目录](https://github.com/CleverRaven/Cataclysm-DDA/tree/master/data/json/requirements)）。
  - **维生素/计数器**（`vitamin`）：营养素、毒素、药物浓度、过敏原标记、失血量、红细胞全部是同一种对象，用 `min/max/rate/disease/disease_excess/decays_into` 几个字段驱动疾病与药效（[vitamin.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/vitamin.json)）。
  - **附魔值**（enchantment `values`）：STRENGTH、SPEED、CARRY_WEIGHT、ARMOR_ALL、METABOLISM 等上百个数值口，突变、生化插件、效果、遗物都通过它改人物属性（[MAGIC.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/MAGIC.md)）。
  - **条件效果**（`effect_on_condition`）：从对话系统长出来的通用脚本层，物品、突变、怪物死亡、任务、配方都能挂它（[EFFECT_ON_CONDITION.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/EFFECT_ON_CONDITION.md)）。
- 行为由维度算出：防护 = 按部位的材料层（材料抗性 × 厚度 × 覆盖率），营养 = 配方成分递归求和，腐坏 = 比热/潜热/冰点驱动的温度模型 + `spoils_in`，制作匹配 = 品质等级比较 + 需求树展开。
- 局限：`iuse.cpp` 等使用函数仍是 C++（可见部分就声明了 61 个 `itype_id` 常量）；少数物品 id、家具 id、效果 id 写死在 `item.cpp`、`requirements.cpp`（拆解时把 welder 换成 SAW_M_FINE 品质）等处；怪物效果旗标需要改 C++；继承没有"默认实现"，每种类型支持程度不同。

## 2. 数据组织总览

### 2.1 文件布局

`data/json` 顶层（[目录列表](https://github.com/CleverRaven/Cataclysm-DDA/tree/master/data/json)）：
- 目录：artifact、ascii_art、bodypart_graphs、construction、debug、effects_on_condition、encounters、faults、fields、flags、furniture_and_terrain、itemgroups、items、mapgen、mapgen_palettes、monster_special_attacks、monster_weakpoints、monsterdrops、monstergroups、monsters、mutations、npcs、obsoletion_and_migration_0.I/0.J、overmap、proficiencies、recipes、region_settings、requirements、snippets、ui、uncraft、vehicleparts、vehicles、wounds。
- 文件（节选）：materials.json、damage_types.json、tool_qualities.json、vitamin.json、harvest.json、harvest_dissect.json、harvest_drop_type.json、butchery_requirements.json、body_parts.json、limb_scores.json、character_modifiers.json、effects.json、disease.json、addictions.json、bionics.json、skills.json、techniques.json、martialarts.json、traps.json、field_type.json、weather_type.json、scent_types.json、morale_types.json、zones.json、loot_zones.json、professions.json、scenarios.json、achievements.json、scores.json、conducts.json、item_actions.json、item_category.json、flags.json、jmath.json、speech.json、dreams.json、anatomy.json 等。

`data/json/items` 下 20 个子目录（ammo、appliances、armor、book、classes、comestibles、containers、corpses、furniture、generic、gun、gunmod、magazine、melee、netherum、ranged、relics、resources、tool、vehicle）和 26 个文件（[items 目录](https://github.com/CleverRaven/Cataclysm-DDA/tree/master/data/json/items)）。armor 下 48 个文件按部位/用途分（boots、gloves、hats、helmets、legs_clothes、torso_armor…），comestibles 下 37 个文件按食材分（carnivore、raw_veggy、dairy、med、mutagen…），tool 下 38 个文件按工种分（cooking、metalworking、tailoring、woodworking、workshop…）。

### 2.2 加载顺序

`data/json/LOADING_ORDER.md`：对 `data/json` 做广度优先遍历，浅层先于深层；同一深度按字典序。作者提醒：顺序错了会崩（[LOADING_ORDER.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/LOADING_ORDER.md)）。文档目录 `doc/JSON` 共 44 个文件，每类对象一篇（ITEM.md、MONSTERS.md、MUTATIONS.md、VEHICLES_JSON.md、WEATHER_TYPE.md、NPCs.md、FACTIONS.md、MAGIC.md…）（[doc/JSON 目录](https://github.com/CleverRaven/Cataclysm-DDA/tree/master/doc/JSON)）。

### 2.3 源码对应

`src` 中与本题相关的文件及大小（字节，来自 GitHub API 列表）：material.cpp 11,628；requirements.cpp（未在同一片列表里取到大小）；recipe.cpp；item.cpp 193,151；item_armor.cpp 49,740；item_factory.cpp 223,944；item_degrade.cpp 49,913；item_gun_tool_ammo.cpp 159,963；item_pocket.cpp 101,143；item_contents.cpp 103,956；item_group.cpp 44,923；harvest.cpp 10,220；iuse.cpp 365,904；iuse_actor.cpp 237,798；monster.cpp 161,791；monstergenerator.cpp 67,145；mutation.cpp 106,067；mutation_data.cpp 43,581（[src 列表 G–L 段](https://api.github.com/repos/CleverRaven/Cataclysm-DDA/contents/src)）。

值得注意的比例：`iuse.cpp + iuse_actor.cpp ≈ 600 KB`，是"物品使用行为"这块仍留在 C++ 里的直接证据（见第 16 节）。

## 3. 统一维度一：材料（material）

### 3.1 字段

`material.cpp::material_type::load`（约 84–134 行）读取的字段（[material.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/material.cpp)）：
- 必填：`name`、`chip_resist`（≥0）、`density`、`bash_dmg_verb`、`cut_dmg_verb`、`dmg_adj`（至少 4 个形容词，用于"轻微损坏/严重损坏"的描述）。
- 可选带默认：`breathability`（默认 IMPERMEABLE）、`repaired_with`（默认空物品）、`rotting`/`soft`/`uncomfortable`（默认 false）、`vitamins`（带权重的 id 列表）。
- 可选无默认：`conductive`、`sheet_thickness`、`repair_difficulty`、`wind_resist`、`specific_heat_liquid`、`specific_heat_solid`、`latent_heat`、`freezing_point`、`salvaged_into`、`fuel_data`、`burn_products`。
- `resist`：一个按伤害类型分键的对象；解析时记录"JSON 明确写了哪些键"（`_res_was_loaded`），`check()` 对每个标了 `material_required` 的伤害类型检查材料是否声明了抗性，否则报 debugmsg。
- `burn_data`：读取前先按"热抗性 ≤ 0 则可燃"生成一条默认燃烧数据，JSON 显式给出则覆盖。

文档解释（[JSON_INFO.md · Materials](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/JSON_INFO.md)）：`density` 影响车辆碰撞（更密者占优）；`wind_resist` 0–100，无材料指定时默认 99；`vitamins` 是每日摄入量百分比，"通常被物品自身的值覆盖"；比热默认取水的值（液态 4.186、固态 2.108 J/(g·K)），潜热默认 334 J/g，冰点默认 0 °C；`repair_difficulty` 多材料取最难者；`sheet_thickness` 是该材料做衣物时的厚度单位，可用 `ignore_sheet_thickness` 绕开；`burn_products` 按被烧物品重量和数量缩放产出。

### 3.2 实例

来自 [materials.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/materials.json)：
- `steel`：density 8；比热 液 0.82 / 固 0.45；潜热 273；conductive；chip_resist 20；resist bash 6 / cut 6 / acid 7 / heat 3 / bullet 3；repaired_with steel_chunk；repair_difficulty 4；burn_products scrap 0.5。
- `cotton`：density 0.5；soft；chip_resist 6；breathability AVERAGE；wind_resist 70；resist bash 1 / cut 1 / acid 3 / heat 0 / bullet 1；repaired_with 与 salvaged_into 都是 cotton_patchwork；repair_difficulty 1；burn_data 三档（fuel 0.05–0.2，burn 0.015–0.06）。
- `flesh`：density 1.1；rotting；conductive；soft；chip_resist 2；各抗性 1；vitamins calcium 0.1、iron 1.3。
- 食材类材料（dried_vegetable、cured_meat、processed_food、cheese、ice_cream）都标 rotting + conductive，带 vitamins；ice_cream 的 burn_data fuel 是负值（-100/-50/-10），即"灭火而不是助燃"。
- 燃料类（wood 1000 kJ、charcoal 6240 kJ、coal 31200 kJ、propane 25000 kJ 带 explosion_data、turpentine 34800 kJ）走 `fuel_data`。
- 用 `copy-from` 的材料：charcoal/coal 复制 wood，wool_quilted 复制 wool，wool_quilted_2 再复制 wool_quilted，sand 复制 soil，propane 复制 hydrocarbons，mi-go_flesh 复制 flesh，mi-go_blood 复制 water。

### 3.3 材料被谁引用

- 物品：`material` 数组（每项 `type` + `portion`，portion 默认 1），`item_factory.cpp::itype::load` 用带权 reader 读入，记录"第一个材料为默认材料"并把所有 portion 求和（`mat_portion_total`）（[item_factory.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/item_factory.cpp)，[ITEM.md · Generic Items](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ITEM.md)）。
- 护甲的每个部位层：`armor[].material[]` 每项 `type`、`covered_by_mat`（默认 100，范围 1–100）、`thickness`（默认 0）、`ignore_sheet_thickness`（[item_factory.cpp part_material::deserialize](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/item_factory.cpp)）。
- 怪物：`material` 必须是 materials.json 里的 id，允许空数组（[MONSTERS.md · material](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/MONSTERS.md)）。尸体的材料取自怪物（`item::made_of()` 对尸体返回怪物材料表；`get_base_material()` 对带怪物的尸体取怪物第一材料）（[item.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/item.cpp)）。
- 突变：`can_only_eat` 列的是"可吃的食物材料"（[MUTATIONS.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/MUTATIONS.md)）；`compute_default_effective_vitamins` 里突变对维生素的缩放只作用于"物品所含材料"匹配的条目，`material_all` 匹配全部（[consumption.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/consumption.cpp)）。
- 修理/拆解/燃烧：`repaired_with`、`salvaged_into`、`burn_data`、`burn_products`、`fuel_data` 全部由材料决定（第 12 节）。

## 4. 统一维度二：物品通用字段与子类型槽位

### 4.1 一个 `ITEM` 对象 + 若干 `subtypes` 槽

现行格式：`"type": "ITEM"`，`"subtypes": ["ARMOR"]` / `["TOOL"]` / `["COMESTIBLE"]` 等；`itype::load_slots` 读 `subtypes` 数组，对每个识别的名字（ARMOR、TOOL、GUN、AMMO、COMESTIBLE、BOOK 等）调用 `load_slot`，从同一个 JSON 对象里反序列化对应槽（[item_factory.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/item_factory.cpp)）。也就是说"衣服 + 工具"（tool_armor.json）这类复合物品只是多声明一个槽。

### 4.2 通用字段（所有物品）

[ITEM.md · Generic Items](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ITEM.md)：
- 身份：type、id、name（str/str_pl/ctxt）、conditional_names、description、snippet_category。
- 显示：symbol、color、looks_like、ascii_picture、variants、variant_type。
- 物理：weight、volume、integral_volume/weight、longest_side、phase、rigid、stackable、display_type。
- 材料：material（type + portion）、repairs_with、degradation_multiplier。
- 经济：price、price_postapoc。
- 战斗：melee_damage（按伤害类型分键）、to_hit（数字或对象：grip/length/surface/balance）、thrown_damage、weapon_category。
- 容器与杂项：pocket_data、flags、light、insulation、explosion、milling、magazines、magazine_well。
- 工具相关（文档放在 Tools 节）：qualities（`[["SCREW", 1]]` 或对象形式带 `speed`）、charged_qualities（仅在电量 ≥ charges_per_use 时生效）、techniques。

### 4.3 护甲槽

[ITEM.md · Armor](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ITEM.md)：物品级 covers、warmth、environmental_protection、encumbrance、max_encumbrance、sided、material_thickness、max_worn、valid_mods、power_armor；`armor[]` 每段 encumbrance、breathability、layers、rigid_layer_only、coverage、cover_melee、cover_ranged、cover_vitals、covers、specifically_covers、material。breathability 枚举从 IMPERMEABLE（0%）到 SECOND_SKIN（140%）。文档明说材料覆盖率与厚度"共同决定材料对抗性的贡献"，但未给公式。

实例 `jeans`（[legs_clothes.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/items/armor/legs_clothes.json)）：subtypes ARMOR；weight 600 g；volume 2 L；price 50 USD / 1.5 USD（灾后）；material denim；faults fabric_denim；4 个 CONTAINER 口袋（1250 ml ×2、1080 ml ×2，各限重 4 kg）；warmth 10；material_thickness 0.65；flags VARSIZE、POCKETS；armor 一段：encumbrance [7, 11]、coverage 100、covers leg_l/leg_r，**没有逐层 material**——这正是"回退路径"：`finalize_post_armor` 发现某段没有材料时，用物品级材料列表自动生成，每种材料的厚度按其 portion 份额乘该段平均厚度，并标 ignore_sheet_thickness；再按覆盖率加权重算 avg_thickness，推导 max_encumber、各部位最好/最坏防护几率、透气性（取该段最差材料）（[item_factory.cpp finalize_post_armor](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/item_factory.cpp)）。

`pants_faux_fur` 用 `copy-from: pants_fur`，只改 name、description、material（faux_fur + cotton）、warmth 70，其余（重量、口袋、厚度 1、环境防护 3、armor 段）全部继承。

### 4.4 食物槽

[ITEM.md · Comestibles](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ITEM.md)：spoils_in、calories、vitamins、quench、healthy、fun、monotony_penalty、stim、sleepiness_mod、addiction_potential/type、consumption_effect_on_conditions、comestible_type（FOOD/DRINK/MED）、freezing_point、eats_like、cooks_like、charges、stack_size、tool、seasonings、parasites、contamination、rot_spawn、smoking_result、petfood。`islot_comestible::deserialize` 读 `vitamins` 为 [id, 整数或质量字串] 对（[item_factory.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/item_factory.cpp)）。

实例（[carnivore.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/items/comestibles/carnivore.json)）：
- `meat`：copy-from flesh（抽象食材基类，给 symbol、color、parasites 32、seasonings）；weight 275 g；volume 250 ml；spoils_in 1 day；calories 402；fun -10；vitamins calcium 2、iron 12、meat_allergen 1；flags RAW、PREDATOR_FUN；cooks_like meat_cooked；smoking_result meat_smoked。
- `meat_cooked`：同样 copy-from flesh；weight 296 g；calories 402；parasites 0；vitamins 同上；flags EATEN_HOT、NUTRIENT_OVERRIDE（后者让它不从配方成分继承营养，见 12.3）。

注意 `meat_allergen` 本身是一个 vitamin（第 8 节）——过敏原不是单独系统。

### 4.5 工具槽与使用动作

[ITEM.md · Tools](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ITEM.md)：tool_ammo、charge_factor、charges_per_use、initial_charges、max_charges、power_draw、consumption_per_use、fuel_efficiency、transform_into（取代 revert_to）、revert_msg、use_action、sub、etransfer_rate、e_port、variables。

实例（[workshop.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/items/tool/workshop.json)）：
- `hammer`：material steel + wood；weight 566 g；to_hit {grip solid, length hand, surface any, balance neutral}；qualities HAMMER 3、PRY 1、HAMMER_FINE 1、PRYING_NAIL 1；melee_damage bash 9；flags BELT_CLIP、NONCONDUCTIVE、ALLOWS_BODY_BLOCK；weapon_category BATONS；use_action CROWBAR。
- `screwdriver`：material steel + plastic；qualities SCREW 1；melee_damage bash 1 / stab 6；weapon_category SHIVS；flags 含 NO_SALVAGE。
- `belt_grinder`（[metalworking.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/items/tool/metalworking.json)）：55 kg；charged_qualities GRIND 2（speed 0.3）、FILE 3（speed 0.2）；charges_per_use 25；tool_ammo battery；use_action link_up（cable_length 10，charge_rate 1600 W）；faults electronic_general。

`use_action` 两种写法：字串 = `iuse.cpp` 里的内建函数名（CROWBAR、WATER_PURIFIER…）；对象 = 带参数的 actor（transform、explosion、consume_drug、place_monster、heal、repair_item、firestarter、salvage、inscribe、link_up、deploy_furn、cast_spell、effect_on_conditions、message、sound…）（[ITEM.md · Use Actions](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ITEM.md)）。`Item_factory::init()` 用 `add_iuse` 注册函数名、`add_actor` 注册 actor 类（[item_factory.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/item_factory.cpp)）。

## 5. 统一维度三：伤害类型与防护

[damage_types.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/damage_types.json) 共 10 条：

| id | physical | melee_only | edged | environmental | material_required | mon_difficulty | no_resist | derived_from | immune_flags |
|---|---|---|---|---|---|---|---|---|---|
| bash | ✓ | ✓ | | | ✓ | ✓ | | | 角色 BASH_IMMUNE |
| cut | ✓ | ✓ | ✓ | | ✓ | ✓ | | | CUT_IMMUNE |
| stab | ✓ | ✓ | ✓ | | | ✓ | | ["cut", 0.8] | STAB_IMMUNE |
| bullet | ✓ | | | | ✓ | ✓ | | | BULLET_IMMUNE；怪物 BULLETPROOF |
| acid | | | | ✓ | ✓ | | | | ACID_IMMUNE；ACIDPROOF |
| electric | | | | | | | | | ELECTRIC_IMMUNE；ELECTRIC、ELECTRIC_FIELD |
| heat | | | | ✓ | ✓ | | | | HEAT_IMMUNE；FIREPROOF |
| cold | | | | | | | | | COLD_IMMUNE；COLDPROOF |
| biological | | | | | | | ✓ | | BIO_IMMUNE；BIOLOGICALPROOF |
| pure | | | | | | | ✓ | | — |

另有 `skill`（bash→bashing、cut→cutting、stab→stabbing）、`bash_conversion_factor`（对地形/家具/场的转换率）、`magic_color`、`onhit_eocs`/`ondamage_eocs`（命中/受伤时触发条件效果）（[JSON_INFO.md · Damage Types](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/JSON_INFO.md)）。`material_required` 决定材料必须声明该抗性（否则 `material_type::check()` 报错），这是"新增伤害类型 → 所有材料被迫补字段"的硬约束。`derived_from` 仅 stab 使用，注释说只用于怪物定义（怪物没写 stab 护甲时按 cut 的 0.8 推）。

一份伤害（`damage_unit`，[damage.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/damage.cpp)）= type、amount、armor_penetration（res_pen）、armor_multiplier（res_mult）、damage_multiplier、constant_armor_multiplier、constant_damage_multiplier、barrels（枪管长度加成）。`resistances::get_effective_resist` = `max(抗性 − 穿透, 0) × res_mult × unconditional_res_mult`——先减穿透再乘倍率。`item::mitigate_damage` 把护甲抗性构造成 `resistances` 后扣减伤害，穿透也被物品的同类抗性削减并钳在 0（[item_armor.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/item_armor.cpp)）。

使用方：
- 怪物 `armor`：`{ "bash": 7, "cut": 7 }` 任何 damage_type id 都能当键（[MONSTERS.md · armor](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/MONSTERS.md)）；mon_cow 是 `bash 2, electric 1`（[mammal.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/monsters/mammal.json)）。
- 身体部位 `armor` 与车辆零件 `damage_reduction`：用 `Part Resistance` 格式，可写 all / physical / non_physical / biological 以及具体类型，"具体类型覆盖笼统键"（[JSON_INFO.md · Part Resistance](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/JSON_INFO.md)）。
- 突变 `armor`：按部位、按伤害类型给值（[MUTATIONS.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/MUTATIONS.md)）。
- 弱点组 `weakpoint_sets`：coverage、crit_mult、armor_mult、difficulty、effects，怪物可引用多组，后者覆盖同 id（[JSON_INFO.md · Weakpoint Sets](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/JSON_INFO.md)）。

**未取到**：`item::resist()` 的函数体。它不在 damage.cpp、item_armor.cpp，也不在我读到的 item.cpp 两段里；grep.app 搜索被限流（HTTP 429）。能确认的只有：`damage.cpp` 的 `resistances(const item&, bool to_self, int roll, bodypart_id)` 对每种伤害类型调用 `item::resist()` 并传入 roll 与部位；`item_armor.cpp::armor_made_of(bp)` 取覆盖该部位那一段的 `part_material` 列表（可剥离插板时附加首块非空插板的材料）；`chip_resistance` 的加权方式是"每材料 chip_resist × cover ÷ 100"，无逐层材料时回退到"物品材料 × 份额 ÷ mat_portion_total"。按同一套数据结构推断，防护也是"材料抗性 × 该层厚度，按 covered_by_mat 与 roll 决定命中哪层"，但这是推断，不是读到的代码。

## 6. 统一维度四：工具品质

[tool_qualities.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/tool_qualities.json) 定义约 90 个品质 id：CUT、GRASS_CUT、CUT_FINE、GLARE、SHEAR、CHURN、LEATHER_AWL、SEW_CURVED、ANESTHESIA、FISHING_ROD、FISH_TRAP、TREE_TAP、SMOOTH、WELD、HACK、HAMMER、HAMMER_FINE、HAMMER_SOFT、SAW_W、SAW_M、SAW_M_FINE、COOK、HOTPLATE、BOIL、CONTAIN、CHEM、SIEVE、WINNOW、STRAIN、SMOKE_PIPE、DISTILL、AXE、DIG、WRENCH、WRENCH_FINE、SCREW、SCREW_FINE、BUTCHER、DRILL、DRILL_ROCK、PRY、PRYING_NAIL、PUNCH、WRITE、LIFT、JACK、SELF_JACK、HOSE、CHISEL、CHISEL_WOOD、SEW、KNIT、PULL、ANVIL、ANALYSIS、CONCENTRATE、SEPARATE、FINE_DISTILL、CHROMATOGRAPHY、LUTHIER、SNOW_MAKING、GRIND、FINE_GRIND、REAM、FILE、VISE、PRESSURIZATION、LOCKPICK、EXTRACT、FILTER、SUSPENDING、ROPE、SURFACE、WHEEL_FAST、JUMPSTART、FABRIC_CUT、OVEN、GUN、RIFLE、SHOTGUN、SMG、PISTOL、CUT_GLASS、MOP、BLOW_HOT_AIR、THREAD_CUT、THREAD_TAP、STRIKING_SURFACE、TEMPER。

每条：`id`、`name`、可选 `usages`——`[[等级, [动作/配方 id…]]]`，例：`AXE: [[1, ["CHOP_TREE", "CHOP_LOGS"]], [2, ["LUMBER"]]]`、`DIG: [[1, ["MAKEMOUND","DIG","FILL_PIT","DIG_CHANNEL"]], [2, ["CLEAR_RUBBLE"]]]`、`LOCKPICK: [[1, ["PICK_LOCK"]]]`、`CUT: [[1, ["salvage","inscribe"]]]`。`usages` 让"物品菜单里有什么动作"也由品质决定，而不是由物品 id 决定。

匹配逻辑（[requirements.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/requirements.cpp)）：
- `quality_requirement::load`：id、level（默认 1）、amount（默认 1，须为正）。
- `quality_requirement::has()`：问制作背包 `has_provider_quality(type, level, count, actor)`，再 OR 上角色自身的 `has_intrinsic_quality`（身体部位可以提供品质——body_parts.json 有 `tool qualities` 字段，[JSON_INFO.md · Body Parts](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/JSON_INFO.md)）。两者取 OR 而不是相加，注释说是避免同一伪物品被算两次。
- `quality_for_crafter()`：基础 `qualities` 表 + 有电时的 `charged_qualities` 表；`provider_quality_level()` 取物品及其非 CONTAINER 口袋内容的最高值——装好的弹匣算，塞在包里的螺丝刀不算。
- `item::get_quality()`（[item.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/item.cpp)）：先看自身，再看内容物取最高；BOIL 品质只在容器为空时算；`get_quality_speed()` 返回该品质的速度倍率（配方步骤可被加速）。

## 7. 统一维度五：需求（requirement）

### 7.1 格式

[ITEM_CRAFT_AND_DISASSEMBLY.md · Defining common requirements](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ITEM_CRAFT_AND_DISASSEMBLY.md)：`"type": "requirement"` 对象打包 `components`、`tools`、`qualities`；配方在 `components` 里用 `[id, n, "LIST"]` 引用，或在 `using` 里按倍数引用。`tools`/`components` 都是"组的列表"：组内任选其一（OR），组间全部满足（AND）；工具数量 -1 表示不耗电/不消耗。

实例（[toolsets.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/requirements/toolsets.json)）：
- `welding_standard`：qualities GLARE 1；tools 一组五选一（welder、welding kit、crude welder、integrated welder、oxy torch，各带电量）；components 一组（焊条/焊丝/黄铜钎条）。
- `sewing_standard`：qualities SEW 1、CUT 2、FABRIC_CUT 1；components 一个 LIST（线材组）。
- `spring_standard`：qualities DRILL 2、FILE 1；tools 四组，其中 `pliers_standard` 与 `cutting_wire_standard` 是嵌套 LIST；components qt_wire。
- `blacksmithing_standard`：qualities ANVIL 3、HAMMER 3；tools forge/oxy_torch（20 电量）+ `metal_file_any` + `metalworking_tongs_any`（嵌套）；components 助熔剂 LIST。

材料类（[requirements/materials.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/requirements/materials.json)）：`steel_standard = [steel_lump_any ×1 LIST | steel_chunk_any ×4 LIST]`；`fabric_standard_nostretch` 一组九选一（8 块棉布片 | 1 张棉布 | 8 块尼龙片 | …）；`cordage = [string_36 | cordage_36 | cordage_36_leather | cordage_short ×6 LIST]`；`adhesive = [duct_tape ×25 | glue_strong ×10 | glue_weak ×150]`；`adhesive_cordage = [adhesive LIST | cordage LIST]`——"或"的两边都是需求而不是物品。

烹饪类（[cooking_components.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/requirements/cooking_components.json)）：`meat_red = [meat_red_raw LIST | rehydrated_meat | meat_canned]`；`meat_red_raw = [meat | mutant_meat | human_flesh | … | meat_scrap ×10 | porkbelly]`；`any_butter_or_oil = [cooking_oil | edible_tallow LIST | raw_butter | butter | ghee]`；`sweet_fruit → sweet_fruit_fresh`（约 35 种水果，kiwi ×2、wintergreen_berry ×4——数量表达等价质量）。

### 7.2 加载与展开

[requirements.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/requirements.cpp)：
- `load_obj_list()`（约 330 行）同时处理"候选列表"和"单一必选"两种写法；`tool_comp::load` 第三元素为 LIST 时设 `requirement` 标记；`item_comp::load` 接受 NO_RECOVER、LIST，其他旗标报错。
- `load_requirement()`（约 470 行）处理 `extend` 块，components/qualities/tools 从对象读或从被扩展者继承；抽象定义若声明这些字段会报 debugmsg。
- `requirement_data::finalize()`（约 770 行）对 tools 与 components 做 `inline_requirements<>()`：递归展开嵌套引用并检查环；重复物品取最小数量；工具再经 `subtype_replacement` 展开。
- `consolidate()`（约 1480 行）合并品质项时取 count、level 的最大值。
- `disassembly_requirements()`（约 1300 行）把制作需求变成拆解需求：welder/welder_crude/oxy_torch/forge/char_forge → 换成 SAW_M_FINE 1 级品质；crucible → 整组删掉；press → PULL 1 并标记删 fire；SEW → 同级 CUT；GLARE、KNIT 删除；NO_RECOVER 或带 UNRECOVERABLE 旗标的成分删除。**这里是写死的物品 id**（见第 16 节）。

### 7.3 配方怎样装配需求

[recipe.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/recipe.cpp)：`recipe::load` 不直接读 tools/qualities/components，而是交给 `requirement_data::load_requirement` 生成一个内联需求 `inline_<type>_<id>` 放进 `reqs_internal`；`using` 读成 `(requirement_id, 倍数)` 对放进 `reqs_external`。`recipe::finalize` 用 `std::accumulate` 先加外部需求再加内联需求，合成 `requirements_`，再去重为 `deduped_requirements_`。步骤式配方（`steps`）每步自带 time/activity_level/tools/qualities/proficiencies/using，根级只留 components。

实例（[recipes/armor/legs.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/recipes/armor/legs.json)）：`jeans` 配方：skill_used tailor、difficulty 2、time 6 h、`using: tailoring_denim_patchwork ×8, fastener_small ×1`、proficiencies prof_closures、book_learn 四本书、byproducts denim_patch ×6 + scrap_denim ×15——整条配方没有一个具体工具 id。`xl_legguard_chitin` 用 `copy-from: legguard_chitin` 只改 time 与 using 的倍数（armor_chitin 35→45）。

[recipes/food/carnivore.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/recipes/food/carnivore.json)：`meat_cooked`：qualities COOK 1；tools `surface_heat ×20 LIST`（注释：300 g 肉需 20 单位表面热）；components meat ×1；batch_time_factors [67, 5]；proficiency prof_food_prep。`meat_fried`：components `meat_red ×1 LIST` + `fry_oil ×1 LIST`——"任何红肉 + 任何油"。

### 7.4 需求系统的其他消费者

- 屠宰：[butchery_requirements.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/butchery_requirements.json) 把 FIELD_DRESS/QUARTER/SKIN/DISMEMBER/DISSECT/FULL/QUICK/BLEED 按尸体体型（数组位置 0–2 小、3–4 大）与两套版本（"1.0"/"1.2"）映射到 requirement id（field_dress、dissect_small、butchery_large、full_butchery_large_no_surface…）；requirement 本身在 [requirements/butchery.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/requirements/butchery.json)。
- 车辆零件安装/拆卸/修理：技能、工具、时间都写成需求（[JSON_INFO.md · Vehicle Parts](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/JSON_INFO.md)）。
- 伤口处理：`wound_fix` 列 requirements + skills + proficiencies（[WOUNDS.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/WOUNDS.md)）。
- 物品故障修复：`fault fix` 设 requirements、skills、time（[JSON_INFO.md · Item faults](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/JSON_INFO.md)）。
- 建造：construction 目录；基地营地升级是"蓝图配方"（`blueprint_requires/provides`）（[BASECAMP.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/BASECAMP.md)）。
- 拆解：`uncraft` 类型与 `reversible: true`（后者自动反转配方，仅玩家自制品返还原件，拾得品返回第一候选）（[ITEM_CRAFT_AND_DISASSEMBLY.md · Item disassembly](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ITEM_CRAFT_AND_DISASSEMBLY.md)）。

## 8. 统一维度六：维生素/计数器

### 8.1 字段

[VITAMIN.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/VITAMIN.md)：id、type、`vit_type`（vitamin / toxin / counter / drug）、name、deficiency / excess（效果 id）、min / max、`weight_per_unit`（食物按重量换算单位）、`rate`（自然掉 1 单位的时长）、flags（NO_DISPLAY、OBSOLETE）、`disease` / `disease_excess`（区间对，每档对应效果的一个强度级）、`decays_into`（自然衰减时按倍数改另一维生素，负数即扣减）。`drug` 类生效延迟 30 分钟（一个胃周期）模拟消化；`vitamin` 类在简化营养选项下不计。

### 8.2 实例（[vitamin.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/vitamin.json)）

| id | vit_type | rate | min | max | 阈值 |
|---|---|---|---|---|---|
| calcium | vitamin | 15 m | -48000 | 0 | 无 |
| iron | vitamin | 15 m | -24000 | 3600 | anemia 三档：-9600…-24000 |
| vitC | vitamin | 15 m | -5600 | 0 | scurvy 三档：-2800…-5600 |
| vit_ibuprofen | drug | 100 s | 0 | 432 | nsaid_eff 10–216 |
| vit_mme（吗啡当量） | drug | 6 s | 0 | 40000 | opiate_eff 六档 |
| mutant_toxin | toxin | 15 m | 0 | 1800 | toxin_buildup 三档 |
| mutagen、各 primer（batrachian、beast、…） | counter | 1 h | 0 | 2500 | 三档 100–2500 |
| blood | counter | -6 s（负=回升） | -50000 | 0 | hypovolemia 四档 |
| redcells | counter | -12 s | -50000 | 0 | redcells_anemia 三档 |
| meat、veggy、wheat、egg、fruit、junk、nut、bread、milk（过敏原） | counter | 1 h | 0 | 1 | 无 |
| bad_food | counter | 4 h | 0 | 40 | bad_food_ennui 三档 |
| ethanol → BAC | drug | 1 s / 24 s | 0 | 1000 / 10000 | ethanol 衰变成 BAC；BAC 五档 drunk |
| dermatik_larva_size | counter | 48 h | 0 | 1440 | dermatik_visible 三档 |

草算：rate 15 m 下，iron 缺乏病起点 -9600 单位 ≈ 100 天不摄入铁；vitC 坏血病起点 -2800 ≈ 29 天；钙见底 -48000 ≈ 500 天（第 19 节）。这些数字说明设计上"维生素缺乏是数周到数月尺度的慢变量"。

### 8.3 由此长出的系统

- 疾病：缺乏/过量阈值直接映射到效果强度（anemia、scurvy、hypovolemia、drunk、opiate_eff）。
- 药物：药效 = 一个 drug 类维生素的浓度区间；注射吗啡"三倍于口服"只是改物品里的 vitamin 数量（[VITAMIN.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/VITAMIN.md)）。
- 过敏/食性：`can_eat` 对 CARNIVORE 检查植物过敏原维生素、对 HERBIVORE/RUMINANT 检查 meat/egg 过敏原维生素；`allergy_type` 把特质 + 过敏原维生素映射到士气类型（[consumption.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/consumption.cpp)）。
- 突变：`vitamin_cost`、`vitamin_rates`、`vitamins_absorb_multi`（[MUTATIONS.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/MUTATIONS.md)）；突变进程本身由 mutagen/primer 计数器驱动。
- 配方消耗：`character_resources.vitamins` 让制作按单位消耗维生素（[ITEM_CRAFT_AND_DISASSEMBLY.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ITEM_CRAFT_AND_DISASSEMBLY.md)）。
- 阵营口粮：`fac_food_supply` 存 calories 与 vitamins（[FACTIONS.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/FACTIONS.md)）。
- 效果：`effect_type.vitamins` 按强度设维生素增减率与吸收倍率（[EFFECTS_JSON.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/EFFECTS_JSON.md)）。

## 9. 统一维度七：收获与屠宰

[harvest.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/harvest.json)：`type: harvest`，`entries[]` 每项 `drop`（物品 id）、`type`（flesh/bone/skin/offal/blood…对应 harvest_drop_type）、`mass_ratio`（占尸体质量比）或 `base_num`/`scale_num`/`max`（按体型缩放的件数）、`flags`（如 FILTHY）、`faults`；`message`；`leftovers` 默认 ruined_chunks。支持 copy-from / extend / delete。

- `mammal_small_fur`：meat 0.28、lung 0.0035、raw_fur 0.02、fat 0.07（质量比合计 0.3735，其余成 leftovers）。
- `zombie_humanoid`：copy-from zombie_decay_bone_human_skull（骨+头骨），extend 加 meat_tainted_human 0.25、blood 0.1、fat 0.08、innards 0.15、marrow 0.005。
- `walnut_harv`：base_num [5,12] + scale_num [0,0.5]。

[harvest_drop_type.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/harvest_drop_type.json)：9 条，flesh/bone/skin/blood/offal 普通；mutagen、bionic 标 `dissect_only` 并设 `harvest_skills`（chemistry+firstaid / electronics+firstaid）与各种失败消息；`*_group` 变体标 `group: true`（drop 指向物品组而非单件）。

怪物引用：`harvest`、`dissect`、`decay` 三个字段（[MONSTERS.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/MONSTERS.md)）。mon_cow：harvest cow_with_skull、dissect dissect_cattle_sample_small、death_drops 内联物品组 `[["cow", 25]]`、starting_ammo milk_raw 40（可挤奶）、biosignature feces_cow（[mammal.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/monsters/mammal.json)）。

## 10. 统一维度八：附魔值

[MAGIC.md · Enchantments](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/MAGIC.md)：一条附魔 = id、`has`（WIELD/WORN/HELD）、`condition`（ALWAYS/ACTIVE/INACTIVE 或对话条件）、`values[]`（`value` + `add`/`multiply`）、`skills`、`hit_you_effect`、`hit_me_effect`、`intermittent_activation`、`emitter`、`modified_bodyparts`、`mutations`、`ench_effects`。载体："物品、突变、生化插件、效果"；物品走 `relic_data.passive_effects`。

可改的角色数值（节选，共 130 余项）：STRENGTH、DEXTERITY、INTELLIGENCE、PERCEPTION、SPEED、MAX_HP、REGEN_HP、MAX_STAMINA、REGEN_STAMINA、MAX_MANA、CARRY_WEIGHT、ARMOR_ALL、MELEE_DAMAGE、MELEE_TO_HIT、RANGED_DAMAGE、RANGED_ARMOR_PENETRATION、DODGE_CHANCE、BONUS_DODGE、BONUS_BLOCK、METABOLISM、HUNGER、THIRST、SLEEPINESS、KCAL、VITAMIN_ABSORB_MOD、STOMACH_SIZE_MULTIPLIER、PAIN、PAIN_REMOVE、BLEEDING_RATE、HEALTHY_RATE、NIGHT_VIS、HEARING_MULT、SCENT_MASK、STEALTH_MODIFIER、FOOTSTEP_NOISE、MOVE_COST、MOVECOST_SWIM_MOD、CRAFTING_SPEED_MULTIPLIER、READING_SPEED_MULTIPLIER、LEARNING_FOCUS、SKILL_RUST_RESIST、SOCIAL_LIE/PERSUADE/INTIMIDATE、UGLINESS、MUT_INSTABILITY_MOD、WEAKPOINT_ACCURACY、KNOCKBACK_RESIST、FALL_DAMAGE、CLIMATE_CONTROL_HEAT/CHILL、BODYTEMP_SLEEP、OVERMAP_SIGHT、WEIGHT、TOTAL_WEIGHT。怪物：REGEN_HP、VISION_RANGE、SPEED、RANGE_DODGE、LUMINATION、TOTAL_WEIGHT。车辆：TOTAL_WEIGHT、FUEL_USAGE、TURNING_DIFFICULTY。

实例：突变 `STRONGBACK` 的全部效果就是 `enchantments: [{ values: [{ value: CARRY_WEIGHT, multiply: 0.35 }] }]`，另带 cancels BADBACK、points 2、vitamin_cost 160（[mutations.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/mutations/mutations.json)）。突变字段全表：points、visibility、ugliness、category、types（同类互斥）、prereqs/prereqs2、cancels、changes_to、leads_to、threshold/threshreq、vitamin_cost/vitamin_rates/vitamins_absorb_multi、enchantments、armor、integrated_armor、allowed_items、can_only_eat、flags、scent_intensity、social_modifiers、active/starts_active、purifiable（[MUTATIONS.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/MUTATIONS.md)）。

## 11. 统一维度九：效果与条件效果

- `effect_type`（[EFFECTS_JSON.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/EFFECTS_JSON.md)）：intensity、max_intensity、max_duration；`base_mods`（强度 1 的修正）+ `scaling_mods`（每升一级叠加）作用于 str/dex/per/int/speed/pain/hunger/thirst 等；removes_effects、blocks_effects、resist_traits、resist_effects、immune_flags、limb_score_mods、enchantments、vitamins。
- `effect_on_condition`（[EFFECT_ON_CONDITION.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/EFFECT_ON_CONDITION.md)）：condition + effect 列表；触发方式 ACTIVATION / RECURRING（recurrence 定时）/ EVENT（游戏事件）；`global` 决定玩家与 NPC 共用一个队列还是各自一份；条件可查特质、属性、物品、效果、天气、变量；效果支持 if/then。文档明说它从对话系统长出来，现在物品、突变、生化插件、配方、法术、陷阱、怪物死亡处理都接受 EOC 钩子。
- 挂点举例：damage_type 的 onhit_eocs/ondamage_eocs；comestible 的 consumption_effect_on_conditions；recipe 的 result_eocs；monster death_function 的 eoc；addiction 每回合跑一个 EOC（[JSON_INFO.md · Addiction types](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/JSON_INFO.md)）；use_action `effect_on_conditions`。

## 12. 行为怎样由维度算出

### 12.1 伤害与防护

攻击方：物品 `melee_damage` 按伤害类型分键；怪物 `melee_damage` 是 damage_instance 数组（damage_type、amount、armor_penetration、armor_multiplier、damage_multiplier）（[MONSTERS.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/MONSTERS.md)）。防守方：护甲每段的材料层 → `item::resist()` → `resistances` → `get_effective_resist = max(抗性−穿透,0)×倍率` → `mitigate_damage` 扣减（[damage.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/damage.cpp)、[item_armor.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/item_armor.cpp)）。怪物护甲是静态表；身体部位护甲可来自突变 `armor`、生化插件 `protection`、身体部位自身 `armor`。穿透不是"无视护甲"，而是先从护甲里减掉。

附带：`item_armor.cpp` 的 `get_encumber` 九步（基础 encumber → 按装载比例加到 max_encumber → 非空口袋额外负担 → 插板 → FIT+VARSIZE 减半或 -10 → 尺码不合 ×2/×3 → 衣物改造 → 故障修正），`get_warmth(bp)` 按覆盖率缩放再加插板。

### 12.2 腐坏与温度

- 温度模型（[item.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/item.cpp)）：`has_temperature()` 对无 NO_TEMP 的食物和尸体为真；`processing_speed()` 对尸体和食物每 10 分钟处理一次；`calc_temp()` 用牛顿冷却，导热项依赖体积与 `insulation`，并按比热（固/液）、潜热、冰点在固态/融化/液态之间切换；`set_temp_flags()` 设 HOT/COLD/FROZEN，冻结且可带寄生虫的食物加 NO_PARASITES；比热/潜热/冰点对食物取 comestible 字段，其他物品取第一材料。
- 腐坏接口：`goes_bad()`、`get_shelf_life()`（来自 spoils_in）、`get_relative_rot()/set_relative_rot()`（换类型时保留）、`combine()` 合并时取较高相对腐坏度，`price_no_contents()` 对腐烂物返回 0、对食物按 `1 − 相对腐坏度` 线性折价；配方构造的食物调用 `inherit_rot_from_components`（继承成分的腐坏度）。**未取到** `process_temperature_rot`/`calc_rot` 的函数体（不在读到的 item.cpp 两段及 item_wakeup.cpp 中），温度分段的腐坏速率表无法引用原文。
- 材料 `rotting` 旗标：flesh、cheese、cured_meat 等为真，怪物 `decay` 字段决定尸体腐烂后留下什么（[MONSTERS.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/MONSTERS.md)）；comestible `rot_spawn` 指定腐烂后生成的怪物（[ITEM.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ITEM.md)）。

### 12.3 营养

[consumption.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/consumption.cpp)：
- 单件：`compute_default_effective_kcal` 从物品 kcal 起算，生食未煮打折，CARNIVORE 对 CARNIVORE_OK 物品的植物维生素打折，腐坏超过"刚变质"后线性减 kcal（SAPROPHAGE 除外），再过附魔，钳 0。`compute_default_effective_vitamins` 只把 VITAMIN 类从 RDA 单位换算（`RDA_to_default`），突变按材料缩放，附魔 VITAMIN_ABSORB_MOD，钳 0。
- 自制食物：`compute_effective_nutrients` 若物品有成分且无 NUTRIENT_OVERRIDE 且成分是食物，则递归求每个成分的营养（按 charges 乘；byproduct 成分做减法），总和 ÷ recipe_charges。这就是"炒肉的营养 = 任意红肉 + 任意油"的实现：配方不定义营养，营养由实际投入的成分算出。
- 范围：`compute_nutrient_range` 遍历配方每个槽的候选成分取 min/max，缓存；物品级重载把所有能产出它的配方折进来，`is_item_on_loop` 防环。
- `NUTRIENT_OVERRIDE`（meat_cooked 带）短路为固定值；`eats_like` 只影响 `fun_for` 的单调惩罚分组。

### 12.4 制作匹配

`can_make_with_inventory()`（[requirements.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/requirements.cpp) 约 900 行）依次检查 qualities、tools、components、materials；`tool_comp::has()` 无电量时 `has_tools(type, count)`，有电量时 `charges_of(count × batch × charge_factor)`，`start_only` 时只要求一小部分；`item_comp::has()` 按 charges 或 components 计数；`check_enough_materials` 还检查成分自身的品质。时间侧：`batch_time_factors` 大批量减时（logistic/linear）、`proficiencies` 缺失加时增失败、品质 `speed` 加速步骤、`character_requirements` 要求 str/dex/int/per 下限（[ITEM_CRAFT_AND_DISASSEMBLY.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ITEM_CRAFT_AND_DISASSEMBLY.md)）。

### 12.5 修理、拆解、拆布、燃烧

- 修理：材料 `repaired_with` + `repair_difficulty`（多材料取最难）；物品 `repairs_with`/`repairs_like` 可覆盖（[ITEM.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ITEM.md)）。
- 拆布（salvage）：依赖材料的 `salvaged_into` 与 NO_SALVAGE 旗标，需 CUT 品质工具，不走拆解菜单（[ITEM_CRAFT_AND_DISASSEMBLY.md · Salvaging](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ITEM_CRAFT_AND_DISASSEMBLY.md)）。
- 燃烧：材料 `burn_data[强度]`（immune/fuel/smoke/burn/volume_per_turn），多材料逐材料计算；燃尽产物 `burn_products` 按重量缩放；燃料能量 `fuel_data.energy`（[JSON_INFO.md · Burn data / Fuel data](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/JSON_INFO.md)）。
- 导电：`item::conductive()` 先看 CONDUCTIVE/NONCONDUCTIVE 旗标，再看任一材料是否 conductive（[item.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/item.cpp)）。
- 碎裂：`chip_resistance` 按材料 chip_resist 加权（12.1）。

## 13. 系统之间怎样互相引用

```
material ──resist[damage_type]──┐
   │ vitamins[vitamin]           │
   │ repaired_with[item]         ▼
   │ salvaged_into[item]     damage_type ◄── monster.armor / bodypart.armor / vehicle_part.damage_reduction
   │ burn_products[item]         ▲            / mutation.armor / item.melee_damage / monster.melee_damage
   ▼                             │
 item.material ─────────────────┘
 item.qualities[tool_quality] ◄── recipe/requirement.qualities ◄── tool_quality.usages[action]
 item.vitamins[vitamin] ──► vitamin.disease[effect] ──► effect_type.base_mods / enchantments
 recipe.result[item]  recipe.using[requirement]  requirement.components[item | requirement(LIST)]
 recipe.byproduct_group[item_group]  recipe.book_learn[item]  recipe.proficiencies[proficiency]
 monster.material[material]  monster.harvest[harvest]  harvest.entries.drop[item]  harvest.type[harvest_drop_type]
 monster.death_drops[item_group]  monster.upgrades.into[monster]  monster.zombify_into[monster]
 monster.weakpoint_sets[weakpoint_set]  monster.special_attacks[...]  monster.flags[monster_flag]
 mutation.enchantments[values]  mutation.can_only_eat[material]  mutation.integrated_armor[item]
 faction.fac_food_supply{calories, vitamins}  faction.currency[item]  faction.price_rules[item|category|group]
 weather_type.passive_effects[field_effect]  furniture.plant_data/harvest[item]  construction.using[requirement]
 vehicle_part.item[item]  vehicle_part.requirements  butchery_requirement[requirement]  wound_fix.requirements
 *.eoc / *_eocs[effect_on_condition]
```

要点：所有引用都是字串 id；连接的"胶水"是四个共享字典——伤害类型、材料、工具品质、维生素——加两个通用修改口（附魔值、效果），再加一个通用脚本层（EOC）。

## 14. 继承机制

[JSON_INHERITANCE.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/JSON_INHERITANCE.md)：
- `copy-from`：以已有条目为基，未写字段沿用，写了的覆盖，可链式。
- `abstract`：只能被继承、不能进游戏，加载后丢弃（例：magazine_belt 给各弹链共用）。
- `extend` / `delete`：对容器型字段增删（flags、qualities、harvest entries…）；删不存在的不报错。
- `relative`：数值加减偏移（556 比 223 伤害 -3、穿透 +10）；MONSTER 与 ITEM 的可用字段不同（如 melee_dice）。
- `proportional`：数值乘系数（reloaded_556 伤害 0.9）。
- 支持类型（非完整）：effect_on_condition、furniture、harvest、ITEM、item_group、material、MONSTER、MONSTER_FACTION、monstergroup、mutation、overmap_terrain、recipe、scenario、SPELL、terrain、uncraft、vehicle_part；overmap_special、city_building 部分支持。文档警告"没有默认的 JSON 继承，只有各类型各自的支持程度"——这是每个 C++ 加载器自己实现的。
- 护甲另有 `Armor inheritance` 小节（[ITEM.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ITEM.md)），配方的 `character_requirements` 子条目会整体替换父对象（[ITEM_CRAFT_AND_DISASSEMBLY.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ITEM_CRAFT_AND_DISASSEMBLY.md)）。
- 物品组给模组的扩展方式：`copy-from` 同 id + `extend` 块（[ITEM_SPAWN.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ITEM_SPAWN.md)）。

## 15. "新增物品只填 JSON"是怎样做到的

把第 3–11 节合起来看，一件新物品需要的全部行为都能从已有字典里"借"：
1. 选材料 → 自动获得防护、重量感、燃烧、修理、拆布、导电、保暖/透气、（食物的）维生素基线。
2. 填 `melee_damage`、`to_hit` → 进战斗；填 `qualities` → 立刻能被所有要求该品质的配方、建造、动作（usages）识别。
3. 填 `armor[]`（可只给 covers/coverage/encumbrance，材料层由 finalize 自动生成）→ 进防护与负担。
4. 填 `calories/vitamins/spoils_in` → 进营养、疾病、腐坏、温度模型；写配方时用 LIST 需求 → 成品营养自动由成分算出。
5. 用 `copy-from` 从相近物品派生，`relative/proportional` 调数。
6. 需要新动作时先找 actor（transform、heal、consume_drug、cast_spell、effect_on_conditions…）；EOC 覆盖大部分脚本需求。
7. 放进 `item_group`（collection/distribution、prob/count/charges/container-item/contents-item/ammo/magazine）→ 进生成、死亡掉落、地图、商店（[ITEM_SPAWN.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ITEM_SPAWN.md)）。

只有第 6 步在"现有 actor 都不够"时需要 C++。

## 16. 局限：仍写死在 C++ 里的东西

1. **使用函数**：`iuse.cpp`（366 KB）可见部分就声明了 61 个 `itype_id` 常量（itype_water、itype_syringe、itype_fire、itype_radio_on、itype_pur_tablets、itype_joint…）、约 88 个 `efftype_id`，以及 activity/addiction/bionic/skill/trait/terrain/monster/morale/quality/trap 等 id；函数如 `iuse::xanax`（上效果）、`iuse::honeycomb`（掉两块蜡）、`iuse::fungicide`、`iuse::fishing_rod`、`iuse::mace`（[iuse.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/iuse.cpp)）。`Item_factory::init()` 用 `add_iuse` 注册的名字也是硬编码表（ACIDBOMB_ACT、CROWBAR、DIG、GASMASK、HOTPLATE、PICKAXE、WATER_PURIFIER、WEATHER_TOOL、VOLTMETER…）（[item_factory.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/item_factory.cpp)）。
2. **拆解替换表**：`disassembly_requirements()` 写死 welder/welder_crude/oxy_torch/forge/char_forge/crucible/press/fire 这些物品 id 和 SEW→CUT、GLARE/KNIT 删除的品质映射（[requirements.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/requirements.cpp)）。
3. **item.cpp 的特例**：itype_blood（特殊命名）、itype_joint_lit（燃尽加 weed 烟）、itype_efile_recipes/photos、itype_disassembly、磨坊/熏架家具 id、tr_dormant_corpse、fd_weedsmoke、fd_fire、effect_weed_high（[item.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/item.cpp)）。item_factory.cpp 也有 material_bread/junk/hydrocarbons/oil、qual_GUN、skill_pistol 等常量。
4. **品质特例**：BOIL 只在容器为空时算（[item.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/item.cpp)）。
5. **旗标**：item/effect/vehicle part 旗标必须在 flags.json 里以 `json_flag` 声明，但大多数旗标的"效果"是 C++ 检查的；怪物效果旗标"由硬编码检查"，新加需改 C++；GUILT_HUMAN、RAD_DETECT、NANOFAB_TABLE 文档直接标"硬编码"（[JSON_FLAGS.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/JSON_FLAGS.md)）。
6. **食性/过敏**：CARNIVORE/HERBIVORE/RUMINANT/VEGAN/PROBOSCIS/PICKYEATER/SAPROPHAGE 的判断逻辑写在 `can_eat`/`compute_default_effective_kcal` 里，只有数据（哪种维生素算过敏原）在 JSON（[consumption.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/consumption.cpp)）。
7. **继承无默认实现**：每个类型的 copy-from/extend/relative 支持度由其 C++ 加载器决定（[JSON_INHERITANCE.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/JSON_INHERITANCE.md)）。
8. **屠宰类型表**：butchery_requirements 的数组位置含义（体型分档）没有在数据里命名，靠 C++ 约定（[butchery_requirements.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/butchery_requirements.json)）。
9. **防护公式本体**在 C++（第 5 节），JSON 只给输入。
10. **数据质量提示**（顺带发现）：vitamin.json 中 water_clean_scarlet_toxin 的区间 3–4 与 4–5 重叠；ibuprofen 阈值到 216 而 max 432；`damage_unit::operator==` 把 unconditional_damage_mult 和对方的 unconditional_res_mult 比较（疑似复制错误）；`material_type::dmg_adj` 的钳位允许下标等于长度。

## 17. 全部系统清单（含我们没有的）

每条：一句话是什么 → 依赖的统一维度 → 出处。

| # | 系统 | 一句话 | 依赖的统一维度 | 出处 |
|---|---|---|---|---|
| 1 | 材料 | 所有实体的物性字典 | 伤害类型、维生素、物品（修理/拆布/燃烧产物） | [materials.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/materials.json) |
| 2 | 物品与子类型槽 | ITEM + ARMOR/TOOL/COMESTIBLE/GUN/AMMO/BOOK… | 材料、品质、伤害类型、口袋、旗标 | [ITEM.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ITEM.md) |
| 3 | 容器与口袋 | pocket_data：容积/限重/长度/密封/防水/弹匣井 | 物品、相位、旗标 | [ITEM.md · Containers](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ITEM.md) |
| 4 | 近战与命中 | melee_damage、to_hit 对象、weapon_category、techniques | 伤害类型、武器类别 | [ITEM.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ITEM.md)、[weapon_categories.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/weapon_categories.json) |
| 5 | 枪械/弹药/弹匣/枪挂件 | gun/ammo/magazine/gunmod 槽，ammo_types、ammo_effects | 伤害类型、物品、旗标 | [items/gun](https://github.com/CleverRaven/Cataclysm-DDA/tree/master/data/json/items/gun)、[ammo_types.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/items/ammo_types.json)、[ammo_effects.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/ammo_effects.json) |
| 6 | 护甲/衣物（分部位分层） | armor[] 覆盖/负担/材料层/透气/保暖/环境防护 | 材料、伤害类型、身体部位、旗标 | [ITEM.md · Armor](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ITEM.md)、[item_armor.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/item_armor.cpp) |
| 7 | 温度与衣物保暖 | 物品温度（比热/潜热/冰点）、HOT/COLD/FROZEN、warmth、climate control | 材料、食物字段、附魔值 BODYTEMP/CLIMATE_CONTROL | [item.cpp calc_temp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/item.cpp)、[MAGIC.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/MAGIC.md) |
| 8 | 腐坏 | spoils_in、相对腐坏度、rot_spawn、尸体 decay | 材料 rotting、温度模型 | [ITEM.md · Comestibles](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ITEM.md)、[item.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/item.cpp) |
| 9 | 营养与维生素 | 热量、维生素、饱腹体积、成分递归 | 维生素、配方成分 | [consumption.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/consumption.cpp)、[VITAMIN.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/VITAMIN.md) |
| 10 | 疾病 | 维生素缺乏/过量阈值 → 效果强度；disease.json | 维生素、效果 | [vitamin.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/vitamin.json)、[disease.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/disease.json) |
| 11 | 药物与成瘾 | drug 类维生素浓度；addiction 类型每回合跑 EOC | 维生素、效果、EOC、士气类型 | [VITAMIN.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/VITAMIN.md)、[addictions.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/addictions.json) |
| 12 | 过敏与食性 | 过敏原维生素 + 特质 → 士气/禁食 | 维生素、突变旗标 | [consumption.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/consumption.cpp) |
| 13 | 寄生虫/污染 | parasites、contamination、冻结免寄生 | 食物字段、温度旗标 | [ITEM.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ITEM.md) |
| 14 | 效果（状态） | effect_type 强度/时长/属性修正 | 附魔值、维生素、肢体分数 | [EFFECTS_JSON.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/EFFECTS_JSON.md) |
| 15 | 突变 | 特质树（prereqs/changes_to/threshold/category）+ 附魔 | 附魔值、维生素、伤害类型、材料、物品 | [MUTATIONS.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/MUTATIONS.md) |
| 16 | 突变进程/诱变剂 | mutagen/primer 计数器驱动 | 维生素(counter) | [vitamin.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/vitamin.json) |
| 17 | 生化插件 | CBM：能耗、燃料、占位、加护甲、学习熟练度 | 材料(fuel)、身体部位、伤害类型、需求 | [JSON_INFO.md · Bionics](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/JSON_INFO.md) |
| 18 | 身体部位/肢体分数/角色修正 | body_parts、limb_scores（manip/lift/grip/block/balance）、character_modifiers | 伤害类型、品质、旗标 | [JSON_INFO.md · Body Parts / Limb scores](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/JSON_INFO.md) |
| 19 | 伤口 | wound/wound_fix 分级、出血、治疗需求 | 需求、肢体分数、效果 | [WOUNDS.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/WOUNDS.md) |
| 20 | 弱点 | weakpoint_sets：覆盖、暴击、护甲倍率 | 伤害类型、熟练度(families) | [JSON_INFO.md · Weakpoint Sets](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/JSON_INFO.md) |
| 21 | 技能 | skills.json | — | [skills.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/skills.json) |
| 22 | 熟练度 | 依赖图，缺失加时增失败 | 配方 | [PROFICIENCY.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/PROFICIENCY.md) |
| 23 | 制作 | recipe：技能/时间/批量/步骤/副产物/书本学习 | 需求、品质、物品、熟练度、物品组 | [ITEM_CRAFT_AND_DISASSEMBLY.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ITEM_CRAFT_AND_DISASSEMBLY.md) |
| 24 | 拆解/拆布/修理 | uncraft、reversible、salvage、repaired_with | 需求、材料 | 同上、[materials.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/materials.json) |
| 25 | 物品故障 | faults：严重度、伤害/护甲修正、fix 需求 | 需求、伤害类型 | [faults 目录](https://github.com/CleverRaven/Cataclysm-DDA/tree/master/data/json/faults) |
| 26 | 物品损耗/降级 | damage level、degradation_multiplier | 材料 chip_resist | [item_degrade.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/item_degrade.cpp) |
| 27 | 工具品质与动作 | usages 把品质映射到动作 | 品质 | [tool_qualities.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/tool_qualities.json) |
| 28 | 物品使用动作 | use_action 字串/actor | iuse（C++） | [ITEM.md · Use Actions](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ITEM.md) |
| 29 | 电力/电器 | tool_ammo battery、power_draw、link_up、appliances | 物品、材料(fuel_data) | [items/appliances](https://github.com/CleverRaven/Cataclysm-DDA/tree/master/data/json/items/appliances)、[recipe_appliance.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/recipes/recipe_appliance.json) |
| 30 | 车辆 | 零件耐久/减伤/安装需求、燃料、原型车 | 材料密度、伤害类型、需求、品质(LIFT/JACK)、物品组 | [VEHICLES_JSON.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/VEHICLES_JSON.md)、[vehicleparts](https://github.com/CleverRaven/Cataclysm-DDA/tree/master/data/json/vehicleparts) |
| 31 | 建造 | construction：前/后地形、需求、品质 | 需求、地形/家具 | [construction 目录](https://github.com/CleverRaven/Cataclysm-DDA/tree/master/data/json/construction) |
| 32 | 家具与地形 | 砸/拆/收获/种植/工作台/伪工具 | 物品、需求、旗标、伤害 | [JSON_INFO.md · Furniture / Terrain](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/JSON_INFO.md) |
| 33 | 农业 | furniture plant_data、季节、harvest | 物品、物品组 | 同上 |
| 34 | 采集（forage） | 区域设置里的森林物品组 | 物品组 | [REGION_SETTINGS.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/REGION_SETTINGS.md) |
| 35 | 钓鱼 | FISHING_ROD / FISH_TRAP 品质 + iuse::fishing_rod | 品质 | [tool_qualities.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/tool_qualities.json)、[iuse.cpp](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/iuse.cpp) |
| 36 | 狩猎与屠宰 | harvest/dissect、屠宰类型 × 体型 → 需求 | 收获、需求、物品 | [harvest.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/harvest.json)、[butchery_requirements.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/butchery_requirements.json) |
| 37 | 畜牧 | MILKABLE/starting_ammo、petfood、reproduction、biosignature | 物品、怪物 | [mammal.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/monsters/mammal.json) |
| 38 | 怪物 | 属性、材料、护甲、特殊攻击、旗标、物种 | 材料、伤害类型、收获、物品组 | [MONSTERS.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/MONSTERS.md) |
| 39 | 怪物进化 | upgrades（into/into_group/half_life/age_grow）、zombify_into、fungalize | 怪物、怪物组 | [mammal.json mon_cat_kitten](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/monsters/mammal.json)、[monstergroups](https://github.com/CleverRaven/Cataclysm-DDA/tree/master/data/json/monstergroups) |
| 40 | 怪物阵营 | monster_factions | 怪物 | [monster_factions.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/monster_factions.json) |
| 41 | 怪物特殊攻击 | monster_special_attacks | 伤害类型、效果 | [MONSTER_SPECIAL_ATTACKS.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/MONSTER_SPECIAL_ATTACKS.md) |
| 42 | 物品生成/掉落 | item_group collection/distribution | 物品 | [ITEM_SPAWN.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ITEM_SPAWN.md) |
| 43 | 天气 | weather_type 条件/优先级/降水/视线/光/温度修正 | 效果(field_effect) | [WEATHER_TYPE.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/WEATHER_TYPE.md) |
| 44 | 区域/世界生成 | region_settings、overmap、mapgen、palettes、map extras | 地形、家具、物品组、怪物组 | [REGION_SETTINGS.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/REGION_SETTINGS.md)、[MAPGEN.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/MAPGEN.md)、[OVERMAP.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/OVERMAP.md) |
| 45 | 场（火/烟/酸/气） | field_type 强度层、免疫、衰减 | 旗标、身体部位抗性、物品 | [field_type.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/field_type.json)、[JSON_INFO.md · Field types](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/JSON_INFO.md) |
| 46 | 排放源 | emit：field/intensity/chance | 场 | [emit.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/emit.json) |
| 47 | 陷阱 | traps.json | 伤害、物品 | [traps.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/traps.json) |
| 48 | 气味 | scent_types | — | [scent_types.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/scent_types.json) |
| 49 | NPC 与对话 | npc_class/npc/talk_topic 状态机、交易、跟随规则 | EOC、物品组、阵营 | [NPCs.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/NPCs.md) |
| 50 | 阵营 | likes/respects/trusts、关系旗标、口粮、货币、价格规则 | 维生素、物品、物品组 | [FACTIONS.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/FACTIONS.md) |
| 51 | 任务 | missions、faction_missions | EOC、NPC | [MISSIONS_JSON.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/MISSIONS_JSON.md)、[faction_missions.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/faction_missions.json) |
| 52 | 基地营地 | 蓝图配方 + 同伴任务（侦察/巡逻/狩猎/招募） | 配方、需求、mapgen | [BASECAMP.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/BASECAMP.md) |
| 53 | 武术 | 流派/技法/增益；按 weapon_category 连武器 | 武器类别、伤害、技能 | [MARTIALART_JSON.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/MARTIALART_JSON.md) |
| 54 | 魔法/法术/附魔/遗物 | SPELL、enchantment、relic_data、artifact | 附魔值、伤害类型、效果 | [MAGIC.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/MAGIC.md)、[ARTIFACTS.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ARTIFACTS.md) |
| 55 | 条件效果脚本 | EOC 触发/条件/效果 | 全部 | [EFFECT_ON_CONDITION.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/EFFECT_ON_CONDITION.md) |
| 56 | 士气 | morale_types | 维生素(过敏)、效果 | [morale_types.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/morale_types.json) |
| 57 | 梦境 | dreams.json（按突变类别） | 突变 | [dreams.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/dreams.json) |
| 58 | 职业/爱好/场景/起点 | professions、hobbies、scenarios、start_locations | 物品、特质、技能 | [JSON_INFO.md · Scenarios / Professions](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/JSON_INFO.md) |
| 59 | 成就/分数/戒律 | event_statistic/score/achievement/conduct | 事件 | [JSON_INFO.md · Scores/Achievements/Conducts](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/JSON_INFO.md) |
| 60 | 区域（zones）与拣选 | zones、loot_zones、item_category.zone | 物品类别 | [zones.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/zones.json)、[loot_zones.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/loot_zones.json) |
| 61 | 移动模式/攀爬 | move_modes、climbing | 肢体分数 | [MOVE_MODE.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/MOVE_MODE.md)、[CLIMBING.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/CLIMBING.md) |
| 62 | 玩家活动 | player_activities | — | [PLAYER_ACTIVITY.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/PLAYER_ACTIVITY.md) |
| 63 | 维度/传送门风暴 | dimensions | EOC | [DIMENSIONS.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/DIMENSIONS.md) |
| 64 | 书与阅读 | book 槽、book_learn、READING_* 附魔 | 配方、附魔值 | [ITEM.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ITEM.md) |
| 65 | 电子文件/软件 | efiles、software | 物品 | [efiles.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/itemgroups/efiles.json) |
| 66 | 衣物改造 | clothing_mods | 物品、材料 | [clothing_mods.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/clothing_mods.json) |
| 67 | 文本片段/言语 | snippets、speech | — | [snippets](https://github.com/CleverRaven/Cataclysm-DDA/tree/master/data/json/snippets) |
| 68 | 过时与迁移 | obsoletion_and_migration | 物品 | [OBSOLETION_AND_MIGRATION.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/OBSOLETION_AND_MIGRATION.md) |
| 69 | UI 小组件 | widgets | — | [WIDGETS.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/WIDGETS.md) |
| 70 | 数学表达式 | jmath 函数 | 变量 | [jmath.json](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/jmath.json) |

## 18. 对 infinite-world 的启示（只借鉴架构）

1. **四个共享字典先于一切系统**：伤害类型、材料、能力/品质、营养计数器。每个系统只在这四张表上开键，不自造枢轴。CDDA 的"过敏原是一种维生素"、"失血量是一种维生素"、"工具是一组品质"，都是把新概念折回旧字典的例子。
2. **"需求"是独立对象，不是配方的子字段**：可命名、可嵌套、可倍乘、可被拆解/屠宰/建造/修理/治疗复用。配方只是"需求 + 结果 + 时间/技能"。
3. **行为由成分算，而不是由成品写**：营养从投入的成分递归求和；防护从材料层算；修理用料从材料查。这保证"任意红肉 + 任意油"的组合不需要逐一定义成品。
4. **通用修改口 + 通用脚本层**：一张"可改数值"的大表（附魔 values）让突变、装备、状态、插件共用一个改属性的入口；一个条件-效果对象（EOC）吸收大部分"特判"。两者加起来，JSON 能覆盖的行为比例就上去了。
5. **派生优先**：copy-from/abstract/relative/proportional 让每个新条目只写差异；但要吸取教训——继承必须是统一实现（一处代码服务所有类型），不能像 CDDA 那样"每类型自己实现、支持程度各异"。
6. **回退路径（finalize）**：没写材料层的衣服由物品材料自动生成；没写透气性的由最差材料推。让"最少字段"的条目也完整可用。
7. **把写死的地方登记成清单**：CDDA 的 iuse、拆解替换表、BOIL 特例都是技术债。我们应在设计期就要求"任何点名 id 的逻辑必须在规则层登记"。
8. **可审计的物理量纲**：比热/潜热/冰点/密度/kJ 这类真实量纲让数据可以被草算核对（第 19 节），也让不同系统（燃烧、温度、腐坏、碰撞）天然共用一套数。

## 19. 草算核对记录

脚本：`F:\temp\claude\d5f27397948f41bd\91a2ffab-45cc-4033-adab-94b22866f267\scratchpad\check_rimworld_cdda.ps1`（PowerShell，先写文件再运行）。与 CDDA 有关的输出：
- 维生素阈值换天数（rate 15 m）：iron 缺乏起点 9600 单位 = 100 天；vitC 坏血病起点 2800 = 29.2 天；iron 下限 24000 = 250 天；vitC 下限 5600 = 58.3 天；calcium 下限 48000 = 500 天。结论：量级合理（坏血病约一个月、贫血约三个月），数据自洽。
- harvest `mammal_small_fur` 的 mass_ratio 合计 0.3735 < 1，其余进 leftovers，自洽。
- 未能核算防护公式（函数体未取到）。

## 20. 参考链接清单

仓库与目录
1. https://github.com/CleverRaven/Cataclysm-DDA
2. https://github.com/CleverRaven/Cataclysm-DDA/tree/master/data/json
3. https://github.com/CleverRaven/Cataclysm-DDA/tree/master/data/json/items
4. https://github.com/CleverRaven/Cataclysm-DDA/tree/master/data/json/items/armor
5. https://github.com/CleverRaven/Cataclysm-DDA/tree/master/data/json/items/comestibles
6. https://github.com/CleverRaven/Cataclysm-DDA/tree/master/data/json/items/tool
7. https://github.com/CleverRaven/Cataclysm-DDA/tree/master/data/json/requirements
8. https://github.com/CleverRaven/Cataclysm-DDA/tree/master/data/json/recipes
9. https://github.com/CleverRaven/Cataclysm-DDA/tree/master/data/json/recipes/armor
10. https://github.com/CleverRaven/Cataclysm-DDA/tree/master/data/json/recipes/food
11. https://github.com/CleverRaven/Cataclysm-DDA/tree/master/data/json/monsters
12. https://github.com/CleverRaven/Cataclysm-DDA/tree/master/data/json/mutations
13. https://github.com/CleverRaven/Cataclysm-DDA/tree/master/data/json/itemgroups
14. https://github.com/CleverRaven/Cataclysm-DDA/tree/master/doc/JSON
15. https://api.github.com/repos/CleverRaven/Cataclysm-DDA/contents/src

数据文件
16. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/materials.json
17. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/tool_qualities.json
18. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/vitamin.json
19. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/damage_types.json
20. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/harvest.json
21. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/harvest_drop_type.json
22. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/butchery_requirements.json
23. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/requirements/toolsets.json
24. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/requirements/materials.json
25. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/requirements/cooking_components.json
26. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/items/armor/legs_clothes.json
27. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/items/comestibles/carnivore.json
28. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/items/tool/workshop.json
29. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/items/tool/metalworking.json
30. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/recipes/armor/legs.json
31. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/recipes/food/carnivore.json
32. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/monsters/mammal.json
33. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/mutations/mutations.json
34. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/data/json/LOADING_ORDER.md

格式文档
35. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/JSON_INFO.md
36. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ITEM.md
37. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ITEM_CRAFT_AND_DISASSEMBLY.md
38. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/JSON_INHERITANCE.md
39. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/VITAMIN.md
40. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/MONSTERS.md
41. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/MUTATIONS.md
42. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/MAGIC.md
43. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/ITEM_SPAWN.md
44. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/JSON_FLAGS.md
45. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/EFFECTS_JSON.md
46. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/EFFECT_ON_CONDITION.md
47. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/NPCs.md
48. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/FACTIONS.md
49. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/BASECAMP.md
50. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/WEATHER_TYPE.md
51. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/REGION_SETTINGS.md
52. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/WOUNDS.md
53. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/PROFICIENCY.md
54. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/MARTIALART_JSON.md
55. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/VEHICLES_JSON.md
56. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/GUIDE_COMESTIBLES.md

源码
57. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/material.cpp
58. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/requirements.cpp
59. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/recipe.cpp
60. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/item.cpp
61. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/item_armor.cpp
62. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/item_factory.cpp
63. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/consumption.cpp
64. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/damage.cpp
65. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/iuse.cpp
66. https://github.com/CleverRaven/Cataclysm-DDA/blob/master/src/item_wakeup.cpp

没取到的资料（如实记录）
- `item::resist()` 函数体（不在 damage.cpp / item_armor.cpp / 已读 item.cpp 片段；grep.app 返回 429）。
- `item::process_temperature_rot` / `calc_rot` 函数体与温度分段腐坏速率。
- `requirements.cpp` 中 `operator*`（using 倍数）的具体实现未单独定位（recipe.cpp 只显示用 accumulate 合并）。
- JSON_INFO.md 的 Construction、Traps、Scent types、Zones 正文（只见目录与文件表）。
