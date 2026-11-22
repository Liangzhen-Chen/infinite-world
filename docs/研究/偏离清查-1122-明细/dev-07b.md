# 偏离清查 07b：卷五（路网、位置、洞穴、河床）、卷十七、卷十 R10-2.14

共 7 条，甲 0 乙 7 丙 0，有理由 4 无理由 3。

读了：卷五 :430–529（§4.1.2–4.1.4）、:545–695（§4.2、§4.3 规则 8–10）、:730–789（§4.5）、:1063–1089（§4.10 规则 1、5）；卷十七 :252–389（§3.1–§3.4 为判 whereOf 额外读，正文范围为 :341–380）；卷十 :449–458（R10-2.14、R10-2.15 开头）。代码：cave.mjs 1–215、water-bed.mjs 1–131、route-edges.mjs 1–285、route-grid.mjs 1–263、position.mjs 1–325；另为核公共部件调用与派生量读了 place.mjs :310–459、:1115–1276、:1430–1516，footprint.mjs :146–168、:191–410、:480–571、:708–721，place-plan.mjs :30–127，place-volume.mjs :195–270（后四个文件不在本卡必读清单）。审查文：公共部件审查-甲（D1/D4/D6、五节表 R8、:179）、乙（七、:86、:140）、模块化评估。没读：卷五 §4.7、§4.13；卷十七 §4.2 以后；卷二、卷三乙、卷十九、卷二十七原文（只经代码注释与审查文引用）。

已核无偏离：route-grid 一步代价 = 步长 × 终点格 terrain.paceFactor × lookup(slopeCurve, |高差|÷步长)、斜向步长 = fixedSqrtInt(2×regionCellM²)，与卷五 :465、§4.10 :1080 同式，文件里无 1.414、Math.SQRT2；并列取法（代价、步数、格序号序列字典序）在 regionPath 里按此实现。water-bed.mjs 逐项对卷五 §4.3 规则 8：有表序的汇入格与前缀最小、无表序的全片最小、出口值、只降不抬、未知传播均一致，未发现偏离。

合并说明（按卡文要求，不另计）：四邻/八邻方向表重复见公共部件审查-甲 D6（cave.mjs:21、route-grid.mjs:20）；position.mjs:286 的私有区格键串形见甲 D4；cave.mjs:129 的区格边长细格数静默截断见甲 :179；position.mjs:54 自写 deny 见乙 :140；position.mjs:134 直读 rules.grid 见乙 :86。

---

### 1 pathView 泡内细格一层未落，两位置都在现场泡内时仍按区格求路
- 位置：server-plugin/kernel/place.mjs:1262–1276；server-plugin/kernel/route-edges.mjs:251–276
- 设计原文：卷五 :473「两位置都在现场泡（卷二十七 §4.1 的个体层·现场子层）内时，在细格上寻路……否则在区格上寻路」
- 代码实际：pathBetween 只调 regionRoute（区格图）；place.mjs:1262 注释自述细格寻路（bubbleCostCap、自然坡与上下层步长）归 G15，pathView 一律按区格求，bubbleCostCap 全仓无读者。
- 理由：问题.md:545（登记"pathView 只落区格层"）
- 影响：规则缺
- 严重程度：乙
- 合并：公共部件审查-乙 七.3、七.6（routeView/pathView 仅测试、G15 细格寻路）

### 2 水路边栅格化不核两端可航，终点格被显式豁免
- 位置：server-plugin/kernel/route-edges.mjs:110–121（判定在 :118）；server-plugin/kernel/route-grid.mjs:132–157（起点从不作为 stepCost 的 v）
- 设计原文：卷五 :465「水路边只走 `water.navigable` 为真的水体足迹区格，一步代价 = 步长」
- 代码实际：只有非终点的落脚格要求 navigable（`v !== dst && !b.navigable`）；起点接入格从不核可航；因此两端都不在可航水体里、只要中间格可航也能栅格化成一条水路边。
- 理由：无
- 影响：规则缺（绕过）
- 严重程度：乙
- 合并：无

### 3 体积足迹不派生 skyExposure
- 位置：server-plugin/kernel/cave.mjs:194–215（volumeDerived）
- 设计原文：卷五 :756「建筑、房间、体积足迹的 `skyExposure` = 足迹最低一层的细格中头顶不遮蔽者的比例」
- 代码实际：volumeDerived 只给 areaM2、zRange、elevationM、centroid、surfaceRefElevationM、depthM、underground；体积足迹的 skyExposure 全仓无计算处（volumeFootprint 也只转出这些）。
- 理由：问题.md:528（登记 slope、skyExposure 未落）
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 4 position.mjs 自抄 struct:pos 形状校验，未调 named-structs
- 位置：server-plugin/position.mjs:60–62（POS_FIELDS、isPos）
- 设计原文：卷五 :433「位置 `struct:pos = {w, x, y, z, coarse: boolean}`」；字段名与类型只在 world/ontology/named-structs.json（kernel/named-structs.mjs:1–3 自述"本文件不手抄字段名与类型"）
- 代码实际：键集与类型写死在 POS_FIELDS/isPos；公共入口 named-structs.mjs:43 的 isPosValue 未调。登记字段表一改，此处不跟。
- 理由：无（公共部件审查-甲 D1、五节表 R8 已立"struct:pos 只经 isPosValue"的规矩；该表现列违例只到 perceive.mjs:43、sight.mjs:43，不含本处）
- 影响：规则缺（绕开公共部件）
- 严重程度：乙
- 合并：公共部件审查-甲 D1、五节表 R8

### 5 routeView().edge.requirement 恒为未知
- 位置：server-plugin/kernel/place.mjs:1147、:1151
- 设计原文：卷五 :212「边的通行条件；空表示这条边没有通行条件」；§3.1 :313 `edge` 每项 `{waterway, requirement（可空）, portal…}`
- 代码实际：requirement 一律按 UNKNOWN 带出（注释自述 struct:requirementBlock 未建）。
- 理由：问题.md:544
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 6 roadPaceFactor 加载校验按全部 terrain 条目比，卷文只要求"全部陆地地形"
- 位置：server-plugin/kernel/place.mjs:1499–1516（:1515）
- 设计原文：卷五 :473「（加载校验它不大于全部陆地地形的 `paceFactor`）」
- 代码实际：checkPaceTables 收集词表里全部 terrain 条目（不分陆水）的 paceFactor，road 大于任一条即报 E-DIM-DOMAIN-RANGE；水体地形 paceFactor 若更小会误拒。
- 理由：问题.md:546（"`roadPaceFactor` 校验的'全部陆地地形'口径（现按全部 terrain 条目）"）
- 影响：规则缺（校验过严）
- 严重程度：乙
- 合并：无

### 7 pathView、routeView 无生产调用者，只有测试调用
- 位置：server-plugin/kernel/place.mjs:1215（routeView）、:1266（pathView）
- 设计原文：卷十七 :348「行程的路是一串格（R17-1.7 求出：……同卷五 §4.1 规则 5 `pathView` 的分法）」；卷五 §3.1 :314–317 登记两入口
- 代码实际：server-plugin 内除 place.mjs 自身与 route-edges.mjs 外无调用；travel.mjs 未建，动作路 6-13 与 G15 未落，只有测试调。
- 理由：无（公共部件审查-乙 七.3、七.6 与模块化评估已记，非问题.md、裁定或勘误）
- 影响：玩法不可达
- 严重程度：乙
- 合并：公共部件审查-乙 七.3、七.6

---

## 已登记未建

1. 物品、载具的承载链与位置读法：卷十七 :313–316 要求沿持有边、容器、搭载、安装走到第一个有位置的一环；whereOf 对非 person/place 一律走"链断"并报 E-TRIP-LEG。持有边、搭载、安装的关系写者未建，账本无"实例在谁名下"的读入口，批次 spot 字段未登记——position.mjs:303–304、:323 自述，问题.md:646、:761。卡文③点名的持有边、搭载、安装、批次 spot 均在此登记，未自编。
2. 批次落格与 `landCell` 的 `kind` 为物承面：卷五 :502、:504；问题.md:646、:590。position.mjs 给地点落格时不传 kind（人不需要承面，现无实害）。
3. 跨存量单元安置事件 `verb_subject_tract_changed` 不发：卷十七 :308；comp_tract 未登，问题.md:762。
4. placeSubject 的外部调用方（卷九 move 适配器、卷四复生移位、卷十九清理函数、行程段末落位）未建；现只由本文件的 advanceHook（rebaseBubble）与 applyBubbleTransition 内部调。卷十七 :288、:293；问题.md:399、:645。
5. 体积足迹端点的边：接入格取顶层区格、routeView 派生量按未知、路网最短路里该边按"算不出路程"不在图上。卷五 :463–465；问题.md:543、:607。

## 拿不准

1. routeView().edge 的反向项：cells 按调用方向倒写，distance、ascent 对称，terrainMix、speedFactor 取存储方向（from→to）算的值。卷五 :466 只说"按步长加权"，§4.10 :1076 的 speedFactor 以"路段各步"为序，未明写 edge 派生量是否随调用方向重算（place.mjs:1149–1165）。
2. 跨格空间多门并列取法：代码按门边 from/to id 序取第一个最小路程（route-edges.mjs:257–275）；规则 5 末句 :473「并列取法：代价、步数、格序号序列字典序依次比」是否适用于多门并列未明，问题.md:546 记"卷文未写"。
3. 洞口通路格的种类：place-volume.mjs:208 一律记 ladder；卷十 :453 只写"坡或梯"、卷五 :760 说来源是洞口通路，未给选哪一种的数据键。是否属写死种类，因该行不在本卡代码清单，未计为偏离。

## 跨卷待判

1. E-GRID-VOLUME-TOP-EXPOSED 与 E-GEN-ROW-INVALID 的分界：卷十 R10-2.14 第 2 项 :451 把"depthM 太浅"列在 E-GEN-ROW-INVALID；卷二 :1614 定义 E-GRID-VOLUME-TOP-EXPOSED；代码 place-volume.mjs:296 取后者。G8-Opus只核-1122.md:34 判"过，带建议"（建议卷十勘误），未计为代码偏离。
2. 水路边"只走 navigable 为真的水体足迹区格"（卷五 :465）与真实数据把水路连到陆上站点（问题.md:571 三条水路边）相抵：是改卷文允许岸上终点，还是改数据或代码，须人定；见正文第 2 条。
