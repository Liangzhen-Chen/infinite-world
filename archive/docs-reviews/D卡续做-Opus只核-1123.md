# 前置卡 D 续做 Opus 只核（第 1 轮）

- 复核者：Claude Opus 5.5 中档；只核，不改代码。
- 对象：分支 ds/data-d 写者提交 2e53eac7a（相对合并点 9c857cc94，只看写者自己的改动；A、B 两卡经 9c857cc94 合入，不在本核范围）。
- 依据：李白裁定 docs/审查/李白裁定-1117.md :1628–:1632（P10-1～P10-5）；写者回报 docs/卡回报/data-d.md 末节“续做”。
- 本机跑过：`node --test tests/kernel/gen-siteform.test.mjs tests/kernel/gen-water.test.mjs tests/kernel/polity-opening-hw.test.mjs tests/kernel/data-d.test.mjs tests/kernel/blueprint.test.mjs tests/kernel/blueprint-view.test.mjs tests/kernel/layout-templates.test.mjs tests/kernel/gen-water-grid.test.mjs` → tests 105 pass 105 fail 0；`node tools/accept/run.mjs pre_commit`（不带 --write）→ verdict pass，items fail 3 只有 vol12.A12-4.5、S12-2、S12-3 三项基线。全量未跑（卡文不许）。
- 勘误前快照：六份快照的 blob 与 9c857cc94 上对应卷逐一相同（git ls-tree 核对：卷二 352c52bf6、卷二十 ba09062b9、卷五 2d1ec39a9、卷六 54cf2527d、卷十 2adf14fb5、卷十九 68d47f0c5）。

## 逐项判定

### 1. P10-1 形制按适用设施类型挑 —— 必须改 1 条（M1），其余过

- 代码过：bform 条目加 `facilityTypes`；server-plugin/kernel/gen/siteform.mjs 候选改为 `facilityTypes.includes(intendedType)`（:71–:79），designOf 与 `catch (e) { break; }` 已删，`FAMILY.type` 与对类型行的读取一并删；不读类型表。place.mjs:1555–:1560 经 blueprint.mjs checkBlueprintForms 第三参核该栏：必填列表（可空）、每项是类型表行、不重复；世界没有类型表即空集、任何引用都报缺，不放过。不交行集只出现在纯平面字段的单测调用方，加载路径恒交，不是口子。
- 测试真守：gen-siteform「按适用设施类型挑」用两个形制（民居适用粮仓、住宅；祠庙只适用祠庙）、30 行粮仓，断言补出的 form 集合恰为 {bldform_house}——候选若不按 facilityTypes 过滤，30 行等权抽取必然出现祠庙，所以这条确实守住“粮仓不取祠庙”。同种子再跑 deepEqual；两个形制都适用时两者都出现（等权仍在）；没写 facilityTypes 的形制不当作全适用（`bare` 用例）；无类型、类型无适用形制、登记为空都记 form_type_unmatched、不补、不计占地。作者 form 不动、作者写 null 或不在登记仍 E-GEN-ROW-INVALID 的旧用例保留未改。
- 卷十 1123k52 写法过：R10-7.12 `form` 条候选句改写、记录写明 1123k31 ③ 的“已定”句作废，历史修订未回改。
- **M1（必须改）卷十九 1123k52 没跟改 §4.5 规则 1**：卷十九 :635 规则 1 仍写“不规定用途。任何设施类型可以用任何形制，只要建成后的功能量与围合值够”，而同批在 §2.4 加了必填 `facilityTypes`、在规则 2 筛选加了 ⓪“形制的 `facilityTypes` 含入参 `intendedType`”——同一卷前后矛盾。改法：规则 1 那句改为“形制登记它适用哪些设施类型（§2.4 `facilityTypes`），适用的形制之间按功能量与围合值再筛”，并在 1123k52 记录里加一项写明。

### 2. P10-2 设施类型改维度表 —— 必须改 1 条（M2），其余过

- 表头大体照卷十九 §2.2（:166–:183）：functionNeeds、maxSkyExposure、maxAperture、envelopeWhere、accessDefault、accessOpen、headline、services、ratingWeights、upkeepPerDay、laborPerDay、wearPerDay、openSpan、emits 都在；必填按卷十九（定义处）而不是卷二 §5.7 写（maxSky/maxAperture、ratingWeights 两处卷二写 never，卷十九写 always，取卷十九对）；services、ratingWeights、wearPerDay 三个 always 列登未建列，ffunc、raspect 登未建族；serviceEffects、networkNeeds 两个 never 列未声明，回报已写明原因（依赖未建的 effectCall、netres）。
- **M2（必须改）upkeepPerDay、wearPerDay 写成 `modifiable: false`**：卷十九 :177、:180 两行都写“可修正”，卷二 §5.7 :1859、:1862 写“modifiable, penalized”，facility_type.json 却登为不可修正，basis 也没说明。表头写法现成（person.json :21 `"modifiable": true, "stacking": "penalized", "bounds": [...]`）。照写；若加载器对可修正列有别的硬要求做不到，就在该列 source 与 docs/问题.md 写明偏离，不留无说明的偏离。
- 读者旧路径清干净：server-plugin 里已无按词表族读设施类型的代码（grep `facility_type`：只剩 place.mjs 的表 kind 常数、blueprint.mjs 与 layout.mjs 的报错文字与注释、state-owners ENTITY_KINDS）；siteform 不读类型行，layout.mjs checkLayoutTemplates 的 typeAffinity 键改经表行 id 集（缺省空集，不放过）。词表族 facility_type 从 _vocab.json 撤掉，_unbuilt-derived.json kinds 里的 `facility_`（旧前缀）条目撤掉，place.json intendedType 改 `ref kind facility_type`。干净。
- 小瑕（建议，不必改本轮）：layout.mjs:323 注释仍写“键须是 facility_type 族条目”，与 :324 新注释打架，改一个词即可；functionNeeds 取值域登 [0, null]，卷十九写“值 > 0”，类型系统没有开区间（validate/types.mjs 无 exclusive 写法），建议在该列 source 写明“0 本应拒，类型系统暂表达不出”。

### 3. P10-4 水体存量单位改立方米 —— 过（附 2 条建议）

- 改名与换算：place.json capacityL→capacityM3（unit m3）、_vocab.json comp_waterbody requires 跟改、_units.json 加 `m3`（volume，si 1）；gen/water.mjs 取容量维度所标单位的 si（worldgen.mjs:181 改读 `dims.capacityM3.unit`），整数 = ⌊S×D÷(M×标度)⌋ 全在 BigInt 里算、不经定点中间值，装不进安全整数才报 E-GEN-ROW-INVALID，不足 1 m³ 报错不钳，单位为 0 拒收。det-math 定点，无 Math.*。
- 勘误 1123k53：卷五（定义处，:139 floodM3、:146 capacityM3、:354、:676、:864、:1000）、卷二十（:353、:791、:793、:818）、卷二 :1841、卷六 :1477、卷十 R10-2.12、R10-2.13 都跟改，快照齐、版本不升。
- 漏改 grep（全仓库除 docs）：capacityL、floodL 只剩 world/geo/water-bodies.json :59、:101 两条 openItems 说明文字（不是数据键，建议顺手改字）；m3PerL 只在 blueprint.mjs、place-building.mjs、siteform.mjs 的蓝图体积（那是升，本就不该动）与 grid-base.mjs waterOfRegion。水循环 water-cycle.mjs、水体账户读入口 resource-field.mjs 都还没建，没有漏改的读者。
- 建议：grid-base.mjs waterOfRegion 的 docblock :128、:134 仍写“合计 L × m3PerL……升换立方米，取 L 的 si”，与 :127 新加的“实为账户单位的立方米数”自相矛盾；没有调用者，不影响行为，但水层接线时必须改名改注，建议现在就把 :128、:134 两句改成按账户单位，免得接线的人照旧注交 0.001。
- 深海：water_sea 行 20–200 m，worldgen.json basis 写明设定值（P-3）、参照量级与“上限 200 m 是陆架外缘量级、不是技术所迫”，出处写清，过。
- 测试期望手算：gen-water「大水体」三个数 4e9 = 1e9×4、321,480,000,000,000 = 8.037e10×4000、5e11×40000 = 2e16 > 2^53−1 拒收，都是按式手算的字面量；gen-water-grid 改为 ⌊20000×d4÷10000⌋（d4 由抽取函数在测试里先算，是前提不是实测抄数）；data-d 海深 1.6074e13 = 200×8.037e10。没有抄实测。

### 4. P10-5 两湖 —— 过

- 镜沼 water_lake 可航，依据 regions.json:644 渡口、附表 :123 芦语渡；灰盐池拆 water_saltlake（静水、不可航），依据附表 :144、:148、:203 与 regions.json:644、:645；两处都写明“由设定推出的读法、不是原文明写”，合 P-3。水深 0.1–3 m 写成设定值并给理由。灰盐池液体仍取 mat_seawater、不自造卤水行，合“不自造”。
- 新增一个水体词条该本卡做：通航是 water 族条目的类级字段（卷五 §2.2 :248），两湖同类就不可能一可航一不可航，P10-5 要分就只能分类；只加数据，cellclass_water 的 waterAny 跟加，convert-geo-g5b.mjs 改为读 geo-model.json 每湖自己的 waterKind，缺即抛，没有按 id 分支。

### 5. 真实世界组织行迁入 —— 过（附 1 条建议）

- 只有一份：org_realm_main、org_village_hw、polity_realm_main 从 world/design/opening-polity-hw.json 删去、原样迁进 org.json、polity.json 的 rows（字段逐项与原文一致，只 treasury 由 [] 改 ["purpose_general"]、basis 加迁入说明）；opening-polity-hw.json 只留两条统治边（统治边是持有边、不是表行，留在设计数据里有理）；全仓库 grep 无别处再存这三行。registry.json polity 块登 rolesPurposes（general、escrow 都是 purpose 族 ref），规则表值 {purpose_general, purpose_escrow}，unbuilt 里撤掉该键；读者 worldgen.mjs:62、:72 是 A 卡已有的。
- “磨坊查回原村”：组织、政体、统治边、holdings、governorOf 全在真实世界（`loadWorld(ROOT)`，不夹具，断言 W.errors 为空）上跑；子站点行取自作者附表清单 world/geo/subsite-reparent.json 而不是 place 表行——因为真实 place.json 行还没有 originSite（G5b 上格未做），测试开头已写明。所以“真实表”成立到组织层，地点层要等上格；这不是本卡能补的。
- 建议：rolesPurposes → 新建组织行 treasury 这条读法（worldgen.mjs polityInputs）在真实世界上没有用例（该测试直接调 genPolity 并交 `treasury: []`）；可在 polity-opening-hw 补一句 `generateFill` 前的 polityInputs 读数断言，或等 G5b 上格后整段走 generateFill 时一并守。

### 6. 13 个夹具世界的跟改 —— 过（正当跟改）

- org.json 行清空（13 处）：这些夹具拷真实表头、换自造 place 表；真实组织行的 seat 指王都与河湾村，夹具地点表没有这两行，不清就引用缺失。D 之前真实 org.json 的 rows 本来就是 `{}`，这 13 个测试从来没有过组织行可守，清空不丢任何原有保证；与已有的 item.json 清行同一做法。
- access 族由“替换为只有 access_test_open”改为“真实条目加 access_test_open”：真实 facility_type.json 的行 accessDefault 引 access_public 等，族里没有即加载失败；测试仍加自己的条目，原断言一条没改，pass 数不变。正当。
- bform 夹具补 bldform_shrine、自造形制补 `facilityTypes: ['fac_house']`：前者因为真实规则表 bldfill 第二行 whenRX 写着 `form == bldform_shrine`，RX 编译要这个代号在族里；后者是新必填栏。都是数据跟改，不是放宽断言。前者把每个夹具绑在一个形制代号上，根子在第 7 项 a 条，见那里。
- 被替换掉的旧测试：gen-siteform 原「按围合筛（maxSkyExposure 0 剔无顶形制）」随 P10-1 选乙整条撤去，由「按适用设施类型挑」取代；layout-templates 用例改为交行集。都是规则改了测试跟着改，期望值仍是手算的，不是降门槛。

### 7. 写者列的“须李白” —— 逐条判：真须李白 0 条

- a. bldfill 面积行按 form 分行（`form == bldform_shrine`）——**可推，主会话定**。这是技术口子不是设计问题：卷十 R10-7.12 `planCells` 条（:687）规定 whenRX“只读本行 intendedType 代号与所挂形制条目的数值字段”，写者写不出 `intendedType == fac_shrine`（RX 名字只认词表代号，类型改成表行后解析不到），于是改读 form 代号——这偏离了 R10-7.12 的可读集，basis 写了原因但没写“偏离”。建议主会话按“修在原语层”定：让 RX 的名字也认实体表行 id（卷二 RX 命名空间一句勘误），或登记形制数值字段的读入口后改写成按 planSideMaxCells 分行；在此之前把该行 basis 与 docs/问题.md 写成“偏离 R10-7.12 可读集，待 RX 认表行 id 后改回 intendedType”。“要不要改成面积由形制外包上限推”是可选优化，不必报李白。（RX 解析不了表行 id 一事未亲核，照写者所述。）
- b. 公仓列入 river_house 适用类型、旧数据 material wood——**可推**。13-建筑 :170 明写白石镇与五村已有建筑一律此形制，写者照原文列入；旧 locations.json 的 wood 是旧数据，建筑行的 materialKg 归卷十九建行卡另补，不构成设计冲突。
- c. 灰盐池卤水材料——**可推**。P10-5 已裁“查不到按 P-3，不自造”，取现有最近的咸水材料即是裁定的答案，不必再问；以后材料表扩卤水行时由那张卡改。
- d. 深海要不要设——**可推**。P10-4 只裁“不设 100 米上限”，现取 200 m 是 P-3 设定值、已写出处；要不要在世界里放数千米深的大洋是世界内容想法，记进 docs/待办.md，不挡任何一张卡。
- e. openRX、runtimeOpen 无值——已裁块 6 之后，不再报。
- 另：docs/问题.md D 卡第四节第 3 条仍把 purpose_general 的 visibleToMarket 列为“须核”，P10-3（:1630）已裁取假；建议删去该半句，data-d.test 的 `typeof visibleToMarket === 'boolean'` 收紧为 `false`（spendable 一列仍是推读，可留）。

### 8. 红线 —— 过

- 规则层无按 id、名称、文件名的分支：siteform 候选只读条目字段；convert-geo-g5b.mjs 读每湖自己的 waterKind、缺即抛；place.mjs、layout.mjs 经表 kind 常数取表，不点名行。规则表 bldfill 行引一个形制代号是数据（见 7a，属可读集偏离，不是代码特判）。
- siteform.mjs、water.mjs 无 Math.*（只有注释里的“不用 Math.*”）；水体容量全程 fixedUnits + BigInt，定点。
- 世界内容只改在 world/（ontology、rules、geo、design），dist/ 未动。

## 结论

必须改 2 条：M1 卷十九 §4.5 规则 1 跟改与 1123k52 记录补项；M2 facility_type.json 的 upkeepPerDay、wearPerDay 照卷十九“可修正”登 modifiable（penalized）或写明偏离。真须李白 0 条（写者列的 5 条全可推，7a 归主会话按原语层定）。改完按“必须改的改完至少再复核一次”再请一轮（可由主会话亲读 diff 加跑上列测试判）。建议项（不挡合入）：layout.mjs:323 注释、functionNeeds 开区间说明、grid-base.mjs waterOfRegion 注释、water-bodies.json 两处旧字段名、rolesPurposes 读数用例、问题.md 第 3 条与 data-d 测试收紧。
