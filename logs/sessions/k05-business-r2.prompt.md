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
限时：120 分钟（到 110 分钟时停手写交接）。

K05 返修一处（主会话审 diff 后）：

问题：businessLifecycle 的评估窗口取 market.personalReserveDays（1 天），用"过去一天的成交"预测"未来一天"；决策噪声按日抽，幅度为收入 ±250‰；转换成本只有 transferMinutes 的工时机会成本，几乎为零。三者叠加：薄利店（加价约 1.2、扣税后毛利约一成多）在噪声偏低的日子会算出"暂停优于续营"，次日噪声变了又恢复——店铺日日开关，现实中不会这样；一天没客人也会被当成整个窗口没收入。

要改：
1. 评估窗口 = 经营计划期，从数据派生：在本卡独占的 world/meta/rules.json businessLifecycle 段加 horizonDays（默认取 calendar.daysPerMonth，写明依据），用同长度的历史窗口估计收入与可变成本；历史不足一个窗口时，按已有天数折算，并标"依据不足"（不足时倾向维持现状，而不是据此关门）。
2. 决策噪声键按计划期取（同一计划期内同一店主同一店只有一个噪声值），不按日重抽。
3. 转换成本要包括真实的重开代价：暂停期间的停摆工时外，恢复需要的备货/重新开张工时；若现有原语没有更多可派生项，就至少按 generic.transferMinutes 计开、关各一次，并在暂停后设最短暂停期（从计划期派生，例如不早于下一个补货周期）再允许恢复，避免同一计划期内来回切换。
4. 手算锚点保持（20/18/100 → 2；现钱 1、第 2 天付 5、第 5 天收 20 → 缺口 4），并新增：薄利店在一个计划期内不会因单日噪声暂停又恢复（固定种子，30 天内状态切换次数 ≤1，给出手算）。
5. s5-w4-economy 两项基线旧失败不在本卡范围，保持不动。

按原卡验收逐文件重跑受影响测试，汇报同原卡。
