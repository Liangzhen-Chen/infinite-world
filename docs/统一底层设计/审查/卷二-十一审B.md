模型：claude-sonnet-5-5，中档（11-13 换 Opus 审查前的旧记录）（主会话 11-13 按运行记录补注）

# 卷二十一审 B（第十一版，1859 行）

静态阅读，未运行任何东西。

## 结论：有条件通过（3 条真问题）

## 一、十审项核对

| 项 | 判定 | 证据 |
|---|---|---|
| R1 RawText | 已解决 | §2.9 L551 narrow 对 `text` 字段输出 `RawText`；L578 RawText 不是 string 子类型，唯一合法位置是 `brand` 实参；L491 表头同口径 |
| R2 Sealed 往返 | 已解决 | L585：Sealed 归 kernel，`encodeSealed/decodeSealed`，读档重算 sha256 与 digest 比对（E-SEAL-DIGEST），不需要 textcore；L586-587 封装/解封与读写接口分权 |
| R3 哈希冲突 | 已解决 | L588 唯一口径：Sealed.digest 进哈希，排除表 = display 字段集 ∪ `displayNames.*`；L477 同步；L235 一致 |
| R4 闭集改白名单 | 部分解决，见 Q2 | L535-549 白名单制 + 每组全局白名单表 |
| 小项 | 已解决 | L564 具体文件名；L552 reportError 形参豁免及 `Promise.catch`/`finally`；L581 `menuIndexKeys` |

## 二、四项机制检查

- **唯一强转点 brand**：L579 `textcore/brand.mjs` 是唯一豁免文件，`brand(raw: RawText): Text` 入参类型收紧（不再吃裸 string），方向对；但口径有矛盾，见 Q1。
- **各组全局对象白名单**：表结构对（L538-549，每组一行、表外禁止、文件级限定），但表本身不完整，见 Q2。
- **出口表与入口表对称**：新增出口表与 `release`（L566-573）是正确的一步，但只覆盖 `Text`，见 Q3。
- **七个组文件级互不相交**：L423 display 的 glob 带 `!extension/host/**` 排除项，与 L427 host 的 `extension/host/**/*.mjs` 不重叠；`server-plugin/host/**` 与 display 的 `ui-*`、`projection/*` 不重叠；kernel、textcore、gate、outputGate、aiGate、inputEdge 的目录两两分离。通过。

## 三、真问题

**Q1　"全书唯一强转"与 narrow/kernel 构造函数的口径自相矛盾（L579、L582、L551）。**
L579 称 `brand` 是"全书唯一允许的品牌强转"，并说 kernel 构造函数"不是强转"。但 TypeScript/JSDoc 里从 string 产出品牌值必有断言，kernel 的构造函数也不例外；同时 `RawText` 由 `narrow`（在 `kernel/validate/narrow.mjs`）产出，L582 却把 `RawText` 排除在 kernel 构造清单之外。于是"谁能构造 RawText"没有登记，"唯一"也不成立。须改成精确陈述：断言只许出现在 (a) `kernel/**`（构造代号类品牌、`Sealed`、`RawText`，其中 `RawText` 只在 `narrow.mjs` 一个文件）与 (b) `textcore/brand.mjs`（`RawText→Text`）；列成两行的豁免表，门禁按文件清单比对；删去"不是强转"和"全书唯一"两处不准确的措辞。

**Q2　全局白名单表自身不完整，且"ECMAScript 内建"是开放集合（L535-549）。**
(a) L535 写"ECMAScript 内建对象（Object/Array/…等）"，"等"使白名单变成开放集；而 `eval`、`Function`、`Reflect`、`Proxy`、动态 `import()`、`WebAssembly`、`SharedArrayBuffer` 也属于 ECMAScript 内建，放行即等于放行任意代码。须给出**精确列表**，并显式排除这些。(b) 本卷自己要求的操作在表里没有出处：`Sealed` 的 `UTF-8(NFC(text))` 与解码需要 `TextEncoder/TextDecoder`（或 `Buffer`），base64 序列化需要 `Buffer`/`btoa`，但 kernel、textcore 两行的"可用宿主全局"都是"无"；`console` 在 S13 的 (c) 里被豁免，在白名单里却不存在；`Date`、`Math.random`（S11 已有口径）也未表态。须补全这些行，或规定这些功能由 kernel 提供的纯代码实现（不使用宿主全局）。

**Q3　出口表只管 Text，且 fetch 的收发拆在两个文件，对称性不成立（L553-573、L546）。**
入口表有 8 行，出口表有 4 行，且出口只对 `Text`。非 Text 数据离开进程同样需要登记：存档写盘（`kernel/load/save.mjs` 的写出，含 Sealed 的 base64）、日志文件（`logs/dimensions-coverage.*`）、控制台输出。另外 aiGate 的 `fetch` 同时列在 `ai-gate/parse.mjs` 与 `ai-gate/prompt.mjs`（L546），响应体究竟在哪个文件读取、由谁 `unknown`+`narrow`，入口表（L561）只登记了 parse.mjs；一次 HTTP 往返应登记为同一对入口/出口，并规定 `fetch` 只在其中一个文件调用。补：出口表按"目的地类型"分类（宿主 DOM、HTTP、磁盘、日志/控制台），每类只许登记文件；`Text` 与非 `Text` 的出口分列。

## 四、措辞小项（记账）

- L1415 S13 仍写"state-owners 五个模块组（inputEdge/display/gate/outputGate/aiGate）"，现行是 kernel/host 等六个非规则组加 textcore；不同步会让规则层扫描误扫 host、kernel 文件。
- L1810 附录 F #15 仍写排除表"由 display 集合与 textPaths 生成"，与 L477、L588 的新口径不一致。
- 各组 glob 只写 `*.mjs`，而覆盖门禁清单含 `{mjs,js,cjs,mts,ts,jsx}`（L568 旧号）；补一句"组内出现 .mjs 以外扩展名的文件视为未归组，直接失败"。
- L587 `writeText` 签名由 aiGate 导出，而 L589 inputEdge 调 `admitName`，写一张"凭证流程"小图或表，便于卷十二断言。

## 偏离指令之处

无。未提交 git。
