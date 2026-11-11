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
限时：120 分钟（到 110 分钟时停手写交接）。

# 卡 FXM：K08 合并后的 4 个交互回归 + 劳力市场缺工预测接点

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/FXM，分支 t-fxm，基于 s5a@9b105b45（已含 K01–K06、K08–K12、FXE3/FXE6/FXE8）。

## A. 4 个交互回归
K08（远期按可靠度与时间折扣计入报价有效存量、可成交深度只读实物、店铺正午结算、赶集占真实路程工时、顾客按 K02 家户预算花钱）合入后，以下测试在 s5a 失败；它们的锚点刚由 FXE6/FXE8 在 K08 之前定下：
- s5-w4-economy（1）、s5-04（2）——FXE6 锚点；
- quest-sources（4）、entity-world（1）——FXE8 锚点（铁镰进货款入公库 20/40 等）。
逐项手算新旧值（公式、输入、文件:行），判定是合并后规律的正确结果（更新严格锚点并注明）还是错误（修代码，不动断言）。不得放宽断言、不得塞库存或改世界数据凑数。

## B. 劳力市场缺工预测接点（K06 报告）
server-plugin/labor-market.mjs:129–133 的农忙缺工预测仍按旧人口比例与整数工位计算，没有扣掉照料、通勤、赶集、已受雇出勤。改为复用 K04 的 npc-state.mjs:householdWorkTime 与 K06 agriculture 的同一派生口径（实际可投入田间的分钟），让预测与实际日结一致。手算锚点：给一个村，算出旧预测与新预测各多少工日、与 K06 实际日结的田间分钟对得上。

## 验收
A 的 4 个文件逐文件全过；labor-market、s5-law-household-labor、s5-law-production-inputs、agriculture 以外的农业相关短测、CORE、同步四件套；s5-law-periodic-market、s5-08、finance-assets、w8b-credit-tender 不退化。agriculture 长测列主会话。金快照若变，出字段表。
