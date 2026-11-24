# 格子迁移 G4《路网栅格化、长途选路、routeView 改》卡回报

写：Claude Sonnet 5.5 中档（包整张卡；核心算法自己定稿）；DeepSeek flash 三张机械卡（见下）。照卷五 §3.1、§4.1 规则 4、5、7、8、9、§4.10 规则 1、5、§4.2 规则 12、§4.1.6 A5-1.1/1.2；卷十七 §4.1 R17-1.2 的 edge 读法；卷二十七 R27-6.9 第 3、6 项（只写测量点）。对照表 docs/迁移体检/格子G1-G5-规矩检查对照.md 归 G4 的第 26、27、31、32、33–42、45 行。分支 ds/g4-routes，未 push。

## 交卷前自查（卡头第三节）

| # | 问题 | 是/否 | 证据 |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 各文件头注释与测试名逐条标卷五行（规则 4 :460–:466、规则 5 :467–:473、规则 7 :475、规则 8 :476–:481、规则 9 :482–:486、§4.10 规则 1 :1067、规则 5 :1071、§4.2 规则 12 :599、A5-1.1 :533、A5-1.2 :536–:537）；卷文推不出的记 docs/问题.md "G4 遗留"，没有自编出处 |
| 2 | 没有按 id/名字/场景写特例 | 是 | 寻路与栅格化只读区格归属、词表条目字段（paceFactor、navigable）与规则表；足迹种类只按组件类；kernel 新文件里没有地点 id、地形代号、文件名字面量（terrain 族名只作词表族键 `FAMILY.terrain`）；离路穿越用同一入口，没有"只走路"开关 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | longCostCap 域 [1, null]、步进代价非正抛 E-DIM-DOMAIN-RANGE（route-grid.test.mjs 第 9 条）；展开上限 cap 取小值返回空（route-edges.test.mjs "pathView 展开上限"、route-grid 第 8 条）；paceFactor 0/负/字串/null/缺、roadPaceFactor 0 与过大、slopeCurve 含 0 均拒收（place-pace-tables.test.mjs）；门边缺 b、a 落在别处、水路门、跨格空间非门边、水路无航道均拒收；边端建筑/房间拒收 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 夹具与期望按卷文公式手算成字面量并写推算（七步正交 700 m、斜步 141.4213、speedFactor 700÷560 = 1.25、mix 3333/6667、坡度项 20555、门 0 等）；规则表值只作前提复述（regionCellM 100、roadPaceFactor 0.8、river paceFactor 4）；离路穿越按 A5-1.2 只断言性质（非空、含非路格与山脊格、路程小于沿路）；不读仓库计数 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 门禁 const_literal 命中 `ROAD` 数字枚举、`FAMILY_TERRAIN` 别名比较两处，我改成字符串枚举与 `FAMILY.terrain` 属性读（没有改名骗检测器，写法与 place.mjs 既有 `FAMILY.terrain` 同一种）；K2-46 缺 JSDoc 的导出（`inBox`、`keyOf`、`xOf`、`yOf`、`shortestPath`）补了类型标注 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | 卡文没有列文件清单；`git diff --cached --shortstat`：22 个文件，+1781 / −616，diff 共 2397 行（−616 里 place.json 因删 462 条边的 distanceM 占约 −570；新增文件 route-grid.mjs 263、route-edges.mjs 267、route-grid.test.mjs 235、route-edges.test.mjs 341、place-pace-tables.test.mjs 89、terrain-modifiers.json 12、两份回报）；卡文未列的扩展见"偏离" |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | 见下"验收" |
| 8 | 这张卡让块 6 哪一步更近了，且没违背北极星 | 是 | 路网边从"存路长"变成"由区格栅格化派生"，长途选路在区格图上求且人可离路穿越，routeView 改读派生量；G5 转换真实世界可以只写"站点之间有路"；路长、地形构成、爬升、路况都没有存储列；没有写死、特例、假数据 |

## 改了哪些文件

内核：
- `server-plugin/kernel/route-grid.mjs`（新）：区格八邻寻路 `regionPath`（带启发加速，精确并列取法）、步长 `stepLengths`、坡度项 `slopeTerm`、路段派生量 `pathMetrics`、地形构成份额 `mixShares`。纯函数。
- `server-plugin/kernel/route-edges.mjs`（新）：路网环境 `createRouteEnv`：接入格、陆路/水路/自由三种代价模型、边栅格化与缓存、路网区格集（按格空间分片、惰性）、`pathBetween`（同格空间区格寻路、跨格空间经一道门）。
- `server-plugin/kernel/place.mjs`：`routeView` 改读栅格化派生量（`edgeItem` 九项：waterway、requirement、portal、distanceM、terrainMix、ascentM、speedFactor、bearingDeg、cells）、新增 `pathView`、导出 `shortestPath`（路网图最短路，边长由调用方给）、加载校验 `checkEdgeEnds`（端点足迹种类、门边）、`checkPaceTables`（paceFactor、roadPaceFactor、slopeCurve 取值域）、`checkPlaceRasters`（水路无航道）。
- `server-plugin/kernel/footprint.mjs`：导出 `inBox`、`keyOf`、`xOf`、`yOf`，新增 `regionCellHeight`（区格中心地表高）。
- `server-plugin/kernel/load/world.mjs`：`checkRules` 提前一步（装入 det-math 开方表），水路校验排在它之后。
- `server-plugin/kernel/files.json`：登记两个新文件。

数据：
- `world/ontology/dimensions/place.json`：表头 `edgeStruct` 删 `distanceM`、`openness`，加 `portal`；462 条边重转（只剩 from/to/waterway）。`tools/convert-geo.mjs`：不再搬入路长。
- `world/ontology/dimensions/_vocab.json`：terrain 族十条加 `paceFactor`（DS）。
- `world/rules/registry.json`、`world/rules/tables/grid.json`（roadPaceFactor、longCostCap）、`world/rules/tables/terrain-modifiers.json`（新，slopeCurve）（DS）。

测试：
- `tests/kernel/route-grid.test.mjs`（新，DS 写、我审）16 条；`tests/kernel/route-edges.test.mjs`（新，我写）21 条；`tests/kernel/place-pace-tables.test.mjs`（新，DS 写、我审）6 条。
- 因规则改（路长不存储）改了三个既有测试文件，改的是前提与口径，不是放宽断言：`place.test.mjs`（边节加载用例去掉 distanceM；最短路并列取法改经 `shortestPath` 用抽象边长核；删"边的属性组"一条，由 route-edges.test.mjs 取代）、`place-footprint.test.mjs`（边去掉 distanceM、水路边改陆路边（STRIP 夹具没有可航水体，否则新校验拒收）、路程断言改地点序列、"没有格空间表"一条改成派生量按未知）、`place-world.test.mjs`（"distanceM 为千米折米"改为"边只有 from/to/waterway"）。
- 文档：`docs/PLAN.md`（G4 节）、`docs/问题.md`（G4 遗留）、本回报。

## 对照表各行怎么落

| 行 | 落点（测试名；文件） |
|---|---|
| 26 两种距离 | straightM 对称与三角不等式（G3 已有，footprint.test.mjs）；路程：`path：去程回程路程相同、互为逆序…`、`pathView 沿路…回程同路程互为逆序`、`pathView 位置只到区格精度…`（route-edges.test.mjs） |
| 27 方位角 | `bearingDeg 正北 0、东北 45`、`bearingDeg：路段取两端形心…东 90、西 270`（route-edges.test.mjs）；朝向相对方位 G3 已有 |
| 31 离场行 | `离场行：…`（place-footprint.test.mjs，routeView 端为离场行时 edge 空、path null）；环境构建时过滤离场行的边（place.mjs `routeEnvOf`） |
| 32 exits | `placeView().exits 的路与路段首格一致`（route-edges.test.mjs）；三种出口排序 G3 已有，"门"归 G7（后半移交） |
| 33 边存法 | `边两端只许区域或体积足迹的行…`、`路段派生量不存储…`（route-edges.test.mjs）；`规则 4 正例/反例`、`边的字段（A5-1.1）`（place.test.mjs）；`边：…不存路长`（place-world.test.mjs，真实世界 462 条边） |
| 34 接入格与栅格化 | `路段派生量（平地陆路）`（首尾格在两足迹内、七步相接）、`斜向步长`（并列取法手算）、`水路边：沿可航水体足迹区格走…`、`水路边：两端之间没有通航水域即加载报错…`（route-edges.test.mjs）；route-grid.test.mjs 第 1–10 条（寻路手算：斜走、并列字典序、步数少者胜、绕障、不通、上限、启发不改结果）；体积端取顶层区格归 G8、建筑房间出入归 G7（后半移交） |
| 35 路段派生量 | `路段派生量（平地陆路）`、`有高差：ascentM…`（route-edges.test.mjs）；route-grid.test.mjs 第 13–16 条（distance 各步步长和、ascent 高差绝对值和、mix 和为 1、speed 手算） |
| 36 路网最短路 | `path：去程回程…不连通为 null`、`edge 形状…`（route-edges.test.mjs）；place.test.mjs 的并列一、二、三、边表顺序打乱、边长 0、不连通、定点相加（`shortestPath`） |
| 37 pathView | `离路穿越…`（A5-1.2 夹具：脊上有非道路格、路程小于沿路）、`荒野里也有路径…`、`pathView 展开上限…`（route-edges.test.mjs）；现场泡细格寻路归 G15（后半移交） |
| 38 路况系数 | `place-pace-tables.test.mjs` 六条（paceFactor、roadPaceFactor 上限与 0、slopeCurve 严格大于 0）；`有高差…speedFactor > 0 且不超过平地值`、平地 `speedFactor` 1.25（道路步进系数 0.8 ≤ 平原 1）；门边与水路边不乘坡度项：route-grid.test.mjs 第 14、15 条与 `门边…` |
| 39 门边 | `门边：穿门一步、路程 0…`、`pathView 跨格空间…`、`门边加载校验…`（route-edges.test.mjs）；跨格空间直线距离为未知（G3 已有） |
| 40 缓存与确定性 | `缓存与确定性…`（同输入两次逐格相同；重新加载同世界相同；偏离行改锚点后重算、回到原输入读原结果）；"所经里块的差分版本"未落（差分归 G6），记 docs/问题.md |
| 41 edge 形状 | `edge 形状…`（九个键齐、陆路在前）；cells 随调用方向（`path…`、`斜向步长`） |
| 42 性能门 | 不在本机跑；测量点：`regionPath` 返回的 `expanded`（`pm_path_expanded` 规模判据）、`pathView` 单次耗时（`pm_path_long_ms` 只记录不拦，预算留空）；仓库没有性能基准登记表，登记**待腾讯云**（第 2、3 步各一次，R27-6.9 开头） |
| 45 门禁/零计数 | 门禁 vol5.S5-10 不动、仍在通过之列（新文件在 kernel 组内，几何只经 det-math 的 fixedSqrtInt、atan 与 `bearingView`）；A5-1.1：`路段派生量不存储`、place-world 的边键用例；pre_commit verdict pass |

## 委派 DeepSeek 与改正

- 卡 1 `F:/dnd-tmp/card-g4-ds-1.md`（flash）：登记 paceFactor 十条、roadPaceFactor、longCostCap、slopeCurve（registry、grid.json、terrain-modifiers.json、_vocab.json）。逐行审 diff，数值与 basis 照我给的表，**改正 0 处**。
- 卡 2 `F:/dnd-tmp/card-g4-ds-2.md`（flash）：route-grid.test.mjs 16 条手算用例。我逐条重算期望，**改正 1 处**（注释笔误"步度项"→"坡度项"）；断言没改。
- 卡 3 `F:/dnd-tmp/card-g4-ds-3.md`（flash）：place-pace-tables.test.mjs 六条加载校验。**改正 0 处**。
- 我自己写：route-grid.mjs、route-edges.mjs、place.mjs 与 footprint.mjs/world.mjs 的改动、route-edges.test.mjs、既有三个测试的改口径、convert-geo 与表头、文档。

## 须 Opus 核的点

1. `regionPath` 的并列取法精确性：带启发搜索 + 展开全部 f ≤ C* 的节点 + 在"代价紧"的弧上先算最少步数再从起点按区格序号字典序贪心。依据：每步代价由单次整除得到、启发下界用同式取各系数最小值（可采纳且一致）。请核可采纳性（`lowerOf` 取 min(各 paceFactor, roadPaceFactor) × min(slopeCurve y, 1)）与"贪心取最小下一格 = 序列字典序最小"。
2. `pathView` 方向取法（从区格序号小端求再倒写，见 docs/问题.md）。
3. `mixShares` 用最大余数法凑满 1（卷文没给取整法）。
4. `load/world.mjs` 把 `checkRules` 提前、水路校验在装表之后（对其它校验无影响）。
5. `roadPaceFactor` 校验按"全部 terrain 条目"（卷文"全部陆地地形"）。
6. 性能：每次 `attrs` 分配小对象、逐格高度控制面排序在 10⁶ 区格量级是热点，腾讯云实测前不下结论。

## 偏离与未落

- **偏离**：① 提前做了对照表第 43 行（G5）的一半：真实世界 `place.json` 的 462 条边删 distanceM（改 convert-geo.mjs 重转），否则新边校验下真实世界加载不了；室内房间边、建筑行同点仍归 G5。② 改了 `load/world.mjs`（卡文未列）：水路无航道校验要开方表，表在 checkRules 之后才装入。③ 既有三个测试改了前提与口径（不是放宽断言，见上）。④ 导出 `shortestPath` 与 footprint 的四个下标函数供测试与共用。
- **未落（原因都在 docs/问题.md "G4 遗留"）**：卷十七 tripPlan 本体（不在本卡）；`requirement`（需求块未登记，按未知）；体积足迹端点边的栅格化（G8）；细格寻路与 `bubbleCostCap`（G6、G15）；缓存键里的里块差分版本（G6）；四项规则常数卷文无数值、全部"暂定·待试玩标定"；性能基准（待腾讯云）。
- **命令纪律自报**：我自己误用了一次 `cd`（被拦、无副作用）、一次 `2>&1`（跑门禁，未写文件）、一次 `sed -i`（被拦、无副作用）；DeepSeek 三张卡的汇报里没有自报违规命令（我没有逐条核它的命令记录）。

## 验收

- `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：末行 `ℹ tests 1413 / ℹ pass 1413 / ℹ fail 0`。
- `node tools/accept/run.mjs pre_commit`：`"verdict": "pass"`；失败项只有基线三项（vol12.A12-4.5、S12-2、S12-3），vol5.S5-10 不在失败列表。

## 修改轮（照 docs/审查/G4-Opus只核-1121.md 三条必须改；不动内核代码）

- M1：route-edges.test.mjs 新增"path 并列取法固定从 id 较小端求再倒写（分辨性）"：6×3 区格上下镜像两条等长三边路线（P = a–b–e–d、Q = a–c–bb–d，各 2×141.4213 + 300 = 582.8426），断言 `routeView(a, d).path.places` 为 P、`routeView(d, a).path.places` 为 P 的倒写、两向路程都是 582.8426；若改成从 loc_d 写起 Q 会胜，所以能分辨。期望手算，没有放宽。
- M2：docs/问题.md 把 pathView 方向取法改记为"卷文矛盾，等李白裁定"：引卷五 :470 与 A5-1.2 :537，说明步价只看终点区格时两句不能同时成立，改正错引（规则 5 :469 倒写只说 `routeView().path`），写明现行取法与甲乙丙三种改法，并一并请示"陆地地形"口径与跨门并列取法。
- M3：grid.json longCostCap 的 basis 删"展开数远小于此"，改为如实口径（只有容器量级依据；复核实测展开数约 0.24–0.5 × 路长²，300 km 外推约 200 万–450 万，超现上限，长途 pathView 现会返回空）；问题.md 补实测数，另记一条"等李白裁定"（调高上限 / 分层寻路 / 改并列取法，各写代价）；数值与算法未动。
- 验收：`node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` 末行 `ℹ tests 1414 / ℹ pass 1414 / ℹ fail 0`；`node tools/accept/run.mjs pre_commit` `"verdict": "pass"`，失败项只有基线三项，S5-10 不在失败列表。
- 须主会话报李白：长途 300 km pathView 超上限（重大异常）。
