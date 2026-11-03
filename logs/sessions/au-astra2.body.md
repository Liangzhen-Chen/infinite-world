# 卡 au-astra2：全面审计续做（第 2 会话）

从 F:/dnd/logs/audit/astra/handoff.md 和 coverage.md 接着审计，按 F:/dnd/logs/audit/brief.md 的要求，隔离规则不变。

## 注意
1. 本卡是只读审计。卡头固定规则里的"交卡前必跑"（CORE、同步四件套、导出）不适用于本卡，不要跑。只有在要验证某条具体怀疑时，才单独跑相关测试。
2. **用满本会话时限。** 上一会话 17 分钟就停了，只覆盖了 25/572 个文件。
   - 本会话持续审计，直到接近时限或上下文快用满才停。
   - 每完成一组模块，就更新 coverage.md。
   - 优先审 server-plugin 剩余文件，按 handoff 的顺序来。
3. 节奏：
   - 非核心文件：浏览后写一行结论，有问题再深入；
   - 核心模块：精读。
   
   要的是全库覆盖，同时报准大问题。

结束时更新 handoff.md，并在 F:/dnd/logs/sessions/au-astra2.final.md 写一行：本会话覆盖文件数、累计数、新增发现数。
