共 3 条，甲 0 乙 2 丙 1，有理由 0 无理由 3
本卡读了：卷六 :240-284（§3.1 读入口、§2.5 ledger.json 行）、:346-404（§4.1.3 全部规则）、:575-604（§4.6 规则 8 边界供货；卡文写的"规则 8"不在 :346-404 内，按 Grep 定位到这里）、:615-684（§4.7 生产规则；卡文写的 :621-660 无"月结"字样，月结顺序按 Grep 在 :1264，已另读 :1252-1296）、:1252-1296（§4.22 规则 3/4/5）；卷三乙 :1010-1089（§4.3 末、§4.4 全部）、:447、:472（§3.3 taint 写者两行，只按需读这两行，未通读 §3.3）；文件：server-plugin/kernel/ledger.mjs :773-1443（本卡②全部）、:140-250（checkLedgerTables 的 K3-40 窗口校验）、:400-746（post/postDraft 的 bm_capped 放行与 usedByDay 写）、:1083-1100（budgetOn）；server-plugin/item-lots.mjs :1-160、server-plugin/kernel/item-state.mjs :464-500（K-3 腐坏档与 mergeMaxGap 判定）；数据：world/rules/tables/economy/ledger.json、world/rules/tables/kernel-constants.json（SCALE=10000）、world/rules/registry.json :133-146（economyLedger 类型）、world/ontology/state-owners.json :190-211（kernelApi 登记）。没读：卷六 §4.22 其余规则、§4.6 规则 8 以外各条、卷六 §7 退役清单、卷三乙 §3.3 全节与 §2.3 批次结构原文、卷八b 全卷、块 7 与卷十九代码。

核过一致、不记条：prorateCapped 的 floor(q×limit÷total) 与"余数按 key 升序逐个补一"用 BigInt 整数算（ledger.mjs:1138-1146），对卷六 :379；budget 格来源由入口优先 budgetOn 取限额、调用方 limit 不采用（:1215-1216），:1190 自述的反绕过对 budget 格来源真做到；无 budget 格的边界来源用调用方 limit（:1216，与 :379 输入签名"null = 不限"一致，边界限额算法责任在块 7 调用方）；重放按 day+来源读 usedByDay 当日项，重跑返回 alreadyBooked（:1232-1238）；weightedMean 走 det-math 定点、无浮点（:23、:1336-1339）；K-3 判同键、逐件实例永不合并（:1348-1355），腐坏同档与进度差在 item-state.mjs:471-489 判；balance/accountsOf/stockIn 纯读、无 setInTx（:1015-1081）；closeLedgerPeriod 先 writeReport 后清、写报抛错不清（:1289-1294）；auditConservation 守恒式整数、不设容差（:939-977）。

### 1 无 budget 格的限额来源被 allocateCapped 当作"不限"
- 位置：server-plugin/kernel/ledger.mjs:1096、:1162-1170
- 设计原文：卷六 :379「无 `budget` 格的边界供货，限额不在 `ledger.json`，用调用方传入的值，该值由块 7 调用方按 §4.6 规则 8 算定并负责」；:227「`limit` 空 = 不限」只指 budget 格内的 limit 字段
- 代码实际：budgetOn 对"没有这一格"返回 `{active: true, limit: null}`，allocateCapped 把 null 直接交 prorateCapped，全部申请照准；仅注释 :1086、:1162 自述"空 = 不限"
- 理由：无（仅注释自述；问题.md、裁定、勘误均无"缺格即不限"的登记）
- 影响：规则缺（null 绕过）。边界供货若经 allocateCapped 分配，会跳过 §4.6 规则 8 的按量限额与钱外流上限；现 allocateCapped 无生产调用者（只有 tests/kernel/ledger-capped.test.mjs:107 断言"无 budget 格不限"），暂未出错
- 严重程度：乙
- 合并：无

### 2 recordTaint 的 cause 未限定为入赃、消赃两个代号
- 位置：server-plugin/kernel/ledger.mjs:1418-1421
- 设计原文：卷三乙 :472「向账本提交一条 {target: lotRef 或实例 id, taint: 新值, cause: 入赃或消赃的代号} 记录」；:1047「taint 只在四处改变：合并、制造、入赃、消赃」
- 代码实际：cause 只核"是 verb 族已登记条目"，不核是不是入赃或消赃的代号；任意已登记 verb 都可改批次与实例的 taint
- 理由：无；Q-25（卷三乙 :2138）只登记"卷八b 成稿时登记两个 cause 代号"，没写代号登记前可接受任一 verb
- 影响：规则缺（绕过）。"洗白只能通过法律程序"可被任一已登记 verb 借道
- 严重程度：乙
- 合并：无

### 3 K-3 的判同键、必空键、腐坏键三组写在代码常量里
- 位置：server-plugin/kernel/ledger.mjs:1328-1331、:1348-1355
- 设计原文：卷三乙 :1046（K-3）「source / qualityTier / purports / batchTag / material / project 全同、temperature、burn 与 leakAnchorDay 都为空……的批次才合并」
- 代码实际：三组键写成 `LOT_SAME_KEYS`、`LOT_MUST_BE_EMPTY`、`LOT_ROT_KEYS` 常量；批次结构在 world/ontology/named-structs.json:486 是 `opaque`，没有可读的数据表键，改判同条件必须改 .mjs
- 理由：无（11-18 08:18 裁定的 S13④ 基线卡只覆盖协议标记，未涵盖 K-3 合并键；卷三乙 :1046 只给规则，未登记为规则表键）
- 影响：只是形式（规则本身与卷文一致，移入数据表要另立登记）
- 严重程度：丙
- 合并：无

## 已登记未建

1. stockIn 的"持有人是否在 scopePlaceId 范围内、是否在场"一半：卷六 :258（§3.1 "范围内聚合"）、:384（§4.1 规则 10 "只数……在场持有人"）；登记：docs/审查/李白裁定-1117.md:727（K3-44）、docs/迁移体检/块3.md。代码 ledger.mjs:1052-1080 有候选时抛 E-DIM-UNKNOWN-READ，不按在场或不在场放过。
2. 限额通道的当日申请存放（tradeRuns）与日终调用（settleTrade）：卷六 :379、:580-585（§4.6 规则 8 三步）；登记：docs/迁移体检/块3.md:50（K3-45）、docs/迁移体检/块4.md:48（K4-28）。ledger.mjs:1103 自述归块 7；settleCappedAllocation 现只有开局资产一个生产调用者（server-plugin/kernel/gen/assetcalls.mjs:50）。
3. closePeriod 的月报写入 econReports 与期号：卷六 :1264、:1277（§4.22 规则 4、5 末项）；登记：docs/迁移体检/块3.md:59（K3-11 月报一半 → 块 7）。closeLedgerPeriod 由调用方传入 writeReport（ledger.mjs:1259-1261、:1289-1294），现只有测试调用。
4. accountsOf 的按物品经济大类聚合（库存槽视图）：卷六 :384（§4.1 规则 10）、卷三乙 §4.3 C-6；登记：docs/迁移体检/块3.md:26（K3-10，随块 6 物品首卡回填）。ledger.mjs:1025 自述要块 6 物品；现只按 family/purpose 聚合。
5. 备料批次的 project sponsor 校验依赖 buildProjectView：卷三乙 :1051（K-8）、卷十九 §3.2/§3.3；登记：docs/审查/李白裁定-1117.md:869-872（11-18 05:28 裁定①）。ledger.mjs:495-518 在视图未登记时报 E-DIM-UNKNOWN-READ，不默认通过。

## 拿不准

1. weightedMean 用批次数量（件数）做权重，卷三乙 K-3/K-4 原句写的是"按质量加权"（:1046、:1047）。代码注释与 item-state.mjs:465-466 均称"同一种物品、判同键含 material 相同，故件数之比即质量之比"；同种类同材料的松货若每件质量相同则两种权重结果相同，但批次数量单位是件还是质量、每件质量是否可能随物态/含水变化，本卡所读范围内没有一句明写，故不判。相关位置：ledger.mjs:1336-1339、item-state.mjs 腐坏加权同式。
2. recordTaint 没有留下可查的"改赃份额记录"：只有 stockLots/itemInstances 上的新值，没有事件或记录留存。§3.3 :472 说"向账本提交一条记录"，V3-4.4-I（卷三乙 :1074）说每次改变要能在账本记录里找到对应的一条；"记录"是否指这次函数调用本身，卷八b 或卷十二未写，故不判。
3. auditLots 的 taint、purports 校验只走 stockLots，不查 itemInstances；实例 taint 由 state-owners.json:91 的 pathTypes `number:fraction` 与 item.json:111 的维度域管。K-8（卷三乙 :1051）把实例与批次并列写在同一行，但没有说审计必须两处都走，故不判是否缺一半。

## 跨卷待判

1. 发现 2 要卷三乙 §3.3（:472）+ 卷八b 成稿登记的两个 cause 代号（卷三乙 :1940、:2138 Q-25）+ 卷六 §4.1/§3.3 的 taint 唯一写者口径。卷八b 未成稿，代号未登记；是现在先按"只收该两个代号、未登记即拒"实现，还是等卷八b，需主会话或李白定。
2. weightedMean 的质量权重（拿不准 1）若要判，要卷三乙 §2.3 批次结构（数量单位、每件质量是否随批次变）与卷六 §2.1 资源种类行 unit 对读，涉及两卷，本卡未通读 §2.3。
