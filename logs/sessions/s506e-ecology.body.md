# 续卡 s506e-ecology：最后一个回归 npc-depth-wt

主会话沙箱外复核：tests/npc-depth-wt.test.mjs 在 s5a 上连续两次 21/0、历次全量扫描 21/0；在你的工作区 20/1（门禁曾误判为基线同败，已核实为本卡回归）。其余：runtime、a3-builder-ui 单跑通过（负载偶发）；npc-depth-lq 28/0、npc-depth-sb 19/0、overfit 4/0 均已在沙箱外通过。
请找出 npc-depth-wt 失败用例的根因并修复（合法变化按设计对齐并用手算锚点；实现缺陷修实现；不放宽断言）。只需复跑 npc-depth-wt 与 s5-06、CORE。汇报 ≤150 字（UTF-8，F:/dnd/logs/sessions/s506e-ecology.final.md）。
