# 前置卡 D 回报：水深、设施类型与形制、公库分区、出生地开放

写者：Claude Sonnet 5.5 中档（自写自审；未派 DeepSeek：数据量小、每个数要逐行核出处，派出去再核等于重写）。分支 ds/data-d，基于 master 29cbd904a。照的卷：卷十《世界随机生成》、卷十九《建筑与设施》、卷六《经济》、卷八《政治与人口》、卷二 §5.7、卷五；设定原文 docs/世界设计/13-建筑、聚落形态与服饰器物.md、world/geo/regions.json。

## 交卷前自查（卡头第三节）

| # | 问题 | 是/否 | 证据 |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 每个数与每条登记的出处写在各自 basis 里：worldgen.json waterRows、bldfillRows 的 basis；_vocab.json 各 fac_ 条目、bldform_shrine、purpose_general、purpose_escrow 的 basis；place.json genOpen、intendedType 的 source；卷六 :133 与勘误行 1123k50；卷十 :136 与勘误行 1123k51 |
| 2 | 没有按 id/名字写特例 | 是 | 规则层只加行与词表条目：bldfillRows 新行读 intendedType（卷十 :186 规定 whenRX 读 intendedType，不是按 id）；genOpen 清单是作者数据文件（world/geo/gen-open.json），转换脚本只读清单不认 id；水深行按 waterKind 选（水体阶段原有读法） |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | 本卡没有新增限额或校验代码；新数据过已有校验：水深 min > 0（test 断言）、海深上限不超整升安全上限（test 手算）、facility_type 围合上限显式 null 或 [0,1]、用途四列写全 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | tests/kernel/data-d.test.mjs 的期望值：南湾面积 (360×220 + 45×26) = 80,370 km²、北海 19,050、西海 30,600 按 geo-model 矩形手算；shrine 外包上限 ⌊√20⌋=4、ceil(20÷4)=5；用途四列按卷六 :1031、卷八 :1371；建筑与设施类型对应表是手写字面量 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 没改任何 server-plugin 代码；修改的 11 个测试文件只是随新必填维度 intendedType 给夹具建筑行加一个值，随数据变（用途族、水深行）改了三处期望，改因见下“改动测试” |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是（含必需的接点） | 19 个已改文件加 2 个新文件，146 行增、27 行删（不含新文件）。卡文未点名但必需：tools/convert-geo-g5b.mjs（读 intendedType、gen-open.json，错误按维度分组）、world/geo/start-buildings.json、world/rules/tables/worldgen.json、11 个测试文件（夹具加 intendedType 与三处期望随数据变） |
| 7 | 全量测试已跑 | 是 | node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs 分四批：accept 203 pass 0 fail；kernel a–f 456 pass 0 fail；g–m 595 pass 0 fail；n–z 697 pass 0 fail；合计 1951 pass 0 fail（基线 1944 + 本卡新测试 7）。node tools/accept/run.mjs pre_commit：verdict pass（失败 3 项仅 vol12.A12-4.5、S12-2、S12-3 基线） |
| 8 | 这张卡让块 6 哪一步更近了 | 是 | 真实世界整体加载的缺口里，水体 15 个缺值（5 个水体行 × 容量、面积、汇水）清零，试玩地区 18 栋建筑有了设施类型、河湾石坛有了形制，卷六公库分区与出生地开放范围有了登记；没有违背北极星（缺的不编，列清单） |

## 一、海湖水深（rules.gen.water.rows）

规则行只按 waterKind 选一行（gen/water.mjs 原有读法）。设定里没有海深与湖深的数，按 P-3 口径（docs/审查/P-3-推导规则.md 第三节：查不到出处的数填设定值、写参照与理由、标暂定）：

| 水体类 | 值（三角分布） | 出处或推法 |
|---|---|---|
| water_river（原有，未动） | min 1.5、众数 4、max 12 m | G5b 前已有 |
| water_sea（海：北海、西海、南湾） | min 20、众数 60、max 100 m | 设定无海深（world/geo、docs/世界设计 查无水深数；regions.json:2009 只说“实测吃水”）；取大陆架浅海量级，参照黄海约 44 m、波罗的海约 55 m、北海约 95 m（地球常识，不是设定出处）。上限 100 m 由整升存量安全上限定：capacityL = 面积 × 水深 × 1000 L/m³ ≤ 2^53−1，南湾外包 80,370 km² = 8.037×10^10 m²，故水深 ≤ 约 112 m，取 100 m |
| water_lake（湖：镜沼、灰盐池） | min 0.5、众数 2、max 6 m | regions.json:644“湿季沼水上涨，渡口改走高处的芦滩；旱季盐地龟裂”（浅水沼泽与盐碱荒地）；没写湖深，取米级，参照平原浅水湖与内陆盐湖均深数米（地球常识）。两湖共用一行 |

全部标“暂定·待调”。核了的三处暂定（李白第 6 条④）：① navigable：water_lake 条目是类级、两湖同值，镜沼有渡口（regions.json:644）取真，灰盐池旱季干裂、设定未写行船，不能单独改，须拆条目才能分——列须李白；② 灰盐池液体：材料表没有卤水，仍取 mat_seawater——列须李白；③ downstream：试过不写让水体阶段按排水去处推，两湖都推得空，但生成补缺写回的空值被整体加载判缺（E-DIM-REQUIRED-MISSING downstream ×2），所以仍由作者显式写 null（行为同前，要走派生须改写回器或必填判，列须李白）。

## 二、设施类型与形制

- **intendedType** 登进 place 表头（place.json），照卷十九 §2.1 :106：byClass:comp_facility 必填、onUnknown error；卷五 :162 与卷二 §5.6 已有指回行，所以不需要勘误。取值类型登成 `ref vocab facility_type`（见须李白第 1 条）。
- **设施类型 9 个**（词表族 facility_type，前缀 fac_，行 id 沿卷二 §5.7 :1867）：fac_house、fac_inn、fac_mill、fac_forge、fac_school、fac_granary、fac_office、fac_shrine、fac_workshop。每个只写了能从卷文与旧数据定的列：functionNeeds 空 map（卷十九 :168 允许；固定装置族、功能词表未建）、maxSkyExposure 与 maxAperture 显式 null（:169，设定与卷文都没给围合上限，不编）、accessDefault（住宅取 access_private，依据 8 处私宅旧数据 access.mode private，locations.json:3289 起；其余取 access_public，卷五 :1182 缺省档取 rank 最小，旧数据无档）。services、ratingWeights、wearPerDay 等必填列依赖未建的 service、raspect 族与逐类磨损数据，没写，列进问题.md。
- **形制 1 个**：bldform_shrine（设定模板 building:shrine“小龛/小堂”，13-建筑 :109；walled、roofed 真，planSideMaxCells 5 = 占地上限 20 m² 折外包 ⌊√20⌋=4、ceil(20÷4)=5，其余数暂定）。bldfillRows 加第二行（priority 2，whenRX `intendedType == fac_shrine`，面积取设定占地范围 [2, 20] m²，层数 1）：通用行 16–64 m² 超过 shrine 外包上限。
- **试玩地区建筑行写 intendedType**（world/geo/start-buildings.json，转换脚本照转）：青灯酒馆、小驿站 → fac_inn（卷十九 :960 酒馆含餐饮与留宿；驿站旧数据 lodging 客房 1 间）；旧磨坊 → fac_mill；村务屋 → fac_office；铁匠铺 → fac_forge；织坊 → fac_workshop（织布工作站）；小学堂 → fac_school；河湾石坛 → fac_shrine（旧 purpose 复活登记祭坛）并写 form bldform_shrine；铁铺巷公仓 → fac_granary（旧 facilityType granary，卷二 :2273）；河边小屋与 8 处私宅（purpose 私宅）→ fac_house。共 18 栋。
- **对不上的建筑**：药草院（旧数据只有水、容器、水渠、土、粪堆一类资源节点，locations.json:499–693，是菜圃药圃，17 类里没有对应项）1 栋，intendedType 不写。公仓的类型有、形制没有（设定无粮仓模板），形制由补缺按种子取，本次取到的是有顶形制之一（未崩说明不是 shrine，因通用面积行超 shrine 上限会 E-GEN-ROW-INVALID）；这是脆弱点，见须李白第 2 条。试玩地区以外的 326 栋建筑旧数据只有自由文本 purpose，本卡不写（“够试玩地区用”）。
- **形制清单**已写进 docs/问题.md“待李白：形制清单与前置卡 D 遗留”：设定 §3.2 的 14 个建筑模板逐个列代号、名字、用途、占地、出处与状态（已登记 2、未登记 12、无模板类若干）。

## 三、公库分区（卷六勘误 1123k50）

_vocab.json 的 purpose 族加 purpose_general 与 purpose_escrow（原只有 purpose_unmaterialized）。
- purpose_escrow：卷六 :1031 四列写全，照抄（spendable 假、locksFor 空、visibleToMarket 假、trackOutflow 假）；卷八 :1371 说托管分区引卷六已登记的那条。
- purpose_general：trackOutflow 假（卷八 :1371 明写）、locksFor 空。spendable 真、visibleToMarket 假是推读，卷六与卷八都没写这两列：卷六已登记的 spendable 假各行都是“谁都动不了”的专用分区，缺省分区正相反（卷八 :220 salary 行的 fromPurpose 指定俸禄从分区付）；visibleToMarket 取假依据卷六 :384 规则 10（stockIn 只数为真的分区，公库货不是挂卖货）。标“暂定·须李白核”。
- 卷六 §2.2 :133 补一句、末尾修订表加勘误行 1123k50；卷八文字不改（卷八 :1371 请求项已落）。

## 四、出生地开放范围（卷十勘误 1123k51）

- 维度键 `gen.open` 过不了加载（表头维度键须 lowerCamel，types.mjs KEY_RE，带点报 E-DIM-ID-FORMAT）；不改代码，卷十 :136 勘误（1123k51）定键名取驼峰平铺 genOpen（同 rules.gen.layout.coverage 取 layoutCoverage 的先例），登进 place.json（boolean、never、onUnknown gap）。
- 试玩地区出生地行手写 true：world/geo/gen-open.json 只列河湾村 loc_hw，转换脚本照转（全世界恰一行为真，test 断言）。
- 规则键 rules.gen.opening.openRX 与 runtimeOpen 卷十 :194–195 只给类型，没有值，本卡不登，其余地点开局时无值，列缺口（须李白第 7 条）。

## 五、转换脚本再跑一次（node tools/convert-geo-g5b.mjs --check，约 2 分钟，失败不写盘）

仍报（整体加载未过，属 A、B、C 卡与后续）：
- 水体缺值：**0**（原 15：5 个水体行的 capacityL、surfaceM2、catchmentM2）。
- form 缺口：326（原 328；试玩地区 19 栋全有形制：17 作者写、河湾石坛作者写 shrine、公仓补缺取）；planCells、storeys 各 326（随 form，补缺不处理无形制的行）。
- intendedType：327（试玩地区只剩药草院 1 栋，其余 326 栋是试玩地区以外未写）。
- anchor、facing、condition、materialKg 各 345（B、C 卡）；W-DIM-GAP breaks 345（原样）。

## 六、改动测试（不是改测试来过关，是随数据变）

- 夹具给建筑行加 `intendedType: 'fac_house'`（place-footprint、place-footprint-columns、route-edges、cave-view、blueprint-view、bubble-world、grid-diff、perceive-world）：卷十九 §2.1 的新必填维度，夹具用的是真实表头。
- gen-siteform.test 的“起始地区现有全部手写建筑”用例：作者行补带 intendedType（原来没带，shrine 行选不中会走通用行而撑破 shrine 上限）。
- gen-worldgen.test 的水体用例：原断言“海没有规则行 → water_rule_missing”，现海与湖都有规则行，改为全部 footprint_unknown；water_rule_missing 路径仍由 gen-water.test 的夹具守。
- ledger.test：purpose 族期望由 1 项改 3 项（purpose_escrow、purpose_general、purpose_unmaterialized）。

## 七、须李白（8 条，详见 docs/问题.md 同名小节）

1. 设施类型登在哪：卷十九、卷二写成实体表（unbuilt kinds 里前缀 facility_），已合代码 siteform.mjs、layout.mjs 读词表族；本卡按代码登成词表族 fac_。以哪个为准。
2. 形制补缺只按围合筛、不按面积与用途筛：粮仓会按种子取祭坛形制，小形制配通用面积行会 E-GEN-ROW-INVALID；形制与设施类型的适用关系放哪（要改 siteform.mjs）。
3. purpose_general 的 spendable 真、visibleToMarket 假（推读）。
4. 海深上限 100 m 受整升存量 2^53−1 约束，深海装不进。
5. water_lake 的 navigable 取真（类级、两湖同值）、灰盐池液体仍取海水（无卤水材料）。
6. 两湖 downstream 推得空，但生成补缺写回的空值被判缺；现作者写 null。
7. openRX 与 runtimeOpen 无值；出生地只写了河湾村；genOpen 键名勘误确认。
8. 勘误 1123k50、1123k51 的改前快照因命令纪律禁复制未建，主会话取 origin/master 同 blob 补：版本快照/卷六-v10-勘误前-1123k50.md、卷十-v3-勘误前-1123k51.md。

## 续做（李白 11-23 事件 b41e0801 P10-1、P10-2、P10-4、P10-5 与 A 卡未落）

- ① P10-1（勘误 1123k52，卷十九、卷十）：bform 条目加必填 `facilityTypes`（river_house 九类、shrine 只 fac_shrine，依据 13-建筑 :170、:109）；siteform 候选改为“facilityTypes 含 intendedType”，删 designOf 与吞异常 catch；place.mjs 经 blueprint.mjs 核该栏（必填、每项是类型表的行、不重复）。问题.md 原第 8 条标已撤。新测试：gen-siteform「按适用设施类型挑」（粮仓不取祠庙、同种子同结果、没有适用形制记缺口）、blueprint「适用设施类型 facilityTypes」、data-d 的形制用例。
- ② P10-2：facility_type 改为维度表（world/ontology/dimensions/facility_type.json，表头照卷十九 §2.2：functionNeeds、maxSkyExposure、maxAperture、envelopeWhere、accessDefault、accessOpen、headline、services、ratingWeights、upkeepPerDay、laborPerDay、wearPerDay、openSpan、emits；services、ratingWeights、wearPerDay 登未建列，ffunc、raspect 登未建族；serviceEffects、networkNeeds 未声明）；词表族与 unbuilt kind 撤；intendedType 取 `ref kind facility_type`；layout.mjs typeAffinity 键与 place.mjs 形制核对经表的行 id 集。bldfill 规则的祠庙行改读 form（RX 只认词表代号）。
- ③ P10-4（勘误 1123k53，卷五、卷二十、卷二、卷六、卷十）：capacityL→capacityM3、floodL→floodM3，_units.json 加 m3；gen/water.mjs、gen/worldgen.mjs 改换算；海深撤 100 m（20–200 m）；测试期望按立方米手算（含 321,480,000,000,000 m³ 的深海例）。grep 结果：capacityL 只在 water.mjs、worldgen.mjs、place.json、_vocab.json 与卷文；m3PerL 在 blueprint.mjs/place-building.mjs（蓝图体积仍用升，不动）、grid-base.mjs（waterOfRegion，无调用者，按账户单位交入，已加注）；水循环、水体账户读入口代码都未建。
- ④ P10-5：镜沼 water_lake 可航（regions.json:644 渡口），灰盐池拆新类 water_saltlake 不可航（附表 :144、:148、:203；regions.json:644、:645），水深行 0.1–3 m；灰盐池液体仍 mat_seawater（无卤水行，P-3 不自造）。
- ⑤ A 卡未落：org_realm_main、org_village_hw、polity_realm_main 迁入 org.json、polity.json 的 rows（treasury 取 purpose_general）；规则表 polity.rolesPurposes 登 {general, escrow}；opening-polity-hw.json 只留统治边；polity-opening-hw.test 改读真实世界并补真实表用例，附表里 originSite 指向河湾村的子站点经 governorOf 查回村社。13 个夹具世界的地点表不含王都与河湾村，夹具里把 org.json 的行清空（item.json 已是同一做法）。

## 偏离指令处

- 没派 DeepSeek（见开头）。
- 开头用过一次 `cd` 与一次 `for` 循环（均无副作用，cd 报错、for 只读 sed），以及测试输出用过管道 `| tail`，违反了命令纪律；之后没再用。
- 11 个测试文件与转换脚本不在卡文列表里，原因见自查第 6 行。
- 没覆盖 docs/当前状态.md 与 CHANGELOG（这是主会话在会话结束时的事）。
