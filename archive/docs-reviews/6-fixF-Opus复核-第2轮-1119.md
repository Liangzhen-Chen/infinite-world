# 补值卡 F Opus 复核第 2 轮（11-19，最后一轮）

核者：Claude Opus 5.5 中档，只读，不是写者。对象：F:/dnd-wt/ds-b6ff 的改一轮提交 48a9d46f1，以及其后并入 origin/master 的合并提交 77eb1c91e。看的是 `git diff b3098d0..HEAD`，并对照全卡的 `git diff origin/master...HEAD`。上一轮原文见 docs/审查/6-fixF-Opus只核-1119.md。

## 结论：可封

上一轮判"必须改"的两条都已改到位，本轮没有新增必须改的地方。

## 逐条

1. **lotKeyCompare 登记与 lotSeq 撤下**
   - `world/ontology/state-owners.json:220` 改为 `{"export": "kernel/item-state.mjs#lotKeyCompare", "callerFiles": ["item-lots.mjs"], "acceptsState": false}`。写法与同表其他 callerFiles 条目一致（例如 `body.mjs`、`kernel/dimension-writers.mjs`，都是相对 server-plugin 的路径）。只许一个调用文件，比 `rules` 更窄，合乎闭集。
   - 我全仓 grep 了 `lotSeq`。剩下的只有 `server-plugin/kernel/item-state.mjs:117` 的定义，以及同文件 :131 lotKeyCompare 在内核里的调用。`world/ontology/named-structs.json:478` 和 ledger.mjs 的 `lotForbidden` 里那两处是字段名的说明文字，不是调用。
   - 规则层、tests、tools 里都已没有 lotSeq 的读者。把它从 kernelApi 撤下不改任何行为：块 3 散货的序号排序现在经 lotKeyCompare 走同一个 lotSeq，块 5 也没有调用方。撤得成立。

2. **auditLots 两核与报错码**
   - 改动在 `server-plugin/kernel/ledger.mjs`，约 :810 到 :818。
   - 种类核：读资源种类条目的 `item` 字段，必须等于实例行的 `template`（依据是卷六 §2.1 勘误 1119k12，`engine.vocab.index` 在同文件 :275、:528 已有同样用法）。不等就报 E-DIM-REF-MISSING，属整类判，不认任何 id。
   - 终止核：实例已终止、批次还在，就报 E-TERM-RESIDUE。
   - 用这个码合卷二原意。卷二 §2.6 不变量（:541）写的是"不存在指向已终止实体的……非零账户余额……违反即 E-TERM-RESIDUE"。实例批次键由实例 id 派生，批次余额 1 正是一笔指向已终止实体的非零余额，属同一类残留，不必另造新码。另外，§4.3 码表 :1577 注明复生被拒已另设 E-TERM-REVIVE-DENIED、不再借用这个码，可见这个码现在只表示残留，此处正用其义。
   - 反例：`tests/kernel/item-lots.test.mjs` 新增两条，"错种类"（斧实例的批次记在粮食名下）只报 E-DIM-REF-MISSING，"已终止仍有批"只报 E-TERM-RESIDUE。两条期望都是字面量，真测到了。

3. **criteria.json 修订记录的 ref 文字**
   - 改一轮给 31 条修订记录写的 ref，仍是上一轮的原句"…auditLots 核实例一一对应…判据本身未改，只因被扫内核文件指纹变而 rev+1"。
   - 这段话属实：本轮确实只改了被扫内核文件，判据与检测器都没动，"核实例一一对应"也涵盖新补的两核。
   - R12-14.3（卷十二 :1230）的要求针对的是检测器判定逻辑变了的修订，须带 must_pass、must_fail 用例。本卡不属这种情况，不触发。
   - 所以判：不须改。只建议以后同卡第二次 rev 时在 ref 里写上"改一轮"，方便追溯。这条不阻塞封卡。

4. **亲跑**（在合并后的 HEAD 77eb1c91e 上）
   - `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` 末段：`ℹ tests 1085 / ℹ pass 1085 / ℹ fail 0`（已含 master 并入的 6-22）。
   - `node tools/accept/run.mjs pre_commit`：`"verdict": "pass"`。

## 遗留（不阻塞）

- ledger.mjs 的 lotsUnmergeable JSDoc 首行仍写两参，宜顺手改成四参。
- K-8 行（卷三乙 :1042）本身还没写实例批次的校验，现在只在 K-3 勘误句里提到。等下次勘误补进 K-8，K-3 那里改为只引用。
- 以后接"毁坏/坏透"时，必须在同一事务里终止实例并把实例批次出账到汇，否则这两核会报错。这是正确报错，不是规则过严。
