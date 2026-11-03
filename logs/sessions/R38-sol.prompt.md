【进程规则】只能结束你本会话启动且记录了 PID 的进程；禁止按名称或批量结束 node。临时调试文件结束前删除。
【省额度规则】测试输出必须过滤，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（不要用 grep/head）；禁止读完整输出。
沙箱不允许 git 写操作；改完不提交。node 命令设 TEMP/TMP 为 F:/dnd-tmp，最多 3 个 node 进程。用中文汇报。

卡 R38（调度器性能回归，主会话已诊断）。项目《无限原野》Node 规则引擎。工作区 F:/dnd-wt/R38（分支 r38，基于最新 master）。
现象：S2b-1 同刻调度器默认开启后，长推进慢约 9 倍。基准 tools/bench-farm-pests.mjs（用法：在工作区根运行 `node tools/bench-farm-pests.mjs <每步天数> <步数>`）：R31 时 30天×2 = 23 秒、1天×30 = 12 秒；现在 207 秒、96 秒。tests/farm-pests-clock.test.mjs 从约 15 分钟变成 >3.6 小时。
剖析（1天×30，总 93s）：advanceInterval 71s、runAdvanceSystems 66s、nextFromScheduleHeap 21.5s（每次重建堆，内含 educationCourses/personConstraints/protocolScheduleAt/逐 NPC 遍历 records）、settleSchedules 15.6s、npcAutonomy 14.6s、subjectiveView 13.1s、deriveEducationCourses 10.2s、advanceShops 9.3s。
根因假设：server-plugin/advance-registry.mjs 的 nextFromScheduleHeap 把每个 NPC 每个作息槽结束、每个记录 deadline 都作为刻（符合 §14.2），但每一刻都调用 runAdvanceSystems 跑全部系统；绝大多数系统在非其到期刻是空转。另外每次求下一刻都整堆重建。
要求（设计 docs/架构设计/14-确定性与时序.md §14.2：刻集由日程堆确定，阶段 2 只处理本刻到期项）：
1. 让每一刻只运行“本刻有到期项的系统”与“本刻是其时钟刻的时钟规则”（午夜等）；堆项需记录归属系统。对没有 nextMinute 声明的旧系统，确认其在非到期刻确为空操作后再跳过；不能确认的保持每刻运行并在报告列出。
2. 日程堆增量维护或按刻复用派生（educationCourses、personConstraints 等每刻只算一次），避免每次求下一刻全量重建。
3. 结果必须逐字节等价：tests/advance-registry.test.mjs 金快照不变、tests/invariants/i31-total-order.test.mjs、farm-pests 系列“长等待与逐日等待一致”、save-roundtrip 全过。不许改金快照、不许放宽断言。
4. 目标：bench 30天×2 ≤ 35 秒、1天×30 ≤ 18 秒（回到 R31 的 1.5 倍内）；报告前后数字。
跑：上述测试；tests/farm-pests-clock.test.mjs（应回到 30 分钟内）；tests/scale.test.mjs（单独跑）；CORE；tests/s2c-*、transition-*、a2-*、governance。
报告 F:/dnd/logs/sessions/R38-sol.final.txt；回复 ≤150 字：改了什么、bench 前后、测试结果、未能跳过的系统清单。
