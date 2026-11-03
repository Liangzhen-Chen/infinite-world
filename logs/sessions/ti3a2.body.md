TOWNINC 卡 I3a2：清城镇整合分支上 s5a 没有的失败。先读 docs/产品原则.md。

## 背景
- 工作树 F:/dnd-wt/TI3，分支 t-ti3@e2e62705。
  - I3a 已完成四次合并：t-ti2、t-tc、s5a/K16、s5a/PERFS9。
  - 一批修复已由主会话提交，即 e2e62705。
- 对照树：
  - s5a 干净树 F:/dnd-wt/S5A@6f3bddcb，只读；
  - t-town 干净树 F:/dnd-wt/PERFBASE@1d9cf7ee，只读。
- I3a 的日志在 F:/dnd-tmp/ti3-logs、ti3b-logs、pb-logs，_summary.txt 是每个文件的通过/失败数，可以直接复用，不必重跑已知结论。
- 另一张卡 PERFT1 在 F:/dnd-wt/PFT 做性能，只做行为不变的提速。

## 要做（逐项找根因，写文件:行）
原则：
- 每项先判断是“新规律带来的正确变化”，还是“规律或代码错了”。
  - 前者：重算锚点，并在测试注释里写算式和来源规律。
  - 后者：修代码。
- 不删断言、不放宽、不为测试造设施或接口；测试前提用真实游戏动作产生。

1. tests/entity-life.test.mjs（工作区有未提交改动，主会话退回）。
   - 现在的改法把精确断言放宽成了 `>=`，这不行。
   - 统计居民入籍时带走一份家户开局钱物。请在入籍前从统计组那一行读出这个人的份额，用规律代码里现成的分配函数，不要在测试里另写一份算法。
   - 然后断言入籍后的钱物恰好等于“继承 + 份额”。
2. tests/village-ledgers.test.mjs：第二个村的店主柜台账户少 360 文，查清去向。钱不能凭空消失：要么记在某条流水里，测试漏算了；要么是代码漏记账，那就修代码。
3. tests/weather.test.mjs（19561≠19581）、tests/world-clock.test.mjs、tests/seasonal-hazards.test.mjs：数值锚点。查清是哪条城镇规律多消耗了随机数或改变了状态，再按上面的原则处理。
4. tests/s5-04b.test.mjs（2≠2414，只在 TI3 败）、tests/s5-08-w3a-settlement.test.mjs（3 项）、tests/notables-promotion.test.mjs（clay_cup 补货两边都是 0）：查根因。
5. tests/advance-registry.test.mjs：
   - 金快照的 2 项不重生成，只归类到 TFA、TFB、I2、C 中的哪条规律；
   - 1443 那个边界要查根因。
6. tests/m1-repair-learning-preconditions.test.mjs：卡 C 让 linsui 10:00 去 ayan 那里采买，和玩家 605–615 学艺的窗口撞车。方向如下：
   - 世界是真实的，师傅在接待真客人，这是正当的。
   - 先查引擎在“玩家求学时师傅正忙”这种情况下怎么处理。
     - 处理得合理（等候、排队或说明理由），就让测试走真实流程：等到师傅空下来再学，或者断言忙时的真实结果，同时保留剧本原意，即学艺的前提条件被正确检查。
     - 处理不合理（重复占用、错扣时间等），那是规律错误，修规律。
   - 不许按 linsui 或 ayan 特判，也不许为避开采买而改世界内容。
   - 如果剧本的 elapsed 锚点因此变化，按真实流程重算并写算式。
7. tests/m3-language.test.mjs 重跑。tests/w2-s2（退出码 127）和 tests/wildlife-encounters（退出码 134）查原因，并对照 s5a。
8. 超 15 分钟的长测：agriculture、event-size、farm-pests-clock、farm-pests-hunt、ledger-price、record-index-check、seasonal-migration、wildlife、monster-society-content。
   - 等前 7 项做完，在后台逐个跑，最多 2 个 node 进程。
   - s5a 上同名文件的结果在 F:/dnd/logs/gate/jobs/full-s5a-6f3b-full-87802e99539f/results/ 里，有了就直接对照，没有就列出。
9. 最后用 tools/affected-tests2.mjs 生成相对 s5a 的整合受影响清单，整批重跑一次，超 15 分钟的除外。按子测名对照 s5a：不许有 s5a 没有的失败。
   - tests/s5-playthrough.test.mjs 在 s5a 也败，只列出。

## 运行约束与文件所有权
- 所有命令加 TEMP=F:/dnd-tmp TMP=F:/dnd-tmp；文件只放 F 盘；最多 2 个 node 进程；不读 secrets.json；不改 dist/；世界内容只在 world/；不提交，由主会话审后提交。
- 不得改的工作树：S5A、PERFBASE、PFT、TOWN、TC、TI2。
- 可改 TI3 内的测试和 server-plugin 规律代码。动规律代码时尽量局部，在交接里列出文件和函数，因为 PERFT1 在同一批文件上做提速。
- 同一个问题失败两次就停，写明原因。
- 生成文件（docs/actions.json 等）只用工具重导。

## 交接
写 F:/dnd/logs/sessions/TI3A2-final.md，≤300 字，内容包括：
- 每项结论（根因 文件:行，怎么处理的）；
- 整批对照结果；
- 长测结果；
- 未解决的问题。

不贴代码和完整日志。
