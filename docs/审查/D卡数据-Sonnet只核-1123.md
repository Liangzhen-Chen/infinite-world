# 前置卡 D 数据卡只核（第 1 轮）

复核者：Claude Sonnet 5.5 中档（非写者）。对象：分支 ds/data-d，写者提交 d61822d54、主会话补快照 de3538cbf，改动范围 `git diff 29cbd904a de3538cbf`。照的卷：卷五 §2.1、卷六 §2.2/§4.1/§4.17.1、卷八 :135/:220/:328/:1371、卷十 §2.2/R10-7.12、卷十九 §2.1/§2.2/§4.5、卷二 :285/§5.7；裁定 docs/审查/李白裁定-1117.md :1604（G5b-K 第 D 条）。
本机跑过：`node --test tests/kernel/gen-water.test.mjs tests/kernel/gen-siteform.test.mjs tests/kernel/geo-g5b-data.test.mjs tests/kernel/data-d.test.mjs`（58 pass 0 fail）；`node tools/accept/run.mjs pre_commit`（不带 --write）verdict pass，失败三项仅 vol12.A12-4.5、S12-2、S12-3（基线）。

## 总判

必须改 1 条（药草院），其余过；真须李白 6 条；建议升 Opus 1 条（形制补缺的次序循环，见第 7 项）。

## 逐项

**1 海湖水深——过；单位问题须李白，不是必须改。**
- 三行每个数都写了出处或推法：海 20/60/100 m 取陆架浅海量级，参照黄海、波罗的海、北海（标明是地球常识不是设定出处）；湖 0.5/2/6 m 依据 regions.json:644 的沼泽湿旱季描述；全部标"暂定·待调"，grade designed，合 P-3 第三节"查不到出处填设定值、写参照与理由"。
- 100 m 上限的算术我复核：面积 8.037×10^10 m² × 1000 L/m³ = 8.037×10^13 L/m，除进 2^53−1≈9.007×10^15 得约 112 m，取 100 m 正确；数据测试用卷文矩形手算面积，不抄读数。
- 不是写者选错单位：卷五 :146 把 `capacityL` 定为 integer、单位 L，卷二十 :793 水循环也是"整数升"，G5b 已合的 water.mjs:83 对装不进安全整数的报 E-GEN-ROW-INVALID。规则层没有被绕过。真大洋（数千米）装不进，是卷五/卷二十的单位决定，属须李白（改单位要动卷五 §2.1、卷二十，跨卷）。本卡数值设定合法。另注：账本若按定点放大存水量，实际可用上限比 2^53 更紧，目前无读 `capacityL` 的消费者（只有 gen/water.mjs、worldgen.mjs），我没法核，列入须李白一并问。

**2 设施类型与形制——一半过，一条必须改。**
- intendedType 登进 place 表头：必填 byClass:comp_facility、onUnknown error、owner 卷十九 §2.1，照卷十九 :106；卷五 :162 已有指回行，不需要勘误，过。取值类型写成 `ref` 加 `vocab: facility_type`，而卷十九 :106、卷二 :1827/:237、卷十 :209 都写 `ref facility_type`（实体引用，recipe.json:48 也用 `kind: facility_type`），且 `_unbuilt-derived.json:166` 登的是实体 kind 前缀 `facility_`、本卡登的词表条目前缀是 `fac_`——这是第 7 项第 1 条的同一个问题，须李白。
- 9 个 fac_ 条目与 bldform_shrine 体例：功能下限空 map（卷十九 :168 允许）、围合上限显式 null（:169 要求每行必写、可显式 null）、accessDefault 取 access 族条目（access_public rank 0 是最小，合卷五 :1182；住宅取 access_private，依据 locations.json:3287–3289 的私宅 private），basis 逐条有出处。services、ratingWeights、wearPerDay 三个 always 列没写，因依赖未建的 service、raspect 族，写者已在问题.md 列明；与已合读者（siteform.mjs、layout.mjs 读词表族）一致。bldform_shrine：占地 [2,20] 出自 13-建筑 :109，外包 ⌊√20⌋=4、ceil(20÷4)=5 我手算无误，其余暂定且标明；过。
- 18 栋对应抽核 6 栋：青灯酒馆→fac_inn（卷十九 :960 酒馆含餐饮留宿）、旧磨坊→fac_mill、铁匠铺→fac_forge、河湾石坛→fac_shrine（旧 purpose 复活登记祭坛，locations.json:1376）、公仓→fac_granary（旧 facilityType granary，locations.json:31173；卷二 :2273）、织坊→fac_workshop，均合理，locations.json 行号我核对属实。
- **必须改：药草院的"对不上"理由是错引。** 写者回报与 start-buildings.json basis 写"旧数据只有水、容器、水渠、土、粪堆一类资源节点，locations.json:499–693，是菜圃药圃"；我读了 locations.json:443–476，药草院一条只有名称、坐标、开放时段，没有任何资源节点；499–693 属旧渡口（loc_hw_dock，:477 起）和南田，不是药草院。而设计数据里有依据：`world/design/seasonal-hazards.mjs:199` 的"请药师治疗"措施地点即 bld_hw_herbs、代表人陶芷；`:188` 传闻"药草院陶芷说是喝了脏水"；`economy-supply.mjs:20`、`npc-m2.mjs:12` 陶芷的住处与存货也在药草院。首批 17 类里有 fac_clinic（卷二 :1867）。不自编是对的，但"17 类里没有对应项"的结论是被错引推出来的，不成立。改法二选一，主会话定：（a）登 fac_clinic（体例同其余九个，basis 引上述设计数据）并给药草院写 fac_clinic，改 start-buildings.json basis、_vocab.json、data-d.test 的 TYPE_OF 与"药草院不写"用例、问题.md、回报；（b）不登，则把理由改成"旧数据只有名称、无用途字段；设计数据 seasonal-hazards.mjs:199 指向诊所类，fac_clinic 本卡未登"，不再引 :499–693。同批更正问题.md 第三节和第四节第 8 条（快照已由主会话补，不再是待办）。注意：无 intendedType 的试玩地区建筑行整体加载仍报 E-DIM-REQUIRED-MISSING，选（a）才让试玩地区 19 栋全有值。

**3 卷六 1123k50——过；visibleToMarket 须李白（低影响）。**
- spendable 取真：卷文可推。卷六 :2006 说用 `spendable` 假表达"谁都动不了"，已登记的 spendable 假各行（:1028–1031、unmaterialized）都是专用分区；卷八 :220 的 `salary.fromPurpose` 要指一个能付钱的分区；卷八 :1371 又说公库缺省分区的 trackOutflow 为假。所以缺省公库分区取真是推得出的，不是自补。
- visibleToMarket 取假：卷六 :384 规则 10 只规定 `stockIn` 数 visibleToMarket 为真的分区，没规定公库货算不算市场可见；写者已标"暂定·须李白核"。这一列推不出，判须李白；影响限于库存口径与覆盖天数报告，不挡 A 卡。
- purpose_escrow 是否本卡该登：该登。卡文第 3 条明写"escrow 引卷六 :1031 现成一条"，卷八 :328 要求 `polity.roles.purposes` 含 general 与 escrow，:1371 说托管分区引卷六已登记的那条；四列与卷六 :1031 逐字一致（假、空、假、假）。transit/custody/consign 不登符合"只登需要的"。过。

**4 卷十 1123k51 genOpen——过（建议补一句）。**
- 现状：卷十 :140–149 的其余 gen.* 维度（speciesWeights、faithWeights、seatCulture、share 等）在 world/ 表头里一个都还没登记（grep 无命中），所以没有"现有 gen.* 的处理方式"可照，genOpen 是第一个。
- 为何带点键不行：卷二 :285 写明维度键文法 `^[a-z][a-zA-Z0-9]{0,47}$`（docs/审查/5-1-DS只核-1118.md:39 同引），types.mjs:13 KEY_RE 与 dimensions-validate.mjs:648 的表头维度键检查按它拒带点键（E-DIM-ID-FORMAT）。material.json 的 `density.solid` 是 cellGrades 里的格级键，不是表头维度键，不能作先例。改加载器放宽键名会牵动卷二文法，属跨卷，不在数据卡内做，写者在勘误里也写了。
- 改名合"跨卷共用定义只一处"：定义仍只在卷十 §2.2，勘误一句话规定"登记在表头时键名取驼峰平铺，下表与正文里的 gen.<名> 都按此读"，一次覆盖全部 gen.*，将来其余维度照此登记，不会一个一改。写者举的先例 `rules.gen.layout.coverage`→`layoutCoverage` 是规则表键、机制不同，类比偏弱，但结论不依赖它。
- 建议（不挡合入）：卷五 :193 有一行 `gen.open`（来源写卷十 §2.2）、卷四 G-2 :1085、卷二十九读者引用也写 `gen.open`，请在 1123k51 的读者栏补一句"卷五 :193、卷四、卷二十九引用 gen.open 者按 genOpen 读"。
- 勘误内容核实：1123k51 保留含义、取值域、缺失处置（gap，取 runtimeOpen）；:971 "作者已给的不覆盖"允许作者手写 true，所以 gen-open.json 手写河湾村合卷十。

**5 勘误流程——过。**
- 勘误行 1123k50（卷六 §2.2 表后修订表末行）与 1123k51（卷十 1123k32 段之后、附录之前）都在表末追加，文字写明"改前快照 版本快照/卷六-v10-勘误前-1123k50.md"与"版本快照/卷十-v3-勘误前-1123k51.md"；不升版本号；历史修订记录不回改。
- 快照实核：`git hash-object` 两份快照分别等于 29cbd904a 里卷六 a57a30669、卷十 aeb68257e 的 blob，即改前原文，无误。

**6 卡文没点名的文件——都是正当跟改，没有放宽断言。**
- 8 个夹具文件（blueprint-view、bubble-world、cave-view、grid-diff、perceive-world、place-footprint、place-footprint-columns、route-edges）：我读了逐行 diff，每处只是在建筑行夹具里加 `intendedType: 'fac_house'`，这是 intendedType 登记为 byClass:comp_facility 必填后夹具用真实表头所必需，断言一字未动。
- gen-siteform.test：起始地区用例给作者行带上 intendedType（否则 shrine 行 whenRX 选不中，河湾石坛会走通用面积行撑破 shrine 上限）；仍是真实形制上限下的排得下断言，没降。
- gen-worldgen.test：原断言"海没有规则行→water_rule_missing"依赖当时数据缺行；现海湖有行，改为每个水体行 reason 恒为 footprint_unknown（比原来的条件式更严），并保留 `waterIds` 全等断言；water_rule_missing 路径仍由 gen-water.test:89、:139 的夹具守，没丢覆盖。尾部 `waterGaps.length > 0` 较松，但前面已有 deepEqual 全集，可接受。
- ledger.test：purpose 族期望由 1 项改 3 项，随数据变，字面量列全，合规。
- tools/convert-geo-g5b.mjs：intendedType、gen-open.json 的读取是必需接点；`errorText` 按维度分组是报告输出的小改，不影响数据与校验，略超范围但无害；湖的 basis 文字只是注释性改写。
- start-buildings.json、worldgen.json：数据本身，应改。
- 新测试 data-d.test.mjs 的期望值是卷文/设定手算的字面量（80,370、5、对应表），不抄读数，合卡头第二节 4。

**7 写者列的须李白 8 条——逐条判。**
1. 设施类型登在哪：真须李白。卷十九 :164、卷二 §5.7 :1867 写成实体表，`_unbuilt-derived.json:166` 登实体 kind 前缀 `facility_`，已合代码和本卡按词表族前缀 `fac_`；place 表 intendedType 的 type 与卷文 `ref facility_type` 写法不同（见第 2 项）。要么改读者建实体表，要么卷二、卷十九勘误，跨卷。
2. 形制补缺不按面积和用途筛：**这是 G5b 已合代码（siteform.mjs 补缺候选，卷十 R10-7.12 勘误 1123k31）的缺陷，D 卡加第二个有顶形制后才暴露**——此前登记里只有一个形制，补缺必取它；现在公仓（无 form）按种子在两个形制里取，取到 shrine 就因通用面积行 16–64 m² 超外包上限 E-GEN-ROW-INVALID，换种子即崩；将来 326 栋补了 intendedType 后会大面积触发。卷十九 :637 ③ 已写明"按入参（面积、层数、墙厚）算出的蓝图可行才留"，方向卷文可推；但 R10-7.12 先补 form 再按 form 取面积，次序与 :637 ③ 循环，打破它要改次序或让 bldfill 行不读形制字段，是设计决定。判：须李白（或 Opus 定方案）；挂在新开的 siteform 补缺小卡（与 B 卡同改 siteform.mjs/layout.mjs，可并入 B，也可独立），必须在 326 栋补 intendedType 之前、真实世界整体加载之前完成；PLAN 要登记，别丢。建议升 Opus 核这一条。本卡为 fac_shrine 加的第二行 bldfill（按 intendedType 分行，卷十 :186 本就规定 whenRX 读 intendedType，不是按 id）可以接受，只是绕过而非根治。
3. purpose_general 两列：spendable 卷文可推（第 3 项）；visibleToMarket 真须李白（低影响）。
4. 海深单位：真须李白（第 1 项）。
5. water_lake 的 navigable、灰盐池液体：真须李白。water 族条目是类级，两湖同值，要分要拆条目；材料表无卤水属材料表缺口。不挡。
6. 两湖 downstream：不须李白。卷五 :149 `downstream` 是 `ref place nullable`，空表示没有下游，作者显式写 null 本来就合法；"生成补缺写回的空值整体加载仍判缺"是写回器或加载必填判对 null 的处理问题（代码缺陷），归整体加载那一卡修，不需裁定。
7. openRX、runtimeOpen 无值，出生地只写河湾村：真须李白（哪些地点对玩家开放是设计取值，卷十 :194–195 只给类型）。另注：卷十 :981 的体例是"作者给几处隐藏地点为假、其余由 openRX 求"，本卡反过来只写一处为真，是无 openRX 时的权宜，须随 openRX 定值时一并收口。
8. 快照：已由主会话补，不再待办，问题.md 该条应删。

**8 世界内容与屏蔽表——过。**
本卡世界内容只写在 world/（gen-open.json、start-buildings.json、worldgen.json、place.json、_vocab.json）；对 blocklist.zh.json 的全部词（除"李白"外）grep 这五个文件为 0 命中；"李白"出现在 basis 的裁定出处里，与同文件既有写法（access 族 basis "李白 11-19 20:3x ②"）一致，不是世界内容。

## 汇总

必须改（1）：药草院"对不上"的理由是错引（locations.json:499–693 不属药草院），设计数据 seasonal-hazards.mjs:199 等指向诊所类；改为登 fac_clinic 并写值，或更正理由；同批更正问题.md 第 8 条已过期。
真须李白（6）：设施类型表在词表族还是实体表；形制补缺的面积与用途适用关系及次序循环（建议升 Opus）；purpose_general.visibleToMarket；capacityL 整升单位与深海；两湖 navigable 与灰盐池卤水；openRX、runtimeOpen 取值与出生地范围。
卷文可推（不须李白）：purpose_general.spendable；downstream 显式 null 合法，写回器对 null 的处理另挂整体加载卡。

## 第二轮（只核第 1 轮的 1 条必须改与 1 条建议；写者提交 176b407a2，diff 06566a20d..176b407a2；未跑全量）

结论：过。

1. 药草院登 fac_clinic：过。
- 依据站得住：seasonal-hazards.mjs:199 的"请药师治疗"措施地点即 bld_hw_herbs（第 1 轮已读到）；economy-foundation.mjs:57 药草存放在 bld_hw_herbs（核对属实）；a3-owner2-w.mjs:69 药铺学徒所属 bld_hw_herbs（核对属实）。错引的 :499–693 已从 start-buildings.json basis、问题.md 删去，改引 locations.json:444–457（药草院一条只有名称、坐标、开放时段，与我读到的一致）。没有自编：是设计数据加首批 17 类里已有的 fac_clinic（卷二 :1867）。
- fac_clinic 体例与其余九个一致：functionNeeds 空 map、maxSkyExposure 与 maxAperture 显式 null、accessDefault 取 access_public（rank 0，合卷五 :1182）、basis 写出处与未写列，标暂定·待试玩标定。
- 跟改正当：data-d.test 的 TYPE_OF 加药草院、用例改为"19 栋都写了设施类型"，断言更严；原"药草院不写"的反向断言去掉是因事实已变，不是放宽。start-buildings.json 药草院行 intendedType 由 null 改 fac_clinic，basis 的"9 个"改"10 个"。
- 问题.md 更正照实：第二节"登了 10 个、未登 7 个"（去掉 fac_clinic，数对）；第三节改为"没有对不上的建筑"并点明原稿错引、改引设计数据；第四节第 8 条改"已办"。

2. 卷十 1123k51 读者栏一句：过，准确。逐处核实：卷五 :193 有 `gen.open` 一行；卷四 G-2 :1085 写"开放范围是 place 的静态维度 gen.open"；卷二十九 :42、:661、:882、:939 都读 `gen.open`。勘误仍在表末，未升版本，改前快照不受影响。

未发现新问题。
