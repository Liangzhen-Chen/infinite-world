# ds-b4-3 回报（4-3 补：加载入口装配骰值键限定成分上限）

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 卷二 §7 S10「出现在 `if/?:/&&/||/比较/算术` 里、不来自 `engine.rules` 的数值 = 0」（现行本 :2407；卡文与既有登记沿用 :2404）——故上限经规则表读入即不计 const_literal；卷二十七 R27-8.5 :728「`subjectId` 可以是上款所列的一个 id 后接一到两个限定成分」 |
| 2 | 没有按 id/名字/场景写特例 | 是 | 装配只在加载入口一处（server-plugin/kernel/load/world.mjs:47-50）；sample.mjs 对任何 subjectId 按同一上限判拒（sample.mjs:133-138），无 id、卷名、文件名分支 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | 未装配时 diceKeyOf 抛加载顺序错、无缺省放行；规则表缺该键时 loadWorld 直接抛错；上限值（id 后接两个限定成分）放行，超上限（id 后接三个）拒 E-SEED-COMPONENT——tests/kernel/sample-load.test.mjs:15-35 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 期望键串按 R27-8.5 :721–:728 的拼接式手算；上限 2 是 :728 写明的设计值（一到两个），不是仓库读数；缺键用例自造临时规则表（删掉该行），不抄当前计数 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 数值只在 world/rules/tables/kernel-constants.json 作登记数据；world.mjs 经 need('diceKeyMaxQualifiers') 核、installSampleConstants(read.rules) 收下，源码无该字面量；gate 的 c_const_literal 各 current 0 |
| 6 | 只改了卡文列出的文件；diff 共 89 行 | 是 | server-plugin/kernel/load/world.mjs（只加这 5 行装配）、tests/kernel/sample-load.test.mjs（新增 52 行）、docs/卡回报/ds-b4-3.md；`git diff --cached --stat` = 3 files changed, 73 insertions(+), 16 deletions(−) |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/*.test.mjs tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 498 / ℹ pass 498 / ℹ fail 0`；`node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`（c_const_literal 各 0、seed_sites current 0） |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 真实世界经加载入口即可用骰值键上限，竖切片抽样不再只在测试里装配；上限仍从规则表派生，未写死、未开特例 |

## 卡文逐项

1. **已做**：`server-plugin/kernel/load/world.mjs` 在 `installFixedConstants(...)` 同一位置加装配——先 `need('diceKeyMaxQualifiers')`（缺键照 `need` 的现有报错方式拒：`E-DIM-STRUCT-FIELD rules.kernelConstants: diceKeyMaxQualifiers missing`），再 `installSampleConstants(read.rules)` 收下（world.mjs:19、:47-50）。位置与 `installScheduler` 收 `handleRadix` 同法。

2. **已做**：新增 `tests/kernel/sample-load.test.mjs` 三条——
   - 未装配时 `diceKeyOf` 报 `rules.kernelConstants.diceKeyMaxQualifiers missing (load order)`，不给缺省；
   - 经 `loadWorld(ROOT)` 后 `diceKeyOf` 可用，上限为 R27-8.5 :728 的 2（id 后接两个限定成分放行，接三个拒 `E-SEED-COMPONENT`）；
   - 规则表删掉该键时 `loadWorld` 按常数装配的同一方式抛错。

## 验收命令与末行

- `node --test tests/*.test.mjs tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 498 / ℹ pass 498 / ℹ fail 0`
- `node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`；`c_const_literal` current 0，`seed_sites` current 0
