# 卡回报：设施类型数据续做（李白 11-24 S6-2、S6-6 裁定落实）

写者：Claude Sonnet 5.5 中档。分支 ds/building-types-2，基于 origin/master（含 54c8c36、fca1b7438）。照的卷：卷十九 §2.2（设施类型表头）、卷十九 1123k52（形制适用设施类型 facilityTypes）；裁定原文 docs/审查/李白裁定-1117.md:1655（S6-2）、:1659（S6-6）。未派 DeepSeek：70 栋的去向由李白裁定的归法和卡文逐类给定，是机械落实，派出去再核等于重写。

## 交卷前自查（卡头第三节）

| # | 问题 | 是/否 | 证据 |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 裁定原句 docs/审查/李白裁定-1117.md:1655、:1659；每行 intendedBasis 以“李白 11-24 事件 e6937a77 第②条裁定 S6-2（…:1655）”开头并以“依据：world/geo/locations.json:行号”结尾；新三行 basis 写卷十九 :168–173、卷五 :1182、13-建筑 :76–106 |
| 2 | 没有按 id/名字写特例 | 是 | 归法是李白按类给的（住区、议事处、值房等 12 条归类），数据按类归，不是改规则代码；未改任何代码；bform 只是把新类型加进既有形制的 facilityTypes |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | 无新增限额或校验代码；新类型 maxSkyExposure、maxAperture 显式写 null（卷十九 :169 要求每行必写） |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | building-types.test.mjs 新两条：三类在表里且列同已有行、每栋建筑行都有 intendedType、挑不到形制的类型恰为露天场地（卡文要求明确列出）；无计数断言 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 缺值下降全来自新写的作者数据；露天场地的 18 栋没有硬塞形制 |
| 6 | 只改了卡文列出的文件；diff 共 458 行增、7 行删（不含本回报） | 是 | 改：world/geo/building-classes.json、world/ontology/dimensions/facility_type.json、world/ontology/dimensions/_vocab.json（bldform_river_house 的 facilityTypes 与 basis）、docs/问题.md、tests/kernel/building-types.test.mjs；新增 docs/卡回报/building-types-2.md |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs：tests 2049 pass 2049 fail 0；pre_commit verdict pass |
| 8 | 这张卡让块 6 哪一步更近了，且没有违背北极星 | 是 | 真实世界 345 栋建筑全部有设施类型，补缺能给 327 栋挑到形制（原 256）；挑不到形制的 18 栋露天场地如实列出，没有硬塞 |

## 70 栋去向

| 去向 | 栋数 | 说明 |
|---|---|---|
| fac_house 私宅 | 16 | 住区（李白 S6-2） |
| fac_office 官署 | 11 | 镇巡值房、街议厅、验秤房（李白点名）；议事处六处（李白并入）；船户会屋、商旅行会联络处（最近归，待核） |
| fac_forge 铁匠铺 | 1 | site_ms_ll_forge 共炉（带铁工，李白点名） |
| fac_common_kitchen 共用灶房（新登） | 6 | 四处村共灶屋、共灶厅、候饭灶 |
| fac_trading_post 交易点（新登） | 11 | 河埠交接棚、南市棚、麦饼铺、车行、公秤台与六处入口换货点 |
| fac_workshop 作坊 | 4 | 四处检看场地院（最近归，待核） |
| fac_granary 粮仓 | 3 | 栈西货栈、灰棚公货柜、收夹洞（最近归，待核） |
| fac_open_ground 露天场地（新登） | 18 | 圃地 4、葬地 4、沟渠与场地 8、城墙与城门 2（其中菌床洞、通风井、矿口、城墙、城门为最近归，待核） |

逐栋清单（id、名字、归到哪、理由）在 docs/问题.md“已裁（11-24 S6-2）”节与 building-classes.json 各行 intendedBasis；其中“最近归（待核）”共 14 栋：船户会屋、商旅行会联络处、4 处院、栈西货栈、灰棚公货柜、收夹洞、菌床洞、通风井、矿口、城墙、城门。

## 新登三类设施类型（world/ontology/dimensions/facility_type.json）

fac_trading_post（交易点）、fac_open_ground（露天场地）、fac_common_kitchen（共用灶房）。字段同已有十类：functionNeeds 空 map、maxSkyExposure 与 maxAperture 显式 null、accessDefault access_public，basis 写出处并标“卷文没给的值·出处空缺·待试玩标定”。交易点、共用灶房加进 bldform_river_house 的 facilityTypes（13-建筑 :170 已有建筑一律此形制；:76–83 uses 含 hall、shop_front）；露天场地不加：现有形制都有墙有顶，不硬塞。

## 验收

- 转换脚本 node tools/convert-geo-g5b.mjs --check：**整体仍未通过**。intendedType 缺 0（原 70）；form 缺 18（正是 18 栋露天场地，gstage_siteform/form_type_unmatched ×18）；planCells、storeys 随 form 缺 18；materialKg 缺 18；anchor、facing 缺 37（补缺遗留，不属本卡）。
- node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs：tests 2049、pass 2049、fail 0。
- node tools/accept/run.mjs pre_commit（不带 --write）：verdict pass；失败 3 项仅 vol12.A12-4.5、S12-2、S12-3 基线。

## 续做（主会话 11-24：露天形制与 37 栋落位缺口）

- **露天形制 bldform_open_yard**（_vocab.json 的 bform 族）：walled 假、roofed 假、deck 假、storeyBase 0、aspect 1、windowEvery 0、wallThicknessDefaultM 0.4、wallThicknessMinM 0.4（walled 假没有墙厚维度，取缺省占位）、planSideMaxCells 18、rooms 空、facilityTypes 仅 fac_open_ground；均无设定出处，标暂定。defaultMaterials 是必填且要过物性校验（卷十九 §2.4、1123k60），无墙无顶没有对应写法，取同 river_house 一组只为过校验：蓝图没有外墙、屋面、承托元，三角色体积为 0，开局 materialKg 得空映射、wallFlowKg 空映射（envelope.mjs 与 wall-flow.mjs 原样处理，不改代码）。worldgen.json bldfillRows 加第三行（form == bldform_open_yard，面积 16–64、层数 1）。
- **转换结果**：form、planCells、storeys、materialKg 缺 0；anchor、facing 缺 19（原 37）；W-DIM-GAP breaks 345（警告，原样）；整体仍未通过，只剩 anchor、facing 19 栋。
- **37 栋分组**：缺形制 18（已清零）；父行是建筑行 19（16 个住区建筑行下的私宅，如 bld_ms_gs_01、bld_ms_hx_01、bld_ms_ll_home_01）。后者是落位只排站点下直挂建筑（gen/siteform.mjs:260）的卷文与代码缺口，数据解不了（手写 anchor 要编位置），已写进 docs/问题.md“落位缺口”节，两条出路待李白定（住区改站点 或 补建筑下建筑的落位规则）；没改 B 卡代码。
- 新用例：tests/kernel/building-types.test.mjs 露天形制一条（开关、只适用露天场地、36 m² 手算外包 6×6、蓝图围护各角色体积 0，且 loadWorld 通过）；“每类设施都能挑到形制”改为无例外。
- 已 git merge origin/master（无冲突）。续做后：node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs tests 2050、pass 2050、fail 0（8 个夹具文件的 bform 族里补带 bldform_open_yard，因真实 bldfill 规则行读它，同 shrine 先例）；pre_commit verdict pass（只 vol12 三项基线失败；曾误带一个多余参数跑过一次，结果同）。

## 续做二（李白 11-22 回 1122-1125 取③：19 栋私宅改挂营地站点）

- **住区改站点试做已回退**（空提交记一笔）：试做时 14 处种子在父站点足迹外、2 处同区格；子站点改挂重推后仍剩 8 处同区格种子。原因：同营地窟棚相距数米、区格 100 m。数据没有提交过，回到试做之前。
- **改挂（tools/convert-geo-g5b.mjs，一条规则，不按 id）**：建筑行的旧父是建筑行时，沿旧父链改挂到第一个非建筑行，原父写进 originSite（复用勘误 1123k32 字段；校验是 kind place，建筑行也收，没放宽）。19 栋私宅直挂营地站点（loc_ms_huipeng、huixi、lielu、taideng、tanjie、yugen），住区行仍是建筑行。
- **转换结果**：node tools/convert-geo-g5b.mjs 整体加载通过，补缺缺口只剩 room_rows_unbuilt 324、storeys_max_unchecked 345、polity 1；intendedType、form、planCells、storeys、materialKg、anchor、facing 缺值全 0；breaks 警告 345 原样。**place.json 转换脚本换了（约 33 万行），但没有提交**：带 anchor 的完整 place.json 让加载器自己过不了（world.mjs :163 的 checkPlaceTable 先于 :190 的 installNamedStructs，报 struct:pos 未装），连转换脚本下一次 fillPlace 的 loadWorld 都失败，已 git checkout 回原样；写进 docs/问题.md 缺口二，等加载器接线后重跑入库。
- **新测试**（tests/kernel/building-types.test.mjs）：“父行是建筑行的建筑：转换后改挂到第一个非建筑祖先、原父记 originSite；这 19 栋逐栋核…”（19 栋期望从旧数据逐栋列成字面量，规则按父行是建筑认）；“19 栋住区下的私宅都落了位：真实世界整段补缺后每栋 anchor、facing 都有，不在补缺缺口里”（跑完整补缺约两分钟）。
- **缺口一**（留给设计统一时定，没改设计书）：卷五 §4.1 规则 3 与卷十 R10-7.1 没写住区是站点还是建筑、也没写建筑下的建筑，见 docs/问题.md 落位缺口节。

- 验收（续做二）：node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs tests 2074、pass 2074、fail 0；pre_commit verdict pass（仅 vol12 三项基线）。另改了 tests/kernel/geo-g5b-data.test.mjs 一条断言：原“清单之外没有 originSite”改为“非建筑行的 originSite 恰为子站点清单；建筑行的 originSite 指向建筑行”（19 栋家户是新规则的产出，不放宽对站点行的核）。

## 偏离指令处

- 数据文件由 F:/dnd-tmp/apply-btypes2.mjs（Write 写的脚本）写盘，不是手敲；脚本核：待归类的 70 栋恰是五批清单里还没类型的那 70 栋，无重复、无遗漏。
- 没用 cd、管道、重定向；全量测试被运行环境自动转后台（非我开的后台任务）。
