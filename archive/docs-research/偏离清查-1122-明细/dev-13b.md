共 11 条，甲 0 乙 8 丙 3，有理由 1 无理由 10。

本卡读了：卷八 §2.1–2.3 :117-209、§2.4 :210-301、§2.6 :322-409、§2.7 :410-427、§5.3 相关行 :1397；卷二 §5.8–5.10 :1869-1913、§5.16 :2011-2026；卷八b §2.1 :143-160、§2.2 :161-220、§2.4 :229-263、§2.6 :290-381、§5.3 :1222-1284；卷十八 §2.4 :226-270。文件：world/rules/tables/polity.json 全、control.json 全、social.json 全；world/ontology/dimensions/polity.json 全、org.json 全、office.json 全；world/ontology/offenses.json 全、obligations.json 全；world/rules/registry.json :636-665；server-plugin/kernel/title.mjs、gen/polity.mjs、gen/worldgen.mjs、gen/assetcalls.mjs、opening-people.mjs、validate/polity-tables.mjs、sim-tiers.mjs 相关行。未读：卷八 §2.8 错误码表之后、卷八b §4 子系统正文、卷十八 §2.4 以外的节；卷八b §2.6 的 62 个 law.* 键未逐键比对（② 所列数据里没有 law 表，本卡不越范围替它判）。

### 1 polity.roles.kinds 只登了 governs 一项
- 位置：world/rules/tables/polity.json:3-10；world/rules/registry.json:641
- 设计原文：卷八:326「`polity.roles.kinds` | struct{member, officeHolder, acting, appoints, governs, administers, fief, claims, claimsHeritable, allied, citizen: ref vocab holding_kind}」
- 代码实际：值只有 `governs`；registry 里该键的类型也只声明 `required:["governs"]`，另十项未登；title.mjs:33 只读 governs。
- 理由：无。文件 basis（polity.json:9）自述"该结构的其余句柄由各自用到它的卡补"，仅自述，问题.md 与裁定里无对应条目。
- 影响：规则缺。将来读 `rolesKinds.member` 等键的规则拿不到句柄，只能各自写字面量或抛错。
- 严重程度：乙
- 合并：无

### 2 §2.6 的 56 个 polity.* 键只登了 5 个，47 个既无值也未登 unbuilt
- 位置：world/rules/tables/polity.json:2-59；world/rules/registry.json:650
- 设计原文：卷八:332「`polity.motion.maxOpenPerOrg` | integer ≥ 1 | 同一组织同时开着的议案上限」（:322-409 共 56 个 polity.* 键）
- 代码实际：有值的只有 roles.kinds、roles.purposes、hold.forcibleCauses、gen.settlementKind、gen.holdCause 五个；gen.realmRows、gen.openTiers、settle.demoteDays、settle.reopenDays 四键列在 unbuilt；其余 47 键（motion.*、office.*、title.*、domain.*、legit.*、tax.*、feudal.*、faction.*、diplo.*、alliance.*、war.*、court.*、influence.* 等）既无值也未列 unbuilt。registry.json:650 却写"其余键卷文没给值，登在 unbuilt"。
- 理由：无（registry 的自述不算裁定；问题.md、裁定里 grep 不到这些键名）。
- 影响：规则缺。将来读到这些键会抛 E-RULES-UNREGISTERED，而不是按未建返回未知。
- 严重程度：乙
- 合并：无

### 3 §2.6 的 12 个 pop.* 键没有任何数据表
- 位置：world/rules/tables/polity.json（无）；world/rules/registry.json（无 pop 条目）
- 设计原文：卷八:389「`pop.migration.remDenominator` | integer ≥ 1 | 统计层迁出余数的分母」（:382-393 共 12 键，:322 定路径 `world/rules/tables/pop/`）
- 代码实际：无 `world/rules/tables/pop/` 目录、无 pop 表、registry 无注册项；12 键在 server-plugin 下零引用，也无 unbuilt 登记。
- 理由：无。
- 影响：规则缺。人口生死、迁徙、承载力全部无常数可读。
- 严重程度：乙
- 合并：无

### 4 genSettlementKind、genRealmRows 的取值域附加条件没有加载校验
- 位置：world/rules/tables/polity.json:20-26；server-plugin/kernel/validate/polity-tables.mjs:55-58
- 设计原文：卷八:376「`polity.gen.settlementKind` | ref vocab orgkind；所指条目 `settlement` 须为真、`internal` 须为假」
- 代码实际：校验器只核了 `genHoldCause` 不在 `holdForcibleCauses`（:56-57）；没有核 genSettlementKind 所指条目的 settlement/internal。卷八:375 对 `genRealmRows` 的「`orgKind` 所指条目 `sovereign` 须为真」同样无人核（该键本身未建）。
- 理由：无。
- 影响：规则缺。换错种类条目会静默通过，开局把聚落建成不征税的内部团体或把主权组织建成非主权种类。
- 严重程度：乙
- 合并：无

### 5 genIdSlots 是卷文没有的规则表键
- 位置：world/rules/tables/polity.json:27-34；world/rules/registry.json:645
- 设计原文：卷八:1267「id 由卷十 `instanceIdOf` 经本卷照卷十 R10-12.4 自加的三条位次给出（§5.3）」；§2.6 :322-409 没有 genIdSlots 这个键
- 代码实际：自拟了 `polity.genIdSlots`（realm/settlement/office 三个 idslot 句柄），basis 自述"键名 genIdSlots 是本卡自拟的规则表键（卷八 §2.6 没列），须李白认或改名"；gen/polity.mjs:56、:64 依赖它。
- 理由：无（仅 basis 自述）。
- 影响：规则缺。规则表里出现设计没有的键，须补勘误或由李白认，否则下一位读者无法从卷文判断它合法。
- 严重程度：乙
- 合并：无

### 6 org 维度表缺 priceRule 一列
- 位置：world/ontology/dimensions/org.json:18-41（dimensions 段无 priceRule）
- 设计原文：卷八:137「`priceRule` | list<struct{match: rx, modifier: ref}> | — | 修正项目标只许是卷六登记的价格槽；空表即没有定价规矩 | always | error」
- 代码实际：org.json 无此维；全仓（world/、server-plugin/、_unbuilt-derived.json）grep `priceRule` 零处。
- 理由：有。问题.md:823「org.priceRule 列未建（卷八 :137，必填 always）……等卷二补类型写法再建列。建之前组织行（含手写与生成行）都不写它」。
- 影响：规则缺。组织行的团体定价规则（R8-14.6）无存储处。
- 严重程度：乙
- 合并：无

### 7 control.json、social.json 的行缺 source 字段
- 位置：world/rules/tables/control.json:3-7；world/rules/tables/social.json:3-19
- 设计原文：卷九:321「`rules.control.seatKind` | ref vocab holding_kind | 本卷登记的玩家席位边种类」；卷十八:239「`orgTraits` | map<ref vocab orgkind, struct{domestic, descentGroup: boolean}>」
- 代码实际：两表各只有一行，行内只有 basis，没有 source；本仓库其余规则表每行 source+basis 齐全（如 body.json:3）。出处只混写在 basis 长句里。
- 理由：无。
- 影响：只是形式（出处仍可读，但不合统一的行字段格式，核出处时机器读不到 source）。
- 严重程度：丙
- 合并：无

### 8 polity.json 的 unbuilt 键零引用
- 位置：world/rules/tables/polity.json:52-58
- 设计原文：卷八:322「§2.6 规则表（常数只在这里；路径 `world/rules/tables/polity/` 与 `world/rules/tables/pop/`）」（卷文没有 unbuilt 键；它是本仓库规则表的通用登记约定）
- 代码实际：`unbuilt` 里列的四键（genOpenTiers、genRealmRows、settleDemoteDays、settleReopenDays）没有被任何代码按 unbuilt 查；worldgen.mjs:116 直接读 `polity.genRealmRows`/`genOpenTiers`（undefined），gen/polity.mjs:53-62 按缺口整段 deferred。其余现存键都有真实读者（rolesKinds→title.mjs:33；holdForcibleCauses→title.mjs:131、validate:56；genSettlementKind→gen/polity.mjs:58；genIdSlots→gen/polity.mjs:56、:64；genHoldCause→gen/assetcalls.mjs:35、opening-people.mjs:60；rolesPurposes→gen/assetcalls.mjs:34；control.seatKind→sim-tiers.mjs:46；orgTraits→opening-people.mjs:61、gen/worldgen.mjs:76、validate:62）。
- 理由：无。
- 影响：只是形式（登记了但无人按它判未建，未建口径实际走生成器的 gaps）。
- 严重程度：丙
- 合并：无

### 9 规则表文件布局与卷文所定路径不符
- 位置：world/rules/tables/polity.json:1；world/rules/registry.json:638
- 设计原文：卷八:322「路径 `world/rules/tables/polity/` 与 `world/rules/tables/pop/`」；卷八:379「`polity.motion.transitions` …（文件 `polity/motion.json`）」
- 代码实际：用平铺的 `tables/polity.json` 一个文件；没有 `polity/`、`pop/` 目录，`polity/motion.json` 不存在（transitions 等 47 键因此全缺）；registry 按 code+file 加载平铺文件可跑，所以只是布局不同。
- 理由：无。
- 影响：只是形式（加载器不受影响，但与卷文路径对不上，按卷文找文件的读者会扑空）。
- 严重程度：丙
- 合并：无

### 10 offenses.json 不是卷八b §2.1 的 offense 表格式
- 位置：world/ontology/offenses.json:6-210（首条 :8-13）
- 设计原文：卷八b:147「`mode` | enum offmode | — | 封闭两项（事件类、状态类） | error | 卷零火器结论 | 必填」；:152「`severityBase` | score | — | [0, 100] | error | 同上 | 必填」
- 代码实际：37 条全是 `{id, label, source, act?, against?, broader?}`；`mode`、`stateRX`、`severityBase`、`intentRequired`、`victimKinds`、`privateOnly`、`loadWeight`、`narrower` 全部缺失（逐键 grep 零处）；29 条既无 act 也无 stateRX；`against` 是 `{permit:"mental_magic"}` 对象（卷八b:149 要求 rx）；`broader` 写 `offense:theft` 前缀（:138、:145、:152、:159、:166、:173），不是行 id；`label` 写中文显示名，与卷二 §1.9 的语言边界相反。
- 理由：无（迁移体检 块1-P-2 的 P2-12 只登记"offenses → 块 7 卷八b 转换"，没给这些字段缺口的裁定）。
- 影响：规则缺。这张表若被当作 offense 表读，必填维一个都取不到。
- 严重程度：乙
- 合并：无加载器一项合并 docs/研究/偏离清查-1122.md:130（第 1 组），此处只补格式差异。

### 11 offenses.json 的 act 取值不是 verb 族代号
- 位置：world/ontology/offenses.json:12、63、137、144、151、158、165、172
- 设计原文：卷八b:148「`act` | ref vocab verb nullable | — | 动作落定后的事实动词 | error | 卷二 §5.16（罪名 `offense`） | 事件类必填；状态类必空（E-OFF-MODE）」
- 代码实际：act 取 `take`、`cast`、`enter`、`destroy`、`gather`、`use`、`detain` 七个裸词；world/ontology/dimensions/_vocab.json 的 verb 族是 `verb_` 前缀代号（conquer、usurp、opening 等 18 条，无这些词），旧 world/ontology/verbs.json 也只有 cast、detain，缺 take/destroy/gather/use/enter。
- 理由：无。
- 影响：规则缺。按 `ref vocab verb` 校验时七条罪名全部指不到条目。
- 严重程度：乙
- 合并：同上，无加载器合并偏离清查-1122.md:130；随 P2-12 转换时一并定代号。

## 已登记未建
- offenses.json、obligations.json 无运行时加载器：kernel/load/world.mjs 只载 dimensions/、_vocab.json、state-owners.json、primitives.json、named-structs.json。已记在 docs/研究/偏离清查-1122.md:130（第 1 组），不重复计。
- offenses.json 的表格转换：docs/迁移体检/块1-P-2.md:24 的 P2-12 登记"offenses → 块 7 卷八b"，本条只把转换前的对照差异记在第 10、11 条，不另立卡。

## 拿不准
1. obligations.json（25 条，字段 schedule/handover/onDebtorGone/aliases，属旧卷六义务族形状，world/ontology/obligations.json:6-285）相对卷八b 无可对照项：卷八b §2.4 :263 与 §5.3 :1229 只向卷六登记合同种类族、义务族的条目名，不在本文件定义字段。它相对卷八b 算不算偏离，本卡推不出，需卷六义务族卡定字段后重判；无加载器一项已合并第 1 组。
2. 开局世界行留空/填 0：polity_realm_main（world/ontology/dimensions/polity.json:36-48）的 taxRules、councilOffices、casus、influenceSources 皆空，domainLimitBase 写 0，org.json 的职位行一个都未建（rows:{}）。卷八允许空集与 0，但税、御前职位、宣战理由、影响力、直辖在开局世界都不可达；是"本阶段未建"还是数据缺口，卷文与问题.md 都没登记，拿不准。
3. control.json 只含卷九 R9-3.9 的 seatKind（world/rules/tables/control.json:4-6），与卷八 §2.6 无对应键；本卡按 ② 列入，但相对卷八 §2.6 没有可比项。它与卷九 §2.5 :321 的类型（ref holding_kind）一致，未见偏离。

## 跨卷待判
1. offenses 的字段以卷八b §2.1 为准还是以卷二 §5.16 草案为准，卷八b:141 写"与草案不同之处列在 §5.2 交卷二收尾对齐"；要读卷二 §5.16 与卷八b §5.2 两卷才能判该对齐项是否已落（本卡只按卷八b 判，故第 10 条按乙记）。
2. org.json 的 forceValues 存为 integer/count（world/ontology/dimensions/org.json:27），卷八:144 写"定点，标度 `rules.combat.force.valueScale`"；标度归卷十三 §4.10，卷十三未建，是形式差异还是读数错要卷十三定标度后才能判。
