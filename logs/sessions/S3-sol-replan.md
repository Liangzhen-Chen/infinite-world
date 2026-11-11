# S3 收尾复规划草案

2026-10-18；分析工作区 `F:/dnd-wt/S3`，分支 `s3`，开工 HEAD `0779ceb8`。本报告供主会话审定，不直接改 PLAN、源码、判分或 Git。采用 Stop That Shit 规则，只收本次退出线及已经暴露的权限、守恒保证。

## 1. 验收边界与本次实际运行

依据 `docs/架构设计/10-现状映射与迁移路线.md:100`：run-001 的 E04/E05/E12/E18 **逐题**合理率至少 80%；run-002 E1/E3/N1、run-003 E15 的**义务条目**及 I29 通过；义务模块没有逐日累计写；日推进下降可测。部分不计合理。因此四题分别需要至少 **4/5、5/6、5/6、4/5**，不要求把全部 22 条都补到满分。

日推进性能复用 S3-A3 已有同夹具对照：两郡中位数 3347.7211 → 2719.3186 ms，下降约 18.8%。本次不重跑性能。31 郡、月预算、分层与分片归 S7，旧计划中把月推进 ≤120 秒加入本轮退出线的扩展撤回。

所有 Node 命令均设置 `TEMP=TMP=FIELDS_TMP=F:/dnd-tmp`，使用 `--test-isolation=none --test-concurrency=1`；同时最多两个 Node，没有启动子代理、真实模型或子 Node。只精确等待本会话记录的 PID，没有结束任何进程。

| 本次命令（均以 `node --test --test-isolation=none --test-concurrency=1` 开头） | PID | 实际结果 / 日志 |
|---|---:|---|
| `tests/s3-run001.test.mjs` | 53728 | 4 项，1 通过、3 失败，0 跳过/TODO/取消；1401713.829 ms（约23分22秒）；`S3-sol-replan-run001.log/.err` |
| `tests/s3-probe-integration.test.mjs tests/s3-i29.test.mjs tests/s3-accrual-static.test.mjs` | 58244 | 13 项，12 通过、1 失败，0 跳过/TODO/取消；`S3-sol-replan-run23.log/.err` |
| `tests/s3-delivery-conditional.test.mjs tests/s3-finance-scenarios.test.mjs tests/s3-labor-justice.test.mjs` | 18176 | 25 项全通过，0 跳过/TODO/取消；`S3-sol-replan-supported.log/.err` |
| 加 `--test-name-pattern=成婚\|撤权、到期`，运行 `tests/npc-life-migration.test.mjs tests/governance.test.mjs` | 47076 | 实际选中 2 项均失败；`S3-sol-replan-reported.log/.err` |

补跑后两组是为区分 E05 正则失分、已有业务能力和交接中的共享失败，未跑全量、build:release、baseline、CORE 或系统图生成器。本次没有改代码，CORE 不冒称已重新通过；A3 的既有 CORE 证据及其时点限制保留。静态累计检查本次通过，但它仅扫描测试列出的七个模块和一种模式，不把它说成全库证明。

## 2. 每题每条判据：当前结果、责任层、最小改法

### 2.1 run-001 原脚本实际分数

本次真实分数为 **E04 2/5（40%）、E05 3/6（50%）、E12 5/6（83.3%）、E18 3/5（60%）**，只有 E12 达到80%。合计22条：13合理、7部分、0错误、2缺失，脚本异常0；三个失败均为原80%门槛断言。以下是本次 diagnostic 的逐条结果，未沿用旧交接分数：

| 判据 | 本次判定 | 本次真实证据 / 取证限制 |
|---|---|---|
| E04-1 盗采扣减矿脉 | 部分 | 玩家实际储量30→27；旧脚本因 npc-crime 不含盗采字符串扣分。 |
| E04-2 停工、铁价、打造成本 | 缺失 | 原文称“只有玩家能挖、无正规产量”，该解释已过时；价格与产出链仍缺。 |
| E04-3 本地法典与买赃追责 | 部分 | 实际解析为 faction_ms_lielu 自治习俗，未立法院案件；无实际收赃追责证据。 |
| E04-4 欠薪诉讼、工资优先 | 合理 | 原脚本识别工资优先规则；本次补充业务测试也验证真实活体雇主的先工资后普通债。 |
| E04-5 零储量停产 | 合理 | 实际返回“矿脉已枯竭或尚未恢复”。 |
| E05-1 超载拒运/分批 | 合理 | 原脚本识别重量、体积、座位超载拒运。 |
| E05-2 滞留与护卫日薪 | 部分 | 旧脚本错误称护卫一次算定；补充业务场景实际天气封航九天仍累计日薪通过。 |
| E05-3 两政体分别征税 | 合理 | 原脚本识别逐段 tradeTax 与政体/级别输入；补充业务测试验证同税款重试不重复扣。 |
| E05-4 货损降价或索赔 | 部分 | 旧脚本固定“有货损或索赔”仍判部分；实际毁物、同损失索赔、分次支付/超赔拒绝测试通过。 |
| E05-5 远方展开、此前价格未知 | 部分 | 到达展开，但出发前缺可承运接收端，原题无法完整构造。 |
| E05-6 真实网点兑票 | 合理 | 原脚本识别指定异地柜面/不符拒绝；实际业务也验证兑付柜出现金、出票柜保留清算债。 |
| E12-1 正确累计、不重复计息 | 合理 | 实际10次结息、无重复，重复短推不变；尚非全部利率切段/历法迁移证明。 |
| E12-2 逾期期数、不免债 | 合理 | 360天12期；90天逾期3期，应付377、尚欠1507；无罚息条款不强加罚息，短推不重写。 |
| E12-3 月租、承租人退租止收 | 部分 | 地主dismiss止租、仍欠140；承租人vacate实际拒绝“需要本人的真实店铺编号”。 |
| E12-4 一年托养与搬迁/死亡 | 合理 | 实际360天消耗受托人食物691份；迁居/死亡停止喂养，宠物所有权保留。 |
| E12-5 私田无人收获腐烂 | 合理 | 实扣种粮12，未收162粮腐烂；公共田仍收16554粮，未成熟拒收。 |
| E12-6 返场知情边界 | 合理 | 原脚本识别认知过滤、书信为寄信者陈述；不冒充 S6 全部知情集合完成。 |
| E18-1 停工、股东责任 | 部分 | 有停工投诉离职；无真实有限/无限责任条款及执行。 |
| E18-2 逾期流当、NPC当物 | 合理 | 原脚本判流当/NPC来源；实际业务验证NPC本人出质/收款与冒充所有人零写拒绝。 |
| E18-3 追诉、引渡 | 合理 | 原脚本根据逃亡代码判合理；补充业务验证真实挪款/路线逃亡，未把它等同全部引渡判决。 |
| E18-4 商号信誉与商会除名 | 缺失 | 组织尚只能除名人物，缺商号会籍/信誉链。 |
| E18-5 股份重新估值 | 合理 | 原脚本识别 netAssets；实际业务验证规范工资债只扣一次净值、到期债前股后。 |

下面分析按当前源码定位；“判分问题”表示修取证，题面、条数、80% 与“部分不计通过”均保持。

| 未过判据 | 缺什么、根因（文件:函数） | 最小处理及本轮归属 |
|---|---|---|
| E04-1 盗采扣矿脉 | `tests/probes/run-001/e04.mjs:scenario/check` 只试普通玩家四次开采；本次已实扣储量30→27，但用 `npc-crime` 是否含 `illegal_mining` 字符串推断 NPC 能力。实际 `extraction.mjs:mineEmployment → mineActor` 已能非法开采、扣同一矿脉、磨损工具和立案，本次业务场景已通过；矿工自主夜盗候选并未由此得到证明。 | **N01，判分取证问题**：保留真实开采与储量、库存、工具、零储量负断言，用已存在的 NPC 采掘入口实证，不为匹配正则另造犯罪机制，不能硬写产量。自主决策的完整夜盗私卖链另归 S7。 |
| E04-2 停工→铁价→打造投入 | `e04.mjs:check` 只找 `mineral:`，即便找到也固定返回部分，并且“无雇工”的解释已落后；`labor-market:mineEmployment/settleEmploymentPay` 已有实际矿工。真实剩余缺口在 `shop.mjs` 的报价/补货与 `settlement-trade.mjs:regionalTradePrice` 没有把矿工停产接为铁供给，再传给实际材料采购；`manufacturing.mjs:manufacture` 消耗真实材料，不能凭空加制造费冒充。 | **功能缺口兼脚本失真，H01→S5**。保留此条失分；本轮选择补 E04-1/3 达到 4/5，不临时造第二套矿价模型。S5 用现有账户存量、真实产出与采购报价闭合。 |
| E04-3 本地盗采罪、收赃责任 | `e04.mjs:scenario` 选 `site_ms_ll_adit`，`law-codes.mjs:miningJurisdiction` 允许真实自治规矩，不保证有可执行法院；脚本随后要求 court case，并只查模板里有无 `receiving_stolen`。`extraction.mjs:mineActor` 也没有把所得矿石的赃物证据接到实际买赃行为；有罪名词汇不等于有追责。 | **N02，功能与夹具均需收口**：为原题选定有真实所属法典/执行者的矿口，或补该矿口实际所属的司法数据；保留自治与缺数据拒绝。采得实物带既有来源/赃物证据，实际知情收购才可立案；不把所有买矿都视为收赃。复用 `registerIncident`、现有证据与实物身份，不新写法院框架。 |
| E05-2 天气滞留、按天护卫薪 | `e05.mjs:check` 只在 200 字窗口找 `perDay/dailyCopper`，忽略 `transport.mjs:bookTransport/advanceTransport` 已保存的 `escortTerms.daily` 与工资义务。`s3-delivery-conditional` 本次真实天气封航九天、应付增长、原义务不日写、预付冲抵、异地拒付均通过。 | **N03，判分脚本问题**。将旧静态检查换成该真实业务场景，核对起止分钟、未付额、实际现金和重放；不改变量名迎合正则，不新增计薪器。 |
| E05-4 受潮降价或索赔 | `e05.mjs:check` 找到货损/claim 也只能返回 partial，结构上不可能合理。`transport.mjs:damageTransportCargo/compensateTransportLoss` 已实际毁损在途库存、产生同损失索赔并分次赔偿，本次全通过。尚无自动天气受潮触发，不能把它写成已实现。 | **N04，判分脚本问题为主**。按原文的“或按契约索赔”测试真实承运人确认损失→实际库存减少→同一损失债权→实际赔付；缺确认、无责任条款、异地、超赔和重放均拒绝。不得只调用赔偿函数或看到关键词就判合理。自动受潮额外反应归 S5。 |
| E05-5 未访问远方、此前价格未知 | `e05.mjs:check` 固定 partial 有合理依据：`engine` 的 `unfoldRemoteAt` 只在到达展开，既有 `transport:bookTransport` 无法凭未知地区细节构造接收端。 | **功能缺口，H02→S7**。聚合收货人/钉住端点物化与跨层到达一并做，保持当地价格未知；本轮仍留部分，E05 通过 N03/N04 达 5/6。 |
| E12-3 承租人主动退租止租 | `tests/probes/s3-finance.mjs:vacateScenario` 已正确区分 tenant vacate 与 owner dismiss；`finance-assets.mjs:terminateAssetLease` 有双方真实身份和在场检查，但 `assetTrade` 仅将 dismiss 固定为玩家出租人，正式承租人消费者未接。已有测试标题“实际退租”实际走的也是地主 dismiss，不能当成租户证据。 | **功能入口缺失，H03→S4**（累计/历法接 S5）。保持此条部分；补真实承租人入口、返还使用权、既欠保留。本轮 E12 已需 5/6，不为满分扩大。 |
| E18-1 股东有限/无限责任 | `finance-assets.mjs:assetTrade(invest)` 只存份额、对价，没有可核验的签署责任形式；`law.mjs:lawAction` 和工资优先执行有能力，但没有沿真实章程对股东认定责任。`e18.mjs:check` 的全库关键词也不足以证明。 | **N05，功能缺失**。入股沿实际商号/发行方保存已同意的章程/责任条款；复用既有案件与规范债权执行，覆盖有限责任、明确无限责任两支、普通股东不能默认无限责任、到期工资优先和同损失不超赔。不实现全部 S4 民事十类。 |
| E18-4 商号信誉、商会除名 | `organizations.mjs:advanceOrganizations` 的成员/会费仍面向人物；`holding-sources.mjs` 的 business 是 thing，`member_of` 不接受它，缺真实会籍主体/代表/资金；该探针即使出现商号会员字样也固定 partial。信誉经传闻到组织判断也未闭合。 | **功能缺失兼脚本封顶，H04→S4/S6**。S4 补具体商号模板、代表和章程，S6 接真实传闻及组织知情。不得放行所有 thing。E18 本轮补 N05 达 4/5。 |

已判合理的条目仍按当前取证范围阅读：E04-4 的工资优先、E05-1/3/6、E18-2/3/5 等含静态检查，不能据分数宣称整条自主连锁都完成。现有 25 项业务测试可支持其中实际子路径；本轮为相关修复更换的探针须测行为，不能增加关键词取巧。

### 2.2 run-002/003：实际 S3 测试与原题的区别

项目没有 `tests/probes/run-002/`、`run-003/` 的逐条评分器。对应测试在 `s3-probe-integration.test.mjs` 与 `s3-i29.test.mjs`。因此下面报**实际断言结果和未覆盖项**，不杜撰完整原题百分比。

| 原题 | 本次现有 S3 测试 | 原题各条现状 / 最小改法 |
|---|---|---|
| R2-E1 死当祖传剑 | integration 子项**失败**，第二张 90 天当票在签署阶段报“借期天数必须在1到60之间”；I29 的到期与明确宽限测试通过。 | ①在途/失能不冻结：I29 已实测。②NPC 实际买走、所有权转移、原票失效：只有手动玩家 `bankTrade(auction)` 路径，未有原场景离屏成交。③新掌柜/邻里告知归 S6。④未到期票与质押随掌柜继任：通用协议存在，当前场景没跑到。⑤私下回购/关系价不属本轮义务退出。⑥有真实天灾条款才宽限：现有测试仅覆盖数字 grace，不覆盖条件。**N06**：合法三个月夹具＋真实离屏成交/两票继任＋条件宽限四项义务证据。 |
| R2-E3 药铺东家病逝 | 子项**通过**：真实欠薪降低一次净值、债前股后；并未触发东家死亡。 | ①幼子所有、监护人代签：`assertObligationAuthority` 已认真实监护，但原药铺经营签约没串起。②欠薪随遗产、学徒停工：通用工资与继承分别存在，完整原场景未测。③分期贷款死亡后保留期限/担保：`openLoan` 没有为该场景接新签 `assume_by_heirs`，默认种类仍 accelerate；不能改全部旧贷款默认。④原股权不变、先债后红：只测后半。⑤停业药价归 S5；⑥医师认证不继承属于持有/资格既有保证，保留回归。**N07**：真实东家死亡→遗产→幼子/监护→欠薪和分期→股份不被重签/吞并，复用现成协议，不另写继承器。 |
| R2-N1 青苗预售契 | 子项**通过**：签约法域快照、钱款不得冒充交粮。D 的预付/短交/展期场景本次也通过。 | ①短交按约违约或展期：实际短交与手动展期有证据，尚缺歉收/到期消费者的联动与约定权限；②远期价格归 S5；③垄断限制规范归 S4/S5；④死亡后继承履粮**明确阻断**；⑤签约地法快照已测，但争议消费者尚未证明使用它；⑥讼师/裁判信用全链归 S4/S6。**N08**：补按真实余量的到期/展期入口、继承份额与计价限额、实际履粮，以及纠纷接点实际取签约快照；不在 S3 实现整套冲突法/诉讼。 |
| R3-E15 分期借贷入狱 | 子项**通过**：手造有效拘留记录、不冻结分期、债主所在地同伴实际代偿、原 debtor 不变。I29 也通过。 | ①真正法律工具产生拘留、12 期、无人代还时按已签条款处理逾期费用尚未测；本次不是实际判监 90 天。②房租继续应计，但 `finance-assets:rentDue` 直接 `financeTransfer` 到远方房东，不经在场/授权代收，是保证缺口。③当期照常到期已有 I29 单独证据，缺原借贷/租房/押玉同场景。④房屋折旧、⑤同伴日程为原保证，集成场景应保留；不新造其系统。**N09**：真实拘禁、代偿/不代偿、租金合法代收、当物到期同一场景；题面没有要求异地寄汇，不能把“再建完整寄汇系统”强塞进此条。 |

R2-E1 的 60 天错误首先是**夹具选错授信产品**：`tests/helpers/finance.mjs:fixture` 固定小驿站柜台，`world/meta/rules.json:credit.banks[0].loanMaximumDays=60`；`credit.mjs:loanTerms` 正确按柜台限制拒绝；`derivedBankAt` 已能按一般规则给派生柜台 90 天。应选真实支持三个月的柜台/合法配置夹具，保留原三个月输入和小柜台超期拒绝。不能把所有银行上限调到 360，不能把测试改短到 60 天。本次尚未执行更换夹具后的场景，因此它后续可能暴露的失败全部算未测。

R2-N1④的确实阻点：`obligation-conditional.mjs:performGoodsObligation:43` 明确拒绝继承且有 liabilityCap 的实物；`obligation-state.mjs:obligationView` 把货币 cap 直接用于数量；`transition.mjs:distribute/fileClosedObligation` 也按货币累计额度/拒绝非金钱迟报。最小修法是沿现有资源估值/分配口径区分数量和货币责任预算，继承各债合用一次财产上限，实际交货扣相应预算；不可直接删除拒绝或把铜钱上限当粮食件数。关闭后迟报若该原场景不经过则留 S4，不能借此重写全部遗产流程。

R3-E15①不得把司法罚款 `defaultPenalty` 当作贷方罚息，或对无罚息签约追补新费用。用真实已签逾期条款覆盖有/无两支；按期未还余额继续存在，羁押不冻结。原题要求的有罚息产品必须在正常签约时产生该条款。

### 2.3 当前共享失败与保证，不能冒称旧基线

**N10 规范支付地点。** `obligation-runtime.mjs:receipt:41–43` 的地点默认取 debtor，第三人在别处代还时不实。E 已在记忆/编年史读侧补偿，其他消费者仍读错误源事实。由清偿内部核验后的实际付款账户/代理/代收席位形成事件位置和经手代表，沿相同幂等回执输出；不采信调用者随填地点，不把第三人变成原 debtor。

**N11 迁居测试 I6。** 本次重现 `npc_hw_taozhi` 账户目标失败。`tests/npc-life-migration.test.mjs:171–174` 的投亲夹具直接将 friend（正是该 ID）设为死亡、手填 family.deaths，没走死亡/遗产程序，留下非零账户；`transition:accountOwnerLive/assertTransitionInvariants` 正确拒绝死者残留账户。先用 `recordEntityDeath` 和已有协议建真实死亡前置，保持七日丧期/投亲与账本断言；不能放宽 I6、清空资金或凭失败栈要求内核接受死账户。此前两次 HEAD loader 取证失败不重试，也不据此宣布旧基线。合法夹具后如仍失败才修其实际资金/实体来源，落在同一卡，最多遵守原停止线的剩余尝试。

**N12 治理未获准代办。** 本次原测试仍出现 minute=600 的 `governance_execution`。责任路径 `npc-autonomy:advanceNpcAutonomy → governance:advanceGovernance/runRequest`；后者每日 600 回看 due，混用预测 presence、当前授权/身体状态与调度补算。原夹具又直接跳 minute（expire 分支把 due=600、expires≈601 的文档跳到601），必须先按 revoke/expire/sleep/away 分别记录合法事件时间，判断回执是否早于撤权/失能，而非删除已经合法发生的回执。若确是错过后补办，以**同一真实 due 项及当时权限/在场**执行或拒绝，失败后不由下一天的日循环倒填；正常恢复只能走真实重新办理。C 已撤回两种失败修法，本段就是交回规划的一次方案，不能把“换 beforeState”或“另加待重排标记”再当新尝试；实施仍失败则原块标卡住。未取得分支证据前，不断言四种情况都是真实越权，也不把当前失败隐藏为预先存在。

**N13 新模块归属。** A3 已登记六模块与动词；D 合入的 `obligation-conditional.mjs` 在当前 `tools/arch-layers.mjs` 与 `tools/system-map.mjs` 仍未列出。源表可直接核对；本次未跑会写文档的 system-map 测试。只补实际经济适配归属并保留原门槛，不改 import 违例 baseline；不要求重做系统地图架构。

## 3. 必需项与延期项：去重口径

本报告将同一缺口在不同交接中的重复请求合为一个结果包，**必需 13 包（N01–N13），可延期 16 包（H01–H16）**。这不是旧“41处”或 P/R 点数量，也不是 13 条失分判据。N03/N04 主要是取证修复；N11 首先修非法夹具；N12 是原停止线的一次定责；不能都宣称功能缺失。

| 延期包 | 接续阶段与理由 |
|---|---|
| H01 矿工停产→铁供给/报价→制造采购；自动天气货损 | S5 市场/生产/损失反应。保留 E04-2 失分，不做第二套价格。 |
| H02 未访问远方承运端点、聚合收货人/钉住物化 | S7 跨层/离屏；本轮保留 E05-5 部分。 |
| H03 承租人公开 vacate、非必须服务取消枚举 | S4 合同效力与合法解约；租金全历法累计接 S5。E12 已可过线。 |
| H04 商号会籍实体/代表、章程除名与真实传闻信誉 | S4 组织规范，S6 知情传播；E18 本轮选择 N05，不并开第二条过线方案。 |
| H05 全部存款 deposit、利率切段/复利/完整历法统一 | S5 金融市场；当前 E12-1 实测和原条款余数保护保留。新出现具体错误不能据此延期。 |
| H06 全部俸禄的历史职能/拘留/none-half-full 切段 | S4 职位有效事实，S5 俸禄派生；不影响本轮四题和指定义务子项。 |
| H07 军饷/朝贡/统计兵丁 export、全部财政代表账户统一 | S7 聚合账户/跨层，个体金融派生接 S5；本轮 N09 的本地租金合法代收单独完成。 |
| H08 开放 bounty、公开要约、全部 contestPool 与预约承接 | S7 离屏反应/争夺整链；现有唯一领奖/真实预留继续保留。 |
| H09 汇票实体全发行/转让/挂失、post 寄汇/柜间清算实际承运 | S7 物化/运输/存档生命周期，信息真假接 S6；当前 E05-6 真实柜面/准备金限制保留。原 R3-E15 不要求异地寄汇；不能因旧交接列了愿望就追加全部票据系统。 |
| H10 役灵/仪式非人物 counterpart、全部维护义务 | S5 效力/维护/修正槽，生命周期并入 S7；不把 MP 当钱。 |
| H11 会费 upkeep 与 village_trade 全迁统一生命周期 | S5 经济生产/贸易，必要的组织规范接 S4；原现金/库存/旧欠不删。N1 的实际青苗交割仍由 N08 完成。 |
| H12 全部 approval/服务容量/请求自然终点统一 | S4 权能与案件/批复程序；当前真实超权疑点 N12 不延期。 |
| H13 非本轮场景的地方公库年租、组织/遗产雇主全种类代收/托管 | S5 公共经营/金融，合法代理来源属 S4；现有 A3 托管/司法支付保证保留。 |
| H14 R03/R06/R14/R17/R19/R21/R24 等剩余历史/知情消费者全面迁移、新掌柜远方获知链 | S6 知情与投影；当前私债/实际代付及源事件 N10 仍需正确。 |
| H15 完整跨法域冲突法、民事十类、讼师/裁判信用、垄断限制规范 | S4 规范与民事，信用传播 S6、价格 S5。本轮 N02/N05 只做原题过线所需的窄分支，N08 保留签约法快照的真实消费。 |
| H16 31 郡性能、月推进预算、全部57推进项退役、分片/卸包/存档 | S7。用户已明确日推进下降本阶段达成。 |

以上是接续草案，不把 68 个 P 点、26 个 R 点的未迁移部分记成完成。D 的 entity-life/T162/world-events 等其他交接失败、A3 直接导入大队列尚缺结果，保留原结果及原责任队列；本次没有全部复跑或完成归因，不能批量叫作旧基线，也不以规划新增一轮全库审计。主会话按现有已验证证据处理必要合并接点。

## 4. 各卡“对 S3-A 的请求”逐条归类

“已接”以 A3 报告及当前接口源码为依据，不表示本次重新跑过它的全部验收；混合请求拆到相应 N/H 包，不重复计数。

| 原请求 | 现状、是否退出必需 |
|---|---|
| B-1 当前 bank/group 代理签署 | A3 的 `obligationRepresentative/assertObligationAuthority` 已接。N06/N07 用真实现任代表验证继任/监护；无需再造授权记录。 |
| B-2 requiresInstrument 验证回调 | A3 `obligationInstrument` 已有 holder/custodian/arrival/status/claim 读取。N06 的原当票与质押继任/作废必需；所有汇票生产端与转让/挂失归 H09。 |
| B-3 托管/抵押抵扣/柜间运输履行 | A3 已有 escrowContract/fundingContract/judicial；N06 保留真实拍卖/质押，N09 保留本地收款，柜间实际运输归 H09，其他财政全覆盖 H07/H13。 |
| B-4 条件宽限、历法、过去利息、罚息 | 条件天灾宽限 N06、原 R3-E15 已签逾期条款 N09 必需；通用累计已存在，全部存款/利率切段迁移 H05。不得改写旧签约计息口径。 |
| B-5 历史任职/拘留/死亡切段供 salary | H06；本轮不补全部俸禄。 |
| B-6 系统图四模块 | A3 已接；新增 D 模块归 N13。 |
| B-7 terminate/vacate、票据、自动代收工具枚举 | 普通 vacate H03、全部票据 H09；N09 必需的合法租金代收及 N06/N08/N07 所需正常动作薄路由由收尾卡接，不能以枚举缺失虚报玩法可达。 |
| C-1 时效全局装配、未开账扣镜像却零转账 | A3 已迁共享 `claimLimitation/claimEnforceable`、拒绝未开账且验证精确实付，已接；沿既有回归保留。 |
| C-2 真实托管/司法执行 | A3 fundingContract/judicial/法院交存领取已接；N05 的工资责任、N07 的遗产、N09 的实际代收复用，额外全品类 H13。 |
| C-3 公库/组织/遗产收款席位与 autoSettle | N07/N09 场景内必需；其余公库年租 H13，聚合军政 H07。 |
| C-4 非金钱服务/批复履行、债权方取消/自然到期 | A3 普通服务债权方关闭已接；N08 的实物继承、N12 真实权限失败必需，其余 H12/H03。 |
| C-5 arch-layers 与六模块归属 | A3 已接；D conditional 仅剩 N13。不能放宽 import baseline。 |
| C-6 medicine_cancel/contract 公共枚举 | A3 已接，当前 tools 可见。无需新卡重复做。 |
| C-7 CORE/生命周期/local-exams 等失败 | A3 已修 local-exams、contracts 引用及版本/快照；本次仍复现迁居 N11、治理 N12，不能当旧基线。其他未复测沿原队列，不能写成通过。 |
| C-8 回执版本、full/quiet 历史回放 | A3 `serviceClaimsVersion=1` 与保留旧九哈希回放已接。收尾代码有新语义时沿该机制，不更新旧快照掩盖差异。 |
| C→B 股份责任、NPC典当 | N05 的真实责任条款必需；B 的 `pawnForActor` 已有实际接口，本次原有场景通过，不再凭空造当票。无权处分/善意交易的完整民事归 H15。 |
| D-1 三个实物接口的工具/engine/NPC薄路由、取消/工时终点 | `transportAction` 已有 forward/fulfill/extend，A3 deliver 有普通物品适配；N08 要接实际青苗余量/继承履行，N07 正常代理动作必需。全部预约/服务终点 H12。 |
| D-2 非金钱继承份额/货币限额、迟报 | N08 **明确必需**；当前实物继承被拒绝。原场景外关闭后迟报全程序归 H15，不借机扩展。 |
| D-3 军政财政/统计兵丁/悬赏资金账户 | H07/H08；N09 的具体本地收取授权单独完成，不放开任意 account。 |
| D-4 开放债权人/唯一胜者/公开要约 | H08；不属于本轮指定题的必要退出分支。 |
| D-5 B实体票据API、delivered remittance、post在途丢失截获 | H09；R3-E15 可在债主所在地由同伴代还，原题没有寄汇条目。既有异地现金拒绝必须保留。 |
| D-6 非人物役灵/仪式签署主体 | H10；不为本轮评分新造非人物注册框架。 |
| D-7 七模块系统归属 | 六个 A/C 模块已接，conditional 归 N13。 |
| D-8 entity-life 七项/T162/world-events 名单 | 原交接有其时点对照，本次未重跑；沿原生命周期/许可/订阅责任队列，不拿它冒充本次通过，不新增重复审核会话。N11 单独覆盖当前复现的 I6。 |
| E-1 宠物 custody/collect、私田三个公共枚举 | 后端及一年实际场景已存在；本轮修复原题所需的正式薄入口随第三卡完成并保留参数校验，不能把内部 world_pet/world_farm 能调用等同玩家目录已公布。其额外替代受托人/完整农业产品归 H11/H12。 |
| E-2 商号会籍真实实体模板/代表/资金 | H04。选择 N05 使 E18 达门槛；不放开全部 thing。 |
| E-3 会费/粮约系统开立、自动结算、关闭、P53非金钱回写 | 一般会费/village_trade H11；N08 的青苗预售实际库存履行必需，不写“已完成”字符串冒充。 |
| E-4 系统图静态义务动词与六模块 | A3 已接，当前新增遗漏仅 N13。 |
| E-5 90 天当票被 60 天产品限制 | N06 的夹具修正必需，不能改短三个月，也不能无差别放大所有借期。 |
| E-6 农忙用工还读旧 profile.areaUnits | H11/S5：私田后应按实际 `farm.field.areaUnits` 招工，原 sow 的实际面积封顶保留。本轮未观察其破坏退出结果，不能扩成全面农业重构。 |
| E-7 承租人主动退租公共入口 | H03；E12 仍留该条部分。 |
| E-8 回执默认债务人地点、代付经手代表 | N10；读侧补偿不替代源事件正确性。 |
| E-9 npc_hw_taozhi I6 | N11；本次实际复现，首先纠正直接改死亡的非法夹具，保留 I6，不进行第三次等价 HEAD-loader 取证。 |

E-1 的薄入口是原题中已交付行为的必要消费者，归第三卡接线，不另计第14个结果包。若主会话只关闭纯脚本门槛而不发布动作目录，应明确记录这一入口仍未交付，不能对玩家宣称已可用。

## 5. 最多三张收尾卡（互斥文件，按次序集成）

三卡是草案，由主会话独立审核后写入 PLAN/派工。不是把原五卡未完成清单重新塞一遍。共用接口先由第一卡冻结，第二卡复用，第三卡最后跑原题；不让两个执行者同时写同一文件。所有命令设 `TEMP/TMP/FIELDS_TMP=F:/dnd-tmp`，最多两个 Node；系统图/存档测试可能再启动子 Node，须单独串行运行。只允许停止本会话已记录 PID。

每卡提交前 CORE 一次：

```text
node --test --test-isolation=none --test-concurrency=1 tests/engine.test.mjs tests/storage.test.mjs tests/plugin.test.mjs
```

实际执行验收已通过且最终源码未再变的证据交主会话复用，合并后只跑 CORE；完整里程碑结束的全量/build:release/真实提示栈仍由主会话按既有规则安排，不能本次规划冒称已完成。

### S3-F：继承、到期与真实付款接点

**结果清单：N06/N07/N08/N10，及 N09 的共享逾期/合法代收接点。**

1. 用合法 90 天柜台前置完成两张当票、真实 NPC 买入/原票失效、掌柜死亡继任保留另一张未到期票。条件宽限读取真实灾害/路线受阻事实，仅法典/条款允许时生效，I29 到期与在场分离保持。
2. 正常新签贷款按明确 assume_by_heirs 条款进入真实药铺遗产场景；保留原 12 期、已付、原担保及历史旧贷款 accelerate。监护人代签/支付沿已有授权核验，死者既欠薪与活雇佣分开。
3. 青苗实际预付/短交/约定展期/到期，实物债继承按数量分份、按既有估值扣共享货币责任预算；保留库存、签约法、一次履行与重放。禁止删掉 cap 拒绝后无上限放行。
4. 源支付事件记录实际付款位置、账户、经手代表，保留私密与原 debtor；为第二卡租金/费用与责任执行提供现成代收/支付接口。仅新增本轮真实产品需要的已签逾期条款查询；不把司法罚款混成罚息。

**独占文件：** `server-plugin/obligation-state.mjs`、`obligation-runtime.mjs`、`obligation-presence.mjs`、`obligation-conditional.mjs`、`obligation-kinds.mjs`、`obligation-calendar.mjs`（仅确有计算缺口才改）、`transition.mjs`、`holding-sources.mjs`（仅真实继任/代表接点）、`credit.mjs`、`finance-bank.mjs`、`contracts.mjs`、`advance-registry.mjs`（仅已有到期项接点）、`engine.mjs`；`world/ontology/obligations.json`；现有 `tests/s3-runtime.test.mjs`、`s3-shared-integration.test.mjs`、`s3-i29.test.mjs`、`s3-delivery-conditional.test.mjs`、`tests/advance-registry.test.mjs`（历史回放保证不降），新增 `tests/s3-closeout-succession.test.mjs`。不碰第二卡财务资产/法院/治理文件或第三卡探针/公共 schema。

**验收命令（加 CORE）：**

```text
node --test --test-isolation=none --test-concurrency=1 tests/s3-runtime.test.mjs tests/s3-shared-integration.test.mjs tests/s3-i29.test.mjs tests/s3-delivery-conditional.test.mjs tests/s3-closeout-succession.test.mjs
node --test --test-isolation=none --test-concurrency=1 tests/transition-protocol.test.mjs tests/s2c-estate.test.mjs tests/s3-calendar.test.mjs tests/s3-accrual-static.test.mjs tests/s3-finance-scenarios.test.mjs
node --test --test-isolation=none --test-concurrency=1 tests/ledger-reconcile.test.mjs tests/holdings-reconcile.test.mjs
node --test --test-isolation=none --test-concurrency=1 tests/save-roundtrip.test.mjs
```

新增验收必须含三个月原期限、两张票继任不改条款、条件宽限正反、幼子不能自行签约、同一遗产限额跨金钱/实物债不被重复授予、份额和余量守恒、短交不免债、同次交付/支付重放、远方钱包零扣款、实际源事件地点。`s3-closeout-succession` 交接按原题①②④⑥等编号诊断，不能只有“统一接口通过”。

**规模：L，8–12 小时级，按已通过的小步提交、最长60分钟一次；原型最多两种修法；模型建议 Codex Sol `gpt-6.1-sol` high。** 不同于旧94点全迁移；如实物继承/继任超过该规模，主会话据具体阻点串行处理，不能加第四张泛化清单卡。

### S3-G：工资责任、有限司法接线、租金与已有失败

**结果清单：N02/N05/N09/N12；N11 的产品行为保证由本卡配合第三卡合法夹具验证，不改共享 I6。**

1. E04 所选矿口具有真实本地法域/执行者，盗采所得与实际知情收赃走现有证据/案件/实物链，缺证据不定罪；不借村法覆盖所有矿口。
2. 入股保存实际签署责任条款；矿工/雇工欠薪停工、法院工资优先，有限/无限责任在真实范围内执行。复用 F 的规范清偿/遗产 cap，不默认所有股东连带，不重复填补同损失。
3. 真正判监期间分期到期、有/无已签逾期条款、同伴代还与不代还；租金照常应计，现金只能交本地有权代理/代收账户，房东不在场不能直接加远方钱袋。当物到期、房屋正常折旧、同伴日程同场景保留。
4. 治理原停止块按 N12 这一次方案先定责各时间分支，修真实超权/错过后回填；既有合法执行回执不删。不得重试旧两种已失败修法；仍失败按原块标卡住。第一卡共享接口已可用，普通功能不交用户重选。

**独占文件：** `server-plugin/extraction.mjs`、`npc-crime.mjs`、`law.mjs`、`law-codes.mjs`、`obligation-claims.mjs`、`finance-assets.mjs`、`labor-market.mjs`、`governance.mjs`、`npc-autonomy.mjs`、`npc-life.mjs`（仅真实生命周期调用缺口才改）、`items.mjs`（仅已有赃物身份接点需要时）；`world/meta/rules.json` 和实际需要补充的现有法典设计源 `world/design/l1-law-codes.mjs`；`tests/s3-labor-justice.test.mjs`、`tests/s3-service-claims.test.mjs`、`tests/s3-finance-scenarios.test.mjs`、`tests/governance.test.mjs`，新增 `tests/s3-closeout-liability.test.mjs`。所有规则数据必须沿 loadWorld 现有来源生效；不手改 dist，不改 F 的共享实现。

**验收命令（加 CORE）：**

```text
node --test --test-isolation=none --test-concurrency=1 tests/s3-labor-justice.test.mjs tests/s3-service-claims.test.mjs tests/s3-finance-scenarios.test.mjs tests/s3-closeout-liability.test.mjs
node --test --test-isolation=none --test-concurrency=1 tests/mining-jurisdiction.test.mjs tests/npc-crime.test.mjs tests/law.test.mjs tests/finance-assets.test.mjs tests/governance.test.mjs
node --test --test-isolation=none --test-concurrency=1 tests/ledger-reconcile.test.mjs tests/holdings-reconcile.test.mjs
```

新测试至少分别诊断 E04-3、E18-1、R3-E15①②③与原权限失败的具体时间分支；实际成判、真实支付/实物归属、有限/无限、无人到场/失能/无权代表、超额/重放都保留。governance 的 HTTP 子进程测试单独运行时不并发其他 Node。

**规模：L，8–12 小时级，按已通过的小步提交、最长60分钟一次；模型建议 Sol high。** N12 已由本报告完成一次规划，主会话审定其时间事实/方案；只有该块再次失败才按原规则卡住，不能把它化名再派。

### S3-H：修取证、合法夹具与最终原题收口

**结果清单：N01/N03/N04/N11/N13，以及四道原题和 R2/R3 的逐条证据交付；接现成宠物/私田与本轮签约/代收的薄目录。**

1. E04-1 用现成真实 NPC 非法采掘验证同矿脉扣减；保留玩家行为失败原文、零储量拒绝和工具/库存守恒。E05-2/4 改成已存在的真实计薪/索赔场景，不能固定返回合理或只找词。
2. N11 用真实死亡/协议重建投亲夹具，保留丧期与迁居全部断言，账本不可手清；检查仍失败即按具体合法路径回 F/G，不第三次尝试旧 HEAD loader。
3. 原 `s3-probe-integration` 的四个子项扩成指定义务判据，复用 F/G 新测试的同一场景数据，逐条诊断“已测/未测/观察”；不把死亡、继任、实物继承、罚息/租金留在一句 TODO 诊断后就放行。
4. 正式 tools/action schema 只接已有且本轮需要的处理器与参数，包含 E 已实现的托养/私田入口；保留真实 consent、keeper、location、quantity、days 校验。不新增工具大类。登记 conditional 的实际系统/层归属，按既有生成器导出地图。
5. 一次运行四道原题，输出全部22条判据原文与分数；期望至少 E04=4/5、E05=5/6、E12=5/6、E18=4/5。E04-2、E05-5、E12-3、E18-4 允许继续失分，不能删掉这些条目或降低门槛。

**独占文件：** `tests/probes/run-001/e04.mjs`、`e05.mjs`、`e18.mjs`（仅真实新场景接入）、`tests/probes/s3-finance.mjs`、`tests/probes/s3-offscreen.mjs`（仅现有接口夹具）、`tests/probes/s3-closeout.mjs`（如需要共用场景才新建）、`tests/s3-probe-integration.test.mjs`、`tests/npc-life-migration.test.mjs`；`extension/tools.mjs`、`world/actions/core.json`、`tools/arch-layers.mjs`、`tools/system-map.mjs` 及其现有导出 `docs/system-map.json/html`。`tests/s3-run001.test.mjs`、题面、`tools/probe-score.mjs`、baseline 与原80%断言不改；E12 已合格的原取证直接复用，不为满分修 vacate。

**验收命令（加 CORE，以下依次运行）：**

```text
node --test --test-isolation=none --test-concurrency=1 tests/s3-run001.test.mjs tests/s3-probe-integration.test.mjs tests/s3-i29.test.mjs tests/s3-accrual-static.test.mjs
node --test --test-isolation=none --test-concurrency=1 tests/npc-life-migration.test.mjs tests/s3-offscreen-life.test.mjs tests/action-registry.test.mjs tests/prompt.test.mjs
node --test --test-isolation=none --test-concurrency=1 tests/system-map.test.mjs
node --test --test-isolation=none --test-concurrency=1 tests/advance-registry.test.mjs tests/ledger-reconcile.test.mjs tests/holdings-reconcile.test.mjs
node --test --test-isolation=none --test-concurrency=1 tests/save-roundtrip.test.mjs
```

第三卡复用前两卡未变化的机制/业务验收，不再重复全组跑同一批接口；只补最终原题、改过夹具与正式目录接点。系统图、历史快照门槛保持，旧回放不随新业务更新。

**规模：M，4–6 小时级（原题一年推进的运行时间另计），按已通过的小步提交、最长60分钟一次；模型建议 Sol high。** 判分改动由主会话对照本报告的实际能力与原文字逐项审，不再派一个只复述通过结果的审核会话。

**互斥核对：** F 独占共享/金融借贷/继承，G 独占法院/资产/劳动/治理/规则数据，H 独占探针/目录/导出；测试也按上表互斥。F→G→H 串行集成。若实际需要改另一卡文件，主会话按具体接点移交该文件所有者执行，不能两个会话同时改，更不将已授权的普通 schema/接口改动重新交用户确认。

## 6. 给主会话的完成判断

本次 run-001 为 E04 40%、E05 50%、E12 83.3%、E18 60%；只有E12达线。R2/R3 现有四个义务子项3过1败：E1败在90天产品夹具，E3/N1/E15子项过；I29三项与静态累计检查通过，但原题中继任、非金钱继承、罚息/合法代收等仍有明确未覆盖项，不能称整题义务验收全部完成。收尾按13个必需结果包、16个延期包，由F/G/H三卡完成；保留现有资金、私密、原签身份、旧存档与回放保证，日推进下降证据直接复用，31郡性能留S7。

本次仅写本报告和分析日志；未修改代码、世界、原存档、dist、PLAN/PROGRESS/CHANGELOG，未做 Git 写操作。记录的四个Node PID（53728、58244、18176、47076）均已自然结束，等待命令也已完成；没有结束任何进程。第1、2节已补录本次最终输出与分数。
