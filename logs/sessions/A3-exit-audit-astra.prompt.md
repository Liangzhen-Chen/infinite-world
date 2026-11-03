【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：60 分钟（到 50 分钟时停手写交接）。

审计卡（只读，不改代码）。项目《无限原野》。工作区 F:/dnd-wt/A3CORPUS（已切到最新 a3a）。目的：A3 合入 master 前，按最严口径逐条核对 A3 退出标准是否 100% 满足。
标准来源：docs/架构设计/10 章 A3 行（交付物列表与退出标准）、06 章（尤其 §6.11 验收：意图语料 tests/intents/*.json ≥200 条、来自开发指南 11.3 的 F5/F6 等场景、run-001 等推演）、13 §13.5（仪式动作形状）、F:/dnd/logs/sessions/A3-astra-plan.md 第四节“A3 日常 22 条逐项交付表”。现有证据：独立语料 tests/fixtures/a3-intents-v2.json（120 条，刁钻 40）及判分 tools/a3-score.mjs；最新结果 F:/dnd/logs/sessions/a3-score-v3c.json（A3 自有 99 题全通过；21 题依赖 S4/S5 已登记 docs/A3-后续阶段登记.md）；测试 tests/a3-*.test.mjs（含 a3-daily.test.mjs、a3-builder-ui.test.mjs）。
任务：逐项列出“标准条目 → 现有证据（文件/测试名/数字）→ 是否满足 → 缺口与补齐建议（要做什么、放哪、怎么验证）→ 归属（A3 自有/后续阶段）”。必须覆盖：①语料规模与来源要求（06 §6.11 的 ≥200 条与 tests/intents/ 位置，对照现有 120 条；F5/F6 及开发指南 11.3 场景是否都有可执行题）；②路由/签名/越界/不支持/兜底/构造器六项是否以 A3 自有题为分母 100% 达成及是否满足原阈值；③日常 22 条逐条对应到哪个测试与断言；④交付物：原语表三表合一与适配器、world_propose、两阶段查提、幅度上限与难度派生、档位与反噬表含 rite 行、构造器（方位与分区已登记 S4，核对登记是否存在）、分级配置、RX 编译器与求值器（定点数、守卫提取）、合法性标注扩展点、mark:* 族每个 core 标签至少一条订阅反应与衰减上限、仪式动作形状；⑤事件推演复跑要求（哪些推演、在哪）。
产出 F:/dnd/logs/sessions/A3-exit-audit.md（表格为主，≤3500 字），末尾给“合 master 前必须补齐的清单”按优先级排序，并标注哪些可并行、建议拆几张卡。回复 ≤100 字。
