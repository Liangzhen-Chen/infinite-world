approve（复审后；附 3 条实施要求）

必改项
1. 送审文件不是修订版：F:/dnd-tmp/water/WATER-方案.md 共76行，无"修订记录"，修改时间 09:20，早于第一轮审查 09:32，内容仍是原稿（有 free 字段、第3步时间折钱、反向调用 freeHydrationAccess、"#11:252"）。注入、邻近阈值、固体水分 100/kg、第10项新期望都只出现在任务说明里，文件里没有。无法逐条验证"4 条必改项是否落实"，请把修订版落盘后复审。以下为按代码实证给出的结论，可直接并入修订。
2. 注册默认值要防"静默退化"（见二）。
3. "邻近"和"保守值"必须直接取现有数据，不得新写常数（见三）。
4. 固体水分的"够不够算水分"门槛要定（见四），否则面包与烙饼口径不一。
5. 第10项新期望要按下面第五节重推，付款额不能沿用旧值。

一、第一轮 4 项（按原稿）
- 循环依赖：原稿未处理，不成立。household-subsistence.mjs:8 已 import household-budget。
- 主观视图/memo：原稿未处理，不成立。
- 时间折钱分两步：原稿仍保留，不成立。
- #11 编号：原稿仍写"#11:252"，不成立。实际是第10项（s5-w4-economy.test.mjs:236），第11项在 :267（只有徐玲）。
- 合并建议（A 行为在前、B 数据在后）：原稿未体现。

二、注入方案
- 同类写法确有：household-budget.mjs:66-67 registerHouseholdFoodSources、:69-70 registerHouseholdFoodHabit，shop.mjs:323-324 注册。
- 时序：subsistence 顶部 import budget，所以 budget 先求值完，subsistence 在自己模块体里注册即可，方向正确。
- 风险：未注册时现有写法静默回退（来源默认 []，惯常性默认 rich），免费水若照抄，未注册就是 0，行为静默退回"全额买水"。subsistence 只被 npc-life、forest-water、water-cycle、sites、remote-generation 引入；只 import budget 的测试（food-habit、meal-cap、household-cache-equivalence 等）若不经引擎，将不扣免费水，也没有报错。要求：新增一条用例，断言引擎加载后注册函数存在；未注册时在预算读取处直接抛错而不是返回 0。

三、主观视图、邻近、memo
- subjective-view.mjs 没有任何水源事实，观察者看不到水体状态。"住处邻近水源为常识"是新增的知识建模。
- "邻近"若取 readJourney 的 near 分支（household-subsistence.mjs:220，往返分钟 ≤ rules.json:13273 的 nearWaterRoundTripMinutes=30）则是派生；若另写半径或分钟数，就是新常数，不通过。该值数据里自注"阈值待标定"，沿用即可，不自造。
- "保守值"必须说明用什么量：只能是现有量（如当日可取量上限取本户当日身体需求，或沿用 usableWater 门槛），不得写"取 0.5/一半"之类系数。主观路径若读客观 usableWater，等于让居民知道水质真相，违背"传闻与真相分离"，需写明不读水质、只读距离。
- memo：非主观路径键为 [resourceMemo,owner,days,risk,commonRisk,marketSubstitution]（household-budget.mjs:57 附近），主观路径完全不缓存（:263 `view?read()`）。免费水还依赖日期、季节路网封闭、水体状态；kernel 缓存按草稿 revision 失效，同一 revision 内状态不变，原则上够用；但 `d.memo` 回退分支的失效规则我没核到，需执行者确认，并把"水源签名"并入键或写明为何不需要。

四、B 提交：固体水分
- 100/kg 出处：item-class.mjs:202-210 注释与实现，= 参照水 item_water（weight 0.25、手写 hydration 25，含水 1）：25÷(0.25×1)=100，同时与 body.json:11 drinkGain 25 同值。是从世界里推出，不是新常数，与饮品水分同一口径。
- 但现有 drinkHydration 只对"食物且液态"（drinkLike）成立，且一份水分须 ≥ minHydrationShare×25=12.5（crafting.json:15 的 0.5）。固体要扩展就必须定门槛：面包 0.15kg×0.36×100=5.4，低于 12.5；若门槛只对液体生效，面包进来 5.4，会被买去补水分。烙饼 0.12kg 走配方（:233）继承水 25 的 .9/4≈5.6。须明确：固体沿用同一 12.5 门槛（面包与烙饼都为 0），或都不设。不要面包 5.4、烙饼 5。
- 含水率数据：已存在，不用新造，但只覆盖部分物品（mechanics/items.json 26 条 moistureFraction，material-props.json 43 条）。没有含水数据的食物保持 0（现行行为），应在清单里列出受影响的食物，不要默认补。
- 删牛乳手写 25：item_milk 重 0.5kg，含水 0.881（FDC 171265）。0.5×0.881×100=44.05，约 44（山羊乳 0.3×0.87×100=26 同法）。注意：牛乳 25→44 会让一杯牛乳提供近两份水，需检查依赖 item_milk 水分的测试。
- 次序：B 必须晚于 A。

五、测试
- 第10项（:236）新期望：徐玲一人 60 饱腹缺口，面包派生饱腹 16（R1 已手算 .15×173.2×.64≈16.6、取整 16），ceil(60÷16)=4，由 business.mjs wants 对每个维度 ceil(缺口÷gain)（:691-695）推出，不放宽。但货架只有 6 面包；陶枝一户两人（house_hw_06：陶枝+樊荣）、3 铜，会先问她的饱腹缺口：面包只剩 2、烙饼用于饱腹仍成立，不是为水分。她的数量与付款额取决于供需比，需按规律手算后写，不能把旧的"2 面包 2 铜 + 1 烙饼"原样搬。
- 第11项（:267）：夹具只有徐玲有钱，其余全 0（openShop coins）。徐玲住 bld_hw_riverhome，路线到 loc_hw 0.141km，单程 3 分钟，往返 6 ≤30，走 near 分支，水源是派生的 basin:loc_hw；渡口水池 feature_hw_pool 病原风险 35 不小于阈值 35，不可用（R1 已核，我确认距离，水体初始可用性仍按数据手读，约 90%）。结论：她有可达水源，第11项应改写为"有水源则不为水分买烙饼"，不需要另造水源。
- 陶枝：bld_hw_herbs 到 loc_hw 0.283km，单程 ceil(4.24)=5，往返 10 ≤30，同样 near 可达水。所以第10项里陶枝也有水源，她买烙饼只能是为饱腹，不能写成"为水分"。

六、特判
- 原稿无人物/物品/聚落/季节特判。修订版若加入"邻近"与"保守值"，须直接取 rules.json:13273 与现有量；这两处是目前唯一可能新增常数的地方。

## 复审（修订版 09:38，86 行）
原必改项 1-5 均已落实：第1项已落盘；注入未注册抛错并加测试；邻近只用 rules.json:13273 与 household-subsistence.mjs:220；固体门槛已定；第10项用运行时 ceil(60÷面包饱腹)，陶枝重推，第11项改写。

(1) 12.5 门槛：与 SATREV B3 相容，但要写清。出处是现有规则（item-class.mjs:181-182，crafting.json:15 的 minHydrationShare 0.5×参照水 25），不是新常数；"一份水分不够解渴不算水分"本就是该规则的语义，面包 5.4、烙饼约 5.6 都不到一口水的一半，含水 36% 只影响派生值，不要求它提供水分。风险：这等于把"面包含水 36%"的数据在行为上抹成 0，SATREV B3 的含水数据主要用于饱腹（干基能量），不冲突，但 B 提交说明里要写"含水率有数据而面包仍为 0 是门槛所致，不是缺数据"。烙饼 5→0 的连带：HEAD 上烙饼水分来自配方继承（item-class.mjs:233），B 提交后配方路径也要过门槛，需确认实现是改 :233 一带，而不是只改 base()；第10/11项期望已按"无水分"写（陶枝买烙饼只为饱腹），测试清单已列 ka1-overlay、item-class、s5-law-household-budget:420-433（该处"面包提供水分"前提会随之失效，要改为新规律）、meal-cap、food-habit。仍须补列：任何断言"烙饼/面包水分>0"的测试，请执行者 grep `hydration` 全测试目录一次列出。
(2) d.memo 回退"按 state 对象身份失效"：基本属实。read-scope.mjs:21-26 的 documentReader.memo 以 document.state、ledger、randomSeed 对象为键层级；valuation.mjs:44-49 的 stateReader.memo 走 stateMemo(state,...)。但这是读作用域内/只读快照内的缓存，不是跨 revision；同一 state 对象被原地改写时这两条不会自动失效，所以"水体同日变化后立即更新"（测试6）必须在 kernel 与 d.memo 两条路径各验一次，已列入。
(3) 未注册抛错的误炸面：经引擎的测试与工具（WorldEngine 导入链会加载 npc-life/household-subsistence，advance-registry 等也引入）不会炸。可能误炸：只 import household-budget 且自己传假引擎的路径。现状里 household-cache-equivalence、meal-cap 自行调用 registerHouseholdFoodSources 覆盖注册，说明测试会改注册表；新抛错点应只在"读取免费水时注册函数缺失"，且这些测试用的是真实 WorldEngine，会带上 subsistence，预计不炸。tools/audit-food-habit.mjs 只 import budget，但引擎由调用方传入，同样安全。建议：实施时先 grep 所有直接 import household-budget 的文件并逐个确认其引擎来源，列表附卡；抛错信息要点名缺失的注册项。

实施要求：a) B 提交说明写明"门槛而非缺数据"；b) 全测试 grep hydration 列受影响断言；c) 上述 import 清单。以上为实施项，不改变 approve。
