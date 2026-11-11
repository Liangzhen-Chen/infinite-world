# 卡 FIXT164：npc-life-t164 配偶继承金额回归

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/FIXT164，分支 t-fixt164，基于 t-s5integ@9729614a。.base = 9729614a。

## 事实
tests/npc-life-t164.test.mjs:184"名册家人在照护、离世、迁居需要时进入状态：配偶照护并继承…"在 master 通过，s5a 起失败：期望 40 实际 13（苗珍 coins:40 离世后丈夫邵禾继承）。主会话二分首败 = FXM 合并 74ffb109（FXM 让缺工预测与农业日结共用田间分钟 agriculturalWorkforce）。

## 要做
查清 40→13 的 27 铜去了哪里（逐笔看账本流水：是丧葬/遗产阶段的真实支出、FXM 后家户劳力口径导致的雇工/采购支出，还是继承漏转/重复扣）。真实规律后果就按新规律手算更新锚点并写推导；bug 就修代码。不按名字特判，不放宽断言。

## 文件所有权
npc-life.mjs 的照护/离世/继承/迁居部分、agriculture.mjs、相关测试。K16 卡同时改 npc-life.mjs 的进餐部分（advanceHouseholdMeals）和 household-budget.mjs——你不改那些。

## 验收
共同规则的 affected-tests2 清单（.base=9729614a，WORKTREE，深度0，同文件按子测名对照）；t164 全过。汇报 ≤300 字：27 铜的去向（文件:行）与处理。
