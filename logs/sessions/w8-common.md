# W8 并行卡共同规则（A/B/C/D 四张卡都适用）

- 基于 s5a f04eb933。四张卡同时进行，各在自己的工作树与分支：A=F:/dnd-wt/W8A（t-w8a-price）、B=F:/dnd-wt/W8B（t-w8b-credit）、C=F:/dnd-wt/W8C（t-w8c-carry）、D=F:/dnd-wt/W8D（t-w8d-service）。**只改本卡"可改文件"列出的文件**（加上你新建的文件与对应测试）；若必须改别的卡的文件，不要改，写进汇报（文件:行与原因）。
- 提交：`sh F:/dnd-tools/guard-commit.sh <你的工作树> "<msg>" <路径...>`（先跑 overfit-guard）。不要 merge、不要切分支、不要动其他工作树、不要 git stash。
- 北极星 F:/dnd/docs/产品原则.md 先读：派生优先（数值从世界状态与规则表派生，不手填）、真实不粉饰、难度来自世界本身。已签合同条款冻结、历史成本不重写（指南 E.1 第 6–8 条）。
- 测试：前提用真实游戏动作产生（setup.prelude / 真实工具调用），不为测试造接口、人物、地点或内容；每条新用例带手算锚点注释；不得删测试、不得放宽断言；受牵连旧测试逐处写依据再改。node:test 的 todo 若被本卡兑现，转成正式用例。
- **金快照**（tests/advance-registry.test.mjs）：若预期变化，**不要重生成**。在 s5a 原点与你的分支分别 `node F:/dnd-tools/golden-diff/golden-dump.mjs <out.json>`（工作树根目录运行），再 `node F:/dnd-tools/golden-diff/golden-diff.mjs <old> <new>`，把变化字段按"字段｜旧→新｜原因"写进 F:/dnd/logs/sessions/<卡名>-golden-table.md，汇报只给行数与是否每行都有原因。
- 数值：持久化只存整数或有理数，超越函数用 server-plugin/det-math.mjs；`node tools/numeric-digest.mjs` 若变化须能逐项解释。
- 静态提示：若改 extension/tools.mjs（只有卡 C 可改），用 tools/build-card.mjs 的 loadPromptBundle estimatedTokens 核对 ≤10587。
- 新模块须在 tools/arch-layers.mjs 归层（这个文件四张卡都可能要加一行：只追加 put 行，不改已有行），且 tests/arch-metrics.test.mjs 不得新增违例；新模块也加进 tools/system-map.mjs 对应系统（同样只追加）。
- 必跑：你改到模块对应的测试；tests/overfit-guard.test.mjs；tests/arch-metrics.test.mjs；`tests/invariants*.test.mjs` 与 tests/invariants/；tests/advance-registry.test.mjs（预期失败就只记字段）；tests/numeric-persistence.test.mjs。命令一律 `TEMP=F:/dnd-tmp TMP=F:/dnd-tmp node --test --test-reporter=tap <文件>`，只看 `# pass`/`# fail`/`not ok` 行。
- 性能：结束前跑 `sh F:/dnd-tools/perf-gate.sh <你的工作树>`，记下结果（机器上四张卡同时跑，数值仅供参考，主会话合并后会在安静时复测）。
- 进程：只结束你自己启动并记下 PID 的进程，禁止按名称或批量杀 node；同时最多 2 个 node 进程。临时文件放 F:/dnd-tmp，用完删掉（只删你自己建的）。被权限拦下的动作不要绕，写进汇报。
- 汇报（≤300 字）：改了哪些文件；每项做法一句；命令与 pass/fail 数；金快照是否变化（表行数、是否都有原因）；perf-gate 数；偏离本卡的地方；未解决的问题。不要贴完整代码或完整日志。
