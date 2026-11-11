【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

【交卡前必跑（10-26 起）】交卡前逐文件跑完以下检查并在汇报中写结果；不过的先修，不要留给门禁：
- CORE：tests/engine、tests/storage、tests/plugin；
- 同步四件套：先 `node tools/export-actions.mjs` 重导，再跑 tests/actions-catalog、tests/action-registry、tests/advance-registry、tests/arch-metrics。**不得重生成 advance-registry 金快照**（不得设 UPDATE_ADVANCE_GOLDEN）；若它因本卡有意改动而不一致，在汇报中逐项列出"字段：旧→新、原因"，由主会话审核后统一重生成。
- 本卡新增或修改的测试，以及本卡直接改到的模块的同名测试；
- 自查改动路径：不得触及禁区（docs/架构设计/、已审 W1 骨架 world/design/、dist/、docs/待办.md、docs/问题.md）。确有必要改的，停下写进汇报。
限时：120 分钟（到 110 分钟时停手写交接）。

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
