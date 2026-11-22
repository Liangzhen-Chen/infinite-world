共 15 条，甲 1 乙 9 丙 5，有理由 3 无理由 12；另：已登记未建 7 项、拿不准 3 项、跨卷待判 2 条（不计入上面的 15 条）。
本卡读了：卷二 :62-122、:1662-1735、:2033-2059；卷三甲 :100-182、:225-262；卷三乙 :129-290、:640-751（聚合表 :655 起及 :640-648 口径表）；world/ontology/dimensions/item.json :1-145（表头与 instanceDimensions；数据行只抽读 :126-145）、material.json :1-20、:1558-2571（dimensions 段）、:2573-2662（entity/precedence/namedConditions）、:2820-2848、:20535-20579（数据行抽查）、recipe.json :1-65；world/ontology/dimensions/_vocab.json :1-160、:106-148（family 名清单用 Grep）、_unbuilt-derived.json :1-60、:120-250。未读到：material.json 其余两万余行数据行、item.json 其余数据行、卷二/卷三甲/卷三乙所给行号以外的正文。
词表抽查：arcschool、field、parameter、vform、wardtag 不在 _vocab.json，但已登记为未建族（_unbuilt-derived.json:204-238）；launchsrc、req_per 是代码内封闭枚举（server-plugin/kernel/handles/markers.mjs:44-50）；quality 七档在 _vocab.json:134-142；dockind、language 等族存在或已登记。未发现"卷文未登记的维度"：三张表已声明的维度都能在卷文找到登记行。

### 1 item 表实例维度缺七项（maker、author、contentRef、beauty、slots、enchantments、lots）
- 位置：world/ontology/dimensions/item.json:102-113（instanceDimensions 段只有 10 键，缺这七键）
- 设计原文：卷二 :1702，`maker`（ref person nullable；never, skip）、`author / contentRef`（comp_work, error）、`beauty`（derived number…）、`slots / enchantments: list<修正项>`（comp_relic, error）、`lots: list<struct{…}>`（never, skip）
- 代码实际：instanceDimensions 只声明 diedMinute、durability、madeDay、ofPerson、ofSpecies、qualityTier、rotAnchorDay、spoilage、taint、wearAnchorDay 十项
- 理由：无（卷三乙 §2.3 与卷二 §5.1 都写了这些列，未见裁定或问题.md 登记为不建）
- 影响：规则缺：写实例时这些字段会被当未声明维度拒写，制作者、作品内容、美饰、附魔槽、批次指针都落不了盘
- 严重程度：乙
- 合并：无

### 2 material 表缺卷三甲 §2.5 他卷登记的十二列
- 位置：world/ontology/dimensions/material.json:1558-2571（dimensions 段无这十二键）
- 设计原文：卷三甲 :231，他卷登记在材料表上的列：`aetherCapacity`、`arcaneConduct`、`arcaneInsulate`、`classAffinity`、`sphereAffinity`、`fieldRegen`（卷十五 §2.3）、`pharm`、`agents`（卷二十一 §2.2）、`soilNutrient`、`sourceTaxon`、`sourceSapient`（卷二十五 §2.2）、`wardTags`（卷十六 §2.3）
- 代码实际：material.json 的 dimensions 段这十二个键一个也没有
- 理由：无（卷三甲 §2.5 明写"材料表的全部列 = §2.1 加本节"；_unbuilt-derived.json 的 columns 也没有登记它们）
- 影响：玩法不可达：灵力容量/导引/阻隔、药性、病原、肥力、来源生物、取自有心智、镇物标签都无处存值，卷十五/二十一/二十五/十六对应玩法读不到
- 严重程度：乙
- 合并：无

### 3 material 表缺派生列 possibleMatterStates
- 位置：world/ontology/dimensions/material.json:1558-2571（无 possibleMatterStates 键）
- 设计原文：卷三乙 :145，`possibleMatterStates` set<enum matter>，derived，…误差为 error
- 代码实际：material 表没有该维度（item 表有同名维度）
- 理由：无（卷三甲 :229 把它列为材料表七个派生列之一；_unbuilt-derived.json 未登记它）
- 影响：规则缺：T-13 的材料可能物态集无从计算，物品可能物态集失去材料侧输入
- 严重程度：乙
- 合并：无

### 4 plantPart、plantFamily 的 bySubstance 必填未落
- 位置：world/ontology/dimensions/material.json:2236（plantFamily required "never"）、:2246（plantPart required "never"）
- 设计原文：卷三甲 :107/:108，`plantPart`、`plantFamily` 必填 `bySubstance:subst_plant,subst_wood（M-17/M-20）`
- 代码实际：两维 required 都写 "never"，任何行都可以不填
- 理由：无（卷二 §1.2 :105 的 .required 语法没有收 bySubstance，见跨卷待判 2；代码没有改用等价的可机判写法）
- 影响：规则缺：M-17、M-20 的必填校验与加载警告清单都不触发
- 严重程度：乙
- 合并：无

### 5 byReader 未登记进 namedConditions
- 位置：world/ontology/dimensions/material.json:2583-2592（namedConditions 只有 byDigestible）；used at :1714（breathabilityBase）、:2086（insulation）
- 设计原文：卷二 :105，`byReader` 同是 material 表专用的命名条件；卷三甲 :169，`insulation`、`breathabilityBase` 两格的 .required 写 byReader
- 代码实际：表头用了 required:"byReader"，但没有对应判据登记，校验器只报 notCovered
- 理由：有（docs/审查/P-3-验收单.md:46、:48 记"byReader 仍只记 notCovered"）
- 影响：规则缺：两格的必填与禁填（E-MAT-UNREAD-WRITTEN）都不判
- 严重程度：乙
- 合并：无

### 6 necessityTier 缺 ordered 与 recursive 声明
- 位置：world/ontology/dimensions/item.json:61
- 设计原文：卷二 :1680，`necessityTier` derived ordered enum tier …`recursive:{relation: rel_downstream_recipes}`
- 代码实际：只有 type/vocab/derived/required/onUnknown，无 ordered:true，无 recursive
- 理由：无
- 影响：规则缺：§1.2 :110 要求自引用派生必须带 recursive；排序枚举声明也缺
- 严重程度：乙
- 合并：无

### 7 faultChanceMult 的叠加方式写成 none
- 位置：world/ontology/dimensions/item.json:40
- 设计原文：卷三乙 :174，`faultChanceMult` number，modifiable，stacking mul
- 代码实际：stacking 写 "none"
- 理由：无
- 影响：读数错：多来源修正会按覆盖而非相乘合成，故障概率算错
- 严重程度：甲
- 合并：无

### 8 attacks 的 contactArea、speedMult 下界写成 0
- 位置：world/ontology/dimensions/item.json:23
- 设计原文：卷二 :1695，取值域：各元素 `contactArea` > 0、`speedMult` > 0、`penetration` ≥ 0
- 代码实际：三个子字段 domain 都是 [0, null]，允许 0（penetration 正确）
- 理由：无（代码里也没有对应的加载校验）
- 影响：规则缺：contactArea=0 或 speedMult=0 的攻击形制能通过加载
- 严重程度：乙
- 合并：无

### 9 recipe 的 outputs.qty 只声明 distribution
- 位置：world/ontology/dimensions/recipe.json:35
- 设计原文：卷二 :2041，`qty: union[number, distribution]`
- 代码实际：type 只写 "distribution"，没有 number 分支
- 理由：无（kernel/recipe.mjs:143 反而按 number 判 qty>0）
- 影响：规则缺：固定件数配方在表头无法表达，代码与表头各认一套
- 严重程度：乙
- 合并：无

### 10 ofPerson 的必填条件与卷文相反
- 位置：world/ontology/dimensions/item.json:106
- 设计原文：卷三乙 :236，`ofSpecies` `ofPerson` `diedMinute` …必填 byClass:comp_corpse（`ofPerson` never）
- 代码实际：ofPerson required 写 byClass:comp_corpse，onUnknown skip
- 理由：无（仅 source 注释自述"见 6-6 回报自定裁定"，未见裁定入库）
- 影响：规则缺：没有 ofPerson 的尸体实例会被判缺必填，与"没有个体实体写 null"的卷文相反
- 严重程度：乙
- 合并：无

### 11 massKg 的取值域含 0
- 位置：world/ontology/dimensions/item.json:55
- 设计原文：卷三乙 :157，`massKg` …(0,100000]（下限不含 0…等于 0 即加载失败）
- 代码实际：domain [0, 100000]
- 理由：有（加载校验另判：server-plugin/kernel/item.mjs:488-489 判 mass > 0 并报错）
- 影响：只是形式：实际加载拦得住 0
- 严重程度：丙
- 合并：无

### 12 material 表五个 always 维度缺 onUnknown 字段
- 位置：world/ontology/dimensions/material.json:1934-1946（flammability）、:2319-2327（refMaterial）、:2351-2363（salvageFraction）、:2518-2530（valueMult）、:2559-2571（workDifficulty）
- 设计原文：卷三甲 :111-112、:114、:116、:135，这五行的 onUnknown 列都写 error
- 代码实际：五个维度定义都没有 onUnknown 键
- 理由：有（卷二 §1.2 :107 只要求"非 always 必须"写 onUnknown；这五个都是 always）
- 影响：只是形式：always 维度不会出现未知
- 严重程度：丙
- 合并：无

### 13 hydration 的 required 与卷文不符
- 位置：world/ontology/dimensions/material.json:2057
- 设计原文：卷三乙 :142，`hydration` number derived …必填 —
- 代码实际：required 写 "byClass:comp_drinkable"
- 理由：无
- 影响：只是形式：derived 维度行上不写值，校验器跳过
- 严重程度：丙
- 合并：无

### 14 specificHeat 的"室温相态那一栏必填"未落
- 位置：world/ontology/dimensions/material.json:2392-2430
- 设计原文：卷三甲 :124，byClass:class_metal（20 ℃、一个标准大气压下本行所处物态的那一栏必填，即"室温相态"那一栏）
- 代码实际：只写 required:"byClass:class_metal"，没有 requiredFields 或按相态判的栏位必填，也没有加载校验
- 理由：无
- 影响：规则缺：金属行可以三栏全空或只填非室温相态栏而通过加载
- 严重程度：乙
- 合并：无

### 15 valueMult 的单位写成 fraction
- 位置：world/ontology/dimensions/material.json:2518-2530
- 设计原文：卷三甲 :111，`valueMult` | number | — | [0,1000]
- 代码实际：unit "fraction"
- 理由：无
- 影响：只是形式：单位代号与卷文的"无量纲"不同
- 严重程度：丙
- 合并：无

## 已登记未建
- item `workedState`：卷三乙 :163 要求（1121k7 新增）；登记处 docs/卡回报/batch8-errata.md:57（6-22 跟办，卷二 §5.1 回填随后续勘误）。
- item `surfaceHeightCm`、`surfaceLoadKg`：卷三乙 :183-184；登记处 docs/迁移体检/格子G12-G16-规矩检查对照.md:166（家具承面卡）。
- item `leafOpen`：卷二 :1702；登记处 docs/迁移体检/格子G6-G11-规矩检查对照.md:44（G7 只读，写者与登记归卷十九建造/设施卡）。
- material `rawForm`：卷三甲 :115；登记处 server-plugin/kernel/valuation.mjs:44（GAP material_rawForm_unbuilt）、server-plugin/kernel/item-state.mjs:290（腐坏留存要配方与 rawForm）。
- material `combustionField`：卷三甲 :146；登记处 docs/审查/1123勘误-Opus只核-1123.md:29（现仓库 combustionFed 0 命中，条件不触发，不挡首版）。
- material `hardness`、`toughness` 派生式：卷三乙 :139-140；登记处 world/ontology/dimensions/_unbuilt-derived.json:5-6（缺 strengthSummary 权重与点积原语）。其余 derived 维度的未建登记同文件，本卡不重复。
- 词表族 arcoschool、field、parameter、vform、wardtag：item 表引用；登记处 world/ontology/dimensions/_unbuilt-derived.json:204-238（pre_first_reader_card）。

## 拿不准
- item `entity.instanceTable` 为 null（item.json:119）：卷二 §1.2 :97 把 instanceTable 列为 entity 必填字段，item 又有实例维度；但全库各表都写 null，语义（"没有外部实例文件"还是"未填"）卷文未说清，不敢判。
- material `memberDeviationThreshold` 缺（material.json 全文无此键）：卷二 :119 说"有 sources 时必须"，但"有 sources"指表级节还是行级 sources 不明；全库没有一张维度表有此键，可能是全表通则未落。
- item `classes` 为空（item.json:14）：卷三乙 :224、:226 说物品根类别行在数据里写全 sense 族全部代号；但类别行属"数据行"还是表头声明、归哪张卡，不在本卡判定范围，且卷二 §1.2 :121 允许 classes 为空对象。

## 跨卷待判
- item `density` 派生式：卷二 §5.1 :1670 写 `wsum(material,'material','density')`，卷三乙 §4.1.1 :653 聚合表写 `density` 口径 `hmean`；代码 item.json:33 取 `hmean(…)`。两卷都现行，需卷二/卷三乙作者定哪一处改（代码与卷三乙一致）。
- 卷三甲 `plantPart`、`plantFamily` 的 `bySubstance` 必填（卷三甲 :107/:108）与卷二 §1.2 :105 `.required` 语法未收 bySubstance 冲突；代码取 "never"（见第 4 条）。需卷二收写法或卷三甲改用已收写法。
