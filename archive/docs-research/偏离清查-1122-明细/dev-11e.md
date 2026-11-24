共 11 条，甲 0 乙 9 丙 2，有理由 1 无理由 10。
读了：卷二十四 :100-467（§2 维度表、§3 入口与写者、§4.1 事件主写、§4.2 类型注册与估值）；卷二 :415-444（§1.14 事件来源行公共字段）；卷二十七 :790、:799-810、:983-990（R27-8.2、R27-8.5、R27-8.9）；卷九 :424-444（§2.9 事件 id 表）；卷五 :595-596（事件公共字段 pos）；卷二十 :490-512（§4.1 同刻全序，只读了本条相关段）。代码：server-plugin/kernel/events.mjs :1-541（全读）、server-plugin/kernel/subscribers.mjs :1-117（全读）、server-plugin/kernel/holdings.mjs :95-159／:280-354、server-plugin/primitives-runtime.mjs :300-349、server-plugin/kernel/sample.mjs :175-215、server-plugin/kernel/handles/keys.mjs :198-200、server-plugin/kernel/handles/markers.mjs :18-33、server-plugin/kernel/load/world.mjs :140-165、server-plugin/kernel/mount.mjs :14-60、server-plugin/kernel/error-codes.mjs :182、world/rules/registry.json（code 清单与 clock 行）。另 Grep：emit／writeEvent 调用点、state.events、minuteOf／clockView、kindOnly、rollKey、causedBy、appendLogEntry。没读到：卷二十四 :1-102、:468 至卷末；卷二 :1-414、:445 至卷末；卷二十其余节；event_type 表 C 的数据行与实例系统（未建，见“已登记未建”）。
专项核对：① 全仓无 `state.events` 写入点；事件只经 events.mjs#emit 追加日志簿（`appendLogEntry` 只 events.mjs:524 用），holdings.mjs:300-320 的 emitKernelEvent 经 emit（:307），不是旁路。② VISIBILITY（卷二十四:142 enum 字面量）、WORTH_SIDES（:149／:164 struct 三栏）、PAYLOAD_COMMON（:144-146 公共字段，pos 另有卷五:596）三者封闭，代码 :62／:72／:66 硬列合规；§2.1 :107-123 的三封闭枚举（etmode／etpolarity／instphase）代码未用。③ 事件 id 五成分与代码一致：世界种子取 engine.template.seed、规则/指令代号 rule、主体 subject、世界时刻 minute、位次 position，恰五样（events.mjs:135-147、:480-490；卷二十七:810、卷九:433-443）。④ 事件 minute 六个调用方里五个经 clockView（item-lots.mjs:148、primitives-runtime.mjs:323、scheduler.mjs:408、terminate.mjs:455、title.mjs:144），只 holdings.mjs 自取（见第 4 条）。

### 1 E-EVT-VERB 不拒 `kindOnly` 动词行
- 位置：server-plugin/kernel/events.mjs:160-166（verbRow）、:348（buildRecord 取行）
- 设计原文：卷二十四:318 "E-EVT-VERB | 事件的动词未登记，或是 `kindOnly` 行，或发出它的事务所属系统不是该动词行登记的那一个发出系统"；:466 "任取日志，没有一条事件的动词是 `kindOnly` 行"。
- 代码实际：verbRow 只核动词属 verb 族、行是对象，从不读 `kindOnly`；kindOnly 行可通过 emit 写进日志。
- 理由：无。
- 影响：规则缺（日志不变量可被规则层经 kernelApi emit 打破；现有调用方未传 kindOnly，暂未现）
- 严重程度：乙
- 合并：无

### 2 E-EVT-CAUSE 只登记未实施
- 位置：server-plugin/kernel/events.mjs:59（CODE 表无 cause 项）、:274-275（causedBy 只核 EventId 类型）
- 设计原文：卷二十四:146 "`payload.causedBy` … 所列事件在同刻全序里早于本条"；:321 "E-EVT-CAUSE | `payload.causedBy` 指向不存在或在全序中不早于本条的事件"；:398 "由反应规则发出的事件，`payload.causedBy` 必须含触发它的那条事件"。
- 代码实际：只校验列表元素是 EventId 形；不查所指事件是否存在、是否早于本条。错误码在 error-codes.mjs:182 已登记，代码从不抛。
- 理由：无。
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 3 非空 rollKey 必被"无文字字段"核对拒掉；骰值键五段又没核
- 位置：server-plugin/kernel/events.mjs:366-368（record 含 rollKey 后调 noText）、:318-322（isDiceKeyShape）
- 设计原文：卷二十四:141 "`rollKey` | 骰值键 | — | 卷二十七 R27-8.5 五段"；:154 "事件记录没有任何文字字段"。
- 代码实际：骰值键以 `|` 连五段（kernel/handles/keys.mjs:199），`|` 不在 CODE_RE（/^[a-z][a-z0-9_]{1,47}$/）也不在点分代号内，任何真骰值键到 :368 的 `noText(record)` 都被判文字拒；反过来 :318-322 只核字符集与非空，不核五段，单段代号（如 "a"）反而能过。emit 末尾 :519 特意把 rollKey 置 null 再查，说明作者知道冲突，但 :368 那处没改。
- 理由：无（docs/卡回报/ds-b5-2.md:99 "只核非空与键的字符集"是卡回报已定，与本处 noText 冲突，未入裁定/勘误/问题.md）
- 影响：规则缺／数据错（提交段一交入非空 rollKey 即整笔被拒；复演要求的骰值键进不了日志）
- 严重程度：乙（现行生产调用者全传 null，tests/kernel/events.test.mjs:123 等；接线后即为甲）
- 合并：无

### 4 内核协议事件的 minute 直读 `state.clock`，不经 `clockView`
- 位置：server-plugin/kernel/holdings.mjs:153（minuteOf）、:308（事件 minute）
- 设计原文：卷二十四:270 "日序一律取卷二十的世界日序：写入时取 `clockView().day`"；卷二十 `clockView` 是"全书唯一的'现在几点'"（scheduler.mjs:198 引卷二十 :420）。
- 代码实际：`state[S.clock][S.minute]` 直取，时钟缺失时静默默认 0；同仓其余五个 emit 调用方都经 clockView。
- 理由：无（docs/研究/公共部件审查-甲-1122.md B1 结论称"server-plugin 无 state.clock 直读"，本处用常量子段 `state[S.clock]` 间接读，该审查未覆盖）
- 影响：读数错／规则缺（时钟未设时事件记在 0 分钟，且不留缺口）
- 严重程度：乙
- 合并：无（与甲-1122 B1 同项但结论相反，见理由）

### 5 scopeLevel 为空时，eventSig 的层级项取成了 `档(0, levelBands)`
- 位置：server-plugin/kernel/events.mjs:461
- 设计原文：卷二十四:441 "`eventSig = min(sig.maxBand, max(基值, 档(worth 三项之和, sig.worthBands), 档(heads, sig.headBands), 档(scopeLevel 的 rank, sig.levelBands)))`…`scopeLevel` 为空时该项取 0"。
- 代码实际：写 `band(0, sig.levelBands)`，即"阈值 ≤ 0 的个数"，不是 0；而 scopeLevel 现行恒 null（:455），sig 表一建就必然走这条错项。
- 理由：无（ds-b5-2.md:98 只裁"无表时取基值"，未裁有表且层级为空时该项）
- 影响：读数错（档位偏高，编年史/纪元的分量阈值筛错）
- 严重程度：乙
- 合并：无

### 6 sig 规则表读错命名空间：`rules.sig` 应为 `rules.events.sig`
- 位置：server-plugin/kernel/events.mjs:457
- 设计原文：卷二十四:233 "### 2.3 规则表（常数的唯一落点，`rules.events.*`…）"；:244-245 键列 `sig.maxBand`／`sig.worthBands`／`sig.headBands`／`sig.levelBands`。
- 代码实际：读 `engine.rules.sig`。world/rules/registry.json 按 `code` 行落成 `rules.<code>`（如 :167 的 clock 行 → rules.clock），卷文该表落点是 `rules.events.sig.*`；现 registry 无 events 行、无 sig 行。
- 理由：无（ds-b5-2.md:98 写成 rules.sig，未经裁定/勘误）
- 影响：读数错（表一建成，maxBand 与三档表读不到，eventSig 静默退回基值）
- 严重程度：乙
- 合并：无

### 7 订阅投递不按 R24-2.10 合看 `kindFrom`，也不做同事务不重复合看
- 位置：server-plugin/kernel/subscribers.mjs:68-80（verbChain）、:82-88（deliverOne）
- 设计原文：卷二十四:438 "订阅一个动词即订阅它的全部下位词（含 R24-2.10 合看的那些事件）"；:446 "`isA(event, A)` 当且仅当动词本身或所指动词 `isA` A……订阅'毁坏'上位词的规则也收得到以终止表达的毁坏……同一事务不重复合看"；:339 "上位词判断只经它（`verbView`／`isA`）"。
- 代码实际：只沿 `event.verb` 的 `parent` 链向上投递，不读 `event.payload[row.kindFrom]` 所指动词，订阅上位词的规则收不到以 kindOnly 子类型承载的事件（现有 `verb_entity_terminated`／`verb_entity_revived` 的 `kindFrom = cause` 正属此类）；没有"同一事务含所指动词事务事件时不再因所指行触发订阅"的判据；parent 链是本文件自写，不经 verbView／isA（后两者未建，见已登记未建）。
- 理由：无。
- 影响：规则缺（反应规则与催化会漏触发；合看事件会重复触发）
- 严重程度：乙
- 合并：无

### 8 primitives 只核 `op` 是代号，不核在封闭原语目录内
- 位置：server-plugin/kernel/events.mjs:308-314
- 设计原文：卷二十四:138 "`primitives` | list<原语调用> | — | 卷九 R9-2.1 的封闭原语目录 | error"。
- 代码实际：每项只核 `{op: 代号}`，不核 op 属目录；kernelApi emit 对规则层开放，可写入目录外原语。
- 理由：无（docs/审查/5-2-DS只核-1119.md:61 已提，未入裁定/勘误/问题.md）
- 影响：规则缺
- 严重程度：乙
- 合并：见 docs/审查/5-2-DS只核-1119.md:61

### 9 payloadShape 校验只核最外层形状
- 位置：server-plugin/kernel/events.mjs:169-184
- 设计原文：卷二十四:143 "`payload` | struct | — | 形状由动词行 `payloadShape` 给…onUnknown error"；:161 载荷字段"不许有文字类型"。
- 代码实际：`list<>`／`set<>` 只核元素是数或串，`map<>`／`struct` 只核是对象，`ref`／`enum` 不查族内登记。
- 理由：无（5-2-DS只核-1119.md:64 已提）
- 影响：规则缺（现有四行载荷都能过，未来动词行可漏校）
- 严重程度：丙
- 合并：见 docs/审查/5-2-DS只核-1119.md:64

### 10 registerEventDerive 返回值不核 `eventSig ≤ sig.maxBand`，actorAs 不随 actor 联动
- 位置：server-plugin/kernel/events.mjs:426-431、:354-355、:513-519
- 设计原文：卷二十四:152 "`eventSig` | integer | 档 | [0, 规则表 `sig.maxBand`]"；:136 "`actor` 为空时为空（`actorAs`）"。
- 代码实际：交入的 handler 返回什么就收什么，只核 eventSig 是非负整数；actor 为 null 时 actorAs 仍可为任意整数。
- 理由：无（5-2-DS只核-1119.md:65 已提；事后该审查确认未改）
- 影响：规则缺
- 严重程度：乙
- 合并：见 docs/审查/5-2-DS只核-1119.md:65

### 11 事件 id 构造函数不在 kernel/handles/keys.mjs#eventId
- 位置：server-plugin/kernel/events.mjs:135-147（deriveEventId）
- 设计原文：卷二:1162 "`kernel/events.mjs#emit` 给事件定 id 时调本文件的构造函数 `kernel.eventId(…)`"（构造函数归 kernel/handles/keys.mjs）。
- 代码实际：构造函数写在本文件 deriveEventId，keys.mjs 无 eventId；五成分、分隔串与 sha256 照 §1.10／R27-8.9。
- 理由：有——ds-b5-2.md:14 "本卡文件所有权未含 keys.mjs，构造函数暂在本文件实现"，回报与终核接受；非裁定/勘误。
- 影响：只是形式。
- 严重程度：丙
- 合并：无

## 已登记未建
- worth 的逐件估值：无卷六 `priceFor`／卷三乙 `valuation` 入口，槽位每件计 0 并记 W-DIM-GAP（events.mjs:434-443、:527-528；卷二十四:439）；登记：李白 11-18 22:10 丙1（docs/审查/李白裁定-1117.md 末节）、docs/卡回报/ds-b5-2.md:20。
- scopeLevel 恒 null（无地点与政区读数）（events.mjs:455；卷二十四:440）；登记：ds-b5-2.md:20、docs/研究/公共部件审查-乙-1122.md:53。
- typeRef／instanceRef 恒 null；`event_type` 行的 `valuationRX` 加 stake、事件类型表与实例系统整体未建（events.mjs:463；卷二十四:147-148、:439、§4.2／§4.4）；登记：ds-b5-2.md:20。
- `sig.*` 规则表未建，无表时 eventSig 取动词行基值（events.mjs:457-462；卷二十四:244-245）；登记：ds-b5-2.md:98（已定）。
- `state.events.instances`、`tally`、`lastStart`、`lastEnd`、`commissions` 六个状态键与 instanceStep／tallyStep／pulseStep／commissionStep 未建（全仓无 state.events 写入点；卷二十四:260-268、:358-361）。
- §3.1 读入口 verbView／isA／storyView／tallyOf／instanceView／eventTypeView／eventCount 等未建（卷二十四:339-348）；登记：docs/审查/kernel-0200-只核.md:25、docs/审查/kernel-0218-只核.md:51（列在后续阶段上线）。
- 叙述投影钩子（卷九 §4.10、卷二十四 §3.2 的 why()）未建；登记：docs/研究/公共部件审查-乙-1122.md:53。
- 卷二 §1.14 来源行求值（V = 1 + Σ valueScale×value、stackLimit、stackGroup）无消费者——卷十八立场来源行、卷二十六想法行为未建；`event_role` 封闭枚举已登 server-plugin/kernel/handles/markers.mjs:26（卷二:428）。

## 拿不准
- 卷二十四:318／:397 要求写时核对"发出它的事务所属系统不是该动词行登记的那一个发出系统"；events.mjs 的 emit 拿不到系统标识（transaction.mjs 事务上下文只有 node／file），现只有加载期 `checkVerbRows` 核对声明（events.mjs:226-259）。加载期核是否已足够、写时这一半要不要做，需判。
- 卷二十四:142 "`private` 不对旁人求目击（`witnesses` 为空表）"：events.mjs 不核，调用方可传 private＋非空表；但卷九 emit 原语经 perceiveEvent 保证三档（primitives-runtime.mjs:313-321、体检 K6-66 归 6-8），kernelApi emit 的 callers 是 rules，是否仍应在事件写者兜底，责任层需判。
- 卷二十四:139 `cause` 的取值域是"已登记的动作代号、钩子或反应规则的登记代号"；events.mjs:349 只核是代号，不核已登记。动作表／钩子登记表在代码里的读取入口未建，现阶段能否核，需判。
- VISIBILITY（:142 enum 字面量）、PAYLOAD_COMMON（:144-146，加卷五:596 的 pos）不在 §2.1 :107-123 的三封闭枚举表（etmode／etpolarity／instphase）内；代码硬列这三组代号依"封闭即可放代码"合规，但要不要在卷二 §1.9 另补封闭枚举名单，形式问题。
- `payload.pos`：卷五:596 明写"事件公共字段 `pos`，卷二须补此可选字段"，卷二 §1.14 与卷一:987 尚未列；代码已收（events.mjs:66、:276-277）。按卷五补卷二，还是记代码超出表 A，待判。

## 跨卷待判
- 订阅者投递顺序：subscribers.mjs:8、:86 按"同一动词、订阅者所在文件路径升序"投递；卷二十四:404 写"同一事件的多个订阅者、同一刻的多条事件，次序一律按卷二十 §4.1 的同刻全序"，卷二十 §4.1 :507-512 的全序键是待处理项／反应项的键（同一起因的多反应按 `(reaction_priority.rank, 规则包代号, 规则代号, 主体 id)`）。内核内部订阅的投递是否属该条所说的"反应项"、要不要改按该键排序，须两卷合判。
