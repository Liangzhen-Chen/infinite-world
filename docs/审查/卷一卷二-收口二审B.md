模型：claude-opus-5-5，中档（主会话 11-13 按运行记录补注）

# 卷一卷二 收口二审 B（只核对）

审查对象：卷二第十三版（`卷二-维度表规范与统一入口.md`，2215 行）、卷一第十一版（`卷一-总纲与分层.md`，924 行）。对照：`审查/卷一卷二-收口一审B.md`（B2-1…B2-26、B1-1…B1-15）、`审查/卷一卷二-收口改稿裁定.md`、主会话转达的李白"引文同一性"裁定原文。本机只做静态读，未运行任何脚本。

按轮次规矩，本轮不收新发现；第四节只记"本版改动引出的矛盾"。

## 结论

- 一审 B 共 41 条：**已改好 39 条，未改好 2 条**（B2-5 残留、B1-10 两卷相反）。
- 引文同一性：**条文与原裁定逐项相符**，单点定义与例外清单都在卷二 §2.9 第 6 条，各引用处只是引用；但**机制上有两处没闭合**（见四、N1、N2），不改则"只比本轮原文""needle 不得取 labels"都能被绕过。
- 三问：装配文件**不算越界，但要补扫描与闭集**；DigestCap 注入**自洽**；`playerNotes.*.text` 不进哈希**口径成立**，但卷一没跟、`noteId` 来路未定义。
- 改动引出的新矛盾 **9 条**（N1–N9）。其中 N3、N5、N6 同一根源：卷一附录丙的对账是对卷二第十二版快照跑的（卷一 L924），没有对第十三版复跑。

---

## 一、一审 B 各条核对

### 卷二（B2）

| 条 | 结论 | 落点（卷二第十三版行号） | 说明 |
|---|---|---|---|
| B2-1 宿主能力经属性可达 | 改好 | L639、L664（三道判定）、L569（删"字面量赋值"例外） | 只有 bootstrap 有 DOM lib 与 ST shim，其余靠类型挡住 |
| B2-2 import 目标在矩阵外 | 改好 | L503–L512 矩阵末列、L523"import 说明符是闭集"、L685 JSON import、L805 磁盘清单含 import 目标、L618 tools 离线 | |
| B2-3 其他断言形式 | 改好 | L556（谓词、asserts、overload、尖括号、非空断言；声明文件闭集） | |
| B2-4 kernel 是自由区 | 改好 | L553（`kernel/files.json` 闭集、受 S13 ①③④）、L564、L1663 | |
| B2-5 kernelApi 不全、通配 | **未改好（残留）** | L444–L489 已改为逐个导出名、补齐 V/E、声明函数、sample、entityId | 新增的 `kernel/storage.mjs#readPath` / `#writePath`（L456–L457，callers rules、acceptsState true）全卷再无定义：路径实参是否必须是静态字面量类型、写入是否核对 writers 表都没写。B2-5 要堵的"经存储函数绕过 readers/writers 与 declareInputs"仍然敞着，L384 的按类型收集只管取回值之后的读，管不到 `readPath(state, p)` 这一步读的是哪条路径。建议：删掉这两个导出，或把路径参数定为 kernel 生成的字面量参数化品牌 `StatePath<P>`，叶子核对把 `P` 计入读取集，`writePath` 运行期按 `stateKeys.writers` 核对调用方 |
| B2-6 凭证与 scope 绑定 | 改好 | L768、L478–L481（scope 常量 callerFiles）、L736 | |
| B2-7 seal 算不出摘要 | 改好 | L658、L654、L765 | 见三问第 2 问 |
| B2-8 两进程 | 改好 | L605–L659（第 0 条全文）、L609 路径写法 | |
| B2-9 AI 调用路径 | 改好（卷二侧） | L659、L653、L655、L676、L1694 | 卷一侧见 B1-10 |
| B2-10 表外写出与玩家自由文字 | 改好 | L714、L421、L491–L493、L525 登记门槛、L1596 | 新 textPath 引出的问题见 N3、N8 |
| B2-11 响应序列化 | 改好 | L631、L707 | |
| B2-12 文件级迁移 | 改好 | L1578–L1599 | 迁移表 L1597 一行引出 N7 |
| B2-13 legacy 目录 | 改好 | L443、L810 | 卷一 R-8 L355 仍写"legacy/compat/migrations 的 import 只来自 storage 与 index 迁移入口"，与卷二"不得新增 import、G-1 前删空"不冲突（现存 import 允许到删空为止），记小项 |
| B2-14 内建闭集缺项 | 改好 | L364（getter 取代 Proxy）、L657、L666 | |
| B2-15 string 维度 | 改好 | L172、L525；卷一 L442 已同步 | |
| B2-16 屏蔽词类别 | 改好 | L815、L230 `blocklist_category` 族 | |
| B2-17 规范化步骤编号 | 改好 | L814"规范化两步 = ① 与 ③"，L696、L761 一致 | |
| B2-18 matchIdLeak 范围 | 改好 | L816（运行期增量登记、排除代码内封闭枚举）；卷一 L235 引用 | |
| B2-19 `E.<code>` 写不出 | 改好 | L1011（连字符→下划线）、L1665 | |
| B2-20 S13 内部矛盾 | 改好 | L1664（tsc + typescript-eslint）、L1665 (b) 名单 | |
| B2-21 S10 常数绕过 | 改好 | L1659 | 与卷一 R-6 的口径差异见 N9 |
| B2-22 state 读取按名判定 | 改好 | L384 | readPath 一处见 B2-5 |
| B2-23 host→gate | 改好 | L523；卷一 L382、V-31 L733 只引矩阵 | |
| B2-24 起名依赖语言、事务时机 | 改好 | L777–L784（全部已发布语言词表、独立事务、复演不重跑） | |
| B2-25 裸 string | 改好 | L554 | |
| B2-26 扫描器位置 | 改好 | L435、L616、L682；卷一 L382 | |

### 卷一（B1）

| 条 | 结论 | 落点（卷一第十一版行号） | 说明 |
|---|---|---|---|
| B1-1 凭证签发者 | 改好 | L233、L237、V-29 L732、C-6 L818、C-9 L822 | |
| B1-2 Sealed 构造者 | 改好 | L388 | |
| B1-3 哈希口径 | 改好 | §8.3 L609–L615、V-13 L743、C-10 L823 | 只剩 playerNotes 未跟，见 N3 |
| B1-4 屏蔽词格式归属 | 改好 | L153、C-7 L819、V-22 L747 | |
| B1-5 显示闸代号 | 改好 | L243、I49 L646、V-25 L731、术语 L778 | |
| B1-6 菜单显示名唯一性 | 改好 | L153、L259、I47 L644、V-22 L747 | |
| B1-7 规则层含不含第〇层 | 改好 | L108、R-2 第 1 条 L286、术语 L774 | |
| B1-8 第〇层成员路径 | 改好 | L140、L474、G-2 L524 | |
| B1-9 projection 同名 | 改好 | L206 | |
| B1-10 AI-R1 与注入防线 | **未改好** | R1 路径 L265 已改 | 卷一 L263 写"隔离与剥离（分隔符、角色标记、工具调用指令的剥离）在 aiGate 完成……aiGate 为此允许哪些操作，唯一定义在卷二 §2.8 aiGate 行"；卷二 L659 写"aiGate **不做剥离改写**"，§2.8 aiGate 行 L572 也没有任何剥离操作。两卷相反。建议卷一 L263 改为引用卷二 L659 的做法（玩家文字只放进 schema 独立字段、不拼进指令段、不剥离），L128、L249、L384、C-4 的"注入防线"只写位置 |
| B1-11 inputEdge import 集合 | 改好 | L261、I48 L645、V-23 L729 | |
| B1-12 host→gate | 改好 | L382、V-31 L733 | |
| B1-13 句柄族名 | 改好 | L363–L364 | |
| B1-14 JS 语言记号 | 改好 | L363 末句 | |
| B1-15 未跟上卷二十一、十二版 | 改好（就原条范围） | 附录乙第二表 L849–L871、第三表 L873–L896、§4.5 L448 | 但卷一整体只对到卷二第十二版（L3、L924），对第十三版的不同步见 N3、N5、N6 |

---

## 二、引文同一性：与李白原裁定逐项核对

单点定义：卷二 §2.9 第 6 条 L818–L831（例外清单 L818–L824，定义 L826–L831）。

| 裁定要求 | 卷二落点 | 结论 |
|---|---|---|
| aiGate 新增第三种允许的文字检查 | L818–L824 例外清单恰三项，第三项在 aiGate（`ai-gate/quote-identity.mjs`） | 相符 |
| 只判断引文是否本轮 RawText 的连续子串 | L824、L827 | 相符（来路的机器保证见 N2） |
| 两边先按与 inputEdge 相同的规范化 | L828：§1.9 第 3 条 ①②③，按同序调 ops 的 `nfc`、`trimByTable`、`mapCodePoints`，与 inputEdge L567 相同 | 相符 |
| 再逐码点比对 | L828：gate `matcher.mjs` 的 `containsCodePoints` 逐码点连续子串 | 相符（该导出的可绕性见 N1） |
| 禁止模糊、语义、关键词、正则、分词 | L829（另加编辑距离、忽略标点空白） | 相符 |
| 只输出固定代号 `reject:quote_mismatch` | L824、L830 | 相符 |
| 不写状态、不进哈希 | L830 | 相符 |
| 规则层不得 import | L831（且规则层本就不得 import aiGate） | 相符 |
| 卷二单点定义处写一次，并列入例外清单 | L818 起的清单与 L826 起的定义，标"唯一定义" | 相符 |
| 其他卷只引用 | 卷一无任何引文同一性条文（未另写）；但卷一 V-29 等处仍把 aiGate 的判定列成两项，见 N6 | 未另写一遍；有不同步 |

各引用处逐个核对：

| 引用处 | 内容 | 是否只引用 |
|---|---|---|
| §2.7 L530 | "另有第三项……定义、两端来历与清单只在 §2.9 第 6 条，本表只引用" | 是 |
| §2.7 L539 | aiGate 行"调 `matchQuote`……算法与输出代号见 §2.9 第 6 条，此处引用" | 是 |
| §2.8 L570 | gate 行"另导出 `containsCodePoints`，只供 aiGate 的引文同一性检查调用，同条" | 是（但"只供"无机器登记，见 N1） |
| §2.8 L572 | aiGate 行写出 `quote-identity.mjs` 内的调用顺序（三个 ops 函数再调 `containsCodePoints`） | 基本是：这是 §2.8 各组闭集本来要列的操作，重述了调用顺序但没有另定算法，可接受，记小项 1 |
| S18 L1671 | E-INPUT-NORMALIZE-SCATTER 的登记例外指向 §2.9 第 6 条 | 是 |
| S19 L1672 | "允许的文字比对只有……三项"，`matchQuote` 只在该文件定义、只被 aiGate 调用 | 是 |
| B10 (g) L1694 | 三种改坏引文全拒、原样摘出的一段通过（含大小写与首尾空白差异） | 是，夹具与定义一致 |

结论：**条文符合裁定，引用处没有另写一遍**。但 N1、N2 两处让"只比本轮原文""不得拿 labels 当 needle"落不到机器上，建议主会话在定稿前一并改掉。

---

## 三、卷二作者请核的三件事（我的判断，由主会话裁定）

### 第 1 问：`server-plugin/index.mjs` 登记为"装配文件"、不算模块组，是否越界

判断：**不算越界，但现在的写法机器管不住**。

- 不越界的理由：收口裁定第 1 条把 host 放到客户端后，服务端仍需要一个文件接 SillyTavern 传入的 `router`（现行 index.mjs 即如此）。它与客户端 bootstrap 是对称角色，单列一个文件、有自己的矩阵行（L512）、白名单行（L677）、§2.8 行（L573），并且让 G4"删输入边"可以逐字节核对（L638、L1706），这比动态 `import()` 好。它没有新增任何读语言或写状态的能力。
- 要补的两处（列为新矛盾 N8）：
  1. 没有任何验收扫描覆盖它：S13 规则层组把它排除（L1663），S19 只列 outputGate/gate/display/aiGate 与若干全局项（L1672），§2.8 L573 说它"零字符串操作、零 state 读写"，却没有哪条 S 去数。
  2. 矩阵 L512 规则层一格写"仅各系统的登记函数"，不是名字闭集；L499 说括号内的名字须在 kernelApi 或"被调用组导出表"里，而全卷没有"被调用组导出表"这份数据，所以脚本第 23 项对 `mountOutput`、`mountAi`、`mountInput`、`createDigestCap` 以及 N1 的 `containsCodePoints` 都核不了。

### 第 2 问：kernel 经注入 `DigestCap` 取摘要能力，`node:crypto` 只在服务端 textcore，是否自洽

判断：**自洽**。

- import 方向：`node:crypto` 只在 `textcore/digest.mjs`（L507、L658、L672）；kernel 行无 `node:crypto`（L505、L671）；kernel 不 import textcore（L523）。DigestCap 由装配文件经 `createDigestCap` 取得后交 `mountKernel`（L512、L654），是运行期注入，不形成 import 环。
- 用途一致：`makeSealed` 复核（L749）、读档重算（L765）、存档哈希（L654）三处都用注入的同一能力；"注入之前调用即启动失败"（L765）可由启动顺序机判。
- 与裁定第 4 条一致：服务端算、客户端只用 SubtleCrypto 核对（L647、L658）。
- 小项：DigestCap、WallTimerCap、RequestCap、ReplyCap 的类型不在 L718–L723 的五份声明文件里。kernel 侧可用文件内 JSDoc `@typedef` 写结构类型解决，不必新增声明文件，但应写明一句，免得实现时为了类型去 import textcore（小项 3）。

### 第 3 问：新增 textPath `playerNotes.*.text`，与 displayNames 一样不进哈希

判断：**卷二内部口径成立，但有两处没收尾**。

- 成立的理由：L525 的登记门槛四样都齐（textPaths L491、textWriters L492、pathTypes `sealed` L493、scope 常量只开放给 `note-gate.mjs` L481）；L525 写明"只有玩家自己键入、与世界演化无关的文字才可不进"，playerNotes 符合；readers 为空（L421），规则层读不到；`note_intent` 事件本身在事件日志里、照常进哈希；排除表 L546、L776 已加入。这与 displayNames 的理由相同，也让哈希不随词表版本变化。
- 没收尾一：`noteId` 是什么、由谁生成没有定义，kernel 也没有像起名那样核对目标路径，见 **N4**。
- 没收尾二：卷一全部相关处仍按"只有 displayNames"写，见 **N3**。

---

## 四、本版改动引出的新矛盾（9 条）

### N1 `containsCodePoints` 是一个对外开放的通用子串函数，"只供引文检查调用"没有机器登记（机制性漏洞，类 7）
- 位置：卷二 L570（gate 行"另导出 `containsCodePoints`，只供 aiGate 的引文同一性检查调用"）、L828；矩阵 L510、L511（outputGate、aiGate 对 gate 的授权按文件给 `matcher.mjs`，不按导出名）；S19 L1672（只核 `matchQuote` 的调用者）。
- 问题：以前 matcher 的两个导出 needle 都在内部取自 blocklist 或代号登记表，调用方给不了 needle；现在 `containsCodePoints(haystack, needle)` 的 needle 由调用方传入。outputGate 与 aiGate 的任一文件都合法 import `matcher.mjs`，都拿得到 labels 或 AI 文字（类型都是 `Text`），于是 `containsCodePoints(text, labelOf(x))` 就是拿 labels 当 needle 的关键词匹配。L543"labels 永远不得作为 needle"与 S19"任何组以 labels 条目为 needle"都没有判据能抓到这次调用。
- 建议：把 gate 的导出也写成带 `callerFiles` 的闭集（与 kernelApi 同格式，正好补上 L499 所说的"被调用组导出表"），`containsCodePoints` 只开放给 `ai-gate/quote-identity.mjs`；S19 加一句"`containsCodePoints` 在该文件之外被调用 = 0"。或者干脆把 `matchQuote` 的子串一步做成 matcher 内部函数，不对外导出通用版。

### N2 引文检查的"本轮原文"在类型上和来路上都没有闭合（机制性漏洞 / 自相矛盾，类 7、5）
- 位置：卷二 L824、L828（`matchQuote(quote: Text, turnText: Text)`）、L831（本轮原文由 `interpret(text, candidates)` 的实参传入）、L659（`interpret` 返回的只能是候选集里的代号）。
- 问题：
  - 类型：`turnText` 是普通 `Text`，aiGate 里任何 `Text`（例如 AI 自己的输出经 `parse.mjs` brand 后的文字）都能传进去，`matchQuote(q, q)` 恒通过。"入口收到的那一份、未经改写"只是文字说明，机器判不了。
  - 来路：唯一写明的来路是 `interpret`，而 L659 规定 `interpret` 的 AI 输出只有代号，没有引文字段；带"引用玩家原话"的输出更可能出现在叙述（R2）里，叙述的写者 `narration-gate.mjs` 拿不到本轮原文。所以按现文，这项检查要么没有对象，要么拿不到合法的 haystack。
- 建议：定一个只由 `input/http-entry.mjs` 产出的品牌 `TurnText`（每次请求一份，一次性），`matchQuote` 的第二参改为 `TurnText`；写明哪些 AI 输出 schema 带引文字段（归卷九），以及 `TurnText` 怎样随同一轮请求交到对应的 aiGate 写者，不经任何存储。

### N3 卷一没跟上 `playerNotes`：textPaths、display 集合、哈希排除表三处口径与卷二不同（接口对不上，类 4）
- 位置：卷一 L233（textPaths"现行 `displayNames.*.text`、`narration.*`、`records.*.text`"）、L367 与 L442（display 集合"现行只有 / 只登记 `displayNames.*.text`"）、§8.3 L613（"只有两样……排除表 = display ∪ `displayNames.*`"）、I40 L637、V-4 L739、术语表 L793、C-10 L823、附录乙 L867；对照卷二 L491、L546、L776（排除表 = display ∪ `displayNames.*` ∪ `playerNotes.*`）。
- 问题：E-DIGEST-EXCLUDE-DRIFT 的生成规则在两卷里输入不同（卷一少 `playerNotes.*` 中 `text` 以外的字段），按卷一写的生成器与按卷二写的会得出不同排除表；V-4 的"diff 为空"按哪卷判结论相反。
- 建议：卷一以上各处改为只引用卷二 §2.9 第 3 条，不再手写排除表的组成。

### N4 `playerNotes.<noteId>` 的 `noteId` 来路与类型未定义（缺维度，类 1）
- 位置：卷二 L774、L784（`note_intent {noteId, slotCode}`、目标 `playerNotes.<noteId>.text`）；实体前缀表 L228；`NamingIntent` 的核对 L750、L782。
- 问题：`noteId` 不是 22 类实体之一，前缀表里没有它的前缀；起名有"`NamingIntent` 的 `targetId` 与目标路径一致"这一核对，手记没有对应的意图类型与核对（L784 只说"换成 `note_intent`"）。于是 `note-gate.mjs` 写哪条路径没有被 kernel 卡住，同一凭证能否写到别人的笔记也无从核对。
- 建议：写明 `noteId` 由 kernel 按种子键生成（登记前缀，或作为某实体 id 下的子键），并给出 `NoteIntent`（或把 `NamingIntent` 泛化为 `TextIntent<P>`），核对内容与起名相同。

### N5 卷一说 display 也 import 服务端 `textcore/labels.mjs`（两卷冲突，类 4）
- 位置：卷一 L153"运行期读语言包的只有 textcore 共享库的 `textcore/labels.mjs`（display 与 inputEdge 都 import 它）"；对照卷二 L535（display 不读 labels，客户端没有 labels）、L760（客户端只能 import clientTextcore）、L618（进程之间没有 import）。
- 建议：卷一改为"outputGate 与 inputEdge"，并只引卷二 §2.9 第 2 条。

### N6 卷一仍把 aiGate 的文字判定写成两项（两卷冲突，类 4）
- 位置：卷一 V-29 L732"判定只调用 gate 的 `matchBlocklist` 与 `matchIdLeak`"、L235"做法"、L805"卷二需确认：无（aiGate 比对文字一项……`matchBlocklist` / `matchIdLeak`）"；对照卷二 L818–L824 例外清单三项。
- 问题：按卷一 V-29 写的扫描会把 `quote-identity.mjs` 对 `containsCodePoints` 的调用判违例。这也违反裁定"其他卷只引用"的精神：卷一在这里列了清单而不是引用。
- 建议：卷一三处改为"aiGate 允许的文字检查以卷二 §2.9 第 6 条例外清单为准"。

### N7 发给 AI 的提示文字从 outputGate 到 aiGate 没有合法通路（接口对不上 / 自相矛盾，类 4、5）
- 位置：卷二 §6.11 L1597（提示模板"由 outputGate 拼装后经 `ai-gate/prompt.mjs` 发出"）、出口表 L709（prompt 的输入含"场景卡、叙述投影"的 `Screened<Text>`）；矩阵 L510、L511（outputGate 与 aiGate 互不 import）；权限表 L539（aiGate 不读 labels）、L766（`unseal` 只有 outputGate）。
- 问题：场景卡、提示模板要 labels，旧叙述与玩家手记要 `unseal`，这两件 aiGate 都不能做，只有 outputGate 能做；而两组之间既无 import 也无登记的能力对象传递。按现文，`prompt.mjs` 拿不到它要发的文字。
- 建议：二选一写明：在矩阵里给 aiGate→outputGate 开一个具名接口（如 `renderPrompt(view): Screened<Text>`），或由装配文件把 outputGate 的提示拼装函数以能力对象注入 `prompt.mjs`；同时更新 L1597 与出口表 L709。

### N8 装配文件没有验收扫描，矩阵规则层一格不是闭集；非 kernel 组的导出没有机读登记（机制性漏洞，类 7）
- 位置：卷二 L512、L573、L499（"被调用组导出表"）、L1663、L1672；第 1 问详述。
- 建议：S19（或新 S 条）加装配文件一项：只含 import 语句与挂接函数调用、零字符串操作、零 state 读写，`assembly:optional` 两行删后其余逐字节不变；矩阵 L512 规则层一格改成具体名字的闭集；新增各非 kernel 组的导出表（导出名 + callerFiles），供脚本第 23 项与 N1 共用。

### N9 S10 自称"与卷一 R-6 口径相同"，实际数组下标的豁免范围不同（自相矛盾，类 5）
- 位置：卷二 L1659"数组下标不计"（任意值）；卷一 R-6 L333 白名单只有"用作数组下标的 `0 / 1 / -1`，用作长度比较的 `0 / 1`"。
- 问题：`arr[5]` 按卷二不计、按卷一计入，同一扫描在两卷下结论不同；卷二又写了"口径与卷一 R-6 相同"。
- 建议：以一卷为准（卷一 R-6 写"卷二不得扩"，按它就应删掉卷二的"数组下标不计"或改成与卷一相同的三个值），另一卷改为引用。

---

## 五、小项（只记账）

1. 卷二 §2.8 aiGate 行 L572 重述了引文检查的调用顺序；属该组闭集所需，可保留，但建议末尾加"顺序以 §2.9 第 6 条为准"。
2. 卷二 L720、L721 写"服务端五个非规则组"，L725 定义服务端非规则组为四个（inputEdge、gate、outputGate、aiGate）；计数不一。
3. DigestCap、WallTimerCap、RequestCap、ReplyCap 的类型不在五份声明文件内，宜写明由各自文件的 JSDoc `@typedef` 给出结构类型，kernel 不得为取类型 import textcore。
4. `reject:quote_mismatch` 是裁定点名的固定代号，但 L815 又说"本卷不定代号名"（拒收代号归卷九）；宜在卷九拒收代号集登记它，并在 L815 注明这一条是裁定指定的例外。
5. 卷一 C-4 L816 与 L224 写 display ="`extension/**` 中除 `extension/host/**` 之外的文件"，少了卷二 L434 的 `!extension/textcore/**`。
6. 卷一 V-21 L745 仍写"迁入的 `input/input-view.mjs`""`extension/input-view.mjs` 的 DOM 挂载半边留下"，与卷二 L1575（DOM 部分删除、输入框归 `InputCap`）以及 G4 删装配文件两行的口径不一致；卷一记账栏已登记前一半。
7. 卷一 §8.3 L612 仍以 `storage.mjs:14 digest()` 作为哈希算法出处；第十三版后应指向 kernel 用注入 DigestCap 计算。
8. 卷一 R-8 L355 的 legacy import 判据与卷二 L810 写法不同（见 B2-13 说明），删空之后自然一致，记账即可。
9. 卷一 L3、L924 写"与卷二第十二版对齐"，对账脚本对第十二版快照运行；第十三版定稿后须复跑附录丙，N3、N5、N6 即由此漏出。
