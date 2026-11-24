模型：claude-sonnet-5-5，中档（11-13 换 Opus 审查前的旧记录）（主会话 11-13 按运行记录补注）

# 卷二 审查 A

审查对象：docs/统一底层设计/卷二-维度表规范与统一入口.md（968 行，全读）。依据：PLAN.md 11-13 02:3xZ 冻结、11-13 玩家输入与模型叙述语言解析裁定、03:5xZ 禁读自然语言、04:3xZ 卷与子系统；对照仓库代码与数据（只读）。

## 总判：有条件通过

框架方向正确（单一文件格式、取值顺序、开放注册修正键、校验分级、入口单点），能作为母本。但有 8 处必改，其中 3 处会在落地时直接出错或不确定（依赖声明、数值确定性、派生公式表达力），修完再定稿。

## 必改（按严重度）

### M1 依赖声明仍是手写清单，且验证抓不到漏项（对应问题 3，最重）
- §2.3 示例 `placeViewInputs` 就是手写数组，这正是项目出过两次依赖漏项的做法。
- E-VIEW-UNDECLARED-READ 写成"加载期校验"，但依据是只读代理或测试夹具的访问追踪。那是运行期，只能抓到被测试走到的分支；没走到的路径照样漏，且漏了只表现为缓存陈旧。
- 没有规定组合规则。xxxView 调 dim()、调别的 View、经修正管线读 `state.modifiers/statuses/holdings`，被调用方的依赖怎样并入调用方，一字未提。
- 应改为：`declareViewInputs(name,{own:[…],uses:[被调用的 View 或 dim 种类]})`，注册表对 uses 做传递闭包得到最终依赖，自己不再手写并集。
- dim() 的依赖由维度表和 state-owners.json 机器生成：该 kind 的实例行位置，加上它的修正来源（见 M3 的作用域索引）。每个 View 的依赖等于 own 并上它实际会调用的 dim 种类的依赖。
- 并集算一次并冻结，缓存复用。storage.mjs:275 的 `groups.get(dependencies)` 以数组对象身份为键，每次新建数组会全部未命中，还会泄漏。
- 追踪只作为交叉校验，另加一条静态检查：入口函数体里出现的 `state.<key>` 字面量必须出现在声明或其传递闭包里。
- 另外 stateMemo 在 recordIndexDepth 为 0 时直接 build（storage.mjs:272），§2.3 已写，保留。

### M2 叠加惩罚公式前后矛盾，且浮点 exp 破坏确定性（对应问题 4）
- §0 写 `S(n)=exp(−((n−1)/k)²)`；§3.3 写"第 n 条乘 S(n−1)"，§3.3 又定义 `S(n)=exp(−(n/k)²)`。三处合起来出现 (n−2) 的双重位移。附录 B 与 B3 的数字（100/86.9/57.1/28.3）对应的是 §3.3 的写法。§0 必须改成同一写法，并明确 n 从 0 起。
- exp 的结果跨平台、跨 Node 版本不保证逐位一致；仓库现有 derived.mjs 全程用定点（fixedUnits、fixedMultiply、checkedFixed，行 251–256），并且"无修正时保持原生 IEEE 值"（行 244–250）。本卷写"沿用 derived.mjs"却改成浮点，B5 容差 1e-9 也说明是浮点。
- 应改为：惩罚系数表预先算好定点值写进规则表（n=0..N 的有限表，超过 N 取 0），求值全程定点；这样同种子同存档逐位相同，不依赖 exp。
- 并列排序没有定：同 |value| 的两条、正负侧同幅度、stackGroup 内幅度相等取哪条（derived.mjs:241 用 priority 再比 value，本卷没有 priority）。post 曲线"按声明顺序"没说声明在哪（多来源时顺序不确定）。必须补全序键：(|value| 降序, 来源 id, 修正项 id)。
- `op` 与 `stage` 冗余：mul 阶段有 `mul` 与 `post_percent` 两个 op，加载期又归一，应只留一个。post 阶段的 `value` 含义没有定义（曲线名？）。

### M3 派生公式表达力不足：本卷自己的派生维度写不出来（对应问题 1、7）
- §1.2 规定 `derived` 是 RX，变量只能是同实体其他维度。但 §5.1 的 `density = Σ portion·material.density`（对 map 求和并跨表联接）、`sourceMode`（由配方、资源场、据点、畜产是否存在派生）、`categoryKind`（被吃烧、当材料，靠配方图）、`necessityTier`（"链式继承−1"）、地点 `lawCode`（沿包含树）、`security`、`culture`（居民多数）都需要对关系做聚合或存在性判断。同实体 RX 做不到。
- 要补一个封闭的聚合原语集合（对 map 加权求和、exists、count、沿树取最近祖先、众数），在 `_vocab.json closed:true` 登记，并规定聚合的依赖怎样进入 M1 的依赖闭包。
- 派生依赖图没有环检测：valueBase 将由配方成本推（卷六），而配方原料的 valueBase 又可能由别的配方推，环会出现。E-DIM-CYCLE 只管 `extends`，需要加"派生依赖环"（L2 或 L4）。
- 修正后的值与派生的关系没有写：dim() 返回基值，value() 才含修正（§3.3），但 §2.2 的 View.dims 是哪一个？`when` 里读 subject.age 这类随时间变的维度，memo 的 inputs 要含 minute，也没写。派生公式的变量取基值还是修正值必须钉死，否则 valueRX 与派生互相依赖会出环。
- `modifiable` 的派生维度（如 volumeL）被修正后，依赖它的维度是否看到修正值，同样没有定。

### M4 "代码里没有默认值"在消费端留了口子（对应问题 1）
- §1.6 `none` 策略规定未知时"跳过该实体、取不参与、或报缺口"，由每个消费者自选。"取不参与"实质就是消费者端的隐式默认值（如未知耐磨就当不磨损），三种处理由各代码自己定，正是"一类一个写法"想杜绝的。
- 应在维度表头加 `onUnknown: skip | gap | error`（数据声明，消费者只能照此处理），校验器与入口统一执行；规则层读到 known:false 而没按 onUnknown 处理的由扫描拦截。
- §6.1 还有与原则冲突的处理：`sourceMode`"32 件无来源者 = buy_only 或按附录归类"、`categoryKind` 的 `other` 兜底桶，都是缺省的伪装；应写成显式的值（并带 basis），而不是"没有来源就等于 buy_only"的规则。
- `empty` 缺省（集合空）与"无缺省"自洽，可以保留，但要写明：空集是"确知为空"还是"未填"，两者在 `required:never` 的 set 上无法区分，建议集合维度也走 known 标记，或要求显式写 `[]`。
- 另：`rules.modifiers.stackingK` 写"缺省 2.67"，规则表里的数值叫"缺省"容易与本条混淆，改称"标定值"并带出处。

### M5 取值顺序算法有未定义的交点（对应问题 1）
- `extends` 与 `precedence` 的关系没写：步骤 2 只遍历 precedence 链，rowValue 是否沿 extends 向上取？若取，extends 父值与 precedence 中更一般的类别谁先？必须规定：加载期先把每个类别行按 extends 展平成"有效行"，再按 precedence 取值；extends 目标必须在同表 precedence 中或为 abstract。
- `memberOf` 允许两种写法（实例写 classes/tags，或类别行写 members），双源可以互相矛盾，没有校验码。要么只留一种，要么加 L4 一致性检查。`broader` 上位词是否参与 memberOf 展开，没写。
- 现有数据不是单一 precedence：material-props.json 里有三段独立 precedence——classes（22 个类别行，第 36–59 行）、physical（第 1195 行，11 个）、physicalMetal（第 1574 行，5 个）。item-class.mjs:356–359 就按 physical.precedence 另取密度。本卷表头只有一个 `precedence`，§6.2 称"整体搬入、precedence 原样保留"，但没有说三段怎样合并为一张表。需要规定：precedence 按维度分组（每维或每维族一条），或把三段合并成一条并说明冲突怎样消解。
- 同时核对："13 类别行"与仓库不符——classes 实有 22 行（timber…condiment_sauce），且 §6.2 称新增类别行以此为基。数字应更正。
- `sampleOnRead` 违背"入口纯读"（§2.2 自己说纯读）：读入口会向 state.created 写，存档内容随玩家看了什么而不同（值相同，状态不同），同种子的存档逐字节比较会不一致；还会在 memo 内部改写依赖的状态。建议：惰性采样改为"首次需要时由事件/单点写者采样"，入口只读，读到未采样的就返回 known:false 加 `pendingSample` 标记，不在读路径里写。
- 采样与类别行并存时谁赢没写：某维既有 `sample` 又有类别行的值，`required:never` 的实例被首次读取触发采样，会覆盖类别值吗？必须写明：类别行有值则不采样，或 `sample` 只用于 `default:none` 且类别无值的维度。

### M6 i18n 隔离没覆盖"生成的名字"与"运行时玩家命名"（对应问题 2）
- labels.<lang>.json 是静态文件、以 id 为键。以下情形没有出路：
  1. 程序生成的人名、地名、物品名（§1.10 只说"卷十命名规则从 labels 词库拼"）。拼出的名字存在哪、是什么结构？若存成字符串，就成了状态里的自然语言；若规则层读它（重名判断、按名查人、alias），就违规。应规定：实体只存 `nameParts`（命名库 id、种子序号、部件代号），显示名按当前语言由投影层拼出；中英切换时人名也随之切换。A5/A6 的"互换后逐事件相同"在没有这一条时，对生成实体不成立。
  2. 玩家给实体起的名（命名店铺、船、组织、自创物品）。输入边裁定是"文字→固定代号"，但这类是自由命名，无代号可翻。需要一个运行时显示名层：`state.displayNames[id]={lang?:text}`，声明为只读显示、禁止规则层读取，并在 state-owners.json 标成 `display-only`；校验器按此排除。
  3. 现有目录里还有大量显示字段没有迁出计划：item-class.mjs:331 `x.name`、物种/物品/地点的 `name`、`purpose`、material-props 的 `appearance[].term`（item-class.mjs:360，中文外观词）、sources[].name 与 citation（中文）、professions.json 的 `aliases`（§6.5 已提）、physicalMetal 的 `nameWords/forms/modifiers/tailForms`（见 M7）。§1.9 只写了 ontology 的 `label` 迁出，§6 没有为"目录里的 name/purpose/appearance"排迁出卡。E-VIEW-LABEL-READ 按字段名扫描，字段改名即可绕过，建议改为：按 state-owners.json 里标 `display` 的字段集合扫描，集合由数据声明、不是脚本里手写名单（§2.4 第 4 条的 `name/label/purpose/…` 清单同理，那是一份手写特例清单）。
  4. 错误信息、`reason`、`hint` 的中文：校验器自己的输出可以是中文，但运行时 `action-capacity.mjs:29/33/39` 返回中文 `reason`（'当前失能，无法发起行动'）。§2.5 规定谓词返回 `reason:<status_id|capability>`，§6 却没有这个函数的迁移项。
- 玩家输入：卷二没有写"菜单项显示名与代号的精确对应"放在哪。§2.2 说"按名字找属于投影层的反查，用 labels 索引，不进引擎"，与 11-13 裁定第 3 条（精确等于菜单项显示名才算）一致，但缺少显式条款：反查必须是整串精确匹配、无匹配则退回菜单；校验器/扫描要禁止在引擎里出现 labels 导入。S7 已有 labels 只被 projection/ui 导入的断言，可作依据，写进 §1.9 即可。
- 代号格式自相矛盾：§1.9 规定 `^[a-z][a-z0-9_]*$` 且"禁止大写"，同一节又规定维度键用 lowerCamel（`heatValue`），§1.1/附录里的维度键、`@ESI` 全是驼峰。校验器按哪条？应拆成两条正则：实体 id/枚举值 snake，维度键 lowerCamel。
- id 前缀当作类型来分派（derived.mjs:107 `startsWith('bld_')/'loc_'/'faction_'`）本身是一种对代号字符串的解析，本卷把 `idPrefix` 登记在表头（正面），但应写明"kind 只能由表头 idPrefix 反查，不得在代码里手写 startsWith"，并给出 `player`（无前缀）与现有 `faction_`/`monster_`/`profession_life_N` 的迁移。

### M7 §6.2 把仍在读文字的数据当作"整体搬入"（对应问题 6、7）
- material-props.json 的 `physicalMetal` 块（第 1565–1629 行）按**物品名称**的字词归类材料：`nameWords:{steel:["钢"]…}`、`forms:["条","带","片"…]`、`modifiers`、`tailForms`、`excludeTags`，由 item-class.mjs `metalProps/metalClass` 做名称尾部匹配。这是典型的读自然语言，违反 03:5xZ 硬规矩。
- §6.2 说"material-props.json 整体搬入 material.json"，没有提这一块；§6.1 的 `material` 迁法写"tags 里的材料类标签 + 金属名词"，其中"金属名词"正是此块的名称匹配。必须明确：物品→材料映射改为数据中显式写的 `material` map（由离线脚本一次产出、人工核对），`nameWords/forms/modifiers/tailForms` 整块删除，不搬入。
- `instanceTable` 示例（§1.2）写 `world/meta/items.json#props`，实际实例偏离行在 `world/meta/mechanics/items.json` 的 `props`（item-class.mjs:276、358 注释；该文件前 12 行即 tags 结构，26 行起 props）。路径要更正。items.json 本体只有 32 件带 weight，其余物品散在 `world/drafts/**/item_*.json`（Glob 约 540 个），§6.1 的"486 件"口径需要标明数据源集合，否则迁移卡无法定位。

### M8 修正键的 `<kind>.<dimension>` 命名覆盖不了现有槽，也出现了不在 17 类里的 kind（对应问题 4、7）
- §1.11 状态档修正的 `target` 写 `capability.consciousness`、`capability.breathing`，但 `capability` 不是 17 类之一，也没有维度表；§3.1 决定"键=维度表里 modifiable 维度"，所以 capability.* 无处注册，会被 E-MOD-KEY-UNREGISTERED 拒绝。要么把 capability 作为 `body_plan`/`status` 表上的一族派生维度显式登记，要么增一个 kind。
- derived.mjs 现有槽（economy:value/price/coinCredit、lending:interestRate，以及 consumers 的 decision/autonomy 基线）的主体不是 17 类实体，而是一笔交易、一笔贷款、一次决策。§3.1 第 5 点"派生槽等同 modifiable 维度、槽表由维度表自动生成"在这里不成立。§6.10 说"保留为 modifiable 维度"，但这几个量没有对应的实体表可挂。
- 现有槽还有 `alias`、`paceable`（pace 系数）、`relative` 与 `kindBounds`（按主体种类分界）、`facts`（扩展事实，derivedFactValues）、`max/min` 阶段、`exclusiveGroup/priority`（derived.mjs:60–95、232–262）。本卷的阶段是 add/mul/post，没有 max/min，也没有 priority；§3.1.5 与 §6.10 都没有逐项交代保留还是废止。要补一张"旧槽字段→新维度元数据"的对照，否则迁移时这些行为会无声丢失（涉及现有已过审的价格与利率行为）。
- 物品的修正主体是实例还是模板没有定：`item.valueBase` 是模板维度，品质/附魔修正的对象是实例（§3.6）；实例字段 `qualityTier`、`durability` 不在维度表里（§5.1 只在末行带过）。需要规定"实例维度"的声明位置（表头 `instanceDimensions`）。

## 其余问题与建议（较轻）

### 校验器（对应问题 5）
已覆盖：语法、类型/单位/取值域、引用闭合、必填、跨表不变量。缺口：
1. 类别行键是否是 `_vocab.json` 登记的标签（§1.3 要求）没有对应错误码；E-DIM-PRECEDENCE-UNKNOWN 只管 precedence→行。
2. 组件 `requires` 指的维度是否在该表 `dimensions` 里、`enables` 的规则族是否存在：没有检查。
3. 派生公式引用的变量是否都是该表已定义维度：只写"可编译"，应加 E-DIM-DERIVED-VAR。
4. 重复 id：JSON.parse 对同键后者覆盖前者，静默丢行。L0 需要重复键检测；L4 只查 generated 与 created 重 id，没有跨表全局 id 唯一（前缀不同但 id 可能重叠，如 `fac_` 与 `bld_`）。
5. `abstract` 类被 precedence 引用（§1.3 说 abstract 不参与匹配）没有错误码。
6. `modifiable:true` 与 `derived` 并存的约束没有；分布的 `weights` 总和为 0、joint 的相关矩阵非半正定、`curve` 的 x/y 单位没有校验码（只有笼统的 E-DIM-SAMPLE-PARAM）。
7. `_vocab.json` 条目自身（levels/requires/parents 等）没有 schema，是自由 JSON，引用闭合只能查到 id。
8. 标题"五级"与 L0–L5 表不符（L5 是不阻断报告），表述统一。
9. 运行期写回的生成行（A8 要求同一校验器）与"任一 error 即加载失败"之间，运行期出错怎样处理没有写（拒写？回滚？），应补。
10. 校验器自己读 id 前缀做格式检查，与"不含实体 id 字面量"一致，但前缀表来自表头，需在文中写明。

### 取值域与类型
- `substituteKey` 的枚举值直接写 `heatValue/energyDensity/massKg/areaM2/warmth`——把维度名当枚举字面量；应是 `ref dim:<kind>.<dimension>` 并由校验器检查存在且 number 类型。
- `produceSeason`、`seasonUseFactor` 是 `array[4]`，写死四季；应为 map<ref season, …>，季节是词表族，历法改动时不需改表。
- `categoryKind` 的派生规则文字里出现 `book/coin/work/key` 等标签字面量（§5.1）；这类规则应是规则表数据，且不用 `other` 兜底桶。
- §5.1 有的行写"enum 4 档、7 档"，档名是代号，OK；`necessityTier` 的次序（none<discomfort<health<lethal）需声明有序枚举（`ordered:true`），否则"max()""−1"无法定义。
- `precedence` 手写顺序与标签的 `broader` 上位关系是同一信息的两份来源（§1.3 自己说 is-a 走 broader），会漂移。建议：precedence 默认由 broader 深度派生，手写只做同层打破平局，校验器检查两者一致。

### 17 类实体够不够（对应问题 7）
- 17 类与 §1.1 文件、§2.1 入口一一对应，数目一致。但仓库里已存在、且被规则读取的实体没有位置：
  1. 配方（recipe）：工序、多原料多产出、工坊、工具、技能、工时。放进 item.`selfMake` 只能表达单产出；配方是多对多关系，应当单独成类（sourceMode/necessity/成本推价都要读它）。
  2. 法典/规范（law code、norm、bindings 180 行）：`lawCode` 只是 place 上的 ref，被引用的目标没有表。
  3. 作物/植物（卷二十五）：species 以动物与人为主，植物是否同表（taxon）没写。
  4. 路线/道路/航线（place 之间的边）：`routeSpeedFactor` 挂在 place 上，边的属性没处放。
  5. 区域/政区层级（county、province、region，regions 40 行）：是否都算 place，没写；`jurisdictionLevel` 是枚举，但被引用的辖区实体要有 kind。
  6. 魔法/法术/仪式/神迹（magic-marks、magic-object、rite）：只有 `ability` 与 `miracleBudget`，法术自身无表。
  7. 动词/行动（offense.act 引 `verbs.json`）、伤害类型（armorMult 的键 damageType）、货币：被当作 vocab 引用，但是否是 17 类外的第 18、19 类没有说清，vocab 条目自带参数时（如 ability.levels）就需要表。
  8. 生物个体与建筑个体：`bld_`（建筑实例）与 `fac_`（设施类型）并存，§2.1 的 facilityView 读哪个、建筑算 place 还是 facility 没写（§6.4 的 436 栋建筑属于哪张表）。
- 玩家 `player`、`creatures`（derived.mjs:106 区分 npcs/creatures）也要说清是 person 还是 species 的实例。
- 按 04:3xZ，每卷要列子系统并写维度/入口/交互；本卷未列"子系统"一级（只有 §2.1 的实体入口），建议在 §5.18 加一列"本卷所辖子系统：维度表加载、取值、采样、修正求值、校验、入口缓存、写者声明"，与卷零对照表对齐。

### §6 抽查（问题 6）
抽查 5 处，对照仓库：
1. `facility-state.mjs:30 facilityKind(base)`、同文件 :43 对 `base.facilityType` 的回退：属实。`world/geo/locations.json` 中 `facilityType` 只出现 1 次（31173 行，值是 `granary`，不是 `fac_*`），与"1/436"吻合；但现值无前缀，迁移要改值格式（§1.9 前缀规则）。
2. `extraction.mjs:147`：`item_fish`、`item_water`、`item_charcoal` 三件写死，属实。
3. `finance-tax.mjs:36`：`/部|帐|兽/.test(polity)` 等按名称正则判政体，属实；§6.7/§5.10 的映射方向正确。
4. `hidden-passives.mjs:69–71`：`profession_life_5/21/19` 编号映射领域，属实。
5. `entity-view.mjs:582 itemView` 只 8 个字段（id,item,owner,status,durability,quality,maker,source），属实；`action-capacity.mjs:27 capacity`、`:62 canAct` 位置属实。
抽查中发现的偏差：
- "13 类别行"实为 22（M5）。
- `physical`/`physicalMetal` 两块未映射且后者按名称字词归类（M7）。
- `instanceTable` 路径不对（M7）。
- items.weight 486/486、shelfLifeDays 477/486 等计数我没有核对：世界物品散在 drafts 约 540 个文件，没有单一来源，未重算；建议卷十一在迁移卡前先给出统计脚本与数据源清单。

### 其他
- 附录 A 夹具里的 `"fac_forge"`、`bld_hw_forge` 与 §1.9 前缀规则一致，但 `matcat_/fixture_/class_` 前缀在 §1.9 只列了一部分（缺 `matcat_`、`fixture_`、`tradeclass`），补全。
- `_units.json` 含 `satiety_per_kg_dry`、`copper`，是本作世界内单位，与"底层与表现形式无关"不矛盾，但应标 `calibrate:true`（与 §1.7 一致）。
- §1.10 种子键 `sha256(template.seed, kind, rowId, dimension, instanceId)`：写明串联时的分隔与编码（字节序、分隔符），否则不同实现结果不同。
- §2.4 第 2 条的基线数（196 处、311 处等）是 06a 口径，引用写明报告节号即可。

## 对七个问题的逐条结论

1. 格式与顺序：可落地，但需补 M5（extends/precedence/多段 precedence）与 M4（onUnknown）。"代码里没有默认值"在表头与入口层自洽，在消费端不自洽。
2. i18n：ASCII 代号与"labels 只在投影层"成立；生成名、运行时玩家命名、目录里残留的 name/appearance/nameWords 没覆盖（M6、M7）。
3. 依赖声明：不通过，须改为由被调用方组合（M1）。
4. 开放注册枚举的结论合理；五段求值可实现，但叠加惩罚公式矛盾、浮点不确定、并列序未定（M2），与现有槽字段对不上（M8）。
5. 校验器：主线覆盖，缺口见"校验器"一节。
6. §6：5 处抽查属实 3.5 处，偏差见上。
7. 特例与语言依赖：手写名单（描述字段名单）、enum 里的维度名、四季数组、`other` 兜底、`physicalMetal` 名称匹配仍在；17 类缺配方、法典、路线、植物、法术等。

## 通过条件
M1–M8 逐条在卷内改写并给出夹具级可判定的断言（至少：依赖闭包由注册表生成的断言；惩罚系数表与定点求值的逐位一致断言；onUnknown 缺失即校验失败的断言；生成名按 nameParts 切换语言的断言）。其余按"其余问题与建议"择要吸收。
