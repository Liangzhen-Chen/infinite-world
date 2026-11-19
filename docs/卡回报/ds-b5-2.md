# 卡回报：ds-b5-2《事件记录表 A、verb 族与写者协议》

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 见下「卷文原句」与「本轮整改」：卷二十四 :126–:154、:156–:173、:395、:396、:400、:403、:437、:439–:441、:497；卷九 §2.9 :432–:443（:437／:439）、:643、:658、:668（R9-2.10）、:676、:683；卷二十七 R27-8.2 :719、R27-8.9 :739、R27-4.1 :497；卷二 §1.10 :320、§2.6 :509／:512、§2.7 :602／:608／:770、:524／:531；卷六 §3.2 :286；卷十八 R18-1.10／R18-1.11 :526–:534、:222；卷二十 §4.1.3 :523／:525 |
| 2 | 没有按 id/名字/场景写特例 | 是 | 事件写者只按表 A 字段与类型判（`kernel/events.mjs` 的 `buildRecord`／`normalizePayload`）；verb 族行只按表 B 栏位判（`verbRowIssues`）；回滚按「事务撤销项／刻日志」整类，不点名任何事件或地址；执行器判事件动词只看批里有没有 `emit` 原语（`EVENT_OPS` 查表，非码值比较、非动词名分支） |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | `events.test.mjs`：事务外 emit（E-VIEW-UNDECLARED-WRITE）、缺/空字段、空串与 null、`visibility:'secret'`、未登记 verb、乱序/重复 targets、空 senses、负 margin、非对象 primitives、中文载荷、未知载荷键、空串/中文/非整数 id 成分、同成分重发都拒；`primitives-runtime.test.mjs`：缺 emit 原语、含 emit 原语（适配器未建）、qty 0／−1、空 cause、资源不同的 transfer 整批拒；无绕过 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 事件 id 只断言「同输入同值／不同成分不同值」；摘要用「回滚前后相等、含该条时不等」的对照，不抄摘要值；回滚断言「条数回到事务前」；`heads` 按 R24-2.4 手算、`worth` 按 R24-2.3 末句为 0 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 未改 `criteria.json`／`tools/accept`；`EVENT_OPS` 是按原语 op 查表（同 BY_OP／ADAPTERS 写法），不是假常量；比较用字串集中在既有 `S`／`CODE` 常量；`node tools/accept/run.mjs pre_commit` → `"verdict": "pass"` |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | 本轮只改：`server-plugin/kernel/transaction.mjs`、`server-plugin/kernel/events.mjs`（一行调用点：`registerLogUndo` 改收追加后的条目引用，卡文文件表未列，属完成本卡必需的普通接口改动，按 AGENTS.md 先说明）、`tests/kernel/events.test.mjs`、`docs/待办.md`（只加一行）、本回报。`git diff --stat HEAD~1 HEAD` → 5 files changed, 66 insertions(+), 21 deletions(-)（含本回报） |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/events.test.mjs` → `tests 19 / pass 19 / fail 0`；`node --test tests/kernel/primitives-runtime.test.mjs` → `tests 14 / pass 14 / fail 0`；`node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 628` / `ℹ pass 628` / `ℹ fail 0`；`node tools/accept/run.mjs pre_commit` → `"verdict": "pass"` |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 事件不再有幽灵条（事务回滚/整刻作废一并截掉），且整刻作废只删本刻事务追加的事件、刻内穿插的请求条目按引用保留；块 6 接上 emit 适配器与提交段上下文即可产出真事件。未写死、未特判、未跳过规则引擎、未拿假数据顶 |

## 交付内容

### 新建 `server-plugin/kernel/events.mjs`

- `emit(engine, state, event, idParts)`（kernelApi，callers rules）：表 A 校验 → `eventDerive` 补六字段 → 按 R27-8.9 五成分（世界种子、规则或指令代号、主体 id、世界时刻、固定位次代号）经 §1.10 派生函数定 id → 追加进日志簿；日志里存冻结深副本（R24-1.6 写下后不改）。
- `registerEventDerive(handler)`（kernelApi，callers rules）：只许交入一次（E-WRITER-DUPLICATE）；未交入时用内建最小 `eventDerive`。
- `eventDerive(engine, state, event)`（丙1 最小版）：`worth` 按 `worthSlots` 三项求和，本块无卷六 `priceFor`／`valuation` 入口，读不出的那件计 0 并记缺口（R24-2.3 末句，经 `report('W-DIM-GAP', {entity, side, field})` 记下）；`heads` 取 `headSlot`，空则 actor 与 targets 去重个数（R24-2.4）；`scopeLevel` 无地点/政区数据取空；`eventSig` 有 `rules.sig` 时按 R24-2.5 公式，无表时取动词行 `sigBase`（公式下界）；`typeRef`／`instanceRef` 空。
- `deriveEventId`、`checkVerbRows`（表 B 各栏行上必写、非 kindOnly 恰一处 emits、kindOnly 零处、上位词无环）。
- `installEventLog(book)`／`resetEventLog`、`resetEventDerive`：kernel 组内挂接/测试用，不在 kernelApi。

### 改 `server-plugin/primitives-runtime.mjs`

- ~~成功后经 kernelApi `emit` 写恰一条以本事务原语为 `primitives` 的事件~~（本轮按只核必须改 2 删去占位写法）：`execute` 不写事务事件；事件动词与账本 `reason` 只取本批 `emit` 原语给的 `verb`，批里没有 `emit` 原语即整笔拒收 `E-ACT-WRITER-NOT-READY`。"恰一条事件"记"部分"，挂块 6。
- 5-1 终核非阻塞建议 1：写入前先对整批核适配器存在性。
- 5-1 终核非阻塞建议 2：transfer 的 from/to 资源不同前移到 `checkContract`（`CONTRACT_EXTRAS`），补测试。

### 改 `server-plugin/kernel/ledger.mjs`（K5-48）

- `post` 的 `reason` 除必填、代号形外，须是已登记 verb（`E-EVT-VERB`）；回执 `notRun` 不再列 `reason_verb`。

### 数据

`world/ontology/dimensions/_vocab.json` 新增 `verb` 族（前缀 `verb_`），只落块 5 内核/持有事件真要用的四行；各栏逐项照卷文，见下表。

| 行 | 发出系统 | `kindFrom` | `worthSlots` | 依据 |
|---|---|---|---|---|
| `verb_entity_terminated` | 内核（`kernel.emits`） | `cause` | destroyed: `[id]` | 卷二 §2.6 第 5 步 :524 |
| `verb_entity_revived` | 内核（`kernel.emits`） | `cause` | 空表 | 卷二 §2.6 复生 :531 |
| `verb_domicile_changed` | `sys.social` | 空 | 空表 | 卷十八 R18-1.10 :526 |
| `verb_holding_changed` | `sys.social` | 空 | 空表 | 卷十八 R18-1.11 :528 |

四行共同值照卷文：`parent` 空、`kindOnly` 假、`headSlot` null、`sigBase` 0、`tallies` `[]`、`visibilityAllowed` 全集、`scandal` 假、`calendarBound` 假；`perceivable` 假、`senses` `[]`（卷二 §2.6 终止/复生为内核原语连带发出；卷十八两行为公共写者连带写入）。

`world/ontology/state-owners.json`：

- `kernel.emits = ["verb_entity_revived", "verb_entity_terminated"]`（卷二 §2.7 :770“内核自己发的动词列在 kernel.emits”）。
- `systems["sys.social"].emits = ["verb_domicile_changed", "verb_holding_changed"]`（卷十八 §2.3 的事件动词登记；发出系统是持有写者）。
- `kernelApi` 新登两条，条目名照卷二 §2.7 :602、:608：
  - `kernel/events.mjs#emit`，callers `["rules"]`，acceptsState true（卷二 :608）。
  - `kernel/events.mjs#registerEventDerive`，callers `["rules"]`，acceptsState false（卷二 :602、:770）。

`server-plugin/kernel/files.json` 加 `server-plugin/kernel/events.mjs`。

`world/rules/registry.json` 未改：sig 规则表无卷文数值，不自造；`error-codes.mjs` 未改：用到的码 E-EVT-SHAPE／E-EVT-VERB／E-EVT-EMITTER／E-SEED-COMPONENT／E-SEED-COLLISION／E-WRITER-DUPLICATE／E-DIM-STRUCT-FIELD 均已登记。

## 部分与挂卡

1. **执行器不写事务事件（部分）**：块 5 拿不到真实 `verb`／`visibility`（应来自本批 `emit` 原语）与 `actor`／`targets`／`payload`、事件 id 主体与位次（应来自提交段或钩子上下文），故 `execute` 不写事务事件；批里没有 `emit` 原语即拿不到本笔事件动词，整笔拒收 `E-ACT-WRITER-NOT-READY`，含 `emit` 的批因适配器未建同样拒收。**连带后果（如实记）**：块 5 的 `execute` 任何批都不写状态、也不产出事件，`transfer` 适配器已在但暂不可达；`tests/kernel/primitives-runtime.test.mjs` 原先的三处「transfer 成功/余额变化」断言按新行为改为「整批拒收、状态不动」（不是为通过而放宽，是只核必须改 2 要求的真实口径）。"成功后恰一条事件"（R24-1.1 :395、R9-2.3 :658、A9-2.2 :683）记"部分"，挂块 6 首张建 `emit` 适配器／提交段接线的卡（与 PLAN"emit 适配器第 6 块验收前必须完成"同卡）。已写进 `docs/问题.md`“5-2 事件记录挂账与待接线”。
2. **事件条随事务回滚（本轮已改）**：`emit` 只在事务内写；追加经 `kernel/transaction.mjs#registerLogUndo` 纳入本事务回滚范围，整刻作废也一并截回（R24-1.1 :395、R24-1.2 :396、卷二 §2.6 :509／:512、卷二十 :523／:525、A9-2.2 :683）。不再挂账。
3. **verb 族加载期接线（挂 5-7）**：`checkVerbRows` 只由测试调用，卷二 :770 要求违者加载失败；随 5-1 的 `checkPrimitiveCatalog` 同按"部分、挂 5-7 收尾接线"（只核非阻塞建议 2）。
4. **EventId 构造函数位置**：卷二 §2.9 :1119 定在 `kernel/handles/keys.mjs#eventId`；本卡文件所有权未含 keys.mjs 且改它牵动四类判据指纹，本卡在 events.mjs 内按同一口径实现，待 keys 卡归位。

## 本轮整改（5-2 只核必须改 1／2，2026-11-19）

依据：`docs/审查/5-2-DS只核-1119.md`。

### 必须改 1：事件条随事务提交才落、回滚即无

- `server-plugin/kernel/events.mjs#emit`：先在 `currentTransaction()` 取本状态的事务，事务外即 `E-VIEW-UNDECLARED-WRITE`；追加前 `registerLogUndo(book, book.entries.length)`。
- `server-plugin/kernel/transaction.mjs`：`Tx.logUndo` 记 `{book, length}`；`rollback` 按倒序截回日志条数（只截本事务追加的尾部，已写事件不改，R24-1.6）；提交时把 `logUndo` 接到刻日志，`rollbackTickJournal` 同样截回。
- **已定：取只核给出的落法 ①（向当前事务登记日志撤销项），不取待办记录法。** 理由：卷九 R9-2.3 要求事件在适配器跑完后的同一事务内落，待办法要把事件暂存在 state 里再于提交后追加，中间态与表 A「事件由写下它的那笔事务写」的两处语义都要额外维护；撤销项法只记追加前条数，回滚/整刻作废共用同一撤销路径（卷二 §2.6 :509「整笔回滚」、卷二十 §4.1.3 :523／:525「本刻已执行的各项一律作废」），且不碰 save.mjs 的日志追加原语。
- 测试（`tests/kernel/events.test.mjs`）：事务成功→恰一条且提交后仍在；调用方在 emit 后抛错→条数回到事务前；`holdWhileRecompute` 抛错→事件一并截掉；整刻作废→本刻事件全不在、正常收刻保留；存档摘要回滚前后相同（A9-2.2，并先证明日志参与摘要）；事务外 emit 拒。

### 必须改 2：执行器不写占位事件

- `server-plugin/primitives-runtime.mjs#execute`：删去 `verb=cause`、`actor=null`、`payload={}` 的 `emit` 调用；事件动词改从本批 `emit` 原语取（表 A :134／:142、卷九 §4.2.1 :643），批里没有即整笔拒收 `E-ACT-WRITER-NOT-READY`；账本 `reason` 同取该 `verb`，不取 `cause`（卷六 §3.2 :286；只核必须改 2 附）。
- 测试把原先「用已登记 verb 作 cause 凑过」的写法改回真实口径：`cause = 'act_trade_test'`（规则/指令代号），不再注册测试 verb；transfer 成功断言改为整批拒收、余额不动；`execute` 事务内外都不留当前事务、状态不动。
- 保留不动：`events.mjs` 写入口、表 A 校验、事件 id 派生、`eventDerive` 最小版、verb 族四行与 `emits`、两条 kernelApi。

### 卷文原句（本轮）

- 卷二十四 R24-1.1 :395「事件由写下它的那笔事务写……成功后恰有一条以本事务原语为 `primitives` 的事件」；R24-1.2 :396「事件写在状态改动之后、同一事务之内」；R24-1.6 :400「事件记录是事实，写下后任何字段不改」。
- 卷二 §2.6 :509「整笔回滚，撤销本事务的全部写入，不只丢掉被拒的那一次写入」；:512「请求条目先单独提交入 `doc_log`……在回滚范围之外」。
- 卷二十七 R27-4.1 :497 存档摘要对逻辑文档算、日志是其中一部分；卷九 A9-2.2 :683「任一原语被拒时，事务前后存档摘要相同」；卷二十 §4.1.3 :523／:525 本刻已执行各项作废、事件序号区间截掉作废段。
- 表 A :134 `verb`「已登记动词……卷九 `emit` 原语必填」；:139 `cause` 是规则或指令代号（两栏不同命名空间）；:142 `visibility`「卷九 `emit` 原语必填」；:143 `payload` 形状由动词行 `payloadShape` 给。
- 卷九 §4.2.1 :643 `emit` 必填 `verb`、`visibility`（事件写载体）；§4.2.5 :676 成交展开为 `transfer`…`transfer`…`emit`（事件动词取事件动词表）；§2.9 :437 提交段事件主体 id 取行动者 id、位次 `pos.commit`，:439 钩子/反应事件主体与位次按登记；R9-2.10 :668 `emit` 适配器用真实字段调 `perceiveEvent`。
- 卷六 §3.2 :286 `post` 的 `reason` 是 verb 代号；卷十八 :222 持有变化/常住变化的 `actor` 取所在事务那条事务事件的 `actor`。
- 李白 11-18 22:10 总原则「写者没上线的一律明确拒收……不造桩、不放空、不静默跳过」；五.2 块 5 三适配器 not_run；丙1 只照卷文推导，不造数据。

## 已定（技术问题自定，写理由）

- **已定：事件写者用存档日志簿追加，mount 时交入。** 理由：事件日志归存档层（卷二 :940、卷二十七 R27-4.1），内核组用 `kernel/save.mjs#appendLogEntry`；与 `installProposalSession` 同法，不新增 kernelApi。
- **已定：`event` 入参只收调用方可定的 11 个字段，id 与六个补充字段由写者定。** 理由：R24-1.6／丙1 要求写下后不改、补充字段必须写下；调用方给 id 或补充字段即有伪造事实的口子。
- **已定（本轮改）：块 5 的 `execute` 不写事务事件；事件动词与账本 `reason` 只取本批 `emit` 原语给的 `verb`，没有 `emit` 原语即整笔拒收。** 理由：表 A :134／:142 写 `verb`、`visibility` 由卷九 `emit` 原语必填；卷九 §4.2.5 :676 的成交实例即 `transfer`、`transfer`、`emit`；`cause` 是动作/钩子代号（表 A :139），与事件动词不同命名空间，拿它顶替会让事件记的“做了什么”是编的（只核必须改 2）。块 6 接 `emit` 适配器与提交段上下文后即可写真事件。
- **已定：eventSig 在 sig 规则表未建时取动词行基值。** 理由：R24-2.5 的 `min(sig.maxBand, max(基值, 档(…)))` 在无档表时退化为下界 `max(基值, 0, 0, 0)`；不自造档表数值。
- **已定：`rollKey` 由内核 sample.diceKeyOf 造，事件写者只核非空与键的字符集。** 理由：键文法只在 `kernel/handles/keys.mjs`／`sample.mjs` 一处（卷二 §2.8）；事件写者不重写键文法。

## 卷文原句

- 卷二十四 §2.2 表 A :128：「`{id, minute, verb, actor, actorAs, targets, primitives[], cause, witnesses, rollKey}` 十个是事件的最小字段」；:134「`verb` … 已登记动词 … E-EVT-VERB」；:136「`targets` … 按实体 id 序，无重复」；:139–:144「`payload` … 形状由动词行 `payloadShape` 给，另含 `payload.place`／`payload.related`／`payload.causedBy`」；:145–:152「`typeRef`、`instanceRef`、`worth`、`heads`、`scopeLevel`、`eventSig`」；:154「事件记录没有任何文字字段」。
- 卷二十四 R24-1.1 :395：「每笔经执行器的事务……成功后恰有一条以本事务原语为 `primitives` 的事件……写者协议在事务内另发的事件……另计」；R24-1.6 :400：「事件记录是事实，写下后任何字段不改」；R24-1.9 :403：「事件记录、载荷、起因都只有代号、id 与数」。
- 卷二十四表 B :156–:173：`parent`、`payloadShape`、`kindFrom`、`kindOnly`、`worthSlots`、`headSlot`、`sigBase`、`tallies`、`perceivable`、`senses`、`visibilityAllowed`、`scandal`、`calendarBound` 行上必写、onUnknown error。
- 卷二十四 R24-2.1 :437：「非 `kindOnly` 的动词行恰有一个登记的发出系统；`kindOnly` 行登记的发出系统为零」；R24-2.3 :439：「某一件的估值读不出时，该件计 0 并记缺口，不让整条事件失败」；R24-2.4 :440：「`heads` 取 `headSlot` 所指字段，`headSlot` 为 null 时取 `actor` 与 `targets` 去重后的个数……这些地点不在任何政区之下……或没有任何地点时取空」；R24-2.5 :441：分量档公式。
- 卷九 §2.9 :432–:443 事件 id 表；R9-2.3 :658：「成功后恰产出一条以本事务原语为 `primitives` 的事件……事件 id 按 §2.9 派生」；A9-2.2 :680：「一次成功的 `execute` 恰好产生一条事件」。
- 卷二十七 R27-8.2 :719：「键的成分只能是代号、id、整数……违例 E-SEED-COMPONENT」；R27-8.9 :739：「规则层与内核产生的事件 id……一律经卷二 §1.10 的派生函数由（世界种子、产生它的规则或指令的代号、主体 id、世界时刻、固定的位次代号）得出」。
- 卷二 §1.10 :320：种子键 `sha256(utf8(…))` 派生函数；§2.7 :602 `registerEventDerive`、:608 `emit`、:770「事件的发出系统与补充字段」。
- 卷二 §2.6 :524／:531：终止、复生两行表 B 取值；卷十八 R18-1.10 :526、R18-1.11 :528：常住变化、持有变化载荷。
- 李白 11-18 22:10 丙1：「按卷二十四 R24-2.3 把 eventDerive 最小版前移块5（并入5-2）：估值读不出按 R24-2.3 末句计0并记缺口，scopeLevel 无政区取空；只照卷文推导，不造数据。」

## 测试末行

```
node --test tests/kernel/events.test.mjs
ℹ tests 19
ℹ pass 19
ℹ fail 0

node --test tests/kernel/primitives-runtime.test.mjs
ℹ tests 14
ℹ pass 14
ℹ fail 0

node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs
ℹ tests 628
ℹ pass 628
ℹ fail 0

node tools/accept/run.mjs pre_commit
"verdict": "pass"
```

测试先行：首轮先写 `tests/kernel/events.test.mjs` 并跑红（缺 `kernel/events.mjs`、`execute` 未接事件、verb 族未建），再实现至全绿；本轮先写回滚/整刻/摘要/无 emit 拒收的断言并跑红，再改代码至全绿。`git diff` 不含测试放宽：`primitives-runtime.test.mjs` 的 transfer 成功断言改为「整批拒收、状态不动」是只核必须改 2 的行为后果（块 5 无事件写者），不是为通过而改。

## 只核（DeepSeek，2026-11-19）

- 只核原文：`docs/审查/5-2-DS只核-1119.md`。
- 结论：**必须改**。① 事件条不随调用方事务回滚（幽灵事件）：日志簿在 state 外，`rollback` 与刻日志都不碰它，违 R24-1.1／R24-1.2、卷二 :509／:512（只有请求条目在回滚范围外）、R27-7.3 :670、R27-4.1 :497、A9-2.2 :683、卷二十 :523／:525；改法：事件追加纳入本事务回滚范围，提交才落、回滚即无（事务撤销项或待办记录两法），并补两类测试。② 执行器事务事件的 `verb`／`actor`／`payload`／`visibility` 与 id 主体按 `cause` 现造：`cause` 是规则/指令代号（表 A :139），事件 `verb` 须是已登记动词、且照表 A :134／卷九 §4.2.1 :643 由本批 `emit` 原语给；`actor`／`targets`／`payload` 须来自事务上下文（§2.9 :437／:439、R9-2.10 :668、卷十八 :222），id 主体/位次按 §2.9 分类。真实动作代号会在整批已写后 E-EVT-VERB 整笔回滚；两行动者同分钟同动作会 E-SEED-COLLISION。按李白 22:10 五.2／总原则／丙1，块 5 拿不到就整笔拒收、不写事件、如实记"部分、not_run"，不用 cause／null／{} 顶替。账本 `reason=cause`（`primitives-runtime.mjs:235`）与卷六 :286 同源，须同改。
- 非阻塞建议 5 条见只核原文（表 A `primitives` 目录校验、`checkVerbRows` 接加载器/回报补挂卡、缺口指到件、`payloadTypeOk` 收严、`eventSig`/`actorAs` 取值域）。
- 复核通过：表 A 结构、事件 id 五成分、`eventDerive` 最小版、verb 四行数据、发出系统、两条 kernelApi、K5-48 真检查、5-1 两条非阻塞建议；无按 id／文件名／卷名特例，未改 criteria。
- 测试复跑：`events` 13/13、`primitives-runtime` 14/14、全量 622/622、`pre_commit` pass。
- 改后按分档复核。

## 终核整改（Claude Sonnet 5.5 中档，2026-11-19）

依据：`F:/dnd-tmp/review/5-2-Sonnet终核-1119.md`（必须改 1 条，原文已亲读）。

### 必须改 1：整刻作废按引用删事件，不按追加前条数截

- 问题：`logUndo` 只存 `{book, length}`，整刻作废倒序截长度会连带删掉刻内穿插的请求条目（卷二 §2.6 :512「只有请求条目在回滚范围之外」、卷二十七 R27-7.3 :668、卷二十 §4.1.3 :523／:525）。
- 改：`server-plugin/kernel/transaction.mjs#registerLogUndo(book, entry)` 改存本事务追加进 `book.entries` 的那条条目对象本身；`rollback` 对每条按 `lastIndexOf(entry)` 删去，只删自己追加的、不动别人的；单笔事务回滚与整刻作废走同一 `rollback` 路径，刻日志里留的是同一批条目引用。
- `server-plugin/kernel/events.mjs#emit`：追加后把 `book.entries[appendLogEntry(book, full)]` 交登记（一行调用点）。卡文文件表未列 `events.mjs`，这是 `registerLogUndo` 改收条目引用所必需的普通接口改动，按 AGENTS.md 先说明；无其他改动。
- **已定：撤销项由条数改为条目引用。** 理由：条数只在"日志尾部全是本事务追加"时成立，刻内请求条目一穿插就不成立；引用删法只按身份认自己那一条，与条目在日志中的位置无关，且不改日志追加原语（`kernel/save.mjs#appendLogEntry` 没动）。上文「已定：取只核给出的落法 ①」的落法不变，只把撤销项内容换掉。
- 测试先行：`tests/kernel/events.test.mjs` 新增「刻内先 emit、再 `submitProposal` 一个请求、再 emit，整刻作废后只剩请求条目且编号不变」；改前先跑红（`AssertionError: 0 !== 1`，请求条目被误删），改后 19/19 全过；原有四类（成功恰一条、emit 后回滚、`holdWhileRecompute` 抛错、整刻作废、摘要前后相同）仍过。
- 终核非阻塞建议「`emit` 撞号检查对全日志线性扫描，全规模下宜改已写 id 集合」记入 `docs/待办.md` 一行，未改代码。
