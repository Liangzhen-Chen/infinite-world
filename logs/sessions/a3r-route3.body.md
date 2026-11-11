续做 a3r-route（你的改动已合入 a3a）。新工作区 F:/dnd-wt/A3R2（分支 t-a3r2，自最新 a3a，已含 fix4-prelude 与工具用途标签）。主会话在合并后的 a3a 上跑 a3 整组，发现你的“同签名多候选且文字分不开 → 澄清”规则造成 3 处回归（这些测试不在你上轮验收清单里，是主会话验收范围定窄了）：
- tests/a3-native-state.test.mjs「A3 native: custody refuses ordinary departure…」：一句 tell 的提案（intent 'xyzzy'）以前走开放路径直接说出口，现在被澄清挡住，reduce 报 “Only matched registered actions can be submitted”。
- tests/a3-builder.test.mjs:53「真实 HTTP 开放提案…」：对自己 tell 的开放提案预览返回 null（期望 routing.status==='open'）。
- tests/a3-r8-effects.test.mjs:33 R8 练习：013/016 在 core:practice 与 core:practice.session 间并列，不再提交。
主会话的设计决定（按产品原则二.2，不能把玩家拦住）：
1. 同签名多个完整候选时，先按结构消歧：只保留必填槽能从提案填满的候选；仍有多个时，优先使用了提案显式参数的候选（例如提案给了时长 means.minutes → practice.session；没给 → practice）。
2. 再按文字消歧（保留 0.2 领先规则）。
3. 仍分不开：不路由、也不阻断——走开放路径照常结算（受“不比注册动作更划算”约束），回执附上这些候选作为“也可按某动作结算”的备选。只有提案本身缺必要信息时才澄清。
4. 另修 tests/a3-owner2-w.test.mjs：加载时报“同 ID 已有不同条目，不能覆盖”，原因是 a3w-props 给物品加了已审批的用途标签，而该文件的审批闸门要求整行不变；参照 tests/a3-world-approval.test.mjs 里 a3w 已采用的做法（先验 a3w-props 回执，再按历史标签核对旧回执），保留原篡改断言。
验收：node --test --test-isolation=none tests/a3-*.test.mjs（排除 a3-builder-ui）——失败只允许三个既有项（阶段门槛、r13 路由、R2 137），todo 仍为 75；报 pass/fail/todo。再跑体检 node tools/a3-score.mjs tests/fixtures/a3-intents-v2.json > F:/dnd/logs/sessions/a3r-route3-score.json，报路由/签名与 a3-score-v5d 及 fix4-prelude-score 对比。
可改：server-plugin/action-router.mjs（以及开放路径接收候选所需的最小接点，若在 open-actions.mjs 请逐处列出）、tests/a3-routing*.test.mjs、tests/a3-structural-routing.test.mjs、tests/a3-owner2-w.test.mjs。锁定其余文件（engine、storage、transport、obligation-runtime、quest-board、festival、domain-rules 等有其他卡在改）。
通用：TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，--test-isolation=none，输出过滤为摘要。不扩同义词表。不再启动其他会话或子代理。最后回复不超过 10 行，同样写到 F:/dnd/logs/sessions/a3r-route3.final.txt。
