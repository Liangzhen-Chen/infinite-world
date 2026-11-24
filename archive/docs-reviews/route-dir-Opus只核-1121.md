# 只核：寻路方向与超限结果代码小卡（分支 ds/route-dir）

核者：Claude Opus 5.5 中档（内核寻路，只核不改代码）。写者：Claude Sonnet 5.5 中档。
对象：`git diff origin/master...HEAD`（代码 b125f07ff、文档 fc781b57f），写者回报 docs/卡回报/route-dir.md。
依据：卷五《地点地形与资源场》§4.1 规则 5（:470 地点到地点、:471 位置到位置，封卷后勘误 1121k12）、A5-1.2、§8 Q24；docs/问题.md "G4 遗留"两条（李白 11-21 15:29 已裁）；CLAUDE.md、docs/派活卡头规矩.md 一至三节。
本机复跑（纯函数与加载器，不推进世界）：`node --test tests/kernel/route-edges.test.mjs tests/kernel/route-grid.test.mjs tests/kernel/place.test.mjs tests/kernel/error-codes.test.mjs tests/kernel/place-footprint.test.mjs` → tests 109 / pass 109 / fail 0。全量与 pre_commit 未复跑，引写者回报（1417/1417；pre_commit 失败三项 vol12.A12-4.5、S12-2、S12-3 是基线原有，不计）。

## ① 方向：按实际出发方向求，撤掉小端倒写

- 过：server-plugin/kernel/place.mjs:595 `shortestPath(edges, from, to, …)` 直接从出发端求，删了旧的 `[s, t] = from < to ? …` 和倒写；route-edges.mjs:216–236 `regionRoute` 删了 `forward` 与倒写，缓存键改成有向两端（:217），正反两次各存各的，不会互相顶用。
- 过：`shortestPath` 的并列比较（place.mjs:526–532 `lessLabel`）比的是从 s 起的前缀序列，前缀比较在延长后保序，按标签定点的最短路算法拿到的就是"从出发端写起的字典序最小"，算法上成立。
- **写者请核点 1，判定：取法对；卷文那句是勘误留下的残句，归下批勘误，不是代码要改。** 理由：
  1. 规则 4 规定路网边按存储方向栅格化、只存一次（route-edges.mjs:154–160 按 from/to/waterway 缓存一份），边长两个方向一样。所以 `routeView` 正反两次的路程一定相同，路径能不同只有一个来源：并列取法。要是并列仍"从两端点中 id 字典序小的一端写起"，正反两次的结果必然互为逆序，同一句里"正反两次调用返回的路径……允许不同"就落空了。
  2. 想不倒写又"从小端写起比"，在算法上做不到：从出发端搜索时，比的是从另一端写起的序列，这种比较在延长后不保序，没法逐点定标签；能做到的只有从小端求再倒写，正是勘误删掉的做法。
  3. 所以卷五 :470 勘误后的本意只能是"从出发端写起比"。写者的取法是这本意的唯一可实现读法，没有另立并列破法；字面上确实改了"小端"二字的效果，所以必须跟一条勘误把字面改对。
  - 建议下批勘误改卷五 :470 一句：把"仍相同，从两端点中 id 字典序小的一端写起，取途经地点 id 序列字典序最小的"改为"仍相同，从调用的出发端写起，取途经地点 id 序列字典序最小的"。同一处另补一句：`routeView` 的边长与方向无关，所以正反路程相同，只有并列时路径可以不同。这样"路程允许不同"不会被误读成边长按方向算。

## ② 超限：明确结果、记码、调用方区分

- 过：pathView 超限返回 `{overCap: true, steps: null, distanceM: null}`（place.mjs:628–630），真没路仍返回 null（route-edges.mjs:232 只有 `r.capped` 时才存 overCap）；经 report 记 E-GRID-PATH-OVER-CAP，字段只放数值 cap 与 expanded（place.mjs:608–611），合卷五 :471"告警级，不改状态"。
- 过：调用方清单。我 grep 了 server-plugin、tools、tests 里的 pathView、routeView、pathBetween、regionRoute：内核以外没有调用方（另有三个卷文检查脚本只出现名字字符串），和写者回报 :34–38 一致。
- **写者请核点 2，判定：合卷五 :471 与李白裁定，过。** 理由：
  1. 路网最短路只在能算出长度的边上求（place.mjs:537）。超限的边长度不知道，它可能就在更短的那条路上，这时给出的路未必最短，违反"最短路"。李白裁定要的是能区分"真没路"和"算不过来"，所以整体按超限处理是唯一不说谎的读法。
  2. 判断只在搜索真碰到超限边时触发，不会"全图有一条超限边就整体报超限"。`shortestPath` 是在一个点定下标签之后才惰性读它的边（place.mjs:553–556），终点定下之后的点不会去读；终点之前定下的点距离都不大于终点，它们连出的长度未知的边确实可能更短，必须算作超限。两端都已定下的边会在先定下的那端被读到，不会漏。
  3. 跨格空间时只要有一段超限，整体就按超限（route-edges.mjs:259–260、:269），口径与上面相同，过。
  - 建议（不阻塞）：以后要减少误报超限，可以拿该边两端接入格的直线距离当路程下界，下界已经超过当前最短的就不必判超限。这是新设计，不在本卡做，可随 Q24 分层寻路一起定。
- **必须改 M1：pathView 的路网区格集会悄悄漏掉超限的路网边，返回的路可能不是代价最小，而且不报超限。** 位置：route-edges.mjs:199–200 `roadsOf` 里 `const r = rasterEdge(e); if (!r.ok) continue;`。路网边栅格化超过 longCostCap 时（`capped`），这条路的区格直接不进道路格集，`freeModel` 就把这些格当荒野计价（不取 roadPaceFactor）。于是 pathView 在缺了这条路的代价图上求最小，返回的是一条看起来成功的路，既没有 overCap，也不记 E-GRID-PATH-OVER-CAP。这违反卷五 :471"返回的必须是这张图上的代价最小路径"，也违反李白裁定"超限不许静默"。它和写者在 routeView 里的处理（判定②，碰到超限边就整体超限）口径不一致，而本卡的任务正是把超限从静默改成明确。改法（最小、落在原语层）：`roadsOf` 遇到 `capped` 的边时，在该格空间分片上记"道路格集不完整"，并留下展开数；`regionRoute`/`pathBetween` 在这个格空间求路时返回 `{overCap: true, expanded}`，由 pathView 照常记码。体积端等算不出（no-footprint、unreachable）的边仍按现状跳过，那是已挂账的未知（问题.md G8 那条），不在本条。补一条测试：上限足够区格寻路、不够栅格化某条路网边（或直接造一条长到会超限的路网边），断言 pathView 返回 overCap 并记一条码。注：这个漏洞 G4 就有，不是本卡引入；但本卡明令把超限改成明确结果，这里是同一类的超限出口，所以计入本卡。主会话如果判定它超出本卡范围，至少要在 docs/问题.md 挂账写明，不能不提就合入。

## ③ 测试

- 过：route-edges.test.mjs:324–343 方向不对称夹具，我逐项手算：3×2 全是 river（系数 4），m1(1,1)、m2(1,0) 是道路格（0.8），步价只看落脚格。正向 S(0,0)→T(2,1)：经 m1 = 141.4213×0.8 + 100×4 = 513.1370，经 m2 = 100×0.8 + 141.4213×4 = 645.6852，S→m2→m1→T = 560。反向对称，经 m2 是 513.1370。两向路程都是 241.4213。照旧代码"从小端求再倒写"，反向会得 (2,1),(1,1),(0,0)，用例断言 (2,1),(1,0),(0,0)，能分辨新旧做法；期望是字面量，不依赖仓库读数。
- 过：超限用例真造了超限（longCostCap 调到 3），expanded = 4 与 route-grid.mjs:143 `done.size > cap` 时返回相符；真没路（框外、无门跨格空间）断言仍为 null 且不记码（route-edges.test.mjs 超限用例），routeView 超限用例断言 path null、overCap true、边路程未知、真不连通 overCap false，没有放宽。旧用例原来只断言 `null`，现在改断言明确超限结果，比原来严。
- 过：改动的旧断言都是新行为必然的结果。route-edges.test.mjs 与 place.test.mjs 的"并列二"反向用例从"P 倒写"改为 Q，按 ① 的取法这是必然结果，我手核了 "bb" < "e"。两条直路用例（跨格空间、沿路）只改了注释或标题，仍断言逆序。这两处是唯一最小代价路径，逆序成立，不是放宽。
- 建议：tests/kernel/route-grid.test.mjs 新增的 3×1 用例只有一条路，只核了代价不对称、不核选路，作用有限，但无害、是纯函数，可以留。tests/kernel/place.test.mjs:209 标题"从代号小的一端写起比地点序列"和 tests/kernel/route-edges.test.mjs:129 标题"去程回程路程相同、互为逆序"读起来还像旧规矩（这两例的出发端恰是小端、恰是唯一路径，所以仍然成立）。建议顺手把标题改成"从出发端写起""唯一路径时回程为逆序"。不改断言。

## ④ error-codes 与卡外文件

- 过：server-plugin/kernel/error-codes.mjs:42 登 E-GRID-PATH-OVER-CAP，照 E-GRID-* 先例；tests/kernel/error-codes.test.mjs:27–29 条数 602→603、E 584→585，是手数的字面量，新码必然要改。
- 过：tools/accept/criteria.json 12 类判据各追加一条修订、rev+1、指纹更新，修订原因写明"判据本身未改"，与 G3 先例同一写法逐类对得上；检测器 import 闭包含 error-codes.mjs，这些改动是必需的。
- 过：6 个卡外文件都必要或无害：error-codes.mjs（卡文明令登码）、error-codes.test.mjs（条数）、criteria.json（指纹）、docs/问题.md（标代码已落）、docs/卡回报/route-dir.md（回报），以及 route-grid.test.mjs（见③建议，可留）。
- 建议：卷二错误码表与卷二十七 :697 的卷文跟改，写者按卡文留到另批勘误，同意。同批再补卷五 :470 地点到地点一段的超限句。现在那段只写"不连通时 path 为空"，routeView 的 overCap 读法只有李白裁定和代码注释（place.mjs:569），卷文要写明。

## 总判

**改后再核。** 只有一条必须改：M1，pathView 的道路格集悄悄漏掉超限的路网边（route-edges.mjs:199–200），改成明确超限并补用例。两个请核点：点 1 取法对，卷五 :470"小端写起"一句归下批勘误改成"出发端写起"；点 2 碰到超限边就整体超限，合卷五与李白裁定。其余过；建议项不阻塞。M1 改完至少再核一次才能封卡。
