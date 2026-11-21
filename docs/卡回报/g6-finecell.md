| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 各新文件头注释与测试用例名逐条标卷五 §4.3 规则 8–11 :655–:661、§4.5 规则 1、5 :739、:743、§4.7 规则 12 :908–:913、§3.1 :313、卷十 R10-2.15 :435、:118、卷二 :852、:253、卷三甲 :128–:131；卷文推不出的记 docs/问题.md "格子迁移 G6 遗留"，没有自编出处 |
| 2 | 没有按 id/名字/场景写特例 | 是 | 材料只经 gentemplate 与材料行布尔读，代码里无材料 id；地形类只经 cellclass 数据；聚落只按组件类（footprint-kind.mjs isSettlementClasses，与已有四个组件类同处）；测试夹具的 id 只在测试里 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | stockCount 单位质量 0/负、余额负；distributeStock N 负/小数、cap 小数、无区格 N=0/非 0、N+S=Σcap 边；waterOfRegion 余额 0、面积 0（不除零）；genTemplate 缺/指向不存在；gridChunkCells 0/负/非整数；gridKeyParse 前导零、-0、小数、空串、超安全整数（tests/kernel/grid-base.test.mjs、grid-view.test.mjs、grid-key.test.mjs） |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 夹具与期望按卷文公式手算成字面量并注推算（水深 0.6 m、冰层 ceil、坡度 0.3、控制面 10/20 m、格块范围 47..53 等）；sha256 次序只断言与"按键排序"的关系与确定性；格块命中率只用宽带 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 门禁 const_literal 命中的 DS 写的下标/个数字面量，改成解构与 GRID_KEY_SEGMENTS.length（格坐标段名表，长度即段数，不是改名常量）；grid.json 新键 chunkRegionCells 登 registry |
| 6 | 只改了卡文列出的文件；diff 共 约 2090 行 | 是 | 已跟踪文件 +624/−64（30 个文件）；新增 7 个文件共 1406 行（三个核心模块 467、三个测试与一个 DS 测试 939）；卡文外的必要扩展见"偏离" |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：修改轮后末三行 `ℹ tests 1481`、`ℹ pass 1481`、`ℹ fail 0`（首轮 1475） |
| 8 | 这张卡让块 6 哪一步更近了，且没违背北极星 | 是 | 玩家脚下每个 1 米细格的材料（土、岩、草、路面、格块）与遮天/承托/可立足标志已能从种子与区格派生、不存档，数量取账位置取序的算法已成纯函数；水与存量位置层未接数据（见未落），没有写死、特例、假数据 |

# 格子迁移 G6《细格地形生成》卡回报

写：Claude Sonnet 5.5 中档（包整张卡；核心算法自己定稿）；DeepSeek 两张机械卡（见下）。分支 ds/g6-finecell，基于 master 0f261de09，未 push。对照表 docs/迁移体检/格子G6-G11-规矩检查对照.md #1–#17 与移交行；卷五 §4.3 规则 8–11、§4.5、§4.7 规则 12、§3.1；卷十 R10-2.15。

## 改了哪些文件

核心（我写）：
- server-plugin/kernel/grid-base.mjs（新）：columnSurface（列地表高与层号，采样点同 regionCell 中心列口径）、nearControlPoints（区格内求控制面只需看的控制点子集，精确超集，无开方；实测 512 个控制点时一区格 10⁴ 列从 2.7 s 降到约 0.12 s）、regionSlope、waterOfRegion/iceLayersOf（水面层号、冰层数，勘误 1121k3）、cellAt（叠层：岩土→地表→空气→水体→模板格块→overlay 回调）、cellFlags（遮天/承托/可立足，按材料分态布尔，缺数据为未知）、isNaturalColumn/naturalStepOk（自然坡判据）。
- server-plugin/kernel/grid-template.mjs（新）：checkGenTemplates（加载期）、genTemplateOf、templateBlocksOf、blockAt。
- server-plugin/kernel/grid-stock.mjs（新）：stockCount、distributeStock、pickStockCells、plantCandidateCells。
- server-plugin/kernel/grid.mjs：reliefAt/surfaceHeightAt 加可选 memo；uniformBelow；种子键 tplBlockKey、stockRegionKey、stockCellKey（登 world/rules/tables/seed-keys.json 三行）。
- server-plugin/kernel/place.mjs：gridView（区格与细格范围）、checkPlaceTable 加 checkGenTemplates、材料分态布尔读口；footprint-kind.mjs 加 isSettlementClasses。
- server-plugin/kernel/error-codes.mjs：登 E-GRID-STOCK-OVER-CAP（603→604；tests/kernel/error-codes.test.mjs 计数同步）。
- server-plugin/kernel/files.json（三个新文件）。tools/accept/criteria.json：12 类判据 rev+1 带修订记录（经 register.mjs，临时助手 F:/dnd-tmp/g6-bump-criteria.mjs，同 G3、G5 先例）；tests/accept/temp-repo.mjs 加复制 errors.mjs、report.mjs。
- 数据：world/ontology/dimensions/_vocab.json（gentemplate 族）、material.json（四个分态布尔维度）、_unbuilt-derived.json（四列缺数据放行，card g6-content）、world/rules/tables/items.json（aggregation 四行 none，M-10 要求）、world/ontology/state-owners.json 与 named-structs.json（cells.*.*.* → struct:gridCellDiff，keyKinds 三个 gridKey）、world/rules/tables/grid.json 与 registry.json（chunkRegionCells）、server-plugin/kernel/state-types.d.ts（重生成）。
- 既有测试的必要同步（新必填/新类别带来的，不是放宽）：place-footprint、place-footprint-columns、route-edges、person-world 夹具的 cellclass 加 genTemplate 并给 gentemplate 条目（卷五 §2.2 新必填）；save.test.mjs 夹具 cells.*.*.* 的 keyKinds 由借位的 seedKey 改 gridKey；state-owners.test.mjs P 成员清单加 cells；scheduler-due.test.mjs 的 KEY_NONENTITY 清单加 gridKey；tests/accept/named-structs.test.mjs 47→48 行。
- docs/问题.md：加"格子迁移 G6 遗留"，改 gridKey 一条。

## 对照表各行怎么落（测试名在 tests/kernel/grid-base.test.mjs〔B〕、grid-view.test.mjs〔V〕、grid-key.test.mjs〔K〕、material-grid-flags.test.mjs〔M〕）

- #1 基底纯函数、每区格独立种子、新抽取点登记：〔B〕"确定性：列地表…memo 有无不改结果…打乱遍历次序"；〔B〕模板格块"千分数取自区格种子…与派生次序无关"；种子键三行登 seed-keys.json，门禁 seed_sites 双向比对通过。
- #2 整数：〔B〕"确定性…输出全是整数"、层号区间断言。
- #3 叠层次序：〔B〕"叠层次序：地表层号以下依次是土、岩…"、"水体在地表之上、模板格块再叠其上"、"overlay 在模板格块之后"；〔V〕"细格基底…逐列核（A5-3.2）"。后四层（体积 G8、蓝图 G7、存量形态、差分 G9）只留 overlay 回调。
- #4 水面：〔B〕"水面：静水全片一面…"、"冰层数…"（手算 0.6 m、floor、至少一层、负海拔、流水逐区格、余额 0/面积 0 不除零）。纯函数；未接账户（见未落 1）。
- #5 自然坡：〔B〕"自然坡：…差一层可一步走通，差两层是崖…"；〔V〕"自然坡连通：沿一排相邻列…"。
- #6 gentemplate 族与 cellclass.genTemplate：〔M〕gentemplate 族登记；〔B〕"gentemplate 加载校验"；〔V〕"加载期：cellclass 缺 genTemplate…"。
- #7 三个标志：〔B〕"标志：按材料分态布尔…"、"结冰的水面可立足…"、"材料行缺数据…按未知往下传"；〔V〕"标志：材料行布尔写齐时…／没写时按未知"；〔M〕四个维度登记与缺数据放行。
- #8 templateBlocksOf：〔B〕"模板格块：中心列…"、"千分数…必中/必不中…宽带"、"自承托标志随格块"；〔V〕"模板格块经 gridView 叠在基底之后…只落本区格内"。
- #9 道路与街巷：〔V〕"道路与航道区格…"、"聚落内区格…inSettlement…"（模板地面；状态对象原样，无差分）。
- #10–#12 数量取账位置取序：〔B〕"画几个"、"分到区格"、"一致性（A5-1.2）：玩家砍一棵…泡外伐木只减账户"、"越界截断"、"N + S 超过 Σ cap_c…E-GRID-STOCK-OVER-CAP"、"区格内取格"、"候选格只用高度场"。
- #13 格层不存数量：〔V〕"gridView 纯读…返回结构里没有余额、件数、千克数这类数量字段"（键集字面量断言 + 正则）。
- #14 gridView 字段与纯读：〔V〕"区格 gridView：…"（owner、地形类、地表层与高度、slope、onRoad）、"纯读"（读前后状态原样、读序、重载世界逐格相同）、"高度未知…"。
- #15 缓存是投影：本卡不设跨调用缓存（见未落 8），"开关缓存逐位相同"自动成立；〔V〕纯读用例断言重载世界与读序不改结果。
- #16 新增 cellclass 条目只加数据：〔B〕"扩展性（A5-3.3）"、〔V〕"扩展性（A5-3.3）：只加数据…"。
- #17 gridKey：〔K〕gridChunkCells 特殊值、gridKeyOf 边界（里块向负无穷取整）、gridKeyParse 互逆与拒收表、isGridKeySeg（里块不一致 false）、加载核对（gridKey 只用于 cells/fieldCells 前三段）、运行期写入核（E-PATH-KEYKINDS）。state-owners.json 的 pathTypes/keyKinds/struct:gridCellDiff 已登；cells.* 写者声明与分片行随 G9。

## 委派 DeepSeek

1. F:/dnd-tmp/card-g6-ds-1.md（pro）：gridKey 编解码、keyKinds 第六类与加载/运行期核对、struct:gridCellDiff、chunkRegionCells、tests/kernel/grid-key.test.mjs。我改正：门禁 const_literal 命中的数字下标与个数（改成解构与 GRID_KEY_SEGMENTS.length）；gridInt 加安全整数检查（超限十进制串不可逆，拒收）；storage 的段取值改 map；补了它没做的既有测试同步（save、state-owners、scheduler-due、named-structs 四处）、state-types.d.ts 重生成、temp-repo.mjs 复制 errors/report、criteria rev。
2. F:/dnd-tmp/card-g6-ds-2.md（flash）：材料四个分态布尔登记、缺数据放行、gentemplate 空族、tests/kernel/material-grid-flags.test.mjs。我改正：它停在 items.json aggregation 缺四行，我补（mode none）。

## 须 Opus 核

1. 水体与存量数据源未接（未落 1）：纯函数已有，gridView 的 water、存量位置层恒无。
2. 可立足的"可穿行"取空气类（state gas），浅水涉行不算可立足（卷五 :743 原句"本格材料可穿行（空气类）"）。
3. liftLayers 读法：地表层 + 1 + liftLayers（卷十 :435 "之上 liftLayers 层起"）。
4. distributeStock 越界补平的读法：被截掉的多画量先从次序末尾往前补到仍有余量的区格，被截上去的少画量再从末尾往前扣（"正负各自"）；贪心填满而非逐个轮转。
5. 区格坡度取四邻、空气无材料行（material null）、gridInt 对超安全整数拒收、storage.installGridRules 全局单例（G9 调用）。
6. 同一区格各列只用 nearControlPoints 缩小的控制点（精确超集的证明见函数注释与 [B] 的等价性用例）。
7. 门禁指纹重盖按 R12-14.3 理解（12 类 rev+1）。

## 验收

- `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：`ℹ tests 1475`、`ℹ pass 1475`、`ℹ fail 0`。
- `node tools/accept/run.mjs pre_commit`：`"verdict": "pass"`；items 失败三项仍是基线 vol12 A12-4.5、S12-2、S12-3，vol5.S5-10 pass。
- 性能：推进世界的基准只写测量点——本机冒烟 F:/dnd-tmp/g6-bench.mjs：一个区格 10⁴ 列（四级起伏）4/64/512 控制点约 90/100/120 ms；`pm_bubble_expand_ms` 的正式测量待腾讯云。

## 偏离与未落

1. 水体（卷五 §2.1 水体字段、液体与冰账户）、存量单元与 stratum、植物 individualKg、矿体深度带：代码里 0 命中，gridView 暂不叠；纯函数已测。
2. 材料四布尔数据未填（登记放行 card g6-content）。
3. 体积水体（G8）、建筑蓝图/顶面/格种类/家具（G7）、差分/mark（G9）、泡展开落格 landCell coarse 假（G10/G12）、挤出落点（G9）：未做。
4. 卡文外的必要扩展：place.mjs 加 gridView；既有测试夹具/清单同步（见上）；tests/accept/temp-repo.mjs、criteria.json。
5. 其余见 docs/问题.md "格子迁移 G6 遗留"。

## 卷二跟改项

- 错误码表补 E-GRID-STOCK-OVER-CAP（N + S 超 Σcap_c，卷五 §4.7 规则 12 :910；告警级之外的加载或结算报错）。已在 error-codes.mjs 登 vol2.s4.3 组。
- struct:gridCellDiff 在卷二 :253 已有行，代码登记已齐。

## 纪律自报

本会话误敲两次 `sed -i … /dev/null`（无效果、未写任何文件）与一次管道里的 `sort`（只读 ls 输出）；没有用 cd、python、heredoc、重定向、node -e。F:/dnd-tmp 下只有自写 .mjs（g6-bench、g6-bump-criteria、wait）与卡文。

## 修改轮（Opus 只核第一轮打回，docs/审查/G6-Opus只核-1121.md，必须改 7 条）

写：Claude Sonnet 5.5 中档自己改（材料数据用一次性脚本 F:/dnd-tmp/g6-fill-materials.mjs 按类别规则生成，没有派 DeepSeek：规则要逐类自己定，填值本身是机械生成）。

- M1：删 _unbuilt-derived.json 四条放行；material.json 99 行加空气共 100 行，opaque／blocksSky／bearsLoad／airtight 三栏全填并每格写 cellGrades 依据；四个维度加 `requiredFields: [gas, liquid, solid]`，validate/types.mjs 支持顶层 struct 逐栏必填（缺栏 E-DIM-REQUIRED-MISSING；原来顶层 struct 缺栏不报）；materialFlagReader 删"未知"分支（缺失即 KernelError E-DIM-REQUIRED-MISSING）；测试世界照填（grid-view 直接用真实行；body-world、item-world、material.test 三处夹具行补通用四布尔）；material-grid-flags 改成断言"真实世界每行每栏有值、删任一行任一栏即 E-DIM-REQUIRED-MISSING"。数据归属：卷三甲 1121k6 末句写"数据归 G6"，归本卡。
  - 取值类别（固栏〔不透光、遮天、承托、不透气〕）：刚性连续固体 33 行（金属、岩土砖陶、骨、木竹、蜡脂硫、汞）1111；玻璃 1 行 0111；冻结清液 9 行（冰与冻结的清水类）0111；冻结浊液 4 行（血、乳、醪）1111；软质固体 8 行（脂、乳制品、肉蛋鱼）1101；块状燃料与干饼 6 行 1110；粉末 2 行 1100；散粒与枝叶堆 18 行（粮、菜、草、叶、壳、树皮）1100；纤维织物 12 行 1100；皮革与纸 4 行 1101；编织物（柳条）1 行 0110；气体材料（天然气）1 行 0000。液栏统一遮天假、承托假、不透气真，不透光仅清澈液体（水、海水、醋、酒、油、蜜、樟脑、蜡、树脂、天然气）为假；气栏四项皆假。
  - 推不出、按物理常识设定的行（回报列出，供复核与李白改）：软质固体与冻结液体的承托（冻乳、冻血按"冻硬"取真）；皮革、纸的不透气取真、织物取假；块状燃料承托真而透气；冰的不透光取假（卷三甲写"按作者写"）；液态岩土、金属、陶（熔融）取不透光真；固态空气、液态空气取四项皆假。这些全是设定级（designed），不是卷文值。
- M2：distributeStock 按净差 plus − minus 补平，补不平改内部不变量（普通 Error，不报数据码）；补复核反例 A{cap 1, S 0}、B{cap 3, S 3}、N = 1 期望 A 1、B 0（三种坐标次序），加负净差例与小输入穷举（Σ n 恰为 N、n ∈ [0, cap − S]）。
- M3：regionSlope 框内邻格高度未知返回 null（已知部分已截到 1 则仍为 1）；外包框外邻格不交；gridView 坡度未知时区格 cellClass 为 null、细格整列 known 为 false，不抛 E-GRID-CELL-NO-TERRAIN；测试改期望并加"邻格未知"用例。
- M4：gridView 在 waterKind 非空的区格里，地表以上的格返回 known false（内容与三标志 null），地表层及以下的遮天未确定为真者置未知；测试"水体足迹里的区格地表以上未知"。问题.md 与函数文档改"未接数据源→未知"，并写明归卡须排在 G10 之前（S6）。
- M5：installGridRules 改由 load/world.mjs 在 installStorage 之后随世界加载装入（`installGridRules(read.rules.grid)`，每次重装）；gridRulesNow 改抛 KernelError E-RULES-UNREGISTERED（S7）；测试各自装入、验证重装覆盖与未登记报码。
- M6：waterOfRegion 多收 `m3PerL`（单位表 _units.json 里 L 的 si），不再借 permille；测试从 _units.json 读取，并用 0.002、0.01 的假想单位验证水深确由入参定，0 拒收。
- M7：空气是一行材料（主会话已定）：加 `mat_air`；gentemplate 加必填字段 `airMaterial`（checkGenTemplates 核引用），格基底空格取它、物态 gas；grid-base 删 AIR 常量与"空气恒为假"，gridView 的 material 不再为 null（未知格仍为 null）。推不出的必填维度：`substance` 是闭族且无空气项，我加了 `subst_air`（卷三甲跟改项）；`meltPoint`、`boilPoint` 取干空气标准值（−210、−194 °C）、密度 0.00129 kg/L、`valueMult`、`workDifficulty`、`salvageFraction` 取 0（设定，写了依据）。
- 一并做的建议：S5（cellclass.genTemplate 引用一律核，不再依赖 plans）；S7 见 M5；问题.md liftLayers 改"等李白裁定"。S2、S3、S4、S8 未做（记入后续）。
- 卡文外的必要扩展：validate/types.mjs（requiredFields）、_vocab.json 加 subst_air、tests 三处夹具、criteria 再重盖一次。
- 验收：`node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` 末三行 `ℹ tests 1481`、`ℹ pass 1481`、`ℹ fail 0`；`node tools/accept/run.mjs pre_commit` 的 `"verdict": "pass"`，仅三项基线失败 vol12 A12-4.5、S12-2、S12-3，vol5.S5-10 pass。
- 卷十跟改项：gentemplate 加必填 `airMaterial`（卷十 §2.1 :118）；卷三甲跟改项：substance 族加 `subst_air`（见"末处两补"，待裁定）。卷二跟改项共两条：错误码表补 E-GRID-STOCK-OVER-CAP；§1.4、§1.5 命名 struct 逐栏必填写法——表头加 `requiredFields`，用在 struct 维度上表示逐栏必填、缺栏报 E-DIM-REQUIRED-MISSING，`struct:byState<T>` 写明栏在此时不可为 null（本卡不改卷二文件）。

## 末处两补（Opus 末轮）

- ② requiredFields：types.mjs 改动保留，已在本回报与 docs/问题.md 改列"卷二跟改项（§1.4、§1.5 命名 struct 逐栏必填写法）"，不改卷二文件。
- 材料 basis：软质固体、冻结浊液、块状燃料、粉末、散粒与枝叶堆、纤维织物、皮革与纸、编织物的承托与不透气（固栏），及熔融态不透光，共 144 格 basis 前缀"暂定·待试玩标定"；空气沸点（−194 °C）、密度（0.001293 kg/L）改 measured 并写 CRC Handbook 出处（没有查到版次与表号，出处只写手册名与空气物性表）；熔点 −210 保持设定。
- **主会话裁取乙后已做**：删 subst_air，mat_air 的 substance 填 null；matcatRules 末尾加按物态派生的一条规则 `known(boilPoint) && boilPoint <= rules.materials.gasBoilMax → matcat_gas`（gasBoilMax 20 °C，登 rules.materials 与 registry；matcat_gas 加进 matcat 开放族），空气与天然气同分到气体大类，加载通过；用例见 material-grid-flags.test.mjs（空气分到 matcat_gas、真实表只有空气与天然气、临时世界沸点 −30 的新材料进、沸点 100 的不进）；material.test 的卷三乙预期表比对暂去掉 matcat_gas。**卷三乙 §4.1 跟改（matcat 规则与条目）列入下批勘误**，卷三甲 subst_air 跟改项作废。验收：全量测试末行 `ℹ tests 1482`、`ℹ pass 1482`、`ℹ fail 0`；pre_commit verdict pass。
- **卷三乙勘误 1121k13（本分支同改卷文，主会话令）**：§4.1 matcat 族加 matcat_gas、matcatRules 加第九条（沸点不高于 gasBoilMax；只读沸点、不恒真、排最后、命中全部生效）、gasBoilMax 20 进核对值表、预期结果表补 mat_air 并给 mat_natural_gas 加 matcat_gas、附录勘误行 57；改前快照 `版本快照/卷三乙-v7-勘误前-1121k13.md`（git hash-object 核与 origin/master 同 blob 8a65390a9），v7.md 现行快照同步；快照用一次性脚本 F:/dnd-tmp/g6-snap.mjs 复制（没有用重定向）；不升版本。material.test 撤回"去掉 matcat_gas"，恢复逐项严格比对，期望照勘误后的卷三乙表（93 → 94 行）；docs/问题.md 该跟改项标已落实。验收：全量测试与 pre_commit 见提交说明（末行 tests 1482、pass 1482、fail 0；verdict pass）。
- （以下为裁定前的记录）① 未能照做：删 subst_air 并把 substance 改 null 后世界加载失败（E-DIM-REQUIRED-MISSING material/mat_air.categories：无 substance 的行必须被 matcatRules 分到大类，空气没有对应大类，已实测）。保留 subst_air，请主会话裁定：甲，保留 subst_air（改封闭族，卷三甲跟改）；乙，加一条 matcat 规则与条目（matcat 开放族，卷三乙 §4.1 M-9 跟改）。
- 纪律自报（修改轮）：又误用 echo 一次（无副作用）、heredoc 一次（空命令，无写入）；没有 cd、sed -i、sort。
