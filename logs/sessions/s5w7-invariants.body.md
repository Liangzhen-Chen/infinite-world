# 卡 W7：不变量第一批 + 账本漂移上报（S5 收口）

工作树 F:/dnd-wt/S5W7（分支 t-s5w7，基于 s5a 3b78d25d）。你可以在本分支上自己 git commit；不要 merge、不要切分支、不要动其他工作树。

## 先读
- F:/dnd/docs/产品原则.md（北极星）。
- F:/dnd/docs/架构设计/02-不变量.md 中 I1、I2、I15、I16 的定义与检验方式（以原文为准）。
- F:/dnd/docs/无限原野_开发指南v3.md 的 C 节与 E.1 第 3、4 条；docs/架构设计/修订记录.md 末节 G0 第 3、4 条。
- 现有 tests/invariants/i31-total-order.test.mjs（照它的组织方式）；tests/helpers/ledger-audit.mjs。

## 要做
1. **四组不变量性质测试**：tests/invariants/i01-*.test.mjs、i02-*、i15-*、i16-*（文件名后缀按不变量名）。用 fast-check（已是依赖），种子固定、事件数写在测试里。世界前提用真实游戏动作或现有 setup.prelude / applyIntentSetup 产生，不为测试加产品接口或造内容。每组既要有"随机合法动作序列后不变量成立"，也要有至少一个"人为破坏应被抓住"的反例（证明测试不是空转），反例只在测试内构造文档，不改产品代码。
2. **漂移上报（账本双写退出第一期）**：刻末审计（server-plugin/advance-registry.mjs:310–311 附近的 auditLedger 调用）要报出漂移：ledger.mjs:180–190 余额不足时的 `src:drift` 补足、money.mjs:141–145 与 stock.mjs:115–120 漏传 books 的 `unbooked`、holdings.mjs:91 / holding-sources.mjs:200 吞掉的 HoldingRejected。三类（加持有一类）都要被统计并可查询。**本期只上报，不拒绝**（拒绝在 S6 入口做），所以不改变游戏行为。
3. **F011：对账 helper 失败即失败**：tests/helpers/ledger-audit.mjs:63–78 现在只在设了 LEDGER_AUDIT_LOG 时记录。改为：调用它的测试里出现漂移即断言失败。合法的、设计内的例外（若有）必须逐条列出依据，不能整体放行。
4. 把四组不变量加入 CORE 的运行清单（看 package.json / tools 里 CORE 是怎么定义的，照现有方式加入；如果 CORE 定义在门禁工具里而不在仓库里，就不改工具，只在汇报中说明应加入哪些文件）。

## 预期会暴露问题
加了"失败即失败"之后，部分现有测试可能因漂移而失败——那是真问题，不是本卡造成的。处理方式：**不放宽、不跳过**；对每个失败文件记录漂移来源（哪个模块、哪类漂移），写进汇报的清单；本卡只修因测试 helper 本身改动引起的误报。真实漂移的修复另派卡。

## 交卡前必跑（逐文件单独进程，TEMP=F:/dnd-tmp，同时最多 2 个 node 进程，输出只看摘要）
- 四组新不变量；CORE：tests/engine、tests/storage、tests/plugin；
- 先 `node tools/export-actions.mjs`，再 tests/actions-catalog、tests/action-registry、tests/advance-registry、tests/arch-metrics；不得设 UPDATE_ADVANCE_GOLDEN；
- 所有引用 tests/helpers/ledger-audit.mjs 的测试文件（grep 出来逐个跑），记录 pass/fail；tests/overfit-guard。
- 命令示例：`TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node --test --test-reporter=tap tests/<文件> 2>&1 | grep -E "^# (pass|fail)|^not ok" | head -20`。不要读完整测试输出。单个文件若超过 20 分钟，停掉你自己启动的那个进程，记为"超时未完成"。

## 硬约束
不删/跳过测试、不放宽断言；不读 secrets.json；不部署；不改 docs/架构设计/、world/design/、dist/、docs/待办.md、docs/问题.md；只结束你自己启动的进程，禁止按名称批量杀 node；临时文件结束前删。

## 汇报（≤300 字）
提交号；改了哪些文件；运行的命令和结果；因漂移失败的测试清单（文件 → 漂移来源模块与类别）；偏离本卡的地方；未解决的问题。
