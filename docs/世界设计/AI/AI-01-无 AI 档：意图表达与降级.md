# AI-01 无 AI 档：意图表达与降级

（2026-11-10 AI-TOP 第 1 册。只写设计。事实基础：盘点 §1、§6、§7 与"无 AI 档 vs 有 AI 档现状一览表"；代码 F:/dnd-wt/M26 用 grep 核过的片段。）

---

## 本册回答什么 / 依赖哪些册

**回答**：盘点问题 a——没有 AI 时，每类玩法靠什么表达玩家的各种意图；动词、选项、结构化输入、自由输入四层各怎么做；自由输入怎么降级（关键词与形式模板解析、澄清选项、转成最接近的已有动作、预填构造器、留痕）；按玩法逐类列出哪些体验会缺、缺多少、怎样让缺的部分仍然好玩；对盘点"本地自由输入命中率 22–42%"给出提升方案与目标值。

**依赖**：AI-00（档位 T0、五类想法 K1–K5、红线 RL-8）；通用门设计稿 §2（效果族表三处消费）、§8（登记动作口径）、§12（提案与信封）；Jev 方案 §三（降级矩阵、预填构造器、本地路径真实水平）、§五（不准按意图列名单）；12 册 §3.5/§4.5（对话模板、命名）；实施日程 WD-27（对话模板 40 个）。

**一句话**：无 AI 档不是"把 AI 关掉以后剩下的东西"，而是一个**自带完整表达系统**的档位：四层输入（动词目录 → 选项与澄清 → 结构化构造器 → 自由文字本地解析），每层都落到同一份 proposal / `{action, slots}`，所以它与有 AI 档的世界效果相等（VAI-00-1）。缺的只是"说人话就行"的便利和模型文字的质感，本册把缺口逐类量出来，并给每个缺口一个仍然好玩的做法。

---

## 1. 现状与真实水平（只列设计要用的）

| 项 | 现状（文件:行） | 对本册的意义 |
|---|---|---|
| 动作目录 | world/actions/{core,business,documents,institutions,law,open,transport}.json，`verb` 343 处、`synonyms` 342 处、`intentForms` **全仓只 1 处**（grep 计数） | 形式模板几乎没有数据，本地解析只能靠 label/verb/synonyms 词包含 |
| 本地解析 | action-constructor.mjs:41 `constructIntent`：searchActions 取 ≤24 条 → completeCommand（label/verb/synonyms 包含且剩余文字只剩虚词）→ 逐槽位从场景候选填 → 候选列表；:27–40 的虚词表只做降级路径（Jev 方案 §5.4） | 本册不往这张词表里加词（红线）；提升只能来自数据与澄清流程 |
| 候选按钮 | runtime.js:525–541 "你是想……？"按钮；"打开可做之事，继续构造"只切面板，**无预填**（Jev 方案 §3.3） | 预填构造器是本册 P4 |
| 构造器 | extension/action-builder.mjs；开放提案槽位 intent / target / consent / participants / means / effects / context（action-affordances.mjs:82–92），effects 的 oneOf 变体来自 proposal schema | 结构化入口已在，缺"效果族选项面板"（P6） |
| 可做之事 | action-affordances.mjs；`entityCard` 探测清单写死（:342–354，通用门 §2.1 第 2 条要改读族表） | 动词目录层的现状 |
| 对白 | dialogue.mjs:46 模板键 `${culture}/plain/${action}_${outcome}.json`，world/templates/dialogue 只有 common/plain 8 个；说服/威胁/贿赂只对掷魅力，不看内容（待确认:170） | 无 AI 对白几乎为零；是本册 §5 |
| 叙述 | action-text.mjs 读 world/actions/locale/zh-CN/events.json，查找顺序 events[模板键] → events[动词] → groups[界面分组] → groups.default | 模板只有一级文本，没有按结果档、文化、时段的变体 |
| 真实水平 | 冻结题集路由 41.6%、构造器 22.1%；准确重放 250 回合中 161 个可判回合：前 5 候选含正确 60（37.3%），参数可直接确认 16（9.9%）（盘点 §1，待确认:161） | 本册 §7 的基线 |
| 已定方向 | 待确认:79–80 用户"按 B 做"：全部玩法无 LLM 可玩，不分阶段；有快捷按钮；构造器组合效果原语 | 本册照此 |

---

## 2. 四层表达系统

四层从"最省脑子"到"最自由"，每层的产物相同；上一层失败自动落到下一层，任何一层都能到达"留痕"这个终点，所以**没有一句输入会得到"不支持"**。

```
层 1 动词目录（可做之事）        点一下就走；产物 {action, slots（已填）}
   │ 找不到想做的
层 2 选项与澄清                   "你是想…？" ≤5 候选 + 「都不是」+ 「留下痕迹」；产物同上
   │ 都不是
层 3 结构化构造器                 做什么 / 对什么 / 用什么 / 多少 / 什么时候；产物 proposal
   │ 想直接打字
层 4 自由文字（本地解析）         constructIntent → 候选 → 回到层 2；无候选 → 预填的层 3
```

每层的执行者、入口、数据：

| 层 | 由谁 | 入口 | 按什么数据 |
|---|---|---|---|
| 1 | worldActions()（action-affordances.mjs） | world_actions / 可做之事面板 | 动作目录 visibility.catalog（quick/here/target:*/search/llm，primitive-schema.mjs:44）+ 效果族表探测（通用门 §2.1 第 2 条） |
| 2 | runtime.js 候选按钮 + 本册新增"大类澄清" | /propose 预览返回 candidates | constructIntent 候选；动作 `family`（数据）；效果族表 `id` 前缀作大类 |
| 3 | action-builder.mjs | 构造器面板 | 开放提案槽位（action-affordances.mjs:82）+ 效果族表 slots/compose（通用门卡 1 的 ⑤） |
| 4 | constructIntent（action-constructor.mjs） | 聊天输入框（understand=local） | 动作 intentForms / synonyms / label（数据）；场景实体候选；时间槽 generic.timeSlots（open-actions.json） |

### 2.1 层 1：动词目录怎么不变成"菜单游戏"

盘点 §6 说"实际上只能点菜单"，问题不在菜单本身，在**菜单的组织**。三条规则：

1. **按目标组织，不按动词组织**。点一个人、一个物、一处设施，看到"对它能做什么"（entityCard）。探测清单改读效果族表后，新内容（新的物性、新的设施词）自动出现在卡上，不需要改代码（通用门 §2.1）。
2. **快捷区由处境派生**。`visibility.catalog: quick` 的动作 + 当前最紧的需要（body-needs：饿、渴、累、冷）+ 当前义务到期项 → 顶部 ≤6 个按钮。数据：动作目录 + obligations + needs 阈值；代码只排序，不列名单。
3. **目录可搜**。world_actions 的 `query` 已支持搜索；面板搜索框即层 4 的入口之一（输入即解析）。

### 2.2 层 2：澄清不是"猜错了再猜"，是两步选择

现状是把 ≤5 个候选平铺。改成**两步**，与 Jev 方案 §二 的"先大类再动作"同形，但本地做：

- 第一步**大类**：候选动作按 `family`（动作数据字段，缺省取 id 冒号前段，如 `core:dialogue` → "说话"）聚合；效果族表的族 id 前段（holding / obligation / physical / craft）也作为大类。每个大类一个按钮，附一句数据里的 `familyLabel`。另加固定两项：「都不是——自己组合」（进层 3）与「只是想留下这个念头」（open:leave_mark）。
- 第二步**动作与槽位**：选中大类后列该大类下的候选动作（≤5），每条显示已填的槽位和缺的槽位；缺的槽位以下拉给出场景候选。
- 与 constructIntent 的接口：candidates 已返回 `{action, slots, missing}`（action-constructor.mjs:84–89 形状），只需在客户端做聚合，服务端加 `family` 字段投影。

### 2.3 层 3：构造器的三栏

通用门 §12 把提案的来源规定为效果族表的 `slots` 与 `compose`，本册只定**界面形状**：

- 栏一「做什么」：效果族行（按族分组：拿/给/借/还、做/修/拆、搬/绑、学、立约/履约/撤约、刻记、仪式）。来源：open-sources/*.json 每行 `id`、`label`（数据）。
- 栏二「对什么」：在场实体与持有物（createRoutingContext 的 presence/known 过滤），不含隐藏事实。
- 栏三「用什么／多少／何时」：means（item / tools / skill / spell / manner）、数量、时间槽。
- 底部始终显示引擎**预览**：预计耗时、难度、需要谁点头、会消耗什么、可能的法律后果（receipt.preview）。玩家确认后才结算。
- 栏一找不到族 → 显示「这个世界还没有这种做法」+ 留痕按钮 + 「告诉设计者」（进 AI-03 第三级的玩家申请队列）。**不退到近似普通动作**（Jev 方案 §〇 第 4 条）。

### 2.4 层 4：自由文字的本地解析与降级链

```
文字 ──► constructIntent
          ├ 候选 ≥1 ──► 层 2（两步澄清）
          └ 候选 = 0 ──► 预填构造器（层 3）：
                            target ← 文字中命中的在场实体名/别名（mentions，action-constructor.mjs:11）
                            means  ← 命中的持有物 / 已学技能 / 法术名
                            qty    ← 数字+单位抽取（§4.2 规则）
                            at     ← generic.timeSlots（open-actions.json）
                            族     ← 由命中的 means 性状反查效果族表 applies（有则预选，无则留空）
                          + 始终附带「留痕」
```

降级链的每一步都是**玩家可见的**：候选按钮、构造器、留痕，没有一步是静默吞掉输入。`understand=off`（完全关闭理解）时输入框只作搜索框，提交即打开预填构造器，不再抛错（修 runtime.js:106 "intent=off 且叙述关时直接抛错"）。

---

## 3. 按玩法逐类：无 AI 时怎么表达、缺什么、缺多少、怎样仍好玩

"缺多少"的口径：对该类玩法在有 AI 档的典型回合里，玩家一句话能完成而无 AI 档需要**额外 ≥2 次点选**或**完全做不到**的比例。数字是设计估算（无实测），只用于排优先级，不进验收。"做不到"的项才是真缺口，其余是便利差。

| 玩法 | 层 1–3 怎么表达 | 层 4 本地解析命中预期 | 缺的体验 | 缺多少（估算） | 怎样仍然好玩 |
|---|---|---|---|---|---|
| **移动与旅行** | 地图点选目的地（map-view）；world_move 槽位 destination/mode | 高（地名实体命中） | 无 | 便利差 <10%，做不到 0 | 地图本身就是好入口；路况、封季、路费在预览里 |
| **吃住与日常** | 快捷区按需要推送（饿→买饭/做饭；累→投宿/休息） | 高 | "随便找点吃的"这类模糊话 | 便利差 ~20% | 需要驱动的快捷区比打字快 |
| **交易与经营** | 商铺卡：买/卖/议价/赊/雇/合伙；world_trade 14 种 operation | 中（数量与物品名抽取） | 讲价时"说点好话"、复杂条款口述 | 便利差 ~30%，做不到 ~5%（口述多条款合同） | 议价做成**对掷+论据选择**（§5.2）；合同做成条款表单，比口述更清楚 |
| **对话与社交** | NPC 卡：打招呼/打听/请求/威胁/贿赂/许诺；论据选择面板（§5.2） | 低（内容是自由的） | **自然对白**；闲聊；套话；情感表达 | 做不到 ~60%（闲聊、角色扮演式表达） | 对白模板按文化/语域/关系/决定卡变化（§5.1）；打听做成**话题树**（知情层条目）；闲聊走"留痕 + NPC 记忆"，下次见面 NPC 会提 |
| **制作与维修** | 工坊卡：配方列表（按材料可得过滤）；world_craft；开放 crude 制作走构造器 craft 族 | 中 | "用这块皮做个护腕"这种**没有配方**的即兴制作需进构造器 | 便利差 ~40%，做不到 0（crude 规则已在 action-limits.mjs:267） | 构造器"做什么/用什么材料"两栏 + 预览产物性状（材料属性派生），本身像一个小游戏 |
| **战斗** | 战斗面板：攻/防/脱离/推搡 + 目标 + 武器；world_combat | 高 | 花式描述（"从背后偷袭"）→ 需选 manner:stealthy | 便利差 ~20% | manner 枚举（careful/quick/forceful/stealthy/clever…）就是花式的结构化版 |
| **学艺与练习** | 师傅卡：拜师/学/练/升档/出师；world_learn / practice / profession | 高 | 无 | <10% | — |
| **法律** | 衙署卡：报案/自首/搜/捕/听审/上诉/缴/赔；world_law 17 种 operation | 中 | 法庭陈词（自由辩护） | 做不到 ~30%（陈词） | 陈词做成**证据与论据选择**（knowers、evidence 条目），判决 explain 显示采信了哪条 |
| **信仰与仪式** | 庙观卡：祈/供/许愿/朝圣/受戒；faith_* operation | 中 | 祷词 | 做不到 ~20%（祷词） | 祷词留痕 + 文化模板祷文；神祇 tell 通道（04 册）本就是引擎产物 |
| **农牧与采集** | 田/圈/林卡：播/收/喂/牵/采；world_farm / wildlife / pet | 高 | 无 | <10% | — |
| **探索与据点** | 据点卡：进/查/解机关/采；world_site；环境卡：刻记/接近/搬/听/落 | 中 | "仔细看看墙上有没有暗门"这类**观察意图** | 便利差 ~30% | 观察做成"查看 + 检定"按钮，结果进知情层；暗门类用 features 数据 |
| **家庭、组织、治理** | 家/会/衙卡：婚/收养/分家/入会/提案/投票/任免 | 中 | 政治游说的言辞 | 做不到 ~30%（游说内容） | 游说=论据选择 + 立场/利益派生的 npcDecision；投票结果 explain 可见 |
| **书写与研究** | world_research：立项/写/抄/演/融合；文书内容文本框 | 低（内容自由） | 写书、写信的**内容**没有 AI 润色 | 做不到 ~50%（文采） | 玩家自己写就是内容，引擎只认 language/script/text；信件内容进知情层，NPC 按关键词检索（retrieval.mjs） |
| **开放创意（K2/K4）** | 构造器三栏 + 留痕 | 低 | "说一句话世界就懂"的魔法感 | 便利差 ~70%，做不到 0（族表能派生的都能拼） | 构造器预览把"这件事在这个世界里会怎样"算给你看，这是另一种魔法感 |

汇总：**做不到**的集中在三处——自然对白与闲聊、自由陈词/游说/祷词、文采（写作内容）。它们的共同点是"内容本身就是文字"，没有 AI 时世界不能替玩家写字。本册的态度：不假装能写（产品原则二.4），而是让**玩家写的字真的进世界**（知情层、记忆、留痕、文书），并让 NPC 的回应由决定卡与模板给出结构化的、因人因地而异的反应（§5）。

---

## 4. 自由输入本地解析提升方案

### 4.1 为什么现在低，哪些路能走、哪些路是红线

- 低的根因（盘点原话）："引擎不懂语言，靠事实与关键词出候选，覆盖不到。" 具体到代码：completeCommand 要求 label/verb/synonyms 整词包含且剩余只剩虚词；intentForms 全仓 1 处，等于没有形式模板；槽位靠实体名精确提及。
- **不能走的路**：往 action-constructor.mjs 的虚词表、或代码里任何地方加意图词（AGENTS.md 红线；Jev 方案 §5.4）。
- **能走的路**（Jev 方案 §5.1 原话"提升识别率的办法是改数据里的标签与例子（走内容审批）"）：
  - P1 形式模板数据化；P2 槽位抽取规则通用化；P3 两步澄清；P4 预填构造器；P5 效果族直通；P6 效果族选项面板。
- **与"自由度优先"的关系**：产品原则二.2 禁的是用关键词**封顶**。形式模板只决定"先猜哪条"，猜不中仍落到构造器与开放路径，所以不封顶。写进验收：任意输入都有非"不支持"的出口（VAI-01-1）。

### 4.2 P1 形式模板（intentForms）数据化

- 落点：每条动作数据加 `intentForms: string[]`（已被 formSlots 读取，action-constructor.mjs:13–23，字段已存在，只是没数据），与 `synonyms` 并列。
- 形状：`"把{qty}{item}卖给{target}"`、`"向{target}买{qty}{item}"`、`"去{destination}"`。占位名必须等于该动作的槽位名（L1 校验 E-INTENT-SLOT）。
- 规模：首版每个**玩家可见**（visibility.catalog ≠ llm）的动作 ≥3 条，由内容卡写（不是代码）；估 343 动作 × 3 ≈ 1000 条，分两批。
- 作者规则（写进内容卡说明，L1 校验）：
  1. 形式只写**句法骨架**，不写具体实体名（E-INTENT-LITERAL：模板里出现任何 world 实体 name/id 即报错）。
  2. 同一动作的三条形式必须覆盖"动词在前 / 目标在前 / 省略目标"三种语序。
  3. 不为某道题写模板（产品原则三.1；题集与模板作者隔离，模板作者不读题集）。
- 匹配算法（通用，不改）：formSlots 的正则已能做；补两点：全角/半角与繁简 NFKC 归一（completeCommand 已有 normalize）；数量槽允许中文数字（§4.3）。

### 4.3 P2 槽位抽取规则（通用，数据驱动）

| 槽位类型 | 抽取规则 | 数据 |
|---|---|---|
| entity | 在场/已知实体的 name、aliases、id 子串匹配，长名优先（现有 mentions + namedOption） | 场景候选 |
| qty | `(\d+|[一二两三四五六七八九十百千]+)\s*(单位)?`；单位→规范单位换算走 12 册 §4.6 units 投影的反向表（显示单位→kg/ml/枚） | units 表（01 §3.2） |
| time | generic.timeSlots（日词 + 锚点 + 前/之前）；不认识的写法留作待补槽位（open-actions.json note 原则） | open-actions.json |
| manner | means.manner 枚举的**数据别名表** `mannerAliases`（如"悄悄/偷偷"→stealthy），放 open-actions.json，不放代码 | 新键 generic.mannerAliases |
| item/skill/spell | 持有物与已学项的 name/aliases | 玩家 inventory / knowledge |

未抽到的槽位进 `missing`，由层 2 下拉或层 3 表单补；**不猜**。

### 4.4 P3 两步澄清（见 §2.2）与 P4 预填构造器（见 §2.4）

两者的度量意义：把"候选前 5 含正确"（现 37.3%）这个指标变成"玩家在 ≤2 次点选内确认"。因为大类聚合把 24 个 searchActions 结果折成 ≤6 个大类按钮，第二步再 ≤5 条，正确动作只要在前 24 里就能两步到达。searchActions 前 24 的召回现状**无数据**（盘点只给前 5），AI-21 卡先测再定目标（§7）。

### 4.5 P5 效果族直通

当 constructIntent 候选为 0 但预填构造器从文字里抽到了 `means` 与 `target`，且效果族表某行 `applies` 对该目标成立、`means` 要求被持有物性状满足，则构造器**预选该族行**并显示预览。这是"转成最接近的已有机制"的正解：不转成近似的登记动作（会改变原意），而是转成**同一组效果的开放路径**（Jev 方案 §5.6："普通句被判成超出、由开放路径等价执行，不算错"）。

### 4.6 P6 效果族选项面板

层 3 栏一的数据源。族表每行需要 `label`、`hint`、`slots`（通用门卡 1 的 ⑤ 已采纳）。本册只补一条：族行可带 `examples: string[]`（显示用例句，不参与匹配，E-FAMILY-EXAMPLE 校验里不得含实体名）。

---

## 5. 无 AI 的对话与社交（K3）

这是无 AI 档最大的缺口（§3 表"做不到 ~60%"），也是盘点第三个最严重问题（"说话不影响 NPC"）的无 AI 侧答案。

### 5.1 决定卡 → 模板对白

AI-02 §7 定义**决定卡 decisionCard**（npcDecision 输出 + 引擎报价/条款/原因）。无 AI 档的对白就是把决定卡填进文化模板：

- 模板目录沿用 12 册 §3.5：`world/templates/dialogue/<culture>/<register>/<action>_<outcome>.json`。现状只有 common/plain 8 个（ask/default/greet×3/haggle×3）。
- **模板键集合扩大**（与实施日程 WD-27 的"40 个模板"有冲突，见 AI-06 冲突清单 C-3）。首版必备集：

| action | outcome | 说明 |
|---|---|---|
| greet | stranger / known / kin / hostile | 按关系档 |
| ask | known / unknown / secret / rumor | 按知情层结果 |
| request（泛指请求：借、帮、带路…） | agree / conditional / refuse / defer | 直接对应 npcDecision 四态 |
| haggle | accept / counter / refuse | 对应 conditional 的还价条款 |
| threaten | yield / resist / report | 按对掷结果与 NPC 红线 |
| bribe | accept / refuse / report | 同上 |
| persuade | moved / unmoved | 论据修正后的决定变化 |
| promise | accept / doubt | 按信任 |
| farewell | plain / warm / cold | 按立场 |
| smalltalk | weather / work / family / festival | 按 NPC currentConcern 与日程（档案骨架字段，AI-04 §3） |

  9 action × 2–4 outcome ≈ 30 键 × 每文化 ≥2 变体 = 每文化 ≥60 条；18 文化 ≥1080 条。**这是内容规模，不是代码**。首版可按 5 个文化圈写（圈级目录，文化缺省回圈），12 册 M6 的"回退改报错"改为"文化 → 圈 → common 三级回退，缺 common 才报错"（冲突 C-3 的建议）。
- 槽位：`{address.*}`（12 册 §3.3 naming.address）、`{quote}`（引擎报价）、`{terms}`（条款摘要）、`{reason}`（npcDecision 的世界内原因键 → 文化化短语表 `reasonPhrases`）、`{concern}`（NPC 当前关切）、`{name}`。
- 执行者：dialogue.mjs:46 现有查找；新增 `reasonPhrases` 表放 world/templates/dialogue/<culture>/reasons.json。

### 5.2 论据选择：让"怎么说"影响决定，但不靠 AI

待确认:170 用户问"玩家的说话方式都不能影响 NPC 么"。无 AI 档的答案是**结构化论据**：

- 请求/议价/威胁/游说类动作的槽位加 `arguments: [{kind, ref}]`，`kind` 枚举（数据，放 npc-decision 规则表）：`appeal_need`（指出对方的需要）、`appeal_relation`（提恩惠/亲缘）、`offer_reciprocity`（许诺回报）、`cite_evidence`（引用知情层条目）、`cite_norm`（引用规矩/法典）、`threaten`、`flatter`、`appeal_faith`。`ref` 必须是玩家**已知**的条目 id（知情层、关系、持有、法典），不能凭空。
- 面板：NPC 卡上"怎么说"折叠区，列出当前**可用**的论据（有 ref 才可用：你知道他缺粮才能"指出需要"）。这本身是一个小的信息游戏——打听得多，论据就多。
- 结算：npcDecision 加有限修正项（AI-02 §7.3 定数据表 `argumentModifiers`），上限 ±k；修正与否、修正多少写进决定卡 `reasons[]`，模板对白读它（"你说得对，我家确实缺粮——那就赊你三天"）。
- 有 AI 档时，R1 从自由文字里**抽**这些论据（AI-02 §7.4），两档结算一致。

### 5.3 闲聊与"角色扮演式表达"

无 AI 档不能生成闲聊回应，但能做到两件真实的事：
1. 玩家的话进 NPC memoryStream（world_remember 已有机制：有源事实/在场传闻/谎言），下次相遇 greet 模板可引用 `{lastTopic}`。
2. smalltalk 模板由 NPC 骨架字段（currentConcern、日程、天气、节日）驱动，所以同一句"最近怎样"在不同人、不同日子得到不同回答——这是**世界在说话**，不是模型在说话。

---

## 6. 无 AI 的叙述（R2 模板层）

模板叙述在 T0 是正式产物（I-D）。现状只有一级文本。补三件事，全是数据：

1. **变体**：events.json 每键允许 `variants: [{when: {degree?, culture?, daypart?, weather?}, text}]`，查找时按 when 匹配度取最具体的一条，同分按种子键 `narr:<eventId>` 确定性抽（可复现）。
2. **文化 locale**：目录 `world/actions/locale/<culture>/events.json` 只写覆盖键（文件 note 已允许"其他 locale 目录只需写要覆盖的键"）。
3. **回执槽位**：允许引用 receipt 字段 `{applied.*}`、`{trimmed.*}`、`{check.degree}`、`{consequences[0]}`、`{quote}`。空槽自动落下一级（现有行为）。

质量指标（VAI-01-6）：30 日无 AI 推演里，连续 20 条叙述文本的**重复率**（相同模板键命中同一变体）≤ 30%；空槽落级比例 ≤ 5%；每类事件至少 2 个变体。

---

## 7. 命中率：基线、度量与目标值

### 7.1 度量口径（防过拟合，产品原则三.1）

- 题集：新题集 N，由不读代码的子代理一次性编写，判分器冻结（Jev 方案 §6.2、主会话 11-04 ⑦）。旧冻结题集（a3-score-v5b）只做体检。
- 三个指标：
  - **R24 召回**：正确动作在 searchActions 前 24 候选内的比例（新指标，无现状数据）。
  - **C2 两步确认率**：玩家在 ≤2 次点选内到达正确动作+正确槽位的比例（取代"前 5 含正确"）。
  - **S 直接确认率**：槽位全部抽对、无需补填的比例（现 9.9%）。
  - **接住率**：输入得到四种合法回应之一（执行/条件/拒绝带原因/留痕）的比例，必须 100%。
- 任何按题修模板的 diff 判不合格；模板作者不读题集。

### 7.2 目标值（目标，不是承诺；依据写在旁）

| 指标 | 基线 | 首版（P1–P4 后） | 第二版（P5–P6 + 全量模板后） | 依据 |
|---|---|---|---|---|
| R24 | 无数据 | 先测 | ≥ 85% | 三条语序形式 + synonyms；searchActions 本身是词包含，召回受模板覆盖率驱动 |
| C2 | 37.3%（前 5 含正确，近似） | ≥ 60% | ≥ 75% | 大类折叠使前 24 都可两步到达，C2 ≈ R24 × 玩家选对大类的概率；取保守 0.7 |
| S | 9.9% | ≥ 30% | ≥ 45% | 中文数字、别名表、长名优先三条规则覆盖重放样本里最常见的槽位失败（数量与实体别名） |
| 接住率 | 未统计（intent=off 会抛错） | 100% | 100% | §2.4 降级链无静默出口 |

**不达标怎么办**：不加词表、不调阈值。写出失败样本的**类别**（如"目标是集合名词""时间表达是节日名"），类别落到效果族表或模板数据的新一行（红线口径），再测新题。

---

## 8. 设置页与界面文案（T0 相关）

- 设置页 aiProfile 四档卡片；T0 卡片文案："不用任何模型。所有玩法都能玩，用菜单、构造器和打字（打字由本地规则理解，不如模型准）。费用 0。"
- 输入框占位文字随 understand 档变化：local→"打字或点下方可做之事；没猜对会让你选"；off→"搜索可做之事"。
- 候选面板固定两项文案：「都不是，我自己组合」「只是想留下这个念头」。
- 构造器"找不到族"文案："这个世界还没有这种做法。你可以留下痕迹（别人可能注意到），或告诉设计者。"后者进 AI-03 §4.2 申请队列。

---

## 9. 数据结构汇总（本册新增/扩展，全是数据与投影，不新增代码分支）

| 位置 | 字段 | 形状 | 校验 |
|---|---|---|---|
| world/actions/*.json 每动作 | `intentForms` | string[]，≥3，占位 = 槽位名 | E-INTENT-SLOT、E-INTENT-LITERAL |
| 同上 | `family`、`familyLabel` | string | E-FAMILY-KNOWN（族 id 在族表或动作目录大类表内） |
| world/rules/tables/open-actions.json generic | `mannerAliases` | {alias: manner} | manner ∈ means.manner 枚举 |
| world/rules/tables/open-sources/*.json 每行 | `label`、`hint`、`examples` | string / string[] | E-FAMILY-EXAMPLE |
| world/templates/dialogue/<culture|sphere|common>/<register>/<action>_<outcome>.json | 模板 | `{variants:[{when,text}]}` | E-DIALOGUE-SET（三级回退后缺 common 才报） |
| world/templates/dialogue/<culture>/reasons.json | `reasonPhrases` | {reasonKey: [text]} | reasonKey ∈ npcDecision 原因枚举 |
| world/actions/locale/<culture>/events.json | `variants` | [{when:{degree,culture,daypart,weather}, text}] | 槽位名 ∈ 回执字段白名单 |
| npc-decision 规则表（world/rules/tables/npc-decision.json，待实现时定名） | `argumentKinds`、`argumentModifiers` | 见 AI-02 §7.3 | 上限 ±k 为数据 |
| 客户端 ui-settings | `aiProfile` | AI-00 §3.2 | — |

---

## 10. 验收（VAI-01-x）

| # | 条目 | 测法 | 通过线 |
|---|---|---|---|
| VAI-01-1 | 无"不支持"出口 | T0 档，新题集 N 全部输入 + 100 条随机乱码/外语 | 每条得到：候选 / 预填构造器 / 留痕 之一；0 次抛错 |
| VAI-01-2 | 形式模板覆盖 | 脚本统计 visibility.catalog≠llm 的动作 | 每条 intentForms ≥3，三种语序各 ≥1；E-INTENT-LITERAL 0 |
| VAI-01-3 | 命中率 | 新题集 N 跑 R24 / C2 / S | 首版 C2 ≥60%、S ≥30%；第二版 C2 ≥75%、S ≥45%（§7.2）；题集不得用于修订 |
| VAI-01-4 | 两步澄清 | 取 N 中正确动作在前 24 的题 | 大类按钮 ≤6；第二步 ≤5；正确项可达 100% |
| VAI-01-5 | 预填构造器 | N 中候选为 0 的题 | target/means/qty 中至少一项被预填的比例 ≥70%；预填值 ∈ 场景候选 100% |
| VAI-01-6 | 模板叙述质量 | T0 推演 30 日取连续 20 条 | 重复率 ≤30%；空槽落级 ≤5%；每事件类变体 ≥2 |
| VAI-01-7 | 对白模板集合 | 加载校验 | 5 圈目录各含首版必备键（§5.1 表）；三级回退；18 文化 address 字段齐 |
| VAI-01-8 | 论据影响决定 | 同一请求，有/无 `appeal_need`（ref 为真实知情条目） | 决定卡 reasons 含论据条目；outcome 或 terms 变化方向与 argumentModifiers 表一致；无 ref 的论据被拒 E-ARG-REF |
| VAI-01-9 | 等价性 | 同一份 proposal 分别由构造器与录制的 LLM 路径提交 | 同 VAI-00-1 |
| VAI-01-10 | 红线 | grep action-constructor.mjs、action-affordances.mjs、dialogue.mjs | 无新增意图词/实体 id/文化 id 字面量；虚词表未增行 |
| VAI-01-11 | 快捷区派生 | 把玩家 satiety 置低（用真实动作：不吃 1 日） | 快捷区出现进食类动作；恢复后消失；代码无动作 id 名单 |

---

## 11. 待定项

| 编号 | 事项 | 推荐 | 不选的代价 |
|---|---|---|---|
| 【待定·亮圳】P01-1 | 对白模板首版按 5 圈写（每圈 ≥60 条）还是按 18 文化写（≥1080 条） | 先 5 圈，文化缺省回圈；第二批补文化 | 按 18 文化写首版内容量 ×3.6，拖慢 T0 可玩 |
| 【待定·亮圳】P01-2 | 论据面板是否默认展开（信息游戏感 vs 界面噪音） | 默认折叠，有 ≥1 可用论据时亮标 | 默认展开让每次对话多一屏 |
| 【待定·李白】P01-3 | 大类聚合用动作 `family` 字段还是 id 前段缺省 | 加 `family` 字段，缺省 id 前段 | 纯前段会把 core: 下 300 多条塞进一类 |
| 【待定·李白】P01-4 | R24 是否作为正式指标（需先测基线） | 先测一次定基线，再定是否保留 | 没有召回指标，C2 的失败无法归因 |
| 【待定·李白】P01-5 | 叙述变体同分时的确定性抽取键 `narr:<eventId>` 是否纳入哈希范围 | 不纳入（叙述不进哈希，I-E） | 纳入则改模板会破坏哈希对账 |

---

## 12. 自检（随机抽三条）

1. **§4.2 intentForms**：字段位置、形状、规模、校验码、作者规则都写了；匹配复用 formSlots。开发者可直接开内容卡 + 一条 L1 校验卡。可开工。
2. **§5.2 论据选择**：槽位形状、kind 枚举、ref 约束、面板位置写了；修正表的数值形状在 AI-02 §7.3。开发者需两册并读，但不需追问。可开工。
3. **§6 叙述变体**：形状、匹配规则、确定性键、质量指标写了；回执字段白名单"待实现时定"——这是一处欠账，AI-05 §4.4 补白名单初稿（applied/trimmed/check/consequences/quote/minute/location）。可开工。
