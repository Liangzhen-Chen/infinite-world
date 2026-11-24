# 偏离清查 04a（卷三乙，物品内核 item.mjs 前半）

共 4 条，甲 0 乙 3 丙 1，有理由 0 无理由 4；其中第 4 条与既有审查合并（只标合并，不重复主张）。
本卡读了：卷三乙 :129-290、:422-437、:532-703；卷三甲 :306-360。代码读了 server-plugin/kernel/item.mjs :1-718 全文件（卡写 :1-360，但卡点名的 categoryKind、possibleMatterStates、itemView/materialView 实到 :718，一并读）；另查 world/rules/tables/items.json 的 aggregation 行、world/ontology/dimensions/item.json 与 material.json 的相关表头、kernel/dimensions.mjs:175-238、:526-530、kernel/error-codes.mjs。没读原文：卷三乙 §4.2（I-1、I-7、I-8、I-9 原句）、§4.3.3（C-1、C-8）、§4.11（T-2、T-13）与卷二 §3.5，均不在本卡给的卷:行范围。

### 1 加载期求可能物态集与材料聚合量用的是修正前的值
- 位置：server-plugin/kernel/item.mjs:474（`read = loadReader`）、:500、:522、:539-551
- 设计原文：卷三乙:686「① 读修正前的值……（其中要用可能物态集的，集合本身按 T-13 由有效值算出）；② 读有效值：……M-1 聚合出的一切物品量……T-13 的可能物态集」
- 代码实际：checkItemTables 全程用 loadReader（valueOf 读展平行、不套修正管线）求 T-13 可能物态集、I-7/I-8/I-9 用的物态集，以及 categoryRules 读的 `material.<维度键>` 聚合量（materialReader 交给 aggregateDim 的 read 也是 loadReader）。
- 理由：无（仅 item.mjs:114 注释自述"加载校验读修正前的值"；问题.md 无这条）
- 影响：读数错。一旦有以材料表组件类为来源的 mounted 修正项改熔点、沸点或其它材料量，加载期物态集与 C-1 读的材料量就和运行期（runtimeReader 走有效值）不一致。
- 严重程度：乙（首批六个组件类没有以它们为来源的修正项，暂未出错）
- 合并：无

### 2 flammabilityRange 某份没有登记区间时没有退化为该份的 flammability
- 位置：server-plugin/kernel/item.mjs:261、:262-269、:284-293
- 设计原文：卷三乙:660「某份没有登记区间时，它的 v_min、v_max 都取它自己的 `flammability`（区间退化为点，同 T-15 第 ③ 款单料的写法）」
- 代码实际：某份读 `flammabilityRange` 不 known（材料行没填，表头是 required never、onUnknown skip）时，:261 按"required never 即不适用"直接 continue 丢掉这一份；聚合只在登记了区间的份里按 mean 算。
- 理由：无
- 影响：读数错。材料表 flammability 出现 201 处、flammabilityRange 只 6 处（含表头与 cellGrades），绝大多数材料没有区间；整件的 min/max 只会取少数有区间材料的平均，不按卷文把缺区间份退化为它自己的 flammability。
- 严重程度：乙（T-15 的读者未建，materialView 暂时没人读这一维，未出错）
- 合并：无

### 3 `<维度键>@<用途代号>` 的聚合键没有拆前半去读材料维度
- 位置：server-plugin/kernel/item.mjs:229-232、:242、:258（对照 :425）
- 设计原文：卷三乙:669「同一个材料维度按不同用途取不同组时（上表的 `hardness`），规则表的键写成 `<维度键>@<用途代号>`，用途代号由读它的规则登记」
- 代码实际：checkAggregation 在 :425 用 `split('@')[0]` 校验前半是不是材料维度，但 aggregateDim 取 def 用 `matDims[dimKey]`、读材料用 `read(materialRef, dimKey)` 都拿完整键；带 @ 的行会让 def 是 undefined、读不到材料维度，perState/solidOnly/onUnknown 也随之走错。
- 理由：无。问题.md:444 只登记"聚合表的 @用途 行未登、读者未建"，没有登记读取端这个拆法
- 影响：规则缺（一旦按卷文登记 `hardness@防护` 一类行，读数即错）
- 严重程度：乙（现无带 @ 的聚合行）
- 合并：无

### 4 词表条目直读 engine.vocab 内部
- 位置：server-plugin/kernel/item.mjs:60-61（`vocab.families`、`vocab.index`）、:317、:532（`vocab.ancestors`）、:357、:383（`view.vocab.index`）
- 设计原文：本卡第③项与公共格式第三节「词表条目经 kernel/vocab.mjs 的 vocab、kindOf、kindOfEntity；不许直读 engine.vocab 内部」
- 代码实际：族查找、取全族条目、上位链展开、handle 的族判定都直读内部结构。
- 理由：无。合并：公共部件审查-乙 第十节「族条目枚举读口（缺）」已登记 45 个文件同一问题
- 影响：只是形式
- 严重程度：丙
- 合并：公共部件审查-乙 第十节

## 已登记未建

- **itemView/materialView 的实例与批次读法**：卷三乙:428-429 要求 `itemView(engine,state,id,options)` 接受模板 id、实例 id 与 `lotRef`，`materialView` 同样接受后三者；item.mjs:618-620、:659-666 只认模板/材料，6-3 另建了 instanceView、lotsView、containerView（kernel/item-state.mjs:499 起）。登记处：item.mjs:6 注释"随 6-3 物品写者"、docs/PLAN.md 的 6-3 卡。读的是另一组入口，不是卷文写的单入口，主会话判断是否需要归并。
- **I-7 的 gap 级承力项不记缺口**：卷三乙 I-7（代码注释引 :912，原句本轮未读）；问题.md:442 已登记"本卡只报 error 级，gap 级既不报也不记缺口；缺口登记通道随材料表缺口汇总一并做"。
- **envTempDomain 无值时 I-7/I-8/I-9 整块不运行**：问题.md:443 已登记（现 domain 有值 −89.2～56.7，不触发）。
- **rules.items 的 categoryRules、classRules、materialClassMin、sizeClasses 无首批值**：问题.md:439 已登记；item.mjs:304 与 :602 按未知带出，不编数。

## 拿不准

1. 卷三乙:429「对 set 取并集；对 boolean 取"任一为真"」：aggregateDim/aggregateKeyed 只处理 number 与 map/struct，现聚合表 items.json 也没有 set/boolean 行，无触发。缺的是这两类聚合的代表维度与返回形状（并集按什么键、任一为真返回什么 Fact），故不判。
2. `matterStatesOf`（item.mjs:93-103）的分解优先判法与两处边界（`domain.min < melt`、`melt <= domain.max`）要对照 T-2/T-13 原句，该原句在 §4.11，不在本卡给的卷:行范围。
3. checkItemTables 用 loadReader 求 categoryRules/classRules 的 `material.*`；C-8 第①条读修正前的值、C-1 读有效值的分界原文在 §4.3.3（代码注释引 :980-992），本卡未给，未判。第 1 条已只把"M-12 ② 明列的 M-1 聚合量、T-13 物态集"算作偏离，C-8① 的类别派生算修正前的值，未计入。
4. itemView 的 volumeL 截断与 sizeClasses 分档（item.mjs:600-607、:636-638）要对照 I-1 与 §2.5 的原文，本卡未给，未核。

## 跨卷待判

1. 第 1 条的修法（加载期也套 mounted 修正）牵涉卷二 §3.5 的装载次序与"修正随表加载定下"，需卷二 §3.5 与卷三乙 M-12 :686 对读；单读卷三乙判不了是否要把求值挪到装载器，交主会话。
