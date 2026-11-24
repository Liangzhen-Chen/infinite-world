共 6 条，甲 0 乙 6 丙 0，有理由 4 无理由 2。

本卡读了：卷五 :305-346、:441-520（另为核对 slope、neighbors、坡度式补读 :661、:1209-1231、:584）；卷二 :1795-1842、:490-508；卷二十 :314-380；卷十七 :351-380。代码：server-plugin/kernel/place.mjs :854-1380 全读；另补读 place-plan.mjs :167-191、footprint.mjs :746-774、route-grid.mjs :1-30/:135-154、climate.mjs :140-155、item-state.mjs :143-159、world/ontology/dimensions/place.json、_unbuilt-derived.json、docs/问题.md :505-555/:770（判"有没有记录在案的理由"用）。卡给的四个卷段与代码段全部读完，无漏读。

---

### 1 placeClimateInput 用 elevationM 顶替 surfaceRefElevationM
- 位置：server-plugin/kernel/place.mjs:1373-1374
- 设计原文：卷二十:336，"地点常年气温 = 单元 `annualMeanTempC` + `rules.climate.elevationTempGradient` ×（地点 `surfaceRefElevationM` − 单元所在地点 `elevationM`）"。
- 代码实际：`here = val(own, SITE.elevation)`（`SITE.elevation = 'elevationM'`），再把 `surfaceRefElevationM: here === undefined ? cellElevationM : here` 交给下游；climate.mjs:149/:153 确实按 `input.surfaceRefElevationM` 代入。地点自身应给的是 `surfaceRefElevationM`（卷五:113），不是 `elevationM`（代表海拔，卷五 §4.1 规则 13）。
- 理由：无（`_unbuilt-derived.json:14` 只登记 `surfaceRefElevationM` 未建，未登记"可用 elevationM 顶替"）。
- 影响：读数错——区域足迹两者相同，建筑、房间、体积（尤其地下）行取 `elevationM`（`zRange.zMin × storeyM`）与地表参照海拔不同，常年气温算偏。
- 严重程度：乙
- 合并：无

### 2 planFootprints 的返回里没有 slope
- 位置：server-plugin/kernel/place.mjs:884
- 设计原文：卷五:322，"返回：各行的 `footprint`、由足迹派生的量（`areaM2`、`centroid`、`elevationM`、`slope`、`zRange`、`waterAccess`）……"；卷五:661 给出算式"坡度 = 相邻区格中心地表高差绝对值的最大者 ÷ `regionCellM`，截到 [0, 1]；地点的 `slope` 是足迹内区格坡度的面积加权平均"。
- 代码实际：`footprints[id] = { kind, w, regionCells, cellCount, areaM2, centroid, elevationM, zRange, waterAccess }`，无 `slope`；`regionSlope`（grid-base.mjs:109）已在 place.mjs:545 用于逐区格，但未汇总进足迹。
- 理由：问题.md:528 登记为"卷文没给区格坡度的算式……待卷五澄清后同卡补"；但卷五:661 现已是算式，登记理由不成立（过时）。
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 3 placeView 缺 §3.1 视图派生字段（neighbors 等）
- 位置：server-plugin/kernel/place.mjs:1019-1025
- 设计原文：卷五:311，"§2.1'视图派生字段'表所列各项：`tree`……、`neighbors`、`products`、`statuses`、`exits`……"；卷五:1211/:1216，"读 `placeView()`（……派生的 `neighbors` 与 `products`）""`placeView().neighbors` 给出同级政区的相邻集"。
- 代码实际：placeView 只返回 `{id, dims, tree, footprint, exits}`；`neighbors` 由独立导出的 `placeNeighbors`（:916）给出且未被就地并入 `placeView`，`products`、`zones`、`stocks`、`stockSummary`、`statuses` 等均无。
- 理由：无（仅文件头注释"随各自的卡建"，属注释自述）。
- 影响：规则缺／玩法不可达
- 严重程度：乙
- 合并：无

### 4 placeView 的 dims 不含 env.*
- 位置：server-plugin/kernel/place.mjs:1004-1013
- 设计原文：卷二十:329，"`placeView().dims['env.*']` 只是 `envAt(placeId, clock.minute)` 的别名，不另存一份"；卷五:310，"§2.1 全部维度（含派生），以及卷二十登记在 place 表上的 `dims['env.*']`"。
- 代码实际：dims 只遍历 `t.doc.dimensions` 的键；`world/ontology/dimensions/place.json` 无任何 `env.*` 键，placeView 也不调 `envAt`，因此 `dims['env.*']` 全部取不到。
- 理由：问题.md:770（"卷二十 env 维度表前移后补核"，env 维度表未前移）。
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 5 三个 relation 实现函数未 declareInputs 登记
- 位置：server-plugin/kernel/place.mjs:1281 / :1287 / :1296
- 设计原文：卷二:490-497，"三类可声明节点：`view:<name>`、`relation:<rel_id>`（关系实现函数）、`scope:<scope_id>`……每类节点都用 `declareInputs(node,{impl,own,uses})`"；卷五:449，"关系实现函数是各自的 `relation:<rel_id>` 节点……依赖按该行 `inputs` 进闭包（卷二 §2.3）"。
- 代码实际：`relContains`、`relWithin`、`relResidents` 只导出为普通函数，全仓（server-plugin）无 `declareInputs` 调用，三个 `relation:rel_*` 节点都未登记。
- 理由：问题.md:532（"全仓无 `declareInputs` 调用方、`scope:located` 解析函数不存在……随作用域解析器同卡登"）。
- 影响：规则缺（依赖闭包无法生成）
- 严重程度：乙
- 合并：无

### 6 pathView 只落区格层，泡内细格寻路未做
- 位置：server-plugin/kernel/place.mjs:1258-1265
- 设计原文：卷五:473，"两位置都在现场泡内时，在细格上寻路……否则在区格上寻路"。
- 代码实际：函数一律在线格图上求，注释自述"现场泡内两位置的细格寻路（`bubbleCostCap`）归细格底子（G6 起）与卷十七 G15，本函数不给近似（一律按区格求）"。
- 理由：问题.md:545（`pathView` 只落区格层，细格寻路归 G6/G15）；:540（`bubbleCostCap` 无读者未登）。
- 影响：规则缺
- 严重程度：乙
- 合并：无

---

## 已登记未建（问题.md 有记录，代码按未知/绕开交出，不另计偏离）

- **`routeView().edge.requirement` 按未知**：卷五:313；place.mjs:1151 `requirement: UNKNOWN`；问题.md:544。
- **体积足迹端点的边派生量全未知、且不进路网最短路图**：卷五:463/:473；place.mjs:1154（栅格化失败按未知）、:1198-1199（`lengthOf === null` 跳过）；问题.md:543。
- **缓存键缺"所经里块的差分版本"**：卷五:475；place.mjs:1114-1128 `routeEnvOf` 只按足迹计划缓存；问题.md:554。
- **缓存键缺"当日有效输入版本"**：卷五:475；同上；问题.md:555。
- **`bubbleCostCap` 无读者**：卷五:473；place.mjs:1262 注"本函数不给近似"；问题.md:540。
- **体积足迹之间"一对共面细格"的相邻未落**：卷五:1216；place.mjs:921 用 `footprintAdjacency`（只按区域区格配对）；问题.md:530（足迹种类只落区域足迹，非区域足迹归 G7/G8）。
- **`depthM`、`surfaceRefElevationM`、`skyExposure` 未建**：卷五:113-115；place.mjs:1086-1088 只从体积足迹取，`_unbuilt-derived.json:7/14/175`。

## 拿不准

- **`placeNeighbors` 未按"同级政区的相邻集"过滤**：卷五:1216 写"同级政区"，place.mjs:916-928 返回全部相邻（含不同层级、自然地块）。是否该在别处过滤，卷文未明，记此待核。
- **`placeClimateInput` 找不到天气单元时返回 null 而非报错**：卷二十:335 "每个地点必能解析到一个单元"（onUnknown 栏 error）；place.mjs:1364/1369 找不到 `CELL_MARK` 时 `out = null`。世界根挂单元时实际不触发，留待确认是否按未知即可。
- **`routeView` 多出 `overCap` 字段与 `E-GRID-PATH-OVER-CAP` 告警**：卷五:313 只定义 `edge`/`path` 两部分；卷五:473 的超限结果只写给 `pathView`；place.mjs:1212/:1239-1245 把它也用在路网最短路。可能是实现扩展，记此。
- **`planFootprints` 的 probe 给"地表层号"而非"区格的地表高"，且无"所属最深区域足迹"直返**：卷五:322 要"区格的地表高与所属最深区域足迹"；place.mjs:895-906 `surfaceStoreyAt` 返回 `column.z`（层号），归属只能靠 `probe.has(id,x,y)` 逐个试。是否够用待核。
- **全仓另有 `route-grid.mjs` 的 A\*（MinHeap＋启发）**：route-grid.mjs:135-154；与 `shortestPath`（place.mjs:1185，路网边图）不是同一张图，卷五:473 明定"两个距离"各一套寻路，可能不算"另写一份"；公共部件审查-甲-1122.md 无对应条目，记此待判。
- **`placeClimateInput` 记忆键只有（engine, place）**：卷二十:330 要求缓存键含求值时刻与按日生效改写记录条数；place.mjs:1356-1358 的 `envMemo` 永不失效，改挂行的 `elevationM` 变后可能取旧值。

## 跨卷待判

- **`relResidents` 额外要求持有边 `terms.until === null`**：卷五:455 第③步只说"只留该持有者在此地点上至少有一条种类行 `domicile` 为真的边（R18-1.10）"，未写要排除已关闭边；place.mjs:1314 加了 `open` 条件。需卷十八 R18-1.10 判断已关闭边是否仍算常住，才能定是否偏离。
- **`surfaceRefElevationM` 两处算式不一致**：卷五:113 写"区域足迹取各区格代表地表高的平均；建筑、房间、体积足迹取所占各细格列地表高的平均"，而 `world/ontology/dimensions/place.json:711` 的 derived 写"`skyExposure` 大于 0 时取自身 `elevationM`，否则取 `nearest(rel_contains, surfaceRefElevationM)`"。两处口径不同，直接影响本卡第 1 条的取法，需先澄清再定。
