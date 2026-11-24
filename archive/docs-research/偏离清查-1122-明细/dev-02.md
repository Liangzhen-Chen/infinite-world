# 偏离清查·第 2 组（卷二 维度表规范，维度部分）

共 13 条，甲 0 乙 7 丙 6，有理由 4 无理由 9。

（只清查、只写本文；不改设计书、数据、代码。卷:行 依据 docs/统一底层设计/卷二-维度表规范与统一入口.md，代码行号为本次 Grep/Read 所见。）

### 1 写入路径的必填判断与加载器 requirement 重复，且只覆盖 always/byClass 两种策略
- 位置：server-plugin/kernel/dimension-writers.mjs:74-78（requiredFor）、:202-206（writePersonRow 只判 required===always）
- 设计原文：卷二:105 `.required` 全策略（always/never/byClass/ifPresent/byEnum/anyOf/byDigestible/byReader/byFootprint）；:116 `instanceDimensions`"格式同 dimensions"
- 代码实际：requiredFor 只判 always 与 byClass:，其余策略一律返回 false（当作 never，即不要求）；writePersonRow 只强制 required===always 的维度，其余策略不判
- 理由：无（validate/rows.mjs:156-171 的 requirement 已实现全部 8 种策略，运行时 dimensions.mjs:151 的 applicable 已调它，写入路径却另写一份子集）
- 影响：规则缺——若某实例维度/个体维度用 ifPresent/byEnum/anyOf/byFootprint 等策略，建实例/建人时必填校验被静默绕过（当前 item instanceDimensions 只用 always/byClass、person 只用 always/never，未触发）
- 严重程度：乙
- 合并：无

### 2 modified 基值未知时不记 W-MOD-UNKNOWN-BASE
- 位置：server-plugin/kernel/dimensions.mjs:507-508
- 设计原文：卷二:1494（§3.8）"基值 `known:false` 时按该维度 `onUnknown` 处置（skip/gap/error），不单独求值；`gap` 时另记 W-MOD-UNKNOWN-BASE（TA-S2）"
- 代码实际：evaluate() 对未知基值原样返回 base Fact，不按 onUnknown 处置、不记 W-MOD-UNKNOWN-BASE；该码登记在 error-codes.mjs:76 但全仓 0 处抛出
- 理由：无
- 影响：规则缺——gap 缺口少记一类，L5 缺口统计与 state.gaps 不全
- 严重程度：乙
- 合并：无

### 3 stage 封闭枚举在 dimensions.mjs 重列，与 markers.mjs 同值两处
- 位置：server-plugin/kernel/dimensions.mjs:37
- 设计原文：卷二:289（§1.9 末段）代码内封闭枚举 stage 取值 add/mul/max/min/set/post；定义源 handles/markers.mjs:11 `CODE_ENUMS.stage`（该文件 :1 自称"定义源只此一份"）
- 代码实际：dimensions.mjs:37 `STAGES = Object.freeze(['add','mul','max','min','set','post'])` 再 markersOf 一份，未用 `T.code_enum.stage`（已从 types.mjs 导入 T）
- 理由：无
- 影响：只是形式——同值两处，改一处漏一处即静默错
- 严重程度：丙
- 合并：无

### 4 recursive 字段格式不校验，E-DIM-DERIVED-RECURSIVE 从不抛出
- 位置：server-plugin/kernel/validate/dimensions-validate.mjs:476-479
- 设计原文：卷二:110 `.recursive` derived 自引用时必须 `{"relation":"<relation id>"}`（E-DIM-DERIVED-RECURSIVE）
- 代码实际：checkDerivedGraph 只读 `def.recursive.relation` 判自引用是否合法，不核 recursive 字段形状（缺 relation、非对象、多字段不报）；E-DIM-DERIVED-RECURSIVE 登记 error-codes.mjs:22 但全仓 0 处抛出
- 理由：无
- 影响：规则缺——recursive 写错形不会在加载期报错（当前无 recursive derived 维度，未触发）
- 严重程度：丙
- 合并：无

### 5 enum 的 ordered 字段不校验
- 位置：server-plugin/kernel/validate/types.mjs:91-95（checkDef enum 分支）
- 设计原文：卷二:114 `.ordered` enum 可选，E-DIM-DOMAIN-ENUM
- 代码实际：enum 分支只核 vocab 族与拒绝内联 enum，不核 ordered 字段；item.json:108 qualityTier 已写 `ordered:true`
- 理由：无
- 影响：只是形式——ordered 写错类型/取值不报
- 严重程度：丙
- 合并：无

### 6 effects 深拷贝用 JSON.parse(JSON.stringify)
- 位置：server-plugin/kernel/effects.mjs:15
- 设计原文：卷二:897 "JSON 文本解析只在 kernel/load/*"；kernelApi 已有 clone（clone.mjs:9）
- 代码实际：`const copy = (v) => JSON.parse(JSON.stringify(v))` 深拷贝输出字段
- 理由：无
- 影响：只是形式（内核里 JSON 文本解析越界；clone 未复用）
- 严重程度：丙
- 合并：见 docs/研究/公共部件审查-乙-1122.md 第十节

### 7 vocab.mjs 缺"族条目枚举"读口，各文件直读 engine.vocab.families/index
- 位置：server-plugin/kernel/vocab.mjs（只有 vocab() 单条、kindOf、idIndex，无 familyEntries）
- 设计原文：卷二:469 横切入口 vocab；卡头第二节第 9 条"同一判断只一处"
- 代码实际：同义小函数自写多处（perceive.mjs:89、events.mjs:152、gen/fields.mjs:29、gen/stages.mjs:17、gen/ids.mjs:15、calendar.mjs:406）
- 理由：无
- 影响：规则缺——每张新卡再抄一遍"列某族全部条目"
- 严重程度：乙
- 合并：见 docs/研究/公共部件审查-乙-1122.md 第十节

### 8 代号/键文法的长度上限 47 写死在多份正则里
- 位置：server-plugin/kernel/validate/types.mjs:12-13、server-plugin/kernel/handles/keys.mjs:28、:30、:418、:424（vocab-handle.mjs:10 再转出 CODE_RE）
- 设计原文：卷二:291 代号文法 `^[a-z][a-z0-9_]{1,47}$`、键文法 `^[a-z][a-zA-Z0-9]{0,47}$`；数据里已有 kernelConstants.grammarMaxLength=48（同出处）
- 代码实际：同一上限现在有"正则字面量"与"规则表"两个出处，正则写死在至少 5 处
- 理由：无
- 影响：只是形式（上限改一处漏一处）
- 严重程度：丙
- 合并：见 docs/研究/公共部件审查-乙-1122.md 第五节（第 5 条写死常量）

### 9 distribution 类型在加载期不校验参数（E-DIM-SAMPLE-*）
- 位置：server-plugin/kernel/validate/types.mjs:285（checkValue `default: return`）
- 设计原文：卷二:325（§1.10 参数校验）normal sd>0、lognormal sigma>0、uniform min<max、triangular min≤mode≤max、categorical 权重非负整数和>0、clamp⊂domain、joint 半正定
- 代码实际：加载期 checkValue 对 distribution 不判，参数校验只在运行期 sample.mjs:100-313 才做
- 理由：dimensions-validate.mjs:4 头部"未做（P-2 汇报列出）：…distribution 参数…"
- 影响：规则缺（表头 sample 的分布参数错误要到运行采样才暴露）
- 严重程度：乙
- 合并：无

### 10 表头 version / distributionsVersion 不校验（E-DIM-SCHEMA-VERSION）
- 位置：server-plugin/kernel/validate/dimensions-validate.mjs:70（有注释但不做）
- 设计原文：卷二:95 `version`"整数版本，只认当前版"（E-DIM-SCHEMA-VERSION）；:120 `distributionsVersion`（E-DIM-SCHEMA-VERSION）
- 代码实际：表头不读 version、不读 distributionsVersion，不报 E-DIM-SCHEMA-VERSION
- 理由：docs/问题.md:178（与卷一 V-17 版本分叉扫描相抵，待李白定）
- 影响：规则缺（版本字段不校验）
- 严重程度：乙
- 合并：无

### 11 表头 budget 不校验（E-MOD-BUDGET）
- 位置：server-plugin/kernel/validate/dimensions-validate.mjs checkHeaderSection（无 budget 分支）
- 设计原文：卷二:118 `budget` 可选，E-MOD-BUDGET（maxModifiers、totalBounds/stageBounds）
- 代码实际：维度表头 checkHeaderSection 不核 budget；该码只在 load/rules.mjs:201-208 核过程主体槽 derived-process.json
- 理由：docs/问题.md:478"E-MOD-BUDGET（加载期检查，不在 §3.3 管线）——归加载器补卡"
- 影响：规则缺（维度表头写了 budget 无人核对）
- 严重程度：乙
- 合并：无

### 12 memberDeviationThreshold / sources 推算与成员偏差未做（E-DIM-MEMBER-DEVIATION 等）
- 位置：server-plugin/kernel/validate/dimensions-validate.mjs（checkHeaderSection 无 memberDeviationThreshold 分支；无 deriveFromSources）
- 设计原文：卷二:119 `memberDeviationThreshold`（E-DIM-MEMBER-DEVIATION）；:283（§1.7）sources 推算与成员偏差
- 代码实际：不核 memberDeviationThreshold、不做 sources 推算与成员偏差；E-DIM-MEMBER-DEVIATION/E-DIM-SOURCE-MISMATCH/E-DIM-INSTANCE-BASIS 登记 error-codes.mjs:47 但由数据侧维护，本校验器不落地
- 理由：dimensions-validate.mjs:5 头部"未做（P-2 汇报列出）：…sources 推算与成员偏差…"
- 影响：规则缺（成员偏差阈值、出处一致性不机判）
- 严重程度：乙
- 合并：无

### 13 dimension-writers 事务内裸写 setInTx 与 4 个文件同式
- 位置：server-plugin/kernel/dimension-writers.mjs:40-55（setInTx）、:57-61（denied）
- 设计原文：卷二 §2.6 事务处置（撤销项格式唯一消费者是 transaction.mjs 回滚）
- 代码实际：撤销项/denied 同一段代码抄在 ledger.mjs、holdings.mjs、scheduler.mjs、terminate.mjs 共 5 份
- 理由：无（卷文未点名"事务裸写原语"唯一出处，属代码层重复）
- 影响：只是形式（格式改一处须同步五处）
- 严重程度：丙
- 合并：见 docs/研究/公共部件审查-乙-1122.md 第一节第 4 条

---

## 拿不准（缺卷文依据，不猜）

- **Fact 形状缺 `current` 字段**：卷二:475 `Fact = {known, applicable, value, base?, unit?, source, current, chain?}`，代码 Fact（dimensions.mjs:24）无 `current`；但 `current` 在全卷二只出现这一次、从未定义含义，疑似设计遗留字段。缺"current 的卷文定义"才能判断是否为代码缺字段。
- **反查索引/规则分类（reverseIndex/ruleIndex）的读取位置**：dimensions.mjs:215-225 把两者排在类别链之后、派生之前（source='index'），但 §1.3 取值算法（:151-162）与覆盖顺序总表（:169）都没写这两个后补来源的位置。缺"卷文写明读取顺序"的句子。

## 跨卷待判

无。
