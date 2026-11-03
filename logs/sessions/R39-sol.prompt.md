【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

卡 R39（调度器性能第二轮，质量优先）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/R39（分支 r39，基于最新 master，已含 S3）。
背景：S2b-1 同刻调度器使长推进变慢；R38（报告 F:/dnd/logs/sessions/R38-sol.final.txt）已改为每刻只跑有到期项的系统并复用派生，提速 2.5 倍，但仍是 R31 的约 3.5 倍：前 3 天 531 刻；约 20 个旧系统没有 nextMinute 只能每刻运行（education_enrollment、contracts、summons、law、pets、agriculture_expiry、public_projects、upper_appointments、season_effects、faith_expe… 见 R38 报告第 9–11 行）；每刻连续物件写入使 R31 的记录索引失效；求下一刻与逐 NPC 作息仍是主要成本。现在 master 全量扫描中 agriculture、farm-pests-clock/harvest/hunt、ledger-price、seasonal-migration、wildlife、playtest-lifecycle 在 30 分钟内跑不完。
基准：tools/bench-farm-pests.mjs（工作区根运行 `node tools/bench-farm-pests.mjs <每步天数> <步数>`）。R31 时 30天×2=23s、1天×30=12s；R38 后 82s、37s。
设计依据：docs/架构设计/14-确定性与时序.md §14.2（刻集由日程堆确定，阶段 2 只处理本刻到期项）、07-离屏与性能.md。
任务：
1. 给无 nextMinute 的旧系统逐个补上真实的下一到期时刻声明（读其状态中的到期字段），使它们只在到期刻运行；确认不了的保留每刻运行并在报告列出原因。
2. 减少刻数：作息槽结束若对该 NPC 无可观察影响（例如同地点同活动的连续槽、离屏且无行动的人）不应成为全局刻——按 §14.2 判定哪些到期项真正需要成刻；连续量（体力、腐败等）用累计闭式在读取时补算（附录A §A.15），不逐刻写。
3. 记录索引：让连续写入不使整个索引失效（按行增量更新或对连续字段旁路），保持 FIELDS_INDEX_CHECK=1 自检通过。
4. 结果逐字节等价：tests/advance-registry.test.mjs 金快照不变（若必须变，逐哈希写依据并停下交主会话）、tests/invariants/i31-total-order.test.mjs、farm-pests 系列“长等待与逐日一致”、save-roundtrip 全过。不改断言。
5. 目标：bench 30天×2 ≤35s、1天×30 ≤18s；上述 8 个长测试各自单跑在 30 分钟内完成。报告前后数字。
跑：上述测试（长测试单独跑，记录耗时）；tests/scale.test.mjs 单跑；CORE；tests/s3-*、s2c-*、transition-*、a2-*、governance。
报告 F:/dnd/logs/sessions/R39-sol.final.txt；回复 ≤200 字：改了什么、bench 与 8 个长测试前后耗时、金快照是否变、仍每刻运行的系统。
