# 卷九 AI 接口

起草 claude-fable-5-2 中档／审查 claude-opus-5-5 中档

（2026-11-13 起草，第一版，快照 `版本快照/卷九-v1.md`。模板头硬约束，出自卷一 §0.4（写进每卷模板头部的硬约束）：① 规则里不出现任何实例 id，也不从 id 反推类别；② 规则层一行不读任何语言，字符串只许是登记过的代号，玩家与模型的文字只经输入边与 AI 边进来；③ 不为具体的动作、物品、职业、地区、人物写专项规则；④ 常数只在规则表；⑤ 一个系统一个读入口、一个字段一个写者；⑥ 不读墙钟；⑦ 凡除法写明除数的正下界或为 0 时的分支；⑧ 凡逐次改写的数值存储量写明存法、余数与误差界，口径只引卷二 §3.3（求值管线）“存量与余数结转”；⑨ 规则不读可修剪的事件日志。）

---

## §0 卷首

### 0.1 范围

本卷定义“一个意图怎样变成世界里的一次改动，以及模型在这条路上能碰哪里”。共十九个子系统：动作目录与当前活动；原语目录与执行器；统一裁决流程与检定；开放提案两阶段；无模型构造器；路由；幅度上限、难度派生与反噬；同意与权能；回合契约；叙述投影；一致性审查；NPC 决策管线；对话与交涉状态机；AI 档位与降级；三级落地；学习回路；选择式判断层；录制回放与费用账；输入边译码器与入库前守门。

不在本卷：

- 模块组、import 矩阵、文字类型、回应通道、两道闸的算法与权限：卷二 §2.7（系统声明表 `state-owners.json`）、卷二 §2.8（字符串类型规则）、卷二 §2.9（外部边界与 Text 模型）。本卷只定“何时调、调之前之后规则层做什么、代号有哪些”。
- 效果族表与 effectCall 的格式、求值入口 `effects()`：卷二 §3.9（效果族表 `_effects.json`）。本卷定原语目录与执行器。
- 修正项与唯一求值管线：卷二 §3.2（修正项的格式）、卷二 §3.3（求值管线）。本卷只登记过程主体槽。
- 能不能行动的谓词：卷二 §2.5（状态谓词单点）。本卷只调用。
- 技能值与成长：卷十四 §4.3（技能与熟练）、卷十四 §4.12（成长、经验与兼修负担）。合法性与处分权：卷八b §4.5（合法性是后果）、卷八b §4.6（处分权）。立场、恐惧、记忆、亲密资格：卷十八 §4.4（立场数轴（来源表、衰减、单入口））、卷十八 §4.11（恐惧值）、卷十八 §4.5（关系、记忆、认知与谎言）、卷十八 §4.9（婚配制度、性风俗、儿童与老人）。
- 驱力权重、决策噪声：卷二十六 §4.9（决策噪声接口）。评价行：卷七 §4.26（美德、罪恶、罪行、羞耻（评价行））。
- 主观视图与检索键：卷二十二 §4.1（主观视图四域与检索键）。片段库、面板、前端适配器：卷二十九 §4.2（叙述模板与片段库）、卷二十九 §4.3（面板数据绑定）、卷二十九 §4.7（前端适配器与输出守门）。
- 模拟层、降级档位、骰值键：卷二十七 §4.1（三层模拟运行矩阵）、卷二十七 §4.3（成本模型与降级阶梯）、卷二十七 §4.8（种子键与骰值键（确定性约束与验收））。
- 真实模型试玩与题集：卷十二 §4.6（扩展性与验收套件）。任务委托：卷二十四。

### 0.2 依赖卷

| 依赖 | 拿什么 |
|---|---|
| 卷一 | 两进程模型与显示层，见卷一 §2.9（第七层 显示层（含显示闸））；输入边，见卷一 §2.10（输入边（不是层；可整体拔除））；硬规矩，见卷一 §3（硬规矩条文）；AI 的位置，见卷一 §7（AI 的位置）；规则四形状与四通道，见卷一 §2.5（第三层 通用规则层）、卷一 §2.7（第五层 系统间接口） |
| 卷二 | 词表登记，见卷二 §1.9（代号、显示名与语言边界）；随机抽取，见卷二 §1.10（随机实例化）；状态容器，见卷二 §1.11（状态容器）；需求块，见卷二 §1.13（需求块）；入口清单，见卷二 §2.1（入口清单）；写者，见卷二 §2.6（写者与三接口）；过程主体槽，见卷二 §3.7（旧派生槽的对照与过程主体槽）；错误码格式，见卷二 §4.3（错误码表） |
| 卷三乙 | 品质档入口，见卷三乙 §4.5（品质档）；材料聚合，见卷三乙 §4.1（材料归类与聚合（由卷三甲的数值推出））；工具能力，见卷三乙 §4.6（工具能力） |
| 卷四 | 年龄与成年，见卷四 §4.4（年龄、成长、寿命、出生与死亡率）；身份键，见卷四 §4.9（身份键、化名、认出） |
| 卷五 | 进入权，见卷五 §4.13（进入权与私宅许可）；在场与感知，见卷五 §4.2（分区、方位与感知通道） |
| 卷六 | 账本转移，见卷六 §4.1（账本三元键与守恒）；估值，见卷六 §4.21（价格四角色）；合同，见卷六 §4.16（合同状态机） |
| 卷七 | `evaluationOf`，见卷七 §4.26（美德、罪恶、罪行、羞耻（评价行）） |
| 卷八、卷八b | 职位权能，见卷八 §4.2（职位、官职、俸禄、继任、代理追认）；`legalityOf`、`disposalRight`；事实记录 `noteFact`，见卷八b §4.2（罪名谓词与立案到执行） |
| 卷十四 | `skillValue`、`gainSkill`；隐藏职业契机，见卷十四 §4.8（隐藏职业契机） |
| 卷十八 | 持有种类表，见卷十八 §4.1（持有种类表与两条转移协议）；`stance`、`dread`、`treatment`、`recall`、`intimateEligible`、`intimateAllowed`；监护，见卷十八 §4.2（家户、亲属、婚配、继承、分家、监护） |
| 卷十九 | `facilityView().type`，见卷十九 §4.2（设施类型维度表） |
| 卷二十 | 调度与到期，见卷二十 §4.1（刻、同刻全序、调度器与到期语义）；历法表，见卷二十 §4.2（历法数据与周期日规则格式） |
| 卷二十一 | 身体类状态实例，见卷二十一 §4.1（身体类状态实例） |
| 卷二十六 | `personView().dims.driveWeight`、`decisionJitter()`、`preferenceOf()`、`needSatisfiers()` |
| 卷二十七 | `degradeLevelOf`、`simTierOf`；骰值键五段 |
| 卷十三、卷十五、卷二十二、卷二十八、卷二十九、卷十二（尚未成稿，标题按台账） | 对抗行与威慑量来源行；施法同意条款行；主观视图、检索键与秘密；离线校验与作者工具；语言包、模板与前端适配器；验收套件 |

### 0.3 覆盖的卷零行

- A 表主归 18 行：14.1–14.18（卷零-覆盖表.md 第 346–363 行）。
- B 表主归 3 行：3.11（第 553 行）、18.1（第 785 行）、18.2（第 786 行）。
- 合计 21 行，与卷零 §6（统计 · 各卷归入的子系统数）一致。兼及 10 行（3.8、3.10、7.4、9.3、14.19、14.20、17.6、17.10、18.1 主观视图、0.6），本卷只在 §5 给接口。
- 卷零 §3.5（输入边与模型叙述解析的逐处处置）的 146 处中接手方写“卷九”的各行，按子系统落在 §4.5、§4.6、§4.9、§4.10、§4.11、§4.19，清单在 §7。

### 0.4 参照的五款游戏行

| 来源 | 行 | 取什么 | 不取什么 |
|---|---|---|---|
| CDDA | 02 §11；§17 #55、#62 | 条件加效果列表是数据；长时活动是带进度的记录，可中断可续 | 使用函数里写死物品与效果 id（02 §16 第 1 条） |
| CDDA | 02 §17 #49 | 对话是状态机，话题与回应是数据行，交易与跟随是对话里的普通动作 | 话题文本驱动分支 |
| DF | 01 §7.5 #66；§8.1 第 8 条 | 冒险者与居民活在同一个世界、走同一套规则；“能做什么”是引用表 | 把动作做成代码枚举 |
| CK3 | 05 §6.5 #61 | 决议是条件门控的行动，条件与效果分开写 | AI 行为引擎硬编码（05 §7 第 9 条） |
| 环世界 | 03 §15 #21 | 工作选择是“候选加优先级”的通用机制 | 按工种写的分支 |
| EVE | 04 §9.4 #54 | 不取（界面入口，与本卷无关） | — |

### 0.5 读法

先读 §1.3 的一条管线，再读 §2、§4.1、§4.2、§4.3、§4.7、§4.8，其余子系统都接在这条管线的某一段上。规则编号 `R9-节.序`，断言编号 `A9-节.序`，扫描条 `S9-序`，不变量 `I9-序`。正文里的数值都是占位，待标定；需要查证的事实数值列在卷末“待补清单”，不凭记忆填。

---

## §1 领域总述

### 1.1 真实世界怎样运转

一个人想做一件事，结果取决于三样：他手里有什么（材料与工具的物性）、他会什么（技能）、他想做成什么（意图）。旁人答不答应、有没有权管，决定这件事做不做得成；做了之后合不合规矩，是事后别人怎样对待他，不是事前拦不拦得住。长的事要花时间，中途会被打断。别人也都在按同样的道理过日子：先看底线，再看交情，再算得失，再看手头忙不忙。

讲故事的人不改变发生了什么。他只能把已经发生的事讲出来，讲错了要能被对账发现。

### 1.2 本作现状

- 登记动作 341 条，其中 337 条是旧处理器外壳；可做之事投影里有活动文字与状态文字的拼测（action-affordances.mjs:310）。
- 原语执行器覆盖 19 个原语、14 族；开放路径的幅度上限只为 9 类效果派生，其余返回空（action-limits.mjs:247–289）；即兴制作只认三种材料类别的字面（action-limits.mjs:267–283）。
- NPC 自治有两处不经统一裁决（npc-autonomy.mjs:61、npc-autonomy.mjs:176）；决策库读记忆正文与活动文字（npc-decision.mjs:13、npc-decision.mjs:25），成本各项被截成非负，负的抵扣丢失（npc-decision.mjs:14）。
- 路由、构造器、时间槽、检索词表解析玩家原话（action-router.mjs:75 等）；一致性审查用全文正则读模型叙述（consistency-review.mjs）；场景卡按玩家问话的正则决定塞哪一段（scene-card.mjs:109）。
- 难度以数字写在动作与代码里，共 26 处。同意与权能没有单入口（action-consent.mjs:10 用文字判断亲密）。
- 回合尾注从正文里用正则抓，缺字段时填默认值（turn.mjs:34）。
- 学习回路与选择式判断层未实现；录制回放的旁路记录已有（sideband.mjs）。

### 1.3 总机制：一条管线

全卷只有一条写世界的路：

`意图 → 定形 → 能力 → 前置 → 同意与权能 → 报价 → 检定 → 效果展开与限幅 → 提交 → 善后`

- **意图**是一个封闭结构（§2.4），里面只有代号、id 与数值。它有四个来路：菜单与构造器点选、输入边译码、NPC 决策、活动续做。四个来路交出的结构相同，管线不知道也不关心是哪一个。
- **管线**的九段是封闭枚举 `resolve_stage`。每一段只读入口与规则表，产出代号；任一段不过即以错误码返回，世界不变。
- **提交**只经原语执行器，一次事务，产出一条事件。
- **模型**只在管线的两头：前头把文字译成意图（经 AI 边），后头把已提交的回执讲成文字（经 AI 边入库、经显示闸显示）。管线九段里没有模型。

北极星在第七段落实：产物的每个数值维度由材料物性、技能读数与意图代号经登记的行算出，没有按产物名写的数。

---

## §2 维度表

### 2.1 词表族与封闭枚举

开放族（登记到卷二 §1.9（代号、显示名与语言边界）的词表机制，条目带中英 `labels`）：

| 族 | 前缀 | 条目字段 | onUnknown | 条目归属 |
|---|---|---|---|---|
| `action`（动作目录，行表，见 §2.2） | `act_` | 见 §2.2 | 加载失败 E-ACT-ROW | 各领域卷登记行；格式归本卷 |
| `act_class`（动作类） | `acls_` | `exertion: number [0,1]`、`attention: number [0,1]`、`social: boolean`、`interruptRX: rx` | 加载失败 | 本卷首批；各卷可加 |
| `act_stage`（活动阶段） | `astage_` | 无 | 加载失败 | 登记动作行的卷 |
| `target_filter`（对象筛选） | `tf_` | `slot: enum(scope, relation)`、`whenRX: rx` | 加载失败 | 本卷首批；各卷可加 |
| `focus`（场景卡段焦点） | `focus_` | 无 | 加载失败 | 登记场景卡段的卷 |
| `claim_kind`（声明种类） | `ck_` | `detect: enum claim_detect`、`subjectKind: set<实体类>`、`predicates: set<维度代号>`、`valueType: enum(integer, number, boolean, ref, list_ref, none)`、`evidence: ref evidence_row` | 声明作废 | 各领域卷登记行；格式归本卷 |
| `consent_scope`（同意范围） | `cscope_` | `intimate: boolean`、`revocable: boolean`、`defaultMinutes: integer ≥ 0 nullable` | 加载失败 | 本卷首批；卷十五、卷二十一、卷十八可加 |
| `decision_card`（决定卡） | `dcard_` | `outcome: enum decision_outcome`、`slots: map<槽位代号, slot_kind>` | 加载失败 | 族名与前缀见卷二 §1.9（代号、显示名与语言边界），本卷只引用；条目与条目字段归本卷 |
| `mark_kind`（留痕种类） | `mk_` | `onKinds: set<实体类>` | 加载失败 | 本卷首批；各卷可加 |
| `menu_group`（菜单组） | `menu_` | `order: integer` | 加载失败 | 本卷首批；各卷可加 |
| `cap_row`、`difficulty_row`、`cost_row`、`evidence_row`、`scene_section`、`authority_source`、`consent_clause`、`candidate_provider`、`dialogue_move`、`intent_form`（规则表里的行表，见 §4 各节） | 各自表内行号 | 见各节 | 加载失败 | 各领域卷登记行；格式归本卷 |

代码内封闭枚举（值不带前缀；扩展须改本卷）：

| 枚举 | 值 | 用在 |
|---|---|---|
| `intent_origin` | `menu` `typed` `model` `npc` `resume` | §4.3 |
| `resolve_stage` | `shape` `capacity` `precondition` `consent` `quote` `check` `effects` `commit` `aftermath` | §4.3 |
| `degree`（成功度） | `critical_failure` `failure` `partial` `success` `critical_success` | §4.3 |
| `activity_end` | `done` `interrupted` `abandoned` `failed` | §4.1 |
| `proposal_phase` | `previewed` `confirmed` `expired` `withdrawn` | §4.4 |
| `landing_level` | `mark` `fact` `solidified` | §4.15 |
| `authority_via` | `holding` `office` `disposal` `guardianship` `contract` `clause` | §4.8 |
| `clause_mode` | `substitute` `waive` `require_extra` | §4.8 |
| `turn_timing` | `timed` `already_timed` | §4.9 |
| `channel` | `ic` `ooc` | §4.9、§4.19 |
| `segment_kind` | `narration` `dialogue` | §4.9 |
| `quote_source` | `none` `player` | §4.9 |
| `claim_detect` | `ledger` `gate` `self` | §4.11 |
| `claim_modality` | `fact` `intention` `reported` `question` `figurative` `hypothetical` | §4.11 |
| `claim_polarity` | `affirm` `deny` | §4.11 |
| `temporal_mode` | `current` `past` `future` `timeless` | §4.11 |
| `review_verdict` | `consistent` `mismatch` `unsourced` `warning` | §4.11 |
| `validator_verdict` | `clean` `unmarked_name` `private_disclosure` `meta` `minor_romance` `injection` | §4.11、§4.19 |
| `decision_stage` | `red_lines` `relations` `utility` `circumstances` `conflicts` | §4.12 |
| `decision_outcome` | `agree` `refuse` `defer` `conditional` `counter` | §4.12 |
| `dialogue_state` | `open` `offer` `counter` `agreed` `refused` `closed` | §4.13 |
| `ai_tier` | `t0` `t1` `t2` `t3` | §4.14 |
| `ai_use` | `understand` `narrate` `dialogue` `validate` `judge` `draft` | §4.14 |
| `ai_fail` | `no_key` `offline` `timeout` `budget` `rejected` `degraded` | §4.14 |
| `reject_code` | `reject:injection` `reject:minor_romance` `reject:id_leak` `reject:blocklist` `reject:unknown_entity` `reject:quote_mismatch` `reject:schema` `reject:range` | §4.19 |
| `decode_result` | `intent` `ambiguous` `menu_fallback` | §4.19 |
| `intent_slot` | `actionId` `targetRef` `scope` `relation` `kind` `channel` `wait` `focus` `respondents` `mentions` `dims` `when` `qty` `nameSlot` | §4.19 |
| `request_kind` | `ask` `request` | §4.19 |
| `ctx_role` | `actor` `target` `material` `tool` `place` `facility` `opponent` | §4.7 |
| `rank_key` | `owned` `distance` `recent_agenda` `id` | §4.5 |
| `learn_event` | `unmapped` `out_of_catalog` `inexpressible` `mark_landed` `fact_landed` `stage_rejected` | §4.16 |

`consent_mode`（`none` `target` `holder` `authority`）由卷二 §3.9（效果族表 `_effects.json`）定义，本卷只读。`slot_kind`、`reply_result`、`narrate_result`、`gate_verdict` 由卷二 §1.9（代号、显示名与语言边界）定义，本卷只读。

### 2.2 动作目录行 `action`

文件 `world/actions/*.json`。每行一个动作。全部字段为代号、数值或受限表达式；显示名在语言包。

| 字段 | 类型 | 单位 | 取值域 | onUnknown | 含义 |
|---|---|---|---|---|---|
| `id` | handle `act_` | — | 卷二 §1.9（代号、显示名与语言边界）的代号正则 | 加载失败 | 动作代号 |
| `class` | ref `act_class` | — | 族内 | 加载失败 | 动作类 |
| `slots` | map<槽位代号, struct{kind: slot_kind, entityKind?: 实体类, filter?: list<ref target_filter>, required: boolean}> | — | — | 加载失败 | 槽位声明；候选由 §4.5 从 view 生成 |
| `capability` | ref vocab capability nullable | — | 卷二 §2.5（状态谓词单点）的能力族 | 空即不要求 | 行动能力要求 |
| `requirement` | 需求块 nullable | — | 卷二 §1.13（需求块）的形状 | 空即无前置 | 前置 |
| `whenRX` | rx nullable | — | 只读 view 与槽位 | 空即恒真 | 可用条件 |
| `consent` | struct{mode: consent_mode, power: ref vocab power nullable, scope: ref consent_scope nullable} | — | — | 加载失败 | 同意与权能要求 |
| `intimate` | boolean | — | — | 加载失败（必填） | 是否亲密类动作；卷十八 §4.9（婚配制度、性风俗、儿童与老人）的检查读它 |
| `baseMinutes` | integer | 标准工分钟 | [0, `rules.act.maxBaseMinutes`] | 加载失败 | 标准节奏下的工时；0 即瞬时 |
| `stages` | list<struct{stage: ref act_stage, atPermille: integer [0,1000]}> | — | 按 `atPermille` 升序 | 空即无阶段 | 活动阶段 |
| `resumable` | boolean | — | — | 加载失败 | 中断后可否续做 |
| `check` | struct{skill: ref skill nullable, difficultyRows: list<ref difficulty_row>, opposed: boolean} nullable | — | — | 空即不检定 | 检定声明 |
| `effects` | map<degree, list<effectCall>> | — | 键全覆盖五档或写 `inherit` | 加载失败 | 各成功度的效果；effectCall 形状归卷二 §3.9（效果族表 `_effects.json`） |
| `backlash` | list<effectCall> | — | — | 空即无 | 反噬 |
| `costRows` | list<ref cost_row> | — | — | 空即无代价 | 身体与资源代价 |
| `skillGain` | struct{skill: ref skill, sessionKind: 卷十四的会话种类代号} nullable | — | — | 空即不成长 | 成长申报，只交卷十四入口 |
| `decision` | struct{drives: map<ref drive, number [−1,1]>, candidateProviders: list<ref candidate_provider>} nullable | — | — | 空即 NPC 不主动选 | NPC 候选申报 |
| `menu` | struct{group: ref vocab menu_group, order: integer} | — | — | 加载失败 | 菜单位置；每个动作必须可由菜单到达 |
| `basis` | struct:basis | — | — | 加载失败 | 出处 |

校验：`slots`、`effects` 引用闭合；`effects` 里每个 effectCall 的族都有至少一条 `cap_row` 或声明 `capExempt`（§4.7）；`menu` 必填（I9-1）；`intimate` 必填；`whenRX`、`interruptRX` 可编译且只读入口。

### 2.3 运行态路径

| 路径 | 值 | 写者 | 进哈希 | 实体终止时 |
|---|---|---|---|---|
| `state.activities[actorId]` | struct{actionId, slots, startedAt: integer:minute, workTotal: integer, workDone: integer, workDoneRem: integer, paceUnits: integer, paceSince: integer:minute, finishAt: integer:minute nullable} | `activity.mjs` | 是 | `clear` |
| `state.agendas[personId]` | list<struct{from: integer:minute, until: integer:minute, actionId, slots, sourceCandidate}>（按 `from` 升序、互不重叠） | `npc-agenda.mjs` | 是 | `clear` |
| `state.proposals[proposalId]` | struct{actor, intent, quote, phase: proposal_phase, previewedAt: integer:minute, expiresAt: integer:minute} | `open-actions.mjs` | 是 | 提案人终止即 `clear` |
| `state.marks[markId]` | struct{by: actorId, on: entityRef, markKind: ref vocab mark_kind, at: integer:minute, proposalId nullable, level: landing_level} | `mark-actions.mjs` | 是 | 对象终止时按卷二 §2.6（写者与三接口）“领域记录的去留”登记为 `clear` |
| `state.dialogues[sessionId]` | struct{parties: list<entityId>, state: dialogue_state, round: integer, lastOffer: struct nullable, openedAt: integer:minute, idleUntil: integer:minute} | `dialogue.mjs` | 是 | 任一方终止即置 `closed` 后 `clear` |
| `state.decisionCommit[personId]` | struct{candidateId, since: integer:minute, until: integer:minute} nullable | `npc-agenda.mjs` | 是 | `clear` |

同意不另设存储：一次同意是一条持有边，种类行登记在卷十八 §4.1（持有种类表与两条转移协议），见 §4.8。冷却不另设存储：是带时限的状态容器实例，格式归卷二 §1.11（状态容器）。受玩家操控的实体不另设存储：是一条持有边，见 R9-3.9。

不在 state、不进哈希、规则层读不到的：模型调用旁路记录、录制文件、费用账、学习回路计数（§4.16、§4.18）；AI 档位与运行配置（§4.14）。`narration.*` 与 `records.*.text` 是卷二 §2.7（系统声明表 `state-owners.json`）登记的文字路径，本卷不重复登记。

### 2.4 结构

**意图 `Intent`**（管线的唯一输入；`schema:input-edge-v1` 的 `intent` 形态与它同构，schema 文件归卷二 §2.7（系统声明表 `state-owners.json`））：

| 字段 | 类型 | 必填 | 含义 |
|---|---|---|---|
| `actor` | EntityId | 是 | 行动者 |
| `actionId` | handle `act_` | 是 | 动作代号；开放提案固定为目录里登记的“开放提案”那一行，由 `rules.open.proposalAction` 指明 |
| `slots` | map<槽位代号, EntityId \| handle \| integer \| number> | 是 | 槽位值；没有文字 |
| `origin` | `intent_origin` | 是 | 来路；只用于旁路记录与验收，管线各段不得读它 |
| `effects` | list<effectCall> nullable | 仅开放提案 | 提案效果 |
| `magnitudes` | map<参数代号, number> nullable | 仅开放提案 | 请求幅度 |

**回合 `turn`**：`{extraMinutes: integer [0, rules.turn.maxExtraMinutes], location: placeId, present: list<EntityId>, timing: turn_timing}`，四个字段全部必填，没有默认值。

**分段 `segments[]`**：`{segmentId: integer, kind: segment_kind, speaker: EntityId nullable, start: integer, end: integer, quoteSource: quote_source}`；`start`、`end` 是叙述文字的码点位置。

**声明 `claims[]`**：`{claimId: integer, kind: handle ck_, subject: EntityId | 登记 id, predicate: 维度代号, value, polarity: claim_polarity, modality: claim_modality, time: {mode: temporal_mode, at?: integer:minute, until?: integer:minute}, speaker: EntityId nullable, addressee: EntityId nullable, source: EntityId nullable, references: list<{sourceId, start, end}>, segmentId: integer, start: integer, end: integer}`。

**决定 `Decision`**：`{outcome: decision_outcome, card: handle dcard_, slots: map, candidateId, trace: list<{stage: decision_stage, codes: list<代号>, values: map<代号, number>}>, due?: integer:minute}`。

### 2.5 规则表键

全部在 `world/rules/tables/` 下，值待标定；类型栏的取值域同时是加载校验。

| 键 | 类型 | 取值域 | 用在 |
|---|---|---|---|
| `rules.act.maxBaseMinutes` | integer:minute | ≥ 1 | §2.2 |
| `rules.act.paceScale` | integer | 正整数，固定为过程主体槽精度的标度 | R9-1.4 |
| `rules.act.paceFloor` | number | [0, 1] | R9-1.4 |
| `rules.act.resumeWindowMinutes` | integer:minute | ≥ 0 | R9-1.7 |
| `rules.check.rollDist` | distribution | 卷二 §1.10（随机实例化）的首批分布之一 | R9-3.5 |
| `rules.check.degreeBands` | list<number>，长度 4 | 严格升序 | R9-3.5 |
| `rules.check.abilityFloor` | number | 任意 | R9-3.5 |
| `rules.open.proposalAction` | ref action | 目录内 | §2.4 |
| `rules.open.previewMinutes` | integer:minute | ≥ 1 | R9-4.3 |
| `rules.open.maxEffects` | integer | ≥ 1 | R9-4.2 |
| `rules.open.magnitudeSteps` | integer | ≥ 1 | R9-5.2 |
| `rules.constructor.rankKeys` | list<rank_key> | 非空 | R9-5.3 |
| `rules.route.maxSteps` | integer | ≥ 1 | R9-6.4 |
| `rules.cap.improvisedMod` | number | (0, 1] | R9-15.3 |
| `rules.turn.maxExtraMinutes` | integer:minute | ≥ 1 | §2.4 |
| `rules.scene.promptBudget` | integer（码点数） | ≥ 1 | R9-10.4 |
| `rules.scene.staticBudget` | integer（码点数） | ≥ 0，且小于 `promptBudget` | R9-10.4 |
| `rules.review.tolerance` | map<claim_kind, number ≥ 0> | 缺键即 0 | R9-11.4 |
| `rules.npc.utilityWeights` | struct{money, time, risk, relation, reward, need}，各 number ≥ 0 | — | R9-12.4 |
| `rules.npc.commitMinutes` | integer:minute | ≥ 0 | R9-12.7 |
| `rules.npc.redLineSeverity` | number | 评价行严重度的读数域内 | R9-12.2 |
| `rules.npc.switchMargin` | number | ≥ 0 | R9-12.7 |
| `rules.npc.conditionalStep` | integer | 正整数 | R9-12.6 |
| `rules.dialogue.maxRounds` | integer | ≥ 1 | R9-13.4 |
| `rules.dialogue.idleMinutes` | integer:minute | ≥ 1 | R9-13.5 |
| `rules.ai.tierUses` | map<ai_tier, set<ai_use>> | `t0` 必为空集 | R9-14.1 |
| `rules.ai.timeoutMs` | map<ai_use, integer:ms> | ≥ 1 | R9-14.4 |
| `rules.ai.budgetTokens` | map<ai_use, integer:token> | ≥ 0 | R9-18.4 |
| `rules.ai.degradeMap` | list<struct{level: integer, maxTier: ai_tier}>，按 `level` 升序 | — | R9-14.3 |
| `rules.gate.retryLimit` | integer | [0, 1] | R9-19.6 |
| `rules.gate.maxTextCodePoints` | map<文字字段代号, integer> | ≥ 1 | R9-19.5 |
| `rules.gate.categoryMap` | map<屏蔽词类别代号, reject_code> | 缺键取 `reject:blocklist` | R9-19.5 |
| `rules.gate.verdictMap` | map<validator_verdict, reject_code nullable> | 键全覆盖 | R9-19.5 |
| `rules.ai.understandOrder` | list<ai_use> | 元素只取 `judge`、`understand` | R9-17.6 |
| `rules.judge.minConfidencePermille` | integer | [0, 1000] | R9-17.3 |
| `rules.learn.candidateMinCount` | integer | ≥ 1 | R9-16.3 |

### 2.6 过程主体槽与修正键

按卷二 §3.7（旧派生槽的对照与过程主体槽）登记五个槽，求值一律经卷二 §3.3（求值管线）：

| 槽 | 精度 | 取值域 | 基值来自 | 含义 |
|---|---|---|---|---|
| `process.checkAbility` | 4 | 无界 | `skillValue` 或 `rules.check.abilityFloor` | 检定能力 |
| `process.checkDifficulty` | 4 | 无界 | `difficulty_row` 之和 | 检定难度 |
| `process.magnitudeCap` | 4 | ≥ 0 | `cap_row` 的最小值 | 幅度上限 |
| `process.workPace` | 4 | [`rules.act.paceFloor`, 无上界) | 1 | 活动节奏 |
| `process.quality` | 4 | 卷三乙 §4.5（品质档）的读数域 | 品质档入口 | 产物品质读数 |

伤病、心情、工具、设施、天气、信条对动作的影响一律以修正项挂这五个槽，本卷不为任何一种来源写分支。

### 2.7 存法登记

口径只引卷二 §3.3（求值管线）“存量与余数结转”。

| 字段 | stockMode | 余数字段 | 分母 | 说明 |
|---|---|---|---|---|
| `state.activities[actorId].workDone` | `remainder` | `workDoneRem`（`integer:count`，取值域 `[0, 分母)`） | `rules.act.paceScale`（正整数，存续期内固定） | 每段工作一次整除，向下取整；R9-1.4 |
| `state.activities[actorId].workTotal` | `raw` | — | — | 开工时一次写入，之后不改 |
| `state.dialogues[sessionId].round` | `raw` | — | — | 只做整数加 1 |
| `state.proposals[*]`、`state.agendas[*]`、`state.marks[*]`、`state.decisionCommit[*]` | 不含逐次改写的数值 | — | — | 只有时刻、代号与一次写入的报价 |

误差界：`workDone` 按第 5 条带余数结转，没有截断累积；任一时刻“已存的标准工分钟数 × 分母 + 余数”恒等于各段“分钟数 × 节奏整数”之和，误差为 0（A9-1.2 验切片不变）。本卷没有 `extScale` 字段，也没有锚点字段。

### 2.8 错误码

格式按卷二 §4.3（错误码表）；调用方只比较代码。

| 码 | 何时 |
|---|---|
| E-ACT-ROW | 动作行不合 §2.2 |
| E-ACT-UNKNOWN | 意图的动作代号不在目录 |
| E-ACT-SLOT | 槽位缺失、类型不符或值不在候选集 |
| E-ACT-CAPACITY | 行动能力谓词不过 |
| E-ACT-PRECONDITION | 需求块或 `whenRX` 不过 |
| E-ACT-CONSENT | 缺同意 |
| E-ACT-AUTHORITY | 缺权能 |
| E-ACT-COST | 付不出代价 |
| E-ACT-BUSY | 已有不可并行的当前活动 |
| E-ACT-DUPLICATE | 同一行动者同一刻同一动作同一对象重复提交 |
| E-ACT-CAP-MISSING | 效果族没有任何幅度上限行，也没有声明豁免 |
| E-ACT-DIFFICULTY-MISSING | 要检定的动作没有任何难度行 |
| E-ACT-PRIMITIVE | 原语不在封闭目录或参数不合契约 |
| E-ACT-MENU-UNREACHABLE | 动作行没有菜单位置 |
| E-OPEN-EXPIRED | 提案过期 |
| E-OPEN-DRIFT | 确认时报价与预览不一致 |
| E-OPEN-INEXPRESSIBLE | 提案效果不能用登记的效果族表达 |
| E-TURN-UNMAPPED | 回合结构缺字段或越界 |
| E-CLAIM-SCHEMA | 声明不合结构或代号未登记 |
| E-DIALOGUE-STATE | 对话动作与当前状态不合 |
| E-AI-TIER | 当前档位不允许这一用途 |
| E-NPC-BYPASS | NPC 的写入不经统一裁决 |
| E-GATE-RETRY | 重请用尽 |

### 2.9 抽取点登记

键的组成只按卷二十七 §4.8（种子键与骰值键（确定性约束与验收））的五段；流代号与抽取点代号登记进种子键表。

| 流代号 | 抽取点代号 | 对象段 | 时刻段 | 用在 |
|---|---|---|---|---|
| `stream.check` | `site.check.roll` | 本次提交的事件 id | 提交时刻 | R9-3.5 |
| `stream.check` | `site.check.opposed` | 同上 | 同上 | R9-3.6 |
| `stream.npc` | 由卷二十六登记的“决策扰动”抽取点 | 主体 id 后接候选 id | 决策时刻 | R9-12.4 |
| `stream.dialogue` | `site.dialogue.tiebreak` | 会话 id | 该轮开始时刻 | R9-13.4 |

事件 id 按卷二十七 §4.8（种子键与骰值键（确定性约束与验收））的确定性派生得出，成分是（行动者 id、时刻、动作代号、主对象 id），所以 R9-3.8 禁止同刻同键重复提交。

---

## §3 统一入口

### 3.1 读入口与谓词

| 入口 | 返回 | 说明 |
|---|---|---|
| `actionView(engine, actionId)` | 动作行（展平后） | 目录唯一读入口 |
| `affordances(engine, state, viewerId)` | list<{actionId, slots: map<槽位代号, 候选列表>, blocked?: 错误码}> | 可做之事投影；第六层投影，属规则层 |
| `activityOf(engine, state, actorId)` | {actionId, stage, permille, finishAt} 或空 | 当前活动；`stage` 与 `permille` 读时派生 |
| `agendaOf(engine, state, personId, at)` | 该刻的日程槽或空 | 日程 |
| `check(engine, state, ctx)` | {degree, margin, ability, difficulty, rollKey} | 检定；纯函数 |
| `difficultyOf(engine, state, ctx)` | number | 难度派生 |
| `magnitudeCap(engine, state, ctx, familyId)` | number ≥ 0 | 幅度上限 |
| `consent(engine, state, query)` | {ok, mode, basis: list<持有边 id \| 条款行号>, code} | 同意单入口 |
| `authority(engine, state, query)` | {ok, sources: list<{via: authority_via, ref}>, code} | 权能单入口 |
| `controlledByPlayer(engine, state, entityId)` | boolean | 是否由玩家出意图 |
| `quoteOf(engine, state, intent)` | 报价（工时、代价、难度、上限、需同意的对象） | 预览用；不写状态 |
| `sceneCard(engine, state, viewerId, focusList)` | 场景卡（代号、数值、id、`labelKey`） | 叙述投影 |
| `npcDecision(engine, state, personId, request)` | `Decision` | 应答式决策 |
| `npcChoose(engine, state, personId, at)` | `Decision` 加意图 | 主动式决策 |
| `dialogueView(engine, state, sessionId)` | {state, round, parties, legalMoves} | 对话 |
| `reviewClaims(engine, state, receipts, claims, segments, turn, channel)` | list<{claimId, verdict: review_verdict, code}> | 一致性审查；纯函数 |
| `aiAllows(config, use)` | boolean | 档位许可；不在规则层，属 AI 边 |
| `landingOf(engine, state, proposal)` | `landing_level` | 三级落地判定 |
| `constructorTree(engine, state, viewerId)` | 菜单树（代号、候选 id、数值域、`labelKey`） | 构造器投影 |
| `primitiveContract(op)` | 原语参数契约 | 执行器校验用 |
| `validateTurn(turn, receipts, channel, presentSet)`、`validateSegments(segments, textLength, presentSet)` | 通过或 E-TURN-UNMAPPED | 回合契约；纯函数 |
| `route(engine, state, request)` | `ReplyResult` 的内容 | 规则层分发；内部调写入口 |

写入口另见 §3.2：`resolve()`、`execute()`、`preview()`、`confirm()`、`withdraw()`。边界侧入口（不属规则层，规则层不可调用）：输入边的 `decode()`；AI 边的 `interpret`、`narrate`、`narrateTurn`（三者由卷二 §2.9（外部边界与 Text 模型）登记）、`effectiveTier()`、`replaySource()`。

### 3.2 唯一写者

| 写什么 | 唯一写者 | 入口 |
|---|---|---|
| 一切由动作引起的世界改动 | 原语执行器 `primitives-runtime.mjs` | `resolve(engine, state, intent)` |
| `state.activities` | `activity.mjs` | 只由 `resolve` 的提交段与调度器到期调用 |
| `state.agendas`、`state.decisionCommit` | `npc-agenda.mjs` | 只由 `npcChoose` 的结果经 `resolve` 之外的声明写者接口写（日程本身不是世界改动的结算） |
| `state.proposals` | `open-actions.mjs` | `preview`、`confirm`、`withdraw` |
| `state.marks` | `mark-actions.mjs` | 只由执行器的 `fact.set` 原语适配器调用 |
| `state.dialogues` | `dialogue.mjs` | 只由对话类动作的效果经执行器调用 |
| 同意边、操控边 | 卷十八 §4.1（持有种类表与两条转移协议）的转移协议 | 执行器的 `holding.open`、`holding.close` |
| 技能值 | 卷十四的 `gainSkill` | 善后段调用，本卷不写 |
| 文字路径 | aiGate 组内登记写者 | 卷二 §2.9（外部边界与 Text 模型）第 3 条 |

### 3.3 领域记录的去留

按卷二 §2.6（写者与三接口）“领域记录的去留”，本卷六条路径全部登记为实体终止时 `clear`、复生时不恢复：`state.activities[actorId]`、`state.agendas[personId]`、`state.proposals[proposalId]`（以提案人为键）、`state.marks[markId]`（以对象为键）、`state.dialogues[sessionId]`（以任一方为键，先置 `closed`）、`state.decisionCommit[personId]`。

### 3.4 退役的旧入口

- 旧处理器外壳 337 条：逐行改成 §2.2 的数据行，处理器删除。
- `legacy-primitives.mjs` 整个文件：它声明“旧处理器仍是唯一写者”，与 §3.2 冲突。
- 解析玩家原话的六处路由、构造器两处、时间槽两处、注册表检索一处、检索词表三处（清单见 §7）。
- `extension/turn.mjs` 的 `parseTurn`、`stripTurn`、`normalizeReplyProtocol`、`fullyTimedWait` 与 `extension/prompt.mjs` 的 `isOutOfCharacter`。
- `npc-autonomy.mjs` 的两处直写；`npc-decision.mjs` 的文字匹配与截断。
- `action-limits.mjs` 的 `sourceFor` 九类分支与材料类别字面。
- `ai-profile.mjs` 的用途表改读 `rules.ai.tierUses`，并移出规则层。

### 3.5 禁止的旁路（扫描式写法，卷十二实现）

- **S9-1**：规则层任何文件写 state 而调用栈不经 `resolve` 的提交段、推进钩子的声明写者或卷二 §2.6（写者与三接口）的终止协议，计数须为 0（E-NPC-BYPASS、E-VIEW-UNDECLARED-WRITE）。
- **S9-2**：`consent(`、`authority(` 之外，规则层出现对同意边种类、监护边、职位权能、处分权的直接读取并用于“可否对他人施加”的判断，计数须为 0。
- **S9-3**：规则层文件里出现卷二 §2.8（字符串类型规则）节点位置白名单之外的字串用法，计数须为 0；本卷涉及的文件无一例外。
- **S9-4**：`check(` 之外出现骰值抽取并映射成 `degree`，计数须为 0。
- **S9-5**：规则层 import `server-plugin/input/**`、`server-plugin/ai-gate/**`、`extension/**`，计数须为 0（E-VIEW-INPUT-IMPORT）。
- **S9-6**：规则层读取 `intent.origin`、AI 档位、费用账、旁路记录、录制文件、学习回路计数，计数须为 0。
- **S9-7**：规则层出现数值字面量参与难度、上限、阈值、权重的比较或运算，计数须为 0（常数只在规则表）。
- **S9-8**：规则层读事件日志用于判断（本回合内存回执除外），计数须为 0。
- **S9-9**：动作行、原语参数、声明、回合结构、意图的 schema 中出现类型为文字的字段，计数须为 0（文字只在卷二登记的文字路径与请求 schema 的独立数据字段）。

---

## §4 子系统

### 4.1 动作目录与当前活动

#### 4.1.1 维度

动作行（§2.2）；`act_class`、`act_stage` 两族（§2.1）；`state.activities`、`state.agendas`（§2.3）；`activity_end`；`rules.act.*`（§2.5）；`process.workPace`（§2.6）；`workDone` 的存法（§2.7）。

#### 4.1.2 统一入口

读：`actionView()`、`affordances()`、`activityOf()`、`agendaOf()`。写：`state.activities` 只由 `activity.mjs`，经 `resolve()` 的提交段与调度器到期调用。能不能行动只调卷二 §2.5（状态谓词单点）的 `can()`。

#### 4.1.3 规则

- **R9-1.1 目录是数据**：一个动作就是一行。可用性由 `capability`、`requirement`、`whenRX`、`consent` 四个字段决定，行为由 `effects` 决定；没有与动作一一对应的处理器函数。
- **R9-1.2 可做之事投影**：`affordances()` 遍历目录全部行，对每行的每个槽位用“实体类加 `target_filter` 的 `whenRX`”从 view 生成候选列表，再按 `shape`、`capacity`、`precondition`、`consent` 四段依次试算（不报价、不检定）；第一处不过的错误码写进 `blocked`。候选生成函数与 `resolve()` 的 `shape` 段是同一个函数。
- **R9-1.3 活动是动作实例**：`baseMinutes` 大于 0 的动作在开工提交时写一条 `state.activities[actorId]`。“在做什么”只读 `activityOf()`；睡眠、昏迷是状态容器，不是活动；人物表上不存活动文字。
- **R9-1.4 进度与节奏**：开工时 `workTotal = baseMinutes`。节奏 `paceUnits` 是 `process.workPace` 求值结果的定点整数（标度即 `rules.act.paceScale`）。节奏只在三种时刻重算：开工、续做、该行动者 `process.workPace` 的依赖集（卷二 §2.3（记忆与依赖声明）的传递闭包）里任一状态键被写入的那次事务提交。重算前先用旧节奏结清 `paceSince` 到此刻的 `m` 分钟：`acc = workDoneRem + m × paceUnits`；`workDone += floor(acc ÷ paceScale)`；`workDoneRem = acc − floor(acc ÷ paceScale) × paceScale`。除数 `paceScale` 是正整数，由加载校验保证。然后写新的 `paceUnits`、`paceSince`，并算收工时刻：`need = workTotal × paceScale − workDone × paceScale − workDoneRem`；`paceUnits` 为 0 时不做除法，`finishAt` 置空，活动停滞；否则 `finishAt = paceSince + ceil(need ÷ paceUnits)`，交卷二十 §4.1（刻、同刻全序、调度器与到期语义）登记到期项。
- **R9-1.5 阶段读时派生**：当前阶段是 `stages` 里满足 `workDone × 1000 ≥ atPermille × workTotal` 的最后一项（交叉相乘比较，不做除法）。阶段不落存储。
- **R9-1.6 中断**：每次节奏重算与每次到期时，重算 `can(actor, capability)` 与该动作类的 `interruptRX`；任一不过即结束本段。`resumable` 为真的，记录保留、`paceUnits` 置 0、`finishAt` 置空，并登记 `rules.act.resumeWindowMinutes` 之后的到期项；到期仍未续做即以 `abandoned` 结束并清除。`resumable` 为假的，立即以 `interrupted` 结束并清除。中断阈值只出现在 `interruptRX` 引用的规则表键里。
- **R9-1.7 续做**：续做是来路为 `resume` 的同一个意图，从 `capacity` 段重新走；通过后按 R9-1.4 重算节奏，已做的工不丢。
- **R9-1.8 并行**：一个行动者同时只有一条当前活动。活动期间提交瞬时动作，须两者动作类的 `attention` 相加不超过 1，否则 E-ACT-BUSY；要做就先提交“停下当前活动”的意图。
- **R9-1.9 预留与退还**：开工时代价里的实物按 `cost_row.reserve` 转入行动者名下“在作”用途的账户；收工时由效果消耗；中断结束时按 `cost_row.onEnd`（`refund` 或 `forfeit`）整笔处置，不按进度拆分。
- **R9-1.10 日程**：`state.agendas[personId]` 的每个槽只存动作代号、槽位值与来源候选 id。聚合层的人（卷二十七 §4.1（三层模拟运行矩阵））没有活动记录也没有日程；实体化时怎样补建归卷二十七 §4.2（聚合变体、等价、钉住）。
- **R9-1.11 同一世界**：目录没有“只给玩家”或“只给 NPC”的行，也没有这样的字段。玩家能做的每件事 NPC 都能经同一行做，反之亦然。

#### 4.1.4 交互

卷二 §2.5（状态谓词单点）（`can()`）；卷二 §1.13（需求块）；卷二 §3.3（求值管线）（`process.workPace`）；卷二十 §4.1（刻、同刻全序、调度器与到期语义）（到期项）；卷六 §4.1（账本三元键与守恒）（预留账户）；卷二十七 §4.1（三层模拟运行矩阵）；卷二十九 §4.3（面板数据绑定）（把 `affordances()` 渲染成菜单）；各领域卷（登记动作行）。通道：派生读取、声明写者、账本转移。

#### 4.1.5 数据实例

- 【西陲】铁匠铺里打一件农具。动作行 `act_craft_item`，类 `acls_heavy_labor`，`baseMinutes` 240，阶段 `astage_rough` 在 0、`astage_shape` 在 400、`astage_finish` 在 850。节奏求值 1.25，即 `paceUnits = 12500`。开工即算 `need = 240 × 10000 = 2400000`，`finishAt = paceSince + ceil(2400000 ÷ 12500) = paceSince + 192`。做到第 96 分钟时炉火熄灭触发重算：`acc = 0 + 96 × 12500 = 1200000`，`workDone = 120`，余数 0；`120 × 1000 = 120000`，不小于 `400 × 240 = 96000`，小于 `850 × 240 = 204000`，阶段为 `astage_shape`。
- 【非西陲】南海珠场采贝。动作行 `act_gather_stock`，类 `acls_dive`。前 30 分钟节奏 0.9：`acc = 30 × 9000 = 270000`，`workDone = 27`，余数 0。水温状态升档后节奏 0.75，再 10 分钟：`acc = 0 + 10 × 7500 = 75000`，`workDone = 34`，余数 5000。把这 40 分钟任意切成更多段提交，只要节奏变更点相同，结果逐位相同。
- 【非人类】蜂群筑巢。行动者是一个群落实体，没有技能表；动作行 `act_build_structure` 的 `capability` 取身体图给出的搬运能力，节奏修正来自群落规模维度登记的修正项。同一条 `state.activities` 记录、同一套阶段派生，没有为群落另写的活动逻辑。

#### 4.1.6 验收断言

- 扫描式：A9-1.1 规则层读取人物的活动文字字段、或对活动与状态做文字比较的行数为 0；缺 `menu` 或缺 `intimate` 的动作行数为 0；与单个动作代号一一对应的处理器函数个数为 0。
- 不变量式：A9-1.2 同一组节奏变更点下，把任意一段工作切成任意多次结清，`workDone`、`workDoneRem`、`finishAt` 与一次结清逐位相同；`workDoneRem` 恒在 `[0, paceScale)`；`workDone` 不超过 `workTotal`；一次推进 N 分钟与分段推进合计 N 分钟得到同一份存档摘要。
- 扩展性式：A9-1.3 只加一条动作行、一条动作类条目与两条阶段条目（不改任何 .mjs），新动作出现在 `affordances()`、可由菜单提交、可开工、可中断、可续做。

### 4.2 原语目录与执行器

#### 4.2.1 维度

原语目录（`world/ontology/primitives.json`，封闭，现役 19 个、14 族）。每个原语一份参数契约，字段全部是代号、id、数值。

| 族 | 原语 | 走哪条通道 | 落到谁的写者 |
|---|---|---|---|
| `transfer` | `transfer` | 账本转移 | 卷六 §4.1（账本三元键与守恒）的转移入口 |
| `holding` | `holding.open` `holding.close` `holding.transfer` `holding.rescale` | 持有 | 卷十八 §4.1（持有种类表与两条转移协议） |
| `obligation` | `obligation.create` `obligation.settle` `obligation.cancel` | 声明写者 | 卷六 §4.16（合同状态机）的义务写者 |
| `fact` | `fact.set` | 声明写者 | 目标维度在卷二 §2.7（系统声明表 `state-owners.json`）登记的那个写者 |
| `vital` | `vital` | 声明写者 | 身体量的写者，见卷二十一 §4.1（身体类状态实例） |
| `status` | `status` | 声明写者 | `status.mjs`，格式归卷二 §1.11（状态容器） |
| `move` | `move` | 声明写者 | 位置写者 |
| `create` | `create` | 声明写者 | 实体创建，见卷二 §2.6（写者与三接口） |
| `destroy` | `destroy` | 内核原语 | 实体终止协议，见卷二 §2.6（写者与三接口） |
| `emit` | `emit` | 事件 | 事件写载体 |
| `schedule` | `schedule` | 声明写者 | 卷二十 §4.1（刻、同刻全序、调度器与到期语义）的到期堆 |
| `transition` | `transition` | 声明写者 | 所属状态机的写者（合同、案件、对话、提案） |
| `learn` | `learn` | 调入口 | 卷十四的 `gainSkill` |
| `time` | `time` | 声明写者 | 世界时钟，见卷二十 §4.1（刻、同刻全序、调度器与到期语义） |

效果族输出到原语的固定展开（五行，封闭，与卷二 §3.9（效果族表 `_effects.json`）的 `eff_output` 五值一一对应）：`modifier` 展开为带该修正项的 `status`；`status` 展开为 `status`；`primitive` 即所写原语；`event` 展开为 `emit`；`spawn` 展开为 `create`。

#### 4.2.2 统一入口

写：`execute(engine, state, primitives, cause)`，只在 `primitives-runtime.mjs`，只由 `resolve()` 的提交段与推进钩子的调度方调用。读：`primitiveContract(op)`。效果族求值调卷二 §3.9（效果族表 `_effects.json`）的 `effects()`，本卷不重写。

#### 4.2.3 规则

- **R9-2.1 目录封闭**：原语集合是卷一 §3A（共享计算设施）第 3A.9 项列出的封闭项；增删原语须改本卷并报批。开放的是效果族行与动作行。
- **R9-2.2 效果族回答做什么，原语回答怎么写**：效果族行算出对象集合、幅度与输出清单；执行器把输出清单按上面的固定展开变成原语列表。执行器不认识任何效果族代号。
- **R9-2.3 一次事务**：`execute` 先逐个按契约校验（不合即 E-ACT-PRIMITIVE，整批不执行），再按“原语在目录中的固定序、同原语按列表下标”排定次序，在一次内核事务里逐个交给对应通道的适配器；任一适配器拒绝则整批回滚。成功后恰好产出一条事件，带原语列表、起因与骰值键。
- **R9-2.4 适配器按原语分，不按领域分**：每个原语一个适配器。适配器里没有实体 id、没有按类别名写的分支；领域差别只来自参数与目标写者。
- **R9-2.5 参数只有代号与数值**：原语参数的类型是卷二 §1.5（类型清单）里除 `string` 之外的类型。`fact.set` 的目标必须是某张维度表里登记的非文字维度，并且该维度的写者声明允许经执行器写。
- **R9-2.6 别卷的输出清单**：推进钩子与反应规则只返回输出清单（形状同效果族输出），由钩子的调度方交 `execute` 执行，`cause` 取钩子或反应规则的登记代号。它们自己不写状态。
- **R9-2.7 守恒**：实物与钱的增减只能是 `transfer`；`create`、`destroy` 涉及实物时，原语列表里必须有与之配对、指向登记源汇账户的 `transfer`，否则 E-ACT-PRIMITIVE。
- **R9-2.8 `learn` 不含成长算法**：`learn` 的适配器只把参数原样交给卷十四的 `gainSkill`；技能涨多少归卷十四 §4.12（成长、经验与兼修负担）。

#### 4.2.4 交互

卷二 §3.9（效果族表 `_effects.json`）；卷二 §2.6（写者与三接口）；卷六 §4.1（账本三元键与守恒）；卷十八 §4.1（持有种类表与两条转移协议）；卷十四 §4.12（成长、经验与兼修负担）；卷二十六 §4.4（想法与心情）（其推进钩子的输出清单由本执行器执行）；卷二十七 §4.7（复演与规则只一版）（事件里的原语列表供复演核对）。通道：四通道全部。

#### 4.2.5 数据实例

- 【西陲】集市上买一袋燕麦。动作 `act_trade_buy` 的 `success` 效果展开为三个原语：`transfer`（钱，买方到卖方）、`transfer`（货，卖方到买方）、`emit`（动词取事件动词表的成交一项）。
- 【非西陲】海港雇船立约。`act_contract_sign` 展开为 `obligation.create`（合同种类与条款代号由卷六登记）、`holding.open`（承运关系边）、`schedule`（交付期到期项）、`emit`。
- 【超自然】神迹治愈。卷七登记的神祇行引用效果族 `eff_heal`；`effects()` 给出 `status`（出血实例严重度下调）、`modifier`（展开为带修正项的 `status`）与 `primitive` 类输出 `transfer`（神迹预算账户到消耗汇）。执行器不知道施与者是神。

#### 4.2.6 验收断言

- 扫描式：A9-2.1 适配器文件里的实体 id 字面量数为 0、文字匹配数为 0；原语目录之外的原语名在规则层出现次数为 0；`eff_output` 的每个值在固定展开表里恰有一行。
- 不变量式：A9-2.2 任一原语被拒时，事务前后存档摘要相同；一次成功的 `execute` 恰好产生一条事件；账本各资源种类的总量在不含登记源汇的事务前后相等。
- 扩展性式：A9-2.3 新增一条只用现有原语的效果族行与一条引用它的动作行，不改 .mjs，即可执行并产生事件。

### 4.3 统一裁决流程与检定

#### 4.3.1 维度

`Intent`（§2.4）；`resolve_stage`、`degree`、`intent_origin`（§2.1）；`rules.check.*`（§2.5）；`process.checkAbility`、`process.checkDifficulty`（§2.6）；抽取点（§2.9）。检定上下文 `ctx = {actor, actionId, slots, skill, tools, materials, place, facility, opponent}`，全部是 id 与代号，由本管线从意图与 view 组出。

#### 4.3.2 统一入口

写：`resolve(engine, state, intent)`，全书唯一的动作结算入口。读：`check()`、`quoteOf()`、`controlledByPlayer()`。

#### 4.3.3 规则

- **R9-3.1 九段**：`resolve` 按下表顺序执行，段不可跳、不可换序。

| 段 | 做什么 | 读 | 不过时 |
|---|---|---|---|
| `shape` | 动作行存在；每个槽位类型相符、值在候选集内 | `actionView()`、候选生成 | E-ACT-UNKNOWN、E-ACT-SLOT |
| `capacity` | 行动能力；当前活动是否容得下 | `can()`、`activityOf()` | E-ACT-CAPACITY、E-ACT-BUSY |
| `precondition` | 需求块与 `whenRX` | 卷二 §1.13（需求块）的求值 | E-ACT-PRECONDITION |
| `consent` | 同意与权能 | `consent()`、`authority()` | E-ACT-CONSENT、E-ACT-AUTHORITY |
| `quote` | 工时、代价付不付得出、难度、上限 | `difficultyOf()`、`magnitudeCap()`、账本余额入口 | E-ACT-COST |
| `check` | 检定，得成功度 | `check()` | 不会不过 |
| `effects` | 取该成功度的效果，求值，限幅，展开成原语 | `effects()`、`magnitudeCap()` | E-ACT-PRIMITIVE |
| `commit` | 执行器一次事务 | — | 回滚 |
| `aftermath` | 成长申报、事实记录、反噬 | `gainSkill`、`noteFact` | 不回滚已提交部分；各自以独立事务执行 |

- **R9-3.2 来路无关**：九段都不读 `intent.origin`。同一状态、同一时刻、同一意图，无论来自菜单、译码、NPC 决策还是续做，产生的事件与状态改动逐值相同。
- **R9-3.3 拒绝带原因与替代**：任一段不过，返回 `{code, stage, alternatives}`；`alternatives` 是 `affordances()` 里与该动作同菜单组、此刻四段试算都通过的条目。没有“近似地改做另一件事”。
- **R9-3.4 长时动作分两次**：`baseMinutes` 大于 0 的动作，开工时走 `shape` 到 `quote` 五段并提交“开工”（预留代价、写活动记录）；到期时从 `capacity` 重新走到 `aftermath`。检定在收工时做。
- **R9-3.5 检定**：`ability` 是 `process.checkAbility` 的求值结果，基值在动作声明了技能时取 `skillValue(engine, state, actor, skill, ctx)`，没有声明时取 `rules.check.abilityFloor`。`difficulty` 是 `process.checkDifficulty` 的求值结果，基值见 §4.7。`roll` 按 §2.9 的键从 `rules.check.rollDist` 抽一次。`margin = ability − difficulty + roll`。成功度由 `margin` 不小于 `rules.check.degreeBands` 中几个界决定：0 个为 `critical_failure`，1 个为 `failure`，2 个为 `partial`，3 个为 `success`，4 个为 `critical_success`。全程只有加减与比较。
- **R9-3.6 对抗检定**：`check.opposed` 为真时，对手一侧用同一条式子算 `ability` 并在第二个抽取点抽一次，`margin =（己方 ability + 己方 roll）−（对手 ability + 对手 roll）`。对抗用哪两项技能由登记该动作行的卷给出；战斗只是其中一类行（卷十三 §4.1（个人战斗结算））。
- **R9-3.7 不检定的动作**：`check` 为空的动作成功度恒为 `success`，不抽取。
- **R9-3.8 幂等键**：（行动者、时刻、动作代号、主对象）在提交过的集合里已存在即 E-ACT-DUPLICATE。主对象取动作行第一个必填的实体槽位；没有实体槽位的取行动者自己。事件 id 由这四项按卷二十七 §4.8（种子键与骰值键（确定性约束与验收））确定性派生，所以不需要计数器。“提交过的集合”只需看当前时刻，随时钟推进即空。
- **R9-3.9 谁出意图**：一个实体由玩家出意图，当且仅当存在一条从玩家单例指向它的“操控”持有边（种类行见 §5.3）。`controlledByPlayer()` 只读这条边。菜单路由只接受行动者受操控的意图；`npcChoose()` 跳过受操控的实体。卷二十七的观察锚读同一条边。
- **R9-3.10 合法性是后果**：九段里没有“是否合法”这一段。提交之后，`aftermath` 把事件交卷八b §4.2（罪名谓词与立案到执行）的 `noteFact`；合不合法由卷八b §4.5（合法性是后果）的 `legalityOf` 在别人需要判断时读出。`quote` 段可以把 `legalityOf` 的读数放进报价供显示，NPC 决策可以把它算进风险，但它不拦提交。法律上“这类行为须具备某资格才成立”的门，是卷八b §4.4（法律门控）登记进动作行 `requirement` 的需求块，与别的前置同样对待。
- **R9-3.11 不读墙钟**：动作耗时只以世界分钟计，推进只经 `time` 原语与卷二十的调度器。
- **R9-3.12 聚合层不逐人裁决**：只有个体层的主体走本管线。聚合层的结果由卷二十七 §4.2（聚合变体、等价、钉住）的规则给出，等价性归该节。

#### 4.3.4 交互

卷二 §2.5（状态谓词单点）；卷二 §1.10（随机实例化）；卷十四 §4.3（技能与熟练）（`skillValue`，检定上下文由本卷构造后传入）；卷八b §4.5（合法性是后果）；卷十三 §4.1（个人战斗结算）（登记对抗行与伤害结算，不另写骰法）；卷十四 §4.8（隐藏职业契机）（其触发是订阅本管线事件的反应规则）；卷二十七 §4.8（种子键与骰值键（确定性约束与验收））；§4.7、§4.8、§4.12。通道：四通道全部。

#### 4.3.5 数据实例

- 【西陲】撬一把门锁。`ability` 46（技能读数 40，工具修正项 +6），`difficulty` 52，`roll` +9，`margin = 46 − 52 + 9 = 3`。界 `[−20, 0, 10, 25]` 中有 2 个不大于 3，成功度 `partial`；动作行在 `partial` 下的效果是“开了但留下痕迹”，痕迹是一条 `fact.set`。事后门主若发现，由卷八b读事实判定，不是本管线拦下。
- 【非西陲】草原上套住一匹野马。对抗检定：己方 `ability` 38、`roll` −4，对手 `ability` 30、`roll` +7，`margin =（38 − 4）−（30 + 7）= −3`，界中有 1 个不大于 −3，成功度 `failure`。对手是生物，技能侧取其物种行登记的对抗能力，同一条式子。
- 【超自然】向一名昏迷者施治愈术。`capacity` 过（施术者清醒）；`consent` 段因对象不能表态而查条款行（§4.8）；`check` 用施法技能；`effects` 段把请求幅度 32 限到上限 25（§4.7）。全程与撬锁走同一个 `resolve`。

#### 4.3.6 验收断言

- 扫描式：A9-3.1 `resolve` 之外写 state 且起因是动作的调用点数为 0（S9-1）；`check` 之外把骰值映射成成功度的位置数为 0（S9-4）；九段代码里读 `intent.origin` 的行数为 0。
- 不变量式：A9-3.2 同一状态下把同一意图分别以四种来路提交，事件与状态逐值相同；同一种子、同一意图序列重跑，存档摘要相同；新增一个抽取点不改变既有检定的结果。
- 扩展性式：A9-3.3 新增一项技能、一条难度行与一条引用它们的动作行，不改 .mjs，检定按新技能读数与新难度给出五档结果。

### 4.4 开放提案两阶段

#### 4.4.1 维度

`state.proposals`（§2.3）；`proposal_phase`；`Intent.effects`、`Intent.magnitudes`（§2.4）；`rules.open.*`（§2.5）。

#### 4.4.2 统一入口

写：`preview(engine, state, intent)`、`confirm(engine, state, proposalId)`、`withdraw(engine, state, proposalId)`，都在 `open-actions.mjs`；`confirm` 内部调 `resolve()`。读：`quoteOf()`、`landingOf()`。

#### 4.4.3 规则

- **R9-4.1 提案由登记的效果族组成**：提案的每一项是一个 effectCall，族必须在效果族表里，参数在该族声明的取值域内；对象、手段（工具、材料）是槽位里的实体 id。不能这样表达的提案即 E-OPEN-INEXPRESSIBLE，转 §4.15 判是否留痕。
- **R9-4.2 大小有界**：一个提案的效果项数不超过 `rules.open.maxEffects`。
- **R9-4.3 两阶段**：`preview` 只算报价并写一条 `previewed` 的提案记录，`expiresAt = 此刻 + rules.open.previewMinutes`，不改世界其他任何东西。`confirm` 重算报价：与记录里的报价逐字段相同才调 `resolve()`，不同即 E-OPEN-DRIFT 并把记录更新为新报价，等再次确认。到期未确认即 `expired`；`withdraw` 置 `withdrawn`。两者都只清记录。
- **R9-4.4 产物由三样共同推出**：提案里产生实物的输出，模板类别取意图槽位给的物品类别代号（卷三乙 §4.3（物品类别与用度类（九维）））；随材料走的物性由卷三乙 §4.1（材料归类与聚合（由卷三甲的数值推出））对所耗材料槽位聚合得出；品质读数由卷三乙 §4.5（品质档）的入口按（技能读数、所耗材料、所用工具、检定结果、制作意图槽位）给出，再经 `process.quality` 求值。没有按产物名、按材料名写的数，也没有只认某几种材料的名单。
- **R9-4.5 不限类别**：任何登记的效果族都可进提案。幅度上限由 §4.7 的上限行给出；某族没有上限行是加载错误，不是“这一类不支持”。
- **R9-4.6 留痕**：确认并提交的提案，其事件带提案的结构（效果族代号、对象 id、幅度、落地级别）。
- **R9-4.7 NPC 的提案**：NPC 由候选提供者给出的开放提案不经预览，直接进 `resolve()`；预览只是给出意图一方的确认步骤，不是裁决的一段，所以两者结算相同。

#### 4.4.4 交互

卷二 §3.9（效果族表 `_effects.json`）；卷三乙 §4.1（材料归类与聚合（由卷三甲的数值推出））、卷三乙 §4.5（品质档）、卷三乙 §4.6（工具能力）；卷二十 §4.1（刻、同刻全序、调度器与到期语义）（过期到期项）；§4.3、§4.7、§4.15。通道：声明写者、派生读取。

#### 4.4.5 数据实例

- 【西陲】用藤条和湿泥补一口裂了的灶。提案两项：`eff_repair`（对象是灶，手段是藤条与泥，参数 `param_amount` 请求 20）与 `eff_consume`。预览报价：上限 14（技能项 22、材料项 14 取小），工时 45，难度 31。确认时报价未变，进 `resolve()`；修复量按 14 计。
- 【非西陲】沙漠商队用驼毛毡与木杆搭遮阳棚。产物类别取意图给的“遮蔽类”代号；耐风、隔热两项物性由毡与杆的材料数值聚合得出；品质读数由搭建技能与成功度给出。换成芦席与竹竿，同一条提案得到不同物性，没有新规则。
- 【超自然】向井里的精怪许愿求雨。提案一项：请求类效果族，对象是精怪实体。它是带 `divine` 标记的生物，经 `npcDecision()` 给出决定；答应之后它自己的施与走它那一行登记的效果族与预算。提案这一侧只是一次请求。

#### 4.4.6 验收断言

- 扫描式：A9-4.1 开放路径代码里的效果族代号字面量数为 0、材料类别字面量数为 0；`preview` 调用栈里除 `state.proposals` 外的写入数为 0。
- 不变量式：A9-4.2 预览后不确认，除 `state.proposals` 外存档内容与预览前逐值相同；同一提案由玩家确认与由 NPC 直接提交，事件与状态逐值相同；提案产物的每个数值维度都能由 `explain()` 追到材料、技能或意图三者之一。
- 扩展性式：A9-4.3 新增一条效果族行与对应上限行后，该族立刻可进提案；新增一种材料行后，用它做手段的提案产物物性随之不同，不改 .mjs。

### 4.5 无模型构造器

#### 4.5.1 维度

`intent_form` 行表（`world/actions/forms.json`）：`{id, actionId, preset: map<槽位代号, list<ref target_filter>>, menu}`。`rules.open.magnitudeSteps`（integer，≥ 1）。候选排序键 `rules.constructor.rankKeys`（list<排序键代号>，取自封闭枚举 `rank_key`：`owned` `distance` `recent_agenda` `id`）。

#### 4.5.2 统一入口

读：`affordances()`、`constructorTree(engine, state, viewerId)`（把可做之事投影排成菜单树，返回代号、候选 id、数值域与 `labelKey`）。构造器不写状态；点选结果由客户端 host 以代号发到菜单路由（卷一 §2.9.1（显示层））。

#### 4.5.3 规则

- **R9-5.1 构造器是投影的渲染**：菜单树只由 `affordances()` 与动作行的 `menu` 字段生成。第一步选动作，其后每个槽位一步，从候选列表里点选；数值槽给整数输入或步进；时间槽给日期选择器，交出 `{day: integer, anchor: 历法锚代号}`，锚代号取卷二十 §4.2（历法数据与周期日规则格式）的历法表。
- **R9-5.2 开放提案的表单**：选对象；选效果族（只列 `targetSelector` 与对象相容、需求块此刻可满足的族）；选手段（从持有物候选里选）；选幅度（把参数取值域等分为 `rules.open.magnitudeSteps` 档，步长 =（上界 − 下界）÷ 档数，档数是不小于 1 的正整数）；可选一个命名槽，交出的只是卷一 §2.9.2（安全两道闸）所说的命名意图。
- **R9-5.3 预填与排序**：每个槽位的候选按 `rules.constructor.rankKeys` 列出的键依次排序，第一个候选预选。排序只用数值与 id；不存“上次选了什么”。
- **R9-5.4 形式模板**：`intent_form` 行是“动作加若干槽位筛选”的具名快捷项，只为缩短点选步数；它展开后就是普通意图。
- **R9-5.5 不解析文字**：构造器的输入只有点选、编号与数值。没有“去掉客套话后看剩下什么”之类的步骤；译不出的键入由 §4.19 退回菜单。
- **R9-5.6 可表达集合 C 与可玩性等式**：C 定义为“`shape` 段接受的全部意图”。因为构造器的候选生成与 `shape` 段是同一个函数，构造器能点出的集合恰等于 C；模型译码交出的意图也必须过 `shape` 段，所以开不开模型，能提交的意图集合相同。缺口只有一类：登记的效果族表达不了的新事物，它在两档下都只得到留痕或拒绝（§4.15）。卷一 §7（AI 的位置）第 7.1 条第 2 款要求的覆盖核对见 §6。
- **R9-5.7 模板对白**：不开模型时，NPC 的台词由显示层按决定卡代号走模板（卷二十九 §4.2（叙述模板与片段库）），本卷只保证每条决定卡的槽位都是代号或数值。

#### 4.5.4 交互

卷一 §2.9.1（显示层）；卷二十九 §4.2（叙述模板与片段库）、卷二十九 §4.3（面板数据绑定）；卷二十 §4.2（历法数据与周期日规则格式）；§4.1、§4.4、§4.19。通道：派生读取。

#### 4.5.5 数据实例

- 【西陲】在铺子里买东西：选“交易”组，选 `act_trade_buy`，卖方槽候选两人（按距离排），货品槽候选来自卖方可售清单，数量槽整数 1 到存量。四步点完即一个完整意图。
- 【非西陲】在高原驿站约定三日后出发：时间槽交出 `{day: 3, anchor: 历法表里“自今日起”的锚代号}`。玩家换成当地另一种历法显示，交出的结构不变。
- 【非人类】命令一只驯养的猎犬去追踪：行动者槽是受操控的犬，动作候选只有它的身体图与训练状态容得下的几行；与人物用同一棵菜单树生成函数。

#### 4.5.6 验收断言

- 扫描式：A9-5.1 构造器与菜单树生成代码中文字匹配、正则、子串函数的出现次数为 0；`intent_form` 行里文字字段数为 0。
- 不变量式：A9-5.2 对任一状态，枚举构造器可点出的全部意图，逐个交 `shape` 段都通过；反过来随机生成通过 `shape` 段的意图，都能在菜单树里找到一条点选路径；中文与英文语言包下菜单树的代号结构逐值相同。
- 扩展性式：A9-5.3 新增一条动作行或一条 `intent_form` 行后，菜单树自动多出对应项，不改 .mjs 与界面代码。

### 4.6 路由

#### 4.6.1 维度

上行请求体的意图部分（`schema:input-edge-v1`，文件归卷二 §2.7（系统声明表 `state-owners.json`））；`rules.route.maxSteps`（integer，≥ 1）；`target_filter` 族；`decode_result`。

#### 4.6.2 统一入口

`route(engine, state, request)`：菜单路由与输入路由共用的规则层分发函数，只收代号结构。它决定这次请求交给 `resolve()`、`preview()`、对话动作或等待推进中的哪一个，并把结果写成卷二 §2.9（外部边界与 Text 模型）第 0 条的 `ReplyResult`。

#### 4.6.3 规则

- **R9-6.1 按签名分发**：分发只看动作代号与槽位种类。没有同义词表，没有按词打分；动作代号不在目录即 E-ACT-UNKNOWN。
- **R9-6.2 行动者不由输入给**：`actor` 取本次会话受操控的实体，输入里带的行动者字段被忽略并记旁路。
- **R9-6.3 筛选式指代**：意图可以不给 `targetRef`，而给 `scope` 与 `relation` 两个独立的筛选代号。路由用这两个 `target_filter` 的 `whenRX` 从候选集里筛：恰剩一个即填入；剩零个或多个即返回 `ambiguous` 并带上剩下的候选，由菜单让人选。不取“最近的”“第一个”。
- **R9-6.4 多步**：一次请求可带不超过 `rules.route.maxSteps` 个意图，顺序执行，第一处失败即停，已提交的不回滚。
- **R9-6.5 等待**：带 `wait` 槽位（分钟数）的意图交卷二 §2.9（外部边界与 Text 模型）第 0 条“推进计划与心跳推进”所述的推进请求；路由不自己推进时钟。
- **R9-6.6 场内场外**：`channel` 为 `ooc` 的请求不构造意图、不结算、不推进；它只可能引出一次叙述请求（§4.9）。

#### 4.6.4 交互

卷二 §2.9（外部边界与 Text 模型）（回应通道）；卷二十九 §4.7（前端适配器与输出守门）（上行只传代号）；§4.3、§4.4、§4.13、§4.19。通道：派生读取。

#### 4.6.5 数据实例

- 【西陲】玩家点“攻击”，目标筛选给 `scope = tf_adjacent`、`relation = tf_hostile`。面前有两名敌对者：返回 `ambiguous` 与两个候选 id，菜单列出两人。
- 【非西陲】雨林渡口一次请求带两步：先付船资，再登船。第一步因钱不够 E-ACT-COST，第二步不执行，回应里带第一步的错误码与替代项。
- 【非人类】受操控的信鸽被下达“飞往某地”：行动者由会话的操控边确定为这只鸽子，输入里若夹带别的行动者 id 一律忽略。

#### 4.6.6 验收断言

- 扫描式：A9-6.1 路由代码里对请求字段做文字匹配、子串或正则的行数为 0；同义词表文件数为 0。
- 不变量式：A9-6.2 候选多于一个时路由从不自行选定；`ooc` 请求前后除文字路径外存档逐值相同；同一批意图一次请求提交与逐个请求提交，状态逐值相同。
- 扩展性式：A9-6.3 新增一条 `target_filter` 条目（只写 `slot` 与 `whenRX`）后，菜单与译码都能用它做指代，不改 .mjs。

### 4.7 幅度上限、难度派生与反噬

#### 4.7.1 维度

封闭枚举 `ctx_role`：`actor` `target` `material` `tool` `place` `facility` `opponent`。三张行表，都在规则表目录下，由各领域卷登记行：

| 行表 | 字段 | 说明 |
|---|---|---|
| `difficulty_row` | `id`；`base: number`；`terms: list<struct{of: ctx_role, dim: 维度代号, curve: curve, onUnknown: number}>` | 一行给出一部分难度 |
| `cap_row` | `id`；`family: ref effect`；`param: ref vocab parameter`；`terms: list<struct{of: ctx_role, dim: 维度代号, curve: curve（值域 ≥ 0）, onUnknown: number ≥ 0}>`（非空）；`overreachCurve: curve（x ≥ 0，y ∈ [0, 1]）`；`capExempt: 豁免理由代号 nullable` | 一行给出某族某参数的上限 |
| `cost_row` | `id`；`resource: 资源种类代号 \| 身体量代号`；`amountRX: rx`；`reserve: boolean`；`onEnd: enum(refund, forfeit)` | 代价 |

#### 4.7.2 统一入口

读：`difficultyOf()`、`magnitudeCap()`。两者都是纯函数，基值算出后交卷二 §3.3（求值管线）经 `process.checkDifficulty`、`process.magnitudeCap` 求值。

#### 4.7.3 规则

- **R9-7.1 难度从对象维度推出**：难度基值 = 动作行所列各 `difficulty_row` 的 `base` 与各项 `curve(该角色实体的该维度读数)` 之和。读数未知时该项取 `onUnknown`。动作行、效果族行、代码里都没有难度数字。
- **R9-7.2 多件材料**：`of: material` 而所耗材料不止一件时，读数取卷三乙 §4.1（材料归类与聚合（由卷三甲的数值推出））对这组材料给出的聚合读数；怎样聚合归该节，本卷不另写。
- **R9-7.3 上限取各项最小**：某族某参数的上限基值 = 该参数全部 `cap_row` 的全部项 `curve(读数)` 中的最小值；再经 `process.magnitudeCap` 求值，结果不小于 0。
- **R9-7.4 限幅**：`effects` 段把每个参数的请求值与上限比较，取小者代入效果族求值；`overreach = max(0, 请求值 − 上限)`。
- **R9-7.5 覆盖是加载校验**：每个效果族的每个声明参数，要么至少有一条 `cap_row`，要么有一条只写 `capExempt` 的行说明不设上限的理由代号；两者皆无即 E-ACT-CAP-MISSING。凡输出里产生实物或改写实物维度的族，其上限行合起来必须至少有一项 `of: actor`、至少有一项 `of: material` 或 `of: tool`，缺一类同样是 E-ACT-CAP-MISSING。要检定的动作没有难度行即 E-ACT-DIFFICULTY-MISSING。
- **R9-7.6 反噬**：成功度为 `critical_failure`，或 `overreach` 大于 0 且成功度不高于 `failure` 时，执行动作行的 `backlash`。反噬的 effectCall 以行动者自己为对象，参数里的严重度取该 `cap_row` 的 `overreachCurve(overreach)`（`overreach` 为 0 时取曲线在 0 处的值）；它经同一个执行器、同一条事件起因链提交。
- **R9-7.7 代价**：`cost_row.amountRX` 只读报价上下文与规则表；身体类代价（体力、专注一类）是 `vital` 或 `status` 原语，钱物类是 `transfer`。付不出即 E-ACT-COST。
- **R9-7.8 冷却**：效果族行的冷却（卷二 §3.9（效果族表 `_effects.json`）的 `cooldownDays`）在提交时由执行器落成一条带时限的状态容器实例；“还在冷却”是 `precondition` 段对该实例的普通读取。
- **R9-7.9 修正来源**：伤病、心情、工具、设施、天气、信条、职位对难度与上限的影响，只能是以 `process.checkDifficulty`、`process.checkAbility`、`process.magnitudeCap` 为目标的修正项，由各自的领域卷登记。

#### 4.7.4 交互

卷二 §3.3（求值管线）、卷二 §3.7（旧派生槽的对照与过程主体槽）；卷二 §3.9（效果族表 `_effects.json`）；卷三乙 §4.1（材料归类与聚合（由卷三甲的数值推出））、卷三乙 §4.6（工具能力）；卷十三 §4.1（个人战斗结算）、卷十五 §4.1（效果注册表）、各领域卷（登记三张行表的行）；卷二十一 §4.1（身体类状态实例）（反噬落成的身体状态）。通道：派生读取。

#### 4.7.5 数据实例

- 【西陲】锻打一件铁器的难度：一条 `difficulty_row`，`base` 30；材料项读所耗铁料的加工难度读数 0.6，曲线给 18；工具项读铁砧的工具能力读数，曲线给 −8。难度基值 `30 + 18 − 8 = 40`。换成更难加工的料，难度随读数上升，行不变。
- 【非西陲】雪原上凿冰取鱼：地点项读冰层厚度维度，曲线随厚度升高；工具项读凿具能力。同一张行表，没有按地区写的行。
- 【超自然】治愈术的幅度上限：`cap_row` 两项，`of: actor` 读施法技能给 25，`of: tool` 读法器效力给 30，上限 `min(25, 30) = 25`。请求 32，代入 25，`overreach = 32 − 25 = 7`；本次成功度 `failure`，`overreachCurve(7)` 给 0.35，反噬以严重度 0.35 落成施术者身上的一条状态实例。

#### 4.7.6 验收断言

- 扫描式：A9-7.1 动作行、效果族行与规则层代码里名为难度的数值字面量数为 0（改前 26）；`magnitudeCap` 的实现里效果族代号、材料类别字面量数为 0；全部效果族参数的上限覆盖缺口数为 0。
- 不变量式：A9-7.2 代入效果族的幅度恒不大于上限；上限恒不小于 0；难度与上限对同一上下文重复求值逐位相同；每个难度与上限的值都能由 `explain()` 逐段复算到行表的项与修正项。
- 扩展性式：A9-7.3 新增一条 `difficulty_row` 或 `cap_row`（引用一个此前没被用过的维度代号）后，相应动作的难度与上限随该维度变化，不改 .mjs。

### 4.8 同意与权能

#### 4.8.1 维度

`consent_scope` 族（§2.1）；`authority_via`、`clause_mode`；卷二定义的 `consent_mode` 与 `power` 族（只读）。同意是持有边：种类行登记在卷十八 §4.1（持有种类表与两条转移协议），边的属性 `{scope: ref consent_scope, object: 实体引用 nullable}`，起止时刻用持有边自带的区间。两张行表：

| 行表 | 字段 | 说明 |
|---|---|---|
| `authority_source` | `id`；`power: ref vocab power`；`via: authority_via`；`param: 代号`（`holding` 写持有种类代号，`office` 写职位权能代号，`disposal` 写处分种类代号，`guardianship` 不用，`contract` 写合同条款代号，`clause` 写条款行号） | 某项权能可以从哪里来 |
| `consent_clause` | `id`；`scope: ref consent_scope nullable`；`family: ref effect nullable`；`mode: clause_mode`；`grantorVia: authority_via nullable`；`whenRX: rx` | 同意的替代、免除与加重条款；卷十五 §4.4（施法同意条款）等登记行 |

#### 4.8.2 统一入口

`consent(engine, state, {actor, target, scope, object, at})` 与 `authority(engine, state, {actor, power, over, at})`，都在 `action-consent.mjs`，全书只此两个。别卷凡问“甲可否对乙或乙的东西这样做”，只调这两个函数。同意边的开立与撤回只经执行器的 `holding.open`、`holding.close`。

#### 4.8.3 规则

- **R9-8.1 按模式分派**：`resolve` 的 `consent` 段汇总动作行的 `consent` 与本次全部 effectCall 所属族的 `consent`，对每个（对象、模式）各问一次。`none` 直接通过；`target` 需要对象本人的同意；`holder` 需要对象物的持有人的同意（持有人经持有边读出）；`authority` 需要行动者对该对象具有 `power` 所指的权能。
- **R9-8.2 同意怎样成立**：依次看三样，任一成立即通过，并在 `basis` 里给出依据。① 应同意者到行动者有一条在世的同意边，`scope` 相同、`object` 相同或为空、区间盖住 `at`。② 有一条 `mode` 为 `waive` 的条款行，`whenRX` 此刻为真。③ 有一条 `mode` 为 `substitute` 的条款行，`whenRX` 为真，且经 `grantorVia` 与应同意者相连的另一人到行动者有满足 ① 的同意边。另有 `require_extra` 条款行 `whenRX` 为真时，须 ① 与 ③ 同时成立。都不成立即 E-ACT-CONSENT，返回里带“谁可以给出同意”的 id 列表。
- **R9-8.3 给出同意是动作**：征求、给予、撤回同意是目录里的普通动作行，效果是开立或关闭同意边；NPC 给不给由 `npcDecision()` 决定。模型的叙述不能产生同意。
- **R9-8.4 能表态才算数**：开立同意边的动作行以卷二 §2.5（状态谓词单点）的 `can()` 为前置（表态所需的能力代号取能力族条目）；不能表态的人给不出同意，只能走条款。
- **R9-8.5 亲密范围不可替代**：`scope` 的 `intimate` 为真或动作行 `intimate` 为真时，双方须各自通过卷十八的 `intimateEligible`、合起来通过 `intimateAllowed`，且只认 R9-8.2 的 ①。指向亲密范围的 `waive`、`substitute` 条款行在加载期即报错。这是未成年人保护里按数值判断的那一半；按文字判断的那一半在 §4.19。
- **R9-8.6 权能怎样成立**：`authority()` 取 `power` 相同的全部 `authority_source` 行，逐行按 `via` 读对应卷的入口：`holding` 读行动者对 `over`（或包含它的地点、组织）有无该种类的在世持有边；`office` 读卷八 §4.2（职位、官职、俸禄、继任、代理追认）的职位权能与辖区；`disposal` 调卷八b的 `disposalRight`；`guardianship` 读卷十八 §4.2（家户、亲属、婚配、继承、分家、监护）的监护边；`contract` 读卷六 §4.16（合同状态机）的在效条款；`clause` 读条款行的 `whenRX`。任一行成立即通过；返回全部成立的来源。
- **R9-8.7 来源是行不是分支**：新增一种权能来源只加 `authority_source` 行；`via` 的六个取值是读入口的方式，不是内容。
- **R9-8.8 时效与撤回**：同意边有截止时刻；`revocable` 的范围可由给出者随时关闭。撤回不追溯已提交的事；进行中的活动在下一次节奏重算或到期时重问一次，不成立即按 R9-1.6 中断。
- **R9-8.9 比的是代号**：同意是否对得上只比 `scope` 代号与 `object` id，不比任何说明文字。

#### 4.8.4 交互

卷二 §3.9（效果族表 `_effects.json`）（`consent` 字段）；卷十八 §4.1（持有种类表与两条转移协议）、卷十八 §4.9（婚配制度、性风俗、儿童与老人）；卷八 §4.2（职位、官职、俸禄、继任、代理追认）；卷八b §4.6（处分权）；卷六 §4.16（合同状态机）；卷十五 §4.4（施法同意条款）（只登记条款行）；卷五 §4.13（进入权与私宅许可）；卷四 §4.4（年龄、成长、寿命、出生与死亡率）。通道：持有边、派生读取。

#### 4.8.5 数据实例

- 【西陲】医者给清醒的伤者缝合。效果族的 `consent.mode` 为 `target`，范围 `cscope_medical`；伤者此前经“同意治疗”动作开立了到医者的同意边，区间盖住此刻，R9-8.2 ① 成立。
- 【非西陲】海岛部族里，少年随船远航须长者点头。动作行 `consent.mode` 为 `target`，另有一条 `require_extra` 条款行，`whenRX` 读对象的成年谓词为假，`grantorVia` 为 `guardianship`：须少年本人与监护人各有一条同意边。
- 【超自然】对昏迷者施治愈术与对清醒者施读心术。前者命中一条 `waive` 条款行（卷十五登记，`whenRX` 读“对象此刻不能表态”且“效果族行标为救护类”）；后者没有可用条款，对象未同意即 E-ACT-CONSENT。两者走同一个 `consent()`。

#### 4.8.6 验收断言

- 扫描式：A9-8.1 `action-consent.mjs` 之外，规则层为判断“可否对他人施加”而直接读同意边、监护边、职位权能或处分权的调用点数为 0（S9-2）；同意判断中的文字比较数为 0。
- 不变量式：A9-8.2 对任一提交的事件，其每个需同意的对象在提交时刻都能由 `basis` 复核出依据；亲密类动作的提交事件中，不满足 `intimateEligible` 的参与者数恒为 0；撤回同意不改变撤回之前的任何事件。
- 扩展性式：A9-8.3 新增一个同意范围条目、一条条款行与一条权能来源行（不改 .mjs），相应动作的同意与权能判定随之生效。

### 4.9 回合契约

#### 4.9.1 维度

`turn`、`segments`（§2.4）；`turn_timing`、`channel`、`segment_kind`、`quote_source`（§2.1）；`rules.turn.maxExtraMinutes`。回执是本次请求内各次 `resolve()` 返回的内存对象：`{eventId, actor, actionId, degree, primitives, minutesAdvanced, placeAfter, costs, alternatives}`，全部是代号、id 与数值。

#### 4.9.2 统一入口

`validateTurn(turn, receipts, channel, presentSet)` 与 `validateSegments(segments, textLength, presentSet)`，纯函数，在 `turn-contract.mjs`（规则层）。它们收到的是 aiGate 按封闭 schema 收窄后的代号结构，收不到文字。

#### 4.9.3 规则

- **R9-9.1 一次请求一个回合**：一次带回应句柄的请求经 `route()` 得到若干回执，合成恰好一个 `ReplyResult`（卷二 §2.9（外部边界与 Text 模型）第 0 条“回应通道”）。世界在叙述之前已经结算完毕。
- **R9-9.2 回执先于叙述**：叙述请求的输入只有回执、场景卡与（输入回合才有的）本轮原文的独立数据字段；模型看不到未提交的东西，也改不了已提交的东西。
- **R9-9.3 叙述输出的结构**：模型随叙述文字一并返回 `turn`、`segments`、`claims`、`mentions`。`channel` 为 `ic` 时 `turn` 四个字段必填；为 `ooc` 时 `turn` 必须为空。
- **R9-9.4 `turn` 是待核对的声明，不是输入**：`timing` 为 `timed` 时，`extraMinutes` 必须等于各回执 `minutesAdvanced` 之和；为 `already_timed` 时，`extraMinutes` 必须为 0，且本回合的时间只由带 `wait` 槽位的意图推进或没有推进。`location` 必须等于最后一条回执的 `placeAfter`（没有回执时等于行动者当前所在地点）。`present` 必须是在场集合的子集。时钟只由回执里的 `time` 原语推进，`turn` 里的数不推进任何东西。
- **R9-9.5 `segments` 的校验**：各段区间落在文字长度内、按起点升序、互不重叠；`dialogue` 段必须有 `speaker`，且 `speaker` 在在场集合里；`speaker` 是玩家操控实体的段必须 `quoteSource` 为 `player`，并且 aiGate 对该段的引文同一性检查已通过（卷二 §2.9（外部边界与 Text 模型）第 6 条）。没有本轮原文的请求不得出现这种段。
- **R9-9.6 没有默认值**：任何字段缺失、越界或与回执不符即 E-TURN-UNMAPPED，整份结构化输出作废，计入 §4.19 的重请计数；用尽后本回合改用模板叙述。不合成“额外 0 分”“原地”“无人在场”之类的替代值。
- **R9-9.7 没有正式行动的回合**：请求没有产生任何回执时，`ReplyResult` 只带结果代号；`turn` 仍须按 R9-9.4 给出（`already_timed`、0 分）。
- **R9-9.8 场外**：`ooc` 回合不结算、不推进；规则层判断场内场外只读请求里的 `channel` 代号。
- **R9-9.9 运行期不写 AI 记录文字**：编年史、档案、碑记都是事件的投影，按模板显示。运行期模型不写 `records.*.text`；卷二 §2.9（外部边界与 Text 模型）第 0 条为它留的四样登记与对应文件按该条所说一并删除（见 §5.3）。

#### 4.9.4 交互

卷二 §2.9（外部边界与 Text 模型）（回应通道、叙述入口、引文同一性）；卷二十九 §4.7（前端适配器与输出守门）（`channel` 开关与结构化上行）；卷二十 §4.1（刻、同刻全序、调度器与到期语义）；§4.6、§4.11、§4.19。通道：派生读取。

#### 4.9.5 数据实例

- 【西陲】玩家点选“步行去磨坊”。回执一条，`minutesAdvanced` 25，`placeAfter` 为磨坊。模型返回 `turn = {extraMinutes: 25, location: 磨坊的 id, present: [磨坊主的 id], timing: timed}`，校验通过。若返回 `extraMinutes: 40` 即 E-TURN-UNMAPPED。
- 【非西陲】在北地渡口等船三刻钟：意图带 `wait` 槽位 45，时间由推进请求走掉。`turn` 须为 `{extraMinutes: 0, …, timing: already_timed}`。
- 【非人类】玩家操控的猎鹰独自侦察，回合里没有任何会说话的在场者：`segments` 只有 `narration` 段；出现 `dialogue` 段而 `speaker` 不在在场集合即作废。

#### 4.9.6 验收断言

- 扫描式：A9-9.1 规则层从叙述正文里抓标签、属性或数字的代码行数为 0；规则层 import 客户端回合解析文件的行数为 0；为缺失的回合字段填默认值的代码行数为 0。
- 不变量式：A9-9.2 对同一份回执，无论模型返回什么 `turn`、`segments`，事件流与文字路径之外的状态逐值相同；每个带句柄的请求恰有一个 `ReplyResult`；`ooc` 回合前后世界时钟不变。
- 扩展性式：A9-9.3 新增一种动作（含耗时）后，回合校验不需要任何改动即可核对其 `turn`。

### 4.10 叙述投影

#### 4.10.1 维度

`scene_section` 行表：`{id, focus: ref focus, source: 读入口登记代号, domain: 卷二十二 §4.1（主观视图四域与检索键）四域之一的代号, priority: integer, required: boolean}`。`focus` 族。`rules.scene.promptBudget`、`rules.scene.staticBudget`（单位都是码点数）。场景卡是 JSON，字段只有代号、数值、id 与 `labelKey`。

#### 4.10.2 统一入口

读：`sceneCard(engine, state, viewerId, focusList)`，第六层投影，在服务端规则层。把场景卡变成发给模型的提示文字是 AI 边的事（卷二 §2.9（外部边界与 Text 模型）第 0 条的提示渲染能力），本卷不写。

#### 4.10.3 规则

- **R9-10.1 段是登记的行**：场景卡由若干段组成，每段一行 `scene_section`，由拥有该内容的领域卷登记（天气段归卷二十，用工段归卷六，农事段归卷二十五）。本卷代码里没有任何段的代号。
- **R9-10.2 选哪些段只看代号**：`focusList` 是意图槽位 `focus` 给的代号列表。给了列表：取 `required` 的段加上 `focus` 在列表里的段。没给（菜单回合的缺省）：取全部段。然后按（`required` 在前、`priority` 降序、行代号升序）排定。
- **R9-10.3 知情裁剪**：每段的数据只经卷二十二 §4.1（主观视图四域与检索键）的主观视图取，观察者是 `viewerId`。观察者不知道的事实不进卡；别人的私密只在观察者的已知集合里有时才进。场景卡不直接调任何真值 view。
- **R9-10.4 预算**：动态预算 = `rules.scene.promptBudget − rules.scene.staticBudget`（加载校验保证为正）。按 R9-10.2 的次序逐段累加其序列化后的码点数，加上后不超预算的整段收入，超的整段跳过并把行代号记进卡的 `dropped` 列表；不截断段的内部。`required` 的段合计超出预算是加载期可检的配置错误。
- **R9-10.5 卡里的状态都是代号**：死亡、揭穿、核实与否一类状态以定义卷的枚举代号出现；卡里没有任何用来判断的文字。
- **R9-10.6 决定卡随卡走**：本回合出面说话的 NPC 的 `Decision` 以决定卡代号与槽位值写进卡；模型只按它措辞（卷一 §7（AI 的位置））。
- **R9-10.7 检索只按键**：往事与记忆的取用按 `mentions`（实体 id）与维度代号这一套检索键，键的定义归卷二十二 §4.1（主观视图四域与检索键）；没有主题词表，不拿玩家原文去检索。

#### 4.10.4 交互

卷二十二 §4.1（主观视图四域与检索键）；卷二十九 §4.2（叙述模板与片段库）（同一张卡在不开模型时走模板）；卷二十六 §4.4（想法与心情）（心情段）；各领域卷（登记段）；§4.9、§4.12、§4.19。通道：派生读取。

#### 4.10.5 数据实例

- 【西陲】玩家在集镇问起招工。意图带 `focus = [focus_labor]`。卡里有必备的时地人三段与用工段；天气段、农事段不在列表里，不取。
- 【非西陲】在盐湖商站点选“环顾”，菜单回合不带 `focus`：全部段按优先级装入，预算 6000，装到第七段时累计 5820，第八段 400 码点装不下，整段跳过，`dropped` 记它的行代号。`5820 + 400 = 6220`，大于 6000。
- 【超自然】观察者是一名能见亡魂的灵媒。亡魂段的数据来自她的主观视图（她的感知通道里有这一类），同一地点换一个普通观察者，这段为空。没有按“是不是灵媒”写的分支，差别只在主观视图。

#### 4.10.6 验收断言

- 扫描式：A9-10.1 场景卡代码里段代号字面量数为 0、对玩家问话做匹配的行数为 0；场景卡 schema 里文字类型字段数为 0；场景卡代码直接调用真值 view 的次数为 0。
- 不变量式：A9-10.2 卡的序列化码点数恒不超过动态预算；同一状态、同一观察者、同一 `focusList` 两次生成逐字节相同；卡里出现的每个事实 id 都在观察者的已知集合里。
- 扩展性式：A9-10.3 新增一条 `scene_section` 行与一个 `focus` 条目后，该段可被菜单缺省与 `focus` 槽位取到，不改 .mjs。

### 4.11 一致性审查

#### 4.11.1 维度

`claims`（§2.4）；`claim_kind` 族（§2.1），条目另带 `mustClaim: boolean`；`claim_detect`、`claim_modality`、`claim_polarity`、`temporal_mode`、`review_verdict`、`validator_verdict`；`rules.review.tolerance`。`evidence_row` 行表：`{id, from: enum(receipt, view), entry: 读入口或回执字段的登记代号, compare: enum(eq, le, ge, within, known)}`。首批声明种类（数值与归属待各领域卷认领后定稿）：

```json
{
  "ck_payment":    {"detect": "ledger", "mustClaim": true,  "valueType": "integer"},
  "ck_debt":       {"detect": "ledger", "mustClaim": false, "valueType": "integer"},
  "ck_fee":        {"detect": "ledger", "mustClaim": true,  "valueType": "integer"},
  "ck_stock":      {"detect": "ledger", "mustClaim": false, "valueType": "integer"},
  "ck_craft":      {"detect": "ledger", "mustClaim": true,  "valueType": "integer"},
  "ck_clock":      {"detect": "ledger", "mustClaim": false, "valueType": "integer"},
  "ck_search":     {"detect": "ledger", "mustClaim": false, "valueType": "integer"},
  "ck_history":    {"detect": "ledger", "mustClaim": false, "valueType": "integer"},
  "ck_obligation": {"detect": "ledger", "mustClaim": false, "valueType": "ref"},
  "ck_knowledge":  {"detect": "ledger", "mustClaim": false, "valueType": "none"},
  "ck_age":        {"detect": "ledger", "mustClaim": false, "valueType": "integer"},
  "ck_naming":     {"detect": "gate",   "mustClaim": false, "valueType": "ref"},
  "ck_agency":     {"detect": "gate",   "mustClaim": false, "valueType": "none"},
  "ck_meta":       {"detect": "self",   "mustClaim": false, "valueType": "none"}
}
```

#### 4.11.2 统一入口

`reviewClaims(engine, state, receipts, claims, segments, turn, channel)`，纯函数，在 `consistency-review.mjs`（规则层）。输入里没有叙述文字、没有玩家原文、没有屏蔽词表。第二校验器在 AI 边，本函数只收它的裁定代号列表。

#### 4.11.3 规则

- **R9-11.1 只核代号与账面**：审查不读正文。它核三样：声明的结构与代号合不合法；声明的值与账面对不对得上；该有声明的地方有没有。
- **R9-11.2 结构校验**：`kind` 在族内；`subject` 是登记的 id，其实体类在该种类的 `subjectKind` 里（由规则查登记表，不信自报）；`predicate` 在该种类的 `predicates` 里；`value` 合 `valueType`；`references` 的 `sourceId` 已登记、区间合法；`segmentId` 存在。任一不合即 E-CLAIM-SCHEMA，整份声明作废。
- **R9-11.3 按检出来源分三路**：`ledger` 类按该种类的 `evidence_row` 取账面值——`from: receipt` 取本回合回执的字段，`from: view` 取定义卷读入口的现值或登记的累计量——再按 `compare` 比较；对不上为 `mismatch`，取不到账面为 `unsourced`。`gate` 类由 §4.19 的守门在到达本函数之前检出，本函数只确认守门代号列表为空。`self` 类是模型自报，只能得 `warning`。
- **R9-11.4 哪些声明要严格比**：只有 `modality` 为 `fact` 且 `time.mode` 为 `current` 或 `past` 的声明按 R9-11.3 比；`intention`、`question`、`hypothetical`、`figurative` 与 `future` 不比账面，只做结构校验。`polarity` 为 `deny` 时比较取反。数值比较的容差取 `rules.review.tolerance` 中该种类的值，缺键为 0。
- **R9-11.5 缺报**：本回合回执里属于 `mustClaim` 种类的每一项（一笔付款、一次收费、一次制作结果），若没有一条 `subject` 与之对应的声明，即对该项给 `unsourced`。这样漏报不比错报占便宜。
- **R9-11.6 转述与谎言**：`modality` 为 `reported` 的声明须带 `source`。说话者是 NPC、内容与账面不符的 `fact` 声明，只有其 `references` 引到该说话者名下一条登记的谎言 id（卷十八 §4.5（关系、记忆、认知与谎言））时才不算 `mismatch`。
- **R9-11.7 知情**：证据行 `compare` 为 `known` 的种类（某人说出某事实），核对说话者的已知集合（卷二十二 §4.1（主观视图四域与检索键））里有该事实 id；没有即 `mismatch`。
- **R9-11.8 第二校验器的裁定**：裁定代号只取 `validator_verdict`。`unmarked_name`、`minor_romance`、`injection` 在 §4.19 折成拒收代号；`private_disclosure` 带事实 id，按 R9-11.7 核对；`meta` 直接记 `mismatch`；`clean` 不产生结论。规则层只比较这些代号。
- **R9-11.9 结论与处置**：有任一 `mismatch` 或 `unsourced`，本次叙述不入库，计入 §4.19 的重请计数，用尽后改用模板叙述。只有 `warning` 的照常入库，并记旁路。问题清单只带声明编号、段编号与码点区间，不带文字。
- **R9-11.10 不改状态、不读日志**：审查不写任何状态；取证只读本回合内存回执与各读入口，不回读事件日志。

#### 4.11.4 交互

卷六 §4.1（账本三元键与守恒）、卷六 §4.16（合同状态机）（付款、欠款、义务的账面）；卷十八 §4.5（关系、记忆、认知与谎言）；卷二十二 §4.1（主观视图四域与检索键）；卷四 §4.4（年龄、成长、寿命、出生与死亡率）（年龄声明）；卷二十八 §4.5（离线校验）（固化内容用同一套声明结构）；各领域卷（登记 `claim_kind` 行与 `evidence_row` 行）；§4.9、§4.19。通道：派生读取。

#### 4.11.5 数据实例

- 【西陲】本回合回执有一笔 12 文的付款。模型给 `{kind: ck_payment, subject: 该笔义务的 id, predicate: amount, value: 12, polarity: affirm, modality: fact}`，与回执的出账相等，`consistent`。若模型没给这条声明，按 R9-11.5 为 `unsourced`；若给 `value: 15`，为 `mismatch`。
- 【非西陲】南洋货栈的掌柜对玩家说“你上回欠的还没清”。声明 `{kind: ck_debt, subject: 欠款义务 id, predicate: amount, value: 40, speaker: 掌柜 id}`；账面该义务已结清。`references` 里引到掌柜名下登记的一条谎言 id，R9-11.6 成立，不算不符。
- 【超自然】一位神谕者“预言”某人三日内必死：`modality: fact`、`time.mode: future`。按 R9-11.4 不比账面，只做结构校验；它不会让任何人真的死，因为叙述不写状态。

#### 4.11.6 验收断言

- 扫描式：A9-11.1 `consistency-review.mjs` 及其调用链在规则层部分的正则、子串函数、文字字面量比较数为 0（改前 60 余处）；其输入类型里文字类型字段数为 0；审查代码里声明种类代号字面量数为 0。
- 不变量式：A9-11.2 对同一份回执与声明两次审查结论逐值相同；审查前后存档摘要相同；`self` 类声明从不产生 `mismatch`；每条 `mustClaim` 回执项要么有声明要么有一条 `unsourced` 结论。
- 扩展性式：A9-11.3 新增一个声明种类条目与一条 `evidence_row`（指向某卷已有的读入口）后，该种类的声明即被核对，不改 .mjs。

### 4.12 NPC 决策管线

#### 4.12.1 维度

`decision_stage`、`decision_outcome`；`Decision`（§2.4）；`decision_card` 族；`state.agendas`、`state.decisionCommit`（§2.3）；`rules.npc.*`（§2.5），另有 `rules.npc.redLineSeverity`（number）与 `rules.npc.switchMargin`（number，≥ 0）。`candidate_provider` 行表：`{id, actionId, slotGen: map<槽位代号, list<ref target_filter>>, whenRX: rx, maxCandidates: integer ≥ 1}`。候选：`{candidateId, intent, contrib: map<ref drive, number>, cost: struct{money, minutes, risk, relation}, reward: number}`；`candidateId` 由（动作代号、主对象 id）组成。

#### 4.12.2 统一入口

`npcDecision(engine, state, personId, request)`（别人向他提出一件事）与 `npcChoose(engine, state, personId, at)`（他自己挑一件事做），都在 `npc-decision.mjs`，都是纯函数。读：`personView().dims.driveWeight`、`decisionJitter()`、`preferenceOf()`、`needSatisfiers()`（卷二十六 §4.9（决策噪声接口））；`stance()`、`dread()`、`treatment()`、`recall()`（卷十八）；`evaluationOf()`（卷七）；`legalityOf()`（卷八b）；`can()`、`activityOf()`、`agendaOf()`。输入一律来自该人物的主观视图，不取真值。

#### 4.12.3 规则

- **R9-12.1 五段定序**：`red_lines`、`relations`、`utility`、`circumstances`、`conflicts`，顺序固定；每段往 `trace` 里写代号与数值。
- **R9-12.2 底线**：候选的动作代号，或它在该人物所在法域与信仰下对应的罪名与评价行代号，若在 `evaluationOf()` 给出的读数里严重度不低于 `rules.npc.redLineSeverity`，该候选剔除。亲密类动作而本人不满足 `intimateEligible` 的，同样剔除。底线集合全由评价行与人物的价值有效值算出，人物档里不存底线文字。
- **R9-12.3 关系**：对提出者读 `stance()` 各轴、`dread()`、`treatment()`；经卷十八 §4.5（关系、记忆、认知与谎言）的记忆入口，数出与提出者有关、且事件类型行的类别字段取违约一类代号的记忆条数。这些都以数值进下一段，不读记忆内容。
- **R9-12.4 效用**：`U = Σ_d driveWeight[d] × contrib[d] + w.reward × reward + w.relation × 立场读数 − w.money × cost.money − w.time × cost.minutes − w.risk × cost.risk + decisionJitter(主体, 决策时刻, candidateId)`。`w` 取 `rules.npc.utilityWeights`。需求类驱力的 `contrib` 由 `needSatisfiers()` 给出；`cost.risk` 可含 `legalityOf()` 读出的不合法后果估值。**各项代价保留正负号**：负的代价（抵扣、对方代付）抬高效用，不截成 0。全式只有加减乘。
- **R9-12.5 应答式的结论**：`npcDecision` 对“答应”这个候选算 `U`。底线剔除即 `refuse`；`U` 不小于 0 且后两段无碍即 `agree`；`U` 小于 0 见 R9-12.6；后两段有碍见 R9-12.8。
- **R9-12.6 有条件答应**：`U` 小于 0 时，若 `w.reward` 为 0，不做除法，结论为 `refuse`；否则所需预付 = `ceil(−U ÷ (w.reward × rules.npc.conditionalStep)) × rules.npc.conditionalStep`（`conditionalStep` 是正整数，此时 `w.reward` 为正，除数为正），结论为 `conditional`，决定卡槽位带这笔数。
- **R9-12.7 主动式的选择**：`npcChoose` 在三种时刻被调度：日程槽结束、当前活动结束、卷二十六登记的需求阈值到期项触发。它取全部 `candidate_provider` 行与代码登记的候选提供者，各自按 `whenRX` 与 `slotGen` 生成不超过 `maxCandidates` 个候选，过 R9-12.2，按 R9-12.4 算 `U`，取最大者；`U` 相同时取 `candidateId` 码序最小者。已有承诺（`state.decisionCommit`）未到 `until` 时，新候选的 `U` 须比承诺候选此刻的 `U` 高出 `rules.npc.switchMargin` 才替换。`npcChoose` 自己不写状态；调度它的到期钩子据其结果以声明写者写日程槽与承诺，并把意图交 `resolve()`。
- **R9-12.8 处境与冲突**：`circumstances` 段读 `can()`、`activityOf()` 的动作类注意力、日程槽占用：此刻做不了而稍后可以的，结论 `defer`，`due` 取最早的空闲时刻。`conflicts` 段读该人物在效的义务与职位职责：时间区间重叠或职责禁止的，结论 `refuse`。两段都只比较区间与代号。
- **R9-12.9 决定先于对白**：`Decision` 算出后才有台词。决定卡代号与槽位进 `ReplyResult` 与场景卡；模型只管措辞，改不了结论。
- **R9-12.10 走同一条管线**：NPC 对世界的一切改动只经 `resolve()`。日程槽与承诺是决策自己的记录，不是世界改动，由 `npc-agenda.mjs` 以声明写者写。候选提供者只返回意图，自己不写状态；违者 E-NPC-BYPASS。
- **R9-12.11 不是每拍都想**：决策只在 R9-12.7 的到期时刻发生，不随推进步长变化；聚合层的人不逐人决策（卷二十七 §4.1（三层模拟运行矩阵））。
- **R9-12.12 契机不在这里**：隐藏职业契机（卷十四 §4.8（隐藏职业契机））是订阅事件的反应规则；它若给出“可以入行”，那只是多出一个候选，取舍仍按本节。

#### 4.12.4 交互

卷二十六 §4.9（决策噪声接口）、卷二十六 §4.3（心理需求）；卷十八 §4.4（立场数轴（来源表、衰减、单入口））、卷十八 §4.5（关系、记忆、认知与谎言）、卷十八 §4.11（恐惧值）；卷七 §4.26（美德、罪恶、罪行、羞耻（评价行））；卷八b §4.5（合法性是后果）；卷六 §4.16（合同状态机）、卷六 §4.21（价格四角色）；卷十四 §4.8（隐藏职业契机）；卷二十 §4.1（刻、同刻全序、调度器与到期语义）；卷二十七 §4.1（三层模拟运行矩阵）；§4.1、§4.3、§4.13。通道：派生读取、声明写者。

#### 4.12.5 数据实例

- 【西陲】一个饿着的短工考虑去酒馆吃饭。候选 `(act_trade_buy, 酒馆掌柜 id)`：饥饿驱力权重 0.8，贡献 0.5，得 0.4；钱 12 文，`w.money` 0.01，扣 0.12；30 分钟，`w.time` 0.002，扣 0.06；扰动 +0.03。`U = 0.4 − 0.12 − 0.06 + 0.03 = 0.25`。若东家代付 5 文，`cost.money` 为 7，扣 0.07，`U = 0.30`；若是东家倒贴 5 文（代价 −5），该项为 `−0.01 × (−5) = +0.05`，不被截掉。
- 【非西陲】玩家请一名山地向导带路过隘口。`U = −0.3`，`w.reward` 0.02，`conditionalStep` 5：预付 = `ceil(0.3 ÷ (0.02 × 5)) × 5 = ceil(3) × 5 = 15`。决定卡 `dcard_conditional`，槽位 `prepay = 15`。
- 【非人类】一头冬眠前的熊。候选提供者行按卷二十六登记的进食需求给出“觅食”类候选；它没有钱的代价项，风险项来自对人类聚落的恐惧读数。同一条效用式、同一个 `resolve()`。

#### 4.12.6 验收断言

- 扫描式：A9-12.1 决策与自治代码里的正则、文字匹配、目标内容文字比较数为 0；规则层里绕过 `resolve()` 的 NPC 写入点数为 0（改前 2 处）；把代价截成非负的代码行数为 0。
- 不变量式：A9-12.2 同一主观视图、同一时刻、同一候选集，结论逐值相同；候选集增删别的候选不改变某一候选的 `U`；一次推进 N 天与分段推进合计 N 天，NPC 的决策时刻序列与结论相同；`trace` 里没有文字。
- 扩展性式：A9-12.3 新增一条 `candidate_provider` 行（引用已有动作与筛选）与一个驱力贡献声明后，NPC 会在效用更高时选它，不改 .mjs。

### 4.13 对话与交涉状态机

#### 4.13.1 维度

`state.dialogues`（§2.3）；`dialogue_state`；`request_kind`；`rules.dialogue.*`。`dialogue_move` 行表：`{actionId, from: set<dialogue_state>, onOutcome: map<decision_outcome, dialogue_state>, opens: boolean, closes: boolean}`，每行对应目录里一条 `social` 为真的动作。出价结构 `offer = {give: list<{resource: 资源或物品引用, qty: integer ≥ 1}>, take: 同形}`。

#### 4.13.2 统一入口

读：`dialogueView()`。写：`state.dialogues` 只由 `dialogue.mjs`，经执行器的 `transition` 原语。对话里的每一步都是经 `resolve()` 提交的动作。

#### 4.13.3 规则

- **R9-13.1 对话动作是普通动作**：招呼、询问、请求、出价、还价、接受、拒绝、威吓、告辞都是目录行，走九段。对方是 NPC 时，应答由 `npcDecision()` 给出；对方是受操控实体时，状态停在等待，轮到玩家出下一步。
- **R9-13.2 转移查表**：一步合法当且仅当会话当前状态在该行的 `from` 里，否则 E-DIALOGUE-STATE；新状态 = `onOutcome[应答结论]`。`opens` 的行新建会话，`closes` 的行置 `closed` 并清除。代码里没有按动作代号写的转移。
- **R9-13.3 话题是检索键**：问什么由槽位 `mentions`（实体 id 列表）与 `dims`（维度代号列表）给出，`kind` 取 `ask` 或 `request`。答什么由规则定：从应答者的已知集合里取与检索键相合的事实 id，去掉对提问者保密的（卷二十二 §4.7（秘密））与 `treatment()` 不许告知的，写进决定卡槽位。
- **R9-13.4 交涉**：出价是结构化的 `offer`。应答者按卷六 §4.21（价格四角色）的估值入口、以自己的主观视图给双方物项估值，差额作为 `reward` 或 `cost.money` 进 R9-12.4。结论 `conditional` 时生成还价：在对方的 `give` 上加一笔 R9-12.6 的数。每出一次价 `round` 加 1；达到 `rules.dialogue.maxRounds` 仍未 `agreed` 即转 `refused`。两个还价方案效用相等时用 §2.9 的会话抽取点定序。
- **R9-13.5 冷场关闭**：每一步把 `idleUntil` 设为此刻加 `rules.dialogue.idleMinutes` 并登记到期项；到期未续即 `closed`。只按世界分钟。
- **R9-13.6 成交即动作**：`agreed` 之后的交付（买卖、雇佣、跟随、借贷）是另外的目录动作，其 `whenRX` 要求双方有一场 `agreed` 的会话；状态机自己不转移任何钱物。
- **R9-13.7 多人应答**：槽位 `respondents` 列出多个应答者时，各人按 id 升序分别调 `npcDecision()`，互不读对方本轮的结论。
- **R9-13.8 威吓**：威吓一步的效用项读 `dread()` 与卷十三 §4.18（遭遇与谈判结算）登记的威慑量来源行；没有专门的威吓算法。
- **R9-13.9 说谎**：应答者决定隐瞒或说假话时，决定卡带一条登记的谎言 id（卷十八 §4.5（关系、记忆、认知与谎言））；台词怎样说是措辞，§4.11 按该 id 放行。

#### 4.13.4 交互

卷十八 §4.12（社交互动、斗殴与相容性）、卷十八 §4.10（外来者待遇与立场基线）；卷六 §4.21（价格四角色）、卷六 §4.16（合同状态机）；卷十三 §4.18（遭遇与谈判结算）；卷二十二 §4.1（主观视图四域与检索键）、卷二十二 §4.7（秘密）；卷二十九 §4.2（叙述模板与片段库）（模板对白）；§4.3、§4.8、§4.12。通道：声明写者、派生读取。

#### 4.13.5 数据实例

- 【西陲】向粮商打听麦价：`act_talk_ask`，`mentions = [粮商的铺子 id]`，`dims = [价格维度代号]`，`kind = ask`。粮商已知集合里有该价，不属秘密，决定卡 `dcard_answer` 带事实 id。
- 【非西陲】在大漠驿站买骆驼：玩家出价给 80、取一头骆驼；商人估值骆驼 110，差 30 进代价，`U` 为负，结论 `conditional`，还价要求再加 30（按步长取整后）。第二轮玩家加到 110，`agreed`；随后的交付是 `act_trade_buy`。`round` 从 0 到 2。
- 【超自然】与一尊镇河的石灵交涉放行。它的应答同样由 `npcDecision()` 给出，供奉物的估值取它那一行登记的偏好；会话状态、轮数上限、冷场关闭与凡人相同。

#### 4.13.6 验收断言

- 扫描式：A9-13.1 对话代码里按动作代号分支的行数为 0、读台词或话题文字的行数为 0；`dialogue_move` 之外定义对话转移的位置数为 0。
- 不变量式：A9-13.2 会话状态只经 `transition` 原语改变；`round` 不超过 `rules.dialogue.maxRounds`；交涉过程中除经 `resolve()` 提交的动作外没有任何钱物转移；同一种子重跑，同一串对话动作得到同一串状态。
- 扩展性式：A9-13.3 新增一条对话动作行与一条 `dialogue_move` 行（例如“起誓”）后，该步可在菜单里点出并按表转移，不改 .mjs。

### 4.14 AI 档位与降级

#### 4.14.1 维度

`ai_tier`、`ai_use`、`ai_fail`（§2.1）；`rules.ai.tierUses`、`rules.ai.timeoutMs`、`rules.ai.degradeMap`（§2.5）。首值占位：`t0` 无用途；`t1` 为 `understand`；`t2` 加 `narrate`、`dialogue`、`validate`；`t3` 加 `judge`、`draft`。档位是运行配置，不在 state，不进存档，不进哈希。

#### 4.14.2 统一入口

`aiAllows(config, use)` 与 `effectiveTier(config, degradeLevel)`，都在 AI 边（aiGate 组），规则层不可调用也读不到档位。性能降级档位只经卷二十七的 `degradeLevelOf` 读。

#### 4.14.3 规则

- **R9-14.1 缺省是 `t0`**：客户端每次请求带档位代号；缺失或不在枚举内即 `t0`。`t0` 下不发任何模型请求，整个游戏靠菜单、构造器与模板完整可玩。
- **R9-14.2 用途表是数据**：某档位能做哪些用途只查 `rules.ai.tierUses`。`narrate` 与 `dialogue` 生效的档位必须同时含 `validate`（加载校验）：没有第二校验器就不收模型叙述。
- **R9-14.3 性能降级只往下**：生效档位 = 配置档位与 `rules.ai.degradeMap` 中“`level` 不大于当前降级档位的最后一行”的 `maxTier` 两者中较低的一个。这是单向读：模型档位、费用、模型是否可用，不进卷二十七 §4.3（成本模型与降级阶梯）的任何输入。
- **R9-14.4 超时**：每种用途的时限取 `rules.ai.timeoutMs`；计时用内核调度器注入的定时能力（卷二 §2.9（外部边界与 Text 模型）第 0 条“定时器”），AI 边自己不读墙钟。
- **R9-14.5 每种用途有固定的退路**：`understand`、`judge` 失败退到 `menu_fallback`；`narrate`、`dialogue` 失败退到模板叙述与模板对白；`validate` 失败视同叙述被拒；`draft` 只在作者边，失败即无草稿。失败原因取 `ai_fail`，只写旁路。退路不是另一套文字理解。
- **R9-14.6 世界与档位无关**：同一串意图在任何档位下，事件流与文字路径之外的状态逐值相同。档位只影响两件事：键入的自由文字能否被译成意图，以及显示的是模型文字还是模板文字。
- **R9-14.7 密钥归玩家**：密钥只在 AI 边的运行配置里，不进存档、不进旁路记录、不进提示。
- **R9-14.8 运行期没有“模型替 NPC 规划”与“模型写人物档”两种用途**：NPC 的规划归 §4.12；人物档里影响规则的字段由规则按种子采样（卷八 §4.16（人口统计层、承载力、迁徙、移民波次）与卷二十七 §4.7（复演与规则只一版）的约束），模型至多经 `draft` 在作者边起草文字。

#### 4.14.4 交互

卷一 §7（AI 的位置）；卷二 §2.9（外部边界与 Text 模型）（定时能力、叙述入口的结果代号）；卷二十七 §4.3（成本模型与降级阶梯）（`degradeLevelOf`，单向）；卷二十九 §4.2（叙述模板与片段库）（退路）；§4.17、§4.18、§4.19。通道：无（不读写世界状态）。

#### 4.14.5 数据实例

- 【西陲】玩家以 `t2` 游玩时断网。本回合 `understand` 失败原因 `offline`，键入的句子退回完整菜单；点选之后 `narrate` 同样失败，显示模板叙述。两次都只在旁路各记一行；存档与不断网时逐值相同（文字路径除外）。
- 【非西陲】远洋大港同屏人数多，卷二十七把降级档位升到 2；`degradeMap` 里 `level` 2 的行 `maxTier` 为 `t1`，生效档位由 `t3` 降为 `t1`：还能译码，不再请求叙述。港口的模拟本身不因此改变。
- 【非人类】与一只会学舌的渡鸦对话，档位 `t0`：台词由显示层按它的决定卡代号走模板。换成 `t2`，同一张决定卡交模型措辞，结论不变。

#### 4.14.6 验收断言

- 扫描式：A9-14.1 规则层与内核读取档位、用途表、模型可用性的行数为 0（S9-6）；AI 边之外发起模型请求的调用点数为 0；AI 边读墙钟的行数为 0。
- 不变量式：A9-14.2 同一种子、同一串意图分别在四个档位下运行，事件流与文字路径之外的状态逐值相同；`t0` 下模型请求数为 0；任一用途失败后本回合仍恰有一个 `ReplyResult`。
- 扩展性式：A9-14.3 在 `rules.ai.tierUses` 里把一种用途挪到另一档、或在 `degradeMap` 加一行，行为随之改变，不改 .mjs。

### 4.15 三级落地

#### 4.15.1 维度

`landing_level`；`state.marks`（§2.3）；`mark_kind` 词表族（开放，条目字段 `onKinds: set<实体类>`）；`rules.cap.improvisedMod`。偏离行 `state.created` 的格式与 `basis` 结构归卷二 §2.7（系统声明表 `state-owners.json`）。

#### 4.15.2 统一入口

读：`landingOf(engine, state, proposal)`，纯函数。写：留痕经 `fact.set` 原语的适配器落到 `mark-actions.mjs`；事实级产物经 `create` 原语。固化不在运行期。

#### 4.15.3 规则

- **R9-15.1 级别由数据判定**：提案全部效果项都能按 R9-4.1 表达且上限行齐全，为 `fact`。有效果项不能表达，但提案给了一个 `mark_kind`、且对象的实体类在该条目的 `onKinds` 里，为 `mark`。两者都不是即拒绝，按 R9-3.3 返回原因与替代。运行期永远不判出 `solidified`。
- **R9-15.2 留痕**：一条留痕只有种类代号、对象、留痕者、时刻。它本身不改任何维度；要让某种留痕有后果，由领域卷登记订阅留痕事件的反应规则。留痕的说明文字若玩家想写，走卷二 §2.9（外部边界与 Text 模型）第 3 条的玩家手记路径，规则层读不到。
- **R9-15.3 事实**：事实级产物按 R9-4.4 由材料、技能、意图推出。提案没有对应配方行（卷三乙 §4.8（配方通用规则（继承、产率、递归）））时，另挂一条以 `process.quality` 为目标、值取 `rules.cap.improvisedMod` 的修正项；这条修正对一切材料同样适用。产物是一条偏离行，带 `basis`（代号、种子键、写者）。
- **R9-15.4 固化在线下**：同一结构的事实级产物反复出现后，由 §4.16 聚成候选，经作者管线的校验与审批（卷二十八 §4.5（离线校验））变成普通内容行，与手写内容同一格式、同一加载器。运行期不写 `world/`。
- **R9-15.5 级别不看来路也不看档位**：同一提案无论谁提、开不开模型，级别相同。
- **R9-15.6 没有材料名单**：判级与品质都不含材料类别字面量；一种新材料只要有物性数值，就能进事实级提案。

#### 4.15.4 交互

卷三乙 §4.5（品质档）、卷三乙 §4.8（配方通用规则（继承、产率、递归））；卷二 §2.7（系统声明表 `state-owners.json`）（偏离行）；卷二十八 §4.5（离线校验）；卷十九 §4.10（可移动建筑与微型龛祠）（小型构筑物也是事实级产物）；§4.4、§4.7、§4.16。通道：声明写者、事件。

#### 4.15.5 数据实例

- 【西陲】在界碑上刻一道记号。没有效果族能表达“刻了个只有自己懂的记号”；提案给 `mark_kind` 为刻痕类，界碑的实体类在其 `onKinds` 里，级别 `mark`。日后别人路过，场景卡的留痕段里有它。
- 【非西陲】热带海岛上用椰壳做水瓢。效果项都可表达，级别 `fact`。容量由椰壳的几何与材料物性聚合得出，品质读数由手艺与检定结果给出，再乘即兴修正 0.8（占位）。换成葫芦，同一提案得到另一组数。
- 【超自然】在泉眼旁垒一座小龛。级别 `fact`，产物是卷十九的微型龛祠类别。它灵不灵不由这次提案或任何叙述决定，由卷七的规则从供奉与信奉读出。

#### 4.15.6 验收断言

- 扫描式：A9-15.1 判级与即兴制作代码里材料类别、品质档名字面量数为 0（改前 3 个材料类别字面）；运行期代码写 `world/` 目录的调用点数为 0。
- 不变量式：A9-15.2 `landingOf` 对同一提案与状态结果恒定，且不随来路与档位变化；留痕写入前后除 `state.marks` 与事件外状态逐值相同；每条偏离行都带可追溯的 `basis`。
- 扩展性式：A9-15.3 新增一种材料行后，用它即兴制作得到事实级产物且物性不同；新增一个 `mark_kind` 条目后可对其 `onKinds` 里的实体留痕；都不改 .mjs。

### 4.16 学习回路

#### 4.16.1 维度

旁路里的学习记录（不在 state）：`{kind: learn_event, signature: list<代号>, sessionSeq: integer}`。封闭枚举 `learn_event`：`unmapped`（译不出）、`out_of_catalog`（判断层选了“都不是”）、`inexpressible`（提案表达不了）、`mark_landed`、`fact_landed`、`stage_rejected`。`rules.learn.candidateMinCount`。

#### 4.16.2 统一入口

写：只由输入边与 AI 边在旁路出口追加。读：只由线下作者工具（卷二十八 §4.7（作者工具））。规则层没有任何读写入口。

#### 4.16.3 规则

- **R9-16.1 学习记录在旁路**：它不在存档里，不进哈希，规则层读不到；删掉它世界不变。
- **R9-16.2 签名只由代号组成**：签名取（对象的实体类、手段的物品类别、所选的菜单组或效果族代号、不过的管线段与错误码）中适用的几项，按固定次序。玩家原文与模型文字不进学习记录。
- **R9-16.3 聚成候选**：线下工具按签名计数；次数不少于 `rules.learn.candidateMinCount` 的签名生成一张候选卡，内容是一条动作行、效果族行、`intent_form` 行或配方行的骨架。显示名可由 `draft` 用途起草。
- **R9-16.4 候选只经作者管线生效**：候选卡走与手写内容相同的校验与审批；合入之后才被加载。运行期没有自动改规则、自动加动作的路径。
- **R9-16.5 闭环可验**：一张候选卡合入后，造成它的那批签名在题集回放里应当不再落进 `unmapped` 或 `out_of_catalog`。
- **R9-16.6 计数只是整数相加**：没有比率进任何判定；阈值比较是整数比较。

#### 4.16.4 交互

卷二十八 §4.7（作者工具）、卷二十八 §4.5（离线校验）；卷十二 §4.6（扩展性与验收套件）（题集回放）；§4.15、§4.17、§4.18、§4.19。通道：无（不读写世界状态）。

#### 4.16.5 数据实例

- 【西陲】三十名玩家先后想“把湿衣服架在火边烤干”，都落进 `out_of_catalog`，签名（衣物类、热源类、无）累计 30 次，超过阈值 20（占位）。候选卡给出一条引用现有干燥效果族的动作行骨架；审批合入后，这件事出现在菜单里。
- 【非西陲】冰原上“用海豹油点灯”的即兴制作多次落成事实级产物，签名（油脂类、容器类、照明效果族）达到阈值，候选卡是一条配方行骨架。
- 【非人类】玩家屡次想让驯养的鸬鹚“把鱼吐进筐里”，签名的行动者实体类是鸟类；候选卡是一条以动物为行动者的动作行。学习回路不区分行动者是不是人。

#### 4.16.6 验收断言

- 扫描式：A9-16.1 规则层与内核对学习记录、候选卡文件的读写调用点数为 0；学习记录 schema 里文字类型字段数为 0。
- 不变量式：A9-16.2 开关学习记录、清空学习记录，对同一种子同一串意图的存档摘要没有影响；同一批旁路记录两次聚类得到相同的候选卡集合。
- 扩展性式：A9-16.3 一张候选卡经作者管线合入（只加数据）后，对应签名在题集回放中由 `unmapped` 或 `out_of_catalog` 变为可译成意图。

### 4.17 Jev 判断层

#### 4.17.1 维度

用途 `judge`；`rules.judge.minConfidencePermille`；`rules.ai.understandOrder`（list<ai_use>，元素只取 `judge`、`understand`）。题目结构：`{questionId: integer, options: list<代号 | 候选 id | 数值档>, noneIndex: integer, endIndex: integer nullable}`；答案结构：`{questionId, choice: integer, confidencePermille: integer [0,1000]}`。标题里的名字是现用的选择式判断模型的名字；规则里只说“选择式判断模型”，供应方与模型代号在运行配置里。

#### 4.17.2 统一入口

在 AI 边 `interpret` 的调用链内（卷二 §2.9（外部边界与 Text 模型）第 6 条“本轮原文的来路”）。题目由 `constructorTree()` 的输出生成；答案折成意图后与别的来路一样进 `route()`。

#### 4.17.3 规则

- **R9-17.1 只出选择题**：判断层只回答“在这些选项里选哪一个”。选项就是构造器此刻能点的那些：先选菜单组，再选动作，再逐槽位选候选，数值槽选档。答案是选项下标，折回代号；所以它交出的意图必在可表达集合 C 之内。
- **R9-17.2 每题必有“都不是”**：每道题的选项里有一个 `noneIndex`；分步题另有“没有下一步”的 `endIndex`。槽位题的“都不是”含义是“原话没提到”，此时该槽位留空，由菜单补问，不由判断层或引擎代填。
- **R9-17.3 把握不够就交回给人**：`confidencePermille` 低于 `rules.judge.minConfidencePermille` 的题视为 `ambiguous`，把这道题的选项原样作为菜单展示。把握值由 AI 边把模型给的概率折成千分整数后交出，规则只做整数比较。
- **R9-17.4 超出就走开放路径，不套近似动作**：菜单组一题选了“都不是”，即判为超出现有动作；接着按 R9-5.2 的表单出题（对象、效果族、手段、幅度档）。效果族一题仍是“都不是”，则 `menu_fallback` 并记一条 `out_of_catalog` 学习记录。任何一步都不把它映射到“最像的”普通动作。
- **R9-17.5 结果照常预览确认**：折成开放提案的，走 §4.4 的两阶段；折成普通意图的，走 `route()`。判断层不执行、不裁决、不写状态。
- **R9-17.6 与工具调用式理解的次序**：`judge` 与 `understand` 都允许时，先后次序取 `rules.ai.understandOrder`；前一个交出 `menu_fallback` 时才试后一个，交出 `ambiguous` 时不再试。
- **R9-17.7 守同一套约束**：判断层受 §4.14 的档位与超时、§4.18 的录制与费用、§4.19 的守门与重请约束；失败退到菜单。

#### 4.17.4 交互

卷二 §2.9（外部边界与 Text 模型）；§4.4、§4.5、§4.6、§4.14、§4.16、§4.18、§4.19。通道：无（不读写世界状态）。

#### 4.17.5 数据实例

- 【西陲】玩家键入一句想“把篱笆修一修再去喂鸡”的话。第一题两步各选菜单组：第一步选“修造”，第二步选“牲畜”；第二轮题在组内选动作与对象。对象题把握 640，低于阈值 700（占位）：这道题的三个候选原样成为菜单。
- 【非西陲】在红树林滩涂想“用退潮留下的水洼养几天活虾”。菜单组一题选“都不是”；开放表单里选对象（水洼）、效果族（保鲜类）、手段（无）、幅度档。预览后确认。
- 【超自然】想“对着铜镜问亡母一句话”。菜单组“都不是”，效果族也“都不是”：`menu_fallback`，学习记录签名（镜类、无、无）。两档下都没有这件事可做，直到有人登记了相应的效果族。

#### 4.17.6 验收断言

- 扫描式：A9-17.1 判断层代码里供应方名、模型代号、手写意图名单的字面量数为 0；题目生成代码不经 `constructorTree()` 自拼选项的位置数为 0。
- 不变量式：A9-17.2 判断层交出的每个意图都通过 `shape` 段；任一题选“都不是”时结果从不是一个普通动作意图（除非该题是槽位题）；关闭判断层后同一串点选的结果不变。
- 扩展性式：A9-17.3 新增动作行、效果族行后，判断层的题目选项自动包含它们；更换供应方只改运行配置。

### 4.18 录制回放与费用账

#### 4.18.1 维度

旁路记录（每次模型调用一行，不在 state）：`{responseId: integer, use: ai_use, attempt: integer, tier: ai_tier, schemaId: 代号, inputTokens: integer, outputTokens: integer, latencyMs: integer, result: ai_fail | ok, rejects: list<reject_code>}`。录制文件另存每次调用的请求体与响应体原样字节。费用账：每种用途的 `inputTokens`、`outputTokens` 累计（整数相加）。`rules.ai.budgetTokens`。

#### 4.18.2 统一入口

写：只由 AI 边的登记数据出口。读：`replaySource(key)`（回放时替换模型出口）与线下工具。规则层与内核没有入口。

#### 4.18.3 规则

- **R9-18.1 旁路不是状态**：旁路记录、录制文件、费用账都不在存档里，不进哈希，规则层与内核读不到。
- **R9-18.2 键**：一次模型调用的键是（`responseId`、`use`、`attempt`）。`responseId` 是内核给每个响应发的单调整数（卷二 §2.9（外部边界与 Text 模型）第 0 条）。这个键只在旁路里用，不得成为任何骰值键、事件 id、实体 id 的成分（卷二十七 §4.8（种子键与骰值键（确定性约束与验收）））。
- **R9-18.3 回放**：回放模式下，AI 边的模型出口换成按键读录制文件；读不到的键按 `offline` 处理。读到的响应照常过守门、校验与审查。所以用同一份录制回放同一串请求，文字路径的内容与原跑相同，存档摘要相同。卷二十七的复演核对不调模型，直接用存档里已有的封存文字。
- **R9-18.4 费用与预算**：费用账只存 token 数。折成钱是线下工具用价目配置在读时算，不落任何存储。本次会话某用途累计 token 数达到 `rules.ai.budgetTokens` 中该用途的值，即该用途本次会话停用，失败原因 `budget`；缺键即不设上限，值为 0 即始终停用。
- **R9-18.5 延迟只进旁路**：`latencyMs` 由内核调度器注入的计时能力量出，只写进旁路记录；它不是熵源，不流入规则层与内核。
- **R9-18.6 原文只在本机**：录制文件含玩家原文与模型文字，只留在本机；学习记录与对外的统计只带代号与计数。
- **R9-18.7 验收用录制**：真实模型试玩与题集归卷十二 §4.6（扩展性与验收套件）；它们以录制文件为输入，可离线重跑。

#### 4.18.4 交互

卷二 §2.9（外部边界与 Text 模型）（`responseId`、数据出口、计时能力）；卷二十七 §4.7（复演与规则只一版）、卷二十七 §4.8（种子键与骰值键（确定性约束与验收））；卷十二 §4.6（扩展性与验收套件）；§4.14、§4.16。通道：无（不读写世界状态）。

#### 4.18.5 数据实例

- 【西陲】一局 40 回合的 `t2` 试玩，录制 40 次 `narrate`、40 次 `validate`、12 次 `understand`。离线回放：92 个键全部读到（`40 + 40 + 12 = 92`），存档摘要与原跑相同。
- 【非西陲】在群岛航线的一局里把 `narrate` 的预算设为 20000。第 31 回合累计 19400，第 32 回合用掉 900 后为 20300，不小于 20000：自第 33 回合起 `narrate` 以 `budget` 停用，改走模板。`19400 + 900 = 20300`。
- 【非人类】回放一段与狼群头狼的对峙：录制里缺第 7 回合的 `narrate`（当时超时）。回放时该键读不到，按 `offline` 走模板，与原跑一致。

#### 4.18.6 验收断言

- 扫描式：A9-18.1 规则层与内核读旁路记录、录制文件、费用账的调用点数为 0（S9-6）；骰值键、事件 id、实体 id 的成分表达式里出现 `responseId` 的次数为 0。
- 不变量式：A9-18.2 用同一份录制回放两次，存档摘要相同；开关录制不改变存档摘要；费用账各项恒等于旁路记录逐行之和。
- 扩展性式：A9-18.3 新增一种 `ai_use`（改本卷枚举与用途表）后，录制、回放、预算对它自动生效，旁路记录结构不变。

### 4.19 输入边译码器与入库前守门

#### 4.19.1 维度

`decode_result`、`reject_code`、`intent_slot`、`request_kind`、`channel`（§2.1）；`rules.gate.retryLimit`、`rules.gate.maxTextCodePoints`；`rules.gate.categoryMap`（map<blocklist_category 代号, reject_code>，缺键取 `reject:blocklist`）；`rules.gate.verdictMap`（map<validator_verdict, reject_code nullable>）。通用槽位（路由与译码层共用，封闭）：

| 槽位 | 值类型 | 来自 |
|---|---|---|
| `actionId` | 动作代号 | 菜单候选 |
| `targetRef` | EntityId | 槽位候选 |
| `scope`、`relation` | `target_filter` 代号 | 族内 |
| `kind` | `request_kind` | 封闭 |
| `channel` | `channel` | 界面开关，不从文字里译 |
| `wait` | integer:minute，≥ 1 | 数值 |
| `focus` | list<`focus` 代号> | 族内 |
| `respondents`、`mentions` | list<EntityId> | 在场与已知候选 |
| `dims` | list<维度代号> | 登记维度 |
| `when` | struct{day: integer, anchor: 历法锚代号} | 历法表 |
| `qty` | integer ≥ 1 | 数值 |
| `nameSlot` | 命名槽代号 | 动作行声明；名字文字不在意图里 |

动作专有槽位不进这张表：它们由动作行的 `slots` 声明（例如卷三乙 §4.8（配方通用规则（继承、产率、递归））给制作动作登记的 `choices`、`batch`、`care`、`emphasis`），译码器按动作行读取。

#### 4.19.2 统一入口

输入边（`server-plugin/input/**`，文件数与 import 权限归卷二 §2.7（系统声明表 `state-owners.json`））：`decode()` 把键入文字变成 `decode_result`。AI 边（aiGate 组）：`interpret`、`narrate`、`narrateTurn` 三个入口内的守门链。两处都不属规则层；规则层不得 import 它们。它们交给规则层的只有 §2.4 的代号结构与本节的代号。

#### 4.19.3 规则

- **R9-19.1 不开模型的译码**：键入文字只做卷二 §1.9（代号、显示名与语言边界）第 3 条的规范化，然后在当前菜单层的“显示名到代号”“编号到代号”两张冻结表里整串查。查到一项即该项；两项折叠后相同即 `ambiguous`；查不到即 `menu_fallback` 并展示完整菜单。没有别名、部分匹配、关键词。
- **R9-19.2 开模型的译码**：输入边把本轮原文与候选集（构造器树的代号）交 AI 边的 `interpret`，取回按 `schema:input-edge-v1` 收窄的结果：意图列表、`ambiguous` 或 `menu_fallback`。结果里的每个 id 与代号必须在候选集内，否则整个结果按 `menu_fallback` 处理。
- **R9-19.3 不猜、不填默认**：必填槽位译不出时，结果是 `ambiguous` 并指明缺的槽位代号，由菜单补这一步。译码器不替玩家选“最可能的”。
- **R9-19.4 名字到 id 只在这里**：把一个名字对到实体 id，只发生在输入边（整串查显示名）或模型从候选 id 里选。规则层任何地方都不比较名字。
- **R9-19.5 入库前守门的检查链**：模型的每一份输出按固定次序过六步，任一步不过即给出拒收代号并停止。① 按封闭 schema 收窄：结构不合为 `reject:schema`；代号或 id 不在登记表与候选集内为 `reject:unknown_entity`；数值越界、文字字段码点数超过 `rules.gate.maxTextCodePoints`、字符不在码点范围表内为 `reject:range`。② 引文同一性（卷二 §2.9（外部边界与 Text 模型）第 6 条）：不符为 `reject:quote_mismatch`。③ id 泄漏（同条的代号登记表比对）：命中为 `reject:id_leak`。④ 屏蔽词（同条的唯一匹配实现，词表数据归卷二十九 §4.1（显示层隔离契约））：命中段的类别经 `rules.gate.categoryMap` 折成拒收代号。⑤ 第二校验器的裁定经 `rules.gate.verdictMap` 折成拒收代号（未标记专名折为 `reject:unknown_entity`，未成年人亲密情节折为 `reject:minor_romance`，被注入内容带偏折为 `reject:injection`）。⑥ 位置引用：声明、问题清单、引用里的区间须落在文字长度内、所引来源 id 已登记，否则 `reject:range`。六步都过，文字才按卷二 §2.9（外部边界与 Text 模型）第 3 条入库，结构化部分才交规则层做 §4.9、§4.11 的校验。
- **R9-19.6 重请只有一个计数**：同一次生成请求内，守门的各种拒收与规则层的作废（E-TURN-UNMAPPED、E-CLAIM-SCHEMA、审查不符）共用一个计数，上限 `rules.gate.retryLimit`；卷一 §3（硬规矩条文）R-2 第 10 条把它限在不超过 1。用尽即 E-GATE-RETRY：叙述改用模板，译码退回菜单，起名不写入。重请不放宽任何一步。
- **R9-19.7 被拒的内容三不**：不入库，不进哈希，不进后续提示。旁路里只留拒收代号与位置。
- **R9-19.8 注入防线**：做法只按卷二 §2.9（外部边界与 Text 模型）第 0 条“注入防线与剥离口径”——隔离、输出封闭、照常筛查，不读玩家文字做判断。`reject:injection` 只来自第二校验器的裁定。规则可读的状态里没有自由文字，检索不拿文字作键，所以“把指令藏进记忆”没有落点。
- **R9-19.9 未成年人保护的文字半边**：屏蔽词表里未成年内容类别的命中，与第二校验器的相应裁定，都折成 `reject:minor_romance`；数值半边在 R9-8.5。两半各自独立生效。
- **R9-19.10 第二校验器**：它是与叙述请求分开的另一次模型请求（用途 `validate`），读叙述文字与其中的实体标记，只输出 `validator_verdict` 列表（带码点区间，知情类带事实 id）。它在 AI 边；规则层只见代号。
- **R9-19.11 玩家起名与手记**：流程归卷二 §2.9（外部边界与 Text 模型）第 3 条；本卷只定意图里带的是 `nameSlot` 代号，守门不过时用同一套拒收代号。
- **R9-19.12 可以整体拔掉**：删去输入边目录后，菜单路由、构造器、`narrate` 入口都不受影响；目录里每个动作仍可由菜单到达（I9-1）。
- **R9-19.13 两种语言对等**：译码器与守门没有按语言分叉的代码；差别只在语言包与词表数据。

#### 4.19.4 交互

卷一 §2.9.2（安全两道闸：AI 输出边守门 + 显示闸（L-13））、卷一 §2.10（输入边（不是层；可整体拔除））；卷二 §1.9（代号、显示名与语言边界）、卷二 §2.7（系统声明表 `state-owners.json`）、卷二 §2.9（外部边界与 Text 模型）；卷二十九 §4.1（显示层隔离契约）（词表数据）、卷二十九 §4.7（前端适配器与输出守门）；卷四 §4.9（身份键、化名、认出）；卷二十 §4.2（历法数据与周期日规则格式）（时间槽的锚代号）；卷二十二 §4.1（主观视图四域与检索键）；卷十二（扫描与性质测试）；§4.5、§4.6、§4.9、§4.11、§4.17。通道：无（只向规则层交代号结构）。

#### 4.19.5 数据实例

- 【西陲】不开模型，菜单当前层有“1 买”“2 卖”“3 离开”。键入 `2` 查编号表得“卖”的代号；键入与显示名逐码点相同的两个字得同一代号；键入一整句想卖东西的话，查不到，`menu_fallback`，菜单原样再列一遍。
- 【非西陲】英文语言包下在北方港口键入首字母大小写不同的 `buy`：规范化的大小写折叠后与显示名相同，查到。键入 `buy fish` 查不到，退回菜单。两种语言走同一段代码。
- 【超自然】`t2` 下模型的叙述里写了一位登记表里没有的“河伯”的名号，未加实体标记。第二校验器裁定 `unmarked_name`，折成 `reject:unknown_entity`；重请一次仍如此，E-GATE-RETRY，本回合显示模板叙述。那段文字没有入库，下一回合的提示里也没有它。

#### 4.19.6 验收断言

- 扫描式：A9-19.1 输入边目录内卷二 §2.8（字符串类型规则）该组闭集之外的字串用法数为 0，文件数不超过卷二规定的上限；`reject_code` 枚举之外的拒收代号字面量数为 0；规则层 import 输入边或 AI 边的行数为 0（S9-5）。
- 不变量式：A9-19.2 删去输入边目录后，目录全部动作行仍可经菜单路由提交并结算；被拒的输出前后存档摘要相同、后续提示里不含它；同一次生成请求的重请次数不超过 `rules.gate.retryLimit`；互换中英文语言包，同一串点选的存档摘要相同。
- 扩展性式：A9-19.3 在屏蔽词类别族加一个类别并在 `rules.gate.categoryMap` 加一行，守门即按新类别给出对应拒收代号；新增一个菜单项后键入其显示名或编号即可译出，都不改 .mjs。

---

## §5 系统间接口总表

### 5.1 本卷提供

| 入口或表 | 形态 | 使用方 | 对方怎样用 |
|---|---|---|---|
| 动作行 `action` | 行表 | 全部领域卷 | 登记行；不写处理器 |
| `resolve()` | 写入口 | 全书 | 一切动作结算只经它 |
| `execute()` 与原语目录 | 写入口 | 效果族行、推进钩子的调度方 | 输出清单交它执行 |
| `check()`、`degree` | 读入口、枚举 | 卷十三、卷十四、卷十五、卷二十一、卷八b | 不另写骰法 |
| `difficulty_row`、`cap_row`、`cost_row` | 行表 | 各领域卷 | 登记行 |
| `consent()`、`authority()`；`consent_clause`、`authority_source` | 读入口、行表 | 卷十五、卷八b、卷八、卷十八、卷二十一、卷五 | 调入口；登记行 |
| `activityOf()`、`agendaOf()` | 读入口 | 卷十四、卷二十六、卷二十二、卷二十九 | 读“在做什么” |
| `affordances()`、`constructorTree()` | 投影 | 卷二十九 | 渲染菜单 |
| `sceneCard()`；`scene_section`、`focus` | 投影、行表 | 卷二十九、各领域卷 | 渲染；登记段 |
| `claim_kind`、`evidence_row` | 族、行表 | 各领域卷、卷二十八 | 登记行 |
| `npcDecision()`、`npcChoose()`；`candidate_provider`；`decision_card` | 读入口、行表、族 | 卷八、卷八b、卷六、卷十三、卷十四、卷十八、卷二十六 | 调入口；登记候选 |
| `dialogue_move`、`dialogueView()` | 行表、读入口 | 卷十八、卷十三 | 登记对话动作 |
| `controlledByPlayer()` | 谓词 | 卷二十七 | 观察锚 |
| `reject_code`、`validator_verdict`、`decode_result`、通用槽位表 | 枚举 | 卷一、卷二、卷二十九、卷十二 | 读代号 |
| `ai_tier`、`ai_use` | 枚举 | 卷二十七、卷二十八、卷十二 | 读代号 |

### 5.2 本卷读取

| 卷 | 读什么 | 用在 |
|---|---|---|
| 卷二 | `can()`、需求块求值、`effects()`、求值管线、回应通道、守门实现、定时与计时能力 | §4.1–§4.3、§4.7、§4.9、§4.14、§4.18、§4.19 |
| 卷三乙 | 材料聚合读数、品质档入口、工具能力读数、配方行 | §4.4、§4.7、§4.15 |
| 卷四 | 年龄与成年谓词、身份键 | §4.8、§4.19 |
| 卷五 | 进入权与在场集合 | §4.8、§4.9 |
| 卷六 | 账本余额与转移、估值入口、合同与义务 | §4.2、§4.7、§4.11–§4.13 |
| 卷七 | `evaluationOf()` | §4.12 |
| 卷八 | 职位权能与辖区 | §4.8 |
| 卷八b | `legalityOf()`、`disposalRight()`、`noteFact()`、法律门控需求块 | §4.3、§4.8、§4.12 |
| 卷十三 | 对抗行、威慑量来源行 | §4.3、§4.13 |
| 卷十四 | `skillValue()`、`gainSkill()` | §4.3、§4.2 |
| 卷十五 | 施法同意条款行、效果族行 | §4.8、§4.7 |
| 卷十八 | 持有种类表与转移协议、`stance()`、`dread()`、`treatment()`、`recall()`、`intimateEligible()`、`intimateAllowed()`、监护边、谎言登记 | §4.8、§4.11–§4.13 |
| 卷十九 | `facilityView().type` | §4.3、§4.7 |
| 卷二十 | 调度器到期项、历法表 | §4.1、§4.4、§4.5、§4.12、§4.13 |
| 卷二十一 | 身体类状态实例 | §4.7 |
| 卷二十二 | 主观视图、已知集合、检索键、秘密 | §4.10–§4.13 |
| 卷二十六 | `driveWeight`、`decisionJitter()`、`preferenceOf()`、`needSatisfiers()`、需求阈值到期项 | §4.12 |
| 卷二十七 | `degradeLevelOf()`、`simTierOf()`、骰值键五段、确定性 id 派生 | §4.1、§4.3、§4.12、§4.14 |
| 卷二十九 | 语言包显示名表、模板、词表数据 | §4.5、§4.10、§4.19 |

### 5.3 需要别卷配合的项

| # | 对方 | 请对方做什么 | 本卷依据 |
|---|---|---|---|
| 1 | 卷二 | 把 `records.*.text` 的四样登记与对应的 AI 边文件删去（卷二 §2.9 第 0 条已写明“卷九判定不需要时一并删”） | R9-9.9 |
| 2 | 卷二 | 登记五个过程主体槽（§2.6）；收尾时汇总本卷的词表族、前缀与封闭枚举；`schema:input-edge-v1` 的意图形态按 §2.4 | §2.1、§2.4、§2.6 |
| 3 | 卷二 | 给 AI 边登记一个计时能力（量延迟）与旁路记录的数据出口；确认 AI 边可经登记接口读 `degradeLevelOf` | R9-14.3、R9-18.5；卷二十七 §8 第 16 条 |
| 4 | 卷十八 | 在持有种类表登记两行：同意边（属性 `scope`、`object`）、操控边（玩家单例到受操控实体） | R9-3.9、§4.8 |
| 5 | 卷二十七 | 观察锚改读操控边；确认 `responseId` 不在任何键成分里 | R9-3.9、R9-18.2；卷二十七 §8 第 7 条 |
| 6 | 卷二十六 | 把需求阈值越线登记为到期项以触发 `npcChoose`；它交来的底线迁移行本卷在 §7 收下 | R9-12.7、M9-14 |
| 7 | 卷七 | 评价行的读数里给出可与 `rules.npc.redLineSeverity` 比较的严重度 | R9-12.2 |
| 8 | 卷三乙 | 品质档入口接受检定结果与制作槽位；其 §8 Q-09 的四个槽位按“动作专有槽位”由制作动作行声明 | R9-4.4、§4.19.1 |
| 9 | 卷八b | `noteFact` 接收本管线善后段交来的事件；法律门控写成动作行的需求块 | R9-3.10 |
| 10 | 卷十四 | 确认 `gainSkill` 的会话参数可由 `learn` 原语原样转交 | R9-2.8 |
| 11 | 卷十三、卷十五、卷二十一及各领域卷 | 把现有 26 处难度数字迁成 `difficulty_row`；为各自的效果族登记 `cap_row`；登记声明种类、场景卡段、候选提供者、权能来源、条款行 | §4.7、§4.8、§4.10–§4.12 |
| 12 | 卷零 | 守门代号集增 `reject:schema`、`reject:range`；第二校验器裁定增 `minor_romance`、`injection`、`clean` | §2.1 |
| 13 | 卷一 | §7 的档位与角色对照里，`t3` 不再含“模型替 NPC 规划”与“模型写人物档”两种运行期用途 | R9-14.8 |
| 14 | 卷十二 | 实现 S9-1 至 S9-9 与各节断言；V-21、V-23、V-26、V-29 的判据取本卷 §4.5、§4.19 | §3.5、§6 |
| 15 | 卷二十八、卷二十九 | 作者工具读学习记录与候选卡；显示层按决定卡代号出模板对白，前端提供 `channel` 开关与结构化上行 | §4.16、§4.5、§4.9 |

---

## §6 扩展性测试

| # | 只加什么数据 | 预期 | 对应断言 |
|---|---|---|---|
| X9-1 | 一条动作行（含阶段、检定、效果、菜单位置） | 出现在菜单、可结算、NPC 可选 | A9-1.3、A9-3.3、A9-12.3 |
| X9-2 | 一条效果族行加上限行 | 可被动作行与开放提案引用；幅度受限 | A9-2.3、A9-4.3、A9-7.3 |
| X9-3 | 一种新材料行 | 即兴制作产物物性随之不同 | A9-15.3 |
| X9-4 | 一个同意范围、一条条款行、一条权能来源行 | 相应动作的同意与权能随之生效 | A9-8.3 |
| X9-5 | 一条场景卡段与一个焦点条目 | 菜单缺省与焦点槽位都取得到 | A9-10.3 |
| X9-6 | 一个声明种类与一条证据行 | 审查即核对该种类 | A9-11.3 |
| X9-7 | 一条候选提供者行 | NPC 在效用更高时选它 | A9-12.3 |
| X9-8 | 一条对话动作行与转移行 | 可点出并按表转移 | A9-13.3 |
| X9-9 | 一个非人类物种行动者（只有物种行与身体图） | 同一目录、同一管线可用，无新代码 | A9-1.3、A9-3.3 |
| X9-10 | 第三种语言包 | 菜单、译码、守门都可用；存档摘要与语言无关 | A9-19.2 |

**可表达集合的覆盖核对**（卷一 §7（AI 的位置）第 7.1 条第 2 款）：对题集里每个意图，按卷一 §7（AI 的位置）第 7.3 条所引的分类函数判 K1 至 K5，再核三条。① 判为 K1、K2 的，构造器能点出同一个意图（A9-5.2）。② K3 的论据以 `mentions`、`dims` 槽位表达。③ K4 中起名、立碑类以命名槽与留痕表达，其余进缺口清单；缺口清单里不得有必经动作。K5 在两档下都得到“拒绝、原因、替代”（R9-3.3）。分类函数各类的精确定义与必经动作清单见待补清单第 1、2 条。

不变量总表（跨节）：

- **I9-1** 目录每一行都有菜单位置，且拔掉输入边后仍可由菜单到达。
- **I9-2** 一切动作引起的写入都在某次 `resolve()` 的提交段或善后段之内。
- **I9-3** 管线九段、审查、决策、对话、落地判定都不读文字、不读来路、不读档位、不读墙钟、不读事件日志。
- **I9-4** 同一种子、同一串意图：四种来路、四个档位、任意分段推进，事件流与文字路径之外的状态逐值相同。
- **I9-5** 模型的任何输出至多改变文字路径；被拒的输出什么也不改变。

---

## §7 迁移与退役清单（交卷十一）

| # | 位置 | 现状 | 改法 | 本卷依据 |
|---|---|---|---|---|
| M9-1 | 登记动作 337 条旧处理器外壳；action-affordances.mjs:310 | 外壳加处理器；活动与状态文字拼测 | 逐条改为 §2.2 数据行，处理器删除；可用性只读谓词单入口 | R9-1.1、R9-1.2 |
| M9-2 | legacy-primitives.mjs:1、legacy-primitives.mjs:181 | 旧处理器仍是写者；按睡眠文字判活动 | 文件退役；睡眠是状态容器 | R9-2.4、R9-1.3 |
| M9-3 | primitives-effects.mjs:294 | 用文字正则判练、教、演 | `learn` 原语参数改代号 | R9-2.5、R9-2.8 |
| M9-4 | action-limits.mjs:247–289、action-limits.mjs:267–283、action-limits.mjs:15、action-limits.mjs:54 | 只为 9 类派生上限；即兴制作只认三种材料字面；材料抗性表硬编码 | 上限改读 `cap_row`；覆盖做成加载校验；品质走卷三乙入口 | R9-7.3、R9-7.5、R9-15.3 |
| M9-5 | 难度数字 26 处（06a §8） | 写在动作与代码里 | 迁成 `difficulty_row`，由各领域卷登记 | R9-7.1 |
| M9-6 | activities.mjs:176、activities.mjs:208、activities.mjs:232、activities.mjs:241、activities.mjs:297、activities.mjs:257、activities.mjs:293 | 退让阈值写死；项目阶段用中文；职位名字面；按报错文字判断 | 阈值进规则表经 `interruptRX`；阶段用 `act_stage`；权能走 `authority()`；只比错误码 | R9-1.5、R9-1.6、R9-8.6 |
| M9-7 | npc-autonomy.mjs:61、npc-autonomy.mjs:176、npc-autonomy.mjs:48、npc-autonomy.mjs:50、npc-autonomy.mjs:89 | 自治旁路直写；按目标内容文字匹配 | 一律交 `resolve()`；候选改数据行 | R9-12.10、R9-12.7 |
| M9-8 | npc-decision.mjs:13、npc-decision.mjs:25、npc-decision.mjs:14、npc-decision.mjs:11 | 读记忆正文；按活动文字判忙；代价截成非负；底线文字包含判断 | 读记忆条数与事件类别代号；判忙用谓词与 `activityOf()`；代价保留正负；底线读评价行 | R9-12.2–R9-12.4、R9-12.8 |
| M9-9 | action-router.mjs:75、action-router.mjs:123、action-router.mjs:262、action-router.mjs:263、action-router.mjs:421、action-router.mjs:678 | 解析玩家原话 | 删除；按签名分发与筛选式指代 | R9-6.1、R9-6.3、R9-19.1 |
| M9-10 | action-constructor.mjs:34、action-constructor.mjs:38；action-time.mjs:15、action-time.mjs:23；action-registry.mjs:139 | 子串命中；去客套话；时间词最长匹配；工具字段打分 | 删除；构造器只收代号；时间槽交结构 | R9-5.1、R9-5.5 |
| M9-11 | retrieval-lexicon.mjs:19、retrieval-lexicon.mjs:31、retrieval-lexicon.mjs:33；npc-memory.mjs:205 | 注入正则；规范化与同义词；替换词再检索 | 注入防线归 AI 边；检索只按键 | R9-19.8、R9-10.7 |
| M9-12 | scene-card.mjs:109、scene-card.mjs:113、scene-card.mjs:133、scene-card.mjs:95；action-text.mjs:99；chronicle.mjs:50 | 按问话正则塞段；状态用中文字面比较 | 段登记加 `focus` 代号；状态比代号 | R9-10.1、R9-10.2、R9-10.5 |
| M9-13 | consistency-review.mjs（卷零 §3.5.3 逐行 60 余处）、consistency-service.mjs（19 处）、consistency-evidence.mjs:161、consistency-evidence.mjs:162、consistency-evidence.mjs:165、consistency-evidence.mjs:197、consistency-evidence.mjs:201 | 全文正则读叙述；读玩家原文；读屏蔽词表 | 只核结构化声明；屏蔽词与名字解析迁守门与输入边；引文改位置引用 | R9-11.1–R9-11.10、R9-19.5 |
| M9-14 | 人物档 `redLines` 数组（卷二十六 §7 交来，275 处） | 底线是文字 | 改由评价行与价值有效值算出 | R9-12.2 |
| M9-15 | extension/turn.mjs:30–41、extension/turn.mjs:97、extension/turn.mjs:104–111；extension/prompt.mjs:37；engine.mjs:397 | 正文尾注解析、默认值、场外前缀正则、数值 0 兼作标志 | 结构化 `turn` 与 `channel`；`timing` 显式代号；无默认值 | R9-9.3–R9-9.8 |
| M9-16 | action-consent.mjs:10、action-consent.mjs:128；action-authority.mjs、action-authority-sources.mjs | 用文字判亲密；比用途文字；权能读法分散 | 合成 `consent()`、`authority()` 两个入口；比代号 | R9-8.1–R9-8.9 |
| M9-17 | population.mjs:407、population.mjs:409（文字半边） | 生成时用正则与词表拒收 | 迁入库前守门；数值半边留规则层 | R9-19.5、R9-19.9、R9-8.5 |
| M9-18 | ai-profile.mjs:4 | 用途表写在代码里，含模型替 NPC 规划与写人物档 | 改读 `rules.ai.tierUses`，移到 AI 边；两种用途取消 | R9-14.2、R9-14.8 |
| M9-19 | sideband.mjs | 旁路记录自取墙钟 | 计时改用注入的能力；键用 `responseId` | R9-18.2、R9-18.5 |
| M9-20 | world/rules/tables/open-actions.json、balance/action-costs.json、world/rules/open-reactions.json、open-tagging.json | 开放动作上限表、动作成本表、开放反应与标注 | 分别并入 `cap_row`、`cost_row`、留痕反应规则；标注表按代号重写或退役 | R9-7.3、R9-7.7、R9-15.2 |
| M9-21 | world/templates/dialogue/common/plain/*.json（8 个）；intentForms 1 条 | 模板对白与形式模板数量少 | 模板归卷二十九按决定卡代号补齐；形式模板迁 `intent_form` | R9-5.4、R9-5.7 |

对应 06a、06b 行：06a §8（难度数字）、06a §6（本地清醒判断与睡眠正则）；06b 待定 1 的 74 行（卷零已扩为 146 处）、06b A 类 action-affordances:310、action-limits:54、legacy-primitives:181、npc-autonomy:48/89、npc-decision:25、primitives-effects:294，E 类 npc-decision:13、npc-autonomy:50，F 类 activities:293。

---

## §8 开放问题

| # | 问题 | 本卷暂按 | 谁定 |
|---|---|---|---|
| 1 | `t3` 的含义改了：取消运行期“模型替 NPC 规划”“模型写人物档”，改为 `judge`、`draft` | 按卷一 §7（AI 的位置）第 7.1 条第 4 款写；涉及已有玩家可见的档位说明 | 李白 |
| 2 | 运行期不保留 AI 记录文字（R9-9.9） | 按删除写 | 李白；卷二 |
| 3 | `power` 族的条目归属：台账没有这一行 | 格式归卷二，条目由持有该权能来源的领域卷登记 | 台账 |
| 4 | 冷却、持续、到期的统一登记（台账 S-07） | 冷却落成带时限的状态容器实例（R9-7.8） | 卷二、卷二十 |
| 5 | 同一行动者同一刻同一动作同一对象禁止重复提交（R9-3.8）是否过严（如同一刻对同一人说两句话） | 对话动作以会话轮次推进世界分钟来区分；若仍不够，由卷二十与卷二给出同刻区分成分 | 卷二十、卷二 |
| 6 | 审查的 `history` 一类声明要求定义卷有可读的累计量；没有的种类只能降为自报 | 首批表里先按 `ledger` 写，待各卷认领 | 各领域卷 |
| 7 | 选择式判断层的供应方条款、原文外发是否可接受、验收阈值 | 规则不依赖具体供应方；阈值待标定 | 李白 |
| 8 | 活动中断时预留物“按进度部分退还”未提供 | 只有整笔退还或没收两种 | 卷三乙、卷六如有需要再议 |
| 9 | 第二校验器的成本：每次叙述多一次请求 | `narrate` 必须与 `validate` 同档（R9-14.2） | 李白（涉及费用） |
| 10 | 术语“声明”与卷八的头衔宣称同词（台账 X-25） | 本卷只用“叙述声明”“声明种类”，代号前缀 `ck_` | 已按台账 |

---

## 附 术语与代号表

| 术语 | 代号或入口 | 定义处 |
|---|---|---|
| 意图 | `Intent` | §2.4 |
| 动作行 | `action`，前缀 `act_` | §2.2 |
| 当前活动 | `state.activities`、`activityOf()` | §4.1 |
| 原语 | `primitives.json` 19 个 | §4.2 |
| 统一裁决 | `resolve()`、`resolve_stage` | §4.3 |
| 检定、成功度 | `check()`、`degree` | §4.3 |
| 开放提案 | `state.proposals`、`preview()`、`confirm()` | §4.4 |
| 构造器、可表达集合 | `constructorTree()`、C | §4.5 |
| 难度行、上限行、代价行 | `difficulty_row`、`cap_row`、`cost_row` | §4.7 |
| 同意、权能 | `consent()`、`authority()` | §4.8 |
| 回合、分段 | `turn`、`segments` | §4.9 |
| 场景卡、焦点 | `sceneCard()`、`scene_section`、`focus` | §4.10 |
| 叙述声明、声明种类 | `claims`、`claim_kind`（前缀 `ck_`） | §4.11 |
| 决定、决定卡 | `Decision`、`decision_card`（前缀 `dcard_`） | §4.12 |
| 对话会话 | `state.dialogues`、`dialogue_move` | §4.13 |
| 档位、用途 | `ai_tier`、`ai_use` | §4.14 |
| 落地级别、留痕 | `landing_level`、`state.marks` | §4.15 |
| 学习记录 | `learn_event` | §4.16 |
| 选择式判断 | 用途 `judge` | §4.17 |
| 旁路记录、录制、费用账 | §4.18.1 的结构 | §4.18 |
| 译码结果、拒收代号、通用槽位 | `decode_result`、`reject_code`、`intent_slot` | §4.19 |

首批词表条目（占位，定稿时由登记卷补 `labels`）：`acls_heavy_labor`、`acls_light_labor`、`acls_dive`、`acls_talk`、`acls_travel`、`acls_rest`；`tf_owned`、`tf_adjacent`、`tf_present`、`tf_known`、`tf_hostile`、`tf_friendly`；`cscope_medical`、`cscope_entry`、`cscope_use_item`、`cscope_intimate`、`cscope_spell`；`dcard_agree`、`dcard_refuse`、`dcard_defer`、`dcard_conditional`、`dcard_counter`、`dcard_answer`。

## 附录 待补清单

需要查证或由别处给出的内容，本卷没有凭记忆填。

| # | 待补内容 | 用在 | 交谁 |
|---|---|---|---|
| 1 | 待查（交 Opus）：K1 至 K5 五类的精确定义与分类函数的输入（AI-00 §6B） | §6 覆盖核对 | Opus 查 AI-00 |
| 2 | 待查（交 Opus）：必经动作清单 P-01 至 P-12 的逐条内容（AI-05 §7.1） | §6 覆盖核对 | Opus 查 AI-05 |
| 3 | 待查（交 Opus）：现役 19 个原语各自的参数契约字段（primitive-schema.mjs） | §4.2.1 契约表定稿 | Opus 读代码 |
| 4 | 待查（交 Opus）：卷零 §3.5 中接手方为卷九的各行逐行对到 M9 条目的对照表（146 处中的归属数） | §7 | Opus 对卷零 |
| 5 | 待查（交 Opus）：选择式判断模型的计价口径（输出 token 是否另计）与单题选项数上限 | §4.17、§4.18 | Opus 查供应方文档 |
| 6 | 待标定：`rules.check.rollDist` 的分布与 `degreeBands` 四个界 | R9-3.5 | 标定批 |
| 7 | 待标定：`rules.npc.utilityWeights` 六项与 `redLineSeverity`、`switchMargin` | R9-12.2、R9-12.4、R9-12.7 | 标定批 |
| 8 | 待标定：`rules.scene.promptBudget`、`staticBudget`（现测静态提示约一万零五百，口径是 token，需换算成码点） | R9-10.4 | 标定批；换算交 Opus |
| 9 | 待标定：`rules.ai.timeoutMs`、`budgetTokens`、`degradeMap` 各行 | §4.14、§4.18 | 标定批 |
| 10 | 待查（交 Opus）：卷十三 §4.1、§4.18，卷十五 §4.1、§4.4，卷二十二 §4.1、§4.7，卷二十八 §4.5、§4.7，卷二十九 §4.1–§4.3、§4.7，卷十二 §4.6 尚未成稿，引用的标题按台账写，成稿后对齐 | 全卷引用 | Opus 收尾 |

## 附录 自检脚本输出

脚本 `F:/dnd-tmp/vols/check-卷九.mjs`（只读本卷成稿）与 `F:/dnd-tmp/vols/run-book-卷九.mjs`（跑四个全书脚本，输出写 `F:/dnd-tmp/book/out/v9-*`，只摘本卷行）。

```
PASS 1 章节 §0–§8、术语表、待补清单齐全
PASS 1b 卷首署名行
PASS 1c 没有残留的续写标记
PASS 2 十九个子系统各六小节齐全
PASS 3 数据实例至少三条，含非西陲、含非人类或超自然
PASS 4 验收断言三式齐全且有编号
PASS 5 规则与正文无具体 id 字面量
PASS 6 无用于判断的描述性文本
PASS 7 台账各概念写全（标题、关键代号、每节有规则且编号连续）
PASS 8 跨卷引用带标题；规则与断言编号引用不悬空
PASS 9 json 代码块可解析（1 块） — bad=0
PASS 10 红线：不读墙钟、除数有下界或为 0 分支、存法与去留登记、不读事件日志
PASS 11 数据实例算术与余数结转复算（21 项加 5 组余数）
PASS 12 接口、入口表、规则表键、错误码、枚举、槽位表、迁移清单落实
PASS 13 来路无关、默认不开模型、拒收三不条文在位
```

四个全书脚本（只看本卷）：

```
check-dupnames：涉及卷九 3 行，全部是提示级（不同表里的同名字段 actor、origin、stages，类型各自在本表内无歧义）
check-exemptrefs：卷九未找到 0 行
check-dualwrite：涉及卷九 0 行
check-divisor：卷九命中 0 处
```



