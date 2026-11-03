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
限时：150 分钟（到 140 分钟时停手写交接）。

K02 返修（主会话审 diff 后，打回两处测试改动，并补一条规律）：

1. **撤回** tests/action-registry.test.mjs 与 tests/plugin.test.mjs 的改动。把林穗的面包加到 20 份，是为了让测试照旧通过而改世界前提，属于"为测试造设施"，不收。

2. 这两个测试失败，暴露的是一条缺失的规律：现在的缓冲只看实物，没看"手里有钱、附近买得到"也能保障口粮。现实里，口粮缓冲是为了撑过"下一次能可靠取得食物"之前的那段时间。有现钱、本地有已知可买的来源（含自家日常营业能补货）时，需要实物囤着的部分就小。这样，一个天天营业的店主不会因为节俭就把待售面包全部留着自己吃，一季后也不会"店里有货却不卖"。
   - 在 householdBufferTarget / householdResources 中加"市场替代"：缓冲目标中，可由本人现钱按已知本地报价、在本周期内买到的部分，从实物保留里扣除。没有已知可买来源、市场中断或共同歉收（commonRisk）时，替代减弱或失效。
   - 下一次可靠取得食物的时点要从真实事实派生（已知卖家与营业时间、本人日常收入），不按身份或名字特判。
   - 个体差异（挥霍/普通/节俭）保留；节俭者可以多留，但要受上面的替代约束。离群比例的数据项保留。

3. 改完后，原样的 action-registry、plugin 应自然通过。若仍失败，不改测试，汇报是哪条规律造成的（附数字）。

4. 金快照差异表 K02-golden-table.md 重做；239 项里如果有"店主不卖货"一类的变化，要单独列出并说明是否合理。

按原卡验收逐文件重跑受影响测试（s5-05 若超过 40 分钟，列给主会话外跑），汇报同原卡。
