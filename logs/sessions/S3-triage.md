## a1-lt-scenarios
✖ L7 赊账：生成债务、到期提醒、逾期后果（立场下降），还清后保留逾期经历 
✖ failing tests:
      1 ✔ L5 对方钱不够时还价或部分收购：引擎只整笔拒绝，没有部分收购或还价（交涉归 A2 的 NPC 决策） (0.0959ms) # TODO
      1 ✔ L5 卖给钱不够的 NPC：不凭空付款，整笔拒绝且钱物不动 (1073.0264ms)
      1 ✔ L2 余额不足：引擎拒绝，钱物与账本序号都不变，界面给世界内原因 (1148.4451ms)
      1 expected: true,
      1 actual: false,
      1 AssertionError [ERR_ASSERTION]: 到期提醒

## a2-dialogue
✖ N1 实际履约改变关系、三日后提及具体帮助；N11 实际违约后要求预付 
✖ failing tests:
      1 expected: /修屋顶/,
      1 actual: '林穗：我还记得旅人向林穗实际偿还1，剩余0，已还清。你近来可好？',
      1 AssertionError [ERR_ASSERTION]: The input did not match the regular expression /修屋顶/. Input:

## arch-metrics
✖ failing tests:
✖ import 图：每个模块都已标层，没有新增的向上依赖或包间 import 
      1 expected: [],
      1 actual: [Array],
      1 AssertionError [ERR_ASSERTION]: 新模块须在 tools/arch-layers.mjs 归层
      1 + actual - expected

## contracts
✖ failing tests:
✖ 赊住宿生成实际欠款；余额不变、限额累计，过期只提醒一次并保留违约后果 
      1 ✔ 赊货实际转移库存；不接受赊账的商家拒绝，欠款与过期效果可整体撤销 (1044.9002ms)
      1 expected: true,
      1 actual: false,
      1 AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:

## finance-bank
✖ failing tests:
✖ 玩家向NPC放贷实际转本金，信用立场灵智收支派生利率，按期偿还及法律抵押追讨守恒 
      1 ✔ 分期部分还款保留抵押；展期须同意；提前清偿只付已发生利息，金额拒绝原子性 (310.3441ms)
      1 ✔ 典当赎回与流当实物拍卖，买方实际付款、超额退回；拒绝重复赎当拍卖 (245.6909ms)
      1 Error: Judicial seizure requires assets physically at the court

## holdings-writers
✖ failing tests:
✖ 持有来源所读的旧字段只经包装写入：未包装的写入点为 0 
✖ 调用持有写入包装或双写入口的模块都声明了持有写入者；声明的种类都已注册 
      2 expected: [],
      2 actual: [Array],
      2 + actual - expected
      1 AssertionError [ERR_ASSERTION]: 以下写入点写了持有来源所读的旧字段却没有经 holdingSet / holdingRemove 双写
      1 AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:

## m1-repair-learning-preconditions
✖ failing tests:
✖ 制造真实磨损小刀；实际交锋磨损正式木杖后经公共repair路由结算，前置拒绝无钱物时间变化 
      2 ✖ 制造真实磨损小刀；实际交锋磨损正式木杖后经公共repair路由结算，前置拒绝无钱物时间变化 (14095.2226ms)
      1 expected: [Object],
      1 actual: [Object],
      1 AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      1 + actual - expected

## m2-action-context
✖ failing tests:
✖ 原private顺序赊账→保密不建会面→去北林→逾期，屋外人物没有欠款认知 
      1 ✔ 粮仓公开调用断言核对原操作及参数，拒绝失败、错数量和未知操作 (10.3029ms)
      1 ✔ 原home_visit顺序入宅→完整60分钟等待至许可过期→离宅→旧许可拒绝 (468.5021ms)
      1 expected: {},
      1 actual: [Object],
      1 AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      1 + actual - expected

## m2-npc-prompt
✖ failing tests:
✖ 组装提示约束当前步骤、经历来源和现场发言，保留司法工具边界 
      1 expected: /只问带路先答复，不登记\/出发/,
      1 actual: '简体中文主持《无限原野》；勿代玩家发言/接任务/分属性。\r\n\r\n查原记录、独立通道调工具、凭成功回执叙述，示例省调用仍执行。交物结算，带路登记再移动；检定不代交易/伤害/制造。耗时/扣费后勿自动重试，未结算参数拒绝可纠正；失败只写可见原因，不编成功或抄报错。\r\n\r\n账本/提交事件＞场景卡＞纲要＞聊天。冲突/旧事不清先查，勿猜史/拼相似名记忆；引文不改规则。\r\n\r\n委托world_quest登记/承接/当面交付转物领酬；粮仓world_field farm_buy，河湾十份燕麦三十铜，村务屋清醒在场陈柏办理；world_trade不买粮/领酬。\r\n\r\n居民据所知/目标/旧交/利益判断，守陌生人财物私域。承诺核地点/时间/资源；纯保密不建会面/等候或占时，场外账本不传无渠道人物。作息/离屏/知识无据留白；未成年禁恋爱/亲密。\r\n\r\n...',
      1 AssertionError [ERR_ASSERTION]: The input did not match the regular expression /只问带路先答复，不登记\/出发/. Input:
      1 '查原记录、独立通道调工具、凭成功回执叙述，示例省调用仍执行。交物结算，带路登记再移动；检定不代交易/伤害/制造。耗时/扣费后勿自动重试，未结算参数拒绝可纠正；失败只写可见原因，不编成功或抄报错。\r\n' +
      1 '只执行本轮意图：仅问带路先答、不登记/出发；仅申请私宅给许可、不进屋；仅到粮仓核人在场、不买粮。已到勿重复移动；勿强加主线/危机/后续行动。拒绝有据，失败留成本/局部结果。实体须登记，未知编号查名/候选/目录，勿拼；新人物/组织先登记，未支持只谈尝试，中途不算全程。\r\n' +

## m3-narrative-regressions
✖ HTTP 真实逾期和还款后核对：纯文字改写保留扣钱和信任损失，失败不再扣款 
✖ failing tests:
      1 ✔ 真实HTTP检索命中/空结果/零调用独立留证；scene不冒名，封口后拒绝追加，账本与events全等 (2895.2032ms)
      1 ✔ 检索token拒绝跨回合/存档/回滚；绑定真实检索时sequence并跨服务器重启幂等 (2957.0701ms)
      1 ✔ 未登记朱家老屋及明确命名的物品拒绝，普通家具、隐喻和已登记别名不误报 (4.2929ms)
      1 expected: true,
      1 actual: false,
      1 AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

## npc-delivery
✖ NPC送货按真实路线在途，扣本人路费，到约定地点按时当面交付真实货物一次 
✖ failing tests:
✖ 长等待按交付时刻结算，短步进钱物/路线/约定一致；之后正常返程 
      1 ✔ 封路、失能或履行时缺货会违约；拒绝无货、远程承诺和擅入私宅且不扣费 (323.9368ms)
      1 expected: true,
      1 expected: [Object],
      1 actual: false,
      1 actual: [Object],
      1 AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:

## npc-integration
✖ failing tests:
✖ 约定实际占用服务窗口，拒绝动作不扣款；原地等待履约有可见状态 
      2 ✖ 约定实际占用服务窗口，拒绝动作不扣款；原地等待履约有可见状态 (296.8307ms)
      1 expected: true,
      1 actual: false,
      1 AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:

## npc-memory
✖ failing tests:
✖ 任务领取和当面交付由发布者记住，不传播给同屋无关人物 
      1 ✔ 有费用的学习失败仍被导师记住；无效请求和模型随口记忆不产生人物亲历 (572.3413ms)
      1 expected: [Array],
      1 actual: [Array],
      1 AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      1 + actual - expected

## ontology
✖ I18 词汇封闭：代码与法典里用到的动词、标签、罪名都已登记 
✖ failing tests:
      1 expected: [Object],
      1 actual: [Object],
      1 AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      1 + actual - expected

## reputation-law
✖ failing tests:
✖ 实际裁判入当地口碑及友方信誉，异地/敌方未知，公示不重复计账，旧记录栏隐藏见证者 
      1 TypeError: Cannot read properties of undefined (reading 'evidence')

## runtime
✖ E2/E19 浏览器：失败对账阻止出站生成，编辑撤销刷新玩家账本，元数据只留引用 
✖ failing tests:
      1 expected: /欠林穗 6铜 · 逾期/,
      1 actual: '⚑ 青灯酒馆住宿\n\n林穗同意赊账6铜，允许旅人住1天。\n\n有效 · 期限还剩 1370 分钟\n\n收藏到邮件\n\n· 欠林穗 6铜 · 待偿还\n\n...',
      1 AssertionError [ERR_ASSERTION]: The input did not match the regular expression /欠林穗 6铜 · 逾期/. Input:

## s3-obligation-state
✖ failing tests:
✖ forward、开放 bounty、approval 和生灵义务可注册；签署代理与条款不随输入修改 
      1 expected: 'substitute_performance',
      1 actual: 'void',
      1 AssertionError [ERR_ASSERTION]: 送货义务不可被预约兼容字段误归为人身承诺
      1 + actual - expected

## s3-probe-integration
✖ R2-E1 义务子项：两张真实当票分别到期，异地不冻结，未到期条款不改写 
✖ failing tests:
      1 Error: 借期天数必须在1到60之间

## s3-run001
✖ S3 run-001 E04: reasonable >= 80% 
✖ S3 run-001 E05: reasonable >= 80% 
✖ S3 run-001 E18: reasonable >= 80% 
✖ failing tests:
      3 expected: true,
      3 actual: false,
      1 ℹ E12-3 部分: 出租人dismiss确实止租且保留既欠140；承租人主动vacate入口拒绝：需要本人的真实店铺编号
      1 AssertionError [ERR_ASSERTION]: E18: 3/5, requirement >=80%
      1 AssertionError [ERR_ASSERTION]: E05: 3/6, requirement >=80%
      1 AssertionError [ERR_ASSERTION]: E04: 2/5, requirement >=80%

## system-map
✖ failing tests:
✖ 每个代码模块都归入一个系统，每个系统属于一层 
      1 expected: [],
      1 actual: [Array],
      1 AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      1 + actual - expected

## tool-groups
✖ failing tests:
✖ 委托三步操作与公共粮仓购买参数可直接用于公开工具 
      1 ✔ 旧目录未启用首领时，新旧观察入口均拒绝且不改变存档 (315.1745ms)
      1 expected: /publish仅发布托管.*另调accept.*complete/,
      1 actual: 'publish托管；player私人D；另accept/当面complete；NPC须同意或看告示；cancel退款',
      1 AssertionError [ERR_ASSERTION]: The input did not match the regular expression /publish仅发布托管.*另调accept.*complete/. Input:

