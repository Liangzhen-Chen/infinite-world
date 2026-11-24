模型：claude-sonnet-5-5，中档（11-13 换 Opus 审查前的旧记录）（主会话 11-13 按运行记录补注）

# 卷二 五审 A（第五版）

审查对象：docs/统一底层设计/卷二-维度表规范与统一入口.md（1520 行；已读 §0–§5 的主体、§7、附录 A–G，§6 只抽查 L1155）。只做静态阅读，未运行 check-vol2.mjs，其输出（D.2）按文字核对，不当作证据。

## 总判：有条件通过

四审 A 的 N1–N8：6 条已解决，N4、N8 各留一个尾巴。第五版把重大矛盾都收掉了，剩下 6 条真问题，全是"改一处、另一处没同步"型，没有缺维度、没有写死、没有读文字判断。附录 G 台账与 D.1 影响面表的做法有效：抽查的 8 个概念里 6 个确实只在一处写全，D.1 抽查的 5 项里 3 项完全同步、2 项有漏。真问题改完不需要再整轮审，主会话对照下表逐条核对即可收口。

## 一、四审 N1–N8 逐条核对

| 条 | 判定 | 行号证据 |
|---|---|---|
| N1 state 可传对象 | 已解决 | §2.3 L360（三类对象：内核 API、uses 内节点入口、impl 组内函数）、L363；§2.7 `kernelApi` L406；A12 L1198 含正例（传给 `dim`、`facilityView`）与反例（传给 uses 未声明的 `statusView`） |
| N2 实体行 extends | 已解决 | §1.3 L113、L123（适用类型含实体行）、L132（类别行与实体行分别的目标规则、环检测含两类节点）、L133（extends 与 classes 的先后）、L154（总表加实体行）；A11 L1197（实体→实体通过、互 extends 成环报错、类别行 extends 实体行报错） |
| N3 union / ref 混合 | 已解决 | §1.5 L170（`refs` 形态）、L171（union 成员须可由 JSON 形态唯一判别）；§5.6 L768、§5.9 L820、§5.13 L870、§5.14 L889、§5.18 L932、§5.21 L985/L990 已改；E-DIM-UNION-SHAPE L614 |
| N4 族名与前缀 | 部分解决 | §1.9 L208 明文"族键就是族名"；§5 与 §1.11、§3.9 绝大部分已改。尚有 3 个族名在用却未登记，见真问题 T2 |
| N5 派生显式写 | 已解决（有一处尾巴） | §1.2 L94–95（声明/取值分开、`allowExplicit`）、§1.6 L192、§5.1 L659–660、L586、L588、L616、A18 L1204。尾巴见 T1 |
| N6 附录 A 自足 | 已解决（有一处夹具缺陷） | 附录 A L1272–1336：单一 JSON 含 `memberDeviationThreshold`（L1291）与 `rows`（L1300），附带 `_vocab` 与 `_effects` 片段（L1309–1335）。夹具缺陷见 T6 |
| N7 卷一编号 | 已解决 | L119（3A.8）、L298（3A.7）、L542（3A.3/3A.4/3A.5）、L544（3A.6）；附录 F L1469–1491 改成"卷一须对齐的项"，不再写"一致" |
| N8 屏蔽词 | 已解决（有一处尾巴） | §1.9 L211（维度校验器只查键）、L213（tools 组 `name-blocklist-check.mjs`，含组合规模上限）；S7 L1213、S17 L1227、A17 L1203。尾巴见 T5 |

## 二、真问题（缺维度、写死、读文字、接口对不上、自相矛盾、不确定性）

### T1 §1.10 与 allowExplicit 自相矛盾（L250、L95、L192）
- L250 写"**派生维度不接受偏离行**（E-DIM-DERIVED-WRITTEN）"；L95 明文 `allowExplicit` 维度允许"实体行/偏离行"写显式值并豁免 E-DIM-DERIVED-WRITTEN。同一版内两种说法。D.1 的 allowExplicit 行没有列 §1.10，所以漏了。
- 改法：L250 改为"没有 `allowExplicit` 的派生维度不接受偏离行"；D.1 补一列 §1.10。

### T2 三个词表族名在用却没有登记，附录 D.2 的"前缀登记 OK"没有核对族名（L213、L646、L1222、L208、L1445）
- `enum nslot`（L213 nameParts 的槽位）不在 L208 族表。
- `enum vstatus`（L646，§5.0 的 status 文档字段）：L208 登记的是族 `status`→`vstat_`，族名对不上（按"族键 = 族名"应写 `status` 或把族改名为 `vstatus`）。
- `enum error_code`（L1222，S13 里 `E.<code>` 句柄的声明类型）不在 L208 族表。
- 按 L204 自己的规则"凡出现的族必须在 `_vocab.json` 登记（E-DIM-REF-MISSING）"，这三处都要报错。D.2 脚本第 2 项检查的是 id 前缀，不检查族名，所以输出"OK"并不能证明 D.1"族键 = 族名 → 是"。
- 改法：补登记 nslot、error_code，统一 vstatus 与 status；脚本补"族名对账"一项。

### T3 枚举值前缀写法在示例里混用（L204、L208、§3.2 示例、§3.3、L257、L551–558、L1328–1331）
- L204 规定枚举值一律带族前缀，L208 登记了 `stage→stage_`、`scope→scope_`、`eff_output→effout_`。但 §3.2 修正项示例（`"stage":"mul"`、`"scope":"believers"`）、§3.3 伪代码与文字、§1.11 L257（`"target":"body"`）、§3.9 L551–558（`"scope":"target"`、`"kind":"modifier"`）都用无前缀值。
- 附录 A 同一行里两种写法并存：L1328 `"scope":"scope_target"`、L1331 `"kind":"effout_modifier"` 带前缀，而同一对象的 `"stage":"add"` 不带。按 A4（内联枚举/无前缀值 → E-DIM-DOMAIN-ENUM）这些例子自己就过不了校验。
- 改法：二选一——要么给封闭的代码枚举（stage、scope、effout、status target）规定"代码内封闭枚举值不带前缀，只有 `_vocab.json` 开放族带前缀"，并在 L204 与 L208 把这几族从前缀表里挪出；要么全文示例统一带前缀。建议前者（stage、scope 是封闭、代码里固定的），并同步附录 A。

### T4 输入规范化在三处写法不一致，唯一定义处反而最不完整（L220、L1244、L1228、L1484）
- 唯一定义处 §1.9 L220：NFC → "去掉首尾空白" → Unicode 简单大小写折叠，未定义"空白"的集合。
- B10(a) L1244 与附录 F #11 补了"Unicode White_Space（含 U+3000，仅首尾）"；§1.9 里没有。
- S18 L1228 允许的实现是 `toLowerCase`/"简单大小写折叠"，写法并列；`toLowerCase` 不等于 Unicode 简单大小写折叠（例如希腊词尾 ς 折叠为 σ，toLowerCase 不变），两种实现对同一输入可能一个命中一个退回菜单，zh/en 对等的结果集就不确定。
- 违反附录 G"只在一处写全"的约定（L1503）。
- 改法：在 §1.9 L220 写全三步（White_Space 集合、折叠用 Unicode CaseFolding 的 C+S 条目，并规定实现方式，如固定的映射表 `normalizeTable`），B10、S18、附录 F 只引用。

### T5 屏蔽词与 labels 的读取方，各处说法不一（L213、L415、L416、L1155、L1213、L1227、L1486）
- §2.7 L416：`gate` 与 `outputGate` 两组做闸内命中，读屏蔽词表与 labels；L415：aiGate 的守门含"屏蔽词"检查；§6.11 L1155：屏蔽词文件"只被 tools 组、gate / outputGate 组读"。
- S7 L1213：server-plugin 内 labels 只被 inputEdge、display、outputGate 三组 import（没有 gate、aiGate）；S17 L1227 与附录 F #14 L1486：server-plugin 内只有 outputGate 读 blocklist。
- 若按 S7/S17 验收，gate 与 aiGate 的合规实现会被判违规；按 §2.7 实现则 S7/S17 过不了。
- 改法：以 §2.7 为准，S7、S17、附录 F #14 改为"inputEdge、display、gate、outputGate、aiGate 中按 §2.7 登记的读者"，并在 §2.7 列出每组可读的文件类别（labels / blocklist）。

### T6 附录 A 夹具的组件 requires 指向了别的表的维度（L200、L1319）
- L200：组件类的 `requires` 是"本表维度列表"。夹具里 `comp_facility` 的 `requires: ["facilityType"]`（L1319），而 `facilityType` 是 place 表的维度（§5.6 L? `facilityType`），不是这张 facility_type 夹具的维度；夹具又声明 `comp_facility` 的 `enables: ["service"]`，对照的是 facility_type 的 behaviors。按 E-DIM-COMPONENT-REQUIRES，夹具通不过。
- D.2 脚本第 4 项只检查字段齐全、展平、引用闭合，没有检查 `requires`；所以脚本"PASS"不能证明 A15。
- 改法：规定组件类归属哪张表（在 class 族条目加 `table` 字段），夹具把 `comp_facility` 归 place 表并从 facility_type 夹具里拿走；或改夹具使用 facility_type 自己的维度。

## 三、措辞小项（只记账，不阻断）

- §2.7 JSON 示例 L408 `textWriters` 一行后缺逗号（L409 `"phases"` 前），示例不是合法 JSON。
- S15 L1230 仍写"state 整体传入非声明节点"，与 §2.3 的"三类对象"不同步；S16 L1231 只写 inputEdge，S19 L1229 已覆盖四组，建议 S16 引用 S19。
- §2.7 L416 "仅 gate 与 outputGate 两组允许比对文字"，与 inputEdge 的整串相等比较（L1228）并存，措辞应写"闸内命中"。
- effectCall 的形状在 §1.11 L271 和 §3.9 L568 各写一次"唯一形状"，内容相同；按附录 G 应只留 §3.9，§1.11 改引用。
- 附录 F #1 L1473 重述了标度、S[0..8]、penalty(n)，G 台账 L1511 把它列为"引用处"；建议改为"见 §3.3"。
- §1.2 L78 与 §1.5 的 ref 写法在夹具里两种：`{"ref":{"vocab":"service"}}`（L1279）与 `{"type":"ref","kind":"effect"}`（L1287）；§1.5 L568 写 `{"ref":{"kind":"effect"}}`。统一一种。
- `eff_repair_item` 的 `target: "item.durability"`（L1331）要求 durability 是 modifiable 的修正键，§5.1 的 instanceDimensions（L686）没标 modifiable；夹具里 item 表不在场，不影响校验，但与 §5 不同步。
- 附录 E L1453 与 D.2 L1431 都写"以 node 运行"的脚本；本机红线下这些输出只能由主会话在允许的环境核对，建议在附录里写明"核对者"。
- 标题段 L3 里"旧版快照"仍重复列出两处。

## 四、附录 G 抽查（8 个概念）

| 概念 | 台账唯一处 | 结果 |
|---|---|---|
| 维度类型清单 | §1.5 | 唯一。§1.2 L88、§4.1 L1、附录 F #7/#8 只引用，"14 种"数字在 D.2 对过。 |
| 继承写法与展平 | §1.3 | 唯一。§0.2 L17 是摘要，附录 C 是术语，不重写规则。 |
| 三种行与覆盖顺序 | §1.3 | 唯一；但 §1.10 L250 与之矛盾（T1）。 |
| onUnknown 与三态 | §1.6 | 唯一。§1.2 L93、§3.8 L542 只引用。 |
| 求值管线与系数表 | §3.3 | §0.6 L21 已改成引用；附录 F #1 L1473 重述数值（小项）；附录 B/E 是算例，允许。 |
| 效果族与 effectCall | §3.9 | §1.11 L271 重复定义一次（小项）。 |
| 语言边界与输入规范化 | §1.9 第 3 条 | 失败：规范化细节散在 B10、S18、附录 F，唯一处反而缺（T4）。 |
| 模块组、闸内算法 | §2.7 | §1.9 L221 已改引用；S19 是验收口径，S7/S17 与 §2.7 不一致（T5）。 |

## 五、D.1 影响面表抽查（5 项）

| 改动 | 结果 |
|---|---|
| state 可传三类对象 | 已同步：kernelApi L406、A12 L1198；S15 措辞未更新（小项）。 |
| 实体行可 extends | 已同步：§1.2 L107、A11 L1197、附录 A rows L1300、§5.12 L838（parent 与 extends 分离）、附录 F #6。 |
| allowExplicit | 漏一处：§1.10 L250 未同步（T1）；其余 §1.3 L154、§1.6 L192、§5.1 L659–660、§4.1 L586/L588、§4.3 L616、A18 均已同步。 |
| 族键 = 族名 | 漏：§5.0 L646 的 `vstatus`、§1.9 L213 的 `nslot`、S13 L1222 的 `error_code` 未登记（T2）。 |
| 屏蔽词归 tools 组 + blocklist.<lang>.json | 漏：§6.11 L1155 与 §2.7 允许 gate 读，S7 L1213、S17 L1227、附录 F #14 L1486 只许 outputGate（T5）。 |

## 六、结论

真问题 6 条（T1–T6），均不涉及方案变更；措辞小项 9 条记账。按本轮约定，存在真问题，故判"有条件通过"；T1–T6 改完、D.1 补记 §1.10、D.2 脚本补族名对账与组件 requires 检查两项后，可收口。
