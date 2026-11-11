续做 TFB（正文 tfb.body.md，共同规则 s5law-common.md，设计 F:/dnd/logs/arch/townfood/design.md）。链路已通（探价→留粮锁款→真实运输→到柜结算→货损退款），保留。剩两块：

## 1. 生成县真实镇不发货（tests/s5-law-food-supply.test.mjs:163）——先查清拒绝发生在哪一层
现场：来源 loc_far_zhufeng、管理人 npc_rg_fengji_zhufeng_03；镇铺 shop_rg_fengji_zhufeng_09，观察报价量4、单价14、税300bps；真实驮畜 30kg/factor 0.375；planFoodSupply 没有产生该来源订单。
做法：给 planFoodSupply 的每一道筛选（余粮计算、报价获知、净收益、运力可用、经营者决定、路线可达）在该用例下逐步记录结果（临时诊断，交卡前删），定位是哪一步把它刷掉（文件:行）。若是规律缺口（例如生成县的经营者权限、驮畜运力口径、跨县路线）就按通用规律补；若是测试前提不成立就按真实动作补前提。不要换第三种等价修法——查到哪一层再改哪一层。
## 2. 运量太小：白石镇 30 天只到 22 份（11kg），需求约 4284 饼/周
设计 §3 已指出须按真实车辆/班次/运力扩容。要做：planFoodSupply 选择运力时使用世界里已有的承运服务（CT07 后 transport.mjs 的车行并载、逐日行程；有车有驮畜的家户/车行可受雇），不仅限于经营者本人背运；同一供货窗口内按缺口与运力可多趟/多车；运费、误工进入净收益。给出改动前后 30 天白石镇到柜量，以及到柜量与登记户需求（按原粮折算）的对照。
## 不在本卡
家户买原粮回家加工成口粮（卡 C，K16 合入后另派）。K08 不买无营养原粮是正确行为，不要改它让家户买燕麦。
## 文件所有权
同 tfb.body.md（food-supply.mjs、agriculture、shop、transport、advance-registry daily 接线、settlement-trade、rules.json 的 foodSupply 段及测试）。不改 npc-life、household-budget、npc-state、household-subsistence（K16 在改）。
## 验收
s5-law-food-supply 全过；共同规则大清单口径；金快照字段表更新（TFB-golden-table.md）；汇报 ≤300 字：拒绝层根因（文件:行）、运力扩容做法、30 天到柜量前后。
