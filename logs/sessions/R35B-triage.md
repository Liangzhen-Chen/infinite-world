## entity-life
✖ failing tests:
✖ 名册先继承后补档保留完整 actor；full 状态立即获得成长与规划模拟资格 
✖ 处决结算一次：人口、遗产、义务、组织空缺、宠物与契约保留守恒 
✖ 寿终结算一次：人口、遗产、义务、组织空缺、宠物与契约保留守恒 
✖ 战斗身亡结算一次：人口、遗产、义务、组织空缺、宠物与契约保留守恒 
✖ 战死结算一次：人口、遗产、义务、组织空缺、宠物与契约保留守恒 
✖ 法术致死结算一次：人口、遗产、义务、组织空缺、宠物与契约保留守恒 
      6 actual: null,
      6 AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
      6 + actual - expected
      5 expected: 'npc_hw_baihui',
      1 expected: 'npc_pop_bs_005_1',

## entity-transitions
✖ failing tests:
✖ 升格通知只在批准后产生，读取新官称而保留原任命与旧契约 
✖ 死亡导致同一店铺易主时只发一次易主通知，现经营者与事件一致 
      2 expected: 1,
      2 actual: 0,
      1 AssertionError [ERR_ASSERTION]: promote
      1 AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

## festival-runtime
✖ failing tests:
✖ 未来义务占用活动窗口、睡眠及远方人员不被节日移入现场 
      1 ✔ 集市交易继续走真实库存及价格，仪式期间拒绝交易并保持账本 (466.8963ms)
      1 expected: 'held',
      1 actual: 'held',
      1 AssertionError [ERR_ASSERTION]: Expected "actual" to be strictly unequal to:

## festival
✖ failing tests:
✖ 实际作息、睡眠和已占用义务不会被节俗瞬移或代参与 
      1 expected: 'no-attendance',
      1 actual: 'held',
      1 AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
      1 + actual - expected

## npc-depth-next
✖ failing tests:
✖ 原入口逐批验证，重复不重写，篡改新一批不能覆写人物钱物 
      1 Error: 发布骨架或引用事实已改变 loc_bs_yupo

## npc-depth
✖ failing tests:
✖ 三条已审核旧措辞可定点升级，其他同字段篡改不能借措辞修正通过 
✖ 六人定点深度不改变身份、钱物、旧记忆和原目标，双方共享事件而非相互全知 
✖ 既有发布入口验证全部补充审核，重复零写入，保留既有库存现金而拒绝改身份 
✖ 首次四村安装仍要求原候选与新补充逐条审核，篡改补充不能写正式目录 
      3 Error: 发布骨架或引用事实已改变 loc_bs_yupo
      2 ✖ 既有发布入口验证全部补充审核，重复零写入，保留既有库存现金而拒绝改身份 (17411.204ms)
      1 expected: true,
      1 actual: false,
      1 AssertionError [ERR_ASSERTION]: loc_bs_yupo：运行农事规则与审核开局账不符

## npc-life-family
✖ failing tests:
✖ 任一方不愿意或条件不足都不交往、不成婚 
      1 ✔ 未成年人一律不进入恋爱或婚姻流程，关系账也拒绝写入恋慕 (43466.6833ms)
      1 Error: I6 account destination: npc_hw_jiaoyou

## npc-life-health
✖ failing tests:
✖ 病故后约定终止不追责，遗产整体交给同户成年继承人，人口账减一，病中照护释放 
      1 expected: 'npc_hw_baihui',
      1 actual: null,
      1 AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
      1 + actual - expected

## npc-life-t164
✖ failing tests:
✖ 名册家人在照护、离世、迁居需要时进入状态：配偶照护并继承，家人随迁，议事资格按当前户籍 
      1 expected: 'npc_hw_shaohe',
      1 actual: null,
      1 AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
      1 + actual - expected

## reputation-law
✖ failing tests:
✖ 实际裁判入当地口碑及友方信誉，异地/敌方未知，公示不重复计账，旧记录栏隐藏见证者 
      1 expected: true,
      1 actual: false,
      1 AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:

## revival
✖ failing tests:
✖ 复活点世界数据的错聚落、重复、收费负值与缺少新手点阻止构建 
✖ 独立迁移命令重放世界升级历史，备份附所需世界版本，旧档原初快照保留 
      2 AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
      1 expected: true,
      1 expected: 2,
      1 actual: false,
      1 actual: 3,

## village-ledgers
✖ failing tests:
✖ tests\village-ledgers.test.mjs 
      1 Error: 发布骨架或引用事实已改变 loc_bs_yupo

## w1-village-profiles
✖ failing tests:
✖ tests\w1-village-profiles.test.mjs 
      1 Error: 发布骨架或引用事实已改变 loc_bs_yupo

## w1-villages-publish
✖ failing tests:
✖ 四村合并仅精确已审before/after可保留深度修订，fake凭证、后续冲突和错误旧版本仍拒绝 
      2 ✖ 四村合并仅精确已审before/after可保留深度修订，fake凭证、后续冲突和错误旧版本仍拒绝 (5880.0965ms)
      1 ✔ 四村原已审补充重发保留后续记忆和运行财物，原记忆篡改仍拒绝 (57811.847ms)
      1 ✔ 同编号正式事实冲突拒绝覆盖，非四村目录不随合并改变 (71.9772ms)
      1 Error: 发布骨架或引用事实已改变 loc_bs_yupo

## world-events
✖ K10：订阅者由各模块自行登记，按原结算顺序执行，可登记新订阅者 
✖ failing tests:
      1 expected: [Array],
      1 actual: [Array],
      1 AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      1 + actual - expected

