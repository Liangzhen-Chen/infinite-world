# 偏离清查 06d（卷五 place.mjs 加载期校验、地点规则表数据）

共 8 条，甲 0 乙 6 丙 2，有理由 1 无理由 7。
本卡读了：卷五 :268-300、:457-520、:534-546；卷二 :1565-1637、:1795-1868；server-plugin/kernel/place.mjs :1380-1653（另查 :35-95、:1195-1274）；server-plugin/kernel/footprint.mjs :190-414（另查 :53-66）；server-plugin/kernel/place-volume.mjs :262-334；server-plugin/kernel/place-plan.mjs :1-80；server-plugin/kernel/load/rules.mjs :60-240；server-plugin/kernel/load/world.mjs :160-182；server-plugin/kernel/validate/rows.mjs :36-43；server-plugin/kernel/error-codes.mjs :42、:93-95、:192-194；world/rules/tables/grid.json、facility.json、host.json 全文；world/rules/registry.json :366-396、:408-420、:548-558；world/ontology/dimensions/place.json 表头与 dimensions 段（:1-926）及 rows 段只按名字 Grep；facility_type.json 全文；_unbuilt-derived.json 中 table=place/facility_type 的行；tools/accept/criteria.json :1345-1360、:3057-3072。未读：卷五 §2.1、§4.1.1、§4.10.1（不在卡给范围）；卷十九原文；place.json 的 rows 段（4 MB，未通读）。
A5-1.6 对照：A5-1.1 由 S5-3（并入 vol2.S1/vol6.S6-2.b，见 docs/迁移体检/格子G1-G5-规矩检查对照.md:59）、S5-9/S5-10 门禁与卡内数据形状测试守；A5-1.2 八组都有加载校验或卡内测试（footprint/place/route-edges/grid-diff/position/bubble 测试）；A5-1.3 无对照，见第 8 条。
错误码核对：place.mjs 用到的 17 个码（E-DIM-*、E-GEN-ROW-INVALID、E-GRID-*、E-MOD-RX、E-RULES-UNREGISTERED、E-DET-DOMAIN）都在 error-codes.mjs 或别卷登记码里，无自造码；卷二 :1565-1637 没有 E-PLACE-、E-FOOT- 开头的码，本卡无遗漏。加载期校验按仓库通例返回文字行、由 load/world.mjs:163 收进 domain 错误，不抛 KernelError，与其他表的 check* 同式，不另记。
零引用键：grid.json 表内 15 键在 server-plugin 都有读者（cellM/regionCellM/grid-base、storeyM 多文件、heightCtrlK grid-base/grid、reliefOctaves grid、chunkRegionCells handles/keys、farSight* sight、landSearchRadiusCells bubble/position、roadPaceFactor route-edges、longCostCap route-grid/route-edges、fullTurnDeg footprint、facingDirections 多文件、surfaceElevationMinM/MaxM grid）；`bubbleCostCap` 不在表内（第 1 条）。facility.json 的 thermal/blueprint/wear 与 host.json 的 saveSlotCount/saveImportMaxBytes 都有读者，且两张表按 registry.json:408、:548 归卷十九、卷二十七，键与卷五 §2.3 无重叠，不构成偏离。

### 1 现场泡细格寻路的展开上限 bubbleCostCap 未落表、未实现
- 位置：world/rules/tables/grid.json（全表 15 键，无 `bubbleCostCap`）；world/rules/registry.json:381-384；server-plugin/kernel/place.mjs:1262
- 设计原文：卷五 :473「展开数超过上限 `bubbleCostCap`、`longCostCap`（`grid.json`）时，不返回空、不当作"无路"，而是返回明确的"超限"结果」；键表见 :274
- 代码实际：只登、只读 `longCostCap`；`pathView` 现一律按区格求，细格寻路的展开上限既没有键也没有超限判定（place.mjs:1262 注释自认归 G6 与卷十七 G15）。
- 理由：无（仅 place.mjs:1262 注释与 registry.json:393 登记行自述"随其消费者卡登"，未见裁定或勘误）
- 影响：规则缺（规则 5 的超限这一半无实现；眼下没有细格寻路，暂未出错）
- 严重程度：乙
- 合并：无

### 2 grid.json 的 longCostCap 依据文字与勘误后的实现相反
- 位置：world/rules/tables/grid.json:59-61（basis「长途 pathView 现会返回空」）；server-plugin/kernel/place.mjs:1271-1273
- 设计原文：卷五 :473「返回明确的"超限"结果（与"真没路"可区分）」；卷二 :1616 E-GRID-PATH-OVER-CAP 同义
- 代码实际：超限时返回 `{overCap: true, steps: null, distanceM: null}` 并报 E-GRID-PATH-OVER-CAP，不再是空。
- 理由：无（勘误 1121k12 改了行为，grid.json 的 basis 没跟改）
- 影响：只是形式（数据表注释误导后续标定，行为本身对）
- 严重程度：丙
- 合并：无

### 3 坡度域上下界 0、1 与正性判断写死在 checkPaceTables/checkCellClasses
- 位置：server-plugin/kernel/place.mjs:1417-1421（坡度探针 `0`、`1` 与端点取中）、:1509、:1513-1515、:1518（`> 0` 判断）
- 设计原文：卷五 :268「本卷规则表（常数只在这里）」；:274 grid.json 是格世界常数的唯一去处
- 代码实际：cellclass 坡度探针的区间端点 `0`、`1` 与 paceFactor/slopeCurve 的"严格大于 0"都写成代码字面量；坡度取值域在任何规则表里没有键（place.json 连 `slope` 维度都未登，见第 4 条）。
- 理由：无
- 影响：只是形式（当前取值正确，改标定要改代码）
- 严重程度：丙
- 合并：无

### 4 place.json 缺卷二 §5.6 列出的 9 个地点维度
- 位置：world/ontology/dimensions/place.json:8-926（dimensions 段，无 `slope`/`biome`/`soilFertility`/`deposits`/`siteType`/`development`/`control`/`culture`/`gateTerms`）
- 设计原文：卷二 :1814 `slope`、:1817 `biome`、:1819 `soilFertility`、:1821 `deposits`、:1822 `siteType`、:1823 `development / control`、:1826 `culture`、:1835 `gateTerms`（均照抄卷五 §2.1）
- 代码实际：这些维度在维度表里没有声明；地点行若写它们，validate/rows.mjs:43 按"未声明的维度"报 E-DIM-STRUCT-FIELD。现 world 行没有一处使用（Grep 无命中），暂未触发。
- 理由：无（_unbuilt-derived.json 的 table=place 部分也没有登记这 9 项）
- 影响：规则缺（地点维度少一半，settlements 的站点类型、发展度、控制度、地貌群落、矿产、文化、关津条款都无处落值）
- 严重程度：乙
- 合并：无

### 5 place.json 缺 sourceStrength 列（感知地点一律判没有感知到）
- 位置：world/ontology/dimensions/place.json:8-926（无 `sourceStrength`）；server-plugin/perceive.mjs:16、:274-275
- 设计原文：卷二 :1834「`sourceStrength` map<ref vocab sense, number>」；卷五 :299 同键
- 代码实际：地点行没有该列，perceive 对地点行一律判"没有感知到"（perceive.mjs:16 原句），现只有物种行基值。
- 理由：见 docs/问题.md:773（place 表 sourceStrength 列明确记为未落数据；单位 `sense_arrival` 也写不成登记单位）
- 影响：规则缺（地点作为感知对象的整条路径不可用）
- 严重程度：乙
- 合并：无

### 6 facility_type.json 缺 serviceEffects、networkNeeds 两维
- 位置：world/ontology/dimensions/facility_type.json:7-22（dimensions 段只有 14 键）
- 设计原文：卷二 :1858 `serviceEffects` list<effectCall>、:1862 `networkNeeds` map<ref vocab netres, number>
- 代码实际：两维在维度表与 _unbuilt-derived.json 里都没有；设施类型行写它们即按未声明维度拒收。
- 理由：无
- 影响：规则缺（设施的服务效果与网络资源需求将来无处填；现两列无读者，暂未出错）
- 严重程度：乙
- 合并：无

### 7 functionNeeds 的值域允许 0，绕开"值 > 0"
- 位置：world/ontology/dimensions/facility_type.json:12（value `domain: [0, null]`）
- 设计原文：卷二 :1851「`functionNeeds` map<ref vocab ffunc, number>（单位取功能条目的 `unit`；值 > 0；允许为空 map）」
- 代码实际：登记为 [0, null]，0 与正数同样收；按"达到下限即算该类设施"的判定，0 等于无门槛通过。
- 理由：无（源串写卷十九 §2.2 :168「下限」，但卷二照抄句明写"值 > 0"）
- 影响：规则缺/可绕过（按种类判类时，写 0 就无条件满足）
- 严重程度：乙
- 合并：无

### 8 A5-1.3 扩展性断言没有对应测试或校验
- 位置：tests/（Grep `A5-1.3` 无命中；tools/accept/ 也无该条目）
- 设计原文：卷五 :545「新增一个大陆（一行 `comp_region` 加若干子行、种子、目标面积与路网边），不改任何代码……新增一个格空间……同样不改代码」
- 代码实际：多处按数据驱动写（place-plan.mjs、footprint.mjs 按行与格空间表计算），但没有一条测试真的加一个大陆/格空间跑通；验收断言的"不改代码"没有被固定下来。
- 理由：无
- 影响：规则缺（后续改到按行/按格空间名特判时不会被测试拦住）
- 严重程度：乙
- 合并：无

## 已登记未建

- 卷五 §2.3 的 7 张规则表未建未登记：`wildness.json`、`resource-field-types.json`、`renewal.json`、`harvest-methods.json`、`progress.json`、`site-rules.json`、`frontier.json`（卷五 :274-283）。registry.json 只登 `grid`、`terrainModifiers`、`perception`（:366、:398、:624）；写者模块（resource-field.mjs、place-progress.mjs 等）未建。
- 修正目标键 `stock.growthFactor`、`stock.lossPerDay` 未落登记，写者 `resource-field.mjs` 未建（卷五 :292-299）。
- `sense.sourceStrength` 修正命名空间与卷九动作行的加性修正未建，perceive.mjs:14-15 自述只有基值（卷五 :299）。
- facility_type 首批 17 行缺 7 行：fac_temple、fac_shop、fac_market、fac_dock、fac_bridge、fac_road、fac_warehouse（卷二 :1867）。李白 11-24 S6-2（docs/审查/李白裁定-1117.md:1655）裁定"其余对不上的先按最近的现有类型归，列清单附卡回报"；facility_type.json:46 也写明 fac_shop 等的取舍待李白。
- 现场泡细格寻路（bubbleCostCap 的读者）未建：place.mjs:1262 自述归 G6 与卷十七 G15；第 1 条已计其缺表。

## 拿不准

- place.json 有 `accessClass`（:9）等 §5.6 未列的维度（另有 aperture、enclosed、surfaceRefElevationM、depthM、underground 及 comp_waterbody 的字段）。卷二 §5.6 自认"照抄"，这些维度源注卷五 §2.1；§2.1 不在本卡读范围，判不了是卷二漏抄还是 place.json 多登。
- place.json 有 `gridSpaceStruct`（:17292）、`gridSpaces`（:17358）两节，卷二 §5.6 只列了 edges 节；定义处卷五 §4.1.1 不在本卡范围。
- facility_type.json 的必填/onUnknown 与卷二 §5.7 照抄列不一致：maxSkyExposure、maxAperture 为 always/error（§5.7 :1852 写 never/skip），ratingWeights 为 always/error（§5.7 :1859 写 never/gap）。源注卷十九 §2.2，卷二又写"以定义卷为准"，卷十九原文未读，未判。
- grid.json 有 4 个 §2.3 键表未列的键：`fullTurnDeg`、`facingDirections`（basis 取卷五 §4.2 规则 12-13）、`surfaceElevationMinM`、`surfaceElevationMaxM`（basis 取 §4.1.1 :425）。§2.3 的表列是否穷举未写明，未判。
- grid.json 的 15 行都只有 `basis`，没有 `source`（facility.json、host.json 两表都有 source+basis）。卷二 §4.1 的规则表登记没有要求行上 source，判不了是否漏填。

## 跨卷待判

- 卷五 :268 写规则表路径 `world/rules/tables/place/`，仓库按卷二 §4.1「规则表登记」（:1554，封卷后勘误 李白 11-14）放在 `world/rules/tables/*.json`，由 `registry.json` 逐表登记（:366-396）。两卷对路径的写法冲突，代码按 registry 读；卷五的路径写法没跟改，需裁定以哪卷为准。
