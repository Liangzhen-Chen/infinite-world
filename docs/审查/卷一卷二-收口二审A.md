模型：claude-opus-5-5，中档（主会话 11-13 按运行记录补注）

# 卷一卷二 收口二审 A

审查对象：卷二第十三版（`卷二-维度表规范与统一入口.md`，2215 行）、卷一第十一版（`卷一-总纲与分层.md`，924 行）。
依据：`审查/卷一卷二-收口一审A.md`（A2-1…A2-15、A1-1…A1-11）、`审查/卷一卷二-收口改稿裁定.md`（7 条）、`全书概念台账.md`（N-06、X-04、X-18 行）。
方式：只做静态阅读，没有运行任何脚本。对账脚本的数字不再复核。按第二轮规矩，本轮只核对一审已列的问题，以及这次改动引出的新矛盾，不收新发现。

结论：一审 A 的 26 条真问题全部改好，未改好 0 条。改动引出的新矛盾 7 条，其中 N1 最重要。收口裁定 7 条都已落实。

---

## 一、一审 A 逐条核对

### 卷二（15 条，全部已改好）

| 条 | 判定 | 落实位置（卷二行号） | 说明 |
|---|---|---|---|
| A2-1 两进程架构 | 已改好 | L605–659（第 0 条）；L433–442（各组 `process`、`assembly`、`clientTextcore`）；L501–523（两张矩阵）；L662–715（白名单、入口表、出口表、host 组） | dom-sink 已移到客户端（L708）；信封机制补上了跨进程的类型链条（L629–636）；SillyTavern 宿主 API 和 router 都已登记（L519、L652、L679）；`index.mjs` 归为装配文件（L442、L638）。改后另有一处缺口，见新矛盾 N1 |
| A2-2 闭集缺项 | 已改好 | L653、L657（`WallTimerCap`、超时时长取规则表）；L671、L679（定时器所在行）；L364（不用 `Proxy`，改为 `defineProperty` 惰性取值）；L505、L671（`node:url`） | B10(g) 的写法见 L1694 |
| A2-3 产出 `Text` 需要强转 | 已改好 | L565（textcore `ops.mjs` 六个函数）；L745（豁免表 `ops.mjs` 行）；L567、L570–571（inputEdge、gate、outputGate 只调用 ops） | |
| A2-4 kernelApi 清单 | 已改好 | L444–489（结构化写法，逐个导出名，带 `callers`/`callerFiles`/`acceptsState`，无通配）；L499（矩阵名须在清单内，脚本第 23 项） | 一审点名的缺项都已补齐；括号中文的问题见小项 4 |
| A2-5 声明文件与可见组 | 已改好 | L552、L718–724（五份声明文件；规则层的 tsconfig 不引用 `text-types.d.ts`） | 措辞见小项 2 |
| A2-6 屏蔽词表类别与规范化 | 已改好 | L814–815（`{word, category}`、规范化两步 ①③）；L696；L230（`blocklist_category` 族） | |
| A2-7 seal 无法计算 sha256 | 已改好 | L507、L672（`node:crypto` 只在 `textcore/digest.mjs`）；L658；L765（kernel 用注入的 `DigestCap` 核对）；L193（`struct:sealed` 注明不属于 14 种类型） | 保留了 `makeSealed(bytes, digest)` 加重算的写法，按裁定第 4 条可以接受 |
| A2-8 起名路径 | 已改好 | L777–784（规则层只发意图事件；`NamingIntent` 只能用一次；对全部已发布语言的词表筛查；只写 `displayNames` 的独立事务；复演时不重跑守门）；L737、L752 | |
| A2-9 输入边可删 | 已改好 | L638（`// assembly:optional inputEdge` 机读标记）；L512；L1706（G4） | |
| A2-10 `created.*.props.*` 的 string 维度 | 已改好 | L172；L525（dimension 路径排除 string 维度，E-TEXT-UNGATED） | |
| A2-11 kernel/textcore 字符串闭集 | 已改好 | L553（"kernel 不是自由区"）；L564–566；L1663（S13 纳入 kernel 与共享库组）；L1665（(b) 条现在能生效） | |
| A2-12 错误码区 | 已改好 | L1011（区以 §4.3 表为准） | |
| A2-13 `redacted` 代号 | 已改好 | L230（`ui_token` 族，条目 `uitok_redacted`）；L538；L817 | |
| A2-14 长度上限 | 已改好 | L525（`rules.i18n.textMaxCodePoints.<textPath>`）；L572；L1672（S19 按 S10 的常量折叠口径计） | |
| A2-15 文字槽位形态 | 已改好 | L241（`{filled:true}`）；L778–779 | |

### 卷一（11 条，全部已改好）

| 条 | 判定 | 落实位置（卷一行号） | 说明 |
|---|---|---|---|
| A1-1 未跟进卷二第十一、十二版 | 已改好（对第十二版） | L849–871（附录乙第二表按第十二版附录 F 重写）；L873–896（第三表） | 卷二第十三版新增的口径（附录 F #9、#15）在卷一没有落点，记为新矛盾 N2、N6 |
| A1-2 凭证签发方 | 已改好 | L233、L237–238、L384、L732（V-29）、L818（C-6） | "display 签发"的说法已全部删除 |
| A1-3 屏蔽词归属与格式 | 已改好 | L153、L819（C-7）、L747（V-22） | 数据归卷二十九，格式与算法归卷二 §2.9 第 6 条；卷一不再写条目格式 |
| A1-4 哈希口径 | 已改好（对第十二版） | L611–615、L637（I40）、L739（V-4）、L743（V-13）、L793、L823（C-10） | 已改为只有一种存档哈希；但排除表少了 `playerNotes.*`，见 N2 |
| A1-5 显示闸 `block` | 已改好 | L243、L646（I49）、L731（V-25）、L778 | 改为引用卷二 `gate_verdict`；不再改用 T0 模板 |
| A1-6 输入边的 import 范围；谁把点选变成代号 | 已改好 | L124（L-9）、L218、L261、L645（I48）、L729（V-23） | |
| A1-7 kernel 行说法过时 | 已改好 | L388 | |
| A1-8 句柄写法；JS 语言记号 | 已改好 | L363–365 | 句柄写法改为 `V.status_family.sfam_sleep`、`V.verb.verb_transfer`；"JS 语言记号"一条已删除 |
| A1-9 G-2 引用不存在的条款 | 已改好 | L524 | |
| A1-10 偏离行的 string 维度 | 已改好 | L442、L613 | |
| A1-11 菜单显示名折叠后重复 | 已改好 | L153、L259、L644（I47）、L747（V-22）、L748（V-26） | 统一为运行期返回 `ambiguous` |

---

## 二、改动引出的新矛盾（7 条）

### N1【接口对不上（4）｜最重要】菜单路由和输入路由都收不到下行出口，两进程通道没有闭合
- **位置**：卷二 L623–625（通道表：上行 `menu` 由 `kernel/transport/menu-entry.mjs` 接收，`input` 由 `input/http-entry.mjs` 接收；两者的响应都只能经 `output-gate/envelope-exit.mjs` 发出）；L652（`ReplyCap` 只交给 envelope-exit 和 `kernel/save.mjs`）；L505（kernel 行只能 import 自身）；L508（inputEdge 行的 outputGate 列为空）；L473（`submitProposal` 只有 inputEdge 能调用）；L573、L638（装配文件只挂接，不做判定）；L783（"inputEdge 把它放进响应"）。
- **证据**：
  - 菜单请求进了 kernel。kernel 不得 import outputGate，下行载荷里的文字字段又是 `Screened<Text>`，kernel 看不到这个类型（L721）。所以 kernel 既造不出响应，也调不到 `respond`。
  - 输入请求进了 inputEdge，矩阵禁止 inputEdge import outputGate，可 L783 要求 inputEdge 把拒收代号"放进响应"。
  - outputGate 能造响应，但它拿不到请求，也提交不了提案。
  - 全书没有写"一个请求的处理结果怎样交到 envelope-exit"。
- **建议**：在 §2.9 第 0 条写明请求与响应的编排者，二选一。
  1. 由 outputGate 挂路由：`mountOutput` 拿到 `RequestCap` 后，把请求体交给 kernel 的入口函数，拿回代号结构，再自己拼装响应。kernelApi 的 callers 要给 outputGate 开相应条目；input 路由同理，由 outputGate 调用 inputEdge。这样矩阵要补 outputGate → inputEdge。
  2. 装配文件把 outputGate 的 `respond` 包成一个"只收代号结构"的能力对象，注入两个入口；文字统一由 outputGate 按代号去拼。
- **卷一**：卷一引用了通道模型（L72、L83、L220），由卷二修改即可。

### N2【两卷冲突（4）】哈希排除表少了 `playerNotes.*`
- **位置**：卷二 L546、L776，附录 F #15（L2157）：排除表 = `display` ∪ `displayNames.*` ∪ `playerNotes.*`。卷一 L613（"只有两样"）、L637（I40）、L739（V-4）、L793（术语）、L823（C-10）、L867（附录乙第二表 #15），排除表都只有 `display` ∪ `displayNames.*`。卷一 L233 列出的 textPaths 也没有 `playerNotes.*.text`，全卷没有提到 `admitNote`。
- **问题**：
  - 按卷一手写的 `digest-exclude.json`，与卷二的生成结果一比就报 E-DIGEST-EXCLUDE-DRIFT。I40 和 V-4 要求"diff 为空"，这一条按构造就不成立。
  - "玩家手记不进哈希"在卷一也没有落点。
- **建议**：卷一以上各处改为只引用卷二 §2.9 第 3 条，不再手抄排除表的组成；第一道闸的范围补上玩家手记。

### N3【两卷冲突（4）】语言包的读者写成了 display
- **位置**：卷一 L153："`textcore/labels.mjs`（display 与 inputEdge 都 import 它）"。卷二 L535：display 读 labels"否"，客户端没有 labels；L761：labels 由 outputGate 和 inputEdge import；附录 F #12（L2154）："客户端 display 不读 labels"。
- **问题**：display 在客户端，服务端的 textcore 跨进程 import 不到（E-PROC-IMPORT）。
- **建议**：改为"outputGate 与 inputEdge"，或者只引用卷二 §2.7 权限表。

### N4【两卷冲突（4）】`Text` 的可见组和构造者
- **位置**：卷一 L89（"Text 只由 textcore 构造（服务端版 / 客户端版各一份）"）；L388、L390（"`Text` 只对六个非规则组可见"，包括 display 和 host）；L869（附录乙第二表 #17，同上）。卷二 L730：`Text` 的可见组是 textcore 和服务端的非规则组；L733、L762：客户端版只产出 `Envelope` 和客户端的 `Screened<Text>`，不构造 `Text`；L760：服务端版 textcore 只给服务端的非规则组和装配文件 import。
- **问题**：卷一的说法会让客户端出现 `Text` 和 `brand`。按卷二的规定，这正是要防止的路径：客户端只能经 `openEnvelope` 得到可以写进 DOM 的值。
- **建议**：卷一改为"`Text` 只在服务端，只由服务端版 textcore 构造；客户端只有 `Envelope` 和客户端的 `Screened<Text>`"，或者只引用卷二 §2.9 第 2 条类型表。

### N5【两卷冲突（4、5）】注入防线是否剥离
- **位置**：卷一 L263："隔离与剥离（分隔符、角色标记、工具调用指令的剥离）在 aiGate 完成……aiGate 为此允许哪些操作，唯一定义在卷二 §2.8 aiGate 行"。卷二 L659（第十三版新增）："玩家文字在提示里只放进 schema 的独立字段，不拼进指令段，aiGate 不做剥离改写"；卷二 L572 的 aiGate 闭集里也没有任何剥离操作。
- **问题**：卷一要求的剥离，在卷二不存在，还被明确否定。
- **建议**：卷一改为"注入防线在 aiGate：玩家文字只放进 schema 的独立字段，不做剥离"，直接引用卷二 §2.9 第 0 条。

### N6【两卷冲突（4、5）】卷一的分组与矩阵描述停在第十二版结构，display 的范围会和 clientTextcore 重叠
- **位置**：
  - 卷一 L224 和 C-4（L816）：display = "`extension/**` 中除 `extension/host/**` 之外的文件"。卷二 L434 另外排除了 `extension/textcore/**`。按卷一的写法，clientTextcore 的文件同时属于 display，即 E-GROUP-OVERLAP。
  - 卷一 L119 和 C-17（L824）："七组 + textcore import 矩阵"，列名里同时有 display 和 host，写成了一张矩阵。同一行后文又说"两进程各有一张"。卷二 L501–521 是两张矩阵，列也不同，另有装配文件一行。
  - 卷一 §4.5（L448）：各组只写 `{modules: list<glob>}`，没有 `process`、`clientTextcore`、`assembly`、`retired`。卷二附录 F #9（L2151）要求这几项都在卷一落点。
- **建议**：这几处改为只引用卷二 §2.7 与 §2.9 第 0 条，不复述组成和列名。附录乙第二表 #9 按第十三版改写。

### N7【自相矛盾（5）】§2.1 分层图把客户端的组画进了服务端方框
- **位置**：卷一 L75 方框标题写"以下方框 = 服务端进程（Node）"，框内却有客户端 display 的子项（L77–78）和 host（L86–89，"只在客户端"）。这与图注 L110、§3.2 表的"进程"列（L381、L385）矛盾。
- **建议**：把 host 和客户端 display 移到右上的客户端框里，服务端方框里只留服务端的组；第七层画成跨两个框。

---

## 三、收口改稿裁定 7 条落实情况

| 裁定 | 卷二 | 卷一 | 判定 |
|---|---|---|---|
| 1 两进程模型 | §2.9 第 0 条 L605–659；两张矩阵 L501–521；信封 L629–636 | §2.1 图、L-4、L-9、§2.9.1、§3.2 表"进程"列、C-4、C-18 | 已落实；卷一的复述有出入，见 N3、N4、N6、N7；卷二内部的编排缺口见 N1 |
| 2 宿主能力不经全局访问 | L639–655 能力对象表；L662–683 白名单（tools 单列，L682）；L523 JSON import | L119、L124、L385、L394 | 已落实 |
| 3 定时器 | L657；L653 `WallTimerCap`；L648 `ClientTimerCap` | L138、L265、L385、L388 | 已落实 |
| 4 摘要算法 | L658；L672；L647 | L220、L386 | 已落实 |
| 5 起名流程 | L777–784；L237 | L237、L732、C-6 | 已落实 |
| 6 实体终止协议 | §2.6 L404–410（`terminate` 五步，领域卷只登记触发条件）；L422；L462；E-TERM-RESIDUE L1038 | 卷一未提（裁定只要求卷二定义，可以不写） | 已落实 |
| 7 凭证与哈希口径 | §2.9 第 3 条 L768–776 | §2.9.2、§8.3、§7.1 第 5 条、I42、V-13（L743） | 已按第十二版落实；第十三版新增 `playerNotes` 后又出现落差，见 N2 |

---

## 四、小项（只记账，不要求返工）

1. 卷一 L3 仍写"本卷引用的章节号与条款号以卷二第十二版为准""条款号待收尾时对齐"；附录丙 L924 的注释仍说对第十二版快照运行。调用方说已对第十三版复跑，但正文没有更新。
2. 卷二 L720、L721 写"服务端五个非规则组"，L725 明确只有四个（inputEdge、gate、outputGate、aiGate）。
3. 卷一 C-5（L817）写"labels 的 `redacted` 形态"，应为句柄 `uitok_redacted`；C-6（L818）"整段替换"和卷二"命中段替换，复核不过则整个字段 `block`"的用词不一致。
4. 卷二服务端矩阵的括号里仍有中文说明（L508"只读动作目录投影与候选集"、L512"仅各系统的登记函数"）。L499 要求括号里的名字都是清单条目，这两处无法机器核对。
5. 卷二 L712 说客户端错误码经 `menu` 路由上报，但 `schema:wire-up-menu-v1`（L623）只列了动作代号和槽位候选编号。
