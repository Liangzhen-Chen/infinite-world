# 全系统写死自查报告（只读，master d54c89a3）

口径：引擎规则代码 = server-plugin/*.mjs（303 个文件，63244 行），另把 legacy/、compat/、migrations/ 单列。所有数字都是本次 Grep 的实际命中数（按行或按匹配计，各处已注明）。t-mktw（bcf85ec9）和 t-ec1（2ae38ce1）两个分支的同口径计数和 master 一样：物品 id 字面量都是 103，睡眠正则都是 83。也就是说，这两个分支没有新增写死，也没有减少写死，下面的结论对三条线都成立。

## 一、总览表

| 系统 | 写死实例（id 字面量） | 自由文本正则分类 | 专项规则 | 维度分裂 | 跨系统直写 | 严重度 |
|---|---|---|---|---|---|---|
| 世界生成/人口/文化（remote-generation 等） | 65 | 4 | 文化→物种→职业整表写在代码里 | 4 套文化解析 | 直写 npc coins | 高 |
| 经济/物品/库存/生产 | 58 | 7 | 日耗只覆盖燃料和盐；周贸易只有一种粮；库存只有 food/wood/stone/iron 四类；建材只有木和石 | 食物 3 套读法；物品类别 3 套 | coins 双写 | 高 |
| 生态/资源场 | 12 | 3 | 林场只认 item_wood；活鱼单列；renewable 通用律没有接上 | 地形 6 套解析 | — | 高 |
| 职业/技能/教育/医疗 | 29 | 7 | 职业→领域按 id 映射；召唤师、骑士单列 | 职业=自由文本 | — | 高 |
| 治理/法律/贵族 | 28 | 3 | 只受理盗窃报案；罚则 4 处查表 | 机构类型靠 purpose 正则 | treasury 双写 | 中高 |
| NPC 行为/社交/决斗/犯罪 | 0 | 6 | — | 人格没有结构化维度；“清醒”判定 31 处本地定义 | memoryStream 22 个模块直写 | 中高 |
| 魔法 | 3 | 1 | 暗字、炭纹只认 item_charcoal | — | — | 中 |
| 信仰 | 0 | 0 | 求雨单独成套（rainfall） | 神祇靠 church.name 关联 | — | 低 |
| 战斗/生物 | 0 | 0 | — | — | — | 低（常数多） |
| 开局/迁移 | 3（另 legacy/compat 3） | — | 出生地缺省 loc_hw | — | — | 低 |

合计：规则代码里的实例 id 字面量有 **198 处，分布在 38 个文件**（正则包括 item_/loc_/npc_hw_/bld_/culture_/monster_/office_village|works_/skill_/profession_，已剔除 item_sale、monster_society 这类类别名）。对照来看：world/ 数据表里 item_ 的 id 定义超过 1.5 万处，属合规；tools/ 693 处（83 个文件）、tests/ 9554 处（532 个文件）、world/design/*.mjs 内容生成脚本 3636 处，这三类另计。

## 二、各系统详述

### 1 世界生成/人口/文化（最重）
- `remote-generation.mjs`（919 行）在运行时生成远方聚落，内容全写在代码里：
  - :109-111、:149-150：按 culture_far_orc / culture_far_lignum / culture_beast 分支；
  - :146：`SPECIES={orc:'monster_split_tusk_orc',…}`，物种 id 写死；
  - :149：按名字首字（'锉' / '磐'）判定物种；
  - :200-209：命名库、姓氏写在代码里；
  - :279-281：酒馆、铁匠、杂货三类店的货单列了 30 多个 item id；
  - :318：GRAIN 物品清单；
  - :341：疫病只让 item_herb 涨价；
  - :407、:423：`seat.id==='loc_capital'` 时人口取 1500-1900；
  - :411：`/黑炉/.test(county.name)` 按地名改种族比例 0.62/0.32/0.06；
  - :416-417：各文化的职业清单写死。
- 这个文件里有 12 处 `int(rng,a,b)`，十进制常数 56 个（全仓库第一）。
- 文化解析有 4 套：`faith-state.mjs:10 faithCulture`、`norm-stack.mjs:79 placeCulture`、`population.mjs:88 topCulture`、`remote-generation.mjs:115 mainCulture`。

### 2 经济/物品/库存
**专项规则（只覆盖部分实例）：**
- 家户日耗：`item-class.mjs:118-124` 的 householdUsage 只返回 fuel 和 salt 两类。布、工具、灯油、药都没有日耗。这正是 PLAN 里李白指出的问题。
- 周贸易：`world/meta/rules.json:6265` 只配了一个 `"item":"item_oats"`。`settlement-trade.mjs:92` 只给这一种物品做区域定价（`if(item!==r.item)return base*environment`），:216 只认 `batch.kind!=='grain'`，:305 缺省回退 'item_oats'。
- 聚落库存：`stock.mjs:46-50` 只有 food/wood/stone/iron 四个槽，其中 food 走 granary 专门通道；:31 `GRAIN='item_oats'`。
- 建材：`public-projects.mjs:119/130/167/347-348`、`building-maintenance.mjs:49` 只有 `[['item_wood',…],['item_stone',…]]` 两种。`transport.mjs:170-172` 造车船只用 item_wood 和 item_iron。全仓库 `.wood` / `.stone` 字段读了 89 处。
- 捕鱼做饭：`extraction.mjs:147-150` 写死要 item_fish、item_water、item_charcoal 各一份。
- 委托：`quest-board.mjs:105/260` 只认 item_whittling_knife。
- 刑法：`law.mjs:484` 损毁估价回退 'item_oats'。

**维度分裂：**
- 物品类别有三套：`traits.mjs` 里代码内的 ITEM_TAGS 表、world/meta/item-use-tags.json 的 classes、material-props.json 的 classes。items.json 的 486 件物品里没有材料字段，要靠 tags 去推。
- 食物价值有三套读法：`.satiety` / `.nutrition?.satiety`（43 处）、`.hydration`（37 处）、materialProps 的 energyDensity。

**跨系统直写：**
- npc 的 coins 被 22 个模块直接写；player coins 直写 52 处。与此同时 moveCoins 账本调用有 117 处，两边双写。
- 典型例子是 `titles.mjs:128-131`：先用 moveCoins 记账，再直接把 `settlements.loc_capital.treasury` 加上同样的数，贡金的去处也写死成王都。聚落 treasury 被 8 个模块直写（12 处）。

### 3 生态/资源场
- 林场只认木材：`forest-water.mjs:18` `FOREST_ITEM='item_wood'`，:199 只对 item_water 加系数，:206 另判 wood；`sites.mjs:29/574-575/642-644` 也只认木材；`stock.mjs:175` 的 forest 只记木材储量。
- 鱼另走一套：`extraction.mjs:39`、`stock.mjs:312`、`remote-generation.mjs:723` 都单独处理 item_live_fish。
- `husbandry.mjs:24` 的 item_pasture_forage 也单独写。
- `renewable.mjs:1` 的注释自己写明 “not yet wired into sites/forest-water”。通用的再生律已经写好，但没有接上。
- 地形有 6 套解析：
  - `traits.mjs` 的 TERRAIN 按汉字映射；
  - `water-cycle.mjs:13` 按 `/山|岭|崖/` 定海拔；
  - `remote-generation.mjs:263/321` 定路速和湿地；
  - `forest-water.mjs:75` 按 `/针|松|杉/` 定林型；
  - `wildlife-habitats.mjs:30` 做文本匹配；
  - `regions.mjs:44` 的 terrainBiomes。
  locations.json 里 terrain 文本有 458 处，结构化 tags 只有 24 处。

### 4 职业/技能/教育/医疗
- 职业→领域按 id 映射：
  - `hidden-passives.mjs:69-71`（profession_life_5→metalwork、_21→ferment、_19→medicine）；
  - :88 的 domainSkills 是一张按 life(n) 编号的表；
  - :123 只给 profession_hidden_03 写了违约补偿。
- `pets.mjs:26-27` 只有 profession_summoner 和 profession_knight 有宠物规则。
- 技能 id 写死：
  - `medicine-state.mjs:9` MEDICAL_SKILL；
  - `works.mjs:30` 写了五个技能；
  - `extraction.mjs:118`、`wildlife.mjs:314/337`、`quest-board.mjs:103`；
  - `magic-care.mjs:167` 按 'skill_gardening' 或名称含“园艺”查找。
  - skill_literacy 共 16 处。
- 职业本身没有结构化维度。`entity-view.mjs:140-146` 的 personOccupation 返回的是中文句子，别的模块再用正则去拆：`finance-bank.mjs:100` 的 `/钱庄|商旅|商人|掌柜/`、`finance-assets.mjs:241/243`、`transport.mjs:183`。同一个概念有 occupation（数据 843 行）、profession、job、career、role 五个名字。
- 机构类型靠名称正则：
  - `facility-state.mjs:35-36` 的 facilityKind 已经是统一入口，可是全世界只有 1 处 facilityType 数据，其余 435 处 purpose 都是自由文本；
  - 有了 facilityKind，`education-state.mjs:238/279`、`medicine-state.mjs:29/39`、`law-codes.mjs:59`、`finance-assets.mjs:234/302/537`、`water-cycle.mjs:33` 仍然各自再写一遍正则。

### 5 治理/法律/贵族
- office_village_head 写死 15 处（`entity-view.mjs:46/55/75/83/90`、`governance.mjs:509`、`elections.mjs:40` 等）。`high-nobility.mjs:48` 列出了 `['office_village_head','镇长','城主','郡守','省督']`。
- loc_capital 写死 10 处：`law-codes.mjs:114-115`（终审法院）、`high-nobility.mjs:25`、`titles.mjs:129-131`。
- `finance-tax.mjs:36` 按政体名称正则（`/部|帐|兽/`、`/联|盟|议|城邦/`）判定税制。
- 法律只受理盗窃报案：`law.mjs:281` `if(!['theft','theft_attempt'].includes(offense))`。罚则要串查 4 张表：`law.mjs:104` codePenalty ?? spellConsent ?? bribery ?? activity…。规则代码里出现罪名字面量 118 处（17 个文件）。

### 6 NPC 行为
- 人格没有结构化维度：`duels.mjs:19`、`npc-crime.mjs:42`、`nation-founding.mjs:223` 都是把 personality 序列化成 JSON 再做中文关键词正则，打分是 25/20/30 这样的手填数。
- “清醒/能行动”的判定极度分散：
  - 统一入口 canAct 只有 15 个文件在用；
  - 本地 `const awake` 定义 31 处；
  - 判断睡眠的正则 83 行，分布在 62 个文件；
  - `['死亡','濒死','昏迷'…].includes` 118 处，分布在 81 个文件，各处的状态列表还不一样（有的含“患病”，有的不含）。
- 状态字段被大量模块直写：npc.memoryStream 被 22 个模块直写；records 有 89 个模块写、311 处写点；npcs 有 55 个模块写、196 处写点。

### 7 魔法 / 信仰 / 战斗
- 魔法：`magic-marks.mjs:15`、`magic-object.mjs:40` 只认 item_charcoal。按通用规则，这里应该用“有炭含量（charYield）的材料”来判断。
- 信仰：代码里没有 deity_ 字面量，属合规。但 `faith-catalog.mjs:8` 按 `church.name===f.name` 用名称关联神祇；求雨（`faith.mjs:81/227` 的 faith_rain）是唯一有世界效果的祭仪。
- 战斗：没有实例 id，问题是常数写在代码里：`combat.mjs:72-73` 的 clamp 0.1/0.98/0.45、`activities.mjs:176/208` 的 maxHp*0.25 退让阈值、`creature-nature.mjs:9` 的 weak 1.5/resist 0.5、`magic-status.mjs:34-36` 每层 0.02。

### 8 手填常数
- 规则代码（不含 legacy/compat/migrations）里有十进制字面量 294 个，分布在 89 个文件。前几名：remote-generation 56、item-class 11、scheduler 10、stock 9、market 9。
- 不常见的整数字面量（已排除 0/1/2/7/10/16/24/30/36/60/100/365/1000/1440/10000）有 2301 个，这个数会把下标、编码等也算进去，偏粗。前几名：remote-generation 104、advance-registry 81、engine 59。
- `difficulty:数字` 写死 26 处。
- 规则来源有两个入口：engine.rules（world/meta/rules.json，57 个顶层键，代码读取 777 处），另有 11 处直接 import world/rules/tables/balance/*.json，涉及 10 个模块（carry、currency、law、market、npc-life、transport 等）。

## 三、现有的好底座

- 账本/账户层：`ledger.mjs`、`money.mjs`、`stock.mjs:44-62` 的账户键是 `<持有人>|<资源>|<用途>`，有 84 处 declareLedgerWriter。所有物品和钱都能走同一个 moveStock / moveCoins。
- 材料属性：`item-class.mjs:279` 的 MATERIAL_DIMENSIONS（含水率、可食比例、能量密度、热值、炭产率、餐量上限），按类别优先级派生，并且带出处。这是物品统一维度的雏形。
- 特性词表：`traits.mjs` 把物品、生物、地形、设施、法术统一成一套 tag 和元素词表（ELEMENTS、CREATURE_TAGS）。
- 注册式入口：registerAdvanceHook 31、registerEffect 25、registerMagicEffect 18、registerIncident 16、registerWorldEventSubscriber 15、registerAutonomyProvider 8、registerQuestGenerator 6、registerValuer 6。
- 本体表：world/ontology 下有 derived-fields（26 个派生字段）、primitives（21 个原语）、verbs（107 个动词）、tags（480 个标签）。
- 统一读取入口：entity-view 的 person*() 访问器被调用 368 次；canAct 统一的行动能力判断；facilityKind；renewable.mjs 的通用再生律（与 id 无关，但还没接上）。

## 四、结论：需要底层大调，但不是推倒重写

理由：账本、注册表、原语、材料属性这些骨架是对的，可以留用。问题集中在“维度层”缺位：地点类型、职业、人格、地形、文化都没有结构化维度，只能靠中文文本正则推出来；物品的经济行为也没有按类别统一，而是按燃料、盐、粮、木、石、铁逐个手写。这种情况靠逐卡打补丁修不好，必须先把维度层补起来。

**需要重做的系统：**
1. 物品经济行为。日耗、库存槽、贸易、建材、林场、渔获统一成：每个物品类别都有用度、来源、流转，表驱动，一次覆盖全部类别。
2. 地点维度：设施类型、地形、生物群落、海拔变成结构化字段，彻底取代 purpose / terrain 正则。
3. 人物维度：职业（职业→技能、领域、服务的映射表）、人格（结构化维度）、行动能力状态（只保留一个入口）。
4. remote-generation 的内容要移进数据表，代码只保留通用生成规则。

**可以渐进改的系统：** 治理（官职、首都改成按等级和属性查询）、法律（罪名受理和罚则统一到一张表）、魔法（耗材改为按材料属性判断）、信仰（改用 id 关联）、战斗常数进表、coins/treasury 双写收口到账本、balance 的直接 import 改走 engine.rules。

**建议的统一底层骨架：**
- 维度表（world/ontology/dimensions/）：item（类别、材料、用途、营养、热值、耐久）、place（facilityType、地形、群落、海拔、所有者、准入）、creature/person（物种、文化、职业 id、人格向量、身体状态）、culture、deity、office（等级、辖区层级）。每张表配一份校验器，缺字段直接报错，不允许回退去解析文本。
- 统一入口：每个系统一个 view() 读函数，比如 itemView、placeView、personView、cultureOf。状态谓词（清醒、在场、能签约）只在 action-capacity 定义。
- 系统间接口：一切数量流动只走 moveStock / moveCoins；事件走 world-event 订阅；状态写入按 holding-sources 声明写者，禁止跨模块写 npcs.* 和 settlements.*。
- 通用规则层：规则只读维度，遍历全部类别或实例，例如“每个有日耗率的类别每天扣”“每个有再生率的资源场都按 renewable 律生长”。常数一律放在 engine.rules 里。

**验收标准草案（都可以用 Grep 判定，只统计 server-plugin，不含 legacy/compat/migrations）：**
1. 实例 id 字面量从 198 降到 0（开局缺省值也要从配置读）。
2. 对 name / purpose / occupation / personality / terrain / polity 做中文正则分类：38 行降到 0。
3. 睡眠正则和本地 awake 定义只允许留在 1 个模块。
4. 跨模块直写 npcs.coins、settlements.treasury、npcs.memoryStream 降到 0，只能通过接口。
5. 直接 import balance json 降到 0；十进制常数只允许出现在规则表或带名字的物理常数里。
6. 扩展性测试：只在表里新增一个物品类别、一种设施、一种职业、一种地形，不改代码，就能自动获得日耗、贸易、库存、受理、产出等行为。
7. 现有全量测试中，凡是行为变化，都要逐条说明是因为“规则一类一起覆盖”，不允许按旧数值打补丁。

## 五、风险与工作量粗估

- 影响面：实例字面量涉及 38 个文件；文本正则涉及 25 个文件；清醒判定涉及 62 个文件；coins 直写涉及 22 个文件；合起来大约 90-110 个模块。测试里有 9554 处 id 字面量，大量测试按旧数值手推（比如 MKTW 的“D01 面包 12 文”），会成片失效，需要重新推导预期值。
- 风险：
  - 数据补维度：435 个地点要补 purpose 对应的设施类型；843 行职业数据要映射到职业 id；人格要结构化。这些需要内容审批，工作量可能比改代码还大。
  - 存档：按规矩不做旧存档兼容，但同版确定性必须保持。
  - MKTW、EC-1 两个分支是在旧形状上做的局部修补，大调后大部分要重做，不要先合入。
- 粗估：维度表和校验器约 4-6 张卡；物品经济重做约 8-12 张卡；地点、人物维度及读取方改造约 10-15 张卡；remote-generation 数据化约 3-5 张卡；渐进项约 10 张卡；合计约 35-50 张卡。按现在的节奏，加上两轮审查和全量云测，大约需要 3-5 周。最大的不确定性在于数据补维度的内容量和测试重推的工作量。
