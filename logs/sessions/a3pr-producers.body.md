卡 a3pr-producers（A3 收口：补齐两处“有消费者没有生产者”的玩法）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3PR（分支 t-a3pr，自 a3a）。

背景：删除测试专用快照接口后发现，有些状态在引擎里会被读取和结算，却没有任何真实游戏动作能产生，玩家玩不到。本卡补两处：
1. 任务半完成的私下汇报（prelude todo #11，tests/a3-owner2-T 两条：「T3: half-complete private report is known by issuer…」「T3: mismatched issuer, forged source, false settlement…」）：承接任务的玩家可以私下向发布人汇报当前进度（如做完一半），写入任务进度与发布人一方的来源记忆，在场无关 NPC 不知情；伪造来源、错误发布人、虚报结算被拒。
2. 普通活动（如灯谜会）的公开创建（todo #12，tests/a3-owner2-T 两条：「T2: ordinary lantern event consumes its exact real prize once…」「T2: missing host ownership, illegal time window…」）：拥有场地的主办者可公开创建普通活动、把自己持有的实物奖品真实签入，奖品只发一次，到期结束；不拥有场地、时段非法、奖品已领的被拒。先看 settlement.festival_plan 等现有入口能否扩展承载，能复用就不新造动作。
做法：在 server-plugin/quest-board.mjs、festival.mjs 中补真实写入，经现有动作目录（world/actions/core.json 与 locale，若需新增动作走 tools/build-action-registry.mjs 的现有流程）对玩家开放；然后把上述 4 条 todo 改回 test，前提用真实动作产生，保留全部原断言。
可改：server-plugin/quest-board.mjs、festival.mjs；world/actions/core.json 及其 locale（仅新增或扩展这两个玩法的动作项）；tests/a3-owner2-T.test.mjs；新增 tests/a3-producers.test.mjs。锁定：engine.mjs、storage.mjs、transport、obligation-runtime、credit、interactions/effects/magic、action-router、domain-rules 及其余文件；若必须改 engine.mjs 先停下报告。
验收：node --test --test-isolation=none tests/a3-producers.test.mjs tests/a3-owner2-T.test.mjs tests/a3-tool-surface.test.mjs，以及 rg 找到的 quest-board/festival 既有测试文件。静态提示不得超过 10593（a3-tool-surface 测试会检查）。
不调用真实模型。预计规模：中。本卡名 a3pr-producers。
通用：先读 docs/产品原则.md。所有 node 命令先设 TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，测试用 --test-isolation=none，输出过滤为摘要。题集 tests/fixtures/a3-intents-v2.json 与 tools/a3-score.mjs 冻结。不为测试新增生产接口、加载器分支或世界内容；测试前提用真实动作（tools/a3-setup/prelude.mjs 的 runPrelude 或直接 previewAction+reduce）。最小完整改动，删除优先。改旧测试仅限对齐设计，保留断言意图，逐处写依据。不改 docs/。不再启动其他会话或子代理。CORE 由主会话沙箱外跑。最后回复不超过 10 行（改动文件、验收命令与结果、偏离、未解决问题），同样写到 F:/dnd/logs/sessions/<本卡名>.final.txt。
