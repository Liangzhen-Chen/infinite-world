# 04 · EVE Online：用一套类型与属性搭起市场、工业、物流、主权

> 统一底层调研第 4 篇。只借鉴系统设计，世界背景照 infinite-world 自己的。
> 资料来源以 CCP 官方开发者文档、CCP 新闻/开发博客、EVE University wiki 为主，玩家媒体（Imperium News、EN24、TAGN、Nosy Gamer）只用来补官方图表没给出文字的数字。所有结论均附链接；凡是来源页自己标注"过期"或"不一致"的地方，正文照实写出。
> 调研日期：2026-11-13。

## 目录

1. 摘要
2. 统一维度：类型树 + 属性（dogma）
   - 2.1 type → group → category
   - 2.2 dogma attributes：每个类型挂一组数值
   - 2.3 dogma effects 与 modifierInfo：行为是"读属性、改属性"的规则
   - 2.4 叠加惩罚：同一属性多次修正的通用衰减
   - 2.5 工业、地图、市场怎样挂在 typeID 上
3. 市场：区域订单簿
   - 3.1 结构：区域 × 站点 × 买卖单
   - 3.2 费用：销售税、经纪费、改单费（公式与数值）
   - 3.3 远程交易与可见范围：技能把"距离"变成参数
   - 3.4 贸易枢纽的涌现与规模
   - 3.5 市场与类型系统的接口
4. 蓝图与材料链
   - 4.1 蓝图是一种类型；材料效率/时间效率是蓝图上的属性
   - 4.2 多级链：矿石 → 矿物 → 部件 → 成品；反应、行星工业、发明
   - 4.3 工作费用：系统成本指数（活动越密越贵）
   - 4.4 精炼产率公式与税
   - 4.5 行星工业 P0–P4 与海关税
5. 物流与安全等级
   - 5.1 安全等级是星系的一个数值字段，所有规则都从它派生
   - 5.2 CONCORD 响应时间与自杀式打劫的经济学
   - 5.3 运输合同、抵押、第三方货运
   - 5.4 保险：按建造材料估值的线性保单
   - 5.5 资产安全与结构损毁
6. 主权与联盟
   - 6.1 公司—联盟—主权的归属链
   - 6.2 主权中枢、ADM、脆弱窗口、争夺流程
   - 6.3 Equinox：电力、劳动力、试剂——把星球属性接进主权升级
   - 6.4 租借：没有机制，是玩家合同
   - 6.5 Upwell 结构：玩家自建的"站点"，业主自定税率
7. 税收全表：谁收、流向哪里
8. 月度经济报告（MER）：指标体系与货币守恒
   - 8.1 指标清单
   - 8.2 水龙头与下水道的分类
   - 8.3 量级核对（本机草算）
   - 8.4 MER 的已知数据问题
9. 全部系统清单（供"成熟游戏系统总表"对照）
10. 哪些仍是专项脚本 / 局限
11. 对 infinite-world 的启示
12. 参考链接清单

---

## 1. 摘要

EVE 的所有系统共用一个对象模型：**每个"东西"是一个 type（typeID）**，type 属于 group，group 属于 category；每个 type 挂一组 **dogma 属性**（attributeID → 数值）和一组 **dogma 效果**（effectID）。效果本身不含数字，只是一条规则："从 A 属性读值，用某种运算（加、乘、后百分比……）改某个目标上的 B 属性"。船、模块、弹药、蓝图、矿石、技能、甲板、乃至星系环境效果，都是这同一套结构。[SDE 表说明](https://wiki.eveuniversity.org/Static_Data_Export)、[ESI dogma 文档](https://docs.esi.evetech.net/docs/dogma.html)

市场、工业、物流、主权四个系统**不各自定义"物品"**，而是都引用 typeID：市场订单的标的是 typeID；蓝图的活动表把 typeID（蓝图）映射到 materialTypeID 与 productTypeID；精炼表 invTypeMaterials 把 typeID 映射到矿物 typeID；地图表给每个星系一个 `security` 浮点数，所有安全等级规则（CONCORD 响应、泡泡能否部署、资源富度、任务奖励）都从这个字段派生；主权中枢、天钩、升级件也都是 type。[SDE 表说明](https://wiki.eveuniversity.org/Static_Data_Export)、[星系安全](https://wiki.eveuniversity.org/System_security)

货币守恒靠"水龙头 / 下水道"显式记账：NPC 赏金、NPC 收购的商品、入侵奖励、保险赔付是 ISK 的凭空产生；销售税、经纪费、技能书、NPC 蓝图原件、工业税、克隆费、行星出口税等是 ISK 的凭空消失。玩家之间的交易（订单成交、合同、Upwell 业主收取的那部分费用）只是转移，不计入。CCP 每月公开这套表（Monthly Economic Report），并给出货币供应、流速、生产/销毁/开采价值、区域贸易平衡与价格指数。[MER 2024-12](https://www.eveonline.com/news/view/monthly-economic-report-december-2024)

本机草算核对的几个量级（见 8.3）：2025 年月均销毁约 47.5 万亿 ISK，约等于货币供应（2,614 万亿）的 1.8%/月；玩家月支出约 1,116 万亿，月流速约 0.43；2019 年经纪费单项下水道约 10 万亿/月，相当于当月销毁值的四分之一。

局限：EVE 的"统一"在**数据层**非常彻底，但有不少行为仍是服务器代码写死（CONCORD 响应时间表、ESS 40% 分流、保险 40% 底、资产安全 0.5%/15% 等不是 dogma 属性）；而且它只统一"物"，不统一"人"——角色、公司、联盟、声望是另一套实体，没有 type/attribute 化。租借、联军、外交全靠玩家合同与 OOG 协议，游戏内只有"站位（standings）"一个数轴。

---

## 2. 统一维度：类型树 + 属性（dogma）

### 2.1 type → group → category

EVE 静态数据导出（SDE）的物品层级是三层：

| 表 | 主键 | 关键字段 | 作用 |
|---|---|---|---|
| invCategories | categoryID | categoryName, published | 顶层分类（船、模块、弹药、蓝图、技能、天体……） |
| invGroups | groupID | categoryID, groupName, anchored, anchorable, fittableNonSingleton, useBasePrice | 中层分组（巡洋舰、激光炮、矿石……），每组指向一个 category |
| invTypes | typeID | groupID, typeName, mass, volume, capacity, portionSize, raceID, basePrice, marketGroupID, published | 每一种具体物品一行；几乎所有其他表都引用 typeID |

链条是 type → group → category。[EVE Uni · SDE](https://wiki.eveuniversity.org/Static_Data_Export)

2025-09-22 CCP 重做了 SDE：改为从客户端数据用一张"映射文件"生成，随每次 Tranquility 部署自动构建；格式增加 JSON Lines；删掉 bsd/universe 目录，地图数据并入 map 文件；types 拆出 masteries 与 typeBonus；新增 agentTypes、dbuffCollections、dogmaUnits、dynamicItemAttributes；nameID 字段改为 name。官方说明新版**不向后兼容**，schema 变更写在 `schema-changelog.yaml`。[CCP 开发者博客 · Reworking the SDE](https://developers.eveonline.com/blog/reworking-the-sde-a-fresh-start-for-static-data)、[CCP 静态数据页](https://developers.eveonline.com/docs/services/static-data/)

> 对我们的含义：类型树只是分类，不承载行为；行为全在属性和效果上（下两节）。这是 EVE 能让一张市场表、一张蓝图表、一张精炼表同时服务几万种物品的前提。

### 2.2 dogma attributes：每个类型挂一组数值

| 表 | 字段 | 说明 |
|---|---|---|
| dgmAttributeTypes | attributeID, attributeName, displayName, defaultValue, unitID, **stackable**, highIsGood, published, categoryID | 定义每一种属性是什么（如 37:maxVelocity），缺省值、单位、是否受叠加惩罚、高好还是低好 |
| dgmTypeAttributes | typeID, attributeID, valueInt / valueFloat | 给每个类型赋值。一个巡洋舰几十行，一个模块十几行 |
| dgmAttributeCategories | categoryID, categoryName | 属性的分类（仅用于展示） |

[EVE Uni · SDE](https://wiki.eveuniversity.org/Static_Data_Export)

要点：

- **属性是开放集合**，新增一种能力就是新增一行 dgmAttributeTypes，再给相关 type 赋值；不需要改任何系统的代码路径。
- **`stackable` 是属性级元数据**，决定该属性在多次被百分比修正时是否衰减（2.4 节）。
- 旧版 SDE 还把 `mass/volume/capacity/portionSize/basePrice` 直接放在 invTypes 上，这些是所有类型都有的"硬字段"；其余能力一律走 dogma。市场用 volume（运输体积）、精炼用 portionSize（每批数量），都读这些字段。

### 2.3 dogma effects 与 modifierInfo：行为是"读属性、改属性"的规则

| 表 | 字段 | 说明 |
|---|---|---|
| dgmEffects | effectID, effectName, isOffensive, isAssistance, isWarpSafe, disallowAutoRepeat, durationAttributeID, rangeAttributeID, falloffAttributeID, dischargeAttributeID, trackingSpeedAttributeID, **modifierInfo** | 定义效果。注意 duration/range/falloff/discharge/tracking 都不是数字，而是**指向某个 attributeID**，由具体 type 的属性值决定 |
| dgmTypeEffects | typeID, effectID, isDefault | 类型 ↔ 效果多对多 |

[EVE Uni · SDE](https://wiki.eveuniversity.org/Static_Data_Export)

一个修正器（modifier）需要五样信息：来源属性、目标位置（domain）、目标属性、运算、可选过滤器。官方 ESI 文档用停滞网（Stasis Web II）举例：来源属性 `20:speedFactor = -60`，目标是当前锁定目标，目标属性 `37:maxVelocity`，运算 PostPercent。PostPercent 的换算是 `val/100 + 1`，即 ×0.4；对一艘 348 m/s 的船，348 × 0.4 = 139.2 m/s。[ESI · Dogma](https://docs.esi.evetech.net/docs/dogma.html)

新式写法把修正器存成 `modifierInfo`（YAML）。官方示例（shipModeMaxTargetRangePostDiv 效果）：

```yaml
- domain: shipID            # 目标：自己的船
  func: ItemModifier        # 直接属性→属性；LocationGroupModifier 则带分组过滤
  modifiedAttributeID: 76   # 被改的属性
  modifyingAttributeID: 1991 # 用哪个属性的值去改
  operator: 5               # 5 = PostDiv
```

[ESI · Dogma](https://docs.esi.evetech.net/docs/dogma.html)

过滤器的例子：盾增幅器 II 的效果用 splice 拼出两条修正器，各带一个"需要某技能"的过滤（Capital Shield Operation / Shield Operation），实现"只增强用这类技能的模块"。这就是 EVE 不写"盾增幅器只影响盾回充模块"这类特判、而是用**过滤器参数**表达的做法。[ESI · Dogma](https://docs.esi.evetech.net/docs/dogma.html)

官方文档也说清了边界：旧的表达式树（preExpression/postExpression）仍在，激活与解除不总是镜像（如护甲修复器会改船的状态）；`modifierInfo` 当时还"相对新"，没有任何投射类效果用它；完整的 operator 与 func 枚举文档里没给，要看 EOS 等第三方拟合器常量。[ESI · Dogma](https://docs.esi.evetech.net/docs/dogma.html)

> 对我们的含义：**行为 = 属性 + 规则表**。一个"效果"不含数字；数字在类型的属性上。同一条效果可以被几十种不同类型复用，各自读自己的属性值。这正是 infinite-world"不准硬编码"红线想要的结构。

### 2.4 叠加惩罚：同一属性多次修正的通用衰减

所有标记为 stackable=受罚的属性，多个百分比修正按强度降序逐个施加，第 n 个乘以 `S(n−1) = exp(−((n−1)/2.67)²)`：

| 第几个 | 有效比例 |
|---|---|
| 1 | 100% |
| 2 | 86.9% |
| 3 | 57.1% |
| 4 | 28.3% |
| 5 | 10.6% |
| 6 | 3.0% |

正负修正分开计算；绝对值（非百分比）修正不受罚。受罚的典型属性：各类抗性、盾/甲修复量、感应强度、锁定距离、信号半径、速度/惯性/质量、武器伤害与追踪、最佳/衰减射程、无人机伤害、跃迁干扰与停滞网。不受罚的：功率/CPU/货柜、电容容量与回充、各层 HP、采矿产量、无人机控制距离。本机复算与 wiki 表一致（见 8.3 脚本）。[EVE Uni · Stacking penalties](https://wiki.eveuniversity.org/Stacking_penalties)

> 这是一条**写在属性元数据上的通用规律**，而不是每个模块一条特判。它让"堆同一类东西"自然边际递减，是防止数值膨胀的通用手段。

### 2.5 工业、地图、市场怎样挂在 typeID 上

| 系统 | SDE 表 | 外键 |
|---|---|---|
| 蓝图 | industryBlueprints(typeID, maxProductionLimit) | 蓝图本身是 type |
| 活动 | industryActivity(typeID, activityID, time) | activityID 来自 ramActivities（制造、复制、研究 ME/TE、发明=8、反应……） |
| 材料 | industryActivityMaterials(typeID, activityID, materialTypeID, quantity) | 材料也是 type |
| 产物 | industryActivityProducts(typeID, activityID, productTypeID, quantity) | 产物也是 type |
| 发明概率 | industryActivityProbabilities(typeID, activityID, productTypeID, probability) | |
| 技能需求 | industryActivitySkills(typeID, activityID, skillID, level) | 技能也是 type |
| 精炼 | invTypeMaterials(typeID, materialTypeID, quantity) | 矿石 → 矿物 |
| 行星工业 | planetSchematics, planetSchematicsTypeMap, planetSchematicsPinMap | 配方与建筑类型 |
| 地图 | mapSolarSystems(solarSystemID, regionID, constellationID, factionID, **security**, securityClass, sunTypeID, …) | 星系安全等级与恒星类型 |
| 天体 | mapDenormalize(itemID, typeID, groupID, solarSystemID, …) | 行星/卫星也是 type |
| 市场分类 | invMarketGroups；invTypes.marketGroupID | 市场树独立于 group 树 |
| 站点 | staStations, staServices, ramAssemblyLineTypes, ramAssemblyLineStations | 哪些站能做哪些活动 |

[EVE Uni · SDE](https://wiki.eveuniversity.org/Static_Data_Export)

注意两点：
1. **市场分组树（marketGroup）与分类树（group/category）是两棵不同的树**。前者服务于玩家浏览，后者服务于规则。一个 type 同时挂在两棵树上。
2. **恒星类型、行星类型也是 type**，Equinox 之后主权升级件的电力产出直接读恒星属性（6.3 节）。这就是"世界环境也走同一套属性"的实例。

---

## 3. 市场：区域订单簿

### 3.1 结构：区域 × 站点 × 买卖单

- 市场是一张自动匹配的买单/卖单列表。**每个区域（region）一个市场**；该区域内每个 NPC 站点、每个装了市场服务模块的 Upwell 结构都能访问这张表。[EVE Uni · Trading](https://wiki.eveuniversity.org/Trading)
- 订单可以部分成交，详情页显示实际成交价与成交量历史。[EVE Uni · Market](https://wiki.eveuniversity.org/Market)
- 订单数量上限是技能参数：无技能 5 单；Trade +4/级、Retail +8/级、Wholesale +16/级、Tycoon +32/级，四项满级 305 单。[EVE Uni · Trading](https://wiki.eveuniversity.org/Trading)
- 来源页没有写撮合优先级（价格—时间）与托管（escrow）细节，这里不臆断。[EVE Uni · Market](https://wiki.eveuniversity.org/Market)

### 3.2 费用：销售税、经纪费、改单费

**销售税（Sales / Transaction tax）**，归 NPC 公司 SCC（纯下水道）：

```
销售税% = 7.5% × (1 − 0.11 × Accounting 等级)      # 基准 7.5%（22.02 版从 4% 上调，2025-03）
满级 ≈ 3.375%
```

**NPC 站点经纪费**（挂非即时单时收取，取消/过期不退，最低 100 ISK）：

```
经纪费% = 3% − 0.3% × Broker Relations 等级 − 0.03% × 派系站位 − 0.02% × 公司站位
Broker Relations V → 1.5%；再加满站位（10/10）→ 约 1.0%
```

**Upwell 结构经纪费**：`0.5%（SCC 附加，下水道） + 业主自定%（可为 0，归玩家）`，技能不影响。

**改单费**：
```
改单费 = (100% − (50% + 6% × Advanced Broker Relations 等级)) × 经纪费% × 新值
       + 经纪费% × max(新值 − 旧值, 0)
```
wiki 自己标注正文说 5%/级而公式用 6%，并说"总成本约 11% / 5.1% / 4.6%"与公式不完全吻合。本机草算：零技能挂买+挂卖+销售税 = 3+3+7.5 = 13.5%；满技能满站位 = 1+1+3.375 = 5.375%。[EVE Uni · Trading](https://wiki.eveuniversity.org/Trading)

> 设计要点：**三个费率都是"参数公式"**：基准值 × 技能/站位的线性折扣。玩家结构的费率拆成"固定 NPC 部分（下水道）+ 业主部分（转移）"，这使同一个市场系统既能产生货币消失、又能让领地主收租。

### 3.3 远程交易与可见范围：技能把"距离"变成参数

| 技能 | 作用 | 等级→范围 |
|---|---|---|
| Marketing | 远程挂卖单 | 0 本站 / 1 本星系 / 2 五跳 / 3 十跳 / 4 二十跳 / 5 全区域 |
| Procurement | 远程挂买单 | 同上 |
| Daytrading | 远程改单 | 同上 |
| Visibility | 买单可被多远的卖家成交 | 同上 |

这些技能不移动货物，只改变"你能在哪张表上操作"。[EVE Uni · Trading](https://wiki.eveuniversity.org/Trading)、[EVE Uni · Market](https://wiki.eveuniversity.org/Market)

### 3.4 贸易枢纽的涌现与规模

游戏没有指定"首都市场"。Jita 成为中心是涌现的：成交量大 → 价格稳 → 买家愿为"一站购齐"付小溢价 → 更多卖家。wiki 给的（已标过期）挂单总值：Jita 约 687 万亿 ISK，Amarr 约 54 万亿，Dodixie 约 17 万亿；其他枢纽 Rens、Hek、Oursulaert、Tash-Murkon Prime、Agil、Perimeter，以及 NPC 零安枢纽和虫洞 Thera。[EVE Uni · Jita](https://wiki.eveuniversity.org/Jita)

### 3.5 市场与类型系统的接口

- 订单标的 = typeID；可挂单的物品由 published 与 marketGroupID 决定。
- 运输成本 = invTypes.volume × 距离风险（第 5 节）。
- 工业的"估算物品价值（EIV）"用的是全服成交价推出的 adjusted price（4.3 节），保险估值用建造材料均价（5.4 节）——都是从市场数据反推到 typeID 上的派生值，供其他系统读取。

---

## 4. 蓝图与材料链

### 4.1 蓝图是一种类型；ME/TE 是蓝图实例上的属性

- 蓝图原件（BPO）无限次；蓝图副本（BPC）有限次。多数蓝图一次一件，弹药一次 100 件。T2 蓝图只能靠发明得到 BPC，T2 原件已不再产出。
- 材料效率（ME）**按作业而不是按次扣减**（一个 3 次的作业可能比三个 1 次作业省料），且每次至少消耗 1 单位每种材料（100 次 × 10% 减免仍需 100 件而非 90 件）。
- 时间：Industry 每级 −4%、Advanced Industry 每级 −3%；工程复合体 −15%～−30%（再加铆钉）；大多数 T2 科学技能每级 −1% 时间。
- 并发线：Mass Production、Advanced Mass Production 每级 +1 条；Supply Chain Management 每级可远程 +5 跳开工（满级 25 跳）。[EVE Uni · Manufacturing](https://wiki.eveuniversity.org/Manufacturing)

### 4.2 多级链

```
采矿(矿石/冰) ──精炼──> 矿物 ──制造──> T1 模块/船
卫星采矿(月矿) ──反应──> 高级材料 ──┐
气云(低安/虫洞) ──反应──> 助推剂原料 / T3 材料 ──┼─> T2/T3 部件 ──制造──> T2/T3 船与模块
数据站(数据核/解码器) ──发明(T1 BPC→T2 BPC)──┘
打捞(残骸) ──> 铆钉材料 / 睡者材料(T3)
行星工业 R0→P1→P2→P3→P4 ──> 燃料块、结构部件等
```
[EVE Uni · Industry](https://wiki.eveuniversity.org/Industry)

每一级在 SDE 里都是 `industryActivityMaterials/Products` 的若干行；"矿石→矿物"是 `invTypeMaterials`。链条长度是**数据**，不是代码。

### 4.3 工作费用：系统成本指数

```
作业费 = EIV × ((系统成本指数 × 结构加成) + 设施税 + SCC 附加 + Alpha 税)
EIV（估算物品价值）= Σ(材料数量 × 材料 adjusted price)
系统成本指数 = 本系统过去 28 天该活动工时 / 全宇宙过去 28 天该活动工时
设施税：NPC 站 0.25%，玩家结构业主自定；SCC 附加 4%；Alpha 0.25%；工业税上限 10%
```
示例：EIV 1,000 万、SCI 5%、NPC 站 → 1e7 × (0.05 + 0.0025 + 0.04) = **925,000 ISK**（本机复算；来源页摘要给 95 万系笔误）。wiki 注明 SCI 公式可能已过时（后来补丁让它更敏感）。[EVE Uni · Manufacturing](https://wiki.eveuniversity.org/Manufacturing)

> 设计要点：**拥挤税**。活动越集中的星系作业越贵，天然把工业往外推，无需任何"产能上限"硬规则。SCC 附加 4% 是下水道；业主设施税是转移。

### 4.4 精炼产率公式与税

```
NPC 站：产率 = 站基础(30%–50%) × (1+0.03×Reprocessing) × (1+0.02×Reprocessing Efficiency) × (1+0.02×矿石专精) × (1+植入)
   50% 站满技能 ≈ 69.6%（本机复算）
Upwell：产率 = (50 + 铆钉) × (1+安全等级加成) × (1+结构加成) × 技能项 × (1+植入)
   基础：堡垒/工程复合体 50%，Athanor 51%，Tatara 52%；零安 T2 铆钉 Tatara 满技能 +4% 植入 ≈ 90.6%
NPC 站税：按矿物估值 5%（零站位）线性降到 0%（6.67 站位）；玩家结构任意（含 0）
批量：普通/压缩矿 100 单位一批；批量压缩矿与冰 1 单位一批
废料精炼：只吃 Scrapmetal Processing（2%/级），上限 55%
```
来源页自标"需随近期改动更新"。[EVE Uni · Reprocessing](https://wiki.eveuniversity.org/Reprocessing)

注意 **"安全等级加成"直接进入精炼公式**：同一个 mapSolarSystems.security 字段既决定 CONCORD 要不要来，也决定你的精炼厂铆钉加成多大。这就是"一个维度被多个系统引用"。

### 4.5 行星工业 P0–P4 与海关税

| 层级 | 基准价/单位 | 产法 |
|---|---|---|
| R0 | 5 | 从行星抽取 |
| P1 | 400 | 基础加工 |
| P2 | 7,200 | 两种不同 P1 |
| P3 | 60,000 | P1/P2 组合 |
| P4 | 1,200,000 | 高科技工厂（仅贫瘠/温带行星），需 2–5 种行星类型的输入 |

海关税：高安 POCO = 10%（NPC 部分，Customs Code Expertise 每级 −1%）+ 业主自定；高安以外 NPC 海关 17%，玩家 POCO 则全由业主定。出口费 = 基准价 × 税率（指挥中心发射 ×1.5）；进口费 = 基准价 × 税率 × 0.5。低安行星更富；不能在他人联盟主权内殖民。来源页自标 Equinox 后需更新。[EVE Uni · Planetary Industry](https://wiki.eveuniversity.org/Planetary_Industry)

> 海关税的"NPC 部分 / 业主部分"二分法与市场经纪费一模一样，是 EVE 把"下水道 + 领主收租"揉进同一张表的惯用手法。

---

## 5. 物流与安全等级

### 5.1 安全等级是星系的一个数值字段

| 等级 | security | 规则派生 |
|---|---|---|
| Exordium | 1.0 | 新手区，PvP 完全关闭 |
| 高安 | 0.5–0.9 | CONCORD 响应玩家互相攻击；击毁他人扣安全状态；低于 −2.0 被派系海军攻击 |
| 低安 | 0.1–0.4 | CONCORD 不来，门炮/站炮打侵略者；无故攻击扣安全状态 |
| 零安 | 0.0 到 −1.0 | 无人响应，攻击不扣安全状态 |
| 虫洞、Pochven | −1.0 | 大多数机制按零安处理 |

从同一字段派生的还有：高安不能放泡泡、不能用炸弹；低安只在特定派系战争叛乱星系可用；越低安小行星越肥、NPC 越强、异常越难、任务 LP 越高、行星资源越多；卫星采矿只能在 ≤0.5；任务报酬按真实 security 而非显示值。[EVE Uni · System security](https://wiki.eveuniversity.org/System_security)

### 5.2 CONCORD 响应时间与自杀式打劫的经济学

CONCORD 基础响应：0.5 约 19 秒、0.6 约 14、0.7 约 10、0.8 约 7、0.9/1.0 约 6 秒；同星系反复开火再加 5–6 秒；响应后禁用船只、约 6 秒后不论坦度直接击毁。打劫者必然丢船，所以只打"货值 > 船价"的目标；粗算是 DPS × 响应秒数：meta 级 Catalyst 约 385 DPS/约 200 万 ISK（另加约 1,000 万标签成本洗安全状态），T2 约 683 DPS/1,400 万。运输船 EHP 约 4,000–25,000，货船约 24 万–75 万。[EVE Uni · Suicide ganking](https://wiki.eveuniversity.org/Suicide_ganking)

运输方指南：高安每 1k EHP 载货不超过约 300 万 ISK（熟手 400–600 万）；货船约 10–15 亿是风险线，0.5–0.6 星系更危险；挂自动驾驶是丢船首因（每个星门暴露约一分钟）。[EVE Uni · Hauling](https://wiki.eveuniversity.org/Hauling)

> 设计要点：安全等级 → 响应秒数 → 可输出伤害 → 可击毁的目标 EHP → "每 EHP 可安全载货值"。**一条数值链把治安变成了运费**，没有任何"高安禁止打劫"的硬规则。

### 5.3 运输合同、抵押、第三方货运

合同三类：物品交换、拍卖、运输。运输合同参数：报酬、抵押（接单者押进托管，开包/被毁/超时则归发单者）、有效期、完成天数；违禁品不能进运输合同。发单时物品/ISK 即从发单者处移出托管。[EVE Uni · Contracts](https://wiki.eveuniversity.org/Contracts)

玩家货运公司（如 Red Frog）对 T1 运输船常设 5,000 万抵押、17,000 m³ 上限；起步做运输业务约需 10 亿资本与货船/跳货；骗局包括高抵押诱骗到危险航线、接单后取消停靠权等。[EVE Uni · Hauling](https://wiki.eveuniversity.org/Hauling)

### 5.4 保险：按建造材料估值的线性保单

```
赔付 = CCP 估值 × 保单覆盖% × 船型系数(≤1)
CCP 估值"基于建造船体所用材料的平均价值"，低于市价以防骗保；只有覆盖%公开
```

| 保单 | 赔付 | Rupture 示例保费 |
|---|---|---|
| 无 | 40% | 0 |
| 基础 | 50% | 356,011 |
| 标准 | 60% | 712,023 |
| 青铜/白银/黄金 | 70/80/90% | — |
| 白金 | 100% | 2,136,070 |

本机草算：每提高 1 个百分点覆盖，保费恒为 35,601 ISK——**保费是覆盖率的严格线性函数**。有效 12 周；只保船体，不保装备/货物/无人机；被 CONCORD 击毁则保单失效、回落到 40% 底。[EVE Uni · Insurance](https://wiki.eveuniversity.org/Insurance)

> 保险赔付是水龙头（NPC 付的 ISK），保费是下水道。"被 CONCORD 击毁不赔"是打劫经济学的一个硬参数。

### 5.5 资产安全与结构损毁

Upwell 结构被毁/拆除时，内部物品进入"资产安全"：5 天后可付 **0.5%** 取回到同星系；20 天后自动送到最近 NPC 站，跨星系收 **15%**。零安/低安送最近低安站，高安送最近高安站。虫洞无资产安全（物品掉成容器）；断燃料 7 天的"废弃"结构被毁也不触发。[EVE Uni · Asset Safety](https://wiki.eveuniversity.org/Asset_Safety)

---

## 6. 主权与联盟

### 6.1 公司—联盟—主权的归属链

- 联盟创建 10 亿 ISK，创建者需为 CEO 且有 Empire Control V；每成员公司每月 200 万维护费，由执行公司钱包支付，欠费则下次维护时解散；执行公司需 ≥50% 成员公司 CEO 支持；只有执行公司能设联盟站位。[EVE Uni · Alliance](https://wiki.eveuniversity.org/Alliance)
- 主权零安星系只能由**联盟**宣称；NPC 零安不可宣称。[EVE Uni · Sovereignty](https://wiki.eveuniversity.org/Sovereignty)
- 公司税：玩家公司自定，NPC 公司固定 11%；只对 >10 万 ISK 的赏金、Project Discovery、AIR 日常、任务奖励征收，不碰钱包余额/市场/交易；Viridian 之后 LP 也按同税率抽。[EVE Uni · Tax](https://wiki.eveuniversity.org/Tax)、[Viridian 更新说明](https://www.eveonline.com/news/view/viridian-expansion-notes)
- 联盟没有"联盟税"机制，经费靠成员公司上缴与公司税、结构费等玩家约定。[EVE Uni · Alliance](https://wiki.eveuniversity.org/Alliance)
- 公司钱包最多 7 个分区；办公室租金 NPC 站每日动态（最低 1 万），玩家堡垒由业主定且固定；账单可自动支付。[EVE Uni · Corporation logistics](https://wiki.eveuniversity.org/Corporation_logistics)

### 6.2 主权中枢、ADM、脆弱窗口、争夺流程

- 每星系一个 **Sovereignty Hub**，Equinox（2024-06-11）起取代 I-Hub 与 TCU（2024-10-29 全部转换）。
- **活动防御倍率 ADM** = 1 + 军事指数（本系 NPC 击杀，最多 +2.5）+ 工业指数（本系采矿量，最多 +2.5）+ 战略指数（持续占领时长，最多 +1.0），上限 6；联盟首都 +2（仍不超 6）。
- 作用：中枢加固所需时间 ≈ 10 分钟 × ADM；每日脆弱窗口 = 18 小时 / ADM（ADM 6 → 3 小时）。本机复算表见 8.3。
- 争夺：攻方在窗口内用 entosis 链接；不被打断一段时间后结构进入约 48 小时加固；加固结束在星座生成指挥节点，进度条从 60% 起、每节点 7%，攻方至少 9 个、守方至少 6 个；攻方胜则中枢与全部升级件被毁，需重新放置并宣称。
- 升级件分战略、工业、军事、探索、资源管理、系统效应六族，同族互斥，装后不可拆只能下线或自毁。[EVE Uni · Sovereignty](https://wiki.eveuniversity.org/Sovereignty)

> 设计要点：**守备强度不是买来的，是住出来的。** 打怪、挖矿、住得久三件事各贡献一个指数，加和成倍率，倍率再线性作用到两个时间参数。这是"领地价值由使用度计算"的典范。

### 6.3 Equinox：电力、劳动力、试剂

| 殖民资源 | 来源 | 可否转运 | 用途 |
|---|---|---|---|
| 电力 Power | 恒星（大蓝星最多、小橙星最少）+ 气态/风暴/等离子行星 | 不可 | 升级件的"电费"；总电费不能超过所有天钩满装的上限 |
| 劳动力 Workforce | 贫瘠/海洋/温带行星 | 可在同联盟直连星系间通过中枢导入导出 | 升级件 |
| 试剂 Reagents | 冰行星 → 超离子冰；熔岩行星 → 岩浆气 | 需手动收集运输 | 岩浆气供 Metenox 月钻、Pharolux 信标、Tenebrex 干扰器；超离子冰供 Ansiblex 跳桥、超旗建造设施 |

- **轨道天钩**取代海关作为行星接口，每行星一个，只在玩家主权零安；试剂随时间成熟，偷窃取走 40%、其余销毁并重置成熟度；偷窃需把筒仓打到 10% 盾以下并用巡洋以上船链接 10 分钟，全星系通报。天钩蓝图 55 亿。
- **Metenox 月钻**：低安/零安/虫洞卫星采矿点可放，效率为手动 Athanor/Tatara 的 40%，吃燃料块与岩浆气，无自动维修；蓝图 60 亿，核心 3 亿。
- 升级件按优先级断电；Legion 之后不再受系统电力上限硬卡，军事/工业指数也不再是运行条件（但仍算进 ADM）。[Equinox 更新说明](https://www.eveonline.com/news/view/equinox-expansion-notes)、[EVE Uni · Sovereignty](https://wiki.eveuniversity.org/Sovereignty)

> 设计要点：恒星类型（sunTypeID）、行星类型（planet type）都是 type，有属性；"这个星系能开多少升级"直接由天体属性求和得到。**领地价值 = Σ 天体属性**，不需要给每个星系手填"富/贫"。

### 6.4 租借：没有机制，是玩家合同

官方 wiki 的主权页不讨论租借。玩家资料显示租借完全是场外协议：租客公司加入"租客联盟"，按月付固定租金（2014 年论坛报价低需求系 10–20 亿/月、高需求 100 亿）或按比例抽税（如 7% 打怪税，月矿另议）；权利清单（打怪、探索、采矿、PI、月矿）写在招租帖里；租客通常不能参加房东舰队；骗局常见；租赁政治化（Imperium 曾公开反对租赁）。[EVE 论坛 · TRI 招租](https://forums.eveonline.com/t/tri-triumvirate-offering-nullsec-systems-for-rent-in-cloud-ring/317598)、[EVE 论坛 · EDGE 招租](https://forums.eveonline.com/t/live-on-the-edge-become-a-renter-edge-alliance/390667)、[Imperium News · Rental empires](https://imperium.news/rental-empires-eve/)、[GamesRadar · 租金争端](https://www.gamesradar.com/rent-disputes-threaten-to-ignite-the-next-all-out-war-in-this-massive-space-mmo)

游戏内唯一支撑是"站位（standings）"一个数轴（蓝/红）决定能否停靠、是否被打；其余靠信任。

### 6.5 Upwell 结构：玩家自建"站点"，业主自定税率

| 类别 | 型号（规模/服务槽） | 要点 |
|---|---|---|
| 堡垒 | Astrahus(中/3)、Fortizar(大/5)、Keepstar(超/7) | 作战基地，市场与克隆湾燃料加成，脆弱时长最短 |
| 工程复合体 | Raitaru(中/3)、Azbel(大/5)、Sotiyo(超/6) | 材料 −1%、工时 −15～30%、作业费 −3～5%；Azbel 可造旗舰，Sotiyo 可造超旗 |
| 精炼厂 | Athanor(中/3)、Tatara(大/5) | 唯一能做反应与卫星采矿 |
| 导航/Equinox | Ansiblex、Pharolux、Tenebrex、天钩、Metenox、主权中枢 | 不可停靠 |

- 服务模块：市场、克隆、精炼、研究、发明、制造、旗舰/超旗制造、反应、月矿；无需模块的服务：系泊、机库、装配、保险、维修、合同、公司办公室。
- 断燃料则服务下线：制造暂停、市场停摆、克隆锁定，物料不毁但取不出。
- 访问列表四级：管理员/经理/成员/屏蔽；可设公开。
- 部署约束：公司 ≥7 天；距其他站/门 ≥1,000 km；贸易枢纽、新手系、Thera 等禁放；Keepstar/Sotiyo 不可放高安（2023-06-14 起）。[EVE Uni · Upwell structures](https://wiki.eveuniversity.org/Upwell_structures)

业主可定的税：市场经纪费（在 0.5% SCC 之上）、设施税（制造）、精炼税、办公室租金。这些是**领地租金的游戏内形式**——不是"收税"按钮，而是把 NPC 的费率表换成业主的。[EVE Uni · Tax](https://wiki.eveuniversity.org/Tax)、[EVE Uni · Reprocessing](https://wiki.eveuniversity.org/Reprocessing)

---

## 7. 税收全表：谁收、流向哪里

| 税/费 | 税率 | 计税对象 | 去向 |
|---|---|---|---|
| 公司税 | 玩家公司自定；NPC 公司 11% | >10 万的赏金、PD、AIR、任务奖励；LP 同率 | 玩家公司主钱包（转移）；NPC 公司的是下水道 |
| 销售税 | 7.5% × (1−0.11×Accounting) | 市场成交额 | SCC（下水道） |
| 经纪费（NPC 站） | 3% − 技能/站位折扣，≥1% | 挂单金额 | 下水道 |
| 经纪费（Upwell） | 0.5% SCC + 业主% | 挂单金额 | 0.5% 下水道 + 业主转移 |
| 改单费 | 见 3.2 | 改单 | 同上 |
| 工业作业费 | EIV × (SCI×加成 + 设施税 + 4% SCC + Alpha) | 作业 | SCC 部分下水道；设施税归业主（NPC 站 0.25% 下水道） |
| 精炼税 | NPC 站 5%→0%（站位 6.67）；Upwell 业主定 | 矿物估值 | 同上 |
| 行星海关 | 高安 10%+业主；其他 NPC 17% / 业主全定 | 进出口基准价 | 同上 |
| 派系战争维护税 | 0%→75% 随阵营等级 | 捐献升级系统的 LP | 下水道 |
| 保险保费 | 线性，见 5.4 | 船体 | 下水道（赔付是水龙头） |
| 资产安全 | 0.5% 同系 / 15% 跨系 | 资产估值 | 下水道 |
| 联盟维护费 | 200 万/公司/月 | — | 下水道 |
| 联盟创建 | 10 亿 | — | 下水道 |
| 办公室租金 | NPC 站动态（≥1 万）；堡垒业主定 | — | NPC 部分下水道；业主转移 |
| 跳跃克隆安装/激活费 | 见 MER（2019-07 各几十亿/月） | — | NPC 站下水道，Upwell 归业主 |
| 维修费 | 见 MER | — | 同上 |

来源：[EVE Uni · Tax](https://wiki.eveuniversity.org/Tax)、[Trading](https://wiki.eveuniversity.org/Trading)、[Manufacturing](https://wiki.eveuniversity.org/Manufacturing)、[Reprocessing](https://wiki.eveuniversity.org/Reprocessing)、[Planetary Industry](https://wiki.eveuniversity.org/Planetary_Industry)、[Insurance](https://wiki.eveuniversity.org/Insurance)、[Asset Safety](https://wiki.eveuniversity.org/Asset_Safety)、[Alliance](https://wiki.eveuniversity.org/Alliance)、[Corporation logistics](https://wiki.eveuniversity.org/Corporation_logistics)、[Imperium News · 2019-07 MER](https://imperium.news/?p=33436)

> 关键模式：**每一项费用都拆成"NPC 固定部分（货币消失）+ 业主可变部分（货币转移）"**。前者保证通胀可控，后者让领地有收益。MER 的"服务分解"图正是按 NPC/玩家两列报这些数（见 8.2）。

---

## 8. 月度经济报告（MER）：指标体系与货币守恒

### 8.1 指标清单

2024-12 月报的图表目录（官方页面只有图名，数字在图里和随附 CSV 里）：

- **生产/销毁**：生产值 vs 开采值 vs 销毁值；分区域生产值；分区域销毁值；战役列表
- **开采**：小行星矿/气/冰的体积历史与分区域；月矿按材料等级历史与分区域价值；分区域开采价值
- **ISK 水龙头与下水道**：总览；Top 水龙头/下水道历史；Top 商品水龙头历史；分区域 NPC 赏金；**服务分解（Services breakdown）**
- **货币**：货币供应；货币流速
- **价格指数**：经济指数（含 2018 基准版）；CPI 分解；矿物价格指数（MPI）分解；一级/二级生产者价格指数分解；船与模块指数
- **贸易**：分区域贸易平衡（ISK 与 m³）；分区域贸易额；进出口与净出口；虫洞进出口
- **区域统计**

页面说明：进出口统计的是船在区域间的移动（含货物与组装好的船），不含已装配模块与植入体。[MER 2024-12](https://www.eveonline.com/news/view/monthly-economic-report-december-2024)、[MER 2025-01](https://www.eveonline.com/news/view/monthly-economic-report-january-2025)

2021-02 月报说明了图表变更："Top 10 水龙头与下水道"中赏金项并入 ESS 支付；"Top 6 商品水龙头"显示被 NPC 买单吃掉的前六类商品；原 SinksFaucets.csv 被替换。[EVE 论坛 · MER 2021-02](https://forums.eveonline.com/t/monthly-economic-report-february-2021/302188)

### 8.2 水龙头与下水道的分类

官方文字只点名了"赏金（Bounty Prizes）"与"商品（Commodities，NPC 买单收购）"两大水龙头，和"市场税（Market Tax）"下水道。[MER 2025-12 论坛版](https://forums.eveonline.com/t/monthly-economic-report-december-2025/504563.md)、[MER 2026-05 论坛版](https://forums.eveonline.com/t/monthly-economic-report-may-2026/512928.md)、[MER 2025-03](https://www.eveonline.com/news/view/monthly-economic-report-march-2025)

玩家媒体从图表读出的完整分类：

**水龙头**：赏金/ESS 支付（最大）、商品（NPC 买单，第二大）、入侵奖励（2017 年第三大，约 9.1 万亿/月）、保险赔付、任务/代理人奖励。[EN24 · Leaky faucets](https://evenews24.com/2017/12/15/leaky-faucets-money-supply-in-the-economic-report/)、[Imperium News · 2019-07](https://imperium.news/?p=33436)

**下水道**：技能书（2017 年称最大）、交易税、经纪费、NPC 蓝图原件（第四大，常月 6–9 万亿，2017-10 因 Lifeblood 冲到 28.98 万亿）、工业作业税、行星出口税、跳跃克隆安装/激活费、维修费、LP 商店 ISK 部分、联盟/公司费用。[EN24](https://evenews24.com/2017/12/15/leaky-faucets-money-supply-in-the-economic-report/)、[Imperium News · 2019-07](https://imperium.news/?p=33436)、[EVE Uni · Loyalty Points](https://wiki.eveuniversity.org/Loyalty_Points)

**服务分解（NPC vs 玩家两列）**，2019-07 实例：经纪费 10.274 万亿（NPC 7.146 + 玩家 2.55）；跳跃克隆激活 640 亿（NPC 460 + 玩家 260）；跳跃克隆安装 340 亿；行星出口税 1,200 亿（NPC 800 + 玩家 2,490 ——玩家 POCO 收得比 NPC 多）；工业作业税 560 亿；维修费 1,110 亿。[Imperium News · 2019-07](https://imperium.news/?p=33436)

**守恒规则**：只有 NPC 一列是真正的下水道；玩家一列是转移，不改变货币总量。这也是为什么 MER 要把同一项费用拆两列报。

### 8.3 量级核对（本机草算）

脚本：`F:\temp\claude\d5f27397948f41bd\91a2ffab-45cc-4033-adab-94b22866f267\scratchpad\sanity_check.ps1`（PowerShell，仅算术）。输入与结果：

| 项目 | 输入（来源） | 结果 |
|---|---|---|
| 货币供应 2025-11 | 2,614.5 万亿，月增 5.5%（[Nosy Gamer](https://nosygamer.blogspot.com/2025/12/eve-onlines-november-2025-monthly.html)） | 上月 ≈ 2,478 万亿，净增 ≈ 136 万亿 |
| 当月流入 | 112.2 万亿（同上） | 小于净增 136 万亿——差额可由休眠钱包重新活跃解释（MER 另报"活跃 ISK 增量"），**不矛盾** |
| 月流速 | 玩家月支出 1,115.6 万亿（同上） | 1,115.6 / 2,614.5 ≈ **0.43/月**（年化约 5.1） |
| 月均销毁 2025-01～10 | 46.86…48.20 万亿（[TAGN](https://tagn.wordpress.com/2025/11/14/the-october-2025-eve-online-monthly-economic-report/)） | 平均 47.48 万亿 ≈ 货币供应的 **1.82%/月** |
| 经纪费单项 2019-07 | 10.274 万亿 vs 销毁 40.2 万亿（Imperium） | 单项下水道 ≈ 当月销毁值的 **25.6%** |
| 赏金 vs 入侵 2017 | 63.1 vs 9.11 万亿（EN24） | 入侵约为赏金的 14% |
| 交易摩擦 | 公式见 3.2 | 零技能 13.5%；满技能满站位 5.375% |
| 精炼 | 公式见 4.4 | 69.58%（wiki 说"约 70%"，一致） |
| 叠加惩罚 | S(n) | 100/86.9/57.1/28.3/10.6/3.0%，与 wiki 一致 |
| 保险 | Rupture 三档保费 | 每点覆盖 35,601 ISK，严格线性 |
| ADM | 1–6 | 窗口 18/9/6/4.5/3.6/3 小时；加固 10–60 分钟 |

结论：公开数字彼此自洽；"销毁 ≈ 货币供应 2%/月、单一大下水道 ≈ 销毁的 1/4、流速 ≈ 0.4/月"可作为我们设计经济报表时的参照量级。

### 8.4 MER 的已知数据问题

- 2025-09、10、11 三期的月末货币供应被错取为 2025-08-30 的值（原报 2,379.4 万亿，校正 2,614.5 万亿），"平均 ISK 增量"随之出错；水龙头/下水道图偏差 9%。money_supply.csv 缺 2025-08-31 一行。[Nosy Gamer · 2025-11](https://nosygamer.blogspot.com/2025/12/eve-onlines-november-2025-monthly.html)
- 玩家长期质疑"休眠钱包追踪窗口"到底是 3 个月还是 1 个月，CCP 未在论坛正面回答。[EVE 论坛 · MER 2021-02](https://forums.eveonline.com/t/monthly-economic-report-february-2021/302188)
- EVE Uni 的 Trading 页面自己承认 Accounting 两处数字（3.6% vs 3.37%）和改单费系数（5 vs 6）不一致。[EVE Uni · Trading](https://wiki.eveuniversity.org/Trading)

> 启示：**报表必须由系统直接产出而非事后拼接**，且每项要能回溯到原始事件；否则连 CCP 也会连错三个月。

---

## 9. 全部系统清单（供"成熟游戏系统总表"对照）

每行三点：一句话说明、依赖的统一维度、出处。"统一维度"用第 2 节的词：**type**（类型树）、**attr**（dogma 属性）、**effect**（修正规则）、**security**（星系安全值）、**standing**（站位 −10～+10）、**skill**（技能=type，等级改属性）、**ISK 账**（水龙头/下水道/转移）、**typeID 外键**（蓝图/材料/精炼表）。我们没有的也列。

### 9.1 对象与数值底座

| # | 系统 | 一句话 | 依赖维度 | 出处 |
|---|---|---|---|---|
| 1 | 类型树 | 万物皆 type，type→group→category 三层 | type | [SDE](https://wiki.eveuniversity.org/Static_Data_Export) |
| 2 | dogma 属性 | 每个 type 挂一组 attributeID→值，属性定义含 stackable/highIsGood/unit | attr | [SDE](https://wiki.eveuniversity.org/Static_Data_Export) |
| 3 | dogma 效果/修正器 | "读 A 属性→以运算改目标 B 属性"的规则表，可带分组/技能过滤 | attr, effect | [ESI Dogma](https://docs.esi.evetech.net/docs/dogma.html) |
| 4 | 叠加惩罚 | 同一受罚属性多次百分比修正按 exp(−(n/2.67)²) 衰减 | attr(stackable) | [Stacking penalties](https://wiki.eveuniversity.org/Stacking_penalties) |
| 5 | 技能 | 技能是 type，I–V 级，训练时间=rank×SP 表，按角色五属性加速；每级给船/模块加百分比 | skill, effect | [Skills](https://wiki.eveuniversity.org/Skills) |
| 6 | 技能书/注入器/提取器 | 技能书是消耗型 type（下水道）；注入器把 SP 做成可交易物品 | type, ISK 账 | [Skills](https://wiki.eveuniversity.org/Skills) |
| 7 | 植入体 | 头部 10 槽，1–5 加角色属性，6–10 加技能相关属性；被爆蛋即毁 | attr, effect | [Implants](https://wiki.eveuniversity.org/Implants) |
| 8 | 兴奋剂 | 临时属性修正、有副作用、部分地区违禁 | attr, effect, security | （专页 404，见 [Industry](https://wiki.eveuniversity.org/Industry) 助推剂链条） |
| 9 | 装配 | 高/中/低/铆钉槽；CPU 与功率是船的资源属性，模块消耗它们 | attr | [Fitting ships](https://wiki.eveuniversity.org/Fitting_ships) |
| 10 | 电子战 | ECM/武器干扰/感应抑制/标记——全是对目标属性的 effect | effect | [Electronic warfare](https://wiki.eveuniversity.org/Electronic_warfare) |
| 11 | 无人机 | 船的 droneBay/bandwidth 属性限制携带与同时出动数 | attr | [Drones](https://wiki.eveuniversity.org/Drones) |
| 12 | 旗舰/超旗 | 船级 type；不能进高安、超旗只能在主权零安造——由 security 与主权升级件门控 | type, security, 主权 | [Capital ships](https://wiki.eveuniversity.org/Capital_ships) |
| 13 | 克隆与复活 | 跳跃克隆 24h 冷却、90 万安装费；被爆蛋回家站新克隆 | ISK 账, standing | [Clones](https://wiki.eveuniversity.org/Clones) |
| 14 | Alpha/Omega 与 PLEX | PLEX 是可交易 type，500 PLEX=30 天 Omega；真钱→PLEX→ISK 的桥 | type, ISK 账 | [PLEX](https://wiki.eveuniversity.org/PLEX) |

### 9.2 经济

| # | 系统 | 一句话 | 依赖维度 | 出处 |
|---|---|---|---|---|
| 15 | 区域订单簿市场 | 每区域一张买卖单表，站点/结构为入口；订单数与远程范围由技能给 | type, skill, 区域 | [Trading](https://wiki.eveuniversity.org/Trading) |
| 16 | 市场费用 | 销售税、经纪费、改单费三条参数公式；NPC 部分下水道、业主部分转移 | ISK 账, skill, standing | [Trading](https://wiki.eveuniversity.org/Trading) |
| 17 | 贸易枢纽 | Jita 等枢纽是涌现的，不是指定的 | 区域 | [Jita](https://wiki.eveuniversity.org/Jita) |
| 18 | 合同 | 物品交换/拍卖/运输三类；抵押托管 | type, ISK 账 | [Contracts](https://wiki.eveuniversity.org/Contracts) |
| 19 | 采矿 | 矿石按 security 分布；产量=模块/船/技能属性叠加；压缩、冰、月矿 | security, attr, skill | [Mining](https://wiki.eveuniversity.org/Mining) |
| 20 | 精炼 | 产率公式（站基础×技能×植入×结构×security）；NPC 税随 standing 降 | typeID 外键, attr, security, standing | [Reprocessing](https://wiki.eveuniversity.org/Reprocessing) |
| 21 | 制造 | 蓝图 type + 活动表；ME/TE；作业费=EIV×(SCI+税) | typeID 外键, ISK 账 | [Manufacturing](https://wiki.eveuniversity.org/Manufacturing) |
| 22 | 研究与复制 | ME/TE 各 10 级，1%/2% 每级；复制耗建造时间 80% | typeID 外键 | [Research](https://wiki.eveuniversity.org/Research) |
| 23 | 发明 | T1 BPC+数据核+解码器→概率出 T2 BPC；基础概率按物品类 22–34% | typeID 外键, skill | [Invention](https://wiki.eveuniversity.org/Invention) |
| 24 | 反应 | 月矿/气→中间材料；只能在 ≤0.4 的精炼厂；配方"类似蓝图"但不可研究 | typeID 外键, security | [Reactions](https://wiki.eveuniversity.org/Reactions) |
| 25 | 行星工业 | R0→P4 五级，基准价 5→120 万；海关税 NPC+业主 | typeID 外键, security, ISK 账 | [Planetary Industry](https://wiki.eveuniversity.org/Planetary_Industry) |
| 26 | 打捞 | 残骸→铆钉材料 | type | [Salvaging](https://wiki.eveuniversity.org/Salvaging) |
| 27 | 保险 | 按建造材料估值×覆盖%；线性保费；CONCORD 击毁不赔 | typeID 外键, ISK 账 | [Insurance](https://wiki.eveuniversity.org/Insurance) |
| 28 | 忠诚点与 LP 商店 | 第二货币，按 NPC 公司分账；兑换需 LP+ISK+物品 | ISK 账, standing | [Loyalty Points](https://wiki.eveuniversity.org/Loyalty_Points) |
| 29 | 税收 | 公司税/销售税/经纪费/工业税/精炼税/海关税/维护费全表 | ISK 账, standing | [Tax](https://wiki.eveuniversity.org/Tax) |
| 30 | 货币水龙头与下水道 | 每笔 ISK 增减标为产生/消失/转移 | ISK 账 | [EN24](https://evenews24.com/2017/12/15/leaky-faucets-money-supply-in-the-economic-report/)、[Imperium 2019-07](https://imperium.news/?p=33436) |
| 31 | 月度经济报告 | 生产/销毁/开采、货币供应与流速、价格指数、区域贸易、服务分解 | ISK 账 | [MER 2024-12](https://www.eveonline.com/news/view/monthly-economic-report-december-2024) |
| 32 | 击毁邮件 | 记录受害者、攻击者、装配、掉落/销毁与估值；第三方做成击杀榜 | type, ISK 账 | [Killmail](https://wiki.eveuniversity.org/Killmail) |

### 9.3 空间、治安与风险

| # | 系统 | 一句话 | 依赖维度 | 出处 |
|---|---|---|---|---|
| 33 | 星系安全等级 | 每星系一个 −1.0～1.0 浮点值，派生治安/泡泡/资源/任务报酬 | security | [System security](https://wiki.eveuniversity.org/System_security) |
| 34 | CONCORD 与自杀式打劫 | 响应秒数按 security 分段；打劫=DPS×秒数 vs 货值 | security, attr | [Suicide ganking](https://wiki.eveuniversity.org/Suicide_ganking) |
| 35 | 角色安全状态 | −10～+10，非法攻击降、打 NPC/交标签升；−2 派系警察、−5 全民可击 | standing 类数轴, security | [Security status](https://wiki.eveuniversity.org/Security_status) |
| 36 | Crimewatch 旗标与计时器 | 武器/PvP/嫌疑/罪犯/有限交战计时器；安全开关 | security | [Crimewatch](https://wiki.eveuniversity.org/Crimewatch) |
| 37 | 击杀权 | 被非法攻击后获得的可出售/激活的报复权 | security | （专页 404；提及见 [Crimewatch](https://wiki.eveuniversity.org/Crimewatch)） |
| 38 | 运输与物流 | 风险→每 EHP 可载货值；低安/零安需侦察与反泡泡 | security, attr | [Hauling](https://wiki.eveuniversity.org/Hauling) |
| 39 | 跃迁与星门/自动导航 | 船的 align/warp speed 属性；自动导航是丢船首因 | attr | [Hauling](https://wiki.eveuniversity.org/Hauling)（Warp drive 专页 404） |
| 40 | 跳跃引擎/诱导场/跳跃疲劳 | 旗舰按距离耗同位素跳到诱导场；疲劳累积上限 5 小时 | attr | [Jump drives](https://wiki.eveuniversity.org/Jump_drives) |
| 41 | 探索与扫描 | 信号/异常分类（数据/遗迹/气/战斗/虫洞）；security 决定收益 | type, security | [Exploration](https://wiki.eveuniversity.org/Exploration) |
| 42 | 黑入小游戏 | 分析器模块的 Virus Coherence/Strength 属性 | attr | [Hacking](https://wiki.eveuniversity.org/Hacking) |
| 43 | 虫洞空间 | C1–C6 级，洞有质量/时限属性，系统效应改属性 | attr, effect | [Wormholes](https://wiki.eveuniversity.org/Wormholes) |
| 44 | 深渊死亡空间 | 丝线 0–6 层；天气=一对属性增减；突变质体随机改模块属性 | attr, effect | [Abyssal Deadspace](https://wiki.eveuniversity.org/Abyssal_Deadspace) |
| 45 | Pochven | 27 星系区域；进出靭丝线；本土门需 Triglavian standing 6.0 | standing | [Pochven](https://wiki.eveuniversity.org/Pochven) |
| 46 | 资产安全 | 结构毁后 5 天 0.5% / 20 天 15% 取回；虫洞无 | ISK 账, security | [Asset Safety](https://wiki.eveuniversity.org/Asset_Safety) |
| 47 | 系泊 | 结构旁免锁定并自动修理；需核心+服务模块 | 结构 | [Tethering](https://wiki.eveuniversity.org/Tethering) |

### 9.4 PvE 内容与声望

| # | 系统 | 一句话 | 依赖维度 | 出处 |
|---|---|---|---|---|
| 48 | 站位/声望 | NPC 派系/公司/代理人对你 −10～+10；派生站位连锁；门控代理人、折扣税费 | standing | [Standings](https://wiki.eveuniversity.org/Standings) |
| 49 | 代理人任务 | 1–5 级，按 standing 解锁；报酬 ISK+LP+standing；每 16 个出剧情任务 | standing, ISK 账 | [Missions](https://wiki.eveuniversity.org/Missions) |
| 50 | 赏金 | 击杀 NPC 得 ISK（水龙头）；动态赏金系统按玩家死亡/NPC 击杀调系数 | ISK 账, security | [Ratting](https://wiki.eveuniversity.org/Ratting) |
| 51 | ESS | 零安赏金 40% 进主银行、可被偷；储备银行需钥匙 | ISK 账 | [ESS](https://wiki.eveuniversity.org/Encounter_Surveillance_System) |
| 52 | 入侵 | 全星座减益（抗性、伤害、赏金减半、禁诱导）；影响条随站点清除下降 | effect, ISK 账 | [Incursions](https://wiki.eveuniversity.org/Incursions) |
| 53 | 派系战争 | 四帝国低安争地；据点抬升争夺度；阵营等级 −50%～+225% LP；海盗叛乱 | standing, ISK 账 | [Factional Warfare](https://wiki.eveuniversity.org/Factional_Warfare) |
| 54 | 代理窗口（The Agency） | 列出任务/舰队遭遇/探索点/采集点的统一入口 | type | [The Agency](https://wiki.eveuniversity.org/The_Agency) |
| 55 | Project Discovery | 公民科学小游戏 | — | [Project Discovery](https://wiki.eveuniversity.org/Project_Discovery) |
| 56 | 玩家赏金 | 玩家对玩家悬赏 | ISK 账 | （专页 404，未取到） |

### 9.5 组织、战争与领地

| # | 系统 | 一句话 | 依赖维度 | 出处 |
|---|---|---|---|---|
| 57 | 军团（公司） | 玩家组织；7 个钱包分区；办公室租金；账单自动付 | ISK 账 | [Corporation logistics](https://wiki.eveuniversity.org/Corporation_logistics) |
| 58 | 公司税 | 对 >10 万的赏金/任务/LP 抽成；NPC 公司固定 11% | ISK 账 | [Tax](https://wiki.eveuniversity.org/Tax) |
| 59 | 联盟 | 10 亿创建、200 万/公司/月；执行公司设站位；只有联盟能持主权 | ISK 账, standing | [Alliance](https://wiki.eveuniversity.org/Alliance) |
| 60 | 舰队 | FC→翼→中队三层；指挥脉冲只向下传 | effect | [Fleet leadership](https://wiki.eveuniversity.org/Fleet_leadership) |
| 61 | 战争宣告 | 需拥有结构/海关才能宣战或被宣；5 亿/周；24h 准备；可互战、可加盟防守 | ISK 账, 结构 | [Wars](https://wiki.eveuniversity.org/Wars) |
| 62 | Upwell 结构 | 玩家站点三族；服务模块、燃料、访问列表、业主税率 | type, ISK 账 | [Upwell structures](https://wiki.eveuniversity.org/Upwell_structures) |
| 63 | 结构脆弱与加固 | 盾/甲/壳多轮加固与脆弱窗口 | 结构 | （专页 404；概述见 [Upwell structures](https://wiki.eveuniversity.org/Upwell_structures)） |
| 64 | 主权 | 中枢、ADM（打怪+采矿+时长）、18h/ADM 窗口、entosis 与指挥节点 | 主权, 活动指数 | [Sovereignty](https://wiki.eveuniversity.org/Sovereignty) |
| 65 | Equinox 殖民资源 | 电力（恒星/行星属性）、劳动力（可转运）、试剂（需运输）；天钩与月钻 | type(天体), attr | [Equinox notes](https://www.eveonline.com/news/view/equinox-expansion-notes) |
| 66 | 租借 | 无机制，玩家合同 + 站位 | standing | [Imperium · Rental empires](https://imperium.news/rental-empires-eve/) |
| 67 | 旧式星基（POS） | 遗留结构，月矿已迁至精炼厂 | — | （专页 404；见 [Upwell structures](https://wiki.eveuniversity.org/Upwell_structures)） |

### 9.6 EVE 没有、我们可能有的

角色成长不是等级而是技能点；没有"人物关系/家族/继承"；没有土地所有权之外的政治（无法律、无投票、无条约对象）；没有 NPC 社会（NPC 公司只是税率与站位的载体）；没有疾病/天气等生态；没有文化/宗教维度。这些在 05（CK3）与其他篇对照。

## 10. 哪些仍是专项脚本 / 局限

1. **治安常数写死在服务器**：CONCORD 响应秒数表、−2.0 派系海军阈值、0.5 以下才能月矿、高安禁泡泡/炸弹，都不是 dogma 属性，是按 security 分段的代码规则。[System security](https://wiki.eveuniversity.org/System_security)、[Suicide ganking](https://wiki.eveuniversity.org/Suicide_ganking)
2. **经济常数写死**：ESS 主银行 40% 分流、保险 40% 底、资产安全 0.5%/15%、SCC 4%/0.5%、销售税 7.5% 基准、联盟 10 亿/200 万、CONCORD 击毁不赔。它们是全局参数而非类型属性，改一次要发版本。[ESS](https://wiki.eveuniversity.org/Encounter_Surveillance_System)、[Insurance](https://wiki.eveuniversity.org/Insurance)、[Asset Safety](https://wiki.eveuniversity.org/Asset_Safety)
3. **估值由黑箱算法给出**：工业 EIV 用的 adjusted price、保险的"材料均价估值"，公式不公开（保险页明说只有覆盖%公开）。[Insurance](https://wiki.eveuniversity.org/Insurance)
4. **只统一了"物"，没统一"人与组织"**：角色、公司、联盟、站位、声望、技能点是独立实体表（crp/chr/agt 前缀），不走 type/attribute。联盟之上的"联军"不存在于游戏内。[SDE](https://wiki.eveuniversity.org/Static_Data_Export)、[Alliance](https://wiki.eveuniversity.org/Alliance)
5. **租借、外交、条约没有机制**，全靠论坛帖和信任；游戏只提供站位数轴。[Imperium News · Rental empires](https://imperium.news/rental-empires-eve/)
6. **dogma 的两套写法并存**：旧表达式树与新 modifierInfo 并存多年，激活/解除不镜像，操作符枚举无官方文档。[ESI · Dogma](https://docs.esi.evetech.net/docs/dogma.html)
7. **SDE 重做不兼容**，大量社区工具一次性失效。[CCP 博客](https://developers.eveonline.com/blog/reworking-the-sde-a-fresh-start-for-static-data)
8. **MER 本身是事后导出**，三个月的错误才被社区发现。[Nosy Gamer](https://nosygamer.blogspot.com/2025/12/eve-onlines-november-2025-monthly.html)
9. **规则公式分散在 wiki**，官方没有一处完整给出销售税/经纪费/作业费/精炼公式；我们引用的 EVE Uni 页面多处自标"过期/不一致"。

---

## 11. 对 infinite-world 的启示

**可直接照搬的结构**

1. **一张 type 表 + 一张 attribute 表 + 一张 effect 表**。物、地点（星系/行星）、技能、配方全是 type；行为用"读属性→改属性"的规则表达；规则不含数字。infinite-world 里的物品、地块、技艺、配方、法令都可以收敛到这一个模型。
2. **属性级元数据驱动通用规律**：像 `stackable/highIsGood/unitID` 一样，在属性定义上标"可否叠加、叠加衰减曲线、高好低好"，让"堆同类东西边际递减"成为所有属性的默认行为，而不是每类物品一条。
3. **一个维度多系统引用**：地块的"治安值"同时决定执法响应、运输风险、资源富度、精炼/作业加成、可建设施。给每块地一个连续值，让各系统从它派生，而不是枚举"城内/城外/荒野"。
4. **费率三分法**：所有费用 = 基准 × 线性折扣（技能/关系），再拆 NPC 固定部分（货币消失）+ 领主可变部分（货币转移）。市场、工坊、海关、仓储、保险统一用这个式子，领地租金就自然产生。
5. **拥挤税**：作业费 ∝ 本地活动工时 / 全局活动工时。防止所有生产挤在一处，无需硬上限。
6. **守备强度由使用度算**：ADM = 1 + Σ 各类活动指数，再线性映射到"攻城时间/脆弱窗口"。领地不是买来的，是住出来的。
7. **领地产能 = Σ 天体/地块属性**：Equinox 的电力/劳动力/试剂直接从恒星与行星类型求和。我们的"郡能开几个工坊"也应从地块属性求和，不手填。
8. **风险→运费的数值链**：治安 → 执法秒数 → 可输出伤害 → 可击毁 EHP → 每单位防御可载货值。让"安全"变成一个可算的价格，而不是开关。
9. **保险按材料估值、线性保费、违法不赔**：简单、可审计、与打劫经济学闭环。
10. **显式货币守恒账**：每一笔 ISK 增减打上"水龙头/下水道/转移"标签，按月出报表：生产/销毁/开采值、货币供应、流速、各项水龙头与下水道、服务分解（NPC 列 vs 玩家列）、区域贸易平衡、价格指数。参照量级：销毁 ≈ 供应 2%/月，流速 ≈ 0.4/月。

**要避开的坑**

11. 不把治安常数、分流比例、保险底线写进代码——放进"全局参数 type"的属性里，用同一套 effect 读。
12. 估值算法（EIV、保险估值）要可解释、可回溯，不做黑箱。
13. 组织（家族、行会、国家）与关系（站位、条约、租约）也要进统一模型，否则联军/租借/外交只能落到场外。EVE 这块是空白，是我们可以超过它的地方。
14. 不要让两套行为表示并存（EVE 的表达式树 vs modifierInfo）；一开始就定一种。
15. 报表要由事件流直接聚合，并带校验（如月末余额 = 上月 + 水龙头 − 下水道 ± 休眠变动），否则会像 CCP 一样错三个月没人发现。

---

## 12. 参考链接清单

**CCP 官方**
1. https://developers.eveonline.com/docs/services/static-data/ — 静态数据（SDE）官方页：格式、版本、变更日志
2. https://developers.eveonline.com/blog/reworking-the-sde-a-fresh-start-for-static-data — SDE 重做开发者博客（2025-09）
3. https://docs.esi.evetech.net/docs/dogma.html — ESI 文档：dogma 属性/效果/modifierInfo/表达式树
4. https://www.eveonline.com/news/view/monthly-economic-report-december-2024 — MER 2024-12（图表目录）
5. https://www.eveonline.com/news/view/monthly-economic-report-january-2025 — MER 2025-01
6. https://www.eveonline.com/news/view/monthly-economic-report-march-2025 — MER 2025-03（市场税下水道上升）
7. https://forums.eveonline.com/t/monthly-economic-report-december-2025/504563.md — MER 2025-12 论坛版
8. https://forums.eveonline.com/t/monthly-economic-report-may-2026/512928.md — MER 2026-05 论坛版
9. https://forums.eveonline.com/t/monthly-economic-report-february-2021/302188 — MER 2021-02（图表变更说明）
10. https://www.eveonline.com/news/view/equinox-expansion-notes — Equinox 更新说明（主权中枢、电力/劳动力/试剂、天钩、Metenox）
11. https://www.eveonline.com/news/view/viridian-expansion-notes — Viridian 更新说明（公司税抽 LP）

**EVE University wiki**
12. https://wiki.eveuniversity.org/Static_Data_Export — SDE 表与字段
13. https://wiki.eveuniversity.org/Stacking_penalties — 叠加惩罚
14. https://wiki.eveuniversity.org/Trading — 市场、销售税、经纪费、改单费、远程交易
15. https://wiki.eveuniversity.org/Market — 市场界面与区域性
16. https://wiki.eveuniversity.org/Jita — 贸易枢纽
17. https://wiki.eveuniversity.org/Manufacturing — 蓝图、ME/TE、作业费、系统成本指数
18. https://wiki.eveuniversity.org/Industry — 工业链总览
19. https://wiki.eveuniversity.org/Reprocessing — 精炼公式与税
20. https://wiki.eveuniversity.org/Planetary_Industry — 行星工业 P0–P4、海关税
21. https://wiki.eveuniversity.org/System_security — 安全等级与派生规则
22. https://wiki.eveuniversity.org/Suicide_ganking — CONCORD 响应与打劫经济
23. https://wiki.eveuniversity.org/Hauling — 运输风险、合同、货运公司
24. https://wiki.eveuniversity.org/Contracts — 合同类型、抵押、托管
25. https://wiki.eveuniversity.org/Insurance — 保险
26. https://wiki.eveuniversity.org/Asset_Safety — 资产安全
27. https://wiki.eveuniversity.org/Sovereignty — 主权中枢、ADM、争夺流程
28. https://wiki.eveuniversity.org/Upwell_structures — Upwell 结构
29. https://wiki.eveuniversity.org/Alliance — 联盟创建与维护费
30. https://wiki.eveuniversity.org/Corporation_logistics — 公司钱包、办公室、账单
31. https://wiki.eveuniversity.org/Tax — 各类税费汇总
32. https://wiki.eveuniversity.org/Encounter_Surveillance_System — ESS
33. https://wiki.eveuniversity.org/Loyalty_Points — LP 商店

**玩家媒体（仅补数字）**
34. https://evenews24.com/2017/12/15/leaky-faucets-money-supply-in-the-economic-report/ — 2017 水龙头/下水道数字
35. https://imperium.news/?p=33436 — 2019-07 MER 服务分解数字
36. https://tagn.wordpress.com/2025/11/14/the-october-2025-eve-online-monthly-economic-report/ — 2025 各月销毁值表
37. https://nosygamer.blogspot.com/2025/12/eve-onlines-november-2025-monthly.html — 2025-11 货币供应校正与数据错误
38. https://imperium.news/rental-empires-eve/ — 租借体系（玩家视角）
39. https://forums.eveonline.com/t/tri-triumvirate-offering-nullsec-systems-for-rent-in-cloud-ring/317598 — 招租帖实例
40. https://forums.eveonline.com/t/live-on-the-edge-become-a-renter-edge-alliance/390667 — 招租帖实例（按税率）
41. https://www.gamesradar.com/rent-disputes-threaten-to-ignite-the-next-all-out-war-in-this-massive-space-mmo — 租金争端报道

**第 9 节系统清单补充引用**
42. https://wiki.eveuniversity.org/Skills — 技能
43. https://wiki.eveuniversity.org/Implants — 植入体
44. https://wiki.eveuniversity.org/Fitting_ships — 装配
45. https://wiki.eveuniversity.org/Electronic_warfare — 电子战
46. https://wiki.eveuniversity.org/Drones — 无人机
47. https://wiki.eveuniversity.org/Capital_ships — 旗舰
48. https://wiki.eveuniversity.org/Clones — 克隆
49. https://wiki.eveuniversity.org/PLEX — PLEX
50. https://wiki.eveuniversity.org/Mining — 采矿
51. https://wiki.eveuniversity.org/Research — 研究
52. https://wiki.eveuniversity.org/Invention — 发明
53. https://wiki.eveuniversity.org/Reactions — 反应
54. https://wiki.eveuniversity.org/Salvaging — 打捞
55. https://wiki.eveuniversity.org/Killmail — 击毁邮件
56. https://wiki.eveuniversity.org/Security_status — 角色安全状态
57. https://wiki.eveuniversity.org/Crimewatch — Crimewatch
58. https://wiki.eveuniversity.org/Jump_drives — 跳跃引擎
59. https://wiki.eveuniversity.org/Exploration — 探索
60. https://wiki.eveuniversity.org/Hacking — 黑入
61. https://wiki.eveuniversity.org/Wormholes — 虫洞
62. https://wiki.eveuniversity.org/Abyssal_Deadspace — 深渊
63. https://wiki.eveuniversity.org/Pochven — Pochven
64. https://wiki.eveuniversity.org/Tethering — 系泊
65. https://wiki.eveuniversity.org/Standings — 站位
66. https://wiki.eveuniversity.org/Missions — 任务
67. https://wiki.eveuniversity.org/Ratting — 赏金/打怪
68. https://wiki.eveuniversity.org/Incursions — 入侵
69. https://wiki.eveuniversity.org/Factional_Warfare — 派系战争
70. https://wiki.eveuniversity.org/The_Agency — 代理窗口
71. https://wiki.eveuniversity.org/Project_Discovery — Project Discovery
72. https://wiki.eveuniversity.org/Fleet_leadership — 舰队
73. https://wiki.eveuniversity.org/Wars — 战争宣告
74. https://wiki.eveuniversity.org/Overview — 总览列表（按类别过滤）

**取不到 / 未用**
- 系统清单中 404 的专页：Bounty/Bounties（玩家赏金）、Kill_rights、Combat_boosters、Warp_drive、Structure_vulnerability、Starbases、Skill_Injectors、Omega_clone_state、Local、Homefront_Operations、Daily_Goals、Ship_SKINs、Creating_a_corporation、Timers、Agents_and_standings
- https://wiki.eveuniversity.org/Corporation_management、/Taxes、/Corporation — 404
- https://developers.eveonline.com/docs/services/sde/ — 404（已被 static-data 页取代）
- https://docs.everef.net/datasets/reference-data.html — 只有端点清单，无字段定义
- CCP 2016 年引入 MER 的原始开发博客 — 搜索未找到原文，只找到论坛转述
- MER 各期图表中的具体数字（官方页只有图，不下载 CSV）
