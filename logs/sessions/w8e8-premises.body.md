# 卡 W8-E8：租田种地 + 自营工坊存料

先读：
- F:/dnd/logs/sessions/w8e-common.md（共同规则）；
- F:/dnd/docs/产品原则.md；
- docs/架构设计/ 中关于田地租佃、持有、工坊库存的段落（grep "租田" "佃" "lease" "asset_lease" "工坊" "workshop" "库存"）。

工作树 F:/dnd-wt/W8E8，分支 t-w8e8-premises（基于 s5a 80afd9c4）。

## 背景
1. **私田取得缺入口**（W8-E5 通关脚本 todo）：
   - agriculture.mjs privateFarmAction（约 482 行）只认 `asset.owner==='player'` 的登记田地；
   - 玩家没有任何真实途径买田或租田；
   - 引擎已有 asset_lease 记录与 finance-assets.mjs 的租赁/解约（terminateAssetLease），agriculture 也已检查"他人有效租赁"。
2. **自营工坊材料与产出只走行囊**（W8-E1 遗留）：
   - W8-C 起玩家入囊有负重（carry.mjs，安全负重 10+2×力量 公斤）；
   - 玩家自有工坊一个班次的木料就超过 30 公斤，tests/finance-assets.test.mjs 有 4 个工坊用例（98、122、131 行起，含 F083）报"拿不动"。

## 要做
1. **租田**：
   - 让玩家能向登记田地的持有人租入田地：
     - 复用现有 asset_lease 与租约条款、付款、同意、到期、解约这一套，不另造；
     - 田主须本人同意，租金按现有租金派生（地产估值或租金资本化，grep valuation property 角色）。
   - privateFarmAction 接受"本人持有"或"本人为有效租约承租人"两种合法使用权，其余照旧拒绝。
   - 租期内种下的作物归承租人。到期未收的处理以文档为准；文档没写的，按"作物归承租人，须在到期前收走，到期后留田随田主"，并在回执写明。
   - 把 tests/s5-playthrough.test.mjs 第 83 行的 todo 转为正式步骤，全程走玩家菜单：租田 → 播种 → 推进到成熟 → 负重内分批收割 → 卖自产粮 → 存入钱庄。
     - 背不动的部分按 W8-E1 的分批收割，多跑几趟。
     - 每步手算锚点。
   - 同步改 docs/可玩版本-S5.md 的说明和已知限制。
2. **自营工坊存料**：
   - 玩家自有或承租的工坊有自己的库存：
     - 材料从工坊库存领用，产出入工坊库存；
     - 玩家在工坊里可以把物品在行囊和工坊库存之间搬（搬入行囊受负重检查）。
   - 先看引擎是否已有建筑或资产库存：engine.bagPath 对 estate_/liq_ 走 protocol_assets inventory；建筑 inventory 用 grep 查。有就复用，没有就按最小改动加。
   - 店铺的"店存与行囊分离"已登记 S7，本卡不做店铺，除非测试因负重失败。若失败，写进汇报，不要顺手扩大。
   - finance-assets.test.mjs 的 4 个工坊用例必须恢复通过：前提改为把材料放进工坊库存，断言意图不变，产出数量与品质的手算锚点不变。
3. 账本守恒：工坊库存要进账本，有 stock 账户与持有写入者声明（holdings-writers 规则）。

## 可改文件
- server-plugin/agriculture.mjs（只限 privateFarmAction 的使用权判断与回执）；
- finance-assets.mjs、business.mjs（只限工坊）、items.mjs/stock.mjs（只追加）、contract-state.mjs（只限租约条款）；
- 对应测试、tests/s5-playthrough.test.mjs、docs/可玩版本-S5.md、新测试 tests/w8e8-premises.test.mjs。
- 不改 market.mjs、valuation.mjs（W8-E6 正在改）。

## 测试
- 逐文件跑：w8e8-premises、s5-playthrough、finance-assets、business 相关、agriculture 相关快测（s5-05、a3-domain-properties、w8c-carry）、holdings-writers、advance-registry、arch-metrics、numeric-persistence。
- agriculture.test.mjs 很慢，不必跑。
