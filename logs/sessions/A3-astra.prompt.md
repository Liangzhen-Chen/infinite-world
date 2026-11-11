【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：60 分钟（到 50 分钟时停手写交接）。

你是规划者，只做分析与拆卡，不改代码（可读文件、可运行 node --test 与 node tools/ 做只读分析）。项目《无限原野》：中西合璧修仙文字 RPG，Node 规则引擎是唯一真相源，LLM 只做可选叙述与意图解析。工作区 F:/dnd-wt/A3P（基于最新 master，S1/S2/S3/A1/A2 已完成）。
为迁移阶段 A3（原语与开放动作）出可执行拆卡计划，写到 F:/dnd/logs/sessions/A3-astra-plan.md。
依据：docs/架构设计/10-现状映射与迁移路线.md 中 A3 行（范围与退出标准）及第 112–116 行各轮“A3 加”（同意三来源与 consent_given/revoked、无同意的对抗检定与标签、world_create 模板约束、盗窃类动作标记、learn 读来源方意愿、争夺型提案 pending 回执、受限时可做之事、制作动作路由配方、定义补丁与 authority() 统一权能校验等）；06-动作层与开放动作.md（world_propose、幅度上限、路由、动作构造器）；05-统一模型.md 原语；docs/待用户确认.md 中用户玩法决定（两层：无 LLM 用注册动作+动作构造器，有 LLM 用自由意图+d20，LLM 提原语由引擎校验；尊重玩家想象力，不支持率为 0，兜底为带标签的实体；d20 版权须避开 SRD 受限部分）；A1/A2 现状（world_actions/world_act 动作目录、A2 决策规则与对话、S3-I 已把义务操作登记为动作）。
请输出：
1. A3 退出标准逐条与现状差距（哪些已有、哪些缺）。
2. 拆成 3–5 张可并行子卡（文件所有权互斥、共享接点归一卡先行），每张：目标、涉及文件、验收测试（含推演题与日常题集中归 A3 的题目：docs/probes/daily/executable-status.md 里标 A3 的 22 题）、规模、建议模型（核心 gpt-6.1-sol medium，机械与审查 gpt-6-luna）。
3. 风险：哪些地方会改到静态提示（≤12000 硬约束；A1 口径 10593）与工具面（S8 目标 ≤16）。
最后回复 ≤250 字：差距要点、子卡清单（名称+规模+模型）、主要风险。
