模型：claude-sonnet-5-5，中档（11-13 换 Opus 审查前的旧记录）（主会话 11-13 按运行记录补注）

# 卷二 十一审 A（第十一版）

审查对象：docs/统一底层设计/卷二-维度表规范与统一入口.md（1859 行；已读 §2.7 全部、§2.8 第 1–5 条、§2.9 全部、§1.5 的 oneOf 行、附录 D/F 相关行）。只做静态阅读。新的绕法归卷十二，不计入卷二。

## 总判：有条件通过

十审 S1–S7 与 5 条小项落实了，其中 S6、S7、S3 完全闭合。把 §2.9 的四条路径重新走一遍：菜单查表、读存档原样读回两条闭合；AI 文字链与玩家起名链各有一个接口缺口；另有 Sealed 编解码用到的宿主全局不在白名单、以及三处旧句未同步。共 5 条真问题，不涉及方案调整。

## 一、十审 S1–S7 与小项核对

| 条 | 判定 | 行号证据 |
|---|---|---|
| S1 Text/Sealed 声明与强转豁免 | 已解决（旧句残留见 V5） | §2.9 L578：`Text`、`RawText` 声明在 `textcore/types.d.ts`，kernel 与规则层不可见；`Sealed` 声明在 `kernel/types.d.ts`；L579：`textcore/brand.mjs` 是全书唯一品牌强转豁免点；L487（§2.8 4a）同步 |
| S2 哈希口径与 Sealed 序列化 | 已解决（旧句残留见 V5） | L585：`bytes = UTF-8(NFC(text))`、`Digest = sha256(bytes)`、存档序列化 `{"$sealed":1,"bytes":base64,"digest":hex}`、读档重算比对（E-SEAL-DIGEST，§4.3 L814）；L588：哈希口径唯一定义；L477 排除表 = `display` ∪ `displayNames.*` |
| S3 display 读 Sealed | 已解决 | L430 kernelApi 增 `readSealed`（仅 display/outputGate）；L447 矩阵；L466；L587 |
| S4 玩家起名入库前检查 | 部分解决（见 V3） | L589：起名经 inputEdge 命名槽位 → aiGate `admitName` → gate 判定，命中即拒；L432 `displayNames.*.text` 写者改为 `ai-gate/naming-gate.mjs`；L446 矩阵允许 inputEdge import `admitName` |
| S5 Text 出口 | 部分解决（见 V2） | L566–573 登记出口表（`release` 唯一出口函数，仅出口文件可 import；dom-sink、host/dom、host/http、ai-gate/prompt）；E-TEXT-EXIT L814 |
| S6 rxTree | 已解决 | L592–606：判别联合（§1.5 L175 `oneOf` + `discriminator`），每个 op 一个变体，递归深度上限 16（L606、`maxDepth` L175/L192） |
| S7 narrow 文字字段 | 已解决 | L551：schema 中声明为 `text` 的字段一律输出 `RawText`；L578：`RawText` 不是 string 子类型，唯一合法位置是 `brand` 的实参 |
| 小项：L490 六个非规则组 | 已解决 | L485、L491 |
| 小项：Credential 登记 | 部分解决（见 V1） | L456、L582 |
| 小项：族名登记、sealed 文法 | 已解决 | L456：pathTypes 文法加 `sealed`；L588 |
| 小项：4b 空编号 | 已解决 | L488 说明并入 §2.9，保留编号 |

## 二、路径走查

- **菜单查表**：host/dom.mjs 的事件数据 `unknown` → `narrow` → 代号或 `RawText`（L551、L563）→ `brand` → `Text` → inputEdge；inputEdge 用 `textcore/labels.mjs` 的显示名构造冻结 Map，编号键由 `menuIndexKeys` 生成（L581），整串查表。**闭合**。
- **AI 文字 → Sealed → 存档 → readSealed → unseal → 出口**：ai-gate/parse.mjs（L561）→ `Text` → gate 判定 → 凭证 → `seal` → `writeSealed` → state；读：display `readSealed` → `unseal` → 渲染 → 出口。写入端的凭证构造（V1）与出口前兜底（V2）有缺口。
- **玩家起名 → blocklist → aiGate 封装**：host → `Text` → inputEdge 命名槽位 → `admitName` → gate 判定 → `Credential` → `writeText`。入库前的屏蔽词判定已闭合；写入由谁、何时执行没有闭合（V3）。
- **读存档原样读回 Sealed**：`kernel/load/save.mjs` 按存档 schema 读 `{"$sealed":…}`，重算 sha256 比对，不读内容、不需 textcore（L585）。**闭合**；只是编解码所需的宿主全局不在白名单（V4）。

## 三、真问题

### V1 `Credential` 的构造者自相矛盾，aiGate 没有合法的签发途径（L582、L546、L587、L430）
- L582：`Credential` 是 kernel 构造的品牌，在 E-KERNEL-ONLY 的清单内；L587："由 aiGate 的守门函数签发"；L546 给 aiGate 开了 `node:crypto`（"凭证签名"），暗示 aiGate 自己签。kernelApi 清单（L430）里没有 `issueCredential` 之类的函数，kernel 如何验证凭证（`writeSealed(credential, …)`）也没写。aiGate 自己构造 `Credential` 即违反 E-KERNEL-ONLY；不构造则没有凭证。
- 改法：kernelApi 增 `kernel/credential.mjs#issueCredential(proof: GateProof, path): Credential`，其中 `GateProof` 是 aiGate 的守门结果品牌（由 aiGate 的 `admitText` 返回，字段含通过的各项检查代号），kernel 在 `writeSealed` 验证凭证并与路径、一次性序号绑定；去掉 aiGate 的 `node:crypto`。

### V2 "显示前屏蔽词检查"在类型上没有保证，出口只收 `Text`（L566–573、L570–572）
- 出口表的"出口前兜底"写的是约定：dom-sink 的输入"`Text`（已经 outputGate 替换）"。但出口函数 `release(text: Text)` 只要 `Text`，未经 outputGate 的 `Text` 照样可以放行；host/dom.mjs 与 host/http.mjs 更只是"传递已替换结果"。屏蔽词显示前这道关因此靠自觉，机制上可以绕过，而不是类型上不可能（本卷的整体思路是用类型把规则变成"不绕不过"）。
- 改法：在 textcore 增加品牌 `Shown`（可显示文本），只有 outputGate 的替换函数 `redactForDisplay(text: Text): Shown` 能产出；`release` 的形参改为 `Shown`；aiGate/prompt.mjs 的出口改用 `Prompted`（经 matchIdLeak 的产物）；E-TEXT-EXIT 同时覆盖"以 `Text` 调 `release`"。

### V3 玩家起名的写入由谁、何时执行没有闭合，命名槽位里的 `Text` 到不了规则层（L589、L446、L229）
- L589：inputEdge 调 `admitName(text) → Credential | Rejected`，"通过则 aiGate 以该 Credential 调 `writeText` 封装入库到 `displayNames.*.text`"。问题有三：① `admitName` 只有文本参数，没有被命名对象（路径 `displayNames.<id>.text` 的 id）；② 若 `admitName` 内部直接写，则写入发生在规则层校验"这个动作是否合法"之前（比如命名的东西并不属于玩家），顺序错；③ 若写入留到动作执行时，规则层不能 import aiGate（矩阵 L444），又看不到 `Text`（L580），也无法调用 `writeText`，而 inputEdge 输出的命名槽位又是"唯一可携带 `Text` 的字段"（L589、L229），该字段进入提案后规则层无法处理。
- 改法：`admitName(text, targetId)` 返回 `PendingName = {sealed: Sealed, credential: Credential, target: EntityId}`（`Sealed` 与 `Credential` 对规则层都是不透明可见品牌），命名槽位在提案里只带 `PendingName`；命名原语（kernel/primitives）在规则层确认动作合法后调用 `storage.writeSealed(credential, path, sealed)`；inputEdge 的命名槽位输出类型由 `Text` 改为 `PendingName`。

### V4 Sealed 的编解码需要的宿主全局没有进白名单（L540–541、L585、L579）
- `seal` 要把文本编码为 UTF-8 字节，`encodeSealed/decodeSealed` 要做 base64，读档要重算 sha256。UTF-8 编码依赖 `TextEncoder`/`TextDecoder`，base64 依赖 `Buffer` 或 `atob/btoa`，这些都是宿主全局，不是 ECMAScript 内建对象；全局白名单（L540 kernel 行、L541 textcore 行）写的宿主全局是"无"，按 L535 它们会被 E-GLOBAL-UNLISTED 拒绝。
- 改法：在白名单加一行 `kernel/sealed.mjs`、`textcore/seal.mjs` 可用 `TextEncoder/TextDecoder`（与 `Buffer` 仅限 base64），或规定手写 UTF-8 与 base64 的纯整数实现（定点确定性更好，也无宿主依赖）。

### V5 旧句未同步，同一事项两种说法（L433、L411/L432、L456、L483）
- L433 `pathTypes` 示例把 `displayNames.*.text`、`narration.*`、`records.*.text` 仍标为 `"string"`，而 L456、L588 规定 textPaths 的值类型是 `sealed`。
- L411 `displayNames` 的 stateKeys 写者仍是 `display-names.mjs`，L432 `textWriters` 已改为 `ai-gate/naming-gate.mjs`，同一路径两个写者。
- L456 仍写"`textPaths`……display 集合的子集，不进存档哈希的规则层部分"，并说"只有 textPaths 内的路径允许类型 `string`"；而 L588、L477 规定 narration、records 的 `Sealed.digest` **进**存档哈希，排除表只有 `display` ∪ `displayNames.*`；textPaths 若是 display 的子集，narration 就被排除，与 L588 冲突。
- L483 仍写 `Text` 与 `Sealed` 都 `declare` 于 `kernel/types.d.ts`，"`Sealed` 由 textcore 的 `seal` 构造"；L578、L582 规定 `Text` 声明在 textcore，`Sealed` 经 kernel 的 `makeSealed` 构造。
- 改法：L433 改为 `sealed`；L411 改为 `ai-gate/naming-gate.mjs`；L456 改为"textPaths 的值在 state 内为 `sealed`；除 `displayNames.*` 外 textPaths 的 digest 进存档哈希；任何路径类型都不得是 `string`"，并去掉"display 集合的子集"；L483 照 L578/L582 改。

## 四、措辞小项（只记账）

- `readSealed` 的"仅 display/outputGate"限定（L430）在矩阵里没有逐函数的对应列，违例时用哪个码没有写（E-SEAL-READ 只写了 `unseal`），建议在 §4.3 注明 E-SEAL-READ 同时覆盖 `readSealed` 的越权调用。
- 出口表里 display 的 `projection/dom-sink.mjs` 与 host 的 `host/dom.mjs` 都写 DOM（L570–571），分工建议加一句"display 的 dom-sink 负责渲染节点，host/dom.mjs 只负责事件与消息通道"。
- §2.9 第 1 条白名单制把 `JSON.stringify` 列为内建允许，而 `JSON.stringify` 在 §2.8 位置白名单里是违例（L486 内建函数实参）；两处不矛盾（前者是全局对象准入，后者是类型位置），可加一句说明。
- L488 的空编号 4b 与 §4.3、附录 G 中的"§2.8 第 4b 条"旧引用，请在下一版一并替换为"§2.9 第 1 条"。

## 五、结论

真问题 5 条（V1–V5），均为 §2.9 与 §2.7 接口收口，不涉及方案调整；措辞小项 4 条记账。按约定判"有条件通过"。V1–V5 各补一两句并同步 D.1 后，由主会话核对 §2.9 第 1、3 条、kernelApi 清单、全局白名单表与 §2.7 的 JSON 示例即可收口。
