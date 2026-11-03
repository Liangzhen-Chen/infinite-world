# TC 第四轮交接
**改动**：household-food.mjs 户内共用库存（按成员id借料借具，一户同时一个厨师，借用走 transferItems）；household-crafts.mjs 用 town-income 的 townLaborMinutes 判能干活（轻病仍会做饭，无手写清单）；town-income.mjs 炊具发给所有家户（无M聚落按开局存量记入 genesis，含数量、价值、来源）；arch-layers 调层；测试：processing 重写9项（hw 家户真实烙饼、缺锅、统计组前提），quest-sources#5 与 w8b#8 因买煮决策/出行改期望并注明。
**hw 实测**：自家面粉+盐水锅，家灶烙饼，30日 4 批全成，出16饼。燕麦→磨坊：卡在 household-food.mjs recipesFor，工位只认 home，磨坊不在家；镇民去 hw 磨粉同理不可行（家常知识只在 household 路径生效）。
**审计30日**：具名买成品1、加工0、缺餐1147；统计组缺餐17412.5、加工0（包内只有口粮和炊具）；售粮0；账本无差。关规律=上轮数字。
**验收**：110文件无新增失败（对照干净 PERFBASE）；性能中位1.048（三对1.075、1.048、1.002）；金快照全为炊具、开局现金、hw烙饼连带，numeric-digest 随之变。
**种子根因**：business.mjs:903 每日按种子随机排店序，先到店成交，店存30两种子相同；无价格距离比较，属原设计噪声，未改，建议另立卡。
**缺口**：劳时被占未造（需I2招工）。盐、柴、水：店铺均无补货源，盐产地 yandu，水 hw 且一日腐，配方每批各1份。
