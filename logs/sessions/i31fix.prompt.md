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
限时：150 分钟（到 140 分钟时停手写交接）。

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
