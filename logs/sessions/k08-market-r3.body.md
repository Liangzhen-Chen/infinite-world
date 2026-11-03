K08 续做（主会话已处理合并，请先 git log -4 / git status 看清）：
1. 你的改动已作为 WIP 提交（K08 WIP），并合入了最新 s5a（含 K04 家户劳力、各回归修复）。合并时 server-plugin/npc-state.mjs 的 householdWorkTime 冲突，主会话**保留了 K04 的结构派生版本**（按田地权利/照料/集日交易/真实 market_trip 记录派生，不读活动名），删掉了你复制的那份。你新增的 marketTimeWindows / marketScheduleAt 保留。之前主会话说明里写"K04 已合入 s5a"是误写，导致你复制了一份，责任在主会话。
2. 合并后 tests/s5-law-periodic-market.test.mjs 21/1：查清失败（多半是 K04 派生口径与你原先复制版本的差异），按 K04 版本修你的调用或手算更新锚点，不得改回按名字匹配。
3. **撤回 tests/s3-finance-scenarios.test.mjs 把面包换成木料的夹具改动**：E18/E3 失败的根因是 K02 储备规律改变了面包报价（二分首败 99b84880）。正确做法是按现行规律（K02 市场替代 + 你的远期报价）手算新的估值锚点并注明算式，断言保持严格；测试意图"负债投影只计一次"保留。
4. 金快照字段表按最终代码重做（K08-golden-table.md）。

验收同前（原卡列表逐文件、CORE、同步四件套；s5-playthrough 留主会话）。汇报同原卡。
