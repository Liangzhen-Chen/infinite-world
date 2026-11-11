# 卡 TRI2：s3-run001 与 ledger-price 的 S5 回归分诊与修复

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/TRI2，分支 t-tri2，基于 s5a@5f757b6c。

## 事实（主会话实测）
- tests/s3-run001.test.mjs：master 4/0（1561 秒）；s5a 1/3（360 秒）。S5 期间引入。
- tests/ledger-price.test.mjs：s5a 9/3（6889 秒），失败：①"价格输入点登记：每个读取点有调用处，每处调用都已登记"（新规律卡模块读价未登记）②"价格双读对照：交易、借贷商税、受雇、钱庄、离屏推进…读账户与读旧字段结算完全相同"③"定点：组织股份估值读发行方现款与库存"。慢主要在"农业季逐日推进"子测（agriculture 慢已登记 S7）。
- 可用二分：`git -C F:/dnd rev-list --first-parent` 沿 s5a 合并点；你不能 checkout，但可以用 git show 读旧版本对照。

## 要做
1. 逐项定位根因（文件:行）与引入合并，判定：登记缺漏（补登记）、新旧读法真不一致（修读法，使两者一致——这是双读对照的设计目的，不能删对照）、已批准规律变化（手算更新锚点）、真错误（修代码）。
2. 不删测试、不放宽断言、不为通过改世界数据。
3. **文件边界**：K15（家户进餐）正在改 business.mjs、household-budget.mjs、npc-life*、agriculture.mjs、advance-registry.mjs——这些文件需要改时**先停下写报告**，不要改；其他文件可改。

## 验收
s3-run001、ledger-price 逐文件（ledger-price 超 90 分钟列主会话外跑并给出你已验证的子测结果）；CORE、同步四件套；受影响模块的引用测试。汇报：每处失败的根因、引入合并、处理。
