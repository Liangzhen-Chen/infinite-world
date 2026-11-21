# 卷十勘误 1121k16–k19 写码卡 只核（Opus 5.5 中档，11-22）

对象：分支 ds/gen-errata-code，提交 f3346437f，`git diff $(git merge-base HEAD origin/master)...HEAD`（34 个文件，+2426/−196）；写者回报 docs/卡回报/gen-errata-code.md。
依据：docs/产品原则.md；CLAUDE.md；卷十 R10-1.7 :380、R10-2.12 :433（含求值次序）、R10-2.17 :434–:438、R10-2.18 :439–:445、R10-7.12 :684–:688、§4.1.1 :341–:354、§2.3 :166/:186；卷五规则 8 河床、规则 10；卷十九 :248、:557；李白 11-21 裁定 0b824a66、b58f7dca。
复核者只核、不改代码。本机只跑了本卡新增与改动的 11 个测试文件（`node --test tests/kernel/{gen-order,water-bed,gen-waterband,gen-siteform,gen-waterfoot,water-bed-footprint,gen-downhill,gen-fields,gen-water-grid,gen-worldgen,error-codes}.test.mjs` → tests 96 / pass 96 / fail 0）；全量 1680/1680 沿用写者在最终提交上的读数，未重跑。没拿到卡文原文，"八种情况"按卷文条目对照（见第三节）。

## 一、写者"须 Opus 核"六问

### ① 河床接进 footprint.mjs 的口径 —— 过
- footprint.mjs:450–485 `waterBedsOf`：水体行认作"写了 `waterKind` 的区域足迹行"（:456、:517）。`waterKind` 是 `comp_waterbody` 的 requires 字段（卷十 R10-2.12 :433 "七个字段"），和"挂 comp_waterbody"实际等价，口径也和 `waterAccessOf` 一致。只有一个前提：加载期要拒收"有 waterKind 而没挂 comp_waterbody"的行。这一条我没核到，记为建议 S9。
- 求值次序：worldgen.mjs:45 让水体阶段调 `planFootprints({bed:false})`，place-plan.mjs:100 给计划打上 `bedOff` 标记，cellHeight（footprint.mjs:513–523）在 bedOff 时只取 h₀。所以下游链按 h₀ 定、链定之后才求 bed，bed 不回头改链，和 R10-2.12 :433 一致。测试 water-bed-footprint 的 "bedOff" 用例守着。
- 有表序和没表序的分法（water-bed.mjs:67–82）和卷五规则 8 的河床条、R10-2.18 ⑥ 逐句对得上：有表序的行从汇入格起取前缀最小，湖、海和没有 boundary 的流水行整片受上游出口值约束。手算用例 water-bed 用例 1–13、water-bed-footprint 四条都对得上。
- gridView 对同一区格的每一列减同一个 δ（place.mjs:530 加上同文件 :535–536），和卷五规则 8 末条一致。

### ② 汇入格 O(|D|·|X|) 的代价 —— **必须改（M2）**
water-bed.mjs:33–47 `junction` 对 D 的每一格，都暴力扫 X 的全部格求最小曼哈顿距离。按全规模估算：一个 10⁵ 区格的湖出河、河长 10⁴ 格，就是 10⁹ 次；一条干流挂几十条支流（每条 10³–10⁴ 格），合计 10⁹–10¹⁰ 次。这还发生在 gridView 第一次碰到水体区格的运行路径上（place.mjs:530 → footprint.mjs:519），全规模不可接受。按北极星"全规模、真实运转"的要求，这不能留到云上再测。
正确写法：两块足迹互不相交，所以最小距离至少是 1。只要 D 里有一格与 X 四邻相接，最小距离就是 1，而且 D 表序里第一个这样的格就是汇入格。所以先按 D 的表序逐格查四个邻格是否属于 X：属于关系可以用 X 的区格下标排序列加二分查（bedPositionOf 现成的写法，footprint.mjs:487），也可以经计划的 owner/inFootprint 查，代价是 O(|D|·log|X|) 或 O(|D|)。只有一格都不相接时（生成的链和本阶段补的窄带按构造必然相接，所以这只出在作者手画、不相接的 boundary 上）才退回逐格求距离，并在注释里写明这条退路的代价和触发条件。water-bed.mjs 是纯函数，可以把"是否相接"做成 `src` 的一个入口交进去，接口不必为此改形状以外的地方。改完补一条用例：大 X（例如 200×200 的湖）汇入长 D，断言汇入格与暴力解相同。不许用计时做断言。

### ③ waterfoot 的占用格口径 —— 过（附建议 S1、S8）
逐字对照卷十 R10-2.17 :435 的种子条：
- "作者 boundary 覆盖的格"：waterfoot.mjs:65–68 取全部行的 boundary，对得上。
- "作者已写的与骨架阶段已生成的同父兄弟种子格"：:66–73 的 `seedAt` 按父行分组，:139 只扣同父的，对得上。gstage_skeleton 还没建，暂无骨架种子。
- "本阶段先处理的水体行已取的种子格与已写的窄带格"：:75、:192、:196 的 `taken`，对得上。
- 多出来的一处：已齐的行（:106）把作者写的 coord 放进了 `taken`，跨父也扣。这比卷文的"同父兄弟"宽，是保守做法，不会出错；但应写成"已定"并说明理由（S8）。
- 目标格集 `T_D`（:166–175）：D 有本阶段写的窄带就取窄带，D 有作者 boundary 就取 boundary，否则取 D 的种子区格，和 :437 一致。中心线、带的取法、r 的搜索（waterband.mjs:24–109）和 :437 逐项一致：表序是"最近中心线格下标、到该格的距离、(x, y)"，裁剪按"不被占且与已入带者四邻相接"判，r 的搜索有两个止点。

### ④ order.mjs —— 过
projectOrder（order.mjs:26–105）实现了 ③ 的环和固定值反序、④ 的 lo/bound 先抬后压、"未知节点取自己的 bound"，以及 ⑤ 的 floor/cap 判法和并列取 id 最小，A10-2.4 ① 的各例都有对应测试（gen-order A–I6）。genOrder 只收"作者写的 downstream"和作者次序链（:124–133），和 R10-2.18 ① 一致。写回器 `revise` 只许改先行阶段的生成值（writeback.mjs 加上 worldgen.mjs 里 `generatedDims` 的检查），作者值一律报 E-GEN-OVERRIDE-AUTHORED。

### ⑤ siteform "收窄卷文" —— **改了卷文，必须改（M1）**
- 卷文本来就有终止条件，写者没漏读，代码也做了。卷十 :688 原句是：planCells "任一边将超过 4096…仍不行，即 E-GEN-ROW-INVALID"。代码里 blueprint.mjs:107 由 planCellsOf 越过 `planCellsMax` 抛 E-DET-DOMAIN，siteform.mjs:27–28、:95 的 wrapDomain 把它转成 E-GEN-ROW-INVALID，所以加倍本来就有界。
- 但 siteform.mjs:98–99 又加了一条卷文没有的规则：原因是 `entranceNotAdjacent` 或 `floorOverOpenRoom` 时不加倍，直接报错。逐个看：
  - `entranceNotAdjacent`（blueprint.mjs:190）只取决于 storeyBase 加 storeys，与面积无关。照卷文加倍到上限，结局必然也是同一个 E-GEN-ROW-INVALID，提前停是结果等价的捷径，可以保留，但要写"已定：与面积无关（blueprint.mjs:190 只读 storeyBase、storeys），加倍结局相同"。
  - `floorOverOpenRoom`（blueprint.mjs:287）取决于各层按 share 用 splitRows 把进深 D 分成若干行后的取整位置。不同层的房间数不同，隔墙行的偏移是绝对值，所以取整结果会随 D 变，并没有证明与面积无关。在没有证明的情况下提前停，可能把卷文判为"加倍后可展开"的房子判成报错。这是代码先于卷文改语义，违反卡头二.1 与 CLAUDE.md"方案确定后不推翻"。
- 写者给的理由和自己的代码对不上。回报说实测"一个房间表放不下的形制，加倍到 2000×2000 细格即内存耗尽"。可"房间分不下"（`roomsInfeasible`）恰恰仍在重试集合里（:99），收窄对这个实测案例根本不起作用。
- 正确做法，二选一：
  (a) 照卷文：`ok` 为假一律加倍到上限。只给可证明与面积无关的原因（目前只有 entranceNotAdjacent）留提前停，并写明"已定"和证明。内存问题落在原语层解决：在 blueprint.mjs 给 planBlueprint 加一个不铺格的可行性预判，planTooSmall、entranceNotAdjacent、roomsInfeasible 都只读 W、D、房间表，floorOverOpenRoom 可以按各层房间的行区间判，代价 O(层数×房间数)，与 W×D 无关。加倍循环先用预判，可行时才真铺蓝图。语义与卷文完全一致，也不再白铺大蓝图。
  (b) 如果实测证明照卷文跑到 4096 上限本身就装不下（例如可行、真要展开的 4096² 蓝图），那是卷文上限的问题，要停下报李白出 R10-7.12 勘误（例如改上限，或改成"与面积无关的原因直接报错"写进卷文），不许代码先行。
- 测试缺口（并入 M3）：没有一条用例走到上限后报 E-GEN-ROW-INVALID，也没有一条用例走 entranceNotAdjacent 或 floorOverOpenRoom。

### ⑥ 三个阶段条目与 after —— 过
_vocab.json 里三个新条目的 phase、scope、generator 节点和卷十 §4.1.1 :342、:344、:354 一致。gstage_waterfoot.after 缺 gstage_skeleton、gstage_siteform.after 缺 gstage_economy，是因为前置条目还没建，basis 里写了原因，符合"新卷只登记自己的条目"（R10-1.5）。gstage_waterfoot 是世界作用域、gstage_water 是 tract 作用域，两者并存不违反 R10-1.4：世界作用域只有一个主体，次序只由数据定（waterfoot.mjs:45–57）。

## 二、再核各项

1. **五个既有测试的改动 —— 过**
   - error-codes 是码数字面量按三条新码手算加三。
   - gen-downhill、gen-fields 的前提没变，投影改由 genOrder 做。跨链冲突那条把断言收紧了：报错文本要含 400 和 500。
   - gen-water-grid 改 `by` 是 R10-2.17 新阶段排在自然量之前的必然结果，r 的手算也补了。
   - gen-worldgen 按阶段过滤缺口，另加一条专测水体足迹补缺的缺口。
   五处都是新行为必然带来的改动，没有放宽断言，也没有抄基线读数。
2. **storeysMax 顶替 —— 不是双源，也不是写死，但属"拿较弱的界顶上"，必须改（M5）**
   - 卷十 :687 的 storeysMax 出自卷十九 :557 `lookup(rules.facility.build.storeyCurve, s × wallThicknessM)`。仓库里 `storeyCurve` 和 `storeyStress` 两个规则键都还没有（grep world/ 与 server-plugin/ 无命中），所以确实算不出。
   - siteform.mjs:77 取的 `rules.facility.blueprint.storeysMax` 是 planBlueprint 输入域的上限，是另一个量、另一个出处，不构成双源。它是真上限的必要条件，夹进它不会错，但不充分：补出的层数可能超过材料能撑的层数，而这一行会被当成"已补齐"放行，卷十九 A19-4.2 的"storeys 不超过 storeysMax"到建行时才会暴露。
   - 必须改：凡是用域上限夹过层数的行，都在 deferred 里记缺口（原因代号，例如 `storeys_max_unchecked`），并登记 docs/问题.md、写明归卷十九建行卡（storeyCurve 登记后在同一处换成 buildPlan 的 storeysMax、删掉这条缺口）。这样不是为测试造设施，而是如实标出没核的那一半。
3. **房间行只列缺口、不造行 —— 不违反 R10-7.12，但要登记（并入 M4）**
   - 卷文要求按 R10-7.8 ② 的"同一个建行函数"补建房间行。内核里还没有这个函数：roomRole 只出现在 place-building.mjs:138–160 的读取对应和 siteform.mjs，没有任何建行函数。自己另写一个就成了第二份建行逻辑，违反"跨卷共用定义只一处"。
   - 所以只列缺口（siteform.mjs:107–125）、对应口径和 place-building.mjs:138 一致（同一 roomRole 按行 id 序对应第 k 间），是正确的处理。但它目前只写在回报里，没进问题.md。
4. **whenRX 只读本行维度 —— 未落合理，但涉及跨卷，要登记并报（并入 M4，见第五节）**
   - when.mjs:20–29 只把本行维度绑定给 RX。卷十 :166 要读"父行维度"，:186 要读"所挂形制条目的数值字段"和 `intendedType`。
   - 占位规则行（worldgen.json 的 waterFillRows、bldfillRows）按 `waterKind ==` 和 `known(form)` 写在数据里，代码里没有按代号分支，不算特例。
   - 但 `known(form)` 读的是 form 代号本身，严格说超出了 :186"只读 intendedType 与形制数值字段"的范围，属于过渡，需在问题.md 记下，intendedType 登记后改掉。
5. **确定性 —— 过**
   - 各处遍历都先按 id 或 (x, y) 排序（waterfoot.mjs:42、:57；order.mjs:37、:47；water-bed.mjs:54；footprint.mjs:455）。
   - 抽取只用登记过的抽取点加行 id。bedPositionOf 用 Float64Array 原生排序，打包值上限约 4×10¹⁴，小于 2⁵³，精确。
   - 测试有"打乱输入次序仍相同"和"同种子两次逐字节相同"（gen-waterfoot、gen-worldgen）。
6. **种子键登记（A27-8.1）—— 过**：seed-keys.json 新增五行，流 gen_water、gen_siteform，抽取点 site_gen_water_seed、area、width 和 site_gen_bldfill_area、storeys 都是字面量调用，与卷十 §4.12.1 :887–:888 对应。
7. **S5-10 —— 过**：footprint.mjs、water-bed.mjs 和 gen/ 下的新文件 grep 不到 `Math.`（只有注释里出现）。
8. **不把全世界区格装进单个 Map/Set —— 过（附建议 S3）**
   - 父足迹取种子用 footprintCells 生成器惰性遍历（footprint.mjs:364–388），probe.has 不物化列表。
   - 河床用列式的 Int32Array、BigInt64Array，没建 Map。
   - waterfoot.mjs:65 的 `boundaryKeys` 大小等于作者 boundary 的输入量，不是世界面积，可以接受。
9. **门禁 pre_commit 的三项 items fail**（vol12 A12-4.5、S12-2、S12-3）是基线既有的，按卡文不计。

## 三、测试覆盖（按卷文情况对照；没拿到卡文原文）

| 情况 | 用例 | 判 |
|---|---|---|
| 手写优先、逐维度补、作者覆盖 | gen-waterfoot "手写优先"、gen-siteform "手写优先"、gen-worldgen R10-7.12 | 有 |
| 静水团块：种子按字典序、目标面积 | gen-waterfoot 第一条 | 有 |
| 流水窄带：中心线、表序前缀连通、r 的搜索 | gen-waterband 全部、gen-waterfoot 第三条 | 有 |
| 支流汇入、不占主河格 | gen-waterfoot 第四条、water-bed-footprint "汇入格起" | 有 |
| 跨父、占用 | gen-waterfoot "跨父"、gen-waterband "报错" | 有 |
| 投影 floor/cap、作者冲突、成环 | gen-order A–I6 | 有 |
| 河床：前缀最小、河进湖、汇入格以上不削平、bedOff | water-bed 1–13、water-bed-footprint | 有 |
| 建筑补缺、加倍展开、作者 planCells 不加倍 | gen-siteform | 有 |
| **种子候选数为 0 报 E-GEN-WATER-FOOTPRINT no_candidate**（waterfoot.mjs:141） | 无 | **缺** |
| **planCells 越上限报 E-GEN-ROW-INVALID**（卷十 :688 的终止条件） | 无 | **缺** |
| **entranceNotAdjacent、floorOverOpenRoom 走哪条路**（M1） | 无 | **缺** |
| `boundary: []` 的处理（回报六节自述） | 无 | 缺（并入 S2） |

回报自查表第 3 行写了"候选数 0 … 都试过"，可仓库里没有对应用例，这一句证据不实。

## 四、条目

### 必须改
- **M1** siteform.mjs:98–99：提前停只许留给可证明与面积无关的原因（entranceNotAdjacent，写"已定"和证明）。floorOverOpenRoom 恢复照卷文加倍，或先证明与面积无关；内存问题按第一节 ⑤(a) 在 blueprint.mjs 加不铺格的可行性预判来解决。如果照卷文到上限仍装不下，就停下报李白出 R10-7.12 勘误，不许代码先行。siteform.mjs:8、:98 的注释和回报第七节第 5 条要同步改。
- **M2** water-bed.mjs:33–47：汇入格改成先判四邻相接，O(|D|·log|X|)；不相接才走退路，并写明代价。补一条"大 X 汇入长 D 与暴力解同"的用例。
- **M3** 补测试：no_candidate（waterfoot.mjs:141）；planCells 越上限报 E-GEN-ROW-INVALID；entranceNotAdjacent 的走向（M1 定下的那条路）。同时把回报自查表第 3 行改成如实的写法。
- **M4** docs/问题.md 登记未落项，每项写明归哪张卡。按 AGENTS.md"未解决的问题写进 docs/问题.md"，现在只写在回报里不够。要登记的有：
  - whenRX 读父行维度、形制数值字段、intendedType 的入口（卷二 RX 命名空间）；`known(form)` 是过渡写法；
  - 房间行补建等卷十九建行函数；
  - storeysMax（见 M5）；
  - `boundary: []`；
  - 性能测量点 (a)(b)(c)；
  - 父足迹在骨架阶段建成后要重核。
- **M5** siteform.mjs:75–82：用域上限夹过层数的行，在 deferred 里记缺口（例如 `storeys_max_unchecked`），并在测试里断言这条缺口在。等卷十九的 storeyCurve 和 buildPlan 落地后，在同一处换成真上限、删掉这条缺口。

### 建议
- **S1** waterfoot.mjs:21、:65–85：`boundaryKeys`、`taken` 的键只有 "x,y"，不分格空间（w / 层根）。有多个格空间时，不同空间的格会互相误判占用。建议键里带上格空间，或者只收与本行同一格空间的行。
- **S2** waterfoot.mjs:24、:93：作者写 `boundary: []` 时，本阶段按"没写"去补，写回器却按"作者已写"报 E-GEN-OVERRIDE-AUTHORED。结果是先补后拒，自相矛盾，虽然会报错、不会静默吞掉。建议二选一并测：加载期拒收空的 boundary，或者在本阶段就直接报码说明。
- **S3** water-bed.mjs:66–81 与 footprint.mjs:461–481：没表序的行（湖、海）的 bed(c) 就是 min(h₀(c), cap)，可以按格现算，不必为整片海存 h0、bed 两个 BigInt64Array 加 xs/ys（数百万区格时要上百 MB）。只存 cap 和 out 即可。
- **S4** siteform.mjs:108–117：每栋建筑都扫一遍全部行、回溯父链，代价 O(B·N)。建议先按建筑祖先给房间行分一次组。
- **S5** waterfoot.mjs:146：每条缺种子、父行是世界根的水体行，都要把约 4,020 万区格遍历一遍。建议按列计数后跳列，或者等云上实测后再定。
- **S6** order.mjs:131：作者次序链里不存在的 id 被静默滤掉，相邻两项跨着空位连成一条约束。建议确认加载期已经拒收不存在的引用；没有的话应该报错，而不是滤掉。
- **S7** docs/PLAN.md 本节第 2–7 步没标完成。
- **S8** waterfoot.mjs:106：已齐的行把作者写的 coord 放进 `taken`、跨父也扣，比卷文的"同父兄弟"宽。建议注释里写成"已定"并说明理由。
- **S9** 确认加载期拒收"有 waterKind 而没挂 comp_waterbody"的行，这样 footprint.mjs:456、:517 的口径才与卷五"挂 comp_waterbody"严格等价。

### 过
一④、一⑥、二.1、二.5–9；一①（附 S9）；一③（附 S1、S8）。

## 五、总判与须报李白项

**总判：不过，改后再核。** 必须改 5 条（M1–M5）。其中 M1 和 M2 是语义与规模问题，改完后要由 Opus 再核一次（内核、跨卷）。M3–M5 改完可由 Sonnet 复核。

**须报李白：**
1. siteform 加倍：照卷文跑到 4096 上限，如果实测装不下（M1 的 (b) 情形），需要出卷十 R10-7.12 勘误来定终止口径，代码不能先行。如果按 M1 的 (a) 做（不铺格的可行性预判），语义和卷文完全一致，就不必报。
2. RX 读父行维度和形制条目数值字段的入口：卷十 §2.3 :166、:186 写了要读，但卷二 RX 命名空间还没有这个读入口，属于跨卷缺口，要不要出卷二勘误、什么时候出，需要李白排期。

---

## 第二轮（末轮）复核（Opus 5.5 中档，11-22；`git diff 216fd051c..fc2970ab3`，9 个文件，+270/−32）

本机跑了受影响的 5 个测试文件（`node --test tests/kernel/{gen-siteform,water-bed,gen-waterfoot,gen-worldgen,blueprint}.test.mjs`），tests 66 / pass 66 / fail 0。全量没有重跑。

### 五条是否真解决
- **M1 已解决。** siteform.mjs:98–104 改回卷文写法：可行性预判 `ok` 为假一律加倍，终止靠 planCellsOf 越 4096 上限（卷十 :688）。只有 entranceNotAdjacent 提前报错，注释写了"已定"和理由（只读 storeyBase 与 storeys，加倍到上限的结局相同）。floorOverOpenRoom 恢复加倍，测试 "终止靠卷十 :688 的上限" 守着。卷文语义没再改，第一轮的须报李白第 1 条撤销。
- **M2 已解决。** water-bed.mjs 新增 `packedOf`：把 X 的格排成有序键、二分查找，先按 D 的表序查四邻，代价 O(|D| log|X|)。一格都不相接时才退回逐格求距离，注释写明了这种情形只在作者手画时出现。用例 14（200×200 的湖汇入 300 格的河）和用例 15（不相接走退路）都与暴力解逐格相同。
- **M3 已解决。** 新增了 no_candidate（gen-waterfoot）、越上限报 E-GEN-ROW-INVALID 和 entranceNotAdjacent 提前报错（gen-siteform）三条用例，期望值都是按卷文推出来的。
- **M4 已解决。** docs/问题.md 新节登了七条遗留，每条都写明归哪张卡，卷二的 RX 读入口一条注明要报李白。
- **M5 已解决。** siteform.mjs:82–83 对用域上限夹过层数的行记 `storeys_max_unchecked` 缺口，并有测试断言：只有补了层数的行才记。

### planFeasible 与 planBlueprint 是否共用同一套判定：部分共用，等价有论证、有测试守着，记为建议
- **共用的部分：** 房间行的分法抽成了 `roomRowsOf`（blueprint.mjs），build 和 feasibleOf 两边都调它，所以"房间分不下"只有一处定义。
- **仍是两份的部分：** planTooSmall、entranceNotAdjacent、floorOverOpenRoom 三处判定，build 里留着原来的写法，feasibleOf 里另写了一份。floorOverOpenRoom 在 feasibleOf 里按"楼梯列 / 普通列"两类合并来判。我逐项对过 build 的格种类：隔墙行与行上的门都不算室内，楼梯格仍挂着所在房间的序号，没有房间的层房间序号为空。合并成立，两边等价。
- **196 组对照测试的覆盖面：** 覆盖了全部四种不可行原因和可行的情形，其中"放不下"就是 F3R 三房间形制在 3×3 到 7×5 这几种尺寸上，平面太小出现在 3×3。
- **漂移风险：** 两份实现今后有人只改一边就会不一致，目前只靠这组测试拦。
- **S10（建议）：** 让 build 开头先调 feasibleOf，删掉 build 里重复的三处判定，判定只剩一处。改动小，不引入新设计。可以并进下一张 blueprint 卡，也可以由主会话合并前顺手做。
- **S11（建议）：** siteform.mjs:102 预判可行后调 planBlueprint，没有核 `bp.ok`。万一两边将来漂移，:124 的 `bp.rooms` 会直接抛 TypeError，不会静默放过，但报的不是规范的错误码。建议补一行：`bp.ok` 为假即抛 E-GEN-ROW-INVALID，注明这是内部不变量被破坏。

### 加倍到 4096 时的内存与耗时（本机纯函数探针 F:/dnd-tmp/opus-bp-probe.mjs，不推进世界，不入库）
| 情形 | 结果 |
|---|---|
| 不可行形制（楼面压在开敞房间上）用 planFeasible 加倍，从 16 m² 到越上限 | 21 步，0.9 ms，进程常驻内存 96 MB，结局 E-DET-DOMAIN，再转成 E-GEN-ROW-INVALID |
| planBlueprint 真铺 512×512、单层 | 26 万格，140 ms，常驻内存 +144 MB |
| 真铺 1024×1024 | 105 万格，624 ms，+497 MB |
| 真铺 2048×2048 | 419 万格，2.6 s，+1.7 GB |
| 真铺 4096×4096 | **堆内存耗尽，进程崩溃**（默认堆约 4 GB；按约 430 字节/格推算，单层要 7 GB 以上） |

判定：
- **补缺路径本身：** 不可行的形制加倍到上限，在预判下只要毫秒、不占内存，补缺的路径已经安全。
- **剩余风险不在本卡：** planBlueprint 每格一个对象的表示，在卷十九 §2.1 允许的取值域上限（planCellsMax 4096）处装不下。凡是展开到 2048 以上平面的建筑都会碰到，作者手写的 planCells 也一样，与本卡无关。会触发它的，是可行性只能靠巨大进深来满足的形制（例如某个房间的 share 极小），以及作者直接写的大平面。
- **须报李白（新增第 3 条）：** 卷十九 planCellsMax 4096 与蓝图逐格对象的表示不相容，本机单层 4096² 内存耗尽。要裁的是：下调这个取值域上限（卷十九勘误），还是由卷十九的蓝图卡改成列式或按需的表示。问题要登进问题.md，归卷十九蓝图卡。本卡不改。

### 新问题
- 只有 S10、S11 两条建议，没有新的必须改。
- 门禁与命令纪律：本轮 diff 没有新增 `Math.*` 用法（测试里的暴力解对照函数除外，测试不在 S5-10 范围内）。

### 第二轮总判
**过。** M1–M5 全部解决。S10、S11 两条建议可以由主会话在合并前读 diff 时顺手做，也可以并进卷十九蓝图卡。须报李白现为两条：第一轮的第 2 条（卷二 RX 读入口），加本轮新增的第 3 条（4096 上限与蓝图逐格表示不相容）。第一轮的第 1 条已撤销。
