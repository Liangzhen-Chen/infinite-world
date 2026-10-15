# run-001 核对结果 A（E01–E10）

核对日期 2026-10-15。代码快照 F:/dnd-wt/PROBE-001（只读）。实测脚本在 F:/dnd/logs/sessions/probe-001-scratch-a/（common.mjs 用 loadWorld + WorldEngine + createCharacter + reduce/world_time 搭世界；e02b/e03/e04/e06/e08.mjs 是实测脚本）。下文“文件:行号”默认指 server-plugin/ 下的文件。
E11–E20 由另一位代理核对，不在本文。

## 汇总表

| 事件 | 合理 | 部分 | 错误 | 缺失 | 小计 |
|---|---|---|---|---|---|
| E01 上游过伐，下游秋旱 | 0 | 3 | 0 | 2 | 5 |
| E02 镇长暴毙 | 1 | 3 | 1 | 0 | 5 |
| E03 村长→升镇→罢免 | 3 | 1 | 1 | 0 | 5 |
| E04 矿脉见底，夜间盗采 | 1 | 2 | 0 | 2 | 5 |
| E05 冬季托运到远方 | 3 | 2 | 0 | 1 | 6 |
| E06 夏夜铁铺火 | 0 | 2 | 1 | 3 | 6 |
| E07 首领巨蟒，兽群下山 | 1 | 1 | 1 | 3 | 6 |
| E08 昏迷者能否施治疗术 | 2 | 2 | 0 | 1 | 5 |
| E09 催熟术冲击粮市 | 2 | 2 | 0 | 1 | 5 |
| E10 跨政体婚姻分产 | 1 | 2 | 0 | 2 | 5 |
| **合计** | **14** | **20** | **4** | **15** | **53** |

## 逐事件明细

### E01 上游过伐，下游秋旱【离屏】
情境构造：世界里没有石坳村、柳溪村，只有白石镇辖下五村（榆坡、苇汀、砾泉、桑坂、河湾）。能用两个村作替身，但没有“上游/下游”水系关系，也没有伐木和矿场排污的状态，所以无法构造。干旱只能靠种子决定的天气，不能指定“40 天无雨”。
- ① 水质下降可追溯到伐木和排污 —— **缺失**。没有水质、污染源或流域状态；environment.mjs 只有“搬水时污染随水移动”的注释（environment.mjs:98,167）。林水有限供给 RW-04 在做。
- ② 下游鱼价、粮价涨，上游柴价跌 —— **部分**。有价格机制，但和这件事的因果对不上。价格时钟多数阶段条件是 always 或天气，由种子掷骰（rules.hazardClock price:*）；鱼价只随野生种群稀缺度变化（wildlife.mjs:183-194）；柴价没有与伐木关联的机制。
- ③ 腹泻集中在下游，药材需求上升 —— **部分**。有水源传播的“河泻症”（rules.hazardClock.diseases，route=water），净水能压低传播（seasonal-hazards.mjs:17-22），但触发条件是洪水阶段、饥荒或天气，与污染无关。“药材需求”没有机制。
- ④ 柳溪村对石坳村好感下降 —— **缺失**。没有村对村、因环境受损而改变的立场。
- ⑤ 玩家只通过传闻知道 —— **部分**。传闻和知情边界的底座存在（npc-rumors / return-summary），但这件事本身不会生成传闻。
- 易错项（产量重复扣减）：无从发生。旱灾只通过天气的 cropMultiplier 影响作物生长（agriculture.mjs:100），本来就没有第二个来源。

### E02 镇长暴毙★【离屏】
情境构造：用榆坡村头人赵枫（npc_yp_zhaofeng，52 岁，职务“坡田轮水记录人”，月俸 120 铜）代替周廷。他没有酒坊，也没有侄子监护，钱庄贷款用“玩家借给他 3300 铜（player_loan）”代替。实测 e02b.mjs：先推进到第 29 天，再调用 recordEntityDeath 让他“猝死”，然后推进 40 天。
- ① 职位空出、代理或补选、俸禄停发 —— **部分**。实测：死后 settlementGovernment.head = null，40 天后仍是 null。没有任何人代理或补选（entity-view.mjs:411-418 只返回空缺），补选只能等玩家去公署申请。俸禄确实停了：40 天内没有给他生成 office_salary（personOffices 过滤死者，entity-view.mjs:58；office-salary.mjs:30）。但俸禄按月边界结算，没有算“死亡当日”，死前当月的部分直接不发。
- ② 酒坊归继承人；无继承人时封存，雇工工资照常累计 —— **部分**。房产按份额转给继承人（family-inheritance.mjs:57-62）。但死者参与的所有“有效”合同在死亡当刻一律终止，包括雇工的 workshop 合同（npc-life.mjs:392-399），所以雇工工资不会累计，也不会因欠薪停工。没有继承人时直接 return（family-inheritance.mjs:46-49），房产留在死者名下，没有官府封存这一步。
- ③ 贷款先从遗产清偿，不转嫁侄子 —— **错误**。实测：遗产 5000 铜全数分给继承人史乐，3300 铜借据只列进 estate.debts，并没有清偿（family-inheritance.mjs:45,50）。之后分期按“债务人已死，付 0”处理（finance-bank.mjs:228），到期转为“逾期”，并以死者为被告立了 credit default 案（实测输出 `legal_case:default:debt_lend_probe … debt_default:npc_yp_zhaofeng`）。债没有转嫁给继承人，这一点对；但继承人拿走了全部遗产，债权人落空。
- ④ 侄子的监护权按族谱转给下一顺位 —— **部分**。监护人死后，advanceGuardianships 只把记录改成“待指定”（family-inheritance.mjs:102；familyAdult 含存活判断，family-state.mjs:6），不会按族谱自动转给下一顺位。死者自己的未成年继承人则会按“父母→同户成年人”顺位指定（family-inheritance.mjs:31-32），这条是对的。
- ⑤ 日程立即终止 —— **合理**。实测：status=死亡，activity=已故/死亡；日程推进跳过死者（npc-schedule.mjs:44,111）。

### E03 玩家当村长，村升为镇，再被罢免★【主动】
情境构造：用榆坡村代替柳溪村。玩家在 records 里注入村长官职，再注入 settlement_rank=镇（实测 e03.mjs）。
- ① 升格后俸禄、公库额度、任务额度按镇级 —— **合理**。实测：村长 quota10/budget2000/salary120/税上限 800bps，升镇后变为“镇长” quota40/budget5000/salary360/税上限 1000bps。这些值都在读取时按当前级别派生（entity-view.mjs:43-52；promotion-view.mjs:17-25）。“可任命职位数”没有单独机制。
- ② 税率和税基按镇级 —— **合理**。tradeTax 读 adminLevel 加上 levelBps（finance-tax.mjs:19-20）。
- ③ 集市、驿站没完工不能通过 —— **部分**。升格条件只数“公共设施”的个数，需要 2 个，不区分设施种类（promotion.mjs:51,53），盖两个任意公共设施也能过。
- ④ 罢免当天收回任免权和公库权限 —— **合理**。实测：官职改为“已免职”后 playerOffices 立即为空；spendPublic 依赖 playerOffices（governance.mjs:396-399）。罢免本身不是大会表决，而是定期复核时“反对多于支持”就免职（governance.mjs:363-372）。
- ⑤ 他任命的人默认留任 —— **错误**。实测：玩家被免后，他任命的管事（housing_steward）的官职也立即消失（after removal steward:[]）。原因是 entity-view.mjs:69-70 要求授权人仍是在任头人。另有一处【写死】：升镇以后管事的名称仍是“村管事”，只有月俸按级别从 40 变成 120（升格 effects 没有覆盖 office_village_steward 的名称）。

### E04 矿脉见底，夜间盗采【连锁】
情境构造：用裂炉营的“矿口”（site_ms_ll_adit，储量 30，矿主 npc_ms_ll_yayue）代替黑岩铁矿。世界里没有矿工雇佣，也没有矿主欠薪。实测 e04.mjs：玩家无许可开采 4 次。
- ① 盗采同样扣储量 —— **部分**。玩家盗采会扣：实测储量 30→28，illegal=true（extraction.mjs:76-79）。NPC 不会盗采，NPC 犯罪只有 assault/smuggling/fraud/theft 四种（npc-crime.mjs:35-40），所以“矿工夜里盗采”无法发生。
- ② 停工后正规产量为零，铁价上涨，玩家打造成本上升 —— **缺失**。矿脉只有玩家能挖，没有 NPC 或矿主的正规产量；铁价和矿脉产出没有关联。
- ③ 按法典处理盗采，买赃者也可能被追责 —— **缺失**。实测：case=null，因为矿口不在任何法典辖区，registerIncident 选了 optional 就直接跳过（law.mjs:61）；五部现行法典的 penalties 也都没有 illegal_mining。“买赃”罪名不存在。
- ④ 欠薪矿工起诉，判决后优先清偿工资 —— **部分**。通用的雇佣市场有“欠薪→罢工→逾期立案”（labor-market.mjs:144-153,202,208-217），但矿上没有雇工，也没有“工资优先受偿”的规则。
- ⑤ 储量归零后不再产出 —— **合理**。reserve 为 0 时直接报“矿脉已枯竭”（extraction.mjs:73）；矿口 recoveryDays=0，不会回补。一般岩层的矿点按 30 天 +1 回补，属于设计行为。

### E05 冬季托运到远方【主动】
情境构造：区域大纲里有“北境星湾”。远方郡只在玩家本人到达时才生成（engine.mjs:246 unfoldRemoteAt），所以在玩家去之前无法向星湾下单托运。本事件按代码判断，未实测。
- ① 超载拒运或分批 —— **合理**。重量、体积或座位超出就拒运（transport.mjs:72）。没有分批，但拒运本身符合预期。
- ② 滞留按天气结算，护卫工资按天累计 —— **部分**。天气、季节封路或灾害封路时会插入“等待”段（transport-route.mjs:13-14），状态记为 delayed。护卫费在下单时按距离和风险一次算定（transport.mjs:126），滞留天数不会增加护卫费。
- ③ 两道关卡按各自政体税率收税 —— **合理**。每段按“目的地”结算 tradeTax，政体类型和级别都参与（transport.mjs:77；finance-tax.mjs:10-20）。
- ④ 受潮降价或按契约索赔 —— **缺失**。没有货损、受潮或索赔机制。
- ⑤ 首次到达才生成星湾骨架 —— **部分**。“到达才生成、此前没有细节”符合预期（remote-generation.mjs:9-18）。但正因为没有骨架，玩家去之前无法托运货物过去，题目所设情境本身构造不出来。
- ⑥ 汇票只能在有网点处兑现 —— **合理**。必须指定异地真实钱庄柜面，兑付地不符就报错（finance-bank.mjs:184-197）。

### E06 夏夜铁铺火【离屏】
情境构造：用河湾村铁匠铺（bld_hw_forge）代替。没有关帝庙，也没有粮仓出租给米商。实测 e06.mjs：把铁匠铺设为起火，另把 bld_hw_mill 设为玩家所有、毁损（condition=0），再注入一份月租 400 的租约，推进 65 天。
- ① 蔓延受风向和间距影响 —— **部分**。只按风“速”放大蔓延距离（8+风速/2），不看风向；每次最多波及 2 个最近邻，深度小于 2（facilities.mjs:65-69）。实测：铁匠铺自己烧到 condition=0，周围没有任何建筑被引燃，因为同一父地点下的坐标按 ×1000 换算后都超出了距离。
- ② 存粮损失，粮价短期上涨 —— **缺失**。火灾只降低建筑 condition（facilities.mjs:16-25），不影响建筑里的存货，也不连到价格。
- ③ 租约按毁损条款处理，未修复期间停收租金 —— **错误**。实测：建筑已毁（condition=0），65 天内照收租金 800 铜（rent received 800）。rentDue 不检查建筑状态（finance-assets.mjs:207-216,241），这正是题目列出的易错项。
- ④ 偏殿受损后香火下降，可以募捐修缮 —— **缺失**。寺观“修缮”用途直接抛出“修缮等待设施接口”，engine 没有 repairFaithFacility（faith.mjs:134-136）。香火捐献存在（faith.mjs:183），但和建筑损毁没有关联。
- ⑤ 铁匠被追究失火责任 —— **缺失**。没有失火或纵火罪名，实测 legal_case 为空。
- ⑥ 起火时铁匠按日程不在铺内 —— **部分**。NPC 日程存在，但没有“炉火未熄”这类由 NPC 行为引发的起火源，起火只能由玩家或魔法点燃，所以日程和火源对不上。

### E07 首领巨蟒出巢，兽群下山【连锁】
情境构造：有 42 个首领和巢穴记录，也有为部分村子配置的害兽农田（rules.wildlife.farmPests），可以挑最接近的组合替代。本事件按代码判断。
- ① 首领领地挤压其他动物，被挤出的动物迁到低处、麦田减产 —— **缺失**。首领没有领地扩张；季节迁徙和害兽农田都与首领无关（bosses.mjs、wildlife-migration.mjs、farm-pests.mjs）。
- ② 击杀后兽群逐步回迁 —— **缺失**。前提①不存在，回迁也就没有。
- ③ 猎犬受伤需要治疗，不治会死或退化 —— **部分**。宠物有饥饿、疾病扣血致死、忠诚下降和出走（pets.mjs:63-89），但外伤本身不会随时间恶化。
- ④ 首领死后不会原地立刻刷新 —— **合理**。巢穴空置，经过 vacancyDays 才会有新占据者，而且迁入者不能是同种（bosses.mjs:39,68,104）。
- ⑤ 击杀名声随传闻扩散，有机会进入名士条件 —— **缺失**。fame 只来自法律案件和决斗（reputation.mjs:36-45；duels.mjs:56-57）；名士成就只认学术、艺术、教育（notables.mjs:26-36）。
- ⑥ 野猪肉上市，肉价下跌 —— **错误**。野味价格按“野生存量稀缺度”计算，猎得越多价越高（wildlife.mjs:183-194），与“肉上市、供给增加、价格下降”方向相反。

### E08 昏迷者能不能施治疗术★【连锁】
情境构造：榆坡村没有未成年人，改用赵枫做目标，把他设为“昏迷”（实测 e08.mjs）。治疗术用抚伤掌（spell_s3_mend_palm，consent 类别为 healing）。
- ① 昏迷不能视为同意 —— **合理**。实测：personSpellConsent 返回 refuse，理由“本人当前无法明确表达同意”；不带同意时 assertSpellConsent 报错（magic-consent.mjs:23-26,74）。
- ② 未成年由监护人代为同意；叔叔无效，除非有紧急条款 —— **部分**。叔叔同意无效，这一点对：同意只能由本人给出（magic-consent.mjs:31）。未满 18 岁一律拒绝（:74），但监护人代为同意也不支持。紧急条款只覆盖“濒死”，不覆盖“昏迷”（rules.law.emergencyHealing.statuses=["濒死"]）；实测濒死时 emergencyHealing=true。
- ③ 强行施法构成违法，家属可以起诉 —— **合理**。实测：force 能通过施法检查，但会按本地法典 law_yp_property 立 unconsented_magic 案，状态“未报案”（magic-consent.mjs:56-64）。
- ④ 在场医师用常规医术施救不受限制 —— **缺失**。目前只有魔法的 care 操作，而且同样要求同意（magic-care.mjs:334）；没有非魔法的诊疗。日常诊疗 RW-06 在做。
- ⑤ 救活后好感上升并沿亲属传播 —— **部分**。“亲友受惠”的传导底座存在（standing.mjs:84-90），但施治疗术不会调用它，magic-care 和 magic 中都没有 adjustStanding。

### E09 催熟术冲击粮市【主动】
情境构造：可以用生长类生活魔法加榆坡等村的管理田代替。本事件按代码判断。
- ① 未登记就公开教授按法典处理，登记后才可授课 —— **缺失**。spell-research 的“登记”只是把研究成果写进目录（spell-research.mjs:6）。法规只管施法收费、执照和次数上限（magic-economy.mjs:13-14），不管授课。
- ② 学会人数受资质和识字率限制，书只在识字的人里传播 —— **合理**。读技能书要求识字熟练度（learning.mjs:86；works.mjs:40）；NPC 的书本教育同样有识字门槛（education-state.mjs:73），学生熟练度还受“老师余量”限制（:61）。
- ③ 粮食供给上升，粮价下跌，种粮户收入下降 —— **部分**。只有玩家本人施法会写入村账并压低价格，而且有上限（magic-economy.mjs:1-14,38）。NPC 学会法术后不会去施法，所以“邻村产量大增”传不开；农户收入没有建模。
- ④ 粮商商会好感下降并传给成员 —— **部分**。有“竞争者立场下降、投诉、舆论”的机制（magic-economy.mjs:10-12,46-47），但商会作为整体对玩家的立场、以及传给成员这一步没有核实到。
- ⑤ 产量加成有上限，受地力和天气约束 —— **合理**。每批有累计加成上限 maximumBonusPermille（≤20%），同时消耗水分和养分，低温停止生长（magic-growth.mjs:106-107,129-137）。

### E10 跨政体婚姻的分产★【离屏→连锁】
情境构造：有王国和赭牙部盟的继承规则（rules.law.family.rules：royal 为配偶优先，orc 为子女均分），但没有现成的“跨政体婚姻 + 布庄股份”人物。本事件按代码判断。
- ① 适用法典由财产所在地、婚姻缔结地等规则决定 —— **部分**。按“死者文化 → 户籍所在地法典 → 政体”的顺序决定，不能由某一方说了算，这点符合（family-inheritance.mjs:9-13）。但不看财产所在地和婚姻缔结地；家族争议审理也只按已登记的分产恢复产权，不会在两套法典之间裁决（family-law.mjs:25-41）。
- ② 诉讼期间股份冻结，分红暂存 —— **缺失**。股份在死亡当刻就按继承人均分并另立记录，持股总和保持不变，所以“股份凭空消失”的易错项没有出现（family-inheritance.mjs:71-74）。但没有冻结；分红继续按月发给继承人（finance-assets.mjs:239）。
- ③ 幼女监护人默认是莎尔 —— **合理**。监护人候选中“父母优先”（family-inheritance.mjs:31）。需注意：只有分得遗产的未成年人才会建立监护记录。
- ④ 败诉方可以上诉，二审期间不执行原判 —— **部分**。家族民事案可以上诉（law.mjs:388-392），但一审判决当场恢复产权，上诉不会暂停执行；而且家族案上诉一律记为 upheld:true。
- ⑤ 判决影响部盟对王国的立场 —— **缺失**。家族判决没有任何势力层面的立场后果；联姻的立场只在成婚时调整一次（family-diplomacy.mjs:15-20）。

## 建议修复（按影响排序）

1. 遗产先还债再分配：死者的债务（包括欠玩家的、欠雇工的）要先从遗产里清偿，余额再分给继承人；不要对死者另立违约案。涉及 family-inheritance.mjs、finance-bank.mjs。建议接到 V2 死亡提交（recordEntityDeath）这个底座。
2. 租金跟着建筑状态走：建筑 condition≤0 或停用时停收租金，并按毁损条款终止或暂停租约。涉及 finance-assets.mjs（rentDue）。建议接到 facility-state 的 facilityView 底座。
3. 任命人被免职后，被任命者默认留任：管事的有效性不再依赖“授权人仍在任”，改为由继任者撤换。涉及 entity-view.mjs:67-72。建议接到 governance_office 和 entity-transition 底座。
4. 野味价格要算市场供给：卖进市场的肉应压低价格，不能只按野生存量稀缺度涨价。涉及 wildlife.mjs、shop.mjs。建议接到 settlement-trade 的价格底座。
5. 盗采要有法可依：给矿点所在地挂法典，补上 illegal_mining 和“收买赃物”罪名；NPC 犯罪也要能盗采并扣储量。涉及 law-codes.mjs、npc-crime.mjs、extraction.mjs。建议接到 registerIncident 和 mineral 记录底座。
6. 头人死亡后要有代理或补选：现在死亡后头人一直是 null。涉及 entity-view.mjs（settlementGovernment）、elections.mjs。建议接到 U13 和 elections 底座。
7. 监护人死亡后按族谱顺位改指定，不要只留“待指定”。涉及 family-inheritance.mjs:97-104。建议接到 family-state 的族谱底座。
8. 雇主死亡后，雇佣合同按“遗产承接，或官府封存并累计欠薪”处理，而不是立即全部终止。涉及 npc-life.mjs:392-399、labor-market.mjs。建议接到 V2 死亡与 labor-market 底座。
9. 火灾补齐后果：起火源接上 NPC 日程（炉火未熄）；按风向蔓延；毁损带走建筑内存货；补失火罪；实现 repairFaithFacility。涉及 facilities.mjs、faith.mjs、law-codes.mjs。建议接到 facility-state 和 K2 interaction 底座。
10. 首领领地挤压野生动物，并与农田害兽联动；击杀首领计入名声。涉及 bosses.mjs、wildlife-migration.mjs、farm-pests.mjs、reputation.mjs、notables.mjs。建议接到 bossEcology 和 wildlife 迁徙底座。
11. 继承诉讼期间冻结股份和分红；上诉期间暂停执行；适用法按财产所在地和婚姻地选择；判决产生势力立场后果。涉及 family-law.mjs、finance-assets.mjs、law.mjs、family-diplomacy.mjs。建议接到 law 程序和 standing 底座。
12. 未成年人施法同意改由监护人代为作出；紧急救治条款按法典决定是否覆盖“昏迷”；治疗后调用“亲友受惠”立场。涉及 magic-consent.mjs、rules.law.emergencyHealing。建议接到 guardianship 和 standing 底座。
13. 托运货损和索赔；护卫费按实际天数累计。涉及 transport.mjs。建议接到 weather 和 contracts 底座。
14. 升格设施条件按设施种类核对（集市、驿站）；升格 effects 覆盖管事的名称。涉及 promotion.mjs、rules.governance.promotion。建议接到 U13 底座。
15. 教授未登记的法术也要受法典约束；NPC 学会生活魔法后也会施法，把影响传到邻村产量和价格。涉及 spell-research.mjs、magic-economy.mjs、education-state.mjs。建议接到 magicEconomy 底座。
16. 水质、污染、流域上下游（林水有限供给 RW-04 在做），以及村对村的环境立场。涉及 environment.mjs、seasonal-hazards.mjs。建议接到 RW-04 林水底座。
