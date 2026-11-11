TI2 第四轮交接（F:/dnd-wt/TI2，未提交）
改动：labor-market.mjs（工位派生、统计就业/施工、恢复工坊缺货招工块）、finance-assets.mjs:440/448、town-work.mjs、business.mjs（serveStatistical/purchaseStatisticalInputs）、tests/town-work.test.mjs、docs/actions.json 重导。
第4点：workshop()/fixture() 每次 structuredClone(world)（helpers/finance.mjs:17），工位改动不泄漏。
第3点：已撤回 writeJob 的 `...row`；欠薪例改用真实签约+到岗得到的合同（工资30/分，再算480分=30文），断言未变。
第2点：purchaseStatisticalInputs 原写 customer_flow:<店>:<日>，会挡 serve() 的当日守卫（business.mjs:825）。改写独立键 `...:inputs:<source>`（:816），新增机制测试（正式 shop_bs_yanzhe 买 clay_cup，守卫键未写）。推进顺序未单独追查，修复使其与顺序无关。
第1点：第6例保留 loc_bs 反例；正向路径正式世界构造不出：统计组只在 loc_bs（world/economy/town-income.json:6），loc_bs 店 shop_bs_yanzhe（rules.json:1983）无木料/刻刀/陶轮/木炭，唯一木工台在 loc_hw 的 bld_hw_mill，而 loc_hw 店（rules.json:1898/1931）也不卖木料、刻刀；loc_bs 窑（station_bs_small_kiln）需陶轮与木炭、配方须先学（teachers 空）。缺内容留给 I3/内容管线。
测试：town-work 7/7；清单57：46过，7个与 f9c28825 同败（data-coverage、advance-registry、high-nobility、quest-sources、s3-finance-scenarios、w8e8-premises、s5-playthrough），ledger-price 超时（S7慢测），无新失败。
30日审计：8组工时/工钱/自营/帮工/购买均0，缺餐17412.5，与 t-town 逐组相同；性能 0.945/0.955/1.001，中位0.955。金快照、numeric-digest 与 t-town 一致。
