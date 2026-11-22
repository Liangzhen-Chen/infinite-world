共 9 条，甲 0 乙 7 丙 2，有理由 2 无理由 7。
本卡读：卷二十 :279-313、:314-423、:623-676、:715-777（卡给范围）；另补读 :86-135（§2.0 五类与 onUnknown）、:683-702（§4.4.3 季节与太阳相位，代码含 seasonAt/normalizedSolarPhase 但卡未列该节）。代码读：server-plugin/kernel/climate.mjs :1-342 全读、server-plugin/kernel/weather.mjs :1-224 全读。未读：卷二十 §4.11.3（dailyMeanTemp 依据，卡未给行范围）、卷十九 §4.1（envelopeUaWPerK 公式）、卷三乙 §4.11（burnPowerAt）、卷二十七（inBubble/位置层）、卷二（onUnknown 只在研究文与代码里见过引用）。
公共部件审查-甲 A1-A4 已登记项（envAt、温度分支、placeClimateInput、weatherAt 上下文）不重复记。

### 1 天气当日量只交回温度偏移、云量、湿度，降水量、风速、风向、降水相态未实现
- 位置：server-plugin/kernel/weather.mjs:211-218（weatherAt 的返回与 quantity 只取三项）；抽取主体 :176-219
- 设计原文：卷二十 :642 §4.3.3 第 4 条"降水量、风速、风向偏角由该状态的分布各用自己的抽取点抽出；风向 = 单元 `prevailingWindDeg` 加偏角；湿度取状态行的 `humidity`"
- 代码实际：只返回 state、tempOffsetC、cloud、humidity；precipMm、windMps、windDirSpreadDeg、precipPhaseFrom 从未读取（server-plugin 全仓除注释 :6 外无 `.precipMm`/`.windMps` 读取）。
- 理由：无。代码头 :6 自述"旧数据没有"，但 world/ontology/dimensions/_vocab.json:3093-3139 已有这四项，world/rules/tables/weather.json:6 明写"已按太原实测数据派生入表"；rules.weather.unbuilt 只列 meltCurve、phenomena、snowCover，未登此项。
- 影响：规则缺；§2.7 :342-343 的 env.precipMm / windMps / windDirDeg / snowMm 无来源，降水暴露、水循环、风雪后果读不到。
- 严重程度：乙
- 合并：无

### 2 weather.weightRX 的加载期依赖闭包检查（E-WX-WEIGHT-CYCLE）未建
- 位置：server-plugin/kernel/weather.mjs:94-111（prepareWeatherRx 只编译 weightRX 树）
- 设计原文：卷二十 :283 §2.5"加载期按 §2.0 推论 3 查依赖闭包：引用 `env.weather`、`env.tempC`、`fields.*`、任何可变存储值…即报 E-WX-WEIGHT-CYCLE"
- 代码实际：prepareWeatherRx 只调 compileRXInScope 编树，无依赖闭包或命名空间检查；全仓无抛出点，error-codes.mjs:162 只登记了码。
- 理由：无（docs/研究/魔法可改写-评估-1119.md :83 记"检查还没建"，属研究文登记，不是裁定/问题.md/勘误）
- 影响：规则缺；weightRX 读到可变存储值或成环时加载期不拦。
- 严重程度：乙
- 合并：见 docs/研究/魔法可改写-评估-1119.md :83

### 3 天气抽取的种子键未登 seed-keys.json，抽取点两套写法、现场拼串
- 位置：server-plugin/kernel/weather.mjs:76-79（split/join 拼代号）、:167（自拼记忆键）、:202（drawBelow 传非字面量）
- 设计原文：卷二十 :638 §4.3.3 第 2 条"每次抽取的键 = (worldSeed, streamCode, subjectId, worldTime, drawSiteCode)…drawSiteCode 为状态、降水量、风速、风向四个登记抽取点之一"
- 代码实际：把 rules.clock.drawSites 的 `site.weather.state` 经 split('.')/join('_') 改成 `site_weather_state`；streamCode 与 drawSiteCode 都不是字面量；world/rules/tables/seed-keys.json 无天气抽取行，rules.clock.drawSites 又是点号写法。
- 理由：有（docs/问题.md:242"seed-keys 未登记、加载器静默不读"；:284"drawSites 五码拼写…由卷二十照录"）
- 影响：规则缺；存档确定性与 seed_sites 门禁漏认。
- 严重程度：乙
- 合并：见 docs/研究/公共部件审查-甲-1122.md C2、R6

### 4 天气行的 persistence 取值域 [1, null] 未校验，0/负值走错误路径
- 位置：server-plugin/kernel/weather.mjs:196-199
- 设计原文：卷二十 :284 §2.5"`weather.persistence` | integer | [1, null] | error"
- 代码实际：只查 Number.isSafeInteger(kept)，0 与负数照收；kept 为负时权重可为负，抽样循环 pick 只增不减，chosen 保持 null，随后 :211 `engine.vocab.index.get(null).entry` 抛 TypeError。
- 理由：无
- 影响：规则缺（非法值崩溃，未按 error 拦）
- 严重程度：乙
- 合并：无

### 5 envelopeUaWPerK 未校验结果 > 0 与 aperture 取值域
- 位置：server-plugin/kernel/climate.mjs:258-275（:267-272）
- 设计原文：卷二十 :374 §2.7"`comp_enclosure` `envelopeUaWPerK` | W_per_K | > 0 | gap"
- 代码实际：只校验 wallThicknessM > 0（:268）；aperture 不查 [0,1]；导热和与开口都为 0 时 ua = 0，indoorTemp :247 的 fixedDivide 除零抛 E-MOD-RX，而非未知带缺口。
- 理由：无
- 影响：读数错 / 崩溃
- 严重程度：乙
- 合并：无

### 6 气候与天气代码直读 engine.vocab.index，绕过词表读口
- 位置：server-plugin/kernel/climate.mjs:110-112、:125；server-plugin/kernel/weather.mjs:72、:196、:211
- 设计原文：卷二 §2.7 kernelApi :604-606（本卡通用公共部件：词表条目只经 kernel/vocab.mjs 的 vocab、kindOf、kindOfEntity，不许直读 engine.vocab 内部）
- 代码实际：用 for…of engine.vocab.index 与 .get(id).entry 直接取 family/entry，不经 vocab()/kindOf()。
- 理由：无（公共部件审查-乙 :143 记"族条目枚举读口（缺）"、45 个文件同样直读；该文不是裁定/问题.md/勘误）
- 影响：绕过（公共部件缺枚举读口，暂未出错）
- 严重程度：乙
- 合并：见 docs/研究/公共部件审查-乙-1122.md :143

### 7 climate.mjs 用到的单位 W、W_per_K 未登 _units.json
- 位置：server-plugin/kernel/climate.mjs:22-23（SCHEMA）、:238、:241、:274、:292
- 设计原文：卷二十 :92 §2"单位须在 `_units.json`；本卷需要新增的单位列在 §8 问题 6"；:1404 §8 问题 6 列 W、W_per_K 等需新增
- 代码实际：Fact.unit 直接写 'W'、'W_per_K'；world/ontology/dimensions/_units.json 无这两个 id（只有 W_per_m_K、W_per_m2_K），也无 m_per_s、dB、lux、lm。
- 理由：无（§8 问题 6 是卷内待办，不是裁定/问题.md/勘误）
- 影响：只是形式（数值不受影响，单位代号未登记）
- 严重程度：丙
- 合并：无

### 8 天气单元字段 climateProto 不在 §2.7 组件表，靠自定字段取季节曲线
- 位置：server-plugin/kernel/weather.mjs:29-31、:123-129（protoCurves 读 cell.climateProto）
- 设计原文：卷二十 :363-373 §2.7 `comp_weather_cell` 字段表（无 climateProto）；:641 §4.3.3 第 3 条 weightRX 变量域只列静态维度、按日生效值、太阳相位
- 代码实际：读 ctx.cell.climateProto 去找 rules.climateProto 的 seasonCurve；该字段由 6-29 卡自行加进 world/ontology/dimensions/place.json:290 与 _vocab.json:453，卷二十 §2.7 未列。
- 理由：有（李白 11-19 15:5x ⑤，docs/审查/李白裁定-1117.md:1327"季节曲线改挂气候原型，每个天气单元引用一个原型"；docs/审查/6-29-Opus复核-第2轮-1119.md:53-54 已核此依据）
- 影响：只是形式（数据已按裁定落，卷二十键表待勘误）
- 严重程度：丙
- 合并：见 docs/审查/6-29-Opus复核-第2轮-1119.md :53-54

### 9 天气记忆键不含单元改写记录条数
- 位置：server-plugin/kernel/weather.mjs:160-168（segmentOf）
- 设计原文：卷二十 :639 §4.3.3 第 2 条"结果可按（单元，日序，该单元改写记录条数）记忆"
- 代码实际：键 = [worldSeed, streamCode, cellId, latitudeDeg, 锚段首日].join('|')，单元值按对象同一认；无改写记录条数。
- 理由：无（仅注释 :160-161 自述"单元值现无改写写者，按对象同一认"）
- 影响：规则缺（一旦出现按日生效改写，旧记忆会被继续取用）
- 严重程度：乙
- 合并：无

---

## 已登记未建

- §4.3.3 第 5 条积雪（卷二十 :643-646）、第 6 条现象（:647）：world/rules/tables/weather.json:6 的 `unbuilt` 列 `meltCurve`、`phenomena`、`snowCover`；weather.mjs 不带这两条，读到按未知。
- §4.3.3 第 10 条地点一级气候覆盖：卷二十 :657 明写"现在只有本条，不建代码、不登记写者"。
- §4.4.3 第 4 条日照 `daylightMinutes`（卷二十 :692）：world/rules/tables/astro.json:9 的 `unbuilt` 列 `axialTiltDeg`、`polarLatitudeCapDeg` 等；climate.mjs:134-136 返回未知。
- §4.5.3 第 1 条昼夜的 cloudDamp、diurnalPeakMinute，第 2 条地下的 groundDampCurve、geothermalGradient，第 5 条体感的 radiantSunCurve、radiantFieldCurve、windChillCurve（卷二十 :741-757）：world/rules/tables/climate.json:5 的 `unbuilt` 逐项登记；climate.mjs 对应项标 partial 或整支未知。
- §2.6 / §4.4.3 第 3 条 seasonScheme 派生（schemeRules）：world/rules/tables/season.json:3 的 `unbuilt` 列 `schemeRules`；climate.mjs:104-118 只读显式 seasonScheme。
- seed-keys.json 天气抽取行（见第 3 条）：公共部件审查-甲 C2 已记"未建"，问题.md:242/284 备案。

## 拿不准

- weatherAt 对 ctx 缺项处理不一致：worldSeed 缺按缺口（weather.mjs:182），streamCode/cellId 缺由 diceKeyOf 抛错（:202）、ctx.cell 缺在 :125/:137/:150 抛 TypeError；卷文只规定"世界输入未知带缺口"，未规定内部上下文缺项，未列为偏离。
- dailyMeanTemp（climate.mjs:303-324）依 §4.11.3 第 2 条，本卡未给该节行范围，未逐式核；只核了它与 §4.5.3 的日均温口径（不含昼夜项、含当日天气偏移）不冲突。
- onUnknown 口径相抵：§2.5 :283-284、:290 与 §2.7 :334、:363、:365-366 写 error（读到即 E-DIM-UNKNOWN-READ），李白 11-19 13:4x ②（裁定-1117 :1254）写"缺的值机读登未建，读到即未知、向上传未知"；代码一律按 gap/partial。按卷文还是按裁定、以及该裁定是否仍管已补值的行，待判。
- rules.weather.anchorDays ≤ 0 时 weather.mjs:187 取模得 NaN 后崩溃；卷二十 §2.9 :404 只给键名，未给取值域，未列为偏离。
- §4.3.3 第 7 条干预、第 8 条排放：weather.mjs 头 :6 说"往后排、见 rules.weather.unbuilt"，但 weather.json:6 的 unbuilt 未列这两项；执行者（envmods 修正、§4.7 场步进器）不在本卡文件范围，登记处未查到，未列偏离。

## 跨卷待判

- envelopeUaWPerK 的公式（climate.mjs:258-275）依卷十九 §4.1 规则 4；本卡只给了卷二十 §2.7 :374 的取值域，公式未逐项对卷十九原文核（第 5 条只判了域校验缺失）。
- 地点热源功率的"燃烧中物品放热"项（climate.mjs:283-293 的 burning 数组）依卷三乙 §4.11 `burnPowerAt(placeId)`；本卡未读卷三乙，入口是否存在未核。
- §2.7 :330 的位置层（泡内按格求 env.climateTempC / env.tempC，读卷五 §4.3 规则 8 的 h(x,y) 与卷二十七 inBubble）：envAt 未建（甲 A1），本卡未核这条路径。
