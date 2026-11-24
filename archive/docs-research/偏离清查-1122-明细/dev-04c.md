共 10 条，甲 1 乙 7 丙 2，有理由 0 无理由 10。
本卡读了 卷三乙 :220-369、:415-445、:1027-1129、:1381-1430、:1514-1563（后两段卡未给行号，因②要核 rotStep 与自然劣化，按需补读；:370-414、:446-1026、:1130-1380、:1431-1513、:1564 以后未读）；卷三甲 :445-493；代码 server-plugin/kernel/item-state.mjs :1-677 全读。为核对接点另读了 ledger.mjs :43-92/:1328-1400、holdings.mjs :254-261、item.mjs :609-700、place.mjs :1355-1378、climate.mjs :303-342、weather.mjs :176-216、scheduler.mjs :182-208、det-math.mjs :125-155/:223-251，以及 world/rules/tables/{rot,wear,quality,containers}.json、world/rules/registry.json :490-521、world/ontology/dimensions/{_unbuilt-derived,item,_vocab}.json、kernel-constants.json、state-owners.json :275-286。

### 1 实例与批次的 material 偏离（及品质乘子）不进读数，一律按模板聚合
- 位置：server-plugin/kernel/item-state.mjs:210-214（aggregated）、:415-418（templateValue）、:352-355（itemViewShares）、:575-605（canContain 取模板）
- 设计原文：卷三乙 :428 "实例：再加 §2.3 实例维度；`material` 取实例偏离值"；:429 materialView "接受材料 id、物品模板 id、实例 id 或 lotRef……给后三者时按 M-1 聚合"；:1398 D-1 "两个量都读修正后值（品质与材料经此进入）"
- 代码实际：aggregated() 只把 subject.template 交给 materialView，rotSubject 丢掉 lotRef/实例 id；death.mjs:207 写入的尸体 material 偏离（carcass 组成）读不到，尸体腐坏率仍按尸体模板材料算；itemViewShares 与 canContain 的 volumeL/massKg 也按模板，实例的 created.<id>.props.* 与批次的 attrs.material 都不读。
- 理由：无（item.mjs:690 已有 aggregateMaterialFor 专供实例/批次偏离，本文件未调）
- 影响：读数错
- 严重程度：甲
- 合并：无（甲-1122 F1 只记 materialView 的调用点，未判模板/实例口径）

### 2 K-7 的保存系数恒为 1（preserveMult、sealed 不进 P-1/D-2）
- 位置：server-plugin/kernel/item-state.mjs:222-223、:246、:385
- 设计原文：卷三乙 :1050 K-7 "容器对腐坏与温度的影响只通过 `preserveMult` 与 `sealed` 两个维度进入 §4.11、§4.12 的公式"；:1530 P-1 "保存系数是所在容器的 `preserveMult`（不在容器内为 1）"
- 代码实际：preserveNone() 恒 fixedUnits(1)，腐坏与劣化两式都乘它；注释称"持有种类里没有登记装入关系"，但 hk_containing 已登记（_vocab.json:810）、holdings.mjs:258 的 openHoldingsOfKind 可读边。
- 理由：无（6-3 复核 M10 记为未完成项；preserveMult 列另登在 _unbuilt-derived.json:147，但读者也缺，未准予不建）
- 影响：读数错（容器内腐坏、劣化不减速；眼下没有内容物，未显）
- 严重程度：乙
- 合并：无

### 3 containerView 恒空：内容物与已用量不读，返回数也不是 Fact
- 位置：server-plugin/kernel/item-state.mjs:554-560、:580、:603-605
- 设计原文：卷三乙 :1038 "`containerView(engine,state,instanceId)` → `{contents: [{item, qty}], usedL, usedKg, freeL, freeKg}`（各为 Fact）"；:1074 不变量 "任一容器 `usedL ≤ volumeCapacity` 且 `usedKg ≤ maxLoadKg`"
- 代码实际：contents 恒 []，usedL/usedKg 恒 0，freeL/freeKg 直接等于容量（裸 number/null，没有 Fact 的 known/applicable）；canContain 因此只按空容器判，已有内容物时不能阻止超装。
- 理由：无（6-3 复核 M10 :48、:76 记为未完成项，未准予不建）
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 4 容器三入口在生产代码里没有真实调用者，只有彼此调用与测试
- 位置：server-plugin/kernel/item-state.mjs:554（containerView）、:571（canContain）、:617（loadPlan）
- 设计原文：卷三乙 :1038 三个统一入口（§4.4.2）；:1908 "`containerView` / `canContain` … 卷十七、十九"；:1052 K-9 "由卷二十七的分户写者提交"
- 代码实际：server-plugin 下除 item-state 自身外零 import；canContain 只被 loadPlan 调、containerView 只被 canContain 调，外部只有 tests/kernel/item-lots.test.mjs；state-owners.json:275/:283/:286 只登记为 kernelApi（callers:["rules"]），没有调用方模块。
- 理由：无（卷十七/十九/二十七未建，未见登记或裁定）
- 影响：玩法不可达
- 严重程度：乙
- 合并：无

### 5 loadPlan 把物态未知的批次当"无需容器"，placed 与 left 都不出现
- 位置：server-plugin/kernel/item-state.mjs:623-625
- 设计原文：卷三乙 :1044 K-1 "物态未知的东西不许装入（`reason` 为 `matter_unknown`）"；:1052 K-9 "逐件装到 K-1 判为装不下为止；装不进的留在聚合账户"
- 代码实际：matterNow() 对可能物态集多于一项或未知返回 null，needs 因此为假，该批次被 continue 跳过，既不在 placed 也不在 left（被当作"无需容器"）；T-2 未建时这是多数物品的路径。
- 理由：无（matterStateOf 未建已登记，但缺口应保守留在 left，不能把未知当"无需"）
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 6 loadPlan 自算体积/载重界限，未走 K-1 的同一判据
- 位置：server-plugin/kernel/item-state.mjs:633-640
- 设计原文：卷三乙 :1052 K-9 "逐件装到 K-1 判为装不下为止"
- 代码实际：先 canContain(…,1) 判一次，随后在 while 里用 dim().value 重算 capL/capKg 与已装量比较，另写一份体积/载重算术；canContain :603-605 已有一份同样的判据。
- 理由：无
- 影响：只是形式（同一判断两处，K-1 改动时 loadPlan 易不同步）
- 严重程度：丙
- 合并：无

### 7 可腐实例的坏透链断在批次属性与清单：实例批次读作缺锚点，P-4 不结算实例
- 位置：server-plugin/kernel/item-state.mjs:141（lotAttrs 只读 stockLots）、:281（lotRef 只取 stockLots 属性行的 spoilage/rotAnchorDay）、:330-350（rottenLots 只枚举账户批次）
- 设计原文：卷三乙 :1046 K-3 "它的批次键由实例 id 确定性派生为 `lot_i_<实例id>`"；:1533 P-4 "任何推进方式都在那一天把这批货…转成…"；:450 §3.3 实例 spoilage/rotAnchorDay 的写者是 item-lots.mjs
- 代码实际：实例的 spoilage 存在 itemInstances 行（item-lots.mjs:41-46），实例批次 lot_i_… 的 stockLots 属性行没有这两个字段；rottenLots 枚举 accounts 后按 lotRef 读属性，实例批次恒 absentAnchor→UNKNOWN，transform 恒 null，尸体等可腐实例永不到期结算。
- 理由：无（6-3 复核 :70 只记"实例与新批次无指针"待裁定，未登记不建）
- 影响：玩法不可达
- 严重程度：乙
- 合并：环境半边（实例所在处取不到）见甲-1122 A3、模块化评估 #2（G16）

### 8 D-3 的 wearLevel 没有读者：instanceView 只给 durability
- 位置：server-plugin/kernel/item-state.mjs:503-511
- 设计原文：卷三乙 :1386 "`wearLevel`（派生 = lookup(rules.wear.levels, 当日耐久)，五档）"；:1400 D-3 "劣化等级的效果 = `rules.wear.levels[档].modifiers`"
- 代码实际：instanceView 返回 durability/spoilage 的 Fact 与其余行字段，不算 wearLevel；全 server-plugin 无一处读 wearLevel，rules.wear.levels 的 minDurability 只在 checkItemStateTables 校验里用到。
- 理由：无（wear.json unbuilt 只登 levelModifiers，没登 wearLevel 不建）
- 影响：玩法不可达
- 严重程度：乙
- 合并：无

### 9 状态顶层键与汇代号写死，未用已登记的 SCHEMA 与 V 句柄
- 位置：server-plugin/kernel/item-state.mjs:28（ST 的 accounts/stockLots 字面量）、:321（ROT.sink='sink_decay'）
- 设计原文：卷三乙 :442-443 §3.3 账户与 stockLots 的顶层键；卷六 :1249 "`sink_decay` 腐坏、磨损殆尽、自然损耗"
- 代码实际：ST.accounts='accounts'、ST.lots='stockLots' 与 ledger.mjs:76 的 SCHEMA.accounts/stockLots 重写一份（本文件已 import SCHEMA 为 LEDGER，却只用 lotPrefix）；'sink_decay' 与 V.sink.sink_decay（item-lots.mjs:141 的用法）重写一份。
- 理由：无
- 影响：只是形式（改名时静默失效）
- 严重程度：丙
- 合并：无

### 10 P-7/D-6 校验可被空表绕过
- 位置：server-plugin/kernel/item-state.mjs:660-675
- 设计原文：卷三乙 :1536 P-7 "`rules.rot.stages` 的 `minSpoilage` 严格递增且首档为 0"；:1404 D-6 "`levels` 的 `minDurability` 严格递减；最低档的修正须把全部能力降到 0"
- 代码实际：`ms.length && ms[0] !== 0`、`mins.some(...)`、`new Set(codes).size !== codes.length` 对空数组全为假，stages: []、levels: [] 均通过；之后 stageOf 恒 null、wearLevel 无档，P-3/D-3 静默失效。
- 理由：无
- 影响：规则缺（空表绕过校验）
- 严重程度：乙
- 合并：无

## 已登记未建

1. 天气上下文：item-state.mjs:186-188 的 wearDayFactor 恒按未知带 `weather_ctx_unbuilt`（:47 GAP.weather；卡文指定，单列）。依据 卷三乙 :1387 §4.10.1 "H = 逐日 lookup(rules.wear.envCurve, 该地该日湿度)"；登记处 world/rules/tables/wear.json 的 unbuilt 行 `weatherCtx`；seed-keys.json 里没有 weather 流。
2. 当时物态 T-2：item-state.mjs:542-547 matterNow 在可能物态集不唯一时按未知（canContain 回 matter_unknown）。依据 卷三乙 :1044 K-1 "物态一律取装入那一刻 `matterStateOf` 的返回值"、:1463 入口定义；登记处 docs/PLAN.md:82④、docs/迁移体检/块6.md:126（K6-92）；item.mjs 的 possibleMatterStates 本身登在 _unbuilt-derived.json:30。
3. 保质日数 P-2：item-state.mjs:216-220 只读物品表头 `shelfLifeDays` 的 domain 上限，不派生该维度。依据 卷三乙 :1531 P-2 "`shelfLifeDays = 1 ÷ 腐坏率`"、:177 取值域 [0,36500]；登记处 world/ontology/dimensions/_unbuilt-derived.json:36（card 6-3）。
4. 坏透转化 P-4：item-state.mjs:290、:321、:330-350 只给 `{to:'sink'}`，不按 `reactionProducts[rotReaction]` 转腐殖类产物、不让不可腐份按 rawForm 留存。依据 卷三乙 :1533 P-4；登记处 world/rules/tables/rot.json 的 unbuilt 行 `rotReaction`。
5. 腐坏档的修正与食用后果 P-3：item-state.mjs:253-259 只返回档下标，不套 modifiers、不触发 onConsume。依据 卷三乙 :1532 P-3；登记处 world/rules/tables/rot.json 的 unbuilt 行 `stageModifiers`、`stageOnConsume`。
6. 穿用与到期事件 D-4/D-7：本文件没有穿用钩子，也不登记越档/毁坏到期事件。依据 卷三乙 :1401 D-4、:1403 D-7；登记处 world/rules/tables/wear.json 的 unbuilt 行 `itemWear`。
7. 容器嵌套上限 K-2：canContain 不判嵌套层数。依据 卷三乙 :1045 K-2 "嵌套容器逐层求和（层数上限在规则表，超限不可装）"；登记处 world/rules/tables/containers.json 的 unbuilt 行 `maxNesting`。
8. 所在处按落点/人物位置：item-state.mjs:150-159 envOf 只认地点持有人（ENV_OF_KIND），:242、:380 对实例恒给 `place_env_unbuilt`，批次在人物名下也取不到。依据 卷三乙 :1530 P-1、:1399 D-2 "H(所在地)／所在处"；登记处 docs/当前状态.md:43（envAt 归 G16）、docs/研究/公共部件审查-甲-1122.md A3/A4、_unbuilt-derived.json:179（person.pos 归 6-27）。
9. D-6 最低档修正归零：checkItemStateTables 只核 minDurability 递减与档位不重名，不核最低档 modifiers 是否把全部能力降到 0。依据 卷三乙 :1404 D-6；登记处 world/rules/tables/wear.json 的 unbuilt 行 `levelModifiers`（代码注释 :669 也自述）。

## 拿不准

1. rotStep 的坏透日倍增搜索会越过 `shelfLifeDays` 取值域上限：item-state.mjs:306-311 先按 `hi += hi - anchor` 翻倍，等 `hi - anchor < horizon` 才停，hi 可到上限的两倍；卷三乙 :177 只给 [0,36500]，:288 的注释自称"不超过 36500"，卷文没写外推上限怎么取，判不准算不算偏离。
2. wearStep 的 `cause: damage`：卷三乙 :1392 §4.10.2 的签名只有 cause，代码 :398-403 无伤害量参数、恒返回 `UNKNOWN('damage_amount')`；伤害量由卷十三给（未建），判不准是本卡缺参数还是留给卷十三另写入口。
3. durabilityOn 的定点顺序：item-state.mjs:384-385 用 fixedMultiply（10⁴ 截断）先算 rate×H，再乘 SCALE 升到 10⁸，注释"不丢位"与截断事实不符；D-2 例 :1418 的 0.00108→0.9136 需要 5 位小数，定点 SCALE=10⁴。卷文没写 trunc 的位数，判不准是否偏离。
4. 实例读法的入口形态：卷三乙 :428-429 只列 `itemView`/`materialView` 接受实例与批次（item.mjs:654 自述"实例与批次随 6-3"未建），item-state 另立 `instanceView`（:503）且无 dims/wearLevel；判不准该记在 item.mjs 的实例读法卡还是本卡。
5. P-4 的到期事件：卷三乙 :1533 要求重设锚点时登记到期事件，item-state 的 rotStep 只把 expiresDay 作为读数返回，item-lots.mjs 的 reanchorLot/initInstanceRot 不向 scheduler 登记事件；不在本卡文件范围，判不准是否由 itemRot 日拍钩子替代。

## 跨卷待判

- K-3 "落点不同的批次不合并"：卷三乙 :285 批次结构 `spot` 行（"落点不同的批次不合并（K-3）"）与卷五 :502（"落点不同的批次不合并"）要求把 `spot` 计入判同键，但 ledger.mjs:1328 的 LOT_SAME_KEYS 只有 source/qualityTier/purports/batchTag/material/project，没有 spot；该文件不在本卡范围，记给账本/批次写者卡。
