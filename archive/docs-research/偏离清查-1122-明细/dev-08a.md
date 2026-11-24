共 15 条，甲 0 乙 11 丙 4，有理由 5 无理由 10。

本卡读了：卷十 :96-104、:154-231、:258-330、:333-406、:760-799（另核 :441-447、:1413-1418）；server-plugin/kernel/gen/worldgen.mjs :1-248、stages.mjs :1-97、order.mjs :1-145、envelope.mjs :1-94、writeback.mjs :1-143、ids.mjs :1-68、rows.mjs :1-76、draw.mjs :1-33、when.mjs :1-36、fields.mjs :1-120（全部读完）；data 侧核 _vocab.json :634-825、world/rules/tables/worldgen.json、seed-keys 相关键。没读到的：卷十 §2.1 :107-152、§2.6 之后 R10-2.x 正文（:407-759）、§4.12（:800-1000）不在本卡给的范围内，凡依赖这些段的都放"拿不准/跨卷待判"。

### 1 阶段条目的 whenRX 从不求值
- 位置：server-plugin/kernel/gen/worldgen.mjs:189-198
- 设计原文：卷十 :381，R10-1.6"`whenRX` 非空时，只对使它为真的主体运行"。
- 代码实际：`generateFill` 按 `genPlan()` 的次序对每个条目一律调 `run(...)`，只把 `when` 作为求值器塞进 ctx，从不读 `entry.whenRX`；全仓无任何对阶段条目 `whenRX` 的求值点。
- 理由：无（Grep docs/问题.md、李白裁定-1117.md 无此条）。
- 影响：规则缺——手写骨架世界（`skeletonSource=authored`）里 `whenRX` 应为假的骨架、路网阶段会照常运行并出生成提案；现这两阶段生成器未建，暂未出错。
- 严重程度：乙
- 合并：无

### 2 rules.gen.reject.rows 从不求值
- 位置：server-plugin/kernel/gen/worldgen.mjs:148-247
- 设计原文：卷十 :383，R10-1.8"`worldgen` 相的阶段全部跑完、写回器落盘之前，对 `rules.gen.reject.rows` 逐行求值……任一行为真即以 E-GEN-REJECT 与该行的原因代号结束"。
- 代码实际：`generateFill` 跑完阶段直接返回 `{plan, generated, created, ...}`，没有 reject 行求值，也不抛 E-GEN-REJECT；worldgen.json 里也没有 `rejectRows` 这个键。
- 理由：无（Grep 两份记录无此条）。
- 影响：规则缺——不合格的世界不会被拒，直接建成并落盘，同一种子的结果与卷文不一致。
- 严重程度：乙
- 合并：无

### 3 写回器不做每阶段引用闭合校验
- 位置：server-plugin/kernel/gen/writeback.mjs:30-71、server-plugin/kernel/gen/worldgen.mjs:221
- 设计原文：卷十 :776，R10-9.5"写回器在每个阶段结束时做一次引用闭合校验，所以后行阶段读到的世界总是自洽的"。
- 代码实际：每阶段只逐维 `checkValue`；`checkValue` 的 `ref:<kind>` 查的是加载期 `env.idIndex`，不含先行阶段本事务新交的 `created` 行，也没有"阶段末把提案并入再核一遍"的步骤。
- 理由：无。
- 影响：规则缺——引用先行阶段新建行的提案会被判 E-GEN-ROW-INVALID（误拒），或引用不存在行时无人发现；后行阶段读到的世界无法保证自洽。
- 严重程度：乙
- 合并：无

### 4 写回器不校验 writesFamilies
- 位置：server-plugin/kernel/gen/writeback.mjs:35、:84；server-plugin/kernel/gen/stages.mjs:38
- 设计原文：卷十 :780，R10-9.9"能新建哪些开放词表族的条目，以它的 `writesFamilies` 为准……写回器在同一处拒绝两者范围之外的提案"。
- 代码实际：`writeback`/`createRows` 只核 `writesKinds.includes(table)`；`checkGenStages` 只核 `writesFamilies` 是字符串列表，全仓无任何提案对 `writesFamilies` 的核对。
- 理由：无。
- 影响：规则缺——阶段越界新建词表条目不会被拒；现无阶段新建词表条目，暂未出错。
- 严重程度：乙
- 合并：无

### 5 writesKinds / idslot.kind 用表代号，非设计里的 kind 代号
- 位置：server-plugin/kernel/gen/writeback.mjs:35、:84；server-plugin/kernel/gen/ids.mjs:49、:64；数据 world/ontology/dimensions/_vocab.json:678
- 设计原文：卷十 :341 `"writesKinds": ["kind_place"]`；:780"一个阶段能写哪些实体类，以它的 `writesKinds` 为准"。
- 代码实际：判据是 `stageEntry.writesKinds.includes(ctx.table)`（`place`/`org`/`office` 等表代号），位次条目 `kind` 也写 `org`/`office`；`_vocab.json` 的 writesKinds 写 `["place"]`，全仓无 `kind_place`，词表里也没有 `kind` 族。
- 理由：无（设计 §2.1 的 kind 族定义不在本卡读的范围，未核它是否另有登记）。
- 影响：只是形式——声明粒度由实体类退化成表名，当前表与类一一对应，暂未出错。
- 严重程度：丙
- 合并：无

### 6 generateWorld / requireMaterialized 未建，只有 generateFill 子集，opening/expand 相不运行
- 位置：server-plugin/kernel/gen/worldgen.mjs:148
- 设计原文：卷十 :291"`generateWorld(engine, template)`，只在世界创建流程里运行"；:372"写：`generateWorld()`（世界创建流程：worldgen 相、预跑、opening 相，各一次）；`requireMaterialized()`（物化）"。
- 代码实际：只有 `generateFill`（注释自称"generateWorld 的最小部分"）；没有 `generateWorld`/`requireMaterialized`，没有预跑，`opening` 相与 `expand` 相不运行，`gen.open`、`openingMinute` 无人写。
- 理由：裁定 P-28（docs/审查/李白裁定-1117.md:1714，"世界创建卡只建 generateWorld 与数据驱动的步骤表"）。
- 影响：规则缺——§3.2 的两个唯一写入口不存在，物化与开局无从发生。
- 严重程度：乙
- 合并：见公共部件审查-乙-1122.md 第三节 2、4

### 7 generateFill 无生产调用者
- 位置：server-plugin/kernel/gen/worldgen.mjs:148
- 设计原文：卷十 :403，A10-1.1"`generateWorld` 与 `requireMaterialized` 之外调用生成器的位置为 0"。
- 代码实际：server-plugin 内无调用者；只有 tests/ 与作者工具 tools/convert-geo-g5b.mjs:454 调用，生产路径（index.mjs）没有入口。
- 理由：裁定 P-30（docs/审查/李白裁定-1117.md:1716，"6-16 验收时必须有非测试代码调用这条路径"）。
- 影响：规则缺——生成流程在今天的生产里跑不起来，块 6 真实世界验收无路可走。
- 严重程度：乙
- 合并：见公共部件审查-乙-1122.md 第三节 3

### 8 state.genesis、state.genDone 全仓无写者
- 位置：server-plugin/kernel/gen/writeback.mjs:1-143（§3.2 指定的 worldgen-writeback.mjs 实体现）；server-plugin grep `state.genesis`/`state.genDone` 为 0 处
- 设计原文：卷十 :221-222（§2.5 两行，唯一写者 `worldgen-writeback.mjs`）、:294（§3.2"`state.genesis`、`state.genDone` | `worldgen-writeback.mjs`"）。
- 代码实际：写回器只把提案落成 `generated` 节偏离行，既不写 `state.genesis` 的两个成员，也不写 `state.genDone` 的集合加入；全仓无这两条路径。
- 理由：无。
- 影响：规则缺——第 0 日/开局时刻与"这处地点做过哪些物化阶段"没有出处，`openingOf`、`materialized` 无数据可读，物化无法去重。
- 严重程度：乙
- 合并：无

### 9 instanceIdOf 丢掉 minute 参数，clocked 位次导不出 id
- 位置：server-plugin/kernel/gen/ids.mjs:47-53（:50 调 `instanceDigestOf` 时不传 minute）
- 设计原文：卷十 :277"`instanceIdOf(engine, slotId, parentId, ordinal, minute)` | 实体 id | 实例位次导出"。
- 代码实际：公开入口的签名是 `(vocab, worldSeed, genesisMinute, slot, parentId, ordinal, idPrefix)`，没有 minute，恒按 genesisMinute 调摘要；对 `clocked: true` 的位次会走 `at = minute`（undefined）而抛 E-SEED-COMPONENT，根本导不出 id。
- 理由：无。
- 影响：规则缺——卷文要求"建行时刻入 id"的位次无法使用；现有四条 idslot 都是 clocked:false，暂未出错。
- 严重程度：乙
- 合并：无

### 10 §3.1 的生成期读入口大多不存在
- 位置：server-plugin/kernel/gen/stages.mjs:84（只有 `genPlan`）；其余入口全仓无定义
- 设计原文：卷十 :270-285，§3.1 读入口表：`genPlan`、`genView`、`manifestOf`、`quotaOf`、`seatOf`、`rosterOf`、`composeName`、`instanceIdOf`、`rollGroup`、`ageWeights`、`ageStructure`、`materialized`、`layoutOf`、`caveCellsOf`、`templateBlocksOf`、`openingOf`。
- 代码实际：`genPlan`（stages.mjs:84）、`instanceIdOf`（ids.mjs:47）有；`layoutOf`/`caveCellsOf`/`templateBlocksOf` 在 kernel/layout.mjs:239、cave.mjs:101、grid-template.mjs:87 已建；`genView`、`manifestOf`、`quotaOf`、`seatOf`、`rosterOf`、`composeName`、`rollGroup`、`ageWeights`、`ageStructure`、`materialized`、`openingOf` 全仓无定义（`genView` 只在 polity.mjs:40 注释里出现）。
- 理由：无。
- 影响：玩法不可达——未物化远方站点没有唯一读入口（卷二十九要靠 `genView`）、开局时刻读不到、物品组与名册无从求值。
- 严重程度：乙
- 合并：无（其中 layoutOf/caveCellsOf/templateBlocksOf 已建，不重复记）

### 11 when.mjs 只读本行维度，读不到形制条目的数值字段
- 位置：server-plugin/kernel/gen/when.mjs:4、:21-30
- 设计原文：卷十 :186，`rules.gen.bldfill.rows`"`whenRX` 只读建筑行的 `intendedType` 代号与所挂形制条目的数值字段"。
- 代码实际：`makeWhen` 只把被求值行自身的维度绑进 `dim` 命名空间；行上没有的键按未知/未命中，形制条目的字段根本不可读（代码注释 :4 自述"未落"）。
- 理由：问题.md:615（"现有 RX 只读本行维度（gen/when.mjs）；要读须卷二登记 RX 命名空间读入口（跨卷，须报李白排期）"）。
- 影响：规则缺——按形制数值字段分档的补缺规则写不出来，只能用 `known(form)` 之类过渡行顶替。
- 严重程度：乙
- 合并：见公共部件审查-乙-1122.md 第五节（规则表读口）

### 12 genIdKey 自拼种子键串，不经 handles/keys.mjs
- 位置：server-plugin/kernel/gen/draw.mjs:8、:31-33
- 设计原文：卷十 :260"键的组成只按卷二十七 §4.8（种子键与骰值键……）的五段"。
- 代码实际：`const KEY_JOIN = '|'`，`genIdKey` 用 `[worldSeed, slot, parentId, String(minute), String(ordinal)].join(KEY_JOIN)` 自己拼串再 sha256，`keys.mjs` 的 `joinSep`/键构造函数没被调用；前两个实参 `stream`/`site` 收了不用。
- 理由：问题.md:591（记为待勘误，抽共用原语）。
- 影响：规则缺——种子键拼接有两个来源，确定性风险；暂未出错。
- 严重程度：乙
- 合并：见公共部件审查-甲-1122.md C1、公共部件审查-乙-1122.md 第二节 4

### 13 后行阶段补"先行阶段已生成过的维度"时误报 E-GEN-OVERRIDE-AUTHORED
- 位置：server-plugin/kernel/gen/writeback.mjs:49；server-plugin/kernel/gen/worldgen.mjs:193
- 设计原文：卷十 :377，R10-1.2"后行阶段可以给先行阶段在本事务里建的行补维度与组件，只补没写过的，不改已写的"。
- 代码实际：`worldgen.mjs:193` 已把先行阶段生成值并进有效行，`writeback.mjs:49` 只凭 `author.dims[dim] !== undefined` 判"作者已有值"，于是对先行阶段生成过的维度也抛 E-GEN-OVERRIDE-AUTHORED（作者冲突码），而非"已生成、不许改"的分开判码。
- 理由：无（问题.md:591 只收口了带 `revise` 的路径）。
- 影响：只是形式——拒绝行为正确，错误码把生成值与作者值混为一谈，追溯时分不清冲突来源。
- 严重程度：丙
- 合并：无

### 14 不抽取的阶段把 seedKey 写成空串
- 位置：server-plugin/kernel/gen/order.mjs:140；server-plugin/kernel/gen/envelope.mjs:67
- 设计原文：卷十 :773，R10-9.2"`generated` 节的每一行带 `generated = {by: 产生它的阶段代号, seedKey: 它的实例位次键, at: genesisMinute}`"。
- 代码实际：`genOrder` 的投影提案与 `genEnvelope` 的补缺提案都用 `seedKey: ''`，写进 `generated` 节的是一个空串而不是实例位次键。
- 理由：无（问题.md:591 只记了 `generated.by` 多阶段记法与抽取对象 id 形式）。
- 影响：只是形式——追溯标记缺一段，A10-9.2"每个生成行的 seedKey 能由（位次、父、序位）重算"对这些行不成立。
- 严重程度：丙
- 合并：无

### 15 导出 id 的唯一性不按 E-GEN-ID-COLLISION 核
- 位置：server-plugin/kernel/gen/writeback.mjs:87；server-plugin/kernel/gen/ids.mjs:37-38
- 设计原文：卷十 :777，R10-9.6"写回器对每个新 id 核对它不与任何已有行（手写或生成）相同；相同即 E-GEN-ID-COLLISION"。
- 代码实际：`createRows` 对同表已存在的 id 抛 E-GEN-ROW-INVALID（不是 E-GEN-ID-COLLISION），跨表不查；`ids.mjs` 导出摘要后也不与已有 id 比对；全仓无 E-GEN-ID-COLLISION 的抛出点。
- 理由：问题.md:591（记为待勘误："id 唯一核对改为同表同 id 即偏离行"）。
- 影响：只是形式——同表重复能挡住，错误码与跨表核对不合卷文。
- 严重程度：丙
- 合并：无

## 已登记未建
- `gstage_skeleton` 与其余阶段条目未登记，`gstage_waterfoot`/`gstage_fields` 的 `after` 暂不写骨架（卷十 :342-343）：登记处 world/ontology/dimensions/_vocab.json:683、:747 basis，问题.md:591 ④。
- `opening` 相与 `expand` 相（`gstage_opening`、`gstage_m_*`，卷十 :362-366）未登记、不运行：登记处 公共部件审查-乙-1122.md 第三节 2（"generateWorld、requireMaterialized 不存在（在改，见世界创建卡 ds/world-create）"）。
- 开局三件 `applyGovernorCalls`/`applyOpeningAssets`/`applyOpeningPeople` 只测试调用，未接进 `genPlan` 的 opening 相：登记处 公共部件审查-乙-1122.md 第三节 4、PLAN:144。

## 拿不准
- R10-1.4"阶段按 `scope` 对每个主体各运行一次"（卷十 :379）：`generateFill` 是整表一次跑、由各生成器内部遍历主体（worldgen.mjs:189-217）。结果看起来与逐主体等价，但没有"主体按 id 升序、阶段逐主体运行"的显式一轮，判不出是否算偏离。
- `generated.by` 一行只一个、同一行两阶段补时只能记先写的阶段（writeback.mjs:59，注释 :10 自述）：卷十 :773 没写按维度记来源的写法，问题.md:591 ⑤ 已记待勘误，本卡不当偏离。
- `fields.mjs:112-113` 的 `seedKey` 取该行第一个 `gfield` 的骰值键，不是 R10-9.2 说的"实例位次键"；一个场一个抽取点、一行多场时只能落一个，是否可接受需卷文补口径。
- `worldgen.mjs:227` 给非本表 `createRows` 传 `authoredIds: new Set()`，手写优先判据在这些表上为空；现 `geo.authored` 只喂本表，暂无作者输入，判不出是临时口子还是漏。
- `worldgen.mjs:171-176` 的 `materialDensityOf` 直读材料表行值、不经 `dimensions.mjs` 的 `dim`：docs/卡回报/opening-ledger.md:24 已定"密度不经 materialView，直接读材料表行值"，理由写明；代码层仍属绕过维度读入口。
- `order.mjs:121` 在 `elevationDim` 不是字符串时整阶段静默返回、不记 deferred/缺口：卷十 :799（A10-9.3）说漏给来源应以 E-GEN-ROW-INVALID 失败而不是带缺口运行，但 R10-2.18 不在本卡读的范围内，判不出该不该按此码拒。

## 跨卷待判
- `instanceIdOf`/`drawObjectIdOf` 的 id 字面格式（前缀 + 摘要前半、去掉族前缀做 stem，ids.mjs:51、:66-67）与卷二十七 R27-8.9 五样、卷二 §1.10 派生函数是否一致，要读卷二十七与卷二才能判。
- `writesKinds`/`idslot.kind` 的 kind 族是否在卷二 §1.9 另登记（现仓里无 `kind_place`），要读卷二才能判是本卡的第 5 条还是数据未登。
- `when.mjs` 要读形制字段，须卷二 §1.12 登记 RX 命名空间读入口（问题.md:615 已写"跨卷，须报李白排期"）。
- 抽取点代号 `gen_fields`/`site_gen_fields_dev`（fields.mjs:73、:112）与卷十 §4.12.1 登记的 `stream.gen.fields`/`site.gen.fields.dev` 的点号写法：问题.md:591 记作待勘误"代号点换下划线"，要读 §4.12.1 原文才能判。
