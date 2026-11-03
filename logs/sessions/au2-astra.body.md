# 卡 au2-astra：全面代码审计（独立，最高档）

你的名字：astra。按 F:/dnd/logs/audit/brief.md 进行全面独立审计。

输出写在 F:/dnd/logs/audit/astra/（目前为空）：findings.md、coverage.md、handoff.md。

## 注意
1. 本卡是只读审计。卡头固定规则里的"交卡前必跑"（CORE、同步四件套、导出）不适用于本卡，不要跑。只有在验证某条具体怀疑时，才单独跑相关测试。
2. 遵守简报的隔离规则：
   - 不读 F:/dnd/logs/review/；
   - 不读 F:/dnd/logs/audit/ 下的其他目录；
   - 不读 F:/dnd/logs/audit-archive/。
3. **用满本会话时限。** 持续审计，直到接近时限或上下文快用满才停。每完成一组模块，就更新 coverage.md。
4. 节奏：
   - 先读北极星与设计；
   - 再按模块组审 server-plugin，然后审 extension、tools；
   - tests 与 world 按简报抽样。
   - 核心模块精读；非核心文件浏览后写一行结论，有问题再深入。

结束时更新 handoff.md，并在 F:/dnd/logs/sessions/au2-astra.final.md 写一行：本会话覆盖文件数、累计数、新增发现数、是否已全部覆盖。
