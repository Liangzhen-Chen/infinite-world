# 续 s503f-credit：门禁发现的 3 个问题

门禁在共同基线 314e5e3f 上两次独立复跑对照，以下 3 项在基线上通过，在本卡失败：
1. tests/arch-metrics.test.mjs「import 图：每个模块都已标层，没有新增的向上依赖或包间 import」——新增的 server-plugin/finance-liabilities.mjs 需在 tools/arch-layers.mjs 登记层，且依赖方向不能向上。
2. tests/actions-catalog.test.mjs「actions.json 是最新导出」——按测试提示运行 `node tools/export-actions.mjs` 重新导出，确认导出差异只来自本卡改动。
3. tests/a1-lt-scenarios.test.mjs「L4 库存有限：铁匠铺的镐卖完后买不到，菜单说明下次进货的日子，到货后能再买」——查明本卡哪处改动（发行按面值、共享负债模块、典当借款人等）影响了商店库存/补货/报价，修实现，不改该测试。

另：你上一会话在 docs/待办.md、docs/问题.md 写了登记，这两个文件不允许执行者修改，主会话已还原，会把内容登记到正式位置；本会话不要再改 docs/。

逐文件跑：上述 3 个 + tests/s5-03、credit、finance-bank、a3-owner-ding、CORE。汇报（≤200 字，F:/dnd/logs/sessions/s503g-credit.final.md）：每项根因与改法、测试结果。
