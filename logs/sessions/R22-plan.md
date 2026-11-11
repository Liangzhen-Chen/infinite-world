# R22 主线回归收口 — 步骤与状态

工作树 F:/dnd-wt/R22（分支 r22）；bisect 用 F:/dnd-wt/R22-bisect、R22-bisect2（结束后删除）。

1. [完成] 逐个跑 R21 列出的失败文件：m1、r06、w2-s4、w5-clock-1/2 均非已知旧失败；全部已修并验证。
2. [完成] bisect 定位（见 R22-cc-001.final.txt）。
3. [完成] 冬季用例性能（共享记录索引；族群觉醒新栖地当次推进即日结）。整文件最终计时待跑。
4. [进行中] 全量逐文件：A 路完成；B 路进行到 n*（farm-pests 超时，为 RW04 长测试）。
   - 已修并验证：law、runtime-invention、route-order、w1-villages、w2-reuse-publication、w3-trades#37、faction-clock、sites、festival-runtime、w1-village-profiles、population-publication、npc-depth、w5-clock-1/2、r06、m1、w2-s2/s3/s4。
   - 已改待验证（fix9/chain3 跑中）：magic-air（M4R 同意提示改含"自愿同意"）、w4-b3（V4 魔物社会成员按聚居地自身名册而非议事势力）、seasonal-migration（U11 当次推进新栖地登记进 engine.runtimeHabitats）、agriculture（夹具保留世界已有聚落粮账）、m1-repair#150（不足一分钟不开教育记录）、m5-authority-content（删掉 V3 未经 L2 写进 treasury.spending 的一行）。
   - 待重生成派生产物：docs/actions.json（R20 后未重导出）、world/art/mapping.json（T162 起新地点未重建 M6 art）、advance-registry 金快照（教育课时不再课中截断；逐条列旧→新）。
   - 与后续设计/数据矛盾、不能在不改测试下同时满足：w3-content#58、w3-trades#49（T113/T114 据点持 W3 物品 vs sites#191 严格）、quest-wildlife#42（V3 派生主事人 vs 写死表断言）、w1-villages-publish#30/#35（夹具写入剥离后的实体却复制正式 rules.json）、w1-hewan#36（T108 主持人不在 W1 河湾夹具里 vs festival-runtime#41 要求拒绝未知主持人）。
   - 超时：farm-pests（RW04 长测试）、agriculture（待单跑 45 分钟上限）。
5. [待做] sweep B 完成 → fix10 复核 → 重生成三项派生产物 → lifecycle 最终计时 → R22-sweep.md。
6. [中止] 按协调者指令停在一致点，已提交到 b48658ad； merge master → CORE/arch-metrics/advance-registry 验收 → 还原 docs/测试报告 截图 → 提交 r22 → R22-cc-001.final.txt；删除 bisect 工作树。
