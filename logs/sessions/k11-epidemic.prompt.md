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

# 卡 K11：疫病接触口径（S5 规律卡，第 1 波）

先读：
- F:/dnd/logs/sessions/w8e-common.md（共同规则）
- docs/产品原则.md
- docs/架构设计/07-离屏与性能.md §7.3.1、14-确定性与时序.md §14.5.1（10-29 新修订）
- F:/dnd/logs/audit/LAW-astra-001/s5-cards.md 的 §0（公共约束与共同验收 C）与 K11 全节

工作树 F:/dnd-wt/K11，分支 t-k11-epidemic，基于 s5a@d47ec5c7。

## 任务
按 s5-cards.md 的 K11 节执行：规律表述、文件所有权、原语、手算与失败路径、验收、并行边界都以该节为准。

审计原文在 F:/dnd/logs/audit/LAW-astra-001/tables/10-人口与健康.md 的 POP02，需要时读。

补充两点：
- 随机性与个体差异按 05 §5.7 新增的"差异、噪声与少数行为"条和 14 §14.5.1 执行。共同冲击（同一接触群的疫情）共享事件，不给每个个体独立掷"疫情"。
- 本卡只读 world/meta/rules.json；world/rules/tables/balance/health.json 可改。

## 汇报
按共同规则；另附手算锚点与实测对照表。
