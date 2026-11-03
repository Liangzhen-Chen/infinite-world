# 续卡 s501b-derived：S5-01 第 2 会话——把现有消费者接到派生修正槽

你的第 1 会话已提交（t-s501 abb98b16），主会话修了 1 个失败用例：持有传导测试原先让林穗"拥有白石巡检房"，但巡检房开局已有主，份额合计 2 被正确拒绝；改为动态挑选开局无人拥有的建筑（tests/s5-01.test.mjs）。t-s501 已合入 master（含过拟合白名单清理，overfit-guard 4/0）。主会话正在另一工作区对 t-s501 跑全量扫描。

## 本会话要做（按你第 1 会话列的后续消费者清单）
1. standing（立场/好感）派生改走 derived：立场相关的修正项（关系、声望、事件）经修正槽合成，结果与现值一致（先迁移，不改数值规则）。
2. npc-decision 的成本/收益读 B/C 表经修正槽：决策里用到的成本系数、风险系数改为派生值。
3. 其余读写硬编码系数且属于 S5-01 范围的消费者（不含价格——价格归 S5-02/04），逐个迁移；每迁一个，原有测试结果不变。
4. bounds 校验覆盖到新接入的槽。
原则：迁移不改变任何现有玩法结果（同输入同输出）；需要改数值的，列出来留给对应 S5 卡，不在本卡改。规则只一版、不加版本标记；不调用付费模型。

## 验收
tests/s5-01.test.mjs 及各被迁移消费者的测试全过；affected-tests（`node F:/dnd-tools/affected-tests.mjs master`）中名字含 standing、decision、npc-、relation、derived、s5- 的文件逐个跑并报 pass/fail；arch-metrics、system-map、performance、CORE 全过；静态 ≤10593。
汇报（≤300 字，写入 F:/dnd/logs/sessions/s501b-derived.final.md，**用 UTF-8 编码**——上次的交接报告编码损坏无法阅读）：迁移了哪些消费者、改动文件、命令与 pass/fail、留给后续 S5 卡的数值清单、偏离与未解决。
