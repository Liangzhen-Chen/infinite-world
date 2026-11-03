# 卡 W8-E4：服务容量题集补到 ≥20 题（标杆 B18.5）

先读 F:/dnd/logs/sessions/w8e-common.md（必须遵守）。再读：
- docs/架构设计/标杆标准.md 第 336 行 B18.5 与第 414 行，要求为"超容量请求按紧迫度排队的顺序正确率 100%；容量派生可解释；≥20 题，含医、讼、学、匠"；
- server-plugin/service-queue.mjs（W8-D 的通用队列：急者先、同级先到先得，回执写位次与预计时刻）；
- tests/w8d-service.test.mjs（现有 4 类用例）。

工作树 F:/dnd-wt/W8E4（分支 t-w8e4-capacity）。

## 要做
1. 新建容量题集，格式沿用仓库已有的同类题集（标杆 §414 行说"夹具 + RX 断言"；先 grep 现有的同意题集/沟通题集 B18.7/B18.3 怎么放，照同一目录与格式），≥20 题。
   - 医、讼、学、匠各 ≥4 题。
   - 覆盖：容量 1/多、急症插队、同级先到先得、在岗与不在岗、助手与设施改变容量（派生可解释：回执或视图能说明容量从哪来）、满员后有人完成补入、跨日预计时刻。
   - 每题前提由真实动作产生，手算期望顺序写在题里。
2. 新测试 tests/w8e4-capacity-set.test.mjs 逐题跑，断言顺序与位次 100% 正确，并断言容量说明含来源。
3. 若某题暴露引擎错误：在 service-queue.mjs 等文件修，修法写进汇报。不准为过题改题或写特判。

## 可改文件
新题集文件、新测试、server-plugin/service-queue.mjs、medicine.mjs、education*.mjs、legal-representation.mjs、repair.mjs、manufacturing.mjs（仅限排队相关的修正）。

## 汇报额外要求
给出题数分布（医/讼/学/匠）和通过率；列出发现并修好的引擎问题。
