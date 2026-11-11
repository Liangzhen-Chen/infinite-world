【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：120 分钟（到 110 分钟时停手写交接）。

你是 A3 意图语料的原出题者（续）。工作区 F:/dnd-wt/A3CORPUS（只读参考，已切到最新 a3a），不读 server-plugin/ 与 extension/。依据 docs/A3-退出审计.md“语料与六项指标”与 docs/架构设计/06 §6.11：意图语料须 ≥200 条独立可执行题、逐题来源、刁钻 ≥30%。
任务：在现有 120 条（F:/dnd/logs/sessions/a3-intents-v2.json）之上独立新增至少 90 条（总数 ≥210），延续现有字段与 setup 结构化前提规范；每题加 source 字段：开发指南 11.3 场景（逐个覆盖 F1–F6 等全部条目）、事件推演 run-001/run-002 日志条目（docs/probes/ 下）、或玩家常见日常（对照 A3 日常 22 条与 daily-b2 表）。刁钻比例维持 ≥30%。不看实现、不迎合当前引擎；前提只写原文陈述的事实；涉及坐标/分区/距离视线等空间细节的题照常出，但在复审记录注明“可能依赖 S4”。同时给旧 120 条逐题补 source。直接改 F:/dnd/logs/sessions/a3-intents-v2.json 与 a3-intents-v2.md；不改既有 id 与 intent 原文。回复 ≤100 字。
