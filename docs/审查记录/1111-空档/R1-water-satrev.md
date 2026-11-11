结论：changes（根因与方向成立，关键前提实证成立；但方案有 4 处必须修改）

审查范围：只读 F:/dnd-wt/MKT（b7f2bb85）与云上 .out，未运行任何代码；数值手算。

## 一、关键前提：徐玲家有没有可达免费水（逐条 2）
**有。** 方案出发点成立，不需要改成"买含水食物本就合理"。
- 住处 bld_hw_riverhome（world/people/baseline.json:1966-1977、households.json:25-28，一人户，钱 200，无存粮），路线 route_bld_hw_riverhome 连 loc_hw，0.141km（geo/routes.json:45-57）。
- loc_hw 是农业聚落（meta/rules.json:5589 起 agriculture.settlements 含 loc_hw），且无 kind=water 的 feature，water-cycle.mjs:30-39 因此为它派生出 basin:loc_hw（容量 5e8mL、initialShare .8，rules.json:74-75，污染皆 0）。步行单程 ceil(.141×60/4)=3 分钟，往返 6 ≤ nearWaterRoundTripMinutes 30（rules.json:13273）→ household-subsistence.mjs:220 走 near 分支；loc_hw 无 owner（locations.json:3-9），sourceAccessible 通过。
- 渡口 feature_hw_pool（locations.json:499）反而不可用：pathogenRisk 35 不小于 diseaseThreshold 35（rules.json:93，usableWater :242 用严格小于）。所以真正的水源是派生出的 basin，不是那个水池。我没跑引擎，"basin 初始可用"依据数据手读，置信约 90%。
- "缺口 72"构成：drainPerHour.light 3（body.json:11）×24h×预算 1 天，一人户，背包无水；饱腹同理 2.5×24=60（测试注释一致）。纯派生，无储备放大。
- 时序细节：第一天正午客流先于午夜取水（advanceCustomerFlow 在 NOON，supplyHousehold 在日结），所以预算看到整日水分缺口未被补；稳态下同理。方案要在文档里写明这点。
- 注意编号：云上失败的是 s5-w4-economy 文件第 10 项（236 行起，徐玲买 4 面包付 5 + 4 烙饼付 9，tap:73-100），不是 #11；第 11 项（270 行起）在 batch-1111c 通过。方案写的"#11:252"实为第 10 项，须更正。

## 二、WATER 逐条
1. 根因：**成立**。readHouseholdResources 需求 :315（bodyDrain×24×天数）只减背包存量（allocateMeals :192-214、:319），无免费水项；wants() business.mjs:686-703 各维度独立 ceil(缺口÷gain)；serve :758 对货架逐件调用 wants（:778），无跨件比较；午夜取水 supplyHousehold :619-644、npc-life.mjs:133-153。行号全部核对准确，仅 forest-water.mjs:199 是 item_water 的价格分支，waterResourceFactor 本体不在此行（小问题）。
2. 整类性：**大部分成立**。无人物/物品/聚落特判，数据全派生。但"野食满足接口"含糊：野食已在 A 路径（journey 'food'），不要在本卡扩到觅食。
3. 改动点：**过度**。最小做法是在 :315 把 hydration 需求减去"本户 journey('water') 非空时当日可取量"，其余（独立 free 字段、第 3 步按"钱+时间×机会成本"统一排序）不需要：免费来源钱为 0，时间已在 householdLaborBudget/家务工时里扣过，再折钱是重复计价，且儿童/闲人没有工资（方案自己也承认）。

### 必须修改项
1. **循环依赖未提**：household-subsistence.mjs:8 已 import household-budget；方案让 budget 反向调用 subsistence 的 freeHydrationAccess，会成环。须定方案（如沿 :23 ecology 的注入写法，或把"水源可达与可取量"原语放第三方模块）。
2. **主观视图与缓存**：readHouseholdResources 有 view（主观）分支（:268-270、:315 explainDerived 带 observer），serve 里实际用 `{view}`（business.mjs:788）。免费水读取必须说明居民"知道什么"（本户住处邻近水源可视为常识，远处水源不是）；并声明 memo 依赖输入（沿 waterSignatureInputs），否则复发 M27REG 那类旧值问题。
3. **时间折钱分两步的未决项直接定掉**：建议只做"journey('water') 可达即扣可取量"，删去第 2/3 步；"多日储备怎么算"（风险 4）也要在方案阶段定：按当日可取量，不按天数外推。
4. **#11 引用更正**为第 10 项（236 行；:252 的 E=陶枝买烙饼那一笔是否变，取决于陶枝家是否有水源，方案只能说"可能"，不要断言）；并补一条：断言 :289-295（第 11 项）当前通过，规律落地后同样要按新规律重写，而不是保留"徐玲因水分买烙饼"的前提断言。

## 三、SATREV 抽查（逐条 4，手算复核）
- 面包 30→16：moistureFraction .36、kcal 266（mechanics/items.json:917-926）→ E=2660/.64/24=173.2，饱腹=.15×173.2×.64=16.6，ρ=2.66，系数 .9985 → floor **16**；无产出配方，水分 0。**成立**。
- 薄饼 30→12、水分 0→5：燕麦粉由 recipe_mill_oats（1 燕麦→1 粉，recipes.json:97-110）派生约 53.9；烙饼配方一炉 4 个（:123-165），含燃料→损耗 .9：(53.9)×.9/4=12.1，ρ=2.43，系数 1.034 → **12**；水分=25×.9/4=5.6 → **5**。**成立**（SATREV 写燕麦粉 .5kg 有误，粉是 0.4kg，但中间值落在同一结果）。基线手写 {satiety:30} 整条照用（旧代码 :176），故水分 0；**成立**。
- 牛乳：饱腹 .5×213.6×.119=12.7，ρ=.61，系数 1.773 → **22**；水分手写 25（items.json 只写 hydration），按派生 .5×.881×100=44，C2 **成立**。
- 山羊乳 8→14、水分 26：.3×221×.13=8.6，系数 1.69 → 14；水分 .3×.87×100=26≥12.5 → drinkable 由规则给，**成立**。干粮 30→26（系数 .887）、野食 15→17 同样成立。
- C1 两套口径（item-class.mjs:206 与 :233）：**部分成立**——不是同一物品两个数互冲，而是"无配方固体食物水分恒 0、有配方的继承"，造成面包 0 / 薄饼 5 的不自洽；属规律缺口，说法可保留，但 SATREV 把它称"公式问题"偏重。
- B1：机制**成立**（wants 逐件独立、货架循环不比较）；但举例**不成立**：青灯酒馆货架 restock 只有面包、烙饼、口粮（meta/rules.json:1918-1930），**没有清水**，所以徐玲场景里并不存在"1 铜 25 水分的更便宜替代品"。B1 只在某店同时卖水与含水食物时才显现，是独立的次要规律，不是本问题根因。
- 逐条 5：ka1-overlay 山羊乳——m27-17 失败 2 项，b1m-1 为 0，batch-1111c 为 4 通过 0 失败（b7f2bb85 已修）：**已修，核实**。s3-finance 48≠96——云上 m27-17 确有（tap:18-23）；M27REG f6c5cb8c（只读作用域记录索引，storage.mjs）已是 HEAD 祖先（merge-base 验证），但 batch-1111c 未含 s3-finance，**HEAD 上尚未云上复验**，应标"已修待复验"而非"待查"。
- 其余：SATREV 提到的 a2-dialogue 面包价链失败、s5-02:50 陈旧注释（ceil(70/30)）属实；a1-lt-scenarios 在 HEAD 仍失败 2 项（L4 刀/镐，非营养相关，与基线共有），WATER 写"预期不受影响"成立，但不要写成"无失败"。

## 四、两文档是否合并（逐条 6）
应合并为**一张规律层卡**「营养缺口按真实来源统一采购」，两个提交、同一批测试期望：
- 提交 A（行为）：WATER 精简版（免费水从预算缺口扣除）+ B2（同一件事）+ B1 的做法：wants() 不再逐件独立下单，改读预算 market.purchases 的"每铜有效覆盖"次序（household-budget.mjs:341-378 已有），店内与预算同一口径。
- 提交 B（数据）：B3+C1+C2——食物水分按含水率成类派生（有配方、无配方统一），删牛乳手写 25；**必须晚于 A**，否则面包也会因水分被买（面包 0→约 5）。
- 范围外：时间折钱、野食觅食扩展、供需价格测试期望的批量改写（单列清单、逐个判断是合理后果还是回归）。
- 验收：不变量测试照方案第四节，另加"无水源时仍买水分来源"与"预算免费水≤午夜实取水"。
