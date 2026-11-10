# AI-02 有 AI 档：提议、校验与结算的边界

（2026-11-10 AI-TOP 第 2 册。只写设计。事实基础：盘点 §1–§3、§7；代码 F:/dnd-wt/M26：primitive-schema.mjs、action-limits.mjs、action-boundary.mjs、open-actions.mjs、action-consent.mjs、npc-decision.mjs、consistency-review.mjs、turn-contract.mjs 的 grep 片段；docs/设计/通用门能力-设计稿.md；docs/设计/Jev判断层接入方案.md。）

---

## 本册回答什么 / 依赖哪些册

**回答**：盘点问题 b——"AI 只能提议、引擎来结算"的边界具体怎么划：提议的格式（提案 schema 与信封）、引擎怎么校验（八步管线）、怎么结算、怎么拒绝（拒绝分类、世界内原因、替代做法、留痕）；AI 能接住哪几类没有预设过的想法、哪几类必须拒绝或转成已有机制；不能越权的红线逐条落到入口；以及"NPC 话由模型说、决定由引擎出，两者脱节"的解法（决定卡 + 对白契约 + 结构化论据）。

**依赖**：AI-00（四角色 R1–R3、五类想法 K1–K5、红线 RL-1…RL-10、不变量 I-A…I-E）；AI-01 §5（无 AI 对白与论据面板，两档共用同一结算）；通用门设计稿 §2（效果族表）、§4（所有者处分权）、§5（合法性是后果）、§6（NPC 答复开放提案）、§12（提案与信封）；Jev 方案 §二、§五、主会话 11-04 审定；08 册（价格派生，RL-5 的依据）。

**一句话**：AI 的全部输出只有三种合法形状——**提案**（给引擎）、**决定卡的口语化**（给玩家看）、**草案**（给审批流，AI-03）。引擎对提案只做一件事：在它自己的世界状态里问"这组效果有没有来源、谁来付、谁点头"，有就裁剪后执行，没有就拒绝并说出世界内的原因。AI 从头到尾没有写状态的权限，所以"接住任何想法"与"引擎唯一真相"不矛盾。

---

## 1. 现状：边界已经画了一半

| 已有 | 文件:行 | 意义 |
|---|---|---|
| 提案 schema 封闭 | primitive-schema.mjs:57 `proposal {intent(1–4000), participants, effects[≤64 primitive], means, context, target, consent}` | 提案里**没有**成功/价格/同意字段，I-B 成立 |
| 原语 op 封闭清单 19 个 | primitive-schema.mjs:6 | 任何效果都是这 19 个 op 的组合，RL-1 的基础 |
| 开放路径入口 | action-boundary.mjs:48（tool=world_propose 或 action=open:proposal）；open-actions.mjs:75 | 统一进 actionBoundary，preview 与 execute 同一路 |
| 来源派生与裁剪 | action-limits.mjs:247 deriveOpenLimits：spell/skill/item 的来源、sourceCaps 取小、crude 即兴制作（:267–283）、牵出牧群（:286） | RL-2/RL-3 已有骨架，但只 9 类（AUDIT3 前十第 1 条） |
| 同意 | action-consent.mjs:109 consent()、:66 requestContractConsent、:159 applyConsentEvent（事件化） | RL-4 的基础 |
| NPC 决定 | npc-decision.mjs:7 五段，输出 agree/refuse/defer/conditional + reason + conditions + alternatives + trace | 决定卡的内核已有 |
| 一致性审查 | consistency-review.mjs:10 八类 fact/time/location/knowledge/agency/naming/meta/blocked；先确定性检查再模型逐句出处 | R2 的审查骨架 |
| 回合契约 | turn-contract.mjs：引擎门禁证据 → 模型 pending 则补跑一次（tool_choice=required，含 world_no_action）→ 按回执叙述 → 审查 | I-A 已成立 |
| 效果族表 | 通用门 §2.1 open-sources/*.json（设计稿，未实现） | 把 9 类换成表，是本册 §4 的前提 |
| NPC 答开放提案 | 通用门 §6.2 推广 requestContractConsent 为唯一答复入口，agree/conditional/refuse/defer 映射到裁决 | 本册 §7 在它之上加决定卡与论据 |

**缺的**（本册要补的）：信封与候选约束的服务端校验；拒绝的统一形状（原因 + 替代 + 留痕）；"接得住 / 必须拒 / 转机制"的判定算法；决定卡与对白契约；论据修正表；审查里的"数字出处"确定性项。

---

## 2. 提议的格式

### 2.1 提案（不改，封闭）

沿用 primitive-schema.mjs:57。写明每个字段 R1 **允许填什么**：

| 字段 | R1 允许 | R1 不允许 |
|---|---|---|
| intent | 玩家原话（或其忠实缩写） | 改写成别的意图 |
| target | 候选 id | 候选外 id、名字字符串 |
| participants.target 等 | 候选 id | 同上 |
| means.item/tools/skill/spell | 玩家**持有/已学**的候选 id | 不持有的物、不会的法术 |
| means.manner | 枚举值 | — |
| effects[] | 19 个 op 之一；from/to/resource/qty/entity 为候选 id 或账户键；qty 仅填玩家**提到**的数 | 自造 op、自填幅度、填 `sink:*` 以外的凭空来源、`fact.set` 到非 writable 字段 |
| context.modifier | −5…+5，须带 reason | 无 reason 的修正 |
| consent.from/scope/onRefusal | 候选 id / 字符串 / abort|contest | 伪造同意（`consent` 字段只表达"向谁请求"，不表达"已同意"） |

### 2.2 信封（新增，提案外）

主会话 11-04 审定："source、family、unmentioned 放在提案外的信封里，不改封闭的提案 schema"。本册定全形：

```json
{
  "proposal": { ...封闭 schema... },
  "envelope": {
    "source":      {"kind": "local | jev | llm | builder | menu", "model": "deepseek-flash | jev-1.14.0 | null", "confidence": 0.0},
    "family":      "<效果族行 id 或 null>",
    "unmentioned": ["qty", "window"],
    "candidatesHash": "<引擎下发的候选集哈希>",
    "raw":         {"requestHash": "...", "responseRef": "sideband:<turn>:<n>"},
    "arguments":   [{"kind": "appeal_need", "ref": "<知情条目 id>", "quote": "原话片段"}]
  }
}
```

- 服务端**重新校验**提案里所有 id 是否在 `candidatesHash` 对应的候选集中（Jev 方案 §3.4 "不信任客户端回传"）；不在 → 返回候选（不是拒绝），R1 或玩家重选。
- `unmentioned` 里的槽位由引擎按族行缺省补（通用门 §12："缺省读条款下限，或可用上限 × 族行缺省比例，比例是数据"）。
- `arguments` 是 §7 的输入；`ref` 必须是玩家已知条目，否则 E-ARG-REF。
- 信封**不进存档事件**，只进旁路记录；事件里只有提案与回执（可复现性见 AI-05 §3）。

### 2.3 R1 三条路径产出同一形状

| 路径 | 怎么到达提案 | 信封 source |
|---|---|---|
| 主持模型（现状） | world_actions 查目录 → world_act{action, slots} 或 world_propose{proposal} | llm |
| Jev 前门（无 LLM 时） | 两步选项 → 引擎按族行 compose 出 effects | jev |
| 本地 | constructIntent → 候选 → 玩家确认；或构造器表单 | local / builder / menu |

三条路径之后**没有任何分支**：都进 actionBoundary 预览。

---

## 3. 引擎校验：八步管线

每步给"由谁、在哪个入口、按什么数据、失败怎样"。失败分两种：**退回**（返回候选/缺槽位，让 R1 或玩家补，不算拒绝）与**拒绝**（进 §5 的拒绝形状）。

| 步 | 名 | 由谁 / 入口 | 按什么数据 | 失败 |
|---|---|---|---|---|
| V1 | schema | primitive-schema 校验（actionBoundary 入口） | proposal/primitive/envelope 三个 $defs | 拒绝 E-SCHEMA（R1 路径由 R1 自纠一次；builder 路径界面即时提示） |
| V2 | 候选 | resolveProposalEntities（action-router.mjs） | candidatesHash → 候选集 | 退回候选（06 §6.10.5） |
| V3 | 知情 | createRoutingContext presence/known 过滤 | 玩家知情层、在场集合 | 拒绝 E-UNKNOWN："你并不知道/看不见这个" |
| V4 | 权能与持有 | authority（action-authority.mjs）、propertyOwners、canAct（action-capacity.mjs） | holdings、权能标签、身体状态 | 不拒绝：转为 **contested**（通用门 §5 "合法性是后果"）或 **需要同意**（V7） |
| V5 | 来源与裁剪 | deriveOpenLimits → limitOpenEffects（action-limits.mjs） | 效果族表（通用门 §2.1）、sourceCaps（open-actions.json）、物性/技能阶/设施 | 无来源 → 拒绝 E-OPEN-SOURCE；有来源但超幅 → **裁剪**，trimmed[] 写进回执（不是拒绝） |
| V6 | 守恒 | resolvePrimitiveTransfer（primitive-accounts.mjs）、ledger | 账户键、源汇 | transfer 源不足 → 拒绝 E-INSUFFICIENT；create 无 materials 且非 crude 规则 → 拒绝 E-OPEN-SOURCE |
| V7 | 对方 | consentOf → requestContractConsent → npcDecision（通用门 §6.2） | 对方主观视图、关系、义务、规矩、论据修正表（§7.3） | agree → 继续；conditional → 回执带还价条款，status=pending；refuse/defer → 拒绝 E-REFUSED 带世界内原因 |
| V8 | 代价与预览 | action-costs、action-time、check（d20，06 §6.6） | 耗时、体力、资源、难度 | 不失败；产出 receipt.preview，等玩家确认 |

确认后结算：commitPrimitives → 事件入账 → receipt.status=committed → R2。预览与结算之间若世界状态变了（sequence 变），重新走 V2–V8（turn-contract 的 isCurrent 机制已有同口径）。

**裁剪而非拒绝的原则**（RL-3 的落地）：只要效果族能派生出来源，就按"来源固有效力与 sourceCaps 取小"执行，差额写进 `trimmed[]` 并由 R2 必述（narrate.must）。例：玩家说"一拳把门打烂"，destroy 的来源是身体（physical.destroy 行 means body），门的 materialWork 需 40 分钟 → 执行为"砸了 15 分钟（improvisedMinutes），门受损 X 点，未破"，回执 must 含"门没破"。

---

## 4. 哪些没预设过的想法能接住（K2/K4），怎么接

"没预设过"指没有登记动作。能否接住**由效果族表决定**，不由意图词决定。下表是**类别**，例子只是示意。

| 类别 | 效果形状 | 来源派生自 | 现状 | 怎么接 |
|---|---|---|---|---|
| 用手头东西做没有配方的粗制品 | create(item, crude) + transfer(materials→sink:consume) | 技能阶 + 工具 checkBonus + 职业 materials（action-limits.mjs:267–283） | 已有 | 沿用；产物性状由材料属性派生（北极星） |
| 拆、砸、烧、剪、撬 | destroy / transition | 物性（cut/blunt/flammable 等 traits）+ 工具 + 身体 | 部分（9 类） | 效果族 physical.* 行 |
| 搬、拖、绑、关、放 | move（他物/他人）/ status(custody) | 负重 vs 重量；同意或 contested（通用门 §3.4） | 部分 | 效果族 physical.move/custody 行 |
| 给、借、还、押、换、分 | transfer / holding.* / obligation.* | 持有与权能；对方同意 | 已有（9 类含） | 效果族 holding/obligation 行 |
| 自定条款的约定 | obligation.create ×n | 条款下限、对方 npcDecision | 通用门 §3.2 | obligation.exchange 行；还价由 conditional 给 |
| 学别人正在做的事 | learn | 旁观 + 对方同意 + 10 册门槛 | 部分 | craft/learn 行 |
| 在东西上刻字、立标记 | create(mark) | open:leave_mark（mark-actions.mjs） | 已有 | 沿用；mark 是 K4 第一级（AI-03） |
| 给自己的东西起名 | fact.set(name) | writableFactField（primitive-policy.mjs）白名单含 name | 需核 | AI-03 §2.2：命名走 naming 校验（常用字、blocklist） |
| 临时用法（当凳子坐、当武器挥） | 用 means.item 走已有族，不改物 | 物性是否满足族行 means 要求 | 部分 | 不新增"用途"字段；性状够就行，不够就拒绝并说"它太软/太短" |
| 叠加步骤（先…再…） | 多提案序列 | open-actions.mjs:44–58 按形状识别（红线要治） | 部分 | 通用步列表（Jev 方案 §5.7），每步各走八步管线 |
| 对 NPC 提复杂请求 | obligation + arguments | §7 | 对白脱节 | 决定卡 |

**接不住的信号与处理**：V5 返回 E-OPEN-SOURCE 时，回执 `alternatives[]` 必须非空（§5.2），且提供留痕。连续多场同类拒绝 → AI-03 §4 固化队列（加族行或加内容），不是加 if。

---

## 5. 哪些必须拒绝、哪些转成已有机制（K5）

### 5.1 判定算法（由数据决定，不由词决定）

对提案 effects 逐条跑：

```
for effect in effects:
  if effect.op ∉ ops                         → E-SCHEMA
  if effect 写规则可读字段 ∉ writableFactField → E-FACT-READONLY     （改数值类）
  if effect.op ∈ {vital,status} 且 target ≠ self 且 无同意/权能 → contested 或 E-REFUSED（改他人状态类）
  if effect.op=create 且 无 materials 且 非 crude 规则 且 族表无来源 → E-OPEN-SOURCE（凭空造物类）
  if effect.op=transfer 且 from 不属 actor 且 无权能 → 按通用门 §5 转 theft 后果（不是拒绝，是合法性后果）
  if effect 指向 market 报价/规则表/他人账户余额 → E-FACT-READONLY（绕经济类）
  if effect.op=fact.set 指向 world 数据（非存档实体） → E-SCOPE（改世界规则类）
```

全部通过才进 V5–V8。拒绝码是**分类**，不是名单；每个码对应一句世界内原因模板与一组替代生成规则（§5.2）。

### 5.2 拒绝的统一形状（产品原则二.3 的落地）

```json
"receipt": {
  "status": "rejected",
  "rejection": {
    "code": "E-OPEN-SOURCE",
    "worldReason": "凭你现在的手艺和手头的东西，造不出这样的东西。",
    "alternatives": [
      {"action": "core:craft.manufacture", "slots": {...}, "label": "按已知配方做一件类似的"},
      {"family": "craft.improvise", "label": "用现有材料粗制一件"},
      {"action": "open:leave_mark", "label": "把这个念头记下来"}
    ],
    "canMark": true
  }
}
```

- `worldReason` 由拒绝码 → `rejectionPhrases` 表（world/templates/rejections/<culture|common>.json，数据）生成，可带槽位（缺的性状名、缺的技能、对方的 reason）。
- `alternatives` 由引擎生成：同族可派生的行、同目标的登记动作（worldActions query=target）、留痕。**非空**是验收项（VAI-02-5）。
- R2 叙述拒绝时 must 含 worldReason，mustNot 含"不支持""系统"等场外词（prompt.mjs isOutOfCharacter 已有同类）。

### 5.3 必须拒绝 vs 转机制 的分界

| 请求类别 | 处理 | 理由 |
|---|---|---|
| 改自己/他人的数值（属性、钱、技能值） | 拒绝 E-FACT-READONLY；替代：练习/做工/交易 | RL-3、RL-5 |
| 改他人心理状态（让他爱上我、让他信我） | 拒绝；替代：论据、恩惠、时间（关系由事件派生） | RL-4、RL-6；产品原则二.4"不伪造同意" |
| 凭空造物 | 拒绝；替代：crude 制作、买、找 | RL-2 |
| 改物价/规矩/法律 | 拒绝（个人）；**转机制**：governance_propose / org_propose（治理动作已有） | 世界有改规矩的路，走它 |
| 召唤不存在的神/生灵 | 拒绝；若是古神 → E-DEITY-CAP（命名方案 §3.4） | 命名方案硬上限 |
| 用不会的法术、不持有的物 | 退回候选（不是拒绝）："你没有/不会 X；手头有 Y" | V2/V3 |
| 偷、抢、骗 | **不拒绝**，执行并记合法性后果（通用门 §5） | 产品原则一.4"先发生、后定效" |
| 杀人、纵火等重罪 | 不拒绝，执行；法律与立场连锁 | 同上；blocklist 只管内容红线（未成年、真实宗教等） |
| 内容红线（blocklist 三档） | 拒绝 E-SENSITIVE，worldReason 用场外中性句 | 命名方案 §3.3；population SYSTEM 硬性要求 |
| 时间倒流、读档式反悔 | 拒绝 E-SCOPE | 世界状态不可逆 |

### 5.4 红线逐条到入口（RL-1…RL-6 的实现位）

| 红线 | 入口 | 校验点 | 验收 |
|---|---|---|---|
| RL-1 不写状态 | commitPrimitives 是唯一写入口；R1–R3 路径没有别的写函数 | declareHoldingWriter 登记表（holdings.mjs） | grep extension/ 与 tools/ptai 无 patches 写入；VAI-02-1 |
| RL-2 不凭空造物 | V5/V6 | create 必配 transfer→sink:consume 或 crude 规则 | VAI-02-2 |
| RL-3 不改数值 | V5 cap() 取小；V1 fact.set writable 白名单 | sourceCaps；writableFactField | VAI-02-3 |
| RL-4 不改他人 | V4/V7 | consent / authority / contested | VAI-02-4 |
| RL-5 不绕经济 | V6 守恒；R2 审查"数字出处"（§6.3） | ledger；receipt.quotes | VAI-02-6 |
| RL-6 不替 NPC 决定 | V7 npcDecision 先于对白；审查 agency 类 | 决定卡（§7） | VAI-02-7/8 |

---

## 6. R2 叙述层的边界（结算之后）

### 6.1 对白与叙述的输入是回执，不是世界

finishContractTurn 给模型的是 `turnFactsPrompt(gate)`（turn-contract.mjs:5）：status、facts、settlement、candidates、preview。本册只加一条：**决定卡**（§7.2）进 facts，并在 narrate.must 里要求转述 outcome 与 reason，mustNot 里禁止出现 facts 以外的数字。

### 6.2 must / mustNot 的生成规则（数据）

| 回执内容 | must | mustNot |
|---|---|---|
| applied[] | 每个 applied 效果的结果（按 op → 短语表） | 未 applied 的效果说成已发生 |
| trimmed[] | 被裁剪的差额（"门没破"） | 省略裁剪 |
| rejection | worldReason | 场外词；"系统/不支持" |
| decisionCard | outcome、reason、conditions 数字 | 自编价格/规矩/时间 |
| check | degree 名 | 改成功等级 |
| quotes[] | — | 任何不在 quotes 内的金额/数量 |

短语表 `narrateMust` 放 world/actions/locale/zh-CN/events.json 新区段（数据）。

### 6.3 审查新增确定性项："数字出处"

现状审查八类里 fact 类靠模型逐句出处（盘点 §3），"靠词表审查会漏检真编造；靠模型审查误伤多、成本涨"。加一条**不需要模型**的确定性检查：

```
numbers(text) = 抽取全部金额/数量/时刻（阿拉伯与中文数字 + 单位）
allowed = receipt.quotes ∪ decisionCard.conditions ∪ applied.qty ∪ facts 中的数字 ∪ 时间尾注
for n in numbers(text): if n ∉ allowed → issue{category:'fact', severity:'serious', quote, reason:'数字无出处'}
```

- 放 consistency-review.mjs 确定性段（在模型审查之前），命中即触发改写（现有流程），改写仍含 → 句级裁剪（AI-05 §4.3）。
- 这直接堵住待确认:144 的"一堂八铜""粮仓十二点才开秤"：这些数字不在任何回执里。
- 单位换算：显示单位（斤/磅/袋）→ 规范单位比对，用 12 册 units 表；比对允许 ±1 最小显示单位的取整误差。

---

## 7. NPC：决定与话脱节的解法

### 7.1 问题的准确表述

盘点 §2：决定由 npcDecision 出（五段，零模型），说话由主持模型写；模型常自己替 NPC 编价格、规矩、拒绝；说服/威胁/贿赂只对掷魅力，不看内容。三个脱节：①模型说的与引擎决定的不一致；②模型说的数字没有出处；③玩家说的内容进不了决定。

### 7.2 解法一：决定卡先出，话后说（对白契约）

**决定卡 decisionCard**（新，由 dialogue/consent 入口生成，放 receipt.facts）：

```json
{
  "npc": "<id>", "request": {"kind": "exchange|service|loan|info|passage|...", "summary": "..."},
  "outcome": "agree | conditional | refuse | defer",
  "reasons": [{"key": "conflict_obligation", "args": {"with": "<obligation id>"}},
              {"key": "argument_accepted", "args": {"kind": "appeal_need", "delta": "+cost"}}],
  "conditions": {"prepay": 12, "terms": {...}},
  "quotes": [{"what": "unitPrice", "value": 6, "unit": "coin_river"}],
  "due": 1530,
  "alternatives": [...],
  "voice": {"register": "plain", "address": "{address.stranger}", "mood": "busy"},
  "trace": [...]
}
```

- `reasons[].key` 是 npcDecision 的原因枚举（现 reason 是字符串，npc-decision.mjs:32–39；改为 key+args，字符串由模板表生成——**对无 AI 档也是必须的**，AI-01 §5.1 reasonPhrases）。
- `quotes` 由 market.mjs 报价与条款派生，是 R2/R3 可说的**全部**数字（RL-5）。
- `voice` 来自档案骨架（AI-04 §3）与当前日程/需要。
- **顺序**：V7 在预览阶段就产出决定卡；R3 写话时决定卡已在 facts 里。模型没有"先说话再看引擎答不答应"的窗口。
- 审查 agency 类加确定性项：文本里的"答应/拒绝/再说/先付"类词与 outcome 不一致 → serious（词表只有四态同义词，放 events.json 数据区段 `outcomeWords`，不是意图词表）。

### 7.3 解法二：玩家说的内容进决定（有限、可解释、通用）

jev-audit 第 5 条："需要 NPC 决策侧先有有限、可解释的决策修正规则"。本册定它：

- 输入：信封 `arguments[] {kind, ref, quote}`（§2.2）。无 AI 档由论据面板给（AI-01 §5.2）；有 AI 档由 R1 抽（§7.4）。
- 数据表 `argumentModifiers`（world/rules/tables/npc-decision.json，待实现时定名）：

```json
{
  "kinds": ["appeal_need","appeal_relation","offer_reciprocity","cite_evidence","cite_norm","threaten","flatter","appeal_faith"],
  "maxTotalDelta": {"cost": 0.3, "reward": 0.3, "urgency": 1},
  "rows": [
    {"kind":"appeal_need",      "requires":"ref ∈ view.self.goals ∧ goal.need matches offer", "effect":{"reward":"+0.2×valueOf(offer)"}, "traits":{"pragmatic":"+0.1","proud":"-0.1"}},
    {"kind":"appeal_relation",  "requires":"ref ∈ view.relations ∧ favorBalance(ref)>0",      "effect":{"cost":"-0.1×favorBalance"}, "traits":{"loyal":"+0.1"}},
    {"kind":"offer_reciprocity","requires":"ref 为玩家新建 obligation 提案",                   "effect":{"reward":"+valueOf(ref)"}, "traits":{}},
    {"kind":"cite_evidence",    "requires":"ref ∈ 玩家知情层 ∧ ref.truth≠false ∧ 与 request 相关", "effect":{"belief":"+1 档"}, "traits":{"skeptical":"-0.5"}},
    {"kind":"cite_norm",        "requires":"ref ∈ 对方已知法典/规矩",                          "effect":{"norm":"按条目"}, "traits":{"lawful":"+0.1","rebel":"-0.1"}},
    {"kind":"threaten",         "requires":"对掷 魅力/力量 vs 精神 成功",                      "effect":{"cost":"-0.2","standing":"-1","memory":"threatened"}, "traits":{"timid":"+0.2","brave":"-0.2","redline":"refuse"}},
    {"kind":"flatter",          "requires":"对掷 魅力 vs 精神 成功",                           "effect":{"cost":"-0.05"}, "traits":{"vain":"+0.1","skeptical":"-0.05"}},
    {"kind":"appeal_faith",     "requires":"ref ∈ 对方 devotee_of 的神祇/戒律",                "effect":{"norm":"按戒律"}, "traits":{"devout":"+0.2"}}
  ]
}
```

- 结算位置：npcDecision 五段里的"成本收益"段（第 3 段）之前，先把 arguments 折成 cost/reward/urgency/belief 的修正，**总幅度封顶**（maxTotalDelta）；红线段（第 1 段）不受论据影响（威胁触红线直接 refuse 并记仇）。
- 每条修正写进决定卡 `reasons[]`（argument_accepted / argument_ignored + 原因），所以可解释、可被模板与模型转述。
- `traits` 列读档案骨架的 personality.traits（AI-04 §3 把 traits 变成枚举词池，规则可读）。
- 全部数值是数据；代码里没有 kind 名单（kind 由表的 keys 给）。
- 规则是分布，允许个别不合常理：同一论据对不同 NPC 效果不同，这是设计目标不是 bug。

### 7.4 有 AI 档：R1 抽论据

- 主持模型工具面加 `arguments` 参数（在 world_propose 与对话类 world_act 的 slots 里），schema 即 §2.2 的 arguments；`ref` 必须是候选（引擎在候选集中附带玩家已知条目的 id 与摘要）。
- 不新增工具（27 个不变）。
- 模型抽错（ref 不相关）不致命：requires 不满足即 argument_ignored，决定卡写明。
- Jev 路径：论据作为第 3 步选项题（kind 多选 + ref 单选），Jev 方案 §二 的题面模板之外新增一个固定模板，同样不按失败样本改。

### 7.5 解法三：R3 说话的契约

- R3（模型写 NPC 台词）的输入只有：决定卡、档案 voice、最近 ≤4 回合对话、知情层可见条目。
- must：outcome 对应的语义词、reasons 的转述、conditions 的数字；mustNot：quotes 外的数字、决定卡外的承诺、对方不知道的事实（knowledge 类审查已有）。
- 无 AI 档：同一决定卡进模板（AI-01 §5.1）。两档的**决定**逐字节相同（VAI-02-8）。

---

## 8. 离屏规划与档案起草的边界（R3 的另两条线）

- 离屏规划（npc-planning-service / tools/npc-autonomy-planner.mjs）：已是"封闭枚举 craft/audit_inventory/trade/share + 引擎核验 + 事件入账"。本册只加两条：①提议进同一八步管线（而不是单独 validate），这样规划的 trade 也受 V6 守恒与 V7 对方同意；②无 key 时由 npc-autonomy 的规则候选（autonomy-candidates.mjs）替代，**不是空转**（AI-04 §3.4）。
- 档案起草（population-service.mjs）：骨架字段（年龄、亲属、职业、住处、财物）由代码分配、模型不得改，这条已成立；本册加：无 key 时骨架 + 确定性性格派生（AI-04 §3.2）直接可用，模型起草只是润色层，失败 3 次不再是"仅骨架"而是"骨架 + 派生性格"。

---

## 9. 数据结构汇总

| 位置 | 新增/扩展 | 形状 |
|---|---|---|
| 提案外信封 | envelope | §2.2 |
| receipt | rejection{code, worldReason, alternatives[], canMark}；facts += decisionCard；quotes[] | §5.2、§7.2 |
| world/templates/rejections/<culture|common>.json | rejectionPhrases | {code: [{when, text}]} |
| world/rules/tables/npc-decision.json | argumentKinds、argumentModifiers、maxTotalDelta | §7.3 |
| npc-decision.mjs 输出 | reason → reasons[{key,args}]（字符串由模板生成） | §7.2 |
| world/actions/locale/zh-CN/events.json | narrateMust、outcomeWords 区段 | §6.2、§7.2 |
| consistency-review.mjs 确定性段 | numbersWithoutSource、outcomeMismatch 两项 | §6.3、§7.2 |
| 工具面 | world_propose / 对话类 world_act 加 arguments 参数 | §7.4 |

---

## 10. 验收（VAI-02-x）

| # | 条目 | 测法 | 通过线 |
|---|---|---|---|
| VAI-02-1 | 唯一写入口 | grep extension/、tools/ptai/、tools/npc-autonomy-planner.mjs | 无 applyPatches/holdingSet 等写函数调用；服务端写入全部经 commitPrimitives |
| VAI-02-2 | 不凭空造物 | 提交 create 无 materials、非 crude 的提案 ×20 类模板 | 全部 E-OPEN-SOURCE；alternatives 非空 |
| VAI-02-3 | 幅度裁剪 | 提交 vital/status 超 cap 的提案 | 执行值 = min(来源效力, cap)；trimmed 非空；R2 文本含裁剪（录制回放） |
| VAI-02-4 | 他人状态 | 对在场 NPC 的 status 提案，无同意 | contested 或 E-REFUSED；无静默执行 |
| VAI-02-5 | 拒绝形状 | 全部拒绝码各 ≥3 例 | worldReason 非空且无场外词；alternatives ≥1；canMark=true |
| VAI-02-6 | 数字出处 | 录制回放 100 回合注入 20 条含无源数字的叙述 | 20/20 被确定性检查标 serious；0 元 |
| VAI-02-7 | 决定先于话 | 录制回放对话回合 | decisionCard 的 sequence < 模型台词的请求时间 100% |
| VAI-02-8 | 两档决定相同 | 同一存档、同一提案 + 同一 arguments，T0 与 T2（回放） | decisionCard 逐字节相同 |
| VAI-02-9 | 论据封顶 | 叠加 8 种论据 | cost/reward 修正 ≤ maxTotalDelta；红线段不变 |
| VAI-02-10 | 论据可解释 | 任一含 arguments 的决定 | reasons 含每条论据的 accepted/ignored 与原因 |
| VAI-02-11 | 候选外不猜 | 新题集 N 过 llm 路径（回放） | 候选外 id 的提案 0；退回候选的回合不算错 |
| VAI-02-12 | 转机制 | "把物价砍半"类 K5 提案 | 拒绝码 E-FACT-READONLY；alternatives 含 governance_propose/org_propose |
| VAI-02-13 | 红线 grep | npc-decision.mjs、action-limits.mjs、consistency-review.mjs | 无 argument kind 字面量分支；无意图词；outcomeWords 只在数据 |

---

## 11. 待定项

| 编号 | 事项 | 推荐 | 不选的代价 |
|---|---|---|---|
| 【待定·亮圳】P02-1 | 偷/抢/骗/杀不拒绝、只记后果（§5.3） | 维持（产品原则一.4） | 若改为拒绝，"最自由的文字 RPG"失去底色 |
| 【待定·亮圳】P02-2 | 威胁成功是否永久记仇（memory threatened 不遗忘） | 按 npc-memory TTL 正常遗忘，但立场 −1 不回弹 | 永久记仇让早期失误不可挽回 |
| 【待定·李白】P02-3 | 决定卡 reasons key 化需改 npc-decision.mjs 输出形状，是否随通用门卡 1 一起 | 一起（同改 consent 入口） | 分开做则模板表要兼容字符串 reason 一段时间 |
| 【待定·李白】P02-4 | 数字出处检查的单位换算容差 ±1 最小显示单位 | 采用 | 不设容差，"约二斤"会被误伤 |
| 【待定·李白】P02-5 | arguments 参数加在 world_propose 与哪些对话类 world_act 上（需列 slots 有 consent 的动作） | 按 `consent.from` 存在的动作自动加，不列名单 | 手列名单违反 RL-8 |

---

## 12. 自检（随机抽三条）

1. **§3 八步管线**：每步有执行者、入口、数据、失败处置；与现有函数名对上。开发者可按步写集成测试。可开工；V5 依赖通用门卡 1 的族表。
2. **§7.3 argumentModifiers**：表形状、字段语义、封顶、结算位置、可解释输出都写了；`requires` 表达式用 RX（通用门 §2.1 口径）。可开工；traits 枚举依赖 AI-04 §3.2。
3. **§6.3 数字出处**：算法、放置位置、容差、堵住的事故都写了。可开工，零模型费。
