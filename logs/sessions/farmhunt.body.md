# 卡 FARMHUNT：farm-pests-hunt"击杀捕食者后田鼠增加且收成下降"失败查因

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。

## 事实
tests/farm-pests-hunt.test.mjs（登记 S7 的结构慢测，gate-skips 整文件交夜间扫描）在 master@3bbd7e0c 上 1 小时内跑不完（无基线可比）；在 s5a@78dd9344 上能跑完，失败一项："实际追踪并击杀捕食者后田鼠增加且收成下降；击杀不给农田损失的退款"。
## 要做
1. 定位失败断言与实际值（田鼠数、收成、退款），查因果链：击杀捕食者 → 捕食压力下降 → 田鼠种群（wildlife/farm-pests）→ 农田损失 → 收成。找出 S5 哪个规律改变了这条链（K01–K16 中农业、野生动物、季节、家户劳力、FXM 共用田间分钟等），给出文件:行。
2. 若是真实规律后果（例如田间劳力口径改变使损失计法变化，但"田鼠增加、收成下降"的方向仍应成立），按新规律手算重锚；若方向本身不再成立（击杀捕食者后田鼠没增加或收成没降），那是规律缺环，修规律。不得放宽为"不减少即可"之类。
3. 顺带测出单文件在 s5a 上的耗时，写入 final（用于判断能否移出 S7 慢测登记）。
## 文件所有权
farm-pests*.mjs、wildlife*.mjs、agriculture.mjs 中与病虫害/捕食相关部分，以及 tests/farm-pests-hunt.test.mjs。不改 household-subsistence/npc-life/household-budget（K16 在改）、food-supply/shop/transport（TFB 暂存分支）。
## 验收
farm-pests-hunt 全过；共同规则清单（同文件逐子测对照）；汇报 ≤300 字：根因（文件:行）、处理、单文件耗时。
