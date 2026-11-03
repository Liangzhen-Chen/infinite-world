# S2c 收口拆卡草案（供主会话审计后派工）

日期：2026-10-18。分析工作区：F:/dnd-wt/S2C，分支 s2c。只写本文件，不改代码、PLAN/PROGRESS/CHANGELOG，不做 Git 写操作，不启动子代理。

## 结论与依据

S2c 仍未完成。当前字面统计 118；按职责互斥分类为 **A 35 / B 80 / C 3**。A 是承接/变更责任模块，包含已接协议但仍需核对旁路的入口，以及两个必须冻结的历史兼容执行器，**不是“35 个未迁移模块”**。按每个模块最高相关责任分类，A 中的读取/文案也要分别处理；B 表示当前死亡命中是查询或由查询驱动的业务处理，并非整个模块只读。

实际运行：带 TEMP/TMP=F:/dnd-tmp 的 `node tools/death-keyword-modules.mjs`，before=118、after=118、targetMet=false；未用 --capture。其余是源文件、原题与现有日志只读分析。本轮没有重新运行行为测试；复用 sol-002 报告中的 40%/80%/16.7%/40%/40%，不把已有测试的运行声明当成本轮通过证据。

依据：
- `docs/架构设计/10-现状映射与迁移路线.md:98`：五类转移全走协议；五题各 ≥80%；死亡模块个位；船沉载货不悬空；:150 另保留 scale 预算。
- `docs/架构设计/04-转移协议.md:9–19, 23–64, 83–112, 124, 137–146, 176`：实体 gone 与单条持有变更分开；在途/失能不是 gone；遗产可做雇主；叛离、爵位争议、实际控制分层。
- `docs/PLAN.md:171`、`docs/PROGRESS.md:444`；两轮 `F:/dnd/logs/sessions/S2C-sol-001.final.txt`、`S2C-sol-002.final.txt`；原题 `docs/probes/run-001/events.md`。
- 指南 D 为 M0–M8 旧里程碑，无 S2 专节，故此规划完成标准用用户明确指定的架构第10章，不伪造 D 部分 S2 条文。goal 已记录本轮仅交付规划。

原 run-001r 按题不是求平均：E02/E03/E11/E14 各至少 4/5，E06 至少 5/6。本计划把全部已定位失分条目交付到卡，不能挑容易条目到门槛便跳过“全部走协议”和合同收口。

## 一、指标口径与查询约定

当前脚本正则是 `/死亡|\b(?:dead|died|deceased|killed)\b/i`，扫描所有 server-plugin/**/*.mjs 的原始文本。它有三类确定偏差：
1. 把错误消息、注释、deceased 字段和 storage 的补丁存活变量 dead 算作死亡分支。
2. 把明确按 engineRevision=1 分派的历史规则执行器与现行规则混算；改旧执行器会改变旧存档重放。
3. 不匹配大量 `death` 标识符、`毁损`、`免职` 或直接写 condition=0。facilities.mjs 恰好不在 118 内，却有真实毁损旁路。因此“118→个位”既不是完整写入审计，也不证明五类转移完成。

建议主会话批准**同一工具双列报告**，不覆盖旧基线：
- `rawLiteral`：原口径、原118基线、完整路径保留，便于与历史可比。
- `activeSemantic`：现行规则中直接解释/写入生命终止状态或依死亡做专门交接的模块；排除注释、纯显示字符串/字段键、与生命周期无关的 dead 变量；历史兼容文件单列 legacy。不能按“引了 transition”就排除，也不能为降数把所有 A 模块白名单化。
- B 的直接状态读取迁入查询后，语义指标才实际下降；A 的交接决策迁入协议/声明后才计为已收敛。起因层可以调用协议（例如战斗致死、毁损），不应被迫改名掩藏。
- 自动扫描对不认识的语法保留候选，不静默排除；复用现有工具的扫描能力、输出命中行，不建一份手工白名单再写校验器证明白名单正确。核心验收仍是实际转移与对账。不同领域的原始字面计数不是可直接相减的 A/B/C 分数。
- 这是为贯彻第04章“各包声明、不各写交接代码”的**建议修订**，并不等于原“死亡关键词个位”已经通过。未经主会话采纳/记录口径修订，原118门槛继续报失败；本报告不擅改设计文档。

K1 先提供一个纯读取的生命周期查询接点（可复用/扩展现有 identity/transition 读接口；如需独立文件，建议 lifecycle-state.mjs），K5 不自行设计：
- 读取 holdings.protocol.entities、当前实体代次和恢复事实；旧文档没有协议事实才集中兼容旧 status/diedAt。现有 entity-view.living 只混读旧 status 与 state.records 的 transition 镜像，不足以作为统一接口。
- **法律 gone 与生理死亡分开**：宣告死亡不改活人的身体。权限/产权读 legal gone 或 effective；活体目标/尸体奖励读生理死亡。不可全局把 `status!=='死亡'` 替成同一个 `!isGone()`。
- 保留原 missing actor 行为，以及 hp、濒死、昏迷、患病、睡眠、在途、拘押和 consent 判断。协议 tombstone 恢复后不应继续判 gone；失能和远行不能撤销产权。
- npc-decision 等主观视图消费者只读其已获准的 self 投影，不能为调用新查询偷读真相。
- 兼容镜像仍写给现有消费者，但交接选择只有协议一份；持有变化须调用 changeHolding/changeLegacyHoldings，holdingSet 仅双写并不等于执行转移协议。

## 二、118 模块逐一分类

以下路径均相对 server-plugin/，后缀为 .mjs；行号为分析时定位点。负责人 K1–K5 对应末节。A 中已经正确通过的行为复用现有实现，不要求重写。

### A：35 个承接/状态变更责任模块

| 模块 | 证据与具体改法 | 卡 |
|---|---|---|
| activities.mjs | combat:140/153 已经经 recordEntityDeath；保留战斗起因/掉落回执，死亡只调用一次；NPC 决斗共用此伤害结算。 | K1 |
| advance-registry.mjs | 日结:241 直接扣人口，:309 清理失效许可；实名个体及许可关闭走协议，匿名人口只扣存量，不能把一个饥荒损失误作整个种群 gone。 | K1 |
| bosses.mjs | defeatBoss:66、advanceBosses:90 清空巢穴 occupant；占据关系关闭/承接走持有协议，空巢冷却与再入住继续读事实。 | K1 |
| bounty.mjs | advance 中 :184 因玩家死亡中止拘押；捕获/释放等持有开关统一经协议，查询的濒死限制仍保留。 | K3 |
| business.mjs | endShop:52 / business_close、business_bankrupt；operates/leases 终止及清算走声明，退款和未履行货款不能在死亡回调再执行一次。 | K1 |
| compat/v2-phase1-activities.mjs | combat:15 直接写 NPC 死亡；这是 engineRevision=1 的历史规则执行器，冻结保留，不把它改成当前协议以免改变旧事件重放。 | K1 |
| compat/v2-phase1-engine.mjs | death:207 与旧 revive 直接写状态；同上冻结。当前引擎 engine:191/241 明确按 engineRevision 分派，不能声称无消费者而删除。 | K1 |
| contracts.mjs | advanceContracts:116–129 到期退租、经营结束、取消待履约；持有关闭走 changeHolding，精神强制失效读查询，状态按条款/终止事实派生。 | K1 |
| education.mjs | school_close:158 直接到期雇佣；课程停止为事实，教师 employed_by 的解除走协议，课时/工资已发生部分保留。 | K1 |
| engine.mjs | death:644–647 玩家仍直接写死亡、XP；由安装的协议接点落 gone，保留一次性经验损失，不在 L0 再引玩法包。 | K1 |
| faith.mjs | member:77、convertFaith:83 删除旧成员/改宗；经 member_of/devotee_of 变更及钩子；不是只换 capable 判断。 | K3 |
| family-inheritance.mjs | settleFamilyEstate:52–103 自行分账/产权/职位、advanceGuardianships:108 自行结束监护；规则选择保留，执行移到协议阶段，旧回执只投影。 | K1 |
| family-law.mjs | adjudicateFamilyDispute:31 恢复死亡分产产权；判决驱动 owns/guardian_of 的协议变更，保留证据、法庭权限和赔偿账，不把正文“死亡”删除了事。 | K1 |
| family-politics.mjs | 收养/托养:75 直接结束原 guardianship；旧 guardian_of 关闭与新照护持有同事务变更，仍保留成年、真实同意和财产边界。 | K1 |
| finance-assets.mjs | dismiss:215 已接 changeLegacyHoldings；余下租约到期/退租、股份全额转让和雇佣终止补齐，leaseState 已有实现复用。 | K1 |
| governance.mjs | review:370 已关闭 holds_office 后写免职；补齐所有来源和替任开关，以及真实空缺后代理/补选消费者。 | K2 |
| high-nobility.mjs | appoint:61、reviewUpperOffice:66 已接适配；核对远方/作者职位开户及旧职关闭，职位存在时不能空跑协议。 | K2 |
| labor-market.mjs | sign 换工、advanceLaborMarket:275 到期、用工终止写旧合同；协议关闭 employed_by，遗产续营保留工资累计与到期欠薪。 | K1 |
| law.mjs | custodyInterrupted:184、advanceLaw:189 因死亡/离开解除羁押；按 death/escaped/expired 分流，刑罚余额不能因离场注销。 | K3 |
| magic.mjs | damage:145 已接 recordEntityDeath，:156 取残骸；保留致死与掉落顺序，验证玩家与 NPC 同协议且不重复奖励。 | K1 |
| magic-air.mjs | 坠落伤害:280 已调 recordEntityDeath，但该函数拒绝 player；玩家/生物致死统一到协议分派，不能只保留 NPC 路径。 | K1 |
| magic-care.mjs | advance 伤重:254 走 recordEntityDeath；确认玩家走 health/death 接点，清理重复终止，能力判断改查询。 | K1 |
| military.mjs | releaseLevy:242/loseSoldiers:264、dismiss:472；实名阵亡已间接走协议，退伍/解散的 commands/employed_by 必须走持有协议，匿名损失仍是数量账。 | K2 |
| nation-founding.mjs | collapse:87/advanceNations:126，:141–144 敌对即自动写 territory；改真实叛离、争议封地及裁决后的 governs 转移。 | K2 |
| npc-life.mjs | recordEntityDeath:380 已包协议，recordLegacyEntityDeath:391 仍终止合同/分遗产/宠物/同伴；删除交接决策旁路，健康起因和历史回执保留；迁居/婚姻终止也用持有变更。 | K1 |
| organizations.mjs | execute:98 除名/改任、advanceOrganizations:233 欠费除名仍直接 save；org_leave:307 已接协议；全部退出/旧职位关闭统一，再补争位与出走反应。 | K4 |
| pets.mjs | detach:53、饥病/出走:86/90、主动 release:167；死亡已调协议但又 detach，改一次性关闭 tamed_by/companion，保留动物位置与生理状态。 | K1 |
| revival.mjs | revivePlayer:39–56 直接恢复玩家状态地点；使用 restoreTransition，清墓碑/代次与尸体承接，不以 status=正常掩盖 gone。 | K1 |
| titles.mjs | yearEnd:142 已接除爵；补全授爵/主动除爵及旧持有来源，法定爵位与争议控制分开。 | K2 |
| transition.mjs | 协议责任层，保留集中生命字面值；统一旧/canonical 债权程序、两端声明、阶段分配与兼容镜像，不用 legacy 回调先处分后交接。 | K1 |
| transport.mjs | destroyTransportAsset:239 已接 destruction，船沉账/载货/残骸证据有效；保留并验证新协议不回归，不重写运输。 | K1 |
| war-diplomacy.mjs | 战损经 loseSoldiers/releaseLevy；战争/外交 territory 变更须经 governs 及征服条款，保留战争结算和军费守恒。 | K2 |
| wildlife.mjs | recordWildlifeDeath:185 投影协议残骸，wildlifeAction:243 改尸体状态；保留取材唯一性、实例代次与数量账，残骸耗尽的实体终止走协议。 | K1 |
| wildlife-awakening.mjs | awaken:37–46 直接解除 owner/pet 并转 companion；tamed_by 关闭与自愿 companion 开立走持有协议，觉醒本身不是死亡。 | K1 |
| wildlife-society.mjs | spiritAction 的 leave:190–198 直接删成员/归属并将空组织置已散；member_of 关闭与末员离开 dissolution 走协议；follow/stay/settle 保留结缘、只处理实际同行关系。 | K4 |

### B：80 个查询/查询派生模块

每行的死亡读取改用上述适合语境的查询；事件文案和数据字段保持可读。表中另列的功能改动由领域卡负责，不交给机械替换执行者。

| 模块 | 当前读取与保留边界 | 卡 |
|---|---|---|
| action-text.mjs | 81 状态事件文案保留；114 场景人物筛选改存活查询。 | K5 |
| agriculture.mjs | 25 劳力 awake；保留濒死、睡眠、昏迷约束。 | K3 |
| boss-cognition.mjs | 8 living；保留 hp>0。 | K5 |
| boss-migration.mjs | 32/44 初始化巢穴；查询历史生理死亡，不重放一次死亡。 | K5 |
| career-metrics.mjs | 57 前后死亡比较改协议事件/生命代次；137 在世职业人数。 | K5 |
| checks.mjs | 17 清醒行动门槛；死亡与濒死分别判断。 | K5 |
| civic.mjs | 14 在场办事能力。 | K5 |
| credit.mjs | 30 借贷当事人清醒状态。 | K1 |
| dialogue.mjs | 16 交谈可及性与能力。 | K5 |
| duels.mjs | 5 awake 只读；NPC 双方战斗是 K4 新功能，不能归给机械替换卡。 | K4 |
| education-state.mjs | 66/130 学龄和在世居民统计。 | K1 |
| effects.mjs | 105 效果 carriers 在世筛选；保留效果消费语义。 | K5 |
| elections.mjs | 18 选举参与者能力；职位继任功能归 K2。 | K2 |
| employment-state.mjs | 30 到岗资格；保留照护/征役/同行限制。 | K1 |
| entity-view.mjs | 26 living 混旧状态与 transition 记录；314/397/427 人口、服务视图统一查询。 | K1 |
| environment.mjs | 70 环境所有者履约资格。 | K3 |
| family-state.mjs | 5 familyLiving 与50家族死亡史；区分当前存活和已知历史，不能清除族谱历史。 | K1 |
| farm-pests.mjs | 5 在世动物筛选及 hp。 | K5 |
| festival.mjs | 12 节庆参与能力。 | K5 |
| finance-bank.mjs | 243 还款人行动能力；已坏账过滤保留，遗产执行人不按死人判断。 | K1 |
| forest-water.mjs | 23 当前栖地实名动物数。 | K5 |
| hidden-passives.mjs | 33/91/96 宠物健康、见证与蜂类在场；保留健康及同意条件。 | K5 |
| holding-sources.mjs | 协议投影/旧源适配；715–750 遗产、监护注释和 deceased 字段本身非旁路。读取协议、历史回执派生，不能把 estate 提前标 closed。 | K1 |
| law-codes.mjs | 22 执法者存活/有效；生命与职位效力分开。 | K3 |
| learning.mjs | 72 导师在世；提示文字保留。 | K5 |
| legal-representation.mjs | 10 讼师资格；保留成年、拘押及濒死限制。 | K5 |
| lies.mjs | 19 交流能力。 | K5 |
| local-exams.mjs | 8 考官/考生能力。 | K5 |
| location-access.mjs | 34/73/97 私宅、环境、锚点授权；必须保留成年、真实在场和同意。 | K5 |
| magic-area.mjs | 12/28 区域法术活体目标。 | K5 |
| magic-consent.mjs | 67 见证者、76 同意能力；不能把未知当同意或只用合法身份替代清醒。 | K5 |
| magic-context.mjs | 22 视觉条件；保留无视觉、闭眼、昏迷。 | K5 |
| magic-economy.mjs | 203/209 当前在世邻居。 | K5 |
| magic-growth.mjs | 50 田主履约能力。 | K5 |
| magic-light.mjs | 32 授权人、290 感知者；光源事实不受替换影响。 | K5 |
| magic-message.mjs | 16 清醒收信条件。 | K5 |
| magic-mind-space.mjs | 67/303/307/312 精神目标、状态效果存续；原到期副作用继续，死亡判断改生理查询。 | K5 |
| magic-movement.mjs | 89 同行者能力和实际位置。 | K5 |
| magic-object.mjs | 152 所有者、321/418 暖掌活体；炉火供能已有实际函数可供 K3 复用。 | K3 |
| magic-ritual.mjs | 35 主持能力、311 在场灵体；rested/reborn 与 death 不混同。 | K5 |
| magic-water-earth.mjs | 38 授权、79/208 活体约束。 | K5 |
| manufacturing.mjs | 74 工作台收费人能力。 | K5 |
| medicine-state.mjs | 30 医者可用；患病仍不能提供服务。 | K5 |
| medicine.mjs | 26/34 诊疗者能力、预约。 | K5 |
| monster-society.mjs | 25 awake；保留 hp、旅行与睡眠条件。 | K5 |
| noble-state.mjs | 14/40/82 在世贵族与权限；使用生命查询及有效持有。 | K2 |
| notables.mjs | 20/69 举荐者资格。 | K5 |
| npc-autonomy.mjs | 33/49/72 决策/工作/收费能力；不得扩大可行动集合。 | K5 |
| npc-cognition.mjs | 18/130 认知行动与携信中断。 | K5 |
| npc-crime.mjs | 23 作案/见证能力。 | K5 |
| npc-decision.mjs | 20 基于 view.self 的能力；只能读已准许的主观视图，禁止加读世界真相。 | K5 |
| npc-growth.mjs | 13 unable；疾病/昏迷等限制保留。 | K5 |
| npc-intelligence.mjs | 172 可模拟且有能力的人。 | K5 |
| npc-memory.mjs | 18/44 记忆接收者在世；历史记忆不删除。 | K5 |
| npc-obligations.mjs | 16 约定参与能力；工资/可替代义务不能因失能一律取消。 | K1 |
| npc-rumors.mjs | 5 接受传闻能力；查询不扩张知情集合。 | K5 |
| npc-schedule.mjs | 48/116 日程能力；K3 接收工火源，死亡日程冻结由 K1 协议负责。 | K3 |
| office-salary.mjs | 33 俸禄排除已故；再读职能有效性，停发时点保持。 | K2 |
| organization-state.mjs | 14 在世成员派生；旧掌门失去权能不等于全组织消失。 | K4 |
| post.mjs | 48 收件人清醒与在场。 | K5 |
| professions.mjs | 31 认证导师资格；死人不授证，既有认证不因授证人死亡失效。 | K5 |
| progression.mjs | 48 击杀凭据；使用生理死亡/协议回执与代次，宣告死亡不能领取战果。 | K5 |
| promotion.mjs | 20/119 申报者在世；设施缺口是另一项真实功能，归 K2。 | K2 |
| public-opinion.mjs | 16 在世传播受众。 | K5 |
| public-projects.mjs | 30/158 劳力、214 管事故去退申请；保留该业务退回结果，触发条件改查询。 | K3 |
| quest-board.mjs | 19/157 委托人能力；委托变更仍按条款处理。 | K5 |
| quest-sources.mjs | 235 委托候选在世。 | K5 |
| quest-wildlife.mjs | 19 death/expelled/ferried 三种验收；只替换 death 分支为生理死亡与回执，驱离/超度不折算为死亡。 | K5 |
| reputation.mjs | 7 名声传播受众。 | K5 |
| return-summary.mjs | 137 返场可接触人物；历史事件照常保留。 | K5 |
| scene-card.mjs | 118/150 可见活体；不把未知死亡泄露给玩家。 | K5 |
| seasonal-migration.mjs | 6/35 旅途中活体判断；迁徙是位置/在途，不能调用 gone。 | K5 |
| shop.mjs | 182 店主能否补货；报价真实库存见 K3。 | K3 |
| sites.mjs | 60/228/374 据点活体、建造者和权限；保留所有权与当面同意。 | K5 |
| smuggling.mjs | 15 交易者能力。 | K5 |
| training.mjs | 13 训练能力。 | K5 |
| traits.mjs | 57 dead 标签是公开词汇；标签派生读生理状态，不能为降数删标签。 | K5 |
| tribal-awakening.mjs | 45/46/143 在世首领与NPC；dead集合为已故首领，非新增生命写入。 | K5 |
| wildlife-migration.mjs | 18 已有在世个体数量；保留匿名数量迁移。 | K5 |
| world-events.mjs | 13 awake 见证/传播过滤；事件文本死亡合法，不能删词或丢事件。 | K5 |

### C：3 个仅文本/非生命周期命中模块

| 模块 | 依据 | 处理 |
|---|---|---|
| extraction.mjs | :11 注释“钓到的鱼是死亡转化的产物”，写的是数量账与消耗，不是命名实体死亡处理 | 注释保留，语义统计排除；钓鱼的数量守恒照旧 |
| index.mjs | :141 提示“生命变化只能由交锋、治疗或死亡结算产生” | 保留路由安全拒绝和中文文案，语义统计排除 |
| storage.mjs | :119–158 deadPatchValues/dead 指被后续补丁覆盖、无须复制的值 | 完全不改优化代码，排除词义误报 |

注意：holding-sources 虽然字面命中主要来自注释/deceased 字段，但模块确实读取协议事实派生持有，归 B 并由 K1 负责；不能借 C 排除它的遗产阶段缺陷。family-law 的命中文字是文案，但它实际写回死亡分产产权，按责任优先归 A。

### 不在118内、仍必须接入的实际责任点

- facilities.mjs 的 damageFacility / advanceFacilities：灾害与磨损归零均直接写 condition，属于 A 实际遗漏，归 K3。
- 当前 S2c 必须覆盖的单条持有变更并不限“死亡”：npc-life 的迁居/婚姻、education 的停课解雇、组织退会/改宗、宠物出走、军队解散，均已归相关 A 卡；普通旅行、季节迁徙不能一概 gone。
- business.mjs/contracts.mjs 使用的合同辅助函数，以及 `obligation-kinds.mjs`、`contract-state.mjs`、`holdings.mjs/holding-kinds.mjs` 与词汇/schema 是必要接点，由 K1 唯一维护；不靠关键词表决定是否纳入。
- PR-02 不能只以 asset_lease 成功代表全合同完成：沿 contracts/business/finance-assets/labor-market/education 的实际签约与到期调用链，补签订条款快照与终止/到期派生；S3 的全金融日程/累计重构不在本卡。

## 三、五题失分定位与具体交付

分数取 sol-002 最终报告与原评分函数，本轮不重跑耗时 E02。条目文字、编号、分母和“部分不算合理”不变。下表也指出已经“合理”的弱断言，避免修好协议却保留假阳性验收。

### E02 镇长暴毙：2/5=40%，失分 1、2、4

原题 events.md:12–17；测试 tests/probes/run-001/e02.mjs。

| 条目 | 当前证据/缺口 | 应改模块、函数与验收 |
|---|---|---|
| E02-1 代理/补选+当日停薪（部分） | 35天后主官仍空；协议 action(vacate) 只发 succession，未有替任消费者。原 check:30 只要 gov35 就 ok，即使 stopped=false 也放过 | K2：governance.advanceOffices/review、elections.electionAction、office-salary 与现有 succession 事件；读职位/当地规则，副职代理或按规则发补选并完成。K1保留权能先关闭。测试必须同时断言有合法代理/继任、死后无俸禄、旧主官无公库权限 |
| E02-2 酒坊继承/无继承人封存/工资（部分） | npc-life:414–423 直接终止 contracts 再 settleFamilyEstate；协议可承接 employed_by，但 legacy 先关合同。原题夹具没有明确创建酒坊+4雇工；check 的 properties.length>=0 恒真，accruing+codeHas 也不证明发薪 | K1：recordLegacyEntityDeath、settleFamilyEstate、transition.action/advanceProcedure/distribute、finance-assets.advanceFinanceAssets、labor-market.settleEmploymentPay/advanceLaborMarket、business.endShop/contracts.advanceContracts。真实创建可继承酒坊、4份工资合同、充足/不足资产与无继承人对照；遗产先持有并续营/封存，工资条款和到期欠薪保留，无钱不能伪造工资入账 |
| E02-4 亲属监护（部分） | transition.action:125–134 已实现候补与双写，但 e02:15 直接写旧 guardianship，held 集合里没有它；advanceGuardianships 随后只置待指定 | K1：holding-sources 的 guardianship 适配/载入入口、family-inheritance.guardianCandidates/advanceGuardianships；夹具经正式创建或现有 syncHoldingRecord 同步后再死亡。另保留一项真实旧文档载入兼容测试，不能靠每次 gone 全表重建掩盖写入遗漏；有候补按父母/亲属/同户，没候补待指定，不把财产权给监护人 |

E02-3 借据已先还 3300/3300、E02-5 日程中止通过，必须保留。新协议需验证旧 records 与 canonical obligations 同笔债不重复清偿，非 accelerate 路线、债权人消失、存款/质押、已有违约案闭合；同序不足额按比例且余数确定，未成年人不背超额债。协议不可在分配之前由旧回调把全部钱给继承人。测试按实际已发生工时与原约定计薪，不能给没有到岗的工人凭空累计工时。

### E03 升镇再罢免：4/5=80%，失分 3

原题 events.md:19–23；测试 e03.mjs。

E03-3：promotionConditions:47–58 只数 created 中 purpose=公共设施，凉亭+水井就满足2/2；没有验证集市/驿站类型、建成状态和实际可用。K2 修改 promotionConditions/decide 与原 promotion 配置的 requires，读 facilityView/allFacilities；具体要求由已有规则数据表达。验收：两座无关设施不能通过；集市/驿站施工中、毁损停用各不能通过；两者完工可用且其他条件满足才通过。相关 notables-promotion 测试按原题加强，不靠报错字符串含“集市”判合理。

E03-1/2/4/5 保留。原脚本直接注入官职/升镇/已免职，仅验证派生视图，不证明真实任免协议。改为合法任命、升格议决、罢免入口；断言任命名额、俸禄/预算、税基和税率、旧主官实际支款/任免被拒、原管事留任而不是仅查数组为空。K2 负责 e03 夹具与判断，K1 提供协议。

### E06 夏夜铁铺火：1/6=16.7%，失分 1、2、4、5、6

原题 events.md:39–44；测试 e06.mjs。当前夹具把铁铺 burning=true、另一磨坊 condition=0，未真正构成“铁铺→载粮粮仓→寺庙”连锁。

| 条目 | 根因与责任函数 | 必须出现的行为证据 |
|---|---|---|
| E06-1 风向/间距（部分） | facilities.advanceFacilityFire:70–73 把 windVector 只转成速度，distance 后取最近2座，无方向性；测试只扫“风向”字样 | K3 使用真实风向/建筑相对位置与材料交互，等距离上风/下风、远近、雨水熄灭对照。没有方位数据不得瞎编方向，夹具明确位置，作者场景数据补在 world/ |
| E06-2 存粮损失与涨价（缺失） | damageFacility 只写 condition；regionalTradePrice(settlement-trade:77/88) 已读 granaryAccount/batches，但火灾没扣实际批次。原 check 固定 partial/missing，永不 reasonable | K3 将建筑所容粮批次/账户与实际仓储关联，损失进 sink:destroy，保留种粮/在途/别仓；用现有价格计算重算确有供应影响的报价，保留原已承诺价格快照。对照火前/火后粮量、资源总量、报价及补货后恢复；不能为个人粮仓虚加全镇粮价buff |
| E06-4 香火/募捐修缮（缺失） | faith.use:144 repairFaithFacility 未安装；香火未受设施停用影响；现有 pay/spend/donate 是真实钱粮入口 | K3 把修缮接 completeFacilityProject/实际工期材料，按损毁影响开放容量和实际供献行为；募捐逐笔从捐献人账户支付，费用只扣一次，修复后恢复。不能凭空给寺观生成“香火收入”，也不能以 condition 关键词存在算通过 |
| E06-5 失火责任与赔偿（缺失） | facilities 火源没有行为人/疏失证据；law.registerIncident/adjudicateLegalCase 可复用；现有法典没 negligent_fire。原夹具没有过失源，因此不能无条件给铁匠定罪 | K3 火源保存负责人、离岗时炉火事实、传播损害；在允许追诉的法域经既有证据/法庭程序立案并赔偿邻舍。增加无过失/无证据对照，不“任何火灾自动定罪”。法典/事件词汇改 world 正式来源，schema必要项交K1 |
| E06-6 收工后无人看炉（部分） | 当前场景直接点燃；magic-object 已有炉料/能量与工作台函数，npc-schedule 有收工位置；两者未引发设施火源 | K3 在实际收工、炉火未熄且无人看管时生成确定性起火候选；读日程而不是玩家所在位置；对照有人值守、已熄火、不同切片推进，不能用 codeHas(/unattended/) 判合理 |

E06-3 已停租，K1 leaseState 保证条款优先、毁损期间0租、恢复后按条款续收、不补收停用期。K3 还必须接 damageFacility 与磨损归零的 destruction；可修损坏与实体真正毁灭分开，真正 gone 的建筑不能简单把 condition 写回100而复用失效持有。重建/恢复沿现有实体代次规则落实。两类都测。船沉已有实现不重做。

### E11 掌门坐化争位：2/5=40%，失分 1、4、5

原题 events.md:72–76；测试 e11.mjs。

| 条目 | 根因 | 责任与验收 |
|---|---|---|
| E11-1 NPC决斗（缺失） | duels.duelAction:26 强制双方包含player；willing:14、finishDuel:53–57 与 activeDuel 都固定 player/opponent；只放开26行仍不能真实结算。首脑死后3日无继任提案 | K4 泛化双方、独立见证、双方同意/规则决定、实力/伤害和胜负；touch不杀、death遵守合法同意与实际伤害。复用战斗结算与K1死亡接点；胜负驱动按组织规则继任，不能仅“请求没报错”算成功 |
| E11-4 败方出走/成员/香火（缺失） | organizations.execute/advanceOrganizations 无争位分裂反应；e11:48 永远 partial/missing | K4 从胜负与各成员对双方立场决定谁留谁走，通过 member_of/职位关闭。失败长老可能留下，并非必走；空组织解散走协议。寺观参与/供献读实际成员，K3提供容量/捐献基础，K4不另造一份香火账 |
| E11-5 支持改变关系（缺失） | npcVote、settle/execute 未把合法支持行为接 standing；当前剧本新首脑也是null；测试只比旧 relationships.player 的JSON | K4 记录提议/投票/公开支持的真实事件，由既有 adjustStanding 处理支持与反对对照、一次性去重；测试用 standing 的当前权威读法，并断言已产生合法继任者；不手工修改旧关系镜像来骗分 |

E11-2 的“合理”目前只比较公库未变和死者仍有100铜，未发生真实 gone；正确遗产结算会把100转入遗产/继承，不能要求死者继续持钱。保留题意：新掌门能在权限内支库、旧掌门不能、私产/遗产不入组织公库、公库守恒。E11-3 保留弟子会籍与职业认证，且夹具应实际授证而不只比较一个可能为空的 professions。e11:20 改为正式死亡入口；测试明确两长老已获章程合法任命、合法支持事件已发生，不忽略前序错误。

### E14 建国与同伴叛变：2/5=40%，失分 3、4、5

原题 events.md:92–96；测试 e14.mjs。

| 条目 | 根因 | 责任与验收 |
|---|---|---|
| E14-3 爵位处分（错误） | extension/tools 缺授爵/除爵操作；nation-founding.advanceNations:141–144 只凭敌对值改territory并删除domains，没玩家裁决 | K2 在现有 titles/high-nobility/nationAction 接授爵与有权除爵；真实叛离以 member_of reason:defected 触发。fief保留争议/claim；君主可裁决法定爵权。第04章普通官职defected会vacate，与贵族封地retain_disputed必须区分，不能一概自动除爵或一概保留全部官职 |
| E14-4 实控与战/和结果（部分） | 当前 territory 同时代替法定归属与实控，collapse/war-diplomacy直接写；原 check:21 只能 partial/missing | K2 区分爵位/封授请求权、实际领地governs/占据和主权；除爵不能凭空抢回对方驻军控制的地。战争/外交有真实结果才转governs及后续税/法域，检验双方结果、公库去向、原兼容territory镜像 |
| E14-5 随从分流（缺失） | advanceNations 没按个人立场处理followers；check:23 永远 partial/missing | K2 对原member_of/employed_by/kin相关人员分别比较 standing(本人,叛离者) 和 standing(本人,原组织)，超过规则阈值者叛离，不把整队移走。测亲叛者/亲原组织/差值不足三组、立场反转、重复事件不重复转移 |

E14-1/2 仅函数/文本正则“通过”，须补真实承认条件、战争拒绝与域内/域外法典对照。原实现“男爵领地建国”替代题面“占废城建国”，不能把替代情境宣称完整题面通过：K2 增加真实合法实际控制的废城夹具，核对政体创建与授爵所需的已有规则，不删除合理的主权/财政前置；仍无法表达的前置需如实报卡内未完成。不要把超出S2的全套战争求解器引入。

### 判分器必须随行为实现修复

E06-2、E11-4、E14-4/5 固定返回部分/缺失，E14 最高仅3/5=60%，不改判分无法满足80%。把这些和其余源码正则换成同题行为证据，不改阈值、分母、题意或用todo跳过。K1负责 e02，K2负责 e03/e14，K3负责 e06，K4负责 e11；外层 s2c-run001r.test.mjs 的≥80%、scriptError断言保留，由K1维护。题面可引用不改写；历史报告/旧baseline保留以显示口径演进。修判分器不是成功证据，真实行为测试先失败再实现。

## 四、五张执行卡与并行安排

所有卡为草案，主会话先独立审计必要性和正确性再派工。规模按实际责任给出，不能把本次数次未完成的 S2c 再标成一张“少量清理”。K1–K4 均为 L；K5 为 M。建议核心卡 gpt-6.1-sol（high），机械卡 gpt-6-luna。每个执行会话仍只领一张卡，不再生子代理。

**文件所有权**：上述118模块表的“卡”是唯一写入者，连该文件里的机械替换也由该负责人一起完成。C三文件默认完全不改。K1维护所有共享协议/词汇/工具路由接点，其他卡提供具体需要的接口、参数和行为用例；主会话确认请求后由K1串行落地。领域卡不各自去改 transition、holding-sources 或 activities。表外文件按下卡归属。

**调度**：
1. K1先交一个可测试的小步骤：生命周期查询语义、现有协议适配接点、可复用的继任/变更事件和旧记录同步契约；不另建通用框架。把接口签名/必填事实放在执行交接中即可。
2. K2（政体）、K3（火灾）、K4（组织）可以在各自文件先并行建场景和实现领域规则；依赖K1接点的分支在其基础步骤交付后接上。受同时最多3个执行会话约束，主会话分批调度。
3. K5在查询接口固定后工作，只改自己拥有的59个B模块和统计工具。领域卡自己完成其余21个B模块。
4. K3独占 faith 和 npc-schedule；K4需要香火接点时调用既有/已交付接口，不同时编辑faith。K3需要新炉火日程接入 advance-registry 时，K1落接点。
5. K2/K4可独立处理各自成员分流，复用现有 standing 和协议原语，不为了两处用例再造分裂框架；确有共同函数才由K1提供最小公共接点。
6. K1最终集成 e02（等待K2代理/补选），K4最终等K3供献/设施接口；所有卡集成后一次完整五题与跨协议验收。依赖未满足不能提前报整卡通过。

### K1 — 协议、遗产与生命周期接点收口

**目标**：消失与持有变更只由协议决定交接；旧回调只做兼容投影。完成E02-2/3/4/5、全部合同签订条款与状态派生、玩家死亡复活、生物/宠物/经营/雇佣实际旧旁路；提供K2–K5所需查询和最小接点。

**文件**：
- 表中K1的32个现有模块（两个compat仅只读保留），重点 transition、npc-life、family-inheritance/family-politics/family-law、engine/activities/revival、business/contracts、finance-assets/finance-bank/labor-market、holding-sources/entity-view。
- 共享独占：holdings.mjs、holding-kinds.mjs、identity.mjs、obligation-kinds.mjs、contract-state.mjs；如确需新纯查询模块 lifecycle-state.mjs。
- world/ontology 的 holdings/obligations/entity-templates 与必要词汇、现有 schema、extension/tools.mjs、world/actions/core.json、动作/架构登记的必要接点统一由K1串行维护；其他卡不得同时改它们。主会话处理PROGRESS/CHANGELOG。
- tests/s2c-transition.test.mjs、s2c-estate.test.mjs、transition-protocol.test.mjs、tests/probes/run-001/e02.mjs、s2c-run001r.test.mjs；新增 tests/s2c-lifecycle-query.test.mjs 与 tests/s2c-contracts.test.mjs（建议名，尚不存在）。

**实现边界**：
- 统一旧records债与canonical义务的去向/去重，公告→申报→清偿→分配；按已声明条款路由全部已支持种类，不能只处理accelerate。保留已实现同庄抵扣、准备金/现金守恒和坏账不重复追诉。
- 遗产持有酒坊、作为雇主；接续雇佣/停业封存按实际条款。旧 owner/worker/party 查询须认执行人及遗产，不把临时法人当死者或不存在的NPC。旧工资合同与条款之间不可重复扣款。
- PR-02 的范围是现有签约与到期消费者，保留旧无clauses记录的明确兼容回退；不做S3全金融模型重写。
- NPC-life里的继承执行、合同终止、宠物/同伴交接移出 legacy 决策；family-inheritance仍可给出继承规则/候补，不能先于协议处分账户。
- 玩家真实gone、restore、再次死亡都检验代次；magic-air调用recordEntityDeath(player)目前返回null，必须补上。保留经验扣除、已有复活点权限与收费语义。
- 不删除两个历史compat模块；用已有重放测试确认隔离。

**验收**：
- 新用例覆盖上节E02、无候补监护、实际旧文档加载、多个债权人/继承人/质押和程序未结、事务失败完整回滚、签约快照不被可变旧字段改写。
- 相关命令（每条都先设置下述TEMP/TMP；分组运行，每组一次）：
  - `node --test --test-isolation=none tests/transition-protocol.test.mjs tests/s2c-transition.test.mjs tests/s2c-estate.test.mjs tests/s2c-lifecycle-query.test.mjs tests/s2c-contracts.test.mjs tests/revival.test.mjs`
  - `node --test --test-isolation=none tests/finance-assets.test.mjs tests/finance-bank.test.mjs tests/labor-market.test.mjs tests/contracts.test.mjs tests/business-contracts.test.mjs tests/npc-life-family.test.mjs tests/family-politics.test.mjs`
  - 生物入口改完跑其现有直接测试（pets、wildlife、bosses、相应magic文件），按实际改到的文件一次，不把整套扔进一个3GB进程。
  - K2接入后 `node --test --test-isolation=none --test-name-pattern=E02 tests/s2c-run001r.test.mjs`。
  - CORE。
- K1最后负责跨卡 holdings/ledger/存档/I31/金快照/scale，见末节，不要求每个局部小步骤重复全套。
**规模 L；模型 gpt-6.1-sol（high）**。

### K2 — 职位补缺、爵位处分与实际控制

**目标**：E02-1合法代理/补选；E03设施条件与真实罢免；E14授爵、叛离、裁决与人员分流走协议，法定爵权和实控不混写。

**文件**：
- 表中K2十模块：governance、high-nobility、titles、nation-founding、military、war-diplomacy、elections、noble-state、promotion、office-salary。
- 必要只读/小改接点 promotion-view.mjs、治理/升格的正式规则来源、当前国家/爵位规则来源；world规则公共聚合文件由K1协调串行修改，不能改 drafts 冒充运行数据。
- tests/probes/run-001/e03.mjs、e14.mjs；新增 tests/s2c-governance.test.mjs；现有 governance-office、governance-titles、high-nobility、nation-founding、notables-promotion 测试。
- E02行为消费者由此卡实现，e02测试文件归K1；提供可直接调用的代理/补选行为用例给K1，不碰其文件。

**具体交付**：消费succession空缺；旧职位与远方作者来源完整开户；爵位/封地/主权/军队效力分别维护；叛离必须真实行为而非立场即领土改变；剥夺爵位不会无战无和就夺回实控；权限合法性、非玩家随从逐人意愿保留。新增授爵/除爵接口请求交K1更新操作枚举/路由/动作目录，不能只有内部函数可调用。

**验收**：
- 上节E02-1、E03、E14全部正反例；还要测试连续两次同一叛离不重复移款、剥夺者权限不足被拒、普通免职不撤其合法任命的人。
- `node --test --test-isolation=none tests/s2c-governance.test.mjs tests/governance-office.test.mjs tests/governance-titles.test.mjs tests/high-nobility.test.mjs tests/nation-founding.test.mjs tests/notables-promotion.test.mjs`
- `node --test --test-isolation=none --test-name-pattern='E03|E14' tests/s2c-run001r.test.mjs`
- CORE。
**规模 L；模型 gpt-6.1-sol（high）**。

### K3 — 火灾、仓储与寺观连锁

**目标**：E06六条有真实场景；建筑灾损/磨损毁灭、改宗/拘押结束等本卡拥有的转移入口接协议。库存损失、停租、赔偿、募捐修缮都落到账与事实。

**文件**：
- 表中K3十模块：faith、law、bounty、law-codes、public-projects、agriculture、shop、magic-object、npc-schedule、environment。
- 表外独占 facilities.mjs、facility-state.mjs、settlement-trade.mjs；如需，faith-catalog/faith-state 及正式寺观/建筑/失火法典数据。明确warehouse与批次容器的关联放入现有运行数据，不能仅在测试放虚拟库存。
- tests/probes/run-001/e06.mjs；新增 tests/s2c-fire.test.mjs；facilities.test.mjs、faith.test.mjs、law.test.mjs 中相关用例。
- stock/ledger、engine/advance-registry 的共享小接点、公共schema及词汇由K1按此卡请求落地。

**具体交付**：风向和材料/间距传播；收工未熄炉的实际起因；毁损调用协议后保存真实仓损；复用regionalTradePrice而非叠加拍脑袋涨价；租金调用K1条款派生；寺观实际供献与容量、修缮工期、钱粮全链路；失火源证据进入既有法律机制。修缮callback不可留“存在即成功”空函数。拘押死亡、逃脱、到期各走对应理由，旧刑罚不能消失。

**验收**：
- E06同一场景把铁铺、确有存粮的粮仓、寺庙串起来，风向/责任/供献用确定性对照；长等待与分段推进等价、每次仓损只发生一次、损失流入sink、租金停止/恢复。
- `node --test --test-isolation=none tests/s2c-fire.test.mjs tests/facilities.test.mjs tests/faith.test.mjs tests/law.test.mjs tests/law-codes.test.mjs tests/ledger-price.test.mjs`
- `node --test --test-isolation=none --test-name-pattern=E06 tests/s2c-run001r.test.mjs`
- 如果修改粮批次写入，运行已有ledger-stock相关用例；不以降低三年守恒断言换通过。
- CORE。
**规模 L；模型 gpt-6.1-sol（high）**。

### K4 — NPC争位、组织更替与离群

**目标**：E11完整真实死亡→双NPC约斗→继任→公库接管→支持/分流；所有组织除名、改任、欠费退出和精怪离群关闭持有，组织公私财产分离。

**文件**：
- organizations.mjs、organization-state.mjs、duels.mjs、wildlife-society.mjs（表中K4四模块）。
- tests/probes/run-001/e11.mjs、现有 organizations.test.mjs；新增 tests/s2c-succession.test.mjs。
- 实力结算复用已有combat/checks和K1 activities接点；如确需抽取共享战斗函数，由K1一次完成，不能再写一套不含装备/技能的简化掷骰。
- faith/香火入口归K3；工具枚举和公共词汇由K1串行接入，K4提供必要参数/路由测试。

**具体交付**：willing/activeDuel/finishDuel都支持明确双方与独立见证，不只删“必须有player”；死亡争位按章程有合法继任流程，公库操作由当前权限派生；支持改变standing，秘密支持不得变成全世界已知；败者与随从是否走按规则逐人决策；野生精怪leave以及末员离散也用同样原语，不直接delete完成退出。

**验收**：
- touch/death强弱对照、NPC拒绝、见证不足、守约击杀与非法杀害区分、死亡结算一次；新旧首脑实际支库正反例；认证/弟子不丢；留/走两种分支、成员和实际供献变化、原组织款项不凭空随人带走。
- `node --test --test-isolation=none tests/s2c-succession.test.mjs tests/organizations.test.mjs tests/wildlife-society.test.mjs`。
- `node --test --test-isolation=none --test-name-pattern=E11 tests/s2c-run001r.test.mjs`
- CORE。
**规模 L；模型 gpt-6.1-sol（high）**。

### K5 — 查询迁移与指标去噪

**目标**：把表中K5的59个B模块直接生命状态判断，机械迁到K1已定查询；保留所有非死亡限制。C三模块不改；调整统计报告仅按主会话已批准口径，原118基线保留。

**文件**：
- 上表B中标K5的60个模块；其他卡拥有的查询文件不碰，不抢修改engine/entity-view/holding-sources/duels等。
- tools/death-keyword-modules.mjs（仅口径批准后）；不改tests/metrics/death-keyword-modules.baseline.json。
- 可在K1已提供的查询测试上提交具体新增用例请求，避免双方同时编辑；本卡新增 tests/s2c-query-consumers.test.mjs 验证少量真实跨域消费者。
- 若统计工具需要读懂“字符串用于状态判断还是只作消息”，实现最小语法分类；不引入新的依赖框架，不把模块名列表变成自动通过清单。

**验收**：
- 一组普通存活/真实死亡/濒死/失能/宣告仍活/恢复/同ID新代次/缺失实体，穿过实际商店或学习、感知、NPC主观决策、战果、家族历史等消费路径；必须断言合法gone与生理死亡不混同。
- 查询测试须验证原先拒绝的未成年、非当面同意/无授权仍拒绝；魔法同意与I25双世界原断言保留。
- `node --test --test-isolation=none tests/s2c-lifecycle-query.test.mjs tests/s2c-query-consumers.test.mjs`；按实际改动跑对应现有测试文件，不新造59份“函数返回相同”的镜像测试。
- `node tools/death-keyword-modules.mjs` 输出raw、semantic、legacy分列和剩余命中行；raw可仍有中文提示，不能宣称原口径个位。无已批准修订则只报原口径。
- CORE。
**规模 M；模型 gpt-6-luna**。该卡不承担查询API设计、核心遗产或改判分器。

## 五、统一命令前缀、跨卡验收与交接边界

上述每条命令在PowerShell实际运行时都加前缀：
```powershell
$env:TEMP='F:/dnd-tmp'; $env:TMP='F:/dnd-tmp'; node --test --test-isolation=none tests/engine.test.mjs tests/storage.test.mjs tests/plugin.test.mjs
```
这就是每卡CORE；--test-isolation=none只应对既有环境子进程限制，不跳过测试。Linux式 `TEMP=... TMP=... node ...` 不可直接粘到PowerShell执行。

K1集成最后状态后，只跑一轮必要跨卡组（每组同样加环境前缀）：
1. `node --test --test-isolation=none tests/s2c-run001r.test.mjs`：26条预期，五题分别≥80%、无scriptError；报告每条判据，不能只给总平均。
2. `node --test --test-isolation=none tests/transition-protocol.test.mjs tests/holdings-registry.test.mjs tests/holdings-reconcile.test.mjs tests/holdings-roundtrip.test.mjs tests/holdings-writers.test.mjs tests/ledger-reconcile.test.mjs tests/save-roundtrip.test.mjs tests/invariants/i31-total-order.test.mjs`；若内存高，拆为相同文件的小组，不删断言。保留船沉两项已有用例（含载货账户/位置/重载），不要再建等价证明文件。
3. `node --test --test-isolation=none tests/advance-registry.test.mjs tests/ontology.test.mjs tests/arch-metrics.test.mjs`；然后独立跑 `node --test tests/scale.test.mjs`。本次协议合法行为可能改变快照，必须逐条解释对应行为差异，不能整批盲更新金快照。
4. 原有A2、生命/长短推进测试证据只在对应文件被新改动影响时追加相关组；已有后台结果先读最终日志，不重复启动不明状态的同一组。
5. 字面指标与语义指标一起报告；import新违例不得增加。sol-002已记录的5条arch-metrics旧违例不能更新基线洗掉；K1改协议依赖时一并消除相关反向依赖，其他旧违例明确交主会话既有问题处理。
6. 最终CORE。主会话按既定规则合并后只再跑CORE，复用执行会话完整有效证据。全部执行卡/合并完成才到里程碑结束的全量测试、build:release与真实提示栈验收；本规划没有执行或声称这些通过。

已知旧失败：finance-assets:98离屏班次、organizations:124月费已有HEAD对照；相关卡运行原文件若仍失败，应核对相同根因并如实报告，不能改期望或漏报为全过。卡内涉及原失败路径时直接修责任层，否则主会话登记原问题后决定是否可验收局部交付；S2整阶段不能借局部成功改为完成。test:baseline原23项预期失败保持，所有未跑项明确未跑。

两次尝试失败的同一块遵循Stop规则：保存已通过部分，交主会话一次规划处理，仍失败标卡住；本报告是对两轮未完责任的统一拆解，不发明新nonce重置旧失败预算。所有执行先核实自己的所有权，不覆盖s2c现有未提交成果；本规划不授权部署、不触碰原存档。

