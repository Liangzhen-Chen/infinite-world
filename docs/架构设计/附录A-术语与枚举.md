# 附录 A 术语与枚举（唯一定义处）

（2026-10-15 第二轮修订新增。run-003 两份审查（A 专项④⑤、B §3 与专项④⑤）指出：同一枚举在 01/04/12 三处定义且不一致，领域函数只出现在示例里，"这类东西该用哪种概念"没有判别表，`kind` 一词多义。本附录是全篇枚举与术语的**唯一定义处**；各章只引用、不重复列举。枚举扩充只改本附录并在修订记录登记。2026-10-16 第三轮修订（run-005 审查 C6–C10、专项④）：原语参数一律用 `holdingKind` / `obligationKind`；触发加 `insolvent`；原语加 `holding.rescale`（19 个、14 族）；民事十类；卸载策略加实体转换与改指；降级等级改为不改见证语义；RX 标准库补齐正文用到的全部函数；新增 §A.15 关键派生的定义（显著度、钉住、聚合变体、同意、争夺）、§A.16 core 修正槽与派生值附表、§A.17 core 自治候选与遭遇规则的输入附表。2026-10-16 第四轮修订（run-006 审查 C1–C3、X1–X10、S3–S5、M1–M7、L1–L12）："人不在原处"改为五种形态，**受限 confined** 从失能中分出并成为第八种触发；`pins` 改为钉住侧枚举；税表加收款人、认可条款加发行者、合同效力加文本语言；RX 加事件窗口计数、劳务报价、职能有效、受限制度等函数；§A.15 加受限、职能有效、立场传导的知情门控、批次表象；§A.16 加 `economy:wage`、`social:distortion`；§A.17 加用工 / 辞工 / 脱逃候选。）

## A.0 用词约定

- "种类"按对象分别写作：实体种类 `kind`、持有种类 `holdingKind`、义务种类 `obligationKind`、案件种类 `caseKind`、资源种类 `resource`；转移协议用"触发 `trigger`"与"起因 `basis`"，不用"种类"。**原语参数与数据文件同此**：`holding.open{holdingKind}`、`obligation.create{obligationKind}`、`ontology/holdings.json` 的条目键是 `holdingKind`；凡写作 `"kind": …` 的地方一律指实体种类（例 `"kind": "org/sect"`）。06 §6.3、03 §3.3、12 §12.7.3 的示例已按此改写；校验器对持有与义务文件中出现裸 `kind` 报 E-SCHEMA 并给出改法。
- 表格中的"—"一律表示"该触发对该种类的两端模板不适用（不会发生）"，不是"无操作"。
- "同意"一词只指 §A.15 定义的**裁决输入**（有 / 无 / 代理 / 法典紧急条款），不是事务校验项；"精神类需同意"的旧说法在全篇改为"精神类读同意"（06 §6.5 第 3 步）。

## A.1 存储概念（8，不增加）

实体、持有、义务、地点、账户与转移、事件、规则、时钟（01 章）。其余一切是派生投影。

## A.2 概念判别表（"这类东西该用哪种概念"）

| 要表达的东西 | 用什么 | 例 |
|---|---|---|
| 身份、归属、权利、资格、结构性关系 | **持有**（边） | 任职、会籍、所有、租赁、监护、婚姻、公民籍、驯服、附身、封印、信奉、网点、通缉 |
| 东西在哪 | **位置事实**（节点 / 分区 / 随身者 / 容器 / 路线段 + 进度；容器内物的位置随容器派生）——不是持有 | 船在港、剑在当铺、货在船上 |
| 态度、好恶、信任 | **立场投影**（由 impress 事件派生，不存） | 恨、敬、欠情 |
| 承诺、债、应做之事 | **义务** | 借贷、工资、送货、承诺、悬赏、报恩、冤债、契约、批复 |
| 可流通的凭证 | **义务（或持有）+ 代表它的物品**（`represents`） | 汇票、盐引、地契、当票 |
| 争议中的主张 | **instrument 实体 `claim`**（案件解决它，不是案件种类） | 争议主权、争议遗产份额、亡魂对旧宅 |
| 许可、执照 | **持有 `permit`**（授予者是职位；不是实体） | 采矿许可、施法许可 |
| 委托、代办 | **义务**（不是持有）；以他人名义行事时事件记 `actedAs`；越权行为效力待定（05 §5.3） | 代售、代管、代为履约 |
| 人不在原处 | 五种形态，见 A.3 | 在途、流放、失能、受限（拘留）、做客 |
| 被关起来但还能思考、说话、同意 | **受限 confined**：持有 `guest_of{mode: detained}` + 触发 `confined`（§A.3、§A.15） | 入狱、羁押、软禁、人质、俘虏 |
| 一个人现在能不能行使某条持有的职能 | **职能有效 `effective(holding)` 派生**（§A.15），不是持有的存续 | 停职的官员、在押的店主、远行的村长 |
| 计量物的制造产出（面包、盐、铁条、铸币） | **配方 + 制造源 `src:craft`**（制造守恒对，01 §1.6；配方是数据 `rules/tables/recipes.json`） | 工坊、厨房、私铸 |
| 可兑现的纸币、纯信用货币（冥币） | **资源种类，货币事实 `metal: none`**，发行经 `src:issue`（发行守恒对），定价走 15 §15.3 的信用分支 | 交子、冥币 |
| 持有者以为自己拿的是什么（可替代物） | **批次 `purports`**（01 §1.6）：主观视图按表象显示，结算按真实种类 | 轻钱当足钱、掺沙的米 |
| 工钱行情 | **劳务报价 `wageQuote` 派生**（15 §15.2，槽 `economy:wage`，不存） | 工匠工钱上涨 |
| 文书用什么文字写 | **文书事实 `language: lang:*`**；阅读前置 = 识字 ∧ 该语言熟练度（§A.15 语言） | 湾文契约、译本 |
| 临时的法律人格或程序 | **interim 实体** | 遗产、清算、案件、工程、议案、长仪式 |
| 一次性的处理 | **事件 + 到期项**，不新建实体 | 交易、交付 |
| 法律、章程、戒律、条约约束、补丁 | **规范条目**（组织实体的事实；包的 `law/`） | 罪名、税表、豁免、宽限、救济 |
| 新影响因素 | **修正项**（挂在派生方声明的槽） | 风水、农具、节奏、传闻速度 |
| 没有源事件的说法 | **推断规则 → belief 事件** | 谣言、误诊、占卜 |
| NPC 自己会想做的事 | **自治候选**（需求 → 动作） | 签活契、盗采、自荐 |
| 计量的东西 | **账户**（可带批次） | 粮、钱、矿石、种群、香火、怨气 |
| 有身份的东西 | **物 thing 实体** | 杰作、书、契据、船、符、残骸、兜底 mark |
| 一类生物 | **物种数据 + population 账户**；被注意、被命名、有冤的才物化为 creature 实体 | 野猪群 / 青鳞蟒 |
| 文化、文化圈 | **标签层级 + 文化数据记录**（不是实体） | `culture:river`、`sphere:*` |
| 神祇 | **不在场的 agent 实体**（只经神迹动作行事）；地方神职是 **职位** | 原创十二神 / 土地、城隍 |
| 价格、汇率、利率、银根 | **市场投影**（15 章，不存） | — |
| 包要在 core 实体上记自己的状态 | **扩展事实**（`ontology/facts.json`：对 core 种类声明带命名空间的可写事实，12 §12.2.3） | `xiuxian:realm`、`hukou:registeredAt` |
| 能不能听懂对方 | **语言技能 `lang:*` + 沟通度派生**（§A.15） | 官话、草原话；通译 |
| 遗愿如何分财产 | **文书物品（`records`）+ 法典 `testament` 条款**，继承表作缺省（04 §4.4） | 遗嘱、伪造遗嘱（`purports`） |
| 军队、战争 | **组织（军事章程）+ 派生军力 `strength` + 战役 `project` 实体 + 战役求解器**（05 §5.10） | 征召、围城、补给 |
| 一个人能同时接几个活 | **服务容量派生 + 紧迫度排队**（§A.15、§A.16） | 医师、讼师、教师 |
| 谁先得到最后那件货 | **争夺裁决 `contest`**（§A.15） | 争购、争职、悬赏 |
| 人为什么知道一件事 | **知情集合**（见证 ∪ 转述 ∪ 文书 ∪ 种子 ∪ 聚合传闻） | — |
| 远方聚落"大家都知道什么" | **公共知情集合**（统计层聚落的聚合变体，07 §7.3） | 星湾人听说总号倒了 |

## A.3 "人不在原处"的五种形态

| 形态 | 概念 | 行为与同意能力 | 义务 | 日程与职能 |
|---|---|---|---|---|
| 在途、远行 | 位置事实（所在路线段 + 进度）；触发 `moved` | 保留 | 照常到期（I29） | 只有路上的作息 |
| 流放 | 持有 `banished`（政体 → 人）+ 位置；触发 `moved` | 保留 | 照常 | 由章程 `removalTriggers` 决定是否解任 |
| 失能：昏迷、重病、出神、被附身 | 状态标记（失能类）+ 位置（原地；出神者的魂另有位置）；触发 `impaired` | **为假** | 照常（宽限只来自规范 `grace`） | 暂停（`suspend`），代理规则承接职能 |
| **受限：拘留、羁押、软禁、人质、俘虏** | 持有 `guest_of{mode: detained, regime}`（人 → 东道：官府组织 / 典狱职位所属组织 / 绑匪）+ 位置锁定于东道分区；触发 `confined`（第四轮，R4-C1） | **保留**：能对话、受教与授艺、签约、结社、密谋、动用随身账户（买通）、申诉；可及动作集合由东道的**拘禁制度 regime** 决定（§A.15） | 照常（"羁押停息"只能是法典 `grace` 条款） | 并入东道日程；职能按交接类表 `confined` 列暂停（缺省同 `impaired` 列：`suspend`），`regime` 可指定保持有效的持有（劳役的 `employed_by`）；离开 = 东道同意（押解、释放）或脱逃检定 |
| 做客、被留（自愿） | 持有 `guest_of{mode: voluntary}`（人 → 东道）| 保留 | 照常 | 并入东道日程；随时可走 |

**失能与受限的分界**（R4-C1）：失能回答"能不能思考与同意"，受限回答"能不能离开与行使职能"。两者可叠加（在押者昏迷 = 受限 + 失能）。监禁、俘虏、软禁、人质、隔离检疫一律是受限，不是失能；04 §4.1 的 `impaired` 例子不再含拘留。

## A.4 转移协议的枚举（04 章）

**触发（8）**：`gone` 消失、`vacated` 让出、`moved` 位置改变、`defected` 叛离、`altered` 事实改变、`impaired` 失能、**`confined` 受限**（第四轮，R4-C1：由 `guest_of{mode: detained}` 的开立进入、关闭退出；零交接；行为能力与同意能力保留；职能按 `confined` 列暂停，缺省同 `impaired` 列；04 §4.1）、`insolvent` 个人破产（人不消失：只走 04 §4.2 的第 1、2、3（限持有人侧 gone 列为 `estate` 的持有种类）、4 步变体，转入 `liquidation` 承接实体；其余持有不动；04 §4.1）。

**gone 的起因 basis（9）**：`death` 死亡、`dissolution` 解散、`destruction` 毁灭（物、建筑、资源点，含船沉）、`extinction` 灭绝、`declared` 宣告死亡判决、`insolvency` 破产清算判决（组织）、`rested` 亡魂安息、`reborn` 亡魂转生、`pack_removed` 包卸载。回转：`restored`（撤销宣告）。

**持有人侧交接类 handover（8）**：

| 值 | 含义 |
|---|---|
| `vacate` | 标的（职位）进入自己的继任规则 |
| `stay` | 持有不动（只用于持有人仍存在的触发：moved / impaired / confined / defected；持有人 gone 时不得取此值，I6） |
| `succeed` | 按声明的候补顺序移交（族谱顺位 / 契约指定 / 继承表 / 法域默认） |
| `estate` | 转入承接实体（遗产 / 清算） |
| `close` | 关闭并通知标的 |
| `revert` | 回到授予者 |
| `retain_disputed` | 保留实控，立 `claim` |
| `suspend` | 暂停日程占用与职能（`effective(holding)` 派生为假，§A.15），不暂停以持有人为债务人的义务（I29）；因职能而生的义务（salary）按"职能有效的日"累计（01 §1.4）；解除即恢复 |

持有种类的 `handover` 必须声明 gone / vacated / moved / defected / impaired 五项；**`confined` 可省略，缺省取 `impaired` 的值**（两者都是零交接，差别只在行为能力与同意能力，由触发本身定义；第四轮）。

**标的侧交接类 onSubjectGone（4）**：`close` 关闭、`stay` 留在残骸 / 墓碑实体上、`estate` 标的换为其承接实体（遗产 / 清算）、`reparent` 位置移到父节点或归主。

**义务两端消失 onDebtorGone（5）**：`accelerate`、`assume_by_heirs`、`substitute_performance`、`void`、`pursue`（转给该实体的亡魂或转生实体，13 章；无则 `void`）。**onCreditorGone（3）**：`estate`、`void`、`heirs`（直接转给继承人，不经遗产，用于报恩等）。

**承接实体的程序阶段（遗产 / 清算，04 §4.4）**：`notice` 公告 → `filing` 申报 → `settlement` 清偿 → `distribution` 分配 → `closed` 关闭；期限是法典程序数据，可为 0（简易程序）。

## A.5 规则形状

**四种规则形状**：派生、反应、时钟、动作。
**四种声明式规则形状**（存放在已有概念里，不是存储概念）：规范条目（含规范补丁）、修正项、推断规则、自治候选。

**反应规则的优先级类（4，14 章）**：`settlement` 结算（协议子步、货损、冲回、记账）→ `legal` 法律（合法性标注、嫌疑记录）→ `social` 社会（印象、传闻、记忆、状态评价）→ `autonomy` 自治（NPC 与组织的决策提案）。

**同刻阶段（5，14 章）**：外部提案 → 到期项 → 时钟规则（末尾有子步 3′ 争夺裁决：互斥标的的同刻提案按 `contest` 规则统一裁决，§A.15）→ 反应队列 → 刻末断言。

**到期项类（6，按序）**：协议续步与承接实体阶段 → 义务 → 案件阶段 → 组织计划阶段 → 效果与状态到期 → 许可 / 托养 / 封印维护到期。

## A.6 效果原语（19 个，14 族）

定义与校验表在 06 §6.3。族：transfer、holding（open/close/transfer/**rescale**）、obligation（create/settle/cancel）、fact.set、vital、status、move、create、destroy、emit、schedule、transition、learn、time。`holding.rescale`（第三轮新增，R3-S7）：在一个事务内改写同一标的全部份额类持有（share / owns）的份额表，sum 仍为 1.0；用于增发稀释、判决改分、合伙增资；发起者须是组织权能（章程 `authority.issuance`）或判决，且受影响持有人同意或章程表决通过，否则拒绝并给世界内原因（E08② 副手擅自增资因此无效）。原语产生的事件动词与社会动词分开：原语 `transfer` 的事件动词是 `transfer`；社会动词"转让"记为 `convey`（待吸收 S0 第 2 条）。`schedule` 的参数 `via: npc-autonomy` 表示"把该动作交给该 NPC 的决策规则，而不是直接执行"（05 §5.7）。

## A.7 规范层（05 §5.2）

**规范栈层级（5）**：`contract` 合同、`subordinate` 次级属地、`sovereign` 主权、`membership` 成员、`personal` 属人。**补丁**（`patch`）不是层：它在条款选中之后、求值之前修改条款结果（05 §5.2.8）。

**规范条目内容类型（10）**：罪名 offense、民事 civil、程序 procedure、税表 tax、授权表 delegation、豁免 exemption、冲突法 conflict、兼任 plurality、合同效力 contract_validity、认可 recognition（法定货币、凭证承认、阴阳协查）。第四轮（R4-X9 / S3 / S4 / M1）三类条目的字段补齐：
- **税表条目** `{base: trade | toll | poll | property | …, commodity?: goods:*, rateBps | flat, recipient, split?, exemption?}`：`recipient` 取 `treasury`（法域公库，缺省）| `controller`（节点 `controls` 持有人：买路钱、包税的关卡）| `office:<职位>`（职位所属组织的公库，如盐课司）| `holder(permit:<种类>)`（持该许可者：包税权）；`split: [{recipient, bps}]` 表达分成；`exemption: {per: person | household | party, window: 天数, qty, counter: countEvents(...)}` 表达按人按期累计的免税额（§A.13 事件窗口计数）。通行费与关税由节点规范栈的税表条目派生，`controls` 持有本身不收钱（01 §1.5）。
- **认可条目** `recognition = {legalTender: {unit, accepted: [...]}, demonetize?, instruments: [承认的凭证], issuers: {mint: [政体 | office:<职位> | holder(permit:mint)], notes: [org | holder(permit:issue)], minReserveRatio?}, rites: [...], crossRealm?}`：`issuers.mint` 决定谁能引用 `src:mint`（缺省只有发行政体），`issuers.notes` 决定谁能引用 `src:issue` 发行可兑现纸币，`minReserveRatio` 是超发的罪名阈（15 §15.3）。
- **合同效力条目** 加 `authoritativeText: original | translated | each_party_language | terms_only`：有多份语言文本时以哪一份为准（缺省 `terms_only`：以条款快照为准，文本只作证据，05 §5.4 文书语言）。

**民事规则十类**（法典完整性校验要求齐全或显式 `inherit`；第三轮加第⑩类，R3-M10）：
① 清偿顺序与破产（含偏颇清偿撤销期、简易程序期限、个人破产的豁免额 `exemptAmount` 与免责）；② 继承（继承表、**遗嘱 `testament`：形式要件、特留份、效力顺序"有效遗嘱 > 继承表"**、`onDebtorGone` 覆盖、限定继承、放弃期限、同时死亡推定）；③ 婚姻财产与监护顺位；④ 同意与代理（紧急救治、同意代理、代理权范围、越权行为的追认期限）；⑤ 宽限 `grace`；⑥ 担保与风险负担（质押物被盗、担保与冻结的优先）；⑦ 股东责任与**增发**（`issuance`：是否允许稀释、需何种表决或全体同意）；⑧ 侵权责任；⑨ 救济与第三人效力（撤销 rescission、返还 restitution、返还不能折价 damages、强制履行、善意取得、诈害行为撤销）；⑩ **物权取得**（遗失物：拾得报官期限与报酬、逾期归属；先占无主物；时效取得；残骸无人认领期限；拾得不报是否构成罪名由罪名表另定）。

**程序成本**（程序条款的一部分，第三轮，R3 专项②第 7 条）：`procedure.costs = {filingFee 讼费（transfer → 法域公库）, freezeBond 申请冻结的担保（质押或现金，败诉时赔付被冻结方）, loserPays 败诉方承担对方讼费与讼师费的比例, vexatious: {within, count} 同一指控人在期间内败诉或撤案达 N 次后受理裁量加严并可构成 offense:vexatious_litigation}`；缺省值由 core 法典数据给出，可为 0。

**案件种类（4）**：`criminal` 刑事、`civil` 民事、`insolvency` 破产、`declaration` 宣告（失踪 / 死亡 / 撤销）。**刑事程序阶段（7）**：suspicion 嫌疑（私密记录，不是案件）→ accusation 指控 → filing 立案 → pursuit 缉捕 → trial 审理 → judgment 判决 → execution 执行（上诉为分支；执行阶段的原语因被告不在场可及而失败时，阶段回到 pursuit、`wanted` 续期、执行到期项重登记，05 §5.2.7）。

**议案结果类型（3）**：`norm`（对本组织规范条目 fact.set）、`execute`（以组织权能执行一个注册动作）、`appoint`（任免）。**议案状态（7）**：proposed、adopted、pending_approval、approved、rejected、lapsed、executed。

**罪名角色（5）**：principal、accomplice、instigator、negligent、vicarious。

## A.8 主观视图（05 §5.4）

**四域**：自知域（此刻能直接感知的：自己的身体与状态、随身账户与物品——可替代物按批次 `purports` 显示（§A.15）、在场的持有与义务对手方、自己发起的事件、自己签过的条款快照）、可观测域（当前所在地点此刻的公开状态：报价与工价、天气、在场者与可见活动、公告、本地路况）、知情域（知情集合中最新版本）、先验域（模板缺省）。**不在场的持有与义务的状态**（已清偿 / 违约 / 作废 / 对方消失）属于知情域，不属于自知域。NPC 决策只读这四域（I25）。

**知情来源（5）**：见证、被转述、阅读文书、作者知情种子（开局 / `pack.install`）、聚合传闻（统计层聚落公共知情的抽样，可回溯到原事件）。

**tell 的通道（8）**：face 当面、letter 带信、notice 公告、caravan 商队、bard 吟游、dream 托梦、oracle 神谕、omen 异象。通道表是 extend 扩展点（12 §12.2.3）。

## A.9 开放扩展（12 章）

**合并语义（4）**：add、edge、slot、extend。
**槽位（7）**：place.lawCode、place.layout、place.seat、settlement.administrator、place.sensory、org.charter、place.culture。（槽位是"被覆盖的值"；**修正槽**是派生公式上的挂点，清单在 §A.16，两者不同。`settlement.administrator` 只在开局装或该聚落当前没有存活 `administers` 持有时可占，中途注入不得覆盖存活持有——12 §12.4.4、J3，R4-X8。）
**信任（2）**：data、native。**包档（2）**：content（只有内容，不声明规则，`pack test` 跳过规则类检查）、rules。
**修正项阶段（5）**：add、mul、max、min、clamp（派生方按 §A.16 声明可用阶段与顺序；合成顺序固定为 基础值 → add → mul → max → min → 节奏系数 → clamp，05 §5.9）。
**卸载策略（13）**：对事实与资源：dormant、fallback、drop、convert、redeem、void；对持有与义务：close、cancel（包义务种类另可 convert 到 core 种类）；对实体（第三轮新增，R3-S3）：`gone`（退场，缺省）、`keep`（保留为 core 的孤立实体：只允许种类是 core 种类的实体，`origin` 改记"由包 X 留下"，章程、法典、持有照旧）、`convert_entity`（按声明映射改为 core 种类或模板，事实按 `facts` 映射表折算，其余 drop）；对 core 持有指向包实体：`retarget`（把 certified / registered / devotee_of 等 core 持有的标的改指到声明的 core 实体）、`snapshot`（持有留在墓碑上，派生读退役表的 `tables` 快照）。
**退役表的区（9）**：动词 / 标签 / 持有种类 / 义务种类 / 资源种类 / 状态 / 法典 / 动作 / **tables**（被动派生表、名额表、继任表、职位表的快照；第三轮新增，使 04 §4.3 "历史认证保留、派生仍有效"可计算）。
**纪元边界事件（4）**：pack.install、pack.upgrade、pack.uninstall、world_upgrade。

## A.10 空间与节奏

**感知通道（3）**：视觉、听觉、触觉（01 §1.5）。
**节奏档位（5，14 §14.8）**：极慢 ×0.25、慢 ×0.5、适中 ×1（缺省）、快 ×2、很快 ×4——作用于声明 `paceable` 的速率槽。
**降级等级（4，07 §7.5；第三轮改写，R3-C2 / 专项③）**：D0 全量 → D1 **计算时机**分级（低显著度事件的见证按需展开、状态类罪名按月求值、主观视图截断为可重算摘要；**不改变见证语义**，I30 不受影响）→ D2 规则层自治降频、传闻只传显著事件 → D3 注意距离缩小一跳（带滞回：至少保持 N 天再恢复）；等级变化是输入事件 `budget_set`。调度配置（反应深度上限、每刻提案上限、每事件谓词预算）同样是输入事件 `config_set`，进存档（14 §14.2）。

## A.11 超自然（13 章）

**生灵六轴标签族**：本源 `super:*`（dead / spirit / cultivated / beast / divine / fiend / fae / construct / hybrid）、形态 `form:*`、依附 `anchor:*`、驱力 `drive:*`、能力 `power:*`、规矩 `bound:*`；处境（wandering / enshrined / sealed / commanded / contracted / rested / reborn / married）**只派生不存**。
**仪式族 `rite:*`**：funeral、ancestor、feed_hungry、exorcism、sealing、pacify、offering、divination、summoning、purification、binding、curse_counter、passage。
**辟邪 / 克制标签族**：`ward:*`（辟邪物件）、`bane:*`（克制物质）。
**新持有种类（7）**：devotee_of、possesses、cursed_by、commands、seals、enshrined_in、invited。**新义务种类（6）**：gratitude、grievance、pact、vow、approval、bounty。

## A.12 不变量索引（02 章）

I1–I20 初版；I21–I23 第 12 章（定义段见 12 §12.8.5）；I24–I29 run-002；I30 空间；I31 同刻全序、I32 节奏不改因果（run-003 / 第二轮）。共 32 条。

## A.13 RX 标准库（L1 提供，第三方可用的领域函数清单）

包内自定义派生函数以 `<包id>:<函数>` 命名并在 `rules/derivations.json` 声明（例 `luquan:warrantCover`）；下列是引擎保证存在的 core 函数（签名随契约次版本扩充，只增不改）。数值一律是定点数（14 §14.6）。

| 组 | 函数 |
|---|---|
| 视图 | `view(x)`（含 `view(x).combat` 等子视图）、`fact(x, field)`（含包的扩展事实 `fact(x, 'pack:field')`）、`trait(x, name)`（性格与价值排序项，0..1）、`holdings(x, holdingKind?)`、`holder(office)`、`members(org, filter?)`、`member(x, org)`、`rank(x, org)`、`present(a, b)`、`located(x)`、`zone(x)`、`distance(a, b)`、`reachable(a, b)`、`age(x)`、`lifespan(x)`（§A.16）、**`effective(holding)`**（职能是否有效，§A.15）、**`impaired(x)` / `confined(x)`**（§A.3）、**`regime(x)`**（受限者所受的拘禁制度，§A.15）、**`canAct(x, actionOrFamily)`**（行为能力 ∧ 受限制度允许） |
| 选择器（有界） | `persons(selector)`、`entities(kind, selector)`、`county(place)`、`settlement(place)`、`exists(selector)`、`installed(packId)`（软依赖守卫） |
| 事件与原语 | `has(event, tag)`、`anyPrim(event, predicate)`、`prims(event)`、`crossesNode(event, scope)`、`cargo(entity)`、`cargoQty(entity, goods)`、`commodity(resource)`（商品类标签）、`tender(item)`（行使票据）、`causes(event)`、`actedAs(event)`、`salience(event)`（§A.15）；**事件窗口计数**（第四轮，R4-M2）：`events(selector, window)` / `countEvents(selector, window)`——读**真相事件索引**，selector 必须含至少一个索引键（actor / target / location 之一）与动词集合，`window` ≤ 上限（配置，缺省 365 天）；供税表免税额、常客识别、滥诉计数、状态类罪名、服务容量复用；不进主观视图。主观版本 `knownEvents(x, selector, window)` 只读 x 的知情集合（决策、推断、候选用它，I25）；候选或推断的 RX 调用 `countEvents` 在 P8 被拒（E-INV-I25） |
| 账户 | `account(x, res, purpose?)`、`lots(x, res)`、`taint(lot)`、`origin(lot)`、**`purports(lot)`**（批次表象，§A.15）、`capacity(x)`、`laborHours(business, period)`、`serviceCapacity(x)`（§A.16）、**`issued(currency)`**（流通中的纸币总额）、**`reserveRatio(issuer, currency)`**（15 §15.3） |
| 义务 | `obligations(x, role?)`、`due(o, t)`、`overdueCount(o)`、`overdue(o, days)`、`grace(o, t)`、`consent(from, to, scope)`（§A.15 同意查询） |
| 规范 | `jurisdiction(place)`、`code(place)`（主权法典，`code(place).clause(type, key)` 同 `clause(normStack(…), …)` 的主权层简写）、`normStack(actor, place, t)`、`clause(stack, type, key)`、`recognizes(jurisdiction, thing)`（含 `recognizes(j, actor, 'issuer')`）、`evidenceScore(case)`、`succession(office)` |
| 立场与知情 | `standing(a, b, dim?)`、`knows(x, event)`、`believes(x, prop)`、**`knownHoldings(x, target, holdingKind?)`**（x 知情集合中可见的 target 持有，§A.15 传导门控）、`subjective(x).field`、`quoteKnown(x, place, goods)`、`publicKnowledge(settlement)`、`canCommunicate(a, b)`（§A.15 语言）、**`canRead(x, item)`**（识字 ∧ 文书语言熟练度，§A.15） |
| 市场（15 章） | `price(place, goods)`、`settlePrice(place, goods, qty)`、`itemValue(item, viewer?)`（物品个体估值，15 §15.2）、**`wageQuote(place, skill, tier)`**（劳务报价，15 §15.2）、`rate(place, coinA, coinB)`、`ppi(place)`、`interestRate(bank, borrower)`、`credit(region)`、**`recipe(id)`**（配方表项，01 §1.6） |
| 决策 | `npcDecision(request, terms)`、`need(x, kind)`、`utility(...)`、`explain(x, decision)`、`urgency(request)`（§A.15） |
| 军事与组织（05 §5.10） | `strength(org)`、`supply(org)`、`leverage(orgA, orgB)`、`deterrence(party)` |
| 时间与骰 | `now()`、`days(a, b)`、`season()`、`window(id)`（阈限时间窗）、`roll(key)` |
| 超自然（13 章） | `efficacy(rite_or_item, being)`、`trueName(x)`、`sympathyLink(item)`、`afterlife(person)` |
| 集合与数学 | `filter/map/some/every/count/sum`（有界）、`min/max/clamp/round/floor/abs`、`log/exp`（引擎提供的确定性定点近似） |

正文示例中带包前缀的函数（`luquan:warrantCover`、`shipping:routeHasStorm` 等）是包在 `rules/derivations.json` 声明的派生，不在本表；不带前缀又不在本表的函数名在 P7 报 E-RX-UNKNOWN。

## A.14 编号约定

走查题号带轮次前缀：R1-E01…R1-E20（run-001）、R2-E1…R2-N8（run-002）、R3-E1…R3-N5（run-003）、R5-E01…R5-N8（run-005）、R6-E1…R6-N8（run-006）；"指南N*"指开发指南 v2 的 NPC 验收编号。审查意见编号：A-Cn / A-An / A-Bn（run-003 审查 A）、B-Mn / B-Sn / B-§3.n（审查 B）；R3-Cn / R3-Sn / R3-Mn / R3-Ln（run-005 审查的矛盾、严重、中等、轻微条目，"R3"指第三轮修订）；R4-Cn / R4-Xn / R4-Sn / R4-Mn / R4-Ln（run-006 审查的矛盾、不一致、严重、中等、轻微条目，"R4"指第四轮修订）。

## A.15 关键派生的定义（第三轮新增：此前只被使用、未被定义的词）

- **显著度 `salience(event)`**：事件头的一个定点数 0..1，归约时冻结写入。`salience = clamp( 动词基础显著度（词汇表每个动词的数据）× 分量乘子 × 幅度乘子 )`：分量乘子取参与者中最高的"持有分量"（职位职级、组织规模、首领、与玩家有持有/义务/强立场 → 数据表）；幅度乘子 = 事件数量（金额、伤害、人数）÷ 本地同类中位数，分段表。用途：传闻自动生成阈值、公共知情截断、NPC 记忆排序、D1 分级、预兆判定（14 §14.8）、返场摘要。显著度不参与任何守恒或裁决。
- **钉住 `pinned(x)`**：实体被钉住当且仅当：(a) 日程堆上有指向它的到期项（义务、案件、效果、许可、协议阶段）；或 (b) 它处在一条注册时声明 `pins` 的持有的**被钉侧**（第四轮，R4-X2：`pins: holder | subject | both`，缺省 `none`；core：holds_office（holder）、controls（holder）、wanted（subject）、banished（subject）、guest_of{detained}（holder；东道为 person 时 both）、custody_of（holder）、companion（both）、frozen（subject：被冻结持有的持有人与账户所属实体）、pledged（subject：质押物的 owns 持有人）——case 与 obligation 本身不是钉住对象）；或 (c) 它 `owns` 一个**模板声明 `pins: true` 的物品个体**（第四轮收窄，R4-L10：core 为带 `teaches` 的书与手札、带 `sympathyLink` 的媒介、署名杰作；契据、账簿、信件等文书与普通工具不钉住——否则每个有地契的农户都进规则层；E12③ 持手札的商人仍在规则层逐日自治）；或 (d) 它与玩家有持有、义务或强立场（07 §7.2 的智能层"相关实体"）。resides、kin、citizen_of、member_of、devotee_of、employed_by 不钉住（成员以聚合计；组织本身若有职位持有人则经 (b) 钉住）。钉住实体无论所在地区层级，至少按规则层处理自己的规则（07 §7.2）。
- **聚合变体 aggregate variant**：跨层规则在统计层的等价形式，schema：`{"aggregate": {"target": 聚落级账户或子账户或率字段, "closedForm" | "step": …, "split": 物化时按种子把聚合量分配给个体的规则, "merge": 并回时把个体量计入聚合的规则, "tolerance": 容差}}`；声明 `"aggregate": "auto"` 时引擎用缺省变体：只含 transfer / 数值 fact.set 的规则，对聚合账户按"个体规则 × 聚合人数"执行同一闭式，split/merge 按比例，容差取 B05.2 缺省——这让多数 rules 档作者不必手写聚合变体（07 §7.3 第 7 条）。
- **同意 consent**：动作裁决的一个**输入**（06 §6.5 第 3 步），不是事务校验。来源三种：①本人当面同意事件 `consent_given{from, to, scope: 动作族或动作 id, until?}`（可由 `consent_revoked` 撤销；NPC 由 `npcDecision` 给出，读立场、关系、灵智与处境，不自动同意；玩家由界面或叙述给出），②代理同意（guardian_of、章程授权的职位，受民事④范围限制），③法典紧急条款（民事④：哪些状态、哪些动作族免同意）。查询 `consent(from, to, scope)` 返回 有 / 代理 / 紧急 / 无。**无同意的结果**：动作照常裁决，但改为对抗检定（目标的意志 / 灵智 / 抗性 vs 行为者），事件附描述标签 `unconsented`（强制类另加 `forced`，记忆改写类加 `memory_altered`），罪名由规范栈判定——core 法典数据把人对人的强迫与改记忆定为重罪（`offense:coercion`、`offense:memory_alteration`，上位 `offense:harm`），治疗与辅助类的无同意施加按 `offense:unconsented_magic` 轻罪或豁免（法典数据）。生灵来源的 `unconsented`（附身、迷惑、作祟）不构成人间罪名，但人借生灵对人施加仍是人对人（13 §13.4）。
- **语言与沟通 `canCommunicate(a, b)`**：语言是技能族 `lang:*`（文化记录给母语，熟练度 0..3），沟通度 = 双方共同语言的最低熟练度，或经在场 companion 通译（通译的熟练度，事件记 `actedAs: interpreter`）；沟通度为 0 时对话、交易、请求、议价动作降级为"手势交易"（只能完成等价物交换、不能议价、不能缔结带条款的义务；欺骗与劝说的难度 +5），事件带标签 `gestural`。通译的回扣 = 通译以 actedAs 代办时的 `deceive` tell + 自留转移，识破走知情。**文书语言**（第四轮，R4-M1）：文书物品带事实 `language: lang:*`（缺省为写作者的母语；译本另带 `translatedFrom`、译者署名）；`canRead(x, item) = 识字技能 ∧ lang(item.language) 熟练度 ≥ 读写阈（数据，缺省 1）`；不满足时阅读只产生"看不懂的文字"知情（记文书存在与语言，不含内容），可由在场懂该语言者代读（tell(源 = 物品, actedAs: interpreter)，经失真表，可私吞可改译）或由译本代替（译本的 `records` 文本可与原件不同，由译者动作写入，`deceive` 可改译）；学会该语言后再读原件才得到原文——"复读契约发现问题"的触发点就是这次 canRead 为真的阅读。合同有多份语言文本时以哪份为准由法典 `contract_validity.authoritativeText` 决定（§A.7），条款快照仍是真相，文本只是证据。跨语言转述的衰减走失真表（05 §5.4，槽 `social:distortion`）。
- **紧迫度 `urgency(request)`**：请求事件 payload 的定点数 0..1，由动作声明的派生式给出（诊疗按伤情 / 病情严重度，救援按生命值，公务按期限），NPC 决策第 4 步"更急的事"读它；超容量的服务请求按紧迫度排队（§A.16 `service:capacity`）。
- **争夺 contest**：同刻多个互斥提案指向同一标的（exclusive 持有、声明 `contest` 的限量存量、开放债权人 `firstToSatisfy`、驻地、同一服务名额）时的裁决规则，由持有种类、义务种类、资源账户或动作声明 `contest: lottery | price | arrival | rank`，缺省 `lottery`（骰值键含序号，14 §14.5）；在刻内"争夺池"统一裁决，不按阶段先后，不按实体 id（14 §14.2，R3-L2）。争夺的单位是**整个提案**（事务原子）：提案含任一争夺型原语即整体登记到争夺池，裁决后整体执行或整体得到世界内原因（14 §14.2，R4 专项①）。
- **受限 confined 与拘禁制度 regime**（第四轮，R4-C1）：`confined(x)` 为真当且仅当 x 是一条存活 `guest_of{mode: detained}` 持有的持有人。受限者位置锁定于东道分区（随东道押解而动）；**行为能力与同意能力保留**；可及动作集合 = `regime(x).allows`——拘禁制度是 `guest_of` 持有的条款 `terms.regime`，引用东道一方的数据（典狱职权表 / 官府程序条款 / 绑匪的自定条款），形状 `{allows: [动作族或动作 id], suspends: [holdingKind] （覆盖 confined 列的缺省）, keepsEffective: [holdingKind 或 持有引用]（劳役的 employed_by）, visitors: permit 种类 | open | none, escape: {guards: 选择器, difficultyRx}}`。core 缺省制度 `custody.default`：允许对话、受教与授艺（learn / service，双方到场）、签约（obligation.create；效力由法典 contract_validity 可限）、动用随身账户（transfer；买通 = transfer + emit(request)）、结社与密谋（holding.open(member_of)、计划）、申诉 / 上诉动作、仪式参与（只能在东道分区内）；禁止离开东道分区（move 出分区只有两条路：东道以 actedAs 发起的押解 / 释放，或**脱逃**——对抗检定 vs `escape.guards` 的警觉与设施 condition，成功 → `holding.close(reason: escaped)` + 事件 `escaped`（起因指向脱逃动作）→ 反应规则把案件回 pursuit、`wanted` 续期）；职能暂停按交接类表 `confined` 列。探监 = 外人按 `visitors` 取得东道 permit 后 move 到东道分区。法律类受限（收监、羁押）的施加与解除只能经案件执行、有权职位的 actedAs 或到期项（06 §6.3，R4-M4）；绑架、俘虏是无权一方开立的 `guest_of{detained}`（合法性由规范栈判，E15② 已有）。
- **职能有效 `effective(holding)`**（第四轮，R4-X6 / M6）：一条持有存活不等于其职能可用。`effective(h) = alive(holder) ∧ h 未处于 suspend ∧ ¬impaired(holder) ∧ (¬confined(holder) ∨ h ∈ regime(holder).keepsEffective)`；权限、服务、日程片段、`laborHours` 都读它；代理规则在 `effective` 为假时承接（04 §4.6）。因职能而生的义务（salary）按 `effective` 为真的日累计（01 §1.4），与 wage 的"按实际工时"对称；法典可写 `salaryWhileSuspended: none | half | full`（缺省 none）。I29 不受影响：以持有人为债务人的义务照常到期。
- **立场传导的知情门控**（第四轮，R4-C2）：05 §5.6 的传导项只沿**持有者知情集合中可见的持有**传导：`visibility: 公开` 的持有视为人人可见（在可观测域 / 先验域）；`仅成员` / `仅当事人` 的持有只在持有者的知情集合含其开立事件、转述或文书，或持有者有相应 `belief`（可错）时才传导，查询 `knownHoldings(holder, target)`。于是秘密结社的会籍不会让不知情者的恶感传到该成员身上，而**误信**某人入会会传（I25 双世界口径：真相不同、四域相同则立场相同）。组织作为立场持有者时，其知情集合 = 章程指定的决策职位持有人（缺省首领）的知情集合 ∪ 组织文书（账簿、名册）。
- **批次表象 `purports(lot)`**（第四轮，R4-M7）：`lots: true` 的资源，批次元数据加 `purports`（该批次自称的资源种类或成色档，缺省 = 真实种类）。持有者的主观视图（自知域的随身账户、可观测域的货物）按 `purports` 显示，除非其知情集合含该批次的 `origin` 事件（铸造 / 掺假）或鉴定事件；成交与守恒永远按真实种类结算（I1）。"善意持有"= `¬knows(holder, origin(lot).event) ∧ ¬knows(holder, 鉴定事件)`，罪名谓词据此分善意与明知；受骗 = 按 purports 的报价付出对价而得到真实种类——骗局可表达，守恒不被绕过。core 铸币声明 `lots: true`，批次按 (发行者, 成色档, purports) 合并，正常铸币只占一个批次，所以批次数不膨胀；矿石仍不跟踪。

## A.16 core 修正槽与派生值附表（契约附表 B；槽清单随契约次版本扩充，不需要引擎发布）

每行：槽 id、派生值（谁算）、可用阶段、bounds、读它的 core 消费者。包只需注册修正项（05 §5.9）；"读它的消费者"一列是契约承诺：这些 core 规则**必须**读该派生值而不是绕过它。

| 槽 | 派生值 | 阶段 | bounds | core 消费者 |
|---|---|---|---|---|
| `economy:price` | 报价 value（15 §15.2） | add, mul, clamp | [0.2, 5]× | 出清、税基、估值 |
| `economy:yield` | 产量（作物 / 矿 / 工坊；输入含在岗工时） | add, mul, max, min, clamp | [0, 3]× | 生产规则、停工反应 |
| `economy:artifactValue` | 物品个体估值 `itemValue`（15 §15.2） | mul, clamp | [0.1, 20]× | 当铺、拍卖底价、以物抵债、损失评估 |
| `economy:coinCredit` | 发行信用（15 §15.3） | mul, clamp | [0.2, 1.5] | 铸币价值 |
| `economy:restock` | 商号进货量与周转保留（05 §5.1 商号经营） | add, mul, clamp | — | 商号自治候选 |
| `economy:wage` | 劳务报价 `wageQuote`（15 §15.2；第四轮，R4-S5） | add, mul, clamp | [0.3, 5]× | 雇佣动作的缺省条款、用工 / 辞工候选、工程 project 的用工成本、统计层工资聚合率 |
| `facilities:fireRisk` | 火灾概率 | add, mul, clamp | [0, 0.5] | 火灾时钟规则 |
| `facilities:extraction` | 可采量（读采掘通道 / 矿口 / 巷道 condition，01 §1.10） | mul, min, clamp | [0, 1]× | 采掘动作前置、产量 |
| `ecology:floodRisk` / `ecology:capacity` | 洪灾概率 / 栖地容量 | add, mul, clamp | — | 灾害规则、迁徙流量 |
| `weather:precipitation` | 某地区某日 `src:weather` 流入量（天气求解器输出之后、写账之前） | add, mul, min, clamp | [0, 3]× | 水量规则、作物积温、旱涝灾害（R5-N5③ 旱魃压雨由此进入） |
| `health:infectionRate` / `health:recoveryRate` | 感染率 / 康复率 | add, mul, clamp | — | 疫病规则 |
| `life:lifespan` | 个体寿命上限（物种 `lifecycle` 给基础值） | add, mul, **max**, min, clamp | [物种下限, 物种上限 × 10] | core `npcLife` 死亡时钟（R5-N8①② 修仙延寿取 max） |
| `life:aging` | 衰老对属性的年速率 | mul, min, clamp | [0, 2]× | npcLife 衰老 fact.set |
| `service:capacity` | 服务容量（每日可接次数，§A.15 紧迫度排队） | add, mul, clamp | [0, 50] | 服务请求的拖延与排队 |
| `organizations:offeringFlow` | 香火 / 会费流量 | add, mul, clamp | — | 组织反应 |
| `lending:interestRate` | 利率 | mul, clamp | 合同区间 | 放贷 |
| `transport:speed` / `transport:capacity` | 通行耗时 / 运力（含驱赶头数） | mul, clamp | — | move、托运 |
| `transport:risk` | 路线风险（controls 持有人威胁、harm 密度、天气） | add, mul, min, clamp | [0, 1] | **遭遇规则与山贼 / 劫掠类自治候选必须读它**（§A.17） |
| `combat:deterrence` | 队伍威慑（护送方战力、人数、装备、护送类义务与 `mark:escort_banner` 类标签） | add, mul, max, clamp | [0, 1] | 遭遇规则、劫掠候选的 risk 项（R5-N6①⑧） |
| `military:strength` / `military:supply` | 军力 / 补给（05 §5.10） | add, mul, clamp | — | 战役求解器、外交筹码 |
| `diplomacy:leverage` | 外交筹码 | add, mul, clamp | — | 政体自治候选（照会、条约、宣战） |
| `law:evidenceWeight` / `law:riskPerceived` | 证据权重 / 行为者相信的法律风险 | mul, clamp | — | 判决、机会评估 |
| `social:eventWeight` / `social:rumorSpeed` / `social:rumorReach` | 事件权重 / 传闻速度与范围 | mul, clamp | — | 立场、传闻 |
| `social:distortion` | 转述失真强度（失真表各条的触发概率乘子；第四轮，R4-M5） | mul, clamp | [0, 3]× | tell 版本生成（含通译翻译与跨语言转述，`when` 可读 `canCommunicate(讲者, 听者)`） |
| `super:efficacy` / `super:activity` / `super:hauntPressure` / `super:sealDecay` | 13 章 | mul, clamp | — | 仪式、作祟、封印 |
| `world:pace` | 节奏系数（只向 paceable 槽提供） | — | 档位表 | 派生合成器 |

新增一行 = 契约次版本 + 对应 core 派生方声明；第三方包不能新增槽，但可以在 `pack doc` 的"接口缺口"里提需求。

## A.17 core 自治候选与遭遇规则的输入附表（契约附表 C）

包要影响 NPC "会不会做某事"，只需影响这张表里列出的派生值（经 §A.16 的槽或扩展事实）；core 候选不读表外的真相量。

| core 候选 / 规则 | 读的派生值（全部经主观视图） |
|---|---|
| 劫掠 / 拦路（山贼、敌军、首领的 `need:territory` / `need:money`） | `transport:risk` 的成因项、目标队伍的 `combat:deterrence`、目标货值（主观报价）、`law:riskPerceived` |
| 路线遭遇规则（09 E13） | `standing(控制者, 队伍)`、`combat:deterrence(队伍)`、`transport:risk` |
| 迁居 / 逃户 | 主观税差与价差（`quoteKnown`）、`law:riskPerceived`、kin / resides 牵绊 |
| 挤兑 / 拒收 | `believes(self, bank_insolvent)`、`interestRate` |
| 商号进货 / 惜售 / 定价 | `economy:restock`、主观报价、周转保留 |
| 求医 / 就学 | `service:capacity` 的拖延答复、`urgency`、主观价格 |
| 报案 / 告发 | `evidenceScore` 预估、`law:riskPerceived`、立场 |
| 组织：立法 / 征发 / 宣战 / 照会 | 公库、`military:strength`、`diplomacy:leverage`、`standing` |
| 用工 / 招工 / 挖人（雇主侧，05 §5.1 商号经营）与辞工 / 跳槽（雇员侧 `need:money`） | `wageQuote`（主观：本地 `market_report` 的工价项或听说的工价）、现有条款、`laborHours` 缺口、立场 |
| 脱逃 / 买通（受限者，`need:freedom`） | `regime(self).escape` 的难度预估、看守立场、`law:riskPerceived`、随身账户 |
