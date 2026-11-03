# 续卡 s4r4b：第二批回归——法术同意/研究/事件/动词

你上一卡的改动已合入 s4a，工作区 F:/dnd-wt/S4R4 已快进到 s4a 6df89a9d（含 S4R1~R4 修复，其中你加的施法拒绝码 E-ACTION-CAST-MP/CONSENT/RANGE）。处理原则、设计决定、冻结语料约束同上一卡（见 F:/dnd/logs/sessions/s4r-common.md）。

## 本卡负责的失败文件（在 a3a 通过、s4a 失败；首个报错见 F:/dnd/logs/sessions/s4a-firsterr3.tsv）
- tests/spell-consent.test.mjs（actual 100）
- tests/spell-research.test.mjs（拒绝文字不再匹配 /同意|许可|目标实际/）
- tests/s3-g18.test.mjs（Missing expected rejection）
- tests/runtime-invention.test.mjs（未登记“顺纹切削”）
- tests/verbs-extra.test.mjs
- tests/wildlife-society.test.mjs
- tests/world-events.test.mjs
- tests/w2-s2.test.mjs、tests/w2-s3.test.mjs（拒绝文字 /同意|在场|事实/ 不再匹配；Missing expected rejection）、tests/w2-s4.test.mjs
- tests/s3-run001.test.mjs
注意：w2-s2/s3/s4、s3-run001 有严重性能退化，另一张卡 s4r5-perf 在修性能；你只修断言失败，跑慢文件时用 --test-name-pattern 只跑失败用例。"Missing expected rejection" 意味着 S4 后某个原本应被拒的动作现在成功了——先判断是 S4 合法放开（如有了原生距离后可旁观）还是规则漏洞（例如同意/在场检查被绕过）；漏洞必须修生产代码。

## 验收与汇报
本卡清单逐文件全过（慢文件可只报失败用例）；s4-perception、magic-light、organizations、s4-filing、a3-precondition-receipt、arch-metrics、system-map、CORE 各一次全过。汇报 ≤350 字：每文件根因一句（标明"合法放开"或"漏洞"）、生产/测试改动文件、命令与 pass/fail、偏离与未解决。
