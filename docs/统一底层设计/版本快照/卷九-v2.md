# 卷九 AI 接口

起草 claude-fable-5-2 中档／改稿 claude-opus-5-5 中档（第二版起）／审查 claude-opus-5-5 中档

（2026-11-13 起草，第一版，快照 `版本快照/卷九-v1.md`；同日按 `审查/卷九-一审.md` 与李白 11-13 裁定改出第二版，快照 `版本快照/卷九-v2.md`，逐条处置见附录“修订记录”，需改已封卷的请求见 §5.3。模板头硬约束照卷一 §0.4（写进每卷模板头部的硬约束），本卷不重抄。）

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
| 卷三乙 | 制作结果 `craftOutcome`，见卷三乙 §4.8（配方通用规则（继承、产率、递归））；品质档，见卷三乙 §4.5（品质档）；材料聚合，见卷三乙 §4.1（材料归类与聚合（由卷三甲的数值推出））；工具能力，见卷三乙 §4.6（工具能力） |
| 卷四 | 属性修正 `attrMod` 与身体投入 `workInputs`，见卷四 §4.3（属性（身体 / 精神））、卷四 §4.11（行动能力：`body.*` 的来源（只供值，不定义谓词））；身份键，见卷四 §4.9（身份键、化名、认出） |
| 卷五 | 进入权 `canEnter`，见卷五 §4.13（进入权与私宅许可）；在场与感知，见卷五 §4.2（分区、方位与感知通道）；事件目击名单 `perceiveEvent`（卷五 §3.2（判定与动作入口）、§4.2 规则 9，`emit` 调，R9-2.10）与一次性源强（卷五 §4.2（分区、方位与感知通道） 规则 7，动作行 `sourceStrength` 作修正项） |
| 卷六 | 账本转移，见卷六 §4.1（账本三元键与守恒）；估值，见卷六 §4.21（价格四角色）；合同，见卷六 §4.16（合同状态机） |
| 卷七 | `evaluationOf`，见卷七 §4.26（美德、罪恶、罪行、羞耻（评价行）） |
| 卷八、卷八b | 职位权能，见卷八 §4.2（职位、官职、俸禄、继任、代理追认）；`legalityOf`，见卷八b §4.5（合法性是后果）；`disposalRight`，见卷八b §4.6（处分权）；事实记录 `noteFact`，见卷八b §4.2（罪名谓词与立案到执行） |
| 卷十四 | `skillValue`，见卷十四 §4.3（技能与熟练）；`gainSkill` 与 `learn_source`，见卷十四 §4.12（成长、经验与兼修负担）、卷十四 §4.5（学习来源、学费与教师意愿）；隐藏职业契机，见卷十四 §4.8（隐藏职业契机） |
| 卷十六 | 转化原语 `transform` 的唯一求值入口 `proposeTransform`，见卷十六 R16-12.3（本卷只登记原语行、不改卷十六） |
| 卷十八 | 持有种类表，见卷十八 §4.1（持有种类表与两条转移协议）；`stance`、`dread`、`treatment`、`recall`、`intimateEligible`、`intimateAllowed`；监护，见卷十八 §4.2（家户、亲属、婚配、继承、分家、监护） |
| 卷十九 | `facilityView().type`，见卷十九 §4.2（设施类型维度表） |
| 卷二十 | 调度与到期，见卷二十 §4.1（刻、同刻全序、调度器与到期语义）；历法表与 `calendarView`、`calendarMinuteOf`，见卷二十 §4.2（历法数据与周期日规则格式）；节奏设置事件 `verb_pace_set`，见卷二十 §4.10（世界节奏 pace） |
| 卷二十一 | 身体类状态实例，见卷二十一 §4.1（身体类状态实例） |
| 卷二十四 | 事件记录字段（含 `visibility` 三档与 `witnesses` 形状），见卷二十四 §2.2（维度） 表 A |
| 卷二十六 | `personView().dims.driveWeight`、`decisionJitter()`、`preferenceOf()`、`needSatisfiers()` |
| 卷二十七 | `degradeLevelOf`、`simTierOf`；骰值键五段 |
| 卷十三、卷十五、卷二十二、卷二十八、卷二十九、卷十二（尚未成稿，标题按台账） | 对抗行与威慑量来源行；施法同意条款行；主观视图、检索键与秘密；离线校验与作者工具；语言包、模板与前端适配器；验收套件 |

### 0.3 覆盖的卷零行

- A 表主归 18 行：14.1–14.18（卷零-覆盖表.md 第 346–363 行）。
- B 表主归 3 行：3.11（第 553 行）、18.1（第 785 行）、18.2（第 786 行）。
- 合计 21 行，与卷零 §6（统计 · 各卷归入的子系统数）一致。兼及 10 行（3.8、3.10、7.4、9.3、14.19、14.20、17.6、17.10、A 表的 18.1（主观视图，主归卷二十二）、0.6），本卷只在 §5 给接口。
- 卷零 §3.5（输入边与模型叙述解析的逐处处置）共 151 处：接手方为卷九的 125 处，与别卷共管的 5 处（population.mjs:407、:409、:33–36、:371，extension/prompt.mjs:37），其余 21 处归卷十、卷八、卷十四、卷二十九（其中 consistency-review.mjs:88 直接删除，无接手方）。卷九名下 130 处按子系统落在 §4.5、§4.6、§4.9、§4.10、§4.11、§4.19，逐处对照见 §7 末段。

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

一个人想做一件事，结果取决于三样：他手里有什么（材料与工具的物性）、他会什么（技能）、他想做成什么（意图）。只有那些非得对方身体配合才做得成的事（教一门手艺、动一场不挣扎才动得了的手术），对方肯不肯，决定做不做得成；社会上“该征得同意”“有没有权管”，连同做了之后合不合规矩，都是事后别人怎样对待他，不是事前拦不拦得住。长的事要花时间，中途会被打断。别人也都在按同样的道理过日子：先看底线，再看交情，再算得失，再看手头忙不忙。

讲故事的人不改变发生了什么。他只能把已经发生的事讲出来，讲错了要能被对账发现。

### 1.2 本作现状

- 登记动作 341 条，其中 337 条是旧处理器外壳；可做之事投影里有活动文字与状态文字的拼测（action-affordances.mjs:310）。
- 原语执行器覆盖 19 个原语、14 族；开放路径的幅度上限只为 9 类效果派生，其余返回空（action-limits.mjs:247–289）；即兴制作只认三种材料类别的字面（action-limits.mjs:267–283）。
- NPC 自治有两处不经统一裁决（npc-autonomy.mjs:61、npc-autonomy.mjs:176）；决策库读记忆正文与活动文字（npc-decision.mjs:13、npc-decision.mjs:25），成本各项被截成非负，负的抵扣丢失（npc-decision.mjs:14）。
- 路由、构造器、时间槽、检索词表解析玩家原话（action-router.mjs:75 等）；一致性审查用全文正则读模型叙述（consistency-review.mjs）；场景卡按玩家问话的正则决定塞哪一段（scene-card.mjs:109）。
- 难度以数字写在动作与代码里，共 26 处。同意与权能没有单入口（action-consent.mjs:10 用文字判断亲密）。
- 回合尾注从正文里用正则抓，缺字段时填默认值（turn.mjs:34）。
- 学习回路与选择式判断层未实现；录制回放的旁路记录已有（sideband.mjs，自取墙钟量延迟；按卷二该文件删除，旁路改走 `kernel/report.mjs`）。

### 1.3 总机制：一条管线

全卷只有一条写世界的路：

`意图 → 定形 → 能力 → 前置 → 配合 → 报价 → 检定 → 效果展开与限幅 → 提交 → 善后`

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
| `occasion`（场合，决定卡读数的场合代号，R9-12.13；C29-5） | `occ_` | `order: integer nullable`、`whenRX: rx nullable`（只读 view、本回合已核定的回执（§2.4 `receipt`）、说话人所在地点的视图 `placeView()`（卷五）与 `dialogueView()`；不读本回合 `turn`（它是待核对的模型声明，组卡时尚未交回，R9-9.4）；`dialogueView()` 的会话 id 取该决定所答意图所在的对话会话；两字段只有 `occ_nil` 为空，其余条目必填） | 加载失败 | 本卷首批登记固定空码 `occ_nil`（无一行成立时取它）；各卷可加 |
| `claim_kind`（声明种类） | `ck_` | `detect: enum claim_detect`、`subjectKind: set<实体类>`、`predicates: set<维度代号 \| 读入口字段代号>`（读入口字段代号须在该种类 `evidence` 所指证据行的 `entry` 读入口的登记返回形状里（卷二 §2.7（系统声明表 `state-owners.json`）"读入口返回形状登记"的 `readShapes` 行），该证据行 `from` 须为 `view`，加载时核对，不合即加载失败；C10-20）、`valueType: enum(integer, number, boolean, ref, list_ref, none)`、`evidence: ref evidence_row` | 声明作废 | 各领域卷登记行；格式归本卷 |
| `consent_scope`（配合范围：须对方身体配合的事项） | `cscope_` | `intimate: boolean`、`revocable: boolean`、`defaultMinutes: integer ≥ 0 nullable` | 加载失败 | 本卷首批；卷十五、卷二十一、卷十八、卷十四可加 |
| `decision_card`（决定卡） | `dcard_` | `outcome: enum decision_outcome`、`slots: map<槽位代号, enum card_slot_type>` | 加载失败 | 族名与前缀见卷二 §1.9（代号、显示名与语言边界），本卷只引用；条目与条目字段归本卷，首批六条与各自槽位见附录 |
| `record_class`（记录类） | `rcls_` | 卷二 §2.6（写者与三接口）定 | 加载失败 | 族归卷二；本卷登记六条（§3.3） |
| `holding_kind`（持有种类） | `hk_` | 卷十八 §4.1（持有种类表与两条转移协议）定 | 加载失败 | 族归卷十八；本卷登记“同意边”“玩家席位边”两行（R9-3.9、§4.8），由 `rules.consent.edgeKind`、`rules.control.seatKind` 指名 |
| `record_kind`（记录种类：动作行 `code` 槽位以 `recordKind` 指向的已登记记录的种类；封卷后勘误 1114w2e） | `reckind_` | `stateKey`：该种记录所在状态表在 `state-owners.json` `stateKeys` 里已登记的键（只引用，不在 §2.7 加字段） | 加载失败 | 族名与前缀见卷二 §1.9（代号、显示名与语言边界）；条目只收各卷已定义的记录，由定义该记录的卷登记 |
| `mark_kind`（留痕种类） | `mk_` | `onKinds: set<实体类>` | 加载失败 | 本卷首批；各卷可加 |
| `menu_group`（菜单组） | `menu_` | `order: integer` | 加载失败 | 本卷首批；各卷可加 |
| `cap_row`、`difficulty_row`、`ability_row`、`cost_row`、`evidence_row`、`scene_section`、`authority_source`、`consent_clause`、`candidate_provider`、`dialogue_move`、`intent_form`（规则表里的行表，见 §4 各节） | 各自表内行号 | 见各节 | 加载失败 | 各领域卷登记行；格式归本卷 |

代码内封闭枚举（值不带前缀；扩展须改本卷）：

| 枚举 | 值 | 用在 |
|---|---|---|
| `intent_origin` | `menu` `typed` `model` `npc` `resume` | §4.3 |
| `resolve_stage` | `shape` `capacity` `precondition` `consent` `quote` `check` `effects` `commit` `aftermath` | §4.3 |
| `degree`（成功度） | `critical_failure` `failure` `partial` `success` `critical_success` | §4.3 |
| `activity_end` | `done` `interrupted` `abandoned` `failed` | §4.1 |
| `interrupt_cause`（中断原因） | `capability` `interrupt_rx` `consent` `requirement` `custody` | R9-1.12（活动推进第一步重查哪一项不过；多项不过取此序第一项） |
| `premise_break`（前提失效类直接写入） | `status` `terminated` `domicile` `custody` `possession` `trip_pace` | R9-1.12（前提失效通知表，一类一值；新的一类只加一值与表中一行） |
| `proposal_phase` | `previewed` `confirmed` `expired` `withdrawn` | §4.4 |
| `landing_level` | `mark` `fact` `solidified` | §4.15 |
| `authority_via` | `holding` `office` `disposal` `guardianship` `contract` `clause` | §4.8 |
| `clause_mode` | `substitute` `waive` | §4.8 |
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
| `ai_use` | `understand` `narrate` `validate` `judge` `draft` | §4.14 |
| `model_class` | `economy` `standard` `premium` | §4.14（模型档：只分贵贱三级，具体模型在运行配置） |
| `card_slot_type` | `id` `code` `number` `id_list` | §4.12（决定卡槽位的值类型） |
| `slot_sourced` | `from_slot` | §2.2、R9-1.13（动作行某列“取自槽位”的标记；C15-1 ①） |
| `cap_term_ctx` | `ctx_skill` | §4.7（`cap_row` 项的 `dim` 可取的上下文量：本次检定技能的读数；C15-1 ②） |
| `pace_target` | `level` `away` | §4.6（节奏设置命令写哪一项） |
| `ai_fail` | `no_key` `offline` `timeout` `budget` `rejected` `degraded` | §4.14 |
| `reject_code` | `reject:injection` `reject:minor_romance` `reject:id_leak` `reject:blocklist` `reject:unknown_entity` `reject:quote_mismatch` `reject:schema` `reject:range` | §4.19 |
| `decode_result` | `intent` `ambiguous` `menu_fallback` | §4.19 |
| `intent_slot` | `actionId` `targetRef` `scope` `relation` `kind` `channel` `wait` `focus` `respondents` `mentions` `dims` `whenDay` `whenAnchor` `qty` `nameSlot` `paceTarget` `paceLevel` `invite` | §4.19 |
| `request_kind` | `ask` `request` | §4.19 |
| `ctx_role` | `actor` `target` `material` `tool` `place` `facility` `opponent` | §4.7 |
| `rank_key` | `owned` `distance` `recent_agenda` `id` | §4.5 |
| `learn_event` | `unmapped` `out_of_catalog` `inexpressible` `mark_landed` `fact_landed` `stage_rejected` | §4.16 |

`consent_mode`（`none` `target` `holder` `authority`）由卷二 §3.9（效果族表 `_effects.json`）定义，本卷只读，且只用于报价与善后事实，不用于拦截（R9-8.1）。`slot_kind`（`code` `number` `text`）、`reply_result`、`narrate_result`、`gate_verdict` 由卷二 §1.9（代号、显示名与语言边界）定义，本卷只读；列表槽位与时间槽位怎样用这三值表达见 R9-6.7。

### 2.2 动作目录行 `action`

文件 `world/actions/*.json`。每行一个动作。全部字段为代号、数值或受限表达式；显示名在语言包。

| 字段 | 类型 | 单位 | 取值域 | onUnknown | 含义 |
|---|---|---|---|---|---|
| `id` | handle `act_` | — | 卷二 §1.9（代号、显示名与语言边界）的代号正则 | 加载失败 | 动作代号 |
| `class` | ref `act_class` | — | 族内 | 加载失败 | 动作类 |
| `slots` | map<槽位代号, struct{kind: slot_kind, multi: boolean, entityKind?: 实体类, vocab?: 词表族名, recordKind?: ref vocab record_kind, tableRow?: 数据表名（卷二第五章所列）, filter?: list<ref target_filter>, min?: number, max?: number, unit?: 单位代号, required: boolean}> | — | `kind` 为 `code` 时 `entityKind`、`vocab`、`recordKind`、`tableRow` 恰填一个；`kind` 为 `number` 时 `min`、`max` 必填；`multi` 只许与 `code` 同用 | 加载失败 | 槽位声明；候选由 §4.5 从 view 或词表生成；**指向数据表行的槽位**（封卷后勘误 1115k4，李白 ce6e990b ① (a)，整类）：`tableRow` 非空的槽位，值是卷二 §5（各类实体的维度清单草案）该数据表一行的 id，覆盖一切以表行作选项的槽位（职业、配方、服务等表行），候选取该表的行（声明了 `filter` 的再经各项 `whenRX` 筛过）；线上怎样传见 R9-6.7。**指向已登记记录的槽位**（封卷后勘误 1114w2e，李白 11-14 21:50 ③、21:57）：`recordKind` 非空的槽位，值是该记录种类（§2.1 `record_kind` 族）所指状态表里一条记录的键，候选取该表中行动者主观视图可知的记录（声明了 `filter` 的再经各项 `whenRX` 筛过，与 `entityKind`、`vocab` 槽同样选填），线上同样只以候选编号传，不上线记录键；与通用槽位 `invite` 指向待应答记录同法（§4.19.1）。整类规则，不按记录种类分支 |
| `capability` | ref vocab capability nullable | — | 卷二 §2.5（状态谓词单点）的能力族 | 空即不要求 | 行动能力要求 |
| `requirement` | 需求块 nullable \| `from_slot` | — | 卷二 §1.13（需求块）的形状；`from_slot` 见 `shapeFrom` | 空即无前置 | 前置 |
| `whenRX` | rx nullable | — | 只读 view 与槽位 | 空即恒真 | 可用条件 |
| `consent` | list<struct{party: 槽位代号, scope: ref consent_scope}> | — | `party` 是本行一个 `entityKind` 非空的必填槽位 | 空即不需配合 | 物理上须对方身体配合才做得成的事项：每一项要该槽位里的实体配合（R9-8.1）。社会上“该征得同意”的事不在这里写 |
| `answer` | ref `decision_outcome` nullable | — | 只取 `agree`、`refuse`、`counter` | 空即不是应答一步 | 本行作为有席位边的应答者答复一条待应答记录的一步时的应答结论（R9-12.15）；只在意图带了通用槽位 `invite` 时生效，带 `invite` 的一步才是应答一步；不带即普通一步、不读本栏（所以给予同意等行未被征求时照样可主动做）；本栏为空的行带 `invite` 即 E-ACT-SLOT |
| `intimate` | boolean | — | — | 加载失败（必填） | 是否亲密类动作；卷十八 §4.9（婚配制度、性风俗、儿童与老人）的检查读它 |
| `baseMinutes` | integer \| `from_slot` | 标准工分钟 | [0, `rules.act.maxBaseMinutes`]；`from_slot` 见 `shapeFrom` | 加载失败 | 标准节奏下的工时；0 即瞬时；`workFromEdge` 非空时不读 |
| `workFromEdge` | struct{slot: 槽位代号, refSpeed: 规则表键} nullable | — | `slot` 是本行一个必填槽位，其值定位一条路网边；`refSpeed` 指名一个 integer 米每分钟、取值域下限为 1 的规则表键 | 空即工量取 `baseMinutes` | 工量取自开工槽位所指边的长度（R9-1.4；C17-1 第 1 点） |
| `stages` | list<struct{stage: ref act_stage, atPermille: integer [0,1000]}> | — | 按 `atPermille` 升序 | 空即无阶段 | 活动阶段 |
| `resumable` | boolean | — | — | 加载失败 | 中断后可否续做 |
| `check` | struct{skill: ref skill nullable \| `from_slot`, abilityRows: list<ref ability_row>, opponentRows: list<ref ability_row> nullable, difficultyRows: list<ref difficulty_row>, opposed: boolean} nullable | — | `skill` 为空时 `abilityRows` 非空；`opponentRows` 非空时 `opposed` 须为真（C13-7）；`from_slot` 见 `shapeFrom` | 空即不检定 | 检定声明；`opponentRows` 空即对手一侧用同一条式子（R9-3.6） |
| `effects` | map<degree, list<effectCall> nullable> \| `from_slot` | — | `from_slot` 见 `shapeFrom`，各档按 R9-1.13 折算；否则键全覆盖 `degree` 族五档，缺键即加载失败；`check` 为空时 `success` 非 null，其余四档显式写 null，表示无检定时此档不出现（R9-3.7 成功度恒为 `success`）；`check` 非空时五档都非 null，大成功、大失败与成功、失败同效的，显式写与 `success`、`failure` 相同的一列 | 加载失败 | 各成功度的效果；effectCall 形状归卷二 §3.9（效果族表 `_effects.json`） |
| `backlash` | list<effectCall> \| `from_slot` | — | `from_slot` 见 `shapeFrom` | 空即无 | 反噬 |
| `costRows` | list<ref cost_row> | — | — | 空即无代价 | 身体与资源代价 |
| `skillGain` | struct{skill: ref skill nullable, skillFrom: struct{entry: 读入口登记代号, field: 读入口字段代号} nullable, source: ref vocab learn_source} nullable | — | `skill`、`skillFrom` 恰填一个；`skillFrom.entry` 是以 `(engine, state, subjectId)` 调用的登记读入口，`field` 在其登记返回形状里（卷二 §2.7（系统声明表 `state-owners.json`）"读入口返回形状登记"的 `readShapes` 行）且类型为 `ref skill nullable`（C13-7）；`skill` 非空时 `source` 在该技能行的 `sources` 里 | 空即不成长 | 成长申报；善后段组出卷十四的 `session`（R9-2.8），只交卷十四入口 |
| `decision` | struct{drives: map<ref drive, number [−1,1]>, candidateProviders: list<ref candidate_provider>} nullable | — | — | 空即 NPC 不主动选 | NPC 候选申报 |
| `menu` | struct{group: ref vocab menu_group, order: integer} | — | — | 加载失败 | 菜单位置；每个动作必须有菜单位置（可达口径见 I9-1） |
| `shapeFrom` | struct{entry: 读入口登记代号, args: map<参数名, 槽位代号>} nullable | — | `args` 的值都是本行的必填槽位；`entry` 是纯读的登记读入口，以 `(engine, state, {actor, …args 各参数取所指槽位的值})` 调用，其登记返回形状（卷二 §2.7（系统声明表 `state-owners.json`）"读入口返回形状登记"的 `readShapes` 行）须含本行（及本行 `costRows` 所指行）标为 `from_slot` 的各列对应的键（R9-1.13） | 空即本行没有 `from_slot` 列 | 随槽位变化的各列取自哪一个读入口（C15-1 ①） |
| `sourceStrength` | map<ref vocab sense, number> combine=sum | 随感官（到达量的单位，卷五 §4.2（分区、方位与感知通道） 规则 3） | 键为 `sense` 族代号（卷五 §4.2.1（维度）），各值为实数（可负）；叠加修正映射（卷二 §1.6（缺失处置）第 5 项），键集可稀疏，缺键即该感官不加修正项；行上必写，本动作不改任何感官的源强写 `{}` | 加载失败（必填） | 源强修正项（封卷后勘误，李白 11-14 20:22 根因 G P-8）：行为人做本动作期间，键 s 的值作加性修正项叠加到卷五修正目标键 `sense.sourceStrength[s]`（以行为人为主体）上；基值取被感知实体所在表的 `sourceStrength` 列，本列不进基值，叠加后的截断与求值只照卷五 §2.3（规则表） 与 §4.2 规则 7。`{}` 的含义：本动作对一切感官都不加修正项，行为人的一次性源强只取基值与别的修正项 |
| `basis` | string（说明文字，display 登记；数据行写法照卷二 §1.3（行、继承与取值顺序）与 §5.0（公共字段（每张表每行））） | — | — | 加载失败 | 出处 |

校验：`slots`、`effects` 引用闭合；`effects` 里每个 effectCall 的族按 R9-7.5 逐个数值参数有 `cap_row` 或豁免行，数值参数为空的族须显式声明为空（§4.7）；`menu` 必填（I9-1）；`intimate` 必填，`intimate` 为真的行 `consent` 非空；`whenRX`、`interruptRX` 可编译且只读入口；`effects` 里含制作类效果（输出带品质档的实物，R9-4.4）的行，`check` 必须为空（检定在 `craftOutcome` 内做一次，不重复）；`workFromEdge` 非空的行，`slot` 须是本行的必填槽位，`refSpeed` 所指规则表键的取值域下限为 1（由登记该键的卷加载校验）；本行或本行 `costRows` 所指行有任一列写 `from_slot` 的，`shapeFrom` 必须非空，且其入口的登记返回形状（卷二 §2.7（系统声明表 `state-owners.json`）的 `readShapes`）含该列对应的键，否则 E-ACT-ROW（C15-1 ①）。

**本卷登记的从业与生活方式动作行**（封卷后勘误 1115k4，李白裁定第 29 条）：卷十四的四个写入口 `takeUp`、`giveUp`（PF-3、PF-4）、`setFocus`（LF-1）、`takePerk`（LF-3）由下面四条动作行提起，玩家与居民同经本目录（居民经 §4.12 决策管线）。四行同一形状：`baseMinutes` 0（瞬时）、一个必填 `code` 槽位、`check` 为空、`effects.success` 调卷十四登记的对应效果族（卷十四 §5.1（本卷导出的入口（使用卷不得自拟别名））末段，经卷二 §3.9（效果族表 `_effects.json`）登记），其余四档按本节 `effects` 行写显式 null；前提（够格、切换间隔、点数）都由卷十四入口自己判，本行 `whenRX` 为空，够格与否在 `resolve()` 提交段由卷十四入口判，不过即拒。四行共用一个新动作类（`exertion` 0、`attention` 0、`social` 假、`interruptRX` 恒假：瞬时动作没有推进，不会被中断）与一个新菜单组，条目见第三个代码块。`decision.drives` 取卷二十六 §4.9（决策噪声接口）数据实例驱力清单中与收入、地位相关的两项，各 0.5（李白裁定第 29 条首值，待标定，见附录待补清单第 11 条）；四条候选提供行 `slotGen` 为该行唯一槽位映到筛选表：四行均为空筛选（候选取该族条目）；已在从业、未在从业、够格、切换间隔、点数等前提不在动作侧读，一律放在卷十四写入口的准入里判，不过即拒（封卷后勘误 1115k4，依据 chk-1115-k4r 真问题 2：动作侧不读 `slots.`、`actor`），`whenRX` 恒真，`maxCandidates` 写 4（占位，标定批，同卷二十二 §2.6（本卷向别卷表登记的行（代号与全部列））③ 的候选提供行）。效用与取舍照 R9-12.4、R9-12.7 原文，不另设数值。放弃从业一行 `decision.drives` 两项取 −0.5（放弃即减收入与地位）。按李白 ce6e990b ① 落地（封卷后勘误 1115k4；只核通过前不写“已成立”）：从业、放弃从业两行的槽位以本节 `slots` 新增的 `tableRow` 指向职业表（卷二 §5.14（职业 `profession`（卷十四；首批）））的行；四行所调效果族的 `paramsRX` 经 `slot.<槽位名>` 读本动作的槽位值（只传代号，`effectCall.params` 仍为空表）；不新增原语，从业、放弃从业落成“执业”持有边的 `holding.open`、`holding.close`，设专注、取节点照 R9-2.9 先例落成 `transition`（迁移代号由卷十四登记）；前提判定在卷十四写入口的准入；四族数值参数为空，按 R9-7.5 在族表显式声明为空，不需 `cap_row`。放弃从业的驱力符号待定，标定时可改由收入差派生（待补第 11 条）。

```json
{
 "act_take_up": {"class":"acls_decide","slots":{"profession":{"kind":"code","multi":false,"tableRow":"profession","required":true}},"capability":null,"requirement":null,"whenRX":null,"consent":[],"answer":null,"intimate":false,"baseMinutes":0,"workFromEdge":null,"stages":[],"resumable":false,"check":null,
   "effects":{"critical_failure":null,"failure":null,"partial":null,"success":[{"family":"eff_take_up","params":{}}],"critical_success":null},"backlash":[],"costRows":[],"skillGain":null,"decision":{"drives":{"drive_wealth":0.5,"drive_status":0.5},"candidateProviders":["take_up_profession"]},"menu":{"group":"menu_career","order":0},"shapeFrom":null,"sourceStrength":{},"basis":"卷十四 PF-3 从业；decision.drives 为李白裁定第 29 条首值，待标定"},
 "act_give_up": {"class":"acls_decide","slots":{"profession":{"kind":"code","multi":false,"tableRow":"profession","required":true}},"capability":null,"requirement":null,"whenRX":null,"consent":[],"answer":null,"intimate":false,"baseMinutes":0,"workFromEdge":null,"stages":[],"resumable":false,"check":null,
   "effects":{"critical_failure":null,"failure":null,"partial":null,"success":[{"family":"eff_give_up","params":{}}],"critical_success":null},"backlash":[],"costRows":[],"skillGain":null,"decision":{"drives":{"drive_wealth":-0.5,"drive_status":-0.5},"candidateProviders":["give_up_profession"]},"menu":{"group":"menu_career","order":1},"shapeFrom":null,"sourceStrength":{},"basis":"卷十四 PF-3、PF-4 放弃从业；decision.drives 量取李白裁定第 29 条的 0.5、方向取负（放弃即减收入与地位，chk-1115-k4 疑点②），待标定"},
 "act_set_focus": {"class":"acls_decide","slots":{"lifestyle":{"kind":"code","multi":false,"vocab":"lifestyle","required":true}},"capability":null,"requirement":null,"whenRX":null,"consent":[],"answer":null,"intimate":false,"baseMinutes":0,"workFromEdge":null,"stages":[],"resumable":false,"check":null,
   "effects":{"critical_failure":null,"failure":null,"partial":null,"success":[{"family":"eff_set_focus","params":{}}],"critical_success":null},"backlash":[],"costRows":[],"skillGain":null,"decision":{"drives":{"drive_wealth":0.5,"drive_status":0.5},"candidateProviders":["set_focus_lifestyle"]},"menu":{"group":"menu_career","order":2},"shapeFrom":null,"sourceStrength":{},"basis":"卷十四 LF-1 设专注；decision.drives 为李白裁定第 29 条首值，待标定"},
 "act_take_perk": {"class":"acls_decide","slots":{"perk":{"kind":"code","multi":false,"vocab":"perk","required":true}},"capability":null,"requirement":null,"whenRX":null,"consent":[],"answer":null,"intimate":false,"baseMinutes":0,"workFromEdge":null,"stages":[],"resumable":false,"check":null,
   "effects":{"critical_failure":null,"failure":null,"partial":null,"success":[{"family":"eff_take_perk","params":{}}],"critical_success":null},"backlash":[],"costRows":[],"skillGain":null,"decision":{"drives":{"drive_wealth":0.5,"drive_status":0.5},"candidateProviders":["take_perk_node"]},"menu":{"group":"menu_career","order":3},"shapeFrom":null,"sourceStrength":{},"basis":"卷十四 LF-3 取节点；decision.drives 为李白裁定第 29 条首值，待标定"}
}
```

候选提供行（登记进 §4.12 `candidate_provider` 行表，字段照该表）：

```json
{
 "take_up_profession": {"actionId":"act_take_up","slotGen":{"profession":[]},"whenRX":"true","maxCandidates":4,"basis":"李白裁定第 29 条；maxCandidates 占位，标定批"},
 "give_up_profession": {"actionId":"act_give_up","slotGen":{"profession":[]},"whenRX":"true","maxCandidates":4,"basis":"李白裁定第 29 条；maxCandidates 占位，标定批"},
 "set_focus_lifestyle": {"actionId":"act_set_focus","slotGen":{"lifestyle":[]},"whenRX":"true","maxCandidates":4,"basis":"李白裁定第 29 条；maxCandidates 占位，标定批"},
 "take_perk_node": {"actionId":"act_take_perk","slotGen":{"perk":[]},"whenRX":"true","maxCandidates":4,"basis":"李白裁定第 29 条；maxCandidates 占位，标定批"}
}
```

动作类与菜单组条目（登记进 §2.1 `act_class`、`menu_group`）：

```json
{
 "acls_decide": {"exertion":0,"attention":0,"social":false,"interruptRX":"false","basis":"李白裁定第 29 条：瞬时决定类动作，没有推进，不会被中断"},
 "menu_career": {"order":0,"basis":"李白裁定第 29 条：从业与生活方式动作的菜单组"}
}
```

**封装动作行**（封卷后勘误 1115k4，依据卷三乙 42f82915、李白 12:05 ③）：卷三乙 `sealIntact` 改可空后，置真只由封装动作经原语执行（卷三乙实例维度 `sealIntact` 行与其 §5 本卷行）。本行与本卷其余动作行同一格式：一个必填槽位指向所封的物品实例（`entityKind`），经一条新登的对象筛选（下面代码块，读候选所挂组件类）只取文书类、容器类实例（李白 12:05 ③；依据 chk-1115-k4r 真问题 3），`whenRX` 为空；“只封从未封过的实例”（`sealIntact` 为空，拆封后为假、不再改回）是写入口前提，放在卷三乙 `sealIntact` 写者的准入里判（交卷三乙），动作侧不读；`check` 为空，`effects.success` 调卷三乙登记的封装效果族（输出一条 `fact.set` 把该实例 `sealIntact` 置真，落到卷三乙登记的维度写者，数值参数为空、族表显式声明为空；该族已由卷三乙登记），其余四档显式 null；`baseMinutes` 5 为占位待标定。菜单组为新登的物品类菜单组。不另登动词：封装的事件就是本动作提交段的事务事件，发出系统是卷九动作管线自身，按卷十八 §2.3（本卷登记的资源种类行、合同种类行、事件动词）判据（甲）可感知，由执行器 `emit` 照常处理，无表 B 新行。

```json
{
 "act_seal_item": {"class":"acls_light_labor","slots":{"item":{"kind":"code","multi":false,"entityKind":"item","filter":["tf_sealable"],"required":true}},"capability":null,"requirement":null,"whenRX":null,"consent":[],"answer":null,"intimate":false,"baseMinutes":5,"workFromEdge":null,"stages":[],"resumable":false,"check":null,
   "effects":{"critical_failure":null,"failure":null,"partial":null,"success":[{"family":"eff_seal_item","params":{}}],"critical_success":null},"backlash":[],"costRows":[],"skillGain":null,"decision":null,"menu":{"group":"menu_item","order":0},"shapeFrom":null,"sourceStrength":{},"basis":"卷三乙 sealIntact 置真（李白 12:05 ③）；baseMinutes 占位待标定"},
 "menu_item": {"order":0,"basis":"物品操作类动作的菜单组（封装首用）"},
 "tf_sealable": {"slot":"scope","whenRX":"comp_document in subject.classes || comp_container in subject.classes","basis":"李白 12:05 ③：可封对象只限文书类、容器类实例（卷三乙组件类）；chk-1115-k4r 真问题 3"}
}
```

### 2.3 运行态路径

| 路径 | 值 | 写者 | 进哈希 | 实体终止时 |
|---|---|---|---|---|
| `state.activities[actorId]` | struct{actionId, slots, startedAt: integer:minute, workTotal: integer, workDone: integer, workDoneRem: integer, paceUnits: integer, paceSince: integer:minute, finishAt: integer:minute nullable, endCause: interrupt_cause nullable} | `activity.mjs` | 是 | `clear` |
| `state.agendas[personId]` | list<struct{from: integer:minute, until: integer:minute, actionId, slots, sourceCandidate}>（按 `from` 升序、互不重叠） | `npc-agenda.mjs` | 是 | `clear` |
| `state.proposals[actorId][proposalId]` | struct{intent, quote, phase: proposal_phase, previewedAt: integer:minute, expiresAt: integer:minute} | `open-actions.mjs` | 是 | `clear`（主体段：提案人） |
| `state.marks[onId][markId]` | struct{by: actorId, markKind: ref vocab mark_kind, at: integer:minute, proposalId nullable, level: landing_level} | `mark-actions.mjs` | 是 | `clear`（主体段：留痕对象） |
| `state.dialogues[sessionId]` | struct{parties: list<entityId>, state: dialogue_state, round: integer, lastOffer: struct nullable, openedAt: integer:minute, idleUntil: integer:minute} | `dialogue.mjs` | 是 | 任一方终止即整条删除（清理函数，§3.3） |
| `state.pendingInvites[inviteId][respondentId]` | struct{inviter: EntityId, inviteAction: ref action}（待应答记录，R9-12.15：键第 1 段 `inviteId` 为 EventId，取邀约那笔事务提交段事件的 id；第 2 段为应答者；值存发起者与邀约动作代号） | `invites.mjs` | 是 | 发起者或应答者终止即整条删除（清理函数，§3.3） |
| `state.decisionCommit[personId]` | struct{candidateId, since: integer:minute, until: integer:minute} nullable | `npc-agenda.mjs` | 是 | `clear` |
| `state.lastCommit[actorId]` | struct{at: integer:minute, eventId: EventId} | `primitives-runtime.mjs`（提交段） | 是 | `clear` |

`state.lastCommit` 只为事件 id 派生服务（R9-3.8）：记该行动者最近一次提交的时刻与事件 id，下一次提交只在同一时刻时读它。

同意不另设存储：一次同意是一条持有边，种类由 `rules.consent.edgeKind` 指名、种类行登记在卷十八 §4.1（持有种类表与两条转移协议），见 §4.8。冷却不另设存储：是带时限的状态容器实例，格式归卷二 §1.11（状态容器）。受玩家操控的实体不另设存储：是一条玩家席位边，见 R9-3.9。

不在 state、不进哈希、规则层读不到的：模型调用旁路记录、录制文件、费用账、学习回路计数（§4.16、§4.18）；AI 档位与运行配置（§4.14）。`narration.*` 是卷二 §2.7（系统声明表 `state-owners.json`）登记的文字路径，本卷不重复登记。运行期不存 AI 记录文字（`records.*.text`，R9-9.9）：编年、档案、碑记只存事件与代号，风味文字只属显示层。

### 2.4 结构

**意图 `Intent`**（管线的唯一输入，规则层内部形态）。它与线上形态分两层：线上（`schema:wire-up-menu-v1`、`schema:input-edge-v1`，schema 文件归卷二 §2.7（系统声明表 `state-owners.json`））只按卷二 §1.9（代号、显示名与语言边界）第 2 条传 `{action, slots:{槽位代号: 候选编号 | 数值 | {filled:true}}}`；候选编号换成下表的 id 与代号只在 `route()` 内、按本回合候选表做一次（R9-6.7），换不了即 E-ACT-SLOT。

| 字段 | 类型 | 必填 | 含义 |
|---|---|---|---|
| `actor` | EntityId | 是 | 行动者 |
| `actionId` | handle `act_` | 是 | 动作代号；开放提案固定为目录里登记的“开放提案”那一行，由 `rules.open.proposalAction` 指明 |
| `slots` | map<槽位代号, EntityId \| handle \| number \| list<EntityId \| handle> \| filled> | 是 | 槽位值；`multi` 槽位是列表；`slot_kind` 为 `text` 的槽位只有“已填”标记；没有文字 |
| `origin` | `intent_origin` | 是 | 来路；只用于旁路记录与验收，管线各段不得读它 |
| `effects` | list<effectCall> nullable | 仅开放提案 | 提案效果 |
| `magnitudes` | map<参数代号, number> nullable | 仅开放提案 | 请求幅度 |

**回合 `turn`**：`{extraMinutes: integer [0, rules.turn.maxExtraMinutes], location: placeId, present: list<EntityId>, timing: turn_timing}`，四个字段全部必填，没有默认值。

**分段 `segments[]`**：`{segmentId: integer, kind: segment_kind, speaker: EntityId nullable, start: integer, end: integer, quoteSource: quote_source}`；`start`、`end` 是叙述文字的码点位置。

**声明 `claims[]`**：`{claimId: integer, kind: handle ck_, subject: EntityId | 登记 id, predicate: 维度代号 | 读入口字段代号（C10-20）, value, polarity: claim_polarity, modality: claim_modality, time: {mode: temporal_mode, at?: integer:minute, until?: integer:minute}, speaker: EntityId nullable, addressee: EntityId nullable, source: EntityId nullable, references: list<{sourceId, start, end}>, segmentId: integer, start: integer, end: integer}`。

**决定 `Decision`**：`{outcome: decision_outcome, card: handle dcard_, slots: map<槽位代号, 按该卡 card_slot_type 的值>, candidateId, trace: list<{stage: decision_stage, codes: list<代号>, values: map<代号, number>}>, due?: integer:minute}`。

**回执 `receipt`**（每次 `resolve()` 返回一条，内存对象，随 `ReplyResult` 交出，R9-9.1）：`{eventId, actor, actionId, degree, primitives, minutesAdvanced, placeAfter, costs, code nullable, stage nullable}`，全部是代号、id 与数值。

**`ReplyResult` 中本卷负责的字段**（`schema:reply-result-v1`；卷二 §2.9（外部边界与 Text 模型）第 0 条“三样东西”定了结果代号、拒收代号、画面、事件序号区间、存档状态、心跳区间与“没有文字字段”，字段全集归卷二十九与本卷；与卷二十九 §2.7（上下行结构中本卷负责的字段）合并定稿：本卷负责下表五个字段，其余字段见该节，C29-5）：

| 字段 | 类型 | 何时有 |
|---|---|---|
| `receipts` | list<receipt> | 本次请求每个意图一条，失败的那条带 `code`、`stage` |
| `alternatives` | list<{actionId, slots: map<槽位代号, 候选编号>}> | 有一步被拒时（R9-3.3） |
| `ambiguous` | {slot: 槽位代号, candidates: list<候选编号>} nullable | 路由或译码筛出零个或多个候选（R9-6.3、R9-17.3） |
| `missingSlots` | list<槽位代号> | 必填槽位缺失（R9-19.3） |
| `cards` | list<{card: handle dcard_, speaker: EntityId, slots: map<槽位代号, 值>, reading: CardReading}> | 本回合出面说话的每个 NPC 一张，按 `speaker` 的 id 升序（R9-13.7）；`reading` 是模板对白变体条件读的读数（R9-12.13；C29-5） |

**决定卡读数 `CardReading`**（R9-12.13；C29-5）：`{listener: EntityId, persBand: map<ref vocab pers, integer>, gaugeBand: map<ref vocab gauge, integer>, relations: list<ref vocab relation>, occasion: ref vocab occasion}`，全部是 id、代号与整数档序；档序由数值轴按规则表的切点派生，不存储。

`cards` 与卷二 §2.9（外部边界与 Text 模型）`ReplyResult` 的决定卡一项同一定义：`cards: list<{card: Handle<decision_card>, speaker: EntityId, slots}>`，槽位值的类型由本卷 `card_slot_type` 定（卷二已按 §5.3 勘3 改）。

### 2.5 规则表键

全部在 `world/rules/tables/` 下，值待标定；类型栏的取值域同时是加载校验。

| 键 | 类型 | 取值域 | 用在 |
|---|---|---|---|
| `rules.act.maxBaseMinutes` | integer:minute | ≥ 1 | §2.2 |
| `rules.act.paceScale` | integer | 正整数，取过程主体槽 `process.workPace` 精度 4 对应的标度 10000；放规则表只为让 §2.7 的分母有登记处、加载时核对它与槽精度一致，不是可标定量 | R9-1.4 |
| `rules.act.craftDegree` | map<卷三乙 `craftOutcome.outcome` 代号, degree> | 键全覆盖 `success` `botched` `ruined` | R9-4.4 |
| `rules.agenda.slotMinutes` | integer:minute | ≥ 1，且整除一日分钟数 | R9-1.10 |
| `rules.consent.edgeKind` | ref vocab holding_kind | 本卷登记的同意边种类 | §4.8 |
| `rules.control.seatKind` | ref vocab holding_kind | 本卷登记的玩家席位边种类 | R9-3.9 |
| `rules.act.paceFloor` | map<act_class, number> | 键全覆盖 `act_class`；每值 [0, 1]。按动作类取节奏下限，取 0 的类节奏可为 0（C17-1 第 2 点） | R9-1.4 |
| `rules.act.resumeWindowMinutes` | integer:minute | ≥ 0 | R9-1.7 |
| `rules.act.advanceMaxMinutes` | map<act_class, integer:minute> | 键全覆盖 `act_class`；每值 ≥ 1。每类活动推进间隔的最大值，首值未核（无出处，待标定） | R9-1.12 |
| `rules.check.rollDist` | distribution | 卷二 §1.10（随机实例化）的首批分布之一 | R9-3.5 |
| `rules.check.degreeBands` | list<number>，长度 4 | 严格升序 | R9-3.5 |
| `rules.open.proposalAction` | ref action | 目录内 | §2.4 |
| `rules.open.previewMinutes` | integer:minute | ≥ 1 | R9-4.3 |
| `rules.open.maxEffects` | integer | ≥ 1 | R9-4.2 |
| `rules.open.magnitudeSteps` | integer | ≥ 1 | R9-5.2 |
| `rules.constructor.rankKeys` | list<rank_key> | 非空 | R9-5.3 |
| `rules.route.maxSteps` | integer | ≥ 1 | R9-6.4 |
| `rules.turn.maxExtraMinutes` | integer:minute | ≥ 1 | §2.4 |
| `rules.scene.promptBudget` | integer（码点数） | ≥ 1 | R9-10.4 |
| `rules.scene.staticBudget` | integer（码点数） | ≥ 0，且小于 `promptBudget` | R9-10.4 |
| `rules.review.tolerance` | map<claim_kind, number ≥ 0> | 键全覆盖 `claim_kind` 族，缺键即加载失败；不设容差的种类显式写 0 | R9-11.4 |
| `rules.npc.utilityWeights` | struct{money, time, risk, relation, reward, need, grievance}，各 number ≥ 0 | — | R9-12.4 |
| `rules.npc.commitMinutes` | integer:minute | ≥ 0 | R9-12.7 |
| `rules.npc.redLineValence` | ref vocab valence | 卷七 `valence` 族内 | R9-12.2 |
| `rules.npc.grievanceVerbs` | set<ref vocab verb> | 非空 | R9-12.3 |
| `rules.npc.stanceWeights` | map<ref vocab stance_axis, number> combine=sum | 叠加修正映射（卷二 §1.6（缺失处置）第 5 项），缺键即该轴不加项 | R9-12.3 |
| `rules.npc.switchMargin` | number | ≥ 0 | R9-12.7 |
| `rules.npc.idleAdvanceMinutes` | integer:minute | ≥ 1。空闲的人重新决策的推进间隔最大值，首值未核（无出处，待标定） | R9-12.7 |
| `rules.npc.conditionalStep` | integer | 正整数 | R9-12.6 |
| `rules.dialogue.maxRounds` | integer | ≥ 1 | R9-13.4 |
| `rules.dialogue.idleMinutes` | integer:minute | ≥ 1 | R9-13.5 |
| `rules.invite.expireMinutes` | integer:minute | ≥ 1（待标定） | R9-12.15（待应答记录的失效时长，全部邀约共用） |
| `rules.card.persCuts` | list<number> | 严格升序，每值在 [−1, 1]（C29-5） | R9-12.13 |
| `rules.card.gaugeCuts` | list<number> | 严格升序，每值在 [0, 1]（C29-5） | R9-12.13 |
| `rules.ai.tierUses` | map<ai_tier, set<ai_use>> | `t0` 必为空集；含 `narrate` 的档必含 `validate` | R9-14.1、R9-14.2 |
| `rules.ai.timeoutMs` | map<ai_use, integer:ms> | ≥ 1 | R9-14.4 |
| `rules.ai.budgetTokens` | map<ai_use, integer:token> | ≥ 0 | R9-18.4 |
| `rules.ai.modelClass` | map<ai_use, model_class> | 键全覆盖；`validate` 首值 `economy`（待标定） | R9-19.10 |
| `rules.ai.validateNameWindow` | integer | ≥ 0（待标定） | R9-19.10 |
| `rules.i18n.nameCandidateCount` | integer | ≥ 1（首值归本卷，待标定；卷二 §2.9（外部边界与 Text 模型）第 3 条起名用） | R9-19.11 |
| `rules.ai.degradeMap` | list<struct{level: integer, maxTier: ai_tier}>，按 `level` 升序 | — | R9-14.3 |
| `rules.gate.retryLimit` | integer | [0, 1] | R9-19.6 |
| `rules.gate.maxTextCodePoints` | map<文字字段代号, integer> | ≥ 1 | R9-19.5 |
| `rules.gate.categoryMap` | map<屏蔽词类别代号, reject_code> | 键全覆盖屏蔽词类别族（卷二 §1.9（代号、显示名与语言边界）），缺键即加载失败；没有专门拒收代号的类别显式写 `reject:blocklist` | R9-19.5 |
| `rules.gate.verdictMap` | map<validator_verdict, reject_code nullable> | 键全覆盖 | R9-19.5 |
| `rules.ai.understandOrder` | list<ai_use> | 元素只取 `judge`、`understand` | R9-17.6 |
| `rules.judge.minConfidencePermille` | integer | [0, 1000]（未核，待标定） | R9-17.3 |
| `rules.learn.candidateMinCount` | integer | ≥ 1 | R9-16.3 |
| `roles.senses.sight`、`roles.senses.hearing` | 句柄 → ref vocab sense | 卷五 `sense` 族内（视、听两个感官条目） | R9-12.14（动词行 `senses` 栏所取的条目；同卷二十三、卷二十四的取法） |

### 2.6 过程主体槽与修正键

按卷二 §3.7（旧派生槽的对照与过程主体槽）在 `derived-process.json` 登记四个槽（数据行，本卷自己登记），求值一律经卷二 §3.3（求值管线）：

| 槽 | 精度 | 取值域 | 基值来自 | 含义 |
|---|---|---|---|---|
| `process.checkAbility` | 4 | 无界 | 声明了技能时取 `skillValue`，再加 `ability_row` 之和（R9-3.5） | 检定能力 |
| `process.checkDifficulty` | 4 | 无界 | `difficulty_row` 之和 | 检定难度 |
| `process.magnitudeCap` | 4 | ≥ 0 | `cap_row` 的最小值 | 幅度上限 |
| `process.workPace` | 4 | [`rules.act.paceFloor[该动作类]`, 无上界) | 1 | 活动节奏 |

产物品质不在这里：品质档只由卷三乙 `craftOutcome` 内部滚档（卷三乙 §4.5（品质档）Q-2），本卷不设品质槽、不挂品质修正。伤病、心情、工具、设施、天气、信条对动作的影响一律以修正项挂这四个槽，本卷不为任何一种来源写分支。

### 2.7 存法登记

口径只引卷二 §3.3（求值管线）“存量与余数结转”。

| 字段 | stockMode | 余数字段 | 分母 | 说明 |
|---|---|---|---|---|
| `state.activities[actorId].workDone` | `remainder` | `workDoneRem`（`integer:count`，取值域 `[0, 分母)`） | `rules.act.paceScale`（正整数，存续期内固定） | 每段工作一次整除，向下取整；R9-1.4 |
| `state.activities[actorId].workTotal` | `raw` | — | — | 开工时一次写入，之后不改 |
| `state.dialogues[sessionId].round` | `raw` | — | — | 只做整数加 1 |
| `state.proposals[*]`、`state.agendas[*]`、`state.marks[*]`、`state.decisionCommit[*]`、`state.lastCommit[*]`、`state.pendingInvites[*]` | 不含逐次改写的数值 | — | — | 只有时刻、代号、id 与一次写入的报价 |

误差界：`workDone` 按第 5 条带余数结转，没有截断累积；记录存续期间任一时刻“已存的标准工分钟数 × 分母 + 余数”恒等于各段“分钟数 × 节奏整数”之和，误差为 0（A9-1.2 验切片不变）。到期收工的那次结清不写回 `workDone`，记录在同一事务里删除（R9-1.4），所以存下的 `workDone` 恒小于 `workTotal`。本卷没有 `extScale` 字段，也没有锚点字段。

### 2.8 错误码

格式按卷二 §4.3（错误码表）；调用方只比较代码。

| 码 | 何时 |
|---|---|
| E-ACT-ROW | 动作行不合 §2.2 |
| E-ACT-UNKNOWN | 意图的动作代号不在目录 |
| E-ACT-SLOT | 槽位缺失、类型不符或值不在候选集 |
| E-ACT-CAPACITY | 行动能力谓词不过 |
| E-ACT-PRECONDITION | 需求块或 `whenRX` 不过 |
| E-ACT-CONSENT | 动作行声明须对方身体配合，而对方没有给出配合（R9-8.1） |
| E-ACT-COST | 付不出代价 |
| E-ACT-BUSY | 已有不可并行的当前活动 |
| E-ACT-CAP-MISSING | 按 R9-7.5 逐参数判：效果族的某个数值参数既无幅度上限行也无豁免行，或两者都有；或数值参数为空而未显式声明为空 |
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
| `stream.check` | `site.check.roll` | 本次提交的事件 id；一次提交里有多个检定主体时，按卷二十七 R27-8.5 的复合对象段拼上主体 id（“事件 id \| 主体 id”） | 提交时刻 | R9-3.5 |
| `stream.check` | `site.check.opposed` | 同上 | 同上 | R9-3.6 |
| `stream.npc` | 由卷二十六登记的“决策扰动”抽取点 | 主体 id 后接候选 id | 决策时刻 | R9-12.4 |

本次提交的事件 id 在提交前已能按下表算出，所以检定可以用它作对象段。

事件 id 按卷二十七 §4.8（种子键与骰值键（确定性约束与验收））R27-8.9 的五个成分派生（世界种子、规则或指令代号、主体 id、世界时刻、固定位次代号），本卷各处怎样取：

| 事件 | 规则或指令代号 | 主体 id | 位次代号 |
|---|---|---|---|
| 提交段的那一条 | 动作代号 | 该行动者此刻没有更早的提交时取行动者 id；同一时刻已有提交时取 `state.lastCommit[actorId].eventId`（上一条事件 id，R27-8.5 的写法） | `pos.commit` |
| 善后段的成长、事实、反噬三类事务 | 各自的登记代号 `aft.skill`、`aft.fact`、`aft.backlash` | 提交段那条事件的 id | 恒为 `pos.only`。同一类事务一次结算有多条时（`multi` 槽位里的多个对象，或效果族 `targetSelector` 算出、不对应槽位的对象），按各条所涉实体 id 升序排成一列（同一实体有多条时按动作行槽位的声明序）：第一条的主体 id 取提交段那条事件的 id，其后每条取前一条的事件 id（与提交段那一行“上一条事件 id”同一写法，R27-8.5），所以两两不同且不用计数 |
| 推进钩子、反应规则经执行器的事件 | 钩子或反应规则的登记代号 | 触发它的事件 id，或钩子的主体 id | 由登记它的卷给固定代号 |
| 活动推进点与 `finishAt` 到期的那一条（R9-1.12；执行器末步里的推进不另出事件，属该次提交） | 本卷登记的到期项代号 `due_activity`（其 `due_kind` 行 `calendarBound` 取假：推进点与 `finishAt` 都按世界分钟算，R9-1.4、R9-1.12，不是按历法锚定的到期；卷二十 §2.1（规则表 `rules.clock`（调度））词表族 `due_kind`，全书加载修复批 甲-3） | 行动者 id | `pos.only`（每条活动至多一个待到的推进点，同一行动者同一分钟只有一条） |
| 前提失效通知触发的活动推进（R9-1.12） | 本卷登记代号 `ntf.activity` | 一条通知涉及的各人按 id 升序成链：第一条取触发它的那条事件的 id，其后每条取前一条的事件 id（与善后行同一写法） | `pos.only`（触发事件 id 两两不同，链上主体 id 两两不同） |
| 写者协议在事务内另发的事件（整类：定义卷的写入规则规定随某类写入在同一事务内一并发出的事件，含卷二 §2.6（写者与三接口）终止、复生的内核事件，卷十八 R18-1.11 持有变化、R18-1.10 常住变化事件；`primitives` 为空，R9-2.3、卷二十四 R24-1.1） | 所在事务那条事务事件的 `cause`；所在事务没有事务事件时（推进钩子经 `writePath` 的直写中触发这类写者协议）取该钩子的登记代号 | 第一条取所在事务那条事务事件的 id；同一事务有多条这类事件时按所涉实体 id 升序成链（所涉实体：终止、复生取该实体，持有变化取载荷 `edge`，常住变化取载荷 `person`，拒绝应答（R9-12.14）取 `actor`，活动结束（R9-1.14）取该活动的主体（载荷 `actor`）；同一实体有多条时按发出先后），其后每条取前一条的事件 id（与善后行同一写法）；所在事务没有事务事件时，链首取本表“推进钩子”一行给该钩子的主体 id | `pos.kernel`（这类事件专用，不借 `pos.only`，以免与善后链的事件撞号） |

没有计数器，也不需要禁止同刻重复提交：同一行动者同一分钟内的第二次提交以第一次的事件 id 为主体，id 不同。

**到期项种类行**（登记进卷二十 §2.1（规则表 `rules.clock`（调度））的词表族 `due_kind`，字段照该族，写法同卷二十四 §2.5（本卷向别族登记的条目）；封卷后勘误 1115k4，李白裁定第 11 条：本卷凡登记到期项处都有一行）：

| 族 | 条目 | 字段 | 说明 |
|---|---|---|---|
| 卷二十 `due_kind` | `due_activity` | `paceClass` = equilibrium；`rank` 见卷二十 §2.1（规则表 `rules.clock`（调度））`rank` 分配表；`floorRX` null；`calendarBound` 假 | 活动推进点与 `finishAt` 到期（R9-1.4、R9-1.12）；按世界分钟算，推进间隔是动作自身的耗时，不随节奏缩放（卷二十 §4.10.3（世界节奏 pace 规则）第 5 条） |
| 卷二十 `due_kind` | `due_activity_resume` | `paceClass` = equilibrium；`rank` 见卷二十 §2.1（规则表 `rules.clock`（调度））`rank` 分配表；`floorRX` null；`calendarBound` 假 | 续做窗口期满（R9-1.6）：中断后 `rules.act.resumeWindowMinutes` 到期仍未续做即以 `abandoned` 清除 |
| 卷二十 `due_kind` | `due_npc_idle` | `paceClass` = equilibrium；`rank` 见卷二十 §2.1（规则表 `rules.clock`（调度））`rank` 分配表；`floorRX` null；`calendarBound` 假 | 空闲推进点（R9-12.7）：每隔 `rules.npc.idleAdvanceMinutes` 一个；是再次检查间隔，按卷二十 §4.10.3（世界节奏 pace 规则）第 3 条（b）强制均衡类 |
| 卷二十 `due_kind` | `due_dialogue_idle` | `paceClass` = equilibrium；`rank` 见卷二十 §2.1（规则表 `rules.clock`（调度））`rank` 分配表；`floorRX` null；`calendarBound` 假 | 冷场关闭（R9-13.5）：`idleUntil` 到期未续即 `closed`，只按世界分钟 |
| 卷二十 `due_kind` | `due_invite_expire` | `paceClass` = equilibrium；`rank` 见卷二十 §2.1（规则表 `rules.clock`（调度））`rank` 分配表；`floorRX` null；`calendarBound` 假 | 待应答记录失效中的超时（R9-12.15）：此刻加 `rules.invite.expireMinutes` 到期时记录仍在即删除 |
| 卷二十 `due_kind` | `due_open_preview` | `paceClass` = equilibrium；`rank` 见卷二十 §2.1（规则表 `rules.clock`（调度））`rank` 分配表；`floorRX` null；`calendarBound` 假 | 开放提案预览过期（R9-4.3）：`expiresAt` 到期未确认即 `expired`，按世界分钟，确认窗口不随节奏缩放（封卷后勘误 1115k4，依据 chk-1115-k4 真问题 1） |
| 卷二十 `due_kind` | `due_agenda_slot_end` | `paceClass` = equilibrium；`rank` 见卷二十 §2.1（规则表 `rules.clock`（调度））`rank` 分配表；`floorRX` null；`calendarBound` 假 | 日程槽结束（R9-12.7）：`state.agendas` 槽的 `until`（整数世界分钟）到时调度 `npcChoose`；日程是行动者自排的时段，不随节奏缩放（封卷后勘误 1115k4，依据 chk-1115-k4r 真问题 5） |
| 卷二十 `due_kind` | `due_scheduled` | `paceClass` = equilibrium；`rank` 见卷二十 §2.1（规则表 `rules.clock`（调度））`rank` 分配表；`floorRX` null；`calendarBound` 假 | 原语 `schedule` 写入到期堆的项（§4.2.1 该行）：契约只有绝对时刻 `at` 与 `action` 或 `rule`，没有种类字段，整类取本种；`at` 是给定的世界分钟，入堆时不改（封卷后勘误 1115k4，依据 chk-1115-k4r 真问题 5） |

---

## §3 统一入口

### 3.1 读入口与谓词

| 入口 | 返回 | 说明 |
|---|---|---|
| `actionView(engine, actionId)` | 动作行（展平后） | 目录唯一读入口 |
| `affordances(engine, state, viewerId)` | list<{actionId, slots: map<槽位代号, 候选列表>, blocked?: 错误码}> | 可做之事投影；第六层投影，属规则层 |
| `activityOf(engine, state, actorId)` | {actionId, stage, permille, finishAt} 或空 | 当前活动；`stage` 与 `permille` 读时派生 |
| `agendaOf(engine, state, personId, at)` | 该刻的日程槽或空 | 日程 |
| `freeSlotsOf(engine, state, personId, dayIndex)` | integer ≥ 0 | 该日空闲时段数（R9-1.10）；卷十四 `teacherFreeSlots` 读它 |
| `check(engine, state, ctx)` | {degree, margin, ability, difficulty, rollKey} | 检定；纯函数 |
| `difficultyOf(engine, state, ctx)` | number | 难度派生 |
| `magnitudeCap(engine, state, ctx, familyId)` | number ≥ 0 | 幅度上限 |
| `consent(engine, state, query)` | {ok, basis: list<持有边 id \| 条款行号>, grantors: list<EntityId>, code} | 同意单入口；拦截只用于动作行声明的配合事项，别的用途只进报价与事实（R9-8.1） |
| `authority(engine, state, query)` | {ok, sources: list<{via: authority_via, ref}>, code} | 权能单入口；只进报价、事实与 NPC 决策，不拦截 |
| `controlledByPlayer(engine, state, entityId)` | boolean | 是否由玩家出意图；卷二十七 R27-1.2 观察锚所说“定义卷的 view”就是它 |
| `quoteOf(engine, state, intent)` | 报价（工时、代价、难度、上限、需配合的对象；另带供显示的读数：各效果族 `consent` 是否成立、`authority` 是否成立、`legalityOf` 读数、进入地点的 `canEnter`） | 预览用；不写状态 |
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

写入口另见 §3.2：`resolve()`、`execute()`、`preview()`、`confirm()`、`withdraw()`。边界侧入口（不属规则层，规则层不可调用）：输入边的 `decode()`；AI 边的 `interpret`、`narrate`、`narrateTurn`（三者由卷二 §2.9（外部边界与 Text 模型）登记）、`effectiveTier()`；`replaySource()` 只由测试与回放用的装配注入，正式装配文件 `server-plugin/index.mjs` 的封闭清单里没有它（R9-18.3）。

### 3.2 唯一写者

| 写什么 | 唯一写者 | 入口 |
|---|---|---|
| 一切由动作引起的世界改动 | 原语执行器 `primitives-runtime.mjs` | `resolve(engine, state, intent)` |
| `state.activities` | `activity.mjs` | 只由 `resolve` 的提交段、调度器到期与前提失效通知的订阅者（R9-1.12）调用 |
| `state.agendas`、`state.decisionCommit` | `npc-agenda.mjs` | 只由 `npcChoose` 的结果经 `resolve` 之外的声明写者接口写（日程本身不是世界改动的结算） |
| `state.proposals` | `open-actions.mjs` | `preview`、`confirm`、`withdraw` |
| `state.marks` | `mark-actions.mjs` | 只由执行器的 `create` 原语适配器调用（`create` 的 `kind` 取留痕，见 R9-15.2） |
| `state.dialogues` | `dialogue.mjs` | 只由对话类动作的效果经执行器调用；终止清理见 §3.3 |
| `state.pendingInvites` | `invites.mjs` | 只由执行器调用：在邀约的裁决事务里开，在应答一步（作答、拒绝）的裁决事务里删；失效中超时由它在开记录时登记的到期项删，轮数耗尽由耗尽的那步裁决事务删（R9-12.15）；终止清理见 §3.3 |
| `state.lastCommit` | `primitives-runtime.mjs` | 提交段与同一事务 |
| 同意边、玩家席位边 | 卷十八 §4.1（持有种类表与两条转移协议）的转移协议 | 执行器的 `holding.open`、`holding.close` |
| 技能值 | 卷十四的 `gainSkill` | 善后段调用，本卷不写 |
| 文字路径 | aiGate 组内登记写者 | 卷二 §2.9（外部边界与 Text 模型）第 3 条 |

### 3.3 领域记录的去留

按卷二 §2.6（写者与三接口）“领域清理的两个登记点”。以实体 id 为路径段的六条，在 `state-owners.json` 登记 `subjectRecords`，去留写规则表 `rules.terminate.records.<rcls_ 代号>`，六条的 `atTerminate` 都是 `clear`（复生去留不写）：

| 路径模式 | `recordClass` | `subjectSegments` |
|---|---|---|
| `state.activities[actorId]` | `rcls_activity` | 第 1 段 |
| `state.agendas[personId]` | `rcls_agenda` | 第 1 段 |
| `state.proposals[actorId][proposalId]` | `rcls_proposal` | 第 1 段（提案人） |
| `state.marks[onId][markId]` | `rcls_mark` | 第 1 段（留痕对象；留痕者终止不清） |
| `state.decisionCommit[personId]` | `rcls_decision_commit` | 第 1 段 |
| `state.lastCommit[actorId]` | `rcls_last_commit` | 第 1 段 |

`state.dialogues[sessionId]` 的键不是实体 id，参与方在值里，所以不登记去留表，改登记清理函数：`systems.dialogue.terminationCleanup = {kinds: [能当会话一方的实体类], handler: "dialogue.mjs#dropSessionsOf", sortKey}`，内核终止时调它，它删去 `parties` 含该 id 的全部会话，不先改状态。`state.pendingInvites[inviteId][respondentId]` 的键第 1 段不是实体 id、发起者在值里，同样不登记去留表，改登记清理函数 `systems.invite.terminationCleanup = {kinds: [能当邀约一方的实体类], handler: "invites.mjs#dropInvitesOf", sortKey}`：删去发起者或应答者为该 id 的全部记录，不发事件。

### 3.4 退役的旧入口

- 旧处理器外壳 337 条：逐行改成 §2.2 的数据行，处理器删除。
- `legacy-primitives.mjs` 整个文件：它声明“旧处理器仍是唯一写者”，与 §3.2 冲突。
- 解析玩家原话的六处路由、构造器两处、时间槽两处、注册表检索一处、检索词表三处（清单见 §7）。
- `extension/turn.mjs` 的 `parseTurn`、`stripTurn`、`normalizeReplyProtocol`、`fullyTimedWait` 与 `extension/prompt.mjs` 的 `isOutOfCharacter`。
- `npc-autonomy.mjs` 的两处直写；`npc-decision.mjs` 的文字匹配与截断。
- `action-limits.mjs` 的 `sourceFor` 九类分支与材料类别字面。
- `ai-profile.mjs` 的用途表改读 `rules.ai.tierUses`，并移出规则层；其中“模型替 NPC 规划”“模型写人物档”两种用途删除。
- `sideband.mjs`：按卷二 §6.11（显示字段、语言解析与派生槽的迁出）的处置删除，旁路记录改调 `kernel/report.mjs`（R9-18.5）。

### 3.5 禁止的旁路（扫描式写法，卷十二实现）

- **S9-1**：规则层任何文件写 state 而调用栈不经 `resolve` 的提交段、推进钩子的声明写者或卷二 §2.6（写者与三接口）的终止协议，计数须为 0（E-NPC-BYPASS、E-VIEW-UNDECLARED-WRITE）。
- **S9-2**：`consent(`、`authority(` 之外，规则层出现对同意边种类、监护边、职位权能、处分权的直接读取并用于“可否对他人施加”的判断，计数须为 0。
- **S9-3**：规则层文件里出现卷二 §2.8（字符串类型规则）节点位置白名单之外的字串用法，计数须为 0；本卷涉及的文件无一例外。
- **S9-4**：`check(` 之外出现骰值抽取并映射成 `degree`，计数须为 0。
- **S9-5**：规则层 import `server-plugin/input/**`、`server-plugin/ai-gate/**`、`extension/**`，计数须为 0（E-VIEW-INPUT-IMPORT）。
- **S9-6**：规则层读取 `intent.origin`、AI 档位、费用账、旁路记录、录制文件、学习回路计数，计数须为 0。
- **S9-7**：规则层出现数值字面量参与难度、上限、阈值、权重的比较或运算，计数须为 0（常数只在规则表）。单位换算常数（千分比的 1000，由单位定义给出）不在此列。
- **S9-8**：规则层读事件日志用于判断（本回合内存回执除外），计数须为 0。
- **S9-9**：动作行、原语参数、声明、回合结构、意图的 schema 中出现类型为文字的字段，计数须为 0（文字只在卷二登记的文字路径与请求 schema 的独立数据字段）。

---

## §4 子系统

### 4.1 动作目录与当前活动

#### 4.1.1 维度

动作行（§2.2）；`act_class`、`act_stage` 两族（§2.1）；`state.activities`、`state.agendas`（§2.3）；`activity_end`；`rules.act.*`（§2.5）；`process.workPace`（§2.6）；`workDone` 的存法（§2.7）。

#### 4.1.2 统一入口

读：`actionView()`、`affordances()`、`activityOf()`、`agendaOf()`、`freeSlotsOf()`。写：`state.activities` 只由 `activity.mjs`，经 `resolve()` 的提交段、调度器到期与前提失效通知的订阅者（R9-1.12）调用。能不能行动只调卷二 §2.5（状态谓词单点）的 `can()`。

#### 4.1.3 规则

- **R9-1.1 目录是数据**：一个动作就是一行。可用性由 `capability`、`requirement`、`whenRX`、`consent` 四个字段决定，行为由 `effects` 决定；没有与动作一一对应的处理器函数。
- **R9-1.2 可做之事投影**：`affordances()` 遍历目录全部行，对每行的每个槽位用“实体类加 `target_filter` 的 `whenRX`”从 view 生成候选列表，再按 `shape`、`capacity`、`precondition`、`consent` 四段依次试算（不报价、不检定）；第一处不过的错误码写进 `blocked`。候选生成函数与 `resolve()` 的 `shape` 段是同一个函数。候选从哪里来按槽位声明的四种 `code` 指向分（§2.2 `slots` 行）：`entityKind` 槽取该实体类在行动者视图里的对象；`vocab` 槽取该词表族的条目；`recordKind` 槽取该记录种类所指状态表里行动者主观视图可知的记录；`tableRow` 槽取该数据表的行（封卷后勘误 1115k4，李白 ce6e990b ①）；四种都是声明了 `filter` 的再经各项 `whenRX` 筛过（封卷后勘误 1115c1，recordKind 只核小项 a）。
- **R9-1.3 活动是动作实例**：开工时工量（R9-1.4）大于 0 的动作在开工提交时写一条 `state.activities[actorId]`。“在做什么”只读 `activityOf()`；睡眠、昏迷是状态容器，不是活动；人物表上不存活动文字。
- **R9-1.4 进度与节奏**：开工时 `workTotal = baseMinutes`；动作行声明了 `workFromEdge` 的，`workTotal = ceil(distanceM ÷ refSpeed)`，`distanceM` 是该槽位所指边的长度（米，卷五 `routeView().edge`），`refSpeed` 是该字段指名的规则表键的值（除数下限 1，加载校验），这样取得的工量不受 `rules.act.maxBaseMinutes` 截断，为 0 即瞬时（C17-1 第 1 点）。节奏 `paceUnits` 是 `process.workPace` 求值结果的定点整数（标度即 `rules.act.paceScale`），下限取 `rules.act.paceFloor[该动作类]`；下限为 0 的动作类节奏可为 0，为 0 时活动停滞而不结束，推进点照登记（R9-1.12；C17-1 第 2 点）。节奏只在活动推进时重算（推进的时刻与步骤见 R9-1.12）。重算前先用旧节奏结清 `paceSince` 到此刻的 `m` 分钟：`acc = workDoneRem + m × paceUnits`；`workDone += floor(acc ÷ paceScale)`；`workDoneRem = acc − floor(acc ÷ paceScale) × paceScale`。除数 `paceScale` 是正整数，由加载校验保证。然后写新的 `paceUnits`、`paceSince`，并算收工时刻：`need = workTotal × paceScale − workDone × paceScale − workDoneRem`；`paceUnits` 为 0 时不做除法，`finishAt` 置空，活动停滞；否则 `finishAt = paceSince + ceil(need ÷ paceUnits)`，交卷二十 §4.1（刻、同刻全序、调度器与到期语义）登记到期项。在 `finishAt` 之前的任一刻 `m < need ÷ paceUnits`，结清后 `acc` 小于 `need`，所以存下的 `workDone` 恒小于 `workTotal`；到期那一刻判为做完，不再结清、不写回 `workDone`，活动记录在收工事务里删除，多出的不足一个 `paceUnits` 的部分随之丢弃（它不对应任何产出）。
- **R9-1.5 阶段读时派生**：当前阶段是 `stages` 里满足 `workDone × 1000 ≥ atPermille × workTotal` 的最后一项（交叉相乘比较，不做除法）。阶段不落存储。
- **R9-1.6 中断**：每次活动推进的第一步（R9-1.12）重查 `can(actor, capability)`、该动作类的 `interruptRX`、动作行 `consent` 声明的配合（R9-8.8）、动作行 `requirement` 的非消耗项与必填实体槽位、行动者是否在使该动作类受制的羁押下（两项定义见 R9-1.12 ①）；任一不过即结束本段，结束前按 R9-1.4 用旧节奏结清到此刻，中断原因取 `interrupt_cause` 的代号写进本次事务的事件。`resumable` 为真的，记录保留、`paceUnits` 置 0、`finishAt` 置空、`endCause` 写中断原因（续做时清空），并登记 `rules.act.resumeWindowMinutes` 之后的到期项（种类 `due_activity_resume`，§2.9）；到期仍未续做即以 `abandoned` 结束并清除。`resumable` 为假的，立即以 `interrupted` 结束并清除。中断阈值只出现在 `interruptRX` 引用的规则表键里。
- **R9-1.7 续做**：续做是来路为 `resume` 的同一个意图，从 `capacity` 段重新走；通过后按 R9-1.4 重算节奏，已做的工不丢。
- **R9-1.8 并行**：一个行动者同时只有一条当前活动。活动期间提交瞬时动作，须两者动作类的 `attention` 相加不超过 1，否则 E-ACT-BUSY；要做就先提交“停下当前活动”的意图。
- **R9-1.9 预留与退还**：开工时代价里的实物按 `cost_row.reserve` 转入行动者名下“在作”用途的账户；收工时由效果消耗；中断结束时按 `cost_row.onEnd`（`refund` 或 `forfeit`）整笔处置，不按进度拆分。
- **R9-1.10 日程**：`state.agendas[personId]` 的每个槽只存动作代号、槽位值与来源候选 id。空闲时段：把一日按 `rules.agenda.slotMinutes` 等分（加载校验保证它整除一日分钟数，所以段数是正整数），`freeSlotsOf(…, dayIndex)` 数出既不与任何日程槽的区间相交、也不与当前活动的 `[paceSince, finishAt)` 相交的段数；日的起止分钟取卷二十 `calendarMinuteOf`。聚合层的人（卷二十七 §4.1（三层模拟运行矩阵））没有活动记录也没有日程；实体化时怎样补建归卷二十七 §4.2（聚合变体、等价、钉住）。
- **R9-1.11 同一世界**：目录没有“只给玩家”或“只给 NPC”的行，也没有这样的字段。玩家能做的每件事 NPC 都能经同一行做，反之亦然。
- **R9-1.12 活动推进与重查**（李白 11-13 裁定；通则，覆盖一切持续活动，不按动作类开特例）：
  - **一次活动推进**按固定三步做：① 重查全部前提——`can(actor, capability)`、动作类 `interruptRX`、动作行 `consent` 所涉每条同意边此刻仍现役且未过截止（R9-8.8）；（a）`requirement`：动作行 `requirement` 中 `consumed` 为假的各组此刻仍满足（用卷二 §1.13（需求块）同一求值），且 `required` 为真的实体槽位所指实体都未终止（卷二 §2.5（状态谓词单点）`terminated` 谓词），动作行带工位的，还含下文“经账本离手”段所列场所类前提三项（工位所在设施行未终止，卷十九-建筑与设施.md:498、:984；固定装置能力；配方设施条件，同文件 :457、:415）；（b）`custody`：行动者此刻不在使该动作类受制的羁押下——读卷八b `custodyOf` 与该边 `regime` 的 `barsActions`，受制条件只调卷八b R8b-12.4，本卷不自写；只读数值维度与固定代号，不读任何文字。② 按 R9-1.4 用旧节奏结清 `paceSince` 到此刻。③ ① 有一项不过即按 R9-1.6 中断，中断原因取 `interrupt_cause` 的代号（多项不过取该枚举序第一项）；全过则按 R9-1.4 重算节奏与 `finishAt`，并登记下一个推进点。
  - **推进时刻只有五种**：开工与续做；推进点；`finishAt` 到期（先做 ①，全过才判为做完）；执行器事务末步（见下）；前提失效通知（见下）。推进点是卷二十 §4.1（刻、同刻全序、调度器与到期语义）的到期项，时刻 = `paceSince + rules.act.advanceMaxMinutes[该动作类]` 与越界时刻 `t*`（见下“连续变化的前提”，算不出时不参与）中较早的一个，`finishAt` 不晚于它时不另登记；每次推进都撤下该活动尚未到的旧推进点再登记新的，所以每条活动至多一个待到的推进点；停滞的活动（`paceUnits` 为 0、`finishAt` 空）照样有推进点，节奏回升也在推进点生效。于是同一条活动相邻两次推进相隔不超过该类的推进间隔。
  - **抽查口径**（李白 11-13 对二审后核 N1-a 的裁定）：前提只在推进时刻查，推进时刻之间不连续监视。前提的每一种变化经下面四路之一送到推进时刻：（甲）经执行器的写入——同一事务末步当次查（见“执行器末步”）；（乙）前提失效类状态的直接写入——写入的同一刻查（见“前提失效通知”）；（丙）没有写入事件、随时间连续变化、能算出越界时刻的前提——在越界时刻插一个推进点（见“连续变化的前提”）；（丁）其余，即没有写入事件的变化：算不出越界时刻的连续变化，以及执行器外经账本离手的工具（账本写入不发事件，见下“经账本离手”）——只在推进点抽查，延迟不超过一个推进间隔。只有（丁）路会漏查：在相邻两个推进点之间失效又恢复的，不追查，期间的工照结清。“推进间隔不长于前提最短失效时长”这条限制只用于（丁）路中的连续变化（标定约束，待补第 7 条）；不设“间隔内曾失效”的标记，也不为此统一缩短推进间隔。
  - **旁路直写**：卷二 §2.6（写者与三接口）许可推进钩子在内核事务里经 `writePath` 直写其登记写者范围（卷二 §2.7（系统声明表 `state-owners.json`）示例里 `body` 阶段的状态推进钩子即一例），同节的终止协议由内核清记录、关持有边；这些写入不经执行器，本卷不为它们另开回调，只按（乙）路订阅所属卷已有的事件。前提变为不过之后到中断之前已发生的效果按现有结算规则处理：累计的工按 ② 结清到中断时刻，预留按 R9-1.9 的 `cost_row.onEnd` 处置，不回滚，不另造补偿；活动的产出只在收工时发生，而收工前必先过 ①，所以收工那一刻前提不过的活动不会产出。
  - **前提失效通知**（第五种推进时刻）：凡会让活动前提失效的状态被直接写入（不经执行器）时，按下表的固定代号（`premise_break`，§2.1）整类登记，不为单个情况开特例；由该状态所属卷的写入口发出它现有的事件，本卷 `activity.mjs` 订阅。订阅只走卷二 §2.6（写者与三接口）的事件写通道（卷二-维度表规范与统一入口.md:431“事件（world-events 订阅者改状态）”；动词是卷二 §1.9（代号、显示名与语言边界）的 verb 族条目，按动词与载荷里的 id 匹配，不读事件文字）。订阅者在该事件投递的那一刻（卷二十 §4.1（刻、同刻全序、调度器与到期语义）里事件所在的位置），对表中“此人”一栏给出的每个人按 id 升序、各对其当前在世活动做一次活动推进（同一个三步）：① 不过即按 R9-1.6 中断，已做的工按 ② 结清到此刻、照算；① 全过则照常重算节奏与下一推进点。同一刻对同一条活动重复推进，② 结清 0 分钟，结果不变，所以执行器事务里发出的同类事件与末步重叠也无妨。新的一类要加进来，只在 `premise_break` 加一值、在下表加一行，规则代码不改。

| `premise_break` | 哪一类直接写入 | 所属卷与写入口 | 写入口登记名 | 现成事件（文件:行） | 此人 |
|---|---|---|---|---|---|
| `status` | 状态实例出现、换档、移除（昏厥、昏迷、睡眠、病程升档等）：`can()` 读的 `family` 三个布尔字段随实例出现与移除而变，状态对 `body.*` 的修正随档而变（卷二十一 R21-1.8 第 ⑤ 步档效果） | 状态容器的内容归卷二十一、卷七、卷十三（卷二 §1.11（状态容器）），写入都经同一个登记写者：卷二十一 §4.1（身体类状态实例）病程推进钩子（R21-1.8 整拍）、反应写入，及卷七、卷十三在执行器外写状态实例的，一律归本行 | `state-owners.json` `stateKeys.statuses` 的写者 `status.mjs` | 卷二十一 §4.1（身体类状态实例）交互小节登记的 verb 族条目（代号见其附 术语与代号表） `verb_status_onset`、`verb_status_stage`、`verb_status_removed`（载荷 `{subject, status, stage, prevStage, at}`；写实例的写者在同一事务内发，§5.3 勘11 已落地） | 实例的主体 |
| `terminated` | 实体终止（人死、消亡；工具、场所损毁），连同终止协议关闭的持有边（同意边、羁押边等） | 卷二 §2.6（写者与三接口）终止协议 `terminate` | kernelApi `kernel/terminate.mjs#terminate`（`state-owners.json` `stateKeys.terminated` 的写者） | `verb_entity_terminated {id, cause, mode, successorId}`，卷二-维度表规范与统一入口.md:444 | 槽位值（`state.activities[*].slots`）含载荷 `id` 的在世活动的行动者；被终止者自己的活动由终止协议清除 |
| `domicile` | 常住边建立与结束（失去住处） | 卷十八 R18-1.10 持有写者（含改挂带走住户一路：调 `relocate` 后由持有写者在同一事务内发，调用卷不发） | `state-owners.json` `stateKeys.holdings` 的登记写者（持有写者） | 常住变化事件 `verb_domicile_changed`，卷十八-社会关系与家族.md:446（R18-1.10；代号登记在同文件 :1414） | 载荷的 `person` |
| `custody` | 以此人为标的的持有边建立、转移、结束：被捕（羁押边收押）、被移交、作质（卷八b R8b-12.1、R8b-12.2，经 `custodyStep` 向持有写者提交），使 ①（b）由过变为不过 | 卷十八 R18-1.11 持有写者（卷八b `custodyStep` 只提交提案） | `state-owners.json` `stateKeys.holdings` 的登记写者（持有写者）；`kernel/relations.mjs#writeRelation` | 持有变化事件 `verb_holding_changed`，卷十八-社会关系与家族.md:448（R18-1.11；代号登记在同文件 :1413；卷八b-法律治安与刑罚.md:987 R8b-12.2 写明羁押、人质边同用） | 载荷的 `subject` |
| `possession` | 此人作为持有者的持有边结束或被转走（判决罚没、被逐、许可撤销、转给后继等持有边转移）：当刻对此人做一次推进，① 全部重查。两路并存：持有边转移由本行事件覆盖——①（a）的需求块先求能力组（卷三乙-物态类别与物品.md:1090 N-1），能力组的工具可用范围按持有种类代号读持有边（同文件 :1031 A-1、:301 `rules.tools.availability`），持有边转移可使（a）的能力组由过变为不过，在本事件投递的同一刻重查；账本离手由抽查覆盖——不消耗的工具项读账本占有（卷六-经济.md:368 规则 12），执行器外经账本离手的走（丁）路推进点抽查（见表后“经账本离手”），不归本行 | 卷十八 R18-1.11 持有写者 | `state-owners.json` `stateKeys.holdings` 的登记写者（持有写者）；`kernel/relations.mjs#writeRelation` | 持有变化事件 `verb_holding_changed`，卷十八-社会关系与家族.md:448（R18-1.11；代号登记在同文件 :1413） | 载荷的 `holder` 与非空的 `prevHolder` |
| `trip_pace` | 行程节奏变更（C17-1 第 3 点）：行进窗开闭、环境量越过取值粒度边界、队伍成员的状态实例与终止与持有变化，使行进动作的节奏读数改变或行程须停歇；不是前提失效，借本表在投递那一刻对领队的活动做一次推进、按此刻读数重算节奏，不走（丙）路 | 卷十七 R17-1.5 越线通知（`tripStep` 发） | `state-owners.json` 中 `state.trips` 的声明写者 `travel.mjs`（卷十七-交通与路途.md:268） | `verb_trip_pace {trip, leader, at}`，卷十七-交通与路途.md:325（R17-1.5；代号登记在同文件 :162） | 载荷的 `leader` |

  `custody` 与 `possession` 两行订阅同一个事件，按载荷的角色（标的、持有者）取人，不看种类句柄：不论哪种持有边，变化时对它两端的人各做一次活动推进；与前提无关的推进按 ① 全过照常重算，结果不变。已在押者的受制条件随看守在场、清醒与围合完好而变（卷八b R8b-12.4）的，不是持有边变化，归（丁）路。

  - **经账本离手**（（丁）路；李白 11-13 对 `审查/持有变化事件-卷九N1b-卷六-核.md` H1 的裁定，取乙，不动卷六账本核心）：不消耗的工具项的占有在账本里（卷六-经济.md:368 规则 12），执行器外的账本写者（卷二-维度表规范与统一入口.md:431 第一条路，`declareLedgerWriter` 登记，如合同给付、罚没入库、终止清算）转走它们时不发事件，本卷不订阅、不自造事件，退回推进点抽查。抽查就是推进点第 ① 步对（a）的整组重求值，不另开一套：对象是在世活动的需求块求值所读的账户与容器（容器内物品的数量仍记在容器所属持有人的账户上，容器只管位置/归属；封卷后勘误 1118k8，李白 11-18 04:10 第 4 条，卷三乙 K-2）——`requirementCheck(engine,state,reqRef,ctx)`（卷三乙-物态类别与物品.md:1082）的 `ctx.sources` 与工位 `ctx.site`；`ctx.sources` 在推进那一刻按 `accountsOf(行动者 id, {family, purpose})`（卷六-经济.md:241）重新取，不沿用开工时的账户列表，所以账户或容器的持有者 id 已不是行动者的，按固定代号比对即落选，余量随之不足、（a）不过，按 `requirement` 中断。**场所类前提**（李白 11-13 对 `审查/卷九-Q1Q3-核.md` Q2 的裁定）：只重查需求块原有的场所前提，不新增占有条件。需求块带工位 `ctx.site` 的，同一次 ① 里按现有定义重求三项，同样不沿用开工时的结果：场所仍存在——工位所在设施行的卷二 §2.5（状态谓词单点）`terminated` 谓词为假（拆除、损毁都走终止协议，卷十九-建筑与设施.md:498 §4.4 规则 3、:984 §4.16 规则 4）；工位固定装置给出的能力仍够——卷三乙-物态类别与物品.md:1031 A-1 第二个来源，按卷十九-建筑与设施.md:456 §4.3 规则 2 经修正键 `fixture.ability` 求值；配方开工的设施条件仍成立——卷十九-建筑与设施.md:457 §4.3 规则 3：所在建筑的 `type` 仍等于 `recipe.workstation` 所写设施类型（`type` 按同文件 :415 §4.2 规则 2 推，拆走固定装置后可变为别的类型或 null），或所占工位仍属所写固定装置类。任一项不过，（a）不过，按 `requirement` 中断。这三项开工时的 ① 本来就求，推进点只是照样重求；不以行动者是否持有该工位或所在建筑的所有权份额、持有边为条件，也不按持有种类放行，同户成员、学徒、雇工、租户在别人的建筑里做工，场所前提与房主本人相同（进入许可一律不拦，§4.8）。建筑份额（`resfam_asset` 分录，卷六-经济.md:1054 规则 2）只用来判断场所是否已拆除或转为不可用：凡设施行终止，该设施的全部资产分录在同一事务里记出（同文件 :354），与“场所仍存在”一项同时变，所以本卷不另读行动者名下的份额；份额易手而场所仍存在、仍满足上述三项的，活动不因此中断。按账户、容器与工位整类求值，不为单个物品、账户或场所开特例；只扫有在世活动挂着的需求块所引用的账户、容器与工位，不扫全账本；只读余额、持有者 id、资源键、终止标记、能力等级与代号，不读任何文字。收押时随身之物转入保管分区与羁押边建立同一笔事务，`custody` 事件投递时的那次推进已一并重查（a），不在此列。经执行器的账本转移走末步，也不在此列。**延迟上界**：离手后下一推进点时前提仍不过的，离手到中断不超过该动作类的一个推进间隔 `rules.act.advanceMaxMinutes[该动作类]`（下一推进点前已归还的，按“抽查口径”失效又恢复不追查）；期间的工照结清，不回滚（同“旁路直写”）。这是本卷的公开缺口（§8 公开缺口 G1）；卷六收卷时再评是否改为账本发事件（§5.3 表后段、§8 第 12 条）。

  - **连续变化的前提**（（丙）路；没有写入事件、随时间连续变化）：每次推进第 ③ 步登记下一推进点时，对 ① 中能算出越界时刻的各项求最早越界时刻 `t*`，推进点取 `paceSince + rules.act.advanceMaxMinutes[该动作类]` 与 `t*` 中较早的一个（仍是 `due_activity` 到期项，每条活动至多一个待到的推进点不变）。能算出的只有两种：同意边的截止时刻，即持有边公共键 `terms.until`（整数分钟，直接取）；`interruptRX` 里对单个锚点量（卷二 §3.3（求值管线）“存量与余数结转”第 4 条，`stockMode: anchor`，存储为 `struct:stockAnchor`）与常数的比较、且该量的闭式在当前锚点下单调的（单调与否按该维度闭式的形状与锚点速率的符号判定，只读数值），按卷二同一条闭式（只用卷二“定点指数与整数次幂”的函数与定点加乘）在 `(此刻, paceSince + advanceMaxMinutes]` 内按整分钟二分，求比较首次不过的那一分钟。不单调、不是单个比较、或闭式之外的，算不出，归（丁）路。锚点被重设时：经执行器的走末步（锚点路径在 K 里即重算推进点）；不经执行器的，插好的推进点可能过时，该项退回（丁）路，最迟在下一推进点按新锚点重求。
  - **执行器末步**（保留，理由：经执行器的写入都出自某个意图，如撤回同意、捆绑、击伤，行动者在同一份回执里就该看到后果；这一款只是推进时刻的第四种，走同一个三步，不是第二套规则，与“抽查口径”的其余三路并列）：每条活动的重查集合 K = 以下节点经卷二 §2.3（记忆与依赖声明）`inputsOf` 得到的冻结依赖路径之并：行动者实体类的 `modified:<kind>`（`process.workPace` 的修正项来源都在其内）、`can()` 所读的 `view:bodyView` 与 `view:statusView`（卷二 §2.5（状态谓词单点））、`interruptRX` 引用的 view、`consent` 所涉同意边的 `holdings` 路径、①（a）的需求块求值与必填实体槽位终止判定所读的节点、①（b）的 `custodyOf` 与卷八b R8b-12.4 受制判定所读的节点；`state.clock` 不入 K。K 在开工时按动作行与动作类算一次，不存。W = 本批原语写到的路径集合（每个原语的适配器只写登记的目标路径）。同一事务末步，对 K 与 W 相交的在世活动按行动者 id 升序单遍各做一次活动推进，每条至多一次；末步自身的写入（中断时的预留处置、活动记录的结束）不并入 W，受它们影响的活动按“抽查口径”所属的那一路重查。次序固定，结果确定。
  - **确定性**：推进点与到期项都落在世界内在的分钟上，随世界时刻变化的影响（昼夜、季节、天气越线）一律经卷二十登记的到期项与越线事件（全书概念台账 X-33）落成写入，前提失效通知随触发它的事件落在该事件的世界时刻上，越界时刻 `t*` 只由推进那一刻的状态算出，所以一次推进 N 分钟与分段推进合计 N 分钟遇到同一串推进时刻。重查的成本（每个推进点一次 ①）作为性能项交卷二十七（§5.3 勘10）。
- **R9-1.13 取自槽位**（C15-1 ①）：动作行的 `check.skill`、`requirement`、`baseMinutes`、`effects`、`backlash` 与其 `costRows` 所指行的 `resource` 写 `from_slot` 的，值不在行上，由本行 `shapeFrom` 的读入口按此刻意图的槽位给出。凡读到这些列之处（R9-1.2 试算、九段、R9-1.4 开工定工量、R9-1.12 ① 重查）都在读的那一刻以同一组实参调该入口，不缓存、不存储；该入口的 `inputsOf` 依赖并入 R9-1.12 的重查集合 K。取返回的键：`skill` 作检定技能（即检定上下文的 `ctx.skill`）；`requirement` 作前置；`minutes` 作 `baseMinutes`（取值域同该字段，越界即 E-ACT-ROW）；`costResource` 作代价行的 `resource`；`backlash` 作反噬；`effects` 一列取返回的 `effects: list<effectCall>` 与 `degreeBps: map<degree, integer [0, 10000]>`，某成功度的效果 = 这组效果调用、每个幅度参数 × `degreeBps[该成功度]` ÷ 10000（除数是常数一万，正整数），`degreeBps` 键全覆盖 `degree` 族五档，缺档即 E-ACT-ROW。动作行与代码里都不按入口、槽位或条目代号分支。结构化列按卷二 §2.7（系统声明表 `state-owners.json`）"读入口返回形状登记"的 `shape` 行核对（`requirement` 列要求 `shape`/`struct:requirementBlock`，`effects` 列要求 `shape`/`struct:effectCallList`）。
- **R9-1.14 活动结束事件**（C15-1 ⑤）：活动记录由 `activity.mjs` 删除的那次事务（收工、按 R9-1.6 以 `interrupted` 结束、续做窗口期满以 `abandoned` 清除、以 `failed` 结束）在同一事务内发一条动词 `verb_activity_ended`，载荷 `{actor, actionId, end: activity_end}`；一切结束方式同发这一条，不按动作代号分支；`resumable` 为真而只被中断、记录保留的，此时不发。它属“写者协议在事务内另发的事件”一类（R9-2.3、§2.9 该行）：`primitives` 为空，id 按该行取，位次 `pos.kernel`。实体终止时由终止协议清除的活动记录不经 `activity.mjs`，不发本事件（订阅方另订阅 `verb_entity_terminated`）。别卷订阅它只按载荷的代号与 id 匹配。动词行表 B 各栏（卷二十四 §2.2（维度）表 B，字段类型与取值域照该表，本卷只填值；全书加载修复批 甲-3）：`parent` 空；`payloadShape` 为 `{actionId: ref action, end: enum activity_end}`（`actor` 是公共栏位，取该活动的行动者，不进 `payloadShape`；`targets` 取空表）；`kindFrom` 空；`kindOnly` 假（发出系统恰好一个，即 `activity.mjs`）；`worthSlots` 为 `{destroyed: [], moved: [], stake: []}`（载荷没有实体、批次或金额字段；预留的处置经 `cost_row.onEnd` 另计）；`headSlot` 为 null；`sigBase` 写 0（占位待标定）；`tallies` 写 `[]`；`perceivable` 真、`senses` {视、听}（经句柄 `roles.senses.sight`、`roles.senses.hearing`；按卷十八 §2.3（本卷登记的资源种类行、合同种类行、事件动词）的整类判据：收工与以 `failed` 结束的发出点是长时动作到期后重走到 `aftermath` 的那次裁决事务（R9-3.4），属动作发出；以 `interrupted` 结束（复查时连带中止）、以 `abandoned` 清除（到期项）的发出点属非动作发出；多发出点取真）；`visibilityAllowed` 取卷二十四 §2.2（维度）表 A `visibility` 的全集 {`public`、`private`、`witnessed`}，当众程度由发出它的事务在集合内给出；`scandal` 取假（活动结束不是行为人的丑闻，按卷十八 §2.1（本卷定义含义的维度） `scandal` 的含义判）；`calendarBound` 取假（推进点、`finishAt` 与续做窗口都按世界分钟算，不是周期日到来或按历法锚定的到期，卷二十 §4.2.6（验收断言）不变量③）。

#### 4.1.4 交互

卷二 §2.5（状态谓词单点）（`can()`）；卷二 §1.13（需求块）；卷二 §3.3（求值管线）（`process.workPace`）；卷二十 §4.1（刻、同刻全序、调度器与到期语义）（到期项）；卷六 §4.1（账本三元键与守恒）（预留账户）；卷二十七 §4.1（三层模拟运行矩阵）；卷二十九 §4.3（面板数据绑定）（把 `affordances()` 渲染成菜单）；各领域卷（登记动作行）。通道：派生读取、声明写者、账本转移。

目录里应他卷请求登记的行（格式照 §2.2，不为它们写分支）：
- 卷二十二的四类持续活动行：阅读（卷二十二 §4.6（文书阅读、语言、代读、译本））、谋划（§4.7（秘密、钩子、阴谋）R22-7.5）、情报收集（§4.8（秘密结社与情报））、研究（§4.9（研究与创新机制）R22-9.2）；节奏读卷二十二规则表所列读数（如 `research.rateRows`），按 §2.6 以修正项挂 `process.workPace`；段末写入由卷二十二的写入口做（C22-15）。
- 卷二十四的五条通用动作行：发布委托、承接委托、交差、撤回委托（卷二十四 §4.5（委托与任务生成）R24-5.2、R24-5.7，经 `commissionStep`），举办活动（§4.6（活动）R24-6.2，向 `instanceStep` 提起始请求，`mode` 为 `requested`）；槽位只带代号、id 与数值参数，发布可带显式数额（C24-4）。
- 卷十五的六条施为基本动作行：开始施法、持续供能、仪式下一步，另有加入仪式、撤去术式、以人献祭（卷十五 R15-1.2、R15-7.2、R15-1.10、R15-7.11），各有菜单位置（I9-1）；开始施法与仪式下一步各有一个 `via` 槽位，随流派变化的各列按 R9-1.13 写 `from_slot`，`shapeFrom` 指卷十五 `castShape`（C15-1 ④）。

#### 4.1.5 数据实例

- 【西陲】铁匠铺里打一件农具。动作行 `act_craft_item`，类 `acls_heavy_labor`，`baseMinutes` 240，阶段 `astage_rough` 在 0、`astage_shape` 在 400、`astage_finish` 在 850。节奏求值 1.25，即 `paceUnits = 12500`。开工即算 `need = 240 × 10000 = 2400000`，`finishAt = paceSince + ceil(2400000 ÷ 12500) = paceSince + 192`。做到第 96 分钟时炉火熄灭触发重算：`acc = 0 + 96 × 12500 = 1200000`，`workDone = 120`，余数 0；`120 × 1000 = 120000`，不小于 `400 × 240 = 96000`，小于 `850 × 240 = 204000`，阶段为 `astage_shape`。
- 【非西陲】南海珠场采贝。动作行 `act_gather_stock`，类 `acls_dive`。前 30 分钟节奏 0.9：`acc = 30 × 9000 = 270000`，`workDone = 27`，余数 0。水温状态升档后节奏 0.75，再 10 分钟：`acc = 0 + 10 × 7500 = 75000`，`workDone = 34`，余数 5000。把这 40 分钟任意切成更多段提交，只要节奏变更点相同，结果逐位相同。
- 【非人类】蜂群筑巢。行动者是一个群落实体，没有技能表；动作行 `act_build_structure` 的 `capability` 取身体图给出的搬运能力，节奏修正来自群落规模维度登记的修正项。同一条 `state.activities` 记录、同一套阶段派生，没有为群落另写的活动逻辑。

#### 4.1.6 验收断言

- 扫描式：A9-1.1 规则层读取人物的活动文字字段、或对活动与状态做文字比较的行数为 0；缺 `menu` 或缺 `intimate` 的动作行数为 0；与单个动作代号一一对应的处理器函数个数为 0；不经执行器的写入口——卷二 §2.6（写者与三接口）三条写路里执行器适配器以外的全部写入口：`declareLedgerWriter` 登记的账本写者、world-events 订阅者、`state-owners.json`（卷二 §2.7（系统声明表 `state-owners.json`））登记的声明写者（含推进钩子、kernelApi 的终止与改挂原语）——按登记名逐一对应：其写者范围与全部动作行的重查集合 K 之并相交、写入的又不是锚点量（`stockMode: anchor`，按“连续变化的前提”处理）、而登记名既不在任何 `premise_break` 行“写入口登记名”一栏里、又不是 `declareLedgerWriter` 登记的账本写者的个数为 0（账本写者按“经账本离手”走（丁）路推进点抽查，口径是延迟不超过一个推进间隔，由 A9-1.2 “执行器外的账本写入”一句的不变量机判）；前提失效通知的订阅实现里点名单个状态行、实体或持有种类代号的分支数为 0；推进点重查（a）时，`ctx.sources` 不经此刻的 `accountsOf(行动者 id, …)` 取得（沿用开工时存下的账户列表）的调用处数为 0，场所类前提读行动者名下建筑份额或按持有种类放行的调用处数为 0，抽查实现里点名单个物品模板、账户或场所代号的分支数为 0。
- 不变量式：A9-1.2 同一组节奏变更点下，把任意一段工作切成任意多次结清，`workDone`、`workDoneRem`、`finishAt` 与一次结清逐位相同；`workDoneRem` 恒在 `[0, paceScale)`；存下的 `workDone` 恒小于 `workTotal`，到期收工后记录不存在；一次推进 N 分钟与分段推进合计 N 分钟得到同一份存档摘要；对任一在世活动，相邻两次活动推进的时刻差不超过 `rules.act.advanceMaxMinutes[该动作类]`；若某次经执行器的事务里本批原语写到的路径（W）与它的重查集合 K 相交，同一事务末步之后它的 `paceUnits` 等于此刻重新求值的结果，且 R9-1.12 ① 五项（`can()`、`interruptRX`、配合、（a）需求与槽位实体、（b）羁押受制）任一不过的活动在该事务后已结束（末步自身的写入不计入 W）；前提由 `premise_break` 表所列的直接写入变为不过的，活动在该事件投递的同一刻结束，带对应的 `interrupt_cause`，已做的工结清到该刻；前提按“连续变化的前提”能算出越界时刻的，活动在越界的那一分钟结束；其余不经执行器的变化只在推进点抽查：活动在变为不过之后的第一个推进点若前提仍不过即结束，相邻两个推进点之间失效又恢复的不追查；被捕（`custody` 行）与失去持有的工具、场所（`possession` 行）使 ①（b）、①（a）能力组不过的，同样在该持有变化事件投递的同一刻结束，`interrupt_cause` 分别为 `custody`、`requirement`；执行器外的账本写入（`declareLedgerWriter` 登记的写者）把需求块所读的账户、容器移出行动者名下、使 ①（a）不过且下一推进点时仍不过的，活动结束时刻与该写入时刻之差不超过 `rules.act.advanceMaxMinutes[该动作类]`，`interrupt_cause` 为 `requirement`；只改工位建筑份额归属、场所仍满足 R9-1.12“场所类前提”三项的，活动不因此结束；任一活动收工的那次事务里，① 五项前提都过。
- 扩展性式：A9-1.3 只加一条动作行、一条动作类条目与两条阶段条目（不改任何 .mjs），新动作出现在 `affordances()`、可由菜单提交、可开工、可中断、可续做。

### 4.2 原语目录与执行器

#### 4.2.1 维度

原语目录（`world/ontology/primitives.json`，封闭，设计目录 20 个、15 族：现役 19 个、14 族，另加转化原语 `transform`（下表 `transform` 行；封卷后勘误，李白 11-14 20:59 裁定 ②5，代码待迁入）；现行契约在 `server-plugin/primitive-schema.mjs`，`ops` 数组见第 6 行，必填字段见第 16–19 行，字段类型见第 4–13 行）。每个原语一份参数契约，字段全部是代号、id、数值（契约里写作 string 的字段都是 id 或代号，不是文字）。

| 族 | 原语 | 契约必填字段（可选字段从略） | 走哪条通道 | 落到谁的写者 |
|---|---|---|---|---|
| `transfer` | `transfer` | `from`、`to`（id），`qty`（integer） | 账本转移 | 卷六 §4.1（账本三元键与守恒）的转移入口 |
| `holding` | `holding.open` | `holdingKind`、`holder`、`subject` | 持有 | 卷十八 §4.1（持有种类表与两条转移协议）：持有写者先调该种类行 `admission` 列所指的准入入口（卷十八 R18-1.13，入口返回 `{ok, reason, events}`），通过才写边，写成后发入口给出的随附事件；不过即拒、整批回滚（封卷后勘误 1115k4，依据李白 k4r-1 裁定） |
| | `holding.close` | 二选一必填：`holding` 或 `id`（边 id），或 `holdingKind`、`holder`、`subject` 三元（只许种类行 `uniqueTriple` 为真的种类，卷十八 R18-1.13；李白 k4r-1 裁定） | 持有 | 同上（准入与随附事件同 `holding.open`） |
| | `holding.transfer` | `holding` 或 `id`；`newHolder` 或 `holder` | 持有 | 同上 |
| | `holding.rescale` | `holdingKind`、`subject`，`shares`（map<id, number>） | 持有 | 同上 |
| `obligation` | `obligation.create` | `id`、`obligationKind`、`debtor`、`creditor` | 声明写者 | 卷六 §4.16（合同状态机）的义务写者 |
| | `obligation.settle`、`obligation.cancel` | `id` | 声明写者 | 同上 |
| `fact` | `fact.set` | `entity`、`field`；`value` 或 `delta`（number）二选一 | 声明写者 | 目标维度在卷二 §2.7（系统声明表 `state-owners.json`）登记的那个写者 |
| `vital` | `vital` | `target`，`delta`（number） | 声明写者 | 身体量的写者，见卷二十一 §4.1（身体类状态实例） |
| `status` | `status` | `target`、`status`，`duration`、`magnitude`（integer） | 声明写者 | `status.mjs`，格式归卷二 §1.11（状态容器） |
| `move` | `move` | `to` | 声明写者 | 卷十七 `placeSubject`（`position.mjs`，人物位置的唯一写者，卷十七 §3（统一入口）；C17-11） |
| `create` | `create` | `kind`，`facts`（map）；`kind` 不是留痕时另须 `template` | 声明写者 | 实体创建，见卷二 §2.6（写者与三接口）；`kind` 为留痕时落 `mark-actions.mjs`（R9-15.2） |
| `destroy` | `destroy` | `entity` | 内核原语 | 实体终止协议，见卷二 §2.6（写者与三接口） |
| `transform` | `transform` | `subject`（id，被转化的个体），`variant`（ref vocab mvariant，变体模板句柄），`direction`（enum {`apply`, `revert`}：`apply` 为转去、`revert` 为复原），`cause`（起因句柄）（参数照卷十六 R16-12.3 所列四项；封卷后勘误，李白 11-14 20:59 ②5；代号 `roles.prims.transform` 即本行） | 调入口 | 卷十六 `proposeTransform`（本原语唯一的求值入口，R16-12.3）：适配器以本行参数调它，它在同一事务内给出的输出清单（物种改写交卷四写者、存量对平交卷五 `resource-field.mjs`、`roles.verbs.transformed` 事件）按本节固定展开续交本执行器；幂等与前提核对全归卷十六，本卷不重写 |
| `emit` | `emit` | `verb`，`visibility`（取值与含义唯一定义在卷二十四表 A，本卷照读） | 事件 | 事件写载体；事务内调一次卷五 `perceiveEvent` 写 `witnesses`（R9-2.10） |
| `schedule` | `schedule` | `at`（integer）；`action` 或 `rule` 二选一 | 声明写者 | 卷二十 §4.1（刻、同刻全序、调度器与到期语义）的到期堆（项的种类一律取 `due_scheduled`，§2.9） |
| `transition` | `transition` | `entity`、`kind`、`cause` | 声明写者 | 所属状态机的写者（合同、案件、对话、提案；卷十五的术式实例 `working.mjs` 与仪式记录 `rite.mjs`，迁移代号由卷十五登记，C15-1 ③）；适配器交出本事务产物引用（R9-2.9） |
| `learn` | `learn` | 现行 `subject`、`learningSource`；改为 `subject`、`skill`、`source`（ref learn_source）、`minutes`（integer）、`difficulty`（number nullable），与卷十四 `session` 对齐（R9-2.8） | 调入口 | 卷十四的 `gainSkill` |
| `time` | `time` | `minutes`（integer） | 声明写者 | 世界时钟，见卷二十 §4.1（刻、同刻全序、调度器与到期语义） |

效果族输出到原语的固定展开（五行，封闭，与卷二 §3.9（效果族表 `_effects.json`）的 `eff_output` 五值一一对应）：`modifier` 展开为带该修正项的 `status`；`status` 展开为 `status`；`primitive` 即所写原语；`event` 展开为 `emit`；`spawn` 展开为 `create`。

#### 4.2.2 统一入口

写：`execute(engine, state, primitives, cause)`，只在 `primitives-runtime.mjs`，只由 `resolve()` 的提交段与推进钩子的调度方调用。读：`primitiveContract(op)`。效果族求值调卷二 §3.9（效果族表 `_effects.json`）的 `effects()`，本卷不重写。

#### 4.2.3 规则

- **R9-2.1 目录封闭**：原语集合是卷一 §3A（共享计算设施）第 3A.9 项列出的封闭项；增删原语须改本卷并报批。开放的是效果族行与动作行。
- **R9-2.2 效果族回答做什么，原语回答怎么写**：效果族行算出对象集合、幅度与输出清单；执行器把输出清单按上面的固定展开变成原语列表。执行器不认识任何效果族代号。
- **R9-2.3 一次事务**：`execute` 先逐个按契约校验（不合即 E-ACT-PRIMITIVE，整批不执行），再按“原语在目录中的固定序、同原语按列表下标”排定次序，在一次内核事务里逐个交给对应通道的适配器；任一适配器拒绝则整批回滚。事务末步按 R9-1.12 对重查集合与本批写入相交的活动各做一次活动推进（它们的写入属同一事务）。成功后恰产出一条以本事务原语为 `primitives` 的事件，带原语列表、起因与骰值键，事件 id 按 §2.9 派生；写者协议在事务内另发的事件（定义卷的写入规则规定随某类写入在同一事务内一并发出的一整类：卷二 §2.6（写者与三接口）终止、复生的内核事件，卷十八 R18-1.11 持有变化、R18-1.10 常住变化事件，及今后按同一写法登记的事件）`primitives` 一律为空，id 按 §2.9“写者协议在事务内另发的事件”一行（位次 `pos.kernel`），另计，不在此“一条”之内（封卷后勘误，李白 11-14 卷二十四二审 N1；整类扩写见修订记录 1114j 行）。
- **R9-2.4 适配器按原语分，不按领域分**：每个原语一个适配器。适配器里没有实体 id、没有按类别名写的分支；领域差别只来自参数与目标写者。
- **R9-2.5 参数只有代号与数值**：原语参数的类型是卷二 §1.5（类型清单）里除 `string` 之外的类型。`fact.set` 的目标必须是某张维度表里登记的非文字维度，并且该维度的写者声明允许经执行器写。
- **R9-2.6 别卷的输出清单**：推进钩子与反应规则返回的输出清单（形状同效果族输出）由钩子的调度方交 `execute` 执行，`cause` 取钩子或反应规则的登记代号。推进钩子另可按卷二 §2.6（写者与三接口）在其登记写者范围内经 `writePath` 直写；这类写入不经执行器，对活动与决策的影响按 R9-1.12、R9-12.7 的推进点上界处理，本卷不另设回调。
- **R9-2.7 守恒**：实物与钱的增减只能是 `transfer`；`create`、`destroy` 涉及实物时，原语列表里必须有与之配对、指向登记源汇账户的 `transfer`，否则 E-ACT-PRIMITIVE。
- **R9-2.8 `learn` 不含成长算法**：善后段按动作行 `skillGain` 组出 `learn` 原语：`skill`、`source` 取该字段；`minutes` 取本次实际工时（长时动作取开工到收工的世界分钟数，瞬时动作为 0，0 分钟怎样计归卷十四）；`difficulty` 取本次检定的 `difficulty`（不检定为空）。适配器把它原样组成卷十四的 `session = {minutes, source, difficulty}` 交 `gainSkill(engine, state, personId, skillId, session)`；技能涨多少归卷十四 §4.12（成长、经验与兼修负担），`teacher`、`carrier`、`group` 由登记该动作行的卷经槽位给出时一并原样转交。`skillGain.skillFrom` 非空的，`skill` 取善后段以 `(engine, state, 行动者 id)` 调该入口所得 `field` 的值，为空即本次不组 `learn`（C13-7）。
- **R9-2.9 `transition` 适配器交出本事务产物引用**（C15-1 ③）：`transition` 适配器按 `entity` 所属的状态机调该状态机登记的写入口，`kind` 是该状态机登记的迁移代号；每次调用都把本次事务中先于它执行的各原语适配器返回的产出引用（建立的状态实例、持有边、合同、实体等的 id，按执行次序）作为一个列表一并交给写入口，用不用由所属卷定。适配器不认识任何状态机、迁移代号或效果族代号；它在固定序里排在 `holding`、`obligation`、`status`、`create` 之后（R9-2.3），所以这些产物在交出时已存在。
- **R9-2.10 `emit` 写目击名单，只算一次**（封卷后勘误，李白 11-14 20:22 根因 G 总规矩、P-1、P-2）：`emit` 适配器在本事务内、事件落定之前，对该事件调**一次**卷五 `perceiveEvent(engine, state, {verb, visibility, actor, targets, place, sourceLevels})`（签名照卷五 §3.2（判定与动作入口））：`verb`、`visibility`、`actor`、`targets` 取该事件记录的同名字段，`place` 取其 `payload.place`，`sourceLevels` 是以 `actor` 为行为人、照卷五 §4.2（分区、方位与感知通道） 规则 7 求出的各感官一次性源强（行为人此刻所做动作行的 `sourceStrength` 列作修正项叠加，§2.2；求法与未知的处置只照规则 7，本卷不另写）。返回结果原样写进该事件记录的 `witnesses`（形状唯一定义在卷二十四表 A）。按 `visibility` 分档（`private` 为空表等）全在 `perceiveEvent` 内，本卷不按档分支。目击名单只此一处求：执行器、别的原语与别卷都不为同一事件另调 `perceive` 或 `perceiveEvent`，一律只读 `witnesses`。

#### 4.2.4 交互

卷二 §3.9（效果族表 `_effects.json`）；卷二 §2.6（写者与三接口）；卷六 §4.1（账本三元键与守恒）；卷十八 §4.1（持有种类表与两条转移协议）；卷十四 §4.12（成长、经验与兼修负担）；卷二十六 §4.4（想法与心情）（其推进钩子的输出清单由本执行器执行）；卷二十七 §4.7（复演与规则只一版）（事件里的原语列表供复演核对）；卷五 §3.2（判定与动作入口）、§4.2 规则 7、9（`emit` 调 `perceiveEvent` 写 `witnesses`，R9-2.10）；卷十六 R16-12.3（`transform` 调 `proposeTransform`）；卷二十四表 A（事件记录字段）。通道：四通道全部。

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

`Intent`（§2.4）；`resolve_stage`、`degree`、`intent_origin`（§2.1）；`rules.check.*`（§2.5）；`process.checkAbility`、`process.checkDifficulty`（§2.6）；`ability_row`（§4.7.1）；抽取点与事件 id 派生（§2.9）。检定上下文 `ctx = {actor, actionId, slots, skill, tools, materials, place, facility, opponent}`，全部是 id 与代号，由本管线从意图与 view 组出。

#### 4.3.2 统一入口

写：`resolve(engine, state, intent)`，全书唯一的动作结算入口。读：`check()`、`quoteOf()`、`controlledByPlayer()`。

#### 4.3.3 规则

- **R9-3.1 九段**：`resolve` 按下表顺序执行，段不可跳、不可换序。

| 段 | 做什么 | 读 | 不过时 |
|---|---|---|---|
| `shape` | 动作行存在；每个槽位类型相符、值在候选集内 | `actionView()`、候选生成 | E-ACT-UNKNOWN、E-ACT-SLOT |
| `capacity` | 行动能力；行动者不在使本动作类受制的羁押下（同 R9-1.12 ①（b），兑现卷八b A8b-12.1“动作可行性读 `barsActions` 只在卷九动作裁决一处”）；当前活动是否容得下 | `can()`、`custodyOf()`、`activityOf()` | E-ACT-CAPACITY、E-ACT-BUSY |
| `precondition` | 需求块与 `whenRX` | 卷二 §1.13（需求块）的求值 | E-ACT-PRECONDITION |
| `consent` | 动作行 `consent` 声明的配合事项（只此一类，R9-8.1） | `consent()` | E-ACT-CONSENT |
| `quote` | 工时、代价付不付得出、难度、上限；另把效果族 `consent`、`authority()`、`legalityOf()`、`canEnter()` 的读数放进报价供显示，不拦 | `difficultyOf()`、`magnitudeCap()`、账本余额入口 | E-ACT-COST |
| `check` | 检定，得成功度 | `check()` | 不会不过 |
| `effects` | 取该成功度的效果，求值，限幅，展开成原语 | `effects()`、`magnitudeCap()` | E-ACT-PRIMITIVE |
| `commit` | 执行器一次事务 | — | 回滚 |
| `aftermath` | 成长申报、事实记录（含未得同意、无权能、无权进入的事实，R9-3.10）、反噬 | `gainSkill`、`noteFact` | 不回滚已提交部分；各自以独立事务执行，事件 id 按 §2.9 |

- **R9-3.2 来路无关**：九段都不读 `intent.origin`。同一状态、同一时刻、同一意图，无论来自菜单、译码、NPC 决策还是续做，产生的事件与状态改动逐值相同。
- **R9-3.3 拒绝带原因与替代**：任一段不过，返回 `{code, stage, alternatives}`；`alternatives` 是 `affordances()` 里与该动作同菜单组、此刻四段试算都通过的条目。没有“近似地改做另一件事”。
- **R9-3.4 长时动作分两次**：`baseMinutes` 大于 0 的动作，开工时走 `shape` 到 `quote` 五段并提交“开工”（预留代价、写活动记录）；到期时从 `capacity` 重新走到 `aftermath`。检定在收工时做。
- **R9-3.5 检定**：`ability` 是 `process.checkAbility` 的求值结果，基值 =（动作声明了技能时）`skillValue(engine, state, actor, skill, ctx)` 加上动作行所列各 `ability_row` 的值；`ability_row` 与 `difficulty_row` 同形、同算法（R9-7.1），项里 `of: actor` 读卷四的属性修正 `attrMod` 与身体投入 `workInputs`，所以力量、体型、物种身体图进检定，而卷十四 SK-5“属性不进技能读数”不受影响（属性是另一项，不在 `skillValue` 里）。没有技能表的行动者（野兽、群落）同样由能力行给出基值，没有统一的常数底值。`difficulty` 是 `process.checkDifficulty` 的求值结果，基值见 §4.7。`roll` 按 §2.9 的键从 `rules.check.rollDist` 抽一次。`margin = ability − difficulty + roll`。成功度由 `margin` 不小于 `rules.check.degreeBands` 中几个界决定：0 个为 `critical_failure`，1 个为 `failure`，2 个为 `partial`，3 个为 `success`，4 个为 `critical_success`。全程只有加减与比较。
- **R9-3.6 对抗检定**：`check.opposed` 为真时，对手一侧用同一条式子算 `ability` 并在第二个抽取点抽一次，`margin =（己方 ability + 己方 roll）−（对手 ability + 对手 roll）`。对抗用哪两项技能由登记该动作行的卷给出；战斗只是其中一类行（卷十三 §4.1（个人战斗结算））。`check.opponentRows` 非空时，对手一侧的能力行换成 `opponentRows`，其余照同一条式子（R9-3.5）；为空即用同一条式子（C13-7）。
- **R9-3.7 不检定的动作**：`check` 为空的动作成功度恒为 `success`，不抽取。
- **R9-3.8 事件 id 不撞**：提交段与善后各事务的事件 id 按 §2.9 的表派生：同一行动者同一分钟的第二次提交以第一次的事件 id 为主体段，善后各事务以登记代号为规则段、以提交事件 id 为主体段。没有幂等禁令与计数器；同一请求被重复投递由卷二 §2.9（外部边界与 Text 模型）第 0 条 `ReplyHandle` 一次一用挡住，不在本管线。
- **R9-3.9 谁出意图**：一个实体由玩家出意图，当且仅当它有一条在世的“玩家席位边”：持有种类由 `rules.control.seatKind` 指名，本卷在卷十八 §4.1（持有种类表与两条转移协议）的种类表登记这一行，`bodyControl` 为假、`intimate` 为假、`grants` 为空（所以它不算操控类边，卷八b R8b-2.2 的 `capable` 与卷十八 R18-9.1 的“参与的身体”都不读它）；卷十八主列：`hyper` 空，`from`、`to` 都为 `agent`，`exclusive` 真，`gone`、`vacated`、`defected` 都为 `ho_close`（终止时不移交给后继），`subjectEnd` 为 `send_close`，`concluded`、`functional`（昏迷时仍归玩家）、`membership`、`headship`、`carriesRel` 都为假，三个传导系数 `conduct`、`conductBack`、`adopt` 都为 0（否则 R18-4.4 会把对该实体的立场传回它自己），`pins` 为 `pside_none`，补充列 `visibility` 为 `members`；持有者与标的都是受控实体本身（端类型为实体模板；玩家不是世界里的实体，席位边只标记“这具身体听玩家的”）。`controlledByPlayer()` 只读这条边，它就是卷二十七 R27-1.2 观察锚所说“经定义卷提供的 view”，登记路径即该种类在 `holdings` 下的路径。开立与关闭只经执行器的 `holding.open`、`holding.close`，由会话命令发出（R9-6.8）。菜单路由只接受行动者受控的意图；`npcChoose()` 跳过受控的实体。附身、驱使另一具身体仍是卷十八的 `bodyControl` 种类，与席位边无关。
- **R9-3.10 合法性是后果**：九段里没有“是否合法”这一段，也没有“社会上该征得同意”这一段。提交之后，`aftermath` 经卷八b §4.2（罪名谓词与立案到执行）的 `noteFact` 记事实：本次事件本身；各效果族 `consent` 不成立的对象（未得持有人或本人同意）；`authority()` 不成立的权能；`move` 进入的地点里 `canEnter` 为假的（卷五 §4.13（进入权与私宅许可）规则 4 的“无权进入”事实）。合不合法由卷八b §4.5（合法性是后果）的 `legalityOf` 在别人需要判断时读出。`quote` 段把这些读数放进报价供显示，NPC 决策可以把它算进风险，但都不拦提交。卷八b §4.4（法律门控）的门控同样不拦（卷八b R8b-4.5）；它封闭列出的“设立身份的写入”由各自的卷在写入处自查，不经本管线的前置段。
- **R9-3.11 不读墙钟**：动作耗时只以世界分钟计，推进只经 `time` 原语与卷二十的调度器。
- **R9-3.12 聚合层不逐人裁决**：只有个体层的主体走本管线。聚合层的结果由卷二十七 §4.2（聚合变体、等价、钉住）的规则给出，等价性归该节。

#### 4.3.4 交互

卷二 §2.5（状态谓词单点）；卷二 §1.10（随机实例化）；卷十四 §4.3（技能与熟练）（`skillValue`，检定上下文由本卷构造后传入）；卷八b §4.5（合法性是后果）；卷十三 §4.1（个人战斗结算）（登记对抗行与伤害结算，不另写骰法）；卷十四 §4.8（隐藏职业契机）（其触发是订阅本管线事件的反应规则）；卷二十七 §4.8（种子键与骰值键（确定性约束与验收））；§4.7、§4.8、§4.12。通道：四通道全部。

#### 4.3.5 数据实例

- 【西陲】撬一把门锁。`ability` 46（技能读数 40，工具修正项 +6），`difficulty` 52，`roll` +9，`margin = 46 − 52 + 9 = 3`。界 `[−20, 0, 10, 25]` 中有 2 个不大于 3，成功度 `partial`；动作行在 `partial` 下的效果是“开了但留下痕迹”，痕迹是一条 `fact.set`。门是别人的：效果族的 `consent.mode` 为 `holder`，门主没有同意，这一读数进报价，善后段记一条“未得持有人同意”的事实；事后门主若发现，由卷八b读事实判定，不是本管线拦下。
- 【非西陲】草原上套住一匹野马。对抗检定：己方 `ability` 38、`roll` −4，对手 `ability` 30、`roll` +7，`margin =（38 − 4）−（30 + 7）= −3`，界中有 1 个不大于 −3，成功度 `failure`。对手是生物，没有技能表：它的 `ability` 全由动作行的能力行给出（读它的 `attrMod` 与 `workInputs`），同一条式子。
- 【超自然】向一名昏迷者施治愈术。`capacity` 过（施术者清醒）；动作行声明施术须对象配合，`consent` 段因对象不能表态而查条款行（§4.8）；`check` 用施法技能；`effects` 段把请求幅度 32 限到上限 25（§4.7）。全程与撬锁走同一个 `resolve`。

#### 4.3.6 验收断言

- 扫描式：A9-3.1 `resolve` 之外写 state 且起因是动作的调用点数为 0（S9-1）；`check` 之外把骰值映射成成功度的位置数为 0（S9-4）；九段代码里读 `intent.origin` 的行数为 0；前置段与同意段读效果族 `consent`、`authority()`、`legalityOf()`、`lawGate()`、`canEnter()` 并据以返回错误码的位置数为 0；`ability_row` 之外给检定能力加常数底值的位置数为 0。
- 不变量式：A9-3.2 同一状态下把同一意图分别以四种来路提交，事件与状态逐值相同；同一种子、同一意图序列重跑，存档摘要相同；新增一个抽取点不改变既有检定的结果；同一行动者同一分钟内连续提交同一动作、同一对象两次，两次都结算且事件 id 不同；同一次结算的提交事件与各善后事件 id 两两不同。
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
- **R9-4.4 产物由三样共同推出**：凡输出带品质档的实物（制作类效果），一律调卷三乙 §4.8（配方通用规则（继承、产率、递归））的 `craftOutcome(engine, state, recipeId, ctx)`，`ctx = {actor, site, sources, intent: {choices, times, care, emphasis, improviseClass}}` 由本管线从槽位组出（`improviseClass` 是 ref vocab class，可空，只在 `recipeId` 为空时读，卷三乙 R-13）。产物模板、材料继承、产率、工时、品质档都在它里面：检定由它的第 6 步调本卷 `check()` 一次（所以这类动作行 `check` 为空，§2.2），品质档只在它内部滚档（卷三乙 §4.5（品质档）Q-2），本卷不另算品质、不挂品质修正。它返回的 `outcome`（`success` `botched` `ruined`）经 `rules.act.craftDegree` 折成 `degree`，供取效果列与反噬；`outputs`、`byproducts`、`toolWear` 由执行器经账本与声明写者落成。没有配方行的即兴制作由卷三乙在该入口内定（卷三乙 R-13，§5.3 勘7 已落地）：`recipeId` 为空时，`craftOutcome` 以 `rules.crafting.improvise[intent.improviseClass]` 这一条目（按 `class` 族整类给，是配方行的子集）代替配方行，其余照卷三乙 R-2 至 R-10 与七步；`improviseClass` 为空或规则表没有该键时返回 `ok: false`、原因代号 `no_improvise`。本卷不为即兴另挂修正。
- **R9-4.5 不限类别**：任何登记的效果族都可进提案。幅度上限由 §4.7 的上限行给出；某族没有上限行是加载错误，不是“这一类不支持”。
- **R9-4.6 留痕**：确认并提交的提案，其事件带提案的结构（效果族代号、对象 id、幅度、落地级别）。
- **R9-4.7 NPC 的提案**：NPC 由候选提供者给出的开放提案不经预览，直接进 `resolve()`；预览只是给出意图一方的确认步骤，不是裁决的一段，所以两者结算相同。

#### 4.4.4 交互

卷二 §3.9（效果族表 `_effects.json`）；卷三乙 §4.8（配方通用规则（继承、产率、递归））（`craftOutcome`）、卷三乙 §4.1（材料归类与聚合（由卷三甲的数值推出））、卷三乙 §4.5（品质档）、卷三乙 §4.6（工具能力）；卷二十 §4.1（刻、同刻全序、调度器与到期语义）（过期到期项）；§4.3、§4.7、§4.15。通道：声明写者、派生读取。

#### 4.4.5 数据实例

- 【西陲】用藤条和湿泥补一口裂了的灶。提案两项：`eff_repair`（对象是灶，手段是藤条与泥，参数 `param_amount` 请求 20）与 `eff_consume`。预览报价：上限 14（技能项 22、材料项 14 取小），工时 45，难度 31。确认时报价未变，进 `resolve()`；修复量按 14 计。
- 【非西陲】沙漠商队用驼毛毡与木杆搭遮阳棚。产物类别取意图给的“遮蔽类”代号；耐风、隔热两项物性由毡与杆的材料数值聚合得出；品质档由 `craftOutcome` 按搭建技能、材料与检定余量滚出。换成芦席与竹竿，同一条提案得到不同物性，没有新规则。
- 【超自然】向井里的精怪许愿求雨。提案一项：请求类效果族，对象是精怪实体。它是带 `divine` 标记的生物，经 `npcDecision()` 给出决定；答应之后它自己的施与走它那一行登记的效果族与预算。提案这一侧只是一次请求。

#### 4.4.6 验收断言

- 扫描式：A9-4.1 开放路径代码里的效果族代号字面量数为 0、材料类别字面量数为 0；`preview` 调用栈里除 `state.proposals` 外的写入数为 0；`craftOutcome` 之外算品质档或挂品质修正的位置数为 0。
- 不变量式：A9-4.2 预览后不确认，除 `state.proposals` 外存档内容与预览前逐值相同；同一提案由玩家确认与由 NPC 直接提交，事件与状态逐值相同；提案产物的每个数值维度都能由 `explain()` 追到材料、技能或意图三者之一。
- 扩展性式：A9-4.3 新增一条效果族行与对应上限行后，该族立刻可进提案；新增一种材料行后，用它做手段的提案产物物性随之不同，不改 .mjs。

### 4.5 无模型构造器

#### 4.5.1 维度

`intent_form` 行表（`world/actions/forms.json`）：`{id, actionId, preset: map<槽位代号, list<ref target_filter>>, menu}`。`rules.open.magnitudeSteps`（integer，≥ 1）。候选排序键 `rules.constructor.rankKeys`（list<排序键代号>，取自封闭枚举 `rank_key`：`owned` `distance` `recent_agenda` `id`）。

#### 4.5.2 统一入口

读：`affordances()`、`constructorTree(engine, state, viewerId)`（把可做之事投影排成菜单树，返回代号、候选 id、数值域与 `labelKey`）。构造器不写状态；点选结果由客户端 host 以代号发到菜单路由（卷一 §2.9.1（显示层））。

#### 4.5.3 规则

- **R9-5.1 构造器是投影的渲染**：菜单树只由 `affordances()` 与动作行的 `menu` 字段生成。第一步选动作，其后每个槽位一步，从候选列表里点选；数值槽给整数输入或步进；时间槽给日期选择器，交出两个槽位：`whenAnchor`（历法锚代号，候选取卷二十 §4.2（历法数据与周期日规则格式）的历法表）与 `whenDay`（整数日数）。显示用的年月日由卷二十 `calendarView` 投影；规则层要的世界分钟由卷二十 `calendarMinuteOf` 从锚与日数算出，本卷不自算历法。
- **R9-5.2 开放提案的表单**：选对象；选效果族（只列 `targetSelector` 与对象相容、需求块此刻可满足的族）；选手段（从持有物候选里选）；选幅度（把参数取值域等分为 `rules.open.magnitudeSteps` 档，步长 =（上界 − 下界）÷ 档数，档数是不小于 1 的正整数）；可选一个命名槽，交出的只是卷一 §2.9.2（安全两道闸）所说的命名意图。
- **R9-5.3 预填与排序**：每个槽位的候选按 `rules.constructor.rankKeys` 列出的键依次排序，第一个候选预选。排序只用数值与 id；不存“上次选了什么”。
- **R9-5.4 形式模板**：`intent_form` 行是“动作加若干槽位筛选”的具名快捷项，只为缩短点选步数；它展开后就是普通意图。
- **R9-5.5 不解析文字**：构造器的输入只有点选、编号与数值。没有“去掉客套话后看剩下什么”之类的步骤；译不出的键入由 §4.19 退回菜单。
- **R9-5.6 可表达集合 C 与可玩性等式**：C 定义为“`shape` 段接受的全部意图”。因为构造器的候选生成与 `shape` 段是同一个函数，构造器能点出的集合恰等于 C；模型译码交出的意图也必须过 `shape` 段，所以开不开模型，能提交的意图集合相同。缺口只有一类：登记的效果族表达不了的新事物，它在两档下都只得到留痕或拒绝（§4.15）。卷一 §7（AI 的位置）第 7.1 条第 2 款要求的覆盖核对见 §6。
- **R9-5.7 模板对白**：不开模型时，NPC 的台词由显示层按决定卡代号走模板（卷二十九 §4.2（叙述模板与片段库）），本卷只保证每条决定卡的槽位都是代号、id 或数值（`card_slot_type`，附录列出首批六张卡各自的槽位），模板据此填数。

#### 4.5.4 交互

卷一 §2.9.1（显示层）；卷二十九 §4.2（叙述模板与片段库）、卷二十九 §4.3（面板数据绑定）；卷二十 §4.2（历法数据与周期日规则格式）；§4.1、§4.4、§4.19。通道：派生读取。

#### 4.5.5 数据实例

- 【西陲】在铺子里买东西：选“交易”组，选 `act_trade_buy`，卖方槽候选两人（按距离排），货品槽候选来自卖方可售清单，数量槽整数 1 到存量。四步点完即一个完整意图。
- 【非西陲】在高原驿站约定三日后出发：时间槽交出 `whenAnchor` 为历法表里“自今日起”的锚代号、`whenDay` 为 3，世界分钟由 `calendarMinuteOf` 算出。玩家换成当地另一种历法显示，交出的结构不变。
- 【非人类】命令一只驯养的猎犬去追踪：行动者是玩家操控的人，`act_command_animal` 的对象槽是犬（犬对主人的服从是卷十八的持有边），追踪本身由犬经同一目录的行去做；若玩家选择直接扮演这只犬（它有席位边），动作候选只有它的身体图与训练状态容得下的几行；与人物用同一棵菜单树生成函数。

#### 4.5.6 验收断言

- 扫描式：A9-5.1 构造器与菜单树生成代码中文字匹配、正则、子串函数的出现次数为 0；`intent_form` 行里文字字段数为 0。
- 不变量式：A9-5.2 对任一状态，枚举构造器可点出的全部意图，逐个交 `shape` 段都通过；反过来随机生成通过 `shape` 段的意图，都能在菜单树里找到一条点选路径；中文与英文语言包下菜单树的代号结构逐值相同。
- 扩展性式：A9-5.3 新增一条动作行或一条 `intent_form` 行后，菜单树自动多出对应项，不改 .mjs 与界面代码。

### 4.6 路由

#### 4.6.1 维度

上行请求体的意图部分（`schema:wire-up-menu-v1`、`schema:input-edge-v1`，文件归卷二 §2.7（系统声明表 `state-owners.json`））；`rules.route.maxSteps`（integer，≥ 1）；`target_filter` 族；`decode_result`；`pace_target`；`ReplyResult` 中本卷负责的字段（§2.4）。

#### 4.6.2 统一入口

`route(engine, state, request)`：菜单路由与输入路由共用的规则层分发函数，只收代号结构。它先把候选编号换成 id 与代号（R9-6.7），再决定这次请求交给 `resolve()`、`preview()`、对话动作、等待推进或会话命令（R9-6.8）中的哪一个，并把结果写成卷二 §2.9（外部边界与 Text 模型）第 0 条的 `ReplyResult`，本卷负责的字段见 §2.4。

#### 4.6.3 规则

- **R9-6.1 按签名分发**：分发只看动作代号与槽位种类。没有同义词表，没有按词打分；动作代号不在目录即 E-ACT-UNKNOWN。
- **R9-6.2 行动者不由输入给**：`actor` 取本次会话里有玩家席位边的实体（R9-3.9），输入里带的行动者字段被忽略并记旁路。
- **R9-6.3 筛选式指代**：意图可以不给 `targetRef`，而给 `scope` 与 `relation` 两个独立的筛选代号。路由用这两个 `target_filter` 的 `whenRX` 从候选集里筛：恰剩一个即填入；剩零个或多个即返回 `ambiguous` 并带上剩下的候选，由菜单让人选。不取“最近的”“第一个”。
- **R9-6.4 多步**：一次请求可带不超过 `rules.route.maxSteps` 个意图，顺序执行，第一处失败即停，已提交的不回滚。
- **R9-6.5 等待**：带 `wait` 槽位（分钟数）的意图交卷二 §2.9（外部边界与 Text 模型）第 0 条“推进计划与心跳推进”所述的推进请求；路由不自己推进时钟。
- **R9-6.6 场内场外**：`channel` 为 `ooc` 的请求不构造意图、不结算、不推进；它只可能引出一次叙述请求（§4.9）。
- **R9-6.7 两层槽位与换算**：线上只有卷二 §1.9（代号、显示名与语言边界）第 2 条的三种值——候选编号、数值、`{filled:true}`。动作行槽位的 `slot_kind` 决定线上传哪种：`code` 传候选编号（`multi` 为真时传候选编号的列表），`number` 传数值（越出该槽 `min`、`max` 即拒收），`text` 只传已填标记。`route()` 在 `shape` 段之前按本回合 `affordances()` 的候选表把每个候选编号换成实体 id 或代号，得到 §2.4 的内部 `Intent`；编号不在表内即 E-ACT-SLOT。时间不是结构槽位，而是 `whenAnchor`（`code`）与 `whenDay`（`number`）两个槽位。所以通用槽位与动作专有槽位都只用 `slot_kind` 的三值加 `multi` 表达；“列表传候选编号的列表”卷二第 2 条已按 §5.3 勘2 补一句。
- **R9-6.8 会话命令**：不是世界动作、不进目录、不走九段的请求只有两种，由 `route()` 直接处理并交执行器（起因取该命令的登记代号，事件 id 按 §2.9）。① 节奏设置：带 `paceTarget`（`pace_target`）与 `paceLevel`（卷二十 `pace_level` 代号，可空）两个槽位，执行器发一条 `emit`，动词为卷二十 §4.10（世界节奏 pace）登记的 `verb_pace_set`，载荷 `{level, away}`：`paceTarget` 为 `away` 时 `away` 为真，为 `level` 时为假；写 `pace.*` 的仍只有卷二十的 `pace.mjs`。② 席位：开局与换人时开立或关闭玩家席位边（R9-3.9）。两种命令都不检定、不推进时间、不读来路；NPC 没有会话，所以不发它们，这不违反 R9-1.11（它们不是目录里的动作）。

#### 4.6.4 交互

卷二 §2.9（外部边界与 Text 模型）（回应通道）；卷二十九 §4.7（前端适配器与输出守门）（上行只传代号）；§4.3、§4.4、§4.13、§4.19。通道：派生读取。

#### 4.6.5 数据实例

- 【西陲】玩家点“攻击”，目标筛选给 `scope = tf_adjacent`、`relation = tf_hostile`。面前有两名敌对者：返回 `ambiguous` 与两个候选编号，菜单列出两人。
- 【非西陲】雨林渡口一次请求带两步：先付船资，再登船。第一步因钱不够 E-ACT-COST，第二步不执行，回应里带第一步的错误码与替代项。
- 【非人类】玩家控制的信鸽被下达“飞往某地”：行动者由这只鸽子的玩家席位边确定，输入里若夹带别的行动者 id 一律忽略。

#### 4.6.6 验收断言

- 扫描式：A9-6.1 路由代码里对请求字段做文字匹配、子串或正则的行数为 0；同义词表文件数为 0。
- 不变量式：A9-6.2 候选多于一个时路由从不自行选定；`ooc` 请求前后除文字路径外存档逐值相同；同一批意图一次请求提交与逐个请求提交，状态逐值相同；线上载荷里只有候选编号、数值与已填标记，换算后的内部意图里每个 id 与代号都在本回合候选表内；`pace.*` 只经 `verb_pace_set` 改变。
- 扩展性式：A9-6.3 新增一条 `target_filter` 条目（只写 `slot` 与 `whenRX`）后，菜单与译码都能用它做指代，不改 .mjs。

### 4.7 幅度上限、难度派生与反噬

#### 4.7.1 维度

封闭枚举 `ctx_role`：`actor` `target` `material` `tool` `place` `facility` `opponent`。五张行表，都在规则表目录下，由各领域卷登记行：

| 行表 | 字段 | 说明 |
|---|---|---|
| `difficulty_row` | `id`；`base: number`；`terms: list<struct{of: ctx_role, dim: 维度代号, curve: curve, onUnknown: number}>` | 一行给出一部分难度 |
| `ability_row` | 与 `difficulty_row` 同形 | 一行给出一部分检定能力（R9-3.5）；`of: actor` 的项读卷四 `attrMod`、`workInputs` 一类维度 |
| `cap_row` | `id`；`family: ref effect`；`param: ref vocab parameter`；`terms: list<struct{of: ctx_role, dim: 维度代号 \| cap_term_ctx, curve: curve（值域 ≥ 0）, onUnknown: number ≥ 0}>`（非空；`dim` 取 `ctx_skill` 时 `of` 须为 `actor`，R9-7.3；C15-1 ②）；`overreachCurve: curve（x ≥ 0，y ∈ [0, 1]）` | 一行给出某族某参数的上限 |
| `cap_exempt_row` | `id`；`family: ref effect`；`param: ref vocab parameter`；`reason: 豁免理由代号` | 某族某参数不设上限，写明理由代号；同一参数不得同时有 `cap_row` |
| `cost_row` | `id`；`resource: 资源种类代号 \| 身体量代号 \| from_slot`（`from_slot` 即取引用它的动作行 `shapeFrom` 入口返回的 `costResource`，R9-1.13；C15-1 ①）；`amountRX: rx`；`reserve: boolean`；`onEnd: enum(refund, forfeit)` | 代价 |

#### 4.7.2 统一入口

读：`difficultyOf()`、`magnitudeCap()`。两者都是纯函数，基值算出后交卷二 §3.3（求值管线）经 `process.checkDifficulty`、`process.magnitudeCap` 求值。

#### 4.7.3 规则

- **R9-7.1 难度从对象维度推出**：难度基值 = 动作行所列各 `difficulty_row` 的 `base` 与各项 `curve(该角色实体的该维度读数)` 之和。读数未知时该项取 `onUnknown`。动作行、效果族行、代码里都没有难度数字。
- **R9-7.2 多件材料**：`of: material` 而所耗材料不止一件时，读数取卷三乙 §4.1（材料归类与聚合（由卷三甲的数值推出））对这组材料给出的聚合读数；怎样聚合归该节，本卷不另写。
- **R9-7.3 上限取各项最小**：某族某参数的上限基值 = 该参数全部 `cap_row` 的全部项 `curve(读数)` 中的最小值；再经 `process.magnitudeCap` 求值，结果不小于 0。给出这个最小值的项所在的行叫该参数本次的“约束行”；几项同为最小时取行 `id` 码序最小者。项的 `dim` 取 `ctx_skill` 时，读数 = `skillValue(engine, state, actor, ctx.skill, ctx)`，即本次检定技能的读数（检定技能取自槽位时即槽位所指条目给的技能，R9-1.13），所以同一条上限行对不同施为者各读各的检定技能；`ctx.skill` 为空时读数未知，取 `onUnknown`（C15-1 ②）。
- **R9-7.4 限幅**：`effects` 段把每个参数的请求值与上限比较，取小者代入效果族求值；`overreach = max(0, 请求值 − 上限)`。
- **R9-7.5 覆盖是加载校验**（按参数判，唯一定义处；本卷 §2.2 校验句与 §2.8 E-ACT-CAP-MISSING 照此读，封卷后勘误 1115k4，李白 ce6e990b ① (d)）：每个效果族的每个声明的数值参数，要么至少有一条 `cap_row`，要么有一条 `cap_exempt_row`；两者皆无、或两者都有，即 E-ACT-CAP-MISSING。数值参数集为空的族不需要 `cap_row`，但须在族表里显式声明数值参数为空（`params` 行上写 `{}`，不得省略），未声明即 E-ACT-CAP-MISSING；不为空参数族开豁免行。凡输出里产生实物或改写实物维度的族，其上限行合起来必须至少有一项 `of: actor`、至少有一项 `of: material` 或 `of: tool`，缺一类同样是 E-ACT-CAP-MISSING。要检定的动作没有难度行即 E-ACT-DIFFICULTY-MISSING。
- **R9-7.6 反噬**：成功度为 `critical_failure`，或 `overreach` 大于 0 且成功度不高于 `failure` 时，执行动作行的 `backlash`。反噬的 effectCall 以行动者自己为对象。严重度：对本次每个受 `cap_row` 约束的参数，取它约束行的 `overreachCurve(该参数的 overreach)`（没越限即在 0 处取值）；多个参数时取其中最大者，反噬只执行一次。本次没有任何参数受 `cap_row` 约束（都豁免或动作不带幅度参数）时，反噬按动作行 `backlash` 所写参数原样执行。它经同一个执行器、作为善后事务提交，事件 id 按 §2.9 的 `aft.backlash`。
- **R9-7.7 代价**：`cost_row.amountRX` 只读报价上下文与规则表；身体类代价（体力、专注一类）是 `vital` 或 `status` 原语，钱物类是 `transfer`。付不出即 E-ACT-COST。
- **R9-7.8 冷却**：效果族行的冷却（卷二 §3.9（效果族表 `_effects.json`）的 `cooldownDays`）在提交时由执行器落成一条带时限的状态容器实例；“还在冷却”是 `precondition` 段对该实例的普通读取。
- **R9-7.9 修正来源**：伤病、心情、工具、设施、天气、信条、职位对难度与上限的影响，只能是以 `process.checkDifficulty`、`process.checkAbility`、`process.magnitudeCap` 为目标的修正项，由各自的领域卷登记。

#### 4.7.4 交互

卷二 §3.3（求值管线）、卷二 §3.7（旧派生槽的对照与过程主体槽）；卷二 §3.9（效果族表 `_effects.json`）；卷三乙 §4.1（材料归类与聚合（由卷三甲的数值推出））、卷三乙 §4.6（工具能力）；卷十三 §4.1（个人战斗结算）、卷十五 §4.1（效果注册表）、各领域卷（登记三张行表的行）；卷二十一 §4.1（身体类状态实例）（反噬落成的身体状态）。通道：派生读取。

#### 4.7.5 数据实例

- 【西陲】锻打一件铁器的难度：一条 `difficulty_row`，`base` 30；材料项读所耗铁料的加工难度读数 0.6，曲线给 18；工具项读铁砧的工具能力读数，曲线给 −8。难度基值 `30 + 18 − 8 = 40`。换成更难加工的料，难度随读数上升，行不变。
- 【非西陲】雪原上凿冰取鱼：地点项读冰层厚度维度，曲线随厚度升高；工具项读凿具能力。同一张行表，没有按地区写的行。
- 【超自然】治愈术的幅度上限：`cap_row` 两项，`of: actor` 读施法技能给 25，`of: tool` 读法器效力给 30，上限 `min(25, 30) = 25`。请求 32，代入 25，`overreach = 32 − 25 = 7`；本次成功度 `failure`；给出最小值的是 `of: actor` 那一项，约束行就是这一行，它的 `overreachCurve(7)` 给 0.35，反噬以严重度 0.35 落成施术者身上的一条状态实例。

#### 4.7.6 验收断言

- 扫描式：A9-7.1 动作行、效果族行与规则层代码里名为难度的数值字面量数为 0（改前 26）；`magnitudeCap` 的实现里效果族代号、材料类别字面量数为 0；全部效果族参数的上限覆盖缺口数为 0。
- 不变量式：A9-7.2 代入效果族的幅度恒不大于上限；上限恒不小于 0；难度与上限对同一上下文重复求值逐位相同；每个难度与上限的值都能由 `explain()` 逐段复算到行表的项与修正项；同一参数不同时有 `cap_row` 与 `cap_exempt_row`；一次结算至多执行一次反噬，其严重度等于各受约束参数约束行曲线值的最大者。
- 扩展性式：A9-7.3 新增一条 `difficulty_row` 或 `cap_row`（引用一个此前没被用过的维度代号）后，相应动作的难度与上限随该维度变化，不改 .mjs。

### 4.8 同意与权能

#### 4.8.1 维度

`consent_scope` 族（§2.1）；`authority_via`、`clause_mode`；卷二定义的 `consent_mode` 与 `power` 族（只读；`power` 族格式归卷二 §1.9（代号、显示名与语言边界），条目由持有该权能来源的领域卷登记）。同意分两类，本节只让第一类拦截：

- **配合**：物理上须对方身体配合才做得成的事（受教、施术时对方不挣扎、亲密），由动作行 `consent` 字段逐项声明（§2.2）。不成立即 E-ACT-CONSENT，世界不变。
- **社会上的同意与权能**：效果族自带的 `consent.mode`（`target`、`holder`、`authority`，卷二 §3.9（效果族表 `_effects.json`））、职位与处分权、进入许可。它们一律不拦，只进报价供显示、进 NPC 决策的风险项，并在善后段记成事实交卷八b（R9-3.10）。

同意是持有边：种类由 `rules.consent.edgeKind` 指名，种类行由本卷登记进卷十八 §4.1（持有种类表与两条转移协议）的表（`intimate` 为假、`bodyControl` 为假、`termsKeys` 为 `scope`、`object`；卷十八主列：`hyper` 空，`from`、`to` 都为 `agent`，`exclusive` 假（同一人可同时给几个人、几种范围的配合），`gone`、`vacated`、`defected` 都为 `ho_close`（同意不随终止移交给后继），`subjectEnd` 为 `send_close`，`concluded`、`functional`、`membership`、`headship`、`carriesRel` 都为假（`functional` 取假：行动者失能由 `can()` 中断活动，不靠边失效），三个传导系数 `conduct`、`conductBack`、`adopt` 都为 0（配合不是立场关系，不传导立场），`pins` 为 `pside_none`），边的属性 `{scope: ref consent_scope, object: 实体引用 nullable}`，起止时刻用持有边自带的区间。两张行表：

| 行表 | 字段 | 说明 |
|---|---|---|
| `authority_source` | `id`；`power: ref vocab power`；`via: authority_via`；`param: 代号`（`holding` 写持有种类代号，`office` 写职位权能代号，`disposal` 写处分种类代号，`guardianship` 不用，`contract` 写合同条款代号，`clause` 写条款行号） | 某项权能可以从哪里来 |
| `consent_clause` | `id`；`scope: ref consent_scope nullable`；`family: ref effect nullable`；`mode: clause_mode`；`grantorVia: authority_via nullable`；`whenRX: rx` | 配合的替代与免除条款；卷十五 §4.4（施法同意条款）等登记行 |

#### 4.8.2 统一入口

`consent(engine, state, {actor, target, scope, object, at})` 与 `authority(engine, state, {actor, power, over, at})`，都在 `action-consent.mjs`，全书只此两个。别卷凡问“甲有没有得到乙的同意”“甲有没有这项权能”，只调这两个函数；拿结果去拦动作的只有本管线的同意段，且只对配合事项。进入许可不在这里：进入只调卷五 `canEnter`，只记事实（R9-3.10）。同意边的开立与撤回只经执行器的 `holding.open`、`holding.close`。

#### 4.8.3 规则

- **R9-8.1 只拦配合**：`resolve` 的 `consent` 段只对动作行 `consent` 列出的每一项（`party` 槽位里的实体、`scope`）问一次 `consent()`。效果族的 `consent.mode` 不进这一段：`quote` 段对本次全部 effectCall 按模式问一次——`target` 问对象本人、`holder` 问持有人（经持有边读出）、`authority` 问 `authority()`——结果只进报价与善后事实。所以偷、抢、闯进私宅、强行带走都能提交，后果由卷八b 从事实读出；做不成的只有物理上做不成的事。
- **R9-8.2 同意怎样成立**：依次看三样，任一成立即通过，并在 `basis` 里给出依据。① 应同意者到行动者有一条在世的同意边，`scope` 相同、`object` 相同或为空、区间盖住 `at`。② 有一条 `mode` 为 `waive` 的条款行，`whenRX` 此刻为真（例如对象此刻不能抵抗，配合在物理上已不必要）。③ 有一条 `mode` 为 `substitute` 的条款行，`whenRX` 为真，且经 `grantorVia` 与应同意者相连的另一人到行动者有满足 ① 的同意边（例如抱住婴儿的监护人代为配合）。都不成立即不成立，`grantors` 带“谁可以给出”的 id 列表；在同意段即 E-ACT-CONSENT，在报价与善后只是一个读数。
- **R9-8.3 给出同意是动作**：征求、给予、撤回同意与拒绝给予同意是目录里的普通动作行，效果是开立或关闭同意边（拒绝给予同意一行的效果为空）；NPC 给不给由 `npcDecision()` 决定。应答者有席位边时，征求同意开一条待应答记录（R9-12.15），他以给予同意（`answer` 为 `agree`）或拒绝给予同意（`answer` 为 `refuse`，同一事务发拒绝应答事件，R9-12.14）一步作答，都以通用槽位 `invite` 指明所答记录；不答即按 R9-12.15 失效。不带 `invite` 的给予同意是主动给出，照旧可做，不是应答。模型的叙述不能产生同意。
- **R9-8.4 能表态才算数**：开立同意边的动作行以卷二 §2.5（状态谓词单点）的 `can()` 为前置（表态所需的能力代号取能力族条目）；不能表态的人给不出同意，只能走条款。
- **R9-8.5 亲密范围不可替代**：`scope` 的 `intimate` 为真或动作行 `intimate` 为真时，双方须各自通过卷十八的 `intimateEligible`、合起来通过 `intimateAllowed`，且只认 R9-8.2 的 ①。指向亲密范围的 `waive`、`substitute` 条款行在加载期即报错。这是未成年人保护里按数值判断的那一半；按文字判断的那一半在 §4.19。年龄只经卷十八 `intimateEligible` 读（它内部读卷四的成年与相对成熟度维度），本卷与守门都不直接读卷四的 `adult`。
- **R9-8.6 权能怎样成立（只作读数）**：`authority()` 取 `power` 相同的全部 `authority_source` 行，逐行按 `via` 读对应卷的入口：`holding` 读行动者对 `over`（或包含它的地点、组织）有无该种类的在世持有边；`office` 读卷八 §4.2（职位、官职、俸禄、继任、代理追认）的职位权能与辖区；`disposal` 调卷八b的 `disposalRight`；`guardianship` 读卷十八 §4.2（家户、亲属、婚配、继承、分家、监护）的监护边；`contract` 读卷六 §4.16（合同状态机）的在效条款；`clause` 读条款行的 `whenRX`。任一行成立即为成立；返回全部成立的来源。结果只进报价、NPC 决策与善后事实，本管线不据它拦截；需要权能才写得进去的“设立身份的写入”（卷八b R8b-4.5 封闭清单）由各自的卷在写入处自查。
- **R9-8.7 来源是行不是分支**：新增一种权能来源只加 `authority_source` 行；`via` 的六个取值是读入口的方式，不是内容。
- **R9-8.8 时效与撤回**：同意边有截止时刻；`revocable` 的范围可由给出者随时关闭。撤回不追溯已提交的事；进行中的活动，其配合所依的同意边在它的重查集合里（R9-1.12）：撤回经执行器的 `holding.close`，撤回的那次事务即重问一次；到截止时刻或被终止协议关闭的，最迟在该活动下一个推进点重问。不成立即按 R9-1.6 中断，中断原因 `consent`。
- **R9-8.9 比的是代号**：同意是否对得上只比 `scope` 代号与 `object` id，不比任何说明文字。

#### 4.8.4 交互

卷二 §3.9（效果族表 `_effects.json`）（`consent` 字段）；卷十八 §4.1（持有种类表与两条转移协议）、卷十八 §4.9（婚配制度、性风俗、儿童与老人）；卷八 §4.2（职位、官职、俸禄、继任、代理追认）；卷八b §4.6（处分权）；卷六 §4.16（合同状态机）；卷十五 §4.4（施法同意条款）（只登记条款行）；卷五 §4.13（进入权与私宅许可）（`canEnter` 只记事实，不经本节）；卷八b §4.2（罪名谓词与立案到执行）（善后事实）。通道：持有边、派生读取。

#### 4.8.5 数据实例

- 【西陲】医者给清醒的伤者缝合。伤口缝合要伤者不挣扎，动作行 `consent` 声明 `{party: 伤者槽, scope: cscope_medical}`；伤者此前经“同意治疗”动作开立了到医者的同意边，区间盖住此刻，R9-8.2 ① 成立。伤者若不肯，E-ACT-CONSENT，缝不成。
- 【非西陲】海岛部族里，少年随船远航按规矩须长者点头。这是社会上的同意：上船、开船的动作行 `consent` 为空，效果族 `consent.mode` 为 `authority`，`authority()` 经 `guardianship` 读出长者没有点头，读数进报价，船照开；善后段记一条“未得监护人同意”的事实，长者与部族怎样对待这件事由卷八b与卷十八读出。
- 【超自然】对昏迷者施治愈术与对清醒者施读心术。治愈术的动作行声明须对象配合（施术时不挣扎），对象昏迷时命中一条 `waive` 条款行（卷十五登记，`whenRX` 读“对象此刻不能抵抗”且“效果族行标为救护类”）。读心术不需要对象身体配合，动作行 `consent` 为空，对象没同意也照样施成；效果族 `consent.mode` 为 `target`，不成立的读数进报价，善后段记事实。两者都只经同一个 `consent()` 取读数。

#### 4.8.6 验收断言

- 扫描式：A9-8.1 `action-consent.mjs` 之外，规则层为判断“可否对他人施加”而直接读同意边、监护边、职位权能或处分权的调用点数为 0（S9-2）；同意判断中的文字比较数为 0；以效果族 `consent.mode`、`authority()`、`canEnter()` 的结果返回错误码的位置数为 0；指向亲密范围的 `waive`、`substitute` 条款行数为 0。
- 不变量式：A9-8.2 对任一提交的事件，其动作行声明的每个配合项在提交时刻都能由 `basis` 复核出依据；效果族 `consent` 不成立、`authority()` 不成立或 `canEnter` 为假的提交，事件照样存在且善后段各有一条对应事实；亲密类动作的提交事件中，不满足 `intimateEligible` 的参与者数恒为 0；撤回同意不改变撤回之前的任何事件。
- 扩展性式：A9-8.3 新增一个同意范围条目、一条条款行与一条权能来源行（不改 .mjs），相应动作的同意与权能判定随之生效。

### 4.9 回合契约

#### 4.9.1 维度

`turn`、`segments`（§2.4）；`turn_timing`、`channel`、`segment_kind`、`quote_source`（§2.1）；`rules.turn.maxExtraMinutes`。回执 `receipt` 的形状见 §2.4，全部是代号、id 与数值；它随 `ReplyResult` 交出，所以叙述、审查与回合校验拿到的是同一份。

#### 4.9.2 统一入口

`validateTurn(turn, receipts, channel, presentSet)` 与 `validateSegments(segments, textLength, presentSet)`，纯函数，在 `turn-contract.mjs`（规则层）。它们收到的是 aiGate 按封闭 schema 收窄后的代号结构，收不到文字。

#### 4.9.3 规则

- **R9-9.1 一次请求一个回合**：一次带回应句柄的请求经 `route()` 得到若干回执，合成恰好一个 `ReplyResult`（卷二 §2.9（外部边界与 Text 模型）第 0 条“回应通道”），回执写进它的 `receipts` 字段（§2.4）。世界在叙述之前已经结算完毕。
- **R9-9.2 回执先于叙述**：叙述请求的输入只有回执、决定卡、场景卡与（输入回合才有的）本轮原文的独立数据字段，按 R9-10.8 的次序组成；模型看不到未提交的东西，也改不了已提交的东西。叙述与 NPC 台词是同一次 `narrate` 请求（卷二 §2.9（外部边界与 Text 模型）第 0 条“对白并入同一入口”）：台词按 `cards` 措辞，与叙述一起过守门、一起入库。入库的叙述记录旁存写入时的显示语言代号（本回合上下文的 `locale`，随同一回合上下文交 aiGate，卷二十九 C29-2），与卷二 `displayNames` 的 `lang` 同一做法、同一口径：不进存档摘要、规则层不读，只供显示层给旧叙述加语言标记（卷二十九 R29-2.14；C29-4）。
- **R9-9.3 叙述输出的结构**：模型随叙述文字一并返回 `turn`、`segments`、`claims`、`mentions`。`channel` 为 `ic` 时 `turn` 四个字段必填；为 `ooc` 时 `turn` 必须为空。
- **R9-9.4 `turn` 是待核对的声明，不是输入**：`timing` 为 `timed` 时，`extraMinutes` 必须等于各回执 `minutesAdvanced` 之和；为 `already_timed` 时，`extraMinutes` 必须为 0，且本回合的时间只由带 `wait` 槽位的意图推进或没有推进。`location` 必须等于最后一条回执的 `placeAfter`（没有回执时等于行动者当前所在地点）。`present` 必须是在场集合的子集。时钟只由回执里的 `time` 原语推进，`turn` 里的数不推进任何东西。
- **R9-9.5 `segments` 的校验**：各段区间落在文字长度内、按起点升序、互不重叠；`dialogue` 段必须有 `speaker`，且 `speaker` 在在场集合里；`speaker` 是玩家操控实体的段必须 `quoteSource` 为 `player`，并且 aiGate 对该段的引文同一性检查已通过（卷二 §2.9（外部边界与 Text 模型）第 6 条）。没有本轮原文的请求不得出现这种段。
- **R9-9.6 没有默认值**：任何字段缺失、越界或与回执不符即 E-TURN-UNMAPPED，整份结构化输出作废，计入 §4.19 的重请计数；用尽后本回合改用模板叙述。不合成“额外 0 分”“原地”“无人在场”之类的替代值。
- **R9-9.7 没有正式行动的回合**：请求没有产生任何回执时，`ReplyResult` 只带结果代号；`turn` 仍须按 R9-9.4 给出（`already_timed`、0 分）。
- **R9-9.8 场外**：`ooc` 回合不结算、不推进；规则层判断场内场外只读请求里的 `channel` 代号。
- **R9-9.9 运行期不写 AI 记录文字**（李白 11-13 裁定）：编年史、档案、碑记都是事件的投影，按模板显示；存档与规则状态不存 AI 写的记录文字，风味文字只属显示层（开 AI 时只在当回合叙述里）。运行期模型不写 `records.*.text`；卷二 §2.9（外部边界与 Text 模型）第 0 条第 4 点为它留的四样登记（`textPaths`、`textWriters`、`pathTypes`、`scopeRecords`）与 `ai-gate/record-text-gate.mjs` 按该条所说已由卷二一并删除（§5.3 勘1）。

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

读：`sceneCard(engine, state, viewerId, focusList)`，第六层投影，在服务端规则层。提示怎样组成由本卷定（R9-10.8，卷二说“提示怎样写归卷九”）；拼成文字的实现在 outputGate 的 `PromptRenderCap`（卷二 §2.9（外部边界与 Text 模型）“AI 调用走服务端”：labels 与已存叙述拼出的部分不在 aiGate 拼），玩家本轮文字由 aiGate 过 `screen` 后自己放进请求的独立数据字段。规则层只交出代号结构（场景卡、回执、决定卡），不碰文字。

#### 4.10.3 规则

- **R9-10.1 段是登记的行**：场景卡由若干段组成，每段一行 `scene_section`，由拥有该内容的领域卷登记（天气段归卷二十，用工段归卷六，农事段归卷二十五）。本卷代码里没有任何段的代号。
- **R9-10.2 选哪些段只看代号**：`focusList` 是意图槽位 `focus` 给的代号列表。给了列表：取 `required` 的段加上 `focus` 在列表里的段。没给（菜单回合的缺省）：取全部段。然后按（`required` 在前、`priority` 降序、行代号升序）排定。
- **R9-10.3 知情裁剪**：每段的数据只经卷二十二 §4.1（主观视图四域与检索键）的主观视图取，观察者是 `viewerId`。观察者不知道的事实不进卡；别人的私密只在观察者的已知集合里有时才进。场景卡不直接调任何真值 view。
- **R9-10.4 预算**：动态预算 = `rules.scene.promptBudget − rules.scene.staticBudget`（加载校验保证为正）。按 R9-10.2 的次序逐段累加其序列化后的码点数，加上后不超预算的整段收入，超的整段跳过并把行代号记进卡的 `dropped` 列表；不截断段的内部。`required` 的段合计超出预算是加载期可检的配置错误。
- **R9-10.5 卡里的状态都是代号**：死亡、揭穿、核实与否一类状态以定义卷的枚举代号出现；卡里没有任何用来判断的文字。
- **R9-10.6 决定卡随卡走**：本回合出面说话的 NPC 的 `Decision` 以决定卡代号与槽位值写进卡（与 `ReplyResult.cards` 同一份）；模型只按它措辞（卷一 §7（AI 的位置））。
- **R9-10.7 检索只按键**：往事与记忆的取用按 `mentions`（实体 id）与维度代号这一套检索键，键的定义归卷二十二 §4.1（主观视图四域与检索键）；没有主题词表，不拿玩家原文去检索。
- **R9-10.8 提示的组成**：每次模型请求的提示由五块按固定次序组成，块的边界是请求 schema 的字段，不是文字里的分隔符。① 静态指令块：按（用途、语言）固定，不随世界变化，放在最前，走供应方的提示缓存；它与 ② 都取自卷二十九 `prompt` 类模板（按用途、显示语言各一份，卷二十九 R29-2.13；C29-5）；它的码点数计入 `rules.scene.staticBudget`。② 输出 schema：该用途的封闭 schema 代号所对应的结构说明，同属静态区。③ 场景卡：`sceneCard()` 的输出经 `PromptRenderCap` 用 labels 渲染，是动态区，受 R9-10.4 的动态预算约束。④ 本回合的回执与决定卡（`ReplyResult.receipts`、`cards`），同样渲染，属动态区。⑤ 玩家本轮原文：只在 `interpret` 与 `narrateTurn` 出现，放在独立数据字段，不拼进任何指令块（卷二 §2.9（外部边界与 Text 模型）“注入防线与剥离口径”的隔离）。第二校验器的提示另按 R9-19.10，只取叙述正文、实体标记与名表片段。块的次序、各块用哪个 schema 字段，写成 AI 边的配置数据；规则层不参与。

#### 4.10.4 交互

卷二十二 §4.1（主观视图四域与检索键）；卷二十九 §4.2（叙述模板与片段库）（同一张卡在不开模型时走模板）；卷二十六 §4.4（想法与心情）（心情段）；各领域卷（登记段）；§4.9、§4.12、§4.19。通道：派生读取。

#### 4.10.5 数据实例

- 【西陲】玩家在集镇问起招工。意图带 `focus = [focus_labor]`。卡里有必备的时地人三段与用工段；天气段、农事段不在列表里，不取。
- 【非西陲】在盐湖商站点选“环顾”，菜单回合不带 `focus`：全部段按优先级装入，预算 6000，装到第七段时累计 5820，第八段 400 码点装不下，整段跳过，`dropped` 记它的行代号。`5820 + 400 = 6220`，大于 6000。
- 【超自然】观察者是一名能见亡魂的灵媒。亡魂段的数据来自她的主观视图（她的感知通道里有这一类），同一地点换一个普通观察者，这段为空。没有按“是不是灵媒”写的分支，差别只在主观视图。

#### 4.10.6 验收断言

- 扫描式：A9-10.1 场景卡代码里段代号字面量数为 0、对玩家问话做匹配的行数为 0；场景卡 schema 里文字类型字段数为 0；场景卡代码直接调用真值 view 的次数为 0；aiGate 内拼 labels 或场景卡文字的位置数为 0；玩家原文出现在指令块字段里的请求数为 0。
- 不变量式：A9-10.2 卡的序列化码点数恒不超过动态预算；同一用途同一语言的静态指令块逐字节相同；同一状态、同一观察者、同一 `focusList` 两次生成逐字节相同；卡里出现的每个事实 id 都在观察者的已知集合里。
- 扩展性式：A9-10.3 新增一条 `scene_section` 行与一个 `focus` 条目后，该段可被菜单缺省与 `focus` 槽位取到，不改 .mjs。

### 4.11 一致性审查

#### 4.11.1 维度

`claims`（§2.4）；`claim_kind` 族（§2.1），条目另带 `mustClaim: boolean`；`claim_detect`、`claim_modality`、`claim_polarity`、`temporal_mode`、`review_verdict`、`validator_verdict`；`rules.review.tolerance`。`evidence_row` 行表：`{id, from: enum(receipt, view, row), entry: 读入口或回执字段的登记代号（`from` 为 `row` 时是被校验数据行的维度代号；C28-11）, compare: enum(eq, le, ge, within, known)}`。首批声明种类（数值与归属待各领域卷认领后定稿）：

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

`reviewClaims(engine, state, receipts, claims, segments, turn, channel, rows)`，纯函数（`rows` 运行期为空列表，离线调用见 R9-11.3；C28-11），在 `consistency-review.mjs`（规则层）。输入里没有叙述文字、没有玩家原文、没有屏蔽词表。第二校验器在 AI 边，本函数只收它的裁定代号列表。

#### 4.11.3 规则

- **R9-11.1 只核代号与账面**：审查不读正文。它核三样：声明的结构与代号合不合法；声明的值与账面对不对得上；该有声明的地方有没有。
- **R9-11.2 结构校验**：`kind` 在族内；`subject` 是登记的 id，其实体类在该种类的 `subjectKind` 里（由规则查登记表，不信自报）；`predicate` 在该种类的 `predicates` 里（维度代号或读入口字段代号，C10-20）；`value` 合 `valueType`；`references` 的 `sourceId` 已登记、区间合法；`segmentId` 存在。任一不合即 E-CLAIM-SCHEMA，整份声明作废。
- **R9-11.3 按检出来源分三路**：`ledger` 类按该种类的 `evidence_row` 取账面值——`from: receipt` 取本回合回执的字段，`from: view` 取定义卷读入口的现值或登记的累计量——再按 `compare` 比较；对不上为 `mismatch`，取不到账面为 `unsourced`。`gate` 类由 §4.19 的守门在到达本函数之前检出，本函数只确认守门代号列表为空。`self` 类是模型自报，只能得 `warning`。 **离线调用**（C28-11）：卷二十八的内容构建校验器与模型审级不经运行期回合，以声明加行数据调同一函数：`claims` 是作者随行所附或模型交回的声明，`segments` 是被校验那段文字的分段（同 §2.4 形状，由调用方给出），`rows` 是被校验的数据行，`receipts` 为空列表，`turn`、`channel` 为空。`from: row` 的证据行取 `rows` 中 id 等于声明 `subject` 的那一行上 `entry` 所指维度的值；运行期 `rows` 为空、离线时 `receipts` 为空，取不到的一律按上文“取不到账面为 `unsourced`”。离线时没有守门，守门代号列表为空。
- **R9-11.4 哪些声明要严格比**：只有 `modality` 为 `fact` 且 `time.mode` 为 `current` 或 `past` 的声明按 R9-11.3 比；`intention`、`question`、`hypothetical`、`figurative` 与 `future` 不比账面，只做结构校验。`polarity` 为 `deny` 时比较取反。数值比较的容差取 `rules.review.tolerance` 中该种类的值（该表键全覆盖 `claim_kind` 族，§2.5）。
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

`decision_stage`、`decision_outcome`；`Decision`（§2.4）；`decision_card` 族；`state.agendas`、`state.decisionCommit`（§2.3）；`rules.npc.*`（§2.5），其中 `rules.npc.redLineValence`（ref vocab valence）、`rules.npc.grievanceVerbs`（set<ref vocab verb>）、`rules.npc.stanceWeights`（map<stance_axis, number>）与 `rules.npc.switchMargin`（number，≥ 0）。`candidate_provider` 行表：`{id, actionId, slotGen: map<槽位代号, list<ref target_filter>>, whenRX: rx, maxCandidates: integer ≥ 1}`。候选：`{candidateId, intent, contrib: map<ref drive, number>, cost: struct{money, minutes, risk, relation}, reward: number}`；`candidateId` 由（动作代号、主对象 id）组成。

#### 4.12.2 统一入口

`npcDecision(engine, state, personId, request)`（别人向他提出一件事）与 `npcChoose(engine, state, personId, at)`（他自己挑一件事做），都在 `npc-decision.mjs`，都是纯函数。读：`personView().dims.driveWeight`、`decisionJitter()`、`preferenceOf()`、`needSatisfiers()`（卷二十六 §4.9（决策噪声接口））；`stance()`、`dread()`、`treatment()`、`recall()`（卷十八）；`evaluationOf()`（卷七）；`legalityOf()`（卷八b）；`can()`、`activityOf()`、`agendaOf()`。输入一律来自该人物的主观视图，不取真值。

#### 4.12.3 规则

- **R9-12.1 五段定序**：`red_lines`、`relations`、`utility`、`circumstances`、`conflicts`，顺序固定；每段往 `trace` 里写代号与数值。
- **R9-12.2 底线**：候选的动作代号，或它在该人物所在法域与信仰下对应的罪名与评价行代号，调 `evaluationOf(engine, state, personId, aboutHandle)` 得 `{valence, vector, rows}`；`valence` 是卷七 `valence` 族的有序档，`order` 越小越重（卷七 R7-26.2），若它的 `order` 不大于 `rules.npc.redLineValence` 所指档的 `order`，该候选剔除；返回空即不剔。全程只比较档序整数。亲密类动作而本人不满足 `intimateEligible` 的，同样剔除。底线集合全由评价行与人物的价值有效值算出，人物档里不存底线文字。
- **R9-12.3 关系**：立场读数 = `Σ_axis rules.npc.stanceWeights[axis] × stance(本人, 提出者, axis)`（`stance` 按轴取值，卷十八 §4.4（立场数轴（来源表、衰减、单入口））；缺键按不加项处理）；另读 `dread()`、`treatment()`。积怨读数按卷十八 R18-5.4 的写法：从本人的已知事件（卷二十二 §4.1（主观视图四域与检索键）的已知集合）里，取动词在 `rules.npc.grievanceVerbs` 里、提出者是行为人、本人是受事者的事件，逐条乘卷十八 `recall(本人, 事件)` 后求和。动词集合是规则表数据，规则里不点名任何一类。这些都以数值进下一段，不读记忆内容。
- **R9-12.4 效用**：`U = Σ_d driveWeight[d] × contrib[d] + w.reward × reward + w.relation × 立场读数 − w.grievance × 积怨读数 − w.money × cost.money − w.time × cost.minutes − w.risk × cost.risk + decisionJitter(主体, 决策时刻, candidateId)`。`w` 取 `rules.npc.utilityWeights`。`reward` 是非钱的得益（如人情、名声的数值读数）；凡是钱，一律进 `cost.money`（对方给钱是负的代价）。需求类驱力的 `contrib` 由 `needSatisfiers()` 给出；`cost.risk` 可含 `legalityOf()` 读出的不合法后果估值与报价里的未得同意、无权能读数。**各项代价保留正负号**：负的代价（抵扣、对方代付）抬高效用，不截成 0。全式只有加减乘。
- **R9-12.5 应答式的结论**：`npcDecision` 对“答应”这个候选算 `U`。底线剔除即 `refuse`；`U` 不小于 0 且后两段无碍即 `agree`；`U` 小于 0 见 R9-12.6；后两段有碍见 R9-12.8。 **给出配合类候选**（C15-1 ⑥）：答应的那个候选，其动作行在 `success` 下的效果开立同意边（种类 `rules.consent.edgeKind` 的 `holding.open`，R9-8.3）时，下结论前先从 `U` 中减去过程主体槽 `process.consentBar`（卷十五登记，本卷是其读者）的求值结果，上下文为 `{actor: 本人（给出配合的对象）, target: 提出者（施为者）, slots: 所请意图的槽位}`，流派由该槽的基值行按槽位读出（卷十五 R15-4.4）；再按本条与 R9-12.6 下结论。不按动作或流派代号分支。
- **R9-12.6 有条件答应**：预付是钱，按效用式里钱的权重折算。`U` 小于 0 时，若 `w.money` 为 0，不做除法，结论为 `refuse`；否则所需预付 = `ceil(−U ÷ (w.money × rules.npc.conditionalStep)) × rules.npc.conditionalStep`（`conditionalStep` 是正整数，此时 `w.money` 为正，除数为正），结论为 `conditional`，决定卡 `prepay` 槽带这笔数。付了这笔，`cost.money` 减少同额，`U` 恰回到不小于 0。
- **R9-12.7 主动式的选择**：`npcChoose` 在四种时刻被调度：日程槽结束（到期项种类 `due_agenda_slot_end`，§2.9）、当前活动结束、没有当前活动的人其需求类状态实例经执行器被写入的那次事务（执行器在事务末步按 R9-1.12 同一做法发现：该人的重查集合取卷二十六 `needSatisfiers()` 与驱力权重所依的状态路径）、没有当前活动的人的空闲推进点（每隔 `rules.npc.idleAdvanceMinutes` 一个到期项（种类 `due_npc_idle`，§2.9），有活动或日程槽时不登记）。需求越线若由推进钩子经 `writePath` 直写（卷二 §2.6（写者与三接口）许可），不经执行器，按 R9-1.12 同一上界最迟在下一个空闲推进点被发现，延迟不超过一个间隔。它取全部 `candidate_provider` 行（候选只来自登记的数据行，没有按代码写的提供者），各自按 `whenRX` 与 `slotGen` 生成不超过 `maxCandidates` 个候选，过 R9-12.2，按 R9-12.4 算 `U`，取最大者；`U` 相同时取 `candidateId` 码序最小者。已有承诺（`state.decisionCommit`）未到 `until` 时，新候选的 `U` 须比承诺候选此刻的 `U` 高出 `rules.npc.switchMargin` 才替换。`npcChoose` 自己不写状态；调度它的到期钩子据其结果以声明写者写日程槽与承诺，并把意图交 `resolve()`。
- **R9-12.8 处境与冲突**：`circumstances` 段读 `can()`、`activityOf()` 的动作类注意力、日程槽占用：此刻做不了而稍后可以的，结论 `defer`，`due` 取最早的空闲时刻。`conflicts` 段读该人物在效的义务与职位职责：时间区间重叠或职责禁止的，结论 `refuse`。两段都只比较区间与代号。
- **R9-12.9 决定先于对白**：`Decision` 算出后才有台词。决定卡代号与槽位进 `ReplyResult` 与场景卡；模型只管措辞，改不了结论。
- **R9-12.10 走同一条管线**：NPC 对世界的一切改动只经 `resolve()`。日程槽与承诺是决策自己的记录，不是世界改动，由 `npc-agenda.mjs` 以声明写者写。候选提供者只返回意图，自己不写状态；违者 E-NPC-BYPASS。
- **R9-12.11 不是每拍都想**：决策只在 R9-12.7 的四种时刻发生，它们都由世界内在量决定，不随推进步长变化；聚合层的人不逐人决策（卷二十七 §4.1（三层模拟运行矩阵））。
- **R9-12.12 契机不在这里**：隐藏职业契机（卷十四 §4.8（隐藏职业契机））是订阅事件的反应规则；它若给出“可以入行”，那只是多出一个候选，取舍仍按本节。
- **R9-12.13 决定卡的读数**（C29-5）：每张进 `ReplyResult.cards` 与场景卡的决定卡带一份 `CardReading`（§2.4），供模板对白的变体条件读（卷二十九 R29-2.8），组卡时由规则层算出，只读数值维度与固定代号，不进存档、不进哈希，不改结论（R9-12.9）。`listener` 是该决定所答意图的行动者。`persBand` 对说话人 `personView().dims.personality` 的每一键、`gaugeBand` 对其 `personView().dims.psychOut` 的每一已知键（卷二十六 §3.1（读入口）的视图输出），档序 = 该值不小于 `rules.card.persCuts`（人格）或 `rules.card.gaugeCuts`（心理量）中几个切点，与 R9-3.5 数界的写法相同；值未知的键不进 map。性格档即人格各轴的档序，心情档即心情心理量那一键的档序。`relations` 是 relation 族全部条目中卷十八 `related(engine, state, 说话人, listener, rel)` 为真者，按代号升序，没有即空列表。`occasion` 是 `occasion` 族除 `occ_nil` 外 `whenRX` 此刻为真的条目中 `order` 最小者（同序取代号码序最小），无一成立取 `occ_nil`。代码里没有人格轴、心理量、关系或场合的代号。
- **R9-12.14 拒绝应答事件**（封卷后勘误，李白 11-14 17:04 裁定）：凡须对方应答的邀约，即提给他人、由对方答应与否定成败的动作（征求同意，R9-8.3；对话里的请求、出价、还价，R9-13.1；别卷登记的决斗、交易、结盟、婚约等邀约类动作行都经这两路之一），应答落为拒绝的那笔事务在同一事务内发一条动词 `verb_invite_refused`，载荷 `{actor: 应答者, targets: [发起者], invite: EventId, inviteAction: 邀约动作代号}`。落为拒绝只有两种：应答者是 NPC 时，`npcDecision` 对该邀约的结论为 `refuse`（R9-12.5、R9-12.6、R9-12.8 各路同此），在邀约动作自己的裁决事务里发，`invite` 取该事务提交段那条事件的 id、`targets` 取该意图的 `actor`、`inviteAction` 取该意图的 `actionId`，由该裁决事务直写；应答者有席位边时，他提交的 `answer` 为 `refuse` 的一步（对话里的拒绝行；§4.8 的拒绝给予同意，R9-8.3）答复一条待应答记录（R9-12.15），在这一步的裁决事务里发并删该记录，`invite` 取该记录的键 `inviteId`、`targets` 取 [该记录的发起者]、`actor` 取应答者（本步行动者）、`inviteAction` 取该记录的邀约动作代号，由记录直写。`defer`、`conditional`、`counter` 不是拒绝，不发；待应答记录失效（超时、轮数耗尽，R9-12.15）也不是拒绝，不发。多人应答（R9-13.7）时每个拒绝者各发一条。不按动作代号、邀约种类分支；别卷订阅它只按载荷的代号与 id 匹配，认出是哪种邀约读载荷 `inviteAction`（别卷以句柄登记所认的邀约动作代号）。它属“写者协议在事务内另发的事件”一类（R9-2.3、§2.9 该行）：`primitives` 为空，id 按该行取，位次 `pos.kernel`。动词行表 B 各栏（卷二十四 §2.2（维度）表 B，字段类型与取值域照该表，本卷只填值）：`parent` 空；`payloadShape` 为 `{invite: EventId, inviteAction: ref action}`（`actor`、`targets` 是公共栏位，不进 `payloadShape`）；`kindFrom` 空；`kindOnly` 假；`worthSlots` 为 `{destroyed: [], moved: [], stake: []}`；`headSlot` 为 null；`sigBase` 写 0（占位待标定）；`tallies` 写 `[]`；`perceivable` 真、`senses` {视、听}（经句柄 `roles.senses.sight`、`roles.senses.hearing`；两个发出点都是行为人动作的裁决事务，判据同卷十八 §2.3（本卷登记的资源种类行、合同种类行、事件动词））；`visibilityAllowed` 取卷二十四 §2.2（维度）表 A `visibility` 的全集 {`public`、`private`、`witnessed`}，当众程度由发出它的事务在集合内给出；`scandal` 取假（拒绝邀约不是应答者的丑闻；卷二十四表 B 该列，封卷后勘误 1115c1）；`calendarBound` 取假（不是周期日到来或按历法锚定的到期；卷二十四表 B 该列，封卷后勘误 1115cb）。
- **R9-12.15 待应答记录**（封卷后勘误，李白 11-14 17:30 裁定）：凡提给有席位边（R9-3.9）者的邀约，即管线须取应答者结论的那一步（对 NPC 即调 `npcDecision()` 应答的同一处：征求同意，R9-8.3；对话里的请求、出价、还价，R9-13.1、R9-13.4；别卷登记的决斗、交易、结盟、婚约等邀约类动作行）而该应答者有席位边的，不调 `npcDecision()`，在该邀约的裁决事务里为每个有席位的应答者开一条待应答记录 `state.pendingInvites[inviteId][respondentId]`（§2.3）：`inviteId` 取该事务提交段那条事件的 id，发起者 `inviter` 取该意图的 `actor`，邀约动作代号 `inviteAction` 取该意图的 `actionId`。对话里 NPC 在对方这一步之内还价（结论 `counter`，R9-13.4）而对方有席位边时，这也是提给席位者的邀约，同一事务开一条记录：发起者取还价的 NPC，应答者取对方，`inviteId` 与 `inviteAction` 取本步提交段那条事件的 id 与本步的动作代号。对话会话只是来源之一，记录不挂在会话上。席位应答者以带通用槽位 `invite` 的一步作答，`invite` 指明所答记录（候选取应答者名下的打开记录，§4.19.1），结论取该行的 `answer`（§2.2）；不带 `invite` 的一步不是应答。记录只以三种方式结束，都由 `invites.mjs` 在那一笔事务里删除：① 一步作答：`answer` 为 `agree` 或 `counter` 的一步，即接受或还价（还价既非接受也非拒绝；它本身又是提给对方的邀约，对方有席位边时按本条另开记录）；② 一步拒绝：`answer` 为 `refuse` 的一步，同一事务发拒绝应答事件（R9-12.14）；③ 失效：超时，即开记录的事务登记一个到期项（种类 `due_invite_expire`，§2.9），时刻为此刻加 `rules.invite.expireMinutes`（§2.5），到期时记录仍在即删除；或轮数耗尽，即本步使会话 `round` 达到 `rules.dialogue.maxRounds` 而转 `refused`（R9-13.4），本步所答的记录按失效删除，本步不再开记录。失效不发拒绝应答事件，也不发别的事件，只删记录。发起者或应答者终止时由 §3.3 的清理函数删除，是存档去留，不是应答。不按动作代号、邀约种类分支。

#### 4.12.4 交互

卷二十六 §4.9（决策噪声接口）、卷二十六 §4.3（心理需求）；卷十八 §4.4（立场数轴（来源表、衰减、单入口））、卷十八 §4.5（关系、记忆、认知与谎言）、卷十八 §4.11（恐惧值）；卷七 §4.26（美德、罪恶、罪行、羞耻（评价行））；卷八b §4.5（合法性是后果）；卷六 §4.16（合同状态机）、卷六 §4.21（价格四角色）；卷十四 §4.8（隐藏职业契机）；卷二十 §4.1（刻、同刻全序、调度器与到期语义）；卷二十七 §4.1（三层模拟运行矩阵）；§4.1、§4.3、§4.13。通道：派生读取、声明写者。

#### 4.12.5 数据实例

- 【西陲】一个饿着的短工考虑去酒馆吃饭。候选 `(act_trade_buy, 酒馆掌柜 id)`：饥饿驱力权重 0.8，贡献 0.5，得 0.4；钱 12 文，`w.money` 0.01，扣 0.12；30 分钟，`w.time` 0.002，扣 0.06；扰动 +0.03。`U = 0.4 − 0.12 − 0.06 + 0.03 = 0.25`。若东家代付 5 文，`cost.money` 为 7，扣 0.07，`U = 0.30`；若是东家倒贴 5 文（代价 −5），该项为 `−0.01 × (−5) = +0.05`，不被截掉。
- 【非西陲】玩家请一名山地向导带路过隘口。`U = −0.15`，`w.money` 0.01（与上例同一张规则表），`conditionalStep` 5：预付 = `ceil(0.15 ÷ (0.01 × 5)) × 5 = ceil(3) × 5 = 15`。决定卡 `dcard_conditional`，槽位 `prepay = 15`。付了 15 文，`cost.money` 减 15，效用加 `0.01 × 15 = 0.15`，`U` 回到 0，答应。
- 【非人类】一头冬眠前的熊。候选提供者行按卷二十六登记的进食需求给出“觅食”类候选；它没有钱的代价项，风险项来自对人类聚落的恐惧读数。同一条效用式、同一个 `resolve()`。

#### 4.12.6 验收断言

- 扫描式：A9-12.1 决策与自治代码里的正则、文字匹配、目标内容文字比较数为 0；规则层里绕过 `resolve()` 的 NPC 写入点数为 0（改前 2 处）；把代价截成非负的代码行数为 0；决策代码里事件类别、动词代号字面量数为 0；`candidate_provider` 行之外产生候选的代码位置数为 0。
- 不变量式：A9-12.2 有条件答应给出的预付付清后，同一候选的 `U` 不小于 0； 同一主观视图、同一时刻、同一候选集，结论逐值相同；候选集增删别的候选不改变某一候选的 `U`；一次推进 N 天与分段推进合计 N 天，NPC 的决策时刻序列与结论相同；`trace` 里没有文字。
- 扩展性式：A9-12.3 新增一条 `candidate_provider` 行（引用已有动作与筛选）与一个驱力贡献声明后，NPC 会在效用更高时选它，不改 .mjs。

### 4.13 对话与交涉状态机

#### 4.13.1 维度

`state.dialogues`（§2.3）；`dialogue_state`；`request_kind`；`rules.dialogue.*`。`dialogue_move` 行表：`{actionId, from: set<dialogue_state>, onOutcome: map<decision_outcome, dialogue_state>, opens: boolean, closes: boolean}`，每行对应目录里一条 `social` 为真的动作。出价结构 `offer = {give: list<{resource: 资源或物品引用, qty: integer ≥ 1}>, take: 同形}`。

#### 4.13.2 统一入口

读：`dialogueView()`。写：`state.dialogues` 只由 `dialogue.mjs`，经执行器的 `transition` 原语。对话里的每一步都是经 `resolve()` 提交的动作。

#### 4.13.3 规则

- **R9-13.1 对话动作是普通动作**：招呼、询问、请求、出价、还价、接受、拒绝、威吓、告辞都是目录行，走九段。对方是 NPC 时，应答由 `npcDecision()` 给出；对方是玩家控制的实体（有席位边）时，状态停在等待，轮到玩家出下一步；这一步开待应答记录（R9-12.15），玩家以带通用槽位 `invite` 的一步作答，`invite` 指明所答记录，结论取该行 `answer`（R9-12.15）。
- **R9-13.2 转移查表**：一步合法当且仅当会话当前状态在该行的 `from` 里，否则 E-DIALOGUE-STATE；新状态 = `onOutcome[应答结论]`。`opens` 的行新建会话，`closes` 的行置 `closed` 并清除。代码里没有按动作代号写的转移。
- **R9-13.3 话题是检索键**：问什么由槽位 `mentions`（实体 id 列表）与 `dims`（维度代号列表）给出，`kind` 取 `ask` 或 `request`。答什么由规则定：从应答者的已知集合里取与检索键相合的事实 id，去掉对提问者保密的（卷二十二 §4.7（秘密、钩子、阴谋），读保留度 `guard`，卷十八 R18-5.5；C22-15）与 `treatment()` 不许告知的，写进决定卡槽位。
- **R9-13.4 交涉**：出价是结构化的 `offer`。应答者按卷六 §4.21（价格四角色）的估值入口、以自己的主观视图给双方物项估值，差额（应答者所得估值减所付估值，以钱计）取负后进 `cost.money`，代入 R9-12.4。按 R9-12.6 得出 `conditional` 时，在交涉里它写成还价：结论记为 `counter`，在对方的 `give` 上加一笔 R9-12.6 的数，决定卡取 `outcome` 为 `counter` 的那一张、槽位 `extra` 带这笔数、`offer` 指向对方这次出价。每出一次价 `round` 加 1；达到 `rules.dialogue.maxRounds` 仍未 `agreed` 即转 `refused`；轮数耗尽不是哪一方的拒绝：不发拒绝应答事件，本步所答的待应答记录按失效删除，本步不再开记录（R9-12.15）。两个还价方案效用相等时取 `candidateId` 码序最小者，与 R9-12.7 同一做法，不抽随机。
- **R9-13.5 冷场关闭**：每一步把 `idleUntil` 设为此刻加 `rules.dialogue.idleMinutes` 并登记到期项（种类 `due_dialogue_idle`，§2.9）；到期未续即 `closed`。只按世界分钟。
- **R9-13.6 成交即动作**：`agreed` 之后的交付（买卖、雇佣、跟随、借贷）是另外的目录动作，其 `whenRX` 要求双方有一场 `agreed` 的会话；状态机自己不转移任何钱物。
- **R9-13.7 多人应答**：槽位 `respondents` 列出多个应答者时，各人按 id 升序分别调 `npcDecision()`，互不读对方本轮的结论。
- **R9-13.8 威吓**：威吓一步的效用项读 `dread()` 与卷十三 §4.18（遭遇与谈判结算）登记的威慑量来源行；没有专门的威吓算法。
- **R9-13.9 说谎**：应答者决定隐瞒或说假话时，决定卡带一条登记的谎言 id（卷十八 §4.5（关系、记忆、认知与谎言））；台词怎样说是措辞，§4.11 按该 id 放行。

#### 4.13.4 交互

卷十八 §4.12（社交互动、斗殴与相容性）、卷十八 §4.10（外来者待遇与立场基线）；卷六 §4.21（价格四角色）、卷六 §4.16（合同状态机）；卷十三 §4.18（遭遇与谈判结算）；卷二十二 §4.1（主观视图四域与检索键）、卷二十二 §4.7（秘密、钩子、阴谋）；卷二十九 §4.2（叙述模板与片段库）（模板对白）；§4.3、§4.8、§4.12。通道：声明写者、派生读取。

#### 4.13.5 数据实例

- 【西陲】向粮商打听麦价：`act_talk_ask`，`mentions = [粮商的铺子 id]`，`dims = [价格维度代号]`，`kind = ask`。粮商已知集合里有该价，不属秘密，决定卡 `dcard_answer` 带事实 id。
- 【非西陲】在大漠驿站买骆驼：玩家出价给 80、取一头骆驼；商人估值骆驼 110，差 30 以 `cost.money = 30` 进代价，其余各项合计为 0，`U = −0.01 × 30 = −0.3`，结论记为 `counter`（`dcard_counter`），还价要求再加 `ceil(0.3 ÷ (0.01 × 5)) × 5 = 30`。第二轮玩家加到 110，`agreed`；随后的交付是 `act_trade_buy`。`round` 从 0 到 2。
- 【超自然】与一尊镇河的石灵交涉放行。它的应答同样由 `npcDecision()` 给出，供奉物的估值取它那一行登记的偏好；会话状态、轮数上限、冷场关闭与凡人相同。

#### 4.13.6 验收断言

- 扫描式：A9-13.1 对话代码里按动作代号分支的行数为 0、读台词或话题文字的行数为 0；`dialogue_move` 之外定义对话转移的位置数为 0。
- 不变量式：A9-13.2 会话状态只经 `transition` 原语改变；`round` 不超过 `rules.dialogue.maxRounds`；交涉过程中除经 `resolve()` 提交的动作外没有任何钱物转移；同一种子重跑，同一串对话动作得到同一串状态。
- 扩展性式：A9-13.3 新增一条对话动作行与一条 `dialogue_move` 行（例如“起誓”）后，该步可在菜单里点出并按表转移，不改 .mjs。

### 4.14 AI 档位与降级

#### 4.14.1 维度

`ai_tier`、`ai_use`、`ai_fail`（§2.1）；`rules.ai.tierUses`、`rules.ai.timeoutMs`、`rules.ai.degradeMap`（§2.5）。`rules.ai.modelClass`（§2.5）。首值占位：`t0` 无用途；`t1` 为 `understand`；`t2` 加 `narrate`、`validate`；`t3` 加 `draft`（作者边）。`judge` 首值不在任何档位里：选择式判断层默认关闭（李白 11-13 对 §8 第 7 条的裁定），要开就在 `tierUses` 里把它加进某档。档位是运行配置，不在 state，不进存档，不进哈希。`t3` 的含义因此与旧设计 AI-00 不同：不再含“模型替 NPC 规划”“模型写人物档”（R9-14.8）。

#### 4.14.2 统一入口

`aiAllows(config, use)` 与 `effectiveTier(config, degradeLevel)`，都在 AI 边（aiGate 组），规则层不可调用也读不到档位。性能降级档位只经卷二十七的 `degradeLevelOf` 读。

#### 4.14.3 规则

- **R9-14.1 缺省是 `t0`**：客户端每次请求带档位代号；缺失或不在枚举内即 `t0`。`t0` 下不发任何模型请求，整个游戏靠菜单、构造器与模板完整可玩。
- **R9-14.2 用途表是数据**：某档位能做哪些用途只查 `rules.ai.tierUses`。含 `narrate` 的档位必须同时含 `validate`（同档绑定，加载校验；李白 11-13 对 §8 第 9 条的裁定）：开了叙述就一定过第二校验器，没有校验器就不收模型叙述。NPC 台词不是单独的用途：它与叙述是同一次 `narrate` 请求（R9-9.2），时限、预算、退路都按 `narrate` 记。每种用途用哪一档模型取 `rules.ai.modelClass`，`model_class` 只分贵贱三级，具体模型与供应方在运行配置里。
- **R9-14.3 性能降级只往下**：生效档位 = 配置档位与 `rules.ai.degradeMap` 中“`level` 不大于当前降级档位的最后一行”的 `maxTier` 两者中较低的一个。这是单向读：模型档位、费用、模型是否可用，不进卷二十七 §4.3（成本模型与降级阶梯）的任何输入。
- **R9-14.4 超时**：每种用途的时限取 `rules.ai.timeoutMs`；计时用内核调度器注入的定时能力（卷二 §2.9（外部边界与 Text 模型）第 0 条“定时器”），AI 边自己不读墙钟。
- **R9-14.5 每种用途有固定的退路**：`understand`、`judge` 失败退到 `menu_fallback`；`narrate` 失败退到模板叙述与模板对白（一起退）；`validate` 失败视同叙述被拒；`draft` 只在作者边，失败即无草稿。失败原因取 `ai_fail`，只写旁路。退路不是另一套文字理解。
- **R9-14.6 世界与档位无关**：同一串意图在任何档位下，事件流与文字路径之外的状态逐值相同。档位只影响两件事：键入的自由文字能否被译成意图，以及显示的是模型文字还是模板文字。
- **R9-14.7 密钥归玩家**：密钥只在 AI 边的运行配置里，不进存档、不进旁路记录、不进提示。
- **R9-14.8 运行期没有“模型替 NPC 规划”与“模型写人物档”两种用途**（李白 11-13 对 §8 第 1 条的裁定：AI 不进逻辑）：NPC 的规划归 §4.12；人物档里影响规则的字段由规则按种子采样（卷八 §4.16（人口统计层、承载力、迁徙、移民波次）与卷二十七 §4.7（复演与规则只一版）的约束），模型至多经 `draft` 在作者边起草文字。旧设计 AI-00 第 88 行的 T3（“T2 + npcPlanning + profileDraft”）与 `ai-profile.mjs` 的用途表按本条改（M9-18、M9-22）。

#### 4.14.4 交互

卷一 §7（AI 的位置）；卷二 §2.9（外部边界与 Text 模型）（定时能力、叙述入口的结果代号）；卷二十七 §4.3（成本模型与降级阶梯）（`degradeLevelOf`，单向）；卷二十九 §4.2（叙述模板与片段库）（退路）；§4.17、§4.18、§4.19。通道：无（不读写世界状态）。

#### 4.14.5 数据实例

- 【西陲】玩家以 `t2` 游玩时断网。本回合 `understand` 失败原因 `offline`，键入的句子退回完整菜单；点选之后 `narrate` 同样失败，显示模板叙述。两次都只在旁路各记一行；存档与不断网时逐值相同（文字路径除外）。
- 【非西陲】远洋大港同屏人数多，卷二十七把降级档位升到 2；`degradeMap` 里 `level` 2 的行 `maxTier` 为 `t1`，生效档位由 `t3` 降为 `t1`：还能译码，不再请求叙述。港口的模拟本身不因此改变。
- 【非人类】与一只会学舌的渡鸦对话，档位 `t0`：台词由显示层按它的决定卡代号走模板。换成 `t2`，同一张决定卡交模型措辞，结论不变。

#### 4.14.6 验收断言

- 扫描式：A9-14.1 规则层与内核读取档位、用途表、模型可用性的行数为 0（S9-6）；AI 边之外发起模型请求的调用点数为 0；AI 边读墙钟的行数为 0；含 `narrate` 而不含 `validate` 的档位数为 0（加载校验）；单独为台词发起的模型请求数为 0；运行期用途表里“NPC 规划”“写人物档”两类条目数为 0。
- 不变量式：A9-14.2 同一种子、同一串意图分别在四个档位下运行，事件流与文字路径之外的状态逐值相同；`t0` 下模型请求数为 0；任一用途失败后本回合仍恰有一个 `ReplyResult`。
- 扩展性式：A9-14.3 在 `rules.ai.tierUses` 里把一种用途挪到另一档、或在 `degradeMap` 加一行，行为随之改变，不改 .mjs。

### 4.15 三级落地

#### 4.15.1 维度

`landing_level`；`state.marks`（§2.3）；`mark_kind` 词表族（开放，条目字段 `onKinds: set<实体类>`）。偏离行 `state.created` 的格式与 `basis` 结构归卷二 §2.7（系统声明表 `state-owners.json`）。

#### 4.15.2 统一入口

读：`landingOf(engine, state, proposal)`，纯函数。写：留痕经 `create` 原语（`kind` 为留痕，契约里不需 `template`，见 §4.2.1）的适配器落到 `mark-actions.mjs`，新建一条 `state.marks[onId][markId]` 记录；事实级产物经 `craftOutcome` 与 `create` 原语。固化不在运行期。

#### 4.15.3 规则

- **R9-15.1 级别由数据判定**：提案全部效果项都能按 R9-4.1 表达且上限行齐全，为 `fact`。有效果项不能表达，但提案给了一个 `mark_kind`、且对象的实体类在该条目的 `onKinds` 里，为 `mark`。两者都不是即拒绝，按 R9-3.3 返回原因与替代。运行期永远不判出 `solidified`。
- **R9-15.2 留痕**：一条留痕只有种类代号、对象、留痕者、时刻。它本身不改任何维度；要让某种留痕有后果，由领域卷登记订阅留痕事件的反应规则。留痕的说明文字若玩家想写，走卷二 §2.9（外部边界与 Text 模型）第 3 条的玩家手记路径，规则层读不到。
- **R9-15.3 事实**：事实级产物按 R9-4.4 由材料、技能、意图经 `craftOutcome` 推出。提案没有对应配方行（卷三乙 §4.8（配方通用规则（继承、产率、递归）））时，即兴制作的参数由卷三乙在 `craftOutcome` 内定（卷三乙 R-13，§5.3 勘7 已落地）：取 `rules.crafting.improvise[intent.improviseClass]` 这一按物品类别整类给的条目代替配方行，品质只在 `craftOutcome` 里滚档；即兴产物的拆解、修理照卷三乙 §4.9（拆解、修理、故障）按其模板走，模板没有产出配方的按 X-2 按材料拆；本卷不另挂品质修正，不设即兴系数。产物是一条偏离行，带 `basis`（代号、种子键、写者）。
- **R9-15.4 固化在线下**：同一结构的事实级产物反复出现后，由 §4.16 聚成候选，经作者管线的校验与审批（卷二十八 §4.5（离线校验））变成普通内容行，与手写内容同一格式、同一加载器。运行期不写 `world/`。
- **R9-15.5 级别不看来路也不看档位**：同一提案无论谁提、开不开模型，级别相同。
- **R9-15.6 没有材料名单**：判级与品质都不含材料类别字面量；一种新材料只要有物性数值，就能进事实级提案。

#### 4.15.4 交互

卷三乙 §4.5（品质档）、卷三乙 §4.8（配方通用规则（继承、产率、递归））；卷二 §2.7（系统声明表 `state-owners.json`）（偏离行）；卷二十八 §4.5（离线校验）；卷十九 §4.10（可移动建筑与微型龛祠）（小型构筑物也是事实级产物）；§4.4、§4.7、§4.16。通道：声明写者、事件。

#### 4.15.5 数据实例

- 【西陲】在界碑上刻一道记号。没有效果族能表达“刻了个只有自己懂的记号”；提案给 `mark_kind` 为刻痕类，界碑的实体类在其 `onKinds` 里，级别 `mark`。日后别人路过，场景卡的留痕段里有它。
- 【非西陲】热带海岛上用椰壳做水瓢。效果项都可表达，级别 `fact`。容量由椰壳的几何与材料物性聚合得出，品质档由 `craftOutcome` 按手艺、材料加工难度与检定余量滚出。换成葫芦，同一提案得到另一组数。
- 【超自然】在泉眼旁垒一座小龛。级别 `fact`，产物是卷十九的微型龛祠类别。它灵不灵不由这次提案或任何叙述决定，由卷七的规则从供奉与信奉读出。

#### 4.15.6 验收断言

- 扫描式：A9-15.1 判级与即兴制作代码里材料类别、品质档名字面量数为 0（改前 3 个材料类别字面）；运行期代码写 `world/` 目录的调用点数为 0。
- 不变量式：A9-15.2 `landingOf` 对同一提案与状态结果恒定，且不随来路与档位变化；留痕写入前后除 `state.marks` 与事件外状态逐值相同，且留痕只经 `create` 原语写入；每条偏离行都带可追溯的 `basis`；即兴产物的品质档与同材料、同技能、同余量下按配方制作的品质档出自同一个 `craftOutcome`。
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

### 4.17 选择式判断层

#### 4.17.1 维度

用途 `judge`；`rules.judge.minConfidencePermille`；`rules.ai.understandOrder`（list<ai_use>，元素只取 `judge`、`understand`）。题目结构：`{questionId: integer, options: list<代号 | 候选 id | 数值档>, noneIndex: integer, endIndex: integer nullable}`；答案结构：`{questionId, choice: integer, confidencePermille: integer [0,1000]}`。本节只定与供应方无关的接口（李白 11-13 对 §8 第 7 条的裁定）：只出选择题、答案必在可表达集合 C 内；不锁定供应方，供应方与模型代号在运行配置里；默认关闭（`judge` 首值不在任何档位，§4.14.1）。计价口径、单题选项数上限与把握阈值都是未核项，待标定（待补清单第 5 条）。

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
- 不变量式：A9-17.2 首值配置下任一档位的 `judge` 请求数为 0；判断层交出的每个意图都通过 `shape` 段；任一题选“都不是”时结果从不是一个普通动作意图（除非该题是槽位题）；关闭判断层后同一串点选的结果不变。
- 扩展性式：A9-17.3 新增动作行、效果族行后，判断层的题目选项自动包含它们；更换供应方只改运行配置。

### 4.18 录制回放与费用账

#### 4.18.1 维度

旁路记录（每次模型调用一行，不在 state）：`{responseId: integer, use: ai_use, attempt: integer, tier: ai_tier, modelClass: model_class, schemaId: 代号, inputTokens: integer, outputTokens: integer, result: ai_fail | ok, rejects: list<reject_code>}`，全是代号与整数，按卷二的 kernelApi `report` 写（不含 `Text`）。没有延迟字段：运行时不读墙钟（卷二 §2.9（外部边界与 Text 模型）“定时器”），延迟只在腾讯云测试台外部量（李白 11-13 对 T8 的裁定）。录制文件另存每次调用的请求体与响应体原样字节。费用账：每种用途的 `inputTokens`、`outputTokens` 累计（整数相加）。`rules.ai.budgetTokens`。

#### 4.18.2 统一入口

写：旁路记录、费用账、学习记录一律经 kernelApi `report`（`kernel/report.mjs`，签名见卷二 §2.9（外部边界与 Text 模型）外部出口表）；录制文件只由 aiGate 内一个登记的落盘出口 `ai-gate/recorder.mjs` 写（卷二已在外部出口表登记这一行，§5.3 勘4）。读：`replaySource(key)`（回放时替换模型出口），只在测试与回放用的装配处注入，不进正式运行的装配文件；线下工具。规则层与内核没有入口。

#### 4.18.3 规则

- **R9-18.1 旁路不是状态**：旁路记录、录制文件、费用账都不在存档里，不进哈希，规则层与内核读不到。
- **R9-18.2 键**：一次模型调用的键是（`responseId`、`use`、`attempt`）。`responseId` 是内核给每个响应发的单调整数（卷二 §2.9（外部边界与 Text 模型）第 0 条）。这个键只在旁路里用，不得成为任何骰值键、事件 id、实体 id 的成分（卷二十七 §4.8（种子键与骰值键（确定性约束与验收）））。
- **R9-18.3 回放**：回放只在测试与回放用的装配（卷十二的测试台）里存在：那里把 `replaySource()` 注入 aiGate，模型出口换成按键读录制文件；正式装配文件 `server-plugin/index.mjs` 的封闭清单里没有它，正式运行不可能进入回放。回放装配放在测试台一侧的 `tests/` 下，不在 `server-plugin/` 内（运行时文件 import `tests/` 即卷二 §2.7（系统声明表 `state-owners.json`）的 E-PROC-IMPORT）；它的封闭清单是正式装配 `assembly.calls` 的十一个函数照原样，外加且只加一项：把 `replaySource` 交给 `mountAi` 作模型出口（C12-10）。读不到的键按 `offline` 处理。录制文件的写者是 `ai-gate/recorder.mjs`，开不开录制是运行配置，正式运行缺省不录。读到的响应照常过守门、校验与审查。所以用同一份录制回放同一串请求，文字路径的内容与原跑相同，存档摘要相同。卷二十七的复演核对不调模型，直接用存档里已有的封存文字。
- **R9-18.4 费用与预算**：费用账只存 token 数。折成钱是线下工具用价目配置在读时算，不落任何存储。本次会话某用途累计 token 数达到 `rules.ai.budgetTokens` 中该用途的值，即该用途本次会话停用，失败原因 `budget`；缺键即不设上限，值为 0 即始终停用。
- **R9-18.5 旁路只走 `report`，不量延迟**：旁路记录只含代号与整数，经 `report` 写；本卷不要求、也不放开任何计时能力，“任何运行时文件不得读墙钟”不放宽。模型请求的延迟只在腾讯云测试台从进程外部量（卷十二），不进旁路、不进存档。旧的 `sideband.mjs` 按卷二删除（M9-19）。这也回答卷二十七 §8（开放问题）第 16 条：旁路不需要墙钟，写盘只有 `report` 与录制出口两处。
- **R9-18.6 原文只在本机**：录制文件含玩家原文与模型文字，只留在本机；学习记录与对外的统计只带代号与计数。
- **R9-18.7 验收用录制**：真实模型试玩与题集归卷十二 §4.6（扩展性与验收套件）；它们以录制文件为输入，可离线重跑。真实模型试玩条目执行时，费用账里每种用途的 `inputTokens`、`outputTokens` 累计作为该条目的读数，由测试台并进卷十二 §4.10（主会话亲跑与报告）的报告；折成钱照 R9-18.4 由线下工具读时算，不落存储（C12-10）。

#### 4.18.4 交互

卷二 §2.9（外部边界与 Text 模型）（`responseId`、`report` 出口、装配文件封闭清单）；卷二十七 §4.7（复演与规则只一版）、卷二十七 §4.8（种子键与骰值键（确定性约束与验收））；卷十二 §4.6（扩展性与验收套件）；§4.14、§4.16。通道：无（不读写世界状态）。

#### 4.18.5 数据实例

- 【西陲】一局 40 回合的 `t2` 试玩，录制 40 次 `narrate`、40 次 `validate`、12 次 `understand`。离线回放：92 个键全部读到（`40 + 40 + 12 = 92`），存档摘要与原跑相同。
- 【非西陲】在群岛航线的一局里把 `narrate` 的预算设为 20000。第 31 回合累计 19400，第 32 回合用掉 900 后为 20300，不小于 20000：自第 33 回合起 `narrate` 以 `budget` 停用，改走模板。`19400 + 900 = 20300`。
- 【非人类】回放一段与狼群头狼的对峙：录制里缺第 7 回合的 `narrate`（当时超时）。回放时该键读不到，按 `offline` 走模板，与原跑一致。

#### 4.18.6 验收断言

- 扫描式：A9-18.1 规则层与内核读旁路记录、录制文件、费用账的调用点数为 0（S9-6）；骰值键、事件 id、实体 id 的成分表达式里出现 `responseId` 的次数为 0；aiGate 里引用 `Date`、`performance` 的行数为 0；`report` 与 `ai-gate/recorder.mjs` 之外写旁路或录制的位置数为 0；正式装配文件里出现 `replaySource` 的次数为 0。
- 不变量式：A9-18.2 用同一份录制回放两次，存档摘要相同；开关录制不改变存档摘要；费用账各项恒等于旁路记录逐行之和。
- 扩展性式：A9-18.3 新增一种 `ai_use`（改本卷枚举与用途表）后，录制、回放、预算对它自动生效，旁路记录结构不变。

### 4.19 输入边译码器与入库前守门

#### 4.19.1 维度

`decode_result`、`reject_code`、`intent_slot`、`request_kind`、`channel`（§2.1）；`rules.gate.retryLimit`、`rules.gate.maxTextCodePoints`；`rules.gate.categoryMap`（map<blocklist_category 代号, reject_code>，键全覆盖屏蔽词类别族，见 §2.5）；`rules.gate.verdictMap`（map<validator_verdict, reject_code nullable>）。通用槽位（路由与译码层共用，封闭）：

| 槽位 | 内部值类型 | 线上 `slot_kind`（R9-6.7） | 来自 |
|---|---|---|---|
| `actionId` | 动作代号 | `code` | 菜单候选 |
| `targetRef` | EntityId | `code` | 槽位候选 |
| `scope`、`relation` | `target_filter` 代号 | `code` | 族内 |
| `kind` | `request_kind` | `code` | 封闭 |
| `channel` | `channel` | `code` | 界面开关，不从文字里译 |
| `wait` | integer:minute，≥ 1 | `number` | 数值 |
| `focus` | list<`focus` 代号> | `code`，`multi` | 族内 |
| `respondents`、`mentions` | list<EntityId> | `code`，`multi` | 在场与已知候选 |
| `dims` | list<维度代号> | `code`，`multi` | 登记维度 |
| `whenAnchor` | 历法锚代号 | `code` | 卷二十历法表 |
| `whenDay` | integer | `number` | 数值 |
| `qty` | integer ≥ 1 | `number` | 数值 |
| `nameSlot` | 命名槽代号；名字文字不在意图里 | `text`（只带已填标记） | 动作行声明 |
| `paceTarget` | `pace_target` | `code` | 界面开关（R9-6.8） |
| `paceLevel` | 卷二十 `pace_level` 代号，可空 | `code` | 界面开关（R9-6.8） |
| `invite` | 待应答记录的键（`inviteId`，EventId，不上线，只以候选编号传） | `code` | 行动者作为应答者名下的打开记录（R9-12.15） |

动作专有槽位不进这张表：它们由动作行的 `slots` 声明，同样只用 `slot_kind` 三值加 `multi`。`schema:input-edge-v1` 与 `schema:wire-up-menu-v1` 的 `slots` 键取“通用槽位 ∪ 该动作行 `slots` 的键”，取值域（候选来源、`min`、`max`、单位）从动作行读，所以译码器与菜单都按动作行得知它们。卷三乙 §4.8（配方通用规则（继承、产率、递归））给制作动作的四个意图参数按此由制作动作行声明：`choices`（`code`，`multi`，候选是可行配方各组的候选序号）、`times`（`number`，上界取卷三乙的规则表）、`care`（`number`，域取 `rules.crafting.careRange`）、`emphasis`（`code`，候选取 `emphasis` 词表，可空）；无配方即兴另有一项 `improviseClass`（`code`，候选取 `class` 族中 `rules.crafting.improvise` 有键的类别，可空；只在配方 id 为空时读，卷三乙 R-13），同样由制作动作行声明。它们不进通用槽位枚举，卷三乙 Q-09 已相应改为已闭合（§5.3 勘6、勘7）。卷二十三 R23-1.2 给创作动作的专有槽位同样由创作动作行声明，其中 `slots`、`roles` 两项必传（`required` 为真），由提出动作的一方写定：`slots` 是 `number` 槽，取该作品种类 `subjectSlots` 的 [min, max] 内的整数；`roles` 的取值形状与合法性照卷二十三 R23-2.2 ④（封卷后勘误 1115c1；卷二十三 R23-2.2 ③④）。

#### 4.19.2 统一入口

输入边（`server-plugin/input/**`，文件数与 import 权限归卷二 §2.7（系统声明表 `state-owners.json`））：`decode()` 把键入文字变成 `decode_result`。AI 边（aiGate 组）：`interpret`、`narrate`、`narrateTurn` 三个入口内的守门链。两处都不属规则层；规则层不得 import 它们。它们交给规则层的只有 §2.4 的代号结构与本节的代号。

#### 4.19.3 规则

- **R9-19.1 不开模型的译码**：键入文字只做卷二 §1.9（代号、显示名与语言边界）第 3 条的规范化，然后在当前菜单层的“显示名到代号”“编号到代号”两张冻结表里整串查。查到一项即该项；两项折叠后相同即 `ambiguous`；查不到即 `menu_fallback` 并展示完整菜单。没有别名、部分匹配、关键词。
- **R9-19.2 开模型的译码**：输入边把本轮原文与候选集（构造器树的代号）交 AI 边的 `interpret`，取回按 `schema:input-edge-v1` 收窄的结果：意图列表、`ambiguous` 或 `menu_fallback`。结果里的每个 id 与代号必须在候选集内，否则整个结果按 `menu_fallback` 处理。
- **R9-19.3 不猜、不填默认**：必填槽位译不出时，结果是 `ambiguous` 并在 `ReplyResult.missingSlots` 指明缺的槽位代号（§2.4），由菜单补这一步。译码器不替玩家选“最可能的”。
- **R9-19.4 名字到 id 只在这里**：把一个名字对到实体 id，只发生在输入边（整串查显示名）或模型从候选 id 里选。规则层任何地方都不比较名字。
- **R9-19.5 入库前守门的检查链**：模型的每一份输出按固定次序过六步，任一步不过即给出拒收代号并停止。① 按封闭 schema 收窄：结构不合为 `reject:schema`；代号或 id 不在登记表与候选集内为 `reject:unknown_entity`；数值越界、文字字段码点数超过 `rules.gate.maxTextCodePoints`、字符不在码点范围表内为 `reject:range`。② 引文同一性（卷二 §2.9（外部边界与 Text 模型）第 6 条）：不符为 `reject:quote_mismatch`。③ id 泄漏（同条的代号登记表比对）：命中为 `reject:id_leak`。④ 屏蔽词（同条的唯一匹配实现，词表数据归卷二十九 §4.1（显示层隔离契约））：命中段的类别经 `rules.gate.categoryMap` 折成拒收代号。⑤ 第二校验器的裁定经 `rules.gate.verdictMap` 折成拒收代号（未标记专名折为 `reject:unknown_entity`，未成年人亲密情节折为 `reject:minor_romance`，被注入内容带偏折为 `reject:injection`）。⑥ 位置引用：声明、问题清单、引用里的区间须落在文字长度内、所引来源 id 已登记，否则 `reject:range`。六步都过，文字才按卷二 §2.9（外部边界与 Text 模型）第 3 条入库，结构化部分才交规则层做 §4.9、§4.11 的校验。
- **R9-19.6 重请只有一个计数**：同一次生成请求内，守门的各种拒收与规则层的作废（E-TURN-UNMAPPED、E-CLAIM-SCHEMA、审查不符）共用一个计数，上限 `rules.gate.retryLimit`；卷一 §3（硬规矩条文）R-2 第 10 条把它限在不超过 1。用尽即 E-GATE-RETRY：叙述改用模板，译码退回菜单，起名不写入。重请不放宽任何一步。
- **R9-19.7 被拒的内容三不**：不入库，不进哈希，不进后续提示。旁路里只留拒收代号与位置。
- **R9-19.8 注入防线**：做法只按卷二 §2.9（外部边界与 Text 模型）第 0 条“注入防线与剥离口径”——隔离、输出封闭、照常筛查，不读玩家文字做判断。`reject:injection` 只来自第二校验器的裁定。规则可读的状态里没有自由文字，检索不拿文字作键，所以“把指令藏进记忆”没有落点。
- **R9-19.9 未成年人保护的文字半边**：屏蔽词表里未成年内容类别的命中，与第二校验器的相应裁定，都折成 `reject:minor_romance`；数值半边在 R9-8.5。两半各自独立生效。
- **R9-19.10 第二校验器**：它是与叙述请求分开的另一次模型请求（用途 `validate`），与 `narrate` 同档绑定（R9-14.2）。它的输入只有三样：叙述正文、其中的实体标记、登记名表片段（按标记涉及的实体与在场集合取，不超过 `rules.ai.validateNameWindow` 条）；不送整份场景卡与上下文。固定的校验指令放静态区，走供应方的提示缓存（R9-10.8 ①）。模型档取 `rules.ai.modelClass` 中 `validate` 的值，首值是最便宜的 `economy`。它只输出 `validator_verdict` 列表（带码点区间，知情类带事实 id）。它在 AI 边；规则层只见代号。档位、名表片段条数与模型档都是规则表键，待标定（李白 11-13 对 §8 第 9 条的裁定；费用估算见 `审查/卷九-一审.md` 第四节）。
- **R9-19.11 玩家起名与手记**：流程归卷二 §2.9（外部边界与 Text 模型）第 3 条；本卷只定意图里带的是 `nameSlot` 代号，守门不过时用同一套拒收代号；命名候选的条数取 `rules.i18n.nameCandidateCount`（首值归本卷）。
- **R9-19.12 可以整体拔掉**：删去输入边目录后，菜单路由、构造器、`narrate` 入口都不受影响；目录里凡必填槽位都有非 text 填法的动作，仍可经菜单到达（I9-1）；只有 text 填法的动作（现仅手记）没有输入边时不进菜单投影（卷二 §2.9（外部边界与 Text 模型）第 3 条"玩家起名路径"项）。
- **R9-19.13 两种语言对等**：译码器与守门没有按语言分叉的代码；差别只在语言包与词表数据。

#### 4.19.4 交互

卷一 §2.9.2（安全两道闸：AI 输出边守门 + 显示闸（L-13））、卷一 §2.10（输入边（不是层；可整体拔除））；卷二 §1.9（代号、显示名与语言边界）、卷二 §2.7（系统声明表 `state-owners.json`）、卷二 §2.9（外部边界与 Text 模型）；卷二十九 §4.1（显示层隔离契约）（词表数据）、卷二十九 §4.7（前端适配器与输出守门）；卷四 §4.9（身份键、化名、认出）；卷二十 §4.2（历法数据与周期日规则格式）（时间槽的锚代号）；卷二十二 §4.1（主观视图四域与检索键）；卷十二（扫描与性质测试）；§4.5、§4.6、§4.9、§4.11、§4.17。通道：无（只向规则层交代号结构）。

#### 4.19.5 数据实例

- 【西陲】不开模型，菜单当前层有“1 买”“2 卖”“3 离开”。键入 `2` 查编号表得“卖”的代号；键入与显示名逐码点相同的两个字得同一代号；键入一整句想卖东西的话，查不到，`menu_fallback`，菜单原样再列一遍。
- 【非西陲】英文语言包下在北方港口键入首字母大小写不同的 `buy`：规范化的大小写折叠后与显示名相同，查到。键入 `buy fish` 查不到，退回菜单。两种语言走同一段代码。
- 【超自然】`t2` 下模型的叙述里写了一位登记表里没有的“河伯”的名号，未加实体标记。第二校验器裁定 `unmarked_name`，折成 `reject:unknown_entity`；重请一次仍如此，E-GATE-RETRY，本回合显示模板叙述。那段文字没有入库，下一回合的提示里也没有它。

#### 4.19.6 验收断言

- 扫描式：A9-19.1 输入边目录内卷二 §2.8（字符串类型规则）该组闭集之外的字串用法数为 0，文件数不超过卷二规定的上限；`reject_code` 枚举之外的拒收代号字面量数为 0；规则层 import 输入边或 AI 边的行数为 0（S9-5）。
- 不变量式：A9-19.2 删去输入边目录后，目录里凡必填槽位都有非 text 填法的动作行，仍可经菜单路由提交并结算（只有 text 填法的动作不进菜单，卷二 §2.9（外部边界与 Text 模型）第 3 条）；被拒的输出前后存档摘要相同、后续提示里不含它；同一次生成请求的重请次数不超过 `rules.gate.retryLimit`；互换中英文语言包，同一串点选的存档摘要相同。
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
| `difficulty_row`、`ability_row`、`cap_row`、`cap_exempt_row`、`cost_row` | 行表 | 各领域卷 | 登记行 |
| `consent()`、`authority()`；`consent_clause`、`authority_source` | 读入口、行表 | 卷十五、卷八b、卷八、卷十八、卷二十一、卷十四、卷六 | 调入口取读数（只有动作行声明的配合事项拦截）；登记行 |
| `activityOf()`、`agendaOf()`、`freeSlotsOf()` | 读入口 | 卷十四、卷二十六、卷二十二、卷二十九 | 读“在做什么”、空闲时段 |
| 会话命令（节奏设置） | 规则 | 卷二十 | 本卷受理玩家节奏设置，发 `verb_pace_set`（R9-6.8） |
| `ReplyResult` 中本卷负责的字段 | schema 片段 | 卷二、卷二十九 | §2.4 |
| `affordances()`、`constructorTree()` | 投影 | 卷二十九 | 渲染菜单 |
| `sceneCard()`；`scene_section`、`focus` | 投影、行表 | 卷二十九、各领域卷 | 渲染；登记段 |
| `claim_kind`、`evidence_row` | 族、行表 | 各领域卷、卷二十八 | 登记行 |
| `npcDecision()`、`npcChoose()`；`candidate_provider`；`decision_card` | 读入口、行表、族 | 卷八、卷八b、卷六、卷十三、卷十四、卷十八、卷二十六 | 调入口；登记候选 |
| `dialogue_move`、`dialogueView()` | 行表、读入口 | 卷十八、卷十三 | 登记对话动作 |
| `controlledByPlayer()`；玩家席位边 | 谓词、持有种类 | 卷二十七 | 观察锚（R27-1.2 的定义卷 view） |
| `reject_code`、`validator_verdict`、`decode_result`、通用槽位表 | 枚举 | 卷一、卷二、卷二十九、卷十二 | 读代号 |
| `ai_tier`、`ai_use` | 枚举 | 卷二十七、卷二十八、卷十二 | 读代号 |

### 5.2 本卷读取

| 卷 | 读什么 | 用在 |
|---|---|---|
| 卷二 | `can()`、需求块求值、`effects()`、求值管线、`inputsOf`、回应通道、守门实现、定时器（只用于超时）、`report` 出口、终止协议的两个登记点、`verb_entity_terminated`（订阅，R9-1.12 前提失效通知）、锚点闭式与定点指数函数（R9-1.12 越界时刻） | §3.3、§4.1–§4.3、§4.7、§4.9、§4.14、§4.18、§4.19 |
| 卷三乙 | `craftOutcome`、材料聚合读数、工具能力读数、配方行、`requirementCheck`（R9-1.12 ①（a）） | §4.1、§4.4、§4.7、§4.15 |
| 卷四 | `attrMod`、`workInputs`、身份键 | §4.3、§4.7、§4.19 |
| 卷五 | `canEnter`（只记事实）、在场集合 | §4.3、§4.9 |
| 卷六 | 账本余额与转移、`accountsOf`（R9-1.12 经账本离手的推进点抽查）、估值入口、合同与义务 | §4.1、§4.2、§4.7、§4.11–§4.13 |
| 卷七 | `evaluationOf()` | §4.12 |
| 卷八 | 职位权能与辖区 | §4.8 |
| 卷八b | `legalityOf()`、`disposalRight()`、`noteFact()`；`custodyOf()` 与待遇制度的 `barsActions`、R8b-12.4 受制条件（`capacity` 段与 R9-1.12 ①（b）；羁押、人质边的变化经卷十八持有变化事件订阅，R8b-12.2） | §4.1、§4.3、§4.8、§4.12 |
| 卷十三 | 对抗行、威慑量来源行 | §4.3、§4.13 |
| 卷十四 | `skillValue()`、`gainSkill()` 与 `session` 形状、`learn_source` | §4.3、§4.2 |
| 卷十五 | 施法同意条款行、效果族行 | §4.8、§4.7 |
| 卷十七 | 行程节奏变更事件 `verb_trip_pace`（订阅，R9-1.12 前提失效通知 `trip_pace` 行）；`placeSubject`（`move` 原语的写者，C17-11） | §4.1、§4.2 |
| 卷十八 | 持有种类表与转移协议（本卷登记同意边、玩家席位边两行）、`stance()`、`dread()`、`treatment()`、`recall()`、`intimateEligible()`、`intimateAllowed()`、监护边、谎言登记、常住变化事件 `verb_domicile_changed`、持有变化事件 `verb_holding_changed`（均订阅，R9-1.12） | §4.1、§4.3、§4.8、§4.11–§4.13 |
| 卷十九 | `facilityView().type` | §4.3、§4.7 |
| 卷二十 | 调度器到期项、历法表、`calendarView`、`calendarMinuteOf`、`verb_pace_set` 与 `pace_level` | §4.1、§4.4、§4.5、§4.6、§4.12、§4.13 |
| 卷二十一 | 身体类状态实例；实例出现、换档、移除三个事件动词 `verb_status_onset`、`verb_status_stage`、`verb_status_removed`（订阅，R9-1.12 前提失效通知；卷二十一登记，勘11 已落地） | §4.1、§4.7 |
| 卷二十二 | 主观视图、已知集合、检索键、秘密 | §4.10–§4.13 |
| 卷二十六 | `driveWeight`、`decisionJitter()`、`preferenceOf()`、`needSatisfiers()`、需求类状态实例（其推进钩子的输出清单） | §4.12 |
| 卷二十七 | `degradeLevelOf()`、`simTierOf()`、骰值键五段、确定性 id 派生 | §4.1、§4.3、§4.12、§4.14 |
| 卷二十九 | 语言包显示名表、模板、词表数据 | §4.5、§4.10、§4.19 |

### 5.3 需要别卷配合的项

本节分两张表。甲表是封卷后勘误请求：本版只改卷九，不动别卷文件，下列各条由对方卷的改稿者一次改清（行号按 2026-11-13 本版改稿时的文件）；封卷前十二条均已落地，提交号与改前快照见表末列（快照均在 `版本快照/`）。乙表是对尚未成稿各卷与各领域卷的配合项（登记数据行、实现扫描），不属勘误。第一版的 15 项按一审第三节逐项处置，去向见表后。

**甲 封卷后勘误请求（12 条）**

| # | 文件:行 | 全书读者（Grep） | 建议单点改法 | 必要理由 | 落地 |
|---|---|---|---|---|---|
| 勘1 | 卷二-维度表规范与统一入口.md:776（§2.9 第 0 条第 4 点）；同文件 :539、:583–585 的 `records.*.text` 登记项 | 卷一-总纲与分层.md:238、:619（§8.3 哈希表）、:872（附录乙第 15 行）、:946（同步表第 5 行）；卷二-维度表规范与统一入口.md:935（入库守门表 AI 文字行）、:939（哈希口径）、:2601（附录 F 第 15 行）；收尾待办.md:235；本卷 R9-9.9 | 按该点自己写的“卷九判定不需要时一并删”：删去 `records.*.text` 的 `textPaths`、`textWriters`、`pathTypes`、`scopeRecords` 四样登记与 `ai-gate/record-text-gate.mjs`，第 4 点改为一句“运行期没有 AI 记录文字（卷九 R9-9.9）”；卷一:238 的括注同步删去“运行期的 AI 记录文字”一项；卷一 §8.3（:619）哈希表、:872，与卷二:935（连同该行的 `record-text-gate.mjs`）、:939、:2601 同步删去 `records.*.text`；卷一:946 记为已定（删），该行所说的 §2.9.2 与 §8.3 随之改 | 李白 11-13 裁定删 `records.*.text`；不删即留一条无写者的文字路径 | 已落地（e6a546d8，快照 `卷二-v17补23-勘误前.md`；余项 b0191697，快照 `卷二-v17补25-勘误前.md`、`卷一-v16补2-勘误前.md`） |
| 勘2 | 卷二-维度表规范与统一入口.md:245（§1.9 第 2 条） | 卷一-总纲与分层.md:260；卷四-生物身体与人物.md:835；本卷 R9-6.7 | 槽位值的三种形态后补一句：“槽位声明为 `multi` 的 `code` 槽位（通用槽位见卷九 §4.19.1，动作专有槽位见动作行），值为候选编号的列表”；`slot_kind` 三值不变 | 通用槽位 `respondents`、`mentions`、`dims`、`focus` 是列表，现行第 2 条只许单个候选编号，列表槽位无法上行 | 已落地（e6a546d8，快照 `卷二-v17补23-勘误前.md`） |
| 勘3 | 卷二-维度表规范与统一入口.md:746（§2.9 第 0 条“三样东西”的决定卡一项）与 :774（第 3 点）（行号按勘1 删行后的现行文件） | 卷一-总纲与分层.md:593、:945；本卷 §2.4、R9-13.7 | 决定卡一项由单个 `{card, speaker}` 改为 `cards: list<{card, speaker, slots}>`（槽位值的类型由卷九 `card_slot_type` 定），并在“三样东西”末加一句“`ReplyResult` 中卷九负责的字段见卷九 §2.4”；第 3 点“按决定卡写出台词”改为“按 `cards` 写出台词” | 多人应答一次出多张卡；无槽位则模板对白填不出数（如 `prepay`） | 已落地（e6a546d8，快照 `卷二-v17补23-勘误前.md`） |
| 勘4 | 卷二-维度表规范与统一入口.md:866 一带（§2.9 外部出口表 aiGate 各行之后） | 卷二十七-离屏性能存档与确定性.md:800（§8 第 16 条）；本卷 R9-18.3 | 加一行 `ai-gate/recorder.mjs`：aiGate（服务端），写录制文件（`node:fs` 追加写，请求体与响应体原样字节），只在运行配置开启录制时写，不入存档、不进哈希；组白名单相应放行这一个文件的落盘 | 李白 11-13 裁定录制文件写者为 aiGate 内一个登记的落盘出口；现表没有它，aiGate 白名单只放网络请求 | 已落地（e6a546d8，快照 `卷二-v17补23-勘误前.md`） |
| 勘5 | 卷二十七-离屏性能存档与确定性.md:663（R27-8.7 末句）、:791（§8 第 7 条）、:800（§8 第 16 条） | 本卷 R9-3.9、R9-18.5 | R27-8.7 末句（量延迟的墙钟留待卷九与卷二安排）改为“运行时不量延迟；延迟只在测试台外部量（卷九 R9-18.5）”；该卷开放问题第 7 条的登记路径一问记为已答（卷九 R9-3.9：玩家席位边，view 为 `controlledByPlayer()`），观察锚范围一问仍留李白；第 16 条记为已闭合（旁路走卷二的 `report` 出口，录制走本表勘4 请卷二登记的那一行） | T8 选 (a)，原句预设的计时能力不存在；两问已有答案 | 已落地（85bc2e9d，快照 `卷二十七-v4-勘误前4.md`；同类遗漏 M27-12 处置栏于封卷前收尾补改，快照 `卷二十七-v4-勘误前5.md`，未提交） |
| 勘6 | 卷三乙-物态类别与物品.md:1152 与 :1999（§8 Q-09）、:1211（交互表“意图槽位”） | 本卷 §4.19.1 | :1152、:1999 两处“登记进卷九 §4.19 的槽位枚举”与 :1211 交互表“请其登记 … 意图槽位”同一口径改为“由制作动作行按卷九 §4.19.1 声明为动作专有槽位（`choices`、`times`、`care`、`emphasis`）”，Q-09 记为已闭合 | 通用槽位枚举是封闭的、与领域无关；四项是制作动作自己的槽位 | 已落地（a529e5f0，快照 `卷三乙-勘误前-卷九.md`） |
| 勘7 | 卷三乙-物态类别与物品.md:1160 一带（§4.8 `craftOutcome` 签名与 R-1、R-2）与 :1251（X-2） | 本卷 R9-4.4、R9-15.3 | 在 `craftOutcome` 内补一条“无配方即兴”：`recipeId` 为空时，产物模板取意图槽位给的物品类别（卷三乙 §4.3），材料继承、产率、工时、品质滚档按现有各步、取该类别的默认参数（由卷三乙规则表给），开工条件只查工具能力与 `capability`；不另设品质系数 | 本卷删了第二套品质算法（`process.quality`、`rules.cap.improvisedMod`），即兴制作的参数须由品质的唯一定义处给出 | 已落地（a529e5f0，卷三乙 R-13，快照 `卷三乙-勘误前-卷九.md`） |
| 勘8 | 卷六-经济.md:975、:991；卷十八-社会关系与家族.md:643（R18-3.1） | 本卷 §4.8 | “卷九 §4.5（同意）”“卷九 §4.6（同意与权能）”改为“卷九 §4.8（同意与权能）” | 引错节号（§4.5 是构造器、§4.6 是路由） | 已落地（85bc2e9d，快照 `卷六-v10-勘误前5.md`、`卷十八-v8-勘误前.md`） |
| 勘9 | 卷四-生物身体与人物.md:551（§4.4 交互） | 卷十八-社会关系与家族.md:286；本卷 R9-8.5 | “卷九 §4.19（守门读 `adult`）”改为“卷十八 §4.9（婚配制度、性风俗、儿童与老人）的 `intimateEligible` 读 `adult`；卷九 §4.8、§4.19 只调该谓词” | 卷九的数值半边不直接读 `adult`，写成卷九读会造成“第二处亲密资格判定”的误读（卷十八 S18-8） | 已落地（85bc2e9d，快照 `卷四-v10勘误4前.md`） |
| 勘10 | 卷二十七-离屏性能存档与确定性.md:148、:150（§2.2 规则表字段的 `coef`、`costSubjects` 行）、:389–391（R27-3.1 预计成本与块内拍数） | 本卷 R9-1.12、R9-12.7 | 登记一个性能项（新系统键，按该卷 X27-1 的做法补系统声明行、`coef` 行、`costSubjects` 行与基线行）：活动推进的重查。主体是有当前活动的个体，外加没有活动、按 `rules.npc.idleAdvanceMinutes` 登记空闲推进点的个体层的人；每个推进点一次重查（只读数值维度与固定代号：`can()` 的两个 view、`interruptRX` 引用的 view、同意边）。它的周期不是层节拍，而是 `rules.act.advanceMaxMinutes` 各值与 `rules.npc.idleAdvanceMinutes`，所以请该卷写明此系统的“块内拍数”按哪一个间隔折算（建议取各间隔中最短的一个，得上界；各间隔 ≥ 1 由本卷加载校验保证）；同一性能项另计前提失效通知的重查（每条通知对所涉各人的当前活动各一次）与越界时刻的求解（每次推进至多一次二分）；本卷不改该卷。推进点重查中（a）的账本抽查（R9-1.12“经账本离手”）也计入同一性能项，成本式：活跃需求块数 × 引用账户数 + 带工位的活跃需求块数 × 1（每个推进点对该活动的需求块求值一次，扫它所引用的账户与容器；带工位的，再重求一次场所类前提三项——设施行终止谓词、固定装置能力、所在建筑 `type`，不读建筑份额账户；只扫有在世活动挂着的，不扫全账本）；实测数现无法取得（冻结期不跑测试，测试只在腾讯云），标“待实测（解冻后腾讯云）”，本卷不填数 | 李白 11-13 对二审 N1 与二审后核 N1-a 的裁定：没有写入事件的变化靠推进点重查兜住，前提失效类直接写入靠订阅当刻重查，代价是每个推进点与每条通知一次重查，须进成本模型与性能门；李白 11-13 对 H1 取乙，经账本离手的工具也靠推进点抽查，场所只重查原有场所前提（李白 11-13 对 Q1Q3 核 Q2 的裁定） | 已落地（85bc2e9d，卷二十七 R27-3.1、R27-3.8，快照 `卷二十七-v4-勘误前4.md`）；间隔键的数据载体见表后“勘10 附”，待卷二十七 |
| 勘11 | 卷二十一-医疗疾病与身体状态.md:430（§4.1.4 交互“事件（实例出现、换档、移除各发一个动词）”）与 :1185（§5.1 事件动词一行） | 本卷 R9-1.12（前提失效通知表 `status` 行）、§5.2 | 把“实例出现、换档、移除”三个动词作为 verb 族条目登记代号与载荷（至少含主体 id、状态行、档），并在 :430 写明病程推进钩子（R21-1.8 整拍）直写实例时同样在同一事务里发这三个动词（卷七、卷十三经同一登记写者 `status.mjs` 写的实例同发）；:1185 已有的“染病、痊愈、换档”与这三个动词对齐，不另起一套名字——染病、痊愈是疾病这一子类的实例出现与移除，换档同名；:1185 的订阅方加“卷九（前提失效通知）”。只是登记与写明，不改病程律与写入路径 | 李白 11-13 对 N1-a 的裁定：前提失效类直接写入由所属卷发现有事件、卷九订阅；:430 已写发这三个动词，但没有代号，卷九无从按代号订阅 | 已落地（85bc2e9d，快照 `卷二十一-v9-勘误前.md`） |
| 勘12 | 卷十八-社会关系与家族.md:448（R18-1.11）、:1413（术语表）；卷八b-法律治安与刑罚.md:987（R8b-12.2 末句） | 本卷 R9-1.12（前提失效通知表 `custody`、`possession` 行）、§5.2 | 已同批落地（李白 11-13 对 N1-b 的裁定）：卷十八第八版新增持有变化事件 `verb_holding_changed`，任何种类持有边建立、结束、转移时由写该边的写者在同一事务内发；卷八b 以封卷后勘误写明羁押、人质边复用这一事件类别，不另造事件。本卷只订阅 | 被捕与持有边转移原本没有任何事件，① 新增的（b）项无从在当刻重查（`审查/卷九-N1a-核.md` 第一节 N1-b）；（a）的能力组按持有种类读持有边（卷三乙 A-1），持有边转移由本事件覆盖；不消耗的工具项读账本占有，经账本离手走推进点抽查（R9-1.12“经账本离手”），两路并存 | 已落地（e530b340，卷十八升第八版，前版快照 `卷十八-v7.md`；卷八b 快照 `卷八b-v3f.md`） |

以上十二条都不新增内核机制（勘12 的事件由卷十八按其 R18-1.10 同一写法登记，不改卷二）。T17、二审 N1 与二审后核 N1-a（节奏重算与中断的触发）不需要卷二新增提交钩子：一切持续活动在每次活动推进的第一步重查全部前提（R9-1.12），推进点是卷二十已有的到期项；经执行器的写入另在执行器自己的事务末步用卷二已有的 `inputsOf` 求交、当次生效；不经执行器的写入里，前提失效类状态（R9-1.12 `premise_break` 表）由本卷经卷二已有的事件通道订阅所属卷的现成事件、当刻重查（卷二十一的三个动词已登记代号 `verb_status_onset`、`verb_status_stage`、`verb_status_removed`，勘11；被捕与持有边转移订阅卷十八持有变化事件，勘12），能算出越界时刻的连续变化在该时刻插推进点（卷二已有的锚点闭式），其余在推进点抽查——其中执行器外经账本离手的工具（李白 11-13 对 H1 取乙，不动卷六账本核心；场所只重查原有场所前提，建筑份额易手不改变它），下一推进点仍不过的延迟不超过一个推进间隔，成本计入勘10，列本卷公开缺口 G1；卷六收卷时再评是否改为账本发事件（届时若改，属卷二账本通用发事件，再走勘误请求）。

**勘10 附：块内拍数取哪几个间隔，写成数据登记**（`审查/卷九勘误-勘5至12-核.md` 记账）。卷二十七 R27-3.1 已写“周期为若干规则表间隔的系统，块内拍数按其中最短的一个折算”，但哪个系统取哪些间隔目前没有数据位。最小写法：间隔键作数据行随系统登记，代码只按数据求值，不在 `sim-tiers`、`costPlan` 里按系统键特判。
- 载体：卷二十七 cost-model 一项 `cadenceRuleKeys: map<系统键, list<规则表键>>`，可空表；键 ⊆ 系统声明表的系统键；值里每个规则表键须指向值为 integer 分钟、或值全为 integer 分钟的 map 的规则表项（取其全部值），每值 ≥ 1 由登记该规则表键的卷加载校验保证；不合即加载失败。
- 求值（即 R27-3.1 现句，不改式）：有此行的系统，块内拍数 = ⌈`chunkMinutes` ÷ 所列各键全部值中的最小者⌉（除数 ≥ 1，由上条加载校验保证）；无此行的系统照层节拍。
- 本卷登记的数据行：`cadenceRuleKeys.activityRecheck = ["rules.act.advanceMaxMinutes", "rules.npc.idleAdvanceMinutes"]`，与 R27-3.8 的系统声明行、矩阵行、`coef` 行、`costSubjects` 行、基线行同批补。
- 扫描：`sim-tiers`、`costPlan` 代码里系统键字面量（含 `activityRecheck`）计数为 0；新增一个间隔周期系统只加数据行、不改 .mjs。
- 状态：已落地（卷二十七 cadenceRuleKeys）。

**乙 配合项（未成稿卷与各领域卷）**

| # | 对方 | 请对方做什么 | 本卷依据 |
|---|---|---|---|
| P1 | 卷十三、卷十五、卷二十一及各领域卷 | 把现有 26 处难度数字迁成 `difficulty_row`；为各自的效果族登记 `cap_row` 或 `cap_exempt_row`；登记能力行、声明种类、场景卡段、候选提供者、权能来源、条款行；需对方身体配合的动作在动作行 `consent` 里声明 | §4.7、§4.8、§4.10–§4.12 |
| P2 | 卷十二 | 实现 S9-1 至 S9-9 与各节断言；V-21、V-23、V-26、V-29 的判据取本卷 §4.5、§4.19；测试台装配注入 `replaySource()`；模型请求延迟在测试台外部量 | §3.5、§6、R9-18.3、R9-18.5 |
| P3 | 卷二十八、卷二十九 | 作者工具读学习记录与候选卡；显示层按 `cards` 出模板对白；前端提供 `channel` 与节奏设置开关、结构化上行；`ReplyResult` 字段全集与本卷 §2.4 合并定稿 | §4.16、§4.5、§4.9、§2.4 |
| P4 | 卷二 | §2.9 第 0 条“三样东西”决定卡一项（卷二-维度表规范与统一入口.md:746 一带）的 `cards` 元素加 `reading: CardReading`，字段照本卷 §2.4（李白 11-14 批 C29-5） | §2.4、R9-12.13 |
| P5 | 卷二十六 | 心情心理量行登记为视图输出（`exposed` 为真），心情档才有 `psychOut` 可读；本卷只读视图输出，不读心智类容器的档（卷二十六 §3.1（读入口）、P26-7、P26-8；C29-5） | R9-12.13 |
| P6 | 卷二十九 | R29-2.8 变体条件的槽位来源指 `cards[].reading` 的 `persBand`、`gaugeBand`、`relations`、`occasion`（C29-5）；“双方文化代号”不在所请，本卷未给 | R9-12.13 |
| P7 | 卷十五 | ① `castShape` 登记返回形状按 R9-1.13 的键名补 `degreeBps`（现返回无此键；`degreeBps` 即 `cast.degreeBps` 的值），`toolAbilities` 是否并入 `requirement` 由该卷定；开始施法、仪式下一步两行的 `shapeFrom.args` 写明 `via`、`mode` 各取哪个槽位；② ⑥ `consent.barRows` 怎样按请求槽位读出“流派”（`ctx_role` 无流派一项），由该卷写明（C15-1） | R9-1.13、R9-7.3、R9-12.5 |
| P8 | 卷十三 | 出手类动作行 `skillGain.skillFrom` 所指读入口的登记返回形状里给一个 `ref skill nullable` 字段，值取手持物类别条目 `weapon.skill`（现 `combatReadings` 只返回 `weaponClass`；C13-7） | §2.2、R9-2.8 |
| P9 | 卷十 | 该卷亲属声明种类的证据行取 `from: view`、`entry` 为 `kinView`；该种类 `valueType` 为 integer 而字段值是关系列表，“值为列表人数”的比较口径本卷 R9-11.3 未定，请该卷在证据行上写明或另提请求（C10-20） | §2.1、R9-11.2 |
| P10 | 卷二十八 | 离线调用 `reviewClaims` 时按 R9-11.3 传 `rows`（被校验数据行）与 `segments`，`receipts` 为空（C28-11） | R9-11.3 |

第一版 15 项的去向（按一审第三节）：1 → 勘1；2 中过程槽改由本卷在 `derived-process.json` 自己登记（§2.6），词表汇总按写卷须知收尾统一做，意图形态对齐 → 勘2；3 撤回（李白裁定不放开计时能力；旁路出口 `report` 已在卷二），录制出口 → 勘4；4 撤回（持有种类是开放项，本卷自己登记两行，§2.1）；5 撤回，改为本卷回答卷二十七 §8 第 7、16 条 → 勘5；6 撤回（需求越线触发改由本卷执行器末步与空闲推进点完成，R9-12.7）；7 撤回（用 `valence` 档序，R9-12.2）；8 前半撤回（卷三乙 Q-2 已含检定余量），后半 → 勘6，另加 勘7；9 前半撤回（R8b-2.3 已由执行器调 `noteFact`），后半撤回（违卷八b R8b-4.5）；10 撤回（`session` 形状已定，R9-2.8 照用）；11 → P1；12 撤回（卷零:806、:814 已写由卷九登记）；13 撤回（卷一 §7 无 t3 用途表；改的是旧设计 AI-00 与 `ai-profile.mjs`，见 M9-18、M9-22）；14 → P2；15 → P3。

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

**可表达集合的覆盖核对**（卷一 §7（AI 的位置）第 7.1 条第 2 款）：对题集里每个意图，按分类函数判 K1 至 K5，再核下列各条。

五类的定义（出处：`docs/世界设计/AI/AI-00-总纲：AI 的位置、档位与边界.md` 第 143–147 行；分类函数在同文件 §6B，第 201–220 行）：K1 登记动作——命中目录某一行且槽位可填；K2 开放组合——没有登记动作，但每个效果都在效果族表某行、上限可派生；K3 社交与言语——对在场者说话、请求、威胁、许诺、打听，走对话与决定卡；K4 新事物——效果里有 `create` 或 `fact.set` 指向世界里没有的东西，走三级落地；K5 越界——请求直接改数值、改他人状态、凭空造物、绕过经济或改世界规则，处理是拒绝加世界内原因、替代与留痕。分类函数是纯函数，输入是提案结构、请求信封、引擎与状态，不读意图文字：判 K1 读来路是否菜单与动作是否在目录；判 K5、K4 读各效果的原语与目标维度是否在可写白名单、是否指向市场、规则或他人账户；判 K3 读对象是否为人、效果里有无义务、交换、对话类、论据槽位是否非空；判 K2 读效果族表里有没有适用的行。它只在预览时跑一次，返回主类加副类（K3 可与 K2、K4 并存）。旧文里判 K1 读的“来路”在本卷只供验收分类，不进管线（R9-3.2）。

核对：① 判为 K1、K2 的，构造器能点出同一个意图（A9-5.2）。② K3 的论据以 `mentions`、`dims` 槽位表达。③ K4 中起名、立碑类以命名槽与留痕表达，其余进缺口清单。④ K5 在两档下都得到“拒绝、原因、替代”（R9-3.3）。⑤ 缺口清单里不得有必经动作。必经动作是验收套件 P-01 至 P-12（出处：`docs/世界设计/AI/AI-05-成本、速度、可复现与测试.md` 第 255–266 行，规则见第 268–271 行：全程 `t0`、真实新角色、只用公共菜单与开放提案、不为测试造东西）：P-01 市井（买、卖、讲价、租、雇、做工）；P-02 农牧（播种、收割、喂养、采集、结算交易）；P-03 匠作（制造、修理、粗制、学）；P-04 社交（四种请求态、论据、许诺、记忆）；P-05 法律（报案、审理、上诉、赔偿）；P-06 信仰各动作；P-07 学艺（学、练、入行）；P-08 探索战斗（移动、地点、战斗、留痕）；P-09 治理与家庭（组织、治理、家庭各动作）；P-10 开放与拒绝（提案、拒绝、留痕：K2 十个效果族、K5 全部拒绝码、三级落地）；P-11 跨圈（移动、询问、翻译，五圈各停一日）；P-12 重放（任一局存档重放，摘要相同）。每一项的每个动作类，都须在 `t0` 下由菜单或开放提案表单到达（I9-1），由卷十二按题集逐项判。

不变量总表（跨节）：

- **I9-1** 目录每一行都有菜单位置；拔掉输入边后，凡必填槽位都有非 text 填法的动作仍可经菜单到达（卷二 §2.9（外部边界与 Text 模型）第 3 条）。
- **I9-2** 一切动作引起的写入都在某次 `resolve()` 的提交段或善后段之内。
- **I9-3** 管线九段、审查、决策、对话、落地判定都不读文字、不读来路、不读档位、不读墙钟、不读事件日志。
- **I9-4** 同一种子、同一串意图：四种来路、四个档位、任意分段推进，事件流与文字路径之外的状态逐值相同。
- **I9-5** 模型的任何输出至多改变文字路径；被拒的输出什么也不改变。

---

## §7 迁移与退役清单（交卷十一）

锚点（文件:行）一律取卷零 §0.6（锚点写法）规定的基线提交 d54c89a3（卷十一 R11-2.3、C11-5 ⑤），本节没有用别的提交。后三列是封卷后勘误 1115y1（卷十一 C11-5 ③④）补的：处置取 `mig_disp` 六值之一（一行有多个去向时取主去向，其余写在"改法"栏）；落点写到本卷规则号；落点对象取§2.3 六类代号之一（表代号、词表族条目、规则表键 rules.*、系统登记项键、模块组键、门禁设施代号；规则层的行取规则所属系统登记项键或规则表键，不写 rules）。

| # | 位置 | 现状 | 改法 | 本卷依据 | 处置（`mig_disp`） | 落点（规则号） | 落点对象 |
|---|---|---|---|---|---|---|---|
| M9-1 | 登记动作 337 条旧处理器外壳；action-affordances.mjs:310 | 外壳加处理器；活动与状态文字拼测 | 逐条改为 §2.2 数据行，处理器删除；可用性只读谓词单入口 | R9-1.1、R9-1.2 | `to_data` | R9-1.1；原对象栏写 action | `sys.ai_interface` |
| M9-2 | legacy-primitives.mjs:1、legacy-primitives.mjs:181 | 旧处理器仍是写者；按睡眠文字判活动 | 文件退役；睡眠是状态容器 | R9-2.4、R9-1.3 | `delete` | R9-2.4 | `sys.ai_interface` |
| M9-3 | primitives-effects.mjs:294 | 用文字正则判练、教、演 | `learn` 原语参数改代号 | R9-2.5、R9-2.8 | `recode` | R9-2.5 | `sys.ai_interface` |
| M9-4 | action-limits.mjs:247–289、action-limits.mjs:267–283、action-limits.mjs:15、action-limits.mjs:54 | 只为 9 类派生上限；即兴制作只认三种材料字面；材料抗性表硬编码 | 上限改读 `cap_row`；覆盖做成加载校验；品质走卷三乙入口 | R9-7.3、R9-7.5、R9-15.3 | `to_data` | R9-7.3；原对象栏写 cap_row | `sys.ai_interface` |
| M9-5 | 难度数字 26 处（06a §8） | 写在动作与代码里 | 迁成 `difficulty_row`，由各领域卷登记 | R9-7.1 | `to_data` | R9-7.1；原对象栏写 difficulty_row | `sys.ai_interface` |
| M9-6 | activities.mjs:176、activities.mjs:208、activities.mjs:232、activities.mjs:241、activities.mjs:297、activities.mjs:257、activities.mjs:293 | 退让阈值写死；项目阶段用中文；职位名字面；按报错文字判断 | 阈值进规则表经 `interruptRX`；阶段用 `act_stage`；权能走 `authority()`；只比错误码 | R9-1.5、R9-1.6、R9-8.6 | `recode` | R9-1.5（入口 `authority`） | `sys.ai_interface` |
| M9-7 | npc-autonomy.mjs:61、npc-autonomy.mjs:176、npc-autonomy.mjs:48、npc-autonomy.mjs:50、npc-autonomy.mjs:89 | 自治旁路直写；按目标内容文字匹配 | 一律交 `resolve()`；候选改数据行 | R9-12.10、R9-12.7 | `replace_entry` | R9-12.10（入口 `resolve`） | `sys.ai_interface` |
| M9-8 | npc-decision.mjs:13、npc-decision.mjs:25、npc-decision.mjs:14、npc-decision.mjs:11 | 读记忆正文；按活动文字判忙；代价截成非负；底线文字包含判断 | 读记忆条数与事件类别代号；判忙用谓词与 `activityOf()`；代价保留正负；底线读评价行 | R9-12.2–R9-12.4、R9-12.8 | `recode` | R9-12.2（入口 `activityOf`） | `sys.ai_interface` |
| M9-9 | action-router.mjs:75、action-router.mjs:123、action-router.mjs:262、action-router.mjs:263、action-router.mjs:421、action-router.mjs:678 | 解析玩家原话 | 删除；按签名分发与筛选式指代 | R9-6.1、R9-6.3、R9-19.1 | `delete` | R9-6.1 | `inputEdge` |
| M9-10 | action-constructor.mjs:34、action-constructor.mjs:38；action-time.mjs:15、action-time.mjs:23；action-registry.mjs:139 | 子串命中；去客套话；时间词最长匹配；工具字段打分 | 删除；构造器只收代号；时间槽交结构 | R9-5.1、R9-5.5 | `delete` | R9-5.1（入口 `affordances`） | `inputEdge` |
| M9-11 | retrieval-lexicon.mjs:19、retrieval-lexicon.mjs:31、retrieval-lexicon.mjs:33；npc-memory.mjs:205 | 注入正则；规范化与同义词；替换词再检索 | 注入防线归 AI 边；检索只按键 | R9-19.8、R9-10.7 | `move_out` | R9-19.8 | `aiGate` |
| M9-12 | scene-card.mjs:109、scene-card.mjs:113、scene-card.mjs:133、scene-card.mjs:95；action-text.mjs:99；chronicle.mjs:50 | 按问话正则塞段；状态用中文字面比较 | 段登记加 `focus` 代号；状态比代号 | R9-10.1、R9-10.2、R9-10.5 | `recode` | R9-10.1 | `sys.ai_interface` |
| M9-13 | consistency-review.mjs：卷零 §3.5.3 逐行 60 处，另加 §3.5.3b(b) 的 10 处（:2/:3、:32、:137、:148、:155、:184/:185、:299、:447、:507、:565；:88 卷零定为删除、无接手方）；consistency-service.mjs（§3.5.3b(a) 19 处）；consistency-evidence.mjs:3、consistency-evidence.mjs:161、consistency-evidence.mjs:162、consistency-evidence.mjs:165、consistency-evidence.mjs:166、consistency-evidence.mjs:167、consistency-evidence.mjs:197、consistency-evidence.mjs:201 | 全文正则读叙述；读玩家原文；读屏蔽词表；引文逐字比对 | 只核结构化声明；屏蔽词与名字解析迁守门与输入边；:148、:447、:507、:565 的引文比对改位置引用，由卷十一按行号出卡；import 场外判定的两处改读结构化 `channel` | R9-11.1–R9-11.10、R9-19.5 | `recode` | R9-11.1 | `sys.ai_interface` |
| M9-14 | 人物档 `redLines` 数组（卷二十六 §7 交来，275 处） | 底线是文字 | 改由评价行与价值有效值算出 | R9-12.2 | `recode` | R9-12.2 | `sys.ai_interface` |
| M9-15 | extension/turn.mjs:30–41、extension/turn.mjs:97、extension/turn.mjs:104–111；extension/prompt.mjs:37；engine.mjs:397 | 正文尾注解析、默认值、场外前缀正则、数值 0 兼作标志 | 结构化 `turn` 与 `channel`；`timing` 显式代号；无默认值 | R9-9.3–R9-9.8 | `recode` | R9-9.3 | `sys.ai_interface` |
| M9-16 | action-consent.mjs:10、action-consent.mjs:128；action-authority.mjs、action-authority-sources.mjs | 用文字判亲密；比用途文字；权能读法分散 | 合成 `consent()`、`authority()` 两个入口；比代号 | R9-8.1–R9-8.9 | `replace_entry` | R9-8.1 | `sys.ai_interface` |
| M9-17 | population.mjs:407、population.mjs:409（文字半边）；population.mjs:33–36（运行时读 `defaultBlocklist`）、population.mjs:371（`checkGeneratedProfile` 的屏蔽词参数）——后两处与卷十、卷二十八共管，守门一侧归本卷 | 生成时用正则与词表拒收；规则层读屏蔽词 | 迁入库前守门；规则层不再读屏蔽词；数值半边留规则层 | R9-19.5、R9-19.9、R9-8.5 | `move_out` | R9-19.5 | `gate` |
| M9-18 | ai-profile.mjs:4 | 用途表写在代码里，含模型替 NPC 规划与写人物档 | 改读 `rules.ai.tierUses`，移到 AI 边；两种用途删除（李白 11-13 裁定） | R9-14.2、R9-14.8 | `to_data` | R9-14.2 | `rules.ai.tierUses` |
| M9-19 | sideband.mjs | 旁路记录自取墙钟、自写文件 | 按卷二 §6.11（显示字段、语言解析与派生槽的迁出）删除该文件；旁路改调 `report`，不量延迟；键用 `responseId` | R9-18.2、R9-18.5 | `delete` | R9-18.2 | `aiGate` |
| M9-20 | world/rules/tables/open-actions.json、balance/action-costs.json、world/rules/open-reactions.json、open-tagging.json | 开放动作上限表、动作成本表、开放反应与标注 | 分别并入 `cap_row`、`cost_row`、留痕反应规则；标注表按代号重写或退役 | R9-7.3、R9-7.7、R9-15.2 | `to_data` | R9-7.3；原对象栏写 cap_row | `sys.ai_interface` |
| M9-21 | world/templates/dialogue/common/plain/*.json（8 个）；intentForms 1 条 | 模板对白与形式模板数量少 | 模板归卷二十九按决定卡代号补齐；形式模板迁 `intent_form` | R9-5.4、R9-5.7 | `to_data` | R9-5.4；原对象栏写 intent_form | `sys.ai_interface` |
| M9-22 | `docs/世界设计/AI/AI-00-总纲：AI 的位置、档位与边界.md`:88（T3 = T2 + npcPlanning + profileDraft）、:79（assist 预设的两个开关）；`npc-planning-service.mjs`:7–26（每日离屏规划）；`population-service.mjs`（首次交谈档案起草两次调用） | 旧设计与代码里 T3 含模型替 NPC 规划、模型写人物档 | 旧设计文档按 R9-14.8 改写 T3 为 `draft`（作者边）、`judge` 默认关；两处运行期模型调用删除（`population-service.mjs` 的退役另见卷二十七 M27-16） | R9-14.8 | `delete` | R9-14.8 | `aiGate` |
| M9-23 | primitive-schema.mjs:16–19 的 `learn` 必填字段（`subject`、`learningSource`） | 参数与卷十四 `session` 对不上 | 改为 `subject`、`skill`、`source`、`minutes`、`difficulty` | R9-2.8 | `recode` | R9-2.8 | `sys.ai_interface` |
对应 06a、06b 行：06a §8（难度数字）、06a §6（本地清醒判断与睡眠正则）；06b 待定 1 的 74 行（卷零已扩为 151 处）、06b A 类 action-affordances:310、action-limits:54、legacy-primitives:181、npc-autonomy:48/89、npc-decision:25、primitives-effects:294，E 类 npc-decision:13、npc-autonomy:50，F 类 activities:293。

卷零 §3.5 的 151 处与本卷 M 条目的逐处对照（按卷零小节计数，同一行里并列的相邻行号卷零按 1 处计）：

| 卷零小节 | 处数 | 卷九独管 | 与别卷共管 | 不归卷九 | 落在哪条 M |
|---|---|---|---|---|---|
| §3.5.2 散点 | 30 | 22 | 2（population.mjs:407、:409） | 6（education:30 归卷十四；activities:257、high-nobility:48 归卷八；population:384、:392、:411 归卷十） | action-router 六处 → M9-9；action-constructor、action-time、action-registry 五处 → M9-10；retrieval-lexicon 三处与 npc-memory:205 → M9-11；scene-card 三处 → M9-12；consistency-evidence:162、:165、:166、:167 → M9-13；population 两处 → M9-17 |
| §3.5.3 consistency-review 逐行 | 60 | 60 | 0 | 0 | M9-13 |
| §3.5.3b(a) consistency-service | 19 | 19 | 0 | 0 | M9-13 |
| §3.5.3b(b) consistency-review 另 11 处 | 11 | 10 | 0 | 1（:88，删除，无接手方） | M9-13 |
| §3.5.3b(c) consistency-evidence | 3 | 3 | 0 | 0 | M9-13（:3、:161、:197、:201） |
| §3.5.3b(d) population | 4 | 0 | 2（:33–36、:371） | 2（:62/:69、:99 归卷十） | M9-17 |
| §3.5.3b(e) extension | 23 | 10（turn.mjs 九行与 :97） | 1（prompt.mjs:37，卷二十九为主） | 12（turn-contract:1/21 一处、runtime 六处、message-view 五处，归卷二十九） | M9-15 |
| §3.5.3b(f) engine.mjs:397 | 1 | 1 | 0 | 0 | M9-15 |
| 合计 | 151 | 125 | 5 | 21 | — |

`125 + 5 + 21 = 151`。M9-12 中 scene-card:95、action-text:99、chronicle:50 与 M9-1 至 M9-8、M9-14、M9-16、M9-18 至 M9-23 来自 06a、06b 与素材包，不在卷零 §3.5 的 151 处里。

---

## §8 开放问题

| # | 问题 | 本卷暂按 | 谁定 |
|---|---|---|---|
| 1 | `t3` 的含义：取消运行期“模型替 NPC 规划”“模型写人物档” | 已裁定（李白 11-13）：`t3` 为 `t2` 加作者边 `draft`，`judge` 默认关；AI 不进逻辑（R9-14.8）；旧设计 AI-00 与 `ai-profile.mjs` 照改（M9-18、M9-22） | 已闭合 |
| 2 | 运行期不保留 AI 记录文字（R9-9.9） | 已裁定（李白 11-13）：删 `records.*.text`，存档与规则状态不存 AI 文字，风味文字只属显示层；卷二侧的删除见 §5.3 勘1 | 已闭合；卷二按勘1 改 |
| 3 | `power` 族的条目归属 | 卷二 §1.9（代号、显示名与语言边界）族表已有 `power→power_`：格式归卷二，条目由持有该权能来源的领域卷登记 | 已闭合 |
| 4 | 冷却、持续、到期的统一登记 | 已按台账 S-07（已采纳）：冷却落成带时限的状态容器实例（R9-7.8） | 已闭合 |
| 5 | 同一行动者同一刻多次提交的事件 id | 已按卷二十七 R27-8.5、R27-8.9 解决：以上一条事件 id 作主体段（R9-3.8、§2.9），不再禁止重复提交 | 已闭合 |
| 6 | 审查的 `history` 一类声明要求定义卷有可读的累计量；没有的种类只能降为自报 | 首批表里先按 `ledger` 写，待各卷认领 | 各领域卷 |
| 7 | 选择式判断层 | 已裁定（李白 11-13）：只定与供应方无关的接口（只出选择题、答案必在 C 内），不锁定供应方，默认关闭；计价口径、单题选项上限、把握阈值标“未核”，待标定（待补第 5 条） | 已闭合；数值待标定 |
| 8 | 活动中断时预留物“按进度部分退还”未提供 | 只有整笔退还或没收两种 | 卷三乙、卷六如有需要再议 |
| 9 | 第二校验器的成本 | 已裁定（李白 11-13）：同档绑定（开叙述必过校验）；默认最便宜档；只送叙述正文、实体标记与名表片段，不送整份上下文；固定指令走缓存；档位与量是规则表键，待标定（R9-14.2、R9-19.10） | 已闭合；数值待标定 |
| 10 | 术语“声明”与卷八的头衔宣称同词（台账 X-25） | 本卷只用“叙述声明”“声明种类”，代号前缀 `ck_` | 已按台账 |
| 11 | 卷二十七 §8 第 7 条的另一半：观察锚是否应包含玩家同伴之外的受关注对象 | 本卷只给“谁由玩家控制”（R9-3.9）；锚的范围不归本卷 | 李白（涉及成本）；卷二十七 |
| 12 | 经账本转移离手的工具（卷二:431 第一条路，`declareLedgerWriter` 登记的账本写者在执行器外 `moveStock` 等，如合同给付、罚没入库、终止清算）：账本不发事件，这是失去工具的几乎全部情形，不是边角 | 已裁定（李白 11-13 对 H1 取乙，不动卷六账本核心）：退回（丁）路推进点抽查，按账户与容器整类求值（R9-1.12“经账本离手”）；场所只重查需求块原有的场所前提，建筑份额只用来判断场所是否已拆除或转为不可用，不作占有条件（李白 11-13 对 Q1Q3 核 Q2 的裁定），下一推进点仍不过的延迟不超过一个推进间隔；A9-1.1 把账本写者对应到这一路，A9-1.2 机判延迟上界；抽查成本计入勘10。收押时随身之物转入保管分区随 `custody` 事件已重查，不在此列 | 公开缺口 G1；卷六收卷时再评是否改为账本发事件（属卷二账本通用发事件、内核结构，届时报李白） |

**公开缺口**（已定口径、明知未闭合的项；收卷与验收报告照列）：

| # | 缺口 | 现行口径与上界 | 何时再评 |
|---|---|---|---|
| G1 | 执行器外经账本离手的工具没有事件，①（a）不能当刻重查 | 推进点抽查（R9-1.12“经账本离手”）；下一推进点仍不过的，离手到中断不超过一个推进间隔 `rules.act.advanceMaxMinutes[该动作类]`，期间的工照结清；A9-1.1、A9-1.2 机判；成本式见 §5.3 勘10，实测待实测（解冻后腾讯云） | 卷六收卷时再评是否改为账本发事件（§8 第 12 条） |

---

## 附 术语与代号表

| 术语 | 代号或入口 | 定义处 |
|---|---|---|
| 意图 | `Intent` | §2.4 |
| 动作行 | `action`，前缀 `act_` | §2.2 |
| 当前活动 | `state.activities`、`activityOf()` | §4.1 |
| 原语 | `primitives.json` 设计目录 20 个（现役 19 个加 `transform`） | §4.2 |
| 统一裁决 | `resolve()`、`resolve_stage` | §4.3 |
| 检定、成功度 | `check()`、`degree` | §4.3 |
| 开放提案 | `state.proposals`、`preview()`、`confirm()` | §4.4 |
| 构造器、可表达集合 | `constructorTree()`、C | §4.5 |
| 难度行、能力行、上限行、豁免行、代价行 | `difficulty_row`、`ability_row`、`cap_row`、`cap_exempt_row`、`cost_row` | §4.7 |
| 配合、同意、权能 | 动作行 `consent`、`consent()`、`authority()` | §4.8 |
| 玩家席位边 | `rules.control.seatKind`、`controlledByPlayer()` | R9-3.9 |
| 活动推进、推进点 | 三步（重查、结清、中断或重算）；`rules.act.advanceMaxMinutes`；越界时刻 `t*` | R9-1.12 |
| 抽查口径、前提失效通知 | 前提变化送到推进时刻的四路；`premise_break` 表（直接写入的整类登记，订阅所属卷现成事件） | R9-1.12 |
| 中断原因 | `interrupt_cause`（`capability` `interrupt_rx` `consent` `requirement` `custody`）、记录的 `endCause` | R9-1.12、R9-1.6 |
| 活动前提（a）（b） | ①（a）需求块非消耗项与必填实体槽位；①（b）羁押受制（读卷八b `custodyOf`、`barsActions`）；`custody`、`possession` 两行订阅卷十八 `verb_holding_changed`（覆盖被捕与持有边转移，含（a）能力组按持有种类读的工具）；（a）的不消耗工具项读账本占有，执行器外经账本离手走推进点抽查（公开缺口 G1），两路并存；场所类前提只重查原有三项，不以建筑份额作占有条件 | R9-1.12 |
| 重查集合 | 活动的 K | R9-1.12 |
| 会话命令 | 节奏设置、席位 | R9-6.8 |
| `ReplyResult` 本卷字段 | `receipts`、`alternatives`、`ambiguous`、`missingSlots`、`cards` | §2.4 |
| 回合、分段 | `turn`、`segments` | §4.9 |
| 场景卡、焦点 | `sceneCard()`、`scene_section`、`focus` | §4.10 |
| 叙述声明、声明种类 | `claims`、`claim_kind`（前缀 `ck_`） | §4.11 |
| 决定、决定卡 | `Decision`、`decision_card`（前缀 `dcard_`） | §4.12 |
| 对话会话 | `state.dialogues`、`dialogue_move` | §4.13 |
| 待应答记录 | `state.pendingInvites`（键 `inviteId`、应答者；值 `inviter`、`inviteAction`）、动作行 `answer`、通用槽位 `invite` | R9-12.15 |
| 档位、用途 | `ai_tier`、`ai_use` | §4.14 |
| 落地级别、留痕 | `landing_level`、`state.marks` | §4.15 |
| 学习记录 | `learn_event` | §4.16 |
| 选择式判断 | 用途 `judge` | §4.17 |
| 取自槽位 | `from_slot`、动作行 `shapeFrom` | R9-1.13 |
| 活动结束事件 | `verb_activity_ended`（verb 族条目，本卷登记，`activity.mjs` 发） | R9-1.14 |
| 拒绝应答事件 | `verb_invite_refused`（verb 族条目，本卷登记，执行器在应答落为拒绝的裁决事务内发；载荷 `invite`、`inviteAction`） | R9-12.14 |
| 决定卡读数、场合 | `CardReading`、`occasion`（前缀 `occ_`，固定空码 `occ_nil`）、`rules.card.persCuts`、`rules.card.gaugeCuts` | §2.4、R9-12.13 |
| 旁路记录、录制、费用账 | §4.18.1 的结构 | §4.18 |
| 译码结果、拒收代号、通用槽位 | `decode_result`、`reject_code`、`intent_slot` | §4.19 |

首批词表条目（占位，定稿时由登记卷补 `labels`）：`acls_heavy_labor`、`acls_light_labor`、`acls_dive`、`acls_talk`、`acls_travel`、`acls_rest`；`tf_owned`、`tf_adjacent`、`tf_present`、`tf_known`、`tf_hostile`、`tf_friendly`；`cscope_medical`、`cscope_teach`、`cscope_intimate`、`cscope_spell`（只收须对方身体配合的事项；第一版的 `cscope_entry` 删去，进入只走卷五 `canEnter`，`cscope_use_item` 删去，用别人的东西是社会上的同意）；`hk_consent`（同意边，由 `rules.consent.edgeKind` 指名）、`hk_player_seat`（玩家席位边，由 `rules.control.seatKind` 指名；`bodyControl` 假、`intimate` 假、`grants` 空）；`rcls_activity`、`rcls_agenda`、`rcls_proposal`、`rcls_mark`、`rcls_decision_commit`、`rcls_last_commit`（去留都是 `clear`，§3.3）。

首批决定卡与槽位（`slots: map<槽位代号, card_slot_type>`）：

```json
{
  "dcard_agree":       {"outcome": "agree",       "slots": {}},
  "dcard_refuse":      {"outcome": "refuse",      "slots": {"stage": "code", "reason": "code"}},
  "dcard_defer":       {"outcome": "defer",       "slots": {"due": "number"}},
  "dcard_conditional": {"outcome": "conditional", "slots": {"prepay": "number"}},
  "dcard_counter":     {"outcome": "counter",     "slots": {"extra": "number", "offer": "id"}},
  "dcard_answer":      {"outcome": "agree",       "slots": {"facts": "id_list", "lie": "id"}}
}
```

`dcard_refuse` 的 `stage` 取 `decision_stage`、`reason` 取那一段写进 `trace` 的首个代号；`dcard_defer` 的 `due` 是世界分钟；`dcard_counter` 的 `offer` 是会话里那次出价的 id；`dcard_answer` 的 `lie` 可空，是卷十八登记的谎言 id（R9-13.9）。

## 附录 待补清单

需要查证或由别处给出的内容，本卷没有凭记忆填。

| # | 待补内容 | 用在 | 交谁 |
|---|---|---|---|
| 1 | 已补（第二版）：K1 至 K5 的定义与分类函数的输入，读自 AI-00 第 143–147 行与 §6B（第 201–220 行） | §6 覆盖核对 | 已闭合 |
| 2 | 已补（第二版）：必经动作清单 P-01 至 P-12，读自 AI-05 第 255–271 行 | §6 覆盖核对 | 已闭合 |
| 3 | 已补（第二版）：19 个原语的必填参数，读自 `server-plugin/primitive-schema.mjs` 第 4–19 行 | §4.2.1 | 已闭合 |
| 4 | 已补（第二版）：卷零 §3.5 共 151 处的归属与 M 条目对照 | §0.3、§7 末段 | 已闭合 |
| 5 | 未核：选择式判断模型的计价口径（输出 token 是否另计）、单题选项数上限、把握阈值 `rules.judge.minConfidencePermille` | §4.17、§4.18 | 供应方文档（交 Opus）；阈值交标定批 |
| 6 | 待标定：`rules.check.rollDist` 的分布与 `degreeBands` 四个界；`rules.act.craftDegree` | R9-3.5、R9-4.4 | 标定批 |
| 7 | 待标定：`rules.npc.utilityWeights` 七项、`redLineValence`、`grievanceVerbs`、`stanceWeights`、`switchMargin`；`rules.agenda.slotMinutes`；未核（无出处）：`rules.act.advanceMaxMinutes` 各类首值（标定约束只此一条：不长于该类按 R9-1.12（丁）路抽查的前提——没有写入事件、又算不出越界时刻的连续变化——的最短失效时长；有事件或能算出越界时刻的前提不受此约束）、`rules.npc.idleAdvanceMinutes` | R9-12.2–R9-12.7、R9-1.10、R9-1.12 | 标定批 |
| 8 | 待标定：`rules.scene.promptBudget`、`staticBudget`（现测静态提示约一万零五百，口径是 token，需换算成码点） | R9-10.4、R9-10.8 | 标定批；换算交 Opus |
| 9 | 待标定：`rules.ai.timeoutMs`、`budgetTokens`、`degradeMap` 各行；`rules.ai.modelClass`、`validateNameWindow`、`rules.i18n.nameCandidateCount`（李白 11-13：档位与量写成规则表键，待标定） | §4.14、§4.18、R9-19.10、R9-19.11 | 标定批 |
| 10 | 待查（交 Opus）：卷十三 §4.1、§4.18，卷十五 §4.1、§4.4，卷二十二 §4.1、§4.7，卷二十八 §4.5、§4.7，卷二十九 §4.1–§4.3、§4.7，卷十二 §4.6 尚未成稿，引用的标题按台账写，成稿后对齐；其中卷二十二 §4.1、§4.7 标题已定并已对齐，销账（C22-15，11-14 封卷后勘误） | 全卷引用 | Opus 收尾 |
| 11 | 待标定：§2.2 末四条从业与生活方式动作行的 `decision.drives`（`drive_wealth`、`drive_status` 各 0.5，李白裁定第 29 条首值，未核）与四条候选提供行的 `maxCandidates` 4；放弃从业一行两项现取 −0.5，符号待定，标定时可改由收入差派生（李白 ce6e990b ③）；新动作类 `acls_decide` 须在 `rules.act.paceFloor`、`rules.act.advanceMaxMinutes` 补键（两表要求键全覆盖 `act_class`） | §2.2 | 标定批 |

## 附录 修订记录

### 第二版（2026-11-13，改稿 claude-opus-5-5 中档）

依据：`审查/卷九-一审.md` 真问题 24 条（T1–T24）全部改；李白 11-13 裁定（T8 选 (a)；§8 第 1、2、7、9 条照准；T1 同意段只拦物理上须配合的动作）并入；小项 10 条顺手改。只改本卷，需改已封卷的写成 §5.3 甲表勘误请求 9 条。

| 编号 | 改在哪 | 怎样改 |
|---|---|---|
| T1 | §1.1、§1.3、§2.1 `consent_scope`、§2.2 `consent`、R9-3.1、R9-3.10、§4.8 全节、§3.1、附录首批条目 | 同意分两类：动作行 `consent` 只声明物理上须对方身体配合的事项，同意段只拦这一类；效果族 `consent`、`authority()`、`canEnter` 一律只进报价与善后事实，不拦；删 R9-3.10 后半句（法律门控写成需求块）与 §5.3 第 9 条；进入只调卷五 `canEnter` 记“无权进入”事实，删 `cscope_entry`；删 `require_extra` 与 E-ACT-AUTHORITY |
| T2 | R9-3.9、§2.1 `holding_kind`、§2.3、§2.5 `rules.control.seatKind`、R9-6.8、附录 | 改名“玩家席位边”，`bodyControl` 假、`intimate` 假、`grants` 空；持有者与标的都是受控实体本身；`controlledByPlayer()` 即卷二十七 R27-1.2 的定义卷 view，回答卷二十七 §8 第 7 条的登记路径一问 |
| T3 | §2.6、R9-4.4、R9-15.3、§2.2 校验、§2.5 `rules.act.craftDegree`、§5.3 勘7 | 删 `process.quality` 与 `rules.cap.improvisedMod`；制作类效果一律调卷三乙 `craftOutcome`，检定在其内做一次，动作行 `check` 为空；无配方即兴请卷三乙在入口内补（勘7） |
| T4 | §2.4、§2.2 `slots`、R9-6.7、§4.19.1 槽位表、§2.1 `intent_slot`、§5.3 勘2 | 分线上与内部两层；候选编号在 `route()` 内按本回合候选表换成 id；列表槽位用 `multi`，时间槽拆成 `whenAnchor`、`whenDay`，只用 `slot_kind` 三值；列表上行请卷二补一句（勘2） |
| T5 | §2.4 `ReplyResult` 字段表、`receipt`、R9-9.1、R9-19.3、§5.3 勘3 | 写出本卷负责的 `receipts`、`alternatives`、`ambiguous`、`missingSlots`、`cards`；回执进 `ReplyResult`；决定卡扩为带槽位的列表，请卷二改（勘3） |
| T6 | §2.1 `ai_use`、R9-14.2、R9-14.5、R9-9.2 | 删 `dialogue` 用途；台词与叙述同一次 `narrate` 请求，超时、预算、退路按 `narrate` |
| T7 | §4.10.2、R9-10.8 | 写出提示五块的组成与次序（静态指令、schema、场景卡、回执与决定卡、玩家原文独立字段）；拼文字在 outputGate `PromptRenderCap` |
| T8 | §4.18.1、§4.18.2、R9-18.3、R9-18.5、§3.1、§3.4、M9-19、§5.3 勘4、勘5 | 按李白 (a)：删 `latencyMs`，不放开计时能力；旁路一律走 `kernel/report.mjs`；M9-19 改为按卷二删 `sideband.mjs`；第一版 §5.3 第 3 条撤回；录制写者定为 `ai-gate/recorder.mjs`（请卷二登记，勘4）；`replaySource` 只在测试与回放装配注入 |
| T9 | §2.5 `rules.i18n.nameCandidateCount`、R9-19.11、§2.1 `card_slot_type`、附录决定卡 json | 补命名候选条数键；六张决定卡各写槽位 |
| T10 | §2.3、§3.3、§3.2 | 六条以实体 id 为路径段的记录登记 `subjectRecords` 与 `rcls_` 条目，去留取 `clear`；提案、留痕改按主体分段；对话登记清理函数整条删除，删“先置 closed” |
| T11 | R9-12.2、R9-12.3、R9-12.4、R9-12.7、§2.5、§4.12.1 | 底线改比 `valence` 档序（`rules.npc.redLineValence`）；积怨改为按 `rules.npc.grievanceVerbs` 过滤已知事件乘 `recall` 求和；立场按 `rules.npc.stanceWeights` 分轴加权；删“代码登记的候选提供者” |
| T12 | §2.2 `skillGain`、R9-2.8、§4.2.1 `learn` 契约、M9-23 | 改为 `{skill, source: ref learn_source}`；`minutes` 取实际工时、`difficulty` 取本次难度，组成卷十四 `session`；第一版 §5.3 第 10 条删除 |
| T13 | R9-3.5、§2.2 `check`、§2.6、§4.7.1 `ability_row`、§2.5 | 加 `ability_row`（与难度行同形，读 `attrMod`、`workInputs`），删 `rules.check.abilityFloor` |
| T14 | §0.3、§7 末段 | 146 改 151，按卷零现文逐小节对照 |
| T15 | §0.2、R9-6.8（`verb_pace_set`）、R9-1.10 与 `freeSlotsOf()`（卷十四 `teacherFreeSlots`）、R9-8.5（`adult` 只经 `intimateEligible`）、R9-5.1（`calendarView`、`calendarMinuteOf`）、§5.3 勘8、勘9 | 逐条回应；引错节号的卷六、卷十八与卷四的引用写成勘误请求 |
| T16 | R9-1.4、§2.7、A9-1.2 | 写明到期前 `workDone` 恒小于 `workTotal`；到期收工不写回、记录删除；断言随之改 |
| T17 | R9-1.4、R9-1.6、R9-1.12、R9-2.3、R9-8.8、R9-12.7、A9-1.2 | 不新增内核机制：执行器在每次事务末步用本批写到的路径集合 W 与每条活动的重查集合 K（`inputsOf` 冻结依赖：修正项来源、`can()` 谓词、`interruptRX`、配合所依同意边）相交，相交者同一事务内结清、重算并做中断检查；时钟键不入 K，随时刻变化的影响只经到期项与越线事件；NPC 需求越线触发同法 |
| T18 | §2.9、R9-3.8、§2.3 `state.lastCommit`、§2.8、§8 第 5 条 | 按 R27-8.9 五成分派生；同刻第二次提交以上一条事件 id 为主体段，善后各事务以登记代号为规则段、以提交事件 id 为主体段；删 E-ACT-DUPLICATE |
| T19 | R9-12.4、R9-12.6、R9-13.4、§4.12.5、§4.13.5 | 预付按 `w.money` 折算；差额写定进 `cost.money`；两个例子按同一张规则表重算 |
| T20 | §3.2、§4.15.2、§4.2.1 `create` 行、A9-15.2 | 留痕改用 `create` 原语（契约已有留痕种类，不需 `template`） |
| T21 | §4.7.1、R9-7.3、R9-7.5、R9-7.6、§4.7.5、A9-7.2 | 豁免另立 `cap_exempt_row`；反噬取各参数约束行曲线值的最大者、只执行一次；没有受约束参数时按动作行原样执行 |
| T22 | §2.2 `effects` | 删 `inherit` 写法：必含 `success`，检定时另必含 `failure`、`partial`；只许缺两头，缺即取相邻一档 |
| T23 | §4.19.1、§5.3 勘6 | 写明 schema 的 `slots` 键取“通用槽位 ∪ 动作行 `slots` 的键”、取值域从动作行读；四个制作槽位由制作动作行声明（`times` 更正第一版的 `batch`） |
| T24 | §6、§4.2.1、§0.3、§7、待补清单第 1–4 条 | 读 AI-00、AI-05、`primitive-schema.mjs`、卷零 §3.5 补上 |

小项：1 卷首改为引卷一 §0.4，不重抄；2 §0.3 写明“A 表的 18.1（主观视图）”；3 §4.17 标题改为“选择式判断层”；4 §8 第 4 条按台账 S-07 关闭；5 §8 第 3 条按卷二 `power→power_` 关闭；6 S9-7 注明单位换算常数除外；7 `rules.act.paceScale` 写明为何放规则表；8 `action-consent.mjs:10`、`ai-profile.mjs:4` 的行号出处只在素材包文件级记录，未改动，待卷十一出卡时复核；9 R9-13.4 平局改为与 R9-12.7 同取码序最小，删 `stream.dialogue` 抽取点；10 自检输出按本版重跑。

二审余项（`审查/卷九-二审.md`，第二版收尾，不升版本号；改前快照 `版本快照/卷九-v2a.md`）：

| 编号 | 改在哪 | 怎样改 |
|---|---|---|
| 二审 N1 | §2.1 `interrupt_cause`；§2.3 `endCause`；§2.5 `rules.act.advanceMaxMinutes`、`rules.npc.idleAdvanceMinutes`；§2.9 事件 id 表 `due.activity` 行；R9-1.4、R9-1.6、R9-1.12、R9-2.3、R9-2.6、R9-8.8、R9-12.7、R9-12.11、A9-1.2；§5.3 勘10 与表后段；术语表；待补第 7 条 | 按李白 11-13 裁定（选甲，不动卷二；改前快照 `版本快照/卷九-v2b.md`）：一切持续活动每次推进第一步重查全部前提（含同意边），不过即中断并写 `interrupt_cause`；推进点按各类 `advanceMaxMinutes`（未核）登记，推进钩子直写与终止协议的延迟上界为一个推进间隔，已发生效果按现结算规则、不回滚不补偿；执行器末步求交保留为第四种推进时刻（经执行器的写入当次生效），K 的 `can()` 成分改为 `view:bodyView`、`view:statusView`，末步单遍、id 升序、自身写入不并入 W；删“一切写入都经执行器”的前提；空闲 NPC 决策同法加空闲推进点；重查成本交卷二十七（勘10） |
| 二审 N2 | §5.3 勘1 | 读者补卷一:619、:872、:946 与卷二:935、:939、:2541，改法写明同步删去 `records.*.text` |
| 二审 N3 | §2.9 事件 id 表善后行 | 位次恒为 `pos.only`；同类多条按所涉实体 id 升序成链，主体 id 取前一条事件 id，删 `pos.party.<槽位代号>` |
| 二审小项 | R9-3.9；§5.3 勘2、勘6、勘9 | 席位边种类行写全卷十八主列（传导系数 0、`functional` 假、`holderEnd` 三格关闭等）；勘2 补句覆盖通用槽位；勘6 加卷三乙:1211；勘9 卷十八行号改 :286 |
| 二审后核 N1-a 与小项 1–4（`审查/卷九-二审后核.md`；版本号不变，改前快照 `版本快照/卷九-v2c.md`） | §2.1 `premise_break`；§2.9 事件 id 表 `ntf.activity` 行；§3.2 唯一写者表；§4.1.2 写者句；R9-1.12（推进时刻五种、“抽查口径”“旁路直写”“前提失效通知”及其表、“连续变化的前提”、末步与确定性两句）；A9-1.1、A9-1.2；§4.8 同意边种类行；§5.2 卷二、卷十八、卷二十一行；§5.3 勘1、勘2、勘8、勘9、勘10、新增勘11 与表后段；术语表；待补第 7 条 | 按李白 11-13 对 N1-a 的裁定：① 写明前提只在推进时刻查及四路口径，只有无事件又算不出越界时刻的一路会漏查；② 新增第五种推进时刻“前提失效通知”，按 `premise_break` 整类登记（状态实例出现/换档/移除、实体终止、常住变化），订阅所属卷现成事件（卷二:431 事件通道、卷二:444、卷十八:444、卷二十一:430），当刻只对此人当前活动做一次推进，失效即中断、工照算；卷二十一三个动词缺代号，写成勘11；③ 推进间隔上限约束只用于无事件的连续变化，能算出越界时刻的（同意边截止、单调锚点量的单个比较）在该时刻插推进点，不设“曾失效”标记、不统一缩短间隔；小项 1 A9-1.2 末步一句改为“本批原语（W）”并注明末步自身写入不计入；小项 2 勘1 附录 F 行改 :2599（二审后核所写 :2546 之后卷二又有漂移，按现文取）、勘2 :835、勘8 :975、:991、勘9 :551；小项 3 二审 N1 行补列 §2.9 `due.activity` 行；小项 4 同意边种类行写全卷十八主列 |
| N1-b 与 N1-a 核余项（`审查/卷九-N1a-核.md`；版本号不变，改前快照 `版本快照/卷九-v2d.md`） | §2.1 `interrupt_cause`、`premise_break`；R9-1.6；R9-1.12 ①、`premise_break` 表（加“写入口登记名”栏、`custody`、`possession` 两行与表后段）、“连续变化的前提”单调判据、末步括注与 K；R9-3.1 `capacity` 段；A9-1.1、A9-1.2；§5.2 卷八b、卷十八行；§5.3 勘1 行号、勘11、新增勘12 与表后段；§8 第 12 条；术语表 | 按李白 11-13 对 N1-b 的裁定（核查员最小改法）：① 加（a）需求块非消耗项与必填实体槽位、（b）羁押受制两项，中断原因补 `requirement`、`custody`，`capacity` 段同查（b）；订阅卷十八第八版通用持有变化事件 `verb_holding_changed`（卷八b 羁押边同用），覆盖被捕与经持有边失去工具、场所，不退回推进点抽查；各 `premise_break` 行带写入口登记名，A9-1.1 扫描范围补齐卷二三条写路、按登记名对应；措辞小项：单调判据、末步括注改为与其余三路并列、勘11 与卷二十一 :1185 动词名对齐；勘1 卷二附录 F 行改 :2601；经账本离手的工具无事件，记 §8 第 12 条待李白定 |
| 持有变化事件核 H1、H2（`审查/持有变化事件-卷九N1b-卷六-核.md`；版本号不变，改前快照 `版本快照/卷九-v2e.md`） | R9-1.12“抽查口径”（丁）路、`possession` 行、新增“经账本离手”段；A9-1.1、A9-1.2；§5.2 卷三乙、卷六行；§5.3 勘10、勘11、勘12 与表后段；§8 第 12 条与新增公开缺口表 G1；术语表 | 按李白 11-13 对 H1 的裁定（取乙，不动卷六账本核心）：执行器外经账本离手的工具、建筑类场所退回推进点抽查，抽查即（a）整组重求值，`ctx.sources` 按此刻 `accountsOf(行动者 id, …)` 重取（卷三乙:1082、卷六:241、:368），整类求值、只扫有活动挂着的账户、只比对持有者 id；延迟不超过一个推进间隔，列公开缺口 G1，卷六收卷时再评是否改为账本发事件；A9-1.1 账本写者对应到此路并加两条扫描，A9-1.2 加延迟上界不变量；成本式（活跃需求块数 × 引用账户数）并入勘10，实测待解冻后腾讯云；`possession` 行改为只称覆盖持有边转移；H2 把错位的“必要理由”一格移回勘11 行末 |
| H1 只核 Q1–Q3（`审查/卷九-H1-核.md`；版本号不变，改前快照 `版本快照/卷九-v2f.md`） | R9-1.12 `possession` 行、“经账本离手”段（场所类前提、延迟上界）；A9-1.1、A9-1.2；§5.3 勘10、勘12 与表后段；§8 第 12 条、G1；术语表 | 按李白 11-13 裁定：Q1 `possession` 行改为持有边转移由事件覆盖（（a）能力组按卷三乙 :1031 A-1 读持有种类）、账本离手由抽查覆盖，两路并存，A9-1.2 照 v2e 补回同刻结束一句并限于能力组；Q2 场所类前提在同一次 ① 经卷六 `accountsOf(行动者 id, {family: resfam_asset})`（卷六:241，份额分录 :1054）重取建筑份额，仍整类求值、只查有活跃需求块的对象，成本式在勘10 补建筑份额一项，实测仍待实测；Q3 延迟上界补“下一推进点仍不过” |
| Q1Q3 核 Q2（`审查/卷九-Q1Q3-核.md`；版本号不变，改前快照 `版本快照/卷九-v2g.md`） | R9-1.12“抽查口径”（丁）路、`possession` 行、“经账本离手”段（场所类前提）；A9-1.1、A9-1.2；§5.3 勘10、勘12 与表后段；§8 第 12 条、G1；术语表 | 按李白 11-13 裁定：删去上一版自加的“须占有工位”前提与租用放行条件；场所类前提只重查需求块原有三项（设施行未终止，卷十九:498、:984；固定装置能力，卷三乙:1031 A-1、卷十九:456；配方设施条件，卷十九:457、:415），不新增占有条件；建筑份额只用来判断场所是否已拆除或转为不可用（卷六:1054、:354），不读行动者名下份额；勘10 建筑份额一项改为每个带工位的需求块重求一次场所前提。补注（`审查/卷九-Q2-核.md` L1、L2；改前快照 `版本快照/卷九-v2h.md`）：L1 R9-1.12 ①（a）补“动作行带工位的含场所类前提三项”，与“经账本离手”段“开工时本来就求”一致；L2“经账本离手”段“占有”改为“持有……所有权份额、持有边”，免与卷十九:456 占用边混读 |
| 封卷前收尾（不升版本号；改前快照 `版本快照/卷九-v2i.md`） | §2.4 `cards` 表后句；R9-4.4；R9-1.12 `premise_break` 表 `status` 行；R9-15.3；R9-6.7、R9-9.9、§4.18.2 末括注；§4.19.1 动作专有槽位段；§5.3 甲表说明、新增“落地”列、勘3 行号、表后段、新增“勘10 附” | 跟卷三乙勘7 新增的意图字段 `improviseClass`（R9-4.4 `ctx`、§4.19.1 列表、R9-15.3，照卷三乙 R-13 原文）；§2.4 过时句照卷二 :746 新口径改（`审查/卷九勘误-勘3-核.md` 记账），同类过时的“勘误请求”括注 R9-6.7、R9-9.9、§4.18.2 三处同批改为已落地（勘2、勘1、勘4）；`premise_break` 表 `status` 行改为引用卷二十一登记的 `verb_status_onset`、`verb_status_stage`、`verb_status_removed`；勘10 记账写成数据登记（`cadenceRuleKeys` 间隔键作数据行，代码不按系统键特判；载体待卷二十七）；甲表勘1–勘12 各条标已落地（提交号与改前快照）；同批卷二十七 M27-12 处置栏勘5 同类遗漏补改 |
| 卷二十七勘10 附落地（李白 11-13 批；不升版本号，改前快照 `版本快照/卷九-v2j.md`） | §5.3“勘10 附”状态一行 | 卷二十七已加通用字段 `cadenceRuleKeys` 并登记首条数据行 `activityRecheck`，状态改为“已落地（卷二十七 cadenceRuleKeys）”；其余未动 |
| 封卷后勘误（李白 11-14 卷二十四二审 N1 裁定；不升版本号，改前快照 `版本快照/卷九-v2-勘误前-1114e.md`，改后覆盖 `版本快照/卷九-v2.md`） | R9-2.3 末句 | “成功后恰好产出一条事件”改为“恰产出一条以本事务原语为 `primitives` 的事件……内核协议（卷二 §2.6 终止、复生）在事务内另发的内核事件（`primitives` 为空）另计”。必要理由：带 `destroy` 等触发终止协议的事务另有一条内核事件（卷二 §2.6 第 5 步），原措辞与卷二自相矛盾。读者清单（Grep `R9-2.3`、“恰好产出一条事件”）：卷二十四 §0.2、§1.3 第 1 条、表 A `primitives`、R24-1.1、A24-1.2（同批已改）；卷一 L-2（未提条数，不改）。内核事件 id 的取法由卷二十四 R24-1.1 按本卷 §2.9 善后行的链式写法写明，本卷 §2.9 表未加行。其余未动 |
| 封卷后勘误（李白 11-14；不升版本号，改前快照 `版本快照/卷九-v2-勘误前-1114h.md`，改后覆盖 `版本快照/卷九-v2.md`） | §2.9 事件 id 表 | 末尾补一行“内核协议在事务内另发的内核事件”：规则或指令代号取所在事务事件的 `cause`（无事务事件时取推进钩子登记代号），主体 id 按善后行的链式写法（链首取所在事务事件 id，无事务事件时取推进钩子行的主体 id），位次代号用专用的 `pos.kernel`，不照抄卷二十四原借用的 `pos.only`（与善后链下一条撞号，`审查/卷二十四裁定与卷二十三-只核.md` 真问题 1），卷二十四 R24-1.1 同批改为引 `pos.kernel`。上一行“本卷 §2.9 表未加行”自此失效。读者：卷二十四 R24-1.1、A24-1.2，卷二十七 R27-8.9。必要理由：内核事件 id 的位次代号与链式写法原只在卷二十四借用善后行写法，事件 id 的派生表本应在本卷 §2.9 一处写全 |
| 封卷后勘误（李白 11-14 对 `审查/卷二十四裁定与卷二十三-只核.md` 真问题 2 的裁定 ②；不升版本号，改前快照 `版本快照/卷九-v2-勘误前-1114j.md`，改后覆盖 `版本快照/卷九-v2.md`） | R9-2.3 末句；§2.9 事件 id 表末行 | 前两行（1114e、1114h）的“内核协议在事务内另发的内核事件”扩为整类“写者协议在事务内另发的事件”：凡定义卷的写入规则规定随某类写入在同一事务内一并发出的事件（卷二终止、复生；卷十八持有变化、常住变化；今后同一写法登记的亦然）按同一条整类规则处理——`primitives` 为空、另计、id 按 §2.9 该行取、位次 `pos.kernel`；链序的“所涉实体”按事件种类写明（持有变化取 `edge`、常住变化取 `person`），同一实体多条按发出先后。不逐个列特例，不改各事件的机制与发出点。读者：卷二十四 §1.3 第 1 条、表 A `primitives`、R24-1.1、A24-1.2（同批已改）；卷十八 R18-1.10、R18-1.11（原文只定发出者与载荷，未定 `primitives` 与 id，无冲突，未改）；卷二十七 R27-8.9。必要理由：卷十八持有变化、常住变化同样由写者在事务内另发（卷二十四免职例即一笔事务两条事件），原措辞只覆盖终止、复生，这两类事件的 `primitives`（表 A onUnknown 为 error）、id 与是否计入“恰一条”都无着落 |
| 封卷后勘误（李白 11-14 03:31；不升版本号，改前快照 `版本快照/卷九-v2-勘误前-1114o.md`，改后覆盖 `版本快照/卷九-v2.md`） | §4.1.3 R9-1.9 前提失效通知表 `domicile` 行 | 所属卷与写入口列删去“改挂带走住户的调用卷”，改为持有写者（含改挂带走住户一路，调 `relocate` 后由持有写者在同一事务内发）；写入口登记名列删去 `kernel/relocate.mjs#relocate` 的调用卷；代号登记行号 :1412 改为 :1414（引错行）。必要理由：一个动词一个发出系统（卷二十四 R24-2.1、E-EVT-EMITTER），卷十八 R18-1.10 同批改为常住变化事件只由持有写者发（`审查/kind-only与②④-只核.md` 真问题 1）。读者：卷十八 R18-1.10（同批改） |
| 封卷后勘误（李白 11-14 跨卷配合项落地，卷二十九 C29-4；不升版本号，改前快照 `版本快照/卷九-v2-勘误前-1114ai.md`，改后覆盖 `版本快照/卷九-v2.md`；本批七行同一快照） | R9-9.2 末句 | 叙述记录旁存写入时的显示语言代号（本回合 `locale`），与 `displayNames.lang` 同口径：不进存档摘要、规则层不读，只供显示语言标记。读者：卷二十九 R29-2.14、R29-6.1、R29-6.6、C29-2；卷二 §2.9 第 3 条（哈希排除表加此一项归卷二，本卷未改）。理由：换界面语言后要给旧叙述加语言标记；不写明不进摘要，显示层输入会经它进世界摘要，违单向 |
| 封卷后勘误（李白 11-14 跨卷配合项落地，卷二十九 C29-5，部分） | §2.4 `ReplyResult` 表前句；R9-10.8 ① | ① 写明与卷二十九 §2.7 合并定稿，本卷负责五字段、其余见该节；② 静态指令块与输出 schema 取自卷二十九 `prompt` 类模板（R29-2.13）。“随决定卡给出模板对白读数（性格档、心情档、关系代号、场合代号）”一项未做：这些读数全书无定义处（Grep 0），属新增读数与来源的机制项，待李白定。读者：卷二十九 R29-2.8、R29-2.13、§2.7；本卷 §5.3 P3。理由：卷九 P3 已预留这次合并 |
| 封卷后勘误（李白 11-14 跨卷配合项落地，卷二十二 C22-15） | §4.1.4 交互末段；R9-13.3；R9-13.3 与 §4.13.4 的卷二十二 §4.7 标题；待补清单第 10 条 | 目录收卷二十二阅读、谋划、情报收集、研究四类持续活动行，节奏读数按 §2.6 以修正项挂 `process.workPace`；答话去保密事实时读 `guard`（卷十八 R18-5.5）；卷二十二 §4.7 标题由“秘密”对齐为“秘密、钩子、阴谋”；待补第 10 条中卷二十二 §4.1、§4.7 销账（请求原文写“§8 第 10 条”，本卷 §8 第 10 条是“声明”同词，所指实为待补清单第 10 条）。输入边只产出检索键，本卷 R9-10.7、§4.19.1 `mentions`、`dims` 已有，未改。读者：卷二十二 R22-2.4、R22-6、R22-7.5、R22-8、R22-9.2、C22-15。理由：四类持续活动挂在卷九活动上，目录与节奏来源须写明 |
| 封卷后勘误（李白 11-14 跨卷配合项落地，卷二十四 C24-4） | §4.1.4 交互末段 | 目录收五条通用动作行：发布委托、承接委托、交差、撤回委托（经 `commissionStep`），举办活动（向 `instanceStep` 提起始请求）；只带代号、id 与数值参数，发布可带显式数额。读者：卷二十四 R24-3.1、R24-5.2、R24-5.7、R24-6.2。理由：委托与活动的发起都写成“卷九动作目录的一条通用动作”，目录侧须有落点 |
| 封卷后勘误（李白 11-14 跨卷配合项落地，卷十二 C12-10） | R9-18.3；R9-18.7 | 回放装配放在 `tests/` 下、不在 `server-plugin/` 内；封闭清单为正式 `assembly.calls` 十一个函数照原样加 `replaySource` 交 `mountAi` 一项；真实模型试玩条目执行时，费用账各用途 token 累计作该条目读数并进卷十二 §4.10 的报告，折钱照 R9-18.4。读者：卷十二 R12-6.11、§4.10.4、C12-10；卷二 §2.9 第 0 条“装配文件”。理由：卷十二要求回放装配的位置、清单与费用读数的去向 |
| 封卷后勘误（李白 11-14 跨卷配合项落地，卷十七 C17-1；李白已批，卷十七一审裁定①） | §2.1 `premise_break`；§2.2 新字段 `workFromEdge` 与校验、`baseMinutes` 含义；§2.5 `rules.act.paceFloor`；§2.6 `process.workPace` 取值域；R9-1.3；R9-1.4；R9-1.12 前提失效通知表新增 `trip_pace` 行；§5.2 卷十七行 | 三点放宽：（1）动作行可声明 `workFromEdge`，工量 `ceil(distanceM ÷ refSpeed)`（除数下限 1），不受 `maxBaseMinutes` 截断，为空照旧取 `baseMinutes`；（2）`paceFloor` 改为按动作类取值的 map，下限为 0 的类节奏可为 0，停滞不结束、推进点照登记；（3）`premise_break` 加 `trip_pace` 一值、表中加一行，订阅 `verb_trip_pace`，“此人”取 `leader`，规则代码不改。读者：卷十七 R17-1.5、R17-1.6、R17-8.4；卷二十七 R27-1.7、卷二十 §4.1（未改）。理由：路段长短悬殊，工量不能是动作行常数；行进窗外与无风时速度确为 0；行进窗开闭与环境越线不是前提越界，不发通知则全队节奏要等推进点才变 |
| 封卷后勘误（李白 11-14 跨卷配合项落地，卷十七 C17-11） | §4.2.1 原语表 `move` 行；§5.2 卷十七行 | `move` 的写者由“位置写者”改为卷十七 `placeSubject`（`position.mjs`）。读者：卷十七 §3、R17-1.9、Q17-7；卷四 Q-16、卷十九 Q24、Q25（未改）。理由：位置写入口不填，写入有多条路，卷十七 S17-4 扫描无法成立 |
| 封卷后勘误（李白 11-14 975aa068 跨卷机制项裁定；不升版本号，改前快照 `版本快照/卷九-v2-勘误前-1114a.md`，改后覆盖 `版本快照/卷九-v2.md`；本批五条同一快照） | §2.1 新族 `occasion`、`claim_kind.predicates`、封闭枚举 `slot_sourced`、`cap_term_ctx`；§2.2 `requirement`、`baseMinutes`、`check`（`opponentRows`）、`effects`、`backlash`、`skillGain`（`skillFrom`）、新字段 `shapeFrom` 与校验；§2.4 `claims.predicate`、`cards.reading`、`CardReading`；§2.5 `rules.card.persCuts`、`gaugeCuts`；§4.7 `cost_row.resource`、`cap_row.terms.dim`；R9-1.13、R9-1.14（新）；§4.1.4 卷十五六行；§4.2.1 `transition` 行；R9-2.8 末句、R9-2.9（新）；R9-3.6 末句；R9-7.3 末句；§4.11.1 `evidence_row.from`、§4.11.2 签名、R9-11.2、R9-11.3 末段；R9-12.5 末段、R9-12.13（新）；§5.3 乙表 P4–P10；术语表三行 | C29-5（决定卡读数：性格档、心情档由人格轴与心理量视图输出按切点派生为档序，关系代号读 `related`，场合代号用开放族 `occasion` 与固定空码 `occ_nil`）；C28-11（R9-11.3 增离线以声明加行数据调用，`evidence_row.from` 增 `row`）；C10-20（`predicates` 放宽到维度代号或读入口字段代号，加载核对字段在证据行读入口的返回形状里，不读文字）；C13-7（`check.opponentRows`、R9-3.6；成长技能可取自读入口字段 `skillGain.skillFrom`）；C15-1 ①–⑥（先 ① 后 ④：`from_slot` 与 `shapeFrom`、`cap_row` 的 `ctx_skill`、`transition` 两个状态机与产物引用、目录登记卷十五六行、活动结束事件 `verb_activity_ended`、配合类候选减 `process.consentBar`）。读者：卷二 §2.9 第 0 条（P4）；卷二十六 §3.1（读入口）（P5）；卷二十九 R29-2.8（P6）；卷十五 R15-1.2、R15-1.5、R15-1.8、R15-1.10、§3.2、R15-4.4、R15-7.2 至 R15-7.4、R15-7.11（P7）；卷十三 R13-1.2（P8）；卷十 §4.4.1（P9）；卷二十八 R28-5.4、R28-5.5（P10）。别卷未改。理由：李白 11-14 975aa068 裁定五条均批，各发出卷记“卷九答复前不加载”或“对方照此提供” |
| 封卷后勘误（李白 11-14 bc698ed3 裁定；依 审查/机制项-卷九-只核.md 真问题 1 与第六节；不升版本号，改前快照 `版本快照/卷九-v2-勘误前-1114b.md`，改后覆盖 `版本快照/卷九-v2.md`） | §2.1 `occasion` 行 `whenRX` 括注；§2.1 `claim_kind.predicates` 括注；§2.2 `skillGain`、`shapeFrom` 两行与表后"校验"末句 | ① `occasion.whenRX` 删去读本回合 `turn`，改读已核定的回执与说话人所在地点视图，`dialogueView()` 的会话 id 取该决定所答意图所在的对话会话；② `shapeFrom`、`skillFrom`、`predicates` 三处"登记返回形状"核对改指卷二 §2.7（系统声明表 `state-owners.json`）"读入口返回形状登记"（`readShapes`）。读者：实现者、卷二十九（决定卡读数）、卷十五、卷十三、卷十（三处核对的入口所属卷，各按卷二 §2.7（系统声明表 `state-owners.json`）填自己入口的行）。理由：`turn` 是待核对的模型声明，组卡时尚未交回，读它等于让未核对输出决定卡读数（R9-9.3、R9-9.4）；三处核对原无机器可读的登记对象 |
| 封卷后勘误（李白 11-14 745706f9 裁定 ①；依据 `审查/EventId-全书用处.md` 第二节第 3 条；不升版本号，改前快照 `版本快照/卷九-v2-勘误前-1114k.md`，改后覆盖 `版本快照/卷九-v2.md`） | §2.3 `state.lastCommit` 行 | 值的 `eventId` 字段写明类型 `EventId`，语义不变。读者：实现者、卷二十七（R27-4.12 按 pathTypes 认 `EventId` 路径）。理由：卷二 §1.5 已登记 `EventId`，字段未写类型则 pathTypes 认不到 |
| 封卷后勘误（李白 11-14 17:04 卷十三停报③拒绝决斗裁定；依据 `收尾待办.md` 该节、`审查/卷十三-封前停报项.md` 第 8 节；不升版本号，改前快照 `版本快照/卷九-v2-勘误前-1114ad.md`，改后覆盖 `版本快照/卷九-v2.md`） | R9-12.14（新）；§2.9 事件 id 表“写者协议在事务内另发的事件”行所涉实体括注；附 术语与代号表新增“拒绝应答事件”行；§2.3 `state.dialogues` 行加 `awaitedEvent`；§3.2 唯一写者表 `state.dialogues` 行；术语表“对话会话”行 | 整类登记拒绝应答事件 `verb_invite_refused`：凡须对方应答的邀约（征求同意、对话请求出价还价，别卷决斗、交易、结盟、婚约等邀约类动作行经此两路），NPC 应答结论为 `refuse` 或席位应答者一步把会话转到 `refused` 时，在该裁决事务内发；载荷只带邀约事件引用 `invite`、应答者 `actor`、发起者 `targets`，不加别的栏；属写者协议另发事件类，位次 `pos.kernel`；表 B 各栏照卷二十四表 B 与卷十八 §2.3 写法填值。读者：卷十三 §2.8“拒绝决斗”来源行、R13-17.2；卷十八来源表事件行；卷二十二已知事件。理由（必要）：应答结论 `refuse` 与会话状态 `refused` 原先都不发事件，卷十三“拒绝决斗”来源行无事件可订，只能以此刻关系推当时应答而误判（未答、已答且同意边已结束、玩家晚答三种）；主会话裁定③（载荷每栏须有可读来源）：会话记录补 `awaitedEvent: EventId`（可空），由把会话转入等待应答的那笔事务写入、离开等待态时清空，席位路 `invite` 读它，NPC 路照旧取所裁邀约事件 id，否则席位拒绝的 `invite` 无值可取；同意族有“答应”（开立同意边，持有变化事件）而无“拒绝”的世界记录，不完整 |
| 封卷后勘误（李白 11-14 17:30 卷九/卷十三邀约应答停报 acfddc94 裁定；依据 `收尾待办.md` 该节、`审查/卷九-拒绝应答-只核.md`；不升版本号，改前快照 `版本快照/卷九-v2-勘误前-1114ae.md`，改后覆盖 `版本快照/卷九-v2.md`） | R9-12.15（新）；R9-12.14；R9-8.3；R9-13.1；R9-13.4 末段；§2.1 `intent_slot` 加 `invite`；§2.2 新字段 `answer`；§2.3 撤 `state.dialogues` 的 `awaitedEvent`、新增 `state.pendingInvites` 行；§2.5 `rules.dialogue.idleMinutes` 用在栏、新增 `roles.senses.sight`、`roles.senses.hearing` 句柄行；§2.7 末行；§2.9 事件 id 表“写者协议在事务内另发的事件”行所涉实体括注加活动结束；§3.2 `state.dialogues` 行、新增 `state.pendingInvites` 行；§3.3 末段清理函数；§4.19.1 通用槽位表加 `invite`；术语表“对话会话”“拒绝应答事件”两行、新增“待应答记录”行 | 整类开待应答记录：凡提给有席位者的邀约（全部同意族，含对话请求、出价、还价，别卷决斗、交易、结盟、婚约等）在邀约事务开记录（键邀约 EventId，存发起者、应答者、邀约动作代号，写者唯一 `invites.mjs`），只以一步作答（接受或还价）、一步拒绝、失效（超时、轮数耗尽）三种结束，失效不发事件；`dialogues.awaitedEvent` 撤去，席位路改读记录；§4.8 补拒绝给予同意一步；拒绝应答事件载荷加 `inviteAction`，NPC 路由裁决事务直写、席位路由记录直写（`invite` 取记录键、`targets` 取记录发起者、`actor` 取应答者）；登记两个感官句柄；`verb_activity_ended` 补所涉实体（取活动主体）。读者：卷十三 R13-17.2 与 §2.8“拒绝决斗”来源行（`payloadIf` 读 `inviteAction`）；卷六 §4.16.3 第 2 条；卷二十四 R24-1.1（所涉实体清单两项：拒绝应答取 `actor`、活动结束取活动主体）；卷十八来源表事件行；卷二十二已知事件。理由（必要）：缺待应答记录，玩家拒绝任何邀约（决斗、给予同意、合同要约等对话会话之外的邀约）都发不出拒绝应答事件，席位路 `targets` 亦无可读来源，轮数耗尽时 `actor` 会误记为还价者；别卷认出邀约种类须读本事件自身载荷（卷十八 `payloadIf` 只读本事件载荷），故加 `inviteAction`。按 `审查/卷九-待应答记录-只核.md` 改两条真问题与两处措辞（同一快照）：`answer` 只在意图带 `invite` 时生效，不带即普通一步（给予同意等行可主动做）；失效时长另立 `rules.invite.expireMinutes`（§2.5），不再借 `rules.dialogue.idleMinutes`；R9-12.15 ① 改称“一步作答”；§3.2 补轮数耗尽的删除时机；R9-13.1 末句同口径。理由：原写法使未被征求时无法给出同意，且对话冷场时长与一切邀约的应答期限被一个键绑死 |
| 封卷后勘误（李白 11-14 19:55 总审裁定 根因D；不升版本号，改前快照 `版本快照/卷九-v2-勘误前-1114zs1.md`，改后覆盖 `版本快照/卷九-v2.md`） | R9-19.12；A9-19.2；I9-1 | "拔掉输入边后全部动作可经菜单到达"改为"凡必填槽位都有非 text 填法的动作可经菜单到达"，引卷二 §2.9 第 3 条"玩家起名路径"项；R9-19.12 补一句只有 text 填法的动作（现仅手记）没有输入边时不进菜单投影。读者：卷十二 A9-19.2 登记者、卷零 S2b。理由（必要）：卷二已定手记在无输入边时整个不进菜单，原写法与之矛盾；I9-1 是 R9-19.12 所引的同句，同批改。:198 menu 字段说明同改（只核残留；改前快照 `版本快照/卷九-v2-勘误前-1114zs1b.md`） |
| 封卷后勘误（李白 11-14 20:13 裁定 ②；不升版本号，改前快照 `版本快照/卷九-v2-勘误前-1114zs5.md`，改后覆盖 `版本快照/卷九-v2.md`） | R9-1.13 末 | 补半句：结构化列按卷二 §2.7（系统声明表 `state-owners.json`）的 `shape` 行核对（`requirement` 列要求 `shape`/`requirement_block`，`effects` 列要求 `shape`/`effect_call_list`）；:199 `shapeFrom` 原句不改；裁定 ① 卷九不改。读者：卷二、卷十五 `castShape`。理由（必要）：卷二 `rx_type` 四值装不下需求块与效果调用列表，两列此前无可核的登记类型，卷二同批加 `shape` 值 |
| 封卷后勘误（上一行复核余项；依据 `审查/总审勘误-编辑三-复核.md` 与李白 11-14 20:13 裁定 ①；不升版本号，改前快照 `版本快照/卷九-v2-勘误前-1114zs5b.md`，改后覆盖 `版本快照/卷九-v2.md`） | §5.3 P7；R9-1.13 末 | P7 ① 删去要卷十五补 `backlash` 键一项（只留 `degreeBps`）；R9-1.13 末半句结构名随卷二改为 §1.5 命名 struct `struct:requirementBlock`、`struct:effectCallList`。读者：卷十五。理由（必要）：反噬不取自槽位（20:13 ①），P7 原句与之相抵；卷二把结构名单点定义移到 §1.5，原名已撤 |
| 封卷后勘误（李白 11-14 20:22 裁定 根因 G 总规矩、P-1、P-2、P-8；李白 11-14 20:59 裁定 ②5 与通则 1、2；不升版本号，改前快照 `版本快照/卷九-v2-勘误前-1114w2a.md`，改后覆盖 `版本快照/卷九-v2.md`） | §0.2 卷五行、加卷十六行与卷二十四行；§2.2 动作行表加 `sourceStrength` 列；§4.2.1 目录说明、加 `transform` 行、`emit` 行；新增 R9-2.10；§4.2.4 交互；附 术语与代号表"原语"行 | ① `emit` 在事务内调一次卷五 `perceiveEvent`（签名照卷五 §3.2），结果写进事件 `witnesses`，别处不另求；`visibility` 改引卷二十四表 A。② 动作行登记 `sourceStrength: map<ref vocab sense, number>`，作加性修正项叠加到卷五 `sense.sourceStrength[s]`，行上必写、没有写 `{}` 并写明含义（卷二 §1.6 无常量缺省）。③ 原语目录登记 `transform` 一行（族、原语、契约字段、通道、写者），求值入口仍是卷十六 `proposeTransform`（卷十六不改）；目录计数改为设计 20 个、15 族。读者：卷五、卷十六、卷二十四、卷二十二、卷十二（原语目录扫描）。理由（必要）：目击名单原无唯一求值处；卷五规则 7 已要求动作行此列而本卷无；卷十六 `roles.prims.transform` 指向本卷目录里不存在的原语。待别卷：`direction` 两值代号 `apply`、`revert` 由本卷给出，卷十六 R16-12.3 所称"转去／复原"对应之；卷一 §3A.9 只写"原语 op 封闭"，不需改 |
| 封卷后勘误（同轮补项；不升版本号，改前快照 `版本快照/卷九-v2-勘误前-1114w2a2.md`，改后覆盖 `版本快照/卷九-v2.md`） | §5 内三处"卷二 §2.9"引用（原 :1318、:1334、:1460） | 补标题"（外部边界与 Text 模型）"。理由（必要）：自检第 8 项跨卷引用须带标题，同类收卷前清 |
| 封卷后勘误（只核余项；依据 `审查/总审勘误-二波甲-只核.md` 问题 C；不升版本号，改前快照 `版本快照/卷九-v2-勘误前-1114w2a3.md`，改后覆盖 `版本快照/卷九-v2.md`） | R9-12.14 动词行（原 :1038） | `visibilityAllowed` 由"取 `emit` 的 `visibility` 全集"改为"取卷二十四 §2.2（维度）表 A `visibility` 的全集"；值集不变。理由（必要）：`visibility` 定义处已移到卷二十四表 A |
| 封卷后勘误（李白 11-14 21:50 裁定 ③、21:57 定载体；不升版本号，改前快照 `版本快照/卷九-v2-勘误前-1114w2e.md`，改后覆盖 `版本快照/卷九-v2.md`） | §2.2 `slots` 行；§2.1 族表加 `record_kind` 行 | 动作槽位加通用的“指向已登记记录”写法：`code` 槽位沿用 `entityKind`/`vocab` 写法加 `recordKind`（三者恰填一个，`recordKind` 非空时 `filter` 必填），候选为该种记录中经筛选、行动者可知者，线上只传候选编号，先例为通用槽位 `invite`；`record_kind` 族条目字段只有 `stateKey`（引用已登记的 `stateKeys` 键），族名与前缀登记在卷二 §1.9，条目只收各卷已定义的记录。整类规则，不为谋划开特例。必要理由：不加则卷二十二 `act_plot_invite` 指不到谋划记录，NPC 永远不会邀人，R22-7.5 入伙等于空文 |
| 封卷后勘误（依据 `审查/总审勘误-recordKind-只核.md` 真问题 2；不升版本号，改前快照 `版本快照/卷九-v2-勘误前-1114w2e2.md`，改后覆盖 `版本快照/卷九-v2.md`） | §2.2 `slots` 行 | 删上一行写入的“`recordKind` 非空时 `filter` 必填且非空”，`filter` 与 `entityKind`、`vocab` 槽同样选填。必要理由：裁定只要求沿用 code 槽先例写法，先例里 `filter` 选填，必填是超出裁定的新规则 |
| 封卷后勘误 1114w3f（依据：李白 11-14 22:49 第一条②，清单 `审查/总审-稀疏映射扫描.md`；版本号不升，不改卷首；改前快照 `版本快照/卷九-v2-勘误前-1114w3f.md`，改后覆盖 `版本快照/卷九-v2.md`） | §2.2 `effects`、`sourceStrength` 两行；§2.5 `rules.review.tolerance`、`rules.npc.stanceWeights`、`rules.gate.categoryMap` 三行；R9-1.13；R9-11.4；R9-12.3；§4.19.1 复述一句 | ① `sourceStrength`、`stanceWeights` 标 `combine=sum`（卷二 §1.6（缺失处置）第 5 项），R9-12.3 读处写“缺键按不加项处理”。② `effects`：`check` 为空时键集为 {success}，非空时键全覆盖 `degree` 五档，大成功、大失败显式写列，删“缺即取 success/failure 那一列”；R9-1.13 `degreeBps` 改为键全覆盖五档、缺档即 E-ACT-ROW。③ `tolerance` 键全覆盖 `claim_kind`、不设容差写 0，R9-11.4 删“缺键为 0”；`categoryMap` 键全覆盖屏蔽词类别族、通用者显式写 `reject:blocklist`，§4.19.1 复述同改。必要理由：卷二 §1.6 第 4–5 项，非 sum 映射不得靠缺键隐性缺省 |
| 封卷后勘误 1114w3k（依据：`审查/总审勘误-稀疏与卷二同步-只核.md`（chk-1114-sp1）余项，主会话定；版本号不升，不改卷首；改前快照 `版本快照/卷九-v2-勘误前-1114w3k.md`，改后覆盖 `版本快照/卷九-v2.md`） | §2.2 `effects` 行 | 值改 `list<effectCall> nullable`，键集恒为 `degree` 五档全族；`check` 为空时非 `success` 四档显式写 null（无检定时此档不出现），删“键集为 {success}”。必要理由：卷二 §1.6（缺失处置）第 4 项；牵连卷二十二:304 `act_plot_invite` 数据行须补四档 null（待主会话派） |
| 封卷后勘误 1115c1（依据：二波丙只核与收尾待办 :630（`basis` 写法）、recordKind 只核小项 a、李白 11-14 19:55 丁11、四波乙二轮配合项（收尾待办 :690）、22:32 裁定表 B `scandal`；`审查/收卷批-按卷清单.md` 9-1 至 9-4 与 24-2；版本号不升，不改卷首；改前快照 `版本快照/卷九-v2-勘误前-1115c1.md`，改后覆盖 `版本快照/卷九-v2.md`） | §2.2 `basis` 行；R9-1.2；§2.9 `stream.check` 两行的对象段；§4.19.1 动作专有槽位段；R9-12.14 动词行表 B 栏 | ① 数据行 `basis` 类型由 `struct:basis`（那是运行态偏离行的结构）改为卷二数据行写法：说明文字 string（display 登记）；② R9-1.2 补候选来源：`entityKind`、`vocab`、`recordKind` 三种槽各从哪里取；③ `stream.check` 对象段补多主体时按 R27-8.5 复合对象段拼主体 id（通用写法，不按动作分支）；④ 写明卷二十三创作动作的专有槽位 `slots`、`roles` 必传、由提出方写定；⑤ `verb_invite_refused` 补 `scandal` 假。必要理由：类型与卷二不合；候选单点定义漏两类槽；多人合演逐演者检定会撞键；卷二十三已把两项改为必传；表 B 新增列须行上必写 |
| 封卷后勘误 1115cb（依据：李白 11-15 01:00 ①，`审查/收卷批-按卷清单.md` 2-7；版本号不升，不改卷首；改前快照 `版本快照/卷九-勘误前-1115cb.md`，改后覆盖 `版本快照/卷九-v2.md`） | R9-12.14 动词行表 B 栏 | `verb_invite_refused` 补 `calendarBound` 假。必要理由：卷二十四表 B 新增行上必写列 |
| 封卷后勘误 1115j3（依据：全书加载修复批 甲-3，`审查/全书加载修复批-甲0-缺栏清单.md` §3.1 卷九三项、`审查/全书加载修复批-前置盘点定性.md` 310b；李白 11-15 07:00 批阶段甲；版本号不升，不改卷首；改前快照 `版本快照/卷九-v2-勘误前-1115j3.md`，改后覆盖 `版本快照/卷九-v2.md`） | R9-1.14；§2.9 事件 id 表 `due.activity` 行；§5.2 卷二十一行；§5.3 勘10 附载体条 | ① R9-1.14 `verb_activity_ended` 补表 B 全部必写栏（`perceivable`、`senses` 按卷十八 §2.3 整类判据，`scandal` 按卷十八 §2.1 含义，`calendarBound` 按卷二十 §4.2.6 不变量③）；② `due.activity` 的 `due_kind` 行补 `calendarBound` 假（按世界分钟）；③ 勘10 附载体条“规则键”改为卷二十七:153 的“规则表键”；④ §5.2 卷二十一行“代号待登记”改为已登记的三个代号。必要理由：卷二十四表 B、卷二十 §2.1 `due_kind` 的这些栏行上必写、无缺省，缺一栏加载即报错（C24-12）；③④ 是与定义处不一致的旧称与过时句。前提失效通知表与 §5.2、§5.3 订阅说明里写到的别卷动词（卷二十一的实例出现、换档、移除三个动词与卷二的终止动词等）是订阅、不是本卷登记，不在本卷补栏 |
| 封卷后勘误 1115k4（依据：李白裁定第 11、29 条（`收尾待办.md`“李白裁定（待裁清单 ad349e21）”条），`审查/全书加载修复批-待裁清单.md` 第一节卷九冷场/超时行、第六节卷九动作目录行；版本号不升，不改卷首；改前快照 `版本快照/卷九-v2-勘误前-1115k4.md`，改后覆盖 `版本快照/卷九-v2.md`） | §2.9 末新增到期项种类行表；R9-1.6、R9-12.7、R9-12.15、R9-13.5 括注种类代号；§2.2 末新增四条动作行与四条候选提供行；§2.1 `act_class` 加 `acls_decide`、`menu_group` 加 `menu_career`（条目，在 §2.2 末段写明字段）；附录待补清单第 11 条 | ① 第 11 条（代号按 chk-1115-k2b B2 改用卷二 §1.9（代号、显示名与语言边界）的 `due_` 前缀与代号正则：`due.activity` 改 `due_activity`，新增四种为 `due_activity_resume`、`due_npc_idle`、`due_dialogue_idle`、`due_invite_expire`；修订记录里的旧称不改）：本卷登记到期项的五处（活动推进点与收工 `due_activity`、续做窗口期满、空闲推进点、冷场关闭、待应答记录超时）各有一行 `due_kind`，`paceClass` equilibrium、`floorRX` null、`calendarBound` 假、`rank` 指卷二十 §2.1 `rank` 分配表（新增四种待该表补号，已交主会话）；原先只有 `due_activity` 写了 `calendarBound`，其余四处无行。必要理由：卷二十 §2.1 要求每类到期项有 `due_kind` 行（缺 `paceClass` 即 E-PACE-UNCLASSIFIED），缺行加载失败。② 第 29 条：补从业、放弃从业、设专注、取节点四条动作行（瞬时、一个必填槽位、无检定、`effects` 调卷十四登记的效果族），`decision.drives` 取卷二十六的 `drive_wealth`、`drive_status` 各 0.5 并记待补第 11 条。必要理由：卷十四这四个写入口的提起方写的是“经卷九动作目录的一条动作”，目录里原本没有这些行，属无据断言（待裁清单第六节）。补（依据 chk-1115-k4 真问题 1、3 与疑点②③，改前快照 `版本快照/卷九-v2-勘误前-1115k4b.md`）：到期项种类表加开放提案预览过期 `due_open_preview`（R9-4.3 括注）；放弃从业 `decision.drives` 取负；从业、放弃从业的候选提供行挂两条新 `target_filter`（`tf_profession_unheld`、`tf_profession_held`）；两行职业槽位与四族的传参、落点注明待裁、暂不可装载。理由：漏登到期项即 E-PACE-UNCLASSIFIED；正向驱力会让居民为求财辞业；不筛候选会截出全不够格的四条。再补（依据李白 ce6e990b ①③，改前快照 `版本快照/卷九-v2-勘误前-1115k4c.md`）：§2.2 `slots` 加整类指向 `tableRow`（卷二 §5 数据表行），R9-1.2 候选来源随加一种；从业两行改指职业表行；四行注明按 ce6e990b 落地（族 `paramsRX` 读 `slot.<名>`、持有开关与 `transition` 落点、写入口准入）；R9-7.5 改为按参数判的唯一定义处，§2.2 校验句与 E-ACT-CAP-MISSING 照它，数值参数为空的族须显式声明为空；待补第 11 条记驱力符号待定与 `acls_decide` 两表补键。理由：裁定整类补，不为四行开特例；原两处按族判与 R9-7.5 按参数判结论相反。又补（依据卷三乙 42f82915、李白 12:05 ③）：§2.2 末加封装动作行 `act_seal_item`（置 `sealIntact` 真，效果族由卷三乙登记）与菜单组条目 `menu_item`；不另登动词。理由：`sealIntact` 改可空后置真只由封装动作执行，目录原无此行。再补（依据 chk-1115-k4r 真问题 2、3、5，改前快照 `版本快照/卷九-v2-勘误前-1115k4e.md`）：删去两条读 `slots.`、`actor` 的职业筛选与封装行 `whenRX`，前提挪到写入口准入（卷十四、卷三乙）；封装槽位加对象筛选 `tf_sealable`（只取文书类、容器类实例）；到期项种类表加日程槽结束 `due_agenda_slot_end` 与原语 `schedule` 入堆项 `due_scheduled`。理由：动作侧 RX 不许读未登记的 `slots.`、`actor`；原写法任何物品都能封；两处到期项原无种类。又补（依据李白 k4r-1 裁定，改前快照 `版本快照/卷九-v2-勘误前-1115k4f.md`）：§4.2.1 `holding.open`、`holding.close` 两行写明持有写者先调种类行准入入口、通过才写、写成后发随附事件，`holding.close` 收边 id 或三元二选一；理由：卷十四从业落持有开关原无准入接点与关边定位。对齐（依据卷十八 46cc8744，改前快照 `版本快照/卷九-v2-勘误前-1115k4g.md`）：两行改用列名 `admission`、`uniqueTriple` |
| 封卷后勘误 1115y1（依据：乙-1、卷十一 C11-5 ⑤⑦、Q11-7；必要理由：卷十一转录各卷迁移行要读到统一的处置、落点与落点对象三列，并知道锚点所用的提交；版本号不升，不改卷首；改前快照 `版本快照/卷九-v2-勘误前-1115y1.md`，改后覆盖 `版本快照/卷九-v2.md`） | §7 表前一段；§7 表头与 M9-1 至 M9-23 | 表前补一句：锚点取卷零 §0.6（锚点写法）基线提交 d54c89a3（R11-2.3），本节无别的提交；表后加三列：处置（`mig_disp`，五值之一，取主去向）、落点（规则号）、落点对象（§2.3 六类代号之一，不写 rules）；原各栏原文不动，不改规则正文 |
| 封卷后勘误 1115y1c（依据：李白 rules 口径裁定选乙（卷十一 §2.3（迁移行 `migrow`）六类封闭，不加新类）；必要理由：落点对象不能写规则层 rules，要取 §2.3 六类代号；不升版本号；改前快照 版本快照/卷九-v2-勘误前-1115y1c.md，改后覆盖 版本快照/卷九-v2.md）：落点对象为 rules 的 11 行按 审查/乙1c-rules对象改写规则.md 机械改写（系统登记项键用卷二 §2.7（系统声明表 `state-owners.json`）补全表的临时键名），其中 0 行推不出或对上多个对象、不猜、对象仍写 rules，列入 审查/脚本输出/乙1c-rules待裁清单.md 待李白逐行裁定；表前"模块组键或 rules"并列说法已删，改指 §2.3 六类。不改规则正文。 | — | — |
| 封卷后勘误 1115y5（依据：李白 11-15 16:25 裁定第一至四条、chk-1115-y4；必要理由：落点对象不能写规则层 rules，要取 §2.3 六类代号，并按 1a 至 1j 分类、系统键定名；不升版本号；改前快照 版本快照/卷九-v2-勘误前-1115y5.md，改后覆盖 版本快照/卷九-v2.md）：本卷迁移表按 脚本/卷十一/apply-1115y5.mjs 机械改写（对象为 rules 的行按分类改系统键、规则表键或拆行、别名行；临时系统键按 审查/脚本输出/乙5-系统键替换表.md 替换），待裁行见 审查/脚本输出/乙5-rules待裁清单.md。不改规则正文。 | — | — |
| 封卷后勘误 1115y7（依据：李白 11-15 17:0x 裁定第一至四条；必要理由：不在 §2.3 六类里的对象按整类规则改成规范键，待裁三行落点；不升版本号；改前快照 版本快照/卷九-v2-勘误前-1115y7.md，改后覆盖 版本快照/卷九-v2.md）：本卷落点对象里的旧表名（items、itemWear、materials）改现行表代号，其余认不出的对象改本卷系统键（旧写法保留在落点栏作说明），见 审查/脚本输出/乙7-改写记录.md；脚本 脚本/卷十一/apply-1115y7.mjs。不改规则正文。 | — | — |
| 封卷后勘误 1116s2（依据：李白 11-16 11:36 ⑤；不升版本号；改前快照 版本快照/卷九-v2-勘误前-1116s2.md，改后覆盖 版本快照/卷九-v2.md）：§7 迁移表前说明里处置（`mig_disp`）的"五值之一"改"六值之一"（处置值已是六值，见卷十一 §2.1（封闭枚举）），共 1 处；不改规则正文。 | — | — |
| 封卷后勘误 1116乙8-3-九（依据：李白 11-16 10:xx 乙-8 改做法第 3、4 条；主会话技术裁定 1116 白天 B2–B4、E5；必要理由：迁移行落点所在节登记了多个入口，卡账 entries 取不到恰一个入口，改为只补能确定的名字、不在卷文留待补标记；不升版本号；改前快照 版本快照/卷九-v2-勘误前-1116乙8-3-九.md，改后覆盖 版本快照/卷九-v2.md）：落点栏补写入口名 4 行（M9-6、M9-7、M9-8、M9-10；名字只取本行原文明写的，或所引规则正文里恰写出的本卷唯一入口）。不改规则正文 | — | — |
| 封卷后勘误 1118k8（依据：李白 11-18 04:10 stockLots 以卷六为准裁定第 4 条，见 审查/李白裁定-1117.md；卷三乙、卷六同号；改稿 claude-opus-5-5 中档；必要理由：裁定要求在卷九对应处注明容器内数量的记账口径；不升版本号；改前快照 版本快照/卷九-v2-勘误前-1118k8.md，改后覆盖 版本快照/卷九-v2.md）：R9-1.12"经账本离手"一点（抽查对象"账户与容器"处）补注"容器内物品的数量仍记在容器所属持有人的账户上，容器只管位置/归属"（04:10 第 4 条原话）。核过本卷无"容器自有账户"或"容器内数量另存"的写法，与该句不冲突。不改其他规则正文 | — | — |

## 附录 自检脚本输出

脚本 `F:/dnd-tmp/vols/check-卷九.mjs`（只读本卷成稿，行数只数到本附录之前），输出存 `F:/dnd-tmp/book/out/v9v2-selfcheck.txt`；四个全书脚本输出存 `F:/dnd-tmp/book/out/v9v2-*`。第二版原样输出：

```
PASS 1 章节 §0–§8、术语表、待补清单齐全
FAIL 1b 卷首署名行
PASS 1c 没有残留的续写标记
PASS 2 十九个子系统各六小节齐全
PASS 3 数据实例至少三条，含非西陲、含非人类或超自然
PASS 4 验收断言三式齐全且有编号
PASS 5 规则与正文无具体 id 字面量
PASS 6 无用于判断的描述性文本
FAIL 7 台账各概念写全（标题、关键代号、每节有规则且编号连续） — Jev 判断层
PASS 8 跨卷引用带标题；规则与断言编号引用不悬空
PASS 9 json 代码块可解析（2 块） — bad=0
FAIL 10 红线：不读墙钟、除数有下界或为 0 分支、存法与去留登记、不读事件日志 — §2.3 缺 state.proposals[proposalId] | §3.3 去留缺 state.proposals[proposalId] | §2.3 缺 state.marks[markId] | §3.3 去留缺 state.marks[markId]
FAIL 11 数据实例算术与余数结转复算（21 项加 5 组余数） — 预付缺原句:ceil(0.3 ÷ (0.02 × 5)) × 5 = ceil(3) × 5 = 15
PASS 12 接口、入口表、规则表键、错误码、枚举、槽位表、迁移清单落实
PASS 13 来路无关、默认不开模型、拒收三不条文在位
行数 1553；子系统 19；规则条数 167；json 块 2；待补清单 10 条；失败项 4
```

四项 FAIL 都是第二版的合法改动使脚本里写死的锚点失配，脚本未改：1b 卷首署名行按指令改为三段式；7 关键词“Jev 判断层”随小项 3 改名为“选择式判断层”；10 写死的路径 `state.proposals[proposalId]`、`state.marks[markId]` 随 T10 改为按主体分段的 `state.proposals[actorId][proposalId]`、`state.marks[onId][markId]`；11 写死的预付原句随 T19 改为按 `w.money` 折算（新式 `ceil(0.15 ÷ (0.01 × 5)) × 5 = ceil(3) × 5 = 15` 与骆驼例 `ceil(0.3 ÷ (0.01 × 5)) × 5 = 30` 均已手算核对）。

四个全书脚本（只看本卷）：

```
check-dupnames：涉及卷九 3 行，全部是提示级（不同表里的同名字段 actor、origin、stages，类型各自在本表内无歧义）
check-exemptrefs：卷九未找到 0 行
check-dualwrite：涉及卷九 0 行
check-divisor：合计 0 处，卷九 0 处
```
