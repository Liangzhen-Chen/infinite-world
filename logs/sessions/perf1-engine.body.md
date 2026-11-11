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
