【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

卡 last2（a3a 收口：最后两个相对 master 的回归）。工作区 F:/dnd-wt/A3L2（分支 t-a3l2，自最新 a3a）。先读 docs/产品原则.md。
1. tests/bosses.test.mjs「首领对实际交锋记忆加强防备，换战术有效，拒绝操作不写记忆」：master 通过；在 a3a 20caa4bb（本会话开始前）及之后都失败（某断言 actual 60 / expected 10）。属于前几天 A3 工作留下的回归。用 git log/git show 在 master..a3a 定位引入它的改动，判断是产品缺陷（修产品）还是测试期望过期（按设计更新并写依据）。不放宽断言。
2. tests/s3-run001.test.mjs「S3 run-001 E12: reasonable >= 80%」报 “E12: original scenario failed to execute”；master 与 20caa4bb 通过。fix-misc2 已改 tests/probes/s3-offscreen.mjs，让私田场景先用真实购买/学习/锻造取得 soil_work 与 harvest 工具（因 a3p-domain 起私田播种须有具备 soil_work 用途的工具，此规则保留），s3-offscreen-life 已通过，但 E12 仍失败。找到 E12 实际失败的那一步（报错原文），在场景前提里用真实动作补齐（不改规则、不改世界数据、不为场景加物品），保留原断言；另注意该文件现跑 17 分钟，若因前提链过长，查明是否有更短的真实前提（例如直接购买已有现货的镰刀），不要牺牲真实性换速度。
可改：上述两个测试文件、tests/probes/s3-offscreen.mjs、根因所在的 server-plugin 模块（若为产品缺陷，逐处列出）。锁定：tests/metrics/*.baseline.json、tools/arch-layers.mjs、以及 arch-deps 卡正在改的模块（action-boundary、action-limits、contracts、law、engine、routing-programs、dialogue、repair、npc-relations、standing、npc-schedule），若根因落在这些文件，停下报告最小改动。
验收：node --test --test-isolation=none tests/bosses.test.mjs tests/s3-run001.test.mjs tests/s3-offscreen-life.test.mjs 全部通过（报用时）。bosses 中 CLI 子进程类用例在沙箱内 EPERM 的列出，由主会话沙箱外补跑。
不调用真实模型。预计规模：小到中。
通用：TEMP/TMP=F:/dnd-tmp，最多 2 个 node 进程，输出过滤为摘要，单个失败只看最后 30 行。不再启动其他会话或子代理。最后回复不超过 8 行（每项根因与证据、改动文件、验收结果），同样写到 F:/dnd/logs/sessions/last2.final.txt。
