# 续卡 s4r7-legal：s4a 全量扫描中的法律类回归（在新工作区）

你之前做的 S4-07 与续卡已合入 s4a。**本卡工作区换成 F:/dnd-wt/S4R7（分支 t-s4r7，基于 s4a fc6b3867，含 a3a 最新的"测试跟随生产原生运行时"修复与 S4 全部合入）**，请在这里改，不要动 F:/dnd-wt/S407。

用户 10-24 新决定（必须遵守）：**规则只保留一版，不做旧存档兼容**——不要再新增任何"旧复演保持旧结果"的版本标记或分支；遇到只为旧版本兼容而存在的断言，在汇报里列出，不要为它加兼容代码（主会话另派规则归一卡统一删除）。

## 失败文件（在 a3a 03614540 通过、s4a fc6b3867 失败；首个报错见 F:/dnd/logs/sessions/s4a-firsterr4.tsv）
- tests/civic.test.mjs（actual 'legal_suspicion'）
- tests/public-opinion.test.mjs（案件未登记：嫌疑尚未受理）
- tests/npc-crime.test.mjs（3 个失败）
- tests/s4-norm-stack.test.mjs（拒绝文字不再匹配 /执行/）
- tests/a3-f5-f6.test.mjs（先判断是否属于法律/立案类；若不是，在汇报说明并照样修）
多半是 S4-06 两步立案（偷窃先成私密嫌疑，经办人本人受理才成案件）或司法程序数据发布后，旧测试仍按旧规矩直接读案件。处理原则同 F:/dnd/logs/sessions/s4r-common.md：修根因；测试前提依赖已被有意改变的旧捷径 → 改为真实报案与经办人本人受理；断言针对的行为被有意改变 → 等价或更严的新断言并逐处说明；不放宽、不删断言、不改冻结语料。

## 验收
上述文件逐个单独进程全过；s4-filing、s4-trial、s4-law-content、law、reputation-law、organizations、arch-metrics、system-map、CORE 各一次全过。汇报 ≤300 字：每文件根因一句、改动文件、命令与 pass/fail、列出的"仅旧版兼容"断言、偏离与未解决。
