核对标识：chk-1116-y15（会话标识见主会话台账）；所核提交：77b97d55

# 只核：卷二 §6.11 拆子行、卷十一 relocate_only 与 R11-7.8 例外（对照李白 19:08、19:12）

只读核对，不看执行记录与执行者摘要。对照：审查/李白裁定-1115-1908-kernel-6.11拆子行.md、PLAN.md 19:12 段、卷二 §6.11、卷十一。重跑 transcribe-migrows.mjs、gen-card-ledger.mjs、gen-卷十一-卡族.mjs、check-卷十一.mjs、check-vol2.mjs、check-vol2-ext.mjs，重跑后工作区无差异。

## 逐项结论

1. **拆子行**：§6.11 落点为模块组的行都拆成了搬迁子行（`relocate_only`）和改调入口子行，host、aiGate、outputGate 一并整类处理，M2-2 改为"同 M29-28"，不进搬迁卡；R11-1.3 改为"六种"，写了必要理由，C11-5 的转换口径改为"前五种之一"。抽核 20 行改调子行（M2-1b、3c、5b、11a、11c、12a、12c、15b、15c、15d、16、17、18、19a、20、41b、42b、43b、44b、45b），引用的规则号都在卷里查得到，有 17 行依据成立。M2-11c 的依据错引，见真问题 T2；M2-20 依据偏弱，M2-12c 属推定，见补裁 B3。
2. **搬迁卡**：共 5 张，都是 `whole`：kernel 17 个文件（M2-1、M2-3a、M2-31 至 M2-45），aiGate 4 个，outputGate 3 个，content-scripts 1 个，host 2 个 .js。rowKeys 只含 relocate_only 行。M2-19b 和 M2-19c 让 `extension/turn.mjs`、`prompt.mjs`、`message-view.mjs` 同时进了 aiGate-1 和 outputGate-1。这不违反 R11-3.7：每张卡的文件清单各自封闭，迁移行也只认领一次（multi 0）。A11-3.2 只要求同一对象的各卡文件不相交，这里是两个对象，所以也不违反。但生成器把这几个文件依赖到哪张搬迁卡时出错，见 T3；一个文件由两张搬迁卡各搬一部分，卷里没有规则，见 B2。
3. **19:12 的两处勘误**：R11-7.8 和必填矩阵清扫卡的 `files` 栏都已按原文落实。§2.2 表后（:205）"它不改代码，只跑检查与生成回填（R11-7.8）"没有改，和 R11-7.8 新加的例外字面矛盾。不改的话卷内自相矛盾，所以这是"接不上 1908"的必要连带改动；但 19:12 明说只改两处，编辑不改是对的，交李白定，见 B1。
4. **M2-13**：已核实。SWEEP-1 的 rowKeys 按矩阵仍是"—"，所以 E-MIG-ROW-ORPHAN 为 1（M2-13）；SWEEP-1 有 140 个文件，超过 maxFiles 25，记了缺陷项。这是 19:12 裁定没有覆盖到的缺口，不是实施错误：19:12 只放开了 files 栏，rowKeys 和文件上限都没动，编辑在"只改两处"的约束下没法让孤儿行归零。需要补裁，见 B1。
5. **生成器整类规则**：object-rules.mjs 的 receivingVolume 补认了 `R<卷>-` 和"（卷X）"，按出现次序取第一个引用；16:55 那条放宽后，实现为"删除行的锚点文件恰是一个系统的定义文件时取该系统"。两处都没有按行号或编号写特判，grep 生成器和 object-rules 都没有 M 编号字面量。M1-6b 归 sys.display_l10n，M1-9 归 LEDGER-1c，都正确。连带改了归属的行逐行核过，不止"约 10 行"：对象变了的有 27 行左右，原因有两种。
   - 新的取引用次序造成 1 行：M14-82c 被误归 sys.offscreen_save，见 T1。
   - resolveFile 修好后位置组并组造成其余各行，见 B4。这些行合现行 R11-2.4、R11-2.5 和"取行数最多（待裁）"，机械上没有错。
6. **resolveFile**：已改成同名文件先走"优先 server-plugin/、extension/"再判歧义，后缀分支和裸文件名分支用同一条规则。从改判的行里抽 15 行核（M20-64、M20-57、M20-21、M20-22、M19-9、M5-32、M7-10、M21-6、M21-22、M21-23、M21-26、M25-56、M13-4、M17-6、M9-6），锚点都解析到运行时文件，行号内容对得上。其中 M20-64：server-plugin/magic-economy.mjs:39 是 `windowDays` 上限 360，即"窗口上限一年"。另一个同名文件 world/design/magic-economy.mjs 的第 39 行是数据，对不上。M20-64 的落点对象 `kernel` 是模块组、又不在 §6.11 里，按判据一归本卷 sys.time_env；该文件在 rules层-3 消费者组，所以落在 time_env-3，正确。
7. **重跑读数**：阶段分布 3/81/11/11/2/2，n = 5，卡 110 张，dependsOn 断链 0、成环 0，都能复现；卡账 JSON 和摘要逐字一致，git status 干净。卷十一 :890 写的疑点 18 张、待查 13 张、E-MIG-CARD-INCOMPLETE 104 张，与卡账摘要一致。check-卷十一 失败项 0，check-vol2、check-vol2-ext 都 PASS。冻结目录（server-plugin、extension、tools、world）的 diff 为空。四份快照逐字核过：卷十一 勘误前、封卷、v2，卷二 勘误前、现行，都对。卷二和卷十一都有 1115y12 修订记录，写了必要理由。

## 真问题

- **T1 M14-82c 误归 sys.offscreen_save**：这行的落点对象是 `rules.learning`（卷十四 §2.5 的规则表键），落点正文讲的都是卷十四各键的去向，只附带一句"version → 退役，由卷二十七 R27-7.1 覆盖"。新规则"按出现次序取第一个引用"把这个附带的 R27- 当成了接收卷，结果归到卷二十七。勘误前这行归 profession-1。建议按整类修，二选一：落点对象本身是登记在某卷的表代号或规则表键时，由它的登记卷定，不走正文引用；或者正文引用只取落点对象所在那一段。修完重跑，报受影响的行数。
- **T2 M2-11c 依据错引**：落点写"卷六 §4.21（economy:*、lending:* 派生槽按本节上表迁 `process.*`）"。卷六没有这句话，"本节上表"实际是卷二 §6.11 :2218。另外，`derived.mjs:6` 引入的 `world/ontology/derived-fields.json` 是派生黑名单，含任务额度、俸禄、职权、日程等，跨好几卷，不是 economy 的槽表；槽表里的 decision/autonomy 也没有定系统。derived.mjs 本身又是 M2-39 要搬进 kernel 的第〇层文件。所以这行归 sys.economy（进而 LEDGER-1a）的依据不成立。要么改写落点和依据，要么并入 B3 一起交补裁。
- **T3 搬迁卡依赖丢失**：gen-card-ledger.mjs 的 `fileToReloc` 是"一个文件对一张搬迁卡"的 Map，后写的覆盖先写的。那 3 个文件同时在 aiGate-1 和 outputGate-1，结果 C-卷二十九-sys.display_l10n-1 只依赖 outputGate-1 和 host-1，按 R11-7.2 来源 4 漏了 aiGate-1。读数"依赖断链 0"反映不出这个漏项。这段代码原来就有，本次因为文件重叠才实际触发。建议改成一个文件对多张搬迁卡，依赖全部加上；做不做取决于 B2 怎么定。

## 需李白补裁

- **B1 机械替换类清扫卡（19:12 没覆盖到的部分）**：
  - ① 必填矩阵清扫卡的 `rowKeys` 栏，机械替换类也改为"列"，否则 E-MIG-ROW-ORPHAN 一直是 1；
  - ② 文件上限：机械替换类豁免 `maxFiles`，或者按上限切成多张清扫子卡，否则缺陷项去不掉；
  - ③ :205 改为"默认不改代码（例外见 R11-7.8）"；
  - ④ 口径：M2-13 写"全仓库 129 个文件"，脚本只在 server-plugin、extension 里列，得 140 个（基线 d54c89a3 也是 140）；算上 tools/ 是 234 个。要定是运行时两个进程还是真的全仓库，并把行内的 129 改成脚本读数或引用摘要。
- **B2 M2-19b/19c**：同一组 3 个文件分进两张搬迁卡，两行的落点都只写"提示拼装代码"，没有写各自搬文件里的哪一部分，两张卡谁先谁后、改同一文件冲突怎么处理，都没有规则。另外，原处置 `move_out` 改成 `relocate_only` 是编辑的判断，而 R11-1.3 对 move_out 的定义正是"文字处理移到非规则组"。需要定：合成一行一张卡，还是按函数拆开并写明各搬哪一部分；定了再修 T3。
- **B3 消费方系统依据偏弱的行**：
  - M2-20：R29-7.3 讲上行只带代号，不讲请求编号的来源；卷二十七 R27-7.3 写的是"按 kernel 发的请求编号记进输入序列"，候选可以是 sys.offscreen_save，也可以仍归 host（bootstrap）。
  - M2-12c：引 R22-1.4，并说与 M22-5 同口径，但 M22-5 的锚点不含 retrieval.mjs，属推定。
  - M2-11c：同 T2。
- **B4 resolveFile 修好后的并组**：activities.mjs、learning.mjs、combat.mjs 解析出来后，整文件锚点和行范围锚点链式并成大的位置组，按"取行数最多"落到 sys.combat。涉及 M8-3（职位）、M9-6、M14-62/63/64、M15-19、M13-4/6、M21-18。还有：M7-11（信仰冷却）→ place；M3b-5、M6-67、M17-2 → facility_type；M17-3 → sys.capacity；M6-64、M20-71 → event_type；M6-26 → sys.ai_interface；M11-2a → worldgen；M20-4、M23-6 → display_l10n（这两行合判据一，正确）。机械上合现行规则，但好几行语义上可疑，请李白定是否收紧位置组的并组口径。19:08 要求"报受影响行数"，实际数应该报约 27 行对象变动；另有约 15 行只是同对象内的卡序号变了。

## 措辞小项

- 卷十一 :763 接口表"退役口径与五种处置"、transcribe-migrows.mjs 的提示"处置不是五值之一"，都没有随"六种"更新。领域卷仍只用五种，可以加一句注明。
- M2-2 的去处栏写"删除"，但它所从的 M29-28 是 `move_out` → outputGate。以领域卷为准，建议文字上写明。
- M2-13 的落点对象仍写 `kernel`，和新 R11-7.5"改调入口子行的落点对象是消费方系统"字面不合。生成器靠机械替换类的豁免绕过了，可在行内注明。
- M2-12c 处置是 `delete`，理由栏却叫"改调入口"，可以统一说法。
- 生成器把超过 maxFiles 记成 E-MIG-CARD-SCOPE，卷十一 :280 另有专门的 E-MIG-CARD-SIZE（代码文件数超过上限），标签用错了（旧代码）。
- SWEEP-1 的文件清单用的是旧路径：其中 server-plugin 根目录的 15 个文件在阶段 1 会被搬进 kernel/；清单里还有 M2-24 要删的 extension/core.js。

## 附录 O5：固定种子抽样

总体是卷二 §6.11 的 69 行 M2 行（按卷内次序编 1–69）。种子 20261115 mod 69 = 24，步长 31（与 69 互素），第 k 个样本取 (24 + 31k) mod 69 + 1，k = 0..29，共 30 行，不重复。

| 行号 | 编号 | 处置 / 对象 | 核对 |
|---|---|---|---|
| 25 | M2-12b | relocate_only / content-scripts | 符 |
| 56 | M2-37 | relocate_only / kernel | 符 |
| 18 | M2-10a3 | replace_entry / sys.economy | 符（未改） |
| 49 | M2-30 | 同 M29-51 | 符 |
| 11 | M2-6 | 同 M9-22 | 符（未改） |
| 42 | M2-23 | 同 M29-36 | 符 |
| 4 | M2-3a | relocate_only / kernel | 符 |
| 35 | M2-18 | move_out / sys.ai_interface | 符（tools.mjs 在卷九系统 defFiles） |
| 66 | M2-44 | relocate_only / kernel | 符 |
| 28 | M2-14 | 同 M11-2 | 符 |
| 59 | M2-40 | relocate_only / kernel | 符 |
| 21 | M2-11a | 同 M6-21 | 符 |
| 52 | M2-33 | relocate_only / kernel | 符 |
| 14 | M2-9 | 同 M9-17 | 符 |
| 45 | M2-26 | 同 M29-39 | 符 |
| 7 | M2-4a | 汇总行 | 符 |
| 38 | M2-19c | relocate_only / aiGate | 不符（文件与 outputGate-1 重叠，依赖丢失，T3/B2） |
| 69 | M2-45b | 同 M12-5 | 符 |
| 31 | M2-15c | replace_entry / sys.offscreen_save | 符（R27-4.11） |
| 62 | M2-42 | relocate_only / kernel | 符 |
| 24 | M2-12a | replace_entry / sys.ai_interface | 符（M9-23 同文件） |
| 55 | M2-36 | relocate_only / kernel | 符 |
| 17 | M2-10a2 | replace_entry / sys.profession | 符（未改） |
| 48 | M2-29 | 同 M29-45 | 符 |
| 10 | M2-5b | replace_entry / sys.ai_interface | 符（R9-18.2） |
| 41 | M2-22 | 同 M29-34 | 符 |
| 3 | M2-2 | 同 M29-28 | 符（措辞小项） |
| 34 | M2-17 | move_out / sys.display_l10n | 符（R29-7.9） |
| 65 | M2-43b | replace_entry / sys.social | 符（卷十八 :360 holdingKind） |
| 27 | M2-13 | replace_entry / kernel | 不符（孤儿行、超上限，B1） |

不符 2 条，共 30 条，比例 6.7%。

不可封卷
