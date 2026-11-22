共 13 条，甲 0 乙 7 丙 6，有理由 1 无理由 12；另有 1 条与既有审查合并（statuses.json，见第 1 条）。
本卡读了：卷四 :115-324（§2.1–§2.5）、:355-381（§2.6 末–§2.7）；卷二 :1730-1795（§5.2 末–§5.5）、:2023-2032（§5.16 末–§5.17）；另 grep 卷四 :409、:471、:1199 判 species 表头四条派生维度。数据文件全文读了 body.json、attr.json、life.json、death.json、capacity.json、person.json、species.json、body_plan.json、status.json、statuses.json、registry.json、body-tables.mjs；data 行抽查 species_human、body_humanoid、status_death。life stages 满足 E-LIFE-STAGES（首行两下界 0、有序、成年行 relMaturityMin=1 且首成年行 relAgeMin=0），growthCurve 22 点单调升、值都在 [0,1]，body_plan 表头 capabilities 十二键 = capability 族 dimKey 全集，这几项核对通过，不计偏离。

### 1 statuses.json 仍是 tags，不是卷二 §5.17 的状态容器
- 位置：world/ontology/statuses.json:3、:8
- 设计原文：卷二 :2027「状态容器 `status`（卷二十一；首批）」、:2031「格式 §1.11（family、target、bodyPart…）」
- 代码实际：文件 kind 为 "tags"，只有一条 exposure 标签 wet；状态容器另在 world/ontology/dimensions/status.json。
- 理由：无（与既有清查同一处）
- 影响：规则缺
- 严重程度：乙
- 合并：见 docs/研究/偏离清查-1122.md:40（已计，本卡原样标注不另立新理由）

### 2 rules.body.carry 在 body.json 既无值也未登 unbuilt
- 位置：world/rules/tables/body.json:2-5；server-plugin/body.mjs（0 处读 carry）
- 设计原文：卷四 :313「`rules.body.carry` | struct{allometry…capacitySource} | §4.6」
- 代码实际：body.json 只有 integrity 与 unbuilt:["metabolism"]；registry.json:234-245 同此；_unbuilt-derived.json:63 只记 person.loadCapacityKg 因「rules.body.carry 未建」，规则表本身无处登记，server-plugin 零引用。
- 理由：无
- 影响：规则缺（承载与步速无规则可读）
- 严重程度：乙
- 合并：无

### 3 §2.5 有六组规则表键在 world/rules/tables 下无表、无 unbuilt 登记
- 位置：world/rules/tables/（无 heredity.json、diet.json、species.json、identity.json、chargen.json、tolerance.json）；world/rules/registry.json:1-667（无对应登记行）
- 设计原文：卷四 :311「`rules.heredity.minParents`」、:312「massHeritability / massResidualFactor」、:315「`rules.diet.primarySubstances`」、:316「`rules.species.temperamentAxis`」、:319「`rules.identity`」、:320「`rules.chargen`」、:321「`rules.tolerance`」
- 代码实际：这些键在五张表（及全 world/rules）都不存在，server-plugin 零引用，问题.md 的裁定/登记里也查不到。
- 理由：无
- 影响：规则缺（遗传、食性派生、性情校验、身份、建角与容差无数据可读）
- 严重程度：乙
- 合并：无

### 4 person.json 把卷四标 modifiable:true 的 26 个维度一律写成 modifiable:false（且无 stacking）
- 位置：world/ontology/dimensions/person.json:45、47-52、57、59-70、73、84-86、92-93
- 设计原文：卷四 :233 fatKg、:236 loadCapacityKg、:237 moveSpeed、:238 damageTaken、:240 forcePower、:242 代谢三率、:246 aetherCap、:247 resistReading、:250-254 医疗与体温各维、:256 preference、:257 gaugeTarget/Inflow、:258 driveWeight、:259 decisionNoise、:267 婚制/继承制、:268 descent 均写「`modifiable:true, stacking:…`」
- 代码实际：上述 26 个维度在 person.json 全部是 modifiable:false，且无 stacking、无 bounds；只有 lifespanYears、massKg、attributes、sensitivity 四维与卷文一致。
- 理由：无（问题.md、裁定、勘误均查不到）
- 影响：规则缺（修正项在这些维度上无处登记，读到的是未加修正的值）
- 严重程度：乙
- 合并：无

### 5 person.attributes 的钳位 [0,100000] 未改读已建成的 rules.attr.bounds [0,99]
- 位置：world/ontology/dimensions/person.json:21；world/rules/tables/attr.json:3
- 设计原文：卷四 :222「`attributes` … 取值域 `rules.attr.bounds`」
- 代码实际：person.json 的 bounds 仍是 [0,100000]，source 自述「rules.attr.bounds 卷文只给形状未建，钳位暂取维度取值域上界」；attr.json:3 已按 P-17 落 [0,99]（grade referenced）。
- 理由：无（docs/问题.md:972 只登记了「没人核 clamp ⊂ bounds」，未覆盖钳位值本身仍是旧占位）
- 影响：读数错（属性可写到规则上限 99 之外）
- 严重程度：乙
- 合并：无

### 6 person.sensitivity 的钳位 [0,1000] 比卷文的 [0,100] 宽十倍
- 位置：world/ontology/dimensions/person.json:36；world/ontology/dimensions/species.json:50
- 设计原文：卷四 :232「`sensitivity` … 物种分布的 clamp」、:153「非空值 clamp ⊂ [0, 100]」
- 代码实际：person.json bounds 为 [0,1000]；物种 pharmSensitivity 的取值域是 [0,100]，个体值由它采样，理应落在同一钳位内。
- 理由：无
- 影响：规则缺（越界敏感度不被拦）
- 严重程度：乙
- 合并：无

### 7 person 表头缺 commandBonus 一维
- 位置：world/ontology/dimensions/person.json:15-97（无 commandBonus）
- 设计原文：卷四 :241「`commandBonus` | derived map<目标键, number> … 键集 = 卷十三 R13-14.3 的三个目标键」
- 代码实际：person.json 与 _unbuilt-derived.json 都没有这一维。
- 理由：见 docs/问题.md:404（键族卷文没给代号，登记未写完）
- 影响：只是形式（卷十三指挥系统未建）
- 严重程度：丙
- 合并：无

### 8 person 表头缺 profession 与 experience 两维
- 位置：world/ontology/dimensions/person.json:15-97（两维都没有）
- 设计原文：卷四 :228「`culture` / `faith` / `profession` … profession derived」、:261「`experience` | number score …」
- 代码实际：person.json 有 culture、faith、primaryProfession、level，但没有 profession 与 experience；_unbuilt-derived.json 也没有登记这两维。
- 理由：无
- 影响：只是形式（两维的写者卷十四未建，但表头声明也缺）
- 严重程度：丙
- 合并：无

### 9 person.identityKeys 的 required 写成 never（卷文 always）
- 位置：world/ontology/dimensions/person.json:44
- 设计原文：卷四 :235「`identityKeys` … | always | error」
- 代码实际：person.json required 为 never、onUnknown error。
- 理由：无（仅 _unbuilt-derived.json:60 自述「原句 always，派生维度按未建派生登记」，非裁定）
- 影响：只是形式（身份系统未建）
- 严重程度：丙
- 合并：无

### 10 person 表头多出 living 一维
- 位置：world/ontology/dimensions/person.json:28
- 设计原文：卷四 :119「本卷定义的、他卷登记在本卷表上的、派生的维度都在表里各占一行」（§2.3 :208-275 无 living 行）
- 代码实际：person.json 声明 living（source 卷四 :39，owner 卷六），§2.3 表里没有它。
- 理由：无（仅 _unbuilt-derived.json:55 登记其数据缺口）
- 影响：只是形式
- 严重程度：丙
- 合并：无

### 11 物种 birthIntervalDays 的加载校验没有实现
- 位置：world/ontology/dimensions/species.json:17；server-plugin/kernel/validate/body-tables.mjs:194-218（无此检查）
- 设计原文：卷四 :134「≥ max(`gestationDays`, 1) … 加载校验，不满足即加载失败」
- 代码实际：species.json 只写 domain [1,null]；body-tables.mjs 只核组织、属性键集、gaits、maturityYears≠0、sexes 权重和、dietShares，全 server-plugin 无 birthIntervalDays 引用。
- 理由：无
- 影响：规则缺（可写入小于妊娠期的生育间隔）
- 严重程度：乙
- 合并：无

### 12 species 表头多出四条派生维度，卷四 §2.1 没有它们
- 位置：world/ontology/dimensions/species.json:18、:21、:40、:46
- 设计原文：卷四 :119「派生的维度都在表里各占一行」；§2.1 :125-186 无 bodyDensity、bodyVolumeL、meanMassKg、sizeClass
- 代码实际：species.json 声明四维，source 写 §4.1.3 S-3；卷四 :471 定义了它们、:1199 回填表也列了「派生 meanMassKg, bodyDensity, bodyVolumeL, sizeClass」，但 §2.1 表没补行。
- 理由：无（数据依据在 §4.1.3，卷文 §2.1 自身漏行）
- 影响：只是形式
- 严重程度：丙
- 合并：无

### 13 species 三处取值域下限比卷文宽，0 被放过
- 位置：world/ontology/dimensions/species.json:24（carryMult）、:32（gaits 值）、:52（renewables.storeDays）
- 设计原文：卷四 :148「carryMult … `(0, 10]`」、:147「非空值属于 `(0, 20]`」、:145「`storeDays` > 0」
- 代码实际：表头分别是 [0,10]、[0,20]、[0,null]；body-tables.mjs 与全 server-plugin 没有对这三处 0 值的拦截。
- 理由：无
- 影响：规则缺（0 不必等于卷文的空值语义，可按合法值读入）
- 严重程度：丙
- 合并：无

## 键的使用者（卡④第 4 项：server-plugin 下零引用列出，不单独计条）
- 有生产引用的 §2.5 键：rules.body.integrity.lostBelow（body.mjs:68-72；death.mjs:122）、rules.body.metabolism（species.mjs:21，经 unbuilt 读）、rules.life.stages（life.mjs:63-73，取表在 :69）、rules.life.growthCurve（life.mjs:133）、rules.terminate.records（kernel/terminate.mjs:279-280）、rules.death.terminalStatus / lostPartsExcluded / corpseClass（death.mjs:217、:110、:180）；rules.capacity.awakeMin/full/limited（action-capacity.mjs，设计原文在卷二 §2.5，不在本卡范围）。
- 零引用、已登 unbuilt（属已登记未建，不另计）：rules.attr.modCurve、rules.attr.agingCurves、rules.life.earlyHazard、senescenceHazard、hazardByLiving、fertilityCurve、fertilityByLiving、naturalCause、gestationStatus、birthplaceClass、rules.death.vitalLossCause。
- 零引用、未登规则表 unbuilt：rules.body.carry（第 2 条）、rules.attr.bounds（问题.md:972 已登记没人核）、rules.heredity.*、rules.diet.primarySubstances、rules.species.temperamentAxis、rules.identity.*、rules.chargen.*、rules.tolerance.*（第 3 条）。
- §2.5 五张表的每个值都有 source 与 basis，无缺栏。

## 已登记未建
- 状态容器表头只有 family 一维（status.json:8），缺 §5.17 :2031 的 target、severity、stages（always）与 bodyPart、contagion、immunity、tendable、sources、duration（never）；登记处 docs/卡回报/ds-b6-5.md:28「表头只有 family 一个维度，行内容归卷二十一」。
- status_family 族只有 sfam_dead、sfam_sleep、sfam_unconscious 三条（_vocab.json:2706-2708），§5.17 :2031 首批 17 族缺 injury、bleeding、infection、disease、intoxication、addiction、hunger、thirst、fatigue、exposure、magical、mental、morale、fervor；登记处同上 ds-b6-5.md:28（三条首批赋值）。
- death.json 的 unbuilt 里 corpsePurpose 是卷文没有的新键（death.json:33），登记处 docs/问题.md:397；读取即拒收，不静默放过。
- body.json 的 metabolism、attr.json 的 modCurve/agingCurves、life.json 的八个背景死亡/生育/妊娠/出生地键都登在各自 unbuilt 行，行内 source/basis 齐全。

## 拿不准
1. capacity.json 的设计原文在卷二 §2.5 :510，不在本卡 ① 给的卷:行里，本卡未比对；其三个键在 action-capacity.mjs 有真实读者。
2. §2.7 的 17 个错误码：body-tables.mjs 实现 E-BODY-PLAN-SHAPE、E-BODY-TISSUE-KEYS、E-BODY-CAP-CYCLE、E-SPECIES-ATTR-KEYS，life.mjs 实现 E-LIFE-STAGES，person.mjs 实现 E-PERSON-SEX；其余 11 个只在 kernel/error-codes.mjs:98-99 登记、全仓无抛出点。卡文说「这张卡查数据，不是代码」，且触发规则多未建，未计为偏离，交主会话判是否另卡。
3. person.workPriority 的 required/onUnknown 卷四 :275 写「见卷六」，本卡没读卷六 §4.11.1，未判 never/gap 是否合卷文。
4. species_human 的 sexes、crossbreeds 用 null 值表示「键不存在」（species.json:101-102），合卷二 §1.6 第 4 项与 body-tables.mjs:13-16 的 presentKeys 口径，不判为偏离。
5. statuses.json 的 wet 是附录 A §A.18 的 exposure 标签，不是 status_family 条目；它是否该并入 §5.17 容器体系，本卡给的卷二范围里判不出。

## 跨卷待判
1. person.location：卷四 :272 仍把 location 列为 `ref place | always | error`，卷二 §5.5 :1793（第十八版）明写「表头里没有 `location`，person 行写了即报未知字段」；person.json 按卷二不做 location、改 pos/facing。要两卷对读才能定哪条作废。
2. person.damageTaken：卷四 :238 取值域是 `[0, rules.combat.taken.max]`，但 world/rules/tables 下没有 combat 表，person.json:52 只写 [0,null]；需卷十三给出 rules.combat.taken。
3. status_family 的 14 个缺失族（见已登记未建）属卷二 §5.17 与卷二十一状态内容的分界，归主会话决定由卷二十一内容卡补还是本卷勘误。
