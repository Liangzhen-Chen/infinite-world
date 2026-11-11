# 续卡 s4r2b：第二批回归——内容发布/规范绑定/机构

你上一卡的改动已合入 s4a，工作区 F:/dnd-wt/S4R2 已快进到 s4a 6df89a9d（含 S4R1~R4 修复）。处理原则、设计决定、冻结语料约束同上一卡（见 F:/dnd/logs/sessions/s4r-common.md）。

## 本卡负责的失败文件（在 a3a 通过、s4a 失败；首个报错见 F:/dnd/logs/sessions/s4a-firsterr3.tsv）
- tests/npc-publication-increments.test.mjs（E-NORM-BINDING unknown place: bld_bs_school…）
- tests/npc-profile-publication.test.mjs（E-NORM-BINDING: rules and law/bindings.json disagree）
- tests/population-publication.test.mjs
- tests/r06-bs-market.test.mjs（faction_bs_government 已存在且不同）
- tests/w2-reuse-publication.test.mjs、tests/w2-reuse.test.mjs、tests/w2-s1.test.mjs
- tests/w4-b1.test.mjs、tests/w4-b2.test.mjs、tests/w4-b3.test.mjs
- tests/w5-festival-publication.test.mjs（只能预约未来一年内的实际节俗日期）
- tests/ontology.test.mjs
注意：w2-*、w4-* 有严重性能退化，另一张卡 s4r5-perf 在修性能（只改热路径缓存，不改规则结果）；你只修断言失败，跑这些慢文件时可用 --test-name-pattern 只跑失败用例。

## 验收与汇报
本卡清单逐文件全过（慢文件可只报失败用例 + 整文件一次）；s4-offices、s4-office-quests、a3-world-approval、a3-content-approval、npc-depth、arch-metrics、system-map、CORE 各一次全过。汇报 ≤350 字：每文件根因一句、生产/测试改动文件、命令与 pass/fail、偏离与未解决。
