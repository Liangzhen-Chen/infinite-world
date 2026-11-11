# 卡 W6a：慢档六项归因与修复（S5 收口；不做安静模式测量）

工作树 F:/dnd-wt/S5W6（分支 t-s5w6，基于 s5a 最新）。你可以在本分支上自己 git commit；不要 merge、不要切分支、不要动其他工作树。另有两位执行者在 F:/dnd-wt/S5W4（market/finance-assets/ledger）与 F:/dnd-wt/S5W2B（business/npc 自治/香火）工作，避免改那些文件；确需要改，停下汇报。

## 背景
慢档扫描里有 6 个文件在 master（a27acae4）上本来就坏，s5a 上也坏：
- FAIL：tests/a3-acceptance.test.mjs、tests/playtest-lifecycle.test.mjs
- TIMEOUT（单文件超过 45 分钟）：tests/agriculture.test.mjs、tests/farm-pests-clock.test.mjs、tests/farm-pests-hunt.test.mjs、tests/wildlife.test.mjs
阶段收口要求慢档一次全绿（或逐项归因到登记的后续阶段）。

## 先读
F:/dnd/docs/产品原则.md；F:/dnd/docs/无限原野_开发指南v3.md 的 C.5、C.8、C.9、E.1；docs/架构设计/修订记录.md 末节 G0（第 13 条性能先测分解再定修法）。

## 要做
1. **两个 FAIL**：逐个跑，找出失败用例与根因。属于产品缺陷就修实现；属于测试前提过时（例如依赖已删除的旧接口）就按设计改前提、保留断言意图并逐处写依据；不得删测试、不得放宽断言。
2. **四个 TIMEOUT**：先测分解耗时——用 `node --cpu-prof`（输出到 F:/dnd-tmp）或在测试里按用例计时，找出每个文件最慢的用例和热点函数（列前 5）。再按热点修：优先去掉"每次推进全表扫描"、重复深拷贝、可用现有索引（storage.mjs recordsWhere、PatchCursor）替代的遍历。不改世界规则、不降推进精度、不删推进项；测试本身的推进时长不改短（那是"为测试改条件"）。目标：每个文件单进程在机器有其他负载时 ≤20 分钟完成并通过。
3. 若某项确实要等后续阶段（例如 S7 的到期堆）才能根治，写清证据（热点、为什么现阶段改不了），并给出本阶段能做到的最好结果。

## 验收
- 6 个文件逐个单进程跑：通过；各自耗时（改前 / 改后）。
- 热点报告：每个慢文件前 5 热点与改法。
- CORE + tests/invariants/ 全部 + 同步四件套（先 export-actions）通过；不得设 UPDATE_ADVANCE_GOLDEN，金快照若因有意改动不一致，列"字段：旧→新、原因"（性能优化不应改变状态，出现差异要当作 bug 查）。
- tests/scale.test.mjs 月推进不慢于改前；tests/overfit-guard 通过。

## 运行规则
所有 node 命令加 TEMP=F:/dnd-tmp TMP=F:/dnd-tmp；测试逐文件单独进程；同时最多 2 个 node 进程；输出只看摘要（`node --test --test-reporter=tap tests/<文件> 2>&1 | grep -E "^# (pass|fail)|^not ok" | head -20`）；不读完整输出；单文件超过 50 分钟停掉你自己启动的那个进程，记"超时"。profile 文件放 F:/dnd-tmp，结束前删除。

## 硬约束
不删/跳过测试、不放宽断言、不缩短测试推进时长；不读 secrets.json；不部署；不改 docs/（actions.json 导出除外）、docs/架构设计/、world/design/、dist/；只结束你自己启动的进程，禁止按名称批量杀 node；临时文件结束前删。

## 汇报（≤300 字）
提交号；每个文件：根因、改法、耗时改前→改后、结果；仍未解决的项与证据。
