# ds-b4-3 回报（4-3 补：种子键驼峰维度、骰值键空成分）

| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 卷二 :284 维度键 `^[a-z][a-zA-Z0-9]{0,47}$`；卷二 :318 categorical 权重"非负且和>0"；卷二 :320 种子键派生式与"其余部件按代号规范"；卷二十七 :729 空成分填 `nil_seedpart`、不省略该位置；卷二 :1550 不带登记码的异常按程序缺陷原样抛回（第 3 项用） |
| 2 | 没有按 id/名字/场景写特例 | 是 | 维度一律按 KEY_RE 文法判（server-plugin/kernel/sample.mjs:65）；空成分按"位置存在而值为 undefined"统一填（sample.mjs:113-116），不认任何具体维度、限定成分或抽取点 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | 空位：`['place_a',undefined,'field_b']` 与 `['place_a',undefined]`、末位 undefined 均填 nil_seedpart；`null` 照拒；`['place_a','field_b',2,undefined]` 第四位即便为空也按长度拒——tests/kernel/sample.test.mjs:78-91、:102-105 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 驼峰维度 golden `1374cdc…298b` 由 node:crypto 对卷二 :320 的输入串 `seed_ab12|person|per_abc123|bodyMassKg` 独立算出并写死（tests/kernel/sample.test.mjs:25-26、:38-42）；空成分期望按 :729 手写键串 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 长度上限没写成裸数值 3（卷二 S10 只许 0/1/−1），改用 `[first, , , ...extra]` + `extra.length !== 0` 表达同一规则（sample.mjs:109-111），不是改名骗检查 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | 改动文件：server-plugin/kernel/sample.mjs、tests/kernel/sample.test.mjs、docs/卡回报/ds-b4-3.md；`git diff --cached --stat` = 66 insertions(+), 6 deletions(−)，共 72 行（含本回报 24 行） |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/*.test.mjs tests/kernel/*.test.mjs tests/accept/*.test.mjs` → tests 495 / pass 495 / fail 0；`node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`，c_text_kernel_1/3/4 = 0、seed_sites = 0 |
| 8 | 这张卡让块 6 哪一步更近了 | 是 | kernelApi `sample` 能对真实维度表里的 lowerCamel 维度抽样（不再被代号文法误拒），骰值键不再把中间空位吞成撞键——竖切片拿值这一步可按卷文确定性重算 |

## 卡文逐项

1. **已做**：`seedKeyFor` 的 dimension 改引 `validate/types.mjs` 的 `KEY_RE`（卷二 :284），kind、instanceId 仍 `CODE_RE`。补测：`bodyMassKg` 通过并带 golden；`body_mass` 按维度键文法拒收。
2. **已做**：`diceKeyOf` 按卷二十七 :729，空限定成分位置填 `nil_seedpart`（卷二 §2.9 第 0 条登记的代号），不省略；`['a',undefined,'b']` 与 `['a','b']` 得不同键。`null` 不是"位置存在而值缺"，照拒。
3. **未做，等裁定**：卡文要求把未实现分布（normal/lognormal/curve/ref/joint）的普通 Error 改为已登记码。查遍已登记码（server-plugin/kernel/error-codes.mjs:24 `E-DIM-SAMPLE-DOMAIN/-PARAM/-WEIGHTS/-CORR/-DERIVED`；卷二 :1534 码表、卷二十七码表）没有语义为"分布暂不可求值/冻结表未建"的码；E-DIM-SAMPLE-DOMAIN 的登记触发是 `clamp ⊂ domain`（卷二 :318），E-DIM-SAMPLE-PARAM 是"其他"参数校验，拿它们接"缺冻结表"是错码。卷二 :1550 明确"不带登记码的异常视为程序缺陷，reportError 原样抛回，不吞、不赋码"，kernel/errors.mjs:29 同此。按卡文"找不到合适的已登记码就停下回报，不自造码"，本轮留原样（sample.mjs:321）。需李白裁定：登记新码（勘误），或按卷二 :318 首批实现 normal/lognormal，或维持普通 Error。
4. **已写入提交说明**：上轮把测例 `fails({grd_a:1,grd_b:0})` 改成 `passes` 的理由——卷二 :318 categorical 权重"非负"且和>0，单项 0 合法（和=1>0），不是放宽门槛。

## 验收命令与末行

- `node --test tests/*.test.mjs tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `ℹ tests 495 / ℹ pass 495 / ℹ fail 0`
- `node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`；`c_text_kernel_1/3/4` current 0，`seed_sites` 0
