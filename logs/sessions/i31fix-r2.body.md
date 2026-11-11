I31FIX 续做（主会话核对后划定所有权）：

**新增本卡所有权**：server-plugin/world-events.mjs 的 creditBreaches / deriveWorldEvents 违约派生段（K15 未碰该文件）。

按你交接报告的修法实施：
1. labor-market settleArrears 写入 defaulted 的当刻，经现有 publishTransitionEvent 管线发布带债权稳定 ID 的 breach（保留参与者、金额、债权 source、标签及可选案件）；
2. world-events 对已由责任层当刻发布的同一违约不再外层派生，其他尚未迁移的债权路径保留原行为；两处复用同一事件构造函数，避免语义漂移。
不删违约消费者、不关采矿/工资规则。

验收按原卡：i31-total-order（用 tap 或 spec reporter，确保拿到 pass/fail 计数）、全部 tests/invariants、s5-law-household-labor、labor-market、npc-schedule、s5-law-production-inputs、extraction 相关、credit、npc-obligations、world-events、CORE、重导后同步四件套；金快照变化出字段表（应主要是违约事件 seq/cause 的重新排列）。
