续做 I2（正文 ti2.body.md；共同规则 s5law-common.md，注意第 5 行的文件所有权规则）。主会话已提交你的改动（fa6f0940），并合入 t-town（f9c28825）。t-town 带来：TI1b 的开局钱 390,639 文和口粮、TFB 的产销链。合并冲突（arch-layers 的 economy 包、ti1-audit 的字段）已由主会话按并集解决，请核对。

## 主会话查到的两个失败根因（你按两次失败规则停了，这里给出根因）
1. “拒工…到岗后才付工钱”：
   - 合同状态变成“罢工”，reason=“工作台使用权已失效”，出自 finance-assets.mjs:449。
   - 招工 location=bld_hw_qingdeng（林穗的店），但 recipe_wooden_pegs 要 woodworking 工作台，店里没有；木工台在 bld_hw_mill。
   - 这是招工机会生成的 bug：地点应从“雇主有权使用该配方所需工作台的地点”派生，包括雇主自有的，或公共且付得起使用费的；找不到就不产生招工。
   - 请修 laborOffers 的地点派生，不改测试。
2. “统计组…生产”里的“交易对方不在场”：
   - 统计组采购原料时直接调用了需要双方在场的交易动作。
   - 统计组没有具体的人身位置，采购应走 TFA 在 business.mjs 里已有的统计顾客流程：按 walkMinutes 往返、营业时段、有限货架、同一报价与深度门槛。
   - 复用这条流程，business.mjs 允许为此做最小改动；不新开第二套成交。

## 验收
同 ti2.body.md：town-work 全过；30 日审计在正式世界（现在有开局钱粮和 TFB）报各组工时、收入来源、购买量、缺餐，与 t-town（缺餐 17,412.5、购买 0）对照；性能对 t-town 三对中位 ≤1.05；金快照逐字段解释。汇报 ≤300 字，写入 TI2-final.md。

## 文件所有权
- 不得改：npc-autonomy 和卡 C 新增的加工、集市模块（卡 C 同时在做）；household-subsistence、water-cycle、npc-state、npc-schedule、education-state（K16 第十轮）。
- household-budget.mjs 卡 C 也可能小改，你的改动保持最小，并在交接里列明。
