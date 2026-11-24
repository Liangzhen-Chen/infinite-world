核对标识：chk-1115-y12（会话标识见主会话台账）；所核提交：0ac05efd

（只核者 Opus 5.5 中档；只读；对照依据：审查/李白裁定-1115-1822-kernel拆分.md、卷一 §6.6、卷十一 R11-2.5/R11-3.4/R11-3.7/R11-7.5、卷二 §2.7/§2.8/§6.11。乙-6（560cbe6d）不在本核范围。）

## 一 逐项结论

1. **生成器切分**（脚本/卷十一/gen-card-ledger.mjs `relocateSegments`）：三级次序、逐级细分、每段 ≤ MAXFILES 个 `.mjs`、数据文件随第一段，与裁定第 2 条一致；切段函数里没有组名、文件名字面量（`kernel` 只出现在早已存在的 `groupOf` 模块组映射与 `MODGROUPS` 里，check-卷十一 PASS 14 同判）；每张段卡带 `splitAxis`、`segNo`。
   "第一级没切开任何文件"的说法成立，不矛盾：卷二 §2.7 kernel 组的 `modules` 是 `server-plugin/kernel/**/*.mjs`，这个目录在基线里还不存在；56 个文件现在都在 `server-plugin/` 根目录，按 R11-3.4"不在任何模块组的属规则层"归规则层，只有一份，所以 ① 切不开。① 没有被错误跳过。另外，R11-3.4 的消费者组本身是"模块组内按路径升序切"，照搬整条就是裁定否掉的路径切法，所以 ① 只取"按模块组分"这一步是唯一说得通的读法。
2. **kernel 拆 5 张**（4、1、25、25、1）：按现在的文件集合，生成器算得对。但**第二级没有用尽 §6.11**：见真问题 T1，§6.11 里落点对象为 `kernel` 的 22 个文件，只有 5 个在 kernel 搬迁卡里。只有 1 个文件的段：kernel-5 是路径兜底"每满上限切一段"的余数，kernel-2 是子目录 `kernel/load` 只有 1 个文件；两者都合 R11-7.5 写法，裁定也没要求先满额或合并相邻段，不算偏离。但最少只要 3 张，现在 5 张，代价是多两张卡（记为 W1）。
3. **卷十一改动**：
   - R11-7.5 整类原句与裁定第 3 条逐字一致。
   - `filesList` 中间态三点（各段只写自己那段；闭集在 `segNo` 最大那张合入后按整组判；同一清单按 `segNo` 升序串行）和裁定第 4 条一一对上。
   - §2.1 `split_axis` 四个值带中英显示名；§2.2 两个字段，必填矩阵新增一行，只在 `relocate` 列为"必"，表头列序已核。
   - R11-2.5 补段卡取法**确是必要改动**：原文"取该对象下唯一一张卡，不唯一即报错"，kernel 有 5 张，不补的话 kernel 的全部行都报 E-MIG-ROW-MULTI，属"不补就冲突"。
   - 不拆的组记 `whole` 合理：矩阵要求 relocate 必填，7 张单卡总得有一个值，`whole` 比借用某一级的名字更准。
4. **读数复现**：重跑生成器得卡 114、阶段 0–5 各 3/85/11/11/2/2、n=5、relocate 12、实现卡 106、matrixBad（E-MIG-CARD-INCOMPLETE）104、orphan/multi 0；输出与已提交文件内容一致（git diff 无内容差，只有换行符状态，已留原样）。依赖核：dependsOn 指向 34 个不同卡号，逐个在 cardId 里恰出现 1 次，断链 0；依赖 kernel 段卡的卡去重计 86 张（改前也是 86），与报数一致；所有带 dependsOn 的卡共 91 张。
5. check-卷十一 失败项 0（枚举 49、行数 1045）。提交只改 docs/统一底层设计/ 下 8 个文件，冻结目录（server-plugin/、extension/ 等）diff 为空。快照：勘误前-1115y11 与 0ac05efd^ 的卷十一 blob 相同（217ceb78…），封卷.md、v2.md 与现卷十一相同（cf5c1d66…）。勘误行写了依据与必要理由。卷一 §6.6"超出按消费者组再拆"与新规则 ① 一致，不改恰当；卷二 §2.8 第 2 条门禁是"modules 展开与清单比对"，各段卡都是搬一个、登记一个，中间态两边一致，不改也不冲突（见 W3）。

## 二 真问题

- **T1 kernel 搬迁卡的文件集合不按 §6.11 取，第二级因此基本落空（改前就有，本提交沿用并新写进 R11-7.5 首句旁的切段规则）。** R11-7.5 首句写"搬哪些文件、搬到哪里，按卷二 §6.11 的文件级迁移表"，"搬迁卡只移动与拆分文件，不改行为"。生成器搬迁卡的文件取 `e.cons.c1`，即 targetObject 为 kernel 的各迁移行的锚点文件：
  - 卷二 §6.11 那些行（M2-1、M2-2、M2-11、M2-12a、M2-31 至 M2-45）在 migrows-input.json 里 `anchors` 为空（例 M2-32 `"anchors": []`），所以 §6.11 点名要移进 `kernel/` 的 `primitives.mjs`、`primitives-body/checks/effects/movement/runtime.mjs`、`derived.mjs`、`digest-exclude.mjs`、`action-registry.mjs`、`holding-kinds.mjs`、`holding-sources.mjs`、`seed-keys.mjs`、`index.mjs`、`ui-routes.mjs`、`carry.mjs`、`primitive-schema.mjs` 共 17 个，不在 5 张 kernel 卡的任何一张里；只有另有别行锚到的 5 个（advance-registry、ledger、primitives-learning、storage、currency）进了卡。
  - 56 个里另 51 个（如 action-gateway.mjs、agriculture.mjs、wildlife.mjs）在 §6.11 没有 kernel 落点，是被 M20-49（replace_entry `calendarAdd`）、M20-79（replace_entry `perYearToPerStep`）这类"改调 kernel 入口"的行带进来的，属于改行为，不是搬迁。
  - 新补的 R11-2.5 兜底"没有锚点文件落在任何段卡里时取 segNo 为 1"把 M2-32 至 M2-45 这些无锚点行都派给 kernel-1，而 kernel-1 的 `files` 里没有这些文件；照 R11-3.7 的闭集，执行者一动 `primitives.mjs` 就是 E-MIG-CARD-SCOPE。
  - 结论：切法规则本身照裁定写对了，但切的对象（56 个文件）和 R11-7.5 的"按 §6.11 搬"不是同一个集合；裁定第 1 条"kernel 的 56 个文件"沿用了这个读数。修法要改结构：搬迁卡文件改由 §6.11 中落点对象为本组的行的"现有文件"栏取；锚点为空的 §6.11 行解析"现有文件"栏作锚点；把非搬迁的 replace_entry 行从 relocate 卡剥离，交给领域卡或 kernel 入口卡。这一改会动 56 这个前提与卡数、阶段读数，应停报李白定方向，不在本卡内修。
- **T2 第二级"落点栏第一个路径所在目录"把入口当成去处（和 T1 同根）。** M2-11 的落点是 `kernel/load/rules.mjs`、`engine.rules`，意思是 currency.mjs 改由这个入口读 JSON，不是把 currency.mjs 移进 `kernel/load/`；生成器据此单独切出 kernel-2（1 个文件）。M2-3a 的 storage.mjs 拆成三处，取第一个路径归 `kernel` 也只是近似。① 只对 disp 为平移的行取落点目录，或 ② 让 §6.11 落点栏区分"去处"与"改调入口"，二者择一，随 T1 一并定。

## 三 措辞小项

- W1 kernel 5 张里有 2 张只有 1 个文件。规则允许，但 T1 修好后文件集合会变，届时再看要不要写"子目录段不足上限时与同一份相邻段合并"。
- W2 R11-2.5 新句没说位置组锚点文件跨两张段卡时怎么办；生成器取最小段（`groupIndexOf` 取 ids[0]，全书 straddle 计 40，含消费者组）。建议补半句"跨段时取 segNo 最小的那张"，和生成器对齐。
- W3 卷二 §2.8 第 2 条 ①"门禁…多出文件即 E-FILE-UNASSIGNED"没有引用 R11-7.5 的"单张段卡不判闭集"。按"搬一个、登记一个"不会冲突，可在卷二该句后加一个引用，属"必要时"可不做。
- W4 R11-7.5 写"同一份内先 ② 各子目录后 ③ 各段"，生成器把超上限子目录的路径段排在该子目录的位置（在 `~` 段之前），文字可补"超上限子目录的 ③ 段排在该子目录原位"。目前没有实例。

## 附录 O5 抽样

总体 42 条（段卡字段与卷十一新增条文）：1–12 十二张 relocate 卡的 splitAxis（aiGate、content-scripts、display、gate、host、inputEdge、kernel-1…5、outputGate 次序）；13–24 同序的 segNo；25–29 kernel-1…5 `.mjs` 数 ≤ 25；30 kernel-1 文件为 c1 中 ② 目录为 `kernel` 的全部；31 kernel-2 currency.mjs 归 `kernel/load`；32 kernel-3/4/5 路径升序满额；33 非 relocate 卡 splitAxis/segNo 为 null（102 张）；34 §2.1 枚举；35 §2.2 splitAxis 行；36 §2.2 segNo 行；37 必填矩阵行；38 R11-7.5 整类原句；39 filesList 中间态；40 R11-2.5 跨段取法；41 R11-7.5 首句与卡内文件；42 dependsOn 断链。

种子 20261115：i_k = ((20261115 + 7919·k) mod 42) + 1，k = 0…21，抽 22 条：22、3、26、7、30、11、34、15、38、19、42、23、4、27、8、31、12、35、16、39、20、1。

不符 1 条：31（规则字面对，语义把入口当去处，即 T2），不符比例 1/22 ≈ 4.5%。样本外另查到 40（W2）与 41（T1）不符。

不可封卷
