【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

你是独立出题者，为《无限原野》的 A3 阶段（开放动作）编写盲测意图语料。项目：中西合璧修仙文字 RPG，规则引擎是唯一真相源。工作区 F:/dnd-wt/A3CORPUS（只读参考用）。
**独立性要求**：不得读 server-plugin/、extension/、tests/ 下任何代码或测试（不得从实现反推）；只读 docs/架构设计/（尤其 06-动作层与开放动作.md、05-统一模型.md 原语、附录A）、docs/待用户确认.md（用户玩法决定）、world/（世界数据：地点、人物、物品、法典、配方）以了解世界里有什么。
任务：写 F:/dnd/logs/sessions/a3-intents-v2.json：120 条**彼此不同**的玩家意图（禁止同一句改编号凑数），中文自然口语。分布：日常生活（吃住行购）、修行与学习、制作与修理、交易与借贷、社交与对话、法律与官府、战斗与危险、超自然与仪式、组合/多步、刁钻意图 ≥36 条（越权替别人做主、冒充他人同意、隔空操作远处物品、违反守恒凭空得物、语义模糊需澄清、自相矛盾、超出能力幅度、在押时的行为、对不存在的目标、元游戏指令等）。
每条字段：id、intent（玩家原话）、tricky(bool)、category、expected：{route（应走的路径：已注册动作 id 若明显对应，否则 "open:proposal"；需澄清写 "clarify"；应拒绝写 "reject"）、signature（关键原语/对象，按 06 章原语名写，如 transfer、holding.open、vital、learn、fact.set、move 等）、outOfBounds(bool，应被拦截的越界)、fallback(bool，是否应由兜底标签实体承接)、constructor(bool，无 LLM 的四步构造器能否完成)、why（一句判定理由，引用设计条目）}。
另写一份说明 F:/dnd/logs/sessions/a3-intents-v2.md：分布统计、刁钻类型清单、你判定 route/signature 的依据。
只写这两个文件，不改仓库。最后回复 ≤150 字：条数、各类分布、刁钻数。
