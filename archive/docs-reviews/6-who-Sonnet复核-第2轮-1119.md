# 块 6 WHO 数据卡复核第 2 轮（Claude Sonnet 5.5 中档，11-19）

对象：HEAD 40a7261ee 相对 fc4830b32。结论：可封（带一条建议）。

1. foodFactor：基于卷四 T-1 :787 的定义（需要 ÷ 成人需要 ÷ 体重比^0.75），算法合理。WebFetch 核 FAO/WHO/UNU 表 5.2（y5686e07.htm）四条 BMR 公式与 basis 引用完全一致。老年 0.8448 手算：男 (11.711×69.1554+587.7)/(15.057×69.1554+692.2) = 1397.6/1733.5 = 0.8062，女 (9.082×57.0373+658.5)/(14.818×57.0373+486.6) = 1176.5/1331.8 = 0.8834，平均 0.8448 ✓。婴儿 1.1538、少年 1.1683 涉及表 3.2/4.2/4.3 逐月逐岁平均，未逐项重算，只核了方法与公式出处。
2. sleepFactor：AASM 区间加权手算 25+34.5+73.5+54 = 187，÷18 = 10.389，÷7 = 1.4841 ✓；婴儿 14÷7 = 2 ✓。成人 7 小时经 Sleep Foundation 转述页：可接受，因 basis 已如实写明"原文未读到、转述"，且 7 小时是 AASM/SRS 公认数；建议在该行 basis 或回报里加"待核原文（Watson 2015）"字样，不必改为未建。
3. 老年 relAgeMin 0.7 仍用卷文数并标设定数待调，裁定允许。
4. registry.json 说明已改正，与现状一致。
5. 亲跑：`node --test tests/kernel/*.test.mjs tests/accept/*.test.mjs` → tests 1145 / pass 1145 / fail 0；`node tools/accept/run.mjs pre_commit` → "verdict": "pass"。
