【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：120 分钟（到 110 分钟时停手写交接）。

# 卡 perf1-engine：世界推进提速（结果逐字节不变）

工作区 F:/dnd-wt/PERF1（分支 t-perf1，基于 s5a 314e5e3f）。先读：
- docs/产品原则.md；
- docs/架构设计/07-离屏与性能.md、14-确定性与时序.md（只读相关小节）。

## 背景（实测）
- 60 天推进：R31 时约 23 秒，现在 66~70 秒。最长的几个测试（world-clock 5.5 分、festival 4.3 分、s5-05 7 分）基本都是在等推进。玩家"等一个月"也要约 35 秒。
- 主会话的 CPU 剖析（.cpuprofile 在 F:/dnd-tmp/prof/；摘要脚本 F:/temp/claude/C--Users-RobertC-Documents-dnd/a099826b-922c-4485-b7cc-077bd03d7d4b/scratchpad/prof-summary.mjs，用法 `node <脚本> <目录>`）：

| 测试 | 总时长 | 热点（占比） |
|---|---|---|
| world-clock | 530s | storage.mjs:370 take 18%；labor-market.mjs:262 settleArrears 15%；storage.mjs:184 updateRecordGroups 5%；cloneWalk 2% |
| festival | 426s | take 18%；settleArrears 13%；updateRecordGroups 4%；labor-market rows 3% |
| s5-05 | 642s | take 7%；advance-registry.mjs:159 buildScheduleHeap 6%；storage.mjs:8 canonicalValue 5%；npc-schedule settleSchedules 3% |

## 要求
1. 先确认热点的成因。例如：
   - take 是否每次都全量复制或扫描；
   - settleArrears 是否每 tick 遍历全部雇佣记录；
   - buildScheduleHeap 是否每步重建。
   
   然后按根因修：增量索引、缓存加正确的失效条件、避免重复深拷贝。
2. **结果必须逐字节不变。** advance-registry 的金快照、存档往返、确定性测试都不得改动期望值。禁止为提速减少模拟天数、种子或断言；禁止跳过世界规则。
3. 每改一处，就用同一个基准前后对比（60 天推进或 world-clock 单文件），写下秒数。
4. 目标：world-clock、festival 降到原来的一半以下，总推进向 R31 的量级靠拢。做不到的话，说明剩余瓶颈在哪里。

## 验收（逐文件单独跑，加 TEMP=F:/dnd-tmp）
- advance-registry、world-clock、festival、s5-05、save-roundtrip、labor-market 相关测试；
- CORE（engine、storage、plugin）。

不跑全量，交卡后门禁会跑。

## 汇报（≤300 字，写入 F:/dnd/logs/sessions/perf1-engine.final.md）
- 每个热点的根因与改法；
- 前后秒数；
- 逐字节一致的证据；
- 偏离之处。
