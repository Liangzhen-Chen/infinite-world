# 前置卡 C《开局建账：围护材料量、开局状态、围护流水账》Opus 终核 第 1 轮（最多 2 轮）

- 复核者：Claude Opus 5.5 中档；只核，不改代码。
- 对象：写者提交 237978932（分支 ds/opening-ledger），`git diff origin/master...237978932`；写者回报 docs/卡回报/opening-ledger.md；依据：李白裁定-1117.md :1648 C-1、:1649 C-2。
- 本机跑过：`node --test tests/kernel/gen-envelope.test.mjs tests/kernel/gen-layout-fill.test.mjs tests/kernel/gen-siteform.test.mjs`：tests 58 pass 58 fail 0；`node tools/accept/run.mjs pre_commit`（不带 --write）：verdict pass，items fail 3 = vol12.A12-4.5、vol12.S12-2、vol12.S12-3 三项基线。未跑全量、未跑转换脚本。

## 结论

必须改 8 条（M1–M8），须李白 3 条（L1–L3）。改完再核一轮。

## 逐项

### 1. 默认用料与代用 —— 须李白（L1），另带出 L3

- 墙 mat_soil：夯土就是压实的土，同一种物质，密度 1.6 对设定 1.8，差值已写进 basis，标了待补。过。
- 梁架 mat_elm、屋顶 mat_straw：这两项没有编数，都是表里真实存在的行，basis 也写明是代用、待补（_vocab.json bldform_river_house defaultMaterialsBasis）。但"按密度最近选树种、选茎秆"这个挑法是写者自己定的，C-1 原话是"数据取 13-建筑 :170 已写的夯土墙、木架、苇草顶"。材料表确实没有通称木料、芦苇的行（material.json 的 rows 里只有 mat_elm、mat_oak、mat_bamboo 这些树种行，芦苇只能找到 mat_straw、mat_dry_grass、mat_wicker 这类近似行）。这是裁定所依赖的数据还没登（李白 B-T3 的情形），按规矩应列给李白，不该由本卡加新材料行：新材料行要走材料数据管线，带齐出处和卷三甲的全部必填物性，超出本卡范围。
- 新发现（L3）：卷十九 :408 规则 10 要求"进入 material 的每种材料，density、thermalConductivity、soundAttenuation、corrosionRate、toughness、strength 都必须已知"，原因是"已建成的建筑上，规则 4–6 与 §4.16 的各式不会出现未知"。material.json 里 strength 只有 4 行写了值，mat_soil、mat_elm、mat_straw 这四项物性都缺。开局补料不经过 buildPlan，所以规则 10 没有被核过：开局建筑带着物性不全的料进了墙。层数上限（规则 4）也因此核不了，siteform 的缺口 storeys_max_unchecked 会一直挂着。

### 2. 取式与"体积按角色分" —— 须李白（L2）

卷十九只定义了结构元（:664 体元是外墙、隔墙、楼梯，顶元是楼板、屋面、桥面）。"梁架"这个角色在本次勘误之前全卷没有出现过。所以外墙和隔墙归墙、屋面归屋顶，是顺着字面推得出的；楼梯、楼板、桥面归梁架，卷文推不出。反过来的证据也有：13-建筑 :47–48 的 roles 把 frame 和 floor 分成两项，夯土本身也带 floor 角色，所以楼板也可以读成墙料。另外 :666 规则 8 规定，运行期各结构元用什么料是按"重料在下"由 materialKg 重新派的，角色只决定各料的总量，不决定哪一元是什么料。建议照写者的对应办，并在勘误里注明"角色只定总量，元上的料照规则 8"。依赖的蓝图结构元现在已有（blueprint.mjs elements、volumeByMaterialRole）。

### 3. 密度不经 materialView —— 过；注释与报错须改（M8）

材料表头 density 是按物态分栏的 struct，并且 `modifiable: false`（material.json :1885）。按卷二 §3.3，只有登记了可修正的数值标量才走修正管线，代码 item.mjs:139 runtimeReader 用的也是同一条判据。所以 density 的有效值按定义就等于基值，这不是碰巧现在没有修正项。卷三乙 :686 M-12 ② 要求读有效值，这里读到的就是有效值，不违反。正确的修法就是现在这样：生成补缺本来就跑在校验之前的世界上（tools/convert-geo-g5b.mjs:428–437 的 loadDoc），不能为了让 materialView 能用而把注册表提前装上。

但有两处说法和实际不符，必须改（M8）：envelope.mjs:6 写的是"worldgen.mjs 经 materialView 读"，envelope.mjs:40 的报错写"(materialView)"。实际是 worldgen.mjs 直接读表行。

### 4. 账本 —— 资产分录确属须等持有卡；流水账有三处缺（M2、M3、M4）

- src_genesis 资产分录：卷六 :361 规定"按出资比例记到各出资方名下"，:643 规定"记到 ownerRef 名下"，卷文没有"无持有者"时的记法。start-buildings.json 没有持有者字段，kernel/gen 里也没有任何 post 入账路径。本卡记不了，确属须等开局持有卡。但 PLAN、问题.md 里都还没有这张卡，主会话须挂上。卡里写明：资产分录和卷十九 :419 的"同一份明细交卷六"要在建行的同一事务里一起落，事由代号"开局建行"也由那张卡登记。
- C-1 说的"围护流水账写者一并补上"：wallFlowKg 的开局写入已经落了，但还差三处：
  - M2：place.json:779 把 wallFlowKg 登成 `onUnknown: "gap"`，卷十九 :109 写的是 error。写者给的理由是缺 form 的 326 栋，可这些栋的 materialKg（place.json :495，error）本来就已经报错了，改成 error 不会多挡任何东西。登成 gap 是放宽，须改回 error。
  - M3：卷十九 :419 明写"wallFlowKg 是账、作者不写"。envelope.mjs:62 在作者写了 wallFlowKg 时照单全收，测试 gen-envelope.test.mjs:72–74 还把"作者写了流水账的也不重写"固定成了行为。须改为：用 ctx.isAuthored 判断，作者写了 wallFlowKg 即 E-GEN-ROW-INVALID；测试跟着改。
  - M4：C-1 要求"试玩地区 19 栋开局材料量全部非零"。gen-envelope.test.mjs:132 先 `filter((r) => typeof r.form === 'string')`，只测了 18 栋，bld_hw_grain_annex（start-buildings.json:489，form 为 null）被滤掉了。须改为：全部 19 行都进来，form 为 null 的不写 form，交给 siteform 补；再断言提案数等于 START.rows.length。
- 守恒测试：gen-envelope.test.mjs 的守恒用例覆盖了补出的料、作者写的料，以及 0 照记 0。在卡这一级够了。建议（不挡封）以后加一条整世界加载期核对：每个设施行 laid − taken − lost = materialKg，materialKg 里没有的料按 0。

### 5. 流水账写者 wall-flow.mjs —— 必须改（M7）

openingWallFlow 是个纯函数，它只算出流水账的值；真正写入的是 gstage 提案经 writeback 落进去的。state-owners 里登的 kernelApi 行带了 callerFiles，但门禁的 api-callers（tools/accept/lib/api-callers.mjs）只核条目 params.entries 里列出的入口，而 items.json 没有任何条目列这个入口。所以这条登记现在没人消费。它和 vol17.S17-1 的口径也不是一回事：S17-1 是在 stateKeys 里声明写者，再按维度写入计数。须二选一：要么加一条 decl_guard nameUse 门禁行，让 callerFiles 真正生效；要么把代码注释和回报里的"唯一写入点"改成"开局流水账值的唯一构造函数"。运行期写者 facilities.mjs 落地时，再在声明表里登 wallFlowKg 的写者。place.json 的 wallFlowKg：类型 map<material, struct{laidKg, takenKg, lostKg}>、各字段 [0, null]、precision 4，都对得上卷十九 :109；唯一不对的是 onUnknown（见 M2）。

### 6. 阶段 gstage_envelope —— 次序过；卷十阶段表须补（M6）

本阶段读 form、planCells、storeys、wallThicknessM，这些都由 siteform 补（R10-7.12），所以排在 siteform 之后是对的。已登记的阶段里没有谁在它之前读 materialKg、condition。phase worldgen、scope site 合乎卷十 :345–:354 的体例，阶段次序测试也过了。但卷十 §4.1.1 的阶段表（:342–:366）没有加 gstage_envelope 一行，只在 R10-7.12 正文里提了一句。先例是 gstage_waterfoot，当时经勘误加进了表（:342）。须在同一条 1123k60 勘误里补上这一行（M6）。

### 7. 加载校验与夹具 —— 过

blueprint.mjs 只是在 checkBlueprintForms 里多加了一项 defaultMaterials 校验，place.mjs:1558 把已有的 hasMaterial 传了进去，这是收紧，不是放宽。volumeByMaterialRole 是纯函数，没有越界。8 个夹具补 defaultMaterials，是新必填字段的正当跟改。gen-layout-fill 改的那条断言也是正当跟改：bld_2 现在会有 envelope 阶段写的偏离行，断言仍然核了 anchor、facing 不被写。但 `bld2 === undefined ||` 这一支偏松，建议（不挡）收紧为"必有偏离行，且来源是 gstage_envelope"。

### 8. 勘误 1123k60 流程 —— 流程过；两处正文须改（M1 的随改、M5）

两份改前快照和勘误前原文是同一个 blob（卷十九 b16c1e08…，卷十 90445678…），版本号没升，历史修订记录没回改。"作者可逐栋覆盖"在卷十 :690 和卷十九 :419 都写了。须改的两处：

- M5：卷十九 :419 新加了"开局建行的墙料不记物品腿，只记资产分录（…src_genesis）"。可卷六 :367 规定记哪些腿"只在本条定义，卷十九不写"。须改成只写引用："账本一边照卷六 §4.1 规则 5"。
- M1：见第 9 项。卷十 :690 和勘误段里的"缺 form 的行不补"须收窄到 materialKg 和 wallFlowKg，不连带 condition。

### 9. 红线与手算 —— 过；condition 须改（M1）

envelope.mjs、wall-flow.mjs、volumeByMaterialRole 里没有按 id 或名字写的特判，也没有用 Math.*。抽了两个期望值重算一遍，都对得上：

- 16800：3×3 的一层房，细格 1 m、层高 3 m、墙厚 t = 0.4 m，墙格数 w = ceil(0.4 ÷ 1) = 1。外圈 8 格，正门占 1 格，剩 7 个外墙元。windowEvery 4 时，每面墙去掉墙角只剩 s = 0 这一处，(0 + 1) mod 4 ≠ 0，所以不开窗。每元体积 = 1 × 3 × min(1, 0.4) = 1.2 m³ = 1200 L。墙共 8400 L，乘密度 2 kg/L，得 16800。
- 36000：两层，第二层没有门，外墙元共 7 + 8 = 15 个，15 × 1200 = 18000 L，乘 2 得 36000。另外第一层中心是楼梯格，体积 = 1² × 0.4 = 400 L，乘 0.5 得 200；顶层屋面 400 L，乘 0.25 得 100。

问题在 condition（M1）：C-2 原话是"condition 一律 1"，可 envelope.mjs:48–60 只给有 form 的行补 condition。完好度和形制、蓝图都没有关系，缺 form 的 326 栋也应当补 1。须把 condition 的补缺移出 form 分支，测试 gen-envelope.test.mjs 里缺 form 的用例也跟着改（缺口只列 materialKg）。

## 必须改（8）

- M1：condition 的补缺不受 form 限制，缺 form 的行也补 rules.gen.openingCondition（envelope.mjs:48–60）；卷十、卷十九勘误里"缺 form 不补"的措辞随改；测试跟着改。
- M2：place.json:779 的 wallFlowKg 改为 onUnknown error（卷十九 :109）。
- M3：作者写了 wallFlowKg 即 E-GEN-ROW-INVALID（卷十九 :419 作者不写）；改 gen-envelope.test.mjs:72–74。
- M4：19 栋测试包含 bld_hw_grain_annex，断言提案数等于 START.rows.length（gen-envelope.test.mjs:132）。
- M5：卷十九 :419 关于账本腿的那句改成引用卷六 §4.1 规则 5，不重述。
- M6：卷十 §4.1.1 阶段表补 gstage_envelope 一行，记在同一条勘误 1123k60 里。
- M7：给 openingWallFlow 的 kernelApi 登记加一条门禁行；或者把"唯一写入点"的说法改成"值的唯一构造函数"。
- M8：envelope.mjs:6 和 :40 的"经 materialView"改成与实际一致。

## 须李白（3）

- L1：默认用料暂用代用料（木架用 mat_elm、苇草顶用 mat_straw、夯土用 mat_soil），另开材料数据卡补"木料（通称）""芦苇"两行。建议：同意暂用、标待补，材料卡排在块 6 之后。依赖的数据现在没有，两行都不存在。
- L2：梁架这个角色对应哪些结构元。建议采纳写者的对应：楼梯、楼板、桥面归梁架；并注明"角色只定总量，元上的料照规则 8"。依赖的组件现在已有：蓝图结构元、volumeByMaterialRole。
- L3：开局默认料没有核卷十九 :408 规则 10 的物性齐全要求，mat_soil、mat_elm、mat_straw 缺 strength、toughness、thermalConductivity、soundAttenuation。建议：材料卡先补齐这四项物性，然后在加载期对 defaultMaterials 加规则 10 的整类校验。现在就加会让世界加载失败，所以先后次序请李白定。依赖的数据现在没有，表头维度在、行值不在。

## 另记（主会话办，不算本卡必须改）

- PLAN 挂"开局持有卡"：负责 src_genesis 建筑资产分录、交卷六的明细，以及"开局建行"事由代号的登记，三样和建行在同一事务里落。
- 建议加整世界的守恒核对；gen-layout-fill 那条断言收紧（见第 7 项）。
- 复核者偏离命令纪律（如实）：跑三份测试时命令里带了 `cd` 和 `2>/dev/null`；查三行材料物性时用了两次管道（grep）。都没有写文件，不影响结论。

## 第二轮（Opus 5.5 中档；对象 `git diff 791174f62 649b6107a`；依据另加李白 11-24 事件 e6937a77 第④⑤条）

本机跑过：`node --test tests/kernel/gen-envelope.test.mjs tests/kernel/blueprint.test.mjs`，tests 34 pass 34 fail 0。pre_commit 本轮没有重跑；649b6107a 是挂着提交钩子提交的，提交说明记 verdict pass。本轮没有用 cd、重定向或管道。

### 结论

本轮不过，还有 3 处小改（R1–R3）。都不改方案、不加新设计，主会话亲读 diff、跑完测试就能合，不必再请一轮核。M2 须李白，挂"待调"后不挡合入。

### 1. M1、M3–M8 落实情况

- M1 已落：envelope.mjs 把 condition 的补缺提到 form 分支前面；卷十 :690、勘误段和卷十九 :419 的措辞都收窄了；测试改成缺 form 的行照补 condition，缺口只列 materialKg。
- M3 已落：envelope.mjs 用 `ctx.isAuthored(b.id, 'wallFlowKg')` 判断，作者写了就报 E-GEN-ROW-INVALID；新测试正反两面都测到了。
- M4 方向对，但写法不合规矩，见 R1。
- M5 已落：卷十九 :419 改成"账本一边照卷六 §4.1 规则 5（……本卷不重述）"。
- M6 已落：卷十 §4.1.1 阶段表 :355 补了 gstage_envelope 一行，勘误段写了续编。
- M7 依据成立。`created.<id>.props.<维度>` 就是任何实体偏离行的存处（dimension-writers.mjs:147、:161；卷二 §1.3 覆盖顺序），所以运行期写一栋建筑的 wallFlowKg 一定落在 `created.*.props.wallFlowKg`。storage.mjs:262–268 的 writePathChecked 用 writerOk 核写者，写错了就报 E-VIEW-UNDECLARED-WRITE，而且更具体的模式会压过 `*.props.*`，先例是 `*.props.pos` 归 position.mjs。这正是 S17-1 那一类声明写者的口径，比上轮的 kernelApi 行有效。删掉的那条 kernelApi 行确实没人消费：tools/ 下搜不到 openingWallFlow 和 wall-flow，api-callers 只核 items.json 条目里列出的入口。注意：开局那次写不走 state，走的是表文件的 generated 节，声明只管运行期；注释里已经写明这一点，可以接受。
- M8 已落：envelope.mjs:6 的注释和报错都改成"直接读材料表行值，有效值按定义即基值"。

### 2. M2（wallFlowKg 的 onUnknown）—— 须李白

两卷并不真正矛盾，但照字面去做，代价大到不可接受：

- 卷二 :269 §1.6 第 4 项规定，未标 `combine: sum` 的映射在 onUnknown 为 error 时，键集要覆盖全族，"某键没有"就写 null。卷十九 :109 的形状是 `map<ref material, struct>`，只能这样写：每栋建筑写满材料表的全部 100 多个键，绝大多数是 null。这样合法，但卷十九 :109 自己写的"materialKg 里没有的料按 0"在这种写法下只能靠 null 表达，跟账本"只做加法"的读法也拧着。卷二 :271 又规定 `combine: sum` 只能标在数值映射上，struct 值的映射标不了（types.mjs:119）。所以照现在的形状，没有既合两卷、又不写满 null 的办法。
- 推得出的改法要改卷十九 :109 的类型栏，属于改裁定方向，所以须李白：把 wallFlowKg 改成 `struct{laidKg, takenKg, lostKg: map<ref material, number> combine=sum}`，onUnknown 保持 error。sum 映射缺键读作 0，正好就是 :109 的"没有的料按 0"；materialKg 本身就是 sum 映射（place.json :488），两者同一口径，守恒式逐键照算。
- 依赖的组件现在都有：sum 映射已有实现（materialKg 在用）；validate/rows.mjs:253 checkMapKeys 只查顶层映射，struct 字段里嵌的 sum 映射不会报 SPARSE；卷二 :271 也写明了 combine 可以嵌在 struct 字段里。要跟着改的只有 wall-flow.mjs 的输出形状、gen-envelope 的测试和 state-owners 的 pathTypes，都是小改。
- 建议：李白选"三个 sum 映射"，并勘误卷十九 :109；在那之前保持 gap，place.json 的 source 已经注明了原因。主会话把这件事写进 docs/问题.md。不挡本卡合入。

### 3. ⑤ 三行物性与规则 10 校验

规则 10 的校验真加上了，夹具也没有放宽：

- blueprint.mjs 新增 envelopeMaterialMissing，核固态密度为正、固态热导、隔声、腐蚀率、strength 至少一键（toughness 由 strength 合成，不另存）。checkBlueprintForms 加了第五参，place.mjs:1558 在真实加载时传入材料行。
- 新增测试逐项缺失都报错、物性齐全才放行，真实世界的三种默认料也过了。
- 测试夹具没有动，这几条用例都是新增的。世界照常能加载。

三行数据合 P-3 §三的格式：每格都写 grade designed、citation null，basis 带"设："和"暂定·待试玩调"。逐类看：

- 热导与隔声：basis 写了现实里的量级（例如"干压实土 0.5 至 1.0 W/m·K 的低端"），能复核量级，但没有给出处。仓库里找不到可引的出处：docs/世界设计/13-建筑 :47–53 只有归一化的 insulation，不是 W/m·K；world/ 下也没有导热数据。外部出处（工程手册一类）其实查得到。建议以后由材料管线补引证、改级，不挡合入。
- 强度：六个键共用一句定性的 basis（"参照 mat_bone、mat_bamboo 的同标度……"），数值从 basis 推不出来，只能看大小顺序合不合理。P-3 §三允许这种设定值，接受。
- 腐蚀率：mat_soil 取 0.0008，跟全表大多数行一样，可以复核。mat_straw 的 basis 写"参照 mat_wicker、mat_bamboo、mat_elm 的 0.003，P3-T1 同类口径"，可 P3-T1 是按本源成分分组的。mat_straw 的本源成分是 subst_plant，那三行都是 subst_wood；subst_plant 组里没有一行有腐蚀率，按 P3-T1 应当取全表已有值的中位数。全表 26 个已有值里 0.0005 两个、0.003 五个、其余都是 0.0008，中位数是 0.0008。也就是说 basis 引了 P3-T1，取的数却不是 P3-T1 算出来的，见 R2。

### 4. ④ 勘误句 —— 只记在修订记录里，正文没补全

卷十九 :419 的正文本来就有"外墙与隔墙归墙、楼梯与楼板与桥面归梁架、屋面归屋顶"，跟李白④一致。但"角色只定总量，元上的料照规则 8 重派"这一句，只写进了 :2220 的勘误记录 ④，正文里没有。同样，⑤ 说的"默认料须满足规则 10、由装载校验核"，§2.4 的 bform 行 :203 里 defaultMaterials 那一栏也没写。勘误记录说改了正文，正文却没改，见 R3。

### 5. 仍须改（3 处，都很小）

- R1：gen-envelope.test.mjs 的 START_KG 表把 19 栋逐栋的千克数写成了字面量。这些数是 siteform 按种子抽出平面与层数后，再经 envelope 算出来的，是当前输出的快照，不是按卷文手算的，违反卡头硬规矩第 4 条。撤掉这张表，保留"提案数等于 START.rows.length（19）"、每种料都是该形制的默认料、质量非零、流水账对平这几条断言。想要逐栋精确值，就在测试里由该栋补出的 planCells、storeys 另外按体积式算出期望值，不抄输出。
- R2：mat_straw 的 corrosionRate 照 P3-T1 改成 0.0008；或者把 basis 改成不引 P3-T1 的"设："口径，写明为什么参照木类。二选一。
- R3：卷十九正文补两句，作为 1123k60 续编：:419（或 §2.4 :203）补"角色只定各料总量，元上的料照 §4.5 规则 8"；:203 的 defaultMaterials 栏补"所指各料须满足 §4.1 规则 10 的物性齐全，装载校验"。

### 6. 能否合入，合入前主会话要做的事

R1–R3 改完就能合，不必再请一轮核。合入前主会话要做：

1. 亲读 R1–R3 的 diff。
2. 跑全量 `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` 和 pre_commit，把命令和末行贴出来。
3. 往 docs/问题.md 里写：M2（wallFlowKg 形状待李白，建议改成三个 sum 映射）、L1 的"补木料通称与芦苇行"、三行导热隔声以后补引证。
4. PLAN 里挂开局持有卡，负责 src_genesis 资产分录、交卷六的明细和"开局建行"事由代号（第 1 轮"另记"那一条，现在仍然没挂）。
5. 照北极星核一遍：C 卡让试玩地区 19 栋在开局都有围护材料量、完好度和流水账，离块 6 更近；没有写死、没有特判。
