# 卷十勘误 1121k16–k19 写码回报（水体足迹补缺与河道窄带、下游不上坡投影与河床、手写建筑行补缺）

写者：Claude Sonnet 5.5 中档包卡；机械部分委派 DeepSeek flash 四张测试卡（卡文 F:/dnd-tmp/card-gec-ds-1.md 至 -4.md，逐行审过，见第四节）。分支 ds/gen-errata-code，基于 master a9fd6df19，已合入 origin/master 2b0800bb8（G8）后 criteria 取 master 版重登。只核由主会话另派 Opus（内核、跨卷）。

## 自查表（派活卡头第三节）

| # | 问题 | 是/否 | 证据 |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 卷十 R10-1.7 :380、R10-2.12 :433（含求值次序）、R10-2.17 :434–:438、R10-2.18 :439–:445、R10-7.12 :684–:689、A10-2.2 :469、A10-2.4 :471；卷五 §4.1 规则 10 :491、§4.3 规则 8 河床 :656–:664、规则 13 :497；卷二 1121k19 E-GRID-WATER-BAND；各源文件头注释逐条写了出处，卷文推不出之处写"已定"或"未落" |
| 2 | 没有按 id/名字/场景写特例 | 是 | 水体只按词表 `water` 条目 `flowing`（经 `flowingOfIndex` 读词表）分静水团块与流水窄带；建筑补缺按行的组件类句柄 `rules.gen.roleFacility` 与形制条目；规则行按 `whenRX` 选；`grep` 生成代码与规则表无任何行 id；河床只按 `waterKind` 是否写了与 `flowing/boundary` 判有无表序 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | r=0（中心线即窄带，目标不足也取 0）、下游空（中心线只有种子）、候选数 0（E-GEN-WATER-FOOTPRINT no_candidate；首轮无用例，修改轮补 gen-waterfoot "种子无候选"）、规则行全不适用或该用的列为空（E-GEN-ROW-INVALID）、`boundary: []` 视同没写但写回仍按作者已写报 E-GEN-OVERRIDE-AUTHORED（不静默覆盖）、作者次序约束成环/自环/固定值反了（E-GEN-ORDER-CONFLICT）、`planCells` 越 4096（首轮无用例，修改轮补 gen-siteform "终止靠上限"）或作者 planCells 展不开（E-GEN-ROW-INVALID）、层数区间为空；revise 没交 isAuthored、没有生成值可改都拒收（gen-fields.test.mjs "写回器 revise"） |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 纯函数用例期望是卷文 A10-2.4 手算数（投影 5/9/1→5/5/1 等、河床 10/10/9/9、窄带 13 格表序、建筑 6×6）；格世界用例 h₀ 与河床按"K=1 取最近控制点"手算成字面量（20/50/90/30 与 20…10），抽取值的期望在测试里用 `drawByKey` 按同一公式独立重算；不抄账本、基线计数 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 门禁新增的两处命中（siteform.mjs 的 `fixedUnits(2)` 字面量、place-plan.mjs 与 siteform.mjs 的 typeof 比较写法）是按卷文数据与既有写法改了代码形状（面积加倍写成 `fixedAdd(area, area)`、typeof 结果先取局部变量、族名常量照 place-building.mjs 先例放进冻结对象），没有改检测器、没有改名骗检查 |
| 6 | 只改了卡文列出的文件；diff 共 2426 行新增、196 行删除（合计 2622 行） | 是 | `git diff --cached --shortstat origin/master`（合入 G8 之后，只含本卡）：34 个文件，其中测试约 1400 行（12 个文件）、本回报与 PLAN 约 170 行、criteria 登记 96 行（登记器写）、规则与词表数据约 130 行；卡文点名的文件之外另改处见第六节"超出卡文列表的改动" |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → ℹ tests 1680 / ℹ pass 1680 / ℹ fail 0（合入 G8、criteria 重登、全部测试加齐之后，在最终提交上跑） |
| 8 | 让块 6 哪一步更近了，且没违背北极星 | 是 | G5b 真实世界上格前，河（沿下游链成窄带）、湖、海缺足迹输入时可由种子确定补齐并可手写覆盖，河床沿下游含经湖海不上坡，手写建筑缺面积层数墙厚也能补出并展开成细格；全部落在规则层与原语层，无写死与特例 |

## 一、改了哪些文件

新增代码：`server-plugin/kernel/gen/order.mjs`（投影与 `gstage_order`）、`gen/waterband.mjs`（中心线、窄带、r 搜索，纯函数）、`gen/waterfoot.mjs`（`gstage_waterfoot`）、`gen/siteform.mjs`（`gstage_siteform` 手写建筑补缺）、`gen/when.mjs`（规则行 `whenRX` 求值）、`kernel/water-bed.mjs`（河床纯函数）。

改动代码：`kernel/footprint.mjs`（E-GRID-WATER-BAND 前缀连通核对、河床接进 `cellHeight`、`regionBedDelta`、`footprintHas/footprintCells` 惰性遍历）、`place-plan.mjs`（行输入加 `downstream`、`flowing`，`flowingOfIndex`，`bed:false` 标记）、`place.mjs`（五处 `buildPlan` 交 `flowingOf`；`gridView` 列地表减同区格河床修正量 δ；`planFootprints` 加 `bed`、`heights` 选项与 `probe`）、`gen/fields.mjs`（删内嵌投影）、`gen/rows.mjs`（GenRow 加 `flowing`）、`gen/worldgen.mjs`（五阶段登记表、作者值判定 `isAuthored`、规则行与蓝图规则常数、`report.projections`）、`gen/writeback.mjs`（`revise` 提案）、`kernel/error-codes.mjs` 与 `files.json`。

数据：`world/ontology/dimensions/_vocab.json`（gstage 三个新条目、`gstage_fields.after`、`gstage_water.after`）、`world/rules/registry.json` 与 `tables/worldgen.json`（`waterFillRows`、`bldfillRows`、`roleFacility`）、`tables/seed-keys.json`（五行）、`tools/accept/criteria.json`（12 个类别 rev 加一，登记器写，取 master 版后重登）、`docs/问题.md`（收口条款）、`docs/PLAN.md`。

测试：新增 `gen-order`、`water-bed`、`gen-waterband`、`gen-siteform`（DeepSeek 写）、`gen-waterfoot`、`water-bed-footprint`（我写）；改既有 `gen-downhill`、`gen-fields`、`gen-water-grid`、`gen-worldgen`、`error-codes`（第六节逐条说明为什么改）。

## 二、各条卷文怎么落与测试名

- **R10-1.7 整类规则**：水体行（R10-2.17）、建筑行（R10-7.12）各走一个阶段，逐维度手写优先、缺的按种子（水体）或形制与种子（建筑）确定地补、补出的值写成 generated 偏离行或待转换提案（只含补出的维度，`by` 记阶段），作者之后手写同一维度世界重建时不再补。测试：gen-waterfoot "手写优先"、gen-siteform "手写优先"、gen-worldgen "R10-7.12 …接线"。
- **R10-2.12 求值次序**：`generateFill` 的水体阶段调 `planFootprints({bed:false})`，下游链按未修正 h₀ 派生，河床 `bed` 在 `footprint.mjs` 链定之后求、不回头改链；`plan.bedOff` 标记。测试：water-bed-footprint "bedOff"。
- **R10-2.17**：种子区格（父足迹按 (x, y) 惰性遍历、扣占用格、`site_gen_water_seed` 取第 floor(均匀[0, N)) 个）、静水目标面积（`site_gen_water_area`、`max(regionCellM², floor(父面积×份额))`）、流水窄带（中心线、带的取法、r 的搜索、半宽 `site_gen_water_width`）、跨父报 E-GEN-WATER-FOOTPRINT（事由 `cross_parent`）、被占报 `occupied`、无候选 `no_candidate`；处理次序下游先、同层 id 升序。测试：gen-waterband（A10-2.4 ③ 全部手算：13 格表序、r=0 四格、占用 7 格、r 的搜索 4/14/28）、gen-waterfoot（种子按字典序、手写不动、窄带含中心线、支流汇入不占主河格、跨父、无规则行、确定性）。
- **R10-2.18**：`projectOrder` 纯函数（lo/bound、floor/cap 日志、未知节点透传、固定值不动、环与固定值反了报 E-GEN-ORDER-CONFLICT）；`genOrder` 收集约束（作者写的 downstream、作者次序链且维度对）；`gstage_order`；写回器 `revise`；`report.projections` 与 `changed`，并经内核报告出口发 `W-GEN-DOWNHILL-PROJECTED`。测试：gen-order（A10-2.4 ① 全部手算）、gen-downhill（原有用例迁到投影阶段）、gen-fields "写回器 revise"、gen-worldgen "R10-2.6 高低次序"（真实世界日志）。
- **R10-2.18 ⑥ 与卷五规则 8 河床**：`createWaterBeds`（有表序的行前缀最小、汇入格起并入上游出口值；没有表序的行全片受上游出口值约束；任一 h₀ 未知则 bed 与下游未知）、`footprint.mjs` 取河床高进规则 13 代表地表高、`gridView` 区格内每列减同一 δ。测试：water-bed（A10-2.4 ② 全部手算 10/10/9/9、9/8、7/7、5/5、10/8/5/4 等）、water-bed-footprint（格世界逐格手算：主河 h₀ 为 20/20/20/20/50/50/90/90/90/30、bed 为 20/20/20/20/10 ×6，湖水底 10、没有支流时 20 ×10；汇入格之上不被削平；E-GRID-WATER-BAND）。
- **卷五规则 10 流水足迹**：`boundary` 非空的流水水体足迹只来自 `boundary`（原本就不走生长），新增表序前缀连通核对 E-GRID-WATER-BAND，静水与无 `boundary` 的流水行不受影响。测试：water-bed-footprint 第一条。
- **R10-7.12**：`genSiteForm`：墙厚取形制 `wallThicknessDefaultM`、面积按规则行抽、`planCellsOf`、层数夹进区间、`planBlueprint` 可展开否则面积加倍、作者 planCells 展不开报错；房间行缺口列入 deferred（`room_rows_unbuilt`）。测试：gen-siteform（A10-2.4 ⑤ 的 6×6、加倍 4→8→16→32→64 得 8×8、层数夹取等）、gen-worldgen 接线。
- **卷五规则 10 "河床求值次序"与 R10-1.14**：`planFootprints` 的 `bed`、`heights` 选项与 `probe`，见 water-bed-footprint "probe"。
- **门禁**：vol5.S5-10 仍 pass（footprint.mjs 未用 Math.*）；种子键五行登 seed-keys.json（字面量调用）；全世界区格不装进单个 Map/Set：种子取格用惰性遍历加按数计数，河床行内索引用排序的 Int32Array 与二分，不建 Map。

## 三、docs/问题.md 遗留收口

"E-GEN-ROW-INVALID 换 E-GEN-ORDER-CONFLICT"、"区格级插值河床不上坡"、"河宽与海域范围"、"writeback 对先行阶段已写维度与作者冲突分开判码"四项已在问题.md 第 12 条标收口。

## 四、委派与改正

DeepSeek flash 四张测试卡，一次过：gen-order（14 条）、water-bed（13 条）、gen-waterband（9 条）、gen-siteform（10 条）。我逐行审：期望值全与卡文手算数一致，没有改我给的期望、没有放宽断言；gen-waterband 那张的 DeepSeek 回报里自述一次第 8 组失败是它自己给了错误占用格、改输入后通过，未改期望，已核。DeepSeek 在仓库里留了 `docs/卡回报/ds-gen-errata-code.md`（四张卡写同一路径，仅剩最后一张），我用 `git clean` 清掉未入库，内容并入本节。没有 Opus 档委派。

我自己定稿的部分：全部算法（order、water-bed、waterband、waterfoot、siteform、footprint 接线、写回器 revise、worldgen 编排）与两个格世界集成测试（gen-waterfoot、water-bed-footprint）。

## 五、验收末行

- `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 1680 / ℹ pass 1680 / ℹ fail 0`
- `node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`；`items.fail` 为 3（vol12 的 A12-4.5、S12-2、S12-3 基线三项，不计），vol5.S5-10 不在失败列表中（static_code，pass）。提交钩子输出 `pre_commit pass`。

## 六、偏离与未落

**超出卡文列表的改动**（卡文点名了水体足迹补缺、投影、河床、建筑补缺所需的文件，下列是它们的必要接点，由主会话核对其他会话所有权）：`place.mjs`（`gridView`、`planFootprints`、`buildPlan` 调用接 `flowingOf`）、`place-plan.mjs`、`footprint.mjs`（G3 文件；G8 已合，合入时 place.mjs 三处冲突已逐条保留两边）、`error-codes.mjs`、`files.json`、`world/rules` 两个新规则键与占位行、`_vocab.json` 三个阶段条目。没有改 `grid.mjs`、`grid-base.mjs`。

**既有测试的改动（均因新卷文改变了被测行为，不是放宽）**：
1. `error-codes.test.mjs`：码数字面量 605→608、E 586→589（三个新码，依既有逐次加码的写法）。
2. `gen-downhill.test.mjs`、`gen-fields.test.mjs`：原来内嵌在自然量阶段里的投影按 R10-2.18 搬到 `gstage_order`，四条用例前提不变（同样的行、作者值与链），改为"自然量出生成值、再交 genOrder 投影"，作者冲突的码按卷文由 E-GEN-ROW-INVALID 换 E-GEN-ORDER-CONFLICT（问题.md 早已记下）；跨链冲突一条的断言增加了报错文本含两个作者值。
3. `gen-water-grid.test.mjs`：河（flowing 真）没写 `boundary`，现由水体足迹补缺阶段先补窄带，所以"来源记先写的阶段"的期望由 `gstage_fields` 改 `gstage_waterfoot`；手算注释补了 r 的搜索，面积 20000、汇水 40000、容量的手算数一个没变。
4. `gen-worldgen.test.mjs`：阶段由两个变五个（plan 断言改成依 after 的先后与每阶段各用自己的生成器）；真实世界水体阶段缺口按 `stage` 过滤（新增的水体足迹补缺也会为同一批水体行记 `footprint_unknown`，另加一条测它）。

**未落（卷文推不出或代码没有，不自编）**：
- `rules.gen.water.fill.rows` 与 `bldfill.rows` 的 `whenRX` 现在只能读本行维度：R10-2.17 的"父行维度"与 R10-7.12 的"所挂形制条目的数值字段"要卷二登记 rx 命名空间读入口；`intendedType` 还不是 place 表登记的维度（卷十九建行卡登记后再按意图类型分行）。所以占位行写 `waterKind == water_river/water_sea`、`known(form)`，出处写"生成规则"。
- `storeysMax` 取卷十九 `buildPlan` 按 form、materialKg、wallThicknessM 给出的上限：`buildPlan` 还没有，现取规则表 `rules.facility.blueprint.storeysMax` 顶替。
- 房间行的补建要卷十九的建行函数与房间位次登记（R10-7.8 ②）：只列缺口（deferred `room_rows_unbuilt`，格式 `<roomRole>#<序号>`），不造行。
- 作者写 `boundary: []` 视同没写，但写回器会按"作者已写该维度"报 E-GEN-OVERRIDE-AUTHORED，不静默覆盖；要补就删掉空数组。
- 下游行既无 `boundary` 也无 `coord`（作者没给、也不是本阶段补的）时目标格集为空，按"下游为空"处理，不编下游的位置（waterfoot.mjs 头注释）。
- 父足迹按补缺时已知的行算（缺 coord 的行尚不在计划里），骨架阶段登记后若骨架写变了父足迹要重核（骨架阶段条目 gstage_skeleton 未建，`gstage_waterfoot.after`、`gstage_fields.after` 里的它暂不写）。
- 补出的建筑 `materialKg`、面积是否满足意图功能需求量：卷文已写"未落"，不做。
- 性能基准：只写测量点，待腾讯云——(a) 世界根父足迹（约 4,020 万区格）上取种子的两遍惰性遍历（`probe.cells`，每个缺种子的水体行一遍）；(b) 全规模海（千万级区格）的 `createWaterBeds`（逐区格 h₀、行内索引排序、汇入格 O(|D|·|X|)）；(c) 长河经 `chooseBand` 的 r 搜索（每级重取带，半宽大时代价上升）。

## 七、须 Opus 核

1. `footprint.mjs` 河床接线：`cellHeight` 对水体行整行求 bed 再按排序索引取格，`bedOff` 标记，`regionBedDelta`；上游/下游关系只读行输入的 `downstream` 与 `waterKind`（"水体行" = 写了 `waterKind` 的区域足迹行，与 `waterAccessOf` 同口径）是否与卷五"挂 `comp_waterbody`"等价。
2. 汇入格 O(|D|·|X|) 暴力求距离，若海作上游且下游是长河，代价与规模；是否需要换更省的写法。
3. `waterfoot.mjs`：种子占用口径（同父兄弟种子取作者已写 coord 的行；全部行的 boundary 都算占用；先处理者的种子与窄带）与卷文"同父兄弟种子格、本阶段先处理的水体行已取的种子格与已写的窄带格"逐字对照；目标格集 `T_D`（D 有 boundary 取之、有本阶段窄带取之、否则取 D 的种子区格）。
4. `order.mjs`：投影与 A10-2.4 ① 的一一对应；`isAuthored` 判作者值与生成值的来源（`worldgen.mjs`）；`revise` 写回对 pending 行的检查放在 `generateFill` 里（`generatedDims`）。
5. `siteform.mjs`：（首轮收窄已于修改轮撤销，见第九节）现照卷文加倍、先过 `planFeasible` 预判；只 entranceNotAdjacent 提前报错；未落的 `storeysMax` 顶替已记缺口。
6. 三阶段新条目与 `after`：`gstage_siteform.after` 暂为空（`gstage_economy` 未建）；`gstage_waterfoot` 世界作用域与 `gstage_water` 的 tract 作用域并存是否与 R10-1.4 一致。

## 八、命令纪律自报（记过）

我本人违规：反复使用 `cd F:/dnd-wt/ds-gec; …`（该用 `git -C` 与绝对路径）、管道里用了 `cut -c`；误用一次 heredoc 写空文件 `F:/dnd-tmp/probe1.mjs`（空文件，未入库，无法删除，留待清理）、一次 `cat > /dev/null <<EOF` 和一次 `echo ok`。DeepSeek 卡文里原样写了纪律段，四张卡的回报未自报违规。

## 九、修改轮（Opus 只核 M1–M5，docs/审查/gen-errata-code-Opus只核-1122.md）

- **M1**：siteform 恢复照卷文"ok 为假就加倍"，终止靠 planCellsMax 上限；只有 entranceNotAdjacent 提前报错（写"已定"：只读 storeyBase、storeys，与面积无关）。内存问题落原语层：blueprint.mjs 新增 `planFeasible`（不铺格预判，O(层数×进深)，与 W×D 无关；room 行分法抽成 `roomRowsOf`，build 与预判共用一处），加倍循环先预判、可行才真铺。测试：gen-siteform 新增 `planFeasible` 与 `planBlueprint` 的 ok、reason 在 196 组（7 形制×4 层数×7 平面）上逐项相同；floorOverOpenRoom 恒不可行的形制加倍到上限报 E-GEN-ROW-INVALID（预判不铺格，无内存问题）。未遇需要报李白的"装不下"情形，不另报实测数。
- **M2**：water-bed.mjs 汇入格先按 D 表序查四邻是否在 X 里（X 排序打包键加二分），O(|D|log|X|)；仅一格都不相接（作者手画）才退回逐格求距离 O(|D|·|X|)，注释写明。测试 water-bed 用例 14（200×200 湖汇入 300 格 D，与暴力解同）、15（不相接退路，与暴力解同）。
- **M3**：补 no_candidate（gen-waterfoot）、越上限（gen-siteform）、entranceNotAdjacent 与 floorOverOpenRoom 的走向（gen-siteform）；自查表第 3 行已改如实写法。
- **M4**：docs/问题.md 新节"卷十勘误 1121k16–k19 写码遗留"七条，各写归哪张卡。
- **M5**：用域上限夹过层数的行记缺口 `storeys_max_unchecked`（deferred）；gen-siteform、gen-worldgen 断言该缺口在、作者写层数的行不记。
- 建议 S1/S2/S4/S5 等未改，S1、S2 已入问题.md。
