共 13 条，甲 0 乙 11 丙 2，有理由 7 无理由 6。
本卡读了：卷二十七 :110-215、:216-263、:266-374（全读）；server-plugin/sim-tiers.mjs :1-118、bubble.mjs :1-120、position.mjs :110-217、kernel/mount.mjs 全、kernel/view-registry.mjs 全、kernel/load/rules.mjs :125-310、kernel/place.mjs :318-402、kernel/holdings.mjs :258-261；world/rules/tables/ 下 sim-tiers.json、control.json、host.json、save-layout.json 全文，det-numeric.json 只读 :1-30 与七个 fnTable 行（全文 466KB 未通读）；world/rules/registry.json :75-110、:545-625；world/ontology/state-owners.json :1-57、:153-212；world/ontology/dimensions/_vocab.json 族名清单（未通读）；tests/kernel/sim-tiers.test.mjs :1-170；迁移体检/格子G6-G11 :134、块4.md :125。未读：卷二十七 :375 以后（不在本卡范围）、det-numeric.json 全文。

---

### 1 §2.1 十六个词表族一个也没登记
- 位置：world/ontology/dimensions/_vocab.json:2（families 里无 simtier、simform、pinreason、sharerule、aggkind、advclass、driftstat、disttest、metricclass、scenariotag、docpart、degradeop、partition、replaymode、perfmetric、seedrole；全仓 grep `simtier_` 只命中 docs）
- 设计原文：卷二十七 §2.1 :118「`simtier` | `simtier_individual`、`simtier_rule`、`simtier_stat` | 模拟层。**有序族**（`ordered:true`）」；:119–:133 另十五族
- 代码实际：_vocab.json 的 families 只有卷二 `aggregate` 族，无本卷任何族；加载器只读这一个文件（kernel/load/vocab-load.mjs :15-18）
- 理由：无
- 影响：规则缺（层的序值、结算形态、指标类别只能以后写字面量，撞红线）
- 严重程度：乙
- 合并：无

### 2 sim-tiers 表缺 §2.2 的十二个键
- 位置：world/rules/tables/sim-tiers.json:2-8（只有 bubbleRadiusRegionCells 一行）；world/rules/registry.json:600-610（同）
- 设计原文：卷二十七 §2.2 :142「`individualMaxHops` | sim-tiers | integer | 跳 | 0–16 | 加载失败」；:141–:152 共十二键（unitAdminLevel、individualMaxHops、ruleMaxHops、ruleSharedAncestorLevel、cadenceMinutes、matrix、observables、driftTolerance、driftToleranceDefault、driftStat、seedSampleSize、globalUnitTier）均无
- 代码实际：表里只登 bubbleRadiusRegionCells；其余十二键既无数据行也无 registry 类型/取值域
- 理由：迁移体检/格子G6-G11-规矩检查对照.md:134（已定：主会话 11-21，sim-tiers.mjs 由 G10 先建最小子集，余随卷二十七主体卡）
- 影响：规则缺（加载期无从校验、消费方无表可读）
- 严重程度：乙
- 合并：无

### 3 cost-model 表整体未登记，七个键全缺
- 位置：world/rules/tables/cost-model.json（文件不存在）；world/rules/registry.json 无 costModel 行
- 设计原文：卷二十七 §2.2 :161「`coef` | cost-model | map<系统键, map<simform, integer>> | cu | 0–10⁹ | 缺即 E-COST-COEF-MISSING」；:161–:167 共七键
- 代码实际：无该表、无 registry 行；kernel 下无 cost-model.mjs
- 理由：PLAN.md:55（「首张建 cost-model.mjs、sim-tiers.mjs 的卡」）；docs/问题.md:648（建它是卷二十七主体卡（cost-model）的事）
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 4 bench 表整体未登记，十一个键全缺
- 位置：world/rules/tables/bench.json（文件不存在）；world/rules/registry.json 无 bench 行
- 设计原文：卷二十七 §2.2 :179「`metricClass` | bench | map<perfmetric, enum metricclass> | — | 2 值 | 缺行即加载失败」；:179–:189 共十一键
- 代码实际：无该表、无 registry 行；性能度量表与 E-PERF-BUDGET 计数器 0 命中
- 理由：docs/问题.md:648（性能度量规则表归卷二十七主体卡 cost-model）；迁移体检/格子G12-G16-规矩检查对照.md:158（计数器与度量表归卷二十七主体卡）
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 5 aggregate-kinds 表整体未登记，七个键全缺
- 位置：world/rules/tables/aggregate-kinds.json（文件不存在）；world/rules/registry.json 无 aggregateKinds 行
- 设计原文：卷二十七 §2.2 :154「`aggKind` | aggregate-kinds（行键） | 代号 | — | 族 `aggkind`」；:154–:160 共七键
- 代码实际：无该表、无 registry 行；kernel 下无 aggregate.mjs（state-owners.json:5 却已把 aggregates.* 写者记为 aggregate.mjs）
- 理由：无（问题.md:631/:652 只泛称「卷二十七主体卡」，未提本表）
- 影响：规则缺（聚合子系统无数据可载）
- 严重程度：乙
- 合并：无

### 6 save-layout 缺 `shards` 键
- 位置：world/rules/tables/save-layout.json:2-24（只有 snapshotEveryEvents、segmentEvents、keepSnapshots）；world/rules/registry.json:77-86 同
- 设计原文：卷二十七 §2.2 :168「`shards` | save-layout | list<struct{shard:代号, part:enum docpart, paths:list<路径模式>, partition:enum partition}> | — | — | 未覆盖即 E-SAVE-SHARD-UNCOVERED」
- 代码实际：表与 registry 均无 shards；kernel/save.mjs compileLayout :298 要求 layout.shards 为数组，但无数据来源
- 理由：docs/问题.md:321（真实世界还没有存档分片表，随建分片表的卡补，归 6-16）
- 影响：规则缺（E-SAVE-SHARD-UNCOVERED 无从按数据触发）
- 严重程度：乙
- 合并：无

### 7 save-layout 缺 `logKeepSig`、`logKeepVerbRoles` 两键
- 位置：world/rules/tables/save-layout.json:2-24；world/rules/registry.json:77-86
- 设计原文：卷二十七 §2.2 :172「`logKeepSig` | save-layout | integer 档 | — | [0, 卷二十四 `sig.maxBand`] | 加载失败」；:173「`logKeepVerbRoles` | save-layout | list<规则表键> | — | 每项指向一个动词句柄 | 空表」
- 代码实际：两键均无数据行、无 registry 类型/取值域
- 理由：无（问题.md、PLAN、迁移体检均未登记这两键）
- 影响：规则缺（R27-4.12 日志折叠无保留档与保留句柄）
- 严重程度：乙
- 合并：无

### 8 det-numeric 缺 `keyIdAggBits`、`keyIdOrdinalBits` 两键
- 位置：world/rules/tables/det-numeric.json:2-14（只登 mathAllow、safeIntMax、fnTables）；world/rules/registry.json:91-106 同
- 设计原文：卷二十七 §2.2 :176「`keyIdAggBits` | det-numeric | integer | 位 | ≥1 | 加载失败 | 新（封卷后勘误，李白 11-14 X5）」；:177 同理 `keyIdOrdinalBits`
- 代码实际：两键无数据行、无 registry 类型/取值域（全仓 grep 0 命中）
- 理由：迁移体检/块4.md:125（keyIdAggBits、keyIdOrdinalBits 留卷二十七 §4.2 首卡，块 7）
- 影响：规则缺（本名键号位宽、E-KEYID-WIDTH 校验无据）
- 严重程度：乙
- 合并：无

### 9 host 缺 `heartbeatStepMinutes`
- 位置：world/rules/tables/host.json:2-20（只登 saveSlotCount、saveImportMaxBytes）；world/rules/registry.json:547-558 同
- 设计原文：卷二十七 §2.2 :190「`heartbeatStepMinutes` | host（全名 `rules.host.heartbeatStepMinutes`） | integer | 分钟 | ≥1 | 加载失败 | …首值 10」
- 代码实际：无该键；kernel/mount.mjs:8 注释也写「等规则表 rules.host.heartbeatMs 与 heartbeatStepMinutes 登记后」
- 理由：world/rules/registry.json:556（心跳两键随墙钟心跳那张卡登记，6-19 回报缺口 3）
- 影响：规则缺（心跳推进无步长，块 6 推进入口缺一参数）
- 严重程度：乙
- 合并：无

### 10 登记键整行缺失时加载器不报错，§2.2 的 onUnknown「加载失败」未实现
- 位置：server-plugin/kernel/load/rules.mjs:145-157（readTable 只查「表里的键已登记」，不查「登记的键都在表里」）、:283-284（只核定义形状）；world/rules/registry.json:600-610
- 设计原文：卷二十七 §2.2 :153「`bubbleRadiusRegionCells` | sim-tiers | integer | 区格 | 1–4 | 加载失败 | …校验：取值域外即加载失败」
- 代码实际：删掉 bubbleRadiusRegionCells 这一行，loadWorld 仍零 error；直到第一次 bubbleView/inBubble 才由 radiusOf（sim-tiers.mjs:39）抛 E-RULES-UNREGISTERED，不是加载失败
- 理由：无
- 影响：规则缺（坏世界能启动，错到首次使用才暴露）
- 严重程度：乙
- 合并：见 docs/研究/公共部件审查-乙-1122.md:86（规则表直读、表缺静默当未知一类；该文称「是否立为硬规矩须李白定」）

### 11 §3.1 的 sim-tiers.mjs 只落了两个入口，其余入口与其文件全未建
- 位置：server-plugin/sim-tiers.mjs:1-118（只有 bubbleView、inBubble、controlledByPlayer）；server-plugin/aggregate.mjs、cost-model.mjs、sim-advance.mjs 均不存在
- 设计原文：卷二十七 §3.1 :222「`simUnitOf(engine, subjectRef)` | 规则层 `sim-tiers.mjs`」；:222–:232 还列 baseTierOf、simTierOf、advancePlan、pinned、aggregateView、legalKeyIdOf、costPlan、degradeLevelOf
- 代码实际：九个入口中一个也没有；sim-advance.mjs（§3.2 唯一写者、§2.2 状态路径的写者）缺，故 simProgress/simDegrade 无人写
- 理由：迁移体检/格子G6-G11:134（最小子集）；PLAN.md:55；docs/问题.md:652（归卷二十七主体卡 sim-advance）
- 影响：规则缺（三层判定、推进计划、档位、聚合、成本全不可达）
- 严重程度：乙
- 合并：无

### 12 sim-tiers.mjs 头注称 rules.control 尚未登记，实际已登记
- 位置：server-plugin/sim-tiers.mjs:9-10「未落：rules.control 规则表与席位持有种类行归卷九、卷十八，本仓库尚未登记」
- 设计原文：卷九 R9-3.9 :721「一个实体由玩家出意图，当且仅当它有一条在世的玩家席位边」；玩家控制登记即卷二十七 R27-1.12 :310 的输入
- 代码实际：world/rules/tables/control.json:4 已登 seatKind=hk_player_seat，world/rules/registry.json:611-621 已登 control 表，_vocab.json holding_kind 有 hk_player_seat（:812）；seatKindOf 能读到
- 理由：无
- 影响：只是形式（注释误导后来者以为缺前置）
- 严重程度：丙
- 合并：无

### 13 已登值行的出处字段不齐
- 位置：world/rules/tables/sim-tiers.json:4（有 basis 无 source）；world/rules/tables/det-numeric.json:4、:9（有 source 无 basis）；world/rules/tables/control.json:4（有 basis 无 source）
- 设计原文：卷二十七 §2.2 :139-192 表头有「出处」列，每键有出处；卷二十七 §2.2 :153 首值依据写在 basis
- 代码实际：host.json、save-layout.json 两字段齐全；上列三表各缺一项（卡要求值缺 source/basis 记）
- 理由：无
- 影响：只是形式（出处仍可从另一字段读出）
- 严重程度：丙
- 合并：无

---

## 已登记未建

- §2.2 状态路径 `simProgress.<unit>.through`、`simDegrade.level`、`simDegrade.atChunk`、`aggregates.*`、`aggregates.nextAggNo`（:198–:208）的写者 sim-advance.mjs、aggregate.mjs 未建：PLAN.md:55、docs/问题.md:652、world/ontology/state-owners.json:5（写者记 aggregate.mjs，文件不存在）。
- §3.3 退役旧入口核对通过：advance-layers.mjs 不存在，全仓无 advanceLayerPlan/remoteScheduleBatch、无 legacy/migrations、无 world-upgrade/rule-state-migration，无偏离可记。
- 展开/收起的落格、场值折算、日界重派生（R27-1.13–1.16）分别归 G12/G14 与 position.mjs、bubble.mjs：bubble.mjs:11-20、docs/问题.md:648–652 已登记，本卡不重复记。
- `pm_offscreen_cells`、`pm_bubble_expand_ms` 等计数器与度量表未建：docs/问题.md:648、迁移体检/格子G12-G16:158（归卷二十七主体卡/G18）。

## 拿不准

1. state-owners.json:49 的 sys.simTiers 只把 inBubble 登在 predicates，bubbleView 没登。该字段目前只用于 S27-11/A27-1.11 扫描取「提供文件」（tools/accept/criteria.json:4697），inBubble 已足以派生 sim-tiers.mjs；是否必须补登 bubbleView 不明。
2. 同条 sys.simTiers 的 tables 为 []，而 sim-tiers.mjs 读 rules.simTiers 与 rules.control；其他系统的 tables 都列所读规则表（如 sys.status:["status"]）。该字段现无扫描消费者，是否应补不明。
3. server-plugin/position.mjs:128-130 对玩家控制实体用 `controlled ? true : inBubble(...)` 短路。注释 :127 的理由是写入后的泡随它移到目标区格、目标已核在外包框内，故中心区格必在泡内，结果与 inBubble 等价；但是否算 S27-11「自算在不在现场泡里」不明（position.mjs 归 G12 卡）。
4. 卡面说「上一轮已记 bubbleRadiusRegionCells 取值域 1-4 无上界校验」，本轮未复现：registry.json:604-606 有 domain [1,4]，tests/kernel/sim-tiers.test.mjs:45-62 断言 0/5/-1/2.5/null/"unlimited"/"inf" 均在加载期报 E-DIM-DOMAIN-RANGE；代码 radiusOf（sim-tiers.mjs:39）自身只核整数且 ≥1，生产路径必过加载器。按卡未重复记，供核对。

## 跨卷待判

无。本卡 13 条的判定都只需卷二十七与上列文件；aggregate-kinds 的字段语义虽牵卷二 §1.9，但此处判的是「有没有」，不需跨卷。
