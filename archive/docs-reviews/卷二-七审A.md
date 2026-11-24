模型：claude-sonnet-5-5，中档（11-13 换 Opus 审查前的旧记录）（主会话 11-13 按运行记录补注）

# 卷二 七审 A（第七版）

审查对象：docs/统一底层设计/卷二-维度表规范与统一入口.md（1659 行；已读 §1.1、§1.8、§2.7、§2.8、§4.3 相关行、附录 A 片段、D.1/D.3 标题与相关行）。只做静态阅读，未运行脚本。按约定，"新的绕法"归卷十二，不计入卷二；本文只列机制本身的缺陷。

## 总判：有条件通过

六审 N1–N5 全部落实，六审小项基本落实。§2.8 改成"品牌类型 + kernel 组 + 位置白名单"后，六审提的边界问题（实体 id、种子键、修正键）有了清楚的出路，机制方向正确。剩下 5 条真问题，都是机制定义里一句话能补上的缺口，没有方案层面的问题。

## 一、六审 N1–N5 与小项核对

| 条 | 判定 | 行号证据 |
|---|---|---|
| N1 §2.8 内核边界 | 已解决 | §2.8 L445（品牌类型 `Handle/EntityId/DimKey/ModKey/SeedKey/NodeName/ErrorCode/Text`，只能由内核构造）、L446（kernel 组唯一构造/拼接/解析：种子键、修正键、节点名、实体 id 生成、`idIndex/kindOf`）、L447（规则层只许相等、Map/Set 键、原样传递）、L448（位置白名单）；§1.1 L47、§2.7 L410、L433–434、L456 |
| N2 matchBlocklist | 已解决（有一处补充，见 P4） | §2.7 L430：返回命中列表，坐标在规范化文本上，`origStart/origEnd` 经码点对照表映射回原文，按 start 升序、重叠相邻合并、一次返回全部；L431 outputGate 对原文按 `[origStart,origEnd]` 替换，替换记号不再判定；A19 L1266 覆盖两处命中、重叠相邻、组合字符 |
| N3 id 泄漏 | 已解决 | L424（needle 来源 = blocklist ∪ 代号登记表，登记表是代号不是语言）、L430（`matchIdLeak(text)`，needle = idIndex 全部 id ∪ 全部句柄字串）、L432、L461（aiGate 只调用，不再需要正则） |
| N4 逐码元 | 已解决 | 正文已无"逐码元"；L430（折叠按码点）、L457（按 casefold 表逐码点映射） |
| N5 component 族 | 已解决 | §1.8 L204（独立 `component` 族，前缀 `comp_`，`classes` 类型为 `set<ref refs[vocab class, vocab component]>`）、§5.0 L705、附录 A L1382–1384、D.1 L1514 |
| 小项：trimOnly | 已解决 | L457 登记 `normalizeInput / trimOnly`，在 `input/normalize.mjs` |
| 小项：生成名拼装主体 | 已解决 | L429、L431：拼装只经 `templates.mjs`；§1.9 生成名段已按此引用 |
| 小项：outputGate 措辞 | 已解决 | L431"命中段之外原样保留" |
| 小项：D.1 列数与小节顺序 | 已解决 | D.1/D.2/D.3 标题依次在 L1497、L1535、L1574，D.1 第五版行已单列 |
| 小项：comp_facility 校验 | 已解决 | 附录 A L1401 说明归属表夹具到场时再核对 |
| 小项：item.durability 可修正 | 已解决 | §5.1 L748 `durability` 标 modifiable |
| 小项：display DOM 字面量 | 已解决 | L429、L458 |
| 小项：i18n 冻结文件列入文件布局 | 已解决 | §1.1 L44–47 |
| 小项：aiGate 长度按码点 | 已解决 | L432 |

## 二、新内容检查：真问题

### P1 gate 组的 import 规则与调用关系矛盾，kernel 组未进模块组规则（L420、L431、L432、L410、L446）
- L420 仍写"`gate` 组只被测试与 CLI import"，但 L431 与 L432 规定 outputGate 与 aiGate 要调用 gate 的 `matchBlocklist`、`matchIdLeak`；按 L420，这两组的合规实现会被判 E-VIEW-INPUT-IMPORT 或违反 gate 的访问限制。
- L420 的标题与互不相交约束仍只说"五个模块组"，kernel 是第六组（L410、L433）；`E-GROUP-OVERLAP` 与 `E-KERNEL-UPWARD-IMPORT` 的描述里"内核（kernelApi 所在文件与存储层）"仍是旧口径，没有对应到 `server-plugin/kernel/**`。
- 改法：L420 写明"gate 被 outputGate、aiGate、测试与 CLI import，规则层不得 import"，并把互不相交的组数、内核定义改为包含 kernel 组。

### P2 text 路径的凭证签发者与写者清单对不上（L413、L421、L397）
- L421：writeText 的 `credential` 只由 aiGate 组或 display 组签发。L413：`created.*.props.basis` 的唯一写者是 `kernel/dimension-writers.mjs`，注释写"写者在 aiGate / display / kernel 组内"。kernel 不是凭证签发者，basis 的写入既没有凭证，又因路径在 textPaths 内按 L421 被判 E-TEXT-UNGATED；或者要求 kernel 向自己签发凭证，则凭证机制失去意义。
- 另外 L397 的 `created` 写者是 `dimension-writers.mjs`，L413 是 `kernel/dimension-writers.mjs`，路径不一致。
- 改法：二选一——规定 kernel 组也可签发凭证，但只限 `basis` 这类"作者文档字段"（并在 L421 写明）；或把 basis 从 textPaths 挪出，改为由内容管线离线写入而不经运行态（basis 是文档字段，运行时本不写）。并统一写者路径。

### P3 `Text` 品牌类型的可见范围与使用组不一致（L445、L457、L430、L458）
- L445：`Text` "只在 display/aiGate/outputGate 组可见"。但 L457 inputEdge 用 `Map<Text, Handle<action>>`，L430 gate 的 `matcher.mjs` 入参本身就是文本，二者都不在可见组里；按 L445 这两组会因类型不可见而报错。
- 改法：把 `Text` 的可见组改为 inputEdge、display、gate、outputGate、aiGate 五个非规则组（规则层与 kernel 不可见），并在 L445 与 L457 统一。

### P4 needle 是否同样规范化没有写（L430）
- L430 的三步算法对**文本**做 NFC 与大小写折叠，再 `indexOf`；needle 来自 blocklist 或代号登记表，但没有规定 needle 也经过同一规范化。blocklist 条目若按作者习惯写成大写或分解形式（如 "Ａ" 或 e+U+0301），而文本已折叠，则永远不命中，屏蔽词静默漏过。
- 改法：加一句"needle 在加载期经同一 NFC + casefold 规范化并冻结，坐标与比较都在规范化空间"，并在 A19 加一条大写 needle 的用例。

### P5 路径模式的匹配语义没有定义（L397、L412–414、L421）
- `pathTypes`、`textPaths`、`textWriters`、`stateKeys.writers` 都用 `*` 通配路径；"未声明路径一律拒写"（E-PATH-UNDECLARED）依赖路径匹配，但没有规定：通配符匹配几段、模式重叠时谁优先（例如 `created.*.props.*` 的偏离值写入与 `created.*.props.basis` 的字串路径同时存在，L397 与 L412 各有一条）、模式与具体路径的比较方式。
- 示例 `pathTypes`（L414）只列 7 条，没有 `created.*.props.<dim>`（偏离行写入，§1.10 的主路径）、`modifiers.*`、`holdings.*`；按"一律拒写"，这些合法写入都会被拒。作为示例这是措辞问题，但缺少匹配语义是机制缺口。
- 改法：在 §2.7 写一句匹配规则（`*` 恰匹配一段；模式重叠时最具体者胜，同等具体即 E-WRITER-DUPLICATE），并说明示例只列代表性条目，完整表由各卷登记且加载期校验覆盖全部 state 顶层键。

## 三、措辞小项（只记账）

- §2.7 L420 的"内核（kernelApi 所在文件与存储层）"改为 `server-plugin/kernel/**`（与 P1 同改）。
- matchIdLeak 的 needle 取 idIndex 全部 id（含运行时生成的 NPC id），规模随世界增长，逐个 `indexOf` 成本高；性能实现（前缀树或哈希分段）归卷十二，本卷可加一句"实现不限于逐个 indexOf，结果须等价"。
- L430 组合字符边界：命中段落在一个未合成的组合序列中间时，替换后可能留下孤立组合符；归卷十二测试集，A19 可补一条。
- §2.8 L457 inputEdge 两张 Map 写成同一类型 `Map<Text, Handle<action>>`；编号表的键应写成 `Text` 的数字串形态，建议在注里区分"显示名表"与"编号表"。
- E-PATH-UNDECLARED、E-WRITER-MISSING 已在 §4.3 L683 登记，含义与 §2.7 L421 一致；E-WRITER-DUPLICATE 与 E-WRITER-MISSING 的级别（L2）建议在 §4.3 同行标明。
- §2.8 第 3 条要求"无类型标注的导出函数参数视为失败"，迁移面很大，成本与分批策略归卷十一，建议在 D.3 记一行。

## 四、结论

真问题 5 条（P1–P5），均为机制定义的接口缺口，不涉及方案调整；措辞小项 6 条记账。按约定判"有条件通过"。P1–P5 各只需补一两句并同步 D.1，改完由主会话核对 L420、L421、L430、L445、§2.7 路径匹配这几处即可，无需再整轮审。
