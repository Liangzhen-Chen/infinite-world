# 续卡 s505b-resources：S5-05 第 2 会话

接着第 1 会话（田地成熟入账、批次采收、腐坏扣量、产量接派生槽，未提交）：
1. 林、矿、药、渔并入同一库存（资源点账户）；古树慢再生；有限饵料耗尽停产；源汇预算与累计取整（RW-06/W1）——不同推进步长结果完全一致。
2. 机制断言补齐（tests/s5-05.test.mjs）：每条都要有**手算的数字字面量**锚点（按 docs/架构设计/05-统一模型.md §5.5 与世界数据，注释写计算步骤），不得用被测函数算期望值。
3. 完整验收：affected 全部文件对比 master；agriculture、farm-pests-clock、farm-pests-hunt、farm-pests-harvest 单独计时并与 master 对比（不得变慢）；overfit、arch-metrics、system-map、performance、CORE 全过；静态 ≤10593。
4. 若有规则/资源数据要改 world/，走审批管线。
约束同第 1 会话。汇报 ≤350 字（UTF-8，F:/dnd/logs/sessions/s505b-resources.final.md）。
