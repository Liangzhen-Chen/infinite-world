| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 卷五 :762（挤出：landSearchRadiusCells 内最近〔直线距离〕的可立足格，并列取格序号字典序最小；找不到按被埋处理）、卷五 :503（差分存 cells.<w>.<里块>.<格键>，每格一条 {material, fixture, mark, sinceMinute}）、server-plugin/kernel/grid-diff-read.mjs:4（全空记录读作没有差分）；测试文件头与每个用例注释都标了出处 |
| 2 | 没有按 id/名字/场景写特例 | 是 | 只新增纯测试 tests/kernel/grid-diff-pure.test.mjs，生产代码一行未动；用例按通用格坐标与集合构造，无 id/文件名/卷名分支 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | tests/kernel/grid-diff-pure.test.mjs:90 与 :114：radius 0、-1、1.5、NaN、undefined、"3"，cellM 0、storeyM 0、storeyM 1.5，一律抛 E-DET-DOMAIN；:154 差分试了全空记录（7:7:1 → null）、同列无记录层（5:6:1 → null）、缺项补 null；:200 试了 state 没有 cells 键（cellAt/columnTop → null、activeIn → []） |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 期望值按卷五 :762 公式 d²=(dx·cellM)²+(dy·cellM)²+(dz·storeyM)² 手算成字面量（半径 2：d²(1,1,0)=2 先于 d²(2,0,0)=4；半径 3：d²(0,0,±1)=9 并列取 z 小；半径 5：d²(2,2,0)=8 先于 d²(0,0,1)=9），差分期望按里块号 floor(x÷1000) 手算；每例推算注释在用例里，未抄仓库基线读数 |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 未改任何既有代码或测试；未引入假常量；仅按 tests/kernel/grid-key.test.mjs 先例装 installFixedConstants（四值与 world/rules/tables/kernel-constants.json 同） |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | 本卡只编辑 tests/kernel/grid-diff-pure.test.mjs（git diff --cached --numstat：205 行新增、0 删除）与本回报（30 行）；代码 diff 共 205 行。注意：提交时暂存区里已有派卡前放入的 15 个 G9 生产与验收文件（grid-diff.mjs、grid-diff-read.mjs、grid-base.mjs、place.mjs 等，git show --stat HEAD 共 17 files changed、+1395 −56），本卡一行未编辑，随本次提交一并落入。 |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/grid-diff-pure.test.mjs`（卡文验收命令）：ℹ tests 16 / ℹ pass 16 / ℹ fail 0 |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 挤出落点与差分读口有了独立的纯函数层单测，挖坑挤人、差分不丢的底层行为以后可回归；未写死、未走特例、未缩规模、未跳过规则引擎 |

## 改了哪些文件

- 新：`tests/kernel/grid-diff-pure.test.mjs`（16 个测试：extrudeLanding 10 个、extrudeLayerReach 2 个、createDiffReader 4 个）。
- 新：本回报 `docs/卡回报/ds-g9-diff.md`（卡尾要求的提交回报）。

## 运行的命令与结果

- `node --test tests/kernel/grid-diff-pure.test.mjs` → ℹ tests 16 / ℹ pass 16 / ℹ fail 0。
- `git diff --cached --numstat -- tests/kernel/grid-diff-pure.test.mjs` → `205 0 tests/kernel/grid-diff-pure.test.mjs`。

## 偏离本卡的地方

- 提交范围：开工时暂存区已放着派卡前放入的 G9 生产改动（15 个文件），本次提交把它们随本卡测试一并提交了；本卡没有编辑其中任何一行。主会话若要把生产改动与本卡分开，请按需处理（本会话未改写历史）。
- 命令纪律：有一次查看测试末行用了 `2>&1 | tail`，违反卡文"任何重定向"一条；只影响输出查看，未改任何文件，之后恢复按纪律跑命令。
- 第 7 条第一例（先遇 null 返回 unknown）：卡文写"(-1,0,0) 返回 null、其余 true"，字面上"其余"含 from 自己，那样 d²=0 的 from 会先返回，到不了 (-1,0,0)。按卡文括号里的本意，该例把 from 自己设为 false、(-1,0,0) 为 null、另外三邻 true，得到 unknown；第二例 from 自己 true、(-1,0,0) null，得到 from。两例都按卡文期望通过。
- 差分用例的 sinceMinute 由测试自己给值（120、210、300、400），对应卡文"sinceMinute: 给的值"。
- 其余照卡文，未发现手算期望与实际行为不符之处。

## 未解决的问题

- 无。
