【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

【交卡前必跑（10-26 起）】交卡前逐文件跑完以下检查并在汇报中写结果；不过的先修，不要留给门禁：
- CORE：tests/engine、tests/storage、tests/plugin；
- 同步四件套：先 `node tools/export-actions.mjs` 重导，再跑 tests/actions-catalog、tests/action-registry、tests/advance-registry、tests/arch-metrics。**不得重生成 advance-registry 金快照**（不得设 UPDATE_ADVANCE_GOLDEN）；若它因本卡有意改动而不一致，在汇报中逐项列出"字段：旧→新、原因"，由主会话审核后统一重生成。
- 本卡新增或修改的测试，以及本卡直接改到的模块的同名测试；
- 自查改动路径：不得触及禁区（docs/架构设计/、已审 W1 骨架 world/design/、dist/、docs/待办.md、docs/问题.md）。确有必要改的，停下写进汇报。
限时：90 分钟（到 80 分钟时停手写交接）。

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
