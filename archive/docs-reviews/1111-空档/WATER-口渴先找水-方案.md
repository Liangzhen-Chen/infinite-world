# 卡 WATER（修订版 R2）：营养缺口按真实来源采购——「口渴先找水」

代码基线：F:/dnd-wt/MKT（t-mkt，b7f2bb85），只读；未运行任何程序。一张规律卡、两个提交：**A（行为）先，B（数据）后**。

## 一、根因（经两轮审查核实）

- 免费取水只在每日生计路径：household-subsistence.mjs:284 `journey('water')`、:195-221 `readJourney`、:238 `usableWater`、:191 `sourceAccessible`、:619 `supplyHousehold`（午夜实取，npc-life.mjs:133-153 记为 sourceNutrition）。
- 采购路径看不见：household-budget.mjs:315 需求 = bodyDrain×24×预算天数，只减背包存量（:319 `allocateMeals`），无免费水项；business.mjs:686-703 `wants()` 各维度、每件货独立 ceil(缺口÷gain)，`serve`（:758）逐件下单，件与件不比较。
- 时序：正午客流（advanceCustomerFlow）先于午夜取水，正午预算看到整日水分缺口未补。徐玲（一人户，bld_hw_riverhome→loc_hw 0.141km，往返 6 分钟）缺口 3×24×1=72，纯派生；陶枝（bld_hw_herbs→loc_hw 0.283km，往返 10 分钟）同样可达。真正水源是派生的 basin:loc_hw（渡口水池病原风险 35 不小于阈值 35，不可用）；basin 初始可用性按数据手读，置信约 90%。
- 烙饼水分 5 来自配方派生（item-class.mjs:233），面包 0 来自基底（:206 一带），两套口径（提交 B 处理）。

## 二、提交 A：免费水从预算缺口扣除 + 店内采购与预算同序

**规律**：本户当日经 journey('water') 能取到水时，当日可取量计入水分供给，水分缺口只剩取不到的部分，剩余才买；取不到（禁、污染、结冰、干涸、超距、私有）则缺口原样。**只做这一件**，不做"钱+时间折钱"统一排序（时间已在家务工时里扣过，儿童/闲人无工资，重复计价；列范围外）。野食（journey 'food'）已在每日路径，不扩到本卡。

**口径定死**：
1. 扣减量 = 当日可取量 = min(当日水分缺口对应毫升, 水体可取量 `waterMl/waterResourceFactor`)，与午夜 `supplyHousehold`（:624-643）同一换算；**不按预算天数外推**：N 天预算里只有当日份由免费水覆盖，第 2…N 天水分缺口仍由存量/购买覆盖。
2. 只扣水分一维。

**A1 注入（防成环、防静默退化）**：household-subsistence.mjs:8 已 import household-budget，budget 不得反向 import。沿用 household-budget.mjs:66-70 `registerHouseholdFoodSources/Habit` 的写法与 shop.mjs:323-324 的注册位置风格：budget 增 `registerHouseholdFreeWater(fn)`；household-subsistence.mjs 在模块体内注册只读函数 `freeWaterAvailable(...)`（复用 `journey`、:627-640 的毫升↔水分换算）。budget 为单一入口 `const freeWater=(...a)=>{if(!registerHouseholdFreeWater.fn)throw Error('household free water not registered');return registerHouseholdFreeWater.fn(...a);}`：**未注册直接抛错，不得回退为 0**（现有 foodSources 的静默回退 [] 正是审查指出的风险）。测试：只 import budget 的单测须经引擎加载或显式注册，新增用例"引擎加载后注册函数存在；未注册时 readHouseholdResources 抛错"。
不抽第三模块：journey 依赖 sources/ecology 注入（:23），搬出代价大。

**A2 主观路径（居民知道什么）**：subjective-view.mjs 里没有任何水源事实，观察者看不到水体状态，所以：
- 非主观（kernel，view 为空）：调用真实 `journey('water')`（含 `usableWater` 水质门槛），与午夜取水一致。
- 主观（有 view，客流用 `{view}`，business.mjs:788）：**不读水质、不读水量真相**。居民只凭"住处步行往返分钟 ≤ rules.json:13273 `nearWaterRoundTripMinutes`（=30）"即 household-subsistence.mjs:220 的 near 分支来知道"家门口有水可取"——这是距离事实，取自路网，不自写半径、不新增常数（数据自注"阈值待标定"，沿用）。满足 near 才扣；不满足 near（远处水源）主观路径一律不扣，只买。
- "保守值"取量：主观扣减量 = min(本户当日水分缺口, 无)，即**最多扣当日缺口本身，不超过缺口**，不引入系数、不读 waterMl。若实际取不到（如水被污染），差额由午夜实取记入 shortfall，次日预算会按真实记录（meals 记录、身体水分）反映，不在主观读里预知。
- 主观路径仍保持"不缓存"（:263 `view?read():…`）。

**A3 缓存键与失效（读代码核清）**：
- 非主观：`budgetRead`（household-budget.mjs:49-62）键 [resourceMemo,owner,days,risk,commonRisk,marketSubstitution]；游标读按 `d.cursor.revision` 失效，任何写入（含水体、日期变化）都换 revision，同一 revision 内状态不变，免费水读取无需另键。**但**免费水读取里调用的 `journey` 本身带 memo（household-subsistence.mjs:121-139），其键已含 home、kind、day、`waterSignature`（各水源可用性）、stockKey，输入沿用 `waterJourneyInputs`；新读取函数不另建缓存，只复用这套，把"home、day、成员集合"并入调用键。
- `d.memo` 回退分支（:51，游标不匹配时）：实际实现有两种——read-scope.mjs:21-26 的 `documentReader.memo` 按 `document.state`、`document.ledger`、`randomSeed` 三者对象身份分键，valuation.mjs:44-49 的 `stateReader.memo` 经 `stateMemo(state,…)` 按 state 对象身份。state 以不可变补丁更新，水体/日期变化必产生新 state 对象，旧键自动失效；键里加 owner/day 与 home 即可，不会读到旧水体。
- 回归测试：同日把水体置为不可用（污染/结冰）后再读，非主观免费水立即为 0。

**A4 wants() 与预算同序（SATREV B1）**：business.mjs:686-703 `wants()` 不再逐件独立估量，改读 `budget.resources.market.purchases`（household-budget.mjs:341-378，已按"有效覆盖÷价格"、现金、供货、单餐额度排序）：某件货要不要买、买几件以购买计划里该货数量为准；serve 的报价、路程、决策不变；severity 仍为 100。注意：青灯酒馆货架无清水，B1 不是徐玲的根因，是独立次要规律，同提交处理以免两处口径。

## 三、提交 B（晚于 A）：固体水分统一派生

**问题 C1**：无配方固体水分恒 0（item-class.mjs 基底路径），有配方的继承原料水分（:233）；面包 0 / 烙饼 5 不自洽。先做 B 不做 A，面包也会因水分被买，所以 **B 必须晚于 A**。
**公式**：水分 = 重量(kg) × 含水率 × 每公斤水的水分值；每公斤水值 = 参照水 item_water hydration÷(weight×含水率) = 25÷(0.25×1) = **100/kg**（与 item-class.mjs:202-210 `drinkHydration` 同一口径，与 body.json:11 drinkGain 25 同值，从世界推出，不是新常数）。含水率取 `materialProps.moisture`。
**门槛统一**：现有液体需 h ≥ `drinkMin`（= minHydrationShare 0.5 × 25 = 12.5，item-class.mjs:181-182，crafting.json）才给水分。规则：**固体与液体同用这一 12.5 门槛**。结果：面包 0.15×0.36×100=5.4 < 12.5 → 0；烙饼配方继承 25×0.9/4≈5.6 < 12.5 → 0（有配方物品同样过同一门槛）；这样面包与烙饼口径一致，都不提供水分，不再出现"5.4 对 5"。含水量够的（牛乳、羊乳、汤、鲜果类）派生后过门槛。
**缺含水率数据**：含水率仅覆盖部分物品（mechanics/items.json 26 条 moistureFraction、material-props.json 43 条）。无含水数据的食物**保持水分 0（现行行为）**，不为它们新造逐物品数字；实施时由执行者生成"无含水率数据的食物清单"附在卡里，供后续补数据。
**C2**：删牛乳手写 `hydration:25`（world/meta/items.json），派生 0.5×0.881×100≈**44**（山羊乳 0.3×0.87×100≈26 同法）。牛乳一杯水分近两份水，需检查依赖 item_milk 水分的测试。
**波及**：ka1-overlay（盘上营养与运行时比对）、item-class 派生测试、s5-law-household-budget（:420-433 面包水分前提）、meal-cap、food-habit、s5-02（:50 注释 ceil(70/30) 陈旧）、a2-dialogue 面包价链。饱腹值随 SATREV 公式变（面包 30→16、薄饼 30→12、牛乳 22 等），与 A 的期望同批改。逐个判断是"规律合理后果"还是"回归"，不批量放宽。

## 四、新不变量测试

1. 有可达可用水源（非主观）、其余营养已满：遍历 `world.items` 中 `nutrition.hydration>0` 的物品，`wants`=0，客流不成交。
2. 主观读：仅 near 分支（往返≤nearWaterRoundTripMinutes）才扣；远处水源不扣；不读水质。
3. 水源不可用（结冰/污染/毒素/超距/私有）：同居民会买水分来源，选预算次序里"有效覆盖÷价"最高者；无水源地区同理。
4. 水量只够部分缺口：免费覆盖=可取量折算；预算免费水 ≤ 午夜 `supplyHousehold` 实取水。
5. 多日预算：免费水只扣当日份，第 2…N 天仍有水分缺口。
6. 缓存：同日水体变化后免费水立即更新（kernel 与 d.memo 回退两条路径）。
7. 注册存在：引擎加载后注册函数存在；未注册时读取抛错。
8. 店内成交件集合 ⊆ 预算 `market.purchases`。
9. 确定性不变；不加旧档兼容标记。

## 五、现有测试期望怎么改（从规律推出，不放宽）

- **s5-w4-economy 第 10 项（:236 起）**：云上失败是徐玲买 4 面包付 5 + 4 烙饼付 9。新规律：徐玲往返 6 分钟、有可达水源，水分缺口 72 被免费水扣光；仅剩饱腹缺口 60，只买面包。A 提交后（B 前）面包饱腹以当时引擎值为准；B 后面包饱腹 16，**数量 = ceil(60÷16)=4**（用运行时 `ceil(缺口÷引擎面包饱腹)` 写，不写死），无烙饼，付款额按现价手算（面包单价逐件的和，从客流记录核对，不沿用旧的 5+9）。货架只有 6 面包：徐玲先买 4，余 2；**陶枝**（house_hw_06 一户两人：陶枝+樊荣，3 铜，往返 10 分钟有可达水源）水分同样被免费水扣光，只剩饱腹缺口（两人 120），面包余 2、烙饼用于饱腹仍成立；她的数量与付款额取决于余量与现金上限，需按规律手算后写（2 面包按面包价，剩余现金再按预算次序买烙饼若买得起），**不得照搬旧的"2 面包 2 铜 + 1 烙饼"**，也不得写成"为水分买"。数量由 wants 读预算购买计划得出（A4）。
- **第 11 项（:267 起，断言 :289-295）**：夹具只有徐玲有钱。改写为：徐玲有可达水源，**不为水分买烙饼**；钱袋 = 初始钱 − 客流记录里的实付（从记录读，不写死）；删去"烙饼带水分>0 所以她买"的前提断言（B 后烙饼本就过不了 12.5 门槛，水分为 0）。若要保留"缺水才买含水食物"的覆盖，用真实游戏动作（污染水源）造出无水场景，不为测试加接口。
- a1-lt-scenarios：无营养引用；HEAD 上本就失败 2 项（L4 刀/镐，非营养），与本卡无关。
- 其余：household-food-sources-traders、food-sources-memo、household-cache-equivalence、s5-law-periodic-market、s5-law-water-source、forest-water/draw-water；水分类需求下降引起的价格快照偏移逐个判断。

## 六、风险与范围外

- 性能：预算读取高频，免费水读复用 `journey`/`waterSignature` memo；K16 性能线 PERF_MAX 1.35 需复核。
- 主观路径只按距离扣，若水实际不可用，当日会有短缺，次日按真实记录修正（真实，不粉饰）。
- 午夜取水与预算免费水重复扣减：测试 4 守住。
- 范围外：时间折钱统一代价、野食觅食扩展、供需价格期望批量改写（单列清单）。

## 修订记录

第一轮审查：
1. 循环依赖：采纳，A1 注入（沿 budget:66-70、shop.mjs:323-324），不抽第三模块并说明理由。
2. 主观视图与 memo：采纳，A2、A3 写明；R2 进一步要求的"不读水质、只用距离"见 R2-b。
3. 收窄范围、多日口径：采纳，删统一代价第 2/3 步；多日定为只扣当日份。
4. 测试编号：采纳，更正为第 10 项（:236）与第 11 项（:267，断言 :289-295），新期望见第五节。
5. 合并建议：采纳，一卡两提交，A（免费水+wants 同序）在前，B（含水率统一派生+删牛乳手写）在后。
6. 小问题：forest-water.mjs:199 只是 item_water 价格分支、waterResourceFactor 本体在 water-cycle.mjs:161；"野食满足接口"删除；a1-lt 写为 HEAD 上有 2 项非营养失败。

第二轮审查：
a. 注入：采纳，沿用既有写法，未注册抛错（不静默为 0），加"注册存在"与"未注册抛错"测试。
b. 邻近与保守值：采纳，邻近只用 rules.json:13273 nearWaterRoundTripMinutes 与 household-subsistence.mjs:220 near 分支；主观扣减量不超过当日缺口本身，不用系数；主观不读水质/水量，只读路网距离；非主观缓存键、`d.memo` 回退（read-scope.mjs:21-26 与 valuation.mjs:44-49 按 state 对象身份失效）已核清。
c. B 提交：采纳，水分=含水率×100/kg（item-class.mjs:202-210），固体与液体同用 12.5 门槛（面包与烙饼都为 0），缺含水率数据保持 0 并列清单，牛乳派生约 44。
d. 第 10 项：采纳，ceil(60÷16)=4 且用运行时表达式；陶枝（两人、3 铜、往返 10 分钟）按规律重推、不照搬旧值；第 11 项按徐玲有水源改写。
e. 送审文件未落盘：已落盘（见汇报中的 ls 与 grep 输出）。
