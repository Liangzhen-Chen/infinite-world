共 18 条，甲 0 乙 15 丙 3，有理由 1 无理由 17。
本卡读了：卷二 :305-314、:620-694、:860-979、:1055-1076、:1088-1169、:1292-1376（:980-1054、:1077-1087、:1170-1291 未逐行读，只按关键词 Grep 定位）；卷二十九 :110-259、:358-394；卷九全卷 Grep 后读 :1366-1385。代码全文读了 server-plugin/textcore/{brand,digest,fail,labels,ops,release,text-types}.mjs、gate/{fail,load-blocklist,matcher,screen}.mjs、kernel/load/{display-langs,codepoint-tables}.mjs、kernel/handles/display-lang.mjs；为卡文第③项另读了 output-gate/{templates,redact,envelope-exit,mount,enums}.mjs、kernel/handles/markers.mjs、kernel/error-codes.mjs。textcore/seal.mjs 与 gate 其余文件不存在；extension/ 在本工作区不存在，未读。

---

### 1 文字品牌类型与两份声明文件未建，文字函数签名全是裸 string/object
- 位置：server-plugin/textcore/brand.mjs:7-12、ops.mjs:15-21、text-types.mjs:15-41；server-plugin/textcore/types.d.ts 与 server-plugin/kernel/text-types.d.ts 不存在
- 设计原文：卷二 :888「规则层的函数参数与返回值一律用品牌类型声明（JSDoc）；传入裸 string 是类型错误」；:1128「server-plugin/textcore/types.d.ts：Text、Screened<Text>、TurnText、AiQuote、BlockNeedle」；:1127「kernel/text-types.d.ts：RawText、Sealed、Credential…DisplayLang」
- 代码实际：全仓只有 kernel/types.d.ts（代号类）与生成的 state-types.d.ts；文字一律 `@param {object}` / `@param {string}`，Text 是 WeakMap 包出的冻结空对象
- 理由：无（docs/问题.md:495 只记"声明文件闭集门禁未检测"；卷二 :888 把类型检查器归卷十二）
- 影响：规则缺——"labels 不得作 needle""Screened 只能由 screen 产出"只剩运行期 WeakMap，不是类型保证
- 严重程度：乙
- 合并：无

### 2 Screened<Text> 不能当 Text 用，与"Text 的子类型"不符
- 位置：server-plugin/textcore/text-types.mjs:17-19、:36-41、:27-29
- 设计原文：卷二 :1138「Screened<Text>（服务端）… Text 的子类型 … 可当 Text 用，反向不行」
- 代码实际：makeScreened 只把 Text 放进 SCREENEDS、不放 TEXTS；textValue(screened) 返回 undefined，concatText/screen 等收 Text 的函数会拒收 Screened
- 理由：无
- 影响：规则缺——类型契约不成立；现无调用方把 Screened 当 Text 用，暂未出错
- 严重程度：乙
- 合并：无

### 3 matcher 自做规范化，绕过 ops.nfc / ops.mapCodePoints
- 位置：server-plugin/gate/matcher.mjs:24-38
- 设计原文：卷二 :903「matcher.mjs 内：调 textcore ops.mjs 的 nfc、mapCodePoints（casefold 表），以及 indexOf」
- 代码实际：normalizeWithMap 自己切段、自己 normalize('NFC')、自己查 casefold 表，不调 ops 两个函数
- 理由：有理由——李白 11-19 18:1x 攒批第三批⑥「NFC 由 matcher 自己做（规范化只在一处）」（docs/审查/李白裁定-1117.md:1355）；docs/问题.md:383 亦登记
- 影响：只是形式（有裁定放行；与 :903 闭集文字不一致）
- 严重程度：丙
- 合并：无

### 4 matcher 用表外内建 Intl.Segmenter，且原文坐标按字素簇而非输出码点
- 位置：server-plugin/gate/matcher.mjs:14、:29-36
- 设计原文：卷二 :1057「内建闭集（任何组可用，逐个列出，表外的 ECMAScript 内建同样禁止）」；:1068 gate 行"可用宿主全局：无"；:1295「记录每个输出码点来自原文的哪个码点区间」
- 代码实际：`new Intl.Segmenter(undefined, {granularity:'grapheme'})` 切簇，簇内 NFC 后把整簇 [at, at+width) 记给每个输出码点
- 理由：无（裁定⑥只放行"NFC 由 matcher 自己做"，未提 Intl；逐簇映射无人记）
- 影响：规则缺/读数错边缘——用了闭集外内建（E-GLOBAL-UNLISTED 口径）；簇内有多个输出码点时，命中段原文起点会扩到整簇，替换可能多切字符
- 严重程度：乙
- 合并：无（docs/审查/6-17-Opus复核-第2轮-1119.md 第2条曾提"自做 NFC"，裁定⑥已解；Intl 与坐标这一半未记）

### 5 四个登记加载器都不经 narrow，各自 JSON.parse 加手写形状检查
- 位置：server-plugin/textcore/labels.mjs:26、server-plugin/gate/load-blocklist.mjs:39、server-plugin/kernel/load/codepoint-tables.mjs:30、server-plugin/kernel/load/display-langs.mjs:21
- 设计原文：卷二 :930「登记加载器里 … 唯一写法 `const raw = JSON.parse(text); narrow(raw, schemaId)`」；:1098「内部 narrow 得 RawText 后 brand」；:1177「blocklist 加载器…内部 narrow 得 RawText 后 brand」
- 代码实际：四处都直接 JSON.parse 后手写 isObj/字段检查；全仓无 kernel/validate/narrow.mjs
- 理由：无（问题.md、裁定文件均无 narrow 未建的登记）
- 影响：规则缺——外部数据入口的唯一收窄写法不成立，schema 校验不完整
- 严重程度：乙
- 合并：无

### 6 labels 加载器不读扩展包 packs/<ns>/i18n/
- 位置：server-plugin/textcore/labels.mjs:79-83
- 设计原文：卷二 :1098「只读…本体 world/i18n/、扩展包 packs/<ns>/i18n/ 中的含文字文件 labels.<lang>.json 与 templates.<lang>.json」
- 代码实际：base 固定 `world/i18n`，只拼本体路径
- 理由：无（仅注释自述"块 6 边界…扩展包目录…不在本最小版"）
- 影响：规则缺——装扩展包后其显示名与模板读不到
- 严重程度：乙
- 合并：无

### 7 labels 不校验 label 值：无首尾空白、不是纯十进制数字
- 位置：server-plugin/textcore/labels.mjs:42
- 设计原文：卷二十九 :245「label 非空；无首尾空白；不是纯十进制数字（卷二已定两码）」；卷二 :1586「E-I18N-LABEL-NUMERIC … 显示名为纯数字」
- 代码实际：只查 `length === 0`；E-I18N-LABEL-NUMERIC 全仓 0 处使用
- 理由：无
- 影响：规则缺——纯数字显示名会与菜单编号表撞键，带空白显示名会与规范化后的输入永不相等
- 严重程度：乙
- 合并：无

### 8 labels 不校验形态名属于 label_form，且 'label' 在 textcore 另写一份
- 位置：server-plugin/textcore/labels.mjs:12、:38-42
- 设计原文：卷二十九 :246「其余形态…键须是 label_form 的值，E-I18N-FORM」；卷二 :641「代码内封闭枚举…定义源只在 markers.mjs…callerFiles 只 output-gate/enums.mjs」
- 代码实际：任意形态键都收下；本地常量 `LABEL_FORM = 'label'`
- 理由：无
- 影响：规则缺/写死——未知形态混进冻结表；封闭枚举值出现第二处定义
- 严重程度：乙
- 合并：无

### 9 labels 不校验键在"应有显示名的代号集合"（E-I18N-LABEL-ORPHAN 未做）
- 位置：server-plugin/textcore/labels.mjs:29-46
- 设计原文：卷二 :1098「labels schema（键须在 idIndex/词表）」；卷二十九 :244-245「须在'应有显示名的代号集合'内… E-I18N-LABEL-ORPHAN」
- 代码实际：JSON 键原样进 Map，不查 kernelApi idIndex 或词表
- 理由：无（仅注释自述"键集合核对…随语言卡与离线校验"）
- 影响：规则缺——孤立键、拼错代号都会静默进冻结表
- 严重程度：乙
- 合并：无

### 10 屏蔽词表离线校验器未建，未规范化/重复/乱序/类别未登记无人拦
- 位置：server-plugin/gate/load-blocklist.mjs:4（自述交离线校验）；tools/name-blocklist-check.mjs:1（应存在，现无此文件）
- 设计原文：卷二 :1294「未规范化、重复、乱序或类别未登记 → 离线校验 E-I18N-BLOCKLIST-UNNORMALIZED（tools/name-blocklist-check.mjs）」
- 代码实际：仓库无该脚本；load-blocklist 只做规范化并登记，不查重复、顺序、类别
- 理由：无
- 影响：规则缺——格式错的词表可进运行期
- 严重程度：乙
- 合并：无

### 11 blocklist_category 族未在 _vocab.json 登记，数据却用了两个未登记类别
- 位置：world/i18n/blocklist.zh.json:7（bcat_name）、:27（bcat_real_person）；world/ontology/dimensions/_vocab.json 无 blocklist_category 族
- 设计原文：卷二 :1294「category 取 _vocab.json 的 blocklist_category 族…首批 bcat_name、bcat_real_person、bcat_minor_content」
- 代码实际：数据里 bcat_name/bcat_real_person 已用；词表文件全无 blocklist_category 族，load-blocklist 只检查 category 是字符串
- 理由：无
- 影响：规则缺——卷九 R9-19.5 :359 `rules.gate.categoryMap` 要求键全覆盖屏蔽词类别族，族不存在则覆盖无从判定
- 严重程度：乙
- 合并：无

### 12 textcore/seal.mjs 未建（seal/unseal 登记在 groupApi）
- 位置：server-plugin/textcore/seal.mjs:1（应存在，现无此文件）；groupApi 卷二 :687-688
- 设计原文：卷二 :898「seal.mjs 只做 NFC、UTF-8 编解码并调 digest.mjs 与 makeSealed」；:1182「seal(text: Text): Sealed … unseal(sealed): Text」
- 代码实际：无该文件，seal/unseal 均不存在
- 理由：无（PLAN :14 记 6-18 aiGate 撤、挂块 7，但不是裁定或问题.md 登记）
- 影响：规则缺——AI 文字入库与读档解封不可达（块 7 首张 AI 卡前）
- 严重程度：乙
- 合并：无

### 13 brandTurn / brandQuote 未建
- 位置：server-plugin/textcore/brand.mjs:2（注释自述"随 inputEdge、aiGate 卡"）；groupApi 卷二 :676-677
- 设计原文：卷二 :1139「brandTurn(raw: RawText): TurnText」；:1140「brandQuote(raw: RawText): AiQuote」
- 代码实际：brand.mjs 只有 brand
- 理由：无（仅注释自述）
- 影响：规则缺——TurnText/AiQuote 的闭合来路不存在，引文同一性检查无输入
- 严重程度：乙
- 合并：无

### 14 ops.mjs 缺 trimByTable 与 menuIndexKeys
- 位置：server-plugin/textcore/ops.mjs:3、:1-77（导出只有 concatText、nfc、mapCodePoints、sliceByCodePoints、intDigits）
- 设计原文：卷二 :898「它只导出七个函数：…trimByTable…menuIndexKeys…」；groupApi :680、:683
- 代码实际：两个函数不存在
- 理由：无（仅注释自述"随 inputEdge 卡"）
- 影响：规则缺——输入边第②步裁空白与菜单编号表键都无法按卷文建
- 严重程度：乙
- 合并：无

### 15 matcher 缺 matchIdLeak 与 containsCodePoints
- 位置：server-plugin/gate/matcher.mjs:1-99（对组外只有 matchBlocklist）
- 设计原文：卷二 :1309-1311 子串函数签名表三函数；groupApi :693-694
- 代码实际：只实现 matchBlocklist
- 理由：无（aiGate 未建，但无登记）
- 影响：规则缺——id 泄漏与引文同一性两项检查不可达
- 严重程度：乙
- 合并：无

### 16 codepoint-tables 只读 casefold，whitespace 与 charset 表未读且文件不存在
- 位置：server-plugin/kernel/load/codepoint-tables.mjs:10、:28-40
- 设计原文：卷二 :1091「whitespace/casefold/charset 码点表」；:47「whitespace.json、casefold.json…冻结，带 sha256」；§1.9 :307 第②步按 White_Space 表
- 代码实际：只读 world/i18n/casefold.json；world/i18n/ 无 whitespace.json、无 charset.*.json
- 理由：无（PLAN :85 只登记 casefold 未建；whitespace/charset 无登记）
- 影响：规则缺——输入边裁空白、aiGate 码点范围检查都无法建
- 严重程度：乙
- 合并：无

### 17 screen 返回包装对象，不是登记的 Screened<Text> | Hits
- 位置：server-plugin/gate/screen.mjs:13-16
- 设计原文：卷二 :1138「gate 的 screen(text: Text, lang): Screened<Text> | Hits（零命中才产出，命中则返回命中列表）」；:1296「零命中即产出 Screened<Text>，否则返回命中列表」
- 代码实际：返回 `{screened}` 或 `{hits}`
- 理由：无
- 影响：只是形式（outputGate 已按包装形状写；与类型登记表不一致）
- 严重程度：丙
- 合并：无

### 18 运行期块表加载器用 tools 级 E-I18N-BLOCKLIST 报格式错
- 位置：server-plugin/gate/load-blocklist.mjs:34、:39-44、:48、:54；server-plugin/kernel/load/codepoint-tables.mjs:13
- 设计原文：卷二 :1586「E-I18N-BLOCKLIST（tools 组内容构建校验器输出）| L2 / 工具」；:1294 离线码是 E-I18N-BLOCKLIST-UNNORMALIZED
- 代码实际：加载期形状错、重复登记、缺折叠表都抛 E-I18N-BLOCKLIST
- 理由：无
- 影响：只是形式（错误码的级与归属不符，排障时会当成内容构建错误）
- 严重程度：丙
- 合并：无

---

## 已登记未建
无。本卡范围的卷二、卷二十九、卷九没有"块 N 不建/未建"的字样；未建的登记入口按偏离记在第 12～16 条。

## 拿不准
1. casefold 表摘要是否要加载期核：卷二 :47/:307 只说"冻结，带 sha256"，未写加载期核对；codepoint-tables.mjs:4 自述"摘要由测试核"，tests/kernel/output-gate.test.mjs:110-115 确实核了 tableSha256。卷文推不出加载期要求，暂不记偏离。
2. 屏蔽词文件不存在时装空词表放行：卷二 :1294 不要求文件必有；卷二十九 :368 只对"已发布语言"要求齐全，locales.json published:false。暂不记偏离。
3. labels 的形态名与键集校验归加载期还是离线校验：卷二 :641 只把 T 开给 output-gate/enums.mjs，textcore 没有取 label_form 的正式出口；本卡按"加载期规则缺"记第 7、8 条，若判定归离线校验则应降为形式。
4. `uitok_redacted` 在 output-gate/mount.mjs:17 写死：卷二 :1296 说替换记号"以句柄 uitok_redacted 为键登记"，但 world/ontology/dimensions/_vocab.json 无该条目；属 outputGate 文件，不在本卡文件清单，留跨卷。

## 跨卷待判
1. blocklist_category 族（第 11 条）：卷二 :1294 说取 _vocab 族的类别，卷九 :357-360 要求 rules.gate.categoryMap 键全覆盖；族缺在哪一卷补，要两卷一起判。
2. 运行期块表格式错该用哪个码（第 18 条）：卷二 :1586 把 E-I18N-BLOCKLIST 定为 tools 级，:1102 又把 blocklist schema 归加载器，运行期格式错无专用码，要卷二定。
3. uitok_redacted（拿不准 4）：卷二 §2.9 第 6 条、卷二十九 :194 与 output-gate/mount.mjs:17 三处，需卷二/卷二十九一起判 ui_token 条目该不该进 _vocab。
