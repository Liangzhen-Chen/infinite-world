# 偏离清查 09a（卷六 ledger.mjs 前段）

共 5 条，甲 0 乙 4 丙 1，有理由 0 无理由 5。
读范围：卷六-经济.md :97-150、:221-243、:250-343、:346-404；卷三乙-物态类别与物品.md :228-291；server-plugin/kernel/ledger.mjs :1-393（:394 以后未比对；工具分页曾返回 :1-907，仅用于定位，未据此判定）。辅助定位：world/rules/registry.json :111-147、world/rules/tables/economy/ledger.json 全文、economy/resources.json 抽样与计数、world/ontology/dimensions/_vocab.json :926-950、:1015-1035、_units.json 抽样、server-plugin/primitives-runtime.mjs :34-37/:136-141/:242-248、server-plugin/kernel/load/rules.mjs :137-158、server-plugin/kernel/validate/types.mjs :121-252、server-plugin/kernel/load/world.mjs :148、server-plugin/kernel/dimension-writers.mjs:132、server-plugin/kernel/item-state.mjs:142/:522。未读：ledger.mjs :394-1444、卷六 :1-96/:151-220/:244-249/:405 以后、卷三乙 :292 以后、卷二 §2.6。按卡文合并、不另计条：setInTx 五份同式（公共部件审查-乙 第一节）、item-state.mjs 直读 accounts/stockLots（同文第五节第 4 条）。

### 1 §2.1 的 `item` 字段（物品→资源种类指向）无任何加载校验
- 位置：server-plugin/kernel/ledger.mjs:198-215（checkLedgerTables ③）；world/rules/registry.json:115-127
- 设计原文：卷六:123「`resfam_goods` 行必填，指向这一行所对应的物品模板……其余族写 null」
- 代码实际：③ 只查 resource 条目有种类行、unit 在 _units、counterpartRX 只在不受限行、families 含行族；不读资源条目的 `item`，也不查 goods 必填、他族为空、指向的是物品模板；registry 的 economyResources 类型无 `item` 栏
- 理由：无
- 影响：规则缺；数据写错不报（现数据一致：486 个 goods 条目各有 item，2 个非 goods 条目无 item）
- 严重程度：乙
- 合并：无

### 2 `purpose_unmaterialized` 只许聚合账户持用，校验缺
- 位置：server-plugin/kernel/ledger.mjs:376-388（openAccount）、:356-361（checkHolder）
- 设计原文：卷六:133「只有聚合账户上为未物化建筑预置的墙料、固定装置物品与份额放在这一分区……生产、家户、市场都动不了它」
- 代码实际：openAccount 只核 purpose 是词表条目、持有人是主体；不核该分区只出现在居民聚合体账户上，任何主体都可开此分区账户
- 理由：无
- 影响：规则缺（现无数据错）
- 严重程度：乙
- 合并：无

### 3 openAccount 把非整数/形状不合的既有余额静默改写成 0
- 位置：server-plugin/kernel/ledger.mjs:384
- 设计原文：卷六:106「`balance` | integer……余额；非负；只由 `post` 改」；卷六:291「开零余额账户」
- 代码实际：`if (Number.isInteger(readAt(state, segs))) return key;` 否则直接 `setInTx(tx, segs, 0)`；既有值若是小数、字符串或对象，被清成 0 不报错
- 理由：无
- 影响：数据错（坏数据被掩盖并清零，审计再也看不到）
- 严重程度：乙
- 合并：无

### 4 原语执行器自拆账户 id，绕开 parseAccount
- 位置：server-plugin/primitives-runtime.mjs:37、:137-141、:243-248（对照 kernel/ledger.mjs:130-136）
- 设计原文：卷六:358「账户由（持有人、资源、用途）唯一确定」
- 代码实际：primitives-runtime 自设 `ACCOUNT_PARTS`、自按 `.` 拆分账户 id 取 [holder, purpose, kind, key]；`parseAccount` 只被 tests/kernel/ledger.test.mjs 调用，生产代码无调用者
- 理由：无
- 影响：只是形式（两处段序现同，改动时易分叉）
- 严重程度：丙
- 合并：无

### 5 建筑份额族（resfam_asset）的行级专有约束无加载校验
- 位置：server-plugin/kernel/ledger.mjs:198-215（checkLedgerTables ③）
- 设计原文：卷六:112「这一族只对应一行资源种类，即“建筑份额”……这一行的 `sources` 为 `src_genesis`、`src_transform`，`sinks` 只有 `sink_loss`」
- 代码实际：③ 只做 unit 存在、families 一致等通用核对；不查 asset 族恰一行、unit 必须是 asset_share_bp、sources/sinks 必须是那三项
- 理由：无
- 影响：规则缺（现数据一致）
- 严重程度：乙
- 合并：无

## 已登记未建
- 资源键所指对象（物品批次、存量对象、设施实例、地点）的存在核对：ledger.mjs:282-283 注释「待块 6/7（登收尾待办）」。
- openAccount 三项待块 6/7：带 terminal 状态实例而终止标记未写、边界实体作持有人、resfam_claim 只许聚合账户持有（勘误 1118k9）；ledger.mjs:368-371。

## 拿不准
- 实例批次入账腿形状：卷三乙:287「`lot` 只有 `{attrs}`、`{splitFrom}`、`{splitFrom, project}` 三种写法」，而 ledger.mjs:94 另认第四种 `{attrs, instance}`，dimension-writers.mjs:132 生产在用；可能已在卷三乙 §4.4.3 K-3 或勘误登记（本卡未读），待判。
- 卷六:113「资源 `unit` 不得取已作比率等别义的单位代号」无加载校验；_units.json 的 `dimension` 字段能否通用判出（ratio 与 count/asset_share）本卡未判。

## 跨卷待判
- 第 2 条（purpose_unmaterialized 只许聚合账户）：判据要连同卷二十七的聚合体登记与卷十物化建行流程看；且 purpose 条目四字段里没有表达“只许聚合账户”的字段，是否属设计缺口需裁定。
