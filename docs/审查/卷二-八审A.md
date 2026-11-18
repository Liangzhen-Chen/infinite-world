模型：claude-sonnet-5-5，中档（11-13 换 Opus 审查前的旧记录）（主会话 11-13 按运行记录补注）

# 卷二 八审 A（第八版）

审查对象：docs/统一底层设计/卷二-维度表规范与统一入口.md（约 1705 行；已读 §2.7、§2.8 第 1–4a 条、§3.2、§4.1/§4.3 相关行、附录 A19、附录 D/G 相关行）。只做静态阅读。新的绕法归卷十二，不计入卷二。

## 总判：有条件通过

七审 P1–P5 与六条小项全部落实。新增的六组 import 矩阵、basis 改 struct、路径最具体者优先、needle 加载期规范化，本身自洽。剩下 4 条真问题，都是第八版新增机制（SA-P2 的 basis 改法、§2.8 4a 的 JSON 边界、Text 可见性）与旧条款交界处的接口缺口，各一两句话可补。

## 一、七审 P1–P5 与小项核对

| 条 | 判定 | 行号证据 |
|---|---|---|
| P1 gate import 与 kernel 组 | 已解决 | §2.7 L420（六个模块组、文件级互不相交且与规则层不相交）、L422–431 import 矩阵（gate 行 kernel 与 gate；outputGate、aiGate 行含 gate 的 matcher.mjs）、L433（gate 只被 outputGate、aiGate、tests/CLI import；kernel 不 import 任何其他组） |
| P2 basis 与凭证 | 已解决 | L435（basis 改 `struct:basis = {kind, seedKey, writer}`，kernel 直写，无需凭证；作者侧说明文字只在 world/ 数据里）；L412–413 textPaths/textWriters 已不含 basis，写者仅 aiGate/display；L397 写者路径统一为 `kernel/dimension-writers.mjs`；§1.3 L118 区分作者侧与运行态 basis |
| P3 Text 可见组 | 已解决（有补充，见 Q3） | §2.8 L460：`Text` 只对 inputEdge、display、gate、outputGate、aiGate 可见，用分组 tsconfig 实现；L473 inputEdge 两张 Map 注明构造点不同 |
| P4 needle 规范化 | 已解决 | L445：needle 加载期经 ①② 规范化并冻结；离线校验 blocklist 文件本身已规范化（E-I18N-BLOCKLIST-UNNORMALIZED，§4.3 L706）；A19 L1289 增加大写/分解形式用例 |
| P5 路径匹配 | 已解决 | L436：`*` 恰匹配一段；字面段数多者更具体，相同则 `*` 更靠后者更具体；同等具体且重叠 → E-PATH-OVERLAP（§4.3 L704）；L397 的 `*.props.*` 与 `*.props.basis` 共存，后者胜；L414 示例补 created、modifiers、holdings 条目，并注明只列代表性条目 |
| 小项：L420 与 kernel 定义 | 已解决 | L420、L410 |
| 小项：matchIdLeak 性能 | 已解决 | L445"可用前缀树/哈希分段，结果须与逐个 `indexOf` 等价"，性能归卷十二 |
| 小项：inputEdge 两张 Map | 已解决 | L473 |
| 小项：E-WRITER-* 级别 | 已解决 | §4.3 L704（均标 L2） |
| 小项：类型检查迁移面与"现成做法" | 已解决 | L463（改"自写一条规则"，工作量归卷十二）；迁移面见 D.3（L1524 引用、L1624） |
| 小项：组合符孤立 | 已解决 | 归卷十二，D 行 L1524 |

## 二、新内容检查：真问题

### Q1 运行态修正项仍带文字 basis，违反"自然语言只在 textPaths"（L414、§3.2 L538、L541）
- SA-P2 把 `created.*.props.basis` 改成代号结构，但 `pathTypes` 里 `modifiers.*` 是 `struct:modifier`（L414），而 §3.2 的修正项格式含 `"basis": "苦修信条：进食需求 −15%（卷七标定）"`（L538），L541 又写"来源五处，格式相同"，其中包括运行态 `state.modifiers`。运行态写入的修正项会把中文说明句存进 state，路径又不在 textPaths，按 L434 属非 textPaths 路径存字串，E-TEXT-UNGATED。
- 同类风险还有 `holdings.*.*` 的 `struct:holding`、效果族输出生成的运行态修正项（§3.9）。
- 改法：在 §3.2 写明"`basis` 只存在于 world/ 数据行；运行态 `state.modifiers` 条目不带 `basis` 字串，改带 `struct:basis`（`kind` 取 `deviation/generated`）"，并在 L434 规定 struct 内禁止 `string` 类型字段（除非路径在 textPaths）。

### Q2 JSON 与文件读取只许 kernel 加载器，但校验器、AI 输出解析的位置没有定（§2.8 L464、§4.1 L662、§1.9）
- L464：`JSON.parse`、`fs.*`、动态 `import()` JSON 只允许在 `kernel/load/*.mjs`，且结果须先过 §4 校验器 schema 再由构造函数产出品牌类型。但校验器本身是 `server-plugin/dimensions-validate.mjs`（§4.1 L662，S13(b) 三个文件之一），不在 kernel 目录；校验器要读 JSON 做 L0 语法与重复键检查，按 L464 就是 E-TSC-PARSE；而"先校验再构造"又要求校验器在加载路径里，形成先后依赖不清。
- AI 输出需要解析为结构化代号（§1.9 第 1 条）、请求体也要解析，这些 `JSON.parse` 也在 kernel 加载器之外（aiGate 只写"schema 校验器调用"，L447、L461）。
- 改法：规定校验器移入 `kernel/load/`（或在 L464 为它单列豁免），并在 kernel 提供 `kernel.parseExternal(text, schemaId)`，作为 AI 输出与请求体的唯一解析入口，aiGate 与服务层只调它。

### Q3 `Text` 类型的值如何从数据文件进入五组，没有通路（L460、L464）
- L460：`Text` 对 kernel 与规则层不可见；L464：读文件只能在 kernel 加载器。labels、blocklist、charset 的**值**都是 `Text`，display、gate、aiGate 需要拿到它们；kernel 加载器不能产出 `Text`（不可见），五组又不能读文件，所以没有合法的获取途径。
- 改法：在 L460 增加例外"`kernel/load/text-tables.mjs` 的 tsconfig 同时引用 `Text` 声明，仅负责把 labels、blocklist、charset、whitespace、casefold 读成冻结的 `Text` Map 并导出给五组"，其余 kernel 文件仍不可见。

### Q4 `pathTypes` 的类型文法缺 `struct:<名>`，且这些结构没有定义处（L414、L434）
- L414 用了 `struct:basis`、`struct:modifier`、`struct:holding`；L434 列出的合法值类型只有 `number / integer / boolean / ref:<kind> / enum:<族> / dimension / string`。L435 只定义了 `struct:basis`；`modifier`（§3.2）与 `holding`（卷一持有表）没有指到定义，也没规定 struct 内字段的类型检查方式（与 Q1 相关）。
- 改法：L434 增加 `struct:<名>`，并规定 struct 名指向的定义处（`struct:modifier` → §3.2 去掉 basis 的运行态形态；`struct:holding` → 卷一持有表字段，由对应卷登记）。

## 三、措辞小项（只记账）

- §2.7 L452 仍写"五组文件级不相交"，应为六组（L420）。
- import 矩阵 L427 与 L429：display 允许 import outputGate，outputGate 又允许 import display（templates.mjs），形成组间互相引用；建议把 `templates.mjs` 单列到 display 之外的共享目录，或规定 outputGate 只 import templates.mjs 一个文件，避免循环。
- L392 `npcs` 的 `*.props` 写者是 `dimension-writers.mjs`，L397 `created` 的写者是 `kernel/dimension-writers.mjs`，路径不一致，统一为 kernel 路径。
- L414 `pathTypes` 键用绝对路径，L392 `writers` 键用相对 stateKey 的路径，两种写法在同一示例里；L436 说"共用匹配语义"，建议写明相对/绝对的转换规则。

## 四、结论

真问题 4 条（Q1–Q4），均为第八版新机制与旧条款的接口缺口，不涉及方案调整；措辞小项 4 条记账。按约定判"有条件通过"。Q1–Q4 各补一两句并同步 D.1 后，由主会话核对 §3.2、§2.7 L434、§2.8 L460 与 L464 即可收口。
