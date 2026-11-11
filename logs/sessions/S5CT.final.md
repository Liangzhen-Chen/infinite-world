# S5CT 交接

基线74个todo；原说明含S5责任9个，另识别G4租约1个误标S4，共10个。转正6个，余68个；S5相关余4个：D09跨地点体力消费、D31/32战后病程连续前提、D26指定到达钟点、D06步速口径待决。后续阶段不改为通过。

数量变化：a1-daily-probes 13→8，a3-owner2-G 6→5，其余文件不变。柜台、存单等既有正式用例随a3-owner-ding全文件验收通过，不重复计作本卡转正。

改动为测试、共用真实动作场景和阶段登记，无生产代码/世界数据更改。柜台、具名存单、质押/维持债权已在基线转正，复用原成果。S5CA的D04两项未动。

手算：春季采药20/480×120=5、余15；一亩小麦播种用2种子、240工分，真实租约→播种→成熟150份→按负重从同田账户转移；鱼1水2盐1柴1→汤1、60分钟、灶费3；运输5−2=3、在途2、提取后5；十亩租金100、零先付→债权100，减免后0，撤回后100。吃饭逐份入消费汇、店家与玩家钱差相抵。

## 验收

命令为每文件独立 `node --test --test-isolation=none --test-reporter=tap tests/<文件>.test.mjs`，TEMP/TMP均为F:/dnd-tmp，最多两个node测试进程。PowerShell默认编码使ℹ摘要无法匹配，改用TAP并只过滤 `# pass/# fail/not ok`，单次最多40个摘要项；单用例排错只读最后30行。未读完整测试输出。

最终affected-tests2命令：`node F:/dnd-tools/affected-tests2.mjs . 75cc53c2 WORKTREE 0`，清单48项：47项运行完成，其中45文件pass、2文件fail（分别与基线逐项同败）；1项长测未完成交主会话外跑。S5CT转正的6项全部通过，CORE及同步四件套通过。逐文件结果如下。

长测进程记录：工具会话3637在进入s5-playthrough的启动窗口中唯一对应node PID 54248，StartTime=2026-10-31 23:27:49，CPU持续推进。本树唯一在途临时根为 `.tmp/p54248-OLpArN`（23:27:51创建），与tools/tmp-root.mjs按process.pid建目录的代码进一步匹配，确认是本会话测试；CIM命令行查询被拒绝。只在超过40分钟且PID/StartTime仍匹配时停止这一自启测试进程，不按名称或批量停止node。

2026-11-01 00:08:13复核StartTime及已超过40分钟后，仅停止PID 54248（长测约40分24秒仍未完成），批次继续overfit-guard。清理前解析并确认其完整临时目录为 `F:/dnd-wt/S5CT/.tmp/p54248-OLpArN`、普通Directory且位于本树内；递归Remove-Item被自动审批策略拒绝（blocked by policy，无更具体原因），未换方式绕过，目录保留交主会话清理。没有停止其他node。s5-playthrough不记pass/fail，按共同规则列主会话外跑。

|文件/检查|结果|
|---|---|
|engine / storage / plugin|pass，分别22/14/7个正式用例|
|export-actions → actions-catalog / action-registry / advance-registry / arch-metrics|pass，分别4/7/5/5；重导actions.json与基线逐字节相同；未重生成金快照|
|invariants i01 / i02 / i15 / i16 / i31|pass，分别2/3/2/2/18|
|a1-daily-probes / a3-owner2-G|pass，23/4；保留8/5个todo|
|a3-owner-ding / a3-owner2-T|pass，15/6；保留15/6个todo|
|a3-score-self / a3-setup-institutions / a3-precondition-receipt|pass，43/17/38|
|a3-r9-effects / daily-b2-events2|pass，3/9|
|daily-b2-exact2 / daily-b2-mechanisms|pass，10/6|
|daily-b2-trade / world-content2|pass，10/5|
|daily-b2-events / daily-b2-tables / daily-b2-world|pass，4/8/11|
|daily-b2-exact|fail：5 pass / 2 fail；D04住店①②③、D04.4两项；S5CA所有权，本卡未改|
|基线daily-b2-exact原文单独复跑（额外核对）|同为5 pass / 2 fail，失败子测逐项同名同序，无新增。仅恢复原测试到同级临时文件，生产模块/世界数据均与75cc53c2完全相同；未伪称另建完整基线树|
|quest-sources|pass，8|
|s5-law-business-lifecycle / delivery-capacity / disease-contact|pass，13/10/7|
|s5-law-household-budget / household-labor / household-meals|pass，27/16/13|
|s5-law-land-value / maintenance / periodic-market|pass，9/13/23|
|s5-law-procurement / production-inputs / public-maintenance|pass，10/10/15|
|s5-law-seasonal-credit / soak-report / soak|pass，21/6/7|
|s5-law-tenancy-sharing|pass，15|
|s5-playthrough|未完成：40分钟长测限制停止；交主会话外跑，未改测试或断言|
|overfit-guard|2 pass / 2 fail：第2项world/actions synonyms、第4项allowlist source check；Node内spawnSync git show返回status=null、error=EPERM，需沙箱外复跑|
|基线overfit-guard原文单独复跑（额外核对）|同为2 pass / 2 fail，失败子测逐项同名同序；与当前相同的未变生产/世界输入，非本卡新增失败|

numeric-digest已运行：本卡无生产模块或世界数值改动，函数/状态输入均不变；无需字段差异表。docs/架构设计/、world/design/、dist/、docs/待办.md、docs/问题.md均无改动。未提交、未部署、未动原存档；临时调试脚本及两份基线临时测试已删除。初始提供的.base、.base-index、.base-src原样保留。docs/actions.json虽在git status显示M，但与基线逐字节相同。唯一未清理项是上述长测运行缓存目录，递归删除被自动审批拒绝，交主会话清理。

## 余项与交接接点

|余项|现有落点|缺口/下一步|
|---|---|---|
|A1 D09 / daily-b2-world D09 / exact D06|server-plugin/engine.mjs:871、:920；server-plugin/primitives-body.mjs:37|跨地点move只推进route时钟，未衔接begin/endBodyActivity。真实雨天432分钟后玩家body仍未建立，readBodyNeed损失0；未把失败改成通过。需主会话派身体消费者接点卡，覆盖正常、雨晴、失败回滚、路途歇脚与不重复扣费。|
|A1 D31/32|server-plugin/activities.mjs:162；tests/daily-b2-events2.test.mjs:44；docs/probes/daily/events.md:191|普通战斗的received送health，诊疗夹具则直接预置medical.bite，缺同一战斗来源到具体咬伤病程的接点。保留组合todo，由原身体/战斗领域补连续来源。|
|D26指定午时到达|server-plugin/transport.mjs:46、:158、:179|班次只取carrierDeparture，预计到达=发车+route.minutes，未消费batching.waitDays；不为题面硬加两小时。|
|D06题面步速|world/rules/tables/balance/transport.json:5；tests/daily-b2-tables.test.mjs:111|10与15里/时辰冲突及[12,18]界属已标待决；登记到docs/待用户确认.md，未改数值。|
|G4历史运损、失效当票等S4项|server-plugin/transport.mjs:539；docs/A3-后续阶段登记.md CT01|消费者要求真实customer original、observed来源及cargo同物；已有运输与损耗不代替指定机构原件。仍待S4原件生产动作。|

G4测试逐处对齐依据：①原terms.fieldAreaMu改查原生源租约rentBasis.areaMu，仍严格等于10；②删除的restoreObligationSnapshot调用改为现存applyIntentSetup拒绝复制来源，并断言第二笔债不存在、原债逐字段不变；③原租金100、减免0、撤回100、非法代理拒绝、来源相同、账本无漂移和存档重放全部保留。NPC名字改用现存作者NPC，不造测试人物。租约由setup.prelude的world_act动作生成。

A1新增场景不写准备好的食用、成熟田、采药所得或运单。种收先真实租田；短农时仅用规则副本缩短等待。造车调用现存NPC生产动作createTransportAsset消耗木铁，随后订运、等待、跨地提货走真实execute；现有公开register仅为玩家造车，未为测试新增NPC工具。未动生产模块、世界数据或S5CA的D04两项。

## 原74个todo逐条归属清单

“原说明阶段”逐字取自原todo（多阶段并列保留）；以显式“归”优先。依据是每行原注释及 docs/A3-后续阶段登记.md 的既有登记和本卡 CT01–CT08，不凭题名把司法纸本挪给经济阶段。

|基线文件:行|原说明阶段|原todo说明|处理/登记|
|---|---|---|---|
|tests/a3-owner-ding.test.mjs:118|S4|N/O: fine settlement pays the public account through this fine’s on-duty office, with replay protection〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕|保留；登记 CT01|
|tests/a3-owner-ding.test.mjs:133|S4|N/O: absent, off-duty or unrelated office cannot collect public fines〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕|保留；登记 CT01|
|tests/a3-owner-ding.test.mjs:143|S4|N/O: full corpus fine proposal routes to the real public collection and emits only booked payment and settlement〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕|保留；登记 CT01|
|tests/a3-owner-ding.test.mjs:208|A3|O: the native snapshot writer books the existing collateral without relying on the corpus ledger rebuild〔前提待真实动作：给质押债权签入 1440 分钟宽限；归 A3 生产者卡〕|保留；登记 CT03|
|tests/a3-owner-ding.test.mjs:216|S4|O/P: historical delivery claim reads real damaged cargo and original handover links without replay or invented compensation〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕|保留；登记 CT01|
|tests/a3-owner-ding.test.mjs:259|S4|P/Q: the same new receipt retains source and review status across save and submission, with no second paper or premature verdict〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕|保留；登记 CT01|
|tests/a3-owner-ding.test.mjs:287|S4|Q: existing stages, judgment, appeal period and defendant persist without inventing charges or penalties〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕|保留；登记 CT01|
|tests/a3-owner-ding.test.mjs:315|S4|Q: unrelated judgments, forged registration and nonexistent parties are rejected without opening a new case〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕|保留；登记 CT01|
|tests/a3-owner-ding.test.mjs:325|S4|P/Q: legal requests consume native incidents, papers, cases and current offices without inventing outcomes〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕|保留；登记 CT01|
|tests/a3-owner-ding.test.mjs:341|S4|Q: ordinary law actions also read restored cases before demanding adjudication powers〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕|保留；登记 CT01|
|tests/a3-owner-ding.test.mjs:349|S4|P/Q: absent authority, private incidents, expired appeal, forged paper and unagreed defence remain rejected〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕|保留；登记 CT01|
|tests/a3-owner-ding.test.mjs:370|S4|P/Q: native legal requests survive real campaign export/import and replay〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕|保留；登记 CT01|
|tests/a3-owner-ding.test.mjs:383|S4|Q: an incapacitated incumbent cannot receive a new request or appear as a current handler〔前提待真实动作：形成指定案件阶段、在岗机构身份及原始证据文书；归 S4〕|保留；登记 CT01|
|tests/a3-owner-ding.test.mjs:446|S4|N–Q: the case, fine, paper and office premises of the combined corpus are loaded〔前提待真实动作：S5 能满足的柜台/存单/质押/维持债权已转正式用例；剩余 051/052/054/055/056/057/058/107 需在岗机构身份、已立案阶段、判决/罚款及原始证据纸本；归 S4〕|保留；登记 CT01|
|tests/a3-owner-ding.test.mjs:452|S4|N–Q: campaign export/import and reducer replay retain the fine claim and the case paper〔前提待真实动作：A3V2-054 罚款需在岗机构与已立案判决，A3V2-052 新收据纸本需机构案件阶段与原始证据文书；柜台/存单/质押/维持债权已转正式用例；归 S4〕|保留；登记 CT01|
|tests/a3-owner2-G.test.mjs:32|S4|G1: accepted public work enters the local source ledger once and is read without crediting again〔前提待真实动作：通过真实批准、施工、验收建立当地公共工程贡献来源；归 S4〕|保留；登记 CT01|
|tests/a3-owner2-G.test.mjs:73|S4|G3: pending application and ordinance retain source; inspection never approves or charges〔前提待真实动作：制作机构原件、NPC 宅地申请、匿名汇总票、公告、运损和失效当票原件及指定租契；归 S4〕|保留；登记 CT01|
|tests/a3-owner2-G.test.mjs:107|S4|G3: aggregate votes are preserved without invented electors, chair, majority charter or completed decision〔前提待真实动作：制作机构原件、NPC 宅地申请、匿名汇总票、公告、运损和失效当票原件及指定租契；归 S4〕|保留；登记 CT01|
|tests/a3-owner2-G.test.mjs:137|S4|G4: native transport inspection reads nine-day delay and actual damage without inventing a delivery claim or compensation〔前提待真实动作：制作机构原件、NPC 宅地申请、匿名汇总票、公告、运损和失效当票原件及指定租契；归 S4〕|保留；登记 CT01|
|tests/a3-owner2-G.test.mjs:150|S4|G4: invalid pawn ticket stays invalid and grants neither ownership nor redemption〔前提待真实动作：制作机构原件、NPC 宅地申请、匿名汇总票、公告、运损和失效当票原件及指定租契；归 S4〕|保留；登记 CT01|
|tests/a3-owner2-G.test.mjs:165|S4|G4: rent imports as rent, creditor waiver is local, unauthorised waiver fails; storage export/import and replay preserve source〔前提待真实动作：制作机构原件、NPC 宅地申请、匿名汇总票、公告、运损和失效当票原件及指定租契；归 S4〕|转正；原S4误标，实际归S5租约/减免|
|tests/a3-owner2-T.test.mjs:30|S4|T1: native absolute dates use real short/leap months and derive autumn darkness without an item〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕|保留；登记 CT02|
|tests/a3-owner2-T.test.mjs:168|S4|T4: native office derives one monthly quota; publish escrows real money and cancellation refunds without restoring quota〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕|保留；登记 CT02|
|tests/a3-owner2-T.test.mjs:187|S4|T4: forged powers/usage/escrow, absent office term, closed office and wrong-seat publishing fail〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕|保留；登记 CT02|
|tests/a3-owner2-T.test.mjs:200|S4|T4: a dedicated escrow expires through the real clock, refunds its owner and retains the failure and used quota〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕|保留；登记 CT02|
|tests/a3-owner2-T.test.mjs:213|S4|T1/T4: a native skipped leap month does not create another publishing allowance〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕|保留；登记 CT02|
|tests/a3-owner2-T.test.mjs:232|S4|T1–T4: real save/reopen/replay retains native clock, private task and paid prize exactly once〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕|保留；登记 CT02|
|tests/a3-score-self.test.mjs:59|S4|A3 signature r10: conditional legal consequences require their native submission and recipient decision〔前提待真实动作：形成指定案件阶段、在岗机构身份及证据原件；归 S4〕|保留；登记 CT01|
|tests/a3-score-self.test.mjs:294|S4|A3 signature r9: authorized-collector fine payment uses the resolved court/creditor and exact account purpose〔前提待真实动作：A3V2-054 需镇巡值房在岗机构身份、已立案判决及公库债权（白石章程无裁判权）；归 S4〕|保留；登记 CT01|
|tests/a3-score-self.test.mjs:817|S4|A3 setup r7: all seven declared scenes open native entities, holdings and status without changing the source〔前提待真实动作：创建指定章程机构席位及任职；归 S4〕|保留；登记 CT01|
|tests/a3-setup-institutions.test.mjs:127|S4|accounts: a native original purse bound by container is unmet when the container is missing〔前提待真实动作：A3V2-096 同时要求 npc 注意力/警觉初态与题面声明的 1 米站位（原生 6 米），且钱袋硬币账户须由前置动作产生；归 S4（空间与感知）〕|保留；登记 CT02|
|tests/a3-setup-institutions.test.mjs:201|S4|obligations: native old fines and delivery claims preserve claims without fresh funding; overpaid/unresolved-source snapshots are rejected〔前提待真实动作：A3V2-054 需镇巡值房在岗机构身份与已立案判决（白石章程无裁判权），A3V2-056 需在岗机构与已签收货损文书；二者均属机构/案件阶段；归 S4〕|保留；登记 CT01|
|tests/a3-precondition-receipt.test.mjs:128|原说明未写；依法律前提判定S4|A3 native legal 56: original premises submit only a request in routed and direct calls（动态 test.todo；legalRequests 中仅56未转正）|保留；补明S4及登记 CT01|
|tests/a3-r9-effects.test.mjs:87|S4|R9: legal requests never prepay, appoint, accept or adjudicate without the recipient decision〔前提待真实动作：形成指定案件阶段、在岗机构身份及证据原件；归 S4〕|保留；登记 CT01|
|tests/a1-daily-probes.test.mjs:213|A2|D03 议价过程：成交价仅校验在标价区间；缺 NPC 对报价作决定并同意成交（A2 NPC 决策与对话）|保留；登记 CT04|
|tests/a1-daily-probes.test.mjs:214|S5/A1|D05 酒馆吃饭：缺玩家在店内购买/食用饭食及库存、扣款和饱腹结算（S5 市场与生态；动作由 A1 接入）|转正；真实动作/手算见对应测试|
|tests/a1-daily-probes.test.mjs:215|A2/S6|D07 问路：缺问路动作、NPC 按主观视图回答和玩家获得地点知识（A2 对话与 NPC 决策；S6 知情集合/地图投影）|保留；登记 CT04|
|tests/a1-daily-probes.test.mjs:216|S1/A3/S5|D09 下雨天：天气已影响路程；仍缺玩家体力消耗（S1 身体账本，A3 移动消费）与淋湿暴露状态及反应（S5 修正槽/反应）|保留；登记 CT05|
|tests/a1-daily-probes.test.mjs:217|S3|D11 月结工钱：只有按工时日结；缺按月锚定结算的工资义务及结算后持续有效的雇佣关系（S3 义务统一）|保留；登记 CT04|
|tests/a1-daily-probes.test.mjs:218|S5/S2|D12 收割 / D13 播种：已有私田播种/采收动作；本题缺可取得的自有田地及从播种到成熟收割的连续真实场景（S5 生态；依赖 S2 持有/地块）|转正；真实动作/手算见对应测试|
|tests/a1-daily-probes.test.mjs:219|S5|D14 采草药：缺野生药草的有限存量、季节密度/再生及采集转移动作（S5 生态与再生）|转正；真实动作/手算见对应测试|
|tests/a1-daily-probes.test.mjs:220|S5/A1|D16 做饭：缺适配现有材料与合法作台的可用配方；需真实配方消费材料并生成食物（S5 配方消费者；动作由 A1 接入）|转正；真实动作/手算见对应测试|
|tests/a1-daily-probes.test.mjs:221|S6|D21–D25 寒暄、打听、接交委托、送信：缺对应 NPC 对话/决策与委托承接交付（A2）；信件代表物归 S3，知情传播归 S6|保留；登记 CT04|
|tests/a1-daily-probes.test.mjs:222|S5|D26 托运货物：缺订运、真实交接到货的一条可执行流程及承运动作（A3 开放动作；路线和运力消费者归 S5）|转正；真实动作/手算见对应测试|
|tests/a1-daily-probes.test.mjs:223|S5|D31 普通打斗 / D32 受伤求医：缺指定遭遇的普通战斗动作与战后真实伤势；诊疗需真实服务者和治疗结算（S1 身体账本、A3 战斗动作；服务能力归 S5）|保留；登记 CT06|
|tests/a1-daily-probes.test.mjs:224|C1/S4/S6/A2/S2|D35 节庆 / D36 加入组织：节庆缺指定活动内容与参加结算（C1 内容、S4 场地/时段、S6 立场）；入会缺组织者真实同意和成员权利派生（A2 决策、S2 持有）|保留；登记 CT04|
|tests/a1-daily-probes.test.mjs:225|S4/S6|D38 看告示听传闻：缺告示的规范来源与执行一致性（S4 法域规范）；传闻需遵守来源和知情边界（S6 知情与投影）|保留；登记 CT04|
|tests/daily-b2-events.test.mjs:37|S3/S6|D25 ②背包里的信 −1——引擎信是一条记忆文本（post.payload），不是背包物品：缺“信件物品 + 代表它的义务”（S3 票据 = 义务 + 代表物品；S6 文书）|保留；登记 CT04|
|tests/daily-b2-events.test.mjs:99|S5|D26 ④到达钟点“九月十六午时前后”——W8D 起车行发车读 departure:cart（午初前整点随到随发），车速仍是 rules.travel.cartKmh；本例 08:00 发车、次日 09:20 到仍与题面约 2 小时差距：缺车行并车/等客（batching.waitDays）与逐日行程对齐钟点的消费（S5）|保留；登记 CT07|
|tests/daily-b2-events2.test.mjs:121|S2|D36 ④会员权益（参加会内狩猎分成）——引擎成员资格只记在组织名册，没有“会员权益”派生（狩猎分成/额度/投票权）：缺 member_of 持有的 derives（S2 持有与协议）|保留；登记 CT04|
|tests/daily-b2-events2.test.mjs:152|S3/S4|D37 ③玩家获得完税凭据——引擎只在账上记 tariff_passage 与 trade_tax 记录，玩家手里没有凭据物品：缺“征管流程出具文书物品”（S3 票据 = 义务 + 代表物品；S4 税表 assessed 流程）|保留；登记 CT04|
|tests/daily-b2-events2.test.mjs:153|S4|D37 ①“个人随身物品免税”的口径——引擎规则是每种货免税 personalAllowance=2 件（本测试夹具把它设 0 对齐题面）；设计口径是 tax.json exemption.default（口粮、生计工具）按类别免、货物全额计税：缺 exemption 按类别消费（S4 税表 exemption/subjects）|保留；登记 CT04|
|tests/daily-b2-events2.test.mjs:180|S6|D40 ③不同 NPC 回忆喜事的说法一致（日期都是九月初三）——引擎传闻没有 tell 版本与失真表的日期行：缺 distortion 的 date 行 p = 0（S6 失真表 core 行；附录 A §A.18 失真表行）|保留；登记 CT04|
|tests/daily-b2-exact.test.mjs:61|S2|D04 ⑤该单间当晚被占用，其他住客不能再订同一间——引擎客房只有“间数”(rooms: 3)，无住客占位，NPC 不入住：缺 lodges 持有与 capacity 派生（S2 持有）|保留；登记 CT04|
|tests/daily-b2-exact.test.mjs:74|S1/A3|D06 ③体力下降（步行 4 小时，未降到 0）——引擎没有体力：缺 body.stamina（S1 vital；A3 move 的 cost.body 读 body.json drainPerHour.travel 5/小时 → 100→80）|保留；登记 CT05|
|tests/daily-b2-exact.test.mjs:114|S1|D19 ④技能列表新增“设陷阱（入门）”——引擎教的是配方/技能条目（本例入册的是配方）；设陷阱技能与入门阶的获得阈值没有数据，“学满 3 天恰好到入门”无法判定：缺 learning.json 的 taught 课时与入门阈值的消费（S1 learn 原语读表；缺省 perHour.taught 3.4 已在表）|保留；登记 CT04|
|tests/daily-b2-exact2.test.mjs:29|A3/S6|D08 ①叙述反映天色已暗（黄昏/入夜）——引擎有昼夜数据（weather.inspect 的 daylight: false），但场景头只写“18:50｜晴｜14℃”，不带昼夜/日落标记：缺场景头与感官素材按季节 × 时段的投影（06 §6.9.4；A3 场景投影，S6 空间投影 scene()）|保留；登记 CT04|
|tests/daily-b2-mechanisms.test.mjs:10|A2/S6|D07 问路 ①②③④⑤——引擎没有“向人打听地点”的动作：NPC 按自己的主观视图答复方位/距离并写入玩家“已知地点”（A2 对话动作组与主观视图 API；S6 知情集合与地图迷雾“可靠转述”）。数据已备：action-costs talk.direction = 3 分钟（题面 2–5），event-weights ask_way/affinity = +0.5（不变或微升）|保留；登记 CT04|
|tests/daily-b2-mechanisms.test.mjs:13|A2/S3/S1|D10 打工日结 ①–④——受雇须对方答应：world_act 列出但拒绝（“需要对方答应”，a1-daily-probes 的 D10 测试守着这条）；缺 NPC 决策规则骨架（A2）与 employed_by + wage 义务按日 30 文清偿（S3 义务统一：雇主账户转出）；体力下降缺 S1 body|保留；登记 CT04|
|tests/daily-b2-mechanisms.test.mjs:20|S3|D11 月结工钱 ①–⑤——引擎只有按工时日结的受雇（labor-market），没有月薪雇佣：缺 wage 义务 per: anchor（每月初一）与 accruedTo 闭式（附录 A §A.15 期间与折算：八月满勤 → 600，钱柜 2000→1400，同一个月不领两次）、雇佣关系 settle 后继续有效（S3 义务统一）|保留；登记 CT04|
|tests/daily-b2-mechanisms.test.mjs:110|A2/S6|D21 寒暄 ①–⑤——引擎没有“与人聊天”的动作：陈伯按性格与季节谈秋收、天气与实际一致、好感 +1~+3、约 15 分钟、无钱物变化（A2 对话动作组、对话模板 when: season()；S6 立场事件权重）。数据已备：action-costs talk.greet = 15 分钟，event-weights greet/affinity = +1（饱和 5 次 × 0.5，累计不超过 +5）|保留；登记 CT04|
|tests/daily-b2-mechanisms.test.mjs:113|A2/S3|D29 借小额钱款 ①–⑤——向邻居借须对方答应：world_act 拒绝（“需要对方答应”，a1-daily-probes 的 D29 测试守着），钱庄借款走抵押旧判定，不是题面流程；缺 NPC 决策（A2）与 loan 义务无息条款 rate: 0（S3；附录 A §A.18 借贷利率区间 [0, 0.05]）。数据已备：event-weights borrow/trust = 0|保留；登记 CT04|
|tests/daily-b2-mechanisms.test.mjs:114|S3/S6|D30 按时还钱 ①–⑤——同上；钱庄借款的按时还清（状态已还清、无逾期）由 a1-daily-probes 覆盖，但“陈伯 +100、250→150、好感小幅上升（守信）”缺 NPC 间借贷与 settle_on_time 立场事件（S3；S6 立场事件权重）。数据已备：event-weights settle_on_time/trust = +2|保留；登记 CT04|
|tests/daily-b2-tables.test.mjs:111|S5|D06 ① 题面“步行 10 里/时辰、20 里约 4 小时、卯时出发约巳时到”与数值方案冲突：transport.json speed.walk 缺省 15 里/时辰（界 [12, 18]，日行 60 里），20 里约 2.7 小时、辰时初到；S5 运力/交通参数口径待用户决定：改题面（速度改 15 里/时辰或距离改 30 里）还是改速度界|保留；登记 CT08|
|tests/daily-b2-trade.test.mjs:45|A2|D03 议价过程：玩家开价、孙二还价并同意 45（NPC 决策与对话）——引擎只校验成交价在议价区间 [0.9, 1.1]×标价内；NPC 自己决定接不接受归 A2（NPC 决策规则骨架）|保留；登记 CT04|
|tests/daily-b2-trade.test.mjs:135|C1/S4|D35 ③节庆只在八月十五当晚出现，次日恢复平常——引擎有按历法日期运行的节庆（festival-runtime.test.mjs），但没有中秋灯会与摊位的节庆数据（C1 内容接入；摊位随节庆开闭属 S4 营业时间 schedule 表）|保留；登记 CT04|
|tests/daily-b2-trade.test.mjs:136|S6|D35 ④好感可小幅上升——引擎无参节庆的立场事件（S6 立场事件权重表 event-weights 增 attend_festival 行后读表）|保留；登记 CT04|
|tests/daily-b2-trade.test.mjs:137|A3/C1/S4|D35 lantern-festival end-to-end content remains: festival_watch now consumes a real held event endsAt (A3 integration covered), while the specific eighth-month fifteenth lantern event and award data are still absent (C1 content integration; event schedule in S4)|保留；登记 CT04|
|tests/daily-b2-world.test.mjs:41|S1/A3|D09 ③体力消耗比晴天多——引擎没有玩家体力（只有生命）：缺 body.stamina 闭式消耗（S1 vital 原语；A3 move 的 cost.body 读 body.json drainPerHour.travel 与雨天修正项）|保留；登记 CT05|
|tests/daily-b2-world.test.mjs:125|S4|D38 ⑤告示内容与实际执行一致（四月初一起确实收 50 文）——缺“告示 records = 规范条目制定事件、征收按同一条目执行”（S4 法域规范栈；税表 recipient/exemption）|保留；登记 CT04|
|tests/daily-b2-world.test.mjs:178|S6|D24 ⑤村长好感小幅上升——引擎交付委托不产生立场事件（standing 不变）；缺 complete_bounty 事件进立场（S6 立场改可重建缓存，读 event-weights complete_bounty/trust = 4）|保留；登记 CT04|
|tests/daily-b2-world.test.mjs:179|S2/S3|D24 ③村长公库——引擎酬金出自发布者个人钱袋托管，委托发布时即扣；题面“公库 500→460”按托管口径等价，村长以执行人动用公库（actedAs）属 S2 职位与 S3 义务|保留；登记 CT04|
|tests/world-content2.test.mjs:66|S4|020 题设按真实席位（旧磨坊）搭建后，能唯一找到木工考官，申请不预先授予资格；白石行会窗口没有木工考官〔前提待真实动作：创建并授权木工申请登记窗口职位、登记转介及考核；归 S4〕|保留；登记 CT01|
|tests/world-content2.test.mjs:83|S4|同一窗口多个登记职位仍需消歧，在岗布尔值不能代造授予权〔前提待真实动作：创建并授权同一窗口的第二个登记职位；归 S4〕|保留；登记 CT01|
