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

# 卡 S508A：港口运货测试四处价格断言分诊

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/S508A，分支 t-s508-anchors，基于 s5a@3790d3f8。

## 背景（主会话二分结果）
s5a 上这几处断言失败，首个失败合并点是 a550398d（merge t-w8e6-leftovers：baseline 估值角色、无从估价不当 0、驿传按真实班次、**市场供给不计估价对象本人行囊**）。它之前的 f0de40b9 全过。

| 用例位置 | 期望 → 实际 |
|---|---|
| tests/s5-08-w3a-transport.test.mjs:60 destroyed carrier | 货值 479 → 498 |
| tests/s5-08.test.mjs:77 real market quote | 报价 138 → 143 |
| tests/s5-08.test.mjs:214 two published road legs | 关税 [150,150] → [900,900] |
| tests/s5-08.test.mjs:254 fare and goods | 报价总额 385 → 521 |

## 要做
对每一处，用 `git diff f0de40b9 a550398d -- server-plugin/` 中的实际改动，手算新旧两个数各自怎么来的（公式、输入、出处 文件:行）。然后判断：
- 新值是 E6 那几条规律的正确结果 → 把断言锚点改成新值，注释写手算式和依据（这是更新已变规律下的锚点，不是放宽：保持严格等值断言）。
- 新值不对（例如关税 6 倍来自把税基算错、重复计价、单位混淆）→ 修代码，不动断言，写明根因。
关税 150→900 要特别核实：税基、税率、货量各是多少，哪一个变了 6 倍、凭什么。

## 验收
逐文件：s5-08、s5-08-w3a-transport、w8e6-leftovers、w8a-price-migration、transport、settlement-trade、finance-assets；CORE 三件与同步四件套。若改代码导致金快照变化，按共同规则出字段表。
汇报加一张表：每处的旧值算式、新值算式、结论（改锚点/修代码）与依据。
