【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：75 分钟（到 65 分钟时停手写交接）。

卡 a3k1-known（A3 收口：两条长期失败的根因与处理）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/A3K1（分支 t-a3k1，自 a3a）。先读 docs/产品原则.md（尤其三.1 验收以设计为准、不为保分写特判；三.2 不为测试造东西）。

目标（一句话）：把 a3a 上一直失败的两条测试查清根因并在根因处解决——是产品缺陷就修产品，是测试依赖的题集期望与产品原则冲突就按设计修正测试并写明依据；不允许放宽断言掩盖缺陷，也不允许为让题目通过写特判。
1. tests/a3-r13.test.mjs:32「A3 r13: ordinary requests route without accepting purchases, gifts or NPC commitments」
2. tests/a3-owner2-R.test.mjs「R2: speech subclass 137 has a native consumer without fabricated agreement」（A3V2-137，已知题集问题：guide 与 guide_request 标签，见 docs/当前状态.md“已知问题”）
背景：今天 a3a 合入了结构路由（签名完全一致即路由、并列走开放路径）、统一拒绝投影、同意不可伪造、难度派生、先查后提等改动；这两条在这些改动之前就已失败。题集 tests/fixtures/a3-intents-v2.json 与 tools/a3-score.mjs 冻结，不得修改。
步骤：先只读定位每条失败的具体断言与实际值，判断根因属于哪一类（产品缺陷 / 测试期望过期或与原则冲突 / 题集本身问题），在报告中逐条写明证据（文件:行、实际 vs 期望）。产品缺陷：最小修复并补机制测试。测试过期：按当前设计修正断言意图并逐处写依据。题集本身问题（如 137 的标签）：不改题集，测试改为验证产品的正确行为，题集问题登记到报告交出题人。
可改：上述两个测试文件；根因所在的 server-plugin 模块（最小改动，逐处列出）。锁定：题集、判分器、docs/、world/。
验收：node --test --test-isolation=none tests/a3-r13.test.mjs tests/a3-owner2-R.test.mjs，以及被改模块的相关测试；最后跑一次全部 tests/a3-*.test.mjs（排除 a3-builder-ui），失败只允许“A3 real proposal engine meets the explicit stage thresholds”（题集体检门槛，按流程如实失败）。
不调用真实模型。预计规模：小到中。
通用：TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程（机器上另有 3 路扫描在跑，注意内存），--test-isolation=none，输出过滤为摘要。不再启动其他会话或子代理。CORE 由主会话沙箱外跑。最后回复不超过 10 行（每条的根因类别与证据、改动文件、验收结果、交出题人的题集问题），同样写到 F:/dnd/logs/sessions/a3k1-known.final.txt。
