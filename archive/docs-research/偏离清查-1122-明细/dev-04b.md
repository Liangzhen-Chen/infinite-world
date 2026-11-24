共 11 条，甲 0 乙 10 丙 1，有理由 0 无理由 11。
本卡读了：卷三乙 :412-441（§3.1）、:630-729（§4.1.1 M-1/M-10/M-12）、:894-1026（§4.2–§4.3）、:1124-1250（§4.6–§4.7）、:1700-1819（§4.16–§4.18）；卷二 :450-484（§2.2，经 §3.1 :426 指向）。代码：server-plugin/kernel/item.mjs :340-717（卡给范围）；为核范围里的调用另读 :1-120、:132-206、:226-343（这三段不在卡给范围，仅用于判调用，不据此立条）。另读 world/ontology/dimensions/item.json:1-30、world/rules/tables/items.json:60-144、world/ontology/dimensions/_unbuilt-derived.json:23-43、material.json 承力四维、world/ontology/state-owners.json:266-269、death.mjs:85-200、item-state.mjs:208-227、recipe.mjs:118-142、valuation.mjs:95-124。未读：item.mjs:121-131、:207-225、:344-359；valuation.mjs 其余（§4.16 实现本体不在本卡代码范围，本卡只核到 item.mjs 的 aggregateMaterialFor 与 itemView 维度，未发现偏离）；卷三乙 §4.4 以下未读。

## 卡③ 物品表直读清单（非 item.mjs）
Grep `engine.tables.get('item')`、`tables.get(S.tables.item)`、`tables.get(KIND.item)` 命中如下，逐点判：
1. `server-plugin/death.mjs:96` —— 读 item 表头 massKg 与 material.share 的 precision，用于写尸体实例偏离行。读表头精度，不是读某件物品的维度；允许（§3.1 :428 管的是物品读数）。
2. `server-plugin/death.mjs:161` —— 读 item 表 doc.rows/generated，找唯一挂 `rules.death.corpseClass` 的模板。按组件类选唯一模板，卷文没有为这种“按类找模板”设入口；允许。
3. `server-plugin/death.mjs:192` —— 读 `doc.entity` 的 idPrefix 生成尸体 id。表头登记，允许。
4. `server-plugin/kernel/item-state.mjs:218` —— 读表头 shelfLifeDays 的取值域上限作坏透日外推上限。表头元数据，允许。
5. `server-plugin/kernel/recipe.mjs:126` —— 加载期校 recipe 表时读 `itemDerived` 与 `doc.rows[id].classes`。此时无 engine/state，itemView 不可用；读的是 item.mjs 产出的派生存储，允许（own+derived 的合并在 :131-135 重抄一份，见“合并”）。
6. `server-plugin/kernel/valuation.mjs:104` —— 只用 `itemT.flat.rows` 枚举模板 id，逐件读数都走 `itemView`（:105）；允许。

另：item-state.mjs 用 `dim(engine,state,'item',…)` 读模板维度（:416、:557-585、:635-636），不属本项 grep；是否算绕过 §3.1 见“拿不准”。本卡范围内没有按类别代号或物品 id 写死的分支：类别判据全部走 `rules.items.categoryRules`/`classRules` 与词表族。`SOLID_REQUIRED` 写死已记，见“合并”。

## 条目

### 1 itemView/materialView 不收实例 id 与 lotRef
- 位置：server-plugin/kernel/item.mjs:618-621、:658-669
- 设计原文：卷三乙 §3.1 :428「接受模板 id、实例 id 或批次引用 `lotRef = {account, lotKey}`」；:429「接受材料 id、物品模板 id、实例 id 或 `lotRef`」
- 代码实际：itemView 经 idKind→kindOf 只认 idIndex 里的模板，实例（不在 idIndex）与 lotRef 一律返回 null；materialView 用 kindOf(id)，对实例与 lotRef 直接抛 E-DIM-REF-MISSING。实例读法另开 `instanceView`（item-state.mjs:499），不是卷文点名的入口。
- 理由：无（仅 item.mjs:6、:613 注释自述“随 6-3”）
- 影响：规则缺（按卷文调 itemView(实例) 得 null，读不到该实例的维度与材料偏离）
- 严重程度：乙
- 合并：无

### 2 §4.6 工具能力入口与校验全未建
- 位置：server-plugin/kernel/item.mjs:360-717（唯一物品读入口一带无 abilities 能力读法；server-plugin 下 grep `abilityLevel`、`abilityIndex`、`rules.tools.availability` 均 0 命中）
- 设计原文：§4.6.2 :1134「`abilityLevel(engine,state,actorId,abilityId,ctx)` → Fact（整数等级，0 表示没有）」；A-1 :1140「三个来源的最大值」；A-4 :1143「`abilityIndex`」；A-7 :1146「`abilities` 的值不超过条目 `maxLevel`；每项能力至少被一个需求块引用」
- 代码实际：无 abilityLevel、无 rules.tools.availability、无 abilityIndex、无 A-7 加载校验；abilities 只作为 item 表头 map 维度被 itemView 原样读出，三来源与平局规则都不存在。
- 理由：无（docs/PLAN.md、docs/问题.md、docs/迁移体检/块6.md 均未登记此入口）
- 影响：玩法不可达（工具能力读不出来）
- 严重程度：乙
- 合并：无

### 3 §4.7 需求块两入口未建
- 位置：server-plugin/kernel/item.mjs:360-717（无 requirementCheck/requirementPlan；server-plugin 下 grep 两名为 0 命中；recipe.mjs:139-210 只做 N-7 的候选项键校验，且不在本卡文件范围）
- 设计原文：§4.7.2 :1191「`requirementCheck(engine,state,reqRef,ctx)` → `{ok, missing: [...]}`，纯读」；:1192「`requirementPlan(...)` → 一份确定性的取料方案」
- 代码实际：两个入口都不存在；需求块只被 recipe 表加载期校验读候选键，没有匹配、取料、缺口返回。
- 理由：无
- 影响：规则缺（配方开工条件与取料全不可用）
- 严重程度：乙
- 合并：无

### 4 abilities 不走修正管线，A-6 不成立
- 位置：server-plugin/kernel/item.mjs:590-594；world/ontology/dimensions/item.json:16
- 设计原文：§4.6 A-6 :1145「`abilities` 是可修正维度（`item.abilities[<能力>]`，stacking none）：劣化等级与故障以修正项降低等级，降到 0 即失去该能力」
- 代码实际：readDim 只把 type 为 number/integer 且 modifiable 的标量送 `modified()`，abilities 是 map，永不进管线；表头又写 `"modifiable": false`。两层任一都使 A-6 不可能成立。
- 理由：无
- 影响：规则缺（劣化与故障不降能力，能力读数会偏高）
- 严重程度：乙
- 合并：无

### 5 categoryRules/classRules 非数组时加载成功、类别按未知带出
- 位置：server-plugin/kernel/item.mjs:353-354、:562-566
- 设计原文：§4.3.3 C-1 :992「派生未命中的物品加载失败」；同条「没有兜底条目」
- 代码实际：compileWhens 在 `rules.items.categoryRules`/`classRules` 不是数组时返回 null；checkItemTables 见 categoryRules 为 null 就整段跳过，全部物品照常加载，itemView 交 UNKNOWN('rules.items.categoryRules')。
- 理由：无
- 影响：规则缺（规则键缺失、空、null 即绕过必填派生，没有变成加载失败）
- 严重程度：乙
- 合并：无

### 6 聚合口径表缺失时 M-10 静默跳过
- 位置：server-plugin/kernel/item.mjs:418-421
- 设计原文：§4.1.1 M-10 :685「`rules.items.aggregation` 覆盖材料表的全部 number、map、struct 与分态维度……缺一个键即加载失败」
- 代码实际：checkAggregation 先 `if (!Array.isArray(list) || !mat) return;`——aggregation 键缺失、值为 null，或材料表不在时，整条 M-10 校验静默通过。
- 理由：无
- 影响：规则缺（绕过）
- 严重程度：乙
- 合并：无

### 7 I-5 的 acceptsMaterial 参考组成自检未做
- 位置：server-plugin/kernel/item.mjs:490-499（checkItemTables 的 I-5 段只校份额和与重复）
- 设计原文：§4.2.3 I-5 :920「`acceptsMaterial` 非空时参考组成本身也满足它」
- 代码实际：server-plugin 下 grep `acceptsMaterial` 0 命中（表头在 item.json:18），没有任何校验代码；checkItemTables 不读这一维。
- 理由：无
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 8 C-7 的用度类池成员校验未做
- 位置：server-plugin/kernel/item.mjs:470-571（checkItemTables 不含 usageClass）；server-plugin 下 grep `usageClass` 0 命中（usagePer/dailyUse 的命中与本条无关），表头在 item.json:84
- 设计原文：§4.3.3 C-7 :999「`usageClass` 条目的 `pool` 非空时，物品必须是该池的成员……不是即加载失败」
- 代码实际：必填那一半由通用 required（byClass:comp_consumable）兜住；池成员这一半没有任何实现。
- 理由：无
- 影响：规则缺（数据尚无 usageClass 值，暂未出错）
- 严重程度：乙
- 合并：无

### 9 C-9 原料/半成品两条规则与 workedState 未落
- 位置：world/rules/tables/items.json:73-85（categoryRules 只有 6 条，无原料/半成品）；world/ontology/dimensions/item.json:15-102（表头无 workedState）；server-plugin/kernel/item.mjs:501-506（I-8 的 bulkForm 段无 workedState 的必填/不适用校验）
- 设计原文：§4.3.3 C-9 :1000「`rules.items.categoryRules` 增这两条……天然形态读新补的形态维度 `workedState`……必填条件同 `bulkForm`（可能物态集含固）」
- 代码实际：规则表没有这两条，表头没有 workedState，加载期也不校；原料、半成品两个类别永不出现。
- 理由：无（仅 docs/卡回报/batch8-errata.md:57 自述“随后续勘误跟办”，PLAN.md/问题.md 未登记）
- 影响：玩法不可达（这两类物品仍无法派生类别）
- 严重程度：乙
- 合并：无

### 10 class_formed / class_powder 不进物品 classes
- 位置：server-plugin/kernel/item.mjs:507-508（只算内部 formed 布尔）、:554-567（classes 只装材料类别与 classRules 命中）
- 设计原文：§4.3.1 :961「`class_formed`（成形固体，能受力） | `rules.items.classRules` | 模板的可能物态集含固；`bulkForm` 条目的 `bearsLoad` 为真」；:962 class_powder 同表
- 代码实际：formed 只用于 I-7 与聚合的适用判断，从不加入 itemDerived.classes 或 itemView.classes；class_powder 全无实现。
- 理由：无（仅 world/rules/tables/items.json:95 的 basis 自述“暂缺”）
- 影响：规则缺（按 classes 选成形固体或粉料的需求与规则选不到）
- 严重程度：乙
- 合并：无

### 11 返回的 View 缺 kind，dims 非惰性
- 位置：server-plugin/kernel/item.mjs:623（一次求全 dims）、:648（返回对象无 kind）；（materialView 同形，:664、:682）
- 设计原文：卷二 §2.2 :476「`View = {kind, id, dims: 惰性 getter {<dimension>: Fact}, …派生字段(Fact)}`」；:478「`View.dims` 按维度**惰性求值**（首次访问才算，RA-S8）；实现是 kernel 用 `Object.defineProperty` 为每个维度定义的取值函数」
- 代码实际：返回 `{id, dims, classes, categoryKind, stockSlot, mainMaterial}`，无 kind 字段；全部维度在构造时一次读完。
- 理由：无
- 影响：只是形式（现无消费者依赖 kind 或惰性；但接口形状与公共约定不同）
- 严重程度：丙
- 合并：无

## 合并（已记在别文，不重复立条）
- item.mjs:39 `SOLID_REQUIRED` 承力四项写死 —— 合并：docs/研究/偏离清查-1122.md 第 23 条。
- item.mjs:124、:297“作者行或 generated 行”有效行重算 —— 合并：docs/研究/公共部件审查-乙-1122.md:88。
- item.mjs:409 `evalWhen` 传 `clock: {}` —— 合并：docs/研究/公共部件审查-甲-1122.md:111。
- §4.16 估值本体（valuation.mjs 的入口、接线、单位、角色）—— 合并：docs/研究/公共部件审查-乙-1122.md 第三节、docs/研究/模块化评估-1122.md 第 11 条。
- C-4 单位日耗与需求侧未建 —— 合并：docs/研究/偏离清查-1122.md 第 12 条（demand 入口四来源全未建）。

## 已登记未建
- itemView 不交 `sourceMode`、`necessityTier`、`substitutePool`、`valueBase`、`valueDensity` 五维，按未知带码交出：登记 world/ontology/dimensions/_unbuilt-derived.json:28、:38、:40、:42、:43；卷文 C-2 :994、C-3 :995、S-4 :1789、V-1 :1731、Y-1 :1816；valueBase/valueDensity 由 valuation.mjs 的 valueBaseOf/valueDensityOf 求（6-9 已建）。
- C-1/C-8 的“具有材料派生组件”（`rules.items.materialCompMin`、comp_burnable 等“具有”口径）未建，另挂“折算量与类别变量补全卡”：docs/PLAN.md:81、docs/问题.md:439、docs/审查/6-fixE-Opus只核-1119.md:20；卷文 §4.2.1 :906、C-1 :992。
- I-2 的逐件建实例由 dimension-writers.mjs:104 实现（6-3），不属本卡；§4.16 的估值整体在 valuation.mjs（6-9 已建），本卡 item.mjs 只供 `aggregateMaterialFor`。

## 拿不准
- itemView.classes 只取 `doc.rows[id].classes` 原样（item.mjs:643-646）：不沿上位链展开，也不读 doc.generated；与 item.mjs:612 自述“手写组件类（含上位）”不一致。卷二 :131 只说 `memberOf` 展开，N-4 :1179 说需求块展开，未明说 itemView 返回的是展开集，故不定级。
- I-7/I-8/I-9 在 `rules.climate.envTempDomain` 缺失时整段跳过（item.mjs:500、:520）；I-9 在材料物态读不出时（:524）跳过密度栏检查。aggregateDim :239 自述“未给这个键按未知带出、不抛错”，但 checkItemTables 也没记缺口；算不算“校验被未知绕过”需判。
- item-state.mjs 直接用 `dim(engine,state,'item',templateId,…)` 读模板维度（:416、:557-585、:635-636），不经 itemView。按 §3.1 :428「物品读数只经 item.mjs 的 view」可能算绕开；按卷二 §2.2 :469 的横切入口 `dim` 则允许。

## 跨卷待判
- §4.6 A-1 的第二来源（工位固定装置，卷十九 §4.3）与第三来源（身体自带能力，字段归卷四 §4.2、§8 Q-08）能否取到，要读卷四、卷十九；本卡未读，且 abilityLevel 未建，接口缺在哪还判不出。
- §4.16 的四角色（强卖折价、税基、赃物、赔偿）与路由在卷六 §4.21；item.mjs 不含角色常数（符合 §4.16.2），valuation.mjs 与卷六路由的接法本卡未读。
- C-3 `necessityTier` 的 `rel_downstream_recipes` 归配方图/卷二，item 表头已把该维登为未建派生；是否与配方卡的递归聚合一起建，要看配方卡。
