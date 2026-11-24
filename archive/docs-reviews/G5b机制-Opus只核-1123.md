# G5b 机制部分 Opus 只核（第 1 轮）

复核者：Claude Opus 5.5 中档。只读工作区 F:/dnd-wt/rv-g5b（分离头 e999d3e0e，分支 ds/g5b-convert），基线 origin/master（合并基 deded7742）。依据：李白 11-23 事件 5570b261 第 C 条。本轮只核机制四块；附表河道、地点归属这些数据不在本轮范围。

本机运行：`node --test tests/kernel/footprint-rects.test.mjs tests/kernel/footprint-memo.test.mjs tests/kernel/gen-siteform.test.mjs tests/kernel/footprint.test.mjs`，结果 `tests 65 pass 65 fail 0`。全规模划分没有跑，只读写者报的实测数字。全量测试未跑。

## 总判

| 块 | 判定 |
|---|---|
| 1 boundary 矩形之并 | 机制本身过：展开后是同一集合，校验照旧，流水写矩形会报错。勘误流程有两条必须改（M1、M2）；表头放宽后缺了加载期逐项核对，必须改（M3） |
| 2 全规模划分提速 | 过。另有建议 S1–S3 |
| 3 站点面积 R10-7.5 | 必须改两条（M5、M6）。layoutOf 加一重排未落，不挡合入 |
| 4 form_unbuilt 例外 | 不成立，撤（M4） |

## 一、boundary 矩形之并（勘误 1121k22）

**语义（过）**。卷五 :98 和规则 10 作者覆盖句（:489）只把矩形之并当成"同一区格集合的简写"，规则 10 的占格先后、派生划分、校验三项都没改。代码在 footprint.mjs :232–:262：矩形先逐格展开，再走逐格写法的同一个 `claim`，所以出父足迹、与兄弟相交这两项都在展开后照旧核。同一行里几个矩形盖到同一格时（:240 前一行 `o === childIndex.get(id) && rectMode`）只算一次，`coverCount` 不会重复计数。

四邻连通用 `rectsConnected` 判（:77–:84），条件是两矩形相交或有公共边。我自己核过它和"展开后逐格四邻连通"等价：
- 单个矩形本身连通。
- 并集里两格四邻相接、分属 A、B 两个矩形时，A、B 必然在一个方向上区间相交，另一个方向上相交或首尾相接。只碰到一个角的情况不算。

测试第三条守住了"只共一角"和"隔一列"两种反例。

**流水禁矩形（过）**。:244 遇到 `flowing === true` 且写成矩形时报 E-DIM-STRUCT-FIELD，这个码已在卷二 §4.3 :103 登记。另外，流水行的表序校验（E-GRID-WATER-BAND）只对逐格写法跑，矩形写法在这之前已被拒收。

**必须改**

- **M1 勘误前快照不合先例。** 两卷 1121k22 行写的是"快照 = git 对象 …，快照目录文件过大不另抄"。可是先例都是在 `版本快照/` 下存文件，而且卷二 992,553 字节的 `版本快照/卷二-v18-勘误前-1121k19.md` 已经入库，"过大"这个理由不成立。另外行里引的提交 97e45aa45 是分支提交，合并方式一变就可能找不回来。哈希本身我核过，与 origin/master 的 blob 一致：
  - 卷二 9540cf52…
  - 卷五 3c713740…

  改法：
  1. 补两个快照文件，内容取 origin/master 的这两个 blob，用 `cmp` 核对：
     - `版本快照/卷五-v12-勘误前-1121k22.md`
     - `版本快照/卷二-v18-勘误前-1121k22.md`
  2. 两行改写成先例体例："勘误前快照 `版本快照/…-1121k22.md`（与 origin/master 同 blob），版本号不升"。
- **M2 勘误表行没有追加在表末。** 卷二新行插在 1121k9 和 1121k19 之间（卷二 :3381）；卷五新行插在 1121k12 和 1121k15 之间（卷五 :1612）。规矩是"勘误表追加一行"，两行都要移到各自表的最后一行。
- **M3 表头放宽后丢了加载期逐项核对。** place.json 的 boundary 项 struct 把 `required` 从 `["x","y"]` 改成了 `[]`，source 写的是"字段齐全由 footprint.mjs 划分时核"。但只有表里有格空间表、而且这一行参加划分时，划分才会跑。真实世界现在没有格空间表，所以 `{}`、`{x:1}`、混写的行加载时都不会报错，这违反卡头二.3"不留绕过口子"。
  - 改法：在 place.mjs `checkPlaceTable` 里对每个写了 boundary 的行逐项核，每项必须满足 `isCellIndex` 或 `isRectEntry`，一行不许混写。不合格报 E-DIM-STRUCT-FIELD，与是否划分无关。
  - 划分里现有的核对可以保留，也可以改为只读这里核过的结果。
  - 补一条测试：没有格空间表的表里写坏项，要报错。

## 二、全规模划分提速

**逐格相同（过）。**
- 打包键是 `d2 × total + (x−x0) × cellsY + (y−y0)`，其中次序号小于 `total`，所以整数大小顺序和 (d2, x, y) 字典序完全一致。
- 入口 :402–:403 用 `(maxD2+1) × total` 核安全整数。最大键是 `maxD2 × total + total − 1`，严格小于这个上界，Float64Array 能精确存下，超了就拒收，不降级。
- 弹堆时跳过已被占的格，与旧 MinHeap 的写法逐句对应；生长轮次和目标格数都没有改。
- footprint-memo 第一条拿测试里独立写的朴素参照比对：40×30 区格、三个子行、种子挨得很近以逼出争格和并列。G3 的手算用例全过（footprint.test.mjs 30 条）。比对用例够守这次的改动，但覆盖面偏窄，见 S1。

**"结果与遍历容器的顺序无关"（过）。**
- 子行按 id 字典序（:196）。
- buildPlan 插行按 id 升序；记忆键里行的先后只会造成多一次没命中，不会命中出错的结果。
- 规则 10 打乱存放顺序的老用例仍然通过。

**浅拷贝共享的只读数组（过）。** 我用 Grep 自己查了 server-plugin 下计划字段的全部写入模式，计划共享部分（owner、ids、idx、parentIdx、order、cells、rect、sizes）只在 `planRegionFootprints` 里写：
- footprint.mjs :208–:211：register
- :240、:278、:338：盖章
- :385–:387：settle
- 另有 `queued`：:298、:315 写，:409 划完置 null

划分返回后没有任何写入点。place-building.mjs :239 的 `s.cells.set` 写的是蓝图自己的缓存对象，不是计划。记忆里存的是原件，每次交出去的是浅拷贝（place-plan.mjs :58），geometry、heights、adjacency、controlPoints、waterBeds、bedOff 每份都是新的。写者报的行号与实际差了十几行（:195–:198 实际是 :208–:211，依此类推），但集合是完整的。

**表序与河床（过）。** 现在作者写了逐格 boundary 的行存表序，其余行按区格下标升序（以前是按生长序）。我核了读这个顺序的地方：
- water-bed.mjs :106 只有 `ordered` 为真时用表序，条件是 flowing、boundary 非空且逐格写法（流水的矩形写法已被拒收）。
- 非有序行只取整行最小值并封顶，与顺序无关。
- `junction` 对上游 X 的格只当集合用（packedOf）。
- `bedPositionOf` 和 `infoOf` 都经同一个 `cellsOf` 取格，位置对得上。
- 其余读者（regionGeometry、regionHeights、landRegionCell、accessCell、openBoundaryCells、cellList、waterAccessOf）都是求和、取极值加 (x, y) 定序，或者先排序再用，与顺序无关。

结论：河床结果不变。

**heights 可给函数（过）。** gen/water.mjs :43–:52 只读水体行和存量单元行的 elevationM，worldgen.mjs :46 点名的正是这两类行。

## 三、站点面积（R10-7.5，卷十 :680）

**逐句对照**

| 卷文 | 实现 | 判 |
|---|---|---|
| 占地 = 各行"楼面面积 ÷ 层数"之和 | 各建筑 `planCells` 的宽 × 深 × cellM²（siteform.mjs `occupancyN`） | 过。第三版的 planCells 就是每层平面，与"楼面面积 ÷ 层数"同一个量 |
| 不分片站点 N = max(1, ceil(全部占地 ÷ (coverage × A))) | `(fixedUnits(占地) + 分母 − 1) / 分母`，下限取 1n | 过。定点同标度，向上取整正确 |
| need_z、份额、余格按卷二 §3.3 第 3 条分 | 未落（模板与分片角色没有接线，按 R10-7.1 不分片） | 过（已在文件头登记未落） |
| 排不下 N 加一，最多加到存量单元格数 | 未落 | 不挡合入：要用到建筑锚点阶段（R10-7.11），那一阶段还没有接线，已登记未落 |
| 起始 N 超过所在存量单元足迹格数即 E-GEN-ROW-INVALID | 没有实现，也没有登记未落 | **必须改 M6** |
| targetAreaM2 写 N × A | `fixedToNumber(n × cellArea)` | 过 |
| 手写站点已有 targetAreaM2、boundary 的照作者值 | 过滤掉了这些行 | 过 |
| （卷文无此句）站点格数不小于子行最少格数之和 | `minCells` 对子行求和后取大者 | **必须改 M5** |

**layoutCoverage 0.4（过，带建议）。** 卷十 :182 只给了取值域 (0, 1]。规则表写的是"暂定·待试玩标定"，grade 为 designed，与同表 waterRows、bldfillRows 的处理一致。运行期 0、大于 1、不是数都拒收，测试已试过这几个特殊值。见 S4。

**必须改**

- **M5 撤掉"子行最少格数之和"。** 回报写"子行余量已撤"，但撤掉的只是 ÷coverage 那一层，`minCells` 对子行求和再取大者的分支还在（siteform.mjs 站点面积一节 `minCells`），gen-siteform 新增的第二条用例也在守它。R10-7.5 的 N 只由占地决定，卷文推不出这一条。按卡头二.1 删掉这个分支和那条用例。嵌套地点装不下子行是真缺口，写进 docs/问题.md 报李白。删完后 `boundaryCellCount` 没有读者了，应一并删掉；它对重叠矩形给的是上界，却被当成"至少"在用。
- **M6 补"起始 N 超过所在存量单元格数即报错"。** 可以在站点父行是存量单元（roleTract）时实现并补一条手算用例。父行不是存量单元的手写站点，这句无从判，写进文件头未落和 docs/问题.md。两种做法都可以，但不能既不实现也不登记。

## 四、form_unbuilt 例外

结论：撤。理由三条：

1. 卷二 :398 的未建列登记只收"他卷登记的 always 维度与必填列，所在卷的词表族、采样维度或玩法尚未前移的"。form 所在的 bform 族已经在 `_vocab.json` 建成，place.json :430–:437 把 form 定为 `required: byClass:comp_facility`、`onUnknown: error`。旧数据缺形制是数据缺口，不是卷没前移，不在这条登记的适用范围里。
2. 卷十 :684 R10-7.12 对这种情形有明文："缺则该行不合卷十九 §2.1、E-GEN-ROW-INVALID"。卷二的未知口径是总则，不能盖过这条具体规定。
3. `world/ontology/dimensions/_unbuilt-derived.json` 里没有登记 form，所以现在这条路只有测试走得到，按"删除优先"也不该留。

**M4 改法：**
- 删掉 siteform.mjs 的 form_unbuilt 分支和 `REASON.formUnbuilt`、`REASON.sitePartial`（平面未知只可能从这条路来）以及 `DIM_FORM`。
- 删掉 worldgen.mjs 里传 `unbuiltColumns` 的那一行。
- gen-siteform 中 form_unbuilt 那条用例删掉，站点面积第四条中 site_footprint_partial 的部分删掉；coverage 出域那半条保留。
- 文件头注释恢复为"缺 form 即 E-GEN-ROW-INVALID"。
- 真实世界建筑缺 form 的问题交数据卡补齐，或报李白。

## 五、通用项

- **det-math**：改动的五个规则层文件没有用 Math.*。siteform 只有整数值的 JS 乘法，没有超出定点范围。过。
- **特判**：机制代码里没有按 id、名称、文件名开的分支。building-classes.json 逐行列 id，但它是转换脚本的输入数据，不属本轮机制。过。
- **期望值**：rects、memo、siteform 的新用例都按手算写成字面量，注释里有推算过程。memo 的参照是独立写的朴素实现，没有抄实测数字。过。
- **gen-worldgen.test 改断言**：原断言是"作者行没有任何偏离行"，改成"不出海拔偏离，且只多一条 targetAreaM2"。这是站点面积阶段新写了一个维度，新断言把多出的维度精确写明了，不算放宽。过；M5、M6 改完要重跑。

## 建议（不挡合入）

- **S1** footprint-memo 的朴素参照比对再加一条：两层嵌套，作者逐格 boundary、矩形 boundary 与派生子行混在一起，比对每一层的归属。
- **S2** 回报里的写入点行号改成实际行号（见第二节）。
- **S3** 记忆留最近两份，全规模下归属数组常驻最多约 320 MB。回报写的"常驻约 160 MB"是一份的数，应注明。
- **S4** layoutCoverage 的 basis 补上量级推算依据，体例同同表其他暂定行；现在只写了"是 G11 手算例的前提"。registry 的 domain 是 [0, 1]，卷文是 (0, 1]，运行期已拒 0，在 basis 里注明一句即可。出域报 E-GEN-ROW-INVALID 不太贴切，这是规则表的问题，不是行的问题，可以改用规则表加载的码。
- **S5** siteform 删了"没有建筑就提前返回"，结果是没有 blueprint 规则、也没有建筑的世界现在会抛 E-RULES-UNREGISTERED。站点面积其实只用到 cellM 和 regionCellM，请确认这是想要的行为。
- **S6** 站点现在用排除法认（不是政区、不是存量单元、不是水体）。作者写的分片行（comp_zone）也会被写进 targetAreaM2。真实数据里有作者分片行时，这就会出错。宜按卷十里站点的身份来认。

## 六、合入切分

**机制，现在可以先合**（M1–M3 改完后）：
- server-plugin/kernel/footprint.mjs
- server-plugin/kernel/place-plan.mjs
- server-plugin/kernel/place.mjs（含 M3）
- tests/kernel/footprint-rects.test.mjs、tests/kernel/footprint-memo.test.mjs
- docs/统一底层设计/卷五-地点地形与资源场.md、docs/统一底层设计/卷二-维度表规范与统一入口.md，连同两个新快照文件
- world/ontology/dimensions/place.json：这次只改了 boundary 表头，属于机制，不是数据

**站点面积，M4–M6 改完、再核一次后合**：
- server-plugin/kernel/gen/siteform.mjs
- server-plugin/kernel/gen/worldgen.mjs（heights 函数这部分可以随第一批走）
- world/rules/registry.json、world/rules/tables/worldgen.json（layoutCoverage）
- tests/kernel/gen-siteform.test.mjs、tests/kernel/gen-worldgen.test.mjs

**必须等数据一起合**：
- tools/convert-geo-g5b.mjs
- world/geo/geo-model.json
- world/geo/building-classes.json

**文档由主会话按实际情况取舍**：docs/PLAN.md、docs/问题.md、docs/卡回报/g5b-convert.md（回报里"子行余量已撤"与代码不符，见 M5）。

## 复核者命令纪律自报

跑测试的那条命令前面误加了 `cd /f/dnd-wt/rv-g5b 2>/dev/null;`，违反了卡文"禁止 cd、禁止重定向"。这条命令没有写任何文件，测试本身用的是绝对路径。其余操作都只用了 git 只读子命令、sed -n、ls、wc、node --test、Grep 和 Read。

---

# 第二轮（最后一轮）

复核者：Claude Opus 5.5 中档。核的是 `git diff e999d3e0e 19770472a`，分支 ds/g5b-mech。只核下面几件，不加新要求。

本机运行：`node --test tests/kernel/footprint-rects.test.mjs tests/kernel/footprint-memo.test.mjs tests/kernel/gen-siteform.test.mjs tests/kernel/place.test.mjs`，结果 `tests 68 pass 68 fail 0`。全量测试未跑，全规模划分未跑。

## 一、M1–M6 落实情况

| 条 | 判定 | 证据 |
|---|---|---|
| M1 快照 | 过 | `git hash-object` 两个快照文件，分别得 3c713740…（卷五）、9540cf52…（卷二），与 origin/master 的 blob 一致。两卷的行都改成了先例体例："勘误前快照 `版本快照/…-1121k22.md`（与 origin/master 同 blob）" |
| M2 行位置 | 过 | 卷二的 1121k22 行现在在 1121k19 之后，是表末，紧接"（卷二 第十七版 完）"。卷五的行在 1121k17 之后，是表末，紧接"## 附录 自检脚本输出" |
| M3 加载期逐项核 | 过 | 见下面第三节 |
| M4 撤 form_unbuilt | 过 | siteform.mjs 里的分支、`REASON.formUnbuilt`、`REASON.sitePartial`、`DIM_FORM` 都删了；worldgen.mjs 传 `unbuiltColumns` 的一行删了。新用例改为 form 是 null 或不存在的条目都报 E-GEN-ROW-INVALID。`occupancyN` 不再容忍缺平面，因为缺 form 在前面已经报错，这一点注释写明了 |
| M5 撤子行求和 | 过 | `minCells`、`kids`、`boundaryCellCount` 和它的测试都删了。新用例守的是"N 只由占地决定"：挂了 30,000 m² 子行的站点仍写 10,000 m²。这个缺口写进了 docs/问题.md"G5b 机制遗留"第 1 条，列了三种做法报李白，没有自定 |
| M6 存量单元格数上限 | 主体过；自加的缺口仍须改一处 | 父行是存量单元时 N 大于它的格数就报 E-GEN-ROW-INVALID，日志字段齐全。手算用例：5,000 m² 得 N = 2，存量单元 1 格报错、2 格放行。父行不是存量单元的情况写进了文件头未落和问题.md 第 2 条。自加的 `tract_footprint_unplanned` 见第二节 |

## 二、自加缺口 tract_footprint_unplanned（仍须改 R2-M1）

卷文没有这一情形的依据。R10-7.5（卷十 :680）只写了"起始的 N 超过所在存量单元足迹的区格数……即 E-GEN-ROW-INVALID"，没有写足迹求不出来时怎么办。

现在的代码（siteform.mjs `tractCellCount` 与站点循环）把两种不同的情形都记成缺口放过去：

1. **世界没有格空间表**，也就是真实世界的现状。这时任何行都没有足迹，规则 10 整体不生效（place.mjs checkPlaceTable 注释："没有行就没有格可划"），这一步本来就判不了。记缺口如实，而且与 docs/问题.md 里尚未落的"世界必有格空间表"是同一件事，可以接受。
2. **世界有格空间表，但这个存量单元没划出足迹**。比如它在生成期吃了提案后划分出错。注意 worldgen.mjs :113–:119 的 `ctx.footprints` 不返回 `fp.errors`，所以划分出错在这里看起来就是"没有 cellCount"。这种情况下记缺口放行，就是用"未知"绕过了卷文明写的拒收，属于卡头二.3 说的口子。

**改法（不改设计，只收窄）**：
- 只在第 1 种情形（这一格空间、或整个世界没有格空间表）记 `tract_footprint_unplanned`。
- 第 2 种情形报 E-GEN-ROW-INVALID，日志带 site、tract，reason 写"存量单元没有足迹"。理由：这块地放不下这座站点，是数据缺口，与 R10-7.5"排不下即 E-GEN-ROW-INVALID"同一口径。
- 用例补一条：有格空间、但存量单元不在 footprints 里，要报错。
- 怎么区分两种情形由写者定。可以让 `ctx.footprints` 的结果带上"是否有格空间计划"，也可以在 siteform 的 ctx 里交格空间表行数。只要不按 id 判就行。

这条按 CLAUDE.md"两轮后的小改由主会话判断"处理：主会话亲读 diff、跑上面四个测试文件通过，就可以合入，不需要第三轮。

## 三、M3：boundaryEntriesValid 与 place.test 用例（过）

`boundaryEntriesValid`（footprint.mjs）的判法是：一行的项全部是 `isRectEntry`，或者全部是 `isCellIndex`。`isCellIndex` 补了"不带 x0、x1、y0、y1"，所以带 x、y 又带矩形字段的单项不能冒充逐格写法。

checkPlaceTable（place.mjs :1374–:1377）对每个写了 boundary 的行都跑这项核对，放在 rp.errors 之前，与这一行参不参加划分无关。划分里报的同一句用 `errors.includes(line)` 去重。

place.test.mjs 的新用例用 TREE 做夹具，TREE 没有格空间表。用例覆盖了：
- 空对象、缺 y、一行混写（单项缺字段）、矩形缺字段、一项混写、一行混写、x0 ≥ x1，都要求至少报一条 E-DIM-STRUCT-FIELD；
- 逐格写法和矩形写法的好行都为 0 条，作为对照。

卡里点名的混写、缺字段、空对象三类都覆盖到了。断言写的是"≥ 1"，但对照行是 0，可以确定这一码是 boundary 引起的，能接受。

## 四、写者未改的建议项

| 项 | 写者理由 | 判 |
|---|---|---|
| S1 嵌套混合比对 | 只加强覆盖，不挡合入 | 接受 |
| S4 layoutCoverage 的推算依据与出域码 | 要改规则表数据与登记，不在本卡边界 | 理由不对：worldgen.json 与 registry.json 的 layoutCoverage 本来就是这张卡新加的。不过它是建议项，不挡合入。宜在合入同批里由主会话顺手补一句推算依据；出域码可以留着不改 |
| S5 无 blueprint 规则时抛错 | 行为取舍，等裁 | **建议保持现状，不改。** 世界创建过站点面积阶段，本来就要有 rules.grid 和 rules.facility.blueprint；缺了明确报 E-RULES-UNREGISTERED，比静默跳过更守"不留口子"。没有世界需要"无规则也能跑"。在问题.md 记一句即可结案 |
| S6 站点用排除法认 | 行为取舍，等裁 | **建议现在不改代码，写进问题.md 报李白。** 卷十没有给站点一个正面标识：没有站点组件类，`gen.layout` 只写"站点行才可写"，没有反过来的规定，所以写者现在拿不到正面判据。可以先做的是：作者分片行（挂分片组件类的行）按组件类排除，这是规则层的做法，不按 id。现在真实数据里没有作者分片行，不挡合入；出现作者分片行之前必须补上这条排除 |

## 五、定稿可合入清单

**现在可合**：
- server-plugin/kernel/footprint.mjs
- server-plugin/kernel/place-plan.mjs
- server-plugin/kernel/place.mjs
- world/ontology/dimensions/place.json（boundary 表头）
- tests/kernel/footprint-rects.test.mjs、footprint-memo.test.mjs、place.test.mjs
- docs/统一底层设计/卷二-维度表规范与统一入口.md、卷五-地点地形与资源场.md
- 两个快照文件：版本快照/卷二-v18-勘误前-1121k22.md、版本快照/卷五-v12-勘误前-1121k22.md
- 本审查文件

**R2-M1 改完、主会话亲读 diff 加跑测试后合**：
- server-plugin/kernel/gen/siteform.mjs
- server-plugin/kernel/gen/worldgen.mjs
- world/rules/registry.json、world/rules/tables/worldgen.json
- tests/kernel/gen-siteform.test.mjs、gen-worldgen.test.mjs

docs/问题.md、docs/卡回报/g5b-convert.md、docs/PLAN.md 随这一批一起合。

**仍要等数据部分**：
- tools/convert-geo-g5b.mjs
- world/geo/geo-model.json
- world/geo/building-classes.json

仍须改：1 条（R2-M1）。

## 第二轮命令纪律自报

本轮只用了 `git diff`、`git hash-object`、`node --test`、`sed -n`、`tail`、Grep 和 Read，没有 cd、管道和重定向。写入只用了 Edit。
