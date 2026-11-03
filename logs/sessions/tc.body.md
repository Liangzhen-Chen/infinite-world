TOWNFOOD 卡 C：家户买原粮回家加工、集市直接向村民买粮（共同规则 s5law-common.md，注意第 5 行的文件所有权规则；设计 F:/dnd/logs/arch/townfood/design.md 第 3、4 节“C加工”；先读 docs/产品原则.md）。

## 背景
本树切自 t-town，已集成：
- K16 早期版：家户自给，打水、采集；
- TFA：694 名统计居民的消费账户；
- TI1/TI1b：开局钱 390,639 文、口粮和资本，统计分组；
- TFB：产地售粮，经运输到柜台。

TFB 单独 30 天只有 22 份到柜，而且多是原粮（燕麦）。燕麦、粉没有 nutrition（world/meta/items.json:1），必须按 world/meta/recipes.json 的“筛磨→薄饼”加工才能吃。所以买到原粮的家户不会加工，等于没买；村民手里的余粮也没有直接卖进集市的路。

## 要做（钱物守恒，不造粮，失败不补齐）
1. 家户加工：
   - 具名户与统计组都能把持有的原粮按既有配方加工成可食物；
   - 须有配方所需的材料、工具、设施和劳时，水、盐、燃料都从真实库存扣；
   - 技能按真实练习增长，复用 npc-autonomy 现有的制作候选；
   - 劳时与 K16 的生计班次、I2 的就业共用同一个每日工时预算，不跨日双占；
   - 统计组按组批量，O(聚落×组数)。
2. 买原粮的决策：
   - 家户比较“买成品”与“买原粮自己加工”，按到手的价格、自家工时的机会成本、工具是否齐全来选；
   - 买原粮走 K08、K12 现有的到店或集市成交。
3. 集市直购：
   - 集期时，有余粮的村民户（扣自用、种粮、已签交付及下次收成前缺口，口径同 TFB）可以带粮到集市卖；
   - 城镇家户与统计组在集市上直接买；
   - 走现有的集期日程（npc-state.mjs:105）和 business 成交，复用 TFB 的余粮计算，不另写一份。

## 验收
- 新增或扩展机制测试，前提用真实游戏动作产生，覆盖：
  - 买燕麦→筛磨→烙饼→吃，营养到户；
  - 缺工具、缺燃料、劳时被占时不能加工，如实挨饿；
  - 集期村民带粮来卖，城镇户买到；
  - 无余粮的村不卖；
  - 统计组与具名户同规则。
- 必跑：npc-autonomy、s5-law-household-meals、s5-law-food-supply、food-demand、town-income、shop-restock、settlement-trade、s5-law-periodic-market（保留其 :180/:194/:385“无货不生货”的断言）、numeric-persistence、save-roundtrip、CORE 与同步四件套。用 affected-tests2 生成清单，大清单交关卡。
- 30 日审计（正式世界），报：
  - 城镇具名户和统计组各自的买入量（成品、原粮分开）、加工量、到户营养、缺餐数；
  - 村民集市售粮量；
  - 白石公库与村仓的钱粮变化。
  对照起点：t-town 上 TI1b 的数字，缺餐 17,412.5、购买 0。没有就业收入（I2 未合入），期初的钱会逐渐花完，如实报数。
- 性能：30 日×2 对 t-town 三对中位 ≤1.05。
- 金快照逐字段解释，不重生成。
- 汇报 ≤300 字，写入 TC-final.md。

## 文件所有权
- 预计改：server-plugin/npc-autonomy.mjs、新增加工或集市直购模块；为接入可小改 business.mjs、food-supply.mjs、household-budget.mjs，在交接里逐个列明。
- 不得改：labor-market.mjs、finance-assets.mjs、town-work（I2 同时在做）；household-subsistence、water-cycle、npc-state、npc-schedule、education-state（K16 第十轮同时在做）。
