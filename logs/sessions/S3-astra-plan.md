# S3 义务统一：第二轮执行拆卡草案

日期：2026-10-18。工作树：`F:/dnd-wt/S3`，分支 `s3`。只读核对时 HEAD 为 `ac86f3d9`（第一轮 WIP 已由主会话提交），工作区干净。本轮只写本文件，不改代码、题面、判分、PLAN 或 Git 状态，不启动代理、不调用模型。供主会话独立审定后派工。

## 1. 完整结果、计数口径与边界

依据 `docs/架构设计/10-现状映射与迁移路线.md:100,112–116`：统一债务处理、实际接通义务种类及两端消失、宽限、票据、在场/寄汇、签署身份、累计/历法、到期调度；补 exclusive、redenominated、语言沟通、服务容量、salary 有效期间、wageQuote、limitation、关闭后债权及损失填补。不是再抽几个纯函数即结束。

原退出标准保留：run-001 E04/E05/E12/E18 **逐题**合理率 ≥80%（部分不算）；run-002 E1/E3/N1、run-003 E15 的义务条目及 I29 通过；没有逐日写累计债务余额；日推进下降可测，月推进 ≤120 秒。账本守恒、实际位置、私密、签署快照、继承份额/责任限额、旧存档回放和 I31 顺序均保留。

**不能宣称找到了原始“41 处”的同一张表。** 设计只给总数，没有 41 行出处；第一轮报告也明确没有完成逐点映射。当前复现其初筛，得到 **38 个跟踪模块**（交接报告当时为 37），这仍是文件数。按下列可复核责任口径，本次列出 **68 个现存执行/结算/生命周期处理点 P01–P68，26 个读侧/适配责任项 R01–R26，共 94 项**；一个点可含同一责任的创建/清偿/投影函数，一个函数也可有多个独立业务分支。不是 94 个独立债务，也不是把 41 改成 94 个已归并成果。

其中第一轮可复用的归并仍仅 **P01–P08 八处**；其余 60 个执行责任点需要迁入、接线或保留为薄适配。26 个消费者不是新增归并业绩，不要求为了清单去重写本来有效的读逻辑。当前表是后续逐项交付的定位依据，不另造验证清单的工具。新增但尚无处理器的设计要求单列在第 4 节，未混入现存数量。

实际执行过的只读检索（每次 shell 命令前均设置 `$env:TEMP='F:/dnd-tmp'; $env:TMP='F:/dnd-tmp'`）：

```powershell
git grep -n -E 'category.*debt|category.*contract|accruedTo|defaultGraceMinutes' -- server-plugin
git grep -l -E 'category.*debt|category.*contract|accruedTo|defaultGraceMinutes' -- server-plugin
git grep -n -E 'obligations|arrears|bank_bill|nextRent|nextDividend|onDebtorGone|onCreditorGone' -- server-plugin
git grep -n -E 'arrears|unpaid|wage|compensation|bounty|gratitude|grievance|vow|approval|forward|pact|bank_bill' -- server-plugin
```

初筛 38 文件（后缀均 `.mjs`）：action-affordances、advance-registry、agriculture、business、chronicle、civic、compat/v2-phase1-engine、consistency-evidence、contracts、credit、education-state、education、engine、finance-assets、finance-bank、hidden-passives、high-nobility、holding-sources、labor-market、law、magic-mind-space、magic-ritual、medicine、nation-founding、npc-cognition、npc-intelligence、npc-memory、npc-relations、obligation-kinds、obligation-state、public-projects、scene-card、state-notices、storage、summons、transition、ui-affairs、world-events。补搜发现 office-salary、organizations、military、war-diplomacy 等真实欠款路径，不能遗漏。

卡号：**A 核心、共享接点与性能；B 金融和资产；C 用工、服务与法律；D 承运、条件义务与组织间履约；E 离屏生活、消费者与原题验收。** 按 P 表归属，A 13、B 24、C 13、D 15、E 3。E 另有大量读侧接线与探针场景，不能按 P 数估工作量。

## 2. 现存处理点逐项归属

路径省略 `server-plugin/`；行号以当前工作树为准。状态“已抽取”只表示该计算已复用，并不表示所属种类完成。

| 点 | 位置 / 义务种类 | 现状、应改法 | 卡 |
|---|---|---|---|
| P01 | contracts:150–155 `advanceContracts` / 通用欠款 | 已用 `debtDue/currentGrace`。保留协议清算防双付；到期和清偿分开，后续用统一到期项。 | A |
| P02 | credit:167 `defaultDebt` / 借贷违约时刻 | 已共用 grace；保留抵押、立案与差额。程序依据应来自债务法域而非玩家当前位置。 | B |
| P03 | credit:317 `advanceCredit` / 借贷违约触发 | 已共用宽限，仍独立分支。换成通用违约反应，不能因在途/失能暂停时钟。 | B |
| P04 | finance-bank:132–139 `bankTrade(prepay)` / 提前清偿 | 已共用 `accruedInterest`；仍是旧 30 日口径。接累计结果及清偿原子事务，拒绝不得先改借据。 | B |
| P05 | finance-bank:226–230 `advanceBankFinance` / 玩家借贷分期 | 已用 `installmentState`；逾期时刻已记录。补完整逾期期数、罚息/转欠款与代偿。 | B |
| P06 | finance-bank:265 / 玩家放贷的 NPC 宽限 | 已用 currentGrace，但仍等总期限才违约。每期到期、欠额与宽限统一，不能免除中途欠期。 | B |
| P07 | finance-bank:185–187 `bankTrade(redeem)` / 赎当截止 | 已用 pawnDeadline；接当票代表物与到场，边界前后结果一致。 | B |
| P08 | finance-bank:251–253 / 流当截止 | 已用 pawnDeadline，只改状态。接当物处置、交易与旧当票失效；留存未到期当票。 | B |
| P09 | contracts:76–110 `validateTradeCharge/chargeTrade` / 赊购 | 自算授信余额并创建 debt。授信读统一未偿余额，创建同一义务及兼容投影，维持原额度和信任限制。 | A |
| P10 | contracts:112–124 `repayDebt` / 赊购清偿 | 已加到场，仍直接付总欠额及同步合同。接 settle 返回的实际支付，保留一次税费及销货账。 | A |
| P11 | contracts:57–75 `refundContractEscrow/releaseBusinessLease` / 租赁押金 | 托管抵扣与退款独立算。统一抵扣/退款，已终止合同未清债权保留；托管位置随保管人。 | A |
| P12 | contracts:41–55,130–144；business `businessAction` / 店铺采购、雇佣、订单、租约 | 各入口建约/履行、到期退款并取消关联订单。种类声明驱动状态和钱物结算；关店不取消已赚工资、已交货债权。business 文件由 B 适配，通用 contracts 文件只由 A 改。 | A（规则），B（调用） |
| P13 | contracts:147–148；engine:385–387 / 住宿 | 住宿按 expires 独立关闭。复用已存在 lodges 持有/到期项；房费和住宿权不重复创建债务。 | A |
| P14 | credit:105–141 `loanTerms/openLoan` / 借款本金与利息 | 按 days/30 预算总息、固定玩家借款。统一开立入口、币种、历法与担保，保留贷款条件与本金唯一去向。 | B |
| P15 | credit:145–165 `repayCredit` / 贷款部分清偿 | 玩家专用、手工 paid/抵押/案件同步。通用 payer/代理支持，按实际清偿额同步一次，不重复解押。 | B |
| P16 | credit `creditTrade` 存款/支取分支 / deposit | 银行 accounts 与现金账并存。把存款债权接 deposit 种类，现金仍走既有账本；提款前结算应计部分。 | B |
| P17 | credit:260–280 `creditTrade(work)` / 短工 | 预付托管、完工整笔付或中断退款。用 service/wage 约定和实际履行，不删除中断及技能成长。 | B |
| P18 | credit:181–195 `settlePartnership` / 退伙分成 | 算利润生成 partnership debt。分红/退股补偿走种类条款，终止后旧款继续可清偿。 | B |
| P19 | finance-bank:141–150 `bankTrade(extend)` / 展期 | 独算剩余本金和新息。amend 只影响未来期间，不覆盖原签身份、已计息和过去欠期。 | B |
| P20 | finance-bank:152–172 `bankTrade(lend/collect)` / 玩家放贷 | 最大 90 天、独立借据及收款。开放已授权一年十二期输入，保留放贷信用/现金约束，统一创建和催收。 | B |
| P21 | finance-bank:232–249 / 存款结息 | 仅结息更新 accruedTo 已改善；仍自算浮点 raw、Fraction、Arrears、复利及准备金。迁为 deposit 条款+结息事件，保留原合同算法/余数与准备金限制。 | B |
| P22 | finance-bank:255–272 `loanPayment/advanceBankFinance` / NPC 还款 | 每日 nextPayment 重写；另算 completed/target，失能只阻付款。用统一分期应付，收入/到期/可达等真正变化触发偿还；无变化不得每日写游标。 | B |
| P23 | credit:70–102 `pledge/releasePledge`，finance-bank:189–201 auction / 质押与当物 | 手工托管、没收、拍卖及盈余返还。保留物品实例/所有权链，改通用担保清算；NPC 典当调用同入口。 | B |
| P24 | finance-bank:202–217 `bill/cash_bill` / 汇票 | 只有 bank_bill 记录；兑付动 source vault，destination 扣后又加，缺实体票据/内部头寸。改为 bill+代表物，兑付从当地现金支付，另留网点间义务。 | B |
| P25 | finance-assets:49–105 `netAssets/operatingProfit/payDividend` / 股份与分红 | 股值会变，但分红仅限制现金，没有应先还债约束。统一债务净值与清偿顺位，保留 share 与利润来源。 | B |
| P26 | finance-assets:199,227–235 `assetTrade/rentDue` / 出租 | 每月租金、欠租记录，已有 condition 减免；无正常退租操作。改历法累计及 terminate/vacate、停用/恢复事件截段。 | B |
| P27 | finance-assets:275–277 / 欠租违约 | deadline 自带宽限再自行立案，容易与通用宽限重复。规范 dueAt/grace 分工，保留一次立案和历史金额。 | B |
| P28 | finance-assets:158,237–272 `fairWage/workshopShift` / 旧工坊雇佣 | 工价独算、每天生产和付款。工价读 wageQuote，工资读有效工时；生产消耗是实际行为，不能当累计噪声删掉。 | B |
| P29 | labor-market:172–181 `settleEmploymentPay` / 工资欠款 | 按本次 minutes 取整、扣现金/保证金、建 wage debt。统一跨段工时累计及取整，避免拆段多付，保留已赚欠薪。 | C |
| P30 | labor-market:237–248 `settleArrears` / 欠薪追索 | 独立宽限、立案、两天离职。用统一违约查询/法律入口，增加矿工及工资优先执行接线。 | C |
| P31 | labor-market `sign/refundGuarantee/advanceLaborMarket/laborTrade` / 用工存续 | 签约、保证金返还、罢工与生产混在推进。雇佣持有约束保留，工资/保证金归义务，结束只停未来累计。 | C |
| P32 | office-salary:14–69 / salary | 已查当前 effective，但月末按整月发，历史有效期间/half/full 缺。累计任职有效片段，欠俸成为独立债权，死后可路由而非永久跳过。 | B |
| P33 | medicine:82–89 `pay` / 诊疗欠费 | 治疗结束创建 medicine debt。按 service 费用事实建 compensation/fee，保留药材与基金真实支出。 | C |
| P34 | medicine:175 / 医疗旧债收款 | 每日遍历欠费，直接远程 financeTransfer。改可达清偿或寄汇，统一余额、时效与欠款追讨。 | C |
| P35 | education:138–139,189–195 / 授课工资 | 教课已有总时数差额计酬并调用 settleEmploymentPay，创建裸 workshop。保留差额算法，签约与服务名额接统一入口。 | C |
| P36 | public-projects:36–150 / 公共工程工资/托管退款 | 整期预留，每日按真实工作付工资，完工退余。工资义务接 actual labor；公账授权、预留、停工退款均保留。 | C |
| P37 | public-projects:207–249 `handle/collectRent/advanceHousing` / 宅基地年租 | 年租+arrears 手工叠加，未入普通 debt。用 rent 年锚义务；批准权限与房屋真实状态继续读取。 | C |
| P38 | organizations:270–318 `advanceOrganizations` / 会费 | arrears 存欠期数，月循环收取/除名。改 upkeep 应付/欠期投影；除名不能自动抹旧应付款。 | E |
| P39 | military:325–350 `armyPayday`；duty / 军饷与佣金 | aggregate arrears、月饷拆给军人/佣兵，服役另有工资记录。统一 wage/upkeep，保留统计人口、个人领取和军队现金守恒。 | D |
| P40 | war-diplomacy:98,144；nation-founding:187 / 朝贡 | 每月 owed=amount+arrears，现金不足记欠；建国议和也创建。迁 periodic 义务；立场反应只由真实欠缴事件触发。 | D |
| P41 | monster-society `societyAgreement/installment/breach` / 贸易、朝贡、通行 | 独立十天一期的协议记录。用 pact/delivery/periodic 条款，保留领导授权与守约/违约传播。 | D |
| P42 | npc-obligations `createNpcObligation/advanceNpcObligations` / 会面、等候 | 预约互斥、出席、期限自管。统一 promise/exclusive，日程和出席事实继续用原模拟。 | D |
| P43 | npc-obligations `createNpcDelivery/nextNpcObligationMinute` / NPC 送货 | 两版本兼容已修形状；路程/失败方自管。接 delivery 统一种类、载体及托存，保留路线准入。 | D |
| P44 | engine:617–619,762–814 `promise/deliver/move` / 付款、带路、送货 | 裸义务、金额巧合查重、分散完成状态。薄路由到统一入口；按来源/义务 id 去重，保留旧回执分支。D 提供处理器，A 独占 engine 修改。 | A |
| P45 | checks:73,105 / 协助履行 | 检定直接标义务完成。改由履行事件完成 service/promise，成功/失败与资源结果一致。 | A |
| P46 | advance-registry:335–350 `deliveries` / 自动交付 | 遍历义务、抓错误写违约。按到期项调用统一履行，保留失败责任及货物去向。 | A |
| P47 | transport `quoteTransport/bookTransport/advanceTransport` / 托运、护卫费 | 运输载量/天气等待存在，护卫一次报价。护卫按真实滞留期间累计，预付款冲抵、缺额成债。 | D |
| P48 | transport `leaseTransportAsset/collectTransport/destroyTransportAsset` / 车船租用、交付货损 | 有位置/载体/毁损路线；缺完整货损请求与保管义务。租金归 rent，货到托存 bailment，受潮/短少发 compensation。 | D |
| P49 | post `sendPost/advancePost/openPost` / 驿递 | 实体路段、签收、私密存在，未承运寄汇结算。票据作为载荷走既有路由，到达再清偿，丢失不等于债权消灭。 | D |
| P50 | bounty `issueWanted/payReward/deliverFugitive/bountyQuestAction` / 悬赏 | 有财政预留及追捕，按具体猎人流程付奖。开放债权人、同刻争夺后唯一付奖，保留真实完成证据。 | D |
| P51 | quest-board `close/acceptNpc/advanceQuestBoard` / 玩家发单、NPC 接单 | 任务 escrow/reservation 另成闭环。统一服务/交付/悬赏结算，取消退余而非抹已履行部分。 | D |
| P52 | engine 传统 quest 入口 / 旧委托报酬 | 与 quest-board 并存。路由适配保留旧任务奖励、经验与回执，不产生第二份可付债务。 | A |
| P53 | agriculture:296–345 `settleVillageTrade` / 村粮预付托运 | village_trade 独立预付款、交付、收款/税账；不是任意青苗预售。迁 delivery，新增 forward 可复用真实粮库存交割。 | E |
| P54 | law `registerCreditDefault/deposit/settleCreditCase/lawAction` / 判决、罚金、赔偿 | 案件 paid/discharged 与 debt 手工互写。案件处理责任保留，付款归统一义务；加入 limitation、同损失总额、已支付扣除。 | C |
| P55 | npc-crime:76–118 `settleNpcSentence/advanceNpcJustice` / NPC 判罚与领赔 | 到庭整笔付款、受害人到庭领取；与玩家案件另算。接同一 judgment/compensation，保留在场/拘禁和私密。 | C |
| P56 | family-law:32–60 `adjudicateFamilyDispute/recoverFamilyCompensation` / 侵吞返还 | 自算 judgment.compensation-recovered。统一剩余损失与代位，不允许同一财产返还后又赔全额。 | C |
| P57 | transition:600–623,952–1028 / 遗产债权导入/清偿/托管 | 已支持债权、份额、工资优先和清算；不是从零新建。统一 amountDue/settle，协议持有唯一债权，补关闭后申报/责任限额。 | A |
| P58 | transition:674–755 / 存款、合同、用工继承 | 专用 move/splitDeposits、routeContracts。改种类路由消费；尊重合同 assume_by_heirs，继承不擅自改期限/提前清算。 | A |
| P59 | holding-sources:394–402 / 债务快照与双向投影 | 同步旧 debt→obligations，可能与协议导入构成第二写源。确定 canonical id，兼容投影单向派生；保留旧存档验证。 | A |
| P60 | governance `runRequest/advanceGovernance/advanceOffices` / 批复 | 请求和授权有现成权限/期限，但未成 approval 义务。批复动作/到期/接任走统一种类，不能把授权本身等同履行。 | C |
| P61 | high-nobility:99–130 / 管事雇约与领地请求 | 裸 workshop、domain_request 另管。分别接 wage、approval；管事不得因接单获得额外财政权限。 | C |
| P62 | npc-life:621–673 / 迁居中断承诺 | 直接取消义务、写迁居原因。按种类决定替代/延期/违约；搬走不是 gone，宠物托养有真实移交。 | E |
| P63 | summons `applySummon/end/advanceSummons`；magic-ritual `applyRitual/advanceRituals` / 役灵、仪式契约 | effect 与 contract 双记录并有维护消耗。种类接入但维护/效果不重写为金融；结束结清应付款和许可期限。 | D |
| P64 | finance-tax `assessTradeTax/collectRouteTariffs` / 税负 | 即时扣税与独立记录，欠款还清时补税。用 tax 清偿事实，collected/seat 与汇解位置接通；不重做 S4 税法范围。 | B |
| P65 | boss-negotiation `negotiateBoss/breakBossAgreement` / 生灵约定 | relation.pact+事件，没有可路由义务。按约定开 pact，原交换、同意与历史仍有效。 | D |
| P66 | family-diplomacy:33–52 / 联姻附带承诺 | 联盟读另一个 obligation 状态。接统一 promise 查询及履行事件；不能把婚姻本身变成金融债。 | D |
| P67 | faith:237 / 朝圣约定 | createNpcObligation 后追加 pilgrimage。保留目的/返程地，种类路由同预约/护送。 | D |
| P68 | wildlife-society:53–65；wildlife-awakening pact / 报恩、生灵契约 | gratitude 是事件汇总，pactTerms 挂 companion；无统一恩债执行。已有事实保留，明确新立义务与历史感恩的区别，不能自动把所有感恩生成债务。 | D |

P12 有一个明确跨文件调用接点：其规则归 A，business 适配归 B，**没有共享文件写权限**。A 的 13 点计数包含 P12，B 不再重复计数。

### 2.1 读侧及兼容项（不是新增债务）

这些项目逐个保留必要消费者。默认改为读取统一只读视图/事件；若既有投影已经正确，保留并验兼容即可。分组仅限同一输出责任，不以新增调用数记归并量。

| 项 | 文件 / 义务类别 | 当前职责与处理 | 卡 |
|---|---|---|---|
| R01 | action-affordances / debt | 还款候选读 amount-paid；改读当前可偿余额与可达性，不隐去未到期债权。 | E |
| R02 | chronicle / debt、contract、promise | 债务文本/状态变化；保留当事人和知情边界，统一金额和完成事件。 | E |
| R03 | civic / lodging、judgment | 住宿资格和判罚履行资格；不要把过期住宿或未付赔偿看成有效。 | E |
| R04 | consistency-evidence、consistency-review、consistency-service / 全部 | 核账快照和审稿私密裁剪；保持内部核账与玩家知情不同权限，增加统一义务映射。 | E |
| R05 | education-state / wage、service | 按合同期限找在岗教师；改读有效服务/雇佣，已结束仍欠薪不算在岗。 | C |
| R06 | hidden-passives / promise、delivery、compensation | 契约见证、送货、补偿匹配；使用真实履行事件，保持禁止私拆和补偿先后条件。 | E |
| R07 | npc-cognition:115 / debt | 催讨仅看 deadline 与 amount-paid；改 due/overdue，别跳过分期欠款。 | E |
| R08 | npc-intelligence:170 / debt | 推断债务压力；改统一余额/期数/时效，只读本 NPC 可知内容。 | E |
| R09 | npc-memory / 全部、salary | 状态变化形成记忆/欠俸关切；同一次违约只记一次，保留私密。 | E |
| R10 | npc-relations / promise、debt | 完成/违约变更关系；消费一次语义事件，不被兼容双写触发两次。 | E |
| R11 | scene-card / 全部 | 进行中、期限、欠款摘要；统一 view，不能向不知情玩家显示离屏真相。 | E |
| R12 | state-notices / 全部 | 状态提示；投影字段变动不应成为新履行/违约提示。 | E |
| R13 | ui-affairs / 全部 | 债务余额/期限与任务列表；一种义务只显示一条，保留历史。 | E |
| R14 | world-events / promise、debt | 是否赠与、是否违约依赖旧 records；用义务关联及结算事件，防重复声望。 | E |
| R15 | storage / 索引、回放 | grep 命中还含普通索引注释；不是债务算法。只做新结构校验、索引失效与旧回执兼容，不删有效校验。 | A |
| R16 | compat/v2-phase1-engine / lodging | 冻结历史回放分支；保留，不纳入现代算法迁移，不增加新玩法。 | A |
| R17 | applied-effects、career-metrics / 所有履行 | 回执效果与职业里程碑读结果；确保迁移后数量/顺序与旧证明有效。 | E |
| R18 | subjective-view / promise 等 | 本人承诺/已知活跃义务；保持 cognition gate，不读全世界债权表。 | E |
| R19 | ui-history、ui-messages、ui-overview / 全部 | 历史、联系人、概览；保留当前可知视图及兼容 id。 | E |
| R20 | employment-state / wage、promise | 实际工时与预约阻塞区间；保留事实时数，统一 exclusive/effective 消费。 | C |
| R21 | advance-layers、npc-autonomy、npc-decision、festival、magic-movement / promise | 层级钉住、行动冲突、指纹和预约读取；保留回放版本，只替换现代查询入口。advance-layers 属 A，其余属 E。 | A/E（按文件） |
| R22 | entity-view:148 / salary | remuneration 汇总 office_salary.arrears；统一欠俸查询，不将现任职位投影复制为历史债权。 | A |
| R23 | business `businessReport/businessAction` / contract、debt | 利润/订单、关闭时取消依赖；余额读统一视图，关闭仍保留债权。 | B |
| R24 | organization-state、family-state、medicine-state、tribal-awakening / upkeep | 初始化成员 arrears=0 不是累计算法；保留兼容创建形状，实际会费由 P38 唯一处理。 | E（medicine-state 属 C） |
| R25 | magic-mind-space / contract | contract_counter 是解除/对抗证据，不是新债务；接相应状态事件，保留合法性与法术消耗。 | D |
| R26 | nation-founding:119,151；high-nobility 等 / employment | 叛变跟随/职位服务消费者，不能仅按 contract.status 猜有效；由各文件所属 D、C 改读统一视图。 | D/C |

obligation-state、obligation-kinds、contract-state、obligation-presence 是上述多点的共同责任层，由 A 独占；不再把每个工具函数算一个旧债务点。engine、advance-registry、holding-sources、storage 同理：P/R 表列的是其实际业务或适配责任，不是要求拆掉模块。

## 3. 八道原题、失分与责任函数

### 3.1 run-001：逐条列出，保留已得分

题面读自 `docs/probes/run-001/events.md:25–37,78–83,116–120`；逐项证据读自 `tests/probes/run-001/e04.mjs,e05.mjs,e12.mjs,e18.mjs` 与 `F:/dnd/logs/sessions/S3-probes-before.json`。以下分数复用第一轮报告，**本规划没有重跑探针**，代码定位与 HEAD 对应。

| 条目 / 原判 | 缺口或应保留行为 | 模块、函数和改法 / 卡 |
|---|---|---|
| E04-1 部分 | 玩家盗采会扣储量，NPC 不会夜盗 | C：`npcCrimePlan/commitNpcCrime` 接 `extraction.mine` 的 actor 化采掘服务；同一矿脉账户扣减，不能复制一份 NPC 储量。 |
| E04-2 缺失 | 无正规矿工生产/停工，供给未联动物价和打造成本 | C：`laborOffers/settleShift` 支持矿口工作与欠薪停工；`mine` 共用产出约束。E：`settlement-trade`、`shop` 的现有供给消费者接真实产量，制造报价读同一投入价；不在 S3 重写整个 S5 市场。 |
| E04-3 部分 | 矿口法域能解析，但目前只改势力立场；缺买赃责任 | C：`mine→registerIncident→adjudicateLegalCase`，接该法域合法程序与赃物证据/知情，补实际登记的盗采/收赃罪名数据（A 落共享规则）；不得给整批无追溯矿石凭空贴赃物标签。 |
| E04-4 部分 | 有通用欠薪罢工，无矿工到诉讼执行链 | C：`settleEmploymentPay/settleArrears`、`registerCreditDefault/lawAction`。A：复用 `transition.settleClaims` 已有 `{funeral:0,wage:1,tax:2}` 或法典 debtOrder；不能声称工资优先算法完全不存在。补活体矿主判决执行及清算链。 |
| E04-5 合理 | 储量归零不能再产矿 | 保持原断言；C 的正规/非法/玩家/NPC 共用零储量边界。 |
| E05-1 合理 | 重量/体积/座位超载拒运 | 保持 `quoteTransport/bookTransport` 校验，D 不因远方订单绕开。 |
| E05-2 部分 | 天气插入 wait，但护卫费下单固定 | D：`bookTransport/advanceTransport` 以履约实际起止与等待区间累计 escort wage；B 的统一金额结果处理预付抵扣。 |
| E05-3 合理 | 逐段、逐政体收税 | B/D 保持 `tradeTax/assessTradeTax` 与每段经过事件，不重复征税。 |
| E05-4 缺失 | 受潮批次与契约索赔缺 | D：`advanceTransport/transportIncident` 保留受潮批次/损失事件，创建一次 compensation；C 的损失填补阻止重复赔偿。题面是“降价或索赔”，可先用足额可追溯索赔闭合。 |
| E05-5 部分 | 未到远方无法下单，但应在到达前价格未知 | D：`quoteTransport/transport-route` 接已有远方郡座标/路线端点，只解出运输目的地。E：`remote-generation.seatLocation/unfoldRemoteAt` 保留玩家首次到达的物化边界与价格知情；不得为下单提前生成全部本地居民/行情。 |
| E05-6 合理 | 指定真实兑付网点 | B：`bankTrade(cash_bill)` 重构票据后继续测试无网点/错网点/准备金不足拒付、零副作用。 |
| E12-1 合理 | 结息不重复，短推进幂等 | B/A：存款现有游标证据有效；追加历法/提前支取/余额变化分段，不把“10期无重复”当全年金额已正确。 |
| E12-2 部分 | 一年12期被90天上限拒；放贷方缺每期逾期与罚息 | B：`borrowerTerms/bankTrade(lend)/advanceBankFinance/loanPayment` 与 `installmentState`；A 共同累计函数。长约是题面已授权输入，期限上限及工具/schema 由 A 一次落地。罚息按真实条款；无罚息约定转欠款，不任意加息。 |
| E12-3 部分 | 月租有，租户中途退租入口无 | B：`assetTrade/rentDue/advanceFinanceAssets`，新增明确 terminate/vacate 动作；A 接 engine/tools；以 endedAt 截止未来累计，已欠租仍追偿。 |
| E12-4 缺失 | 宠物仅 follow/stay，托养和受托人搬走/死亡缺 | E：`petAction/advancePets` 开 custody/service，按真实食物库存喂养；`npc-life` 迁居移交/违约；A 的 gone 路由处理死亡，不能自动消灭宠物或凭空喂养。 |
| E12-5 缺失 | 公田自动收，玩家私田/无人收割分支缺 | E：`agricultureAction/sow/harvest/advanceAgriculture/expire` 建真实私田及成熟后的未收割状态；到腐败事件转 sink，或有真实盗收者转账户。选择“腐烂”即可符合原题，不必为此另建盗收 AI。 |
| E12-6 合理 | 回村摘要已按知情边界 | E 保持 `return-summary`、来信与传闻过滤；债务引擎能知道，不代表玩家知道腿伤。 |
| E18-1 部分 | 有罢工，缺股东有限/无限责任的执行 | B：`assetTrade/netAssets/payDividend` 提供股份与章程快照。C：案件判定责任；A：清算/继承付款限额，按法典/章程产生 shareholder compensation，不能直接扣所有股东全部家产。 |
| E18-2 部分 | 玩家流当已做，NPC 掌柜不能典当商号财物 | C：`commitNpcCrime` 增真实挪用/无权处分动作。B：`bankTrade(pawn/auction)/pledge` 接真实 actor、物品所属与经手身份；流当成交后转给买方，原票失效。 |
| E18-3 部分 | 有跨域协查，掌柜没有卷款逃亡来源 | C：`npcCrimePlan/commitNpcCrime` 写卷款资金转移和逃亡计划；D：`bounty.wantedReachedAt/advanceBounties` 继续按 law-codes 引渡，不跨法域瞬捕。 |
| E18-4 缺失 | 商号会籍、商号信誉和除名链缺 | E：`organization/advanceOrganizations/execute` 允许 business 成员，standing/消息到达后按章程表决除名；B 提供经营实体 id；不得只加正则关键词。 |
| E18-5 合理 | 当前净资产已影响股份价、亏损不分红 | B 保留 `netAssets/operatingProfit`，把新欠薪/票据/赔偿债务计入一次，防兼容双表减两次。 |

必须正面处理的判分技术债：E04-2、E05-4、E05-5、E12-4、E12-5、E18-4 的现有 check 有“最高 partial”的结构。**当前脚本即使功能完成，E05 与 E12 最多都是 4/6=66.7%，必然过不了80%。** E18 最多4/5、E04最多4/5。E 卡可以修改这些 `tests/probes/run-001/*.mjs` 的证据获取/check 实现，改成实际正常动作和负例；题面 text、题号、条数、合理定义、原通过项、>=80% 及历史 baseline 不改。先有行为证据再返回合理，不能加注释/字段骗 regex。第一轮 JSON、原失败记录不覆盖。

各题最低 4/5、5/6、5/6、4/5 是退出底线，不是挑一项弃做的许可：上表缺口均有归属；跨 S4/S5 的必要窄接点已说明，未通过部分照实报告。

### 3.2 run-002 E1：死当的祖传剑

题面 `docs/probes/run-002/events.md:7–12`。没有本题完整运行分数，下面是缺口判定，不伪造得分。

1. **按票面日期流当、不受在场影响（义务）**：已有 `s3-i29` 的一日典当/异地昏迷例，可复用；缺三个月、真实风雪滞留与当票条款全过程。B `pawnDeadline/advanceBankFinance`；D 真实滞留。
2. **成交、剑归猎户、旧当票失效（义务）**：`bankTrade(auction)/releasePledge` 有手动拍卖，缺 NPC 离屏实际成交与代表票据一并作废；B 补正常流程、单件实例和账本归属，不只 assert status=流当。
3. **从新掌柜/邻里得知（知识边界）**：E 保持商号继任身份/来访查询有可知成交记录；不属于本题 S3 必过义务条目，但作为完整场景观察项，不能声称全题通过。
4. **其他未到期当票继承有效（义务）**：A `transition.importRecordedClaims/routeContracts` 与 B 网点经营者映射；“掌柜死亡”不等于“银行实体倒闭”。测试两张票，一张已售、一张未到期，后者期限/金额不变。
5. **猎户私下卖回、价格受好感（交易）**：B 正常交易入口可复用，E 场景验证；不要求重写 S5 估价。
6. **天灾宽限仅法典明确时适用（义务）**：已有 `terms.grace` 覆盖测试，但 currentGrace 只取 civil.grace 数值，缺灾害条件与适用法域。A 统一条件查询，B/D 给真实滞留证据；同时测试无条款、条件不满足、满足三种。

### 3.3 run-002 E3：药铺东家病逝

题面 `run-002/events.md:21–26`。现有 S2 遗产/合同回归是可复用基础，`tests/s3-*` 没有该整链验收。

1. **幼子所有、监护人经营**：A 继承 owns/share 与 guardian/operates 权限，C `manageWard`、B 商号 counterpart；原债务主体与代理签约身份分开，幼子不能作为成人直接借款/收款。
2. **两个月欠薪进入遗产且允许停工（义务）**：C P29/P30 真实产生两期欠款，A P57 导入一次，继续可追偿；已辞工不删工资债。
3. **贷款继续分期、逾期才动抵押（义务）**：`world/ontology/obligations.json` 的 loan 默认 `onDebtorGone:accelerate`，不可偷偷改全部旧贷款默认来过本题。A/B 在本题新签条款明确 `assume_by_heirs`，并用当前法典选择；仍保留 accelerate 合同的既有行为。原日程/paid/担保不变，监护人/遗产代理按原期偿还。
4. **玩家股份不变、先还债再分红（义务）**：B `payDividend` 当前只看利润/现钱，必须接有优先权的到期债务；A 协议分配和 C 欠薪一致，不能先付股东再判账空。
5. **停业药价/外村就医**：C `medicine-state/medicineAction` 保持有效医师来源，E 既有商品供给消费；价格链归 S5，列观察项，不把 S3 子项测试冒充此条通过。
6. **医师认证不继承**：复用 S2 certified 的关闭/不继承；C 教学诊疗入口不得因为孩子拥有药铺就授予资格。是义务代理的必要负例。

### 3.4 run-002 N1：青苗预售契

题面 `run-002/events.md:149–151`。`s3-obligation-state:46` 只证明 forward 可注册，不证明预付/交粮可执行。

1. **歉收欠交、违约或展期（义务）**：E agriculture 的真实粮收获，D 新 forward 处理器（建议 `obligation-conditional.mjs`）负责预付→交割→shortfall→amend/default；A 注册/路由，C 法律纠纷。欠粮不能由扣钱后凭空生成粮抵掉。
2. **预售预期影响现价（市场）**：属于 S5，本阶段只提供可读未交付数量及期限，E 现有供给接口必要接线；无证据不得计本条合理。
3. **囤契垄断、大会限制（治理）**：C 复用议案权限，E/D 提供持有/集中数量。全垄断价格机制归 S5，非 S3 义务验收；不能随意取消已签契。
4. **契约继承（义务）**：D 条款+ A `obligationGoneRoute/transition`，交付数量与已付款继承，代履行人/继承责任限额正确。
5. **跨域签订按签约地法典判合同效力（义务）**：A `snapshotContractTerms` 保存签约法域/版本/actedAs/inName；C 判效力用该快照，程序宽限/顺位读当前规范，不误用玩家所在地。
6. **讼师、裁判、信用（义务的违约闭环）**：C `registerCreditDefault/lawAction` 接短交数量及估值，不仅支持 coins；E `npc-memory/npc-relations` 由真实违约/判决产生信用变化一次。保留只看自己可知证据。

### 3.5 run-003 E15：分期期间入狱

题面 `run-003/events.md:102–107`。`s3-i29:8–19` 只测一次还款日的 status 与本金，且把拘留、昏迷、远行叠在同一夹具，不是逐条件隔离或本题整链。

1. **分期照到期，配偶/同伴代付，没人付逾期罚息（义务）**：B `repayCredit/loanPayment` 目前要求 player/借款本人，A settle 应把 payer、debtor、actor/代理分开；同城真实代付，异地用 bill+post。测试代付无额外处分权，不能随意解押到代付者包里；无代付也不冻结。
2. **房租入账（义务）**：B `rentDue/advanceFinanceAssets` 不能因玩家拘留停息；现场自动代收可付 seat/held，异地不得直写玩家口袋。
3. **玉到期流当（义务）**：已有到期/宽限小测复用；B 补实体玉/当票处理，不改变显式宽限条款。
4. **房屋折旧（原有时间保证）**：沿 `facility-state` 及设施推进检查正常经过90天；不是义务重写目标，不改原折旧公式来过测。
5. **同伴自行日程（原有时间保证）**：现有 npc schedule/companions 继续推进；不得为处理入狱而锁住全世界。E 场景同时检查，A 调度优化须保持。

### 3.6 `tests/s3-*` 的证据边界

- `s3-obligation-state`：分期取整、纯函数不变、旧30日利息、heap 登记、种类存在与快照不可变。未测真实 forward/bounty/approval、实际代理权、历法锚、全部付款入口。
- `s3-i29`：三小段是借款一次到期、当票明确宽限、通用债宽限依据；没有代偿、继承后分期、真实寄汇与典当成交。保留并新增分离场景，不用手写 actorStatus 代替实际法律持有测试。
- `s3-presence`：只覆盖 repayDebt 两个人与几类位置查询。新 `settlementLocation` 仍须验证动态网点、分区可达、托管保管人、autoSettle；其他 financeTransfer 不自动因此安全。
- `s3-accrual-static`：只扫7文件、regex 只认特定逐日 amount+= 写法；`nextPayment` 每日重写、arrears 外置和 helper 写都能漏。扩大到实际义务写入模块，配行为级“无事件不写累计”与批量/分段等价，不造第二个可选清单验证器。
- `s3-run001`：必须保持逐题 >=80% 和 scriptError=0；当前四项失败有业务和旧占位 check 两层原因。整合时由 E 一次运行，不把 pure test 成功替代它。

## 4. 不在“八处纯计算”内的必需交付与共享接口

建议复用现有文件，以 `obligation-state` 为只读计算、`obligation-kinds` 为种类登记、`contract-state` 为快照/终止事实、`transition` 为两端消失、`scheduler` 为时序。允许新增一个薄的 `obligation-runtime.mjs` 处理开立/变更/履行/清偿，**不要另造一套存档、账本、事件总线或继承协议**。规范字段仍按现有设计，以下 API 名是建议，不是现存函数。

| 必需增量 | 具体结果和责任 |
|---|---|
| 通用 open/amend/settle/close/due | A 固定可调用接口，分离 debtor、creditor、payer、actor、actedAs、inName、signingPlace。结算返回真实 transferred/remaining/evidence；失败整体不写。closed 停未来累计，旧余额可追索，不能把合同结束直接等于债务已清。 |
| accruedTo 与历法 | A 新 `obligation-calendar.mjs`（若现有 calendar 提供足够日期函数则复用），按附录 A:289–291 的 anchorsBetween、闰月余日、rateBasis、一次取整实现；总额查询不写，结息/支付/条款变更才落游标。有效期间、利率/本金改变是分段事实；旧30日合同保留原约，不静默换历。B 接存息/租/薪，C 接工时，D 接护卫与军饷。 |
| 两端路由与已关闭程序 | A 复用 pursue/heirs/assume_by_heirs/accelerate；补债权在程序关闭后按原分配份额和 liabilityCap 追偿，以及法典 reopen。身体死亡/转生/财产实体解散区分；不删除双清偿保护，而让同一 canonical claim 由程序或普通路径唯一处理。 |
| exclusive | A 在创建同事务内按 subject/(debtor,subject)/debtor 与义务词汇族检查 forbid/supersede；D 的护送/交付，E 的 custody，家庭 betrothal 接入。拒绝不得留 escrow，supersede 留旧终止原因且不抹旧债。 |
| 票据/寄汇/在场 | B 创建 instrument 对应的代表 item、持有人、转让、兑付、失效；D 运输/邮递承运；A 共享 settle 使用账户实际位置及授权代收。保管人用途账户替代无位置“义务自己的账户”，保留历史账户回放适配。异地网点内部 bill 与当场现金出账分离。 |
| forward | D 补预付、交付、部分交付/短缺、展期与违约，E 接实际粮产/库存，C 接案件。只登记 kind 不算完成。 |
| bounty / approval | D：开放 creditor 谓词，同刻实际完成先提交争夺再唯一支付；C：批复动作、拒绝/逾期与承接职位。A 接通用日程和已存在 contestPool。 |
| pact/gratitude/grievance/vow | D 提供可创建/查询/履行的条款和最小实际消费者；A 两端路由与继承守恒测试。历史感恩描述不自动变为债务。不得为 S3 全面重做超自然系统。 |
| redenominated | B 的币制变化业务发一次事件；A 的快照保存原币种/金额与换算附记并支持双币宽限。按生效法域、法定比/市场率/债权人选择，已支付部分不重复折算。 |
| salary / wageQuote | B 月内历史任职有效天数，法典 none/half/full；C 实际劳动时数与签约缺省工价。A 共享 value/wageQuote 查询接既有估值输入，未签的新约/续签才采用新报价，不能改旧约工资。此处只做劳务估值接点，不借机重写全部 S5。 |
| 语言、服务容量和紧迫度 | A 提供共同语言最低熟练度/在场通译查询及动作接点；沟通0不能签有条款义务，仍可手势等价交换。C 在 medicine/education/law 服务申请接容量和 urgency 排队，同优先级用已有争夺规则；D/B 正常签约调用语言门槛。存语言技能，沟通度和容量派生；不新建永久“是否能签约”旗标。 |
| limitation 与损失填补 | C 根据查询时程序判断 suspend/reset，诉讼/支付/承认事实保持；到期时效不改原债金额、不随意抹账。C 统一 loss id 与已填补额，D 运输索赔/保险接它，后付者代位而不让受害人重复得全额；A 关闭后债权入口同样校验时效。 |
| finance-* 数据化与 RX 评估 | B 将利息/分期/租/分红/罚息/币制等公式参数与种类条款归到统一声明和计算，不保留 finance-bank/assets 两份 due 算法。实际银行经营、生产、运输、税收触发仍可留薄适配。对保留的业务 `.mjs` 在交接摘要短列“可声明的已移走/必须保留的账本或动作副作用”，不为本卡新造全功能 RX 解释器；复用现有表达式能力，缺少的纯义务运算由 A 实现。 |

共享接点只归 A：`engine.mjs`、`advance-registry.mjs`、`scheduler.mjs`、`storage.mjs`、`holding-sources.mjs`、`entity-view.mjs`、`checks.mjs`、`extension/tools.mjs`、`action-registry.mjs`、`activities.mjs`、`schemas/ontology.schema.json`、现有共享 schema/词汇/action 数据、`world/meta/rules.json`。B–E 可提交具体调用签名/数据片段给 A，由 A 落文件；不得为一个 enum 自己改共享文件，也不得每遇到接点重新问用户。

先固定接口的最低契约：canonical id 与旧 id 的映射；纯 `amountDue/overdueCount/nextDue`；幂等 create/settle 的 eventId；签署事实不可变；返回账本/持有/事件结果；到期调度的种类+锚实体+登记序号；通信/代理门槛；语言查询；统一 wageQuote；新旧回放版本选择。B–E 可先在自己的模块和场景中编写调用，A 做短的接口落点后即可并行；别等全部核心重构完才开始业务。

## 5. scale：指标、原因假设与 ≤120 秒方案

### 5.1 精确预算口径

`tools/scale-bench.mjs` 的 `SCALE_BUDGETS`：dayMs≤5000，monthMs≤120000，sceneMs/promptMs≤150，saveBytes≤64MiB。`scaleViolations` 对 **core 与 large 各自**检查，不是两者合计120秒。

`measureScale` 在同一个初始 document 上分别执行一次 `engine.reduce(world_time, minutes=1/1440/43200)`。turn/day/month 不是连续前进的一串操作，月推不是“前一天之后再加30天”。各计时只包 reduce，**不含 fixture 生成、随后 hash、applyPatches、提示构建、序列化/读写**。包含 reduce 自己的推进、结果/补丁构造及内部校验成本。完整 JSON 的进程墙钟也不等于 monthMs。

`tools/scale-bench.mjs` 默认 counties=Infinity=31，先 core(0郡)后 large(31郡)，`scaleFixture` 默认 compact=true。全规模：9省、31郡、142聚落、生成居民34771，压缩后实际存储居民16903。**731004.0894ms 是 before JSON 的 large.metrics.monthMs，一次30日 reduce，约731.00秒。** 不是整套测试时长、不是 core、不是读写、不是单日。

`tests/scale.test.mjs` 使用另一夹具口径：默认2郡，`SCALE_FULL=1` 时31郡，显式 compact=false。其测试 timeout=180000 是测试超时阈，不是月推预算；仍逐项 assert 120000。第一轮该测试135213.9219ms 的失败是默认2郡未压缩月推，不能和31郡压缩后的731秒当同比。

| 指标 | before | after | 解释 |
|---|---:|---:|---|
| core 日 | 2409.96ms | 2579.91ms | 均≤5秒 |
| core 月 | 68710.98ms | 73369.40ms | 均≤120秒 |
| large 日 | 19821.56ms | 21614.13ms | 均超5秒 |
| large 月 | 731004.09ms | 751648.70ms | 均超120秒，after需至少约6.26倍提速 |

large 月增长约2.82%，日增长约9.04%；core 也变慢。交接说明与回归并发，不能作因果归属或有效提升证明。六个推进哈希与初始/推进后体积前后一致，支持这两个快照的行为相同，**不证明剩余 S3 语义正确或性能达标**。后续新功能使语义合法变化时另立对照，不能机械要求与第一轮相同 hash。

### 5.2 已见代码支持的假设（尚未 CPU profile）

1. **每个小刻重建“堆”并遍历全世界。** `nextFromScheduleHeap:126–159` 每次 new ScheduleHeap，遍历所有 records/obligations/NPC，重新 educationCourses、personConstraints、remoteScheduleBatch。`ScheduleHeap.entries` 实际是数组，ticksBetween 全扫+Set+sort；不是增量优先队列。开新义务的边界可能增加刻数，但首先要实测谁造成刻数。
2. **到期阶段未过滤真正到期的记录。** `recordItems:357` 全 records；contracts/credit collectors 每刻取所有相关类别；credit 对每条再调用 advanceCredit→bank/assets。即使大多无需结算仍分配数组、读法典、排序/调用。R31 的 recordsWhere 索引仅在 withRecordIndex 作用域里有效，这些直接 Object.entries 不受益。
3. **按对象到期执行仍夹带全表查询。** finance-bank 结息每期扫描 bills/负债；assets 的净资产/利润反复 all(d)；labor-market、npc-life、organizations、law 等已知全表路径。必须把 CPU self time、调用次数与候选规模分开，不能一概归罪“利息循环”。
4. **排序与审计重复成本。** `orderedSystems` 每刻重排、compareClock 反复 hash；`runAdvanceSystems` 每刻末 auditLedger。候选增多时可能放大。只能缓存不变排序键/增量校验真实改动，不能取消 I31 和刻末守恒。先 profile 再选是否要做。
5. **真逐日写仍存在。** `advanceBankFinance:257–271` 每日 nextPayment/holdingSet；会费、军饷、年租/俸禄另有累计。可删除无变化写，但实际付钱、上工、生产、腐坏、消息到达不能省；全规模夹具是否有足够这类活动需数实际条目，不能假设它们贡献了600秒。
6. **GC/补丁结构与作用域构造。** 16903 storedResidents 的初始 JSON约23.75MB；反复克隆/排序、scoped、补丁与 event digest 可能成本高。前测 large 序列化80.58ms、写165.05ms、读127.14ms，均在 monthMs 外，优先优化磁盘不可能解释731秒。

### 5.3 执行剖析与修复次序（A 负责）

1. 合入接口前/功能稳定后记录各自基线；同机、Node v24.13.1（原报告版本）、同种子/相同 compact 与 counties，独占 Node 测量，不与回归并发。全规模不要盲跑多轮，先用1日和2郡定位。
2. 先用现成工具 CPU 采样：

   ```powershell
   $env:TEMP='F:/dnd-tmp'; $env:TMP='F:/dnd-tmp'
   node --cpu-prof --cpu-prof-dir=F:/dnd-tmp tools/scale-bench.mjs --counties 2 --no-month
   ```

   这是定位用，不作预算验收。已有 `tools/profile-time-advance.mjs 1` 使用 `withAgricultureRules`、种子 agriculture-year-0，且逐月串接结果，**不能代替 scale 的同口径报告**；只在农事确是热点时用它隔离。
3. 在 A 所有的工具加入可选诊断模式，量出 nextFromScheduleHeap、各系统、due collector、audit、补丁/归约分别耗时；统计 ticks、每类候选/真正执行数、读取 records/NPC 数、holdingSet/PatchCursor 写次数。诊断输出仅本次工具，不写世界状态或正式存档；采样开销不得用于120秒结论。CPU profile 若 fixture 占大头，增加“fixture后只测一次 month”工具选项，而不是把 fixture 时间混入月推。
4. 第一优先候选修复：复用现成字段索引；只调度有真实 due 的活跃义务；调度队列在一轮 reduce 内增量维护，创建/变更/取消时更新，保存/恢复从事实重建；确保当刻新义务和 currentGrace/法典变化会重算。记录登记顺序，不用数组顺序替代原 registeredSeq。
5. B–E 将同一余额计算迁走、空游标写移除；A 根据 profile 第二热点再修全表扫描。业务文件仍由原所有者改，A 传明确“函数+次数+self time+等价约束”；不抢文件。若无足够收益，不能假称将性能留到 S7，本次120秒仍为关闭条件。
6. 使用功能冻结后的同一快照做优化前后对照：纯优化要求 patches/result（含事件顺序、seq、骰值、守恒）逐字节等价；缓存命中/失效、加载重建、同刻创建/撤销均覆盖。真实语义修正需说明对应条目，不通过批量更新金快照掩盖。
7. 定位通过后，**各验一次**默认2郡 scale.test 和 full tool；预算必须逐项通过：

   ```powershell
   $env:TEMP='F:/dnd-tmp'; $env:TMP='F:/dnd-tmp'
   node --test --test-isolation=none --test-concurrency=1 tests/scale.test.mjs
   node tools/scale-bench.mjs --output F:/dnd/logs/sessions/S3-scale-final.json
   ```

   两命令顺序运行，不并发。后者默认全规模、compact=true；保留所有预算和 advancedSaveBytes。只有新增失败或具体疑点才追加 `SCALE_FULL=1` 未压缩全规模测试；如主会话选择把它列为额外验收，必须提前明确其独立口径，不能与默认工具替换。全规模最后一次无 profiler；输出 before/after 秒数、规模与哈希，月≤120秒、日≤5秒且下降可测后才称性能完成。

本规划没有启动约12分钟的全规模重复测量，也没有实测热点占比；上述是由代码证据支持的假设及可执行剖析步骤。两种修法失败后按项目停止线交主会话一次规划，不换名字重领尝试。

## 6. 五张执行卡（互斥文件所有权）

以下“所有”是本批写权限分工，不是要求把每个列出的文件都改一遍。省略路径的源码均在 server-plugin，测试在 tests；未列出的必要少量接点先报实际调用者给主会话核对所有权，已有任务授权不需再问用户。**业务模块禁止互相代改；全部共享文件只交 A 落地。** 世界内容只写 world，dist 和原存档不动。PROGRESS/CHANGELOG/当前状态由主会话维护，执行卡只交摘要。

### S3-A：统一生命周期、结算内核、共享接点与推进性能

目标：P表 A 的13点与 R15/R16/R21的advance-layers/R22，连同第4节共同接口真正可用；日程不全表空转，满足第5节两种 scale 口径与日/月预算。阶段A0先提交短的接口落点（不是整卡完成），释放 B–E；A1集成共享入口和结构；A2在业务冻结后做最终性能验收。

独占源码：obligation-state、obligation-kinds、obligation-presence、contract-state、contracts、transition、holding-sources、holdings、holding-kinds、lifecycle-state、engine、advance-registry、advance-layers、scheduler、storage、money、ledger、entity-view、checks、action-registry、activities，以及新增 obligation-runtime、obligation-calendar（是否新建按现有模块复用决定）。compat/v2-phase1-engine 原则锁定不改，仅归 A 核验历史。共享 `extension/tools.mjs`、现有 action catalog/ontology/schema/rules 接点与加载入口由 A 唯一落地；新增共享规范数据也归 A，其他卡给内容片段。

独占工具：tools/scale-bench.mjs、必要的 tools/profile-time-advance.mjs 诊断接点。独占测试：s3-obligation-state、s3-presence、s3-accrual-static、scale、advance-registry、invariants/i31-total-order、transition-protocol、s2c-transition、s2c-estate、s2c-contracts、ledger-reconcile、save-roundtrip；新增 `s3-runtime.test.mjs`、`s3-calendar.test.mjs`。其他原有 CORE 测试只在确有接口回归时由 A 改，绝不降标准。

验收行为：旧/new claim 只清偿一次；每种义务 closed 与 owed 分离；按约继承/追魂/继承人拆分守恒；关闭后债权 cap/reopen；签署权限/身份及非法 amendment；exclusive拒绝零副作用；历法大小月/闰月/短月月末/提前终止和大步对分段一致；变更利率/本金后的实际金额；真实在场、autoSettle seat及载体；新增/撤销/改宽限队列失效；I29 与 I31 均不退。

验收命令（新增测试实现后）：

```powershell
$env:TEMP='F:/dnd-tmp'; $env:TMP='F:/dnd-tmp'
node --test --test-isolation=none --test-concurrency=1 tests/s3-runtime.test.mjs tests/s3-calendar.test.mjs tests/s3-obligation-state.test.mjs tests/s3-presence.test.mjs tests/s3-accrual-static.test.mjs tests/transition-protocol.test.mjs tests/s2c-transition.test.mjs tests/s2c-estate.test.mjs tests/s2c-contracts.test.mjs tests/ledger-reconcile.test.mjs tests/save-roundtrip.test.mjs tests/invariants/i31-total-order.test.mjs tests/advance-registry.test.mjs
```

最后按第5节跑默认 scale.test+全规模 tool，提交前 CORE。规模 **XL，约4–7有效工程日**，不是八处 helper 的延续小改。模型 **Sol high**；Luna 只可在契约稳定后迁移无语义改变的 import/字段读取，调度、账本、继承、历法与性能判断不交机械模型。

### S3-B：银行、票据、资产、分期与俸禄

目标：P02–08、P14–28、P32、P64（24点），P12的business适配及R23；金融专用记录成为统一义务的薄适配和兼容投影。闭合 E12-1/2/3、E18股份责任输入、R2-E1典当、R2-E3贷款/分红、R3-E15代偿/租金/当物。不能留下 NPC 次日偿还循环作为“已统一”。

独占源码：credit、finance-bank、finance-assets、finance-tax、office-salary、business。新增金融种类适配文件可在该目录按 `finance-*` 命名；种类公共登记/字段/schema由 A 收片段落地。B 不改 contracts、transition、law 或 engine。C 需要 NPC 典当时，B 提供 actor/owner/representative 明确的调用接口，不能从 C 直接写银行内部记录。

独占测试：credit、finance-bank、finance-assets、s3-i29、s2c-governance（俸禄段），新增 `s3-finance-scenarios.test.mjs`。R2/E15完整场景由 E 所有；B 提供真实创建入口和本模块回归。

验收行为：一年12期、逐期逾期与条款罚息；到期同刻部分清偿/展期；无钱保留债权；第三人真实到场或寄汇代付；未到票据不得清偿，持票人变更/丢失/挂失到期/重复兑付边界按设计；网点现金独立守恒、总号破产分号现金不凭空消失；NPC 当物出售与继任未到期票；租约中途终止与既欠租；死亡/拘留/换岗月俸有效区间；债前股后与股值减少；旧币改计一次事件。B/C采用同一责任限额结果，不复制法律判定。

```powershell
$env:TEMP='F:/dnd-tmp'; $env:TMP='F:/dnd-tmp'
node --test --test-isolation=none --test-concurrency=1 tests/credit.test.mjs tests/finance-bank.test.mjs tests/finance-assets.test.mjs tests/s3-i29.test.mjs tests/s2c-governance.test.mjs tests/s3-finance-scenarios.test.mjs
```

提交前 CORE；涉及转账和继承的最终证据由 A 的 ledger/s2c组合复用，变更后受影响部分再跑，不重复整轮。规模 **L–XL，约3–5有效工程日**；**Sol high**，Luna 可做既定种类数据/只读报价字段搬迁，不能处理货币守恒、提前还贷和股份责任。

### S3-C：实际用工、诊疗教学、批复与债权执行

目标：P29–31、P33–37、P54–56、P60–61（13点），R05/R20/R24的medicine-state/R26的high-nobility。补 E04 的矿工→停工→诉讼→工资优先、E18的挪用/典当/逃亡来源与责任认定；接 N1违约、E3幼子代理；service容量/紧迫度及limitation/损失填补有真实消费者。

独占源码：labor-market、employment-state、education、education-state、medicine、medicine-state、public-projects、governance、high-nobility、law、law-codes、family-law、npc-crime、extraction；新增 `service-queue.mjs`（有必要时）、`obligation-claims.mjs`。共享规则数据由 A 落地。transition 的优先序/关闭后债权只归 A，finance-assets 的生产调用适配只归 B，bounty追捕只归 D。

独占测试：labor-market、education、medicine、governance-projects、law、law-codes、npc-crime，新增 `s3-labor-justice.test.mjs`、`s3-service-claims.test.mjs`。E04/E18原评分脚本只归 E；C交真实场景调用供其使用，不把正则命中当验收。

验收行为：实际工时才计薪，分段取整一致；失能/在途不劳动但既欠工资照追；临时雇主和遗产雇主不混；矿工合法/非法采掘都守恒；活体矿主与遗产的工资优先都能执行；股东有限/无限责任、无权典当和善意交易的证据；NPC真实卷款→有路线逃亡→协查；诊疗药品/教学工时仍真实；容量满按紧迫度排队并可取消，不能无限推迟高危救助；审批到期、换任和代理；诉讼时效暂停/重起与同损失重复索赔。

```powershell
$env:TEMP='F:/dnd-tmp'; $env:TMP='F:/dnd-tmp'
node --test --test-isolation=none --test-concurrency=1 tests/labor-market.test.mjs tests/education.test.mjs tests/medicine.test.mjs tests/governance-projects.test.mjs tests/law.test.mjs tests/law-codes.test.mjs tests/npc-crime.test.mjs tests/s3-labor-justice.test.mjs tests/s3-service-claims.test.mjs
```

提交前 CORE。规模 **XL，约4–6有效工程日**；**Sol high**。Luna 仅可搬迁已确定的参数/现成调用，法律效力、NPC行为和资源结算不能机械改。不得把整套 S4 法律重写塞入本卡，只接上述真实失败所需的程序和声明。

### S3-D：运输寄汇、开放/条件义务及非金融约定

目标：P39–43、P47–51、P63、P65–68（15点），R25及R26的nation-founding。E05天气滞留工资、货损索赔、寄汇；N1 forward 可执行；bounty争夺和非金融种类实际履行；军饷、朝贡及生灵约定不再持有另一套欠款算法。

独占源码：transport、transport-route、post、npc-obligations、bounty、quest-board、quest-sources、quest-wildlife、military、war-diplomacy、nation-founding、monster-society、boss-negotiation、family-diplomacy、faith、summons、magic-ritual、magic-mind-space、wildlife-society、wildlife-awakening；新增 `obligation-conditional.mjs`。远方生成本身归 E，仅调用其目的地解析接口；shared scheduler/engine/world rules 归 A；损失填补函数归 C，票据发行兑付归 B。

独占测试：transport、post、npc-obligations、bounty、quest-board、quest-sources、quest-wildlife、military、monster-society、wildlife-society，新增 `s3-delivery-conditional.test.mjs`。必要的现有役灵/仪式专测按改动定位后归 D，不改别卡测试。

验收行为：天气停9天后护卫应得/实付/欠额一致；货到托存守恒、收件人不在不算丢失；远方只可指定运输端点不泄漏价格；票据在途/截获/丢失/到达/签收完整；forward预付与短交、继承、展期；同刻两人完成悬赏仅一次清偿且重放稳定；同标的双护送/托养互斥失败不扣钱；军饷分配守恒；pact/gratitude/vow实签、到期履行及pursue/heirs，不把登记一个字符串当完成。

```powershell
$env:TEMP='F:/dnd-tmp'; $env:TMP='F:/dnd-tmp'
node --test --test-isolation=none --test-concurrency=1 tests/transport.test.mjs tests/post.test.mjs tests/npc-obligations.test.mjs tests/bounty.test.mjs tests/quest-board.test.mjs tests/military.test.mjs tests/monster-society.test.mjs tests/wildlife-society.test.mjs tests/s3-delivery-conditional.test.mjs
```

提交前 CORE；quest-sources/quest-wildlife等仅相关改动时加入本卡命令并报告，不能改而不测。规模 **XL，约4–6有效工程日**；**Sol high**，Luna可做种类注册数据与纯调用替换，争夺、寄汇、资源交割归Sol。

### S3-E：离屏生活、只读消费者与原题端到端收口

目标：P38/P53/P62、R表 E 所有项，宠物托养、私田无人收割、商号会籍，以及全部八题的可执行证据。既有“合理”不得回退；四道run-001逐题≥80%，另四题义务条目全部通过且全题观察项单列。不是仅写测试让别卡承担漏掉的功能。

独占源码：agriculture、pets、npc-life、organizations、organization-state、family-state、tribal-awakening、remote-generation、settlement-trade、shop、manufacturing、return-summary、standing，以及 R01/R02/R03/R04/R06–R14/R17–R19 中列出的消费者文件；R21 中 npc-autonomy、npc-decision、festival、magic-movement 也归 E。**entity-view、advance-layers、storage 归 A；education-state、medicine-state、employment-state归 C；business归 B。** 新 custody/私田适配文件归 E，共同种类/runtime归 A。

独占测试：s3-run001；tests/probes/run-001/e04.mjs、e05.mjs、e12.mjs、e18.mjs；新增 `s3-probe-integration.test.mjs`（R2-E1/E3/N1/R3-E15逐条行为，明确义务与观察子项）、`s3-offscreen-life.test.mjs`；现有 pets、agriculture、organizations、s2c-organization-dues 和受影响消费者专测。不改 tools/probe-score 的计分定义、题面或 baseline。E不得写入A–D的测试文件；可复用导出的夹具，若必须改共享 helper 交 A。

验收行为：离开360天的存款/放贷/出租/托养/私田场景均走正常入口；宠物食物实扣和邻居迁居/死亡分支；公田原行为不退；会费/商号会籍和信誉传播；返乡不全知；股值不双扣；探针static占位换实际断言后保留失败可见。原题脚本修订须展示旧检查无法得满分的代码原因及新行为证据，不写泛化“新增支持”结论。

```powershell
$env:TEMP='F:/dnd-tmp'; $env:TMP='F:/dnd-tmp'
node --test --test-isolation=none --test-concurrency=1 tests/pets.test.mjs tests/agriculture.test.mjs tests/organizations.test.mjs tests/s2c-organization-dues.test.mjs tests/s3-offscreen-life.test.mjs tests/s3-probe-integration.test.mjs tests/s3-run001.test.mjs
node tools/probe-score.mjs --run run-001 --only E04,E05,E12,E18 --json
```

上面两条评分若产生完全相同场景执行，可在执行摘要复用同一结果，主会话不重跑；第二条仅用于结构化逐题证据，不能 `--write-baseline`。农业长测放后台自然结束、与scale互斥。提交前 CORE。规模 **XL，约3–5有效工程日**；**Sol high**负责行为、场景与评分判断；R表无语义改变的机械消费者接线可用 **Luna**，先固定统一视图接口及私密约束，再交一组明确文件串行处理，不让Luna独立设计隐私/认知迁移。

### 6.1 并行/合并顺序及统一完成判定

1. 主会话先确认当前 s3 WIP已保存及五卡所有权，A启动A0接口落点；B/C/D/E同时可读与准备自己文件的场景/适配，不能先写A文件。最多按主会话可用槽位排3张业务卡，不要求五张同时运行。
2. A0稳定后 B、C、D、E可按槽位并行；B提供 actor典当/票据、C提供 loss/claims、D提供 forward/寄汇、E提供远方端点/粮交割的接口签名，A只落共享层接线。依赖以已声明API为准，不互相占用文件；跨卡功能测试在对应实现落地后跑。
3. 业务功能分步提交；主会话复用执行者的有效验收，不为同一结果再派审核。集成后A处理性能并保留纯优化对照，E跑最终原题。性能测量不得和CORE、农业长测并发。
4. 每卡提交前固定 CORE，命令如下；原23项baseline预期失败保留，未跑不写通过。阶段结束的全量/build:release/真实提示栈按项目指南由主会话安排一次，零模型确定性卡测不冒充真实试玩。

   ```powershell
   $env:TEMP='F:/dnd-tmp'; $env:TMP='F:/dnd-tmp'
   node --test --test-isolation=none --test-concurrency=1 tests/engine.test.mjs tests/storage.test.mjs tests/plugin.test.mjs
   ```

5. S3关闭需同时具备：P/R逐项注明迁移/保留与实际消费者；第4节新增义务功能已接线；四道run-001达标且另四题义务条目全过；I29/I31、账本/继承/存档保证通过；没有逐日累计空写；默认2郡与全规模tool预算均过，日推进确实下降；没有拿机械状态/关键词代替玩法的剩余块。41历史数来源未找到可如实保留说明，不能因此把已识别的真实欠款路径漏掉，也不能把注册/显示计入已归并8处。

本轮交付的是可审定草案。复用了第一轮的分数、CORE及相关回归证据，检查了当前源码、原题与s3测试；没有执行新测试，没有重新判定原题，没有运行scale采样，也没有修改任何代码或Git。实际耗时改善、八题完成和完整S3退出均留给上述执行与验收，当前不得标S3完成。
