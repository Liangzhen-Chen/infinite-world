K15 第三轮：按根因修性能（主会话诊断，放开上一轮"与 K15 输出逐字节一致"的约束——那条约束是主会话设错了，挡住了真正的病根）。

## 主会话诊断
慢的不是进餐计算本身。server-plugin/npc-life.mjs:83 每户每日无条件 `d.set(['state','family','meals',key], {...})`，加上每行 itemDelta——全世界每户每天写存档。PERFS5 的 stateMemo 规则是"任何 cursor 写入使记忆失效"，于是各系统的记忆每天被冲掉，教育排课/日程等重新全量计算（你上轮剖析的剩余热点 storage.take、education-state records 扫描正是此现象）。请先用剖析确认或否定这条判断。

## 要做
1. **只记该记的**：口粮消耗仍真实走 itemDelta 账本（不能省）。family.meals 只在有变化时写：缺餐、连续缺餐计数变化、家户成员/来源变化；"今日已结算"的防重用一个按聚落或按日的紧凑水位（例如每个聚落一个 lastSettledDay），不为每户每日改写整条记录。缺餐统计仍可重算、存读档与重放保持正确。
2. **记忆按范围失效**：在 server-plugin/storage.mjs 的 stateMemo/记录索引机制中，把"任何写入都失效"改为按受影响的状态子树/记录类别失效（例如写 state.family.* 不使依赖 state.records 某类别或 state.npcs 日程的记忆失效）。键必须仍包含全部显式输入；FIELDS_INDEX_CHECK=1 必须仍能检出任何陈旧命中。这是通用改进，适用于所有每日写存档的规律。
3. 行为：除进餐记录的存储形状外，世界结果（库存、钱、缺餐数、成交、价格等）应与当前 K15 一致；金快照差异重新出字段表 K15-golden-table.md（应比 5604 条少），逐项给出旧→新与原因。
4. 目标：bench-farm-pests 30 2 三对中位相对 master ≤1.10。

## 验收
三对数字；FIELDS_INDEX_CHECK=1 跑 s5-law-household-meals、s5-law-household-budget、npc-life-health、s5-law-periodic-market、perf-s5-cache、holdings-registry、npc-schedule、education 相关测试；CORE、同步四件套；numeric-digest 说明变化。汇报：剖析是否确认诊断、两处修法、提速数字、字段表摘要。
