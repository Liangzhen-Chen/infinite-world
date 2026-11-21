# 回报：寻路方向与超限结果代码小卡（分支 ds/route-dir）

照：卷五《地点地形与资源场》§4.1 规则 5（:470 路程两种读法、:471 位置到位置，封卷后勘误 1121k12）、A5-1.2、§8 Q24；docs/问题.md "G4 遗留"两条【李白 11-21 15:29 已裁】。
写：Claude Sonnet 5.5 中档，自己写（改动小，未委派 DeepSeek）；未经只核。代码提交 b125f07ff。

## 自查表
| # | 问题 | 是/否 | 证据（文件:行 或 命令+输出末行） |
|---|---|---|---|
| 1 | 卷文原句已逐条摘出，出处到"卷:行" | 是 | 卷五 :470"按调用的实际出发方向求最小路程路径，不把反方向的结果倒过来写；正反两次调用返回的路径与路程允许不同"；:471"按调用的实际出发方向求代价最小路径……花费、耗时允许按方向不同……展开数超过上限……不返回空、不当作无路，而是返回明确的超限结果……经内核报告出口记一条 E-GRID-PATH-OVER-CAP（告警级，不改状态）……两位置间真没有路仍返回空" |
| 2 | 没有按 id/名字/场景写特例 | 是 | 方向与超限处理都在 route-edges.mjs regionRoute/pathBetween 与 place.mjs routeView/pathView 的通用路径；无按 id 分支 |
| 3 | 每个限额/校验都试过特殊值（不限/0/空），无法绕过 | 是 | longCostCap 不改（规则表 100 万）；测试把它调到 3 看超限；cap 非整数时 ready 为 false 全部按未知（原有路径）；门边（路程 0、不栅格化）不会超限，edgeOverCap 对门边直接 false；跨格空间经门任一段超限整体按超限，不当没有门 |
| 4 | 新测试不依赖仓库当前偶然数字 | 是 | 夹具全在测试里造；期望值手算写在用例注释（见下） |
| 5 | 没有为降计数改写允许的代码、没有假常量 | 是 | 首次 pre_commit 的 text_judge 命中 route-edges.mjs 里 `r.reason === 'capped'` 字面比较，改为在失败结果里带布尔 `capped`、用 `Boolean(r.capped)`，不是换名常量 |
| 6 | 只改了卡文列出的文件；diff 共 220 增 65 删（代码提交 b125f07ff，8 个文件）；另改 docs/问题.md 2 行、本回报 | 是（含下列必要扩展，已说明） | 卡文外的必要接点：server-plugin/kernel/error-codes.mjs（登新码，卡文明令登记）、tests/kernel/error-codes.test.mjs（码表条数 602→603、E 584→585）、tests/kernel/route-grid.test.mjs（纯函数方向代价用例）、tools/accept/criteria.json（检测器 import 闭包含 error-codes.mjs，指纹变，12 类 rev+1 带修订记录；经仓库登记器 register.mjs 写，临时助手 F:/dnd-tmp/rdir-bump-criteria.mjs，同 G3 先例） |
| 7 | 全量测试已跑：命令＋pass/fail 数 | 是 | `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：ℹ tests 1417 / pass 1417 / fail 0；`node tools/accept/run.mjs pre_commit`："verdict": "pass"，items 失败三项仍是基线 vol12 A12-4.5、S12-2、S12-3，vol5.S5-10 不在失败项 |
| 8 | 这张卡让块 6 哪一步更近了（一句话），且没有为此违背北极星任何一条 | 是 | 路径与花费按实际出发方向算、长途超限不再静默变"无路"，玩家寻路读到的是真实结果或明确的"算不过来"；不写死、不特判，修在规则层 |

## 改了什么
- server-plugin/kernel/route-edges.mjs：`regionRoute` 撤掉"按区格序号小端求再倒写"，缓存键改有向两端；失败结果带 `{overCap: true, expanded}` 与 null（没路）区分；`pathBetween` 同格空间直传、跨格空间经门任一段超限则整体超限；新增 `edgeOverCap(e)`；`rasterOnce` 失败结果带布尔 `capped`。
- server-plugin/kernel/place.mjs：`routeView` 直接从 `from` 求最短路（`shortestPath` 的并列比较本来就从出发端写起），不再从 id 小端求再倒写；搜索碰到超限边则返回 `{edge, path: null, overCap: true}`（不当无路、也不给一条可能不是最小的路），否则 `overCap: false`；`pathView` 超限返回 `{overCap: true, steps: null, distanceM: null}`；两处经 `report('E-GRID-PATH-OVER-CAP', {cap, expanded})` 记一条。
- server-plugin/kernel/error-codes.mjs：登 E-GRID-PATH-OVER-CAP（卷二 §4.3 登记行，照 E-GRID-* 先例）。

## 测试（手算期望，写在用例注释）
- route-edges.test.mjs：「path 并列取法从实际出发端起比」改为正向 a,b,e,d、反向 d,bb,c,a（"bb"<"e"，Q 胜），反向不是正向倒写；「pathView 方向不同、代价最小路径可不同」（3×2 全 river、m1–m2 成路、S(0,0)→T(2,1)：正向经 m1 = 1131370+4000000 = 5131370 对 560 万、645.6852 万，反向经 m2；两向路程都是 241.4213）；「pathView 展开上限」断言超限结果 `{overCap: true, steps: null, distanceM: null}`、日志 `{cap: 3, expanded: 4}`、真没路（框外、无门跨格空间）仍 null 且不记日志、上限够用能找到；「routeView 展开上限」断言 path null 且 overCap true、边路程未知、日志同上，真不连通 overCap false。
- route-grid.test.mjs：「步价只看落脚格，正反代价允许不同」3×1 系数 [1,2,5]：0→2 = 7000000、2→0 = 3000000。
- place.test.mjs：`shortestPath` 取法例加反向 d→a 得 d,bb,c,a。

## 调用方处理清单（grep 找全：pathView、routeView、pathBetween、regionRoute 的全部使用处）
- 仓库里 pathView 除 place.mjs 本身与测试外没有别的调用方；routeView 同（边境指数等读路程者尚未建，建时按下述形状读）。
- routeView：`path` 为 null 时看 `overCap`：true = 算不过来（记日志、读路程仍未知），false = 路网真不连通；离场子树 `overCap` 为 false。
- pathView：null = 真没有路或位置算不出；`overCap: true` = 超限（`steps`、`distanceM` 为 null，读路程得未知）；调用方必须先判 `overCap` 再读 `distanceM`。
- 路网边栅格化超限（`rasterEdge` 的 `capped`）：`lengthOf` 仍返回 null（该边路程未知，沿用），routeView 经 `edgeOverCap` 区分，不把超限当无路。

## 偏离与请核
1. 卷五 :470 勘误后的并列句仍留"从两端点中 id 字典序小的一端写起"字样，与同段"按调用的实际出发方向求、不倒写"在字面上有张力。本卡取"并列时途经地点序列从实际出发端起比"（卡文"不再借小端"），请核卷文是否要改写那一句（另批勘误）。
2. routeView 搜索中只要碰到一条超限的边就整体按超限（`path` 为 null），不返回可能不是最小的路径；若要"有路就给路"需另定。
3. 卷二错误码表与卷二十七 :697 的卷文跟改按卡文留另批勘误；error-codes.mjs 已先登。

## 委派
未委派 DeepSeek（改动小而集中，委派成本高于自写）。

## 修改轮（Opus 只核 docs/审查/route-dir-Opus只核-1121.md，必须改 M1）
- route-edges.mjs：`roadsOf` 遇超限的路网边记 `over`（该边展开数）、不再静默跳过；`regionRoute` 在查缓存前先取路网区格集，`over` 非空即整体返回 `{overCap: true, expanded}`（pathView 随之报超限并记 E-GRID-PATH-OVER-CAP，口径同 routeView）。
- route-edges.test.mjs 新增用例：cap=3，相邻两格 (0,1)→(1,1) 自身只展开 2 节点，但路网边 a–b 七步栅格化在第 4 个节点超限；断言 pathView 返回超限结果、日志 `{cap: 3, expanded: 4}`，上限够用时同一对位置返回 100 m。
- docs/问题.md 记一笔：卷五 :470"从两端点中 id 小的一端写起"下批勘误改"出发端写起"。
- 全量 `node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs`：tests 1418 / pass 1418 / fail 0（合并 master 前）。合并情况见提交说明。
