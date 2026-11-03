TOWNINC 卡 I2：城镇居民就业与收入（共同规则 s5law-common.md；设计 F:/dnd/logs/sessions/towninc-design.md 第 1、3、6 节“I2”；先读 docs/产品原则.md）。

## 背景
本树切自 t-ti1@eed086f9。I1 已经做好：统计分组（生计×资产档×劳动能力），以及按年龄与身体能力推出的劳力。现状是统计劳力只接现成的、带配方的招工（labor-market.mjs 的 advanceStatisticalLabor），镇上没有这种招工，所以 30 天收入为 0。另一张卡 TI1b 同时在补开局的钱粮数据。

## 要做（钱物守恒，不发钱，职业名本身不产生收入）
1. 招工从真实需求派生：
   - 经营者有订单或补货缺口、柜台有钱、有材料工位时，产生雇工机会；
   - 雇主柜台或钱袋付给劳动者，实际工分折薪，欠付入债，不是可花的现金。
   - 复用 labor-market.mjs:67、:243 的结算。
2. 手艺自营：
   - 统计组与具名户都可以用自己的材料、工具、工位按配方生产，产物归材料所有者；
   - 售出才有收入，走 K08 到店或集市的现有成交，复用 finance-assets.mjs:433、:453；
   - 营业额不重复记成工资或利润。
3. 帮工与搬运：
   - 只有存在真实任务（有托运、装卸、施工等需要人力的事件）时才有活；
   - 完成量要有凭据，按既有工价付款；
   - 不能用“服务业”标签刷工分。
4. 时间预算：生产、服务、通勤、做饭共用每人每天的工时预算，不跨日双占。统计组按组批量竞争真实机会，O(聚落×组数)。

## 验收
- 新增 tests/town-work.test.mjs，用真实游戏动作产生前提（真实采购、开店下单、签约、到岗），覆盖：
  - 无材料、工具、资金、需求时不赚钱；
  - 拒工、欠薪；
  - 跨日不双占；
  - 统计组与具名户同规则。
- 必跑：town-work、labor-market、finance-assets、town-income、food-demand、business 相关测试、numeric-persistence、save-roundtrip、CORE 与同步四件套。用 affected-tests2 生成清单，大清单交关卡。
- 30 日审计（正式世界）：各组工时、收入、来源构成（雇工、自营、帮工）、购买量、缺餐数，与 I1 对照。TI1b 未合入前期初钱仍很少，如实报数。
- 性能：30 日×2 对 t-ti1 三对中位 ≤1.05。
- 金快照逐字段解释，不重生成。
- 汇报 ≤300 字，写入 TI2-final.md。

## 文件所有权
- 预计改：labor-market.mjs、finance-assets.mjs、新增 server-plugin/town-work.mjs 与测试。
- 不得改：world/economy、town-income.mjs、load-world.mjs、tests/helpers/town-income.mjs（TI1b 同时在做）；household-subsistence、water-cycle、npc-state、npc-schedule（K16 合并中）；food-supply、agriculture、shop、transport、advance-registry（TFB）；npc-autonomy（卡 C）。
- business.mjs、market.mjs 的接线归 I3。确需改动时只做最小接点，并在交接里列明。
