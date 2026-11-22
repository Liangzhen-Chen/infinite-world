# 偏离清查 04d（卷三乙：物品写者、配方、格存量）

共 4 条，甲 0 乙 4 丙 0，有理由 0 无理由 4。

本卡读到的卷:行：卷三乙 :360-534（卡给 :369-421、:438-490、:491-527；另多读 :422-437，因 recipeView 比对需 §3.1 :430 一行）、:1020-1079（卡给 :1027-1076）。
本卡读到的文件:行：server-plugin/item-lots.mjs:1-166、server-plugin/item-condition.mjs:1-48、server-plugin/kernel/recipe.mjs:1-219、server-plugin/kernel/grid-stock.mjs:1-121、server-plugin/kernel/dimension-writers.mjs:1-213。
为查前提与查重另读：world/ontology/dimensions/item.json:95-122、world/ontology/dimensions/recipe.json:11-50、world/ontology/state-owners.json:14-48、world/rules/tables/rot.json:24-34、world/rules/tables/wear.json:20-31、docs/研究/偏离清查-1122.md、docs/研究/公共部件审查-乙-1122.md。
没读到的：kernel/item-state.mjs（lotMergeVerdict、lotsView、rotStep 等判据）、kernel/ledger.mjs（批次拆并与 taint 写）、kernel/item.mjs、kernel/validate/* 全文；卷三乙 §2.2、§2.3、§4.7-§4.12 正文（只据本卡给的 §3.3、§4.4 与数据表核对）；卷五 §4.7（grid-stock 公式的出处）未读。grid-stock.mjs:1-121 已读完，按卷三乙 §4.4 未发现偏离。

---

### 1 配方产物 `materialFrom` 的加载校验未做（R-3）
- 位置：server-plugin/kernel/recipe.mjs:136-180
- 设计原文：卷三乙:381「`outputs[].materialFrom` … 键集合 = 产物模板参考组成的组集合；值是 `consumed` 为真的输入组序号（R-3 加载校验）」
- 代码实际：checkRecipeTable 逐行只核 qty、yield×wasteFraction、gradeFrom、Q-2、R-12；全仓 grep `materialFrom` 0 处，键集合与"consumed 为真"两样都不核，坏配方行照样加载。
- 理由：无（仅代码注释自述"材料继承…归后卡"；裁定-1117.md:1207 丙1 选 A 只按"估值要读的子集"前移，未点名这条加载校验）
- 影响：规则缺（加载期放过非法材料来源；craftOutcome 建好后才会炸在运行期）
- 严重程度：乙
- 合并：无

### 2 配方产物 `templateFrom` 的加载校验未做（R-2）
- 位置：server-plugin/kernel/recipe.mjs:136-180
- 设计原文：卷三乙:382「`outputs[].templateFrom` … 所指输入组须 `consumed` 为假、`per` 为 `piece`（R-2）」
- 代码实际：checkRecipeTable 不看 `templateFrom`；全仓 grep 0 处，所指组号越界、组被消耗、per 不是 piece 都放过。
- 理由：无（仅注释自述"材料继承…归后卡"）
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 3 配方产物 `attachTo` 的加载校验未做（R-2 同法）
- 位置：server-plugin/kernel/recipe.mjs:136-180
- 设计原文：卷三乙:383「`outputs[].attachTo` … 所指输入组须 `consumed` 为假、`per` 为 `piece`（与 `templateFrom` 同一约束，否则加载期报错，R-2 同法）」
- 代码实际：全仓 grep `attachTo` 0 处；卷文明写"加载期报错"，checkRecipeTable 未核。装饰配方（卷二十三 R23-2.1）一写错组号，加载不报。
- 理由：无（仅注释自述"材料继承…归后卡"）
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 4 §3.3 声明由 dimension-writers 写的多项实例维度在 item 表无列，写者两条路都写不进
- 位置：world/ontology/dimensions/item.json:102-113；server-plugin/kernel/dimension-writers.mjs:107-121、:156-158；world/ontology/state-owners.json:18-23
- 设计原文：卷三乙:452「`itemInstances.<id>.qualityTier / maker / madeDay / material / emphasis / copyOf / copyGeneration` | dimension | kernel/dimension-writers.mjs（制成时一次写入，此后不改）」；:453 `issuer / sealOf`；:454 `purports`
- 代码实际：item 表 instanceDimensions 只有 durability、wearAnchorDay、spoilage、rotAnchorDay、qualityTier、madeDay、taint、diedMinute、ofPerson、ofSpecies。maker、emphasis、copyOf、copyGeneration、purports、issuer、sealOf 既不在 instanceDimensions，也不在模板维度：createItemInstance 对它们抛 E-DIM-STRUCT-FIELD（:109-121），writeItemDeviation 也抛 E-DIM-REF-MISSING（:157-158）；state-owners 的写者表同样没有这些路径。（material 是模板维度，经 created.props.material 偏离写，不在此列。）
- 理由：无（问题.md、PLAN.md、待办.md grep 这七项 0 条；只有 craftOutcome"归后卡"的代码注释，未提这些列）
- 影响：规则缺（制成时这些维度写不进实例；表象、签发、用印、作者等读不到）
- 严重程度：乙
- 合并：`coverShare`、`sealIntact` 见下"跨卷待判"；`OTHER_WRITERS` 写死另见 docs/研究/偏离清查-1122.md 第 22 条，不重复计

---

## 已登记未建

1. **批次与实例的 thermal/wear 维度**（`temperature / tempAnchorMinute / burn / leakAnchorDay`，实例另有 `faults`）未建：卷三乙:446、:449 把这些路径的写者定为 item-condition.mjs。登记处：world/rules/tables/rot.json:28-34（unbuilt 含 itemThermal，并自述 sys.itemRot 的 after 暂空是对卷文的偏离）、world/rules/tables/wear.json:26-31（unbuilt 含 itemWear、faultCurve）。代码按未知带缺口（item-state.mjs 的 GAP），不编数；本卡范围内没有第二处写这些路径。
2. **建实例与耐久、腐坏初值成对写入**：卷三乙:449-450；kernel/dimension-writers.mjs:31-34 明确初值由 item-condition.mjs、item-lots.mjs 在同一事务之外落。登记处：docs/PLAN.md:82（6-27 建实例与初值成对写入）。
3. **P-4 坏透转腐殖类产物未建**：item-lots.mjs:130-132 自述这类批次不结算、留账上封顶 1（卷三乙 §4.12 P-4 不在本卡给的范围，细节未读）；登记处 rot.json:29-33（rotReaction）。

## 拿不准

1. **recipeView 少派生字段**：卷三乙:430 说 recipeView 加 `disassembly`、`inputValue`，kernel/recipe.mjs:46-51 只返回表头维度。因 §3.1 :430 不在本卡给的卷:行范围，未计入条数。
2. **`outputs[].qty` 表类型收窄**：卷三乙:380 是 union[number, distribution]，recipe.json:35 只写 `distribution`；distribution 的参数校验本身未做（types.mjs:285，已在偏离清查-1122.md 第 7 条计过），且 recipe 表 rows 现为空，数值 qty 靠该校验未做才通过，无法判定是否会拒收，未计入。
3. **item-lots 的合并判据未核**：K-3 的"属逐件实例的批次不与任何批次合并、temperature/burn/leakAnchorDay 须都为空、同腐坏档、mergeMaxGap"都在 kernel/item-state.mjs 的 lotMergeVerdict 与 kernel/ledger.mjs，均不在本卡给的代码范围；transferGoods 自己不判、直接交给 verdict，未核是否有缺。
4. **state-owners 的 stockLots 通配写者**：state-owners.json:17 写 `"*": "kernel/ledger.mjs"`，而卷三乙:446 说批次 temperature/tempAnchorMinute/burn/leakAnchorDay 归 item-condition.mjs。itemThermal 未建时无人写；建成后须把通配收窄，是否算偏离未判。
5. **手拼 Error 加 code**：item-lots.mjs:17 与 item-condition.mjs:16、:42 自建 `new Error` 挂 code，不调 kernel/errors.mjs 的 KernelError（也就不过登记码表）。设计出处不在本卡给的卷:行范围；同类已在 docs/研究/公共部件审查-乙-1122.md:140 记 13 处，未含这两个文件。
6. **`material` 的"制成时一次写入"**：卷三乙:452 把它列为制成时一次写入的实例维度，表里它却是模板维度、经 created.props 偏离写，writeItemDeviation 没有"此后不改"守卫；与 §4.10 D-2"材料组成变了"并读，是否算偏离待判。

## 跨卷待判

1. **`coverShare`**：卷三乙:457 要求一切物品实例都写；item 表无此列、state-owners 无写者。卷二十三 §2.2/R23-1.4 读它；已在 docs/审查/表C对齐-只核.md 真问题 3 记录"coverShare 没有写者"，处置待主会话/李白。
2. **`sealIntact`**：卷三乙:458 要求建实例时按封装写入、封/拆各一次；item 表无此列、state-owners 无写者。卷十七 C17-6 ② 要求增设；见 docs/审查/全书加载修复批-盲区判定-C档与AB抽查.md 第 45 条（该条当时记"卷三乙全文没有这个词"，现 :458 已补，列仍缺）。
3. **`attachments` / item-attach.mjs**：卷三乙:451 把该路径的写者定为 item-attach.mjs；全仓无此模块、item 表无 attachments 列。机制定义在卷二十三 §4.14，是否随卷二十三的卡一起建待判；未见 PLAN/问题.md 登记。
4. **`itemRot.after = [itemThermal]`**：卷三乙:486 要求机读 after；state-owners.json:43-44 现为 `after: []`。rot.json:33 自述这是对卷文的偏离、itemThermal 建成后补；itemWear 的先后对象卷三乙 §3.3 未指名钩子代号，归卷二十温度场卡。
