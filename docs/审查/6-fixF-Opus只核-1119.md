# 补值卡 F《实例批次禁合并、实例批次键、三卷勘误》Opus 只核（11-19）

核者：Claude Opus 5.5 中档（只读，非写者）。对象：分支 ds/b6-fixF，HEAD 1be711a4a，`git diff origin/master...HEAD`（合并基 fa4698a6e）。
依据：李白 11-19 21:0x ②③（origin/master docs/审查/李白裁定-1117.md:1380 起）；卷三乙 K-2 :1036、K-3 :1037、K-8 :1042；卷六 §2.1 `resource` 行 :104；卷十四 :961；卷二 §2.7 kernelApi 闭集（:558 起）。

## 结论：必须改（两条，均小）

### 必须改 1：`lotKeyCompare` 未登记 kernelApi
- `server-plugin/item-lots.mjs:6` 规则层文件新 import `kernel/item-state.mjs#lotKeyCompare`；`world/ontology/state-owners.json` kernelApi 只登记了 `item-state.mjs#lotSeq`（:220），没有 `lotKeyCompare`。卷二 §2.7 kernelApi 是"逐个导出名的闭集，无通配"，规则层调未登记导出即越界。item-lots.mjs 其余 import（lotsView、rotStep、lotMergeVerdict、rottenLots、itemOfResource、post、mergeLots、clockView）都已登记，只这一个漏。pre_commit 没抓到是因为 import_edge 探测器尚不核到导出名（tools/accept/detectors/import_edge.mjs:4 自注"未覆盖"），不是合规证明。
- 改法：state-owners.json 补 `{"export": "kernel/item-state.mjs#lotKeyCompare", "callers": ["rules"], "acceptsState": false}`；`lotSeq` 若已无规则层调用方，同卡收窄或说明保留理由。

### 必须改 2：审计"与实例一一对应"有两个洞
`server-plugin/kernel/ledger.mjs` auditLots（实例键分支约 :808–:811，少一件循环约 :832–:838）：
- (a) 不核种类：实例键只核"实例行存在、余额为 1"，不核该批所在资源种类等于该实例模板对应的资源种类（卷六 §2.1 资源种类行 `item` 字段，勘误 1119k12）。把 `lot_i_<斧实例>` 记到粮食种类下，审计照样过；post 对 `{attrs, instance}` 腿也不核这一点。"一一对应"应含"对到的是这件实例那一种"。
- (b) 不核已终止实例：实例已终止（`terminated` 有标记）而其实例批次仍有余额 1，现码既不报多一件（实例行仍在）也不报少一件（循环跳过已终止）。账本会多算一件已不存在的东西。
- 改法：实例键分支补"种类 = 实例模板的资源种类"与"实例未终止"两核，报已登记码；测试补两条反例（错种类、已终止仍有批）。规则层整类判，不按 id。

## 逐条核对（重点 1–7）

1. **K-3 整类、先于其他条件；两键必传；只搬不并；散货未变**：`lotsUnmergeable`（ledger.mjs:1338）先查两键是否字符串（缺键抛 E-DIM-STRUCT-FIELD），再判任一为实例键即返原因，位置在属性比较之前，符合 K-3 勘误"先于上述各条判"。mergeLots（:1375）、lotMergeVerdict（item-state.mjs:478）两个调用方都传键。transferGoods 的合并步经 lotMergeVerdict 自然不并；测试断言 `out.merged` 为 `[]`。散货：块 3 原测试只增不改，新测试末段在同一用例里验证散货 5+5 照旧并成 10、原批零行保留。块 3 已封行为未改。小毛病（不阻塞）：ledger.mjs:1332 的 JSDoc 首行仍写 `lotsUnmergeable(a, b)`，应同步成四参。
2. **实例批次键**：`lot_i_<实例id>`，由 id 确定性派生；新建与转手都不碰 `ledgerCounters.lotNext`（测试断言 `state.ledgerCounters` 为 undefined）；不另存指针。序号键数字串不含下划线，`lot_i` 也不是 `lot_i_` 前缀，两种文法不相交。零行：散货零行照旧保留，实例批次出账到 0 时余额行与 stockLots 行同删（:694）。这是一处新行为，但只作用于实例键，K-3 勘误原文写了"原账户该行即删"，跟勘误后的卷文一致，没有改散货的已封口径。同账户再入同一实例键报 E-DIM-ID-DUPLICATE，挡住同账户自拆。
3. **"每件未终止实例恰有自己那一批"是否过严**：不过严，照卷文保留。卷三乙 K-2（:1036，勘误 1118k8）写明容器不作账本持有人，容器里的物品数量仍记在容器所属持有人的账户上；固定装置同理。所以装进容器后实例批次仍在某账户名下，这条核不依赖持有链。卡回报"未解决"第一条的顾虑不成立，可删。现行代码里没有不终止实例就把实例批次出账到汇的路径（item-condition.mjs 只写成色）；以后接"坏透/毁坏"时须同事务终止实例，否则这条会报，属正确报错。
4. **测试**：三把斧照裁定②原样（PA 建 a、b，PB 建 c，转 2 件，PB 名下三个实例批次各数量 1、键派生、不占计数器、PA 无残行、审计空）；mergeLots 拒实例批次、lotsUnmergeable 缺键拒；审计反例：多一件、少一件、数量 2、两账户同键。都真测到。弱点：最后一段"序号键只核序号"用的是 `lot_zz`，没有真用一个 `lot_i_` 开头的键去试序号分支，注释言过其实。改必须改 2 时可顺手补，不单独卡封。
5. **勘误 1119k13 体例**：三卷"勘误前快照"都与合并基、也与 origin/master 现行正文同 blob（4330aebd、832a2c0f、e4ff1a29）；现行快照 v7/v10/v8 跟改后正文 cmp 一致；版本号未升；附录各加一行，历史修订行未回改。卷十四 :961 只改一处代号。quality.json 出处与 basis 两处文字已同步。小建议（不阻塞）：K-3 勘误句里写了"K-8 对实例批次键核…"，K-8 行（:1042）本身没加。校验条的唯一出处宜在 K-8，K-3 只引用。可以放到下次勘误补，修改轮不加新设计。
6. **卡文外改动**：markers.mjs `LOT_LEG_KEYS` 加 `instance`，键集记号的唯一定义源就在这里，必要；item-state.mjs `lotKeyCompare` 是因为 lotSeq 对实例键无意义、排序须有全序，必要且最小，但缺 kernelApi 登记（必须改 1）。criteria.json：17 类判据只动了 print、rev 与修订记录，判据本身没改，经 register.mjs 走。
7. **亲跑**：`node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` 末段 `ℹ tests 1060 / ℹ pass 1060 / ℹ fail 0`；`node tools/accept/run.mjs pre_commit` 输出 `"verdict": "pass"`。

## 合入提示（不属本卡判定）
origin/master 已前进到含 6-22（779dc73ff，1073 测试），与本支在 tools/accept/criteria.json、world/rules/tables/quality.json、tests/kernel/item-lots.test.mjs 等处重叠。改完后须先变基到新 master，重跑 register 与全量测试。还要核 6-22 的物品表里挂了逐件实例组件类的模板在实例批次键下是否全过。

## 北极星与卡头第二节
没有按 id、名字写特判；判据只看键的形状，属整类；没有假数据。上面两条必须改都落在规则层（kernelApi 声明、K-8 审计），不涉及特例。按"判必须改的，改完至少再复核一次才封"，改后需再核一次（本卡触及内核账本，仍归 Opus 档）。
