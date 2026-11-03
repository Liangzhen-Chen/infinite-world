# 卡 S5CB：S5 收口回归——工资柜台、店主周补货雇工、远方郡往返份额、同日再买深度

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。全量扫描 s5a@75cc53c2 对照 master 后，S5 自有测试与回归中仍失败：
1. tests/s5-04b.test.mjs 两项："wage counter: when the counter runs short the shortfall is wage debt e…"、"npc shopkeepers: within a week each stocks up, reprices and hires by h…"（S5 自有测试，从未通过）。
2. tests/s5-09.test.mjs 一项："three native county round trips merge actual ownership shares without a second genesis"。
3. tests/a1-lt-scenarios.test.mjs "L3 同一天再买同一件东西，成交深度真实上升且总额一次取整"（master 上该用例通过，s5a 失败；master 失败的是另一项）。
逐项查根因到文件:行（多半与 K02/K05/K08/K12 的市场、营业、工资规律或 FIXK08 新增到场行商有关）。规律缺环就补规律；规律正确而锚点过时就按新规律手算更新并写推导；不放宽、不删用例、不按名字特判。往返守恒（钱货人口所有权份额）是硬要求。
验收：共同规则清单；这三个文件只剩 master 上同名失败（a1-lt 的 master 失败项）；汇报 ≤300 字。
