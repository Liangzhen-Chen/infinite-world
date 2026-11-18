# 接缝 A–C 与内核信号代号：只核

只核者：claude-opus-5-5 中档，只读，没有改任何文件（非改者）。核对时 HEAD 是 a7fcbaaa。
原始输出：`审查/脚本输出/接缝ABC与信号代号-只核-原始输出.txt`（注入只改了临时副本，放在会话 scratchpad 里）。

## 结论

三组提交都到位，没有发现真问题。另有 3 个小项记账，都不阻断。

## ① 49df660e 接缝 A–C、4e9f6a33 脚本

- **A 到位**：卷二十七 R27-8.5“生成期的第三、四段”里，第四段已改为引用卷十 R10-12.3 ①（原文为“时刻段恒取 `genesisMinute`”，卷十:848），并给出 `state.genesis.genesisMinute`，该字段见卷十 §2.5 `state.genesis` 行（卷十:203）。本卷原有的“创世时刻”定义已删，正文里不再出现“创世时刻”。卷七 R7-16.7 ③ 的括注改为引用卷二 §2.9 第 0 条和 R10-12.3 ①。卷八 R8-16.2 只写引用、不复述，所以不用改。
- **B 到位**：裸写的 `none` 换成带前缀的固定代号 `nil_seedpart`。全书没有别的 `nil_` 前缀，也就没有撞名。按裁定，它作为一行登在小族里，原来那段“一一对应”的论证随之删去。
- **C 到位**：卷二 §2.9 第 0 条“注入防线与剥离口径”一项之后，新增“内核信号代号（小族；唯一登记处）”。`layout_change` 的发出方和接收方与正文:788（附录 D:2463）一致；`naming_intent` 与正文:978 第 3、4 步一致。
- **4e9f6a33 脚本没有放宽**：备份→现行的 diff 与记录的 diff 逐字相同。改动是从忽略名单里去掉 `naming_intent`（后一笔又去掉 `note_intent`、`dimension_write_rejected`），并新增 2b 项：按表核对代号、每行 5 列、发出方和接收方各自唯一且不为空、正文发出的代号必须已登记、跨卷引用必须已登记。只有判据收紧，没有放宽。check-vol2-ext.mjs 没改。

## ② a7fcbaaa 卷二补两行、脚本 diff

- `note_intent`：照抄卷二:985 第 2 步的原文（“规则层发 `note_intent`……事务提交后 kernel 生成一个 `NamingIntent`……与起名相同”）。接收方写 `kernel/transaction.mjs`，与 `naming_intent` 是同一口径，没有新设计。
- `dimension_write_rejected`：发出方照卷二:1257（`kernel/validate/dimensions-validate.mjs`，运行态写回“失败即拒写并发 `dimension_write_rejected` 事件”）和 A8:1965 写成 kernel 校验入口。**我自己 Grep 过 `docs/统一底层设计` 下全部卷，再用“写回被拒/拒写”搜了一遍**：这个代号只出现在卷二:1257、:1965 两处，没有任何地方写谁接收它。所以写“缺接收方”属实，附录 D:2465 也注明了“留作机制项待裁”。
- 脚本 diff 与 F:/dnd-tmp/vol2/check-vol2.mjs 现行版本一致，只做删减忽略名单这一项。

## ③ 7d442161 check-卷二十二

idRe 把 `verb` 纳入扫描。idAllow 只精确放行 5 个名：本卷的 `verb_fact_learned`、`verb_fact_told`、`verb_belief_contradicted`、`verb_research_done`，加上卷二终止协议的 `verb_entity_terminated`（卷二中出现 4 次）。卷二十二全文中的 `verb_` 恰好就是这 5 个。脚本与记录的 diff 逐字一致。

## 快照（勘误合规）

用 `cmp` 逐字节核对，全部一致：
- 1114aj 三份快照：卷二、卷七、卷二十七，各自等于 49df660e^ 时的原文。
- 1114al：等于 a7fcbaaa^ 时的卷二。
- 现行快照：卷二-v17补26-现行、卷七-v5、卷二十七-v4、卷二十七-封卷，都与现行卷文相同。

三卷都没有升版本号，附录 D 和勘误行都写了快照名和理由。

## 重跑与注入

| 项 | 结果 |
|---|---|
| check-vol2（2b：登记 5 个，正文与跨 32 卷引用均 OK） | PASS |
| check-vol2-ext | PASS |
| check-卷二十七 | 失败 0 |
| check-卷七 | 失败项 0 |
| check-卷二十二 | ALL PASS |
| check-divisor | 真命中 44/44，误报 0，各回归全过 |
| 注入 1：卷二副本加 kernel 发 `probe_unreg_sig {unit}` 事件 | FAIL“未在小族登记（行 1258）” |
| 注入 2：卷二副本把 `dimension_write_rejected` 的接收方单元格清空 | FAIL“缺接收方” |
| 注入 3：卷二十二副本加别卷代号 `verb_harvest_done` | FAIL 第 5 项“690:verb_harvest_done” |

## 记账小项（不阻断）

1. **`nil_seedpart` 放在“内核信号代号”族里不太贴切**：族首句是“kernel 只认下表这几个固定代号”，表头是发出方/接收方，但它是骰值键的一个成分，不是信号。接收方一栏写的“卷二 §1.10 种子键派生函数”也不是正文原话：§1.10 的 seedKey 是四部件的身份键，五段骰值键由谁哈希还挂在 C10-14 上。裁定允许“登小族一行”，所以只记账。收卷时可考虑另立“固定空代号”一行，或把族首句改宽。
2. **check-vol2 2b 拦不住占位文字**：“不为空”的判断会把“缺接收方”当成一个有效接收方放过，2b 显示 OK，不报机制项。这不算放宽（之前根本没这项检查），但建议对“缺…”一类占位输出一条“注意”。
3. **机制项还没进待办**：`dimension_write_rejected` 缺接收方这条，目前只写在卷二附录 D 和 收尾待办:353 的裁定原文里，没有单列成待裁机制项，需要主会话补记。
