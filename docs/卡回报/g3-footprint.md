# 格子迁移 G3《足迹划分、zoneAt、place.mjs 包含校验与纬度》卡回报

写：Claude Sonnet 5.5 中档（包整张卡；核心算法自己定稿）；DeepSeek flash 两张机械卡（见下）。照卷五 §2.1、§3.1、§4.1.1、§4.1.3 规则 1–5、10、§4.1.4、§4.2 规则 12–13、§4.14 规则 2；卷二 §1.2 byFootprint、§4.3 勘误 1121k1 六码；对照表 docs/迁移体检/格子G1-G5-规矩检查对照.md 归 G3 各行。分支 ds/g3-footprint，未 push。

## 交卷前自查（卡头第三节）

| # | 问题 | 是/否 | 证据 |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 各文件头注释与测试用例名逐条标卷五行（规则 2 :457、规则 3 :458、规则 9 :481–:485、规则 10 :486–:489、规则 12 :494、规则 13 :495、规则 14 :496–:500、§4.2 规则 12–13 :599–:600、§4.14 规则 2 :1199）；卷文推不出的记 docs/问题.md "G3 遗留"，没有自编出处 |
| 2 | 没有按 id/名字/场景写特例 | 是 | 足迹种类只按组件类（footprint-kind.mjs）；坐标、区格、父子只用数据；kernel 里没有地点 id/名字字面量；离场判据读词表条目 relocatable，不点名组件类 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | tests/kernel/place-footprint-columns.test.mjs（DS 写、我审）：targetAreaM2/anchorElevationM/coord/boundary/spanZ/facing/anchor/gridSpaces 的 0、负、小数、null、缺字段、空列表逐条；我另补 gridSpaces 写成 null/对象/字串拒收、空 boundary 按派生划分、centroid/zRange 手填拒收 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 夹具与期望全部手算成字面量并在注释写推算（8+8 划分逐轮、形心 (112.5,162.5)、层号 floor(200÷3)=66、纬度 37.738+162.5÷111120 截断 =37.7394 等）；rules.grid 的值只作测试前提复述 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 门禁 const_literal 命中 5 处我改了写法（堆元素改对象、出口次序改数组下标），没有改常量名骗检测器；规则常数新增 cellM、fullTurnDeg、facingDirections 都进 grid.json 并在 registry 登记 |
| 6 | 只改了卡文列出的文件；diff 共 约 2950 行 | 是 | 已跟踪文件 +926/−131（19 个文件）；新增 8 个文件共 1836 行（footprint.mjs 537、footprint-kind.mjs 26、place-plan.mjs 149、named-structs.mjs 66、三个测试 + DS 一个测试）；卡文未列的扩展见"偏离与扩展" |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` 末行见下"验收" |
| 8 | 这张卡让块 6 哪一步更近了，且没违背北极星 | 是 | 区域足迹划分、zoneAt、包含校验、形心与纬度落地，G4 路网栅格化与 G5 转换有地基；没有写死、特例、假数据 |

## 改了哪些文件

核心算法（我自己写）：
- server-plugin/kernel/footprint.mjs（新）：区域足迹划分 planRegionFootprints（卷五 §4.1 规则 10：作者 boundary 先占格；其余以 coord 所在区格为种子，目标格数 = ceil(targetAreaM2 ÷ regionCellM²)，无目标者平分"父格数 − 覆盖格数 − 有目标者目标和"，非正或不足一格取 1；多源同步生长，每轮按子行 id 码点序取离自己种子最近的四邻空格，并列 (x,y) 字典序；用堆，O(n log n)；违规记 errors 不抛）；zoneOfPos、regionOfPos、cellList、regionGeometry（面积、形心，区格粒度、向零截断）、regionHeights（elevationM、zRange）、regionCellPos、landRegionCell、accessCell、openBoundaryCells、footprintAdjacency、straightM（fixedSqrtInt）、bearingView（atan，前后左右，上下）。
- server-plugin/kernel/footprint-kind.mjs（新）：足迹种类 footprintKindOf（卷五 §4.1 规则 2，只按组件类）；加载期必填条件与运行期共用，避开 import 环。
- server-plugin/kernel/place-plan.mjs（新）：地点行 → 划分输入的整理 buildPlan（足迹种类、离场子树、层根）、waterAccessOf、edgeAdjacency。
- server-plugin/kernel/place.mjs：加载校验 checkPlaceTable 重写——删等效圆坐标包含与面积和（旧规则 3），改足迹包含；单根不计离场行；足迹输入列按种类禁填（E-DIM-DOMAIN-RANGE）；coord 缺字段、anchor 不合 struct:pos；gridSpaces 节校验；层根/格空间对应；cellclass 覆盖校验（E-GRID-CELL-NO-TERRAIN）。运行期：zoneAt、locatedChainOf、regionCell、landCell、planFootprints、placeNeighbors、placeFootprint、straightM、bearingView 入口；placeView 加 footprint、exits，centroid/zRange 由足迹给值，离场行位置量与派生量按未知；routeView 离场端为空；placeLatitude 改读 centroid。
- server-plugin/kernel/grid.mjs：landOrderKey（种子抽取点 grid/land，登 seed-keys.json 第三行）。
- server-plugin/kernel/validate/rows.mjs：必填写法 byFootprint:<种类>（卷二 §1.2 :105）。
- server-plugin/kernel/error-codes.mjs + tests/kernel/error-codes.test.mjs（计数 596→602）：登卷二 §4.3 勘误 1121k1 六码（E-GRID-FOOTPRINT-OUTSIDE-PARENT、SIBLING-OVERLAP、SEED-SAME-CELL、WATERWAY-NO-CHANNEL、VOLUME-TOP-EXPOSED、CELL-NO-TERRAIN；后两个无调用方，随 G4、G8 用，卷二表本就整组登）。
- server-plugin/kernel/files.json、world/ontology/state-owners.json（kernelApi 登 zoneAt、regionCell、landCell、planFootprints、placeNeighbors、locatedChainOf、straightM、bearingView）。
- 数据：world/ontology/dimensions/place.json（新列 anchor、anchorElevationM、boundary、centroid、facing、spanZ、targetAreaM2、waterKind、zRange；gridSpaceStruct；coord、terrain 改 byFootprint 必填）、_vocab.json（comp_facility、comp_layer_root、comp_volume、comp_zone）、_unbuilt-derived.json（centroid、zRange 由 placeView 求；anchorElevationM 缺值放行 card g5）、world/rules/tables/grid.json 与 registry.json（cellM、fullTurnDeg、facingDirections）、seed-keys.json。
- tools/accept/criteria.json：12 类判据 rev+1 带修订记录（检测器 import 闭包含 error-codes.mjs、validate/rows.mjs→footprint-kind.mjs，指纹变；经仓库登记器 register.mjs 写，临时助手 F:/dnd-tmp/g3-bump-criteria.mjs，同 B2-W3、G2 先例）；tests/accept/temp-repo.mjs 加复制 footprint-kind.mjs。
- docs/问题.md：删两条已落实（G1 记账 POS_FIELDS、G2 E-GRID-CELL-NO-TERRAIN 未登），加"G3 遗留"。
- 既有测试 tests/kernel/place.test.mjs：夹具 row() 加 anchorElevationM（新必填列）；删旧规则 3 的面积和 1 条与等效圆坐标包含 3 条（旧校验被卷五 §4.1 规则 3 取代，行为已删，用例随之删；coord 结构特殊值那条保留）。

DeepSeek 委派（两张都 flash，我逐行审）：
1. F:/dnd-tmp/card-g3-ds-1.md：events.mjs 的 POS_FIELDS 改从命名 struct 登记派生（新 named-structs.mjs 含 installNamedStructs/posStructFields/isPosValue；world.mjs 读 named-structs.json 在校验通过后装入；tests/kernel/named-structs-pos.test.mjs）。我改正：无逻辑改正；files.json 登记由我加（卡文禁它碰）；place.mjs 的 anchor 校验沿用它的 isPosValue。
2. F:/dnd-tmp/card-g3-ds-2.md：tests/kernel/place-footprint-columns.test.mjs（足迹输入列与格空间表特殊值，7 组表驱动）。我改正：无（期望码与我的表一致，一次通过）；它和 place-footprint.test.mjs 复制的 72 行夹具是重复，留待清理。

## 对照表各行怎么落（测试名在 tests/kernel/footprint.test.mjs〔F〕、place-footprint.test.mjs〔P〕、place-footprint-columns.test.mjs〔C〕、place.test.mjs〔O〕）

- #9 cellclass 与 waterAccess：〔P〕"E-GRID-CELL-NO-TERRAIN：…"、"waterAccess：…"。waterAccess 在 footprint 里给（stored 列待 G5 转派生）。
- #17 单根（不计离场）：〔O〕规则 1 正反例（多根、成环、自指）、〔P〕"离场行：没有可改挂的组件类时它是第二个根…"。
- #18 层级足迹种类不靠名字：〔F〕"规则 2：足迹种类只按组件类判…"、〔P〕房间足迹与体积足迹用例（新增组件类行自动得种类）。
- #19 包含与不重叠：〔F〕"规则 3：子足迹 ⊆ 父足迹…"、"规则 3/10 校验…"；〔P〕"包含与不重叠…"、"规则 3 层根除外…"。体积父覆盖列移交 G8。
- #20 划分：〔F〕"规则 10：多源同步生长…8+8"、打乱顺序逐格相同、确定性、目标面积取整、无格可取、野外归父、作者覆盖、种子校验；〔P〕加载层三个 E-GRID 码。
- #21 zoneAt：〔F〕"规则 12：位置在外包框之外…"；〔P〕"zoneAt：…"、"zoneAt 抽样…（A5-1.2 缩小版 16 格）"、"没登记格空间表的世界：…"。10⁴ 格抽样用 4×4 全格代替；位置形状错拒收。
- #22 派生几何量：〔F〕"规则 13：areaM2、centroid…"、"…elevationM、zRange…"；〔P〕"placeView：footprint…"、"placeView：zRange…"。
- #23 删等效圆：〔O〕见上，〔P〕"等效圆坐标包含已删…"。
- #24 纬度：〔P〕"纬度改由形心派生…"（形心变纬度变）、"纬度：格世界里形心未知即未知…"、"纬度过渡…"。
- #25 落格：〔F〕"规则 14 落格…"、regionCell；〔P〕"regionCell…landCell…"。coarse 为假抛 E-DET-DOMAIN（细格基底归 G6）。
- #26 直线距离：〔F〕3-4-5、含层高 5-12-13、对称、三角不等式 +2、跨格空间未知；〔P〕入口形状。
- #27 方位角：〔F〕0/90/45/180/270/225/315、一般角、前后左右、上下、非法朝向。
- #28 相邻：〔F〕两条；〔P〕"placeNeighbors：…"（足迹邻接＋路网边两端在子树内，祖先后代不算，离场不参加）。
- #29 byFootprint 必填禁填：〔P〕"byFootprint 必填…""禁填…""byFootprint：建筑行缺 anchor…体积行…""房间足迹…"；〔C〕全部特殊值。
- #30 located 起点：〔P〕"located 起点…"（locatedChainOf；zoneAt 未知为 null）。依赖闭包登记未落（见下）。
- #31 离场行读法：〔P〕"离场读法：…"（zoneAt 不返回、足迹量与位置量未知、exits 空、routeView 端为空、离场边不算相邻与出口、不参加划分）。
- #32 exits：〔P〕"placeView().exits：…"（路、开阔边界，排序固定，离场为空）。"门"归 G7。
- #45 S5-10：门禁 vol5.S5-10 仍 pass（kernel 组内放几何；kernelApi 登了入口）。A5-1.1 存储列零计数由加载器未知字段校验守。
- 欠账两笔：E-GRID-CELL-NO-TERRAIN 登记并在加载期拒收（〔P〕）；events.mjs POS_FIELDS 改派生（DS 卡 1）。

## 验收

- `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：末行 `ℹ tests 1368`、`ℹ pass 1368`、`ℹ fail 0`。
- `node tools/accept/run.mjs pre_commit`：末行 `"verdict": "pass"`；items 失败三项仍是基线 vol12 A12-4.5、S12-2、S12-3（与 master 14b9c4e10 同，无新增），vol5.S5-10 pass（不在失败项里，openHits 全 0 除既有 item_ledger、registry_write、param_consumed、crit_version 登记计数）。

## 偏离与未落

偏离（卡文外的必要扩展，已在 docs/问题.md "G3 遗留"记）：改了 tests/accept/temp-repo.mjs、tools/accept/criteria.json（登记器写）、world/ontology/dimensions/_vocab.json、_unbuilt-derived.json、registry.json、place.json 表头——都是本卡新增列、规则表键、组件类、门禁指纹的必需接点。
未落（卷文推不出或归后卡）：
- 区格坡度与 `slope`、`skyExposure`：卷五没给区格坡度算式；
- exits 的"门"（G7）、体积/建筑/房间的格与最深足迹、体积父覆盖列、E-GRID-VOLUME-TOP-EXPOSED（G7/G8）、路网栅格化与 E-GRID-WATERWAY-NO-CHANNEL（G4）；
- landCell coarse 为假（可立足细格，G6）；
- located/jurisdiction 作用域解析器与"zoneAt 节点进依赖闭包"：全仓没有 declareInputs 调用方、没有 scope 解析函数，G3 只落个体一侧起点函数 locatedChainOf；
- 真实世界（无 gridSpaces）足迹与区格校验休眠，纬度暂读旧 coord（过渡，G5 必删）。

## 须 Opus 核的点

1. 足迹校验"无 gridSpaces 即休眠"加上 placeLatitude 的 coord 过渡回落，是否可接受（否则真实世界与 12 条真实数据测试无法读纬度，而 G5 之前无法造出格空间表）。
2. 开阔边界"可通行 = 外侧区格在外包框内"的口径；cellclass 覆盖校验的探针式口径（全组合要求兜底，onRoad 与坡度未取实际值）。
3. 禁填报 E-DIM-DOMAIN-RANGE、层根/格空间错报 E-DIM-REF-MISSING / E-DIM-DOMAIN-RANGE、相对方位 ASCII 代号等卷文没给的取名。
4. 多源同步生长里"没有目标面积者平分"的取整（向下取整、至少 1 格）；卷十 R10-2.4 的种子排布与本划分的衔接。
5. 门禁指纹重盖是否按 R12-14.3 理解正确（12 类 rev+1）。
6. 命令纪律自报：本会话多次用 `cd … &&`；误用 sort -u 两次、python --version、node --input-type=module --eval、一次 `> /dev/null 2>&1`（均无写入副作用，F:/dnd-tmp 下只有自写脚本与卡文）。

## 修改轮（Opus 只核 docs/审查/G3-Opus只核-1121.md，必须改四项）

- M4（甲）：`placeLatitude` 恢复读 coord，删"纬度过渡"与形心纬度用例；足迹与区格校验不再有"缺 gridSpaces 即整段跳过"的开关，缺节按空表走同一条路径（节写成 null/对象仍拒）；删"主世界根须有格空间行"的必有校验（层根必须有格空间、格空间根必须是层根仍校，真实世界无层根不受影响）。"纬度改读形心"与"世界必有格空间表"改归 G5，已写入对照表移交（对照表末两行）与 docs/问题.md。
- M1：footprint.mjs 区格归属改 Int32Array、足迹改整型数组（层根足迹不另存），去掉全部 Map/Set 装区格；父足迹成员判定用归属加祖先链；面积/形心、相邻集（整格空间只算一次，signature 去掉 parentOf）、控制点、各行高度按计划缓存，计划随生成输入重划即缓存丢弃。新增 2,000×2,000 三层树用例（本机 2 秒内）：总格数与各层格数守恒、再划逐位相同。量级说明见问题.md"规模（M1）"：归属数组全规模约 160 MB，逐格高度与里块分块随性能门腾讯云测。
- M2：方位角只用整圈度数（四分之一圈、八分之一圈由整圈右移得出），朝向档数只管相对方位；档数不是八时 relative 为 null；新增用例（16、4 档方位角逐值同 8 档）。
- M3：cellclass 坡度探针加相邻端点中点（定点移位取中），补 [0,0.1] 与 [0.2,1] 空档报 E-GRID-CELL-NO-TERRAIN、[0,0.1] 与 [0.1,1] 相接不报的用例。
- ③ 取名建议已记 docs/问题.md；重复夹具未并（不强制）。criteria.json 指纹无新变化（闭包文件本轮未动）。
- 验收：末行见提交说明所附命令（全量与 pre_commit 本轮已复跑）。

## 末处三补（Opus 第二轮）

- ① M2：删"档数非 8 时 relative 为 null"，相对方位照八向算；规则表 grid 的 facingDirections 登记取值域改 [8,8]，非八加载拒收（E-DIM-DOMAIN-RANGE），新增加载拒收用例，16/4 档用例只留方位角逐值相同。
- ② M1：划分完成后 plan.queued 置 null 不常驻（用例断言）；160 MB 常驻可接受，绝对预算记 docs/问题.md 归 G5 腾讯云实测。
- ③ M4：格空间行非对象时 place.mjs 只对对象行做根核对，不再抛 TypeError，由 checkGridSpaces 报 E-DIM-STRUCT-FIELD；补用例（null、数字、字串）。
- 纪律自报：本轮无 cd；误敲一次 `sed -i … /dev/null`（无效果）。
