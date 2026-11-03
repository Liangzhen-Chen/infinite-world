# 卡 p1b-deferred：待办/跳过用例按基线授权（P1 续）

接上一会话的 P1（tools/gate/verdict.mjs、card-gate.mjs）。工作区 F:/dnd-wt/GATEQ（分支 t-gateq，最新提交已含主会话对 runner.mjs 的修复）。

## 背景
runner.mjs 刚改：
- skip/todo 用例不再算断言失败，即便 todo 的函数体执行失败也不算（Node 本身就不算）。
- 文件结果新增 `deferred: [{id, path, kind:'skip'|'todo'}]`。
- 未授权时，带 deferred 的文件终态仍是 INCOMPLETE，reason 为 'unauthorised skip/todo'。

实测：s5a 上 tests/a3-owner-ding（19 个 todo）、tests/daily-b2-exact2（2 个）、tests/a1-daily-probes（15 个）都是项目里早已登记、推迟到后续阶段的 todo。用例名里带 〔…归 S5〕 之类的标注。现在门禁会把它们判 INCOMPLETE，所有受影响的卡都会被卡住。真正要防的是：某张卡把原本能跑的测试改成 skip/todo（等于删测试），或者新增 skip/todo。

## 要做
1. verdict.judge：候选文件若只是因为 deferred 而 INCOMPLETE（没有失败、事件流完整、计数一致），就拿它的 deferred 集合和基线同一文件的 deferred 集合比对：
   - 候选 ⊆ 基线：该文件判 PASS，category 记"既有待办"，报告里列出数量。
   - 有多出来的：判 BLOCKED，逐个列出新增的 skip/todo 用例 id，需主会话决定。
   - 基线没有该文件，或基线不完整：判 BLOCKED，不能证明是既有待办。
   - 基线里原本存在、候选里消失的 todo，不算问题。todo 变成了真测试是好事，报告里列出即可。
2. card-gate.mjs：对候选中"只因 deferred 而 INCOMPLETE"的文件，提交一次基线 job，同样固定 baseSHA。这次只需一次，因为比对的是用例名单，不是偶发失败。需要复跑两次的，仍只针对失败文件。两类基线可以合并在同一个 job 里提交。
3. verdict.test.mjs 补测试：
   - 候选 ⊆ 基线 → PASS；
   - 新增 todo → BLOCKED，并列出 id；
   - 测试改成 skip → BLOCKED；
   - 基线缺文件 → BLOCKED；
   - todo 变真测试 → PASS 并列出；
   - 同一文件既有真失败又有 deferred → 按失败规则判，deferred 另行比对。

## 约束
只改 tools/gate/verdict.mjs、tools/gate/card-gate.mjs、tools/gate/test/verdict.test.mjs。只跑纯逻辑测试 `node --test --test-isolation=none tools/gate/test/verdict.test.mjs`，宿主端到端由主会话做。不放宽断言。

## 汇报（≤200 字，F:/dnd/logs/sessions/p1b-deferred.final.md）
改法、测试结果、偏离。
