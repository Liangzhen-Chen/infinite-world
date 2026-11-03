【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

【交卡前必跑（10-26 起）】交卡前逐文件跑完以下检查并在汇报中写结果；不过的先修，不要留给门禁：
- CORE：tests/engine、tests/storage、tests/plugin；
- 同步四件套：先 `node tools/export-actions.mjs` 重导，再跑 tests/actions-catalog、tests/action-registry、tests/advance-registry、tests/arch-metrics。**不得重生成 advance-registry 金快照**（不得设 UPDATE_ADVANCE_GOLDEN）；若它因本卡有意改动而不一致，在汇报中逐项列出"字段：旧→新、原因"，由主会话审核后统一重生成。
- 本卡新增或修改的测试，以及本卡直接改到的模块的同名测试；
- 自查改动路径：不得触及禁区（docs/架构设计/、已审 W1 骨架 world/design/、dist/、docs/待办.md、docs/问题.md）。确有必要改的，停下写进汇报。
限时：240 分钟（到 230 分钟时停手写交接）。

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
