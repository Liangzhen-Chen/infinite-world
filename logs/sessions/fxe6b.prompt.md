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

# 卡 FXE6：W8-E6 引入的经济锚点回归（12 个测试）+ K12 发车时刻（1 个）

共同规则：F:/dnd/logs/sessions/s5law-common.md（先读）。工作树 F:/dnd-wt/FXE6，分支 t-fxe6，基于 s5a@2032b5e6。

## 背景（主会话沿 s5a 合并点二分）
A. 首个失败合并点 **a550398d**（merge t-w8e6-leftovers：baseline 估值角色、无从估价不当 0、驿传按真实班次、**市场供给不计估价对象本人行囊**——私人行囊计需求不计供给）的 12 个测试：
a1b-fixes、ledger-reconcile、monster-society、s2c-fire（2）、s3-e04、turn-gate、w2-s2（5）、w2-s3（5，其中 1 项更早已败，见下）、s5-04（2）、s5-f-tender（S5F-3 羊毛付款 10→5）、w8b-credit-tender（W8B-4/5/9，典当本金 50→300 等）、s5-w4-economy（F048 unitPrice:1 被单价边界拒；F007 典当 9≠5）。
前例：港口运货四处锚点已按同一规律逐项手算更新（见 tests/s5-08.test.mjs 与 s5-08-w3a-transport 注释），关税 6 倍来自目的地稀缺因子 .5→3。
B. 首个失败合并点 **2e7e46cb**（merge t-k12-law：carrierDeparture 改为发车不得落在截件时刻、早于起班等起班）：w8d-service:242（驿站/车行发车 660/420）。
w2-s3 另有 1 项在 f0de40b9 已败（早于 E6），一并查清引入点。

## 要做
对每个失败：手算新旧两个值各自怎么来（公式、输入、文件:行），判定：
- 是 E6/K12 已批准规律的正确结果 → 更新严格锚点并注明手算式与依据；
- 是错误（例如估值把同一份货重复计、典当本金 6 倍跳变来自单位或基准错误、私人行囊该不该进需求被误用、单价边界把合法成交价拒掉、发车时刻违背附录 A 班次）→ 修代码，不动断言；
- 测试前提若依赖旧口径造的数（例如 unitPrice:1 这种不可能成交的价），按真实游戏动作和现行规律重建前提，不得为通过而改世界数据。
特别核实：典当本金 50→300、羊毛付款 10→5、F007 9≠5——它们是否符合"私人行囊计需求不计供给"的推论；若某项推论导致明显不现实（如一件旧物当出 6 倍价），说明哪条规律缺失并修在规律层。

## 验收
上述 13 个文件逐文件全过；CORE 三件、同步四件套；s5-08、s5-08-w3a-transport、w8e6-leftovers、w8a-price-migration、finance-assets、s5-law-household-budget 不退化。汇报一张表：每处旧值算式、新值算式、结论与依据。
