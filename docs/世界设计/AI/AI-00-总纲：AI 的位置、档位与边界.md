# AI-00 总纲：AI 在 infinite-world 中的位置、档位与边界

（2026-11-10 AI-TOP 顶层设计第 0 册。只写设计，不改代码、数据与 00–14 各册；不提交、不跑测试、不调用模型。事实基础：docs/世界设计/_AI现状盘点.md（以下简称"盘点"），代码取 F:/dnd-wt/M26 用 grep 核过的片段，文件:行未注明仓库的指 M26。数字凡出自盘点与现有账本的均注明出处；没有依据的一律写"估算"或"无依据"。）

---

## 本册回答什么 / 依赖哪些册

**回答**：AI 在这个世界里到底扮演几种角色、各自的边界线画在哪、玩家能开关什么、"无 AI 档"与"有 AI 档"各是什么、本系列七册怎么分工、全系列验收编号怎么读。本册是其余六册的公共词汇与总图，后面各册只引用不重定义。

**依赖**：docs/产品原则.md（一.1、一.3、二.2、二.3、二.4、三.1、三.2、三.6）；盘点全文；00 册 §二（四层结构 L0–L3）；docs/设计/通用门能力-设计稿.md（效果族表）；docs/设计/Jev判断层接入方案.md（前门与降级矩阵、用户 11-04 答复）。

**本系列各册**：

| 册 | 题 | 回答盘点里的哪条问题 |
|---|---|---|
| AI-00 | 总纲：位置、档位与边界（本册） | 全局词汇 |
| AI-01 | 无 AI 档：意图表达与降级 | a |
| AI-02 | 有 AI 档：提议、校验与结算的边界 | b |
| AI-03 | 无限想法的三级落地 | c |
| AI-04 | AI 与确定性生成的分工 | d |
| AI-05 | 成本、速度、可复现与测试 | e |
| AI-06 | 现状、缺口与排期（AI-xx 卡、冲突清单） | 收口 |

---

## 1. 两层目标怎么同时成立

产品负责人的两层目标表面上互相拉扯：第一层要"完全不依赖 AI 也能完整地玩"，第二层要"有了 AI，玩家想做任何事情都有办法接住"。本系列的总答案是一句话：

> **AI 永远只在"引擎能做的事"的集合里挑选和描述，从不扩大这个集合；扩大集合的唯一途径是数据。**

把它拆成三条可以检查的推论：

1. **可玩性等式**：无 AI 档的"能做的事" = 有 AI 档的"能做的事"。两档的差别只在**表达的便利**（自由输入 vs 菜单与构造器）和**文字的质感**（模型叙述 vs 模板叙述），不在世界效果。验收上写成：任一有 AI 档产生的 `world_act` / `world_propose` 提案，在无 AI 档用构造器填出同一份 JSON，结算结果逐字节相同（VAI-00-1）。
2. **"接住任何想法"的定义**：不是"任何想法都能成功"，而是"任何想法都走到裁决管线、得到世界内的回应"。回应有四种且只有四种——**执行**（含裁剪后执行）、**还价/条件**（NPC 或规则给出条件）、**拒绝并给世界内原因与替代做法**、**留痕**（open:leave_mark，产品原则二.3）。"不支持"不是合法回应（产品原则一.1）。
3. **扩大集合只走数据**：当某类想法反复被拒、或玩家反复用开放路径拼同一组效果，这不是加 if 分支的信号，而是**效果族表加一行、动作目录加一条、或 world 内容加一条数据**的信号，经 L1/L2/L4 审批（AI-03 第三级）。代码里不出现意图词、实体 id、文化 id（AGENTS.md:17–22 红线；通用门 §8.1）。

---

## 2. AI 的四种角色（R1–R4）与它们各自的"只能做什么"

盘点 §总览 第 1 条说项目里的"AI"是四件事。本系列把它们定名为四种角色，每种角色一句"只能"，这句话就是该角色的边界。

| 角色 | 名称 | 现状入口（盘点 §） | 只能做什么 | 绝不能做什么 | 详见 |
|---|---|---|---|---|---|
| **R1** | 理解层 | 主持模型调 27 个 world_* 工具（§1）；Jev 前门（§7，未接入）；本地 constructIntent（§1） | 把玩家文字变成**候选动作或结构化提案**（proposal + 信封），交引擎预览 | 自己结算；替 NPC 决定；填候选之外的 id；填玩家没说的数量 | AI-01、AI-02 |
| **R2** | 叙述层 | finishContractTurn → 一致性审查 → 发布或模板（§1、§3） | 把**已结算的回执**说成文字；尾注由引擎校正 | 改结算；写回执里没有的事实、价格、规矩；在结算前叙述 | AI-02 §6、AI-05 §4 |
| **R3** | NPC 层 | 对白由模型写、决定由 npcDecision 出（§2）；离屏规划提议四类行动（§2）；居民档案起草（§2） | 把**引擎已出的决定卡**说成话；在**封闭行动枚举**里给离屏提议；给**骨架已定**的档案润色 | 替 NPC 做决定；编价格与规矩；改骨架字段（年龄、亲属、职业、财物） | AI-02 §7、AI-04 §3 |
| **R4** | 内容层 | 开发期 L2 审核（§4）；运行期固化草案（本系列新增，AI-03） | 起草、审核**候选数据**，由 L1 校验、L4 人读后入库 | 直接写 world/ 数据；绕过 L1；在存档里写规则可读字段 | AI-03 §4、AI-04 §5 |

四个角色共用三条硬规律：

- **只读候选、只回编号或结构**：R1 的所有 id 必须来自引擎给的候选集（Jev 方案 §十二；通用门 §12）；R2/R3 的所有数字必须来自回执或决定卡；R4 的产出进 drafts，不进 world/。
- **旁路记录，重放不调模型**：每次模型调用的请求哈希、模型 id、原始应答、耗时、费用写进本回合旁路记录（Jev 方案 §3.4；npc-planning-service.mjs 开头注释已有同口径）；同一存档同一事件序列重放时读旁路记录，不再请求（AI-05 §3）。
- **失败就降级，不阻塞**：任何角色的调用失败（无密钥、断网、超时、审查不过、格式错）都退回本地路径并继续，游戏不停、存档不坏（AI-05 §5）。

---

## 3. 档位：玩家开什么、关什么

### 3.1 现有开关（代码事实）

- `intent`：off / match / propose（extension/turn.mjs:3）。off 时 world_act 返回"自由输入理解已关闭，请使用可做之事面板"（runtime.js:320）。
- `narration`：off / async / sync（turn.mjs:4）。off 只显示回执。
- Jev 方案新增 `judge`: off / jev（客户端偏好，不是世界状态；Jev 方案 §3.4）。
- `openActions` 存在存档里（engine.mjs:305–308），它是世界状态，不是 AI 开关。
- 运行期辅助（审查、改写、NPC 规划、档案起草）由是否有 DEEPSEEK_API_KEY 决定（consistency-service.mjs:27；npc-planning-service.mjs:7；population-service.mjs）。

### 3.2 本系列的档位定义

把零散开关归成一个**客户端偏好对象** `aiProfile`，放 ui-settings（与 intent / narration 同处），**不进存档**：

```json
"aiProfile": {
  "understand": "off | local | jev | llm",
  "narrate":    "off | template | llm-async | llm-sync",
  "npcVoice":   "off | template | llm",
  "assist":     {"review": false, "npcPlanning": false, "profileDraft": false},
  "keys":       "player-owned"
}
```

- 预设四档，供设置页一键选：
  - **无 AI 档（T0）**：understand=local、narrate=template、npcVoice=template、assist 全 false。费用 0。**这是验收"不开 LLM 也能完整游玩"的档位**，也是无 AI 通关脚本（AI-05 §2）跑的档位。
  - **轻理解档（T1）**：understand=jev、其余同 T0。费用每回合约 0.0013–0.006 元（Jev 方案 §4.2，实测与估算混合，已标）。11-04 用户已定：密钥玩家自带；第三方隐私未拍板前只做离线评测。
  - **叙述档（T2）**：understand=llm、narrate=llm-async、npcVoice=llm、assist.review=true。现状对应 intent=propose + narration=async。每回合 0.09–0.14 元（盘点 §1）。
  - **全开档（T3）**：T2 + npcPlanning + profileDraft。每日另加离屏规划 ≤1 次（npc-planning-service.mjs:7–26）与首次交谈档案起草 2 次调用/人（population-service.mjs "two model calls per person"）。
- 对应关系：`understand` 取代 `intent`（off→off，match→llm 且只推荐，propose→llm）；`narrate` 取代 `narration`。迁移时读旧键写新键一次。
- **【待定·亮圳】默认档位**。推荐：安装后默认 T0，设置页首屏说明"开 AI 需要你自己的密钥，每回合约 X 元（读账本）"。不选它的代价：若默认 T2，没有密钥的玩家第一回合就看到降级提示，与"不依赖 AI"的第一印象相悖。

### 3.3 档位切换的规则

- 切换只改客户端偏好，**不写存档、不写事件**；同一存档在 T0 与 T3 下重放哈希相同（哈希范围见 AI-05 §3.2：只算规则可读状态）。
- 由高档降到低档（含被动降级：断网、额度用尽）时，本回合**已经进入预览的提案**仍按原提案结算；未进入预览的文字重新走低档理解。
- 由低档升到高档不补算历史回合；模板叙述不回填为模型叙述（除 AI-05 §5.3 的"异步补审升级"——它只替换**显示**，不改事件）。

---

## 4. 一回合的总流程（两档合一张图）

```
玩家输入（文字 / 菜单点选 / 构造器表单）
   │
   ├─ 菜单或构造器：直接产出 {action, slots} 或 proposal ──────────────┐
   │                                                                    │
   └─ 自由文字 ──► R1 理解层（按 understand 档）                          │
         ├ local：constructIntent（action-constructor.mjs:41）→ 候选 ≤5 ─┤
         ├ jev：两步大类 → 动作/槽位 或 效果族/手段（Jev 方案 §二）───────┤
         └ llm：world_actions 查目录 → world_act / world_propose ────────┤
                                                                        ▼
                                   预览（/propose preview；actionBoundary，action-boundary.mjs:48）
                                      ├ 校验 8 步（AI-02 §3）：schema → id 候选 → 知情 → 权能/持有 → 效果族来源与裁剪 → 守恒 → NPC 答复 → 代价
                                      └ 产出 receipt{status, applied, trimmed, narrate.must/mustNot, alternatives, fallback}
                                                                        ▼
                                   玩家确认（开放路径一律先预览再确认；登记动作沿用现有）
                                                                        ▼
                                   结算（引擎唯一真相）→ 事件入账 → 回执
                                                                        ▼
                                   R2 叙述层（按 narrate 档）
                                      ├ template：events.json 模板（action-text.mjs）
                                      └ llm：按回执叙述 → 本地确定性审查 → 模型审查 → 句级裁剪发布（AI-05 §4.3）
                                                                        ▼
                                   显示 + 尾注（引擎校正）+ 旁路记录
```

五条不变量（全系列验收反复引用）：

- **I-A 结算前无叙述**：任何 LLM 文字进入显示之前，对应回执必须已 committed（turn-contract.mjs 已按此做；本系列不改，只写成验收 VAI-00-2）。
- **I-B 提案不含裁决**：proposal 里只有意图、目标、手段、效果请求，没有"成功""同意""价格"字段（primitive-schema.mjs:57 的 proposal 定义已无这些字段；保持封闭，不加）。
- **I-C 候选之外不猜**：R1 产出的每个 id 都在引擎候选内，否则返回候选让玩家选（06 §6.10.5；Jev 方案 §十二）。
- **I-D 模板是正式产物，不是兜底**：T0 档的模板叙述是正式体验，有自己的质量验收（AI-01 §6、AI-05 §4.4），不是"审查没过才发的东西"。
- **I-E AI 文字不进哈希**：存档确定性哈希只覆盖规则可读状态；prose/flavor/叙述文本带 provenance 另存（AI-04 §4、AI-05 §3.2）。

---

## 5. "想法"的分类学（后面三册的公共词）

玩家一句话落到引擎时，按**引擎已经有的东西**分成五类。这个分类由引擎的候选与效果族表决定，**不是由意图词决定**（红线）。

| 类 | 定义 | 例（示意，不是名单） | 走哪条路 | 册 |
|---|---|---|---|---|
| K1 登记动作 | 命中 world/actions/*.json 某条（343 个 verb，grep 计数）且槽位可填 | 买二斤米、去河湾村、练射箭 | world_act | AI-01 §3 |
| K2 开放组合 | 没有登记动作，但每个效果都在效果族表某行、来源可派生 | 用斧头把门劈开、拿旧布包伤口、把羊牵去卖 | world_propose → deriveOpenLimits | AI-02 §4 |
| K3 社交与言语 | 对在场 NPC 说话、请求、威胁、许诺、打听 | 劝店主赊账、吓唬小偷 | dialogue + npcDecision（决定卡）+ 论据修正（AI-02 §7） | AI-02 |
| K4 新事物 | 效果里有 create / fact.set 指向世界里没有的东西 | 发明一种新菜、给自己的小船起名、立一块碑 | 三级落地（临时 → 事实 → 固化） | AI-03 |
| K5 越界 | 请求改数值、改他人状态、凭空造物、绕过经济、改世界规则 | 让我有一万铜钱、让他爱上我、把物价砍半 | 拒绝 + 世界内原因 + 替代 + 留痕 | AI-02 §5 |

K1–K4 都能"接住"；K5 也能接住——以拒绝的形式，但拒绝必须带原因与替代（产品原则二.3）。"接住率"的定义与目标值见 AI-01 §7、AI-05 §6。

---

## 6. 红线总表（RL-1 … RL-10）

各册引用编号，不重抄。每条给"由谁、在哪个入口、按什么数据执行"。

| 编号 | 红线 | 执行者 / 入口 / 数据 |
|---|---|---|
| RL-1 | AI 不写状态：所有写入经原语结算（ops 封闭清单 19 个，primitive-schema.mjs:6） | primitives-runtime；commitPrimitives；原语 schema 校验 |
| RL-2 | AI 不凭空造物：create 必须有 materials 消耗（transfer → sink:consume）且来源可派生，或走 crude 规则（action-limits.mjs:267–283 improvised） | deriveOpenLimits；open-actions.json sourceCaps；效果族表 craft 行 |
| RL-3 | AI 不改数值：vital / status / fact.set 幅度取"来源固有效力与 sourceCaps 取小"（open-actions.json note） | action-limits.mjs cap()；writableFactField（primitive-policy.mjs） |
| RL-4 | AI 不改他人状态：对非本人实体的 status / move / destroy 需同意或权能，否则 contested（action-limits.mjs:67） | consent（action-consent.mjs）；authority（action-authority.mjs） |
| RL-5 | AI 不绕经济：transfer 源汇守恒；价格只由 market.mjs 报价；AI 文字里的价格必须等于回执 quote | ledger 守恒；consistency-review fact 类检查（AI-02 §6.3 加"数字出处"确定性项） |
| RL-6 | AI 不替 NPC 决定：决定由 npcDecision 出，先于对白（AI-02 §7） | dialogue 决定卡；consistency-review agency 类 |
| RL-7 | AI 不写规则可读字段：润色只进 prose/flavor/voice 等叙述字段（AI-04 §4 白名单） | population.mjs PROFILE_FIELDS；content-pipeline L1 |
| RL-8 | 代码里不出现意图词、实体 id、文化 id 的分支（AGENTS.md:17–22；命名方案 N8） | grep 验收（每张 AI 卡） |
| RL-9 | 密钥玩家自带，只读环境变量/设置；仓库与发行物不含密钥；无密钥即本地路径（用户 11-04） | 客户端设置；服务端只转发玩家配置 |
| RL-10 | 任何 AI 失败不中断整场、不丢已结算行动（待确认:74 处置；盘点 §3 事故） | finishContractTurn 降级链；AI-05 §5 |

---

## 6A. 现有管线逐环节对照：每一段代码属于哪个角色、守哪条不变量

把盘点 §1 描述的现有回合管线拆成环节，标出它在本系列里的位置。这张表是实现卡"改哪里"的索引，也是"哪些现状不能动"的清单。

| 环节 | 文件:行（M26） | 角色 | 守的不变量/红线 | 本系列是否改 |
|---|---|---|---|---|
| 服务端每回合先跑无模型 constructIntent，结果冻进回合记录 | consistency-service.mjs:74–78；action-constructor.mjs:41 | R1 本地 | I-C | 不改算法；AI-01 §4 只加数据与澄清流程 |
| 模型经 27 个 world_* 工具调用；world_act{action, slots}；world_propose{proposal} | extension/tools.mjs:5–44 | R1 llm | I-B、I-C | 工具数不变；AI-02 §7.4 加 arguments 参数；AI-05 §6.4 补跑工具面动态 |
| 开放提案槛位 intent/target/consent/participants/means/effects/context | action-affordances.mjs:82–92 | R1 builder | I-B | AI-01 §2.3 只改界面分栏，不改槛位 |
| actionBoundary 统一预览/执行入口 | action-boundary.mjs:48、:98 | 引擎 | RL-1 | 不改；八步管线（AI-02 §3）在其内部 |
| deriveOpenLimits 来源派生与 cap 取小 | action-limits.mjs:247–292 | 引擎 | RL-2、RL-3 | 通用门卡 1–4 改为读族表；本系列不另改 |
| consent / requestContractConsent / applyConsentEvent | action-consent.mjs:66、:109、:159 | 引擎 | RL-4 | 通用门 §6.2 统一入口；AI-02 §7.2 在其输出上加决定卡 |
| npcDecision 五段 | npc-decision.mjs:7–45 | 引擎 | RL-6 | AI-02 §7.2 reasons key 化、§7.3 论据修正段 |
| finishContractTurn：门禁证据 → pending 补跑一次 → 按回执叙述 → 审查 | extension/turn-contract.mjs:17–60 | R2 | I-A、RL-10 | AI-05 §6.4 补跑契约；§6.2 三态发布 |
| publishedTurnText 降级链：safeText → fallback.text → canCommit text → 模板句 | turn-contract.mjs:8–13 | R2 | RL-10 | 保留；AI-05 §6.3 在其前加句级裁剪 |
| consistency-review 确定性段 + 模型逐句出处 | consistency-review.mjs:10、:571–591 | 审查 | RL-5 | AI-02 §6.3 加数字出处与决定一致两项确定性检查 |
| canCommit 判定 | consistency-service.mjs:294 | 审查 | — | AI-05 §6.2 改三态（X2 事故） |
| 共享模型额度 ≤20 元 | consistency-service.mjs:27–45 | 费用 | 三.6 | 不改；AI-05 §2.2 另加玩家侧预算 |
| NPC 离屏规划：封闭四类提议 → 引擎核验 → 事件 | tools/npc-autonomy-planner.mjs:8–30；npc-planning-service.mjs:7–26 | R3 | I-C | AI-04 §3.4 改为候选选择 |
| 居民档案起草：身份代码分配 → 起草 → 核 → 自查 → 核 → 冻结 | population-service.mjs；population.mjs:366 PROFILE_FIELDS | R3/R4 | RL-7 | AI-04 §3 骨架派生 + 白名单收窄 |
| 事件模板 events.json 多级查找 | action-text.mjs；world/actions/locale/zh-CN/events.json | R2 模板 | I-D | AI-01 §6 加变体与文化 locale |
| 留痕 open:leave_mark 与反应规则 | mark-actions.mjs；mark-reactions.mjs | 引擎 | 二.3 | AI-03 §3 扩到念头与 memory |
| L2 内容审 content-pipeline + 分卡预算 | tools/content-pipeline.mjs:13–30；content-budget.mjs | R4 | 三.6 | AI-03 §5.3 加三条 L1；流程不改 |
| 种子：population stream、weather/wildlife sha256、checks die() | population.mjs:40；weather.mjs:70；wildlife.mjs:48；checks.mjs:111 | 引擎 | 确定性 | 不改；AI-04 §6.1 登记键前缀 |

**不能动的三处**（本系列明确不改，任何 AI 卡的 diff 碰到即打回）：primitive-schema.mjs:57 的 proposal 字段集合；primitive-schema.mjs:6 的 19 个 op；actionBoundary 作为唯一预览/执行入口。

---

## 6B. 五类想法的判定算法（由引擎数据给出，不由词给出）

§5 的 K1–K5 分类在实现里是一个纯函数，输入是提案与引擎状态，输出是类别与下一步。它**不读 intent 文字**（文字只在 R1 阶段用过）：

```
classify(proposal, envelope, engine, state):
  if envelope.source ∈ {menu} or (proposal 由 world_act 给出且 action ∈ 目录)      → K1 登记动作
  for e in proposal.effects:
     if e.op ∉ ops                                                                 → K5（E-SCHEMA）
     if e.op == 'fact.set' and e.field ∉ writableFactField(kind)                   → K5（E-FACT-READONLY）
     if e 指向 market/rules/他人账户余额/world 数据                                   → K5（E-FACT-READONLY | E-SCOPE）
  if ∃ e: e.op ∈ {create, fact.set(name), obligation.create 自定条款} 且 目标为新物/新名  → K4 新事物（再按 AI-03 §2 分级）
  if proposal.target 为 person 且 effects 含 obligation/exchange/talk 或 envelope.arguments 非空 → K3 社交
  if ∀ e: 效果族表存在 applies 成立的行                                               → K2 开放组合
  else                                                                              → K5（E-OPEN-SOURCE，带 alternatives 与留痕）
```

- 这个函数只在预览阶段跑一次，结果写进 receipt.classification（供试玩报告与覆盖指标统计）。
- 它读的全部是数据：ops 清单、writable 白名单、效果族表、动作目录。改分类行为 = 改数据。
- K3 与 K2/K4 可以同时成立（"用这块皮给他做个护腕"既是 K4 也是 K3），函数返回主类 + 副类，管线按主类走，副类决定是否要 V7 对方答复。

---

## 6C. 与 00–14 各册的接口（AI 系列从哪册读什么、给哪册回什么）

| 册 | AI 系列读它的 | AI 系列给它的 |
|---|---|---|
| 00 | 四层结构 L0–L3；"引擎缺口"三条（开放路径 9 类、NPC 两套、包系统） | 无；AI 系列全部落在 L1/L2 层与工具层 |
| 01 | cultures 字段底座（naming、speech、values、lang、units） | AI-15 要加 values.traitPool/core、speech.registerByClass（冲突 C-6） |
| 02–03 | 材料与物种性状（AI-03 派生读 traits） | 粗制物的 traits 来源必须是这些数据 |
| 04 | tell 通道（托梦/神谕/预兆）决定发生与指向 | AI-04 §5.3：R2 只写文字；无 key 走模板 |
| 05–07 | 法典/规矩（cite_norm 论据的 ref 来源；K5 转机制的治理动作） | 论据 kind cite_norm 读法典条目 id |
| 08 | valueOf、market 报价（RL-5 的真相源；决定卡 quotes） | 需补非 goods 实例估价路径（C-8） |
| 09–10 | 技能阶、职业 materials/grants（AI-03 §4.3） | professions.grants 新字段 |
| 11 | 路线/商队派生（AI-04 §7"随机不触发无来源事件"的例证） | 无 |
| 12 | naming.address（对白槛位）、units（数量槛位反向表、数字出处换算）、对话模板目录 | 模板键集合扩大（C-1、C-3）；骰值键统一（C-4） |
| 13 | material-props（WD-25） | 粗制物派生读它 |
| 14 | 传闻派生 A/B/C、碑刻 feature 形状、legends status | claimVariants；存档层 feature 同形；status 加 canon-derived（C-7） |
| 命名方案 | naming 形状、常用字表、blocklist、E-NAME-*、骰值键 name:* | naming.thing（C-5）；起名校验复用 |
| 实施日程 | 批次与热点文件 | AI 卡插入位置（AI-06 §3）；热点表加三行（C-15） |

---

## 6D. 设计决策记录（为什么不选另一条路）

| 决策 | 不选的路 | 理由（引用事实） |
|---|---|---|
| 模板叙述是 T0 正式产物（I-D） | 把模板只当兜底，T0 不做叙述质量 | 盘点 §3：契约后 28/35 回合只发模板——模板已经是玩家实际读到的主体；不做质量就是不做产品 |
| AI 不生成世界事件 | 让模型"编一个事件"丰富世界 | world-events.mjs 口径"every settled tool call yields one event"；产品原则一.4"因果有来源事件"；AI 事件没有来源 |
| 不换更贵的主持模型 | 换 DeepSeek Pro / 更大模型提工具质量 | 用户 10-24 否决（待确认:159）；本系列用候选约束与确定性审查降低对模型质量的依赖 |
| 不做向量检索 | 加嵌入模型做记忆检索 | 盘点 §2 词法检索可用；加嵌入 = 新依赖与新费用，且无 AI 档不能用 |
| Jev 第一版不进前门 | 有 LLM 时也先过 Jev | 主会话 11-04 ③ 已定；避免两套理解叠加误判 |
| 密钥玩家自带 | 项目代付、服务器中转 | 用户 11-04 答复；RL-9 |
| 规则读的字段一律种子 | 让模型给性格/关切以求"生动" | 可玩性等式；argumentModifiers 要读 traits，自由文字读不了 |
| 粗制物不进 goods | 允许玩家造物直接成为商品 | RL-5；否则 AI 提案可间接造高价物 |
| 不回填旧存档 | 固化后迁移旧存档实例 | 记忆规则"不做旧存档兼容"；规则只一版 |
| 候选外 id 退回而非拒绝 | 填错即拒绝 | 盘点 §1"反复填错修理/委托参数"是最常见失败；退回候选比拒绝更接近玩家原意 |
| 句级裁剪而非整段换模板 | 保持整段拒绝 | X3 事故：整段拒绝让大多数回合变模板，叙述质量不可观测 |

---

## 7. 验收编号规则与总索引

- 编号 `VAI-<册>-<序>`，如 VAI-01-3 是 AI-01 册第 3 条。本册 VAI-00-x 是跨册不变量。
- 每条验收写**测法**与**通过线**；凡能用无 AI 档测的先用无 AI 档测（0 元）；需要模型的用录制回放（AI-05 §3）。
- 全系列验收汇总表在 AI-06 §4。

| # | 条目 | 测法 | 通过线 |
|---|---|---|---|
| VAI-00-1 | 可玩性等式 | 取 20 个有 AI 档录制的回合，把其 world_act / world_propose 参数原样经构造器路径（/propose）提交到同一存档快照 | receipt.applied、events、digest 逐字节相同 |
| VAI-00-2 | 结算前无叙述 | 录制回放 50 回合，检查每条发布文字的 sequence 晚于对应 committed 回执 | 100% |
| VAI-00-3 | 候选之外不猜 | 新题集 N（Jev 方案 §6.2 口径）过 R1 三条路径 | 产出 id ∉ 候选集 的回合数 = 0（返回候选不算违例） |
| VAI-00-4 | 档位不进存档 | 同一存档在 T0、T2 各推 30 日（T2 用录制回放） | 规则可读状态哈希相同 |
| VAI-00-5 | 红线 grep | grep server-plugin、extension、tools 的 R1–R4 相关文件 | 无意图词 / 实体 id / 文化 id 字面量分支；无 Math.random（legacy/ 除外） |
| VAI-00-6 | 失败不中断 | 录制回放中注入：超时、HTTP 500、格式错、审查 hard 拒绝 各 10 次 | 整场继续；已 committed 事件数不减；每次失败有一条降级记录 |

---

## 8. 术语表（全系列统一）

| 词 | 定义 | 出处 |
|---|---|---|
| 提案 proposal | `{intent, target, participants, means, effects[], context, consent}`，封闭 schema | primitive-schema.mjs:57 |
| 信封 envelope | 提案外的解析元数据 `{source, family, unmentioned, confidence, raw}`，不进提案 | Jev 方案 主会话审定"提案外的解析信封" |
| 回执 receipt | `{status, applied, trimmed, check, consequences, narrate{must,mustNot}, alternatives, fallback, signature}` | primitive-schema.mjs:62–64 |
| 决定卡 decisionCard | npcDecision 的结构化输出 + 引擎报价/条款/原因，供 R3 说成话 | AI-02 §7（新） |
| 效果族表 | world/rules/tables/open-sources/*.json，每行一族效果怎样从世界状态派生来源 | 通用门 §2.1 |
| 旁路记录 | 每回合模型调用的请求哈希、模型 id、原始应答、耗时、费用；重放只读它 | Jev 方案 §3.4 |
| 三级落地 | 临时（L-T）→ 世界事实（L-F）→ 固化数据（L-C） | AI-03 |
| 骨架 / 润色 | 规则可读字段由种子派生（骨架）；叙述字段可由 AI 写（润色） | AI-04 |
| T0–T3 | 四个 aiProfile 预设档 | 本册 §3.2 |
| 录制回放 | 用旁路记录替代真实模型调用的测试方式，0 元 | AI-05 §3 |

---

## 9. 本册待定项汇总

| 编号 | 事项 | 推荐 | 不选的代价 |
|---|---|---|---|
| 【待定·亮圳】P00-1 | 默认档位（§3.2） | T0 | 无密钥玩家首回合即见降级提示 |
| 【待定·李白】P00-2 | aiProfile 取代 intent/narration 的迁移是否随 Jev J3 卡一起做 | 一起做（同改 ui-settings） | 两套开关并存一段时间，设置页混乱 |
| 【待定·李白】P00-3 | 哈希范围是否已排除 prose/flavor 字段（现状未核） | AI-05 §3.2 先核再定 | 若未排除，AI 润色回写会破坏 30 日哈希对账 |

---

## 10. 自检（随机抽三条，开发者能否不追问就开工）

1. **§3.2 aiProfile**：字段、枚举、存放位置（ui-settings，不进存档）、与旧键的映射都写了；预设四档的 assist 子项清楚。可开工。欠一项：设置页文案由 AI-01 §8 给。
2. **§6 RL-5 "AI 文字里的价格必须等于回执 quote"**：执行者是 consistency-review 的 fact 类确定性检查，数据是回执里的 quote 字段。AI-02 §6.3 给了具体比对规则（数字抽取 → 与 receipt.quotes 集合比对）。可开工。
3. **VAI-00-1 可玩性等式**：测法依赖"录制回放"基础设施（AI-05 §3）。在该设施做好前，可以用 tools/playtest-runner.mjs 的现有存档快照手工做 5 回合。可开工，但先做 AI-05 的 AI-21 卡。
