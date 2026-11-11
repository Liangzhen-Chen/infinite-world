PERFS9：s5a 阶段性能回到门槛内（行为逐字节不变）。先读 docs/产品原则.md。

## 背景
- 工作树 F:/dnd-wt/PF9，分支 t-perfs9，基 s5a@73ac809d（刚合入 K16 家户生计：取水、觅食、值守）。
- 11-02 实测 bench-farm-pests 30×2：s5a 对 master（F:/dnd，3bbd7e0c）三对 1.426/1.403/1.149，中位 1.403；用户定的 S5 阶段门槛是对 master ≤1.35。之后城镇系列还要合入（预计再加约 5%），所以目标是 **s5a 对 master ≤1.25**。
- K16 自身已优化 8 轮（每聚落每日一次持久化计划、班次对齐作息时段、课程按输入变化重算、静态地理记忆）。不要重做这些，先量再改。
- 已有工具：F:/dnd-tools/bench-farm-pests.mjs（node … 30 2）、profile-diff.mjs（base 与分支 cpuprofile 的自身耗时差，按文件/函数）、prof-top.mjs、profile-summary.mjs。以前的 profile 在 F:/dnd/logs/sessions/PERFS8-*.cpuprofile 可参考。

## 要做
1. 用 node --cpu-prof 跑 bench，对 master 与 s5a 各取 profile，用 profile-diff 找增长最大的前 10 个函数，写明文件:行和占比。
2. 按热点逐个提速。允许：缓存按值且有明确失效输入、去掉重复计算、更好的数据结构、按需而非全量遍历。不允许：
   - 改变任何规律结果、随机数消耗顺序或记录内容；
   - 进程内跨调用缓存（破坏确定性，K16 r3 教训）；
   - 按名字/ID 特判、跳过规律、降低模拟精度或改成统计层；
   - 改测试或基准本身。
3. 每改一处都核对行为不变，再量。

## 验收
- 金快照：F:/dnd-tmp/probe 的 `node gdump.mjs <root> full <绝对路径>` 与 `quiet`，改前改后用 sdiff.mjs 对比，必须完全相同（输出路径必须绝对，脚本会 chdir）。numeric-digest 也必须相同。
- 测试：用 F:/dnd-tools/affected-tests2.mjs 生成受影响清单，全跑（超 15 分钟的列出不跑）；按子测名对照 s5a@73ac809d（F:/dnd-wt/S5A，干净，只读），不许有新增失败。
- 性能：master（F:/dnd）与 PF9 交替跑三对，取中位；报改前、改后、每处改动各自的收益。达不到 1.25 时，写明剩下的耗时在哪里（文件:行、占比）以及为什么在不改变行为的前提下降不了。
- 量性能时用 F:/dnd-tmp/perf.lock 锁（写自己的 pid，用完删；有活的持锁进程就等），避免和别的测速同时跑。

## 运行约束与文件所有权
- 所有命令加 TEMP=F:/dnd-tmp TMP=F:/dnd-tmp；文件只放 F 盘；最多 2 个 node 进程；不提交（主会话提交）；不读 secrets.json；不改 dist/。
- 只改 PF9 工作树。不改 F:/dnd、S5A、TI3、TOWN、TC、TI2、K16、PERFBASE。
- 另一张卡 I3a 正在 F:/dnd-wt/TI3 合并城镇系列，会合入 s5a 的 household-subsistence/water-cycle/npc-state/npc-schedule 等。所以你的改动要尽量局部，并在交接里列出每处改动的文件和函数，方便之后合并。
- 同一个问题失败两次就停，写明原因。

## 交接
写 F:/dnd/logs/sessions/PERFS9-final.md，≤300 字：热点表（改前）、每处改动与收益、最终三对比值、金快照与 numeric-digest 是否相同、测试对照结果、未解决的问题。不贴代码和完整日志。
