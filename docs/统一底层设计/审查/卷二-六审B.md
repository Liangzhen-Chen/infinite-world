模型：claude-sonnet-5-5，中档（11-13 换 Opus 审查前的旧记录）（主会话 11-13 按运行记录补注）

# 卷二六审 B（第六版，1606 行）

静态阅读，未运行任何东西；input-view 对照了 F:/dnd/extension/input-view.mjs 全文。

## 结论：有条件通过（5 条真问题）

## 一、五审项核对

| 项 | 判定 | 证据 |
|---|---|---|
| R1 编号解析 | 已解决 | B10 (a) L1281：编号 Map 整串查表，`"3.0"/"+3"/"0x3"/"1e0"` 反例；§1.9 第 3 条 |
| R2 方法名黑名单 | 部分解决 | §2.8 L437-456 改为类型白名单、默认拒绝，方向对；但仍有绕法，见 P1、P2 |
| R3 E-TEXT-UNGATED | 部分解决 | L409、L416 pathTypes：只有 textPaths 内路径可为 string，运行时按类型拒写；补漏见 P4 |
| R4 aiGate 权限矛盾 | 已解决 | L416、L427、L454：aiGate 经 `gate.matchBlocklist`，字符集用码点表 `charset.<lang>.json`；S17 L1264 与权限表同口径。遗留 id 泄漏检查见 P3 |
| 小项 | 已解决 | E-GATE-FUZZY 独立码 L657；替换为整段替换记号 L426；casefold 表取代 toLowerCase（L450、L1454）；B10 (e) 已改 |

## 二、重点审查：§2.8 与 pathTypes 的绕法

| 绕法 | 结果 |
|---|---|
| `switch(text)` | 堵住（L443 明列） |
| `Map.get(text)`，Map 不由句柄构造 | 条款堵住（L441 "必须由句柄构造"），但缺判定细节，见 P1 |
| 模板字符串 `${x}`、`+` 拼接 | 堵住（L443） |
| `String(x)` | 堵住（视为 string 来源，且无同族句柄比较） |
| `JSON.stringify(x)` | 返回值按 string 处理，后续任何操作违例；但"原样传递"允许把 text 传给内建函数，见 P1 |
| 解构 `const {family}=st.dims` | 归因丢失 → E-VIEW-FAMILY-UNRESOLVED（L1222 补洞①），堵住 |
| `obj[text]`（计算属性读取） | **未堵**：L443 只列了 `in obj`、`Object.hasOwn`、`Set.has`，没有列"以 string 为键的成员访问"，见 P1 |

## 三、真问题

**P1　"原样传递"与 Map 来源的判定细节有漏（L441、L443）。**
(a) 原样传递没有限定接收方：`Array.from(text)`、`[...text]`、`for (const c of text)`、`const [a,b]=text`、`Object.keys(text)`、`JSON.stringify(text)`、`encodeURIComponent(text)` 都是"把字串传给函数/迭代"，不在违例清单里。须规定：传递目标只能是本仓库内已声明形参类型为 string 的函数、已声明类型为 ref/enum 的路径，传给内建函数、展开、迭代、解构一律违例。(b) 补写 `obj[text]` / `obj[k]`（k 为 string）的计算属性读写。(c) Map：写明"来源无法静态确定的 Map 一律按非句柄构造处理"，并禁止对该类 Map 调用 `.set(非句柄键)`（构造后冻结，或只允许冻结 Map）。

**P2　"类型归因"没有机器可用的类型来源（L443、S13 (a)）。**
规则层是无类型的 JS，纯 AST 无法对任意表达式判断"是 string"。"无法归因按 string 处理"在实践中要么大量误报（任何未归因的数值运算、`arr.length` 都被当 string 操作），要么扫描器被迫放松。须写明类型来源：对规则层启用 `checkJs` 的 TypeScript 检查器（JSDoc 类型），以编译器推断的 string 类型为准；无类型标注的导出函数参数视为失败。否则 §2.8 无法稳定判定。

**P3　aiGate 的"id 泄漏检查"在允许的操作集里无法实现（L427 对 L454）。**
L427 要求 aiGate 按代号格式检查 AI 文本里是否泄漏 id，这是对整段文本找"id 形态"的子串/模式查找；但 L454 aiGate 的闭集只有 matchBlocklist、`.length`、码点范围表、schema，且全卷禁正则。必须说明由谁、怎么做：例如由 gate 组 `matcher.mjs` 另导出 `matchIdShape(text) → {hit,start,end}`（逐码元扫描 `[a-z0-9_]` 连续段并核对前缀表，不用正则），并把它写进 gate 的闭集；aiGate 只调用。

**P4　pathTypes 的覆盖规则不完整（L409、L416）。**
(a) 未写"未在 pathTypes 中声明的路径一律拒写/加载失败"，否则漏登一条路径就漏过检查。(b) 示例 `textWriters` 只列了 displayNames 与 narration，`records.*.text` 与 `created.*.props.basis` 没有写者；须规定"textPaths 每条必有 textWriters"（缺则 E-WRITER-MISSING）。(c) `dimension` 类型路径的值若维度类型含 string，须声明维度类型集合不含 string（§1.5 已无 string，建议在此处引一句）。

**P5　input-view 迁移行与代码实际结构不符（L1193、L431 对 extension/input-view.mjs）。**
抽查代码：`inputForMode`（:1-4）用正则 `/^我说：“([\s\S]*)”$/` 与 `/^我准备/` 给玩家输入加"我说：/我准备"中文前缀；`prepareInput`（:5-8）读 `text==='我说：“”'`；`mountInput`（:9-32）是 DOM 挂载，快捷按钮的文本是整句中文（'我仔细观察周围。'、'我说：“你好。”'、'我想找个合适的地方休息。'）直接塞进聊天输入框。文件里**没有"规范化 + 查表 → 代号"部分**，迁移行写的"拆两份"在现实中无物可迁。更要紧的是：这个前缀协议就是下游自然语言解析的入口之一，属于必须删除的东西。迁移行应改为：删除 `inputForMode`/前缀协议与全部中文整句预设；预设按钮改为菜单项（动作代号 + labels 显示名）；`mountInput` 的 DOM 部分留 display 组并重写到"零字符串操作"（现含 `.length`、模板插值、`===`）；"规范化 + 查表"是 `server-plugin/input/` 的**新写**代码，不是迁移。

## 四、§2.7 权限表核对

- 判定与产出分开：通过（L419 定义，L421-428 两列分列；产出"不得回流 state、不得参与判定"）。
- labels 从不作 needle：通过，且设计可机器判定——gate 组"读 labels：否"，`matchBlocklist(text,lang)` 的 needle 只在内部取自 blocklist，调用方没有传 needle 的口子（L425），gate 组 import labels 即 E-VIEW-LABEL-READ。
- id 泄漏按代号格式判定：口径对，但实现手段缺，见 P3。
- 产出不回流：靠 import 图（规则层不得 import outputGate/display，L415）加 S19 的 outputGate 零 state 写入，足以判定。display 组写 state 的范围（只有 displayNames，经 writeText）建议在 S19 写明（小项）。

## 五、relation 与代码

- relation 族 `intimate: boolean`（L292、L432）：规则只读布尔字段，不读关系名，无专项规则；通过。
- input-view 代码核对：见 P5。

## 六、措辞小项（记账）

- aiGate 长度用 `.length` 是 UTF-16 码元数，与"字符数"口径不同；写明长度单位（码点数，经 charset.mjs 提供）。
- 权限表中 display 组的 "labels 查表按 id 键 `.get`" 与 §2.8 "Map 键必须由句柄构造" 的关系写一句：labels 是加载期冻结 Map，id 键来自 idIndex。
- L433、L434 两条哈希排除表描述重复，合并为一条。
- L220 行很长，B10 与第 3 条互引的位置建议拆成条目，便于卷十二逐条断言。

## 偏离指令之处

无。未提交 git。
