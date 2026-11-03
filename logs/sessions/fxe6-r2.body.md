FXE6 返修（主会话审 diff 后打回核心改动，先读完再动手）：

1. **撤回 server-plugin/market.mjs 第 208 行 net 符号翻转**。原写法正确：
   - side 是市场一方视角：`business.keeper===seller → 'sell'`（店卖出），`seller==='player' → 'buy'`（市场收进）。
   - supply.supply 是当前（已含今日成交后）的可售存量；opening=supply+net 是倒推的开市存量：市场今天卖出 q → 开市时多 q（sell:+q）；市场收进 q → 开市时少 q（buy:-q）。
   - depth=1+depthImpact·net/opening：今日净卖出 → 价格上浮；净收进 → 价格下压。翻转后变成"卖得越多越便宜"，违背 15 §15.2 深度规律。
   你基于翻转更新的锚点（S5-F-3/4/6/8、a1b、s2c-fire、turn-gate 等）需按原规律重新手算；凡原测试本来就对的，恢复原值。
2. **典当/抵押估值缺规律（W8B 本金 50→300 的根因）**：现行用 单价×件数×预支比例。现实中当铺按"能卖回多少"放款，一次性变现大批货会沿需求曲线压价。规律：抵押/质押估值 = 在当地市场**逐件卖出（sell 侧曲线积分，quoteSupply 的 integral 同一套）**可得的清算值，再乘预支比例；少量（≤零售阈值）时与单价×件数一致。找到典当/质押估值入口（grep pawn/质押/预支/collateral 于 credit.mjs、finance-bank.mjs、valuation.mjs），修在估值角色层，对所有抵押物通用，不按物品特判。手算 W8B-4/5/9 与 S5-W4 F007 的新值。
3. 其余保留：K12 驿站/车行下一可乘班次 1860 的锚点、F048 用真实可执行买卖重建前提，这两处方向正确，复核后保留。
4. 未解决项（s5-04 signed-wage、ledger-reconcile、s3-e04、w2-s2、w2-s3）在第 1 点撤回后先重跑，很可能随之变化；仍失败的逐项给根因（文件:行）与处理，不得放宽断言、不得为通过而改世界数据或塞库存。
5. 金快照：撤回翻转后理应大幅回到原值；如因第 2 点变化，出字段表。

验收同原卡（13 个文件逐文件），外加 finance-assets、credit、s5-law-seasonal-credit、s5-08、w8e6-leftovers、s5-law-household-budget 不退化。汇报附逐项旧值/新值算式表。
