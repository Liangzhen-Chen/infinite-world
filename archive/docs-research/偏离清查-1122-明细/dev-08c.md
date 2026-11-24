共 8 条，甲 0 乙 3 丙 5，有理由 1 无理由 7；
本卡读了 卷十 :150-270、:370-380、:389-447、:557、:674-692、:718-759、:872-995；卷六 :92-126、:356-386、:630-664、:1078（grep 行）；卷五 :89、:103、:656-673；李白裁定-1117 :1658-1671。代码读了 kernel/gen/holdings-open.mjs 全文、holdcalls.mjs 全文、assetcalls.mjs 全文、load/geo-inputs.mjs 全文、gen/worldgen.mjs :1-120、gen/water.mjs 全文、world/rules/registry.json :560-598、world/ontology/dimensions/_vocab.json :669-758、:816-824、world/rules/tables/worldgen.json 全文、seed-keys.json 全文，另按引用读 问题.md :561、:726、:818、:881-901、PLAN :135-156。没读到：卷十 :995 之后的接口总表、卷六 §4.22 全文（只读 grep 到的一条）、卷十 §4.1.1 阶段表全表（只在 _vocab 里核了已登条目）。

覆盖结论（不是条目）：① world/rules/tables/worldgen.json 的 14 个键在 server-plugin 下**全部有引用**，零引用键为 0；② world/rules/tables/seed-keys.json 的 21 条登记在 server-plugin 下**全部有引用**，零引用为 0；③ 两表每条都有 source 或 purpose，无完全空白的值；但行号出处多为旧版（见第 6 条）。

### 1 卷十 §4.8 开局财物与物品生成组整段未建，规则键与枚举也没有
- 位置：world/rules/tables/worldgen.json:126（表止，无 endowRows、coinRows、groupDepthMax）；server-plugin 全仓无 `rollGroup`、`item_group` 组条目、`group_mode`/`pick_kind`/`scale_by`（Grep 0 命中）
- 设计原文：卷十 :728「读：`rollGroup(engine, groupId, ctx)`，`ctx = {holder, place, scale, subject, time}`，返回要给的物品种类与件数」
- 代码实际：R10-8.1–R10-8.11 无任何实现；§2.3 :189-191 的 `endow.rows`、`coin.rows`、`group.depthMax` 三键未登进规则表；`item_group` 族与三个枚举也无数据
- 理由：无（问题.md、PLAN、裁定与勘误都查不到；只有 gen/worldgen.mjs:3 注释自述"经济等阶段由各自卡登记"，以及 _vocab.json:716 记经济阶段条目未登记，都不算裁定或问题.md 登记）
- 影响：玩法不可达。第 0 日没有任何持有人拿到家当与铸币，开局财物阶段无从接
- 严重程度：乙
- 合并：无

### 2 归户聚落只记缺口，不做卷六 :642 的生成期"退聚合体"一步
- 位置：server-plugin/kernel/gen/holdings-open.mjs:109（`if (tenure === modes.household) { gap(GAP.tenureHousehold, [org]); continue; }`）
- 设计原文：卷六 :642「生成期第 0 日还没有家户行，归户的 `ownerRef` 按卷十 R10-7.4 同法取该站点所在模拟单元里人数最多的居民聚合体（并列取 id 最小）」
- 代码实际：归户一律记 `gap_tenure_household_skill`，不产出 owner；注释理由"技能数据现在没有，不再退回聚合体（H-1）"；卷十 :557（R10-4.10，1124k20 改后）仍原样保留这句退回
- 理由：问题.md:900 登记为已知缺口（审查/开局持有-Opus只核-1124.md 第二轮第 2 项判可接受）；但卷文那句仍在，见"跨卷待判"第 1 条
- 影响：规则缺。城镇（org.json:15 的 class_org_town，tenure_household）下非住处建筑第 0 日无主、不入账；目前真实世界没有城镇组织行，暂未出错
- 严重程度：乙
- 合并：审查/开局持有-Opus只核-1124.md 第二轮第 2 项（判可接受，未按卷文退回聚合体）

### 3 作者高低次序链被读成"一条扁平链"，卷文形状是 list<list>
- 位置：server-plugin/kernel/load/geo-inputs.mjs:33（`Array.isArray(controls.downhill.chain) ? [{ chain: [...controls.downhill.chain], dim: opts.elevationDim }] : []`）；数据 world/geo/elevation-controls.json:21 也是扁平数组
- 设计原文：卷十 :442「作者次序链（形状 `list<list<ref place>>`，每条自上游向下游，相邻两项各成一条约束……）」
- 代码实际：只认一条链并把它包成单元素数组；若按卷文把数据改成 list<list>，`chain` 的元素会变成数组并被 order.mjs 当 id 用
- 理由：无（问题.md:726 只记"旧作者输入读法与转换脚本有出入"，没记链形状；裁定与勘误无）
- 影响：规则缺。第二条作者次序链要改代码，违背"加一条只添一行数据"
- 严重程度：乙
- 合并：无

### 4 找聚落组织时没有核"站点"资格
- 位置：server-plugin/kernel/gen/holdings-open.mjs:99（`chain.find((p) => isStr(ctx.settlementOrgAt(p)))`）
- 设计原文：卷六 :642「先定管辖的聚落组织——从活动所在的地点沿包含树向上，取第一个有聚落组织的站点」
- 代码实际：取"第一个有聚落组织的地点"，不判这个地点是不是站点；worldgen.mjs:85 的 `settlementOrgAt` 也只按驻地对 org 行，不看行种类
- 理由：无
- 影响：读数错（潜在）。若某聚落组织驻在非站点行（如分片、建筑），归属会落到它而不是站点；现有数据没有这种行，暂未出错
- 严重程度：丙
- 合并：无

### 5 worldgen.json 有五个键没有登记进卷十 §2.3
- 位置：world/rules/tables/worldgen.json:56（roleFacility）、:88（openingCondition）、:104（tenureModes）、:112（householdMemberKind）、:120（householdHeadKind）
- 设计原文：卷十 :203「本卷代码要用到的别卷代号一律经这里取：`settlement`、`tract`、`region`、`zone`、`waterbody`、`weatherCell`、`volume`……」；:156「规则表 `worldgen.json`，键前缀 `rules.gen.`」
- 代码实际：五键是生产代码在读（worldgen.mjs:57-58、:80、opening-people.mjs:58-59），数据行也写了 source/basis，但 §2.3 键表与 roles 行都没有它们；openingCondition 只在勘误 1123k60 正文出现，未补进键表；registry.json:595 的出处也只列了另四键
- 理由：无（数据行自述各引卷八、卷十八与李白裁定，但没有一处说明为何不登 §2.3）
- 影响：只是形式。登记表不全，后来人按 §2.3 对表会判这些键"不该存在"
- 严重程度：丙
- 合并：无

### 6 两表 source/purpose 里的"卷:行"多处是旧版行号
- 位置：world/rules/tables/worldgen.json:13（`R10-2.12 :427`）、:44（`R10-2.3 :413`）；world/rules/tables/seed-keys.json:60（`§4.12.1 :860`）、:100（`:888`）、:124（`R10-12.1 :937`）
- 设计原文：卷十 :435 才是 R10-2.12、:421 才是 R10-2.3、:888/:891 才是 §4.12.1 的 fields/siteform 行、:967 才是 R10-12.1
- 代码实际：`:427` 指向"陆路/渡口"、`:413` 指向"§4.2.2 统一入口"、`:860`/`:861`/`:887`/`:888`/`:937` 都落在现行卷十的正文别处（实测 5 处，全部对不上）
- 理由：无
- 影响：只是形式。出处追不回原文，偏离清查时会被引到错的规则
- 严重程度：丙
- 合并：无

### 7 geo-inputs 手拼 Error 带码，不走 KernelError 与登记码
- 位置：server-plugin/kernel/load/geo-inputs.mjs:19（`throw new Error(\`E-DIM-STRUCT-FIELD ${GEO_DIR}/${name}: …\`)`）
- 设计原文：卷二 :1567「不带登记码的异常视为程序缺陷，reportError 原样抛回，不吞、不赋码；事务照常回滚、加载照常停止。」
- 代码实际：用普通 Error，把码写在消息串里，`code` 字段不存在；调用方只比较代码时读不到
- 理由：无（公共部件审查-乙 只记了同式 deny 函数，没记这里）
- 影响：只是形式（坏 JSON 时错误类型不合公共部件）
- 严重程度：丙
- 合并：无

### 8 作者海拔非法时静默当缺失，不拒收
- 位置：server-plugin/kernel/load/geo-inputs.mjs:32（`if (Number.isFinite(rows[id].anchorElevationM)) put(...)`）
- 设计原文：卷五 :103「`anchorElevationM` … [-12000, 9000] … error」；卷十 :382（R10-1.7 手写优先，作者值当输入读）
- 代码实际：非有限值（`"unknown"`、`null`、字符串数字、`rows[id]` 不是对象）一律跳过，等同作者没写；不报错、不记缺口
- 理由：无（文件头注释自述"写 unknown 或没有的量留缺"，未区分"作者写 unknown"与"作者写错"）
- 影响：规则缺。错值被当成缺值，生成会另补一个值覆盖作者的错，而不让作者看见
- 严重程度：丙
- 合并：无

## 已登记未建

1. **reachOf 退回**：卷六 :642「所在地点不在任何站点之下时，取 `reachOf` 内到岸成本最小的站点的聚落组织」。代码 holdings-open.mjs:12、:20、:101 只记 `gap_no_site_above`（且站点判定输入无生产者时并入 `gap_no_settlement_org`）。**确为卷文要求**。登记处：问题.md:900、docs/研究/偏离清查-1122.md:126、审查/开局持有-Opus只核-1124.md 第 1 项建议。
2. **归户的技能数据**：卷六 :642「归户的，`ownerRef` 是该聚落里对所需服务有效技能最高、且尚无同类设施的家户」。运行期确实要技能数据；但**生成期第 0 日的卷文取法是退聚合体，不是等技能数据**（同句与卷十 :557），见正文第 2 条与跨卷待判第 1 条。登记处：问题.md:900。
3. **waterRows 缺 whenRX、liquidRX**：卷十 :165 的 struct 有这两字段；worldgen.json:6-9 只有 priority/waterKind/depthM，water.mjs:68-69 改从作者行读 kind/liquid、读不到即 deferred。登记处：world/rules/registry.json:595 明写"whenRX 与 liquidRX 随存量单元行与 rx 读邻格聚合落地后补"、PLAN.md:139"水体按场值判定……未落"。
4. **§2.3 其余未登键、§4.12.1 未登抽取点与位次（都对应未建阶段）**：卷十 :158-203、:883-941。未登键：skeleton.levels/tracts/rootAreaM2/shareWeight、classify.rows、under.rows、weather.cellLevel、climate.rows、border.rows、site.scoreRX/perUnit/developmentRX/controlRX、pop.fillDist/bandsRole/bandSlices/cultureLevel、name.maxSlots/optionalPermille/fallbackBank、layout.prefKind、herd.fillDist、store.coverDays、history.years、reject.rows、divinemetal.perSphere/baseRows/dimRows/maxDims、lore.boostCurve/secretCurve、shade.fallbackCulture、roles.*（settlement、region、zone、weatherCell、volume、genesisSource、unmaterializedPurpose、unmaterializedShare、residentAggKind、materializeVerb、genesisVerb、installHolding、artformPrefKind、schoolPrefKind、genesisCause）。未登抽取点：skeleton.children/tracts/share、water.liquid、under.area/depth/span/water、weather.liquid、geology.present/richness/depth、people.culture/fill、fixture.pick、herd.fill、group.hit/count/pick/choose、artforms 七项、divinemetal.dim.<j>、roster.birthplace/profession、name.pattern/optional/word、lore.secret、shade.age。未登位次：_vocab.json:816-824 的 idslot 族只有 fielddev、realm、settlement、genoffice 四条，卷十 :926-940、:947-959 的 region/tract/under/site/zone/building/fixturelot/member/household/herd/species/deposit/grant/shade/divinemetal 十五条未登。登记处：_vocab.json:716（"骨架、人口、经济阶段条目还没有登记（各有自己的卡）"）、gen/worldgen.mjs:3。
5. **开局一步与 openRX/runtimeOpen**：卷十 :194-195、:221-222、:963、:973（`openingOf()`、`state.genesis`、`state.genDone`、`gen.open` 偏离行）。全仓无 `openingOf`，无开局阶段写者。openRX/runtimeOpen 的值卷文只给类型。登记处：问题.md:818、PLAN.md:156。

## 拿不准

1. **水体行的 parent 一律取世界根**（geo-inputs.mjs:36 写 `parent: opts.rootId`）：卷十 :440 与 :1186 注 27 要作者把 `parent` 写成途经各地的最近公共祖先（卷五 :89 的足迹须在父足迹之内），对跨省的河取根是对的；对只在一郡里的湖，根也在足迹之内但层级偏浅。数据里只有 `parentHint` 文字、没有 parent 字段（water-bodies.json:11），这算转换期取值还是"为缺值编值"，请主会话判。
2. **建筑资产份额记到哪个用途分区**：assetcalls.mjs:34、:53 取 `rules.polity.rolesPurposes.general`；卷六 :105 只说用途是分区、§2.2 :133 的 `purpose_general` 是"公库缺省分区"，没有一句规定开局建筑份额放哪一区。请判是否要补设计句。
3. **用清单判建筑**：geo-inputs.mjs:44 的 `buildingIds` 供 rows.mjs:34 把行判成建筑足迹，而卷五 :89 写"足迹种类按组件类判"。问题.md:561 已登记为 G5b 换表前的临时读法；这里只记位置，不另立偏离。
4. **readGeoInputs 无生产调用者**：全仓只有 tests/cloud/gen-worldgen.test.mjs:13 调它，转换脚本走自己的补缺读法（问题.md:726 已记两者有出入）。若卡主认为这也算"入口只有测试调用"，可升一条乙；本卡按已登记不另计。

## 跨卷待判

1. **归户聚落的生成期 ownerRef 到底是聚合体还是记缺口**：卷六 :642 与卷十 :557（R10-4.10，勘误 1124k20 保留原句）写"归户而第 0 日没有家户行时取人数最多的居民聚合体"；李白 H-1（裁定-1117 :1663）与卷十 R10-7.2 ④（1124k20）写"资产持有者是家户，居民聚合体不持有资产"。代码取后者（holdings-open.mjs:109 记缺口）。两卷原句直接冲突，须李白裁：是把卷六 :642 的退回句勘误掉，还是让代码退回聚合体。在此之前，正文第 2 条按"卷文要求未做"记乙。
