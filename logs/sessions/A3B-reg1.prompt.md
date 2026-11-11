【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：100 分钟（到 90 分钟时停手写交接）。

卡 A3-回归1（A3 合入前全量扫描的非 A3 失败）。工作区 F:/dnd-wt/A3B（分支 a3b，已同步 a3a）。项目《无限原野》Node 规则引擎。全量逐文件扫描（logs/sessions/sweep-a3a-v2t.tsv）在 a3a 上发现以下文件失败（不含超时项，超时归性能卡）：tests/a2-ui.test.mjs（1，可能是浏览器 EPERM，沙箱内如实记）、action-registry（1）、actions-catalog（1）、arch-metrics（1）、entity-groups（1）、forest-water（2）、holdings-writers（2：未包装的持有写入点、调用写入包装的模块未声明写入者——A3 各卡新增的写入点，主会话已确认在 a3a HEAD 即失败）、m1-history-preconditions（1）、m3-consistency-evidence（1）、a1b-fixes（2，B-r12 可能已修，先复跑确认）。
要求：逐文件复跑取失败用例末 30 行，按根因归并；每个根因判定是 A3 改动引入的真回归（修实现，使原断言通过）还是 A3 设计变更使旧断言过期（只有当设计文档明确规定新行为时，才把断言改为验证新真实行为，保留原意图与反例，逐处写设计依据）；holdings-writers 要求所有新写入点走包装并声明写入者，不得放宽该不变量。不删测试、不跳过。跑上述文件、tests/a3-*.test.mjs、CORE。报告 F:/dnd/logs/sessions/A3B-reg1.final.txt（逐文件：根因、判定、改动、依据）；回复 ≤150 字。
