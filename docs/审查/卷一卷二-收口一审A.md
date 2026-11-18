模型：claude-opus-5-5，中档（主会话 11-13 按运行记录补注）

# 卷一卷二 收口一审 A

审查对象：卷二第十二版（`卷二-维度表规范与统一入口.md`，1942 行）、卷一第十版（`卷一-总纲与分层.md`，866 行）。
审查方式：静态读文件；核对现有代码只用 Grep/Glob（extension/、server-plugin/）。未运行任何脚本。
侧重：设计自洽与两卷对齐（B 侧重机判/绕过/代码现状，重叠处照列）。

结论：卷二真问题 15 条，卷一真问题 11 条，小项 12 条。最重要的三条是 A2-1（没有建模两进程架构）、A1-1/A1-2（卷一没有跟进卷二十一、十二两版，凭证签发方和哈希口径都和卷二冲突）、A2-8（玩家起名路径破坏规则层纯度和语言无关哈希）。

---

## 一、卷二 真问题

### A2-1【接口对不上｜最重要】没有建模"浏览器扩展 + Node 服务端插件"两进程架构，§2.9 的出入口、白名单和 Screened 链条在跨进程处断开
- **行号**：L423（display 含 `extension/**`）、L427（host 含 `extension/host/**`）、L448/L452 矩阵 display/host 行 → kernel、textcore；L544–551 白名单；L566–567 入口表；L574–576 出口表。
- **问题**：
  1. `projection/dom-sink.mjs` 是登记的 DOM 出口（L547、L574），但它在 `server-plugin/projection/` 下，属于 Node 进程，那里没有 DOM。
  2. display 和 extension/host 位于浏览器侧，矩阵却允许它们 import kernel（`readSealed`）和 textcore（`labels.mjs`、`unseal`）。这几个文件依赖 `node:fs`、`node:crypto`（L544–545），在浏览器里无法加载。
  3. 服务端算出的 `Screened<Text>` 经 HTTP 送到浏览器后，按 §2.9 第 1 条属于"进程外来源"，只能经 `narrow` 得到 `RawText`，再 `brand` 成 `Text`，不再是 `Screened<Text>`。结果浏览器侧的 dom-sink 永远拿不到合法的 `release` 实参，"类型保证显示前已屏蔽"在跨进程这一步失效。
  4. 浏览器侧 host 白名单没有 `fetch`，扩展因此无法调用服务端；也没有为 SillyTavern 宿主 API 开口子（`getContext`、`eventSource`、对仓库外 `../../../extensions.js` 的 import）。
  5. 服务端走的是 SillyTavern 注入的 Express `router`，不用 `node:http`；入口 `server-plugin/index.mjs` 也没有归到任何组，按 L655 会落进规则层。
- **证据**：extension/index.js:1 `import { getContext } from '../../../extensions.js'`、:60/:139 `fetch('/api/chats/...')`、:114 `setTimeout`、:219 `context.eventSource.on`；extension/runtime.js:65 `fetch('/api/plugins/infinite-fields/...')`；server-plugin/index.mjs:103 起 `router.post(...)`。
- **建议**：§2.9 增加"进程边界"一条：
  1. 分别列出服务端与浏览器的组成员；dom-sink 移到 `extension/`；textcore 拆成服务端部分（labels 加载、seal）和浏览器部分（brand、release）。
  2. 传输规则：服务端只经 `host/http.mjs` 发出 `Screened<Text>`；浏览器侧 `extension/host/net.mjs` 是登记入口，用 `fetch` 收取，并在强转豁免表里登记一行"传输体 → `Screened<Text>`"，前提是 schema 标明该字段来自服务端出口。另一种做法是浏览器侧不显示文字，只渲染服务端拼好的结果。
  3. 白名单为 SillyTavern 宿主 API 和 Express router 各开一行；`index.mjs` 归 host，或改为只做 re-export。

### A2-2【缺维度／自相矛盾】全局闭集缺少运行必需的对象：AI 超时做不出来，`Proxy` 与 §2.2 冲突
- **行号**：L536 内建闭集；L550 aiGate 行只给 `fetch`；B10(g) L1500 要求"AI 超时 → 退回菜单"；L361 `dims: Proxy/惰性`。卷一 L250、V-26 L730 也要求处理超时；卷一 L124 写"开发模式 Proxy 仅调试"。
- **问题**：
  1. 超时需要 `setTimeout`、`AbortController` 或 `AbortSignal.timeout`，三者都不在任何一行，因此 B10(g) 和 V-26 无法实现。
  2. `Proxy`、`Reflect` 不在闭集内，与 §2.2 的 `View.dims` 写法自相矛盾。
  3. 现有加载器靠 `node:url` 的 `fileURLToPath`（action-registry.mjs:9 等）解析数据路径，kernel 行没有开放 `node:url`。
- **建议**：
  - aiGate 行在 `ai-gate/prompt.mjs` 内开放 `AbortController` 与 `setTimeout`/`clearTimeout`；超时时长放进规则表，例如 `rules.ai.timeoutMs`。
  - host 浏览器侧开放 `setTimeout`。
  - `Proxy` 二选一：并入闭集，或把 §2.2 改成"惰性 getter"。
  - kernel 的 `load/*` 开放 `node:url`。
- **对已知遗留"host 定时器"的判断**：这是真问题，不能等到卷九、卷十一时再说。B10(g) 本身就是本卷的收口断言。

### A2-3【自相矛盾】凡是产出 `Text` 的变换都需要强转，但强转豁免表只列了 `brand.mjs`
- **行号**：L590（`Text` 的产出者包括 templates.mjs、redact.mjs 的拼接）；L596–608 豁免表；L497（`normalizeInput` 的结果作 `Map<Text,…>` 的键）；L564（load-blocklist 产出规范化后的 `Text`）；L611（`menuIndexKeys` 产出 `list<Text>`）。
- **问题**：`Text` 是 `string & {__brand}`。`+`、模板插值、`normalize('NFC')`、逐码点映射得到的都是普通 `string`；要返回 `Text`，就必须用 `as` 或 `@type` 强转。templates.mjs、redact.mjs、input/normalize.mjs、gate/load-blocklist.mjs（或 matcher.mjs）、textcore/menuIndexKeys 都不在豁免表里，按 L596 一律报 E-TSC-ESCAPE-ASSERT。条文写的合法路径实际上走不通。
- **建议**：二选一。
  - 在 textcore 增加 `concatText(...parts: Text[]): Text`、`mapCodePoints(text, table): Text`、`textFromDigits(...)`，强转集中在一个登记文件。templates、redact、normalize、load-blocklist 只调用这些函数。
  - 或者在豁免表里逐个文件补行，写明"string → Text，前提：输入全是 Text 或冻结表"。

### A2-4【接口对不上／机制漏洞】kernelApi 清单既不全，又靠通配和括号里的中文来表达限制
- **行号**：L430；L446（textcore 行"只经 kernelApi 的 idIndex/narrow"）；L381（kernelApi = 可接收 state 的 API）；L445（规则层"只经 kernelApi"）。
- **问题**：
  1. **缺项**：`narrow`（textcore、gate、aiGate、host 都要用）；`idIndex`（textcore 和 gate 的 matchIdLeak needle 要用）；句柄 `V`/`E`、`entityId`、`declareInputs`、`inputsOf`、`explain`、`sample`（规则层要用）；whitespace、casefold、charset 码点表（inputEdge 和 aiGate 要用）；TextScope 的取得方式（aiGate 要用）。按"只经 kernelApi"的规定，这些都调用不到。
  2. **用途冲突**：§2.3 把它定义成"可接收 state 的 API"，矩阵又把它当成规则层唯一的 import 面。
  3. **可绕过**：`kernel/storage.mjs#*`、`ledger#*`、`primitives#*` 用通配放行，同文件里的 `readSealed`、`writeSealed` 也一并对规则层放行，"仅 display/outputGate"的限制被覆盖，规则层也能直接调用 storage 的写函数。
  4. **程序要读中文**：调用方限制写在导出字串里的中文括号中，例如 `"…#readSealed（仅 display/outputGate）"`，检查器必须读这段中文才能判定，违反"禁读自然语言"。
- **建议**：改成结构化写法 `{"export":"kernel/storage.mjs#readSealed","callers":["display","outputGate"],"acceptsState":true}`；禁止 `#*`；补齐上面列出的缺项；矩阵引用的名字必须是清单中已有的条目（加入对账脚本）。

### A2-5【自相矛盾】类型声明文件和"可见组"对不上
- **行号**：L484（§2.8 第 1 条："Text、RawText、Screened<Text> 不声明在 kernel/types.d.ts 的可见面内"）与 L584、L589（§2.9 第 2 条："RawText 声明在 kernel/types.d.ts"）矛盾。
- **问题**：
  - `Sealed`、`Credential`、`TextScope`、`RawText` 都声明在 kernel/types.d.ts。规则层为了拿到 `Handle`、`EntityId` 必须引用这个文件，于是这些类型对规则层同样可见。
  - 类型表说 `Credential` 只对 kernel 和 aiGate 可见、`Sealed` 不对规则层可见，按文件这样划分做不到。
  - 规则层能看到 `Sealed`，也就能把它塞进任何 struct 原样传递。
- **建议**：拆成两个声明文件。`kernel/types.d.ts` 只放代号类品牌，规则层可见；`kernel/text-types.d.ts` 放 RawText、Sealed、Credential、TextScope，只由非规则组和 kernel 的 tsconfig 引用。§2.8 第 1 条和 §2.9 第 2 条统一成这个说法。

### A2-6【缺维度＋自相矛盾】屏蔽词表格式丢了类别，规范化步骤也引错
- **行号**：L661（`entries` 只是一组字串）；L1403（§6.11："各语言两档保留"，即 names 与 realPeople 两档）；L564、L611、L661（"按 §1.9 ①②（NFC、简单大小写折叠）"）；§1.9 第 3 条 L241（① NFC，② 裁首尾空白，③ 大小写折叠）；A19 L1452。
- **问题**：
  1. 平铺字串无法区分 names、realPeople 两档，也就产生不了卷一 L221 要求的 `reject:blocklist / reject:real_person / reject:minor_content` 三种代号，卷一 L233 的"词表 `category: minor_content`"无从落地。同卷 §6.11 又说两档保留。
  2. §1.9 的"①②"指 NFC 加裁空白，不含大小写折叠。照字面执行，needle 不折叠大小写，A19 要求的"大写条目对小写文本仍命中"就做不到。
- **建议**：
  - 格式改为 `entries: [{word, category: Handle<blocklist_category>}]`，category 族登记在 `_vocab.json`，与卷一一致。命中列表带上 category，供 aiGate 生成 reject 代号。
  - 规范化统一写成"§1.9 第 3 条的 ① 与 ③（NFC 与简单大小写折叠，不裁空白）"，或者直接引用 §2.9 第 6 条的三步算法。

### A2-7【接口对不上】textcore 的 `seal` 算不出 sha256（已知遗留，判定为真问题）
- **行号**：L545（textcore 白名单没有 `node:crypto`）；L615–616（`seal` 要计算摘要后调 `makeSealed(bytes, digest)`）；L604（makeSealed 重算后比对）；L193（`struct:sealed` 用了 `bytes`、`Digest` 两个类型，都不在 14 种封闭类型里）。
- **问题**：按现有条文，seal.mjs 无法合法地计算摘要。另外 makeSealed 本来就会重算一遍，由调用方传入 digest 纯属多余。
- **建议**：采纳作者自己的提议，改成 `makeSealed(bytes)`，摘要只在 kernel/sealed.mjs 里计算。`seal` 只做 NFC 和 UTF-8 编码。同步修改 L591、L604、L615–616 和附录 F #16。`struct:sealed` 的字段类型改用"kernel 不透明类型，不进维度类型体系"的说法，或者在 §1.5 里注明这是例外。

### A2-8【接口冲突＋不确定｜重要】玩家起名路径让规则层在出提案时产生写入，`named` 还会随语言包变化
- **行号**：L627–632（五步流程与时机）；D.3 L1849（作者承认"同步应答与结算事务的衔接"没写）；卷一 L-2 L105、L-4 L107（第二层以上只产提案，由事务归约）。
- **问题**：
  1. 规则层在结算时调 `nameSlot.request`，同步触发 host、inputEdge、aiGate，最后到 `writeSealed`。规则层算提案期间就发生了写入，违反卷一的"规则只产提案"。条文只说"同批提交"，没有定义 writeSealed 怎样挂进当前事务；动作的其他原语被事务拒绝时，名字写入是否回滚也没有定义。
  2. `named` 取决于 `screen(text, lang)` 所用的那份语言 blocklist。同一输入在 zh 包和 en 包下可能一个提交、一个整体放弃，动作的其余写入（事件、时间、代价）随之不同，违反 I40、B9 的"哈希不随语言包变化"。
  3. 复演时如果重新执行守门，blocklist 改过之后同一输入的结果就会不同。
- **建议**：把筛查前移到提案之前。
  1. inputEdge 收到文字后先调 `admitName`。不通过就当场退回菜单，不产生任何提案。通过则由 aiGate 向 kernel 申请一个暂存句柄 `PendingTextId`，Sealed 暂存在 kernel，尚未写入 state。
  2. 提案里只带 `PendingTextId`。规则层只校验合法性，不再调 nameSlot。
  3. kernel 事务提交时，把暂存的 Sealed 原子写入 `displayNames`；动作被拒时丢弃暂存。
  4. 这样凡是进入规则层的命名提案都已通过守门，规则可读状态与 blocklist 无关。`nameSlot.register` 和 `request` 可以删除。

### A2-9【接口对不上】"输入边可整体删除"与"host 静态 import inputEdge、禁止动态 import"冲突
- **行号**：L452（host → inputEdge 为"是"）；L538（禁止动态 `import()`）；§1.9 第 4 条 L242；G4 L1512。
- **问题**：host 静态 import inputEdge。删除 `server-plugin/input/` 后 host 加载失败，G4 的"只删输入边仍可玩"无法成立。动态 import 又被明令禁止，没有可选加载的写法。
- **建议**：矩阵把 host → inputEdge 改为空白。改由 inputEdge 在启动时向 host 登记适配器，例如由 tests/CLI 或入口装配；或者规定 host 只通过一个可空的装配表引用 inputEdge，并把"装配表缺项"列为 G4 的正常形态。

### A2-10【程序读自然语言／缺口】`created.*.props.*` 可以存 string 类显示维度，自然语言绕过了 textPaths
- **行号**：L434（`created.*.props.*` 的类型是 dimension）；L457（"string 类型只允许 display 字段，故 dimension 路径的值不可能是自然语言"）；L172（string 类型用于文档或显示字段，示例里还有已改成 sealed 的 `displayNames.text`）。
- **问题**：L457 的推理不成立，display 字段恰恰就是自然语言。偏离行如果写入一个 string 类维度，自然语言就不经守门进了 state。卷一 §4.4 L427 也承认偏离行可能带 string 维度。
- **建议**：pathTypes 的 `dimension` 明确排除 string 类维度，运行时写 string 维度即报 E-TEXT-UNGATED；如果确需运行态文字，另设 textPath。L172 删去 `displayNames.text` 示例。

### A2-11【机制漏洞】kernel 和 textcore 没有字符串操作闭集，S13 又排除了 kernel
- **行号**：§2.8 组表 L493–502 没有 textcore 行，kernel 行只写了品牌构造；S13 L1469 扫描目录排除 kernel 和 textcore；S13(b) L1471 却规定正则"仅限"三个 kernel 文件，而这几个文件根本不在扫描范围内。
- **问题**：
  - textcore 可以被所有非规则组 import，对文字的操作又不受限制。把模糊匹配写进 textcore 再从 inputEdge 调用，就成了一类绕过 E-INPUT-FUZZY 的办法。
  - kernel 加载的维度表含 string 显示字段，kernel 内对这些值做匹配也没有扫描。
- **建议**：§2.8 组表增加 textcore 行（按文件列出 brand、seal、labels、menuIndexKeys 各自允许的操作）和 kernel 的字符串细则。S13 增加"kernel/textcore 组"，按各自闭集扫描，让 (b) 在扫描范围内生效。

### A2-12【自相矛盾】错误码"区"的封闭清单与正文的错误码不符
- **行号**：L843 规定区只有 `DIM/MOD/EFF/VIEW/SEED/I18N/WRITER/PHASE` 八个；正文另有 GROUP、FILE、INPUT、GATE、TEXT、PATH、DIGEST、KERNEL、TSC、TEXTCORE、SEAL、GLOBAL。§1.9 的 `error_code` 是封闭枚举，"格式见 §4.2"。
- **建议**：L843 的区清单补全，或改为"区以 §4.3 表为准"。

### A2-13【缺维度】替换记号 `redacted` 没有登记代号，labels schema 会拒收
- **行号**：L470、L663（替换记号取 labels 中各语言登记的 `redacted` 形态）；L563（labels 的键必须在 idIndex 或词表中）。
- **问题**：`redacted` 不是实体 id，也不是词表句柄，labels 加载就会失败，E-I18N-REDACT-HIT 的加载期检查也跑不起来。
- **建议**：在 `_vocab.json` 登记一个 UI 记号族（例如 `ui_redacted`），由 labels 按该句柄取替换记号。

### A2-14【写死风险】aiGate 的长度上限没有规定放在规则表
- **行号**：L471、L629（"长度上限，按码点数"）。aiGate 不在规则层扫描（S10、R-6）的覆盖范围内。
- **建议**：明确写为 `rules.i18n.textMaxCodePoints.<textPath>`，按 textPath 分别取值，并写进 S19："aiGate 内数值字面量须来自 engine.rules"。

### A2-15【接口对不上】输入边输出形状里没有文字槽位
- **行号**：§1.9 第 2 条 L240 规定输出为 `{action, slots:{<槽位>: <候选编号|数值>}}`；L229 `slot_kind` 有 `text`；L628 说"提案中这个槽位只有'已填'标记"。
- **建议**：`schema:input-edge-v1` 增加文字槽位的值形态，例如 `{filled: true}`；采纳 A2-8 后改为 `PendingTextId`。§1.9 第 2 条同步修改。

---

## 二、卷一 真问题

### A1-1【两卷冲突｜总纲性】卷一停在卷二第十版，没有跟进卷二第十一、十二版
- **行号**：L3（"本卷引用的章节号与条款号以卷二第十版为准"）；附录乙第二表 L830–852；附录丙 L859–865。全文搜 `Screened`、`issueCredential`、`nameSlot`、`admitName`、`dataFiles`、`出口表`、`E-FILE-UNASSIGNED`、`第十二版`，命中 0 处。
- **问题**：卷二附录 F 的 #9（含 `dataFiles`；卷一 §4.5 L433 没有）、#14（屏蔽词分工）、#16（kernel 签发凭证、Screened、起名五步）、#17（出口表、全局白名单闭集、文件归属）在卷一都没有落点。附录乙仍标"19 条有落点"，与事实不符。
- **建议**：按卷二第十二版附录 F 逐条改，把落点写进附录乙第二表；对账脚本第 ④ 项改为核对第十二版的"卷一须对齐为"一列中的关键词。

### A1-2【两卷冲突｜重要】凭证签发方和玩家起名路径与卷二相反
- **行号**：L219（凭证"只由 aiGate 组……或 display 组（玩家命名）签发"）；L223（"玩家自由命名由 display 组签发凭证……命中 block 的命名退回命名界面"）；L369（aiGate"签发 writeText 凭证"）；V-29 L714（"凭证只由 aiGate / display 组签发""玩家命名由 display 组签发凭证"）；C-6 L799。
- **卷二口径**：L618 规定 kernel 用 `issueCredential` 签发，只有 aiGate 的写者文件可以申请；L626–632 规定起名在入库前经 aiGate 筛查，display 不签发、不判定（L467）。
- **建议**：上述各处一律改为引用卷二 §2.9 第 3 条，删去"display 签发"和"显示时 block 退回命名"。

### A1-3【两卷冲突】屏蔽词的归属与格式（核实作者遗留：确实没改）
- **行号**：C-7 L800（"屏蔽词表（唯一定义在卷二 §1.9、§6.11）……条目 `{word, category}`"）；L141（"屏蔽词表也在语言包……条目 schema 只有 `{word, category: …}`"）；V-22 L729（"条目只含 `{word, category}`"）。
- **问题**：
  1. 归属说法仍是"唯一定义在卷二"，没有改成卷二 §2.9 第 6 条的分工：数据归卷二十九，格式与算法归卷二。
  2. 格式与卷二 L661 的平铺字串冲突。按 A2-6 的建议，应以卷一保留 category 为准，回改卷二。
  3. 卷二 §1.9 与 §6.11 已不是定义处，应改为 §2.9 第 6 条。
- **建议**：C-7、L141、V-22 改为"数据：卷二十九；格式、规范化与算法：卷二 §2.9 第 6 条"，并与 A2-6 确定的格式一致。

### A1-4【两卷冲突｜重要】哈希口径：卷一有两种哈希，排除表含 textPaths；卷二只有一种，排除表不含
- **行号**：卷一 §8.3 L595（"names 与 narration 两层由 display 字段集合与 textPaths 生成"；规则可读状态哈希剔除 textPaths，存档哈希计入 Sealed.digest）；L596；C-10 L804；术语 L774；§7.1 第 5 条 L561。
- **卷二口径**：L478、L625 与附录 F #15 规定排除表 = display ∪ displayNames.*；`narration.*`、`records.*.text` 的 digest 要计入哈希，不在排除表内，不一致即报 E-DIGEST-EXCLUDE-DRIFT。
- **问题**：按卷一生成的 digest-exclude.json 含 narration，按卷二不含，两份规范一对比就会报 DRIFT。I40/V-4 指的是哪一种哈希也不确定。另外，卷二只定义了一种"存档哈希"，与卷一的"两种哈希"对不上。
- **建议**：两卷选定同一个模型。较合理的是保留卷一的两种哈希：规则可读状态哈希排除全部 textPaths，供 I40 使用；存档哈希计入 Sealed.digest，供存档完整性使用。然后在卷二 §2.9 第 3 条分别写明两种哈希的排除表，附录 F #15 同步修改。

### A1-5【两卷冲突】显示闸的输出代号 `block`
- **行号**：L76、L116、L228（"pass / replace / block（整段改用 T0 模板叙述）"）；I49 L628；V-25 L713；术语 L759。
- **卷二口径**：L663 规定复核后仍命中时，整段改用替换记号，没有 block，也不换成 T0 模板。
- **建议**：选定其中一种，在卷二 §2.9 第 6 条写全（可以把"复核仍命中"定义为 block，并写明 block 时输出什么），卷一只引用。

### A1-6【两卷冲突】输入边的 import 范围，以及谁把点选和键入变成代号
- **行号**：L246（输入边"只许 import textcore、动作目录投影、候选集投影、primitive-schema"）；I48 L627；V-23 L711；L-9 L112 与 §2.9.1 L206（显示层把点选直接变成代号，把自由文字交给输入边）。
- **卷二口径**：矩阵 L447 允许 inputEdge import kernel 和 aiGate（`admitName`）。DOM 事件入口是 `host/dom.mjs`（L567），display 不得 import inputEdge，也没有事件类全局对象（L547）。
- **建议**：V-23、I48、L246 补上 kernel（码点表）和 aiGate 的 `admitName`（如果采纳 A2-8 则保留）。L-9 和 §2.9.1 改为"host 把点选和键入转成代号或 Text，交给规则层或 inputEdge；display 只负责渲染"。

### A1-7【两卷冲突】kernel 行对 Sealed 构造方和读文件范围的说法过时
- **行号**：§3.2 kernel 行 L373（"`Text` 与 `Sealed` 由 textcore 构造"；"读文件只在 `kernel/load/*`、`kernel/validate/*`"；品牌清单没有 TextScope、Credential、Sealed）。
- **卷二口径**：L592 规定 Sealed 由 kernelApi `makeSealed` 构造；L544 规定 `node:fs` 只在 `kernel/load/*`、`kernel/save.mjs`、`kernel/report.mjs` 中可用，validate 不读文件；L612 列有 TextScope、Credential、Sealed。
- **建议**：改为引用卷二 §2.9 第 1、2 条，不再复述。

### A1-8【两卷冲突】句柄写法示例，以及"JS 语言记号小表"这一例外
- **行号**：§3.1 第 1 条 L348–349：`V.sfam.sfam_sleep`、`enum sfam`、`V.verb.transfer`、`E.E_ROUTE_SEASON_CLOSED`；"JS 语言记号（typeof 结果、编码名、JSON/Date 格式名）由卷十二登记为封闭小表"。
- **问题**：
  1. 卷二 §1.9 L229 规定词表族的键就是族名，不写前缀缩写（应为 `V.status_family.sfam_sleep`）；verb 族条目带 `verb_` 前缀；错误码句柄是 `E.<code>`。卷一的写法与之冲突，会导致句柄生成器的接口不一致。
  2. 卷二 S13 第 ④ 条和 §2.8 都没有这类例外：`typeof x === 'string'` 在卷二属于违例，卷一却放行；`Date` 又被卷二 L536 的全局闭集排除。
- **建议**：示例改用卷二写法。"JS 语言记号"一条或删去，或在卷二 §2.8 正式列为例外，例如 `typeof` 比较只许和登记过的 `TypeofTag` 句柄比较。

### A1-9【引用不存在／接口冲突】G-2 引用了不存在的条款，还允许在内核组之外建目录
- **行号**：§6.3 L507："卷二 §2.8 第 4b 条"（卷二只有第 4a 条）；"允许新增……`server-plugin/dimensions/` 下的新文件"。
- **问题**：维度、校验和继承代码按卷二属于 kernel 组（`server-plugin/kernel/**`）。`server-plugin/dimensions/` 按卷二 L655 会落进规则层，与"共享计算设施归第〇层"相冲突。
- **建议**：改为"卷二 §2.9 第 1 条登记边界入口表"和"`server-plugin/kernel/**` 下的新文件"。

### A1-10【两卷冲突】偏离行的 string 维度被当作合法显示字段
- **行号**：§4.4 L427（"偏离行 `state.created[*].props` 内的 string 维度一律视为显示字段并进哈希排除"）；§8.3 L595–596。
- **问题**：卷二 L457 认为 dimension 路径不会有自然语言，与此相反。二者都没有让这类文字经过守门（见 A2-10）。
- **建议**：随 A2-10 一起改：偏离行禁止写 string 维度，卷一删去这一句。

### A1-11【两卷冲突】菜单显示名折叠后重复，是加载期报错还是运行期歧义
- **行号**：L141（"校验器禁止……同一菜单上下文内折叠后相同的显示名"）；L244；I47 L626；V-22 L729。
- **卷二口径**：B10(e) L1497 规定折叠后相同时运行期返回 `ambiguous` 并退回菜单；§4.3 没有对应的加载期错误码。
- **建议**：二选一。如果保留卷一的加载期检查，卷二需新增错误码（例如 `E-I18N-LABEL-FOLD-DUP`）并写入 §1.9，B10(e) 改为夹具测试"加载失败"。否则卷一删去"校验器禁止"一句。

---

## 三、对作者自定设计逐项判断（任务第 3 项）

| 设计 | 判断 |
|---|---|
| `kernel/handles/*`（vocab-handle、entity-id、keys） | 合理。强转按文件收口，与 E-KERNEL-ONLY 一致。kernelApi 没有登记句柄构造入口（A2-4） |
| `kernel/save.mjs` | 合理。出口归 kernel，kernel 看不到 Text。与读档入口 `kernel/load/save.mjs` 同名，易混淆（小项）。实际存档有一部分走 SillyTavern 的 `/api/chats/save`（extension/index.js:139），尚未建模（A2-1） |
| `kernel/report.mjs` | 合理，"console 只在一处"可以机判。浏览器侧代码无法 import 它，浏览器错误没有出口（A2-1） |
| `gate/screen.mjs` + `Screened<Text>` | 设计正确，可以让"出口前已筛查"由类型保证。跨进程会断开（A2-1）；产出 Text 的强转问题见 A2-3 |
| `nameSlot.request/register` | 不合理：规则层产生副作用、受语言包影响、事务未定义（A2-8）、与可删输入边冲突（A2-9）。建议改为提案前暂存 |
| 替换后复核一次 + E-I18N-REDACT-HIT | 合理，有上限、不会循环，错误码区 I18N 合适。缺 `redacted` 代号登记（A2-13）；与卷一的 block 口径冲突（A1-5） |
| 词表 JSON 格式 | 不合理：缺 category（A2-6、A1-3） |

## 四、已知遗留判断（任务第 4 项）

| 遗留 | 判断 |
|---|---|
| textcore seal 的 sha256 来源 | 真问题（A2-7）。按作者的建议改为 `makeSealed(bytes)` 即可 |
| host 定时器等全局对象被闭集禁止 | 真问题（A2-2、A2-1）。B10(g) 的 AI 超时在现行条文下做不出来；浏览器侧还缺 `fetch` 和 SillyTavern API。不能推给卷九、卷十一 |
| 新旧 kernel 文件拆并 | 不算设计问题，可以归卷十一迁移卡。但 D.3 L1849 列出的"现有 kernel 文件"中，`vocab.mjs`、`errors.mjs` 在仓库里不存在（只有 server-plugin/{storage,ledger,primitives,seed-keys}.mjs），措辞要改（小项）。另外，新的 `kernel/storage.mjs` 不得使用 `node:fs`（L544），现有 storage.mjs 的读写盘部分要拆到 save.mjs 和 load/save.mjs，应在迁移卡里写明 |

---

## 五、小项（不必改）

1. 卷二 L1942 文末写"（卷二 第十一版 完）"，应为第十二版。
2. 卷二 §2.7 JSON 示例：pathTypes 行后缺逗号，`//` 注释不是合法 JSON。建议注明"示意，非可解析 JSON"。
3. 卷二 `kernel/save.mjs` 与 `kernel/load/save.mjs` 同名易混，建议把出口改名为 `kernel/save-write.mjs`。
4. 卷二 D.3 L1849 称"现有 kernel 文件 vocab.mjs、errors.mjs"，仓库里没有这两个文件。
5. 卷二 blocklist 的 `lang` 字段值写 `zh` 还是 `lang_zh` 没有说明；`displayNames.lang` 同理，language 族前缀是 `lang_`。
6. 卷二 L663"整段改用替换记号"中的"整段"指整条输出还是该命中段，有歧义。
7. 卷二 L611 写"再按 §1.9 规范化"，没写明是哪几步（与 A2-6 同源）。
8. 卷一 §3.2 L361 写"五个代码模块组和一类数据"，表中实际是七组加 textcore 加 kernel。
9. 卷一 C-4 L797 号称"成员清单的唯一写全处"，但缺 naming-gate、record-text-gate、prompt.mjs、gate/screen.mjs、gate/load-blocklist.mjs、kernel/load/save.mjs、kernel/save.mjs、kernel/report.mjs 等第十二版新文件。
10. 卷一 L143 的代号正则 `^[a-z][a-z0-9_]*$` 没有卷二 `{1,47}` 的长度上限。
11. 卷一附录丙仍是对卷二第十版的输出（L859、L865），需要重跑。
12. 卷二 §2.9 第 1 条把 `kernel/validate/dimensions-validate.mjs` 列为边界入口，但 kernel 白名单不给 validate 开放 `node:fs`。建议注明"校验器接收 load 读入的数据，不自己读文件"，或者从入口表移到"内部"。
