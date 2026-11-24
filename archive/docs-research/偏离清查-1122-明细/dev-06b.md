共 3 条，甲 0 乙 3 丙 0，有理由 0 无理由 3。
本卡读了 卷五 :305-346、:547-625、:626-695、:734-786；代码读 server-plugin/kernel/place.mjs :519-853，并顺读其调用点核语义：grid-base.mjs :1-331、place-building.mjs :60-136、footprint.mjs :600-625、grid.mjs :260-334、grid-template.mjs :65-124。未读 place.mjs :1-518 与 :854 之后（planFootprints 本体）。
另（核过、不记偏离）：①sightCache 挂在"足迹计划"上，计划失效键含当日有效输入版本与偏离行；不写状态、不进存档、不进摘要，远景值只依赖区格高与建筑顶，未发现跨状态污染（卷二 §2.3 :490-509）。②叠加顺序为 基底→模板格块→体积凿空→建筑蓝图→格差分（place.mjs:682、cellAt），与卷五 :670 规则 10 字面一致（注意卷文是"体积在建筑之前"，不是卡文括注的"建筑在体积之前"）。③高度、坡度、取值域的数值全取 rules.grid（surfaceElevationMinM/MaxM、regionCellM、storeyM、heightCtrlK、reliefOctaves），range/res 未见写死数值。

### 1 materialFlagReader 直读材料表基值，不经 materialView
- 位置：server-plugin/kernel/place.mjs:525
- 设计原文：卷三乙 :541「格材料标志 `opaque`、`blocksSky`、`bearsLoad`、`airtight`……按格的当时物态取 `solid`、`liquid`、`gas` 栏……经 `materialView` 取有效值」；卷五 :746 同口径
- 代码实际：`materialFlagReader` 用 `dim(engine, state, MATERIAL, material, flag)` 读基值，未调 item.mjs 的 `materialView`（同一绕开亦见 sight.mjs:129、place-building.mjs:91）
- 理由：无（docs/研究/公共部件审查-甲-1122.md F1/R11 已列同一处；不是裁定/勘误/问题.md 的理由）
- 影响：读数错（有组件类修正项时，格标志与有效值不同；现无修正项时同值）
- 严重程度：乙
- 合并：见 docs/研究/公共部件审查-甲-1122.md F1、R11

### 2 gridView 的可立足标志不读承面家具
- 位置：server-plugin/kernel/place.mjs:696（`standable: fl.standable`；判据在 grid-base.mjs:257）
- 设计原文：卷五 :760「可立足格：本格材料可穿行（空气类），且下一格的材料能承托、或下一格有能承托的顶面，**或本格有承面家具**、梯、坡；楼梯格本身可立足。」
- 代码实际：`cellFlags` 的 standable = 气态且（梯/楼梯 或 下一格能承托），从不读本格 `fixture` 的承面高 `surfaceHeightCm`；悬空承面家具上的人/物被判不可立足
- 理由：无（家具族未建见 docs/问题.md:807；但此处不是"未知带缺口"，是判据本身未读承面）
- 影响：规则缺（落在不可立足基底上的承面家具站不住，落格/坠落会多落一层）
- 严重程度：乙
- 合并：无

### 3 细格格种类缺"坡"（ramp）
- 位置：server-plugin/kernel/place.mjs:696（`kind: c.kind || null` 透传；`CELL_KIND` 在 grid-base.mjs:16）
- 设计原文：卷五 :760「楼梯、梯、坡格把相邻两层连起来……坡格、梯格由洞穴生成器的洞口通路（卷十 R10-2.14 第 4 项）或蓝图给出」
- 代码实际：`CELL_KIND` 只有 `stairs`、`ladder`，蓝图 `KIND` 无坡，洞穴生成器只产 `ladder`；gridView 永远读不出"坡"，坡格也不在可立足种类内
- 理由：无（仅代码注释与 docs/卡回报/g8-caves.md:36 "坡暂无来源" 自述）
- 影响：规则缺（数据一旦给出坡格，种类读不出、判不可立足）
- 严重程度：乙
- 合并：无

## 已登记未建
1. 区域水体水面层与冰（格上画水）：卷五 :670-677（规则 10"水面"）；store 登记 docs/问题.md:581（G6 遗留 1）；place.mjs:687-688 对 waterKind 区格地表以上返回 `known:false`（未知，不报干地）。
2. 体积足迹水体（含水层）：卷五 :676（规则 10 末条）；登记 docs/问题.md:610（G8 遗留 5）；place.mjs:580 该体积列表读未知。
3. 有形存量位置层（树、矿体）与存量单元岩层 `stratum`：卷五 :670（规则 10 叠层次序）；登记 docs/问题.md:581（G6 遗留 1）；place.mjs:689 `rockMaterial:null`（无存量单元时取模板 `rockMaterial` 合 :670"没有存量单元时"分支），存量形态未叠。
4. 格差分材料的物态（液体差分读成固态）：卷五 :670（格差分最后一层）；登记 docs/问题.md:635（G9 遗留 2）；place.mjs:593。
5. 门、窗按此刻开合状态取材料：卷五 :605（规则 14）、:757（规则 2）；登记 docs/问题.md:774；place.mjs:571 门窗体元 `material` 为 null → 按空气行读（现不读开合状态）。

## 拿不准
1. 嵌套在区域水体足迹内的更深区域行的河床修正：place.mjs:548-554 的 `waterKind` 取最近祖先（水体行），而 footprint.mjs:604 的 bed 修正只看"最深归属行自身是否水体"；嵌套时地表高不按 bed 修正，与 cellclass 的 waterKind 口径不一致。需卷五 §4.1 界定水体足迹内可否再划区域行，再判谁对。

## 跨卷待判
1. `isStructureCell` 用 `c.kind`（蓝图种类）判结构元格，含已拆开（`breaks`）的楼梯格；place-building.mjs:129 另有 `stairs = !gone` 并把拆开楼梯读作空气。拆开的楼梯格是否仍算"体元"、`alterCells` 是否仍拒写，需卷十九 §4.1 规则 12 与 §4.5 规则 8 界定。位置：place.mjs:712。
