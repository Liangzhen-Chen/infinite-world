# 前置卡 B《卷十 R10-7.11 建筑落位》内核接口 Opus 终核（第 1 轮）

复核：Claude Opus 5.5 中档。对象：分支 ds/layout-fill，写者提交 5dfe0eb48（基 29cbd904a），写者回报 docs/卡回报/layout-fill.md。
本机已跑：`node --test tests/kernel/gen-siteform.test.mjs tests/kernel/gen-layout-fill.test.mjs tests/kernel/place.test.mjs` → tests 78 pass 78 fail 0；`node tools/accept/run.mjs pre_commit`（不带 --write）→ verdict pass，仅 vol12 三项基线（A12-4.5、S12-2、S12-3）。未跑全量、未跑转换脚本。
命令纪律自报：跑上面那条 node --test 时误带了一次 `cd` 和 `| tail`（只读，不影响结果），之后未再用。

结论：**必须改 4 条，建议 1 条，须李白 1 条（并入已有遗留）**。改完须再核一轮。

## 1. probe.surfaceStoreyAt（place.mjs:867–882）——必须改（M1）

- 卷五 §4.3 规则 8（:658–:668）：地表层号 = `floor(h ÷ storeyM)`，`h` 在水体足迹的区格里已减去河床修正 `δ(c) = h₀(c) − bed(c)`（:668"该区格内每一列的 h 都减去同一个修正量"）；"一切非水体区格不受影响"。卷十 R10-7.11 第 5 点（:698）："`z` 取该格所在列此刻的地表层号（卷五 §4.3 规则 8）"——就是 gridView 给的那个数（place.mjs:648、:654 带 `regionBedDelta`）。
- 写者的 probe 不含 δ，siteform 调足迹时又传 `bed: false`（siteform.mjs 试排循环 `ctx.footprints({ bed: false, heights: false, extra })`，`bed: false` 使 plan.bedOff，place-plan.mjs:124，δ 恒 0）。两处叠加，水体区格里的 z 一律按 h₀ 算。
- 会不会落错层：锚点列所在区格不是水体足迹（只是"临河"）时 δ = 0，结果与 gridView 相同，不错；锚点列落在水体足迹区格里时 z 偏高（建筑悬在河床之上）。这种情形不是假想：站点足迹 S 取 `probe.cells(siteId)`，含后代行的区格（footprint.mjs:136–139 `inFootprint` 沿父链认），站点下的池塘、河段子行的区格都在 S 里；卷十 R10-7.11 与卷五都没有"建筑不落水体足迹"这一句（码头、水磨本就压水），写者注释"建筑不落在水体足迹里"无出处。
- 第二份读法：是。"所属最深足迹 → terrain 条目 → nearControlPoints → columnSurface"这条链 gridView（:639–:654）写了一遍，probe 又抄一遍且少了 δ，正是"跨卷共用定义只一处"要防的分叉。
- 改法：在 place.mjs 抽一个"某格空间某细格列的地表 {h, z}"的内部函数（含 `regionBedDelta`，δ 为 null 即未知），gridView 细格分支与 probe.surfaceStoreyAt 都调它，不再各写一份；siteform 试排调 `ctx.footprints` 不传 `bed: false`（默认 true；`heights: false` 是否影响控制面与 δ 须写者实测确认）；删掉"建筑不落在水体足迹里"一句。加一条测试：同一夹具里一个水体子行区格、一个非水体区格，`probe.surfaceStoreyAt` 与 `gridView({cells})` 读出的地表层号逐列相等（前提在测试里造，不抄基线数）。前提是 M2 先改，水体阶段在站点面积阶段之前定下 downstream（河床依赖它）。

## 2. worldgen.mjs footprints 闭包的 extra 与 latitudeDegOf——过

- `o.extra` 只叠进本次 planFootprints 调用的 proposals 副本，不写 `generated`，不改 rows；叠的只是自动定面积站点的试写 `targetAreaM2 = N × A`，而最后写回的正是循环停时的同一组值（siteform.mjs 写回处取 `finalN`），所以试排划分与最终划分一致（A10-7.2"锚点在试排与物化时逐格相同"的前提成立）。每轮重划包括已排下的站点（`active = kept` 全部重排），兄弟站点长大挤掉别人时会重新发现，处理对。没有越界。
- `latitudeDegOf` 是 placeLatitude（place.mjs:1277，卷二十 §2.7 的唯一读法）的薄包装，只喂 coord，不另造纬度式。过。

## 3. gstage_siteform 的 after——卷文不漏，写者方向对但漏一项：必须改（M2）

- 卷十 §4.1.1 阶段表（:341–:354）：siteform after economy；economy after people（:353）→ people after sites（:351）→ sites after cultures（:350）→ cultures after stocks（:349）→ stocks after geology、weather（:348）→ geology after water（:347）→ water after fields、order（:345）。所以卷十的次序**本来就传递地**把站点面积阶段排在自然量、次序投影、水体阶段之后。卷文没有漏写，**不需要勘误**。
- 写者的改法是：中间阶段（economy…geology）还没建，只把传递前驱里已建的直接写进 after。这与本条 basis 原有"economy 暂不写、它自己的卡登记时加"的做法同类，可以接受，不是改错地方。
- 但传递前驱里已建的还有 `gstage_water`（_vocab.json:659），写者漏了。现状两者都只 after fields、order，stages.mjs:71 按代号序取就绪者，`gstage_siteform` < `gstage_water`，于是站点面积阶段先跑、水体阶段后跑——与卷十次序相反；水体阶段补 `downstream`（water.mjs:87），河床依赖它，M1 带 δ 后 z 也依赖它。
- 改法：after 改为 `["gstage_fields", "gstage_order", "gstage_water"]`；basis 改写为"卷十 :354 after gstage_economy；economy 至 water 的中间阶段未建，按卷十 :345–:354 的传递次序先写已建的前驱 fields、order、water，economy 的卡登记时 after 换成 gstage_economy"，删掉回报里"须勘误"的说法。改后核 gen-worldgen 等断言阶段次序的测试仍过（若有断言 siteform 先于 water 的，是测错了现状，停下报主会话）。

## 4. layoutGapCells 与 seed-keys 新行

- layoutGapCells = 2：卷十 :183 原句给了值与"暂定·待试玩标定：2"及推算依据，worldgen.json 的 source、basis 照抄了出处与暂定标记，grade 同 layoutCoverage 先例。**过**。
- seed-keys 新行 site_gen_layout_anchor：**不合口径，必须改（M3）**。seed-keys 表是抽取点登记（drawByKey 的键来源，seed_sites 门禁按它核），落位不抽取（R10-7.11 首句 :693、末句 :700"没有重掷"），登一个永不抽取的点是虚登。卷十 R10-9.2（:771）：来源标记只供追溯，不是规则输入；"不来自抽取，`seedKey` 为空"（R10-12.7 先例）；代码里 order.mjs:140 投影提案即 `seedKey: ''`，已能写回、加载。改法：删 seed-keys.json 这一行，落位出的 anchor、facing 提案 seedKey 写 `''`，测试相应断言改成 `''`（这是按卷文改期望，不是放宽）。站点 targetAreaM2 借 site_gen_bldfill_area 键是本卡之前就有的写法，不在本卡范围，不动。

## 5. 父行不是存量单元时 N 加一的上界——须记问题.md（M4），并入李白已有遗留

- R10-7.5（:680）："至多加到所在存量单元足迹的区格数，仍排不下即 E-GEN-ROW-INVALID"。父行不是存量单元时卷文推不出"所在存量单元"，与 docs/问题.md"G5b 机制遗留"第 2 条同一个缺口（那条管起始 N 的判，这里管加一的上界）。写者取父行足迹格数只作循环终止界、不当新规则，作为临时做法可以；但它不是卷文，**必须在遗留第 2 条后追加一句**：加一重排的上界在父行非存量单元时暂取父行足迹区格数，只为循环必止，待李白裁"所在存量单元"取法（第 2 条选项 ① 沿 parent 向上第一个存量单元，一并定这两处）。
- 建议（S1，不挡合入）：父行是郡、世界根时上界可达 10⁵–10⁷，若父足迹已无格可分（|S| < N），后续每次加一都是整世界重划却不可能变好。R10-7.11 第 1 点（:694）括号已说 |S| < N 即"所在存量单元无格可取"，此时直接按到顶报 E-GEN-ROW-INVALID 与卷文结局相同、只省循环；可在改轮顺手做并加一条用例，也可记待办。

## 6. 红线

- 特判：siteform.mjs、place.mjs、worldgen.mjs 新增代码无 id、名称、文件名分支（Grep `loc_`、`bldform_` 只在测试夹具里）；站点按结构认（区域足迹、非政区、非存量单元、非水体、作者行）。过。
- 规则层无 Math.*：siteform.mjs 只有头注释一处字样；place.mjs 新增段无 Math.*。过。
- 测试期望手算：抽核 4 条，全对——①"三栋 6×6、8×4、6×6"：外包 {−5,0,0,5}、{0,−3,7,0}，锚点 (7,2)、(10,5)、(25,2) 按行架与锚点 = (x0 − dx0, y0 − dy0) 复算一致；②"97×4 排不下 N 加一"：N = 1 时须 2 ≤ x0 ≤ 1 无解，N = 2 时锚点 (2,5)；③"197×4 上限"：N = 2 时 2 + 196 + 2 = 200 > 199，N = 3 排下，tract 2 时报 need 2、max 2；④真内核用例：占地 288 → N = 1，12×12 朝向 4 锚点 (213,2)，层号 floor([45.06, 46.94] ÷ 3) = 15。均不读仓库现读数。
- convert-geo-g5b.mjs：只改错误分组键（带维度名）与加一行按事由计数的日志，转换与写盘逻辑未动。小毛病：:433 日志语句与 `const generated = …` 挤在同一行，改轮顺手分行。过。

## 必须改清单（改完再核一轮）

- M1 probe 地表层号与 gridView 合成同一个函数并带河床修正，siteform 试排不再传 `bed: false`，删无出处注释，加 probe 与 gridView 逐列相等的测试（含水体区格）。
- M2 gstage_siteform.after 补 `gstage_water`，basis 改为"卷十传递次序里已建的前驱"，不走勘误。
- M3 删 seed-keys 的 site_gen_layout_anchor，落位提案 seedKey 写空（R10-9.2、R10-12.7、order.mjs 先例）。
- M4 docs/问题.md"G5b 机制遗留"第 2 条追加加一上界的临时取法，待李白。

## 须李白

- 1 条：父行不是存量单元的站点，"所在存量单元"怎么取（并入遗留第 2 条，同时管起始 N 判与加一上界）。

---

# 第二轮（最后一轮）

复核：Claude Opus 5.5 中档。对象：`git diff 7e1483d94 247967f3e`，含写者修改轮 c64375813（M1–M4 与李白 b41e0801 第⑩条、卷十勘误 1123k45）、主会话补的快照 6ce6106b4、写者追加 247967f3e（李白 da3cd65a 选甲）。只核这几件，不加新要求。
本机已跑：`node --test tests/kernel/gen-siteform.test.mjs tests/kernel/gen-layout-fill.test.mjs tests/kernel/grid-view.test.mjs tests/kernel/place.test.mjs` → tests 95 pass 95 fail 0。未跑全量、未跑转换脚本。本轮没有用 cd、管道、重定向。

结论：**有 1 条必须改（卷十 R10-7.5 正文一句没跟上甲）**。只是文档改一句、不改代码，改完由主会话亲读 diff 后合入，不必再请第三轮。

## 1. M1–M4 落实

- **M1 过。** place.mjs 新函数 `bedCorrectedColumn`（:201–:207）是 columnSurface 减 δ 的唯一一处：gridView 细格分支（:660）改调它，原来两行内联算法删了；probe.surfaceStoreyAt（:878–:889）也调它，δ 取同一个 `regionBedDelta`。两处只剩各自取 entry、控制点、δ 的上下文，减修正、算层号只在一处，没有第二份读法。siteform 试排去掉了 `bed: false`（siteform.mjs 试排循环只传 `heights: false, extra`）。"建筑不落在水体足迹里"一句已删。
- **逐列相等测试确实含水体列。** grid-view.test.mjs 新用例：`loc_b` 是静水，上游流水 `loc_a` 的出口为 0，所以 `loc_b` 的 δ = 30 − 0 = 30。比对的四列是 loc_b (150,150)、loc_b (130,170)、loc_a (50,150)、层根 (150,50)，都是 probe 读数与 gridView 最高实心层相等。另外断言了 loc_b 中心列层号为字面量 0（不修正时是 floor(30 ÷ 3) = 10），所以如果修正没生效，这条测试会失败，不是两边一起错也能过的假相等。gridView 在水体列地表以上返回未知、不算实心，取最高实心层就是地表层，这样比对是对的。
- **M2 过。** after 已是 `["gstage_fields", "gstage_order", "gstage_water"]`，basis 按卷十 :345–:354 的传递次序写，回报里已不说要勘误。
- **M3 过。** seed-keys 行已删，`seedKeyOf = () => ''`，测试断言改成 `''`，引的是 R10-9.2。
- **M4 过。** 问题.md 遗留第 2 条已改成"已裁"，引 b41e0801 第⑩条和 da3cd65a 甲。

## 2. ⑩与临时退路

- **取法与勘误句一致。** `tractOf` 沿 `parent` 往上找第一个带 `roleTract` 组件类的祖先，用 seen 集合防成环，按组件类认、不看 id。这和勘误记录 :1408 的"沿 `parent` 往上第一个挂存量单元组件类的祖先行"一致。起始 N 判和加一上界都用它：判在 siteform.mjs :265–:277，上界用 `capId = tractOf(site) ?? site.parent`。
- **"临时、存量单元卡补后撤"三处是否都写了：代码注释写了（siteform.mjs :266–:267 与 :282 行尾），勘误记录 :1408 写了，问题.md 第 2 条写了。但卷十 R10-7.5 正文 :680 那个括号仍是修改轮的旧句**："一路往上都没有时本条不判，生成器记缺口 `tract_not_found`、该站点不排位"。这和甲（照常排位、上界退回父行）以及现在的代码相反；代码里已经没有 `tract_not_found`。**必须改（R2-M1）**：把 :680 括号的后半句改成和 :1408 同义的一句，即"一路往上都没有时起始 N 不判，N 加一的上界临时退回父行足迹的区格数，照常排位（李白 11-23 da3cd65a 甲；存量单元卡补上后撤）"。这算同号续改，不另编号，快照不必重存（:1408 已说明同号续改）。
- **两条新测试的期望值都是手算或写成字面量。** gen-siteform 用例沿用第一轮已核的 197×4 推算：要 N = 3 才排得下。祖父 3 格时排下，2 格时报错（need 2、max 2）；无存量单元、父行 3 格或 2 格时结果同样，上界来自夹具给的父行格数，是字面量。gen-layout-fill 用例：站点改挂层根，期望 (213, 2)、层 15，和第一轮已核的手算相同，按卷文这种情形结果本就不该变。两条都不读仓库当前计数。
- **全规模不进测试够不够：够。** 机制用同口径夹具（真划分、无存量单元的祖先链）守住了；按项目规矩，推进世界的全规模跑归腾讯云块验收。写者说转换实测后 anchor、facing 各剩 328 缺值，正好是缺 form 的 328 栋（R10-7.12 1123k31 规定不补），口径对得上。这个数我本轮没有复跑，块验收时在腾讯云全量跑一次核实。

## 3. 1123k45 勘误流程与快照

- 快照 `版本快照/卷十-v3-勘误前-1123k45.md` 用 `git hash-object` 算出 aeb68257e5aa…，和 7e1483d94 上卷十的 blob 完全相同，确是改前原样。勘误记录写了依据（李白事件号）、不升版本号、快照文件名、改稿模型，并写明历史修订不回改。流程过。唯一问题是上面 R2-M1 那句正文没跟上同号续改。

## 4. 能否合入

- 改完 R2-M1（卷十 :680 一句）后可以合入：主会话亲读这一句的 diff，跑一次 pre_commit 就够。代码、测试、门禁这一侧本轮没有新问题。第一轮建议 S1（|S| < N 时提前止），写者没做，不挡合入，记待办即可。
