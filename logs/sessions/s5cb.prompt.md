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

# 卡 S5CB：S5 收口回归——工资柜台、店主周补货雇工、远方郡往返份额、同日再买深度

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。全量扫描 s5a@75cc53c2 对照 master 后，S5 自有测试与回归中仍失败：
1. tests/s5-04b.test.mjs 两项："wage counter: when the counter runs short the shortfall is wage debt e…"、"npc shopkeepers: within a week each stocks up, reprices and hires by h…"（S5 自有测试，从未通过）。
2. tests/s5-09.test.mjs 一项："three native county round trips merge actual ownership shares without a second genesis"。
3. tests/a1-lt-scenarios.test.mjs "L3 同一天再买同一件东西，成交深度真实上升且总额一次取整"（master 上该用例通过，s5a 失败；master 失败的是另一项）。
逐项查根因到文件:行（多半与 K02/K05/K08/K12 的市场、营业、工资规律或 FIXK08 新增到场行商有关）。规律缺环就补规律；规律正确而锚点过时就按新规律手算更新并写推导；不放宽、不删用例、不按名字特判。往返守恒（钱货人口所有权份额）是硬要求。
验收：共同规则清单；这三个文件只剩 master 上同名失败（a1-lt 的 master 失败项）；汇报 ≤300 字。
