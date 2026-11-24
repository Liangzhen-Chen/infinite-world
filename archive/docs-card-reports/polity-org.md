# 前置卡 A 收窄版《卷八组织层机制与试玩地区开局组织》回报

写者：Claude Sonnet 5.5 中档（接手前任半截改动）；待 Opus 核。分支 ds/polity-org，已对齐 origin/master（含 G5b 收口 ee9542ca0）。

## 自查表（派活卡头 §三）

| # | 问题 | 是/否 | 证据 |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 下文"卷文逐条落实"，均带卷八行号 |
| 2 | 没有按 id/名字/场景写特例 | 是 | title.mjs、gen/polity.mjs、validate/polity-tables.mjs 不含任何组织、职位、地点 id 字面量；种类差别只读条目字段 sovereign、hasTreasury、internal |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | polity-load-checks.test.mjs 每码一反一正，含 treasury 空集、passDen 0、parent null、offices 空 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 期望值为手算字面量；磨坊用例的子站点集合从附表按 originSite 过滤，只断言 > 0 与逐个查回 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 未改任何检查器与基线 |
| 6 | 只改了卡文列出的文件 | 见"偏离" | 另动 registry.json、state-owners.json、files.json、world.mjs（加载器接校验）、holdings 不动 |
| 7 | 全量测试已跑 | 见末节 | |
| 8 | 让块 6 哪一步更近 | 是 | 组织层机制与试玩地区组织、统治边手写数据到位，"子站点归原村"经 governorOf 查回；未违北极星 |

## 前任改动的审法

留（照卷文核过）：title.mjs（governorOf、holdingAllowed、setGovernor 主体）、gen/polity.mjs 的 ①②③ 主体、gen/holdcalls.mjs、gen/ids.mjs 的 instanceIdOf、gen/writeback.mjs 的 createRows、gen/worldgen.mjs 的接线、office.json、polity.json 表头、_vocab 的 19 个族与 orgkind 九条条目（逐条对 :265–:269、:286–:289）、_unbuilt-derived 的 13 个派生列。
改：模板类别行 org_tpl_* 改 class_org_*（org.json、_vocab 的 class 族与 orgkind.template、测试）；设计测试夹具的组织行由 `classes` 改 `extends`（abstract 类别行只供继承，`classes` 不给值，前任的行因此缺 charter 加载不过，这是它失败的原因之一）；setGovernor 加"同地旧边先 closeHolding"（统治行 vacated 取 ho_revert，持有写者块 5 未接线，互斥让位走不通，前任注释说由持有写者让位是错的）；gen/polity.mjs 的 originSite 连边改认"原站点有统治边（含作者手写）"并取该边的持有组织与原因，且在输入缺口时照做；heldPlaces 改 heldBy（地点→{org, cause}）；rules.polity 补 rolesVerbs、去掉 genHoldCause（改列 unbuilt）、补注册表项；office.json 补 holder、acting 两个派生列。
删：前任 polity.json 的 genHoldCause 取值（卷文不点名，候选 verb_grant 须李白定，本卡不做）；_unbuilt-derived 里 requirement 族条目（族已进 _vocab）。

## 卷文逐条落实与测试名

- 组织表、职位表、政体表头：卷八 §2.1–§2.3（org.json、office.json、polity.json）；缺：org.priceRule、org.forceValues（见"未落"）。
- 组织种类九条与模板类别行：§2.4 :265–:269、:286–:295；卷二 §1.3 :126（类别键入 class 族）。
- setGovernor、governorOf、holdingAllowed：R8-5.1 :773、R8-5.2 :774、R8-5.3 :775；登 state-owners kernelApi（governorOf callers rules；setGovernor、holdingAllowed callers rules 加 callerFiles gen/holdcalls.mjs）。测试 polity-title.test.mjs（8 条：自身先于祖先、无主、强取不核资格、拒写、让位）。
- R8-18.9 ①②③ 生成器：gen/polity.mjs；测试 gen-polity.test.mjs（①政体、seat 取 rank 最大并列取 id 小、职位行、②聚落与 tier、order 并列、手写优先、③统治边与 originSite、手写边被认、确定性、缺口不编、缺口时 originSite 照连）。gstage_polity 与 idslot_realm、idslot_settlement、idslot_genoffice 登进 _vocab；generateFill 接线（worldgen.mjs）。
- 第 5 项必需块（coordinator 追加）：rules.polity 的 rolesKinds.governs（卷八 :326、:765）、rolesVerbs 的 conquer/grant/usurp（:330、:401）、holdForcibleCauses = [conquer, usurp]（:342、:775、:401）、genSettlementKind = orgkind_village（:376、:1267）；verb_conquer、verb_grant、verb_usurp 三条动词行登 verb 族（kindOnly，:401）；registry.json 登 polity。realmRows、openTiers、settletier 条目、holdCause、demoteDays、reopenDays 留 unbuilt 标待调。
- 第 8 项：world/rules/tables/social.json orgTraits（九行，卷十八 :239、卷八 :1414），registry 登 social。
- 第 9 项：kernel/validate/polity-tables.mjs 接进 load/world.mjs：E-ORG-POLITY、E-ORG-PARENT-CYCLE、E-ORG-TREASURY、E-ORG-CHARTER、E-OFFICE-DOMAIN-LEVEL、E-OFFICE-ORG、E-OFFICE-BENCH、E-OFFICE-KIND、E-TAX-ROW、E-TAX-DUP、E-TITLE-DUP、E-KIN-ORG-TRAITS；测试 polity-load-checks.test.mjs（13 条，每码一反一正）。
- 试玩地区手写：world/design/opening-polity-hw.json（见下）；测试 polity-opening-hw.test.mjs。
- 勘误：卷八 1123k40，改前快照 版本快照/卷八-v5-勘误前-1123k40.md（git 复制同一 blob 1c402c70…，hash-object 核对一致）。

## 试玩地区手写了哪几行

world/design/opening-polity-hw.json，source 作者：王国政体行 polity_realm_main（holderEligibility `1 == 1`，domainLimitBase 0 待调）；王国组织 org_realm_main（orgkind_state，驻地 loc_capital）；河湾村村社 org_village_hw（orgkind_village，polity null、parent 王国，驻地 loc_hw）；统治边两条：loc_capital 归王国、loc_hw 归村社（原因 verb_grant）。新增词表条目 pkind_realm、succession_pending（占位）。不写名字：国号方案 D1 未定。

## 磨坊查回原村的测试

polity-opening-hw.test.mjs「R8-18.9 ③ + 1123k32 …」：附表（subsite-reparent.json）里 originSite 为 loc_hw 的 8 个子站点，经生成阶段连边后 governorOf 逐个查回 org_village_hw、direct 真。用例用夹具世界（带 purpose_test 分区）+ 真实 org/polity 表头 + 附表真实数据；真实表因 place.json 数据行未换、treasury 分区缺而用不上，见"未落"。

## 已定

1. 模板类别行实体行用 `extends`、生成行写整值：abstract 类别行展平后丢弃，`classes` 不给值（卷二 §1.3 继承表）。
2. org.parent 矛盾：按卷八 §2 段首“没有一律写显式 null”，生成行写 null；R8-18.9 ② 措辞勘误 1123k40。
3. setGovernor 换边自己先关旧边（持有写者的互斥让位对 ho_revert 种类未接线）。
4. 子站点统治边的原因取原站点那条边的原因（holdCause 本卡不定）。
5. 作者手写统治边的原因取 verb_grant（唯一已登记的和平取得动词，:401）。
6. office.holder、acting 暂用 ref person 类型（卷二没有"任一实体"的维度类型写法）。
7. orgTraits 只写九行：与现有 orgkind 条目同键（同键规则）；卷七教团、修会与卷十八家户、世系各两条随它们登记 orgkind 条目那一卡补行（行与条目同批进）。

## 须李白

1. governorOf.direct 的含义：:773 说 direct 为真指统治者是该边的持有组织本身而非经下级组织，:1267 说主权组织开局不直接持边、经下级聚落组织统治（direct 为假）；返回的 org 是边的持有组织，则 direct 恒真，与 :1267 的“为假”对不上。现行读法：边是否挂在被问地点自身（false 即沿包含树继承来的）。请定。
2. 卡文要手写“河湾村所在的郡”组织行，但世界设计方案 :134–:140 说郡级治理是王国下的郡守职位、不是郡组织行（郡守职位种类行与权能词表也未定）。本卡没写郡组织行，请定要不要。
3. polity.gen.holdCause 取哪个 verb（候选 verb_grant）。
4. 王国继承制 succession_pending 为占位（orderSource 取 succsrc_motion 只为必填），国号、domainLimitBase 都待定。
5. R8-5.6 统治者变更事件（verb governorChanged、带旧新双方与原因）本卡未发：动词行与 emit 接线未建。
6. 卷七 4 处、卷十八 4 处 org_tpl_ 的勘误与它们的 orgkind 条目登记。
7. org.priceRule（:137，modifier: ref 的价格槽类型）与 org.forceValues（卷十三 forcevalue 族未登记）两列表头未建：卷二没有对应类型写法。

## 未落

- 真实世界上的组织行与统治边：行放在 world/design/opening-polity-hw.json 而没进 org.json、polity.json 的 rows，因 E-ORG-TREASURY 要 treasury 非空、卷六 purpose_general 分区缺（第 6 项另开卡）；该项合入后把这批行迁入表、统治边由世界创建事务装载，再补“真实表上磨坊查回”用例。世界创建事务的装载器（读 opening-polity-hw.json 的 governs 成 heldBy）也未接，属 6-16。
- 运行期的 E-ORG-PARENT-CYCLE、E-OFFICE-ORG、E-OFFICE-KIND（建边写入口）、E-TITLE-DUP，随各写者。
- 生成器 ①② 在真实世界仍整段 deferred（缺落位文化、站点类型、开局人数、realmRows、openTiers、holdCause、公库分区），缺口清单已由 genPolity 返回。

## 缺口清单（genPolity 在真实世界返回）

gen_pop_cultureLevel、seat_culture_reader、culture_row_reader、site_type_reader、site_pop_reader、polity_gen_holdCause、polity_gen_settlementKind（已补）、polity_roles_purposes_general。

## 偏离

另动：world/rules/registry.json、world/ontology/state-owners.json、server-plugin/kernel/files.json、server-plugin/kernel/load/world.mjs（接校验）、world/ontology/dimensions/_vocab.json 的 verb 与 class 族。命令纪律：中途误用过一次 `node --input-type=module -e 1`（空操作）与一次 `| tail` 管道，无副作用。

## 补记（审门禁后）

- rules.polity 加 genIdSlots（三条 idslot 句柄，规则层不写 idslot_ 字面量，S1 门禁）：键名是本卡自拟，卷八 §2.6 没列，须李白认或改名；去掉无读者的 rolesVerbs（A12-4.5）。
- 生成的组织行写整值：把模板类别行里表头登记的非派生维度抄成整值，并挂 classes（终止方式经类别链取）。
- 调用提案去掉 fn 字段（只有 setGovernor 一种）。
- 职位行种类的两个代号从 office 表头 jurisdictionLevel 的必填条件 `byEnum:…=orowk_actual` 解析（校验器、生成器同用 officeRowKinds），不写字面量。
- 缺口项改名为 input_ 打头（避开实体前缀 site_、polity_ 触发 S1）。
- 相邻测试因本卡合理变动而改：events.test.mjs（verb 族加三条 kindOnly 行）、gen-water-grid.test.mjs（真实世界 deferred 里多一条 gstage_polity，水体用例只核水体）、terminate.test.mjs（org 表已载入，"表未载入"改用 sect_x）、detectors.test.mjs（social.orgTraits 只被校验器读，列入无运行期消费者）。

## 验收

- `node --test tests/kernel/[a-l]*.test.mjs`：末行 `ℹ tests 997 / pass 997 / fail 0`；`[m-z]*.test.mjs`：`tests 786 / pass 786 / fail 0`（合计 kernel 1783 全过）。
- `node --test tests/accept/*.test.mjs`：203 条，改 files.json 排序与 detectors 期望后 detectors 一组 48/48，其余 201 条原本即过。
- `node tools/accept/run.mjs pre_commit`（不带 --write）：`"verdict": "pass"`（失败项只剩 vol12 三项基线与 vol27.A27-1.12 的偶发超时型用例，单跑 sim-tiers 已过）。

## 修改轮（Opus 第 1 轮 M1–M8 与李白 b41e0801 三条）

- M1：holdings.mjs vacateEdge 加 ho_revert 格（授予者为空或已终止按关闭，授予者在世仍拒 E-ACT-WRITER-NOT-READY），setGovernor 删自关循环；用例 polity-title「M1 …」两条。
- M2：createRows 补必填核对（validate/required-dims.mjs，always 与 byEnum）；新测 gen-create-rows.test.mjs 8 条（缺必填、byEnum、writesKinds、id 撞、classes、派生列、值不过校验）。
- M3：worldgen 不再把 realmRows、openTiers 顶成空表，genPolity 记 input_rules_gen_realmRows、input_rules_gen_openTiers；用例 gen-polity「M3 …」。
- M4：office.venue 加 nullable。
- M5：E-KIN-ORG-TRAITS 去 social 闸门；用例「M5 …」。
- M6：1123k40 记录改为只写数据块的改动。
- M7：发 R8-5.6 统治者变更事件：verb_governor_changed（卷八 :403）、sys.title emits、setGovernor 同事务 emit，同一持有者再写不发；用例「R8-5.6 …」。
- M8：forceValues 登 _unbuilt-derived 与族清单；priceRule 登 docs/问题.md（卷二无类型写法）；两列均等卷二、卷十三补类型写法。
- ⑦ direct 取甲（卷八勘误 1123k41，:773、:1267 措辞一致）；⑧ 开局统治边原因新登 verb_opening（kindOnly，勘误 1123k42，rules.polity.genHoldCause 取它，加载核不在 forcibleCauses 里）；⑨ 继承改 succession_by_motion（议案选出，poolRX、cost 待调）。各有用例。
- 未落：真实世界组织行迁入等 D 卡（ds/data-d）的 purpose_general 合入。
- 待李白：无（三条已裁）。
