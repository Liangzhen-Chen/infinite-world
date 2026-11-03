# 卡 S5CA：S5 收口回归——词汇封闭、存档非整数、住店 D04

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。全量扫描 s5a@75cc53c2 与 master@3bbd7e0c 逐子测对照（调度器 full-s5a-75cc / full-master-cmp），以下为 S5 新增失败：
1. tests/ontology.test.mjs "I18 词汇封闭：代码与法典里用到的动词、标签、罪名都已登记"——master 通过，s5a 失败。S5 规律卡新增的动词/标签/罪名未登记。按测试报出的条目逐个登记到正确的词表（不放宽检查、不删条目；若某个词是误用，改代码用已登记词）。
2. tests/numeric-persistence.test.mjs "after an advance, saved state holds no unlisted non-integer number"——S5 新测试未过。找出推进后存档中出现的非整数字段（写入者文件:行）。按共同规则"持久化只存整数或有理数"：改为整数或有理数（det-math 的 toRational）存储；确属允许的有理数类别才登记，不为过测试加白名单。
3. tests/daily-b2-exact.test.mjs 两项 D04 住店（"单间 40 文/晚，120→80，客栈钱柜 +40，只扣一晚，睡到次日卯时"；"D04.4 public paid lodging sleeps a full 540 minutes and recovers capp…"）——master 上为 todo，s5a 变成正式用例后失败。查是哪张 S5 卡把 todo 转正、实际行为差在哪（文件:行）；按规律修代码或按真实规律手算锚点。
验收：共同规则清单；三个文件全过；汇报 ≤300 字：每项根因与处理。
