共 14 条，甲 1 乙 9 丙 4，有理由 1 无理由 13。
本卡读了：卷二 :32-122、:625-672、:940-1179、:1537-1661、:2162-2216；error-codes.mjs :1-230、errors.mjs :1-52、report.mjs :1-70、transport/menu-entry.mjs 全文、reply-channel.mjs 全文、router-caps.mjs 全文、validate/dimensions-validate.mjs :1-70 与 :460-500、validate/rows.mjs :215-225、load/state-owners.mjs :178-192、kernel/calendar.mjs :1-45、load/world.mjs :43-59、world/ontology/{entity-templates,fixtures,named-structs,offenses,calendar}.json 头、slots/{core,consumers}.json 头、world/rules/tables/derived-process.json。未读：卷二 :123-624、:673-939、:1180-1536、:1662-2161；:936-1330 只按 Grep 命中行读，未逐行通读。
核对结果：卷二 §4.3 登记的 292 个 V2 码逐一对过——除 E-MIG-* 24 个（第 4 条）外全部在登记表；登记表的 V2 组没有卷二 §4.3 之外的码（其余组是别卷码，卷二 §4.3 明写"见卷 X / 本卷不定义、只登记"）。errors.mjs、report.mjs 与卷二 §4.2/:1119 对过：KernelError/reportError 的规整、`report(code, fields)` 只收代号与数值（null 见拿不准），未另记偏离；校验器报错形状与 §4.2 的九字段、去重与末行汇总一致。无抛出点：V2 码在 server-plugin 内只出现在 error-codes.mjs 的有 152 个；其中 46 个在 tools/tests 有出现（扫描器、验收器或测试断言），真正全仓无抛出点 106 个，清单见"已登记未建"末条，正文只列需要人先看的核心项（第 6、7、8、11 条）。

### 1 菜单路由在生产代码里没有处理函数，一切菜单请求回 E-ACT-WRITER-NOT-READY
- 位置：server-plugin/kernel/transport/menu-entry.mjs:19,27-31,43-48；server-plugin/index.mjs:31
- 设计原文：卷二:956「三种载荷——动作（动作代号、槽位候选编号、数值参数、存档槽位编号）、错误上报（`ErrorCode` 与数值字段）与界面命令…`menu-entry.mjs` 分流后不进卷九意图管线」
- 代码实际：`installMenuDispatch` 在 server-plugin 生产文件里零调用，只有 tests/kernel/assembly.test.mjs 调用；`menuEntry` 在 `dispatch === null` 时一律回 `rejected` 加 E-ACT-WRITER-NOT-READY。
- 理由：无（docs/卡回报/ds-b6-19.md:41、ds-b6-20.md:51 只记排期，不属裁定/问题/勘误）
- 影响：玩法不可达
- 严重程度：甲
- 合并：无

### 2 回应通道直接用 structuredClone，绕过 kernelApi clone
- 位置：server-plugin/kernel/transport/reply-channel.mjs:101（另一处同类：server-plugin/kernel/gen/polity.mjs:109）
- 设计原文：卷二:1060「`structuredClone` 只许 `kernel/clone.mjs` 使用，其余文件要深拷贝就调 kernelApi 的 `clone`（B2-14）」
- 代码实际：`postReply` 里写 `Object.freeze(structuredClone(result))`，未 import `kernel/clone.mjs#clone`。
- 理由：无（docs/迁移体检/块2.md:38 K2-22、M2-13 是要求替换的迁移项，不是保留理由）
- 影响：规则缺（绕过公共部件）
- 严重程度：乙
- 合并：无

### 3 E-WIRE-REPLY 的装配期两项核对没有实现
- 位置：server-plugin/kernel/transport/reply-channel.mjs:86-90,125（`hasSubscriber` 仅测试调用）；server-plugin/kernel/transport/router-caps.mjs:5-7
- 设计原文：卷二:997「装配结束时没有订阅者或不止一个；…`postReply` 的调用者不是上表第 2 环的四个文件；`ReplyCap` 的 `send` 的调用者不是第 5、5s 环的两个文件」
- 代码实际：`onReply` 只防二次登记，装配结束不核"有无订阅者"；`postReply`/`send` 的调用者白名单只在注释里写"静态登记，装配期核对随 6-19、6-20"，运行期与装配期都未核。
- 理由：无（调用者白名单仅代码注释自述，无裁定/问题/勘误记录）
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 4 卷二 §4.3 登记的 E-MIG-* 一组未进登记表
- 位置：server-plugin/kernel/error-codes.mjs:4
- 设计原文：卷二:1623「E-MIG-ROW-ORPHAN / … / E-MIG-FILEMOVE-GAP | 工具 | 迁移路线与卡账（离线）：归卷十一 §2.7 定义，本卷不定义，只登记」
- 代码实际：注释明写"不收：卷二 §4.3 :1555 与卷十一 §2.7 的 E-MIG-* 一组"，24 个 E-MIG 码一个未登。
- 理由：有（docs/迁移体检/块2.md:67 K2-49 作废；docs/审查/块2-1-只核原始输出.md:33 复核成立）
- 影响：只是形式（登记表与卷二 §4.3 不同步）
- 严重程度：丙
- 合并：无

### 5 E-DATED-* 与 E-GRID-STRUCTURE-CELL 的 sources 未随卷二勘误更新
- 位置：server-plugin/kernel/error-codes.mjs:86-96
- 设计原文：卷二:1618-1620「E-DATED-FROMDAY…（本卷定义，§2.7 `dated` 条；封卷后勘误 1123k3）」「E-DATED-WRITER…（本卷定义）」「E-GRID-STRUCTURE-CELL…（本卷定义…）」
- 代码实际：E-DATED-FROMDAY/WRITER 只记 `vol2.s2.7`；E-GRID-STRUCTURE-CELL 只记 `vol5.s4.1`；注释还写"卷二 §4.3 与 §2.7 跟改待主会话派勘误"，但卷二 :1618-1620 已经补上。
- 理由：无（仅注释自述）
- 影响：只是形式（码的来源卷缺失、注释过期）
- 严重程度：丙
- 合并：无

### 6 校验器未实现 L4 首期三条必须不变量
- 位置：server-plugin/kernel/validate/dimensions-validate.mjs:1-6（自述"未做…L4 不变量"）
- 设计原文：卷二:1549「首期三条必须：E-DIM-INVARIANT-MASS-VOLUME（质量 = 密度×体积，容差 1 ulp of precision）、E-DIM-INVARIANT-PORTION-SUM（material map 和 = 1.0000）、E-DIM-INVARIANT-SEVERITY-ORDER」
- 代码实际：三个码在 server-plugin 全仓零出现，`validateDimensions` 不跑 L4；material/item 表已存在，坏数据会照常加载。
- 理由：无（仅注释自述 P-2 未做）
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 7 校验器 L2/L3 一批登记码没有抛出点
- 位置：server-plugin/kernel/validate/dimensions-validate.mjs:1-6；server-plugin/kernel/validate/rows.mjs:215-225
- 设计原文：卷二:1547-1548「修正项 target 注册、stage/scope 合法、bounds 在表头、RX 可编译（E-MOD-KEY-UNREGISTERED / E-MOD-STAGE / E-MOD-SCOPE / E-MOD-BOUNDS / E-MOD-RX）」；「sources 推出值 = 直写值；成员偏差」
- 代码实际：E-DIM-MEMBER-DEVIATION、E-DIM-SOURCE-MISMATCH、E-DIM-NAMESPACE-OVERRIDE、E-DIM-REQ-CYCLE、E-MOD-SCOPE、E-MOD-SLOT-DUPLICATE、W-DIM-PRECEDENCE-TIE、W-MOD-UNKNOWN-BASE 全仓零出现；E-DIM-SOURCE-PLACEHOLDER 只在 error-codes.mjs 与 tests/kernel/species-human.test.mjs:19 的断言里出现，没有抛出点；rows.mjs 只核 `basis`，不核 `sources`。
- 理由：无（仅注释自述 P-2 未做）
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 8 E-PERSON-CULTURE-MISSING 的 L3 必填核对未实现
- 位置：server-plugin/kernel/validate/body-tables.mjs:1（全文件 Grep `culture`/`sapient` 零命中）
- 设计原文：卷二:1607「作者侧 `instanceTable` 里物种 `sapient` 为真的个体没写 `culture`」
- 代码实际：person 表已存在，加载期不核 `culture`；该码全仓只在 error-codes.mjs 出现。
- 理由：无
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 9 pathTypes 缺单位报成 E-DIM-UNIT-UNKNOWN，应为 W-DIM-UNIT-DIM
- 位置：server-plugin/kernel/load/state-owners.mjs:182-192
- 设计原文：卷二:1573「E-DIM-UNIT-UNKNOWN；W-DIM-UNIT-DIM | L1 / state-owners 加载 | 单位：维度表头的 unit 不在 `_units.json`；`pathTypes` 的数值路径或命名 struct 的数值字段没带单位、或单位不在 `_units.json`」
- 代码实际：`typeIssue` 对 `number:`/`integer:` 缺单位或单位不在表内一律返回 `E.E_DIM_UNIT_UNKNOWN`；W-DIM-UNIT-DIM 只在 error-codes.mjs 与 tests/kernel/{error-codes,handles}.test.mjs 出现，没有抛出点，警告被升级成加载失败。
- 理由：无
- 影响：读数错（码义与 severity 错）
- 严重程度：乙
- 合并：无

### 10 派生自引用缺 recursive 时报 E-DIM-DERIVED-CYCLE，而非 E-DIM-DERIVED-RECURSIVE
- 位置：server-plugin/kernel/validate/dimensions-validate.mjs:471-479
- 设计原文：卷二:110「`.recursive` | derived 自引用时必须 | `{"relation": "<relation id>"}`… | E-DIM-DERIVED-RECURSIVE」
- 代码实际：自引用且未写 recursive 时调用 `cycle(dim, …)`，抛 E-DIM-DERIVED-CYCLE；E-DIM-DERIVED-RECURSIVE 全仓零出现。
- 理由：无
- 影响：读数错（码义错）
- 严重程度：丙
- 合并：无

### 11 扫描类登记码没有实现（门禁缺口）
- 位置：server-plugin/kernel/error-codes.mjs:31,33-37（登记处）；server-plugin、tools、tests 内这些码的抛出点为零
- 设计原文：卷二:1587「E-GROUP-SIZE / E-GROUP-OVERLAP | L2」；:1590-1594「E-TEXT-UNGATED / … / E-KERNEL-ONLY」「E-SEAL-READ…」「E-INPUT-FUZZY / … / E-GATE-FUZZY」
- 代码实际：E-GROUP-SIZE、E-GROUP-OVERLAP、E-SEAL-READ、E-INPUT-DEFAULT、E-INPUT-NORMALIZE-SCATTER、E-TSC-CATCH-NARROW、E-TSC-COVERAGE、E-VIEW-NAME-RESEED、E-VIEW-UNDECLARED-READ 全仓零出现；扫描器没有这些判据。
- 理由：无
- 影响：规则缺
- 严重程度：乙
- 合并：无

### 12 fixtures.json、slots/core.json、slots/consumers.json 无加载器、无代码引用
- 位置：world/ontology/fixtures.json:1；world/ontology/slots/core.json:1；world/ontology/slots/consumers.json:1
- 设计原文：卷二:59「现有 `world/ontology/{tags,offenses,statuses,holdings,resources,primitives,verbs,derived-fields,entity-templates,calendar}.json` 保留职能」（这三张不在保留清单内）
- 代码实际：Grep `fixtures.json|slots/core|slots/consumers` 在 server-plugin、tools、tests 的 .mjs/.json 中零引用；load/world.mjs:43-59 的 LAYOUT 不载它们；fixtures.json 的 note 指向的 `server-plugin/workstation-services.mjs` 也不存在。
- 理由：无
- 影响：数据不可达（玩法不可达）
- 严重程度：乙
- 合并：entity-templates.json、offenses.json 已在 docs/研究/偏离清查-1122.md 六.1；本卡只补这三个新表名

### 13 named-structs.json 与 slots 两个文件的表头字段不合 §1.2
- 位置：world/ontology/named-structs.json:1-4；world/ontology/slots/core.json:1-2；world/ontology/slots/consumers.json:1-2；world/ontology/calendar.json:3
- 设计原文：卷二:96「`kind/namespace/version` | 是 | 实体类（22 之一，与文件名一致）；`core` 或扩展包名；整数版本，只认当前版」
- 代码实际：entity-templates.json、fixtures.json、offenses.json 三字段齐，但 `kind` 分别为 `entity-templates`/`fixtures`/`offenses`，都不是 §1.2 的 22 类之一；named-structs.json 只有 `version`，无 `kind`、`namespace`；slots/core.json、consumers.json 三字段全无；calendar.json 的 `kind` 是 `"calendars"`，与文件名 `calendar.json` 不一致。
- 理由：无（§1.1:59 只列部分旧文件保留职能，未列 named-structs、slots）
- 影响：只是形式
- 严重程度：丙
- 合并：无（若判这些旧文件不受 §1.2 约束，本条按"形式"保留，不升严重度）

### 14 ontology/calendar.json 与 _vocab 的 calendar 族双份定义，且与 §5.23 冲突
- 位置：world/ontology/calendar.json:1-3；world/ontology/dimensions/_vocab.json:231,247；server-plugin/kernel/calendar.mjs:14,38-40
- 设计原文：卷二:2174「语言、历法、伤害类型、能力、服务、动词、货币种类、需求块、罚则、辖区、命名库 | `_vocab.json` 带字段的族（历法沿用 ontology/calendar.json；货币沿用 resources.json coin 族）」
- 代码实际：`kernel/calendar.mjs` 读词表族 `calendar`（`engine.vocab`），数据已迁进 `_vocab.json`（:231 自述"数据迁自 world/ontology/calendar.json"）；旧 `ontology/calendar.json` 仍在且无 `supersededBy`，成为第二份定义。
- 理由：无（docs/迁移体检/块4.md:14 只记「旧 world/ontology/calendar.json 仍在」，未给保留理由；以哪份为准也无裁定）
- 影响：数据错（双处定义）
- 严重程度：乙
- 合并：无

## 已登记未建

- 菜单动作分流与 `schema:wire-up-menu-v1` 收窄：卷二:956/:1094；登记处 docs/卡回报/ds-b6-19.md:41、ds-b6-20.md:51（随 6-14/6-16/6-21）。
- 心跳推进（wallTimer.heartbeat 无调用者，menu-entry 无心跳路径）：卷二:1005-1010；登记处 server-plugin/kernel/mount.mjs:8。
- `postReply`/`ReplyCap.send` 调用者白名单的装配期核对：卷二:997；登记处 server-plugin/kernel/transport/reply-channel.mjs:7、router-caps.mjs:7（注释自述随 6-19、6-20）。
- 过程主体槽迁移（derived-process.json 为空 `{"version":1,"slots":{},"consumers":{}}`，数据仍在未引用的 ontology/slots）：卷二:1466、:2313 M2-13。
- E-KEYID-WIDTH 与 `keyIdAggBits`/`keyIdOrdinalBits`：卷二:1612；登记处 docs/迁移体检/块4.md:125（卷二十七 §4.2 首卡，块 7）。
- E-ADMIT-CAUSE 与持有准入入口：卷二:1597；登记处 server-plugin/kernel/holdings.mjs:17（块 5 无登记实现，非空即 E-ACT-WRITER-NOT-READY）。
- E-MAT-READER-NULL / E-MAT-READER-UNREGISTERED / E-MAT-UNREAD-WRITTEN：卷二:1632；登记处 docs/问题.md:271（"待 M-23 上线再改"）。
- E-WIRE-ENVELOPE 与客户端信封核验：卷二:969；客户端未建（仓库无 `extension/` 目录）。
- E-RELOC-TARGET 与 `kernel/relocate.mjs`：卷二:635 登记了该 kernelApi、:1598 登记了该码，文件不存在，无建卡记录。
- 未建领域的登记码（E-BST-*、E-DISPLAY-*、E-I18N-*、E-GEN-*、E-KIN-*、E-REL-*、E-PANEL-*、E-AV-*、E-MAP-COMPASS 等）：卷二:1621-1623 归各卷定义，相关卷/块未建。
- 卷二 §4.3 登记码中 server-plugin 无出现点、tools/tests 也没有的 106 个（按前缀）：E-ACC 18（CODE-UNLISTED, COMMIT-MSG, CRITERION-LOOSENED, DOC-SEAL, EXT-EXISTING-ROW, FIXTURE-INSTANCE, GATE-BYPASS, HIT-OPEN, NEWROW-UNANCHORED, REPORT-FORM, REVIEW-CHECKLIST, REVIEW-MISSING, REVIEW-SELF, REVIEW-STALE, REVIEW-VETO, ROWKEY-DRIFT, RUN-UNBOUND, ZERO-MISMATCH）；E-ADMIT-CAUSE；E-AV 2（KEY, NO-DEFAULT）；E-BST 13（BANE-CLASH, BODY-WRITE, DUPLICATE, GEN-SLOT, LAIR, LORE-SHAPE, MONSTER-SCHEMA, QUOTA, SIM-DIMS, TIER-ROWS, TRANSFORM-ROWS, VARIANT, WARD-SHAPE）；E-DIM 8（DERIVED-RECURSIVE, INVARIANT-DOCTRINE-GROUP, INVARIANT-MASS-VOLUME, INVARIANT-SEVERITY-ORDER, MEMBER-DEVIATION, NAMESPACE-OVERRIDE, REQ-CYCLE, SOURCE-MISMATCH）；E-DISPLAY 8（BACKFLOW, BRANCH-TEXT, DICE, HOST-CHAT, LITERAL, LOCALE-BRANCH, SUBJECT, UNSEEN）；E-ESTEEM-UNSOURCED；E-GEN 12（BRANCH-ORIGIN, BYPASS, DEFAULT, GROUP-CYCLE, GROUP-ROW, ID-COLLISION, LATE-SOURCE, MANIFEST-DRIFT, NAME-EMPTY, NOT-MATERIALIZED, REJECT, RESPECT）；E-GROUP 2（SIZE, OVERLAP）；E-I18N 5（LABEL-FOREIGN, LABEL-NUMERIC, PLURAL, TPL-MISSING, TPL-SLOT）；E-INPUT 2（DEFAULT, NORMALIZE-SCATTER）；E-KEYID-WIDTH；E-KIN 3（CYCLE, DESCENT-TRAITS, REGIME-AGE）；E-MAP-COMPASS；E-MAT 3（READER-NULL, READER-UNREGISTERED, UNREAD-WRITTEN）；E-MOD 2（SCOPE, SLOT-DUPLICATE）；E-PANEL 4（ACTION, KIND, PATH, SOURCE）；E-PERSON-CULTURE-MISSING；E-REL 5（INTIMATE-MINOR, KIND, MINOR-LOAD, REWRITE, SOCIAL-FIELDS）；E-RELOC-TARGET；E-SEAL-READ；E-SOC-TEXT；E-STANCE 2（BYPASS, SOURCE）；E-TPL-CYCLE；E-TSC 2（CATCH-NARROW, COVERAGE）；E-VIEW 2（NAME-RESEED, UNDECLARED-READ）；E-WIRE-ENVELOPE；W-DIM-PRECEDENCE-TIE；W-MOD-UNKNOWN-BASE；W-VIEW-OVERDECLARED。

## 拿不准

- `report.mjs` 的 `checkFields` 收 null 与布尔；卷二:534 明写 id 取不到为 null，但 :1119 只说"代号与数值字段"，布尔是否有位置未写。
- 第 13 条的旧本体文件是否根本不受 §1.2 约束（§1.1:59 只说"保留职能"）；若不受，本条只算形式。
- 第 10 条：自引用缺 recursive 究竟该报 RECURSIVE 还是 CYCLE，卷文两码都登记，语义边界由主会话定。
- `router-caps.register` 重复登记路由用 E-WRITER-DUPLICATE（router-caps.mjs:39），卷二 §2.9 只说"每条路由只登记一次"，未点名码。
- 校验器报告把 `got/want` 缺省补成 null/''（dimensions-validate.mjs:687），与卷二:1563"got/want 必填"的严格程度不一致。

## 跨卷待判

- 历法定义处：卷二 §5.23 :2174 说"历法沿用 ontology/calendar.json"，卷二十 §2.3 :228 定义为"词表族 `calendar`"，代码读词表族。以哪一卷为准需对读两卷后裁定（第 14 条）。
- E-PERSON-CULTURE-MISSING 归卷四 §2.7 定义、卷二 :1607 只登记；卷四/块 6 是否要求本块就实现，需对读卷四卡序。
- E-MAT-READER-* 归卷三甲 M-23；docs/问题.md:271 说"待 M-23 上线"，与卷三甲卡序对读后才能判是未建还是偏离。
- E-ACC-* 一组在 tools 离线实现、不在 server-plugin；卷二 :1624 说清单定义在卷十二 §2.12，运行时是否也该有抛出点需对读卷十二。
- `kernel/relocate.mjs` 在卷二 :635 登记为 kernelApi、E-RELOC-TARGET 在 :1598 登记，文件不存在；建卡归属需对读卷十一迁移表与块 7 卡序。
