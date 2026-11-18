模型：claude-sonnet-5-5，中档（11-13 换 Opus 审查前的旧记录）（主会话 11-13 按运行记录补注）

# 卷二 十审 A（第十版）

审查对象：docs/统一底层设计/卷二-维度表规范与统一入口.md（1803 行；已读 §1.5 命名 struct 登记、§2.7 JSON 示例与 import 矩阵与权限表、§2.8 全部、§2.9 全部、§3.2/§4.3 相关行）。只做静态阅读。新的绕法归卷十二，不计入卷二。

## 总判：有条件通过

九审 R1–R5 与 5 条小项全部落实。§2.9 把外部边界、Text 构造、Sealed 存放、表达式树收成一节，结构清楚。四条路径逐条走完：菜单查表路径基本闭合；AI 写文字、屏蔽词、host 三条路径各在最后一跳有缺口。共 7 条真问题，都是接口收口，没有方案调整。

## 一、九审 R1–R5 与小项核对

| 条 | 判定 | 行号证据 |
|---|---|---|
| R1 inputEdge 的显示名通路 | 已解决 | §2.9 L555：`textcore/labels.mjs` 是 labels 唯一加载器，display 与 inputEdge 都 import；矩阵 L445 inputEdge 行含 textcore；L464、L496 |
| R2 Text 构造点矛盾 | 部分解决（见 S1） | L553：`Text` 只能由 textcore `brand` 构造；L556：E-KERNEL-ONLY 品牌清单不含 `Text`；L482 对应改写 |
| R3 kernel 碰文字路径 | 已解决（见 S2、S3 的后续问题） | L559–561：textPaths 存 `Sealed`，kernel 只存、搬运、哈希，不读；E-SEAL-READ；`state-types.d.ts` 对 textPaths 生成 `Sealed` |
| R4 host 组 | 已解决 | L426（host 登记进 state-owners）、L438（七个模块组、textcore 为共享库）、L450 矩阵 host 行、L466、L497、L550 |
| R5 运行态表达式字串 | 已解决（见 S6） | §2.9 第 4 条 L564：运行态存 `RxId | rxTree`，不存字串；§1.5 L191 `struct:modifier` 字段全部带类型；L607 |
| 小项：holding_terms 等登记 | 已解决 | L194–195（`struct:holding_terms` 占位登记，卷十八回填） |
| 小项：struct:modifier 字段 | 已解决 | L191 列全字段，`via` 并入 `source.id` |
| 小项：narrow 泛型 | 已解决 | L535：`narrow<S extends SchemaId>(raw, id): SchemaOut<S>`，SchemaOut 不含 `Text` |
| 小项：tools 读者 | 已解决 | L548 |
| 小项：命名 struct 表粘连 | 已解决 | L186–197 表格独立成段 |

## 二、路径走查

### 路径 A：菜单显示名 → inputEdge 精确查表
host/dom.mjs 把 DOM 事件数据标为 `unknown`，经 `narrow` 得到代号，玩家键入文字再经 textcore `brand` 成 `Text`（L546–547、L555），交 inputEdge（矩阵 L450 host→inputEdge）；inputEdge 用 `textcore/labels.mjs` 的显示名构造冻结 Map，`normalizeInput` 规范化后整串查表，返回 `Handle<action>`（L464、L496）。除 S1（brand 的强转豁免）、S5（Text 进出 host 的类型）外，**闭合**。

### 路径 B：AI 写文字 → Sealed → display 解封
ai-gate/parse.mjs 解析 AI 输出（L545）→ aiGate 调 gate 的 `matchBlocklist`/`matchIdLeak`、长度、码点表、schema（L469）→ 签发凭证 → `seal(Text)` → kernel 存入 textPaths（L560）。显示端 display `unseal` 取回（L561、L465）。断在两处：存档哈希（S2）、display 读取 Sealed 的 API（S3）；另 AI 输出里的文字字段离开 `narrow` 时的类型没有规定（S7）。

### 路径 C：屏蔽词入库前与显示前各查一次
AI 文字：入库前 aiGate 查（L469），显示前 outputGate 经 gate 查（L468、L453 组合由 host 完成），两次都有。玩家命名：入库由 display 签发凭证（L455），但 display 不能 import gate（矩阵 L446，gate 列空白，L453 也禁），入库前没有屏蔽词检查，见 S4。

### 路径 D：host 收到的 DOM 事件
入口（L547）→ `unknown`+`narrow`（kernel/validate，L535）→ 代号（Handle/EntityId 由 narrow 在 kernel 内构造，合 E-KERNEL-ONLY）或 `Text`（host 调 `brand`）→ 交 inputEdge/display。进来的一半**闭合**；出去的一半（把 `Text` 写进 DOM、写进 HTTP 响应）没有类型上合法的写法，见 S5。

## 三、真问题

### S1 `Text`/`Sealed` 的声明与构造豁免与 §2.8 4a 冲突（L482、L486、L553、L556、L561）
- L482 仍写所有品牌类型"`declare` 于 `server-plugin/kernel/types.d.ts`"，包括 `Text` 与 `Sealed`；L554 又说 `Text` 对 kernel 不可见"由 import 矩阵与 `.d.ts` 归属保证"。`Text` 声明若放在 kernel 的类型文件里，kernel 的 tsconfig 就包含它，kernel 可见，与 L554 矛盾。
- L553：`brand`、`seal`、`unseal` 的实现必须把 `string` 转成品牌类型，需要 `as`/`@type` 强转；§2.8 4a（L486）只豁免 kernel（"kernel 之外的任何 `as`"→E-TSC-ESCAPE-ASSERT），textcore 不在豁免内；L553"其他任何位置构造 `Text` 即违例"隐含 textcore 是例外，但 4a 没有写。
- 改法：`Text` 的声明放 `textcore/types.d.ts`（只被六个非规则组引用），`Sealed` 放 kernel 与 textcore 都可见的共享声明；在 4a 把 `textcore/brand.mjs`、`textcore/seal.mjs` 登记为 `as` 的唯一例外文件（与 kernel 同级，且文件名进门禁清单）。

### S2 `Sealed.digest` 进存档哈希，与"文字路径不进哈希"矛盾，且 Sealed 的存档序列化与 digest 算法未定义（L560、L476、L455、L541）
- L560：`Sealed.digest` 进存档哈希，"使存档与哈希涵盖文字记录"。L455、L476：textPaths 不进规则可读状态哈希，哈希排除表由 display 集合与 textPaths 生成（卷一 I40/§8.3："AI 文字不进哈希"）。两处对同一个哈希给出相反规定；G1/G2（labels 与语言包互换后事件流、哈希相同）也依赖后者。
- `Sealed = {bytes: Uint8Array, digest: Digest}`：存档是 JSON（L541 `kernel/load/save.mjs` 读存档把 textPaths 值读为 `Sealed`），`Uint8Array` 的序列化形式（如 base64）、`Digest` 的算法（哪种哈希、对 NFC 后的 UTF-8 字节？）、读档时是否重算 digest 校验，都没写。
- 改法：区分两个哈希——"规则可读状态哈希"（I40，排除 textPaths）与"存档完整性哈希"（含 `Sealed.digest`）；写明 `Digest = sha256(utf8(NFC(text)))`、`bytes` 在存档里为 base64 字串、读档重算比对。

### S3 display 读取 `Sealed` 没有合法接口（L430–431、L561、L465、L429）
- L561：display 与 outputGate 可 `unseal`；但 display 要先从 state 拿到 `Sealed`。state-owners 示例里 `displayNames` 的 `readers` 为空（L405 一带），kernelApi 清单（L429）没有读取 textPaths 的函数，§2.4 又规定对 display 集合字段的读取 E-VIEW-DISPLAY-READ = 0。display 既不能读 textPaths，又必须显示它。
- 改法：在 kernelApi 增加 `kernel/storage.mjs#readSealed(path) → Sealed`，仅 display 与 outputGate 可调用（矩阵加限定），并在 §2.4 注明 display 组经此接口读 textPaths 不算 E-VIEW-DISPLAY-READ。

### S4 玩家命名入库前没有屏蔽词检查（L455、L446、L453、L469）
- L455：display 组可为玩家命名签发 writeText 凭证。但矩阵 L446 display 行对 gate 列为空白，L453 明确"display 不得 import gate"；display 自己不判定（L465）。于是玩家自由命名入库前没有 gate 判定，只有显示前 outputGate 一道，与"入库前与显示前各查一次"不符。inputEdge 的输出又只有代号与槽位编号（§1.9 第 2 条），不含自由文本，命名文本经哪条路进入 display 也未写。
- 改法：玩家命名的 `writeText` 凭证改由 aiGate（更名或扩为"文字入库守门"）签发，display 只提出请求，或在矩阵里为 display 的命名写入文件（`display-names.mjs`）单独开放对 gate 的 import；并在 §2.9 写明玩家命名的完整路径（host → inputEdge 命名槽位 → 守门 → seal → 存档）。

### S5 `Text` 没有出口：host 无法把它写进 DOM 或 HTTP 响应（L466、L497、L550、L485）
- host 的约束是"零字符串操作、原样传递"（L497），display→outputGate 的结果是 `Text`，最终要写进 DOM（`textContent`、`setAttribute`）或 HTTP 响应。这些 DOM/网络 API 的形参类型是 `string`，而 §2.8 第 4 条白名单只允许品牌值作为**同一品牌**形参的实参、对象属性赋值的目标须声明为同一品牌（L485）；`Text` 传给 `string` 形参、赋给 `textContent` 都不在白名单内。§2.9 只给了 `brand`（进）、`seal`/`unseal`（存），没有"出"的登记函数。
- 改法：在 textcore 登记唯一出口 `release(text: Text): string`（仅 host 可 import，矩阵加列），规定 DOM/传输写入只经 `host/dom.mjs`、`host/http.mjs` 内调用 `release`，并把 `release` 的返回值只许传给登记的 DOM/传输 sink。

### S6 `struct:rxTree` 违反 §1.5 的 union 规则，且递归 struct 无规定（L192、L564、§1.5 union 行）
- `args: list<union[struct:rxTree, Handle<*>, DimKey, number]>`：`Handle<*>` 与 `DimKey` 都是字串形态，而 §1.5 union 规定成员须能由 JSON 形态唯一判别、字串形态至多一个成员（E-DIM-UNION-SHAPE）；这条自己就过不了。
- 同时 `struct:rxTree` 直接引用自身，§1.5 的 struct 没有写允许递归，也没有深度上限。
- 改法：args 元素改成带标签的 struct：`{tag: enum rx_arg_kind, handle: Handle<*> nullable, dim: DimKey nullable, num: number nullable, node: struct:rxTree nullable}`，或给 `Handle<*>` 与 `DimKey` 一个前缀可判别的联合并在 §1.5 明文允许；§1.5 补"命名 struct 可递归，深度上限由登记表 `maxDepth` 给出（rxTree 取 16）"。

### S7 `narrow` 的输出里文字字段的类型没有规定（L535、L545、L555）
- `SchemaOut<S>` "不含 `Text`"；AI 输出与请求体里的自由文字字段离开 `narrow` 时是什么类型，没有写。若是 `string`，则 kernel 的函数向外返回了裸字串，aiGate、host 拿到后再调 `brand`，中间这段是裸 `string` 在流动，位置白名单（L485）对 aiGate/host 又只写"其余按第 4 条"，没有给 `string → brand` 这一步一个明确的合法位置。
- 改法：给 `SchemaOut` 增加 kernel 可见的不透明类型 `RawText`（不是 string 子类型，不可比较、拼接），`brand(raw: RawText): Text` 只接受它；`narrow` 对文字字段产出 `RawText`。

## 四、措辞小项（只记账）

- L490 表头"kernel 之外五个非规则组"应为六个（含 host）；L484 "规则层（kernel 与五个非规则组之外）"同理，并应加"textcore"。
- L487 保留了"4b 登记边界入口表见 §2.9"的空编号行，建议整行删除并同步引用处（§4.3、附录 G）。
- `credential` 的类型与构造者在 §2.7 L455 提到，但 §1.5、§2.8 都没有登记（建议登记为 kernel 构造的品牌 `Credential`）。
- `rx_op`、`stack_group`、`holding_kind`、`basis_kind` 等族名（L191–194）建议同步进 §1.9 的族表或封闭枚举清单，脚本第 5 项族名对账才能覆盖。
- §2.9 第 3 条 `Sealed` 的字段用了 `Uint8Array`，而 `pathTypes` 文法没有对应类型名，建议在 `pathTypes` 文法里加 `sealed` 一项。

## 五、结论

真问题 7 条（S1–S7）：路径 A 基本闭合，路径 B、C、D 各在最后一跳缺接口（S2–S5、S7），另有两条类型层的自相矛盾（S1、S6）。措辞小项 5 条记账。按约定判"有条件通过"。S1–S7 各补一两句并同步 D.1 与附录 G 后，由主会话核对 §2.8 4a、§2.9 第 2、3 条与 §2.7 矩阵、kernelApi 清单即可收口。
