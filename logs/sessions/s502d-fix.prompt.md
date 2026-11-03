【进程规则】只能结束你本会话亲自启动并记录了 PID 的进程；禁止用 Stop-Process/taskkill 按名称或批量结束 node（Codex 本身也是 node）。临时调试文件结束前删除。
【测试运行规则】验收命令里的测试文件逐个单独运行（每个文件一条 node --test --test-isolation=none tests/<文件>），不要把多个文件放进同一条命令同进程跑——会互相预加载模块、掩盖循环导入与顺序依赖（10-23 教训）。
【测试输出规则】测试命令输出必须过滤为摘要，PowerShell：`node --test --test-isolation=none <文件> 2>&1 | Select-String -Pattern "^ℹ (pass|fail)|^✖|^not ok" | Select-Object -First 40`（沙箱会拒绝 grep/head）；禁止读取完整测试输出；需要细节时只看单个失败用例最后 30 行。
【环境】沙箱不允许 git 写操作（merge/add/commit/checkout），只用 git status/diff/log/show/grep；改完不提交，由主会话代提交。浏览器与子进程类测试会 EPERM，列出即可，由主会话在沙箱外补跑。node 命令设 TEMP/TMP 为 F:/dnd-tmp；最多 3 个 node 进程。
【时限】本卡有总时限（见下方“限时”），接近时停手，把已完成、剩余、下一步写进交接报告。
【硬约束】不删/跳过测试、不放宽断言（改测试只允许对齐设计且保留断言意图，逐处写依据）；不读 secrets.json；不部署；不改 docs/架构设计/；世界内容只写 world/、不手改 dist/。用中文汇报。

限时：90 分钟（到 80 分钟时停手写交接）。

# 续卡 s502d-fix：修全量扫描新增的回归

主会话在沙箱外对你的工作区（未提交状态）跑了全量扫描：F:/dnd/logs/sessions/sweep-s502.tsv。与 S5-01 最终扫描（sweep-s501-final.tsv）相比，下列测试文件新增失败（清单：F:/dnd/logs/sessions/s502-regress-list.txt）：
- tests/a1-daily-probes.test.mjs
- tests/a3-builder-ui.test.mjs
- tests/a3-builder.test.mjs
- tests/a3-daily.test.mjs
- tests/a3-owner2-R.test.mjs
- tests/advance-registry.test.mjs
- tests/daily-b2-exact.test.mjs
- tests/daily-b2-world.test.mjs
- tests/festival-runtime.test.mjs
- tests/invariants/i31-total-order.test.mjs
- tests/law.test.mjs
- tests/m1-history-preconditions.test.mjs
- tests/m3-acceptance.test.mjs
- tests/m3-consistency-browser.test.mjs
- tests/m3-consistency-integration.test.mjs
- tests/m3-soak-adapter.test.mjs
- tests/monster-society-content.test.mjs
- tests/monster-society.test.mjs
- tests/runtime.test.mjs
- tests/s2c-fire.test.mjs
- tests/s3-offscreen-life.test.mjs
- tests/s3-run001.test.mjs
- tests/seasonal-hazards.test.mjs
- tests/turn-gate.test.mjs
- tests/w2-s2.test.mjs
- tests/w2-s3.test.mjs
- tests/w3-trades.test.mjs
- tests/world-clock.test.mjs

## 要求
- 逐个找根因。属于本卡规则的合法变化（例如价格派生化、可售量扣自用与承诺、资源账户化）导致旧测试前提或断言不成立：按设计对齐，前提用真实动作或 applyIntentSetup，断言改为**手算数字锚点**（不得用被测函数算期望值），逐处注明设计依据；属于实现缺陷的修实现。不放宽、不删断言、不加版本标记。
- 浏览器类（*-ui、*-browser）在沙箱 EPERM 时写明，主会话外跑。
- 每修完一个文件就单独进程复跑它，报 pass/fail。
## 汇报（≤350 字，UTF-8，F:/dnd/logs/sessions/s502d-fix.final.md）
每文件根因一句（标"合法变化"或"实现缺陷"）、改动文件、命令与 pass/fail、未解决项。
