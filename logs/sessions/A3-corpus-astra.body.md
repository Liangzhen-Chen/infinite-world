你是独立出题者，为《无限原野》的 A3 阶段（开放动作）编写盲测意图语料。项目：中西合璧修仙文字 RPG，规则引擎是唯一真相源。工作区 F:/dnd-wt/A3CORPUS（只读参考用）。
**独立性要求**：不得读 server-plugin/、extension/、tests/ 下任何代码或测试（不得从实现反推）；只读 docs/架构设计/（尤其 06-动作层与开放动作.md、05-统一模型.md 原语、附录A）、docs/待用户确认.md（用户玩法决定）、world/（世界数据：地点、人物、物品、法典、配方）以了解世界里有什么。
任务：写 F:/dnd/logs/sessions/a3-intents-v2.json：120 条**彼此不同**的玩家意图（禁止同一句改编号凑数），中文自然口语。分布：日常生活（吃住行购）、修行与学习、制作与修理、交易与借贷、社交与对话、法律与官府、战斗与危险、超自然与仪式、组合/多步、刁钻意图 ≥36 条（越权替别人做主、冒充他人同意、隔空操作远处物品、违反守恒凭空得物、语义模糊需澄清、自相矛盾、超出能力幅度、在押时的行为、对不存在的目标、元游戏指令等）。
每条字段：id、intent（玩家原话）、tricky(bool)、category、expected：{route（应走的路径：已注册动作 id 若明显对应，否则 "open:proposal"；需澄清写 "clarify"；应拒绝写 "reject"）、signature（关键原语/对象，按 06 章原语名写，如 transfer、holding.open、vital、learn、fact.set、move 等）、outOfBounds(bool，应被拦截的越界)、fallback(bool，是否应由兜底标签实体承接)、constructor(bool，无 LLM 的四步构造器能否完成)、why（一句判定理由，引用设计条目）}。
另写一份说明 F:/dnd/logs/sessions/a3-intents-v2.md：分布统计、刁钻类型清单、你判定 route/signature 的依据。
只写这两个文件，不改仓库。最后回复 ≤150 字：条数、各类分布、刁钻数。
