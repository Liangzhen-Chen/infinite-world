## entity-life
✖ failing tests:
✖ 处决结算一次：人口、遗产、义务、组织空缺、宠物与契约保留守恒 
✖ 寿终结算一次：人口、遗产、义务、组织空缺、宠物与契约保留守恒 
✖ 战斗身亡结算一次：人口、遗产、义务、组织空缺、宠物与契约保留守恒 
✖ 战死结算一次：人口、遗产、义务、组织空缺、宠物与契约保留守恒 
✖ 法术致死结算一次：人口、遗产、义务、组织空缺、宠物与契约保留守恒 
      5 expected: '取消',
      5 actual: 'void',
      5 AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

## entity-view
✖ failing tests:
✖ 组织唯一首领实际退会后空缺不回退，死亡首领也不再占职 
✖ 退出目录势力后目录仍可发现，当前成员和立场、舆论不再使用旧名单 
      2 expected: true,
      2 actual: false,
      2 AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:

## festival
✖ failing tests:
✖ 取消、无人到场、资金不足和缺授权各保留原因，不扣费 
✖ 月份与年界一次发生，30日离开分步一致且只有本地场景显示结果 
✖ 有私人费用授权及实际参与才举办，组织费守恒且重放不重复收费 
      3 TypeError: Cannot read properties of undefined (reading 'durationMinutes')

## npc-depth-next
✖ failing tests:
✖ 原入口逐批验证，重复不重写，篡改新一批不能覆写人物钱物 
      1 Error: 发布骨架或引用事实已改变 loc_bs_yupo

## npc-depth
✖ failing tests:
✖ 三条已审核旧措辞可定点升级，其他同字段篡改不能借措辞修正通过 
✖ 既有发布入口验证全部补充审核，重复零写入，保留既有库存现金而拒绝改身份 
✖ 首次四村安装仍要求原候选与新补充逐条审核，篡改补充不能写正式目录 
      3 Error: 发布骨架或引用事实已改变 loc_bs_yupo
      2 ✖ 既有发布入口验证全部补充审核，重复零写入，保留既有库存现金而拒绝改身份 (16821.3718ms)

## npc-life-health
✖ failing tests:
✖ 病故后约定终止不追责，遗产整体交给同户成年继承人，人口账减一，病中照护释放 
      1 expected: [Object],
      1 actual: [Object],
      1 AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
      1 + actual - expected

## npc-life-t164
✖ failing tests:
✖ 名册家人在照护、离世、迁居需要时进入状态：配偶照护并继承，家人随迁，议事资格按当前户籍 
      1 expected: 'npc_hw_shaohe',
      1 actual: 'npc_hw_shaoyun',
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
✖ 独立迁移命令重放世界升级历史，备份附所需世界版本，旧档原初快照保留 
      1 expected: 2,
      1 actual: 3,
      1 AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

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
      2 ✖ 四村合并仅精确已审before/after可保留深度修订，fake凭证、后续冲突和错误旧版本仍拒绝 (6114.6965ms)
      1 ✔ 四村原已审补充重发保留后续记忆和运行财物，原记忆篡改仍拒绝 (54935.1384ms)
      1 ✔ 同编号正式事实冲突拒绝覆盖，非四村目录不随合并改变 (62.5176ms)
      1 Error: 发布骨架或引用事实已改变 loc_bs_yupo

