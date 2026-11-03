# 卡 W5：数值纪律（平台超越函数 → 引擎确定性近似；世界时钟浮点锚点 → 整数；按领域定精度）

工作树 F:/dnd-wt/S5W5（分支 t-s5w5，基于 s5a 7863a6a0）。你可以在本分支上自己提交（`sh F:/dnd-tools/guard-commit.sh F:/dnd-wt/S5W5 "<msg>" <路径...>`，它先跑 overfit-guard）；不要 merge、不要切分支、不要动其他工作树，不要用 git stash。另一位执行者在 F:/dnd-wt/S5F2 改 engine.mjs 住宿段、business.mjs、credit.mjs、contracts.mjs 的合同计价单位——这些文件若必须动，只做最小改动并在汇报里列出行号。

## 背景
- 开发指南 docs/无限原野_开发指南v3.md D.1 表 W5 行：7 处平台超越函数改引擎确定性近似；world-clock 浮点锚点改整数；按领域定精度；**本阶段唯一一次金快照重生成**（由主会话做）；判据：逐项旧→新表主会话审；Windows 两个 Node 版本结果一致。
- 指南 E.1 第 6 条：持久化只存整数或有理数；超越函数用引擎确定性近似；精度按领域；已签条款冻结。
- 架构 docs/架构设计/14-确定性与时序.md 第 71 行附近（数值确定性、禁止调用平台数学库、舍入规则）；修订记录.md 第 786 行（精度按领域，不一刀切四位定点）。
- 已有精确分数工具：server-plugin/obligation-calendar.mjs 的 fraction/decimalFraction（S5-F 的 tender.mjs、currency.mjs 已在用），优先复用，不另造一套有理数。

## 先读
F:/dnd/docs/产品原则.md（北极星）；上面列的指南与架构段落。只汇报与本卡相关的部分。

## 要做
1. **摸底（写进汇报，≤150 字）**：在 server-plugin/ 与 extension/ 里 grep 平台超越/非确定数学调用（Math.exp/log/log2/log10/pow 非整数指数/sqrt/cbrt/sin/cos/tan/atan/atan2/hypot 等），列出每处文件:行、用途、所属领域。指南说 7 处，以实际为准；Math.floor/ceil/round/trunc/min/max/abs 不算。
2. **确定性近似模块**：新建（或在现有合适模块里）引擎自己的近似实现（只用整数/BigInt 或现有 fraction 运算，不调用平台数学库），每个函数写明误差界和适用定义域。逐处替换第 1 步列出的调用。
3. **按领域定精度**：写一张小表（放在该模块顶部注释或 docs/架构设计 相关段落旁的代码注释里即可，不新建文档）：货币/账目 = 整数最小单位；比价/兑换率 = 有理数；物理/天文（日出日落、坐标）= 指定定点位数；概率/随机 = 现有 RX 口径。每个替换点按其领域取精度。
4. **world-clock 浮点锚点 → 整数**：tests/world-clock.test.mjs 第 51 行附近有地点浮点锚点（如 loc_bs_liquan 的弧度值）。把世界时钟的浮点锚点改成整数（或定点整数）表示，派生出的时刻、日出日落等仍按原语义计算。世界数据里若存了浮点，改 world/ 源数据（不手改 dist/）。
5. **持久化检查**：确认存档、回执、事件里不再写出浮点（除非某字段属纯显示且不入存档）。写一个只读的检查（可加进现有 invariants 类测试），对一次推进后的存档做"无非整数 number"扫描，允许清单要逐条写理由。
6. **跨 Node 版本一致**：写一个脚本 tools/numeric-digest.mjs：跑固定种子的若干推进场景（可复用 tests/advance-registry 的场景或 F:/dnd-tools/golden-diff 的 dump），输出最终状态的摘要哈希与每个替换函数在一组固定输入上的输出。本机目前只有 Node v24.13.1；你只在本机跑一次并记下结果，第二个版本由主会话安排。
7. **测试**：给近似模块写单元测试（固定输入 → 手算/高精度参考值，断言误差界）；受牵连的旧测试逐处写依据再改（数值变化必须能用"旧值→新值，因近似误差 x"解释），不得删测试、不得放宽断言。
8. **金快照**：tests/advance-registry.test.mjs 的金快照预期会变，**不要重生成**。用 `node F:/dnd-tools/golden-diff/golden-dump.mjs`（参数看脚本头注释）分别在 7863a6a0 与你的分支上 dump，再用 golden-diff.mjs 对比，把变化字段按"字段｜旧→新｜原因（哪个替换点）"列成表，写进 F:/dnd/logs/sessions/s5w5-golden-table.md，汇报只给行数与是否都有原因。

## 跑
新测试；所有你改到的模块对应的测试；tests/world-clock.test.mjs；tests/overfit-guard.test.mjs；`tests/invariants*.test.mjs`；advance-registry（预期失败，只记失败字段）。命令一律 `TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node --test --test-reporter=tap <文件>`，只看 `# pass`/`# fail`/`not ok` 行。

## 进程规则
只结束你自己启动并记下 PID 的进程，禁止按名称或批量杀 node；同时最多 2 个 node 测试进程。临时文件放 F:/dnd-tmp，用完删掉（只删你自己建的）。

## 汇报（≤300 字）
改了哪些文件；摸底清单（处数与领域）；近似函数与误差界；命令与 pass/fail 数；金快照表行数、是否每行都有原因；numeric-digest 本机结果；偏离本卡的地方；未解决的问题。不要贴完整代码或完整日志。
