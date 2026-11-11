# W8-E8 第五轮：按首领给的条件走完种地路线

你如实保留了 103<140 的失败，做得对。主会话已做两件事：
- 把你第四轮的改动提交为 c930d578。
- 把最新 s5a 合进本分支。合进来的内容包括：
  - E6b：shop_pricing 已按精确分数持久化，所以你准备的 shop.mjs 补丁不用了，不要应用。
  - f0de40b9：面积修复，s5-05 应该恢复全过。

先跑 numeric-persistence 和 s5-05 确认这两点。

## 决定一：秋后交租接受"先付一部分"
首领的回复不是拒绝。它是 npcDecision 的 conditional 结果：conditions.prepay=10，原话"需先付10文，再谈这件事"。现实里佃农先交押租或部分租、余下秋后交，很常见。

做法：
- rent_in 约定 rentDueAt 时，允许玩家同时带一笔当场先付的钱（用现有 coins 槽，或租约已有的 prepayment 字段，以现有字段为准）。
- 先付的钱真实入聚落公库。延期义务金额 = 应付总额 − 先付额，金额照原规则计算。
- 先付额作为 reward/prepaid 进 npcDecision，与 dialogue.mjs:118 处理 conditions.prepay 的方式保持一致，复用同一约定。不写死同意。
- 首领仍可能拒绝或再提条件。按真实结果走。
- 回执里把 conditions.prepay 原样告诉玩家，让玩家知道下一步可以怎么谈。
- 现付路径和不带先付的延期路径保持不变。

## 决定二：public_property 不按名字硬筛
现状：entity-view.mjs 两处用 `.filter(p=>p==='public_property')` 挑出这一项职权。这是写死特判，要改掉。

改法：在 world/meta/rules.json 该职位定义里追加一个数据列表，例如 `seatPowers:["public_property"]`，意思是"只要占着这个首领位就有的职权，不受升级覆盖影响"，并注明出处 05 §5.7.3。代码改为读这个列表。

## 收尾
- tests/s5-playthrough.test.mjs 农事段按真实菜单走：
  - 请求延期 → 读首领的条件 → 带先付额再谈 → 按真实结果继续：播种 → 成熟 → 分趟收割 → 卖粮 → 交清欠租 → 余款存钱庄 → 完整重放。
  - 每步手算锚点。
  - 若仍付不起或被拒，如实保留失败并汇报。不改人物、种子或世界数据去凑。
- 更新 docs/可玩版本-S5.md。

## 测试
- 同第四轮列表全部重跑。
- advance-registry 金快照差异按合并后的树重做字段表，写进 F:/dnd/logs/sessions/W8E8-golden-table.md（覆盖旧表）。不要重生成快照。
- 汇报按共同规则。
