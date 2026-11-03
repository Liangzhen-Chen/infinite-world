# 卡 W8-E5：S5 可玩版本的无 AI 通关脚本（三条流程串成一局）

先读：
- F:/dnd/logs/sessions/w8e-common.md（共同规则）；
- F:/dnd/docs/产品原则.md；
- F:/dnd/logs/sessions/s5w8-survey.md 第 5 节；
- 阶段流程要求：每阶段结束出可玩版本，包括无 AI 自动通关脚本和一页说明。

工作树 F:/dnd-wt/W8E5，分支 t-w8e5-playthrough（基于 s5a 83124f10）。

## 背景
- 无 AI 框架：tests/helpers/ui-script.mjs，uiSession 走菜单加 execute，不调模型。
- 三条流程现在都只有分散单测，没有串成一局：
  - 交易：a1-daily-probes、s5ca-commit-semantics；
  - 播种采收：a3-domain-properties 的 farm.private_sow/harvest；
  - 存单支取：s5-03-w1、a1-daily-probes D27。

## 要做
1. 新增 tests/s5-playthrough.test.mjs。从 createCharacter 开局，只走玩家菜单/工具动作（uiSession），不手写状态，不调模型，连续打一局：
   - **交易**：在市集用钱买货、卖货（看到买卖价差），找店主议价成交；
   - **种地**：取得自家私田（按引擎现有的真实途径，如租田；没有途径就写进汇报，不要造），播种，推进时间到成熟，收割入囊。
     - 收成量要在负重内：安全负重 = 10 + 2×力量 公斤。
     - W8-E1 正在改收割，背不动的部分会留在田里，你的场景不要依赖这一点。
   - **钱庄**：把卖粮所得存进钱庄拿到具名存单，隔几天部分支取，利息按规则。
2. 每一步断言：
   - 回执成功；
   - 钱、物、账本守恒（沿用现有 conserved/assertBalanced 一类帮手）；
   - 关键数字用手算锚点：价格、收成、利息各至少一个字面量，注释写计算步骤。
3. 结尾做存档读回：重放后状态与原状态完全一致（确定性）。
4. 写一页说明 docs/可玩版本-S5.md：
   - 怎么启动；
   - 三条流程怎么玩（玩家视角的几步操作）；
   - 已知限制（如实写，不粉饰）。
5. 若某一步现有引擎走不通（缺动作、缺途径、结果不合理），不要绕过，也不要为测试加接口。
   - 在测试里该步写 test.todo，注明缺什么、归哪个阶段；
   - 写进汇报。

## 可改文件
新测试 tests/s5-playthrough.test.mjs、docs/可玩版本-S5.md、tests/helpers/ 下仅限追加通用帮手（不改已有帮手行为）。不改 server-plugin/。

## 测试
- 新测试逐文件跑通。
- 另跑 tests/engine、storage、plugin、overfit-guard、arch-metrics。
