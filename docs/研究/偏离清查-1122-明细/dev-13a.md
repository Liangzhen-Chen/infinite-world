共 5 条，甲 0 乙 5 丙 0，有理由 0 无理由 5。

本卡读了：卷八 :117-209、:322-409、:606-760、:1247-1285、:1396-1397；卷十 :333-406 与 R10-2.11 :434；docs/问题.md:745-753。代码读了 server-plugin/kernel/gen/polity.mjs:1-167、server-plugin/kernel/validate/polity-tables.mjs:1-153、tests/kernel/gen-polity.test.mjs:1-242、server-plugin/kernel/gen/rows.mjs:1-77、gen/ids.mjs:1-69、gen/when.mjs:1-37、gen/worldgen.mjs:40-126、gen/holdcalls.mjs:1-20、title.mjs:90-140、world/ontology/dimensions/polity.json、org.json:1-100、office.json 表头（Grep）、place.json:520-527、_vocab.json:680-730、:819-888、world/rules/tables/polity.json、world/rules/registry.json:636-664；tests/kernel/polity-load-checks.test.mjs 只读 :1-60，其余未读。卷八其余节、卷十其余节未读。

### 1 ② 的“手写聚落组织”判据用了“非主权”，没读 orgkind 条目的 settlement 字段
- 位置：server-plugin/kernel/gen/polity.mjs:73（authoredOrgs 只记 sovereign）、:136（`!o.sovereign && o.seat === s`）
- 设计原文：卷八 :1267「已有手写聚落组织驻地的站点不做 ②」；聚落与否是 orgkind 条目的 `settlement` 字段（卷八 :216）
- 代码实际：`authoredOrgs` 只区分 `sovereign` 真/假，② 拿 `!sovereign` 当“聚落组织”；而 `orgkind_monster_band` 是 `sovereign` 真、`settlement` 真（_vocab.json:884），`orgkind_guild/firm/household` 两者皆假（:881-883）。反过来会漏掉 sovereign+settlement 的手写组织、误跳过 non-settlement 的手写组织。
- 理由：无
- 影响：读数错
- 严重程度：乙
- 合并：无

### 2 settlement 种类组织缺 tenure 的加载校验没有实现
- 位置：server-plugin/kernel/validate/polity-tables.mjs:78-103（组织行循环无 tenure 判据，全文件也没有）
- 设计原文：卷八 :133「条目 `settlement` 为真的种类必须写（加载校验）」
- 代码实际：org.json 的 tenure 是 `required:"never"`，通用维度校验不会要；polity-tables 只核 polity/treasury/internal/parent/headOffice/charter/offices，没有“settlement 真 → tenure 非空”。
- 理由：无（docs/审查/A卡组织层-Opus只核-1123.md 建议 7 已提出“没实现，也没列进未落”；未修）
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 3 E-DOMAIN-RANKS 在全仓没有抛出点
- 位置：server-plugin/kernel/validate/polity-tables.mjs:5（注释称“E-DOMAIN-RANKS、E-INF-ROW 等属别的子系统”，但别的模块也没有）
- 设计原文：卷八 :346「polity.domain.rankBonus…位阶 0 至 9 各恰一项（加载校验，E-DOMAIN-RANKS）」；:443 同
- 代码实际：polity-tables 不读 polity.domain.rankBonus；registry.json:641-647 与 polity.json 都没登这个键，也没列进 unbuilt；Grep E-DOMAIN-RANKS 只命中 error-codes.mjs:107 与本注释。
- 理由：无
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 4 E-TAX-ROW 只实现了“to 是种类行”一半，税种条目的计量、触发与周期相容未核
- 位置：server-plugin/kernel/validate/polity-tables.mjs:140-145
- 设计原文：卷八 :448「E-TAX-ROW｜加载｜税种条目的计量、触发与周期不相容，或 taxRules 的 to 不是职位种类目录行」
- 代码实际：对每条 taxRules 只判 `isKindRow(t.to)` 与 base 重复；不读 taxbase 条目的 measure/trigger/periodDays（卷八 :239）作相容判定。
- 理由：无
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 5 polity.gen.settlementKind 所指条目须 settlement 真、internal 假的前提没有校验
- 位置：server-plugin/kernel/validate/polity-tables.mjs:55-58（只核了 genHoldCause 不在 forcibleCauses）
- 设计原文：卷八 :376「polity.gen.settlementKind…所指条目 settlement 须为真、internal 须为假」
- 代码实际：校验器不读 genSettlementKind；registry.json:643 的类型只写 `ref orgkind`，没有条目字段条件。现值为 orgkind_village（settlement 真、internal 假），当前不报错，但没有守。
- 理由：无
- 影响：规则缺
- 严重程度：乙
- 合并：无

## 已登记未建

- gstage_polity 的 after/before 未照卷文填：卷八 :1267 的条目写 `after:["gstage_people"]`、`before:["gstage_economy"]`，_vocab.json:713-716 现在是空表，basis 写明两阶段条目还没登记。
- 真实世界的生成输入没有生产者：cultureLevel、seatCultureOf、siteOf、sitePopOf、heldBy 均由调用方经 opts.genViews 临时交入（worldgen.mjs:107-126；模块化评估-1122.md:127、:143 已登记这个口子），rules.gen.pop.cultureLevel、gen.seatCulture、genView().sitePop 未建；问题.md:753 ④⑤ 已登记。
- polity 规则表大部未建：polity.json 只登 7 个键，unbuilt 列 genRealmRows、genOpenTiers、settleDemoteDays、settleReopenDays（:52-57）；settletier 条目、taxbase、amenity、motion 等各族与键未登（问题.md:753 ②），连带 E-POP-FLOW、E-INF-ROW、E-DIM-INVARIANT-SPENDPURPOSE 无抛出点。
- 世界创建入口未建：generateFill 只被 tests/ 与 tools/ 调用（模块化评估-1122.md:146），genPolity 在生产路径上还不可达，所以 ①–③ 目前不运行。
- 问题.md:753 第 7 条已过时一半：org 表、orgkind 条目、createRows 建行、setGovernor/governorOf、三条 idslot、gstage_polity 条目均已落（polity-org 卡与 D 卡），余下就是上面四项。

## 拿不准

- ③ 对手写聚落组织驻地的站点要不要连统治边：polity.mjs:136 跳过 ② 后，:150-152 只为本阶段建的聚落组织交 setGovernor；若作者写了聚落组织行但没写统治边（测试 gen-polity.test.mjs:197-202 固化了这一情形），该站点与它的 originSite 子站点都无主。卷八 :1267 ③ 只写“对 ② 的每个站点”，而“原站点开局无主时 P 也无主”一句又可读成允许这种无主；真实世界 opening-polity-hw.json 已手写 loc_hw 的边，暂不受影响。
- originSite 连边的“同一原因”取哪条：polity.mjs:164 取原站点那条边的 `cause`（作者边可能是 verb_hand 等）；A 卡 Opus 只核 docs/审查/A卡组织层-Opus只核-1123.md:20 记“卷文‘以同一原因’指 holdCause，等 holdCause 裁定后统一改”；holdCause 已定 verb_opening（卷八 :378），是否改成一律用 holdCause 要裁。
- 输入缺口时仍交 originSite 连边：polity.mjs:60-62、:153 在整阶段 deferred 时仍用作者手写的 heldBy 交 setGovernor，测试 gen-polity.test.mjs:235-241 固化。卷文与卷十只写“缺输入不编”，没写阶段可以部分运行。
- E-OFFICE-DOMAIN-LEVEL 对 domain 为站点时不核：polity-tables.mjs:6、:116-119 只在 place 行有字符串 regionLevel 时比较。卷八 :160 说“domain 非 null 时须等于该地点的层级”，但站点没有层级（卷五层级条目只给政区），站点作辖区时取哪一层级卷文没写。
- §2.2 表里三条跨字段条件没有加载检查：`titular` 真须 `domain` 非 null（卷八 :168）、`term.kind` 取限期时 `years` 非 null（:165）、`bench` 须指同一组织的职位行（:169）；polity-tables.mjs:107-133 都没核，§2.8 也没给码，判不了它们是加载期还是运行期义务。
- ① 的 whenRX 绑定把政区维度与文化维度直接合并：polity.mjs:124 `{...dimsOf(R), ...cultureDimsOf(culture)}`，同名键时文化值覆盖政区值；卷八 :375 只说 whenRX 读这两处，没说 RX 里怎么区分两个行的同名维度。

## 跨卷待判

- 无。
