BigInt 指纹修复卡（DeepSeek 第二张）只核与复核回报原文。执行者 DeepSeek deepseek-flash 三轮（首轮、只核修正、基线漂移重盖指纹；实价以 DeepSeek 账户为准）；只核 claude-sonnet-5-5 medium（$0.26；档位：单卡活按 23:04 分档 Sonnet）；复核 claude-sonnet-5-5 medium（$0.10）。主会话照录，不改字。

## 一、Sonnet 只核（对象 711cd732）

照卷十二《验收与自动扫描》、卷二《维度表规范与统一入口》

**结论：修后封（一项必须改）。**

必须改：lit_scope 改引 `keys.mjs` 的 `parseDimKey` 后，判定口径变严，修订记录却写"判定口径不变"，两处不符。
- `parseDimKey` 经 `subKeyOk` 核 map 下标，而 `modifierRegistry` 的 `vocabIndex` 恒为空（`lit_scope.mjs` 约 L67）。
- 所以键定义带 `vocab` 或 `domain.vocab` 的 map 维度，其下标一律不再算修正键。旧版只判键形，这类键原先会算。
- 数值下标也改走 `Number` 转换。
- 现有 `world/` 里没有 `modifiable:true` 的 map，所以眼下不影响命中，测试也全过。
- 修法二选一：给 `vocabIndex` 填真数据，或把 26 条修订记录和提交说明改成"口径收严，附理由"并报李白。
- 这是改动方向，不是纯重构，我不替它选。

其余各项：
- **codePrint**：`tokenJson` 对非 BigInt 原样返回，序列化路径与改前相同，不含 BigInt 的输入指纹因此逐字不变。BigInt 序列化为 `{"$bigint":"…"}`，测试覆盖不撞值、不撞字串。
- **改前字面量**：测试里三条文件组合指纹在改前提交里没有出处，我无法单独核对；只能由"改动文件未触及、序列化逻辑等价"推定。
- **登记**：26 类各加一条修订记录，改动只涉及 `print` 和 `rev` 两项，旧记录未删；`items.json` 未动。`flow_taint`、`legacy_symbol` 的空闭集指纹由测试断言。
- **temp-repo.mjs**：只补 `keys.mjs` 闭包以及 `files.json`、`kernel-constants.json` 的复制，`tempRepo` 的临时根断言和 entries 没动。
- **卷二 :844**：改引后键拼接只在 `keys.mjs`，合此条。
- **验收命令**：`node --test` 246 全过；commit-hook 与 `run.mjs pre_commit` 通过。
- **三条硬要求**：卡文里的回报在提交说明里看不到，我没能核到。

DeepSeek 评语：代码和登记做得扎实，但没发现改引后口径变严，还写了"口径不变"。

## 二、Sonnet 复核（对象 93c6d4b5）

照卷十二《验收与自动扫描》、卷二《维度表规范与统一入口》

**可封。**

- **词表来源：** vocabIndex 在 lit_scope.mjs 里经 loadVocab 从被查内容的 `_vocab.json` 读取，检测器里没有列具体词表或代号。
- **口径：** 带 vocab 的 map 维度，下标为已登记且族匹配的代号才算修正键，与 keys.mjs:28 一致。未登记代号和他族代号不算。
- **修订记录：** scanclasses.json 里用 lit_scope 的恰为四类：const_literal、instance_name、registry_write、self_name，四类都已改写并升 rev。instance_name 如实写"收严"。其余 22 类仍写"口径不变"，属实。
- **用例：** 已登记代号 must_fail 报 1，未登记代号、他族代号、无词表登记 must_pass 报 0；夹具自造，没动 world/。
- **验证：** 246 个测试全过，commit-hook 与 pre_commit 通过。

DeepSeek 这轮按只核意见改得到位，范围控制得好。

## 三、主会话注

主会话在 master 上试合时，因 master 已合入 2-4 裁定落实卡（error-codes.mjs 加码），lit_scope 指纹闭包含码表致四类 E-ACC-CRITERION-UNVERSIONED、9 条测试失败——属基线漂移；撤回未推送的本地合入，退 DeepSeek rebase 后四类重盖指纹升 rev（269a50b2）。三提交压一合入 master：0f403248；本机 252/252，pre_commit verdict pass。结构问题记 docs/问题.md"BigInt 指纹修复卡记账"。返工一次（只核必须改）＋一次基线重盖，未一次过审，DeepSeek 仍单路。
