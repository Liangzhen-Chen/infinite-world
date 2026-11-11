# 卡 W8-E6：S5 价格/运输遗留四项

先读 F:/dnd/logs/sessions/w8e-common.md（共同规则）、F:/dnd/docs/产品原则.md，以及 docs/PLAN.md 中 W8-A、W8-D 两行（"遗留→W8-E"部分）。

工作树 F:/dnd-wt/W8E6，分支 t-w8e6-leftovers（基于 s5a c091010c）。

## 要做
1. **"基准估值"角色**：transport.mjs:521 前运（forward）的机会成本仍用 `e.byId.get(item).basePrice` 作 economy:value 的 base。
   - 在 server-plugin/valuation.mjs 加一个 baseline 角色：物品脱离当地稀缺的派生基准值，来源以 valuation/market 现有派生为准，不新造公式。
   - transport.mjs:521 改读它。
   - 同时 grep server-plugin 里剩余 19 处 basePrice：
     - 凡是"把目录价当现价/估值用"的，改走 valuation 对应角色；
     - 规则定义里本来就是基准价的（W8-A 已加注释的那类），保留；
     - 汇报列出改了哪些、保留哪些（文件:行与一句理由）。
2. **无从估价**：W8-A 遗留。物品在当地无从估价（goodsWorth 返回 null）时，案值、赠礼值现在按 0 计。改为：
   - 结果里明确标"无从估价"（结构化字段 + 回执文字）；
   - 法律立案、判罚、赠礼好感不得把它当 0 用。
   - 处理办法先查 docs/架构设计/（grep "无从估价" "unvaluable" "估价"）；文档没写的：
     - 案件按"无法核定案值"处理，只按基础罚则、不加值倍数，并在案卷写明；
     - 赠礼按"对方无法估值"处理：不计价值，只计心意，按现有关系规则里与价值无关的部分。
   - 写手算用例。
3. **post.mjs:21 驿传估算按整点出发**：`departAt:Math.ceil(at/60)*60` 是写死的整点假设。
   - 改读 transport 表里该承运方式的真实发车班次（W8-D 已把发车表入 world/ 的 transport 表，quoteTransport/班次读取函数 grep 获得）；
   - 无班次的方式按"随到随走"。
4. **compat/v2-phase1-engine.mjs:107 价格区间公式**：先确认该文件是否仍被任何生产路径或测试引用（grep import）。
   - 若只剩兼容层且无人引用：写进汇报，建议删除，不要自己删；
   - 若仍在用：改为读 market/valuation 的同一派生，不保留第二套价格公式。

## 可改文件
server-plugin/valuation.mjs、transport.mjs、post.mjs、compat/v2-phase1-engine.mjs、law 相关（案值计算所在文件，grep 确认）、赠礼相关（grep gift/赠）、上面第 1 项涉及的 basePrice 所在文件（但 agriculture.mjs 与 body-needs.mjs/environment*.mjs 正被别的卡改，不要动，写进汇报）；对应测试与新测试 tests/w8e6-leftovers.test.mjs。

## 测试
- 新测试覆盖四项，每条带手算锚点。
- 另逐文件跑：transport*、post*、law、gift/relationship 相关、valuation 相关（tests/w8a-price-migration.test.mjs、tests/ledger-price.test.mjs 很慢可写明未跑）、a3-domain-properties。
- 金快照变化写表，不重生成。
