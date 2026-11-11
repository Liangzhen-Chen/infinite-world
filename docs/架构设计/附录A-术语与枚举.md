# 附录 A 术语与枚举（唯一定义处）

（本附录是全篇枚举与术语的**唯一定义处**；各章只引用、不重复列举。修订历史见 修订记录.md；元模式见 根因分析.md；按学科体系核对的条目见 学科覆盖表.md。）

## A.0 用词约定

- "种类"按对象分别写作：实体种类 `kind`、持有种类 `holdingKind`、义务种类 `obligationKind`、案件种类 `caseKind`、资源种类 `resource`；转移协议用"协议 `protocol`"（两条）、"起因 `basis`"（gone 的起因）与"`reason`"（持有变更的原因），不用"种类"；"触发"只在"协议入口"的意义上使用（下一条）。**原语参数与数据文件同此**：`holding.open{holdingKind}`、`obligation.create{obligationKind}`、`ontology/holdings.json` 的条目键是 `holdingKind`；凡写作 `"kind": …` 的地方一律指实体种类（例 `"kind": "org/sect"`）。06 §6.3、03 §3.3、12 §12.7.3 的示例已按此改写；校验器对持有与义务文件中出现裸 `kind` 报 E-SCHEMA 并给出改法。
- 表格中的"—"一律表示"该触发对该种类的两端模板不适用（不会发生）"，不是"无操作"。
- "同意"一词只指 §A.15 定义的**裁决输入**（有 / 无 / 代理 / 法典紧急条款），不是事务校验项；"精神类需同意"的旧说法在全篇改为"精神类读同意"（06 §6.5 第 3 步）。
- **附录先于正文**：任何新派生值、RX 函数、修正槽、枚举词、数据文件、协议钩子模板，先在本附录登记（§A.2 判别表、§A.4、§A.7、§A.13、§A.15、§A.16），正文只引用、不另行定义；正文示例中出现而本附录未登记的 `code` 标记在构建期报错（标杆 B16.5）。修订的历史叙述只进 修订记录.md，不留在各章正文。
- **"触发"一词**只指两条协议的入口：实体消失 `transition(gone)` 与持有变更 `holding.open / close / transfer`；在途、失能、受限、叛离、破产、征服、卸载都不是触发，是 `reason:*` 词或钩子条件（§A.4）。

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
| 饿不饿、累不累、渴不渴、宠物饱不饱 | **身体需求量**（§A.15）：person / creature 的慢变事实 `body`，按活动类闭式消耗、由进食 / 睡眠动作恢复、跨阈值发 `threshold_crossed` | 体力 20/100、饥饿、阿黄饱食度 |
| 宠物忠不忠 | **立场投影**的 `attachment` 维度（别名 `loyalty(creature)`，§A.15 身体需求量末条）；喂食、抚摸、挨饿都是 impress 事件 | 阿黄忠诚度 60 |
| 月钱、月息、按月的租 | **义务条款 `per: anchor`**（按锚计额，§A.15 期间口径）：每个历法月锚计足一期，不足一期按 `rateBasis` 折日 | 月钱 600 文、月息 0.5% |
| 收购价与零售价 | **商号经营条款 `spread`**（15 §15.2）：`quote(…, side: buy \| sell)` 两个方向、同一 `value` | 兔皮收购 6 文、零售更高 |
| 东西寄放在别人那里、代收的货 | **义务 `bailment` + 保管人账户用途 `held:<义务 id>`**（01 §1.4）；保管人私卖 = 无权处分 | 托运到粮行待取、寄存的粮 |
| 师徒、师门 | **持有 `mentor_of`**（01 §1.3；不是 kin，不进继承）；授艺本身仍是 service 义务或 learn 的同意 | 考官与考生有师承须回避 |
| 谁的法院能受理、两地同时告 | **程序条目 `forum`**（§A.7） | 握手契约在两国起诉 |
| 买三个馒头、卖五张兔皮到底多少钱 | **小额零售口径**（15 §15.2）：`q ≤ max(retailFloor, 本地有效存量 × retailShare)` 时（`retailFloor` 是商品类数据，缺省 5，使村铺买三个馒头不落入大宗）成交额 = `quote(side) × q`，只对总额向零取整一次；超过即大宗，沿稀缺曲线积分 | 馒头 4 文 × 3 = 12；兔皮 6 文 × 5 = 30 |
| 这间房今晚归谁、床位满了没 | **持有 `lodges`**（01 §1.3）：人 → 房间 / 床位地点节点，按夜（`until`）占用，节点 `capacity` 之内可开；"已被占"= 存活 `lodges` 数 ≥ `capacity` 的派生 | 单间当晚被占；通铺 8 个铺位 |
| 委托被谁接了、别人还能不能接 | **开放债权人的承接 `claim`**（01 §1.4 bounty 行）：承接动作把 `firstToSatisfy` 收窄到承接人直到 `claimUntil`，期内对他人不开放；到期未完成自动回到开放 | 村长的采药委托 |
| 信送到了，收信人什么时候知道内容 | **core 反应规则 `read_on_receipt`**（05 §5.4）：收件人在场且 `canRead` → 当刻阅读；不识字 → 自治候选"找人代读"；玩家收信只提示不自动读 | 孙二收到约见信 |
| 张贴的告示与当众宣告 | **告示 = 文书物品**（`records`，须 `canRead` 阅读，05 §5.4）；**公告 = 公开宣告事件 `announce`**（口头、当场，在场者入知情，属可观测域）；"张贴"只产生告示物品与"有一份告示"的知情，不产生公告事件 | 识字率 8% 的村里只有塾师读得懂告示 |
| 存单、完税凭据、收据、当票（不流通的凭据） | **凭据物品 `receipt`**：`represents` 指向义务或事件但不转让债权；义务条款 `requiresInstrument: true` 时支取 / 放行前置为出示该物品或走挂失程序 `lostInstrument`（01 §1.4 deposit 行、§A.7 征管流程） | 无存单不能取钱；关卡出具完税凭据 |
| 活期、随时可收回的贷款、浮动利率 | **义务条款 `callable` 与 `rate.floating`**（§A.15.6）：`call` 事件推进到期、`rate_reset` 事件结息并换利率，不追溯已计利息 | 钱庄抽资召回农户贷款；存息随行下调 |
| 以物抵债、折价清偿 | **`obligation.settle{with}`**（06 §6.3）按 `value` 或议定额折抵，须民事⑨ `inKindSettlement` 允许 | 米价腰斩时以米折银还债 |
| 几个人合力完成一桩悬赏 | **`firstToSatisfy` 可返回加权集合**（01 §1.4 bounty 行）：按完成事件 `causes` 权重拆成多笔 settle | 三人合击野猪王分赏 |
| 租来的仓库里堆的货、租来的铺子里的存货 | **承租人实体的账户、用途 `stored:<building>`**（01 §1.6）：价值位置取建筑，不随承租人迁移 | 帐篷迁走了，毛皮还在仓里 |
| 田里种了什么、种了几亩 | **田地事实 `sown: {crop, area, at}`**（01 §1.10）由播种动作写入；未播种的田不生长 | 春播两亩麦 |
| 淋湿、冻僵、中暑 | **暴露状态**：core 反应规则 `weather_exposure` 按天气槽与遮蔽施加状态（§A.18） | 冒雨赶路淋湿 |
| 路上发生的事归谁管 | **路线边 `jurisdictionRule`**（01 §1.5）：from / to / nearest / split(进度) 给途中位置一个节点法域 | 山道劫案、船上分娩 |
| 盖了一半的房子、停工的大殿 | **开工即 `create(building, condition: 0)`**，project 推进 condition（01 §1.4 project 行） | 半完工大殿雨季损耗 |
| 这条狗是谁的 | **`owns` 是法律归属，`tamed_by` 是驯服关系**（01 §1.3）：判决只动 owns；驯服在物种 `ownable` 时同事务开 owns | 判还后狗凭亲密度跑回 |
| 污染、酒糟排河 | **污染物是资源**（`pollutant` 标签）：只经配方 `byproducts`、人口 / 畜群 `yields.alive` 副产物或灾害进入账户，没有独立污染源（01 §1.6） | 酒糟污染下游水质 |
| 赃物、赃款 | **批次 `taint` 由 legal 类反应写入**（01 §1.6、05 §5.2.7）：嫌疑记录成立且事件含取得批次 → `fact.set taint`，转移按比例传播；销赃谓词另读 `knows` | 禁猎月的鹿肉算不算赃物 |
| 新生儿入哪一户 | **文化记录 `descent`**（13 §13.2，民事③可覆盖）：出生反应规则据此开 `household_member` | 渡船上生的孩子 |
| 日常动作要多久、累多少、好感加多少、一亩地打多少粮 | **core 缺省数据表**（§A.18）：只定形状与位置，数值留给实现与 BalSim 标定 | 买馒头约 5 分钟 |

## A.3 "人不在原处"的五种形态

五种形态**都不是协议触发**：它们是位置事实、状态或持有，效果全部由职能有效 `effective(h)` 与行为能力 `canAct(x, 动作族)`（§A.15）派生；持有种类不为它们声明交接列（§A.4）。

| 形态 | 概念 | 行为与同意能力 | 义务 | 日程与职能 |
|---|---|---|---|---|
| 在途、远行 | 位置事实（所在路线段 + 进度），`reason: moved` 只用于迁居类持有变更 | 保留 | 照常到期（I29） | 只有路上的作息；不在场的职能 `effective` 为假，代理承接 |
| 流放 | 持有 `banished`（政体 → 人）+ 位置 | 保留 | 照常 | 由章程 `removalTriggers` 决定是否解任 |
| 失能：昏迷、出神、被附身（疾病是否失能由状态数据 `capacity` 声明；"重病但清醒"缺省不失能） | 状态标记（失能类）+ 位置（原地；出神者的魂另有位置） | **为假** | 照常（宽限只来自规范 `grace`） | `effective` 为假（`suspend` 模板的含义），代理规则承接职能 |
| **受限：拘留、羁押、软禁、人质、俘虏** | 持有 `guest_of{mode: detained, regime}`（人 → 东道：官府组织 / 典狱职位所属组织 / 绑匪）+ 位置锁定于东道分区 | **保留**：能对话、受教与授艺、签约、结社、密谋、动用随身账户（买通）、申诉；可及动作集合由东道的**拘禁制度 regime** 决定（§A.15） | 照常（"羁押停息"只能是法典 `grace` 条款） | 并入东道日程；其他持有 `effective` 为假，除非在 `regime.keepsEffective` 内（劳役的 `employed_by`）；离开 = 东道押解 / 释放或脱逃检定（钩子 `self.closed(escaped)`） |
| 做客、被留（自愿） | 持有 `guest_of{mode: voluntary}`（人 → 东道）| 保留 | 照常 | 并入东道日程；随时可走 |

**失能与受限的分界**：失能回答"能不能思考与同意"，受限回答"能不能离开与行使职能"。两者可叠加（在押者昏迷 = 受限 + 失能）。监禁、俘虏、软禁、人质、隔离检疫一律是受限，不是失能。

## A.4 转移协议的枚举（04 章）

**协议（2）**：`transition(gone)` 实体消失（04 §4.2 全流程）；**持有变更** `holding.open / close / transfer`（带 `reason:*` 词，04 §4.1）。不再有第三种"触发"；新的转移时刻一律写成钩子。

**gone 的起因 basis**（词汇族 `basis:*`，core 预置 10）：`death`、`dissolution`、`destruction`（物、建筑、资源点，含船沉）、`extinction`、`declared`（宣告死亡判决）、`insolvency`（破产清算判决，组织）、`rested`、`reborn`、`aggregated`（个体并回种群账户，01 §1.6 个体化守恒对）、`pack_removed`。**回转 `restored`**（04 §4.5.1）：由撤销宣告判决、声明 `produces: restored` 的动作（神迹复活，受法典 `recognition.what: resurrection` 约束）或冥府还阳案件产生；不回滚事件，承接实体未关闭则终止，已分配者按现存利益返还；basis 为 death 时另恢复 vital、尸身 wreck 与亡魂实体 gone。

**持有变更的 reason**（词汇族 `reason:*`，开放，core 预置）：`vacated`（免职、辞职、退会、退租、放弃）、`defected`（叛离）、`transferred`（买卖、继承分配、征服）、`judgment`、`expired`（到期）、`escaped`、`released`、`pardoned`（赦免）、`divorce`、`conquest`、`pack_removed`、`moved`（迁居类）。reason 由钩子条件读取，不改变协议步骤。

**钩子 hook**（持有种类、义务种类、实体种类、法典在注册时声明，`hooks: [{on, when?, do}]`）：
- `on`：`holder.gone(basis?)` | `self.closed(reason)` | `holder.holdingClosed(holdingKind, reason)`（例：持有人的 member_of 因 defected 关闭）| `subject.gone(basis?)` | `subject.transferred(holdingKind)`（例：标的地点的 governs 换了持有人）| `event(verb, filter)`（例：判决 `insolvency` 对个人、状态 `impaired` 施加、**阈值事件 `threshold_crossed{thresholdId}`**——guardian_of 的 `event(threshold_crossed: capacity:adult, entity: subject)` → close，§A.15）。
- `when`：RX，读持有条款、法典条款（`clause(…)`）、持有人与标的视图。
- `do`：下表的钩子模板之一，或原语列表（在协议事务内执行，受 I6–I8 断言；失败整体回滚）。钩子与反应规则产生的 `obligation.create` 以**规则来源**（法典条款、章程、物种规矩、义务种类的 `default.effects`）为债务人同意的第四种来源，事件 `actedAs` 记该来源（06 §6.3）。
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

**core 预置的非简写钩子**（细节在 04 §4.3 备注列）：成年终止监护（`event(threshold_crossed: capacity:adult)` 于 guardian_of 标的 → close）；赦免（`pardon` 动作 → **本政体授予的** wanted / banished / guest_of{detained} close(pardoned)；只 cancel **债权人为公库**的 judgment 义务（刑罚、罚金）；债权人为原告的民事判决义务与 compensation **不动**——赦免不及受害者债权）；个人破产（`event(judgment: insolvency, target: person)` → owns / share / leases / operates / tamed_by / commands 转入 `liquidation`，豁免额按民事①；人不消失）；受限（`guest_of{detained}` 开立 → companion 对东道以外 close）；脱逃（`guest_of{detained}` 的 `self.closed(escaped)` → 案件回 pursuit、wanted 续期）；主权易手（`administers` 的 `subject.transferred(governs)` → 按新法典 `conquest` 条款，04 §4.2）；临时监护（`event(status_applied: impaired)` 于 guardian_of 持有人 → succeed 临时）；同行者（companion 持有人离开 → close）。

**承接实体的程序阶段（遗产 / 清算，04 §4.4）**：`notice` 公告 → `filing` 申报 → `settlement` 清偿 → `distribution` 分配 → `closed` 关闭；期限是法典程序数据，可为 0（简易程序）。

## A.5 规则形状

**四种规则形状**：派生、反应、时钟、动作。
**四种声明式规则形状**（存放在已有概念里，不是存储概念）：规范条目（含补丁）、修正项、推断规则、自治候选。

**反应规则的优先级类（4，14 章）**：`settlement` 结算（协议子步、货损、冲回、记账）→ `legal` 法律（合法性标注、嫌疑记录）→ `social` 社会（印象、传闻、记忆、状态评价）→ `autonomy` 自治（NPC 与组织的决策提案）。

**同刻阶段（5，14 章）**：外部提案 → 到期项 → 时钟规则（末尾有子步 3′ 争夺裁决：互斥标的的同刻提案按 `contest` 规则统一裁决，§A.15）→ 反应队列 → 刻末断言。

**到期项类（6，按序）**：协议续步与承接实体阶段 → 义务 → 案件阶段 → 组织计划阶段 → 效果与状态到期 → 许可 / 托养 / 封印维护到期。

## A.6 效果原语（19 个，14 族）

定义与校验表在 06 §6.3。族：transfer、holding（open/close/transfer/**rescale**）、obligation（create/settle/cancel）、fact.set、vital、status、move、create、destroy、emit、schedule、transition、learn、time。`holding.rescale`：在一个事务内改写同一标的全部份额类持有（share / owns）的份额表，sum 仍为 1.0；用于增发稀释、判决改分、合伙增资；发起者须是组织权能（章程 `authority.issuance`）或判决，且受影响持有人同意或章程表决通过，否则拒绝并给世界内原因（E08② 副手擅自增资因此无效）。原语产生的事件动词与社会动词分开：原语 `transfer` 的事件动词是 `transfer`；社会动词"转让"记为 `convey`（待吸收 S0 第 2 条）。`schedule` 的参数 `via: npc-autonomy` 表示"把该动作交给该 NPC 的决策规则，而不是直接执行"（05 §5.7）。

## A.7 规范层（05 §5.2）

**规范栈层级（5）**：`contract` 合同、`subordinate` 次级属地、`sovereign` 主权、`membership` 成员、`personal` 属人。**补丁**（`patch`）不是层：它在条款选中之后、求值之前修改条款结果（05 §5.2.8）。

**规范条目内容类型**（词汇族 `clause:*`，开放；core 预置 11）：罪名 offense、民事 civil、程序 procedure（含 `conquest`、`limitation`、`neBisInIdem`、`sentencing`、`summary`、`lostInstrument`、**`forum`、`recusal`、`review`、`remittanceDays`、`escrowCustodian`**）、税表 tax、授权表 delegation、豁免 exemption（core 预置 `incapacity`、`involuntary_act`、`self_defense`、`necessity`，谓词见 05 §5.2.4）、冲突法 conflict、兼任 plurality、合同效力 contract_validity、认可 recognition、**查表 schedule**（俸禄表、额度表、职位表、聚落等级线等"职级 × 聚落等级 → 值"的表，`{table: salary | quota | offices | settlementRank | …, rows, thresholds?}`；治理包的表在纪元边界注入为法典事实，议案 `norm` 可改，派生读规范栈而不读包数据——E20 备注"削减俸禄"由此可行；**聚落等级线**：`settlementRank.thresholds: [{rank, rx: RX（读人口、设施种类与 condition、税基——返回是否达标）, graceDays, hysteresis}]`，自动升降格与升格申请动作读**同一条 `rx`**：跨线即发 `threshold_crossed(settlement:rank)`，宽限期满自动 `fact.set`；升格申请 = 治理议案，前置 `rx` 为真，通过即不等宽限；只写人口的旧形状 `{rank, population}` 视为 `rx: population(x) ≥ population`）。包可加新内容类型（带上位词），core 消费者按上位回退。各类条目的字段：
- **罪名条目**（05 §5.2.3 形状）另可写 **`matches: offense:<族> | none`**：`matches` 是谓词的一种写法——事件带该标签**或其下位词**（任一包的合法性标注或动作描述标签所打）∧ 该标注声明的 `scope` 成立 → 谓词为真，与条目自己的 `when` 取并集。core 缺省法典数据的每条 offense 条目缺省 `matches: 本族`（法典数据可写 `none` 关闭）；"按上位回退匹配"在全篇只指这一条写法，立案仍只由规范栈谓词产生嫌疑记录（05 §5.2.7）。包要在**没有该族**的政体立案，用补丁 `append(clause)`（§A.9 第 4 条、05 §5.2.8）向其法典追加条目，受 `patchable` / `reserved` 约束。
- **程序条目**：`forum = {criminal: act_place | defendant_residence, civil: [contract_place, defendant_residence, property_place]（按序取第一个有受理职位的法域）, parallel: first_filed | both | defer}`（受理管辖：原告只能向 forum 允许的法域的受理职位起诉；两地同时起诉按 `parallel`，缺省 first_filed：后立案的停在 filing 待先案判决）；`recusal = {decisions: [认证 | 受理 | 批复 | 判决], when: RX（读决定者与当事人的 `mentor_of` / kin / member_of 持有（`withFrame({jurisdiction: null})` 含已关闭）与 `standing` 阈）}`（命中 → 该职位持有人对该事项 `effective` 为假，代理承接，04 §4.6；违反即 `offense:abuse_of_office`）；`review = {of: [认证 | 受理 | 批复], by: 上级职位或组织, days}`（对职位决定的复核 / 上诉：当事人动作 → 复核职位在 `days` 内撤销或维持，缺省无复核）；`remittanceDays`（代收款项解缴到 seat 的期限，§A.15 价值位置）；`escrowCustodian`（义务与票据托管账户挂在谁身上：`treasury_seat`（法域公库衙署，缺省）| `bank_branch`（债务人指定网点），§A.15）。
- **税表条目** `{base: trade | toll | poll | property | …, commodity?: goods:*, subjects?: cargo | companions | mounts | persons（通行费对什么计，缺省 cargo + persons；随行活畜按物种 `goods` 计税；**票据缺省不计**：价值未过关、在兑付地出账，法典要堵"带票不带钱"须显式列 `instruments{basis: represents}` 按面值计）, rateBps | flat, recipient, split?, exemption?, collection?}`：`recipient` 取 `treasury`（法域公库，缺省）| `controller`（节点 `controls` 持有人）| `office:<职位>` | `holder(permit:<种类>)`；`split: [{recipient, bps}]`；`exemption: {per: person | household | party, window: 天数, qty, counter: countEvents(...)}`。通行费与关税由节点规范栈的税表条目派生，`controls` 持有本身不收钱（01 §1.5）。**`collection`**（征管层）：`automatic`（缺省：反应规则按真实数量直接转移，税吏不介入；**纳税人账户不足时**转移只做可付部分，差额创建 `tax` 义务（债务人 = 纳税人，`accruedTo` = 征收刻，宽限按法典 `grace`），逾期走抗税与追征——"拖欠税粮"在 automatic 下由此存在，与 assessed 的 `tax` 义务同一种类；05 §5.1 与 15 §15.1.1 的"税 = 反应规则转移"与"税 = autoSettle 义务"是同一机制的两段）| `assessed{assessor: 职位, inspection: {check: RX（读税吏 `effective` 与 `dutyOfCare`、货物 purports、隐匿检定）, coverage: 0..1}}`：应税事件只产生**申报子事件** `declare`（纳税人可 deceive 低报，按 purports）→ `tax` 义务按申报额创建 → 税吏查验（检定 / 时钟抽查）查获差额则补征并命中 `offense:tax_evasion`；税吏不查即放行 = 以职位 actedAs 的 `release` 事件（放行与补征的 `release` 同事务 `create(item 完税凭据, represents: 该 tax 义务或征收事件)` 交纳税人，凭据物品见 §A.2），`negligent` / `bribery` 谓词读它；| `farmed{farmer: holder(permit) | controller, quota}`：收款人为包税人，包税人对公库负固定 `tax` 义务 quota。派生 `taxDue(事件或期间)`（应征）与 `taxGap(法域, 期间)` = Σ 应征 − 实收，稽查与审计动作读它（15 §15.7）。
- **认可条目**`recognition: [{what: holdingKind | obligationKind | resource | instrument | certification | identity | personhood | resurrection | calendar | rite, selector?: RX（对缔结快照、持有人、来源法域、`convertedFrom` 求值）, effect: recognized | void | conditional{terms}}]`（`personhood`：被承认人格的 creature 可持 citizen_of / resident_of、不可被 owns、计入人口；`resurrection`：神迹复活在本法域是否产生 `restored`；`obligationKind` + `convertedFrom`：卸载转换后的义务在各法域有效或无效，12 §12.5.4）；`recognized(x, j)` 按栈序取第一条命中者，无条目缺省 recognized（§A.15）。core 预置字段组是它的特例：`legalTender: {unit: 任一资源, accepted}`、`demonetize`（随 time 变化的承认，15 §15.3）、`instruments`、`issuers: {mint, notes, minReserveRatio}`（谁能引用 `src:mint` / `src:issue`）、`certifications`（承认哪些认证职位——第三方认证的承认由此，也是"执业须经本地承认"的落点）、`marriages`（承认外地婚姻的形式要件）、`calendar`（本法域用哪部历法）、`units`（显示单位表）、`rites`、`crossRealm`。
- **合同效力条目** 加 `authoritativeText: original | translated | each_party_language | terms_only`（缺省 `terms_only`：以条款快照为准，文本只作证据，05 §5.4）。
- **程序条目**：`conquest = {governance: dissolve | retain | replace(org), offices: vacate | retain, treasury: seize | retain, fiefs: retain_disputed | revert}`，由**新主权**法典给出、条约 `allied_with` 条款可覆盖，04 §4.2；`limitation`：民事时效与追诉期 `{claimKind | offense → days, tolling: [{when: RX（债务人或被告不在本法域 / 持有 wanted / capacity none / 未成年）, mode: suspend | reset}]}`，从行为时起算、按查询时条款判断届满（程序从新）；`neBisInIdem`：跨法域同一事件重复立案的缺省 `credit`（已执行刑罚额计入量刑）| `bar` | `none`；`sentencing = {multiple: concurrent | consecutive, recidivism: RX（读 `countEvents(judgment, 同被告, 窗口)`）}`；`summary = {offenses: 罪名族, by: 职位}`（行政处罚：命中族的案件由该职位持有人直接判决、跳过审理、可上诉）；`lostInstrument = {noticeDays}`（挂失公告期，01 §1.4）；`estateAdministrator`（遗产执行人顺位，§A.15 执行人）。

**民事条款族** `civil:*`（开放；core 预置十类，法典完整性校验只要求 core 十类齐全或显式 `inherit`，包加的类自带缺省）：
① 清偿顺序与破产（含偏颇清偿撤销期、简易程序期限、个人破产的豁免额 `exemptAmount` 与免责；**承接实体关闭后新发现的债权**：缺省向各继承人在其 `liabilityCap` 内按份额追偿，法典可定 `reopen`；**关闭后新发现的财产**同口径：缺省按关闭时的分配份额追加分配（动作 `claim_estate_asset`，由发现者或任一继承人发起），`reopen` 则重开分配阶段；**抵销 `setOff`**：同两方互负已到期债务时，任一方动作或承接实体清偿阶段按较小额互相 settle，同事务两笔、不经账户）；② 继承（继承表、遗嘱 `testament`：形式要件、特留份、效力顺序"有效遗嘱 > 继承表"、受遗赠人 legatee（可为任何实体，顺位在债务之后、继承人之前）、**受遗赠人接受 `legateeAcceptance: {required, days}`**（缺省 `required: false` = 被动受领；为 true 时分配步对该条登记到期项，受遗赠人以 `accept_legacy` / `decline_legacy` 动作答复，逾期视为放弃，放弃份额按继承表补分）、**同一财产重复处分 `conflict: prorata | last_clause | void`**（缺省 `last_clause`：后写条款优先、前条无效；分配步先按此改写再执行 `holding.transfer`，I8 不被触碰，无法解析的条无效回继承表）、**遗嘱未涉及的财产按继承表补分**、`onDebtorGone` 覆盖、限定继承、放弃期限、同时死亡推定；只计 `recognized` 的 kin 与模板 `inheritance: true` 的实体）；③ 婚姻家庭（婚姻财产、离婚分割 `divorce`、婚约 `betrothal` 与配偶 restored 时的处置 `betrothalOnRestore: void | voidable`、重婚（core `kin:spouse` 缺省 `incompatibleWith{kind: kin:spouse, policy: forbid}`，法典可放宽）、**家户归属 `descent`**：新生儿入哪一户由文化记录 `descent: patrilineal | matrilineal | bilateral | household_of(father | mother)`（13 §13.2）决定，法典民事③可覆盖，出生反应规则据此开立 `household_member`，kin 双亲边不受影响）、监护顺位（可列职位或组织；**托孤**：遗嘱 `testament.guardian` 指定者列为顺位首位）、**抚养 `support`**（`kin:parent` 与 `guardian_of{scope: person_and_property}` 的持有人对未成年子女负 core 义务 `support`（01 §1.4），清偿 = 使子女 `body.satiety` 不跌入 `starving`；`starving` 持续 ≥ N 天为违约，法典可定 `offense:neglect`））；④ 行为能力、同意与代理（`majority: {动作族 → 年龄}` 成年年龄表、`capacity` 为 limited 时各动作族的效力 `limitedActs: {族 → void | voidable | pending(guardian)}`、紧急救治、同意代理、代理权范围、越权行为的追认期限、**表见代理 `apparentAuthority`**：第三人知情集合含授权 tell 或文书且不知撤销 → 对第三人有效、本人向代理人追偿；**`illiterateSigning: valid | voidable | void`**（签署人 `canRead` 为假且起因链上无代读 tell → 事件标 `unread`，效力按此，缺省 voidable）；**超出同意目的**：同意带 `purpose`（§A.15），动作声明的 `purpose` 不在其内 → 事件标 `unconsented:purpose`，罪名谓词可读（core 法典数据把它并入 `offense:unconsented_magic`））；⑤ 宽限 `grace`；⑥ 担保与风险负担（质押物被盗、担保与冻结的优先、留置 `lien`：占有人对标的开立 pledged 的条件、幻象物与伪造物的风险负担）；⑦ 股东责任与增发 `issuance`、**退股 `withdrawal`**（章程 `withdrawal: {allowed, noticeDays, valuation: book | agreed}` 的缺省；退股 = `holding.rescale` 把退出者份额归零、组织对其负一次性 `compensation`（按 `value(股份)`）；退出前已分配的分红不返还，撤销持有本身（无效入股）才走民事⑨）；⑧ 侵权责任（过错 / 无过错 standard、共同侵权 `joint: proportional | solidary`、替代责任、**诽谤 `defamation`**：`lie` 标签的 tell 在起因链上导致第三方对受害人的负向 impress → compensation 与更正）；⑨ 救济与第三人效力（撤销、返还、返还不能折价、强制履行、**善意取得**（输入：取得方 `¬knows(处分人无权)` ∧ 有偿 ∧ 标的非 `taint` 批次；无权处分见 §A.15 占有）、诈害行为撤销、**不当得利 `unjust_enrichment`**（无法律原因的转移——`validity` 为 void 的行为的对价、错付——→ 返还义务）、**以物抵债 `inKindSettlement: {allowed: [obligationKind 或上位词], valuation: value | agreed}`**（`obligation.settle{with: {resource | lot | item, qty}}`，06 §6.3：按 `value(标的)` 或双方议定额（事件标 `agreed`）折抵，须债权人同意或判决；折抵额超出欠额的差额由债权人同事务 transfer 找还，不足部分义务余额照常）、**无因管理 `negotiorum_gestio`**（无 mandate 而为他人利益的必要支出 → 受益人负 compensation）；**损失填补**：同一损失的赔偿与保险给付总额 ≤ `value` 评估，超出部分由后付者向先付者代位）；⑩ 物权取得（遗失物报官期限与报酬、先占无主物、时效取得、残骸无人认领期限、**添附 `accession`**：加工后新物归材料主或加工人（按 `value(新物) ÷ value(材料)` 阈），另一方得补偿、**征用 `expropriation`**：标的与补偿对象按决议 `frozen.asOf` 时刻的持有人确定，补偿 = 该时刻的 `value`）。

**程序成本**（程序条款的一部分，R3 专项②第 7 条）：`procedure.costs = {filingFee 讼费（transfer → 法域公库）, freezeBond 申请冻结的担保（质押或现金，败诉时赔付被冻结方）, loserPays 败诉方承担对方讼费与讼师费的比例, vexatious: {within, count} 同一指控人在期间内败诉或撤案达 N 次后受理裁量加严并可构成 offense:vexatious_litigation}`；缺省值由 core 法典数据给出，可为 0。

**案件种类**（词汇族 `case:*`，core 预置 5）：`criminal` 刑事、`civil` 民事、`insolvency` 破产、`declaration` 宣告（失踪 / 死亡 / 撤销）、**`capacity` 行为能力**（申请 → 鉴定（检定动作，读医者技能与症状）→ 判决对本人施加状态 `capacity:limited{scope}` 或 `capacity:none` 并开立 guardian_of（持有人可为亲属、职位或组织）；效力只及此后的行为，此前行为按民事④事实认定；恢复 = 撤销判决 → 状态解除、持有 close；05 §5.2.7）。**刑事程序阶段（7）**：suspicion 嫌疑（私密记录，不是案件）→ accusation 指控 → filing 立案 → pursuit 缉捕 → trial 审理 → judgment 判决 → execution 执行（上诉为分支；执行阶段的原语因被告不在场可及而失败时，阶段回到 pursuit、`wanted` 续期、执行到期项重登记，05 §5.2.7）。

**议案结果类型**（词汇族 `resolution:*`，core 预置 3）：`norm`（对本组织规范条目 fact.set）、`execute`（以组织权能执行一个注册动作）、`appoint`（任免）。**议案状态（7）**：proposed、adopted、pending_approval、approved、rejected、lapsed、executed。

**罪名与侵权角色**（词汇族 `role:*`，core 预置 5；每个角色是一条谓词模板数据，05 §5.2.3，包可加）：principal、accomplice、instigator、negligent、vicarious。

## A.8 主观视图（05 §5.4）

主观视图是视角 `frame.observer` 轴的特例（§A.15）。**四域**：自知域（此刻能直接感知的：自己的身体与状态、自己的全部身份键、随身账户与物品——可替代物按批次 `purports` 显示（§A.15）、在场的持有与义务对手方、自己发起的事件、自己签过的条款快照）、可观测域（当前所在地点此刻的公开状态：报价与工价、天气、在场者（按 `identify()` 认出的身份键）与可见活动、公告（公开宣告事件 `announce`；**告示是文书物品**，须阅读，§A.2）、本地路况）、知情域（知情集合中最新版本；他人的事件按观察者认出的身份键归档）、先验域（模板缺省）。**不在场的持有与义务的状态**（已清偿 / 违约 / 作废 / 对方消失）属于知情域，不属于自知域。NPC 决策只读这四域（I25）。

**知情来源（5）**：见证、被转述、阅读文书、作者知情种子（开局 / `pack.install`）、聚合传闻（统计层聚落公共知情的抽样，可回溯到原事件）。

**tell 的通道（8）**：face 当面、letter 带信、notice 公告、caravan 商队、bard 吟游、dream 托梦、oracle 神谕、omen 异象。通道表是 extend 扩展点（12 §12.2.3）。

## A.9 开放扩展（12 章）

**开放性宪章**（根因分析 (a)；12 §12.2.3 据此改写）。扩展点不再是清单，而是五条规则；一样东西是否可扩展由它的**声明**决定，缺省开放：
1. **表开放**：凡 core 或包声明为数据表的（`rules/tables/*`、法典条目、章程字段、物种、配方、失真表、通道、文化记录、基线表、估值表、历法），任何包可加行（add / extend），不能改删他人的行；core 规则读**全部已装包的表**，不读 core 一张表。声明 `closed: true` 的表（原语表、模板矩阵）除外。
2. **族开放**：凡枚举都是词汇族（`offense:*`、`civil:*`、`clause:*`、`case:*`、`resolution:*`、`role:*`、`reason:*`、`basis:*`、`need:*`、`goods:*`、`super:*`、`passage:*`、`channel:*`、`mark:*`……），包可加带上位词的词；core 规则按上位回退匹配，新词不会落地无声（12 §12.3.3）。`closed` 的族只有原语、模板、不变量编号。
3. **派生缺省开槽**：每个派生值（core 与包的）自动是一个修正槽，自动有读函数 `derived(id, x)`，可挂修正项（阶段与 bounds 由派生方声明，缺省 `mul ∈ [0.5, 2]`）；只有声明 `closed` 的派生（守恒量、合法性认定、随机、`effective`）不开。§A.16 是 core 派生值的 bounds 数据，不是"允许开槽的白名单"；"新增槽"不再需要引擎或契约版本。
4. **定义可补丁**：任何已注册定义（法典条款、动作、持有种类、义务种类、物种、配方、章程）接受受控**补丁**（05 §5.2.8）：缺省允许追加型（追加前置、追加不相容、豁免、收窄条款范围、**向法典追加条目 `append(clause)`**——包可向一切政体法典追加罪名 / 管制 / 税表条目，追加的条目带来源包与世界内原因，受该法典 `patchable.clauses` 的族白名单与刑罚上限、`reserved` 约束，核心族（叛逆、主权、铸币）缺省 reserved），改写型（mul / add / reduce）按目标 `patchable` 声明，`reserved` 拒绝一切；合成与加载顺序无关（I24 / I27），每条补丁带世界内原因。规范补丁、动作前置补丁、修正项是同一机制的三个面。
5. **协议后续开放**：任何持有种类、义务种类、实体种类、法典可声明钩子（§A.4）；不新增触发。
**封闭的只有**：八个存储概念、19 原语、求解器算法、不变量、L0；以及安全边界——bounds、每槽与每源汇的预算、`reserved`、`closed`、合理性表、上限表。

**合并语义（4）**：add、edge、slot、extend（补丁文件按 extend 合并，作用方式见第 4 条）。**同一判定的唯一赢家**（`decides`）：反应规则、动作、推断规则与表行可声明 `decides: <判定 id>`（例 `gambling:cheat_detected`、`medicine:diagnosis@症状`）；同一判定 id 由多个包声明时按槽位规则裁决（12 §12.4.4：overrides → profile resolve → E-CONFLICT-DECIDES，两包该项都不注册）；表行主键（表声明 `key` 字段）重复同样报冲突而不并集。未声明 `decides` 的规则各自生效（并集），这是缺省。
**卸载转换与法域**：包义务 `convert` 到 core 种类时带 `convertedFrom`，各法域经 `recognition{what: obligationKind, selector: convertedFrom}` 决定有效或 void（§A.7）——卸载策略不需要按法域分支。
**槽位（7）**：place.lawCode、place.layout、place.seat、settlement.administrator、place.sensory、org.charter、place.culture。（槽位是"被覆盖的值"；**修正槽**是派生公式上的挂点，清单在 §A.16，两者不同。`settlement.administrator` 只在开局装或该聚落当前没有存活 `administers` 持有时可占，中途注入不得覆盖存活持有——12 §12.4.4、J3。）
**信任（2）**：data、native。**包档（2）**：content（只有内容，不声明规则，`pack test` 跳过规则类检查）、rules。
**修正项阶段（5）**：add、mul、max、min、clamp（派生方按 §A.16 声明可用阶段与顺序；合成顺序固定为 基础值 → add → mul → max → min → 节奏系数 → clamp，05 §5.9）。
**卸载策略（13）**：对事实与资源：dormant、fallback、drop、convert、redeem、void；对持有与义务：close、cancel（包义务种类另可 convert 到 core 种类）；对实体：`gone`（退场，缺省）、`keep`（保留为 core 的孤立实体：只允许种类是 core 种类的实体，`origin` 改记"由包 X 留下"，章程、法典、持有照旧）、`convert_entity`（按声明映射改为 core 种类或模板，事实按 `facts` 映射表折算，其余 drop）；对 core 持有指向包实体：`retarget`（把 certified / registered / devotee_of 等 core 持有的标的改指到声明的 core 实体）、`snapshot`（持有留在墓碑上，派生读退役表的 `tables` 快照）。
**退役表的区（9）**：动词 / 标签 / 持有种类 / 义务种类 / 资源种类 / 状态 / 法典 / 动作 / **tables**（被动派生表、名额表、继任表、职位表的快照；使 04 §4.3 "历史认证保留、派生仍有效"可计算）。
**纪元边界事件（4）**：pack.install、pack.upgrade、pack.uninstall、world_upgrade。

## A.10 空间与节奏

**感知通道（3）**：视觉、听觉、触觉（01 §1.5）。
**节奏档位（5，14 §14.8）**：极慢 ×0.25、慢 ×0.5、适中 ×1（缺省）、快 ×2、很快 ×4——只作用于声明 `paceable` 的**延迟类**槽（计划推进、传闻延迟、预兆间隔、社交起意）；灾害、疫病暴发、婚育、迁居、商队、犯罪等**均衡类**槽一律 `paceable: false`、不随档缩放（数值方案 §2.21 登记）。离开时可选"按最慢进度"或单独选本次离开的档位（`pace_set{level, scope}`，14 §14.8）。
**降级等级（4，07 §7.5）**：D0 全量 → D1 **计算时机**分级（低显著度事件的见证按需展开、状态类罪名按月求值、主观视图截断为可重算摘要；**不改变见证语义**，I30 不受影响）→ D2 规则层自治降频、传闻只传显著事件 → D3 注意距离缩小一跳（带滞回：至少保持 N 天再恢复）；等级变化是输入事件 `budget_set`。调度配置（反应深度上限、每刻提案上限、每事件谓词预算）同样是输入事件 `config_set`，进存档（14 §14.2）。

## A.11 超自然相关枚举（13 章；approval、bounty 来自 05 §5.2.5 / 01 §1.4）

**生灵六轴标签族**：本源 `super:*`（dead / spirit / cultivated / beast / divine / fiend / fae / construct / hybrid）、形态 `form:*`、依附 `anchor:*`、驱力 `drive:*`、能力 `power:*`、规矩 `bound:*`；处境（wandering / enshrined / sealed / commanded / contracted / rested / reborn / married）**只派生不存**。
**仪式族 `rite:*`**：funeral、ancestor、feed_hungry、exorcism、sealing、pacify、offering、divination、summoning、purification、binding、curse_counter、passage。
**辟邪 / 克制标签族**：`ward:*`（辟邪物件）、`bane:*`（克制物质）。
**新持有种类（7）**：devotee_of、possesses、cursed_by、commands、seals、enshrined_in、invited。**新义务种类（6）**：gratitude、grievance、pact、vow、approval、bounty。**后续新增**：持有 `mentor_of`（师承，01 §1.3）；义务 `bailment`（寄存 / 代收）、`support`（抚养）、`auction_sale`（拍卖成交，05 §5.1）；源 `src:husbandry`（活体产物，01 §1.6）。

## A.12 不变量索引（02 章）

I1–I20 初版；I21–I23 第 12 章（定义段见 12 §12.8.5）；I24–I29；I30 空间；I31 同刻全序、I32 节奏不改因果。共 32 条。

## A.13 RX 标准库（L1 提供，第三方可用的领域函数清单）

包内自定义派生函数以 `<包id>:<函数>` 命名并在 `rules/derivations.json` 声明（例 `luquan:warrantCover`）；下列是引擎保证存在的 core 函数（签名随契约次版本扩充，只增不改）。数值一律是定点数（14 §14.6）。

| 组 | 函数 |
|---|---|
| 视角与派生 | `frame`（当前视角 `{observer, jurisdiction, time, layer}`，§A.15；`withFrame({…}, expr)` 在表达式内切换视角——`withFrame({time: t}, holdings(x, 'kin'))` 回读 t 时刻的持有，含已关闭者，祖先回溯与"行为时持有"都用它）、**`derived(slotId, x)`**（读任一派生值——每个修正槽自动有此读法，不需要逐槽函数）、**`value(x, frame?)`**（统一估值，15 §15.2；`itemValue` / `wageQuote` / `creatureValue` / `landValue` 是其别名）、**`recognized(x, jurisdiction?)`**（承认派生）、**`identify(observer, x)`** / `identities(x)`（身份键）、**`authority(actor, op, target)`**（权能）、`units(jurisdiction, resource)`（显示单位）；`capacity(x, 族)`（行为能力三档）、`validity(event, jurisdiction?)`（行为效力）、`possessor(x)`（占有人）、`executor(x)`（执行人）、`recall(x, event)`、`credence(listener, speaker, prop)`、`taxDue(eventOrPeriod)` / `taxGap(jurisdiction, period)`（§A.15、§A.7） |
| 视图 | `view(x)`（含 `view(x).combat` 等子视图）、`fact(x, field)`（含包的扩展事实 `fact(x, 'pack:field')`）、`trait(x, name)`（性格与价值排序项，0..1）、`holdings(x, holdingKind?, frame?)`（缺省只含当前视角法域承认的持有，`frame: {jurisdiction: null}` 读全部）、`holder(office)`、`members(org, filter?)`、`member(x, org)`、`rank(x, org)`、`present(a, b)`、`located(x)`、`zone(x)`、`distance(a, b)`、`reachable(a, b)`、`age(x)`、`lifespan(x)`（§A.16）、`species(x)`（物种数据记录）、**`effective(holding)`**（职能是否有效，§A.15）、**`impaired(x)` / `confined(x)`**（§A.3）、**`regime(x)`**（受限者所受的拘禁制度，§A.15）、**`canAct(x, actionOrFamily)`**（`capacity ≠ none` ∧ 受限制度允许；limited 者可发起，效力交 `validity`） |
| 选择器（有界） | `persons(selector)`、`entities(kind, selector)`、`county(place)`、`settlement(place)`、`exists(selector)`、`installed(packId)`（软依赖守卫） |
| 事件与原语 | `has(event, tag)`、`anyPrim(event, predicate)`、`prims(event)`、`crossesNode(event, scope)`、`cargo(entity)`、`cargoQty(entity, goods)`、`commodity(resource)`（商品类标签）、`tender(item)`（行使票据）、`causes(event)`（含权重，缺省算法见 01 §1.7）、`actedAs(event)`、`salience(event)`（§A.15）；**事件窗口计数**：`events(selector, window)` / `countEvents(selector, window)`——读**真相事件索引**，selector 必须含至少一个索引键（actor / target / location 之一）与动词集合，`window` ≤ 上限（配置，缺省 365 天）；供税表免税额、常客识别、滥诉计数、状态类罪名、服务容量复用；不进主观视图。主观版本 `knownEvents(x, selector, window)` 只读 x 的知情集合（决策、推断、候选用它，I25）；候选或推断的 RX 调用 `countEvents` 在 P8 被拒（E-INV-I25） |
| 账户 | `account(x, res, purpose?)`、`lots(x, res)`、`sown(node)`（田地播种事实，01 §1.10）、`taint(lot)`、`origin(lot)`、**`purports(lot)`**（批次表象，§A.15）、`capacity(x)`、`laborHours(business, period)`（含声明 `labor` 的役畜 / 傀儡折算工时，05 §5.1）、`serviceCapacity(x)`（§A.16）、**`issued(currency)`**（流通中的纸币总额）、**`reserveRatio(issuer, currency)`**（15 §15.3） |
| 身体 | `body(x, need, t?)`（体力 / 饱食 / 口渴 / 疲劳的闭式现值，§A.15 身体需求量）、`loyalty(creature)`（= `standing(creature, 主人, 'attachment')`）、`nutrition(resource)`（食物资源的恢复表项） |
| 义务 | `obligations(x, role?)`、`due(o, t)`（按 `per: anchor` 条款时读 `anchorsBetween`；读 `called` / `rate_reset` 事件，§A.15.6）、`overdueCount(o)`、`overdue(o, days)`、`grace(o, t)`、`consent(from, to, scope, purpose?)`（§A.15 同意查询）、**`cases(selector)`**（案件实体索引：被告 / 原告 / 罪名族 / 状态，不受 `countEvents` 窗口限制——累犯、滥诉、回避读它） |
| 规范 | `jurisdiction(place)`、`code(place)`（主权法典，`code(place).clause(type, key)` 同 `clause(normStack(…), …)` 的主权层简写）、`normStack(actor, place, t)`、`clause(stack, type, key)`、`recognizes(jurisdiction, thing)`（含 `recognizes(j, actor, 'issuer')`）、`evidenceScore(case)`、`succession(office)` |
| 立场与知情 | `standing(a, b, dim?)`、`knows(x, event)`、`believes(x, prop)`、**`knownHoldings(x, target, holdingKind?)`**（x 知情集合中可见的 target 持有，§A.15 传导门控）、`subjective(x).field`、`quoteKnown(x, place, goods)`、`publicKnowledge(settlement)`、`canCommunicate(a, b)`（§A.15 语言）、**`canRead(x, item)`**（识字 ∧ 文书语言熟练度，§A.15） |
| 市场（15 章） | `price(place, goods)`、**`quote(place, goods, side?: sell | buy, business?)`** 与 `settlePrice(place, goods, qty, side?, business?)`（方向与商号的 `spread`，15 §15.2）、`value(x, frame?)`（统一估值，别名 `itemValue` / `wageQuote(place, skill, tier)` / `creatureValue` / `landValue`，15 §15.2）、`rate(place, coinA, coinB)`、`ppi(place)`、`interestRate(bank, borrower)`、`credit(region)`、**`recipe(id)`**（配方表项，01 §1.6） |
| 决策 | `npcDecision(request, terms)`、`need(x, kind)`、`utility(...)`、`explain(x, decision)`、`urgency(request)`（§A.15） |
| 军事与组织（05 §5.10） | `strength(org)`、`supply(org)`、`leverage(orgA, orgB)`、`deterrence(party)` |
| 时间与骰 | `now()`、`days(a, b)`、`season()`、**`month(t?, calendar?)` / `year(t?, calendar?)` / `calendarDate(t?, calendar?)`**（历法投影，§A.15；缺省历法 = 视角法域的 `recognition.calendar`）、`window(id)`（阈限时间窗，读历法锚）、**`anchorsBetween(t0, t1, calendar?)`**（返回 `{full: 完整锚数, remDays: 余日}`：闰月不成期、其天数计入 `remDays`，确定算法见 §A.15 期间与折算口径）、**`daylight(place, t?)`**（日出日落，读历法 `anchors.daylight`）、`roll(key)` |
| 集合与数学 | `filter/map/some/every/count/sum`（有界）、**`partition(selector, size, by: adjacency | order)`**（按邻接或序把有界集合切成大小为 size 的组，确定性；编保、分班用）、`min/max/clamp/round/floor/abs`、`log/exp`（引擎提供的确定性定点近似） |
| 超自然（13 章） | `efficacy(rite_or_item, being)`、`trueName(x)`、`sympathyLink(item)`、`afterlife(person)` |

正文示例中带包前缀的函数（`luquan:warrantCover`、`shipping:routeHasStorm` 等）是包在 `rules/derivations.json` 声明的派生，不在本表；不带前缀又不在本表的函数名在 P7 报 E-RX-UNKNOWN。本表是**最小保证集**：任何派生值（core 或包）都可经 `derived(id, x)` 读取，任何可定价物都可经 `value(x)` 读取，任何承认问题都经 `recognized(x, j)`，所以"读 core 的某个派生"不再需要为它新增函数（根因分析 (a) 第 3 条）。

## A.14 编号约定

走查题号带轮次前缀：R1-E01…R1-E20、R2-E1…R2-N8、R3-E1…R3-N5、R5-E01…R5-N8、R6-E1…R6-N8、R7-E1…R7-N8；"指南N*"指开发指南 v2 的 NPC 验收编号。审查意见编号：A-Cn / A-An / A-Bn（run-003 审查 A）、B-Mn / B-Sn / B-§3.n（审查 B）；R3-Cn / R3-Sn / R3-Mn / R3-Ln（run-005 审查的矛盾、严重、中等、轻微条目，"R3"指第三轮修订）；R4-Cn / R4-Xn / R4-Sn / R4-Mn / R4-Ln（run-006 审查的矛盾、不一致、严重、中等、轻微条目，"R4"指第四轮修订）。

## A.15 关键派生的定义（此前只被使用、未被定义的词）

（每条一个小节，按派生名检索；长条目再按要点分点。）

### A.15.1 视角 `frame`

（根因分析 (d)(f)）：一切"有效吗、被承认吗、知道吗、算多少、在哪一层"的问题都不是存储字段，而是在一个视角下的派生。`frame = {observer?: 实体, jurisdiction?: 地点或法域, time?: 时刻, layer?: 智能 | 规则 | 统计}`，四轴各有缺省（observer 缺省为内核真相；jurisdiction 缺省为标的所在地；time 缺省为现在；layer 缺省为所在地区层级）。每个只读 API 都接受 frame；内核只存一份真相（持有、义务、事件、账户），不存任何"按谁看"的副本。四轴各自的特例：**observer** → 主观视图四域（05 §5.4）、物与批次的表象 `purports`、人的身份键 `identify()`、立场传导的知情门控、主观报价 `quoteKnown`、单位与称呼的显示；**jurisdiction** → 规范栈（05 §5.2.2）、承认派生 `recognized`、单位表、年号、计价单位；**time** → 行为时法（罪名、合同效力按事件时刻的规范栈与条款快照）、`effective()` 按此刻、时效 `limitation`、纪元（注册表版本）；**layer** → 聚合变体（07 §7.3）、见证模型（I30）、公共知情。**通则——实体性问题从旧、程序性问题从新**：凡由一次行为确定的效力（罪与非罪、合同有效与否、婚姻 / 认证 / 持有是否成立）按行为时的 frame 冻结进条款或缔结快照；凡"现在怎样处理"（程序、宽限、清偿顺序、税、承认、拘禁制度）按查询时的 frame；时效从行为时起算、按查询时的程序条款判断。设计中不得再为某一类事实单独发明"版本 / 快照 / 承认"字段：新需求只需回答"按哪一轴"，并写对应的数据（法典承认条目、文化单位表、历法）。

### A.15.2 承认 `recognized(x, j)`

结构性持有（kin:spouse、certified、permit、registered、holds_office、owns、citizen_of）、凭证、货币、身份链接在开立时记**缔结快照** `concluded = {place, lawVersion, time, form, inName?}`（与义务条款快照同形，01 §1.3）。`recognized(x, j)` = 法域 j 规范栈中 `recognition` 条目（§A.7）按栈序取第一条命中者的 `effect`；无条目缺省 `recognized`。同一持有在两法域可得不同答案（部盟婚在王国无效），持有本身只有一条。消费者：继承表只计 recognized 的 kin（04 §4.4）、出生户籍条款、弹劾与罪名谓词（`holdings(x, kind)` 缺省按视角法域过滤）、开店与执业资格读 `recognition.certifications`、法定货币与改币（`demonetize` 是承认随 time 变化的特例）。判决"婚姻无效"= 该法域一条针对该持有的 recognition 事实（fact.set，可上诉），不关闭持有。

### A.15.3 身份键 `identity`

person / creature 的慢变事实 `identities: [{key, name, look: 外貌事实引用, since, until?}]`，缺省恰一个（本名）。事件归约时按行为者当时使用的身份键记 `actorAs`；见证者知情集合里该事件的"行为者"是其**认出的身份键**：`identify(observer, x)` 返回 observer 知情集合中与 x 的外貌事实或身份链接事件能匹配的键（认脸 = 曾当面见过该键；认人 = 知情集合含 `identity_linked{keyA, keyB}` 事件：换装被目睹、揭穿、自认、鉴定）。立场、嫌疑记录、指控、`wanted` / `frozen` 的目标、账簿对手方、以某身份签的条款快照 `inName` 都可以引用身份键；法域执行（通缉核验、冻结存款）只能作用于该法域**承认链接**的实体（执法者知情含链接事件 ∨ 法典承认的鉴定），所以"石三"的通缉与存款冻结不自动落到本名。揭穿 = `identity_linked` 事件进入知情集合，该观察者的两条链在主观视图中合并（印象相加，饱和函数照常）；真相层永远只有一个实体，守恒、义务两端、继承都按实体（I1、I7）。变形生灵的人形与兽形、`purports` 幻形、冒名顶替是同一机制（13 §13.4）。

### A.15.4 估值 `value(x, frame?)`

一个派生对一切可定价物（资源批次、物品个体、生灵个体、土地与资源点、建筑、股份、债权、劳务）给出以价值单位计的数；各种类的基准与因子写在估值表 `rules/tables/valuation.json`（可扩），公共因子为主观真伪与来历（frame.observer）、法域政策（frame.jurisdiction）、修正项（槽 `economy:value`）；公式在 15 §15.2。

### A.15.5 历法

L1 数据 `world/ontology/calendar.json`，可多部：`{id, epochMinute（元年元月初一的世界分钟）, months: [{id, days | daysRx}], leap: {rule: RX(year) → 插入位置与天数 | none, obligationsSkip: true}, eras: [{polity, name, fromEvent}]（年号是政体慢变事实，议案 `norm` 改）, anchors: {season, festivals: [{id, rule: 月序 + 日 | 月相 | 节气}], daylight: [{season 或 月序, sunrise, sunset}]（昼长表，按地区气候带可另给一行；感知的"光照 / 昼夜"与日程的"夜"一律读 `daylight(place, t)`，不做天文模型）}, rateBasis: {month: 30, year: 360}（折日基数）}`；法域经 `recognition.calendar` 指定用哪部，缺省 core 一部（`core:calendar_default`，月长见"期间与折算口径"）。时钟仍只认分钟（01 §1.9）；`month`、`year`、`calendarDate`、`window` 都是投影，按视角法域的历法渲染。**累计口径全篇只有一处定义**：下一条"期间与折算口径"——条款 `per: day | anchor` 决定闭式的时间输入是天数还是锚计数，闰月的处理也只写在那里；正文（01 §1.4、03 §3.3、12 §12.2、15 §15.9）一律引用，不再各自表述。条款快照记 `calendar`，合同写"三年"按签约历法换算为天数写入快照 `terms.days`，所以改元、改历不改既有义务。节庆由 anchors 推算，一年只有一个端午。

### A.15.6 期间与折算口径

core 缺省历法 `core:calendar_default` = 12 个月、大小月相间（30 / 29 天）、闰月按 `leap.rule`（19 年 7 闰的查表）、`obligationsSkip: true`；历法数据另带 **`rateBasis: {month: 30, year: 360}`**（折日基数，与实际月长无关）。义务条款的金额写法二选一：**按日** `{per: day, value}`（闭式输入 = 天数）或**按锚** `{per: anchor, value}`：每经过一个历法锚（下一历法月同日，按条款快照所记历法）计足一期 `value`，不足一期的首尾段按 `value × remDays ÷ rateBasis.month` 折日（条款 `proration: daily | none`，缺省 daily）；利率同形 `rate: {per: month | year | day, bps}`，按月利率 = 每锚一期。统一闭式：`amountDue(t) = full × 期额 + remDays × 期额 ÷ basis`，其中 `{full, remDays} = anchorsBetween(accruedTo, t, terms.calendar)`（§A.13），对**总额向零取整一次**（14 §14.6）。
- **`anchorsBetween` 的确定算法**：从 `accruedTo` 的历法日期起，锚 = 下一个**非闰月**的同日（该月无此日则取月末）；每跨一锚 `full += 1`；`remDays` = 最后一锚（无锚则 `accruedTo`）到 `t` 的天数 **+ 途中跨过的闰月的全部天数**——闰月（`leap.obligationsSkip: true`）不成期、不作锚，但其天数按 `rateBasis` 折日计入余日，与 `per: day` 条款的闰月结果一致，这就是堵住"借按月、存按日"跨闰月套利的办法（15 §15.9）；大小月（30 / 29 天）之差不折算，一锚即一期。
- **算例（日常 D11、D28 的确定结果）**：月钱 600 文、`accruedTo` = 八月初一、九月初一领取 → `full = 1, remDays = 0` → 600 文（八月为小月亦然），钱柜 2000 → 1400；存款 1000 文、月息 0.5%、三月初一存、六月初一支取 → 三至五月无闰月，`full = 3, remDays = 0` → 1000 × 50 ÷ 10000 × 3 = 15 文，支取 1015、库银 −1015（若三至六月间夹一闰月 29 天 → `remDays = 29` → 15 + 5 × 29 ÷ 30 = 19.83 → 19）；若四月十六支取 → `full = 1, remDays = 15` → 5 + 5 × 15 ÷ 30 = 7。wage 的"固定月俸"= `per: anchor`，缺勤折减只在条款 `prorateAbsence: true` 时按 `laborHours` 比例进入；salary 同形。与 I14 等价：`anchorsBetween` 是确定性函数，一次算 N 月与逐月结果相同。
- **提前收回 `callable`**：条款 `callable: {by: creditor | debtor | either, noticeDays}`（活期存款 = deposit `callable{by: either, noticeDays: 0}`；可召回贷款 = `callable{by: creditor, noticeDays: N}`）。持有该权利的一方以动作 `call` 写事件 `called{obligation, effectiveAt: now + noticeDays}`，`due(o, t)` 读它：`t ≥ effectiveAt` 起全额到期并登记到期项；未声明 `callable` 的义务对 `call` 提案拒绝并给世界内原因（"合同没有这一条"），债权人只能 emit(request) 请求自愿提前清偿。
- **重定价 `rate.floating`**：`rate: {floating: 派生 id（如 `lending:interestRate`）, resetOn: anchor | event(verb), bps?}`。利率只在**重定价事件**生效：到期项按 `resetOn` 写 `rate_reset{obligation, rate}` 并把 `accruedTo` 推进到该刻（结息事件，已计利息写入本金或应付），此后的闭式用新利率；利率派生本身的变化不改写已计利息（不追溯）。无 `floating` 即固定利率，条款快照冻结。钱庄经营条款 `rateTerms.resetOn` 给网点缺省，存款骤增后的存息下调由此"波及"活期储户而不及定期。
- **两种写法的边界**：同一义务只有一种 `per`，写进条款快照；钱庄一家网点的存与贷取同一 `per`（经营条款 `rateTerms.per`，15 §15.5），跨网点"按锚 / 按日"的差额**在单期内**不超过期额 × 1 ÷ `rateBasis.month`（一个小月之差，月息的 1/30）；跨多期会累计（例：按锚 600 文 × 12 = 7200，按日 20 文 × 354 = 7080，一年差 120 而非 20，10-27 更正）。无套利的依据是：同一网点存贷取同一 `per`；存贷利差（`depositRate = interestRate × 0.4`，15 §15.5）远大于口径差；不同口径的合法价差写明在条款里、按真实期限累计（15 §15.9）。

### A.15.7 身体需求量 `body`

person 与 creature 的慢变事实 `body: {stamina, satiety, hydration, fatigue}`，每项 `{value, asOf}`，上限与速率由数据 `world/ontology/body.json` 给出：`{selector: person | 物种标签, need, max: RX, drainPerHour: {rest, light, heavy, travel: RX（可读天气槽、负重、年龄）}, recover: {action: 动作族 → RX（睡眠按设施性状 `lodging:*` 与睡眠时长；进食按食物的 `nutrition`）}, thresholds: [{id, below, status}]}`（core 预置：`hungry` 30、`starving` 10、`exhausted` 10、`thirsty` 30、`fatigued` 20，占位数据按 数值平衡调研 §3.2 的 `rules/tables/balance/body.json` 形状带 bounds）。
- **读法**：`body(x, need, t)` = 闭式 `clamp(value − Σ 活动类时数 × drainPerHour, 0, max)`，活动类按日程派生（05 §5.8）或当前动作的 `activity`；与义务累计同口径——不逐时写（01 §1.4），只有动作把它推进 `asOf`。
- **写法**：原语 `vital` 的 `type: body:<need>`（§A.6 族不增；`vital(target: self, type: body:satiety, delta: nutrition(resource).satiety)`）；动作声明 **`cost.body: {need: RX}`**（06 §6.4）在裁决第 3 步与 `cost.time` 同时结算；进食 = `transfer(食物 → sink:consume)` + `vital(body:satiety)`，饮水同形；睡眠 / 休息 = `time` + `vital(body:stamina, body:fatigue)` 按 `recover.sleep` 闭式（通铺 / 单间 / 露宿是设施性状 `lodging:*` 的修正项，槽 `body:recover`）。
- **阈值**：单调下降可预测，跨线登记到期项（§A.15 阈值事件）→ `threshold_crossed(body:<need>:<id>)` → 反应规则施加 / 解除状态（`hungry`、`starving`……，`ontology/statuses.json`）；`starving` 持续 → 时钟规则逐日 `vital(harm)`（闭式）与状态 `malnourished`（疫病感染率修正项读它）；自治候选 `need:温饱` / `need:休息` 读 `body()` 与这些状态（§A.17）。
- **生灵同形**：宠物与被 owns 的具名家畜按物种 `maintenance` 的资源种类进食（喂食 = 同一对原语）；种群仍按账户约束（05 §5.5）；宠物忠诚 = `standing(creature, 主人)` 的 `attachment` 维度（别名 `loyalty`），喂食、抚摸是事件权重表的 gift / care 行，`starving` 由状态评价时钟产生负 impress——不另存数值。
- **层级**：智能层逐动作精确；规则层按日闭式；统计层不物化个体，口粮以聚合消耗账户表达（已有），`aggregate: auto`。食物资源的 `nutrition: {satiety, hydration}` 是资源种类字段（`ontology/resources.json`）。

### A.15.8 钩子 hook

见 §A.4；是协议后续的唯一开放点。

### A.15.9 权能 `authority(actor, op, target)`

= 持有的 `derives.authority`（职位职权、经营权、监护代管、东道的拘禁制度）∪ 法典授权表 `delegation` ∪ 章程 `authority` ∪ 当前有效的执行类决议 ∪ 认可条目 `issuers` ∪ **存活且在 `scope` 内的 `mandate` 委托义务**（01 §1.4：受托人 = 债务人，以委托人名义的 op × target 在 scope 内即命中，`subdelegate` 允许时可转委托）；原语校验（06 §6.3）与"谁能施加 / 解除法律类持有与状态""谁能引用 `src:mint`""谁能执行决议"统一读它，返回命中的依据（可解释）。命中即 `actedAs` 记该来源；有职位 / 委托但 op 超出其范围 → 行为**成立**并标 `ultra_vires`（`validity` 按民事④ / 章程 `voidable` 判，可命中 `offense:abuse_of_office`）；完全无来源 → 拒绝并给世界内原因（财产处分例外见"占有"）。"谁能给动作加前置"不在此处：那是定义补丁（§A.9 第 4 条）。

### A.15.10 行为能力 `capacity(x, 动作族)`

三档 `full | limited | none`。none ⇐ 失能状态（§A.3）或判决状态 `capacity:none`；limited ⇐ `age(x)` 未达视角法域民事④ `majority[族]`（缺省表：日常小额交易 12、签约与借贷 16、婚姻 16、立遗嘱 16、表决与任职 16，数据可改）**按主体的年龄表换算后的阈值**（表中年数以人类 `lifecycle.maturity = 16` 为基准；对主体 x 的阈值 = 表值 × `maturityAge(x) ÷ 16`，`maturityAge(x)` = x 物种的 `lifecycle.maturity`（13 §13.3），x 的文化族记录 `culture:*` 若声明 `maturity` 则覆盖物种值——精灵 `maturity = 100` 则签约阈 100、小额交易阈 75；阈值事件 `capacity:adult` 与监护终止读同一函数，所以"是否成年"永远按主体自己的物种 / 文化族判，不按法域所属族）或判决状态 `capacity:limited{scope}` 含该族；否则 full。`canAct(x, 族)` = `capacity ≠ none ∧ regime 允许`——limited 者**可以发起**提案，事件附标签 `capacity:limited`，效力交 `validity`。同意能力同口径：limited 者对精神类的同意需监护人（§A.15 同意来源②）。失智、醉酒、惊吓一类的部分能力由状态数据声明 `capacity: limited{scope}` 即可。

### A.15.11 效力 `validity(event, j)`

对一次法律行为（obligation.create、holding.open / transfer、议案表态、遗嘱、同意）在法域 j 的效力 ∈ `valid | void | voidable | pending{by, until}`。它是 `recognized` 对**行为**的特例：读事件的描述标签（`capacity:limited`、`authority:none`、`ultra_vires`、`unauthorized_disposition`、`unconsented`、`forced`、`deceive`、`gestural`、`illusion`）与缔结快照，按 j 的民事④ `limitedActs`、合同效力条款、章程 `requiresRatification` / `voidable`、民事⑨善意取得求值；pending 到期未追认 → void，已履行部分按民事⑨返还。内核不存"有效"字段；"判无效"= 一条针对该行为的 recognition 事实（同持有的做法）。void 的行为所生义务对 `due()` 返回 0、持有的 `effective()` 为假，但事件、账户转移都已发生——返还是新的义务。

### A.15.12 占有 `possessor(x)` 与无权处分

`possessor(x)` = x 的位置链上最近的 agent（随身者、容器的随身者）或其所在建筑的 `operates` 持有人；是派生，不是持有。原语 `holding.transfer(owns)` 与 `holding.open(pledged)` 的权能校验（06 §6.3）：发起者有 `authority`（所有人、代管、委托、判决）→ 正常；**无权但为 `possessor`** → 提案成立，事件与取得方持有的缔结快照标 `unauthorized_disposition`（`validity` 由民事⑨善意取得判：善意有偿取得有效、原所有人对处分人 compensation；恶意或无偿 → voidable 返还）；既无权也不占有 → 拒绝（"东西不在你手上"）。这让寄存物被当、代管人私卖、拾得物转卖都在世界里发生并留下可诉的事件，而不是在事务里消失。

### A.15.13 执行人 `executor(x)` 与无位置实体的在场

每个 interim 与非聚落 collective 都派生一个执行人：estate → 法典程序 `estateAdministrator` 顺位（遗嘱指定 > 继承人顺位首位 > 法域官职）；liquidation → 清算人（债权人会议或法域官职）；project → 承建方 `operates` 持有人或发起人；motion → 章程中持有相应权能的职位持有人（05 §5.2.5）；case → 受理职位；org / polity → 章程 `treasury` 职位或首领。无位置实体的**在场** = 执行人在场，或在其 `seat`（托管账户所在建筑：遗产的宅第、工程的工地、公库所在衙署）内；`located(x)` 对这类实体返回 seat。transfer / obligation.settle 的在场校验据此判（15 §15.1.1）；义务条款 `autoSettle: true` 时债务人账户在 seat 且债权人在场即可自动付（14 §14.4），工程发工钱、遗产支取存款、公库收税由此不需要玩家在场。执行人消失或 `effective` 为假 → 顺位下一位；无人 → 该实体的提案停在待执行（与议案同口径）。
- **托管与代收的价值位置**：义务与票据**没有自己的账户**（01 §1.2 instrument 行改"否"）——托管款挂在**保管人实体**（程序条目 `escrowCustodian`：法域公库衙署或债务人指定的钱庄网点）的账户用途 `escrow:<义务 id>` 上，位置随保管人；代收职位在场收款（obligation.settle 的"代收职位"、税表 `collection: automatic / assessed`）时款项进入**征收地**所属建筑或聚落实体的账户用途 `collected:<职位或条目>`（所有权仍属 recipient 组织），由到期项按程序 `remittanceDays` 自动创建解缴的 delivery / 内部 bill 到 seat；公库"可用余额"派生 = seat 账户 + Σ `collected:*`（在途不计）。没有瞬移：钱在哪个实体上就在哪里。
- **托管账户的权能**：`authority(x, transfer, 用途 escrow:* 或 collected:*)` 对一切职位、执行人、经营持有人缺省为**假**；`escrow:<义务 id>` 只由该义务的 settle / cancel 到期项或判决动用，`collected:*` 只由解缴到期项流出；保管人 gone 时账户随承接实体转移、用途不变。出纳挪用 = 无权转移，事务内拒绝（不是"成立并打标签"：托管款不在其占有链上）。面板显示悬赏、讼费担保、遗产托管的"有效"时另核托管余额，余额不足显示"托管已空"。

### A.15.14 阈值事件 `threshold_crossed`

派生方（`rules/derivations.json` 的派生，或法典 `schedule` 条目）可声明 `thresholds: [{id, rx: 派生值 → 档位, hysteresis?, graceDays?}]`。引擎对单调随时间的派生（年龄、刑期）把跨越时刻登记为到期项（闭式预测），其余在该派生的输入事件之后重算；档位改变即发框架事件 `threshold_crossed{thresholdId, entity, from, to, at}`（幂等键 = 阈值 × 实体 × 方向；`hysteresis` 防抖；`graceDays` 内回到原档不发）。它是事件，不是存储：成年仍是派生值（01 §1.2 黑名单不变）。core 预置：`capacity:adult`（民事④ majority）、`settlement:rank`（法典 schedule `settlementRank` 等级线的 `rx`——人口、设施、税基的合取，§A.7；升降各一向，降级缺省 graceDays 90；升格申请动作读同一 `rx` 可提前）、`body:<need>:<档>`（身体需求量）、`life:lifespan`、`solvency`（资产 < 负债）、`population:zero`。消费者：钩子 `on: event(threshold_crossed)`、反应规则（降级 → fact.set 行政等级 → 既有"确保应有职位"规则随之裁撤或创建职位，俸禄与额度经 schedule 派生即变）。

### A.15.15 行为归属

事件的 `actor` 永远是**意志来源**，`actorAs` 是行为时所用的身份键（§A.15 身份键）。附身期间（`possesses` 存活）宿主身体所做的一切：actor = 附身生灵，actorAs = 宿主的身份键（在场者认出的是宿主），宿主本人 `capacity` 为 none；罪名 roles 对 principal 命中附身生灵，宿主只在 `possesses.terms.consensual` 时按 `accomplice` 判。core 豁免 `exemption:involuntary_act`：`has(event, 'forced') ∨ (actor ≠ owner(actorAs) ∧ ¬consensual)` → 身份键所属实体免责，施加 forced 者按 instigator。贿银等转移仍真实落在宿主账户，追缴走民事⑨不当得利。

### A.15.16 记忆可得 `recall(x, event)` 与采信 `credence`

`recall` 是开槽派生（槽 `social:recall`，基础式 = `salience(event) × 时间衰减(距今天数) × 年龄修正`，0..1）；主观视图的**知情域检索**与证人证言只取 `recall ≥ 阈` 的事件（遗忘 = 检索不到，日志不变）；自知域中"自己签过的条款快照"同受 recall，文书 records 不受（翻账本即重新读到）。**立场不经 recall**：印象读持有者知情集合中全部 impress 事件，只按事件权重表衰减（05 §5.6）——"七年之仇"不因遗忘细节而消失。`credence(听者, 讲者, 命题)`（槽 `social:credence`）= 信任维度 standing × 命题先验（文化记录的可信度表）× 讲者利害（自述对己有利 → 折减）；知情域取版本时权重 = 来源等级（见证 > 转述 > 传闻）× credence，低于阈值的说法只作 belief 候选而不覆盖已有说法。

### A.15.17 显著度 `salience(event)`

事件头的一个定点数 0..1，归约时冻结写入。`salience = clamp( 动词基础显著度（词汇表每个动词的数据）× 分量乘子 × 幅度乘子 )`：分量乘子取参与者中最高的"持有分量"（职位职级、组织规模、首领、与玩家有持有/义务/强立场 → 数据表）；幅度乘子 = 事件数量（金额、伤害、人数）÷ 本地同类中位数，分段表。用途：传闻自动生成阈值、公共知情截断、NPC 记忆排序、D1 分级、预兆判定（14 §14.8）、返场摘要。显著度不参与任何守恒或裁决。

### A.15.18 钉住 `pinned(x)`

实体被钉住当且仅当：(a) 日程堆上有指向它的到期项（义务、案件、效果、许可、协议阶段）；或 (b) 它处在一条注册时声明 `pins` 的持有的**被钉侧**（`pins: holder | subject | both`，缺省 `none`；core：holds_office（holder）、controls（holder）、wanted（subject）、banished（subject）、guest_of{detained}（holder；东道为 person 时 both）、custody_of（holder）、companion（both）、frozen（subject：被冻结持有的持有人与账户所属实体）、pledged（subject：质押物的 owns 持有人）——case 与 obligation 本身不是钉住对象）；或 (c) 它 `owns` 一个**模板声明 `pins: true` 的物品个体**（core 为带 `teaches` 的书与手札、带 `sympathyLink` 的媒介、署名杰作；契据、账簿、信件等文书与普通工具不钉住——否则每个有地契的农户都进规则层；E12③ 持手札的商人仍在规则层逐日自治）；或 (d) 它与玩家有持有、义务或强立场（07 §7.2 的智能层"相关实体"）。resides、kin、citizen_of、member_of、devotee_of、employed_by 不钉住（成员以聚合计；组织本身若有职位持有人则经 (b) 钉住）。钉住实体无论所在地区层级，至少按规则层处理自己的规则；(d) 类（与玩家相关）按智能层处理（07 §7.2）。
- **(d) 类常驻统计层地区时**：其所在聚落**骨架物化**（07 §7.3 第 5 条触发清单新增一项），本人与其同户、同雇主 / 同组织的在场者、日程片段里的对手方按需物化（带 `materialized`），本人的自治按智能层**逐日**（不逐分钟）；站位与感知只在其有事件的刻对该地点计算（07 §7.2 智能层口径），其余时刻按规则层见证概率模型。于是远方情人的结识、订婚都有在场个体可用，离开后并回聚合（§7.3 第 5 条借出与并回）。

### A.15.19 聚合变体 aggregate variant

跨层规则在统计层的等价形式，schema：`{"aggregate": {"target": 聚落级账户或子账户或率字段, "closedForm" | "step": …, "split": 物化时按种子把聚合量分配给个体的规则, "merge": 并回时把个体量计入聚合的规则, "tolerance": 容差}}`；声明 `"aggregate": "auto"` 时引擎用缺省变体：只含 transfer / 数值 fact.set 的规则，对聚合账户按"个体规则 × 聚合人数"执行同一闭式，split/merge 按比例，容差取 B05.2 缺省——这让多数 rules 档作者不必手写聚合变体（07 §7.3 第 7 条）。

### A.15.20 同意 consent

动作裁决的一个**输入**（06 §6.5 第 3 步），不是事务校验。来源三种：①本人当面同意事件 `consent_given{from, to, scope: 动作族或动作 id, purpose?: [目的词], until?}`（`purpose` 缺省为空 = 不限目的；动作可声明 `purpose`，施加时 purpose ∉ consent.purpose → 事件标 `unconsented:purpose`，效力与罪名按民事④ 与法典谓词）（可由 `consent_revoked` 撤销；NPC 由 `npcDecision` 给出，读立场、关系、灵智与处境，不自动同意；玩家由界面或叙述给出），②代理同意（guardian_of、章程授权的职位、scope 含该动作族的 `mandate` 受托人，受民事④范围限制；本人 `capacity` 为 limited 时精神类与财产类的同意须由代理给出或追认，为 none 时只有代理与紧急两种来源），③法典紧急条款（民事④：哪些状态、哪些动作族免同意）。查询 `consent(from, to, scope)` 返回 有 / 代理 / 紧急 / 无。**无同意的结果**：动作照常裁决，但改为对抗检定（目标的意志 / 灵智 / 抗性 vs 行为者），事件附描述标签 `unconsented`（强制类另加 `forced`，记忆改写类加 `memory_altered`），罪名由规范栈判定——core 法典数据把人对人的强迫与改记忆定为重罪（`offense:coercion`、`offense:memory_alteration`，上位 `offense:harm`），治疗与辅助类的无同意施加按 `offense:unconsented_magic` 轻罪或豁免（法典数据）。生灵来源的 `unconsented`（附身、迷惑、作祟）不构成人间罪名，但人借生灵对人施加仍是人对人（13 §13.4）。

### A.15.21 语言与沟通 `canCommunicate(a, b)`

语言是技能族 `lang:*`（文化记录给母语，熟练度 0..3），沟通度 = 双方共同语言的最低熟练度，或经在场 companion 通译（通译的熟练度，事件记 `actedAs: interpreter`）；沟通度为 0 时对话、交易、请求、议价动作降级为"手势交易"（只能完成等价物交换、不能议价、不能缔结带条款的义务；欺骗与劝说的难度 +5），事件带标签 `gestural`。通译的回扣 = 通译以 actedAs 代办时的 `deceive` tell + 自留转移，识破走知情。**文书语言**：文书物品带事实 `language: lang:*`（缺省为写作者的母语；译本另带 `translatedFrom`、译者署名）；`canRead(x, item) = 识字技能 ∧ lang(item.language) 熟练度 ≥ 读写阈（数据，缺省 1）`；不满足时阅读只产生"看不懂的文字"知情（记文书存在与语言，不含内容），可由在场懂该语言者代读（tell(源 = 物品, actedAs: interpreter)，经失真表，可私吞可改译）或由译本代替（译本的 `records` 文本可与原件不同，由译者动作写入，`deceive` 可改译）；学会该语言后再读原件才得到原文——"复读契约发现问题"的触发点就是这次 canRead 为真的阅读。合同有多份语言文本时以哪份为准由法典 `contract_validity.authoritativeText` 决定（§A.7），条款快照仍是真相，文本只是证据。跨语言转述的衰减走失真表（05 §5.4，槽 `social:distortion`）。

### A.15.22 紧迫度 `urgency(request)`

请求事件 payload 的定点数 0..1，由动作声明的派生式给出（诊疗按伤情 / 病情严重度，救援按生命值，公务按期限），NPC 决策第 4 步"更急的事"读它；超容量的服务请求按紧迫度排队（§A.16 `service:capacity`）。

### A.15.23 争夺 contest

同刻多个互斥提案指向同一标的（exclusive 持有、声明 `contest` 的限量存量、开放债权人 `firstToSatisfy`、驻地、同一服务名额）时的裁决规则，由持有种类、义务种类、资源账户或动作声明 `contest: lottery | price | arrival | rank`；**未声明时的缺省与 core 各类标的的声明值只在 14 §14.2 的缺省表定义**（X3；本条与 01 §1.3 只引用，骰值键含序号见 14 §14.5）；在刻内"争夺池"统一裁决，不按阶段先后，不按实体 id（14 §14.2）。争夺的单位是**整个提案**（事务原子）：提案含任一争夺型原语即整体登记到争夺池，裁决后整体执行或整体得到世界内原因（14 §14.2，R4 专项①）。

### A.15.24 受限 confined 与拘禁制度 regime

`confined(x)` 为真当且仅当 x 是一条存活 `guest_of{mode: detained}` 持有的持有人。受限者位置锁定于东道分区（随东道押解而动）；**行为能力与同意能力保留**；可及动作集合 = `regime(x).allows`——拘禁制度是 `guest_of` 持有的条款 `terms.regime`，引用东道一方的数据（典狱职权表 / 官府程序条款 / 绑匪的自定条款），形状 `{allows: [动作族或动作 id], suspends: [holdingKind] （覆盖 confined 列的缺省）, keepsEffective: [holdingKind 或 持有引用]（劳役的 employed_by）, visitors: permit 种类 | open | none, escape: {guards: 选择器, difficultyRx}}`。core 缺省制度 `custody.default`：允许对话、受教与授艺（learn / service，双方到场）、签约（obligation.create；效力由法典 contract_validity 可限）、动用随身账户（transfer；买通 = transfer + emit(request)）、结社与密谋（holding.open(member_of)、计划）、申诉 / 上诉动作、仪式参与（只能在东道分区内）；禁止离开东道分区（move 出分区只有两条路：东道以 actedAs 发起的押解 / 释放，或**脱逃**——对抗检定 vs `escape.guards` 的警觉与设施 condition，成功 → `holding.close(reason: escaped)` + 事件 `escaped`（起因指向脱逃动作）→ 反应规则把案件回 pursuit、`wanted` 续期）；职能暂停按交接类表 `confined` 列。探监 = 外人按 `visitors` 取得东道 permit 后 move 到东道分区。**合法的**法律类受限（收监、羁押）由案件执行、有权职位的 actedAs 或到期项开立与解除（06 §6.3）；无权者开立 `guest_of{detained}`（绑架、俘虏、私押）**照常成立**，事件标 `authority:none`，是否构成 `offense:unlawful_detention` 由规范栈判（同意只是裁决输入、法律只打标签不拦截，05 §5.2.7、01 §1.3 同此）；无权者的 `holding.close` 提案仍被拒（"你无权放人"，06 §6.3）——放人只有物理一途（劫狱：对看守的原语 + 带人 move → `escaped`，05 §5.2.7）。

### A.15.25 职能有效 `effective(holding)`

一条持有存活不等于其职能可用。`effective(h) = alive(holder) ∧ h 未处于 suspend ∧ ¬impaired(holder) ∧ (¬confined(holder) ∨ h ∈ regime(holder).keepsEffective)`；权限、服务、日程片段、`laborHours` 都读它；代理规则在 `effective` 为假时承接（04 §4.6）。因职能而生的义务（salary）按 `effective` 为真的日累计（01 §1.4），与 wage 的"按实际工时"对称；法典可写 `salaryWhileSuspended: none | half | full`（缺省 none）。I29 不受影响：以持有人为债务人的义务照常到期。

### A.15.26 立场传导的知情门控

05 §5.6 的传导项只沿**持有者知情集合中可见的持有**传导：`visibility: 公开` 的持有视为人人可见（在可观测域 / 先验域）；`仅成员` / `仅当事人` 的持有只在持有者的知情集合含其开立事件、转述或文书，或持有者有相应 `belief`（可错）时才传导，查询 `knownHoldings(holder, target)`。于是秘密结社的会籍不会让不知情者的恶感传到该成员身上，而**误信**某人入会会传（I25 双世界口径：真相不同、四域相同则立场相同）。组织作为立场持有者时，其知情集合 = 章程指定的决策职位持有人（缺省首领）的知情集合 ∪ 组织文书（账簿、名册）。

### A.15.27 批次表象 `purports(lot)`

`lots: true` 的资源，批次元数据加 `purports`（该批次自称的资源种类或成色档，缺省 = 真实种类）。持有者的主观视图（自知域的随身账户、可观测域的货物）按 `purports` 显示，除非其知情集合含该批次的 `origin` 事件（铸造 / 掺假）或鉴定事件；成交与守恒永远按真实种类结算（I1）。"善意持有"= `¬knows(holder, origin(lot).event) ∧ ¬knows(holder, 鉴定事件)`，罪名谓词据此分善意与明知；受骗 = 按 purports 的报价付出对价而得到真实种类——骗局可表达，守恒不被绕过。core 铸币声明 `lots: true`，批次按 (发行者, 成色档, purports) 合并，正常铸币只占一个批次，所以批次数不膨胀；矿石仍不跟踪。

## A.16 core 派生值与 bounds 附表（契约附表 B；数据 `world/ontology/slots.json` 的摘录）

**每个派生值缺省就是槽**（§A.9 第 3 条）：本表不再是"允许开槽的白名单"，而是 core 派生值的 bounds、阶段与消费者清单；没列出的 core 派生值按缺省 `mul ∈ [0.5, 2]` 开槽，包的派生同样缺省开槽（在 `rules/derivations.json` 可声明 `closed` 或自定 bounds）。每行：槽 id、派生值、阶段、bounds、读它的 core 消费者（契约承诺：这些 core 规则必须读该派生值而不是绕过它）；每个槽自动有读函数 `derived(id, x)`。

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
| `weather:precipitation` | 某地区某日 `src:weather` 流入量（天气求解器输出之后、写账之前） | add, mul, min, clamp | [0, 3]× | 水量规则、作物积温、旱涝灾害（旱魃压雨由此进入） |
| `weather:temperature` | 某地区某日气温（天气求解器输出；摄氏定点数） | add, min, max, clamp | 绝对值 [−40, 50]（add ∈ [−15, 15]） | 作物积温、栖地容量、感染率、燃料季节需求、体力消耗 |
| `body:drain` / `body:recover` | 身体需求量的消耗速率 / 恢复量（§A.15） | mul, clamp | [0.25, 4]× | `body()` 闭式、睡眠与进食动作；core 修正项读 `weather:temperature` 与暴露状态 `wet`（§A.18） |
| `population:birthRate` / `population:marriageRate` | 出生率 / 婚配率（基础值读 `rules/tables/balance/population.json` 的曲线；core 修正项：住房容量占用、`granaryDays`） | mul, min, clamp | [0, 3]× | 出生反应规则、婚配候选、统计层人口闭式 |
| `economy:spread` | 商号买入 / 卖出对 `value` 的折让与加成（15 §15.2） | add, mul, clamp | [0, 1]（buy）/ [1, 3]（sell） | `quote(side)`、`settlePrice(side)`、商号定价候选 |
| `health:infectionRate` / `health:recoveryRate` | 感染率 / 康复率 | add, mul, clamp | — | 疫病规则 |
| `life:lifespan` | 个体寿命上限（物种 `lifecycle` 给基础值） | add, mul, **max**, min, clamp | [物种下限, 物种上限 × 10] | core `npcLife` 死亡时钟（修仙延寿取 max） |
| `life:aging` | 衰老对属性的年速率 | mul, min, clamp | [0, 2]× | npcLife 衰老 fact.set |
| `service:capacity` | 服务容量（每日可接次数，§A.15 紧迫度排队） | add, mul, clamp | [0, 50] | 服务请求的拖延与排队 |
| `organizations:offeringFlow` | 香火 / 会费流量 | add, mul, clamp | — | 组织反应 |
| `lending:interestRate` | 利率 | mul, clamp | 合同区间 | 放贷 |
| `transport:speed` / `transport:capacity` | 通行速度 / 运力（含驱赶头数） | mul, clamp | [0.25, 2]× | move、托运、承运发车表（§A.18）；core 修正项读 `weather:precipitation`（雨雪减速）、路况 condition、夜间 `daylight` |
| `transport:risk` | 路线风险（controls 持有人威胁、harm 密度、天气） | add, mul, min, clamp | [0, 1] | **遭遇规则与山贼 / 劫掠类自治候选必须读它**（§A.17） |
| `combat:deterrence` | 队伍威慑（护送方战力、人数、装备、护送类义务与 `mark:escort_banner` 类标签） | add, mul, max, clamp | [0, 1] | 遭遇规则、劫掠候选的 risk 项 |
| `military:strength` / `military:supply` | 军力 / 补给（05 §5.10） | add, mul, clamp | — | 战役求解器、外交筹码 |
| `diplomacy:leverage` | 外交筹码 | add, mul, clamp | — | 政体自治候选（照会、条约、宣战） |
| `law:evidenceWeight` / `law:riskPerceived` | 证据权重 / 行为者相信的法律风险 | mul, clamp | — | 判决、机会评估 |
| `social:eventWeight` / `social:rumorSpeed` / `social:rumorReach` | 事件权重 / 传闻速度与范围 | mul, clamp | — | 立场、传闻 |
| `social:distortion` | 转述失真强度（失真表各条的触发概率乘子） | mul, clamp | [0, 3]× | tell 版本生成（含通译翻译与跨语言转述，`when` 可读 `canCommunicate(讲者, 听者)`） |
| `social:recall` / `social:credence` | 记忆可得 / 采信（§A.15） | mul, clamp | [0, 1] | 知情域检索、证人可信度、tell 版本采纳 |
| `tax:inspection` | 税吏查验检出概率（`collection.assessed`，§A.7） | mul, clamp | [0, 1] | 查验检定、`taxGap` |
| `hydrology:split` | 河段多出边的分水份额（05 §5.5） | mul, clamp | 和归一 | 水量传递 |
| `super:efficacy` / `super:activity` / `super:hauntPressure` / `super:sealDecay` | 13 章 | mul, clamp | — | 仪式、作祟、封印 |
| `world:pace` | 节奏系数（只向 paceable 槽提供） | — | 档位表 | 派生合成器 |

新增一行只是登记 bounds（数据），不需要契约版本；包不能改 core 派生的 bounds，但可以给自己的派生声明任意 bounds；`pack doc` 的"接口缺口"报告列出包想影响而 core 声明为 `closed` 的派生。修正项可声明 `exclusiveGroup`（同组只取一个：按 `priority` 字段，同优先级取值最大者）。

## A.17 core 自治候选与遭遇规则的输入附表（契约附表 C）

包要影响 NPC "会不会做某事"，只需影响这张表里列出的派生值（经 §A.16 的槽或扩展事实）；core 候选不读表外的真相量。

| core 候选 / 规则 | 读的派生值（全部经主观视图） |
|---|---|
| 劫掠 / 拦路（山贼、敌军、首领的 `need:territory` / `need:money`） | `transport:risk` 的成因项、目标队伍的 `combat:deterrence`、目标货值（主观报价）、`law:riskPerceived` |
| 路线遭遇规则（09 E13） | `standing(控制者, 队伍)`、`combat:deterrence(队伍)`、`transport:risk` |
| 迁居 / 逃户 | 主观税差与价差（`quoteKnown`）、`law:riskPerceived`、kin / resides 牵绊 |
| 挤兑 / 拒收 | `believes(self, bank_insolvent)`、`interestRate` |
| 商号进货 / 惜售 / 定价 | `economy:restock`、主观报价、周转保留 |
| 求医 / 就学 | `service:capacity` 的拖延答复、`urgency`、主观价格、**对类别的立场** `standing(self, category:<职业或族群>, 'trust')`（impress 事件的 target 可为类别键，05 §5.6） |
| 进食 / 睡眠 / 饮水（`need:温饱`、`need:休息`） | `body(self, satiety | stamina | hydration)` 与其阈值状态、主观价格、日程空档 |
| 报案 / 告发 | `evidenceScore` 预估、`law:riskPerceived`、立场 |
| 组织：立法 / 征发 / 宣战 / 照会 | 公库、`military:strength`、`diplomacy:leverage`、`standing` |
| 用工 / 招工 / 挖人（雇主侧，05 §5.1 商号经营）与辞工 / 跳槽（雇员侧 `need:money`） | `wageQuote`（主观：本地 `market_report` 的工价项或听说的工价）、现有条款、`laborHours` 缺口、立场 |
| 脱逃 / 买通（受限者，`need:freedom`） | `regime(self).escape` 的难度预估、看守立场、`law:riskPerceived`、随身账户 |
| 读来信 / 找人代读（反应规则 `read_on_receipt` 产生的候选，05 §5.4） | `canRead(self, 信)`、在场者中 `canRead` 为真者与对其的 `standing(self, x, 'trust')`、信件 `purports` 的寄件人 |

## A.18 core 缺省数据表的形状与位置（数值留给实现阶段与 BalSim 标定）

日常题集的失分几乎全在"机制有、数值没有"。本节只登记 core 缺省表的**位置、形状与示例行**，数值一律是占位、带 bounds，由实现阶段与 BalSim 标定；正文（06 §6.4、06 §6.7、05 §5.6、05 §5.5）只引用本节。所有表都是 `rules/tables/balance/*.json` 下的数据表（§A.9 第 1 条：表开放，包可加行；core 行可被 `exclusiveGroup` / `decides` 覆盖但不可删）。

| 表 | 位置 | 行形状 | 示例行（占位） | 消费者 |
|---|---|---|---|---|
| 动作耗时与活动类 | `rules/tables/balance/action-costs.json` | `{selector: 动作 id 或动作族, time: 分钟 \| rx, activity: rest \| light \| heavy \| travel, durationSlot?: {min, max}（可由玩家指定时长的持续动作：采集、钓鱼、练习、旁听）, key: selector}` | `{selector: 'trade.retail', time: 5, activity: light}`、`{selector: 'talk.greet', time: 15}`、`{selector: 'gather.*', durationSlot: {min: 30, max: 480}, activity: light}`、`{selector: 'craft.recipe', time: 'recipe(id).laborMinutes', activity: 'recipe(id).activity'}`、`{selector: 'combat.bout', time: 'rounds × 1'}` | 06 §6.4 `cost.time` 的缺省；"时长由动作派生、不能自报"的派生源 |
| 身体速率 | `rules/tables/balance/body.json`（§A.15.7 已登记形状） | `{selector, need, max, drainPerHour: {rest, light, heavy, travel}, recover: {sleep: rx(设施 lodging:*, 时长), eat: rx(nutrition)}}` | `{selector: person, need: stamina, max: 100, drainPerHour: {rest: 0, light: 3, heavy: 8, travel: 5}, recover: {sleep: '12 × 小时 × lodging 系数'}}` | `body()` 闭式、睡眠与进食动作；"睡一夜接近满值""赶路 4 小时不到 0"由此可算 |
| 事件权重（立场） | `rules/tables/balance/event-weights.json` | `{verb 或事件类, target: individual \| category, dim: trust \| affinity \| respect \| fear \| attachment, weight: 定点数（立场量纲 −100..100）, halfLifeDays, value?: 价值标签, saturation: {n, factor}, key: (verb, dim)}` | `{verb: 'greet', dim: affinity, weight: 1, halfLifeDays: 30, saturation: {n: 5, factor: 0.5}}`、`{verb: 'haggle', dim: affinity, weight: -1}`、`{verb: 'settle_on_time', dim: trust, weight: 2}`（守信，05 §5.6）、`{verb: 'complete_bounty', dim: trust, weight: 4}`、`{verb: 'belief', dim: '*', weight: 'source.weight × credence'}`（belief 进权重表的唯一一行，05 §5.6） | 05 §5.6 印象；06 §6.7 寒暄与议价的上限；立场量纲由本表唯一定义 |
| 典型产量与收入 | `rules/tables/balance/yields.json` | `{selector: 资源点类型 × 作物 \| 物种 \| 技能族 × 阶, perUnit: {unit: 亩 \| 头 \| 工日, qty}, laborPerUnit: 工日, season?, quality?: rx, key: selector}` | `{selector: 'field:wheat', perUnit: {unit: 亩, qty: 150 斤}, laborPerUnit: {sow: 0.5, harvest: 1}}`、`{selector: 'gather:herb', perUnit: {unit: 工日, qty: 20 株}}`、`{selector: 'skill:carpentry@1', perUnit: {unit: 工日, qty: 30 文}}` | 05 §5.5 田地生长的基准值（× 积温 × condition × `economy:yield`）；06 §6.7 期望值天花板；15 §15.2 劳务估值的典型日收入项——三者读同一张表 |
| 熟练度增长 | `rules/tables/balance/learning.json` | `{selector: 技能族, perHour: {practice, work, taught}, dailyCap, tierThresholds: [入门, 熟练, 精通, …], failure: {noProgress, regress}}` | `{selector: 'skill:gather', perHour: {work: 1}, dailyCap: 8, tierThresholds: [20, 60, 120]}` | 06 §6.3 learn；做活带熟练度 = 动作 outcomes 的 `learn{source: practice}` 读本表 `work` 列（采集、木工、练习都如此） |
| 营业时间与日程端点 | `rules/tables/schedule.json` | `{selector: 商号类型 \| 职业, open: 时辰, close: 时辰, days?: 休市规则}`；**端点口径**：区间一律**左闭右开** `[open 初刻, close 初刻)`——"辰时至酉时" = 辰初开门、酉初打烊（约 07:00–17:00），酉时内已关门；日程片段同此 | `{selector: 'shop.grocery', open: 辰, close: 酉}` | 01 §1.5 服务与营业时间；05 §5.8 日程片段 |
| 承运与发车 | `rules/tables/carriers.json` | `{selector: 驿站 \| 车行 \| 船行 \| 镖局, departures: [{at: 时辰 \| onDemand, cutoff: 时辰}], speed: 里/时辰（经 `transport:speed`）, nightTravel: false, batching: {minLoad?, waitDays}}` | `{selector: 'post', departures: [{at: 辰}], speed: 15}`（辰初发，当日截件午初后次日发）、`{selector: 'cart', departures: [{at: onDemand, cutoff: 午}], nightTravel: false}` | 05 §5.1 托运与驿传：delivery 的实际出发 = 下一班 `departures`，到达 = 出发 + 路程 ÷ 速度（夜不行车则顺延），条款到期日只是违约线 |
| 暴露状态 | `ontology/statuses.json` + core 反应规则 `weather_exposure`（`rules/reactions/core.json`） | 反应 `{when: 在户外或在途 ∧ derived('weather:precipitation', place) ≥ 阈 ∧ ¬sheltered(actor)（车厢、蓑衣、屋檐是设施 / 物品性状）, do: status(wet{until: 干燥条件 rx})}`；同形 `cold` / `heatstroke` 读 `weather:temperature`；状态行声明对 `body:drain`、`health:infectionRate`、`transport:speed` 的修正项 | `{status: wet, modifiers: [{target: 'body:drain', stage: mul, value: 1.2}, {target: 'health:infectionRate', stage: mul, value: 1.5}], until: 'sheltered ≥ 2h ∨ 晴 ≥ 4h'}` | 05 §5.5 天气；06 §6.3 K2 交互表只管元素 × 材质，天气 × 人体走本规则 |
| 失真表 core 行 | `rules/distortion.json` | 每条 `{id, when, op, p, fields?}`（05 §5.4）；`replace_detail` 的 `fields` 白名单 `[{field, p}]`：**`date` 行 p = 0**（二手转述不换日期，只可 `drop_clause` 省略）、`amount` 走 `scale_quantity`、`cause_of_death` / `actor` 可按同类替换 | `{id: 'core.detail', op: replace_detail, fields: [{field: cause_of_death, p: 0.3}, {field: date, p: 0}]}` | 05 §5.4 tell 版本生成；"回村各人都说初三"由 `date` 行保证 |
| 借贷利率区间 | `ontology/obligations.json` loan 条目 `terms.rate: [0, 0.05]` | 下限 0 = 无息借款，条款快照记 `rate: 0` 并显示"无息"（03 §3.3） | — | `obligation.create` 的条款范围校验（06 §6.3） |

**数值方案新增的参数表**（只登记名称与形状，数值与示例行见数值方案 §2）：均在 `rules/tables/balance/` 下，文件通用形状为 `{schema: "balance/<表名>@1", params: [{id, value, bounds, unit, basis, playDecision, source}], rows: [{key, …, bounds}], curves: [{id, points, interp, bounds}]}`（三区皆可空；`basis` ∈ play / derived / calibrate / hard）。`learning.json`、`yields.json` 在上表形状上扩列（`tierFactor`、`difficultyGate`、`breakthrough`、`milestone`、`workDaysPerYear` 等）。新增 17 个：`progression.json`、`attributes.json`、`combat.json`、`economy.json`、`credit.json`、`tax.json`、`loot.json`、`crafting.json`、`ecology.json`、`population.json`（§A.16 已引用）、`social.json`、`health.json`、`transport.json`（与 `carriers.json` 分工，发车表不动）、`law.json`（行键 `polity:type`）、`magic.json`、`pace.json`（行 = 槽 × 延迟类 / 均衡类登记）、`targets.json`（行 = `{metric, target, hardFloor?, tolerance?, grade, suite, fixture, seeds, years, pace, stage}`）。

**不进本节的**：价格基准、税率、俸禄表、法典程序期限——它们各有唯一定义处（15 §15.3、§A.7 `schedule`）。本节各表的 `key` 字段使表行主键重复在加载期报冲突（§A.9 合并语义）。
