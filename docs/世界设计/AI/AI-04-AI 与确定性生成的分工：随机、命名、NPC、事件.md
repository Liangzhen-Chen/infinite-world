# AI-04 AI 与确定性生成的分工：随机、命名、NPC、事件

（2026-11-10 AI-TOP 第 4 册。只写设计。事实基础：盘点 §2、§9 与一览表"随机生成""居民深度档案"两行；代码 F:/dnd-wt/M26：population.mjs:40 stream(seed)、:366 PROFILE_FIELDS、population-service.mjs（两次调用起草、身份由代码分配）、weather.mjs:70、wildlife.mjs:48、checks.mjs:111 die()、autonomy-candidates.mjs、tools/npc-autonomy-planner.mjs（封闭四类行动）、npc-rumors.mjs、world-events.mjs 头注释；命名与古神方案 §4；12 册 §4.5；14 册 §4.4 与 §12（首版无动态历史生成，李白裁定）。）

---

## 本册回答什么 / 依赖哪些册

**回答**：盘点问题 d——AI 和随机生成、命名、NPC 生成、事件生成的分工：哪些一律用确定性种子生成（引用命名与古神方案的 cultures 规则），哪些可以由 AI 润色，润色结果怎么回写或丢弃，可复现性怎么保证。产品负责人要求很多地方允许随机生成，本册把"随机"限定为**种子流里的随机**，AI 不是随机源。

**依赖**：AI-00（R3/R4、RL-7、I-E）；AI-02 §7.2（决定卡 voice 来自档案骨架）、§8（离屏规划与档案起草边界）；AI-03 §4.4（命名校验）；AI-05 §3（旁路记录、哈希范围、录制回放）；命名方案 §4（naming 数据形状、NM-3 卡、骰值键 `name:*`）；12 册 §3.3/§4.5；14 册 §4.4（传闻派生 A/B/C）；03 册（配额）；04 册（tell 通道：托梦/神谕/预兆）。

**一句话**：**规则读的字段，一律由种子派生；只有人读的字段，才允许 AI 写。** 名字、性别、年龄、亲属、职业、财物、性格枚举、日程、决定、事件发生与否与何时、传闻真伪、天气、遭遇——全部是种子流的产物，无 AI 档与有 AI 档逐字节相同。AI 只在这些骨架之上写**prose**：背景故事的文笔、口音的样句、叙述的文字、碑文传闻的措辞；写出来的东西带 provenance 存旁路或 prose 字段，不进哈希，丢了也不坏世界。

---

## 1. 现状（只列设计要用的）

| 对象 | 现状 | 判定 |
|---|---|---|
| 天气 | sha256(fingerprint:day) → seededRandom（weather.mjs:70） | 已确定性 |
| 野生遭遇 | sha256(seed:rules:label)（wildlife.mjs:48） | 已确定性 |
| 检定 | die(document, eventId, 'd20'/'second')（checks.mjs:111），按事件 id 派生 | 已确定性 |
| 人口名册与姓名 | population.mjs:40 stream(seed) 计数流；姓名由 remote-generation composeName 从**代码内置字库**拼（盘点 §9） | 确定性但字库在代码；命名方案 NM-3 要改读 cultures.naming |
| 居民完整档案 | 首次交谈 DeepSeek 起草 → 代码核硬约束 → 自查 → 再核 → 冻结；失败 3 次不再重试，保持"仅骨架"（population-service.mjs；MAX_PROFILE_FAILURES=3） | **规则可读与人读混在一个 JSON 里**（personality.traits 既是文字又被 npcDecision 想读）；无 key 时无性格 |
| NPC 决策/日程/劳动/生病/婚育/犯罪 | 全规则（盘点 §2） | 已确定性 |
| 离屏规划 | DeepSeek 每日 ≤1 次、≤12 人、封闭四类 craft/audit_inventory/trade/share，引擎核验后入账；无 key 不启用；无真实验收记录 | 有 AI 时是"模型提议"，无 AI 时**空缺** |
| 世界事件与传闻 | world-events 由已结算调用派生（"Social systems subscribe by verb and tag, never by tool name"）；npc-rumors 种子来自登记与见证；14 册 §4.4 派生 A/B/C 规划中 | 已确定性；传闻措辞是数据文字 |
| 历史 | 首版不做动态历史生成（14 册，李白裁定） | 保持 |
| 非确定性点 | extension/core.js:175 与 legacy/core.js:175 `Math.random`（旧核心） | 旧代码，不在新管线 |

---

## 2. 分工总表

判定准则只有一条：**该字段有没有规则读它**。有 → 种子派生，AI 不碰；没有 → 可润色。下表按对象逐类列出，第三列"永不 AI"是红线 RL-7 的具体化。

| 对象 | 一律确定性（种子） | AI 可润色（人读字段） | 永不 AI |
|---|---|---|---|
| 人名/地名/店名/族称 | 全部（cultures.naming 模板 + 词池 + 骰值键 `name:*`，命名方案 §4） | — （绰号也不行：绰号会进 address，规则读） | 起名、改名 |
| 居民身份 | 姓名、年龄、性别、物种、户籍、亲属、住区、职业、财物（population 种子；IDENTITY_KEYS） | — | 全部 |
| 居民性格 | `traits[] / values[] / flaws[]` 改为**枚举**，由文化 values + 职业 + 种子抽（§3.2） | `personality.prose`、`voice.samples/habits`、`background`、`visibleFeature`、`notes` | 枚举值、goals 的 need 字段、fears 的 kind |
| 居民关切与目标 | `currentConcern.key` 与 `goals[].need/progress` 由 needs/义务/日程派生 | `currentConcern.prose`、`goals[].prose` | key/need/progress |
| 口音与语域 | `voice.register`（文化 speech + 阶层）、`voice.accent`（lang 熟练度与出生地） | `voice.samples` | register/accent 枚举 |
| NPC 决定 | npcDecision 全部（含论据修正，AI-02 §7.3） | 决定卡的口语化（R3） | outcome/conditions/quotes |
| 离屏行动 | 候选集由 autonomyCandidates 规则生成；**选择**也可由规则（utility 排序）完成 | 有 key 时模型只在候选集内**排序/选择**（§5.2） | 候选集之外的行动；数量与价格 |
| 天气/遭遇/虫害/成精时钟 | 全部种子 | 叙述文字 | 发生与否、何时、多少 |
| 世界事件 | 全部由结算派生 | 叙述文字 | 事件本身 |
| 传闻 | 种子来源 A/B/C（14 册）、truth、source、carriers、传播骰 | `claim` 的**措辞变体**（§6.2） | truth、来源、传播 |
| 神祇 tell（托梦/神谕/预兆） | 是否发生、对谁、指向哪条事实（04 册通道规则） | 梦境/神谕的文字 | 事实指向、时机 |
| 节日/仪式 | 历法派生（06 册） | 场面描写 | 日期、参与者 |
| 碑刻/文书内容 | inscription.history 指向、language/script、legibility | 碑文措辞（14 册碑是真相层：措辞不得改 claim 语义，L2 审） | 指向、真伪 |
| 粗制物 | derived.*（AI-03 §4.3） | `prose` | 性状、价值 |
| 叙述 | 模板变体抽取键 `narr:*` | 模型叙述（R2） | 回执 |

---

## 3. NPC 生成：骨架派生 + 润色

### 3.1 现状问题的准确表述

population-service 的 SYSTEM 已规定"身份由代码分配，必须原样遵守"，这是对的。问题在两处：①`personality.traits` 等字段是自由文字（"豪爽""多疑"），规则无法读——AI-02 §7.3 的 argumentModifiers 要按 traits 修正，需要枚举；②无 key / 断网 / 失败 3 次时居民"仅骨架"，没有性格、没有关切、没有口音，T0 档的 NPC 比 T3 档**少一层真实**，违背可玩性等式。

### 3.2 性格骨架的确定性派生（新）

```
traitPool   = cultures[c].values.traitPool（数据：每文化 12–20 个 trait 枚举词及权重；全局枚举表 world/rules/tables/traits.json 定语义）
profTraits  = professions[p].traitBias（数据：职业对 trait 的权重修正）
rng         = stream(`${seed}:profile:${npcId}:v1`)                      （population 现有 stream，新键）
traits      = weightedDraw(rng, traitPool × profTraits, k=2–3, 互斥对不同时出现：traits.json exclusive[]）
values      = weightedDraw(rng, cultures[c].values.core, k=1–2)
flaws       = weightedDraw(rng, traits.json flaws[], k=1, 排除与 traits 矛盾者)
register    = cultures[c].speech.registerByClass[householdClass]      （数据）
accent      = 出生地 region ≠ 现居 region ? regions[birth].accentTag : null；lang 熟练度 < 流利 → 'foreign'
currentConcern.key = argmax(needs 缺口, 义务到期, 日程冲突) → 枚举 {food, money, debt, health, kin, work, faith, danger}
goals[]     = 现有 npc goals（need/progress）
```

- 全部字段进 **IDENTITY_KEYS 同等保护**：模型不得改、不得补。
- 这些字段在**物化时**即派生，不等首次交谈；所以 T0 档每个居民一出场就有性格枚举、关切、语域——决定卡 voice、论据修正、smalltalk 模板都能读。
- 旧存档：已有完整档的 152 人不动（traits 文字保留在 `personality.prose`，枚举按同一派生补上，不重生成名字与身份；派生只读种子与现有字段，所以 30 日哈希只在新增字段上变——这是新内容路径，不做兼容，14 册 §7 同口径）。

### 3.3 AI 润色层（R4，有 key 且 assist.profileDraft=true 时）

- 输入：骨架（含 §3.2 枚举）+ 文化 speech 散文 + 现有 brief。
- 输出白名单（PROFILE_FIELDS 收窄为 prose 类）：`personality.prose`（≤120 字）、`voice.samples[2–3]`、`voice.habits[1–2]`、`background`（≤160 字）、`currentConcern.prose`（≤60 字）、`goals[].prose`、`fears[].prose`、`visibleFeature`、`notes`。
- 校验：checkGeneratedProfile 现有硬约束（不写钱物技能、不补亲属、未成年边界、真实宗教等）+ 新增：prose 不得与枚举矛盾（traits 含 `timid` 而 prose 写"天不怕地不怕" → L2 式自查 contradictions，一次）。
- 回写：进 npcs[id].profile 的 prose 字段，带 `provenance {model, requestHash, at}`；**不进 digest**（I-E）。
- 失败/无 key：`profile.polish = 'pending'`，骨架完整可用；不再有"failed 3 次后仅骨架"的状态，MAX_PROFILE_FAILURES 保留为"停止重试"而不是"停止可用"。网络恢复后可异步补润色（AI-05 §5.3）。
- 费用口径不变：两次调用/人（draft + self-check），只在首次交谈且 T3 档触发。

### 3.4 离屏规划：候选由规则出，AI 只选

现状 planner 让模型在封闭四类里**提议**具体行动（含 recipe/seller/item/quantity），引擎核验。改为与 Jev 同形的"选项题"：

```
candidates = autonomyCandidates(engine, view, {...})      （autonomy-candidates.mjs:29，规则生成，含 utility/risk/need）
无 key（T0–T2）：plan = top-k by utility（k = intelligence.maxActions），tie 用 stream(`${seed}:autonomy:${npcId}:${day}`)
有 key（T3）：   模型收到 candidates 的编号列表 + 该 NPC 的骨架与近期记忆，返回"选哪几个、顺序"；不在列表内 → 丢弃该人的答复，回落规则排序
```

- 好处：无 AI 档不再空缺；模型不可能提议候选外的行动（I-C）；validateNpcPlanResponse 简化为"编号 ⊆ 候选"。
- 每日 ≤1 次、≤12 人、预算共享 20 元上限（consistency-service.mjs:27）不变。
- 盘点 §2 说这条线"没找到单独的真实花费或验收记录"——本册把它变成 T0 可测：VAI-04-6。

---

## 4. 润色结果的回写与丢弃规则

| 润色对象 | 回写位置 | 进 digest？ | 丢弃条件 | 丢弃后 |
|---|---|---|---|---|
| 居民 prose | npcs[id].profile.*.prose + provenance | 否 | 硬约束不过 / 自查 contradictions hard / 超长 | polish=pending，骨架照用 |
| 回合叙述（R2） | 旁路记录 `sideband/<turn>.json` 的 narration.published；显示层读它 | 否 | 审查 hard / 网络失败 → 发布模板（AI-05 §4） | 模板为正式文本；草稿留旁路，可异步补审 |
| NPC 台词（R3） | 同上 | 否 | 决定卡不一致（outcomeMismatch）/ 数字无出处 | 模板对白 |
| 传闻措辞变体 | rumors seed 的 `claimVariants[]`（存档层）+ provenance | 否 | 变体改变 claim 的 truth 语义（L2 式比对：实体、数量、方向词必须一致） | 用数据原 claim |
| 碑文/文书措辞 | 实例 inscription.text 是**玩家写的**或数据给的；AI 只在 L-C 草案里润色 | — | L2 | 原文 |
| 叙述变体（模板） | 不回写；模板是数据 | — | — | — |
| 粗制物 prose | itemInstances[id].prose | 否 | 与 derived 矛盾（写"锋利"而 traits 无 sharp） | null |

两条总规则：
1. **丢弃永不阻塞**：任何润色失败都有同形的确定性产物顶上（骨架、模板、原 claim）。
2. **回写只增不改**：润色不能改任何已有的规则可读值；只能填 prose 槛位；同一槛位已有 provenance 且未过期不重写（避免每次加载都调模型）。

---

## 5. 事件生成的分工细则

### 5.1 "世界事件"没有 AI 生成，这是设计不是缺口

world-events.mjs 的口径（"Every settled tool call yields one event…Social systems subscribe by verb and tag, never by tool name"）就是产品原则一.4"因果有来源事件"。AI 生成事件会制造没有来源的因果。所以：
- 运行期事件 = 结算派生（玩家/NPC 行动）+ 时钟规则（天气、虫害、成精、节日、hazardClock 灾异）+ 传闻传播。全部种子。
- "无穷无尽的想法"进世界的通道是**提案**（AI-02）与**三级落地**（AI-03），不是"AI 编一个事件"。
- 首版无动态历史生成（14 册裁定）保持；L-C 固化可以把多存档里反复出现的玩家事迹变成 legend/rumor seed 数据（AI-03 §5.2），但这是离线审批，不是运行期生成。

### 5.2 传闻：种子选内容，AI 润措辞

14 册 §4.4 已定派生 A（历史）/B（状态指标）/C（玩家行为），source、carriers、truth、传播骰全是确定性键 `rumor:*`。本册加一层：
- 每条活跃传闻种子可带 `claimVariants[]`（存档层），由 R2 在**首次被讲述**时生成 ≤2 条措辞变体（同一 claim 的口语化、带讲述者口音），provenance 入档；无 key 用数据原 claim。
- 变体校验（确定性，不调模型）：实体名集合、数量、方向词（去/来、买/卖、死/活）与原 claim 一致，否则丢弃。
- 讲述时按 `rumor:tell:<id>:<speaker>` 种子键在 {原 claim} ∪ claimVariants 中抽一条，所以同一存档重放同句。

### 5.3 神祇 tell 与节日场面

04 册的 tell 通道（托梦/神谕/预兆）决定"发生/对谁/指向哪条事实"；R2 只写梦境文字，must 含指向事实的可识别线索，mustNot 含事实以外的断言（knowledge 类审查）。节日/仪式同理：06 册历法派生日期与参与者，R2 写场面。无 key：梦境与场面用模板（events.json 变体，按 culture/daypart/weather）。

---

## 6. 可复现性：种子、旁路、哈希

### 6.1 种子键命名空间（现有 + 新增，全部登记在 world/rules/tables/seed-keys.json，加载校验 E-SEED-KEY 禁止未登记前缀）

| 前缀 | 用途 | 现状 |
|---|---|---|
| `population-plan:*` | 名册 | 现有（population.mjs:113） |
| `name:*` | 命名（命名方案 §4.2："全部骰值走新键 name:*"） | 新；**与 12 册 §7 M3 "新键 sphere:name:*" 不一致**，见 AI-06 冲突 C-4 |
| `profile:*` | 性格骨架派生（§3.2） | 新 |
| `autonomy:*` | 离屏规划 tie-break（§3.4） | 新 |
| `narr:*` | 模板变体抽取（AI-01 §6） | 新；不进哈希 |
| `mark:react:*` | 留痕反应（AI-03 §3.3） | 新 |
| `rumor:*`、`rumor:tell:*` | 传闻派生与讲述（14 册；§5.2） | 14 册新 |
| `faith:*`、`nether:*`、`faith:site:*` | 04/05 册 | 已登记 |
| `sphere:*` | 01 册派生 | 已登记 |
| 事件 id → die() | 检定 | 现有 |
| weather/wildlife 的 sha256 | 时钟 | 现有 |

规则：种子只来自 `template.seed`（存档）+ 键；**任何 AI 输出不得成为种子输入**（含 requestHash）；Math.random 只允许在 legacy/。

### 6.2 旁路记录（sideband）与哈希范围

- 旁路记录文件：`<store>/<campaign>/sideband/<turnSequence>.json`：

```json
{"turn": 1234, "calls": [{"role": "R1|R2|R3|R4|review", "model": "deepseek-flash", "requestHash": "...", "response": {...原始...}, "latencyMs": 812, "costYuan": 0.0031, "status": "ok|failed|timeout"}],
 "narration": {"draft": "...", "published": "...", "publishedSource": "llm|template|sentence-trimmed", "review": {...}},
 "envelope": {...}}
```

- **digest 覆盖**：holdings、instances（除 prose/provenance）、records（除 thought:* 的 intent 原文？——不，原文是玩家写的，进；除 claimVariants）、obligations、state 规则字段。**不覆盖**：所有 prose、provenance、sideband、claimVariants、profile.polish。
- 【待定·李白】P00-3 已登记：现状 digest 范围未核，AI-21 卡先核。
- 重放：读 sideband 的 response 替代真实调用（AI-05 §3）；sideband 缺失则用本地路径（模板/规则排序），规则状态仍相同，只是文字不同。

### 6.3 换模型/换版本

- 模型 id 写进 sideband 每次调用；换模型不改任何规则状态（VAI-04-8）。
- 润色文字会不同；居民 prose 已回写的不重写（"回写只增不改"）。
- Jev 版本钉 `jev-1.14.0`（Jev 方案 §3.4），升级视为换基线重测。

---

## 7. "允许随机生成"的边界

产品负责人要求很多地方允许随机生成。本册的口径：

- **随机 = 种子流里的抽取**，分布由数据给（词池权重、配额、概率表）。它可复现、可审计、可调参。
- **AI 不是随机源**：temperature 只影响文字，不影响任何规则值；R1 的提案走候选，R3 的选择走候选。
- **随机的范围由数据封顶**：03 册 quotas（legendary.global 等）、人口模板、traitPool 权重、rumorSpreadPerDay 0.2、tell 概率。调分布改数据，不改代码。
- **允许个别不合常理**（记忆规则"规律是分布"）：性格互斥对之外不再加"合理性"过滤；一个胆小的铁匠是分布的一部分。
- **随机不触发无来源事件**：随机决定"哪一户先缺粮""谁先听到传闻""哪天下雨"，不决定"凭空出现一支商队"——商队由 11 册路线派生。

---

## 7A. 分布调参的流程（随机"怎么调"也走数据审批）

产品负责人要"很多地方允许随机"，开发上随之而来的问题是"随机结果不好看怎么调"。本册把调参限定为**改分布数据**，并走与内容同一套审批：

1. 发现：试玩或 PT-AI 轨迹里标 `unreal`（不现实）的结果，先按记忆规则"不现实=缺规律"查根因到文件:行；若根因是分布本身（如某文化 traitPool 把 `timid` 权重给了 0.4 导致全镇胆小），再进入调参。
2. 改动：只改 cultures.json / traits.json / quotas.json / rumorSpreadPerDay 等**数据**；代码不动。
3. 审批：数据改动走 content-pipeline L1（分布校验：权重和为 1 ±0.01、互斥对不同现、每池 ≥ 最小条数）→ L4 人读；L2 不需要（不是文字）。
4. 验证：同种子重跑 30 日，哈希**应变**（这是新内容路径），变化集中在该分布消费者；其余系统哈希分段不变（分段 digest 报告，AI-05 §4.2 的 digest-exclude 之外再给每系统分段摘要，供定位）。
5. 禁止：不为单个存档、单个 NPC、单道题调权重；不加"除了某文化以外"的条件行（红线 RL-8）。

## 7B. 灾异与奇观（00 册 U7）与神迹的分工

00 册 §3.20 U7 "灾异与奇观（彗星、地震、瑞兽、神迹）"判做一半，依赖 hazardClock 与 worldClock。它是最容易被"让 AI 编一个奇观"诱惑的地方，本册明确：

| 层 | 由谁 | 数据 |
|---|---|---|
| 是否发生、何时、何地、规模 | hazardClock / worldClock 时钟规则，种子键 `hazard:*`（登记进 seed-keys.json） | regions 的 hazard 概率表、03 册配额（瑞兽属 legendary 配额）、04 册神迹额度（miracles[] 的祈雨额度口径） |
| 对世界的效果 | 原语结算（destroy/transition/vital/status），走通用门族表，与玩家动作同一管线 | 效果族表 |
| 归因（志怪"灾异归因"母题） | 传闻派生 B 路径：灾异事件 → 每文化按 faith.model 生成归因种子（"河神怒了""税太重"），truth 按数据 | 14 册 §4.4 B；cultures.omens（WD-09 已列） |
| 文字 | R2 润色；无 key 模板变体（按 culture/daypart/weather） | events.json |

AI 在这里的全部权限是"把已经发生的灾异说得好"，没有"让灾异发生"的权限。

## 7C. 边界情况

| 情况 | 处理 |
|---|---|
| 文化缺 traitPool（WD-01 前的旧数据或新加文化漏填） | 加载失败 E-CULTURE-TRAITPOOL（WD-01"缺字段加载失败"口径），不运行期回退到 common |
| 同一 NPC 多次触发润色（多个存档、或 polish 后又失败） | provenance 已有且 polish=done 不重写；pending 态每日最多重试 1 次（与规划线每日 ≤1 同口径），计入共享额度 |
| 玩家给宠物/物品起名与某居民同名 | 允许（nameOk 只查同地点实体重名；人与物不同 kind）；对白 address 用 kind 区分 |
| 种子键碰撞（两处用同一键字符串） | seed-keys.json 登记前缀，加载时校验前缀唯一；同前缀内键含实体 id 或事件 id，天然不碰 |
| sideband 文件损坏或缺失 | 该回合回放走本地路径（模板/规则排序）；规则状态不变；报告标 `sidebandMissing` |
| 润色文字含对方不知道的事实（knowledge 泄露） | consistency-review knowledge 类已有；居民 prose 的自查加同类比对：background 不得提到其他居民档案里的 secret 字段（population SYSTEM 已写"其他人物卡中的秘密不代表本人知道"，改为程序校验） |
| 模型返回的枚举值不在 traits.json | 整份草稿拒；骨架照用 |
| 文化 speech.registerByClass 缺某阶层 | 取该文化 `_default` register（数据必填 `_default`，E-REGISTER-DEFAULT） |
| 离屏规划候选集为空 | 该 NPC 当日无规划事件，不调模型、不报错 |
| 传闻变体生成时讲述者无 key、听者有 key | 变体只在讲述方生成；听者端不生成；同一存档的 sideband 决定 |
| 换种子 | 全部骨架重算（名册、性格、天气）；prose 全部失效（provenance 绑旧种子），polish 回 pending |

---

## 8. 数据结构汇总

| 位置 | 新增/改 | 形状 |
|---|---|---|
| world/rules/tables/traits.json | 全局 trait 枚举：`{traits:[{id,label,exclusive:[...]}], flaws:[...], values:[...]}` | §3.2 |
| world/lore/cultures.json 每条 | `values.traitPool [{trait, weight}]`、`values.core []`、`speech.registerByClass {}` | §3.2 |
| world/meta/professions.json 每条 | `traitBias {trait: mul}` | §3.2 |
| npcs[id].profile | `personality {traits[enum], values[enum], flaws[enum], prose}`、`voice {register, accent, samples[], habits[]}`、`currentConcern {key, prose}`、`goals[] {need, progress, prose}`、`polish: done|pending`、`provenance` | §3.2–3.3 |
| population.mjs IDENTITY_KEYS | 加 personality.traits/values/flaws、voice.register/accent、currentConcern.key | §3.2 |
| PROFILE_FIELDS | 收窄为 prose 类白名单 | §3.3 |
| tools/npc-autonomy-planner.mjs | 请求改为候选编号选择；validate 改为 ⊆ 候选 | §3.4 |
| rumors seed（存档层） | `claimVariants [{text, provenance}]` | §5.2 |
| world/rules/tables/seed-keys.json | 前缀登记 | §6.1 |
| sideband/<turn>.json | §6.2 | — |

---

## 9. 验收（VAI-04-x）

| # | 条目 | 测法 | 通过线 |
|---|---|---|---|
| VAI-04-1 | 规则读字段无 AI | grep PROFILE_FIELDS 白名单；对 100 个居民在 T0 与 T3（回放）物化 | 枚举字段、身份字段逐字节相同 |
| VAI-04-2 | 性格骨架覆盖 | T0 物化 500 居民 | 100% 有 traits(2–3)/values/flaws/register/currentConcern.key；互斥对 0 次同现 |
| VAI-04-3 | 分布由数据 | 改某文化 traitPool 权重 ×3 后重跑同种子 | 该 trait 频次按权重比变化；代码无 trait 字面量（grep） |
| VAI-04-4 | 润色不改骨架 | 回放 20 份模型起草 | 任何改动枚举/身份的草稿被拒；prose 字段写入带 provenance |
| VAI-04-5 | 丢弃不阻塞 | 注入 draft 失败 ×3 | polish=pending；NPC 决定卡 voice/traits 可读；对话正常 |
| VAI-04-6 | 离屏规划 T0 可用 | T0 推演 7 日，12 名有候选的 NPC | 每日每人 ≤maxActions 条规划事件；全部 ∈ autonomyCandidates；0 次模型调用 |
| VAI-04-7 | 候选内选择 | T3 回放，注入候选外编号 | 该人回落规则排序；记录 warning |
| VAI-04-8 | 换模型不改状态 | 同存档 sideband 的 model 字段改名重放 | digest 相同 |
| VAI-04-9 | 传闻变体安全 | 注入改变数量/方向词的变体 | 确定性比对丢弃；讲述用原 claim |
| VAI-04-10 | 种子键登记 | 加载 | 未登记前缀 E-SEED-KEY；grep server-plugin 无 Math.random（legacy/ 除外） |
| VAI-04-11 | AI 输出不入种子 | grep stream()/seededRandom 调用点的入参来源 | 无 requestHash/response 字段 |
| VAI-04-12 | 命名零 AI | 500 个生成名 | 全部可由 naming.mjs + 种子重算得到；N7/N8/N9（命名方案）通过 |

---

## 10. 待定项

| 编号 | 事项 | 推荐 | 不选的代价 |
|---|---|---|---|
| 【待定·亮圳】P04-1 | 换模型后润色文字不同（规则状态相同）是否可接受 | 接受；文字非存档真相 | 要文字也复现只能永远钉一个模型版本，且断网即不同 |
| 【待定·亮圳】P04-2 | AI 不得给 NPC 起绰号（绰号进 address，规则读） | 维持；绰号由 naming.address 模板按关系派生 | 开放则 R3 可绕过命名校验 |
| 【待定·亮圳】P04-3 | 性格互斥对之外不做"合理性"过滤（胆小的铁匠可以存在） | 维持（规律是分布） | 过滤会把世界修得太整齐 |
| 【待定·李白】P04-4 | 旧存档 152 完整档补派生枚举时是否重算 traits（与原 prose 可能不符） | 重算枚举，prose 保留；不符处由 polish 异步重润 | 不重算则规则无法读这 152 人的 traits |
| 【待定·李白】P04-5 | traitPool 首版每文化条数（12–20）与互斥对表 | 内容卡给，标待校准 | — |
| 【待定·李白】P04-6 | planner 改为候选选择后，是否保留模型提议 recipe/quantity 的旧路径 | 删除（删除优先） | 两条路径并存，核验逻辑翻倍 |

---

## 11. 自检（随机抽三条）

1. **§3.2 派生式**：每个字段读哪张表、键名、互斥规则、保护等级写了；需要 WD-01（cultures 补字段）之后开工。可开工。
2. **§3.4 planner 改造**：请求形状、无 key 路径、验证规则、预算不变写了。可开工，零新概念。
3. **§6.2 哈希范围**：覆盖/不覆盖清单写了，但现状未核（P00-3）。开工前先跑一次 digest 范围核查（AI-21 卡第一步）。可开工（带前置核查）。
