# 偏离清查 03a：卷二（规则表与世界加载器）

共 9 条，甲 0 乙 7 丙 2，有理由 1 无理由 8。

本卡读了：卷二 :32–61、:62–122、:365–416、:490–509、:897；为核"加载期校验覆盖错误码"，补读 §4.1 规则表登记 :1539–:1554 与 §4.3 错误码表 :1565–:1637；为核 string 显示登记原句，补读 §1.5 :177–:183；卷一 :135–159（指定 :145，连同上下文一次读）。代码全读：kernel/load/rules.mjs:1–320、world.mjs:1–251、flatten.mjs:1–117、vocab-load.mjs:1–145、json-text.mjs:1–90；world/rules/registry.json 全篇。为取证补读：kernel/error-codes.mjs:1–120、:180–210，kernel/validate/dimensions-validate.mjs:1–4、:62–91，kernel/handles/keys.mjs:413–415，kernel/storage.mjs:56–63，kernel/item.mjs:42、:498，tests/accept/detectors.test.mjs:543–579。未读：卷二 §1.3（继承）、§1.4（单位）、§1.5 其余部分（类型清单只读 :177–183 核 string 行）、§1.9（词表）、§2.7、§2.9 正文；因此 flatten.mjs 只按卷一:154 的四写法与代码自述对照，vocab-load.mjs 的结构性规则无法逐句核；dimensions-validate.mjs 其余部分未读，L0–L3 逐码语义只按错误码表、代码注释与全仓 grep 判。

③ 清单逐项：错误码全部是 §4.3 已登记码，未见自造码；手拼 `Error` 加 `code` 只有 rules.mjs:306 `ruleTable`（与乙-1122 已记的 deny 同式，不重复计）。公共部件：rules.mjs 调 `parseJsonStrict`、`checkDef`/`checkValue`、`isRuleTableFile`、`installDetNumeric`；flatten.mjs 调 det-math 的 `fixedUnits/fixedAdd/fixedMultiply/truncateTo` 与 validate 的 `splitKey`；json-text.mjs 调 markers 的 JSON 记号与 vocab-load 的 `jsonScalarAt`。vocab-load.mjs:4 的 `CODE_RE` 是代号文法另写一份，已见公共部件审查-乙-1122 第五节第 4、5 条，不重复记。§1.12 的派生/scope 闭包见"已登记未建"第 1 条；未建派生登记（entries/columns/families…）由 dimensions-validate 读，不在本卡代码范围，未核。§1.1 的文件布局与 world.mjs 的读取面对过：维度目录、`_vocab/_units/_distributions/_effects/_unbuilt-derived`、state-owners、registry 都有入口；labels/display 归 textcore 与显示层，不在本加载器，未判。

### 1 display 集合恒为空，string 维度必填校验被架空
- 位置：server-plugin/kernel/load/world.mjs:130–131
- 设计原文：卷二 §1.5 :183「字段必须在 state-owners `display` 集合登记，规则层不可读（E-DIM-STRING-NOT-DISPLAY）」
- 代码实际：`displaySet: []` 写死；注释自述声明表没有显示字段集合的机读键，"暂为空集，见 docs/问题.md"。types.mjs:106 据此对一切 string 维度报 E-DIM-STRING-NOT-DISPLAY，等于 string 维度不可用，登记校验也无从谈起。
- 理由：docs/问题.md:184（P-2：视为空集，待声明表定键）
- 影响：规则缺
- 严重程度：乙（现无表头维度用 string 类型——item.json:19 的 string 在 struct 内层，不被这条核；一有表头 string 维度即挡）
- 合并：无

### 2 加载器按名直取 rules.grid、写死实体类 place
- 位置：server-plugin/kernel/load/world.mjs:193（`installGridRules(read.rules.grid)`）、:63（`PLACE_KIND = 'place'`）
- 设计原文：卷二 §4.1 :1554「kernel/load/rules.mjs 按登记逐行读，不按文件名找表」；卡头第二节第 10 条「规则、种类一律放数据表」
- 代码实际：`read.rules.grid` 不经 `ruleTable`，未登记时不给加载错，`installGridRules` 存 null，等 storage.mjs:61 运行期才抛 E-RULES-UNREGISTERED；`PLACE_KIND` 把实体类代号写进加载器，place 表改名则生成场条目校验静默跳过。
- 理由：无（仅注释自述生成场要读 place 维度）
- 影响：规则缺
- 严重程度：乙（现 registry 有 grid，暂未出错）
- 合并：无

### 3 loadWorld 只跑 L0–L3，L4 整层未跑
- 位置：server-plugin/kernel/load/world.mjs:127；server-plugin/kernel/validate/dimensions-validate.mjs:1–4
- 设计原文：卷二 §4.1 :1541「在 `loadWorld` 跑 L0–L4，任一 error 即加载失败」；:1549「L4 跨表不变量 | 首期三条必须：E-DIM-INVARIANT-MASS-VOLUME…、E-DIM-INVARIANT-PORTION-SUM…、E-DIM-INVARIANT-SEVERITY-ORDER…」
- 代码实际：validateDimensions 文件头自述"L0–L3"，"未做（P-2 汇报列出）：L4 不变量…"；全仓 grep，三条必须不变量只有 PORTION-SUM 在 item.mjs:498 有抛出点，MASS-VOLUME 与 SEVERITY-ORDER 0 处；应当项 E-DIM-INVARIANT-DOCTRINE-GROUP（error-codes.mjs:29）也 0 处。
- 理由：无（仅注释自述"P-2 汇报列出"；问题.md 里 grep 不到 L4 不变量）
- 影响：规则缺
- 严重程度：乙
- 合并：无（1122 清查只记了 distribution 参数与 memberDeviation/sources 两处，未记 L4 整层）

### 4 磁盘上未登记的规则表文件无人检查
- 位置：server-plugin/kernel/load/rules.mjs:71–135（只遍历 registry 行，从不列目录）
- 设计原文：卷二 §4.1 :1611「读入的规则表没有登记行、表里有登记之外的键、或登记行所指的文件不存在，即 E-RULES-UNREGISTERED，加载失败」
- 代码实际：只按登记行读文件，从不 `readdir` world/rules；现 world/rules/tables/ 下 currency.json、market.json 没有登记行（price.mjs:6 自注 market.json"表未登记"），加载不报。digest-exclude.json 亦无登记行，但按卷二 §2.9 第 3 条另有格式与读者（save.mjs:39），修时应排除。
- 理由：无
- 影响：规则缺（多出的规则表文件静默不加载；币制与市场表现在就处于此状态）
- 严重程度：乙
- 合并：无（检测器 S6-2 明确"不在登记里的文件不读"，见 tests/accept/detectors.test.mjs:559）

### 5 规则表行不强制带 basis
- 位置：server-plugin/kernel/load/rules.mjs:24（`ROW_FIELDS`）、:148–151
- 设计原文：卷一 :155「规则表：`engine.rules` 可达的表；每个数值称"标定值"并带 `basis`（卷二 §1.6、§3.2）」
- 代码实际：`basis` 只在白名单里，`readTable` 只要求已写字段是字符串，不要求出现；只有 fnTable 形状的行另由 checkFnRow:261 强制非空 basis。
- 理由：无
- 影响：规则缺（标定值可以没有出处，加载照过）
- 严重程度：乙
- 合并：无

### 6 E-KEYID-WIDTH 全仓无抛出点，两个位宽键未登数据
- 位置：server-plugin/kernel/error-codes.mjs:196；world/rules/registry.json:88–109（detNumeric 的 type/domain 无 keyIdAggBits、keyIdOrdinalBits）
- 设计原文：卷二 §4.3 :1612「E-KEYID-WIDTH … 两键之和加 1 位段标志超过 53 即加载失败（卷二十七 R27-2.2；封卷后勘误，李白 11-14 X5）」
- 代码实际：码只在 error-codes.mjs 登记，全仓 grep 无抛出点；det-numeric 表也没有这两个键，加载期既不读也无从判超限。
- 理由：无
- 影响：规则缺（键号位宽超限不会在加载期拦下）
- 严重程度：乙
- 合并：无

### 7 四个已登记的加载期码全仓无抛出点
- 位置：server-plugin/kernel/error-codes.mjs:17（W-DIM-UNIT-DIM）、:31（E-GROUP-SIZE / E-GROUP-OVERLAP）、:55（E-MOD-SLOT-DUPLICATE）
- 设计原文：卷二 §4.3 :1573「W-DIM-UNIT-DIM | state-owners 加载 | …pathTypes 的数值路径或命名 struct 的数值字段没带单位…」；:1587「E-GROUP-SIZE / E-GROUP-OVERLAP | L2 | 模块组超上限 / 互相重叠」；:1609「…E-MOD-SLOT-DUPLICATE | L2 | 修正项」
- 代码实际：四码只在错误码表登记；全仓 grep 无抛出点（W-DIM-UNIT-DIM 只在测试里被当字符串构造）。state-owners 合并、模块组与修正项槽校验都没有这几道核对。
- 理由：无
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 8 derivedProcess 登记行缺 type/domain 两字段
- 位置：world/rules/registry.json:23–30；server-plugin/kernel/load/rules.mjs:118–123
- 设计原文：卷二 §4.1 :1554「每张规则表一行，七个字段——表代号…；文件…；结构…；类型…；取值域…；归属卷…；`multiSourceMerge`」
- 代码实际：该行只有 code/file/structure/volume/multiSourceMerge/packOverridable；加载器对 `structure: "processSlots"` 显式放行不写 type/domain，改由 §3.7 专用校验。
- 理由：无正式裁定入库（仅代码注释自述"李白 11-18 块 2-5 裁定①"；相关建议见 docs/审查/卷二十八-封卷只核.md:74）
- 影响：只是形式
- 严重程度：丙
- 合并：无

### 9 fnTable 形状的五个键名写死在加载器里
- 位置：server-plugin/kernel/load/rules.mjs:239–240（`FN_SHAPE`）
- 设计原文：卡头第二节第 10 条「已有公共部件就必须调它，不许自己另算一份」；卷二 §4.1 :1554「类型（…取 §1.5 类型清单）」
- 代码实际：`['inScale','outScale','domainMin','domainMax','step']` 在代码里另列一份，用它识别某行是不是 fnTable；同一 struct 的字段与 required 已写在 registry.json:94–104，识别时不用。
- 理由：无
- 影响：只是形式（struct 增字段或改名时，识别口径与登记脱节）
- 严重程度：丙
- 合并：无

## 已登记未建／已知缺口（不算偏离，不计数）

1. `dim:<kind>` / `modified:<kind>` 的 relation 与 scope 闭包为空（world.mjs:226–228，`uses: []`）。设计卷二 §2.3 :503–504。合并：docs/研究/偏离清查-1122.md 第二节第 9 条（第 3 组 #1），不重复计。
2. 表头 `version` 与 `distributionsVersion` 不校验。设计卷二 §1.2 :96；登记处 docs/问题.md:178。合并：偏离清查-1122 第三节有理由表第 10 行。
3. `memberDeviationThreshold` 与 `sources` 推出值不做，E-DIM-MEMBER-DEVIATION / E-DIM-SOURCE-MISMATCH / E-DIM-SOURCE-PLACEHOLDER 无抛出点。设计卷二 §4.1 :1548；仅注释自述。合并：偏离清查-1122 第二节乙级第 8 条。
4. `recursive` 字段形状不校验，E-DIM-DERIVED-RECURSIVE 不抛。设计卷二 §4.1 :1546。合并：偏离清查-1122 第二节丙级第 17 条。
5. 代号文法正则多份、长度上限 47 写死在正则里。合并：公共部件审查-乙-1122 第五节第 4、5 条与偏离清查-1122 第二节丙级第 20 条。
6. W-MOD-UNKNOWN-BASE 全仓 0 处抛出。偏离清查-1122 §〇（第 8 行）已核过，不重复计。
7. `_units.json` 外层定为 `{"units": [...]}`、`kernel-constants.json` 定为 `{"rows": [...]}`。卷二未写外层；登记处 docs/问题.md:188（P-2），不判偏离。

## 拿不准

1. **siFromRule 指向未登记的规则表时静默不给 si**：vocab-load.mjs:93 在表不在 `engine.rules` 时 `continue`，单位不收 si，读者用到换算时才拒。注释自述"同 world.mjs 对终止去留表的做法"，但卷二 §1.4 勘误 1119k5 原文不在本卡范围，判不了这是"按缺口交出"还是"应报 E-DIM-UNIT-UNKNOWN"。
2. **单位行的类型没核**：vocab-load.mjs:67–73 只核 id 文法、dimension 是字符串、`si` 与 `siFromRule` 恰写一个，不核 `si` 是数、`calibrate` 形状；`si` 写成字符串也收入 units。卷二 §1.4 原文未在本卡范围，未判是否应有码。
3. **卡文要查 registry 的 grade/source 字段，卷二没这两项**：卷二 §4.1 :1554 的七字段是 code/file/structure/type/domain/volume/multiSourceMerge；`source`、`grade`、`file`、`basis` 是规则表行（rules.mjs:24 `ROW_FIELDS`）的出处字段。两处口径不一，按卷二判 registry 行无需 grade/source，未计偏离。
4. **behaviors 的语义**：dimensions-validate.mjs:73 只核"非空数组"，不核每一项是不是规则族代号；卷二 §1.2 :98 的校验栏写 E-DIM-BEHAVIOR-UNKNOWN，看名字像"行为代号未登记"，但全仓没有行为码登记处，判不了该按哪一种。
5. **`market.json` 与 `currency.json` 的归属**：两者缺登记行（见第 4 条），但内容不是 `{"rows":[...]}` 规则表格式（market 是卷十五市场参数、currency 是币制），是遗留还是另一套格式，卷二判不了，须按卷十五、卷六定。

## 跨卷待判

1. **E-KEYID-WIDTH 的修法**：补校验要把 `keyIdAggBits`、`keyIdOrdinalBits` 登进 `rules.detNumeric`，两键的定义与初值（聚合体号 20、成员序号 31）归卷二十七 R27-2.2；卷二 :1612 只登记"两键之和加 1 位超过 53 即加载失败"。补数据与补校验跨卷二、卷二十七。
2. **合并模式该不该在代码里列**：rules.mjs:29–34 的 `MERGE` 以代码内枚举列出四种 `multiSourceMerge` 及各自适用的值类型；卷二 :1554 说取值与语义归卷二十八 §2.11。加载器内置该枚举是否合"规则放数据里"（还是 §1.9 允许的代码内封闭枚举），跨卷二、卷二十八，本卡不判。
3. **未登记规则表文件的扫描边界**：若补第 4 条的检查，要先排除按卷二 §2.9 第 3 条另有格式的 digest-exclude.json；market.json、currency.json 是规则表还是遗留数据，须卷六、卷十五各自定。修补法跨多卷。
