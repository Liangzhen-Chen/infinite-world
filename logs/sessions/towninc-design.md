# TOWNINC 设计草案

S=server-plugin/，W=world/；“骨架”=W/design/w1-baishi-skeleton.mjs。下述新增规则待主会话审定，不是现有世界事实。

## 1．收入与现状
306名登记居民中，baseline.json有100人、合计2351文，residents.json有206人、无钱物；按W/people/households.json:1582的成员集合汇总。99名升档者的18—26文是作者初始零钱，非工资；严辙200文与商品另有来源（W/design/w1-baishi-{dock,market,craft}-depth.mjs:80/95/419、w1-baishi-skeleton.mjs:90）。教学可收真实学费（S/education.mjs:261），售货可收货款；日程、职业不能保证买家、岗位或收入。694人月收入、消费均0（TFA-audit.json:6）。

新增统一机会选择，具名与统计用同一结算：
- 手艺：买方钱袋→工匠/柜台；材料所有者扣料、工具磨损、占用设施与劳时，产物归约定所有者，售出才有收入；复用S/finance-assets.mjs:433、453及business.mjs:718，营业额不再重复记为工资/利润。
- 雇工：有订单、补货缺口才招工；雇主柜台/钱袋→劳动者，实际工分折薪，欠付入债而非可花现金（S/labor-market.mjs:67、243）。新增搬运、帮工的任务量与完成凭据，不能用“服务业”标签刷工分。
- 公役：有效任职、授权、公库留底→项目托管→工人，未完工不发满薪；复用S/public-projects.mjs:121、207及governance.mjs:605。白石暂无公库/任职数据，不纳入默认收入（骨架:90）。
- 外来钱：外客买货、托运、学费、汇款分别扣外客/寄款人真实账户；税役回流扣上级实收公库，须有效拨款。借款不是收入；租金须真实产权及租约。现成运输收款见S/transport.mjs:302；无外部交易或财政授权时不预设流入。

## 2．起始财富
新增开局经济数据：有限区域钱量M、分户资产权重w、土地/租约、上季实收与损耗、库存批次、工具及经营资本。户数只分配人数；职业仅影响技能/工具需求，不能推导M。期初现金按剩余M×w/Σw分配，整数余数按稳定种子分完；w来自已登记资本/资产阶层，不来自职业名字。存粮=面积×历史单产×年景−留种−食用−实物租税−损耗，非农户存粮从既有购买分配扣出。债权另列。缺来源就留空待补，不按“活够30天”反推赠款（骨架:64、90；docs/产品原则.md:10、17）。

具名、名册、生成户同规则：已有2351文及库存计入总盘、先扣再分余量，不覆盖私人所有权。新世界只开账一次，src:genesis明确记录期初来源，不伪造历史交易；之后全是转账/生产。升档只领既有份额，不再次genesis；原存档不动（S/ledger.mjs:64、84；population.mjs:439）。

## 3．统计与物化
每镇固定“生计×资产档×劳动能力”组，保留组内受益份额、钱粮、欠薪、累计收益指数与工时余量；有收入户不替无收入户付款。共享只限已同意家计，保留合住者私产。每组每日批量竞争真实订单/钱料/工位；生产、服务、通勤、做饭共用时间预算，老人按能力而非全算劳力（现S/labor-market.mjs:288把非儿童都计入）。

日常O(聚落×固定组数)，合同履行另O(到期事件)，不能承诺任意独立合同也严格O(聚落)。更新人口索引，不每日扫户。物化按稳定种子确定组与受益份额，先结到当前刻，再转钱粮、债权债务、工作份额和已耗工时；余数留原组，最后份额取净余额，重入不转。沿用S/household-budget.mjs:100，但替换:109全镇按人口均分，不能把新入户变富或重复就业。

## 4．接点与次序
先开账/机会与预算，再真实履约付款，随后消费；未到账工资不垫正午餐。K08继续营业、报价、到店成交；须按组购买（S/business.mjs:769）。K12只收真实到站货（S/shop.mjs:402）；TFB负责产地售粮/运输，C负责买原粮、家户加工与集市直购。共用钱料与劳时占用，先到期者先结；本卡不另造补货器。现有支付、生产、公役足够；新增的是机会自动匹配、非配方服务完成量、开局经济输入及分组权益。依据F:/dnd/logs/arch/townfood/design.md:16、20及S/labor-market.mjs:295。

## 5．白石30日手算
规则行：W/rules/tables/balance/body.json:10轻劳动60饱食/日；W/meta/items.json:1薄饼30；recipes.json:1筛磨20分、烙饼35分产4饼；rules.json:1583无技能20—40文，S/market.mjs:345中点30；action-costs.json:5每工日480分。人数据骨架:78。

现状694人需41640饼，买0、缺41640饼；306人不能以2351文宣称月收入或够吃。

条件算例（非审计预测，按轻劳动当量）：200名有能力工人完成24天有凭据服务、净工价30，外部客户真实账户扣144000文→居民收入144000；其余人加工、供货。假定逐日到柜台54000饼、成交到岸价2文/饼、无路费，分组各有购买力与服务时段，粮款108000→卖方，居民余36000；商家收入留柜台，不再计一次分红。需原粮13500、水盐燃料各13500、加工742500分、完好刀/锅及工位；这些必须由TFB/C和真实生产提供。价格2是情景报价，不拿面包检验锚冒充薄饼定价；重劳动须按body表追加需求。

1000人需60000饼，实际最多54000，缺6000饼=180000饱食=3000人日；若集中在100人，则900人吃足、100人仍贫困/缺粮。60000饼齐备时支出120000、余24000、营养缺口0；仍未证明衣住支出够用。算例证明可有非全体饥饿的收支条件，不能证明现有白石已具备200份订单、外部预算和运力；须在下卡落成并实跑。

## 6．拆卡与验收
以下为独占责任，接点合入前由主会话核对所有权；新增测试同卡独占。
I1 开账/权益：S/{town-income,household-budget,population,npc-life}.mjs，tools/load-world.mjs，W/economy/town-income.json及新增schema/town-income.schema.json。落地第2、3节输入与加载；真实新开局、发现住户、升档、读档，验总量/私产/余数/债权不变。必跑town-income、food-demand、population、npc-life、household-budget、load-world；TFA后可与TFB并行，与C的家计接点先核权，重叠即串行。
I2 就业：S/{labor-market,finance-assets,town-work}.mjs。真实采购、开店下单、签约、到岗；验无材料/工具/资金/需求不赚，拒工、欠薪、跨日不双占。必跑town-work、labor-market、finance-assets；依赖I1接口，可与TFB/C并行开发。
I3 接线：S/{business,market,transport,public-projects,advance-registry,npc-autonomy,shop}.mjs及tools/{arch-layers,system-map}.mjs。接第4节及公共/外部订单，不写另一套结算。与TFB/C共享文件，必须待其交卡串行；跑所有所改模块同名测试、shop-restock、s5-law-household-meals、town-income-integration；真实运货/公役授权/消费，验到账时序、封路、无权支出、物化中途履约。
I4 默认经济验收：独占tests/town-income-month.test.mjs、tools/town-income-audit.mjs；I1—3后，以正式世界及真实动作跑30日、逐日/长等待/存读档等价、逐组钱粮和缺餐、31郡增长，不将本节假设写成测试赠款。输入不足退回I1补经济数据，不能宣称通过。
各卡重导actions，逐文件独进程跑CORE(engine/storage/plugin)、actions-catalog/action-registry/advance-registry/arch-metrics及新增、修改模块测试；金快照只列字段差异，不重生。

交接：仅写本文；无临时文件，工作树及禁区未改。CORE、actions-catalog/action-registry/arch-metrics均退出0；advance-registry为3过2败，未修代码/快照。export-actions会写只读工作树，未执行；无新增或修改模块测试。本卡无状态字段变化，TFA既有快照差异见TFA-golden-fields.md:5。
