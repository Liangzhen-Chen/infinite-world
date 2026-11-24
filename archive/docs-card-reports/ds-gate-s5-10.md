| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 卷五 S5-10 :408（几何＋cells.*＋tripPlan 例外）；卷五 §3.3 :362（cells.* 写者 grid-diff.mjs，只经 alterCells）；卷十七 R17-1.7 :373、C17-15 ⑤ |
| 2 | 没有按 id/名字/场景写特例 | 是 | 入口文件闭集＝kernel 组，由 state-owners.json 组登记派生（同 vol2.K5-24 口径），不点名文件；callees 是封闭函数表 Math.hypot/Math.atan2/Math.sqrt＋det-math fixedSqrtInt/atan；tripPlan 例外不开白名单（若需欧氏估价须经入口） |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | 本卡是计数为 0 的静态扫描（call_edge），无"不限/0/空"限额字段；callees 只认函数调用点，不存在可被特殊值跳过的口子 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 绕法夹具自造前提（geometry_bypass-01/02/03 必报、-11 经 straightM 必不报、-12 tripPlan 求路必不报），断言命中码 E-VIEW-BYPASS；真实仓库 0 命中（pre_commit openHits geometry_bypass:0） |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 未动任何业务代码；只改门禁登记与绕法夹具，无假常量 |
| 6 | 只改了卡文列出的文件；diff 共 __ 行 | 是 | 只改 tools/accept/{scanclasses,cases}.json、tests/accept/bypass/{cross_write-04,geometry_bypass-04}.txt 与本回报；diff 共 52 行（+51 -1，git diff --cached --stat 5 files changed） |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs：ℹ tests 1288 / ℹ pass 1288 / ℹ fail 0 |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | G2 几何门禁补全 det-math 定点几何（fixedSqrtInt/atan），规则层自算距离/方位一提交即被拦；未走捷径、未写死、未缩规模 |

## 修改轮（Sonnet 只核打回后，11-21）

### 三处各改了哪

1. **(a) cells.* 写者半条**：不登记、不另立 path_access 写条目，改实说＋记欠账。items.json source 里"cells.* 写者由 state-owners 声明 grid-diff.mjs 与 cross_write vol1.V-3 守，不另立条目"改为实话：cells.* 写者登记（grid-diff.mjs，只经 alterCells，卷五 §3.3 :362）尚未落（gridKey 类代码未落，G6/G7 前，G1-Opus只核-1121）；直接 state.cells 写由 cross_write vol1.V-3 的 E-VIEW-BYPASS 兜底，writePath(P.cells)/alterCells 半截待 cells 写者登记落地（随 gridKey 落地那张卡）由 vol1.V-3 守。对照表 #45 半截栏、docs/问题.md G1 记账节记欠账。
2. **(b) 几何原语半条**：scanclasses.json geometry_bypass callees 加 `"./kernel/det-math.mjs": {"fixedSqrtInt": [], "atan": []}`（模块说明符取规则层 import 路径 `./kernel/det-math.mjs`，按 call_edge 的 `{模块: {调用链: []}}` 格式）；criteria.json criterion 与 items.json source 写明 fixedSqrtInt、atan 一并查；items.json source 补：入口闭集按 kernel 组近似的收紧时点（straightM、bearingView、losView、zoneAt 登进 kernelApi 后改按 kernelApi 逐名派生，G3 落 zoneAt 时）、tripPlan 例外不是豁免（若需欧氏估价须经入口、不开白名单）、词法局限（x*x+y*y 比较、**0.5、const {sqrt}=Math 解构查不到）。
3. **geometry_bypass-12 空壳**：改成真实形态的 Dijkstra 按耗时度量在格上求路（`dist`/`prev` Map、`stepCost` 逐步累加，无 Math.*/定点几何原语），判必不报；新增 geometry_bypass-03（import fixedSqrtInt/atan 自算两点直线距离/方位角），判必报 E-VIEW-BYPASS。det-math.mjs 自身与 kernel 组内调用不算违例（范围不含 kernel 组）。

### (a) 选哪种与依据

选**不登记、改实说＋记欠账**（卡文二选一里第二种的落法）：
- 第一种（照卷五 :362 把 cells.* → grid-diff.mjs 登记进 state-owners.json）不可行：`cells.*.*.*` 的 keyKinds 须用 gridKey，而 gridKey 类代码未落（G1-Opus只核-1121 明写"gridKey 类代码未落（master 也只有卷文，归 G6/G7 前）"），加载器 mergeStateOwners 的 KEY_NONENTITY 未含 gridKey，登记即 E-PATH-KEYKINDS 拒收；把 gridKey 加进加载器是 G6/G7 前的活，不在本修改轮。
- 卡文第二种"在 S5-10 条目里用 path_access 直接守"也不立：cross_write vol1.V-3 已是 path_access 写方式，直接 state.cells 写本就被它的 E-VIEW-BYPASS 兜底（不依赖 cells 登记），再立一条 cells-only 写条目与 vol1.V-3 重复，且 path_access 写方式没有按路径收窄的参数。故取实话＋欠账，把 cells 写者登记留给 gridKey 落地那张卡，由 vol1.V-3 接 alterCells 半截。

### 两条验收末行

- `node tools/accept/run.mjs pre_commit`：`"verdict": "pass"`；`"failed"` 仅 vol12.A12-4.5、vol12.S12-2、vol12.S12-3（基线既有，不计）；`"openHits"` 中 `"geometry_bypass": 0`；geometry_bypass-01/02/03/11/12 全 pass。
- `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：`ℹ tests 1288`、`ℹ pass 1288`、`ℹ fail 0`。

### diff 行数

git diff --cached --stat：9 files changed, 63 insertions(+), 24 deletions(-)。

## 末处两补（11-21）

### 改了哪

1. **cross_write-04**（补 cells 写用例）：新增 tests/accept/bypass/cross_write-04.txt——非 grid-diff.mjs 的规则模块直接写 `state.cells[w][chunk][key] = val`，vol1.V-3 报 E-VIEW-BYPASS（path_access.mjs:246 对 state 链赋值一律报，key 只决定分量名，不依赖 cells 是否登记）；cases.json 照 cross_write-02 先例登记（group rules、must_fail、expectCode E-VIEW-BYPASS、addedAtRev 16）。
2. **选"补说明符"（非解析路径匹配）**：读 call_edge.mjs:212-222 的 bindings 只按说明符字面比对（`Object.hasOwn(table, imp.spec)`），callees 表不做 resolveRel/posix.join 解析（只有 segmentLocals/rootBindings 对 gatefac 路径做解析，与本表无关），故不支持按解析后模块路径匹配。改法：scanclasses.json geometry_bypass callees 增 `"../kernel/det-math.mjs": {"fixedSqrtInt": [], "atan": []}`，与 `"./kernel/det-math.mjs"` 同表项，一处登记覆盖 gate/textcore/output-gate 等子目录相对写法。新增 tests/accept/bypass/geometry_bypass-04.txt（import '../kernel/det-math.mjs' 用 fixedSqrtInt/atan 自算距离/方位角，group rules、must_fail、expectCode E-VIEW-BYPASS、addedAtRev 1）。

### 两条验收末行

- `node tools/accept/run.mjs pre_commit`：`"verdict": "pass"`；failed 仅 vol12.A12-4.5、vol12.S12-2、vol12.S12-3（基线既有，不计）；cross_write-04 与 geometry_bypass-04 均 pass，openHits geometry_bypass:0，vol5.S5-10 不在 failed。
- `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：`ℹ tests 1288`、`ℹ pass 1288`、`ℹ fail 0`（exit 0）。

### diff 行数

git diff --cached --stat：5 files changed，51 insertions(+)，1 deletion(-)。
