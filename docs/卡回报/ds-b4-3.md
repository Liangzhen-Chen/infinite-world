# ds-b4-3 回报（4-3 补：卷文行号出处校正，行为不变）

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 卷二十七 :730「`subjectId` 为复合对象段而某个限定成分取值为空时，该位置填卷二 §2.9 第 0 条"内核信号代号"小族登记的空代号 `nil_seedpart`，不省略该位置」（`sed -n '726,734p'` 亲读，:729 是 `worldTime` 行）；卷二 :2407「S10 直接 import balance/*.json 11 → 0；裸常数（B2-21……）……」（`sed -n '2400,2412p'` 亲读，:2404 是 S7 行） |
| 2 | 没有按 id/名字/场景写特例 | 是 | 本卡只改注释与登记串里的行号文字，无任何代码分支、无 id/文件名/卷名判断；`git diff` 全文只有行号数字变化 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | 本卡不改任何限额或校验逻辑（diceKeyMaxQualifiers 的读入与判拒一字未动，server-plugin/kernel/sample.mjs:57-65、:136-137 原样），无可被特殊值绕过的改动面 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 未加新测试；只把既有用例标题里的出处 :729 改为 :730（tests/kernel/sample.test.mjs:80），断言与期望键串一字未动 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 无计数相关改动；只改 7 处出处文字，gate 的 c_const_literal current 0 不变 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | server-plugin/kernel/sample.mjs（4 处）、tests/kernel/sample.test.mjs（1 处）、server-plugin/kernel/load/world.mjs（1 处）、world/rules/registry.json（1 处，仅 diceKeyMaxQualifiers 所在 volume 串）、docs/卡回报/ds-b4-3.md；`git diff --stat`（代码）= 4 files changed, 7 insertions(+), 7 deletions(-) |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/*.test.mjs tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 498 / ℹ pass 498 / ℹ fail 0`；`node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`，`c_const_literal.current 0` |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 出处指到现行卷文的正确行，后续按行号回查卷文的人不会查到 `worldTime` 行或 S7 行；行为零变化，未写死、未开特例 |

## 卡文逐项

1. **已改**：`server-plugin/kernel/sample.mjs:38`、`:53` 的 `卷二 §7 S10 :2404` → `:2407`；`server-plugin/kernel/sample.mjs:69`、`:140` 的 `R27-8.5 :729` → `:730`。
2. **已改**：`tests/kernel/sample.test.mjs:80` 用例标题里的 `R27-8.5 :729` → `:730`。
3. **已改**：`server-plugin/kernel/load/world.mjs` 的 `卷二 S10 :2404` → `:2407`（只这一处；同行的 `R27-8.5 :728` 未动）。
4. **已改**：`world/rules/registry.json` 的 kernelConstants 行 `volume` 串开头 `卷二 §7 S10 :2404` → `:2407`；同串里 `handleRadix` 等既有登记名与其他行号（:1319、:1333、:728）一字未动。
5. **未动（卡文未列）**：`server-plugin/kernel/sample.mjs:115` 注释里的 `R27-8.5 :730–:732` 仍指旧行段，卡文只列了上面这些行，故留原样并在此报告，由主会话定是否另开卡。

## 验收命令与末行

- `node --test tests/*.test.mjs tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 498 / ℹ pass 498 / ℹ fail 0`
- `node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`；`c_const_literal.current 0`
