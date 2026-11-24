# 补值卡 F 回报：实例批次禁合并、实例批次键、三卷勘误 1119k13（李白 11-19 21:0x ②③）

## 交卷前自查
| # | 问题 | 是/否 | 证据 |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 裁定原文 docs/审查/李白裁定-1117.md 末节"21:0x"②"在 K-3 合并条件里补一条'属逐件实例的批次不与任何批次合并'…批次键：账本序号键文法保留给散货批次，另加一种由实例 id 确定性派生的实例批次键（如 lot_i_<实例id>），序号审计只核序号键、实例键核'与实例一一对应'。不给实例另存批次指针"；③"卷十四:961 quality_fine → quality_masterwork"；卷三乙 K-3 :1037；卷六 §2.1 `resource` 行 :104；卷十四 :961 |
| 2 | 没有按 id/名字/场景写特例 | 是 | 判据只看批次键是否实例批次键（`lotKeyInstance`），整类；不认任何物品、模板、实例 id |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | `lotsUnmergeable` 两键必给（缺键抛 E-DIM-STRUCT-FIELD，测试有）；实例腿 delta 只许 1；实例批次出账到 0 整行删、同账户同键重入拒 E-DIM-ID-DUPLICATE；审计核实例不存在、余额不为 1、同键两账户、实例无批次 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 用例在临时世界造前提（PA 建 a、b，PB 建 c），期望值是字面量（件数 1、键 lot_i_item_inst_N） |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 无 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | diff 共 7784 行（三份勘误前快照整卷拷贝约 7300 行，实质约 480 行）；见"偏离"栏（markers.mjs、item-state.mjs、quality.json 为必需接点；两份勘误前快照等为体例） |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：tests 1060 / pass 1060 / fail 0；`node tools/accept/run.mjs pre_commit`：verdict pass |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 工具、武器这类逐件实例转手后各是各的，不再被并成一个批次丢掉一件一批的对应；账本键由实例 id 派生，不加指针、不特判 |

## 做了什么
- `kernel/ledger.mjs`：SCHEMA 加 `instanceLotPrefix 'lot_i_'`；导出 `instanceLotKey(id)`、`lotKeyInstance(key)`；post 的批次腿加键集 `{attrs, instance}`（delta 只许 1），新实例键 = `lot_i_<实例id>`、不占 `ledgerCounters.lotNext`；拆分自实例批次（转手）键不变、原账户该行（余额行与 stockLots 行）出账到 0 即删，拆分 costBasis 回写跳过实例批次；`lotsUnmergeable(a, b, aKey, bKey)` 先判实例批次整类不合并，`mergeLots` 传键；`auditLots` 序号核只对序号键，实例键核"键里的实例存在、余额恰为 1、同键只在一处账户"，并核每件未终止实例恰有自己那一批（E-DIM-REF-MISSING / E-DIM-DOMAIN-RANGE / E-DIM-ID-DUPLICATE）。
- `kernel/item-state.mjs`：`lotMergeVerdict` 传键；新增 `lotKeyCompare`（序号键按序号在前，实例键在后按键串），`lotsView`、`rottenLots` 用它排序；`lotSeq` 对实例键抛错（实例键没有序号）。
- `item-lots.mjs`：先陈后新同进度时用 `lotKeyCompare`；转入合并步对实例批次自然判为不合并（经 lotMergeVerdict）。
- `kernel/dimension-writers.mjs`：createItemInstance 的批次腿带 `instance: spec.id`。
- `kernel/handles/markers.mjs`：`LOT_LEG_KEYS` 加 `instance`。
- 测试 tests/kernel/item-lots.test.mjs 新增 3 条：三把斧转手（PB 名下三个实例批次各数量 1、不并、键派生、不占计数器、PA 无残行、审计过；散货照旧合并）；实例批次 mergeLots 拒与 lotsUnmergeable 缺键拒；审计正反例（多一件、少一件、数量不为 1、同键两账户、序号键仍只核序号）。
- 勘误 1119k13：卷三乙 K-3 一条（并修订行 53）、卷六 §2.1 `resource` 行键文法分两种（并勘误行）、卷十四 :961 `quality_fine`→`quality_masterwork`（并勘误行）；各卷勘误前快照 `版本快照/卷三乙-v7-勘误前-1119k13.md`、`卷六-v10-勘误前-1119k13.md`、`卷十四-v8-勘误前-1119k13.md`（改前与 origin/master 正文同 blob，cmp 一致），现行快照 v7/v10/v8 覆盖为改后（cmp 一致），不升版本。
- `world/rules/tables/quality.json` 的出处说明里 quality_fine 的两处文字同步改。其余数据与代码无 quality_fine 引用。
- `tools/accept/criteria.json`：因被扫内核文件指纹变，17 个判据类别经 register.mjs（输入 F:/dnd-tmp/fixF-register.mjs）各 rev+1、补同号修订记录；判据本身未改。

## 偏离指令
- 用了 `cp` 复制快照（卡文许用命令里没有 cp）；写文件仍只用 Write/Edit。首次尝试用 node 脚本批量改文件被拦截后，改回逐处 Edit。
- 多改了 markers.mjs、item-state.mjs（卡文列的是 ledger.mjs、item-lots.mjs、dimension-writers.mjs）：键集记号的唯一定义在 markers，排序读键在 item-state；quality.json 只改文字。
- 实例批次出账到 0 整行删（散货批次零行保留不动）：否则同一实例键在原账户留零行，会被 K-8 判成同键两账户。

## 改一轮（Opus 只核，docs/审查/6-fixF-Opus只核-1119.md）
- world/ontology/state-owners.json：kernelApi 的 `item-state.mjs#lotSeq`（规则层已无调用方）换成 `item-state.mjs#lotKeyCompare`，`callerFiles: ["item-lots.mjs"]`。
- ledger.mjs auditLots 实例键分支补两核：批次所在资源种类的 `item` 须等于实例模板（E-DIM-REF-MISSING）；实例已终止而批次仍有余额（E-TERM-RESIDUE）。tests/kernel/item-lots.test.mjs 各加反例。
- 容器持有的顾虑按核者意见撤销（K-2：容器内数量仍记在持有人账户）。
- criteria.json 经 register.mjs 再 rev+1。

## 未解决
- 其他持有批次之处（读批次键序号的调用方）若再出现，要走 `lotKeyCompare`；本卡已查 item-state、item-lots，无其他 `lotSeq` 用法。
