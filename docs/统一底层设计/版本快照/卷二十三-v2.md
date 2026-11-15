# 卷二十三 艺术、文学与文化产物（第二版）

起草 claude-fable-5-2 中档／审查 claude-opus-5-5 中档

改稿 claude-opus-5-5 中档（第二版，按 `审查/卷二十三-一审.md` 与李白 11-14 对 §8 的裁定修改；第一版快照 `版本快照/卷二十三-v1.md`；修订记录见卷末）

状态：第二版成稿（§0–§8、术语表、待补清单、修订记录齐；自检输出见卷末附录）。待二审。

（2026-11-13 起草，11-14 改第二版。模板头硬约束，出自卷一 §0.4：① 规则里不出现任何实例 id，也不从 id 反推类别；② 规则层一行不读任何语言，字符串只许是登记过的代号；③ 不为具体的人、组织、地区、职业、作品写专项规则；④ 常数只在规则表；⑤ 一个系统一个读入口、一个字段一个写者；⑥ 不读墙钟；⑦ 凡除法写明除数的正下界或为 0 时的分支；⑧ 凡逐次改写的数值存储量写明存法、余数与误差界，口径只引卷二 §3.3（求值管线）“存量与余数结转”。）

---

## §0 卷首

### 0.1 范围

本卷定义“人造出来给人看、给人听、给人记的东西”：一件作品是什么、它的题材从哪里来、它用什么形式、怎样当众演出、怎样被抄印和流传、怎样成为传奇、一件器物怎样因独一无二和出名而更贵、娱乐怎样结算，以及美观怎样交给需求一侧。共九个子系统：作品实体与单件美观值；雕刻、装饰与取材；艺术形式按文化；表演与演出；出版、抄写与流传；传奇的推广与升级；文物的唯一性与名气加成；娱乐（竞演与博戏）；美观需求接口。

不在本卷：

- 品质怎样滚档、工时、产率、失败：只在卷三乙 §4.8（配方通用规则（继承、产率、递归））的 `craftOutcome` 一处。本卷任何一步都不算品质，只读品质档代号，或登记品质表的列。
- 书与文书的物性、抄本代数、伪造：卷三乙 §4.15（书与文书物性）。估值公式与稀缺度：卷三乙 §4.16（估值公式与稀缺度派生）；价格形成：卷六 §4.21（价格四角色）；市场需求：卷六 §4.4（市场需求）。
- 知情、传闻失真、公共知情、知识持有与失传、文书所载的事实：卷二十二 §4.2（知情来源与通道）、§4.4（传闻与失真表）、§4.5（公共知情与统计层）、§4.6（文书阅读、语言、代读、译本）、§4.10（知识持有与失传）。本卷只把“听过、读过、会唱”交给这些入口。
- 传说条目与真相层：卷十六 §4.4（妖怪志索引与传说真相层）。传说是带真相层的知识行；传奇是作品的一类（台账 X-24），两者不是一个概念。
- 运行实例（活动）的容器、阶段流转、席位、花费：卷二十四 §4.4（局势多阶段）、§4.6（活动）。演出是活动的一种，本卷只定演出作为活动的产物与评分读法（§4.4）。事件动词与事件类型表的格式：卷二十四 §4.2（事件类型注册与估值记录）；本卷只登记行。
- 威望、名望、名士：卷十八 §4.7。本卷只登记来源行。房间与场所的美观聚合：卷十九 §4.11（房间评价、美观、清洁）；场所：卷十九 §4.12（场所（酒馆、庙、图书馆））。美观需求与想法：卷二十六 §4.3（心理需求）。奇想的内容与完成条件：卷二十六 §4.7（灵感与奇想）。
- 技能与服务词表：卷十四 §4.1（职业维度表与服务词表）、§4.3（技能与熟练）、§4.10（失传、秘传与流派壁垒（传授限制维度））。文化偏好：卷七 §4.28（文化偏好输出接口）。语言：卷七 §4.27（语言与命名表）。法器与神器的修正键组件：卷十五 §4.12。
- 身体装饰（纹身、疤饰、发式）：本卷不收（Q23-3 已裁定），将来由卷四或卷二十一单点设计，不复用本卷的装饰件。
- 作品显示成什么字句、什么画面、什么声音：卷二十九（未成稿，标题按台账）。本卷的规则层没有一个字的作品内容。

### 0.2 依赖卷

| 依赖 | 拿什么 |
|---|---|
| 卷一 | 八个存储概念，见卷一 §4.1（八个存储概念）；硬规矩 R-1 至 R-9（R-3：作品描述只在显示层）；唯一求值管线（卷一 §3A.3） |
| 卷二 | `itemView`、`knowledgeView`，见卷二 §2.1（入口清单）；组件 `comp_work`、`comp_relic`，见卷二 §1.8（组件）、§5.23（未单独成表的实体与归属）；词表登记，见卷二 §1.9（代号、显示名与语言边界）；聚合原语 `wsum`、`count`，见卷二 §1.12（派生与聚合原语）；事件来源行公共字段与事件角色封闭枚举，见卷二 §1.14；写者声明，见卷二 §2.6（写者与三接口）；修正项格式与管线，见卷二 §3.2（修正项的格式）、§3.3（求值管线）、§3.5（作用域与状态键表）；知识表，见卷二 §5.21 |
| 卷三甲、卷三乙 | 材料维度与 `materialView`；`craftOutcome` 的提案与品质档；`rules.quality.tiers` 的列；取向 `emphasis`（卷三乙 R-8）；附件（卷三乙 §4.14）；抄本配方（卷三乙 §4.15 B-3）；`valuation`、`scarcity` |
| 卷五 | 感知判定的结果（谁在场、谁听得见），见卷五 §4.2（分区、方位与感知通道）；`sense` 族；`juris` 族（行政层级） |
| 卷六 | 账本 `post`，见卷六 §4.1（账本三元键与守恒）；市场需求，见卷六 §4.4；合同，见卷六 §4.16（合同状态机）；价格，见卷六 §4.21 |
| 卷七 | `culturePref` 及其 `norm`；艺术形式这一偏好种类；文化的语言，见卷七 §4.27 |
| 卷九 | 动作目录与持续活动，见卷九 §4.1（动作目录与当前活动）；原语执行器，见卷九 §4.2；通用检定与对抗检定，见卷九 §4.3（统一裁决流程与检定）R9-3.5、R9-3.6；能力行与难度行，见卷九 §4.7 |
| 卷十 | 生成物写回与 `instanceIdOf`，见卷十 §4.9（生成物写回同一数据格式）、§4.12（开局缺省与生成期键域） |
| 卷十三 | 个人战斗结算，见卷十三 §4.1（个人战斗结算）（斗类竞演的胜负由它出） |
| 卷十四 | `skillValue`、`skillRef`、服务条目与 `canOffer`；语言技能行（`isLanguage`、`written`）；`transmission` 与 `admits` |
| 卷十六 | `loreOf`（传说条目可作题材） |
| 卷十八 | `esteem.sources` 来源行格式、`esteemOf`；记忆显著度 `recall`；立场读数；家族归属，见卷十八 §4.3（家族与传承）、§4.5（关系、记忆、认知与谎言） |
| 卷十九 | `facilityView().services`、`rating.impression`；固定装置 `fixture` 族 |
| 卷二十 | 到期项与同刻全序，见卷二十 §4.1（刻、同刻全序、调度器与到期语义） |
| 卷二十二 | `subjectiveView`、`recallFacts`、`publicShare`、`loreShare`、`holdsLore`、`knowStanding`；写者 `noteKnowing`、`notePublic`、`grantLore`、`notePublicLore`、`writeContent`；`kchan` 族；`carrier` 枚举 |
| 卷二十四 | `verb` 族与表 B、事件类型表与表 C；活动的运行实例 `state.events.instances`、`actrole` 族、`instanceStep`；事件上的 `eventSig` |
| 卷二十六 | `preferenceOf()`；`psych.episodes[].picks`；消遣效果所属的效果族 |
| 卷二十七 | 骰值键，见卷二十七 §4.8（种子键与骰值键（确定性约束与验收））R27-8.5、R27-8.9；运行矩阵，见卷二十七 §4.1（三层模拟运行矩阵）R27-1.5 |

### 0.3 覆盖的卷零行

- A 表主归 2 行：1.14 艺术作品与出版（卷零-覆盖表.md 第 150 行）、6.12 艺术与娱乐（第 250 行）。
- B 表主归 2 行：9.25 传奇（卷零-覆盖表.md 第 684 行）、9.26 艺术、雕刻、文学、学术、表演（第 685 行）。
- 合计 4 行，与卷零 §6 的统计一致。兼及：A 表 6.10（第 248 行，主归卷十六 §4.4）、12.7（第 341 行，主归卷十八 §4.7）；B 表 1.20 文物神器（主归卷十五）。兼及行本卷只在 §5 给接口。§4.2、§4.3、§4.9 是接口或派生小节，不对应独立行（卷零 §7）。

### 0.4 参照的五款游戏行

| 来源 | 行 | 取什么 | 不取什么 |
|---|---|---|---|
| DF | 01 §7.5 #63、#64；§5 | 雕刻与雕像的题材取自世界里真实发生的事、真实存在的神与器物；墙面、崖面可刻；诗、乐、舞的形式按文明在生成期造出来，仍是普通数据行；表演者在场所演出 | 把形式的文字描述当规则；神器由“奇想”单独一条代码路径产出 |
| 环世界 | 03 §15 #31；§10.5 | 单件美观 = 基值 × 品质因子；作品描述由历史事件生成，只在显示层 | 美观基值逐物手填（本卷 `beautyForm` 写在物品类别行上，经继承取值，模板只许写偏离行，见 §2.2） |
| CK3 | 05 §6.4 #46 | 传奇从一颗种子起，靠同语言、邻接、亲友传播，按覆盖的地方数升级 | 传奇的固定三档与专用决议；只有君主能推广 |
| CK3 | 05 §6.1 #14 | 文物的身价与它的经历有关 | 手填的稀有度档（台账 S-19：不设手填稀有度） |
| CDDA、EVE | — | 无相关段落 | — |

### 0.5 读法

先读 §1.3 的总机制与 §2 的表，再读 §4.1、§4.4、§4.5；其余六节建在这三节上。规则编号 `R23-节.序`，断言编号 `A23-节.序`，扫描条 `S23-序`，配合项 `C23-序`，开放问题 `Q23-序`，迁移项 `M23-序`。正文里出现的数值都是占位，待标定；需要查证的事实与数值列在卷末“待补清单”，不凭记忆填。数据实例里的实体一律写成‹指称›，不写 id。

---

## §1 领域总述

### 1.1 真实世界怎样运转

1. **作品有两层**。一层是“内容”：一首歌、一个故事、一种纹样，它可以只活在人的记忆里，靠口耳相传，会唱的人都死了它就没了。另一层是“载体”：一卷抄本、一尊像、一面刻了图的墙，它是一件实物，会旧、会碎、会被偷。同一个内容可以有很多载体，也可以一个载体都没有。
2. **作品由料、手艺、想法三样合成**。同一位匠人拿软石与拿硬玉，刻出来的东西不一样；同一块玉在学徒与宗师手里不一样；同一位宗师想刻什么、想怎么刻，结果又不一样。
3. **题材来自作者知道的事**。人只能画他见过、听过、信以为真的东西。他偏爱什么、怕什么、敬谁、受谁之托，决定他从知道的事里挑哪一件。
4. **形式属于文化**。几言几句、用什么乐器、几个人跳，是一群人长期约定出来的；外人学得会，但得学。
5. **演出是一次有主办、有场地、有来客的活动**。它需要演的人、看的人、一个地方、一段时间。看的人得到消遣，也顺便记住了内容；演的人得到赏钱和名声。
6. **流传靠抄、印、演、讲**。每多一个会的人、多一份抄本，内容就走远一点。
7. **出名的东西更贵**。一件器物值钱，除了料和工，还因为它经历过大事、出自名手、世上只此一件。仿品再像也不是原件。
8. **娱乐有三种来源**：看别人的本事（演）、看胜负未定的较量（斗、赛）、把钱押在不确定的结果上（赌）。三者常常叠在一起。

### 1.2 本作现状

- 署名作品只有写作与出版一条路（works.mjs，314 行）：规则常量表 `WORK_RULES`（works.mjs:29–33）写死五个技能 id（works.mjs:30，调研 06a §4）、五个物品 id 与四个常数（works.mjs:31–32，卷三乙 §7 第 27 行已列），赏钱以中文检定档名为键（works.mjs:32）；works.mjs:36 写死中文品质档名表，:43 `workQuality` 按中文检定档名自行定品质档（`craftOutcome` 之外的第二个定档处）；works.mjs:264 用 `includes` 匹配中文错误消息（调研 06b F 类）。逐条见 §7。
- 艺术与娱乐的职业在职业表里有，演出事件没有（卷零 A 表 6.12）。雕刻、装饰没有题材，作品没有美观值；房间美观另算。
- 名士与声望读作品数（notables.mjs:30–34），归卷十八 §4.7 改建；本卷只提供派生计数。
- 传说索引 953 条在草稿区（卷零 A 表 6.10），归卷十六；传奇（推广与升级）没有任何实现。

### 1.3 总机制（一页读完）

1. **内容是一条知识行，载体是一件物品**。作品内容（下称“作”）是知识表里一条生成行，种类维度指向本卷的作品种类；谁会它、它失传没有，全走卷二十二现成的持有与 `knowStanding`；铸成只经 `mintComposition`。载体是挂 `comp_work` 的物品实例，`contentRef` 指向那条知识行。“作”只存代号与引用，不承载任何事实；文书载体所载的事实组在卷二十二的 `state.docContent`。没有新的实体类，也不设 `state.works.*`。
2. **持有“作”不钉个体**。会一首歌是一条普通的 `knows` 边，按卷二十二 R22-5.7、R22-10.7 在折叠时并入群体；观众不逐人写持有，演出只给场地所在群体的持有率注入一次。
3. **创作是一次制作**。写、刻、谱、绘都是配方；品质档由 `craftOutcome` 按料、技能、意图三方合力算出，本卷不另算。本卷在这一次制作之外只补三样：题材（从作者的主观视图里按权重抽）、形式（作者所会的形式条目）、做法与取向的记录。
4. **美观是一切物品的派生维度**。`beauty` = 形露系数 × 料的观感 × 覆盖份额，再经品质、取向、磨损等修正项。装饰是挂在宿主上的另一件物品（装饰件），自己有料、有匠、有品质，各算各的美观。一个代号，全书一处定义。
5. **演出是活动的一种**。一场演出是卷二十四的一个活动运行实例；节目单写在起始事件的载荷里；每一出是演者的一次动作，按“解算方式”分三种：演（检定）、较量（对抗检定或战斗）、抽（纯机运）。观众得到效果族的输出与知情；演者得到账本转移。
6. **流传不存计数**。“有多少地方知道”“还有几件载体”都由公共知情、持有率、实例索引派生。传奇的档也是派生：覆盖了多少个地方就在哪一档。
7. **名气与唯一性是读数**。一件器物的名气由“与它相关的事有多少地方知道”、作者的威望、内容的流传派生；唯一性由“世上完好的同内容载体还有几件”派生。两者合成估值里的名气加成，不存稀有度。

---

## §2 维度表

格式按卷二 §1.2（表头）；类型按卷二 §1.5（类型清单）。键全部是 ASCII 代号，显示名在 `labels.<lang>.json`，规则层不读。标“新”的由本卷登记（写卷须知“补充裁定”第 1 条：新维度、词表族由本领域卷在自己的 §2 定义并登记，收尾时汇入全书登记表）。

### 2.1 本卷拥有的词表族与封闭枚举

| 族（前缀） | 开放或封闭 | 条目字段 | 含义 |
|---|---|---|---|
| `workkind`（`workkind_`）新 | 开放 | `medium: ref vocab medium`；`embodied: boolean`；`carries: boolean`；`commemorates: boolean`；`subjectSlots: struct{min: integer, max: integer}`；`subjectKinds: set<enum subjkind>`；`skill: skillRef`；`classes: set<ref vocab class>`；`carriers: set<enum carrier>`（卷二十二 §2.1 的载体类）；`transmission`（卷十四 §4.10 的传授限制取值，可空）；`learnDifficulty: score`；`broader` | 作品种类。`embodied` 为真表示必须有载体（像、画），为假表示可以只活在记忆里（歌、故事）；`carries` 为真表示可载知识（卷二十二 R22-10.5）；`commemorates` 为真表示以纪念某个主角为目的，可成为传奇（§4.6）；题材槽数与可作题材的对象种类；`skill` 是生成形式条目时取的技能类（R23-3.3）；`classes` 是该种类登记的类别（R23-1.6）；`carriers`、`transmission`、`learnDifficulty` 给“作”的知识行必填项（R23-1.2） |
| `medium`（`medium_`）新 | 开放 | `sense: ref vocab sense`（卷五的感知通道）；`temporal: boolean`；`verbal: boolean`；`written: boolean` | 媒介。经哪条感知通道被接收；是否在时间里展开（要演才存在）；是否用口语（听懂要过语言关）；是否用文字（读懂按卷二十二 R22-6.1） |
| `artform`（`artform_`）新 | 开放 | `workkind: ref vocab workkind`；`skill: skillRef`；`toolAbilities: map<ref vocab ability, integer>`；`performers: struct{min: integer, max: integer}`；`minutes: integer`；`difficultyAdd: number`；`learnDifficulty: score`；`shape: map<ref vocab shapekey, integer>`；`broader`；`generated`（卷十 §4.9 的三成员，可空） | 艺术形式。属于哪种作品；用哪项或哪类技能；要哪些工具能力（乐器、刻刀都只是带能力的物品）；几个人演；一次多久；演、作时加多少难度；学会它的一条“作”有多难；形制参数（只供显示层与相似度比较） |
| `shapekey`（`shapekey_`）新 | 开放 | `min: integer`；`max: integer` | 形制参数的键（单位数、每单位长度、声部数、速度档等，只是整数域）。`min/max` 是该键的硬取值域；`form.gen` 给的抽取区间必须落在其内（加载校验，E-WORK-FORM-KIND） |
| `subjrole`（`subjrole_`）新 | 开放 | `honors: boolean` | 题材在作品里担的角色。`honors` 为真的角色是被称颂者（传奇的受益人从这里取） |
| `technique`（`technique_`）新 | 开放 | `coverMax: fraction nullable`；`broader` | 做法（镂空、错金、浮雕、彩绘、刻、嵌等）。创作与装饰意图里的做法槽位填它（卷二十六 `picks` 的做法项填进这一槽位）；`coverMax` 非空时表示这种做法作装饰时一件装饰件最多占宿主表面的份额。做法只作记录与装饰份额上限，不进品质滚档（C23-2 ⑦） |
| `actkind`（`actkind_`）新 | 开放 | `resolver: enum actresolver`；`contestWay: ref vocab cway nullable`；`sides: struct{min: integer, max: integer}`；`service: ref（卷十四服务条目）`；`drawWeights: list<integer ≥ 0>` | 一出节目的种类。怎样解算；较量类按哪种解算方式；几方；对应卷十四的哪项服务；抽类各结果按位次 0…n−1 的权重（非 `draw` 类为空表） |
| `cway`（`cway_`）新 | 开放 | `via: enum cwayvia`；`skill: skillRef nullable` | 较量的解算方式：`opposed` 走卷九 R9-3.6 的对抗检定（双方技能取 `skill`）；`combat` 走卷十三 §4.1 的战斗结算 |
| `legendtier`（`legendtier_`）新 | 开放 | `minCoverage: integer ≥ 1`；`modifiers: list<修正项>` | 传奇档（§4.6）。档序就是 `minCoverage` 的升序（加载校验：各行 `minCoverage` 互不相同） |
| `subjkind` 新 | 封闭枚举 | `event`、`person`、`deity`、`item`、`place`、`org`、`species`、`knowledge` | 可作题材的对象种类。`event` 不是卷二 22 类实体之一，所以单设本枚举，不用 `enum kind` |
| `actresolver` 新 | 封闭枚举 | `perform`、`contest`、`draw` | 一出怎样得出结果 |
| `cwayvia` 新 | 封闭枚举 | `opposed`、`combat` | 较量走哪一个已封卷的入口 |

本卷登记的修正键两个：`item.beauty`（`better: higher`，`stacking: penalized`）、`knowledge.appeal`（`better: higher`，`stacking: penalized`）。第一版的 `show.score`、`item.renown` 两个修正键撤销：演出分改为一次 RX 合成（R23-4.3），名气改为纯读数（R23-7.2）。

`artform` 的行既可以手写，也可以由生成阶段写回（§4.3）。

### 2.2 维度

| 字段 | 所在 | 类型 / 单位 / 取值域 | 存或派生 | onUnknown | 出处 | 校验 |
|---|---|---|---|---|---|---|
| `beautyForm` 新 | 物品类别行（卷三乙 §4.3 的类别），经继承到模板 | number，≥ 0，无量纲 | 存（类别行写值；模板只许作偏离行） | gap | RW 03 §10.5 | ≥ 0；根类别行必须有值（缺省 0），所以经继承恒可取到 |
| `aesthetic` 新（请卷三甲收列并填值，C23-1） | 材料行 | number，≥ 0，无量纲 | 存（材料） | gap | RW 03 §10.5 | ≥ 0 |
| `coverShare` 新 | 物品实例（一切物品） | number，unit `fraction`，取值域 (0, 1]；缺省 1 | 存，制成时一次写入；只有装饰件写成小于 1 | skip（按 1） | DF 01 §7.5 #63 | 见 E-WORK-COVER |
| `hostRef` 新 | 实例，`comp_adornment` | ref kinds[item, place] | 存，制成时一次写入 | error | DF 01 §7.5 #63 | 所指实体存在 |
| `beauty` | 物品实例（一切物品） | number，≥ 0；`better: higher` | **派生**，可修正（修正键 `item.beauty`） | gap | 台账 S-20；Q23-2 已裁定 | R23-1.4 |
| `author` | 实例，`comp_work` | ref kinds[person, org] nullable | 存，制成时一次写入 | error | 卷二 §5.1 | 可空表示佚名 |
| `contentRef` | 实例，`comp_work` | ref knowledge（其 `workkind` 非空） | 存，制成时一次写入 | error | 卷二 §5.1 | 所指行存在 |
| `workChoices` 新 | 实例，`comp_work` | set<ref refs[vocab technique, vocab emphasis]> | 存，制成时一次写入 | skip（空集） | 卷二十六 Q13 | 元素都是登记代号 |
| `workKind` 新 | 实例，`comp_work` | ref vocab workkind | 派生 = `contentRef` 所指行的 `workkind` | error | 卷十四 `rel_edge_items` | — |
| `workClasses` 新 | 实例，`comp_work` | set<ref vocab class> | 派生 | skip | 卷二十六 Q13 | R23-1.6 |
| `workMatcats` 新 | 实例，`comp_work` | set<ref vocab matcat> | 派生 | skip | 卷二十六 Q13 | R23-1.6 |
| `workkind` 新 | 知识行（作） | ref vocab workkind nullable | 存（生成行） | skip | 本卷 | 非空者即“作” |
| `artform` 新 | 知识行（作） | ref vocab artform nullable | 存 | skip | DF 01 §5 | 其 `workkind` 与本行一致或为其上位 |
| `subjects` 新 | 知识行（作） | list<struct{role: ref vocab subjrole, kind: enum subjkind, ref: EntityId 或 EventId 或身份键}> | 存 | skip（空表） | DF #63；RW #31 | 条数在种类行 `subjectSlots` 内；`kind` 在 `subjectKinds` 内；`kind` 为 `person` 时 `ref` 是身份键（卷二十二 R22-1.5），为 `event` 时是 EventId，其余是实体 id |
| `composer` 新 | 知识行（作） | ref kinds[person, org] nullable | 存 | skip | 卷零 A 1.14 | — |
| `workTier` 新 | 知识行（作） | ordered enum quality（卷二 §5.1 同一枚举） | 存，创作那一次 `craftOutcome` 给的档 | error | 卷三乙 §4.5 | 是登记档 |
| `language` 新 | 知识行（作） | ref（卷七 §4.27 的语言代号） nullable | 存 | skip（视为不用语言） | 本卷 | 媒介 `verbal` 或 `written` 为真时非空 |
| `basedOn` 新 | 知识行（作） | ref knowledge nullable | 存 | skip | — | 所指行也是“作”；不成环 |
| `appeal` 新 | 知识行（作） | number，≥ 0，无量纲；`better: higher` | **派生**，可修正（修正键 `knowledge.appeal`；基值 `rules.works.appealBase`） | gap | 本卷 | R23-4.3 |

说明：`beauty` 在卷二 §5.1 记为 `comp_work` 的存储字段（卷二:1337、卷三乙:223 同一行）；按 Q23-2 的裁定，它改为一切物品实例的派生维度，onUnknown 取 gap，不再缺即 error；`author`、`contentRef` 仍按 `comp_work` 存储。卷二一侧的勘误只改 `beauty` 一列（C23-3）。其余各字段由本卷在此登记，不请卷二回填清单。卷二 §5.1 的 `rarity` 本卷不定义、不使用（台账 S-19，见 §4.7 与 C23-4）。

### 2.3 规则表（常数的唯一落点，`rules.works.*`）

| 键 | 形状 | 用在 |
|---|---|---|
| `beauty.wearCurve` | 曲线（x：`durability`；y：相对因子，≤ 0） | R23-1.4 |
| `appealBase` | number ≥ 0 | R23-4.3 |
| `subject.weights` | struct{`salience`, `stance`, `pref`, `culture`, `commission`: number ≥ 0}，且五项之和 > 0（加载校验） | R23-2.2 |
| `subject.poolMax` | 正整数 | R23-2.2 |
| `form.gen` | struct{`perKind`: map<ref vocab workkind, integer ≥ 0>（每个文化每种作品种类生成几条）, `ranges`: map<ref vocab shapekey, struct{min, max}>, `performers`、`minutes`、`learnDifficulty`、`difficultyAdd` 各一个区间} | R23-3.3 |
| `show.marginCurve`、`show.contestCurve`、`show.drawBase` | 曲线、曲线、number | R23-4.3、R23-8.2、R23-8.3 |
| `show.scoreRX`、`show.openAirImpression` | RX、number | R23-4.3 |
| `show.announceDays` | 正整数（演出事件类型行宣布阶段的 `durationDays`） | §2.5、R23-4.1 |
| `show.understandCurve` | 曲线（x：口语技能 `skillValue`；y：[0, 1]） | R23-4.5 |
| `show.recreationRX`、`show.tipRX` | RX、RX | R23-4.5、R23-4.6 |
| `spread.learnMinScore` | number | R23-4.5 |
| `reach.coverShareBps`、`reach.placeTier`、`reach.minPlaces` | integer 0–10000；ref vocab juris（卷五）；正整数 | R23-5.3、R23-5.6 |
| `relic.coverCurve`、`relic.originCurve`、`relic.contentCurve` | 曲线 ×3（值域 ≥ 0） | R23-7.2 |
| `relic.renownCurve`、`relic.uniqueCurve`、`relic.generationCurve`、`relic.bonusUnit` | 曲线、曲线、曲线、number ≥ 0 | R23-7.4 |
| `wager.rakeBpsMax` | integer 0–10000 | R23-8.4 |
| `modifiers` | list<修正项>（卷二 §3.2 格式） | R23-1.4、R23-6.5 |
| `roles.families.composition`、`roles.verbs.*`、`roles.types.show`、`roles.stages.*`、`roles.endcodes.*`、`roles.actroles.*`、`roles.kchans.*`、`roles.idslots.*`、`roles.streams.works`、`roles.sites.*` | 句柄 → 代号 | 规则引用别族代号的唯一途径（§2.5） |

RX 可读变量是闭集，逐条写在所用规则里；RX 的写法按卷二 §2.9 与卷十四 §2.8 的同一口径，不读任何文字。

### 2.4 运行态状态键

| 键 | 内容 | 写者 |
|---|---|---|
| 知识表 `generated` 节里 `workkind` 非空的行 | 作（内容） | 卷十的写回器，只经 `mintComposition` 调用 |
| `itemInstances.<id>.author / contentRef / workChoices / coverShare / hostRef` | 载体与装饰件上的存储项 | `kernel/dimension-writers.mjs`，制成时一次写入（卷三乙 §3.3 同一写者行，C23-2 ④） |

本卷没有自己的运行态容器：演出是卷二十四 `state.events.instances` 里的活动实例，写者是 `instanceStep`；持有与知情在卷二十二。本卷没有任何逐次累加的数值存储量：流传面、名气、传奇档全是派生读数，所以没有余数与误差界要写。

### 2.5 本卷登记的别族行（格式各归定义方；收尾汇入全书登记表）

| 族（定义方） | 本卷登记的行（句柄） | 字段要点 |
|---|---|---|
| 组件类（卷二 §1.8；先例卷十九 §2.3 `comp_fixture`） | `comp_adornment` | requires `hostRef`、`coverShare`。装饰件的组件；可拆的装饰不挂它，走卷三乙 §4.14 的普通附件 |
| `know_family`（卷二十二 §2.2：由登记知识行的各卷给值） | `roles.families.composition` | “作”的族值 |
| `verb`（卷二十四 表 B） | `roles.verbs.composed`（作品完成）；`roles.verbs.adorned`（装饰完成）；`roles.verbs.copied`（抄印完成）；`roles.verbs.showAnnounced`、`roles.verbs.showOpened`、`roles.verbs.showEnded`（演出的起始、换阶段、收场）；`roles.verbs.actEnded`（一出结束）；`roles.verbs.wagerSettled`（彩头结算） | 角色栏只用卷二 §1.14 的事件角色：完成、装饰、抄印、一出结束的 `actors` 是做事的人；`targets` 是产物或宿主；`related` 是所涉的“作”（无则空）。`payloadShape`：作品完成 `{piece: ref knowledge, carrier: ref item nullable, composer: EntityId nullable}`；装饰完成 `{host: EntityId, adornment: ref item, piece: ref knowledge nullable}`；抄印完成 `{piece, pieces: count, composer}`；一出结束 `{piece: ref knowledge nullable, composer: EntityId nullable, actkind: ref vocab actkind, actIndex: count, actCount: count, score: number, audience: count, margin: number}`；彩头结算 `{won: boolean, stake: 金额, stakeShareBps: integer}`；演出起始 `{program: list<struct{actkind, piece: ref knowledge nullable, sides: list<list<EntityId>>}>}`。`sigBase` 取 0，`worthSlots` 只登记彩头结算的 `stake`（计入 `moved`） |
| 事件类型表（卷二 §5.22 与卷二十四 表 C） | `roles.types.show`（一行，`family` 取卷二十四的活动句柄） | `mode: onEvent`（由卷九“举办活动”通用动作 C24-4 引出）；`roles`：主办（`roles.actroles.host`，名额 1）、演者（`roles.actroles.performer`）；`stageFlow`：宣布阶段 `roles.stages.announced`（催化 `showOpened`，`points` 1、`advanceAt` 1，转入演出阶段；`durationDays` 取 `rules.works.show.announceDays`，到期转结局 `roles.endcodes.cancelled`）、演出阶段 `roles.stages.running`（催化 `actEnded`；结局 `whenRX` 读触发事件载荷 `actIndex + 1 >= actCount` 时为 `roles.endcodes.done`）；`startVerb/stageVerb/endVerb` 取上一行三个动词；`upkeep` 空表（花费由主办按合同自付） |
| `evstage`、`endcode`、`actrole`（卷二十四 §2.1） | 两个阶段、两个结局、两个角色（上一行） | `actrole` 的 `minCount`：主办 1、演者 1 |
| 卷九动作行（卷九 §4.1） | 开演；演一出（`perform`）；较一出（`contest`）；抽一出（`draw`）；创作、装饰、抄印（制作动作的三种用法，动作专有槽位见 R23-1.2） | 演一出：`check.skill` 取形式条目的 `skill`；难度行读 `target`（所演“作”）的 `difficulty` 与形式条目 `difficultyAdd`；能力行读 `tool`（乐器、道具）的工具能力维度；`baseMinutes` 取形式条目 `minutes`，按卷九 R9-3.4 收工时检定 |
| 服务条目（卷十四 §4.1，PF-8） | 每个 `actkind` 行所指的服务 | `skill` 指技能或技能类；`requirement` 是人需求块；`hosted` 为假的可在无设施处开演 |
| `kchan`（卷二十二 §2.2） | `roles.kchans.audience`（按每个 `temporal` 媒介所用的感知通道各一行）；`roles.kchans.hearing`（听唱学会） | 观众行：`sourceKind: witness`、`firsthand: true`、`public: true`、`sense` 取该媒介的感知通道、`trustAxis` 空；听唱行：`grantLore` 的 `via`，对应卷二十二 R22-10.2 的 `work` 载体类 |
| 合同种类（卷六 §4.16，A6-16.3） | 彩头；创作委托 | 彩头：角色（押注方、对手方、可选庄家）、条款（所押的一出、所押结果、数额、赔率、抽成基点）、托管规则（押下即托管，一出结束按结果转出，取消或平局原路退回）；创作委托：条款含指定题材集合与 `honors` 角色指定、作品种类、酬金，完成证据为作品完成事件 |
| 威望来源行（卷十八 §4.7 `esteem.sources`） | 作品完成（`role: actor`）；抄印完成（受益人取载荷 `composer`）；一出结束（`role: actor` 给演者；受益人取载荷 `composer` 给作者） | `amountRX` 只读本卷动词行 `payloadShape` 里登记过的数值字段：`score`、`audience`、`pieces`；数额常数在卷十八规则表。“受益人取载荷字段”须卷十八来源行格式支持（C23-7） |
| `fixture`（卷十九 §2.3，开放族） | 一行“表面装饰” | `provides` 空、`abilities` 空、`stationSlots` 0、`footprintM2` 0：刻在地点表面的装饰件以它作固定装置（R23-2.1） |
| `idslot`（卷十 §4.12） | `roles.idslots.composition`（`clocked` 为真）；`roles.idslots.artform`（`clocked` 为假） | “作”与生成形式条目的实例位次（R23-1.2、R23-3.3） |
| 流与抽取点（卷二十七 §4.8 登记表） | 流 `roles.streams.works`；抽取点 `site.works.subject`、`site.works.formgen`、`site.works.draw` | 见 R23-2.2、R23-3.3、R23-8.3 |

### 2.6 校验（建议错误码，登记进卷二 §4.3（错误码表））

| 码 | 条件 |
|---|---|
| E-WORK-KIND-SLOT | `subjectSlots.min > max`；`subjects` 条数越界；`kind` 不在 `subjectKinds` 内；`ref` 的形状与 `kind` 不符 |
| E-WORK-FORM-KIND | 形式条目的 `workkind` 不存在；`performers.min > max` 或 `min < 1`；`shape` 的键不在 `shapekey` 族或值越出该键 `min/max`；`form.gen.ranges` 越出该键 `min/max` |
| E-WORK-EMBODIED | 配方产出挂 `comp_work` 的模板，而其作品种类 `embodied` 为真却没有任何材料组 |
| E-WORK-ACT-WAY | `resolver` 为 `contest` 而 `contestWay` 为空，或不为 `contest` 而它非空；`resolver` 为 `draw` 而 `drawWeights` 为空或权重和为 0 |
| E-WORK-COVER | 一个宿主上全部装饰件的 `coverShare` 之和超过 1；单件超过其做法的 `coverMax`；非 `comp_adornment` 实例的 `coverShare` 不为 1 |
| E-WORK-BASED-CYCLE | `basedOn` 成环 |
| E-WORK-LANG | 媒介 `verbal` 或 `written` 为真而“作”的 `language` 为空 |
| W-WORK-FORM-ORPHAN | 某形式条目没有任何文化对它的偏好权重为正（没有人会演） |

---

## §3 统一入口

### 3.1 读入口与谓词

读载体一律 `itemView`，读内容一律 `knowledgeView`；本卷不另设“作品 view”。下列都是纯函数，读 view，返回 Fact 或提案，不写状态。

| 入口 | 参数 | 返回 | 节 |
|---|---|---|---|
| `itemView(...).dims.beauty` | 实例 | Fact（已含修正） | §4.1 |
| `knowledgeView(...).dims.appeal` | “作” | Fact（已含修正） | §4.4 |
| `compositionOf(engine, state, itemRef)` | 实例 | 它的 `contentRef` 与以它为宿主的各装饰件的 `contentRef` 所指的全部“作” | §4.1 |
| `pickSubjects(engine, state, actorId, ctx)` | 作者、`{workkind, commission?, slots?, eventId}` | 提案：题材表 | §4.2 |
| `knownForms(engine, state, actorId, workkind?)` | 个体 | 他会的形式条目列表 | §4.3 |
| `actOutcome(engine, state, instanceId, actIndex, ctx)` | 演出实例的一出、该出动作的结果 | 提案：`{score, ranks, effects, transfers}` | §4.4、§4.8 |
| `workReach(engine, state, knowledgeId, scope?)` | 作、范围 | `{places: Fact, copies: Fact, standing}` | §4.5 |
| `workCount(engine, state, personId)` | 个体 | Fact（integer） | §4.5 |
| `legendStanding(engine, state, knowledgeId)` | 作 | `{coverage: Fact, tier: ref vocab legendtier nullable, honored: list<EntityId>}` | §4.6 |
| `honorCoverage(engine, state, entityId)` | 个体、组织、神祇、地点 | Fact（integer）；供 RX 以 `works.honorCoverage` 读 | §4.6 |
| `itemRenown(engine, state, itemRef, ctx)` | 实例 | Fact（number ≥ 0） | §4.7 |
| `itemUniqueness(engine, state, itemRef)` | 实例 | `{extant: Fact, generation: Fact}` | §4.7 |
| `renownBonus(engine, state, itemRef, ctx)` | 实例 | Fact（估值装饰项里的加项） | §4.7 |

谓词：`isWork(itemRef)` = 实例的展平 `classes` 经组件 `enables` 判定含作品组件（卷三乙 P-8 的遍历写法，不以组件代号字面量作比较）；`isComposition(knowledgeId)` = 该行 `workkind` 非空；`isAdornment(itemRef)` 同 `isWork` 的写法。三者都只比较登记代号。

### 3.2 写入口与唯一写者

| 写入口 | 做什么 | 写者 |
|---|---|---|
| `mintComposition(engine, state, draft)` | 把一份创作草案写成知识表的一条生成行；id 与 `generated` 见 R23-1.2 | 卷十的写回器（本入口是唯一调用点） |
| 创作、装饰、抄写的落账 | 建载体、装饰件实例，写 `author / contentRef / workChoices / coverShare / hostRef` | 原语执行器经 `kernel/dimension-writers.mjs`（卷九 §4.2） |
| 演出的起始、换阶段、收场 | 活动实例 | 卷二十四 `instanceStep`（本卷只登记行，不写实例） |
| 赏钱、门费、彩头 | 账本转移与合同 | 卷六 `post`、`contractStep`（本卷只产转移提案） |
| 听过、读过、学会；文书所载事实 | 知情、持有、`state.docContent` | 卷二十二 knowing.mjs、lore-holding.mjs（本卷只产提案或发带通道代号的事件） |

### 3.3 退役的旧入口

| 旧 | 新 |
|---|---|
| works.mjs 的 `WORK_RULES`、`workAction`、`recordArtWork`、`workContribution` | 配方行 + `craftOutcome` + `mintComposition`；流传读 `workReach` |
| works.mjs 的 `workQuality`、`QUALITY` 档名表 | `craftOutcome` 的品质档（卷三乙 §4.8） |
| works.mjs 的 `addFame` | 卷十八 `esteem.sources` 的来源行（本卷登记，§2.5） |
| works.mjs 的 `heldBookGrade` | 卷二十二 §4.6 的阅读结果；本卷不留 |
| 以中文检定档名为键的赏钱表 | `rules.works.show.tipRX`（读演出分，不读档名） |
| 按错误消息文字分支 | 按错误码与原因代号分支 |

### 3.4 禁止的旁路（扫描式；代号由卷十二分配，此处给判据）

| 条 | 判据 | 目标 |
|---|---|---|
| S23-1 | 任何 .mjs 出现本卷各词表族条目、作品种类、形式、物品、技能的 id 字面量（判据同卷十四 §3.5 B-1：拿字面量查加载期索引） | 0 |
| S23-2 | 除求值管线 `modified()` 与校验器外，任何文件从 `qualityTier`、`workTier` 或 `rules.quality.tiers` 取值后做算术、下标或当曲线横轴（卷三乙 P-7 的同一数据流判定，范围加上 `workTier`） | 0 |
| S23-3 | `beauty` 的派生定义点多于一处；或任何文件自算“美观”而不读 `itemView().dims.beauty` 与卷十九的聚合 | 0 |
| S23-4 | 规则层文件读作品的任何显示文字（标题、正文、描述），或以字符串内容分支；读错误消息文字 | 0 |
| S23-5 | `mintComposition` 之外调用写回器写 `workkind` 非空的知识行；本卷文件写 `state.events.instances` 或另建任何演出状态键 | 0 |
| S23-6 | 存储“听众累计数”“流传计数”“传奇档”“稀有度”“名气”“需求计数”的状态键 | 0 |
| S23-7 | 直接读文化行的权重图取艺术形式偏好（应调 `culturePref`） | 0 |
| S23-8 | 本卷文件逐个观众调用 `grantLore` | 0 |

---

## §4 子系统

### 4.1 作品实体与单件美观值

#### 4.1.1 维度

类别行 `beautyForm`；材料 `aesthetic`；实例 `beauty`（派生）、`coverShare`、`author`、`contentRef`、`workChoices`、`workKind`、`workClasses`、`workMatcats`；知识行 `workkind`、`artform`、`subjects`、`composer`、`workTier`、`language`、`basedOn`、`appeal`；词表 `workkind`、`medium`、`technique`；规则表 `beauty.wearCurve`、`modifiers`。

#### 4.1.2 统一入口

读：`itemView`（载体）、`knowledgeView`（内容）、`compositionOf`。写：`mintComposition`；载体各项由原语执行器在制成时写入。

#### 4.1.3 规则

- **R23-1.1 两层**。“作”是知识表里 `workkind` 非空的一行，只存代号与引用：种类、形式、题材表、作者、品质档、语言、所本。它不承载任何事实：文书载体上写下的事实组由卷二十二 `writeContent` 存在 `state.docContent`（R22-6.6），“作”这一行与之无关。载体是挂 `comp_work` 的物品实例，`contentRef` 指向一条“作”。作品种类 `embodied` 为假的“作”可以没有任何载体；`embodied` 为真的“作”在创作时必须同时产出一件载体（R23-1.2）。一件载体只指一条“作”；装饰所指的“作”记在装饰件自己的 `contentRef` 上（§4.2）。不设 `state.works.compositions` 一类的运行态记录（Q23-1 已裁定）。
- **R23-1.2 创作是一次制作**。创作动作是卷三乙的制作动作，另由动作行声明本卷的专有槽位（卷九 §4.19.1）：`{workkind, artform?, commission?, slots?, language?, keep?}`，`intent.choices` 里的做法项填 `technique` 代号。步骤：
  ① `craftOutcome(recipeId, ctx)` 给出结果代号、品质档与（若有）产物提案；
  ② 结果为 `ruined` 则到此为止，不铸“作”；
  ③ `pickSubjects` 给题材表（§4.2）；
  ④ `mintComposition` 铸一条“作”：`workTier` 取 ① 的品质档（`botched` 时即卷三乙规定的残次档）；`artform` 取参数（须在 `knownForms` 内，否则动作不可选）；`composer` 取作者；`language` 取参数（媒介 `verbal` 或 `written` 为真时必填，且作者对该语言的口语或读写技能 `skillValue` 大于 0，否则动作不可选；否则为空）。知识行的必填项全部派生，不取统一缺省：`family` 取 `roles.families.composition`；`difficulty` 取形式条目的 `learnDifficulty`，没有形式时取作品种类的 `learnDifficulty`；`carriers` 取作品种类的 `carriers`；`transmission` 取参数 `keep`（意图要家传、秘传时；取值须是卷十四登记的传授限制值），否则取作品种类的 `transmission`，再缺则取卷十四的“公开”句柄。id 为 `instanceIdOf(engine, roles.idslots.composition, 本次作品完成事件的 id, 0, 事务时刻)`（位次 `clocked` 为真；事件 id 按卷二十七 R27-8.9 派生）；`generated = {by: 运行期铸成的标记, seedKey: 本行的实例位次键, at: 事务时刻}`，运行期 `by` 的取法请卷十定（C23-11），其余两成员与卷十六 R16-4.6 同一口径；
  ⑤ 有产物提案时，产物实例写 `contentRef` 指向新行、`author` 取作者、`workChoices` 取 `intent.choices` 里的做法项与 `intent.emphasis` 的代号集合；媒介 `written` 为真时，载体所载的事实组由卷二十二 `writeContent` 照 R22-6.6 写入（作者所知、按其 belief）；
  ⑥ `embodied` 为假时，作者经卷二十二 `grantLore` 得到这条“作”的持有（他会自己作的歌）。
  六步在同一笔事务里，并发作品完成事件（`actors` 为作者，`targets` 为载体，`related` 为“作”）。
  - 没有载体的创作（口头作一首歌）用“无实物产物”的配方行：需求块可以不含消耗项，`craftOutcome` 仍照七步算并返回品质档（C23-2 ①；卷三乙 R-13 即兴通道要求产物模板，不能代替）。此时料难按卷三乙第 1 步取 0，品质由技能与意图决定；形式条目的 `difficultyAdd` 以修正项加在难度上（C23-2 ③）。
  - 本卷不写任何一步品质运算。料（被加工料的 `workDifficulty` 与继承来的物性）、技能（配方行与形式条目的 `skillRef`）、意图（选择、用心、取向）怎样合成档位，全在卷三乙 §4.8。
- **R23-1.3 意图的落点**。意图除了经 `craftOutcome` 影响品质，还在本卷留下可读的结果：`workChoices`（怎么做的）、`subjects`（做的是什么，受委托与偏好影响，§4.2）、`artform`（用什么形式）、`language`、`transmission`（传不传外人），以及取向对单件美观的直接作用（R23-1.4 ②）。全部是代号或经修正管线生效的数。
- **R23-1.4 单件美观值（全书唯一定义）**。对任何物品实例：
  - 基值 `beauty₀ = beautyForm × wsum(material, 'material', aesthetic) × coverShare`。`wsum` 照卷二 §1.12 的唯一签名，实例的 `material` 是其第 ② 种形状；某份材料的 `aesthetic` 未知时整个结果未知，按本维度 onUnknown（gap）处置，与全书总则同一口径。`coverShare` 只有装饰件小于 1（§4.2）。
  - `beauty₀` 作为可修正维度 `item.beauty` 的基值进入卷二 §3.3 的唯一管线。修正项的来源都是现成的登记处：
    ① 品质——`rules.quality.tiers` 登记一列 `item.beauty`，由卷三乙 Q-1 的同一机制以实例自身为来源生效（C23-5）；
    ② 取向——制作时所选 `emphasis` 条目的 `raise` 或 `lower` 含 `item.beauty` 的，由卷三乙 R-8 写在实例上、以实例为来源长期有效（卷三乙 `emphasis` 族首批即有“求美”一类）；
    ③ 磨损——本卷规则表 `modifiers` 里的一行：`{target: item.beauty, scope: global, stage: mul, valueRX: lookup(rules.works.beauty.wearCurve, dim(subject, durability)), when: 主体有 durability 维度, source: {kind: rules, via: rules.works.modifiers 该行}}`，没有耐久维度的物品不命中；
    ④ 别卷以 `item.beauty` 为目标的修正项（状态容器、附魔等）照常生效。
  - 结果下限 0。一只素面陶罐、一把镶了宝石的刀都按同一式子有美观值。宝石嵌片、彩绘层这类装饰是挂在宿主上的装饰件，各自按本式算自己的 `beauty`，自己的品质只作用于自己（卷三乙 G-6）；宿主的品质不会把别人做的装饰拉低。一件东西连同其装饰“看上去”有多好看，由读者对宿主与其装饰件求和：估值走卷三乙 V-4（宿主 + 附件），房间聚合走卷十九（C23-17）。
- **R23-1.5 作品不另有“艺术价值”一栏**。载体的估值走卷三乙 `valuation`：料、工、成色照旧，装饰项读 `beauty` 与 `renownBonus`（§4.7）。内容好坏只经两条路进入价钱：载体的品质档与 `workTier` 是同一次制作给的同一个档；流传面进名气（R23-7.2）。
- **R23-1.6 三个代号集合（供卷二十六 R26-5.6 比对）**。`workClasses` = 载体模板的类别集合 ∪ 其“作”的作品种类及上位链各行的 `classes`；`workMatcats` = 实例各材料组材料的材料类别集合（经 `materialView`）；`workChoices` 为存储量（R23-1.2 ⑤）。作品完成事件的 `targets` 指向载体实例。没有载体的创作，产物是“作”这一知识行，知识行上没有这三个集合，卷二十六 `matchDim` 只能比对其作品种类与形式两项。
- **R23-1.7 毁失与失传**。载体毁了，“作”还在：仍有人会、或仍有别的载体，`knowStanding` 照卷二十二 R22-10.6 给读数。唯一的载体毁了而无人会的“作”，读数自己变成 `lost`，本卷不发“失传”事件。`embodied` 为真的“作”的 `carriers` 不含 `mind` 与 `work`（像不能背下来），它的存续只看载体。
- **R23-1.8 署名**。`author` 写在载体上，`composer` 写在“作”上；抄本的 `author` 仍是原作者（抄的人是 `maker`）。冒名是卷三乙的 `purports`，本卷不另设。佚名即两项为空。
- **R23-1.9 持有“作”不钉个体**（Q23-1 已裁定）。会一首歌、记得一个故事，是卷二十二的一条 `knows` 边；它按 R22-5.7 不算钉住：只有被在办案件、谋划或关系（卷十八立场条目所由的事件）直接引用时才留在个体名下，其余在折叠时照 R22-10.7 由 `releaseLore` 并入群体的 `state.publicLore`。`transmission` 为公开的“作”进入群体持有率（R22-9.6）；作者以 `keep` 定为家传、秘传的“作”不进群体持有率，持有者照卷二十二 R22-9.6 的明文例外一直钉住。本卷任何规则不逐个观众写持有（S23-8）。

#### 4.1.4 交互

卷三乙 §4.8（`craftOutcome`、配方行、品质表的列、取向 R-8）、§4.14（附件）、§4.16（估值读 `beauty`）；卷三甲（材料 `aesthetic`）；卷十 §4.9、§4.12（写回器、`instanceIdOf`）；卷二十二 §4.6（`writeContent`）、§4.10（持有与 `knowStanding`）；卷十九 §4.11（聚合 `beauty`）；卷二十六 §4.7（奇想比对三个集合）；卷十四 §4.3（`skillRef`）、§4.10（`transmission`）；卷二十九（把代号显示成字句与画面）。通道：派生读取、声明写者、事件。

#### 4.1.5 数据实例

数值为示意。

- 【西陲】‹一位关城的刻工›用‹一块青白软玉›刻‹一只佩饰›：`craftOutcome` 给出成功、‹上等档›；`pickSubjects` 抽到‹他亲见的一次守城›，角色‹所绘之事›；铸成一条“作”（种类‹雕刻›，`workTier` ‹上等档›，`language` 空）；佩饰实例 `contentRef` 指向它，`workChoices` 含做法‹镂空›与取向‹求美›。佩饰类别行 `beautyForm` 2.0，软玉 `aesthetic` 6：基值 12，再经品质列的乘子与取向兑现的修正。
- 〔非西陲〕‹一位南海潮民的歌者›在船上作‹一首号子›：配方没有消耗项，料难取 0；没有载体，只铸“作”（种类‹歌›，形式‹潮民的一种对唱›，`language` 取潮民话）；她经 `grantLore` 会它。这条边不钉住她：她所在单元落到统计层时，边并入渔村的持有率条目。
- 〔非人类〕‹一只地穴柯博德›在洞壁上刻‹它的族群迁来的事›：这一刻是一件装饰件，宿主是洞穴这一地点，以“表面装饰”固定装置的身份留在那里（§4.2）；技能值来自同一个 `skillValue`，没有“只限人类”的条件。
- 【超自然】‹一尊神像›的题材表有一项指向‹一位神祇›，角色的 `honors` 为真。它的 `beauty` 与任何石像同式；它是否灵验归卷十五的修正键组件，与本节无关。

#### 4.1.6 验收断言

- 【扫描】A23-1.1：S23-1、S23-2、S23-3、S23-8 命中为 0；works.mjs 不再含任何物品、技能 id 字面量与中文档名。
- 【不变量】A23-1.2：任一挂 `comp_work` 的实例，`contentRef` 所指行存在且 `workkind` 非空；`embodied` 为真的“作”铸成的同一笔事务里恰有一件载体实例指向它；固定其余只改一项（换 `aesthetic` 更高的料、换品质档更高的实例、所选取向在 `raise` 里含 `item.beauty`、加一件装饰件），该实例的 `beauty` 或“宿主 + 装饰件”之和不降；在宿主上加装饰件不改宿主自己的 `beauty`；同一（配方、状态、意图、骰值键）下创作的全部产出逐位相同；“作”的 `difficulty`、`carriers`、`transmission` 都可由其形式、种类与意图复算得出。
- 【扩展性】A23-1.3：新增一个作品种类行、一条配方行、一个挂 `comp_work` 的模板，不改任何 .mjs，即可创作、估值、被房间聚合美观、被奇想比对。

### 4.2 雕刻、装饰与取材

#### 4.2.1 维度

装饰件 `hostRef`、`coverShare`（组件 `comp_adornment`）；知识行 `subjects`；词表 `technique`、`subjrole`；枚举 `subjkind`；种类行 `subjectSlots`、`subjectKinds`；规则表 `subject.weights`、`subject.poolMax`。

#### 4.2.2 统一入口

读：`pickSubjects`；`itemView(装饰件)`；`compositionOf(宿主)`。写：装饰件由原语执行器在制成时建实例并写入。

#### 4.2.3 规则

- **R23-2.1 装饰是一件挂在宿主上的装饰件**。装饰配方的需求块里有一项不消耗的原件（宿主）和可选的消耗料（嵌的宝石、绘的颜料）。`craftOutcome` 的产物是一件挂 `comp_adornment` 的物品实例，制成即装在宿主上（C23-2 ②）：宿主是物品时，它作为不占槽、不可拆的附件记进宿主的 `attachments`（卷三乙 §4.14 的 G-2、G-3、G-6 照用，G-1 的槽位与预算不适用，代以下面的覆盖份额）；宿主是地点表面（墙、洞壁、崖面）时，它以 §2.5 登记的“表面装饰”固定装置留在该地点。装饰件上：`hostRef` 指宿主；`coverShare` 由意图给，不超过所选做法的 `coverMax`，加上该宿主已有装饰件之和不超过 1，否则动作不可选（之和经卷二 §1.12 `count`/`wsum` 所需的“宿主的装饰件”关系读，C23-16）；`maker`、品质档、材料组成照常；装饰描绘某条“作”时，装饰件同时挂 `comp_work`，`contentRef` 指向它（素纹不挂）。
  - 材料：有消耗料时，装饰件的材料组成就是消耗料。纯刻没有消耗料时，装饰件的材料组成取宿主的：宿主是物品时取宿主各材料组；宿主是建筑表面时取卷十九的围护材料；宿主是天然岩面时取卷五该地点岩层的材料（C23-18）。纯刻削下的料按卷三乙 R-9 入残渣，装饰件自身质量记 0。
  - 能拆下来的装饰（嵌上去还能取下的玉片、挂饰）不走这里，按卷三乙 §4.14 的普通附件做。
  - 装饰件的美观就是 R23-1.4：`beautyForm` 取装饰件模板的类别行（嵌片、彩绘层、刻纹各为一类），乘它自己的料、自己的 `coverShare`，经它自己的品质与取向修正。第一版的 `adornkind` 族、`adornments` 列表与 `beauty.adornBase` 撤销。
- **R23-2.2 取材**。`pickSubjects(actor, {workkind, commission, slots, eventId})`：
  1. **候选池**：作者主观视图里（卷二十二 `subjectiveView`，以作者为视角）全部种类属于 `subjectKinds` 的对象——他知道的事件、认识的人（以他所认的身份键记，R22-1.5；作者只知道化名时题材记的就是化名那把键，不泄露真相）、信的神、见过的器物与地方、听过的传说条目（`loreOf` 所列）与别的“作”。他不知道的事不在池里。池超过 `subject.poolMax` 时，按下一步的权重取最大的 `poolMax` 个，同权按 id 字典序。
  2. **权重**（各项都是 [0,1] 的读数，乘以 `subject.weights` 的同名系数后相加）：
     - `salience`：事件取卷十八 `recall(作者, 该事件)`；非事件对象取作者经卷二十二 `recallFacts(作者, {mentions: [该对象]}, 1)` 检索到的首条事实的显著度基点 `salBps` 除以 10000（除数为定值 10000），检索为空取 0；
     - `stance`：对象是人或组织时，取作者对它的立场读数经卷十八归一后的绝对值（爱与恨都让人想刻）；其余种类取 0；
     - `pref`：作者 `preferenceOf()` 对该对象类别的偏好；
     - `culture`：`culturePref` 对该对象类别的 `norm`（空则不计）；
     - `commission`：对象在委托合同条款指定的集合里为 1，否则 0。
     作者正处在带 `picks` 的发作里（卷二十六 §4.7）时，`picks` 里指向题材类别的键使对应候选的 `pref` 读数取 1。
  3. **抽取**：条数在种类行 `subjectSlots` 内，由意图槽位 `slots` 给（缺省取 `min`）；按权重不放回抽取。骰值键五段齐全：`(worldSeed, roles.streams.works, 本次作品完成事件的 id, 事务时刻, site.works.subject)`；不放回的 k 个值由卷二 §1.10 的采样函数从这一个键展开（R27-8.5），不另造位次。全部候选权重为 0 或池为空时，题材表为空，作品照做（素纹、无题的曲子）。
  4. **角色**：每个抽中的对象配一个 `subjrole`，由意图在该种类允许的角色里选，缺省取规则表的缺省角色。委托可以指定某对象担 `honors` 为真的角色（传奇的来处，§4.6）。
- **R23-2.3 题材只是引用**。题材表不拷贝对象的任何属性。日后对象的名声变了、真相被揭穿了，作品显示出来的描述随之变（显示层按引用现读）。题材所指对象终止后，引用仍在（事件、已故的人都可被引用）；引用悬空（对象行被清除）时该项按“不可辨认”显示，规则层的读数里该项不计。
- **R23-2.4 作者取了假的也照刻**。池里是作者的主观视图，所以一件作品可以如实刻下一件从未发生的事。这不是错误：真伪在卷二十二与卷十六，本卷不校验题材的真实性。
- **R23-2.5 家族纹章与家史**。卷十八 §4.3 所说“家族纹章、家史作为作品由卷二十三定义”，就是本节的两种普通用法：纹章是以家族组织为 `honors` 题材的装饰“作”（刻在门楣、绣在旗上，是装饰件）；家史是以家族为题材、种类 `carries` 为真的“作”，载体是文书，所载事实走卷二十二 R22-6.6。没有专门的纹章或家史规则。

#### 4.2.4 交互

卷二十二 §4.1（主观视图、`recallFacts`、身份键）、§4.3（belief）；卷十八 §4.5（`recall`、立场）、§4.3（家族）；卷二十六 §4.2（`preferenceOf`）、§4.7（`picks`）；卷七 §4.28（`culturePref`）；卷六 §4.16（委托是一份合同，指定集合写在合同条款里）；卷十六 §4.4（`loreOf`）；卷三乙 §4.8、§4.14；卷十九 §2.3（固定装置）；卷五（岩层）；卷二十七 §4.8（骰值键）；卷二十九（按题材引用生成描述）。通道：派生读取、声明写者。

#### 4.2.5 数据实例

- 【西陲】‹一位驿城石匠›受‹一户军功人家›之托，在‹一块界碑›上刻字画：委托指定‹家主›担 `honors` 角色；池里另有他记得最清的‹去年一场雹灾›。抽两项：‹家主›（委托项权重最大）与‹雹灾›。刻纹是界碑上的一件装饰件，`coverShare` 0.4，料取界碑自己的石料。
- 〔非西陲〕‹一位草原部族的银匠›在‹一副马鞍›上错银：她的候选池里没有任何西陲的事——她不知道。她抽到‹本族的一位祖灵›，角色 `honors` 为真。错银片是马鞍上的一件装饰件，材料是银，品质档是她这一次的；马鞍本身是粗档，错银片的美观不因此打折。
- 【超自然】‹一位听信了错传说的画师›画‹一种深洞怪物›：题材指向那条传说条目；传说里“怕什么”一项是错的（卷十六 R16-4.6），画照错的画。看过画的人得到的知情来自这条传说，不来自真相。
- 〔非人类〕‹柯博德›在洞壁上刻迁徙图：宿主是地点，材料取该地点岩层的材料；刻纹以“表面装饰”固定装置留在洞里，卷十九把它计入洞厅的美观。

#### 4.2.6 验收断言

- 【扫描】A23-2.1：`pickSubjects` 的读者只经主观视图与 `recallFacts` 取候选（全知视图调用为 0）；S23-4 命中为 0；本卷文件里没有 `adornments` 列表与 `adornkind` 的读写。
- 【不变量】A23-2.2：题材表的每一项在创作那一刻都在作者的主观视图内，人物项是作者当时所认的身份键；条数在 `subjectSlots` 内；一个宿主上装饰件 `coverShare` 之和不超过 1；`pickSubjects` 是纯函数，同键同结果；提高某候选的任一权重读数，它被抽中的概率不降；宿主的品质档变化不改其装饰件的 `beauty`。
- 【扩展性】A23-2.3：给某作品种类行的 `subjectKinds` 加一个对象种类，或新增一个 `technique` 行、一个装饰件模板类别与一条装饰配方，不改 .mjs 即生效。

### 4.3 艺术形式按文化

#### 4.3.1 维度

词表 `artform`、`shapekey`；知识行 `artform`；规则表 `form.gen`；卷七 `pref_kind` 族里的“艺术形式”种类（键族即 `artform`，卷七 §4.28 已登记）。

#### 4.3.2 统一入口

读：`knownForms`；`culturePref(culture, 艺术形式种类句柄, 形式条目句柄)`（卷七）。写：生成阶段经卷十的写回器写形式条目。

#### 4.3.3 规则

- **R23-3.1 形式是数据行，不是规则**。一种诗体、一种曲式、一种舞，是 `artform` 族的一个条目：属于哪种作品、用哪项技能、要哪些工具能力、几个人、多久、多难、若干整数形制参数。规则层对形式只做四件事：按 `skill` 取技能、按 `toolAbilities` 查工具、把 `difficultyAdd` 加进难度、在改编时用形制相似度降低难度（R23-3.5）。形制参数 `shape` 只供显示层排版与相似度比较，规则层不按它分支。
- **R23-3.2 一种文化有哪些形式**。文化 C 的形式集合 = `culturePref(C, 艺术形式, f).weight > 0` 的全部条目 f。偏好权重同时表示“这里的人多爱看它”。没有“文化的形式表”这一份独立存储：权重在文化行与风气、传统的 `prefShift` 里（卷七 R7-28.1）。
- **R23-3.3 生成**。世界生成的文化阶段（卷十）对每个文化、每种作品种类，按 `form.gen.perKind` 生成定数条形式条目（C23-11）。第 i 条的 id 为 `instanceIdOf(engine, roles.idslots.artform, 文化 id, 序位, genesisMinute)`，序位 = 该作品种类在表内的行序乘 `form.gen.perKind` 的最大值再加 i（行序与 i 都是世界内在的整数，卷十 R10-12.1）。各字段的抽取：骰值键 `(worldSeed, roles.streams.works, 该形式条目 id, genesisMinute, site.works.formgen)`，一个键按字段的固定次序展开多值（R27-8.5）：`skill` 取该作品种类行的 `skill`；`toolAbilities` 从该文化聚落可得材料能做出的工具能力里抽（卷十的可得性读数）；`performers`、`minutes`、`learnDifficulty`、`difficultyAdd` 与 `shape` 各键在 `form.gen` 的区间内抽。生成的条目经写回器写成与手写条目同一格式，`generated` 三成员照卷十 R10-9.2，并在该文化行写入正的偏好权重（C23-11）。此后没有任何规则问一个形式是不是生成的。
- **R23-3.4 谁会哪种形式**（Q23-8 已裁定：形式是词表条目，不是知识行）。`knownForms(actor)` = 满足两条的形式条目：① 该条目对 actor 所属文化的偏好权重为正，或 actor 持有以该形式为 `artform` 的任一“作”（学过一首就算入了门）；② actor 对条目 `skill` 的 `skillValue` 大于 0。外人学艺走卷十四 §4.6（跨文化学艺），本卷不另设门槛。一种形式“失传”不是一个状态：它落在具体的“作”上（以它为形式的“作”都 `lost`）与派生读数上（没有文化再给它正权重时 `knownForms` 自然为空）。
- **R23-3.5 相似度**。两个形式条目的相似度 = `shape` 上取值相同的键数 ÷ 两者键集合的并集大小（并集为空时不做除法，相似度取 0）。它只用于两处：`basedOn` 的改编动作里，源形式与目标形式的相似度经曲线作为难度修正项；显示层说“像某地的调子”。
- **R23-3.6 观众的口味**。一出演出、一件作品对某人有多合口味，读他的 `preferenceOf()`（键为形式条目，卷二十六已含文化项 `f_c`）；本卷不另算。

#### 4.3.4 交互

卷七 §4.28（偏好种类与键族）；卷十（文化阶段生成、可得性读数、写回、`instanceIdOf`）；卷十四 §4.3、§4.6；卷二十六 §4.2；卷二十七 §4.8；卷二十八（扩展包加形式行）；卷二十九（形制参数的显示）。通道：派生读取、声明写者（写回器）。

#### 4.3.5 数据实例

- 【西陲】‹西陲汉地的一种七言体›：种类‹诗›，技能‹文辞类›，一人，形制 `{每单位长度: 7, 单位数: 4}`。‹一种鼓吹乐›：要‹击打›与‹吹奏›两项工具能力，三到八人。
- 〔非西陲〕‹南海潮民的一种对唱›：两方轮流，`performers` 2–2，不要任何工具能力；生成阶段产出，`generated` 三成员齐。
- 〔非人类〕‹地穴柯博德的一种敲壁节奏›：技能‹击打类›，工具能力‹击打› 1 级（一块石头即可）；它的偏好权重只在柯博德的文化行里为正，人类 `knownForms` 里没有它，除非学过。

#### 4.3.6 验收断言

- 【扫描】A23-3.1：.mjs 里按形式条目 id 或按 `shape` 的取值分支的位置为 0；S23-7 命中为 0。
- 【不变量】A23-3.2：每个形式条目的 `workkind` 存在；生成的条目通过与手写条目相同的全部校验；同一世界种子生成的形式条目逐位相同；相似度在 [0,1] 且对称。
- 【扩展性】A23-3.3：扩展包新增一个 `shapekey`、一个形式条目并在某文化行写上权重，不改 .mjs，该文化的人即可用它创作与演出。

### 4.4 表演与演出

#### 4.4.1 维度

卷二十四的活动实例（`state.events.instances` 里 `typeRef` 为 `roles.types.show` 的行：`host`、`venue`、`seats`、`stage`）；起始事件载荷里的节目单 `program`；词表 `actkind`（本节用 `resolver` 为 `perform` 的行）；“作”的 `appeal`；规则表 `show.*`、`spread.learnMinScore`。

#### 4.4.2 统一入口

读：`instanceView`（卷二十四）、`actOutcome`。写：卷二十四 `instanceStep`（起始、换阶段、收场）；每一出是演者的一次卷九动作，落定由原语执行器做。

#### 4.4.3 规则

- **R23-4.1 一场演出就是一个活动实例**。不另设演出记录与演出阶段：一场演出是卷二十四 `family` 取活动句柄的那一行事件类型（`roles.types.show`，§2.5）的运行实例，按卷二十四 §4.4 的容器流转。主办经卷九“举办活动”通用动作（C24-4）提出起始请求，节目单 `program` 写在起始事件（`showAnnounced`）的载荷里，此后不改。演者是 `performer` 席位的成员，来不来由各人决定（R24-6.5）。主办做“开演”动作即发 `showOpened`，宣布阶段转入演出阶段；到期仍未开演则以 `cancelled` 收场。每一出由该出各方的演者做一次“演一出”（或较一出、抽一出）的卷九动作：动作的能力段查——该出 `actkind.service` 在场地可提供（卷十九 `facilityView().services` 含它，或该服务 `hosted` 为假）、各方人数在 `sides` 与形式条目 `performers` 之内且都在演者席位里、演者 `canOffer` 该服务（卷十四）。动作收工时调 `actOutcome`，发 `actEnded`（载荷带 `actIndex`、`actCount`），它是演出阶段的催化；最后一出结束时结局 `whenRX` 成立，以 `done` 收场。
- **R23-4.2 演的是什么**。`perform` 类的一出指定一条“作” `piece`（可空：即兴）。演者必须“会”它（卷二十二 `holdsLore`；统计投影过门槛的照 R22-10.7 在用到时 `grantLore`）或手里有可读的载体（照谱、照本，卷二十二 R22-6.1）；即兴时先按 R23-1.2 现场创作一条没有载体的“作”，再演它。
- **R23-4.3 演得怎样**。“演一出”的检定照卷九 R9-3.5：技能取形式条目的 `skill`；难度行读目标（所演“作”）的 `difficulty` 与形式条目的 `difficultyAdd`；能力行读工具角色（乐器、道具）的工具能力维度——乐器的品质档经卷三乙 Q-1 修正其自身的这些维度，从而进入检定，本卷不读档位。多人合演时每位演者各做一次检定（骰值键的 `subjectId` 各取本人的动作提交事件 id），取各 `margin` 的最小值（合奏被最差的人拖住）。演出分在 `actOutcome` 里一次合成，不设修正键：
  `score = show.scoreRX`，可读变量只有 `base`（= `lookup(show.marginCurve, margin)`）、`appeal`（所演“作”的 `knowledge.appeal` 有效值；即兴而无“作”时取 `rules.works.appealBase`）、`impression`（场地设施的 `rating.impression`；无设施时取 `show.openAirImpression`）。
  “作”的 `appeal` 以 `rules.works.appealBase` 为基值，品质经品质表 `knowledge.appeal` 一列以该“作”为来源生效（C23-5：卷三乙 Q-1 的对象扩到带 `workTier` 的“作”）。演者的状态（醉、伤、怯场）经状态容器修正其技能与能力行所读的维度，自然进入 `margin`。
  - 三方在这里的位置：料 = 乐器、道具、场地与所演的“作”；技能 = 演者；意图 = 选哪一条“作”、选哪种形式、对谁演（节目单与开演时刻）。
- **R23-4.4 谁是观众**。观众 = 这一出进行期间，感知判定（卷五 §4.2）在该媒介 `sense` 上对演者成立的全部在场者，演者自己除外。没有“入场名单”这一份状态；门费是进入场所时的服务费（卷十九 §4.12 场所服务，定价走卷六 §4.21），与是否算观众无关——墙外听得见的人也是观众。统计层单元的演出照卷二十四 R24-6.8 合计结算：观众人数取参与率读数乘人口，一条合计的收场事件。
- **R23-4.5 观众得到什么**。
  ① 效果族输出：对每位物化的观众调卷二十六登记的消遣效果行，参数 `param_amount` = `show.recreationRX`，可读变量只有 `score`（演出分）、`pref`（该观众对形式条目的 `preferenceOf()`）、`understand`（媒介 `verbal` 为真时 = `lookup(show.understandCurve, 该观众对“作” language 的口语技能 skillValue)`，口语技能即卷十四中该语言 `isLanguage` 为真、`written` 为假的技能行；否则为 1）。统计层按该效果行的统计形态施于聚合体，`pref` 取该群体文化的 `culturePref().norm`，`understand` 取 1 或 0（群体文化的语言与“作”的 `language` 相同或后者为空时取 1）。
  ② 知情：`actEnded` 事件的 `related` 含所演的“作”；物化的在场者经本卷登记的观众通道（`roles.kchans.audience`，`public` 为真）由卷二十二照 R22-2.1 写知情，并同时注入场地所在群体的公共知情（R22-5.2）。本卷不逐人写知情。
  ③ 学会：演出分不低于 `spread.learnMinScore`、“作”的 `transmission` 为公开、且场地所在群体文化的语言与“作”的 `language` 相同（或后者为空）时，经卷二十二 `notePublicLore` 以听唱通道给该群体这条“作”的持有率条目注入一次（R22-9.6 同一条曲线律）。个人会不会，照 R22-5.3 的投影在用到时得出；不逐个观众 `grantLore`（S23-8）。`carries` 为真的“作”所载的知识，按卷二十二的讲授通道另算，本卷不写。
  ④ 想法：演出事件进卷二十六的想法触发，本卷不写想法行。
- **R23-4.6 演者得到什么**。① 约定的酬劳：演出若出于合同（卷六 §4.16），按合同结。② 赏钱：每位物化观众向演者的一笔自愿转移，数额 = `show.tipRX`，可读变量只有 `score`、`pref`、`purse`（该观众可支配余额，读卷六）；算出为 0 或观众付不起则不转。多位演者时，一笔赏钱 T 照卷二 §3.3“存量与余数结转”第 3 条一次拆完：演者按实体 id 升序，前 n−1 位各得 `floor(T ÷ n)`，末位取差（除数 n 是该出演者人数，由 `performers.min ≥ 1` 保证为正）。统计层：赏钱合计 = 观众人数乘 `show.tipRX`（`purse` 取聚合账户的人均可支配余额），从聚合账户一笔转出，同法拆分。全部经卷六 `post`。③ 技能成长：按卷十四的成长规则入口，本卷只发事件。④ 名声：`actEnded` 匹配卷十八的来源行（§2.5）。
- **R23-4.7 砸了也是一场演出**。检定余量为负不取消演出：`marginCurve` 在负区间给低分，观众的消遣可以是 0，赏钱可以是 0，没有人学会。是否有负面想法由卷二十六的想法行按 `score` 触发。
- **R23-4.8 与节庆、仪式的关系**。节庆（卷七、卷二十四）引出的活动里若有演出，就是那条活动行的阶段效果调本卷的演出行，或节目单里的一出；礼仪效果归卷七，本节只结算演得怎样与观众的消遣、知情。

#### 4.4.4 交互

卷二十四 §4.4、§4.6（活动容器、席位、催化、结局）；卷九 §4.1（演出期间演者处于持续活动）、§4.3（检定）、§4.7（能力行、难度行）；卷十四 §4.1（服务条目、`canOffer`）、§4.3（语言技能）；卷十九 §4.12（场所、接待量）；卷五 §4.2（谁听得见）；卷二十六 §4.3（消遣效果）、§4.4（想法）；卷二十二 §4.2、§4.5、§4.10（知情通道、群体注入、持有率）；卷三乙 §4.5（品质表）；卷六 §4.1、§4.16、§4.21；卷十八 §4.7；卷二十七 §4.1。通道：事件、账本转移、效果族。

#### 4.4.5 数据实例

- 【西陲】‹驿城酒肆里的一位说书人›演‹一条讲守城的故事›（种类‹故事›，`workTier` ‹良档›）：检定余量 +40，`base` 0.6，`appeal` 经良档一列 1.1，酒肆印象 0.9，合成演出分约 0.6；在场十二人，其中两人不通当地话，`understand` 0.3，消遣低。赏钱合计若干铜，经账本进说书人账户。分数过了学会线，酒肆所在街坊这一群体对这条故事的持有率条目注入一次。
- 〔非西陲〕‹南海潮民的两位歌者›在滩上对唱：没有设施，服务 `hosted` 为假，照样开演，`impression` 取露天值；滩上听得见的三十人都是观众，没有门费；两人分赏钱，末位取差。
- 〔非人类〕‹三只柯博德›在洞里敲壁：`performers` 3–6，三者各检定一次，取最小余量；路过的‹一位人类行商›听得见，是观众，他对这种形式的偏好读数很低，消遣近 0，但他从此知道有过这样一场演出、演的是这条“作”。
- 【超自然】‹一位祭司›在庙里领唱‹一首颂神歌›：同一套结算；庙会活动行的阶段效果把它当作一出，另有的礼仪效果由卷七的仪式行给。

#### 4.4.6 验收断言

- 【扫描】A23-4.1：赏钱、消遣的计算处读检定档名或任何中文键的位置为 0；S23-5、S23-8 命中为 0（本卷不写活动实例、不另建演出状态、不逐个观众写持有）。
- 【不变量】A23-4.2：一场演出前后，账本各资源总量守恒（赏钱是转移不是铸造）；一笔赏钱拆给各演者的份额之和逐位等于该笔；`actOutcome` 是纯函数；固定其余只提高演者技能、只换品质档更高的乐器、只换 `workTier` 更高的“作”，演出分都不降（`show.scoreRX` 对 `base`、`appeal` 单调不降由加载校验抽样核对）；观众集合恒不含演者；一次推进跨过整场与分段推进得到同一份存档摘要（交卷十二）。
- 【扩展性】A23-4.3：新增一个 `actkind` 行（`perform`）、一项服务条目与一个形式条目，不改 .mjs 即可开演。

### 4.5 出版、抄写与流传

#### 4.5.1 维度

实例 `copyOf`、`copyGeneration`（卷三乙 §4.15，本卷只读）；规则表 `reach.*`；卷十八 `esteem.sources` 里由本卷登记的来源行（§2.5）。

#### 4.5.2 统一入口

读：`workReach`、`workCount`。写：无自有状态；抄、印走配方与原语执行器；知情与文书内容走卷二十二；名望走卷十八的来源行。

#### 4.5.3 规则

- **R23-5.1 抄与印都是配方**。抄本按卷三乙 §4.15 B-3 与卷二十二 R22-6.5：原件不消耗，产物与原件同模板，`copyGeneration` 加一，内容事实组由卷二十二 `writeContent` 照原件抄并抽一次失真。本卷补一条：产物的 `contentRef`、`author` 与原件相同，`workChoices` 取这一次抄写的意图。印是批量的抄：一条带工位的配方（版、活字、拓片都只是工位与工具能力的不同），`times` 给份数；制版是另一条配方，产物是一件挂 `comp_tool` 的版，它的 `contentRef` 指向所印的“作”。没有“出版”这个专门动作：出版 = 有人出钱（卷六的合同或自费）让印的配方开工，再把成品放进市场。每一次抄印发抄印完成事件（`pieces` 为份数）。
- **R23-5.2 翻译、改编是新“作”**。内容层：以一条“作”为所本的创作，`basedOn` 指向它，自己另铸一条：译本换 `language`，改编换形式或种类；新“作”的 `composer` 是译者、改编者，原作者经 `basedOn` 链可查。载体层：文书的译本照卷二十二 R22-6.5，产物模板是（原件模板、译入语言）这一对的生成行，内容事实组照原件；译本实例的 `contentRef` 指向新铸的那条“作”（C23-10）。口头翻译（把一首歌译成汉话唱）只有内容层。两层各由一处定义，本卷不重写 R22-6.5 的模板机制。
- **R23-5.3 流传面是派生读数**。`workReach(k, scope)` 给三项，都不落状态：
  - `places`——范围内层级为 `reach.placeTier`（`juris` 族）的地点里，以该地点居民为群体（卷二十二 §4.5 的群体口径），`publicShare(该地点, k)`（实体形式，R22-5.8：取以 k 为当事实体的各条目知情率的最大值）与 `loreShare(该地点, k)` 两者较大者不低于 `reach.coverShareBps` 的个数。个体层与统计层同一读法：个体层成员知情时也经 `public` 通道注入了群体条目（R23-4.5 ②），所以不逐人数。
  - `copies`——以 k 为 `contentRef` 的完好且可辨认的载体与装饰件件数，经“作的载体”关系 `count`（C23-16）。
  - `standing`——卷二十二 `knowStanding(k, scope)`。
- **R23-5.4 抄本的需求（引卷六，不另立需求式）**。“需求”只有卷六 §4.4 一个定义（台账 X-25：四个来源相加，再受支付能力截断）。抄本、画、像都是普通物品：它们经卷三乙的用度类（`usageClass`、`usagePer`、`dailyUse`、`lifeDays`）进卷六的同一式，文化偏好由卷六规则 2 读卷七，支付能力由卷六规则 3 截断。本卷不给需求项、不给第五个来源；第一版的 `workDemand`、`demand.*` 规则表键撤销。“想要的人都有了就不再买”由卷六对耐用品只计更换需求表达。同一模板而 `contentRef` 不同的抄本是否在卷六算不同的货，记 Q23-10。
- **R23-5.5 作品带来的名望（登记到卷十八的来源行）**。本卷在 §2.5 登记三类来源行，行格式照卷十八 §4.7 的 `{verb, role, resource, amountRX, cap}`：① 一出结束，演者以 `role: actor` 得，作者经载荷字段 `composer` 得；② 抄印完成，作者经载荷字段 `composer` 得；③ 作品完成，作者以 `role: actor` 得。`role` 只取卷二 §1.14 的事件角色，不另立值集；`amountRX` 只读本卷动词行登记过的载荷数值字段（`score`、`audience`、`pieces`），符合卷十八 §2.4 变量表“事件载荷里登记过的数值字段”一行，不请卷十八补变量。受益人取载荷字段的写法请卷十八确认（C23-7）。丑闻（禁书、亵神之作）不由本卷判：评价归卷七 §4.26，法律门控归卷八b §4.4。
- **R23-5.6 作品数（供卷十八名士条件）**。`workCount(person)` = `composer` 为该人、且 `workReach(k).places ≥ reach.minPlaces` 的“作”的条数，经“作者的作”关系 `count`（C23-16）。写了没人知道的不算。卷十八 `subject.workCount` 已登记调本入口。
- **R23-5.7 所载知识**。`carries` 为真的“作”所载的知识写在其载体模板的可读组件 `teaches` 上（卷三乙、卷二十二 R22-10.5）；“作”这一行自己不重复存。演出传授所载知识走卷二十二的讲授通道。载体毁失就是普通的物品终止事件，卷二十二订阅它使 `knowStanding` 失效重算（答卷二十二 C22-18）。
- **R23-5.8 禁与毁**。禁一条“作”是法律动作（卷八b）；毁载体是普通的物品毁坏。本卷只保证读数跟着变：载体毁了 `copies` 降，会的人死了、群体持有率条目没了，`standing` 随之变。

#### 4.5.4 交互

卷三乙 §4.15（抄本、文书物性）、§4.8、§4.3（用度类）；卷六 §4.4（需求）、§4.16（出资合同）、§4.21；卷十八 §4.7（来源行、`workCount` 的使用）；卷二十二 §4.5、§4.6、§4.10；卷五（`juris`）；卷七 §4.27、§4.28；卷八b §4.4；卷十九（印坊只是带工位的设施）。通道：派生读取、事件、账本转移。

#### 4.5.5 数据实例

- 【西陲】‹一位州城学官的一部地志›：‹上等档›；印坊受州府合同开工二百份；成品作为普通书籍进卷六的市场，需求由卷六按能读者的用度与预算算出。印完后州内县级地点的知情率逐步过线，`places` 升到 6。
- 〔非西陲〕‹南海潮民的那首号子›没有任何载体：`copies` 为 0，市场里没有这一项货；它只靠演出流传，渔村群体的持有率条目每次过线演出注入一次，`places` 逐年增加。
- 〔非人类〕‹柯博德刻在洞壁上的迁徙图›：`copies` 为 1（洞壁上的一件装饰件）；‹一位人类学者›拓下来带走，是一次抄写，`copyGeneration` 为 1，流传面从此出了洞。
- 【超自然】‹一卷记着某条法术知识的秘本›：`carries` 为真，`transmission` 为秘传；它的抄写受卷十四 §4.10 的传授限制与卷十五的规则约束，所载知识不进群体持有率。

#### 4.5.6 验收断言

- 【扫描】A23-5.1：S23-6 命中为 0（没有流传计数、需求计数的状态键）；`addFame` 的调用为 0；本卷文件里没有任何需求式（`workDemand` 一类入口为 0）。
- 【不变量】A23-5.2：`workReach`、`workCount` 是纯函数；抄本的 `contentRef` 恒等于其原件的；`basedOn` 链无环；某地点对 k 的知情率不降时 `places` 不降；分段推进与一次推进得到的读数相同。
- 【扩展性】A23-5.3：新增一种复制手段只需加一条配方行与工位；新增一条名望来源行只需在卷十八的行表里登记，不改 .mjs。

### 4.6 传奇的推广与升级

#### 4.6.1 维度

作品种类行 `commemorates`；`subjrole` 行 `honors`；词表 `legendtier`；规则表 `reach.*`；RX 命名空间 `works.honorCoverage`（C23-16）。

#### 4.6.2 统一入口

读：`legendStanding`、`honorCoverage`。写：无自有状态。

#### 4.6.3 规则

- **R23-6.1 传奇是什么**。传奇 = 作品种类 `commemorates` 为真、且题材表里至少有一项角色 `honors` 为真的“作”。它是作品，不是知识真相：它说的事可真可假（R23-2.4）。传说（卷十六 §4.4）是带真相层的知识行；一条传奇可以把一条传说条目当题材，两者各在各的表里（台账 X-24）。
- **R23-6.2 覆盖**。`coverage` = `workReach(k).places`（R23-5.3）。
- **R23-6.3 档是派生的**。`tier` = `legendtier` 族里 `minCoverage ≤ coverage` 的条目中 `minCoverage` 最大者；一个都不满足则为空（还只是种子）。档不落状态：流传面涨了自己升，知道的人死光了、群体条目没了自己降。档只供显示与 `legendStanding` 的读者，效果不读档序（R23-6.5）。
- **R23-6.4 推广没有专门动作**。让传奇走远的就是 §4.4 的演出与 §4.5 的抄印，加上卷二十二现成的传闻通道。推广者（任何人，不限身份）能做的是出钱：雇人去别处演、出资印、托人带抄本。同语言传得快（观众听得懂、群体能学会）、邻近传得快（行程短，卷十七）、亲友传得快（卷二十二的转述读立场），都不是本节的规则，是那些入口本来的性质。
- **R23-6.5 升级带来什么**。受益人 `honored` = 题材表里角色 `honors` 为真的各项所指；所指是个体（身份键经卷二十二 `linkKnown` 在全知视角下对到的个体）时并入其所归家族（卷十八 §4.3 的家族归属读数），所指是组织、神祇、地点时即其本身。`honorCoverage(e)` = 以 e 为受益人的全部传奇的 `coverage` 之和（多条传奇各自计入，不只取最高）。档的效果按卷二 §3.2 现有的登记方式写：每个 `legendtier` 行的 `modifiers` 是规则表修正项，`scope: global`，`when: works.honorCoverage >= 本行 minCoverage`，`source: {kind: rules, via: 该 legendtier 行}`；所以覆盖过了几档的线，几档的修正项就逐档生效。`works.honorCoverage` 作为 RX 可读量须登记进卷二 §2.9 的 RX 命名空间（C23-16，先例卷二十四 C24-2）。不需要“被称颂者”这一作用域，也不经卷十八的档机制。名望的铸入不走这里：受益人的名望若要随传奇增长，由卷十八自行以 `works.honorCoverage` 为门控读数，本卷不登记“被称颂者”来源行。
- **R23-6.6 被揭穿**。传奇所称颂的事若在某地被多数人认定为假，该地的知情仍在、覆盖不变——人们仍然知道这个故事。后果只经现成的路：受益人在该地的立场与舆论（卷十八 §4.6，读卷二十二群体条目的 `credenceBps`）。本卷不设“传奇破灭”事件，也不设以可信为条件的档修正。

#### 4.6.4 交互

卷二十二 §4.5（`publicShare`、群体条目的 `credenceBps`）、§4.10（`loreShare`）、§4.1（`linkKnown`）；卷十六 §4.4（传说条目作题材）；卷十八 §4.3、§4.6、§4.7；卷二 §2.9、§3.2；卷八（正统性读威望档，间接受益）；卷十七（行程）；卷六 §4.16（出资）。通道：派生读取、修正项。

#### 4.6.5 数据实例

- 【西陲】‹那户军功人家›托人把‹家主守城的故事›写成‹一部传记›并雇说书人去三座城讲：一年后五个县级地点的知情率过线，`coverage` 5，进入‹第一档›；家主与其家族的 `works.honorCoverage` 为 5，第一档的修正项对他们生效。
- 〔非西陲〕‹南海一位船主的颂歌›只在潮民语言区流传：邻近的汉地港口听得见但群体学不会、观众听不懂，知情率到不了线，覆盖长期停在三个岛。有人把它译成汉话（一条 `basedOn` 的新“作”）后，新“作”自己从零起算覆盖；船主的 `works.honorCoverage` 是两条之和。
- 【超自然】‹一条称颂某位山神的传奇›：受益人是神祇行；档修正项里若有香火相关的键，经卷七的入口生效，本节不知道那是什么键。
- 〔非人类〕‹柯博德族群称颂其开洞首领的敲壁长调›：`commemorates` 为真；覆盖只数柯博德聚落所在的地点，规则与人类的传奇逐字相同。

#### 4.6.6 验收断言

- 【扫描】A23-6.1：存储传奇档、覆盖数、推广进度的状态键为 0；按推广者身份（头衔、职位）分支的位置为 0；读 `legendtier` 档序做算术的位置为 0。
- 【不变量】A23-6.2：`legendStanding`、`honorCoverage` 是纯函数；`coverage` 增大时 `tier` 的 `minCoverage` 不降；受益人集合只由题材表决定；一条传奇的覆盖全部消失后，它对 `works.honorCoverage` 的贡献为 0。
- 【扩展性】A23-6.3：新增一个 `legendtier` 行、改各档的 `minCoverage` 与 `modifiers`、新增一个 `commemorates` 为真的作品种类，都不改 .mjs。

### 4.7 文物的唯一性与名气加成

#### 4.7.1 维度

规则表 `relic.*`；只读：实例 `copyOf`、`copyGeneration`、`author`、`maker`、`contentRef`。

#### 4.7.2 统一入口

读：`itemRenown`、`itemUniqueness`、`renownBonus`（卷三乙 §4.16 V-3 的装饰项调它）。写：无。

#### 4.7.3 规则

- **R23-7.1 不设稀有度**。物品没有手填的稀有度维度（台账 S-19）。“稀缺”是卷三乙 §4.16 由存量与需求派生的 `scarcity`；卷十六 §4.2 的“传说级”是生成配额。本节只定两个读数——名气与唯一性——和由它们合成的一个估值加项。卷二 §5.1 的 `rarity` 字段请收尾时删除（C23-4，与卷三乙 Q-06 同一条，回答卷十五 Q15-4）。
- **R23-7.2 名气**。`itemRenown(i, ctx)` 是三项之和，全部现读，不经修正管线，不读事件日志（规则层不调日志投影，卷二十四 S24-4）：
  1. **经历**：`lookup(relic.coverCurve, cover(i))`，`cover(i)` = 范围内层级为 `reach.placeTier` 的地点里 `publicShare(该地点, i)`（实体形式：以 i 为当事实体的各条目知情率的最大值，R22-5.8）不低于 `reach.coverShareBps` 的个数。器物是否担了某件事的当事实体，由登记该动词的卷把它放进事件的 `actors`、`targets` 或 `related` 决定；没人知道的事不增名气。
  2. **出身**：`lookup(relic.originCurve, b)`，`b` = `author` 与 `maker` 两者 `esteemOf` 威望余额的较大者（卷十八 §3.1 的读入口；两者都空取 0）。
  3. **内容**：`lookup(relic.contentCurve, c)`，`c` = i 的 `contentRef` 所指“作”的 `workReach().places`（无则 0），加上以 i 为题材（`subjects` 含 i）的各条“作”的 `places` 之和（被写进故事的那把刀），后者经“题材所指”关系读（C23-16）。
  结果下限 0。`ctx.scope` 给出时，`cover` 与 `places` 只数该范围内的地点（估值方可传市场所在的上级地点），缺省全世界。
- **R23-7.3 唯一性**。`itemUniqueness(i)` 给两个数：`extant`——有 `contentRef` 的实例，取以同一条“作”为 `contentRef`、同一模板、完好的实例件数（含 i 自己，所以不小于 1），经“作的载体”关系 `count`（C23-16）；没有 `contentRef` 的物品取 1（每件器物作为它自己独一，名气全看经历）。`generation`——i 的 `copyGeneration`（原件为 0）。两个数都不落状态。
- **R23-7.4 名气加成**。`renownBonus(i) = relic.bonusUnit × lookup(relic.renownCurve, itemRenown) × lookup(relic.uniqueCurve, extant) × lookup(relic.generationCurve, generation)`。单位与卷三乙 V-3 装饰项里 `beauty × beautyValue` 一项相同（卷三乙 V-3 已核：两者同为估值单位）。名气为 0 时曲线给 0，于是无名之物没有加成，不论它多独一无二——“只此一件”的身价来自有人在乎。没有为“神器”“文物”写任何分支：挂不挂 `comp_relic` 都走同一式。
- **R23-7.5 赝品与仿品**。照着原件做的仿品是一件 `copyGeneration` 更大的实例，`generationCurve` 让它的加成低；冒充原件的赝品带 `purports`（卷三乙 B-5），未识破者经卷三乙的表象读数把它当原件估，识破者按真实读数估。本节的三个入口都接受 `ctx.frame`，表象与真实的切换只在卷三乙的 `documentStanding` 与同类入口里做。
- **R23-7.6 名气会散**。因为经历项读的是公共知情，知道那件事的地方少了，名气自己降；一件埋了三百年的器物重见天日时名气很低，直到它的来历重新被人知道（卷二十二的研究与阅读）。

#### 4.7.4 交互

卷三乙 §4.16（`valuation` 调 `renownBonus`；`scarcity` 另算）；卷十五 §4.12（法器、神器读本节，不定义）；卷十八 §4.7（`esteemOf`）；卷二十二 §4.5（`publicShare`）；卷二十四（各卷登记动词时把器物放进角色栏）；卷六 §4.21（没有市场价的场合取内在值，含本加项）；卷十六 §4.2（配额，不同轴）。通道：派生读取。

#### 4.7.5 数据实例

- 【西陲】‹一把在守城战里被主将用过的刀›：那场战事的事件把它列在 `related`，九个县级地点的知情率过线，经历项可观；`extant` 1（没有 `contentRef`），原件。同一位匠人同一炉打的另一把无名的刀，料工相同，`renownBonus` 为 0。
- 〔非西陲〕‹南海一只传了七代的祭礼贝号›：每年祭礼事件都把它列在 `related`，但只有本岛一个地点的知情率过线，经历项很小；出了海就没人在乎，这正是读数的意思。
- 【超自然】‹一件世上只此一件的法器›：`extant` 1；稀缺度按卷三乙未知、不乘；身价的大头来自本加项。它的灵验是卷十五的修正键组件，与名气无关：一件灵验而无人知晓的法器，本加项为 0。
- 〔非人类〕‹柯博德首领的那块敲壁石›被写进了它们的传奇：内容项来自那条传奇的 `places`；人类买家在人类市场估值时传 `ctx.scope`，范围内没有柯博德聚落，它几乎没有加成。

#### 4.7.6 验收断言

- 【扫描】A23-7.1：物品表与实例上没有手填的稀有度、名气字段；`renownBonus` 的调用点只在卷三乙的物品估值器；本节入口调用日志投影（`chronicleAll`、`eventCount` 一类）为 0。
- 【不变量】A23-7.2：三个入口都是纯函数；`extant ≥ 1`；`itemRenown` 为 0 时 `renownBonus` 为 0；与该器物相关的事多过线一个地点，名气不降；世上多一件同内容同模板的载体，加成不升；`generation` 增大，加成不升（各曲线的单调性由加载校验保证）。
- 【扩展性】A23-7.3：别卷新增一种事件动词并把器物放进其角色栏，器物即可因这种经历出名，本卷不加任何行、不改 .mjs。

### 4.8 娱乐（竞演与博戏）

#### 4.8.1 维度

词表 `actkind`（本节用 `resolver` 为 `contest`、`draw` 的行）、`cway`；规则表 `show.contestCurve`、`show.drawBase`、`wager.rakeBpsMax`；本卷登记的“彩头”合同种类（§2.5）。

#### 4.8.2 统一入口

读：`actOutcome`（同 §4.4，按 `resolver` 分三路）。写：演出外壳同 §4.4（卷二十四的活动实例）；彩头的托管与结算走卷六的合同与 `post`。

#### 4.8.3 规则

- **R23-8.1 娱乐不是一类专门的系统**。说书、唱戏是 `perform` 类的一出（§4.4）。斗兽、角力、赛跑、对弈是 `contest` 类的一出。掷骰、抽签是 `draw` 类的一出。三类共用一场演出的全部外壳：活动实例、观众、消遣、知情、赏钱。区别只在这一出怎样得出结果。
- **R23-8.2 较量**。`contest` 类的一出，`sides` 给出各方（个体、生物、队伍都只是引用）；胜负不由本卷算，按 `actkind.contestWay` 所指的解算方式调已封卷的入口：`opposed` 走卷九 R9-3.6 的对抗检定（双方技能取 `cway.skill`），返回一次 `margin`；`combat` 走卷十三 §4.1 的结算（斗兽里的兽与人走同一套战斗规则，伤亡照实发生），读其收场事件上已存的 `eventSig`（卷二十四 R24-2.5）。名次按结果排出：对抗检定按 `margin` 正负，战斗按卷十三结算给出的胜负。演出分的基值 = `lookup(show.contestCurve, x)`，`x` 对 `opposed` 取 `|margin|`（越接近越好看，曲线单调不升），对 `combat` 取 `eventSig`；其余与 R23-4.3 相同。名次写进 `actEnded` 的载荷，供卷二十四 R24-6.6、R24-6.7 的订阅者读。不向卷九、卷十三要任何新返回值。
- **R23-8.3 机运**。`draw` 类的一出按骰值键抽一个结果：`(worldSeed, roles.streams.works, 该出动作提交事件的 id, 事务时刻, site.works.draw)`，各结果按位次的权重取 `actkind.drawWeights`。演出分的基值取 `show.drawBase`。作弊是卷九的普通动作（手法检定对察觉），成功则把抽取换成作弊者指定的结果，本卷不另写。
- **R23-8.4 彩头**。任何结果未定的一出都可以被押注。一注是一份“彩头”合同（卷六 §4.16，种类行本卷在 §2.5 自登）：`{act, 押哪一方或哪个结果位次, 数额, 对手方}`；对手方可以是另一位押注者，也可以是庄家。押下时数额转入合同托管；这一出结束时按结果把托管转给赢家；庄家抽成不超过 `wager.rakeBpsMax`，抽成比例写在庄家开盘的合同条款里。赔率由开盘方在条款里给，本卷不算“公平赔率”。平局或演出取消，托管原路退回。全程是账本转移，没有铸造与销毁。结算发彩头结算事件。
- **R23-8.5 押注者得到的消遣**。押注者本身是观众，照 R23-4.5 得消遣；押了注的人另由卷二十六的想法行读彩头结算事件的载荷触发想法：`won`、`stake`、`stakeShareBps` = `stake × 10000 ÷ 押下时该押注者可支配余额`（除数为 0 时不做除法，取 10000）。沉迷归卷二十六的发作行（节号待核，见待补清单），本卷不写。
- **R23-8.6 合法与否**。某地是否许可某类演出、某类彩头，是卷八b §4.4 的法律门控读 `actkind` 与服务代号；本卷不写任何“禁赌”条件。
- **R23-8.7 参加者的意愿**。被拉去斗的兽与人是否自愿，归卷八b 与卷十八（强迫、奴役）；兽的驯服与驱使归卷二十五。本节只要求各方在开场时在场且能行动。

#### 4.8.4 交互

卷十三 §4.1（斗的胜负与伤亡）；卷九 §4.3（对抗检定、作弊）；卷六 §4.16（合同托管）、§4.1；卷八b §4.4；卷二十五（兽）；卷二十六 §4.3、§4.4；卷二十四 §4.6（R24-6.6 名次）；卷十九 §4.12；§4.4（演出外壳）。通道：事件、账本转移、效果族。

#### 4.8.5 数据实例

- 【西陲】‹驿城集日的一场角力›：两方各一人，解算方式为对抗检定；`|margin|` 小，演出分 0.8；围观四十人里九人押注，庄家抽半成。输家的托管转给赢家与庄家，账本总量不变。
- 〔非西陲〕‹南海滩上的掷贝戏›：`draw` 类，三种结果的权重在该 `actkind` 行；没有庄家，两两对押。
- 〔非人类〕‹斗场里的一头山兽对一只柯博德斗士›：解算方式为战斗，胜负与伤亡由卷十三结算；柯博德死了就是死了，尸体照卷四处理。观众的消遣只读演出分，不读谁赢。
- 【超自然】‹庙会上的抽签›：`draw` 类的一出；它若兼作占卜，准确度归卷七 §4.15，与本节的抽取是两回事。

#### 4.8.6 验收断言

- 【扫描】A23-8.1：.mjs 里按“赌、斗、说书”等节目种类 id 分支的位置为 0；本卷文件内没有任何胜负计算（只有对卷九、卷十三入口的调用）。
- 【不变量】A23-8.2：一出节目的全部彩头合同，结算前后托管加各方余额的总量不变；取消或平局后各押注者余额与押注前相同；庄家所得不超过押注总额乘 `rakeBpsMax` 再除以 10000（除数为定值 10000）；同键的 `draw` 结果相同。
- 【扩展性】A23-8.3：新增一种较量只需一个 `actkind` 行并指向一个已登记的解算方式；新增一种博戏只需一个 `draw` 行与它的权重表。

### 4.9 美观需求接口

#### 4.9.1 维度

无自有维度。只读：`beauty`（§4.1）；卷十九的 `rating`；卷二十六的美观需求量表。

#### 4.9.2 统一入口

无自有入口。本节只说明三方怎样接。

#### 4.9.3 规则

- **R23-9.1 三处各管一段（台账 S-20）**。单件美观值：本卷 §4.1，一个代号 `beauty`，适用一切物品实例，含固定装置与装饰件。房间与场所的美观：卷十九 §4.11 把室内各件的 `beauty` 聚合成分项（室内物品的装饰件与附件一并计入，C23-17），不另定义单件值。需求一侧：卷二十六 §4.3 的美观需求读地点的美观读数，不读单件。
- **R23-9.2 身上的东西**。穿戴、佩带的物品的 `beauty` 是否进入旁人对此人的观感，归卷十八（印象）与卷二十六（想法）；它们读的仍是 `itemView().dims.beauty`。本卷不设“仪容值”；身体装饰本卷不收（Q23-3）。
- **R23-9.3 口味不在美观值里**。`beauty` 不随观看者变。同一件东西有人爱有人厌，由卷二十六的 `preferenceOf()`（键可以是作品种类、形式、材料类别、题材所属类别）在想法的偏好因子里表达。
- **R23-9.4 丑也是值**。本卷的 `beauty` 下限为 0，不设负值；令人不适的东西（尸体、污秽）由卷十九的 `dirt` 与卷二十六的想法行表达，不借 `beauty` 的负数。

#### 4.9.4 交互

卷十九 §4.11、§4.12；卷二十六 §4.3、§4.4；卷十八（印象）；卷三乙 §4.16。通道：派生读取。

#### 4.9.5 数据实例

- 【西陲】‹驿城酒肆›墙上挂了‹一幅上等档的画›：画的 `beauty` 进卷十九的美观分项，酒肆印象升，在场者的美观需求量表读到更高的地点美观。
- 〔非西陲〕‹南海一间没有任何陈设的鱼寮›：室内 `beauty` 之和为 0，美观分项只剩形制基值；这里的人不因此受罚，除非他们的文化行使美观需求的权重为正。
- 〔非人类〕‹柯博德的洞厅›满壁刻纹：每一处刻纹是一件“表面装饰”固定装置，各有 `beauty`，卷十九照聚合；柯博德与人类读到同一个地点美观值，偏好不同由 R23-9.3 表达。

#### 4.9.6 验收断言

- 【扫描】A23-9.1：全仓库定义单件美观的位置只有 §4.1 的派生登记一处（与卷十九 A19-11.1 同一扫描）。
- 【不变量】A23-9.2：往一个房间放入一件 `beauty` 为正的物品，或给室内一件物品加一件装饰件，卷十九的美观分项不降；`beauty` 恒不为负。
- 【扩展性】A23-9.3：新物品只要其类别行（经继承）有 `beautyForm`、材料有 `aesthetic`，即自动参加房间聚合与需求读数，不登记任何额外行。

---

## §5 系统间接口总表

### 5.1 本卷提供

| 名 | 形状 | 使用方 | 通道 |
|---|---|---|---|
| `beauty`（单件美观值，派生维度；修正键 `item.beauty`） | `itemView().dims.beauty` | 卷十九 §4.11、卷三乙 §4.16、卷二十六 §4.3（经卷十九） | 派生读取 |
| `renownBonus`、`itemRenown`、`itemUniqueness` | 纯函数 | 卷三乙 §4.16、卷十五 §4.12、卷六 §4.21 | 派生读取 |
| `workCount` | 纯函数 | 卷十八 §4.7（名士条件的 `subject.workCount`，该卷已登记） | 派生读取 |
| `workReach`、`legendStanding` | 纯函数 | 卷十八、卷二十二、卷九（叙述投影） | 派生读取 |
| `honorCoverage`（RX 命名空间 `works.honorCoverage`） | 纯函数 | 本卷 `legendtier` 修正项的 `when`；卷十八、卷八可作门控读数 | 派生读取 |
| `workClasses`、`workMatcats`、`workChoices` | 实例上的三个代号集合 | 卷二十六 R26-5.6 | 派生读取 |
| `workKind`（载体上的派生维度） | `itemView().dims.workKind` | 卷十四 `rel_edge_items` | 派生读取 |
| `workkind`、`artform`、`technique` 族 | 词表 | 卷七 §4.28（偏好键族）、卷十、卷二十六（`picks` 做法项） | 词表引用 |
| §2.5 登记的动词、事件类型行、合同种类、来源行、通道行、服务条目 | 数据行 | 卷二十四、卷六、卷十八、卷二十二、卷十四、卷二十六 | 数据登记、事件 |
| 作品所载知识的位置与毁失 | 载体模板的 `teaches`；物品终止事件 | 卷二十二（答 C22-18） | 派生读取、事件 |

### 5.2 本卷使用

| 对方 | 用什么 | 本卷哪里 |
|---|---|---|
| 卷三乙 | `craftOutcome`、配方行、品质表的列、取向、附件、抄本配方、用度类、`valuation` | §4.1、§4.2、§4.5、§4.7 |
| 卷二十二 | `subjectiveView`、`recallFacts`、`linkKnown`、`publicShare`、`loreShare`、`holdsLore`、`knowStanding`；`grantLore`、`notePublicLore`、`writeContent`；`kchan` 行格式 | §4.1、§4.2、§4.4、§4.5、§4.6、§4.7 |
| 卷二十四 | `verb` 族、事件类型表、活动实例与 `instanceStep`、`eventSig` | §2.5、§4.4、§4.8 |
| 卷十八 | 来源行格式、`esteemOf`、`recall`、立场读数、家族归属 | §4.2、§4.5、§4.6、§4.7 |
| 卷七 | `culturePref`、文化的语言 | §4.2、§4.3、§4.4 |
| 卷九 | 检定、对抗检定、能力行与难度行、持续活动、原语执行器、“举办活动”通用动作 | §4.1、§4.4、§4.8 |
| 卷六 | `post`、合同、需求、价格 | §4.4、§4.5、§4.8 |
| 卷十 | 写回器、`instanceIdOf`、文化阶段 | §4.1、§4.3 |
| 卷十三 | 战斗结算入口 | §4.8 |
| 卷十四 | `skillValue`、语言技能行、服务条目、`canOffer`、`transmission` | §4.1、§4.3、§4.4 |
| 卷十九 | `facilityView`、`rating`、`fixture` 族 | §4.2、§4.4、§4.9 |
| 卷二十六 | `preferenceOf`、`picks`、消遣效果 | §4.2、§4.4、§4.8 |
| 卷二十、卷二十七 | 到期项；骰值键、运行矩阵 | §4.4；全卷 |

### 5.3 向卷二十七登记的矩阵行（卷二十七 R27-1.5：每系统三层各一形态）

| 系统 | 个体层 `simtier_individual` | 规则层 `simtier_rule` | 统计层 `simtier_stat` | 实体化与折叠 |
|---|---|---|---|---|
| 作与载体（知识表 `generated` 节的“作”行；载体、装饰件的存储项） | `simform_frozen` | `simform_frozen` | `simform_frozen` | 只由事件（作品完成、装饰完成、抄印完成、物品终止）改动，三层都不登记时钟形状的规则。统计层没有个体做制作动作，所以不铸新“作”；聚合体的文化产出只体现为已有公开“作”的持有率铺开（卷二十二 R22-9.6） |
| 演出（`roles.types.show` 的活动实例） | `simform_individual`：演者逐出做动作，观众按感知逐人得效果；知情与持有只走 R23-4.5 ②③ | `simform_batch`：实例照卷二十四按该层节拍推进；在场的物化个体照个体层结算，聚合体不实体化 | `simform_stat`：照卷二十四 R24-6.8 合计结算，观众人数取参与率乘人口，消遣按效果行的统计形态，赏钱从聚合账户一笔转出（R23-4.6） | 演出实例以其主办、演者为席位成员，实例在跑时席位成员在卷二十七足迹里不折叠；演出结束即释放 |
| 读数（`beauty`、`appeal`、`workReach`、`legendStanding`、`honorCoverage`、`itemRenown`、`itemUniqueness`、`renownBonus`） | `simform_derived` | `simform_derived` | `simform_derived` | 无 |
| 彩头（合同） | `simform_frozen` | `simform_frozen` | `simform_frozen` | 只由押注、一出结束、取消三类事件改动，照卷六合同的矩阵行 |

`observables`（交卷二十七基线）：`works.compositions`（“作”行数）、`works.carriers`（载体与装饰件件数）、`works.shows`（在跑的演出实例数）、`works.places`（全部“作”的 `places` 之和）。流代号 `roles.streams.works`；抽取点 `site.works.subject`、`site.works.formgen`、`site.works.draw`，各一个代号，多值都从一个键展开（R27-8.5），登记到卷二十七的抽取点登记表。结果与推进路径无关：本卷没有时钟形状的存储量，演出的推进全在卷二十四容器与卷九动作里，抽取键的 `subjectId` 都是确定性派生的事件或实体 id。

### 5.4 需别卷配合的清单（本卷不改别卷；按一审 §三 必要性判定删减后保留的各条）

| 编号 | 对方 | 请对方做什么 | 读者与必要理由 | 本卷依据 |
|---|---|---|---|---|
| C23-1 | 卷三甲（封卷后勘误） | 材料表收 `aesthetic` 一列（维度定义已由本卷 §2.2 登记），并给首批材料填值（数值待标定，不凭记忆填） | 读者：R23-1.4 的 `wsum`。理由：卷三甲没有任何光学或观感量，美观无从由材料派生 | R23-1.4 |
| C23-2 | 卷三乙 §4.8、§4.14、§3.3（封卷后勘误，四项） | ① 允许“无实物产物”的配方行：没有产物条目时仍返回结果代号与品质档（R-13 即兴通道要求产物模板，不能兼容）；② 产物条目可写“装到第 k 个不消耗输入上”：产物是挂 `comp_adornment` 的实例，宿主是物品时作为不占槽、不可拆的附件记进其 `attachments`（G-1 不适用，代以覆盖份额之和 ≤ 1），宿主是地点时作为固定装置留在该地点；③ 难度一步接受来自形式条目 `difficultyAdd` 的修正项；④ 挂 `comp_work`、`comp_adornment` 的产物在提案里带 `author / contentRef / workChoices / coverShare / hostRef`，与 §3.3 写者行（`issuer / sealOf` 那一行的同一写者）一并写入；另请确认 ⑦ 做法槽位（`technique`）只作记录、不进滚档 | 读者：R23-1.2、R23-2.1 的执行器。理由：口头创作必须仍由 `craftOutcome` 定档（否则出现第二个定档处）；装饰须有自己的品质与料（真问题 3、20） | R23-1.2、R23-2.1 |
| C23-3 | 卷二（封卷后勘误，Q23-1、Q23-2 裁定所列） | ① §5.1（:1337）`author / contentRef / beauty（comp_work, error）` 一行：`beauty` 移出，改为一切物品实例的派生维度，onUnknown 取 gap，拿掉缺即 error；`author`、`contentRef` 不动；② §5.21 知识表加列 `workkind`、`artform`、`subjects`、`composer`、`workTier`、`language`、`basedOn`（类型与含义见本卷 §2.2）；③ §5.23（:1715）“作品 = item 实例 + comp_work”改为“作 = 知识行，载体 = comp_work 实例”；④ §2.1（:360）第 1 行括注同步 | 读者：加载器校验与 `knowledgeView`、`itemView`。理由：Q23-1、Q23-2 裁定；卷二只改这几列，其余字段由本卷 §2 自登，不请卷二回填清单 | §2.2、R23-1.1、R23-1.4 |
| C23-4 | 卷二 §5.1、卷三乙 Q-06、卷十五 | `rarity` 字段删除（与卷三乙 Q-06 合为一条勘误）；卷十五 Q15-4 以本卷 R23-7.1 为答 | 读者：无（删除）。理由：台账 S-19 | R23-7.1 |
| C23-5 | 卷三乙 §4.5（封卷后勘误） | `rules.quality.tiers` 增两列 `item.beauty`、`knowledge.appeal`；Q-1 的对象从“实例自身”扩到“带 `workTier` 的‘作’（知识行）”，读其 `workTier`，来源是该行自身 | 读者：`modified()` 求 `beauty`、`appeal`。理由：口头作品没有实例，其品质只能经这一列进入演出分；不这样做就得把档序取出来算（P-7 违规，真问题 22） | R23-1.4、R23-4.3 |
| C23-7 | 卷十八 §4.7 | 来源行格式在 `role` 之外允许“受益人取载荷里一个登记为实体引用的字段”（本卷用载荷字段 `composer`） | 读者：esteem.mjs 匹配来源行。理由：作者不是演出、抄印事件的行为方或受事方，事件角色是封闭枚举不得另立值集（卷二 §1.14）；不加这一写法作者就得不到流传带来的名望 | R23-5.5 |
| C23-10 | 卷二十二 R22-6.5 | 译本实例的 `contentRef` 指向本卷新铸的那条“作”（`basedOn` 原“作”） | 读者：本卷 `workReach`、`compositionOf`。理由：一部书的译本到底指哪条“作”须由一处定，否则译本的流传计到原作上（真问题 7） | R23-5.2 |
| C23-11 | 卷十 §4.9、文化阶段 | ① 运行期经写回器铸成的行（本卷的“作”，先例卷十五 R15-5.3、卷二十二 R22-6.5）`generated.by` 怎么填；② 文化阶段调用形式生成（R23-3.3）并写文化行的偏好权重（第一版 C23-6 后半并入此条） | 读者：写回器校验与卷十二追溯。理由：R10-9.2 只定义了生成阶段的取法 | R23-1.2、R23-3.3 |
| C23-13 | 卷二十六 | Q13 的三个维度名以本卷 §2.2 为准；想法行读一出结束、彩头结算事件的载荷字段（§2.5 已登记） | 读者：卷二十六 R26-5.6 与想法行。理由：维度名在对方是示意 | R23-1.6、R23-8.5 |
| C23-14 | 卷二十九 | 按“作”的代号结构（种类、形式、题材引用、语言、形制参数）生成标题、描述、画面与声音；规则层不回读 | 读者：显示层。理由：规则层没有一个字的内容 | §0.1、R23-2.3 |
| C23-16 | 卷二（封卷后勘误） | ① `relation` 族（封闭）增三行：“作的载体”（作 → 以它为 `contentRef` 的实例）、“宿主的装饰件”（宿主 → 以它为 `hostRef` 的实例）、“作者的作”（个体 → 以他为 `composer` 的“作”），另加“题材所指”（实体或事件 → 以它为题材的“作”）；② §2.9 RX 可读命名空间登记 `works.honorCoverage` | 读者：`count` 原语（R23-2.1、R23-5.3、R23-5.6、R23-7.2、R23-7.3）与修正项 `when` 的求值。理由：`count` 只能沿已登记关系计数；`legendtier` 修正项要按受益人门控而全书作用域闭集里没有“被称颂者”（真问题 3、17） | §4.2、§4.5、§4.6、§4.7 |
| C23-17 | 卷十九 §4.11 | 美观项“室内各物品与固定装置的 `beauty` 之和”明写含其附件与装饰件（宿主在室内者） | 读者：卷十九 `rating.beauty`。理由：装饰件是独立实例，不计入则装饰对房间无效 | R23-1.4、R23-9.1 |
| C23-18 | 卷五 §4.4 | `stratum` 条目加 `material: ref material` | 读者：R23-2.1 纯刻天然岩面的装饰件材料。理由：天然洞壁、崖面没有任何材料读数，刻在上面的东西无从算美观（真问题 20） | R23-2.1 |

已删的第一版配合项与理由（一审 §三）：C23-6 前半（卷七:1506 已登记艺术形式偏好种类；后半并入 C23-11）；C23-8（不向已封卷的卷九、卷十三要新返回值，R23-8.2 改读现有 `margin` 与 `eventSig`）；C23-9（动词、事件类型行本卷自登，R24-2.1；`verbrole` 撤销）；C23-10 原文（`publicShare`、`loreShare` 已有，`carrier` 已含 `work`，通道行自登；剩下 R22-6.5 一句见上）；C23-12（合同种类自登，A6-16.3；需求不另立来源，R23-5.4）；C23-15（服务条目自登，PF-8；`workKind` 由本卷派生提供，卷十四不需改）；C23-7 原文中的 `subject.workCount`（卷十八:227 已有）与威望档作用于器物（改由 R23-7.2 直接读 `esteemOf`）。

### 5.5 牵连清单（Q23-1、Q23-2 裁定一次改清；本卷不改别卷）

| 位置 | 现文 | 应改为 | 走哪条 |
|---|---|---|---|
| 卷二:360（§2.1 第 1 行） | 作品/文物…＝挂 comp_work…的物品 | 作＝知识行；载体＝挂 `comp_work` 的物品 | C23-3 ④ |
| 卷二:1337（§5.1） | `author / contentRef / beauty`（comp_work, error） | `beauty` 移出、改派生、gap | C23-3 ① |
| 卷二:1683 与 §5.21 | `family` always/error；无“作”的列 | `know_family` 由本卷给 `composition` 值（卷二十二 §2.2 的登记方式，不需改卷二）；加列 | C23-3 ② |
| 卷二:1715（§5.23） | 作品…＝item 实例 + comp_work | 作＝知识行，载体＝`comp_work` 实例 | C23-3 ③ |
| 卷三乙:223 | `author` `contentRef` `beauty` 同一行 byClass:comp_work, error | `beauty` 移出（与卷二同改） | C23-3 ①（卷三乙随卷二同步） |
| 卷三乙:1835 | 作品即物品加组件 | 作是知识行，载体是物品加组件 | 措辞，收尾对齐 |
| 全书概念台账:511 | item ＋ comp_work；读 beauty | 作＝知识行，载体＝item ＋ comp_work；`beauty` 适用一切物品 | 收尾对表 |
| 全书概念台账:51（X-24） | 传奇是“作品实体的一类” | 传奇是“作”（知识行）的一类，其载体是物品 | 收尾对表 |
| 卷二十二:512（R22-6.6） | 卷三乙的 `contentRef` 只指文字作品的显示内容，不承载事实 | 不改：本卷一侧已对齐——`contentRef` 指的“作”只有代号与引用、不承载事实，事实组在 `state.docContent`（R23-1.1） | 无需对方改 |
| 卷二十二:511（R22-6.5） | 未说译本 `contentRef` 指向 | 指新铸的“作” | C23-10 |
| 卷十四:404 | `rel_edge_items` 读物品上的 `workKind` | 不改：本卷在载体上登记派生维度 `workKind` | 无需对方改 |
| 卷十八:656 | 家族纹章、家史作为作品由卷二十三定义 | 不改：本卷 R23-2.5 已给 | 无需对方改 |
| 卷十九:791（§4.11） | 室内各物品与固定装置的 `beauty` 之和 | 含其装饰件与附件 | C23-17 |

---

## §6 扩展性测试

下列每一条都只许加数据行，不许改 .mjs；做不到即本卷不合格（交卷十二执行）。

1. **新的艺术门类**（例：皮影）。加一个 `workkind` 行、一个 `medium` 已有条目的引用、若干 `artform` 行、一条创作配方、一项演出服务、一个 `actkind` 行。结果：可创作、可演出、有观众消遣、可成传奇、可被估值。
2. **新的复制手段**（例：拓印）。加一条配方行与一个工位。结果：`copies` 与流传面自动变化。
3. **新的文化**。卷十生成它的形式条目并写权重。结果：它的人有自己的诗乐舞，外人须学。
4. **新的非人类族群**。它的物种有心智组件即可创作、演出、押注；本卷没有任何“限人类”条件可改。
5. **新的较量**（例：斗虫）。加一个 `actkind` 行，`contestWay` 指向已登记的 `combat` 解算方式。
6. **新的出名方式**。别卷新增一种事件动词，把器物放进其角色栏；本卷不加行。
7. **新的装饰做法**（例：错金）。加一个 `technique` 行、一个装饰件模板类别（带 `beautyForm`）、一条装饰配方。
8. **新的传奇档**。加一个 `legendtier` 行与它的修正项。
9. **反例（必须失败）**：给某一把具名的刀单独指定美观值或名气；给某个文化写一条“只有它能推广传奇”的规则；按作品标题里的字判断题材。三者都没有可写的位置：`beauty` 与名气是派生量，推广没有身份条件，规则层读不到标题。

---

## §7 迁移与退役清单（交卷十一）

| 编号 | 旧位置 | 现状 | 迁到 | 出处 |
|---|---|---|---|---|
| M23-1 | works.mjs:30 | 写死五个技能 id | 配方行与形式条目的 `skillRef` | 06a §4；卷十四 §7（已核） |
| M23-2 | works.mjs:31–32 | 写死五个物品 id 与 `printCost`、`bookPrice`、`demand`、`minimumAudience` 四个常数 | 物品走配方需求块（卷三乙 §7 第 27 行）；价格由卷六形成；需求走卷六 §4.4；最少听众撤销（`workCount` 读 `reach.minPlaces`） | 素材包 3b；原码已核 |
| M23-3 | works.mjs:32 `performanceTip` | 以中文检定档名为键 | `rules.works.show.tipRX`，读演出分 | 素材包 3b；原码已核 |
| M23-4 | works.mjs:33 `points`、`fame`、`standing` | 写死名声点数常数 | 卷十八来源行（§2.5）与卷十八规则表 | 原码 |
| M23-5 | works.mjs:36 `QUALITY` | 写死中文品质档名表 | 卷二 `ordered enum quality`；显示名在 labels | 原码 |
| M23-6 | works.mjs:41 `grade` | 按熟练度拼中文等级名 | 显示层（卷二十九）；规则层读 `skillValue` | 原码 |
| M23-7 | works.mjs:43 `workQuality` | 按中文检定档名“勉强成功、大成功”自行定品质档：`craftOutcome` 之外的第二个定档处 | 删除；品质只由 `craftOutcome`（卷三乙 §4.8） | 一审真问题 24 |
| M23-8 | works.mjs:96、:207 | 检定属性写死中文属性名 | 动作行的能力行（卷九 §4.7），不读属性名 | 原码 |
| M23-9 | works.mjs:99、:215 | `quality` 与中文“杰作”比较 | 删除；读档代号，且规则不按“杰作”分支 | 原码 |
| M23-10 | works.mjs:131 | 以中文状态名数组过滤读者 | 读卷四、卷二十一的状态代号与能力维度 | 原码 |
| M23-11 | works.mjs:201 | 缺省技能字面量 | 形式条目的 `skill` | 卷十四:1632 已记 |
| M23-12 | works.mjs:264 | `includes` 匹配中文错误消息（位于 `fuse()`，卷十四:1448 已判主归本卷） | 按错误码与原因代号分支 | 06b F 类 |
| M23-13 | works.mjs:73 `addFame` | 直接加名声 | 卷十八来源行 | 卷零 A 12.7 |
| M23-14 | works.mjs:165 `heldBookGrade` | 自算书的档 | 卷二十二 §4.6 | — |
| M23-15 | works.mjs:225 `survey` | 测绘写在作品模块里 | 卷十七测绘（`kchan` 的 `exact` 行定 `surveyed`）；地图作为文书走卷二十二 R22-6.6 | 一审真问题 24 |
| M23-16 | works.mjs:282 `workAction`、:295 `recordArtWork`、`workContribution` | 写作出版专用流程；艺术品只记一笔 | 创作动作 + `craftOutcome` + `mintComposition`；装饰与题材（§4.2） | 卷零 A 1.14 |
| M23-17 | civic.mjs:9 | 引入 `workContribution` | 读 `workCount` 或卷十八的名士读数 | 一审真问题 24 |
| M23-18 | notables.mjs:30–34 | 读 `state.works` 并按 `w.kind` 中文或代号分类自数 | `workCount` | 卷零 A 12.7 |
| M23-19 | world/meta/items.json 里的作品类物品行 | 手写稿、书、图 | 类别行补 `beautyForm`；挂 `comp_work`、`comp_readable`；由配方产出 | 素材包 3a |
| M23-20 | world/meta/professions.json 里的艺术、娱乐职业 | 有职业无事件 | 服务条目 + `actkind` 行 + 形式条目（本卷 §2.5 自登服务） | 卷零 A 6.12 |
| M23-21 | 房间美观的另一套算法 | 与单件无关 | 卷十九聚合 `beauty`（A19-11.1） | 台账 S-20 |

不兼容旧存档：旧存档里的作品记录不迁，规则只留本版。上表 M23-4 至 M23-11、M23-15、M23-17 为一审按原码补列，06a、06b 未收；开卡前按文件行号再核一遍。

---

## §8 开放问题

| 编号 | 问题 | 本稿取法 | 另一种取法 | 谁定 |
|---|---|---|---|---|
| Q23-1 | 作品内容放在哪里 | **已裁定（李白 11-14）**：作品内容＝知识表生成行；持有、失传、口传用卷二十二现成机制；铸成只经 `mintComposition`；持有“作”不钉个体，只活跃事件或关系才钉；卷二 §5.21 加 `workkind` 等字段、§5.23 改“作＝知识行，载体＝comp_work 实例”（封卷后勘误列读者与理由）；不设 `state.works.compositions`。落实：R23-1.1、R23-1.9、C23-3、§5.5 | — | 已闭合 |
| Q23-2 | `beauty` 由存储改派生 | **已裁定（李白 11-14）**：派生，适用一切物品；卷二勘误只改 `beauty` 一列的存法与适用范围、拿掉缺即 error；`author`、`contentRef` 仍存载体。落实：§2.2、R23-1.4、C23-3 ① | — | 已闭合 |
| Q23-3 | 身体上的装饰（纹身、疤饰、发式）算不算装饰件 | **已裁定（李白 11-14）**：本卷不收；将来由卷四或卷二十一单点设计，不复用本卷装饰件；例子只当显示层。落实：§0.1、R23-9.2 | — | 已闭合 |
| Q23-4 | 没有载体的创作要不要走 `craftOutcome` | 走（C23-2 ①），保证品质只有一处算 | 口头创作只做一次卷九检定，按余量查档 | 卷三乙作者（随 C23-2）；后一种会出现第二个定档处，本稿不取 |
| Q23-5 | 建筑整体（一座塔、一座庙）是不是作品；固定装置能否装在非建筑的地点（洞穴、崖面）上 | 建筑整体不收，其美观由卷十九形制基值与室内聚合给；地点表面上的刻纹以“表面装饰”固定装置留在地点（R23-2.1） | 让地点行也可挂 `contentRef` 与题材 | 卷十九、卷五 |
| Q23-6 | 名气的经历项读事件日志的成本 | **本稿已消解**：经历项改读公共知情（R23-7.2），不读日志 | — | 已闭合 |
| Q23-7 | 观众的赏钱是否应由观众自己的决策管线决定 | 本稿用一条 RX（NPC 与离屏统一）；玩家作为观众时由玩家自己给 | 全部走卷九决策管线的候选动作 | 卷九 |
| Q23-8 | `artform` 条目是词表条目还是知识行 | **已裁定（李白 11-14）**：词表条目；会不会由文化权重与技能派生；失传落在具体“作”与派生读数（R23-3.4） | — | 已闭合 |
| Q23-9 | 引用节号核对 | 卷二十四已成稿（第一版），活动、动词、事件类型表节号已按其现稿写；卷二十九未成稿；卷二十六“沉迷”所在节待核 | — | Opus 收尾 |
| Q23-10 | 同一模板、`contentRef` 不同的抄本在卷六是不是不同的货 | 本稿不设需求式，交卷六的货物键与替代池决定；若要区分，货物键取（模板，`contentRef`） | 一律按模板算一种货 | 卷六 |

---

## 附 术语与代号表

| 术语 | 代号或入口 | 定义处 |
|---|---|---|
| 作（作品内容） | 知识行，`workkind` 非空；`isComposition` | §4.1 R23-1.1 |
| 载体（作品实体） | 物品实例 + `comp_work`；`isWork` | §4.1 R23-1.1 |
| 装饰件 | 物品实例 + `comp_adornment`；`hostRef`、`coverShare` | §4.2 R23-2.1 |
| 单件美观值 | `beauty`；修正键 `item.beauty` | §4.1 R23-1.4 |
| 形露系数 | `beautyForm`（类别行） | §2.2 |
| 料的观感 | `aesthetic` | §2.2（请卷三甲收列） |
| 覆盖份额 | `coverShare` | §2.2 |
| 感染力 | `appeal`；修正键 `knowledge.appeal` | §2.2、R23-4.3 |
| 作品种类 | `workkind` 族 | §2.1 |
| 媒介 | `medium` 族 | §2.1 |
| 艺术形式 | `artform` 族 | §2.1、§4.3 |
| 形制参数键 | `shapekey` 族 | §2.1 |
| 做法 | `technique` 族 | §2.1 |
| 题材、题材角色 | `subjects`；`subjrole` 族；`subjkind` 枚举 | §2.2、§4.2 |
| 取材 | `pickSubjects` | §4.2 R23-2.2 |
| 演出 | 卷二十四活动实例（`roles.types.show`） | §4.4 R23-4.1 |
| 节目种类、解算方式 | `actkind` 族、`actresolver` 枚举、`cway` 族 | §2.1、§4.8 |
| 演出分 | `actOutcome` 返回的 `score`（`show.scoreRX`） | §4.4 R23-4.3 |
| 流传面 | `workReach` | §4.5 R23-5.3 |
| 作品数 | `workCount` | §4.5 R23-5.6 |
| 传奇 | `commemorates` 为真且有 `honors` 题材的“作” | §4.6 R23-6.1 |
| 覆盖、传奇档 | `legendStanding`；`legendtier` 族 | §4.6 |
| 称颂覆盖 | `honorCoverage`；RX `works.honorCoverage` | §4.6 R23-6.5 |
| 名气 | `itemRenown` | §4.7 R23-7.2 |
| 唯一性 | `itemUniqueness` | §4.7 R23-7.3 |
| 名气加成 | `renownBonus` | §4.7 R23-7.4 |
| 彩头 | 本卷登记的卷六合同种类 | §4.8 R23-8.4 |

## 附 待补清单

| 序 | 位置 | 待补什么 | 状态 |
|---|---|---|---|
| 1 | §0.3 | 卷零 B 表 9.25、9.26 行号 | 已填（卷零:684、:685） |
| 2 | §2.2、C23-1 | 各材料的 `aesthetic` 取值；各类别行的 `beautyForm` 取值 | 待标定 |
| 3 | §2.3 | `rules.works.*` 全部曲线与常数（含 `show.announceDays`） | 待标定 |
| 4 | §2.1、§2.5 | 首批 `workkind`、`medium`、`technique`、`actkind`、`cway`、`subjrole`、`shapekey`、`legendtier` 条目清单；§2.5 各别族行的首批数据 | 内容卡（各族均已开放，取值不在本卷列全） |
| 5 | §1.2、§7 | works.mjs 常数与行号 | 已核（一审 §四 第 5 条；`WORK_RULES` 实为 :29–33，已改） |
| 6 | 全卷引用 | 卷二十九未成稿；卷二十六“沉迷”是否在 §4.6（疯狂）或 §4.5 的发作行；卷十八 §3.1 `esteemOf` 返回的余额字段名 | 待查（Opus 收尾） |
| 7 | §4.7 | `renownBonus` 的单位与卷三乙 V-3 装饰项的单位 | 已核（卷三乙 V-3：两者同为估值单位） |
| 8 | §4.3 | 真实世界诗体、曲式、舞制的形制参数取哪些键，须查资料后定 `shapekey` 首批条目 | 待查（查网由 Opus 做） |
| 9 | §2.5 | 卷九动作行“演一出”的能力行所读工具能力维度名（卷三乙 `abilities` 的 map 键写法） | 待查 |

## 附 修订记录（第二版，逐条对应一审编号）

| 一审编号 | 问题 | 改法 | 改动位置 |
|---|---|---|---|
| D1 | Q23-1 未落实：持有不钉人、观众逐人写持有、C23-3 越界、缺牵连清单、与 R22-6.6 冲突 | §8 记已裁定全文；新增 R23-1.9；观众知情改由卷二十二照通道写、学会改群体 `notePublicLore` 注入，删逐人持有，加 S23-8；C23-3 收窄到 §5.1 一列、§5.21 加列、§5.23 改归属；新增 §5.5 牵连清单；R22-6.6 按其现稿改本卷一侧（“作”不承载事实，事实组在 `state.docContent`） | §1.3、R23-1.1、R23-1.9、R23-4.5、S23-8、C23-3、§5.5、§8 |
| D2 | Q23-2 越界：C23-3 请卷二加 `beautyForm` 等；未写拿掉 error | 本卷字段由 §2 自登；C23-3 只改 `beauty` 一列（派生、gap、去 error），列出卷二:1337 与卷三乙:223 | §2.2 说明、C23-3、§5.5 |
| D3 | Q23-8 未标已裁定 | §8 改已裁定；R23-3.4 写明失传落在具体“作” | §8、R23-3.4 |
| D4 | Q23-3 未落实，§4.2 缺有效非西陲例 | 删纹身例，补草原银匠错银例；§0.1、R23-9.2 写不收；§8 已裁定 | §0.1、§4.2.5、R23-9.2、§8 |
| 1 | 演出另起运行实例 | 删 `showphase`、`state.works.shows`、show.mjs、`openShow` 等；演出＝卷二十四活动实例，本卷只登记事件类型行、阶段、结局、角色、动词，节目单入起始载荷，每一出是卷九动作；`showOutcome` 改 `actOutcome` | §2.1、§2.4、§2.5、§3.2、R23-4.1、S23-5、§5.3 |
| 2 | 事件角色另立值集；名望变量不合格式 | 动词行本卷自登，角色栏只用卷二事件角色；来源行 `role` 只取事件角色，作者经载荷字段（C23-7）；`amountRX` 只读登记的载荷字段；删 `verbrole`、`relic.roleWeights`、`tierOrder` | §2.5、R23-5.5、R23-7.2、C23-7 |
| 3 | 修正项来源与作用域无写处 | 装饰改为独立装饰件实例，品质自作用（不再有对单条 add 的 mul）；演出分改 `show.scoreRX` 一次合成，撤 `show.score`；“作”品质经 `knowledge.appeal` 列（C23-5）；名气改纯读数，撤 `item.renown`，威望改读 `esteemOf`；传奇档修正改规则表 `scope: global` + `when: works.honorCoverage`（C23-16 登记 RX 命名空间） | §2.1、R23-1.4、R23-2.1、R23-4.3、R23-6.5、R23-7.2、C23-5、C23-16 |
| 4 | 意图对美观漏了取向 | R23-1.4 修正项第 ② 类为取向（卷三乙 R-8）；A23-1.2 补单调性 | R23-1.4、A23-1.2 |
| 5 | `workChoices` 指向不存在的词表 | 新登记 `technique` 族；`workChoices` = 做法 ∪ 取向；C23-2 ⑦ 请卷三乙确认只作记录 | §2.1、§2.2、R23-1.2、C23-2 |
| 6 | “作”缺语言；`langCap` 引错 | “作”加 `language`；听懂读卷十四口语技能行经 `show.understandCurve`；删 `langCap` | §2.2、R23-1.2、R23-4.5 |
| 7 | 翻译与 R22-6.5 冲突 | 内容层新“作”+`basedOn`，载体层照 R22-6.5；请卷二十二写明译本 `contentRef` 指新“作” | R23-5.2、C23-10 |
| 8 | 知情份额所指事实与范围未定义 | 不另造事实键：读 `publicShare` 的实体形式（以“作”为当事实体）与 `loreShare`；“全世界读数”改为按层级数过线地点（不做除法）；删公共 belief 条件 | R23-5.3、R23-6.2、R23-6.6、R23-7.2 |
| 9 | 知识行必填项写成常数 | `family` 登记 `composition`；`difficulty` 取形式/种类 `learnDifficulty`；`carriers`、`transmission` 由种类行与意图派生；删 `compose.mintDefaults` | §2.1、§2.3、§2.5、R23-1.2 |
| 10 | `workDemand` 与卷六需求重复 | 删 `workDemand` 与 `demand.*`；R23-5.4 改引卷六；同模板不同“作”的货物键记 Q23-10 | R23-5.4、§3.1、§8 |
| 11 | 取材权重对非事件题材无定义；泄露真名；`event` 非实体类 | 非事件取 `recallFacts` 的 `salBps`；立场只对人、组织；人物存身份键；`subjects.ref` 写成联合，另设 `subjkind` 枚举 | §2.1、§2.2、R23-2.2 |
| 12 | 词表条目缺字段或引用不存在的族 | `workkind` 加 `skill`、`classes`；`medium` 加 `verbal`、`written`，`channel` 改 `sense`；`placeTier` 改 `ref vocab juris`；抽类权重写在 `actkind.drawWeights`、基值 `show.drawBase` | §2.1、§2.3、R23-8.3 |
| 13 | 闭集与扩展断言矛盾 | `shapekey`、`legendtier`（及原闭集无列值的 `medium`、`subjrole`）改开放；`legendtier` 档序取 `minCoverage` | §2.1、A23-3.3、A23-6.3 |
| 14 | 胜负入口引用不存在的族；C23-8 要新返回值 | 新登记 `cway` 族与 `cwayvia` 枚举；读现有 `margin` 与 `eventSig`；删 C23-8 | §2.1、R23-8.2、§5.4 |
| 15 | 未声明卷二十七运行矩阵行 | 新增 §5.3 矩阵行与 `observables`；统计层演出照 R24-6.8 | §5.3 |
| 16 | 骰值键与派生 id 不全 | 三个抽取点写全五段，多值从一个键展开；“作”id 照 `instanceIdOf` 五成分；`generated` 三成员写明，运行期 `by` 请卷十（C23-11） | R23-1.2、R23-2.2、R23-3.3、R23-8.3、C23-11 |
| 17 | 美观基值手写加权求和、未知口径相反；`count` 无关系 | 改 `wsum(material, 'material', aesthetic)`，未知照总则；所需关系行请卷二（C23-16） | R23-1.4、R23-7.3、C23-16 |
| 18 | 卷十四读不存在的 `workKind` | 载体上登记派生维度 `workKind` | §2.2、§5.1、§5.5 |
| 19 | 本该自登的行推给别卷 | 新增 §2.5 自登服务、合同种类、`kchan`、动词、事件类型、阶段、结局、角色、来源行、固定装置类、位次、流与抽取点 | §2.5 |
| 20 | 墙面崖面雕刻无处落地 | 装饰件可装在地点表面，以“表面装饰”固定装置留在地点；天然岩面材料请卷五（C23-18）；Q23-5 并入 | R23-2.1、§4.2.5、C23-18、Q23-5 |
| 21 | `beautyForm` 逐模板手填与 §0.4 矛盾 | 写在类别行经继承取值，模板只许偏离行；§0.4 同步 | §0.4、§2.2 |
| 22 | 品质档序入算术 | 删 `demand.tierCurve`、`tierOrder`；品质只经品质表列与 `modified()`；S23-2 范围加曲线横轴 | §2.3、S23-2、R23-5.4 |
| 23 | `care` 与均分未定义 | 演出分不读 `care`；赏钱照卷二 §3.3 第 3 条按演者 id 升序末份取差 | R23-4.3、R23-4.6、A23-4.2 |
| 24 | §7 迁移清单不全 | 补 works.mjs:33、:36、:41、:43、:96/:207、:99/:215、:131、:201、:225，civic.mjs:9，notables.mjs:30–34；删“除上表两条外没有别的”一句 | §1.2、§7 |
| 小项 1 | 卷二十四称未成稿 | 改为第一版并按其节号写 | §0.1、§0.2、Q23-9 |
| 小项 2 | `workTier` 写法 | 改 `ordered enum quality` | §2.2 |
| 小项 3 | 门费引卷六 §4.10 | 改卷十九 §4.12 与卷六 §4.21 | R23-4.4 |
| 小项 5 | `WORK_RULES` 行号 | 改 :29–33 | §1.2 |
| 小项 6 | “只做三件事” | 改四件，含相似度 | R23-3.1 |
| 小项 7 | `temporal` 措辞冗余 | 删 | R23-3.3 |
| 小项 8 | 无载体时奇想比对 | 注明只比对种类与形式 | R23-1.6 |
| 小项 9 | 卷十八:656 纹章家史 | 新增 R23-2.5 | R23-2.5 |
| 小项 11 | notables 行号 | 补 :30–34 | §1.2、M23-18 |
| 小项 12 | “地点可进入”谓词无出处 | 开场条件改为动作能力段，删此条 | R23-4.1 |
| 小项 13 | `form.gen` 与 `shapekey` 两处定域 | `shapekey.min/max` 为硬域，`form.gen` 区间须落其内 | §2.1、E-WORK-FORM-KIND |

## 附 记账栏（一审小项，本轮未改）

| 小项 | 内容 | 为何未改 |
|---|---|---|
| 4 | 卷十六（:26、:531）引本卷 §4.6 作“传奇推广与升级”，本卷标题为“传奇的推广与升级” | 跨卷措辞，收尾时任一方对齐即可；本卷标题不动 |
| 10 | 卷二十六“沉迷”是否在 §4.6 | 本卷已改为“发作行（节号待核）”，见待补 6 |

## 附录 自检脚本输出

（由 F:/dnd-tmp/vols/check-卷二十三.mjs 生成；第二版全书检查原始输出见 `审查/脚本输出/卷二十三-v2-自检原始输出.txt`。）

本卷自检（§4.1–§4.9 每节 13 项逐项 PASS 的 117 行从略，全文见原始输出文件）：

```
PASS 卷首模型行
PASS 状态行
PASS §0 存在 … PASS §8 存在（9 行）
PASS 附 术语与代号表
PASS 附 待补清单
PASS §4.1–§4.9：各节 6 小节齐、数据实例 ≥ 3（实有 4、4、3、4、4、4、4、4、3）、有非西陲、有非人类或超自然、断言含【扫描】【不变量】【扩展性】
PASS 正文无具体 id 字面量（命中 0）
PASS 无用于判断的描述性文本（命中行 ）
PASS 反引号内无带引号的中文字符串（命中行 ）
PASS 台账概念：13 项全部通过
PASS 除法共 5 行，均注明除数下界或零分支
PASS 无对品质档的算术（命中行 ）
INFO 行数 907；字符数 70537；规则条 59；断言条 32；配合项 13；开放问题 10
RESULT 全部通过
```

全书四项检查摘要（第二版）：

```
[check-divisor] 合计：0 处（显式 0、隐式 0），涉及 0 卷；回归 2/2、6/6
[check-dualwrite] 甲 0 甲b 3行/10 乙 2 丙 2 丁 4 不计 4; 卷: 卷三乙,卷五,卷十九; recs 365；提到卷二十三 0 处
[check-dupnames] 列出 192，冲突级 92；冲突级提到卷二十三 0 处；提示级提到卷二十三 6 处（§2.5“本卷登记的别族行”表被读成族定义：fixture、idslot、kchan、know_family、verb 五条“重复定义”，rules.works.modifiers 一条“低级提示”），均为登记行而非重定义
[check-exemptrefs] 核对 202，未找到 47；提到卷二十三 0 处
```
