# 卡 S5-A：提交与回执的完成语义（S5 收口第一批）

工作树 F:/dnd-wt/S5CA（分支 t-s5ca，基于 s5a 3b78d25d）。你可以在本分支上自己 git commit；不要 merge、不要切分支、不要动其他工作树。

## 先读
- F:/dnd/docs/产品原则.md（北极星）。
- F:/dnd/docs/无限原野_开发指南v3.md 的 C 节（工作方法）与 E.1 第 2 条（完成四问）。
- F:/dnd/docs/架构设计/修订记录.md 末节"2026-10-27 主会话 G0"第 2 条。

## 要修的三条审计问题（已交叉核实）
1. **F081（P1）重试重复成交**：extension/runtime.js:264–294 的 act() 把服务端执行、读回、聊天保存、界面刷新包在一个 catch 里；提交成功后保存/刷新失败也返回 ok:false，界面（extension/actions-view.mjs:58–62、150–161）提示"没能…"，玩家再点一次时 runtime.js:279 生成新的 `ui_${randomUUID()}`，同一笔交易成交两次。对照同文件 217–243 模型工具路径已有 committed/uncertain 语义。
   修法：区分"提交前被拒绝"和"已提交、后续展示/保存失败"。后者保留已发生的回执，标为已提交并要求对账；界面的"重试"复用原请求 id 并取回原回执，不产生新的经济事件。
2. **F052（P2）分段等待重试回执不完整**：server-plugin/index.mjs:180–202。重试只按 eventId#1 取第一段 result、segments 取重新计算的计划段数、丢掉 interrupted；首次路径 202 才累计。
   修法：重试返回与首次完全相同的完整回执（全部已完成段的合计、实际段数、中断原因、对应版本的 reference）；部分完成如实显示。
3. **F073（P1）推进前旧快照写现金**：server-plugin/professions.mjs:62、89–91、122–124 与 finance-assets.mjs:221–228、264–276、302–309。入口取考前 player 快照，推进 120/180 分钟（期间可能结算租金）后，用旧 player.coins 写现金，与账本不一致，legacy-primitives.mjs:168–177 对账拒绝整次合法认证/升职。
   修法：按推进后的当前余额扣费（或开始时明确扣取/托管）；**保留**回执的账本核对，不得删除或放宽对账来掩盖。同根的 F037、F040 一并检查：凡"推进前取快照、推进后按快照写"的同类写法都改。

## 回执四问
所有被改的路径，回执都要能回答：是否已提交、结果是什么、是否待决、是否不确定。不新增第二套回执格式，沿用现有回执字段扩展。

## 验收（全部写成测试，前提用真实游戏动作产生，不为测试加接口）
- 交易成功、随后聊天保存失败（用现有可注入的宿主失败点；若没有，只在测试里替换宿主的保存函数，不改产品代码接口）：界面显示已成交；再点"重试"不再扣钱、不再给货，取回原回执。
- 两段动作第二段失败：回执仍显示第一段已发生。
- 长等待 43200+100 分钟：首次与重试回执的分钟、总耗时、段数、中断信息完全相同。
- 认证/升职期间有真实租金结算：账本与现金一致，提交成功；对账代码不变。
- 既有测试一律不删、不放宽断言；需要对齐设计的改动逐处写依据。

## 交卡前必跑（逐文件单独进程，TEMP=F:/dnd-tmp，同时最多 2 个 node 进程，输出只看摘要）
- CORE：tests/engine、tests/storage、tests/plugin；
- 先 `node tools/export-actions.mjs`，再 tests/actions-catalog、tests/action-registry、tests/advance-registry、tests/arch-metrics；不得设 UPDATE_ADVANCE_GOLDEN，金快照若变化，列"字段：旧→新、原因"；
- 本卡新增/修改的测试；改到的模块的同名测试（professions、finance-assets、a1b-fixes、runtime/actions-view 相关）；tests/overfit-guard。
- 命令示例：`TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node --test --test-reporter=tap tests/<文件> 2>&1 | grep -E "^# (pass|fail)|^not ok" | head -20`。不要读完整测试输出。
- 浏览器测试（tests/runtime*.test.mjs 等需要起浏览器的）可以跑，但若环境起不来，列出即可。

## 硬约束
不删/跳过测试、不放宽断言；不读 secrets.json；不部署；不改 docs/架构设计/、world/design/、dist/、docs/待办.md、docs/问题.md；只结束你自己启动的进程，禁止按名称批量杀 node；临时文件结束前删。改动若发现要大面积改数据形状或重写主路径，停下汇报，不要继续扩大。

## 汇报（≤300 字）
提交号；改了哪些文件；运行的命令和结果（pass/fail 数）；偏离本卡的地方；未解决的问题；金快照是否变化。
