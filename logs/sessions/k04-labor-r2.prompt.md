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

K04 续做（主会话已处理两件事，请先 git log -3 / git status 看清）：
1. 你的改动已作为 WIP 提交（929caafe），并合入了最新 s5a（5d8b47be）。s5a 上主会话已修好 K02 的一处规律错误（店主自家补货不受本人营业时段限制；无作息表的店主保持旧的随时营业），所以 **tests/npc-schedule.test.mjs 已撤回你加 100 个面包的改动**，它在原样下应自然通过。请确认。
2. **所有权扩展**：`server-plugin/extraction.mjs` 的 `mineEmployment`（约 155–170 行）及 `mineActor` 读取当前地点的接点，划给本卡改。

要做：把采矿雇佣的结算从"结算时刻矿工是否仍在矿上"改为"按真实在场、真实作业的出勤事实结算"——矿工按时下工返家后，当日已实际完成的采矿工时、产出与工资照常结算；仍保留许可、工具、储量、账本与真实同意的保护；不得给没去、没干的人发钱。这条应对所有按班次结算的雇佣通用，若 labor-market 已有出勤事实，复用它，不另建第二份出勤账。

验收：s5-law-household-labor 全过（含你写的采矿返程回归：往返各2分钟、日薪960、7次×60分钟 → 实作420分钟、付840、产1份矿石，用你已记录的手算）；另逐文件 extraction 相关测试（grep tests 中引用 extraction / mine 的文件）、labor-market、npc-schedule、npc-obligations、s3-labor-justice、npc-life-health、CORE 三件、同步四件套。金快照字段表按最新基线重做（weather_exposure 那项差异应已消失）。汇报同原卡。
