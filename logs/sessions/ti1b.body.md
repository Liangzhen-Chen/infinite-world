TOWNINC 卡 TI1b：从现有规律推出白石镇开局的钱、粮、资产（共同规则 s5law-common.md；设计 F:/dnd/logs/sessions/towninc-design.md 第 2 节；先读 docs/产品原则.md）。

## 背景
本树切自 t-ti1@eed086f9。I1 已经做好开账钩子、world/economy/town-income.json 的加载、统计分组和守恒物化，但白石镇的经济输入几乎全部留空，正式世界里统计人口 30 天仍买到 0 份。

主会话（设计者）裁定：I1 留空的理由里，有两条是执行者自设的限制，不成立：
- “未来生产率不能替代上季实收”：上季收成可以用同一套农业规律，套在上一年的日历、年景和灾害上确定性地算出来。这是派生，不是编造。
- “职业不能推出资产”：资产从这门手艺所需的工具、设施、材料周转推出，读的是配方和物品属性，不是职业名字。

## 推导方法（主会话定，实现须逐条登记依据）
1. **存粮**：
   - 白石镇不种田（granary:false）的户，存粮是“上一个集期买回、尚未吃完”的口粮，在 0 到一个集期间隔的需求之间，按稳定种子逐户取值。
   - 这些粮的来源是集市上的历史购买，所以对应的钱已经花掉，并入期初总盘计算，不另记。
   - 有登记农地的户，按农业规律在上一年日历上的结果，减去留种、食用、实物租税、损耗。
   - 都写入 town-income.json，并带依据。
2. **资产权重 w**：
   - 每户的经营资本 = 其生计所需的工具、设施，加上一个生产周期的材料周转。
   - 生计所需从既有配方、工具、设施要求推出；价值按既有价格表估算。
   - 无手艺的劳力户 w 取最低档。资产档按资本分位划分。
3. **区域钱量 M**：
   - 公式：M = 年名义收入 ×（现金持有月数 ÷ 12）。
   - 年名义收入 = 劳力（按年龄与身体能力）× 年工作日（日历与休息日规则）× 既有工价表的中位值。
   - “现金持有月数”是新规则，写进 world/rules，登记史料来源，并标为暂定默认值。参照 CT07 标暂定默认值的写法。
   - 已有的 2351 文和公库 12000 文先计入总盘，分配的只是余量。不按“够活 30 天”反推。
4. **土地与租约**：白石镇无农地登记的户保持空，这是真实情况，不是缺数据。居住租约从 world/people/households.json 的 tenure 读。
5. **测试**：删除 tests/helpers/town-income.mjs 里的 fundedIncomeWorld。它另造了一个世界去喂测试，违反“不为测试造世界内容”。town-income 测试改在正式世界上，用真实游戏动作跑。

## 验收
- town-income、food-demand、load-world、data-coverage、numeric-persistence、save-roundtrip、CORE 与同步四件套全过。用 affected-tests2 生成清单，大清单交关卡。
- 30 日审计（正式世界），各组报：期初钱粮、实际购买量、缺餐数，并与 I1 对照（0 购买、缺餐 20820）。本卡没有就业，期初钱花完后仍会缺粮，如实报数，不为好看调参。
- 手算核对：M 的计算式和每个输入值，各组 w 的推导例子各 2 户。
- 性能：30 日×2 对 t-ti1 三对中位 ≤1.05。
- 金快照逐字段解释，不重生成。
- 汇报 ≤300 字，写入 TI1b-final.md。

## 文件所有权
- 预计改：world/economy/town-income.json、world/rules（新增现金持有规则）、server-plugin/town-income.mjs、tools/load-world.mjs、tests/town-income.test.mjs、tests/helpers/town-income.mjs。
- 不得改：labor-market.mjs、finance-assets.mjs、新的 town-work 模块（卡 I2 同时在做）；household-subsistence、water-cycle、npc-state、npc-schedule（K16 合并中）；food-supply、agriculture、shop、transport、advance-registry（TFB）；npc-autonomy（卡 C）。
