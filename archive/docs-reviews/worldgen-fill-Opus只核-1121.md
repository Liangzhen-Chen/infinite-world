# 卷十生成补缺（自然量与水体两阶段，G5b 前置）Opus 只核 · 11-21

核者：Claude Opus 5.5 中档（只核，不改代码）。对象：分支 ds/worldgen-fill 提交 6d16ddbd8，`git diff $(git merge-base HEAD origin/master)...HEAD`（33 个文件 +1964/−28）。写者：Claude Sonnet 5.5 中档（DeepSeek flash 写 gen-stages、draw-by-key 两个测试）。回报：docs/卡回报/worldgen-fill.md。
依据：docs/产品原则.md；CLAUDE.md；卷十 R10-1.1–1.7（:368–:374）、1.10–1.14（:377–:381）、R10-2.6（:421）、2.7（:422）、2.10（:425）、2.12（:427）、:389 西陲示例、A10-1.2（:396）、§2.4 :213、§4.12.1 :855–:866、R10-9.2（:745）、R10-12.1（:937）；卷五 §2.1 :98、:103、:144–:149、:236、:238；卷二 §1.3 :127–:128、:168、§1.10 :336（1121k1）；卷二十七 R27-8.1（:788）、R27-8.4（:791）、A27-8.1（:830）；李白 11-21 裁定①②。
本机复跑：`node --test tests/kernel/gen-fields.test.mjs tests/kernel/gen-water.test.mjs tests/kernel/gen-worldgen.test.mjs tests/kernel/gen-water-grid.test.mjs tests/kernel/gen-stages.test.mjs tests/kernel/draw-by-key.test.mjs tests/kernel/validate.test.mjs` → `ℹ tests 56`、`ℹ pass 56`、`ℹ fail 0`。全量与 pre_commit 用写者回报的结果（1522/1522；pre_commit 失败只有基线三项 vol12 A12-4.5、S12-2、S12-3，不计），本核没有重跑。

## 一、写者列的"须 Opus 核"七条

### ① 作者值作子树基准（fields.mjs:93–:106）——过（语义），必须补卷十勘误
- R10-2.6 :421 的式子是"值 = 钳（Σ 祖先链 dev）"，没写祖先有作者值时怎么算；R10-1.7 :374 只说"作者已有值的维度，生成器把它当输入读"。照字面不看作者值，垄渠郡 779 之下的地点会落在跟 779 无关的高度上，违背 R10-2.6 自己写的目的"相近的地方相似"。写者取的"作者值取代它之上各级偏差之和，之下各级照加"（rawSum 遇作者值即以作者值为和，:99）是两条合读唯一说得通的读法，代码不按 id 特判，测试 gen-fields :69、gen-worldgen :87 按公式手算。
- 但这是卷文没写的规则（卡头硬规矩 1）。**必须改（文档）**：合入前给卷十 R10-2.6 追加封卷后勘误，补一句"祖先链上某地点 a 的目标维度有作者值时，a 及其以上各级的和取该作者值，a 以下各级照加偏差；钳只对 p 自己的和做"，与下面 ②④ 一起报李白。

### ② 自然量的作用对象取区域足迹行；bld_* 24 行——过，建议两条
- fields.mjs:66–:69 读目标维度表头的必填写法：有 `byClass:` 就取挂该组件类的行，否则取区域足迹行。卷五 :103 写明 `anchorElevationM` 在"区域足迹、体积足迹"上必填 error，所以政区、站点、存量单元都缺它就过不了校验。卷十 :338 的条目写 `scope: tract`，:389 西陲示例写"自然量阶段只给缺 stratum 的存量单元补值"，但真实世界现在没有一条 comp_tract 行，照 tract 字面这个阶段什么都不做，李白裁定①（补控制海拔）就落不了。写者照表头取，是数据驱动、不写死的做法，可以接受。**建议**：把卷十 :338 scope 与 :389 跟卷五 :103 的矛盾列进同一张卷十勘误，请李白定"自然量阶段在手写骨架世界里管全部区域足迹行"。
- bld_*：rows.mjs:59 的足迹种类只按组件类和作者输入里的建筑清单判，不看 id 前缀，这是对的。这 24 行现在没有组件类，也不在 settlements.json 的 buildingIds 里，所以被当作区域足迹补了海拔。**不该按 `bld_` 前缀排除**，那样就是按 id 特判。代码跟 G5b 方案（按 buildingIds 挂设施组件类）不冲突，冲突在数据：这 24 行不在 buildingIds 里，G5b 照方案也分不出它们。**建议**：① 在 docs/问题.md 记"24 行 bld_* 没有建筑归类的数据出处，G5b 须先由作者数据补归类（进 buildingIds 或写 classes）"；② G5b 的次序写死在卡里："先分类挂组件，后调 generateFill"；本卡的冒烟结果（234 行）不落盘，分类后应少这 24 行。

### ③ 同 id 偏离行（flatten.mjs:113–:114、dimensions-validate.mjs:102–:106）——机制过，建议一条，必须改一条
- 这是卷二已有的机制，不是新造的：卷二 §1.3 :128"instanceRow(id) = 偏离行与实体行的合并（偏离行覆盖实体行）"，覆盖顺序总表 :168 也写着"generated 节偏离行 > 实体行有效值"。原来 flatten 整行替换、校验判重名，跟卷二不符；改成逐维合并是改正，不是放宽。
- validate.test.mjs :197–:199 原断言一字未动，仍然通过，但只是因为夹具的 `by: 'x'` 不是 gstage 条目。这条断言的含义已经从"同 id 即重名"变成了"来源标记无效的同 id 偏离行算重名"。放行条件挂在 by 合不合法上（dimensions-validate.mjs:104–:106），而 L1 只核 `generated` 三成员齐不齐（validate/rows.mjs:67），不核 `by` 是不是 gstage 条目。这不算绕过：by 无效照样报错。**建议**：L1 补"`generated.by` 须是 gstage 条目"（卷十 §2.4 :213 写的是 `by: ref vocab gstage`），id 唯一核对改为"generated 节与同表 rows 节同 id 即同一实体的偏离行"，不再看 by；:199 的测试由主会话按卷二 §1.3 改写（这是测试本身过时，按卡头硬规矩 6 交主会话定，写者不得自改）。
- **必须改**：李白裁定②说"手写可直接覆盖、不改代码"。可是按卷二 :168，generated 偏离行压过实体行。只要某个 generated 节落了盘（G5b 若把补缺写进 world/ 地点表），作者以后在 rows 里手写同一维度，生效的仍是旧的生成值，而且没有任何报错，裁定②就静默失效。加载时须核：同 id 的 generated 行与 rows 行写了同一维度（map 维按键）即报 E-GEN-OVERRIDE-AUTHORED（R10-1.7 :374 的码，"写回器之外"的同一事实；卷二 A8 :2439"生成偏离行与手写行同校验器"）。一处加载校验加一条测试，不按 id。

### ④ 高低次序投影（fields.mjs:113、:125–:149；geo-inputs.mjs:33）——必须改
1. **投影作用在每个 gfield 上**：:113 对全部场条目都调 projectDownhill，包括 runoffCoef。现在没出事，只是因为链上四点都不是水体行；一旦链上出现水体行，径流系数也会被按"河面高低"夹。次序是某一个维度上的次序，输入里须带它约束的维度（geo-inputs.mjs:33 现在只搬 chain），投影只作用于该维度。
2. **投影本身卷文没有**：数据卡 elevation-controls.json 的 `downhill.note` 写的是"供 G5b 或作者补数值后核对用（补出的值须满足次序，不满足即作者数据错）"，是一条核对，不是改值规则。投影用的是同阶段别的主体的产出（prev，:144），不合 R10-1.4 :371"不得依赖同一阶段里别的主体的产出"（换序不变仍成立，因为链序是数据，但条文的字面被破了）。反过来，只做核对又不重掷（R10-1.8），大多数种子会被拒，世界建不出来。两条路都要卷文定。**处理**：列进同一张卷十勘误报李白，二选一：（甲）R10-2.6 增"作者次序约束：生成值按链投影（夹进作者上下界、沿链不增）"作为规则，并写明它是 R10-1.4 的例外；（乙）次序进 `rules.gen.reject.rows` 当拒绝条件。裁定前，投影保留，但须先按第 1 点限定到单一维度。
3. 相邻等值（河神矶与雁渡同为 288.134 m）：数据卡写的是"不低于"，允许相等；链上是站点不是存量单元，不直接进 R10-2.12 的"严格低于"排水链。过；若李白选（甲），勘误里写明"允许相等"。

### ⑤ gfield 暂定值（_vocab.json:551–:579）——建议
- 卷文没有给数值，标"暂定·待试玩标定"并写了依据，形式上合规。数值本身有一个可算的问题：真实世界没有王国行（_vocab.json:674），叶子的方差 = 120² + 250² + 120² + 40² = 92900，标准差约 305 m，均值 300，大约 16% 的值会落到钳下限 0 m。这就是说内陆约六分之一的地方会是海平面高度，而且大量相等（0 = 0），会让排水链在 0 高度上断开。**建议**：把这个落钳比例写进 docs/问题.md，标"待试玩标定"；调参只改数据。本卡不必改。

### ⑥ 流、抽取点代号与 seed-keys（fields.mjs:20–:22、water.mjs:19–:20）——必须改
- 卷二十七 R27-8.1 :788："规则层与内核的每一个随机抽取点、每一个由种子派生 id 的点，都在登记表里有一行"，A27-8.1 :830 要求双向比对无差。本卡新增三处：`gen_fields`/`site_gen_fields_dev`、`gen_water`/`site_gen_water_depth`，以及 idslot 的派生（ids.mjs:37），一行都没有登记（world/rules/tables/seed-keys.json 只有 grid 六行）。比对检测器 tools/accept/detectors/seed_sites.mjs 只从已登记行学被调名，而且只认"前两个实参是字串字面量"的调用；本卡调用处传的是常量，所以门禁看不见，不是合规。**必须改**：在 seed-keys.json 登记这三行（file、stream、site、role、prefix、purpose），role 取卷二十七 seedrole 的骰值键角色；如果词表里没有这个角色，就写"等卷二十七勘误"并报。调用处按检测器能认出的写法传（可以对照已登记的 grid 行）。卷二十的天气抽取（weather.mjs:202）同样没有登记，是基线缺口，另记 docs/问题.md，不算本卡。
- 点改下划线：diceKeyOf 的 CODE_RE 不收点，卷十 §4.12.1 :860–:861 写的是带点的形式，卷二十有同样写法的先例。**建议**：在卷十勘误里统一写明"代号形式 = 点换下划线"，或把表里的代号直接改成实际形式。

### ⑦ comp_tract 的 requires、"水体行须挂 comp_tract"加载校验未做——建议
- 卷五 :236 写 comp_tract 的 requires 是 `terrain forestCover`，区域足迹另要 `coord`，登记与之一致。卷五 :238 的加载校验（挂 comp_waterbody 的行必须同挂 comp_tract，且 enclosed 为假）本卡登记了 comp_waterbody 却没做。**建议**：记进 docs/问题.md，列为 G5b 水体行进表之前的必做项；water-bodies.json 两行的 classes 届时要带 comp_tract。

## 二、未落项判定

### 河宽、海域范围——卷文推不出；须卷十勘误（可能连带卷五 §4.1 规则 10），要报李白
- 读法上，"河宽就是河道足迹的宽"、"海域范围就是海这块存量单元的足迹"是对的：卷五 §2.1 的水体字段（:144–:149）里没有宽度或范围维度，surfaceM2 由 areaM2 派生，本卡已经接上（water.mjs:76–:77）。缺的是**足迹本身的生成输入**：区域足迹由 `coord` 种子加 `targetAreaM2` 按卷五 §4.1 规则 10 划出，或由作者 `boundary`（:98，required never）覆盖。
- 卷十现文里，给子地点定 `coord` 与 `targetAreaM2` 的只有 R10-2.4，属于骨架阶段，而手写骨架世界的骨架阶段 `whenRX` 为假、不运行（R10-1.6 :373、:389）。R10-2.12 只给"已有足迹的存量单元"补字段，不造足迹。所以"手写世界里缺足迹输入的作者水体行，由谁、按什么分布补 coord 与 targetAreaM2"，现文推不出。
- 河还多一层：规则 10 从种子长出的是团块，长不出顺着 course 的窄带，河道形状要么靠作者画 boundary，要么要一条"沿河段栅格化成足迹"的新规则。这条规则跨卷五与卷十。
- 判定：写"未找到"是对的，没有编。**须报李白**：这是李白裁定①的一半，补法要新的卷文。可选的方向供裁：卷十加一条"作者水体行缺足迹输入时的补法"（targetAreaM2 取 `rules.gen.water.rows` 的面积分布，coord 取父足迹内的种子，同 R10-2.4 的写法），河道另加"沿 course 栅格化成 boundary"，由卷五给栅格化入口。

### water 族只有 water_navigable，河与海共用一条水深规则行——必须改（数据）
- worldgen.json 的 waterRows 唯一一行是三角分布 1.5–12 m，basis 自己写了"海的水深用它显然偏浅，是已知缺口"。明知不对的值顶上去，就是北极星禁止的简化版、假数据，标了暂定也不行。**必须改**，二选一，都只动数据：（甲）water 是开放族，加河、海两个条目，作者把 water-bodies.json 里海那行的 waterKind 改过去，规则表各加一行，海深标暂定并给海的量级依据；（乙）海这类没有合适的规则行，就进 deferred（water.mjs:71–:72 现成的 `water_rule_missing` 分支），不出提案。代码都不用改。

### generated.by 一行只一个——过，建议
- 卷十 §2.4 :213 定的是 `by: ref vocab gstage`，是单值；R10-9.2 :745 说标记"只供追溯与校验，不是规则的输入"。同一行被两个阶段补时记先写的阶段（writeback.mjs:52），不影响任何规则。**建议**：列进卷十勘误，请卷十定"多阶段补同一行时 by 记哪个"，或允许按维度分记。

### gstage_fields 的 after 暂空——过
- 卷十 :338 写的是 `after: ["gstage_skeleton"]`，但骨架条目还没建，现在写上会报 E-GEN-STAGE-UNKNOWN（stages.mjs:44）。自然量排在水体之前由 gstage_water.after 保证（_vocab.json:595），次序正确。basis 已写明骨架卡要补这一项。另有一处名字不一致：卷十条目的 generator 写 `worldgen/fields.mjs`，写回器写 `worldgen-writeback.mjs`（§2.5），代码用的是 `gen/fields.mjs`、`gen/writeback.mjs`。**建议**：要么照卷十改目录名，要么在勘误里改卷十的节点名，只定一处（state-owners 的写者登记以后会引用这个名字）。

## 三、再核

### drawByKey 照卷二 1121k1 的串形（sample.mjs:207–:219）——过
- 键 = sha256(diceKeyOf 五段)，handles/keys.mjs:198–:199 按 `worldSeed|streamCode|subject|worldTime|drawSiteCode` 拼接，跟卷二 :336 一致；`distribution` 不是键成分；只收五种分布；不读游标、不写状态；kernelApi 已登记（state-owners.json:158）。测试 draw-by-key 独立重算了键。

### 确定性——过
- 场条目按 slot 排序（fields.mjs:35），行按 id 排序（rows.mjs:42），提案按 id 排序（fields.mjs:122），pending 按 id 排序（worldgen.mjs:94），没有墙钟，没有 Math.random。A10-1.2 的三件事（两次相同、换序相同、换种子变）各有测试（gen-fields :87、gen-worldgen :68）。投影的问题见 ④。

### 全规模不把全世界区格装进单个 Map/Set——必须改
- 本卡的 Map 和 memo 都按地点行计，数量是千级，没问题。问题在 worldgen.mjs:76–:83：水体阶段每跑一次都调一次卷五 `planFootprints`，而 place.mjs:452 给**每一行**都物化 `regionCells: cellList(plan, id)`，footprint.mjs:333–:337 每格造一个 `{x, y}` 对象。根行的列表就是全世界约 4,020 万区格，省、郡、存量单元各级再各来一遍，加起来约 1.6 亿个对象，全规模下内存放不下。水体阶段只要 areaM2、elevationM 和相邻集。现在真实世界没有格空间表，这个问题潜伏着，G5b 一上格就会炸。
- **必须改**：本卡调用卷五入口时，不能触发全树的 regionCells 物化。最小改法是给 planFootprints 加一个不出 regionCells 的选项，或给卷五另开一个只返回派生量和相邻集的入口（这是接点扩展，按 AGENTS.md 已有授权，但要先跟主会话核对 place.mjs 当前归谁），再加一条测试，断言返回里没有格列表。耗时目标照写者说的放腾讯云测，不在本机跑。

### 其他——建议
- ids.mjs:37 自己又写了一遍 R27-8.9 的五成分 sha256 拼接，events.mjs:146 deriveEventId 已经有一份。CLAUDE.md 规定跨卷共用定义只放一处，**建议**抽成一个共用原语，两处都调它。
- ids.mjs:50–:51 抽取对象 id 取 `<位次去前缀>_` 加摘要前半，这个形式卷十 R10-12.1 没写（"kind 为空的位次导出的 id 只作抽取对象"），**建议**一并列进卷十勘误；parentKinds 现在不查（ids.mjs:3 已注明），也列进去。
- water.mjs:71 现在按 waterKind 相等选规则行（因为 whenRX 还没落），这是 R10-2.12 选行办法的临时替代，写者已在回报"未落 3"里写明；whenRX 落地时要换回卷文的选法。过。
- writeback.mjs:42 把先行阶段生成的维度也当作"作者已有"，所以同一维度第二次提案会报 E-GEN-OVERRIDE-AUTHORED，而不是 :54 的 E-GEN-ROW-INVALID（R10-1.2）。码给错了，但不是放行；**建议**分开判。

## 四、总判：不过，改后再核一轮

本卡方向对：手写优先、生成补缺落在写回器和加载器的规则层，没有按 id 特判，作者值 779、0、0 不动，补出的值带 `generated` 标记，跟手写分得开，可以复演。但有五处必须改，改完由 Opus 再核一次才能封卡：

1. **seed-keys 登记**（R27-8.1）：三处抽取和派生点没登记，门禁也看不见（⑥）。
2. **高低次序**：投影限定到单一维度；投影本身没有卷文依据，报李白二选一（④）。
3. **作者覆盖的加载校验**：同 id 的生成行与作者行写了同一维度即报 E-GEN-OVERRIDE-AUTHORED，否则李白裁定②会静默失效（③）。
4. **海的水深**：明知偏浅的值不许顶上，改数据或进 deferred（第二节 water 族）。
5. **全树 regionCells 物化**：水体阶段不得触发全规模的格列表（第三节）。

此外要合并成**一张卷十封卷后勘误清单报李白**：R10-2.6 作者值作子树基准（①）；自然量作用范围与 :338、:389 的矛盾（②）；高低次序投影或拒绝（④）；作者水体行缺足迹输入（河宽、海域范围）的补法，可能连带卷五 §4.1 规则 10 的河道栅格化；by 多阶段的记法；代号形式（点换下划线）与节点名；抽取对象 id 的形式。河宽与海域范围这一项要等李白裁定后另开卡，不在本卡的改动轮里加新设计。

纪律自报：本核误用了一次 `cd F:/dnd-wt/ds-wgen && node --test …`（只读跑测试，无写入），另有一次 grep 输出过长（只读）。除此之外只用了 git、node --test、grep、sed -n、head、ls 和 Write。

---

# 第二轮（末轮）只核 · 11-21

对象：`git diff 2bde67828..54c14f596`（23 个文件 +369/−69），写者回报见 docs/卡回报/worldgen-fill.md "修改轮"一节。另据李白 11-21 裁定（事件 0b824a66）第 2 条：高低次序取投影、不拒收；改值记日志，可追溯；整条下游链（含插值河床）沿下游不上坡；只有作者手写值互相冲突才报错。第 1 条（水体足迹补缺、河道窄带）另出卷十勘误，不在本卡。
本机复跑：`node --test` 跑 gen-downhill、gen-fields、gen-water、gen-worldgen、gen-water-grid、error-codes 六个文件（绝对路径，没有 cd）→ `ℹ tests 39`、`ℹ pass 39`、`ℹ fail 0`。全量用写者回报的结果（1528/1528，pre_commit pass，失败只有基线 vol12 三项），本核没有重跑。

## 上轮五项必须改

1. **seed-keys 登记——过。** seed-keys.json 新登三行：gen_fields/site_gen_fields_dev、gen_water/site_gen_water_depth、gen_ids/instance_digest；三处调用都改走 gen/draw.mjs 的 genDraw、genDiceKey、genIdKey，调用处写字面量（fields.mjs devOf 与 :145，water.mjs 水深抽取与 seedKey 两处，ids.mjs instanceDigestOf），门禁看得见了。role 暂用 role_seed，因为卷二十七 seedrole 族里没有骰值键角色，写者已注明"待卷二十七勘误"，可以接受。
   - 小注：ids.mjs 为让检测器认出调用，先赋值再 return（检测器把紧跟 return 的调用当声明跳过），有 grid.mjs 先例，属于让调用可见，不是降计数，可以接受；检测器这个缺陷应另记一条。genIdKey 的 stream、site 两个参数不进摘要（draw.mjs:94–:96），只用于登记，跟卷二十七"派生 id 的点也登记"一致。
2. **高低次序——部分过，有一处必须改。**
   - 过的部分：投影只作用于目标维度等于约束维度的场（fields.mjs chainsFor，geo-inputs.mjs:33 给 chain 带上 dim），上轮"作用在每个场上"的问题已解决。下游链从行上的 downstream 连起，从源头走到底，符合裁定"所有河的 downstream 链"。每改一个值记一条 W-GEN-DOWNHILL-PROJECTED，带 row、slot、from、to，可以追溯，复跑时看得到真实输出。作者值互相冲突报 E-GEN-ROW-INVALID，有测试（gen-downhill :69）。
   - **必须改：不收敛时静默退出。** projectDownhill 最多反复投影 `value.size + 1` 遍，到上限仍不稳定就直接 return，不报错。只有一种情况会不收敛：作者值**跨链**互相冲突。例如某点 X 在链 A 上，A 链中 X 下游有作者值 500；X 又在链 B 上，B 链中 X 上游有作者值 400。这时 X 被抬到 500、又被压回 400，来回振荡，到上限后就带着违反次序的值返回。projectChain 的作者值冲突核对只在单条链内做，看不出跨链的矛盾。这正是裁定里"作者手写值互相冲突要报错"的情形，现在漏掉了，而且是一条无声的绕过口子（卡头硬规矩 3）。改法：循环到上限仍不稳定即报 E-GEN-ROW-INVALID，说明是跨链的作者值冲突；加一条构造跨链冲突的测试。
3. **作者覆盖的加载校验——过。** writeback.mjs 的 checkGeneratedOverAuthored 不按 id、不按表，map 维度按键判，在 load/world.mjs 接入，测试覆盖了"同维报错、不同维不报"两种情况（gen-downhill :75）。
4. **海不借河——结果对，做法必须改。**
   - 结果上，海已经不借河的水深：海那行进 deferred（water.mjs:69–:70），没有提案。
   - 做法上，判别依据 `flowing` 是从**作者水体行**读的（geo-inputs.mjs:53–:54），规则表也加了 flowing 字段（registry.json waterRows、worldgen.json:6）。但卷五 §2.2 :248 写明 `flowing` 是 **water 词表条目**的字段，"每个条目必写，不设缺省"，:664 又写"不按水体 id 或名称分"；place 表并没有 flowing 维度。这样有两个问题：
     - 卷五把流不流定在水体类上，现在写成了行字段，两处说法不一。
     - G5b 把水体行转进地点表后，行上的 flowing 没有维度承接，会丢掉；那时河也匹配不上规则行，水深进 deferred，河就补不出水深了。而且是静默的，没有报错。
   - 另外，现在的 water_navigable 条目没写 flowing，本身就不合卷五 1121k3（基线缺口）。
   - **改法**（只动数据加一处读法）：water 族按卷五 :248 加河、海两个条目（navigable 真，flowing 分别为真、假），water-bodies.json 两行的 waterKind 改过去，规则行只按 waterKind 选（流不流读条目的 flowing），删掉行上与规则表里的 flowing 字段。海依旧没有规则行，进 deferred。
   - 这是把上轮建议的（甲）补完整，不算新设计。
5. **全树 regionCells——过。** planFootprints 加了 withCells 参数，水体阶段传假（place.mjs:400、:409，worldgen.mjs:81）。逐格 `{x, y}` 对象（约 1.6 亿个）这一项没了。剩下的是卷五原有的定型数组：plan.owner 约 160 MB、queued 约 160 MB，以及 plan.cells 各级行每级合计约 160 MB（footprint.mjs:8、:280、:295；层根为 null），全规模约 0.8 GB。这是卷五已定的规模口径（:8 注明），能装得下，实测照写者说的放到腾讯云。regionHeights 按行缓存（footprint.mjs:411），也是标量。

## 河床判定：插值河床仍可能上坡；本卡可以先不接，但必须登记归卡

- 能上坡的原因：区格的地表高由卷五 §4.3 规则 8 从**附近全部区域足迹行**的控制海拔插值，再加起伏（terrain 的 reliefM），不是只按河自己的控制点。所以河道经过的区格，即使各行控制海拔沿下游单调，也会被周边控制点和起伏噪声抬高或压低。写者说"控制点层面满足、区格级由卷五接"属实，本卡并没有做到裁定里"含插值河床"那一半。
- 本卡先不接可以接受，理由：① 区格高度是卷五纯派生，没有存储，要约束它须在卷五 §4.3 规则 8 加一条河床规则（例如沿 downstream 与 course 对水体足迹区格的地表高取不增的下包络），这是新规则，修改轮不能加新设计；② 河道区格现在根本不存在：河的窄带足迹正是李白裁定第 1 条另出的卷十勘误，没有河道足迹，就谈不上河床单调，也测不了。
- 必须登记（合入前由主会话补）：docs/问题.md 第 12 条现在只写了一句"区格级河床单调由卷五高度场接"，没有归卡。须写明归到**裁定第 1 条那张卷十勘误卡**，并连带一条**卷五 §4.3 规则 8 封卷后勘误**（河床区格地表高沿下游不增），验收用一条"河道全部区格的河床高沿下游不增"的测试。同时须向李白说明：裁定第 2 条"含插值河床"这一半随第 1 条一起交付，本卡只交付控制点层面。

## 新码与复用

- **W-GEN-DOWNHILL-PROJECTED——过，但要补勘误。** W- 告警码有先例（error-codes.mjs:17 W-DIM-UNIT-DIM、:45 W-DIM-PRECEDENCE-TIE、:74 W-VIEW-OVERDECLARED、:76 W-DIM-SOURCE），走内核 report 出口（report.mjs:66），只带代号与数值。它登在 vol10.s2.7 组，而卷十 §2.7 表（:233–:244）里没有这个码，写者注了"卷十勘误待补"，跟 E-GRID-STOCK-OVER-CAP"随卡登码、卷二勘误补一码"的先例一样。须并进卷十勘误清单。
- **作者冲突复用 E-GEN-ROW-INVALID——建议。** §2.7 的定义是"生成的行没有通过与手写行相同的校验"，作者值和作者值自相矛盾不是"生成的行"。复用算是勉强可以，但更贴切的码可以在卷十勘误里定：新登一码，或把 E-GEN-ROW-INVALID 的定义扩成"生成输入不合"。本卡不改。

## 其他新问题

- 投影每一遍都把整个 value 拼成串来比较，最多 n + 1 遍，n 是地点行数（千级）。复杂度 O(n²) 的字串操作，全规模可以接受，不是问题。建议改成一个"本遍有没有改动"的布尔，更省也更清楚。
- 日志是每次 generateFill 都发（复跑输出里同一行连发多次，是因为测试多次调用），不是重复记录。过。

## 第二轮总判：不过（两处必须改，改动都很小）

1. 投影到上限仍不收敛，须报 E-GEN-ROW-INVALID（跨链作者冲突），并加测试（第 2 项）。
2. flowing 改为从 water 词表条目读，按卷五 :248 加河、海两个条目，作者两行的 waterKind 改过去，删掉行上与规则表里的 flowing 字段（第 4 项）。

其余三项（seed-keys、作者覆盖校验、withCells）过。插值河床本卡不接可以接受，但须按上文登记归卡（卷十勘误卡加卷五 §4.3 规则 8 勘误），并向李白说明裁定第 2 条"含插值河床"这一半延后交付。
本卷已审满两轮。按 CLAUDE.md 和卡头规矩，这两处由主会话决定：是派写者按上面写的改法改完、再由 Opus 只看这两处，还是升级处理。修改范围限于这两处，不加新设计。

纪律自报：本轮只用了 git、node --test（绝对路径）、grep、sed -n 和 Edit，没有用 cd。
