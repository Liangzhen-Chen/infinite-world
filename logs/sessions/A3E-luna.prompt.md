【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

卡 A3-E 第 1 轮（A3 阶段独立验收：先测清差距）。项目《无限原野》：中西合璧修仙文字 RPG，Node 规则引擎是唯一真相源。工作区 F:/dnd-wt/A3E（分支 a3e，基于已集成 A3-A~D 三轮成果的 a3a）。你是独立验收者：不得为通过而改实现；只写语料、判分工具与验收测试，并报告差距。
卡定义：F:/dnd/logs/sessions/A3-astra-plan.md 的“A3-E”一节（第 134 行起，含其风险提示：评分自比假通过、权限绕过、重复计时）。退出标准（docs/架构设计/10-现状映射与迁移路线.md 第 101 行）：意图语料（≥30% 刁钻意图）路由 ≥90%、签名 ≥85%、越界 0 漏网、不支持率 0、兜底反应率 100%；F5/F6 类场景通过；无 LLM 构造器可完成语料中 ≥70% 的意图（其余由兜底承接）。另：docs/probes/daily/executable-status.md 中标 A3 的 22 题。
任务：
1. 编写独立意图语料 tests/fixtures/a3-intents.json（≥120 条，覆盖修仙/中西世界日常、战斗、交易、法律、社交、超自然、刁钻意图 ≥30%：越权、冒充他人同意、跨地点隔空、违反守恒、语义模糊、组合动作等）。语料必须由你独立写，不得从实现代码反推。每条写预期：应路由到的原语/动作、签名要点、是否应越界拒绝、无 LLM 构造器能否完成。
2. 判分工具 tools/a3-score.mjs：驱动真实引擎（world_propose/两阶段查提/构造器路径），逐条判定，汇总各指标；防“评分自比假通过”：预期来自语料而非实现输出。
3. 跑 22 道日常 A3 题的可执行检查（找 tests 中 daily 相关测试或 tools，逐题报通过/失败及原因）。
4. 报告：各指标数值、未达标条目清单（逐条：意图、实际结果、应归哪张卡 A/B/C/D 修、根因猜测），22 题结果。
跑：tools/a3-score.mjs、新验收测试 tests/a3-acceptance.test.mjs（断言阈值，当前未达标就让它如实失败，不放宽）、CORE。
报告 F:/dnd/logs/sessions/A3E-luna.final.txt；回复 ≤200 字：各指标、22 题通过数、差距按卡分组的条数。
