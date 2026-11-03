# PERFS9 交接（PF9，未提交）
**改前热点（profile 增长）**：engine.mjs:847 route search +3.8s；法典宽限 currentGrace→legalCodeAt→normStack/normCode +12s；education-state.mjs:134 sameScheduleInputs 全表扫 +3s；storage take +2s；market goodsClass +1.3s；household-subsistence journey→route +4s。
**改动与收益**（bench 30×2 profile 秒）：
1. law-codes.mjs 新增 legalCivilAt、norm-stack.mjs 新增 normCivil/mergeClauses、去 structuredClone 原始值、路径与地点索引；obligation-runtime.mjs:482 改用之：约 -10s
2. education-state.mjs isScheduleRecord 用 Set、rows 改循环：约 -2s
3. engine.mjs route：按出发分钟分别保留 8 个搜索前沿（原每换分钟清空）：约 -2s
4. market.mjs goodsClass 按行对象+入参校验缓存：约 -1s
**三对比值**（master/PF9，ms）：改前(S5A) 1.41/1.42/1.37，中位 1.408；改后 90117/103695、84382/99354、81198/99824 → 1.151/1.178/1.229，中位 1.178（≤1.25）。
**验收**：金快照 full/quiet 字节相同；numeric-digest 相同；bench 60 天终态哈希同 S5A；affected 352 个文件（10 个慢文件未跑）无新增失败（actions-catalog 因 engine 行号移位一度失败，已把改动压成同行数，复测通过）。
**未解决**：剩余耗时平摊：storage take 复制大表、npc 日程/店铺/家户路线搜索，均已有缓存，无大块可无损再降。
