模型：claude-sonnet-5-5，中档（11-13 换 Opus 审查前的旧记录）（主会话 11-13 按运行记录补注）

# 卷二十审 B（第十版，1803 行）

静态阅读，未运行任何东西。

## 结论：有条件通过（4 条真问题）

## 一、九审项核对

| 项 | 判定 | 证据 |
|---|---|---|
| Q1 narrow 契约与 Text/catch | 已解决 | §2.9 L535：`narrow<S extends SchemaId>(raw: unknown, id: S): SchemaOut<S>`，SchemaId/SchemaOut 由登记表生成，未登记 id 为类型错误，输出不含 Text；L536 catch 变量 `unknown` 只许传给 `reportError(e)`，E-TSC-CATCH-NARROW |
| Q2 外部入口泛化 | 已解决（口径见 R4） | L534 进程外来源闭集；L546-547 补 `host/http.mjs`、`host/dom.mjs`；L550 host 组 |
| Q3 eslint 清单对账 | 已解决 | L568 ①-⑤：tsc 与 eslint 清单均等于磁盘清单、ignore/exclude 为空、全部 tsconfig 严格、配置文件哈希登记 |
| 小项：扩展名 | 已解决 | L568 `{mjs,js,cjs,mts,ts,jsx}` |
| 小项：所有 tsconfig | 已解决 | L568 ③ |
| 小项：aiGate 单例 | 已解决 | L469 |
| 小项：具体文件名 | 基本解决 | L541-547 均为具体文件名；L548 "等离线校验器"仍是泛指 |

## 二、§2.9 模型评估

- 进程外来源闭集：写成了，但判定手段有口径问题，见 R4。
- narrow 契约：类型层面完整；与 Text 的衔接有缺口，见 R1。
- catch 变量：完整。
- Text 只由 textcore 构造（L553-556）：构造点单一、import 矩阵限制可见性（L554、L440-453），思路成立。
- Sealed：封装与解封分权清楚（L559-561：kernel 只存搬运哈希，display/outputGate 才 unseal，E-SEAL-READ）；但有两处自相矛盾，见 R2、R3。
- tsc 与 eslint 清单对账：完整。

## 三、真问题

**R1　narrow 与 `brand(raw: string)` 之间缺一个"未标记文本"类型（L535、L553、L545-547）。**
SchemaOut 不含 Text，textcore 的 `brand` 却接收 `string`。入口收窄后，含自然语言的字段到底是什么类型？若是裸 `string`，就违反各组的字符串位置约束（display、host 等"零字符串操作"，且 host 只能原样传递）；若不收窄，字段拿不出来。须新增品牌类型 `RawText`（只由 `narrow` 对 schema 声明为 `text` 的字段产出，只能作为 `brand` 的实参，不可比较、不可拼接），并在 §2.8 位置白名单里写明"`RawText` 只许出现在 textcore.brand 的实参位置"。

**R2　Sealed 的存档往返与"只有 textcore 构造 Sealed、kernel 不得 import textcore"矛盾（L541、L556、L559-560、L440-453）。**
存档读取（`kernel/load/save.mjs`，L541）要把存档里的文字记录还原成 `Sealed`，但 L556 规定 Sealed 只由 textcore 构造，kernel 又不得 import textcore；存档写出时序列化 `bytes` 也算"读"。须规定 kernel 可见的受限通道：`narrow` 的 schema `sealed` 输出 Sealed，条件是结构为 `{bytes, digest}` 且 kernel 重算 sha256(bytes) 与 digest 一致（校验字节摘要不读内容语义）；序列化只经 kernel 的 `encodeSealed`。同时写明 `bytes` 的编码（NFC 规范化后的 UTF-8）、摘要算法，并把 `Uint8Array` 在构造后冻结/复制，防止后改。

**R3　Sealed.digest 进存档哈希，与"textPaths 不进存档哈希"冲突（L560 对 L476、L235）。**
L476：哈希排除表由 display 集合与 `textPaths` 生成（即文字路径被排除）；L235：玩家命名不进哈希。L560 却写"`Sealed.digest` 进存档哈希，使存档与哈希涵盖文字记录"。二者不能同时成立：digest 进哈希则 AI 叙述的差异会改变存档哈希，破坏 B9/G1-G3 要求的"存档哈希不随语言/叙述变化"与逐字节复现。须二选一并改全：建议 digest **不进**规则层哈希，另设"完整性哈希"（含 Sealed）仅用于存档防损，两者在 state-owners 分开登记；L560 与附录 F #16 同步。

**R4　"进程外来源闭集"靠 API 名字单列，不是真闭集（L534）。**
清单写 `fs.*`、`fetch`、`req.body`、`process.env/argv/stdin`、DOM 事件、`postMessage`。进程外来源随宿主增长（`WebSocket`、`localStorage/IndexedDB`、`BroadcastChannel`、`os.*`、`net/http` 内建模块、`worker_threads`、`readline`…），名单必然漏。机制应改为默认拒绝：非登记入口文件**只许使用 ECMAScript 内建**，宿主全局（`process/document/window/fetch/XMLHttpRequest/WebSocket/localStorage/navigator…`）与 `node:*` 模块的引用用 eslint `no-restricted-globals` / `no-restricted-imports` 的**白名单**制管理，只有登记入口表里的文件在白名单内。这样闭集由"只许哪些"决定，而不是"禁哪些"。

## 四、措辞小项（记账）

- L548 "等离线校验器"改成具体文件名。
- L536 的 `reportError(e)` 形参本身是 `unknown`，与"除 raw 外唯一允许的 unknown"并存，补一句"reportError 的形参为唯一豁免"；`Promise.catch((e)=>…)`、`finally` 同口径。
- L496 编号表的键"菜单生成的十进制编号字串"在 inputEdge 里由谁、用什么生成未说明（不能用 `String()`）；写明由 textcore 提供 `menuIndexKeys(n)`。
- L564 `rxTree` 的 `args` 含 `number`，数值精度/定点口径引用 §3.3 一句话即可。

## 偏离指令之处

无。未提交 git。
