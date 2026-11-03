# 卡 FIXK08：K08 定期集市合入后的三个漏检回归

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读，尤其"验收测试清单不自己挑"）。

## 事实（主会话二分，first-parent，每步用该提交自己的测试文件）
master 上通过、s5a 上失败，首败都是 d381d02e（s5a: merge t-k08-law）：
1. tests/remote-generation.test.mjs:100 自动接入：远程生成聚落的商店路线补货全为 0，reason"没有已到场的持货人或可领取运单；集日不生成现货"。
2. tests/works.test.mjs:94 测绘：报"与实际赶集路程或服务时段冲突"；works.test.mjs:143 F014 出版需求来自真实读者：数值变化。
3. tests/w2-reuse-learning.test.mjs:120 起 8 个"购买、失败成本、重试学会与零熟练施法"用例失败（同一断言处）。

## 要做
逐个查根因到文件:行，判断是 K08 规律缺了一环（例如远程生成聚落没有 K08 需要的持货人/运单来源、赶集占工把玩家/教师的服务时段错误占掉、书商货架被集市消费者买空），还是测试前提已不成立。
- 规律缺环就在规律层通用补齐（派生优先：远程生成的聚落要按同一规律派生持货人/货源，不许为它开"集日现货"特例；玩家自由度优先，NPC 自留规则不限制玩家）。
- 若确属新规律下的真实结果（例如书被真实读者买走），测试前提改用真实游戏动作产生（setup.prelude 风格），并附手算；不许放宽断言、不许删用例。
- 不按名字/ID 特判。

## 并行边界
K15R4 在 F:/dnd-wt/INTEG 改 npc-life.mjs、household-budget.mjs、shop.mjs（客店补货锚点）、monster-society*、npc-autonomy.mjs、advance-registry.mjs daily 块；PERFS7 在 F:/dnd-wt/PF7 改 storage.mjs 等通用层；FIXPUB 改人物档案发布/world 内容。你若必须改 shop.mjs，把改动限制在你需要的函数，汇报里写明函数名，便于合并。

## 验收
affected-tests2 清单（.base，WORKTREE，深度0）全过或注明 .base 对照；这 3 个文件全过；金快照若变，写 FIXK08-golden-table.md。汇报 ≤300 字：每个失败的根因（文件:行）与修法；清单 N/通过/失败。
