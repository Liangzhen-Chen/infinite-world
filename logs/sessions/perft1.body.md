PERFT1：城镇系列合入后的性能回到阶段门槛内（行为逐字节不变）。先读 docs/产品原则.md。

## 背景
- 工作树 F:/dnd-wt/PFT，分支 t-perft1，基 t-ti3@e2e62705：城镇系列整合，含 TFA 人口需求、TFB 产销实运、I2 就业收入、卡 C 家常加工，以及 s5a 的 K16 和 PERFS9。
- 本阶段门槛是对 master（F:/dnd，3bbd7e0c）≤1.35，按 bench-farm-pests 30×2 三对取中位。
  - s5a@6f3bddcb 对 master 是 1.178。
  - I3a 实测 TI3 对 s5a 三对为 1.21、1.40、1.36，中位 1.356，折算对 master 约 1.60，严重超标。
- 之后还有 I3b 接真实需求、消耗品两张卡要合入，所以目标是 **PFT 对 master ≤1.25**。
- 城镇系列新增或大改的代码集中在：
  - server-plugin/business.mjs（serveStatistical、purchaseStatisticalInputs、shelfStock/shelfBasket）；
  - food-supply、town-income、labor-market、finance-assets、town-work、household-crafts、household-food、household-budget、market.mjs（foodSatiety）、transport.mjs、npc-autonomy。
- PERFS9 的做法可以参考，它已经合入：按值缓存且有明确失效输入、静态索引、每分钟路线前沿。
- 工具：
  - F:/dnd-tools/bench-farm-pests.mjs（node … 30 2）；
  - profile-diff.mjs，比较 base 与分支 cpuprofile 的自身耗时差，按文件/函数；
  - prof-top.mjs、profile-summary.mjs。

## 要做
1. 用 node --cpu-prof 跑 bench，取 s5a 与 PFT 各一份 profile。s5a 用干净的 F:/dnd-wt/S5A，只读。用 profile-diff 找出增长最大的前 10 个函数，写明文件:行和占比。
2. 按热点逐个提速。
   - 允许：按值缓存且失效输入明确、去掉重复计算、更好的数据结构、按需而非全量遍历。
   - 不允许：
     - 改变任何规律结果、随机数消耗顺序或记录内容；
     - 进程内跨调用缓存，这会破坏确定性；
     - 按名字或 ID 特判、跳过规律、降低模拟精度或改成统计层；
     - 改测试或基准本身。
3. 每改一处都核对行为不变，再量。

## 验收
- 金快照：用 F:/dnd-tmp/probe 的 `node gdump.mjs <root> full <绝对路径>` 与 `quiet`，改前（e2e62705）改后用 sdiff.mjs 对比，必须完全相同。输出路径必须是绝对路径，因为脚本会 chdir。numeric-digest 也必须相同。
- 测试：用 F:/dnd-tools/affected-tests2.mjs 生成你改动的受影响清单，全跑，超 15 分钟的列出不跑。按子测名对照 t-ti3@e2e62705，不许有新增失败。对照用的 TI3 工作树正被另一张卡改，所以不要在 TI3 跑。用 `git stash` 或临时 detached 工作树 F:/dnd-wt/PFT-BASE 取基准，用完删掉：先删两个 junction，再 `git worktree remove`。
- 性能：master（F:/dnd）与 PFT 交替跑三对，取中位。报改前、改后和每处改动各自的收益。达不到 1.25 时，写明剩下的耗时在哪里（文件:行、占比），以及为什么不改行为就降不下来。
- 量性能时用 F:/dnd-tmp/perf.lock 锁：写入自己的 pid，用完删掉；有活的持锁进程就等。机器上还有全量扫描在跑，比值波动大时多跑一对，并如实报每对的数。

## 运行约束与文件所有权
- 所有命令加 TEMP=F:/dnd-tmp TMP=F:/dnd-tmp；文件只放 F 盘；最多 2 个 node 进程；不提交，由主会话提交；不读 secrets.json；不改 dist/。
- 只改 PFT 工作树。不改 F:/dnd、S5A、TI3、TOWN、TC、TI2、PERFBASE。
- 另一张卡 I3a2 正在 F:/dnd-wt/TI3 修测试失败，可能会动 server-plugin 里的规律代码。你的改动要尽量局部，并在交接里列出每处改动的文件和函数，方便合并。
- 同一个问题失败两次就停，写明原因。

## 交接
写 F:/dnd/logs/sessions/PERFT1-final.md，≤300 字，内容包括：
- 改前热点表；
- 每处改动与收益；
- 最终三对比值，对 master；
- 金快照与 numeric-digest 是否相同；
- 测试对照结果；
- 未解决的问题。

不贴代码和完整日志。
