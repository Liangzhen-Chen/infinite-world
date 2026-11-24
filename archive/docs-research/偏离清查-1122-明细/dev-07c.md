共 4 条，甲 0 乙 2 丙 2，有理由 2 无理由 2。

本卡读了：卷五 :246-247、:250、:255、:268-299、:419-429、:588-617、:626-695、:787-827、:829-946、:1063-1097；world/rules/tables/grid.json:1-79、terrain-modifiers.json:1-12；world/ontology/dimensions/_vocab.json:58-70、:2763-2778、:3076-3083；world/rules/registry.json:365-406；world/ontology/dimensions/_unbuilt-derived.json:190-229；server-plugin/kernel/place.mjs:1262、:1499-1518；server-plugin/kernel/grid.mjs:282-326；对 server-plugin 全库只做键名 grep 引用计数。
没读到：卷五 §4.4–§4.9 正文、§4.11 以后各节；server-plugin 其余实现未逐行读（本卡查数据）。

---

### 1 十个 terrain 条目缺 §2.2 声明的 roughness、coverScore 两个字段
- 位置：world/ontology/dimensions/_vocab.json:2766-2775（10 条 terrain 条目，每条只有 reliefM/reliefRough/paceFactor）
- 设计原文：卷五 :246「`terrain` … `paceFactor: number`、`roughness: fraction`、`coverScore: score`、`reliefM…」；:1079「战场地形读交战地点的 `terrain` 条目字段 `roughness`、`coverScore`」。
- 代码实际：10 条 terrain 条目全部没有 roughness 与 coverScore；server-plugin 全库 grep 这两个名字为 0 处。
- 理由：无（各条 basis 只解释 reliefM/reliefRough/paceFactor 为何暂定，未解释这两项为何不填；docs/问题.md 与李白裁定未记）。
- 影响：规则缺（§4.10 规则 4 的战场地形难行量与掩护量读不到，卷十三 §4.9 无法按条目字段取值）。
- 严重程度：乙
- 合并：无

### 2 cellclass 的 slopeRange 全为 null，坡度条件被 null 绕过
- 位置：world/ontology/dimensions/_vocab.json:58-70（cellclass_cave…cellclass_water 共 11 条，slopeRange 全 null）；server-plugin/kernel/grid.mjs:314-317（只在 Array 且长度>1 时比区间，null 直接跳过，视为不限）
- 设计原文：卷五 :247「`slopeRange: [min,max]`」（无 nullable；同一行 onRoad/inSettlement 明写 `boolean nullable`「空表示不限」）；:669 规则 9「坡度在 `slopeRange` 内」。
- 代码实际：11 条 cellclass 的 slopeRange 都是 null，`matchesCellClass` 对 null 不作坡度判定，坡度条件在全部区格上从不生效；[0,1] 的覆盖只靠「null=不限」这个卷文没写的解释成立。
- 理由：有（docs/问题.md:518「slopeRange 长度不足现静默放行，cellclass 条目 schema 登记时改拒收」；但该条只覆盖数组长度，未写 null 算不算不限）。
- 影响：规则缺（规则 9 的坡度判据可被 null 绕过；分区不成立时不会有加载错误）。
- 严重程度：乙
- 合并：见 docs/问题.md:518

### 3 grid.json 含 §2.3 内容表未列的四个键
- 位置：world/rules/tables/grid.json:14（fullTurnDeg）、:19（facingDirections）、:44（surfaceElevationMinM）、:49（surfaceElevationMaxM）
- 设计原文：卷五 :274 的 grid.json 内容只列 cellM/storeyM/regionCellM/chunkRegionCells/heightCtrlK/reliefOctaves/farSightStepRegionCells/farSightMaxSamples/landSearchRadiusCells/roadPaceFactor/bubbleCostCap/longCostCap，未列这四个键。
- 代码实际：grid.json 多出 fullTurnDeg=360、facingDirections=8、surfaceElevationMinM=-12000、surfaceElevationMaxM=9000 四行。
- 理由：有（值有卷文出处：§4.2 规则 12 :603 方位角 [0,360)、§2.1 :100 facing 八向 [0,7] 每档 45 度、§4.1.1 :428 海拔 [−12000,9000]；registry.json:393 已登记四键及其读者。只是没写进 §2.3 的内容表）。
- 影响：只是形式（值正确、出处可查，加载与读者均按 registry 走）。
- 严重程度：丙
- 合并：无

### 4 两张规则表放在 tables 根，未按 §2.3 的 place/ 子目录存放
- 位置：world/rules/tables/grid.json:1、world/rules/tables/terrain-modifiers.json:1
- 设计原文：卷五 :268「### 2.3 本卷规则表（常数只在这里；路径 `world/rules/tables/place/`）」。
- 代码实际：两表都在 world/rules/tables/ 根，仓库没有 place/ 子目录；registry.json:367、:399 的 file 也写 tables/grid.json、tables/terrain-modifiers.json。
- 理由：无（未找到裁定或勘误允许平铺；economy/ 子目录已在用，说明子目录不是不用）。
- 影响：只是形式（加载按 registry 的 file 平铺路径能读到，与卷文写的路径不符）。
- 严重程度：丙
- 合并：无

---

## 已登记未建
- **grid.json 缺 bubbleCostCap**：卷五 :274 列在 grid.json 内容里；登记处 world/rules/registry.json:393「landSearchRadiusCells/bubbleCostCap 随其消费者卡登」，server-plugin/kernel/place.mjs:1262 注「现场泡内细格寻路（bubbleCostCap）归 G6 与卷十七 G15」。server-plugin 全库只有这一处注释提到它，无真实读值。
- **terrain-modifiers.json 缺 byTerrain/byBiome/bySite**：卷五 :280、§4.10.1 :1068 要求这三张 map；登记处 world/rules/registry.json:403「本卡只登有运行期读者的键，byTerrain/byBiome/bySite 修正项模板随卷二 §3.3 管线的读者卡登」。三键在 server-plugin 引用为 0。
- **biome 族无条目**：卷五 §4.3 :633-647 定义 envelope/priority/floraKgPerM2/faunaKgPerM2/growthResponse；登记处 world/ontology/dimensions/_unbuilt-derived.json:209（family biome，pre_first_reader_card）。world 内无 biome_ 条目，§4.3 规则 2、3 无法验证。
- **site 族无条目**：卷五 §4.6.1 :792 定义 popRange/needsEnclosure/permanent/governed/accessDefault/promotesTo/demotesTo/rank/heldBy；登记处 _unbuilt-derived.json:216。§4.6 规则 3、4 无法验证。
- **rfield 族与 resource-field-types.json 未建**：卷五 §2.2 :255、§4.7.1 :836-845 定义 stockKinds/stockWhen/placeWhen/facilityType/minCapacityKg；登记处 docs/问题.md:367（「卷五 §4.7–§4.9 资源场与取用按块 6 体检归块 7」）。_vocab.json 与 _unbuilt-derived.json 均无 rfield，server-plugin 无 resource-field.mjs。

## 拿不准
- **water_navigable 条目缺 `flowing`**：卷五 §2.2 :250「`flowing: boolean`（每个条目必写，不设缺省）」；world/ontology/dimensions/_vocab.json:3080 的 water_navigable 只有 `{"navigable": true}`，water_lake/water_saltlake/water_river/water_sea 都有 flowing。water 族不在本卡列出的族内（卡只让查 terrain/biome/site_type/resource_field），但 §4.3 规则 10 :673 靠 flowing 分静水全片一个水面、流水逐区格，属本卷地形规则的直接输入；归哪张卡待判。

## 跨卷待判
- 无。
