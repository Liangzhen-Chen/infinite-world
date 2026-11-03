卡 a3sm-summons（A3 收口：召唤维持费与赎回回执的真实生产者）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3SM（分支 t-a3sm，自 a3a）。先读 docs/产品原则.md（一.4 钱物守恒、因果有来源；三.2 不为测试造东西）。

背景：删除测试专用快照接口后，下列用例因“前提无真实生产动作”标为 todo（保留了全部断言）：
- #6 tests/a3-owner-ding.test.mjs「O: upkeep survives save and its real dismissal consumer closes it without charging or resummoning」「O: natural summon expiry ends the same restored upkeep and never charges a new opening fee」——真实 summons.create 建立了效果和旧契约，但没有生成与召唤效果链接的规范维持债权（upkeepObligation）；dismiss/expiry 只有消费者。
- #7 tests/a3-r8-effects.test.mjs「R8: native summon dismissal reports its actual contract termination and disappearance」「R8: native redemption includes the closed pledge, while repair keeps its declared fee separate」——需要真实的维持债权解离回执，以及真实 pledged holding（当铺质押）赎回时的关闭回执。
目标（一句话）：玩家真实召唤时，按现有召唤规则建立与该召唤效果链接的维持义务（不重复收开办费）；解散或自然到期时关闭这份义务并在回执里如实报告；当铺赎回时回执包含被关闭的质押持有。
做法：先 rg 查召唤规则里维持费/契约的现有数据与设计（docs/架构设计/ 中召唤、义务章节），按依据实现；没有依据的数值不编造，报告缺口。然后把上述 4 条 todo 改回 test，前提用真实动作（runPrelude 或 previewAction+reduce），保留全部原断言。
可改：server-plugin/ 中召唤相关模块（rg summons）、magic.mjs、obligation-runtime.mjs、credit.mjs（仅赎回回执）；上述两个测试文件；新增 tests/a3-summons-upkeep.test.mjs。锁定：action-affordances、action-router、items、environment、agriculture、extension/、world/（另一张卡在改）及 engine.mjs、storage.mjs；若必须改锁定文件，先停下报告最小接点。
验收：node --test --test-isolation=none tests/a3-summons-upkeep.test.mjs tests/a3-owner-ding.test.mjs tests/a3-r8-effects.test.mjs，以及 rg 找到的 summon/upkeep/pawn/redeem 相关测试文件、tests/a3-legacy-replay.test.mjs；最后跑一次全部 tests/a3-*.test.mjs（排除 a3-builder-ui），失败只允许三个既有项（阶段门槛、r13、R2 137）。
新测试须覆盖：召唤后有且仅有一份与该召唤链接的维持义务；解散/到期关闭且不再扣费、不重新召唤；存档往返与重放一致；赎回回执列出被关闭的质押；钱物守恒。
不调用真实模型。预计规模：中。
通用：TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，--test-isolation=none，输出过滤为摘要。题集与判分器冻结。不为测试新增生产接口或世界内容。最小完整改动，删除优先。改旧测试仅限对齐设计，保留断言意图，逐处写依据。不改 docs/。不再启动其他会话或子代理。CORE 由主会话沙箱外跑。最后回复不超过 10 行（改动文件、验收命令与结果、偏离、未解决问题），同样写到 F:/dnd/logs/sessions/a3sm-summons.final.txt。
