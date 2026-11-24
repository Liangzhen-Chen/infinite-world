共 5 条，甲 0 乙 4 丙 1，有理由 2 无理由 3。

本卡读了：卷五 :305-346、:626-695、:734-786；卷十 :407-474。代码：server-plugin/kernel/grid.mjs :1-333、grid-base.mjs :1-330、grid-template.mjs :1-124、server-plugin/grid-diff.mjs :1-189、kernel/grid-diff-read.mjs :1-102、kernel/wall-flow.mjs :1-23。为核调用与载入另读：卷二 :460-470（横切入口）、world/rules/tables/grid.json、world/ontology/dimensions/_vocab.json :58-79、world/ontology/named-structs.json :520-529、docs/问题.md :519、:528、:533、:545、:581-586、:610、:815、server-plugin/kernel/place.mjs :519-733（gridView 组合与 extrudeCell 调用）、kernel/footprint.mjs :495-700（控制点与代表高）、kernel/handles/keys.mjs :200-330。
没读到：卷五 §4.1 规则 15-16 与 §4.7 正文、卷十 §2.1/§3.1、卷十九全部（wall-flow 的规矩出处）、grid-diff 的 §4.1 规则 16 正文；这些只按 §3.2 :330-335 的签名与现场调用核。

另核过、不重复记：①差分层全仓只有 grid-diff.mjs:159 写 `cells.*`（state-owners.json:6 同），grid-diff-read.mjs 只读，未发现别处直改格数组；②高度场与海拔量化全部读 rules.grid（grid.mjs:167、:265-267，grid-base.mjs:118、:268，grid-template.mjs:88），未发现写死数值；③grid-diff.mjs:65 直读 engine.vocab.index、:91 直读 pos、:39 自写 deny、grid-template.mjs:88 区格边长静默截断、grid-base.mjs:94 与 grid.mjs:226 的平方距离比较，分别已见公共部件审查-乙 第十节、dev-05a 第 7 条、公共部件审查-甲 D3，不重复计数；④群落（biome）族无条目、本卡文件里无群落解析代码，已见 dev-07c 已登记未建。

---

### 1 可立足判据不读“本格有承面家具”
- 位置：server-plugin/kernel/grid-base.mjs:257（判据表达式，注释在 :221）
- 设计原文：卷五 :760「可立足格：本格材料可穿行（空气类），且下一格的材料能承托、或下一格有能承托的顶面，或本格有承面家具、梯、坡；楼梯格本身可立足。」
- 代码实际：`standable = 气态 && (格种类是梯/楼梯 || 下一格承托)`，从不读本格 `fixture` 的承面高 `surfaceHeightCm`；承面家具上的站立与落格判不可立足。
- 理由：无（docs/问题.md:646 只登记批次落格的承面，不含站立判据）。
- 影响：规则缺（承面家具上站不住，挤出/坠落会多落一层）
- 严重程度：乙
- 合并：见 F:/dnd-tmp/dev-06b.md 第 2 条（同一处已计，勿重复）

### 2 细格格种类封闭枚举缺“坡”
- 位置：server-plugin/kernel/grid-base.mjs:16（CELL_KIND）、:18（STANDABLE_KINDS）
- 设计原文：卷五 :760「坡、梯、楼梯在格上的表示是格种类（不是材料）：这三种格可立足、可通行、把相邻两层连起来」
- 代码实际：CELL_KIND 只有 `stairs`、`ladder`，无坡；坡格既表示不出，也不在可立足种类内（注释自述“坡暂无来源”）。
- 理由：无（仅注释与 docs/卡回报/g8-caves.md:36 自述）
- 影响：规则缺（数据一旦给出坡格，种类读不出、判不可立足）
- 严重程度：乙
- 合并：见 F:/dnd-tmp/dev-06b.md 第 3 条（同一处已计，勿重复）

### 3 格标记带出的 becomesMaterial 绕过材料行引用核对
- 位置：server-plugin/grid-diff.mjs:68-71
- 设计原文：卷五 :335「`alterCells` … `changes: list<struct{pos, material: ref material nullable, fixture: ref item nullable, mark: ref vocab cellmark nullable}>`」
- 代码实际：`checkRefs` 只核 `change.material`；`mark` 条目的 `becomesMaterial` 非空时直接当材料返回并写进 `material`，未按材料行核对（header 第 7 条却称 material 须是材料行）。
- 理由：无
- 影响：规则缺（cellmark 数据写错材料代号时能落进差分，读格时材料行找不到）
- 严重程度：乙
- 合并：无

### 4 gentemplate 必填 airMaterial 未在卷十字段表
- 位置：server-plugin/kernel/grid-template.mjs:19（FIELD.air）、:41（加载校验循环）
- 设计原文：卷十 :118「`gentemplate`… `surfaceMaterial: ref material`、`soilLayers: integer:count`、`soilMaterial`、`rockMaterial`、`blocks: list<…>`」，无 airMaterial。
- 代码实际：把 `airMaterial` 当第四个必填材料字段校验（不是则 E-DIM-REF-MISSING），数据 _vocab.json:76-78 已照填 mat_air。
- 理由：有（docs/问题.md:582「空气是一行材料…卷十 §2.1 :118 跟改项」）
- 影响：只是形式（数据已填、行为正确；设计书未跟改）
- 严重程度：丙
- 合并：无

### 5 cellclass 的 slopeRange 缺失/长度不足被静默当“不限”
- 位置：server-plugin/kernel/grid.mjs:314-317
- 设计原文：卷五 :669「坡度在 `slopeRange` 内」
- 代码实际：`slopeRange` 不是长度大于 1 的数组时不作坡度判定；现值全为 null，坡度条件在全区格从不生效，且加载期不拒收（07c 已核数据侧）。
- 理由：有（docs/问题.md:518「slopeRange 长度不足现静默放行，cellclass 条目 schema 登记时改拒收」；该条只覆盖长度，null 算不算不限未写）
- 影响：规则缺（规则 9 的坡度判据可被 null 绕过）
- 严重程度：乙
- 合并：见 F:/dnd-tmp/dev-07c.md 第 2 条（同一处已计，勿重复）

---

## 已登记未建

- **区域水体的水面层与冰没有接到格上**：卷五 :670-677（规则 10「水面」）；grid-base.mjs:137-160 的 `waterOfRegion`、`iceLayersOf` 在生产里无调用者（place.mjs:687-688 对 waterKind 区格地表以上直接返回 known:false）；登记 docs/问题.md:581（G6 遗留 1）、:815「无调用者，水层接上时一并改名」。同一处见 dev-06b 已登记未建 1。
- **体积足迹水体（含水层）的液体填充**：卷五 :676（规则 10 末条）；grid-base.mjs 不含该实现，place.mjs:580 读未知；登记 docs/问题.md:610。
- **细格基底的存量形态（树、矿体）与存量单元 stratum 材料**：卷五 :670（规则 10 叠层次序）；grid-base.mjs:194-195 留有 `rockMaterial` 入口，但 gridView 传 null（place.mjs:689），存量形态未叠；登记 docs/问题.md:581。
- **自然坡的通行判据只有纯函数、无生产调用者**：卷五 :760「自然坡」；grid-base.mjs:311-330 的 `isNaturalColumn`、`naturalStepOk` 仅测试调用，细格寻路归 G6/G15（docs/问题.md:545）。

## 拿不准

1. **空控制点集**：卷五 :659 没定义格空间里没有区域足迹行（层高只有层根）时的控制面；grid.mjs:216-217 现在拒收 E-DET-DOMAIN，docs/问题.md:519 已登记待卷五澄清，不判偏离。
2. **liftLayers 的读法**：卷十 :435「区格中心列地表层之上 `liftLayers` 层起」；grid-template.mjs:101 取 `centerSurfaceZ + 1 + liftLayers`（0 即紧贴地面上一层），docs/问题.md:585 写明另一读法（地表层 + liftLayers）等李白裁定。
3. **alterCells 的 cause 形状**：卷五 :335 只给签名与 changes 三项，cause 内部形状未写；grid-diff.mjs:11 自定为 null/代号串/{actor}，自述“须 Opus 核”。
4. **差分“整条替换”还是部分合并**：卷五 §4.1 规则 15 正文不在本卡卷段；grid-diff.mjs:14-16 取每格整条替换（三项都为空即清除），自述卷文没写部分覆盖。
5. **冰的料与物态**：卷五 :675「料取 `liquid` 材料的固态（物态读法归卷三乙 `matterStateOf`）」；grid-base.mjs:189 直接在同一材料行上标 `state: solid`，未走 `matterStateOf`（该读法尚未建，item-state.mjs:542 只有注释）。水层未接，暂无法判是等价还是漏读。
6. **waterAny 空集在水体足迹里算不限还是不成立**：卷五 :669 只写「所在水体足迹行的 `waterKind` 满足 `waterAny`（不在水体足迹里而该项非空即不成立）」；grid.mjs:311 现取“空集不成立”（水体足迹里的区格只由 cellclass_water 命中），问题.md:518 已登记待卷五澄清。
7. **wall-flow 的规矩出处不在本卡卷段**：卷十九 :109、§4.1 规则 11 未给，无法逐条对；只核到 wall-flow.mjs:15-23 是纯函数、料按代号序、0 也逐料照记，生产调用在 gen/envelope.mjs:66，写者已在 state-owners.json:53 登记。

## 跨卷待判

- 无（第 1、2 条的跨卷部分已在 dev-06b 计过；第 4 条的卷十字段表跟改见问题.md:582）。
