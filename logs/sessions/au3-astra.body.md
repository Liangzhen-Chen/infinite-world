# 卡 au3-astra：全面代码审计（独立，最高档，接续）

你的名字：astra。按 F:/dnd/logs/audit/brief.md 进行全面独立审计。

上一会话被平台意外中断：内容过滤误判，与你的工作无关。它在 F:/dnd/logs/audit/astra/coverage.md 留下了覆盖台账。从台账接着做，已标"精读"的文件不重做。

输出写在 F:/dnd/logs/audit/astra/：findings.md、coverage.md、handoff.md。

## 注意
1. 本卡是只读审计。卡头固定规则里的"交卡前必跑"不适用于本卡，不要跑。
2. 只读审阅代码，不要写或运行模拟玩家操作的探测脚本。如果要验证某条怀疑，只单独跑仓库里已有的相关测试文件。
3. 遵守隔离规则：
   - 不读 F:/dnd/logs/review/；
   - 不读 F:/dnd/logs/audit/ 下的其他目录；
   - 不读 F:/dnd/logs/audit-archive/。
4. **用满本会话时限。** 每完成一组模块，就更新 coverage.md 和 findings.md。核心模块精读；非核心文件浏览后写一行结论。

结束时更新 handoff.md，并在 F:/dnd/logs/sessions/au3-astra.final.md 写一行：本会话覆盖文件数、累计数、新增发现数、是否已全部覆盖。
