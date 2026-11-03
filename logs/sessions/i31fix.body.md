# 卡 I31FIX：K04 合入后"一次推进 10 天"与"逐日推进"结果不同（I31 全序不变量）

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/I31FIX（由 law-card.sh 从 s5a 当前头建立）。

## 事实（主会话二分）
tests/invariants/i31-total-order.test.mjs "真实引擎 I31：一次推进 10 天与逐日推进产生相同事件序列（含 seq）" 在 s5a 失败（daily and single advance states 不同）；在 S5 起点通过；沿 s5a 合并点二分，首个失败合并为 **2d76b73d（merge t-k04-law，家户劳力与保留工资）**。docs/架构设计/14-确定性与时序.md 第 3 行：逐日推进与一次推进 N 天的事件序列必须相同（I31）。

## 要做
1. 用该测试找出第一处分歧的字段/事件，追到代码（文件:行）。K04 改过的地方：npc-state.mjs householdWorkTime（及后来 FXM 的 agriculturalWorkforce）、labor-market.mjs 结薪/出勤、extraction.mjs mineEmployment（按真实出勤结算）、npc-schedule 出勤记录。常见原因：读取推进起点的状态而不是当日状态、按推进区间而非按日计算出勤/工时、在区间末尾一次性结算、取整/余数按区间累计。
2. 修代码使两种推进逐字节一致，不改测试、不放宽断言；不得通过"关掉"劳力规律来过测。
3. 不改 npc-life*、household-budget.mjs、agriculture.mjs、advance-registry.mjs、storage.mjs（K15 在改）；确需改时停下报告。

## 验收
i31-total-order 全过；全部 tests/invariants；s5-law-household-labor、labor-market、npc-schedule、s5-law-production-inputs、extraction 相关测试、CORE、同步四件套。金快照若变出字段表并说明为什么原先依赖推进分段。
