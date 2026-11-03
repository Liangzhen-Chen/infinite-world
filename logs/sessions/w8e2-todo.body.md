# 卡 W8-E2：测试 todo 清账（陈旧转正、无归属定归属）

先读 F:/dnd/logs/sessions/w8e-common.md（必须遵守），再读 F:/dnd/logs/sessions/s5w8-survey.md 第 2 节。

工作树 F:/dnd-wt/W8E2（分支 t-w8e2-todo）。

## 要做
1. 疑似陈旧的 todo（survey 2.2），逐条核对引擎现状：
   - D02⑤（tests/daily-b2-exact.test.mjs:37）：market.mjs 已有 side/spread.buy；
   - D40①（daily-b2-events2.test.mjs:174）：s5-06 测试已有下蛋用例；
   - D27③/D28⑤（daily-b2-exact2.test.mjs:115）：具名存单在 S5-03 已做。
   已兑现的转成正式用例，前提用真实动作，断言原题意图；只兑现一部分的，拆成正式用例加剩余 todo。
2. 无归属的 todo（survey 2.3）：
   - tests/a1-daily-probes.test.mjs 约 218 行起的循环 21 条；
   - daily-b2 中无阶段标签的约 8 条（D04 客房占位、D11 月薪、D37①免税口径、D06①步速等）。
   逐条：已兑现的转正式用例；未兑现的把理由改准，写明缺什么、归哪个阶段（S6/A4/S7/S8，以 docs/PLAN.md 与 docs/架构设计/ 的阶段划分为准）。
3. 全仓扫一遍 `test.todo` / `{todo:` 中写着"S5"的条目，列出仍归 S5 的清单（文件:行、缺什么）写进汇报。不用逐条实现：W8-E3 在做 D32⑤、D09④、D10⑤、D14，这四条不要动。

## 可改文件
tests/daily-b2-*.test.mjs（D32、D09、D10、D14 那几行除外）、tests/a1-daily-probes.test.mjs、tests/a3-owner-ding.test.mjs，以及它们的 helper。不改 server-plugin/：若转正需要改引擎，保留 todo 并写进汇报。

## 汇报额外要求
给出数字：转正几条、改归属几条、仍归 S5 几条（附清单）。
