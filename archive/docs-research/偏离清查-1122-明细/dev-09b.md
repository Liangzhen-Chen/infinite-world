共 5 条，甲 0 乙 2 丙 3，有理由 1 无理由 4。
本卡读了：卷六 :285-303、:346-404、:1632-1645（错误码表）；卷三乙 :228-291、:1027-1076、:3020（勘误 1119k13 行）；server-plugin/kernel/ledger.mjs :1-380、:380-850、:852-878；kernel/transaction.mjs 全文；kernel/error-codes.mjs 相关行；world/rules/tables/kernel-constants.json 全文；world/ontology/dimensions/_vocab.json 的 src/sink 条目（sink_transform、src_transform、sink_loss、src_genesis、sink_consume）；world/rules/tables/economy/resources.json :1-40；卷二 :465-474、:515-531（只为核公共部件，非本卡卷范围）。没读：ledger.mjs :878-1443（含 settleCappedAllocation :1174-1266、allocateCapped、closeLedgerPeriod、mergeLots、recordTaint）、卷六 §4.2 :405 起（costBasis 拆分引用的 :418 原文未读）、卷十八与卷十九原文、其余卷文；卡文所写 K-8 " :1035" 实为赃物质量行，K-8 表行在 :1051。

特殊值核对（本卡第③项）：flow 腿 qty 为 0、负数、null、非整数一律拒（ledger.mjs:529 isPosInt）；account 腿 delta 为 0 或非整数拒（:454）；空 legs 拒（:582）；同账户自转不触限额（无来源腿）且逐资源种类的 L−S+K=0 仍核；批次计数器缺省 0 可用，负数/非整数拒（:670）；"不限"（limit null）只在 settleCappedAllocation，本卡未读该段，未核。未发现经 0、空、负数、同账户自转绕过限额或守恒的路径。

### 1 规则 5 的两种单向转换腿（砌入、取出）被一律按缺腿拒
- 位置：server-plugin/kernel/ledger.mjs:619-624
- 设计原文：卷六 :367「这条去处腿不要求同笔的来源腿」、:368「不要求同笔的去处腿」（:402 同列这三种允许情形）
- 代码实际：凡带 `pairedWith` 的代号，同笔没有配对代号即抛 `E-LEDGER-PAIR-MISSING`；:548 注释自述「卷十九明细作对手的单向转换腿待卷十九首卡，现一律按缺腿拒」。砌入腿（账本减量＋`sink_transform`）与取出腿（账本增量＋`src_transform`）因此都入不了账，`refs` 带设施实例与明细的核对也无从做。
- 理由：无（仅注释自述 :548；docs/迁移体检/块3.md:75 只把「明细逐料对平」列为块 3 的 `not_run`，没有把单向腿本身列为可延后）
- 影响：规则缺（卷十九首卡接建造时，新建砌入、拆除取出、物化建行的墙料腿全被拒，建造记账不可达）
- 严重程度：乙
- 合并：无

### 2 规则 7 转让限制只做了一半，tr_bound 与带 counterpartRX 的受限转让一律按未读拒
- 位置：server-plugin/kernel/ledger.mjs:625-638
- 设计原文：卷六 :381「tr_bound 的资源只能在持有人与发行者之间移动；不合整笔拒绝，返回 E-LEDGER-TRANSFER-RESTRICTED」
- 代码实际：只有「`tr_restricted` 且 `counterpartRX` 为空」判 `E-LEDGER-TRANSFER-RESTRICTED`；其余跨持有人转让（含全部 `tr_bound` 与带 RX 的 `tr_restricted`）一律抛 `E-DIM-UNKNOWN-READ`，没有读双方类别、持有边、发行者，也没有做「只许与发行者之间」的判定。
- 理由：无（仅注释自述 :549-550；docs/迁移体检/块3.md:94 把规则 7 列为 3-2 甲类；docs/问题.md、docs/统一底层设计/收尾待办.md 无登记）
- 影响：规则缺（受限资源的合法转让不可达；现有唯一的受限行 `res_unmaterialized_share` 的 counterpartRX 为空，带 RX 的受限行还没进数据，行为恰好正确，故暂未出错）
- 严重程度：乙
- 合并：无

### 3 post 多认第四种批次腿形状 {attrs, instance}，卷三乙 §2.3 只列三种
- 位置：server-plugin/kernel/ledger.mjs:94、:468-471、:664-668（另 kernel/handles/markers.mjs:162-163）
- 设计原文：卷三乙 :287「lot 只有 {attrs}、{splitFrom}、{splitFrom, project} 三种写法，别的形状（含不是对象、带上述以外的键）即 E-DIM-STRUCT-FIELD」
- 代码实际：`LOT_KEY_SHAPES` 另收 `attrs,instance`，按 `{attrs, instance}` 生成 `lot_i_<实例id>`、要求 delta 恰为 1；卷三乙 K-3 :1046（勘误 1119k13，:3020）要求逐件实例批次键由实例 id 派生，但没写 post 腿形；代码注释 :36 自述「卷文待回补」。
- 理由：有：卷三乙封卷后勘误 1119k13（:3020）要求实例批次键由实例 id 确定性派生，post 必须有腿形把实例 id 带进来；§2.3 :287 的封闭三形未同步，属卷文待回补
- 影响：只是形式（多一条卷文封闭表里没有的合法写法；不加它 K-3 的实例批次键没有来路）
- 严重程度：丙
- 合并：无

### 4 账本直读 engine.vocab.index，不调 vocab() 横切入口
- 位置：server-plugin/kernel/ledger.mjs:530、:579、:816（另 :277 的 entryOf）
- 设计原文：卷二 :469「横切入口：… `vocab(engine,family,id)`；`kindOf(id)`（查注册表）」
- 代码实际：用 `engine.vocab.index.get(...)` 取来源去处条目的族与 entry、verb 条目、物品实例的资源种类条目；`entryOf` 同样直读。`parseFlowLeg` 要先判 src/sink 族，而 `vocab()` 要先知道族名，公共部件缺「按代号求族」的读口。
- 理由：无
- 影响：只是形式（同一读法散在四处；族名或条目形状改时多处跟改）
- 严重程度：丙
- 合并：见 docs/研究/公共部件审查-乙-1122.md §五第 2 条、第十节第 1 条（45 个文件直读 vocab 内部，本条是其中一处）

### 5 事务裸写 setInTx 与 denied 在账本里各抄一份
- 位置：server-plugin/kernel/ledger.mjs:299-315（setInTx）、:317-322（denied）
- 设计原文：卷二 :531「事务内拒写的处置（唯一定义）…被拒的错误码直接上抛到 kernel/transaction.mjs，走同一处置」
- 代码实际：账本自持一份 `setInTx`（记 `tx.undo`/`tx.written`）与 `denied`（记 `tx.denied`），与 kernel/storage.mjs 及其他四文件同式各一份；写入仍在当前事务内，全成全败由 transaction.mjs 回滚。
- 理由：无（公共部件审查-乙-1122 §一第 4 条已判为代码层重复、不是违卷；无裁定号）
- 影响：只是形式（撤销项格式改一处要同步六处）
- 严重程度：丙
- 合并：见 docs/研究/公共部件审查-乙-1122.md 第一节第 4 条

## 已登记未建
1. `issuerBacked` 核对只列 `notRun`（ledger.mjs:740-742；卷六 :382 规则 8）：登 docs/迁移体检/块3.md:76（3-2 留核对点，块 3 验收报 not_run，随卷六 §4.15 首卡）。
2. 资源键所指对象的存在核对未做（ledger.mjs:474-476 只核代号形；卷六 :104 语义）：登 docs/统一底层设计/收尾待办.md:1000（随块 6 物品、地点首卡与块 7 卷十九首卡补）。
3. `res_unmaterialized_share`「只许聚合账户持有」未核（卷六 :374；post 只核持有人是主体）：登 docs/统一底层设计/收尾待办.md:1002（块 7 随卷二十七聚合体首卡）。
4. 卷十九明细与各腿逐料对平未核（卷六 :367-368、:402）：登 docs/迁移体检/块3.md:75（块 3 验收单列 not_run，随卷十九首卡）。
5. 批次出批次序与合并（K-3）未建（卷三乙 :1046）：登 docs/迁移体检/块3.md:77（块 6 物品首卡）。
6. 批次属性其余字段（material、enteredDay、spoilage、qualityTier、purports 等）的含义与必填校验未做（卷三乙 :288「其余批次字段的含义与校验归块 6」；ledger.mjs:480 只查 costBasis、taint、project）：卷文本句即登记，另无登记文件。
7. K-8 审计入口未接存档加载（docs/问题.md:513）：不算偏离，只列登记。

## 拿不准
1. `E-LEDGER-CODE-UNREGISTERED` 与 `E-LEDGER-UNBALANCED` 的界：卷六 :1634 与 :1636 都套得住「有腿不平但无来源去处腿」，代码在 S=K=0 时取 CODE-UNREGISTERED（ledger.mjs:604-606）。卷文没给两条的优先级，判不了对错。
2. `costBasis` 拆分公式未核：卷六 :418 不在卡文范围，未读；代码用 BigInt 向下取整、原批次留差（ledger.mjs:678-686、:710-714），卷三乙 :289 只说「按拆出量拆」。
3. `ITEM = {kind:'item', instances:'itemInstances'}`（ledger.mjs:415）算不算卡头第 10 条说的写死种类/状态键：它是卷三乙 §3.3 的固定键，代码只此一处命名常量；「协议字段名可放代码」与「种类放数据表」的界线未定。
4. `post` 的增记腿核 `checkHolder`（含目录行只持点数类、终止），减记腿只核 `checkSubject`（ledger.mjs:657-659）：终止后减账该不该拒，要卷二 §2.6 终止协议与规则 9 对读，本卡未读卷二 §2.6 原文，未判。

## 跨卷待判
1. 实例批次腿形（本条 3）：卷三乙 §2.3 封闭表与 K-3／勘误 1119k13 的来路相抵，需卷三乙作者回补或改封闭表；其他卷是否也发 `{instance}` 腿形未核。
2. `tr_bound`／`counterpartRX` 的核对要读双方类别（卷二实体类别）、持有边（卷十八 §4.1）与发行者（卷六 §4.15）；本卡只读卷六、卷三乙，实现口径交主会话转 Opus。
