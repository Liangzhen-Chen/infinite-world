# 附录 A 术语与枚举（唯一定义处）

（本附录是全篇枚举与术语的**唯一定义处**；各章只引用、不重复列举。修订历史见 修订记录.md；第五轮（根因与默认开放）的元模式见 根因分析.md；第六轮按学科体系核对的条目见 学科覆盖表.md。）

## A.0 用词约定

- "种类"按对象分别写作：实体种类 `kind`、持有种类 `holdingKind`、义务种类 `obligationKind`、案件种类 `caseKind`、资源种类 `resource`；转移协议用"协议 `protocol`"（两条）、"起因 `basis`"（gone 的起因）与"`reason`"（持有变更的原因），不用"种类"；"触发"只在"协议入口"的意义上使用（下一条）。**原语参数与数据文件同此**：`holding.open{holdingKind}`、`obligation.create{obligationKind}`、`ontology/holdings.json` 的条目键是 `holdingKind`；凡写作 `"kind": …` 的地方一律指实体种类（例 `"kind": "org/sect"`）。06 §6.3、03 §3.3、12 §12.7.3 的示例已按此改写；校验器对持有与义务文件中出现裸 `kind` 报 E-SCHEMA 并给出改法。
- 表格中的"—"一律表示"该触发对该种类的两端模板不适用（不会发生）"，不是"无操作"。
- "同意"一词只指 §A.15 定义的**裁决输入**（有 / 无 / 代理 / 法典紧急条款），不是事务校验项；"精神类需同意"的旧说法在全篇改为"精神类读同意"（06 §6.5 第 3 步）。
- **附录先于正文**（第五轮，根因分析 (c)）：任何新派生值、RX 函数、修正槽、枚举词、数据文件、协议钩子模板，先在本附录登记（§A.2 判别表、§A.4、§A.7、§A.13、§A.15、§A.16），正文只引用、不另行定义；正文示例中出现而本附录未登记的 `code` 标记在构建期报错（标杆 B16.5）。修订的历史叙述只进 修订记录.md，不留在各章正文。
- **"触发"一词**（第五轮）只指两条协议的入口：实体消失 `transition(gone)` 与持有变更 `holding.open / close / transfer`；在途、失能、受限、叛离、破产、征服、卸载都不是触发，是 `reason:*` 词或钩子条件（§A.4）。

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
| 委托、代办 | **义务 `mandate`**（不是持有；01 §1.4）：条款 `scope` 写明可代为的操作与标的，**`authority()` 读它**（§A.15 第六来源）；以他人名义行事时事件记 `actedAs`；越权 → `validity` 为 pending_ratification（05 §5.3） | 代售、代管、代为履约 |
| 东西在谁手里能不能处分 | **占有派生 `possessor(x)`**（§A.15）：占有而无权的处分**成立**并标 `unauthorized_disposition`，效力由民事⑨善意取得判（06 §6.3） | 寄存物被当掉、代管人私卖 |
| 一个人能不能做、做了算不算 | **行为能力 `capacity(x, 族)`** 三档（§A.15）+ **效力 `validity(act, j)`**（§A.15）：limited 者的行为成立但效力待定；无效 / 可撤销 / 待追认都是对事件标签按法典求值 | 失智老人当地契、未成年签活契、越权代理 |
| 遗产、工程、公库"由谁出面"，没有位置的实体在哪 | **执行人派生 `executor(x)`**（§A.15）：无位置实体的在场 = 执行人在场或其 `seat` | 遗产管理人支取存款、工程管事发工钱 |
| 派生值跨过线（成年、升降格、破产线、寿限） | **阈值事件 `threshold_crossed`**（§A.15）：派生方声明阈值，跨越即发框架事件，钩子与反应规则订阅 | 成年终止监护、人口跌破降镇 |
| 谁查税、放行、漏征、包税 | **税表条目 `collection`**（§A.7）：automatic / assessed / farmed | 税吏受贿放行私盐 |
| 被附身、被强迫时做的事算谁的 | **行为归属**通则（§A.15）：actor = 意志来源，`actorAs` = 身体的身份键；core 豁免 `involuntary_act` | 附身税吏收贿 |
| 一条鱼变成一个人、驯一头野兽 | **个体化守恒对** `sink:individuated` / `src:aggregated`（01 §1.6） | 鲤精化形、捕鹤驯化 |
| 忘了、不信 | **记忆可得 `recall`** 与 **采信 `credence`** 两个开槽派生（§A.15）；印象不随遗忘消失 | 老人忘记口头债、"我是转世"不被当真 |
| 人不在原处 | 五种形态，见 A.3 | 在途、流放、失能、受限（拘留）、做客 |
| 被关起来但还能思考、说话、同意 | **受限 confined**：持有 `guest_of{mode: detained}`（不是触发；§A.3、§A.15） | 入狱、羁押、软禁、人质、俘虏 |
| 一个人现在能不能行使某条持有的职能 | **职能有效 `effective(holding)` 派生**（§A.15），不是持有的存续 | 停职的官员、在押的店主、远行的村长 |
| 计量物的制造产出（面包、盐、铁条、铸币） | **配方 + 制造源 `src:craft`**（制造守恒对，01 §1.6；配方是数据 `rules/tables/recipes.json`） | 工坊、厨房、私铸 |
| 可兑现的纸币、纯信用货币（冥币） | **资源种类，货币事实 `metal: none`**，发行经 `src:issue`（发行守恒对），定价走 15 §15.3 的信用分支 | 交子、冥币 |
| 持有者以为自己拿的是什么（可替代物） | **批次 `purports`**（01 §1.6）：主观视图按表象显示，结算按真实种类 | 轻钱当足钱、掺沙的米 |
| 工钱行情 | **统一估值 `value(劳务)`**（别名 `wageQuote`，估值表的劳务行，槽 `economy:value`，不存） | 工匠工钱上涨 |
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
| "在谁看来 / 在哪个法域 / 什么时候 / 在哪一层"有效、被承认、知道、值多少 | **视角 `frame` 下的派生**（§A.15），不是存储字段；四轴各有特例 | 主观视图、承认、行为时法、聚合变体 |
| 一个人的化名、马甲、易容、变形后的另一副面孔 | **身份键**（§A.15）：实体只有一个，身份键可有多个；观察者按认出的键记忆与评价 | "石三"与本名 |
| 这桩婚、这张认证、这份许可、这笔钱在另一个法域算不算数 | **承认派生 `recognized(x, j)`**（§A.15）：法典 `recognition` 条目对缔结快照求值，缺省承认 | 部盟婚在王国无效、城邦认证在王国有效 |
| 月、闰月、年号、节庆日期 | **历法数据**（§A.15）+ 投影 `month / year / calendarDate / window`；时钟仍只认分钟 | 改元、阴阳合历 |
| 斤、两、锭、以羊计价 | **单位表**（文化记录 / 法典 `units`）按视角显示；存量只有规范单位；计价单位可以是任何资源 | 王国斤、矮人锭重 |
| 一块地、一头牲口、一座铺子、一张债权、一天工值多少 | **估值派生 `value(x, frame)`** + 估值表（15 §15.2），一个派生对一切可定价物 | 地价、种畜溢价、军需券贴现 |
| 一类普通动物 / 家畜 / 超自然生灵 | **物种数据**（同一 schema：lifecycle、heritable、goods、yields、interactions、inheritance）+ population 账户；超自然只多 `origin: super:*` 与 `sources` | 野兔、矿驴、青鳞蟒 |
| 牲畜的血统与谱牒 | 物种 `heritable` + 文书物品（谱牒 `records`）；**不用 kin**，物种 `inheritance: false` 使其不进继承与监护 | 马驹不是继承人 |
| 征服 / 割让 / 独立之后原来的郡府、职位、公库 | **协议钩子**（§A.4）`subject.transferred(governs)` + 新法典 `conquest` 条款 | 城破当日郡守卸任 |
| 某持有的一端出了事，别的持有怎么办 | **钩子**（§A.4），不是新触发 | 脱逃 → 案件回 pursuit |
| 谁有权做某事（放人、动公库、发钞、加前置） | **权能派生 `authority(actor, op, target)`**（§A.15）；"加前置"经定义补丁（§A.9） | 典狱放人、行会要求拜师 |

## A.3 "人不在原处"的五种形态

五种形态**都不是协议触发**（第五轮）：它们是位置事实、状态或持有，效果全部由职能有效 `effective(h)` 与行为能力 `canAct(x, 动作族)`（§A.15）派生；持有种类不为它们声明交接列（§A.4）。

| 形态 | 概念 | 行为与同意能力 | 义务 | 日程与职能 |
|---|---|---|---|---|
| 在途、远行 | 位置事实（所在路线段 + 进度），`reason: moved` 只用于迁居类持有变更 | 保留 | 照常到期（I29） | 只有路上的作息；不在场的职能 `effective` 为假，代理承接 |
| 流放 | 持有 `banished`（政体 → 人）+ 位置 | 保留 | 照常 | 由章程 `removalTriggers` 决定是否解任 |
| 失能：昏迷、重病、出神、被附身 | 状态标记（失能类）+ 位置（原地；出神者的魂另有位置） | **为假** | 照常（宽限只来自规范 `grace`） | `effective` 为假（`suspend` 模板的含义），代理规则承接职能 |
| **受限：拘留、羁押、软禁、人质、俘虏** | 持有 `guest_of{mode: detained, regime}`（人 → 东道：官府组织 / 典狱职位所属组织 / 绑匪）+ 位置锁定于东道分区 | **保留**：能对话、受教与授艺、签约、结社、密谋、动用随身账户（买通）、申诉；可及动作集合由东道的**拘禁制度 regime** 决定（§A.15） | 照常（"羁押停息"只能是法典 `grace` 条款） | 并入东道日程；其他持有 `effective` 为假，除非在 `regime.keepsEffective` 内（劳役的 `employed_by`）；离开 = 东道押解 / 释放或脱逃检定（钩子 `self.closed(escaped)`） |
| 做客、被留（自愿） | 持有 `guest_of{mode: voluntary}`（人 → 东道）| 保留 | 照常 | 并入东道日程；随时可走 |

**失能与受限的分界**：失能回答"能不能思考与同意"，受限回答"能不能离开与行使职能"。两者可叠加（在押者昏迷 = 受限 + 失能）。监禁、俘虏、软禁、人质、隔离检疫一律是受限，不是失能。

## A.4 转移协议的枚举（04 章）

**协议（2）**（第五轮，根因分析 (e)）：`transition(gone)` 实体消失（04 §4.2 全流程）；**持有变更** `holding.open / close / transfer`（带 `reason:*` 词，04 §4.1）。不再有第三种"触发"；新的转移时刻一律写成钩子。

**gone 的起因 basis**（词汇族 `basis:*`，core 预置 10）：`death`、`dissolution`、`destruction`（物、建筑、资源点，含船沉）、`extinction`、`declared`（宣告死亡判决）、`insolvency`（破产清算判决，组织）、`rested`、`reborn`、`aggregated`（个体并回种群账户，01 §1.6 个体化守恒对）、`pack_removed`。**回转 `restored`**（第六轮通则，04 §4.5.1）：由撤销宣告判决、声明 `produces: restored` 的动作（神迹复活，受法典 `recognition.what: resurrection` 约束）或冥府还阳案件产生；不回滚事件，承接实体未关闭则终止，已分配者按现存利益返还；basis 为 death 时另恢复 vital、尸身 wreck 与亡魂实体 gone。

**持有变更的 reason**（词汇族 `reason:*`，开放，core 预置）：`vacated`（免职、辞职、退会、退租、放弃）、`defected`（叛离）、`transferred`（买卖、继承分配、征服）、`judgment`、`expired`（到期）、`escaped`、`released`、`pardoned`（赦免）、`divorce`、`conquest`、`pack_removed`、`moved`（迁居类）。reason 由钩子条件读取，不改变协议步骤。

**钩子 hook**（持有种类、义务种类、实体种类、法典在注册时声明，`hooks: [{on, when?, do}]`）：
- `on`：`holder.gone(basis?)` | `self.closed(reason)` | `holder.holdingClosed(holdingKind, reason)`（例：持有人的 member_of 因 defected 关闭）| `subject.gone(basis?)` | `subject.transferred(holdingKind)`（例：标的地点的 governs 换了持有人）| `event(verb, filter)`（例：判决 `insolvency` 对个人、状态 `impaired` 施加、**阈值事件 `threshold_crossed{thresholdId}`**——guardian_of 的 `event(threshold_crossed: capacity:adult, entity: subject)` → close，§A.15）。
- `when`：RX，读持有条款、法典条款（`clause(…)`）、持有人与标的视图。
- `do`：下表的钩子模板之一，或原语列表（在协议事务内执行，受 I6–I8 断言；失败整体回滚）。
- 执行顺序固定：权能 → 照护 → 在途 → 经营与用工 → 财产与债 → 成员与居所（04 §4.2 第 3 步）；同一持有多条钩子按 (包 id, 钩子 id) 序。
- **必填简写**：持有种类的 `handover.{gone, vacated, defected}` 与 `onSubjectGone` 就是 `holder.gone`、`self.closed(vacated)`、`holder.holdingClosed(member_of, defected)`、`subject.gone` 四条钩子的模板值（I5）。在途、失能、受限不需要钩子（§A.3）。

**钩子模板（8；旧称"交接类"，各章沿用的"交接类"一词即指它）**：

| 值 | 含义 |
|---|---|
| `vacate` | 标的（职位）进入自己的继任规则 |
| `stay` | 持有不动（持有人 gone 时不得取此值，I6） |
| `succeed` | 按声明的候补顺序移交（族谱顺位 / 契约指定 / 继承表 / 法域默认） |
| `estate` | 转入承接实体（遗产 / 清算） |
| `close` | 关闭并通知标的 |
| `revert` | 回到授予者 |
| `retain_disputed` | 保留实控，立 `claim` |
| `suspend` | 说明性模板：持有不动而 `effective(holding)` 为假（§A.15），不暂停以持有人为债务人的义务（I29）；因职能而生的义务（salary）按"职能有效的日"累计；解除即恢复——它是失能 / 受限 / 不在场的派生结果，不是协议动作 |

**标的侧模板 onSubjectGone（4）**：`close`、`stay`（留在残骸 / 墓碑实体上）、`estate`（标的换为其承接实体）、`reparent`（位置移到父节点或归主）。

**义务两端消失 onDebtorGone（5）**：`accelerate`、`assume_by_heirs`、`substitute_performance`、`void`、`pursue`（转给该实体的亡魂或转生实体，13 章；无则 `void`）。**onCreditorGone（3）**：`estate`、`void`、`heirs`。

**core 预置的非简写钩子**（细节在 04 §4.3 备注列）：成年终止监护（`event(threshold_crossed: capacity:adult)` 于 guardian_of 标的 → close）；赦免（`pardon` 动作 → wanted / banished / guest_of{detained} close(pardoned)、判决义务 cancel）；个人破产（`event(judgment: insolvency, target: person)` → owns / share / leases / operates / tamed_by / commands 转入 `liquidation`，豁免额按民事①；人不消失）；受限（`guest_of{detained}` 开立 → companion 对东道以外 close）；脱逃（`guest_of{detained}` 的 `self.closed(escaped)` → 案件回 pursuit、wanted 续期）；主权易手（`administers` 的 `subject.transferred(governs)` → 按新法典 `conquest` 条款，04 §4.2）；临时监护（`event(status_applied: impaired)` 于 guardian_of 持有人 → succeed 临时）；同行者（companion 持有人离开 → close）。

**承接实体的程序阶段（遗产 / 清算，04 §4.4）**：`notice` 公告 → `filing` 申报 → `settlement` 清偿 → `distribution` 分配 → `closed` 关闭；期限是法典程序数据，可为 0（简易程序）。

## A.5 规则形状

**四种规则形状**：派生、反应、时钟、动作。
**四种声明式规则形状**（存放在已有概念里，不是存储概念）：规范条目（含补丁）、修正项、推断规则、自治候选。

**反应规则的优先级类（4，14 章）**：`settlement` 结算（协议子步、货损、冲回、记账）→ `legal` 法律（合法性标注、嫌疑记录）→ `social` 社会（印象、传闻、记忆、状态评价）→ `autonomy` 自治（NPC 与组织的决策提案）。

**同刻阶段（5，14 章）**：外部提案 → 到期项 → 时钟规则（末尾有子步 3′ 争夺裁决：互斥标的的同刻提案按 `contest` 规则统一裁决，§A.15）→ 反应队列 → 刻末断言。

**到期项类（6，按序）**：协议续步与承接实体阶段 → 义务 → 案件阶段 → 组织计划阶段 → 效果与状态到期 → 许可 / 托养 / 封印维护到期。

## A.6 效果原语（19 个，14 族）

定义与校验表在 06 §6.3。族：transfer、holding（open/close/transfer/**rescale**）、obligation（create/settle/cancel）、fact.set、vital、status、move、create、destroy、emit、schedule、transition、learn、time。`holding.rescale`（第三轮新增，R3-S7）：在一个事务内改写同一标的全部份额类持有（share / owns）的份额表，sum 仍为 1.0；用于增发稀释、判决改分、合伙增资；发起者须是组织权能（章程 `authority.issuance`）或判决，且受影响持有人同意或章程表决通过，否则拒绝并给世界内原因（E08② 副手擅自增资因此无效）。原语产生的事件动词与社会动词分开：原语 `transfer` 的事件动词是 `transfer`；社会动词"转让"记为 `convey`（待吸收 S0 第 2 条）。`schedule` 的参数 `via: npc-autonomy` 表示"把该动作交给该 NPC 的决策规则，而不是直接执行"（05 §5.7）。

## A.7 规范层（05 §5.2）

**规范栈层级（5）**：`contract` 合同、`subordinate` 次级属地、`sovereign` 主权、`membership` 成员、`personal` 属人。**补丁**（`patch`）不是层：它在条款选中之后、求值之前修改条款结果（05 §5.2.8）。

**规范条目内容类型**（词汇族 `clause:*`，开放；core 预置 11）：罪名 offense、民事 civil、程序 procedure（含 `conquest`、`limitation`、`neBisInIdem`、`sentencing`、`summary`、`lostInstrument`）、税表 tax、授权表 delegation、豁免 exemption（core 预置 `incapacity`、`involuntary_act`、`self_defense`、`necessity`，谓词见 05 §5.2.4）、冲突法 conflict、兼任 plurality、合同效力 contract_validity、认可 recognition、**查表 schedule**（第六轮：俸禄表、额度表、职位表、聚落等级线等"职级 × 聚落等级 → 值"的表，`{table: salary | quota | offices | settlementRank | …, rows, thresholds?}`；治理包的表在纪元边界注入为法典事实，议案 `norm` 可改，派生读规范栈而不读包数据——E20 备注"削减俸禄"由此可行）。包可加新内容类型（带上位词），core 消费者按上位回退。各类条目的字段：
- **税表条目** `{base: trade | toll | poll | property | …, commodity?: goods:*, subjects?: cargo | companions | mounts | persons（通行费对什么计，缺省 cargo + persons；随行活畜按物种 `goods` 计税，R7-M10）, rateBps | flat, recipient, split?, exemption?, collection?}`：`recipient` 取 `treasury`（法域公库，缺省）| `controller`（节点 `controls` 持有人）| `office:<职位>` | `holder(permit:<种类>)`；`split: [{recipient, bps}]`；`exemption: {per: person | household | party, window: 天数, qty, counter: countEvents(...)}`。通行费与关税由节点规范栈的税表条目派生，`controls` 持有本身不收钱（01 §1.5）。**`collection`**（第六轮，征管层）：`automatic`（缺省：反应规则按真实数量直接转移，税吏不介入）| `assessed{assessor: 职位, inspection: {check: RX（读税吏 `effective` 与 `dutyOfCare`、货物 purports、隐匿检定）, coverage: 0..1}}`：应税事件只产生**申报子事件** `declare`（纳税人可 deceive 低报，按 purports）→ `tax` 义务按申报额创建 → 税吏查验（检定 / 时钟抽查）查获差额则补征并命中 `offense:tax_evasion`；税吏不查即放行 = 以职位 actedAs 的 `release` 事件，`negligent` / `bribery` 谓词读它；| `farmed{farmer: holder(permit) | controller, quota}`：收款人为包税人，包税人对公库负固定 `tax` 义务 quota。派生 `taxDue(事件或期间)`（应征）与 `taxGap(法域, 期间)` = Σ 应征 − 实收，稽查与审计动作读它（15 §15.7）。
- **认可条目**（第五轮泛化为"对任何东西的承认"，根因分析 (d)）`recognition: [{what: holdingKind | obligationKind | resource | instrument | certification | identity | personhood | resurrection | calendar | rite, selector?: RX（对缔结快照、持有人、来源法域、`convertedFrom` 求值）, effect: recognized | void | conditional{terms}}]`（第六轮加 `personhood`：被承认人格的 creature 可持 citizen_of / resident_of、不可被 owns、计入人口；`resurrection`：神迹复活在本法域是否产生 `restored`；`obligationKind` + `convertedFrom`：卸载转换后的义务在各法域有效或无效，12 §12.5.4）；`recognized(x, j)` 按栈序取第一条命中者，无条目缺省 recognized（§A.15）。core 预置字段组是它的特例：`legalTender: {unit: 任一资源, accepted}`、`demonetize`（随 time 变化的承认，15 §15.3）、`instruments`、`issuers: {mint, notes, minReserveRatio}`（谁能引用 `src:mint` / `src:issue`）、`certifications`（承认哪些认证职位——第三方认证的承认由此，也是"执业须经本地承认"的落点）、`marriages`（承认外地婚姻的形式要件）、`calendar`（本法域用哪部历法）、`units`（显示单位表）、`rites`、`crossRealm`。
- **合同效力条目** 加 `authoritativeText: original | translated | each_party_language | terms_only`（缺省 `terms_only`：以条款快照为准，文本只作证据，05 §5.4）。
- **程序条目**（第五轮）：`conquest = {governance: dissolve | retain | replace(org), offices: vacate | retain, treasury: seize | retain, fiefs: retain_disputed | revert}`，由**新主权**法典给出、条约 `allied_with` 条款可覆盖，04 §4.2（R7-S2）；`limitation`：民事时效与追诉期 `{claimKind | offense → days, tolling: [{when: RX（债务人或被告不在本法域 / 持有 wanted / capacity none / 未成年）, mode: suspend | reset}]}`，从行为时起算、按查询时条款判断届满（程序从新，R7-M5；第六轮加中止与中断）；`neBisInIdem`：跨法域同一事件重复立案的缺省 `credit`（已执行刑罚额计入量刑）| `bar` | `none`（R7-L11）；**第六轮**：`sentencing = {multiple: concurrent | consecutive, recidivism: RX（读 `countEvents(judgment, 同被告, 窗口)`）}`；`summary = {offenses: 罪名族, by: 职位}`（行政处罚：命中族的案件由该职位持有人直接判决、跳过审理、可上诉）；`lostInstrument = {noticeDays}`（挂失公告期，01 §1.4）；`estateAdministrator`（遗产执行人顺位，§A.15 执行人）。

**民事条款族** `civil:*`（开放；core 预置十类，法典完整性校验只要求 core 十类齐全或显式 `inherit`，包加的类自带缺省）：
① 清偿顺序与破产（含偏颇清偿撤销期、简易程序期限、个人破产的豁免额 `exemptAmount` 与免责；**承接实体关闭后新发现的债权**：缺省向各继承人在其 `liabilityCap` 内按份额追偿，法典可定 `reopen`，R7-M5；**抵销 `setOff`**（第六轮）：同两方互负已到期债务时，任一方动作或承接实体清偿阶段按较小额互相 settle，同事务两笔、不经账户）；② 继承（继承表、遗嘱 `testament`：形式要件、特留份、效力顺序"有效遗嘱 > 继承表"、受遗赠人 legatee（可为任何实体，顺位在债务之后、继承人之前）、`onDebtorGone` 覆盖、限定继承、放弃期限、同时死亡推定；只计 `recognized` 的 kin 与模板 `inheritance: true` 的实体）；③ 婚姻家庭（婚姻财产、离婚分割 `divorce`、婚约 `betrothal` 与配偶 restored 时的处置 `betrothalOnRestore: void | voidable`、重婚（core `kin:spouse` 缺省 `incompatibleWith{kind: kin:spouse, policy: forbid}`，法典可放宽）、监护顺位（可列职位或组织））；④ 行为能力、同意与代理（第六轮：`majority: {动作族 → 年龄}` 成年年龄表、`capacity` 为 limited 时各动作族的效力 `limitedActs: {族 → void | voidable | pending(guardian)}`、紧急救治、同意代理、代理权范围、越权行为的追认期限、**表见代理 `apparentAuthority`**：第三人知情集合含授权 tell 或文书且不知撤销 → 对第三人有效、本人向代理人追偿）；⑤ 宽限 `grace`；⑥ 担保与风险负担（质押物被盗、担保与冻结的优先、留置 `lien`：占有人对标的开立 pledged 的条件、幻象物与伪造物的风险负担）；⑦ 股东责任与增发 `issuance`；⑧ 侵权责任（过错 / 无过错 standard、共同侵权 `joint: proportional | solidary`、替代责任、**诽谤 `defamation`**：`lie` 标签的 tell 在起因链上导致第三方对受害人的负向 impress → compensation 与更正）；⑨ 救济与第三人效力（撤销、返还、返还不能折价、强制履行、**善意取得**（输入：取得方 `¬knows(处分人无权)` ∧ 有偿 ∧ 标的非 `taint` 批次；无权处分见 §A.15 占有）、诈害行为撤销、**不当得利 `unjust_enrichment`**（无法律原因的转移——`validity` 为 void 的行为的对价、错付——→ 返还义务）、**无因管理 `negotiorum_gestio`**（无 mandate 而为他人利益的必要支出 → 受益人负 compensation）；**损失填补**：同一损失的赔偿与保险给付总额 ≤ `value` 评估，超出部分由后付者向先付者代位，R7-M12）；⑩ 物权取得（遗失物报官期限与报酬、先占无主物、时效取得、残骸无人认领期限、**添附 `accession`**：加工后新物归材料主或加工人（按 `value(新物) ÷ value(材料)` 阈），另一方得补偿、**征用 `expropriation`**：标的与补偿对象按决议 `frozen.asOf` 时刻的持有人确定，补偿 = 该时刻的 `value`）。

**程序成本**（程序条款的一部分，第三轮，R3 专项②第 7 条）：`procedure.costs = {filingFee 讼费（transfer → 法域公库）, freezeBond 申请冻结的担保（质押或现金，败诉时赔付被冻结方）, loserPays 败诉方承担对方讼费与讼师费的比例, vexatious: {within, count} 同一指控人在期间内败诉或撤案达 N 次后受理裁量加严并可构成 offense:vexatious_litigation}`；缺省值由 core 法典数据给出，可为 0。

**案件种类**（词汇族 `case:*`，core 预置 5）：`criminal` 刑事、`civil` 民事、`insolvency` 破产、`declaration` 宣告（失踪 / 死亡 / 撤销）、**`capacity` 行为能力**（第六轮：申请 → 鉴定（检定动作，读医者技能与症状）→ 判决对本人施加状态 `capacity:limited{scope}` 或 `capacity:none` 并开立 guardian_of（持有人可为亲属、职位或组织）；效力只及此后的行为，此前行为按民事④事实认定；恢复 = 撤销判决 → 状态解除、持有 close；05 §5.2.7）。**刑事程序阶段（7）**：suspicion 嫌疑（私密记录，不是案件）→ accusation 指控 → filing 立案 → pursuit 缉捕 → trial 审理 → judgment 判决 → execution 执行（上诉为分支；执行阶段的原语因被告不在场可及而失败时，阶段回到 pursuit、`wanted` 续期、执行到期项重登记，05 §5.2.7）。

**议案结果类型**（词汇族 `resolution:*`，core 预置 3）：`norm`（对本组织规范条目 fact.set）、`execute`（以组织权能执行一个注册动作）、`appoint`（任免）。**议案状态（7）**：proposed、adopted、pending_approval、approved、rejected、lapsed、executed。

**罪名与侵权角色**（词汇族 `role:*`，core 预置 5；每个角色是一条谓词模板数据，05 §5.2.3，包可加）：principal、accomplice、instigator、negligent、vicarious。

## A.8 主观视图（05 §5.4）

主观视图是视角 `frame.observer` 轴的特例（§A.15）。**四域**：自知域（此刻能直接感知的：自己的身体与状态、自己的全部身份键、随身账户与物品——可替代物按批次 `purports` 显示（§A.15）、在场的持有与义务对手方、自己发起的事件、自己签过的条款快照）、可观测域（当前所在地点此刻的公开状态：报价与工价、天气、在场者（按 `identify()` 认出的身份键）与可见活动、公告、本地路况）、知情域（知情集合中最新版本；他人的事件按观察者认出的身份键归档）、先验域（模板缺省）。**不在场的持有与义务的状态**（已清偿 / 违约 / 作废 / 对方消失）属于知情域，不属于自知域。NPC 决策只读这四域（I25）。

**知情来源（5）**：见证、被转述、阅读文书、作者知情种子（开局 / `pack.install`）、聚合传闻（统计层聚落公共知情的抽样，可回溯到原事件）。

**tell 的通道（8）**：face 当面、letter 带信、notice 公告、caravan 商队、bard 吟游、dream 托梦、oracle 神谕、omen 异象。通道表是 extend 扩展点（12 §12.2.3）。

## A.9 开放扩展（12 章）

**开放性宪章**（第五轮，根因分析 (a)；12 §12.2.3 据此改写）。扩展点不再是清单，而是五条规则；一样东西是否可扩展由它的**声明**决定，缺省开放：
1. **表开放**：凡 core 或包声明为数据表的（`rules/tables/*`、法典条目、章程字段、物种、配方、失真表、通道、文化记录、基线表、估值表、历法），任何包可加行（add / extend），不能改删他人的行；core 规则读**全部已装包的表**，不读 core 一张表。声明 `closed: true` 的表（原语表、模板矩阵）除外。
2. **族开放**：凡枚举都是词汇族（`offense:*`、`civil:*`、`clause:*`、`case:*`、`resolution:*`、`role:*`、`reason:*`、`basis:*`、`need:*`、`goods:*`、`super:*`、`passage:*`、`channel:*`、`mark:*`……），包可加带上位词的词；core 规则按上位回退匹配，新词不会落地无声（12 §12.3.3）。`closed` 的族只有原语、模板、不变量编号。
3. **派生缺省开槽**：每个派生值（core 与包的）自动是一个修正槽，自动有读函数 `derived(id, x)`，可挂修正项（阶段与 bounds 由派生方声明，缺省 `mul ∈ [0.5, 2]`）；只有声明 `closed` 的派生（守恒量、合法性认定、随机、`effective`）不开。§A.16 是 core 派生值的 bounds 数据，不是"允许开槽的白名单"；"新增槽"不再需要引擎或契约版本。
4. **定义可补丁**：任何已注册定义（法典条款、动作、持有种类、义务种类、物种、配方、章程）接受受控**补丁**（05 §5.2.8）：缺省允许追加型（追加前置、追加不相容、豁免、收窄条款范围），改写型（mul / add / reduce）按目标 `patchable` 声明，`reserved` 拒绝一切；合成与加载顺序无关（I24 / I27），每条补丁带世界内原因。规范补丁、动作前置补丁、修正项是同一机制的三个面。
5. **协议后续开放**：任何持有种类、义务种类、实体种类、法典可声明钩子（§A.4）；不新增触发。
**封闭的只有**：八个存储概念、19 原语、求解器算法、不变量、L0；以及安全边界——bounds、每槽与每源汇的预算、`reserved`、`closed`、合理性表、上限表。

**合并语义（4）**：add、edge、slot、extend（补丁文件按 extend 合并，作用方式见第 4 条）。**同一判定的唯一赢家**（第六轮，`decides`）：反应规则、动作、推断规则与表行可声明 `decides: <判定 id>`（例 `gambling:cheat_detected`、`medicine:diagnosis@症状`）；同一判定 id 由多个包声明时按槽位规则裁决（12 §12.4.4：overrides → profile resolve → E-CONFLICT-DECIDES，两包该项都不注册）；表行主键（表声明 `key` 字段）重复同样报冲突而不并集。未声明 `decides` 的规则各自生效（并集），这是缺省。
**卸载转换与法域**：包义务 `convert` 到 core 种类时带 `convertedFrom`，各法域经 `recognition{what: obligationKind, selector: convertedFrom}` 决定有效或 void（§A.7）——卸载策略不需要按法域分支。
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

## A.11 超自然与第二轮新增（13 章；approval、bounty 来自 05 §5.2.5 / 01 §1.4）

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
| 视角与派生（第五轮） | `frame`（当前视角 `{observer, jurisdiction, time, layer}`，§A.15；`withFrame({…}, expr)` 在表达式内切换视角——`withFrame({time: t}, holdings(x, 'kin'))` 回读 t 时刻的持有，含已关闭者，祖先回溯与"行为时持有"都用它）、**`derived(slotId, x)`**（读任一派生值——每个修正槽自动有此读法，不需要逐槽函数，R7-X8）、**`value(x, frame?)`**（统一估值，15 §15.2；`itemValue` / `wageQuote` / `creatureValue` / `landValue` 是其别名）、**`recognized(x, jurisdiction?)`**（承认派生）、**`identify(observer, x)`** / `identities(x)`（身份键）、**`authority(actor, op, target)`**（权能）、`units(jurisdiction, resource)`（显示单位）；**第六轮**：`capacity(x, 族)`（行为能力三档）、`validity(event, jurisdiction?)`（行为效力）、`possessor(x)`（占有人）、`executor(x)`（执行人）、`recall(x, event)`、`credence(listener, speaker, prop)`、`taxDue(eventOrPeriod)` / `taxGap(jurisdiction, period)`（§A.15、§A.7） |
| 视图 | `view(x)`（含 `view(x).combat` 等子视图）、`fact(x, field)`（含包的扩展事实 `fact(x, 'pack:field')`）、`trait(x, name)`（性格与价值排序项，0..1）、`holdings(x, holdingKind?, frame?)`（缺省只含当前视角法域承认的持有，`frame: {jurisdiction: null}` 读全部）、`holder(office)`、`members(org, filter?)`、`member(x, org)`、`rank(x, org)`、`present(a, b)`、`located(x)`、`zone(x)`、`distance(a, b)`、`reachable(a, b)`、`age(x)`、`lifespan(x)`（§A.16）、`species(x)`（物种数据记录）、**`effective(holding)`**（职能是否有效，§A.15）、**`impaired(x)` / `confined(x)`**（§A.3）、**`regime(x)`**（受限者所受的拘禁制度，§A.15）、**`canAct(x, actionOrFamily)`**（`capacity ≠ none` ∧ 受限制度允许；limited 者可发起，效力交 `validity`） |
| 选择器（有界） | `persons(selector)`、`entities(kind, selector)`、`county(place)`、`settlement(place)`、`exists(selector)`、`installed(packId)`（软依赖守卫） |
| 事件与原语 | `has(event, tag)`、`anyPrim(event, predicate)`、`prims(event)`、`crossesNode(event, scope)`、`cargo(entity)`、`cargoQty(entity, goods)`、`commodity(resource)`（商品类标签）、`tender(item)`（行使票据）、`causes(event)`、`actedAs(event)`、`salience(event)`（§A.15）；**事件窗口计数**（第四轮，R4-M2）：`events(selector, window)` / `countEvents(selector, window)`——读**真相事件索引**，selector 必须含至少一个索引键（actor / target / location 之一）与动词集合，`window` ≤ 上限（配置，缺省 365 天）；供税表免税额、常客识别、滥诉计数、状态类罪名、服务容量复用；不进主观视图。主观版本 `knownEvents(x, selector, window)` 只读 x 的知情集合（决策、推断、候选用它，I25）；候选或推断的 RX 调用 `countEvents` 在 P8 被拒（E-INV-I25） |
| 账户 | `account(x, res, purpose?)`、`lots(x, res)`、`taint(lot)`、`origin(lot)`、**`purports(lot)`**（批次表象，§A.15）、`capacity(x)`、`laborHours(business, period)`、`serviceCapacity(x)`（§A.16）、**`issued(currency)`**（流通中的纸币总额）、**`reserveRatio(issuer, currency)`**（15 §15.3） |
| 义务 | `obligations(x, role?)`、`due(o, t)`、`overdueCount(o)`、`overdue(o, days)`、`grace(o, t)`、`consent(from, to, scope)`（§A.15 同意查询） |
| 规范 | `jurisdiction(place)`、`code(place)`（主权法典，`code(place).clause(type, key)` 同 `clause(normStack(…), …)` 的主权层简写）、`normStack(actor, place, t)`、`clause(stack, type, key)`、`recognizes(jurisdiction, thing)`（含 `recognizes(j, actor, 'issuer')`）、`evidenceScore(case)`、`succession(office)` |
| 立场与知情 | `standing(a, b, dim?)`、`knows(x, event)`、`believes(x, prop)`、**`knownHoldings(x, target, holdingKind?)`**（x 知情集合中可见的 target 持有，§A.15 传导门控）、`subjective(x).field`、`quoteKnown(x, place, goods)`、`publicKnowledge(settlement)`、`canCommunicate(a, b)`（§A.15 语言）、**`canRead(x, item)`**（识字 ∧ 文书语言熟练度，§A.15） |
| 市场（15 章） | `price(place, goods)`、`settlePrice(place, goods, qty)`、`value(x, frame?)`（统一估值，别名 `itemValue` / `wageQuote(place, skill, tier)` / `creatureValue` / `landValue`，15 §15.2）、`rate(place, coinA, coinB)`、`ppi(place)`、`interestRate(bank, borrower)`、`credit(region)`、**`recipe(id)`**（配方表项，01 §1.6） |
| 决策 | `npcDecision(request, terms)`、`need(x, kind)`、`utility(...)`、`explain(x, decision)`、`urgency(request)`（§A.15） |
| 军事与组织（05 §5.10） | `strength(org)`、`supply(org)`、`leverage(orgA, orgB)`、`deterrence(party)` |
| 时间与骰 | `now()`、`days(a, b)`、`season()`、**`month(t?, calendar?)` / `year(t?, calendar?)` / `calendarDate(t?, calendar?)`**（历法投影，§A.15；缺省历法 = 视角法域的 `recognition.calendar`）、`window(id)`（阈限时间窗，读历法锚）、`roll(key)` |
| 超自然（13 章） | `efficacy(rite_or_item, being)`、`trueName(x)`、`sympathyLink(item)`、`afterlife(person)` |
| 集合与数学 | `filter/map/some/every/count/sum`（有界）、`min/max/clamp/round/floor/abs`、`log/exp`（引擎提供的确定性定点近似） |

正文示例中带包前缀的函数（`luquan:warrantCover`、`shipping:routeHasStorm` 等）是包在 `rules/derivations.json` 声明的派生，不在本表；不带前缀又不在本表的函数名在 P7 报 E-RX-UNKNOWN。本表是**最小保证集**：任何派生值（core 或包）都可经 `derived(id, x)` 读取，任何可定价物都可经 `value(x)` 读取，任何承认问题都经 `recognized(x, j)`，所以"读 core 的某个派生"不再需要为它新增函数（根因分析 (a) 第 3 条）。

## A.14 编号约定

走查题号带轮次前缀：R1-E01…R1-E20（run-001）、R2-E1…R2-N8（run-002）、R3-E1…R3-N5（run-003）、R5-E01…R5-N8（run-005）、R6-E1…R6-N8（run-006）、R7-E1…R7-N8（run-007）；"指南N*"指开发指南 v2 的 NPC 验收编号。审查意见编号：A-Cn / A-An / A-Bn（run-003 审查 A）、B-Mn / B-Sn / B-§3.n（审查 B）；R3-Cn / R3-Sn / R3-Mn / R3-Ln（run-005 审查的矛盾、严重、中等、轻微条目，"R3"指第三轮修订）；R4-Cn / R4-Xn / R4-Sn / R4-Mn / R4-Ln（run-006 审查的矛盾、不一致、严重、中等、轻微条目，"R4"指第四轮修订）。

## A.15 关键派生的定义（此前只被使用、未被定义的词；第五轮加视角、承认、身份键、估值、历法、权能）

- **视角 `frame`**（第五轮，根因分析 (d)(f)）：一切"有效吗、被承认吗、知道吗、算多少、在哪一层"的问题都不是存储字段，而是在一个视角下的派生。`frame = {observer?: 实体, jurisdiction?: 地点或法域, time?: 时刻, layer?: 智能 | 规则 | 统计}`，四轴各有缺省（observer 缺省为内核真相；jurisdiction 缺省为标的所在地；time 缺省为现在；layer 缺省为所在地区层级）。每个只读 API 都接受 frame；内核只存一份真相（持有、义务、事件、账户），不存任何"按谁看"的副本。四轴各自的特例：**observer** → 主观视图四域（05 §5.4）、物与批次的表象 `purports`、人的身份键 `identify()`、立场传导的知情门控、主观报价 `quoteKnown`、单位与称呼的显示；**jurisdiction** → 规范栈（05 §5.2.2）、承认派生 `recognized`、单位表、年号、计价单位；**time** → 行为时法（罪名、合同效力按事件时刻的规范栈与条款快照）、`effective()` 按此刻、时效 `limitation`、纪元（注册表版本）；**layer** → 聚合变体（07 §7.3）、见证模型（I30）、公共知情。**通则——实体性问题从旧、程序性问题从新**：凡由一次行为确定的效力（罪与非罪、合同有效与否、婚姻 / 认证 / 持有是否成立）按行为时的 frame 冻结进条款或缔结快照；凡"现在怎样处理"（程序、宽限、清偿顺序、税、承认、拘禁制度）按查询时的 frame；时效从行为时起算、按查询时的程序条款判断。设计中不得再为某一类事实单独发明"版本 / 快照 / 承认"字段：新需求只需回答"按哪一轴"，并写对应的数据（法典承认条目、文化单位表、历法）。
- **承认 `recognized(x, j)`**（第五轮，R7-S4）：结构性持有（kin:spouse、certified、permit、registered、holds_office、owns、citizen_of）、凭证、货币、身份链接在开立时记**缔结快照** `concluded = {place, lawVersion, time, form, inName?}`（与义务条款快照同形，01 §1.3）。`recognized(x, j)` = 法域 j 规范栈中 `recognition` 条目（§A.7）按栈序取第一条命中者的 `effect`；无条目缺省 `recognized`。同一持有在两法域可得不同答案（部盟婚在王国无效），持有本身只有一条。消费者：继承表只计 recognized 的 kin（04 §4.4）、出生户籍条款、弹劾与罪名谓词（`holdings(x, kind)` 缺省按视角法域过滤）、开店与执业资格读 `recognition.certifications`、法定货币与改币（`demonetize` 是承认随 time 变化的特例）。判决"婚姻无效"= 该法域一条针对该持有的 recognition 事实（fact.set，可上诉），不关闭持有。
- **身份键 `identity`**（第五轮，R7-S1）：person / creature 的慢变事实 `identities: [{key, name, look: 外貌事实引用, since, until?}]`，缺省恰一个（本名）。事件归约时按行为者当时使用的身份键记 `actorAs`；见证者知情集合里该事件的"行为者"是其**认出的身份键**：`identify(observer, x)` 返回 observer 知情集合中与 x 的外貌事实或身份链接事件能匹配的键（认脸 = 曾当面见过该键；认人 = 知情集合含 `identity_linked{keyA, keyB}` 事件：换装被目睹、揭穿、自认、鉴定）。立场、嫌疑记录、指控、`wanted` / `frozen` 的目标、账簿对手方、以某身份签的条款快照 `inName` 都可以引用身份键；法域执行（通缉核验、冻结存款）只能作用于该法域**承认链接**的实体（执法者知情含链接事件 ∨ 法典承认的鉴定），所以"石三"的通缉与存款冻结不自动落到本名。揭穿 = `identity_linked` 事件进入知情集合，该观察者的两条链在主观视图中合并（印象相加，饱和函数照常）；真相层永远只有一个实体，守恒、义务两端、继承都按实体（I1、I7）。变形生灵的人形与兽形、`purports` 幻形、冒名顶替是同一机制（13 §13.4）。
- **估值 `value(x, frame?)`**：一个派生对一切可定价物（资源批次、物品个体、生灵个体、土地与资源点、建筑、股份、债权、劳务）给出以价值单位计的数；各种类的基准与因子写在估值表 `rules/tables/valuation.json`（可扩），公共因子为主观真伪与来历（frame.observer）、法域政策（frame.jurisdiction）、修正项（槽 `economy:value`）；公式在 15 §15.2。
- **历法**（第五轮，R7-S3）：L1 数据 `world/ontology/calendar.json`，可多部：`{id, epochMinute（元年元月初一的世界分钟）, months: [{id, days | daysRx}], leap: {rule: RX(year) → 插入位置与天数 | none, obligationsSkip: true}, eras: [{polity, name, fromEvent}]（年号是政体慢变事实，议案 `norm` 改）, anchors: {season, festivals: [{id, rule: 月序 + 日 | 月相 | 节气}]}}`；法域经 `recognition.calendar` 指定用哪部，缺省 core 一部。时钟仍只认分钟（01 §1.9）；`month`、`year`、`calendarDate`、`window` 都是投影，按视角法域的历法渲染。**累计一律以天为底**：利息、租金、俸禄、工资的闭式输入是 `days`，"按月"只指到期项的**锚**（下一个历法月的同日；闰月按 `leap.obligationsSkip` 决定是否单独成期，core 缺省跳过——闰月不单独计一期也不多算利息，与按日一致）；条款快照记 `calendar`，合同写"三年"按签约历法换算为天数写入快照 `terms.days`，所以改元、改历不改既有义务。节庆由 anchors 推算，一年只有一个端午。
- **钩子 hook**：见 §A.4；是协议后续的唯一开放点。
- **权能 `authority(actor, op, target)`**（第五轮，根因分析 (g)；第六轮加第六来源）：= 持有的 `derives.authority`（职位职权、经营权、监护代管、东道的拘禁制度）∪ 法典授权表 `delegation` ∪ 章程 `authority` ∪ 当前有效的执行类决议 ∪ 认可条目 `issuers` ∪ **存活且在 `scope` 内的 `mandate` 委托义务**（01 §1.4：受托人 = 债务人，以委托人名义的 op × target 在 scope 内即命中，`subdelegate` 允许时可转委托）；原语校验（06 §6.3）与"谁能施加 / 解除法律类持有与状态""谁能引用 `src:mint`""谁能执行决议"统一读它，返回命中的依据（可解释）。命中即 `actedAs` 记该来源；有职位 / 委托但 op 超出其范围 → 行为**成立**并标 `ultra_vires`（`validity` 按民事④ / 章程 `voidable` 判，可命中 `offense:abuse_of_office`）；完全无来源 → 拒绝并给世界内原因（财产处分例外见"占有"）。"谁能给动作加前置"不在此处：那是定义补丁（§A.9 第 4 条）。
- **行为能力 `capacity(x, 动作族)`**（第六轮，run-008 S5）：三档 `full | limited | none`。none ⇐ 失能状态（§A.3）或判决状态 `capacity:none`；limited ⇐ `age(x)` 未达视角法域民事④ `majority[族]`（缺省表：日常小额交易 12、签约与借贷 16、婚姻 16、立遗嘱 16、表决与任职 16，数据可改）或判决状态 `capacity:limited{scope}` 含该族；否则 full。`canAct(x, 族)` = `capacity ≠ none ∧ regime 允许`——limited 者**可以发起**提案，事件附标签 `capacity:limited`，效力交 `validity`。同意能力同口径：limited 者对精神类的同意需监护人（§A.15 同意来源②）。失智、醉酒、惊吓一类的部分能力由状态数据声明 `capacity: limited{scope}` 即可。
- **效力 `validity(event, j)`**（第六轮，run-008 S1 / S2 / S5 的汇合点）：对一次法律行为（obligation.create、holding.open / transfer、议案表态、遗嘱、同意）在法域 j 的效力 ∈ `valid | void | voidable | pending{by, until}`。它是 `recognized` 对**行为**的特例：读事件的描述标签（`capacity:limited`、`authority:none`、`ultra_vires`、`unauthorized_disposition`、`unconsented`、`forced`、`deceive`、`gestural`、`illusion`）与缔结快照，按 j 的民事④ `limitedActs`、合同效力条款、章程 `requiresRatification` / `voidable`、民事⑨善意取得求值；pending 到期未追认 → void，已履行部分按民事⑨返还。内核不存"有效"字段；"判无效"= 一条针对该行为的 recognition 事实（同持有的做法）。void 的行为所生义务对 `due()` 返回 0、持有的 `effective()` 为假，但事件、账户转移都已发生——返还是新的义务。
- **占有 `possessor(x)` 与无权处分**（第六轮，run-008 S1 / C8）：`possessor(x)` = x 的位置链上最近的 agent（随身者、容器的随身者）或其所在建筑的 `operates` 持有人；是派生，不是持有。原语 `holding.transfer(owns)` 与 `holding.open(pledged)` 的权能校验（06 §6.3）：发起者有 `authority`（所有人、代管、委托、判决）→ 正常；**无权但为 `possessor`** → 提案成立，事件与取得方持有的缔结快照标 `unauthorized_disposition`（`validity` 由民事⑨善意取得判：善意有偿取得有效、原所有人对处分人 compensation；恶意或无偿 → voidable 返还）；既无权也不占有 → 拒绝（"东西不在你手上"）。这让寄存物被当、代管人私卖、拾得物转卖都在世界里发生并留下可诉的事件，而不是在事务里消失。
- **执行人 `executor(x)` 与无位置实体的在场**（第六轮，run-008 S3 / C3）：每个 interim 与非聚落 collective 都派生一个执行人：estate → 法典程序 `estateAdministrator` 顺位（遗嘱指定 > 继承人顺位首位 > 法域官职）；liquidation → 清算人（债权人会议或法域官职）；project → 承建方 `operates` 持有人或发起人；motion → 章程中持有相应权能的职位持有人（05 §5.2.5）；case → 受理职位；org / polity → 章程 `treasury` 职位或首领。无位置实体的**在场** = 执行人在场，或在其 `seat`（托管账户所在建筑：遗产的宅第、工程的工地、公库所在衙署）内；`located(x)` 对这类实体返回 seat。transfer / obligation.settle 的在场校验据此判（15 §15.1.1）；义务条款 `autoSettle: true` 时债务人账户在 seat 且债权人在场即可自动付（14 §14.4），工程发工钱、遗产支取存款、公库收税由此不需要玩家在场。执行人消失或 `effective` 为假 → 顺位下一位；无人 → 该实体的提案停在待执行（与议案同口径）。
- **阈值事件 `threshold_crossed`**（第六轮，run-008 S4 / C2）：派生方（`rules/derivations.json` 的派生，或法典 `schedule` 条目）可声明 `thresholds: [{id, rx: 派生值 → 档位, hysteresis?, graceDays?}]`。引擎对单调随时间的派生（年龄、刑期）把跨越时刻登记为到期项（闭式预测），其余在该派生的输入事件之后重算；档位改变即发框架事件 `threshold_crossed{thresholdId, entity, from, to, at}`（幂等键 = 阈值 × 实体 × 方向；`hysteresis` 防抖；`graceDays` 内回到原档不发）。它是事件，不是存储：成年仍是派生值（01 §1.2 黑名单不变）。core 预置：`capacity:adult`（民事④ majority）、`settlement:rank`（法典 schedule `settlementRank` 的人口线，升降各一向，降级缺省 graceDays 90）、`life:lifespan`、`solvency`（资产 < 负债）、`population:zero`。消费者：钩子 `on: event(threshold_crossed)`、反应规则（降级 → fact.set 行政等级 → 既有"确保应有职位"规则随之裁撤或创建职位，俸禄与额度经 schedule 派生即变）。
- **行为归属**（第六轮，run-008 S7）：事件的 `actor` 永远是**意志来源**，`actorAs` 是行为时所用的身份键（§A.15 身份键）。附身期间（`possesses` 存活）宿主身体所做的一切：actor = 附身生灵，actorAs = 宿主的身份键（在场者认出的是宿主），宿主本人 `capacity` 为 none；罪名 roles 对 principal 命中附身生灵，宿主只在 `possesses.terms.consensual` 时按 `accomplice` 判。core 豁免 `exemption:involuntary_act`：`has(event, 'forced') ∨ (actor ≠ owner(actorAs) ∧ ¬consensual)` → 身份键所属实体免责，施加 forced 者按 instigator。贿银等转移仍真实落在宿主账户，追缴走民事⑨不当得利。
- **记忆可得 `recall(x, event)` 与采信 `credence`**（第六轮，run-008 S12 / S13）：`recall` 是开槽派生（槽 `social:recall`，基础式 = `salience(event) × 时间衰减(距今天数) × 年龄修正`，0..1）；主观视图的**知情域检索**与证人证言只取 `recall ≥ 阈` 的事件（遗忘 = 检索不到，日志不变）；自知域中"自己签过的条款快照"同受 recall，文书 records 不受（翻账本即重新读到）。**立场不经 recall**：印象读持有者知情集合中全部 impress 事件，只按事件权重表衰减（05 §5.6）——"七年之仇"不因遗忘细节而消失。`credence(听者, 讲者, 命题)`（槽 `social:credence`）= 信任维度 standing × 命题先验（文化记录的可信度表）× 讲者利害（自述对己有利 → 折减）；知情域取版本时权重 = 来源等级（见证 > 转述 > 传闻）× credence，低于阈值的说法只作 belief 候选而不覆盖已有说法。
- **显著度 `salience(event)`**：事件头的一个定点数 0..1，归约时冻结写入。`salience = clamp( 动词基础显著度（词汇表每个动词的数据）× 分量乘子 × 幅度乘子 )`：分量乘子取参与者中最高的"持有分量"（职位职级、组织规模、首领、与玩家有持有/义务/强立场 → 数据表）；幅度乘子 = 事件数量（金额、伤害、人数）÷ 本地同类中位数，分段表。用途：传闻自动生成阈值、公共知情截断、NPC 记忆排序、D1 分级、预兆判定（14 §14.8）、返场摘要。显著度不参与任何守恒或裁决。
- **钉住 `pinned(x)`**：实体被钉住当且仅当：(a) 日程堆上有指向它的到期项（义务、案件、效果、许可、协议阶段）；或 (b) 它处在一条注册时声明 `pins` 的持有的**被钉侧**（第四轮，R4-X2：`pins: holder | subject | both`，缺省 `none`；core：holds_office（holder）、controls（holder）、wanted（subject）、banished（subject）、guest_of{detained}（holder；东道为 person 时 both）、custody_of（holder）、companion（both）、frozen（subject：被冻结持有的持有人与账户所属实体）、pledged（subject：质押物的 owns 持有人）——case 与 obligation 本身不是钉住对象）；或 (c) 它 `owns` 一个**模板声明 `pins: true` 的物品个体**（第四轮收窄，R4-L10：core 为带 `teaches` 的书与手札、带 `sympathyLink` 的媒介、署名杰作；契据、账簿、信件等文书与普通工具不钉住——否则每个有地契的农户都进规则层；E12③ 持手札的商人仍在规则层逐日自治）；或 (d) 它与玩家有持有、义务或强立场（07 §7.2 的智能层"相关实体"）。resides、kin、citizen_of、member_of、devotee_of、employed_by 不钉住（成员以聚合计；组织本身若有职位持有人则经 (b) 钉住）。钉住实体无论所在地区层级，至少按规则层处理自己的规则；(d) 类（与玩家相关）按智能层处理（07 §7.2，R7-X15 统一口径）。
- **聚合变体 aggregate variant**：跨层规则在统计层的等价形式，schema：`{"aggregate": {"target": 聚落级账户或子账户或率字段, "closedForm" | "step": …, "split": 物化时按种子把聚合量分配给个体的规则, "merge": 并回时把个体量计入聚合的规则, "tolerance": 容差}}`；声明 `"aggregate": "auto"` 时引擎用缺省变体：只含 transfer / 数值 fact.set 的规则，对聚合账户按"个体规则 × 聚合人数"执行同一闭式，split/merge 按比例，容差取 B05.2 缺省——这让多数 rules 档作者不必手写聚合变体（07 §7.3 第 7 条）。
- **同意 consent**：动作裁决的一个**输入**（06 §6.5 第 3 步），不是事务校验。来源三种：①本人当面同意事件 `consent_given{from, to, scope: 动作族或动作 id, until?}`（可由 `consent_revoked` 撤销；NPC 由 `npcDecision` 给出，读立场、关系、灵智与处境，不自动同意；玩家由界面或叙述给出），②代理同意（guardian_of、章程授权的职位、scope 含该动作族的 `mandate` 受托人，受民事④范围限制；本人 `capacity` 为 limited 时精神类与财产类的同意须由代理给出或追认，为 none 时只有代理与紧急两种来源），③法典紧急条款（民事④：哪些状态、哪些动作族免同意）。查询 `consent(from, to, scope)` 返回 有 / 代理 / 紧急 / 无。**无同意的结果**：动作照常裁决，但改为对抗检定（目标的意志 / 灵智 / 抗性 vs 行为者），事件附描述标签 `unconsented`（强制类另加 `forced`，记忆改写类加 `memory_altered`），罪名由规范栈判定——core 法典数据把人对人的强迫与改记忆定为重罪（`offense:coercion`、`offense:memory_alteration`，上位 `offense:harm`），治疗与辅助类的无同意施加按 `offense:unconsented_magic` 轻罪或豁免（法典数据）。生灵来源的 `unconsented`（附身、迷惑、作祟）不构成人间罪名，但人借生灵对人施加仍是人对人（13 §13.4）。
- **语言与沟通 `canCommunicate(a, b)`**：语言是技能族 `lang:*`（文化记录给母语，熟练度 0..3），沟通度 = 双方共同语言的最低熟练度，或经在场 companion 通译（通译的熟练度，事件记 `actedAs: interpreter`）；沟通度为 0 时对话、交易、请求、议价动作降级为"手势交易"（只能完成等价物交换、不能议价、不能缔结带条款的义务；欺骗与劝说的难度 +5），事件带标签 `gestural`。通译的回扣 = 通译以 actedAs 代办时的 `deceive` tell + 自留转移，识破走知情。**文书语言**（第四轮，R4-M1）：文书物品带事实 `language: lang:*`（缺省为写作者的母语；译本另带 `translatedFrom`、译者署名）；`canRead(x, item) = 识字技能 ∧ lang(item.language) 熟练度 ≥ 读写阈（数据，缺省 1）`；不满足时阅读只产生"看不懂的文字"知情（记文书存在与语言，不含内容），可由在场懂该语言者代读（tell(源 = 物品, actedAs: interpreter)，经失真表，可私吞可改译）或由译本代替（译本的 `records` 文本可与原件不同，由译者动作写入，`deceive` 可改译）；学会该语言后再读原件才得到原文——"复读契约发现问题"的触发点就是这次 canRead 为真的阅读。合同有多份语言文本时以哪份为准由法典 `contract_validity.authoritativeText` 决定（§A.7），条款快照仍是真相，文本只是证据。跨语言转述的衰减走失真表（05 §5.4，槽 `social:distortion`）。
- **紧迫度 `urgency(request)`**：请求事件 payload 的定点数 0..1，由动作声明的派生式给出（诊疗按伤情 / 病情严重度，救援按生命值，公务按期限），NPC 决策第 4 步"更急的事"读它；超容量的服务请求按紧迫度排队（§A.16 `service:capacity`）。
- **争夺 contest**：同刻多个互斥提案指向同一标的（exclusive 持有、声明 `contest` 的限量存量、开放债权人 `firstToSatisfy`、驻地、同一服务名额）时的裁决规则，由持有种类、义务种类、资源账户或动作声明 `contest: lottery | price | arrival | rank`，缺省 `lottery`（骰值键含序号，14 §14.5）；在刻内"争夺池"统一裁决，不按阶段先后，不按实体 id（14 §14.2，R3-L2）。争夺的单位是**整个提案**（事务原子）：提案含任一争夺型原语即整体登记到争夺池，裁决后整体执行或整体得到世界内原因（14 §14.2，R4 专项①）。
- **受限 confined 与拘禁制度 regime**（第四轮，R4-C1）：`confined(x)` 为真当且仅当 x 是一条存活 `guest_of{mode: detained}` 持有的持有人。受限者位置锁定于东道分区（随东道押解而动）；**行为能力与同意能力保留**；可及动作集合 = `regime(x).allows`——拘禁制度是 `guest_of` 持有的条款 `terms.regime`，引用东道一方的数据（典狱职权表 / 官府程序条款 / 绑匪的自定条款），形状 `{allows: [动作族或动作 id], suspends: [holdingKind] （覆盖 confined 列的缺省）, keepsEffective: [holdingKind 或 持有引用]（劳役的 employed_by）, visitors: permit 种类 | open | none, escape: {guards: 选择器, difficultyRx}}`。core 缺省制度 `custody.default`：允许对话、受教与授艺（learn / service，双方到场）、签约（obligation.create；效力由法典 contract_validity 可限）、动用随身账户（transfer；买通 = transfer + emit(request)）、结社与密谋（holding.open(member_of)、计划）、申诉 / 上诉动作、仪式参与（只能在东道分区内）；禁止离开东道分区（move 出分区只有两条路：东道以 actedAs 发起的押解 / 释放，或**脱逃**——对抗检定 vs `escape.guards` 的警觉与设施 condition，成功 → `holding.close(reason: escaped)` + 事件 `escaped`（起因指向脱逃动作）→ 反应规则把案件回 pursuit、`wanted` 续期）；职能暂停按交接类表 `confined` 列。探监 = 外人按 `visitors` 取得东道 permit 后 move 到东道分区。法律类受限（收监、羁押）的施加与解除只能经案件执行、有权职位的 actedAs 或到期项（06 §6.3，R4-M4）；绑架、俘虏是无权一方开立的 `guest_of{detained}`（合法性由规范栈判，E15② 已有）。
- **职能有效 `effective(holding)`**（第四轮，R4-X6 / M6）：一条持有存活不等于其职能可用。`effective(h) = alive(holder) ∧ h 未处于 suspend ∧ ¬impaired(holder) ∧ (¬confined(holder) ∨ h ∈ regime(holder).keepsEffective)`；权限、服务、日程片段、`laborHours` 都读它；代理规则在 `effective` 为假时承接（04 §4.6）。因职能而生的义务（salary）按 `effective` 为真的日累计（01 §1.4），与 wage 的"按实际工时"对称；法典可写 `salaryWhileSuspended: none | half | full`（缺省 none）。I29 不受影响：以持有人为债务人的义务照常到期。
- **立场传导的知情门控**（第四轮，R4-C2）：05 §5.6 的传导项只沿**持有者知情集合中可见的持有**传导：`visibility: 公开` 的持有视为人人可见（在可观测域 / 先验域）；`仅成员` / `仅当事人` 的持有只在持有者的知情集合含其开立事件、转述或文书，或持有者有相应 `belief`（可错）时才传导，查询 `knownHoldings(holder, target)`。于是秘密结社的会籍不会让不知情者的恶感传到该成员身上，而**误信**某人入会会传（I25 双世界口径：真相不同、四域相同则立场相同）。组织作为立场持有者时，其知情集合 = 章程指定的决策职位持有人（缺省首领）的知情集合 ∪ 组织文书（账簿、名册）。
- **批次表象 `purports(lot)`**（第四轮，R4-M7）：`lots: true` 的资源，批次元数据加 `purports`（该批次自称的资源种类或成色档，缺省 = 真实种类）。持有者的主观视图（自知域的随身账户、可观测域的货物）按 `purports` 显示，除非其知情集合含该批次的 `origin` 事件（铸造 / 掺假）或鉴定事件；成交与守恒永远按真实种类结算（I1）。"善意持有"= `¬knows(holder, origin(lot).event) ∧ ¬knows(holder, 鉴定事件)`，罪名谓词据此分善意与明知；受骗 = 按 purports 的报价付出对价而得到真实种类——骗局可表达，守恒不被绕过。core 铸币声明 `lots: true`，批次按 (发行者, 成色档, purports) 合并，正常铸币只占一个批次，所以批次数不膨胀；矿石仍不跟踪。

## A.16 core 派生值与 bounds 附表（契约附表 B；数据 `world/ontology/slots.json` 的摘录）

第五轮起**每个派生值缺省就是槽**（§A.9 第 3 条）：本表不再是"允许开槽的白名单"，而是 core 派生值的 bounds、阶段与消费者清单；没列出的 core 派生值按缺省 `mul ∈ [0.5, 2]` 开槽，包的派生同样缺省开槽（在 `rules/derivations.json` 可声明 `closed` 或自定 bounds）。每行：槽 id、派生值、阶段、bounds、读它的 core 消费者（契约承诺：这些 core 规则必须读该派生值而不是绕过它）；每个槽自动有读函数 `derived(id, x)`。

| 槽 | 派生值 | 阶段 | bounds | core 消费者 |
|---|---|---|---|---|
| `economy:price` | 报价 value（15 §15.2） | add, mul, clamp | [0.2, 5]× | 出清、税基、估值 |
| `economy:yield` | 产量（作物 / 矿 / 工坊；输入含在岗工时） | add, mul, max, min, clamp | [0, 3]× | 生产规则、停工反应 |
| `economy:value` | 统一估值 `value(x)`（15 §15.2）；修正项 `when` 可按 `kind(x)` 选择；`economy:artifactValue`（物品个体）、`economy:wage`（劳务）、`economy:livestockValue`、`economy:landValue` 是它的选择器别名 | add, mul, clamp | 按种类：物品 [0.1, 20]×、劳务 [0.3, 5]×、土地与生灵 [0.2, 5]× | 当铺、拍卖底价、以物抵债、损失评估、遗产估值、雇佣缺省条款、用工 / 辞工候选、地价与畜价、工程用工成本、统计层工价聚合率 |
| `economy:coinCredit` | 发行信用（15 §15.3） | mul, clamp | [0.2, 1.5] | 铸币价值 |
| `economy:restock` | 商号进货量与周转保留（05 §5.1 商号经营） | add, mul, clamp | — | 商号自治候选 |
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
| `social:recall` / `social:credence` | 记忆可得 / 采信（§A.15，第六轮） | mul, clamp | [0, 1] | 知情域检索、证人可信度、tell 版本采纳 |
| `tax:inspection` | 税吏查验检出概率（`collection.assessed`，§A.7） | mul, clamp | [0, 1] | 查验检定、`taxGap` |
| `hydrology:split` | 河段多出边的分水份额（05 §5.5） | mul, clamp | 和归一 | 水量传递 |
| `super:efficacy` / `super:activity` / `super:hauntPressure` / `super:sealDecay` | 13 章 | mul, clamp | — | 仪式、作祟、封印 |
| `world:pace` | 节奏系数（只向 paceable 槽提供） | — | 档位表 | 派生合成器 |

新增一行只是登记 bounds（数据），不需要契约版本；包不能改 core 派生的 bounds，但可以给自己的派生声明任意 bounds；`pack doc` 的"接口缺口"报告列出包想影响而 core 声明为 `closed` 的派生。修正项可声明 `exclusiveGroup`（同组只取一个：按 `priority` 字段，同优先级取值最大者；R7-L12）。

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
