# 总审 · 根因 B、F 扫描清单（交李白看，未动笔）

- 范围：`F:/dnd/docs/统一底层设计/卷*.md` 共 32 卷，只读。脚本初筛 + 人工逐条判定。
- 文件:行 写法：卷名短称（文件名“-”前一段）加行号。行号取 11-14 19:12 的文件状态（扫描期间卷二、卷四、卷五、卷九、卷十五、卷十八、卷二十二、卷二十四等在 19:02–19:08 有改动，已按改后文件重跑；卷四、卷十四 19:17 又改过，引用行已逐条复核，只有卷十四一处由 :1626 移到 :1628）。
- 判据：B 按“同一张表的同名维度以定义该表的领域卷 §2 为准”；F 按“表定义卷 §2 必须列出本表全部维度与种类行（含他卷登记、含派生），含义列指回来源卷”。只比类型、单位、必填、是否派生，`modifiable` 等标记不在比较项内。
- “从严/放宽”：定义卷必填或 onUnknown 比卷二严的标“从严”，比卷二松的标“放宽”。卷二 §5 段首 TA-M7 规定“照抄或从严，不得放宽”，标“放宽”的几条照 B 的新规矩改，会与 TA-M7 冲突，请李白定。
- 计数：B 54 条（按维度计，表里 43 行）；F 260 条（按维度、列或种类行计，表里 63 行），另有 4 张种类表只做到表级、没有逐行列（表里另 4 行，不计条数）。

## B 卷二 §5 首批字段表与定义卷 §2 同名维度不一致（54 条）

| 表名 | 维度/种类行 | 卷二 §5 文件:行 原文 | 定义卷 §2 文件:行 现状 | 差异 | 建议改法 |
|---|---|---|---|---|---|
| item | `wearResistance` | 卷二:1460 `number score`，byClass:comp_durable，error | 卷三乙:167 `number，derived`，必填 —，gap | 派生、必填、onUnknown | 卷二改为 derived、—、gap，派生式指卷三乙 §4.10 |
| item | `shelfLifeDays` | 卷二:1463 `number day`，byClass:comp_rottable，error | 卷三乙:174 `number，derived，allowExplicit`，—，gap | 派生、必填、onUnknown | 卷二改为 derived allowExplicit、—、gap |
| item | `valueBase` | 卷二:1467 `number copper（卷六后 derived…）`，always | 卷三乙:176 `number，derived`，不许显式写 | 派生、必填 | 卷二改为 derived、—，删“卷六后”字样 |
| item | `warmth`、`breathability`（2） | 卷二:1469 `layer / coverage / warmth / breathability` 同行，byClass:comp_wearable，error | 卷三乙:190 两项 derived，—，gap | 派生、必填、onUnknown | 卷二把两项从该行拆出，标 derived、gap |
| item | `capacityL` | 卷二:1471 `capacityL / maxLoadKg / sealed` number | 卷三乙:178 已按台账 S-28 改名 `volumeCapacity`，单位 L | 名称 | 卷二改名 `volumeCapacity` 并补单位 L |
| item | `abilities` | 卷二:1468 `map<ref ability, integer 1–3>` | 卷三乙:177 `map<ref vocab ability, integer>`，值 [1,3] | 类型（引用目标写法不同，卷二写成引一张不存在的 ability 表） | 卷二改为 `map<ref vocab ability, integer>` |
| material | `density` | 卷二:1485 `number kg_per_L`，always | 卷三甲:110 `struct:byState<number>`，气栏 kg_per_L_gas，三栏至少填一栏 | 类型、单位、必填口径 | 卷二改为 struct:byState，单位分栏，必填照卷三甲 M-13 |
| material | `specificHeat` | 卷二:1490 `meltPoint / specificHeat` 同行：number，byClass:class_metal，gap | 卷三甲:124 `struct:byState<number>`，kJ_per_kg_K，never | 类型、单位、必填（放宽） | 卷二拆行改为 struct:byState、kJ_per_kg_K、never |
| material | `meltPoint` | 卷二:1490 celsius，byClass:class_metal | 卷三甲:131 number celsius，never（与 decomposePoint 至少填一个，M-11） | 必填（放宽） | 卷二改为 never，并注 M-11 |
| material | `hardness`、`toughness`（2） | 卷二:1491 `hardness / toughness / sharpnessMax`：score ×3，never（手填） | 卷三乙:139、:140 derived，由 strength 合成 | 派生 | 卷二把两项拆出标 derived，指卷三乙 §2.1；sharpnessMax 仍手填 |
| material | `charYield` | 卷二:1489 类型列写 fraction（必填列括注“派生量”） | 卷三乙:141 `number，derived` | 派生标记只写在必填列，类型列没标 | 卷二拆出单行，类型列标 derived |
| material | `flammability` | 卷二:1493 fraction，always | 卷三甲:112 number，单位 flam_index | 单位 | 卷二改单位为 flam_index |
| material | `rotRate` | 卷二:1494 per_day | 卷三甲:152 number，单位 per_day_rot（带标定条件） | 单位 | 卷二改为 per_day_rot |
| material | `moisture` | 卷二:1486 `moisture / edibleFraction`：byClass:comp_edible | 卷三甲:145 byDigestible；byClass:comp_edible,comp_drinkable,comp_burnable | 必填 | 卷二拆行照抄卷三甲的必填条件 |
| material | `energyDensity` | 卷二:1487 `number satiety_per_kg_dry`，byClass:comp_edible；卷二 §1.4（:171）只列单位名，没有标定 | 卷三甲:147 byDigestible；byClass:comp_edible；口径改为干基总能；卷三甲:201 写“标定只在卷二 §1.4 一处” | 必填；单位标定缺失（卷三甲指向卷二，卷二没写） | 卷二改必填条件，并在 §1.4 补 satiety 标定（1 satiety = 每千克干重总能 1 兆焦） |
| material | `insulation`、`breathabilityBase`（2） | 卷二:1495 byClass:class_fabric,class_leather，gap | 卷三甲:129、:130 never | 必填（放宽） | 卷二改为 never |
| material | `armorMult` | 卷二:1502 `map<ref damage, fraction>` | 卷三甲:120 `map<ref vocab damage, number>`，单位 fraction，值 [0,4] | 类型（键写法；值域超出 fraction） | 卷二改为 `map<ref vocab damage, number>`，域 [0,4] |
| species | `products` | 卷二:1522 `map<ref item, number per_day>`，byClass:comp_livestock | 卷四 §2.1 无此列；卷四:141 改用 `renewables`，卷四:1689 A-13 写明“products 退役” | 定义卷已撤销；还与 §5.19 的 `products`（卷二:1800 `map<ref item, fraction>`）同名不同型 | 卷二删 §5.3 `products`，改登 `renewables` |
| species | `maturityYears` | 卷二:1518 byClass:comp_livestock,comp_sapient | 卷四:127 always（从严） | 必填 | 卷二改为 always |
| species | `attributesBase` | 卷二:1526 byClass:comp_sapient | 卷四:152 always | 必填 | 卷二改为 always |
| place | `intendedType` | 卷二:1583 `intendedType` ref facility_type（原 facilityType 已改名） | 卷五:122 仍写 `facilityType`、`condition`、`material`“见卷二 §5.6” | 名称（定义卷用了已撤的旧名） | 卷五改为 `intendedType` 并逐项列（并入 F 节 place 表卷十九那一行） |
| place | `annualMeanTempC`、`annualPrecipMm`（2） | 卷二:1572 `derived: nearest(rel_contains, …)`（区域级填） | 卷五 §2.1 没有；卷二十:287–288 登为 comp_weather_cell 上手填的 number，error | 派生与存储不一致 | 卷五 §2 收录卷二十口径（见 F 节 comp_weather_cell 那一行），卷二改为 comp_weather_cell 的存储维度 |
| facility_type | `fixtures`、`capacityBase`、`capacityPerFixture`、`lodging`、`public`、`allowedMaterials`、`buildRequirement`（7） | 卷二:1597–1605 | 卷十九 §2.2（:151–176）没有这 7 项；卷十九:1161 Q1 已改为按功能量判类（`functionNeeds`、`headline`、`envelopeWhere`、`accessDefault`） | 定义卷已撤销 | 卷二删这 7 项，改登卷十九 §2.2 的现行字段 |
| facility_type | `wearPerDay` | 卷二:1604 fraction | 卷十九:167 fraction，单位 per_day | 单位 | 卷二补单位 per_day |
| faith | `fervor` | 卷二:1682 instanceDimensions score（可修正），never，gap | 卷七:134 `derived number`，fraction [0,1]，注明“不是存储字段” | 派生、单位 | 卷二改为 derived number fraction |
| faith | `unlocks` | 卷二:1686 `set<ref vocab parameter>`，never（存储） | 卷七:133 `derived set<ref vocab parameter>` | 派生 | 卷二改为 derived |
| profession | `variantOf` | 卷二:1720 `ref profession nullable`，never（手填） | 卷十四:129 derived（等于本行 `extends`），— | 派生 | 卷二改为 derived |
| profession | `skills` | 卷二:1715 `map<ref skill, score>` | 卷十四:122 `map<skillRef, score（1–2700）>`，键放宽到技能类 | 类型（键域） | 卷二改键为 skillRef |
| profession / recipe | `toolAbilities` | 卷二:1717 profession `set<ref vocab ability>`；卷二:1772 recipe `map<ref vocab ability, integer>` | 卷十四:126 set；recipe 的定义卷卷三乙 §2 没有 recipe 表；卷十四:1628 “B 小 1”已记账 | 同名跨表不同型 | 两表统一成一种类型，或把其中一个改名 |
| skill | `prereqs` | 卷二:1732 `map<ref skill, score>` | 卷十四:146 `union{anyOf:[ref vocab requirement, 人需求块内联]}` | 类型 | 卷二改为 union 需求块 |
| skill | `rustPerDay` | 卷二:1733 fraction | 卷十四:151 fraction，per_day | 单位 | 卷二补 per_day |
| offense | `act` | 卷二:1746 `ref vocab verb`，always | 卷八b:142 `ref vocab verb nullable`，事件类必填、状态类必空 | 类型、必填 | 卷二改为 nullable，必填改为按 `mode` 判 |
| offense | `against` | 卷二:1747 rx | 卷八b:143 rx nullable | 类型（是否 nullable） | 卷二改为 rx nullable |
| law_code | `penalty` | 卷二:1814 `struct{kind: enum penalty, amountRX: rx}`，always | 卷八b:186 改为 `penalties: list<struct{penalty: ref vocab penalty, amountRX, floorRX, capRX}>`，只在罪刑条目上 | 名称、类型、必填 | 卷二改为 `penalties`，必填按 `form` 判 |
| law_code | `appealTo` | 卷二:1816 `ref office nullable` | 卷八b 没有；上诉由 :178 `forum.appealUp` 承担 | 定义卷已撤销 | 卷二删 `appealTo`，登 `forum` |
| law_code | `offense` | 卷二:1813 `ref offense`，always | 卷八b:185 只在罪刑条目上必填（字段组由 `form` 决定） | 必填 | 卷二改为 byEnum:form=罪刑 |
| law_code | `jurisdictionKinds` | 卷二:1812 always | 卷八b:177 属地法典必填，属人法典可空 | 必填（放宽） | 卷二改为条件必填 |
| law_code | `legislator` | 卷二:1819 `ref org`，always，error | 卷八b:176 `ref org nullable`，skip，习惯层可空 | 类型、必填、onUnknown（放宽） | 卷二改为 nullable、条件必填、skip |
| law_code | `applicabilityRX` | 卷二:1817 rx | 卷八b:165 rx nullable（空即恒真） | 类型（是否 nullable） | 卷二改为 rx nullable |
| plant | `sowSeasons`、`harvestSeasons`（2） | 卷二:1793 `set<ref vocab season>`，always | 卷二十五:121 两项已撤销，改为视图派生 | 定义卷已撤销 | 卷二删这两项 |
| plant | `growTempC` | 卷二:1796 never，gap | 卷二十五:98 always（从严），error | 必填、onUnknown | 卷二改为 always、error |
| plant | `yieldPerM2` | 卷二:1794 `distribution kg` | 卷二十五:103 distribution，单位 kg_per_m2 | 单位 | 卷二改为 kg_per_m2 |
| knowledge | `cipher` | 卷二:1839 boolean，always，error（行上必写） | 卷二十二:157 boolean，写“缺省假”，skip | 必填、onUnknown（放宽）；“缺省假”违反卷二 §1.6 不设常量缺省 | 按 B 规矩卷二应改为卷二十二的写法，但“缺省假”撞卷二 §1.6 硬规矩，请李白定；倾向改卷二十二为 always/error |

## F 他卷登记在某表上，表定义卷 §2 没列（260 条，另 4 张种类表只做到表级）

“声明处”含卷二 §5（相对领域卷，卷二也是他卷）。每行一组，括号里是条数。

| 表名 | 维度/种类行 | 声明卷 文件:行 原文 | 定义卷 §2 文件:行 现状 | 差异 | 建议改法 |
|---|---|---|---|---|---|
| item | `origin`、`seasonUseFactor`、`produceSeason`、`selfMakeRecipe`、`lifeDays`、`useEffects`（6） | 卷二:1451–1476 各行 | 卷三乙:151 只写“其余（origin…）含义见所在小节”，§2.2 表里没有这些行 | 缺列 | 卷三乙 §2.2 逐行补列，含义列指回卷二 §5.1 与各细目节 |
| item | `parts`（1） | 卷二:1473 `parts / fuelClass` | 卷三乙 §2.2 没有 | 缺列 | 卷三乙 §2.2 补行 |
| item | `vform`、`vehicleLoadKg`、`speedCapMpm`、`frameMassKg`、`cargoVolumeL`、`fuelClass`（6） | 卷十七:169–174 “§2.3 维度”；卷二:1473–1475 | 卷三乙 §2.2 没有，只写“载具四字段含义见所在小节” | 缺列；另外 `fuelClass` 卷二:1473 写 always，卷十七:174 写 nullable/skip | 卷三乙 §2.2 补行指回卷十七，并统一 fuelClass 的必填 |
| item | `weaponClass`、`guard`、`launch`、`dragPerM`、`wieldHands`、`wielders`（6） | 卷十三:226–229、:241–242 “登记到别卷表上的维度” | 卷三乙 §2.2 没有 | 缺列 | 卷三乙 §2.2 补行指回卷十三 §2.3 |
| item | `sympathyOf`、`enchantLoad`、`arcSchool`、`aetherStored`（4） | 卷十五:194–197 | 卷三乙 §2.2、§2.3 没有 | 缺列 | 卷三乙补行（实例维度进 §2.3），指回卷十五 §2.3 |
| item / material | `wardTags`（物品 1、材料 1，共 2） | 卷十六:169 “material、item | wardTags | set<ref vocab wardtag>（派生）” | 卷三乙 §2.2 与卷三甲 §2.1 都没有 | 缺列（派生） | 两卷各补一行派生维度，指回卷十六 |
| item | `coverShare`、`hostRef`、`workChoices`、`workKind`、`workClasses`、`workMatcats`、`beautyForm`（7） | 卷二十三:137–147 “§2.2 维度”（所在：物品实例、comp_work、物品类别行） | 卷三乙 §2.2、§2.3 没有（§2.3 只有 author、contentRef、beauty） | 缺列 | 卷三乙 §2.3 补实例维度，类别行字段 `beautyForm` 补进 §2.2，均指回卷二十三 |
| recipe | `inputs`、`outputs`、`byproducts`、`workstation`、`toolAbilities`、`skill`、`skillMin`、`minutes`、`laborHeads`、`qualityCurve`、`failureRX`、`wasteFraction`、`batchFactor`、`toolWear`、`learnFrom`、`season`（16） | 卷二:1761–1781 §5.18，owner 33 = 卷三乙 | 卷三乙 §2 没有 recipe 表，字段只散在 §4.8（:1130 起） | 整表缺 | 卷三乙 §2 新增 recipe 表，列全部字段（含卷十四、卷十九共表主登记的） |
| material | `aetherCapacity`、`arcaneConduct`、`arcaneInsulate`、`classAffinity`、`sphereAffinity`、`fieldRegen`（6） | 卷十五:172–177（组件类 comp_arcane） | 卷三甲 §2.1 没有 | 缺列 | 卷三甲 §2.1 补行指回卷十五 |
| material | `pharm`、`agents`（2） | 卷二十一:134–135 “材料表新增（登记到卷三 §4.1…）” | 卷三甲 §2.1 没有 | 缺列 | 卷三甲补行指回卷二十一 §2.2 |
| material | `soilNutrient`、`sourceTaxon`、`sourceSapient`（3） | 卷二十五:131–133 “本卷向别的表登记的维度” | 卷三甲 §2.1 没有 | 缺列（`sourceSapient` 为派生） | 卷三甲补行指回卷二十五 |
| species | `sxOrigin`、`sxForm`、`sxAnchors`、`sxDrives`、`sxPowers`、`sxBounds`、`sxCulture`（7） | 卷十五:178–184；卷二:1530–1532 | 卷四 §2.1 没有 | 缺列 | 卷四 §2.1 补行指回卷十五 §2.3 |
| species | `effectiveBanes`、`lairSites`、`lairPlaceRX`、`rangeM`、`shiftVariant`、`shiftStatus`、`speciesPower`、`speciesTier`（8） | 卷十六:160–167 | 卷四 §2.1 有 banes、packSize 等，缺这 8 项 | 缺列（含派生 3 项） | 卷四补行指回卷十六 §2.3 |
| species | `tameEase`、`trainEase`（2） | 卷二十五:129–130 | 卷四 §2.1 没有 | 缺列 | 卷四补行指回卷二十五 |
| species | `personalityBias`（1） | 卷二十六:129 “挂在物种行与文化行” | 卷四:154 只在 temperament 的校验列里提到，没有行（卷七:170 文化表已列） | 缺列 | 卷四 §2.1 补行指回卷二十六 |
| person | `healMult`、`worsenMult`、`exposureMult`、`immuneGain`、`needRecover`、`selfHeatC`、`coldLimitC`、`heatLimitC`（8） | 卷二十一:145–151 “个体表新增（登记到卷二 §5.5）” | 卷四 §2.3 没有 | 缺列 | 卷四 §2.3 补行指回卷二十一 |
| person | `prefOffset`、`preference`、`gaugeTarget`、`gaugeInflow`、`driveWeight`、`decisionNoise`、`psychOut`（7） | 卷二十六:119–125 | 卷四 §2.3 没有 | 缺列（多为派生） | 卷四补行指回卷二十六 §2.1 |
| person | `experience`、`level`、`learnCapacity`、`learnLoad`、`focus`、`focusSince`、`perks`、`eduFocus`（8） | 卷十四:172–177 “挂在个体 person 上的维度” | 卷四 §2.3 有 aptitudes，缺这 8 项 | 缺列 | 卷四补行指回卷十四 §2.3 |
| person | `marriageRegime`、`inheritanceRegime`、`descent`、`dependent`、`esteemTier`（5） | 卷十八:111–118 | 卷四 §2.3 没有 | 缺列（均为派生） | 卷四补行指回卷十八 §2.1 |
| person | `aetherCap`、`resistReading`、`sustainLoad`、`cultureMix`（4） | 卷十五:187–189、:193 | 卷四 §2.3 没有（soulOf 等已有） | 缺列 | 卷四补行指回卷十五 |
| person | `graspLimbs`、`handsHeld`（2） | 卷十三:239–240 | 卷四 §2.3 没有（卷十三其余 person 维度已列） | 缺列 | 卷四补行指回卷十三 |
| person | `location`（1） | 卷十七:168；卷二:1558 | 卷四 §2.3 没有 | 缺列 | 卷四补行，写者指回卷十七 |
| person | `tier`（1） | 卷十六:168 | 卷四 §2.3 没有 | 缺列（派生） | 卷四补行指回卷十六 |
| person | `primaryProfession`（1） | 卷二:1551（注“唯一真源是卷四 §4.10 P-2”） | 卷四 §2.3 没有 | 缺列（派生） | 卷四 §2.3 补行 |
| person | `workPriority`（1） | 卷六:765 “个体维度（由本卷登记到卷二 §5.5 的 person 表）” | 卷四 §2.3 没有 | 缺列 | 卷四补行指回卷六 |
| place | `hiddenness`、`gateTerms`（2） | 卷十七:175–176；卷二:1586–1587 | 卷五 §2.1 没有 | 缺列 | 卷五 §2.1 补行指回卷十七 |
| place | `intendedType`、`form`、`materialKg`、`wallFlowKg`、`repairedVolumeL`、`envelopeVolumeL`、`repairLot`、`roomRole`、`wallThicknessM`、`storeys`、`qualityTier`、`builder`、`builtDay`、`dirt`、`carrierItem`、`carrierLastPlace`、`ownerFeeRate`、`openSpan`、`storeFilter`、`storePriority`（20） | 卷十九:98–117 “place 表上归本卷的维度” | 卷五:122 只有一行“`facilityType`、`condition`、`material` 见卷二 §5.6，归卷十九” | 缺列（另含旧名，见 B） | 卷五 §2.1 逐行补列，含义列指回卷十九 §2.1 |
| place | `env.*` 18 键（`climateTempC`、`climatePrecipMm`、`solarPhase`、`season`、`daylightMinutes`、`weather`、`cloud`、`precipMm`、`snowMm`、`windMps`、`windDirDeg`、`humidity`、`phenomena`、`tempC`、`lux`、`sightM`、`soundDb`、`fieldIntensity`） | 卷二十:261–274 “地点表的环境维度” | 卷五:101 只有一行通配“`env.*` 各键 见卷二十 §2.7”，并写“本卷不登记、不代登记其中任何一行” | 未逐键列；且卷五原文与新规矩相反 | 卷五把通配行展开成逐键，删去“不代登记”一句 |
| place | `floodL`（1） | 卷二十:277 | 卷五 §2.1 没有 | 缺列 | 卷五补行指回卷二十 |
| place | comp_weather_cell 的 `tempAmpC`、`diurnalAmpC`、`precipSeasonality`、`prevailingWindDeg`、`perennialSnowMm`、`precipLiquid`、`seasonScheme`、`weatherCommonality`、`aspectBase`（9；`annualMeanTempC`、`annualPrecipMm` 已计入 B） | 卷二十:289–297 | 卷五 §2.1 没有该组件类的字段 | 缺列 | 卷五补列组件类与字段，指回卷二十 §2.7 |
| place | comp_enclosure 的 `envelopeUaWPerK`、`soundLossDb`（2） | 卷二十:298–299 登为 place 上的 derived 维度 | 卷五 §2.1 没有；卷十九:96 又说它们是 facilityView 的视图字段、不是派生维度 | 缺列，另有卷二十与卷十九的身份冲突 | 先定身份（维度还是视图），是维度就补进卷五 §2.1 |
| place | `gen.seatCulture`、`gen.layout`、`gen.manifest`、`gen.quota`、`gen.shops`、`gen.share`、`gen.open`（7） | 卷十:138–144 “登记在别表上的生成维度” | 卷五 §2.1 没有 | 缺列 | 卷五补行指回卷十 §2.2 |
| place | `contest`（1） | 卷十三:247 | 卷五 §2.1 没有 | 缺列（派生） | 卷五补行指回卷十三 |
| place | `aetherFieldCap`、`aetherDensity`、`layer`（3） | 卷十五:198–200 | 卷五 §2.1 没有 | 缺列 | 卷五补行指回卷十五 |
| place | `crowding`（1） | 卷二十一:153 “地点表新增一个派生维度…`place.crowding`” | 卷五 §2.1 没有 | 缺列（派生） | 卷五补行指回卷二十一 |
| place（edges 节） | edges 的需求块字段（通行条件，1） | 卷十七:315 R17-1.3 ②“边的需求块…不满足为 `needs`”；卷五:330 规则 7“通行条件写成边上的需求块” | 卷五:123 edges 行 `struct{from,to,distanceM,terrainMix,waterway,speedFactor}` 没有；卷二:1588 也没有 | 缺列（卷十七依赖） | 卷五 §2.1 与卷二 §5.6 的 edges 结构都补需求块字段（如 `requirement: ref vocab requirement nullable`） |
| place（routeView） | `routeView().edge.bearingDeg`（1） | 卷二十九:916 C29-16 “卷五在 routeView().edge 上给出…bearingDeg” | 卷五:205 routeView 的 edge 属性组里没有 bearingDeg，§2 也没列 | 缺列（视图字段） | 卷五在 routeView 的 edge 属性组与 §2 视图字段表补 bearingDeg |
| culture | `gen.speciesWeights`、`gen.faithWeights`、`gen.homelandRX`、`gen.homelandWeight`（4） | 卷十:134–137 | 卷七 §2.3 没有 | 缺列 | 卷七补行指回卷十 |
| culture | `marriageRegime`、`inheritanceRegime`（2） | 卷十八:109–110 | 卷七 §2.3 表里没有，只在 :175 正文提到 | 缺列 | 卷七 §2.3 表内补两行指回卷十八 |
| org | `forcePower`、`forceValues`、`forceMorale`、`kitReadiness`、`supplyDays`（5） | 卷十三:243–246 | 卷八 §2.1 没有 | 缺列（派生） | 卷八补行指回卷十三 |
| org | `esteemTier`（1） | 卷十八:118 “person、org” | 卷八 §2.1 没有 | 缺列（派生） | 卷八补行指回卷十八 |
| skill | `minTameSeverity`、`handlerSkill`、`handlerSkillMin`（3） | 卷二十五:803 “役使类技能行（另带…三个字段）” | 卷十四 §2.2 没有 | 缺列 | 卷十四 §2.2 补行指回卷二十五 |
| knowledge | `workkind`、`artform`、`subjects`、`composer`、`workTier`、`language`、`basedOn`、`appeal`（8） | 卷二十三:148–155；卷二:1840–1844 | 卷二十二 §2.3（:142 起）只列了 family…cipher 10 项 | 缺列 | 卷二十二 §2.3 补行指回卷二十三 |
| knowledge | `arcSchool`、`arcClasses`（2） | 卷十五:185–186；卷二:1845 | 卷二十二 §2.3 没有 | 缺列 | 卷二十二补行指回卷十五 |
| knowledge | `loreAbout`、`loreClaims`、`loreMotifs`、`loreCultures`（4） | 卷十六:170–173；卷二:1847–1848 | 卷二十二 §2.3 没有 | 缺列 | 卷二十二补行指回卷十六 |
| knowledge | `technique`（1） | 卷十三:220；卷二:1846 | 卷二十二 §2.3 没有 | 缺列 | 卷二十二补行指回卷十三 |
| event_type | `family`、`triggerRX`、`weightRX`、`cooldownDays`、`stages`、`valuationRX`、`subjectKinds`（7） | 卷二:1859–1864 §5.22 | 卷二十四:186 表 C 写“卷二 §5.22 已有字段不重列” | 缺列（定义卷靠引卷二） | 卷二十四表 C 补全 7 项，含义写在本卷 |
| holding_kind（卷十八持有种类表，总根，1） | 整张表的列与行 | 全书 15 卷向它登记列或行（见下面 15 行） | 卷十八 §2（:103–208）没有这张表，只在 §2.2 族表写“条目字段见 §4.1.1”；列在 §4.1.1（:390），数据在 §4.1.5（:497） | 整表不在 §2 | 卷十八 §2 新设持有种类表一节：列全部列与全部种类行，他卷登记的含义列指回来源卷 |
| holding_kind | 列 `revival`；首批复生类种类行（2） | 卷四:775 “本卷向持有种类表（卷十八 §4.1）登记一个维度 `revival`”；卷四:1074 | §4.1.1 列表没有 `revival`，§4.1.5 也没有复生类行 | 缺列、缺行 | 卷十八补列 `revival` 与复生类行 |
| holding_kind | 列 `grantsEntry`、`entryRankMax`；进入许可、林权、矿权、渔猎许可等行（6） | 卷五:1148 Q5；卷五:735 | §4.1.1 有 grantsEntry，没有 entryRankMax；取用权各行没有 | 缺列、缺行 | 卷十八补 entryRankMax 与取用权各行 |
| holding_kind | 穿戴、装备、装入（3） | 卷三乙:1836 | §4.1.5 没有 | 缺行 | 卷十八补行指回卷三乙 |
| holding_kind | 修会成员（1） | 卷七:217 | §4.1.5 没有 | 缺行 | 补行 |
| holding_kind | 代理、宣称、可继承宣称（3） | 卷八:1300 | §4.1.5 没有宣称类行 | 缺行 | 补行 |
| holding_kind | 羁押、人质、奴役、击杀权、代理（5） | 卷八b:1193 | §4.1.5 只有 hk_custody_of 等部分行 | 缺行（至少部分） | 补行，与卷八的“代理”合并成一行 |
| holding_kind | 同意边、玩家席位边（2） | 卷九:123、:836 | §4.1.5 没有 | 缺行 | 补行 |
| holding_kind | 手持、在编（2） | 卷十三:424 | §4.1.5 有 hk_wielding、hk_enlisted，§2 没有 | 不在 §2 | 随总根进 §2 |
| holding_kind | 执业 `hk_practices`（1） | 卷十四:562、:1276 | §4.1.5 没有 hk_practices（卷十八:1315 写“已登记”） | 缺行 | 补行 |
| holding_kind | 栖物、不随继承的受咒（2） | 卷十五:1176 C15-4 | §4.1.5 有 hk_enshrined_in、hk_cursed_by，待核是否就是这两行 | 不在 §2 | 随总根进 §2，同时核对名称 |
| holding_kind | 巢居（`roles.holdings.den`，1） | 卷十六:186、:969 | 卷十八全卷没有巢居行 | 缺行 | 补行 |
| holding_kind | 搭载、挽具、关卡放行、围方放行（4） | 卷十七:825 C17-14 | §4.1.5 没有 | 缺行 | 补行 |
| holding_kind | 安装、工位占用（2） | 卷十九:1164 Q4 ③④ | §4.1.5 没有 | 缺行 | 补行 |
| holding_kind | `knows`（1） | 卷二十二:175、:874 | §4.1.1 键表有 knows 的三个键，§4.1.5 没有 knows 行 | 缺行 | 补行 |
| holding_kind | 驯养归属、照管、宠物归属、耕作权、渔猎权、牧权（6） | 卷二十五:807 | §4.1.5 有 hk_tamed_by，其余没有 | 缺行（至少 5 行） | 补行 |
| 资源种类表（表级） | 他卷登记的资源种类行 | 卷七、卷八、卷九、卷十、卷十三、卷十五、卷十八、卷二十、卷二十八（例：卷七:215 虔诚、香火；卷十八:181 威望、名望） | 卷六 §2.1（:95）只列列定义，不列行 | 表级：§2 不列他卷登记的行 | 待李白定是否要求逐行列；要的话再派脚本逐行补全 |
| 合同种类表（表级） | 他卷登记的合同种类行 | 卷八、卷八b、卷九、卷十三、卷十四、卷十五、卷十七、卷十八、卷十九、卷二十二、卷二十三、卷二十四 | 卷六 §2.4 只列合同记录字段，种类行在 §4.16 | 同上 | 同上 |
| 聚合种类表（表级） | 他卷登记的聚合种类行 | 卷八:1102 居民；卷八b、卷十、卷二十一、卷二十二 | 卷二十七 §2.2 只列列定义 | 同上 | 同上 |
| status 容器行（表级） | 他卷登记的容器行 | 卷四、卷七:216 热忱、卷十八、卷二十五 驯服、卷二十六 §2.3、卷六 | 卷二十一 §2.1 只列字段含义 | 同上 | 同上 |

## 脚本与原始输出

- `F:/dnd-tmp/book/scan-rootBF-B.mjs`：从卷二 §5.x 与定义卷 §2 对应小节（recipe 退而比卷三乙 §4.8）抽表格，按名对齐，比较派生、基础类型、单位、必填、onUnknown；另出“缺列”“回填未落”“细差”三类候选。
- `F:/dnd-tmp/book/scan-rootBF-F2.mjs`（主用，严格判据）：取各卷 §2 里写到别表的小节表格（按“表/所在表”列或小节标题定表），加全卷“登记、挂载 + 维度、字段、列、种类行”的句子，查定义卷 §2 表格首列或小节标题有没有该代号。
- `F:/dnd-tmp/book/scan-rootBF-F.mjs`（宽判据，只作参考）：只要代号在定义卷 §2 任何位置出现就算有，候选 246 条，噪声大，没有直接采用。
- 运行：`node <脚本>`。原始输出：`F:/dnd/docs/统一底层设计/审查/脚本输出/总审-根因BF-原始输出.txt`。
- 人工补入（脚本没抓到）：卷二十三 §2.2 用“所在”列（9 项）、卷二十五 §2.2 的物种、材料行、卷十三 technique、卷十八 org.esteemTier、卷二十一 crowding、卷二十五 役使技能三字段、edges 需求块、bearingDeg、持有种类表全部 15 组、4 张种类表的表级行。B 里 offense、law_code 两表的定义卷没有“必填”列，靠人工读“校验”列补出 act、offense、jurisdictionKinds、legislator 4 条。

## 判为误报的候选

**B（约 65 条）**
- 只是写法不同、含义相同：卷二把单位写进类型（如 `fraction`、`celsius`），定义卷写 `number` 并另设单位列。共 45 项：coverage、valueDensity、heatValue、ignitePoint、edibleFraction、sharpnessMax、material.wearResistance、temperament、frostToleranceC、regrowRate、massKg、wearPerUse、fragility、maxLoadKg、mealCap、appearanceRefs、gestationDays、litterSize、coord、elevationM、upkeepPerDay、laborPerDay、growthDays、miracleBudget、ethics、values、onVerbs、paramsShape、maxConcurrent、stageFlow、seatMoves、roles、upkeep、allowedTargets、item.material、categoryKind、sourceMode、necessityTier、person.culture、person.faith、person.profession、person.skills、place.culture、edges（脚本把结构体内 speedFactor 的 derived 误当整行派生）、acceptance（只多 modifiable，不在比较项）。表里 event_type 那几项是 HTML 转义 `&lt;` 或卷二写简式 `list<struct>`，不算冲突。
- “回填未落”8 项：acceptsMaterial、encumbrance、protection、thermalConductivity、office.domain、office.revoked 是定义卷新增，卷二没有同名行，不属于同名冲突（属于另一类“卷二未回填”）；substituteKey、rarity 两边都已写撤销或删除，一致。
- 解析产物 2 项：instanceDimensions（卷三乙 §2.3 是单独一节，内部各项已核对一致）；recipe.outputs（脚本退到 §4.8 误配，recipe 整表已归 F）。
- knowledge 9 项（family、prereqs、difficulty、regionGate、carriers、decayPerYear、grants、effectRef、cost）：卷二十二 §2.3 那张表只写含义和 onUnknown，不写类型，没有冲突可比。
- place.security：卷五 §2.1 表下已单独写“治安值 placeView().security …不是 place 表的维度”，已列出、口径一致。
- 脚本标“缺列”但属于 F 的各项（item 6+1、species 7、person 2、place 4、facility_type 7、recipe 16、knowledge 15、event_type 7）：已移到 F 或 B 对应行，不重复计。

**F（约 90 条，严格脚本）**
- 卷十九 §2.1 下半张表的 21 个 `facilityView().<字段>`（envelopeAreaM2…packed，其中两项另记在卷二十那行）：它们是卷十九自己入口的视图字段，不挂 place 表。
- 持有种类表的已有列名被当作新列（9 项）：bodyControl、scope、termsKeys、object、custodyStep、domicile、edge_origin、entitled、take。它们是登记行时引用的列值、键或函数，不是新列；有关的行已在 holding_kind 各组里收。
- 句子里顺带出现的代号，不是挂表的维度（约 60 项）：event_type 的 kchan、noteKnowing、meritOf；knowledge 的 familyRows、know_family、knowledge、ref、species、subjects（重复）；material 的 derived、dim、materialView、nutrient、plant_part、reaction、stress、wsum、fieldRegen（重复）；office 的 byEnum、orowk_actual（officeRowKind 卷八已列）；org.ownerRef（卷八 §2 有 `tenure`）；person 的 believers、delta、when、instantiatePerson、memberRecomputable、keyDims；place 的 bodyPart、writePath、carryFacility、deployFacility、packFacility、facilityState、owner、ref、subjectRecords、pathTypes、successorRX、termination、comp_facility、comp_enclosure、derived、slot、lawRef、plant_part、soil、modifiable（这一项实际指 crowding，已收）；recipe.revival；skill 的 mintskill、rkind、targetSkill；species 的 applies、stance、valueRX、table、weightBps、placeView，以及组件类代号 comp_lairing、comp_shifter、comp_uncanny（它们下面的维度已逐项收）。
- gen 前缀重复项 2 个（脚本把 `gen.*` 截成 `gen` 另报一次）。
