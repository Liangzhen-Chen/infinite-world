# 卷二 pendingPost 登记只核（提交 70284c3a）

只核者：claude-opus-5-5 中档；只读，没有改正文或脚本。二轮后单核。
依据：`审查/事务批-1114n-只核.md` 真问题 1。
原始输出：`审查/脚本输出/卷二-pendingPost登记-只核-原始输出.txt`。

结论：**不通过**（真问题 1 条：`struct:pendingPost` 的 `signal` 字段是没有族名的 enum）；其余各项都合。

## 1. 逐项核对

- **§1.5 `struct:pendingPost`（卷二:217）**：字段有四段幂等键（`requestSeq`、`txSeq`、`emitSeq`、`entrySeq`，都是 `integer:count`），另有 `signal`、`signalEvent: EventId`。载荷不抄，从 `signalEvent` 取；不设执行相字段；没有字串字段。只列了执行要用的东西，合。**唯一的问题是 `signal` 的类型**，见第 2 节。
- **stateKeys（:494）**：`pendingPost` 只有一个写者 `kernel/transaction.mjs`，读者是 `kernel/scheduler.mjs`。内核信号表里执行相为提交后的接收方有三项：调度器（`layout_change`），以及 `kernel/transaction.mjs`（`naming_intent`、`note_intent`）。后者本身就是写者，按 :454 已可读，所以不重复列，注释也写明了。文件名可以作读者（:454"所在文件必须在该顶层键的 readers 或 writers 里"）。合。
- **pathTypes（:612）**：`"pendingPost.*": "list<struct:pendingPost>"`，并注明 `*` 段是 `EventId`。合 :184"state 路径的映射键另可是 `EventId`"。
- **键结构与唯一性（:668–669）**：外层键是请求条目的 `EventId`（卷二十七 R27-7.3 先单独提交进 `doc_log` 的那条）。列表按（事务位次，发出位次，名单项序号）升序排。四段作为列表项的字段；同一列表内的三段互不相同；`requestSeq` 等于外层键所指请求的编号；列表删空就删掉这个键。合。
- **:868 表述同步**：原来写"以幂等键为键"，已改成外层 `EventId` 加有序列表，并指向 §2.7 新条。与 :668 一致。
- **分片（:670）**：`pendingPost.*` 属 `doc_state`，用 `part_single`。照卷二十四 :836 那种一句话写法（`shards` 行的 part、paths、partition 三项都齐了），符合 A27-4.7"新增状态键只在 pathTypes 与分片表登记"。理由（每笔事务提交后清空，快照时为空）与 R27-4.5 一致。合。
- **附录 D :2624**：改动处、内容、读者与牵连、理由都写全了。卷二十七正文不改、卷二十措辞记账不改，都与前一份只核的归属意见一致。合。
- **快照**：`-1114q` 在 70284c3a~1 到 HEAD 之间 git diff 为空；`-1114q2` 与 70284c3a~1 的卷二相同（去掉 CR 后用 cmp 比）；`-现行` 与现卷相同。70284c3a 之后的三个提交都没碰卷二和这几份快照。合。

## 2. 真问题

1. **`signal` 字段是没有族名的 enum（卷二:217）**。现在写的是 `signal: enum（取值限 §2.9 第 0 条"内核信号代号"小族表的代号，代码内封闭枚举）`，与本卷类型规则冲突：
   - :247 规定全文的 `enum <族名>` 一律写族名；
   - §1.5 `enum` 行（:180 一带）规定不允许内联枚举；
   - 本卷其余的代码内封闭枚举都有族名（`enum basis_kind`、`enum event_role`、`enum status_target`），全卷没名字的 enum 只有这一处。

   "内核信号代号"小族（:858）本身也没有族键，所以加载期按 E-DIM-STRUCT-FIELD 递归校验这个字段时，找不到要比对的值集。
   - **改法**（局部）：在 :858 小族标题给这个族一个族名（代码内封闭枚举，值不带前缀），:217 写成 `signal: enum <该族名>`；附录 D :2624 的同一行补一句。
   - 可以顺手收紧：取值只限执行相为提交后的信号（`layout_change`、`naming_intent`、`note_intent`）。整张小族表里还有 `nil_seedpart`、`dimension_write_rejected`，它们不会进待办记录。

## 记账（不判真问题）

- §2.7 的 pathTypes 文法（:672）没有列 `list<…>`。卷二十七 :190 等处已经在 pathTypes 登记里用 `list<…>`，这是早就有的缺口，不是本提交造成的。:668 拿推进计划 `list<struct:advancePlanItem>` 作先例，但那是 provider 的返回类型，不是状态路径。措辞可以改成以卷二十七 `aggregates.*.members` 为例，或者在文法里补上 `list<…>`。
- :668 说请求条目的 `EventId`"与请求编号一一对应"，依靠的是请求条目事件 id 的派生成分。卷九 §2.9 事件 id 表（:380 起）没有"请求条目"这一行（R27-7.3 新增条目之后没有跟着补）。这一条不影响本处正确性：每笔事务提交后待办记录随即清空，状态里同时只有一条请求的记录，`requestSeq` 本身也唯一。
- check-vol2 新报了"注意 未登记前缀 doc_: doc_log, doc_state"和"part_: part_single"。来源与上次的 `doc_log` 相同：脚本只认卷二的前缀表，而 `docpart`、`partition` 两族登记在卷二十七 §2.1（:119、:121）。这不是登记缺口。

## 脚本重跑

只用 `node 文件.mjs`。F:/dnd-tmp/vol2 下的 check-vol2.mjs、check-vol2-ext.mjs，F:/dnd-tmp/vols 下的 check-c29-3-fs.mjs、check-卷二十七.mjs，全部 PASS，exit=0；"注意"行与执行者的原始输出相同。

## 须报李白

- 无。真问题 1 是局部类型写法，按二审余项常规只改列出的地方，再派单核。
