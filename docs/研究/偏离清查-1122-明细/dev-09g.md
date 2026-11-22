共 11 条，甲 0 乙 7 丙 4，有理由 2 无理由 9。
读了：卷六 :95-130（§2.1 资源种类表）、:221-243（§2.5 规则表键闭集）、:1027-1031（§4.17.1 用途分区）、:1235-1253（§4.22.1 来源去处）、:1459-1465（§5.3 向别卷登记的行）；卷十八 :226-350（§2.4 social 规则表、§2.5 校验、§2.6 持有种类表 40 列）；卷二 :1464-1476（§3.7 过程主体槽）、:1869-1897（§5.8 org、§5.9 office）。数据与代码：world/rules/tables/{currency,market,valuation,demand,social,derived-process}.json、world/rules/tables/economy/{ledger,resources}.json（按 488 行做全量字段/族/来源去处统计与抽样，未逐行通读 9276 行）、world/ontology/{holdings,obligations}.json（表头与头几条，未通读）、world/ontology/dimensions/{org,office,_vocab}.json 的相应段、world/rules/registry.json 相应行；server-plugin/kernel/ledger.mjs:90-240、:1080-1220，kernel/item-state.mjs:83-104，kernel/load/rules.mjs:30-40、:160-234，kernel/gen/assetcalls.mjs:1-60，price.mjs:1-30，demand.mjs 相关行。没读：resources.json 全 9276 行逐行（只做全量统计）、holdings.json 全 1524 行、obligations.json 全 286 行、卷六 §4.1-§4.21 其余各节、卷十五 §15.3-§15.5。
核对无偏离的：resources.json 488 行每行 sources、sinks 均非空，family 与通道 families 一致（486 行 goods 全取 §4.22.1 的物品通用通道，asset 一行 sink_loss，claim 一行 sink_transform）；ledger.json 两条 budget 的 activeFromDay/activeToDay 均为整数 0、limit 空，alert 值为整数或空，字段齐（ledger.mjs:97-99 的 FLOW_FIELDS、PURPOSE_FIELDS 在 src 六条、sink 九条、purpose 三条上全齐）；org.json/office.json 的 dimensions 与卷二 §5.8/§5.9 逐项一致（orgKind/polity/seat/parent/offices/charter；rank/jurisdictionLevel/powers/salaryTable/succession/eligibility/term/appointedBy），未列偏离。

### 1 资源种类行的 item 字段不在规则表行上，改放在 _vocab 条目
- 位置：world/rules/tables/economy/resources.json:4-22（488 行值只有 11 栏，全表 grep `"item"` 0 次）；world/ontology/dimensions/_vocab.json:1016-1018（resource 族条目只写 item）；world/rules/registry.json:115-127（economyResources 的行类型无 item）
- 设计原文：卷六:123 "`item` | ref item nullable | 物品模板代号 | 物品→资源种类的唯一指向…`resfam_goods` 行必填"
- 代码实际：指向存在 _vocab 的 resource 条目上，由 kernel/item-state.mjs:86-104 读；registry 不声明 item，ledger.mjs:150-240 的加载校验也不查"goods 行必填 item"。
- 理由：有——李白 11-19 20:3x ⑤ 认可 item 字段放在 resource 条目上（docs/卡回报/ds-b6-22.md:55，resources.json 各行 basis 同引）。
- 影响：规则缺（漏一份必填校验：一件 goods 漏 item 时 resourceKindsOf 静默返回空列表，不报码）
- 严重程度：乙
- 合并：无

### 2 ledger.json 只给两条份额资源登记 src_genesis 的 [0,0] 窗口，486 条 goods 行没有该格
- 位置：world/rules/tables/economy/ledger.json:4-16；server-plugin/kernel/ledger.mjs:1086-1099（缺格 → {active:true, limit:null}）
- 设计原文：卷六:1242 "`src_genesis`…限额通道，`ledger.json` 里它的 `budget` 条目生效日窗口为 [0, 0]…第 0 日之后恒为零"；:1263 规则 3 "任何模块不能再用它"
- 代码实际：budget 只有 res_building_share、res_unmaterialized_share 两格；486 条 goods 行的 sources 含 src_genesis 却无 budget 格，budgetOn 按"缺格=不限"返回，第 0 日之后该来源对它们仍可无限入账。
- 理由：无（ledger.json basis 只说开局量待标定，未提缺格；见拿不准第 1 条）
- 影响：规则缺（暂未出错：现只有建筑份额经 kernel/gen/assetcalls.mjs:50 入账，goods 的开局入账路径未建）
- 严重程度：乙
- 合并：无

### 3 purpose 族缺在途、保管、寄售三个分区
- 位置：world/ontology/dimensions/_vocab.json:926-951（purpose 只有 escrow、general、unmaterialized 三条）
- 设计原文：卷六:1027-1031 "用途分区（本卷登记，§2.2 `purpose` 四列逐行写全）：`purpose_transit`…`purpose_custody`…`purpose_consign`…`purpose_escrow`…"
- 代码实际：该节四行只有 purpose_escrow 落了条目；transit、custody、consign 三条无条目，经 openAccount 或 post 用到这三种分区即报 E-DIM-REF-MISSING（ledger.mjs:380、:453）。
- 理由：无（无裁定/勘误/问题.md 记录；purpose_consign 在卷六:1030 是定稿行）
- 影响：规则缺（托运、保管、寄售三类记账分区不可用）
- 严重程度：乙
- 合并：无

### 4 卷六 §2.5 十六张规则表中十二张没有文件、没有登记、没有读入口
- 位置：world/rules/registry.json（全文无 fees/shop/trade/production/station/labor/household/credit/contract/property/works/report 行）；world/rules/tables/economy/ 只有 ledger.json、resources.json
- 设计原文：卷六:221 "本卷规则表（常数只在这里；路径 `world/rules/tables/economy/`）"，:225-242 逐表列全部键
- 代码实际：上述 12 张表既无文件也无 registry 行、无读入口；市场与币种只有旧设计文件（第 8 条），demand 见表（第 5 条）。
- 理由：无——docs/迁移体检/块6.md:140 只登记"市场、费用、需求、币种、开局规则表随 6-9、6-11、6-12、6-16 各卡"（6-12 未做，无 docs/卡回报/ds-b6-12.md）；本卡查过的排期与登记文档里未见其余表的登记。
- 影响：玩法不可达（生产、劳动、家户、合同、地产、工程、月报各系统的常数无处可读）
- 严重程度：乙
- 合并：无

### 5 demand.json 落在 tables/ 根目录，不在卷六规定的 tables/economy/ 下
- 位置：world/rules/registry.json:64-65（"file": "tables/demand.json"）；world/rules/tables/demand.json:1
- 设计原文：卷六:221 "本卷规则表（常数只在这里；路径 `world/rules/tables/economy/`）"
- 代码实际：demand 表登记在 tables/demand.json；同卷的 ledger、resources 在 tables/economy/ 下。
- 理由：无（registry 该行 volume 引卷六 §2.5，未记路径不同）
- 影响：只是形式（registry 是唯一入口，读得到；按卷文到 economy/ 下找文件的读者找不到）
- 严重程度：丙
- 合并：无

### 6 social.json 只登 orgTraits 一键，卷十八 §2.4 其余 39 键全缺
- 位置：world/rules/tables/social.json:1-20；world/rules/registry.json:654-665（social 类型只列 orgTraits）
- 设计原文：卷十八:230-258 逐键列出 `kin.maxDegree`、`kin.seekDue`…`social.compat`、`social.brawl`（共 40 键）
- 代码实际：只有 orgTraits 一行（10 个 orgkind 全齐，符合同键必写）；kin.*、roles.*、stance.*、fear.*、memory.*、lies.*、opinion.*、esteem.*、notable.*、mobility.*、treatment、social.compat/brawl 以及 dependent、minor.intimateMinRelMaturity、successorChain、descentTraits、lineage.branchRX、social.pickBase、watch.hook，共 39 键无键、无 unbuilt 登记、无读入口。
- 理由：无（无 unbuilt 行、无裁定/勘误/问题.md 记录）
- 影响：规则缺（社会关系各子系统的常数无处可读）
- 严重程度：乙
- 合并：无

### 7 derived-process.json 的 slots/consumers 全空，卷六登记的四个过程槽未落
- 位置：world/rules/tables/derived-process.json:1；server-plugin/kernel/load/rules.mjs:160-234（只校验格式，运行期无人读）；server-plugin/kernel/dimensions.mjs 全文无 process 槽读取
- 设计原文：卷六:1465 "卷二 `derived-process.json` | `process.price`、`process.interestRate`、`process.coinCredit` 的基线；新增 `process.wage`（工钱位置）"；卷二:1471-1474 格式例
- 代码实际：文件是 {"version":1,"slots":{},"consumers":{}}；四槽无定义，求值管线也没有读 process.<slot> 的接点。
- 理由：无（docs/迁移体检/块2.md:46 K2-28 只定"槽行由各领域卷自登"，未说卷六这几行可不登）
- 影响：规则缺（价格、利率、币信、工钱位置的修正无处落；块6.md:155 计划"买卖议价走 process.price"落空）
- 严重程度：乙
- 合并：无

### 8 market.json 与 currency.json 是旧设计表，键集与卷六 §2.5 零交集
- 位置：world/rules/tables/market.json:2-72（retailShare、forward、retailFloor、spread…旧键）；world/rules/tables/currency.json:1-151（metals、currencies、issuer、parameters…）
- 设计原文：卷六:228 "`market.json` | `depthStepShare`…`liquidationCurve`…"；:237 "`currency.json` | `abundanceCurve`…`turnoverDays`"
- 代码实际：两文件各 0 个卷六键（grep 全 0 命中）；旧键在 server-plugin/tools/tests 全 0 引用；registry 无行，加载器不读。
- 理由：有——docs/审查/P-2b-world-rules-清单.md:10-11 "留，卷六首卡按卷文重建（卷文路径为 economy/ 下），不登记"；docs/迁移体检/块6.md:161 归 6-12（未做）。
- 影响：只是形式（不进 engine.rules，不产生错数；旧常数留在现行目录里易被误当现行表）
- 严重程度：丙
- 合并：无

### 9 holdings.json 无任何加载器读，旧设计形状留在 ontology/
- 位置：world/ontology/holdings.json:121-1524（id/holderKinds/subjectKinds/handover/onSubjectGone 旧形状）；server-plugin 与 tools 全 0 引用
- 设计原文：卷十八:309-311 "本节是持有种类表每一列的唯一定义…主列（`id` 至 `pins`…）"；:350 "共 40 列"
- 代码实际：现行持有种类在 world/ontology/dimensions/_vocab.json:760 的 holding_kind 族（51 行、40 列形状），由 kernel/holdings.mjs:161 读；holdings.json 的 42 条旧行无读者，也未删除。
- 理由：无（docs/迁移体检/块1-P-2.md:24、:60 定"holdings 归块 5 转换后删"，转换已完成、删除未做；无保留理由记录）
- 影响：只是形式（不被加载；同一概念留两份）
- 严重程度：丙
- 合并：无

### 10 obligations.json 无任何加载器读，义务种类也没有迁进词表族
- 位置：world/ontology/obligations.json:7-286（25 条 loan/deposit/bill/rent…旧形状）；server-plugin 全 0 引用；_vocab.json 无 obl 族
- 设计原文：卷六:139 "`obl` | `obl_` | 开放 | `resourceFamilies`、`needsPresence: boolean`、`partial: boolean`、`graceKey`"；:197-208 义务记录字段
- 代码实际：obligations.json 是旧设计的义务种类声明，无加载器；新设计的 obl 词表族、contract.json 与义务记录均未建，旧文件没有迁移去向。
- 理由：无（无裁定/勘误/问题.md/迁移体检记录）
- 影响：规则缺（合同与义务系统不可达；旧文件留着也无用）
- 严重程度：乙
- 合并：无

### 11 purpose_unmaterialized 条目没有 source/basis
- 位置：world/ontology/dimensions/_vocab.json:943-948
- 设计原文：卷六:133 "第八版登记一行 `purpose_unmaterialized`（未物化预置）：`spendable` 为假、`visibleToMarket` 为假、`locksFor` 为空、`trackOutflow` 为假"
- 代码实际：同族 purpose_escrow（:929-935）、purpose_general（:936-942）都带 basis，purpose_unmaterialized 只有四个字段，无 basis、无 source；加载器只要求这四字段（ledger.mjs:97-99、:190-196）。
- 理由：无（卷文已给四列值，缺的是出处/依据记录）
- 影响：只是形式
- 严重程度：丙
- 合并：无

## 已登记未建
- market.json 六键（depthStepShare、scopeRadiusM、tradeRingDays、bargainBaseline、operatorMarginShare、liquidationCurve）与 currency.json 七键（abundanceCurve、acceptanceCurve、neutralAcceptance、mintFeeBps、mintLossShare、meltLossShare、turnoverDays）未建；登记：docs/审查/P-2b-world-rules-清单.md:10-11、docs/迁移体检/块6.md:140、:161（6-12，未做）。
- demand.json 四键（coverDaysByTier、habitCurve、budgetShareByTier、neutralPreference）登在 unbuilt 行（world/rules/tables/demand.json:20-25、registry.json:64-76）；卷六:230；上一轮登记 docs/卡回报/ds-b6-11.md。
- valuation.json 的 beautyValue 登在 unbuilt 行（world/rules/tables/valuation.json:51-56、registry.json:32-48）；卷三乙:356；读者 beauty 与 renownBonus（卷二十三 §4.1、§4.7）未建。
- 零引用字段：`salvageFraction`（卷六:119、台账 N-06，残骸比例无人读）、`countsAsWealth`（卷六:120、§4.24 wealth 未建）、`unitOfAccount`（卷六:121、§4.14 合同计价未建）——server-plugin 0 引用；`issuerBacked` 只被 ledger.mjs:741 记成 notRun（§4.15 发行者背书未建）。
- 过程槽 process.price/interestRate/coinCredit/wage 的读者与槽定义（见第 7 条）：卷二 §3.3 求值管线未接 process.*（维度管线 dimensions.mjs 只服务实体维度）。

## 拿不准
- 第 2 条：卷六:227 的 budget 是稀疏 map（缺格=不限，ledger.mjs:1086 的实现约定），而 :1242 说 src_genesis 第 0 日后恒为零。若设计本意是"只有需要显式限额的资源才登格"，则 goods 行缺格不算偏离，只差卷六一句勘误把口径写明；若本意是逐资源登格，则 486 格全缺。需卷六定。
- 第 1 条：item 字段放 _vocab 条目（实现、李白 20:3x ⑤ 认可）与卷六:123 "resfam_goods 行必填"（行在 resources.json）两种读法只能二选一改文字：改实现要动 488 行与 registry、改文字只动卷六一句。倾向改文字（现有读入口已稳定），需李白定。

## 跨卷待判
- currency.json 的重建口径：卷六 §2.5/§4.13 定币值曲线与 `coin` 族字段，旧文件 currency.json 的 basis 引卷十五 §15.3/§15.5（纸券、准备金、发行上限）；判"旧表整张作废按卷六重建"还是"卷十五内容并入卷六 currency.json"要读卷十五 §15.3-§15.5，本卡只按 P-2b 登记记为待重建。
