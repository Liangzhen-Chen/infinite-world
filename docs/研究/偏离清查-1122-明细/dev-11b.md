共 8 条，甲 0 乙 6 丙 2，有理由 0 无理由 8。
本卡读了：卷二 :522–565（§2.6 写者与三接口）、:566–659（§2.7 stateKeys／kernelApi 表）、:660–720（§2.7 声明表示例、pathTypes／keyKinds 例）、:786–870（§2.7 建行／改写写者、dated、pathTypes 文法）、:882–935（§2.8 字符串类型规则）、:1040–1069（§2.9 内存／存档形态与全局白名单，取证 base64 与 structuredClone）；卷二十七 :530–606（§4.4.3）、:607–663（§4.5）。代码全读：server-plugin/kernel/storage.mjs :1–662、kernel/bytes.mjs :1–115、kernel/clone.mjs :1–11、kernel/memo.mjs :1–62。取证另读：kernel/handles/keys.mjs :100–401、kernel/handles/markers.mjs :60–215、kernel/load/state-owners.mjs :179–291、:470–526、kernel/dim-value-check.mjs :1–40、kernel/dimension-writers.mjs :39–72、:100–215、kernel/save.mjs :165–220、kernel/transaction.mjs :100–190、kernel/transport/reply-channel.mjs :95–105、kernel/gen/polity.mjs :100–115、world/ontology/state-owners.json :55–121、world/ontology/named-structs.json :51、world/rules/tables/kernel-constants.json 全、docs/问题.md :626、:886；前人报告 dev-03b／03c／03d／11a 只读摘要。未读：卷二 :1–521、:721–785、:871–881、:936–1039、:1070–末；卷二十七 :1–529、:664–末；kernel 其余文件只按名 Grep。

**已核无偏离（不计数）**
- §2.6 三接口的其余各项：writePath 只在事务内、写者核对、值按副本写、textPaths 与账本路径不生成 P、被拒时 markDenied 交事务整笔回滚——与 :526–536 一致。
- 特殊值：空段由 statePathSegments（keys.mjs:353–357）拒；NaN／Infinity／-0（含嵌套值）由 hasNonFinite（storage.mjs:236–241、:270–271）拒；状态路径全是对象键，无“负数组下标”这一类。
- bytes.mjs 数值字面量只有 0／1，进制与 UTF-8 档位全取 kernelConstants（INT_KEYS／LIST_KEYS，kernel-constants.json 各键齐备），缺键或类型不对即 E-DIM-STRUCT-FIELD。base64／UTF-8 算法与 RFC 4648／3629 逐条对过，无读数错。
- state.* 直接写：全仓非 storage.mjs 的 `state.` 命中 40 处，全是读或注释，赋值／push／delete 0 处；事务裸写 5 份（dimension-writers:40、holdings:136、ledger:300、scheduler:328、terminate:192）已在公共部件审查-乙-1122 §一.4／:155／:177 与 dev-11d #4 登记，合并。
- rewriteRows 行范围与 dated 追加不核行范围：已在 dev-03c #3、docs/问题.md:626 登记（卷二 :796–:797），合并，不重复计。
- clone.mjs 本身合规；两处直接 structuredClone 的旁路（reply-channel.mjs:101、gen/polity.mjs:109）已在 dev-03d #2 登记，合并，不重复计。

### 1 建行写者只按“路径当前无值”放行，不核目标行的创建事务
- 位置：server-plugin/kernel/storage.mjs:210–215（writerOk，:214 `existing === undefined`）
- 设计原文：卷二 :795「只许在该行被创建的同一笔事务里写这条路径；`writePath` 运行期核对目标行的创建事务就是当前事务，不是即拒写（E-VIEW-UNDECLARED-WRITE）」
- 代码实际：只凭 `getAt(state, segs) === undefined` 判“建行”；事务对象（transaction.mjs:184）不记本笔事务建了哪些行，所以建行写者在任何后来的事务里，对该行尚未写过的叶子路径都能写。
- 理由：无（docs/问题.md:626 只登记 rewriteRows 行范围，:760 只记 create 适配器未建，都未涉本句）
- 影响：规则缺（建行写者可在建行事务之外补写该路径，绕开“创建后只能由改写写者写”）
- 严重程度：乙（现数据全是字符串写者，create 列表全空，暂未触发）
- 合并：无

### 2 `number:<单位>` 路径收非整数，状态可存浮点
- 位置：server-plugin/kernel/storage.mjs:172（typeOk number）、:503–508（valueFitsPathType 走同一判断）
- 设计原文：卷二十七 :619「状态里的数只有两种：整数（绝对值不超过 `safeIntMax`），或按维度 `precision` 的定点数（底层同样是不超过 `safeIntMax` 的整数）」
- 代码实际：`case T.type.number: return typeof v === 'number'`；`1.5`、`1e300` 都合格。现有 `itemInstances.*.durability／spoilage／taint`、`stockLots.*.*.*.*.spoilage` 是 `number:fraction`，底层应是定点整数。
- 理由：无
- 影响：数据错（浮点进状态，破坏定点／存档摘要的整数前提）
- 严重程度：乙（现生产写者都写定点整数，未触发；一有浮点即甲）
- 合并：无

### 3 写入不核 safeIntMax，E-DET-OVERFLOW 在 writePath 无抛出点
- 位置：server-plugin/kernel/storage.mjs:172–173、:260–277（writePathChecked 只调 hasNonFinite）
- 设计原文：卷二十七 :619「一次写入会让某个数超出 `safeIntMax` 时，该写入被拒绝并报 E-DET-OVERFLOW，不截断、不换别的表示法」
- 代码实际：`Number.isInteger` 对 `2**53`、`1e300` 都为真；hasNonFinite 只拦 NaN／Infinity／-0。全仓 E-DET-OVERFLOW 只在 det-math.mjs:69 抛，writePath 不抛。
- 理由：无
- 影响：数据错（超安全整数进状态，后续 JSON／定点读数失真）
- 严重程度：乙（现写者经 det-math 截断或写小整数，未触发）
- 合并：无（dev-11c #5 记的是 det-math 自带 safeIntMax 字面量，不是本条）

### 4 dimension 路径值不调维度校验器，只核“非 string 维度＋纯数据”
- 位置：server-plugin/kernel/storage.mjs:178（typeOk dimension）、:273（writePathChecked 只调 stringDimension）
- 设计原文：卷二 :856「dimension（按该维度表声明；`string` 类型的维度被排除在 dimension 路径之外…）」；同段「运行时写入按声明类型检查…不合即拒写 E-TEXT-UNGATED」
- 代码实际：值只要 plainValue（数值／布尔／null／代号及其数组对象）就收；不核该维度的类型、单位、取值域、ref 族、是否派生、是否可空。公共件 kernel/dim-value-check.mjs 的 checkField 已有（dimension-writers.mjs:160、dated.mjs:39 都调），writePath 不调。
- 理由：无（仅 storage.mjs:272 注释自述只核 string 维度）
- 影响：规则缺／绕过（给数值维度写对象、给非空维度写 null、给派生维度写显式值，都进得了状态）
- 严重程度：乙（现生产 writePath 没有写 dimension 通配路径的调用点；generic 写者经 dimension-writers 的 checkField）
- 合并：无

### 5 struct:<名> 只核“纯数据对象”，不核命名 struct 的字段、必填与字段类型
- 位置：server-plugin/kernel/storage.mjs:179（typeOk struct）、:160–166（plainValue）
- 设计原文：卷二 :856「struct:<名>（命名结构，定义与登记在 §1.5“命名 struct 登记”，EA-Q4）」；同段「运行时写入按声明类型检查…不合即拒写 E-TEXT-UNGATED」
- 代码实际：`case T.type.struct: return v !== null && typeof v === 'object' && !Array.isArray(v) && plainValue(v)`；缺字段、多字段、字段类型错的 pos／statusInstance／terminated 值都收；`list<struct:…>`（statuses、pendingPost、revivals.points）逐元素同样只走这条。
- 理由：无
- 影响：规则缺（结构值可缺键、错类型、带无关键进状态；position.mjs:160 的 pos 是生产路径）
- 严重程度：乙（现调用方都是引擎自算的正确值，未触发）
- 合并：无（dev-03b #5 记的是 named-struct-match.mjs 对 `named` 维度只认 integer／boolean，不是 writePath 的 struct 分支）

### 6 ref 与实体解析只查加载期 idIndex，不认运行期建行
- 位置：server-plugin/kernel/storage.mjs:176（typeOk ref）、:244–252（stringDimension）
- 设计原文：卷二 :856「ref/enum 值须匹配代号正则并在对应词表族或 idIndex 内」；卷二 :529「值符合 pathTypes 的声明类型」
- 代码实际：ref 用 `registry().idIndex.get(v)`（加载期表）；运行期建行（state.created，如 docs/问题.md:886 的 59 人）不在 idIndex，作 ref 值一律判不合。同一内核的 dim-value-check.mjs:16 已用 kindOfEntity 包出能认建行的 idIndex 面，appendDated（storage.mjs:352）也用 kindOfEntity，writePath 不同；stringDimension 查不到 id 时回退 keyKinds 第一个类。
- 理由：无
- 影响：规则缺（运行期新建的个体／实例不能被 ref 路径引用或写入）
- 严重程度：乙（现生产 writePath 调用点没有 ref 路径值）
- 合并：无

### 7 base64 码表放在 kernel/bytes.mjs，卷二规定只在 kernel/sealed.mjs
- 位置：server-plugin/kernel/bytes.mjs:9、:44–69（ALPHABET 与 base64ToBytes／utf8ToText）；server-plugin/kernel/sealed.mjs 不存在
- 设计原文：卷二 :897「字符串操作按文件限定：…base64 查表只在 `kernel/sealed.mjs`…」
- 代码实际：base64 字母表与编解码全在 kernel/bytes.mjs；kernelApi（卷二 :653）登记的 kernel/sealed.mjs#makeSealed 无实现文件；kernel-constants.json 的字节行 source 又引“卷二 :1047”（现 :1047 是 layout_change 信号行，base64 专用项实为 :1060）。
- 理由：无（仅注释自述“kernel 自带 base64 码表”，未写为何不在 sealed.mjs）
- 影响：只是形式（码表只一处、行为对；文件限定与卷文不符，按卷文应报 E-KERNEL-ONLY／闭集违例）
- 严重程度：丙
- 合并：无（dev-11a #3 记的是 Sealed 内存形态，不是码表位置）

### 8 Sealed 字段名单两处写死，未取命名 struct 或 markers 定义源
- 位置：server-plugin/kernel/storage.mjs:22、:521–530（SEALED_FIELD_LIST／isSealedValue）；server-plugin/kernel/save.mjs:177（SEALED_STORE_KEYS 再写一遍）
- 设计原文：卷二 :897「协议标记的定义处…一律只放 handles 叶子文件 kernel/handles/markers.mjs」；`struct:sealed` 登记在 world/ontology/named-structs.json:51
- 代码实际：`['bytes','digest']` 在 storage 与 save 各写一份（save 多 $sealed 标记），既不在 markers.mjs，也不读 named-structs.json；同类 dated 字段已在 markers.mjs:167 单点定义。
- 理由：无（仅 storage.mjs:20 注释自述“本文件定义”）
- 影响：只是形式（改 Sealed 形状要同步两处，漏改即校验口径分叉）
- 严重程度：丙
- 合并：无（邻近 dev-11a #3，不是同一条）

## 已登记未建
- **readSealed／writeSealed 与凭据／文字界未接线**：installCredentialCheck 只有 tests/kernel/storage.test.mjs 调用，readSealed／writeSealed 生产零调用；kernel/credential.mjs、kernel/text-scopes.mjs、kernel/sealed.mjs 均无文件，kernelApi 已登记（卷二 :653–:659；§2.9 第 3 条 :1130–1131）。块 6 是不含 AI 的竖切片，文字／AI 界随 AI 卡建；登记处同 dev-11a “已登记未建”存档接线各条。
- **rewriteRows 行范围运行期不核**：已在 dev-03c #3 与 docs/问题.md:626 登记，不重复计（卷二 :796–:797）。
- **两处 structuredClone 旁路**：已在 dev-03d #2 登记，不重复计（卷二 :1060、:1065）。

## 拿不准
1. **readPath／writePath 的 JSDoc 用 any**：卷二 :527 的签名是 `readPath<P>(…): PathValue<P>`、`writePath<P>(…, value: PathValue<P>): void`，storage.mjs:145–151、:218–225 写 `{any}`；`PathValue<P>` 已在 kernel/state-types.d.ts:56–57 生成。全仓无 tsconfig／eslint 配置，类型门禁未建，是否按偏离计待主会话。
2. **`__proto__` 段**：P 构造函数（keys.mjs:390–401）只核非空、无点，不核 CODE_RE 与保留名；storage.mjs:192–200 的 `cur[s] = {}` 对 `__proto__` 会设原型而非自有键，值写了读不回、canonical 也看不见。要走 tsc 逃逸才可达；卷二 :527“实参非法即拒”与 :859 保留名是否要求运行期核，待判。
3. **canonical 的 `.sort()`**：storage.mjs:570（以及 :596–598、:650–651）未显式给全序比较函数；卷二十七 :627 说“排序必须给出全序比较函数，比较键只能是 id 或数值”。默认排序确定且不依赖区域设置，但字面不合，且序列化键名不是 id／数值；是否属本条（还是属卷一 §8.3 的序列化口径）待判。
4. **canonicalEqual 同引用直接判真**：storage.mjs:583 在 `a === b` 时返回 true，同一份 Map／Date 不抛“非存档数据”，与 canonical 的拒收口径不同；状态里本不该有这类值，是否记偏离待判。
5. **setAt 覆盖非对象中间层**：storage.mjs:192–195 对 `cur[s]` 是标量时直接换成 `{}`，applyPatches 在同情形抛错；卷文没写“路径穿过标量”的处置。
6. **utf8Length 对孤立代理少算**：bytes.mjs:109–113 对代理码元记 2 字节（注释称“只会多算”，实比 UTF-8 的 3 字节少算）；utf8ToText 不会产出孤立代理，但 JSON 转义可造出，是否影响 saveImportMaxBytes 口径待判（卷二 :946 未在本卡范围）。

## 跨卷待判
- **canonical 的序列化口径归谁**：storage.mjs:532–540 注释称按卷一 §8.3 :643，卷二十七 :542（R27-4.1）只说“摘要口径与排除表按卷二 §2.9 第 3 条”。本卡未读卷一 §8.3，键序、数值写法（如 -0 写成 0）是否合摘要口径未判。
