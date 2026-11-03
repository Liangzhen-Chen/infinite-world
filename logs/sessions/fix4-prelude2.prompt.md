【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

卡 fix4-prelude（续做，A3 收口第 1 步）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3B（分支 fix4-prelude，上一任 WIP 提交 7b294398 已在树上，从这里接着做，不重做）。先读 docs/产品原则.md（尤其第三节第 2 条“不为测试造东西”）。

目标（一句话）：引擎里不再有只为测试存在的“恢复快照”接口；测试与判分器的前提一律由真实游戏动作产生（setup.prelude，实现在 tools/a3-setup/prelude.mjs，已接入 tools/a3-score.mjs）。

已完成（WIP）：law/money/civic/governance/obligation-runtime/quest-board/festival/weather/finance-bank/transport/credit 的 restore* 与快照存款分支、restore-origin.mjs 已删；transition.restoreTransition 保留（真实存档用）；prelude.mjs 已写。
剩余：
1. 确认引擎（server-plugin/）中除 restoreTransition 与存档读取（storage.mjs restoreActivity、legacy restoreToAnchors）外无 restore* 测试专用接口与其残留引用（工具 tools/arch-layers、system-map 已改，复查一遍）。
2. 修受影响测试：已知 tests/a3-owner-ding.test.mjs、tests/a3-owner2-G.test.mjs 引用被删接口；再跑 tests/a3-*.test.mjs 找出其余因删接口/旧 setup 形式而失败的。改法：测试前提改用真实动作产生（engine.previewAction + reduce，或复用 runPrelude），断言意图不变、不放宽；逐处写依据。确实无法由现有真实动作产生的前提，不新增接口，在报告里列出（测试名、缺的动作）。
3. 跑判分（只体检，不优化分数）：node tools/a3-score.mjs tests/fixtures/a3-intents-v2.json > F:/dnd/logs/sessions/fix4-prelude-score.json，报路由/签名/构造器/兜底/全通过/越界泄漏六项，与 F:/dnd/logs/sessions/a3-score-v5d.json 对比；因删接口转为“前提须由前置动作产生”的题号列出。

可改：server-plugin/（只限删除残留）、tools/a3-setup/、tools/a3-score.mjs 中 prelude 接线（不改判分口径）、受影响的 tests/*.test.mjs。锁定：tests/fixtures/a3-intents-v2.json（题集冻结）、world/、docs/。
不调用真实模型。预计规模：改 5–15 个测试文件，几百行。

验收命令（TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，输出按规则过滤）：
- node --test --test-isolation=none tests/a3-*.test.mjs（排除 a3-builder-ui，浏览器类 EPERM 列出即可）；某文件失败时到 F:/dnd-wt/A3A 跑同一文件，a3a 上也失败的标“既有失败”。
- node --test tests/overfit-guard.test.mjs
- CORE：node --test tests/engine.test.mjs tests/storage.test.mjs tests/plugin.test.mjs
- rg -n "restore[A-Z]" server-plugin（只剩上述保留项）

不再启动其他会话或子代理。最后回复不超过 10 行：改动文件、验收命令和结果（通过/失败数）、六项分数前后、偏离卡片处、未解决问题；同样内容写到 F:/dnd/logs/sessions/fix4-prelude2.final.txt。
