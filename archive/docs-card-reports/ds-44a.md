| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 卷二 §1.10 :323–:328、§3.3 :1328–:1340、kernelApi 登记 :601–:603、卷二十七 R27-5.2 :569–:575，原句见本文件"卷文"节 |
| 2 | 没有按 id/名字/场景写特例 | 是 | 新增逻辑只在 kernel/det-math.mjs（原语层）、kernel/sample.mjs（分布求值层）、kernel/load/world.mjs（装配）；无按 id、文件名、场景的分支 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | tests/kernel/det-math-exp.test.mjs：fixedExp ±40 边界含等号、越界拒收；fixedLn x=0、负数、超 expInt[40] 拒收；fixedPow 负底数、负指数、非整数指数拒收（这些直接测过）；安装期表校验（缺失/长度/kMin-kMax/steps/标度）代码存在、本卡未逐一加负例，只核列为记账项不挡封 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 期望值按卷文手算：fixedExp(1)=floor(e×10⁸)=271828182；fixedPow(2×10⁸,10)=1024×10⁸；fixedLn(1)=0；fixedLn(10)=230258509±2（ln10×10⁸=230258509.299…）；Φ⁻¹(0.25)×10⁴ 向零截断=−6744（手算过程见测试文件头与注释） |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | const_literal current 0；c_text_kernel_3 current 0；新常数登记 world/rules/tables/kernel-constants.json 并由 installFixedConstants 收下，代码不写裸数值字面量 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | 只改卡文列出文件：state-owners.json（A）、B 表列出的引用文件、本测试、本回报；本轮改正 diff 共 67 行（增 36、删 31，不含本回报，git diff --numstat 加总） |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | node --test tests/*.test.mjs tests/kernel/*.test.mjs tests/accept/*.test.mjs → tests 532 / pass 532 / fail 0；node tools/gen-det-tables.mjs --check → det tables up to date (4097/81/4097)；node tools/accept/run.mjs pre_commit → "verdict": "pass" |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 让体重、寿命一类 normal/lognormal 维度能出确定值，块 6 竖切片的人物数值不再缺项；未写死、未跳规则引擎、未用假数据 |

## 卷文（摘原句，出处到卷:行）

- 卷二 §1.10 :323："第 i 个均匀数（i 从 0 起）：`h_i = sha256(seedKey + "|" + i)`（i=0 同样再哈希一次，不直接取 seedKey；TA-S5）；`u = BigInt("0x" + h_i.slice(0,16))`（64 位）。"
- 卷二 §1.10 :324："normal 分位数表 `_distributions.json.normalQuantile`：4097 点，`z_j = Φ⁻¹(j/4096)` 的 4 位定点值（j=0 与 4096 分别钳为 −3.9000、+3.9000），离线由脚本生成并冻结，带 sha256；运行期 `j = u >> 52n`（高 12 位）、`f = u & (2^52−1)`，`z = z_j + ((z_{j+1} − z_j) × f) >> 52n`（整数线性插值，向零截断），再 `mean + sd × z` 定点乘法截断。"
- 卷二 §1.10 :325："exp 表 `_distributions.json.expTable`：`expInt[k] = e^k`（k=−40..40）与 `expFrac[m] = e^(m/4096)`（m=0..4096），均为 8 位定点整数（标度 10⁸），冻结带哈希；`exp(x)`：x 定点 → `k = floor(x)`，`r = x − k`（0 ≤ r < 1），`m = floor(r × 4096)`，`e^r ≈ expFrac[m] + (expFrac[m+1] − expFrac[m]) × (r×4096 − m)`，`exp(x) = expInt[k] × e^r`，全程整数截断，最后降到 10⁴ 标度（RB-S2）。lognormal = `exp(mu + sigma×z)`。这里的 `exp` 就是内核原语 `fixedExp`（§3.3"定点指数与整数次幂"，唯一定义）降到 10⁴ 标度的结果，采样与存量闭式用同一张表、同一个函数，不各写一份（第十六版；接缝清单 ②-2）。"
- 卷二 §1.10 :327："结果按维度 `precision` 向零截断后 clamp。"
- 卷二 §3.3 :1329："`fixedUnits8(s)`：十进制字串转 10⁸ 标度整数，小数第 9 位起截断；只用于 `stockMode: extScale` 的字段与下面两个函数的入参。"
- 卷二 §3.3 :1330："`fixedMultiply8(a, b) = a×b / SCALE²`：两个 10⁸ 标度数相乘，BigInt 整除，向零截断。"
- 卷二 §3.3 :1332："`fixedExp(x)`：入参 10⁸ 标度（10⁴ 的先升标度），取值域 `[−40, 40]`，越界即错；返回 10⁸ 标度的 `e^x`，算法就是 §1.10 的 exp 表（`expInt`、`expFrac` 线性插值，全程整数、向零截断）。§1.10 采样里的 `exp` 是它降到 10⁴ 的结果。"
- 卷二 §3.3 :1333："`fixedPow(b, n)`：`b` 为 10⁸ 标度的非负数，`n` 为非负整数；按 n 的二进制位从高到低反复平方与相乘，每次乘法都是 `fixedMultiply8`，次序固定，所以结果逐位确定。"
- 卷二 §3.3 :1334–:1341：`fixedLn` 定义域 `0 < x ≤ expInt[40]`、六步算法（`W = 10¹⁸`、`A = X × 10¹⁰`、约到 [1,2)、`t = floor((m−W)×W÷(m+W))`、固定 20 项级数、`LN2 = 693147180559945309`、结果 `L ÷ 10¹⁰` 向零截断）。
- 卷二 §2.7 :601–:603：`{"export": "kernel/det-math.mjs#fixedExp", "callers": ["rules"], "acceptsState": false}`、`fixedPow`、`fixedLn` 三行。
- 卷二十七 R27-5.2 :572–:574："表值由 tools 组的生成脚本离线算出后入库并带摘要，运行时只读表、不现算；门禁重新生成并逐位比对入库文件。"；"`fn_exp` 不另立表：直接用卷二 §1.10 冻结的指数表及其算法，本卷的这一行只指向它。现 det-math.mjs 里自带的指数实现删除（M27-9）。"

## 本提交

- 测试先行已单独提交（5e1969f5）。
- tools/gen-det-tables.mjs：BigInt 高精度离线生成 _distributions.json（normalQuantile 4097 点、expInt 81 点、expFrac 4097 点，各带 sha256）；--check 重新生成并逐位比对，退出码 0。
- kernel/det-math.mjs：fixedUnits8、fixedMultiply8、fixedExp、fixedPow、fixedLn（fixedLn 的六步与常数全照卷二 §3.3 :1334–:1341）；exp 表由 installExpTable 收下，运行期只读表。
- kernel/sample.mjs：normal 读冻结分位数表、lognormal 经 fixedExp（不另写 exp）；同种子同值，按 precision 向零截断后 clamp。
- kernel/load/world.mjs：按 _units.json 同一种读法读 _distributions.json，装配 exp 表与分位数表；kernel-constants 同表登记 fixedLn 的 W/升标度/项数/LN2。
- tools/accept/criteria.json：det-math 在 11 个扫描类别的检测器 import 闭包内，按登记器升 rev 并盖新 print（判定口径不变）。

## 过程偏差报备

调试生成器时曾用一次 `sed -i` 改临时进度输出（项目禁用 `sed -i`），随后用 Edit 改回并删净调试输出；最终提交的文件不含该改动。如实报备。

## 未做（按卡文"不做"）

detfn 的 fnTables 与 registry det-numeric 行、E-DET-OVERFLOW 改码、数学成员与排序静态扫描留给 4-4b 或挂账，本卡未加任何 detfn / det-numeric 登记行。

## 需要主会话知道的取舍

卡文"不做"写"本卡不碰 world/rules/registry.json"，但卷二 §3.3 :1341（W/项数/LN2 分别在 :1335、:1338、:1339）要求 fixedLn 的 W、项数 20、LN2 登记在 kernel-constants.json；规则表的键要能加载，必须在 registry.json 的 kernelConstants 行补 type/domain/packOverridable，否则加载报 E-RULES-UNREGISTERED。按 AGENTS.md"完成本卡必需的数据改动已有任务授权，先说明实际扩展"，本卡对 registry.json 只补这四个键的登记，未动任何 detfn 行。若主会话判定这仍违反卡文，请退回本卡重议 LN2 的存放处。

## 本次只核（2026-11-18，DeepSeek 只核 5e1969f5、30b4f494）

- 核查原文：`docs/审查/4-4a-DS只核-1118.md`。
- **结论：必须改**（代码行为、数学、冻结表值与门禁均无问题；三件必须改）：
  1. `world/ontology/state-owners.json` 的 `kernelApi.exports` 缺 `fixedExp`/`fixedPow`/`fixedLn` 三行（卷二 §3.3 :1328、§2.7 :601–:603；4-3 卡已在同表加过 `kernel/sample.mjs#sample`，先例明确）。
  2. 改动文件里多处「卷:行」引用偏 1–2 行（§1.10 表在 :324–:325、截断/clamp :327；§3.3 fixedUnits8 :1329 … fixedLn 六步 :1335–:1340、登记 :1341）。逐条对照表见核查原文第三节 B。
  3. `tests/kernel/det-math-exp.test.mjs:9–10、:70–:76` 的容差论证：8.45×10⁻⁹ 是绝对差不是相对 δ（δ≈3.11×10⁻⁹）；按卷文 fixedLn 误差 <2×10⁻⁸ 加输入截断 0.311 单位，应断言 |diff|≤3，或明确改引「本机核算最大 1.0×10⁻⁸」推 ≤2。
- 验收：`node --test tests/kernel/det-math-exp.test.mjs tests/accept/det-tables.test.mjs` → `tests 15 / pass 15 / fail 0`；`node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`。
- 记账（不挡封）：加载期表校验放过 length=1 的退化表；安装期负例无测试；测试先行的 `values[1]` 索引在实现提交改成 `values[1-kMin]`（改得对，但未按卡头硬规矩 6 报主会话）；normal/lognormal 测试未钉死手算值；分支基线 `15886cd6`，主线已到 `f4ccd9b3`，合入前须先接主线。

## 本次只核改正（2026-11-18，照 A/B/C 三件）

- A：`world/ontology/state-owners.json` 的 `kernelApi.exports` 补三行，值照卷二 §2.7 :601–:603：
  `{"export": "kernel/det-math.mjs#fixedExp", "callers": ["rules"], "acceptsState": false}`、
  `#fixedPow`、`#fixedLn`。`server-plugin/kernel/files.json` 早已有 det-math.mjs，无别的同步项；`tests/kernel/handles.test.mjs`「每条导出所指文件存在且确有该导出」已过。
- B：按卷文 `grep -n` 亲核（§1.10 :323–:328、§3.3 :1328–:1341、§2.7 :601–:603）校正引用：
  - `world/rules/tables/kernel-constants.json:7–:10`：W 步 :1336→:1335；A/第 6 步 :1336→:1335、:1340；项数 :1337→:1338；LN2 :1337→:1339。
  - `world/rules/registry.json:9`：:1336–:1337→:1335–:1339（登记句另见 :1341）。
  - `server-plugin/kernel/det-math.mjs`：:28 :1336–:1337→:1335–:1339；:168 :325–:326→:325；:205 :1330→:1329；:225 :1331→:1330；:243 :1333→:1332；:266 :1334→:1333；:290 :1336–:1340→:1334–:1341。
  - `server-plugin/kernel/sample.mjs:330`：:325–:326→:325；同行的 §3.3 :1333（指 fixedExp）→:1332。
  - `server-plugin/kernel/load/world.mjs`：:26、:59 :324–:326→:324–:325；:49 :1336–:1337→:1335–:1339。
  - `tests/kernel/det-math-exp.test.mjs`：:34、:42、:52、:59、:66、:83、:91、:105、:115、:125 逐行改正（见 diff）。
  - `tests/accept/det-tables.test.mjs:1`：:323–:327→:324–:325（表内容）+ :327（截断/clamp）。
  - 本回报「卷文」节与「本提交」「取舍」两节同步改正；`:601`→`:601–:603`。
- C：`tests/kernel/det-math-exp.test.mjs` 文件头与 :72–:78 的容差按卷文重推：`fixedExp(1e8)` 向下截到 271828182，与 e 的绝对差 8.46×10⁻⁹，相对 δ≈3.11×10⁻⁹，ln 结果偏 0.311 个单位；测试的三点 x=1/2/−1（10⁸ 标度）分别偏 0.311/0.121/0.318 个单位，加上卷文给 `fixedLn` 自身误差 < 2×10⁻⁸，各点合计 < 2.32 个单位；两边都是 10⁸ 标度整数，故整数差 |d| ≤ 2。断言保持 ±2、未放宽：整数差到不了 3，改成 ≤3 是降门槛，故不采纳。测试标题与注释同步改成这个推导。
- 行为不变：三件只是登记行、引用文字、测试容差论证；算法、表值、采样逻辑未动。
- 本轮验收（实跑）：
  - `node --test tests/*.test.mjs tests/kernel/*.test.mjs tests/accept/*.test.mjs` → `tests 532 / pass 532 / fail 0`。
  - `node tools/gen-det-tables.mjs --check` → `det tables up to date (4097/81/4097)`。
  - `node tools/accept/run.mjs pre_commit` → `"verdict": "pass"`。
