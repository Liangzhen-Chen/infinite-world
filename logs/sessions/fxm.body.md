# 卡 FXM：K08 合并后的 4 个交互回归 + 劳力市场缺工预测接点

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/FXM，分支 t-fxm，基于 s5a@9b105b45（已含 K01–K06、K08–K12、FXE3/FXE6/FXE8）。

## A. 4 个交互回归
K08（远期按可靠度与时间折扣计入报价有效存量、可成交深度只读实物、店铺正午结算、赶集占真实路程工时、顾客按 K02 家户预算花钱）合入后，以下测试在 s5a 失败；它们的锚点刚由 FXE6/FXE8 在 K08 之前定下：
- s5-w4-economy（1）、s5-04（2）——FXE6 锚点；
- quest-sources（4）、entity-world（1）——FXE8 锚点（铁镰进货款入公库 20/40 等）。
逐项手算新旧值（公式、输入、文件:行），判定是合并后规律的正确结果（更新严格锚点并注明）还是错误（修代码，不动断言）。不得放宽断言、不得塞库存或改世界数据凑数。

## B. 劳力市场缺工预测接点（K06 报告）
server-plugin/labor-market.mjs:129–133 的农忙缺工预测仍按旧人口比例与整数工位计算，没有扣掉照料、通勤、赶集、已受雇出勤。改为复用 K04 的 npc-state.mjs:householdWorkTime 与 K06 agriculture 的同一派生口径（实际可投入田间的分钟），让预测与实际日结一致。手算锚点：给一个村，算出旧预测与新预测各多少工日、与 K06 实际日结的田间分钟对得上。

## 验收
A 的 4 个文件逐文件全过；labor-market、s5-law-household-labor、s5-law-production-inputs、agriculture 以外的农业相关短测、CORE、同步四件套；s5-law-periodic-market、s5-08、finance-assets、w8b-credit-tender 不退化。agriculture 长测列主会话。金快照若变，出字段表。
