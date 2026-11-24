共 9 条，甲 0 乙 5 丙 4，有理由 7 无理由 2。
本卡读了：卷五 :400-560、:725-799、:1212-1221（邻接句 :1216）；卷二 :1790-1849、:469（横切入口一行）；卷十 :449-455（父行与先序兄弟体积的生成约束）；文件：footprint.mjs :1-854、footprint-kind.mjs :1-29、place-volume.mjs :1-334 全读，旁证 place.mjs :220-250/:255-324/:405-445/:935-990/:1060-1105/:1520-1630 按需取段、cave.mjs :90-215、place-building.mjs :330-388、place-plan.mjs :60-150、blueprint.mjs :430-511、grid-diff.mjs :126-180、grid.json、place.json（boundary/mouth/targetAreaM2 段）、_unbuilt-derived.json、问题.md :520-560/:598-619/:640-649/:763-765/:878/:984、公共部件审查-甲/乙与模块化评估相关节。没读：卷五 §4.2、§4.3 正文、§4.14 正文（只核 :1216 一句）、卷二 §5.6 与本卡另核的 :469 之外；bearingView 的设计行（§4.2 规则 12–13）不在本卡范围，未判。
说明：footprint.mjs 内没有"痕迹/残留"函数；三文件未发现浮点除法（除法均为 BigInt 或整数下标）；面积、质心、距离均经 det-math 的定点函数。

### 1 体积足迹出口缺"其余边界上的开口由格差分求得"
- 位置：server-plugin/kernel/place-volume.mjs:254-260（汇总处 place.mjs:962-967）
- 设计原文：卷五 :487 "体积足迹的'开阔边界'一类在泡外不派生基底细格：洞口由洞穴生成器 `caveCellsOf` 的洞口通路格…给出，其余边界上的开口由格差分求得（封卷后勘误，卷二十 C20-5 ①）"
- 代码实际：`volumeExitsOf` 只把 `cave.mouth` 一处当开阔出口；不读 `cells.*` 差分，玩家在洞壁上挖开的其它开口不进 `exits`，聚合处也不补。
- 理由：无
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 2 区域足迹 coarse 落格只筛区域后代，未按"zoneAt 恰为 place"核蓝图
- 位置：server-plugin/kernel/footprint.mjs:691-702（landRegionCell；调用 place.mjs:413-445，注释 place.mjs:406）
- 设计原文：卷五 :504 "只在 `place` 的足迹内、且 `zoneAt` 恰为 `place` 的格里取（落在更深后代足迹里的格不算）"
- 代码实际：只判 `plan.owner[k] === me`（最深**区域**足迹归属）；建筑的蓝图格与体积足迹不参与筛选。带地下层的建筑在锚点列地表层号那格起就有格，选中的区格中心列地表层可能落在该建筑足迹里，`zoneAt` 便不是 `place`。
- 理由：无（place.mjs:406 注释自述有该筛，实现未做；问题.md:644 的"不加 zone 筛选"只谈展开落格，不是规则 14 的 coarse 代表格）
- 影响：数据错（泡外个体的 zoneAt 可落成建筑而非动作目标地点）
- 严重程度：乙
- 合并：无

### 3 接入格只支持区域足迹，体积端点未按顶层细格取
- 位置：server-plugin/kernel/footprint.mjs:708-721（accessCell）
- 设计原文：卷五 :464 "端点是体积足迹时，只在它顶层细格所在的区格里取。"
- 代码实际：`accessCell` 只在 `plan.cells` 的区域足迹里找；体积行不登记进 plan，路网边的体积端取不到接入格（返回 null），没有"体积顶层细格所在区格"的取法。
- 理由：问题.md:607（另 :543）
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 4 世界种子已知后的体积派生核对无生产调用者
- 位置：server-plugin/kernel/place-volume.mjs:290-300（checkVolumes；包装 place.mjs:230 checkVolumeCells）
- 设计原文：卷五 :497 "顶面须至少比所在各列的地表低一层（否则加载报错）"；卷十 R10-2.14 第 5 项"加载校验把全部体积足迹各派生一遍"
- 代码实际：`checkVolumeCells` 只有测试调用；加载期只跑 `checkVolumeRows`（不依赖种子的父行种类、目标面积上限、嵌套顶层号），带种子的顶面校验与全体派生核对没有接上任何生产调用点。
- 理由：问题.md:606
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 5 足迹相邻只算区域区格，体积共面相邻未实现
- 位置：server-plugin/kernel/footprint.mjs:746-786（footprintAdjacency）
- 设计原文：卷五 :1216 "两个地点相邻，当且仅当二者的足迹在同一格空间里有一对四邻接的区格（体积足迹之间为一对共面的细格）…"
- 代码实际：只按区域区格的四邻接配对；体积足迹之间没有共面细格判据，洞穴与其相邻地点判不出相邻。
- 理由：无（公共部件审查-甲 E3 已登记为缺件）
- 影响：规则缺（存量扩散、地点相邻对洞穴不生效）
- 严重程度：乙
- 合并：见 docs/研究/公共部件审查-甲-1122.md E3

### 6 足迹种类按字面量分派散布在 footprint-kind.mjs 之外
- 位置：server-plugin/kernel/place-volume.mjs:50、:98、:121、:135、:274、:292、:314；footprint.mjs:390、:401
- 设计原文：卷五 :460 "一行是什么层级只看组件类与 `regionLevel`，不看 id、不看显示名。足迹种类同样只按组件类判，次序固定…"
- 代码实际：判据单点在 footprint-kind.mjs，但各读取/校验函数再按 `FOOTPRINT_KIND.volume`/`.region` 字面量 if 分派；加一种足迹种类要逐处补分支。
- 理由：无（已排 M-11③）
- 影响：只是形式（扩展性）
- 严重程度：丙
- 合并：见 docs/研究/公共部件审查-甲-1122.md E1、docs/研究/模块化评估-1122.md 第三节

### 7 四邻方向表 NEIGHBORS 另有多份
- 位置：server-plugin/kernel/footprint.mjs:27
- 设计原文：卷五 :491（"从自己当前足迹的四邻里取一个…"）、:1216（"一对四邻接的区格"）
- 代码实际：本文件的 `NEIGHBORS` 与 cave.mjs:21、gen/waterband.mjs:12、layout.mjs:140/:176、place-plan.mjs:153、place.mjs:544 同式各写一份。
- 理由：无（公共部件审查-甲 D6 已登记）
- 影响：只是形式
- 严重程度：丙
- 合并：见 docs/研究/公共部件审查-甲-1122.md D6

### 8 地形条目直读 engine.vocab.index，未走 vocab()
- 位置：server-plugin/kernel/place-volume.mjs:60-64（terrainEntryOf）
- 设计原文：卷二 :469 横切入口含 `vocab(engine,family,id)`；公共格式（dev-format §三）"词表条目：kernel/vocab.mjs 的 vocab、kindOf、kindOfEntity；不许直读 engine.vocab 内部"
- 代码实际：直接查 `engine.vocab.index.get(code)` 取 entry，绕过 `vocab()` 的族/代号核对与冻结副本；条目缺或族错时静默返回 null（当未知）。
- 理由：无（公共部件审查-乙 第五节"族条目枚举读口（缺）"已登记同类直读）
- 影响：只是形式（错族/错代号时会静默当未知而非报错）
- 严重程度：丙
- 合并：见 docs/研究/公共部件审查-乙-1122.md 第五节与建议第 12 条

### 9 regionCellPos 的区格边长与中心换算静默截断
- 位置：server-plugin/kernel/footprint.mjs:666-671（perCell = regionCellM ÷ cellM 的 BigInt 除法）
- 设计原文：卷五 :433 "区格序号 = floor(x × cellM ÷ regionCellM)，派生，不存"；:504 区域足迹取"该区格中心列地表层那一格"
- 代码实际：perCell 用 BigInt 整除且不核整数倍，中心格序号 = rx×perCell + perCell÷2；`regionCellM` 不是 `cellM` 整数倍时静默截断（现 grid.json 为 100/1，暂不受影响）。
- 理由：无（公共部件审查-甲 D3 与第八节 R9 已登记"区格边长与中心只一处"）
- 影响：只是形式（配置一改即读数错）
- 严重程度：丙
- 合并：见 docs/研究/公共部件审查-甲-1122.md D3、第八节 R9

## 已登记未建

1. **非体积足迹的地下三量**：卷五 :758 与 :113-115 对区域、建筑、房间、体积四种足迹都给了 `surfaceRefElevationM`、`depthM`、`underground` 的算式；代码只有体积足迹带这三项（place-volume.mjs:230-235 的 `volumeFootprint` 经 cave.mjs:194-215 给出，place.mjs:1086-1088 用 `undefined → null` 覆盖其余种类）。登记处：world/ontology/dimensions/_unbuilt-derived.json entries 的 `place.depthM`、`place.surfaceRefElevationM`（card pre_first_reader_card），`underground` 由 kernel/dimensions.mjs:550 `dependsOnUnbuilt` 随 `depthM` 按未知交出。**附注**：本卡③所引"体积足迹的地下三量只体积足迹有"在卷五 §4.5 规则 3 原文中未见；原文是四种足迹都有算式。代码的"只体积足迹有"与登记一致，故不算偏离，登在此。

2. **运行期新建区域足迹子行压体积列的核对无生产调用者**：卷五 :461 末句"运行期在已有体积足迹的列上方新建区域足迹子行（如运行期建营地）时，由新建行的写者按本条核"（卷十 R10-2.14 第 1 项、§5.3 C10-22 ⑦）。place-volume.mjs:269-282 `volumesUnderRegionCells` 与 place.mjs:241-244 包装只有测试调用；登记处：PLAN.md:70 ③（K6-42 建行写者未建）、primitives-runtime.mjs:300（create 现只建 person，地点行无建行写者）、place.mjs:236 注释。新增区域行的写者未建，故现状无生产绕过，不算偏离。

## 拿不准

1. **同父跨类兄弟足迹是否一律要核不相交**：卷五 :461 写"同父的兄弟足迹两两不相交（区域按区格，建筑、房间、体积按细格）"，但 :495 建筑一条只写"建筑足迹与兄弟建筑足迹不相交"。代码分别核建筑—建筑（place-building.mjs:370-386）与体积—体积（place-volume.mjs:148-160），不核建筑—体积、建筑—同父区域子行。是规则 3 要求跨类也核（则该处缺），还是按 :495 只管同类兄弟（则现状可以），卷文未细分，拿不准。

## 跨卷待判

1. **水下体积的地表参照与可凿判据是否取河床高**：卷五 :758 的地表参照引 §4.1 规则 13 的区格粒度口径，而 :499 写明"水体足迹的区格取河床高"；place-volume.mjs:67-88 的 `surfaceReader` 走 grid-base 的 `columnSurface`（未修正的 h₀，不含河床修正），据此算 `surfaceRefElevationM`/`depthM`/`underground`，cave.mjs:127 的顶面校验也用同一 h₀。体积列在水体足迹下时是否改用河床高，要看 §4.3 规则 8（本卡未读），故此条待判。

2. **regionBedDelta 未把 δ 夹到不小于 0**：footprint.mjs:618-625 返回 `h₀ − bed`，未按"不小于 0"夹取；卷五 §4.3 规则 8（本卡未读）写 δ 不小于 0，若 `createWaterBeds` 已保证 bed ≤ h₀ 则现状无错。须读 §4.3 才能判。
