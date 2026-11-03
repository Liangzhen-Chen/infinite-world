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
限时：180 分钟（到 170 分钟时停手写交接）。

K15 续做：只做性能，行为必须与你当前版本逐字节一致（以你的 K15-golden-table.md 为准，不再改规律）。

现状：bench-farm-pests 30×2 master 105.5 秒 / K15 135.3 秒，比值 1.28（门槛 ≤1.10）。

做法（参考 PERFS5/PERFS6 已合入的手段：stateMemo、类别记录索引、精确预筛、同次推进复用视图）：
1. 用 `node --cpu-prof` 对 K15 与基线（git show 07477535 的同一基准）做剖析，`node F:/dnd-tools/profile-diff.mjs base tip 30` 找出进餐结算新增的热点。
2. 典型可省之处（需剖析确认）：householdMealPlan 每户每日重复构建 householdResources/家庭成员/营养需求；同一聚落同一日的公粮配给与粮仓读取可一次计算后分配；无变化的家户（库存充足、无新事件）可以由精确条件跳过重复的全量预算重算但仍真实扣粮；避免每户扫全部 records/持有。
3. 证据：advance-registry 结果与你当前 K15 版本逐字节一致（导出前后 golden-dump 对比为 0 差异），numeric-digest 一致；FIELDS_INDEX_CHECK=1 跑 s5-law-household-meals、s5-law-household-budget、npc-life-health、s5-law-periodic-market。
4. 目标 bench 相对 master ≤1.10（F:/dnd-tools/perf-gate.sh F:/dnd-wt/K15 默认配对；你不能 checkout 的话，按你上轮的顺序双树运行法给三对中位数）。

汇报：每处热点修法与提速数字、最终比值、逐字节一致的证据。
