# 偏离清查 04e（卷三甲/乙，规则表数据）

共 5 条，甲 0 乙 0 丙 5，有理由 3 无理由 2；另有「已登记未建」的规则表键 8 组 39 个（见末节）。

本卡读：卷三乙 :322-364、:1027-1123；卷三甲 :221-224、:406-452、:453-493；参照卷二 §1.7 :279-284。数据表通读：world/rules/tables/ 的 materials.json、items.json、containers.json、quality.json、wear.json、rot.json、crafting.json、modifiers.json、capacity.json。代码按需读：server-plugin/kernel/ 的 item.mjs、item-state.mjs、valuation.mjs、dimension-writers.mjs、recipe.mjs、validate/dimensions-validate.mjs；world/ontology/dimensions/ 的 material.json、item.json、_unbuilt-derived.json、_vocab.json；world/rules/registry.json。未读：卷三乙 :707-722（核对值表）、:566-631（§4.1.1 首批值）；卷二 §3.3 全文；未通读两卷全文。

---

### 1 modifiers.json 的 stackingTable 行缺 grade、basis
- 位置：world/rules/tables/modifiers.json:3
- 设计原文：本卡 ③「每个值带 file、grade、source、basis……缺 source 或 basis 的行，记」；卷二 §1.7 :283「类别行与实例行带 `basis`（一句理由）」。
- 代码实际：该行只有 key、value、file、source 四项，无 grade、无 basis。
- 理由：无（docs/审查/李白裁定-1117.md、docs/问题.md 未见此条；卷二 §3.3 :1356 只给公式）。
- 影响：只是形式（出处与标定不全，估值/维度求值不读它，不影响读数）。
- 严重程度：丙
- 合并：无

### 2 多张表 source 的行号指向错位条目（普遍早 4～11 行）
- 位置：world/rules/tables/materials.json:6、:69、:76、:83、:108；items.json:110、:124、:132；crafting.json:8、:16；containers.json:8；quality.json:8、:24
- 设计原文：卷三乙 §2.5 :326「rules.materials.strengthSummary」、:327「charReaction」、:330「substanceClass」、:334「grainPart / grainCarbMin / grainFamily」、:336「materialClassMin」、:338「sizeClasses」、:341「staticStateOrder」、:345「rules.crafting.*」、:354「rules.containers.*」；§4.4.3 K-2 :1045；§4.5.1 :1079、tiers :1082、Q-6 :1098。
- 代码实际：source 行号与当前卷文不符——substanceClass 引 :326（实际 :330）；grainPart、grainCarbMin、grainFamily 各引 :330（实际 :334）；materialClassMin 引 :332（实际 :336）；sizeClasses 引 :334（实际 :338）；staticStateOrder 引 :337（实际 :341）；laborRate、valueAdd 各引 :341（实际 :345）；maxNesting 引 :349（实际 :354）；containers 引 K-2 :1036（实际 :1045）；quality 引 §4.5.1 :1070/:1071（实际 §4.5.1 :1079、tiers :1082）、Q-6 :1090（实际 :1098）；charReaction 引 :323（该行是 §2.5 标题，条目在 :327）。
- 理由：无（未见裁定或问题条目解释此偏移；像卷文插行后未回改）。
- 影响：只是形式（按行号核对时引不到该键；键与值本身正确）。
- 严重程度：丙
- 合并：无

### 3 gasBoilMax 表里有、§2.5 键清单没有
- 位置：world/rules/tables/materials.json:33-37
- 设计原文：卷三乙 §2.5 :322「规则表（常数只在这里；键名即代号）」，其键清单 :326-:356 未列 gasBoilMax；另卷三乙 §4.1.5 :716「`rules.materials.gasBoilMax` | 20（封卷后勘误 1121k13；暂定·待试玩标定）」。
- 代码实际：materials.json 有 `gasBoilMax: 20`，matcatRules 第 9 条（materials.json:98）读它；registry.json:438 登记为规则表键。属「表里有而 §2.5 目录没有的键」。
- 理由：有（封卷后勘误 1121k13，卷三乙 :716；docs/卡回报/g6-finecell.md:109）。
- 影响：只是形式（§2.5 目录漏列，值已在卷文与 registry 登记并在用）。
- 严重程度：丙
- 合并：无

### 4 各表的 `unbuilt` 伪键不在 §2.5 键清单
- 位置：world/rules/tables/items.json:136、quality.json:28、wear.json:26、rot.json:28、crafting.json:20、containers.json:4
- 设计原文：卷三乙 §2.5 :322「键名即代号」；键清单 :326-:356 无 unbuilt。
- 代码实际：六张表各有一 `unbuilt` 键，值是本表未建的键名列表（items.json:136 另含 §2.5 未列的 instanceLotPointer、wearPerUseResolution）；registry.json 把 unbuilt 登记为结构键（:483、:498、:516、:527、:540 等）。
- 理由：有（registry.json 结构键；item.mjs:8「键在 rules.items.unbuilt（卷文无首批值）即未给，按未知带缺口，不编数（卷二 §1.6）」）。
- 影响：只是形式（未建登记机制，不是规则数据）。
- 严重程度：丙
- 合并：无

### 5 charReaction 有值无使用者
- 位置：world/rules/tables/materials.json:3-9
- 设计原文：卷三乙 §2.5 :327「`rules.materials.charReaction`｜哪个反应代号是炭化（供 `charYield` 派生）」。
- 代码实际：值 reaction_char 已在表；server-plugin 下 grep `charReaction` 零命中；其唯一读者 charYield 属未建派生五项（world/ontology/dimensions/_unbuilt-derived.json:5-6 以 hardness/toughness 同类登记）。属卡 ③「零引用、无使用者」。
- 理由：有（李白裁定-1117.md:1049、:1226；_unbuilt-derived.json:5-6）。
- 影响：规则缺（charYield 未接，暂未出错）。
- 严重程度：丙（未建已登记）
- 合并：无

---

## 已登记未建（不计入上面 5 条）

下列键卷三乙 §2.5 要求、九张表中没有作独立键（只在 unbuilt 数组或 registry 注记里登记），代码按未知带缺口交出，均有登记处：

1. **rules.materials.strengthSummary**（1）：卷三乙 §2.5 :326；登记 world/ontology/dimensions/_unbuilt-derived.json:5-6（hardness/toughness 行 note 指明缺 strengthSummary 权重）；理由 李白裁定-1117.md:1049、:1226；materials.json 与 registry materials type 均无此键。
2. **rules.items.sourceRules、transportRules**（2）：卷三乙 §2.5 :329、C-2 :994、§4.18 :1817；登记 _unbuilt-derived.json:38（sourceMode）、:41（transportMode，「RX 无 first，规则表未建」）；items.json 与 registry items type 均无。
3. **rules.items.materialCompMin、fuelHeatMin、fuelFlammabilityMin、saltContentMin、saltNutrient**（5）：卷三乙 §2.5 :339、:340；登记 registry.json:486「随读者卡登记」；items.json 的 unbuilt 未列此 5 键。
4. **rules.containers.maxNesting**（1）：卷三乙 §2.5 :354；登记 containers.json:4、registry.json:529。
5. **rules.quality.botchTier、thresholds、inputWeight、toolBonus、marginWeight**（5）：卷三乙 §2.5 :343-:344；登记 quality.json:28、registry.json:543。
6. **rules.wear.faultCurve**（1）：卷三乙 §2.5 :348；登记 wear.json:26、registry.json:519。
7. **rules.rot.rotReaction**（1）：卷三乙 §2.5 :351；登记 rot.json:28、registry.json:501。
8. **rules.crafting 余 23 键**（23）：careRange、careTimeCurve、careQualityCurve、careMasteryCurve、maxTimes、materialDifficultyScale、masterySpan、difficultyTimeCurve、masteryTimeCurve、skillYieldCurve、minPortion、residueReaction、emphasisCostRelief、improvise、failHard、botchDurabilityCurve、failureSalvageCurve、forgeMinMelt、forgeMalleabilityMin、haftToughnessMin、haftBendMin、edgeHardnessMin、edgeSharpnessMin（laborRate、valueAdd 已在表）；卷三乙 §2.5 :345；登记 crafting.json:20、registry.json:59。

已核：表内现有数值键的取值域均落在 registry domain 与卷文区间内（materials.json registry.json:452；items materialClassMin [0,1] registry.json:485，值 0.5；rot mergeMaxGap [0,1] registry.json:500，值 0.05；volatileMin、grainCarbMin、grainMoistureMax 均在 [0,1]）。quality.tiers 七档齐全、baselineTier（quality_normal）在 item.valueBase 列为 0、乘子沿档位序单调不降（Q-6）；wear.levels 五档 minDurability 0.8/0.6/0.4/0.2/0 严格递减、最低档为 0（D-6）；rot.stages minSpoilage 0/0.2/0.5/1 严格递增、首档 0（P-3/P-7）。matcatRules 九条与卷三乙 :576「首批八条 + 封卷后勘误 1121k13 第九条（气体）」数目相符，每条 when 都读一个 substance 以外的维度（:331），阈值键引用（charDecomposeMin、charHeatMin、fatMeltMax、fatHeatMin、volatileMin、grainMoistureMax、grainEnergyMin、grainCarbMin、grainPart、grainFamily、gasBoilMax）与 §2.5、:333-:334、:340 的描述一致；matcatRules 由 material.json 的 ruleIndex（table=materials、key=matcatRules）在生产加载期读取（validate/dimensions-validate.mjs:541-543）。

## 拿不准

- 首标定值（charDecomposeMin=1000、charHeatMin=25、fatMeltMax=200、fatHeatMin=30、volatileMin=0.005、grainMoistureMax=0.15、grainEnergyMin=17、grainPart=ppart_seed、grainCarbMin=0.55、grainFamily=pfam_poaceae）的核对值表在卷三乙 :707-722，不在本卡给的卷:行范围，未逐值对卷文；只按 registry domain 与卷文区间核过。
- materials.json 除 substanceClass 外 13 行无 `file` 字段。本卡 ③ 只要求缺 source/basis 才记，故未计条数；若 file 视为必填，这 13 行皆缺。
- modifiers.json 的 stackingTable 属卷二 §3.3 :1356 的修正叠加表，是否算「与物品有关的键」可议；按「物品维度的修正也走此表」收入。
- rot.json、wear.json 引的 §4.10/§4.12 行号不在本卡读范围，未核其 source 行号准确性。
- capacity.json 的 awakeMin/full/limited 属卷二 §2.5 行动能力阈值表，无卷三乙 §2.5 键，本卡未记偏离。

## 跨卷待判

无。
