模型：claude-opus-5-5，中档（主会话 11-13 按运行记录补注）

# 卷一卷二 收口一审 B（机制可机判性、可绕过性、落地可行性、分层一致性）

审查对象：卷二第十二版（1941 行）、卷一第十版（865 行）。本机只做静态读（Read/Grep/find/sed），未运行任何脚本或测试。代码证据指 F:/dnd 当前工作树。

按收口规矩，本轮把真问题一次列全；第二轮只核对下列各条是否改好。

## 结论

- 卷二真问题 26 条（B2-1 … B2-26），卷一真问题（含两卷冲突）15 条（B1-1 … B1-15），小项 12 条。
- 最重要的三条：
  1. **B2-8 两个进程的现实与 Text 模型对不上**：extension 跑在浏览器里（部署到 SillyTavern/public），不能 import server-plugin 的 kernel/textcore/gate；`projection/dom-sink.mjs` 放在没有 DOM 的 Node 侧；`Screened<Text>` 过 HTTP 后在浏览器侧只能重新 `narrow → RawText → brand` 成未筛查的 `Text`，而 `release` 只收 `Screened<Text>`，所以浏览器侧没有任何合法办法把文字写进 DOM。
  2. **B2-1 / B2-2 白名单可以被一整类写法绕过**：宿主能力可以经对象属性拿到（`window.*`、`el.ownerDocument.defaultView.*`、SillyTavern 的 `getContext()`），也可以经 import 拿到（`../tools/*.mjs`、`world/design/*.mjs`、npm 包、不带 `node:` 前缀的 `'fs'`、JSON 模块、仓库外的 `../../../extensions.js`）。现有代码正是这样写的，而全局白名单只按标识符和 `node:*` 判定。
  3. **B1-1 / B1-3 两卷在凭证与哈希上直接冲突**：卷一仍写"玩家命名由 display 组签发凭证"、"规则可读状态哈希剔除 textPaths（两种哈希）"；卷二第十二版是"凭证只由 kernel 签发、只有 aiGate 可申请"、"排除表 = display ∪ displayNames，叙述的 digest 进哈希（只有一种哈希）"。按卷二口径，卷一的 V-13"T0 与 T2 同存档哈希相同"按构造就不可能成立。

---

## 一、卷二真问题

### B2-1 宿主能力经对象属性可达，全局白名单与出口表"表外碰不到 sink"不成立（机制性漏洞，成类）
- 位置：卷二 L535–L553（白名单按"全局标识符"与 `node:*` 判定，检查器为 eslint `no-restricted-globals` / `no-restricted-imports`）；L570（"表外文件碰不到任何宿主 sink"）；L499（display"DOM 属性/类名字面量赋值不算操作"）。
- 问题：
  - 白名单只检查标识符引用，不检查属性可达性。`host/dom.mjs` 可以用 `window`，`window.eval`、`window.Function`、`window.fetch`、`window.localStorage` 因此全部可达。L538 的"明确禁止 eval/Function"只禁标识符，挡不住这些写法。
  - 任何收到 DOM 元素的 display 文件，都能经 `el.ownerDocument.defaultView.fetch(...)`、`el.innerHTML = …` 拿到宿主能力。tsc 配了 lib.dom 后这些写法都有正确类型，不触发任何违例码。
  - L499 明文允许 display 在 dom-sink 之外"字面量赋值" DOM 属性，这本身就和"DOM 写入只经 dom-sink"矛盾。
  - SillyTavern 上下文对象 `getContext()` 带有 `saveChat`、`generateRawData`、`getRequestHeaders` 等能力，作为参数传到哪个文件，那个文件就有了宿主能力。
- 证据：extension/map-view.mjs:195 `doc.defaultView?.ResizeObserver`；mail-view.mjs:22、people-history.mjs:33、map-view.mjs:170 都经 `context.saveChat()` 写盘；runtime.js:45 经 `ctx().generateRawData` 发 AI 请求。这些都是 display 组文件（L423 glob）。
- 建议：改为按类型移除能力。各组用独立的 tsconfig project：只有 `extension/host/dom.mjs` 与 DOM 出口文件所在 project 的 `lib` 含 DOM；display 只拿不透明句柄（如 `SinkHandle`），不拿 `HTMLElement`；ST 上下文的类型只在 host 的声明里出现。另加一条规则：对宿主对象属性赋值、调用宿主对象方法，只许出现在出口表文件内，违例码 E-TEXT-EXIT 或新码。删掉 L499 的"字面量赋值不算操作"。

### B2-2 import 目标在矩阵之外：tools/、world/*.mjs、npm 包、裸内建名、JSON 模块、仓库外路径（机制性漏洞，成类）
- 位置：L440–L455 矩阵只覆盖七组 + textcore + tests/CLI；L537 只管 `node:*`；L653 覆盖门禁的磁盘清单只含 server-plugin 与 extension；E-TSC-PARSE（L867）只认"文件、网络…读取"。
- 问题：import 一个不受限的模块，就等于拿到它的全部能力，同时也绕过了覆盖门禁和入口表。具体有六类：
  - 规则层 import `../tools/x.mjs`：tools 不受白名单限制（L553）。
  - 规则层 import `world/design/*.mjs`：这些代码不在覆盖清单内。
  - import npm 包：白名单只管 `node:*`。
  - 写 `import fs from 'fs'`：不带 `node:` 前缀，不在 `node:*` 判定范围内。
  - `import x from '…json' with {type:'json'}`：这是不经 `narrow` 的文件读取。
  - extension import 仓库外的 SillyTavern 模块。
- 证据：
  - server-plugin/consistency-service.mjs:5 import `../tools/deepseek-client.mjs`；index.mjs:9 import `../tools/load-world.mjs`；runtime-world.mjs:8 import `../tools/kc-processing.mjs`。
  - civic.mjs:7 import `../world/design/m5-civic-rules.mjs`。
  - carry.mjs:8、currency.mjs:14、derived.mjs:6 用 JSON import。
  - retrieval.mjs:2 import `opencc-js`；primitive-schema.mjs:3 import `ajv`。
  - extension/index.js:1、runtime.js:1 import `'../../../extensions.js'`。
- 建议：把 import 说明符也写成闭集，按组列出：允许的相对路径只能落在 server-plugin/** 或 extension/** 且符合矩阵；`node:*` 按组行列出；npm 包逐个登记到具体文件（如 `ajv` 仅 `kernel/validate/narrow.mjs`）；裸内建名一律禁止；JSON import 一律记 E-TSC-PARSE。覆盖门禁的磁盘清单改为"全部被解析到的 import 目标"。

### B2-3 `as`/`@type` 之外的类型断言形式没有被封住（机制性漏洞，成类）
- 位置：L485、L488（4a 只禁 `as` 与 `/** @type */` 强转）；L596–L609 强转豁免表"按文件路径判定"。
- 问题：下列写法都能把裸 `string` 变成品牌类型，但都不是 `as`/`@type`，检查器抓不到：
  - 手写声明文件：`foo.d.mts` 与 `foo.mjs` 同名时，导入方用 .d.mts 的类型，tsc 不拿 .mjs 的实现去核对它。所以 `export function h(s: string): Handle<'status_family'>` 配上 `export const h = s => s` 就能造出品牌值。
  - 用户自定义类型谓词 `@returns {x is Handle<…>}` 与断言函数 `asserts x is …`：函数体不受核对。
  - JSDoc `@overload`：实现签名不严格核对。
  - `.ts`/`.mts`（L653 准入）里的尖括号断言 `<T>x` 与非空断言 `!`。
- 证据：L653 准入 `mts/ts` 与 `.d.ts`；L655 "含 .d.ts"。
- 建议：
  - 声明文件做成闭集：只许 `kernel/types.d.ts`、`textcore/types.d.ts`、生成的 `kernel/state-types.d.ts` 与登记的宿主 shim；其他 `.d.ts`/`.d.mts`/`.d.cts` 一律 E-TSC-ESCAPE-ASSERT。
  - 类型谓词、断言函数、overload、尖括号断言、非空断言都并入 E-TSC-ESCAPE-ASSERT，只许出现在豁免表文件内。

### B2-4 kernel 组按目录开放且不受语言扫描约束，可以整类搬逻辑进去（机制性漏洞）
- 位置：L429 `kernel/**`；L1469 S13 规则层组排除七组，含 kernel；L496 §2.8 kernel 行"构造/拼接/解析全部代号类品牌类型"，没有位置约束；L422 只有 inputEdge 有 ≤8 上限。
- 问题：把 `npc.activity.includes('睡')` 这类逻辑放进 `server-plugin/kernel/x.mjs`，S13 与位置白名单都不管。kernel 加载维度表时还能读到 `basis`/`note` 等文字（L172、L217），所以 kernel 本身能读语言。
- 建议：
  - kernel 成员改成显式文件清单，增项须李白批。
  - kernel 文件同样受 S13 ①③④ 与位置白名单约束；只有豁免表文件和 `kernel/handles/*` 可以做解析。
  - S13 的扫描对象改为"七组之外 + kernel"。

### B2-5 kernelApi 清单不全，又用 `#*` 通配，不是闭集（接口对不上 / 机制漏洞）
- 位置：L381 写明 kernelApi 含 `stateMemo / inputsOf`；L430 JSON 没有这两项，也没有：
  - `V`/`E` 句柄表：S13 (a) L1471 说它们是"唯一合法形式"，规则层却无从 import；
  - `declareInputs`、`declareStateWriter`、`declareLedgerWriter`、`explain`（B5、卷一 L-0）；
  - 调度器注册（卷一 L171 `registerAdvanceHook`）、`sample`、实体 id 生成。
  同时 `kernel/storage.mjs#*`、`ledger#*`、`primitives#*` 用通配，把整份存储层（含整文档读写，现 storage.mjs 导出 `atomicJSON/applyPatches`，见 consistency-service.mjs:3）都开放给规则层。
- 问题：规则层要么用不了句柄与声明函数，要么可以经通配绕过 readers/writers 与 declareInputs，直接读写整份文档。
- 建议：kernelApi 改为逐个导出名的闭集，补齐上述函数，另加 `kernel/handles/generated.mjs#V,E`；删掉通配；`readSealed`/`writeSealed` 的"仅某组"写进机读字段，不放在注释里。

### B2-6 凭证与 scope 的绑定无法由机器判定（机制性漏洞）
- 位置：L594 `TextScope` 由 kernel 加载期生成；L603 只有 `kernel/handles/keys.mjs` 可以 string→TextScope；L618 检查器"按调用文件核对：调用文件必须是该 scope 登记的写者"；L433 一路径一写者。
- 问题：
  - 没说 aiGate 怎样拿到某一条 TextScope。aiGate 不能写字面量，也不能自己强转。
  - scope 是运行期值，静态检查器不知道某次 `issueCredential(scope)` 传的是哪一条；kernel 在运行期也无从知道调用者是哪个文件。
  - 结果是 narration-gate 拿到 `displayNames.*.text` 的 scope 就能写玩家名，"一路径一写者"落不到机器上。
- 建议：二选一。
  - 用类型绑定：kernel 生成 `TextScope<'narration.*'>` 这类字面量参数化的常量，检查器用 tsc 解析类型实参，再与 textWriters 和调用文件比对。
  - 用能力注入：启动时由 host 把各自绑定好 scope 的写入函数注入对应写者模块，`issueCredential` 不再对组内开放。

### B2-7 textcore `seal` 算不出摘要（接口对不上）
- 位置：L545 textcore 白名单没有 `node:crypto`；L616 `seal` = 编码 + 计算摘要 + `makeSealed`；L615、L604 `makeSealed(bytes, digest)` 要求调用方给出 digest，再由 kernel 复核；kernelApi（L430）没有导出哈希函数。
- 问题：textcore 没有合法办法算 sha256，`seal` 无法实现。
- 建议：改成 `makeSealed(bytes)`，由 kernel 计算摘要；`seal` 只做编码。

### B2-8 两个进程的现实与 Text 模型对不上（落地不可行，最重要）
- 位置：L423 display 含 `extension/**`；L427 host 含 `extension/host/**`；L547、L574 DOM 出口 `projection/dom-sink.mjs`，属 server-plugin/projection；L545 `textcore/labels.mjs` 用 `node:fs`；L570–L576 `release` 只收 `Screened<Text>`；L551、L566–L567 白名单与入口表写的是 `host/dom.mjs`、`host/http.mjs`，不带根目录。
- 问题：
  - extension 由启动脚本复制到 `SillyTavern/public/scripts/extensions/third-party/infinite-fields`，在浏览器里运行，不能 import server-plugin 下的 kernel/textcore/gate。
  - Node 侧没有 `document`，所以 dom-sink 放错了进程。
  - 文字过 HTTP 后成了普通 JSON 字串。浏览器侧 host 只能 `narrow → RawText → brand` 得到未筛查的 `Text`，而浏览器侧没有 gate（blocklist 要靠 `node:fs` 读），所以拿不到 `Screened<Text>`，`release` 永远调不了。
  - `host/dom.mjs` 在两个根目录下都可能存在，"按文件路径判定"会有歧义。
- 证据：启动酒馆.ps1:29；extension/manifest.json `"js": "index.js"`；`grep "from .*server-plugin" extension` 结果为零；extension 经 `fetch('/api/plugins/infinite-fields/…')` 取数据（runtime.js:65、ui-messages.mjs:10）。
- 建议：
  - 写明跨进程的线上契约：服务端 `host/http.mjs` 出口的 schema 字段类型为 `screened`；浏览器侧 `extension/host/dom.mjs` 的 `narrow` 只能把这类字段映射成 `Screened<Text>`（信任边界是同源插件 API，要写明）。
  - 给浏览器准备一份 textcore（只有 brand/release，无 fs；labels 经 HTTP 取）。
  - DOM 出口移到 `extension/` 下。
  - 所有路径表一律写仓库全路径。

### B2-9 AI 调用的位置、密钥、超时与 R1 通路都没有合法实现路径（落地不可行）
- 位置：L550 只有 `ai-gate/prompt.mjs` 可以用 `fetch`；L551 `process.env` 只在 `host/http.mjs`；§2.8 aiGate 行没有字符串拼接；L447 inputEdge 只能 import aiGate 的 `admitName`；inputEdge 闭集见 L497；B10(g) L1500 要求"AI 超时 → 退回菜单"。
- 问题：
  - 现行 AI 调用有两条路，都不在设计里：浏览器侧经 SillyTavern 调用（runtime.js:45、:336，用玩家在 ST 里配置的密钥）；服务端经 `tools/deepseek-client.mjs` 调用，密钥取自 `process.env.DEEPSEEK_API_KEY`（consistency-service.mjs:5、:28；npc-planning-service.mjs:9）。
  - 设计没有写密钥从 host 传到 aiGate 的通路与类型，aiGate 也不能拼 `Authorization` 头。
  - 白名单里没有 `AbortSignal`/`setTimeout`，超时做不了，B10(g) 无法验收。
  - 卷一 C-4 把 `ai-r1.mjs`、`injection-guard.mjs` 放在 inputEdge，但 inputEdge 不能调用模型；注入防线要做的剥离是字符串操作，在 inputEdge 闭集外。
- 建议：
  - 定下 AI 走哪条传输：服务端 aiGate，或者浏览器 ST 并把它登记为出口。
  - 密钥定为不透明品牌 `Secret`，由 host 入口产出，只许作出口请求头的实参。
  - aiGate 行加 `AbortSignal.timeout`。
  - R1 通路定为 inputEdge → aiGate `interpret(text, candidates) → codes`，注入防线移到 aiGate，并写清它允许的操作。

### B2-10 出口表与 textPaths 漏掉现有的持久化输出和玩家自由文字（接口对不上 / 缺维度）
- 位置：L570"进程向外写出的一切……只能经下表"；L432 textPaths"state 内允许存自然语言的全部路径"。
- 问题：现有功能里有下列写出与文字存储，既不在出口表，也不在 textPaths：
  - 写进 ST 聊天元数据：map-view.mjs:169–170 地图标记、people-history.mjs:32–33 人物笔记、mail-view.mjs:21–22 收藏；
  - ST 存档接口 `/api/chats/save`：index.js:139；
  - 浏览器 `localStorage`：start/play-town.js:77–78、ui-settings.mjs:30；
  - Blob 下载：index.js:111–115；
  - 服务端写模型费用账、用量日志、审查记录文件：consistency-service.mjs:18–37；
  - 旁路记录：sideband.mjs；
  - 玩家手记写进长期记忆：index.js:172；memoryStream 涉及 59 个文件。
  其中地图标记、人物笔记、手记都是玩家输入的自由文字，没有任何 textPath 能容纳，也不经 gate。
- 建议：逐项选一个去处：登记为出口或 textPath（各配写者与守门），或者在迁移表里写明"功能删除"。另把 textPaths 改为"各卷登记，卷二列首批"，并写明登记门槛。

### B2-11 HTTP 响应无法合法序列化（落地不可行）
- 位置：L570 `release` 的返回值"只许立即传给同一行登记的宿主 sink"；L498 host"零字符串操作"；L576 http 出口输入是"`Screened<Text>` 与代号结构"。
- 问题：HTTP 响应是含多段文字与代号的 JSON 对象。把 `release` 结果放进对象属性再 `JSON.stringify` 或 `res.json(obj)`，都不算"立即传给 sink"。
- 建议：定义一个登记出口内的序列化器（如 `host/http.mjs` 内的 `respond(payload)`）。payload 类型由 schema 生成，含 `Screened<Text>` 字段，`release` 只在序列化器内部调用。

### B2-12 迁移没有给出文件级去处，依赖它的规则一上线游戏就跑不起来（落地不可行）
- 位置：§6.11 L1404 只安排了 `extension/input-view.mjs`；L655 未匹配的代码文件默认属规则层；kernelApi（L430）引用 `kernel/storage.mjs` 等新路径，但没有搬迁表。
- 问题：下列现有文件按目录归组后会立即违反白名单或矩阵，文档没有给去处。
  - server-plugin 侧：
    - ui-routes.mjs:1、:16–17：`fs.readdir`、动态 `import()`、router，却被 L423 的 `ui-*.mjs` glob 归进 display；
    - index.mjs:29：`init(router)` 与 `process.env`；
    - storage.mjs、migrations.mjs:60：写文件、用 `Date`；
    - ledger/primitives/derived/advance-registry/digest-exclude/action-registry/action-text/holding-kinds/seed-keys：卷一说它们属第〇层，但仍在根目录，多处经 `node:url` 加 fs 读 world 文件（action-registry.mjs:9、action-text.mjs:5、seed-keys.mjs:3）；
    - AI 与 IO 服务：consistency-service、npc-planning-service、population-service、sideband；
    - population.mjs:35 读 blocklist。
  - extension 侧：
    - runtime.js、index.js、ui-messages.mjs、background-view.mjs、start/play-town.js 用 `fetch`、`postMessage`、`localStorage`；
    - tools.mjs 是写给 AI 的中文工具说明，即提示文字；
    - turn.mjs、prompt.mjs、message-view.mjs 被 server-plugin 规则层 import（consistency-review.mjs:1–3、consistency-evidence.mjs:3），按矩阵是规则层 import display，属违例。
- 建议：在 G-1 前置条件里加一张文件级迁移表，逐个写明"旧文件 → 组 / 新路径 / 拆分 / 删除"，覆盖全部带 IO、AI、DOM 或跨树 import 的文件。脚本第 22 项的核对对象从"代表路径"改为"真实文件全集"。

### B2-13 legacy/compat/migrations 与覆盖门禁、逃逸口封闭互相矛盾（自相矛盾 / 落地）
- 位置：L653–L655 覆盖门禁对 server-plugin 全部代码文件生效，ignore 必须为空；L488 4a 适用于 server-plugin 全部文件；L1455 S 扫描排除 legacy/compat/migrations；卷一 R-8 L340 迁移入口可以读版本。
- 问题：这三个目录按目录归组属规则层。legacy/core.js 这样的旧 JS 必须通过 strict tsc、不能有 any、不能用 fs 或 Date，同时又"单列计数、不扫描"，两头说法冲突。
- 建议：给它们设一个 legacy 组，配独立白名单与退役期限；或者把"G-1 前删除"写成门禁条件。

### B2-14 内建闭集与本卷自己的规格、运行需要不符（自相矛盾 / 落地）
- 位置：L536 闭集；L360 `View.dims: Proxy/惰性`；卷一 §2.2 L124 开发模式 Proxy。
- 问题：
  - `Proxy` 不在闭集里，§2.2 却要求用它。
  - 超时需要的 `AbortSignal`/`setTimeout` 不在闭集里（见 B2-9）。
  - extension 的 host 需要计时器（play-town.js:67）和 `crypto.randomUUID`（action-builder.mjs:120、runtime.js:217）；只有 host/dom.mjs 能经 `window` 拿到它们。
  - server-plugin 有 129 个文件、316 行用了 `structuredClone`，迁移表没提。
- 建议：两种改法任选其一：把 Proxy 加进闭集（限 kernel 或 view 文件），或把 §2.2 改成 getter。按组补上计时器与 AbortSignal 行。在迁移表里写明 structuredClone 的替代（如 kernel 导出的 `clone`）。

### B2-15 "dimension 路径的值不可能是自然语言"不成立（机制性漏洞）
- 位置：L457 由此把 E-TEXT-UNGATED 说成"类型判定"；L172 维度表允许 `string`（basis、note 等显示字段）；L434 `created.*.props.*` 的类型是 `dimension`。
- 问题：string 类型的显示维度一旦出现在偏离行，运行期写入 `created.*.props.<stringDim>` 就是把自然语言写进了 textPaths 之外，而且不报 E-TEXT-UNGATED。卷一 §4.4 L427 甚至明文预期"偏离行内的 string 维度"会存在。
- 建议：
  - string 维度不得 `modifiable`，不得进 `instanceDimensions`，不得出现在任何运行期可写路径上。
  - 加载期展开 `dimension` 的 pathTypes 时，遇到 string 维度即报 E-TEXT-UNGATED。
  - 卷一 L427 同步删除那句预期。

### B2-16 屏蔽词表格式丢了类别维度（缺维度 / 两卷冲突）
- 位置：L661 `entries` 只是字串数组；L1403 §6.11 说"各语言两档保留"，但格式里只有一个 entries，自相矛盾；卷一 L141、L221、L233、V-22 L729 依赖 `{word, category}` 输出 `reject:real_person` / `reject:minor_content`。
- 证据：world/meta/blocklist.json 现有 `names` 与 `realPeople` 两档。
- 建议：条目改为 `{word, category: enum blocklist_category}`（族登记进 §1.9）；`matchBlocklist` 的命中列表带 category；aiGate 按 category 映射拒收代号。

### B2-17 规范化步骤的编号引用错了，导致 needle 不做大小写折叠（自相矛盾 / 结果不确定）
- 位置：§1.9 L241 定义 ① NFC、② 裁首尾空白、③ 大小写折叠；L564、L661、L662 却写"§1.9 ①②（NFC、简单大小写折叠）"。
- 问题：按编号执行，`gate/load-blocklist.mjs` 只做 NFC 和裁空白，不折叠大小写。matcher 对文本折叠了大小写，needle 没折叠，A19"大写条目对小写文本仍命中"就不成立。两种读法会得出不同结果。
- 建议：needle 与文本统一写"§1.9 ①③"，不裁空白；三步算法的第 ② 步写明就是"§1.9 第 ③ 步"。

### B2-18 `matchIdLeak` 的 needle 范围不确定（结果不确定）
- 位置：L662 needle = "idIndex 中带前缀的全部 id ∪ 全部句柄字串"，在"加载期冻结"；L471 写"带前缀"；卷一 L221 没有"带前缀"。
- 问题：
  - 运行期新增的实体 id（`state.created` 中生成的 NPC 等）不在冻结集合里，恰好漏检最可能泄漏的 id。
  - "全部句柄字串"是否包含不带前缀的代码内封闭枚举值（`body`、`day`、`set`、`text`、`place`…）没有说清。如果包含，英文 AI 叙述会大面积被拒收。
- 建议：needle = 带前缀的 id（运行期增量更新）∪ 带前缀的词表代号，明文排除代码内封闭枚举；卷一 L221 同步。

### B2-19 `E.<code>` 句柄写不出来（机制性漏洞）
- 位置：L1471 S13 (a) `E.<code>`；§4.2 L843 码形如 `E-<区>-<名>`。
- 问题：码里有连字符，不是合法的 JS 标识符，只能写 `E['E-DIM-…']`。而计算成员里放字串字面量正是 S13 ② 与位置白名单的违例。卷一 L349 写的 `E.E_ROUTE_SEASON_CLOSED` 用了下划线映射，但卷二没有定义这个映射。
- 建议：在 §4.2 定义标识符映射（连字符改下划线），句柄生成器按这个映射生成；卷一示例同步。

### B2-20 S13 内部两处矛盾（自相矛盾）
- 位置：L1470"手段：AST（acorn/espree 级），按类型白名单判定"，而 L1471 (a) 写"类型来源是 tsc"；L1471 (b) 规定代号格式正则"仅限"三个文件。
- 问题：
  - acorn/espree 解析不出类型，靠它无法做类型判定。
  - 豁免表 L601–L603 要求 `kernel/handles/vocab-handle.mjs`、`entity-id.mjs`、`keys.mjs` 按代号正则校验或按文法解析，它们不在 (b) 的三个文件内。而 kernel 又被 S13 整体排除，(b) 要么没有作用，要么和豁免表冲突。
- 建议：S13 手段改为"tsc 加 typescript-eslint 类型感知"；(b) 的名单改为 `kernel/handles/*`、`kernel/validate/*`、`kernel/load/vocab-load.mjs`，并与 B2-4 一起把 kernel 纳入扫描。

### B2-21 S10 数值常数可以被整类绕过（机制性漏洞）
- 位置：L1465 S10 只统计不在白名单内的 `NumericLiteral`；卷一 R-6 L318 说常量表达式也计入。
- 问题：
  - 用白名单内的字面量组合常数可以逃过：`1+1+1`、`1<<4`、`[0,0,0].length`、`-1>>>0`。
  - BigInt 字面量 `300n` 在 ESTree 里不是 NumericLiteral，也逃过。
  - 反过来，kernel 的 PRNG 常数（§1.10 的 `52n`、`4096`、`slice(0,16)`）会被报，而本卷没有给它们豁免。
- 建议：S10 改为常量折叠判定，凡静态可求值的数都计入；BigInt 字面量计入；为 kernel 与 det-math 常数设登记豁免表；与卷一 R-6 的口径对齐。

### B2-22 state 读取的叶子核对按语法名判定，可以被别名绕过（机制性漏洞）
- 位置：L383 收集 `state.<key>`、`state?.<key>`、解构、`state[字面量]`；L384 禁止清单。
- 问题：禁止清单只列了"存入闭包变量后在别处读"，没有覆盖局部别名（`const s = state; s.npcs`）、`[state][0].npcs`，也没有覆盖经 kernelApi 存储函数取回整份文档后再读（与 B2-5 相关）。
- 建议：按生成的 `State` 类型做类型追踪，凡是静态类型为 `State` 或其子路径类型的表达式都纳入，不依赖变量名。

### B2-23 import 矩阵的 host→gate 与"读法"说明自相矛盾（自相矛盾 / 两卷冲突）
- 位置：L452 host 行的 gate 列为空；L455 读法写"gate 只被 outputGate、aiGate、host、tests/CLI import"；卷一 L367 与 V-31 L715 也写 host 可以 import gate。
- 建议：先定 host 是否需要 gate（按"只原样传递"的定位，应当不需要），再改 L455 与卷一的两处。

### B2-24 玩家起名的入库结果依赖语言，事务时机没有定义（结果不确定 / 接口）
- 位置：L629 `admitName(targetId, slotCode, text)` 没有语言参数，而 `screen(text, lang)` 要求语言（L591）；L632 `writeSealed` "与该动作的其余写入同批提交"。
- 问题：
  - 用哪种语言的 blocklist 没有定义。若按界面语言，同一输入在不同界面语言下 `named` 结果不同，规则层是否提交动作也就随语言变化，事件流随之不同（违背 G1/G2 的精神与 I40）。
  - `writeText` 在结算过程中经 kernelApi 直接写入，和"第二层以上只产提案、由事务归约"（卷一 L-2）冲突，暂存的机制也没定义。
- 建议：
  - 命名筛查固定用全部已发布语言 blocklist 的并集，或者用文字自带的 `lang`。
  - 把 `named` 记成输入事件，回放时不重算。
  - `writeSealed` 写入事务的待提交区，`named=false` 时随事务丢弃。

### B2-25 规则层里两个不带品牌的 string 能否比较，没有判据（无法机判）
- 位置：L487 位置白名单要求"两侧为同一品牌或其子类型"。
- 问题：两侧都是不带品牌的 `string`（如两个显示字段 `a.basis === b.basis`）算不算"同一品牌"，文字没有说；若算，规则层就能比较自然语言。
- 建议：明文写"不带品牌的 `string` 在规则层没有任何合法位置"，并加一条反例。

### B2-26 gate 组同时装运行期匹配器和 CI 扫描器，后者在这个组里实现不了（落地不可行 / 接口）
- 位置：L424 注释"门禁与扫描（卷十二）"；卷一 L367、C-4 L797"卷十二的扫描器与门禁脚本（解析源码 AST）"；L548 gate 只有 `gate/load-blocklist.mjs` 可以用 fs。
- 问题：扫描器要读全部源码、调用 typescript 和 eslint（都是 npm 包），在 gate 组内都不合法；gate 又会被 outputGate、aiGate 在运行期 import，扫描器混进运行期依赖图。
- 建议：扫描器与门禁脚本移到 tools/（或 tests/CLI）；gate 组只放运行期判定（matcher、screen、load-blocklist）；卷一 L367、C-4、V-31 同步。

---

## 二、卷一真问题（含两卷冲突、分层定义不一致）

### B1-1 凭证签发者与玩家命名流程仍是旧口径（两卷冲突）
- 位置：卷一 L219"credential 只由 aiGate 组……或 display 组（玩家命名）签发"；L223"玩家自由命名由 display 组签发凭证……呈现时过显示闸（命中 block 的命名退回命名界面）"；V-29 L714"凭证只由 aiGate / display 组签发……玩家命名由 display 组签发凭证"；C-6 L799"display 组签发凭证写入"。
- 对照：卷二 L618–L632 规定凭证只由 kernel `issueCredential` 签发、只有 aiGate 登记的写者可以申请；玩家起名在入库前经 `admitName` 筛查，五步流程；附录 F #16 L1889 要求卷一按此修改。
- 建议：卷一以上四处改为引用卷二 §2.9 第 3 条，删除"display 签发"和"呈现时退回命名界面"。

### B1-2 `Sealed` 的构造者与 kernel 读文件范围冲突（两卷冲突）
- 位置：卷一 L373 kernel 行写"清单不含 Text，`Text` 与 `Sealed` 由 textcore 构造"、"读文件只在 kernel/load/*、kernel/validate/*"。
- 对照：卷二 L612、L615 规定 `Sealed` 经 kernelApi `makeSealed` 构造；L544 规定可读写文件的是 `kernel/load/*`、`kernel/save.mjs`、`kernel/report.mjs`（validate 没有 fs）。
- 建议：按卷二改写；同时注意 B2-7 会改 makeSealed 的签名。

### B1-3 哈希口径冲突：卷一两种哈希，卷二一种（两卷冲突，影响 V-13）
- 卷一的口径：
  - §8.3 L595：排除表的 names、narration 两层"由 display 字段集合与 textPaths 生成"；规则可读状态哈希剔除 textPaths，存档哈希计入 `Sealed.digest`；
  - C-10 L804、术语表 L774、§7.1-5 L561、I42 L621 同一口径；
  - V-13 L725 要求"T0 与 T2 同存档 30 日哈希相同"。
- 卷二的口径：L478、L625、附录 F #15 L1888 规定排除表 = display ∪ `displayNames.*`，`narration.*`、`records.*.text` 的 digest 进哈希，全卷只有"存档哈希"一种；L625 写明开 AI 时"按 AI 输出同一性比较"。
- 证据：现行 world/rules/tables/digest-exclude.json 的 `layers.narration` 把叙述排除在"规则状态哈希"之外，与卷一一致、与卷二相反。
- 问题：按卷二口径，V-13 按构造就不可能成立；E-DIGEST-EXCLUDE-DRIFT 的生成输入在两卷里不同，机器核对会得出相反结论。
- 建议：两卷统一为一种口径。若保留两种哈希，卷二 §2.9 第 3 条要正式定义"规则可读状态哈希"及其排除表，并改附录 F #15；否则卷一 V-13、I42、§8.3 要改。

### B1-4 屏蔽词表格式、归属冲突（两卷冲突）
- 位置：卷一 L141、C-7 L800、V-22 L729 写条目 `{word, category}`，并称"唯一定义在卷二 §1.9"。
- 对照：卷二 L660–L661 规定数据归卷二十九，格式在 §2.9 第 6 条，条目是纯字串。
- 建议：先按 B2-16 补上 category，再把卷一三处改为卷二附录 F #14 的分工说法。

### B1-5 显示闸的输出代号冲突（两卷冲突）
- 位置：卷一 L228、I49 L628、V-25 L713、术语表 L759：输出 `pass/replace/block`，`block` 时整段改用 T0 模板叙述。
- 对照：卷二 L663 没有 block；复核仍命中时整段改用替换记号。
- 建议：统一为一种。若保留 block，卷二要定义触发条件与 T0 模板的来源。

### B1-6 菜单显示名唯一性：两卷说法冲突，且"同一菜单上下文"无法在加载期判定（两卷冲突 / 无法机判）
- 位置：卷一 L141、L244、I47 L626、V-22 L729："同一菜单上下文内折叠后唯一，由校验器保证"。
- 对照：卷二 B10(e) L1497 在运行期返回 `ambiguous` 后退回菜单，没有对应的加载期错误码。
- 问题：菜单由运行期的可用动作投影生成，"同一菜单上下文"不是加载期数据，校验器判定不了。
- 建议：以卷二的运行期 `ambiguous` 为准，删掉卷一里"校验器保证"的说法；如果仍要加载期检查，卷二须定义"菜单上下文"数据与错误码。

### B1-7 "规则层"是否包含第〇层，两卷说法相反，卷一内部也自相矛盾（分层不一致）
- 位置：卷一 L31、L98 写"规则层 = 第〇至第六层"；R-2.1 L271 写"没有任何一行豁免"；但卷一 §3.2 表 L373 又把 kernel 列入排除清单。
- 对照：卷二把 kernel 与规则层分开（L486"规则层（kernel、textcore 与六个非规则组之外）"），S13 也排除 kernel。
- 问题：这是 B2-4 漏洞在两卷定义上的根源。
- 建议：卷一明文写"规则层 = 第一至第六层的代码；第〇层是 kernel 组，另有约束（见卷二 §2.8 kernel 行）"，并与 B2-4 的 kernel 扫描口径一起落实。

### B1-8 第〇层的成员与卷二按目录归组不一致（分层不一致 / 落地）
- 位置：卷一 §2.2 L122、L128 和 §5.1 把 ledger.mjs、holding-sources.mjs、primitives*.mjs、advance-registry.mjs、storage.mjs、digest-exclude.mjs、derived.mjs（求值管线）列为第〇层，并说"第〇层 = 卷二 kernel 组"。
- 问题：卷二 kernel 组 = `server-plugin/kernel/**`，按目录归组。这些文件都在 server-plugin 根目录，按规则属规则层；卷一 §6.3 G-2 L507 还新增了 `server-plugin/dimensions/` 目录（按规则也属规则层）。两卷都没有搬迁表。
- 建议：卷一 §5.1 增加"目标路径"一列（都移到 `kernel/…`），G-2 的新目录改为 `kernel/…`；与 B2-12 的迁移表合并。

### B1-9 第六层投影与 `server-plugin/projection/` 目录同名但分属两层（分层不一致）
- 位置：卷一 L194 第六层投影（scene、可用动作投影、编年史，"不含自然语言"，属规则层）；L456 action-affordances、scene-card、chronicle 属第六层。
- 对照：卷二 L423 把 `server-plugin/projection/*.mjs` 归入 display（第七层，可读 labels，规则层不得 import）。
- 问题：按目录归组时，第六层文件一旦放进 `projection/` 就变成 display 组，规则层就不能 import 它。
- 建议：第七层目录改名（如 `server-plugin/render/`），或者在卷一明文写第六层投影文件的目录。

### B1-10 输入边的 AI-R1 与注入防线没有实现路径（两卷冲突 / 落地）
- 位置：卷一 C-4 L797 inputEdge 含 `ai-r1.mjs`、`injection-guard.mjs`；§2.10 L246–L248、§7.2 R1 位于输入边。
- 对照：卷二 inputEdge 不能 `fetch`，只能 import aiGate 的 `admitName`；注入防线需要的剥离操作在闭集之外（详见 B2-9）。
- 建议：按 B2-9 的方案改卷一 C-4、§2.10。

### B1-11 inputEdge 允许 import 的集合两卷不同（接口对不上）
- 位置：卷一 L246、V-23 L711：只许 import textcore、动作目录投影、候选集投影、primitive-schema，"不得 import 任何第〇至第六层的状态读取"。
- 对照：卷二矩阵 L447 允许 inputEdge import kernel（不限 kernelApi）、规则层的动作目录投影与候选集，以及 aiGate 的 `admitName`。
- 问题：两份清单会让机器核对得出不同结论。
- 建议：卷一改为引用卷二矩阵，不另列清单。

### B1-12 host→gate（与 B2-23 同源，卷一侧）
- 位置：卷一 L367 gate 行写"outputGate、aiGate、host 可 import"；V-31 L715 同。
- 建议：随 B2-23 的结论一起改。

### B1-13 句柄写法与卷二的族名规则冲突（两卷冲突）
- 位置：卷一 §3.1 L348–L349 正例写 `V.sfam.sfam_sleep`、`st.dims.family` 声明为 `enum sfam`。
- 对照：卷二 L229（FA-N4）规定族键就是族名，写作 `V.status_family.sfam_sleep`，不写前缀缩写。
- 问题：照卷一的正例写代码，`V.sfam` 不存在。另见 B2-19 的 `E.E_…` 映射问题。
- 建议：按卷二改正例。

### B1-14 卷一的"JS 语言记号封闭小表"卷二里没有，而且 `Date` 不在内建闭集（两卷冲突）
- 位置：卷一 L348"JS 语言记号（typeof 结果、编码名、JSON/Date 格式名）由卷十二登记为封闭小表"。
- 对照：卷二 S13 ④ 与 §2.8 没有这个豁免，`typeof x === 'string'` 在卷二是违例；L536 内建闭集里也没有 `Date`。
- 建议：删掉卷一这句；如确有需要，在卷二 §2.8 定义（例如只许 narrow 内部使用）。

### B1-15 卷一没有跟上卷二第十一、十二版（接口对不上）
- 位置：卷一题注 L3 写"对齐卷二第十版"；附录乙第二表与 V-2 L705、§4.5 L433 的错误码清单。
- 问题：卷二第十一、十二版的新机制在卷一没有落点：
  - `Screened<Text>`、`release` 与出口表；
  - 全局白名单闭集、E-GLOBAL-UNLISTED；
  - E-TEXT-EXIT、E-FILE-UNASSIGNED、E-SEAL-DIGEST；
  - `kernel/report.mjs` 独占 console；
  - `nameSlot`、`admitName`、`issueCredential`；
  - 屏蔽词数据归卷二十九。
  卷二附录 F #14、#16、#17 列为"须对齐"，卷一附录乙仍停在第五版的 19 条落点。
- 建议：卷一升版，逐条补落点（V-2、V-20、V-29、§4.5 错误码、C-9、C-18、附录乙），然后重跑附录丙的对账。

---

## 三、小项（措辞、编号、排版，不计必改）

1. 卷一 §3.2 L357 写"六个非规则组"，L361 写"五个代码模块组和一类数据"，表内实际列了七组加 textcore 加数据，计数前后不一。
2. 卷二 L422、L424–L426 中 inputEdge、gate、outputGate、aiGate、projection 的 glob 只匹配一层（`*.mjs`），host、kernel、textcore 用的是 `**`。子目录里的文件会悄悄落入规则层，G4 删除 `server-plugin/input/` 时也会连带删掉这些规则层文件。建议统一用 `**`。
3. 卷二 §1.9 第 4 条 L242 写"从 extension/input-view.mjs 迁来的输入视图"，§6.11 L1404 写"新写，不是迁出"；卷一 V-21 L727、C-4 L797 写"迁入的 input-view.mjs"。三处说法不一。
4. 卷一 L348 写"scan-allowlist.json 已被句柄机制取代"，卷二 S13 L1471 仍用 `world/ontology/scan-allowlist.json` 登记 (b)(c) 文件名单（该文件目前也不存在）。
5. 卷一 L143 的代号正则 `^[a-z][a-z0-9_]*$` 与卷二 L225 的 `{1,47}` 不一致（卷一说以卷二为准，应改为引用）。
6. 卷一 §6.3 G-2 L507 引"卷二 §2.8 第 4b 条"，卷二第十二版已删 4b（D 表 L1625）。
7. 卷二入口表 L562 把 `kernel/validate/*` 列为边界入口，但白名单 L544 没有给它 fs；它到底自己读文件，还是从 load 接收文字，需要写明。
8. 卷二 L653 写"`tsc --listFiles` 等于磁盘清单"，而 listFiles 会包含 lib 与 node_modules 的声明文件，应写"限于仓库内路径"。
9. eslint `no-restricted-globals` 本身是黑名单规则。L537 说"以白名单方式配置"，实际应写成"`no-undef` 加按组配置的 `globals`"之类的可行写法。
10. 卷二 L656"数据文件只能由登记边界入口读取"，但 css、html、manifest.json 由浏览器或 SillyTavern 加载，不经任何入口，需要单列说明。
11. 卷一 V-2 L705、V-20 的错误码列表与 §4.5 L433 的码表，应改为引用卷二 §4.3，不再手抄。
12. 卷二 L1418 齐全率表里 org/office/polity 写"~20 / ~30 / ~15"，属于估算口径，建议注明出处或改为"迁移卡先用统一加载器重算"（同 L1311 的口径）。

---

## 四、核对方法说明

- 机制项（B2-1 … B2-7、B2-15 … B2-26）：逐条看规定由谁、用什么工具、按什么数据判定，并找能整类绕过的写法。
- 落地项（B2-8 … B2-14）：用 grep、find 静态核对现有代码中的全局对象、import 说明符、IO 与 AI 调用位置、extension 部署方式，没有运行任何代码。
- 分层项（B1-7 … B1-9）：对照卷一 §2.1–§2.9 与卷二 §2.7、§2.9 的组定义与目录 glob。
