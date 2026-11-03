# I31FIX 修复完成交接

## 结果和改动

I31 原测试已全部通过，一次推进十天、逐日推进以及非整刻拆段加 JSON 往返的完整 state 与含 seq 的事件序列一致。没有改测试、降低断言或关闭劳力规律。

首个因果分歧是同一欠薪违约：minute=5340、value=13，原先逐日推进 seq=19、一次十天 seq=43。实际出勤、采矿耗时、产出和债权相同；`settleArrears` 当刻只写 defaulted，`engine.mjs:437` 在外层 reduce 结束才经 world-events 的 before/after 适配器发布，导致 seq 随调用分段变化。

- `server-plugin/labor-market.mjs:347`：defaulted 写入后，使用债权稳定 ID，经原 publishTransitionEvent 管线当刻发布 breach。未改工时、工资、采矿、离职或违约消费者。
- `server-plugin/world-events.mjs:83`：导出共用 creditBreachEvent 构造函数，保留 actor、target、金额、地点、时刻、witnesses、债权 source、标签、可选案件和 key。外层 creditBreaches 对已发布的稳定事件去重，其他尚未迁移的债权保持原行为。
- `docs/actions.json`：按要求重导，四处 labor-market dispatch 行号各加3，动作集合未变。

新增 world-events 所有权来自本次用户续卡明确授权。没有触及 K15 锁定模块和任何禁区，没有 Git 写操作、部署、原存档操作或读取 secrets。

## 已完成验收

命令逐文件单进程执行，TEMP/TMP=F:/dnd-tmp；采用 tap reporter，只取摘要。为兼容 PowerShell 输出，过滤器同时匹配 ASCII `# pass` / `# fail` 与带缩进的 `not ok`。完整摘要见 `F:/dnd/logs/sessions/I31FIX-tests.txt`。

| tests/ 文件 | pass / fail |
| --- | --- |
| invariants/i31-total-order | 18 / 0 |
| invariants/i01-conservation | 2 / 0 |
| invariants/i02-non-negative | 3 / 0 |
| invariants/i15-single-account | 2 / 0 |
| invariants/i16-event-primary-write | 2 / 0 |
| invariants | 1 / 0 |
| s5-law-household-labor | 16 / 0 |
| labor-market | 16 / 0 |
| npc-schedule | 12 / 0 |
| s5-law-production-inputs | 10 / 0 |
| mining-jurisdiction | 7 / 0 |
| s5-04 | 18 / 0 |
| s3-labor-justice | 6 / 0 |
| credit | 6 / 0 |
| npc-obligations | 8 / 0 |
| world-events | 8 / 0 |
| engine | 22 / 0 |
| storage | 14 / 0 |
| plugin | 7 / 0 |
| s5-05 | 16 / 0 |
| actions-catalog | 4 / 0 |
| action-registry | 7 / 0 |
| advance-registry | 3 / 2（有意改变的旧金快照） |
| arch-metrics | 5 / 0 |

额外补跑 s5-04b 为6 pass / 2 fail；本树与干净 S5A 同头基线完整单文件运行的失败名称和数量一致：

- `wage counter: when the counter runs short the shortfall is wage debt even though the owner carries cash`
- `npc shopkeepers: within a week each stocks up, reprices and hires by his own decision, paid from his counter`

这两项是既有失败，不作为本卡通过项，也未改其测试。其余本卡要求的测试已逐文件运行完毕，没有 EPERM 项或未运行项。

现有采矿手算锚点也保留并通过：480分钟减往返4分钟得到476到岗分钟；每次采矿60分钟，可实际作业420分钟，日薪960应付840，矿主实得1份矿石；未到岗和仅在场无出勤均不能凭空报工时，重放不重复付钱或采矿。

## 金快照及数值摘要

没有设 UPDATE_ADVANCE_GOLDEN，也没有改任何测试金快照。以干净 S5A 和本树分别运行既有 golden-dump，在同一基线版本下比较 full/quiet 场景。

`F:/dnd/logs/sessions/I31FIX-golden-table.md` 列出25项最终状态字段变化：违约记录键/id 改为债权稳定 ID、去掉依赖外层调用的 sourceEvent/tool、违约及后续事件 seq 重排。full 的违约 seq 13→12，quiet 为25→11。对齐同一违约事件改名后，没有发现其他状态、工资、出勤、产量、库存、债权金额或 messages 变化；没有 cause 变化。

干净 S5A 的 advance-registry 为5 pass / 0 fail。本树的两个失败分别以单例最后30行核实，均是第69行与旧金快照比较不符，第67行的重复重放一致性比较通过。字段表末尾补了 full[3]/full[4]/quiet[2]/quiet[3] 四项完整 trace 哈希旧→新；此前步骤哈希不变。请主会话审核字段表后统一更新金快照，本会话没有代更新。

两树均跑 tools/numeric-digest.mjs，13项数值函数的 sha/sample 全部不变；full/quiet 两个 state 哈希因上述事件变化而变化，逐项记录在 `F:/dnd/logs/sessions/I31FIX-numeric-table.md`。原始前后 golden/numeric 导出保留在同目录供主会话复核。

## 交付与清理

本卡无未完成的实现或未跑验收；主会话后续动作是审核上述有意改变的快照字段并统一更新金快照，再代提交。额外发现的 s5-04b 两项已有失败已给出同头基线对照，保持原样供主会话另行处理。

最终生产改动仅 labor-market、world-events 与重导的 docs/actions.json。测试和金快照均无 diff；禁区及 K15 锁定模块无改动。临时脚本已删除，原有 `.base` 保留。golden/numeric 前后导出及摘要是本卡审核交付物，保留在 logs/sessions。未主动结束任何进程，测试命令均自然退出。
