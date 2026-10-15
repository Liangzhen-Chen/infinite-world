# 附录 A 术语与枚举（唯一定义处）

（2026-10-15 第二轮修订新增。run-003 两份审查（A 专项④⑤、B §3 与专项④⑤）指出：同一枚举在 01/04/12 三处定义且不一致，领域函数只出现在示例里，"这类东西该用哪种概念"没有判别表，`kind` 一词多义。本附录是全篇枚举与术语的**唯一定义处**；各章只引用、不重复列举。枚举扩充只改本附录并在修订记录登记。）

## A.0 用词约定

- "种类"按对象分别写作：实体种类 `kind`、持有种类 `holdingKind`、义务种类 `obligationKind`、案件种类 `caseKind`、资源种类 `resource`；转移协议用"触发 `trigger`"与"起因 `basis`"，不用"种类"。
- 表格中的"—"一律表示"该触发对该种类的两端模板不适用（不会发生）"，不是"无操作"。

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
| 人不在原处 | 四种形态，见 A.3 | 在途、流放、拘留、做客 |
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
| 人为什么知道一件事 | **知情集合**（见证 ∪ 转述 ∪ 文书 ∪ 种子 ∪ 聚合传闻） | — |
| 远方聚落"大家都知道什么" | **公共知情集合**（统计层聚落的聚合变体，07 §7.3） | 星湾人听说总号倒了 |

## A.3 "人不在原处"的四种形态

| 形态 | 概念 | 义务 | 日程与职能 |
|---|---|---|---|
| 在途、远行 | 位置事实（所在路线段 + 进度）；触发 `moved` | 照常到期（I29） | 只有路上的作息 |
| 流放 | 持有 `banished`（政体 → 人）+ 位置；触发 `moved` | 照常 | 由章程 `removalTriggers` 决定是否解任 |
| 拘留、昏迷、出神 | 状态标记（失能类）+ 位置（牢房 / 原地）；触发 `impaired` | 照常（宽限只来自规范 `grace`） | 暂停（`suspend`），代理规则承接职能 |
| 做客、被留 | 持有 `guest_of`（人 → 东道）| 照常 | 并入东道日程 |

## A.4 转移协议的枚举（04 章）

**触发（6）**：`gone` 消失、`vacated` 让出、`moved` 位置改变、`defected` 叛离、`altered` 事实改变、`impaired` 失能。

**gone 的起因 basis（9）**：`death` 死亡、`dissolution` 解散、`destruction` 毁灭（物、建筑、资源点，含船沉）、`extinction` 灭绝、`declared` 宣告死亡判决、`insolvency` 破产清算判决（组织）、`rested` 亡魂安息、`reborn` 亡魂转生、`pack_removed` 包卸载。回转：`restored`（撤销宣告）。

**持有人侧交接类 handover（8）**：

| 值 | 含义 |
|---|---|
| `vacate` | 标的（职位）进入自己的继任规则 |
| `stay` | 持有不动（只用于持有人仍存在的触发：moved / impaired / defected；持有人 gone 时不得取此值，I6） |
| `succeed` | 按声明的候补顺序移交（族谱顺位 / 契约指定 / 继承表 / 法域默认） |
| `estate` | 转入承接实体（遗产 / 清算） |
| `close` | 关闭并通知标的 |
| `revert` | 回到授予者 |
| `retain_disputed` | 保留实控，立 `claim` |
| `suspend` | 暂停日程占用与职能，不暂停义务，解除即恢复 |

**标的侧交接类 onSubjectGone（4）**：`close` 关闭、`stay` 留在残骸 / 墓碑实体上、`estate` 标的换为其承接实体（遗产 / 清算）、`reparent` 位置移到父节点或归主。

**义务两端消失 onDebtorGone（5）**：`accelerate`、`assume_by_heirs`、`substitute_performance`、`void`、`pursue`（转给该实体的亡魂或转生实体，13 章；无则 `void`）。**onCreditorGone（3）**：`estate`、`void`、`heirs`（直接转给继承人，不经遗产，用于报恩等）。

**承接实体的程序阶段（遗产 / 清算，04 §4.4）**：`notice` 公告 → `filing` 申报 → `settlement` 清偿 → `distribution` 分配 → `closed` 关闭；期限是法典程序数据，可为 0（简易程序）。

## A.5 规则形状

**四种规则形状**：派生、反应、时钟、动作。
**四种声明式规则形状**（存放在已有概念里，不是存储概念）：规范条目（含规范补丁）、修正项、推断规则、自治候选。

**反应规则的优先级类（4，14 章）**：`settlement` 结算（协议子步、货损、冲回、记账）→ `legal` 法律（合法性标注、嫌疑记录）→ `social` 社会（印象、传闻、记忆、状态评价）→ `autonomy` 自治（NPC 与组织的决策提案）。

**同刻阶段（5，14 章）**：外部提案 → 到期项 → 时钟规则 → 反应队列 → 刻末断言。

**到期项类（6，按序）**：协议续步与承接实体阶段 → 义务 → 案件阶段 → 组织计划阶段 → 效果与状态到期 → 许可 / 托养 / 封印维护到期。

## A.6 效果原语（18 个，14 族）

定义与校验表在 06 §6.3。族：transfer、holding（open/close/transfer）、obligation（create/settle/cancel）、fact.set、vital、status、move、create、destroy、emit、schedule、transition、learn、time。原语产生的事件动词与社会动词分开：原语 `transfer` 的事件动词是 `transfer`；社会动词"转让"记为 `convey`（待吸收 S0 第 2 条）。`schedule` 的参数 `via: npc-autonomy` 表示"把该动作交给该 NPC 的决策规则，而不是直接执行"（05 §5.7）。

## A.7 规范层（05 §5.2）

**规范栈层级（5）**：`contract` 合同、`subordinate` 次级属地、`sovereign` 主权、`membership` 成员、`personal` 属人。**补丁**（`patch`）不是层：它在条款选中之后、求值之前修改条款结果（05 §5.2.8）。

**规范条目内容类型（10）**：罪名 offense、民事 civil、程序 procedure、税表 tax、授权表 delegation、豁免 exemption、冲突法 conflict、兼任 plurality、合同效力 contract_validity、认可 recognition（法定货币、凭证承认、阴阳协查）。

**民事规则九类**（法典完整性校验要求齐全或显式 `inherit`）：
① 清偿顺序与破产（含偏颇清偿撤销期、简易程序期限）；② 继承（继承表、`onDebtorGone` 覆盖、限定继承、放弃期限、同时死亡推定）；③ 婚姻财产与监护顺位；④ 同意与代理（紧急救治、同意代理、代理权范围、越权行为的追认期限）；⑤ 宽限 `grace`；⑥ 担保与风险负担（质押物被盗、担保与冻结的优先）；⑦ 股东责任；⑧ 侵权责任；⑨ 救济与第三人效力（撤销 rescission、返还 restitution、返还不能折价 damages、强制履行、善意取得、诈害行为撤销）。

**案件种类（4）**：`criminal` 刑事、`civil` 民事、`insolvency` 破产、`declaration` 宣告（失踪 / 死亡 / 撤销）。**刑事程序阶段（7）**：suspicion 嫌疑（私密记录，不是案件）→ accusation 指控 → filing 立案 → pursuit 缉捕 → trial 审理 → judgment 判决 → execution 执行（上诉为分支）。

**议案结果类型（3）**：`norm`（对本组织规范条目 fact.set）、`execute`（以组织权能执行一个注册动作）、`appoint`（任免）。**议案状态（7）**：proposed、adopted、pending_approval、approved、rejected、lapsed、executed。

**罪名角色（5）**：principal、accomplice、instigator、negligent、vicarious。

## A.8 主观视图（05 §5.4）

**四域**：自知域（此刻能直接感知的：自己的身体与状态、随身账户与物品、在场的持有与义务对手方、自己发起的事件、自己签过的条款快照）、可观测域（当前所在地点此刻的公开状态：报价、天气、在场者与可见活动、公告、本地路况）、知情域（知情集合中最新版本）、先验域（模板缺省）。**不在场的持有与义务的状态**（已清偿 / 违约 / 作废 / 对方消失）属于知情域，不属于自知域。NPC 决策只读这四域（I25）。

**知情来源（5）**：见证、被转述、阅读文书、作者知情种子（开局 / `pack.install`）、聚合传闻（统计层聚落公共知情的抽样，可回溯到原事件）。

**tell 的通道（8）**：face 当面、letter 带信、notice 公告、caravan 商队、bard 吟游、dream 托梦、oracle 神谕、omen 异象。通道表是 extend 扩展点（12 §12.2.3）。

## A.9 开放扩展（12 章）

**合并语义（4）**：add、edge、slot、extend。
**槽位（7）**：place.lawCode、place.layout、place.seat、settlement.administrator、place.sensory、org.charter、place.culture。
**信任（2）**：data、native。**包档（2）**：content（只有内容，不声明规则，`pack test` 跳过规则类检查）、rules。
**卸载策略（8）**：dormant、fallback、drop、convert、redeem、close / cancel、void。
**纪元边界事件（4）**：pack.install、pack.upgrade、pack.uninstall、world_upgrade。

## A.10 空间与节奏

**感知通道（3）**：视觉、听觉、触觉（01 §1.5）。
**节奏档位（5，14 §14.8）**：极慢 ×0.25、慢 ×0.5、适中 ×1（缺省）、快 ×2、很快 ×4——作用于声明 `paceable` 的速率槽。
**降级等级（4，07 §7.5）**：D0 全量 → D1 感知与规范求值按显著度分级 → D2 规则层自治降频 → D3 注意距离缩小；等级变化是输入事件 `budget_set`。

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
| 视图 | `view(x)`、`fact(x, field)`、`holdings(x, holdingKind?)`、`holder(office)`、`members(org)`、`member(x, org)`、`present(a, b)`、`located(x)`、`zone(x)`、`distance(a, b)`、`reachable(a, b)` |
| 账户 | `account(x, res, purpose?)`、`lots(x, res)`、`taint(lot)`、`capacity(x)` |
| 义务 | `obligations(x, role?)`、`due(o, t)`、`overdueCount(o)`、`overdue(o, days)`、`grace(o, t)` |
| 规范 | `jurisdiction(place)`、`normStack(actor, place, t)`、`clause(stack, type, key)`、`recognizes(jurisdiction, thing)`、`evidenceScore(case)` |
| 立场与知情 | `standing(a, b, dim?)`、`knows(x, event)`、`believes(x, prop)`、`subjective(x).field`、`quoteKnown(x, place, goods)`、`publicKnowledge(settlement)` |
| 市场（15 章） | `price(place, goods)`、`settlePrice(place, goods, qty)`、`rate(place, coinA, coinB)`、`ppi(place)`、`interestRate(bank, borrower)`、`credit(region)` |
| 决策 | `npcDecision(request, terms)`、`need(x, kind)`、`utility(...)`、`explain(x, decision)` |
| 时间与骰 | `now()`、`days(a, b)`、`season()`、`window(id)`（阈限时间窗）、`roll(key)` |
| 超自然（13 章） | `efficacy(rite_or_item, being)`、`trueName(x)`、`sympathyLink(item)`、`afterlife(person)` |
| 集合与数学 | `filter/map/some/every/count/sum`（有界）、`min/max/clamp/round/floor/abs`、`log/exp`（引擎提供的确定性定点近似） |

## A.14 编号约定

走查题号带轮次前缀：R1-E01…R1-E20（run-001）、R2-E1…R2-N8（run-002）、R3-E1…R3-N5（run-003）；"指南N*"指开发指南 v2 的 NPC 验收编号。审查意见编号：A-Cn / A-An / A-Bn（run-003 审查 A）、B-Mn / B-Sn / B-§3.n（审查 B）。
