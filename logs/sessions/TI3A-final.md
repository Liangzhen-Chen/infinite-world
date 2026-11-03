# TI3A 交接
**合并**（4次，末提交6ab3e749）：t-ti2无冲突；t-tc的business.mjs取并集（I2签名与采购保留，C比价/余粮上限抽成shelfStock/shelfBasket共用）；s5a仅quest-sources测试冲突按并集；s5a@6f3bddcb的market.mjs并存foodSatiety与goodsClass缓存；生成件重导。
**已修（未提交，在工作区）**：settlement-trade、npc-life-health（测试钩子bind丢scoped引擎）；s5-07（测试清空settlements致统计组孤儿）；s5-03/s5-f-tender（I2/C使人物离岗，改摆位/开局601）；entity-life/entity-world(2997=999×3)/data-coverage（商税入公库）；deploy-engine缺town-income schema；authoredRules漏townIncome/householdCrafts；7个隔离发布测试漏复制world/economy。
**仍败（s5a过）**：village-ledgers（柜台账户-360未查清）、weather、world-clock、seasonal-hazards、s5-04b、s5-08-w3a(3)、notables-promotion、advance-registry(金快照2+1443边界)、m1-repair-learning（教师课与采买窗口重叠）；m3-language/npc-life-health未重跑；超时未跑：agriculture、event-size、farm-pests-*、ledger-price、record-index-check、seasonal-migration、wildlife、monster-society。
**审计30日**：具名缺餐1286.25(原1147)、统计组17412.5、加工0、买原粮0、hw烙饼16不变。
**性能**：s5a/TI3=105/127、94/132、98/133秒，比值1.21/1.40/1.36，中位1.356（略超1.35）。
**金快照**：差异全归TFA/TFB(店货架、商税、家户餐)、I2(薪资/路程)、C(炊具/家灶库存)；K16计划随之变。
偏离：TI3建了node_modules/SillyTavern联接。
