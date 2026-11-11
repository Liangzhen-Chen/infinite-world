# PERFT1 round 2（PFT，未提交；目标 1.25 仍未达到）

**改动**（均在 F:/dnd-wt/PFT/server-plugin，叠在 83371fb5 上）：
1. market.mjs `subjectiveMarketQuote`：按 (view, document.state, seed, engine) 缓存同参数报价（key=JSON(args)，新 `subjectiveEntry`，原体改名 `readSubjectiveMarketQuote`）。逐配方采购报价走同一缓存。
2. take：engine.mjs 新增 `Draft.look`（先 release，不 expose），storage.mjs 导出 `look(d,...)`；education.mjs 学生循环、advance-registry `orderedSystems`、education-state `settleDemonstrations`（无记录即早退）、household-food `advanceHouseholdFood`（无到期任务即不取快照）、contracts `advanceContracts` 两处，均只读且不跨写持有引用。catchUpLocal、supplyHousehold 未动。
3. storage.mjs `take`：≥64 键的表用逐键复制（`copyTable`）代替展开，键序与值相同，遇 `__proto__` 回退展开；微基准快 20–35%。

**语义**：1 的输入全在键里，缓存随 view/state 一起失效；2 的调用点读后即弃；3 仅复制方式不同。
**坦白**：逃逸点是打地鼠。改后 records 表复制次数仍为 29706（30 天），逃逸被下一个位点（assertNpcObligationAction、nextMinute、buildScheduleHeap、advanceBankFinance、settleRiteInterruptions 等，每步 10+ 处）顶替；真正降复制需统一改逃逸语义，本轮没做。

**行为**：gdump full/quiet 与基准逐字节相同；numeric-digest 相同；bench 60 天两步状态哈希相同；FIELDS_INDEX_CHECK=1 跑 30 天通过。

**测试**：第一轮 241 + 本轮 160 = 401 个已跑；失败子测名与 e2e62705 完全相同（共 13 个文件），无新增。record-index-check 在 PFT 与基准都超 1500 秒无结果。未跑（>15 分钟，交李白）：agriculture、farm-pests-clock、farm-pests-harvest、farm-pests-hunt、ledger-price、ledger-stock、monster-society-content、seasonal-migration、wildlife；另加 record-index-check。注意：第一轮那 241 个是在本轮改动前跑的，未重跑。

**性能**（perf.lock，交替三对，机器仍满载，master 约 105–113 秒，空闲时 41 秒）：
对 1 master=113.6s pft=166.3s（1.463）；对 2 112.5/156.8（1.394）；对 3 105.1/163.6（1.557）。中位 1.463，劣于第一轮 1.345，差别在噪声内，无法证明本轮有收益。

**结论**：行为不变的局部优化只能再省约 3–5%，距 1.25 约差 7%，剩余耗时在 take（storage.mjs:477，约 10%）、新食品供给、采购报价；需重构逃逸语义。按指示停止。
