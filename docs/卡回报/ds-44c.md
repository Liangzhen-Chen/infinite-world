| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 卷二 §1.10 :326"triangular：逆 CDF 用整数开方（牛顿法固定 32 步）"；卷二十七 R27-5.2 :573"`sqrt` 用卷二 §1.10 的整数开方（牛顿法固定步数），不查表"；卷二 §3.3 :1328–:1341"各卷不得自造算术"（唯一定义口径） |
| 2 | 没有按 id/名字/场景写特例 | 是 | 测试按分布种类 triangular 的公式（卷二 :326）算，不按 id/维度名分支；seed/kind/id 只用于取 golden vector u |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | 三角两支（r<f、r≥f）都覆盖；开方负数/域外由既有 E-DET-DOMAIN 测试守；新增缺 `iterations` 例（NULL 步数）报 E-DIM-STRUCT-FIELD，不退回别的循环（tests/kernel/sample.test.mjs 末例） |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 期望值 0.51、2.7、51961524 全部按卷二公式手算，推导写在 tests/kernel/sample.test.mjs 注释；未读生成表当前值 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | diff 只含本卡要求的两处实现与测试；criteria 的 print 由登记器现算，无新常量 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | server-plugin/kernel/det-math.mjs、server-plugin/kernel/sample.mjs、tests/kernel/sample.test.mjs、tools/accept/criteria.json（只经登记器）、docs/卡回报/ds-44c.md；本提交 diff 共 355 行 |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → pass 595 / fail 0；`node tools/accept/run.mjs pre_commit` → "verdict": "pass"；`node tools/gen-det-tables.mjs --check` → up to date |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 三角分布求值有了手算基准，块 6 人物维度采样落到唯一开方实现上；未违背北极星（规则层唯一实现、派生优先、无特例） |

## 4-4c：整数开方全仓一份

目标：整数开方全仓一份、牛顿固定步数，`sample.mjs` 删 `isqrt`，与 detfn `sqrt` 共用 det-math 的实现；测试先行。

照做的卷文原句：
- 卷二 §1.10 :326："triangular：逆 CDF 用整数开方（牛顿法固定 32 步）"。
- 卷二十七 R27-5.2 :573："`sqrt` 用卷二 §1.10 的整数开方（牛顿法固定步数），不查表"。
- 卷二 §3.3 :1328–:1341："存量闭式……全书只许用下面五个内核函数与一条读法……各卷不得自造算术"（唯一定义口径；开方同此原则，经 R27-5.2 落到 kernel/det-math.mjs）。

### 提交 1（测试先行，8c95fd65）

`tests/kernel/sample.test.mjs` 增三条测试（三角左支 0.51、右支 2.7、开方与 det-math sqrt 同输入同值）。旧 `isqrt` 收敛结果与固定 32 步一致，故本提交全绿。

### 提交 2（实现，本提交）

- `server-plugin/kernel/det-math.mjs`：新增唯一整数开方原语 `fixedSqrtInt(n)`（与标度无关，⌊√n⌋，牛顿法固定步数，步数读 `fnTables.sqrt.iterations`，缺即 E-DIM-STRUCT-FIELD）；`sqrt(x)` 只做定义域核对与标度换算（`n = v·outScale²/inScale`），开方本体调 `fixedSqrtInt`。没有第二份牛顿循环。
- `server-plugin/kernel/sample.mjs`：删 `isqrt`；`sqrtFixed(v) = fixedSqrtInt(v · SCALE)`，标度放大后调同一原语，不在 sample 写迭代次数。
- `tests/kernel/sample.test.mjs`：加一例——把 `iterations` 去掉后 `sqrt` 与三角采样都报 E-DIM-STRUCT-FIELD，证明步数只从登记来。
- 验收 grep：`grep -rn "isqrt\|function.*[Ss]qrt" server-plugin` → 只剩 `det-math.mjs:471 export function fixedSqrtInt(n)`（唯一算法）与 `det-math.mjs:488 export function sqrt(x)`（标度包装，内部调前者）；`isqrt` 已无。
- `tools/accept/criteria.json`：det-math.mjs 在 12 个扫描类别的检测器 import 闭包内，判据指纹变动，按卡文经 `tools/accept/register.mjs` 重盖：const_literal 37→38、dual_write 28→29、handfill_derived 29→30、instance_name 45→46、item_form 30→31、namelist 30→31、param_consumed 22→23、registry_write 46→47、seed_sites 9→10、self_name 35→36、state_pattern 6→7、undeclared_io 24→25；各追加一条"判定口径不变"记录，旧记录一条未删，print 由登记器现算。

推导（u 与各步，均按卷二公式手算，见测试注释）：
- seedKey = sha256("seed_ab12|person|per_abc123|height") = SEED_PLAIN；u = 0x0166f0ccf6416e88 = 101032804757892744；r = ⌊u×10000/2⁶⁴⌋ = 54。
- 左支 min 0 / mode 5 / max 10：f=5000>54；√(54×100000×50000/10000/10000×10000) = ⌊√27000000⌋ = 5196；截断 5100 → 0.51。
- 右支 min 0 / mode 0 / max 1000：f=0≤54；√(9946×10¹⁰/10⁴×10⁴) = ⌊√99460000000000⌋ = 9972963；10⁷−9972963 = 27037；截断 27000 → 2.7。
- det-math sqrt 同输入 0.27（10⁸ 标度 27000000）：⌊√(27000000×10⁸)⌋ = 51961524，÷10000 = 5196，与三角开方同值。

### 只核（4-4c，DeepSeek，2026-11-18）

结论：**可封，无必须改**。核查原文见 `docs/审查/4-4c-DS只核-1118.md`。

- 重点 1（固定 32 步收敛）：成立。初值是 2^⌈bitLength/2⌉（det-math.mjs:477），不是 n，相对误差 ≤ 1；detfn sqrt 最大输入 < 2⁸⁰、三角最大输入 < 2¹⁰⁸，均在 7–8 步内进入整数不动点，32 步余量 ≥ 4 倍；min(y, ⌊n/y⌋) 在收敛后任一状态都给 ⌊√n⌋。
- 重点 2（测试期望）：u=101032804757892744、r=54、0.51、2.7、51961524/5196 逐条按卷二公式手算复核一致。
- 重点 3：运行时内核整数开方只剩 fixedSqrtInt 一份；sample.mjs 无步数常数；缺 iterations 报 E-DIM-STRUCT-FIELD 合码义，0 由登记类型取值域 [1,null] 在加载期拒收。
- 重点 4：criteria 12 类各追加一条 ref、rev+1、print 重算，无删除、无 terms 手改，只经登记器。
- 命令末行：`node --test tests/kernel/sample.test.mjs tests/kernel/det-numeric-fn.test.mjs` → pass 27 / fail 0；`node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → pass 595 / fail 0；`node tools/gen-det-tables.mjs --check` → up to date；`node tools/accept/run.mjs pre_commit` → "verdict": "pass"。
- 小项（不影响判定）：代码注释行号 :326/:573 与现行卷文差一行（实为卷二 :327、卷二十七 :574）；"缺 iterations 即拒"负例随实现提交而非测试先行；离线生成器 tools/gen-det-tables.mjs 另有自己的整数开方，属离线生成、不属运行时内核。
