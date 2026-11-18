模型：claude-sonnet-5-5，中档（11-13 换 Opus 审查前的旧记录）（主会话 11-13 按运行记录补注）

# 卷二五审 B（第五版，1520 行）

静态阅读，未运行任何东西。

## 结论：有条件通过（有 4 条真问题，均为一两句话可补的口径）

## 一、四审项核对

| 项 | 判定 | 证据 |
|---|---|---|
| M1 屏蔽词校验与"只查键"矛盾 | 已解决 | L213 由 `tools/name-blocklist-check.mjs` 在 tools 组做，维度校验器仍只查键；L1213 S7 |
| M2 错误码表补项 | 已解决 | L618、L620-621、L628 补齐 E-I18N-BLOCKLIST、E-INPUT-*、E-TEXT-UNGATED、E-KERNEL-UPWARD-IMPORT、E-VIEW-FAMILY-*、-NAME-RESEED、-INPUT-IMPORT |
| M3 归因绕法 | 已解决 | L1222 三条补洞（无法归因即 E-VIEW-FAMILY-UNRESOLVED、禁 `V[...]` 与拼接、别名溯源含跨文件）；A16 L1202 全部写成夹具 |
| M4 inputEdge 扫描 | 已解决 | S18 L1228；S19 L1229 |
| S1 族字段 | 已解决 | L273 `terminal / incapacitating / suppressesAwake` 带首批赋值；L375 与 B14 L1257 要求实现里不出现任何族 id / 容器 id；B14 还加了"改词表夹具不改代码"的字段驱动验证 |

抽查 status_family：L273 的赋值是 `sfam_dead{terminal}`、`sfam_unconscious{incapacitating,suppressesAwake}`、`sfam_sleep{suppressesAwake}`，规则只读字段，不点名 id，符合要求。

新内容：aiGate/textPaths/writeText（L405-415）、三步命中算法（L416）、templates.mjs 单一登记、input-view 迁入 inputEdge（L414、L1156）、blocklist.<lang>.json 及迁移行（L1155）均已写明，五组文件级不相交（L414）。

## 二、真问题

**R1　S18 编号解析比条款宽（L1228 对 L218）。**
S18 允许 `Number.isInteger(Number(text))`。`Number("0x3")`、`"1e0"`、`"3.0"`、`"+3"`、`" 3 "` 都会得到整数，而 §1.9 与 B10 (i) 的口径是"十进制整数与当前菜单编号整串相等"。这是一个能"猜出编号"的小口子。改成：编号选择 = 对菜单编号字串表做**整串 `===` 查表**（候选编号表由菜单生成，键为十进制字串），不解析数字。

**R2　扫描禁令是方法名枚举，存在可绕过写法（L1221、L1229、L416）。**
S13 ② 是固定方法名单；S19 对 display 组宣称"禁一切字符串比较与查找方法"，S18 对 inputEdge 也是黑名单。可绕过且不在名单内的写法：`Set.has('x')`、`Map.get('x')`、`'x' in obj`、`Object.hasOwn`；对象字面量的**标识符键**（`{sleep:1}[x]`，键不是 StringLiteral，④ 看不到）；`<`、`>` 与 `sort` 比较器对字串排序；`slice/substring/split/replace/replaceAll/trim/charAt/at/codePointAt/Intl.Collator`；display 组里用 `a + ': ' + b` 拼接（S19 只报"模板字串拼接"，不报 `+`）。
建议：对 display、inputEdge、gate、outputGate 四组改成**白名单制**（只允许列出的 AST 节点与调用，其余一律失败）；规则层组把上面几类补进 ③④（has/get/in/hasOwn、对象标识符键、`+` 与字串比较运算符）。机器能判，但要写成封闭集合。

**R3　E-TEXT-UNGATED 的"存在 textPaths 之外的路径存自然语言"无法机器判定（L415）。**
扫描能查"无凭证写 textPaths"，但没有办法判定一个任意字串是不是自然语言。需要补一条可判定条款：state-owners 为每个非 textPaths 路径声明值类型（代号/数值/哈希…），运行时与存档校验按类型检查：字串值必须匹配代号正则且在对应词表族内；不合即拒写。这样"自然语言只能在 textPaths"就有机器依据。

**R4　aiGate 的文字比对权限与屏蔽词归属自相矛盾（L415、L416、L1227、L1155）。**
L415 要求 AI 输出先过 aiGate 的"屏蔽词、长度、字符集"守门；L416 却规定"仅 gate 与 outputGate 两组允许比对文字"，S17 又说"server-plugin 内只有 outputGate 组读 blocklist"，L1155 写"gate / outputGate 组读"。字符集检查按卷内规则还不许用正则。需统一：aiGate 经调用 `gate` 组的唯一匹配函数完成屏蔽词与字符集判定（字符集用码点范围表而非正则），或把 aiGate 明确加入 L416 的例外并改 S17、L1155 为同一口径。

## 三、措辞小项（记账）

- 闸内命中后的"替换"若指整名替换为 labels 替代形态则无需切片；L416 补一句"替换为整体替代形态，不做子串改写"，以免与"indexOf 之外不许用其他字符串方法"冲突。
- S19 以"同码复用 E-INPUT-FUZZY"报告 gate/outputGate 违规，建议给独立码 E-GATE-FUZZY。
- S18 的"简单大小写折叠"实现为 `toLowerCase`，与 Unicode simple case folding 在个别字符（土耳其 İ、希腊词尾 ς）上不同；写明以 `toLowerCase` 为准并给一条夹具。
- B10 (e) 的"显示名相同"应写成"规范化后相同"；菜单项显示名恰为数字时与编号冲突的处理未写。
- 基线数 219/74/26 在 L1224 齐全；S13 里"extension 26"建议在 S19 显示层再写一次目标 0。

## 偏离指令之处

无。未提交 git。
