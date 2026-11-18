# ds-b4-3 回报（4-3 补：骰值键限定成分上限改为登记的内核常数）

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 卷二十七 R27-8.5 :728「`subjectId` 可以是上款所列的一个 id 后接一到两个限定成分」；卷二 S10 :2404「出现在 if/?:/&&/||/比较/算术里、不来自 `engine.rules` 的数值 = 0」，故上限经规则表读入即不计 const_literal |
| 2 | 没有按 id/名字/场景写特例 | 是 | 上限由 `kernelConstants.diceKeyMaxQualifiers` 一处读入，判所有 subjectId：「限定成分个数 > 上限即拒 E-SEED-COMPONENT」，无任何 id、维度或抽取点分支（server-plugin/kernel/sample.mjs:38-65、:133-138） |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | 零个（`'per_abc123'`、`['place_a']`）、一个、两个限定成分放行；三个及第四位空值按上限拒；中间/末位 `undefined` 填 `nil_seedpart`，`null` 照拒——tests/kernel/sample.test.mjs:73-111 原用例全过；未装常数时 `diceKeyMaxQualifiers()` 抛加载顺序错，无缺省放行（sample.mjs:62-65） |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 未新增断言；装配值 2 是卷二十七 :728 写明的设计值（「一到两个」），不是仓库读数（tests/kernel/sample.test.mjs:18-19） |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 删掉 `[first, , , ...extra]` + `extra.length !== 0` 的绕检查写法；数值 2 只在 world/rules/tables/kernel-constants.json 作登记数据，代码经 installSampleConstants 从 rules 收下，不写假常量（sample.mjs:38-65、:136-137） |
| 6 | 只改了卡文列出的文件；diff 共 80 行 | 是 | server-plugin/kernel/sample.mjs、tests/kernel/sample.test.mjs、world/rules/registry.json、world/rules/tables/kernel-constants.json、docs/卡回报/ds-b4-3.md；`git diff --stat`（含本回报）= 5 files changed, 56 insertions(+), 24 deletions(−)，共 80 行 |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/*.test.mjs tests/kernel/*.test.mjs tests/accept/*.test.mjs` → tests 495 / pass 495 / fail 0；`node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`，c_const_literal 0、c_text_kernel_1/3/4 各 0、seed_sites 0 |
| 8 | 这张卡让块 6 哪一步更近了 | 是 | 骰值键「一个 id 后接一到两个限定成分」的上限回到规则表登记值、运行期从 engine.rules 读，竖切片按卷文重算抽取值时不再靠绕检查的写法；未改任何北极星口径 |

## 卡文逐项

1. **已做**：`diceKeyOf` 去掉了 `[first, , , ...extra]` 的解构写法，改为 `parts.length - 1 > diceKeyMaxQualifiers()` 判上限（sample.mjs:133-138）；上限经 `installSampleConstants(rules)` 从 `kernelConstants.diceKeyMaxQualifiers` 收下，未装即抛加载顺序错（sample.mjs:48-65），照 `installScheduler` 的 handleRadix 做法。
2. **已做**：kernel-constants.json 登 `diceKeyMaxQualifiers` = 2（未加 `file` 字段，格式同 handleRadix 行），出处卷二十七 R27-8.5 :728；registry.json 的 type/domain/packOverridable 补该键，volume 补 :728（值域 `[1, null]`，packOverridable false）。
3. **已做**：现有断言原样通过（零个、一个、两个放行；三个拒；空位与 null 各按 :729 处理）。测试文件只加一行装配 `installSampleConstants({ kernelConstants: { diceKeyMaxQualifiers: 2 } })`，与同文件既有的 `installDigestCap`、`installFixedConstants` 同一做法，用例与期望未改。
4. **照办**：未实现分布仍抛普通 Error（sample.mjs 末尾），按住卡文与卷二 :1550 无码异常按程序缺陷原样抛回，4-4 实现这些分布。

**加载入口接装**：本卡文件所有权不含 `kernel/load/world.mjs`，故未在加载器里加 `installSampleConstants(read.rules)` 调用；`diceKeyOf` 目前只在测试里有调用方。待骰值键接 scheduler/draw 的卡把该装配接进加载入口即可（与 installScheduler 同一位置），本卡未越界改其他文件。

## 验收命令与末行

- `node --test tests/*.test.mjs tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 495 / ℹ pass 495 / ℹ fail 0`
- `node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`；`c_const_literal` current 0，`c_text_kernel_1/3/4` current 0，`seed_sites` 0
